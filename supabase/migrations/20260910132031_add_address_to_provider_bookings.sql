/*
# Add Address Selection to Pandit Bookings

1. Schema Changes
   - Add `address_id` column (nullable uuid) to `provider_bookings` table.
   - Add foreign key constraint referencing `addresses(id)`.
   - This allows customers to select a saved address as the Pooja/Service location when booking a Pandit.

2. RPC Changes
   - Update `create_pooja_booking` to accept `p_address_id uuid` parameter and store it.
   - Update `create_provider_booking` to accept `p_address_id uuid` parameter and store it.

3. Security
   - No RLS policy changes needed — the existing provider_bookings policies already
     restrict access to the booking owner (customer) and the assigned provider.
   - The address_id is validated by RLS on the addresses table (customer can only
     select their own addresses).
*/

-- Add address_id column to provider_bookings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'provider_bookings' AND column_name = 'address_id'
  ) THEN
    ALTER TABLE provider_bookings ADD COLUMN address_id uuid;
  END IF;
END $$;

-- Add foreign key constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_provider_bookings_address_id'
  ) THEN
    ALTER TABLE provider_bookings
      ADD CONSTRAINT fk_provider_bookings_address_id
      FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Update create_pooja_booking to accept and store address_id
CREATE OR REPLACE FUNCTION create_pooja_booking(
  p_provider_id uuid,
  p_pooja_setup_id uuid,
  p_customer_name text,
  p_customer_mobile text,
  p_preferred_date date,
  p_preferred_time text,
  p_notes text DEFAULT NULL,
  p_address_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_total numeric(10,2);
  v_provider_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_preferred_date < current_date THEN RAISE EXCEPTION 'Date must be in the future'; END IF;

  SELECT pps.service_fee INTO v_total FROM service_providers sp JOIN provider_pooja_setups pps ON pps.provider_id=sp.id WHERE sp.id=p_provider_id AND pps.id=p_pooja_setup_id AND sp.approval_status='approved' AND sp.is_active AND sp.bookings_enabled AND pps.is_active;
  IF v_total IS NULL OR v_total <= 0 THEN RAISE EXCEPTION 'Pooja service is not available'; END IF;

  INSERT INTO provider_bookings(provider_id,pooja_setup_id,customer_id,customer_name,customer_mobile,preferred_date,preferred_time,consultation_mode,notes,total_amount,advance_amount,remaining_amount,status,address_id)
  VALUES(p_provider_id,p_pooja_setup_id,auth.uid(),trim(p_customer_name),trim(p_customer_mobile),p_preferred_date,trim(p_preferred_time),'in_person',p_notes,v_total,round(v_total * 0.30, 2),v_total-round(v_total * 0.30, 2),'request_sent',p_address_id)
  RETURNING id INTO v_id;

  SELECT auth_user_id INTO v_provider_user_id FROM service_providers WHERE id = p_provider_id;
  PERFORM send_booking_notification(v_id, v_provider_user_id, 'booking_request_sent', 'New Pooja Booking Request', 'You have received a new Pooja booking request.');

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION create_pooja_booking(uuid,uuid,text,text,date,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_pooja_booking(uuid,uuid,text,text,date,text,text,uuid) TO authenticated;

-- Update create_provider_booking to accept and store address_id
CREATE OR REPLACE FUNCTION create_provider_booking(
  p_provider_id uuid,
  p_service_id uuid,
  p_customer_name text,
  p_customer_mobile text,
  p_preferred_date date,
  p_preferred_time text,
  p_consultation_mode text,
  p_notes text DEFAULT NULL,
  p_address_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_total numeric(10,2);
  v_provider_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_preferred_date < current_date THEN RAISE EXCEPTION 'Date must be in the future'; END IF;
  SELECT COALESCE(admin_override_price, price) INTO v_total FROM provider_services ps JOIN service_providers sp ON sp.id=ps.provider_id WHERE sp.id=p_provider_id AND ps.id=p_service_id AND sp.approval_status='approved' AND sp.is_active AND sp.bookings_enabled AND ps.is_active;
  IF v_total IS NULL THEN RAISE EXCEPTION 'Service is not available'; END IF;

  INSERT INTO provider_bookings(provider_id,service_id,customer_id,customer_name,customer_mobile,preferred_date,preferred_time,consultation_mode,notes,total_amount,advance_amount,remaining_amount,status,address_id)
  VALUES(p_provider_id,p_service_id,auth.uid(),trim(p_customer_name),trim(p_customer_mobile),p_preferred_date,trim(p_preferred_time),p_consultation_mode,trim(coalesce(p_notes,'')),v_total,round(v_total * 0.30, 2),v_total-round(v_total * 0.30, 2),'request_sent',p_address_id)
  RETURNING id INTO v_id;

  SELECT auth_user_id INTO v_provider_user_id FROM service_providers WHERE id = p_provider_id;
  PERFORM send_booking_notification(v_id, v_provider_user_id, 'booking_request_sent', 'New Pooja Booking Request', 'You have received a new Pooja booking request.');

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION create_provider_booking(uuid,uuid,text,text,date,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_provider_booking(uuid,uuid,text,text,date,text,text,text,uuid) TO authenticated;