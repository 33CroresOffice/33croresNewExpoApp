/*
# Enable admin document review for provider approvals

1. Changes
- Adds a SELECT policy on the provider-photos storage bucket for authenticated admins.
- Creates admin_get_provider_documents SECURITY DEFINER function that returns profile_photo_url and id_proof_url for a given provider, callable only by admins.

2. Security
- Only authenticated users with admin role in JWT app_metadata can call the function.
- Only authenticated admins can SELECT from the provider-photos storage bucket.
- The function exposes only the two document URL columns, not other private fields.
*/
DROP POLICY IF EXISTS "admin_read_provider_photos" ON storage.objects;
CREATE POLICY "admin_read_provider_photos" ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'provider-photos' AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE OR REPLACE FUNCTION admin_get_provider_documents(p_provider_id uuid)
RETURNS TABLE(profile_photo_url text, id_proof_url text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT sp.profile_photo_url, sp.id_proof_url FROM service_providers sp WHERE sp.id = p_provider_id;
$$;
REVOKE ALL ON FUNCTION admin_get_provider_documents(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_get_provider_documents(uuid) TO authenticated;
