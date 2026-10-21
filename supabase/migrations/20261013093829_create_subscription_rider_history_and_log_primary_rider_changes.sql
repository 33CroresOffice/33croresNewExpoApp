/*
# Log subscription primary-rider changes (fix missing reassignment history)

1. Why
- Reassignments done through Manual Reassign on live orders already keep a full
  trail (original rider, new rider, reason, start/end dates) in
  `rider_order_assignments`.
- Reassignments done by changing a subscription's `primary_rider_id` overwrote
  the previous rider with no record. This migration makes every future
  primary-rider change traceable.

2. New Table: `subscription_rider_history`
- `id` (uuid, primary key, default gen_random_uuid())
- `subscription_id` (uuid, NOT NULL, fk -> subscriptions(id) ON DELETE CASCADE)
- `previous_rider_id` (uuid, nullable, fk -> riders(id) ON DELETE SET NULL) — rider before the change; NULL means none was set
- `new_rider_id` (uuid, NOT NULL, fk -> riders(id) ON DELETE CASCADE) — rider after the change
- `changed_by` (uuid, nullable, fk -> profiles(id) ON DELETE SET NULL) — admin who made the change
- `reason` (text, NOT NULL, default 'Primary rider changed by admin')
- `changed_at` (timestamptz, NOT NULL, default now())
- Index on `subscription_id` for fast per-customer lookups.

3. Security
- RLS enabled.
- SELECT: authenticated users who are admins (JWT app_metadata role = 'admin'), matching the project's existing admin pattern.
- No client INSERT/UPDATE/DELETE: rows are written only by the SECURITY DEFINER function `set_subscription_primary_rider` (service-level), so history cannot be forged.

4. Function change
- `set_subscription_primary_rider(p_subscription_id, p_rider_id)` re-created to
  insert a history row capturing the previous primary rider before updating.
  Backwards compatible: same name, same arguments, same return shape.
*/

-- 1. History table
CREATE TABLE IF NOT EXISTS subscription_rider_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  previous_rider_id uuid REFERENCES riders(id) ON DELETE SET NULL,
  new_rider_id uuid NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT 'Primary rider changed by admin',
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_rider_history_subscription
  ON subscription_rider_history (subscription_id);

ALTER TABLE subscription_rider_history ENABLE ROW LEVEL SECURITY;

-- 2. Admin-only read access via JWT app metadata (project-wide admin pattern)
DROP POLICY IF EXISTS "admin_read_subscription_rider_history" ON subscription_rider_history;
CREATE POLICY "admin_read_subscription_rider_history"
ON subscription_rider_history FOR SELECT
TO authenticated
USING (
  COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  )
);

-- 3. Re-create set_subscription_primary_rider to record the previous rider.
--    Same signature and return shape as before; only adds the history insert.
CREATE OR REPLACE FUNCTION set_subscription_primary_rider(
  p_subscription_id uuid,
  p_rider_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_is_admin boolean;
  v_rider_exists boolean;
  v_previous_rider_id uuid;
  v_reassigned_count integer := 0;
  v_assignment RECORD;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT EXISTS(SELECT 1 FROM riders WHERE id = p_rider_id) INTO v_rider_exists;
  IF NOT v_rider_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rider not found');
  END IF;

  -- Capture the current primary rider before overwriting it
  SELECT primary_rider_id INTO v_previous_rider_id
  FROM subscriptions
  WHERE id = p_subscription_id;

  -- Only log an actual change, and skip when the rider is unchanged
  IF v_previous_rider_id IS DISTINCT FROM p_rider_id THEN
    INSERT INTO subscription_rider_history
      (subscription_id, previous_rider_id, new_rider_id, changed_by, reason)
    VALUES
      (p_subscription_id, v_previous_rider_id, p_rider_id, auth.uid(),
       'Primary rider changed by admin');
  END IF;

  UPDATE subscriptions
  SET primary_rider_id = p_rider_id
  WHERE id = p_subscription_id;

  FOR v_assignment IN
    SELECT roa.id, roa.order_id, roa.rider_id
    FROM rider_order_assignments roa
    JOIN orders o ON o.id = roa.order_id
    WHERE o.subscription_id = p_subscription_id
      AND o.scheduled_date >= CURRENT_DATE
      AND roa.status IN ('assigned', 'accepted')
  LOOP
    UPDATE rider_order_assignments
    SET status = 'reassigned', is_reassigned = true,
        swap_reason = 'Primary rider changed by admin',
        swapped_from_rider_id = v_assignment.rider_id,
        updated_at = now()
    WHERE id = v_assignment.id;

    INSERT INTO rider_order_assignments (rider_id, order_id, status, notes, auto_assigned)
    VALUES (p_rider_id, v_assignment.order_id, 'assigned',
            'Assigned to new primary rider', false);
    v_reassigned_count := v_reassigned_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'primary_rider_id', p_rider_id,
    'previous_rider_id', v_previous_rider_id,
    'future_orders_reassigned', v_reassigned_count
  );
END;
$fn$;
