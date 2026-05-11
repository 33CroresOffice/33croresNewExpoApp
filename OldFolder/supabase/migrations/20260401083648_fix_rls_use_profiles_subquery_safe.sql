/*
  # Fix RLS: Replace JWT role check with secure profiles subquery

  ## Problem
  All admin RLS policies check `auth.jwt() ->> 'role' = 'admin'`.
  This reads the TOP-LEVEL JWT claim "role", which Supabase sets to "authenticated"
  for regular users — it never contains "admin". The actual role is in 
  `app_metadata` and would require `auth.jwt() -> 'app_metadata' ->> 'role'`.
  
  Even with app_metadata set correctly, it requires fresh JWT tokens which
  creates a poor user experience.

  ## Fix
  Create a SECURITY DEFINER helper function `is_admin()` that checks the 
  profiles table directly. This bypasses RLS on profiles (avoiding recursion)
  and returns true if the current user has role = 'admin'.

  Then update ALL admin RLS policies to use `is_admin()`.

  ## Security
  The function is SECURITY DEFINER meaning it runs with elevated privileges
  only to check the profiles.role field — it cannot be exploited to read
  other data as it only returns a boolean.
*/

-- Create secure helper function
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ===== riders =====
DROP POLICY IF EXISTS "Admins can select riders" ON riders;
DROP POLICY IF EXISTS "Admins can insert riders" ON riders;
DROP POLICY IF EXISTS "Admins can update riders" ON riders;
DROP POLICY IF EXISTS "Admins can delete riders" ON riders;
CREATE POLICY "Admins can select riders" ON riders FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Admins can insert riders" ON riders FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can update riders" ON riders FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can delete riders" ON riders FOR DELETE TO authenticated USING (is_admin());

-- ===== rider_order_assignments =====
DROP POLICY IF EXISTS "Admins can select rider_order_assignments" ON rider_order_assignments;
DROP POLICY IF EXISTS "Admins can insert rider_order_assignments" ON rider_order_assignments;
DROP POLICY IF EXISTS "Admins can update rider_order_assignments" ON rider_order_assignments;
DROP POLICY IF EXISTS "Admins can delete rider_order_assignments" ON rider_order_assignments;
CREATE POLICY "Admins can select rider_order_assignments" ON rider_order_assignments FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Admins can insert rider_order_assignments" ON rider_order_assignments FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can update rider_order_assignments" ON rider_order_assignments FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can delete rider_order_assignments" ON rider_order_assignments FOR DELETE TO authenticated USING (is_admin());

-- ===== rider_leave_requests =====
DROP POLICY IF EXISTS "Admin can select rider leave" ON rider_leave_requests;
DROP POLICY IF EXISTS "Admin can insert rider leave" ON rider_leave_requests;
DROP POLICY IF EXISTS "Admin can update rider leave" ON rider_leave_requests;
DROP POLICY IF EXISTS "Admin can delete rider leave" ON rider_leave_requests;
CREATE POLICY "Admin can select rider leave" ON rider_leave_requests FOR SELECT TO authenticated USING (is_admin() OR rider_id IN (SELECT id FROM riders WHERE profile_id = auth.uid()));
CREATE POLICY "Admin can insert rider leave" ON rider_leave_requests FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admin can update rider leave" ON rider_leave_requests FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admin can delete rider leave" ON rider_leave_requests FOR DELETE TO authenticated USING (is_admin());

-- ===== rider_activity_log =====
DROP POLICY IF EXISTS "Admins can select rider_activity_log" ON rider_activity_log;
DROP POLICY IF EXISTS "Admins can insert rider_activity_log" ON rider_activity_log;
CREATE POLICY "Admins can select rider_activity_log" ON rider_activity_log FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Admins can insert rider_activity_log" ON rider_activity_log FOR INSERT TO authenticated WITH CHECK (is_admin());

-- ===== rider_attendance =====
DROP POLICY IF EXISTS "Admins can select rider_attendance" ON rider_attendance;
DROP POLICY IF EXISTS "Admins can insert rider_attendance" ON rider_attendance;
DROP POLICY IF EXISTS "Admins can update rider_attendance" ON rider_attendance;
DROP POLICY IF EXISTS "Admins can delete rider_attendance" ON rider_attendance;
CREATE POLICY "Admins can select rider_attendance" ON rider_attendance FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Admins can insert rider_attendance" ON rider_attendance FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can update rider_attendance" ON rider_attendance FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can delete rider_attendance" ON rider_attendance FOR DELETE TO authenticated USING (is_admin());

