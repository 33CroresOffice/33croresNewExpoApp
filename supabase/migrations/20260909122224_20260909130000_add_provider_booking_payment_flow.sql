/*
# Add provider booking payment flow

1. Changes to `provider_bookings`
- Add `total_amount` for the provider's final service price in rupees.
- Add `advance_amount` for the required 30% confirmation payment.
- Add `remaining_amount` for the final 70% payment.
- Add `advance_payment_status` and `remaining_payment_status` to track each payment independently.
- Add Razorpay order and payment identifiers for both payment stages.
- Allow the lifecycle status `confirmed`, which means the provider accepted the request and the customer paid the advance.

2. Booking creation changes
- New pooja bookings capture the pooja setup fee at creation time.
- New regular service bookings capture the effective provider service price at creation time.
- Amounts are calculated on the server so the customer cannot change the 30/70 split from the app.

3. Security
- Existing provider and customer row policies remain in place.
- Payment Edge Functions will verify the signed-in customer owns the booking before creating or confirming payment.
- No payment columns are writable by the browser payment flow; values are set by trusted booking RPCs and payment verification functions.

4. Important notes
- Existing bookings are preserved and receive zero amounts until they are migrated by an administrator or replaced with a new booking.
- Advance payment changes an accepted booking to `confirmed` only after Razorpay verification succeeds.
- Remaining payment is available only after the advance is paid and may be completed immediately or after the provider marks the booking completed.
*/

ALTER TABLE provider_bookings ADD COLUMN IF NOT EXISTS total_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0);
ALTER TABLE provider_bookings ADD COLUMN IF NOT EXISTS advance_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (advance_amount >= 0);
ALTER TABLE provider_bookings ADD COLUMN IF NOT EXISTS remaining_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (remaining_amount >= 0);
ALTER TABLE provider_bookings ADD COLUMN IF NOT EXISTS advance_payment_status text NOT NULL DEFAULT 'unpaid' CHECK (advance_payment_status IN ('unpaid','pending','paid'));
ALTER TABLE provider_bookings ADD COLUMN IF NOT EXISTS remaining_payment_status text NOT NULL DEFAULT 'unpaid' CHECK (remaining_payment_status IN ('unpaid','pending','paid'));
ALTER TABLE provider_bookings ADD COLUMN IF NOT EXISTS advance_razorpay_order_id text;
ALTER TABLE provider_bookings ADD COLUMN IF NOT EXISTS advance_razorpay_payment_id text;
ALTER TABLE provider_bookings ADD COLUMN IF NOT EXISTS remaining_razorpay_order_id text;
ALTER TABLE provider_bookings ADD COLUMN IF NOT EXISTS remaining_razorpay_payment_id text;

ALTER TABLE provider_bookings DROP CONSTRAINT IF EXISTS provider_bookings_status_check;
ALTER TABLE provider_bookings ADD CONSTRAINT provider_bookings_status_check CHECK (status IN ('pending','accepted','confirmed','declined','cancelled','completed','no_show'));

CREATE INDEX IF NOT EXISTS idx_provider_bookings_payment_status ON provider_bookings(advance_payment_status, remaining_payment_status);

CREATE OR REPLACE FUNCTION create_provider_booking(p_provider_id uuid,p_service_id uuid,p_customer_name text,p_customer_mobile text,p_preferred_date date,p_preferred_time text,p_consultation_mode text,p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_total numeric(10,2);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_preferred_date < current_date THEN RAISE EXCEPTION 'Date must be in the future'; END IF;
  SELECT COALESCE(admin_override_price, price) INTO v_total FROM provider_services ps JOIN service_providers sp ON sp.id=ps.provider_id WHERE sp.id=p_provider_id AND ps.id=p_service_id AND sp.approval_status='approved' AND sp.is_active AND sp.bookings_enabled AND ps.is_active;
  IF v_total IS NULL THEN RAISE EXCEPTION 'Service is not available'; END IF;
  INSERT INTO provider_bookings(provider_id,service_id,customer_id,customer_name,customer_mobile,preferred_date,preferred_time,consultation_mode,notes,total_amount,advance_amount,remaining_amount)
  VALUES(p_provider_id,p_service_id,auth.uid(),trim(p_customer_name),trim(p_customer_mobile),p_preferred_date,trim(p_preferred_time),p_consultation_mode,trim(coalesce(p_notes,'')),v_total,round(v_total * 0.30, 2),v_total-round(v_total * 0.30, 2)) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION create_provider_booking(uuid,uuid,text,text,date,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_provider_booking(uuid,uuid,text,text,date,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION create_pooja_booking(p_provider_id uuid,p_pooja_setup_id uuid,p_customer_name text,p_customer_mobile text,p_preferred_date date,p_preferred_time text,p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_total numeric(10,2);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_preferred_date < current_date THEN RAISE EXCEPTION 'Date must be in the future'; END IF;
  SELECT pps.service_fee INTO v_total FROM service_providers sp JOIN provider_pooja_setups pps ON pps.provider_id=sp.id WHERE sp.id=p_provider_id AND pps.id=p_pooja_setup_id AND sp.approval_status='approved' AND sp.is_active AND sp.bookings_enabled AND pps.is_active;
  IF v_total IS NULL OR v_total <= 0 THEN RAISE EXCEPTION 'Pooja service is not available'; END IF;
  INSERT INTO provider_bookings(provider_id,pooja_setup_id,customer_id,customer_name,customer_mobile,preferred_date,preferred_time,consultation_mode,notes,total_amount,advance_amount,remaining_amount)
  VALUES(p_provider_id,p_pooja_setup_id,auth.uid(),trim(p_customer_name),trim(p_customer_mobile),p_preferred_date,trim(p_preferred_time),'in_person',p_notes,v_total,round(v_total * 0.30, 2),v_total-round(v_total * 0.30, 2)) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION create_pooja_booking(uuid,uuid,text,text,date,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_pooja_booking(uuid,uuid,text,text,date,text,text) TO authenticated;
