/*
# Add Referral Delivery-Day Tracking and Admin Approval

## Overview
Extends the existing rider_referrals table to track the referred rider's
completed delivery days and admin approval status, so the Rider App can show
a live "Refer Rider Bonus" line in the monthly bonus breakdown and the Admin
can see referral progress and approve each referral independently.

## Modified Tables

### rider_referrals (ALTER)
- `referred_rider_id` (uuid, nullable) — FK to riders(id); set when the
  referred mobile actually registers as a rider. Null until then.
- `completed_delivery_days` (integer, default 0) — count of distinct dates
  the referred rider has a delivered assignment on/after their joining date.
- `required_delivery_days` (integer, nullable) — snapshot of the
  referral_config.required_completion_days at creation time so historical
  referrals keep their original target even if admin changes the config.
- `approval_status` (text, default 'pending') — pending | eligible | approved | rejected.
  "eligible" means the required days are met and it's awaiting admin approval.
- `approved_at` (timestamptz, nullable) — when admin approved the referral.
- `approved_by` (uuid, nullable) — admin profile id who approved.
- `reward_amount` (numeric, default 0) — snapshot of the configured reward
  amount at approval time; this is the amount credited to the referrer.

## New Function

### update_referral_delivery_progress()
- SECURITY DEFINER trigger function that recomputes completed_delivery_days
  for every rider_referrals row whose referred_rider_id matches the rider
  that just had a delivery inserted/updated/deleted, and flips
  approval_status to 'eligible' when the count reaches the required days.
- Called by a trigger on rider_order_assignments AFTER INSERT/UPDATE/DELETE.

### approve_rider_referral(p_referral_id uuid)
- SECURITY DEFINER function callable by admins only.
- Sets approval_status='approved', approved_at=now(), approved_by=caller,
  reward_amount = current referral_config.reward_amount.
- Returns the updated row.

## Security
- referral_config: existing policies unchanged.
- rider_referrals: existing rider/admin policies unchanged. New columns
  are readable by the same policies. Only admins can approve (via the
  SECURITY DEFINER function which checks the JWT role).
- approve_rider_referral is executable by authenticated but internally
  enforces admin role.
*/

-- ═══ 1. Add tracking columns to rider_referrals ═════════════════════════════

ALTER TABLE rider_referrals
  ADD COLUMN IF NOT EXISTS referred_rider_id uuid REFERENCES riders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_delivery_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS required_delivery_days integer,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending','eligible','approved','rejected')),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reward_amount numeric(10,2) NOT NULL DEFAULT 0;

-- Index for the trigger to find affected referrals quickly
CREATE INDEX IF NOT EXISTS idx_rider_referrals_referred_rider_id
  ON rider_referrals(referred_rider_id);

-- ═══ 2. Function to recompute progress for a referred rider ═════════════════

