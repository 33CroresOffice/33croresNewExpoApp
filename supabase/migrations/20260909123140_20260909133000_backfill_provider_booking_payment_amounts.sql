/*
# Backfill provider booking payment amounts

1. Existing data
- Populate missing `total_amount` values on provider bookings from the linked pooja setup fee or provider service price.
- Populate the required 30% `advance_amount`.
- Populate the remaining 70% `remaining_amount`.

2. Data safety
- Only bookings with a zero total are updated.
- Existing booking statuses, customer details, dates, notes, and payment identifiers are preserved.
- No rows are deleted and no existing non-zero payment amounts are changed.

3. Security
- This is a server-side data correction and does not change client access policies.

4. Important notes
- The corrected amounts are used by the existing secure payment functions.
- Future bookings already calculate these amounts during booking creation.
*/

UPDATE provider_bookings pb
SET total_amount = pps.service_fee,
    advance_amount = round(pps.service_fee * 0.30, 2),
    remaining_amount = pps.service_fee - round(pps.service_fee * 0.30, 2),
    updated_at = now()
FROM provider_pooja_setups pps
WHERE pb.pooja_setup_id = pps.id
  AND pb.total_amount = 0
  AND pps.service_fee > 0;

UPDATE provider_bookings pb
SET total_amount = COALESCE(ps.admin_override_price, ps.price),
    advance_amount = round(COALESCE(ps.admin_override_price, ps.price) * 0.30, 2),
    remaining_amount = COALESCE(ps.admin_override_price, ps.price) - round(COALESCE(ps.admin_override_price, ps.price) * 0.30, 2),
    updated_at = now()
FROM provider_services ps
WHERE pb.service_id = ps.id
  AND pb.total_amount = 0
  AND COALESCE(ps.admin_override_price, ps.price) > 0;
