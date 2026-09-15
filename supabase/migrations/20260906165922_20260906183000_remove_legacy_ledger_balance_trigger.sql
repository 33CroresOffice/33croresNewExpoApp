/*
# Remove Legacy Ledger Balance Trigger
*/

DROP TRIGGER IF EXISTS on_ledger_insert_set_balance ON finance_ledger;
