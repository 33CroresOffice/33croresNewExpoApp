import React, { useEffect, useState } from 'react';
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
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, ChevronRight, Users } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import EmptyState from '@/components/ui/EmptyState';
import { format } from 'date-fns';

export default function AdminCustomersScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const load = async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*, subscriptions(count)')
        .eq('role', 'customer')
        .order('created_at', { ascending: false });
      if (data) setCustomers(data);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = customers.filter((c) => {
    if (!search) return true;
    const name = c.full_name?.toLowerCase() ?? '';
    return name.includes(search.toLowerCase()) || c.mobile.includes(search);
  });

  if (isWeb) {
    return (
      <ScrollView style={webStyles.scroll} contentContainerStyle={webStyles.content} showsVerticalScrollIndicator={false}>
        <View style={webStyles.pageHeader}>
          <View>
            <Text style={webStyles.pageTitle}>Customers</Text>
            <Text style={webStyles.pageSubtitle}>{customers.length} registered customers</Text>
          </View>
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
                {search ? 'No customers match your search.' : 'No customers have signed up yet.'}
              </Text>
            </View>
          ) : (
            filtered.map((customer, i) => (
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
      </ScrollView>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Customers</Text>
        <Text style={styles.count}>{customers.length} total</Text>
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
            description={search ? 'Try a different search term' : 'No customers have signed up yet'}
          />
        ) : (
          <View style={styles.list}>
            {filtered.map((customer) => (
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
});
