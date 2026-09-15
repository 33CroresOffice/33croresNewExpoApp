/*
# Add Pooja Booking Support

1. Changes to `provider_bookings` table
- Add `pooja_setup_id` column (nullable uuid, FK to `provider_pooja_setups`).
- Make `service_id` nullable so pooja bookings can omit it.
- Add CHECK constraint: at least one of `service_id` or `pooja_setup_id` must be set.

2. New RPC: `create_pooja_booking`
- SECURITY DEFINER function that lets a customer book a pandit's pooja setup.
- Validates auth, future date, and that the provider/setup is active and approved.
- Inserts a row into `provider_bookings` with `pooja_setup_id` set and `service_id` null.
- Returns the new booking id.

3. Security
- No new tables. RLS already covers `provider_bookings`.
- The RPC is SECURITY DEFINER, checks `auth.uid()` internally.
- Revoke EXECUTE from anon; grant to authenticated.
*/

-- 1. Make service_id nullable and add pooja_setup_id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='provider_bookings' AND column_name='pooja_setup_id'
  ) THEN
    ALTER TABLE provider_bookings ALTER COLUMN service_id DROP NOT NULL;
    ALTER TABLE provider_bookings ADD COLUMN pooja_setup_id uuid REFERENCES provider_pooja_setups(id) ON DELETE SET NULL;
    ALTER TABLE provider_bookings ADD CONSTRAINT provider_bookings_service_or_pooja CHECK (
      service_id IS NOT NULL OR pooja_setup_id IS NOT NULL
    );
  END IF;
END $$;

-- 2. Create the pooja booking RPC
CREATE OR REPLACE FUNCTION create_pooja_booking(
  p_provider_id uuid,
  p_pooja_setup_id uuid,
  p_customer_name text,
  p_customer_mobile text,
  p_preferred_date date,
  p_preferred_time text,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_preferred_date < current_date THEN RAISE EXCEPTION 'Date must be in the future'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM service_providers sp
    JOIN provider_pooja_setups pps ON pps.provider_id = sp.id
    WHERE sp.id = p_provider_id
      AND pps.id = p_pooja_setup_id
      AND sp.approval_status = 'approved'
      AND sp.is_active = true
      AND sp.bookings_enabled = true
      AND pps.is_active = true
  ) THEN
    RAISE EXCEPTION 'Pooja service is not available';
  END IF;

  INSERT INTO provider_bookings(
    provider_id,
    pooja_setup_id,
    customer_id,
    customer_name,
    customer_mobile,
    preferred_date,
    preferred_time,
    consultation_mode,
    notes
  )
  VALUES(
    p_provider_id,
    p_pooja_setup_id,
    auth.uid(),
    trim(p_customer_name),
    trim(p_customer_mobile),
    p_preferred_date,
    trim(p_preferred_time),
    'in_person',
    p_notes
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_pooja_booking FROM anon;
GRANT EXECUTE ON FUNCTION create_pooja_booking TO authenticated;
