import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Truck,
  CircleCheck as CheckCircle,
  Clock,
  CircleX as XCircle,
  PackageOpen,
  Calendar,
  ChevronRight,
  Phone,
  User,
  Sparkles,
  ChevronDown,
  Check,
} from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Skeleton } from '@/components/ui/SkeletonLoader';
import { addDays, format, parseISO } from 'date-fns';
import { getEffectiveStatus } from '@/utils/subscriptionStatus';

const C = Colors;

type Tab = 'subscription' | 'customize';

/* ---------- Subscription ---------- */
type DeliveryAssignment = {
  order_id?: string | null;
  custom_order_id?: string | null;
  status: string;
  rider: { full_name: string; mobile: string } | null;
  delivered_at: string | null;
};

type SubDelivery = {
  id: string;
  subscription_id: string;
  scheduled_date: string;
  status: string;
  delivered_at: string | null;
  isSynthetic?: boolean;
  subscription: {
    plan: { name: string; price: number; image_url: string | null } | null;
  } | null;
  assignments: DeliveryAssignment[];
};

type ActiveSubscription = {
  id: string;
  start_date: string;
  end_date: string | null;
  new_end_date: string | null;
  status: string;
  pause_start_date: string | null;
  pause_until: string | null;
  created_at?: string;
  plan: { name: string; price: number; image_url: string | null; frequency: string } | null;
};

type PausePeriod = {
  pause_start_date: string;
  pause_until: string;
  resumed_at: string | null;
  is_cancelled: boolean;
};

/* ---------- Customize ---------- */
type CustomDelivery = {
  id: string;
  order_type: string;
  items: { flower_name: string; quantity: string; unit: string }[];
  delivery_date: string;
  status: string;
  delivered_at: string | null;
  total_price: number;
  assignments: {
    status: string;
    rider: { full_name: string; mobile: string } | null;
    delivered_at: string | null;
  }[];
};

const SUB_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  scheduled: {
    label: 'Scheduled',
    color: '#1D6FA4',
    bg: '#E8F4FD',
    icon: <Clock size={13} color="#1D6FA4" strokeWidth={2} />,
  },
  out_for_delivery: {
    label: 'Out for Delivery',
    color: C.accent,
    bg: C.accentSurface,
    icon: <Truck size={13} color={C.accent} strokeWidth={2} />,
  },
  delivered: {
    label: 'Delivered',
    color: C.success,
    bg: C.successSurface,
    icon: <CheckCircle size={13} color={C.success} strokeWidth={2} />,
  },
  failed: {
    label: 'Failed',
    color: C.error,
    bg: C.errorSurface,
    icon: <XCircle size={13} color={C.error} strokeWidth={2} />,
  },
  paused: {
    label: 'Paused',
    color: C.textTertiary,
    bg: C.neutral[100],
    icon: <Clock size={13} color={C.textTertiary} strokeWidth={2} />,
  },
};

const CUSTOM_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending: {
    label: 'Pending',
    color: '#1D6FA4',
    bg: '#E8F4FD',
    icon: <Clock size={13} color="#1D6FA4" strokeWidth={2} />,
  },
  confirmed: {
    label: 'Confirmed',
    color: '#1D6FA4',
    bg: '#E8F4FD',
    icon: <Clock size={13} color="#1D6FA4" strokeWidth={2} />,
  },
  paid: {
    label: 'Paid',
    color: C.primary,
    bg: C.primarySurface,
    icon: <CheckCircle size={13} color={C.primary} strokeWidth={2} />,
  },
  out_for_delivery: {
    label: 'Out for Delivery',
    color: C.accent,
    bg: C.accentSurface,
    icon: <Truck size={13} color={C.accent} strokeWidth={2} />,
  },
  delivered: {
    label: 'Delivered',
    color: C.success,
    bg: C.successSurface,
    icon: <CheckCircle size={13} color={C.success} strokeWidth={2} />,
  },
  cancelled: {
    label: 'Cancelled',
    color: C.error,
    bg: C.errorSurface,
    icon: <XCircle size={13} color={C.error} strokeWidth={2} />,
  },
};

