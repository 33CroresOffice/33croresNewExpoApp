export type UserRole = 'customer' | 'admin' | 'vendor' | 'rider';
export type AdminRole = 'super_admin' | 'finance' | 'operations' | 'crm' | 'catalog';

export interface CustomRole {
  id: string;
  name: string;
  description: string;
  color: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
export type OtpChannel = 'sms' | 'whatsapp';
export type NotificationChannel = 'sms' | 'whatsapp' | 'push' | 'in_app';
export type NotificationEventType =
  | 'subscription_expiring_3days'
  | 'subscription_expiring_1day'
  | 'subscription_expired'
  | 'subscription_renewed'
  | 'subscription_activated'
  | 'subscription_paused'
  | 'payment_pending'
  | 'payment_received'
  | 'renewal_due'
  | 'order_dispatched'
  | 'order_delivered'
  | 'panji_festival_reminder'
  | 'panji_daily_digest'
  | 'subscription_pending'
  | 'heavy_rainfall'
  | 'early_delivery'
  | 'booking_request_sent'
  | 'booking_pandit_accepted'
  | 'booking_awaiting_advance'
  | 'booking_confirmed_customer'
  | 'booking_confirmed_pandit'
  | 'booking_pandit_on_the_way'
  | 'booking_pandit_arrived'
  | 'booking_pooja_started'
  | 'booking_pooja_completed'
  | 'booking_payment_completed_pandit'
  | 'booking_payment_completed_customer'
  | 'booking_settled'
  | 'custom';

export interface PanjiEntry {
  id: string;
  date: string;
  odia_date: string;
  odia_month: string;
  odia_year: number;
  tithi: string;
  nakshatra: string;
  yoga: string;
  karana: string;
  vara: string;
  sunrise: string;
  sunset: string;
  auspicious_timings: string[];
  festivals: string[];
  description: string;
  is_published: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}
export type NotificationLogStatus = 'pending' | 'sent' | 'failed' | 'skipped';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled' | 'expired' | 'renewed';
export type RenewalStatus = 'none' | 'notified' | 'expired' | 'renewed';
export type OrderStatus = 'scheduled' | 'out_for_delivery' | 'delivered' | 'failed';
export type PaymentStatus = 'pending' | 'success' | 'failed' | 'refunded';
export type DeliveryFrequency = 'weekly' | 'biweekly' | 'monthly' | '3months' | '6months';
export type UnitType = 'kg' | 'grams' | 'pieces' | 'bunch' | 'stems' | 'dozen' | 'ml' | 'litre' | 'packet' | 'tray' | 'box' | 'meter';
export type ProcurementOrderStatus = 'draft' | 'sent' | 'accepted' | 'fulfilled' | 'paid' | 'cancelled';
export type DailyRequirementStatus = 'pending' | 'ordered' | 'fulfilled';
export type ProcurementBatchStatus = 'draft' | 'approved' | 'pushed';
export type VendorPaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'cheque';
export type VendorPaymentStatus = 'pending' | 'completed' | 'failed';
export type WarehouseReceiptStatus = 'complete' | 'partial' | 'rejected';

export interface Profile {
  id: string;
  mobile: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  admin_role: AdminRole | null;
  custom_role_id: string | null;
  is_verified: boolean;
  notification_sms: boolean;
  notification_whatsapp: boolean;
  notification_module_access: boolean;
  email: string | null;
  date_of_birth: string | null;
  gender: string | null;
  about: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  event_type: NotificationEventType;
  channel: NotificationChannel;
  is_active: boolean;
  is_automated: boolean;
  subject: string | null;
  body: string;
  msg91_template_id: string | null;
  msg91_whatsapp_template_id: string | null;
  msg91_whatsapp_namespace: string | null;
  send_at_days_before: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationLog {
  id: string;
  user_id: string | null;
  event_type: NotificationEventType;
  channel: NotificationChannel;
  template_id: string | null;
  recipient_mobile: string | null;
  recipient_push_token: string | null;
  rendered_subject: string | null;
  rendered_body: string;
  status: NotificationLogStatus;
  provider_response: Record<string, unknown> | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  subscription_id: string | null;
  order_id: string | null;
  triggered_by: string | null;
  created_at: string;
  user?: Pick<Profile, 'id' | 'full_name' | 'mobile'>;
  triggered_by_profile?: Pick<Profile, 'id' | 'full_name'>;
}

export type ProviderBookingStatus =
  | 'request_sent'
  | 'pandit_accepted'
  | 'awaiting_advance_payment'
  | 'booking_confirmed'
  | 'pandit_on_the_way'
  | 'pandit_arrived'
  | 'pooja_in_progress'
  | 'pooja_completed'
  | 'payment_completed'
  | 'settled'
  | 'declined'
  | 'cancelled';

export interface InAppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  event_type: NotificationEventType;
  is_read: boolean;
  read_at: string | null;
  related_subscription_id: string | null;
  related_order_id: string | null;
  related_booking_id: string | null;
  created_at: string;
}

export interface NotificationPreferences {
  user_id: string;
  push_enabled: boolean;
  in_app_enabled: boolean;
  updated_at: string;
}

export interface ExpoPushToken {
  user_id: string;
  token: string;
  platform: 'ios' | 'android' | 'unknown';
  updated_at: string;
}

export interface OtpRequest {
  id: string;
  mobile: string;
  channel: OtpChannel;
  expires_at: string;
  is_used: boolean;
  created_at: string;
}

export interface FlowerType {
  id: string;
  name: string;
  display_name: string;
  unit_type: UnitType;
  description: string | null;
  image_url: string | null;
  available_months: number[] | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PlanFlowerRequirement {
  id: string;
  plan_id: string;
  flower_type_id: string;
  quantity_per_delivery: number;
  unit_type: UnitType;
  flower_type?: FlowerType;
}

export type ProductType = 'flower' | 'pooja';

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  mrp_price: number;
  frequency: DeliveryFrequency;
  image_url: string | null;
  is_active: boolean;
  features: string[];
  deliveries_per_month: number;
  sort_order: number;
  show_in_customer_plans: boolean;
  product_type: ProductType;
  supports_one_time: boolean;
  created_at: string;
  flower_requirements?: PlanFlowerRequirement[];
  pooja_items?: PlanPoojaItem[];
}

export interface PoojaItemCategory {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PoojaItem {
  id: string;
  name: string;
  description: string;
  unit_type: string;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  category_id: string | null;
  created_at: string;
  updated_at: string;
  category?: PoojaItemCategory | null;
}

export interface PlanPoojaItem {
  plan_id: string;
  pooja_item_id: string;
  quantity_per_delivery: number;
  unit_type: string;
  pooja_item?: PoojaItem;
}

export type PoojaOrderStatus = 'pending' | 'confirmed' | 'paid' | 'out_for_delivery' | 'delivered' | 'cancelled';
export type PoojaOrderPaymentStatus = 'unpaid' | 'pending' | 'paid';

export interface PoojaOrder {
  id: string;
  user_id: string;
  plan_id: string;
  delivery_date: string;
  delivery_time: string;
  address_id: string | null;
  special_instructions: string | null;
  status: PoojaOrderStatus;
  payment_status: PoojaOrderPaymentStatus;
  price: number;
  delivery_price: number;
  total_price: number;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  plan?: SubscriptionPlan;
  address?: Address;
}

export interface Address {
  id: string;
  user_id: string;
  label: string;
  street: string;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
  landmark: string | null;
  apartment_name: string | null;
  place_category: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  start_date: string;
  end_date: string | null;
  new_end_date: string | null;
  next_delivery_date: string | null;
  pause_until: string | null;
  pause_start_date: string | null;
  delivery_address_id: string;
  renewal_status: RenewalStatus;
  renewal_notified_at: string | null;
  renewed_from_subscription_id: string | null;
  created_at: string;
  plan?: SubscriptionPlan;
  delivery_address?: Address;
}

export interface Order {
  id: string;
  subscription_id: string;
  user_id: string;
  scheduled_date: string;
  status: OrderStatus;
  delivered_at: string | null;
  admin_note: string | null;
  created_at: string;
  subscription?: Subscription;
}

export interface Payment {
  id: string;
  user_id: string;
  subscription_id: string | null;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  amount: number;
  status: PaymentStatus;
  created_at: string;
}

export interface Vendor {
  id: string;
  user_id: string | null;
  business_name: string | null;
  contact_person: string | null;
  mobile: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  gstin: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_account_name: string | null;
  upi_id: string | null;
  google_maps_url: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyRequirement {
  id: string;
  requirement_date: string;
  flower_type_id: string;
  total_quantity: number;
  unit_type: UnitType | null;
  active_subscriptions_count: number;
  custom_orders_count: number;
  status: DailyRequirementStatus;
  procurement_order_id: string | null;
  notes: string | null;
  batch_id: string | null;
  original_flower_type_id: string | null;
  substituted: boolean;
  generated_at: string;
  updated_at: string;
  flower_type?: FlowerType;
  original_flower_type?: FlowerType;
}

export interface FlowerAvailability {
  id: string;
  flower_type_id: string;
  unavailable_from: string;
  unavailable_to: string;
  alternate_flower_type_id: string | null;
  alternate_quantity: number | null;
  alternate_unit_type: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  flower_type?: FlowerType;
  alternate_flower_type?: FlowerType;
}

export interface ProcurementBatch {
  id: string;
  batch_number: string;
  requirement_date: string;
  status: ProcurementBatchStatus;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  items?: ProcurementBatchItem[];
}

export interface ProcurementBatchItem {
  id: string;
  batch_id: string;
  flower_type_id: string;
  quantity: number;
  unit_type: string | null;
  original_flower_type_id: string | null;
  vendor_id: string | null;
  procurement_order_id: string | null;
  created_at: string;
  flower_type?: FlowerType;
  original_flower_type?: FlowerType;
  vendor?: Vendor;
}

export interface ProcurementOrder {
  id: string;
  order_number: string;
  vendor_id: string;
  order_date: string | null;
  requirement_date: string | null;
  status: ProcurementOrderStatus;
  total_amount: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  vendor?: Vendor;
  items?: ProcurementOrderItem[];
}

export interface ProcurementOrderItem {
  id: string;
  procurement_order_id: string;
  flower_type_id: string;
  quantity: number;
  unit_type: UnitType | null;
  price_per_unit: number | null;
  total_price: number | null;
  price_set_by: 'vendor' | 'rider' | null;
  created_at: string;
  flower_type?: FlowerType;
}

export interface VendorFlower {
  id: string;
  vendor_id: string;
  flower_type_id: string;
  unit_type: UnitType | null;
  price_per_unit: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  flower_type?: FlowerType;
}

export interface VendorPayment {
  id: string;
  procurement_order_id: string;
  vendor_id: string;
  amount: number;
  payment_date: string;
  payment_method: VendorPaymentMethod;
  transaction_id: string | null;
  status: VendorPaymentStatus;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
  procurement_order?: ProcurementOrder;
}

export interface WarehouseReceipt {
  id: string;
  procurement_order_id: string;
  received_by: string | null;
  received_at: string;
  status: WarehouseReceiptStatus;
  notes: string | null;
  created_at: string;
  items?: WarehouseReceiptItem[];
}

export type CustomOrderType = 'flower' | 'garland';
export type CustomOrderStatus = 'pending' | 'confirmed' | 'paid' | 'out_for_delivery' | 'delivered' | 'cancelled';

export interface CustomOrderItem {
  flower_name: string;
  quantity: string;
  unit: string;
}

export interface GarlandOrderItem {
  flower_name: string;
  garland_count: string;
  measure_type: 'flower_count' | 'garland_size';
  flower_count?: string;
  garland_size?: string;
}

export type CustomOrderPaymentStatus = 'unpaid' | 'pending' | 'paid';

export interface CustomOrder {
  id: string;
  user_id: string;
  order_type: CustomOrderType;
  items: CustomOrderItem[];
  delivery_date: string;
  delivery_time: string;
  address_id: string | null;
  special_instructions: string | null;
  status: CustomOrderStatus;
  admin_note: string | null;
  flower_price: number;
  delivery_price: number;
  total_price: number;
  payment_status: CustomOrderPaymentStatus;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  prices_set_at: string | null;
  created_at: string;
  updated_at: string;
  address?: Address;
}

export interface SubscriptionRenewalHistory {
  id: string;
  original_subscription_id: string | null;
  new_subscription_id: string | null;
  user_id: string;
  plan_id: string | null;
  renewed_at: string;
  old_end_date: string | null;
  new_start_date: string | null;
  new_end_date: string | null;
  amount_paid: number | null;
  razorpay_payment_id: string | null;
  created_at: string;
  plan?: SubscriptionPlan;
}

export interface WarehouseReceiptItem {
  id: string;
  warehouse_receipt_id: string;
  flower_type_id: string;
  ordered_quantity: number;
  received_quantity: number;
  unit_type: UnitType | null;
  has_discrepancy: boolean;
  notes: string | null;
  flower_type?: FlowerType;
}

export interface DeliveryFailureTracking {
  id: string;
  subscription_id: string;
  address_id: string | null;
  consecutive_failures: number;
  last_failure_date: string | null;
  last_failure_reason: string | null;
  auto_paused: boolean;
  auto_paused_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VendorPaymentAuto {
  id: string;
  vendor_id: string;
  procurement_order_id: string;
  amount: number;
  status: 'pending' | 'approved' | 'paid';
  generated_at: string;
  approved_at: string | null;
  paid_at: string | null;
}

export interface AutomationRunLog {
  id: string;
  automation_name: string;
  run_date: string;
  status: 'success' | 'failed' | 'partial';
  summary: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

export interface DailyOpsSummary {
  id: string;
  summary_date: string;
  total_orders: number;
  assigned_orders: number;
  unassigned_orders: number;
  delivered_orders: number;
  failed_orders: number;
  total_riders: number;
  active_riders: number;
  riders_on_leave: number;
  no_show_riders: number;
  total_procurement_orders: number;
  pending_procurement_orders: number;
  active_subscriptions: number;
  expired_subscriptions: number;
  auto_paused_subscriptions: number;
  alerts: Array<{ severity: string; message: string }>;
  created_at: string;
}

// ─── Pandit Pooja Setup Types ──────────────────────────────────────────────────

export interface PoojaType {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderPoojaSetup {
  id: string;
  provider_id: string;
  pooja_type_id: string;
  description: string;
  duration_minutes: number;
  service_fee: number;
  language: string;
  special_instructions: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  pooja_type?: PoojaType;
  items?: ProviderPoojaItem[];
}

export interface ProviderPoojaItem {
  id: string;
  pooja_setup_id: string;
  pooja_item_id: string;
  quantity: number;
  created_at: string;
  pooja_item?: PoojaItem;
}

export type PoojaTypeRequestStatus = 'pending' | 'approved' | 'rejected';

export interface PoojaTypeRequest {
  id: string;
  provider_id: string;
  requested_name: string;
  requested_description: string;
  status: PoojaTypeRequestStatus;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface PoojaListShare {
  id: string;
  provider_id: string;
  pooja_setup_id: string;
  customer_mobile: string;
  share_token: string;
  expires_at: string;
  is_revoked: boolean;
  created_at: string;
}
