import React, { useEffect, useState, useCallback } from 'react';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, TextInput, RefreshControl, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import { Search, RefreshCw, ChevronDown, ChevronUp, ShieldCheck, Bell, X, Zap } from 'lucide-react-native';
import { format, formatDistanceToNow } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { NotificationLog, NotificationChannel } from '@/types/database';

const CHANNEL_CONFIG: Record<NotificationChannel, { label: string; color: string; bg: string }> = {
  sms: { label: 'SMS', color: '#1565C0', bg: '#E3F2FD' },
  whatsapp: { label: 'WhatsApp', color: '#2E7D32', bg: '#E8F5E9' },
  push: { label: 'Push', color: '#E65100', bg: '#FFF3E0' },
  in_app: { label: 'In-App', color: '#6A1B9A', bg: '#F3E5F5' },
};

const STATUS_CONFIG = {
  sent: { label: 'Sent', color: Colors.success, bg: Colors.successSurface },
  failed: { label: 'Failed', color: Colors.error, bg: Colors.errorSurface },
  skipped: { label: 'Skipped', color: Colors.textTertiary, bg: Colors.neutral[100] },
  pending: { label: 'Pending', color: Colors.accent, bg: Colors.accentSurface },
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  subscription_expiring_3days: 'Expiring 3 Days',
  subscription_expiring_1day: 'Expiring 1 Day',
  subscription_expired: 'Expired',
  subscription_renewed: 'Renewed',
  subscription_activated: 'Activated',
  subscription_paused: 'Paused',
  payment_pending: 'Payment Pending',
  payment_received: 'Payment Received',
  renewal_due: 'Renewal Due',
  order_dispatched: 'Dispatched',
  order_delivered: 'Delivered',
  custom: 'Custom',
};

const PAGE_SIZE = 30;

export default function NotificationLogsScreen() {
  return (
    <ModuleGuard module="notifications">
      <NotificationLogsScreenContent />
    </ModuleGuard>
  );
}

function NotificationLogsScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { canManageNotifications } = useAuthStore();

  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterChannel, setFilterChannel] = useState<NotificationChannel | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAutomated, setFilterAutomated] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [todayStats, setTodayStats] = useState({ sent: 0, failed: 0, skipped: 0, automated: 0 });

  const load = useCallback(async () => {
    let query = supabase
      .from('notification_logs')
      .select(`
        *,
        user:profiles!notification_logs_user_id_fkey(id, full_name, mobile),
        triggered_by_profile:profiles!notification_logs_triggered_by_fkey(id, full_name)
      `)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (filterChannel !== 'all') query = query.eq('channel', filterChannel);
    if (filterStatus !== 'all') query = query.eq('status', filterStatus);
    if (filterAutomated) query = query.is('triggered_by', null);

    const { data } = await query;
    setLogs((data as NotificationLog[]) ?? []);

    // Today stats
    const todayStr = new Date().toISOString().split('T')[0];
    const { data: stats } = await supabase
      .from('notification_logs')
      .select('status, triggered_by')
      .gte('created_at', `${todayStr}T00:00:00`);

    if (stats) {
      setTodayStats({
        sent: stats.filter((s) => s.status === 'sent').length,
        failed: stats.filter((s) => s.status === 'failed').length,
        skipped: stats.filter((s) => s.status === 'skipped').length,
        automated: stats.filter((s) => !s.triggered_by).length,
      });
    }
  }, [filterChannel, filterStatus, filterAutomated]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  usePageVisibility(() => { load(); });

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleRetry = async (log: NotificationLog) => {
    if (!log.user_id) return;
    setRetrying(log.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token ?? anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: log.user_id,
          event_type: log.event_type,
          channel: log.channel,
          template_id: log.template_id,
          subject: log.rendered_subject,
          body: log.rendered_body,
          subscription_id: log.subscription_id,
          order_id: log.order_id,
        }),
      });
      await load();
    } finally {
      setRetrying(null);
    }
  };

  const filtered = logs.filter((l) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (l.user as any)?.full_name?.toLowerCase().includes(q) ||
      l.recipient_mobile?.includes(q) ||
      EVENT_TYPE_LABELS[l.event_type]?.toLowerCase().includes(q)
    );
  });

  if (!canManageNotifications) {
    return (
      <View style={styles.accessDenied}>
        <ShieldCheck size={48} color={Colors.textTertiary} strokeWidth={1.5} />
        <Text style={styles.accessDeniedTitle}>Access Restricted</Text>
        <Text style={styles.accessDeniedSub}>You don't have permission to view notification logs.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, isWeb && styles.containerWeb, { paddingTop: isWeb ? 0 : insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Delivery Logs</Text>
          <Text style={styles.headerSub}>Last {PAGE_SIZE} notifications</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <RefreshCw size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Today stats */}
      <View style={styles.statsRow}>
        <StatCard label="Sent" value={todayStats.sent} color={Colors.success} bg={Colors.successSurface} />
        <StatCard label="Failed" value={todayStats.failed} color={Colors.error} bg={Colors.errorSurface} />
        <StatCard label="Skipped" value={todayStats.skipped} color={Colors.textTertiary} bg={Colors.neutral[100]} />
        <StatCard label="Auto" value={todayStats.automated} color={Colors.success} bg="#F1F8E9" icon={<Zap size={12} color={Colors.success} />} />
      </View>

      {/* Search & filters */}
      <View style={styles.filterBar}>
        <View style={styles.searchBox}>
          <Search size={16} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name, mobile…"
            placeholderTextColor={Colors.textDisabled}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <X size={14} color={Colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillBar} contentContainerStyle={styles.pillContent}>
        {(['all', 'sms', 'whatsapp', 'push', 'in_app'] as const).map((ch) => (
          <TouchableOpacity
            key={ch}
            style={[styles.pill, filterChannel === ch && styles.pillActive]}
            onPress={() => setFilterChannel(ch)}
          >
            <Text style={[styles.pillText, filterChannel === ch && styles.pillTextActive]}>
              {ch === 'all' ? 'All Channels' : CHANNEL_CONFIG[ch as NotificationChannel].label}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={styles.pillSep} />
        {(['all', 'sent', 'failed', 'skipped'] as const).map((st) => (
          <TouchableOpacity
            key={st}
            style={[styles.pill, filterStatus === st && styles.pillActive]}
            onPress={() => setFilterStatus(st)}
          >
            <Text style={[styles.pillText, filterStatus === st && styles.pillTextActive]}>
              {st === 'all' ? 'All Statuses' : STATUS_CONFIG[st as keyof typeof STATUS_CONFIG]?.label ?? st}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={styles.pillSep} />
        <TouchableOpacity
          style={[styles.pill, styles.pillAuto, filterAutomated && styles.pillAutoActive]}
          onPress={() => setFilterAutomated((v) => !v)}
        >
          <Zap size={11} color={filterAutomated ? Colors.success : Colors.textTertiary} />
          <Text style={[styles.pillText, filterAutomated && styles.pillTextAuto]}>Automated</Text>
        </TouchableOpacity>
      </ScrollView>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          {filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Bell size={40} color={Colors.textTertiary} strokeWidth={1.5} />
              <Text style={styles.emptyText}>No notifications found</Text>
            </View>
          ) : (
            filtered.map((log) => (
              <LogRow
                key={log.id}
                log={log}
                expanded={expandedId === log.id}
                onToggle={() => setExpandedId((prev) => (prev === log.id ? null : log.id))}
                onRetry={() => handleRetry(log)}
                retrying={retrying === log.id}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function StatCard({ label, value, color, bg, icon }: { label: string; value: number; color: string; bg: string; icon?: React.ReactNode }) {
  return (
    <View style={[styles.statCard, { backgroundColor: bg }]}>
      {icon && <View style={styles.statIcon}>{icon}</View>}
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color }]}>{label}</Text>
    </View>
  );
}

function LogRow({
  log, expanded, onToggle, onRetry, retrying,
}: {
  log: NotificationLog;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  const ch = CHANNEL_CONFIG[log.channel];
  const st = STATUS_CONFIG[log.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
  const user = log.user as any;

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onToggle} style={styles.logRow}>
      <View style={styles.logRowTop}>
        <View style={styles.logRowLeft}>
          <View style={[styles.channelBadge, { backgroundColor: ch.bg }]}>
            <Text style={[styles.channelBadgeText, { color: ch.color }]}>{ch.label}</Text>
          </View>
          <View style={styles.logInfo}>
            <Text style={styles.logName}>{user?.full_name ?? '—'}</Text>
            <Text style={styles.logMobile}>{log.recipient_mobile ?? user?.mobile ?? '—'}</Text>
          </View>
        </View>
        <View style={styles.logRowRight}>
          <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
            <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
          </View>
          {expanded ? <ChevronUp size={14} color={Colors.textTertiary} /> : <ChevronDown size={14} color={Colors.textTertiary} />}
        </View>
      </View>

      <View style={styles.logMeta}>
        <View style={styles.logMetaLeft}>
          <Text style={styles.logEventType}>{EVENT_TYPE_LABELS[log.event_type] ?? log.event_type}</Text>
          {!log.triggered_by && (
            <View style={styles.autoBadge}>
              <Zap size={9} color={Colors.success} />
              <Text style={styles.autoBadgeText}>Auto</Text>
            </View>
          )}
        </View>
        <Text style={styles.logTime}>
          {log.sent_at
            ? formatDistanceToNow(new Date(log.sent_at), { addSuffix: true })
            : formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
        </Text>
      </View>

      {expanded && (
        <View style={styles.logDetail}>
          {log.rendered_subject && (
            <Text style={styles.detailSubject}>{log.rendered_subject}</Text>
          )}
          <Text style={styles.detailBody}>{log.rendered_body}</Text>
          {log.error_message && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{log.error_message}</Text>
            </View>
          )}
          {log.triggered_by_profile && (
            <Text style={styles.detailMeta}>
              Sent by: {(log.triggered_by_profile as any).full_name}
            </Text>
          )}
          {!log.triggered_by && (
            <Text style={styles.detailMeta}>Triggered by: System (automated)</Text>
          )}
          {log.sent_at && (
            <Text style={styles.detailMeta}>
              Sent: {format(new Date(log.sent_at), 'dd MMM yyyy, h:mm a')}
            </Text>
          )}
          {log.status === 'failed' && (
            <TouchableOpacity style={styles.retryBtn} onPress={onRetry} disabled={retrying}>
              {retrying ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.retryBtnText}>Retry</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  containerWeb: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  accessDenied: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing[6], gap: Spacing[3] },
  accessDeniedTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  accessDeniedSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, textAlign: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[5], paddingVertical: Spacing[4],
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  headerSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  refreshBtn: { padding: Spacing[2] },

  statsRow: { flexDirection: 'row', gap: Spacing[3], paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  statCard: { flex: 1, borderRadius: Radius.md, padding: Spacing[3], alignItems: 'center' },
  statValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'] },
  statLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, marginTop: 2 },

  filterBar: { paddingHorizontal: Spacing[4], paddingBottom: Spacing[2] },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2],
  },
  searchInput: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },

  pillBar: { maxHeight: 44 },
  pillContent: { paddingHorizontal: Spacing[4], gap: Spacing[2], alignItems: 'center' },
  pill: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: Spacing[3], paddingVertical: 6 },
  pillActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  pillText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  pillTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansMedium },
  pillSep: { width: 1, height: 20, backgroundColor: Colors.border, marginHorizontal: 4 },

  list: { padding: Spacing[4], gap: Spacing[3], paddingBottom: 40 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing[3] },
  emptyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },

  logRow: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing[4],
    gap: Spacing[2], ...Shadow.sm,
  },
  logRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logRowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flex: 1 },
  logInfo: { flex: 1 },
  logName: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  logMobile: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  logRowRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },

  channelBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  channelBadgeText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs },

  logMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logEventType: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  logTime: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },

  logDetail: { borderTopWidth: 1, borderTopColor: Colors.divider, marginTop: Spacing[2], paddingTop: Spacing[2], gap: Spacing[2] },
  detailSubject: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  detailBody: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 20 },
  errorBox: { backgroundColor: Colors.errorSurface, borderRadius: Radius.sm, padding: Spacing[3] },
  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.error },
  detailMeta: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  retryBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], alignSelf: 'flex-start' },
  retryBtnText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.white },

  statIcon: { marginBottom: 2 },
  pillAuto: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pillAutoActive: { backgroundColor: '#F1F8E9', borderColor: Colors.success },
  pillTextAuto: { color: Colors.success, fontFamily: Typography.fontFamily.sansMedium },

  logMetaLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  autoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#F1F8E9', borderRadius: Radius.full,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  autoBadgeText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 10, color: Colors.success },
});