function StatusBadge({ status, config }: { status: string; config: typeof SUB_STATUS_CONFIG }) {
  const cfg = config[status] ?? {
    label: status,
    color: C.textTertiary,
    bg: C.neutral[100],
    icon: <Clock size={13} color={C.textTertiary} strokeWidth={2} />,
  };
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      {cfg.icon}
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function RiderInfo({ rider, deliveredAt }: { rider: { full_name: string; mobile: string } | null; deliveredAt: string | null }) {
  if (!rider) return null;
  return (
    <View style={styles.riderBox}>
      <View style={styles.riderRow}>
        <User size={11} color={C.textTertiary} strokeWidth={1.8} />
        <Text style={styles.riderName} numberOfLines={1}>{rider.full_name}</Text>
      </View>
      <View style={styles.riderRow}>
        <Phone size={11} color={C.textTertiary} strokeWidth={1.8} />
        <Text style={styles.riderPhone}>{rider.mobile}</Text>
      </View>
      {deliveredAt && (
        <View style={styles.riderRow}>
          <CheckCircle size={11} color={C.success} strokeWidth={1.8} />
          <Text style={[styles.riderDelivered, { color: C.success }]}>
            {format(new Date(deliveredAt), 'dd MMM, hh:mm a')}
          </Text>
        </View>
      )}
    </View>
  );
}

function formatPrice(paise: number) {
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

function getCustomOrderName(items: { flower_name: string; quantity: string; unit: string }[], orderType: string) {
  if (!items || items.length === 0) return orderType === 'garland' ? 'Custom Garland' : 'Custom Flowers';
  const names = items.map((i) => i.flower_name).filter(Boolean);
  if (names.length === 0) return orderType === 'garland' ? 'Custom Garland' : 'Custom Flowers';
  return names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '');
}

function effectiveStatus(orderStatus: string, assignments: { status: string }[] | undefined): string {
  if (assignments?.some((a) => a.status === 'delivered')) return 'delivered';
  if (assignments?.some((a) => a.status === 'failed')) return 'failed';
  return orderStatus;
}

function isPausedOn(date: string, periods: PausePeriod[]): boolean {
  return periods.some((period) => {
    if (period.is_cancelled) return false;
    if (period.pause_start_date > date) return false;
    if (period.resumed_at && period.resumed_at < period.pause_until) {
      return date < period.resumed_at;
    }
    return date <= period.pause_until;
  });
}

function isExcludedDate(date: string, periods: PausePeriod[]): boolean {
  return isPausedOn(date, periods);
}

function buildSubscriptionDeliveries(
  subscription: ActiveSubscription,
  orders: SubDelivery[],
  pausePeriods: PausePeriod[],
): SubDelivery[] {
  const today = format(new Date(), 'yyyy-MM-dd');
  const startDate = format(parseISO(subscription.start_date), 'yyyy-MM-dd');
  const endDate = subscription.new_end_date ?? subscription.end_date;
  const upperBound = endDate && endDate < today ? endDate : today;
  const maxOrderDate = orders.length > 0
    ? orders.map(o => o.scheduled_date).sort().reverse()[0]
    : null;
  const extendedBound = maxOrderDate && maxOrderDate > upperBound ? maxOrderDate : upperBound;
  const orderByDate = new Map<string, SubDelivery>();
  for (const order of orders) orderByDate.set(order.scheduled_date, order);

  const deliveries: SubDelivery[] = [];
  let date = parseISO(subscription.start_date);
  while (format(date, 'yyyy-MM-dd') <= extendedBound) {
    const dateString = format(date, 'yyyy-MM-dd');
    if (dateString < startDate) { date = addDays(date, 1); continue; }
    const order = orderByDate.get(dateString);
    if (dateString > today && !order) { date = addDays(date, 1); continue; }
    const paused = isExcludedDate(dateString, pausePeriods);
    const orderStatus = paused
      ? 'paused'
      : order?.status === 'scheduled'
        ? 'out_for_delivery'
        : order
          ? effectiveStatus(order.status, order.assignments)
          : 'out_for_delivery';
    deliveries.push(order
      ? { ...order, status: orderStatus }
      : {
          id: `delivery-${subscription.id}-${dateString}`,
          subscription_id: subscription.id,
          scheduled_date: dateString,
          status: orderStatus,
          delivered_at: null,
          isSynthetic: true,
          subscription: { plan: subscription.plan },
          assignments: [],
        });
    date = addDays(date, 1);
  }

  return deliveries.reverse();
}

/* ---------- Subscription Card ---------- */
function SubscriptionCard({ delivery }: { delivery: SubDelivery }) {
  const planName = delivery.subscription?.plan?.name ?? 'Subscription';
  const price = delivery.subscription?.plan?.price ?? 0;
  const scheduledDate = parseISO(delivery.scheduled_date);
  const assignment = delivery.assignments?.[0];
  const rider = assignment?.rider;
  const deliveredAt = assignment?.delivered_at ?? delivery.delivered_at;
  const effStatus = delivery.status;
  const isPaused = effStatus === 'paused';
  const hasRider = !!(rider || assignment);
  const isClickable = !isPaused && !delivery.isSynthetic && (effStatus === 'out_for_delivery' || hasRider);

  const cardContent = (
    <>
      <View style={styles.dateCol}>
        <Text style={styles.dateDay}>{format(scheduledDate, 'dd')}</Text>
        <Text style={styles.dateMon}>{format(scheduledDate, 'MMM')}</Text>
        <Text style={styles.dateYear}>{format(scheduledDate, 'yyyy')}</Text>
      </View>

      <View style={styles.dividerVert} />

      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <Text style={styles.planName} numberOfLines={1}>{planName}</Text>
          {price > 0 && <Text style={styles.priceText}>{formatPrice(price)}</Text>}
        </View>

        <View style={styles.metaRow}>
          <Calendar size={11} color={C.textTertiary} strokeWidth={1.8} />
          <Text style={styles.metaText}>{format(scheduledDate, 'EEEE, dd MMM yyyy')}</Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.dayLabel}>Day: {format(scheduledDate, 'EEEE')}</Text>
        </View>

        <RiderInfo rider={rider ?? null} deliveredAt={deliveredAt ?? null} />

        <StatusBadge status={effStatus} config={SUB_STATUS_CONFIG} />
      </View>

      {isClickable && <ChevronRight size={16} color={C.neutral[400]} strokeWidth={1.8} />}
    </>
  );

  if (!isClickable) {
    return <View style={[styles.card, styles.cardDisabled]}>{cardContent}</View>;
  }

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => router.push({ pathname: '/(customer)/order-detail', params: { id: delivery.id, selectedDate: delivery.scheduled_date } })}
    >
      {cardContent}
    </TouchableOpacity>
  );
}

