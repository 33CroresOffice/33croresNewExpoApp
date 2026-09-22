/*
# Fix Rider Quality Report Photo Upload

## Overview
Riders could not upload flower quality report photos because the `riders`
storage bucket had no INSERT policy allowing a rider to upload files --
only admins could upload. The upload failed with
"new row violates row-level security policy" (HTTP 403).

## Root Cause
- The `riders` bucket INSERT policy only allows admin JWT role.
- The rider app uploaded to `quality-reports/{riderId}-{timestamp}` with
  no auth-uid-scoped folder, so even a correct policy would not match.

## Fix
1. Add a storage INSERT policy allowing authenticated riders to upload
   files to their own folder: `riders/{auth.uid()}/...`.
   The rider's auth uid is the first folder component, enforced by
   `storage.foldername(name))[1] = auth.uid()::text`.
2. The existing SELECT policy "Authenticated users can view rider files"
   already allows any authenticated user to read from the bucket, so
   admins can view the uploaded quality report photos.
3. The existing admin DELETE and UPDATE policies remain unchanged.

## Security
- Riders can only upload to their own folder (first folder = their auth uid).
- Riders cannot upload to other riders' folders.
- Admins retain full CRUD on the riders bucket.
- The bucket is already public for reads, so no new read exposure.
*/

-- Allow riders to upload files to their own folder in the riders bucket
DROP POLICY IF EXISTS "Riders can upload own files" ON storage.objects;
CREATE POLICY "Riders can upload own files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'riders'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