-- ===== rider_payouts =====
DROP POLICY IF EXISTS "Admins can select rider_payouts" ON rider_payouts;
DROP POLICY IF EXISTS "Admins can insert rider_payouts" ON rider_payouts;
DROP POLICY IF EXISTS "Admins can update rider_payouts" ON rider_payouts;
DROP POLICY IF EXISTS "Admins can delete rider_payouts" ON rider_payouts;
CREATE POLICY "Admins can select rider_payouts" ON rider_payouts FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Admins can insert rider_payouts" ON rider_payouts FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can update rider_payouts" ON rider_payouts FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can delete rider_payouts" ON rider_payouts FOR DELETE TO authenticated USING (is_admin());

-- ===== rider_performance_snapshots =====
DROP POLICY IF EXISTS "Admins can select rider_performance_snapshots" ON rider_performance_snapshots;
DROP POLICY IF EXISTS "Admins can insert rider_performance_snapshots" ON rider_performance_snapshots;
CREATE POLICY "Admins can select rider_performance_snapshots" ON rider_performance_snapshots FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Admins can insert rider_performance_snapshots" ON rider_performance_snapshots FOR INSERT TO authenticated WITH CHECK (is_admin());

-- ===== orders =====
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
CREATE POLICY "Users can view own orders" ON orders FOR SELECT TO authenticated USING (auth.uid() = user_id OR is_admin());

-- ===== crm_tasks =====
DROP POLICY IF EXISTS "Admins can select crm_tasks" ON crm_tasks;
DROP POLICY IF EXISTS "Admins can insert crm_tasks" ON crm_tasks;
DROP POLICY IF EXISTS "Admins can update crm_tasks" ON crm_tasks;
DROP POLICY IF EXISTS "Admins can delete crm_tasks" ON crm_tasks;
CREATE POLICY "Admins can select crm_tasks" ON crm_tasks FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Admins can insert crm_tasks" ON crm_tasks FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can update crm_tasks" ON crm_tasks FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can delete crm_tasks" ON crm_tasks FOR DELETE TO authenticated USING (is_admin());

-- ===== customer_activity_log =====
DROP POLICY IF EXISTS "Admins can select customer_activity_log" ON customer_activity_log;
DROP POLICY IF EXISTS "Admins can insert customer_activity_log" ON customer_activity_log;
CREATE POLICY "Admins can select customer_activity_log" ON customer_activity_log FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Admins can insert customer_activity_log" ON customer_activity_log FOR INSERT TO authenticated WITH CHECK (is_admin());

-- ===== customer_notes =====
DROP POLICY IF EXISTS "Admins can select customer_notes" ON customer_notes;
DROP POLICY IF EXISTS "Admins can insert customer_notes" ON customer_notes;
DROP POLICY IF EXISTS "Admins can update customer_notes" ON customer_notes;
DROP POLICY IF EXISTS "Admins can delete customer_notes" ON customer_notes;
CREATE POLICY "Admins can select customer_notes" ON customer_notes FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Admins can insert customer_notes" ON customer_notes FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can update customer_notes" ON customer_notes FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can delete customer_notes" ON customer_notes FOR DELETE TO authenticated USING (is_admin());

-- ===== customer_segment_members =====
DROP POLICY IF EXISTS "Admins can select customer_segment_members" ON customer_segment_members;
DROP POLICY IF EXISTS "Admins can insert customer_segment_members" ON customer_segment_members;
DROP POLICY IF EXISTS "Admins can delete customer_segment_members" ON customer_segment_members;
CREATE POLICY "Admins can select customer_segment_members" ON customer_segment_members FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Admins can insert customer_segment_members" ON customer_segment_members FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can delete customer_segment_members" ON customer_segment_members FOR DELETE TO authenticated USING (is_admin());

