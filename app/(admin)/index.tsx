import React, { useEffect, useState } from 'react';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Package, TrendingUp, Truck, Users, ChevronRight, Flower2, ArrowUpRight, Calendar, LayoutDashboard, Leaf, Store, CircleAlert as AlertCircle, CirclePause as PauseCircle, CalendarClock, UserPlus, RotateCcw, Pencil, Timer, Play, SkipForward, Banknote, ReceiptText, RefreshCw, CalendarX } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import StatusChip from '@/components/ui/StatusChip';

const MD3 = {
  surface: '#FFFBFE',
  surfaceVariant: '#E7E0EC',
  surfaceContainer: '#F3EDF7',
  surfaceContainerHigh: '#ECE6F0',
  surfaceContainerLow: '#F7F2FA',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  outline: '#79747E',
  outlineVariant: '#CAC4D0',
  primary: '#2D5A27',
  onPrimary: '#FFFFFF',
  primaryContainer: '#C8EDBB',
  onPrimaryContainer: '#062100',
  secondary: '#4A6741',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#CCEDC0',
  onSecondaryContainer: '#0A2006',
  tertiary: '#386667',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#BCEBEC',
  onTertiaryContainer: '#002021',
  error: '#B3261E',
  errorContainer: '#F9DEDC',
  onError: '#FFFFFF',
};

interface Metrics {
  // subscription
  totalSubscriptions: number;
  activeSubscriptions: number;
  pendingSubscriptions: number;
  expiredSubscriptions: number;
  newSubscriptionsToday: number;
  renewedSubscriptionsToday: number;
  expiringToday: number;
  endingToday: number;
  // paused
  totalPaused: number;
  todayPaused: number;
  tomorrowPaused: number;
  todayResumed: number;
  tomorrowResumed: number;
  // customize order
  customOrdersToday: number;
  customOrdersNext5Days: number;
  unpaidCustomOrders: number;
  pendingCustomOrdersCount: number;
  // delivery
  deliveryToday: number;
  deliveryTomorrow: number;
  // finance
  todayPaymentReceived: number;
  todayExpenses: number;
  // customer
  totalCustomersCount: number;
  newCustomersToday: number;
  activeCustomersCount: number;
  inactiveCustomersCount: number;
  // legacy kept for mobile
  pausedSubscriptions: number;
  todaysOrders: number;
  monthlyRevenue: number;
  newUsersThisMonth: number;
  totalCustomers: number;
  pendingOrders: number;
  pendingCustomOrders: number;
  todayRequirementsPending: number;
  pendingProcurementOrders: number;
  outstandingVendorPayments: number;
  activeVendors: number;
}

