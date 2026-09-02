import React, { useEffect, useState, useCallback } from 'react';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import {
  Smartphone, Monitor, Apple, Search, RefreshCw,
  ChevronLeft, ChevronRight, Zap, Clock,
} from 'lucide-react-native';
import { format, formatDistanceToNow } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 25;

interface LoginLog {
  id: string;
  user_id: string;
  platform: string;
  device_model: string;
  app_version: string;
  os_version: string;
  logged_in_at: string;
  profile: {
    full_name: string | null;
    mobile: string | null;
  } | null;
}

function PlatformBadge({ platform }: { platform: string }) {
  const p = platform.toLowerCase();
  if (p === 'android') {
    return (
      <View style={[styles.platformBadge, { backgroundColor: '#E8F5E9' }]}>
        <Smartphone size={12} color="#2E7D32" />
        <Text style={[styles.platformText, { color: '#2E7D32' }]}>Android</Text>
      </View>
    );
  }
  if (p === 'ios') {
    return (
      <View style={[styles.platformBadge, { backgroundColor: '#E3F2FD' }]}>
        <Apple size={12} color="#1565C0" />
        <Text style={[styles.platformText, { color: '#1565C0' }]}>iOS</Text>
      </View>
    );
  }
  return (
    <View style={[styles.platformBadge, { backgroundColor: Colors.neutral[100] }]}>
      <Monitor size={12} color={Colors.textSecondary} />
      <Text style={[styles.platformText, { color: Colors.textSecondary }]}>Web</Text>
    </View>
  );
}

function RecentLoginItem({ log }: { log: LoginLog }) {
  const name = log.profile?.full_name ?? 'Unknown';
  const time = format(new Date(log.logged_in_at), 'HH:mm');
  const ago = formatDistanceToNow(new Date(log.logged_in_at), { addSuffix: true });

  return (
    <View style={styles.recentItem}>
      <View style={styles.recentLeft}>
        <Text style={styles.recentName} numberOfLines={1}>{name}</Text>
        <Text style={styles.recentMeta} numberOfLines={1}>
          {log.device_model ? `${log.device_model} · ` : ''}{log.app_version}
        </Text>
      </View>
      <View style={styles.recentRight}>
        <Text style={styles.recentTime}>{time}</Text>
        <Text style={styles.recentAgo}>{ago}</Text>
      </View>
    </View>
  );
}

export default function CustomerLoginsScreen() {
  return (
    <ModuleGuard module="crm">
      <CustomerLoginsScreenContent />
    </ModuleGuard>
  );
}

