import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Store, Package, CircleDollarSign, Clock, FileText, CircleCheck as CheckCircle, ChevronRight, TrendingUp, CircleAlert as AlertCircle, LogOut } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'expo-router';
import { addDays, format } from 'date-fns';
import StatusChip from '@/components/ui/StatusChip';

interface VendorMetrics {
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  totalPayments: number;
  pendingPayments: number;
}

interface TodayOrderItem {
  name: string;
  quantity: number;
  unitType: string;
}

const ACCENT_GOLD = '#C8962A';
const GRADIENT_TOP = '#1B3A18';
const GRADIENT_MID = '#2D5A27';
const GRADIENT_BOT = '#3D7A35';
const COMPLETED_STATUSES = ['fulfilled', 'completed', 'paid'];

export default function VendorDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, signOut } = useAuthStore();
  const isWeb = Platform.OS === 'web';
  const { width: winWidth } = useWindowDimensions();
  const isNarrowWeb = isWeb && winWidth < 768;
  const [vendor, setVendor] = useState<any>(null);
  const [metrics, setMetrics] = useState<VendorMetrics>({
    totalOrders: 0, pendingOrders: 0, completedOrders: 0,
    totalPayments: 0, pendingPayments: 0,
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [todayOrderCount, setTodayOrderCount] = useState(0);
  const [todayOrderItems, setTodayOrderItems] = useState<TodayOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!profile?.id) return;
    const { data: vendorData } = await supabase
      .from('vendors').select('*').eq('user_id', profile.id).maybeSingle();
    if (!vendorData) { setLoading(false); setRefreshing(false); return; }
    setVendor(vendorData);

    const today = format(new Date(), 'yyyy-MM-dd');
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const [ordersRes, paymentsRes, recentOrdersRes, recentPaymentsRes, todayOrdersRes] = await Promise.all([
      supabase.from('procurement_orders').select('id, status, total_amount', { count: 'exact' }).eq('vendor_id', vendorData.id),
      supabase.from('vendor_payments').select('amount, status, procurement_order_id').eq('vendor_id', vendorData.id),
      supabase.from('procurement_orders')
        .select('id, status, created_at, notes, items:procurement_order_items(id, flower_type:flower_types(display_name))')
        .eq('vendor_id', vendorData.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('vendor_payments')
        .select('id, amount, status, payment_date, payment_method, notes')
        .eq('vendor_id', vendorData.id).order('payment_date', { ascending: false }).limit(5),
      supabase.from('procurement_orders')
        .select('id', { count: 'exact' })
        .eq('vendor_id', vendorData.id)
        .gte('created_at', `${today}T00:00:00`)
        .lt('created_at', `${tomorrow}T00:00:00`),
    ]);

    const allOrders = ordersRes.data ?? [];
    const allPayments = paymentsRes.data ?? [];
    const totalPaid = allPayments.filter((p: any) => p.status === 'completed').reduce((s: number, p: any) => s + Number(p.amount), 0);

    const paidByOrder = new Map<string, number>();
    allPayments.filter((p: any) => p.status === 'completed').forEach((p: any) => {
      const oid = p.procurement_order_id as string;
      paidByOrder.set(oid, (paidByOrder.get(oid) ?? 0) + Number(p.amount));
    });

    let pendingPay = 0;
    allOrders.forEach((o: any) => {
      if (o.status === 'cancelled') return;
      const orderTotal = Number(o.total_amount) || 0;
      const paidForOrder = paidByOrder.get(o.id as string) ?? 0;
      const unpaid = orderTotal - paidForOrder;
      if (unpaid > 0) pendingPay += unpaid;
    });

    setMetrics({
      totalOrders: ordersRes.count ?? 0,
      pendingOrders: allOrders.filter((o: any) => ['draft', 'sent', 'accepted'].includes(o.status)).length,
      completedOrders: allOrders.filter((o: any) => COMPLETED_STATUSES.includes(o.status)).length,
      totalPayments: totalPaid,
      pendingPayments: pendingPay,
    });
    if (recentOrdersRes.data) setRecentOrders(recentOrdersRes.data);
    if (recentPaymentsRes.data) setRecentPayments(recentPaymentsRes.data);

    const todayOrderIds = (todayOrdersRes.data ?? []).map((order: { id: string }) => order.id);
    setTodayOrderCount(todayOrdersRes.count ?? todayOrderIds.length);
    if (todayOrderIds.length > 0) {
      const { data: itemRows } = await supabase
        .from('procurement_order_items')
        .select('quantity, unit_type, flower_type:flower_types(display_name)')
        .in('procurement_order_id', todayOrderIds);
      const itemTotals = new Map<string, TodayOrderItem>();
      (itemRows ?? []).forEach((item: any) => {
        const name = item.flower_type?.display_name ?? 'Unknown item';
        const unitType = item.unit_type ?? '';
        const key = `${name}-${unitType}`;
        const existing = itemTotals.get(key);
        if (existing) {
          existing.quantity += Number(item.quantity) || 0;
        } else {
          itemTotals.set(key, { name, quantity: Number(item.quantity) || 0, unitType });
        }
      });
      setTodayOrderItems(Array.from(itemTotals.values()));
    } else {
      setTodayOrderItems([]);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, [profile?.id]);

  const formatCurrency = (amount: number) =>
    `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const metricCards = [
    { label: 'Total Orders', value: metrics.totalOrders.toString(), icon: Package, color: Colors.primary, bg: Colors.primarySurface, route: '/(vendor)/procurement-orders', params: {} },
    { label: 'Pending Orders', value: metrics.pendingOrders.toString(), icon: Clock, color: Colors.warning, bg: Colors.warningSurface, route: '/(vendor)/procurement-orders', params: { statusFilter: 'pending' } },
    { label: 'Completed Orders', value: metrics.completedOrders.toString(), icon: CheckCircle, color: Colors.success, bg: Colors.successSurface, route: '/(vendor)/procurement-orders', params: { statusFilter: 'completed' } },
    { label: 'Total Received', value: formatCurrency(metrics.totalPayments), icon: CircleDollarSign, color: ACCENT_GOLD, bg: Colors.accentSurface, route: '/(vendor)/payments', params: { statusFilter: 'completed' } },
    { label: 'Pending Payments', value: formatCurrency(metrics.pendingPayments), icon: TrendingUp, color: Colors.secondary, bg: Colors.secondarySurface, route: '/(vendor)/payments', params: { statusFilter: 'pending' } },
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
          <View style={[wStyles.headerInner, isNarrowWeb && wStyles.headerInnerNarrow]}>
            <View style={wStyles.headerLeft}>
              <View style={wStyles.headerIconWrap}>
                <Store size={22} color={ACCENT_GOLD} strokeWidth={1.8} />
              </View>
              <View>
                <Text style={wStyles.headerEyebrow}>Vendor Portal</Text>
                <Text style={wStyles.headerTitle}>{vendor?.business_name ?? 'Dashboard'}</Text>
                {vendor?.mobile && <Text style={wStyles.headerMobile}>{vendor.mobile}</Text>}
                <Text style={wStyles.headerDate}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={wStyles.signOutButton}
              onPress={() => { void signOut(); }}
              activeOpacity={0.8}
            >
              <LogOut size={16} color={ACCENT_GOLD} strokeWidth={2} />
              <Text style={wStyles.signOutText}>Sign out</Text>
            </TouchableOpacity>
          </View>

        </LinearGradient>

        {!vendor && !loading && (
          <View style={{ padding: isNarrowWeb ? 16 : 32 }}>
            <View style={[wStyles.noVendorCard, isNarrowWeb && wStyles.noVendorCardNarrow]}>
              <AlertCircle size={36} color={Colors.textTertiary} strokeWidth={1.5} />
              <Text style={wStyles.noVendorTitle}>No vendor profile linked</Text>
              <Text style={wStyles.noVendorSub}>Your account is not associated with a vendor profile. Please contact the admin team.</Text>
            </View>
          </View>
        )}

        {vendor && (
          <View style={{ padding: isNarrowWeb ? 16 : 32, gap: 24 }}>
            <TouchableOpacity
              style={[wStyles.todayCard, isNarrowWeb && wStyles.todayCardNarrow]}
              onPress={() => router.push('/(vendor)/procurement-orders' as any)}
              activeOpacity={0.85}
            >
              <View style={wStyles.todayCardTop}>
                <View style={wStyles.todayIconWrap}><Package size={20} color={ACCENT_GOLD} strokeWidth={1.8} /></View>
                <View style={wStyles.todayHeading}>
                  <Text style={wStyles.todayEyebrow}>Today’s Orders</Text>
                  <Text style={wStyles.todayCount}>{loading ? '—' : todayOrderCount}</Text>
                  <Text style={wStyles.todayCountLabel}>total orders created today</Text>
                </View>
                <ChevronRight size={18} color={ACCENT_GOLD} />
              </View>
              <View style={wStyles.todayItems}>
                {todayOrderItems.length === 0 ? (
                  <Text style={wStyles.todayEmpty}>No item quantities recorded for today</Text>
                ) : todayOrderItems.map((item) => (
                  <View key={`${item.name}-${item.unitType}`} style={wStyles.todayItemRow}>
                    <Text style={wStyles.todayItemName}>{item.name}</Text>
                    <Text style={wStyles.todayItemQuantity}>{item.quantity} {item.unitType}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
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

            <View style={[wStyles.tablesRow, isNarrowWeb && { flexDirection: 'column' }]}>
              <TouchableOpacity
                style={[wStyles.tableCard, isNarrowWeb && wStyles.tableCardNarrow]}
                onPress={() => router.push('/(vendor)/procurement-orders' as any)}
                activeOpacity={0.98}
              >
                <View style={wStyles.tableHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Package size={16} color={Colors.primary} strokeWidth={1.8} />
                    <Text style={wStyles.tableTitle}>Recent Procurement Orders</Text>
                  </View>
                  <TouchableOpacity onPress={() => router.push('/(vendor)/procurement-orders' as any)}>
                    <Text style={wStyles.viewAllBtn}>View all</Text>
                  </TouchableOpacity>
                </View>
                <View style={[wStyles.tableHead, isNarrowWeb && { display: 'none' }]}>
                  <Text style={[wStyles.thCell, { flex: 1.5 }]}>Date</Text>
                  <Text style={[wStyles.thCell, { flex: 2 }]}>Items</Text>
                  <Text style={[wStyles.thCell, { flex: 1 }]}>Status</Text>
                </View>
                {recentOrders.length === 0 ? (
                  <View style={wStyles.emptyState}><Text style={wStyles.emptyText}>No procurement orders yet</Text></View>
                ) : (
                  recentOrders.map((order: any, i: number) => (
                    <TouchableOpacity
                      key={order.id}
                      style={[wStyles.tableRow, i % 2 === 1 && wStyles.tableRowAlt, isNarrowWeb && { flexDirection: 'column', alignItems: 'stretch', gap: 6, paddingVertical: 12 }]}
                      onPress={() => router.push('/(vendor)/procurement-orders' as any)}
                      activeOpacity={0.7}
                    >
                      <Text style={[wStyles.tdCell, { flex: 1.5 }]}>{order.created_at ? format(new Date(order.created_at), 'dd MMM yyyy') : '—'}</Text>
                      <Text style={[wStyles.tdCell, { flex: 2 }]} numberOfLines={1}>
                        {(order.items ?? []).length === 0
                          ? '—'
                          : (order.items ?? []).slice(0, 3).map((item: any) => item.flower_type?.display_name ?? 'Unknown').join(', ') + ((order.items ?? []).length > 3 ? ', ...' : '')}
                      </Text>
                      <View style={{ flex: 1 }}><StatusChip status={order.status} /></View>
                    </TouchableOpacity>
                  ))
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[wStyles.tableCard, { flex: 1 }, isNarrowWeb && wStyles.tableCardNarrow]}
                onPress={() => router.push('/(vendor)/payments' as any)}
                activeOpacity={0.98}
              >
                <View style={wStyles.tableHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <CircleDollarSign size={16} color={ACCENT_GOLD} strokeWidth={1.8} />
                    <Text style={wStyles.tableTitle}>Recent Payments</Text>
                  </View>
                  <TouchableOpacity onPress={() => router.push('/(vendor)/payments' as any)}>
                    <Text style={wStyles.viewAllBtn}>View all</Text>
                  </TouchableOpacity>
                </View>
                <View style={[wStyles.tableHead, isNarrowWeb && { display: 'none' }]}>
                  <Text style={[wStyles.thCell, { flex: 1 }]}>Date</Text>
                  <Text style={[wStyles.thCell, { flex: 1 }]}>Amount</Text>
                  <Text style={[wStyles.thCell, { flex: 1 }]}>Status</Text>
                </View>
                {recentPayments.length === 0 ? (
                  <View style={wStyles.emptyState}><Text style={wStyles.emptyText}>No payments yet</Text></View>
                ) : (
                  recentPayments.map((pmt: any, i: number) => (
                    <View key={pmt.id} style={[wStyles.tableRow, i % 2 === 1 && wStyles.tableRowAlt, isNarrowWeb && { flexDirection: 'column', alignItems: 'stretch', gap: 6, paddingVertical: 12 }]}>
                      <Text style={[wStyles.tdCell, { flex: 1 }]}>{pmt.payment_date ? format(new Date(pmt.payment_date), 'dd MMM yyyy') : '—'}</Text>
                      <Text style={[wStyles.tdCell, { flex: 1, fontFamily: Typography.fontFamily.sansSemiBold }]}>{formatCurrency(Number(pmt.amount))}</Text>
                      <View style={{ flex: 1 }}><StatusChip status={pmt.status} /></View>
                    </View>
                  ))
                )}
              </TouchableOpacity>
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
              {vendor?.mobile && <Text style={mStyles.headerMobile}>{vendor.mobile}</Text>}
              <Text style={mStyles.headerDate}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={mStyles.signOutButton}
            onPress={() => { void signOut(); }}
            activeOpacity={0.8}
          >
            <LogOut size={15} color={ACCENT_GOLD} strokeWidth={2} />
            <Text style={mStyles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>


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
          <View style={mStyles.dashboardContent}>
            <TouchableOpacity
              style={mStyles.todayCard}
              onPress={() => router.push('/(vendor)/procurement-orders' as any)}
              activeOpacity={0.85}
            >
              <View style={mStyles.todayCardTop}>
                <View style={mStyles.todayIconWrap}><Package size={18} color={ACCENT_GOLD} strokeWidth={1.8} /></View>
                <View style={mStyles.todayHeading}>
                  <Text style={mStyles.todayEyebrow}>Today’s Orders</Text>
                  <View style={mStyles.todayCountRow}>
                    <Text style={mStyles.todayCount}>{loading ? '—' : todayOrderCount}</Text>
                    <Text style={mStyles.todayCountLabel}>total orders</Text>
                  </View>
                </View>
                <ChevronRight size={17} color={ACCENT_GOLD} />
              </View>
              <View style={mStyles.todayItems}>
                {todayOrderItems.length === 0 ? (
                  <Text style={mStyles.todayEmpty}>No item quantities recorded for today</Text>
                ) : todayOrderItems.map((item) => (
                  <View key={`${item.name}-${item.unitType}`} style={mStyles.todayItemRow}>
                    <Text style={mStyles.todayItemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={mStyles.todayItemQuantity}>{item.quantity} {item.unitType}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
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

            <TouchableOpacity
              style={mStyles.section}
              onPress={() => router.push('/(vendor)/procurement-orders' as any)}
              activeOpacity={0.98}
            >
                <View style={mStyles.sectionHeader}>
                  <Text style={mStyles.sectionTitle}>Recent Orders</Text>
                  <TouchableOpacity onPress={() => router.push('/(vendor)/procurement-orders' as any)} style={mStyles.seeAllBtn}>
                    <Text style={mStyles.seeAllText}>See all</Text>
                    <ChevronRight size={13} color={Colors.primary} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
                <View style={mStyles.listCard}>
                  {recentOrders.length === 0 ? (
                    <View style={mStyles.emptyList}><Text style={mStyles.emptyListText}>No procurement orders yet</Text></View>
                  ) : (
                  recentOrders.map((order: any, i: number) => (
                    <TouchableOpacity
                      key={order.id}
                      style={[mStyles.listRow, i === recentOrders.length - 1 && mStyles.listRowLast]}
                      onPress={() => router.push('/(vendor)/procurement-orders' as any)}
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
                          {order.requirement_date ? `Required: ${format(new Date(order.requirement_date), 'dd MMM')}` : ''}
                        </Text>
                        {order.items && order.items.length > 0 && (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                            {order.items.slice(0, 2).map((item: any, idx: number) => (
                              <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primarySurface, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ fontFamily: Typography.fontFamily.sansMedium, fontSize: 10, color: Colors.primary }}>
                                  {item.flower_type?.display_name ?? 'Unknown'} · {item.quantity} {item.unit_type ?? ''}
                                </Text>
                              </View>
                            ))}
                            {order.items.length > 2 && (
                              <Text style={{ fontFamily: Typography.fontFamily.sansMedium, fontSize: 10, color: Colors.textTertiary, alignSelf: 'center' }}>
                                +{order.items.length - 2} more
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                      <StatusChip status={order.status} />
                      <ChevronRight size={14} color={Colors.neutral[300]} />
                    </TouchableOpacity>
                  ))
                  )}
                </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={mStyles.section}
              onPress={() => router.push('/(vendor)/payments' as any)}
              activeOpacity={0.98}
            >
                <View style={mStyles.sectionHeader}>
                  <Text style={mStyles.sectionTitle}>Recent Payments</Text>
                  <TouchableOpacity onPress={() => router.push('/(vendor)/payments' as any)} style={mStyles.seeAllBtn}>
                    <Text style={mStyles.seeAllText}>See all</Text>
                    <ChevronRight size={13} color={Colors.primary} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
                <View style={mStyles.listCard}>
                  {recentPayments.length === 0 ? (
                    <View style={mStyles.emptyList}><Text style={mStyles.emptyListText}>No payments yet</Text></View>
                  ) : (
                  recentPayments.map((pmt: any, i: number) => (
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
                  ))
                  )}
                </View>
            </TouchableOpacity>
          </View>
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
  signOutButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(200,150,42,0.65)',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  signOutText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs,
    color: '#FFFFFF',
  },
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
  headerMobile: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.82)', marginTop: 4,
  },
  headerDate: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs,
    color: 'rgba(255,255,255,0.58)', marginTop: 3,
  },
  scrollContent: { padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[10] },
  dashboardContent: { width: '100%', gap: Spacing[4] },
  todayCard: {
    width: '100%', backgroundColor: '#1B3A18', borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(200,150,42,0.35)', overflow: 'hidden', ...Shadow.md,
  },
  todayCardTop: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[4],
  },
  todayIconWrap: {
    width: 42, height: 42, borderRadius: 13,
    backgroundColor: 'rgba(200,150,42,0.18)', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  todayHeading: { flex: 1, gap: 2 },
  todayEyebrow: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs,
    color: ACCENT_GOLD, letterSpacing: 0.8, textTransform: 'uppercase',
  },
  todayCountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  todayCount: {
    fontFamily: Typography.fontFamily.bold, fontSize: 28, color: '#FFFFFF', letterSpacing: -0.5,
  },
  todayCountLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs,
    color: 'rgba(255,255,255,0.6)',
  },
  todayItems: {
    paddingHorizontal: Spacing[4], paddingBottom: Spacing[3], gap: 1,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
  },
  todayItemRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing[2],
  },
  todayItemName: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.88)', flex: 1,
  },
  todayItemQuantity: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm,
    color: ACCENT_GOLD,
  },
  todayEmpty: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.5)', paddingVertical: Spacing[3], textAlign: 'center',
  },
  noVendorCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: Spacing[6],
    alignItems: 'center', gap: Spacing[3], borderWidth: 1, borderColor: Colors.border,
  },
  noVendorText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center',
  },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[3], alignContent: 'flex-start' },
  metricCard: {
    width: '46%', backgroundColor: Colors.white, borderRadius: Radius.lg,
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
  section: { width: '100%', gap: Spacing[2] },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 24 },
  sectionTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.primary,
  },
  listCard: {
    width: '100%', backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', minHeight: 56, ...Shadow.sm,
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
  emptyList: { minHeight: 56, paddingVertical: Spacing[4], alignItems: 'center', justifyContent: 'center' },
  emptyListText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
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
  headerInnerNarrow: {
    flexDirection: 'column', gap: 16, paddingHorizontal: 16, paddingTop: 24, paddingBottom: 16,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  signOutButton: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(200,150,42,0.65)',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  signOutText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm,
    color: '#FFFFFF',
  },
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
  headerMobile: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.82)', marginTop: 3,
  },
  headerDate: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs,
    color: 'rgba(255,255,255,0.58)', marginTop: 3,
  },
  noVendorCard: {
    backgroundColor: Colors.white, borderRadius: 20, padding: 40,
    alignItems: 'center', gap: 12, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  noVendorCardNarrow: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 24,
    alignItems: 'center', gap: 12, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  noVendorTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  noVendorSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 400 },
  todayCard: {
    backgroundColor: '#1B3A18', borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(200,150,42,0.35)', overflow: 'hidden', ...Shadow.md,
  },
  todayCardNarrow: {
    backgroundColor: '#1B3A18', borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(200,150,42,0.35)', overflow: 'hidden', ...Shadow.md,
  },
  todayCardTop: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 24, paddingVertical: 20,
  },
  todayIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: 'rgba(200,150,42,0.18)', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  todayHeading: { flex: 1, gap: 3 },
  todayEyebrow: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: 11,
    color: ACCENT_GOLD, letterSpacing: 1, textTransform: 'uppercase',
  },
  todayCount: {
    fontFamily: Typography.fontFamily.bold, fontSize: 32, color: '#FFFFFF', letterSpacing: -0.5,
  },
  todayCountLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.6)', marginTop: 2,
  },
  todayItems: {
    paddingHorizontal: 24, paddingBottom: 16, gap: 1,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
  },
  todayItemRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10,
  },
  todayItemName: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.88)', flex: 1,
  },
  todayItemQuantity: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm,
    color: ACCENT_GOLD,
  },
  todayEmpty: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.5)', paddingVertical: 14, textAlign: 'center',
  },
  metricsGrid: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  metricCard: {
    flex: 1, minWidth: 140, backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: 20, borderWidth: 1, borderColor: Colors.border, gap: 8, ...Shadow.sm,
  },
  metricIconWrap: {
    width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
  },
  metricValue: { fontFamily: Typography.fontFamily.bold, fontSize: 22, color: Colors.textPrimary, letterSpacing: -0.3 },
  metricLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  tablesRow: { flexDirection: 'row', gap: 18 },
  tableCard: {
    flex: 2, backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  tableCardNarrow: {
    flex: 0, backgroundColor: Colors.white, borderRadius: Radius.lg,
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