export default function AdminDashboard() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [metrics, setMetrics] = useState<Metrics>({
    totalSubscriptions: 0,
    activeSubscriptions: 0,
    pendingSubscriptions: 0,
    expiredSubscriptions: 0,
    newSubscriptionsToday: 0,
    renewedSubscriptionsToday: 0,
    expiringToday: 0,
    endingToday: 0,
    totalPaused: 0,
    todayPaused: 0,
    tomorrowPaused: 0,
    todayResumed: 0,
    tomorrowResumed: 0,
    customOrdersToday: 0,
    customOrdersNext5Days: 0,
    unpaidCustomOrders: 0,
    pendingCustomOrdersCount: 0,
    deliveryToday: 0,
    deliveryTomorrow: 0,
    todayPaymentReceived: 0,
    todayExpenses: 0,
    pausedSubscriptions: 0,
    todaysOrders: 0,
    monthlyRevenue: 0,
    newUsersThisMonth: 0,
    totalCustomersCount: 0,
    newCustomersToday: 0,
    activeCustomersCount: 0,
    inactiveCustomersCount: 0,
    totalCustomers: 0,
    pendingOrders: 0,
    pendingCustomOrders: 0,
    todayRequirementsPending: 0,
    pendingProcurementOrders: 0,
    outstandingVendorPayments: 0,
    activeVendors: 0,
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<any[]>([]);
  const [upcomingPauses, setUpcomingPauses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      const next5 = new Date(); next5.setDate(next5.getDate() + 5);
      const next5Str = next5.toISOString().split('T')[0];
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const next30Days = new Date(); next30Days.setDate(next30Days.getDate() + 30);
      const next30 = next30Days.toISOString().split('T')[0];
      const todayStart = `${today}T00:00:00.000Z`;
      const todayEnd = `${today}T23:59:59.999Z`;
      // IST-aware today window for delivered_at (IST = UTC+5:30)
      const todayISTStart = new Date(`${today}T00:00:00+05:30`).toISOString();
      const todayISTEnd = new Date(`${today}T23:59:59+05:30`).toISOString();

      const settled = await Promise.allSettled([
        // Active subs (includes currently paused — they still have status='active')
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        // Pending subs (paid, future start_date)
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        // Expired subs: status = 'expired'
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'expired'),
        // Today's new subs with user_id so we can classify new vs renew
        supabase.from('subscriptions').select('user_id, created_at').gte('created_at', todayStart).lte('created_at', todayEnd),
        // Ends Today = effective end date (new_end_date if set, else end_date) equals today
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }).in('status', ['active', 'pending']).or(`new_end_date.eq.${today},and(new_end_date.is.null,end_date.eq.${today})`),
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active').gte('new_end_date', today).lte('new_end_date', next5Str),
        // Total paused: status='paused' OR active with pause dates covering today
        supabase.from('subscriptions').select('id, status, pause_start_date, pause_until', { count: 'exact' }).in('status', ['active', 'paused']).not('pause_start_date', 'is', null).not('pause_until', 'is', null).lte('pause_start_date', today).gte('pause_until', today),
        // Today paused: same as total paused (kept for compat)
        supabase.from('subscriptions').select('id, status, pause_start_date, pause_until', { count: 'exact' }).in('status', ['active', 'paused']).not('pause_start_date', 'is', null).not('pause_until', 'is', null).lte('pause_start_date', today).gte('pause_until', today),
        // Tomorrow paused
        supabase.from('subscriptions').select('id, status, pause_start_date, pause_until', { count: 'exact' }).in('status', ['active', 'paused']).not('pause_start_date', 'is', null).not('pause_until', 'is', null).lte('pause_start_date', tomorrowStr).gte('pause_until', tomorrowStr),
        // Today resumed: pause_until = yesterday (now active again)
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('pause_until', yesterdayStr),
        // Tomorrow resumed: pause_until = today (will be active tomorrow)
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('pause_until', today),
        supabase.from('custom_orders').select('*', { count: 'exact', head: true }).eq('delivery_date', today),
        supabase.from('custom_orders').select('*', { count: 'exact', head: true }).gt('delivery_date', today).lte('delivery_date', next5Str),
        supabase.from('custom_orders').select('*', { count: 'exact', head: true }).eq('status', 'confirmed').neq('payment_status', 'paid'),
        supabase.from('custom_orders').select('*', { count: 'exact', head: true }).neq('status', 'delivered').neq('status', 'cancelled'),
        // Today Delivery = orders delivered today by riders (delivered_at within today IST)
        supabase.from('rider_order_assignments').select('*', { count: 'exact', head: true }).eq('status', 'delivered').gte('delivered_at', todayISTStart).lte('delivered_at', todayISTEnd),
        // Tomorrow Delivery = active subscriptions that will be active tomorrow (not expired via effective end date, not paused on that day)
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active').lte('start_date', tomorrowStr).or(`new_end_date.gte.${tomorrowStr},and(new_end_date.is.null,or(end_date.is.null,end_date.gte.${tomorrowStr}))`).or(`pause_until.is.null,pause_until.lt.${tomorrowStr}`),
        supabase.from('payments').select('amount').eq('status', 'success').gte('created_at', todayStart).lte('created_at', todayEnd),
        supabase.from('expenses').select('amount').eq('expense_date', today),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('scheduled_date', today),
        supabase.from('payments').select('amount').eq('status', 'success').gte('created_at', monthStart),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').gte('created_at', monthStart),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'scheduled'),
        supabase.from('custom_orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('orders').select('*, user:profiles(full_name, mobile), subscription:subscriptions(plan:subscription_plans(name))').order('created_at', { ascending: false }).limit(isWeb ? 8 : 5),
        supabase.from('profiles').select('id, full_name, mobile, created_at').eq('role', 'customer').order('created_at', { ascending: false }).limit(5),
        supabase.from('daily_requirements').select('*', { count: 'exact', head: true }).eq('requirement_date', today).eq('status', 'pending'),
        supabase.from('procurement_orders').select('*', { count: 'exact', head: true }).in('status', ['draft', 'sent', 'accepted']),
        supabase.from('procurement_orders').select('total_amount').not('status', 'eq', 'cancelled'),
        supabase.from('vendors').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('subscriptions').select('id, pause_start_date, pause_until, user:profiles(full_name, mobile), plan:subscription_plans(name)').eq('status', 'active').not('pause_start_date', 'is', null).gte('pause_start_date', today).lte('pause_start_date', next30).order('pause_start_date', { ascending: true }).limit(10),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').gte('created_at', todayStart).lte('created_at', todayEnd),
      ]);

      // Helper: extract value from allSettled result, returning fallback on rejection
      const ok = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
        r.status === 'fulfilled' ? r.value : fallback;
      const fallbackCount = { count: 0, data: null, error: null };
      const fallbackData = { data: [], count: null, error: null };

      const [
        activeSubsRes, pendingSubsRes, expiredSubsRaw, todaySubsRaw,
        endingTodayRes, expiringTodayRes,
        totalPausedRes, todayPausedRes, tomorrowPausedRes, todayResumedRes, tomorrowResumedRes,
        customTodayRes, customNext5Res, unpaidCustomRes, pendingCustomCountRes,
        deliveryTodayRes, deliveryTomorrowRes,
        todayPaymentsRes, todayExpensesRes,
        orders, revenue, newUsers, totalCustomersRes, pending, pendingCustom,
        recent, recentCust, todayReqs, pendingProcurement, vendorOrders, activeVendorsRes, upcomingPausesRes,
        totalCustomerProfilesRes, newCustomersTodayRes,
      ] = settled.map((r) => ok(r as any, fallbackCount));

      // Log any failures so they're visible in dev tools
      settled.forEach((r, i) => {
        if (r.status === 'rejected') console.warn(`Dashboard query [${i}] failed:`, r.reason);
      });

      // Total = active (includes paused) + pending
      const pendingSubscriptions = pendingSubsRes.count ?? 0;
      const totalSubscriptions = (activeSubsRes.count ?? 0) + pendingSubscriptions;

      // Expired = subscriptions with status = 'expired'
      const expiredSubscriptions = expiredSubsRaw.count ?? 0;

      // For new vs renew: get all user_ids that created a sub today, then check prior history
      const todaySubUserIds = (todaySubsRaw.data ?? []).map((r: any) => r.user_id);
      const uniqueTodayUserIds = [...new Set<string>(todaySubUserIds)];
      let newSubscriptionsToday = 0;
      let renewedSubscriptionsToday = 0;
      if (uniqueTodayUserIds.length > 0) {
        // For each user who subscribed today, check if they had ANY subscription before today
        const priorSubsRes = await supabase
          .from('subscriptions')
          .select('user_id')
          .in('user_id', uniqueTodayUserIds)
          .lt('created_at', todayStart);
        const usersWithPriorSubs = new Set<string>((priorSubsRes.data ?? []).map((r: any) => r.user_id));
        for (const uid of uniqueTodayUserIds) {
          if (usersWithPriorSubs.has(uid)) renewedSubscriptionsToday++;
          else newSubscriptionsToday++;
        }
      }

      const totalRevenue = (revenue.data ?? []).reduce((sum: number, p: any) => sum + p.amount, 0);
      const todayReceivedTotal = (todayPaymentsRes.data ?? []).reduce((sum: number, p: any) => sum + p.amount, 0);
      const todayExpensesTotal = (todayExpensesRes.data ?? []).reduce((sum: number, e: any) => sum + Number(e.amount ?? 0), 0);
      const totalOrdered = (vendorOrders.data ?? []).reduce((sum: number, o: any) => sum + Number(o.total_amount ?? 0), 0);
      const paidRes = await supabase.from('vendor_payments').select('amount').eq('status', 'completed');
      const totalPaid = (paidRes.data ?? []).reduce((sum: number, p: any) => sum + Number(p.amount), 0);

      // Customer counts: active = has active subscription, inactive = customer with no active sub
      const totalCustomerProfiles = totalCustomerProfilesRes.count ?? 0;
      const newCustomersToday = newCustomersTodayRes.count ?? 0;
      const activeCustomerIdsRes = await supabase.from('subscriptions').select('user_id').eq('status', 'active');
      const activeCustomerIdSet = new Set<string>((activeCustomerIdsRes.data ?? []).map((r: any) => r.user_id));
      const activeCustomersCount = activeCustomerIdSet.size;
      const inactiveCustomersCount = Math.max(0, totalCustomerProfiles - activeCustomersCount);

      setMetrics({
        totalSubscriptions,
        activeSubscriptions: activeSubsRes.count ?? 0,
        pendingSubscriptions,
        expiredSubscriptions,
        newSubscriptionsToday,
        renewedSubscriptionsToday,
        expiringToday: expiringTodayRes.count ?? 0,
        endingToday: endingTodayRes.count ?? 0,
        totalPaused: (totalPausedRes.data ?? []).filter((r: any) => r.pause_start_date && r.pause_until && r.pause_start_date <= today && r.pause_until >= today).length,
        todayPaused: (todayPausedRes.data ?? []).filter((r: any) => r.pause_start_date && r.pause_until && r.pause_start_date <= today && r.pause_until >= today).length,
        tomorrowPaused: (tomorrowPausedRes.data ?? []).filter((r: any) => r.pause_start_date && r.pause_until && r.pause_start_date <= tomorrowStr && r.pause_until >= tomorrowStr).length,
        todayResumed: todayResumedRes.count ?? 0,
        tomorrowResumed: tomorrowResumedRes.count ?? 0,
        customOrdersToday: customTodayRes.count ?? 0,
        customOrdersNext5Days: customNext5Res.count ?? 0,
        unpaidCustomOrders: unpaidCustomRes.count ?? 0,
        pendingCustomOrdersCount: pendingCustomCountRes.count ?? 0,
        deliveryToday: deliveryTodayRes.count ?? 0,
        deliveryTomorrow: deliveryTomorrowRes.count ?? 0,
        todayPaymentReceived: todayReceivedTotal,
        todayExpenses: todayExpensesTotal,
        totalCustomersCount: totalCustomerProfiles,
        newCustomersToday,
        activeCustomersCount,
        inactiveCustomersCount,
        pausedSubscriptions: (totalPausedRes.data ?? []).filter((r: any) => r.pause_start_date && r.pause_until && r.pause_start_date <= today && r.pause_until >= today).length,
        todaysOrders: orders.count ?? 0,
        monthlyRevenue: totalRevenue,
        newUsersThisMonth: newUsers.count ?? 0,
        totalCustomers: totalCustomersRes.count ?? 0,
        pendingOrders: pending.count ?? 0,
        pendingCustomOrders: pendingCustom.count ?? 0,
        todayRequirementsPending: todayReqs.count ?? 0,
        pendingProcurementOrders: pendingProcurement.count ?? 0,
        outstandingVendorPayments: Math.max(0, totalOrdered - totalPaid),
        activeVendors: activeVendorsRes.count ?? 0,
      });

      if (recent.data) setRecentOrders(recent.data);
      if (recentCust.data) setRecentCustomers(recentCust.data);
      if (upcomingPausesRes.data) setUpcomingPauses(upcomingPausesRes.data);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  usePageVisibility(load);

  const formatPrice = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

  if (isWeb) {
    return <WebDashboard metrics={metrics} recentOrders={recentOrders} recentCustomers={recentCustomers} upcomingPauses={upcomingPauses} loading={loading} onRefresh={() => { setRefreshing(true); load(); }} formatPrice={formatPrice} />;
  }

  const metricCards = [
    { label: 'Active Subs', value: metrics.activeSubscriptions.toString(), icon: Package, color: MD3.primary, bg: MD3.primaryContainer, onBg: MD3.onPrimaryContainer },
    { label: 'Paused Subs', value: metrics.pausedSubscriptions.toString(), icon: PauseCircle, color: '#B45309', bg: '#FEF3C7', onBg: '#78350F' },
    { label: "Today's Orders", value: metrics.todaysOrders.toString(), icon: Truck, color: MD3.tertiary, bg: MD3.tertiaryContainer, onBg: MD3.onTertiaryContainer },
    { label: 'Monthly Rev.', value: formatPrice(metrics.monthlyRevenue), icon: TrendingUp, color: MD3.secondary, bg: MD3.secondaryContainer, onBg: MD3.onSecondaryContainer },
    { label: 'New Customers', value: metrics.newUsersThisMonth.toString(), icon: Users, color: MD3.primary, bg: MD3.primaryContainer, onBg: MD3.onPrimaryContainer },
    { label: 'Custom Orders', value: metrics.pendingCustomOrders.toString(), icon: Flower2, color: '#92400E', bg: '#FEF3C7', onBg: '#78350F' },
  ];

  return (
    <View style={[mStyles.container, { backgroundColor: MD3.surface }]}>
      <View style={[mStyles.header, { paddingTop: insets.top + Spacing[3] }]}>
        <View style={mStyles.headerLeft}>
          <View style={mStyles.headerIconWrap}>
            <LayoutDashboard size={20} color={MD3.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={mStyles.headerEyebrow}>Admin Panel</Text>
            <Text style={mStyles.headerTitle}>Dashboard</Text>
          </View>
        </View>
        <View style={mStyles.logoChip}>
          <Flower2 size={18} color={MD3.primary} strokeWidth={1.5} />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={mStyles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={MD3.primary} />}
      >
        <Text style={mStyles.dateText}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>

        <View style={mStyles.metricsGrid}>
          {metricCards.map((card) => {
            const Icon = card.icon;
            return (
              <View key={card.label} style={[mStyles.metricCard, { backgroundColor: card.bg }]}>
                <View style={[mStyles.metricIconWrap, { backgroundColor: 'rgba(255,255,255,0.5)' }]}>
                  <Icon size={20} color={card.color} strokeWidth={1.8} />
                </View>
                <Text style={[mStyles.metricValue, { color: card.onBg }]}>{loading ? '—' : card.value}</Text>
                <Text style={[mStyles.metricLabel, { color: card.color }]}>{card.label}</Text>
              </View>
            );
          })}
        </View>

        <View style={mStyles.quickActionsRow}>
          <TouchableOpacity style={mStyles.qaFilled} onPress={() => router.push('/(admin)/orders')} activeOpacity={0.85}>
            <Truck size={18} color={MD3.onPrimary} strokeWidth={1.8} />
            <Text style={mStyles.qaFilledText}>Today's Orders</Text>
          </TouchableOpacity>
          <TouchableOpacity style={mStyles.qaTonal} onPress={() => router.push('/(admin)/daily-requirements')} activeOpacity={0.85}>
            <Leaf size={18} color={MD3.primary} strokeWidth={1.8} />
            <Text style={mStyles.qaTonalText}>Daily Needs</Text>
          </TouchableOpacity>
        </View>

        <View style={mStyles.procurementSection}>
          <Text style={mStyles.sectionTitle}>Procurement Overview</Text>
          <View style={mStyles.procurementGrid}>
            <TouchableOpacity style={mStyles.procCard} onPress={() => router.push('/(admin)/daily-requirements')} activeOpacity={0.8}>
              <View style={[mStyles.procIconWrap, { backgroundColor: MD3.tertiaryContainer }]}>
                <Leaf size={18} color={MD3.tertiary} strokeWidth={1.8} />
              </View>
              <Text style={mStyles.procValue}>{loading ? '—' : metrics.todayRequirementsPending}</Text>
              <Text style={mStyles.procLabel}>Pending Today</Text>
            </TouchableOpacity>
            <TouchableOpacity style={mStyles.procCard} onPress={() => router.push('/(admin)/procurement-orders')} activeOpacity={0.8}>
              <View style={[mStyles.procIconWrap, { backgroundColor: MD3.secondaryContainer }]}>
                <Package size={18} color={MD3.secondary} strokeWidth={1.8} />
              </View>
              <Text style={mStyles.procValue}>{loading ? '—' : metrics.pendingProcurementOrders}</Text>
              <Text style={mStyles.procLabel}>Open Orders</Text>
            </TouchableOpacity>
            <TouchableOpacity style={mStyles.procCard} onPress={() => router.push('/(admin)/vendors')} activeOpacity={0.8}>
              <View style={[mStyles.procIconWrap, { backgroundColor: MD3.primaryContainer }]}>
                <Store size={18} color={MD3.primary} strokeWidth={1.8} />
              </View>
              <Text style={mStyles.procValue}>{loading ? '—' : metrics.activeVendors}</Text>
              <Text style={mStyles.procLabel}>Active Vendors</Text>
            </TouchableOpacity>
            <View style={[mStyles.procCard, { borderColor: metrics.outstandingVendorPayments > 0 ? MD3.error : MD3.outlineVariant }]}>
              <View style={[mStyles.procIconWrap, { backgroundColor: metrics.outstandingVendorPayments > 0 ? MD3.errorContainer : MD3.surfaceContainer }]}>
                <AlertCircle size={18} color={metrics.outstandingVendorPayments > 0 ? MD3.error : MD3.onSurfaceVariant} strokeWidth={1.8} />
              </View>
              <Text style={[mStyles.procValue, { color: metrics.outstandingVendorPayments > 0 ? MD3.error : MD3.onSurface }]}>
                {loading ? '—' : `₹${metrics.outstandingVendorPayments.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              </Text>
              <Text style={mStyles.procLabel}>Outstanding</Text>
            </View>
          </View>
        </View>

        {recentOrders.length > 0 && (
          <View style={mStyles.section}>
            <View style={mStyles.sectionHeader}>
              <Text style={mStyles.sectionTitle}>Recent Orders</Text>
              <TouchableOpacity style={mStyles.seeAllBtn} onPress={() => router.push('/(admin)/orders')}>
                <Text style={mStyles.seeAllText}>See all</Text>
                <ChevronRight size={14} color={MD3.primary} />
              </TouchableOpacity>
            </View>
            <View style={mStyles.listCard}>
              {recentOrders.map((order, i) => (
                <TouchableOpacity
                  key={order.id}
                  style={[mStyles.listRow, i === recentOrders.length - 1 && mStyles.listRowLast]}
                  onPress={() => router.push({ pathname: '/(admin)/order-detail', params: { id: order.id } })}
                  activeOpacity={0.7}
                >
                  <View style={mStyles.listAvatar}>
                    <Text style={mStyles.listAvatarText}>
                      {(order.user?.full_name ?? order.user?.mobile ?? '?')[0]?.toUpperCase()}
                    </Text>
                  </View>
                  <View style={mStyles.listInfo}>
                    <Text style={mStyles.listPrimary} numberOfLines={1}>{order.user?.full_name ?? order.user?.mobile}</Text>
                    <Text style={mStyles.listSecondary} numberOfLines={1}>{order.subscription?.plan?.name}</Text>
                  </View>
                  <View style={mStyles.listRight}>
                    <StatusChip status={order.status} />
                    <ChevronRight size={16} color={MD3.outline} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={mStyles.section}>
          <View style={mStyles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing[2] }}>
              <CalendarClock size={16} color="#B45309" strokeWidth={1.8} />
              <Text style={mStyles.sectionTitle}>Upcoming Pauses</Text>
              {upcomingPauses.length > 0 && (
                <View style={mStyles.pauseBadge}>
                  <Text style={mStyles.pauseBadgeText}>{upcomingPauses.length}</Text>
                </View>
              )}
            </View>
          </View>
          {upcomingPauses.length === 0 ? (
            <View style={mStyles.pauseEmptyCard}>
              <Text style={mStyles.pauseEmptyText}>No pauses in next 30 days</Text>
            </View>
          ) : (
            <View style={mStyles.listCard}>
              {upcomingPauses.map((sub: any, i: number) => {
                const user = sub.user as any;
                const plan = sub.plan as any;
                const pauseDate = sub.pause_start_date ? new Date(sub.pause_start_date) : null;
                const todayDate = new Date();
                todayDate.setHours(0, 0, 0, 0);
                const daysAway = pauseDate ? Math.round((pauseDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)) : null;
                const isImminent = daysAway !== null && daysAway <= 3;
                return (
                  <View key={sub.id} style={[mStyles.listRow, i === upcomingPauses.length - 1 && mStyles.listRowLast]}>
                    <View style={[mStyles.listAvatar, { backgroundColor: '#FEF3C7' }]}>
                      <PauseCircle size={16} color="#B45309" strokeWidth={1.8} />
                    </View>
                    <View style={mStyles.listInfo}>
                      <Text style={mStyles.listPrimary} numberOfLines={1}>{user?.full_name ?? user?.mobile ?? '—'}</Text>
                      <Text style={mStyles.listSecondary} numberOfLines={1}>{plan?.name ?? '—'}</Text>
                      <Text style={[mStyles.listSecondary, { marginTop: 1 }]}>
                        {sub.pause_start_date ? format(new Date(sub.pause_start_date), 'dd MMM') : '—'}
                        {sub.pause_until ? ` → ${format(new Date(sub.pause_until), 'dd MMM')}` : ''}
                      </Text>
                    </View>
                    <View style={[mStyles.mDaysBadge, { backgroundColor: isImminent ? MD3.errorContainer : '#FEF3C7' }]}>
                      <Text style={[mStyles.mDaysText, { color: isImminent ? MD3.error : '#B45309' }]}>
                        {daysAway === 0 ? 'Today' : daysAway === 1 ? '1d' : `${daysAway}d`}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function WebDashboard({ metrics, recentOrders, recentCustomers, upcomingPauses, loading, onRefresh, formatPrice }: any) {
  const val = (n: number) => loading ? '—' : n.toString();
  const money = (n: number) => loading ? '—' : `₹${(n / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  const moneyRaw = (n: number) => loading ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  return (
    <ScrollView style={[wStyles.scroll, { backgroundColor: '#EEF2F7' }]} contentContainerStyle={wStyles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={wStyles.pageHeader}>
        <View style={wStyles.pageHeaderLeft}>
          <View style={wStyles.pageIconWrap}>
            <LayoutDashboard size={22} color={MD3.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={wStyles.pageTitle}>Dashboard</Text>
            <Text style={wStyles.pageSubtitle}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
          </View>
        </View>
        <TouchableOpacity style={wStyles.refreshBtn} onPress={onRefresh} activeOpacity={0.8}>
          <RefreshCw size={14} color={MD3.primary} strokeWidth={2} />
          <Text style={wStyles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* ── SUBSCRIPTION ── */}
      <View style={wStyles.groupCard}>
        <View style={wStyles.groupHeader}>
          <Text style={wStyles.groupTitle}>SUBSCRIPTION</Text>
        </View>
        <View style={wStyles.cardRow}>
          <DashCard label="Total Subscription" value={val(metrics.totalSubscriptions)} icon={Package} accent="#2D5A27" bg="#E8F5E2" href="/(admin)/orders?subFilter=all" />
          <DashCard label="Active Subscription" value={val(metrics.activeSubscriptions)} icon={Package} accent="#15803D" bg="#DCFCE7" href="/(admin)/orders?subFilter=active" highlight />
          <DashCard label="Pending Subscription" value={val(metrics.pendingSubscriptions)} icon={CalendarClock} accent="#0369A1" bg="#E0F2FE" href="/(admin)/orders?subFilter=pending" />
          <DashCard label="Expired Subscription" value={val(metrics.expiredSubscriptions)} icon={Timer} accent="#DC2626" bg="#FEE2E2" href="/(admin)/orders?subFilter=expired" />
          <DashCard label="New Subscription" value={val(metrics.newSubscriptionsToday)} icon={UserPlus} accent="#0369A1" bg="#E0F2FE" href="/(admin)/orders?subFilter=new_today" />
          <DashCard label="Renew Subscription" value={val(metrics.renewedSubscriptionsToday)} icon={RotateCcw} accent="#15803D" bg="#DCFCE7" href="/(admin)/orders?subFilter=renewed_today" />
          <DashCard label="Subscription to Expired" value={val(metrics.expiringToday)} icon={AlertCircle} accent="#EA580C" bg="#FFEDD5" href="/(admin)/orders?subFilter=expiring_soon" />
          <DashCard label="Subscription End Today" value={val(metrics.endingToday)} icon={CalendarX} accent="#DC2626" bg="#FEE2E2" href="/(admin)/orders?subFilter=end_today" highlight={metrics.endingToday > 0} />
        </View>
      </View>

      {/* ── USER ── */}
      <View style={wStyles.groupCard}>
        <View style={wStyles.groupHeader}>
          <Text style={wStyles.groupTitle}>USER</Text>
        </View>
        <View style={wStyles.cardRow}>
          <DashCard label="Total User" value={val(metrics.totalCustomersCount)} icon={Users} accent="#2D5A27" bg="#E8F5E2" href="/(admin)/customers?customerFilter=all" />
          <DashCard label="New User" value={val(metrics.newCustomersToday)} icon={UserPlus} accent="#0369A1" bg="#E0F2FE" href="/(admin)/customers?customerFilter=new_today" highlight />
          <DashCard label="Active User" value={val(metrics.activeCustomersCount)} icon={TrendingUp} accent="#15803D" bg="#DCFCE7" href="/(admin)/customers?customerFilter=active" />
          <DashCard label="Inactive User" value={val(metrics.inactiveCustomersCount)} icon={AlertCircle} accent="#DC2626" bg="#FEE2E2" href="/(admin)/customers?customerFilter=inactive" />
        </View>
      </View>

      {/* ── PAUSED ── */}
      <View style={wStyles.groupCard}>
        <View style={wStyles.groupHeader}>
          <Text style={wStyles.groupTitle}>PAUSED</Text>
        </View>
        <View style={wStyles.cardRow}>
          <DashCard label="Total Paused" value={val(metrics.totalPaused)} icon={PauseCircle} accent="#B45309" bg="#FEF3C7" href="/(admin)/orders?subFilter=paused" highlight />
          <DashCard label="Today Paused" value={val(metrics.todayPaused)} icon={PauseCircle} accent="#B45309" bg="#FEF9C3" href="/(admin)/orders?subFilter=paused_today" />
          <DashCard label="Tomorrow Paused" value={val(metrics.tomorrowPaused)} icon={SkipForward} accent="#92400E" bg="#FEF3C7" href="/(admin)/orders?subFilter=paused_tomorrow" />
          <DashCard label="Today Resumed" value={val(metrics.todayResumed)} icon={Play} accent="#15803D" bg="#DCFCE7" href="/(admin)/orders?subFilter=resumed_today" />
          <DashCard label="Tomorrow Resumed" value={val(metrics.tomorrowResumed)} icon={Play} accent="#0369A1" bg="#E0F2FE" href="/(admin)/orders?subFilter=resumed_tomorrow" />
        </View>
      </View>

      {/* ── CUSTOMIZE ORDER ── */}
      <View style={wStyles.groupCard}>
        <View style={wStyles.groupHeader}>
          <Text style={wStyles.groupTitle}>CUSTOMIZE ORDER</Text>
        </View>
        <View style={wStyles.cardRow}>
          <DashCard label="Today Customize Order" value={val(metrics.customOrdersToday)} icon={Pencil} accent="#0369A1" bg="#E0F2FE" href="/(admin)/orders?tab=custom&customFilter=today" />
          <DashCard label="Next 5 Days Customize Order" value={val(metrics.customOrdersNext5Days)} icon={Calendar} accent="#7C3AED" bg="#EDE9FE" href="/(admin)/orders?tab=custom&customFilter=next5" highlight />
          <DashCard label="Unpaid Customize Order" value={val(metrics.unpaidCustomOrders)} icon={AlertCircle} accent="#DC2626" bg="#FEE2E2" href="/(admin)/orders?tab=custom&customFilter=unpaid" />
          <DashCard label="Pending Customize Order" value={val(metrics.pendingCustomOrdersCount)} icon={Flower2} accent="#92400E" bg="#FEF3C7" href="/(admin)/orders?tab=custom&customFilter=pending" />
        </View>
      </View>

      {/* ── DELIVERY DETAILS ── */}
      <View style={wStyles.groupCard}>
        <View style={wStyles.groupHeader}>
          <Text style={wStyles.groupTitle}>DELIVERY DETAILS</Text>
        </View>
        <View style={wStyles.cardRow}>
          <DashCard label="Today Delivery" value={val(metrics.deliveryToday)} icon={Truck} accent="#15803D" bg="#DCFCE7" href="/(admin)/orders?subFilter=delivery_today" highlight />
          <DashCard label="Tomorrow Delivery" value={val(metrics.deliveryTomorrow)} icon={Truck} accent="#0369A1" bg="#E0F2FE" href="/(admin)/orders?subFilter=delivery_tomorrow" />
        </View>
      </View>

      {/* ── FINANCE DETAILS ── */}
      <View style={wStyles.groupCard}>
        <View style={wStyles.groupHeader}>
          <Text style={wStyles.groupTitle}>FINANCE DETAILS</Text>
        </View>
        <View style={wStyles.cardRow}>
          <DashCard label="Today Payment Received" value={money(metrics.todayPaymentReceived)} icon={Banknote} accent="#15803D" bg="#DCFCE7" href="/(admin)/finance" highlight />
          <DashCard label="Today Expenses" value={moneyRaw(metrics.todayExpenses)} icon={ReceiptText} accent="#DC2626" bg="#FEE2E2" href="/(admin)/expenses" />
        </View>
      </View>

      {/* Recent tables */}
      <View style={wStyles.tablesRow}>
        <View style={wStyles.tableCard}>
          <View style={wStyles.tableHeader}>
            <Text style={wStyles.tableTitle}>Recent Orders</Text>
            <TouchableOpacity style={wStyles.viewAllBtn} onPress={() => router.push('/(admin)/orders')} activeOpacity={0.7}>
              <Text style={wStyles.viewAllText}>View all</Text>
              <ChevronRight size={14} color={MD3.primary} />
            </TouchableOpacity>
          </View>
          <View style={wStyles.tableHead}>
            <Text style={[wStyles.thCell, { flex: 2 }]}>Customer</Text>
            <Text style={[wStyles.thCell, { flex: 2 }]}>Plan</Text>
            <Text style={[wStyles.thCell, { flex: 1 }]}>Date</Text>
            <Text style={[wStyles.thCell, { flex: 1 }]}>Status</Text>
          </View>
          {recentOrders.length === 0 ? (
            <View style={wStyles.emptyState}><Text style={wStyles.emptyText}>No orders yet</Text></View>
          ) : (
            recentOrders.map((order: any, i: number) => (
              <TouchableOpacity key={order.id} style={[wStyles.tableRow, i % 2 === 1 && wStyles.tableRowAlt]} onPress={() => router.push({ pathname: '/(admin)/order-detail', params: { id: order.id } })} activeOpacity={0.7}>
                <View style={[{ flex: 2 }, wStyles.tdWithAvatar]}>
                  <View style={wStyles.rowAvatar}><Text style={wStyles.rowAvatarText}>{(order.user?.full_name ?? order.user?.mobile ?? '?')[0]?.toUpperCase()}</Text></View>
                  <Text style={wStyles.tdCell} numberOfLines={1}>{order.user?.full_name ?? order.user?.mobile ?? '—'}</Text>
                </View>
                <Text style={[wStyles.tdCell, { flex: 2 }]} numberOfLines={1}>{order.subscription?.plan?.name ?? '—'}</Text>
                <Text style={[wStyles.tdCell, wStyles.tdMuted, { flex: 1 }]}>{order.scheduled_date ? format(new Date(order.scheduled_date), 'dd MMM') : '—'}</Text>
                <View style={{ flex: 1 }}><StatusChip status={order.status} /></View>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={[wStyles.tableCard, wStyles.tableCardNarrow]}>
          <View style={wStyles.tableHeader}>
            <Text style={wStyles.tableTitle}>New Customers</Text>
            <TouchableOpacity style={wStyles.viewAllBtn} onPress={() => router.push('/(admin)/customers')} activeOpacity={0.7}>
              <Text style={wStyles.viewAllText}>View all</Text>
              <ChevronRight size={14} color={MD3.primary} />
            </TouchableOpacity>
          </View>
          {recentCustomers.length === 0 ? (
            <View style={wStyles.emptyState}><Text style={wStyles.emptyText}>No customers yet</Text></View>
          ) : (
            recentCustomers.map((c: any, i: number) => (
              <TouchableOpacity key={c.id} style={[wStyles.customerRow, i % 2 === 1 && wStyles.tableRowAlt]} onPress={() => router.push({ pathname: '/(admin)/customer-detail', params: { id: c.id } })} activeOpacity={0.7}>
                <View style={wStyles.customerAvatar}><Text style={wStyles.customerAvatarText}>{c.full_name?.[0]?.toUpperCase() ?? c.mobile?.[0] ?? '?'}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={wStyles.customerName} numberOfLines={1}>{c.full_name ?? 'Unnamed'}</Text>
                  <Text style={wStyles.customerMobile} numberOfLines={1}>{c.mobile}</Text>
                </View>
                <Text style={wStyles.customerDate}>{c.created_at ? format(new Date(c.created_at), 'dd MMM') : ''}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function DashCard({ label, value, icon: Icon, accent, bg, href, highlight }: {
  label: string; value: string; icon: any; accent: string; bg: string; href: string; highlight?: boolean;
}) {
  return (
    <TouchableOpacity style={[wStyles.dashCard, highlight && { borderColor: accent, borderWidth: 1.5 }]} onPress={() => router.push(href as any)} activeOpacity={0.82}>
      <View style={[wStyles.dashIconWrap, { backgroundColor: bg }]}>
        <Icon size={18} color={accent} strokeWidth={1.8} />
      </View>
      <Text style={[wStyles.dashValue, { color: accent }]}>{value}</Text>
      <Text style={wStyles.dashLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const mStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[4],
    backgroundColor: MD3.surface,
    borderBottomWidth: 1,
    borderBottomColor: MD3.outlineVariant,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: MD3.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEyebrow: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: MD3.onSurfaceVariant,
    letterSpacing: 0.4,
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'],
    color: MD3.onSurface,
    letterSpacing: -0.3,
  },
  logoChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: MD3.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: { padding: Spacing[5], gap: Spacing[5], paddingBottom: Spacing[10] },
  dateText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: MD3.onSurfaceVariant,
    letterSpacing: 0.1,
  },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[3] },
  metricCard: {
    width: '47%',
    borderRadius: 20,
    padding: Spacing[4],
    gap: Spacing[2],
  },
  metricIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'],
    letterSpacing: -0.5,
    marginTop: 4,
  },
  metricLabel: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    letterSpacing: 0.2,
  },
  quickActionsRow: { flexDirection: 'row', gap: Spacing[3] },
  qaFilled: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[3] + 2,
    borderRadius: Radius.full,
    backgroundColor: MD3.primary,
  },
  qaFilledText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: MD3.onPrimary,
  },
  qaTonal: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[3] + 2,
    borderRadius: Radius.full,
    backgroundColor: MD3.primaryContainer,
  },
  qaTonalText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: MD3.primary,
  },
  section: { gap: Spacing[3] },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.lg,
    color: MD3.onSurface,
    letterSpacing: -0.1,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: MD3.primaryContainer,
    paddingHorizontal: Spacing[3],
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  seeAllText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: MD3.primary,
  },
  listCard: {
    backgroundColor: MD3.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: MD3.outlineVariant,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: MD3.surfaceContainer,
    gap: Spacing[3],
  },
  listRowLast: { borderBottomWidth: 0 },
  listAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: MD3.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  listAvatarText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: MD3.primary,
  },
  listInfo: { flex: 1, gap: 2 },
  listPrimary: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: MD3.onSurface,
  },
  listSecondary: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: MD3.onSurfaceVariant,
  },
  listRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  procurementSection: { gap: Spacing[3] },
  procurementGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[3] },
  procCard: {
    width: '47%',
    backgroundColor: MD3.surface,
    borderRadius: 16,
    padding: Spacing[4],
    gap: Spacing[2],
    borderWidth: 1,
    borderColor: MD3.outlineVariant,
    ...Shadow.sm,
  },
  procIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  procValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    color: MD3.onSurface,
    letterSpacing: -0.3,
  },
  procLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: MD3.onSurfaceVariant,
  },
  pauseBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.full,
    backgroundColor: '#FEF3C7',
  },
  pauseBadgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: '#B45309',
  },
  pauseEmptyCard: {
    backgroundColor: MD3.surface, borderRadius: 16, padding: Spacing[4],
    borderWidth: 1, borderColor: MD3.outlineVariant, alignItems: 'center',
  },
  pauseEmptyText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: MD3.onSurfaceVariant,
  },
  mDaysBadge: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full,
  },
  mDaysText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 12,
  },
});

