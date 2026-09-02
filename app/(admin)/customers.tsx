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
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, ChevronRight, Users, X, ChevronLeft } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import EmptyState from '@/components/ui/EmptyState';
import { format } from 'date-fns';

type CustomerFilter = 'all' | 'new_today' | 'active' | 'inactive' | 'subscribed';

const FILTER_LABELS: Record<CustomerFilter, string> = {
  all: 'All Users',
  new_today: 'New Today',
  active: 'Active Users',
  inactive: 'Inactive Users',
  subscribed: 'Subscribed Users',
};

export default function AdminCustomersScreen() {
  return (
    <ModuleGuard module="crm">
      <AdminCustomersScreenContent />
    </ModuleGuard>
  );
}

function AdminCustomersScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const params = useLocalSearchParams<{ customerFilter?: string }>();
  const [activeFilter, setActiveFilter] = useState<CustomerFilter>((params.customerFilter as CustomerFilter) ?? 'all');
  const [customers, setCustomers] = useState<any[]>([]);
  const [activeCustomerIds, setActiveCustomerIds] = useState<Set<string>>(new Set());
  const [subscribedCustomerIds, setSubscribedCustomerIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const load = async () => {
    try {
      const [activeSubsRes, allSubsRes, customOrdersRes] = await Promise.all([
        supabase.from('subscriptions').select('user_id').eq('status', 'active'),
        supabase.from('subscriptions').select('user_id'),
        supabase.from('custom_orders').select('user_id'),
      ]);

      const subscribedIds = new Set<string>();
      allSubsRes.data?.forEach((r: any) => r.user_id && subscribedIds.add(r.user_id));
      customOrdersRes.data?.forEach((r: any) => r.user_id && subscribedIds.add(r.user_id));
      setSubscribedCustomerIds(subscribedIds);
      if (activeSubsRes.data) {
        setActiveCustomerIds(new Set(activeSubsRes.data.map((r: any) => r.user_id)));
      }

      const allUserIds = new Set<string>([...subscribedIds]);

      let profilesRes;
      if (allUserIds.size > 0) {
        const ids = Array.from(allUserIds);
        const chunks: string[][] = [];
        for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
        const results = await Promise.all(
          chunks.map(chunk =>
            supabase
              .from('profiles')
              .select('*, subscriptions(count)')
              .in('id', chunk)
              .order('created_at', { ascending: false })
          )
        );
        profilesRes = {
          data: results.flatMap(r => r.data ?? []),
        };
      } else {
        profilesRes = await supabase
          .from('profiles')
          .select('*, subscriptions(count)')
          .eq('role', 'customer')
          .order('created_at', { ascending: false });
      }

      const customerRoleRes = await supabase
        .from('profiles')
        .select('*, subscriptions(count)')
        .eq('role', 'customer')
        .order('created_at', { ascending: false });

      const merged = new Map<string, any>();
      (customerRoleRes.data ?? []).forEach((p: any) => merged.set(p.id, p));
      (profilesRes.data ?? []).forEach((p: any) => {
        if (!merged.has(p.id)) merged.set(p.id, p);
      });
      const sorted = Array.from(merged.values()).sort((a, b) =>
        (b.created_at ?? '').localeCompare(a.created_at ?? '')
      );
      setCustomers(sorted);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  usePageVisibility(load);

  // Sync filter when navigating with params
  useEffect(() => {
    if (params.customerFilter) {
      setActiveFilter(params.customerFilter as CustomerFilter);
    }
  }, [params.customerFilter]);

  const today = new Date().toISOString().split('T')[0];

  const applyFilter = (c: any): boolean => {
    switch (activeFilter) {
      case 'new_today':
        return c.created_at?.startsWith(today) ?? false;
      case 'active':
        return activeCustomerIds.has(c.id);
      case 'inactive':
        return !activeCustomerIds.has(c.id);
      case 'subscribed':
        return subscribedCustomerIds.has(c.id);
      default:
        return true;
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

  if (isWeb) {
    return (
      <ScrollView style={webStyles.scroll} contentContainerStyle={webStyles.content} showsVerticalScrollIndicator={false}>
        <View style={webStyles.pageHeader}>
          <View>
            <Text style={webStyles.pageTitle}>Users</Text>
            <Text style={webStyles.pageSubtitle}>{customers.length} registered users</Text>
          </View>
        </View>

        <View style={webStyles.filterRow}>
          {(Object.keys(FILTER_LABELS) as CustomerFilter[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[webStyles.filterChip, activeFilter === f && webStyles.filterChipActive]}
              onPress={() => setActiveFilter(f)}
              activeOpacity={0.8}
            >
              <Text style={[webStyles.filterChipText, activeFilter === f && webStyles.filterChipTextActive]}>
                {FILTER_LABELS[f]}
              </Text>
            </TouchableOpacity>
          ))}
          {activeFilter !== 'all' && (
            <TouchableOpacity style={webStyles.clearFilterBtn} onPress={() => setActiveFilter('all')} activeOpacity={0.8}>
              <X size={13} color="#64748B" strokeWidth={2} />
              <Text style={webStyles.clearFilterText}>Clear</Text>
            </TouchableOpacity>
          )}
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
            {search ? (
              <Text style={webStyles.resultCount}>{filtered.length} results</Text>
            ) : null}
          </View>

          <View style={webStyles.tableHead}>
            <Text style={[webStyles.thCell, { flex: 3 }]}>Customer</Text>
            <Text style={[webStyles.thCell, { flex: 2 }]}>Mobile</Text>
            <Text style={[webStyles.thCell, { flex: 1 }]}>Joined</Text>
            <Text style={[webStyles.thCell, { flex: 1 }]}>Subscriptions</Text>
            <Text style={[webStyles.thCell, { width: 80 }]}></Text>
          </View>

          {!loading && filtered.length === 0 ? (
            <View style={webStyles.emptyState}>
              <Text style={webStyles.emptyText}>
                {search ? 'No users match your search.' : 'No users have signed up yet.'}
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
                  <View style={webStyles.avatar}>
                    <Text style={webStyles.avatarText}>
                      {customer.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                  <View>
                    <Text style={webStyles.customerName}>{customer.full_name ?? 'Name not set'}</Text>
                    <Text style={webStyles.customerMobile}>{customer.is_verified ? 'Verified' : 'Unverified'}</Text>
                  </View>
                </View>
                <Text style={[webStyles.tdCell, { flex: 2 }]}>+91 {customer.mobile}</Text>
                <Text style={[webStyles.tdMuted, { flex: 1 }]}>
                  {customer.created_at ? format(new Date(customer.created_at), 'dd MMM yyyy') : '—'}
                </Text>
                <Text style={[webStyles.tdCell, { flex: 1 }]}>
                  {customer.subscriptions?.[0]?.count ?? 0}
                </Text>
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
        <Text style={styles.title}>Users</Text>
        <Text style={styles.count}>{filtered.length} shown</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mFilterScroll} contentContainerStyle={styles.mFilterRow}>
        {(Object.keys(FILTER_LABELS) as CustomerFilter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.mFilterChip, activeFilter === f && styles.mFilterChipActive]}
            onPress={() => setActiveFilter(f)}
            activeOpacity={0.8}
          >
            <Text style={[styles.mFilterChipText, activeFilter === f && styles.mFilterChipTextActive]}>
              {FILTER_LABELS[f]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

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
            title="No users found"
            description={search ? 'Try a different search term' : 'No users have signed up yet'}
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
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {customer.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                  </Text>
                </View>
                <View style={styles.customerInfo}>
                  <Text style={styles.customerName}>{customer.full_name ?? 'Name not set'}</Text>
                  <Text style={styles.customerMobile}>+91 {customer.mobile}</Text>
                  <Text style={styles.customerDate}>
                    Joined {format(new Date(customer.created_at), 'dd MMM yyyy')}
                  </Text>
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
  mFilterScroll: { maxHeight: 48, flexGrow: 0 },
  mFilterRow: { paddingHorizontal: Spacing[5], paddingVertical: Spacing[2], gap: Spacing[2] },
  mFilterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.full,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  mFilterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  mFilterChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textSecondary },
  mFilterChipTextActive: { color: Colors.white },
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
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.lg,
    color: Colors.white,
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
  customerDate: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  paginationBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[4], paddingVertical: Spacing[4] },
  pageBtn: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  pageBtnDisabled: { opacity: 0.4 },
  pageIndicator: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
});

const webStyles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#F7F7F4' },
  content: { padding: 32, paddingBottom: 64, gap: 24 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0',
  },
  filterChipActive: { backgroundColor: '#2D5A27', borderColor: '#2D5A27' },
  filterChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: '#64748B' },
  filterChipTextActive: { color: '#FFFFFF' },
  clearFilterBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  clearFilterText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: '#64748B' },
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
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.primary,
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
