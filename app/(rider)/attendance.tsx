import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, CircleCheck as CheckCircle2, Circle as XCircle, Clock, Umbrella, TrendingUp } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';

const GRADIENT_TOP = '#1A2E3A';
const GRADIENT_MID = '#1E3D50';
const GRADIENT_BOT = '#235068';
const ACCENT = '#3AAFE4';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';

interface AttendanceRecord {
  id: string;
  date: string;
  status: 'present' | 'absent' | 'half_day' | 'leave';
  check_in_time: string | null;
  check_out_time: string | null;
  notes: string | null;
}

const STATUS_CONFIG = {
  present: { label: 'Present', color: Colors.success, bg: Colors.successSurface, Icon: CheckCircle2 },
  absent: { label: 'Absent', color: Colors.error, bg: Colors.errorSurface, Icon: XCircle },
  half_day: { label: 'Half Day', color: Colors.warning, bg: Colors.warningSurface, Icon: Clock },
  leave: { label: 'On Leave', color: Colors.textTertiary, bg: Colors.neutral[100], Icon: Umbrella },
};

export default function RiderAttendance() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const isWeb = Platform.OS === 'web';

  const [riderId, setRiderId] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const currentMonth = new Date();
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const load = useCallback(async () => {
    if (!profile?.id) return;

    let rId = riderId;
    if (!rId) {
      const { data: riderData } = await supabase
        .from('riders')
        .select('id')
        .eq('profile_id', profile.id)
        .maybeSingle();

      if (!riderData) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      rId = riderData.id;
      setRiderId(rId);
    }

    const startStr = format(monthStart, 'yyyy-MM-dd');
    const endStr = format(monthEnd, 'yyyy-MM-dd');

    const { data } = await supabase
      .from('rider_attendance')
      .select('id, date, status, check_in_time, check_out_time, notes')
      .eq('rider_id', rId)
      .gte('date', startStr)
      .lte('date', endStr)
      .order('date', { ascending: false });

    if (data) setAttendance(data as AttendanceRecord[]);
    setLoading(false);
    setRefreshing(false);
  }, [profile?.id, riderId]);

  useEffect(() => { load(); }, [load]);

  const getStatusForDay = (day: Date): AttendanceRecord | null => {
    return attendance.find((a) => isSameDay(new Date(a.date), day)) ?? null;
  };

  const presentCount = attendance.filter((a) => a.status === 'present').length;
  const halfDayCount = attendance.filter((a) => a.status === 'half_day').length;
  const absentCount = attendance.filter((a) => a.status === 'absent').length;
  const leaveCount = attendance.filter((a) => a.status === 'leave').length;
  const totalMarked = attendance.length;
  const daysElapsed = Math.min(new Date().getDate(), daysInMonth.length);

  const summaryCards = [
    { label: 'Present', value: presentCount, color: Colors.success, bg: Colors.successSurface, Icon: CheckCircle2 },
    { label: 'Half Day', value: halfDayCount, color: Colors.warning, bg: Colors.warningSurface, Icon: Clock },
    { label: 'On Leave', value: leaveCount, color: Colors.textTertiary, bg: Colors.neutral[100], Icon: Umbrella },
    { label: 'Absent', value: absentCount, color: Colors.error, bg: Colors.errorSurface, Icon: XCircle },
  ];

  const renderCalendarGrid = () => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const firstDayOfWeek = monthStart.getDay();
    const cells: (Date | null)[] = [...Array(firstDayOfWeek).fill(null), ...daysInMonth];
    const today = new Date();

    return (
      <View style={calStyles.calendarWrap}>
        <View style={calStyles.dayNamesRow}>
          {dayNames.map((d) => (
            <View key={d} style={calStyles.dayNameCell}>
              <Text style={calStyles.dayNameText}>{d}</Text>
            </View>
          ))}
        </View>
        <View style={calStyles.daysGrid}>
          {cells.map((day, idx) => {
            if (!day) return <View key={`empty-${idx}`} style={calStyles.dayCell} />;
            const record = getStatusForDay(day);
            const isToday = isSameDay(day, today);
            const statusConf = record ? STATUS_CONFIG[record.status] : null;
            return (
              <View
                key={day.toISOString()}
                style={[
                  calStyles.dayCell,
                  statusConf && { backgroundColor: statusConf.bg },
                  isToday && calStyles.todayCell,
                ]}
              >
                <Text style={[
                  calStyles.dayNumber,
                  statusConf && { color: statusConf.color },
                  isToday && calStyles.todayNumber,
                ]}>
                  {format(day, 'd')}
                </Text>
                {statusConf && (
                  <statusConf.Icon size={10} color={statusConf.color} strokeWidth={2} />
                )}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderList = () => (
    attendance.length === 0 ? (
      <View style={mStyles.emptyState}>
        <CalendarDays size={32} color={Colors.textTertiary} strokeWidth={1.5} />
        <Text style={mStyles.emptyTitle}>No records this month</Text>
        <Text style={mStyles.emptyText}>Attendance is marked by your admin.</Text>
      </View>
    ) : (
      <View style={mStyles.listCard}>
        {attendance.map((record, i) => {
          const conf = STATUS_CONFIG[record.status];
          const Icon = conf.Icon;
          return (
            <View
              key={record.id}
              style={[mStyles.listRow, i === attendance.length - 1 && mStyles.listRowLast]}
            >
              <View style={[mStyles.listIconWrap, { backgroundColor: conf.bg }]}>
                <Icon size={16} color={conf.color} strokeWidth={1.8} />
              </View>
              <View style={mStyles.listInfo}>
                <Text style={mStyles.listDate}>
                  {format(new Date(record.date), 'EEEE, dd MMMM')}
                </Text>
                {record.check_in_time && (
                  <Text style={mStyles.listMeta}>
                    In: {format(new Date(record.check_in_time), 'hh:mm a')}
                    {record.check_out_time
                      ? `  ·  Out: ${format(new Date(record.check_out_time), 'hh:mm a')}`
                      : ''}
                  </Text>
                )}
                {record.notes && (
                  <Text style={mStyles.listNotes} numberOfLines={1}>{record.notes}</Text>
                )}
              </View>
              <View style={[mStyles.statusBadge, { backgroundColor: conf.bg }]}>
                <Text style={[mStyles.statusBadgeText, { color: conf.color }]}>{conf.label}</Text>
              </View>
            </View>
          );
        })}
      </View>
    )
  );

  if (isWeb) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: '#EEF2F5' }}
        contentContainerStyle={wStyles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <LinearGradient
          colors={[GRADIENT_TOP, GRADIENT_MID, GRADIENT_BOT]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={wStyles.gradientHeader}
        >
          <View style={wStyles.headerInner}>
            <View style={wStyles.headerLeft}>
              <View style={wStyles.headerIconWrap}>
                <CalendarDays size={22} color={ACCENT} strokeWidth={1.8} />
              </View>
              <View>
                <Text style={wStyles.headerEyebrow}>Rider Portal</Text>
                <Text style={wStyles.headerTitle}>My Attendance</Text>
                <Text style={wStyles.headerDate}>{format(currentMonth, 'MMMM yyyy')}</Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        <View style={wStyles.summaryRow} >
          {summaryCards.map((c) => (
            <View key={c.label} style={wStyles.summaryCard}>
              <View style={[wStyles.summaryIconWrap, { backgroundColor: c.bg }]}>
                <c.Icon size={20} color={c.color} strokeWidth={1.8} />
              </View>
              <Text style={wStyles.summaryValue}>{loading ? '—' : c.value}</Text>
              <Text style={wStyles.summaryLabel}>{c.label}</Text>
            </View>
          ))}
          <View style={[wStyles.summaryCard, { backgroundColor: Colors.primarySurface, borderColor: Colors.primary + '30' }]}>
            <View style={[wStyles.summaryIconWrap, { backgroundColor: Colors.white }]}>
              <TrendingUp size={20} color={Colors.primary} strokeWidth={1.8} />
            </View>
            <Text style={[wStyles.summaryValue, { color: Colors.primary }]}>
              {loading ? '—' : (daysElapsed > 0 ? `${Math.round(((presentCount + halfDayCount * 0.5) / daysElapsed) * 100)}%` : '—')}
            </Text>
            <Text style={[wStyles.summaryLabel, { color: Colors.primary }]}>Attendance Rate</Text>
          </View>
        </View>

        <View style={wStyles.stackLayout}>
          <View style={wStyles.card}>
            <View style={wStyles.calendarInner}>
              <Text style={wStyles.cardTitle}>{format(currentMonth, 'MMMM yyyy')}</Text>
              {renderCalendarGrid()}
            </View>
          </View>
          <View style={[wStyles.card, { padding: 0 }]}>
            <Text style={[wStyles.cardTitle, { paddingHorizontal: 20, paddingTop: 20 }]}>Attendance Log</Text>
            <View style={wStyles.tableHead}>
              <Text style={[wStyles.thCell, { flex: 1 }]}>Date</Text>
              <Text style={[wStyles.thCell, { width: 120 }]}>Status</Text>
              <Text style={[wStyles.thCell, { width: 110 }]}>Check In</Text>
              <Text style={[wStyles.thCell, { width: 110 }]}>Check Out</Text>
            </View>
            {attendance.length === 0 ? (
              <View style={wStyles.emptyState}>
                <CalendarDays size={28} color={Colors.textTertiary} strokeWidth={1.5} />
                <Text style={wStyles.emptyText}>No records this month</Text>
              </View>
            ) : (
              attendance.map((record, i) => {
                const conf = STATUS_CONFIG[record.status];
                return (
                  <View key={record.id} style={[wStyles.tableRow, i % 2 === 1 && wStyles.tableRowAlt]}>
                    <Text style={[wStyles.tdCell, { flex: 1, fontFamily: Typography.fontFamily.sansMedium }]}>
                      {format(new Date(record.date), 'EEE, dd MMM')}
                    </Text>
                    <View style={{ width: 120 }}>
                      <View style={[wStyles.statusPill, { backgroundColor: conf.bg }]}>
                        <Text style={[wStyles.statusPillText, { color: conf.color }]}>{conf.label}</Text>
                      </View>
                    </View>
                    <Text style={[wStyles.tdCell, { width: 110 }]}>
                      {record.check_in_time ? format(new Date(record.check_in_time), 'hh:mm a') : '—'}
                    </Text>
                    <Text style={[wStyles.tdCell, { width: 110 }]}>
                      {record.check_out_time ? format(new Date(record.check_out_time), 'hh:mm a') : '—'}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={[mStyles.container, { backgroundColor: '#EEF2F5' }]}>
      <LinearGradient
        colors={[GRADIENT_TOP, GRADIENT_MID, GRADIENT_BOT]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[mStyles.gradientHeader, { paddingTop: insets.top + Spacing[3] }]}
      >
        <View style={mStyles.headerRow}>
          <View style={mStyles.headerIconWrap}>
            <CalendarDays size={18} color={ACCENT} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={mStyles.headerEyebrow}>Rider Portal</Text>
            <Text style={mStyles.headerTitle}>My Attendance</Text>
          </View>
        </View>
        <View style={mStyles.monthBadge}>
          <Text style={mStyles.monthBadgeText}>{format(currentMonth, 'MMMM yyyy')}</Text>
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[mStyles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <View style={mStyles.summaryGrid}>
          {summaryCards.map((c) => (
            <View key={c.label} style={[mStyles.summaryCard, { backgroundColor: c.bg }]}>
              <c.Icon size={16} color={c.color} strokeWidth={1.8} />
              <Text style={[mStyles.summaryValue, { color: c.color }]}>{loading ? '—' : c.value}</Text>
              <Text style={[mStyles.summaryLabel, { color: c.color }]}>{c.label}</Text>
            </View>
          ))}
        </View>

        <View style={mStyles.calendarCard}>
          <Text style={mStyles.cardTitle}>{format(currentMonth, 'MMMM yyyy')}</Text>
          {renderCalendarGrid()}
        </View>

        <View>
          <Text style={mStyles.sectionTitle}>Attendance Log</Text>
          {renderList()}
        </View>
      </ScrollView>
    </View>
  );
}

const calStyles = StyleSheet.create({
  calendarWrap: { gap: 2 },
  dayNamesRow: { flexDirection: 'row', marginBottom: 2 },
  dayNameCell: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  dayNameText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: 10,
    color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.3,
  },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 6, gap: 1, padding: 1,
  },
  todayCell: {
    borderWidth: 1.5, borderColor: Colors.primary,
  },
  dayNumber: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: 12, color: Colors.textPrimary,
  },
  todayNumber: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
});

const mStyles = StyleSheet.create({
  container: { flex: 1 },
  gradientHeader: {
    paddingHorizontal: Spacing[5], paddingBottom: Spacing[4], gap: Spacing[3],
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  headerIconWrap: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerEyebrow: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'],
    color: '#FFFFFF', letterSpacing: -0.3,
  },
  monthBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  monthBadgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: '#FFFFFF',
  },
  scrollContent: { padding: Spacing[4], gap: Spacing[5] },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[3] },
  summaryCard: {
    width: '47%', borderRadius: 14, padding: Spacing[4], alignItems: 'center', gap: Spacing[1],
  },
  summaryValue: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], letterSpacing: -0.5,
  },
  summaryLabel: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, letterSpacing: 0.2,
  },
  calendarCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: Spacing[4],
    borderWidth: 1, borderColor: Colors.border, gap: Spacing[3], ...Shadow.sm,
  },
  cardTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  sectionTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary,
  },
  listCard: {
    backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  listRow: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing[4],
    borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: Spacing[3],
  },
  listRowLast: { borderBottomWidth: 0 },
  listIconWrap: {
    width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  listInfo: { flex: 1, gap: 1 },
  listDate: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary,
  },
  listMeta: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  listNotes: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  statusBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full,
  },
  statusBadgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11,
  },
  emptyState: { paddingVertical: 48, alignItems: 'center', gap: Spacing[3] },
  emptyTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary,
  },
  emptyText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
    textAlign: 'center',
  },
});

