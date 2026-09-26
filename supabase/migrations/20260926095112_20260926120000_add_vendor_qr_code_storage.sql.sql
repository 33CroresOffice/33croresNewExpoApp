/*
# Add Scan-to-Pay QR Code image storage for vendors

1. New Storage Bucket
- `vendor-qr-codes` — public read, admin-authenticated write.
- Stores vendor payment QR code images (JPG/PNG).
- File path convention: `vendor-qr-codes/{vendor_id}.{ext}`

2. Schema Changes
- `vendors` table: adds `qr_code_image_path` (text, nullable) to store the
  storage path to the vendor's Scan-to-Pay QR code image.

3. Security
- Storage bucket is public-read (QR codes are meant to be shared/scanned)
  but only authenticated admins can upload/update/delete.
- RLS on `vendors` table is unchanged — the new column inherits existing
  admin CRUD policies.
*/

-- ═══ 1. Create vendor-qr-codes storage bucket ═══════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vendor-qr-codes',
  'vendor-qr-codes',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- ═══ 2. Storage RLS policies ════════════════════════════════════════════
-- Public read
DROP POLICY IF EXISTS "Public can read vendor QR codes" ON storage.objects;
CREATE POLICY "Public can read vendor QR codes"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'vendor-qr-codes');

-- Admin insert
DROP POLICY IF EXISTS "Admins can upload vendor QR codes" ON storage.objects;
CREATE POLICY "Admins can upload vendor QR codes"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'vendor-qr-codes'
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Admin update (upsert / replace)
DROP POLICY IF EXISTS "Admins can update vendor QR codes" ON storage.objects;
CREATE POLICY "Admins can update vendor QR codes"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'vendor-qr-codes'
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
  WITH CHECK (
    bucket_id = 'vendor-qr-codes'
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Admin delete
DROP POLICY IF EXISTS "Admins can delete vendor QR codes" ON storage.objects;
CREATE POLICY "Admins can delete vendor QR codes"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'vendor-qr-codes'
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ═══ 3. Add qr_code_image_path column to vendors ═══════════════════════
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vendors' AND column_name = 'qr_code_image_path'
  ) THEN
    ALTER TABLE vendors ADD COLUMN qr_code_image_path text;
  END IF;
END $$;
