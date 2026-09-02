import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import ModuleGuard from '@/components/admin/ModuleGuard';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, MapPin, Phone, Bike, User, X, Search, CircleCheck, CreditCard, CalendarDays, CirclePause as PauseCircle, Pencil, History, PackageCheck, Truck, Clock, PackageX, Receipt, RefreshCw, Wallet } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { OrderStatus } from '@/types/database';
import StatusChip from '@/components/ui/StatusChip';
import Button from '@/components/ui/Button';
import DatePickerField from '@/components/ui/DatePickerField';
import { format } from 'date-fns';
import { dedupePauseHistory } from '@/utils/pauseHistory';

const STATUSES: { label: string; value: OrderStatus }[] = [
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Out for Delivery', value: 'out_for_delivery' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Failed', value: 'failed' },
];

const SUB_STATUSES = [
  { value: 'active',   label: 'Active',   color: Colors.success },
  { value: 'paused',   label: 'Paused',   color: '#B45309' },
  { value: 'expired',  label: 'Expired',  color: Colors.error },
  { value: 'pending',  label: 'Pending',  color: Colors.warning },
  { value: 'cancelled',label: 'Cancelled',color: Colors.textSecondary },
];

const ORDER_STATUS_CONFIG = {
  scheduled:        { label: 'Scheduled',        color: Colors.textSecondary, bg: Colors.neutral[100], Icon: Clock },
  out_for_delivery: { label: 'Out for Delivery',  color: '#B45309',            bg: '#FEF3C7',           Icon: Truck },
  delivered:        { label: 'Delivered',          color: Colors.success,       bg: '#D1FAE5',           Icon: PackageCheck },
  failed:           { label: 'Failed',             color: Colors.error,         bg: '#FEE2E2',           Icon: PackageX },
};

const VEHICLE_LABELS: Record<string, string> = {
  bike: 'Bike', scooter: 'Scooter', bicycle: 'Bicycle', foot: 'On Foot',
};
const ASSIGN_STATUS_COLORS: Record<string, string> = {
  assigned: Colors.warning,
  accepted: Colors.primary,
  picked_up: Colors.accent,
  delivered: Colors.success,
  failed: Colors.error,
};

export default function AdminOrderDetailScreen() {
  return (
    <ModuleGuard module="orders">
      <AdminOrderDetailScreenContent />
    </ModuleGuard>
  );
}

