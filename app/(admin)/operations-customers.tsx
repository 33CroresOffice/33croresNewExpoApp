import React, { useEffect, useState } from 'react';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Platform,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, ChevronRight, Users, ChevronLeft } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import EmptyState from '@/components/ui/EmptyState';
import { format } from 'date-fns';

type CustomerFilter = 'all' | 'today_payment';

const FILTER_LABELS: Record<CustomerFilter, string> = {
  all: 'All',
  today_payment: 'Today Payment',
};

const FILTER_ORDER: CustomerFilter[] = ['all', 'today_payment'];

type OpsCustomer = {
  id: string;
  full_name: string | null;
  mobile: string;
  avatar_url: string | null;
  created_at: string;
  is_verified: boolean;
  subscription_count: number;
  custom_order_count: number;
  has_active_sub: boolean;
  has_today_payment: boolean;
  has_expired_sub: boolean;
  has_paused_sub: boolean;
  is_expired_or_paused: boolean;
  address: string;
};

export default function OperationsCustomersScreen() {
  return (
    <ModuleGuard module="operations">
      <OperationsCustomersScreenContent />
    </ModuleGuard>
  );
}

function OperationsCustomersScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [activeFilter, setActiveFilter] = useState<CustomerFilter>('all');
  const [customers, setCustomers] = useState<OpsCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const load = async () => {
    try {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
      const [subsRes, customRes, paymentsRes] = await Promise.all([
        supabase.from('subscriptions').select('user_id, status'),
        supabase.from('custom_orders').select('user_id'),
        supabase.from('payments').select('user_id').eq('status', 'success').gte('created_at', todayStart.toISOString()).lte('created_at', todayEnd.toISOString()),
      ]);

      const subUserIds = new Set<string>();
      const activeSubUserIds = new Set<string>();
      const expiredSubUserIds = new Set<string>();
      const pausedSubUserIds = new Set<string>();
      (subsRes.data ?? []).forEach((r: any) => {
        subUserIds.add(r.user_id);
        if (r.status === 'active') activeSubUserIds.add(r.user_id);
        if (r.status === 'expired') expiredSubUserIds.add(r.user_id);
        if (r.status === 'paused') pausedSubUserIds.add(r.user_id);
      });
      const expiredOrPausedUserIds = new Set<string>([...expiredSubUserIds, ...pausedSubUserIds]);
      const todayPaymentUserIds = new Set<string>((paymentsRes.data ?? []).map((r: any) => r.user_id));
      const customOrderUserIds = new Set<string>();
      (customRes.data ?? []).forEach((r: any) => customOrderUserIds.add(r.user_id));

      const relevantIds = new Set([...subUserIds, ...customOrderUserIds]);
      if (relevantIds.size === 0) {
        setCustomers([]);
        return;
      }

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, mobile, avatar_url, created_at, is_verified')
        .in('id', Array.from(relevantIds))
        .order('created_at', { ascending: false });

      if (!profiles) {
        setCustomers([]);
        return;
      }

      const { data: addressData } = await supabase
        .from('addresses')
        .select('user_id, apartment_name, street, landmark, locality_id, is_default')
        .in('user_id', Array.from(relevantIds))
        .order('is_default', { ascending: false });

      const addressMap = new Map<string, string>();
      (addressData ?? []).forEach((a: any) => {
        if (addressMap.has(a.user_id)) return;
        const parts = [a.apartment_name, a.street, a.landmark].filter(Boolean);
        addressMap.set(a.user_id, parts.join(', ') || '—');
      });

      const subCountMap = new Map<string, number>();
      (subsRes.data ?? []).forEach((r: any) => {
        subCountMap.set(r.user_id, (subCountMap.get(r.user_id) ?? 0) + 1);
      });
      const customCountMap = new Map<string, number>();
      (customRes.data ?? []).forEach((r: any) => {
        customCountMap.set(r.user_id, (customCountMap.get(r.user_id) ?? 0) + 1);
      });

      const enriched: OpsCustomer[] = profiles.map((p: any) => ({
        id: p.id,
        full_name: p.full_name,
        mobile: p.mobile,
        avatar_url: p.avatar_url,
        created_at: p.created_at,
        is_verified: p.is_verified,
        subscription_count: subCountMap.get(p.id) ?? 0,
        custom_order_count: customCountMap.get(p.id) ?? 0,
        has_active_sub: activeSubUserIds.has(p.id),
        has_today_payment: todayPaymentUserIds.has(p.id),
        has_expired_sub: expiredSubUserIds.has(p.id),
        has_paused_sub: pausedSubUserIds.has(p.id),
        is_expired_or_paused: expiredOrPausedUserIds.has(p.id),
        address: addressMap.get(p.id) ?? '—',
      }));

      setCustomers(enriched);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  usePageVisibility(load);

  const applyFilter = (c: OpsCustomer): boolean => {
    if (c.is_expired_or_paused) return false;
    switch (activeFilter) {
      case 'all':
        return true;
      case 'today_payment':
        return c.has_today_payment;
    }
  };

  const filtered = customers.filter((c) => {
    if (!applyFilter(c)) return false;
    if (!search) return true;
    const name = c.full_name?.toLowerCase() ?? '';
    return name.includes(search.toLowerCase()) || c.mobile.includes(search);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [activeFilter, search]);

  const renderAvatar = (c: OpsCustomer, size: number, fontSize: number, bg: string, color: string) => {
    if (c.avatar_url) {
      return (
        <Image
          source={{ uri: c.avatar_url }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      );
    }
    return (
      <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontFamily: Typography.fontFamily.bold, fontSize, color }}>
          {c.full_name?.charAt(0)?.toUpperCase() ?? '?'}
        </Text>
      </View>
    );
  };

  if (isWeb) {
    return (
      <ScrollView style={webStyles.scroll} contentContainerStyle={webStyles.content} showsVerticalScrollIndicator={false}>
        <View style={webStyles.pageHeader}>
          <View>
            <Text style={webStyles.pageTitle}>Customers</Text>
            <Text style={webStyles.pageSubtitle}>
              {customers.length} customers with subscriptions or custom orders
            </Text>
          </View>
        </View>

        <View style={webStyles.filterTabs}>
          {FILTER_ORDER.map((filter) => (
            <TouchableOpacity key={filter} style={[webStyles.filterTab, activeFilter === filter && webStyles.filterTabActive]} onPress={() => setActiveFilter(filter)} activeOpacity={0.8}>
              <Text style={[webStyles.filterTabText, activeFilter === filter && webStyles.filterTabTextActive]}>{FILTER_LABELS[filter]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={webStyles.tableCard}>
          <View style={webStyles.searchBar}>
            <Search size={16} color={Colors.textTertiary} />
            <TextInput
              style={webStyles.searchInput}
              placeholder="Search by name or mobile..."
              placeholderTextColor={Colors.textDisabled}
              value={search}
              onChangeText={setSearch}
            />
            {search ? <Text style={webStyles.resultCount}>{filtered.length} results</Text> : null}
          </View>

          <View style={webStyles.tableHead}>
            <Text style={[webStyles.thCell, { flex: 3 }]}>Customer</Text>
            <Text style={[webStyles.thCell, { flex: 2 }]}>Mobile</Text>
            <Text style={[webStyles.thCell, { flex: 3 }]}>Address</Text>
            <Text style={[webStyles.thCell, { flex: 1 }]}>Joined</Text>
            <Text style={[webStyles.thCell, { flex: 1 }]}>Subs</Text>
            <Text style={[webStyles.thCell, { flex: 1 }]}>Custom</Text>
            <Text style={[webStyles.thCell, { width: 80 }]}></Text>
          </View>

          {!loading && filtered.length === 0 ? (
            <View style={webStyles.emptyState}>
              <Text style={webStyles.emptyText}>
                {search ? 'No customers match your search.' : 'No customers with orders yet.'}
              </Text>
            </View>
          ) : (
            paginated.map((customer, i) => (
              <TouchableOpacity
                key={customer.id}
                style={[webStyles.tableRow, i % 2 === 1 && webStyles.tableRowAlt]}
                onPress={() => router.push({ pathname: '/(admin)/customer-detail', params: { id: customer.id } })}
              >
                <View style={[webStyles.customerCell, { flex: 3 }]}>
                  {renderAvatar(customer, 36, Typography.size.sm, Colors.primarySurface, Colors.primary)}
                  <View>
                    <Text style={webStyles.customerName}>{customer.full_name ?? 'Name not set'}</Text>
                    <Text style={webStyles.customerMobile}>{customer.is_verified ? 'Verified' : 'Unverified'}</Text>
                  </View>
                </View>
                <Text style={[webStyles.tdCell, { flex: 2 }]}>+91 {customer.mobile}</Text>
                <Text style={[webStyles.tdMuted, { flex: 3 }]} numberOfLines={2}>{customer.address}</Text>
                <Text style={[webStyles.tdMuted, { flex: 1 }]}>
                  {customer.created_at ? format(new Date(customer.created_at), 'dd MMM yyyy') : '—'}
                </Text>
                <Text style={[webStyles.tdCell, { flex: 1 }]}>{customer.subscription_count}</Text>
                <Text style={[webStyles.tdCell, { flex: 1 }]}>{customer.custom_order_count}</Text>
                <View style={{ width: 80, alignItems: 'flex-end' }}>
                  <ChevronRight size={16} color={Colors.neutral[400]} />
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {filtered.length > PAGE_SIZE && (
          <View style={webStyles.paginationBar}>
            <Text style={webStyles.paginationInfo}>
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
            </Text>
            <View style={webStyles.paginationControls}>
              <TouchableOpacity
                style={[webStyles.pageBtn, currentPage === 1 && webStyles.pageBtnDisabled]}
                onPress={() => currentPage > 1 && setPage(currentPage - 1)}
                disabled={currentPage === 1}
                activeOpacity={0.7}
              >
                <ChevronLeft size={15} color={currentPage === 1 ? Colors.textDisabled : Colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
              <Text style={webStyles.pageIndicator}>Page {currentPage} of {totalPages}</Text>
              <TouchableOpacity
                style={[webStyles.pageBtn, currentPage === totalPages && webStyles.pageBtnDisabled]}
                onPress={() => currentPage < totalPages && setPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                activeOpacity={0.7}
              >
                <ChevronRight size={15} color={currentPage === totalPages ? Colors.textDisabled : Colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Customers</Text>
        <Text style={styles.count}>{filtered.length} shown</Text>
      </View>

      <View style={styles.filterTabs}>
        {FILTER_ORDER.map((filter) => (
          <TouchableOpacity key={filter} style={[styles.filterTab, activeFilter === filter && styles.filterTabActive]} onPress={() => setActiveFilter(filter)} activeOpacity={0.8}>
            <Text style={[styles.filterTabText, activeFilter === filter && styles.filterTabTextActive]}>{FILTER_LABELS[filter]}</Text>
          </TouchableOpacity>
        ))}
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
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {!loading && filtered.length === 0 ? (
          <EmptyState
            icon={<Users size={48} color={Colors.neutral[400]} />}
            title="No customers found"
            description={search ? 'Try a different search term' : 'No customers with subscriptions or custom orders yet'}
          />
        ) : (
          <View style={styles.list}>
            {paginated.map((customer) => (
              <TouchableOpacity
                key={customer.id}
                style={styles.customerCard}
                onPress={() => router.push({ pathname: '/(admin)/customer-detail', params: { id: customer.id } })}
                activeOpacity={0.85}
              >
                {renderAvatar(customer, 44, Typography.size.lg, Colors.primary, Colors.white)}
                <View style={styles.customerInfo}>
                  <Text style={styles.customerName}>{customer.full_name ?? 'Name not set'}</Text>
                  <Text style={styles.customerMobile}>+91 {customer.mobile}</Text>
                  {customer.address !== '—' && (
                    <Text style={styles.customerAddress} numberOfLines={2}>{customer.address}</Text>
                  )}
                  <View style={styles.badgeRow}>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{customer.subscription_count} Subs</Text>
                    </View>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{customer.custom_order_count} Custom</Text>
                    </View>
                  </View>
                </View>
                <ChevronRight size={16} color={Colors.neutral[400]} />
              </TouchableOpacity>
            ))}
          </View>
        )}
        {filtered.length > PAGE_SIZE && (
          <View style={styles.paginationBar}>
            <TouchableOpacity
              style={[styles.pageBtn, currentPage === 1 && styles.pageBtnDisabled]}
              onPress={() => currentPage > 1 && setPage(currentPage - 1)}
              disabled={currentPage === 1}
              activeOpacity={0.7}
            >
              <ChevronLeft size={16} color={currentPage === 1 ? Colors.textDisabled : Colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
            <Text style={styles.pageIndicator}>{currentPage} / {totalPages}</Text>
            <TouchableOpacity
              style={[styles.pageBtn, currentPage === totalPages && styles.pageBtnDisabled]}
              onPress={() => currentPage < totalPages && setPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              activeOpacity={0.7}
            >
              <ChevronRight size={16} color={currentPage === totalPages ? Colors.textDisabled : Colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
          </View>
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
  filterTabs: { flexDirection: 'row', marginHorizontal: Spacing[5], marginTop: Spacing[3], backgroundColor: Colors.neutral[100], borderRadius: Radius.md, padding: 3, gap: 3 },
  filterTab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 40, paddingHorizontal: Spacing[2], borderRadius: Radius.sm },
  filterTabActive: { backgroundColor: Colors.white, ...Shadow.sm },
  filterTabText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textSecondary, textAlign: 'center' },
  filterTabTextActive: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.primary },
  content: { padding: Spacing[5], gap: Spacing[3] },
  list: { gap: Spacing[3] },
  customerCard: {
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
  customerInfo: { flex: 1, gap: 2 },
  customerName: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  customerMobile: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  customerAddress: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  badge: { backgroundColor: Colors.primarySurface, paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  badgeText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.primary },
  paginationBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[4], paddingVertical: Spacing[4] },
  pageBtn: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  pageBtnDisabled: { opacity: 0.4 },
  pageIndicator: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
});

const webStyles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#F7F7F4' },
  content: { padding: 32, paddingBottom: 64, gap: 24 },
  filterTabs: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.neutral[100], borderRadius: 10, padding: 4, gap: 4 },
  filterTab: { minWidth: 150, alignItems: 'center', justifyContent: 'center', minHeight: 40, paddingHorizontal: 16, borderRadius: 8 },
  filterTabActive: { backgroundColor: '#FFFFFF', ...Shadow.sm },
  filterTabText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: '#64748B' },
  filterTabTextActive: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.primary },
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    height: 28,
  },
  resultCount: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
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
  paginationBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: Colors.neutral[50], borderTopWidth: 1, borderTopColor: Colors.border },
  paginationInfo: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  paginationControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pageBtn: { width: 36, height: 36, borderRadius: Radius.md, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  pageBtnDisabled: { opacity: 0.4 },
  pageIndicator: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
});
