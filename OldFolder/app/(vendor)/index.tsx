import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Store, Package, CircleDollarSign, Clock, LogOut, FileText, CircleCheck as CheckCircle, ChevronRight, TrendingUp, CircleAlert as AlertCircle } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import StatusChip from '@/components/ui/StatusChip';

interface VendorMetrics {
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  totalPayments: number;
  pendingPayments: number;
}

const ACCENT_GOLD = '#C8962A';
const GRADIENT_TOP = '#1B3A18';
const GRADIENT_MID = '#2D5A27';
const GRADIENT_BOT = '#3D7A35';

export default function VendorDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, signOut } = useAuthStore();
  const isWeb = Platform.OS === 'web';
  const [vendor, setVendor] = useState<any>(null);
  const [metrics, setMetrics] = useState<VendorMetrics>({
    totalOrders: 0, pendingOrders: 0, completedOrders: 0,
    totalPayments: 0, pendingPayments: 0,
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!profile?.id) return;
    const { data: vendorData } = await supabase
      .from('vendors').select('*').eq('user_id', profile.id).maybeSingle();
    if (!vendorData) { setLoading(false); setRefreshing(false); return; }
    setVendor(vendorData);

    const [ordersRes, paymentsRes, recentOrdersRes, recentPaymentsRes] = await Promise.all([
      supabase.from('procurement_orders').select('status', { count: 'exact' }).eq('vendor_id', vendorData.id),
      supabase.from('vendor_payments').select('amount, status').eq('vendor_id', vendorData.id),
      supabase.from('procurement_orders')
        .select('id, status, required_date, created_at, notes')
        .eq('vendor_id', vendorData.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('vendor_payments')
        .select('id, amount, status, payment_date, payment_method, notes')
        .eq('vendor_id', vendorData.id).order('payment_date', { ascending: false }).limit(5),
    ]);

    const allOrders = ordersRes.data ?? [];
    const allPayments = paymentsRes.data ?? [];
    const totalPaid = allPayments.filter((p: any) => p.status === 'completed').reduce((s: number, p: any) => s + Number(p.amount), 0);
    const pendingPay = allPayments.filter((p: any) => p.status === 'pending').reduce((s: number, p: any) => s + Number(p.amount), 0);

    setMetrics({
      totalOrders: ordersRes.count ?? 0,
      pendingOrders: allOrders.filter((o: any) => ['draft', 'sent', 'accepted'].includes(o.status)).length,
      completedOrders: allOrders.filter((o: any) => o.status === 'completed').length,
      totalPayments: totalPaid,
      pendingPayments: pendingPay,
    });
    if (recentOrdersRes.data) setRecentOrders(recentOrdersRes.data);
    if (recentPaymentsRes.data) setRecentPayments(recentPaymentsRes.data);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, [profile?.id]);

  const formatCurrency = (amount: number) =>
    `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const metricCards = [
    { label: 'Total Orders', value: metrics.totalOrders.toString(), icon: Package, color: Colors.primary, bg: Colors.primarySurface, route: '/(vendor)/procurement-orders', params: {} },
    { label: 'Pending', value: metrics.pendingOrders.toString(), icon: Clock, color: Colors.warning, bg: Colors.warningSurface, route: '/(vendor)/procurement-orders', params: { statusFilter: 'pending' } },
    { label: 'Completed', value: metrics.completedOrders.toString(), icon: CheckCircle, color: Colors.success, bg: Colors.successSurface, route: '/(vendor)/procurement-orders', params: { statusFilter: 'completed' } },
    { label: 'Received', value: formatCurrency(metrics.totalPayments), icon: CircleDollarSign, color: ACCENT_GOLD, bg: Colors.accentSurface, route: '/(vendor)/payments', params: { statusFilter: 'completed' } },
  ];

  if (isWeb) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: '#F0EDE8' }}
        contentContainerStyle={{ paddingBottom: 64 }}
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
                <Store size={22} color={ACCENT_GOLD} strokeWidth={1.8} />
              </View>
              <View>
                <Text style={wStyles.headerEyebrow}>Vendor Portal</Text>
                <Text style={wStyles.headerTitle}>{vendor?.business_name ?? 'Dashboard'}</Text>
                <Text style={wStyles.headerDate}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
              </View>
            </View>
            <View style={wStyles.headerRight}>
              <TouchableOpacity style={wStyles.refreshBtn} onPress={() => { setRefreshing(true); load(); }}>
                <Text style={wStyles.refreshText}>Refresh</Text>
              </TouchableOpacity>
              <TouchableOpacity style={wStyles.signOutBtn} onPress={signOut}>
                <LogOut size={16} color='rgba(255,255,255,0.75)' strokeWidth={1.8} />
                <Text style={wStyles.signOutText}>Sign out</Text>
              </TouchableOpacity>
            </View>
          </View>

          {vendor && (
            <View style={wStyles.profileCard}>
              <View style={wStyles.profileLeft}>
                <View style={wStyles.avatarCircle}>
                  <Text style={wStyles.avatarText}>{(vendor.business_name ?? 'V')[0].toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={wStyles.profileName}>{vendor.business_name}</Text>
                  <Text style={wStyles.profileMeta}>{vendor.contact_person} · {vendor.mobile}</Text>
                  {vendor.city && <Text style={wStyles.profileCity}>{vendor.city}</Text>}
                </View>
              </View>
              <View style={[wStyles.statusPill, { backgroundColor: vendor.is_active ? 'rgba(46,125,50,0.18)' : 'rgba(198,40,40,0.15)' }]}>
                <View style={[wStyles.statusDot, { backgroundColor: vendor.is_active ? '#4CAF50' : Colors.error }]} />
                <Text style={[wStyles.statusPillText, { color: vendor.is_active ? '#4CAF50' : Colors.error }]}>
                  {vendor.is_active ? 'Active' : 'Inactive'}
                </Text>
              </View>
            </View>
          )}
        </LinearGradient>

        {!vendor && !loading && (
          <View style={{ padding: 32 }}>
            <View style={wStyles.noVendorCard}>
              <AlertCircle size={36} color={Colors.textTertiary} strokeWidth={1.5} />
              <Text style={wStyles.noVendorTitle}>No vendor profile linked</Text>
              <Text style={wStyles.noVendorSub}>Your account is not associated with a vendor profile. Please contact the admin team.</Text>
            </View>
          </View>
        )}

        {vendor && (
          <View style={{ padding: 32, gap: 24 }}>
            <View style={wStyles.metricsGrid}>
              {[
                { label: 'Total Orders', value: metrics.totalOrders.toString(), icon: Package, color: Colors.primary, bg: Colors.primarySurface, route: '/(vendor)/procurement-orders', params: {} },
                { label: 'Pending Orders', value: metrics.pendingOrders.toString(), icon: Clock, color: Colors.warning, bg: Colors.warningSurface, route: '/(vendor)/procurement-orders', params: { statusFilter: 'pending' } },
                { label: 'Completed Orders', value: metrics.completedOrders.toString(), icon: CheckCircle, color: Colors.success, bg: Colors.successSurface, route: '/(vendor)/procurement-orders', params: { statusFilter: 'completed' } },
                { label: 'Total Received', value: formatCurrency(metrics.totalPayments), icon: CircleDollarSign, color: ACCENT_GOLD, bg: Colors.accentSurface, route: '/(vendor)/payments', params: { statusFilter: 'completed' } },
                { label: 'Pending Payments', value: formatCurrency(metrics.pendingPayments), icon: TrendingUp, color: Colors.secondary, bg: Colors.secondarySurface, route: '/(vendor)/payments', params: { statusFilter: 'pending' } },
              ].map((card) => {
                const Icon = card.icon;
                return (
                  <TouchableOpacity key={card.label} style={wStyles.metricCard}
                    onPress={() => router.push({ pathname: card.route as any, params: card.params })} activeOpacity={0.75}>
                    <View style={[wStyles.metricIconWrap, { backgroundColor: card.bg }]}>
                      <Icon size={20} color={card.color} strokeWidth={1.8} />
                    </View>
                    <Text style={wStyles.metricValue}>{loading ? '—' : card.value}</Text>
                    <Text style={wStyles.metricLabel}>{card.label}</Text>
                    <ChevronRight size={14} color={Colors.neutral[300]} style={{ position: 'absolute', top: 16, right: 16 }} />
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={wStyles.tablesRow}>
              <View style={wStyles.tableCard}>
                <View style={wStyles.tableHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Package size={16} color={Colors.primary} strokeWidth={1.8} />
                    <Text style={wStyles.tableTitle}>Recent Procurement Orders</Text>
                  </View>
                  <TouchableOpacity onPress={() => router.push('/(vendor)/procurement-orders' as any)}>
                    <Text style={wStyles.viewAllBtn}>View all</Text>
                  </TouchableOpacity>
                </View>
                <View style={wStyles.tableHead}>
                  <Text style={[wStyles.thCell, { flex: 1 }]}>Date</Text>
                  <Text style={[wStyles.thCell, { flex: 1 }]}>Required By</Text>
                  <Text style={[wStyles.thCell, { flex: 1 }]}>Status</Text>
                </View>
                {recentOrders.length === 0 ? (
                  <View style={wStyles.emptyState}><Text style={wStyles.emptyText}>No procurement orders yet</Text></View>
                ) : (
                  recentOrders.map((order: any, i: number) => (
                    <View key={order.id} style={[wStyles.tableRow, i % 2 === 1 && wStyles.tableRowAlt]}>
                      <Text style={[wStyles.tdCell, { flex: 1 }]}>{order.created_at ? format(new Date(order.created_at), 'dd MMM yyyy') : '—'}</Text>
                      <Text style={[wStyles.tdCell, { flex: 1 }]}>{order.required_date ? format(new Date(order.required_date), 'dd MMM yyyy') : '—'}</Text>
                      <View style={{ flex: 1 }}><StatusChip status={order.status} /></View>
                    </View>
                  ))
                )}
              </View>

              <View style={[wStyles.tableCard, { flex: 1 }]}>
                <View style={wStyles.tableHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <CircleDollarSign size={16} color={ACCENT_GOLD} strokeWidth={1.8} />
                    <Text style={wStyles.tableTitle}>Recent Payments</Text>
                  </View>
                  <TouchableOpacity onPress={() => router.push('/(vendor)/payments' as any)}>
                    <Text style={wStyles.viewAllBtn}>View all</Text>
                  </TouchableOpacity>
                </View>
                <View style={wStyles.tableHead}>
                  <Text style={[wStyles.thCell, { flex: 1 }]}>Date</Text>
                  <Text style={[wStyles.thCell, { flex: 1 }]}>Amount</Text>
                  <Text style={[wStyles.thCell, { flex: 1 }]}>Status</Text>
                </View>
                {recentPayments.length === 0 ? (
                  <View style={wStyles.emptyState}><Text style={wStyles.emptyText}>No payments yet</Text></View>
                ) : (
                  recentPayments.map((pmt: any, i: number) => (
                    <View key={pmt.id} style={[wStyles.tableRow, i % 2 === 1 && wStyles.tableRowAlt]}>
                      <Text style={[wStyles.tdCell, { flex: 1 }]}>{pmt.payment_date ? format(new Date(pmt.payment_date), 'dd MMM yyyy') : '—'}</Text>
                      <Text style={[wStyles.tdCell, { flex: 1, fontFamily: Typography.fontFamily.sansSemiBold }]}>{formatCurrency(Number(pmt.amount))}</Text>
                      <View style={{ flex: 1 }}><StatusChip status={pmt.status} /></View>
                    </View>
                  ))
                )}
              </View>
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
            <View style={mStyles.storeIconWrap}>
              <Store size={18} color={ACCENT_GOLD} strokeWidth={1.8} />
            </View>
            <View>
              <Text style={mStyles.headerEyebrow}>Vendor Portal</Text>
              <Text style={mStyles.headerTitle} numberOfLines={1}>{vendor?.business_name ?? 'Dashboard'}</Text>
            </View>
          </View>
          <TouchableOpacity style={mStyles.signOutBtn} onPress={signOut} activeOpacity={0.7}>
            <LogOut size={16} color='rgba(255,255,255,0.7)' strokeWidth={1.8} />
          </TouchableOpacity>
        </View>

        {vendor && (
          <View style={mStyles.vendorRow}>
            <View style={mStyles.vendorAvatarSmall}>
              <Text style={mStyles.vendorAvatarText}>{(vendor.business_name ?? 'V')[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={mStyles.vendorContact}>{vendor.contact_person} · {vendor.mobile}</Text>
              {vendor.city && <Text style={mStyles.vendorCity}>{vendor.city}</Text>}
            </View>
            <View style={[mStyles.activePill, { backgroundColor: vendor.is_active ? 'rgba(76,175,80,0.2)' : 'rgba(198,40,40,0.2)' }]}>
              <Text style={[mStyles.activePillText, { color: vendor.is_active ? '#4CAF50' : Colors.error }]}>
                {vendor.is_active ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>
        )}

        <Text style={mStyles.dateText}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={mStyles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={ACCENT_GOLD} />}
      >
        {!vendor && !loading && (
          <View style={mStyles.noVendorCard}>
            <AlertCircle size={28} color={Colors.textTertiary} strokeWidth={1.5} />
            <Text style={mStyles.noVendorText}>No vendor profile linked. Contact admin.</Text>
          </View>
        )}

        {vendor && (
          <>
            <View style={mStyles.metricsGrid}>
              {metricCards.map((card) => {
                const Icon = card.icon;
                return (
                  <TouchableOpacity
                    key={card.label}
                    style={mStyles.metricCard}
                    onPress={() => router.push({ pathname: card.route as any, params: card.params })}
                    activeOpacity={0.75}
                  >
                    <View style={[mStyles.metricIconWrap, { backgroundColor: card.bg }]}>
                      <Icon size={18} color={card.color} strokeWidth={1.8} />
                    </View>
                    <Text style={[mStyles.metricValue, { color: card.color }]}>{loading ? '—' : card.value}</Text>
                    <Text style={mStyles.metricLabel}>{card.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {recentOrders.length > 0 && (
              <View style={mStyles.section}>
                <View style={mStyles.sectionHeader}>
                  <Text style={mStyles.sectionTitle}>Recent Orders</Text>
                  <TouchableOpacity onPress={() => router.push('/(vendor)/procurement-orders' as any)} style={mStyles.seeAllBtn}>
                    <Text style={mStyles.seeAllText}>See all</Text>
                    <ChevronRight size={13} color={Colors.primary} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
                <View style={mStyles.listCard}>
                  {recentOrders.map((order: any, i: number) => (
                    <TouchableOpacity
                      key={order.id}
                      style={[mStyles.listRow, i === recentOrders.length - 1 && mStyles.listRowLast]}
                      onPress={() => router.push({ pathname: '/(vendor)/procurement-order-detail', params: { id: order.id } })}
                      activeOpacity={0.7}
                    >
                      <View style={[mStyles.listIconWrap, { backgroundColor: Colors.primarySurface }]}>
                        <FileText size={16} color={Colors.primary} strokeWidth={1.8} />
                      </View>
                      <View style={mStyles.listInfo}>
                        <Text style={mStyles.listPrimary}>
                          {order.created_at ? format(new Date(order.created_at), 'dd MMM yyyy') : '—'}
                        </Text>
                        <Text style={mStyles.listSecondary}>
                          {order.required_date ? `Required: ${format(new Date(order.required_date), 'dd MMM')}` : ''}
                        </Text>
                      </View>
                      <StatusChip status={order.status} />
                      <ChevronRight size={14} color={Colors.neutral[300]} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {recentPayments.length > 0 && (
              <View style={mStyles.section}>
                <View style={mStyles.sectionHeader}>
                  <Text style={mStyles.sectionTitle}>Recent Payments</Text>
                  <TouchableOpacity onPress={() => router.push('/(vendor)/payments' as any)} style={mStyles.seeAllBtn}>
                    <Text style={mStyles.seeAllText}>See all</Text>
                    <ChevronRight size={13} color={Colors.primary} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
                <View style={mStyles.listCard}>
                  {recentPayments.map((pmt: any, i: number) => (
                    <View key={pmt.id} style={[mStyles.listRow, i === recentPayments.length - 1 && mStyles.listRowLast]}>
                      <View style={[mStyles.listIconWrap, { backgroundColor: Colors.accentSurface }]}>
                        <CircleDollarSign size={16} color={ACCENT_GOLD} strokeWidth={1.8} />
                      </View>
                      <View style={mStyles.listInfo}>
                        <Text style={mStyles.listPrimary}>{formatCurrency(Number(pmt.amount))}</Text>
                        <Text style={mStyles.listSecondary}>
                          {pmt.payment_date ? format(new Date(pmt.payment_date), 'dd MMM yyyy') : '—'}
                        </Text>
                      </View>
                      <StatusChip status={pmt.status} />
                    </View>
                  ))}
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
  container: { flex: 1, backgroundColor: '#F0EDE8' },
  gradientHeader: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[5],
    gap: Spacing[3],
  },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], flex: 1 },
  storeIconWrap: {
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
  vendorRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.lg, padding: Spacing[3],
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  vendorAvatarSmall: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(212,168,83,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  vendorAvatarText: {
    fontFamily: Typography.fontFamily.bold, fontSize: 16, color: ACCENT_GOLD,
  },
  vendorContact: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: 'rgba(255,255,255,0.9)',
  },
  vendorCity: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.55)',
  },
  activePill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full,
  },
  activePillText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11,
  },
  dateText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.3,
  },
  scrollContent: { padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[10] },
  noVendorCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: Spacing[6],
    alignItems: 'center', gap: Spacing[3], borderWidth: 1, borderColor: Colors.border,
  },
  noVendorText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center',
  },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[3] },
  metricCard: {
    width: '47%', backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: Spacing[4], gap: Spacing[2],
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
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
  section: { gap: Spacing[2] },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.primary,
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
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  listInfo: { flex: 1, gap: 2 },
  listPrimary: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary,
  },
  listSecondary: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
});

const wStyles = StyleSheet.create({
  gradientHeader: {
    paddingTop: 0,
    paddingBottom: 0,
  },
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  refreshBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  refreshText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: 'rgba(255,255,255,0.85)',
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
    backgroundColor: 'rgba(212,168,83,0.25)', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: Typography.fontFamily.bold, fontSize: 22, color: ACCENT_GOLD },
  profileName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: '#FFFFFF' },
  profileMeta: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  profileCity: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.45)', marginTop: 1 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusPillText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 13 },
  noVendorCard: {
    backgroundColor: Colors.white, borderRadius: 20, padding: 40,
    alignItems: 'center', gap: 12, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  noVendorTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  noVendorSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 400 },
  metricsGrid: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  metricCard: {
    flex: 1, minWidth: 160, backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: 20, borderWidth: 1, borderColor: Colors.border, gap: 8, ...Shadow.sm,
  },
  metricIconWrap: {
    width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
  },
  metricValue: { fontFamily: Typography.fontFamily.bold, fontSize: 26, color: Colors.textPrimary, letterSpacing: -0.3 },
  metricLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  tablesRow: { flexDirection: 'row', gap: 18 },
  tableCard: {
    flex: 2, backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  tableHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tableTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  viewAllBtn: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.primary },
  tableHead: {
    flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: Colors.neutral[50], borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  thCell: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs,
    color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: Colors.neutral[50],
  },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  tdCell: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  emptyState: { paddingVertical: 32, alignItems: 'center' },
  emptyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
});
