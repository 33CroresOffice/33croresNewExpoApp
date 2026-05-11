import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PackageCheck, PackageX, Clock, MapPin, User, ChevronDown, ChevronRight, X, Bike, CircleCheck as CheckCircle2, Circle, Truck, ShoppingBag, Store, Phone } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format } from 'date-fns';
import StatusChip from '@/components/ui/StatusChip';
import Button from '@/components/ui/Button';
import { useLocalSearchParams } from 'expo-router';

const GRADIENT_TOP = '#1A2E3A';
const GRADIENT_MID = '#1E3D50';
const GRADIENT_BOT = '#235068';
const ACCENT = '#3AAFE4';

type AssignmentStatus = 'assigned' | 'accepted' | 'picked_up' | 'delivered' | 'failed';
type ViewMode = 'deliveries' | 'pickups';

interface PickupOrder {
  id: string;
  order_number: string;
  status: string;
  requirement_date: string | null;
  pickup_assigned_at: string | null;
  pickup_notes: string | null;
  vendor: { business_name: string | null; contact_person: string | null; mobile: string | null } | null;
}

interface Assignment {
  id: string;
  status: AssignmentStatus;
  assigned_at: string;
  accepted_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  delivery_fee: number | null;
  notes: string | null;
  orders: {
    id: string;
    scheduled_date: string | null;
    user: { full_name: string; mobile: string } | null;
    subscription: {
      plan: { name: string } | null;
      delivery_address: { street: string; city: string; state: string; pincode: string } | null;
    } | null;
  } | null;
}

const STATUS_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'assigned' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Picked Up', value: 'picked_up' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Failed', value: 'failed' },
];

const NEXT_STATUS_MAP: Record<string, { label: string; nextStatus: AssignmentStatus; icon: any; color: string }> = {
  assigned: { label: 'Accept Delivery', nextStatus: 'accepted', icon: CheckCircle2, color: Colors.primary },
  accepted: { label: 'Mark as Picked Up', nextStatus: 'picked_up', icon: Truck, color: Colors.warning },
  picked_up: { label: 'Mark as Delivered', nextStatus: 'delivered', icon: PackageCheck, color: Colors.success },
};