function CustomerLoginsScreenContent() {
  const insets = useSafeAreaInsets();
  usePageVisibility(() => load(page, search));

  const [logs, setLogs] = useState<LoginLog[]>([]);
  const [recent, setRecent] = useState<LoginLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (pageNum = 0, searchVal = '') => {
    setLoading(true);
    try {
      // Recent logins (last 20, any platform)
      const { data: recentData } = await supabase
        .from('customer_login_logs')
        .select('id, user_id, platform, device_model, app_version, os_version, logged_in_at, profile:profiles!customer_login_logs_user_id_fkey(full_name, mobile)')
        .order('logged_in_at', { ascending: false })
        .limit(20);
      setRecent((recentData as any[]) ?? []);

      // Paginated all-devices query
      let query = supabase
        .from('customer_login_logs')
        .select('id, user_id, platform, device_model, app_version, os_version, logged_in_at, profile:profiles!customer_login_logs_user_id_fkey(full_name, mobile)', { count: 'exact' });

      if (searchVal.trim()) {
        query = query.or(`device_model.ilike.%${searchVal}%,platform.ilike.%${searchVal}%,app_version.ilike.%${searchVal}%`);
      }

      const { data, count, error } = await query
        .order('logged_in_at', { ascending: false })
        .range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE - 1);

      if (!error) {
        setLogs((data as any[]) ?? []);
        setTotal(count ?? 0);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(0, search); }, []);

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    setPage(0);
    load(0, val);
  }, [load]);

  const handlePage = (dir: 1 | -1) => {
    const next = page + dir;
    setPage(next);
    load(next, search);
  };

  const onRefresh = () => {
    setRefreshing(true);
    setPage(0);
    load(0, search);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const from = page * PAGE_SIZE + 1;
  const to = Math.min(from + logs.length - 1, total);

  const isWeb = Platform.OS === 'web';

  const content = (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        isWeb && styles.contentWeb,
        { paddingBottom: insets.bottom + Spacing[8] },
      ]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Page header */}
      <View style={styles.pageHeader}>
        <View style={[styles.pageIconWrap, { backgroundColor: Colors.primarySurface }]}>
          <Smartphone size={isWeb ? 22 : 18} color={Colors.primary} strokeWidth={1.8} />
        </View>
        <View>
          <Text style={[styles.pageTitle, isWeb && styles.pageTitleWeb]}>Customer Logins</Text>
          <Text style={styles.pageSubtitle}>Device & session history across all customers</Text>
        </View>
      </View>

      <View style={styles.layout}>
        {/* ── Main table ── */}
        <View style={styles.mainCol}>
          {/* Header */}
          <View style={styles.tableHeader}>
            <View style={styles.tableHeaderLeft}>
              <View style={styles.searchRow}>
                <Search size={14} color={Colors.textTertiary} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search device, platform, version..."
                  placeholderTextColor={Colors.textTertiary}
                  value={search}
                  onChangeText={handleSearch}
                />
              </View>
              <Text style={styles.resultCount}>
                {total > 0
                  ? `Showing ${from}–${to} of ${total.toLocaleString()}`
                  : loading ? '' : 'No results'}
              </Text>
            </View>
            <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
              <RefreshCw size={14} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Column headings */}
          <View style={styles.colRow}>
            <Text style={[styles.colHead, { flex: 2.2 }]}>User</Text>
            <Text style={[styles.colHead, { flex: 1.5 }]}>Mobile</Text>
            <Text style={[styles.colHead, { flex: 1.2 }]}>Platform</Text>
            <Text style={[styles.colHead, { flex: 1.5 }]}>Device Model</Text>
            <Text style={[styles.colHead, { flex: 0.8 }]}>Version</Text>
            <Text style={[styles.colHead, { flex: 1.8, textAlign: 'right' }]}>Last Login</Text>
          </View>

          {/* Rows */}
          {loading && !refreshing ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : logs.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Smartphone size={36} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>No login records found</Text>
            </View>
          ) : (
            logs.map((log, i) => {
              const name = log.profile?.full_name ?? '—';
              const userId = log.user_id.slice(-5).toUpperCase();
              const mobile = log.profile?.mobile
                ? log.profile.mobile.startsWith('+') ? log.profile.mobile : `+${log.profile.mobile}`
                : '—';
              const loginAt = new Date(log.logged_in_at);
              const timeStr = format(loginAt, 'yyyy-MM-dd HH:mm');
              const ago = formatDistanceToNow(loginAt, { addSuffix: true });

              return (
                <View key={log.id} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                  <View style={[styles.cell, { flex: 2.2 }]}>
                    <Text style={styles.cellName} numberOfLines={1}>{name}</Text>
                    <Text style={styles.cellSub}>#{userId}</Text>
                  </View>
                  <View style={[styles.cell, { flex: 1.5 }]}>
                    <Text style={styles.cellValue} numberOfLines={1}>{mobile}</Text>
                  </View>
                  <View style={[styles.cell, { flex: 1.2 }]}>
                    <PlatformBadge platform={log.platform} />
                  </View>
                  <View style={[styles.cell, { flex: 1.5 }]}>
                    <Text style={styles.cellValue} numberOfLines={1}>{log.device_model || '—'}</Text>
                  </View>
                  <View style={[styles.cell, { flex: 0.8 }]}>
                    <Text style={styles.cellValue}>{log.app_version || '—'}</Text>
                  </View>
                  <View style={[styles.cell, { flex: 1.8, alignItems: 'flex-end' }]}>
                    <Text style={styles.cellTime}>{timeStr}</Text>
                    <Text style={styles.cellAgo}>{ago}</Text>
                  </View>
                </View>
              );
            })
          )}

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <View style={styles.pagination}>
              <TouchableOpacity
                style={[styles.pageBtn, page === 0 && styles.pageBtnDisabled]}
                onPress={() => page > 0 && handlePage(-1)}
                disabled={page === 0}
              >
                <ChevronLeft size={16} color={page === 0 ? Colors.textTertiary : Colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.pageInfo}>
                Page {page + 1} of {totalPages}
              </Text>
              <TouchableOpacity
                style={[styles.pageBtn, page >= totalPages - 1 && styles.pageBtnDisabled]}
                onPress={() => page < totalPages - 1 && handlePage(1)}
                disabled={page >= totalPages - 1}
              >
                <ChevronRight size={16} color={page >= totalPages - 1 ? Colors.textTertiary : Colors.textPrimary} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Recent Logins sidebar ── */}
        <View style={styles.sideCol}>
          <View style={styles.sideHeader}>
            <Zap size={14} color={Colors.warning} />
            <Text style={styles.sideTitle}>Recent Logins</Text>
          </View>
          {recent.length === 0 && !loading ? (
            <Text style={styles.sideEmpty}>No recent logins</Text>
          ) : (
            recent.map((log) => <RecentLoginItem key={log.id} log={log} />)
          )}
        </View>
      </View>
    </ScrollView>
  );

  if (Platform.OS === 'web') {
    return <View style={styles.container}>{content}</View>;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.mobileHeader}>
        <Text style={styles.mobileTitle}>Customer Logins</Text>
      </View>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  mobileHeader: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  mobileTitle: {
    fontFamily: Typography.fontFamily.serifDisplay,
    fontSize: Typography.size['2xl'],
    color: Colors.textPrimary,
  },
  scroll: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing[4], gap: Spacing[4] },
  contentWeb: { padding: Spacing[8], gap: Spacing[6] },

  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  pageIconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    fontFamily: Typography.fontFamily.serifDisplay,
    fontSize: Typography.size['2xl'],
    color: Colors.textPrimary,
  },
  pageTitleWeb: {
    fontSize: Typography.size['3xl'],
  },
  pageSubtitle: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  layout: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    gap: Spacing[4],
    alignItems: 'flex-start',
  },

  // ── Main table ──
  mainCol: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    gap: Spacing[3],
  },
  tableHeaderLeft: { flex: 1, gap: Spacing[2] },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.neutral[50],
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    outlineWidth: 0,
  } as any,
  resultCount: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: Colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
  },

  colRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    backgroundColor: Colors.neutral[50],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  colHead: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  row: {
    flexDirection: 'row',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    alignItems: 'center',
  },
  rowAlt: { backgroundColor: Colors.neutral[50] },
  cell: { paddingRight: Spacing[2] },
  cellName: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  cellSub: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  cellValue: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  cellTime: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  cellAgo: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginTop: 1,
  },

  loadingWrap: { padding: Spacing[8], alignItems: 'center' },
  emptyWrap: { padding: Spacing[8], alignItems: 'center', gap: Spacing[3] },
  emptyText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },

  // Platform badge
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
  },
  platformText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
  },

  // Pagination
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing[3],
    gap: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  pageBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: Colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pageBtnDisabled: { opacity: 0.4 },
  pageInfo: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    minWidth: 100,
    textAlign: 'center',
  },

  // ── Recent Logins sidebar ──
  sideCol: {
    width: Platform.OS === 'web' ? 280 : '100%',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  sideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  sideTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  sideEmpty: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    padding: Spacing[4],
    textAlign: 'center',
  },

  recentItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    gap: Spacing[2],
  },
  recentLeft: { flex: 1, gap: 2 },
  recentName: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  recentMeta: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  recentRight: { alignItems: 'flex-end', gap: 2 },
  recentTime: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  recentAgo: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
});
