/*
# Item Unavailability and Reassignment Schema

## Summary
Adds tables and policies to let vendors and riders mark individual procurement
order items as unavailable (before the rider clicks "Picked Up"), and to let
admins reassign those items to another vendor or substitute flower.

## New Tables

### item_unavailability
Records each reported unavailable item.
- procurement_order_item_id (uuid, FK) — the item flagged unavailable
- procurement_order_id (uuid, FK) — denormalized for efficient querying
- requirement_date (date) — denormalized for the Daily Requirements page
- flower_type_id (uuid, FK) — denormalized for display
- reported_by (uuid, FK profiles) — who reported it
- reporter_role (text) — 'vendor' | 'rider'
- reason (text, optional) — why the item is unavailable
- status (text) — 'pending' | 'reassigned' | 'resolved'
- created_at (timestamptz)

### item_reassignments
Tracks admin reassignment actions for unavailable items.
- unavailability_id (uuid, FK) — the item_unavailability record
- original_vendor_id (uuid, FK vendors)
- replacement_vendor_id (uuid, FK vendors)
- replacement_flower_type_id (uuid, FK flower_types)
- replacement_quantity (numeric)
- replacement_unit_type (text)
- replacement_procurement_order_id (uuid, FK)
- reassigned_by (uuid, FK profiles)
- created_at (timestamptz)

## Security
- RLS enabled on both tables.
- Vendors can insert/read unavailability records for their own orders' items.
- Riders can insert/read unavailability records for orders assigned to them.
- Admins can read, insert, and update both tables.
- A trigger blocks inserting unavailability records once the parent order is 'fulfilled'.
- A trigger on insert creates in-app notifications for all admin users with procurement access.

## Notes
1. The `item_unavailable` notification event type is added to the notification_templates CHECK constraint.
2. The trigger checks procurement_orders.status != 'fulfilled' before allowing an insert.
3. The notification trigger inserts one in_app_notification per admin with procurement access.
*/

