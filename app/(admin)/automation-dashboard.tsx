import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Zap,
  TrendingUp,
  Package,
  Truck,
  Users,
  Calendar,
  Play,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  UserCheck,
  PauseCircle,
} from 'lucide-react-native';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { format, subDays, addDays, parseISO } from 'date-fns';
import type { AutomationRunLog, DailyOpsSummary } from '@/types/database';

const GRADIENT_TOP = '#1A2E3A';
const GRADIENT_MID = '#1E3D50';
const GRADIENT_BOT = '#235068';
const ACCENT = '#3AAFE4';

const AUTOMATIONS: { name: string; label: string }[] = [
  { name: 'auto_assign_riders', label: 'Assign Riders' },
  { name: 'retry_unassigned_relaxed', label: 'Relaxed Assignment' },
  { name: 'run_daily_health_check', label: 'Health Check' },
  { name: 'auto_generate_procurement', label: 'Generate Procurement' },
  { name: 'notify_rider_assignments_in_app', label: 'Notify Riders' },
  { name: 'notify_customer_dispatch_in_app', label: 'Notify Customers' },
  { name: 'notify_rider_checkin_reminder', label: 'Check-in Reminder' },
  { name: 'notify_admin_unassigned_alerts', label: 'Admin Alerts' },
  { name: 'send_renewal_payment_reminders', label: 'Renewal Reminders' },
  { name: 'auto_calculate_rider_payouts', label: 'Calculate Payouts' },
  { name: 'auto_expire_subscriptions', label: 'Expire Subs' },
  { name: 'auto_resume_paused_subscriptions', label: 'Resume Paused' },
  { name: 'auto_cancel_pending_subscriptions', label: 'Cancel Pending' },
  { name: 'retry_failed_cron_jobs', label: 'Retry Failed' },
];

