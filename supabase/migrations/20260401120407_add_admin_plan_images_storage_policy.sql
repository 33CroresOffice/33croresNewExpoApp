
/*
  # Add storage policies for plan images

  ## Summary
  Admins need to upload, update, and delete images under the `plans/` folder
  in the `avatars` bucket. The existing INSERT policy only permits uploads
  where the first folder segment matches the authenticated user's UID, which
  blocks the shared `plans/` path.

  ## Changes
  1. New INSERT policy: admins can upload to `plans/` folder
  2. New UPDATE policy: admins can overwrite files in `plans/` folder
  3. New DELETE policy: admins can delete files from `plans/` folder

  ## Security
  - All policies check that the user has role = 'admin' via their profile
  - Restricted to the `avatars` bucket, `plans/` path only
*/

CREATE POLICY "Admins can upload plan images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'plans'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update plan images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'plans'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'plans'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete plan images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'plans'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