const wStyles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 28, paddingBottom: 64, gap: 20 },

  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pageHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pageIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: MD3.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontFamily: Typography.fontFamily.bold, fontSize: 28, color: MD3.onSurface, letterSpacing: -0.5 },
  pageSubtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: MD3.onSurfaceVariant, marginTop: 2 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 9, borderRadius: Radius.full, backgroundColor: MD3.primaryContainer },
  refreshText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: MD3.primary },

  // Group card container
  groupCard: { backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden', ...Shadow.sm, borderWidth: 1, borderColor: '#E2E8F0' },
  groupHeader: { paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', backgroundColor: '#F8FAFC' },
  groupTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: '#64748B', letterSpacing: 1.4, textTransform: 'uppercase' },
  cardRow: { flexDirection: 'row', flexWrap: 'wrap', padding: 14, gap: 12 },

  // Individual dash card
  dashCard: { flex: 1, minWidth: 140, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 16, gap: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  dashIconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dashValue: { fontFamily: Typography.fontFamily.bold, fontSize: 26, letterSpacing: -0.5, lineHeight: 30 },
  dashLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11, color: '#64748B', lineHeight: 15 },

  // Tables section
  tablesRow: { flexDirection: 'row', gap: 18 },
  tableCard: { flex: 2, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden', ...Shadow.sm },
  tableCardNarrow: { flex: 1 },
  tableHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  tableTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: MD3.onSurface },
  viewAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: MD3.primaryContainer, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  viewAllText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: MD3.primary },
  tableHead: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  thCell: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: MD3.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.8 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  tableRowAlt: { backgroundColor: '#F8FAFC' },
  tdWithAvatar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: MD3.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  rowAvatarText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: MD3.primary },
  tdCell: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: MD3.onSurface },
  tdMuted: { color: MD3.onSurfaceVariant },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  customerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: MD3.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  customerAvatarText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: MD3.primary },
  customerName: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: MD3.onSurface },
  customerMobile: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: MD3.onSurfaceVariant },
  customerDate: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: MD3.onSurfaceVariant },
  emptyState: { paddingVertical: 32, alignItems: 'center' },
  emptyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: MD3.onSurfaceVariant },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: MD3.onSurface, letterSpacing: -0.1 },
});
