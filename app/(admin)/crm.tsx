import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Users, UserCheck, UserX, TrendingUp, TrendingDown, CircleAlert as AlertCircle, CircleCheck as CheckCircle, Clock, ChevronRight, Tag, ClipboardList, Star, ChartBar as BarChart3, Bell, Plus } from 'lucide-react-native';
import { router } from 'expo-router';
import { format, isToday, isTomorrow, isPast } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

interface CrmMetrics {
  totalCustomers: number;
  activeSubscribers: number;
  pausedSubscribers: number;
  churned: number;
  newThisMonth: number;
  openTasks: number;
  overdueTasks: number;
  dueTodayTasks: number;
}

const PRIORITY_CONFIG = {
  urgent: { label: 'Urgent', color: Colors.error,   bg: '#FFEBEE' },
  high:   { label: 'High',   color: Colors.warning, bg: '#FFF3E0' },
  medium: { label: 'Medium', color: Colors.accent,  bg: Colors.accentSurface },
  low:    { label: 'Low',    color: Colors.textTertiary, bg: Colors.neutral[100] },
};

const TASK_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  follow_up:      { label: 'Follow Up',      color: Colors.primary },
  renewal:        { label: 'Renewal',        color: Colors.success },
  complaint:      { label: 'Complaint',      color: Colors.error },
  onboarding:     { label: 'Onboarding',     color: Colors.secondary },
  delivery_issue: { label: 'Delivery Issue', color: Colors.warning },
  general:        { label: 'General',        color: Colors.textSecondary },
};

