-- Fix vendor_flowers RLS to use is_admin() consistent with the rest of the schema

DROP POLICY IF EXISTS "admin_select_vendor_flowers" ON vendor_flowers;
CREATE POLICY "admin_select_vendor_flowers" ON vendor_flowers FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_vendor_flowers" ON vendor_flowers;
CREATE POLICY "admin_insert_vendor_flowers" ON vendor_flowers FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_vendor_flowers" ON vendor_flowers;
CREATE POLICY "admin_update_vendor_flowers" ON vendor_flowers FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_vendor_flowers" ON vendor_flowers;
CREATE POLICY "admin_delete_vendor_flowers" ON vendor_flowers FOR DELETE
  TO authenticated USING (is_admin());
