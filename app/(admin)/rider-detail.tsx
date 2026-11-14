import React, { useEffect, useState, useCallback, useRef } from 'react';
import ModuleGuard from '@/components/admin/ModuleGuard';
import DatePickerField from '@/components/ui/DatePickerField';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, Modal, TextInput, Switch, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Bike, Phone, MapPin, Package, CreditCard, Calendar, CircleCheck as CheckCircle, Circle as XCircle, Clock, Plus, X, Truck, Star, ChevronDown, ChevronRight, Pencil, CircleAlert as AlertCircle, Users, ChartBar as BarChart3, IndianRupee, BedDouble } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { format, subDays, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { calculateMonthlyAttendanceCounts, type MonthlyAttendanceRecord } from '@/utils/monthlyAttendance';
import { calculateOnTimeDeliveryDays } from '@/utils/onTimeDelivery';
import { calculateRiderIncentiveTotal } from '@/utils/riderIncentiveTotal';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const toISTDateStr = (ts: string | null | undefined) => (ts ? new Date(new Date(ts).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10) : '');
const formatISTTime = (ts: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(ts));
const todayISTStr = () => new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
const yesterdayISTStr = () => new Date(Date.now() + IST_OFFSET_MS - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function getPayoutAbsenceDays(records: MonthlyAttendanceRecord[], monthKey: string): number {
  const today = todayISTStr();
  const currentMonthKey = today.slice(0, 7);
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cutoff = monthKey === currentMonthKey
    ? today
    : monthKey < currentMonthKey
      ? `${monthKey}-${String(daysInMonth).padStart(2, '0')}`
      : `${monthKey}-01`;
  return calculateMonthlyAttendanceCounts(records, monthKey, cutoff).absent;
}

function getMonthDays(monthKey: string): number {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Payout math for the selected period: salary is prorated by how much of the
// month the period covers, and deductions are charged only for PAST scheduled
// working days without a present record. Approved leave, today and future dates
// are excused. Daily rate follows the salary / 30 convention.
function computePayoutPeriod(
  attendanceRecords: { date: string; status: string }[],
  approvedLeaves: { leave_date: string; end_date: string | null }[],
  periodStartRaw: string,
  periodEndRaw: string,
  monthKey: string,
  monthlySalary: number,
  today: string,
): { periodStart: string; periodEnd: string; periodDays: number; absentDays: number; baseAmount: number; deductions: number } {
  const monthStart = `${monthKey}-01`;
  const monthEnd = `${monthKey}-${String(getMonthDays(monthKey)).padStart(2, '0')}`;
  const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const start = isDate(periodStartRaw) && periodStartRaw >= monthStart && periodStartRaw <= monthEnd ? periodStartRaw : monthStart;
  let end = isDate(periodEndRaw) && periodEndRaw >= monthStart && periodEndRaw <= monthEnd ? periodEndRaw : monthEnd;
  if (end < start) end = start;

  const rawPeriodDays = Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86400000) + 1;
  // Every month is treated as 30 days for salary math, so a full month pays
  // exactly the monthly salary and any period is prorated at salary / 30.
  const periodDays = Math.min(rawPeriodDays, 30);

  const presentDates = new Set(attendanceRecords.filter(r => r.status === 'present').map(r => r.date));
  const statusByDate = new Map(attendanceRecords.map(r => [r.date, r.status]));
  const leaveRanges = approvedLeaves.map(l => [l.leave_date, l.end_date || l.leave_date] as const);

  let absentDays = 0;
  for (let t = new Date(`${start}T00:00:00Z`).getTime(); t <= new Date(`${end}T00:00:00Z`).getTime(); t += 86400000) {
    const date = new Date(t).toISOString().slice(0, 10);
    if (date >= today) continue;
    if (presentDates.has(date)) continue;
    if (statusByDate.get(date) === 'leave') continue;
    if (leaveRanges.some(([ls, le]) => date >= ls && date <= le)) continue;
    absentDays += 1;
  }

  const salary = Math.max(monthlySalary, 0);
  const baseAmount = Math.round((salary * periodDays) / 30);
  // Deductions can never exceed the base amount, so net payout is never negative.
  const deductions = Math.min(Math.round((salary / 30) * absentDays), baseAmount);
  return { periodStart: start, periodEnd: end, periodDays, absentDays, baseAmount, deductions };
}

import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import StatusChip from '@/components/ui/StatusChip';
import { getEffectiveStatus } from '@/utils/subscriptionStatus';

type Tab = 'overview' | 'assigned_orders' | 'assignments' | 'attendance' | 'payouts' | 'pickup' | 'leave' | 'zones';

const ASSIGN_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  assigned:   { label: 'Assigned',   color: Colors.primary,      bg: Colors.primarySurface },
  accepted:   { label: 'Accepted',   color: Colors.accentDark,   bg: Colors.accentSurface },
  picked_up:  { label: 'Picked Up',  color: Colors.warning,      bg: '#FFF3E0' },
  delivered:  { label: 'Delivered',  color: Colors.success,      bg: '#E8F5E9' },
  failed:     { label: 'Failed',     color: Colors.error,        bg: '#FFEBEE' },
  reassigned: { label: 'Reassigned', color: Colors.textTertiary, bg: Colors.neutral[100] },
};

const ATTENDANCE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  present:  { label: 'Present',  color: Colors.success,      bg: '#E8F5E9' },
  absent:   { label: 'Absent',   color: Colors.error,        bg: '#FFEBEE' },
  half_day: { label: 'Half Day', color: Colors.accentDark,   bg: Colors.accentSurface },
  leave:    { label: 'Leave',    color: Colors.textTertiary, bg: Colors.neutral[100] },
};

const ACTIVE_ASSIGNMENT_STATUSES = ['assigned', 'accepted', 'picked_up', 'delivered'];

const ABSENCE_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  present:     { label: 'Present',     color: Colors.success,      bg: '#E8F5E9' },
  absent:      { label: 'Absent',      color: Colors.error,        bg: '#FFEBEE' },
  half_day:    { label: 'Half Day',    color: Colors.accentDark,   bg: Colors.accentSurface },
  leave:       { label: 'Leave',       color: Colors.textTertiary, bg: Colors.neutral[100] },
  no_check_in: { label: 'No Check-in', color: Colors.error,        bg: '#FFEBEE' },
};

const PAYOUT_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft:    { label: 'Draft',    color: Colors.textTertiary, bg: Colors.neutral[100] },
  approved: { label: 'Approved', color: Colors.accentDark,   bg: Colors.accentSurface },
  paid:     { label: 'Paid',     color: Colors.success,      bg: '#E8F5E9' },
};

export default function RiderDetailScreen() {
  return (
    <ModuleGuard module="riders">
      <RiderDetailScreenContent />
    </ModuleGuard>
  );
}

function RiderDetailScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile: adminProfile } = useAuthStore();

  const [rider, setRider] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [deliveredAssignments, setDeliveredAssignments] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [approvedLeaves, setApprovedLeaves] = useState<{ leave_date: string; end_date: string | null }[]>([]);
  const [pickupOrders, setPickupOrders] = useState<any[]>([]);
  const [pickupMonthKey, setPickupMonthKey] = useState(todayISTStr().slice(0, 7));
  const [pickupYear, setPickupYear] = useState(() => Number(todayISTStr().slice(0, 4)));
  const [showPickupYearPicker, setShowPickupYearPicker] = useState(false);
  const [pickupPrice, setPickupPrice] = useState(0);
  const [pickupPriceInput, setPickupPriceInput] = useState('');
  const [showPickupPriceModal, setShowPickupPriceModal] = useState(false);
  const [savingPickupPrice, setSavingPickupPrice] = useState(false);
  const [loadingPickupPrice, setLoadingPickupPrice] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [showAttModal, setShowAttModal] = useState(false);
  const [attForm, setAttForm] = useState({ date: format(new Date(), 'yyyy-MM-dd'), status: 'present', notes: '', check_in: '', check_out: '' });
  const [savingAtt, setSavingAtt] = useState(false);
  const [attStatusPicker, setAttStatusPicker] = useState(false);
  const [attMonthKey, setAttMonthKey] = useState('');
  const [attDateFrom, setAttDateFrom] = useState<Date | null>(null);
  const [attDateTo, setAttDateTo] = useState<Date | null>(null);

  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutForm, setPayoutForm] = useState({ period_start: '', period_end: '', delivery_bonus: '', notes: '', payment_method: 'upi' });
  const [payoutMonthKey, setPayoutMonthKey] = useState(format(new Date(), 'yyyy-MM'));
  const [incentiveBonus, setIncentiveBonus] = useState(0);
  const [fetchingIncentive, setFetchingIncentive] = useState(false);
  const [savingPayout, setSavingPayout] = useState(false);
  const [pmPicker, setPmPicker] = useState(false);

  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [deliveryDatePreset, setDeliveryDatePreset] = useState<'today' | 'yesterday' | 'custom' | 'all'>('today');
  const [assignedDatePreset, setAssignedDatePreset] = useState<'today' | 'yesterday' | 'custom' | 'all'>('today');
  const [assignedDateFrom, setAssignedDateFrom] = useState<Date | null>(null);
  const [assignedDateTo, setAssignedDateTo] = useState<Date | null>(null);

  const [leaveMonthKey, setLeaveMonthKey] = useState(todayISTStr().slice(0, 7));
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leave_date: format(new Date(), 'yyyy-MM-dd'), end_date: format(new Date(), 'yyyy-MM-dd'), reason: '', notes: '' });
  const [savingLeave, setSavingLeave] = useState(false);

  const [zoneAssignments, setZoneAssignments] = useState<any[]>([]);
  const [allLocalities, setAllLocalities] = useState<any[]>([]);
  const [zoneSearch, setZoneSearch] = useState('');
  const [savingZone, setSavingZone] = useState(false);

  const load = useCallback(async () => {
    try {
      const [riderRes, assignRes, attRes, payoutRes, zoneRes, locRes, pickupRes, leaveReqRes] = await Promise.all([
        supabase.from('riders').select('*').eq('id', id).maybeSingle(),
        supabase.from('rider_order_assignments').select('*').eq('rider_id', id).order('assigned_at', { ascending: false }),
        supabase.from('rider_attendance').select('*').eq('rider_id', id).order('date', { ascending: false }).order('check_in_time', { ascending: false }),
        supabase.from('rider_payouts').select('*').eq('rider_id', id).order('created_at', { ascending: false }),
        supabase.from('rider_zone_assignments').select('*, locality:localities(id, locality_name)').eq('rider_id', id).order('created_at', { ascending: false }),
        supabase.from('localities').select('id, locality_name').order('locality_name'),
        supabase.from('procurement_orders').select('id, order_number, status, requirement_date, pickup_assigned_at, picked_up_at, vendor:vendors(business_name)').eq('pickup_rider_id', id).not('status', 'eq', 'cancelled').order('requirement_date', { ascending: false }),
        supabase.from('rider_leave_requests').select('leave_date, end_date').eq('rider_id', id).eq('status', 'approved'),
      ]);

      const rawAssignments = assignRes.data ?? [];
      const orderIds = rawAssignments.map((a: any) => a.order_id).filter(Boolean);
      const customOrderIds = rawAssignments.map((a: any) => a.custom_order_id).filter(Boolean);
      const [ordersRes, customOrdersRes] = await Promise.all([
        orderIds.length > 0
          ? supabase.from('orders').select('id, scheduled_date, status, user_id, subscription_id').in('id', orderIds)
          : Promise.resolve({ data: [] }),
        customOrderIds.length > 0
          ? supabase.from('custom_orders').select('id, delivery_date, status, user_id, address_id').in('id', customOrderIds)
          : Promise.resolve({ data: [] }),
      ]);

      const orders = ordersRes.data ?? [];
      const customOrders = customOrdersRes.data ?? [];
      const subscriptionIds = orders.map((order: any) => order.subscription_id).filter(Boolean);
      const profileIds = [...orders.map((order: any) => order.user_id), ...customOrders.map((order: any) => order.user_id)].filter(Boolean);
      const [subscriptionsRes, profilesRes, customAddrRes] = await Promise.all([
        subscriptionIds.length > 0
          ? supabase.from('subscriptions').select('id, status, start_date, end_date, new_end_date, pause_start_date, pause_until, delivery_address:addresses(apartment_name, street, landmark, city, state, pincode)').in('id', subscriptionIds)
          : Promise.resolve({ data: [] }),
        profileIds.length > 0
          ? supabase.from('profiles').select('id, full_name, mobile').in('id', profileIds)
          : Promise.resolve({ data: [] }),
        customOrders.length > 0
          ? supabase.from('addresses').select('id, apartment_name, street, landmark, city, state, pincode').in('id', customOrders.map((order: any) => order.address_id).filter(Boolean))
          : Promise.resolve({ data: [] }),
      ]);

      const orderMap: Record<string, any> = {};
      const customOrderMap: Record<string, any> = {};
      const subscriptionMap: Record<string, any> = {};
      const profileMap: Record<string, any> = {};
      const customAddrMap: Record<string, any> = {};
      (subscriptionsRes.data ?? []).forEach((subscription: any) => { subscriptionMap[subscription.id] = subscription; });
      (profilesRes.data ?? []).forEach((profile: any) => { profileMap[profile.id] = profile; });
      (customAddrRes.data ?? []).forEach((addr: any) => { customAddrMap[addr.id] = addr; });
      orders.forEach((order: any) => {
        orderMap[order.id] = { ...order, subscription: subscriptionMap[order.subscription_id] ?? null, user: profileMap[order.user_id] ?? null };
      });
      customOrders.forEach((order: any) => {
        customOrderMap[order.id] = { ...order, user: profileMap[order.user_id] ?? null, address: customAddrMap[order.address_id] ?? null };
      });

      const enrichedAssignments = rawAssignments.map((assignment: any) => ({
        ...assignment,
        order: assignment.order_id ? orderMap[assignment.order_id] ?? null : null,
        custom_order: assignment.custom_order_id ? customOrderMap[assignment.custom_order_id] ?? null : null,
      }));
      // Mirror the Rider App's live-queue rule exactly: one live row per
      // subscription/custom order, always today's own delivery record
      // (today's delivered > today's picked-up > today's assigned > in-transit
      // > newest). Every other row — including past Delivered rows — is
      // date-wise history and is never mixed into today.
      const todayNow = todayISTStr();
      const rankForLive = (a: any) => {
        const orderDate = a.order?.scheduled_date?.slice(0, 10) ?? null;
        if (a.status === 'delivered' && a.delivered_at) {
          if (toISTDateStr(a.delivered_at) === todayNow) return 4;
          if (orderDate === todayNow) return 0;
        }
        if (orderDate === todayNow) return a.picked_up_at ? 3 : 2;
        if (a.picked_up_at && !a.delivered_at) return 1;
        return 0;
      };
      const liveByKey = new Map<string, any>();
      for (const assignment of enrichedAssignments) {
        const key = assignment.custom_order_id ?? assignment.order?.subscription_id ?? assignment.order_id;
        if (!key) continue;
        const existing = liveByKey.get(key);
        if (!existing) { liveByKey.set(key, assignment); continue; }
        const rank = rankForLive(assignment);
        const exRank = rankForLive(existing);
        if (rank > exRank || (rank === exRank && new Date(assignment.assigned_at).getTime() >= new Date(existing.assigned_at).getTime())) {
          liveByKey.set(key, assignment);
        }
      }
      // Queue eligibility mirrors the Rider App filter (applied after dedup):
      // custom orders only on their delivery day until delivered; subscription
      // customers while today falls inside their active delivery window.
      const isQueueEligible = (a: any) => {
        if (!a || a.status === 'reassigned') return false;
        if (a.custom_order_id) {
          const deliveryDay = a.custom_order?.delivery_date?.slice(0, 10);
          return deliveryDay === todayNow && a.status !== 'delivered';
        }
        if (!a.order?.subscription) return false;
        if (getEffectiveStatus(a.order.subscription) !== 'active') return false;
        const start = (a.order.subscription.start_date ?? '').slice(0, 10);
        const end = (a.order.subscription.new_end_date ?? a.order.subscription.end_date ?? '').slice(0, 10);
        if (!start && !end) return true;
        if (start && todayNow < start) return false;
        if (end && todayNow > end) return false;
        return true;
      };
      const liveIds = new Set<string>();
      const liveRows: any[] = [];
      for (const a of liveByKey.values()) {
        if (isQueueEligible(a)) {
          liveIds.add(a.id);
          liveRows.push({ ...a, _live: true });
        }
      }
      const historyRows = enrichedAssignments
        .filter((a: any) => !liveIds.has(a.id))
        .map((a: any) => ({ ...a, _live: false }));
      const finalAssignments = [
        ...historyRows,
        ...liveRows,
      ].sort((a: any, b: any) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime());

      setZoneAssignments(zoneRes.data ?? []);
      setAllLocalities(locRes.data ?? []);
      if (riderRes.data) setRider(riderRes.data);
      setAssignments(finalAssignments);
      setDeliveredAssignments(finalAssignments.filter((assignment: any) => assignment.status === 'delivered'));
      setAttendance(attRes.data ?? []);
      setPayouts(payoutRes.data ?? []);
      setApprovedLeaves(leaveReqRes.data ?? []);
      setPickupOrders(pickupRes.data ?? []);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const loadPickupPrice = useCallback(async () => {
    setLoadingPickupPrice(true);
    const { data, error } = await supabase
      .from('rider_pickup_prices')
      .select('per_day_price')
      .eq('rider_id', id)
      .eq('month', pickupMonthKey)
      .maybeSingle();
    if (!error) {
      const price = Number(data?.per_day_price ?? 0);
      setPickupPrice(price);
      setPickupPriceInput(price > 0 ? String(price) : '');
    }
    setLoadingPickupPrice(false);
  }, [id, pickupMonthKey]);

  useEffect(() => { loadPickupPrice(); }, [loadPickupPrice]);

  useEffect(() => {
    const channel = supabase
      .channel(`rider-assignments-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_order_assignments', filter: `rider_id=eq.${id}` }, () => { load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [id, load]);

  useEffect(() => {
    if (activeTab !== 'pickup') return;
    const channel = supabase
      .channel(`rider-pickup-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'procurement_orders', filter: `pickup_rider_id=eq.${id}` }, () => { load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_pickup_prices', filter: `rider_id=eq.${id}` }, () => { loadPickupPrice(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeTab, id, load, loadPickupPrice]);

  const savePickupPrice = async () => {
    const price = Math.max(Number(pickupPriceInput) || 0, 0);
    setSavingPickupPrice(true);
    const { error } = await supabase.from('rider_pickup_prices').upsert({
      rider_id: id,
      month: pickupMonthKey,
      per_day_price: price,
      created_by: adminProfile?.id,
    }, { onConflict: 'rider_id,month' });
    setSavingPickupPrice(false);
    if (error) {
      Alert.alert('Error', 'Could not save the pickup price. Please try again.');
      return;
    }
    setPickupPrice(price);
    setShowPickupPriceModal(false);
  };

  const saveAttendance = async () => {
    if (!attForm.date) return;
    setSavingAtt(true);
    const payload = {
      rider_id: id,
      date: attForm.date,
      status: attForm.status,
      notes: attForm.notes,
      check_in_time: attForm.check_in ? new Date(`${attForm.date}T${attForm.check_in}:00`).toISOString() : null,
      check_out_time: attForm.check_out ? new Date(`${attForm.date}T${attForm.check_out}:00`).toISOString() : null,
      recorded_by: adminProfile?.id,
    };
    await supabase.from('rider_attendance').upsert(payload, { onConflict: 'rider_id,date' });
    setSavingAtt(false);
    setShowAttModal(false);
    load();
  };

  const fetchIncentiveBonus = useCallback(async (riderId: string, monthKey: string) => {
    setFetchingIncentive(true);
    const [year, month] = monthKey.split('-').map(Number);
    const monthStart = format(new Date(year, month - 1, 1), 'yyyy-MM-dd');
    const nextMonth = format(new Date(year, month, 1), 'yyyy-MM-dd');
    const monthStartISO = new Date(`${monthStart}T00:00:00+05:30`).toISOString();
    const nextMonthISO = new Date(`${nextMonth}T00:00:00+05:30`).toISOString();

    const [incentivesRes, evaluationsRes, rankingRes, attendanceRes, assignmentsRes] = await Promise.all([
      supabase.from('rider_incentives').select('id, amount, type, evaluation_basis, bonus_category, cutoff_time').eq('is_active', true),
      supabase.from('rider_incentive_evaluations').select('incentive_id, status, earned_amount').eq('rider_id', riderId).eq('month', monthKey),
      supabase.from('rider_monthly_rankings').select('on_time_attendance_days').eq('rider_id', riderId).eq('month', monthKey).maybeSingle(),
      supabase.from('rider_attendance').select('date, status').eq('rider_id', riderId).gte('date', monthStart).lt('date', nextMonth),
      supabase.from('rider_order_assignments').select('order_id, custom_order_id, status, delivered_at, assigned_at').eq('rider_id', riderId).neq('status', 'reassigned').gte('assigned_at', monthStartISO).lt('assigned_at', nextMonthISO),
    ]);

    const errors = [incentivesRes.error, evaluationsRes.error, rankingRes.error, attendanceRes.error, assignmentsRes.error].filter(Boolean);
    if (errors.length > 0) {
      console.error('incentive total load error', errors[0]);
      setIncentiveBonus(0);
      setPayoutForm(p => ({ ...p, delivery_bonus: '0' }));
      setFetchingIncentive(false);
      return;
    }

    const assignments = assignmentsRes.data ?? [];
    const orderIds = assignments.map((assignment: any) => assignment.order_id).filter(Boolean);
    const customOrderIds = assignments.map((assignment: any) => assignment.custom_order_id).filter(Boolean);
    const [ordersRes, customOrdersRes] = await Promise.all([
      orderIds.length > 0
        ? supabase.from('orders').select('id, scheduled_date').in('id', orderIds)
        : Promise.resolve({ data: [] }),
      customOrderIds.length > 0
        ? supabase.from('custom_orders').select('id, delivery_date').in('id', customOrderIds)
        : Promise.resolve({ data: [] }),
    ]);

    const deliveryCutoff = (incentivesRes.data ?? []).find((incentive: any) => incentive.bonus_category === 'on_time_delivery')?.cutoff_time ?? null;
    const onTimeDeliveryDays = calculateOnTimeDeliveryDays(
      assignments as any[],
      (ordersRes.data ?? []) as any[],
      (customOrdersRes.data ?? []) as any[],
      deliveryCutoff,
    );
    const absentDays = getPayoutAbsenceDays((attendanceRes.data ?? []) as MonthlyAttendanceRecord[], monthKey);
    const earned = calculateRiderIncentiveTotal(
      (incentivesRes.data ?? []) as any[],
      (evaluationsRes.data ?? []) as any[],
      {
        absentDays,
        onTimeAttendanceDays: Number(rankingRes.data?.on_time_attendance_days ?? 0),
        onTimeDeliveryDays,
      },
    );

    setIncentiveBonus(earned);
    setPayoutForm(p => ({ ...p, delivery_bonus: String(Math.round(earned)) }));
    setFetchingIncentive(false);
  }, []);

  useEffect(() => {
    if (!showPayoutModal || !id) return;
    const channel = supabase
      .channel(`rider-payout-incentives-${id}-${payoutMonthKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_incentive_evaluations', filter: `rider_id=eq.${id}` }, () => fetchIncentiveBonus(id, payoutMonthKey))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_attendance', filter: `rider_id=eq.${id}` }, () => fetchIncentiveBonus(id, payoutMonthKey))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_order_assignments', filter: `rider_id=eq.${id}` }, () => fetchIncentiveBonus(id, payoutMonthKey))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_incentives' }, () => fetchIncentiveBonus(id, payoutMonthKey))
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [showPayoutModal, id, payoutMonthKey, fetchIncentiveBonus]);

  const openPayoutModal = () => {
    const monthKey = format(new Date(), 'yyyy-MM');
    setPayoutMonthKey(monthKey);
    setPayoutPeriodTouched(false);
    setPayoutForm(p => ({ ...p, notes: '' }));
    setShowPayoutModal(true);
    setIncentiveBonus(0);
    fetchIncentiveBonus(id, monthKey);
  };

  const selectPayoutMonth = (monthKey: string) => {
    setPayoutMonthKey(monthKey);
    setPayoutPeriodTouched(false);
    fetchIncentiveBonus(id, monthKey);
  };

  // Period dates follow the selected month chip until the admin edits them
  // manually; after a manual edit, the typed range is kept as-is (clamped).
  const payoutPeriodTouchedRef = useRef(false);
  const setPayoutPeriodTouched = (v: boolean) => { payoutPeriodTouchedRef.current = v; };
  const computedPayout = computePayoutPeriod(
    attendance,
    approvedLeaves,
    payoutPeriodTouchedRef.current ? payoutForm.period_start : `${payoutMonthKey}-01`,
    payoutPeriodTouchedRef.current ? payoutForm.period_end : `${payoutMonthKey}-${String(getMonthDays(payoutMonthKey)).padStart(2, '0')}`,
    payoutMonthKey,
    Number(rider?.monthly_salary ?? 0),
    todayISTStr(),
  );
  const computedBase = String(computedPayout.baseAmount);
  const computedDeductions = String(computedPayout.deductions);

  const savePayout = async () => {
    setSavingPayout(true);
    const base = computedPayout.baseAmount;
    const bonus = Math.round(Number(payoutForm.delivery_bonus) || 0);
    const deductions = computedPayout.deductions;
    const final = Math.round(base + bonus - deductions);
    await supabase.from('rider_payouts').insert({
      rider_id: id,
      period_start: computedPayout.periodStart,
      period_end: computedPayout.periodEnd,
      total_deliveries: assignments.filter(a => a.status === 'delivered').length,
      total_days_worked: attendance.filter(a => a.date >= computedPayout.periodStart && a.date <= computedPayout.periodEnd && (a.status === 'present' || a.status === 'half_day')).length,
      base_amount: base,
      delivery_bonus: bonus,
      deductions,
      final_amount: final,
      notes: payoutForm.notes,
      payment_method: payoutForm.payment_method as any,
      status: 'draft',
      created_by: adminProfile?.id,
    });
    setSavingPayout(false);
    setShowPayoutModal(false);
    load();
  };

  const updatePayoutStatus = async (payout: any, status: string) => {
    const update: any = { status, updated_at: new Date().toISOString() };
    if (status === 'approved') update.approved_by = adminProfile?.id;
    if (status === 'paid') update.paid_at = new Date().toISOString();
    await supabase.from('rider_payouts').update(update).eq('id', payout.id);
    load();
  };

  const saveLeave = async () => {
    if (!leaveForm.leave_date) return;
    setSavingLeave(true);
    await supabase.from('rider_leave_requests').insert({
      rider_id: id,
      leave_date: leaveForm.leave_date,
      end_date: leaveForm.end_date || leaveForm.leave_date,
      reason: leaveForm.reason.trim() || null,
      notes: leaveForm.notes.trim() || null,
      status: 'approved',
      requested_by: adminProfile?.id,
    });
    const startD = new Date(leaveForm.leave_date + 'T00:00:00');
    const endD = new Date((leaveForm.end_date || leaveForm.leave_date) + 'T00:00:00');
    for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
      const dateStr = format(d, 'yyyy-MM-dd');
      await supabase.from('rider_attendance').upsert({
        rider_id: id,
        date: dateStr,
        status: 'leave',
        notes: leaveForm.reason.trim() || 'Leave',
        recorded_by: adminProfile?.id,
      }, { onConflict: 'rider_id,date' });
    }
    setSavingLeave(false);
    setShowLeaveModal(false);
    load();
  };


  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  const getAssignmentTargetId = (assignment: any) => assignment.order_id ?? assignment.custom_order_id;
  const getAssignmentLabel = (assignment: any) => assignment.order_id
    ? `Order #${assignment.order_id.slice(-8).toUpperCase()}`
    : assignment.custom_order_id
      ? `Custom order #${assignment.custom_order_id.slice(-8).toUpperCase()}`
      : 'Invalid assignment';
  const getAssignmentCustomer = (assignment: any) => assignment.order?.user ?? assignment.custom_order?.user;
  const getAssignmentAddress = (assignment: any) => {
    const addr = assignment.order?.subscription?.delivery_address ?? assignment.custom_order?.address;
    if (!addr) return '';
    return [addr.apartment_name, addr.street, addr.landmark, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');
  };
  const getAssignmentScheduledDate = (assignment: any) => assignment.order?.scheduled_date ?? assignment.custom_order?.delivery_date ?? null;
  const getAssignmentTypeLabel = (assignment: any) => assignment.order_id ? 'Subscription' : 'Customize';

  const totalDeliveries = deliveredAssignments.length;
  const totalFailed = assignments.filter(a => a.status === 'failed').length;
  const successRate = (totalDeliveries + totalFailed) > 0 ? Math.round(totalDeliveries / (totalDeliveries + totalFailed) * 100) : 0;
  const presentDays = attendance.filter(a => a.status === 'present').length;
  const halfDays = attendance.filter(a => a.status === 'half_day').length;
  const totalPaid = payouts.filter(p => p.status === 'paid').reduce((s, p) => s + p.final_amount, 0);

  // Mirror the Rider App: absences for the current month are derived from
  // rider_attendance — any elapsed day without a 'present' record counts,
  // using the same shared counting utility for the headline number. Today is
  // shown once the rider checks in, but is not counted absent until day end.
  const todayIST = todayISTStr();
  const currentMonthKey = todayIST.slice(0, 7);
  const [leaveYear, leaveMonth] = leaveMonthKey.split('-').map(Number);
  const leaveDaysInMonth = new Date(Date.UTC(leaveYear, leaveMonth, 0)).getUTCDate();
  const leaveCutoff = leaveMonthKey === currentMonthKey
    ? todayIST
    : leaveMonthKey < currentMonthKey
      ? `${leaveMonthKey}-${String(leaveDaysInMonth).padStart(2, '0')}`
      : `${leaveMonthKey}-01`;
  const monthlyCounts = calculateMonthlyAttendanceCounts(
    attendance.filter((record: any) => record.date.startsWith(leaveMonthKey)),
    leaveMonthKey,
    leaveCutoff,
  );
  const absenceCount = monthlyCounts.absent;

  const attendanceByDate = new Map<string, any>();
  attendance.forEach((record: any) => {
    if (record.date.startsWith(leaveMonthKey) && (!attendanceByDate.has(record.date) || record.status === 'present')) {
      attendanceByDate.set(record.date, record);
    }
  });
  const presentEntries = Array.from(attendanceByDate.values())
    .filter((record: any) => record.status === 'present')
    .sort((a: any, b: any) => b.date.localeCompare(a.date));
  const absenceEntries: { date: string; status: string; notes: string | null; checkIn: string | null }[] = [];
  const cutoffDay = Number(leaveCutoff.slice(8, 10));
  const lastListDay = leaveMonthKey === currentMonthKey ? cutoffDay : leaveDaysInMonth;
  for (let day = lastListDay; day >= 1; day -= 1) {
    const dateStr = `${leaveMonthKey}-${String(day).padStart(2, '0')}`;
    const record = attendanceByDate.get(dateStr);
    if (record?.status === 'present') continue;
    if (dateStr === todayIST && !record) continue;
    absenceEntries.push({
      date: dateStr,
      status: record ? (record.status ?? 'absent') : 'no_check_in',
      notes: record?.notes ?? null,
      checkIn: record?.check_in_time ?? null,
    });
  }

  if (loading) {
    return (
      <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (!rider) {
    return (
      <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: Colors.textSecondary, fontFamily: 'DMSans-Regular', fontSize: 15 }}>Rider not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: Colors.primary, fontFamily: 'DMSans-Medium', fontSize: 15 }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview',       label: 'Overview' },
    { key: 'leave',       label: 'Attendance', count: absenceCount },
    { key: 'assigned_orders', label: 'Assigned Orders', count: assignments.filter((assignment: any) => assignment._live).length },
    { key: 'assignments',     label: 'Deliveries', count: deliveredAssignments.length },
    { key: 'pickup',      label: 'Pickup',     count: pickupOrders.length },
    { key: 'payouts',     label: 'Payouts',    count: payouts.length },
    { key: 'zones',       label: 'Zones',      count: zoneAssignments.length },
  ];

  return (
    <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top }]}>
      {/* Header */}
      <View style={[s.header, isWeb && s.headerWeb]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} strokeWidth={1.8} />
        </TouchableOpacity>
        <View style={s.headerProfile}>
          <View style={[s.headerAvatar, { backgroundColor: rider.is_active ? Colors.primarySurface : Colors.neutral[100] }]}>
            <Text style={[s.headerAvatarText, { color: rider.is_active ? Colors.primary : Colors.textTertiary }]}>{rider.full_name.charAt(0).toUpperCase()}</Text>
            <View style={[s.onlineDot, { backgroundColor: rider.is_active ? Colors.success : Colors.neutral[300] }]} />
          </View>
          <View style={s.headerInfo}>
            <Text style={s.headerName}>{rider.full_name}</Text>
            <View style={s.headerMeta}>
              <Phone size={11} color={Colors.textTertiary} strokeWidth={1.8} />
              <Text style={s.headerMobile}>{rider.mobile}</Text>
              <Text style={s.dot}>·</Text>
              <MapPin size={11} color={Colors.textTertiary} strokeWidth={1.8} />
              <Text style={s.headerZone}>{rider.zone}</Text>
              <Text style={s.dot}>·</Text>
              <View style={s.vehicleBadge}><Text style={s.vehicleText}>{rider.vehicle_type}</Text></View>
            </View>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll} contentContainerStyle={[s.tabScrollContent, isWeb && s.tabScrollContentWeb]}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab.key} style={[s.tab, activeTab === tab.key && s.tabActive]} onPress={() => setActiveTab(tab.key)}>
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>{tab.label}{tab.count !== undefined && tab.count > 0 ? ` (${tab.count})` : ''}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={s.scroll} contentContainerStyle={[s.content, isWeb && s.contentWeb]} showsVerticalScrollIndicator={false}>

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <>
            <View style={[s.metricsGrid, isWeb && s.metricsGridWeb]}>
              <MetricCard icon={<Truck size={16} color={Colors.primary} strokeWidth={1.8} />} bg={Colors.primarySurface} label="Total Deliveries" value={String(totalDeliveries)} />
              <MetricCard icon={<Star size={16} color={Colors.accentDark} strokeWidth={1.8} />} bg={Colors.accentSurface} label="Success Rate" value={`${successRate}%`} />
              <MetricCard icon={<Calendar size={16} color={Colors.secondary} strokeWidth={1.8} />} bg={Colors.secondarySurface} label="Days Present" value={String(presentDays + halfDays)} />
              <MetricCard icon={<IndianRupee size={16} color={Colors.success} strokeWidth={1.8} />} bg="#E8F5E9" label="Total Paid" value={fmt(totalPaid)} />
            </View>
            <View style={s.infoCard}>
              <Text style={s.infoCardTitle}>Rider Profile</Text>
              <InfoRow icon={<Phone size={14} color={Colors.primary} strokeWidth={1.8} />} label="Mobile" value={rider.mobile} />
              {rider.alternate_mobile && <InfoRow icon={<Phone size={14} color={Colors.textTertiary} strokeWidth={1.8} />} label="Alt. Mobile" value={rider.alternate_mobile} />}
              {rider.email && <InfoRow icon={<Users size={14} color={Colors.textTertiary} strokeWidth={1.8} />} label="Email" value={rider.email} />}
              <InfoRow icon={<MapPin size={14} color={Colors.primary} strokeWidth={1.8} />} label="Zone" value={rider.zone} />
              <InfoRow icon={<Bike size={14} color={Colors.accentDark} strokeWidth={1.8} />} label="Vehicle" value={`${rider.vehicle_type}${rider.vehicle_number ? ' · ' + rider.vehicle_number : ''}`} />
              {rider.license_number && <InfoRow icon={<Package size={14} color={Colors.textTertiary} strokeWidth={1.8} />} label="License" value={rider.license_number} />}
              <InfoRow icon={<Calendar size={14} color={Colors.textTertiary} strokeWidth={1.8} />} label="Joined" value={format(new Date(rider.joining_date), 'dd MMM yyyy')} />
              {rider.address && <InfoRow icon={<MapPin size={14} color={Colors.textTertiary} strokeWidth={1.8} />} label="Address" value={rider.address} />}
            </View>
            <View style={s.infoCard}>
              <Text style={s.infoCardTitle}>Compensation</Text>
              <InfoRow icon={<IndianRupee size={14} color={Colors.success} strokeWidth={1.8} />} label="Per Delivery" value={fmt(rider.per_delivery_rate)} />
              <InfoRow icon={<IndianRupee size={14} color={Colors.primary} strokeWidth={1.8} />} label="Daily Rate" value={fmt(rider.daily_rate)} />
            </View>
            <View style={s.infoCard}>
              <Text style={s.infoCardTitle}>Delivery Settings</Text>
              <InfoRow
                icon={<Clock size={14} color={Colors.warning} strokeWidth={1.8} />}
                label="Delivery Deadline"
                value={rider.delivery_deadline_time ? `${rider.delivery_deadline_time} IST` : 'No limit set'}
              />
              <Text style={s.infoCardSub}>Latest time this rider can mark an order as delivered. Edit the rider profile to change it.</Text>
            </View>
            {(rider.emergency_contact_name || rider.emergency_contact_mobile) && (
              <View style={s.infoCard}>
                <Text style={s.infoCardTitle}>Emergency Contact</Text>
                {rider.emergency_contact_name && <InfoRow icon={<Users size={14} color={Colors.textTertiary} strokeWidth={1.8} />} label="Name" value={rider.emergency_contact_name} />}
                {rider.emergency_contact_mobile && <InfoRow icon={<Phone size={14} color={Colors.textTertiary} strokeWidth={1.8} />} label="Mobile" value={rider.emergency_contact_mobile} />}
              </View>
            )}
            {rider.notes ? (
              <View style={s.notesCard}>
                <Text style={s.notesLabel}>Notes</Text>
                <Text style={s.notesText}>{rider.notes}</Text>
              </View>
            ) : null}

            <View style={s.infoCard}>
              <View style={s.assignSectionHeader}>
                <Text style={s.infoCardTitle}>Assigned Orders</Text>
                <TouchableOpacity onPress={() => setActiveTab('assigned_orders')} style={s.viewAllBtn}>
                  <Text style={s.viewAllText}>View All</Text>
                  <ChevronRight size={12} color={Colors.primary} strokeWidth={2} />
                </TouchableOpacity>
              </View>
              {assignments.length === 0 ? (
                <Text style={s.emptyAssignText}>No orders assigned to this rider yet.</Text>
              ) : (
                assignments.slice(0, 5).map(a => {
                  const cfg = ASSIGN_STATUS_CONFIG[a.status] ?? ASSIGN_STATUS_CONFIG.assigned;
                  return (
                    <TouchableOpacity key={a.id} style={s.assignCard} onPress={() => getAssignmentTargetId(a) && router.push({ pathname: a.order_id ? '/(admin)/order-detail' as any : '/(admin)/custom-order-detail' as any, params: { id: getAssignmentTargetId(a) } })} activeOpacity={0.8}>
                      <View style={[s.assignStatusBar, { backgroundColor: cfg.color }]} />
                      <View style={s.assignBody}>
                        <View style={s.assignTop}>
                          <Text style={s.assignOrderId}>{getAssignmentLabel(a)}</Text>
                          <View style={[s.orderTypeBadge, a.order_id ? s.subscriptionBadge : s.customizeBadge]}>
                            <Text style={[s.orderTypeBadgeText, { color: a.order_id ? Colors.primary : Colors.accentDark }]}>{getAssignmentTypeLabel(a)}</Text>
                          </View>
                          <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                            <Text style={[s.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                          </View>
                        </View>
                        {getAssignmentCustomer(a) && <Text style={s.assignCustomer}>{getAssignmentCustomer(a).full_name ?? getAssignmentCustomer(a).mobile}</Text>}
                        <View style={s.assignMeta}>
                          <Calendar size={11} color={Colors.textTertiary} strokeWidth={1.8} />
                          <Text style={s.assignDate}>{format(new Date(a.assigned_at), 'dd MMM · HH:mm')}</Text>
                          {getAssignmentScheduledDate(a) && <><Text style={s.dot}>·</Text><Text style={s.assignDate}>{format(new Date(getAssignmentScheduledDate(a)!), 'dd MMM yyyy')}</Text></>}
                        </View>
                      </View>
                      <ChevronRight size={14} color={Colors.textTertiary} strokeWidth={1.8} />
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </>
        )}

        {/* ASSIGNED ORDERS */}
        {activeTab === 'assigned_orders' && (() => {
          const yesterdayStr = yesterdayISTStr();
          // Actual record date (IST), identical to the Deliveries tab: a
          // delivered row belongs to the day it was actually delivered
          // (never the order's scheduled date), custom orders to their
          // delivery timestamp, everything else to its scheduled/assigned day.
          const recordDate = (a: any) => {
            if (a.status === 'delivered' && a.delivered_at) return toISTDateStr(a.delivered_at);
            if (a.custom_order_id) {
              return getAssignmentScheduledDate(a)?.slice(0, 10) || (a.assigned_at ? toISTDateStr(a.assigned_at) : '');
            }
            const sched = getAssignmentScheduledDate(a)?.slice(0, 10);
            if (sched) return sched;
            return a.assigned_at ? toISTDateStr(a.assigned_at) : '';
          };
          const dateFiltered = assignments.filter(a => {
            // Today mirrors the Rider App queue exactly: the single live row
            // per customer, never historical delivered rows.
            if (assignedDatePreset === 'today') return !!a._live;
            if (assignedDatePreset === 'yesterday') return recordDate(a) === yesterdayStr;
            if (assignedDatePreset === 'custom') {
              const d = recordDate(a);
              if (assignedDateFrom && d < format(assignedDateFrom, 'yyyy-MM-dd')) return false;
              if (assignedDateTo && d > format(assignedDateTo, 'yyyy-MM-dd')) return false;
              return true;
            }
            return true;
          });
          const filtered = dateFiltered;
          return (
          <>
            <View style={[s.assignStats, isWeb && s.assignStatsWeb]}>
              <View style={s.assignStat}><Text style={[s.assignStatVal, { color: Colors.primary }]}>{dateFiltered.length}</Text><Text style={s.assignStatLabel}>Total</Text></View>
              <View style={s.assignStat}><Text style={[s.assignStatVal, { color: Colors.primary }]}>{dateFiltered.filter(a => a.status === 'assigned').length}</Text><Text style={s.assignStatLabel}>Assigned</Text></View>
              <View style={[s.assignStat, s.assignStatLast]}><Text style={[s.assignStatVal, { color: Colors.success }]}>{dateFiltered.filter(a => a.status === 'delivered').length}</Text><Text style={s.assignStatLabel}>Delivered</Text></View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.attMonthChips}>
              {(['today', 'yesterday', 'custom', 'all'] as const).map(key => (
                <TouchableOpacity
                  key={key}
                  style={[s.attMonthChip, assignedDatePreset === key && s.attMonthChipActive]}
                  onPress={() => {
                    setAssignedDatePreset(key);
                    if (key !== 'custom') { setAssignedDateFrom(null); setAssignedDateTo(null); }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[s.attMonthChipText, assignedDatePreset === key && s.attMonthChipTextActive]}>
                    {key === 'all' ? 'All dates' : key === 'today' ? 'Today' : key === 'yesterday' ? 'Yesterday' : 'Custom date'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {assignedDatePreset === 'custom' && (
              <View style={[s.dateFilterRow, isWeb && s.dateFilterRowWeb]}>
                <View style={s.dateFilterPicker}>
                  <DatePickerField label="From" value={assignedDateFrom} onChange={setAssignedDateFrom} maxDate={assignedDateTo ?? undefined} />
                </View>
                <View style={s.dateFilterPicker}>
                  <DatePickerField label="To" value={assignedDateTo} onChange={setAssignedDateTo} minDate={assignedDateFrom ?? undefined} />
                </View>
              </View>
            )}

            {filtered.length === 0 ? (
              <EmptyBlock icon={<Truck size={32} color={Colors.textDisabled} strokeWidth={1.2} />} title={assignments.length === 0 ? 'No orders assigned yet' : 'No orders match this filter'} sub={assignments.length === 0 ? 'Assign orders to this rider to see them here.' : 'Try a different date filter.'} />
            ) : (
              filtered.map(a => {
                const cfg = ASSIGN_STATUS_CONFIG[a.status] ?? ASSIGN_STATUS_CONFIG.assigned;
                return (
                  <TouchableOpacity key={a.id} style={s.assignCard} onPress={() => getAssignmentTargetId(a) && router.push({ pathname: a.order_id ? '/(admin)/order-detail' as any : '/(admin)/custom-order-detail' as any, params: { id: getAssignmentTargetId(a) } })} activeOpacity={0.8}>
                    <View style={[s.assignStatusBar, { backgroundColor: cfg.color }]} />
                    <View style={s.assignBody}>
                      <View style={s.assignTop}>
                        <Text style={s.assignOrderId}>{getAssignmentLabel(a)}</Text>
                        <View style={[s.orderTypeBadge, a.order_id ? s.subscriptionBadge : s.customizeBadge]}>
                          <Text style={[s.orderTypeBadgeText, { color: a.order_id ? Colors.primary : Colors.accentDark }]}>{getAssignmentTypeLabel(a)}</Text>
                        </View>
                        <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                          <Text style={[s.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                      </View>
                      {getAssignmentCustomer(a) && <Text style={s.assignCustomer}>{getAssignmentCustomer(a).full_name ?? getAssignmentCustomer(a).mobile}</Text>}
                      {getAssignmentAddress(a) ? (
                        <View style={s.assignAddrRow}>
                          <MapPin size={11} color={Colors.textTertiary} strokeWidth={1.8} />
                          <Text style={s.assignAddrText} numberOfLines={2}>{getAssignmentAddress(a)}</Text>
                        </View>
                      ) : null}
                      <View style={s.assignMeta}>
                        {a.delivery_fee > 0 && <><Text style={s.dot}>·</Text><Text style={s.assignFee}>{fmt(a.delivery_fee)}</Text></>}
                        {a.distance_km && <><Text style={s.dot}>·</Text><Text style={s.assignDist}>{a.distance_km} km</Text></>}
                      </View>
                      {a.failure_reason ? <Text style={s.failReason}>{a.failure_reason}</Text> : null}
                      {a.swap_reason ? <Text style={s.swapNote}>Swap: {a.swap_reason}</Text> : null}
                      {a.notes ? <Text style={s.attNotes}>{a.notes}</Text> : null}
                    </View>
                    <ChevronRight size={14} color={Colors.textTertiary} strokeWidth={1.8} />
                  </TouchableOpacity>
                );
              })
            )}
          </>
          );
        })()}

        {/* ASSIGNMENTS / DELIVERIES */}
        {activeTab === 'assignments' && (
          <>
            {/* Date Preset Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.attMonthChips}>
              {([
                { key: 'today', label: 'Today' },
                { key: 'yesterday', label: 'Yesterday' },
                { key: 'custom', label: 'Custom Date' },
                { key: 'all', label: 'All dates' },
              ] as const).map(opt => {
                const isActive = deliveryDatePreset === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[s.attMonthChip, isActive && s.attMonthChipActive]}
                    onPress={() => {
                      if (opt.key === 'custom') {
                        setDeliveryDatePreset('custom');
                      } else {
                        setDeliveryDatePreset(opt.key);
                        setDateFrom(null);
                        setDateTo(null);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.attMonthChipText, isActive && s.attMonthChipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Custom Date Range */}
            {deliveryDatePreset === 'custom' && (
              <View style={[s.dateFilterRow, isWeb && s.dateFilterRowWeb]}>
                <View style={s.dateFilterPicker}>
                  <DatePickerField label="From" value={dateFrom} onChange={setDateFrom} maxDate={dateTo ?? undefined} />
                </View>
                <View style={s.dateFilterPicker}>
                  <DatePickerField label="To" value={dateTo} onChange={setDateTo} minDate={dateFrom ?? undefined} />
                </View>
                {(dateFrom || dateTo) && (
                  <TouchableOpacity onPress={() => { setDateFrom(null); setDateTo(null); }} style={s.dateFilterClear}>
                    <X size={13} color={Colors.error} strokeWidth={2} />
                    <Text style={s.dateFilterClearText}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {(() => {
              const todayStr = todayISTStr();
              const yesterdayStr = yesterdayISTStr();
              // Date-wise by the actual delivery timestamp in IST — a record
              // only appears on the day it was delivered, never by scheduled
              // date or a carried-forward status.
              const getDeliveryDate = (a: any) => {
                if (a.status === 'delivered' && a.delivered_at) return toISTDateStr(a.delivered_at);
                const sched = getAssignmentScheduledDate(a);
                if (sched) return sched.slice(0, 10);
                return a.assigned_at ? toISTDateStr(a.assigned_at) : '';
              };
              const filtered = assignments.filter(a => {
                if (a.status !== 'delivered') return false;
                const d = getDeliveryDate(a);
                if (deliveryDatePreset === 'today' && d !== todayStr) return false;
                if (deliveryDatePreset === 'yesterday' && d !== yesterdayStr) return false;
                if (deliveryDatePreset === 'custom') {
                  if (dateFrom && d < format(dateFrom, 'yyyy-MM-dd')) return false;
                  if (dateTo && d > format(dateTo, 'yyyy-MM-dd')) return false;
                }
                return true;
              });
              const dayGroups = new Map<string, any[]>();
              filtered.forEach(a => {
                const d = getDeliveryDate(a) || 'unknown';
                if (!dayGroups.has(d)) dayGroups.set(d, []);
                dayGroups.get(d)!.push(a);
              });
              const groupArr = Array.from(dayGroups.entries()).sort((x, y) => (x[0] < y[0] ? 1 : -1));
              const countOf = (list: any[], pred: (a: any) => boolean) => list.filter(pred).length;
              const groupCounts = (list: any[]) => ({
                assigned: countOf(list, a => a.status === 'assigned'),
                delivered: countOf(list, a => a.status === 'delivered'),
              });
              const attendanceByDate = new Map(attendance.map((rec: any) => [rec.date, rec.status]));
              const isAbsentDay = (d: string) => attendanceByDate.get(d) === 'absent';
              const labelFor = (d: string) => {
                if (d === 'unknown') return 'Unknown date';
                const base = format(new Date(d + 'T00:00:00'), 'EEE, dd MMM yyyy');
                if (d === todayStr) return `${base} · Today`;
                if (d === yesterdayStr) return `${base} · Yesterday`;
                return base;
              };
              return (
              <>
              <View style={s.assignStats}>
                <View style={[s.assignStat, s.assignStatLast]}><Text style={[s.assignStatVal, { color: Colors.success }]}>{filtered.length}</Text><Text style={s.assignStatLabel}>Delivered</Text></View>
              </View>
              {groupArr.length === 0 ? (
                <EmptyBlock icon={<Truck size={32} color={Colors.textDisabled} strokeWidth={1.2} />} title={assignments.length === 0 ? 'No delivery records yet' : 'No records match this date filter'} sub={assignments.length === 0 ? 'Deliveries for this rider will appear here day by day.' : 'Try a different date filter.'} />
              ) : (
                groupArr.map(([day, list]) => {
                  const counts = groupCounts(list);
                  const absentDay = isAbsentDay(day);
                  return (
                    <View key={day} style={s.dayGroup}>
                      <View style={s.dayGroupHeader}>
                        <Text style={s.dayGroupDate}>{labelFor(day)}</Text>
                        <View style={s.dayGroupCounts}>
                          {absentDay && <View style={[s.dayCountPill, { backgroundColor: Colors.errorSurface }]}><Text style={[s.dayCountText, { color: Colors.error }]}>Absent day</Text></View>}
                          {counts.delivered > 0 && <View style={[s.dayCountPill, { backgroundColor: absentDay ? Colors.errorSurface : '#E8F5E9' }]}><Text style={[s.dayCountText, { color: absentDay ? Colors.error : Colors.success }]}>Delivered {counts.delivered}</Text></View>}
                        </View>
                      </View>
                      {absentDay && counts.delivered > 0 && (
                        <Text style={s.absentDayNote}>
                          Delivery recorded on an absent day — flagged for admin review
                        </Text>
                      )}
                      {list.map(a => {
                const cfg = ASSIGN_STATUS_CONFIG[a.status] ?? ASSIGN_STATUS_CONFIG.assigned;
                return (
                  <TouchableOpacity key={a.id} style={s.assignCard} onPress={() => getAssignmentTargetId(a) && router.push({ pathname: a.order_id ? '/(admin)/order-detail' as any : '/(admin)/custom-order-detail' as any, params: { id: getAssignmentTargetId(a) } })} activeOpacity={0.8}>
                    <View style={[s.assignStatusBar, { backgroundColor: cfg.color }]} />
                    <View style={s.assignBody}>
                      <View style={s.assignTop}>
                        <Text style={s.assignOrderId}>{getAssignmentLabel(a)}</Text>
                        <View style={[s.orderTypeBadge, a.order_id ? s.subscriptionBadge : s.customizeBadge]}>
                          <Text style={[s.orderTypeBadgeText, { color: a.order_id ? Colors.primary : Colors.accentDark }]}>{getAssignmentTypeLabel(a)}</Text>
                        </View>
                        <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                          <Text style={[s.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                      </View>
                      {getAssignmentCustomer(a) && <Text style={s.assignCustomer}>{getAssignmentCustomer(a).full_name ?? getAssignmentCustomer(a).mobile}</Text>}
                      {getAssignmentAddress(a) ? (
                        <View style={s.assignAddrRow}>
                          <MapPin size={11} color={Colors.textTertiary} strokeWidth={1.8} />
                          <Text style={s.assignAddrText} numberOfLines={2}>{getAssignmentAddress(a)}</Text>
                        </View>
                      ) : null}
                      <View style={s.assignMeta}>
                        <Calendar size={11} color={Colors.textTertiary} strokeWidth={1.8} />
                        <Text style={s.assignDate}>{format(new Date(a.delivered_at ?? a.assigned_at), 'dd MMM')} · {formatISTTime(a.delivered_at ?? a.assigned_at)}</Text>
                        {a.delivery_fee > 0 && <><Text style={s.dot}>·</Text><Text style={s.assignFee}>{fmt(a.delivery_fee)}</Text></>}
                        {a.distance_km && <><Text style={s.dot}>·</Text><Text style={s.assignDist}>{a.distance_km} km</Text></>}
                      </View>
                      {a.failure_reason ? <Text style={s.failReason}>{a.failure_reason}</Text> : null}
                      {a.swap_reason ? <Text style={s.swapNote}>Swap: {a.swap_reason}</Text> : null}
                    </View>
                    <ChevronRight size={14} color={Colors.textTertiary} strokeWidth={1.8} />
                  </TouchableOpacity>
                );
              })
              }
            </View>
          );
        })
      )}
              </>
              );
            })()}
          </>
        )}

        {/* ATTENDANCE */}
        {activeTab === 'attendance' && (() => {
          // Build last-6-months chips
          const monthChips: { key: string; label: string }[] = [];
          for (let i = 0; i < 6; i++) {
            const d = subMonths(startOfMonth(new Date()), i);
            monthChips.push({ key: format(d, 'yyyy-MM'), label: format(d, 'MMM yyyy') });
          }
          const filteredAtt = attendance.filter(a => {
            if (attMonthKey && !a.date.startsWith(attMonthKey)) return false;
            if (attDateFrom && a.date < format(attDateFrom, 'yyyy-MM-dd')) return false;
            if (attDateTo && a.date > format(attDateTo, 'yyyy-MM-dd')) return false;
            return true;
          });
          const hasAttFilter = !!(attMonthKey || attDateFrom || attDateTo);
          return (
          <>
            <TouchableOpacity style={s.addBtn} onPress={() => { setAttForm({ date: format(new Date(), 'yyyy-MM-dd'), status: 'present', notes: '', check_in: '', check_out: '' }); setShowAttModal(true); }} activeOpacity={0.8}>
              <Plus size={15} color={Colors.white} strokeWidth={2} />
              <Text style={s.addBtnText}>Mark Attendance</Text>
            </TouchableOpacity>

            {/* Month quick-filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.attMonthChips}>
              {monthChips.map(chip => (
                <TouchableOpacity
                  key={chip.key}
                  style={[s.attMonthChip, attMonthKey === chip.key && s.attMonthChipActive]}
                  onPress={() => { setAttMonthKey(p => p === chip.key ? '' : chip.key); setAttDateFrom(null); setAttDateTo(null); }}
                  activeOpacity={0.7}
                >
                  <Text style={[s.attMonthChipText, attMonthKey === chip.key && s.attMonthChipTextActive]}>{chip.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Date range filter */}
            <View style={[s.dateFilterRow, isWeb && s.dateFilterRowWeb]}>
              <View style={s.dateFilterPicker}>
                <DatePickerField label="From" value={attDateFrom} onChange={d => { setAttDateFrom(d); setAttMonthKey(''); }} maxDate={attDateTo ?? undefined} />
              </View>
              <View style={s.dateFilterPicker}>
                <DatePickerField label="To" value={attDateTo} onChange={d => { setAttDateTo(d); setAttMonthKey(''); }} minDate={attDateFrom ?? undefined} />
              </View>
              {hasAttFilter && (
                <TouchableOpacity onPress={() => { setAttMonthKey(''); setAttDateFrom(null); setAttDateTo(null); }} style={s.dateFilterClear}>
                  <X size={13} color={Colors.error} strokeWidth={2} />
                  <Text style={s.dateFilterClearText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={[s.attStats, isWeb && s.attStatsWeb]}>
              {(['present', 'absent', 'half_day', 'leave'] as const).map(st => {
                const cfg = ATTENDANCE_CONFIG[st];
                const count = filteredAtt.filter(a => a.status === st).length;
                return (
                  <View key={st} style={[s.attStat, { backgroundColor: cfg.bg }]}>
                    <Text style={[s.attStatVal, { color: cfg.color }]}>{count}</Text>
                    <Text style={[s.attStatLabel, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                );
              })}
            </View>
            {filteredAtt.length === 0 ? (
              <EmptyBlock icon={<Calendar size={32} color={Colors.textDisabled} strokeWidth={1.2} />} title={attendance.length === 0 ? 'No attendance records' : 'No records in this range'} sub={attendance.length === 0 ? 'Start marking attendance for this rider.' : 'Try a different month or date range.'} />
            ) : (
              filteredAtt.map(a => {
                const cfg = ATTENDANCE_CONFIG[a.status] ?? ATTENDANCE_CONFIG.present;
                return (
                  <View key={a.id} style={s.attCard}>
                    <View style={[s.attStatusDot, { backgroundColor: cfg.color }]} />
                    <View style={s.attBody}>
                      <Text style={s.attDate}>{format(new Date(a.date + 'T00:00:00'), 'EEEE, dd MMM yyyy')}</Text>
                      <View style={s.attMeta}>
                        <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                          <Text style={[s.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                        {a.check_in_time && <Text style={s.attTime}>In: {format(new Date(a.check_in_time), 'HH:mm')}</Text>}
                        {a.check_out_time && <Text style={s.attTime}>Out: {format(new Date(a.check_out_time), 'HH:mm')}</Text>}
                      </View>
                      {a.notes ? <Text style={s.attNotes}>{a.notes}</Text> : null}
                    </View>
                  </View>
                );
              })
            )}
          </>
          );
        })()}

        {/* PAYOUTS */}
        {activeTab === 'payouts' && (
          <>
            <TouchableOpacity style={s.addBtn} onPress={openPayoutModal} activeOpacity={0.8}>
              <Plus size={15} color={Colors.white} strokeWidth={2} />
              <Text style={s.addBtnText}>Create Payout</Text>
            </TouchableOpacity>
            {payouts.length === 0 ? (
              <EmptyBlock icon={<IndianRupee size={32} color={Colors.textDisabled} strokeWidth={1.2} />} title="No payouts yet" sub="Create payouts to track rider compensation." />
            ) : (
              payouts.map(payout => {
                const cfg = PAYOUT_STATUS_CONFIG[payout.status] ?? PAYOUT_STATUS_CONFIG.draft;
                return (
                  <View key={payout.id} style={s.payoutCard}>
                    <View style={s.payoutTop}>
                      <View>
                        <Text style={s.payoutPeriod}>{format(new Date(payout.period_start + 'T00:00:00'), 'dd MMM')} – {format(new Date(payout.period_end + 'T00:00:00'), 'dd MMM yyyy')}</Text>
                        <View style={s.payoutMeta}>
                          <Text style={s.payoutMetaText}>{payout.total_deliveries} deliveries · {payout.total_days_worked} days</Text>
                        </View>
                      </View>
                      <View style={s.payoutRight}>
                        <Text style={[s.payoutAmt, { color: payout.status === 'paid' ? Colors.success : Colors.textPrimary }]}>{fmt(payout.final_amount)}</Text>
                        <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                          <Text style={[s.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={s.payoutBreakdown}>
                      <Text style={s.payoutBreakdownText}>Base {fmt(payout.base_amount)} + Bonus {fmt(payout.delivery_bonus)} – Deductions {fmt(payout.deductions)}</Text>
                    </View>
                    {payout.status !== 'paid' && (
                      <View style={s.payoutActions}>
                        {payout.status === 'draft' && (
                          <TouchableOpacity style={[s.payoutActionBtn, { backgroundColor: Colors.accentSurface }]} onPress={() => updatePayoutStatus(payout, 'approved')}>
                            <Text style={[s.payoutActionText, { color: Colors.accentDark }]}>Approve</Text>
                          </TouchableOpacity>
                        )}
                        {payout.status === 'approved' && (
                          <TouchableOpacity style={[s.payoutActionBtn, { backgroundColor: '#E8F5E9' }]} onPress={() => updatePayoutStatus(payout, 'paid')}>
                            <CheckCircle size={13} color={Colors.success} strokeWidth={2} />
                            <Text style={[s.payoutActionText, { color: Colors.success }]}>Mark Paid</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                    {payout.notes ? <Text style={s.payoutNotes}>{payout.notes}</Text> : null}
                  </View>
                );
              })
            )}
          </>
        )}

        {/* PICKUP */}
        {activeTab === 'pickup' && (() => {
          const monthOrders = pickupOrders.filter(order => (order.requirement_date ?? '').startsWith(pickupMonthKey));
          const byDate = new Map<string, any[]>();
          monthOrders.forEach(order => {
            const date = order.requirement_date ?? 'unknown';
            const list = byDate.get(date) ?? [];
            list.push(order);
            byDate.set(date, list);
          });
          const pickupDays = Array.from(byDate.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([date, orders]) => ({
            date,
            orders,
            completed: orders.length > 0 && orders.every(order => order.status === 'fulfilled'),
          }));
          const completedDays = pickupDays.filter(day => day.completed).length;
          const monthTotal = completedDays * pickupPrice;
          return (
            <>
              <View style={s.infoCard}>
                <View style={s.assignSectionHeader}>
                  <View>
                    <Text style={s.infoCardTitle}>Pickup Salary</Text>
                    <Text style={s.infoCardSub}>Completed dates count once, even when a date has multiple orders.</Text>
                  </View>
                  <TouchableOpacity style={s.addBtn} onPress={() => { setPickupPriceInput(pickupPrice > 0 ? String(pickupPrice) : ''); setShowPickupPriceModal(true); }} activeOpacity={0.8}>
                    <IndianRupee size={13} color={Colors.white} strokeWidth={2} />
                    <Text style={s.addBtnText}>Set Per Day Price</Text>
                  </TouchableOpacity>
                </View>
                <View style={[s.leaveStats, isWeb && s.leaveStatsWeb]}>
                  <View style={[s.leaveStat, { backgroundColor: Colors.primarySurface }]}>
                    <Text style={[s.leaveStatVal, { color: Colors.primary }]}>{fmt(pickupPrice)}</Text>
                    <Text style={[s.leaveStatLabel, { color: Colors.primary }]}>Per completed day</Text>
                  </View>
                  <View style={[s.leaveStat, { backgroundColor: Colors.successSurface }]}>
                    <Text style={[s.leaveStatVal, { color: Colors.success }]}>{completedDays}</Text>
                    <Text style={[s.leaveStatLabel, { color: Colors.success }]}>Completed days</Text>
                  </View>
                  <View style={[s.leaveStat, { backgroundColor: Colors.accentSurface }]}>
                    <Text style={[s.leaveStatVal, { color: Colors.accentDark }]}>{fmt(monthTotal)}</Text>
                    <Text style={[s.leaveStatLabel, { color: Colors.accentDark }]}>Monthly pickup salary</Text>
                  </View>
                </View>
              </View>
              <View style={s.fieldGroup}>
                <TouchableOpacity style={s.pickerBtn} onPress={() => setShowPickupYearPicker(p => !p)} activeOpacity={0.8}>
                  <Text style={s.pickerValue}>{pickupYear}</Text>
                  <ChevronDown size={14} color={Colors.textTertiary} strokeWidth={1.8} />
                </TouchableOpacity>
                {showPickupYearPicker && (
                  <View style={s.pickerDropdown}>
                    {Array.from({ length: 12 }, (_, i) => new Date().getFullYear() - 10 + i).map(year => (
                      <TouchableOpacity key={year} style={[s.pickerOption, pickupYear === year && s.pickerOptionActive]} onPress={() => { setPickupYear(year); setPickupMonthKey(`${year}-${pickupMonthKey.slice(5, 7)}`); setShowPickupYearPicker(false); }}>
                        <Text style={[s.pickerOptionText, pickupYear === year && s.pickerOptionTextActive]}>{year}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.attMonthChips}>
                {Array.from({ length: 12 }, (_, i) => i).map(monthIndex => {
                  const key = `${pickupYear}-${String(monthIndex + 1).padStart(2, '0')}`;
                  const monthLabel = format(new Date(pickupYear, monthIndex, 1), 'MMM');
                  return (
                    <TouchableOpacity key={key} style={[s.attMonthChip, pickupMonthKey === key && s.attMonthChipActive]} onPress={() => setPickupMonthKey(key)} activeOpacity={0.7}>
                      <Text style={[s.attMonthChipText, pickupMonthKey === key && s.attMonthChipTextActive]}>{monthLabel}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {pickupDays.length === 0 ? (
                <EmptyBlock icon={<Package size={32} color={Colors.textDisabled} strokeWidth={1.2} />} title="No pickup orders this month" sub="Orders assigned from Daily Requirements will appear here." />
              ) : pickupDays.map(day => (
                <View key={day.date} style={s.infoCard}>
                  <View style={s.assignSectionHeader}>
                    <View>
                      <Text style={s.infoCardTitle}>{format(new Date(`${day.date}T00:00:00`), 'dd MMM yyyy')}</Text>
                      <Text style={s.infoCardSub}>{day.orders.length} assigned order{day.orders.length === 1 ? '' : 's'}</Text>
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: day.completed ? Colors.successSurface : Colors.warningSurface }]}>
                      <Text style={[s.statusBadgeText, { color: day.completed ? Colors.success : Colors.warning }]}>{day.completed ? `Completed · ${fmt(pickupPrice)}` : 'Pending pickup'}</Text>
                    </View>
                  </View>
                  {day.orders.map(order => (
                    <View key={order.id} style={s.leaveCard}>
                      <View style={[s.leaveCardAccent, { backgroundColor: order.status === 'fulfilled' ? Colors.success : Colors.warning }]} />
                      <View style={s.leaveCardBody}>
                        <View style={s.leaveCardTop}>
                          <Text style={s.leaveDate}>{order.order_number}</Text>
                          <Text style={[s.leaveNotes, { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textPrimary }]}>{order.vendor?.business_name ?? 'Vendor'}</Text>
                        </View>
                        <Text style={[s.leaveNotes, { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textPrimary }]}>{order.status === 'fulfilled' ? 'Picked Up' : 'Pending Pickup'}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ))}
            </>
          );
        })()}

        {/* ZONES */}
        {activeTab === 'zones' && (
          <>
            <View style={s.infoCard}>
              <Text style={s.infoCardTitle}>Assigned Delivery Zones</Text>
              <Text style={s.infoCardSub}>Each zone has a priority: Primary riders get orders first, Backup riders cover when the primary is unavailable.</Text>

              {zoneAssignments.length > 0 && (
                <View style={s.zoneList}>
                  {zoneAssignments.map((za: any) => (
                    <View key={za.id} style={s.zoneRow}>
                      <View style={s.zoneInfo}>
                        <MapPin size={14} color={za.priority_level === 'primary' ? Colors.primary : Colors.accentDark} strokeWidth={1.8} />
                        <Text style={s.zoneName}>{za.locality?.locality_name ?? 'Unknown'}</Text>
                      </View>
                      <View style={s.zoneRight}>
                        <View style={[s.zonePriorityBadge, { backgroundColor: za.priority_level === 'primary' ? Colors.primarySurface : Colors.accentSurface }]}>
                          <Text style={[s.zonePriorityText, { color: za.priority_level === 'primary' ? Colors.primary : Colors.accentDark }]}>{za.priority_level === 'primary' ? 'Primary' : 'Backup'}</Text>
                        </View>
                        <TouchableOpacity onPress={async () => { await supabase.from('rider_zone_assignments').delete().eq('id', za.id); load(); }}>
                          <X size={16} color={Colors.error} strokeWidth={2} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <Text style={s.zoneAddLabel}>Add Zone</Text>
              <View style={s.searchWrap}>
                <TextInput style={s.zoneSearchInput} value={zoneSearch} onChangeText={setZoneSearch} placeholder="Search localities..." placeholderTextColor={Colors.textDisabled} />
              </View>
              <View style={s.zoneAddList}>
                {allLocalities
                  .filter(l => !zoneAssignments.some((za: any) => za.locality_id === l.id))
                  .filter(l => !zoneSearch.trim() || l.locality_name.toLowerCase().includes(zoneSearch.toLowerCase()))
                  .slice(0, 8)
                  .map(l => (
                    <View key={l.id} style={s.zoneAddRow}>
                      <Text style={s.zoneAddName}>{l.locality_name}</Text>
                      <View style={s.zoneAddBtns}>
                        <TouchableOpacity style={[s.zoneAddBtn, { backgroundColor: Colors.primarySurface }]} onPress={async () => { setSavingZone(true); await supabase.from('rider_zone_assignments').insert({ rider_id: id, locality_id: l.id, priority_level: 'primary' }); setSavingZone(false); setZoneSearch(''); load(); }} disabled={savingZone}>
                          <Text style={[s.zoneAddBtnText, { color: Colors.primary }]}>Primary</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.zoneAddBtn, { backgroundColor: Colors.accentSurface }]} onPress={async () => { setSavingZone(true); await supabase.from('rider_zone_assignments').insert({ rider_id: id, locality_id: l.id, priority_level: 'backup' }); setSavingZone(false); setZoneSearch(''); load(); }} disabled={savingZone}>
                          <Text style={[s.zoneAddBtnText, { color: Colors.accentDark }]}>Backup</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
              </View>
            </View>
          </>
        )}

        {/* LEAVE — mirrors the Rider App attendance log (absences this month) */}
        {activeTab === 'leave' && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.attMonthChips}>
              {Array.from({ length: 12 }, (_, index) => {
                const month = subMonths(startOfMonth(new Date()), index);
                const key = format(month, 'yyyy-MM');
                return (
                  <TouchableOpacity key={key} style={[s.attMonthChip, leaveMonthKey === key && s.attMonthChipActive]} onPress={() => setLeaveMonthKey(key)} activeOpacity={0.7}>
                    <Text style={[s.attMonthChipText, leaveMonthKey === key && s.attMonthChipTextActive]}>{format(month, 'MMM yyyy')}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={[s.leaveStats, isWeb && s.leaveStatsWeb]}>
              <View style={[s.leaveStat, { backgroundColor: '#FFEBEE' }]}>
                <Text style={[s.leaveStatVal, { color: Colors.error }]}>{absenceCount}</Text>
                <Text style={[s.leaveStatLabel, { color: Colors.error }]}>Absent / Leave days</Text>
              </View>
              <View style={[s.leaveStat, { backgroundColor: '#E8F5E9' }]}>
                <Text style={[s.leaveStatVal, { color: Colors.success }]}>{monthlyCounts.present}</Text>
                <Text style={[s.leaveStatLabel, { color: Colors.success }]}>Present days</Text>
              </View>
            </View>

            <Text style={s.infoCardTitle}>Present</Text>
            {presentEntries.length === 0 ? (
              <EmptyBlock icon={<Calendar size={32} color={Colors.textDisabled} strokeWidth={1.2} />} title="No present records" sub="No check-in records were found for this month." />
            ) : presentEntries.map((entry: any) => (
              <View key={`present-${entry.date}`} style={s.leaveCard}>
                <View style={[s.leaveCardAccent, { backgroundColor: Colors.success }]} />
                <View style={s.leaveCardBody}>
                  <View style={s.leaveCardTop}>
                    <Text style={s.leaveDate}>{format(new Date(entry.date + 'T00:00:00'), 'dd MMM yyyy')} · {format(new Date(entry.date + 'T00:00:00'), 'EEEE')}</Text>
                    <View style={[s.statusBadge, { backgroundColor: '#E8F5E9' }]}><Text style={[s.statusBadgeText, { color: Colors.success }]}>Present</Text></View>
                  </View>
                  {entry.check_in_time ? <Text style={s.leaveNotes}>Check-in: {formatISTTime(entry.check_in_time)}</Text> : null}
                  {entry.notes ? <Text style={s.leaveNotes}>{entry.notes}</Text> : null}
                </View>
              </View>
            ))}

            <Text style={s.infoCardTitle}>Absent / Leave</Text>
            {absenceEntries.length === 0 ? (
              <EmptyBlock icon={<BedDouble size={32} color={Colors.textDisabled} strokeWidth={1.2} />} title="No absences" sub="This rider has no absent or leave days recorded for this month." />
            ) : absenceEntries.map(entry => {
              const cfg = ABSENCE_STATUS_CONFIG[entry.status] ?? ABSENCE_STATUS_CONFIG.absent;
              return (
                <View key={`absence-${entry.date}`} style={s.leaveCard}>
                  <View style={[s.leaveCardAccent, { backgroundColor: cfg.color }]} />
                  <View style={s.leaveCardBody}>
                    <View style={s.leaveCardTop}>
                      <Text style={s.leaveDate}>{format(new Date(entry.date + 'T00:00:00'), 'dd MMM yyyy')} · {format(new Date(entry.date + 'T00:00:00'), 'EEEE')}</Text>
                      <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}><Text style={[s.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text></View>
                    </View>
                    {entry.status === 'no_check_in' ? <Text style={s.leaveReason}>No check-in recorded for this day</Text> : null}
                    {entry.checkIn ? <Text style={s.leaveNotes}>Check-in: {formatISTTime(entry.checkIn)}</Text> : null}
                    {entry.notes ? <Text style={s.leaveNotes}>{entry.notes}</Text> : null}
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Attendance Modal */}
      <Modal visible={showAttModal} transparent animationType="fade" onRequestClose={() => setShowAttModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Mark Attendance</Text>
              <TouchableOpacity onPress={() => setShowAttModal(false)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <ModalField label="Date (YYYY-MM-DD)" value={attForm.date} onChange={v => setAttForm(p => ({ ...p, date: v }))} placeholder="2026-04-01" />
              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>Status</Text>
                <TouchableOpacity style={s.pickerBtn} onPress={() => setAttStatusPicker(p => !p)}>
                  <Text style={s.pickerValue}>{ATTENDANCE_CONFIG[attForm.status]?.label ?? attForm.status}</Text>
                  <ChevronDown size={14} color={Colors.textTertiary} strokeWidth={1.8} />
                </TouchableOpacity>
                {attStatusPicker && (
                  <View style={s.pickerDropdown}>
                    {['present', 'absent', 'half_day', 'leave'].map(st => (
                      <TouchableOpacity key={st} style={[s.pickerOption, attForm.status === st && s.pickerOptionActive]} onPress={() => { setAttForm(p => ({ ...p, status: st })); setAttStatusPicker(false); }}>
                        <Text style={[s.pickerOptionText, attForm.status === st && s.pickerOptionTextActive]}>{ATTENDANCE_CONFIG[st]?.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              <View style={s.fieldRowHoriz}>
                <ModalField label="Check In (HH:MM)" value={attForm.check_in} onChange={v => setAttForm(p => ({ ...p, check_in: v }))} placeholder="09:00" flex={1} />
                <ModalField label="Check Out (HH:MM)" value={attForm.check_out} onChange={v => setAttForm(p => ({ ...p, check_out: v }))} placeholder="18:00" flex={1} />
              </View>
              <ModalField label="Notes" value={attForm.notes} onChange={v => setAttForm(p => ({ ...p, notes: v }))} placeholder="Optional notes" multiline />
            </ScrollView>
            <ModalFooter onCancel={() => setShowAttModal(false)} onSave={saveAttendance} saving={savingAtt} saveLabel="Save" />
          </View>
        </View>
      </Modal>

      {/* Payout Modal */}
      <Modal visible={showPayoutModal} transparent animationType="fade" onRequestClose={() => setShowPayoutModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Create Payout</Text>
              <TouchableOpacity onPress={() => setShowPayoutModal(false)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.attMonthChips}>
                {(() => {
                  const now = new Date();
                  const months: string[] = [];
                  for (let i = 0; i < 6; i += 1) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    months.push(format(d, 'yyyy-MM'));
                  }
                  return months.map(mk => (
                    <TouchableOpacity
                      key={mk}
                      style={[s.attMonthChip, payoutMonthKey === mk && s.attMonthChipActive]}
                      onPress={() => selectPayoutMonth(mk)}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.attMonthChipText, payoutMonthKey === mk && s.attMonthChipTextActive]}>
                        {format(new Date(Number(mk.slice(0, 4)), Number(mk.slice(5, 7)) - 1, 1), 'MMM yyyy')}
                      </Text>
                    </TouchableOpacity>
                  ));
                })()}
              </ScrollView>
              <View style={s.fieldRowHoriz}>
                <ModalField label="Period Start" value={computedPayout.periodStart} onChange={v => { setPayoutPeriodTouched(true); setPayoutForm(p => ({ ...p, period_start: v })); }} placeholder="2026-04-01" flex={1} />
                <ModalField label="Period End" value={computedPayout.periodEnd} onChange={v => { setPayoutPeriodTouched(true); setPayoutForm(p => ({ ...p, period_end: v })); }} placeholder="2026-04-30" flex={1} />
              </View>
              <View style={s.fieldRowHoriz}>
                <View style={[s.fieldGroup, { flex: 1, marginBottom: 0 }]}>
                  <Text style={s.fieldLabel}>Base Amount (₹) — Monthly Salary</Text>
                  <TextInput style={s.input} value={computedBase} editable={false} placeholder="0" placeholderTextColor={Colors.textDisabled} keyboardType="numeric" />
                  <Text style={s.payoutBonusHint}>{computedPayout.periodDays} day{computedPayout.periodDays === 1 ? '' : 's'} (30-day month) × ₹{(Number(rider?.monthly_salary ?? 0) / 30).toLocaleString('en-IN', { maximumFractionDigits: 2 })}/day</Text>
                </View>
                <View style={[s.fieldGroup, { flex: 1, marginBottom: 0 }]}>
                  <Text style={s.fieldLabel}>Delivery Bonus (₹) — Incentives earned in {format(new Date(Number(payoutMonthKey.slice(0, 4)), Number(payoutMonthKey.slice(5, 7)) - 1, 1), 'MMMM yyyy')}</Text>
                  <TextInput style={s.input} value={fetchingIncentive ? '…' : payoutForm.delivery_bonus} editable={false} placeholder="0" placeholderTextColor={Colors.textDisabled} keyboardType="numeric" />
                  {!fetchingIncentive && (
                    <Text style={s.payoutBonusHint}>{incentiveBonus > 0 ? `Includes ₹${incentiveBonus.toLocaleString('en-IN')} incentives earned this month` : 'No incentives earned for this month yet'}</Text>
                  )}
                </View>
              </View>
              <View style={s.fieldRowHoriz}>
                <View style={[s.fieldGroup, { flex: 1, marginBottom: 0 }]}>
                  <Text style={s.fieldLabel}>Deductions (₹)</Text>
                  <TextInput style={s.input} value={computedDeductions} editable={false} placeholder="0" placeholderTextColor={Colors.textDisabled} keyboardType="numeric" />
                  <Text style={s.payoutBonusHint}>{computedPayout.absentDays} absent day{computedPayout.absentDays === 1 ? '' : 's'} in the period (leave and future days excluded)</Text>
                </View>
                <View style={[s.fieldGroup, { flex: 1, justifyContent: 'flex-end' }]}>
                  <Text style={s.fieldLabel}>Total</Text>
                  <View style={s.totalBox}>
                    <Text style={s.totalText}>{fmt(Math.round(computedPayout.baseAmount + (Number(payoutForm.delivery_bonus) || 0) - computedPayout.deductions))}</Text>
                  </View>
                </View>
              </View>
              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>Payment Method</Text>
                <TouchableOpacity style={s.pickerBtn} onPress={() => setPmPicker(p => !p)}>
                  <Text style={s.pickerValue}>{payoutForm.payment_method.replace('_', ' ').toUpperCase()}</Text>
                  <ChevronDown size={14} color={Colors.textTertiary} strokeWidth={1.8} />
                </TouchableOpacity>
                {pmPicker && (
                  <View style={s.pickerDropdown}>
                    {['cash', 'upi', 'bank_transfer'].map(m => (
                      <TouchableOpacity key={m} style={[s.pickerOption, payoutForm.payment_method === m && s.pickerOptionActive]} onPress={() => { setPayoutForm(p => ({ ...p, payment_method: m })); setPmPicker(false); }}>
                        <Text style={[s.pickerOptionText, payoutForm.payment_method === m && s.pickerOptionTextActive]}>{m.replace('_', ' ').toUpperCase()}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              <ModalField label="Notes" value={payoutForm.notes} onChange={v => setPayoutForm(p => ({ ...p, notes: v }))} placeholder="Optional notes" multiline />
            </ScrollView>
            <ModalFooter onCancel={() => setShowPayoutModal(false)} onSave={savePayout} saving={savingPayout} saveLabel="Create Draft" />
          </View>
        </View>
      </Modal>

      {/* Pickup Price Modal */}
      <Modal visible={showPickupPriceModal} transparent animationType="fade" onRequestClose={() => setShowPickupPriceModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Set Pickup Price</Text>
              <TouchableOpacity onPress={() => setShowPickupPriceModal(false)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <Text style={s.fieldLabel}>{format(new Date(Number(pickupMonthKey.slice(0, 4)), Number(pickupMonthKey.slice(5, 7)) - 1, 1), 'MMMM yyyy')}</Text>
            <TextInput style={s.input} value={pickupPriceInput} onChangeText={setPickupPriceInput} placeholder="0" placeholderTextColor={Colors.textDisabled} keyboardType="numeric" />
            <Text style={s.infoCardSub}>This fixed amount is paid for each date where every assigned pickup order is marked Picked Up.</Text>
            <ModalFooter onCancel={() => setShowPickupPriceModal(false)} onSave={savePickupPrice} saving={savingPickupPrice} saveLabel="Save Price" />
          </View>
        </View>
      </Modal>

      {/* Leave Modal */}
      <Modal visible={showLeaveModal} transparent animationType="fade" onRequestClose={() => setShowLeaveModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Mark Leave</Text>
              <TouchableOpacity onPress={() => setShowLeaveModal(false)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <View style={s.leaveInfoBanner}>
              <AlertCircle size={14} color={Colors.warning} strokeWidth={1.8} />
              <Text style={s.leaveInfoText}>Marking a leave day will also update attendance to "Leave" and surface any active assignments on that date for reassignment.</Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={s.fieldRowHoriz}>
                <ModalField label="Start Date" value={leaveForm.leave_date} onChange={v => setLeaveForm(p => ({ ...p, leave_date: v }))} placeholder="2026-04-01" flex={1} />
                <ModalField label="End Date" value={leaveForm.end_date} onChange={v => setLeaveForm(p => ({ ...p, end_date: v }))} placeholder="2026-04-01" flex={1} />
              </View>
              <ModalField label="Reason" value={leaveForm.reason} onChange={v => setLeaveForm(p => ({ ...p, reason: v }))} placeholder="e.g. Sick leave, personal" />
              <ModalField label="Notes" value={leaveForm.notes} onChange={v => setLeaveForm(p => ({ ...p, notes: v }))} placeholder="Optional additional notes" multiline />
            </ScrollView>
            <ModalFooter onCancel={() => setShowLeaveModal(false)} onSave={saveLeave} saving={savingLeave} saveLabel="Mark Leave" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MetricCard({ icon, bg, label, value }: { icon: React.ReactNode; bg: string; label: string; value: string }) {
  return (
    <View style={s.metricCard}>
      <View style={[s.metricIconCircle, { backgroundColor: bg }]}>{icon}</View>
      <Text style={s.metricValue}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <View style={s.infoRowIcon}>{icon}</View>
      <Text style={s.infoRowLabel}>{label}</Text>
      <Text style={s.infoRowValue}>{value}</Text>
    </View>
  );
}

function EmptyBlock({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <View style={s.emptyBlock}>
      {icon}
      <Text style={s.emptyTitle}>{title}</Text>
      {sub && <Text style={s.emptySub}>{sub}</Text>}
    </View>
  );
}

function ModalField({ label, value, onChange, placeholder, multiline, keyboardType, flex }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; keyboardType?: any; flex?: number }) {
  return (
    <View style={[s.fieldGroup, flex !== undefined && { flex }]}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput style={[s.input, multiline && s.textarea]} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={Colors.textDisabled} multiline={multiline} numberOfLines={multiline ? 3 : 1} keyboardType={keyboardType} />
    </View>
  );
}

function ModalFooter({ onCancel, onSave, saving, saveLabel }: { onCancel: () => void; onSave: () => void; saving: boolean; saveLabel: string }) {
  return (
    <View style={s.modalFooter}>
      <TouchableOpacity style={s.cancelBtn} onPress={onCancel}>
        <Text style={s.cancelBtnText}>Cancel</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.saveBtn} onPress={onSave} disabled={saving}>
        {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveBtnText}>{saveLabel}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing[3] },
  headerWeb: { paddingHorizontal: Spacing[8], paddingVertical: Spacing[5] },
  backBtn: { padding: Spacing[1] },
  headerProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  headerAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  headerAvatarText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: Colors.white },
  headerInfo: { flex: 1 },
  headerName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2, flexWrap: 'wrap' },
  headerMobile: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  dot: { color: Colors.textDisabled, fontSize: Typography.size.xs },
  headerZone: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  vehicleBadge: { paddingHorizontal: Spacing[2], paddingVertical: 2, borderRadius: Radius.full, backgroundColor: Colors.accentSurface },
  vehicleText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.accentDark },
  assignBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1], paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  assignBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary },
  tabScroll: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, flexGrow: 0, flexShrink: 0 },
  tabScrollContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], gap: Spacing[2] },
  tabScrollContentWeb: { paddingHorizontal: Spacing[8] },
  tab: { height: 34, justifyContent: 'center', paddingHorizontal: Spacing[4], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  tabActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  tabText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  scroll: { flex: 1 },
  content: { padding: Spacing[5], gap: Spacing[4] },
  contentWeb: { padding: Spacing[8], maxWidth: 900, alignSelf: 'center', width: '100%', gap: Spacing[5] },
  metricsGrid: { flexDirection: 'row', gap: Spacing[3] },
  metricsGridWeb: { gap: Spacing[4] },
  metricCard: { flex: 1, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[3], alignItems: 'center', gap: 3, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  metricIconCircle: { width: 32, height: 32, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  metricValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary },
  metricLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary, textAlign: 'center' },
  infoCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing[4], gap: Spacing[2], ...Shadow.sm },
  infoCardTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing[1] },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingVertical: Spacing[1] },
  infoRowIcon: { width: 24, alignItems: 'center' },
  infoRowLabel: { width: 90, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  infoRowValue: { flex: 1, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  notesCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing[4], ...Shadow.sm },
  notesLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing[2] },
  notesText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, lineHeight: 20 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.primary, paddingVertical: Spacing[3], paddingHorizontal: Spacing[5], borderRadius: Radius.md, alignSelf: 'flex-start' },
  addBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  assignStats: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  dayGroup: { gap: Spacing[2] },
  dayGroupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: Spacing[2], paddingHorizontal: Spacing[1], marginTop: Spacing[1] },
  dayGroupDate: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  dayGroupCounts: { flexDirection: 'row', gap: Spacing[1], flexWrap: 'wrap' },
  dayCountPill: { paddingHorizontal: Spacing[2], paddingVertical: 2, borderRadius: Radius.full },
  dayCountText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10 },
  absentDayNote: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.error,
    paddingHorizontal: Spacing[2], paddingBottom: Spacing[2],
  },
  assignStatsWeb: {},
  assignStat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing[3], borderRightWidth: 1, borderRightColor: Colors.divider },
  assignStatLast: { borderRightWidth: 0 },
  dateFilterRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing[3], backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  dateFilterRowWeb: {},
  dateFilterPicker: { flex: 1 },
  dateFilterClear: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing[2], paddingVertical: Spacing[1], borderRadius: Radius.md, backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: Colors.error + '30' },
  dateFilterClearText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.error },
  assignStatVal: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl },
  assignStatLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary, marginTop: 2 },
  assignCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  assignStatusBar: { width: 4, alignSelf: 'stretch' },
  assignBody: { flex: 1, padding: Spacing[4], gap: 4 },
  assignTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  assignOrderId: { flex: 1, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  assignCustomer: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  assignMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  assignDate: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  assignAddrRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginTop: 2 },
  assignAddrText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary, flex: 1 },
  assignFee: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.success },
  assignDist: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  failReason: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.error, marginTop: 2 },
  swapNote: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.warning, marginTop: 2 },
  statusBadge: { paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.full },
  statusBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  orderTypeBadge: { paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.full },
  subscriptionBadge: { backgroundColor: Colors.primarySurface },
  customizeBadge: { backgroundColor: Colors.accentSurface },
  orderTypeBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10 },
  attStats: { flexDirection: 'row', gap: Spacing[3] },
  attStatsWeb: { gap: Spacing[4] },
  attMonthChips: { flexDirection: 'row', gap: Spacing[2], paddingVertical: Spacing[1] },
  attMonthChip: { paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  attMonthChipActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  attMonthChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textSecondary },
  attMonthChipTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  attStat: { flex: 1, alignItems: 'center', paddingVertical: Spacing[3], borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border },
  attStatVal: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl },
  attStatLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, marginTop: 2 },
  attCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing[4], gap: Spacing[3], ...Shadow.sm },
  attStatusDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  attBody: { flex: 1, gap: 5 },
  attDate: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  attMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  attTime: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  attNotes: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  leaveStats: { flexDirection: 'row', gap: Spacing[3] },
  leaveStatsWeb: { gap: Spacing[4] },
  leaveStat: { flex: 1, alignItems: 'center', paddingVertical: Spacing[3], borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border },
  leaveStatVal: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl },
  leaveStatLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, marginTop: 2 },
  leaveCard: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  leaveCardAccent: { width: 4 },
  leaveCardBody: { flex: 1, padding: Spacing[4], gap: Spacing[2] },
  leaveCardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  leaveDate: { flex: 1, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  leaveReason: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  leaveNotes: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  leaveActions: { flexDirection: 'row', gap: Spacing[2], marginTop: Spacing[1] },
  leaveActionBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1], paddingVertical: Spacing[1], paddingHorizontal: Spacing[3], borderRadius: Radius.md, borderWidth: 1 },
  leaveActionText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs },
  leaveInfoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2], backgroundColor: '#FFF3E0', borderRadius: Radius.md, padding: Spacing[3], marginBottom: Spacing[1] },
  leaveInfoText: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.warning, lineHeight: 17 },
  payoutCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing[4], gap: Spacing[2], ...Shadow.sm },
  payoutTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  payoutPeriod: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  payoutMeta: { marginTop: 3 },
  payoutMetaText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  payoutRight: { alignItems: 'flex-end', gap: 4 },
  payoutAmt: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl },
  payoutBreakdown: { backgroundColor: Colors.neutral[50], borderRadius: Radius.md, padding: Spacing[3] },
  payoutBreakdownText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  payoutActions: { flexDirection: 'row', gap: Spacing[2] },
  payoutActionBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1], paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderRadius: Radius.md },
  payoutActionText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm },
  payoutNotes: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  payoutBonusHint: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 4 },
  emptyBlock: { alignItems: 'center', paddingTop: 50, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  emptySub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 260 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: Spacing[4] },
  modal: { width: '100%', maxHeight: '92%', backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[5], gap: Spacing[3] },
  modalWeb: { maxWidth: 520 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  fieldGroup: { gap: Spacing[1], marginBottom: Spacing[3] },
  fieldRowHoriz: { flexDirection: 'row', gap: Spacing[3] },
  fieldLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary, backgroundColor: Colors.neutral[50] },
  textarea: { minHeight: 64, textAlignVertical: 'top' },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], backgroundColor: Colors.neutral[50] },
  pickerValue: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  pickerDropdown: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.white, marginTop: 2, overflow: 'hidden', zIndex: 100 },
  pickerOption: { paddingVertical: Spacing[3], paddingHorizontal: Spacing[4] },
  pickerOptionActive: { backgroundColor: Colors.primarySurface },
  pickerOptionText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  pickerOptionTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  totalBox: { borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], backgroundColor: Colors.primarySurface },
  totalText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.primary },
  modalFooter: { flexDirection: 'row', gap: Spacing[3] },
  cancelBtn: { flex: 1, paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  saveBtn: { flex: 2, paddingVertical: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  saveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
  infoCardSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginBottom: Spacing[3], lineHeight: 17 },
  zoneList: { gap: Spacing[2], marginBottom: Spacing[4] },
  zoneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.neutral[50] },
  zoneInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flex: 1 },
  zoneName: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  zoneRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  zonePriorityBadge: { paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.full },
  zonePriorityText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10 },
  zoneAddLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: Spacing[3], marginBottom: Spacing[2] },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.neutral[50], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], marginBottom: Spacing[2] },
  zoneSearchInput: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, outlineStyle: 'none' } as any,
  zoneAddList: { gap: Spacing[1] },
  zoneAddRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  zoneAddName: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, flex: 1 },
  zoneAddBtns: { flexDirection: 'row', gap: Spacing[1] },
  zoneAddBtn: { paddingVertical: Spacing[1], paddingHorizontal: Spacing[2], borderRadius: Radius.sm },
  zoneAddBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10 },
  assignSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[2] },
  viewAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAllText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.primary },
  emptyAssignText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, paddingVertical: Spacing[2] },
});