/* ---------- Custom Order Card ---------- */
function CustomCard({ delivery }: { delivery: CustomDelivery }) {
  const orderName = getCustomOrderName(delivery.items, delivery.order_type);
  const scheduledDate = parseISO(delivery.delivery_date);
  const assignment = delivery.assignments?.[0];
  const rider = assignment?.rider;
  const deliveredAt = assignment?.delivered_at ?? delivery.delivered_at;
  const effStatus = effectiveStatus(delivery.status, delivery.assignments);

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => router.push({ pathname: '/(customer)/custom-order-detail', params: { id: delivery.id } })}
    >
      <View style={styles.dateCol}>
        <Text style={styles.dateDay}>{format(scheduledDate, 'dd')}</Text>
        <Text style={styles.dateMon}>{format(scheduledDate, 'MMM')}</Text>
        <Text style={styles.dateYear}>{format(scheduledDate, 'yyyy')}</Text>
      </View>

      <View style={styles.dividerVert} />

      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <Text style={styles.planName} numberOfLines={1}>{orderName}</Text>
          {delivery.total_price > 0 && <Text style={styles.priceText}>{formatPrice(delivery.total_price)}</Text>}
        </View>

        <View style={styles.metaRow}>
          <Calendar size={11} color={C.textTertiary} strokeWidth={1.8} />
          <Text style={styles.metaText}>{format(scheduledDate, 'EEEE, dd MMM yyyy')}</Text>
        </View>

        <RiderInfo rider={rider ?? null} deliveredAt={deliveredAt ?? null} />

        <StatusBadge status={effStatus} config={CUSTOM_STATUS_CONFIG} />
      </View>

      <ChevronRight size={16} color={C.neutral[400]} strokeWidth={1.8} />
    </TouchableOpacity>
  );
}

