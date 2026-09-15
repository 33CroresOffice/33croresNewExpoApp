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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Package, ChevronRight, Calendar, Leaf, X } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format } from 'date-fns';
import StatusChip from '@/components/ui/StatusChip';
import DatePickerField from '@/components/ui/DatePickerField';

const GRADIENT_TOP = '#1B3A18';
const GRADIENT_BOT = '#3D7A35';

const PENDING_STATUSES = ['draft', 'sent', 'accepted'];
const COMPLETED_STATUSES = ['fulfilled', 'completed', 'paid'];

const FILTER_OPTIONS = [
  { key: 'all', label: 'All Orders' },
  { key: 'pending', label: 'Pending' },
  { key: 'completed', label: 'Completed' },
];

export default function VendorProcurementOrders() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { statusFilter: initialFilter } = useLocalSearchParams<{ statusFilter?: string }>();
  const { profile } = useAuthStore();
  const isWeb = Platform.OS === 'web';

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const f = Array.isArray(initialFilter) ? initialFilter[0] : initialFilter;
    if (f) setActiveFilter(f);
  }, [initialFilter]);

  const load = async (userId?: string) => {
    const uid = userId ?? profile?.id;
    if (!uid) { setLoading(false); setRefreshing(false); return; }
    setErrorMsg(null);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setErrorMsg('Session not found. Please sign in again.');
      setLoading(false); setRefreshing(false); return;
    }

    const { data: vendorData, error: vendorError } = await supabase
      .from('vendors').select('id').eq('user_id', uid).maybeSingle();

    if (vendorError) { setErrorMsg(`Vendor lookup error: ${vendorError.message}`); setLoading(false); setRefreshing(false); return; }
    if (!vendorData) { setErrorMsg('No vendor profile linked to this account.'); setLoading(false); setRefreshing(false); return; }

    const { data, error } = await supabase
      .from('procurement_orders')
      .select(`
        id, status, requirement_date, created_at, notes,
        items:procurement_order_items(
          id, quantity, unit_type, price_per_unit, total_price,
          flower_type:flower_types(display_name, unit_type)
        )
      `)
      .eq('vendor_id', vendorData.id)
      .order('created_at', { ascending: false });

    if (error) { setErrorMsg(`Orders error: ${error.message}`); setLoading(false); setRefreshing(false); return; }
    setOrders(data ?? []);
    setLoading(false); setRefreshing(false);
  };

  useEffect(() => {
    if (profile?.id) load(profile.id);
    else setLoading(false);
  }, [profile?.id]);

  const filteredOrders = orders.filter((o) => {
    const matchesStatus = activeFilter === 'pending'
      ? PENDING_STATUSES.includes(o.status)
      : activeFilter === 'completed'
        ? COMPLETED_STATUSES.includes(o.status)
        : true;

    if (!matchesStatus) return false;
    if (!startDate && !endDate) return true;

    const requirementDate = o.requirement_date ? new Date(`${o.requirement_date}T00:00:00`) : null;
    if (!requirementDate) return false;
    if (startDate && requirementDate < startDate) return false;
    if (endDate && requirementDate > endDate) return false;
    return true;
  });

  const clearDateRange = () => {
    setStartDate(null);
    setEndDate(null);
  };

  const containerPadding = isWeb ? 32 : Spacing[4];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[GRADIENT_TOP, GRADIENT_BOT]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.gradientHeader, { paddingTop: isWeb ? 24 : insets.top + Spacing[3] }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <ArrowLeft size={20} color='rgba(255,255,255,0.9)' strokeWidth={2} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.headerIconWrap}>
              <Package size={16} color='#C8962A' strokeWidth={1.8} />
            </View>
            <Text style={styles.headerTitle}>Procurement Orders</Text>
          </View>
          <View style={{ width: 38 }} />
        </View>

        <View style={[styles.statsRow, { paddingHorizontal: containerPadding }]}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{filteredOrders.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {filteredOrders.filter(o => PENDING_STATUSES.includes(o.status)).length}
            </Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {filteredOrders.filter(o => COMPLETED_STATUSES.includes(o.status)).length}
            </Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={[styles.filterRow, { paddingHorizontal: containerPadding }]}>
        {FILTER_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.filterBtn, activeFilter === opt.key && styles.filterBtnActive]}
            onPress={() => setActiveFilter(opt.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterText, activeFilter === opt.key && styles.filterTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.dateRangeCard, { marginHorizontal: containerPadding }]}>
        <View style={styles.dateRangeHeader}>
          <View>
            <Text style={styles.dateRangeTitle}>Filter by required date</Text>
            <Text style={styles.dateRangeSubtitle}>Show orders needed within a selected range</Text>
          </View>
          {(startDate || endDate) && (
            <TouchableOpacity style={styles.clearDateBtn} onPress={clearDateRange} activeOpacity={0.7}>
              <X size={14} color={Colors.primary} strokeWidth={2} />
              <Text style={styles.clearDateText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.dateFields}>
          <View style={styles.dateField}>
            <DatePickerField
              label="From"
              value={startDate}
              minDate={new Date(2020, 0, 1)}
              maxDate={endDate ?? undefined}
              onChange={(date) => {
                setStartDate(date);
                if (endDate && date > endDate) setEndDate(null);
              }}
            />
          </View>
          <View style={styles.dateField}>
            <DatePickerField
              label="To"
              value={endDate}
              minDate={startDate ?? new Date(2020, 0, 1)}
              onChange={setEndDate}
            />
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { padding: containerPadding }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(profile?.id); }} tintColor={Colors.primary} />
        }
      >
        {loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Loading...</Text>
          </View>
        ) : errorMsg ? (
          <View style={styles.emptyState}>
            <Package size={36} color={Colors.error} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: Colors.error }]}>Error loading orders</Text>
            <Text style={styles.emptyText}>{errorMsg}</Text>
          </View>
        ) : filteredOrders.length === 0 ? (
          <View style={styles.emptyState}>
            <Package size={40} color={Colors.neutral[300]} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>No orders found</Text>
            <Text style={styles.emptyText}>No procurement orders match the selected filter.</Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {filteredOrders.map((order, i) => (
              <TouchableOpacity
                key={order.id}
                style={[styles.listRow, i === filteredOrders.length - 1 && styles.listRowLast]}
                onPress={() => router.push({ pathname: '/(vendor)/procurement-order-detail', params: { id: order.id } })}
                activeOpacity={0.7}
              >
                <View style={[styles.iconWrap, { backgroundColor: Colors.primarySurface }]}>
                  <Package size={17} color={Colors.primary} strokeWidth={1.8} />
                </View>
                <View style={styles.listInfo}>
                  <Text style={styles.listPrimary}>
                    {order.created_at ? format(new Date(order.created_at), 'dd MMM yyyy') : '—'}
                  </Text>
                  <View style={styles.listMetaRow}>
                    <Calendar size={11} color={Colors.textTertiary} strokeWidth={1.8} />
                    <Text style={styles.listSecondary}>
                      {order.requirement_date
                        ? `Required: ${format(new Date(order.requirement_date), 'dd MMM yyyy')}`
                        : order.notes ?? 'No notes'}
                    </Text>
                  </View>
                  {order.items && order.items.length > 0 && (
                    <View style={styles.itemsPreview}>
                      {order.items.slice(0, 3).map((item: any, idx: number) => (
                        <View key={item.id} style={styles.itemChip}>
                          <Leaf size={10} color={Colors.primary} strokeWidth={2} />
                          <Text style={styles.itemChipText}>
                            {item.flower_type?.display_name ?? 'Unknown'} · {item.quantity} {item.unit_type ?? ''}
                          </Text>
                        </View>
                      ))}
                      {order.items.length > 3 && (
                        <Text style={styles.moreItemsText}>+{order.items.length - 3} more</Text>
                      )}
                    </View>
                  )}
                </View>
                <View style={styles.listRight}>
                  <StatusChip status={order.status} />
                  <ChevronRight size={14} color={Colors.neutral[300]} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0EDE8' },
  gradientHeader: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[5],
    gap: Spacing[3],
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  headerIconWrap: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.lg, color: '#FFFFFF', letterSpacing: -0.2,
  },
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: Radius.lg,
    padding: Spacing[3], gap: Spacing[3],
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: '#FFFFFF' },
  statLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5, textTransform: 'uppercase' },
  statDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.2)' },
  filterRow: {
    flexDirection: 'row', gap: Spacing[2],
    paddingVertical: Spacing[3],
    backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  filterBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  filterBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },
  dateRangeCard: {
    marginTop: Spacing[3],
    padding: Spacing[4],
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  dateRangeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing[3],
    marginBottom: Spacing[3],
  },
  dateRangeTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  dateRangeSubtitle: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  clearDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.primarySurface,
  },
  clearDateText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.primary,
  },
  dateFields: { flexDirection: 'row', gap: Spacing[3] },
  dateField: { flex: 1 },
  scrollContent: { gap: Spacing[3], paddingBottom: Spacing[10] },
  emptyState: { paddingVertical: 60, alignItems: 'center', gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  emptyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center' },
  listCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  listRow: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing[4],
    borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: Spacing[3],
  },
  listRowLast: { borderBottomWidth: 0 },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  listInfo: { flex: 1, gap: 4 },
  listPrimary: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  listMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  listSecondary: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  itemsPreview: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  itemChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.primarySurface, borderRadius: Radius.sm,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  itemChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 10, color: Colors.primary },
  moreItemsText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 10, color: Colors.textTertiary, alignSelf: 'center' },
  listRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
});
