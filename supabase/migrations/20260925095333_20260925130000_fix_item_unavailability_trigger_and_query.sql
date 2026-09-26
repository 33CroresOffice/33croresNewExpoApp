/*
# Fix item unavailability notification trigger

## Problem
The `notify_admins_item_unavailable()` trigger called `get_user_modules(p.id)` which
returns `text[]`, but used it directly in a FROM clause: `FROM get_user_modules(p.id) AS m
WHERE m = 'procurement'`. Without `unnest()`, `m` is the entire array (a single row of
type text[]), so comparing `m = 'procurement'` tries to coerce the string 'procurement'
into an array literal, producing: "malformed array literal: \"procurement\"".

## Fix
Wrap the call in `unnest()` so the WHERE clause compares individual text elements:
`FROM unnest(get_user_modules(p.id)) AS m WHERE m = 'procurement'`.

## Security
No schema or policy changes — only the trigger function body is corrected.
*/

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
        SELECT 1 FROM unnest(get_user_modules(p.id)) AS m WHERE m = 'procurement'
      )
  LOOP
    INSERT INTO in_app_notifications (user_id, title, body, event_type)
    VALUES (v_admin.id, v_title, v_body, 'item_unavailable');
  END LOOP;

  RETURN NEW;
END;
$$;