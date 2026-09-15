/*
# Fix Pandit booking notification history writes

1. Purpose
- Fixes Pandit booking creation and status transitions that fail while recording notification history.
- The `notification_logs.triggered_by` column stores a profile UUID, not a text label.

2. Modified functions
- `send_booking_notification(uuid, uuid, text, text, text)` now stores the authenticated actor UUID in `triggered_by`.
- When no authenticated actor exists, the value remains NULL instead of inserting invalid text.

3. Security
- The function remains SECURITY DEFINER with a fixed public search path.
- No new tables, columns, permissions, or data are created.

4. Data safety
- Existing bookings and notification history are not changed or deleted.
*/

CREATE OR REPLACE FUNCTION public.send_booking_notification(
  p_booking_id uuid,
  p_user_id uuid,
  p_event_type text,
  p_title text,
  p_body text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.in_app_notifications
    WHERE user_id = p_user_id
      AND event_type = p_event_type
      AND related_booking_id = p_booking_id
  ) THEN
    INSERT INTO public.in_app_notifications (
      user_id,
      title,
      body,
      event_type,
      related_booking_id,
      is_read,
      read_at
    )
    VALUES (
      p_user_id,
      p_title,
      p_body,
      p_event_type,
      p_booking_id,
      false,
      NULL
    );
  END IF;

  INSERT INTO public.notification_logs (
    user_id,
    event_type,
    channel,
    rendered_subject,
    rendered_body,
    triggered_by
  )
  VALUES (
    p_user_id,
    p_event_type,
    'in_app',
    p_title,
    p_body,
    auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_booking_notification(uuid, uuid, text, text, text) FROM PUBLIC;
