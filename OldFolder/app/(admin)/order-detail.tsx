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
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, MapPin, Phone, Bike, User, X, Search, CircleCheck, CreditCard, CalendarDays, CirclePause as PauseCircle } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { OrderStatus } from '@/types/database';
import StatusChip from '@/components/ui/StatusChip';
import Button from '@/components/ui/Button';
import { format } from 'date-fns';

const STATUSES: { label: string; value: OrderStatus }[] = [
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Out for Delivery', value: 'out_for_delivery' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Failed', value: 'failed' },
];

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
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<any>(null);
  const [assignment, setAssignment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [riderSearch, setRiderSearch] = useState('');
  const [riders, setRiders] = useState<any[]>([]);
  const [ridersLoading, setRidersLoading] = useState(false);
  const [selectedRider, setSelectedRider] = useState<any>(null);
  const [deliveryFee, setDeliveryFee] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [assigning, setAssigning] = useState(false);

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
          .select('*, rider:riders(id, full_name, mobile, zone, vehicle_type)')
          .eq('order_id', id)
          .neq('status', 'reassigned')
          .order('assigned_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (orderRes.data) {
        const sub = orderRes.data.subscription;
        let deliveryAddress = null;
        let payments: any[] = [];

        if (sub?.id) {
          const [addrRes, paymentsRes] = await Promise.all([
            sub.delivery_address_id
              ? supabase
                  .from('addresses')
                  .select('id, street, city, state, pincode, label')
                  .eq('id', sub.delivery_address_id)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
            supabase
              .from('payments')
              .select('id, amount, status, created_at')
              .eq('subscription_id', sub.id)
              .order('created_at', { ascending: false })
              .limit(5),
          ]);
          deliveryAddress = addrRes.data ?? null;
          payments = paymentsRes.data ?? [];
        }

        setOrder({
          ...orderRes.data,
          subscription: sub ? { ...sub, delivery_address: deliveryAddress, payments } : sub,
        });
      }

      setAssignment(assignRes.data ?? null);
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

  const handleStatusChange = async (status: OrderStatus) => {
    setUpdating(true);
    await supabase.from('orders').update({
      status,
      delivered_at: status === 'delivered' ? new Date().toISOString() : null,
    }).eq('id', id);
    if (assignment && status !== order.status) {
      const assignmentStatus =
        status === 'out_for_delivery' ? 'picked_up' :
        status === 'delivered' ? 'delivered' :
        status === 'failed' ? 'failed' : null;
      if (assignmentStatus) {
        await supabase.from('rider_order_assignments')
          .update({ status: assignmentStatus })
          .eq('id', assignment.id);
      }
    }
    setUpdating(false);
    load();
  };

  const handleAssign = async () => {
    if (!selectedRider) return;
    setAssigning(true);
    const fee = deliveryFee ? parseFloat(deliveryFee) : 0;
    const notes = assignNotes.trim() || '';
    await supabase.from('rider_order_assignments').insert({
      order_id: id,
      rider_id: selectedRider.id,
      status: 'assigned',
      delivery_fee: fee,
      notes,
    });
    await supabase.from('orders').update({ status: 'out_for_delivery' }).eq('id', id);
    setAssignment({
      id: null,
      order_id: id,
      rider_id: selectedRider.id,
      status: 'assigned',
      delivery_fee: fee,
      notes,
      rider: {
        id: selectedRider.id,
        full_name: selectedRider.full_name,
        mobile: selectedRider.mobile,
        zone: selectedRider.zone,
        vehicle_type: selectedRider.vehicle_type,
      },
    });
    setOrder((prev: any) => prev ? { ...prev, status: 'out_for_delivery' } : prev);
    setAssigning(false);
    setShowAssignModal(false);
    setSelectedRider(null);
    setDeliveryFee('');
    setAssignNotes('');
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
        <View style={{ width: 36 }} />
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
                  ? `${sub.delivery_address.street}, ${sub.delivery_address.city}, ${sub.delivery_address.state} - ${sub.delivery_address.pincode}`
                  : 'Not available'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Subscription Details</Text>
          <View style={styles.infoRow}>
            <CalendarDays size={16} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Subscription Period</Text>
              <Text style={styles.infoValue}>
                {sub?.start_date ? formatDate(sub.start_date) : '—'}
                {sub?.end_date ? ` → ${formatDate(sub.end_date)}` : ''}
              </Text>
            </View>
          </View>
          {latestPayment && (
            <View style={[styles.infoRow, styles.infoDivider]}>
              <CreditCard size={16} color={latestPayment.status === 'captured' ? Colors.success : latestPayment.status === 'failed' ? Colors.error : Colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Payment Status</Text>
                <View style={styles.paymentRow}>
                  <Text style={[styles.infoValue, {
                    color: latestPayment.status === 'captured' ? Colors.success
                      : latestPayment.status === 'failed' ? Colors.error
                      : Colors.warning,
                  }]}>
                    {latestPayment.status.charAt(0).toUpperCase() + latestPayment.status.slice(1)}
                  </Text>
                  <Text style={styles.infoSub}>₹{(latestPayment.amount / 100).toLocaleString('en-IN')} · {formatDate(latestPayment.created_at)}</Text>
                </View>
              </View>
            </View>
          )}
          {isPaused && (
            <View style={[styles.infoRow, styles.infoDivider]}>
              <PauseCircle size={16} color={Colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Subscription Paused</Text>
                <Text style={styles.infoValue}>
                  {sub.pause_start_date ? formatDate(sub.pause_start_date) : '—'}
                  {sub.pause_until ? ` → Resumes ${formatDate(sub.pause_until)}` : ''}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>Rider Assignment</Text>
            {!assignment || assignment.status === 'delivered' || assignment.status === 'failed' ? (
              <TouchableOpacity
                style={styles.assignBtn}
                onPress={() => setShowAssignModal(true)}
              >
                <Bike size={13} color={Colors.primary} />
                <Text style={styles.assignBtnText}>Assign Rider</Text>
              </TouchableOpacity>
            ) : null}
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
              <TouchableOpacity
                style={styles.viewRiderBtn}
                onPress={() => router.push({ pathname: '/(admin)/rider-detail', params: { id: rider.id, name: rider.full_name } } as any)}
              >
                <Text style={styles.viewRiderBtnText}>View Rider Profile</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.noRiderBox}>
              <Bike size={24} color={Colors.textTertiary} />
              <Text style={styles.noRiderText}>No rider assigned yet</Text>
              <Text style={styles.noRiderSub}>Tap "Assign Rider" to assign a delivery rider</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Update Status</Text>
          <View style={styles.statusButtons}>
            {STATUSES.map((s) => (
              <TouchableOpacity
                key={s.value}
                style={[styles.statusBtn, order.status === s.value && styles.statusBtnActive]}
                onPress={() => handleStatusChange(s.value)}
                disabled={order.status === s.value || updating}
              >
                <Text style={[styles.statusBtnText, order.status === s.value && styles.statusBtnTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      <Modal visible={showAssignModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAssignModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Assign Rider</Text>
            <TouchableOpacity onPress={() => { setShowAssignModal(false); setSelectedRider(null); }} style={styles.modalClose}>
              <X size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalOrderSummary}>
            <Text style={styles.modalOrderId}>Order #{order.id.slice(0, 8).toUpperCase()}</Text>
            <Text style={styles.modalOrderDate}>{format(new Date(order.scheduled_date), 'dd MMM yyyy')}</Text>
            {sub?.delivery_address && (
              <View style={styles.modalAddressRow}>
                <MapPin size={13} color={Colors.textTertiary} />
                <Text style={styles.modalAddress} numberOfLines={1}>
                  {sub.delivery_address.street}, {sub.delivery_address.city}
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
              label={assigning ? 'Assigning...' : `Assign ${selectedRider ? selectedRider.full_name : 'Rider'}`}
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
  statusButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  statusBtn: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  statusBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  statusBtnText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
  },
  statusBtnTextActive: { color: Colors.white },
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
  viewRiderBtn: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: Spacing[3],
    alignItems: 'center',
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
});
