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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bike, PackageCheck, Clock, LogOut, MapPin, CircleAlert as AlertCircle, Loader, ShoppingBag, ChevronRight, Navigation, Radio, Package, Sparkles } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format } from 'date-fns';
import StatusChip from '@/components/ui/StatusChip';
import { useRouter } from 'expo-router';
import { resolveRider } from '@/utils/riderLookup';

const GRADIENT_TOP = '#1A2E3A';
const GRADIENT_MID = '#1E3D50';
const GRADIENT_BOT = '#235068';
const ACCENT = '#3AAFE4';

interface RiderInfo {
  id: string;
  full_name: string;
  mobile: string;
  zone: string;
  vehicle_type: string;
  vehicle_number: string;
  is_active: boolean;
  profile_photo_url: string | null;
}

interface DashboardMetrics {
  todayAssigned: number;
  todayDelivered: number;
  todayPending: number;
  totalDeliveries: number;
  successRate: number;
}

interface SubOrderItem {
  assignment_id: string;
  picked_up_at: string | null;
}

interface CustomOrderItem {
  assignment_id: string;
  picked_up_at: string | null;
}

export default function RiderDashboard() {
  const insets = useSafeAreaInsets();
  const { profile, signOut } = useAuthStore();
  const router = useRouter();
  const isWeb = Platform.OS === 'web';

  const [rider, setRider] = useState<RiderInfo | null>(null);
  const [riderId, setRiderId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    todayAssigned: 0,
    todayDelivered: 0,
    todayPending: 0,
    totalDeliveries: 0,
    successRate: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'subscription' | 'custom'>('subscription');
  const [subOrders, setSubOrders] = useState<SubOrderItem[]>([]);
  const [customOrders, setCustomOrders] = useState<CustomOrderItem[]>([]);
  const [pickingUpAll, setPickingUpAll] = useState(false);

  // Attendance state
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const todayIST = new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
  const [todayAttendance, setTodayAttendance] = useState<{ status: string; check_in_time: string | null } | null | undefined>(undefined);
  const [attendanceLocations, setAttendanceLocations] = useState<{ id: string; name: string; latitude: number; longitude: number; radius_meters: number }[]>([]);
  const [checkingIn, setCheckingIn] = useState(false);
  const [geoError, setGeoError] = useState('');

  const load = useCallback(async () => {
    if (!profile?.id) return;

    const riderData = await resolveRider(
      profile.id,
      profile.mobile,
      'id, full_name, mobile, zone, vehicle_type, vehicle_number, is_active, profile_photo_url'
    );

    if (!riderData) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setRider(riderData);
    setRiderId(riderData.id);

    const todayIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [totalRes, attendRes, locRes] = await Promise.all([
      supabase
        .from('rider_order_assignments')
        .select('id, order_id, custom_order_id, status, picked_up_at')
        .eq('rider_id', riderData.id)
        .neq('status', 'reassigned'),
      supabase
        .from('rider_attendance')
        .select('status, check_in_time')
        .eq('rider_id', riderData.id)
        .eq('date', todayIST)
        .maybeSingle(),
      supabase
        .from('attendance_locations')
        .select('id, name, latitude, longitude, radius_meters')
        .eq('is_active', true),
    ]);

    setTodayAttendance(attendRes.data ?? null);
    setAttendanceLocations((locRes.data ?? []) as any[]);

    const totalData = (totalRes.data ?? []) as any[];

    const subAssignments = totalData.filter((a) => a.order_id && !a.custom_order_id);
    const customAssignments = totalData.filter((a) => a.custom_order_id);

    setSubOrders(subAssignments.map((a: any) => ({ assignment_id: a.id, picked_up_at: a.picked_up_at })));
    setCustomOrders(customAssignments.map((a: any) => ({ assignment_id: a.id, picked_up_at: a.picked_up_at })));

    const totalDelivered = totalData.filter((a) => a.status === 'delivered').length;
    const totalClosed = totalData.filter((a) =>
      ['delivered', 'failed'].includes(a.status)
    ).length;
    const successRate = totalClosed > 0 ? Math.round((totalDelivered / totalClosed) * 100) : 0;

    const todayAssigned = totalData.filter((a) => ['assigned', 'out_for_delivery'].includes(a.status)).length;

    setMetrics({
      todayAssigned,
      todayDelivered: totalDelivered,
      todayPending: todayAssigned,
      totalDeliveries: totalDelivered,
      successRate,
    });

    setLoading(false);
    setRefreshing(false);
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  const handleCheckIn = async () => {
    if (!riderId) return;
    setGeoError('');
    if (attendanceLocations.length === 0) {
      setGeoError('No attendance locations configured. Contact admin.');
      return;
    }
    if (!navigator?.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }
    setCheckingIn(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: userLat, longitude: userLng } = pos.coords;
        let matched: (typeof attendanceLocations)[0] | null = null;
        let minDist = Infinity;
        for (const loc of attendanceLocations) {
          const d = haversineMeters(userLat, userLng, loc.latitude, loc.longitude);
          if (d <= loc.radius_meters && d < minDist) { minDist = d; matched = loc; }
        }
        if (!matched) {
          const nearest = attendanceLocations.reduce((b, l) =>
            haversineMeters(userLat, userLng, l.latitude, l.longitude) <
            haversineMeters(userLat, userLng, b.latitude, b.longitude) ? l : b,
            attendanceLocations[0]
          );
          const dist = Math.round(haversineMeters(userLat, userLng, nearest.latitude, nearest.longitude));
          setGeoError(`You are ${dist}m from "${nearest.name}" (radius: ${nearest.radius_meters}m). Move closer to check in.`);
          setCheckingIn(false);
          return;
        }
        const now = new Date().toISOString();
        const { error } = await supabase.from('rider_attendance').upsert(
          { rider_id: riderId, date: todayIST, status: 'present', check_in_time: now, check_in_location_id: matched.id, check_in_latitude: userLat, check_in_longitude: userLng },
          { onConflict: 'rider_id,date' }
        );
        if (error) {
          setGeoError(error.message || 'Failed to mark attendance. Please try again.');
        } else {
          setTodayAttendance({ status: 'present', check_in_time: now });
        }
        setCheckingIn(false);
      },
      () => {
        setGeoError('Unable to get your location. Please allow location access and try again.');
        setCheckingIn(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };


  const renderAttendanceCard = () => {
    const checkedIn = todayAttendance?.status === 'present';
    return (
      <View style={isWeb ? wStyles.attendanceCard : mStyles.attendanceCard}>
        <View style={isWeb ? wStyles.attendanceHeader : mStyles.attendanceHeader}>
          <View style={isWeb ? wStyles.attendanceIconWrap : mStyles.attendanceIconWrap}>
            <Navigation size={18} color={ACCENT} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={isWeb ? wStyles.attendanceTitle : mStyles.attendanceTitle}>Today's Attendance</Text>
            <Text style={isWeb ? wStyles.attendanceDate : mStyles.attendanceDate}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
          </View>
          {checkedIn && (
            <View style={isWeb ? wStyles.attendanceBadge : mStyles.attendanceBadge}>
              <Text style={isWeb ? wStyles.attendanceBadgeText : mStyles.attendanceBadgeText}>Present</Text>
            </View>
          )}
        </View>

        {checkedIn && todayAttendance?.check_in_time && (
          <View style={isWeb ? wStyles.attendanceTimeRow : mStyles.attendanceTimeRow}>
            <Clock size={12} color={Colors.textTertiary} strokeWidth={1.8} />
            <Text style={isWeb ? wStyles.attendanceTimeText : mStyles.attendanceTimeText}>
              Checked in at {format(new Date(todayAttendance.check_in_time), 'hh:mm a')}
            </Text>
          </View>
        )}

        {!checkedIn && attendanceLocations.length > 0 && (
          <View style={isWeb ? wStyles.locationsList : mStyles.locationsList}>
            {attendanceLocations.map((loc) => (
              <View key={loc.id} style={isWeb ? wStyles.locationItem : mStyles.locationItem}>
                <Radio size={11} color={Colors.primary} strokeWidth={1.8} />
                <Text style={isWeb ? wStyles.locationItemText : mStyles.locationItemText}>{loc.name} · {loc.radius_meters}m radius</Text>
              </View>
            ))}
          </View>
        )}

        {!!geoError && (
          <View style={isWeb ? wStyles.geoErrorBox : mStyles.geoErrorBox}>
            <MapPin size={13} color={Colors.error} strokeWidth={1.8} />
            <Text style={isWeb ? wStyles.geoErrorText : mStyles.geoErrorText}>{geoError}</Text>
          </View>
        )}

        {!checkedIn && (
          <TouchableOpacity
            style={[isWeb ? wStyles.checkInBtn : mStyles.checkInBtn, checkingIn && { backgroundColor: Colors.neutral[300] }]}
            onPress={handleCheckIn}
            disabled={checkingIn}
            activeOpacity={0.85}
          >
            {checkingIn
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <Navigation size={15} color={Colors.white} strokeWidth={2} />}
            <Text style={isWeb ? wStyles.checkInBtnText : mStyles.checkInBtnText}>
              {checkingIn ? 'Getting Location...' : 'Mark Attendance'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const statusIcon = (status: string) => {
    if (status === 'delivered') return <PackageCheck size={16} color={Colors.success} strokeWidth={1.8} />;
    if (status === 'failed') return <AlertCircle size={16} color={Colors.error} strokeWidth={1.8} />;
    return <Loader size={16} color={Colors.warning} strokeWidth={1.8} />;
  };

  const metricCards = [
    { label: "Today's", value: metrics.todayAssigned, icon: Bike, color: ACCENT, bg: 'rgba(58,175,228,0.12)', filter: '' },
    { label: 'Delivered', value: metrics.todayDelivered, icon: PackageCheck, color: Colors.success, bg: Colors.successSurface, filter: 'delivered' },
    { label: 'Pending', value: metrics.todayPending, icon: Clock, color: Colors.warning, bg: Colors.warningSurface, filter: 'assigned' },
  ];

  const navigateToAssignments = (filter: string, date?: string) => {
    router.push({ pathname: '/(rider)/assignments', params: { filter, ...(date ? { date } : {}) } });
  };

  const handlePickUpAll = async (tab: 'subscription' | 'custom') => {
    if (todayAttendance?.status !== 'present') return;

    const orders = tab === 'subscription' ? subOrders : customOrders;
    const pendingIds = orders.filter((o) => !o.picked_up_at).map((o) => o.assignment_id);
    if (pendingIds.length === 0) {
      return;
    }
    setPickingUpAll(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('rider_order_assignments')
      .update({ picked_up_at: now })
      .in('id', pendingIds)
      .eq('rider_id', riderId!);
    if (!error) {
      if (tab === 'subscription') {
        setSubOrders((prev) => prev.map((o) =>
          o.picked_up_at ? o : { ...o, picked_up_at: now }
        ));
      } else {
        setCustomOrders((prev) => prev.map((o) =>
          o.picked_up_at ? o : { ...o, picked_up_at: now }
        ));
      }
      setPickingUpAll(false);
      navigateToAssignments('');
      return;
    }
    setPickingUpAll(false);
  };

  const renderTabContent = (tab: 'subscription' | 'custom') => {
    const orders = tab === 'subscription' ? subOrders : customOrders;
    const pendingCount = orders.filter((o) => !o.picked_up_at).length;
    const allPickedUp = orders.length > 0 && pendingCount === 0;
    const attendanceCheckedIn = todayAttendance?.status === 'present';
    return (
      <View style={isWeb ? wStyles.tabContent : mStyles.tabContent}>
        <View style={isWeb ? wStyles.tabCountRow : mStyles.tabCountRow}>
          <Text style={isWeb ? wStyles.tabCountLabel : mStyles.tabCountLabel}>
            {orders.length} order{orders.length !== 1 ? 's' : ''} assigned
          </Text>
          {allPickedUp && (
            <View style={[isWeb ? wStyles.pickedUpBadge : mStyles.pickedUpBadge]}>
              <PackageCheck size={isWeb ? 13 : 12} color={Colors.success} strokeWidth={2} />
              <Text style={isWeb ? wStyles.pickedUpText : mStyles.pickedUpText}>All Picked Up</Text>
            </View>
          )}
        </View>
        {orders.length > 0 && (
          <TouchableOpacity
            style={[
              isWeb ? wStyles.pickUpAllBtn : mStyles.pickUpAllBtn,
              (!attendanceCheckedIn || pickingUpAll || allPickedUp) && (isWeb ? wStyles.pickUpAllBtnDisabled : mStyles.pickUpAllBtnDisabled),
            ]}
            onPress={() => handlePickUpAll(tab)}
            disabled={pickingUpAll || allPickedUp || !attendanceCheckedIn}
            activeOpacity={0.8}
          >
            {pickingUpAll
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <ShoppingBag size={isWeb ? 16 : 15} color={Colors.white} strokeWidth={2} />}
            <Text style={isWeb ? wStyles.pickUpAllBtnText : mStyles.pickUpAllBtnText}>
              {pickingUpAll ? 'Picking Up...' : allPickedUp ? 'Picked Up' : !attendanceCheckedIn ? 'Mark Present to Pick Up' : 'Pick Up'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderTabs = () => {
    return (
      <View style={isWeb ? wStyles.tabsContainer : mStyles.tabsContainer}>
        <View style={isWeb ? wStyles.tabBar : mStyles.tabBar}>
          <TouchableOpacity
            style={[isWeb ? wStyles.tabBtn : mStyles.tabBtn, activeTab === 'subscription' && (isWeb ? wStyles.tabBtnActive : mStyles.tabBtnActive)]}
            onPress={() => setActiveTab('subscription')}
            activeOpacity={0.7}
          >
            <Package size={isWeb ? 16 : 14} color={activeTab === 'subscription' ? Colors.primary : Colors.textTertiary} strokeWidth={1.8} />
            <Text style={[isWeb ? wStyles.tabBtnText : mStyles.tabBtnText, { color: activeTab === 'subscription' ? Colors.primary : Colors.textTertiary }]}>
              Subscription Orders
            </Text>
            <View style={[isWeb ? wStyles.tabCountBadge : mStyles.tabCountBadge, { backgroundColor: activeTab === 'subscription' ? Colors.primarySurface : Colors.neutral[100] }]}>
              <Text style={[isWeb ? wStyles.tabCountText : mStyles.tabCountText, { color: activeTab === 'subscription' ? Colors.primary : Colors.textTertiary }]}>{subOrders.length}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[isWeb ? wStyles.tabBtn : mStyles.tabBtn, activeTab === 'custom' && (isWeb ? wStyles.tabBtnActive : mStyles.tabBtnActive)]}
            onPress={() => setActiveTab('custom')}
            activeOpacity={0.7}
          >
            <Sparkles size={isWeb ? 16 : 14} color={activeTab === 'custom' ? Colors.primary : Colors.textTertiary} strokeWidth={1.8} />
            <Text style={[isWeb ? wStyles.tabBtnText : mStyles.tabBtnText, { color: activeTab === 'custom' ? Colors.primary : Colors.textTertiary }]}>
              Customize Orders
            </Text>
            <View style={[isWeb ? wStyles.tabCountBadge : mStyles.tabCountBadge, { backgroundColor: activeTab === 'custom' ? Colors.primarySurface : Colors.neutral[100] }]}>
              <Text style={[isWeb ? wStyles.tabCountText : mStyles.tabCountText, { color: activeTab === 'custom' ? Colors.primary : Colors.textTertiary }]}>{customOrders.length}</Text>
            </View>
          </TouchableOpacity>
        </View>
        {activeTab === 'subscription' ? renderTabContent('subscription') : renderTabContent('custom')}
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <LinearGradient
          colors={[GRADIENT_TOP, GRADIENT_MID, GRADIENT_BOT]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={wStyles.gradientHeader}
        >
          <View style={wStyles.headerInner}>
            <View style={wStyles.headerLeft}>
              <View style={wStyles.headerIconWrap}>
                <Bike size={22} color={ACCENT} strokeWidth={1.8} />
              </View>
              <View>
                <Text style={wStyles.headerEyebrow}>Rider Portal</Text>
                <Text style={wStyles.headerTitle}>{rider ? rider.full_name : 'Dashboard'}</Text>
                <Text style={wStyles.headerDate}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
              </View>
            </View>
            <TouchableOpacity style={wStyles.signOutBtn} onPress={signOut} activeOpacity={0.8}>
              <LogOut size={16} color='rgba(255,255,255,0.75)' strokeWidth={1.8} />
              <Text style={wStyles.signOutText}>Sign out</Text>
            </TouchableOpacity>
          </View>

          {rider && (
            <View style={wStyles.profileCard}>
              <View style={wStyles.profileLeft}>
                <View style={wStyles.avatarCircle}>
                  <Text style={wStyles.avatarText}>{rider.full_name[0].toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={wStyles.profileName}>{rider.full_name}</Text>
                  <Text style={wStyles.profileMeta}>
                    {rider.vehicle_type ? rider.vehicle_type.charAt(0).toUpperCase() + rider.vehicle_type.slice(1) : 'Rider'}
                    {rider.vehicle_number ? ` · ${rider.vehicle_number}` : ''}
                  </Text>
                  {rider.zone && <Text style={wStyles.profileCity}>{rider.zone} Zone</Text>}
                </View>
              </View>
              <View style={wStyles.statsRight}>
                <View style={wStyles.statItem}>
                  <Text style={wStyles.statValue}>{loading ? '—' : metrics.totalDeliveries}</Text>
                  <Text style={wStyles.statLabel}>Deliveries</Text>
                </View>
                <View style={wStyles.statDivider} />
                <View style={wStyles.statItem}>
                  <Text style={wStyles.statValue}>{loading ? '—' : `${metrics.successRate}%`}</Text>
                  <Text style={wStyles.statLabel}>Success</Text>
                </View>
                <View style={[wStyles.statusPill, { backgroundColor: rider.is_active ? 'rgba(46,160,67,0.2)' : 'rgba(198,40,40,0.2)' }]}>
                  <View style={[wStyles.statusDot, { backgroundColor: rider.is_active ? '#4CAF50' : Colors.error }]} />
                  <Text style={[wStyles.statusPillText, { color: rider.is_active ? '#4CAF50' : Colors.error }]}>
                    {rider.is_active ? 'Active' : 'Inactive'}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </LinearGradient>

        {!rider && !loading && (
          <View style={wStyles.noProfileCard}>
            <Bike size={36} color={Colors.textTertiary} strokeWidth={1.5} />
            <Text style={wStyles.noProfileTitle}>No rider profile linked</Text>
            <Text style={wStyles.noProfileSub}>Your account is not yet associated with a rider profile. Please contact the admin team.</Text>
          </View>
        )}

        {rider && (
          <View style={wStyles.body}>
            <View style={wStyles.metricsGrid}>
              {metricCards.map((card) => {
                const Icon = card.icon;
                return (
                  <TouchableOpacity
                    key={card.label}
                    style={wStyles.metricCard}
                    onPress={() => navigateToAssignments(card.filter)}
                    activeOpacity={0.75}
                  >
                    <View style={[wStyles.metricIconWrap, { backgroundColor: card.bg }]}>
                      <Icon size={20} color={card.color} strokeWidth={1.8} />
                    </View>
                    <Text style={wStyles.metricValue}>{loading ? '—' : card.value}</Text>
                    <Text style={wStyles.metricLabel}>{card.label}</Text>
                    <ChevronRight size={14} color={Colors.neutral[300]} style={{ position: 'absolute', top: 16, right: 16 } as any} />
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Attendance check-in card */}
            {!loading && todayAttendance !== undefined && renderAttendanceCard()}

            {/* Order tabs */}
            {!loading && rider && renderTabs()}

          </View>
        )}

      </ScrollView>
      </>
    );
  }

  return (
    <View style={mStyles.container}>
      <LinearGradient
        colors={[GRADIENT_TOP, GRADIENT_MID, GRADIENT_BOT]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[mStyles.gradientHeader, { paddingTop: insets.top + Spacing[3] }]}
      >
        <View style={mStyles.headerTopRow}>
          <View style={mStyles.headerLeft}>
            <View style={mStyles.bikeIconWrap}>
              <Bike size={18} color={ACCENT} strokeWidth={1.8} />
            </View>
            <View>
              <Text style={mStyles.headerEyebrow}>Rider Portal</Text>
              <Text style={mStyles.headerTitle} numberOfLines={1}>{rider ? rider.full_name : 'Dashboard'}</Text>
            </View>
          </View>
          <TouchableOpacity style={mStyles.signOutBtn} onPress={signOut} activeOpacity={0.7}>
            <LogOut size={16} color='rgba(255,255,255,0.7)' strokeWidth={1.8} />
          </TouchableOpacity>
        </View>

        {rider && (
          <View style={mStyles.riderRow}>
            <View style={mStyles.riderAvatarSmall}>
              <Text style={mStyles.riderAvatarText}>{rider.full_name[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={mStyles.riderContact}>
                {rider.vehicle_type ? rider.vehicle_type.charAt(0).toUpperCase() + rider.vehicle_type.slice(1) : 'Rider'}
                {rider.vehicle_number ? ` · ${rider.vehicle_number}` : ''}
              </Text>
              {rider.zone && <Text style={mStyles.riderZone}><MapPin size={10} color='rgba(255,255,255,0.5)' strokeWidth={1.8} /> {rider.zone} Zone</Text>}
            </View>
            <View style={[mStyles.activePill, { backgroundColor: rider.is_active ? 'rgba(76,175,80,0.2)' : 'rgba(198,40,40,0.2)' }]}>
              <Text style={[mStyles.activePillText, { color: rider.is_active ? '#4CAF50' : Colors.error }]}>
                {rider.is_active ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>
        )}

        <View style={mStyles.statsRow}>
          <View style={mStyles.statItem}>
            <Text style={mStyles.statValue}>{loading ? '—' : metrics.totalDeliveries}</Text>
            <Text style={mStyles.statLabel}>Total Deliveries</Text>
          </View>
          <View style={mStyles.statDivider} />
          <View style={mStyles.statItem}>
            <Text style={mStyles.statValue}>{loading ? '—' : `${metrics.successRate}%`}</Text>
            <Text style={mStyles.statLabel}>Success Rate</Text>
          </View>
          <View style={mStyles.statDivider} />
          <View style={mStyles.statItem}>
            <Text style={mStyles.statValue}>{loading ? '—' : metrics.todayAssigned}</Text>
            <Text style={mStyles.statLabel}>Today</Text>
          </View>
        </View>

        <Text style={mStyles.dateText}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[mStyles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      >
        {!rider && !loading && (
          <View style={mStyles.noProfileCard}>
            <Bike size={28} color={Colors.textTertiary} strokeWidth={1.5} />
            <Text style={mStyles.noProfileText}>No rider profile linked. Contact admin.</Text>
          </View>
        )}

        {rider && (
          <>
            <View style={mStyles.metricsGrid}>
              {metricCards.map((card) => {
                const Icon = card.icon;
                return (
                  <TouchableOpacity
                    key={card.label}
                    style={mStyles.metricCard}
                    onPress={() => navigateToAssignments(card.filter)}
                    activeOpacity={0.75}
                  >
                    <View style={[mStyles.metricAccentBar, { backgroundColor: card.color }]} />
                    <View style={mStyles.metricCardInner}>
                      <View style={[mStyles.metricIconWrap, { backgroundColor: card.bg }]}>
                        <Icon size={18} color={card.color} strokeWidth={1.8} />
                      </View>
                      <Text style={[mStyles.metricValue, { color: card.color }]}>
                        {loading ? '—' : card.value}
                      </Text>
                      <Text style={mStyles.metricLabel}>{card.label}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Attendance check-in card */}
            {!loading && todayAttendance !== undefined && renderAttendanceCard()}

            {/* Order tabs */}
            {!loading && rider && renderTabs()}

          </>
        )}
      </ScrollView>
    </View>
  );
}

const mStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EEF2F5' },
  gradientHeader: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[5],
    gap: Spacing[3],
  },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], flex: 1 },
  bikeIconWrap: {
    width: 40, height: 40, borderRadius: 12,
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
  signOutBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  riderRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.lg, padding: Spacing[3],
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  riderAvatarSmall: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: `rgba(58,175,228,0.3)`,
    alignItems: 'center', justifyContent: 'center',
  },
  riderAvatarText: {
    fontFamily: Typography.fontFamily.bold, fontSize: 16, color: ACCENT,
  },
  riderContact: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: 'rgba(255,255,255,0.9)',
  },
  riderZone: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.55)',
  },
  activePill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full,
  },
  activePillText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11,
  },
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.lg, paddingVertical: Spacing[3],
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.15)' },
  statValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'], color: '#FFFFFF', letterSpacing: -0.5,
  },
  statLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.55)',
  },
  dateText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.3,
  },
  scrollContent: { padding: Spacing[4], gap: Spacing[4] },
  noProfileCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: Spacing[6],
    alignItems: 'center', gap: Spacing[3], borderWidth: 1, borderColor: Colors.border,
  },
  noProfileText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center',
  },
  metricsGrid: { flexDirection: 'row', gap: Spacing[2] },
  metricCard: {
    flex: 1, borderRadius: Radius.lg, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
    flexDirection: 'row',
  },
  metricAccentBar: {
    width: 4, borderTopLeftRadius: Radius.lg, borderBottomLeftRadius: Radius.lg,
  },
  metricCardInner: {
    flex: 1, padding: Spacing[4], gap: Spacing[2],
  },
  metricIconWrap: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  metricValue: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], letterSpacing: -0.5,
  },
  metricLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs,
    color: Colors.textTertiary, letterSpacing: 0.2,
  },
  section: { gap: Spacing[3] },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  sectionTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  sectionCountBadge: {
    backgroundColor: 'rgba(58,175,228,0.12)', borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  sectionCountText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: ACCENT,
  },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  seeAllText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: ACCENT,
  },
  pickupCountBadge: {
    backgroundColor: '#e0f2fe', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  pickupCountText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 12, color: '#0891b2',
  },
  pickupStatusBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full,
  },
  pickupStatusText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11,
  },
  listCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  listRow: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing[4],
    borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: Spacing[3],
  },
  listRowLast: { borderBottomWidth: 0 },
  listIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.neutral[50],
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  listInfo: { flex: 1, gap: 2 },
  listPrimary: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm, color: Colors.textPrimary,
  },
  listSecondary: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  deliverySectionLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 11, color: Colors.textTertiary,
    letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: Spacing[2],
  },
  deliveryRow: { flexDirection: 'row', gap: Spacing[3] },
  deliveryCard: {
    flex: 1, borderRadius: Radius.lg, backgroundColor: Colors.white,
    padding: Spacing[4], borderWidth: 1, gap: Spacing[2], ...Shadow.sm,
  },
  deliveryCardToday: { borderColor: 'rgba(22,163,74,0.3)', borderLeftWidth: 3, borderLeftColor: Colors.success },
  deliveryCardTomorrow: { borderColor: 'rgba(37,99,235,0.3)', borderLeftWidth: 3, borderLeftColor: '#2563EB' },
  deliveryIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  deliveryCount: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['3xl'], letterSpacing: -0.5,
  },
  deliveryLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  // Attendance card
  attendanceCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: Spacing[4],
    borderWidth: 1, borderColor: Colors.border, gap: Spacing[3], ...Shadow.sm,
  },
  attendanceHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  attendanceIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(58,175,228,0.12)', alignItems: 'center', justifyContent: 'center',
  },
  attendanceTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  attendanceDate: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2,
  },
  attendanceBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, backgroundColor: Colors.successSurface,
  },
  attendanceBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.success },
  attendanceTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  attendanceTimeText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary,
  },
  locationsList: { gap: 4 },
  locationItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationItemText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  geoErrorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: Colors.errorSurface, borderRadius: Radius.md, padding: 10,
  },
  geoErrorText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.error, flex: 1, lineHeight: 18,
  },
  checkInBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    paddingVertical: 13, minHeight: 48,
  },
  checkInBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white,
  },
  tabsContainer: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  tabBar: { flexDirection: 'row', gap: Spacing[2], padding: 4, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: Radius.md },
  tabBtnActive: { backgroundColor: Colors.primarySurface },
  tabBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs },
  tabCountBadge: { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  tabCountText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10 },
  tabContent: { padding: Spacing[3], gap: Spacing[3] },
  tabCountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tabCountLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  pickUpAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0891b2', borderRadius: Radius.md, paddingVertical: 14 },
  pickUpAllBtnDisabled: { backgroundColor: Colors.neutral[300], opacity: 0.8 },
  pickUpAllBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  pickedUpBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successSurface, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 5, flexShrink: 0 },
  pickedUpText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.success },
});

