import { NotificationEventType, NotificationRecipientType } from '@/types/database';

export type NotificationCategory =
  | 'onboarding_churn'
  | 'pre_expiry'
  | 'post_expiry'
  | 'subscription_lifecycle'
  | 'custom_order'
  | 'festival_marketing'
  | 'vendor'
  | 'admin';

export interface NotificationDefinition {
  eventType: NotificationEventType;
  title: string;
  description: string;
  category: NotificationCategory;
  recipientType: NotificationRecipientType;
  channels: ('whatsapp' | 'push' | 'in_app')[];
  hasSound?: boolean;
  isAutomated?: boolean;
  reminderStage?: string;
  sendAtDaysBefore?: number;
  variables: string[];
}

export const NOTIFICATION_CATEGORIES: Record<NotificationRecipientType, { id: NotificationCategory; label: string; description: string }[]> = {
  customer: [
    { id: 'onboarding_churn', label: 'Onboarding & Churn', description: 'Remind customers who signed up but never subscribed' },
    { id: 'pre_expiry', label: 'Pre-Expiry Renewal', description: 'Reminders before a subscription expires' },
    { id: 'post_expiry', label: 'Post-Expiry Renewal', description: 'Reminders after a subscription has expired' },
    { id: 'subscription_lifecycle', label: 'Subscription Lifecycle', description: 'Activation, renewal, pause-resume events' },
    { id: 'custom_order', label: 'Custom Order', description: 'Notifications for custom flower/garland orders' },
    { id: 'festival_marketing', label: 'Festival & Marketing', description: 'Greetings, special info, and promotional offers' },
  ],
  vendor: [
    { id: 'vendor', label: 'Vendor Notifications', description: 'Procurement orders, payments, and welcome' },
  ],
  admin: [
    { id: 'admin', label: 'Admin Alerts', description: 'Operational alerts for admins' },
  ],
};

