import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  ActivityIndicator,
  Linking,
  TextInput,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PackageCheck, MapPin, Phone, Clock, CircleCheck as CheckCircle2, Package, Sparkles, ShoppingBag, ChevronDown, Flower2, Camera } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format } from 'date-fns';
import { resolveRider } from '@/utils/riderLookup';
import PhotoUploadField from '@/components/ui/PhotoUploadField';
import { usePageVisibility } from '@/hooks/usePageVisibility';

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
  per_day_price: number | null;
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
  delivery_sequence: number | null;
  auto_assigned: boolean | null;
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

const subStatusStyle = (status: string | null | undefined): { color: string; bg: string; label: string } => {
  const fallback = { color: Colors.textTertiary, bg: Colors.neutral[100], label: status ?? 'Unknown' };
  return status ? (subStatusMeta[status] ?? fallback) : fallback;
};

export default function RiderAssignments() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const isWeb = Platform.OS === 'web';

  const [riderId, setRiderId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [attendanceCheckedIn, setAttendanceCheckedIn] = useState(false);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [deliveryDeadlineTime, setDeliveryDeadlineTime] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'subscription' | 'custom'>('subscription');
  const [pickupCutoffTime, setPickupCutoffTime] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [pickingUpAll, setPickingUpAll] = useState(false);
  const [showQualityModal, setShowQualityModal] = useState(false);
  const [qualityNotes, setQualityNotes] = useState('');
  const [qualityPhoto, setQualityPhoto] = useState<string | null>(null);
  const [submittingQuality, setSubmittingQuality] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

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
      const { data: deadline } = await supabase.rpc('get_delivery_deadline_time');
      setDeliveryDeadlineTime(deadline ?? null);
      const { data: cutoff } = await supabase.rpc('get_pickup_cutoff_time');
      setPickupCutoffTime(cutoff ?? null);
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
        .select('id, order_id, custom_order_id, status, assigned_at, accepted_at, picked_up_at, delivered_at, failed_at, failure_reason, delivery_fee, notes, delivery_sequence, auto_assigned')
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
          ? supabase.from('subscription_plans').select('id, name, per_day_price').in('id', planIds)
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
          per_day_price: plan?.per_day_price ?? null,
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
          per_day_price: null,
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
      })
      .sort((a, b) => {
        const aSeq = a.delivery_sequence ?? 9999;
        const bSeq = b.delivery_sequence ?? 9999;
        if (aSeq !== bSeq) return aSeq - bSeq;
        return new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime();
      });

    setAssignments(enriched);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, [load]);

  usePageVisibility(() => {
    if (riderId) {
      fetchAssignments(riderId);
    } else {
      load();
    }
  });

  useEffect(() => {
    if (!riderId) return;

    const channel = supabase
      .channel(`rider-assignments-${riderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rider_order_assignments',
          filter: `rider_id=eq.${riderId}`,
        },
        () => {
          fetchAssignments(riderId);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [riderId]);

  const submitQualityReport = async () => {
    if (!riderId) return;
    setSubmittingQuality(true);
    try {
      const { error } = await supabase.from('rider_quality_reports').insert({
        rider_id: riderId,
        photo_url: qualityPhoto,
        notes: qualityNotes.trim(),
        status: 'pending',
      });
      if (error) throw error;
      setShowQualityModal(false);
      Alert.alert('Submitted', 'Your flower quality report has been submitted.');
    } catch (e) {
      Alert.alert('Error', 'Could not submit report. Please try again.');
    } finally {
      setSubmittingQuality(false);
    }
  };

  const renderQualityButton = () => (
    <TouchableOpacity
      style={qualityStyles.button}
      onPress={() => { setQualityNotes(''); setQualityPhoto(null); setShowQualityModal(true); }}
      activeOpacity={0.8}
    >
      <Flower2 size={14} color={Colors.warning} strokeWidth={1.8} />
      <Text style={qualityStyles.buttonText}>Report Flower Quality</Text>
    </TouchableOpacity>
  );

  const renderQualityModal = () => (
    showQualityModal ? (
      <View style={qualityStyles.overlay}>
        <View style={qualityStyles.modal}>
          <View style={qualityStyles.modalHeader}>
            <Text style={qualityStyles.modalTitle}>Report Flower Quality</Text>
            <TouchableOpacity onPress={() => setShowQualityModal(false)}><Text style={qualityStyles.closeText}>✕</Text></TouchableOpacity>
          </View>
          <PhotoUploadField label="Photo" value={qualityPhoto} onChange={setQualityPhoto} storagePath={`${profile?.id ?? 'unknown'}/quality-reports/${Date.now()}`} bucket="riders" aspectRatio={[4, 3]} hint="Take a photo of the poor quality flowers" />
          <View style={{ gap: 6 }}>
            <Text style={qualityStyles.notesLabel}>Notes (optional)</Text>
            <TextInput style={qualityStyles.notesInput} value={qualityNotes} onChangeText={setQualityNotes} placeholder="Describe the issue..." placeholderTextColor={Colors.textDisabled} multiline />
          </View>
          <TouchableOpacity style={qualityStyles.submitBtn} onPress={submitQualityReport} disabled={submittingQuality} activeOpacity={0.8}>
            {submittingQuality ? <ActivityIndicator size="small" color={Colors.white} /> : <Camera size={16} color={Colors.white} strokeWidth={2} />}
            <Text style={qualityStyles.submitText}>{submittingQuality ? 'Submitting...' : 'Submit Report'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    ) : null
  );

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

  const openInMaps = (d?: OrderDetail) => {
    if (!d) return;
    const addr = formatAddressFromDetail(d);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`);
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

  const formatDeadlineAMPM = (raw: string): string => {
    const clean = raw.slice(0, 5);
    const [h, m] = clean.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
  };

  const isDeadlinePassed = (): boolean => {
    if (!deliveryDeadlineTime) return false;
    const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const [dh, dm] = deliveryDeadlineTime.split(':').map(Number);
    const deadlineMinutes = dh * 60 + dm;
    const nowMinutes = nowIST.getUTCHours() * 60 + nowIST.getUTCMinutes();
    return nowMinutes > deadlineMinutes;
  };

  const isDeliveredToday = (assignment: Assignment): boolean => {
    if (assignment.status !== 'delivered' || !assignment.delivered_at) return false;
    const todayIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const deliveredIST = new Date(new Date(assignment.delivered_at).getTime() + 5.5 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    return deliveredIST === todayIST;
  };

  const deliverAssignment = async (assignment: Assignment) => {
    if (isDeliveredToday(assignment)) return;
    if (!assignment.picked_up_at) {
      setDeliveryError('Pick up this order before marking it delivered.');
      return;
    }
    setDeliveryError(null);

    if (isDeadlinePassed()) {
      setDeliveryError(`Delivery deadline (${formatDeadlineAMPM(deliveryDeadlineTime!)} IST) has passed. You can no longer mark deliveries today.`);
      return;
    }

    setDeliveringId(assignment.id);

    const coords = await getCurrentLocation();
    if (!coords) {
      setDeliveryError('Could not detect your location. Enable GPS and try again.');
      setDeliveringId(null);
      return;
    }

    const update: Record<string, any> = {
      status: 'delivered',
      delivered_at: new Date().toISOString(),
    };
    update.delivery_latitude = coords.latitude;
    update.delivery_longitude = coords.longitude;

    const { error } = await supabase
      .from('rider_order_assignments')
      .update(update)
      .eq('id', assignment.id)
      .eq('rider_id', riderId!);

    if (error) {
      const msg = error.message || '';
      if (msg.includes('deadline') || msg.includes('check_violation')) {
        setDeliveryError(`Delivery deadline (${deliveryDeadlineTime ? formatDeadlineAMPM(deliveryDeadlineTime) : ''} IST) has passed. You can no longer mark deliveries today.`);
      } else {
        setDeliveryError('Could not update this delivery. Please try again.');
      }
    } else {
      setAssignments((current) => current.map((item) =>
        item.id === assignment.id ? { ...item, status: 'delivered' as AssignmentStatus, delivered_at: update.delivered_at } : item
      ));
    }
    setDeliveringId(null);
  };

  const isPickupCutoffPassed = (): boolean => {
    if (!pickupCutoffTime) return false;
    const nowIST = new Date(nowTick + 5.5 * 60 * 60 * 1000);
    const [hours, minutes] = pickupCutoffTime.split(':').map(Number);
    const nowMinutes = nowIST.getUTCHours() * 60 + nowIST.getUTCMinutes();
    return nowMinutes >= hours * 60 + minutes;
  };

  const subAssignments = assignments.filter((a) => a.orderDetail?.order_type === 'subscription');
  const customAssignments = assignments.filter((a) => a.orderDetail?.order_type === 'custom');

  const renderSummary = () => {
    if (assignments.length === 0) return null;

    const priceGroups: Record<number, number> = {};
    for (const a of subAssignments) {
      const price = a.orderDetail?.per_day_price ?? 0;
      priceGroups[price] = (priceGroups[price] ?? 0) + 1;
    }
    const priceEntries = Object.entries(priceGroups).sort((a, b) => Number(a[0]) - Number(b[0]));
    const customCount = customAssignments.length;

    const formatRupee = (paise: number) => {
      const r = paise / 100;
      return r % 1 === 0 ? r.toString() : r.toFixed(2);
    };

    return (
      <View style={isWeb ? wStyles.summaryContainer : mStyles.summaryContainer}>
        <Text style={isWeb ? wStyles.summaryTitle : mStyles.summaryTitle}>Today's Order Summary</Text>
        <View style={isWeb ? wStyles.summaryBadges : mStyles.summaryBadges}>
          {priceEntries.map(([price, count]) => (
            <View key={price} style={isWeb ? wStyles.summaryBadge : mStyles.summaryBadge}>
              <Text style={isWeb ? wStyles.summaryBadgePrice : mStyles.summaryBadgePrice}>₹{formatRupee(Number(price))}</Text>
              <Text style={isWeb ? wStyles.summaryBadgeSep : mStyles.summaryBadgeSep}>:</Text>
              <Text style={isWeb ? wStyles.summaryBadgeCount : mStyles.summaryBadgeCount}>{count}</Text>
            </View>
          ))}
          {customCount > 0 && (
            <View style={[isWeb ? wStyles.summaryBadge : mStyles.summaryBadge, isWeb ? wStyles.summaryBadgeCustom : mStyles.summaryBadgeCustom]}>
              <Text style={[isWeb ? wStyles.summaryBadgePrice : mStyles.summaryBadgePrice, { color: Colors.accent }]}>Customize</Text>
              <Text style={isWeb ? wStyles.summaryBadgeSep : mStyles.summaryBadgeSep}>:</Text>
              <Text style={[isWeb ? wStyles.summaryBadgeCount : mStyles.summaryBadgeCount, { color: Colors.accent }]}>{customCount}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const handlePickUpAll = async (tab: 'subscription' | 'custom') => {
    if (isPickupCutoffPassed() || !attendanceCheckedIn) return;
    const list = tab === 'subscription' ? subAssignments : customAssignments;
    const pendingIds = list.filter((a) => !a.picked_up_at).map((a) => a.id);
    if (pendingIds.length === 0) return;
    setPickingUpAll(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('rider_order_assignments')
      .update({ picked_up_at: now })
      .in('id', pendingIds)
      .eq('rider_id', riderId!);
    if (!error) {
      setAssignments((prev) => prev.map((a) =>
        pendingIds.includes(a.id) ? { ...a, picked_up_at: now } : a
      ));
    }
    setPickingUpAll(false);
  };

  const renderCard = (a: Assignment) => {
    const d = a.orderDetail;
    const expanded = expandedId === a.id;
    return (
      <View key={a.id} style={mStyles.card}>
        <View style={mStyles.cardInner}>
          <TouchableOpacity
            style={mStyles.cardPressArea}
            onPress={() => setExpandedId(expanded ? null : a.id)}
            activeOpacity={0.78}
          >
            {expanded && (
              <>
                <View style={mStyles.cardTopRow}>
                {a.delivery_sequence != null && (
                  <View style={mStyles.seqBadge}>
                    <Text style={mStyles.seqBadgeText}>{a.delivery_sequence}</Text>
                  </View>
                )}
                <View style={mStyles.cardInfo}>
                  <View style={mStyles.cardNameRow}>
                    <Text style={mStyles.cardCustomer} numberOfLines={1}>
                      {d?.customer_name ? d.customer_name.split(' ')[0] : (d?.customer_mobile ?? 'Customer')}
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
              </>
            )}

          <View style={mStyles.cardBody}>
            <View style={mStyles.cardDetailRow}>
              <MapPin size={13} color={Colors.textTertiary} strokeWidth={1.8} />
              <Text style={mStyles.cardDetailText}>
                {formatAddressFromDetail(d)}
              </Text>
              {!expanded && (
                <View style={[mStyles.chevronWrap, expanded && mStyles.chevronExpanded]}>
                  <ChevronDown size={18} color={Colors.textTertiary} strokeWidth={2} />
                </View>
              )}
            </View>
            {expanded && (
              <View style={mStyles.pickupTimeRow}>
                <Clock size={13} color={Colors.primary} strokeWidth={1.8} />
                <Text style={mStyles.pickupTimeLabel}>Today's Pickup Time:</Text>
                <Text style={mStyles.pickupTimeValue}>{formatPickupTime(a.picked_up_at)}</Text>
              </View>
            )}
            {expanded && deliveryDeadlineTime && (
              <View style={[mStyles.pickupTimeRow, { marginTop: 2 }]}>
                <Clock size={13} color={isDeadlinePassed() ? Colors.error : Colors.warning} strokeWidth={1.8} />
                <Text style={mStyles.pickupTimeLabel}>Delivery Deadline:</Text>
                <Text style={[mStyles.pickupTimeValue, { color: isDeadlinePassed() ? Colors.error : Colors.warning }]}>{formatDeadlineAMPM(deliveryDeadlineTime)} IST</Text>
              </View>
            )}
          </View>
          </TouchableOpacity>
          <View style={mStyles.actionRow}>
            {expanded && (
              <>
                <TouchableOpacity
                  style={[mStyles.callButton, !d?.customer_mobile && mStyles.callButtonDisabled]}
                  onPress={() => callCustomer(d?.customer_mobile)}
                  disabled={!d?.customer_mobile}
                  activeOpacity={0.8}
                >
                  <Phone size={15} color={Colors.white} strokeWidth={2.2} />
                  <Text style={mStyles.callButtonText}>Call</Text>
                </TouchableOpacity>
                <TouchableOpacity style={mStyles.addressButton} onPress={() => openInMaps(d)} activeOpacity={0.8}>
                  <MapPin size={15} color={Colors.white} strokeWidth={2.2} />
                  <Text style={mStyles.callButtonText}>Address</Text>
                </TouchableOpacity>
              </>
            )}
            {isDeliveredToday(a) ? (
              <View style={mStyles.deliveredBadge}>
                <CheckCircle2 size={14} color={Colors.success} strokeWidth={2.2} />
                <Text style={mStyles.deliveredBadgeText}>Delivered</Text>
              </View>
            ) : !a.picked_up_at ? (
              <View style={[mStyles.deliverButton, mStyles.deliverButtonDisabled]}>
                <PackageCheck size={15} color={Colors.white} strokeWidth={2.2} />
                <Text style={mStyles.deliverButtonText}>Pick Up First</Text>
              </View>
            ) : isDeadlinePassed() ? (
              <View style={[mStyles.deliverButton, mStyles.deliverButtonDisabled]}>
                <PackageCheck size={15} color={Colors.white} strokeWidth={2.2} />
                <Text style={mStyles.deliverButtonText}>Deadline Passed</Text>
              </View>
            ) : (
              <TouchableOpacity style={mStyles.deliverButton} onPress={() => deliverAssignment(a)} disabled={deliveringId === a.id} activeOpacity={0.8}>
                {deliveringId === a.id ? <ActivityIndicator size="small" color={Colors.white} /> : <PackageCheck size={15} color={Colors.white} strokeWidth={2.2} />}
                <Text style={mStyles.deliverButtonText}>Deliver</Text>
              </TouchableOpacity>
            )}
          </View>
          </View>
        </View>
    );
  };

  const renderPickupButton = () => {
    const tabList = activeTab === 'subscription' ? subAssignments : customAssignments;
    const pendingCount = tabList.filter((a) => !a.picked_up_at).length;
    const allPickedUp = tabList.length > 0 && pendingCount === 0;
    const pickupCutoffPassed = isPickupCutoffPassed();

    if (tabList.length === 0) return null;

    return (
      <TouchableOpacity
        style={[
          isWeb ? wStyles.pickUpAllBtn : mStyles.pickUpAllBtn,
          (!attendanceCheckedIn || pickingUpAll || allPickedUp || pickupCutoffPassed) && (isWeb ? wStyles.pickUpAllBtnDisabled : mStyles.pickUpAllBtnDisabled),
        ]}
        onPress={() => handlePickUpAll(activeTab)}
        disabled={pickingUpAll || allPickedUp || !attendanceCheckedIn || pickupCutoffPassed}
        activeOpacity={0.8}
      >
        {pickingUpAll
          ? <ActivityIndicator size="small" color={Colors.white} />
          : <ShoppingBag size={isWeb ? 14 : 14} color={Colors.white} strokeWidth={2} />}
        <Text style={isWeb ? wStyles.pickUpAllBtnText : mStyles.pickUpAllBtnText}>
          {pickingUpAll ? 'Picking Up...' : allPickedUp ? 'Picked Up' : pickupCutoffPassed ? 'Pickup Closed' : !attendanceCheckedIn ? 'Mark Present' : 'Pick Up'}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderTabs = () => {
    const subCount = subAssignments.length;
    const customCount = customAssignments.length;

    return (
      <View style={isWeb ? wStyles.tabsContainer : mStyles.tabsContainer}>
        <View style={isWeb ? wStyles.tabBar : mStyles.tabBar}>
          <TouchableOpacity
            style={[isWeb ? wStyles.tabBtn : mStyles.tabBtn, activeTab === 'subscription' && (isWeb ? wStyles.tabBtnActive : mStyles.tabBtnActive)]}
            onPress={() => { setActiveTab('subscription'); setExpandedId(null); }}
            activeOpacity={0.7}
          >
            <Package size={isWeb ? 16 : 14} color={activeTab === 'subscription' ? Colors.primary : Colors.textTertiary} strokeWidth={1.8} />
            <Text style={[isWeb ? wStyles.tabBtnText : mStyles.tabBtnText, { color: activeTab === 'subscription' ? Colors.primary : Colors.textTertiary }]}>
              Subscription Orders
            </Text>
            <View style={[isWeb ? wStyles.tabCountBadge : mStyles.tabCountBadge, { backgroundColor: activeTab === 'subscription' ? Colors.primarySurface : Colors.neutral[100] }]}>
              <Text style={[isWeb ? wStyles.tabCountText : mStyles.tabCountText, { color: activeTab === 'subscription' ? Colors.primary : Colors.textTertiary }]}>{subCount}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[isWeb ? wStyles.tabBtn : mStyles.tabBtn, activeTab === 'custom' && (isWeb ? wStyles.tabBtnActive : mStyles.tabBtnActive)]}
            onPress={() => { setActiveTab('custom'); setExpandedId(null); }}
            activeOpacity={0.7}
          >
            <Sparkles size={isWeb ? 16 : 14} color={activeTab === 'custom' ? Colors.primary : Colors.textTertiary} strokeWidth={1.8} />
            <Text style={[isWeb ? wStyles.tabBtnText : mStyles.tabBtnText, { color: activeTab === 'custom' ? Colors.primary : Colors.textTertiary }]}>
              Customize Orders
            </Text>
            <View style={[isWeb ? wStyles.tabCountBadge : mStyles.tabCountBadge, { backgroundColor: activeTab === 'custom' ? Colors.primarySurface : Colors.neutral[100] }]}>
              <Text style={[isWeb ? wStyles.tabCountText : mStyles.tabCountText, { color: activeTab === 'custom' ? Colors.primary : Colors.textTertiary }]}>{customCount}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (isWeb) {
    return (
      <>
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
            <Text style={wStyles.headerTitle}>Pickup Count: {subAssignments.length + customAssignments.length}</Text>
            <View style={wStyles.headerActions}>
              {renderPickupButton()}
            </View>
          </View>
          {renderSummary()}
        </LinearGradient>

        <View style={{ margin: 32, marginTop: 16 }}>
          {deliveryError && (
            <View style={wStyles.deliveryErrorBanner}>
              <Text style={wStyles.deliveryErrorText}>{deliveryError}</Text>
            </View>
          )}
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
            <>
              {renderQualityButton()}
              {renderTabs()}
              <View style={{ gap: 10, marginTop: 16 }}>
                {(activeTab === 'subscription' ? subAssignments : customAssignments).map((a) => {
                const d = a.orderDetail;
                const name = d?.customer_name ? d.customer_name.split(' ')[0] : (d?.customer_mobile ?? 'Customer');
                const expanded = expandedId === a.id;
                return (
                  <View key={a.id} style={wStyles.deliveryCard}>
                    <TouchableOpacity activeOpacity={0.78} onPress={() => setExpandedId(expanded ? null : a.id)}>
                    {expanded && (
                      <View style={wStyles.deliveryCardTop}>
                      {a.delivery_sequence != null && (
                        <View style={wStyles.seqBadge}>
                          <Text style={wStyles.seqBadgeText}>{a.delivery_sequence}</Text>
                        </View>
                      )}
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
                      <View style={[wStyles.chevronWrap, expanded && wStyles.chevronExpanded]}>
                        <ChevronDown size={16} color={Colors.textTertiary} strokeWidth={2} />
                      </View>
                      </View>
                    )}
                    <View style={wStyles.deliveryCardAddrRow}>
                      <MapPin size={12} color={Colors.textTertiary} strokeWidth={1.8} />
                      <Text style={wStyles.deliveryCardAddr}>{formatAddressFromDetail(d)}</Text>
                    </View>
                    {expanded && (
                      <View style={wStyles.pickupTimeRow}>
                        <Clock size={12} color={Colors.primary} strokeWidth={1.8} />
                        <Text style={wStyles.pickupTimeLabel}>Today's Pickup Time:</Text>
                        <Text style={wStyles.pickupTimeValue}>{formatPickupTime(a.picked_up_at)}</Text>
                      </View>
                    )}
                    {expanded && deliveryDeadlineTime && (
                      <View style={wStyles.pickupTimeRow}>
                        <Clock size={12} color={isDeadlinePassed() ? Colors.error : Colors.warning} strokeWidth={1.8} />
                        <Text style={wStyles.pickupTimeLabel}>Delivery Deadline:</Text>
                        <Text style={[wStyles.pickupTimeValue, { color: isDeadlinePassed() ? Colors.error : Colors.warning }]}>{formatDeadlineAMPM(deliveryDeadlineTime)} IST</Text>
                      </View>
                    )}
                    </TouchableOpacity>
                    <View style={wStyles.actionRow}>
                      {expanded && (
                        <>
                          <TouchableOpacity style={[wStyles.callButton, !d?.customer_mobile && wStyles.callButtonDisabled]} onPress={() => callCustomer(d?.customer_mobile)} disabled={!d?.customer_mobile} activeOpacity={0.8}>
                            <Phone size={15} color={Colors.white} strokeWidth={2.2} />
                            <Text style={wStyles.callButtonText}>Call</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={wStyles.addressButton} onPress={() => openInMaps(d)} activeOpacity={0.8}>
                            <MapPin size={15} color={Colors.white} strokeWidth={2.2} />
                            <Text style={wStyles.callButtonText}>Address</Text>
                          </TouchableOpacity>
                        </>
                      )}
                      {isDeliveredToday(a) ? (
                        <View style={wStyles.deliveredBadge}>
                          <CheckCircle2 size={14} color={Colors.success} strokeWidth={2.2} />
                          <Text style={wStyles.deliveredBadgeText}>Delivered</Text>
                        </View>
                      ) : !a.picked_up_at ? (
                        <View style={[wStyles.deliverButton, wStyles.deliverButtonDisabled]}>
                          <PackageCheck size={15} color={Colors.white} strokeWidth={2.2} />
                          <Text style={wStyles.deliverButtonText}>Pick Up First</Text>
                        </View>
                      ) : isDeadlinePassed() ? (
                        <View style={[wStyles.deliverButton, wStyles.deliverButtonDisabled]}>
                          <PackageCheck size={15} color={Colors.white} strokeWidth={2.2} />
                          <Text style={wStyles.deliverButtonText}>Deadline Passed</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={wStyles.deliverButton}
                          onPress={() => deliverAssignment(a)}
                          disabled={deliveringId === a.id}
                          activeOpacity={0.8}
                        >
                          {deliveringId === a.id
                            ? <ActivityIndicator size="small" color={Colors.white} />
                            : <PackageCheck size={15} color={Colors.white} strokeWidth={2.2} />}
                          <Text style={wStyles.deliverButtonText}>Deliver</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
            </>
          )}
        </View>
      </ScrollView>
      {renderQualityModal()}
      </>
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
          <Text style={mStyles.headerTitle}>Pickup Count: {subAssignments.length + customAssignments.length}</Text>
          <View style={mStyles.headerActions}>
            {renderPickupButton()}
          </View>
        </View>
        {renderSummary()}
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[mStyles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {deliveryError && (
          <View style={mStyles.deliveryErrorBanner}>
            <Text style={mStyles.deliveryErrorText}>{deliveryError}</Text>
          </View>
        )}
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
        {!loading && assignments.length > 0 && renderQualityButton()}
        {!loading && assignments.length > 0 && renderTabs()}
        {!loading && (activeTab === 'subscription' ? subAssignments : customAssignments).map(renderCard)}
      </ScrollView>
      {renderQualityModal()}
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
  headerTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'], color: '#FFFFFF', letterSpacing: -0.3,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  tabsContainer: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  tabBar: { flexDirection: 'row', gap: Spacing[2], padding: 4 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: Radius.md },
  tabBtnActive: { backgroundColor: Colors.primarySurface },
  tabBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs },
  tabCountBadge: { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  tabCountText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10 },
  pickUpAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#0891b2', borderRadius: Radius.md, paddingVertical: 7, paddingHorizontal: 10, maxWidth: 132 },
  pickUpAllBtnDisabled: { backgroundColor: Colors.neutral[300], opacity: 0.8 },
  pickUpAllBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.white },
  scrollContent: { padding: Spacing[4], gap: Spacing[3] },
  loadingState: { paddingVertical: 60, alignItems: 'center' },
  card: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  cardInner: { flex: 1 },
  cardPressArea: { paddingBottom: Spacing[1] },
  cardTopRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[4], paddingTop: Spacing[4], paddingBottom: Spacing[3],
    gap: Spacing[3],
  },
  cardIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  seqBadge: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  seqBadgeText: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.white,
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
  addressButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.warning, borderRadius: Radius.md, paddingVertical: 11, paddingHorizontal: 16,
  },
  chevronWrap: { flexShrink: 0, marginLeft: 4 },
  chevronExpanded: { transform: [{ rotate: '180deg' }] },
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
  deliveryErrorBanner: {
    backgroundColor: Colors.errorSurface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  deliveryErrorText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.error,
  },
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
  summaryContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', padding: Spacing[3],
  },
  summaryTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs,
    color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: Spacing[2],
  },
  summaryBadges: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  summaryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  summaryBadgeCustom: {
    backgroundColor: 'rgba(58,175,228,0.25)',
  },
  summaryBadgePrice: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs,
    color: '#FFFFFF',
  },
  summaryBadgeSep: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs,
    color: 'rgba(255,255,255,0.6)',
  },
  summaryBadgeCount: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs,
    color: '#FFFFFF',
  },
  emptyState: { paddingVertical: 60, alignItems: 'center', gap: Spacing[3] },
  emptyTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary,
  },
  emptyText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
    textAlign: 'center',
  },
});

const wStyles = StyleSheet.create({
  content: { paddingBottom: 64, gap: 0 },
  gradientHeader: {
    paddingHorizontal: 32, paddingTop: 32, paddingBottom: 20, gap: 16,
  },
  headerInner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold, fontSize: 30,
    color: '#FFFFFF', letterSpacing: -0.5,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tabsContainer: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  tabBar: { flexDirection: 'row', gap: 10, padding: 6 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Radius.md, cursor: 'pointer' as any },
  tabBtnActive: { backgroundColor: Colors.primarySurface },
  tabBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm },
  tabCountBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  tabCountText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  pickUpAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#0891b2', borderRadius: Radius.md, paddingVertical: 8, paddingHorizontal: 12, maxWidth: 150, cursor: 'pointer' as any },
  pickUpAllBtnDisabled: { backgroundColor: Colors.neutral[300], cursor: 'not-allowed' as any, opacity: 0.8 },
  pickUpAllBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 12, color: Colors.white },
  summaryContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', padding: 16,
  },
  summaryTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11,
    color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 12,
  },
  summaryBadges: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  summaryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  summaryBadgeCustom: {
    backgroundColor: 'rgba(58,175,228,0.25)',
  },
  summaryBadgePrice: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm,
    color: '#FFFFFF',
  },
  summaryBadgeSep: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.6)',
  },
  summaryBadgeCount: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm,
    color: '#FFFFFF',
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
  seqBadge: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  seqBadgeText: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm, color: Colors.white,
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
  deliveryCardAddrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  deliveryCardAddr: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, flex: 1, lineHeight: 20,
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
  addressButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.warning, borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: 16,
    cursor: 'pointer' as any,
  },
  chevronWrap: { flexShrink: 0, marginLeft: 6 },
  chevronExpanded: { transform: [{ rotate: '180deg' }] },
  callButtonText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white,
  },
  deliverButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.success, borderRadius: Radius.md, paddingVertical: 10, flex: 1,
    cursor: 'pointer' as any,
  },
  deliverButtonDisabled: { backgroundColor: Colors.neutral[300] },
  deliveryErrorBanner: {
    backgroundColor: Colors.errorSurface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  deliveryErrorText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.error,
  },
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

const qualityStyles = StyleSheet.create({
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.white, marginBottom: Spacing[3],
  },
  buttonText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 13, color: Colors.textSecondary,
  },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100,
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  modal: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 20,
    width: '100%', maxWidth: 400, gap: 12,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  modalTitle: {
    fontFamily: Typography.fontFamily.bold, fontSize: 16, color: Colors.textPrimary,
  },
  closeText: {
    fontSize: 20, color: Colors.textTertiary,
  },
  notesLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 13, color: Colors.textSecondary,
  },
  notesInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    fontFamily: Typography.fontFamily.sansRegular, color: Colors.textPrimary, minHeight: 60,
  },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 12,
  },
  submitText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 14, color: Colors.white,
  },
});
