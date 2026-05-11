import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bike, PackageCheck, PackageX, Clock, TrendingUp, LogOut, MapPin, CircleCheck as CheckCircle2, CircleAlert as AlertCircle, Loader, Truck, ShoppingBag, ChevronRight, Navigation } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format } from 'date-fns';
import StatusChip from '@/components/ui/StatusChip';
import { useRouter } from 'expo-router';

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
  todayFailed: number;
  todayPending: number;
  todayPickedUp: number;
  totalDeliveries: number;
  successRate: number;
}

interface RecentAssignment {
  id: string;
  status: string;
  assigned_at: string;
  delivered_at: string | null;
  orders: {
    id: string;
    user: { full_name: string } | null;
    subscription: {
      delivery_address: { street: string; city: string; state: string; pincode: string } | null;
    } | null;
  } | null;
}

interface PickupAssignment {
  id: string;
  order_number: string;
  status: string;
  requirement_date: string | null;
  pickup_assigned_at: string | null;
  pickup_notes: string | null;
  vendor: { business_name: string | null; contact_person: string | null; mobile: string | null } | null;
}

export default function RiderDashboard() {
  const insets = useSafeAreaInsets();
  const { profile, signOut } = useAuthStore();
  const router = useRouter();
  const isWeb = Platform.OS === 'web';

  const [rider, setRider] = useState<RiderInfo | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    todayAssigned: 0,
    todayDelivered: 0,
    todayFailed: 0,
    todayPending: 0,
    todayPickedUp: 0,
    totalDeliveries: 0,
    successRate: 0,
  });
  const [recentAssignments, setRecentAssignments] = useState<RecentAssignment[]>([]);
  const [pickupOrders, setPickupOrders] = useState<PickupAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.id) return;

    const { data: riderData } = await supabase
      .from('riders')
      .select('id, full_name, mobile, zone, vehicle_type, vehicle_number, is_active, profile_photo_url')
      .eq('profile_id', profile.id)
      .maybeSingle();

    if (!riderData) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setRider(riderData);

    const today = format(new Date(), 'yyyy-MM-dd');
    const todayStart = `${today}T00:00:00.000Z`;
    const todayEnd = `${today}T23:59:59.999Z`;

    const [todayRes, totalRes, recentRes, pickupRes] = await Promise.all([
      supabase
        .from('rider_order_assignments')
        .select('status')
        .eq('rider_id', riderData.id)
        .gte('assigned_at', todayStart)
        .lte('assigned_at', todayEnd),
      supabase
        .from('rider_order_assignments')
        .select('status')
        .eq('rider_id', riderData.id),
      supabase
        .from('rider_order_assignments')
        .select(`
          id, status, assigned_at, delivered_at,
          orders:order_id (
            id,
            user:user_id ( full_name ),
            subscription:subscription_id (
              delivery_address:delivery_address_id ( street, city, state, pincode )
            )
          )
        `)
        .eq('rider_id', riderData.id)
        .order('assigned_at', { ascending: false })
        .limit(8),
      supabase
        .from('procurement_orders')
        .select('id, order_number, status, requirement_date, pickup_assigned_at, pickup_notes, vendor:vendors(business_name, contact_person, mobile)')
        .eq('pickup_rider_id', riderData.id)
        .in('status', ['accepted', 'fulfilled'])
        .order('pickup_assigned_at', { ascending: false }),
    ]);

    const todayData = todayRes.data ?? [];
    const totalData = totalRes.data ?? [];

    const todayDelivered = todayData.filter((a) => a.status === 'delivered').length;
    const todayFailed = todayData.filter((a) => a.status === 'failed').length;
    const todayPickedUp = todayData.filter((a) => a.status === 'picked_up').length;
    const todayPending = todayData.filter((a) =>
      ['assigned', 'accepted'].includes(a.status)
    ).length;

    const totalDelivered = totalData.filter((a) => a.status === 'delivered').length;
    const totalClosed = totalData.filter((a) =>
      ['delivered', 'failed'].includes(a.status)
    ).length;
    const successRate = totalClosed > 0 ? Math.round((totalDelivered / totalClosed) * 100) : 0;

    setMetrics({
      todayAssigned: todayData.length,
      todayDelivered,
      todayFailed,
      todayPending,
      todayPickedUp,
      totalDeliveries: totalDelivered,
      successRate,
    });

    if (recentRes.data) setRecentAssignments(recentRes.data as RecentAssignment[]);
    if (pickupRes.data) setPickupOrders(pickupRes.data as PickupAssignment[]);
    setLoading(false);
    setRefreshing(false);
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const statusIcon = (status: string) => {
    if (status === 'delivered') return <CheckCircle2 size={16} color={Colors.success} strokeWidth={1.8} />;
    if (status === 'failed') return <AlertCircle size={16} color={Colors.error} strokeWidth={1.8} />;
    return <Loader size={16} color={Colors.warning} strokeWidth={1.8} />;
  };

  const metricCards = [
    { label: "Today's", value: metrics.todayAssigned, icon: Bike, color: ACCENT, bg: 'rgba(58,175,228,0.12)', filter: '' },
    { label: 'Delivered', value: metrics.todayDelivered, icon: PackageCheck, color: Colors.success, bg: Colors.successSurface, filter: 'delivered' },
    { label: 'Picked Up', value: metrics.todayPickedUp, icon: Truck, color: '#0891b2', bg: '#e0f2fe', filter: 'picked_up' },
    { label: 'Pending', value: metrics.todayPending, icon: Clock, color: Colors.warning, bg: Colors.warningSurface, filter: 'assigned' },
    { label: 'Failed', value: metrics.todayFailed, icon: PackageX, color: Colors.error, bg: Colors.errorSurface, filter: 'failed' },
  ];

  const navigateToAssignments = (filter: string) => {
    router.push({ pathname: '/(rider)/assignments', params: { filter } });
  };

  if (isWeb) {
    return (
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

            {pickupOrders.length > 0 && (
              <View style={wStyles.tableCard}>
                <View style={wStyles.tableHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ShoppingBag size={16} color="#0891b2" strokeWidth={1.8} />
                    <Text style={wStyles.tableTitle}>Pickup Orders</Text>
                    <View style={{ backgroundColor: '#e0f2fe', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 12, color: '#0891b2' }}>{pickupOrders.length}</Text>
                    </View>
                  </View>
                </View>
                <View style={wStyles.tableHead}>
                  <Text style={[wStyles.thCell, { flex: 1.5 }]}>Order #</Text>
                  <Text style={[wStyles.thCell, { flex: 2 }]}>Vendor</Text>
                  <Text style={[wStyles.thCell, { flex: 1.5 }]}>Req. Date</Text>
                  <Text style={[wStyles.thCell, { flex: 2 }]}>Notes</Text>
                  <Text style={[wStyles.thCell, { flex: 1 }]}>Status</Text>
                </View>
                {pickupOrders.map((p, i) => {
                  const vendor = p.vendor as any;
                  const isPending = p.status === 'accepted';
                  return (
                    <View key={p.id} style={[wStyles.tableRow, i % 2 === 1 && wStyles.tableRowAlt]}>
                      <Text style={[wStyles.tdCell, { flex: 1.5, fontFamily: Typography.fontFamily.sansSemiBold }]} numberOfLines={1}>{p.order_number}</Text>
                      <View style={{ flex: 2 }}>
                        <Text style={wStyles.tdCell} numberOfLines={1}>{vendor?.business_name ?? vendor?.contact_person ?? '—'}</Text>
                        {vendor?.mobile && <Text style={{ fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary }}>{vendor.mobile}</Text>}
                      </View>
                      <Text style={[wStyles.tdCell, { flex: 1.5 }]}>
                        {p.requirement_date ? format(new Date(p.requirement_date), 'dd MMM yyyy') : '—'}
                      </Text>
                      <Text style={[wStyles.tdCell, { flex: 2, color: Colors.textSecondary }]} numberOfLines={1}>{p.pickup_notes ?? '—'}</Text>
                      <View style={{ flex: 1 }}>
                        <View style={{ backgroundColor: isPending ? '#e0f2fe' : '#dcfce7', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }}>
                          <Text style={{ fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: isPending ? '#0891b2' : '#16a34a' }}>
                            {isPending ? 'Pending' : 'Fulfilled'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={wStyles.tableCard}>
              <View style={wStyles.tableHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TrendingUp size={16} color={Colors.primary} strokeWidth={1.8} />
                  <Text style={wStyles.tableTitle}>Recent Assignments</Text>
                </View>
                <View style={[wStyles.trendBadge, { backgroundColor: Colors.primarySurface }]}>
                  <Text style={wStyles.trendText}>{metrics.successRate}% success rate</Text>
                </View>
              </View>
              <View style={wStyles.tableHead}>
                <Text style={[wStyles.thCell, { flex: 2 }]}>Customer</Text>
                <Text style={[wStyles.thCell, { flex: 3 }]}>Address</Text>
                <Text style={[wStyles.thCell, { width: 148 }]}>Assigned</Text>
                <Text style={[wStyles.thCell, { width: 110 }]}>Status</Text>
              </View>
              {recentAssignments.length === 0 ? (
                <View style={wStyles.emptyState}>
                  <PackageCheck size={28} color={Colors.textTertiary} strokeWidth={1.5} />
                  <Text style={wStyles.emptyText}>No assignments yet</Text>
                </View>
              ) : (
                recentAssignments.map((a, i) => (
                  <View key={a.id} style={[wStyles.tableRow, i % 2 === 1 && wStyles.tableRowAlt]}>
                    <Text style={[wStyles.tdCell, { flex: 2, fontFamily: Typography.fontFamily.sansMedium }]} numberOfLines={1}>
                      {(a.orders as any)?.user?.full_name ?? '—'}
                    </Text>
                    <Text style={[wStyles.tdCell, { flex: 3, color: Colors.textSecondary }]} numberOfLines={1}>
                      {(() => { const addr = (a.orders as any)?.subscription?.delivery_address; return addr ? [addr.street, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ') : '—'; })()}
                    </Text>
                    <Text style={[wStyles.tdCell, { width: 148 }]}>
                      {a.assigned_at ? format(new Date(a.assigned_at), 'dd MMM, hh:mm a') : '—'}
                    </Text>
                    <View style={{ width: 110 }}>
                      <StatusChip status={a.status} />
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        )}
      </ScrollView>
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

            {pickupOrders.length > 0 && (
              <View style={mStyles.section}>
                <View style={mStyles.sectionHeader}>
                  <Text style={mStyles.sectionTitle}>Pickup Orders</Text>
                  <View style={mStyles.pickupCountBadge}>
                    <Text style={mStyles.pickupCountText}>{pickupOrders.length}</Text>
                  </View>
                </View>
                <View style={mStyles.listCard}>
                  {pickupOrders.map((p, i) => {
                    const vendor = p.vendor as any;
                    const isPending = p.status === 'accepted';
                    return (
                      <View
                        key={p.id}
                        style={[mStyles.listRow, i === pickupOrders.length - 1 && mStyles.listRowLast]}
                      >
                        <View style={[mStyles.listIconWrap, { backgroundColor: '#e0f2fe' }]}>
                          <ShoppingBag size={16} color="#0891b2" strokeWidth={1.8} />
                        </View>
                        <View style={mStyles.listInfo}>
                          <Text style={mStyles.listPrimary} numberOfLines={1}>{p.order_number}</Text>
                          <Text style={mStyles.listSecondary} numberOfLines={1}>
                            {vendor?.business_name ?? vendor?.contact_person ?? '—'}
                          </Text>
                        </View>
                        <View style={[mStyles.pickupStatusBadge, { backgroundColor: isPending ? '#e0f2fe' : '#dcfce7' }]}>
                          <Text style={[mStyles.pickupStatusText, { color: isPending ? '#0891b2' : '#16a34a' }]}>
                            {isPending ? 'Pickup' : 'Done'}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {recentAssignments.length > 0 && (
              <View style={mStyles.section}>
                <View style={mStyles.sectionHeader}>
                  <View style={mStyles.sectionTitleRow}>
                    <Text style={mStyles.sectionTitle}>Recent Assignments</Text>
                    <View style={mStyles.sectionCountBadge}>
                      <Text style={mStyles.sectionCountText}>{Math.min(recentAssignments.length, 5)}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => navigateToAssignments('')} style={mStyles.seeAllBtn}>
                    <Text style={mStyles.seeAllText}>See all</Text>
                    <ChevronRight size={13} color={ACCENT} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
                <View style={mStyles.assignmentCards}>
                  {recentAssignments.slice(0, 5).map((a) => {
                    const addr = (a.orders as any)?.subscription?.delivery_address;
                    const name = (a.orders as any)?.user?.full_name ?? 'Customer';
                    const addrText = addr ? [addr.street, addr.city].filter(Boolean).join(', ') : '—';
                    const statusColors: Record<string, { icon: any; color: string; bg: string }> = {
                      delivered: { icon: CheckCircle2, color: Colors.success, bg: Colors.successSurface },
                      failed: { icon: AlertCircle, color: Colors.error, bg: Colors.errorSurface },
                      picked_up: { icon: Truck, color: '#0891b2', bg: '#e0f2fe' },
                      accepted: { icon: CheckCircle2, color: Colors.primary, bg: Colors.primarySurface },
                      assigned: { icon: Loader, color: Colors.warning, bg: Colors.warningSurface },
                    };
                    const sc = statusColors[a.status] ?? statusColors.assigned;
                    const StatusIcon = sc.icon;
                    return (
                      <TouchableOpacity
                        key={a.id}
                        style={mStyles.assignmentCard}
                        onPress={() => navigateToAssignments(a.status)}
                        activeOpacity={0.8}
                      >
                        <View style={[mStyles.assignmentIconWrap, { backgroundColor: sc.bg }]}>
                          <StatusIcon size={20} color={sc.color} strokeWidth={1.8} />
                        </View>
                        <View style={mStyles.assignmentInfo}>
                          <Text style={mStyles.assignmentName} numberOfLines={1}>{name}</Text>
                          <View style={mStyles.assignmentAddrRow}>
                            <MapPin size={11} color={Colors.textTertiary} strokeWidth={1.8} />
                            <Text style={mStyles.assignmentAddr} numberOfLines={1}>{addrText}</Text>
                          </View>
                        </View>
                        <View style={[mStyles.assignmentStatusPill, { backgroundColor: sc.bg }]}>
                          <Text style={[mStyles.assignmentStatusText, { color: sc.color }]}>
                            {a.status.replace('_', ' ')}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
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
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[3] },
  metricCard: {
    width: '47%', borderRadius: Radius.lg, backgroundColor: Colors.white,
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
  assignmentCards: { gap: Spacing[3] },
  assignmentCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing[4], flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    ...Shadow.sm,
  },
  assignmentIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  assignmentInfo: { flex: 1, gap: 4 },
  assignmentName: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  assignmentAddrRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  assignmentAddr: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs,
    color: Colors.textTertiary, flex: 1,
  },
  assignmentStatusPill: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full,
  },
  assignmentStatusText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, textTransform: 'capitalize',
  },
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
  trendBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full,
  },
  trendText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.primary,
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
});
