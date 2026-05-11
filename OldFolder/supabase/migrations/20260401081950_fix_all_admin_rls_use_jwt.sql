/*
  # Fix All Admin RLS Policies to Use JWT Role Claim

  ## Problem
  Across all admin tables, RLS policies check admin status by running a subquery
  against the profiles table:
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')

  This subquery is itself subject to profiles RLS, which checks `auth.jwt() ->> 'role' = 'admin'`.
  This creates a circular dependency: to read a table you need to be an admin, to prove you're
  an admin you query profiles, but profiles also needs you to be an admin via JWT.

  ## Fix
  Replace all profiles-subquery admin checks with the direct JWT claim check:
    (auth.jwt() ->> 'role') = 'admin'

  ## Tables Fixed
  crm_tasks, customer_activity_log, customer_notes, customer_segment_members,
  customer_segments, customer_tag_assignments, customer_tags, daily_requirements,
  flower_types, orders, plan_flower_requirements, procurement_order_items,
  procurement_orders, rider_activity_log, rider_attendance, rider_leave_requests,
  rider_order_assignments, rider_payouts, rider_performance_snapshots,
  vendor_payments, vendors, warehouse_receipt_items, warehouse_receipts
*/

-- crm_tasks
DROP POLICY IF EXISTS "Admins can select crm_tasks" ON crm_tasks;
DROP POLICY IF EXISTS "Admins can update crm_tasks" ON crm_tasks;
DROP POLICY IF EXISTS "Admins can delete crm_tasks" ON crm_tasks;
DROP POLICY IF EXISTS "Admins can insert crm_tasks" ON crm_tasks;
CREATE POLICY "Admins can select crm_tasks" ON crm_tasks FOR SELECT TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can insert crm_tasks" ON crm_tasks FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can update crm_tasks" ON crm_tasks FOR UPDATE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin') WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can delete crm_tasks" ON crm_tasks FOR DELETE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');

-- customer_activity_log
DROP POLICY IF EXISTS "Admins can select customer_activity_log" ON customer_activity_log;
DROP POLICY IF EXISTS "Admins can insert customer_activity_log" ON customer_activity_log;
CREATE POLICY "Admins can select customer_activity_log" ON customer_activity_log FOR SELECT TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can insert customer_activity_log" ON customer_activity_log FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- customer_notes
DROP POLICY IF EXISTS "Admins can select customer_notes" ON customer_notes;
DROP POLICY IF EXISTS "Admins can insert customer_notes" ON customer_notes;
DROP POLICY IF EXISTS "Admins can update customer_notes" ON customer_notes;
DROP POLICY IF EXISTS "Admins can delete customer_notes" ON customer_notes;
CREATE POLICY "Admins can select customer_notes" ON customer_notes FOR SELECT TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can insert customer_notes" ON customer_notes FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can update customer_notes" ON customer_notes FOR UPDATE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin') WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can delete customer_notes" ON customer_notes FOR DELETE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');

-- customer_segment_members
DROP POLICY IF EXISTS "Admins can select customer_segment_members" ON customer_segment_members;
DROP POLICY IF EXISTS "Admins can insert customer_segment_members" ON customer_segment_members;
DROP POLICY IF EXISTS "Admins can delete customer_segment_members" ON customer_segment_members;
CREATE POLICY "Admins can select customer_segment_members" ON customer_segment_members FOR SELECT TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can insert customer_segment_members" ON customer_segment_members FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can delete customer_segment_members" ON customer_segment_members FOR DELETE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');

-- customer_segments
DROP POLICY IF EXISTS "Admins can select customer_segments" ON customer_segments;
DROP POLICY IF EXISTS "Admins can insert customer_segments" ON customer_segments;
DROP POLICY IF EXISTS "Admins can update customer_segments" ON customer_segments;
DROP POLICY IF EXISTS "Admins can delete customer_segments" ON customer_segments;
CREATE POLICY "Admins can select customer_segments" ON customer_segments FOR SELECT TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can insert customer_segments" ON customer_segments FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can update customer_segments" ON customer_segments FOR UPDATE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin') WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can delete customer_segments" ON customer_segments FOR DELETE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');

