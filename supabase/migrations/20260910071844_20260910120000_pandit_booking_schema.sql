/*
# Pandit Booking Status Flow - Part 1: Schema changes

1. Drop old status constraint
2. Backfill existing statuses
3. Add new status constraint
4. Add related_booking_id to in_app_notifications
5. Drop old event_type check on notification_templates, add new one with booking events
6. Seed notification templates
*/

-- 1. Drop old constraint FIRST
ALTER TABLE provider_bookings DROP CONSTRAINT IF EXISTS provider_bookings_status_check;

-- 2. Backfill existing statuses
UPDATE provider_bookings SET status = 'request_sent' WHERE status = 'pending';
UPDATE provider_bookings SET status = 'awaiting_advance_payment' WHERE status = 'accepted';
UPDATE provider_bookings SET status = 'booking_confirmed' WHERE status = 'confirmed';
UPDATE provider_bookings SET status = 'payment_completed' WHERE status = 'completed';

-- 3. Add new status constraint
ALTER TABLE provider_bookings ADD CONSTRAINT provider_bookings_status_check CHECK (
  status IN (
    'request_sent',
    'pandit_accepted',
    'awaiting_advance_payment',
    'booking_confirmed',
    'pandit_on_the_way',
    'pandit_arrived',
    'pooja_in_progress',
    'pooja_completed',
    'payment_completed',
    'settled',
    'declined',
    'cancelled'
  )
);

