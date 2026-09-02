/*
# Add SECURITY DEFINER function to fetch assigned rider details

## Why
The customer Delivery History screen joins `rider_order_assignments` to `riders`
to show the assigned rider's name and phone. The nested join goes through
RLS on both tables. The "Customers can view assigned riders" policy on `riders`
subqueries `rider_order_assignments`, which in turn calls `order_owner_uid()`
to check ownership. When PostgREST evaluates the nested join, it must pass RLS
on `riders` for each joined row — but the RLS predicate re-enters the
`rider_order_assignments` RLS check, which re-enters `orders` RLS. This
multi-level RLS chain causes the rider data to come back as `null` for
customers, even though the assignment exists.

## What this does
Creates a SECURITY DEFINER function `get_assignment_rider_info(assign_id uuid)`
that returns `{ full_name text, mobile text }` for the rider assigned to a
given `rider_order_assignments.id`. Because it runs as the owner, it bypasses
RLS entirely — no recursion risk.

## Security
- SECURITY DEFINER: runs with owner privileges, bypassing RLS.
- Only exposes `full_name` and `mobile` — no sensitive fields (no aadhaar,
  no salary, no address).
- Granted EXECUTE to `authenticated` role only.
- No new tables, no data changes, no RLS policy changes.
*/

CREATE OR REPLACE FUNCTION public.get_assignment_rider_info(assign_id uuid)
RETURNS TABLE (full_name text, mobile text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.full_name, r.mobile
  FROM rider_order_assignments roa
  JOIN riders r ON r.id = roa.rider_id
  WHERE roa.id = $1;
$$;

GRANT EXECUTE ON FUNCTION public.get_assignment_rider_info(uuid) TO authenticated;
