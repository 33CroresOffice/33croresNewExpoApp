import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, ArrowRightLeft, Bike, MapPin, Phone, RefreshCw, Search, Square, CheckSquare,
  AlertCircle, ChevronDown, ChevronUp, Truck,
} from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import ModuleGuard from '@/components/admin/ModuleGuard';
import DatePickerField from '@/components/ui/DatePickerField';

const ACTIVE_ASSIGNMENT_STATUSES = ['assigned', 'accepted', 'picked_up'];

interface FromOrder {
  assignment_id: string;
  order_id: string | null;
  scheduled_date: string;
  status: string;
  subscription_id: string | null;
  customer_name: string;
  customer_mobile: string;
  plan_name: string;
  address: string;
  standing_only: boolean;
}

interface Rider {
  id: string;
  full_name: string;
  mobile: string;
  zone: string | null;
}

export default function ManualReassignScreen() {
  return (
    <ModuleGuard module="riders">
      <ManualReassignContent />
    </ModuleGuard>
  );
}

function ManualReassignContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [riders, setRiders] = useState<Rider[]>([]);
  const [fromRider, setFromRider] = useState<Rider | null>(null);
  const [toRider, setToRider] = useState<Rider | null>(null);
  const [fromPickerOpen, setFromPickerOpen] = useState(false);
  const [toPickerOpen, setToPickerOpen] = useState(false);
  const [riderSearch, setRiderSearch] = useState('');
  const [rangeStart, setRangeStart] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [rangeEnd, setRangeEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [allOrders, setAllOrders] = useState<FromOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<{ success: number; failed: number } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('riders')
        .select('id, full_name, mobile, zone, is_active')
        .eq('is_active', true)
        .order('full_name');
      setRiders((data ?? []) as Rider[]);
    })();
  }, []);

  const loadOrders = useCallback(async (riderId: string) => {
    setLoadingOrders(true);
    setError(null);
    try {
      const todayStr = format(new Date(), 'yyyy-MM-dd');

      // Source 1 — live assignment rows for this rider (assigned/accepted/
      // picked_up; delivered orders are covered by the standing sub below),
      // filtered by the order's scheduled date.
      const { data: assignData, error: assignErr } = await supabase
        .from('rider_order_assignments')
        .select(`
          id, order_id, status,
          order:orders(id, scheduled_date, subscription_id,
            user:profiles(full_name, mobile),
            subscription:subscriptions(id, status, plan:subscription_plans(name), delivery_address:addresses(apartment_name, street, landmark, city, state, pincode)))
        `)
        .eq('rider_id', riderId)
        .in('status', ['assigned', 'accepted', 'picked_up'])
        .gte('order.scheduled_date', rangeStart)
        .lte('order.scheduled_date', rangeEnd)
        .order('assigned_at', { ascending: false })
        .limit(500);
      if (assignErr) throw new Error(assignErr.message);

      const addressOf = (addr: any) => {
        const a = Array.isArray(addr) ? addr[0] : addr;
        const parts = [a?.apartment_name, a?.street, a?.landmark, a?.city, a?.state, a?.pincode].filter(Boolean);
        return parts.length > 0 ? parts.join(', ') : 'No address';
      };

      const rows: FromOrder[] = [];
      const coveredSubs = new Set<string>();
      for (const raw of (assignData ?? []) as any[]) {
        const order = raw.order ? (Array.isArray(raw.order) ? raw.order[0] : raw.order) : null;
        if (!order || !order.scheduled_date) continue;
        const sub = order.subscription ? (Array.isArray(order.subscription) ? order.subscription[0] : order.subscription) : null;
        if (!sub || sub.status !== 'active') continue;
        if (coveredSubs.has(sub.id)) continue;
        coveredSubs.add(sub.id);
        const user = order.user ? (Array.isArray(order.user) ? order.user[0] : order.user) : null;
        rows.push({
          assignment_id: raw.id,
          order_id: raw.order_id ?? null,
          scheduled_date: order.scheduled_date,
          status: raw.status,
          subscription_id: sub.id,
          customer_name: user?.full_name ?? user?.mobile ?? 'Unknown',
          customer_mobile: user?.mobile ?? '',
          plan_name: sub.plan?.name ?? '',
          address: addressOf(sub.delivery_address),
          standing_only: false,
        });
      }

      // Source 2 — active subscriptions whose primary rider is this rider.
      // Same as the Assigned Orders screen: these are standing assignments.
      // A subscription matches when its active window (start date through
      // effective end date) overlaps the selected date range, so picking any
      // date inside the subscription period shows the customer.
      const { data: subData, error: subErr } = await supabase
        .from('subscriptions')
        .select(`
          id, status, start_date, end_date, new_end_date, pause_until, next_delivery_date,
          plan:subscription_plans(name),
          user:profiles(full_name, mobile),
          delivery_address:addresses(apartment_name, street, landmark, city, state, pincode)
        `)
        .eq('primary_rider_id', riderId)
        .eq('status', 'active')
        .or(`pause_until.is.null,pause_until.lt.${todayStr}`)
        .or(`start_date.is.null,start_date.lte.${rangeEnd}`)
        .or(`new_end_date.gte.${rangeStart},end_date.gte.${rangeStart},end_date.is.null`)
        .order('next_delivery_date', { ascending: true })
        .limit(1000);
      if (subErr) throw new Error(subErr.message);

      for (const sub of (subData ?? []) as any[]) {
        if (coveredSubs.has(sub.id)) continue;
        coveredSubs.add(sub.id);
        const user = sub.user ? (Array.isArray(sub.user) ? sub.user[0] : sub.user) : null;
        rows.push({
          assignment_id: sub.id,
          order_id: null,
          scheduled_date: sub.next_delivery_date ?? sub.start_date ?? '',
          status: 'assigned',
          subscription_id: sub.id,
          customer_name: user?.full_name ?? user?.mobile ?? 'Unknown',
          customer_mobile: user?.mobile ?? '',
          plan_name: sub.plan?.name ?? '',
          address: addressOf(sub.delivery_address),
          standing_only: true,
        });
      }

      rows.sort((a, b) => (a.scheduled_date < b.scheduled_date ? 1 : -1));
      setAllOrders(rows);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load orders');
      setAllOrders([]);
    } finally {
      setLoadingOrders(false);
      setRefreshing(false);
    }
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    if (fromRider) loadOrders(fromRider.id);
    else { setAllOrders([]); setSelected(new Set()); }
  }, [fromRider, loadOrders]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allOrders;
    return allOrders.filter((o) =>
      o.customer_name.toLowerCase().includes(q)
      || o.customer_mobile.includes(q)
      || o.plan_name.toLowerCase().includes(q)
      || o.address.toLowerCase().includes(q));
  }, [allOrders, search]);

  useEffect(() => {
    setSelected((prev) => new Set([...prev].filter((id) => filteredOrders.some((o) => o.assignment_id === id))));
  }, [filteredOrders]);

  const allSelected = filteredOrders.length > 0 && filteredOrders.every((o) => selected.has(o.assignment_id));

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filteredOrders.map((o) => o.assignment_id)));
  };

  const filteredRiders = useMemo(() => {
    const q = riderSearch.trim().toLowerCase();
    if (!q) return riders;
    return riders.filter((r) => r.full_name.toLowerCase().includes(q) || (r.mobile ?? '').includes(q));
  }, [riders, riderSearch]);

  const doReassign = async () => {
    if (!fromRider || !toRider || selected.size === 0) return;
    setWorking(true);
    setError(null);
    try {
      const selectedRows = allOrders.filter((o) => selected.has(o.assignment_id));

      // Standing subscription rows: reassign by changing the subscription's
      // primary rider, which only affects future deliveries.
      const standingSubIds = selectedRows
        .filter((o) => o.standing_only && o.subscription_id)
        .map((o) => o.subscription_id as string);
      const activeIds = selectedRows.filter((o) => !o.standing_only).map((o) => o.assignment_id);

      let success = 0;
      let failed = 0;
      for (const subId of standingSubIds) {
        const { data, error: rpcErr } = await supabase.rpc('set_subscription_primary_rider', {
          p_subscription_id: subId,
          p_rider_id: toRider.id,
        });
        const res = data as any;
        if (rpcErr || res?.success === false) failed += 1;
        else success += 1;
      }

      if (activeIds.length > 0) {
        const { data, error: rpcErr } = await supabase.rpc('manual_reassign_orders', {
          p_assignment_ids: activeIds,
          p_new_rider_id: toRider.id,
          p_reason: `Manual reassignment: ${fromRider.full_name} to ${toRider.full_name}`,
          p_start_date: rangeStart,
          p_end_date: rangeEnd,
        });
        if (rpcErr) throw new Error(rpcErr.message);
        const res = data as any;
        success += res?.reassigned ?? 0;
        failed += res?.failed ?? 0;
      }

      setResult({ success, failed });
      setSelected(new Set());
      if (success > 0) {
        setTimeout(() => {
          router.replace({ pathname: '/rider-assignment-orders', params: { tab: 'assigned' } });
        }, 1200);
      } else {
        loadOrders(fromRider.id);
        setTimeout(() => setResult(null), 6000);
      }
    } catch (e: any) {
      setError(e.message ?? 'Reassignment failed');
    } finally {
      setWorking(false);
    }
  };

  const renderRiderPicker = (
    label: string,
    current: Rider | null,
    isOpen: boolean,
    onOpen: () => void,
    onPick: (r: Rider) => void,
    excludedId?: string | null,
  ) => (
    <View style={st.pickerWrap}>
      <Text style={st.pickerLabel}>{label} *</Text>
      <TouchableOpacity style={st.pickerBtn} onPress={onOpen} activeOpacity={0.8}>
        {current ? (
          <View style={st.riderAvatar}><Text style={st.riderAvatarText}>{current.full_name.charAt(0)}</Text></View>
        ) : (
          <View style={[st.riderAvatar, st.riderAvatarEmpty]}><Bike size={13} color={Colors.textTertiary} strokeWidth={2} /></View>
        )}
        <Text style={[st.pickerText, !current && { color: Colors.textTertiary }]} numberOfLines={1}>
          {current ? current.full_name : 'Select rider…'}
        </Text>
        {isOpen ? <ChevronUp size={15} color={Colors.textTertiary} /> : <ChevronDown size={15} color={Colors.textTertiary} />}
      </TouchableOpacity>
      {isOpen ? (
        <View style={st.riderList}>
          <View style={st.riderSearchWrap}>
            <Search size={13} color={Colors.textTertiary} strokeWidth={1.8} />
            <TextInput
              style={st.riderSearchInput}
              value={riderSearch}
              onChangeText={setRiderSearch}
              placeholder="Search riders…"
              placeholderTextColor={Colors.textDisabled}
            />
          </View>
          <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {filteredRiders.length === 0 ? (
              <Text style={st.riderEmpty}>No riders found</Text>
            ) : filteredRiders.map((r) => {
              const disabled = r.id === excludedId;
              return (
                <TouchableOpacity
                  key={r.id}
                  style={[st.riderItem, current?.id === r.id && st.riderItemActive, disabled && { opacity: 0.4 }]}
                  disabled={disabled}
                  onPress={() => { onPick(r); setRiderSearch(''); setFromPickerOpen(false); setToPickerOpen(false); }}
                  activeOpacity={0.8}
                >
                  <View style={st.riderAvatar}><Text style={st.riderAvatarText}>{r.full_name.charAt(0)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.riderName}>{r.full_name}</Text>
                    <Text style={st.riderMeta}>{r.zone ?? 'All zones'}{disabled ? ' · same as selected' : ''}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );

  const renderOrder = (o: FromOrder) => {
    const isSelected = selected.has(o.assignment_id);
    return (
      <TouchableOpacity
        key={o.assignment_id}
        style={[st.rowCard, isSelected && st.rowCardSelected]}
        onPress={() => toggleSelect(o.assignment_id)}
        activeOpacity={0.8}
      >
        {isSelected ? <CheckSquare size={20} color={Colors.primary} /> : <Square size={20} color={Colors.textDisabled} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={st.rowTop}>
            <Text style={st.customerName} numberOfLines={1}>{o.customer_name}</Text>
            {o.plan_name ? (
              <View style={st.planPill}>
                <Text style={st.planPillText} numberOfLines={1}>{o.plan_name}</Text>
              </View>
            ) : null}
          </View>
          {o.customer_mobile ? (
            <View style={st.infoRow}>
              <Phone size={12} color={Colors.textTertiary} strokeWidth={1.8} />
              <Text style={st.infoText} numberOfLines={1}>{o.customer_mobile}</Text>
            </View>
          ) : null}
          <View style={st.infoRow}>
            <MapPin size={12} color={Colors.textTertiary} strokeWidth={1.8} />
            <Text style={st.infoText} numberOfLines={2}>{o.address}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={st.container}>
      <View style={[st.header, { paddingTop: insets.top + Spacing[3] }]}>
        <View style={st.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
            <ArrowLeft size={20} color={Colors.textPrimary} strokeWidth={2} />
          </TouchableOpacity>
          <View>
            <Text style={st.headerTitle}>Manual Reassign</Text>
            <Text style={st.headerSubtitle}>
              {fromRider ? `${filteredOrders.length} order(s) for ${fromRider.full_name} in selected dates` : 'Select a rider to begin'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={st.refreshBtn}
          onPress={() => { if (fromRider) { setRefreshing(true); loadOrders(fromRider.id); } }}
          activeOpacity={0.8}
          disabled={!fromRider}
        >
          <RefreshCw size={14} color={Colors.primary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View style={st.filterSection}>
        {renderRiderPicker('From Rider (current)', fromRider, fromPickerOpen, () => {
          setFromPickerOpen(!fromPickerOpen); setToPickerOpen(false); setRiderSearch('');
        }, setFromRider, null)}
        <View style={st.dateRow}>
          <View style={{ flex: 1 }}>
            <DatePickerField
              label="Start Date"
              required
              value={parseISO(rangeStart)}
              onChange={(d) => {
                const next = format(d, 'yyyy-MM-dd');
                setRangeStart(next);
                if (rangeEnd < next) setRangeEnd(next);
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <DatePickerField
              label="End Date"
              required
              value={parseISO(rangeEnd)}
              onChange={(d) => setRangeEnd(format(d, 'yyyy-MM-dd'))}
              minDate={parseISO(rangeStart)}
            />
          </View>
        </View>
        {renderRiderPicker('To Rider (new)', toRider, toPickerOpen, () => {
          setToPickerOpen(!toPickerOpen); setFromPickerOpen(false); setRiderSearch('');
        }, setToRider, fromRider?.id ?? null)}
      </View>

      {result ? (
        <View style={[st.resultBar, result.failed > 0 ? { backgroundColor: '#FEE2E2' } : { backgroundColor: '#DCFCE7' }]}>
          <Text style={[st.resultText, { color: result.failed > 0 ? Colors.error : Colors.success }]}>
            {result.success} order(s) reassigned to {toRider?.full_name}{result.failed > 0 ? `, ${result.failed} failed` : ''}
          </Text>
        </View>
      ) : null}

      {error ? (
        <View style={st.errorBar}>
          <AlertCircle size={16} color={Colors.error} />
          <Text style={st.errorText}>{error}</Text>
        </View>
      ) : null}

      <ScrollView
        style={st.scroll}
        contentContainerStyle={[st.scrollContent, isWeb && st.scrollContentWeb]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { if (fromRider) { setRefreshing(true); loadOrders(fromRider.id); } }} />}
      >
        {!fromRider ? (
          <View style={st.emptyState}>
            <Bike size={36} color={Colors.textDisabled} strokeWidth={1.2} />
            <Text style={st.emptyTitle}>Select a From Rider</Text>
            <Text style={st.emptySub}>Pick the rider whose orders you want to transfer, then choose the date range.</Text>
          </View>
        ) : loadingOrders ? (
          <View style={st.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <>
            <View style={st.selectAllRow}>
              <TouchableOpacity style={st.selectToggle} onPress={toggleSelectAll} disabled={filteredOrders.length === 0} activeOpacity={0.7}>
                {allSelected ? <CheckSquare size={18} color={Colors.primary} /> : <Square size={18} color={Colors.textTertiary} />}
                <Text style={st.selectToggleText}>
                  {allSelected ? `Deselect All (${filteredOrders.length})` : `Select All (${filteredOrders.length})`}
                </Text>
              </TouchableOpacity>
              <Text style={st.selectedHint}>{selected.size} selected</Text>
            </View>
            <View style={st.searchWrap}>
              <Search size={14} color={Colors.textTertiary} strokeWidth={1.8} />
              <TextInput
                style={st.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search customer, mobile, plan or address…"
                placeholderTextColor={Colors.textDisabled}
                returnKeyType="search"
              />
            </View>
            {filteredOrders.length === 0 ? (
              <View style={st.emptyState}>
                <Truck size={36} color={Colors.textDisabled} strokeWidth={1.2} />
                <Text style={st.emptyTitle}>No assigned orders in this date range</Text>
                <Text style={st.emptySub}>Only orders of active subscriptions assigned to {fromRider.full_name} appear here.</Text>
              </View>
            ) : filteredOrders.map(renderOrder)}
          </>
        )}
      </ScrollView>

      <View style={[st.actionBar, { paddingBottom: Math.max(insets.bottom, Spacing[3]) }]}>
        <View style={{ flex: 1 }}>
          <Text style={st.actionSummary} numberOfLines={1}>
            {selected.size > 0 && toRider
              ? `${selected.size} order(s) · ${fromRider?.full_name} → ${toRider.full_name}`
              : 'Select orders and a To Rider'}
          </Text>
        </View>
        <TouchableOpacity
          style={[st.reassignBtn, (selected.size === 0 || !toRider) && { opacity: 0.5 }]}
          onPress={doReassign}
          disabled={selected.size === 0 || !toRider || working}
          activeOpacity={0.8}
        >
          {working ? <ActivityIndicator size="small" color={Colors.white} /> : (
            <>
              <ArrowRightLeft size={15} color={Colors.white} strokeWidth={2} />
              <Text style={st.reassignBtnText}>Reassign ({selected.size})</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F0' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[3],
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  backBtn: { padding: Spacing[1] },
  headerTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  headerSubtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },
  refreshBtn: {
    width: 36, height: 36, borderRadius: Radius.md, backgroundColor: Colors.primarySurface,
    alignItems: 'center', justifyContent: 'center',
  },
  filterSection: { backgroundColor: Colors.white, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing[3] },
  pickerWrap: { position: 'relative' },
  pickerLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textTertiary, marginBottom: Spacing[1] },
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    backgroundColor: Colors.neutral[50], borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2],
  },
  pickerText: { flex: 1, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  riderList: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing[2], shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 6, zIndex: 30,
  },
  riderSearchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    backgroundColor: Colors.neutral[50], borderRadius: Radius.sm,
    paddingHorizontal: Spacing[2], paddingVertical: Spacing[1], marginBottom: Spacing[2],
  },
  riderSearchInput: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, padding: 0 },
  riderEmpty: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', paddingVertical: Spacing[3] },
  riderItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[2], paddingHorizontal: Spacing[2], borderRadius: Radius.sm },
  riderItemActive: { backgroundColor: Colors.primarySurface },
  riderAvatar: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  riderAvatarEmpty: { backgroundColor: Colors.neutral[200] },
  riderAvatarText: { color: Colors.white, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm },
  riderName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  riderMeta: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  dateRow: { flexDirection: 'row', gap: Spacing[3] },
  resultBar: { paddingVertical: Spacing[2], paddingHorizontal: Spacing[4] },
  resultText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, textAlign: 'center' },
  errorBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], backgroundColor: '#FEE2E2',
  },
  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error, flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing[4], paddingBottom: Spacing[8], gap: Spacing[2] },
  scrollContentWeb: { maxWidth: 1000, alignSelf: 'center', width: '100%' },
  loadingWrap: { paddingVertical: Spacing[10], alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: Spacing[10], gap: Spacing[2] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  emptySub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 340 },
  selectAllRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectToggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  selectToggleText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  selectedHint: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    backgroundColor: Colors.white, borderRadius: Radius.md,
    paddingHorizontal: Spacing[3], paddingVertical: Spacing[2],
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, padding: 0 },
  rowCard: {
    flexDirection: 'row', gap: Spacing[3], alignItems: 'flex-start',
    backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing[3],
    borderWidth: 1, borderColor: Colors.border,
  },
  rowCardSelected: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flexWrap: 'wrap', marginBottom: Spacing[1] },
  customerName: { flex: 1, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  planPill: {
    backgroundColor: Colors.primarySurface,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[2] + 2,
    paddingVertical: 3,
  },
  planPillText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 10, color: Colors.primary },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], marginTop: 2 },
  infoText: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  actionBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    paddingHorizontal: Spacing[4], paddingTop: Spacing[3],
    backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  actionSummary: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  reassignBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2],
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[3],
  },
  reassignBtnText: { color: Colors.white, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm },
});
