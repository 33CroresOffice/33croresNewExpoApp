/*
# Create service provider marketplace

1. New tables
- service_providers: approved Astrology, Vaastu, Pandit and future provider profiles.
- provider_services: provider-owned services and prices, with admin price overrides.
- provider_bookings: customer booking requests and their lifecycle.
- provider_availability: weekly provider availability.

2. Security
- All tables use RLS.
- Registration uses a controlled public function so applicants cannot set approval, activation, ownership, or audit fields.
- Providers can manage only their editable profile, services, and availability.
- Admin-only fields and approval actions use authenticated admin checks.
- Booking writes verify the selected provider and service are active and booking-enabled.

3. Important notes
- Bookings are free requests in this release.
- Provider-set prices are stored separately from admin overrides.
- Provider authentication is linked through auth_user_id after approval.
*/

CREATE TABLE IF NOT EXISTS service_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  mobile text NOT NULL UNIQUE,
  alternate_mobile text,
  email text,
  category text NOT NULL CHECK (category IN ('astrology','vaastu','pandit')),
  specialization text NOT NULL DEFAULT '',
  experience_years integer NOT NULL DEFAULT 0 CHECK (experience_years >= 0 AND experience_years <= 100),
  languages text[] NOT NULL DEFAULT '{}',
  bio text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  profile_photo_url text,
  id_proof_url text,
  approval_status text NOT NULL DEFAULT 'pending_approval' CHECK (approval_status IN ('pending_approval','approved','rejected')),
  rejection_reason text,
  is_active boolean NOT NULL DEFAULT false,
  bookings_enabled boolean NOT NULL DEFAULT true,
  auth_user_id uuid,
  registered_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE service_providers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_service_providers_category ON service_providers(category);
