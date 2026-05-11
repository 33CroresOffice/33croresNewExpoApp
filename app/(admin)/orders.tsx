import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Platform,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, ChevronRight, Flower2, Package, Timer, CirclePause as PauseCircle } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import StatusChip from '@/components/ui/StatusChip';
import { format } from 'date-fns';

type OrderTab = 'subscription' | 'custom';
type SubStatusFilter = 'all' | 'active' | 'expired' | 'paused' | 'paused_today' | 'paused_tomorrow' | 'expiring_soon' | 'resumed_today' | 'resumed_tomorrow';
type CustomFilter = 'all' | 'today' | 'next5' | 'unpaid' | 'pending';

const SUB_STATUS_FILTERS: { label: string; value: SubStatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Expired', value: 'expired' },
  { label: 'Paused', value: 'paused' },
  { label: 'Paused Today', value: 'paused_today' },
  { label: 'Tomorrow Paused', value: 'paused_tomorrow' },
  { label: 'Expiring Soon', value: 'expiring_soon' },
  { label: 'Today Resumed', value: 'resumed_today' },
  { label: 'Tomorrow Resumed', value: 'resumed_tomorrow' },
];

const CUSTOM_FILTERS: { label: string; value: CustomFilter }[] = [
  { label: 'All', value: 'all' },
  { label: "Today's Orders", value: 'today' },
  { label: 'Next 5 Days', value: 'next5' },
  { label: 'Unpaid', value: 'unpaid' },
  { label: 'Pending', value: 'pending' },
];

