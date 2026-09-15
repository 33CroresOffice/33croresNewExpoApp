/*
# Create provider application photo storage

1. New bucket
- provider-photos stores provider profile photos and identity documents.

2. Security
- The bucket is private by default.
- Anonymous applicants may upload only into the pending folder.
- Authenticated providers may upload only into their own auth-user folder.
- No public read policy is created; signed access can be added later for approved documents.
*/
INSERT INTO storage.buckets (id,name,public)
VALUES ('provider-photos','provider-photos',false)
ON CONFLICT (id) DO UPDATE SET public=false;

DROP POLICY IF EXISTS "provider_application_upload" ON storage.objects;
CREATE POLICY "provider_application_upload" ON storage.objects FOR INSERT TO anon,authenticated
WITH CHECK (bucket_id='provider-photos' AND (storage.foldername(name))[1] IN ('pending', auth.uid()::text));
DROP POLICY IF EXISTS "provider_owner_upload_update" ON storage.objects;
CREATE POLICY "provider_owner_upload_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id='provider-photos' AND (storage.foldername(name))[1]=auth.uid()::text)
WITH CHECK (bucket_id='provider-photos' AND (storage.foldername(name))[1]=auth.uid()::text);
