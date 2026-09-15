/*
# Finance Module Enhancements

## Purpose
1. Adds RLS policies for rider_payouts (admin-only CRUD)
2. Adds running_balance column to finance_ledger + trigger to compute it
3. Adds rider_payout_category to finance_ledger check constraint
4. Adds delete policy for expenses
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. RLS for rider_payouts (admin-only)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE rider_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select_rider_payouts" ON rider_payouts;
CREATE POLICY "admins_select_rider_payouts" ON rider_payouts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "admins_insert_rider_payouts" ON rider_payouts;
CREATE POLICY "admins_insert_rider_payouts" ON rider_payouts
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "admins_update_rider_payouts" ON rider_payouts;
CREATE POLICY "admins_update_rider_payouts" ON rider_payouts
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "admins_delete_rider_payouts" ON rider_payouts;
CREATE POLICY "admins_delete_rider_payouts" ON rider_payouts
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Add running_balance to finance_ledger + trigger
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE finance_ledger ADD COLUMN IF NOT EXISTS running_balance numeric DEFAULT 0;

-- Add rider_payout to the category check constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'finance_ledger_category_check'
  ) THEN
    ALTER TABLE finance_ledger DROP CONSTRAINT finance_ledger_category_check;
  END IF;
END $$;

ALTER TABLE finance_ledger ADD CONSTRAINT finance_ledger_category_check
  CHECK (category IN ('subscription_payment', 'vendor_payment', 'rider_payout', 'expense', 'refund', 'adjustment', 'other'));

-- Function to recompute running balance for all entries
CREATE OR REPLACE FUNCTION recompute_ledger_running_balance()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  WITH ordered AS (
    SELECT id,
      SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE -amount END) OVER (ORDER BY entry_date ASC, created_at ASC) AS rb
    FROM finance_ledger
  )
  UPDATE finance_ledger fl SET running_balance = o.rb
  FROM ordered o WHERE fl.id = o.id;
END;
$$;

-- Trigger to set running_balance on insert
CREATE OR REPLACE FUNCTION set_ledger_running_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev numeric;
BEGIN
  SELECT COALESCE(running_balance, 0) INTO v_prev
  FROM finance_ledger
  ORDER BY entry_date DESC, created_at DESC
  LIMIT 1;

  NEW.running_balance := v_prev + CASE WHEN NEW.entry_type = 'credit' THEN NEW.amount ELSE -NEW.amount END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_ledger_insert_set_balance ON finance_ledger;
CREATE TRIGGER on_ledger_insert_set_balance
  BEFORE INSERT ON finance_ledger
  FOR EACH ROW EXECUTE FUNCTION set_ledger_running_balance();

-- Backfill existing running balances
SELECT recompute_ledger_running_balance();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Delete policy for expenses
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "admins_delete_expenses" ON expenses;
CREATE POLICY "admins_delete_expenses" ON expenses
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Helper: approve rider payout + mark as paid (admin-only)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION approve_rider_payout(p_payout_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rider_id uuid; v_amount integer; v_period_start date; v_period_end date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT rider_id, final_amount, period_start, period_end INTO v_rider_id, v_amount, v_period_start, v_period_end
  FROM rider_payouts WHERE id = p_payout_id;

  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Payout not found'); END IF;

  UPDATE rider_payouts SET status = 'approved', approved_by = auth.uid(), updated_at = now() WHERE id = p_payout_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION approve_rider_payout(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION approve_rider_payout(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION mark_rider_payout_paid(p_payout_id uuid, p_method text, p_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rider_id uuid; v_amount integer; v_period_start date; v_period_end date; v_rider_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT rp.rider_id, rp.final_amount, rp.period_start, rp.period_end, p.full_name
  INTO v_rider_id, v_amount, v_period_start, v_period_end, v_rider_name
  FROM rider_payouts rp JOIN profiles p ON p.id = rp.rider_id WHERE rp.id = p_payout_id;

  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Payout not found'); END IF;

  UPDATE rider_payouts SET status = 'paid', payment_method = p_method, payment_reference = p_reference, paid_at = now(), updated_at = now() WHERE id = p_payout_id;

  INSERT INTO finance_ledger (entry_date, entry_type, category, amount, description, party_name, payment_method, reference_id, reference_table, recorded_by)
  VALUES (CURRENT_DATE, 'debit', 'rider_payout', v_amount, 'Rider payout: ' || COALESCE(v_rider_name, 'Unknown') || ' (' || v_period_start || ' to ' || v_period_end || ')', COALESCE(v_rider_name, 'Unknown'), p_method, p_payout_id, 'rider_payouts', auth.uid());

  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION mark_rider_payout_paid(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mark_rider_payout_paid(uuid, text, text) TO authenticated;
