/*
# Enable Supabase Realtime on orders, rider_order_assignments, and custom_orders

## Why
The customer Delivery History screen needs to update in real time when a rider
marks an order as Delivered. Currently these tables are NOT in the
`supabase_realtime` publication, so `supabase.channel('postgres_changes')`
subscriptions receive no events. This migration adds them to the publication
and sets REPLICA IDENTITY to FULL so that UPDATE/DELETE payloads include the
full row (needed for the client to identify which delivery changed).

## Changes
1. `ALTER TABLE orders REPLICA IDENTITY FULL`
2. `ALTER TABLE rider_order_assignments REPLICA IDENTITY FULL`
3. `ALTER TABLE custom_orders REPLICA IDENTITY FULL`
4. `ALTER PUBLICATION supabase_realtime ADD TABLE orders`
5. `ALTER PUBLICATION supabase_realtime ADD TABLE rider_order_assignments`
6. `ALTER PUBLICATION supabase_realtime ADD TABLE custom_orders`

## Safety
- No data changes, no RLS changes.
- REPLICA IDENTITY FULL only affects what data is sent in logical replication
  payloads; it does not change table behavior.
- Adding tables to the publication is idempotent — re-running will error
  harmlessly if already present, so we guard with IF NOT EXISTS checks.
*/

DO $$
BEGIN
  -- Set replica identity to FULL so UPDATE events carry full row data
  IF (SELECT relreplident FROM pg_class WHERE relname = 'orders') <> 'f' THEN
    ALTER TABLE public.orders REPLICA IDENTITY FULL;
  END IF;

  IF (SELECT relreplident FROM pg_class WHERE relname = 'rider_order_assignments') <> 'f' THEN
    ALTER TABLE public.rider_order_assignments REPLICA IDENTITY FULL;
  END IF;

  IF (SELECT relreplident FROM pg_class WHERE relname = 'custom_orders') <> 'f' THEN
    ALTER TABLE public.custom_orders REPLICA IDENTITY FULL;
  END IF;
END $$;

-- Add tables to the realtime publication (guard with IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'rider_order_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rider_order_assignments;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'custom_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.custom_orders;
  END IF;
END $$;
