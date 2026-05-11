/*
  # Create riders storage bucket with RLS policies

  ## Changes
  - Creates a public `riders` storage bucket for rider photos and ID documents
  - Adds RLS policies:
    - Anyone authenticated can read rider files (admins need to view them)
    - Only admins (JWT role = 'admin') can insert/update/delete files
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('riders', 'riders', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can view rider files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'riders');

CREATE POLICY "Admins can upload rider files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'riders'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "Admins can update rider files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'riders'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    bucket_id = 'riders'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "Admins can delete rider files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'riders'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
