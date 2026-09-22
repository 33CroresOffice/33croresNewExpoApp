import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, ActivityIndicator, RefreshControl, Modal, TextInput,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Bike, UserMinus, Square, CheckSquare, ChevronRight, Truck, MapPin, User, RefreshCw, AlertCircle, Filter, ChevronDown, ArrowUp, ArrowDown, ListOrdered } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import { format } from 'date-fns';
import ModuleGuard from '@/components/admin/ModuleGuard';
import { getEffectiveStatus } from '@/utils/subscriptionStatus';

type Tab = 'assigned' | 'unassigned';

interface AssignedOrder {
  assignment_id: string;
  order_id: string;
  status: string;
  subscription_status: string;
  scheduled_date: string;
  rider_name: string;
  rider_mobile: string;
  customer_name: string;
  plan_name: string;
  address_apartment: string;
  address_street: string;
  address_landmark: string;
  address_city: string;
  address_state: string;
  address_pincode: string;
  delivery_sequence: number | null;
  rider_id: string;
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

const SUBSCRIPTION_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  active:    { label: 'Active',    color: '#15803D', bg: '#DCFCE7' },
  paused:    { label: 'Paused',    color: '#B45309', bg: '#FEF3C7' },
  expired:   { label: 'Expired',   color: '#DC2626', bg: '#FEE2E2' },
  pending:   { label: 'Pending',   color: '#D97706', bg: '#FFEDD5' },
  cancelled: { label: 'Cancelled', color: '#6B7280', bg: '#F3F4F6' },
  renewed:       { label: 'Renewed',       color: '#0369A1', bg: '#E0F2FE' },
  scheduled_pause:{ label: 'Pause Scheduled', color: '#7C3AED', bg: '#EDE9FE' },
};

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkUnassigning, setBulkUnassigning] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ success: number; failed: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [assignedRes, unassignedRes] = await Promise.all([
        supabase
          .from('rider_order_assignments')
          .select(`
            id, order_id, status, assigned_at, delivery_sequence, rider_id,
            order:orders(
              id, scheduled_date, status,
              user:profiles(full_name, mobile),
              subscription:subscriptions(status, start_date, end_date, new_end_date, pause_start_date, pause_until, plan:subscription_plans(name), delivery_address:addresses(apartment_name, street, landmark, city, state, pincode))
            ),
            rider:riders!rider_order_assignments_rider_id_fkey(full_name, mobile)
          `)
          .in('status', ['assigned', 'accepted', 'picked_up'])
          .order('assigned_at', { ascending: false }),
        supabase
          .from('orders')
          .select(`
            id, scheduled_date, status,
            user:profiles(full_name, mobile),
            subscription:subscriptions(plan:subscription_plans(name), delivery_address:addresses(apartment_name, street, landmark, city, state, pincode))
          `)
          .eq('status', 'scheduled')
          .order('scheduled_date', { ascending: true }),
      ]);

      if (assignedRes.error) throw new Error(assignedRes.error.message);
      if (unassignedRes.error) throw new Error(unassignedRes.error.message);

      const assigned: AssignedOrder[] = (assignedRes.data ?? []).map((row: any) => ({
        assignment_id: row.id,
        order_id: row.order_id,
        status: row.status,
        delivery_sequence: row.delivery_sequence ?? null,
        rider_id: row.rider_id ?? '',
        subscription_status: row.order?.subscription ? getEffectiveStatus(row.order.subscription) : 'active',
        scheduled_date: row.order?.scheduled_date ?? '',
        rider_name: row.rider?.full_name ?? 'Unknown',
        rider_mobile: row.rider?.mobile ?? '',
        customer_name: row.order?.user?.full_name ?? row.order?.user?.mobile ?? 'Unknown',
        plan_name: row.order?.subscription?.plan?.name ?? '',
        address_apartment: row.order?.subscription?.delivery_address?.apartment_name ?? '',
        address_street: row.order?.subscription?.delivery_address?.street ?? '',
        address_landmark: row.order?.subscription?.delivery_address?.landmark ?? '',
        address_city: row.order?.subscription?.delivery_address?.city ?? '',
        address_state: row.order?.subscription?.delivery_address?.state ?? '',
        address_pincode: row.order?.subscription?.delivery_address?.pincode ?? '',
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

      setAssignedOrders(assigned);
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
    let success = 0;
    let failed = 0;
    const ids = Array.from(selectedIds);
    for (const assignmentId of ids) {
      const { error: updateError } = await supabase
        .from('rider_order_assignments')
        .update({ status: 'reassigned', is_reassigned: true })
        .eq('id', assignmentId);
      if (updateError) {
        failed++;
      } else {
        const order = assignedOrders.find(o => o.assignment_id === assignmentId);
        if (order) {
          await supabase.from('orders').update({ status: 'scheduled' }).eq('id', order.order_id);
        }
        success++;
      }
    }
    setBulkUnassigning(false);
    setShowBulkConfirm(false);
    setBulkResult({ success, failed });
    setSelectedIds(new Set());
    load();
    setTimeout(() => setBulkResult(null), 5000);
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

  const filteredAssignedOrders = useMemo(() => {
    let result = assignedOrders;
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
  }, [assignedOrders, selectedRiderId, subStatusFilter]);

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

  const subStatusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    assignedOrders.forEach((order) => {
      counts[order.subscription_status] = (counts[order.subscription_status] ?? 0) + 1;
    });
    return counts;
  }, [assignedOrders]);

  const selectedCount = selectedIds.size;
  const allSelected = filteredAssignedOrders.length > 0 && filteredAssignedOrders.every((order) => selectedIds.has(order.assignment_id));
  const headerTitle = activeTab === 'assigned' ? 'Assigned Orders' : 'Unassigned Orders';

  const formatFullAddress = (apt: string, street: string, landmark: string, city: string, state: string, pincode: string): string => {
    const parts = [apt, street, landmark, city, state, pincode].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'No address';
  };

  const riderAssignmentSummary = useMemo(() => {
    const counts = new Map<string, number>();
    assignedOrders.forEach((order) => {
      counts.set(order.rider_name, (counts.get(order.rider_name) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [assignedOrders]);

  const renderRiderAssignmentSummary = () => (
    <View style={styles.summaryCard}>
      <View style={styles.summaryHeader}>
        <View style={styles.summaryTitleRow}>
          <Bike size={17} color={Colors.primary} strokeWidth={2} />
          <Text style={styles.summaryTitle}>Rider Assignment Summary</Text>
        </View>
        <Text style={styles.summaryTotal}>{assignedOrders.length} assigned</Text>
      </View>
      <View style={styles.summaryTableHeader}>
        <Text style={styles.summaryColumnLabel}>Rider Name</Text>
        <Text style={styles.summaryColumnLabel}>Count</Text>
      </View>
      {riderAssignmentSummary.length > 0 ? riderAssignmentSummary.map(([riderName, count]) => (
        <View key={riderName} style={styles.summaryRow}>
          <View style={styles.summaryRiderName}>
            <Bike size={13} color={Colors.primary} strokeWidth={2} />
            <Text style={styles.summaryRiderText} numberOfLines={1}>{riderName}</Text>
          </View>
          <View style={styles.summaryCountBadge}>
            <Text style={styles.summaryCountText}>{count}</Text>
          </View>
        </View>
      )) : (
        <Text style={styles.summaryEmpty}>No assigned riders yet.</Text>
      )}
    </View>
  );

  const renderAssignedList = () => {
    if (assignedOrders.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Bike size={36} color={Colors.textDisabled} strokeWidth={1.2} />
          <Text style={styles.emptyTitle}>No assigned orders</Text>
          <Text style={styles.emptySub}>Orders assigned to riders will appear here.</Text>
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
                  <Text style={[styles.filterOptionText, isActive && styles.filterOptionTextActive]}>{cfg.label} ({subStatusCounts[statusKey] ?? 0})</Text>
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

        <View style={styles.bulkActionBar}>
          <TouchableOpacity style={styles.selectToggle} onPress={toggleSelectAll} activeOpacity={0.7}>
            {allSelected ? <CheckSquare size={18} color={Colors.primary} /> : <Square size={18} color={Colors.textTertiary} />}
            <Text style={styles.selectToggleText}>{allSelected ? 'Deselect All' : 'Select All'}</Text>
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
          const cfg = ASSIGN_STATUS_CONFIG[order.status] ?? ASSIGN_STATUS_CONFIG.assigned;
          const subStatusCfg = SUBSCRIPTION_STATUS_CONFIG[order.subscription_status] ?? null;
          const isSelected = selectedIds.has(order.assignment_id);
          return (
            <View key={order.assignment_id} style={[styles.orderCard, isSelected && styles.orderCardSelected]}>
              <TouchableOpacity style={styles.checkbox} onPress={() => toggleSelect(order.assignment_id)} activeOpacity={0.7}>
                {isSelected ? <CheckSquare size={20} color={Colors.primary} /> : <Square size={20} color={Colors.textDisabled} />}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.orderContent}
                onPress={() => router.push({ pathname: '/(admin)/order-detail' as any, params: { id: order.order_id } })}
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
                    <Text style={styles.orderId}>#{order.order_id.slice(-8).toUpperCase()}</Text>
                    <View style={styles.riderPill}>
                      <Bike size={11} color={Colors.primary} strokeWidth={2.2} />
                      <Text style={styles.riderPillText} numberOfLines={1}>{order.rider_name}{order.rider_mobile ? ' · ' + order.rider_mobile : ''}</Text>
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
                <Text style={styles.orderId}>#{order.order_id.slice(-8).toUpperCase()}</Text>
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
              {activeTab === 'assigned'
                ? assignedOrders.length + ' order' + (assignedOrders.length !== 1 ? 's' : '') + ' assigned'
                : unassignedOrders.length + ' order' + (unassignedOrders.length !== 1 ? 's' : '') + ' unassigned'}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => { setRefreshing(true); load(); }} activeOpacity={0.8}>
          <RefreshCw size={14} color={Colors.primary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'assigned' && styles.tabActive]}
          onPress={() => setActiveTab('assigned')}
        >
          <Bike size={15} color={activeTab === 'assigned' ? Colors.primary : Colors.textTertiary} strokeWidth={1.8} />
          <Text style={[styles.tabText, activeTab === 'assigned' && styles.tabTextActive]}>
            Assigned ({assignedOrders.length})
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
        ) : activeTab === 'assigned' ? (
          <View style={[styles.contentColumns, isWeb && styles.contentColumnsWeb]}>
            <View style={styles.orderListColumn}>{renderAssignedList()}</View>
            {renderRiderAssignmentSummary()}
          </View>
        ) : (
          renderUnassignedList()
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
  summaryTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary, flex: 1 },
  summaryTotal: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  summaryTableHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing[2] },
  summaryColumnLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textTertiary },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing[2], paddingVertical: Spacing[2], borderTopWidth: 1, borderTopColor: Colors.neutral[100] },
  summaryRiderName: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flex: 1 },
  summaryRiderText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary, flex: 1 },
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
});
