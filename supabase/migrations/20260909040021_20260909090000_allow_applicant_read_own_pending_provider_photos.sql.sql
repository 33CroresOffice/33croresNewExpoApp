/*
# Allow applicants to read their own pending provider photos

1. Why
- Provider applicants upload a profile photo and identity proof into
  `provider-photos/pending/<mobile>/...` before they have an auth account.
- The bucket is private, so after upload the client cannot create a signed
  URL or re-fetch the image for preview without a SELECT policy.
- This adds a narrow SELECT policy scoped to the `pending` folder so an
  anonymous applicant can preview only their own pending uploads.

2. Security
- SELECT only on storage.objects where bucket_id = 'provider-photos'
  AND the top-level folder is 'pending'.
- No access to approved provider folders (those remain admin-only via the
  existing admin_read_provider_photos policy).
- No INSERT/UPDATE/DELETE changes; the existing
  provider_application_upload INSERT policy already covers pending writes.
*/

DROP POLICY IF EXISTS "provider_application_read_own_pending" ON storage.objects;
CREATE POLICY "provider_application_read_own_pending" ON storage.objects FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'provider-photos'
  AND (storage.foldername(name))[1] = 'pending'
);