function AdminOrderDetailScreenContent() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<any>(null);
  const [assignment, setAssignment] = useState<any>(null);
  const [subOrders, setSubOrders] = useState<any[]>([]);
  const [pauseHistory, setPauseHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showEditModal, setShowEditModal] = useState(false);
  // order fields
  const [editDate, setEditDate] = useState<Date | null>(null);
  const [editStatus, setEditStatus] = useState<OrderStatus>('scheduled');
  const [editNote, setEditNote] = useState('');
  // subscription fields
  const [editSubStartDate, setEditSubStartDate] = useState<Date | null>(null);
  const [editSubEndDate, setEditSubEndDate] = useState<Date | null>(null);
  const [editSubNewEndDate, setEditSubNewEndDate] = useState<Date | null>(null);
  const [editSubStatus, setEditSubStatus] = useState('');
  const [editPauseStartDate, setEditPauseStartDate] = useState<Date | null>(null);
  const [editPauseEndDate, setEditPauseEndDate] = useState<Date | null>(null);
  const [editResumedDate, setEditResumedDate] = useState<Date | null>(null);
  const [editPlanId, setEditPlanId] = useState('');
  const [plans, setPlans] = useState<any[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [riderSearch, setRiderSearch] = useState('');
  const [riders, setRiders] = useState<any[]>([]);
  const [ridersLoading, setRidersLoading] = useState(false);
  const [selectedRider, setSelectedRider] = useState<any>(null);
  const [deliveryFee, setDeliveryFee] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [reassignMode, setReassignMode] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [orderRes, assignRes] = await Promise.all([
        supabase
          .from('orders')
          .select('*, user:profiles(*), subscription:subscriptions(*, plan:subscription_plans(*))')
          .eq('id', id)
          .maybeSingle(),
        supabase
          .from('rider_order_assignments')
          .select('id, order_id, rider_id, status, delivery_fee, notes, assigned_at')
          .eq('order_id', id)
          .neq('status', 'reassigned')
          .order('assigned_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (orderRes.data) {
        const sub = orderRes.data.subscription;
        const userId = orderRes.data.user_id;
        let deliveryAddress = null;
        let payments: any[] = [];
        let allSubOrders: any[] = [];

        const fetchList: Promise<any>[] = [
          sub?.delivery_address_id
            ? supabase.from('addresses').select('id, street, city, state, pincode, label, apartment_name, landmark, locality_id').eq('id', sub.delivery_address_id).maybeSingle()
            : userId
              ? supabase.from('addresses').select('id, street, city, state, pincode, label, apartment_name, landmark, locality_id').eq('user_id', userId).order('is_default', { ascending: false }).limit(1).maybeSingle()
              : Promise.resolve({ data: null }),
          sub?.id
            ? supabase.from('payments').select('id, amount, status, created_at, payment_mode').eq('subscription_id', sub.id).order('created_at', { ascending: false })
            : Promise.resolve({ data: [] }),
          sub?.id
            ? supabase.from('orders').select('id, scheduled_date, status, delivered_at, admin_note').eq('subscription_id', sub.id).order('scheduled_date', { ascending: false })
            : Promise.resolve({ data: [] }),
          sub?.id
            ? supabase.from('subscription_pause_history').select('id, pause_start_date, pause_until, resumed_at, is_cancelled').eq('subscription_id', sub.id).order('pause_start_date', { ascending: false })
            : Promise.resolve({ data: [] }),
        ];

        const [addrRes, paymentsRes, subOrdersRes, pauseHistoryRes] = await Promise.all(fetchList);
        deliveryAddress = addrRes.data ?? null;
        payments = paymentsRes.data ?? [];
        allSubOrders = subOrdersRes.data ?? [];

        setOrder({
          ...orderRes.data,
          subscription: sub ? { ...sub, delivery_address: deliveryAddress, payments } : sub,
        });
        setSubOrders(allSubOrders);
        setPauseHistory(dedupePauseHistory(pauseHistoryRes.data ?? []));
      }

      const rawAssign = assignRes.data ?? null;
      if (rawAssign?.rider_id) {
        const { data: riderData } = await supabase
          .from('riders')
          .select('id, full_name, mobile, zone, vehicle_type')
          .eq('id', rawAssign.rider_id)
          .maybeSingle();
        setAssignment({ ...rawAssign, rider: riderData ?? null });
      } else {
        setAssignment(rawAssign);
      }
    } catch (e) {
      console.error('order-detail load error', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!showAssignModal) return;
    setRidersLoading(true);
    const query = riderSearch.trim();
    let req = supabase
      .from('riders')
      .select('id, full_name, mobile, zone, vehicle_type')
      .eq('is_active', true)
      .order('full_name')
      .limit(50);
    if (query) {
      req = req.or(`full_name.ilike.%${query}%,mobile.ilike.%${query}%,zone.ilike.%${query}%`);
    }
    req.then(({ data, error }) => {
      setRiders(error ? [] : (data ?? []));
      setRidersLoading(false);
    });
  }, [riderSearch, showAssignModal]);

const handleAssign = async () => {
    if (!selectedRider) return;
    setAssigning(true);
    const fee = deliveryFee ? parseFloat(deliveryFee) : 0;
    const notes = assignNotes.trim() || '';

    if (reassignMode && assignment?.id) {
      const { error: updateErr } = await supabase
        .from('rider_order_assignments')
        .update({ status: 'reassigned', is_reassigned: true })
        .eq('id', assignment.id);
      if (updateErr) {
        setAssigning(false);
        return;
      }
    }

    const { error: assignErr } = await supabase.from('rider_order_assignments').insert({
      order_id: id,
      rider_id: selectedRider.id,
      status: 'assigned',
      delivery_fee: fee,
      notes,
      is_reassigned: reassignMode,
      swapped_from_rider_id: reassignMode ? assignment?.rider_id ?? null : null,
    });
    if (assignErr) {
      setAssigning(false);
      return;
    }
    await supabase.from('orders').update({ status: 'out_for_delivery' }).eq('id', id);
    setAssigning(false);
    setShowAssignModal(false);
    setSelectedRider(null);
    setDeliveryFee('');
    setAssignNotes('');
    setReassignMode(false);
    load();
  };

  const toDateObj = (s: string | null | undefined): Date | null => {
    if (!s) return null;
    try {
      // Always extract YYYY-MM-DD and construct as local midnight to avoid timezone shift
      const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      }
      return null;
    } catch { return null; }
  };
  const toISODate = (d: Date | null | undefined): string | null => {
    if (!d) return null;
    return format(d, 'yyyy-MM-dd');
  };

  const openEditModal = async () => {
    const sub = order.subscription;
    setEditDate(toDateObj(order.scheduled_date));
    setEditStatus(order.status as OrderStatus);
    setEditNote(order.admin_note ?? '');
    setEditSubStartDate(toDateObj(sub?.start_date));
    setEditSubEndDate(toDateObj(sub?.end_date));
    setEditSubNewEndDate(toDateObj(sub?.new_end_date ?? sub?.end_date));
    setEditSubStatus(sub?.status ?? 'active');
    setEditPauseStartDate(toDateObj(sub?.pause_start_date));
    setEditPauseEndDate(toDateObj(sub?.pause_until));
    setEditResumedDate(null);
    setEditPlanId(sub?.plan_id ?? '');
    setSaveError('');

    setPlansLoading(true);
    const { data } = await supabase
      .from('subscription_plans')
      .select('id, name, price, mrp_price, frequency')
      .eq('is_active', true)
      .order('price');
    setPlans(data ?? []);
    setPlansLoading(false);
    setShowEditModal(true);
  };

  // Live-compute the adjusted New End Date for display.
  // Original end_date is never changed; new_end_date = end_date + active pause days.
  const computedNewEndDate = (): Date | null => {
    const sub = order.subscription;
    if (!sub?.end_date) return null;
    const originalEnd = new Date(sub.end_date);
    let totalPausedDays = 0;

    if (editSubStatus === 'paused' && editPauseStartDate && editPauseEndDate) {
      const days = Math.round((editPauseEndDate.getTime() - editPauseStartDate.getTime()) / 86400000) + 1;
      if (days > 0) totalPausedDays += days;
    } else if (editSubStatus === 'active' && editResumedDate && sub.status === 'paused') {
      const pStart = toDateObj(sub.pause_start_date);
      const pEnd = toDateObj(sub.pause_until);
      if (pStart && pEnd) {
        const fullDays = Math.round((pEnd.getTime() - pStart.getTime()) / 86400000) + 1;
        const savedDays = Math.max(0, Math.round((pEnd.getTime() - editResumedDate.getTime()) / 86400000));
        const actualDays = fullDays - savedDays;
        if (actualDays > 0) totalPausedDays += actualDays;
      }
    }

    const result = new Date(originalEnd);
    result.setDate(result.getDate() + totalPausedDays);
    return totalPausedDays > 0 ? result : originalEnd;
  };

  const handleSaveEdit = async () => {
    if (!editDate) { setSaveError('Scheduled date is required.'); return; }
    setSaving(true);
    setSaveError('');

    // 1. Save order
    const { error: orderErr } = await supabase.from('orders').update({
      scheduled_date: toISODate(editDate),
      status: editStatus,
      admin_note: editNote.trim() || null,
      delivered_at: editStatus === 'delivered' ? (order.delivered_at ?? new Date().toISOString()) : null,
    }).eq('id', id);
    if (orderErr) { setSaving(false); setSaveError(orderErr.message); return; }

    // 2. Save subscription
    const sub = order.subscription;
    if (sub?.id) {
      let pauseUntil: string | null = null;
      let pauseStartDate: string | null = null;
      let newSubStatus = editSubStatus;

      if (editSubStatus === 'paused' && editPauseStartDate && editPauseEndDate) {
        pauseStartDate = toISODate(editPauseStartDate);
        pauseUntil = toISODate(editPauseEndDate);
      } else if (editSubStatus === 'active' && editResumedDate && sub.status === 'paused') {
        newSubStatus = 'active';
      }

      const subUpdate: Record<string, any> = {
        status: newSubStatus,
        pause_start_date: pauseStartDate,
        pause_until: pauseUntil,
        new_end_date: toISODate(editSubNewEndDate),
      };
      if (editPlanId && editPlanId !== sub.plan_id) subUpdate.plan_id = editPlanId;

      const { error: subErr } = await supabase.from('subscriptions').update(subUpdate).eq('id', sub.id);
      if (subErr) { setSaving(false); setSaveError('Subscription: ' + subErr.message); return; }

      // Log resume in history (set resumed_at)
      if (editSubStatus === 'active' && sub.status === 'paused') {
        const { error: pauseUpdateErr } = await supabase
          .from('subscription_pause_history')
          .update({ resumed_at: toISODate(editResumedDate ?? new Date() as Date) })
          .eq('subscription_id', sub.id)
          .is('resumed_at', null);
        if (pauseUpdateErr) { setSaving(false); setSaveError('Resume history: ' + pauseUpdateErr.message); return; }
      }
    }

    setSaving(false);
    setShowEditModal(false);
    load();
  };

  const formatDate = (d: string | null | undefined) => d ? format(new Date(d), 'dd MMM yyyy') : null;

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Order Details</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.centerBox}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Order Details</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>Order not found</Text>
        </View>
      </View>
    );
  }

  const sub = order.subscription;
  const rider = assignment?.rider;
  const latestPayment = sub?.payments?.length
    ? sub.payments[0]
    : null;
  const isPaused = sub?.status === 'paused';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Order Details</Text>
        <TouchableOpacity style={styles.editHeaderBtn} onPress={openEditModal} activeOpacity={0.8}>
          <Pencil size={15} color={Colors.primary} strokeWidth={2} />
          <Text style={styles.editHeaderBtnText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <View>
              <Text style={styles.orderId}>#{order.id.slice(0, 8).toUpperCase()}</Text>
              <Text style={styles.orderDate}>{format(new Date(order.scheduled_date), 'EEEE, dd MMMM yyyy')}</Text>
            </View>
            <StatusChip status={order.status} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Customer</Text>
          <View style={styles.infoRow}>
            <Phone size={16} color={Colors.primary} />
            <View>
              <Text style={styles.infoValue}>{order.user?.full_name ?? 'Unknown'}</Text>
              <Text style={styles.infoSub}>+91 {order.user?.mobile}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Delivery Details</Text>
          <View style={styles.infoRow}>
            <MapPin size={16} color={Colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Delivery Address</Text>
              <Text style={styles.infoValue}>
                {sub?.delivery_address
                  ? [sub.delivery_address.apartment_name, sub.delivery_address.landmark, sub.delivery_address.street, sub.delivery_address.city, sub.delivery_address.state].filter(Boolean).join(', ') + (sub.delivery_address.pincode ? ` - ${sub.delivery_address.pincode}` : '')
                  : 'Not available'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Order & Subscription Summary ── */}
        {sub && (
          <View style={styles.card}>
            <View style={styles.summaryHeader}>
              <Text style={styles.cardTitle}>Order & Subscription Summary</Text>
              <TouchableOpacity
                style={styles.copyIdBtn}
                onPress={() => {/* copy handled below */}}
                onLongPress={() => {}}
                activeOpacity={0.7}
              >
              </TouchableOpacity>
            </View>

            <View style={styles.summaryTable}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Order ID</Text>
                <Text style={styles.summaryValue} numberOfLines={1}>ORD-{order.id.toUpperCase()}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Product</Text>
                <Text style={styles.summaryValue} numberOfLines={1}>{sub.plan?.name ?? '—'}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Price</Text>
                <Text style={styles.summaryValueBold}>
                  {sub.plan?.price != null
                    ? `₹ ${(Number(sub.plan.price) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                    : latestPayment
                    ? `₹ ${(latestPayment.amount / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                    : '—'}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Start Date</Text>
                <Text style={styles.summaryValue}>{sub.start_date ? format(new Date(sub.start_date), 'dd MMM, yyyy') : '—'}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>End Date</Text>
                <Text style={styles.summaryValue}>
                  {sub.end_date
                    ? format(new Date(sub.end_date), 'dd MMM, yyyy')
                    : sub.start_date
                    ? format(new Date(new Date(sub.start_date).getTime() + 29 * 86400000), 'dd MMM, yyyy')
                    : '—'}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>New End Date</Text>
                <Text style={styles.summaryValue}>{sub.new_end_date ? format(new Date(sub.new_end_date), 'dd MMM, yyyy') : '—'}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Status</Text>
                <StatusChip status={isPaused ? 'paused' : ((sub.new_end_date ?? sub.end_date) && (sub.new_end_date ?? sub.end_date) < new Date().toISOString().split('T')[0]) ? 'expired' : sub.status} />
              </View>
              {isPaused && (
                <>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Paused Until</Text>
                    <Text style={[styles.summaryValue, { color: Colors.warning }]}>
                      {sub.pause_until ? format(new Date(sub.pause_until), 'dd MMM, yyyy') : '—'}
                    </Text>
                  </View>
                </>
              )}
              {latestPayment && (
                <>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Last Payment</Text>
                    <View style={styles.summaryPayBadge}>
                      <View style={[styles.summaryPayDot, {
                        backgroundColor: latestPayment.status === 'captured' ? Colors.success : latestPayment.status === 'failed' ? Colors.error : Colors.warning,
                      }]} />
                      <Text style={[styles.summaryPayText, {
                        color: latestPayment.status === 'captured' ? Colors.success : latestPayment.status === 'failed' ? Colors.error : Colors.warning,
                      }]}>
                        {latestPayment.status.charAt(0).toUpperCase() + latestPayment.status.slice(1)}
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          </View>
        )}

        {/* ── Pause History ── */}
        {sub && (
          <View style={styles.card}>
            <View style={styles.cardTitleWithIcon}>
              <PauseCircle size={15} color='#B45309' />
              <Text style={styles.cardTitle}>Pause History</Text>
            </View>
            {pauseHistory.length === 0 ? (
              <View style={styles.pauseEmpty}>
                <Text style={styles.pauseEmptyText}>No pause history found</Text>
              </View>
            ) : (
              pauseHistory.map((ph: any, i: number) => {
                const fromDate = ph.pause_start_date ? new Date(ph.pause_start_date) : null;
                const toDate = ph.pause_until ? new Date(ph.pause_until) : null;
                const totalDays = fromDate && toDate
                  ? Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1
                  : null;
                const isCancelled = Boolean(ph.is_cancelled);
                const newEndDate = !isCancelled && sub?.end_date && fromDate && toDate
                  ? (() => { const d = new Date(sub.end_date); d.setDate(d.getDate() + (totalDays ?? 0)); return d; })()
                  : null;
                return (
                  <View key={ph.id} style={[styles.pauseRow, i < pauseHistory.length - 1 && styles.pauseRowBorder, isCancelled && styles.pauseRowCancelled]}>
                    <View style={styles.pauseIconWrap}>
                      <PauseCircle size={18} color={isCancelled ? Colors.neutral[300] : '#B45309'} />
                    </View>
                    <View style={{ flex: 1, gap: 6 }}>
                      <View style={styles.pauseDateRow}>
                        <View style={styles.pauseDateBlock}>
                          <Text style={styles.pauseDateLabel}>FROM</Text>
                          <Text style={[styles.pauseDateValue, isCancelled && styles.pauseDateValueCancelled]}>{fromDate ? format(fromDate, 'dd MMM yyyy') : '—'}</Text>
                        </View>
                        <View style={styles.pauseArrow}>
                          <Text style={styles.pauseArrowText}>→</Text>
                        </View>
                        <View style={styles.pauseDateBlock}>
                          <Text style={styles.pauseDateLabel}>TO</Text>
                          <Text style={[styles.pauseDateValue, isCancelled && styles.pauseDateValueCancelled]}>{toDate ? format(toDate, 'dd MMM yyyy') : '—'}</Text>
                        </View>
                        {isCancelled && (
                          <View style={styles.pauseCancelledBadge}>
                            <X size={10} color={Colors.error} strokeWidth={3} />
                            <Text style={styles.pauseCancelledBadgeText}>Cancelled</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.pauseMetaRow}>
                        <View style={styles.pauseMetaChip}>
                          <Text style={styles.pauseMetaLabel}>{isCancelled ? 'Planned Days' : 'Total Days Paused'}</Text>
                          <Text style={styles.pauseMetaValue}>{totalDays != null ? `${totalDays} day${totalDays !== 1 ? 's' : ''}` : '—'}</Text>
                        </View>
                        {!isCancelled && (
                          <View style={[styles.pauseMetaChip, { backgroundColor: '#D1FAE5' }]}>
                            <Text style={[styles.pauseMetaLabel, { color: Colors.success }]}>New End Date</Text>
                            <Text style={[styles.pauseMetaValue, { color: Colors.success }]}>{newEndDate ? format(newEndDate, 'dd MMM yyyy') : '—'}</Text>
                          </View>
                        )}
                      </View>
                      {ph.resumed_at && (
                        <Text style={styles.pauseResumedText}>Resumed on {format(new Date(ph.resumed_at), 'dd MMM yyyy')}</Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>Rider Assignment</Text>
            {!assignment || assignment.status === 'delivered' || assignment.status === 'failed' ? (
              <TouchableOpacity
                style={styles.assignBtn}
                onPress={() => { setReassignMode(false); setShowAssignModal(true); }}
              >
                <Bike size={13} color={Colors.primary} />
                <Text style={styles.assignBtnText}>Assign Rider</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.assignBtn}
                onPress={() => { setReassignMode(true); setShowAssignModal(true); }}
              >
                <RefreshCw size={13} color={Colors.primary} />
                <Text style={styles.assignBtnText}>Reassign</Text>
              </TouchableOpacity>
            )}
          </View>

          {rider ? (
            <View style={styles.riderCard}>
              <View style={[styles.assignStatusBar, { backgroundColor: ASSIGN_STATUS_COLORS[assignment.status] ?? Colors.border }]} />
              <View style={styles.riderInfo}>
                <View style={styles.riderAvatar}>
                  <User size={18} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.riderNameRow}>
                    <Text style={styles.riderName}>{rider.full_name}</Text>
                  </View>
                  <Text style={styles.riderMeta}>+91 {rider.mobile} · {rider.zone} · {VEHICLE_LABELS[rider.vehicle_type] ?? rider.vehicle_type}</Text>
                </View>
                <View style={styles.riderStatusPill}>
                  <Text style={[styles.riderStatusText, { color: ASSIGN_STATUS_COLORS[assignment.status] ?? Colors.textSecondary }]}>
                    {assignment.status.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                  </Text>
                </View>
              </View>
              {assignment.delivery_fee ? (
                <View style={styles.riderFeeRow}>
                  <Text style={styles.riderFeeLabel}>Delivery Fee</Text>
                  <Text style={styles.riderFeeValue}>₹{assignment.delivery_fee}</Text>
                </View>
              ) : null}
              <View style={styles.riderActionsRow}>
                <TouchableOpacity
                  style={styles.viewRiderBtn}
                  onPress={() => router.push({ pathname: '/(admin)/rider-detail', params: { id: rider.id, name: rider.full_name } } as any)}
                >
                  <Text style={styles.viewRiderBtnText}>View Rider Profile</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.reassignBtn}
                  onPress={() => { setReassignMode(true); setShowAssignModal(true); }}
                >
                  <RefreshCw size={13} color={Colors.primary} />
                  <Text style={styles.reassignBtnText}>Reassign</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.noRiderBox}>
              <Bike size={24} color={Colors.textTertiary} />
              <Text style={styles.noRiderText}>No rider assigned yet</Text>
              <Text style={styles.noRiderSub}>Tap "Assign Rider" to assign a delivery rider</Text>
            </View>
          )}
        </View>


        {/* ── Subscription Order History ── */}
        {subOrders.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <View style={styles.cardTitleWithIcon}>
                <History size={15} color={Colors.primary} />
                <Text style={styles.cardTitle}>Delivery History</Text>
              </View>
              <Text style={styles.historyCount}>{subOrders.length} deliveries</Text>
            </View>
            {subOrders.map((o, i) => {
              const isCurrentOrder = o.id === id;
              const statusConfig = ORDER_STATUS_CONFIG[o.status as keyof typeof ORDER_STATUS_CONFIG] ?? ORDER_STATUS_CONFIG.scheduled;
              return (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.historyRow, isCurrentOrder && styles.historyRowCurrent, i < subOrders.length - 1 && styles.historyRowBorder]}
                  onPress={() => !isCurrentOrder && router.replace({ pathname: '/(admin)/order-detail', params: { id: o.id } })}
                  activeOpacity={isCurrentOrder ? 1 : 0.7}
                >
                  <View style={[styles.historyDot, { backgroundColor: statusConfig.color }]} />
                  <View style={styles.historyBody}>
                    <Text style={[styles.historyDate, isCurrentOrder && styles.historyDateCurrent]}>
                      {format(new Date(o.scheduled_date), 'EEE, dd MMM yyyy')}
                      {isCurrentOrder ? '  (this order)' : ''}
                    </Text>
                    {o.admin_note ? <Text style={styles.historyNote}>{o.admin_note}</Text> : null}
                  </View>
                  <View style={[styles.historyStatusPill, { backgroundColor: statusConfig.bg }]}>
                    <statusConfig.Icon size={11} color={statusConfig.color} strokeWidth={2.5} />
                    <Text style={[styles.historyStatusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Payment History ── */}
        {sub?.payments?.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardTitleWithIcon}>
              <Receipt size={15} color={Colors.primary} />
              <Text style={styles.cardTitle}>Payment History</Text>
            </View>
            {(sub.payments as any[]).map((p: any, i: number) => {
              const isCapture = p.status === 'captured';
              const isFailed = p.status === 'failed';
              const payColor = isCapture ? Colors.success : isFailed ? Colors.error : Colors.warning;
              return (
                <View key={p.id} style={[styles.payHistoryRow, i < sub.payments.length - 1 && styles.historyRowBorder]}>
                  <View style={[styles.payDot, { backgroundColor: payColor }]} />
                  <View style={styles.historyBody}>
                    <Text style={styles.historyDate}>{format(new Date(p.created_at), 'dd MMM yyyy · h:mm a')}</Text>
                    {p.payment_mode ? (
                      <View style={styles.payModeChip}>
                        <Wallet size={10} color={Colors.primary} strokeWidth={2.5} />
                        <Text style={styles.payModeText}>
                          {p.payment_mode.charAt(0).toUpperCase() + p.payment_mode.slice(1)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text style={[styles.payAmount, { color: payColor }]}>
                      ₹{(p.amount / 100).toLocaleString('en-IN')}
                    </Text>
                    <Text style={styles.payStatus}>
                      {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Edit Order & Subscription Modal ── */}
      <Modal visible={showEditModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEditModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Order & Subscription</Text>
            <TouchableOpacity onPress={() => setShowEditModal(false)} style={styles.modalClose}>
              <X size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.editContent} keyboardShouldPersistTaps="handled">

            {/* ─ Order Details ─ */}
            <View style={styles.editSection}>
              <Text style={styles.editSectionTitle}>Order Details</Text>

              <DatePickerField
                label="Scheduled Date"
                value={editDate}
                onChange={setEditDate}
              />

              <View style={styles.editField}>
                <Text style={styles.editLabel}>Delivery Status</Text>
                <View style={styles.statusPills}>
                  {STATUSES.map((s) => (
                    <TouchableOpacity
                      key={s.value}
                      style={[styles.statusPill, editStatus === s.value && styles.statusPillActive]}
                      onPress={() => setEditStatus(s.value)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.statusPillText, editStatus === s.value && styles.statusPillTextActive]}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.editField}>
                <Text style={styles.editLabel}>Admin Note</Text>
                <TextInput
                  style={[styles.editInput, styles.editTextarea]}
                  value={editNote}
                  onChangeText={setEditNote}
                  placeholder="Internal note (optional)..."
                  placeholderTextColor={Colors.textTertiary}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>

            {/* ─ Subscription Details ─ */}
            {order.subscription && (
              <View style={styles.editSection}>
                <Text style={styles.editSectionTitle}>Subscription Details</Text>

                {/* Plan selector */}
                <View style={styles.editField}>
                  <Text style={styles.editLabel}>Product / Plan</Text>
                  {plansLoading ? (
                    <ActivityIndicator color={Colors.primary} style={{ marginTop: 8 }} />
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.planScroll}>
                      {plans.map((p) => {
                        const selected = editPlanId === p.id;
                        return (
                          <TouchableOpacity
                            key={p.id}
                            style={[styles.planCard, selected && styles.planCardSelected]}
                            onPress={() => setEditPlanId(p.id)}
                            activeOpacity={0.8}
                          >
                            <Text style={[styles.planCardName, selected && styles.planCardNameSelected]} numberOfLines={2}>{p.name}</Text>
                            <Text style={[styles.planCardPrice, selected && styles.planCardPriceSelected]}>₹{(Number(p.price) / 100).toLocaleString('en-IN')}</Text>
                            <Text style={[styles.planCardFreq, selected && { color: Colors.primary }]}>{p.frequency}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>

                {/* Start & End Date — read-only, permanently fixed at creation */}
                <View style={styles.readOnlyDateRow}>
                  <Text style={styles.readOnlyDateLabel}>Start Date</Text>
                  <Text style={styles.readOnlyDateValue}>
                    {editSubStartDate ? format(editSubStartDate, 'dd MMM yyyy') : '—'}
                  </Text>
                </View>
                <View style={styles.readOnlyDateRow}>
                  <Text style={styles.readOnlyDateLabel}>End Date</Text>
                  <Text style={styles.readOnlyDateValue}>
                    {editSubEndDate ? format(editSubEndDate, 'dd MMM yyyy') : '—'}
                  </Text>
                </View>
                <DatePickerField
                  label="New End Date"
                  value={editSubNewEndDate}
                  onChange={setEditSubNewEndDate}
                />

                {/* Subscription Status */}
                <View style={styles.editField}>
                  <Text style={styles.editLabel}>Subscription Status</Text>
                  <View style={styles.statusPills}>
                    {SUB_STATUSES.map((s) => (
                      <TouchableOpacity
                        key={s.value}
                        style={[styles.statusPill, editSubStatus === s.value && styles.statusPillActive, { borderColor: editSubStatus === s.value ? s.color : Colors.border }]}
                        onPress={() => {
                          setEditSubStatus(s.value);
                          if (s.value !== 'paused') { setEditPauseStartDate(null); setEditPauseEndDate(null); }
                          if (s.value !== 'active') setEditResumedDate(null);
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.subStatusDot, { backgroundColor: editSubStatus === s.value ? '#fff' : s.color }]} />
                        <Text style={[styles.statusPillText, editSubStatus === s.value && styles.statusPillTextActive]}>
                          {s.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Pause fields */}
                {editSubStatus === 'paused' && (
                  <View style={styles.editInfoBox}>
                    <View style={styles.editInfoBoxHeader}>
                      <PauseCircle size={14} color={Colors.warning} />
                      <Text style={styles.editInfoBoxTitle}>Pause Details</Text>
                    </View>
                    <Text style={styles.editInfoBoxHint}>
                      The New End Date will be automatically extended by the pause duration. The original End Date stays unchanged.
                    </Text>
                    <DatePickerField
                      label="Pause From"
                      value={editPauseStartDate}
                      onChange={setEditPauseStartDate}
                    />
                    <DatePickerField
                      label="Pause Until"
                      value={editPauseEndDate}
                      onChange={setEditPauseEndDate}
                    />
                    {editPauseStartDate && editPauseEndDate && (() => {
                      const days = Math.round((editPauseEndDate.getTime() - editPauseStartDate.getTime()) / 86400000) + 1;
                      const newEnd = computedNewEndDate();
                      if (days > 0 && newEnd) return (
                        <Text style={styles.editCalcNote}>
                          Pause: {days} day{days !== 1 ? 's' : ''} — New End Date extends to {format(newEnd, 'dd MMM yyyy')}
                        </Text>
                      );
                      return null;
                    })()}
                  </View>
                )}

                {/* Resume fields */}
                {editSubStatus === 'active' && order.subscription?.status === 'paused' && (
                  <View style={[styles.editInfoBox, { borderColor: Colors.success + '40' }]}>
                    <View style={styles.editInfoBoxHeader}>
                      <CalendarDays size={14} color={Colors.success} />
                      <Text style={[styles.editInfoBoxTitle, { color: Colors.success }]}>Resume Subscription</Text>
                    </View>
                    <Text style={styles.editInfoBoxHint}>
                      Unused pause days will be deducted from the New End Date if resuming early. The original End Date stays unchanged.
                    </Text>
                    <DatePickerField
                      label="Resumed Date (optional)"
                      value={editResumedDate}
                      onChange={setEditResumedDate}
                    />
                    {editResumedDate && order.subscription?.pause_until && (() => {
                      const pEnd = toDateObj(order.subscription.pause_until);
                      if (!pEnd) return null;
                      const saved = Math.max(0, Math.round((pEnd.getTime() - editResumedDate.getTime()) / 86400000));
                      const newEnd = computedNewEndDate();
                      if (saved > 0 && newEnd) return (
                        <Text style={[styles.editCalcNote, { color: Colors.success }]}>
                          Resuming {saved} day{saved !== 1 ? 's' : ''} early — New End Date adjusted to {format(newEnd, 'dd MMM yyyy')}
                        </Text>
                      );
                      return null;
                    })()}
                  </View>
                )}
              </View>
            )}

            {saveError ? (
              <View style={styles.saveErrorBanner}>
                <Text style={styles.saveErrorText}>{saveError}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.modalFooter}>
            <Button
              label={saving ? 'Saving...' : 'Save Changes'}
              onPress={handleSaveEdit}
              disabled={saving}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={showAssignModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAssignModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{reassignMode ? 'Reassign Rider' : 'Assign Rider'}</Text>
            <TouchableOpacity onPress={() => { setShowAssignModal(false); setSelectedRider(null); setReassignMode(false); }} style={styles.modalClose}>
              <X size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalOrderSummary}>
            <Text style={styles.modalOrderId}>Order #{order.id.slice(0, 8).toUpperCase()}</Text>
            <Text style={styles.modalOrderDate}>{format(new Date(order.scheduled_date), 'dd MMM yyyy')}</Text>
            {reassignMode && rider && (
              <View style={styles.reassignNotice}>
                <Text style={styles.reassignNoticeText}>
                  Current rider: {rider.full_name} — will be marked as reassigned
                </Text>
              </View>
            )}
            {sub?.delivery_address && (
              <View style={styles.modalAddressRow}>
                <MapPin size={13} color={Colors.textTertiary} />
                <Text style={styles.modalAddress} numberOfLines={1}>
                  {[sub.delivery_address.apartment_name, sub.delivery_address.landmark, sub.delivery_address.street, sub.delivery_address.city].filter(Boolean).join(', ')}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.modalSearchRow}>
            <Search size={16} color={Colors.textTertiary} />
            <TextInput
              style={styles.modalSearchInput}
              placeholder="Search riders by name, mobile, zone..."
              placeholderTextColor={Colors.textTertiary}
              value={riderSearch}
              onChangeText={setRiderSearch}
            />
          </View>

          {ridersLoading ? (
            <ActivityIndicator style={{ marginTop: Spacing[4] }} color={Colors.primary} />
          ) : (
            <FlatList
              data={riders}
              keyExtractor={(item) => item.id}
              style={styles.riderList}
              renderItem={({ item }) => {
                const isSelected = selectedRider?.id === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.riderListItem, isSelected && styles.riderListItemSelected]}
                    onPress={() => setSelectedRider(isSelected ? null : item)}
                  >
                    <View style={styles.riderListAvatar}>
                      <User size={16} color={isSelected ? Colors.primary : Colors.textSecondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.riderNameRow}>
                        <Text style={[styles.riderListName, isSelected && { color: Colors.primary }]}>{item.full_name}</Text>
                      </View>
                      <Text style={styles.riderListMeta}>{item.zone} · {VEHICLE_LABELS[item.vehicle_type] ?? item.vehicle_type}</Text>
                    </View>
                    {isSelected && <CircleCheck size={18} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={styles.emptyText}>No active riders found</Text>}
            />
          )}

          {selectedRider && (
            <View style={styles.modalFeeRow}>
              <TextInput
                style={[styles.modalInput, { flex: 1 }]}
                placeholder="Delivery fee (₹)"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="numeric"
                value={deliveryFee}
                onChangeText={setDeliveryFee}
              />
              <TextInput
                style={[styles.modalInput, { flex: 2 }]}
                placeholder="Notes (optional)"
                placeholderTextColor={Colors.textTertiary}
                value={assignNotes}
                onChangeText={setAssignNotes}
              />
            </View>
          )}

          <View style={styles.modalFooter}>
            <Button
              label={assigning ? (reassignMode ? 'Reassigning...' : 'Assigning...') : `${reassignMode ? 'Reassign' : 'Assign'} ${selectedRider ? selectedRider.full_name : 'Rider'}`}
              onPress={handleAssign}
              disabled={!selectedRider || assigning}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textTertiary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  backBtn: { padding: Spacing[1] },
  editHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing[3],
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  editHeaderBtnText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.primary,
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    color: Colors.textPrimary,
  },
  content: { padding: Spacing[5], gap: Spacing[4] },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  orderId: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  orderDate: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  infoRow: {
    flexDirection: 'row',
    gap: Spacing[3],
    alignItems: 'flex-start',
    paddingTop: Spacing[2],
  },
  infoDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingTop: Spacing[3],
    marginTop: Spacing[1],
  },
  infoLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 10,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  infoSub: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    flexWrap: 'wrap',
  },
  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1],
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  assignBtnText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.primary,
  },
  riderCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  assignStatusBar: { height: 4 },
  riderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    padding: Spacing[3],
  },
  riderAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  riderName: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  riderMeta: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  riderStatusPill: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceHover,
  },
  riderStatusText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: 11,
  },
  riderFeeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[3],
    paddingBottom: Spacing[3],
  },
  riderFeeLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  riderFeeValue: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  riderActionsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  viewRiderBtn: {
    flex: 1,
    padding: Spacing[3],
    alignItems: 'center',
  },
  reassignBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[1],
    padding: Spacing[3],
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
  },
  reassignBtnText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.primary,
  },
  reassignNotice: {
    backgroundColor: '#FEF3C7',
    borderRadius: Radius.sm,
    padding: Spacing[2],
    marginTop: Spacing[2],
  },
  reassignNoticeText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: '#B45309',
  },
  viewRiderBtnText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.primary,
  },
  noRiderBox: {
    alignItems: 'center',
    paddingVertical: Spacing[5],
    gap: Spacing[2],
  },
  noRiderText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  noRiderSub: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  modalTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    color: Colors.textPrimary,
  },
  modalClose: { padding: Spacing[1] },
  modalOrderSummary: {
    backgroundColor: Colors.white,
    marginHorizontal: Spacing[5],
    marginTop: Spacing[4],
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing[1],
  },
  modalOrderId: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  modalOrderDate: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  modalAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
    marginTop: Spacing[1],
  },
  modalAddress: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    flex: 1,
  },
  modalSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    backgroundColor: Colors.white,
    marginHorizontal: Spacing[5],
    marginTop: Spacing[4],
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
  },
  modalSearchInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  riderList: {
    flex: 1,
    marginHorizontal: Spacing[5],
    marginTop: Spacing[3],
  },
  riderListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    padding: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    marginBottom: Spacing[2],
  },
  riderListItemSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  riderListAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceHover,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderListName: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  riderListMeta: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  emptyText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing[6],
  },
  modalFeeRow: {
    flexDirection: 'row',
    gap: Spacing[3],
    marginHorizontal: Spacing[5],
    marginTop: Spacing[3],
  },
  modalInput: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  modalFooter: {
    padding: Spacing[5],
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.white,
  },
  editContent: { padding: Spacing[5], gap: Spacing[4] },
  editField: { gap: Spacing[2] },
  editLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  editInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    backgroundColor: Colors.white,
  },
  editTextarea: { height: 88, textAlignVertical: 'top' },
  editHint: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  editError: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.error,
    backgroundColor: '#FEE2E2',
    borderRadius: Radius.sm,
    padding: Spacing[3],
  },
  saveErrorBanner: {
    backgroundColor: '#FEE2E2',
    borderRadius: Radius.md,
    padding: Spacing[4],
    borderLeftWidth: 4,
    borderLeftColor: Colors.error,
  },
  saveErrorText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.error,
  },
  statusPills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  statusPill: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  statusPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  statusPillText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
  },
  statusPillTextActive: { color: Colors.white },
  subStatusDot: { width: 6, height: 6, borderRadius: 3 },
  editSection: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing[4],
    gap: Spacing[4],
  },
  editSectionTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing[1],
  },
  editDateRow: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  planScroll: { marginHorizontal: -2 },
  planCard: {
    width: 110,
    padding: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    marginRight: Spacing[2],
    gap: 3,
  },
  planCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  planCardName: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: 12,
    color: Colors.textPrimary,
    lineHeight: 16,
  },
  planCardNameSelected: { color: Colors.primary },
  planCardPrice: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  planCardPriceSelected: { color: Colors.primary },
  planCardFreq: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 10,
    color: Colors.textTertiary,
  },
  editInfoBox: {
    backgroundColor: Colors.surfaceHover,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing[4],
    gap: Spacing[3],
  },
  editInfoBoxHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  editInfoBoxTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.warning,
  },
  editInfoBoxHint: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  editCalcNote: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.primary,
    backgroundColor: Colors.primarySurface,
    padding: Spacing[2],
    borderRadius: Radius.sm,
  },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  copyIdBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  summaryTable: { gap: 0, marginTop: Spacing[1] },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing[3],
  },
  summaryDivider: { height: 1, backgroundColor: Colors.divider },
  summaryLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    flex: 1,
  },
  summaryValue: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    flex: 2,
    textAlign: 'right',
  },
  summaryValueBold: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    flex: 2,
    textAlign: 'right',
  },
  summaryPayBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  summaryPayDot: { width: 7, height: 7, borderRadius: 4 },
  summaryPayText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
  },
  pauseEmpty: {
    paddingVertical: Spacing[5],
    alignItems: 'center',
  },
  pauseEmptyText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  pauseRow: {
    flexDirection: 'row',
    gap: Spacing[3],
    paddingVertical: Spacing[4],
    alignItems: 'flex-start',
  },
  pauseRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  pauseIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pauseDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  pauseDateBlock: { flex: 1, gap: 2 },
  pauseDateLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 10,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pauseDateValue: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: '#92400E',
  },
  pauseArrow: { paddingTop: 12 },
  pauseArrowText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  pauseMetaRow: {
    flexDirection: 'row',
    gap: Spacing[2],
    marginTop: 2,
  },
  pauseMetaChip: {
    flex: 1,
    backgroundColor: '#FEF3C7',
    borderRadius: Radius.sm,
    padding: Spacing[2],
    gap: 2,
  },
  pauseMetaLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 10,
    color: '#B45309',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  pauseMetaValue: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: '#92400E',
  },
  pauseResumedText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.success,
    marginTop: 2,
  },
  pauseRowCancelled: {
    opacity: 0.65,
  },
  pauseDateValueCancelled: {
    textDecorationLine: 'line-through',
    color: Colors.textTertiary,
  },
  pauseCancelledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.errorSurface,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: Spacing[2],
  },
  pauseCancelledBadgeText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: 10,
    color: Colors.error,
    textTransform: 'capitalize',
  },
  readOnlyDateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  readOnlyDateLabel: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  readOnlyDateValue: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  cardTitleWithIcon: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  historyCount: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingVertical: Spacing[3],
  },
  historyRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  historyRowCurrent: {
    backgroundColor: Colors.primarySurface,
    marginHorizontal: -Spacing[4],
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.sm,
  },
  historyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  historyBody: { flex: 1, gap: 2 },
  historyDate: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  historyDateCurrent: { color: Colors.primary },
  historyNote: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  payModeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: Colors.primarySurface,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  payModeText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.primary,
    textTransform: 'capitalize',
  },
  historyStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  historyStatusText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: 11,
  },
  payHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingVertical: Spacing[3],
  },
  payDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  payAmount: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
  },
  payStatus: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
});