-- ═════════════════════════════════════════════════════════════════════════════
-- Add 'item_unavailable' to notification_templates event_type CHECK
-- ═════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_templates_event_type_check'
      AND pg_get_constraintdef(oid)::text LIKE '%item_unavailable%'
  ) THEN
    ALTER TABLE notification_templates DROP CONSTRAINT IF EXISTS notification_templates_event_type_check;
    ALTER TABLE notification_templates ADD CONSTRAINT notification_templates_event_type_check
      CHECK (event_type = ANY (ARRAY[
        'subscription_expiring_3days',
        'subscription_expiring_1day',
        'subscription_expired',
        'subscription_renewed',
        'subscription_activated',
        'subscription_paused',
        'payment_pending',
        'payment_received',
        'renewal_due',
        'order_dispatched',
        'order_delivered',
        'panji_festival_reminder',
        'panji_daily_digest',
        'subscription_pending',
        'heavy_rainfall',
        'early_delivery',
        'booking_request_sent',
        'booking_pandit_accepted',
        'booking_awaiting_advance',
        'booking_confirmed_customer',
        'booking_confirmed_pandit',
        'booking_pandit_on_the_way',
        'booking_pandit_arrived',
        'booking_pooja_started',
        'booking_pooja_completed',
        'booking_payment_completed_pandit',
        'booking_payment_completed_customer',
        'booking_settled',
        'item_unavailable',
        'custom'
      ]));
  END IF;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- item_unavailability table
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS item_unavailability (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procurement_order_item_id uuid NOT NULL REFERENCES procurement_order_items(id) ON DELETE CASCADE,
  procurement_order_id      uuid NOT NULL REFERENCES procurement_orders(id) ON DELETE CASCADE,
  requirement_date          date,
  flower_type_id            uuid REFERENCES flower_types(id) ON DELETE SET NULL,
  reported_by               uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reporter_role             text NOT NULL CHECK (reporter_role IN ('vendor', 'rider')),
  reason                    text,
  status                    text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reassigned', 'resolved')),
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_item_unavailability_order ON item_unavailability(procurement_order_id);
CREATE INDEX IF NOT EXISTS idx_item_unavailability_date ON item_unavailability(requirement_date);
CREATE INDEX IF NOT EXISTS idx_item_unavailability_status ON item_unavailability(status);

ALTER TABLE item_unavailability ENABLE ROW LEVEL SECURITY;

-- Admin policies
DROP POLICY IF EXISTS "Admin can view item_unavailability" ON item_unavailability;
CREATE POLICY "Admin can view item_unavailability"
  ON item_unavailability FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admin can insert item_unavailability" ON item_unavailability;
CREATE POLICY "Admin can insert item_unavailability"
  ON item_unavailability FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admin can update item_unavailability" ON item_unavailability;
CREATE POLICY "Admin can update item_unavailability"
  ON item_unavailability FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admin can delete item_unavailability" ON item_unavailability;
CREATE POLICY "Admin can delete item_unavailability"
  ON item_unavailability FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Vendor can read unavailability for their own orders
DROP POLICY IF EXISTS "Vendor can view own item_unavailability" ON item_unavailability;
CREATE POLICY "Vendor can view own item_unavailability"
  ON item_unavailability FOR SELECT
  TO authenticated
  USING (
    procurement_order_id IN (
      SELECT po.id FROM procurement_orders po
      JOIN vendors v ON v.id = po.vendor_id
      WHERE v.user_id = auth.uid()
    )
  );

-- Vendor can insert unavailability for their own orders' items
DROP POLICY IF EXISTS "Vendor can insert own item_unavailability" ON item_unavailability;
CREATE POLICY "Vendor can insert own item_unavailability"
  ON item_unavailability FOR INSERT
  TO authenticated
  WITH CHECK (
    procurement_order_id IN (
      SELECT po.id FROM procurement_orders po
      JOIN vendors v ON v.id = po.vendor_id
      WHERE v.user_id = auth.uid()
    )
  );

-- Rider can read unavailability for orders assigned to them
DROP POLICY IF EXISTS "Rider can view own item_unavailability" ON item_unavailability;
CREATE POLICY "Rider can view own item_unavailability"
  ON item_unavailability FOR SELECT
  TO authenticated
  USING (
    procurement_order_id IN (
      SELECT po.id FROM procurement_orders po
      WHERE po.pickup_rider_id IN (
        SELECT id FROM riders WHERE profile_id = auth.uid()
      )
    )
  );

-- Rider can insert unavailability for orders assigned to them
DROP POLICY IF EXISTS "Rider can insert own item_unavailability" ON item_unavailability;
CREATE POLICY "Rider can insert own item_unavailability"
  ON item_unavailability FOR INSERT
  TO authenticated
  WITH CHECK (
    procurement_order_id IN (
      SELECT po.id FROM procurement_orders po
      WHERE po.pickup_rider_id IN (
        SELECT id FROM riders WHERE profile_id = auth.uid()
      )
    )
  );

-- ═════════════════════════════════════════════════════════════════════════════
-- item_reassignments table
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS item_reassignments (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unavailability_id               uuid NOT NULL REFERENCES item_unavailability(id) ON DELETE CASCADE,
  original_vendor_id              uuid REFERENCES vendors(id) ON DELETE SET NULL,
  replacement_vendor_id            uuid NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  replacement_flower_type_id       uuid NOT NULL REFERENCES flower_types(id) ON DELETE RESTRICT,
  replacement_quantity             numeric(10,2) NOT NULL DEFAULT 1,
  replacement_unit_type            text,
  replacement_procurement_order_id uuid REFERENCES procurement_orders(id) ON DELETE SET NULL,
  reassigned_by                    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at                       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_item_reassignments_unavailability ON item_reassignments(unavailability_id);

ALTER TABLE item_reassignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can view item_reassignments" ON item_reassignments;
CREATE POLICY "Admin can view item_reassignments"
  ON item_reassignments FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admin can insert item_reassignments" ON item_reassignments;
CREATE POLICY "Admin can insert item_reassignments"
  ON item_reassignments FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admin can update item_reassignments" ON item_reassignments;
CREATE POLICY "Admin can update item_reassignments"
  ON item_reassignments FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ═════════════════════════════════════════════════════════════════════════════
-- Trigger: block unavailability insert if order is fulfilled
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION check_item_unavailability_before_pickup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_status text;
BEGIN
  SELECT status INTO v_order_status
  FROM procurement_orders
  WHERE id = NEW.procurement_order_id;

  IF v_order_status = 'fulfilled' THEN
    RAISE EXCEPTION 'Cannot mark item unavailable after order has been picked up';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_unavailability_after_pickup ON item_unavailability;
CREATE TRIGGER trg_block_unavailability_after_pickup
  BEFORE INSERT ON item_unavailability
  FOR EACH ROW EXECUTE FUNCTION check_item_unavailability_before_pickup();

-- ═════════════════════════════════════════════════════════════════════════════
-- Trigger: notify admins on item unavailability insert
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION notify_admins_item_unavailable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flower_name text;
  v_order_number text;
  v_admin RECORD;
  v_title text;
  v_body text;
BEGIN
  SELECT display_name INTO v_flower_name
  FROM flower_types
  WHERE id = NEW.flower_type_id;

  SELECT order_number INTO v_order_number
  FROM procurement_orders
  WHERE id = NEW.procurement_order_id;

  v_title := 'Item Unavailable: ' || COALESCE(v_flower_name, 'Unknown flower');
  v_body := COALESCE(v_flower_name, 'An item') || ' on order ' || COALESCE(v_order_number, '?') || ' was marked unavailable by ' || NEW.reporter_role;

  FOR v_admin IN
    SELECT p.id FROM profiles p
    WHERE p.role = 'admin'
      AND EXISTS (
        SELECT 1 FROM get_user_modules(p.id) AS m WHERE m = 'procurement'
      )
  LOOP
    INSERT INTO in_app_notifications (user_id, title, body, event_type)
    VALUES (v_admin.id, v_title, v_body, 'item_unavailable');
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_item_unavailable ON item_unavailability;
CREATE TRIGGER trg_notify_admins_item_unavailable
  AFTER INSERT ON item_unavailability
  FOR EACH ROW EXECUTE FUNCTION notify_admins_item_unavailable();