const wStyles = StyleSheet.create({
  content: { paddingBottom: 64, gap: 0 },
  gradientHeader: { paddingBottom: 0 },
  headerInner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
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
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  signOutText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: 'rgba(255,255,255,0.75)',
  },
  profileCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginHorizontal: 32, marginBottom: 28,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: Radius.lg,
    padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  profileLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarCircle: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: `rgba(58,175,228,0.25)`, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: Typography.fontFamily.bold, fontSize: 22, color: ACCENT },
  profileName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: '#FFFFFF' },
  profileMeta: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  profileCity: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.45)', marginTop: 1 },
  statsRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  statItem: { alignItems: 'center', gap: 2 },
  statDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.2)' },
  statValue: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'],
    color: '#FFFFFF', letterSpacing: -0.3,
  },
  statLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.55)',
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusPillText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 13 },
  noProfileCard: {
    margin: 32,
    backgroundColor: Colors.white, borderRadius: 20, padding: 40,
    alignItems: 'center', gap: 12, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  noProfileTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary,
  },
  noProfileSub: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
    textAlign: 'center', maxWidth: 400,
  },
  body: { padding: 32, gap: 24 },
  metricsGrid: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  metricCard: {
    flex: 1, minWidth: 160, backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: 20, borderWidth: 1, borderColor: Colors.border, gap: 8, ...Shadow.sm,
    cursor: 'pointer' as any,
  },
  metricIconWrap: {
    width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
  },
  metricValue: {
    fontFamily: Typography.fontFamily.bold, fontSize: 26, color: Colors.textPrimary, letterSpacing: -0.3,
  },
  metricLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
  },
  deliverySection: { gap: 10 },
  deliverySectionLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 11, color: Colors.textTertiary,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  deliveryRow: { flexDirection: 'row', gap: 16 },
  deliveryCard: {
    flex: 1, borderRadius: Radius.lg, backgroundColor: Colors.white,
    padding: 20, borderWidth: 1, gap: 10, ...Shadow.sm,
    cursor: 'pointer' as any,
  },
  deliveryCardToday: { borderColor: 'rgba(22,163,74,0.25)', borderLeftWidth: 4, borderLeftColor: Colors.success },
  deliveryCardTomorrow: { borderColor: 'rgba(37,99,235,0.25)', borderLeftWidth: 4, borderLeftColor: '#2563EB' },
  deliveryIconWrap: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  deliveryCount: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 32, letterSpacing: -0.5,
  },
  deliveryLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm, color: Colors.textTertiary,
  },
  tableCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  tableHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tableTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  tableHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 11,
    backgroundColor: Colors.neutral[50],
    borderBottomWidth: 1, borderBottomColor: Colors.border,
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
  emptyState: { paddingVertical: 40, alignItems: 'center', gap: 10 },
  emptyText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
  },
  // Attendance card (web)
  attendanceCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: Colors.border, gap: Spacing[3], ...Shadow.sm,
  },
  attendanceHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  attendanceIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(58,175,228,0.12)', alignItems: 'center', justifyContent: 'center',
  },
  attendanceTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  attendanceDate: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2,
  },
  attendanceBadge: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.successSurface,
  },
  attendanceBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 12, color: Colors.success },
  attendanceTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  attendanceTimeText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary,
  },
  locationsList: { gap: 4 },
  locationItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationItemText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  geoErrorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: Colors.errorSurface, borderRadius: Radius.md, padding: 10,
  },
  geoErrorText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.error, flex: 1, lineHeight: 18,
  },
  checkInBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    paddingVertical: 12, minHeight: 46, alignSelf: 'flex-start', paddingHorizontal: 20,
  },
  checkInBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white,
  },
  tabsContainer: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  tabBar: { flexDirection: 'row', gap: 10, padding: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Radius.md, cursor: 'pointer' as any },
  tabBtnActive: { backgroundColor: Colors.primarySurface },
  tabBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm },
  tabCountBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  tabCountText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  tabContent: { padding: 20, gap: 16 },
  tabCountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tabCountLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  pickUpAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#0891b2', borderRadius: Radius.md, paddingVertical: 16, cursor: 'pointer' as any },
  pickUpAllBtnDisabled: { backgroundColor: Colors.neutral[300], cursor: 'not-allowed' as any, opacity: 0.8 },
  pickUpAllBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
  pickedUpBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.successSurface, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 6, flexShrink: 0 },
  pickedUpText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 12, color: Colors.success },
});