export default function CrmScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<CrmMetrics | null>(null);
  const [segments, setSegments] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<any[]>([]);
  const [tagStats, setTagStats] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');

      const [
        customersRes, subscriptionsRes, tasksRes, segmentsRes, activityRes, tagsRes,
      ] = await Promise.all([
        supabase.from('profiles').select('id, created_at').eq('role', 'customer'),
        supabase.from('subscriptions').select('user_id, status'),
        supabase.from('crm_tasks').select('*, customer:profiles(full_name, mobile)').in('status', ['open', 'in_progress']).order('due_date', { ascending: true }).limit(8),
        supabase.from('customer_segments').select('*').order('customer_count', { ascending: false }),
        supabase.from('customer_activity_log').select('*, customer:profiles(full_name, mobile)').order('created_at', { ascending: false }).limit(10),
        supabase.from('customer_tags').select('*, customer_tag_assignments(count)').order('created_at', { ascending: true }),
      ]);

      const customers = customersRes.data ?? [];
      const subs = subscriptionsRes.data ?? [];
      const tasks = tasksRes.data ?? [];

      const activeSubs = subs.filter(s => s.status === 'active');
      const pausedSubs = subs.filter(s => s.status === 'paused');
      const activeUserIds = new Set(activeSubs.map(s => s.user_id));
      const pausedUserIds = new Set(pausedSubs.map(s => s.user_id));
      const churnedCount = customers.filter(c => !activeUserIds.has(c.id) && !pausedUserIds.has(c.id)).length;
      const newThisMonth = customers.filter(c => c.created_at >= monthStart).length;

      const todayStr = format(now, 'yyyy-MM-dd');
      const overdueTasks = tasks.filter(t => t.due_date && t.due_date < todayStr);
      const dueTodayTasks = tasks.filter(t => t.due_date === todayStr);

      setMetrics({
        totalCustomers: customers.length,
        activeSubscribers: activeUserIds.size,
        pausedSubscribers: pausedUserIds.size,
        churned: churnedCount,
        newThisMonth,
        openTasks: tasks.length,
        overdueTasks: overdueTasks.length,
        dueTodayTasks: dueTodayTasks.length,
      });

      setSegments(segmentsRes.data ?? []);
      setRecentActivity(activityRes.data ?? []);
      setUpcomingTasks(tasks);
      setTagStats((tagsRes.data ?? []).map(t => ({ ...t, count: t.customer_tag_assignments?.[0]?.count ?? 0 })));
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const formatDueDate = (d: string | null) => {
    if (!d) return null;
    const date = new Date(d + 'T00:00:00');
    if (isToday(date)) return { label: 'Today', color: Colors.warning };
    if (isTomorrow(date)) return { label: 'Tomorrow', color: Colors.accent };
    if (isPast(date)) return { label: `Overdue · ${format(date, 'dd MMM')}`, color: Colors.error };
    return { label: format(date, 'dd MMM'), color: Colors.textTertiary };
  };

  if (loading) {
    return (
      <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top }]}>
      <View style={[s.header, isWeb && s.headerWeb]}>
        <View style={s.headerLeft}>
          <View style={s.headerIcon}>
            <Users size={isWeb ? 22 : 18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>CRM</Text>
            <Text style={s.subtitle}>Customer relationship management</Text>
          </View>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => router.push('/(admin)/crm-tasks' as any)} activeOpacity={0.8}>
          <Plus size={15} color={Colors.white} strokeWidth={2} />
          <Text style={s.addBtnText}>New Task</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, isWeb && s.contentWeb]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {metrics && (
          <>
            {/* Key Metrics */}
            <View>
              <Text style={s.sectionTitle}>Overview</Text>
              <View style={[s.metricsGrid, isWeb && s.metricsGridWeb]}>
                <MetricCard icon={<Users size={18} color={Colors.primary} strokeWidth={1.8} />} bg={Colors.primarySurface} label="Total Customers" value={String(metrics.totalCustomers)} sub={`+${metrics.newThisMonth} this month`} isWeb={isWeb} />
                <MetricCard icon={<UserCheck size={18} color={Colors.success} strokeWidth={1.8} />} bg="#E8F5E9" label="Active Subscribers" value={String(metrics.activeSubscribers)} sub={`${metrics.totalCustomers > 0 ? Math.round(metrics.activeSubscribers / metrics.totalCustomers * 100) : 0}% of customers`} isWeb={isWeb} />
                <MetricCard icon={<UserX size={18} color={Colors.error} strokeWidth={1.8} />} bg="#FFEBEE" label="Churned" value={String(metrics.churned)} sub="No active subscription" isWeb={isWeb} />
                <MetricCard icon={<Clock size={18} color={Colors.accentDark} strokeWidth={1.8} />} bg={Colors.accentSurface} label="Paused" value={String(metrics.pausedSubscribers)} sub="Temporarily paused" isWeb={isWeb} />
                <MetricCard icon={<ClipboardList size={18} color={metrics.overdueTasks > 0 ? Colors.error : Colors.textSecondary} strokeWidth={1.8} />} bg={metrics.overdueTasks > 0 ? '#FFEBEE' : Colors.neutral[100]} label="Open Tasks" value={String(metrics.openTasks)} sub={`${metrics.overdueTasks} overdue · ${metrics.dueTodayTasks} due today`} valueColor={metrics.overdueTasks > 0 ? Colors.error : undefined} isWeb={isWeb} />
                <MetricCard icon={<TrendingUp size={18} color={Colors.secondary} strokeWidth={1.8} />} bg={Colors.secondarySurface} label="New This Month" value={String(metrics.newThisMonth)} sub="New registrations" isWeb={isWeb} />
              </View>
            </View>

            {/* Quick Nav */}
            <View>
              <Text style={s.sectionTitle}>Modules</Text>
              <View style={[s.quickNav, isWeb && s.quickNavWeb]}>
                <QuickNavCard icon={<Users size={20} color={Colors.primary} strokeWidth={1.8} />} label="Customers" sub={`${metrics.totalCustomers} total`} onPress={() => router.push('/(admin)/customers' as any)} isWeb={isWeb} />
                <QuickNavCard icon={<Tag size={20} color={Colors.secondary} strokeWidth={1.8} />} label="Segments" sub={`${segments.length} groups`} onPress={() => router.push('/(admin)/crm-segments' as any)} isWeb={isWeb} />
                <QuickNavCard icon={<ClipboardList size={20} color={Colors.accent} strokeWidth={1.8} />} label="Tasks" sub={`${metrics.openTasks} open`} onPress={() => router.push('/(admin)/crm-tasks' as any)} isWeb={isWeb} badge={metrics.overdueTasks > 0 ? String(metrics.overdueTasks) : undefined} />
              </View>
            </View>

            {/* Upcoming Tasks */}
            {upcomingTasks.length > 0 && (
              <View>
                <View style={s.rowHeader}>
                  <Text style={s.sectionTitle}>Open Tasks</Text>
                  <TouchableOpacity onPress={() => router.push('/(admin)/crm-tasks' as any)} style={s.seeAll}>
                    <Text style={s.seeAllText}>View all</Text>
                    <ChevronRight size={14} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={s.card}>
                  {upcomingTasks.map((task, idx) => {
                    const due = formatDueDate(task.due_date);
                    const pCfg = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG];
                    const tCfg = TASK_TYPE_CONFIG[task.task_type] ?? TASK_TYPE_CONFIG.general;
                    return (
                      <TouchableOpacity key={task.id} style={[s.taskRow, idx < upcomingTasks.length - 1 && s.taskDivider]} onPress={() => router.push('/(admin)/crm-tasks' as any)} activeOpacity={0.8}>
                        <View style={[s.taskPriorityDot, { backgroundColor: pCfg.color }]} />
                        <View style={s.taskContent}>
                          <Text style={s.taskTitle} numberOfLines={1}>{task.title}</Text>
                          <View style={s.taskMeta}>
                            <View style={[s.taskTypePill, { backgroundColor: tCfg.color + '18' }]}>
                              <Text style={[s.taskTypePillText, { color: tCfg.color }]}>{tCfg.label}</Text>
                            </View>
                            {task.customer && <Text style={s.taskCustomer}>{task.customer.full_name ?? task.customer.mobile}</Text>}
                          </View>
                        </View>
                        <View style={s.taskRight}>
                          {due && <Text style={[s.taskDue, { color: due.color }]}>{due.label}</Text>}
                          <View style={[s.priorityBadge, { backgroundColor: pCfg.bg }]}>
                            <Text style={[s.priorityText, { color: pCfg.color }]}>{pCfg.label}</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Segments */}
            {segments.length > 0 && (
              <View>
                <View style={s.rowHeader}>
                  <Text style={s.sectionTitle}>Segments</Text>
                  <TouchableOpacity onPress={() => router.push('/(admin)/crm-segments' as any)} style={s.seeAll}>
                    <Text style={s.seeAllText}>Manage</Text>
                    <ChevronRight size={14} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={[s.segmentsGrid, isWeb && s.segmentsGridWeb]}>
                  {segments.slice(0, 6).map(seg => (
                    <TouchableOpacity key={seg.id} style={s.segmentCard} onPress={() => router.push({ pathname: '/(admin)/crm-segments' as any, params: { highlight: seg.id } })} activeOpacity={0.8}>
                      <View style={[s.segmentDot, { backgroundColor: seg.color }]} />
                      <Text style={s.segmentName} numberOfLines={1}>{seg.name}</Text>
                      <Text style={s.segmentCount}>{seg.customer_count}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Tags */}
            {tagStats.length > 0 && (
              <View>
                <Text style={s.sectionTitle}>Tags</Text>
                <View style={s.tagsCloud}>
                  {tagStats.filter(t => Number(t.count) > 0).map(tag => (
                    <View key={tag.id} style={[s.tagChip, { borderColor: tag.color, backgroundColor: tag.color + '14' }]}>
                      <View style={[s.tagDot, { backgroundColor: tag.color }]} />
                      <Text style={[s.tagName, { color: tag.color }]}>{tag.name}</Text>
                      <Text style={[s.tagCount, { color: tag.color }]}>{tag.count}</Text>
                    </View>
                  ))}
                  {tagStats.filter(t => Number(t.count) === 0).map(tag => (
                    <View key={tag.id} style={[s.tagChip, { borderColor: Colors.border, backgroundColor: Colors.neutral[50] }]}>
                      <Text style={[s.tagName, { color: Colors.textTertiary }]}>{tag.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Recent Activity */}
            {recentActivity.length > 0 && (
              <View>
                <Text style={s.sectionTitle}>Recent Activity</Text>
                <View style={s.card}>
                  {recentActivity.map((event, idx) => (
                    <View key={event.id} style={[s.activityRow, idx < recentActivity.length - 1 && s.activityDivider]}>
                      <View style={[s.activityDot, { backgroundColor: getActivityColor(event.activity_type) }]} />
                      <View style={s.activityContent}>
                        <Text style={s.activityDesc} numberOfLines={2}>{event.description}</Text>
                        <View style={s.activityMeta}>
                          {event.customer && <Text style={s.activityCustomer}>{event.customer.full_name ?? event.customer.mobile}</Text>}
                          <Text style={s.activityDate}>{format(new Date(event.created_at), 'dd MMM · HH:mm')}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function getActivityColor(type: string) {
  if (type.includes('payment')) return Colors.success;
  if (type.includes('cancelled') || type.includes('failed')) return Colors.error;
  if (type.includes('paused')) return Colors.accentDark;
  if (type.includes('note') || type.includes('tag')) return Colors.secondary;
  if (type.includes('task')) return Colors.primary;
  return Colors.neutral[400];
}

function MetricCard({ icon, bg, label, value, sub, valueColor, isWeb }: { icon: React.ReactNode; bg: string; label: string; value: string; sub?: string; valueColor?: string; isWeb: boolean }) {
  return (
    <View style={[s.metricCard, isWeb && s.metricCardWeb]}>
      <View style={[s.metricIcon, { backgroundColor: bg }]}>{icon}</View>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={[s.metricValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
      {sub ? <Text style={s.metricSub}>{sub}</Text> : null}
    </View>
  );
}

function QuickNavCard({ icon, label, sub, onPress, isWeb, badge }: { icon: React.ReactNode; label: string; sub: string; onPress: () => void; isWeb: boolean; badge?: string }) {
  return (
    <TouchableOpacity style={[s.qCard, isWeb && s.qCardWeb]} onPress={onPress} activeOpacity={0.8}>
      <View style={s.qIconWrap}>{icon}</View>
      <View style={s.qText}>
        <Text style={s.qLabel}>{label}</Text>
        <Text style={s.qSub}>{sub}</Text>
      </View>
      {badge ? (
        <View style={s.badge}><Text style={s.badgeText}>{badge}</Text></View>
      ) : (
        <ChevronRight size={14} color={Colors.textTertiary} />
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerWeb: { paddingHorizontal: Spacing[8], paddingVertical: Spacing[5] },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  headerIcon: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  titleWeb: { fontSize: Typography.size['2xl'] },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.primary, paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], borderRadius: Radius.full },
  addBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  scroll: { flex: 1 },
  content: { padding: Spacing[5], gap: Spacing[5] },
  contentWeb: { padding: Spacing[8], maxWidth: 1100, alignSelf: 'center', width: '100%', gap: Spacing[6] },
  sectionTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary, marginBottom: Spacing[3] },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[3] },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.primary },
  metricsGrid: { gap: Spacing[3] },
  metricsGridWeb: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[4] },
  metricCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, gap: Spacing[1], ...Shadow.sm },
  metricCardWeb: { flex: 1, minWidth: 160 },
  metricIcon: { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing[1] },
  metricLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  metricValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.textPrimary, letterSpacing: -0.5 },
  metricSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  quickNav: { gap: Spacing[3] },
  quickNavWeb: { flexDirection: 'row', gap: Spacing[4] },
  qCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', alignItems: 'center', gap: Spacing[3], ...Shadow.sm },
  qCardWeb: { flex: 1 },
  qIconWrap: { width: 42, height: 42, borderRadius: Radius.md, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  qText: { flex: 1 },
  qLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  qSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  badge: { backgroundColor: Colors.error, paddingHorizontal: Spacing[2], paddingVertical: 2, borderRadius: Radius.full, minWidth: 20, alignItems: 'center' },
  badgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.white },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  taskDivider: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  taskPriorityDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  taskContent: { flex: 1 },
  taskTitle: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], marginTop: 3 },
  taskTypePill: { paddingHorizontal: Spacing[2], paddingVertical: 2, borderRadius: Radius.full },
  taskTypePillText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  taskCustomer: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  taskRight: { alignItems: 'flex-end', gap: 4 },
  taskDue: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  priorityBadge: { paddingHorizontal: Spacing[2], paddingVertical: 2, borderRadius: Radius.full },
  priorityText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10 },
  segmentsGrid: { gap: Spacing[3] },
  segmentsGridWeb: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[3] },
  segmentCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  segmentDot: { width: 10, height: 10, borderRadius: 5 },
  segmentName: { flex: 1, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  segmentCount: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary },
  tagsCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  tagChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], borderRadius: Radius.full, borderWidth: 1 },
  tagDot: { width: 6, height: 6, borderRadius: 3 },
  tagName: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm },
  tagCount: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm },
  activityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3], paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  activityDivider: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  activityDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  activityContent: { flex: 1 },
  activityDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  activityMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], marginTop: 3 },
  activityCustomer: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.primary },
  activityDate: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
});
