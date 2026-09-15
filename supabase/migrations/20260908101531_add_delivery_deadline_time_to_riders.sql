/*
# Add delivery deadline time to riders

## Summary
Adds a per-rider delivery deadline time (HH:MM in IST) so admins can set
the latest time a rider is allowed to mark an order as delivered.

## New Columns
1. `riders.delivery_deadline_time` — text, nullable. Stores a time string
   in 24-hour HH:MM format (e.g. '12:00'). When NULL, no deadline is enforced.

## Security
- No RLS policy changes. Only admins can update riders (existing policies).
- No data loss: existing rows keep NULL.
*/

ALTER TABLE riders
  ADD COLUMN IF NOT EXISTS delivery_deadline_time text;
