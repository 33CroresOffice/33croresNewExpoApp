/*
  # Add storage policies for flower type images

  ## Summary
  Admins need to upload, update, and delete images under the `flowers/` folder
  in the `avatars` bucket for flower type images.

  ## Changes
  1. INSERT policy: admins can upload to `flowers/` folder
  2. UPDATE policy: admins can overwrite files in `flowers/` folder
  3. DELETE policy: admins can delete files from `flowers/` folder

  ## Security
  - All policies check that the user has role = 'admin' via their profile
  - Restricted to the `avatars` bucket, `flowers/` path only
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
    AND schemaname = 'storage'
    AND policyname = 'Admins can upload flower images'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can upload flower images"
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (
          bucket_id = 'avatars'
          AND (storage.foldername(name))[1] = 'flowers'
          AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
          )
        )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
    AND schemaname = 'storage'
    AND policyname = 'Admins can update flower images'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can update flower images"
        ON storage.objects
        FOR UPDATE
        TO authenticated
        USING (
          bucket_id = 'avatars'
          AND (storage.foldername(name))[1] = 'flowers'
          AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
          )
        )
        WITH CHECK (
          bucket_id = 'avatars'
          AND (storage.foldername(name))[1] = 'flowers'
          AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
          )
        )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
    AND schemaname = 'storage'
    AND policyname = 'Admins can delete flower images'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can delete flower images"
        ON storage.objects
        FOR DELETE
        TO authenticated
        USING (
          bucket_id = 'avatars'
          AND (storage.foldername(name))[1] = 'flowers'
          AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
          )
        )
    $policy$;
  END IF;
END $$;