/* ---------- Activation Summary Card ---------- */
function ActivationCard({ subscription, pausePeriods }: { subscription: ActiveSubscription; pausePeriods: PausePeriod[] }) {
  const plan = subscription.plan;
  const planName = plan?.name ?? 'Subscription';
  const price = plan?.price ?? 0;
  const frequency = plan?.frequency ?? 'monthly';
  const startDate = parseISO(subscription.start_date);
  const endDate = subscription.new_end_date
    ? parseISO(subscription.new_end_date)
    : subscription.end_date
      ? parseISO(subscription.end_date)
      : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const effectiveStatus = getEffectiveStatus(subscription as any);
  const isPaused = effectiveStatus === 'paused';
  const isScheduledPause = effectiveStatus === 'scheduled_pause';
  const statusLabel = isPaused ? 'Paused' : isScheduledPause ? 'Pause Scheduled' : 'Active';
  const statusColor = (isPaused || isScheduledPause) ? C.warning : C.success;
  const statusBg = (isPaused || isScheduledPause) ? '#FEF3C7' : C.successSurface;

  const daysActive = (() => {
    const endBound = endDate && endDate < today ? endDate : today;
    let count = 0;
    let d = parseISO(subscription.start_date);
    while (d <= endBound) {
      const ds = format(d, 'yyyy-MM-dd');
      if (!isExcludedDate(ds, pausePeriods)) count++;
      d = addDays(d, 1);
    }
    return count;
  })();

  return (
    <View style={styles.activationCard}>
      <View style={styles.activationHeader}>
        <View style={styles.activationIconWrap}>
          <Sparkles size={18} color={C.primary} strokeWidth={2} />
        </View>
        <View style={styles.activationHeaderText}>
          <Text style={styles.activationTitle} numberOfLines={1}>{planName}</Text>
          <Text style={styles.activationSub}>Latest subscription</Text>
        </View>
        <View style={[styles.activationStatus, { backgroundColor: statusBg }]}>
          <Text style={[styles.activationStatusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      <View style={styles.activationBody}>
        <View style={styles.activationMetric}>
          <Text style={styles.activationMetricValue}>{format(startDate, 'dd MMM yyyy')}</Text>
          <Text style={styles.activationMetricLabel}>Activated</Text>
        </View>
        <View style={styles.activationDivider} />
        <View style={styles.activationMetric}>
          <Text style={styles.activationMetricValue}>{endDate ? format(endDate, 'dd MMM yyyy') : '—'}</Text>
          <Text style={styles.activationMetricLabel}>Ends</Text>
        </View>
        <View style={styles.activationDivider} />
        <View style={styles.activationMetric}>
          <Text style={styles.activationMetricValue}>{daysActive}</Text>
          <Text style={styles.activationMetricLabel}>Days in</Text>
        </View>
      </View>

      <View style={styles.activationFooter}>
        <View style={styles.activationFooterItem}>
          <Calendar size={11} color={C.textTertiary} strokeWidth={1.8} />
          <Text style={styles.activationFooterText}>Renews {frequency}</Text>
        </View>
        {price > 0 && (
          <View style={styles.activationFooterItem}>
            <Text style={styles.activationFooterPrice}>{formatPrice(price)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

/* ---------- Month Filter ---------- */
function MonthFilter({
  months,
  selected,
  onSelect,
}: {
  months: { key: string; label: string }[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const scrollRef = React.useRef<ScrollView>(null);
  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.monthFilterContent}
    >
      {months.map((m) => {
        const active = m.key === selected;
        return (
          <TouchableOpacity
            key={m.key}
            style={[styles.monthFilterChip, active && styles.monthFilterChipActive]}
            onPress={() => onSelect(m.key)}
            activeOpacity={0.75}
          >
            {active && <Check size={11} color={C.white} strokeWidth={2.5} />}
            <Text style={[styles.monthFilterText, active && styles.monthFilterTextActive]}>{m.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/* ---------- Grouping ---------- */
function groupByMonth<T extends { scheduled_date?: string; delivery_date?: string }>(items: T[]): { month: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const dateStr = item.scheduled_date ?? item.delivery_date ?? '';
    if (!dateStr) continue;
    const key = format(parseISO(dateStr), 'MMMM yyyy');
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries()).map(([month, items]) => ({ month, items }));
}

/* ---------- Main Screen ---------- */
export default function DeliveryHistoryScreen() {
  const insets = useSafeAreaInsets();
  const { profile, session } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('subscription');

  const [subDeliveries, setSubDeliveries] = useState<SubDelivery[]>([]);
  const [customDeliveries, setCustomDeliveries] = useState<CustomDelivery[]>([]);
  const [activeSubscriptions, setActiveSubscriptions] = useState<ActiveSubscription[]>([]);
  const [allSubscriptionsList, setAllSubscriptionsList] = useState<ActiveSubscription[]>([]);
  const [allPausePeriods, setAllPausePeriods] = useState<{ subscription_id: string; pause_start_date: string; pause_until: string; resumed_at: string | null; is_cancelled: boolean }[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    const uid = profile?.id ?? session?.user?.id;
    if (!uid) return;
    setLoading(true);

    const activeSubRes = await supabase
      .from('subscriptions')
      .select('id, start_date, end_date, new_end_date, status, pause_start_date, pause_until, created_at, plan:subscription_plans(name, price, image_url, frequency)')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    const allSubscriptions = (activeSubRes.data ?? []) as unknown as ActiveSubscription[];
    const activeSubscriptions = allSubscriptions
      .filter((subscription) => getEffectiveStatus(subscription as any) === 'active')
      .slice(0, 1);

    const subscriptionIds = activeSubscriptions.map((subscription) => subscription.id);
    const [pauseRes, subRes, customRes] = await Promise.all([
      subscriptionIds.length > 0
        ? supabase
            .from('subscription_pause_history')
            .select('subscription_id, pause_start_date, pause_until, resumed_at, is_cancelled')
            .in('subscription_id', subscriptionIds)
            .order('pause_start_date', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      subscriptionIds.length > 0
        ? supabase
            .from('orders')
            .select(`
              id, subscription_id, scheduled_date, status, delivered_at,
              subscription:subscriptions(plan:subscription_plans(name, price, image_url))
            `)
            .in('subscription_id', subscriptionIds)
            .order('scheduled_date', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('custom_orders')
        .select(`
          id, order_type, items, delivery_date, status, delivered_at, total_price
        `)
        .eq('user_id', uid)
        .order('delivery_date', { ascending: false }),
    ]);

    if (activeSubRes.error) console.error('[delivery-history] subscription error:', activeSubRes.error.message);
    if (subRes.error) console.error('[delivery-history] orders error:', subRes.error.message);
    if (customRes.error) console.error('[delivery-history] custom_orders error:', customRes.error.message);

    // Fetch assignments separately, mapped by exact order_id / custom_order_id
    const subOrderIds = (subRes.data ?? []).map((o: any) => o.id).filter(Boolean);
    const customOrderIds = (customRes.data ?? []).map((o: any) => o.id).filter(Boolean);
    const allOrderIds = [...subOrderIds, ...customOrderIds];
    const assignmentsRes = allOrderIds.length > 0
      ? await supabase
          .from('rider_order_assignments')
          .select('order_id, custom_order_id, status, delivered_at, rider:riders!rider_order_assignments_rider_id_fkey(full_name, mobile)')
          .or(`order_id.in.(${subOrderIds.join(',')}),custom_order_id.in.(${customOrderIds.join(',')})`)
        : { data: [], error: null } as any;
    if (assignmentsRes.error) console.error('[delivery-history] assignments error:', assignmentsRes.error.message);

    const assignmentsByOrderId = new Map<string, DeliveryAssignment[]>();
    const assignmentsByCustomOrderId = new Map<string, DeliveryAssignment[]>();
    for (const a of (assignmentsRes.data ?? []) as any[]) {
      const assignment: DeliveryAssignment = {
        order_id: a.order_id ?? null,
        custom_order_id: a.custom_order_id ?? null,
        status: a.status,
        rider: a.rider,
        delivered_at: a.delivered_at,
      };
      if (a.order_id) {
        const arr = assignmentsByOrderId.get(a.order_id) ?? [];
        arr.push(assignment);
        assignmentsByOrderId.set(a.order_id, arr);
      }
      if (a.custom_order_id) {
        const arr = assignmentsByCustomOrderId.get(a.custom_order_id) ?? [];
        arr.push(assignment);
        assignmentsByCustomOrderId.set(a.custom_order_id, arr);
      }
    }

    const ordersBySubscription = new Map<string, SubDelivery[]>();
    for (const order of (subRes.data ?? []) as unknown as (SubDelivery & { subscription_id: string })[]) {
      const orders = ordersBySubscription.get(order.subscription_id) ?? [];
      orders.push({ ...order, assignments: assignmentsByOrderId.get(order.id) ?? [] });
      ordersBySubscription.set(order.subscription_id, orders);
    }

    const pausesBySubscription = new Map<string, PausePeriod[]>();
    for (const pause of (pauseRes.data ?? []) as (PausePeriod & { subscription_id: string })[]) {
      const pauses = pausesBySubscription.get(pause.subscription_id) ?? [];
      pauses.push(pause);
      pausesBySubscription.set(pause.subscription_id, pauses);
    }

    const subscriptionDeliveries = activeSubscriptions.flatMap((subscription) => {
      const pauses = pausesBySubscription.get(subscription.id) ?? [];
      if (subscription.status === 'paused' && subscription.pause_start_date && subscription.pause_until) {
        const alreadyIncluded = pauses.some((pause) =>
          pause.pause_start_date === subscription.pause_start_date &&
          pause.pause_until === subscription.pause_until
        );
        if (!alreadyIncluded) {
          pauses.push({
            pause_start_date: subscription.pause_start_date,
            pause_until: subscription.pause_until,
            resumed_at: null,
            is_cancelled: false,
          });
        }
      }
      return buildSubscriptionDeliveries(subscription, ordersBySubscription.get(subscription.id) ?? [], pauses);
    });

    const today = format(new Date(), 'yyyy-MM-dd');
    const activeSubIds = new Set(activeSubscriptions.map((s) => s.id));
    const validDeliveries = subscriptionDeliveries.filter((delivery) => {
      const subscription = allSubscriptions.find((item) => item.id === delivery.subscription_id);
      if (!subscription || !activeSubIds.has(subscription.id)) return false;
      const startDate = format(parseISO(subscription.start_date), 'yyyy-MM-dd');
      const endDate = subscription.new_end_date ?? subscription.end_date;
      const upperBound = endDate && endDate < today ? endDate : today;
      if (delivery.scheduled_date < startDate) return false;
      if (delivery.scheduled_date <= upperBound) return true;
      return !delivery.isSynthetic;
    });
    const dedupedDeliveries = validDeliveries
      .sort((a, b) => (a.scheduled_date < b.scheduled_date ? 1 : -1) || (a.isSynthetic ? 1 : 0) - (b.isSynthetic ? 1 : 0))
      .filter((delivery, index, arr) => index === 0 || delivery.scheduled_date !== arr[index - 1].scheduled_date);
    setSubDeliveries(dedupedDeliveries);
    setActiveSubscriptions(activeSubscriptions);
    setAllSubscriptionsList(allSubscriptions);
    if (!selectedMonth) {
      setSelectedMonth('all');
    }
    setCustomDeliveries((customRes.data ?? []).map((o: any) => ({ ...o, assignments: assignmentsByCustomOrderId.get(o.id) ?? [] })) as unknown as CustomDelivery[]);
    setAllPausePeriods((pauseRes.data ?? []) as { subscription_id: string; pause_start_date: string; pause_until: string; resumed_at: string | null; is_cancelled: boolean }[]);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { loadData(); }, [profile?.id, session?.user?.id]);

  useFocusEffect(
    useCallback(() => { loadData(); }, [profile?.id, session?.user?.id])
  );

  useEffect(() => {
    if (!profile?.id && !session?.user?.id) return;
    const channel = supabase
      .channel('delivery-history-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => { loadData(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'custom_orders' }, () => { loadData(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rider_order_assignments' }, () => { loadData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, session?.user?.id]);

  const subCount = subDeliveries.length;
  const customCount = customDeliveries.length;

  const latestSubscription = activeSubscriptions[0] ?? null;

  const pausesBySubscription = React.useMemo(() => {
    const map = new Map<string, PausePeriod[]>();
    for (const pause of allPausePeriods) {
      const arr = map.get(pause.subscription_id) ?? [];
      arr.push({ pause_start_date: pause.pause_start_date, pause_until: pause.pause_until, resumed_at: pause.resumed_at, is_cancelled: pause.is_cancelled });
      map.set(pause.subscription_id, arr);
    }
    for (const sub of allSubscriptionsList) {
      if (sub.status === 'paused' && sub.pause_start_date && sub.pause_until) {
        const arr = map.get(sub.id) ?? [];
        const alreadyIncluded = arr.some((p) => p.pause_start_date === sub.pause_start_date && p.pause_until === sub.pause_until);
        if (!alreadyIncluded) {
          arr.push({ pause_start_date: sub.pause_start_date, pause_until: sub.pause_until, resumed_at: null, is_cancelled: false });
          map.set(sub.id, arr);
        }
      }
    }
    return map;
  }, [allPausePeriods, allSubscriptionsList]);

  const availableMonths: { key: string; label: string }[] = React.useMemo(() => {
    const monthSet = new Map<string, string>();
    const todayKey = format(new Date(), 'yyyy-MM');
    for (const sub of activeSubscriptions) {
      const start = parseISO(sub.start_date);
      const endStr = sub.new_end_date ?? sub.end_date;
      const endKey = endStr && endStr < todayKey ? format(parseISO(endStr), 'yyyy-MM') : todayKey;
      let d = new Date(start.getFullYear(), start.getMonth(), 1);
      while (format(d, 'yyyy-MM') <= endKey) {
        const key = format(d, 'yyyy-MM');
        if (!monthSet.has(key)) monthSet.set(key, format(d, 'MMM yyyy'));
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      }
    }
    const months = Array.from(monthSet.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, label]) => ({ key, label }));
    return [{ key: 'all', label: 'All' }, ...months];
  }, [activeSubscriptions]);

  const filteredSubDeliveries = React.useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const activeSubIds = new Set(activeSubscriptions.map((s) => s.id));
    const subMap = new Map(allSubscriptionsList.map((subscription) => [subscription.id, subscription]));
    return subDeliveries.filter((delivery) => {
      const subscription = subMap.get(delivery.subscription_id);
      if (!subscription || !activeSubIds.has(subscription.id)) return false;
      const startDate = format(parseISO(subscription.start_date), 'yyyy-MM-dd');
      const endDate = subscription.new_end_date ?? subscription.end_date;
      const upperBound = endDate && endDate < today ? endDate : today;
      if (delivery.scheduled_date < startDate) return false;
      if (delivery.scheduled_date > upperBound && delivery.isSynthetic) return false;
      if (!selectedMonth || selectedMonth === 'all') return true;
      return format(parseISO(delivery.scheduled_date), 'yyyy-MM') === selectedMonth;
    });
  }, [subDeliveries, selectedMonth, allSubscriptionsList, activeSubscriptions]);

  const renderSubscription = () => {
    if (loading) {
      return <View style={styles.skeletons}>{[1, 2, 3, 4].map((k) => <Skeleton key={k} height={110} borderRadius={14} />)}</View>;
    }
    if (subDeliveries.length === 0) return <EmptyState message="No subscription deliveries yet. Your daily subscription deliveries will appear here." />;
    const grouped = groupByMonth(filteredSubDeliveries);
    return (
      <>
        {latestSubscription && <ActivationCard subscription={latestSubscription} pausePeriods={pausesBySubscription.get(latestSubscription.id) ?? []} />}
        {availableMonths.length > 0 && (
          <MonthFilter
            months={availableMonths}
            selected={selectedMonth}
            onSelect={setSelectedMonth}
          />
        )}
        {grouped.length === 0 ? (
          <EmptyState message={`No deliveries in ${availableMonths.find((m) => m.key === selectedMonth)?.label ?? 'this period'}. Select another month to view more.`} />
        ) : (
          grouped.map(({ month, items }) => (
            <View key={month} style={styles.group}>
              <View style={styles.monthRow}>
                <Text style={styles.monthLabel}>{month}</Text>
                <Text style={styles.monthCount}>{items.length} {items.length === 1 ? 'delivery' : 'deliveries'}</Text>
              </View>
              {items.map((d) => <SubscriptionCard key={d.id} delivery={d} />)}
            </View>
          ))
        )}
      </>
    );
  };

  const renderCustomize = () => {
    if (loading) {
      return <View style={styles.skeletons}>{[1, 2, 3, 4].map((k) => <Skeleton key={k} height={110} borderRadius={14} />)}</View>;
    }
    if (customDeliveries.length === 0) return <EmptyState message="No custom order deliveries yet. Your custom flower and garland orders will appear here." />;
    const grouped = groupByMonth(customDeliveries);
    return grouped.map(({ month, items }) => (
      <View key={month} style={styles.group}>
        <View style={styles.monthRow}>
          <Text style={styles.monthLabel}>{month}</Text>
          <Text style={styles.monthCount}>{items.length} {items.length === 1 ? 'order' : 'orders'}</Text>
        </View>
        {items.map((d) => <CustomCard key={d.id} delivery={d} />)}
      </View>
    ));
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ArrowLeft size={20} color={C.textPrimary} strokeWidth={1.8} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Delivery History</Text>
          <Text style={styles.headerSub}>
            {activeTab === 'subscription' ? `${subCount} subscription deliveries` : `${customCount} custom orders`}
          </Text>
        </View>
        <View style={styles.headerIcon} />
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'subscription' && styles.tabActive]}
          onPress={() => setActiveTab('subscription')}
          activeOpacity={0.75}
        >
          <Text style={[styles.tabText, activeTab === 'subscription' && styles.tabTextActive]}>Subscription</Text>
          {subCount > 0 && (
            <View style={[styles.tabCount, activeTab === 'subscription' && styles.tabCountActive]}>
              <Text style={[styles.tabCountText, activeTab === 'subscription' && styles.tabCountTextActive]}>{subCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'customize' && styles.tabActive]}
          onPress={() => setActiveTab('customize')}
          activeOpacity={0.75}
        >
          <Text style={[styles.tabText, activeTab === 'customize' && styles.tabTextActive]}>Customize</Text>
          {customCount > 0 && (
            <View style={[styles.tabCount, activeTab === 'customize' && styles.tabCountActive]}>
              <Text style={[styles.tabCountText, activeTab === 'customize' && styles.tabCountTextActive]}>{customCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing[8] }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadData(); }}
            tintColor={C.primary}
          />
        }
      >
        {activeTab === 'subscription' ? renderSubscription() : renderCustomize()}
      </ScrollView>
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIcon}>
        <PackageOpen size={44} color={C.neutral[400]} strokeWidth={1.4} />
      </View>
      <Text style={styles.emptyTitle}>No deliveries found</Text>
      <Text style={styles.emptySub}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: Spacing[3],
  },
  backBtn: {
    width: 36, height: 36, borderRadius: Radius.md,
    backgroundColor: C.neutral[100], alignItems: 'center', justifyContent: 'center',
  },
  headerTitleWrap: { flex: 1, gap: 1 },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl,
    color: C.textPrimary, letterSpacing: -0.3,
  },
  headerSub: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: C.textTertiary,
  },
  headerIcon: { width: 36 },

  tabBar: {
    flexDirection: 'row', backgroundColor: C.white,
    borderBottomWidth: 1, borderBottomColor: C.border,
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[2], gap: Spacing[2],
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: Spacing[2], borderRadius: Radius.md,
    backgroundColor: C.neutral[100], borderWidth: 1, borderColor: C.border,
  },
  tabActive: { backgroundColor: C.primary, borderColor: C.primary },
  tabText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: C.textSecondary,
  },
  tabTextActive: { color: C.white },
  tabCount: {
    minWidth: 18, height: 18, borderRadius: Radius.full,
    backgroundColor: C.neutral[200], alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  tabCountActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  tabCountText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: C.textSecondary,
  },
  tabCountTextActive: { color: C.white },

  listContent: { padding: Spacing[4], gap: Spacing[4] },
  skeletons: { gap: Spacing[3] },

  emptyWrap: { alignItems: 'center', paddingTop: Spacing[16], gap: Spacing[3] },
  emptyIcon: {
    width: 88, height: 88, borderRadius: Radius.xl,
    backgroundColor: C.neutral[100], alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg,
    color: C.textPrimary, letterSpacing: -0.2,
  },
  emptySub: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: C.textTertiary, textAlign: 'center', lineHeight: 20, paddingHorizontal: Spacing[8],
  },

  group: { gap: Spacing[3] },
  monthRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2,
  },
  monthLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs,
    color: C.primary, textTransform: 'uppercase', letterSpacing: 1.1,
  },
  monthCount: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: C.textTertiary,
  },

  card: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: C.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: C.border, padding: Spacing[4], gap: Spacing[3],
    ...Shadow.sm,
  },
  cardDisabled: {
    backgroundColor: C.neutral[50],
    opacity: 0.75,
  },
  dateCol: { width: 42, alignItems: 'center', gap: 1 },
  dateDay: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl,
    color: C.primary, lineHeight: 24,
  },
  dateMon: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10,
    color: C.primary, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  dateYear: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 9, color: C.textTertiary, letterSpacing: 0.3,
  },
  dividerVert: { width: 1, backgroundColor: C.divider, alignSelf: 'stretch' },
  cardBody: { flex: 1, gap: 5 },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing[2],
  },
  planName: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base,
    color: C.textPrimary, letterSpacing: -0.1, flex: 1,
  },
  priceText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: C.primary,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: C.textTertiary,
  },
  dayLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: C.textSecondary,
  },

  riderBox: {
    backgroundColor: C.neutral[50], borderRadius: Radius.md,
    paddingHorizontal: Spacing[2], paddingVertical: Spacing[1], gap: 3, marginTop: 2,
  },
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  riderName: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: C.textSecondary, flex: 1,
  },
  riderPhone: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: C.textTertiary,
  },
  riderDelivered: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs,
  },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, marginTop: 2,
  },
  badgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, letterSpacing: 0.2,
  },

  activationCard: {
    backgroundColor: C.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: Spacing[4],
    gap: Spacing[3],
    ...Shadow.sm,
  },
  activationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  activationIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: C.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activationHeaderText: {
    flex: 1,
    gap: 1,
  },
  activationTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.base,
    color: C.textPrimary,
    letterSpacing: -0.2,
  },
  activationSub: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: C.textTertiary,
  },
  activationStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  activationStatusText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  activationBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.neutral[50],
    borderRadius: Radius.md,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[2],
  },
  activationMetric: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  activationMetricValue: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: C.textPrimary,
  },
  activationMetricLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 10,
    color: C.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activationDivider: {
    width: 1,
    height: 28,
    backgroundColor: C.divider,
  },
  activationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  activationFooterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  activationFooterText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: C.textTertiary,
  },
  activationFooterPrice: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: C.primary,
  },

  monthFilterContent: {
    gap: Spacing[2],
    paddingRight: Spacing[4],
  },
  monthFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.full,
    backgroundColor: C.neutral[100],
    borderWidth: 1,
    borderColor: C.border,
  },
  monthFilterChipActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  monthFilterText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: C.textSecondary,
  },
  monthFilterTextActive: {
    color: C.white,
  },
});
