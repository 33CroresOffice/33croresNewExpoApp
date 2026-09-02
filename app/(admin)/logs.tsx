import React, { useEffect, useState, useCallback } from 'react';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Activity, Search, RefreshCw, ListFilter as Filter, ChevronDown, ClipboardList, Users, Bike, CreditCard, Package, Leaf, ShieldCheck, RotateCcw, CirclePause as PauseCircle, Circle } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { format, parseISO, isToday, isYesterday, formatDistanceToNow } from 'date-fns';

type LogSource = 'admin' | 'rider' | 'renewal' | 'pause';

interface UnifiedLog {
  id: string;
  source: LogSource;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string;
  actor_name: string | null;
  actor_role: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

const SOURCE_CONFIG: Record<LogSource, { label: string; color: string; bgColor: string }> = {
  admin:   { label: 'Admin Action',    color: '#2D5A27', bgColor: '#EBF5E8' },
  rider:   { label: 'Rider Activity',  color: '#1565C0', bgColor: '#E3F2FD' },
  renewal: { label: 'Subscription',    color: '#6A1B9A', bgColor: '#F3E5F5' },
  pause:   { label: 'Pause',           color: '#E65100', bgColor: '#FFF3E0' },
};

const ENTITY_ICON: Record<string, any> = {
  order:        ClipboardList,
  subscription: RotateCcw,
  rider:        Bike,
  customer:     Users,
  payment:      CreditCard,
  procurement:  Package,
  requirement:  Leaf,
  admin:        ShieldCheck,
  pause:        PauseCircle,
};

const PAGE_SIZE = 50;

const FILTER_OPTIONS: { label: string; value: LogSource | 'all' }[] = [
  { label: 'All Sources', value: 'all' },
  { label: 'Admin Actions', value: 'admin' },
  { label: 'Rider Activity', value: 'rider' },
  { label: 'Renewals', value: 'renewal' },
  { label: 'Pauses', value: 'pause' },
];

function groupByDate(logs: UnifiedLog[]): { date: string; items: UnifiedLog[] }[] {
  const groups: Record<string, UnifiedLog[]> = {};
  for (const log of logs) {
    const d = log.created_at.slice(0, 10);
    if (!groups[d]) groups[d] = [];
    groups[d].push(log);
  }
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, items }));
}

function dateLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEEE, d MMMM yyyy');
}

function timeLabel(ts: string): string {
  return format(parseISO(ts), 'HH:mm');
}

function relativeLabel(ts: string): string {
  return formatDistanceToNow(parseISO(ts), { addSuffix: true });
}

export default function LogsScreen() {
  return (
    <ModuleGuard module="logs">
      <LogsScreenContent />
    </ModuleGuard>
  );
}

function LogsScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';

  const [logs, setLogs] = useState<UnifiedLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<LogSource | 'all'>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchLogs = useCallback(async (pageNum = 0, append = false) => {
    if (pageNum === 0) setLoading(true);
    else setLoadingMore(true);

    try {
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const results: UnifiedLog[] = [];

      const [adminRes, riderRes, renewalRes, pauseRes] = await Promise.all([
        (filter === 'all' || filter === 'admin')
          ? supabase.from('admin_activity_log').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to)
          : Promise.resolve({ data: [], count: 0, error: null }),

        (filter === 'all' || filter === 'rider')
          ? supabase.from('rider_activity_log').select('*, rider:riders(profiles(full_name)), actor:profiles!actor_id(full_name, admin_role)').order('created_at', { ascending: false }).range(from, to)
          : Promise.resolve({ data: [], count: 0, error: null }),

        (filter === 'all' || filter === 'renewal')
          ? supabase.from('subscription_renewal_history').select('*, plan:subscription_plans(name), user:profiles!user_id(full_name)').order('renewed_at', { ascending: false }).range(from, to)
          : Promise.resolve({ data: [], count: 0, error: null }),

        (filter === 'all' || filter === 'pause')
          ? supabase.from('subscription_pause_history').select('*, subscription:subscriptions(user_id, profiles:user_id(full_name))').order('created_at', { ascending: false }).range(from, to)
          : Promise.resolve({ data: [], count: 0, error: null }),
      ]);

      if (adminRes.data) {
        for (const r of adminRes.data as any[]) {
          results.push({
            id: `admin-${r.id}`,
            source: 'admin',
            action: r.action,
            entity_type: r.entity_type,
            entity_id: r.entity_id,
            description: r.description,
            actor_name: r.actor_name,
            actor_role: r.actor_role,
            metadata: r.metadata ?? {},
            created_at: r.created_at,
          });
        }
      }

      if (riderRes.data) {
        for (const r of riderRes.data as any[]) {
          const riderName = r.rider?.profiles?.full_name ?? 'Rider';
          const actorName = r.actor?.full_name ?? 'System';
          results.push({
            id: `rider-${r.id}`,
            source: 'rider',
            action: r.activity_type,
            entity_type: 'rider',
            entity_id: r.rider_id,
            description: r.description,
            actor_name: actorName,
            actor_role: r.actor?.admin_role ?? null,
            metadata: { ...r.metadata, rider_name: riderName },
            created_at: r.created_at,
          });
        }
      }

      if (renewalRes.data) {
        for (const r of renewalRes.data as any[]) {
          const userName = r.user?.full_name ?? 'Customer';
          const planName = r.plan?.name ?? 'Plan';
          results.push({
            id: `renewal-${r.id}`,
            source: 'renewal',
            action: 'subscription.renewed',
            entity_type: 'subscription',
            entity_id: r.new_subscription_id,
            description: `${userName} renewed "${planName}"`,
            actor_name: userName,
            actor_role: 'customer',
            metadata: {
              amount_paid: r.amount_paid,
              old_end_date: r.old_end_date,
              new_end_date: r.new_end_date,
              razorpay_payment_id: r.razorpay_payment_id,
            },
            created_at: r.renewed_at,
          });
        }
      }

      if (pauseRes.data) {
        for (const r of pauseRes.data as any[]) {
          const userName = r.subscription?.profiles?.full_name ?? 'Customer';
          results.push({
            id: `pause-${r.id}`,
            source: 'pause',
            action: 'subscription.paused',
            entity_type: 'pause',
            entity_id: r.subscription_id,
            description: `${userName} paused subscription`,
            actor_name: userName,
            actor_role: 'customer',
            metadata: {
              pause_start_date: r.pause_start_date,
              pause_until: r.pause_until,
              resumed_at: r.resumed_at,
            },
            created_at: r.created_at,
          });
        }
      }

      results.sort((a, b) => b.created_at.localeCompare(a.created_at));

      const totalCount = (adminRes.count ?? 0) + (riderRes.data?.length ?? 0) + (renewalRes.data?.length ?? 0) + (pauseRes.data?.length ?? 0);

      setTotal(prev => (pageNum === 0 ? totalCount : prev + totalCount));
      setLogs(prev => append ? [...prev, ...results] : results);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filter]);

  useEffect(() => {
    setPage(0);
    fetchLogs(0, false);
  }, [filter, fetchLogs]);

  const filtered = search.trim()
    ? logs.filter(l =>
        l.description.toLowerCase().includes(search.toLowerCase()) ||
        l.actor_name?.toLowerCase().includes(search.toLowerCase()) ||
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        l.entity_type?.toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  const groups = groupByDate(filtered);

  const activeFilterLabel = FILTER_OPTIONS.find(f => f.value === filter)?.label ?? 'All Sources';

  return (
    <View style={[styles.root, !isWeb && { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Activity Logs</Text>
          <Text style={styles.subtitle}>{total} events recorded</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => fetchLogs(0, false)}>
          <RefreshCw size={16} color={Colors.textSecondary} strokeWidth={1.8} />
        </TouchableOpacity>
      </View>

      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Search size={15} color={Colors.textTertiary} strokeWidth={1.8} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search logs..."
            placeholderTextColor={Colors.textDisabled}
          />
        </View>

        <View style={{ position: 'relative' }}>
          <TouchableOpacity style={styles.filterBtn} onPress={() => setShowFilterMenu(v => !v)}>
            <Filter size={14} color={Colors.textSecondary} strokeWidth={1.8} />
            <Text style={styles.filterBtnText}>{activeFilterLabel}</Text>
            <ChevronDown size={13} color={Colors.textSecondary} strokeWidth={1.8} />
          </TouchableOpacity>
          {showFilterMenu && (
            <View style={styles.filterMenu}>
              {FILTER_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.filterMenuItem, filter === opt.value && styles.filterMenuItemActive]}
                  onPress={() => { setFilter(opt.value as any); setShowFilterMenu(false); }}
                >
                  <Text style={[styles.filterMenuItemText, filter === opt.value && styles.filterMenuItemTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading logs...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Activity size={40} color={Colors.textDisabled} strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>No logs found</Text>
          <Text style={styles.emptyText}>
            {search ? 'Try a different search term.' : 'Activity will appear here as actions are taken.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 200 && !loadingMore) {
              const nextPage = page + 1;
              setPage(nextPage);
              fetchLogs(nextPage, true);
            }
          }}
          scrollEventThrottle={400}
        >
          {groups.map(({ date, items }) => (
            <View key={date} style={styles.group}>
              <View style={styles.dateRow}>
                <View style={styles.dateLine} />
                <Text style={styles.dateLabel}>{dateLabel(date)}</Text>
                <View style={styles.dateLine} />
              </View>
              {items.map((log, idx) => {
                const src = SOURCE_CONFIG[log.source];
                const EntityIcon = ENTITY_ICON[log.entity_type ?? ''] ?? Circle;
                return (
                  <View key={log.id} style={styles.logCard}>
                    <View style={styles.timelineCol}>
                      <View style={[styles.iconWrap, { backgroundColor: src.bgColor }]}>
                        <EntityIcon size={14} color={src.color} strokeWidth={2} />
                      </View>
                      {idx < items.length - 1 && <View style={styles.connector} />}
                    </View>

                    <View style={styles.logBody}>
                      <View style={styles.logTop}>
                        <View style={[styles.sourceBadge, { backgroundColor: src.bgColor }]}>
                          <Text style={[styles.sourceBadgeText, { color: src.color }]}>{src.label}</Text>
                        </View>
                        <Text style={styles.timeText}>{timeLabel(log.created_at)}</Text>
                        <Text style={styles.relativeText}>{relativeLabel(log.created_at)}</Text>
                      </View>

                      <Text style={styles.descText}>{log.description}</Text>

                      <View style={styles.metaRow}>
                        {log.actor_name && (
                          <Text style={styles.metaText}>by {log.actor_name}</Text>
                        )}
                        {log.actor_role && log.actor_role !== 'customer' && (
                          <View style={styles.rolePill}>
                            <Text style={styles.rolePillText}>{log.actor_role.replace('_', ' ')}</Text>
                          </View>
                        )}
                        {log.action && (
                          <Text style={styles.actionCode}>{log.action}</Text>
                        )}
                      </View>

                      {Object.keys(log.metadata).length > 0 && (
                        <MetadataChips metadata={log.metadata} />
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}

          {loadingMore && (
            <View style={styles.loadMoreRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.loadMoreText}>Loading more...</Text>
            </View>
          )}

          <View style={{ height: Spacing[8] }} />
        </ScrollView>
      )}
    </View>
  );
}

function MetadataChips({ metadata }: { metadata: Record<string, any> }) {
  const entries = Object.entries(metadata).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (entries.length === 0) return null;
  return (
    <View style={chipStyles.row}>
      {entries.slice(0, 4).map(([k, v]) => (
        <View key={k} style={chipStyles.chip}>
          <Text style={chipStyles.key}>{k.replace(/_/g, ' ')}: </Text>
          <Text style={chipStyles.val} numberOfLines={1}>{String(v)}</Text>
        </View>
      ))}
    </View>
  );
}

const chipStyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  chip: { flexDirection: 'row', backgroundColor: Colors.neutral[100], borderRadius: Radius.sm, paddingVertical: 2, paddingHorizontal: 6 },
  key: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 10, color: Colors.textTertiary },
  val: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textSecondary, maxWidth: 120 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[6],
    paddingBottom: Spacing[3],
  },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.textPrimary },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 2 },
  refreshBtn: {
    width: 36, height: 36, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.white,
  },

  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingHorizontal: Spacing[6],
    paddingBottom: Spacing[4],
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
  },
  filterBtnText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  filterMenu: {
    position: 'absolute',
    top: 40,
    right: 0,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    zIndex: 100,
    minWidth: 160,
    ...Shadow.md,
  },
  filterMenuItem: { paddingVertical: Spacing[3], paddingHorizontal: Spacing[4] },
  filterMenuItemActive: { backgroundColor: Colors.primarySurface },
  filterMenuItemText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  filterMenuItemTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing[3], padding: Spacing[8] },
  loadingText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  emptyTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  emptyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center' },

  list: { paddingHorizontal: Spacing[6], paddingTop: Spacing[2] },

  group: { marginBottom: Spacing[4] },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], marginBottom: Spacing[3] },
  dateLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dateLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  logCard: { flexDirection: 'row', gap: Spacing[3], marginBottom: 2 },
  timelineCol: { alignItems: 'center', width: 28 },
  iconWrap: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 1,
  },
  connector: { flex: 1, width: 2, backgroundColor: Colors.border, marginVertical: 2, minHeight: 16 },

  logBody: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing[3],
    marginBottom: Spacing[2],
    borderWidth: 1,
    borderColor: Colors.border,
  },
  logTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], marginBottom: 5 },
  sourceBadge: { paddingVertical: 2, paddingHorizontal: 7, borderRadius: Radius.full },
  sourceBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10 },
  timeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textPrimary, marginLeft: 'auto' as any },
  relativeText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary },

  descText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary, lineHeight: 18 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], marginTop: 4, flexWrap: 'wrap' },
  metaText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary },
  rolePill: { backgroundColor: Colors.neutral[100], borderRadius: Radius.full, paddingVertical: 1, paddingHorizontal: 6 },
  rolePillText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 10, color: Colors.textSecondary, textTransform: 'capitalize' },
  actionCode: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textDisabled, fontStyle: 'italic' },

  loadMoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2], paddingVertical: Spacing[4] },
  loadMoreText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
});
