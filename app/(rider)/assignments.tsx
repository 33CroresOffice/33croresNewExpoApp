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
  ActivityIndicator,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PackageCheck, MapPin, User, X, Truck, Phone, Clock, CircleCheck as CheckCircle2 } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format } from 'date-fns';
import { resolveRider } from '@/utils/riderLookup';

const GRADIENT_TOP = '#1A2E3A';
const GRADIENT_MID = '#1E3D50';
const GRADIENT_BOT = '#235068';
const ACCENT = '#3AAFE4';

type AssignmentStatus = 'assigned' | 'accepted' | 'picked_up' | 'delivered' | 'failed';

interface OrderDetail {
  id: string;
  order_type: 'subscription' | 'custom';
  scheduled_date: string | null;
  customer_name: string | null;
  customer_mobile: string | null;
  plan_name: string | null;
  subscription_status: string | null;
  addr_label: string | null;
  addr_street: string | null;
  addr_city: string | null;
  addr_state: string | null;
  addr_pincode: string | null;
  addr_apartment: string | null;
}

interface Assignment {
  id: string;
  order_id: string | null;
  custom_order_id: string | null;
  status: AssignmentStatus;
  assigned_at: string;
  accepted_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  delivery_fee: number | null;
  notes: string | null;
  orderDetail?: OrderDetail;
}

const statusMeta: Record<string, { color: string; bg: string; label: string }> = {
  delivered: { color: Colors.success, bg: Colors.successSurface, label: 'Delivered' },
  failed: { color: Colors.error, bg: Colors.errorSurface, label: 'Failed' },
  picked_up: { color: '#0891b2', bg: '#e0f2fe', label: 'Picked Up' },
  accepted: { color: Colors.primary, bg: Colors.primarySurface, label: 'Accepted' },
  assigned: { color: Colors.warning, bg: Colors.warningSurface, label: 'Pending' },
};

const subStatusMeta: Record<string, { color: string; bg: string; label: string }> = {
  active: { color: Colors.success, bg: Colors.successSurface, label: 'Active' },
  paused: { color: Colors.warning, bg: Colors.warningSurface, label: 'Paused' },
  pending: { color: Colors.primary, bg: Colors.primarySurface, label: 'Pending' },
  cancelled: { color: Colors.error, bg: Colors.errorSurface, label: 'Cancelled' },
  expired: { color: Colors.textTertiary, bg: Colors.neutral[100], label: 'Expired' },
  renewed: { color: Colors.accent, bg: Colors.accentSurface, label: 'Renewed' },
};

const subStatusStyle = (status: string | null | undefined) =>
  (status && subStatusMeta[status]) ?? { color: Colors.textTertiary, bg: Colors.neutral[100], label: status ?? 'Unknown' };