-- ===== customer_segments =====
DROP POLICY IF EXISTS "Admins can select customer_segments" ON customer_segments;
DROP POLICY IF EXISTS "Admins can insert customer_segments" ON customer_segments;
DROP POLICY IF EXISTS "Admins can update customer_segments" ON customer_segments;
DROP POLICY IF EXISTS "Admins can delete customer_segments" ON customer_segments;
CREATE POLICY "Admins can select customer_segments" ON customer_segments FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Admins can insert customer_segments" ON customer_segments FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can update customer_segments" ON customer_segments FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can delete customer_segments" ON customer_segments FOR DELETE TO authenticated USING (is_admin());

-- ===== customer_tag_assignments =====
DROP POLICY IF EXISTS "Admins can select customer_tag_assignments" ON customer_tag_assignments;
DROP POLICY IF EXISTS "Admins can insert customer_tag_assignments" ON customer_tag_assignments;
DROP POLICY IF EXISTS "Admins can delete customer_tag_assignments" ON customer_tag_assignments;
CREATE POLICY "Admins can select customer_tag_assignments" ON customer_tag_assignments FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Admins can insert customer_tag_assignments" ON customer_tag_assignments FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can delete customer_tag_assignments" ON customer_tag_assignments FOR DELETE TO authenticated USING (is_admin());

-- ===== customer_tags =====
DROP POLICY IF EXISTS "Admins can select customer_tags" ON customer_tags;
DROP POLICY IF EXISTS "Admins can insert customer_tags" ON customer_tags;
DROP POLICY IF EXISTS "Admins can update customer_tags" ON customer_tags;
DROP POLICY IF EXISTS "Admins can delete customer_tags" ON customer_tags;
CREATE POLICY "Admins can select customer_tags" ON customer_tags FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Admins can insert customer_tags" ON customer_tags FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can update customer_tags" ON customer_tags FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can delete customer_tags" ON customer_tags FOR DELETE TO authenticated USING (is_admin());

-- ===== daily_requirements =====
DROP POLICY IF EXISTS "Admins can view daily requirements" ON daily_requirements;
DROP POLICY IF EXISTS "Admins can insert daily requirements" ON daily_requirements;
DROP POLICY IF EXISTS "Admins can update daily requirements" ON daily_requirements;
DROP POLICY IF EXISTS "Admins can delete daily requirements" ON daily_requirements;
CREATE POLICY "Admins can view daily requirements" ON daily_requirements FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Admins can insert daily requirements" ON daily_requirements FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can update daily requirements" ON daily_requirements FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can delete daily requirements" ON daily_requirements FOR DELETE TO authenticated USING (is_admin());

-- ===== flower_types =====
DROP POLICY IF EXISTS "Authenticated users can view active flower types" ON flower_types;
DROP POLICY IF EXISTS "Admins can insert flower types" ON flower_types;
DROP POLICY IF EXISTS "Admins can update flower types" ON flower_types;
DROP POLICY IF EXISTS "Admins can delete flower types" ON flower_types;
CREATE POLICY "Authenticated users can view active flower types" ON flower_types FOR SELECT TO authenticated USING (is_active = true OR is_admin());
CREATE POLICY "Admins can insert flower types" ON flower_types FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can update flower types" ON flower_types FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can delete flower types" ON flower_types FOR DELETE TO authenticated USING (is_admin());

-- ===== plan_flower_requirements =====
DROP POLICY IF EXISTS "Admins can insert plan flower requirements" ON plan_flower_requirements;
DROP POLICY IF EXISTS "Admins can update plan flower requirements" ON plan_flower_requirements;
DROP POLICY IF EXISTS "Admins can delete plan flower requirements" ON plan_flower_requirements;
CREATE POLICY "Admins can insert plan flower requirements" ON plan_flower_requirements FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can update plan flower requirements" ON plan_flower_requirements FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can delete plan flower requirements" ON plan_flower_requirements FOR DELETE TO authenticated USING (is_admin());

-- ===== procurement_order_items =====
DROP POLICY IF EXISTS "Admins and vendors can view procurement order items" ON procurement_order_items;
DROP POLICY IF EXISTS "Admins can insert procurement order items" ON procurement_order_items;
DROP POLICY IF EXISTS "Admins can update procurement order items" ON procurement_order_items;
DROP POLICY IF EXISTS "Admins can delete procurement order items" ON procurement_order_items;
CREATE POLICY "Admins and vendors can view procurement order items" ON procurement_order_items FOR SELECT TO authenticated
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM procurement_orders po JOIN vendors v ON v.id = po.vendor_id
    WHERE po.id = procurement_order_items.procurement_order_id AND v.user_id = auth.uid()
  ));