-- 4. Add related_booking_id to in_app_notifications
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='in_app_notifications' AND column_name='related_booking_id'
  ) THEN
    ALTER TABLE in_app_notifications ADD COLUMN related_booking_id uuid REFERENCES provider_bookings(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 5. Expand event_type check constraint on notification_templates
ALTER TABLE notification_templates DROP CONSTRAINT IF EXISTS notification_templates_event_type_check;
ALTER TABLE notification_templates ADD CONSTRAINT notification_templates_event_type_check CHECK (
  event_type IN (
    'subscription_expiring_3days', 'subscription_expiring_1day', 'subscription_expired',
    'subscription_renewed', 'subscription_activated', 'subscription_paused', 'subscription_pending',
    'payment_pending', 'payment_received', 'renewal_due',
    'order_dispatched', 'order_delivered',
    'panji_festival_reminder', 'panji_daily_digest',
    'heavy_rainfall', 'early_delivery', 'custom',
    'booking_request_sent', 'booking_pandit_accepted', 'booking_awaiting_advance',
    'booking_confirmed_customer', 'booking_confirmed_pandit',
    'booking_pandit_on_the_way', 'booking_pandit_arrived',
    'booking_pooja_started', 'booking_pooja_completed',
    'booking_payment_completed_pandit', 'booking_payment_completed_customer',
    'booking_settled'
  )
);

-- 6. Seed notification templates for booking events
DO $$
BEGIN
  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Booking Request Sent (Push)', 'booking_request_sent', 'push', true, false, 'New Pooja Booking Request', 'You have received a new Pooja booking request.')
  ON CONFLICT DO NOTHING;
  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Booking Request Sent (In-App)', 'booking_request_sent', 'in_app', true, false, 'New Pooja Booking Request', 'You have received a new Pooja booking request.')
  ON CONFLICT DO NOTHING;

  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Booking Accepted (Push)', 'booking_pandit_accepted', 'push', true, false, 'Booking Request Accepted', 'Your booking request has been accepted by the Pandit.')
  ON CONFLICT DO NOTHING;
  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Booking Accepted (In-App)', 'booking_pandit_accepted', 'in_app', true, false, 'Booking Request Accepted', 'Your booking request has been accepted by the Pandit.')
  ON CONFLICT DO NOTHING;

  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Awaiting Advance (Push)', 'booking_awaiting_advance', 'push', true, false, 'Advance Payment Required', 'Please complete the advance payment to confirm your booking.')
  ON CONFLICT DO NOTHING;
  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Awaiting Advance (In-App)', 'booking_awaiting_advance', 'in_app', true, false, 'Advance Payment Required', 'Please complete the advance payment to confirm your booking.')
  ON CONFLICT DO NOTHING;

  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Booking Confirmed Customer (Push)', 'booking_confirmed_customer', 'push', true, false, 'Booking Confirmed', 'Your Pooja booking has been confirmed.')
  ON CONFLICT DO NOTHING;
  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Booking Confirmed Customer (In-App)', 'booking_confirmed_customer', 'in_app', true, false, 'Booking Confirmed', 'Your Pooja booking has been confirmed.')
  ON CONFLICT DO NOTHING;

  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Booking Confirmed Pandit (Push)', 'booking_confirmed_pandit', 'push', true, false, 'Advance Payment Completed', 'The advance payment has been completed and the booking is confirmed.')
  ON CONFLICT DO NOTHING;
  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Booking Confirmed Pandit (In-App)', 'booking_confirmed_pandit', 'in_app', true, false, 'Advance Payment Completed', 'The advance payment has been completed and the booking is confirmed.')
  ON CONFLICT DO NOTHING;

  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Pandit On The Way (Push)', 'booking_pandit_on_the_way', 'push', true, false, 'Pandit On The Way', 'Your Pandit is on the way.')
  ON CONFLICT DO NOTHING;
  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Pandit On The Way (In-App)', 'booking_pandit_on_the_way', 'in_app', true, false, 'Pandit On The Way', 'Your Pandit is on the way.')
  ON CONFLICT DO NOTHING;

  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Pandit Arrived (Push)', 'booking_pandit_arrived', 'push', true, false, 'Pandit Arrived', 'Your Pandit has arrived at the location.')
  ON CONFLICT DO NOTHING;
  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Pandit Arrived (In-App)', 'booking_pandit_arrived', 'in_app', true, false, 'Pandit Arrived', 'Your Pandit has arrived at the location.')
  ON CONFLICT DO NOTHING;

  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Pooja Started (Push)', 'booking_pooja_started', 'push', true, false, 'Pooja Started', 'Your Pooja has started.')
  ON CONFLICT DO NOTHING;
  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Pooja Started (In-App)', 'booking_pooja_started', 'in_app', true, false, 'Pooja Started', 'Your Pooja has started.')
  ON CONFLICT DO NOTHING;

  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Pooja Completed (Push)', 'booking_pooja_completed', 'push', true, false, 'Pooja Completed', 'Your Pooja has been completed. Please complete the remaining payment.')
  ON CONFLICT DO NOTHING;
  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Pooja Completed (In-App)', 'booking_pooja_completed', 'in_app', true, false, 'Pooja Completed', 'Your Pooja has been completed. Please complete the remaining payment.')
  ON CONFLICT DO NOTHING;

  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Payment Completed Pandit (Push)', 'booking_payment_completed_pandit', 'push', true, false, 'Final Payment Completed', 'The final payment for the booking has been completed.')
  ON CONFLICT DO NOTHING;
  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Payment Completed Pandit (In-App)', 'booking_payment_completed_pandit', 'in_app', true, false, 'Final Payment Completed', 'The final payment for the booking has been completed.')
  ON CONFLICT DO NOTHING;

  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Payment Completed Customer (Push)', 'booking_payment_completed_customer', 'push', true, false, 'Payment Successful', 'Your payment has been completed successfully.')
  ON CONFLICT DO NOTHING;
  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Payment Completed Customer (In-App)', 'booking_payment_completed_customer', 'in_app', true, false, 'Payment Successful', 'Your payment has been completed successfully.')
  ON CONFLICT DO NOTHING;

  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Booking Settled (Push)', 'booking_settled', 'push', true, false, 'Payment Settled', 'The payment for this booking has been settled successfully.')
  ON CONFLICT DO NOTHING;
  INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body)
  VALUES ('Booking Settled (In-App)', 'booking_settled', 'in_app', true, false, 'Payment Settled', 'The payment for this booking has been settled successfully.')
  ON CONFLICT DO NOTHING;
END $$;
