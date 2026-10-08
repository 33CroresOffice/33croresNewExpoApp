/*
# Notification Module — Self-Declarative Notification Management

## Purpose
Extends the existing notification schema to support a self-declarative notification
management module where admins can see, toggle, and configure all notification types
across three audiences (User App, Vendor, Admin) with per-channel selection
(WhatsApp, Push, In-App).

## Changes

### 1. New columns on `notification_templates`
- `recipient_type` (text, default 'customer') — who receives this notification:
  'customer', 'vendor', or 'admin'. Lets the module filter templates by audience.
- `priority` (text, default 'normal') — urgency level: 'normal', 'high', 'critical'.
  Critical notifications trigger the in-app modal popup and alarm sound.
- `sound_enabled` (boolean, default false) — whether push notifications for this
  template should play an alarm sound. Used for custom order placed, procurement
  order placed, etc.
- `reminder_stage` (text, nullable) — for multi-stage notifications like churn
  reminders (day 5/15/30) and post-expiry reminders (day 1/3/5/10/15/30/90/180).
  Values: 'stage_1', 'stage_2', 'stage_3', 'day_1', 'day_3', 'day_5', 'day_10',
  'day_15', 'day_30', 'day_90', 'day_180', or null for non-staged notifications.

### 2. New columns on `notification_logs`
- `recipient_type` (text, default 'customer') — mirrors the template's recipient_type
  so logs can be filtered by audience.
- `reminder_stage` (text, nullable) — mirrors the template's reminder_stage for
  dedup checking in multi-stage sequences.

### 3. New columns on `in_app_notifications`
- `priority` (text, default 'normal') — 'normal', 'high', 'critical'. Critical
  notifications trigger the in-app modal popup when the app opens.
- `dismissed_at` (timestamp, nullable) — when the user dismissed the modal popup.
  Dismissed notifications stay in the feed but won't reappear as a modal.
- `related_procurement_order_id` (uuid, nullable) — FK to procurement_orders so
  vendor notifications can deep-link to procurement order details.

### 4. New column on `notification_preferences`
- `marketing_enabled` (boolean, default true) — lets customers opt out of marketing
  and special-info notifications while keeping transactional notifications mandatory.

### 5. Event type CHECK constraint expansion
Adds these new event types to the notification_templates event_type CHECK:
- subscription_expiring_5days, subscription_expiring_today
- subscription_expired_1day, subscription_expired_3days, subscription_expired_5days,
  subscription_expired_10days, subscription_expired_15days, subscription_expired_30days,
  subscription_expired_90days, subscription_expired_180days
- subscription_starting_tomorrow, subscription_resuming_tomorrow
- custom_order_placed, custom_order_priced, custom_order_delivered
- special_info, festival_greeting, marketing_promo
- vendor_procurement_order, vendor_payment_received, vendor_welcome
- admin_custom_order_alert, admin_unassigned_alert, admin_rider_no_show,
  admin_vendor_payment_overdue, admin_cron_failure, admin_daily_digest

### 6. Seed default notification templates
Inserts placeholder templates for every notification type defined in the module,
with appropriate recipient_type, channel, priority, sound_enabled, and
reminder_stage values. All seeded templates have is_active=false so the admin
must explicitly enable them.

## Security
- No new tables created; existing RLS policies remain in effect.
- New columns on existing tables inherit existing RLS policies.
- The admin-only `is_notification_admin()` function already controls template
  management; new columns are accessible under the same policies.
*/

-- ============================================================
-- 1. Add columns to notification_templates
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_templates' AND column_name = 'recipient_type'
  ) THEN
    ALTER TABLE notification_templates
      ADD COLUMN recipient_type text NOT NULL DEFAULT 'customer'
      CHECK (recipient_type IN ('customer', 'vendor', 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_templates' AND column_name = 'priority'
  ) THEN
    ALTER TABLE notification_templates
      ADD COLUMN priority text NOT NULL DEFAULT 'normal'
      CHECK (priority IN ('normal', 'high', 'critical'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_templates' AND column_name = 'sound_enabled'
  ) THEN
    ALTER TABLE notification_templates
      ADD COLUMN sound_enabled boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_templates' AND column_name = 'reminder_stage'
  ) THEN
    ALTER TABLE notification_templates
      ADD COLUMN reminder_stage text;
  END IF;
END $$;

-- ============================================================
-- 2. Add columns to notification_logs
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_logs' AND column_name = 'recipient_type'
  ) THEN
    ALTER TABLE notification_logs
      ADD COLUMN recipient_type text NOT NULL DEFAULT 'customer';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_logs' AND column_name = 'reminder_stage'
  ) THEN
    ALTER TABLE notification_logs
      ADD COLUMN reminder_stage text;
  END IF;
