/*
# Fix Ledger Balance Trigger Recursion
*/

CREATE OR REPLACE FUNCTION recompute_ledger_running_balance_after_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  WITH ordered AS (
    SELECT id,
      SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE -amount END) OVER (ORDER BY entry_date ASC, created_at ASC, id ASC) AS rb
    FROM finance_ledger
  )
  UPDATE finance_ledger fl SET running_balance = o.rb
  FROM ordered o WHERE fl.id = o.id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_ledger_change_recompute_balance ON finance_ledger;
UPDATE finance_ledger SET running_balance = 0;
WITH ordered AS (
  SELECT id,
    SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE -amount END) OVER (ORDER BY entry_date ASC, created_at ASC, id ASC) AS rb
  FROM finance_ledger
)
UPDATE finance_ledger fl SET running_balance = o.rb
FROM ordered o WHERE fl.id = o.id;

CREATE TRIGGER on_ledger_change_recompute_balance
  AFTER INSERT OR UPDATE OR DELETE ON finance_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION recompute_ledger_running_balance_after_change();
