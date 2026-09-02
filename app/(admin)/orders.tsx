import React, { useEffect, useState, useCallback } from 'react';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Platform,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, ChevronRight, ChevronLeft, ChevronDown, Flower2, Package, Timer, CirclePause as PauseCircle, Download } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import StatusChip from '@/components/ui/StatusChip';
import { format } from 'date-fns';

type OrderTab = 'subscription' | 'custom';
type SubStatusFilter = 'all' | 'active' | 'pending' | 'expired' | 'paused' | 'paused_today' | 'paused_tomorrow' | 'expiring_soon' | 'resumed_today' | 'resumed_tomorrow' | 'new_today' | 'renewed_today' | 'end_today' | 'delivery_today' | 'delivery_tomorrow';
type CustomFilter = 'all' | 'today' | 'next5' | 'unpaid' | 'pending';

const SUB_STATUS_FILTERS: { label: string; value: SubStatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Today Delivery', value: 'delivery_today' },
  { label: 'Tomorrow Delivery', value: 'delivery_tomorrow' },
  { label: 'New Today', value: 'new_today' },
  { label: 'Renewed Today', value: 'renewed_today' },
  { label: 'Active', value: 'active' },
  { label: 'Pending', value: 'pending' },
  { label: 'Expired', value: 'expired' },
  { label: 'Ends Today', value: 'end_today' },
  { label: 'Paused', value: 'paused' },
  { label: 'Paused Today', value: 'paused_today' },
  { label: 'Tomorrow Paused', value: 'paused_tomorrow' },
  { label: 'Expiring Soon', value: 'expiring_soon' },
  { label: 'Today Resumed', value: 'resumed_today' },
  { label: 'Tomorrow Resumed', value: 'resumed_tomorrow' },
];

const CUSTOM_FILTERS: { label: string; value: CustomFilter }[] = [
  { label: 'All', value: 'all' },
  { label: "Today's Orders", value: 'today' },
  { label: 'Next 5 Days', value: 'next5' },
  { label: 'Unpaid', value: 'unpaid' },
  { label: 'Pending', value: 'pending' },
];

export default function AdminOrdersScreen() {
  return (
    <ModuleGuard module="orders">
      <AdminOrdersScreenContent />
    </ModuleGuard>
  );
}

function AdminOrdersScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const params = useLocalSearchParams<{ tab?: string; subFilter?: string; customFilter?: CustomFilter }>();

  const [activeTab, setActiveTab] = useState<OrderTab>(params.tab === 'custom' ? 'custom' : 'subscription');
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [customOrders, setCustomOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [subFilter, setSubFilter] = useState<SubStatusFilter>((params.subFilter as SubStatusFilter) ?? 'all');
  const [customFilter, setCustomFilter] = useState<CustomFilter>(params.customFilter ?? 'all');
  const [customError, setCustomError] = useState('');
  const [search, setSearch] = useState('');
  const [activeUserIds, setActiveUserIds] = useState<Set<string>>(new Set());
  const [newTodayUserIds, setNewTodayUserIds] = useState<Set<string>>(new Set());
  const [renewedTodayUserIds, setRenewedTodayUserIds] = useState<Set<string>>(new Set());
  const [riderMap, setRiderMap] = useState<Record<string, string>>({});
  const [addressMap, setAddressMap] = useState<Record<string, any>>({});
  const [customAddressMap, setCustomAddressMap] = useState<Record<string, any>>({});
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;

  useEffect(() => {
    if (params.tab === 'custom') setActiveTab('custom');
    if (params.subFilter) setSubFilter(params.subFilter as SubStatusFilter);
    if (params.customFilter) setCustomFilter(params.customFilter);
  }, [params.tab, params.subFilter, params.customFilter]);

  const load = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      const next5 = new Date();
      next5.setDate(next5.getDate() + 5);
      const next5Str = next5.toISOString().split('T')[0];

      // Subscription query
      let subQuery = supabase
        .from('subscriptions')
        .select('id, user_id, status, start_date, end_date, new_end_date, pause_start_date, pause_until, created_at, user:profiles(full_name, mobile), plan:subscription_plans(name, frequency, image_url, price, mrp_price), orders(id, scheduled_date, status)')
        .order('created_at', { ascending: false })
        .limit(200);

      if (subFilter === 'delivery_today') {
        // Active subscriptions delivering today: active, started on/before today, not expired via effective end date, not paused today
        subQuery = subQuery
          .eq('status', 'active')
          .lte('start_date', today)
          .or(`new_end_date.gte.${today},and(new_end_date.is.null,or(end_date.is.null,end_date.gte.${today}))`)
          .or(`pause_until.is.null,pause_until.lt.${today}`);
      } else if (subFilter === 'delivery_tomorrow') {
        // Active subscriptions delivering tomorrow: active, started on/before tomorrow, not expired via effective end date, not paused tomorrow
        subQuery = subQuery
          .eq('status', 'active')
          .lte('start_date', tomorrowStr)
          .or(`new_end_date.gte.${tomorrowStr},and(new_end_date.is.null,or(end_date.is.null,end_date.gte.${tomorrowStr}))`)
          .or(`pause_until.is.null,pause_until.lt.${tomorrowStr}`);
      } else if (subFilter === 'paused' || subFilter === 'paused_today') {
        // Fetch all subscriptions, then filter pause dates client-side (PostgREST nested or/and is unreliable)
      } else if (subFilter === 'paused_tomorrow') {
        // Fetch all subscriptions, then filter pause dates client-side (PostgREST nested or/and is unreliable)
      } else if (subFilter === 'active') {
        subQuery = subQuery
          .eq('status', 'active')
          .or(`pause_until.is.null,pause_until.lt.${today}`);
      } else if (subFilter === 'pending') {
        subQuery = subQuery.eq('status', 'pending');
      } else if (subFilter === 'expired') {
        subQuery = subQuery.eq('status', 'expired');
      } else if (subFilter === 'expiring_soon') {
        subQuery = subQuery
          .eq('status', 'active')
          .gte('new_end_date', today)
          .lte('new_end_date', next5Str)
          .order('new_end_date', { ascending: true });
      } else if (subFilter === 'resumed_today') {
        subQuery = subQuery.eq('status', 'active').eq('pause_until', yesterdayStr);
      } else if (subFilter === 'resumed_tomorrow') {
        subQuery = subQuery.eq('status', 'active').eq('pause_until', today);
      } else if (subFilter === 'end_today') {
        // Ends Today = effective end date (new_end_date if set, else end_date) equals today
        subQuery = subQuery
          .in('status', ['active', 'pending'])
          .or(`new_end_date.eq.${today},and(new_end_date.is.null,end_date.eq.${today})`)
          .order('new_end_date', { ascending: true });
      } else if (subFilter === 'new_today' || subFilter === 'renewed_today') {
        // Subscriptions created today — match dashboard which uses created_at
        const todayStart = `${today}T00:00:00.000Z`;
        const todayEnd = `${today}T23:59:59.999Z`;
        subQuery = subQuery.gte('created_at', todayStart).lte('created_at', todayEnd);
      }
      // 'all' — no status filter, fetch every subscription

      // Custom orders query with filter applied server-side where possible
      let customQuery = supabase
        .from('custom_orders')
        .select('*, user:profiles(full_name, mobile)')
        .order('created_at', { ascending: false })
        .limit(200);

      if (customFilter === 'today') {
        customQuery = customQuery.eq('delivery_date', today);
      } else if (customFilter === 'next5') {
        customQuery = customQuery.gt('delivery_date', today).lte('delivery_date', next5Str);
      } else if (customFilter === 'unpaid') {
        customQuery = customQuery.eq('status', 'confirmed').neq('payment_status', 'paid');
      } else if (customFilter === 'pending') {
        customQuery = customQuery.not('status', 'in', '("delivered","cancelled")');
      }

      // No auxiliary query needed for expired filter (status-based)
      const activeIdsQuery = null;

      // For new_today / renewed_today: fetch prior subscriptions (created before today) per user
      // Uses created_at to match dashboard metric calculation
      const todaySubsQuery = (subFilter === 'new_today' || subFilter === 'renewed_today')
        ? supabase.from('subscriptions').select('user_id').lt('created_at', `${today}T00:00:00.000Z`)
        : null;

      const riderAssignQuery = supabase
        .from('rider_order_assignments')
        .select('order_id, status, rider:riders(full_name)')
        .in('status', ['assigned', 'accepted', 'picked_up'])
        .limit(500);

      const [{ data: subData }, { data: customData, error: customErr }, activeIdsRes, priorSubsRes, riderAssignRes] = await Promise.all([
        subQuery,
        customQuery,
        activeIdsQuery ?? Promise.resolve({ data: null }),
        todaySubsQuery ?? Promise.resolve({ data: null }),
        riderAssignQuery,
      ]);

      const subUserIds = (subData ?? []).map((s: any) => s.user_id);
      const addressRes = subUserIds.length > 0
        ? await supabase.from('addresses').select('user_id, street, apartment_name, place_category, landmark, locality_id, is_default').in('user_id', subUserIds).order('is_default', { ascending: false })
        : { data: null };
      if (subData) setSubscriptions(subData);
      if (customData) setCustomOrders(customData);
      if (activeIdsRes?.data) {
        setActiveUserIds(new Set((activeIdsRes.data as any[]).map((r) => r.user_id)));
      } else {
        setActiveUserIds(new Set());
      }

      if (priorSubsRes?.data) {
        const usersWithPriorSubs = new Set((priorSubsRes.data as any[]).map((r) => r.user_id));
        const newIds = new Set<string>();
        const renewedIds = new Set<string>();
        (subData ?? []).forEach((s: any) => {
          if (usersWithPriorSubs.has(s.user_id)) renewedIds.add(s.user_id);
          else newIds.add(s.user_id);
        });
        setNewTodayUserIds(newIds);
        setRenewedTodayUserIds(renewedIds);
      } else {
        setNewTodayUserIds(new Set());
        setRenewedTodayUserIds(new Set());
      }
      if (riderAssignRes?.data) {
        const map: Record<string, string> = {};
        (riderAssignRes.data as any[]).forEach((a) => {
          const riderName = (a as any).rider?.full_name;
          if (riderName) map[(a as any).order_id] = riderName;
        });
        setRiderMap(map);
      } else {
        setRiderMap({});
      }
      if (addressRes?.data) {
        const amap: Record<string, any> = {};
        (addressRes.data as any[]).forEach((a) => {
          if (!amap[a.user_id]) amap[a.user_id] = a;
        });
        setAddressMap(amap);
      } else {
        setAddressMap({});
      }
      if (customErr) setCustomError(customErr.message);

      const customAddressIds = (customData ?? []).map((o: any) => o.address_id).filter(Boolean);
      const customAddrRes = customAddressIds.length > 0
        ? await supabase.from('addresses').select('id, street, apartment_name, landmark, locality_id, city, state, pincode').in('id', customAddressIds)
        : { data: null };
      if (customAddrRes?.data) {
        const cmap: Record<string, any> = {};
        (customAddrRes.data as any[]).forEach((a) => { cmap[a.id] = a; });
        setCustomAddressMap(cmap);
      } else {
        setCustomAddressMap({});
      }
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { setCurrentPage(1); }, [subFilter, customFilter, search, activeTab]);
  useEffect(() => { load(); }, [subFilter, customFilter]);
  usePageVisibility(load);
  useFocusEffect(useCallback(() => { load(); }, [subFilter, customFilter]));

  const filteredSubs = subscriptions.filter((s) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = tomorrowDate.toISOString().split('T')[0];
    // Paused filters: check pause dates client-side since server-side or/and is unreliable
    if (subFilter === 'paused' || subFilter === 'paused_today') {
      const hasPauseDates = s.pause_start_date && s.pause_until;
      const dateCoversToday = hasPauseDates && s.pause_start_date <= todayStr && s.pause_until >= todayStr;
      return s.status === 'paused' || !!dateCoversToday;
    }
    if (subFilter === 'paused_tomorrow') {
      const hasPauseDates = s.pause_start_date && s.pause_until;
      const dateCoversTomorrow = hasPauseDates && s.pause_start_date <= tomorrowStr && s.pause_until >= tomorrowStr;
      return (s.status === 'active' || s.status === 'paused') && !!dateCoversTomorrow;
    }
    // No client-side filtering needed for expired (status-based)
    // new_today: only first-time subscribers (no prior subs before today)
    if (subFilter === 'new_today' && renewedTodayUserIds.has(s.user_id)) return false;
    // renewed_today: only users who had prior subscriptions
    if (subFilter === 'renewed_today' && newTodayUserIds.has(s.user_id)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const name = s.user?.full_name?.toLowerCase() ?? '';
    const mobile = s.user?.mobile ?? '';
    const addr = addressMap[s.user_id] as any;
    const apartment = addr?.apartment_name?.toLowerCase() ?? '';
    const flatPlot = (addr?.street ?? '').toLowerCase();
    return name.includes(q) || mobile.includes(q) || apartment.includes(q) || flatPlot.includes(q);
  });

  const filteredCustom = customOrders.filter((o) => {
    if (!search) return true;
    const name = o.user?.full_name?.toLowerCase() ?? '';
    const mobile = o.user?.mobile ?? '';
    const addr = customAddressMap[o.address_id] as any;
    const apartment = addr?.apartment_name?.toLowerCase() ?? '';
    const street = (addr?.street ?? '').toLowerCase();
    return name.includes(search.toLowerCase()) || mobile.includes(search) || apartment.includes(search.toLowerCase()) || street.includes(search.toLowerCase());
  });

  const pagedSubs = filteredSubs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pagedCustom = filteredCustom.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const totalSubPages = Math.ceil(filteredSubs.length / PAGE_SIZE);
  const totalCustomPages = Math.ceil(filteredCustom.length / PAGE_SIZE);
  const totalPages = activeTab === 'subscription' ? totalSubPages : totalCustomPages;

  const escapeCsv = (val: string) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const exportCsv = () => {
    const rows: { name: string; address: string; date: string; status: string }[] = [];
    if (activeTab === 'subscription') {
      filteredSubs.forEach((s: any) => {
        const addr = addressMap[s.user_id] as any;
        const addrParts = [addr?.apartment_name, addr?.street, addr?.landmark].filter(Boolean);
        const orders: any[] = s.orders ?? [];
        const dateStr = orders.length > 0
          ? format(new Date(orders[0].scheduled_date), 'dd MMM yyyy')
          : s.start_date ? format(new Date(s.start_date), 'dd MMM yyyy') : '—';
        rows.push({
          name: s.user?.full_name ?? `+91 ${s.user?.mobile ?? ''}`,
          address: addrParts.join(', ') || '—',
          date: dateStr,
          status: getSubDisplayStatus(s) ?? '—',
        });
      });
    } else {
      filteredCustom.forEach((o: any) => {
        const addr = customAddressMap[o.address_id] as any;
        const addrParts = [addr?.apartment_name, addr?.street, addr?.landmark].filter(Boolean);
        rows.push({
          name: o.user?.full_name ?? `+91 ${o.user?.mobile ?? ''}`,
          address: addrParts.join(', ') || '—',
          date: o.delivery_date ? format(new Date(o.delivery_date), 'dd MMM yyyy') : '—',
          status: o.status ?? '—',
        });
      });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    const seen = new Set<string>();
    const uniqueRows = rows.filter((r) => {
      const key = r.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const header = ['Customer Name', 'Address', 'Date', 'Status'];
    const lines = [header.join(','), ...uniqueRows.map((r) => [escapeCsv(r.name), escapeCsv(r.address), escapeCsv(r.date), escapeCsv(r.status)].join(','))];
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `orders_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const navigateToSubOrder = (sub: any) => {
    const orders: any[] = sub.orders ?? [];
    if (orders.length === 0) {
      router.push({ pathname: '/(admin)/customer-detail', params: { id: sub.user_id } });
      return;
    }
    const todayStr = new Date().toISOString().split('T')[0];
    // Prefer today's order, then nearest upcoming, then most recent past
    const todayOrder = orders.find((o: any) => o.scheduled_date === todayStr);
    if (todayOrder) { router.push({ pathname: '/(admin)/order-detail', params: { id: todayOrder.id } }); return; }
    const upcoming = orders
      .filter((o: any) => o.scheduled_date >= todayStr)
      .sort((a: any, b: any) => a.scheduled_date.localeCompare(b.scheduled_date));
    if (upcoming.length > 0) { router.push({ pathname: '/(admin)/order-detail', params: { id: upcoming[0].id } }); return; }
    const past = orders
      .filter((o: any) => o.scheduled_date < todayStr)
      .sort((a: any, b: any) => b.scheduled_date.localeCompare(a.scheduled_date));
    router.push({ pathname: '/(admin)/order-detail', params: { id: past[0].id } });
  };

  const getEffectiveEndDate = (sub: any) => sub.new_end_date ?? sub.end_date ?? null;

  const getSubStatusIcon = (sub: any) => {
    const today = new Date().toISOString().split('T')[0];
    const isPaused = sub.status === 'paused' || (sub.pause_start_date && sub.pause_until && sub.pause_start_date <= today && sub.pause_until >= today);
    if (isPaused) return <PauseCircle size={16} color="#B45309" />;
    const effectiveEnd = getEffectiveEndDate(sub);
    if (effectiveEnd && effectiveEnd < today) return <Timer size={16} color="#DC2626" />;
    return <Package size={16} color={Colors.primary} />;
  };

  const getSubBgColor = (sub: any) => {
    const today = new Date().toISOString().split('T')[0];
    const isPaused = sub.status === 'paused' || (sub.pause_start_date && sub.pause_until && sub.pause_start_date <= today && sub.pause_until >= today);
    if (isPaused) return '#FEF3C7';
    const effectiveEnd = getEffectiveEndDate(sub);
    if (effectiveEnd && effectiveEnd < today) return '#FEE2E2';
    return Colors.primarySurface;
  };

  const getSubDisplayStatus = (sub: any) => {
    const today = new Date().toISOString().split('T')[0];
    const isPaused = sub.status === 'paused' || (sub.pause_start_date && sub.pause_until && sub.pause_start_date <= today && sub.pause_until >= today);
    if (isPaused) return 'paused';
    const effectiveEnd = getEffectiveEndDate(sub);
    if (effectiveEnd && effectiveEnd < today) return 'expired';
    return sub.status;
  };

  const getSubRider = (sub: any) => {
    const orders: any[] = sub.orders ?? [];
    if (orders.length === 0) return null;
    const todayStr = new Date().toISOString().split('T')[0];
    const todayOrder = orders.find((o: any) => o.scheduled_date === todayStr);
    const targetOrder = todayOrder ?? orders[0];
    return riderMap[targetOrder.id] ?? null;
  };

  if (isWeb) {
    return (
      <ScrollView style={webStyles.scroll} contentContainerStyle={webStyles.content} showsVerticalScrollIndicator={false}>
        <View style={webStyles.pageHeader}>
          <View>
            <Text style={webStyles.pageTitle}>
              {activeTab === 'subscription' && subFilter === 'paused'
                ? 'Total Paused Subscriptions'
                : activeTab === 'subscription' && subFilter === 'paused_today'
                ? 'Today Paused Subscriptions'
                : activeTab === 'subscription' && subFilter === 'paused_tomorrow'
                ? 'Tomorrow Paused Subscriptions'
                : activeTab === 'subscription' && subFilter === 'resumed_today'
                ? 'Today Resumed Subscriptions'
                : activeTab === 'subscription' && subFilter === 'resumed_tomorrow'
                ? 'Tomorrow Resumed Subscriptions'
                : activeTab === 'subscription' && subFilter === 'new_today'
                ? 'New Subscriptions Today'
                : activeTab === 'subscription' && subFilter === 'renewed_today'
                ? 'Renewed Subscriptions Today'
                : 'Orders'}
            </Text>
            <Text style={webStyles.pageSubtitle}>
              {activeTab === 'subscription'
                ? subFilter === 'paused'
                  ? `${filteredSubs.length} currently paused subscription${filteredSubs.length !== 1 ? 's' : ''}`
                  : subFilter === 'paused_today'
                  ? `${filteredSubs.length} subscription${filteredSubs.length !== 1 ? 's' : ''} paused today`
                  : subFilter === 'paused_tomorrow'
                  ? `${filteredSubs.length} subscription${filteredSubs.length !== 1 ? 's' : ''} pausing tomorrow`
                  : subFilter === 'resumed_today'
                  ? `${filteredSubs.length} subscription${filteredSubs.length !== 1 ? 's' : ''} resuming today`
                  : subFilter === 'resumed_tomorrow'
                  ? `${filteredSubs.length} subscription${filteredSubs.length !== 1 ? 's' : ''} resuming tomorrow`
                  : subFilter === 'new_today'
                  ? `${filteredSubs.length} first-time subscription${filteredSubs.length !== 1 ? 's' : ''} started today`
                  : subFilter === 'renewed_today'
                  ? `${filteredSubs.length} renewed subscription${filteredSubs.length !== 1 ? 's' : ''} started today`
                  : `${filteredSubs.length} subscription${filteredSubs.length !== 1 ? 's' : ''}`
                : `${filteredCustom.length} custom order${filteredCustom.length !== 1 ? 's' : ''}`}
            </Text>
          </View>
          <TouchableOpacity style={webStyles.exportBtn} onPress={exportCsv} activeOpacity={0.8}>
            <Download size={15} color={Colors.white} strokeWidth={2} />
            <Text style={webStyles.exportBtnText}>Export</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Toggle */}
        <View style={webStyles.tabRow}>
          <TouchableOpacity
            style={[webStyles.tabBtn, activeTab === 'subscription' && webStyles.tabBtnActive]}
            onPress={() => setActiveTab('subscription')}
          >
            <Text style={[webStyles.tabBtnText, activeTab === 'subscription' && webStyles.tabBtnTextActive]}>
              Subscription Orders
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[webStyles.tabBtn, activeTab === 'custom' && webStyles.tabBtnActive]}
            onPress={() => setActiveTab('custom')}
          >
            <Flower2 size={14} color={activeTab === 'custom' ? Colors.white : Colors.textTertiary} />
            <Text style={[webStyles.tabBtnText, activeTab === 'custom' && webStyles.tabBtnTextActive]}>
              Custom Orders
            </Text>
            {customOrders.filter(o => o.status === 'pending').length > 0 && (
              <View style={webStyles.badge}>
                <Text style={webStyles.badgeText}>{customOrders.filter(o => o.status === 'pending').length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={[webStyles.tableCard, { overflow: 'visible' }]}>
          <View style={[webStyles.toolbar, { overflow: 'visible', zIndex: 10 }]}>
            <View style={webStyles.searchBar}>
              <Search size={15} color={Colors.textTertiary} />
              <TextInput
                style={webStyles.searchInput}
                placeholder="Search by name, mobile, apartment or flat no..."
                placeholderTextColor={Colors.textDisabled}
                value={search}
                onChangeText={setSearch}
              />
            </View>
            {activeTab === 'subscription' ? (
              <View style={[webStyles.dropdownWrap, { overflow: 'visible', zIndex: 10 }]}>
                <Text style={webStyles.dropdownLabel}>Status</Text>
                <View style={[webStyles.dropdownBtnWrap, { overflow: 'visible', zIndex: 10 }]}>
                  <TouchableOpacity style={webStyles.dropdown} onPress={() => setStatusDropdownOpen(!statusDropdownOpen)} activeOpacity={0.7}>
                    <Text style={webStyles.dropdownText} numberOfLines={1}>
                      {SUB_STATUS_FILTERS.find((f) => f.value === subFilter)?.label ?? 'All'}
                    </Text>
                    <ChevronDown size={14} color={Colors.textTertiary} />
                  </TouchableOpacity>
                  {statusDropdownOpen && (
                    <View style={webStyles.dropdownMenu}>
                      <ScrollView style={webStyles.dropdownScroll} showsVerticalScrollIndicator={false}>
                        {SUB_STATUS_FILTERS.map((f) => (
                          <TouchableOpacity
                            key={f.value}
                            style={[webStyles.dropdownItem, subFilter === f.value && webStyles.dropdownItemActive]}
                            onPress={() => { setSubFilter(f.value as SubStatusFilter); setStatusDropdownOpen(false); }}
                          >
                            <Text style={[webStyles.dropdownItemText, subFilter === f.value && webStyles.dropdownItemTextActive]}>
                              {f.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              </View>
            ) : (
              <View style={webStyles.filterRow}>
                {CUSTOM_FILTERS.map((f) => (
                  <TouchableOpacity
                    key={f.value}
                    style={[webStyles.filterChip, customFilter === f.value && webStyles.filterChipActive]}
                    onPress={() => setCustomFilter(f.value as CustomFilter)}
                  >
                    <Text style={[webStyles.filterChipText, customFilter === f.value && webStyles.filterChipTextActive]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {activeTab === 'subscription' ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={webStyles.tableScroll}>
            <View style={webStyles.tableInner}>
              <View style={webStyles.tableHead}>
                <Text style={[webStyles.thCell, webStyles.colCustomer]}>Customer</Text>
                <Text style={[webStyles.thCell, webStyles.colAddress]}>Address</Text>
                <Text style={[webStyles.thCell, webStyles.colPlan]}>Plan</Text>
                <Text style={[webStyles.thCell, webStyles.colPeriod]}>Subscription Period</Text>
                <Text style={[webStyles.thCell, webStyles.colPrice]}>Price</Text>
                <Text style={[webStyles.thCell, webStyles.colStatus]}>Status</Text>
                <Text style={[webStyles.thCell, webStyles.colChevron]}></Text>
              </View>
              {!loading && filteredSubs.length === 0 ? (
                <View style={webStyles.emptyState}><Text style={webStyles.emptyText}>No subscriptions found.</Text></View>
              ) : (
                pagedSubs.map((sub, i) => (
                  <TouchableOpacity
                    key={sub.id}
                    style={[webStyles.tableRow, i % 2 === 1 && webStyles.tableRowAlt]}
                    onPress={() => navigateToSubOrder(sub)}
                  >
                    <View style={[webStyles.customerCell, webStyles.colCustomer]}>
                      <View style={[webStyles.iconBlock, { backgroundColor: getSubBgColor(sub) }]}>
                        {getSubStatusIcon(sub)}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={webStyles.customerName} numberOfLines={1}>{sub.user?.full_name ?? `+91 ${sub.user?.mobile}`}</Text>
                        <Text style={webStyles.customerMobile}>+91 {sub.user?.mobile}</Text>
                      </View>
                    </View>
                    <View style={webStyles.colAddress}>
                      {(() => {
                        const addr = addressMap[sub.user_id] as any;
                        if (!addr) return <Text style={webStyles.tdMuted}>—</Text>;
                        const parts = [addr.apartment_name, addr.street, addr.landmark].filter(Boolean);
                        return <Text style={webStyles.tdMuted} numberOfLines={3}>{parts.join(', ') || '—'}</Text>;
                      })()}
                    </View>
                    <Text style={[webStyles.tdCell, webStyles.colPlan]} numberOfLines={1}>{sub.plan?.name ?? '—'}</Text>
                    <View style={webStyles.colPeriod}>
                      <Text style={webStyles.tdMuted} numberOfLines={1}>
                        {sub.start_date ? format(new Date(sub.start_date), 'dd MMM yyyy') : '—'}
                      </Text>
                      <Text style={webStyles.tdMuted} numberOfLines={1}>
                        {(sub.new_end_date ?? sub.end_date) ? format(new Date(sub.new_end_date ?? sub.end_date), 'dd MMM yyyy') : 'Ongoing'}
                      </Text>
                    </View>
                    <Text style={[webStyles.tdCell, webStyles.colPrice]}>₹{sub.plan?.price != null ? Math.round(sub.plan.price / 100) : '—'}</Text>
                    <View style={webStyles.colStatus}><StatusChip status={getSubDisplayStatus(sub)} /></View>
                    <View style={[webStyles.colChevron, { alignItems: 'flex-end' }]}><ChevronRight size={16} color={Colors.neutral[400]} /></View>
                  </TouchableOpacity>
                ))
              )}
            </View>
            </ScrollView>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={webStyles.tableScroll}>
            <View style={webStyles.tableInner}>
              <View style={webStyles.tableHead}>
                <Text style={[webStyles.thCell, webStyles.colCustomer]}>Customer</Text>
                <Text style={[webStyles.thCell, webStyles.colAddress]}>Address</Text>
                <Text style={[webStyles.thCell, webStyles.colType]}>Type</Text>
                <Text style={[webStyles.thCell, webStyles.colItems]}>Items</Text>
                <Text style={[webStyles.thCell, webStyles.colDate]}>Delivery Date</Text>
                <Text style={[webStyles.thCell, webStyles.colStatus]}>Status</Text>
                <Text style={[webStyles.thCell, webStyles.colChevron]}></Text>
              </View>
              {customError ? (
                <View style={webStyles.emptyState}><Text style={[webStyles.emptyText, { color: 'red' }]}>Error: {customError}</Text></View>
              ) : !loading && filteredCustom.length === 0 ? (
                <View style={webStyles.emptyState}><Text style={webStyles.emptyText}>No custom orders found.</Text></View>
              ) : (
                pagedCustom.map((order, i) => (
                  <TouchableOpacity
                    key={order.id}
                    style={[webStyles.tableRow, i % 2 === 1 && webStyles.tableRowAlt]}
                    onPress={() => router.push({ pathname: '/(admin)/custom-order-detail', params: { id: order.id } })}
                  >
                    <View style={[webStyles.customerCell, webStyles.colCustomer]}>
                      <View style={[webStyles.iconBlock, { backgroundColor: Colors.primarySurface }]}>
                        <Flower2 size={16} color={Colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={webStyles.customerName} numberOfLines={1}>{order.user?.full_name ?? `+91 ${order.user?.mobile}`}</Text>
                        <Text style={webStyles.customerMobile}>+91 {order.user?.mobile}</Text>
                      </View>
                    </View>
                    <View style={webStyles.colAddress}>
                      {(() => {
                        const addr = customAddressMap[order.address_id] as any;
                        if (!addr) return <Text style={webStyles.tdMuted}>—</Text>;
                        const parts = [addr.apartment_name, addr.street, addr.landmark].filter(Boolean);
                        return <Text style={webStyles.tdMuted} numberOfLines={3}>{parts.join(', ') || '—'}</Text>;
                      })()}
                    </View>
                    <Text style={[webStyles.tdCell, webStyles.colType]}>
                      {order.order_type === 'garland' ? 'Garland' : 'Flower'}
                    </Text>
                    <View style={webStyles.colItems}>
                      {(order.items as any[]).slice(0, 2).map((item: any, j: number) => (
                        <Text key={j} style={webStyles.tdMuted} numberOfLines={1}>
                          {item.flower_name} · {item.quantity} {item.unit}
                        </Text>
                      ))}
                      {order.items.length > 2 && (
                        <Text style={webStyles.tdMuted}>+{order.items.length - 2} more</Text>
                      )}
                    </View>
                    <Text style={[webStyles.tdMuted, webStyles.colDate]}>
                      {format(new Date(order.delivery_date), 'dd MMM yyyy')}
                    </Text>
                    <View style={webStyles.colStatus}><StatusChip status={order.status} /></View>
                    <View style={[webStyles.colChevron, { alignItems: 'flex-end' }]}>
                      <ChevronRight size={16} color={Colors.neutral[400]} />
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
            </ScrollView>
          )}
          {totalPages > 1 && (
            <View style={webStyles.paginationBar}>
              <TouchableOpacity
                style={[webStyles.pageBtn, currentPage === 1 && webStyles.pageBtnDisabled]}
                disabled={currentPage === 1}
                onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={16} color={currentPage === 1 ? Colors.textDisabled : Colors.textSecondary} />
                <Text style={[webStyles.pageBtnText, currentPage === 1 && { color: Colors.textDisabled }]}>Prev</Text>
              </TouchableOpacity>
              <Text style={webStyles.pageInfo}>
                Page {currentPage} of {totalPages}
              </Text>
              <TouchableOpacity
                style={[webStyles.pageBtn, currentPage === totalPages && webStyles.pageBtnDisabled]}
                disabled={currentPage === totalPages}
                onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                <Text style={[webStyles.pageBtnText, currentPage === totalPages && { color: Colors.textDisabled }]}>Next</Text>
                <ChevronRight size={16} color={currentPage === totalPages ? Colors.textDisabled : Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    );
  }

  // ── Mobile layout ──
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {activeTab === 'subscription' && subFilter === 'paused'
            ? 'Paused Subscriptions'
            : activeTab === 'subscription' && subFilter === 'paused_today'
            ? 'Today Paused'
            : activeTab === 'subscription' && subFilter === 'paused_tomorrow'
            ? 'Tomorrow Paused'
            : activeTab === 'subscription' && subFilter === 'resumed_today'
            ? 'Today Resumed'
            : activeTab === 'subscription' && subFilter === 'resumed_tomorrow'
            ? 'Tomorrow Resumed'
            : 'Orders'}
        </Text>
        <Text style={styles.count}>
          {activeTab === 'subscription' ? `${filteredSubs.length}` : `${filteredCustom.length}`}
          {activeTab === 'subscription' && (subFilter === 'paused' || subFilter === 'paused_today' || subFilter === 'paused_tomorrow') ? ' paused'
            : activeTab === 'subscription' && (subFilter === 'resumed_today' || subFilter === 'resumed_tomorrow') ? ' resuming'
            : ' orders'}
        </Text>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'subscription' && styles.tabBtnActive]}
          onPress={() => setActiveTab('subscription')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'subscription' && styles.tabBtnTextActive]}>Subscription</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'custom' && styles.tabBtnActive]}
          onPress={() => setActiveTab('custom')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'custom' && styles.tabBtnTextActive]}>Custom</Text>
          {customOrders.filter(o => o.status === 'pending').length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{customOrders.filter(o => o.status === 'pending').length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <Search size={16} color={Colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or mobile..."
          placeholderTextColor={Colors.textDisabled}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {(activeTab === 'subscription' ? SUB_STATUS_FILTERS : CUSTOM_FILTERS).map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[
              styles.filterChip,
              (activeTab === 'subscription' ? subFilter : customFilter) === f.value && styles.filterChipActive,
            ]}
            onPress={() => {
              if (activeTab === 'subscription') setSubFilter(f.value as SubStatusFilter);
              else setCustomFilter(f.value as CustomFilter);
            }}
          >
            <Text style={[
              styles.filterChipText,
              (activeTab === 'subscription' ? subFilter : customFilter) === f.value && styles.filterChipTextActive,
            ]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {activeTab === 'subscription' ? (
          filteredSubs.length === 0 && !loading ? (
            <View style={styles.emptyState}>
              <Package size={32} color={Colors.textDisabled} />
              <Text style={styles.emptyText}>No subscriptions found.</Text>
            </View>
          ) : pagedSubs.map((sub) => (
            <TouchableOpacity
              key={sub.id}
              style={styles.orderCard}
              onPress={() => navigateToSubOrder(sub)}
              activeOpacity={0.85}
            >
              <View style={styles.orderLeft}>
                <View style={[styles.iconBlock, { backgroundColor: getSubBgColor(sub) }]}>
                  {getSubStatusIcon(sub)}
                </View>
              </View>
              <View style={styles.orderBody}>
                <Text style={styles.customerName}>{sub.user?.full_name ?? `+91 ${sub.user?.mobile}`}</Text>
                <Text style={styles.planName}>{sub.plan?.name ?? '—'}</Text>
                <Text style={styles.mobile}>+91 {sub.user?.mobile}</Text>
              </View>
              <View style={styles.orderRight}>
                <StatusChip status={getSubDisplayStatus(sub)} />
                <ChevronRight size={16} color={Colors.neutral[400]} />
              </View>
            </TouchableOpacity>
          ))
        ) : (
          filteredCustom.length === 0 && !loading ? (
            <View style={styles.emptyState}>
              <Flower2 size={32} color={Colors.textDisabled} />
              <Text style={styles.emptyText}>No custom orders found.</Text>
            </View>
          ) : pagedCustom.map((order) => (
            <TouchableOpacity
              key={order.id}
              style={styles.orderCard}
              onPress={() => router.push({ pathname: '/(admin)/custom-order-detail', params: { id: order.id } })}
              activeOpacity={0.85}
            >
              <View style={styles.orderLeft}>
                <View style={[styles.iconBlock, { backgroundColor: Colors.primarySurface }]}>
                  <Flower2 size={18} color={Colors.primary} />
                </View>
              </View>
              <View style={styles.orderBody}>
                <Text style={styles.customerName}>{order.user?.full_name ?? `+91 ${order.user?.mobile}`}</Text>
                {(() => {
                  const addr = customAddressMap[order.address_id] as any;
                  if (!addr) return null;
                  const parts = [addr.apartment_name, addr.street, addr.landmark].filter(Boolean);
                  return <Text style={styles.mobile} numberOfLines={1}>{parts.join(', ')}</Text>;
                })()}
                <Text style={styles.planName}>
                  {order.order_type === 'garland' ? 'Garland' : 'Flower'} · {format(new Date(order.delivery_date), 'dd MMM yyyy')}
                </Text>
                <Text style={styles.mobile}>
                  {(order.items as any[]).map((it: any) => `${it.flower_name} (${it.quantity} ${it.unit})`).join(', ')}
                </Text>
              </View>
              <View style={styles.orderRight}>
                <StatusChip status={order.status} />
                <ChevronRight size={16} color={Colors.neutral[400]} />
              </View>
            </TouchableOpacity>
          ))
        )}
        {totalPages > 1 && (
          <View style={styles.paginationBar}>
            <TouchableOpacity
              style={[styles.pageBtn, currentPage === 1 && styles.pageBtnDisabled]}
              disabled={currentPage === 1}
              onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} color={currentPage === 1 ? Colors.textDisabled : Colors.textSecondary} />
              <Text style={[styles.pageBtnText, currentPage === 1 && { color: Colors.textDisabled }]}>Prev</Text>
            </TouchableOpacity>
            <Text style={styles.pageInfo}>
              {currentPage} / {totalPages}
            </Text>
            <TouchableOpacity
              style={[styles.pageBtn, currentPage === totalPages && styles.pageBtnDisabled]}
              disabled={currentPage === totalPages}
              onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              <Text style={[styles.pageBtnText, currentPage === totalPages && { color: Colors.textDisabled }]}>Next</Text>
              <ChevronRight size={16} color={currentPage === totalPages ? Colors.textDisabled : Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'],
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  count: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginHorizontal: Spacing[5],
    marginTop: Spacing[3],
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    height: 36,
  },
  filterScroll: { maxHeight: 52 },
  filterContent: {
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[3],
    gap: Spacing[2],
  },
  filterChip: {
    paddingHorizontal: Spacing[3],
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  filterChipTextActive: { color: Colors.white },
  content: { padding: Spacing[5], gap: Spacing[3] },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  orderLeft: {},
  iconBlock: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderBody: { flex: 1, gap: 2 },
  customerName: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  planName: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
  },
  mobile: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  orderRight: { alignItems: 'flex-end', gap: Spacing[2] },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[3],
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: Colors.primary },
  tabBtnText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  tabBtnTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  badge: {
    backgroundColor: Colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 10,
    color: Colors.white,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  paginationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[3],
    paddingVertical: Spacing[3],
  },
  pageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  pageBtnDisabled: { opacity: 0.5 },
  pageBtnText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  pageInfo: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
});

const webStyles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#F7F7F4' },
  content: { padding: 32, paddingBottom: 64, gap: 24 },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  pageTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 28,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
  },
  exportBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.white,
  },
  tableCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'visible',
    ...Shadow.sm,
  },
  toolbar: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.neutral[50],
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    height: 24,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.neutral[50],
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
  },
  filterChipTextActive: { color: Colors.white },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: Colors.neutral[50],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  thCell: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  customerCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBlock: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerName: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  customerMobile: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  tdCell: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  tdMuted: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  emptyState: { paddingVertical: 48, alignItems: 'center' },
  emptyText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  tabBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabBtnText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  tabBtnTextActive: { color: Colors.white, fontFamily: Typography.fontFamily.sansSemiBold },
  badge: {
    backgroundColor: Colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 10,
    color: Colors.white,
  },
  dropdownWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dropdownLabel: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dropdownBtnWrap: {
    position: 'relative',
    flex: 1,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minWidth: 220,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.neutral[50],
  },
  dropdownText: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.md,
    zIndex: 999,
  },
  dropdownScroll: { maxHeight: 280 },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  dropdownItemActive: { backgroundColor: Colors.primarySurface },
  dropdownItemText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  dropdownItemTextActive: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  tableScroll: {
    flex: 1,
    overflow: 'scroll',
    paddingBottom: 8,
  },
  tableInner: {
    minWidth: 1180,
    flexDirection: 'column',
  },
  colCustomer: { width: 220 },
  colAddress: { width: 260, paddingRight: 8 },
  colPlan: { width: 180 },
  colPeriod: { width: 170 },
  colPrice: { width: 90 },
  colStatus: { width: 120 },
  colChevron: { width: 40 },
  colType: { width: 100 },
  colItems: { width: 240 },
  colDate: { width: 130 },
  paginationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  pageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  pageBtnDisabled: { opacity: 0.5 },
  pageBtnText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  pageInfo: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
});