END $$;

-- ============================================================
-- 3. Add columns to in_app_notifications
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'in_app_notifications' AND column_name = 'priority'
  ) THEN
    ALTER TABLE in_app_notifications
      ADD COLUMN priority text NOT NULL DEFAULT 'normal'
      CHECK (priority IN ('normal', 'high', 'critical'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'in_app_notifications' AND column_name = 'dismissed_at'
  ) THEN
    ALTER TABLE in_app_notifications
      ADD COLUMN dismissed_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'in_app_notifications' AND column_name = 'related_procurement_order_id'
  ) THEN
    ALTER TABLE in_app_notifications
      ADD COLUMN related_procurement_order_id uuid
      REFERENCES procurement_orders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- 4. Add marketing_enabled to notification_preferences
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_preferences' AND column_name = 'marketing_enabled'
  ) THEN
    ALTER TABLE notification_preferences
      ADD COLUMN marketing_enabled boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- ============================================================
-- 5. Expand event_type CHECK constraint
-- ============================================================

DO $$ BEGIN
  -- Drop and recreate the event_type check constraint with all new types
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_templates_event_type_check'
  ) THEN
    ALTER TABLE notification_templates
      DROP CONSTRAINT notification_templates_event_type_check;
  END IF;

  ALTER TABLE notification_templates
    ADD CONSTRAINT notification_templates_event_type_check CHECK (
      event_type IN (
        -- Existing types
        'subscription_expiring_3days', 'subscription_expiring_1day',
        'subscription_expired', 'subscription_renewed', 'subscription_activated',
        'subscription_paused', 'payment_pending', 'payment_received', 'renewal_due',
        'order_dispatched', 'order_delivered', 'panji_festival_reminder',
        'panji_daily_digest', 'subscription_pending', 'heavy_rainfall',
        'early_delivery', 'booking_request_sent', 'booking_pandit_accepted',
        'booking_awaiting_advance', 'booking_confirmed_customer',
        'booking_confirmed_pandit', 'booking_pandit_on_the_way',
        'booking_pandit_arrived', 'booking_pooja_started',
        'booking_pooja_completed', 'booking_payment_completed_pandit',
        'booking_payment_completed_customer', 'booking_settled',
        'item_unavailable', 'custom',
        -- New pre-expiry types
        'subscription_expiring_5days', 'subscription_expiring_today',
        -- New post-expiry types
        'subscription_expired_1day', 'subscription_expired_3days',
        'subscription_expired_5days', 'subscription_expired_10days',
        'subscription_expired_15days', 'subscription_expired_30days',
        'subscription_expired_90days', 'subscription_expired_180days',
        -- New lifecycle types
        'subscription_starting_tomorrow', 'subscription_resuming_tomorrow',
        -- New custom order types
        'custom_order_placed', 'custom_order_priced', 'custom_order_delivered',
        -- New manual-send types
        'special_info', 'festival_greeting', 'marketing_promo',
        -- New vendor types
        'vendor_procurement_order', 'vendor_payment_received', 'vendor_welcome',
        -- New admin types
        'admin_custom_order_alert', 'admin_unassigned_alert',
        'admin_rider_no_show', 'admin_vendor_payment_overdue',
        'admin_cron_failure', 'admin_daily_digest'
      )
    );
END $$;

-- ============================================================
-- 6. Seed default notification templates
-- ============================================================
-- All templates are seeded with is_active = false.
-- The admin enables them from the notification module UI.
-- Each template is a separate row per channel so the admin
-- can toggle channels independently.

INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body, recipient_type, priority, sound_enabled, reminder_stage, send_at_days_before)
VALUES
  -- ===== USER APP: Onboarding & Churn (3 stages) =====
  ('Churn Reminder — Day 5 (WhatsApp)', 'subscription_pending', 'whatsapp', false, true, null, 'Hi {{customer_name}}, we noticed you haven''t subscribed yet. Start your daily flower delivery today and bring freshness home! Reply STOP to opt out.', 'customer', 'normal', false, 'stage_1', null),
  ('Churn Reminder — Day 5 (Push)', 'subscription_pending', 'push', false, true, 'Don''t miss out on fresh flowers!', 'Hi {{customer_name}}, start your daily flower delivery subscription today.', 'customer', 'normal', false, 'stage_1', null),
  ('Churn Reminder — Day 5 (In-App)', 'subscription_pending', 'in_app', false, true, null, 'Hi {{customer_name}}, we noticed you haven''t subscribed yet. Start your daily flower delivery today!', 'customer', 'normal', false, 'stage_1', null),
  ('Churn Reminder — Day 15 (WhatsApp)', 'subscription_pending', 'whatsapp', false, true, null, 'Hi {{customer_name}}, it''s been a while! Your neighbours are already getting fresh flowers daily. Subscribe now and get started. Reply STOP to opt out.', 'customer', 'normal', false, 'stage_2', null),
  ('Churn Reminder — Day 15 (Push)', 'subscription_pending', 'push', false, true, 'Fresh flowers await you!', 'Hi {{customer_name}}, subscribe now and start your daily flower delivery.', 'customer', 'normal', false, 'stage_2', null),
  ('Churn Reminder — Day 15 (In-App)', 'subscription_pending', 'in_app', false, true, null, 'Hi {{customer_name}}, it''s been a while! Subscribe now to start getting fresh flowers daily.', 'customer', 'normal', false, 'stage_2', null),
  ('Churn Reminder — Day 30 (WhatsApp)', 'subscription_pending', 'whatsapp', false, true, null, 'Hi {{customer_name}, we''d love to have you back. Subscribe to our daily flower delivery and enjoy fresh blooms every morning. Reply STOP to opt out.', 'customer', 'normal', false, 'stage_3', null),
  ('Churn Reminder — Day 30 (Push)', 'subscription_pending', 'push', false, true, 'Last chance to subscribe!', 'Hi {{customer_name}}, subscribe now for daily fresh flower delivery.', 'customer', 'normal', false, 'stage_3', null),
  ('Churn Reminder — Day 30 (In-App)', 'subscription_pending', 'in_app', false, true, null, 'Hi {{customer_name}, we''d love to have you back. Subscribe to start getting fresh flowers daily.', 'customer', 'normal', false, 'stage_3', null),

  -- ===== USER APP: Pre-Expiry Renewal (4 stages) =====
  ('Pre-Expiry — 5 Days Before (WhatsApp)', 'subscription_expiring_5days', 'whatsapp', false, true, null, 'Hi {{customer_name}}, your {{plan_name}} subscription expires on {{end_date}}. Renew now to continue your daily flower delivery without interruption.', 'customer', 'normal', false, null, 5),
  ('Pre-Expiry — 5 Days Before (Push)', 'subscription_expiring_5days', 'push', false, true, 'Subscription expiring in 5 days', 'Hi {{customer_name}}, your {{plan_name}} subscription expires on {{end_date}}. Renew now!', 'customer', 'normal', false, null, 5),
  ('Pre-Expiry — 5 Days Before (In-App)', 'subscription_expiring_5days', 'in_app', false, true, null, 'Your {{plan_name}} subscription expires on {{end_date}}. Renew now to continue your daily flower delivery.', 'customer', 'normal', false, null, 5),
  ('Pre-Expiry — 3 Days Before (WhatsApp)', 'subscription_expiring_3days', 'whatsapp', false, true, null, 'Hi {{customer_name}}, only 3 days left! Your {{plan_name}} subscription expires on {{end_date}}. Renew now to avoid missing your daily flowers.', 'customer', 'normal', false, null, 3),
  ('Pre-Expiry — 3 Days Before (Push)', 'subscription_expiring_3days', 'push', false, true, 'Subscription expiring in 3 days', 'Hi {{customer_name}}, your {{plan_name}} subscription expires on {{end_date}}. Renew now!', 'customer', 'normal', false, null, 3),
  ('Pre-Expiry — 3 Days Before (In-App)', 'subscription_expiring_3days', 'in_app', false, true, null, 'Only 3 days left! Your {{plan_name}} subscription expires on {{end_date}}. Renew now.', 'customer', 'normal', false, null, 3),
  ('Pre-Expiry — 1 Day Before (WhatsApp)', 'subscription_expiring_1day', 'whatsapp', false, true, null, 'Hi {{customer_name}}, your {{plan_name}} subscription expires tomorrow ({{end_date}}). Renew now to keep your daily flowers coming.', 'customer', 'high', false, null, 1),
  ('Pre-Expiry — 1 Day Before (Push)', 'subscription_expiring_1day', 'push', false, true, 'Subscription expires tomorrow!', 'Hi {{customer_name}}, your {{plan_name}} subscription expires tomorrow. Renew now!', 'customer', 'high', false, null, 1),
  ('Pre-Expiry — 1 Day Before (In-App)', 'subscription_expiring_1day', 'in_app', false, true, null, 'Your {{plan_name}} subscription expires tomorrow ({{end_date}}). Renew now to keep your daily flowers coming.', 'customer', 'high', false, null, 1),
  ('Pre-Expiry — Expiry Day (WhatsApp)', 'subscription_expiring_today', 'whatsapp', false, true, null, 'Hi {{customer_name}}, your {{plan_name}} subscription expires today. Renew now to continue your daily flower delivery.', 'customer', 'high', false, null, 0),
  ('Pre-Expiry — Expiry Day (Push)', 'subscription_expiring_today', 'push', false, true, 'Subscription expires today!', 'Hi {{customer_name}}, your {{plan_name}} subscription expires today. Renew now!', 'customer', 'high', false, null, 0),
  ('Pre-Expiry — Expiry Day (In-App)', 'subscription_expiring_today', 'in_app', false, true, null, 'Your {{plan_name}} subscription expires today ({{end_date}}). Renew now to continue your daily flower delivery.', 'customer', 'high', false, null, 0),

  -- ===== USER APP: Post-Expiry Renewal (8 stages) =====
  ('Post-Expiry — Day 1 (WhatsApp)', 'subscription_expired_1day', 'whatsapp', false, true, null, 'Hi {{customer_name}}, your {{plan_name}} subscription expired yesterday. Renew now to resume your daily flower delivery.', 'customer', 'normal', false, 'day_1', null),
  ('Post-Expiry — Day 1 (Push)', 'subscription_expired_1day', 'push', false, true, 'Subscription expired — renew now', 'Hi {{customer_name}}, your {{plan_name}} subscription expired. Renew now!', 'customer', 'normal', false, 'day_1', null),
  ('Post-Expiry — Day 1 (In-App)', 'subscription_expired_1day', 'in_app', false, true, null, 'Your {{plan_name}} subscription expired yesterday. Renew now to resume your daily flower delivery.', 'customer', 'normal', false, 'day_1', null),
  ('Post-Expiry — Day 3 (WhatsApp)', 'subscription_expired_3days', 'whatsapp', false, true, null, 'Hi {{customer_name}}, it''s been 3 days since your {{plan_name}} subscription expired. Renew now to get fresh flowers again.', 'customer', 'normal', false, 'day_3', null),
  ('Post-Expiry — Day 3 (Push)', 'subscription_expired_3days', 'push', false, true, 'Miss your daily flowers?', 'Hi {{customer_name}}, renew your {{plan_name}} subscription to resume deliveries.', 'customer', 'normal', false, 'day_3', null),
  ('Post-Expiry — Day 3 (In-App)', 'subscription_expired_3days', 'in_app', false, true, null, 'It''s been 3 days since your {{plan_name}} subscription expired. Renew now.', 'customer', 'normal', false, 'day_3', null),
  ('Post-Expiry — Day 5 (WhatsApp)', 'subscription_expired_5days', 'whatsapp', false, true, null, 'Hi {{customer_name}}, 5 days without flowers! Renew your {{plan_name}} subscription now and we''ll deliver fresh blooms tomorrow.', 'customer', 'normal', false, 'day_5', null),
  ('Post-Expiry — Day 5 (Push)', 'subscription_expired_5days', 'push', false, true, '5 days without flowers', 'Hi {{customer_name}}, renew your {{plan_name}} subscription to resume deliveries.', 'customer', 'normal', false, 'day_5', null),
  ('Post-Expiry — Day 5 (In-App)', 'subscription_expired_5days', 'in_app', false, true, null, '5 days without flowers! Renew your {{plan_name}} subscription now.', 'customer', 'normal', false, 'day_5', null),
  ('Post-Expiry — Day 10 (WhatsApp)', 'subscription_expired_10days', 'whatsapp', false, true, null, 'Hi {{customer_name}, we miss delivering flowers to you! Renew your {{plan_name}} subscription and get back to fresh daily blooms.', 'customer', 'normal', false, 'day_10', null),
  ('Post-Expiry — Day 10 (Push)', 'subscription_expired_10days', 'push', false, true, 'We miss you!', 'Hi {{customer_name}}, renew your {{plan_name}} subscription to resume daily flowers.', 'customer', 'normal', false, 'day_10', null),
  ('Post-Expiry — Day 10 (In-App)', 'subscription_expired_10days', 'in_app', false, true, null, 'We miss delivering flowers to you! Renew your {{plan_name}} subscription now.', 'customer', 'normal', false, 'day_10', null),
  ('Post-Expiry — Day 15 (WhatsApp)', 'subscription_expired_15days', 'whatsapp', false, true, null, 'Hi {{customer_name}, it''s been 2 weeks. Renew your {{plan_name}} subscription and start fresh with daily flower delivery.', 'customer', 'normal', false, 'day_15', null),
  ('Post-Expiry — Day 15 (In-App)', 'subscription_expired_15days', 'in_app', false, true, null, 'It''s been 2 weeks since your subscription expired. Renew your {{plan_name}} now.', 'customer', 'normal', false, 'day_15', null),
  ('Post-Expiry — Day 30 (WhatsApp)', 'subscription_expired_30days', 'whatsapp', false, true, null, 'Hi {{customer_name}, a month without flowers is too long! Renew your {{plan_name}} subscription today.', 'customer', 'normal', false, 'day_30', null),
  ('Post-Expiry — Day 30 (In-App)', 'subscription_expired_30days', 'in_app', false, true, null, 'A month without flowers! Renew your {{plan_name}} subscription today.', 'customer', 'normal', false, 'day_30', null),
  ('Post-Expiry — Day 90 (WhatsApp)', 'subscription_expired_90days', 'whatsapp', false, true, null, 'Hi {{customer_name}, we''d love to welcome you back! Renew your {{plan_name}} subscription and enjoy fresh flowers daily.', 'customer', 'normal', false, 'day_90', null),
  ('Post-Expiry — Day 90 (In-App)', 'subscription_expired_90days', 'in_app', false, true, null, 'We''d love to welcome you back! Renew your {{plan_name}} subscription and enjoy fresh flowers daily.', 'customer', 'normal', false, 'day_90', null),
  ('Post-Expiry — Day 180 (WhatsApp)', 'subscription_expired_180days', 'whatsapp', false, true, null, 'Hi {{customer_name}, it''s been 6 months! Come back to fresh daily flowers — renew your {{plan_name}} subscription today.', 'customer', 'normal', false, 'day_180', null),
  ('Post-Expiry — Day 180 (In-App)', 'subscription_expired_180days', 'in_app', false, true, null, 'It''s been 6 months! Come back to fresh daily flowers — renew your {{plan_name}} subscription today.', 'customer', 'normal', false, 'day_180', null),

  -- ===== USER APP: Subscription Lifecycle =====
  ('Subscription Activated (WhatsApp)', 'subscription_activated', 'whatsapp', false, true, null, 'Hi {{customer_name}}, your {{plan_name}} subscription is now active! Your first delivery will be on {{first_delivery_date}}. Welcome aboard!', 'customer', 'normal', false, null, null),
  ('Subscription Activated (Push)', 'subscription_activated', 'push', false, true, 'Subscription activated!', 'Hi {{customer_name}}, your {{plan_name}} subscription is now active. First delivery: {{first_delivery_date}}.', 'customer', 'normal', false, null, null),
  ('Subscription Activated (In-App)', 'subscription_activated', 'in_app', false, true, null, 'Your {{plan_name}} subscription is now active! First delivery: {{first_delivery_date}}.', 'customer', 'normal', false, null, null),
  ('Subscription Renewed (WhatsApp)', 'subscription_renewed', 'whatsapp', false, true, null, 'Hi {{customer_name}, your {{plan_name}} subscription has been renewed successfully. Enjoy continued daily flower delivery!', 'customer', 'normal', false, null, null),
  ('Subscription Renewed (Push)', 'subscription_renewed', 'push', false, true, 'Subscription renewed!', 'Hi {{customer_name}}, your {{plan_name}} subscription has been renewed successfully.', 'customer', 'normal', false, null, null),
  ('Subscription Renewed (In-App)', 'subscription_renewed', 'in_app', false, true, null, 'Your {{plan_name}} subscription has been renewed successfully. Enjoy continued daily flower delivery!', 'customer', 'normal', false, null, null),
  ('Subscription Starting Tomorrow (WhatsApp)', 'subscription_starting_tomorrow', 'whatsapp', false, true, null, 'Hi {{customer_name}, your {{plan_name}} subscription starts tomorrow! Get ready for fresh flowers delivered to {{delivery_address}}.', 'customer', 'normal', false, null, null),
  ('Subscription Starting Tomorrow (Push)', 'subscription_starting_tomorrow', 'push', false, true, 'Delivery starts tomorrow!', 'Hi {{customer_name}}, your {{plan_name}} subscription starts tomorrow. Fresh flowers coming your way!', 'customer', 'normal', false, null, null),
  ('Subscription Starting Tomorrow (In-App)', 'subscription_starting_tomorrow', 'in_app', false, true, null, 'Your {{plan_name}} subscription starts tomorrow! Fresh flowers coming your way.', 'customer', 'normal', false, null, null),
  ('Subscription Resuming Tomorrow (WhatsApp)', 'subscription_resuming_tomorrow', 'whatsapp', false, true, null, 'Hi {{customer_name}, your {{plan_name}} subscription pause ends tomorrow. Daily flower delivery will resume on {{resume_date}}.', 'customer', 'normal', false, null, null),
  ('Subscription Resuming Tomorrow (Push)', 'subscription_resuming_tomorrow', 'push', false, true, 'Delivery resumes tomorrow!', 'Hi {{customer_name}}, your {{plan_name}} subscription resumes tomorrow. Fresh flowers coming back!', 'customer', 'normal', false, null, null),
  ('Subscription Resuming Tomorrow (In-App)', 'subscription_resuming_tomorrow', 'in_app', false, true, null, 'Your {{plan_name}} subscription pause ends tomorrow. Daily flower delivery will resume on {{resume_date}}.', 'customer', 'normal', false, null, null),

  -- ===== USER APP: Custom Order =====
  ('Custom Order Priced (Push)', 'custom_order_priced', 'push', false, false, 'Your custom order is priced', 'Hi {{customer_name}, your custom order has been priced at Rs. {{total_price}}. Please complete the payment to confirm your order.', 'customer', 'high', true, null, null),
  ('Custom Order Priced (In-App)', 'custom_order_priced', 'in_app', false, false, null, 'Your custom order has been priced at Rs. {{total_price}}. Please complete the payment to confirm your order.', 'customer', 'high', true, null, null),
  ('Custom Order Delivered (WhatsApp)', 'custom_order_delivered', 'whatsapp', false, false, null, 'Hi {{customer_name}, your custom order has been delivered. Thank you for choosing us!', 'customer', 'normal', false, null, null),
  ('Custom Order Delivered (Push)', 'custom_order_delivered', 'push', false, false, 'Custom order delivered!', 'Hi {{customer_name}}, your custom order has been delivered. Thank you!', 'customer', 'normal', false, null, null),
  ('Custom Order Delivered (In-App)', 'custom_order_delivered', 'in_app', false, false, null, 'Your custom order has been delivered. Thank you for choosing us!', 'customer', 'normal', false, null, null),

  -- ===== USER APP: Festival & Marketing =====
  ('Festival Greeting (WhatsApp)', 'festival_greeting', 'whatsapp', false, false, null, 'Hi {{customer_name}, wishing you and your family a very happy {{festival_name}}! May this festival bring joy and prosperity to your home.', 'customer', 'normal', false, null, null),
  ('Festival Greeting (Push)', 'festival_greeting', 'push', false, false, 'Happy {{festival_name}}!', 'Hi {{customer_name}}, wishing you a very happy {{festival_name}}!', 'customer', 'normal', false, null, null),
  ('Festival Greeting (In-App)', 'festival_greeting', 'in_app', false, false, null, 'Wishing you and your family a very happy {{festival_name}}!', 'customer', 'normal', false, null, null),
  ('Special Info (WhatsApp)', 'special_info', 'whatsapp', false, false, null, 'Hi {{customer_name}, {{info_message}}', 'customer', 'normal', false, null, null),
  ('Special Info (Push)', 'special_info', 'push', false, false, 'Important update', 'Hi {{customer_name}}, {{info_message}}', 'customer', 'normal', false, null, null),
  ('Special Info (In-App)', 'special_info', 'in_app', false, false, null, '{{info_message}}', 'customer', 'normal', false, null, null),
  ('Marketing Promo (WhatsApp)', 'marketing_promo', 'whatsapp', false, false, null, 'Hi {{customer_name}, {{offer_title}}! {{offer_details}}. Valid until {{valid_until}}. Order now!', 'customer', 'normal', false, null, null),
  ('Marketing Promo (Push)', 'marketing_promo', 'push', false, false, '{{offer_title}}', 'Hi {{customer_name}}, {{offer_details}}. Valid until {{valid_until}}.', 'customer', 'normal', false, null, null),
  ('Marketing Promo (In-App)', 'marketing_promo', 'in_app', false, false, null, '{{offer_title}}! {{offer_details}}. Valid until {{valid_until}}.', 'customer', 'normal', false, null, null),

  -- ===== VENDOR NOTIFICATIONS =====
  ('Vendor Procurement Order (Push)', 'vendor_procurement_order', 'push', false, false, 'New procurement order received', 'You have received a new procurement order. Please check the app for details and confirm availability.', 'vendor', 'critical', true, null, null),
  ('Vendor Procurement Order (In-App)', 'vendor_procurement_order', 'in_app', false, false, null, 'You have received a new procurement order. Please check the app for details and confirm availability.', 'vendor', 'critical', true, null, null),
  ('Vendor Payment Received (Push)', 'vendor_payment_received', 'push', false, false, 'Payment received', 'Your payment of Rs. {{amount}} has been received. Thank you for your service.', 'vendor', 'normal', false, null, null),
  ('Vendor Payment Received (In-App)', 'vendor_payment_received', 'in_app', false, false, null, 'Your payment of Rs. {{amount}} has been received. Thank you for your service.', 'vendor', 'normal', false, null, null),
  ('Vendor Welcome (Push)', 'vendor_welcome', 'push', false, false, 'Welcome aboard!', 'Welcome! Your vendor account is now active. You can start receiving procurement orders.', 'vendor', 'normal', false, null, null),
  ('Vendor Welcome (In-App)', 'vendor_welcome', 'in_app', false, false, null, 'Welcome! Your vendor account is now active. You can start receiving procurement orders.', 'vendor', 'normal', false, null, null),

  -- ===== ADMIN NOTIFICATIONS =====
  ('Admin Custom Order Alert (Push)', 'admin_custom_order_alert', 'push', false, false, 'New custom order received', 'A new custom order has been placed by {{customer_name}}. Please review and set the price.', 'admin', 'critical', true, null, null),
  ('Admin Custom Order Alert (In-App)', 'admin_custom_order_alert', 'in_app', false, false, null, 'A new custom order has been placed by {{customer_name}}. Please review and set the price.', 'admin', 'critical', true, null, null),
  ('Admin Unassigned Order Alert (In-App)', 'admin_unassigned_alert', 'in_app', false, true, null, 'There are {{count}} orders scheduled for today with no rider assigned. Please assign riders immediately.', 'admin', 'high', false, null, null),
  ('Admin Rider No-Show (In-App)', 'admin_rider_no_show', 'in_app', false, true, null, 'Rider {{rider_name}} has not checked in by the cutoff time for today''s deliveries.', 'admin', 'high', false, null, null),
  ('Admin Vendor Payment Overdue (In-App)', 'admin_vendor_payment_overdue', 'in_app', false, true, null, 'Vendor {{vendor_name}} has a payment overdue of Rs. {{amount}}. Please process the payment.', 'admin', 'normal', false, null, null),
  ('Admin Cron Failure (In-App)', 'admin_cron_failure', 'in_app', false, true, null, 'Cron job {{job_name}} failed to run successfully. Please check the cron monitor.', 'admin', 'high', false, null, null),
  ('Admin Daily Digest (In-App)', 'admin_daily_digest', 'in_app', false, true, null, 'Daily Operations Summary: {{unassigned_count}} unassigned orders, {{pending_payments}} pending vendor payments, {{rider_absent}} absent riders.', 'admin', 'normal', false, null, null)
ON CONFLICT DO NOTHING;
