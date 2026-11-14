/*
# Enable realtime broadcast for rider_pickup_prices

1. Why

The admin Rider Details → Pickup tab and the Rider App pickups screen subscribe to
postgres_changes on `rider_pickup_prices` so a saved per-day price refreshes live.
Realtime only delivers events for tables added to the `supabase_realtime` publication.

2. Changes

- Add `rider_pickup_prices` to the `supabase_realtime` publication (idempotent via DO block).

3. Security

- No RLS or grant changes; publication membership only affects event broadcast.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'rider_pickup_prices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE rider_pickup_prices;
  END IF;
END $$;