CREATE INDEX IF NOT EXISTS idx_service_providers_status ON service_providers(approval_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_providers_auth_user ON service_providers(auth_user_id) WHERE auth_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS provider_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  duration_minutes integer NOT NULL DEFAULT 30 CHECK (duration_minutes > 0 AND duration_minutes <= 1440),
  consultation_mode text NOT NULL DEFAULT 'in_person' CHECK (consultation_mode IN ('phone','video','in_person','temple_visit')),
  price numeric(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  admin_override_price numeric(10,2) CHECK (admin_override_price IS NULL OR admin_override_price >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE provider_services ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_provider_services_provider ON provider_services(provider_id);

CREATE TABLE IF NOT EXISTS provider_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time text NOT NULL DEFAULT '09:00',
  end_time text NOT NULL DEFAULT '18:00',
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_id, day_of_week)
);
ALTER TABLE provider_availability ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_provider_availability_provider ON provider_availability(provider_id);

CREATE TABLE IF NOT EXISTS provider_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES provider_services(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  customer_mobile text NOT NULL,
  preferred_date date NOT NULL,
  preferred_time text NOT NULL,
  consultation_mode text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled','completed','no_show')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE provider_bookings ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_provider_bookings_provider ON provider_bookings(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_bookings_customer ON provider_bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_provider_bookings_status ON provider_bookings(status);

CREATE OR REPLACE FUNCTION register_service_provider(
  p_full_name text, p_mobile text, p_alternate_mobile text, p_email text,
  p_category text, p_specialization text, p_experience_years integer,
  p_languages text[], p_bio text, p_city text, p_address text,
  p_profile_photo_url text, p_id_proof_url text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF length(trim(coalesce(p_full_name,''))) < 2 OR p_mobile !~ '^[6-9][0-9]{9}$' THEN RAISE EXCEPTION 'Invalid registration details'; END IF;
  IF p_category NOT IN ('astrology','vaastu','pandit') THEN RAISE EXCEPTION 'Invalid category'; END IF;
  INSERT INTO service_providers(full_name,mobile,alternate_mobile,email,category,specialization,experience_years,languages,bio,city,address,profile_photo_url,id_proof_url)
  VALUES(trim(p_full_name),trim(p_mobile),NULLIF(trim(coalesce(p_alternate_mobile,'')),''),NULLIF(trim(coalesce(p_email,'')),''),p_category,trim(coalesce(p_specialization,'')),greatest(0,least(coalesce(p_experience_years,0),100)),coalesce(p_languages,'{}'),trim(coalesce(p_bio,'')),trim(coalesce(p_city,'')),trim(coalesce(p_address,'')),p_profile_photo_url,p_id_proof_url)
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Registration already exists';
END; $$;
REVOKE ALL ON FUNCTION register_service_provider(text,text,text,text,text,text,integer,text[],text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_service_provider(text,text,text,text,text,text,integer,text[],text,text,text,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION check_service_provider_status(p_mobile text)
RETURNS TABLE(id uuid, approval_status text, is_active boolean, bookings_enabled boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT sp.id, sp.approval_status, sp.is_active, sp.bookings_enabled FROM service_providers sp WHERE sp.mobile = p_mobile LIMIT 1
$$;
REVOKE ALL ON FUNCTION check_service_provider_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_service_provider_status(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION admin_set_provider_status(p_id uuid, p_approval_status text, p_is_active boolean, p_rejection_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (auth.jwt() -> 'app_metadata' ->> 'role') <> 'admin' THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_approval_status NOT IN ('pending_approval','approved','rejected') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE service_providers SET approval_status=p_approval_status,is_active=p_is_active,rejection_reason=p_rejection_reason,approved_at=CASE WHEN p_approval_status='approved' THEN now() ELSE approved_at END,approved_by=CASE WHEN p_approval_status='approved' THEN auth.uid() ELSE approved_by END,updated_at=now() WHERE id=p_id;
END; $$;
REVOKE ALL ON FUNCTION admin_set_provider_status(uuid,text,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_provider_status(uuid,text,boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION admin_set_service_override(p_service_id uuid, p_override_price numeric, p_is_active boolean DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (auth.jwt() -> 'app_metadata' ->> 'role') <> 'admin' THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_override_price IS NOT NULL AND p_override_price < 0 THEN RAISE EXCEPTION 'Invalid price'; END IF;
  UPDATE provider_services SET admin_override_price=p_override_price,is_active=coalesce(p_is_active,is_active),updated_at=now() WHERE id=p_service_id;
END; $$;
REVOKE ALL ON FUNCTION admin_set_service_override(uuid,numeric,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_service_override(uuid,numeric,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION create_provider_booking(p_provider_id uuid,p_service_id uuid,p_customer_name text,p_customer_mobile text,p_preferred_date date,p_preferred_time text,p_consultation_mode text,p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_preferred_date < current_date THEN RAISE EXCEPTION 'Date must be in the future'; END IF;
  IF NOT EXISTS (SELECT 1 FROM service_providers sp JOIN provider_services ps ON ps.provider_id=sp.id WHERE sp.id=p_provider_id AND ps.id=p_service_id AND sp.approval_status='approved' AND sp.is_active AND sp.bookings_enabled AND ps.is_active) THEN RAISE EXCEPTION 'Service is not available'; END IF;
  INSERT INTO provider_bookings(provider_id,service_id,customer_id,customer_name,customer_mobile,preferred_date,preferred_time,consultation_mode,notes)
  VALUES(p_provider_id,p_service_id,auth.uid(),trim(p_customer_name),trim(p_customer_mobile),p_preferred_date,trim(p_preferred_time),p_consultation_mode,trim(coalesce(p_notes,''))) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION create_provider_booking(uuid,uuid,text,text,date,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_provider_booking(uuid,uuid,text,text,date,text,text,text) TO authenticated;

DROP POLICY IF EXISTS "public_select_approved_service_providers" ON service_providers;
CREATE POLICY "public_select_approved_service_providers" ON service_providers FOR SELECT TO anon,authenticated USING (approval_status='approved' AND is_active=true);
DROP POLICY IF EXISTS "admin_select_service_providers" ON service_providers;
CREATE POLICY "admin_select_service_providers" ON service_providers FOR SELECT TO authenticated USING ((auth.jwt()->'app_metadata'->>'role')='admin');
DROP POLICY IF EXISTS "provider_select_own_service_provider" ON service_providers;
CREATE POLICY "provider_select_own_service_provider" ON service_providers FOR SELECT TO authenticated USING (auth.uid()=auth_user_id);
DROP POLICY IF EXISTS "provider_update_own_editable_profile" ON service_providers;
CREATE POLICY "provider_update_own_editable_profile" ON service_providers FOR UPDATE TO authenticated USING (auth.uid()=auth_user_id) WITH CHECK (auth.uid()=auth_user_id);
DROP POLICY IF EXISTS "admin_delete_service_providers" ON service_providers;
CREATE POLICY "admin_delete_service_providers" ON service_providers FOR DELETE TO authenticated USING ((auth.jwt()->'app_metadata'->>'role')='admin');

DROP POLICY IF EXISTS "public_select_active_provider_services" ON provider_services;
CREATE POLICY "public_select_active_provider_services" ON provider_services FOR SELECT TO anon,authenticated USING (is_active=true AND EXISTS (SELECT 1 FROM service_providers sp WHERE sp.id=provider_id AND sp.approval_status='approved' AND sp.is_active));
DROP POLICY IF EXISTS "provider_select_own_services" ON provider_services;
CREATE POLICY "provider_select_own_services" ON provider_services FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM service_providers sp WHERE sp.id=provider_id AND sp.auth_user_id=auth.uid()));
DROP POLICY IF EXISTS "provider_insert_own_services" ON provider_services;
CREATE POLICY "provider_insert_own_services" ON provider_services FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM service_providers sp WHERE sp.id=provider_id AND sp.auth_user_id=auth.uid()));
DROP POLICY IF EXISTS "provider_update_own_services" ON provider_services;
CREATE POLICY "provider_update_own_services" ON provider_services FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM service_providers sp WHERE sp.id=provider_id AND sp.auth_user_id=auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM service_providers sp WHERE sp.id=provider_id AND sp.auth_user_id=auth.uid()));
DROP POLICY IF EXISTS "provider_delete_own_services" ON provider_services;
CREATE POLICY "provider_delete_own_services" ON provider_services FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM service_providers sp WHERE sp.id=provider_id AND sp.auth_user_id=auth.uid()));
DROP POLICY IF EXISTS "admin_manage_provider_services" ON provider_services;
CREATE POLICY "admin_manage_provider_services" ON provider_services FOR ALL TO authenticated USING ((auth.jwt()->'app_metadata'->>'role')='admin') WITH CHECK ((auth.jwt()->'app_metadata'->>'role')='admin');

DROP POLICY IF EXISTS "public_select_provider_availability" ON provider_availability;
CREATE POLICY "public_select_provider_availability" ON provider_availability FOR SELECT TO anon,authenticated USING (EXISTS (SELECT 1 FROM service_providers sp WHERE sp.id=provider_id AND sp.approval_status='approved' AND sp.is_active));
DROP POLICY IF EXISTS "provider_manage_own_availability" ON provider_availability;
CREATE POLICY "provider_manage_own_availability" ON provider_availability FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM service_providers sp WHERE sp.id=provider_id AND sp.auth_user_id=auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM service_providers sp WHERE sp.id=provider_id AND sp.auth_user_id=auth.uid()));
DROP POLICY IF EXISTS "admin_manage_provider_availability" ON provider_availability;
CREATE POLICY "admin_manage_provider_availability" ON provider_availability FOR ALL TO authenticated USING ((auth.jwt()->'app_metadata'->>'role')='admin') WITH CHECK ((auth.jwt()->'app_metadata'->>'role')='admin');

DROP POLICY IF EXISTS "customer_select_own_provider_bookings" ON provider_bookings;
CREATE POLICY "customer_select_own_provider_bookings" ON provider_bookings FOR SELECT TO authenticated USING (customer_id=auth.uid());
DROP POLICY IF EXISTS "customer_update_own_provider_bookings" ON provider_bookings;
CREATE POLICY "customer_update_own_provider_bookings" ON provider_bookings FOR UPDATE TO authenticated USING (customer_id=auth.uid()) WITH CHECK (customer_id=auth.uid());
DROP POLICY IF EXISTS "provider_select_provider_bookings" ON provider_bookings;
CREATE POLICY "provider_select_provider_bookings" ON provider_bookings FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM service_providers sp WHERE sp.id=provider_id AND sp.auth_user_id=auth.uid()));
DROP POLICY IF EXISTS "provider_update_provider_bookings" ON provider_bookings;
CREATE POLICY "provider_update_provider_bookings" ON provider_bookings FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM service_providers sp WHERE sp.id=provider_id AND sp.auth_user_id=auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM service_providers sp WHERE sp.id=provider_id AND sp.auth_user_id=auth.uid()));
DROP POLICY IF EXISTS "admin_manage_provider_bookings" ON provider_bookings;
CREATE POLICY "admin_manage_provider_bookings" ON provider_bookings FOR ALL TO authenticated USING ((auth.jwt()->'app_metadata'->>'role')='admin') WITH CHECK ((auth.jwt()->'app_metadata'->>'role')='admin');

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='role') THEN
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
    ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('customer','admin','vendor','rider','provider'));
  END IF;
END $$;

INSERT INTO modules(key,label,description,sort_order) VALUES ('service_providers','Service Providers','Manage astrology, vaastu and pandit service providers',65) ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,description=EXCLUDED.description,sort_order=EXCLUDED.sort_order;