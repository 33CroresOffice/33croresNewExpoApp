import React, { useEffect, useState, useCallback } from 'react';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  TextInput,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Truck, MapPin, User, Phone, Flower2, Package,
  ChevronRight, CalendarClock, Search,
} from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { format, addDays } from 'date-fns';
import StatusChip from '@/components/ui/StatusChip';

export default function DeliveryTomorrowScreen() {
  return (
    <ModuleGuard module="orders">
      <DeliveryTomorrowContent />
    </ModuleGuard>
  );
}

interface DeliveryItem {
  id: string;
  type: 'subscription' | 'custom';
  customerName: string;
  mobile: string;
  planName?: string;
  addressText: string;
  locality?: string;
  landmark?: string;
  status: string;
  riderName?: string;
  items?: string;
  amount?: number;
}

function DeliveryTomorrowContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const tomorrow = addDays(new Date(), 1);
  const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');

  const load = async () => {
    setError('');
    try {
      const [subOrdersRes, customOrdersRes, riderAssignRes] = await Promise.all([
        supabase
          .from('orders')
          .select(`
            id, status, scheduled_date,
            subscription:subscriptions(
              id, user_id,
              user:profiles(full_name, mobile),
              plan:subscription_plans(name)
            )
          `)
          .eq('scheduled_date', tomorrowStr)
          .in('status', ['scheduled', 'out_for_delivery']),
        supabase
          .from('custom_orders')
          .select(`
            id, status, items, total_amount, delivery_date,
            user:profiles(full_name, mobile),
            address:addresses(street, apartment_name, landmark, locality_id)
          `)
          .eq('delivery_date', tomorrowStr)
          .not('status', 'in', '("cancelled","rejected")'),
        supabase
          .from('rider_order_assignments')
          .select('order_id, status, rider:riders(full_name)')
          .in('status', ['assigned', 'accepted', 'picked_up', 'delivered'])
          .limit(500),
      ]);

      if (subOrdersRes.error) throw subOrdersRes.error;

      const subUserIds = (subOrdersRes.data ?? [])
        .map((o: any) => o.subscription?.user_id)
        .filter(Boolean) as string[];

      const addressRes = subUserIds.length > 0
        ? await supabase
            .from('addresses')
            .select('user_id, street, apartment_name, landmark, locality_id, is_default')
            .in('user_id', subUserIds)
            .order('is_default', { ascending: false })
        : { data: null };

      const addressMap: Record<string, any> = {};
      for (const a of (addressRes.data ?? []) as any[]) {
        if (!addressMap[a.user_id]) addressMap[a.user_id] = a;
      }

      const riderMap: Record<string, string> = {};
      for (const a of (riderAssignRes.data ?? []) as any[]) {
        const name = a.rider?.full_name;
        if (name) riderMap[a.order_id] = name;
      }

      const items: DeliveryItem[] = [];

      for (const order of (subOrdersRes.data ?? []) as any[]) {
        const sub = order.subscription;
        if (!sub) continue;
        const addr = addressMap[sub.user_id];
        const itemsList = sub.plan?.name
          ? `${sub.plan.name} subscription`
          : 'Subscription delivery';
        items.push({
          id: order.id,
          type: 'subscription',
          customerName: sub.user?.full_name ?? 'Unknown',
          mobile: sub.user?.mobile ?? '',
          planName: sub.plan?.name,
          addressText: addr
            ? [addr.street, addr.apartment_name].filter(Boolean).join(', ')
            : 'No address',
          landmark: addr?.landmark ?? '',
          status: order.status,
          riderName: riderMap[order.id],
          items: itemsList,
        });
      }

      for (const order of (customOrdersRes.data ?? []) as any[]) {
        const addr = order.address;
        const flowerItems = Array.isArray(order.items)
          ? order.items.map((i: any) => `${i.quantity} ${i.unit ?? ''} ${i.flower_name ?? ''}`).join(', ')
          : 'Custom order';
        items.push({
          id: order.id,
          type: 'custom',
          customerName: order.user?.full_name ?? 'Unknown',
          mobile: order.user?.mobile ?? '',
          addressText: addr
            ? [addr.street, addr.apartment_name].filter(Boolean).join(', ')
            : 'No address',
          landmark: addr?.landmark ?? '',
          status: order.status,
          items: flowerItems,
          amount: order.total_amount,
        });
      }

      setDeliveries(items);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load deliveries');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  usePageVisibility(load);
  useEffect(() => { load(); }, []);
  useFocusEffect(useCallback(() => { load(); }, []));

  const filtered = deliveries.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      d.customerName.toLowerCase().includes(q) ||
      d.mobile.includes(q) ||
      d.addressText.toLowerCase().includes(q) ||
      (d.planName ?? '').toLowerCase().includes(q)
    );
  });

  const subCount = filtered.filter((d) => d.type === 'subscription').length;
  const customCount = filtered.filter((d) => d.type === 'custom').length;
  const assignedCount = filtered.filter((d) => d.riderName).length;
  const unassignedCount = subCount - assignedCount;

  const headerEl = (
    <View style={[s.header, isWeb && s.headerWeb]}>
      <View style={s.headerLeft}>
        <View style={s.headerIcon}>
          <Truck size={isWeb ? 22 : 18} color={Colors.primary} strokeWidth={1.8} />
        </View>
        <View>
          <Text style={[s.title, isWeb && s.titleWeb]}>Tomorrow's Deliveries</Text>
          <Text style={s.subtitle}>{format(tomorrow, 'EEEE, dd MMM yyyy')}</Text>
        </View>
      </View>
    </View>
  );

  const summaryCards = (
    <View style={s.summaryRow}>
      <View style={[s.summaryCard, { backgroundColor: Colors.primarySurface }]}>
        <Package size={18} color={Colors.primary} strokeWidth={1.8} />
        <Text style={[s.summaryValue, { color: Colors.primary }]}>{loading ? '—' : subCount}</Text>
        <Text style={[s.summaryLabel, { color: Colors.primary }]}>Subscription</Text>
      </View>
      <View style={[s.summaryCard, { backgroundColor: Colors.secondarySurface }]}>
        <Flower2 size={18} color={Colors.secondary} strokeWidth={1.8} />
        <Text style={[s.summaryValue, { color: Colors.secondary }]}>{loading ? '—' : customCount}</Text>
        <Text style={[s.summaryLabel, { color: Colors.secondary }]}>Custom Orders</Text>
      </View>
      <View style={[s.summaryCard, { backgroundColor: Colors.successSurface }]}>
        <Truck size={18} color={Colors.success} strokeWidth={1.8} />
        <Text style={[s.summaryValue, { color: Colors.success }]}>{loading ? '—' : assignedCount}</Text>
        <Text style={[s.summaryLabel, { color: Colors.success }]}>Rider Assigned</Text>
      </View>
      <View style={[s.summaryCard, { backgroundColor: Colors.warningSurface }]}>
        <MapPin size={18} color={Colors.warning} strokeWidth={1.8} />
        <Text style={[s.summaryValue, { color: Colors.warning }]}>{loading ? '—' : Math.max(0, unassignedCount)}</Text>
        <Text style={[s.summaryLabel, { color: Colors.warning }]}>Unassigned</Text>
      </View>
    </View>
  );

  const searchEl = (
    <View style={s.searchBar}>
      <Search size={16} color={Colors.textTertiary} strokeWidth={1.8} />
      <TextInput
        style={s.searchInput}
        placeholder="Search by name, mobile, address..."
        placeholderTextColor={Colors.textTertiary}
        value={search}
        onChangeText={setSearch}
      />
    </View>
  );

  if (loading && deliveries.length === 0) {
    return (
      <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top }]}>
        {headerEl}
        <View style={s.loadingWrap}>
          <Text style={s.loadingText}>Loading deliveries...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={isWeb ? s.scrollContentWeb : s.scrollContentMobile}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={Colors.primary}
          />
        }
      >
        {!isWeb && headerEl}
        {error ? (
          <View style={s.errorBanner}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}
        {summaryCards}
        {!isWeb && searchEl}
        <View style={s.listSection}>
          <View style={s.listHeader}>
            <Text style={s.listTitle}>
              {filtered.length} Delivery{filtered.length !== 1 ? 's' : ''}
            </Text>
          </View>
          {filtered.length === 0 ? (
            <View style={s.emptyWrap}>
              <CalendarClock size={40} color={Colors.textTertiary} strokeWidth={1.5} />
              <Text style={s.emptyTitle}>No deliveries scheduled</Text>
              <Text style={s.emptySub}>
                There are no orders scheduled for {format(tomorrow, 'dd MMM yyyy')}.
              </Text>
            </View>
          ) : (
            <View style={s.tableWrap}>
              {isWeb && (
                <View style={s.tableHeaderRow}>
                  <Text style={[s.tableHeaderCell, { flex: 2 }]}>Customer</Text>
                  <Text style={[s.tableHeaderCell, { flex: 1.5 }]}>Plan / Items</Text>
                  <Text style={[s.tableHeaderCell, { flex: 2 }]}>Address</Text>
                  <Text style={[s.tableHeaderCell, { flex: 1 }]}>Rider</Text>
                  <Text style={[s.tableHeaderCell, { flex: 0.8 }]}>Status</Text>
                  <Text style={[s.tableHeaderCell, { width: 40 }]}></Text>
                </View>
              )}
              {filtered.map((d, i) => (
                <DeliveryRow key={`${d.type}-${d.id}`} item={d} isWeb={isWeb} index={i} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
      {isWeb && (
        <View style={s.webSearchFixed}>
          {searchEl}
        </View>
      )}
    </View>
  );
}

function DeliveryRow({ item, isWeb, index }: { item: DeliveryItem; isWeb: boolean; index: number }) {
  const handlePress = () => {
    if (item.type === 'subscription') {
      router.push({ pathname: '/(admin)/order-detail', params: { id: item.id } });
    } else {
      router.push({ pathname: '/(admin)/custom-order-detail', params: { id: item.id } });
    }
  };

  if (isWeb) {
    return (
      <TouchableOpacity
        style={[s.tableRow, index % 2 === 1 && s.tableRowAlt]}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <View style={[s.tableCell, { flex: 2 }]}>
          <View style={s.cellIconWrap}>
            <Text style={s.cellAvatarText}>
              {item.customerName[0]?.toUpperCase()}
            </Text>
          </View>
          <View style={s.cellInfo}>
            <Text style={s.cellName} numberOfLines={1}>{item.customerName}</Text>
            <Text style={s.cellMobile}>{item.mobile}</Text>
          </View>
        </View>
        <View style={[s.tableCell, { flex: 1.5 }]}>
          <Text style={s.cellPlan} numberOfLines={1}>
            {item.type === 'custom' ? item.items : item.planName}
          </Text>
          {item.type === 'custom' && item.amount != null && (
            <Text style={s.cellAmount}>₹{(item.amount / 100).toLocaleString('en-IN')}</Text>
          )}
        </View>
        <View style={[s.tableCell, { flex: 2 }]}>
          <Text style={s.cellAddress} numberOfLines={2}>{item.addressText}</Text>
          {item.landmark ? (
            <Text style={s.cellLandmark} numberOfLines={1}>{item.landmark}</Text>
          ) : null}
        </View>
        <View style={[s.tableCell, { flex: 1 }]}>
          {item.riderName ? (
            <Text style={s.cellRider} numberOfLines={1}>{item.riderName}</Text>
          ) : (
            <Text style={s.cellUnassigned}>Unassigned</Text>
          )}
        </View>
        <View style={[s.tableCell, { flex: 0.8 }]}>
          <StatusChip status={item.status} />
        </View>
        <View style={[s.tableCell, { width: 40, justifyContent: 'center' }]}>
          <ChevronRight size={16} color={Colors.textTertiary} strokeWidth={1.8} />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={s.mobileCard}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={s.mobileCardTop}>
        <View style={s.mobileCardLeft}>
          <View style={s.mobileAvatar}>
            <Text style={s.mobileAvatarText}>
              {item.customerName[0]?.toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={s.mobileName} numberOfLines={1}>{item.customerName}</Text>
            <Text style={s.mobileMobile}>{item.mobile}</Text>
          </View>
        </View>
        <StatusChip status={item.status} />
      </View>
      <View style={s.mobileCardBody}>
        <View style={s.mobileInfoRow}>
          <Package size={13} color={Colors.textTertiary} strokeWidth={1.8} />
          <Text style={s.mobileInfoText} numberOfLines={1}>
            {item.type === 'custom' ? item.items : item.planName}
          </Text>
        </View>
        <View style={s.mobileInfoRow}>
          <MapPin size={13} color={Colors.textTertiary} strokeWidth={1.8} />
          <Text style={s.mobileInfoText} numberOfLines={2}>{item.addressText}</Text>
        </View>
        {item.riderName ? (
          <View style={s.mobileInfoRow}>
            <Truck size={13} color={Colors.success} strokeWidth={1.8} />
            <Text style={[s.mobileInfoText, { color: Colors.success }]}>{item.riderName}</Text>
          </View>
        ) : (
          <View style={s.mobileInfoRow}>
            <Truck size={13} color={Colors.warning} strokeWidth={1.8} />
            <Text style={[s.mobileInfoText, { color: Colors.warning }]}>No rider assigned</Text>
          </View>
        )}
      </View>
      <ChevronRight size={16} color={Colors.textTertiary} strokeWidth={1.8} style={s.mobileChevron} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerWeb: {
    paddingHorizontal: 0,
    paddingBottom: Spacing[5],
    borderBottomWidth: 0,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  titleWeb: {
    fontSize: Typography.size['2xl'],
  },
  subtitle: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  scrollContentWeb: {
    padding: Spacing[8],
    paddingBottom: Spacing[16],
    gap: Spacing[5],
  },
  scrollContentMobile: {
    padding: Spacing[5],
    gap: Spacing[4],
  },
  summaryRow: {
    flexDirection: 'row',
    gap: Spacing[3],
    flexWrap: 'wrap' as any,
  },
  summaryCard: {
    flex: 1,
    minWidth: 140,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    alignItems: 'center',
    gap: Spacing[1],
  },
  summaryValue: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size['2xl'],
  },
  summaryLabel: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    padding: 0,
  },
  webSearchFixed: {
    padding: Spacing[4],
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  listSection: {
    gap: Spacing[3],
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  tableWrap: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[4],
    backgroundColor: Colors.neutral[100],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tableHeaderCell: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    alignItems: 'center',
  },
  tableRowAlt: {
    backgroundColor: Colors.neutral[50],
  },
  tableCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  cellIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellAvatarText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.primary,
  },
  cellInfo: {
    flex: 1,
  },
  cellName: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  cellMobile: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  cellPlan: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  cellAmount: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  cellAddress: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  cellLandmark: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  cellRider: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.success,
  },
  cellUnassigned: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.warning,
  },
  mobileCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing[4],
    gap: Spacing[3],
    position: 'relative',
  },
  mobileCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mobileCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  mobileAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileAvatarText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.primary,
  },
  mobileName: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  mobileMobile: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  mobileCardBody: {
    gap: Spacing[2],
  },
  mobileInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  mobileInfoText: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  mobileChevron: {
    position: 'absolute',
    right: Spacing[4],
    top: Spacing[6],
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing[10],
  },
  loadingText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textTertiary,
  },
  errorBanner: {
    backgroundColor: Colors.errorSurface,
    borderRadius: Radius.md,
    padding: Spacing[4],
  },
  errorText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.error,
  },
  emptyWrap: {
    alignItems: 'center',
    padding: Spacing[10],
    gap: Spacing[3],
  },
  emptyTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.lg,
    color: Colors.textSecondary,
  },
  emptySub: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});