-- customer_tag_assignments
DROP POLICY IF EXISTS "Admins can select customer_tag_assignments" ON customer_tag_assignments;
DROP POLICY IF EXISTS "Admins can insert customer_tag_assignments" ON customer_tag_assignments;
DROP POLICY IF EXISTS "Admins can delete customer_tag_assignments" ON customer_tag_assignments;
CREATE POLICY "Admins can select customer_tag_assignments" ON customer_tag_assignments FOR SELECT TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can insert customer_tag_assignments" ON customer_tag_assignments FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can delete customer_tag_assignments" ON customer_tag_assignments FOR DELETE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');

-- customer_tags
DROP POLICY IF EXISTS "Admins can select customer_tags" ON customer_tags;
DROP POLICY IF EXISTS "Admins can insert customer_tags" ON customer_tags;
DROP POLICY IF EXISTS "Admins can update customer_tags" ON customer_tags;
DROP POLICY IF EXISTS "Admins can delete customer_tags" ON customer_tags;
CREATE POLICY "Admins can select customer_tags" ON customer_tags FOR SELECT TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can insert customer_tags" ON customer_tags FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can update customer_tags" ON customer_tags FOR UPDATE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin') WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can delete customer_tags" ON customer_tags FOR DELETE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');

-- daily_requirements
DROP POLICY IF EXISTS "Admins can view daily requirements" ON daily_requirements;
DROP POLICY IF EXISTS "Admins can update daily requirements" ON daily_requirements;
DROP POLICY IF EXISTS "Admins can delete daily requirements" ON daily_requirements;
DROP POLICY IF EXISTS "Admins can insert daily requirements" ON daily_requirements;
CREATE POLICY "Admins can view daily requirements" ON daily_requirements FOR SELECT TO authenticated USING ((auth.jwt() ->> 'role') = ANY(ARRAY['admin', 'vendor']));
CREATE POLICY "Admins can insert daily requirements" ON daily_requirements FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can update daily requirements" ON daily_requirements FOR UPDATE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin') WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can delete daily requirements" ON daily_requirements FOR DELETE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');

-- flower_types
DROP POLICY IF EXISTS "Authenticated users can view active flower types" ON flower_types;
DROP POLICY IF EXISTS "Admins can insert flower types" ON flower_types;
DROP POLICY IF EXISTS "Admins can update flower types" ON flower_types;
DROP POLICY IF EXISTS "Admins can delete flower types" ON flower_types;
CREATE POLICY "Authenticated users can view active flower types" ON flower_types FOR SELECT TO authenticated USING (is_active = true OR (auth.jwt() ->> 'role') = ANY(ARRAY['admin', 'vendor']));
CREATE POLICY "Admins can insert flower types" ON flower_types FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can update flower types" ON flower_types FOR UPDATE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin') WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can delete flower types" ON flower_types FOR DELETE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');

-- orders
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
CREATE POLICY "Users can view own orders" ON orders FOR SELECT TO authenticated USING (auth.uid() = user_id OR (auth.jwt() ->> 'role') = 'admin');

-- plan_flower_requirements
DROP POLICY IF EXISTS "Admins can update plan flower requirements" ON plan_flower_requirements;
DROP POLICY IF EXISTS "Admins can delete plan flower requirements" ON plan_flower_requirements;
DROP POLICY IF EXISTS "Admins can insert plan flower requirements" ON plan_flower_requirements;
CREATE POLICY "Admins can insert plan flower requirements" ON plan_flower_requirements FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can update plan flower requirements" ON plan_flower_requirements FOR UPDATE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin') WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can delete plan flower requirements" ON plan_flower_requirements FOR DELETE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');

-- procurement_order_items
DROP POLICY IF EXISTS "Admins and vendors can view procurement order items" ON procurement_order_items;
DROP POLICY IF EXISTS "Admins can insert procurement order items" ON procurement_order_items;
DROP POLICY IF EXISTS "Admins can update procurement order items" ON procurement_order_items;
DROP POLICY IF EXISTS "Admins can delete procurement order items" ON procurement_order_items;
CREATE POLICY "Admins and vendors can view procurement order items" ON procurement_order_items FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin' OR EXISTS (
    SELECT 1 FROM procurement_orders po JOIN vendors v ON v.id = po.vendor_id
    WHERE po.id = procurement_order_items.procurement_order_id AND v.user_id = auth.uid()
  ));