export default function RiderAssignments() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const isWeb = Platform.OS === 'web';

  const { filter } = useLocalSearchParams<{ filter?: string }>();

  const [riderId, setRiderId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [filtered, setFiltered] = useState<Assignment[]>([]);
  const [statusFilter, setStatusFilter] = useState(filter ?? '');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [updating, setUpdating] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('deliveries');
  const [pickupOrders, setPickupOrders] = useState<PickupOrder[]>([]);
  const [selectedPickup, setSelectedPickup] = useState<PickupOrder | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;

    if (!riderId) {
      const { data: riderData } = await supabase
        .from('riders')
        .select('id')
        .eq('profile_id', profile.id)
        .maybeSingle();

      if (!riderData) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      setRiderId(riderData.id);
      await fetchAssignments(riderData.id);
    } else {
      await fetchAssignments(riderId);
    }
  }, [profile?.id, riderId]);

  const fetchAssignments = async (rId: string) => {
    const [assignRes, pickupRes] = await Promise.all([
      supabase
        .from('rider_order_assignments')
        .select(`
          id, status, assigned_at, accepted_at, picked_up_at, delivered_at, failed_at,
          failure_reason, delivery_fee, notes,
          orders:order_id (
            id, scheduled_date,
            user:user_id ( full_name, mobile ),
            subscription:subscription_id (
              plan:plan_id ( name ),
              delivery_address:delivery_address_id ( street, city, state, pincode )
            )
          )
        `)
        .eq('rider_id', rId)
        .order('assigned_at', { ascending: false }),
      supabase
        .from('procurement_orders')
        .select('id, order_number, status, requirement_date, pickup_assigned_at, pickup_notes, vendor:vendors(business_name, contact_person, mobile)')
        .eq('pickup_rider_id', rId)
        .order('pickup_assigned_at', { ascending: false }),
    ]);

    if (assignRes.data) setAssignments(assignRes.data as Assignment[]);
    if (pickupRes.data) setPickupOrders(pickupRes.data as PickupOrder[]);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!statusFilter) {
      setFiltered(assignments);
    } else {
      setFiltered(assignments.filter((a) => a.status === statusFilter));
    }
  }, [assignments, statusFilter]);

  const updateStatus = async (assignment: Assignment, nextStatus: AssignmentStatus) => {
    setUpdating(true);
    const now = new Date().toISOString();
    const update: Record<string, string> = { status: nextStatus };
    if (nextStatus === 'accepted') update.accepted_at = now;
    if (nextStatus === 'picked_up') update.picked_up_at = now;
    if (nextStatus === 'delivered') update.delivered_at = now;

    const { error } = await supabase
      .from('rider_order_assignments')
      .update(update)
      .eq('id', assignment.id);

    if (!error) {
      setAssignments((prev) =>
        prev.map((a) => (a.id === assignment.id ? { ...a, ...update } : a))
      );
      setSelectedAssignment(null);
    }
    setUpdating(false);
  };

  const statusIconEl = (status: string) => {
    if (status === 'delivered') return <PackageCheck size={18} color={Colors.success} strokeWidth={1.8} />;
    if (status === 'failed') return <PackageX size={18} color={Colors.error} strokeWidth={1.8} />;
    if (status === 'picked_up') return <Truck size={18} color={Colors.warning} strokeWidth={1.8} />;
    if (status === 'accepted') return <CheckCircle2 size={18} color={Colors.primary} strokeWidth={1.8} />;
    return <Circle size={18} color={Colors.textTertiary} strokeWidth={1.8} />;
  };

  const formatAddress = (addr: any) => {
    if (!addr) return '—';
    return [addr.street, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');
  };

  const statusMeta: Record<string, { color: string; bg: string; label: string }> = {
    delivered: { color: Colors.success, bg: Colors.successSurface, label: 'Delivered' },
    failed: { color: Colors.error, bg: Colors.errorSurface, label: 'Failed' },
    picked_up: { color: '#0891b2', bg: '#e0f2fe', label: 'Picked Up' },
    accepted: { color: Colors.primary, bg: Colors.primarySurface, label: 'Accepted' },
    assigned: { color: Colors.warning, bg: Colors.warningSurface, label: 'Pending' },
  };

  const renderCard = (a: Assignment) => {
    const order = a.orders as any;
    const nextAction = NEXT_STATUS_MAP[a.status];
    const addr = order?.subscription?.delivery_address;
    const sm = statusMeta[a.status] ?? statusMeta.assigned;
    return (
      <TouchableOpacity
        key={a.id}
        style={mStyles.card}
        onPress={() => setSelectedAssignment(a)}
        activeOpacity={0.78}
      >
        <View style={[mStyles.cardStatusBar, { backgroundColor: sm.color }]} />
        <View style={mStyles.cardInner}>
          <View style={mStyles.cardTopRow}>
            <View style={[mStyles.cardIconWrap, { backgroundColor: sm.bg }]}>
              {statusIconEl(a.status)}
            </View>
            <View style={mStyles.cardInfo}>
              <Text style={mStyles.cardCustomer} numberOfLines={1}>
                {order?.user?.full_name ?? 'Customer'}
              </Text>
              <Text style={mStyles.cardPlan} numberOfLines={1}>
                {order?.subscription?.plan?.name ?? 'Subscription Order'}
              </Text>
            </View>
            <View style={[mStyles.statusPill, { backgroundColor: sm.bg }]}>
              <Text style={[mStyles.statusPillText, { color: sm.color }]}>{sm.label}</Text>
            </View>
          </View>

          <View style={mStyles.cardDivider} />

          <View style={mStyles.cardBody}>
            <View style={mStyles.cardDetailRow}>
              <MapPin size={13} color={Colors.textTertiary} strokeWidth={1.8} />
              <Text style={mStyles.cardDetailText} numberOfLines={2}>
                {formatAddress(addr)}
              </Text>
            </View>
            {order?.scheduled_date && (
              <View style={mStyles.cardDetailRow}>
                <Clock size={13} color={Colors.textTertiary} strokeWidth={1.8} />
                <Text style={mStyles.cardDetailText}>
                  {format(new Date(order.scheduled_date), 'dd MMM yyyy')}
                </Text>
              </View>
            )}
          </View>

          {nextAction && (
            <View style={mStyles.cardFooter}>
              <View style={[mStyles.actionBtn, { backgroundColor: `${nextAction.color}14`, borderColor: `${nextAction.color}30` }]}>
                <nextAction.icon size={13} color={nextAction.color} strokeWidth={2} />
                <Text style={[mStyles.actionBtnText, { color: nextAction.color }]}>
                  {nextAction.label}
                </Text>
              </View>
              <ChevronRight size={14} color={Colors.neutral[300]} strokeWidth={2} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderDetail = () => {
    if (!selectedAssignment) return null;
    const a = selectedAssignment;
    const order = a.orders as any;
    const nextAction = NEXT_STATUS_MAP[a.status];

    return (
      <Modal transparent animationType="slide" visible={!!selectedAssignment}>
        <View style={mStyles.modalOverlay}>
          <Pressable style={mStyles.modalBackdrop} onPress={() => setSelectedAssignment(null)} />
          <View style={[mStyles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={mStyles.modalHandle} />
            <View style={mStyles.modalHeader}>
              <Text style={mStyles.modalTitle}>Delivery Details</Text>
              <TouchableOpacity onPress={() => setSelectedAssignment(null)} style={mStyles.modalClose}>
                <X size={20} color={Colors.textTertiary} strokeWidth={1.8} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={mStyles.detailSection}>
                <View style={mStyles.detailRow}>
                  <View style={[mStyles.detailIconWrap, { backgroundColor: Colors.primarySurface }]}>
                    <User size={16} color={Colors.primary} strokeWidth={1.8} />
                  </View>
                  <View style={mStyles.detailContent}>
                    <Text style={mStyles.detailLabel}>Customer</Text>
                    <Text style={mStyles.detailValue}>{order?.user?.full_name ?? '—'}</Text>
                    {order?.user?.mobile && (
                      <Text style={mStyles.detailSub}>{order.user.mobile}</Text>
                    )}
                  </View>
                </View>

                <View style={mStyles.detailRow}>
                  <View style={[mStyles.detailIconWrap, { backgroundColor: Colors.warningSurface }]}>
                    <MapPin size={16} color={Colors.warning} strokeWidth={1.8} />
                  </View>
                  <View style={mStyles.detailContent}>
                    <Text style={mStyles.detailLabel}>Delivery Address</Text>
                    <Text style={mStyles.detailValue}>{formatAddress(order?.subscription?.delivery_address)}</Text>
                  </View>
                </View>

                {order?.subscription?.plan?.name && (
                  <View style={mStyles.detailRow}>
                    <View style={[mStyles.detailIconWrap, { backgroundColor: Colors.accentSurface }]}>
                      <PackageCheck size={16} color={Colors.accent} strokeWidth={1.8} />
                    </View>
                    <View style={mStyles.detailContent}>
                      <Text style={mStyles.detailLabel}>Plan</Text>
                      <Text style={mStyles.detailValue}>{order.subscription.plan.name}</Text>
                    </View>
                  </View>
                )}
              </View>

              <View style={mStyles.timelineSection}>
                <Text style={mStyles.timelineTitle}>Status Timeline</Text>
                {[
                  { label: 'Assigned', time: a.assigned_at },
                  { label: 'Accepted', time: a.accepted_at },
                  { label: 'Picked Up', time: a.picked_up_at },
                  { label: 'Delivered', time: a.delivered_at },
                ].map(({ label, time }) => (
                  <View key={label} style={mStyles.timelineRow}>
                    <View style={[mStyles.timelineDot, time ? mStyles.timelineDotActive : mStyles.timelineDotInactive]} />
                    <View style={mStyles.timelineContent}>
                      <Text style={[mStyles.timelineLabel, !time && mStyles.timelineLabelInactive]}>{label}</Text>
                      {time && (
                        <Text style={mStyles.timelineTime}>
                          {format(new Date(time), 'dd MMM, hh:mm a')}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>

            {nextAction && (
              <View style={mStyles.modalActions}>
                <Button
                  label={nextAction.label}
                  onPress={() => updateStatus(a, nextAction.nextStatus)}
                  loading={updating}
                  fullWidth
                  size="lg"
                />
              </View>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  const filterLabel = STATUS_FILTERS.find((f) => f.value === statusFilter)?.label ?? 'All';

  if (isWeb) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: '#EEF2F5' }}
        contentContainerStyle={wStyles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <LinearGradient
          colors={[GRADIENT_TOP, GRADIENT_MID, GRADIENT_BOT]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={wStyles.gradientHeader}
        >
          <View style={wStyles.headerInner}>
            <View style={wStyles.headerLeft}>
              <View style={wStyles.headerIconWrap}>
                {viewMode === 'deliveries'
                  ? <Truck size={22} color={ACCENT} strokeWidth={1.8} />
                  : <ShoppingBag size={22} color={ACCENT} strokeWidth={1.8} />}
              </View>
              <View>
                <Text style={wStyles.headerEyebrow}>Rider Portal</Text>
                <Text style={wStyles.headerTitle}>{viewMode === 'deliveries' ? 'My Deliveries' : 'Pickup Orders'}</Text>
                <Text style={wStyles.headerDate}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
              </View>
            </View>
          </View>
          <View style={wStyles.headerControls}>
            <View style={wStyles.controlsRow}>
              <View style={wStyles.viewToggleRow}>
                <TouchableOpacity
                  style={[wStyles.viewToggleBtn, viewMode === 'deliveries' && wStyles.viewToggleBtnActive]}
                  onPress={() => setViewMode('deliveries')}
                >
                  <Truck size={13} color={viewMode === 'deliveries' ? Colors.white : 'rgba(255,255,255,0.65)'} strokeWidth={2} />
                  <Text style={[wStyles.viewToggleText, viewMode === 'deliveries' && wStyles.viewToggleTextActive]}>
                    Deliveries
                  </Text>
                  {assignments.length > 0 && (
                    <View style={[wStyles.countBadge, viewMode === 'deliveries' && wStyles.countBadgeActive]}>
                      <Text style={[wStyles.countBadgeText, viewMode === 'deliveries' && wStyles.countBadgeTextActive]}>
                        {assignments.length}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[wStyles.viewToggleBtn, viewMode === 'pickups' && wStyles.viewToggleBtnPickup]}
                  onPress={() => setViewMode('pickups')}
                >
                  <ShoppingBag size={13} color={viewMode === 'pickups' ? Colors.white : 'rgba(255,255,255,0.65)'} strokeWidth={2} />
                  <Text style={[wStyles.viewToggleText, viewMode === 'pickups' && wStyles.viewToggleTextActive]}>
                    Pickups
                  </Text>
                  {pickupOrders.length > 0 && (
                    <View style={[wStyles.countBadge, viewMode === 'pickups' && wStyles.countBadgeActive]}>
                      <Text style={[wStyles.countBadgeText, viewMode === 'pickups' && wStyles.countBadgeTextActive]}>
                        {pickupOrders.length}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {viewMode === 'deliveries' && (
                <View style={wStyles.dividerV} />
              )}

              {viewMode === 'deliveries' && (
                <View style={wStyles.filterRow}>
                  {STATUS_FILTERS.map((f) => (
                    <TouchableOpacity
                      key={f.value}
                      style={[wStyles.filterBtn, statusFilter === f.value && wStyles.filterBtnActive]}
                      onPress={() => setStatusFilter(f.value)}
                    >
                      <Text style={[wStyles.filterText, statusFilter === f.value && wStyles.filterTextActive]}>
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>
        </LinearGradient>

        {viewMode === 'deliveries' && (
          <View style={[wStyles.tableCard, { margin: 32, marginTop: 24 }]}>
            <View style={wStyles.tableHead}>
              <Text style={[wStyles.thCell, { flex: 1.8 }]}>Customer</Text>
              <Text style={[wStyles.thCell, { flex: 1.8 }]}>Plan</Text>
              <Text style={[wStyles.thCell, { flex: 2.8 }]}>Address</Text>
              <Text style={[wStyles.thCell, { width: 148 }]}>Assigned</Text>
              <Text style={[wStyles.thCell, { width: 110 }]}>Status</Text>
              <Text style={[wStyles.thCell, { width: 160 }]}>Action</Text>
            </View>
            {filtered.length === 0 ? (
              <View style={wStyles.emptyState}>
                <PackageCheck size={32} color={Colors.textTertiary} strokeWidth={1.5} />
                <Text style={wStyles.emptyText}>No assignments found</Text>
              </View>
            ) : (
              filtered.map((a, i) => {
                const order = a.orders as any;
                const nextAction = NEXT_STATUS_MAP[a.status];
                return (
                  <View key={a.id} style={[wStyles.tableRow, i % 2 === 1 && wStyles.tableRowAlt]}>
                    <Text style={[wStyles.tdCell, { flex: 1.8, fontFamily: Typography.fontFamily.sansMedium }]} numberOfLines={1}>
                      {order?.user?.full_name ?? '—'}
                    </Text>
                    <Text style={[wStyles.tdCell, { flex: 1.8 }]} numberOfLines={1}>
                      {order?.subscription?.plan?.name ?? '—'}
                    </Text>
                    <Text style={[wStyles.tdCell, { flex: 2.8, color: Colors.textSecondary, paddingRight: 8 }]} numberOfLines={1}>
                      {formatAddress(order?.subscription?.delivery_address)}
                    </Text>
                    <Text style={[wStyles.tdCell, { width: 148 }]}>
                      {a.assigned_at ? format(new Date(a.assigned_at), 'dd MMM, hh:mm a') : '—'}
                    </Text>
                    <View style={{ width: 110 }}>
                      <StatusChip status={a.status} />
                    </View>
                    <View style={{ width: 160 }}>
                      {nextAction ? (
                        <TouchableOpacity
                          style={[wStyles.actionBtn, { backgroundColor: `${nextAction.color}18`, borderColor: `${nextAction.color}30` }]}
                          onPress={() => updateStatus(a, nextAction.nextStatus)}
                          activeOpacity={0.75}
                        >
                          <nextAction.icon size={13} color={nextAction.color} strokeWidth={1.8} />
                          <Text style={[wStyles.actionBtnText, { color: nextAction.color }]}>
                            {nextAction.label}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={wStyles.tdCellMuted}>—</Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {viewMode === 'pickups' && (
          <View style={[wStyles.tableCard, { margin: 32, marginTop: 24 }]}>
            <View style={wStyles.tableHead}>
              <Text style={[wStyles.thCell, { width: 140 }]}>Order #</Text>
              <Text style={[wStyles.thCell, { flex: 2 }]}>Vendor</Text>
              <Text style={[wStyles.thCell, { width: 140 }]}>Req. Date</Text>
              <Text style={[wStyles.thCell, { flex: 2.5 }]}>Notes</Text>
              <Text style={[wStyles.thCell, { width: 130 }]}>Status</Text>
            </View>
            {pickupOrders.length === 0 ? (
              <View style={wStyles.emptyState}>
                <ShoppingBag size={32} color={Colors.textTertiary} strokeWidth={1.5} />
                <Text style={wStyles.emptyText}>No pickup orders assigned</Text>
              </View>
            ) : (
              pickupOrders.map((p, i) => {
                const vendor = p.vendor as any;
                const isPending = p.status === 'accepted';
                return (
                  <View key={p.id} style={[wStyles.tableRow, i % 2 === 1 && wStyles.tableRowAlt]}>
                    <Text style={[wStyles.tdCell, { width: 140, fontFamily: Typography.fontFamily.sansSemiBold }]} numberOfLines={1}>
                      {p.order_number}
                    </Text>
                    <View style={{ flex: 2, paddingRight: 8 }}>
                      <Text style={wStyles.tdCell} numberOfLines={1}>{vendor?.business_name ?? vendor?.contact_person ?? '—'}</Text>
                      {vendor?.mobile && <Text style={wStyles.tdCellMuted}>{vendor.mobile}</Text>}
                    </View>
                    <Text style={[wStyles.tdCell, { width: 140 }]}>
                      {p.requirement_date ? format(new Date(p.requirement_date), 'dd MMM yyyy') : '—'}
                    </Text>
                    <Text style={[wStyles.tdCell, { flex: 2.5, color: Colors.textSecondary, paddingRight: 8 }]} numberOfLines={1}>
                      {p.pickup_notes ?? '—'}
                    </Text>
                    <View style={{ width: 130 }}>
                      <View style={{
                        backgroundColor: isPending ? '#e0f2fe' : '#dcfce7',
                        borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start',
                      }}>
                        <Text style={{ fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: isPending ? '#0891b2' : '#16a34a' }}>
                          {isPending ? 'Pending Pickup' : 'Fulfilled'}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={[mStyles.container, { backgroundColor: '#EEF2F5' }]}>
      <LinearGradient
        colors={[GRADIENT_TOP, GRADIENT_MID, GRADIENT_BOT]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[mStyles.gradientHeader, { paddingTop: insets.top + Spacing[3] }]}
      >
        <View style={mStyles.headerTopRow}>
          <View style={mStyles.headerLeft}>
            <View style={mStyles.headerIconWrap}>
              {viewMode === 'deliveries'
                ? <Truck size={18} color={ACCENT} strokeWidth={1.8} />
                : <ShoppingBag size={18} color={ACCENT} strokeWidth={1.8} />}
            </View>
            <View>
              <Text style={mStyles.headerEyebrow}>Rider Portal</Text>
              <Text style={mStyles.headerTitle}>{viewMode === 'deliveries' ? 'My Deliveries' : 'Pickup Orders'}</Text>
              <Text style={mStyles.headerDate}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
            </View>
          </View>
          {viewMode === 'deliveries' ? (
            <TouchableOpacity
              style={mStyles.filterPill}
              onPress={() => setFilterOpen(true)}
              activeOpacity={0.8}
            >
              <Text style={mStyles.filterPillText}>{filterLabel}</Text>
              <ChevronDown size={14} color={ACCENT} strokeWidth={2} />
            </TouchableOpacity>
          ) : null}
        </View>
      </LinearGradient>

      <View style={mStyles.viewToggle}>
        <TouchableOpacity
          style={[mStyles.toggleBtn, viewMode === 'deliveries' && mStyles.toggleBtnActive]}
          onPress={() => setViewMode('deliveries')}
          activeOpacity={0.8}
        >
          <Truck size={14} color={viewMode === 'deliveries' ? Colors.white : Colors.textTertiary} strokeWidth={2} />
          <Text style={[mStyles.toggleBtnText, viewMode === 'deliveries' && mStyles.toggleBtnTextActive]}>Deliveries</Text>
          {assignments.length > 0 && (
            <View style={[mStyles.toggleCount, viewMode === 'deliveries' && mStyles.toggleCountActive]}>
              <Text style={[mStyles.toggleCountText, viewMode === 'deliveries' && mStyles.toggleCountTextActive]}>{assignments.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[mStyles.toggleBtn, viewMode === 'pickups' && mStyles.toggleBtnPickup]}
          onPress={() => setViewMode('pickups')}
          activeOpacity={0.8}
        >
          <ShoppingBag size={14} color={viewMode === 'pickups' ? Colors.white : Colors.textTertiary} strokeWidth={2} />
          <Text style={[mStyles.toggleBtnText, viewMode === 'pickups' && mStyles.toggleBtnTextActive]}>Pickups</Text>
          {pickupOrders.length > 0 && (
            <View style={[mStyles.toggleCount, viewMode === 'pickups' && mStyles.toggleCountPickup]}>
              <Text style={[mStyles.toggleCountText, viewMode === 'pickups' && mStyles.toggleCountTextActive]}>{pickupOrders.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[mStyles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {viewMode === 'deliveries' && (
          <>
            {filtered.length === 0 && !loading && (
              <View style={mStyles.emptyState}>
                <PackageCheck size={36} color={Colors.textTertiary} strokeWidth={1.5} />
                <Text style={mStyles.emptyTitle}>No deliveries found</Text>
                <Text style={mStyles.emptyText}>
                  {statusFilter ? 'No assignments with this status.' : 'You have no delivery assignments yet.'}
                </Text>
              </View>
            )}
            {filtered.map(renderCard)}
          </>
        )}

        {viewMode === 'pickups' && (
          <>
            {pickupOrders.length === 0 && !loading && (
              <View style={mStyles.emptyState}>
                <ShoppingBag size={36} color={Colors.textTertiary} strokeWidth={1.5} />
                <Text style={mStyles.emptyTitle}>No pickup orders</Text>
                <Text style={mStyles.emptyText}>You have no procurement pickup assignments yet.</Text>
              </View>
            )}
            {pickupOrders.map((p) => {
              const vendor = p.vendor as any;
              const isPending = p.status === 'accepted';
              const pColor = isPending ? '#0891b2' : '#16a34a';
              const pBg = isPending ? '#e0f2fe' : '#dcfce7';
              return (
                <TouchableOpacity
                  key={p.id}
                  style={mStyles.card}
                  onPress={() => setSelectedPickup(p)}
                  activeOpacity={0.78}
                >
                  <View style={[mStyles.cardStatusBar, { backgroundColor: pColor }]} />
                  <View style={mStyles.cardInner}>
                  <View style={mStyles.cardTopRow}>
                    <View style={[mStyles.cardIconWrap, { backgroundColor: pBg }]}>
                      <ShoppingBag size={18} color={pColor} strokeWidth={1.8} />
                    </View>
                    <View style={mStyles.cardInfo}>
                      <Text style={mStyles.cardCustomer} numberOfLines={1}>{p.order_number}</Text>
                      <Text style={mStyles.cardPlan} numberOfLines={1}>
                        {vendor?.business_name ?? vendor?.contact_person ?? '—'}
                      </Text>
                    </View>
                    <View style={[mStyles.statusPill, { backgroundColor: pBg }]}>
                      <Text style={[mStyles.statusPillText, { color: pColor }]}>
                        {isPending ? 'Pickup' : 'Fulfilled'}
                      </Text>
                    </View>
                  </View>
                  <View style={mStyles.cardDivider} />
                  <View style={mStyles.cardBody}>
                    {vendor?.mobile && (
                      <View style={mStyles.cardDetailRow}>
                        <Phone size={13} color={Colors.textTertiary} strokeWidth={1.8} />
                        <Text style={mStyles.cardDetailText}>{vendor.mobile}</Text>
                      </View>
                    )}
                    {p.requirement_date && (
                      <View style={mStyles.cardDetailRow}>
                        <Clock size={13} color={Colors.textTertiary} strokeWidth={1.8} />
                        <Text style={mStyles.cardDetailText}>
                          Required by {format(new Date(p.requirement_date), 'dd MMM yyyy')}
                        </Text>
                      </View>
                    )}
                    {p.pickup_notes && (
                      <View style={mStyles.cardDetailRow}>
                        <Store size={13} color={Colors.textTertiary} strokeWidth={1.8} />
                        <Text style={mStyles.cardDetailText} numberOfLines={2}>{p.pickup_notes}</Text>
                      </View>
                    )}
                  </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>

      {selectedPickup && (
        <Modal transparent animationType="slide" visible={!!selectedPickup}>
          <View style={mStyles.modalOverlay}>
            <Pressable style={mStyles.modalBackdrop} onPress={() => setSelectedPickup(null)} />
            <View style={[mStyles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={mStyles.modalHandle} />
              <View style={mStyles.modalHeader}>
                <Text style={mStyles.modalTitle}>Pickup Details</Text>
                <TouchableOpacity onPress={() => setSelectedPickup(null)} style={mStyles.modalClose}>
                  <X size={20} color={Colors.textTertiary} strokeWidth={1.8} />
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                <View style={mStyles.detailSection}>
                  <View style={mStyles.detailRow}>
                    <View style={[mStyles.detailIconWrap, { backgroundColor: '#e0f2fe' }]}>
                      <ShoppingBag size={16} color="#0891b2" strokeWidth={1.8} />
                    </View>
                    <View style={mStyles.detailContent}>
                      <Text style={mStyles.detailLabel}>Order Number</Text>
                      <Text style={mStyles.detailValue}>{selectedPickup.order_number}</Text>
                    </View>
                  </View>
                  <View style={mStyles.detailRow}>
                    <View style={[mStyles.detailIconWrap, { backgroundColor: Colors.primarySurface }]}>
                      <Store size={16} color={Colors.primary} strokeWidth={1.8} />
                    </View>
                    <View style={mStyles.detailContent}>
                      <Text style={mStyles.detailLabel}>Vendor</Text>
                      <Text style={mStyles.detailValue}>
                        {(selectedPickup.vendor as any)?.business_name ?? (selectedPickup.vendor as any)?.contact_person ?? '—'}
                      </Text>
                      {(selectedPickup.vendor as any)?.mobile && (
                        <Text style={mStyles.detailSub}>{(selectedPickup.vendor as any).mobile}</Text>
                      )}
                    </View>
                  </View>
                  {selectedPickup.requirement_date && (
                    <View style={mStyles.detailRow}>
                      <View style={[mStyles.detailIconWrap, { backgroundColor: Colors.warningSurface }]}>
                        <Clock size={16} color={Colors.warning} strokeWidth={1.8} />
                      </View>
                      <View style={mStyles.detailContent}>
                        <Text style={mStyles.detailLabel}>Required By</Text>
                        <Text style={mStyles.detailValue}>{format(new Date(selectedPickup.requirement_date), 'dd MMM yyyy')}</Text>
                      </View>
                    </View>
                  )}
                  {selectedPickup.pickup_notes && (
                    <View style={mStyles.detailRow}>
                      <View style={[mStyles.detailIconWrap, { backgroundColor: Colors.neutral[100] }]}>
                        <Bike size={16} color={Colors.textTertiary} strokeWidth={1.8} />
                      </View>
                      <View style={mStyles.detailContent}>
                        <Text style={mStyles.detailLabel}>Notes</Text>
                        <Text style={mStyles.detailValue}>{selectedPickup.pickup_notes}</Text>
                      </View>
                    </View>
                  )}
                  {selectedPickup.pickup_assigned_at && (
                    <View style={mStyles.detailRow}>
                      <View style={[mStyles.detailIconWrap, { backgroundColor: Colors.neutral[100] }]}>
                        <CheckCircle2 size={16} color={Colors.success} strokeWidth={1.8} />
                      </View>
                      <View style={mStyles.detailContent}>
                        <Text style={mStyles.detailLabel}>Assigned At</Text>
                        <Text style={mStyles.detailValue}>{format(new Date(selectedPickup.pickup_assigned_at), 'dd MMM yyyy, hh:mm a')}</Text>
                      </View>
                    </View>
                  )}
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {renderDetail()}

      <Modal transparent animationType="fade" visible={filterOpen}>
        <Pressable style={mStyles.filterModalOverlay} onPress={() => setFilterOpen(false)}>
          <View style={[mStyles.filterSheet, { paddingBottom: insets.bottom + 8 }]}>
            <Text style={mStyles.filterSheetTitle}>Filter by Status</Text>
            {STATUS_FILTERS.map((f) => (
              <TouchableOpacity
                key={f.value}
                style={[mStyles.filterOption, statusFilter === f.value && mStyles.filterOptionActive]}
                onPress={() => { setStatusFilter(f.value); setFilterOpen(false); }}
              >
                <Text style={[mStyles.filterOptionText, statusFilter === f.value && mStyles.filterOptionTextActive]}>
                  {f.label}
                </Text>
                {statusFilter === f.value && (
                  <CheckCircle2 size={16} color={Colors.primary} strokeWidth={2} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const mStyles = StyleSheet.create({
  container: { flex: 1 },
  gradientHeader: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[4],
  },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], flex: 1 },
  headerIconWrap: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerEyebrow: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'], color: '#FFFFFF', letterSpacing: -0.3,
  },
  headerDate: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.5)', marginTop: 2,
  },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: Radius.full,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  filterPillText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm, color: '#FFFFFF',
  },
  scrollContent: { padding: Spacing[4], gap: Spacing[3] },
  card: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
    flexDirection: 'row',
  },
  cardStatusBar: {
    width: 4,
  },
  cardInner: { flex: 1 },
  cardTopRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[4], paddingTop: Spacing[4], paddingBottom: Spacing[3],
    gap: Spacing[3],
  },
  cardIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardInfo: { flex: 1, gap: 2 },
  cardCustomer: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  cardPlan: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  statusPill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full,
  },
  statusPillText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11,
  },
  cardDivider: {
    height: 1, backgroundColor: Colors.divider, marginHorizontal: Spacing[4],
  },
  cardBody: { padding: Spacing[4], gap: Spacing[2] },
  cardDetailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2] },
  cardDetailText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm, color: Colors.textSecondary, flex: 1, lineHeight: 20,
  },
  cardFooter: {
    paddingHorizontal: Spacing[4], paddingBottom: Spacing[4],
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: Radius.full, borderWidth: 1,
  },
  actionBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm,
  },
  viewToggle: {
    flexDirection: 'row', backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[2], gap: Spacing[2],
  },
  toggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.neutral[50],
  },
  toggleBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  toggleBtnPickup: { backgroundColor: '#0891b2', borderColor: '#0891b2' },
  toggleBtnText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary },
  toggleBtnTextActive: { color: Colors.white },
  toggleCount: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: Colors.neutral[200], alignItems: 'center', justifyContent: 'center',
  },
  toggleCountActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  toggleCountPickup: { backgroundColor: 'rgba(255,255,255,0.3)' },
  toggleCountText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.textTertiary },
  toggleCountTextActive: { color: Colors.white },
  emptyState: { paddingVertical: 60, alignItems: 'center', gap: Spacing[3] },
  emptyTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary,
  },
  emptyText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
    textAlign: 'center',
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '90%', paddingTop: 12,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.neutral[200],
    alignSelf: 'center', marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing[5], paddingBottom: Spacing[4],
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xl, color: Colors.textPrimary,
  },
  modalClose: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.neutral[100],
    alignItems: 'center', justifyContent: 'center',
  },
  detailSection: { padding: Spacing[5], gap: Spacing[4] },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3] },
  detailIconWrap: {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  detailContent: { flex: 1, gap: 2 },
  detailLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  detailValue: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  detailSub: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
  },
  timelineSection: {
    paddingHorizontal: Spacing[5], paddingBottom: Spacing[5], gap: Spacing[3],
  },
  timelineTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3] },
  timelineDot: {
    width: 12, height: 12, borderRadius: 6, marginTop: 4, flexShrink: 0,
  },
  timelineDotActive: { backgroundColor: Colors.primary },
  timelineDotInactive: { backgroundColor: Colors.neutral[200] },
  timelineContent: { flex: 1, gap: 1 },
  timelineLabel: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary,
  },
  timelineLabelInactive: { color: Colors.textTertiary },
  timelineTime: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  modalActions: {
    padding: Spacing[5], borderTopWidth: 1, borderTopColor: Colors.border,
  },
  filterModalOverlay: {
    flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)',
  },
  filterSheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing[5], gap: Spacing[2],
  },
  filterSheetTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary,
    marginBottom: Spacing[2],
  },
  filterOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing[4], paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
  },
  filterOptionActive: { backgroundColor: Colors.primarySurface },
  filterOptionText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  filterOptionTextActive: { color: Colors.primary },
});

const wStyles = StyleSheet.create({
  content: { paddingBottom: 64, gap: 0 },
  gradientHeader: { paddingBottom: 0 },
  headerInner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 32, paddingTop: 32, paddingBottom: 16,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  headerIconWrap: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerEyebrow: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 11,
    color: 'rgba(255,255,255,0.55)', letterSpacing: 1, textTransform: 'uppercase',
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold, fontSize: 30,
    color: '#FFFFFF', letterSpacing: -0.5, marginTop: 2,
  },
  headerDate: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.5)', marginTop: 3,
  },
  headerControls: {
    paddingHorizontal: 32, paddingBottom: 20,
  },
  controlsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap',
  },
  viewToggleRow: {
    flexDirection: 'row', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: Radius.full,
    padding: 3,
  },
  viewToggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: Radius.full,
  },
  viewToggleBtnActive: { backgroundColor: Colors.primary },
  viewToggleBtnPickup: { backgroundColor: '#0891b2' },
  viewToggleText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.65)',
  },
  viewToggleTextActive: { color: Colors.white },
  countBadge: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  countBadgeActive: { backgroundColor: 'rgba(255,255,255,0.35)' },
  countBadgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: 'rgba(255,255,255,0.8)',
  },
  countBadgeTextActive: { color: Colors.white },
  dividerV: {
    width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.2)',
  },
  filterRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  filterBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  filterBtnActive: {
    backgroundColor: Colors.white, borderColor: Colors.white,
  },
  filterText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.75)',
  },
  filterTextActive: { color: Colors.primary },
  tableCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  tableHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 11,
    backgroundColor: Colors.neutral[50], borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  thCell: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11,
    color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.neutral[50],
    minHeight: 52,
  },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  tdCell: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary,
    paddingRight: 8,
  },
  tdCellMuted: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
  },
  emptyState: { paddingVertical: 40, alignItems: 'center', gap: 10 },
  emptyText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.md, alignSelf: 'flex-start',
  },
  actionBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 12,
  },
});
