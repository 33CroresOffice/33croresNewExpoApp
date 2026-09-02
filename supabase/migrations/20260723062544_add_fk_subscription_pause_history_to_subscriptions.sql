/*
# Add missing FK from subscription_pause_history to subscriptions

## Why
The `subscription_pause_history` table has a `subscription_id` column
but no foreign key constraint to `subscriptions`. PostgREST (the Supabase
REST API) uses FK relationships to resolve nested/embedded queries.
Without this FK, the customer home screen query that embeds
`pause_history:subscription_pause_history(...)` inside `subscriptions`
fails with PGRST200: "Could not find a relationship between
'subscriptions' and 'subscription_pause_history'".

## Changes
1. Adds FK constraint `subscription_pause_history_subscription_id_fkey`
   from `subscription_pause_history.subscription_id` → `subscriptions.id`
   with `ON DELETE CASCADE`.
2. Uses `IF NOT EXISTS` via DO block to be idempotent.

## Security
No RLS changes — existing policies remain intact.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscription_pause_history_subscription_id_fkey'
      AND conrelid = 'subscription_pause_history'::regclass
  ) THEN
    ALTER TABLE subscription_pause_history
      ADD CONSTRAINT subscription_pause_history_subscription_id_fkey
      FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE;
  END IF;
END $$;