CREATE POLICY "Admins can insert procurement order items" ON procurement_order_items FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can update procurement order items" ON procurement_order_items FOR UPDATE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin') WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can delete procurement order items" ON procurement_order_items FOR DELETE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');

-- procurement_orders
DROP POLICY IF EXISTS "Admins can view all procurement orders" ON procurement_orders;
DROP POLICY IF EXISTS "Admins can insert procurement orders" ON procurement_orders;
DROP POLICY IF EXISTS "Admins can update procurement orders" ON procurement_orders;
DROP POLICY IF EXISTS "Admins can delete procurement orders" ON procurement_orders;
CREATE POLICY "Admins can view all procurement orders" ON procurement_orders FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin' OR EXISTS (SELECT 1 FROM vendors v WHERE v.id = procurement_orders.vendor_id AND v.user_id = auth.uid()));
CREATE POLICY "Admins can insert procurement orders" ON procurement_orders FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can update procurement orders" ON procurement_orders FOR UPDATE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin') WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can delete procurement orders" ON procurement_orders FOR DELETE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');

-- rider_activity_log
DROP POLICY IF EXISTS "Admins can select rider_activity_log" ON rider_activity_log;
DROP POLICY IF EXISTS "Admins can insert rider_activity_log" ON rider_activity_log;
CREATE POLICY "Admins can select rider_activity_log" ON rider_activity_log FOR SELECT TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can insert rider_activity_log" ON rider_activity_log FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- rider_attendance
DROP POLICY IF EXISTS "Admins can select rider_attendance" ON rider_attendance;
DROP POLICY IF EXISTS "Admins can insert rider_attendance" ON rider_attendance;
DROP POLICY IF EXISTS "Admins can update rider_attendance" ON rider_attendance;
DROP POLICY IF EXISTS "Admins can delete rider_attendance" ON rider_attendance;
CREATE POLICY "Admins can select rider_attendance" ON rider_attendance FOR SELECT TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can insert rider_attendance" ON rider_attendance FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can update rider_attendance" ON rider_attendance FOR UPDATE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin') WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can delete rider_attendance" ON rider_attendance FOR DELETE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');

-- rider_leave_requests
DROP POLICY IF EXISTS "Admin can select rider leave" ON rider_leave_requests;
DROP POLICY IF EXISTS "Admin can update rider leave" ON rider_leave_requests;
DROP POLICY IF EXISTS "Admin can delete rider leave" ON rider_leave_requests;
CREATE POLICY "Admin can select rider leave" ON rider_leave_requests FOR SELECT TO authenticated USING ((auth.jwt() ->> 'role') = 'admin' OR rider_id IN (SELECT id FROM riders WHERE profile_id = auth.uid()));
CREATE POLICY "Admin can update rider leave" ON rider_leave_requests FOR UPDATE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin') WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admin can delete rider leave" ON rider_leave_requests FOR DELETE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');

-- rider_order_assignments
DROP POLICY IF EXISTS "Admins can select rider_order_assignments" ON rider_order_assignments;
DROP POLICY IF EXISTS "Admins can insert rider_order_assignments" ON rider_order_assignments;
DROP POLICY IF EXISTS "Admins can update rider_order_assignments" ON rider_order_assignments;
DROP POLICY IF EXISTS "Admins can delete rider_order_assignments" ON rider_order_assignments;
CREATE POLICY "Admins can select rider_order_assignments" ON rider_order_assignments FOR SELECT TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can insert rider_order_assignments" ON rider_order_assignments FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can update rider_order_assignments" ON rider_order_assignments FOR UPDATE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin') WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can delete rider_order_assignments" ON rider_order_assignments FOR DELETE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');