export const NOTIFICATION_DEFINITIONS: NotificationDefinition[] = [
  // ===== ONBOARDING & CHURN =====
  {
    eventType: 'subscription_pending',
    title: 'Churn Reminder — Day 5',
    description: 'Sent 5 days after a customer creates an account but hasn\'t subscribed yet',
    category: 'onboarding_churn',
    recipientType: 'customer',
    channels: ['whatsapp', 'push', 'in_app'],
    isAutomated: true,
    reminderStage: 'stage_1',
    variables: ['{{customer_name}}'],
  },
  {
    eventType: 'subscription_pending',
    title: 'Churn Reminder — Day 15',
    description: 'Sent 15 days after signup if the customer still hasn\'t subscribed',
    category: 'onboarding_churn',
    recipientType: 'customer',
    channels: ['whatsapp', 'push', 'in_app'],
    isAutomated: true,
    reminderStage: 'stage_2',
    variables: ['{{customer_name}}'],
  },
  {
    eventType: 'subscription_pending',
    title: 'Churn Reminder — Day 30',
    description: 'Final churn reminder, 30 days after signup with no subscription',
    category: 'onboarding_churn',
    recipientType: 'customer',
    channels: ['whatsapp', 'push', 'in_app'],
    isAutomated: true,
    reminderStage: 'stage_3',
    variables: ['{{customer_name}}'],
  },

  // ===== PRE-EXPIRY =====
  {
    eventType: 'subscription_expiring_5days',
    title: 'Pre-Expiry — 5 Days Before',
    description: 'Sent 5 days before the subscription end date',
    category: 'pre_expiry',
    recipientType: 'customer',
    channels: ['whatsapp', 'push', 'in_app'],
    isAutomated: true,
    sendAtDaysBefore: 5,
    variables: ['{{customer_name}}', '{{plan_name}}', '{{end_date}}', '{{amount}}'],
  },
  {
    eventType: 'subscription_expiring_3days',
    title: 'Pre-Expiry — 3 Days Before',
    description: 'Sent 3 days before the subscription end date',
    category: 'pre_expiry',
    recipientType: 'customer',
    channels: ['whatsapp', 'push', 'in_app'],
    isAutomated: true,
    sendAtDaysBefore: 3,
    variables: ['{{customer_name}}', '{{plan_name}}', '{{end_date}}', '{{amount}}'],
  },
  {
    eventType: 'subscription_expiring_1day',
    title: 'Pre-Expiry — 1 Day Before',
    description: 'Sent 1 day before the subscription end date',
    category: 'pre_expiry',
    recipientType: 'customer',
    channels: ['whatsapp', 'push', 'in_app'],
    isAutomated: true,
    sendAtDaysBefore: 1,
    variables: ['{{customer_name}}', '{{plan_name}}', '{{end_date}}', '{{amount}}'],
  },
  {
    eventType: 'subscription_expiring_today',
    title: 'Pre-Expiry — Expiry Day',
    description: 'Sent on the day the subscription expires',
    category: 'pre_expiry',
    recipientType: 'customer',
    channels: ['whatsapp', 'push', 'in_app'],
    isAutomated: true,
    sendAtDaysBefore: 0,
    variables: ['{{customer_name}}', '{{plan_name}}', '{{end_date}}', '{{amount}}'],
  },

  // ===== POST-EXPIRY =====
  {
    eventType: 'subscription_expired_1day',
    title: 'Post-Expiry — Day 1',
    description: 'Sent 1 day after the subscription has expired',
    category: 'post_expiry',
    recipientType: 'customer',
    channels: ['whatsapp', 'push', 'in_app'],
    isAutomated: true,
    reminderStage: 'day_1',
    variables: ['{{customer_name}}', '{{plan_name}}'],
  },
  {
    eventType: 'subscription_expired_3days',
    title: 'Post-Expiry — Day 3',
    description: 'Sent 3 days after the subscription has expired',
    category: 'post_expiry',
    recipientType: 'customer',
    channels: ['whatsapp', 'push', 'in_app'],
    isAutomated: true,
    reminderStage: 'day_3',
    variables: ['{{customer_name}}', '{{plan_name}}'],
  },
  {
    eventType: 'subscription_expired_5days',
    title: 'Post-Expiry — Day 5',
    description: 'Sent 5 days after the subscription has expired',
    category: 'post_expiry',
    recipientType: 'customer',
    channels: ['whatsapp', 'push', 'in_app'],
    isAutomated: true,
    reminderStage: 'day_5',
    variables: ['{{customer_name}}', '{{plan_name}}'],
  },
  {
    eventType: 'subscription_expired_10days',
    title: 'Post-Expiry — Day 10',
    description: 'Sent 10 days after the subscription has expired',
    category: 'post_expiry',
    recipientType: 'customer',
    channels: ['whatsapp', 'push', 'in_app'],
    isAutomated: true,
    reminderStage: 'day_10',
    variables: ['{{customer_name}}', '{{plan_name}}'],
  },
  {
    eventType: 'subscription_expired_15days',
    title: 'Post-Expiry — Day 15',
    description: 'Sent 15 days after the subscription has expired',
    category: 'post_expiry',
    recipientType: 'customer',
    channels: ['whatsapp', 'in_app'],
    isAutomated: true,
    reminderStage: 'day_15',
    variables: ['{{customer_name}}', '{{plan_name}}'],
  },
  {
    eventType: 'subscription_expired_30days',
    title: 'Post-Expiry — Day 30',
    description: 'Sent 30 days after the subscription has expired',
    category: 'post_expiry',
    recipientType: 'customer',
    channels: ['whatsapp', 'in_app'],
    isAutomated: true,
    reminderStage: 'day_30',
    variables: ['{{customer_name}}', '{{plan_name}}'],
  },
  {
    eventType: 'subscription_expired_90days',
    title: 'Post-Expiry — Day 90',
    description: 'Sent 90 days (3 months) after the subscription has expired',
    category: 'post_expiry',
    recipientType: 'customer',
    channels: ['whatsapp', 'in_app'],
    isAutomated: true,
    reminderStage: 'day_90',
    variables: ['{{customer_name}}', '{{plan_name}}'],
  },
  {
    eventType: 'subscription_expired_180days',
    title: 'Post-Expiry — Day 180',
    description: 'Sent 180 days (6 months) after the subscription has expired',
    category: 'post_expiry',
    recipientType: 'customer',
    channels: ['whatsapp', 'in_app'],
    isAutomated: true,
    reminderStage: 'day_180',
    variables: ['{{customer_name}}', '{{plan_name}}'],
  },

  // ===== SUBSCRIPTION LIFECYCLE =====
  {
    eventType: 'subscription_activated',
    title: 'Subscription Activated',
    description: 'Sent when a subscription is activated (auto or manually by admin)',
    category: 'subscription_lifecycle',
    recipientType: 'customer',
    channels: ['whatsapp', 'push', 'in_app'],
    isAutomated: true,
    variables: ['{{customer_name}}', '{{plan_name}}', '{{first_delivery_date}}'],
  },
  {
    eventType: 'subscription_renewed',
    title: 'Subscription Renewed',
    description: 'Sent when a subscription is successfully renewed',
    category: 'subscription_lifecycle',
    recipientType: 'customer',
    channels: ['whatsapp', 'push', 'in_app'],
    isAutomated: true,
    variables: ['{{customer_name}}', '{{plan_name}}'],
  },
  {
    eventType: 'subscription_starting_tomorrow',
    title: 'Delivery Starting Tomorrow',
    description: 'Sent the day before the first delivery of a new subscription',
    category: 'subscription_lifecycle',
    recipientType: 'customer',
    channels: ['whatsapp', 'push', 'in_app'],
    isAutomated: true,
    variables: ['{{customer_name}}', '{{plan_name}}', '{{delivery_address}}'],
  },
  {
    eventType: 'subscription_resuming_tomorrow',
    title: 'Pause Resuming Tomorrow',
    description: 'Sent the day before a paused subscription resumes delivery',
    category: 'subscription_lifecycle',
    recipientType: 'customer',
    channels: ['whatsapp', 'push', 'in_app'],
    isAutomated: true,
    variables: ['{{customer_name}}', '{{plan_name}}', '{{resume_date}}'],
  },

  // ===== CUSTOM ORDER =====
  {
    eventType: 'custom_order_priced',
    title: 'Custom Order Priced',
    description: 'Sent to the customer when the admin sets the price for a custom order. Plays a sound alert.',
    category: 'custom_order',
    recipientType: 'customer',
    channels: ['push', 'in_app'],
    hasSound: true,
    variables: ['{{customer_name}}', '{{total_price}}'],
  },
  {
    eventType: 'custom_order_delivered',
    title: 'Custom Order Delivered',
    description: 'Sent to the customer when their custom order has been delivered',
    category: 'custom_order',
    recipientType: 'customer',
    channels: ['whatsapp', 'push', 'in_app'],
    variables: ['{{customer_name}}'],
  },

  // ===== FESTIVAL & MARKETING =====
  {
    eventType: 'festival_greeting',
    title: 'Festival Greeting',
    description: 'Festival greeting sent to customers on special occasions (Diwali, Ganesh Puja, etc.)',
    category: 'festival_marketing',
    recipientType: 'customer',
    channels: ['whatsapp', 'push', 'in_app'],
    variables: ['{{customer_name}}', '{{festival_name}}'],
  },
  {
    eventType: 'special_info',
    title: 'Special Information',
    description: 'One-time informational broadcast to customers (e.g., service changes, holiday schedules)',
    category: 'festival_marketing',
    recipientType: 'customer',
    channels: ['whatsapp', 'push', 'in_app'],
    variables: ['{{customer_name}}', '{{info_message}}'],
  },
  {
    eventType: 'marketing_promo',
    title: 'Marketing Promotion',
    description: 'Promotional offers and discounts. Customers can opt out of this category.',
    category: 'festival_marketing',
    recipientType: 'customer',
    channels: ['whatsapp', 'push', 'in_app'],
    variables: ['{{customer_name}}', '{{offer_title}}', '{{offer_details}}', '{{valid_until}}'],
  },

  // ===== VENDOR =====
  {
    eventType: 'vendor_procurement_order',
    title: 'Procurement Order Placed',
    description: 'Sent to the vendor when admin places a procurement order. Plays an alarm sound.',
    category: 'vendor',
    recipientType: 'vendor',
    channels: ['push', 'in_app'],
    hasSound: true,
    variables: [],
  },
  {
    eventType: 'vendor_payment_received',
    title: 'Payment Received',
    description: 'Sent to the vendor when a payment has been recorded by the admin',
    category: 'vendor',
    recipientType: 'vendor',
    channels: ['push', 'in_app'],
    variables: ['{{amount}}'],
  },
  {
    eventType: 'vendor_welcome',
    title: 'Vendor Welcome',
    description: 'Sent when a vendor account is first created',
    category: 'vendor',
    recipientType: 'vendor',
    channels: ['push', 'in_app'],
    variables: [],
  },

  // ===== ADMIN =====
  {
    eventType: 'admin_custom_order_alert',
    title: 'Custom Order Placed',
    description: 'Alerts the admin when a customer places a custom order. Plays an alarm sound.',
    category: 'admin',
    recipientType: 'admin',
    channels: ['push', 'in_app'],
    hasSound: true,
    variables: ['{{customer_name}}'],
  },
  {
    eventType: 'admin_unassigned_alert',
    title: 'Unassigned Order Alert',
    description: 'Alerts the admin when orders scheduled for today have no rider assigned',
    category: 'admin',
    recipientType: 'admin',
    channels: ['in_app'],
    isAutomated: true,
    variables: ['{{count}}'],
  },
  {
    eventType: 'admin_rider_no_show',
    title: 'Rider No-Show',
    description: 'Alerts the admin when a rider hasn\'t checked in by the cutoff time',
    category: 'admin',
    recipientType: 'admin',
    channels: ['in_app'],
    isAutomated: true,
    variables: ['{{rider_name}}'],
  },
  {
    eventType: 'admin_vendor_payment_overdue',
    title: 'Vendor Payment Overdue',
    description: 'Alerts the admin when a vendor payment is overdue',
    category: 'admin',
    recipientType: 'admin',
    channels: ['in_app'],
    isAutomated: true,
    variables: ['{{vendor_name}}', '{{amount}}'],
  },
  {
    eventType: 'admin_cron_failure',
    title: 'Cron Job Failure',
    description: 'Alerts the admin when a scheduled cron job fails',
    category: 'admin',
    recipientType: 'admin',
    channels: ['in_app'],
    isAutomated: true,
    variables: ['{{job_name}}'],
  },
  {
    eventType: 'admin_daily_digest',
    title: 'Daily Operations Digest',
    description: 'Morning summary of key operational metrics for admins',
    category: 'admin',
    recipientType: 'admin',
    channels: ['in_app'],
    isAutomated: true,
    variables: ['{{unassigned_count}}', '{{pending_payments}}', '{{rider_absent}}'],
  },
];

export const CHANNEL_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  whatsapp: { label: 'WhatsApp', color: '#2E7D32', bg: '#E8F5E9', icon: 'MessageCircle' },
  push: { label: 'Push', color: '#E65100', bg: '#FFF3E0', icon: 'Bell' },
  in_app: { label: 'In-App', color: '#6A1B9A', bg: '#F3E5F5', icon: 'Smartphone' },
  sms: { label: 'SMS', color: '#1565C0', bg: '#E3F2FD', icon: 'MessageSquare' },
};

export const RECIPIENT_TYPE_LABELS: Record<NotificationRecipientType, string> = {
  customer: 'User App',
  vendor: 'Vendor',
  admin: 'Admin',
};
