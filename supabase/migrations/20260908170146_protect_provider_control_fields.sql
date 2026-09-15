/*
# Protect provider control fields

1. Changes
- Prevents authenticated clients from directly editing approval, activation, booking, ownership, and audit fields.
- Adds admin-only booking control functions for individual and global toggles.

2. Security
- Providers retain direct access only to their editable profile fields.
- Admin actions validate the caller's JWT role inside SECURITY DEFINER functions.
*/
REVOKE UPDATE (mobile, category, approval_status, rejection_reason, is_active, bookings_enabled, auth_user_id, registered_at, approved_at, approved_by) ON service_providers FROM authenticated;

CREATE OR REPLACE FUNCTION admin_set_provider_bookings(p_id uuid, p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (auth.jwt()->'app_metadata'->>'role') <> 'admin' THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE service_providers SET bookings_enabled=p_enabled,updated_at=now() WHERE id=p_id;
END; $$;
REVOKE ALL ON FUNCTION admin_set_provider_bookings(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_provider_bookings(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION admin_set_all_provider_bookings(p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (auth.jwt()->'app_metadata'->>'role') <> 'admin' THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE service_providers SET bookings_enabled=p_enabled,updated_at=now();
END; $$;
REVOKE ALL ON FUNCTION admin_set_all_provider_bookings(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_all_provider_bookings(boolean) TO authenticated;
