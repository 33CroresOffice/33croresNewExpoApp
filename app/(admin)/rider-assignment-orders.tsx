import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, ActivityIndicator, RefreshControl, Modal, TextInput,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Bike, UserMinus, Square, CheckSquare, ChevronRight, Truck, MapPin, User, RefreshCw, AlertCircle, Filter, ChevronDown, ArrowUp, ArrowDown, ListOrdered, ArrowRightLeft, Zap, CircleCheck as CheckCircle, Star } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import { format } from 'date-fns';
import ModuleGuard from '@/components/admin/ModuleGuard';
import DatePickerField from '@/components/ui/DatePickerField';
import { getEffectiveStatus } from '@/utils/subscriptionStatus';

type Tab = 'assigned' | 'unassigned' | 'history';

interface AssignedOrder {
  assignment_id: string;
  order_id: string | null;
  subscription_id: string | null;
  status: string;
  subscription_status: string;
  scheduled_date: string;
  rider_name: string;
  rider_mobile: string;
  customer_name: string;
  customer_mobile: string;
  plan_name: string;
  address_apartment: string;
  address_street: string;
  address_landmark: string;
  address_city: string;
  address_state: string;
  address_pincode: string;
  delivery_sequence: number | null;
  rider_id: string;
  swapped_from_rider_id: string | null;
  swap_reason: string | null;
  auto_assigned: boolean;
  is_primary_rider: boolean;
  standing_only: boolean;
}

interface UnassignedOrder {
  order_id: string;
  scheduled_date: string;
  customer_name: string;
  plan_name: string;
  address_apartment: string;
  address_street: string;
  address_landmark: string;
  address_city: string;
  address_state: string;
  address_pincode: string;
}

const ASSIGN_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  assigned:  { label: 'Assigned',  color: '#0369A1', bg: '#E0F2FE' },
  accepted:  { label: 'Accepted',  color: '#15803D', bg: '#DCFCE7' },
  picked_up: { label: 'Picked Up', color: '#EA580C', bg: '#FFEDD5' },
  delivered: { label: 'Delivered', color: '#15803D', bg: '#DCFCE7' },
  failed:    { label: 'Failed',    color: '#DC2626', bg: '#FEE2E2' },
  reassigned:{ label: 'Reassigned',color: '#6B7280', bg: '#F3F4F6' },
};

function formatOrderReference(orderId: string | null | undefined): string {
  return orderId ? `#${orderId.slice(-8).toUpperCase()}` : '#Custom order';
}

const SUBSCRIPTION_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  active:    { label: 'Active',    color: '#15803D', bg: '#DCFCE7' },
  paused:    { label: 'Paused',    color: '#B45309', bg: '#FEF3C7' },
  expired:   { label: 'Expired',   color: '#DC2626', bg: '#FEE2E2' },
  pending:   { label: 'Pending',   color: '#D97706', bg: '#FFEDD5' },
  cancelled: { label: 'Discontinued', color: '#6B7280', bg: '#F3F4F6' },
  renewed:       { label: 'Renewed',       color: '#0369A1', bg: '#E0F2FE' },
  scheduled_pause:{ label: 'Pause Scheduled', color: '#7C3AED', bg: '#EDE9FE' },
};

const ACTIVE_ASSIGNMENT_STATUSES = ['assigned', 'accepted', 'picked_up', 'delivered'];

export default function RiderAssignmentOrdersScreen() {
  return (
    <ModuleGuard module="riders">
      <RiderAssignmentOrdersContent />
    </ModuleGuard>
  );
}

function RiderAssignmentOrdersContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<Tab>(params.tab === 'unassigned' ? 'unassigned' : 'assigned');
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  const [showRiderFilter, setShowRiderFilter] = useState(false);
  const [subStatusFilter, setSubStatusFilter] = useState<string | null>(null);
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [statusSearchQuery, setStatusSearchQuery] = useState('');
  const [riderSearchQuery, setRiderSearchQuery] = useState('');

  const [assignedOrders, setAssignedOrders] = useState<AssignedOrder[]>([]);
  const [unassignedOrders, setUnassignedOrders] = useState<UnassignedOrder[]>([]);
  const [totalActiveSubs, setTotalActiveSubs] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkUnassigning, setBulkUnassigning] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ success: number; failed: number } | null>(null);
  const [riders, setRiders] = useState<any[]>([]);
  const [leaveSet, setLeaveSet] = useState<Set<string>>(new Set());
  const [activeCountMap, setActiveCountMap] = useState<Map<string, number>>(new Map());

  const [redistributing, setRedistributing] = useState(false);
  const [redistributeResult, setRedistributeResult] = useState<{ redistributed: number; failed: number; skipped_primary: number } | null>(null);
  const [showRedistributeResult, setShowRedistributeResult] = useState(false);


  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [assignedRes, unassignedRes, ridersRes, leaveRes, subsRes] = await Promise.all([
        supabase
          .from('rider_order_assignments')
          .select(`
            id, order_id, status, assigned_at, delivery_sequence, rider_id, swapped_from_rider_id, swap_reason, auto_assigned,
            order:orders(
              id, scheduled_date, status, subscription_id,
              user:profiles(full_name, mobile),
              subscription:subscriptions(status, start_date, end_date, new_end_date, pause_start_date, pause_until, primary_rider_id, plan:subscription_plans(name), delivery_address:addresses(apartment_name, street, landmark, city, state, pincode))
            ),
            rider:riders!rider_order_assignments_rider_id_fkey(full_name, mobile)
          `)
          .in('status', [...ACTIVE_ASSIGNMENT_STATUSES, 'delivered', 'failed', 'reassigned'])
          .order('assigned_at', { ascending: false })
          .limit(500),
        supabase
          .from('orders')
          .select(`
            id, scheduled_date, status,
            user:profiles(full_name, mobile),
            subscription:subscriptions(plan:subscription_plans(name), delivery_address:addresses(apartment_name, street, landmark, city, state, pincode))
          `)
          .eq('status', 'scheduled')
          .order('scheduled_date', { ascending: true }),
        supabase.from('riders').select('id, full_name, mobile, zone, vehicle_type, is_active').eq('is_active', true).order('full_name'),
        supabase.from('rider_leave_requests').select('rider_id, leave_date, end_date').eq('status', 'approved'),
        supabase
          .from('subscriptions')
          .select(`
            id, status, start_date, end_date, new_end_date, pause_start_date, pause_until, next_delivery_date, primary_rider_id,
            plan:subscription_plans(name),
            user:profiles(full_name, mobile),
            delivery_address:addresses(apartment_name, street, landmark, city, state, pincode)
          `)
          .not('primary_rider_id', 'is', null),
      ]);

      if (assignedRes.error) throw new Error(assignedRes.error.message);
      if (unassignedRes.error) throw new Error(unassignedRes.error.message);
      if (subsRes.error) throw new Error(subsRes.error.message);

      setRiders(ridersRes.data ?? []);
      const today = new Date().toISOString().split('T')[0];
      const leaves = new Set((leaveRes.data ?? []).filter((l: any) => l.leave_date <= today && l.end_date >= today).map((l: any) => l.rider_id as string));
      setLeaveSet(leaves);

      const todayStr = new Date().toISOString().split('T')[0];
      const activeSubsRes = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .or(`pause_until.is.null,pause_until.lt.${todayStr}`)
        .or(`start_date.is.null,start_date.lte.${todayStr}`);
      setTotalActiveSubs(activeSubsRes.count ?? null);

      const assigned: AssignedOrder[] = (assignedRes.data ?? []).map((row: any) => ({
        assignment_id: row.id,
        order_id: row.order_id ?? null,
        subscription_id: row.order?.subscription_id ?? null,
        status: row.status,
        delivery_sequence: row.delivery_sequence ?? null,
        rider_id: row.rider_id ?? '',
        swapped_from_rider_id: row.swapped_from_rider_id ?? null,
        swap_reason: row.swap_reason ?? null,
        auto_assigned: row.auto_assigned ?? false,
        is_primary_rider: row.order?.subscription?.primary_rider_id != null && row.order?.subscription?.primary_rider_id === row.rider_id,
        subscription_status: row.order?.subscription ? getEffectiveStatus(row.order.subscription) : 'active',
        scheduled_date: row.order?.scheduled_date ?? '',
        rider_name: row.rider?.full_name ?? 'Unknown',
        rider_mobile: row.rider?.mobile ?? '',
        customer_name: row.order?.user?.full_name ?? row.order?.user?.mobile ?? 'Unknown',
        customer_mobile: row.order?.user?.mobile ?? '',
        plan_name: row.order?.subscription?.plan?.name ?? '',
        address_apartment: row.order?.subscription?.delivery_address?.apartment_name ?? '',
        address_street: row.order?.subscription?.delivery_address?.street ?? '',
        address_landmark: row.order?.subscription?.delivery_address?.landmark ?? '',
        address_city: row.order?.subscription?.delivery_address?.city ?? '',
        address_state: row.order?.subscription?.delivery_address?.state ?? '',
        address_pincode: row.order?.subscription?.delivery_address?.pincode ?? '',
        standing_only: false,
      }));

      const unassigned: UnassignedOrder[] = (unassignedRes.data ?? []).map((row: any) => ({
        order_id: row.id,
        scheduled_date: row.scheduled_date ?? '',
        customer_name: row.user?.full_name ?? row.user?.mobile ?? 'Unknown',
        plan_name: row.subscription?.plan?.name ?? '',
        address_apartment: row.subscription?.delivery_address?.apartment_name ?? '',
        address_street: row.subscription?.delivery_address?.street ?? '',
        address_landmark: row.subscription?.delivery_address?.landmark ?? '',
        address_city: row.subscription?.delivery_address?.city ?? '',
        address_state: row.subscription?.delivery_address?.state ?? '',
        address_pincode: row.subscription?.delivery_address?.pincode ?? '',
      }));

      // One row per customer subscription in the Assigned tab. The
      // subscription's primary rider is the standing assignment; today's
      // delivery status never removes it. Live (not-yet-delivered) daily
      // assignments take precedence so in-flight statuses and sequences show.
      const riderLookup = new Map<string, { name: string; mobile: string }>();
      (ridersRes.data ?? []).forEach((r: any) => riderLookup.set(r.id, { name: r.full_name ?? 'Unknown', mobile: r.mobile ?? '' }));

      const activeByKey = new Map<string, AssignedOrder>();
      const historyRows: AssignedOrder[] = [];
      for (const row of assigned) {
        if (!ACTIVE_ASSIGNMENT_STATUSES.includes(row.status)) {
          historyRows.push(row);
          continue;
        }
        const key = row.subscription_id || row.order_id || row.assignment_id;
        const existing = activeByKey.get(key);
        if (!existing || (row.scheduled_date || '') > (existing.scheduled_date || '')) {
          activeByKey.set(key, row);
        }
      }

      const subsWithPrimary = (subsRes.data ?? []) as any[];
      const coveredSubs = new Set<string>();
      const standing: AssignedOrder[] = [];
      for (const row of activeByKey.values()) {
        // Delivered daily orders are covered by the subscription's standing
        // row below; a delivered row without a primary rider is unassigned.
        if (row.status === 'delivered' && row.subscription_id) {
          continue;
        }
        standing.push(row);
        if (row.subscription_id) coveredSubs.add(row.subscription_id);
      }
      for (const sub of subsWithPrimary) {
        if (coveredSubs.has(sub.id)) continue;
        const prior = activeByKey.get(sub.id);
        const p = riderLookup.get(sub.primary_rider_id);
        standing.push({
          assignment_id: sub.id,
          order_id: prior?.order_id ?? null,
          subscription_id: sub.id,
          status: 'assigned',
          subscription_status: getEffectiveStatus(sub),
          scheduled_date: prior?.scheduled_date ?? sub.next_delivery_date ?? '',
          rider_id: sub.primary_rider_id,
          rider_name: p?.name ?? 'Unknown',
          rider_mobile: p?.mobile ?? '',
          customer_name: sub.user?.full_name ?? sub.user?.mobile ?? 'Unknown',
          customer_mobile: sub.user?.mobile ?? '',
          plan_name: sub.plan?.name ?? '',
          address_apartment: sub.delivery_address?.apartment_name ?? '',
          address_street: sub.delivery_address?.street ?? '',
          address_landmark: sub.delivery_address?.landmark ?? '',
          address_city: sub.delivery_address?.city ?? '',
          address_state: sub.delivery_address?.state ?? '',
          address_pincode: sub.delivery_address?.pincode ?? '',
          delivery_sequence: prior?.delivery_sequence ?? null,
          swapped_from_rider_id: null,
          swap_reason: null,
          auto_assigned: false,
          is_primary_rider: true,
          standing_only: true,
        });
      }
      setAssignedOrders([...historyRows, ...standing]);

      const countMap = new Map<string, number>();
      standing.forEach((row) => {
        countMap.set(row.rider_id, (countMap.get(row.rider_id) ?? 0) + 1);
      });
      setActiveCountMap(countMap);
      setUnassignedOrders(unassigned);
      setSelectedIds(new Set());
    } catch (e: any) {
      setError(e.message ?? 'Failed to load orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  usePageVisibility(load);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (filteredAssignedOrders.length > 0 && filteredAssignedOrders.every((o) => selectedIds.has(o.assignment_id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAssignedOrders.map(o => o.assignment_id)));
    }
  };

  const handleBulkUnassign = async () => {
    setBulkUnassigning(true);
    const ids = Array.from(selectedIds);
    const selected = assignedOrders.filter((o) => ids.includes(o.assignment_id));

    // Delivery history is permanent: end the standing relationship by
    // clearing each subscription's primary rider instead of touching rows.
    const subscriptionIds = Array.from(new Set(
      selected
        .filter((o) => o.subscription_id)
        .map((o) => o.subscription_id as string)
    ));
    if (subscriptionIds.length > 0) {
      const { error: clearErr } = await supabase
        .from('subscriptions')
        .update({ primary_rider_id: null })
        .in('id', subscriptionIds);
      if (clearErr) {
        setBulkUnassigning(false);
        setShowBulkConfirm(false);
        setError('Unassign failed: ' + clearErr.message);
        return;
      }
    }

    // Only real assignment rows with an in-flight order get marked
    // reassigned; subscription-backed rows have no assignment record and
    // their order_id may point at a delivered order that must not change.
    const unassignable = selected.filter(
      (o) => !o.standing_only && ['assigned', 'accepted', 'picked_up'].includes(o.status)
    );
    const unassignIds = unassignable.map(o => o.assignment_id);
    const orderIds = unassignable
      .filter(o => o.order_id)
      .map(o => o.order_id as string);

    if (unassignIds.length > 0) {
      const { error: assignError } = await supabase
        .from('rider_order_assignments')
        .update({ status: 'reassigned', is_reassigned: true })
        .in('id', unassignIds);

      if (assignError) {
        setBulkUnassigning(false);
        setShowBulkConfirm(false);
        setError('Unassign failed: ' + assignError.message);
        return;
      }

      if (orderIds.length > 0) {
        const { error: orderError } = await supabase
          .from('orders')
          .update({ status: 'scheduled' })
          .in('id', orderIds);
        if (orderError) {
          setBulkUnassigning(false);
          setShowBulkConfirm(false);
          setError('Orders were unassigned but moving them back failed: ' + orderError.message);
          load();
          return;
        }
      }
    }

    setBulkUnassigning(false);
    setShowBulkConfirm(false);
    setBulkResult({ success: selected.length, failed: 0 });
    setSelectedIds(new Set());
    load();
    setTimeout(() => setBulkResult(null), 5000);
  };

  const redistributeNow = async () => {
    const target = format(new Date(), 'yyyy-MM-dd');
    setRedistributing(true);
    const { data, error } = await supabase.rpc('redistribute_planned_leave', { target_date: target });
    setRedistributing(false);
    if (error) { setError(error.message); return; }
    const result = data as any;
    setRedistributeResult({ redistributed: result?.redistributed ?? 0, failed: result?.failed ?? 0, skipped_primary: result?.skipped_primary ?? 0 });
    setShowRedistributeResult(true);
    load();
  };


  const riderOptions = useMemo(() => {
    const riders = new Map<string, string>();
    assignedOrders.forEach((order) => {
      const riderId = order.rider_name + '|' + order.rider_mobile;
      riders.set(riderId, order.rider_name);
    });
    return Array.from(riders.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [assignedOrders]);

  const SUB_STATUS_FILTERS = ['active', 'pending', 'paused', 'expired'];

  const liveAssignedOrders = useMemo(() => assignedOrders.filter((o) => ACTIVE_ASSIGNMENT_STATUSES.includes(o.status)), [assignedOrders]);
  const historyOrders = useMemo(() => assignedOrders.filter((o) => !ACTIVE_ASSIGNMENT_STATUSES.includes(o.status)), [assignedOrders]);

  const filteredAssignedOrders = useMemo(() => {
    let result = activeTab === 'history' ? historyOrders : liveAssignedOrders;
    if (selectedRiderId) {
      result = result.filter((order) => order.rider_name + '|' + order.rider_mobile === selectedRiderId);
    }
    if (subStatusFilter) {
      result = result.filter((order) => order.subscription_status === subStatusFilter);
    }
    if (selectedRiderId) {
      result = [...result].sort((a, b) => {
        const aSeq = a.delivery_sequence ?? 9999;
        const bSeq = b.delivery_sequence ?? 9999;
        return aSeq - bSeq;
      });
    }
    return result;
  }, [liveAssignedOrders, historyOrders, activeTab, selectedRiderId, subStatusFilter]);

  const [sequencing, setSequencing] = useState(false);
  const [sequenceError, setSequenceError] = useState<string | null>(null);

  const autoAssignSequence = async () => {
    if (!selectedRiderId) return;
    setSequencing(true);
    setSequenceError(null);
    try {
      const riderOrders = assignedOrders.filter(
        (o) => o.rider_name + '|' + o.rider_mobile === selectedRiderId
      );
      for (let i = 0; i < riderOrders.length; i++) {
        const { error } = await supabase
          .from('rider_order_assignments')
          .update({ delivery_sequence: i + 1 })
          .eq('id', riderOrders[i].assignment_id);
        if (error) throw new Error(error.message);
      }
      await load();
    } catch (e: any) {
      setSequenceError(e.message ?? 'Failed to set sequence');
    } finally {
      setSequencing(false);
    }
  };

  const moveSequence = async (orderId: string, direction: 'up' | 'down') => {
    if (!selectedRiderId) return;
    const sorted = [...filteredAssignedOrders];
    const idx = sorted.findIndex((o) => o.assignment_id === orderId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapIdx];
    setSequencing(true);
    setSequenceError(null);
    try {
      const updates = [
        supabase.from('rider_order_assignments').update({ delivery_sequence: (b.delivery_sequence ?? swapIdx + 1) }).eq('id', a.assignment_id),
        supabase.from('rider_order_assignments').update({ delivery_sequence: (a.delivery_sequence ?? idx + 1) }).eq('id', b.assignment_id),
      ];
      const results = await Promise.all(updates);
      for (const r of results) { if (r.error) throw new Error(r.error.message); }
      await load();
    } catch (e: any) {
      setSequenceError(e.message ?? 'Failed to reorder');
    } finally {
      setSequencing(false);
    }
  };

  const [editingSeqId, setEditingSeqId] = useState<string | null>(null);
  const [seqInputValue, setSeqInputValue] = useState('');

  const startEditSeq = (assignmentId: string, currentSeq: number | null) => {
    setEditingSeqId(assignmentId);
    setSeqInputValue(currentSeq != null ? String(currentSeq) : '');
  };

  const saveSeq = async (assignmentId: string) => {
    const num = parseInt(seqInputValue, 10);
    setEditingSeqId(null);
    if (isNaN(num) || num < 1) {
      setSequenceError('Sequence must be a positive number');
      return;
    }
    setSequencing(true);
    setSequenceError(null);
    try {
      const { error } = await supabase
        .from('rider_order_assignments')
        .update({ delivery_sequence: num })
        .eq('id', assignmentId);
      if (error) throw new Error(error.message);
      await load();
    } catch (e: any) {
      setSequenceError(e.message ?? 'Failed to save sequence');
    } finally {
      setSequencing(false);
    }
  };

  const filteredRiderOptions = useMemo(() => {
    const query = riderSearchQuery.trim().toLowerCase();
    if (!query) return riderOptions;
    return riderOptions.filter(([, riderName]) => riderName.toLowerCase().includes(query));
  }, [riderOptions, riderSearchQuery]);

  const filteredStatusOptions = useMemo(() => {
    const query = statusSearchQuery.trim().toLowerCase();
    return SUB_STATUS_FILTERS.filter((statusKey) => {
      const label = SUBSCRIPTION_STATUS_CONFIG[statusKey]?.label ?? statusKey;
      return !query || label.toLowerCase().includes(query);
    });
  }, [statusSearchQuery]);

  const riderFilteredOrders = useMemo(() => {
    if (!selectedRiderId) return liveAssignedOrders;
    return liveAssignedOrders.filter((order) => order.rider_name + '|' + order.rider_mobile === selectedRiderId);
  }, [liveAssignedOrders, selectedRiderId]);

  // Status counts are computed from the rider-filtered set (before the
  // status filter itself is applied) so they reflect the chosen rider but
  // stay fixed while a status filter is active.
  const subStatusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    riderFilteredOrders.forEach((order) => {
      counts[order.subscription_status] = (counts[order.subscription_status] ?? 0) + 1;
    });
    return counts;
  }, [riderFilteredOrders]);

  const selectedCount = selectedIds.size;
  const allSelected = filteredAssignedOrders.length > 0 && filteredAssignedOrders.every((order) => selectedIds.has(order.assignment_id));
  const headerTitle = activeTab === 'unassigned' ? 'Unassigned Orders' : 'Assigned Orders';

  const formatFullAddress = (apt: string, street: string, landmark: string, city: string, state: string, pincode: string): string => {
    const parts = [apt, street, landmark, city, state, pincode].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'No address';
  };

  const riderAssignmentSummary = useMemo(() => {
    const counts = new Map<string, { riderName: string; total: number; activeCustomerKeys: Set<string> }>();
    riderFilteredOrders.forEach((order) => {
      const riderId = order.rider_name + '|' + order.rider_mobile;
      const entry = counts.get(riderId) ?? {
        riderName: order.rider_name,
        total: 0,
        activeCustomerKeys: new Set<string>(),
      };
      entry.total += 1;
      if (order.subscription_status === 'active') {
        entry.activeCustomerKeys.add(order.customer_mobile || order.customer_name || order.order_id || order.assignment_id);
      }
      counts.set(riderId, entry);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1].total - a[1].total || a[1].riderName.localeCompare(b[1].riderName));
  }, [riderFilteredOrders, subStatusFilter]);

  const renderRiderAssignmentSummary = () => (
    <View style={styles.summaryCard}>
      <View style={styles.summaryHeader}>
        <View style={styles.summaryTitleRow}>
          <Bike size={17} color={Colors.primary} strokeWidth={2} />
          <Text style={styles.summaryTitle}>Rider Assignment Summary</Text>
        </View>
        <View style={styles.summaryHeaderRight}>
          {totalActiveSubs != null && (
            <Text style={styles.summaryActiveRef}>{totalActiveSubs} active subs</Text>
          )}
          <Text style={styles.summaryTotal}>{riderFilteredOrders.length} assigned</Text>
        </View>
      </View>
      <View style={styles.summaryTableHeader}>
        <Text style={styles.summaryColumnLabel}>Rider Name</Text>
        <Text style={styles.summaryColumnLabel}>Active</Text>
        <Text style={styles.summaryColumnLabel}>Total</Text>
      </View>
      {riderAssignmentSummary.length > 0 ? riderAssignmentSummary.map(([riderId, summary]) => {
        const isSelected = selectedRiderId === riderId;
        return (
          <TouchableOpacity
            key={riderId}
            style={[styles.summaryRow, isSelected && styles.summaryRowActive]}
            onPress={() => setSelectedRiderId(isSelected ? null : riderId)}
            activeOpacity={0.75}
          >
            <View style={styles.summaryRiderName}>
              <Bike size={13} color={isSelected ? Colors.primary : Colors.textSecondary} strokeWidth={2} />
              <Text style={styles.summaryRiderText} numberOfLines={1}>{summary.riderName}</Text>
            </View>
            <View style={styles.summaryActiveBadge}>
              <Text style={styles.summaryActiveText}>{summary.activeCustomerKeys.size}</Text>
            </View>
            <View style={styles.summaryCountBadge}>
              <Text style={styles.summaryCountText}>{summary.total}</Text>
            </View>
          </TouchableOpacity>
        );
      }) : (
        <Text style={styles.summaryEmpty}>No assigned riders yet.</Text>
      )}
    </View>
  );

  const renderAssignedList = () => {
    if (filteredAssignedOrders.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Bike size={36} color={Colors.textDisabled} strokeWidth={1.2} />
          <Text style={styles.emptyTitle}>{activeTab === 'history' ? 'No past assignments' : 'No assigned customers'}</Text>
          <Text style={styles.emptySub}>{activeTab === 'history' ? 'Failed and reassigned records will appear here.' : 'Orders assigned to riders will appear here.'}</Text>
        </View>
      );
    }

    return (
      <View>
        <View style={styles.filtersRow}>
          <View style={styles.filterBar}>
            <View style={styles.filterInner}>
              <Filter size={14} color={Colors.textTertiary} strokeWidth={1.8} />
              <Text style={styles.filterLabel}>Rider:</Text>
              <TouchableOpacity
                style={styles.filterDropdown}
                onPress={() => {
                  setShowRiderFilter(!showRiderFilter);
                  if (showRiderFilter) setRiderSearchQuery('');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.filterDropdownText} numberOfLines={1}>
                  {selectedRiderId ? riderOptions.find(([id]) => id === selectedRiderId)?.[1] ?? 'All Riders' : 'All Riders'}
                </Text>
                <ChevronDown size={14} color={Colors.textTertiary} strokeWidth={1.8} />
              </TouchableOpacity>
            </View>
            {selectedRiderId ? (
              <TouchableOpacity style={styles.filterClearBtn} onPress={() => { setSelectedRiderId(null); setShowRiderFilter(false); setRiderSearchQuery(''); }} activeOpacity={0.7}>
                <Text style={styles.filterClearText}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.filterBar}>
            <View style={styles.filterInner}>
              <Filter size={14} color={Colors.textTertiary} strokeWidth={1.8} />
              <Text style={styles.filterLabel}>Customer status:</Text>
              <TouchableOpacity
                style={styles.filterDropdown}
                onPress={() => {
                  setShowStatusFilter(!showStatusFilter);
                  if (showStatusFilter) setStatusSearchQuery('');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.filterDropdownText} numberOfLines={1}>
                  {subStatusFilter ? SUBSCRIPTION_STATUS_CONFIG[subStatusFilter]?.label ?? subStatusFilter : 'All Statuses'}
                </Text>
                <ChevronDown size={14} color={Colors.textTertiary} strokeWidth={1.8} />
              </TouchableOpacity>
            </View>
            {subStatusFilter ? (
              <TouchableOpacity style={styles.filterClearBtn} onPress={() => { setSubStatusFilter(null); setShowStatusFilter(false); setStatusSearchQuery(''); }} activeOpacity={0.7}>
                <Text style={styles.filterClearText}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {showStatusFilter ? (
          <View style={styles.filterOptions}>
            <View style={styles.filterSearchWrap}>
              <Filter size={14} color={Colors.textTertiary} strokeWidth={1.8} />
              <TextInput
                style={styles.filterSearchInput}
                value={statusSearchQuery}
                onChangeText={setStatusSearchQuery}
                placeholder="Search statuses"
                placeholderTextColor={Colors.textDisabled}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
            </View>
            <TouchableOpacity
              style={[styles.filterOption, !subStatusFilter && styles.filterOptionActive]}
              onPress={() => { setSubStatusFilter(null); setShowStatusFilter(false); setStatusSearchQuery(''); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterOptionText, !subStatusFilter && styles.filterOptionTextActive]}>All Statuses</Text>
            </TouchableOpacity>
            {filteredStatusOptions.length > 0 ? filteredStatusOptions.map((statusKey) => {
              const cfg = SUBSCRIPTION_STATUS_CONFIG[statusKey];
              const isActive = subStatusFilter === statusKey;
              return (
                <TouchableOpacity
                  key={statusKey}
                  style={[styles.filterOption, isActive && styles.filterOptionActive]}
                  onPress={() => { setSubStatusFilter(statusKey); setShowStatusFilter(false); setStatusSearchQuery(''); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterOptionText, isActive && styles.filterOptionTextActive]}>{statusKey === 'active' ? 'Active assigned' : cfg.label} ({subStatusCounts[statusKey] ?? 0})</Text>
                </TouchableOpacity>
              );
            }) : <Text style={styles.filterNoResults}>No statuses found</Text>}
          </View>
        ) : null}

        {showRiderFilter ? (
          <View style={styles.filterOptions}>
            <View style={styles.filterSearchWrap}>
              <Filter size={14} color={Colors.textTertiary} strokeWidth={1.8} />
              <TextInput
                style={styles.filterSearchInput}
                value={riderSearchQuery}
                onChangeText={setRiderSearchQuery}
                placeholder="Search riders"
                placeholderTextColor={Colors.textDisabled}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
            </View>
            <TouchableOpacity
              style={[styles.filterOption, !selectedRiderId && styles.filterOptionActive]}
              onPress={() => { setSelectedRiderId(null); setShowRiderFilter(false); setRiderSearchQuery(''); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterOptionText, !selectedRiderId && styles.filterOptionTextActive]}>All Riders</Text>
            </TouchableOpacity>
            {filteredRiderOptions.length > 0 ? filteredRiderOptions.map(([riderId, riderName]) => (
              <TouchableOpacity
                key={riderId}
                style={[styles.filterOption, selectedRiderId === riderId && styles.filterOptionActive]}
                onPress={() => { setSelectedRiderId(riderId); setShowRiderFilter(false); setRiderSearchQuery(''); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterOptionText, selectedRiderId === riderId && styles.filterOptionTextActive]}>{riderName}</Text>
              </TouchableOpacity>
            )) : (
              <Text style={styles.filterNoResults}>No riders found</Text>
            )}
          </View>
        ) : null}

        {activeTab === 'assigned' ? (
        <View style={styles.bulkActionBar}>
          <TouchableOpacity
            style={styles.selectToggle}
            onPress={toggleSelectAll}
            activeOpacity={0.7}
            disabled={filteredAssignedOrders.length === 0}
          >
            {allSelected ? <CheckSquare size={18} color={Colors.primary} /> : <Square size={18} color={Colors.textTertiary} />}
            <Text style={styles.selectToggleText}>
              {allSelected ? `Deselect All (${filteredAssignedOrders.length})` : `Select All (${filteredAssignedOrders.length})`}
            </Text>
          </TouchableOpacity>
          {selectedRiderId && (
            <TouchableOpacity style={styles.sequenceBtn} onPress={autoAssignSequence} disabled={sequencing} activeOpacity={0.8}>
              {sequencing ? <ActivityIndicator size="small" color={Colors.primary} /> : <ListOrdered size={15} color={Colors.primary} strokeWidth={2} />}
              <Text style={styles.sequenceBtnText}>Auto-Sequence</Text>
            </TouchableOpacity>
          )}
          {selectedCount > 0 ? (
            <TouchableOpacity style={styles.bulkUnassignBtn} onPress={() => setShowBulkConfirm(true)} activeOpacity={0.8}>
              <UserMinus size={15} color={Colors.white} strokeWidth={2} />
              <Text style={styles.bulkUnassignBtnText}>Unassign ({selectedCount})</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        ) : null}
        {selectedRiderId && (
          <View style={styles.sequenceLegendBar}>
            <ListOrdered size={13} color={Colors.primary} strokeWidth={2} />
            <Text style={styles.sequenceLegendText}>Tap the number to edit the delivery order. Use arrows to reorder.</Text>
          </View>
        )}
        {sequenceError ? (
          <View style={styles.sequenceErrorBar}>
            <AlertCircle size={14} color={Colors.error} />
            <Text style={styles.sequenceErrorText}>{sequenceError}</Text>
          </View>
        ) : null}

        {filteredAssignedOrders.map((order) => {
          const cfg = activeTab === 'assigned'
            ? ASSIGN_STATUS_CONFIG.assigned
            : (ASSIGN_STATUS_CONFIG[order.status] ?? ASSIGN_STATUS_CONFIG.assigned);
          const subStatusCfg = SUBSCRIPTION_STATUS_CONFIG[order.subscription_status] ?? null;
          const isSelected = selectedIds.has(order.assignment_id);
          return (
            <View key={order.assignment_id} style={[styles.orderCard, isSelected && styles.orderCardSelected]}>
              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => toggleSelect(order.assignment_id)}
                activeOpacity={0.7}
              >
                {isSelected ? <CheckSquare size={20} color={Colors.primary} /> : <Square size={20} color={Colors.textDisabled} />}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.orderContent}
                onPress={() => {
                  if (order.order_id) {
                    router.push({ pathname: '/(admin)/order-detail' as any, params: { id: order.order_id } });
                  }
                }}
                activeOpacity={0.8}
              >
                <View style={styles.orderTopRow}>
                  <View style={styles.orderIdRow}>
                    {selectedRiderId ? (
                      editingSeqId === order.assignment_id ? (
                        <TextInput
                          style={styles.seqInput}
                          value={seqInputValue}
                          onChangeText={setSeqInputValue}
                          keyboardType="numeric"
                          autoFocus
                          onBlur={() => saveSeq(order.assignment_id)}
                          onSubmitEditing={() => saveSeq(order.assignment_id)}
                          returnKeyType="done"
                          maxLength={4}
                        />
                      ) : (
                        <TouchableOpacity style={styles.sequenceBadge} onPress={() => startEditSeq(order.assignment_id, order.delivery_sequence)} activeOpacity={0.7}>
                          <Text style={styles.sequenceBadgeText}>{order.delivery_sequence ?? '—'}</Text>
                        </TouchableOpacity>
                      )
                    ) : order.delivery_sequence != null ? (
                      <View style={styles.sequenceBadge}>
                        <Text style={styles.sequenceBadgeText}>{order.delivery_sequence}</Text>
                      </View>
                    ) : null}
                    <Text style={styles.orderId}>{formatOrderReference(order.order_id)}</Text>
                    <View style={styles.riderPill}>
                      <Bike size={11} color={Colors.primary} strokeWidth={2.2} />
                      <Text style={styles.riderPillText} numberOfLines={1}>{order.rider_name}{order.rider_mobile ? ' · ' + order.rider_mobile : ''}</Text>
                      {order.is_primary_rider && (
                        <View style={styles.primaryBadge}>
                          <Star size={8} color={Colors.warning} strokeWidth={2.5} fill={Colors.warning} />
                          <Text style={styles.primaryBadgeText}>PRIMARY</Text>
                        </View>
                      )}
                    </View>
                    {selectedRiderId && (
                      <View style={styles.sequenceControls}>
                        <TouchableOpacity onPress={() => moveSequence(order.assignment_id, 'up')} disabled={sequencing} activeOpacity={0.7} style={styles.sequenceArrowBtn}>
                          <ArrowUp size={12} color={Colors.primary} strokeWidth={2.2} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => moveSequence(order.assignment_id, 'down')} disabled={sequencing} activeOpacity={0.7} style={styles.sequenceArrowBtn}>
                          <ArrowDown size={12} color={Colors.primary} strokeWidth={2.2} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                  <View style={styles.badgeRow}>
                    {subStatusCfg && (
                      <View style={[styles.statusBadge, { backgroundColor: subStatusCfg.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: subStatusCfg.color }]}>{subStatusCfg.label}</Text>
                      </View>
                    )}
                    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                    {order.swapped_from_rider_id && (
                      <View style={styles.reassignedBadge}>
                        <ArrowRightLeft size={9} color={Colors.secondary} strokeWidth={2.5} />
                        <Text style={styles.reassignedBadgeText}>REASSIGNED</Text>
                      </View>
                    )}
                    {order.auto_assigned && (
                      <View style={styles.autoBadge}>
                        <Zap size={9} color={Colors.accentDark} strokeWidth={2.5} />
                        <Text style={styles.autoBadgeText}>AUTO</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.orderInfoRow}>
                  <User size={12} color={Colors.textTertiary} strokeWidth={1.8} />
                  <Text style={styles.orderInfoText} numberOfLines={1}>{order.customer_name}</Text>
                </View>

                <View style={styles.orderInfoRow}>
                  <MapPin size={12} color={Colors.textTertiary} strokeWidth={1.8} />
                  <Text style={styles.orderInfoText} numberOfLines={3}>{formatFullAddress(order.address_apartment, order.address_street, order.address_landmark, order.address_city, order.address_state, order.address_pincode)}</Text>
                </View>

                <View style={styles.orderInfoRow}>
                  <Truck size={12} color={Colors.textTertiary} strokeWidth={1.8} />
                  <Text style={styles.orderInfoText}>
                    {order.scheduled_date ? format(new Date(order.scheduled_date), 'dd MMM yyyy') : '—'}
                    {order.plan_name ? ' · ' + order.plan_name : ''}
                  </Text>
                </View>
              </TouchableOpacity>

              <ChevronRight size={16} color={Colors.textTertiary} strokeWidth={1.8} />
            </View>
          );
        })}
      </View>
    );
  };

  const renderUnassignedList = () => {
    if (unassignedOrders.length === 0) {
      return (
        <View style={styles.emptyState}>
          <UserMinus size={36} color={Colors.textDisabled} strokeWidth={1.2} />
          <Text style={styles.emptyTitle}>No unassigned orders</Text>
          <Text style={styles.emptySub}>All scheduled orders have been assigned to riders.</Text>
        </View>
      );
    }

    return (
      <View>
        {unassignedOrders.map((order) => (
          <TouchableOpacity
            key={order.order_id}
            style={styles.orderCard}
            onPress={() => router.push({ pathname: '/(admin)/order-detail' as any, params: { id: order.order_id } })}
            activeOpacity={0.8}
          >
            <View style={[styles.statusDot, { backgroundColor: Colors.warning }]} />
            <View style={styles.orderContent}>
              <View style={styles.orderTopRow}>
                <Text style={styles.orderId}>{formatOrderReference(order.order_id)}</Text>
                <View style={[styles.statusBadge, { backgroundColor: '#FEF3C7' }]}>
                  <Text style={[styles.statusBadgeText, { color: '#B45309' }]}>Unassigned</Text>
                </View>
              </View>

              <View style={styles.orderInfoRow}>
                <User size={12} color={Colors.textTertiary} strokeWidth={1.8} />
                <Text style={styles.orderInfoText} numberOfLines={1}>{order.customer_name}</Text>
              </View>

              <View style={styles.orderInfoRow}>
                <MapPin size={12} color={Colors.textTertiary} strokeWidth={1.8} />
                <Text style={styles.orderInfoText} numberOfLines={3}>{formatFullAddress(order.address_apartment, order.address_street, order.address_landmark, order.address_city, order.address_state, order.address_pincode)}</Text>
              </View>

              <View style={styles.orderInfoRow}>
                <Truck size={12} color={Colors.textTertiary} strokeWidth={1.8} />
                <Text style={styles.orderInfoText}>
                  {order.scheduled_date ? format(new Date(order.scheduled_date), 'dd MMM yyyy') : '—'}
                  {order.plan_name ? ' · ' + order.plan_name : ''}
                </Text>
              </View>
            </View>

            <ChevronRight size={16} color={Colors.textTertiary} strokeWidth={1.8} />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing[3] }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={20} color={Colors.textPrimary} strokeWidth={2} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>{headerTitle}</Text>
            <Text style={styles.headerSubtitle}>
              {activeTab === 'unassigned'
                ? unassignedOrders.length + ' order' + (unassignedOrders.length !== 1 ? 's' : '') + ' unassigned'
                : activeTab === 'history'
                  ? historyOrders.length + ' past assignment' + (historyOrders.length !== 1 ? 's' : '')
                  : liveAssignedOrders.length + ' customer' + (liveAssignedOrders.length !== 1 ? 's' : '') + ' assigned'}
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.refreshBtn} onPress={() => { setRefreshing(true); load(); }} activeOpacity={0.8}>
            <RefreshCw size={14} color={Colors.primary} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.redistBtn} onPress={redistributeNow} disabled={redistributing} activeOpacity={0.8}>
            {redistributing ? <ActivityIndicator size="small" color={Colors.warning} /> : (
              <>
                <RefreshCw size={14} color={Colors.warning} strokeWidth={2} />
                <Text style={styles.redistBtnText}>Redistribute</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.manualReassignBtn} onPress={() => router.push('/(admin)/manual-reassign' as any)} activeOpacity={0.8}>
            <ArrowRightLeft size={14} color={Colors.primary} strokeWidth={2} />
            <Text style={styles.manualReassignBtnText}>Manual Reassign</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'assigned' && styles.tabActive]}
          onPress={() => setActiveTab('assigned')}
        >
          <Bike size={15} color={activeTab === 'assigned' ? Colors.primary : Colors.textTertiary} strokeWidth={1.8} />
          <Text style={[styles.tabText, activeTab === 'assigned' && styles.tabTextActive]}>
            Assigned ({liveAssignedOrders.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'unassigned' && styles.tabActive]}
          onPress={() => setActiveTab('unassigned')}
        >
          <UserMinus size={15} color={activeTab === 'unassigned' ? Colors.error : Colors.textTertiary} strokeWidth={1.8} />
          <Text style={[styles.tabText, activeTab === 'unassigned' && styles.tabTextActive, activeTab === 'unassigned' && { color: Colors.error }]}>
            Unassigned ({unassignedOrders.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
        >
          <ArrowRightLeft size={15} color={activeTab === 'history' ? Colors.primary : Colors.textTertiary} strokeWidth={1.8} />
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
            History ({historyOrders.length})
          </Text>
        </TouchableOpacity>
      </View>

      {bulkResult ? (
        <View style={[styles.bulkResultBar, bulkResult.failed > 0 ? { backgroundColor: '#FEE2E2' } : { backgroundColor: '#DCFCE7' }]}>
          <Text style={[styles.bulkResultText, { color: bulkResult.failed > 0 ? Colors.error : Colors.success }]}>
            {bulkResult.success} order(s) unassigned{bulkResult.failed > 0 ? ', ' + bulkResult.failed + ' failed' : ''}
          </Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBar}>
          <AlertCircle size={16} color={Colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, isWeb && styles.scrollContentWeb]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : activeTab === 'unassigned' ? (
          renderUnassignedList()
        ) : (
          <View style={[styles.contentColumns, isWeb && styles.contentColumnsWeb]}>
            <View style={styles.orderListColumn}>{renderAssignedList()}</View>
            {renderRiderAssignmentSummary()}
          </View>
        )}
      </ScrollView>

      <Modal visible={showBulkConfirm} animationType="fade" transparent onRequestClose={() => setShowBulkConfirm(false)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <View style={styles.dialogIcon}>
              <UserMinus size={28} color={Colors.error} />
            </View>
            <Text style={styles.dialogTitle}>Unassign {selectedCount} order(s)?</Text>
            <Text style={styles.dialogText}>
              The selected orders will be removed from their assigned riders and moved back to scheduled status. You can reassign them to other riders afterward.
            </Text>
            <View style={styles.dialogActions}>
              <TouchableOpacity style={styles.dialogCancelBtn} onPress={() => setShowBulkConfirm(false)} disabled={bulkUnassigning}>
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dialogConfirmBtn} onPress={handleBulkUnassign} disabled={bulkUnassigning}>
                {bulkUnassigning ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.dialogConfirmText}>Unassign All</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={showRedistributeResult} transparent animationType="fade" onRequestClose={() => setShowRedistributeResult(false)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <View style={[styles.dialogIcon, { backgroundColor: '#E8F5E9' }]}>
              <CheckCircle size={28} color={Colors.success} />
            </View>
            <Text style={styles.dialogTitle}>Redistribution Complete</Text>
            <Text style={styles.dialogText}>
              {redistributeResult?.redistributed ?? 0} order(s) reassigned to backup riders.
              {(redistributeResult?.skipped_primary ?? 0) > 0 ? `\n${redistributeResult?.skipped_primary} order(s) skipped (primary rider locked).` : ''}
              {(redistributeResult?.failed ?? 0) > 0 ? `\n${redistributeResult?.failed} order(s) could not be reassigned (no available rider).` : ''}
            </Text>
            <View style={styles.dialogActions}>
              <TouchableOpacity style={[styles.dialogConfirmBtn, { backgroundColor: Colors.primary }]} onPress={() => setShowRedistributeResult(false)}>
                <Text style={styles.dialogConfirmText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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
  tabBar: {
    flexDirection: 'row',
    marginTop: Spacing[2],
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[3],
    gap: Spacing[2],
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    backgroundColor: Colors.neutral[50],
  },
  tabActive: { backgroundColor: Colors.primarySurface },
  tabText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary },
  tabTextActive: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.primary },
  bulkResultBar: {
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[4],
    alignItems: 'center',
  },
  bulkResultText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm },
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[4],
    backgroundColor: '#FEE2E2',
  },
  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error, flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing[4] },
  scrollContentWeb: { maxWidth: 1200, alignSelf: 'center', width: '100%' },
  contentColumns: { gap: Spacing[4] },
  contentColumnsWeb: { flexDirection: 'row', alignItems: 'flex-start' },
  orderListColumn: { flex: 1, minWidth: 0 },
  loadingWrap: { paddingVertical: Spacing[10], alignItems: 'center' },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing[2],
    marginBottom: Spacing[2],
  },
  filterBar: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    marginBottom: Spacing[2],
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterInner: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  filterLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary },

  filterDropdown: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1], paddingHorizontal: Spacing[2], paddingVertical: Spacing[1], borderRadius: Radius.sm, backgroundColor: Colors.neutral[50] },
  filterDropdownText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary, maxWidth: 180 },
  filterClearBtn: { paddingHorizontal: Spacing[2], paddingVertical: Spacing[1] },
  filterClearText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.error },
  filterOptions: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing[2],
    maxHeight: 300,
    overflow: 'hidden',
  },
  filterSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.neutral[50],
  },
  filterSearchInput: {
    flex: 1,
    minHeight: 42,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    outlineStyle: 'none',
  } as any,
  filterOption: { paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterOptionActive: { backgroundColor: Colors.primarySurface },
  filterOptionText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  filterOptionTextActive: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.primary },
  filterNoResults: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, paddingHorizontal: Spacing[3], paddingVertical: Spacing[3] },
  bulkActionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    marginBottom: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.border,
  },
  selectToggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  selectToggleText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  bulkUnassignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    backgroundColor: Colors.error,
  },
  bulkUnassignBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    marginBottom: Spacing[2],
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.border,
  },
  orderCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  sequenceBadge: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  sequenceBadgeText: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm, color: Colors.white,
  },
  seqInput: {
    width: 36, height: 32, borderRadius: Radius.sm, borderWidth: 1.5, borderColor: Colors.primary,
    backgroundColor: Colors.white, textAlign: 'center',
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm, color: Colors.textPrimary,
    paddingHorizontal: 4, paddingVertical: 0, flexShrink: 0,
  },
  sequenceControls: { flexDirection: 'row', gap: 2, marginLeft: Spacing[1] },
  sequenceArrowBtn: { padding: 4, borderRadius: Radius.sm, backgroundColor: Colors.neutral[50] },
  sequenceLegendBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    paddingHorizontal: Spacing[3], paddingVertical: Spacing[2],
    backgroundColor: Colors.primarySurface, borderRadius: Radius.md, marginBottom: Spacing[2],
  },
  sequenceLegendText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.primary,
  },
  sequenceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[1],
    paddingHorizontal: Spacing[3], paddingVertical: Spacing[2],
    borderRadius: Radius.md, backgroundColor: Colors.primarySurface, borderWidth: 1, borderColor: Colors.primary,
  },
  sequenceBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.primary },
  sequenceErrorBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    paddingVertical: Spacing[2], paddingHorizontal: Spacing[3],
    backgroundColor: '#FEE2E2', borderRadius: Radius.md, marginBottom: Spacing[2],
  },
  sequenceErrorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.error, flex: 1 },
  checkbox: { padding: Spacing[1], marginRight: Spacing[1] },
  statusDot: { width: 4, height: 40, borderRadius: 2, marginRight: Spacing[2] },
  orderContent: { flex: 1, gap: Spacing[1] },
  orderTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing[1] },
  orderId: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  statusBadge: { paddingHorizontal: Spacing[2], paddingVertical: 2, borderRadius: Radius.sm },
  statusBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  orderInfoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  orderInfoText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary, flex: 1 },
  orderIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    flex: 1,
    flexWrap: 'wrap',
  },
  riderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.primarySurface,
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  riderPillText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 11,
    color: Colors.primary,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing[1],
    alignItems: 'center',
  },
  summaryCard: {
    width: 280,
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing[3],
    marginBottom: Spacing[3],
  },
  summaryHeader: {
    gap: Spacing[2],
    paddingBottom: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  summaryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  summaryHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  summaryActiveRef: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.success },
  summaryTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary, flex: 1 },
  summaryTotal: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  summaryTableHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing[2] },
  summaryColumnLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textTertiary },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[2], borderTopWidth: 1, borderTopColor: Colors.neutral[100] },
  summaryRowActive: { backgroundColor: Colors.primarySurface, borderRadius: Radius.sm, borderTopColor: Colors.primary },
  summaryRiderName: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flex: 1 },
  summaryRiderText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary, flex: 1 },
  summaryActiveBadge: { minWidth: 30, paddingHorizontal: Spacing[2], paddingVertical: Spacing[1], borderRadius: Radius.sm, alignItems: 'center', backgroundColor: '#E8F5E9' },
  summaryActiveText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm, color: Colors.success },
  summaryCountBadge: { minWidth: 30, paddingHorizontal: Spacing[2], paddingVertical: Spacing[1], borderRadius: Radius.sm, alignItems: 'center', backgroundColor: Colors.primarySurface },
  summaryCountText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm, color: Colors.primary },
  summaryEmpty: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, paddingVertical: Spacing[2] },
  emptyState: { alignItems: 'center', paddingVertical: Spacing[10], gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  emptySub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[5],
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing[6],
    alignItems: 'center',
    gap: Spacing[3],
  },
  dialogIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#FEE2E2',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing[1],
  },
  dialogTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  dialogText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  dialogActions: { flexDirection: 'row', gap: Spacing[3], marginTop: Spacing[2], width: '100%' },
  dialogCancelBtn: {
    flex: 1, paddingVertical: Spacing[3], borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  dialogCancelText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  dialogConfirmBtn: {
    flex: 1, paddingVertical: Spacing[3], borderRadius: Radius.md,
    backgroundColor: Colors.error, alignItems: 'center',
  },
  dialogConfirmText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  redistBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1], backgroundColor: '#FFF3E0', borderWidth: 1, borderColor: Colors.warning, paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderRadius: Radius.md },
  redistBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.warning },
  manualReassignBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1], backgroundColor: Colors.primarySurface, borderWidth: 1, borderColor: Colors.primary, paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderRadius: Radius.md },
  manualReassignBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.primary },
  reassignedBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: Spacing[1], paddingVertical: 2, borderRadius: Radius.sm, backgroundColor: '#E0E7FF' },
  reassignedBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 9, color: '#4F46E5' },
  autoBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: Spacing[1], paddingVertical: 2, borderRadius: Radius.sm, backgroundColor: '#FEF3C7' },
  autoBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 9, color: '#B45309' },
  primaryBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4, paddingVertical: 1, borderRadius: Radius.sm, backgroundColor: '#FFF8E1', marginLeft: 4 },
  primaryBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 8, color: '#F59E0B' },
  manualModal: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing[4],
    maxHeight: '85%',
  },
  manualHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing[3] },
  manualTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  manualClose: { fontSize: 18, color: Colors.textTertiary },
  manualScroll: { maxHeight: 500 },
  manualFieldLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary, marginBottom: Spacing[2], marginTop: Spacing[2] },
  manualSelectedRider: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.primarySurface, borderRadius: Radius.md, padding: Spacing[3], marginBottom: Spacing[2] },
  manualRiderAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  manualRiderAvatarText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.white },
  manualRiderName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  manualRiderMeta: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  manualClearBtn: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.error },
  manualRiderList: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, overflow: 'hidden', marginBottom: Spacing[2] },
  manualRiderItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  manualDateRow: { flexDirection: 'row', gap: Spacing[2] },
  manualInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  manualOrderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[2] },
  manualSelectAllRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  manualSelectAllText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.primary },
  manualSep: { color: Colors.textDisabled, fontSize: Typography.size.xs },
  manualClearAllText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.error },
  manualEmptyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', paddingVertical: Spacing[4] },
  manualOrderList: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, overflow: 'hidden' },
  manualOrderItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingVertical: Spacing[3], paddingHorizontal: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  manualOrderItemSelected: { backgroundColor: Colors.primarySurface },
  manualOrderCustomer: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  manualOrderMeta: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  manualOrderAddr: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textDisabled },
  manualSearchWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], marginBottom: Spacing[2] },
  manualSearchIcon: { fontSize: 14 },
  manualSearchInput: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  manualSummary: { backgroundColor: Colors.primarySurface, borderRadius: Radius.md, padding: Spacing[3], marginTop: Spacing[2] },
  manualSummaryText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary, textAlign: 'center' },
  manualFooter: { flexDirection: 'row', gap: Spacing[3], marginTop: Spacing[3], paddingTop: Spacing[3], borderTopWidth: 1, borderTopColor: Colors.border },
  manualConfirmRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  manualConfirmLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary },
  manualConfirmValue: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
});