export default function AutomationDashboard() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logs, setLogs] = useState<AutomationRunLog[]>([]);
  const [summary, setSummary] = useState<DailyOpsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [runningAutomation, setRunningAutomation] = useState<string | null>(null);
  const [draftPOs, setDraftPOs] = useState<any[]>([]);
  const [approvingPOs, setApprovingPOs] = useState(false);

  const load = useCallback(async () => {
    setError(null);

    const [logsRes, summaryRes, poRes] = await Promise.all([
      supabase
        .from('automation_run_logs')
        .select('*')
        .eq('run_date', selectedDate)
        .order('created_at', { ascending: false }),
      supabase
        .from('daily_ops_summary')
        .select('*')
        .eq('summary_date', selectedDate)
        .maybeSingle(),
      supabase
        .from('procurement_orders')
        .select('id, order_number, vendor_id, total_amount, requirement_date, vendor:vendor_id(business_name)')
        .eq('status', 'draft')
        .like('notes', 'Auto-generated%')
        .order('created_at', { ascending: false }),
    ]);

    if (logsRes.error) setError('Could not load automation logs.');
    if (summaryRes.error) setError('Could not load daily summary.');

    setLogs((logsRes.data ?? []) as AutomationRunLog[]);
    setSummary((summaryRes.data as DailyOpsSummary) ?? null);
    setDraftPOs(poRes.data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [selectedDate]);

  useEffect(() => { load(); }, [load]);

  const runAutomation = async (name: string) => {
    setRunningAutomation(name);
    try {
      const { error: rpcError } = await supabase.rpc('admin_run_automation', { p_name: name });
      if (rpcError) throw rpcError;
      Alert.alert('Success', `${name.replace(/_/g, ' ')} completed successfully.`);
      await load();
    } catch (err: any) {
      Alert.alert('Error', `Failed to run: ${err.message || 'Unknown error'}`);
    } finally {
      setRunningAutomation(null);
    }
  };

  const approvePOs = async () => {
    if (draftPOs.length === 0) return;
    setApprovingPOs(true);
    try {
      const ids = draftPOs.map((po) => po.id);
      const { error: rpcError } = await supabase.rpc('approve_procurement_orders', { p_po_ids: ids });
      if (rpcError) throw rpcError;
      Alert.alert('Success', `${ids.length} procurement order(s) approved and sent to vendors.`);
      await load();
    } catch (err: any) {
      Alert.alert('Error', `Failed to approve: ${err.message || 'Unknown error'}`);
    } finally {
      setApprovingPOs(false);
    }
  };

  const changeDate = (delta: number) => {
    const base = parseISO(selectedDate);
    const next = delta > 0 ? addDays(base, delta) : subDays(base, Math.abs(delta));
    setSelectedDate(format(next, 'yyyy-MM-dd'));
    setLoading(true);
  };

  const statusIcon = (status: string) => {
    if (status === 'success') return <CheckCircle2 size={16} color={Colors.success} strokeWidth={2} />;
    if (status === 'failed') return <XCircle size={16} color={Colors.error} strokeWidth={2} />;
    return <Clock size={16} color={Colors.warning} strokeWidth={2} />;
  };

  const formatAutomationName = (name: string) => name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const successCount = logs.filter((l) => l.status === 'success').length;
  const failedCount = logs.filter((l) => l.status === 'failed').length;

  const StatCard = ({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) => (
    <View style={[s.statCard, { borderLeftColor: color }]}>
      <View style={s.statIconWrap}>{icon}</View>
      <View style={s.statContent}>
        <Text style={s.statValue}>{value}</Text>
        <Text style={s.statLabel}>{label}</Text>
      </View>
    </View>
  );

  const AlertItem = ({ alert }: { alert: { severity: string; message: string } }) => (
    <View style={[s.alertItem, alert.severity === 'critical' ? s.alertCritical : s.alertWarning]}>
      <AlertTriangle size={14} color={alert.severity === 'critical' ? Colors.error : Colors.warning} strokeWidth={2} />
      <Text style={[s.alertText, { color: alert.severity === 'critical' ? Colors.error : Colors.warning }]}>{alert.message}</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={[s.container, { paddingTop: insets.top + 20 }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, isWeb && s.contentWeb]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <LinearGradient
          colors={[GRADIENT_TOP, GRADIENT_MID, GRADIENT_BOT]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.header}
        >
          <View style={s.headerIconWrap}>
            <Zap size={24} color={ACCENT} strokeWidth={1.8} />
          </View>
          <View style={s.headerText}>
            <Text style={s.headerEyebrow}>System</Text>
            <Text style={s.headerTitle}>Automation Dashboard</Text>
            <Text style={s.headerDate}>{format(parseISO(selectedDate), 'EEEE, dd MMMM yyyy')}</Text>
          </View>
        </LinearGradient>

        <View style={s.dateNav}>
          <TouchableOpacity onPress={() => changeDate(-1)} style={s.dateBtn}>
            <ChevronLeft size={18} color={Colors.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.dateText}>{format(parseISO(selectedDate), 'dd MMM yyyy')}</Text>
          <TouchableOpacity onPress={() => changeDate(1)} style={s.dateBtn} disabled={selectedDate >= format(new Date(), 'yyyy-MM-dd')}>
            <ChevronRight size={18} color={selectedDate >= format(new Date(), 'yyyy-MM-dd') ? Colors.textTertiary : Colors.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {error && (
          <View style={s.errorBanner}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {summary && (
          <>
            <Text style={s.sectionTitle}>Operations Summary</Text>
            <View style={s.statsGrid}>
              <StatCard icon={<Package size={20} color={Colors.primary} strokeWidth={1.8} />} label="Total Orders" value={summary.total_orders} color={Colors.primary} />
              <StatCard icon={<Truck size={20} color={Colors.success} strokeWidth={1.8} />} label="Assigned" value={summary.assigned_orders} color={Colors.success} />
              <StatCard icon={<AlertTriangle size={20} color={Colors.warning} strokeWidth={1.8} />} label="Unassigned" value={summary.unassigned_orders} color={Colors.warning} />
              <StatCard icon={<CheckCircle2 size={20} color={Colors.success} strokeWidth={1.8} />} label="Delivered" value={summary.delivered_orders} color={Colors.success} />
              <StatCard icon={<XCircle size={20} color={Colors.error} strokeWidth={1.8} />} label="Failed" value={summary.failed_orders} color={Colors.error} />
              <StatCard icon={<Users size={20} color={Colors.accent} strokeWidth={1.8} />} label="Active Riders" value={summary.active_riders} color={Colors.accent} />
              <StatCard icon={<UserCheck size={20} color={Colors.warning} strokeWidth={1.8} />} label="No-Show" value={summary.no_show_riders} color={Colors.warning} />
              <StatCard icon={<ShoppingCart size={20} color={Colors.primary} strokeWidth={1.8} />} label="Pending POs" value={summary.pending_procurement_orders} color={Colors.primary} />
              <StatCard icon={<Calendar size={20} color={Colors.success} strokeWidth={1.8} />} label="Active Subs" value={summary.active_subscriptions} color={Colors.success} />
              <StatCard icon={<PauseCircle size={20} color={Colors.error} strokeWidth={1.8} />} label="Auto-Paused" value={summary.auto_paused_subscriptions} color={Colors.error} />
            </View>

            {summary.alerts && summary.alerts.length > 0 && (
              <>
                <Text style={s.sectionTitle}>Active Alerts</Text>
                <View style={s.alertsContainer}>
                  {summary.alerts.map((alert: any, i: number) => <AlertItem key={i} alert={alert} />)}
                </View>
              </>
            )}
          </>
        )}

        {draftPOs.length > 0 && (
          <>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Procurement Approval Required</Text>
              <TouchableOpacity style={[s.approveBtn, approvingPOs && s.approveBtnDisabled]} onPress={approvePOs} disabled={approvingPOs}>
                {approvingPOs ? <ActivityIndicator size="small" color="#fff" /> : <CheckCircle2 size={14} color="#fff" strokeWidth={2} />}
                <Text style={s.approveBtnText}>{approvingPOs ? 'Approving...' : 'Approve All'}</Text>
              </TouchableOpacity>
            </View>
            <View style={s.poList}>
              {draftPOs.map((po) => (
                <View key={po.id} style={s.poCard}>
                  <View style={s.poInfo}>
                    <Text style={s.poNumber}>{po.order_number}</Text>
                    <Text style={s.poVendor}>{po.vendor?.business_name ?? 'Unknown vendor'}</Text>
                    <Text style={s.poDate}>Required: {po.requirement_date ? format(parseISO(po.requirement_date), 'dd MMM') : 'N/A'}</Text>
                  </View>
                  <Text style={s.poAmount}>₹{Number(po.total_amount || 0).toFixed(0)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Quick Actions</Text>
        </View>
        <View style={s.actionsGrid}>
          {AUTOMATIONS.map((auto) => (
            <TouchableOpacity
              key={auto.name}
              style={[s.actionBtn, runningAutomation === auto.name && s.actionBtnRunning]}
              onPress={() => runAutomation(auto.name)}
              disabled={!!runningAutomation}
            >
              {runningAutomation === auto.name ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Play size={14} color={Colors.primary} strokeWidth={2} fill={Colors.primary} />
              )}
              <Text style={s.actionBtnText} numberOfLines={1}>{auto.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Automation Run Log</Text>
          <View style={s.logCounts}>
            <View style={s.countBadge}>
              <CheckCircle2 size={12} color={Colors.success} strokeWidth={2} />
              <Text style={[s.countText, { color: Colors.success }]}>{successCount}</Text>
            </View>
            {failedCount > 0 && (
              <View style={s.countBadge}>
                <XCircle size={12} color={Colors.error} strokeWidth={2} />
                <Text style={[s.countText, { color: Colors.error }]}>{failedCount}</Text>
              </View>
            )}
          </View>
        </View>

        {logs.length === 0 ? (
          <View style={s.emptyState}>
            <Activity size={32} color={Colors.textTertiary} strokeWidth={1.2} />
            <Text style={s.emptyText}>No automations have run on this date.</Text>
          </View>
        ) : (
          <View style={s.logsList}>
            {logs.map((log) => (
              <View key={log.id} style={s.logCard}>
                <View style={s.logHeader}>
                  <View style={s.logNameRow}>
                    {statusIcon(log.status)}
                    <Text style={s.logName}>{formatAutomationName(log.automation_name)}</Text>
                  </View>
                  <Text style={s.logTime}>{format(new Date(log.created_at), 'HH:mm')}</Text>
                </View>
                {log.summary && Object.keys(log.summary).length > 0 && (
                  <View style={s.logSummary}>
                    {Object.entries(log.summary).slice(0, 6).map(([key, value]) => (
                      <View key={key} style={s.summaryRow}>
                        <Text style={s.summaryKey}>{key.replace(/_/g, ' ')}</Text>
                        <Text style={s.summaryValue}>{String(value)}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {log.error_message && (
                  <View style={s.logError}>
                    <Text style={s.logErrorText}>{log.error_message}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {!summary && (
          <View style={s.emptyState}>
            <TrendingUp size={32} color={Colors.textTertiary} strokeWidth={1.2} />
            <Text style={s.emptyText}>Daily health check has not run on this date.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EEF2F5' },
  content: { padding: 16, paddingBottom: 40 },
  contentWeb: { maxWidth: 900, alignSelf: 'center', width: '100%' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: Radius.lg,
    gap: 14,
    marginBottom: 16,
  },
  headerIconWrap: {
    width: 48, height: 48, borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerText: { flex: 1 },
  headerEyebrow: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' as const },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', marginTop: 2 },
  headerDate: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  dateNav: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, marginBottom: 16 },
  dateBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', ...Shadow.sm },
  dateText: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, minWidth: 100, textAlign: 'center' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: Radius.md, padding: 14, width: '47%', flexGrow: 1,
    borderLeftWidth: 3, ...Shadow.sm,
  },
  statIconWrap: { marginRight: 10 },
  statContent: { flex: 1 },
  statValue: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textTertiary, marginTop: 2 },
  alertsContainer: { gap: 8, marginBottom: 20 },
  alertItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: Radius.md, gap: 10 },
  alertCritical: { backgroundColor: '#FFEBEE' },
  alertWarning: { backgroundColor: '#FFF8E1' },
  alertText: { fontSize: 13, fontWeight: '500', flex: 1 },
  errorBanner: { backgroundColor: '#FFEBEE', padding: 12, borderRadius: Radius.md, marginBottom: 16 },
  errorText: { color: Colors.error, fontSize: 13, fontWeight: '500' },
  poList: { gap: 8, marginBottom: 20 },
  poCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: Radius.md, padding: 14, ...Shadow.sm,
  },
  poInfo: { flex: 1 },
  poNumber: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  poVendor: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  poDate: { fontSize: 11, color: Colors.textTertiary, marginTop: 2 },
  poAmount: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  approveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.success, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radius.md, ...Shadow.sm,
  },
  approveBtnDisabled: { opacity: 0.6 },
  approveBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: Radius.md, ...Shadow.sm, width: '48%', flexGrow: 1,
  },
  actionBtnRunning: { opacity: 0.6 },
  actionBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  logCounts: { flexDirection: 'row', gap: 8 },
  countBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm },
  countText: { fontSize: 12, fontWeight: '700' },
  logsList: { gap: 10 },
  logCard: { backgroundColor: '#FFFFFF', borderRadius: Radius.md, padding: 14, ...Shadow.sm },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  logNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  logName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, flexShrink: 1 },
  logTime: { fontSize: 12, color: Colors.textTertiary },
  logSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryRow: {
    flexDirection: 'row', backgroundColor: Colors.neutral[100],
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm, gap: 4,
  },
  summaryKey: { fontSize: 11, color: Colors.textTertiary, textTransform: 'capitalize' as const },
  summaryValue: { fontSize: 11, fontWeight: '600', color: Colors.textPrimary },
  logError: { backgroundColor: '#FFEBEE', padding: 8, borderRadius: Radius.sm, marginTop: 8 },
  logErrorText: { fontSize: 12, color: Colors.error },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textTertiary, textAlign: 'center' },
});
