import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Search, Package, CalendarClock, Clock3, IndianRupee, CheckCircle2, Clock } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import ModuleGuard from '@/components/admin/ModuleGuard';

type PoojaOrder = {
  id: string;
  customer_name: string;
  customer_mobile: string;
  delivery_date: string;
  delivery_time: string;
  status: string;
  payment_status: string;
  total_price: number;
  created_at: string;
  plan_name: string;
};

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
] as const;

const ACTIVE_STATUSES = ['pending', 'confirmed', 'processing', 'out_for_delivery'];

export default function PackageManagementScreen() {
  return <ModuleGuard module="service_providers"><PackageManagementContent /></ModuleGuard>;
}

function PackageManagementContent() {
  const [items, setItems] = useState<PoojaOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('pooja_orders')
      .select('id, user_id, delivery_date, delivery_time, status, payment_status, total_price, created_at, plan:subscription_plans(name)')
      .not('user_id', 'is', null)
      .order('created_at', { ascending: false });

    if (error) { setLoading(false); setRefreshing(false); return; }

    const userIds = [...new Set((data ?? []).map((o: any) => o.user_id).filter(Boolean))];
    let profileMap: Record<string, { full_name: string; mobile: string }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, mobile')
        .in('id', userIds);
      for (const p of (profiles ?? [])) {
        profileMap[p.id] = { full_name: p.full_name ?? 'Customer', mobile: p.mobile ?? '' };
      }
    }

    const poojaItems: PoojaOrder[] = (data ?? []).map((o: any) => {
      const profile = o.user_id ? profileMap[o.user_id] : null;
      return {
        id: o.id,
        customer_name: profile?.full_name ?? 'Customer',
        customer_mobile: profile?.mobile ?? '',
        delivery_date: o.delivery_date,
        delivery_time: o.delivery_time,
        status: o.status,
        payment_status: o.payment_status,
        total_price: o.total_price,
        created_at: o.created_at,
        plan_name: o.plan?.name ?? 'Pooja Package',
      };
    });

    setItems(poojaItems);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter === 'active' && !ACTIVE_STATUSES.includes(item.status)) return false;
      if (statusFilter === 'completed' && ACTIVE_STATUSES.includes(item.status)) return false;
      if (statusFilter === 'cancelled' && item.status !== 'cancelled') return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        const haystack = `${item.customer_name} ${item.customer_mobile} ${item.plan_name}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, statusFilter, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length, active: 0, completed: 0, cancelled: 0 };
    for (const item of items) {
      if (ACTIVE_STATUSES.includes(item.status)) c.active++;
      else if (item.status === 'cancelled') c.cancelled++;
      else c.completed++;
    }
    return c;
  }, [items]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>USER PACKAGES</Text>
          <Text style={styles.title}>Package Management</Text>
          <Text style={styles.subtitle}>{items.length} total packages · {counts.active} active · {counts.completed} completed</Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <Metric label="Active" value={counts.active} color={Colors.primary} />
        <Metric label="Completed" value={counts.completed} color={Colors.success} />
        <Metric label="Cancelled" value={counts.cancelled} color={Colors.error} />
      </View>

      <View style={styles.search}>
        <Search size={16} color={Colors.textTertiary} />
        <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Search customer or package" placeholderTextColor={Colors.textDisabled} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {STATUS_TABS.map((tab) => (
          <TouchableOpacity key={tab.key} style={[styles.filter, statusFilter === tab.key && styles.filterActive]} onPress={() => setStatusFilter(tab.key)}>
            <Text style={[styles.filterText, statusFilter === tab.key && styles.filterTextActive]}>{tab.label}{counts[tab.key] ? ` (${counts[tab.key]})` : ''}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Package size={28} color={Colors.primary} />
          <Text style={styles.emptyTitle}>No packages found</Text>
          <Text style={styles.emptyText}>User pooja packages will appear here.</Text>
        </View>
      ) : (
        filtered.map((item) => <PackageCard key={item.id} item={item} onPress={() => router.push({ pathname: '/(admin)/package-detail' as any, params: { id: item.id } })} />)
      )}
    </ScrollView>
  );
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function PackageCard({ item, onPress }: { item: PoojaOrder; onPress: () => void }) {
  const statusColor = ACTIVE_STATUSES.includes(item.status) ? Colors.primary : item.status === 'cancelled' ? Colors.error : Colors.success;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardTop}>
        <View style={styles.cardHeading}>
          <View style={styles.serviceTitleRow}>
            <Package size={15} color={Colors.accent} />
            <Text style={styles.serviceTitle}>{item.plan_name}</Text>
          </View>
          <Text style={styles.customer}>{item.customer_name}{item.customer_mobile ? ` · ${item.customer_mobile}` : ''}</Text>
          <Text style={styles.packageType}>Pooja Package</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '16' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{item.status.replace(/_/g, ' ')}</Text>
        </View>
      </View>
      <View style={styles.detailRow}>
        <View style={styles.detailItem}><CalendarClock size={13} color={Colors.textTertiary} /><Text style={styles.detailText}>{item.delivery_date}</Text></View>
        <View style={styles.detailItem}><Clock3 size={13} color={Colors.textTertiary} /><Text style={styles.detailText}>{item.delivery_time}</Text></View>
        <View style={styles.detailItem}><IndianRupee size={13} color={Colors.textTertiary} /><Text style={styles.detailText}>{(item.total_price / 100).toLocaleString('en-IN')}</Text></View>
      </View>
      <View style={styles.paymentRow}>
        {item.payment_status === 'paid'
          ? <View style={styles.paidChip}><CheckCircle2 size={11} color={Colors.success} /><Text style={styles.paidText}>Paid</Text></View>
          : <View style={styles.unpaidChip}><Clock size={11} color={Colors.warning} /><Text style={styles.unpaidText}>Payment Pending</Text></View>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing[5], paddingTop: Spacing[8], gap: Spacing[4], paddingBottom: Spacing[10] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { gap: 4 },
  eyebrow: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, letterSpacing: 1.2, color: Colors.primary },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['3xl'], color: Colors.textPrimary },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  metrics: { flexDirection: 'row', gap: Spacing[3] },
  metric: { flex: 1, backgroundColor: Colors.white, padding: Spacing[3], borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border },
  metricValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl },
  metricLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 3 },
  search: { height: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingHorizontal: Spacing[3], backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  searchInput: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, color: Colors.textPrimary },
  filters: { gap: Spacing[2] },
  filter: { paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  filterActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  filterText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary },
  filterTextActive: { color: Colors.primary },
  empty: { alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[7], gap: Spacing[2], borderWidth: 1, borderColor: Colors.border },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  emptyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, textAlign: 'center' },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], gap: Spacing[3], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing[3] },
  cardHeading: { flex: 1, gap: 3 },
  serviceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  serviceTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.md, color: Colors.textPrimary },
  customer: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },
  packageType: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.accent, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: Radius.full, alignSelf: 'flex-start' },
  statusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, textTransform: 'capitalize' },
  detailRow: { flexDirection: 'row', gap: Spacing[3], flexWrap: 'wrap' },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: Spacing[2] },
  paidChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successSurface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  paidText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.success },
  unpaidChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.warningSurface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  unpaidText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.warning },
});