CREATE POLICY "Admins can insert procurement order items" ON procurement_order_items FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can update procurement order items" ON procurement_order_items FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can delete procurement order items" ON procurement_order_items FOR DELETE TO authenticated USING (is_admin());

-- ===== procurement_orders =====
DROP POLICY IF EXISTS "Admins can view all procurement orders" ON procurement_orders;
DROP POLICY IF EXISTS "Admins can insert procurement orders" ON procurement_orders;
DROP POLICY IF EXISTS "Admins can update procurement orders" ON procurement_orders;
DROP POLICY IF EXISTS "Admins can delete procurement orders" ON procurement_orders;
CREATE POLICY "Admins can view all procurement orders" ON procurement_orders FOR SELECT TO authenticated
  USING (is_admin() OR EXISTS (SELECT 1 FROM vendors v WHERE v.id = procurement_orders.vendor_id AND v.user_id = auth.uid()));
CREATE POLICY "Admins can insert procurement orders" ON procurement_orders FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can update procurement orders" ON procurement_orders FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can delete procurement orders" ON procurement_orders FOR DELETE TO authenticated USING (is_admin());

-- ===== vendor_payments =====
DROP POLICY IF EXISTS "Admins can view all vendor payments" ON vendor_payments;
DROP POLICY IF EXISTS "Admins can insert vendor payments" ON vendor_payments;
DROP POLICY IF EXISTS "Admins can update vendor payments" ON vendor_payments;
CREATE POLICY "Admins can view all vendor payments" ON vendor_payments FOR SELECT TO authenticated
  USING (is_admin() OR EXISTS (SELECT 1 FROM vendors v WHERE v.id = vendor_payments.vendor_id AND v.user_id = auth.uid()));
CREATE POLICY "Admins can insert vendor payments" ON vendor_payments FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can update vendor payments" ON vendor_payments FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ===== vendors =====
DROP POLICY IF EXISTS "Admins can view all vendors" ON vendors;
DROP POLICY IF EXISTS "Admins can insert vendors" ON vendors;
DROP POLICY IF EXISTS "Admins can update vendors" ON vendors;
DROP POLICY IF EXISTS "Admins can delete vendors" ON vendors;
CREATE POLICY "Admins can view all vendors" ON vendors FOR SELECT TO authenticated USING (is_admin() OR user_id = auth.uid());
CREATE POLICY "Admins can insert vendors" ON vendors FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can update vendors" ON vendors FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can delete vendors" ON vendors FOR DELETE TO authenticated USING (is_admin());

-- ===== warehouse_receipt_items =====
DROP POLICY IF EXISTS "Admins can view warehouse receipt items" ON warehouse_receipt_items;
DROP POLICY IF EXISTS "Admins can insert warehouse receipt items" ON warehouse_receipt_items;
DROP POLICY IF EXISTS "Admins can update warehouse receipt items" ON warehouse_receipt_items;
DROP POLICY IF EXISTS "Admins can delete warehouse receipt items" ON warehouse_receipt_items;
CREATE POLICY "Admins can view warehouse receipt items" ON warehouse_receipt_items FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Admins can insert warehouse receipt items" ON warehouse_receipt_items FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can update warehouse receipt items" ON warehouse_receipt_items FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can delete warehouse receipt items" ON warehouse_receipt_items FOR DELETE TO authenticated USING (is_admin());

-- ===== warehouse_receipts =====
DROP POLICY IF EXISTS "Admins can view warehouse receipts" ON warehouse_receipts;
DROP POLICY IF EXISTS "Admins can insert warehouse receipts" ON warehouse_receipts;
DROP POLICY IF EXISTS "Admins can update warehouse receipts" ON warehouse_receipts;
DROP POLICY IF EXISTS "Admins can delete warehouse receipts" ON warehouse_receipts;
CREATE POLICY "Admins can view warehouse receipts" ON warehouse_receipts FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Admins can insert warehouse receipts" ON warehouse_receipts FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can update warehouse receipts" ON warehouse_receipts FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can delete warehouse receipts" ON warehouse_receipts FOR DELETE TO authenticated USING (is_admin());

-- ===== profiles (fix admin read-all policy) =====
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
CREATE POLICY "Admins can read all profiles" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id OR is_admin());
