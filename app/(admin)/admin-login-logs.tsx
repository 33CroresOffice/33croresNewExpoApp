import React, { useCallback, useEffect, useState } from 'react';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshCw, Search, ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { format, formatDistanceToNow } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { usePageVisibility } from '@/hooks/usePageVisibility';

const PAGE_SIZE = 25;

type LoginLog = {
  id: string;
  actor_name: string | null;
  actor_role: string | null;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export default function AdminLoginLogsScreen() {
  return (
    <ModuleGuard module="admin_users">
      <AdminLoginLogsContent />
    </ModuleGuard>
  );
}

function AdminLoginLogsContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [logs, setLogs] = useState<LoginLog[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (pageNumber = 0, searchValue = '') => {
    setLoading(true);
    setLoadError(null);
    let query = supabase
      .from('admin_activity_log')
      .select('id, actor_name, actor_role, description, metadata, created_at', { count: 'exact' })
      .eq('action', 'admin.login');

    if (searchValue.trim()) {
      const value = searchValue.trim();
      query = query.or(`actor_name.ilike.%${value}%,actor_role.ilike.%${value}%,description.ilike.%${value}%`);
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(pageNumber * PAGE_SIZE, pageNumber * PAGE_SIZE + PAGE_SIZE - 1);

    if (error) {
      setLoadError('Unable to load admin login records.');
      setLogs([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    setLogs((data as LoginLog[]) ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => { load(0, ''); }, [load]);
  usePageVisibility(() => load(page, search));

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(0);
    load(0, value);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <View style={[styles.root, !isWeb && { paddingTop: insets.top }]}> 
      <ScrollView contentContainerStyle={[styles.content, isWeb && styles.contentWeb, { paddingBottom: insets.bottom + Spacing[8] }]}>
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            <View style={styles.iconWrap}>
              <ShieldCheck size={22} color={Colors.primary} strokeWidth={1.8} />
            </View>
            <View>
              <Text style={[styles.title, isWeb && styles.titleWeb]}>Admin Login Logs</Text>
              <Text style={styles.subtitle}>Successful administrator sign-ins</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={() => load(page, search)}>
            <RefreshCw size={16} color={Colors.textSecondary} strokeWidth={1.8} />
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.toolbar}>
            <View style={styles.searchBox}>
              <Search size={15} color={Colors.textTertiary} strokeWidth={1.8} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={handleSearch}
                placeholder="Search admin or role..."
                placeholderTextColor={Colors.textTertiary}
              />
            </View>
            <Text style={styles.count}>{total > 0 ? `Showing ${from}–${to} of ${total}` : loading ? '' : 'No login records'}</Text>
          </View>

          <View style={styles.tableHeader}>
            <Text style={[styles.heading, { flex: 2 }]}>Admin</Text>
            <Text style={[styles.heading, { flex: 1.4 }]}>Role</Text>
            <Text style={[styles.heading, { flex: 2, textAlign: 'right' }]}>Signed in</Text>
          </View>

          {loading ? (
            <View style={styles.empty}><ActivityIndicator color={Colors.primary} /></View>
          ) : loadError ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{loadError}</Text>
            </View>
          ) : logs.length === 0 ? (
            <View style={styles.empty}>
              <ShieldCheck size={32} color={Colors.textTertiary} strokeWidth={1.5} />
              <Text style={styles.emptyText}>No admin login records found</Text>
            </View>
          ) : logs.map((log, index) => (
            <View key={log.id} style={[styles.row, index % 2 === 1 && styles.rowAlt]}>
              <View style={[styles.cell, { flex: 2 }]}>
                <Text style={styles.adminName} numberOfLines={1}>{log.actor_name ?? 'Unknown admin'}</Text>
                <Text style={styles.description} numberOfLines={1}>{log.description}</Text>
              </View>
              <View style={[styles.cell, { flex: 1.4 }]}>
                <Text style={styles.role}>{log.actor_role?.replace('_', ' ') ?? 'Admin'}</Text>
              </View>
              <View style={[styles.cell, { flex: 2, alignItems: 'flex-end' }]}>
                <Text style={styles.date}>{format(new Date(log.created_at), 'dd/MM/yyyy · h:mm a')}</Text>
                <Text style={styles.relative}>{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</Text>
              </View>
            </View>
          ))}

          {total > PAGE_SIZE && (
            <View style={styles.pagination}>
              <TouchableOpacity style={[styles.pageButton, page === 0 && styles.disabled]} disabled={page === 0} onPress={() => { const next = page - 1; setPage(next); load(next, search); }}>
                <ChevronLeft size={16} color={page === 0 ? Colors.textTertiary : Colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.pageText}>Page {page + 1} of {totalPages}</Text>
              <TouchableOpacity style={[styles.pageButton, page >= totalPages - 1 && styles.disabled]} disabled={page >= totalPages - 1} onPress={() => { const next = page + 1; setPage(next); load(next, search); }}>
                <ChevronRight size={16} color={page >= totalPages - 1 ? Colors.textTertiary : Colors.textPrimary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing[4], gap: Spacing[4] },
  contentWeb: { padding: Spacing[8], gap: Spacing[6] },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  iconWrap: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primarySurface },
  title: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size['2xl'], color: Colors.textPrimary },
  titleWeb: { fontSize: Typography.size['3xl'] },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },
  refreshButton: { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing[3], padding: Spacing[4], borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchBox: { flex: 1, maxWidth: 360, minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingHorizontal: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.neutral[50], borderWidth: 1, borderColor: Colors.border },
  searchInput: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, paddingVertical: 0 },
  count: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  tableHeader: { flexDirection: 'row', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], backgroundColor: Colors.neutral[50], borderBottomWidth: 1, borderBottomColor: Colors.border },
  heading: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], minHeight: 64, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  rowAlt: { backgroundColor: Colors.neutral[50] },
  cell: { justifyContent: 'center', minWidth: 0 },
  adminName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  description: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 3 },
  role: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary, textTransform: 'capitalize' },
  date: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  relative: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 3 },
  empty: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: Spacing[2] },
  emptyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[4], padding: Spacing[4] },
  pageButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  disabled: { opacity: 0.45 },
  pageText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
});