const wStyles = StyleSheet.create({
  content: { paddingBottom: 64, gap: 0 },
  gradientHeader: { paddingBottom: 0 },
  headerInner: {
    paddingHorizontal: 32, paddingTop: 32, paddingBottom: 28,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  headerIconWrap: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerEyebrow: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 11,
    color: 'rgba(255,255,255,0.55)', letterSpacing: 1, textTransform: 'uppercase',
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold, fontSize: 30,
    color: '#FFFFFF', letterSpacing: -0.5, marginTop: 2,
  },
  headerDate: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.5)', marginTop: 3,
  },
  summaryRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', padding: 32, paddingBottom: 0 },
  summaryCard: {
    flex: 1, minWidth: 140, backgroundColor: Colors.white, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: Colors.border, gap: 8, alignItems: 'flex-start', ...Shadow.sm,
  },
  summaryIconWrap: {
    width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  summaryValue: {
    fontFamily: Typography.fontFamily.bold, fontSize: 26, color: Colors.textPrimary, letterSpacing: -0.3,
  },
  summaryLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
  },
  rowLayout: { flexDirection: 'row', gap: 18, alignItems: 'flex-start', padding: 32, paddingTop: 24 },
  stackLayout: { flexDirection: 'column', gap: 18, padding: 32, paddingTop: 24 },
  calendarInner: { maxWidth: 480, alignSelf: 'center', width: '100%', gap: 16 },
  card: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: Colors.border, gap: 16, ...Shadow.sm,
    overflow: 'hidden',
  },
  cardTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  tableHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: Colors.neutral[50],
    borderTopWidth: 1, borderTopColor: Colors.border,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  thCell: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11,
    color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: Colors.neutral[50],
    minHeight: 50,
  },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  tdCell: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: Colors.textPrimary, paddingRight: 8,
  },
  statusPill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, alignSelf: 'flex-start',
  },
  statusPillText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11,
  },
  emptyState: { paddingVertical: 40, alignItems: 'center', gap: 10 },
  emptyText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
  },
});