CREATE OR REPLACE FUNCTION recompute_referral_progress(p_referred_rider_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref RECORD;
  v_count int;
  v_config_required int;
BEGIN
  SELECT required_completion_days INTO v_config_required
  FROM referral_config WHERE is_active = true ORDER BY created_at LIMIT 1;

  FOR v_ref IN
    SELECT id, required_delivery_days, approval_status
    FROM rider_referrals
    WHERE referred_rider_id = p_referred_rider_id
  LOOP
    SELECT COUNT(DISTINCT DATE(delivered_at AT TIME ZONE 'Asia/Kolkata'))
    INTO v_count
    FROM rider_order_assignments
    WHERE rider_id = p_referred_rider_id
      AND status = 'delivered'
      AND delivered_at IS NOT NULL;

    UPDATE rider_referrals
    SET completed_delivery_days = v_count
    WHERE id = v_ref.id;

    -- Mark eligible when threshold met and not yet approved/rejected
    IF v_ref.approval_status = 'pending' THEN
      DECLARE
        v_required int;
      BEGIN
        v_required := COALESCE(v_ref.required_delivery_days, v_config_required, 0);
        IF v_required > 0 AND v_count >= v_required THEN
          UPDATE rider_referrals
          SET approval_status = 'eligible'
          WHERE id = v_ref.id;
        END IF;
      END;
    END IF;
  END LOOP;
END;
$$;

-- ═══ 3. Trigger on rider_order_assignments ══════════════════════════════════

CREATE OR REPLACE FUNCTION trigger_recompute_referral_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rider_id uuid;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_rider_id := OLD.rider_id;
  ELSE
    v_rider_id := NEW.rider_id;
  END IF;
  IF v_rider_id IS NOT NULL THEN
    PERFORM recompute_referral_progress(v_rider_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_referral_progress_ins ON rider_order_assignments;
CREATE TRIGGER trg_recompute_referral_progress_ins
  AFTER INSERT OR UPDATE OF status, delivered_at, rider_id ON rider_order_assignments
  FOR EACH ROW EXECUTE FUNCTION trigger_recompute_referral_progress();

DROP TRIGGER IF EXISTS trg_recompute_referral_progress_del ON rider_order_assignments;
CREATE TRIGGER trg_recompute_referral_progress_del
  AFTER DELETE ON rider_order_assignments
  FOR EACH ROW EXECUTE FUNCTION trigger_recompute_referral_progress();

-- ═══ 4. Backfill referred_rider_id for existing referrals ════════════════════

UPDATE rider_referrals r
SET referred_rider_id = sub.id
FROM (
  SELECT id, mobile FROM riders WHERE mobile IS NOT NULL
) sub
WHERE r.referred_rider_id IS NULL
  AND r.referred_mobile = sub.mobile;

-- Backfill required_delivery_days from current config for existing rows
UPDATE rider_referrals
SET required_delivery_days = (
  SELECT required_completion_days FROM referral_config WHERE is_active = true ORDER BY created_at LIMIT 1
)
WHERE required_delivery_days IS NULL;

-- Backfill progress for all existing referrals with a linked rider
DO $$
DECLARE
  v_rider RECORD;
BEGIN
  FOR v_rider IN
    SELECT DISTINCT referred_rider_id FROM rider_referrals
    WHERE referred_rider_id IS NOT NULL
  LOOP
    PERFORM recompute_referral_progress(v_rider.referred_rider_id);
  END LOOP;
END $$;

-- ═══ 5. Admin approval function ══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION approve_rider_referral(p_referral_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref rider_referrals%ROWTYPE;
  v_reward numeric(10,2);
  v_is_admin bool;
BEGIN
  SELECT (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin','super_admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can approve referrals';
  END IF;

  SELECT * INTO v_ref FROM rider_referrals WHERE id = p_referral_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referral not found';
  END IF;

  SELECT reward_amount INTO v_reward
  FROM referral_config WHERE is_active = true ORDER BY created_at LIMIT 1;
  IF v_reward IS NULL THEN v_reward := 0; END IF;

  UPDATE rider_referrals
  SET approval_status = 'approved',
      approved_at = now(),
      approved_by = auth.uid(),
      reward_amount = v_reward
  WHERE id = p_referral_id;

  SELECT row_to_json(t) INTO v_reward
  FROM (
    SELECT * FROM rider_referrals WHERE id = p_referral_id
  ) t;

  RETURN v_reward;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_rider_referral(uuid) TO authenticated;

-- ═══ 6. Reject referral function ═════════════════════════════════════════════

CREATE OR REPLACE FUNCTION reject_rider_referral(p_referral_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin bool;
BEGIN
  SELECT (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin','super_admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can reject referrals';
  END IF;

  UPDATE rider_referrals
  SET approval_status = 'rejected'
  WHERE id = p_referral_id;

  RETURN json_build_object('id', p_referral_id, 'status', 'rejected');
END;
$$;

GRANT EXECUTE ON FUNCTION reject_rider_referral(uuid) TO authenticated;
