import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Search, Sparkles, Flame, CalendarClock, Clock3, IndianRupee, CheckCircle2, XCircle, Clock } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import ModuleGuard from '@/components/admin/ModuleGuard';

type Booking = {
  id: string;
  customer_name: string;
  customer_mobile: string;
  preferred_date: string;
  preferred_time: string;
  consultation_mode: string;
  status: string;
  total_amount: number;
  advance_amount: number;
  advance_payment_status: string;
  remaining_payment_status: string;
  created_at: string;
  provider: { id: string; full_name: string; city: string | null; specialization: string | null } | null;
  provider_services: { name: string; description: string | null } | null;
  provider_pooja_setups: { description: string | null; service_fee: number; pooja_type: { name: string } | null } | null;
};

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'completed', label: 'Completed' },
  { key: 'declined', label: 'Declined' },
] as const;

export default function ServiceOrdersScreen() {
  return <ModuleGuard module="service_providers"><ServiceOrdersContent /></ModuleGuard>;
}

function ServiceOrdersContent() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('provider_bookings')
      .select(`
        id, customer_name, customer_mobile, preferred_date, preferred_time, consultation_mode, status,
        total_amount, advance_amount, advance_payment_status, remaining_payment_status, created_at,
        provider:service_providers(id, full_name, city, specialization),
        provider_services(name, description),
        provider_pooja_setups(description, service_fee, pooja_type:pooja_types(name))
      `)
      .order('created_at', { ascending: false });
    if (error) {
      setBookings([]);
    } else {
      setBookings((data ?? []) as unknown as Booking[]);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        const haystack = `${b.customer_name} ${b.customer_mobile} ${b.provider?.full_name ?? ''} ${b.provider_pooja_setups?.pooja_type?.name ?? ''} ${b.provider_services?.name ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [bookings, statusFilter, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: bookings.length };
    for (const b of bookings) c[b.status] = (c[b.status] ?? 0) + 1;
    return c;
  }, [bookings]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>SERVICE PROVIDERS</Text>
          <Text style={styles.title}>Service Orders</Text>
          <Text style={styles.subtitle}>{bookings.length} total bookings · {counts.pending ?? 0} pending · {counts.completed ?? 0} completed</Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <Metric label="Pending" value={counts.pending ?? 0} color={Colors.warning} />
        <Metric label="Confirmed" value={counts.confirmed ?? 0} color={Colors.primary} />
        <Metric label="Completed" value={counts.completed ?? 0} color={Colors.success} />
        <Metric label="Declined" value={counts.declined ?? 0} color={Colors.error} />
      </View>

      <View style={styles.search}>
        <Search size={16} color={Colors.textTertiary} />
        <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Search customer, provider or pooja" placeholderTextColor={Colors.textDisabled} />
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
          <Sparkles size={28} color={Colors.primary} />
          <Text style={styles.emptyTitle}>No service orders found</Text>
          <Text style={styles.emptyText}>Customer bookings for pooja and other services will appear here.</Text>
        </View>
      ) : (
        filtered.map((booking) => <BookingCard key={booking.id} booking={booking} onPress={() => router.push({ pathname: '/(admin)/service-order-detail' as any, params: { id: booking.id } })} />)
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

function BookingCard({ booking, onPress }: { booking: Booking; onPress: () => void }) {
  const pooja = booking.provider_pooja_setups;
  const service = booking.provider_services;
  const title = pooja?.pooja_type?.name ?? service?.name ?? 'Service booking';
  const isPooja = !!pooja;
  const statusColor = booking.status === 'completed' ? Colors.success : booking.status === 'declined' ? Colors.error : booking.status === 'pending' ? Colors.warning : booking.status === 'confirmed' ? Colors.primary : Colors.textSecondary;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardTop}>
        <View style={styles.cardHeading}>
          <View style={styles.serviceTitleRow}>
            {isPooja ? <Flame size={15} color={Colors.accent} /> : null}
            <Text style={styles.serviceTitle}>{title}</Text>
          </View>
          <Text style={styles.customer}>{booking.customer_name} · {booking.customer_mobile}</Text>
          {booking.provider ? <Text style={styles.provider}>by {booking.provider.full_name}{booking.provider.city ? ` · ${booking.provider.city}` : ''}</Text> : null}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '16' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{booking.status}</Text>
        </View>
      </View>
      <View style={styles.detailRow}>
        <View style={styles.detailItem}><CalendarClock size={13} color={Colors.textTertiary} /><Text style={styles.detailText}>{booking.preferred_date}</Text></View>
        <View style={styles.detailItem}><Clock3 size={13} color={Colors.textTertiary} /><Text style={styles.detailText}>{booking.preferred_time}</Text></View>
        <View style={styles.detailItem}><Clock size={13} color={Colors.textTertiary} /><Text style={styles.detailText}>{booking.consultation_mode.replace('_', ' ')}</Text></View>
      </View>
      {booking.total_amount > 0 ? (
        <View style={styles.paymentRow}>
          <View style={styles.paymentItem}><IndianRupee size={13} color={Colors.textTertiary} /><Text style={styles.paymentText}>{booking.total_amount.toLocaleString('en-IN')}</Text></View>
          {booking.advance_payment_status === 'paid' ? <View style={styles.paidChip}><CheckCircle2 size={11} color={Colors.success} /><Text style={styles.paidText}>Advance paid</Text></View> : null}
          {booking.remaining_payment_status === 'paid' ? <View style={styles.paidChip}><CheckCircle2 size={11} color={Colors.success} /><Text style={styles.paidText}>Fully paid</Text></View> : null}
          {booking.advance_payment_status !== 'paid' ? <View style={styles.unpaidChip}><Clock size={11} color={Colors.warning} /><Text style={styles.unpaidText}>Advance unpaid</Text></View> : null}
        </View>
      ) : null}
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
  provider: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: Radius.full, alignSelf: 'flex-start' },
  statusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, textTransform: 'capitalize' },
  detailRow: { flexDirection: 'row', gap: Spacing[3], flexWrap: 'wrap' },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary, textTransform: 'capitalize' },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: Spacing[2] },
  paymentItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  paymentText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  paidChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successSurface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  paidText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.success },
  unpaidChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.warningSurface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  unpaidText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.warning },
});