export default function AdminOrdersScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const params = useLocalSearchParams<{ tab?: string; subFilter?: string; customFilter?: CustomFilter }>();

  const [activeTab, setActiveTab] = useState<OrderTab>(params.tab === 'custom' ? 'custom' : 'subscription');
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [customOrders, setCustomOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [subFilter, setSubFilter] = useState<SubStatusFilter>((params.subFilter as SubStatusFilter) ?? 'all');
  const [customFilter, setCustomFilter] = useState<CustomFilter>(params.customFilter ?? 'all');
  const [customError, setCustomError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (params.tab === 'custom') setActiveTab('custom');
    if (params.subFilter) setSubFilter(params.subFilter as SubStatusFilter);
    if (params.customFilter) setCustomFilter(params.customFilter);
  }, [params.tab, params.subFilter, params.customFilter]);

  const load = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      const next5 = new Date();
      next5.setDate(next5.getDate() + 5);
      const next5Str = next5.toISOString().split('T')[0];

      // Subscription query — active filter must exclude currently-paused subs
      let subQuery = supabase
        .from('subscriptions')
        .select('id, user_id, status, start_date, end_date, pause_start_date, pause_until, created_at, user:profiles(full_name, mobile), plan:subscription_plans(name, frequency, image_url)')
        .order('created_at', { ascending: false })
        .limit(200);

      if (subFilter === 'paused') {
        subQuery = subQuery
          .eq('status', 'active')
          .not('pause_start_date', 'is', null)
          .not('pause_until', 'is', null)
          .lte('pause_start_date', today)
          .gte('pause_until', today);
      } else if (subFilter === 'paused_today') {
        subQuery = subQuery
          .eq('status', 'active')
          .not('pause_start_date', 'is', null)
          .not('pause_until', 'is', null)
          .lte('pause_start_date', today)
          .gte('pause_until', today);
      } else if (subFilter === 'paused_tomorrow') {
        subQuery = subQuery
          .eq('status', 'active')
          .not('pause_start_date', 'is', null)
          .not('pause_until', 'is', null)
          .lte('pause_start_date', tomorrowStr)
          .gte('pause_until', tomorrowStr);
      } else if (subFilter === 'active') {
        // Active but NOT currently paused
        subQuery = subQuery
          .eq('status', 'active')
          .or(`pause_until.is.null,pause_until.lt.${today}`);
      } else if (subFilter === 'expired') {
        subQuery = subQuery.eq('status', 'expired');
      } else if (subFilter === 'expiring_soon') {
        // Active subs whose end_date falls within today → next 5 days
        subQuery = subQuery
          .eq('status', 'active')
          .gte('end_date', today)
          .lte('end_date', next5Str)
          .order('end_date', { ascending: true });
      } else if (subFilter === 'resumed_today') {
        // pause ends yesterday → subscription resumes today
        subQuery = subQuery
          .eq('status', 'active')
          .eq('pause_until', yesterdayStr);
      } else if (subFilter === 'resumed_tomorrow') {
        // pause ends today → subscription resumes tomorrow
        subQuery = subQuery
          .eq('status', 'active')
          .eq('pause_until', today);
      }
      // 'all' — no extra filter

      // Custom orders query with filter applied server-side where possible
      let customQuery = supabase
        .from('custom_orders')
        .select('*, user:profiles(full_name, mobile)')
        .order('created_at', { ascending: false })
        .limit(200);

      if (customFilter === 'today') {
        customQuery = customQuery.eq('delivery_date', today);
      } else if (customFilter === 'next5') {
        customQuery = customQuery.gt('delivery_date', today).lte('delivery_date', next5Str);
      } else if (customFilter === 'unpaid') {
        customQuery = customQuery.in('payment_status', ['pending', 'unpaid']);
      } else if (customFilter === 'pending') {
        customQuery = customQuery.not('status', 'in', '("delivered","cancelled")');
      }

      const [{ data: subData }, { data: customData, error: customErr }] = await Promise.all([subQuery, customQuery]);
      if (subData) setSubscriptions(subData);
      if (customData) setCustomOrders(customData);
      if (customErr) setCustomError(customErr.message);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [subFilter, customFilter]);
  useFocusEffect(useCallback(() => { load(); }, [subFilter, customFilter]));

  const filteredSubs = subscriptions.filter((s) => {
    if (!search) return true;
    const name = s.user?.full_name?.toLowerCase() ?? '';
    const mobile = s.user?.mobile ?? '';
    return name.includes(search.toLowerCase()) || mobile.includes(search);
  });

  const filteredCustom = customOrders.filter((o) => {
    if (!search) return true;
    const name = o.user?.full_name?.toLowerCase() ?? '';
    const mobile = o.user?.mobile ?? '';
    return name.includes(search.toLowerCase()) || mobile.includes(search);
  });

  const getSubStatusIcon = (sub: any) => {
    const today = new Date().toISOString().split('T')[0];
    if (sub.pause_start_date && sub.pause_until && sub.pause_start_date <= today && sub.pause_until >= today) {
      return <PauseCircle size={16} color="#B45309" />;
    }
    if (sub.status === 'expired') return <Timer size={16} color="#DC2626" />;
    return <Package size={16} color={Colors.primary} />;
  };

  const getSubBgColor = (sub: any) => {
    const today = new Date().toISOString().split('T')[0];
    if (sub.pause_start_date && sub.pause_until && sub.pause_start_date <= today && sub.pause_until >= today) return '#FEF3C7';
    if (sub.status === 'expired') return '#FEE2E2';
    return Colors.primarySurface;
  };

  const getSubDisplayStatus = (sub: any) => {
    const today = new Date().toISOString().split('T')[0];
    if (sub.pause_start_date && sub.pause_until && sub.pause_start_date <= today && sub.pause_until >= today) return 'paused';
    return sub.status;
  };

  if (isWeb) {
    return (
      <ScrollView style={webStyles.scroll} contentContainerStyle={webStyles.content} showsVerticalScrollIndicator={false}>
        <View style={webStyles.pageHeader}>
          <View>
            <Text style={webStyles.pageTitle}>
              {activeTab === 'subscription' && subFilter === 'paused'
                ? 'Total Paused Subscriptions'
                : activeTab === 'subscription' && subFilter === 'paused_today'
                ? 'Today Paused Subscriptions'
                : activeTab === 'subscription' && subFilter === 'paused_tomorrow'
                ? 'Tomorrow Paused Subscriptions'
                : activeTab === 'subscription' && subFilter === 'resumed_today'
                ? 'Today Resumed Subscriptions'
                : activeTab === 'subscription' && subFilter === 'resumed_tomorrow'
                ? 'Tomorrow Resumed Subscriptions'
                : 'Orders'}
            </Text>
            <Text style={webStyles.pageSubtitle}>
              {activeTab === 'subscription'
                ? subFilter === 'paused'
                  ? `${filteredSubs.length} currently paused subscription${filteredSubs.length !== 1 ? 's' : ''}`
                  : subFilter === 'paused_today'
                  ? `${filteredSubs.length} subscription${filteredSubs.length !== 1 ? 's' : ''} paused today`
                  : subFilter === 'paused_tomorrow'
                  ? `${filteredSubs.length} subscription${filteredSubs.length !== 1 ? 's' : ''} pausing tomorrow`
                  : subFilter === 'resumed_today'
                  ? `${filteredSubs.length} subscription${filteredSubs.length !== 1 ? 's' : ''} resuming today`
                  : subFilter === 'resumed_tomorrow'
                  ? `${filteredSubs.length} subscription${filteredSubs.length !== 1 ? 's' : ''} resuming tomorrow`
                  : `${filteredSubs.length} subscription${filteredSubs.length !== 1 ? 's' : ''}`
                : `${filteredCustom.length} custom order${filteredCustom.length !== 1 ? 's' : ''}`}
            </Text>
          </View>
        </View>

        {/* Tab Toggle */}
        <View style={webStyles.tabRow}>
          <TouchableOpacity
            style={[webStyles.tabBtn, activeTab === 'subscription' && webStyles.tabBtnActive]}
            onPress={() => setActiveTab('subscription')}
          >
            <Text style={[webStyles.tabBtnText, activeTab === 'subscription' && webStyles.tabBtnTextActive]}>
              Subscription Orders
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[webStyles.tabBtn, activeTab === 'custom' && webStyles.tabBtnActive]}
            onPress={() => setActiveTab('custom')}
          >
            <Flower2 size={14} color={activeTab === 'custom' ? Colors.white : Colors.textTertiary} />
            <Text style={[webStyles.tabBtnText, activeTab === 'custom' && webStyles.tabBtnTextActive]}>
              Custom Orders
            </Text>
            {customOrders.filter(o => o.status === 'pending').length > 0 && (
              <View style={webStyles.badge}>
                <Text style={webStyles.badgeText}>{customOrders.filter(o => o.status === 'pending').length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={webStyles.tableCard}>
          <View style={webStyles.toolbar}>
            <View style={webStyles.searchBar}>
              <Search size={15} color={Colors.textTertiary} />
              <TextInput
                style={webStyles.searchInput}
                placeholder="Search by customer name or mobile..."
                placeholderTextColor={Colors.textDisabled}
                value={search}
                onChangeText={setSearch}
              />
            </View>
            <View style={webStyles.filterRow}>
              {(activeTab === 'subscription' ? SUB_STATUS_FILTERS : CUSTOM_FILTERS).map((f) => (
                <TouchableOpacity
                  key={f.value}
                  style={[
                    webStyles.filterChip,
                    (activeTab === 'subscription' ? subFilter : customFilter) === f.value && webStyles.filterChipActive,
                  ]}
                  onPress={() => {
                    if (activeTab === 'subscription') setSubFilter(f.value as SubStatusFilter);
                    else setCustomFilter(f.value as CustomFilter);
                  }}
                >
                  <Text style={[
                    webStyles.filterChipText,
                    (activeTab === 'subscription' ? subFilter : customFilter) === f.value && webStyles.filterChipTextActive,
                  ]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {activeTab === 'subscription' ? (
            <>
              <View style={webStyles.tableHead}>
                <Text style={[webStyles.thCell, { flex: 2 }]}>Customer</Text>
                <Text style={[webStyles.thCell, { flex: 2 }]}>Plan</Text>
                <Text style={[webStyles.thCell, { flex: 1 }]}>Start Date</Text>
                <Text style={[webStyles.thCell, { flex: 1 }]}>End Date</Text>
                <Text style={[webStyles.thCell, { flex: 1 }]}>Status</Text>
                <Text style={[webStyles.thCell, { width: 40 }]}></Text>
              </View>
              {!loading && filteredSubs.length === 0 ? (
                <View style={webStyles.emptyState}><Text style={webStyles.emptyText}>No subscriptions found.</Text></View>
              ) : (
                filteredSubs.map((sub, i) => (
                  <TouchableOpacity
                    key={sub.id}
                    style={[webStyles.tableRow, i % 2 === 1 && webStyles.tableRowAlt]}
                    onPress={() => router.push({ pathname: '/(admin)/customer-detail', params: { id: sub.user_id } })}
                  >
                    <View style={[webStyles.customerCell, { flex: 2 }]}>
                      <View style={[webStyles.iconBlock, { backgroundColor: getSubBgColor(sub) }]}>
                        {getSubStatusIcon(sub)}
                      </View>
                      <View>
                        <Text style={webStyles.customerName} numberOfLines={1}>{sub.user?.full_name ?? `+91 ${sub.user?.mobile}`}</Text>
                        <Text style={webStyles.customerMobile}>+91 {sub.user?.mobile}</Text>
                      </View>
                    </View>
                    <Text style={[webStyles.tdCell, { flex: 2 }]} numberOfLines={1}>{sub.plan?.name ?? '—'}</Text>
                    <Text style={[webStyles.tdMuted, { flex: 1 }]}>{sub.start_date ? format(new Date(sub.start_date), 'dd MMM yyyy') : '—'}</Text>
                    <Text style={[webStyles.tdMuted, { flex: 1 }]}>{sub.end_date ? format(new Date(sub.end_date), 'dd MMM yyyy') : '—'}</Text>
                    <View style={{ flex: 1 }}><StatusChip status={getSubDisplayStatus(sub)} /></View>
                    <View style={{ width: 40, alignItems: 'flex-end' }}><ChevronRight size={16} color={Colors.neutral[400]} /></View>
                  </TouchableOpacity>
                ))
              )}
            </>
          ) : (
            <>
              <View style={webStyles.tableHead}>
                <Text style={[webStyles.thCell, { flex: 2 }]}>Customer</Text>
                <Text style={[webStyles.thCell, { flex: 1 }]}>Type</Text>
                <Text style={[webStyles.thCell, { flex: 2 }]}>Items</Text>
                <Text style={[webStyles.thCell, { flex: 1 }]}>Delivery Date</Text>
                <Text style={[webStyles.thCell, { flex: 1 }]}>Status</Text>
                <Text style={[webStyles.thCell, { width: 40 }]}></Text>
              </View>
              {customError ? (
                <View style={webStyles.emptyState}><Text style={[webStyles.emptyText, { color: 'red' }]}>Error: {customError}</Text></View>
              ) : !loading && filteredCustom.length === 0 ? (
                <View style={webStyles.emptyState}><Text style={webStyles.emptyText}>No custom orders found.</Text></View>
              ) : (
                filteredCustom.map((order, i) => (
                  <TouchableOpacity
                    key={order.id}
                    style={[webStyles.tableRow, i % 2 === 1 && webStyles.tableRowAlt]}
                    onPress={() => router.push({ pathname: '/(admin)/custom-order-detail', params: { id: order.id } })}
                  >
                    <View style={[webStyles.customerCell, { flex: 2 }]}>
                      <View style={[webStyles.iconBlock, { backgroundColor: Colors.primarySurface }]}>
                        <Flower2 size={16} color={Colors.primary} />
                      </View>
                      <View>
                        <Text style={webStyles.customerName} numberOfLines={1}>{order.user?.full_name ?? `+91 ${order.user?.mobile}`}</Text>
                        <Text style={webStyles.customerMobile}>+91 {order.user?.mobile}</Text>
                      </View>
                    </View>
                    <Text style={[webStyles.tdCell, { flex: 1 }]}>
                      {order.order_type === 'garland' ? 'Garland' : 'Flower'}
                    </Text>
                    <View style={{ flex: 2 }}>
                      {(order.items as any[]).slice(0, 2).map((item: any, j: number) => (
                        <Text key={j} style={webStyles.tdMuted} numberOfLines={1}>
                          {item.flower_name} · {item.quantity} {item.unit}
                        </Text>
                      ))}
                      {order.items.length > 2 && (
                        <Text style={webStyles.tdMuted}>+{order.items.length - 2} more</Text>
                      )}
                    </View>
                    <Text style={[webStyles.tdMuted, { flex: 1 }]}>
                      {format(new Date(order.delivery_date), 'dd MMM yyyy')}
                    </Text>
                    <View style={{ flex: 1 }}><StatusChip status={order.status} /></View>
                    <View style={{ width: 40, alignItems: 'flex-end' }}>
                      <ChevronRight size={16} color={Colors.neutral[400]} />
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </>
          )}
        </View>
      </ScrollView>
    );
  }

  // ── Mobile layout ──
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {activeTab === 'subscription' && subFilter === 'paused'
            ? 'Paused Subscriptions'
            : activeTab === 'subscription' && subFilter === 'paused_today'
            ? 'Today Paused'
            : activeTab === 'subscription' && subFilter === 'paused_tomorrow'
            ? 'Tomorrow Paused'
            : activeTab === 'subscription' && subFilter === 'resumed_today'
            ? 'Today Resumed'
            : activeTab === 'subscription' && subFilter === 'resumed_tomorrow'
            ? 'Tomorrow Resumed'
            : 'Orders'}
        </Text>
        <Text style={styles.count}>
          {activeTab === 'subscription' ? `${filteredSubs.length}` : `${filteredCustom.length}`}
          {activeTab === 'subscription' && (subFilter === 'paused' || subFilter === 'paused_today' || subFilter === 'paused_tomorrow') ? ' paused'
            : activeTab === 'subscription' && (subFilter === 'resumed_today' || subFilter === 'resumed_tomorrow') ? ' resuming'
            : ' orders'}
        </Text>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'subscription' && styles.tabBtnActive]}
          onPress={() => setActiveTab('subscription')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'subscription' && styles.tabBtnTextActive]}>Subscription</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'custom' && styles.tabBtnActive]}
          onPress={() => setActiveTab('custom')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'custom' && styles.tabBtnTextActive]}>Custom</Text>
          {customOrders.filter(o => o.status === 'pending').length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{customOrders.filter(o => o.status === 'pending').length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <Search size={16} color={Colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or mobile..."
          placeholderTextColor={Colors.textDisabled}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {(activeTab === 'subscription' ? SUB_STATUS_FILTERS : CUSTOM_FILTERS).map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[
              styles.filterChip,
              (activeTab === 'subscription' ? subFilter : customFilter) === f.value && styles.filterChipActive,
            ]}
            onPress={() => {
              if (activeTab === 'subscription') setSubFilter(f.value as SubStatusFilter);
              else setCustomFilter(f.value as CustomFilter);
            }}
          >
            <Text style={[
              styles.filterChipText,
              (activeTab === 'subscription' ? subFilter : customFilter) === f.value && styles.filterChipTextActive,
            ]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {activeTab === 'subscription' ? (
          filteredSubs.length === 0 && !loading ? (
            <View style={styles.emptyState}>
              <Package size={32} color={Colors.textDisabled} />
              <Text style={styles.emptyText}>No subscriptions found.</Text>
            </View>
          ) : filteredSubs.map((sub) => (
            <TouchableOpacity
              key={sub.id}
              style={styles.orderCard}
              onPress={() => router.push({ pathname: '/(admin)/customer-detail', params: { id: sub.user_id } })}
              activeOpacity={0.85}
            >
              <View style={styles.orderLeft}>
                <View style={[styles.iconBlock, { backgroundColor: getSubBgColor(sub) }]}>
                  {getSubStatusIcon(sub)}
                </View>
              </View>
              <View style={styles.orderBody}>
                <Text style={styles.customerName}>{sub.user?.full_name ?? `+91 ${sub.user?.mobile}`}</Text>
                <Text style={styles.planName}>{sub.plan?.name ?? '—'}</Text>
                <Text style={styles.mobile}>+91 {sub.user?.mobile}</Text>
              </View>
              <View style={styles.orderRight}>
                <StatusChip status={getSubDisplayStatus(sub)} />
                <ChevronRight size={16} color={Colors.neutral[400]} />
              </View>
            </TouchableOpacity>
          ))
        ) : (
          filteredCustom.length === 0 && !loading ? (
            <View style={styles.emptyState}>
              <Flower2 size={32} color={Colors.textDisabled} />
              <Text style={styles.emptyText}>No custom orders found.</Text>
            </View>
          ) : filteredCustom.map((order) => (
            <TouchableOpacity
              key={order.id}
              style={styles.orderCard}
              onPress={() => router.push({ pathname: '/(admin)/custom-order-detail', params: { id: order.id } })}
              activeOpacity={0.85}
            >
              <View style={styles.orderLeft}>
                <View style={[styles.iconBlock, { backgroundColor: Colors.primarySurface }]}>
                  <Flower2 size={18} color={Colors.primary} />
                </View>
              </View>
              <View style={styles.orderBody}>
                <Text style={styles.customerName}>{order.user?.full_name ?? `+91 ${order.user?.mobile}`}</Text>
                <Text style={styles.planName}>
                  {order.order_type === 'garland' ? 'Garland' : 'Flower'} · {format(new Date(order.delivery_date), 'dd MMM yyyy')}
                </Text>
                <Text style={styles.mobile}>
                  {(order.items as any[]).map((it: any) => `${it.flower_name} (${it.quantity} ${it.unit})`).join(', ')}
                </Text>
              </View>
              <View style={styles.orderRight}>
                <StatusChip status={order.status} />
                <ChevronRight size={16} color={Colors.neutral[400]} />
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'],
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  count: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginHorizontal: Spacing[5],
    marginTop: Spacing[3],
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    height: 36,
  },
  filterScroll: { maxHeight: 52 },
  filterContent: {
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[3],
    gap: Spacing[2],
  },
  filterChip: {
    paddingHorizontal: Spacing[3],
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  filterChipTextActive: { color: Colors.white },
  content: { padding: Spacing[5], gap: Spacing[3] },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  orderLeft: {},
  iconBlock: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderBody: { flex: 1, gap: 2 },
  customerName: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  planName: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
  },
  mobile: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  orderRight: { alignItems: 'flex-end', gap: Spacing[2] },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[3],
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: Colors.primary },
  tabBtnText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  tabBtnTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  badge: {
    backgroundColor: Colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 10,
    color: Colors.white,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
});

const webStyles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#F7F7F4' },
  content: { padding: 32, paddingBottom: 64, gap: 24 },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  pageTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 28,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  tableCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  toolbar: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.neutral[50],
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    height: 24,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.neutral[50],
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
  },
  filterChipTextActive: { color: Colors.white },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: Colors.neutral[50],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  thCell: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  customerCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBlock: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerName: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  customerMobile: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  tdCell: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  tdMuted: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  emptyState: { paddingVertical: 48, alignItems: 'center' },
  emptyText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  tabBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabBtnText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  tabBtnTextActive: { color: Colors.white, fontFamily: Typography.fontFamily.sansSemiBold },
  badge: {
    backgroundColor: Colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 10,
    color: Colors.white,
  },
});
