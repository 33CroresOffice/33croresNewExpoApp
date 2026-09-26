/*
# Add payment receipt storage for vendor payments

1. New Storage Bucket
- `vendor-receipts` — public read, admin-authenticated write.
- Stores payment receipt images (JPG/PNG) uploaded by admins when recording vendor payments.
- File path convention: `vendor-receipts/{payment_id or order_id}.{ext}`

2. Schema Changes
- `vendor_payments` table: adds `receipt_image_path` (text, nullable) to store the
  storage path to the uploaded payment receipt image.

3. Security
- Storage bucket is public-read (receipts may be shared with vendors for verification)
  but only authenticated admins can upload/update/delete.
- RLS on `vendor_payments` table is unchanged — the new column inherits existing
  admin CRUD policies.
*/

-- ═══ 1. Create vendor-receipts storage bucket ═══════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vendor-receipts',
  'vendor-receipts',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- ═══ 2. Storage RLS policies ════════════════════════════════════════════
-- Public read
DROP POLICY IF EXISTS "Public can read vendor receipts" ON storage.objects;
CREATE POLICY "Public can read vendor receipts"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'vendor-receipts');

-- Admin insert
DROP POLICY IF EXISTS "Admins can upload vendor receipts" ON storage.objects;
CREATE POLICY "Admins can upload vendor receipts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'vendor-receipts'
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Admin update
DROP POLICY IF EXISTS "Admins can update vendor receipts" ON storage.objects;
CREATE POLICY "Admins can update vendor receipts"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'vendor-receipts'
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
  WITH CHECK (
    bucket_id = 'vendor-receipts'
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Admin delete
DROP POLICY IF EXISTS "Admins can delete vendor receipts" ON storage.objects;
CREATE POLICY "Admins can delete vendor receipts"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'vendor-receipts'
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ═══ 3. Add receipt_image_path column to vendor_payments ══════════════
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vendor_payments' AND column_name = 'receipt_image_path'
  ) THEN
    ALTER TABLE vendor_payments ADD COLUMN receipt_image_path text;
  END IF;
END $$;