-- rider_payouts
DROP POLICY IF EXISTS "Admins can select rider_payouts" ON rider_payouts;
DROP POLICY IF EXISTS "Admins can insert rider_payouts" ON rider_payouts;
DROP POLICY IF EXISTS "Admins can update rider_payouts" ON rider_payouts;
DROP POLICY IF EXISTS "Admins can delete rider_payouts" ON rider_payouts;
CREATE POLICY "Admins can select rider_payouts" ON rider_payouts FOR SELECT TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can insert rider_payouts" ON rider_payouts FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can update rider_payouts" ON rider_payouts FOR UPDATE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin') WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can delete rider_payouts" ON rider_payouts FOR DELETE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');

-- rider_performance_snapshots
DROP POLICY IF EXISTS "Admins can select rider_performance_snapshots" ON rider_performance_snapshots;
DROP POLICY IF EXISTS "Admins can insert rider_performance_snapshots" ON rider_performance_snapshots;
CREATE POLICY "Admins can select rider_performance_snapshots" ON rider_performance_snapshots FOR SELECT TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can insert rider_performance_snapshots" ON rider_performance_snapshots FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- vendor_payments
DROP POLICY IF EXISTS "Admins can view all vendor payments" ON vendor_payments;
DROP POLICY IF EXISTS "Admins can insert vendor payments" ON vendor_payments;
DROP POLICY IF EXISTS "Admins can update vendor payments" ON vendor_payments;
CREATE POLICY "Admins can view all vendor payments" ON vendor_payments FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin' OR EXISTS (SELECT 1 FROM vendors v WHERE v.id = vendor_payments.vendor_id AND v.user_id = auth.uid()));
CREATE POLICY "Admins can insert vendor payments" ON vendor_payments FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can update vendor payments" ON vendor_payments FOR UPDATE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin') WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- vendors
DROP POLICY IF EXISTS "Admins can view all vendors" ON vendors;
DROP POLICY IF EXISTS "Admins can insert vendors" ON vendors;
DROP POLICY IF EXISTS "Admins can update vendors" ON vendors;
DROP POLICY IF EXISTS "Admins can delete vendors" ON vendors;
CREATE POLICY "Admins can view all vendors" ON vendors FOR SELECT TO authenticated USING ((auth.jwt() ->> 'role') = 'admin' OR user_id = auth.uid());
CREATE POLICY "Admins can insert vendors" ON vendors FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can update vendors" ON vendors FOR UPDATE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin') WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can delete vendors" ON vendors FOR DELETE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');

-- warehouse_receipt_items
DROP POLICY IF EXISTS "Admins can view warehouse receipt items" ON warehouse_receipt_items;
DROP POLICY IF EXISTS "Admins can insert warehouse receipt items" ON warehouse_receipt_items;
DROP POLICY IF EXISTS "Admins can update warehouse receipt items" ON warehouse_receipt_items;
DROP POLICY IF EXISTS "Admins can delete warehouse receipt items" ON warehouse_receipt_items;
CREATE POLICY "Admins can view warehouse receipt items" ON warehouse_receipt_items FOR SELECT TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can insert warehouse receipt items" ON warehouse_receipt_items FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can update warehouse receipt items" ON warehouse_receipt_items FOR UPDATE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin') WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can delete warehouse receipt items" ON warehouse_receipt_items FOR DELETE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');

-- warehouse_receipts
DROP POLICY IF EXISTS "Admins can view warehouse receipts" ON warehouse_receipts;
DROP POLICY IF EXISTS "Admins can insert warehouse receipts" ON warehouse_receipts;
DROP POLICY IF EXISTS "Admins can update warehouse receipts" ON warehouse_receipts;
DROP POLICY IF EXISTS "Admins can delete warehouse receipts" ON warehouse_receipts;
CREATE POLICY "Admins can view warehouse receipts" ON warehouse_receipts FOR SELECT TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can insert warehouse receipts" ON warehouse_receipts FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can update warehouse receipts" ON warehouse_receipts FOR UPDATE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin') WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
CREATE POLICY "Admins can delete warehouse receipts" ON warehouse_receipts FOR DELETE TO authenticated USING ((auth.jwt() ->> 'role') = 'admin');
