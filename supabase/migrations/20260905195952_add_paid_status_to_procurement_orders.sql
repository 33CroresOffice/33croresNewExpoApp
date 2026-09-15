/*
# Add 'paid' status to procurement_orders

1. Schema Changes
- procurement_orders: extend the status CHECK constraint to include 'paid'.
  This lets the admin mark an order as paid (automatically when the full
  amount is recorded via vendor_payments, or manually).

2. Security
- No RLS policy changes. Existing policies already cover the new status value.

3. Important Notes
- The old constraint is dropped and recreated with the additional 'paid' value.
- Existing rows are unaffected; 'paid' is only set going forward when a
  payment is recorded.
*/

ALTER TABLE public.procurement_orders
  DROP CONSTRAINT IF EXISTS procurement_orders_status_check;

ALTER TABLE public.procurement_orders
  ADD CONSTRAINT procurement_orders_status_check
  CHECK (status = ANY (ARRAY['draft', 'sent', 'accepted', 'fulfilled', 'paid', 'cancelled']));
