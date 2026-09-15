/*
# Allow customers to read approved provider profile photos

1. Purpose
- Allow signed URLs for profile photos shown on approved provider profiles.
- Keep the provider-photos bucket private so identity documents remain protected.

2. Security
- Adds a SELECT policy only for authenticated users.
- Grants access only when the requested object path exactly matches the profile photo path of an approved, active service provider.
- Does not grant access to identity documents or pending applications.

3. Important notes
- The customer app still uses short-lived signed URLs.
- Existing upload and administrator document-review policies are unchanged.
*/

DROP POLICY IF EXISTS "customer_read_approved_provider_profile_photos" ON storage.objects;

CREATE POLICY "customer_read_approved_provider_profile_photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'provider-photos'
  AND EXISTS (
    SELECT 1
    FROM public.service_providers
    WHERE service_providers.profile_photo_url = storage.objects.name
      AND service_providers.approval_status = 'approved'
      AND service_providers.is_active = true
  )
);