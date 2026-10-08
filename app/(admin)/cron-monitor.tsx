import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, RefreshControl, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Clock, Play, ChevronDown, ChevronRight, CheckCircle2,
  XCircle, AlertCircle, Timer, RotateCw, Zap, RefreshCw,
} from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';

type JobType = 'sql' | 'edge_function';

interface JobDef {
  job_name: string;
  purpose: string;
  schedule: string;
  job_type: JobType;
  automation_name: string | null;
  sort_order: number;
  active: boolean;
  run_count: number;
}

interface JobStatus {
  job_name: string;
  schedule: string;
  active: boolean;
  last_run_start: string | null;
  last_run_end: string | null;
  last_run_status: number | null;
  last_run_duration_ms: number | null;
  last_run_return: string | null;
  last_error: string | null;
  run_count: number;
}

interface RunHistoryEntry {
  runid: string;
  job_name: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  source: 'scheduled' | 'manual';
  duration_ms: number | null;
  return_message: string | null;
}

const STATUS_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'Starting', color: Colors.warning },
  1: { label: 'Failed', color: Colors.error },
  2: { label: 'Succeeded', color: Colors.success },
  3: { label: 'Timeout', color: Colors.warning },
};

const TYPE_LABELS: Record<JobType, string> = {
  sql: 'SQL',
  edge_function: 'Edge Fn',
};

const TYPE_COLORS: Record<JobType, string> = {
  sql: '#1565C0',
  edge_function: '#6A1B9A',
};

export default function CronMonitorScreen() {
  return (
    <View style={s.container}>
      <CronMonitorContent />
    </View>
  );
}

function CronMonitorContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [definitions, setDefinitions] = useState<JobDef[]>([]);
  const [statuses, setStatuses] = useState<Record<string, JobStatus>>({});
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [history, setHistory] = useState<RunHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{ job: string; success: boolean; message: string } | null>(null);
  const [pendingRunJob, setPendingRunJob] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setStatusError(null);

    try {
      const statusRes = await supabase.rpc('get_cron_job_status');
      if (statusRes.error) throw statusRes.error;
      if (!Array.isArray(statusRes.data)) throw new Error('Invalid cron status response');

      const liveJobs = statusRes.data as JobDef[];
      const statusMap: Record<string, JobStatus> = {};
      for (const job of liveJobs) {
        statusMap[job.job_name] = job as unknown as JobStatus;
      }
      setDefinitions(liveJobs);
      setStatuses(statusMap);
    } catch {
      setDefinitions([]);
      setStatuses({});
      setStatusError('Live scheduler data is unavailable. Refresh to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadHistory = async (jobName: string) => {
    setHistoryLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_cron_job_run_history', {
        p_job_name: jobName,
        p_limit: 50,
      });
      if (rpcError) throw rpcError;
      if (!Array.isArray(data)) throw new Error('Invalid execution history response');
      setHistory(data as RunHistoryEntry[]);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleExpand = (jobName: string) => {
    if (expandedJob === jobName) {
      setExpandedJob(null);
      setHistory([]);
    } else {
      setExpandedJob(jobName);
      loadHistory(jobName);
    }
  };

  const requestRun = (jobName: string) => setPendingRunJob(jobName);

  const confirmRun = () => {
    if (!pendingRunJob) return;
    const jobName = pendingRunJob;
    setPendingRunJob(null);
    runJob(jobName);
  };

  const runJob = async (jobName: string) => {
    setRunningJob(jobName);
    setRunResult(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_run_cron_job', { p_job_name: jobName });
      if (rpcError) throw rpcError;
      const result = data as any;
      if (result?.success) {
        setRunResult({ job: jobName, success: true, message: 'Completed successfully and added to execution history.' });
      } else {
        setRunResult({ job: jobName, success: false, message: result?.error || 'Job execution failed. See the new history entry for details.' });
      }
      await load();
      setExpandedJob(jobName);
      await loadHistory(jobName);
    } catch {
      setRunResult({ job: jobName, success: false, message: 'Could not trigger job. Please try again.' });
    } finally {
      setRunningJob(null);
    }
  };

  const formatDuration = (ms: number | null) => {
    if (ms == null) return '—';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  const formatTime = (ts: string | null) => {
    if (!ts) return 'Never';
    try {
      return format(new Date(ts), 'dd MMM yyyy, HH:mm:ss');
    } catch {
      return ts;
    }
  };

  const formatSchedule = (schedule: string) => {
    const parts = schedule.trim().split(/\s+/);
    if (parts.length !== 5) return `Cron: ${schedule}`;
    const [minute, hour, day, month, weekday] = parts;
    if (minute === '*' && hour === '*' && day === '*' && month === '*' && weekday === '*') return 'Every minute';
    if (minute === '0' && hour === '*' && day === '*' && month === '*' && weekday === '*') return 'Every hour';
    if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && day === '*' && month === '*' && weekday === '*') {
      const formattedHour = Number(hour) % 12 || 12;
      const period = Number(hour) >= 12 ? 'PM' : 'AM';
      return `Daily at ${formattedHour}:${minute.padStart(2, '0')} ${period}`;
    }
    return `Cron: ${schedule}`;
  };

  const totalJobs = definitions.length;
  const failedJobs = definitions.filter(d => {
    const st = statuses[d.job_name];
    return st?.last_run_status === 1;
  }).length;
  const succeededJobs = definitions.filter(d => {
    const st = statuses[d.job_name];
    return st?.last_run_status === 2;
  }).length;
  const totalRuns = definitions.reduce((sum, job) => sum + (job.run_count ?? 0), 0);

  if (loading) {
    return (
      <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={s.loadingText}>Loading cron jobs...</Text>
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top }]}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={isWeb ? s.contentWeb : s.contentMobile}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerIconWrap}>
            <Clock size={22} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={s.headerEyebrow}>SYSTEM</Text>
            <Text style={s.headerTitle}>Cron Job Monitor</Text>
            <Text style={s.headerSub}>Live scheduled jobs, execution history, and manual controls</Text>
          </View>
        </View>

        {/* Summary cards */}
        <View style={s.summaryRow}>
          <SummaryCard icon={<Zap size={16} color={Colors.primary} strokeWidth={2} />} label="Total Jobs" value={totalJobs} color={Colors.primary} bg={Colors.primarySurface} />
          <SummaryCard icon={<CheckCircle2 size={16} color={Colors.success} strokeWidth={2} />} label="Succeeded" value={succeededJobs} color={Colors.success} bg="#E8F5E9" />
          <SummaryCard icon={<XCircle size={16} color={Colors.error} strokeWidth={2} />} label="Failed" value={failedJobs} color={Colors.error} bg="#FFEBEE" />
          <SummaryCard icon={<RotateCw size={16} color={Colors.warning} strokeWidth={2} />} label="Total Runs" value={totalRuns} color={Colors.warning} bg="#FFF3E0" />
        </View>

        {statusError && (
          <View style={s.statusErrorBanner}>
            <AlertCircle size={13} color={Colors.warning} strokeWidth={2} />
            <Text style={s.statusErrorText}>{statusError}</Text>
          </View>
        )}

        {error && (
          <View style={s.errorBanner}>
            <AlertCircle size={14} color={Colors.error} strokeWidth={2} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {runResult && (
          <View style={[s.runResultBanner, runResult.success ? s.runResultSuccess : s.runResultError]}>
            {runResult.success ? <CheckCircle2 size={14} color={Colors.success} strokeWidth={2} /> : <XCircle size={14} color={Colors.error} strokeWidth={2} />}
            <Text style={[s.runResultText, { color: runResult.success ? Colors.success : Colors.error }]}>
              {runResult.job}: {runResult.message}
            </Text>
            <TouchableOpacity onPress={() => setRunResult(null)} style={s.dismissBtn}>
              <Text style={s.dismissText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Job table */}
        <View style={s.tableWrap}>
          <View style={s.tableHead}>
            <Text style={[s.th, { flex: 2.5 }]}>Job Name</Text>
            <Text style={[s.th, { flex: 2 }]}>Purpose</Text>
            <Text style={[s.th, { flex: 1.4 }]}>Schedule</Text>
            <Text style={[s.th, { flex: 1 }]}>Type</Text>
            <Text style={[s.th, { flex: 1.3 }]}>Last Run</Text>
            <Text style={[s.th, { flex: 1.1 }]}>Status</Text>
            <Text style={[s.th, { flex: 0.7 }]}>Runs</Text>
            <Text style={[s.th, { flex: 0.8 }]}>Duration</Text>
            <Text style={[s.th, { flex: 1 }]}>Actions</Text>
          </View>

          {definitions.map((def, idx) => {
            const status = statuses[def.job_name];
            const isExpanded = expandedJob === def.job_name;
            const isRunning = runningJob === def.job_name;
            const statusInfo = status?.last_run_status != null
              ? STATUS_LABELS[status.last_run_status] ?? { label: 'Unknown', color: Colors.neutral[400] }
              : { label: 'Never run', color: Colors.neutral[400] };

            return (
              <View key={def.job_name}>
                <TouchableOpacity
                  style={[s.tableRow, idx % 2 === 1 && s.tableRowAlt]}
                  onPress={() => toggleExpand(def.job_name)}
                  activeOpacity={0.7}
                >
                  <View style={[s.td, { flex: 2.5, flexDirection: 'row', alignItems: 'center', gap: Spacing[2] }]}>
                    {isExpanded ? <ChevronDown size={13} color={Colors.textTertiary} strokeWidth={2} /> : <ChevronRight size={13} color={Colors.textTertiary} strokeWidth={2} />}
                    <View style={{ flex: 1 }}>
                      <Text style={s.jobNameText} numberOfLines={1}>{def.job_name}</Text>
                      {status?.last_error && (
                        <Text style={s.errorInline} numberOfLines={1}>{status.last_error}</Text>
                      )}
                    </View>
                  </View>
                  <View style={[s.td, { flex: 2 }]}>
                    <Text style={s.purposeText} numberOfLines={2}>{def.purpose}</Text>
                  </View>
                  <View style={[s.td, { flex: 1.4 }]}> 
                    <Text style={s.scheduleText} numberOfLines={1}>{formatSchedule(def.schedule)}</Text>
                    <Text style={s.scheduleRaw} numberOfLines={1}>{def.schedule}</Text>
                  </View>
                  <View style={[s.td, { flex: 1 }]}>
                    <View style={[s.typeBadge, { backgroundColor: TYPE_COLORS[def.job_type] + '18' }]}>
                      <Text style={[s.typeText, { color: TYPE_COLORS[def.job_type] }]}>{TYPE_LABELS[def.job_type]}</Text>
                    </View>
                  </View>
                  <View style={[s.td, { flex: 1.3 }]}>
                    <Text style={s.timeText}>{formatTime(status?.last_run_start ?? null)}</Text>
                  </View>
                  <View style={[s.td, { flex: 1.1, gap: 3 }]}> 
                    <View style={[s.statusBadge, { backgroundColor: def.active ? Colors.success + '18' : Colors.neutral[200] }]}> 
                      <Text style={[s.statusText, { color: def.active ? Colors.success : Colors.textTertiary }]}>{def.active ? 'Active' : 'Paused'}</Text>
                    </View>
                    <Text style={[s.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
                  </View>
                  <View style={[s.td, { flex: 0.7 }]}> 
                    <Text style={s.durationText}>{status?.run_count ?? def.run_count ?? 0}</Text>
                  </View>
                  <View style={[s.td, { flex: 0.8 }]}> 
                    <Text style={s.durationText}>{formatDuration(status?.last_run_duration_ms ?? null)}</Text>
                  </View>
                  <View style={[s.td, { flex: 1, flexDirection: 'row', gap: Spacing[1] }]}>
                    <TouchableOpacity
                      style={[s.runBtn, isRunning && s.runBtnDisabled]}
                      onPress={(e) => { e.stopPropagation?.(); requestRun(def.job_name); }}
                      disabled={!!isRunning || !def.active}
                      activeOpacity={0.7}
                    >
                      {isRunning ? (
                        <ActivityIndicator size={11} color={Colors.primary} />
                      ) : (
                        <Play size={11} color={Colors.primary} strokeWidth={2.4} fill={Colors.primary} />
                      )}
                      <Text style={s.runBtnText}>{isRunning ? '...' : def.active ? 'Run' : 'Paused'}</Text>
                    </TouchableOpacity>
                    {status?.last_run_status === 1 && (
                      <TouchableOpacity
                        style={[s.retryBtn, isRunning && s.runBtnDisabled]}
                        onPress={(e) => { e.stopPropagation?.(); requestRun(def.job_name); }}
                        disabled={!!isRunning || !def.active}
                        activeOpacity={0.7}
                      >
                        <RefreshCw size={11} color={Colors.error} strokeWidth={2.4} />
                        <Text style={s.retryBtnText}>Retry</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>

                {/* Expanded: run history */}
                {isExpanded && (
                  <View style={s.historyPanel}>
                    <View style={s.historyHeader}>
                      <View style={s.historyTitleWrap}>
                        <RotateCw size={13} color={Colors.textSecondary} strokeWidth={2} />
                        <Text style={s.historyTitle}>Execution History — {def.job_name}</Text>
                      </View>
                      <Text style={s.historyCount}>{status?.run_count ?? def.run_count ?? history.length} total runs</Text>
                    </View>

                    {historyLoading ? (
                      <View style={s.historyLoading}><ActivityIndicator size="small" color={Colors.primary} /></View>
                    ) : history.length === 0 ? (
                      <Text style={s.historyEmpty}>No execution history available.</Text>
                    ) : (
                      <View style={s.historyTable}>
                        <View style={s.historyHead}>
                          <Text style={[s.historyTh, { flex: 1.8 }]}>Date / Time</Text>
                          <Text style={[s.historyTh, { flex: 1 }]}>Result</Text>
                          <Text style={[s.historyTh, { flex: 0.9 }]}>Source</Text>
                          <Text style={[s.historyTh, { flex: 0.8 }]}>Duration</Text>
                          <Text style={[s.historyTh, { flex: 1.6 }]}>Details</Text>
                        </View>
                        {history.map((entry, hIdx) => {
                          const hColor = entry.status === 'succeeded' ? Colors.success : entry.status === 'failed' ? Colors.error : Colors.warning;
                          return (
                            <View key={entry.runid ?? hIdx} style={[s.historyRow, hIdx % 2 === 1 && s.historyRowAlt]}>
                              <Text style={[s.historyTd, { flex: 1.8 }]}>{formatTime(entry.start_time)}</Text>
                              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 2 }}>
                                {entry.status === 'succeeded' ? <CheckCircle2 size={11} color={hColor} strokeWidth={2} /> : entry.status === 'failed' ? <XCircle size={11} color={hColor} strokeWidth={2} /> : <Timer size={11} color={hColor} strokeWidth={2} />}
                                <Text style={[s.historyStatus, { color: hColor }]}>{entry.status}</Text>
                              </View>
                              <Text style={[s.historyTd, { flex: 0.9 }]}>{entry.source === 'manual' ? 'Manual' : 'Scheduled'}</Text>
                              <Text style={[s.historyTd, { flex: 0.8 }]}>{formatDuration(entry.duration_ms)}</Text>
                              <Text style={[s.historyTd, { flex: 1.6 }]} numberOfLines={2}>{entry.return_message || '—'}</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <View style={{ height: Spacing[8] }} />
      </ScrollView>

      <Modal
        visible={!!pendingRunJob}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingRunJob(null)}
      >
        <View style={s.confirmBackdrop}>
          <View style={s.confirmCard}>
            <Text style={s.confirmTitle}>Run this job now?</Text>
            <Text style={s.confirmMessage}>
              This will trigger <Text style={s.confirmJobName}>{pendingRunJob}</Text> immediately, outside its normal schedule.
            </Text>
            <View style={s.confirmActions}>
              <TouchableOpacity style={s.confirmCancelBtn} onPress={() => setPendingRunJob(null)}>
                <Text style={s.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmRunBtn} onPress={confirmRun}>
                <Play size={13} color={Colors.white} strokeWidth={2.4} fill={Colors.white} />
                <Text style={s.confirmRunText}>Run now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SummaryCard({ icon, label, value, color, bg }: { icon: React.ReactNode; label: string; value: number; color: string; bg: string }) {
  return (
    <View style={[s.summaryCard, { backgroundColor: bg }]}>
      {icon}
      <View>
        <Text style={[s.summaryValue, { color }]}>{value}</Text>
        <Text style={s.summaryLabel}>{label}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  contentWeb: { padding: Spacing[8], maxWidth: 1400, width: '100%', alignSelf: 'center' as any },
  contentMobile: { padding: Spacing[4] },
  loadingText: { marginTop: Spacing[3], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    marginBottom: Spacing[5], paddingHorizontal: Spacing[2],
  },
  headerIconWrap: {
    width: 44, height: 44, borderRadius: Radius.md,
    backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center',
  },
  headerEyebrow: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.textTertiary, letterSpacing: 0.8 },
  headerTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.textPrimary },
  headerSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 2 },
  summaryRow: { flexDirection: 'row', gap: Spacing[3], marginBottom: Spacing[5], paddingHorizontal: Spacing[2] },
  summaryCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], borderRadius: Radius.md },
  summaryValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl },
  summaryLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: '#FFEBEE', borderRadius: Radius.md, padding: Spacing[3], marginBottom: Spacing[4] },
  errorText: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error },
  runResultBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], borderRadius: Radius.md, padding: Spacing[3], marginBottom: Spacing[4] },
  runResultSuccess: { backgroundColor: '#E8F5E9' },
  runResultError: { backgroundColor: '#FFEBEE' },
  runResultText: { flex: 1, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm },
  dismissBtn: { padding: Spacing[1] },
  dismissText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textTertiary },
  tableWrap: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  tableHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[3], paddingVertical: Spacing[3], backgroundColor: Colors.neutral[50], borderBottomWidth: 1, borderBottomColor: Colors.border },
  th: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: Spacing[3], paddingVertical: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  td: { paddingHorizontal: 2 },
  jobNameText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  errorInline: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.error, marginTop: 2 },
  purposeText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary, lineHeight: 16 },
  scheduleText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textSecondary },
  scheduleRaw: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 9, color: Colors.textTertiary, marginTop: 2 },
  timeText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  typeBadge: { paddingHorizontal: Spacing[2], paddingVertical: 2, borderRadius: Radius.full },
  typeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10 },
  statusBadge: { paddingHorizontal: Spacing[2], paddingVertical: 2, borderRadius: Radius.full, alignSelf: 'flex-start' as any },
  statusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10 },
  durationText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  runBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: Spacing[1], paddingHorizontal: Spacing[2], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  runBtnDisabled: { opacity: 0.5 },
  runBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.primary },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: Spacing[1], paddingHorizontal: Spacing[2], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.error, backgroundColor: '#FFEBEE' },
  retryBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.error },
  statusErrorBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: '#FFF3E0', borderRadius: Radius.md, padding: Spacing[3], marginBottom: Spacing[4] },
  statusErrorText: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.warning },
  historyPanel: { backgroundColor: Colors.neutral[50], borderBottomWidth: 1, borderBottomColor: Colors.divider, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[2] },
  historyTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  historyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  historyCount: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  historyLoading: { padding: Spacing[4], alignItems: 'center' },
  historyEmpty: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, paddingVertical: Spacing[3] },
  historyTable: { backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  historyHead: { flexDirection: 'row', paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], backgroundColor: Colors.neutral[100], borderBottomWidth: 1, borderBottomColor: Colors.border },
  historyTh: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  historyRow: { flexDirection: 'row', paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  historyRowAlt: { backgroundColor: Colors.neutral[50] },
  historyTd: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  historyStatus: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10 },
  confirmBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', alignItems: 'center', justifyContent: 'center', padding: Spacing[5] },
  confirmCard: { width: '100%', maxWidth: 440, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[5], ...Shadow.lg },
  confirmTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  confirmMessage: { marginTop: Spacing[2], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, lineHeight: 21, color: Colors.textSecondary },
  confirmJobName: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textPrimary },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing[2], marginTop: Spacing[5] },
  confirmCancelBtn: { paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  confirmCancelText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  confirmRunBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1], paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.primary },
  confirmRunText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
});
