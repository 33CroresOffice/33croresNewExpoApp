import React, { useEffect, useState, useCallback } from 'react';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, ActivityIndicator, RefreshControl,
  Modal, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Truck, Search, ArrowLeft, X, ChevronRight, Calendar, CircleCheck as CheckCircle, CircleAlert as AlertCircle, Clock, User, MapPin, Plus, ChevronDown, Package, Zap, RefreshCw, ShieldAlert } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { format, isToday, parseISO } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

const ASSIGN_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  assigned:   { label: 'Assigned',   color: Colors.primary,      bg: Colors.primarySurface },
  accepted:   { label: 'Accepted',   color: Colors.accentDark,   bg: Colors.accentSurface },
  picked_up:  { label: 'Picked Up',  color: Colors.warning,      bg: '#FFF3E0' },
  delivered:  { label: 'Delivered',  color: Colors.success,      bg: '#E8F5E9' },
  failed:     { label: 'Failed',     color: Colors.error,        bg: '#FFEBEE' },
  reassigned: { label: 'Reassigned', color: Colors.textTertiary, bg: Colors.neutral[100] },
};

const STATUS_STEPS = ['assigned', 'accepted', 'picked_up', 'delivered'];

const OVERRIDE_REASONS = [
  'Rider unavailable',
  'Rider on leave',
  'Customer complaint',
  'Zone change',
  'Vehicle breakdown',
  'Other',
];

function scoreRider(rider: any, order: any, activeCountMap: Map<string, number>, leaveSet: Set<string>): number {
  if (leaveSet.has(rider.id)) return -1;
  let score = 0;
  const orderZone = order?.subscription?.delivery_address?.city ?? order?.delivery_address?.city ?? '';
  if (orderZone && rider.zone && rider.zone.toLowerCase() === orderZone.toLowerCase()) score += 3;
  const activeCount = activeCountMap.get(rider.id) ?? 0;
  score += Math.max(0, 5 - activeCount);
  return score;
}

export default function RiderAssignmentsScreen() {
  return (
    <ModuleGuard module="riders">
      <RiderAssignmentsScreenContent />
    </ModuleGuard>
  );
}

function RiderAssignmentsScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { profile: adminProfile } = useAuthStore();
  const params = useLocalSearchParams<{ rider_id?: string; rider_name?: string; order_id?: string }>();

  const [riders, setRiders] = useState<any[]>([]);
  const [unassignedOrders, setUnassignedOrders] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'assign' | 'active' | 'history'>('assign');

  const [leaveSet, setLeaveSet] = useState<Set<string>>(new Set());
  const [activeCountMap, setActiveCountMap] = useState<Map<string, number>>(new Map());

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [selectedRider, setSelectedRider] = useState<any | null>(null);
  const [assignForm, setAssignForm] = useState({ delivery_fee: '', distance_km: '', notes: '' });
  const [assigning, setAssigning] = useState(false);
  const [riderSearch, setRiderSearch] = useState('');
  const [smartSuggestions, setSmartSuggestions] = useState<{ rider: any; score: number; reason: string }[]>([]);

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<any | null>(null);
  const [failureReason, setFailureReason] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideAssignment, setOverrideAssignment] = useState<any | null>(null);
  const [overrideRider, setOverrideRider] = useState<any | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideReasonPicker, setOverrideReasonPicker] = useState(false);
  const [overrideRiderSearch, setOverrideRiderSearch] = useState('');
  const [overriding, setOverriding] = useState(false);

  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ assigned: number; failed: number } | null>(null);
  const [showBulkResult, setShowBulkResult] = useState(false);

  const [reassignQueue, setReassignQueue] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      const [ridersRes, ordersRes, assignmentsRes, leaveRes] = await Promise.all([
        supabase.from('riders').select('id, full_name, mobile, zone, vehicle_type, is_active').eq('is_active', true).order('full_name'),
        supabase.from('orders').select('*, user:profiles(full_name, mobile), subscription:subscriptions(plan:subscription_plans(name), delivery_address:addresses(street, city))').in('status', ['scheduled', 'out_for_delivery']).order('scheduled_date').limit(100),
        supabase.from('rider_order_assignments').select('*, rider:rider_id(full_name, mobile, zone, vehicle_type), order:orders(id, scheduled_date, status, user:profiles(full_name, mobile), subscription:subscriptions(delivery_address:addresses(street, city)))').order('assigned_at', { ascending: false }).limit(200),
        supabase.from('rider_leave_requests').select('rider_id').eq('leave_date', today).eq('status', 'approved'),
      ]);

      const allOrders = ordersRes.data ?? [];
      const allAssignments = assignmentsRes.data ?? [];
      const assignedOrderIds = new Set(allAssignments.filter(a => !['delivered', 'failed', 'reassigned'].includes(a.status)).map(a => a.order_id));
      const unassigned = allOrders.filter(o => !assignedOrderIds.has(o.id));

      const leaves = new Set((leaveRes.data ?? []).map((l: any) => l.rider_id as string));

      const countMap = new Map<string, number>();
      allAssignments.filter(a => ['assigned', 'accepted', 'picked_up'].includes(a.status)).forEach(a => {
        countMap.set(a.rider_id, (countMap.get(a.rider_id) ?? 0) + 1);
      });

      const activeArr = allAssignments.filter(a => ['assigned', 'accepted', 'picked_up'].includes(a.status));
      const leaveRiderIds = Array.from(leaves);
      const queue: any[] = [];
      leaveRiderIds.forEach(riderId => {
        const affected = activeArr.filter(a => a.rider_id === riderId);
        queue.push(...affected);
      });

      setRiders(ridersRes.data ?? []);
      setUnassignedOrders(unassigned);
      setAssignments(allAssignments);
      setLeaveSet(leaves);
      setActiveCountMap(countMap);
      setReassignQueue(queue);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (params.rider_id) setSelectedRider(riders.find(r => r.id === params.rider_id) ?? null);
    if (params.order_id) setSelectedOrder(unassignedOrders.find(o => o.id === params.order_id) ?? null);
  }, [params.rider_id, params.order_id, riders, unassignedOrders]);

  const buildSmartSuggestions = (order: any) => {
    const scored = riders
      .filter(r => !leaveSet.has(r.id))
      .map(r => {
        const s = scoreRider(r, order, activeCountMap, leaveSet);
        const parts: string[] = [];
        const orderZone = order?.subscription?.delivery_address?.city ?? order?.delivery_address?.city ?? '';
        if (orderZone && r.zone && r.zone.toLowerCase() === orderZone.toLowerCase()) parts.push('Zone match');
        const cnt = activeCountMap.get(r.id) ?? 0;
        parts.push(cnt === 0 ? 'Free' : `${cnt} active`);
        return { rider: r, score: s, reason: parts.join(' · ') };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    setSmartSuggestions(scored);
  };

  const openAssignModal = (order: any) => {
    setSelectedOrder(order);
    setSelectedRider(params.rider_id ? riders.find(r => r.id === params.rider_id) ?? null : null);
    setAssignForm({ delivery_fee: '', distance_km: '', notes: '' });
    setRiderSearch('');
    buildSmartSuggestions(order);
    setShowAssignModal(true);
  };

  const assign = async () => {
    if (!selectedOrder || !selectedRider) return;
    setAssigning(true);
    const { error } = await supabase.from('rider_order_assignments').insert({
      rider_id: selectedRider.id,
      order_id: selectedOrder.id,
      assigned_by: adminProfile?.id,
      status: 'assigned',
      delivery_fee: parseInt(assignForm.delivery_fee) || 0,
      distance_km: parseFloat(assignForm.distance_km) || null,
      notes: assignForm.notes.trim(),
    });
    if (!error) {
      await supabase.from('orders').update({ status: 'out_for_delivery' }).eq('id', selectedOrder.id);
    }
    setAssigning(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setShowAssignModal(false);
    load();
  };

  const updateAssignmentStatus = async (assignment: any, newStatus: string) => {
    setUpdatingStatus(true);
    const now = new Date().toISOString();
    const update: any = { status: newStatus, updated_at: now };
    if (newStatus === 'accepted') update.accepted_at = now;
    if (newStatus === 'picked_up') update.picked_up_at = now;
    if (newStatus === 'delivered') { update.delivered_at = now; await supabase.from('orders').update({ status: 'delivered', delivered_at: now }).eq('id', assignment.order_id); }
    if (newStatus === 'failed') { update.failed_at = now; update.failure_reason = failureReason; await supabase.from('orders').update({ status: 'failed' }).eq('id', assignment.order_id); }
    await supabase.from('rider_order_assignments').update(update).eq('id', assignment.id);
    setUpdatingStatus(false);
    setShowStatusModal(false);
    setFailureReason('');
    load();
  };

  const openOverride = (assignment: any) => {
    setOverrideAssignment(assignment);
    setOverrideRider(null);
    setOverrideReason('');
    setOverrideRiderSearch('');
    setOverrideReasonPicker(false);
    buildSmartSuggestions(assignment.order);
    setShowOverrideModal(true);
  };

  const doOverride = async () => {
    if (!overrideAssignment || !overrideRider || !overrideReason) return;
    setOverriding(true);
    const now = new Date().toISOString();
    await supabase.from('rider_order_assignments').update({ status: 'reassigned', is_reassigned: true, updated_at: now }).eq('id', overrideAssignment.id);
    await supabase.from('rider_order_assignments').insert({
      rider_id: overrideRider.id,
      order_id: overrideAssignment.order_id,
      assigned_by: adminProfile?.id,
      status: 'assigned',
      delivery_fee: overrideAssignment.delivery_fee,
      distance_km: overrideAssignment.distance_km,
      notes: overrideAssignment.notes,
      swap_reason: overrideReason,
      swapped_from_rider_id: overrideAssignment.rider_id,
    });
    await supabase.from('rider_activity_log').insert({
      rider_id: overrideAssignment.rider_id,
      activity_type: 'assignment_override',
      description: `Order reassigned to ${overrideRider.full_name}. Reason: ${overrideReason}`,
      metadata: { order_id: overrideAssignment.order_id, new_rider_id: overrideRider.id, reason: overrideReason },
      created_by: adminProfile?.id,
    });
    setOverriding(false);
    setShowOverrideModal(false);
    load();
  };

  const bulkSmartAssign = async () => {
    if (unassignedOrders.length === 0) return;
    setBulkAssigning(true);
    let assigned = 0;
    let failed = 0;
    const usedThisRound = new Map<string, number>(activeCountMap);

    for (const order of unassignedOrders) {
      const best = riders
        .filter(r => !leaveSet.has(r.id))
        .map(r => ({ rider: r, score: scoreRider(r, order, usedThisRound, leaveSet) }))
        .filter(x => x.score >= 0)
        .sort((a, b) => b.score - a.score)[0];

      if (!best) { failed++; continue; }

      const { error } = await supabase.from('rider_order_assignments').insert({
        rider_id: best.rider.id,
        order_id: order.id,
        assigned_by: adminProfile?.id,
        status: 'assigned',
        delivery_fee: 0,
        notes: 'Auto-assigned by smart system',
      });
      if (!error) {
        await supabase.from('orders').update({ status: 'out_for_delivery' }).eq('id', order.id);
        usedThisRound.set(best.rider.id, (usedThisRound.get(best.rider.id) ?? 0) + 1);
        assigned++;
      } else {
        failed++;
      }
    }

    setBulkAssigning(false);
    setBulkResult({ assigned, failed });
    setShowBulkResult(true);
    load();
  };

  const activeAssignments = assignments.filter(a => ['assigned', 'accepted', 'picked_up'].includes(a.status));
  const historyAssignments = assignments.filter(a => ['delivered', 'failed', 'reassigned'].includes(a.status));

  const filteredUnassigned = unassignedOrders.filter(o => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (o.user?.full_name ?? '').toLowerCase().includes(q) || (o.user?.mobile ?? '').includes(q) || o.id.toLowerCase().includes(q);
  });

  const filteredActive = activeAssignments.filter(a => {
    if (params.rider_id && a.rider_id !== params.rider_id) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (a.rider?.full_name ?? '').toLowerCase().includes(q) || (a.order?.user?.full_name ?? '').toLowerCase().includes(q);
  });

  const filteredHistory = historyAssignments.filter(a => {
    if (params.rider_id && a.rider_id !== params.rider_id) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (a.rider?.full_name ?? '').toLowerCase().includes(q) || (a.order?.user?.full_name ?? '').toLowerCase().includes(q);
  });

  const filteredRiders = riders.filter(r => {
    if (leaveSet.has(r.id)) return false;
    if (!riderSearch.trim()) return true;
    return r.full_name.toLowerCase().includes(riderSearch.toLowerCase()) || r.zone.toLowerCase().includes(riderSearch.toLowerCase());
  });

  const overrideFilteredRiders = riders.filter(r => {
    if (r.id === overrideAssignment?.rider_id) return false;
    if (!overrideRiderSearch.trim()) return true;
    return r.full_name.toLowerCase().includes(overrideRiderSearch.toLowerCase()) || r.zone.toLowerCase().includes(overrideRiderSearch.toLowerCase());
  });

  return (
    <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top }]}>
      {/* Header */}
      <View style={[s.header, isWeb && s.headerWeb]}>
        {!isWeb && (
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <ArrowLeft size={22} color={Colors.textPrimary} strokeWidth={1.8} />
          </TouchableOpacity>
        )}
        <View style={s.headerLeft}>
          <View style={s.headerIcon}>
            <Truck size={isWeb ? 22 : 18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>{params.rider_name ? `${params.rider_name}'s Deliveries` : 'Assignments'}</Text>
            <Text style={s.subtitle}>{unassignedOrders.length} unassigned · {activeAssignments.length} in transit</Text>
          </View>
        </View>
        {activeTab === 'assign' && unassignedOrders.length > 0 && (
          <TouchableOpacity style={s.bulkBtn} onPress={bulkSmartAssign} disabled={bulkAssigning} activeOpacity={0.8}>
            {bulkAssigning ? <ActivityIndicator size="small" color={Colors.white} /> : (
              <>
                <Zap size={14} color={Colors.white} strokeWidth={2} />
                <Text style={s.bulkBtnText}>Auto-Assign All</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Reassignment Queue Banner */}
      {reassignQueue.length > 0 && (
        <View style={[s.rqBanner, isWeb && s.rqBannerWeb]}>
          <ShieldAlert size={16} color={Colors.warning} strokeWidth={1.8} />
          <Text style={s.rqBannerText}>{reassignQueue.length} active {reassignQueue.length === 1 ? 'assignment' : 'assignments'} need reassignment — rider is on leave today</Text>
          <TouchableOpacity onPress={() => setActiveTab('active')} style={s.rqBannerBtn}>
            <Text style={s.rqBannerBtnText}>Review</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Search */}
      <View style={[s.searchRow, isWeb && s.searchRowWeb]}>
        <View style={s.searchWrap}>
          <Search size={14} color={Colors.textTertiary} strokeWidth={1.8} />
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search orders or riders…" placeholderTextColor={Colors.textDisabled} />
          {search ? <TouchableOpacity onPress={() => setSearch('')}><X size={14} color={Colors.textTertiary} /></TouchableOpacity> : null}
        </View>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll} contentContainerStyle={[s.tabs, isWeb && s.tabsWeb]}>
        {([
          { key: 'assign',  label: `Unassigned (${unassignedOrders.length})` },
          { key: 'active',  label: `In Transit (${activeAssignments.length})${reassignQueue.length > 0 ? ' ⚠' : ''}` },
          { key: 'history', label: `History (${historyAssignments.length})` },
        ] as const).map(t => (
          <TouchableOpacity key={t.key} style={[s.tabBtn, activeTab === t.key && s.tabBtnActive]} onPress={() => setActiveTab(t.key)}>
            <Text style={[s.tabText, activeTab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
      ) : (
        <ScrollView style={s.scroll} contentContainerStyle={[s.content, isWeb && s.contentWeb]} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>

          {/* UNASSIGNED */}
          {activeTab === 'assign' && (
            filteredUnassigned.length === 0 ? (
              <EmptyState icon={<CheckCircle size={36} color={Colors.success} strokeWidth={1.2} />} title="All orders assigned!" sub="No unassigned orders at the moment." />
            ) : (
              filteredUnassigned.map(order => {
                const isOrderToday = isToday(parseISO(order.scheduled_date));
                return (
                  <View key={order.id} style={s.orderCard}>
                    <View style={s.orderCardLeft}>
                      <View style={[s.dateBadge, { backgroundColor: isOrderToday ? Colors.primarySurface : Colors.neutral[100] }]}>
                        <Text style={[s.dateDay, { color: isOrderToday ? Colors.primary : Colors.textSecondary }]}>{format(parseISO(order.scheduled_date), 'dd')}</Text>
                        <Text style={[s.dateMonth, { color: isOrderToday ? Colors.primaryLight : Colors.textTertiary }]}>{format(parseISO(order.scheduled_date), 'MMM')}</Text>
                      </View>
                    </View>
                    <View style={s.orderBody}>
                      <Text style={s.orderCustomer}>{order.user?.full_name ?? order.user?.mobile ?? 'Unknown'}</Text>
                      <Text style={s.orderPlan}>{order.subscription?.plan?.name}</Text>
                      {order.subscription?.delivery_address && <View style={s.orderAddr}><MapPin size={11} color={Colors.textTertiary} strokeWidth={1.8} /><Text style={s.orderAddrText} numberOfLines={1}>{order.subscription.delivery_address.street}, {order.subscription.delivery_address.city}</Text></View>}
                      <Text style={s.orderId}>#{order.id.slice(-8).toUpperCase()}</Text>
                    </View>
                    <TouchableOpacity style={s.assignNowBtn} onPress={() => openAssignModal(order)} activeOpacity={0.8}>
                      <Truck size={14} color={Colors.white} strokeWidth={2} />
                      <Text style={s.assignNowText}>Assign</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )
          )}

          {/* ACTIVE ASSIGNMENTS */}
          {activeTab === 'active' && (
            filteredActive.length === 0 ? (
              <EmptyState icon={<Truck size={36} color={Colors.textDisabled} strokeWidth={1.2} />} title="No active assignments" sub="Assign orders to riders to see them here." />
            ) : (
              filteredActive.map(a => {
                const cfg = ASSIGN_STATUS_CONFIG[a.status];
                const nextStatus = STATUS_STEPS[STATUS_STEPS.indexOf(a.status) + 1];
                const needsReassign = reassignQueue.some(r => r.id === a.id);
                return (
                  <View key={a.id} style={[s.activeCard, needsReassign && s.activeCardWarning]}>
                    {needsReassign && (
                      <View style={s.warningBanner}>
                        <ShieldAlert size={12} color={Colors.warning} strokeWidth={2} />
                        <Text style={s.warningBannerText}>Rider is on leave — needs reassignment</Text>
                        <TouchableOpacity style={s.warningReassignBtn} onPress={() => openOverride(a)}>
                          <RefreshCw size={11} color={Colors.warning} strokeWidth={2} />
                          <Text style={s.warningReassignText}>Reassign</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    <TouchableOpacity style={s.activeCardInner} onPress={() => { setSelectedAssignment(a); setFailureReason(''); setShowStatusModal(true); }} activeOpacity={0.8}>
                      <View style={[s.activeStatusBar, { backgroundColor: cfg.color }]} />
                      <View style={s.activeBody}>
                        <View style={s.activeTop}>
                          <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                            <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                          </View>
                          <Text style={s.activeOrderId}>#{a.order_id.slice(-8).toUpperCase()}</Text>
                          <TouchableOpacity style={s.overrideBtn} onPress={() => openOverride(a)} activeOpacity={0.8}>
                            <RefreshCw size={12} color={Colors.textTertiary} strokeWidth={2} />
                          </TouchableOpacity>
                        </View>
                        <View style={s.activeMid}>
                          <View style={s.activeRider}>
                            <Truck size={12} color={Colors.primary} strokeWidth={2} />
                            <Text style={s.activeRiderName}>{a.rider?.full_name}</Text>
                            <Text style={s.activeZone}>({a.rider?.zone})</Text>
                          </View>
                          <View style={s.activeCustomer}>
                            <User size={12} color={Colors.textTertiary} strokeWidth={2} />
                            <Text style={s.activeCustomerName}>{a.order?.user?.full_name ?? a.order?.user?.mobile}</Text>
                          </View>
                        </View>
                        <View style={s.activeFooter}>
                          {a.order?.subscription?.delivery_address && <View style={s.activeAddr}><MapPin size={10} color={Colors.textTertiary} strokeWidth={2} /><Text style={s.activeAddrText} numberOfLines={1}>{a.order.subscription.delivery_address.street}</Text></View>}
                          <Text style={s.activeTime}>{format(new Date(a.assigned_at), 'HH:mm')}</Text>
                        </View>
                      </View>
                      {nextStatus && (
                        <View style={[s.nextStatusBtn, { backgroundColor: ASSIGN_STATUS_CONFIG[nextStatus]?.bg ?? Colors.neutral[100] }]}>
                          <Text style={[s.nextStatusText, { color: ASSIGN_STATUS_CONFIG[nextStatus]?.color ?? Colors.textSecondary }]}>{ASSIGN_STATUS_CONFIG[nextStatus]?.label}</Text>
                          <ChevronRight size={12} color={ASSIGN_STATUS_CONFIG[nextStatus]?.color ?? Colors.textSecondary} strokeWidth={2} />
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })
            )
          )}

          {/* HISTORY */}
          {activeTab === 'history' && (
            filteredHistory.length === 0 ? (
              <EmptyState icon={<Package size={36} color={Colors.textDisabled} strokeWidth={1.2} />} title="No history yet" sub="Completed deliveries will appear here." />
            ) : (
              filteredHistory.map(a => {
                const cfg = ASSIGN_STATUS_CONFIG[a.status];
                return (
                  <View key={a.id} style={s.histCard}>
                    <View style={[s.histDot, { backgroundColor: cfg.color }]} />
                    <View style={s.histBody}>
                      <View style={s.histTop}>
                        <Text style={s.histOrderId}>#{a.order_id.slice(-8).toUpperCase()}</Text>
                        <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                          <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                      </View>
                      <View style={s.histMeta}>
                        <Truck size={11} color={Colors.textTertiary} strokeWidth={1.8} />
                        <Text style={s.histRider}>{a.rider?.full_name}</Text>
                        <Text style={s.histSep}>·</Text>
                        <User size={11} color={Colors.textTertiary} strokeWidth={1.8} />
                        <Text style={s.histCustomer}>{a.order?.user?.full_name ?? a.order?.user?.mobile}</Text>
                      </View>
                      {a.delivered_at && <Text style={s.histTime}>Delivered {format(new Date(a.delivered_at), 'dd MMM · HH:mm')}</Text>}
                      {a.failed_at && <Text style={s.histFail}>{a.failure_reason || 'Delivery failed'}</Text>}
                      {a.swap_reason && <Text style={s.histSwap}>Swapped: {a.swap_reason}</Text>}
                      {a.delivery_fee > 0 && <Text style={s.histFee}>Fee: ₹{a.delivery_fee}</Text>}
                    </View>
                  </View>
                );
              })
            )
          )}
        </ScrollView>
      )}

      {/* Assign Modal */}
      <Modal visible={showAssignModal} transparent animationType="fade" onRequestClose={() => setShowAssignModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Assign Order</Text>
              <TouchableOpacity onPress={() => setShowAssignModal(false)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {selectedOrder && (
                <View style={s.orderSummary}>
                  <Text style={s.orderSummaryLabel}>Order</Text>
                  <Text style={s.orderSummaryId}>#{selectedOrder.id.slice(-8).toUpperCase()}</Text>
                  <Text style={s.orderSummaryCustomer}>{selectedOrder.user?.full_name ?? selectedOrder.user?.mobile}</Text>
                  <Text style={s.orderSummaryDate}>{format(parseISO(selectedOrder.scheduled_date), 'EEEE, dd MMM yyyy')}</Text>
                  {selectedOrder.subscription?.delivery_address && <Text style={s.orderSummaryAddr}>{selectedOrder.subscription.delivery_address.street}, {selectedOrder.subscription.delivery_address.city}</Text>}
                </View>
              )}

              {/* Smart Suggestions */}
              {!selectedRider && smartSuggestions.length > 0 && (
                <View style={s.suggSection}>
                  <View style={s.suggHeader}>
                    <Zap size={13} color={Colors.accentDark} strokeWidth={2} />
                    <Text style={s.suggTitle}>Smart Suggestions</Text>
                  </View>
                  {smartSuggestions.map((s2, i) => (
                    <TouchableOpacity key={s2.rider.id} style={[s.suggCard, i === 0 && s.suggCardTop]} onPress={() => setSelectedRider(s2.rider)} activeOpacity={0.8}>
                      <View style={[s.suggRank, { backgroundColor: i === 0 ? Colors.primary : Colors.neutral[100] }]}>
                        <Text style={[s.suggRankText, { color: i === 0 ? Colors.white : Colors.textTertiary }]}>#{i + 1}</Text>
                      </View>
                      <View style={s.suggInfo}>
                        <Text style={s.suggName}>{s2.rider.full_name}</Text>
                        <Text style={s.suggMeta}>{s2.reason}</Text>
                      </View>
                      <View style={s.suggScore}>
                        <Text style={s.suggScoreVal}>{s2.score}</Text>
                        <Text style={s.suggScoreLabel}>pts</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>Select Rider *</Text>
                {selectedRider ? (
                  <TouchableOpacity style={s.selectedRider} onPress={() => { setSelectedRider(null); buildSmartSuggestions(selectedOrder); }}>
                    <View style={s.selectedRiderAvatar}><Text style={s.selectedRiderAvatarText}>{selectedRider.full_name.charAt(0)}</Text></View>
                    <View style={s.selectedRiderInfo}>
                      <Text style={s.selectedRiderName}>{selectedRider.full_name}</Text>
                      <Text style={s.selectedRiderZone}>{selectedRider.zone} · {selectedRider.vehicle_type}</Text>
                    </View>
                    <TouchableOpacity onPress={() => { setSelectedRider(null); buildSmartSuggestions(selectedOrder); }}><X size={14} color={Colors.textTertiary} /></TouchableOpacity>
                  </TouchableOpacity>
                ) : (
                  <View>
                    <View style={s.searchWrap}>
                      <Search size={13} color={Colors.textTertiary} strokeWidth={1.8} />
                      <TextInput style={s.searchInput} value={riderSearch} onChangeText={setRiderSearch} placeholder="Search riders…" placeholderTextColor={Colors.textDisabled} />
                    </View>
                    <View style={s.riderList}>
                      {filteredRiders.slice(0, 6).map(r => (
                        <TouchableOpacity key={r.id} style={s.riderListItem} onPress={() => { setSelectedRider(r); setRiderSearch(''); }}>
                          <View style={s.riderListAvatar}><Text style={s.riderListAvatarText}>{r.full_name.charAt(0)}</Text></View>
                          <View style={s.riderListInfo}>
                            <Text style={s.riderListName}>{r.full_name}</Text>
                            <Text style={s.riderListMeta}>{r.zone} · {r.vehicle_type} · {activeCountMap.get(r.id) ?? 0} active</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>

              <View style={s.assignFormRow}>
                <View style={[s.fieldGroup, { flex: 1 }]}>
                  <Text style={s.fieldLabel}>Delivery Fee (₹)</Text>
                  <TextInput style={s.input} value={assignForm.delivery_fee} onChangeText={v => setAssignForm(p => ({ ...p, delivery_fee: v }))} placeholder="0" keyboardType="numeric" placeholderTextColor={Colors.textDisabled} />
                </View>
                <View style={[s.fieldGroup, { flex: 1 }]}>
                  <Text style={s.fieldLabel}>Distance (km)</Text>
                  <TextInput style={s.input} value={assignForm.distance_km} onChangeText={v => setAssignForm(p => ({ ...p, distance_km: v }))} placeholder="0.0" keyboardType="decimal-pad" placeholderTextColor={Colors.textDisabled} />
                </View>
              </View>

              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>Notes</Text>
                <TextInput style={[s.input, s.textarea]} value={assignForm.notes} onChangeText={v => setAssignForm(p => ({ ...p, notes: v }))} placeholder="Optional instructions…" placeholderTextColor={Colors.textDisabled} multiline numberOfLines={2} />
              </View>
            </ScrollView>

            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowAssignModal(false)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, (!selectedRider || !selectedOrder) && s.saveBtnDisabled]} onPress={assign} disabled={assigning || !selectedRider || !selectedOrder}>
                {assigning ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveBtnText}>Assign Rider</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Override / Reassign Modal */}
      <Modal visible={showOverrideModal} transparent animationType="fade" onRequestClose={() => setShowOverrideModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Override Assignment</Text>
              <TouchableOpacity onPress={() => setShowOverrideModal(false)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {overrideAssignment && (
                <View style={s.overrideSummary}>
                  <Text style={s.overrideSummaryLabel}>Reassigning</Text>
                  <Text style={s.overrideSummaryOrderId}>Order #{overrideAssignment.order_id?.slice(-8).toUpperCase()}</Text>
                  <Text style={s.overrideSummaryCurrent}>Current rider: {overrideAssignment.rider?.full_name} ({overrideAssignment.rider?.zone})</Text>
                </View>
              )}

              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>Override Reason *</Text>
                <TouchableOpacity style={s.pickerBtn} onPress={() => setOverrideReasonPicker(p => !p)}>
                  <Text style={[s.pickerValue, !overrideReason && { color: Colors.textDisabled }]}>{overrideReason || 'Select a reason…'}</Text>
                  <ChevronDown size={14} color={Colors.textTertiary} strokeWidth={1.8} />
                </TouchableOpacity>
                {overrideReasonPicker && (
                  <View style={s.pickerDropdown}>
                    {OVERRIDE_REASONS.map(r => (
                      <TouchableOpacity key={r} style={[s.pickerOption, overrideReason === r && s.pickerOptionActive]} onPress={() => { setOverrideReason(r); setOverrideReasonPicker(false); }}>
                        <Text style={[s.pickerOptionText, overrideReason === r && s.pickerOptionTextActive]}>{r}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Smart suggestions for override */}
              {!overrideRider && smartSuggestions.length > 0 && (
                <View style={s.suggSection}>
                  <View style={s.suggHeader}>
                    <Zap size={13} color={Colors.accentDark} strokeWidth={2} />
                    <Text style={s.suggTitle}>Suggested Replacements</Text>
                  </View>
                  {smartSuggestions.filter(sg => sg.rider.id !== overrideAssignment?.rider_id).slice(0, 3).map((s2, i) => (
                    <TouchableOpacity key={s2.rider.id} style={[s.suggCard, i === 0 && s.suggCardTop]} onPress={() => setOverrideRider(s2.rider)} activeOpacity={0.8}>
                      <View style={[s.suggRank, { backgroundColor: i === 0 ? Colors.primary : Colors.neutral[100] }]}>
                        <Text style={[s.suggRankText, { color: i === 0 ? Colors.white : Colors.textTertiary }]}>#{i + 1}</Text>
                      </View>
                      <View style={s.suggInfo}>
                        <Text style={s.suggName}>{s2.rider.full_name}</Text>
                        <Text style={s.suggMeta}>{s2.reason}</Text>
                      </View>
                      <View style={s.suggScore}>
                        <Text style={s.suggScoreVal}>{s2.score}</Text>
                        <Text style={s.suggScoreLabel}>pts</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>New Rider *</Text>
                {overrideRider ? (
                  <TouchableOpacity style={s.selectedRider} onPress={() => setOverrideRider(null)}>
                    <View style={s.selectedRiderAvatar}><Text style={s.selectedRiderAvatarText}>{overrideRider.full_name.charAt(0)}</Text></View>
                    <View style={s.selectedRiderInfo}>
                      <Text style={s.selectedRiderName}>{overrideRider.full_name}</Text>
                      <Text style={s.selectedRiderZone}>{overrideRider.zone} · {overrideRider.vehicle_type}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setOverrideRider(null)}><X size={14} color={Colors.textTertiary} /></TouchableOpacity>
                  </TouchableOpacity>
                ) : (
                  <View>
                    <View style={s.searchWrap}>
                      <Search size={13} color={Colors.textTertiary} strokeWidth={1.8} />
                      <TextInput style={s.searchInput} value={overrideRiderSearch} onChangeText={setOverrideRiderSearch} placeholder="Search replacement rider…" placeholderTextColor={Colors.textDisabled} />
                    </View>
                    <View style={s.riderList}>
                      {overrideFilteredRiders.slice(0, 5).map(r => (
                        <TouchableOpacity key={r.id} style={s.riderListItem} onPress={() => { setOverrideRider(r); setOverrideRiderSearch(''); }}>
                          <View style={s.riderListAvatar}><Text style={s.riderListAvatarText}>{r.full_name.charAt(0)}</Text></View>
                          <View style={s.riderListInfo}>
                            <Text style={s.riderListName}>{r.full_name}</Text>
                            <Text style={s.riderListMeta}>{r.zone} · {activeCountMap.get(r.id) ?? 0} active{leaveSet.has(r.id) ? ' · On Leave' : ''}</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowOverrideModal(false)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, (!overrideRider || !overrideReason) && s.saveBtnDisabled]} onPress={doOverride} disabled={overriding || !overrideRider || !overrideReason}>
                {overriding ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveBtnText}>Reassign</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Status Update Modal */}
      <Modal visible={showStatusModal} transparent animationType="fade" onRequestClose={() => setShowStatusModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Update Status</Text>
              <TouchableOpacity onPress={() => setShowStatusModal(false)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            {selectedAssignment && (
              <View style={s.statusSummary}>
                <Text style={s.statusSummaryRider}>{selectedAssignment.rider?.full_name}</Text>
                <Text style={s.statusSummaryOrder}>Order #{selectedAssignment.order_id.slice(-8).toUpperCase()}</Text>
                <View style={[s.statusBadge, { backgroundColor: ASSIGN_STATUS_CONFIG[selectedAssignment.status]?.bg, alignSelf: 'flex-start', marginTop: 4 }]}>
                  <Text style={[s.statusText, { color: ASSIGN_STATUS_CONFIG[selectedAssignment.status]?.color }]}>{ASSIGN_STATUS_CONFIG[selectedAssignment.status]?.label}</Text>
                </View>
              </View>
            )}
            <Text style={s.fieldLabel}>Move to</Text>
            <View style={s.statusButtons}>
              {STATUS_STEPS.filter(st => STATUS_STEPS.indexOf(st) > STATUS_STEPS.indexOf(selectedAssignment?.status ?? '')).map(st => {
                const cfg = ASSIGN_STATUS_CONFIG[st];
                return (
                  <TouchableOpacity key={st} style={[s.statusActionBtn, { backgroundColor: cfg.bg, borderColor: cfg.color + '40' }]} onPress={() => updateAssignmentStatus(selectedAssignment, st)} disabled={updatingStatus}>
                    {updatingStatus ? <ActivityIndicator size="small" color={cfg.color} /> : <Text style={[s.statusActionText, { color: cfg.color }]}>{cfg.label}</Text>}
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity style={[s.statusActionBtn, { backgroundColor: '#FFEBEE', borderColor: Colors.error + '40' }]} onPress={() => { if (failureReason) { updateAssignmentStatus(selectedAssignment, 'failed'); } }} disabled={updatingStatus || !failureReason}>
                <Text style={[s.statusActionText, { color: Colors.error }]}>Mark Failed</Text>
              </TouchableOpacity>
            </View>
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Failure Reason (required to mark failed)</Text>
              <TextInput style={s.input} value={failureReason} onChangeText={setFailureReason} placeholder="e.g. Customer not available" placeholderTextColor={Colors.textDisabled} />
            </View>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowStatusModal(false)}>
              <Text style={s.cancelBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Bulk Result Modal */}
      <Modal visible={showBulkResult} transparent animationType="fade" onRequestClose={() => setShowBulkResult(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Auto-Assignment Complete</Text>
              <TouchableOpacity onPress={() => setShowBulkResult(false)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <View style={s.bulkResultBody}>
              <View style={[s.bulkResultItem, { backgroundColor: '#E8F5E9' }]}>
                <CheckCircle size={24} color={Colors.success} strokeWidth={1.8} />
                <Text style={[s.bulkResultNum, { color: Colors.success }]}>{bulkResult?.assigned ?? 0}</Text>
                <Text style={[s.bulkResultLabel, { color: Colors.success }]}>Orders Assigned</Text>
              </View>
              {(bulkResult?.failed ?? 0) > 0 && (
                <View style={[s.bulkResultItem, { backgroundColor: '#FFF3E0' }]}>
                  <AlertCircle size={24} color={Colors.warning} strokeWidth={1.8} />
                  <Text style={[s.bulkResultNum, { color: Colors.warning }]}>{bulkResult?.failed}</Text>
                  <Text style={[s.bulkResultLabel, { color: Colors.warning }]}>Need Manual Review</Text>
                </View>
              )}
            </View>
            {(bulkResult?.failed ?? 0) > 0 && (
              <Text style={s.bulkResultNote}>Some orders could not be auto-assigned (no available rider in zone). Please assign them manually.</Text>
            )}
            <TouchableOpacity style={s.saveBtn} onPress={() => setShowBulkResult(false)}>
              <Text style={s.saveBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function EmptyState({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <View style={s.emptyState}>
      {icon}
      <Text style={s.emptyTitle}>{title}</Text>
      {sub && <Text style={s.emptySub}>{sub}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing[3] },
  headerWeb: { paddingHorizontal: Spacing[8], paddingVertical: Spacing[5] },
  backBtn: { padding: Spacing[1] },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  headerIcon: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  titleWeb: { fontSize: Typography.size['2xl'] },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },
  bulkBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1], backgroundColor: Colors.accentDark, paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderRadius: Radius.md },
  bulkBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.white },
  rqBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], backgroundColor: '#FFF3E0', borderBottomWidth: 1, borderBottomColor: '#FFE0B2' },
  rqBannerWeb: { paddingHorizontal: Spacing[8] },
  rqBannerText: { flex: 1, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.warning },
  rqBannerBtn: { paddingHorizontal: Spacing[3], paddingVertical: Spacing[1], borderRadius: Radius.full, backgroundColor: Colors.warning },
  rqBannerBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.white },
  searchRow: { paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchRowWeb: { paddingHorizontal: Spacing[8] },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.neutral[50], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2] },
  searchInput: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, outlineStyle: 'none' } as any,
  tabScroll: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, maxHeight: 48, flexGrow: 0 },
  tabs: { flexDirection: 'row', paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], gap: Spacing[2] },
  tabsWeb: { paddingHorizontal: Spacing[8] },
  tabBtn: { paddingVertical: Spacing[1], paddingHorizontal: Spacing[3], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  tabBtnActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  tabText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  scroll: { flex: 1 },
  content: { padding: Spacing[4], gap: Spacing[3] },
  contentWeb: { padding: Spacing[8], maxWidth: 900, alignSelf: 'center', width: '100%', gap: Spacing[4] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  emptySub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 260 },
  orderCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing[4], gap: Spacing[3], ...Shadow.sm },
  orderCardLeft: {},
  dateBadge: { width: 44, alignItems: 'center', paddingVertical: Spacing[2], borderRadius: Radius.md },
  dateDay: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl },
  dateMonth: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, textTransform: 'uppercase' },
  orderBody: { flex: 1, gap: 3 },
  orderCustomer: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  orderPlan: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  orderAddr: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  orderAddrText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, flex: 1 },
  orderId: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textDisabled },
  assignNowBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1], backgroundColor: Colors.primary, paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderRadius: Radius.md },
  assignNowText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.white },
  activeCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  activeCardWarning: { borderColor: Colors.warning },
  activeCardInner: { flexDirection: 'row', alignItems: 'stretch' },
  warningBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: '#FFF3E0', paddingHorizontal: Spacing[4], paddingVertical: Spacing[2], borderBottomWidth: 1, borderBottomColor: '#FFE0B2' },
  warningBannerText: { flex: 1, fontFamily: Typography.fontFamily.sansMedium, fontSize: 11, color: Colors.warning },
  warningReassignBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  warningReassignText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.warning },
  activeStatusBar: { width: 4 },
  activeBody: { flex: 1, padding: Spacing[4], gap: Spacing[2] },
  activeTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  activeOrderId: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  overrideBtn: { padding: Spacing[1], borderRadius: Radius.sm, backgroundColor: Colors.neutral[100] },
  activeMid: { gap: 4 },
  activeRider: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  activeRiderName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary },
  activeZone: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  activeCustomer: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  activeCustomerName: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  activeFooter: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  activeAddr: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
  activeAddrText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, flex: 1 },
  activeTime: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  nextStatusBtn: { paddingHorizontal: Spacing[3], justifyContent: 'center', alignItems: 'center', gap: 4, borderLeftWidth: 1, borderLeftColor: Colors.border },
  nextStatusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, textAlign: 'center', maxWidth: 60 },
  statusBadge: { paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.full },
  statusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  histCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3], backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing[4], ...Shadow.sm },
  histDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  histBody: { flex: 1, gap: 4 },
  histTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  histOrderId: { flex: 1, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  histMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  histRider: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.primary },
  histSep: { color: Colors.textDisabled },
  histCustomer: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  histTime: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  histFail: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.error },
  histSwap: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.warning },
  histFee: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.success },
  suggSection: { marginBottom: Spacing[3] },
  suggHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1], marginBottom: Spacing[2] },
  suggTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.accentDark },
  suggCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingVertical: Spacing[3], paddingHorizontal: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50], marginBottom: Spacing[2] },
  suggCardTop: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  suggRank: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  suggRankText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xs },
  suggInfo: { flex: 1 },
  suggName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  suggMeta: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },
  suggScore: { alignItems: 'center' },
  suggScoreVal: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.primary },
  suggScoreLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary },
  overrideSummary: { backgroundColor: '#FFF3E0', borderRadius: Radius.lg, padding: Spacing[3], marginBottom: Spacing[2], gap: 3 },
  overrideSummaryLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.warning, textTransform: 'uppercase', letterSpacing: 0.5 },
  overrideSummaryOrderId: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary },
  overrideSummaryCurrent: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: Spacing[4] },
  modal: { width: '100%', maxHeight: '92%', backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[5], gap: Spacing[3] },
  modalWeb: { maxWidth: 540 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  orderSummary: { backgroundColor: Colors.primarySurface, borderRadius: Radius.lg, padding: Spacing[3], gap: 2 },
  orderSummaryLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  orderSummaryId: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary },
  orderSummaryCustomer: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  orderSummaryDate: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  orderSummaryAddr: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  selectedRider: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.md, padding: Spacing[3], backgroundColor: Colors.primarySurface },
  selectedRiderAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  selectedRiderAvatarText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.white },
  selectedRiderInfo: { flex: 1 },
  selectedRiderName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.primary },
  selectedRiderZone: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.primary },
  riderList: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, overflow: 'hidden', marginTop: Spacing[2] },
  riderListItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  riderListAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  riderListAvatarText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary },
  riderListInfo: { flex: 1 },
  riderListName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  riderListMeta: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  assignFormRow: { flexDirection: 'row', gap: Spacing[3] },
  statusSummary: { backgroundColor: Colors.neutral[50], borderRadius: Radius.lg, padding: Spacing[3], gap: 3 },
  statusSummaryRider: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  statusSummaryOrder: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  statusButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2], marginBottom: Spacing[3] },
  statusActionBtn: { paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], borderRadius: Radius.md, borderWidth: 1 },
  statusActionText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm },
  bulkResultBody: { flexDirection: 'row', gap: Spacing[4], justifyContent: 'center' },
  bulkResultItem: { flex: 1, alignItems: 'center', paddingVertical: Spacing[5], borderRadius: Radius.lg, gap: Spacing[2] },
  bulkResultNum: { fontFamily: Typography.fontFamily.bold, fontSize: 32 },
  bulkResultLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm },
  bulkResultNote: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary, textAlign: 'center' },
  fieldGroup: { gap: Spacing[1], marginBottom: Spacing[1] },
  fieldLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary, marginBottom: Spacing[1] },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary, backgroundColor: Colors.neutral[50] },
  textarea: { minHeight: 60, textAlignVertical: 'top' },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], backgroundColor: Colors.neutral[50] },
  pickerValue: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  pickerDropdown: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.white, marginTop: 2, overflow: 'hidden', zIndex: 100 },
  pickerOption: { paddingVertical: Spacing[3], paddingHorizontal: Spacing[4] },
  pickerOptionActive: { backgroundColor: Colors.primarySurface },
  pickerOptionText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  pickerOptionTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  modalFooter: { flexDirection: 'row', gap: Spacing[3] },
  cancelBtn: { flex: 1, paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  saveBtn: { flex: 2, paddingVertical: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: Colors.neutral[300] },
  saveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
});