export default function RiderAssignments() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const isWeb = Platform.OS === 'web';

  const [riderId, setRiderId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [attendanceCheckedIn, setAttendanceCheckedIn] = useState(false);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;

    if (!riderId) {
      const riderData = await resolveRider(profile.id, profile.mobile, 'id');

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
    const todayIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [{ data: assignData }, { data: attendanceData }] = await Promise.all([
      supabase
        .from('rider_order_assignments')
        .select('id, order_id, custom_order_id, status, assigned_at, accepted_at, picked_up_at, delivered_at, failed_at, failure_reason, delivery_fee, notes')
        .eq('rider_id', rId)
        .neq('status', 'reassigned')
        .order('assigned_at', { ascending: false }),
      supabase
        .from('rider_attendance')
        .select('status')
        .eq('rider_id', rId)
        .eq('date', todayIST)
        .maybeSingle(),
    ]);

    setAttendanceCheckedIn(attendanceData?.status === 'present');

    const rawAssignments: Assignment[] = (assignData ?? []) as Assignment[];

    const orderIds = rawAssignments.map((a) => a.order_id).filter(Boolean);
    let orderDetailsMap: Record<string, OrderDetail> = {};
    if (orderIds.length > 0) {
      const { data: ordersData } = await supabase
        .from('orders')
        .select('id, scheduled_date, user_id, subscription_id')
        .in('id', orderIds);

      const userIds = (ordersData ?? []).map((o: any) => o.user_id).filter(Boolean);
      const subIds = (ordersData ?? []).map((o: any) => o.subscription_id).filter(Boolean);

      const [profilesRes, subsRes] = await Promise.all([
        userIds.length > 0
          ? supabase.from('profiles').select('id, full_name, mobile').in('id', userIds)
          : Promise.resolve({ data: [] }),
        subIds.length > 0
          ? supabase.from('subscriptions').select('id, plan_id, delivery_address_id, status').in('id', subIds)
          : Promise.resolve({ data: [] }),
      ]);

      const planIds = (subsRes.data ?? []).map((s: any) => s.plan_id).filter(Boolean);
      const addrIds = (subsRes.data ?? []).map((s: any) => s.delivery_address_id).filter(Boolean);

      const [plansRes, addrsRes] = await Promise.all([
        planIds.length > 0
          ? supabase.from('subscription_plans').select('id, name').in('id', planIds)
          : Promise.resolve({ data: [] }),
        addrIds.length > 0
          ? supabase.from('addresses').select('id, label, street, city, state, pincode, apartment_name').in('id', addrIds)
          : Promise.resolve({ data: [] }),
      ]);

      const profileMap: Record<string, any> = {};
      (profilesRes.data ?? []).forEach((p: any) => { profileMap[p.id] = p; });
      const planMap: Record<string, any> = {};
      (plansRes.data ?? []).forEach((p: any) => { planMap[p.id] = p; });
      const addrMap: Record<string, any> = {};
      (addrsRes.data ?? []).forEach((a: any) => { addrMap[a.id] = a; });
      const subMap: Record<string, any> = {};
      (subsRes.data ?? []).forEach((s: any) => { subMap[s.id] = s; });

      (ordersData ?? []).forEach((o: any) => {
        const prof = profileMap[o.user_id];
        const sub = subMap[o.subscription_id];
        const plan = sub ? planMap[sub.plan_id] : null;
        const addr = sub ? addrMap[sub.delivery_address_id] : null;
        orderDetailsMap[o.id] = {
          id: o.id,
          order_type: 'subscription',
          scheduled_date: o.scheduled_date,
          customer_name: prof?.full_name ?? null,
          customer_mobile: prof?.mobile ?? null,
          plan_name: plan?.name ?? null,
          subscription_status: sub?.status ?? null,
          addr_label: addr?.label ?? null,
          addr_street: addr?.street ?? null,
          addr_city: addr?.city ?? null,
          addr_state: addr?.state ?? null,
          addr_pincode: addr?.pincode ?? null,
          addr_apartment: addr?.apartment_name ?? null,
        };
      });
    }

    // Fetch custom order details for assignments with custom_order_id
    const customOrderIds = rawAssignments.map((a) => a.custom_order_id).filter(Boolean) as string[];
    if (customOrderIds.length > 0) {
      const { data: customOrdersData } = await supabase
        .from('custom_orders')
        .select('id, user_id, order_type, delivery_date, delivery_time, address_id, status')
        .in('id', customOrderIds);

      const customUserIds = (customOrdersData ?? []).map((co: any) => co.user_id).filter(Boolean);
      const customAddrIds = (customOrdersData ?? []).map((co: any) => co.address_id).filter(Boolean);

      const [customProfilesRes, customAddrsRes] = await Promise.all([
        customUserIds.length > 0
          ? supabase.from('profiles').select('id, full_name, mobile').in('id', customUserIds)
          : Promise.resolve({ data: [] }),
        customAddrIds.length > 0
          ? supabase.from('addresses').select('id, label, street, city, state, pincode, apartment_name').in('id', customAddrIds)
          : Promise.resolve({ data: [] }),
      ]);

      const customProfileMap: Record<string, any> = {};
      (customProfilesRes.data ?? []).forEach((p: any) => { customProfileMap[p.id] = p; });
      const customAddrMap: Record<string, any> = {};
      (customAddrsRes.data ?? []).forEach((a: any) => { customAddrMap[a.id] = a; });

      (customOrdersData ?? []).forEach((co: any) => {
        const prof = customProfileMap[co.user_id];
        const addr = co.address_id ? customAddrMap[co.address_id] : null;
        orderDetailsMap[co.id] = {
          id: co.id,
          order_type: 'custom',
          scheduled_date: co.delivery_date ?? null,
          customer_name: prof?.full_name ?? null,
          customer_mobile: prof?.mobile ?? null,
          plan_name: co.order_type === 'garland' ? 'Custom Garlands' : 'Custom Flowers',
          subscription_status: co.status ?? null,
          addr_label: addr?.label ?? null,
          addr_street: addr?.street ?? null,
          addr_city: addr?.city ?? null,
          addr_state: addr?.state ?? null,
          addr_pincode: addr?.pincode ?? null,
          addr_apartment: addr?.apartment_name ?? null,
        };
      });
    }

    const seenOrderIds = new Set<string>();
    const enriched = rawAssignments
      .map((a) => {
        const key = a.custom_order_id ?? a.order_id;
        return { ...a, orderDetail: key ? orderDetailsMap[key] ?? undefined : undefined };
      })
      .filter((a) => {
        const key = a.custom_order_id ?? a.order_id;
        if (!key || seenOrderIds.has(key)) return false;
        seenOrderIds.add(key);
        return true;
      });

    setAssignments(enriched);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, [load]);

  const formatAddressFromDetail = (d?: OrderDetail) => {
    if (!d) return '—';
    const parts = [d.addr_apartment, d.addr_street, d.addr_city, d.addr_state, d.addr_pincode];
    return parts.filter(Boolean).join(', ') || '—';
  };

  const formatPickupTime = (pickedUpAt: string | null) => {
    if (!pickedUpAt) return 'Not recorded';
    return format(new Date(pickedUpAt), 'hh:mm a');
  };

  const callCustomer = async (phone: string | null | undefined) => {
    if (!phone) return;
    await Linking.openURL(`tel:${phone}`);
  };

  const getCurrentLocation = async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      if (Platform.OS === 'web') {
        return await new Promise((resolve) => {
          if (!('geolocation' in navigator)) { resolve(null); return; }
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
          );
        });
      }
      const Location = await import('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    } catch {
      return null;
    }
  };

  const deliverAssignment = async (assignment: Assignment) => {
    if (!attendanceCheckedIn || assignment.status === 'delivered') return;
    setDeliveringId(assignment.id);

    const coords = await getCurrentLocation();

    const update: Record<string, any> = {
      status: 'delivered',
      delivered_at: new Date().toISOString(),
    };
    if (coords) {
      update.delivery_latitude = coords.latitude;
      update.delivery_longitude = coords.longitude;
    }

    const { error } = await supabase
      .from('rider_order_assignments')
      .update(update)
      .eq('id', assignment.id)
      .eq('rider_id', riderId!);

    if (!error) {
      setAssignments((current) => current.map((item) =>
        item.id === assignment.id ? { ...item, status: 'delivered' as AssignmentStatus } : item
      ));
    }
    setDeliveringId(null);
  };

  const renderCard = (a: Assignment) => {
    const d = a.orderDetail;
    return (
      <TouchableOpacity
        key={a.id}
        style={mStyles.card}
        onPress={() => setSelectedAssignment(a)}
        activeOpacity={0.78}
      >
        <View style={mStyles.cardInner}>
          <View style={mStyles.cardTopRow}>
            <View style={[mStyles.cardIconWrap, { backgroundColor: Colors.primarySurface }]}>
              <User size={18} color={Colors.primary} strokeWidth={1.8} />
            </View>
            <View style={mStyles.cardInfo}>
              <View style={mStyles.cardNameRow}>
                <Text style={mStyles.cardCustomer} numberOfLines={1}>
                  {d?.customer_name ?? d?.customer_mobile ?? 'Unknown Customer'}
                </Text>
                <View style={[mStyles.orderTypeBadge, d?.order_type === 'custom' ? mStyles.orderTypeCustom : mStyles.orderTypeSub]}>
                  <Text style={[mStyles.orderTypeText, d?.order_type === 'custom' ? { color: Colors.accent } : { color: Colors.primary }]}>
                    {d?.order_type === 'custom' ? 'Customize' : 'Subscription'}
                  </Text>
                </View>
              </View>
              <Text style={mStyles.cardPlan} numberOfLines={1}>
                {d?.plan_name ?? 'Subscription Order'}
              </Text>
            </View>
            {(() => { const ss = subStatusStyle(d?.subscription_status); return (
              <View style={[mStyles.subStatusBadge, { backgroundColor: ss.bg }]}>
                <View style={[mStyles.subStatusDot, { backgroundColor: ss.color }]} />
                <Text style={[mStyles.subStatusText, { color: ss.color }]}>{ss.label}</Text>
              </View>
            ); })()}
          </View>

          <View style={mStyles.cardDivider} />

          <View style={mStyles.cardBody}>
            <View style={mStyles.cardDetailRow}>
              <MapPin size={13} color={Colors.textTertiary} strokeWidth={1.8} />
              <Text style={mStyles.cardDetailText} numberOfLines={2}>
                {formatAddressFromDetail(d)}
              </Text>
            </View>
            <View style={mStyles.pickupTimeRow}>
              <Clock size={13} color={Colors.primary} strokeWidth={1.8} />
              <Text style={mStyles.pickupTimeLabel}>Today's Pickup Time:</Text>
              <Text style={mStyles.pickupTimeValue}>{formatPickupTime(a.picked_up_at)}</Text>
            </View>
            <View style={mStyles.actionRow}>
              <TouchableOpacity
                style={[mStyles.callButton, !d?.customer_mobile && mStyles.callButtonDisabled]}
                onPress={() => callCustomer(d?.customer_mobile)}
                disabled={!d?.customer_mobile}
                activeOpacity={0.8}
              >
                <Phone size={15} color={Colors.white} strokeWidth={2.2} />
                <Text style={mStyles.callButtonText}>Call</Text>
              </TouchableOpacity>
              {a.status === 'delivered' ? (
                <View style={mStyles.deliveredBadge}>
                  <CheckCircle2 size={14} color={Colors.success} strokeWidth={2.2} />
                  <Text style={mStyles.deliveredBadgeText}>Delivered</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[mStyles.deliverButton, !attendanceCheckedIn && mStyles.deliverButtonDisabled]}
                  onPress={() => deliverAssignment(a)}
                  disabled={!attendanceCheckedIn || deliveringId === a.id}
                  activeOpacity={0.8}
                >
                  {deliveringId === a.id
                    ? <ActivityIndicator size="small" color={Colors.white} />
                    : <PackageCheck size={15} color={Colors.white} strokeWidth={2.2} />}
                  <Text style={mStyles.deliverButtonText}>
                    {attendanceCheckedIn ? 'Mark Delivered' : 'Mark attendance first'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderDetail = () => {
    if (!selectedAssignment) return null;
    const a = selectedAssignment;
    const d = a.orderDetail;

    return (
      <Modal transparent animationType="slide" visible={!!selectedAssignment}>
        <View style={mStyles.modalOverlay}>
          <Pressable style={mStyles.modalBackdrop} onPress={() => setSelectedAssignment(null)} />
          <View style={[mStyles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={mStyles.modalHandle} />
            <View style={mStyles.modalHeader}>
              <Text style={mStyles.modalTitle}>Assignment Details</Text>
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
                    <Text style={mStyles.detailValue}>{d?.customer_name ?? '—'}</Text>
                    {d?.customer_mobile && (
                      <Text style={mStyles.detailSub}>{d.customer_mobile}</Text>
                    )}
                  </View>
                </View>

                <View style={mStyles.detailRow}>
                  <View style={[mStyles.detailIconWrap, { backgroundColor: d?.order_type === 'custom' ? Colors.accentSurface : Colors.primarySurface }]}>
                    <PackageCheck size={16} color={d?.order_type === 'custom' ? Colors.accent : Colors.primary} strokeWidth={1.8} />
                  </View>
                  <View style={mStyles.detailContent}>
                    <Text style={mStyles.detailLabel}>Order Type</Text>
                    <Text style={mStyles.detailValue}>{d?.order_type === 'custom' ? 'Customize' : 'Subscription'}</Text>
                  </View>
                </View>

                <View style={mStyles.detailRow}>
                  <View style={[mStyles.detailIconWrap, { backgroundColor: Colors.warningSurface }]}>
                    <MapPin size={16} color={Colors.warning} strokeWidth={1.8} />
                  </View>
                  <View style={mStyles.detailContent}>
                    <Text style={mStyles.detailLabel}>Delivery Address</Text>
                    <Text style={mStyles.detailValue}>{formatAddressFromDetail(d)}</Text>
                  </View>
                </View>

                {d?.plan_name && (
                  <View style={mStyles.detailRow}>
                    <View style={[mStyles.detailIconWrap, { backgroundColor: Colors.accentSurface }]}>
                      <PackageCheck size={16} color={Colors.accent} strokeWidth={1.8} />
                    </View>
                    <View style={mStyles.detailContent}>
                      <Text style={mStyles.detailLabel}>Plan</Text>
                      <Text style={mStyles.detailValue}>{d.plan_name}</Text>
                      {d?.scheduled_date && (
                        <Text style={mStyles.detailSub}>Delivery: {format(new Date(d.scheduled_date + 'T00:00:00'), 'dd MMM yyyy')}</Text>
                      )}
                    </View>
                  </View>
                )}

                <View style={mStyles.detailRow}>
                  <View style={[mStyles.detailIconWrap, { backgroundColor: Colors.primarySurface }]}>
                    <Clock size={16} color={Colors.primary} strokeWidth={1.8} />
                  </View>
                  <View style={mStyles.detailContent}>
                    <Text style={mStyles.detailLabel}>Today's Pickup Time</Text>
                    <Text style={mStyles.detailValue}>{formatPickupTime(a.picked_up_at)}</Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

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
                <Truck size={22} color={ACCENT} strokeWidth={1.8} />
              </View>
              <View>
                <Text style={wStyles.headerEyebrow}>Rider Portal</Text>
                <Text style={wStyles.headerTitle}>Assignments</Text>
                <Text style={wStyles.headerDate}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
              </View>
            </View>
            {assignments.length > 0 && (
              <View style={wStyles.headerCountBadge}>
                <Text style={wStyles.headerCountText}>{assignments.length} {assignments.length === 1 ? 'order' : 'orders'}</Text>
              </View>
            )}
          </View>
        </LinearGradient>

        <View style={{ margin: 32, marginTop: 16 }}>
          {loading ? (
            <View style={wStyles.emptyState}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : assignments.length === 0 ? (
            <View style={wStyles.emptyState}>
              <PackageCheck size={32} color={Colors.textTertiary} strokeWidth={1.5} />
              <Text style={wStyles.emptyText}>No assignments found</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {assignments.map((a) => {
                const d = a.orderDetail;
                const name = d?.customer_name ?? d?.customer_mobile ?? 'Unknown Customer';
                return (
                  <View key={a.id} style={wStyles.deliveryCard}>
                    <View style={wStyles.deliveryCardTop}>
                      <View style={[wStyles.deliveryCardAvatar, { backgroundColor: Colors.primarySurface }]}>
                        <User size={16} color={Colors.primary} strokeWidth={1.8} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={wStyles.cardNameRow}>
                          <Text style={wStyles.deliveryCardName} numberOfLines={1}>{name}</Text>
                          <View style={[wStyles.orderTypeBadge, d?.order_type === 'custom' ? wStyles.orderTypeCustom : wStyles.orderTypeSub]}>
                            <Text style={[wStyles.orderTypeText, d?.order_type === 'custom' ? { color: Colors.accent } : { color: Colors.primary }]}>
                              {d?.order_type === 'custom' ? 'Customize' : 'Subscription'}
                            </Text>
                          </View>
                        </View>
                        <Text style={wStyles.deliveryCardPlan} numberOfLines={1}>{d?.plan_name ?? 'Subscription Order'}</Text>
                      </View>
                      {(() => { const ss = subStatusStyle(d?.subscription_status); return (
                        <View style={[wStyles.subStatusBadge, { backgroundColor: ss.bg }]}>
                          <View style={[wStyles.subStatusDot, { backgroundColor: ss.color }]} />
                          <Text style={[wStyles.subStatusText, { color: ss.color }]}>{ss.label}</Text>
                        </View>
                      ); })()}
                    </View>
                    <View style={wStyles.deliveryCardAddrRow}>
                      <MapPin size={12} color={Colors.textTertiary} strokeWidth={1.8} />
                      <Text style={wStyles.deliveryCardAddr} numberOfLines={1}>{formatAddressFromDetail(d)}</Text>
                    </View>
                    <View style={wStyles.pickupTimeRow}>
                      <Clock size={12} color={Colors.primary} strokeWidth={1.8} />
                      <Text style={wStyles.pickupTimeLabel}>Today's Pickup Time:</Text>
                      <Text style={wStyles.pickupTimeValue}>{formatPickupTime(a.picked_up_at)}</Text>
                    </View>
                    <View style={wStyles.actionRow}>
                      <TouchableOpacity
                        style={[wStyles.callButton, !d?.customer_mobile && wStyles.callButtonDisabled]}
                        onPress={() => callCustomer(d?.customer_mobile)}
                        disabled={!d?.customer_mobile}
                        activeOpacity={0.8}
                      >
                        <Phone size={15} color={Colors.white} strokeWidth={2.2} />
                        <Text style={wStyles.callButtonText}>Call</Text>
                      </TouchableOpacity>
                      {a.status === 'delivered' ? (
                        <View style={wStyles.deliveredBadge}>
                          <CheckCircle2 size={14} color={Colors.success} strokeWidth={2.2} />
                          <Text style={wStyles.deliveredBadgeText}>Delivered</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[wStyles.deliverButton, !attendanceCheckedIn && wStyles.deliverButtonDisabled]}
                          onPress={() => deliverAssignment(a)}
                          disabled={!attendanceCheckedIn || deliveringId === a.id}
                          activeOpacity={0.8}
                        >
                          {deliveringId === a.id
                            ? <ActivityIndicator size="small" color={Colors.white} />
                            : <PackageCheck size={15} color={Colors.white} strokeWidth={2.2} />}
                          <Text style={wStyles.deliverButtonText}>
                            {attendanceCheckedIn ? 'Mark Delivered' : 'Mark attendance first'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
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
              <Truck size={18} color={ACCENT} strokeWidth={1.8} />
            </View>
            <View>
              <Text style={mStyles.headerEyebrow}>Rider Portal</Text>
              <Text style={mStyles.headerTitle}>Assignments</Text>
              <Text style={mStyles.headerDate}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
            </View>
          </View>
          {assignments.length > 0 && (
            <View style={mStyles.headerCountPill}>
              <Text style={mStyles.headerCountText}>{assignments.length}</Text>
            </View>
          )}
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[mStyles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading && (
          <View style={mStyles.loadingState}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        )}
        {!loading && assignments.length === 0 && (
          <View style={mStyles.emptyState}>
            <PackageCheck size={36} color={Colors.textTertiary} strokeWidth={1.5} />
            <Text style={mStyles.emptyTitle}>No assignments</Text>
            <Text style={mStyles.emptyText}>You have no delivery assignments yet.</Text>
          </View>
        )}
        {!loading && assignments.map(renderCard)}
      </ScrollView>

      {renderDetail()}
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
  headerCountPill: {
    minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  headerCountText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: '#FFFFFF',
  },
  scrollContent: { padding: Spacing[4], gap: Spacing[3] },
  loadingState: { paddingVertical: 60, alignItems: 'center' },
  card: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
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
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  orderTypeBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.full, flexShrink: 0,
  },
  orderTypeSub: { backgroundColor: Colors.primarySurface },
  orderTypeCustom: { backgroundColor: Colors.accentSurface },
  orderTypeText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10,
  },
  cardCustomer: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  cardPlan: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  cardDivider: { height: 1, backgroundColor: Colors.divider, marginHorizontal: Spacing[4] },
  cardBody: { padding: Spacing[4], gap: Spacing[2] },
  actionRow: { flexDirection: 'row', gap: Spacing[2], marginTop: Spacing[1] },
  callButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.success, borderRadius: Radius.md, paddingVertical: 11, paddingHorizontal: 16,
  },
  callButtonDisabled: { backgroundColor: Colors.neutral[300] },
  callButtonText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white,
  },
  cardDetailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2] },
  pickupTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing[1] },
  pickupTimeLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  pickupTimeValue: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textPrimary },
  cardDetailText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm, color: Colors.textSecondary, flex: 1, lineHeight: 20,
  },
  deliverButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.success, borderRadius: Radius.md, paddingVertical: 11, flex: 1,
  },
  deliverButtonDisabled: { backgroundColor: Colors.neutral[300] },
  deliverButtonText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white,
  },
  deliveredBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: Radius.full, backgroundColor: Colors.successSurface,
  },
  deliveredBadgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.success,
  },
  subStatusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, flexShrink: 0,
  },
  subStatusDot: { width: 7, height: 7, borderRadius: 4 },
  subStatusText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11,
  },
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
});

