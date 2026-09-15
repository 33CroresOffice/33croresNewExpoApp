-- Allow authenticated users to upload their own avatar
-- The folder name (first path segment) must match their auth.uid()
CREATE POLICY "Users can insert their own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );