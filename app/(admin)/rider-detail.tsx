import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, Modal, TextInput, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Bike, Phone, MapPin, Package, CreditCard, Calendar, CircleCheck as CheckCircle, Circle as XCircle, Clock, Plus, X, Truck, Star, ChevronDown, ChevronRight, Pencil, CircleAlert as AlertCircle, Users, ChartBar as BarChart3, IndianRupee, BedDouble } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import StatusChip from '@/components/ui/StatusChip';

type Tab = 'overview' | 'assignments' | 'attendance' | 'payouts' | 'leave';

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

const LEAVE_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Pending',  color: Colors.warning,      bg: '#FFF3E0' },
  approved: { label: 'Approved', color: Colors.success,      bg: '#E8F5E9' },
  rejected: { label: 'Rejected', color: Colors.error,        bg: '#FFEBEE' },
};

const PAYOUT_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft:    { label: 'Draft',    color: Colors.textTertiary, bg: Colors.neutral[100] },
  approved: { label: 'Approved', color: Colors.accentDark,   bg: Colors.accentSurface },
  paid:     { label: 'Paid',     color: Colors.success,      bg: '#E8F5E9' },
};

export default function RiderDetailScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile: adminProfile } = useAuthStore();

  const [rider, setRider] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [showAttModal, setShowAttModal] = useState(false);
  const [attForm, setAttForm] = useState({ date: format(new Date(), 'yyyy-MM-dd'), status: 'present', notes: '', check_in: '', check_out: '' });
  const [savingAtt, setSavingAtt] = useState(false);
  const [attStatusPicker, setAttStatusPicker] = useState(false);

  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutForm, setPayoutForm] = useState({ period_start: format(startOfMonth(new Date()), 'yyyy-MM-dd'), period_end: format(endOfMonth(new Date()), 'yyyy-MM-dd'), base_amount: '', delivery_bonus: '', deductions: '', notes: '', payment_method: 'upi' });
  const [savingPayout, setSavingPayout] = useState(false);
  const [pmPicker, setPmPicker] = useState(false);

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leave_date: format(new Date(), 'yyyy-MM-dd'), reason: '', notes: '' });
  const [savingLeave, setSavingLeave] = useState(false);

  const load = useCallback(async () => {
    try {
      const [riderRes, assignRes, attRes, payoutRes, leaveRes] = await Promise.all([
        supabase.from('riders').select('*').eq('id', id).maybeSingle(),
        supabase.from('rider_order_assignments').select('*, order:orders(id, scheduled_date, status, user:profiles(full_name, mobile))').eq('rider_id', id).order('assigned_at', { ascending: false }).limit(50),
        supabase.from('rider_attendance').select('*').eq('rider_id', id).order('date', { ascending: false }).limit(60),
        supabase.from('rider_payouts').select('*').eq('rider_id', id).order('created_at', { ascending: false }),
        supabase.from('rider_leave_requests').select('*').eq('rider_id', id).order('leave_date', { ascending: false }),
      ]);
      if (riderRes.data) setRider(riderRes.data);
      setAssignments(assignRes.data ?? []);
      setAttendance(attRes.data ?? []);
      setPayouts(payoutRes.data ?? []);
      setLeaveRequests(leaveRes.data ?? []);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

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

  const savePayout = async () => {
    setSavingPayout(true);
    const base = parseInt(payoutForm.base_amount) || 0;
    const bonus = parseInt(payoutForm.delivery_bonus) || 0;
    const deductions = parseInt(payoutForm.deductions) || 0;
    const final = base + bonus - deductions;
    await supabase.from('rider_payouts').insert({
      rider_id: id,
      period_start: payoutForm.period_start,
      period_end: payoutForm.period_end,
      total_deliveries: assignments.filter(a => a.status === 'delivered').length,
      total_days_worked: attendance.filter(a => a.status === 'present' || a.status === 'half_day').length,
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
      reason: leaveForm.reason.trim() || null,
      notes: leaveForm.notes.trim() || null,
      status: 'approved',
      requested_by: adminProfile?.id,
    });
    await supabase.from('rider_attendance').upsert({
      rider_id: id,
      date: leaveForm.leave_date,
      status: 'leave',
      notes: leaveForm.reason.trim() || 'Leave',
      recorded_by: adminProfile?.id,
    }, { onConflict: 'rider_id,date' });
    setSavingLeave(false);
    setShowLeaveModal(false);
    load();
  };

  const updateLeaveStatus = async (leave: any, status: string) => {
    await supabase.from('rider_leave_requests').update({ status, updated_at: new Date().toISOString() }).eq('id', leave.id);
    if (status === 'approved') {
      await supabase.from('rider_attendance').upsert({
        rider_id: id,
        date: leave.leave_date,
        status: 'leave',
        notes: leave.reason || 'Leave approved',
        recorded_by: adminProfile?.id,
      }, { onConflict: 'rider_id,date' });
    }
    load();
  };

  const deleteLeave = async (leaveId: string) => {
    await supabase.from('rider_leave_requests').delete().eq('id', leaveId);
    load();
  };

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  const totalDeliveries = assignments.filter(a => a.status === 'delivered').length;
  const totalFailed = assignments.filter(a => a.status === 'failed').length;
  const successRate = assignments.length > 0 ? Math.round(totalDeliveries / assignments.length * 100) : 0;
  const presentDays = attendance.filter(a => a.status === 'present').length;
  const halfDays = attendance.filter(a => a.status === 'half_day').length;
  const totalPaid = payouts.filter(p => p.status === 'paid').reduce((s, p) => s + p.final_amount, 0);
  const approvedLeaves = leaveRequests.filter(l => l.status === 'approved').length;
  const pendingLeaves = leaveRequests.filter(l => l.status === 'pending').length;

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
    { key: 'overview',    label: 'Overview' },
    { key: 'assignments', label: 'Deliveries', count: assignments.length },
    { key: 'attendance',  label: 'Attendance', count: attendance.length },
    { key: 'payouts',     label: 'Payouts',    count: payouts.length },
    { key: 'leave',       label: 'Leave',      count: leaveRequests.length },
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
        <TouchableOpacity style={s.assignBtn} onPress={() => router.push({ pathname: '/(admin)/rider-assignments' as any, params: { rider_id: id, rider_name: rider.full_name } })} activeOpacity={0.8}>
          <Truck size={15} color={Colors.primary} strokeWidth={1.8} />
          <Text style={s.assignBtnText}>Assign</Text>
        </TouchableOpacity>
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
          </>
        )}

        {/* ASSIGNMENTS / DELIVERIES */}
        {activeTab === 'assignments' && (
          <>
            <View style={[s.assignStats, isWeb && s.assignStatsWeb]}>
              <View style={s.assignStat}><Text style={[s.assignStatVal, { color: Colors.success }]}>{totalDeliveries}</Text><Text style={s.assignStatLabel}>Delivered</Text></View>
              <View style={s.assignStat}><Text style={[s.assignStatVal, { color: Colors.error }]}>{totalFailed}</Text><Text style={s.assignStatLabel}>Failed</Text></View>
              <View style={s.assignStat}><Text style={[s.assignStatVal, { color: Colors.warning }]}>{assignments.filter(a => ['assigned', 'accepted', 'picked_up'].includes(a.status)).length}</Text><Text style={s.assignStatLabel}>In Progress</Text></View>
              <View style={s.assignStat}><Text style={[s.assignStatVal, { color: Colors.primary }]}>{successRate}%</Text><Text style={s.assignStatLabel}>Success</Text></View>
            </View>
            {assignments.length === 0 ? (
              <EmptyBlock icon={<Truck size={32} color={Colors.textDisabled} strokeWidth={1.2} />} title="No assignments yet" sub="Assign orders to this rider to see delivery history." />
            ) : (
              assignments.map(a => {
                const cfg = ASSIGN_STATUS_CONFIG[a.status] ?? ASSIGN_STATUS_CONFIG.assigned;
                return (
                  <TouchableOpacity key={a.id} style={s.assignCard} onPress={() => router.push({ pathname: '/(admin)/order-detail' as any, params: { id: a.order_id } })} activeOpacity={0.8}>
                    <View style={[s.assignStatusBar, { backgroundColor: cfg.color }]} />
                    <View style={s.assignBody}>
                      <View style={s.assignTop}>
                        <Text style={s.assignOrderId}>Order #{a.order_id.slice(-8).toUpperCase()}</Text>
                        <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                          <Text style={[s.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                      </View>
                      {a.order?.user && <Text style={s.assignCustomer}>{a.order.user.full_name ?? a.order.user.mobile}</Text>}
                      <View style={s.assignMeta}>
                        <Calendar size={11} color={Colors.textTertiary} strokeWidth={1.8} />
                        <Text style={s.assignDate}>{format(new Date(a.assigned_at), 'dd MMM · HH:mm')}</Text>
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
            )}
          </>
        )}

        {/* ATTENDANCE */}
        {activeTab === 'attendance' && (
          <>
            <TouchableOpacity style={s.addBtn} onPress={() => { setAttForm({ date: format(new Date(), 'yyyy-MM-dd'), status: 'present', notes: '', check_in: '', check_out: '' }); setShowAttModal(true); }} activeOpacity={0.8}>
              <Plus size={15} color={Colors.white} strokeWidth={2} />
              <Text style={s.addBtnText}>Mark Attendance</Text>
            </TouchableOpacity>
            <View style={[s.attStats, isWeb && s.attStatsWeb]}>
              {(['present', 'absent', 'half_day', 'leave'] as const).map(st => {
                const cfg = ATTENDANCE_CONFIG[st];
                const count = attendance.filter(a => a.status === st).length;
                return (
                  <View key={st} style={[s.attStat, { backgroundColor: cfg.bg }]}>
                    <Text style={[s.attStatVal, { color: cfg.color }]}>{count}</Text>
                    <Text style={[s.attStatLabel, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                );
              })}
            </View>
            {attendance.length === 0 ? (
              <EmptyBlock icon={<Calendar size={32} color={Colors.textDisabled} strokeWidth={1.2} />} title="No attendance records" sub="Start marking attendance for this rider." />
            ) : (
              attendance.map(a => {
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
        )}

        {/* PAYOUTS */}
        {activeTab === 'payouts' && (
          <>
            <TouchableOpacity style={s.addBtn} onPress={() => { setPayoutForm({ period_start: format(startOfMonth(new Date()), 'yyyy-MM-dd'), period_end: format(endOfMonth(new Date()), 'yyyy-MM-dd'), base_amount: String(rider.daily_rate * presentDays), delivery_bonus: String(rider.per_delivery_rate * totalDeliveries), deductions: '0', notes: '', payment_method: 'upi' }); setShowPayoutModal(true); }} activeOpacity={0.8}>
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

        {/* LEAVE */}
        {activeTab === 'leave' && (
          <>
            <TouchableOpacity style={s.addBtn} onPress={() => { setLeaveForm({ leave_date: format(new Date(), 'yyyy-MM-dd'), reason: '', notes: '' }); setShowLeaveModal(true); }} activeOpacity={0.8}>
              <Plus size={15} color={Colors.white} strokeWidth={2} />
              <Text style={s.addBtnText}>Mark Leave</Text>
            </TouchableOpacity>

            <View style={[s.leaveStats, isWeb && s.leaveStatsWeb]}>
              <View style={[s.leaveStat, { backgroundColor: '#E8F5E9' }]}>
                <Text style={[s.leaveStatVal, { color: Colors.success }]}>{approvedLeaves}</Text>
                <Text style={[s.leaveStatLabel, { color: Colors.success }]}>Approved</Text>
              </View>
              <View style={[s.leaveStat, { backgroundColor: '#FFF3E0' }]}>
                <Text style={[s.leaveStatVal, { color: Colors.warning }]}>{pendingLeaves}</Text>
                <Text style={[s.leaveStatLabel, { color: Colors.warning }]}>Pending</Text>
              </View>
              <View style={[s.leaveStat, { backgroundColor: '#FFEBEE' }]}>
                <Text style={[s.leaveStatVal, { color: Colors.error }]}>{leaveRequests.filter(l => l.status === 'rejected').length}</Text>
                <Text style={[s.leaveStatLabel, { color: Colors.error }]}>Rejected</Text>
              </View>
            </View>

            {leaveRequests.length === 0 ? (
              <EmptyBlock icon={<BedDouble size={32} color={Colors.textDisabled} strokeWidth={1.2} />} title="No leave records" sub="Mark leave days for this rider to track absences." />
            ) : (
              leaveRequests.map(lr => {
                const cfg = LEAVE_STATUS_CONFIG[lr.status] ?? LEAVE_STATUS_CONFIG.pending;
                return (
                  <View key={lr.id} style={s.leaveCard}>
                    <View style={[s.leaveCardAccent, { backgroundColor: cfg.color }]} />
                    <View style={s.leaveCardBody}>
                      <View style={s.leaveCardTop}>
                        <Text style={s.leaveDate}>{format(new Date(lr.leave_date + 'T00:00:00'), 'EEEE, dd MMM yyyy')}</Text>
                        <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                          <Text style={[s.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                      </View>
                      {lr.reason ? <Text style={s.leaveReason}>{lr.reason}</Text> : null}
                      {lr.notes ? <Text style={s.leaveNotes}>{lr.notes}</Text> : null}
                      <View style={s.leaveActions}>
                        {lr.status === 'pending' && (
                          <>
                            <TouchableOpacity style={[s.leaveActionBtn, { backgroundColor: '#E8F5E9', borderColor: Colors.success + '40' }]} onPress={() => updateLeaveStatus(lr, 'approved')}>
                              <CheckCircle size={13} color={Colors.success} strokeWidth={2} />
                              <Text style={[s.leaveActionText, { color: Colors.success }]}>Approve</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.leaveActionBtn, { backgroundColor: '#FFEBEE', borderColor: Colors.error + '40' }]} onPress={() => updateLeaveStatus(lr, 'rejected')}>
                              <XCircle size={13} color={Colors.error} strokeWidth={2} />
                              <Text style={[s.leaveActionText, { color: Colors.error }]}>Reject</Text>
                            </TouchableOpacity>
                          </>
                        )}
                        <TouchableOpacity style={[s.leaveActionBtn, { backgroundColor: Colors.neutral[100], borderColor: Colors.border }]} onPress={() => deleteLeave(lr.id)}>
                          <Text style={[s.leaveActionText, { color: Colors.textTertiary }]}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
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
              <View style={s.fieldRowHoriz}>
                <ModalField label="Period Start" value={payoutForm.period_start} onChange={v => setPayoutForm(p => ({ ...p, period_start: v }))} placeholder="2026-04-01" flex={1} />
                <ModalField label="Period End" value={payoutForm.period_end} onChange={v => setPayoutForm(p => ({ ...p, period_end: v }))} placeholder="2026-04-30" flex={1} />
              </View>
              <View style={s.fieldRowHoriz}>
                <ModalField label="Base Amount (₹)" value={payoutForm.base_amount} onChange={v => setPayoutForm(p => ({ ...p, base_amount: v }))} placeholder="0" keyboardType="numeric" flex={1} />
                <ModalField label="Delivery Bonus (₹)" value={payoutForm.delivery_bonus} onChange={v => setPayoutForm(p => ({ ...p, delivery_bonus: v }))} placeholder="0" keyboardType="numeric" flex={1} />
              </View>
              <View style={s.fieldRowHoriz}>
                <ModalField label="Deductions (₹)" value={payoutForm.deductions} onChange={v => setPayoutForm(p => ({ ...p, deductions: v }))} placeholder="0" keyboardType="numeric" flex={1} />
                <View style={[s.fieldGroup, { flex: 1, justifyContent: 'flex-end' }]}>
                  <Text style={s.fieldLabel}>Total</Text>
                  <View style={s.totalBox}>
                    <Text style={s.totalText}>{fmt((parseInt(payoutForm.base_amount) || 0) + (parseInt(payoutForm.delivery_bonus) || 0) - (parseInt(payoutForm.deductions) || 0))}</Text>
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
              <ModalField label="Leave Date (YYYY-MM-DD)" value={leaveForm.leave_date} onChange={v => setLeaveForm(p => ({ ...p, leave_date: v }))} placeholder="2026-04-01" />
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
  tabScroll: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, maxHeight: 48, flexGrow: 0 },
  tabScrollContent: { flexDirection: 'row', paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], gap: Spacing[2] },
  tabScrollContentWeb: { paddingHorizontal: Spacing[8] },
  tab: { paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
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
  assignStatsWeb: {},
  assignStat: { flex: 1, alignItems: 'center', paddingVertical: Spacing[3], borderRightWidth: 1, borderRightColor: Colors.divider },
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
  assignFee: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.success },
  assignDist: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  failReason: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.error, marginTop: 2 },
  swapNote: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.warning, marginTop: 2 },
  statusBadge: { paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.full },
  statusBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  attStats: { flexDirection: 'row', gap: Spacing[3] },
  attStatsWeb: { gap: Spacing[4] },
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
});
