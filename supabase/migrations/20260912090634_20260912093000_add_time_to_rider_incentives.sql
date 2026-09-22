/*
# Add incentive time

## Overview
Adds an optional time value to each rider incentive so administrators can record when a time-based incentive applies.

## Modified Tables
- `rider_incentives`
- Adds `time` as nullable text, stored in the form's time value.

## Security
- No access policy changes. Existing RLS policies continue to protect the table.

## Important Notes
1. Existing incentives remain valid with no time value.
2. New and edited incentives can save a time value from the Admin Panel.
*/

ALTER TABLE rider_incentives
  ADD COLUMN IF NOT EXISTS time text;