const wStyles = StyleSheet.create({
  content: { paddingBottom: 64, gap: 0 },
  gradientHeader: { paddingBottom: 0 },
  headerInner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 32, paddingTop: 32, paddingBottom: 20,
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
  headerCountBadge: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerCountText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: 'rgba(255,255,255,0.9)',
  },
  emptyState: { paddingVertical: 40, alignItems: 'center', gap: 10 },
  emptyText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
  },
  deliveryCard: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 10,
  },
  deliveryCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  deliveryCardAvatar: {
    width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  deliveryCardName: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  orderTypeBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.full, flexShrink: 0,
  },
  orderTypeSub: { backgroundColor: Colors.primarySurface },
  orderTypeCustom: { backgroundColor: Colors.accentSurface },
  orderTypeText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10,
  },
  deliveryCardPlan: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  subStatusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, flexShrink: 0,
  },
  subStatusDot: { width: 7, height: 7, borderRadius: 4 },
  subStatusText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11,
  },
  deliveryCardAddrRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deliveryCardAddr: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, flex: 1,
  },
  pickupTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  pickupTimeLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  pickupTimeValue: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textPrimary },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  callButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.success, borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: 16,
    cursor: 'pointer' as any,
  },
  callButtonDisabled: { backgroundColor: Colors.neutral[300], cursor: 'not-allowed' as any },
  callButtonText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white,
  },
  deliverButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.success, borderRadius: Radius.md, paddingVertical: 10, flex: 1,
    cursor: 'pointer' as any,
  },
  deliverButtonDisabled: { backgroundColor: Colors.neutral[300] },
  deliverButtonText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white,
  },
  deliveredBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: Radius.full, backgroundColor: Colors.successSurface,
  },
  deliveredBadgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.success,
  },
});
