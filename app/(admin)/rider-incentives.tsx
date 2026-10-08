import React, { useEffect, useState, useCallback } from 'react';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, ActivityIndicator, RefreshControl,
  Switch, Image,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Award, Plus, Pencil, Trash2, Trophy, Bike, IndianRupee, Gift, RefreshCw, Camera, CheckCircle2, XCircle, MessageSquare, Flower2, Crown, Medal, Users, X } from 'lucide-react-native';
import { format } from 'date-fns';
import { getCurrentMonthIST, getMonthRangeIST } from '@/utils/riderPeriod';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import AppModal from '@/components/ui/Modal';

type IncentiveType = 'per_day' | 'per_month';
type BonusCategory = 'on_time_attendance' | 'on_time_delivery' | 'no_leave' | 'customer_feedback' | 'flower_quality' | 'custom';

const CATEGORY_LABELS: Record<string, string> = {
  on_time_attendance: 'On-Time Attendance',
  on_time_delivery: 'On-Time Delivery',
  no_leave: 'No-Leave',
  customer_feedback: 'Customer Feedback',
  flower_quality: 'Flower Quality',
  custom: 'Custom',
};

function timeToDate(time: string): Date {
  const date = new Date();
  const match = time.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return date;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function dateToTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function displayTime(time: string): string {
  return format(timeToDate(time), 'hh:mm a');
}

function fmt(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

const RANK_BADGES: Record<number, { label: string; color: string; bg: string; border: string }> = {
  1: { label: 'Gold', color: '#B77900', bg: '#FFF8E1', border: '#FFD166' },
  2: { label: 'Silver', color: '#607D8B', bg: '#ECEFF1', border: '#B0BEC5' },
  3: { label: 'Bronze', color: '#9A5635', bg: '#FBE9E7', border: '#E6A28B' },
};

interface Incentive {
  id: string;
  name: string;
  amount: number;
  type: IncentiveType;
  time: string | null;
  is_active: boolean;
  created_at: string;
  bonus_category: BonusCategory | null;
  evaluation_basis: IncentiveType | null;
  cutoff_time: string | null;
  min_deliveries: number | null;
  min_present_days: number | null;
  max_absent_days: number | null;
}

interface RiderEval {
  incentive_id: string;
  status: string;
  earned_amount: number;
}

interface RiderPerf {
  id: string;
  full_name: string;
  mobile: string;
  zone: string;
  is_active: boolean;
  profile_photo_url: string | null;
  deliveries: number;
  present: number;
  absent: number;
  on_time_attendance: number;
  on_time_delivery: number;
  evaluations: RiderEval[];
  qualified_amount: number;
  rank_position: number;
  rank_score: number;
}

interface QualityReport {
  id: string;
  rider_id: string;
  rider_name: string;
  photo_url: string | null;
  signed_url: string | null;
  notes: string;
  status: string;
  created_at: string;
}

interface FeedbackEntry {
  id: string;
  rider_id: string;
  rating: string;
  notes: string;
}

export default function RiderIncentivesScreen() {
  return (
    <ModuleGuard module="riders">
      <RiderIncentivesScreenContent />
    </ModuleGuard>
  );
}

function RiderIncentivesScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { profile: adminProfile } = useAuthStore();

  const [incentives, setIncentives] = useState<Incentive[]>([]);
  const [riders, setRiders] = useState<RiderPerf[]>([]);
  const [qualityReports, setQualityReports] = useState<QualityReport[]>([]);
  const [feedbackMap, setFeedbackMap] = useState<Map<string, FeedbackEntry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcMessage, setRecalcMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'incentives' | 'performance' | 'quality' | 'referral'>('incentives');

  const [referralConfig, setReferralConfig] = useState<{ id: string; title: string; reward_amount: number; required_completion_days: number; is_active: boolean } | null>(null);
  const [referralForm, setReferralForm] = useState({ title: '', reward_amount: '', required_completion_days: '', is_active: true });
  const [savingReferral, setSavingReferral] = useState(false);
  const [referralSaved, setReferralSaved] = useState(false);
  const [adminReferrals, setAdminReferrals] = useState<any[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [incentiveToDelete, setIncentiveToDelete] = useState<Incentive | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState<Incentive | null>(null);
  const [form, setForm] = useState({
    name: '',
    amount: '',
    type: 'per_day' as IncentiveType,
    time: '',
    is_active: true,
    bonus_category: 'custom' as BonusCategory,
    cutoff_time: '',
    min_deliveries: '',
    min_present_days: '',
    max_absent_days: '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showCutoffPicker, setShowCutoffPicker] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const currentMonth = getCurrentMonthIST();

  const load = useCallback(async () => {
    try {
      const [refRes, incRes, ridersRes, allReferralsRes] = await Promise.all([
        supabase.from('referral_config').select('*').order('created_at').limit(1).maybeSingle() as any,
        supabase.from('rider_incentives').select('*').order('created_at', { ascending: false }),
        supabase.from('riders').select('id, full_name, mobile, zone, is_active, profile_photo_url').eq('is_active', true).order('full_name'),
        supabase.from('rider_referrals').select('id, referrer_rider_id, referred_mobile, referred_name, status, approval_status, completed_delivery_days, required_delivery_days, reward_amount, approved_at, created_at').order('created_at', { ascending: false }),
      ]);

      const referrerIds = Array.from(new Set((allReferralsRes.data ?? []).map((r: any) => r.referrer_rider_id).filter(Boolean))) as string[];
      let referrerNameMap = new Map<string, string>();
      if (referrerIds.length > 0) {
        const { data: referrerRiders } = await supabase.from('riders').select('id, full_name').in('id', referrerIds);
        (referrerRiders ?? []).forEach((r: any) => referrerNameMap.set(r.id, r.full_name));
      }
      setAdminReferrals((allReferralsRes.data ?? []).map((r: any) => ({
        ...r,
        referrer_name: referrerNameMap.get(r.referrer_rider_id) ?? 'Unknown',
      })));

      const ref = refRes.data as any;
      if (ref) {
        setReferralConfig(ref);
        setReferralForm({ title: ref.title, reward_amount: String(ref.reward_amount), required_completion_days: String(ref.required_completion_days), is_active: ref.is_active });
      }

      const incData = (incRes.data ?? []) as Incentive[];
      setIncentives(incData);

      const riderData = (ridersRes.data ?? []) as any[];
      if (riderData.length === 0) {
        setRiders([]);
        return;
      }

      const { monthStart, nextMonth, monthStartISO, nextMonthISO } = getMonthRangeIST(currentMonth);

      const riderIds = riderData.map((r) => r.id);

      const [delivRes, attendRes, evalRes, rankRes, qualityRes, feedbackRes] = await Promise.all([
        supabase
          .from('rider_order_assignments')
          .select('rider_id')
          .in('rider_id', riderIds)
          .eq('status', 'delivered')
          .gte('delivered_at', monthStartISO)
          .lt('delivered_at', nextMonthISO),
        supabase
          .from('rider_attendance')
          .select('rider_id, status')
          .in('rider_id', riderIds)
          .gte('date', monthStart)
          .lt('date', nextMonth),
        supabase
          .from('rider_incentive_evaluations')
          .select('id, rider_id, incentive_id, status, earned_amount')
          .in('rider_id', riderIds)
          .eq('month', currentMonth),
        supabase
          .from('rider_monthly_rankings')
          .select('rider_id, rank_position, score, total_earned, deliveries, present_days, absent_days, on_time_attendance_days, on_time_delivery_days')
          .in('rider_id', riderIds)
          .eq('month', currentMonth),
        supabase
          .from('rider_quality_reports')
          .select('id, rider_id, photo_url, notes, status, created_at')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('rider_customer_feedback')
          .select('id, rider_id, rating, notes')
          .eq('month', currentMonth),
      ]);

      const deliveryMap = new Map<string, number>();
      (delivRes.data ?? []).forEach((d: any) => {
        deliveryMap.set(d.rider_id, (deliveryMap.get(d.rider_id) ?? 0) + 1);
      });

      const presentMap = new Map<string, number>();
      const absentMap = new Map<string, number>();
      (attendRes.data ?? []).forEach((a: any) => {
        if (a.status === 'present') presentMap.set(a.rider_id, (presentMap.get(a.rider_id) ?? 0) + 1);
        if (a.status === 'absent') absentMap.set(a.rider_id, (absentMap.get(a.rider_id) ?? 0) + 1);
      });

      const evalMap = new Map<string, RiderEval[]>();
      (evalRes.data ?? []).forEach((e: any) => {
        if (!evalMap.has(e.rider_id)) evalMap.set(e.rider_id, []);
        evalMap.get(e.rider_id)!.push({
          incentive_id: e.incentive_id,
          status: e.status,
          earned_amount: Number(e.earned_amount ?? 0),
        });
      });

      const rankMap = new Map<string, { rank_position: number; score: number; total_earned: number; deliveries: number; present_days: number; absent_days: number; on_time_attendance_days: number; on_time_delivery_days: number }>();
      (rankRes.data ?? []).forEach((r: any) => {
        rankMap.set(r.rider_id, {
          rank_position: r.rank_position,
          score: Number(r.score),
          total_earned: Number(r.total_earned ?? 0),
          deliveries: Number(r.deliveries ?? 0),
          present_days: Number(r.present_days ?? 0),
          absent_days: Number(r.absent_days ?? 0),
          on_time_attendance_days: Number(r.on_time_attendance_days ?? 0),
          on_time_delivery_days: Number(r.on_time_delivery_days ?? 0),
        });
      });

      const riderNameMap = new Map<string, string>();
      riderData.forEach((r: any) => riderNameMap.set(r.id, r.full_name));

      const rawReports = (qualityRes.data ?? []) as any[];
      const photoPaths = rawReports.map((q) => q.photo_url).filter(Boolean) as string[];
      const signedMap = new Map<string, string>();
      if (photoPaths.length > 0) {
        await Promise.all(photoPaths.map(async (path) => {
          if (path.startsWith('http')) { signedMap.set(path, path); return; }
          const { data } = await supabase.storage.from('riders').createSignedUrl(path, 3600);
          if (data?.signedUrl) signedMap.set(path, data.signedUrl);
        }));
      }
      const qReports: QualityReport[] = rawReports.map((q: any) => ({
        id: q.id,
        rider_id: q.rider_id,
        rider_name: riderNameMap.get(q.rider_id) ?? 'Unknown',
        photo_url: q.photo_url,
        signed_url: q.photo_url ? (signedMap.get(q.photo_url) ?? null) : null,
        notes: q.notes,
        status: q.status,
        created_at: q.created_at,
      }));
      setQualityReports(qReports);

      const fbMap = new Map<string, FeedbackEntry>();
      (feedbackRes.data ?? []).forEach((f: any) => {
        fbMap.set(f.rider_id, { id: f.id, rider_id: f.rider_id, rating: f.rating, notes: f.notes });
      });
      setFeedbackMap(fbMap);

      const activeIncentives = incData.filter((i) => i.is_active);

      const perf: RiderPerf[] = riderData.map((r: any) => {
        const riderEvals = evalMap.get(r.id) ?? [];
        const rankInfo = rankMap.get(r.id);
        const qualifiedAmount = rankInfo?.total_earned ?? 0;
        return {
          id: r.id,
          full_name: r.full_name,
          mobile: r.mobile,
          zone: r.zone,
          is_active: r.is_active,
          profile_photo_url: r.profile_photo_url,
          deliveries: rankInfo?.deliveries ?? deliveryMap.get(r.id) ?? 0,
          present: rankInfo?.present_days ?? presentMap.get(r.id) ?? 0,
          absent: rankInfo?.absent_days ?? absentMap.get(r.id) ?? 0,
          on_time_attendance: rankInfo?.on_time_attendance_days ?? 0,
          on_time_delivery: rankInfo?.on_time_delivery_days ?? 0,
          evaluations: riderEvals,
          qualified_amount: qualifiedAmount,
          rank_position: rankInfo?.rank_position ?? 0,
          rank_score: rankInfo?.score ?? 0,
        };
      });

      perf.sort((a, b) => b.rank_score - a.rank_score);
      setRiders(perf);
    } catch (e) {
      console.error('incentives load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentMonth]);

  usePageVisibility(load);

  const recalculate = async () => {
    setRecalculating(true);
    setRecalcMessage(null);
    try {
      const { error } = await supabase.rpc('calculate_rider_rankings', { p_month: currentMonth });
      if (error) {
        setRecalcMessage({ type: 'error', text: `Recalculation failed: ${error.message}` });
        return;
      }
      await load();
      setRecalcMessage({ type: 'success', text: 'Rankings recalculated successfully.' });
    } catch (e: any) {
      setRecalcMessage({ type: 'error', text: `Recalculation failed: ${e?.message ?? 'Unknown error'}` });
    } finally {
      setRecalculating(false);
    }
  };

  const openAdd = () => {
    setShowTimePicker(false);
    setShowCutoffPicker(false);
    setEditing(null);
    setForm({ name: '', amount: '', type: 'per_day', time: '', is_active: true, bonus_category: 'custom', cutoff_time: '', min_deliveries: '', min_present_days: '', max_absent_days: '' });
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (inc: Incentive) => {
    setShowTimePicker(false);
    setShowCutoffPicker(false);
    setEditing(inc);
    setForm({
      name: inc.name,
      amount: String(inc.amount),
      type: inc.type,
      time: inc.time ?? '',
      is_active: inc.is_active,
      bonus_category: inc.bonus_category ?? 'custom',
      cutoff_time: inc.cutoff_time ?? '',
      min_deliveries: inc.min_deliveries != null ? String(inc.min_deliveries) : '',
      min_present_days: inc.min_present_days != null ? String(inc.min_present_days) : '',
      max_absent_days: inc.max_absent_days != null ? String(inc.max_absent_days) : '',
    });
    setFormError('');
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setFormError('Incentive name is required');
      return;
    }
    setSaving(true);
    const payload: any = {
      name: form.name.trim(),
      amount: parseFloat(form.amount) || 0,
      type: form.type,
      time: form.time.trim() || null,
      is_active: form.is_active,
      bonus_category: form.bonus_category,
      evaluation_basis: form.type,
      cutoff_time: form.cutoff_time.trim() || null,
      min_deliveries: form.min_deliveries ? parseInt(form.min_deliveries) : null,
      min_present_days: form.min_present_days ? parseInt(form.min_present_days) : null,
      max_absent_days: form.max_absent_days ? parseInt(form.max_absent_days) : null,
    };
    if (editing) {
      await supabase.from('rider_incentives').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('rider_incentives').insert(payload);
    }
    setSaving(false);
    setShowTimePicker(false);
    setShowCutoffPicker(false);
    setShowModal(false);
    load();
  };

  const requestDelete = (inc: Incentive) => {
    setIncentiveToDelete(inc);
    setShowDeleteModal(true);
  };

  const deleteIncentive = async () => {
    if (!incentiveToDelete) return;
    setDeleting(true);
    const { error } = await supabase.from('rider_incentives').delete().eq('id', incentiveToDelete.id);
    setDeleting(false);
    if (error) {
      console.error('delete incentive error', error);
      return;
    }
    setShowDeleteModal(false);
    setIncentiveToDelete(null);
    load();
  }; 

  const saveReferral = async () => {
    setSavingReferral(true);
    setReferralSaved(false);
    const payload = {
      title: referralForm.title.trim() || 'Refer a Rider & Earn',
      reward_amount: parseFloat(referralForm.reward_amount) || 0,
      required_completion_days: parseInt(referralForm.required_completion_days) || 30,
      is_active: referralForm.is_active,
    };
    if (referralConfig) {
      await supabase.from('referral_config').update(payload).eq('id', referralConfig.id);
    } else {
      await supabase.from('referral_config').insert(payload);
    }
    setSavingReferral(false);
    setReferralSaved(true);
    load();
  };

  const toggleFeedback = async (riderId: string) => {
    const existing = feedbackMap.get(riderId);
    if (existing) {
      await supabase.from('rider_customer_feedback').delete().eq('id', existing.id);
    } else {
      await supabase.from('rider_customer_feedback').insert({
        rider_id: riderId,
        month: currentMonth,
        rating: 'positive',
        notes: 'Approved by admin',
        awarded_by: adminProfile?.id,
      });
    }
    load();
  };

  const reviewQualityReport = async (reportId: string) => {
    await supabase.from('rider_quality_reports')
      .update({ status: 'reviewed', reviewed_by: adminProfile?.id })
      .eq('id', reportId);
    load();
  };

  const approveReferral = async (referralId: string) => {
    await supabase.rpc('approve_rider_referral', { p_referral_id: referralId });
    load();
  };

  const rejectReferral = async (referralId: string) => {
    await supabase.rpc('reject_rider_referral', { p_referral_id: referralId });
    load();
  };

  const bestPerformer = riders.find((r) => r.rank_position === 1 && r.rank_score > 0) ?? null;
  const activeIncentives = incentives.filter((i) => i.is_active);

  return (
    <View style={s.container}>
      <View style={[s.header, isWeb && s.headerWeb]}>
        <View style={s.headerLeft}>
          <View style={s.headerIcon}>
            <Award size={20} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>Rider Incentives</Text>
            <Text style={s.subtitle}>Manage bonus rules, performance & rankings</Text>
          </View>
        </View>
        {activeTab === 'performance' && (
          <TouchableOpacity
            style={[s.recalcBtn, recalculating && s.recalcBtnDisabled]}
            onPress={recalculate}
            disabled={recalculating}
            activeOpacity={0.8}
          >
            {recalculating
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <RefreshCw size={14} color={Colors.white} strokeWidth={2} />}
            <Text style={s.recalcBtnText}>{recalculating ? 'Calculating...' : 'Recalculate'}</Text>
          </TouchableOpacity>
        )}
        {activeTab === 'incentives' && (
          <TouchableOpacity style={s.addBtn} onPress={openAdd} activeOpacity={0.8}>
            <Plus size={16} color={Colors.white} strokeWidth={2} />
            <Text style={s.addBtnText}>Add Incentive</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal style={s.tabScroll} contentContainerStyle={s.tabScrollContent} showsHorizontalScrollIndicator={false}>
        <TouchableOpacity style={[s.tab, activeTab === 'incentives' && s.tabActive]} onPress={() => setActiveTab('incentives')}>
          <Award size={14} color={activeTab === 'incentives' ? Colors.primary : Colors.textTertiary} strokeWidth={1.8} />
          <Text style={[s.tabText, activeTab === 'incentives' && s.tabTextActive]}>Incentive Plans</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, activeTab === 'performance' && s.tabActive]} onPress={() => setActiveTab('performance')}>
          <Trophy size={14} color={activeTab === 'performance' ? Colors.primary : Colors.textTertiary} strokeWidth={1.8} />
          <Text style={[s.tabText, activeTab === 'performance' && s.tabTextActive]}>Performance & Ranking</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, activeTab === 'quality' && s.tabActive]} onPress={() => setActiveTab('quality')}>
          <Flower2 size={14} color={activeTab === 'quality' ? Colors.primary : Colors.textTertiary} strokeWidth={1.8} />
          <Text style={[s.tabText, activeTab === 'quality' && s.tabTextActive]}>Quality Reports</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, activeTab === 'referral' && s.tabActive]} onPress={() => setActiveTab('referral')}>
          <Gift size={14} color={activeTab === 'referral' ? Colors.primary : Colors.textTertiary} strokeWidth={1.8} />
          <Text style={[s.tabText, activeTab === 'referral' && s.tabTextActive]}>Referral Settings</Text>
        </TouchableOpacity>
      </ScrollView>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
      ) : activeTab === 'incentives' ? (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.content, isWeb && s.contentWeb]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          {incentives.length === 0 ? (
            <View style={s.emptyState}>
              <Award size={40} color={Colors.textDisabled} strokeWidth={1.2} />
              <Text style={s.emptyTitle}>No incentives yet</Text>
              <Text style={s.emptySub}>Create incentive plans for your riders.</Text>
            </View>
          ) : (
            <View style={s.tableCard}>
              <View style={s.tableHead}>
                <Text style={[s.th, { flex: 2.5 }]}>Name</Text>
                <Text style={[s.th, { flex: 1.2 }]}>Amount</Text>
                <Text style={[s.th, { flex: 1.5 }]}>Category</Text>
                <Text style={[s.th, { flex: 1 }]}>Type</Text>
                <Text style={[s.th, { flex: 1 }]}>Cutoff</Text>
                <Text style={[s.th, { flex: 1 }]}>Status</Text>
                <Text style={[s.th, { width: 80, textAlign: 'right' }]}>Actions</Text>
              </View>
              {incentives.map((inc, idx) => (
                <View key={inc.id} style={[s.tableRow, idx % 2 === 1 && s.tableRowAlt]}>
                  <Text style={[s.td, { flex: 2.5, fontFamily: Typography.fontFamily.semiBold, color: Colors.textPrimary }]}>{inc.name}</Text>
                  <Text style={[s.td, { flex: 1.2 }]}>{fmt(Number(inc.amount))}</Text>
                  <Text style={[s.td, { flex: 1.5 }]}>{inc.bonus_category ? CATEGORY_LABELS[inc.bonus_category] ?? inc.bonus_category : '—'}</Text>
                  <Text style={[s.td, { flex: 1 }]}>{inc.type === 'per_day' ? 'Per Day' : 'Per Month'}</Text>
                  <Text style={[s.td, { flex: 1 }]}>{inc.cutoff_time ?? '—'}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={[s.statusBadge, inc.is_active ? s.statusActive : s.statusInactive]}>
                      <Text style={[s.statusText, inc.is_active ? s.statusTextActive : s.statusTextInactive]}>
                        {inc.is_active ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                  </View>
                  <View style={{ width: 80, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                    <TouchableOpacity onPress={() => openEdit(inc)} style={s.iconBtn}>
                      <Pencil size={14} color={Colors.textSecondary} strokeWidth={1.8} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => requestDelete(inc)} style={s.iconBtn}>
                      <Trash2 size={14} color={Colors.error} strokeWidth={1.8} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      ) : activeTab === 'performance' ? (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.content, isWeb && s.contentWeb]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          {recalcMessage && (
            <View style={[s.recalcBanner, recalcMessage.type === 'success' ? s.recalcBannerSuccess : s.recalcBannerError]}>
              {recalcMessage.type === 'success'
                ? <CheckCircle2 size={15} color={Colors.success} strokeWidth={2} />
                : <XCircle size={15} color={Colors.error} strokeWidth={2} />}
              <Text style={[s.recalcBannerText, recalcMessage.type === 'success' ? s.recalcBannerTextSuccess : s.recalcBannerTextError]}>
                {recalcMessage.text}
              </Text>
            </View>
          )}

          {bestPerformer ? (
            <View style={s.bestPerformerCard}>
              <View style={s.bestPerformerLeft}>
                <View style={s.trophyWrap}>
                  <Trophy size={20} color="#FFD700" strokeWidth={2} />
                </View>
                <View>
                  <Text style={s.bestPerformerLabel}>Best Performer of {format(new Date(), 'MMMM')}</Text>
                  <Text style={s.bestPerformerName}>{bestPerformer.full_name}</Text>
                  <Text style={s.bestPerformerStats}>
                    {bestPerformer.on_time_attendance} on-time attendance · {bestPerformer.on_time_delivery} on-time delivery · {bestPerformer.absent} absent
                  </Text>
                </View>
              </View>
              {bestPerformer.qualified_amount > 0 && (
                <View style={s.bestPerformerAmount}>
                  <Text style={s.bestPerformerAmountText}>{fmt(bestPerformer.qualified_amount)}</Text>
                  <Text style={s.bestPerformerAmountLabel}>Qualified</Text>
                </View>
              )}
            </View>
          ) : riders.length > 0 && !recalculating ? (
            <View style={s.noRankingBanner}>
              <Trophy size={18} color={Colors.textTertiary} strokeWidth={1.8} />
              <Text style={s.noRankingText}>Click "Recalculate" to compute rankings and reveal the best performer.</Text>
            </View>
          ) : null}

          {riders.length === 0 ? (
            <View style={s.emptyState}>
              <Bike size={40} color={Colors.textDisabled} strokeWidth={1.2} />
              <Text style={s.emptyTitle}>No riders found</Text>
            </View>
          ) : (
            riders.map((rider, idx) => (
              <View key={rider.id} style={[s.perfCard, idx % 2 === 1 && s.perfCardAlt]}>
                <View style={s.perfHeader}>
                  <View style={s.perfRiderInfo}>
                    <View style={[s.perfAvatar, { backgroundColor: rider.is_active ? Colors.primarySurface : Colors.neutral[100] }]}>
                      <Text style={[s.perfAvatarText, { color: rider.is_active ? Colors.primary : Colors.textTertiary }]}>
                        {rider.full_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View>
                      <View style={s.perfNameRow}>
                        <Text style={s.perfName}>{rider.full_name}</Text>
                        {rider.rank_position > 0 && RANK_BADGES[rider.rank_position] && (
                          <View style={[s.rankBadge, { backgroundColor: RANK_BADGES[rider.rank_position].bg, borderColor: RANK_BADGES[rider.rank_position].border }]}>
                            {rider.rank_position === 1
                              ? <Crown size={11} color={RANK_BADGES[rider.rank_position].color} strokeWidth={2.2} />
                              : <Medal size={11} color={RANK_BADGES[rider.rank_position].color} strokeWidth={2.2} />}
                            <Text style={[s.rankBadgeText, { color: RANK_BADGES[rider.rank_position].color }]}>
                              #{rider.rank_position} {RANK_BADGES[rider.rank_position].label}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.perfMeta}>
                        {rider.zone} zone · {rider.is_active ? 'Active' : 'Inactive'}
                        {rider.rank_position > 0 && ` · ${Math.round(rider.rank_score)} pts`}
                      </Text>
                    </View>
                  </View>
                  <View style={s.perfMetrics}>
                    <View style={s.perfMetric}>
                      <Text style={s.perfMetricValue}>{rider.on_time_delivery}</Text>
                      <Text style={s.perfMetricLabel}>On-Time Delivery</Text>
                    </View>
                    <View style={s.perfMetricDivider} />
                    <View style={s.perfMetric}>
                      <Text style={[s.perfMetricValue, { color: Colors.success }]}>{rider.on_time_attendance}</Text>
                      <Text style={s.perfMetricLabel}>On-Time Attendance</Text>
                    </View>
                    <View style={s.perfMetricDivider} />
                    <View style={s.perfMetric}>
                      <Text style={[s.perfMetricValue, { color: Colors.error }]}>{rider.absent}</Text>
                      <Text style={s.perfMetricLabel}>Absent</Text>
                    </View>
                  </View>
                </View>

                {activeIncentives.length > 0 && (
                  <View style={s.perfIncentivesSection}>
                    <Text style={s.perfIncentivesTitle}>Incentive Evaluation (Auto)</Text>
                    {activeIncentives.map((ai) => {
                      const evalData = rider.evaluations.find((e) => e.incentive_id === ai.id);
                      const status = evalData?.status ?? 'pending';
                      const earned = evalData?.earned_amount ?? 0;
                      return (
                        <View key={ai.id} style={s.perfIncentiveRow}>
                          <View style={s.perfIncentiveInfo}>
                            <Text style={s.perfIncentiveName}>{ai.name}</Text>
                            <Text style={s.perfIncentiveAmount}>
                              {fmt(Number(ai.amount))} · {ai.type === 'per_day' ? 'Per Day' : 'Per Month'}
                              {ai.cutoff_time && ` · before ${ai.cutoff_time}`}
                            </Text>
                          </View>
                          <View style={s.perfIncentiveActions}>
                            {status === 'passed' ? (
                              <View style={s.evalBadgePassed}>
                                <CheckCircle2 size={13} color={Colors.white} strokeWidth={2} />
                                <Text style={s.evalBadgePassedText}>
                                  Qualified{earned > 0 ? ` · ${fmt(earned)}` : ''}
                                </Text>
                              </View>
                            ) : status === 'failed' ? (
                              <View style={s.evalBadgeFailed}>
                                <XCircle size={13} color={Colors.white} strokeWidth={2} />
                                <Text style={s.evalBadgeFailedText}>Failed</Text>
                              </View>
                            ) : (
                              <View style={s.evalBadgePending}>
                                <Text style={s.evalBadgePendingText}>Pending</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })}

                    {/* Customer Feedback toggle */}
                    {activeIncentives.some((ai) => ai.bonus_category === 'customer_feedback') && (
                      <View style={s.feedbackRow}>
                        <View style={s.feedbackInfo}>
                          <MessageSquare size={14} color={Colors.textSecondary} strokeWidth={1.8} />
                          <Text style={s.feedbackLabel}>Customer Feedback (Admin Approval)</Text>
                        </View>
                        <TouchableOpacity
                          style={[s.feedbackToggle, feedbackMap.has(rider.id) && s.feedbackToggleActive]}
                          onPress={() => toggleFeedback(rider.id)}
                          activeOpacity={0.8}
                        >
                          <Text style={[s.feedbackToggleText, feedbackMap.has(rider.id) && s.feedbackToggleTextActive]}>
                            {feedbackMap.has(rider.id) ? 'Approved' : 'Approve'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {rider.qualified_amount > 0 && (
                      <View style={s.qualifiedBanner}>
                        <IndianRupee size={14} color={Colors.success} strokeWidth={2} />
                        <Text style={s.qualifiedText}>
                          Total earned: {fmt(rider.qualified_amount)}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      ) : activeTab === 'quality' ? (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.content, isWeb && s.contentWeb]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          {qualityReports.length === 0 ? (
            <View style={s.emptyState}>
              <Flower2 size={40} color={Colors.textDisabled} strokeWidth={1.2} />
              <Text style={s.emptyTitle}>No quality reports</Text>
              <Text style={s.emptySub}>Riders can report poor flower quality from their app.</Text>
            </View>
          ) : (
            qualityReports.map((report, idx) => (
              <View key={report.id} style={[s.qualityCard, idx % 2 === 1 && s.perfCardAlt]}>
                <View style={s.qualityHeader}>
                  <View style={s.qualityRiderInfo}>
                    <View style={s.perfAvatar}>
                      <Text style={[s.perfAvatarText, { color: Colors.primary }]}>
                        {report.rider_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View>
                      <Text style={s.perfName}>{report.rider_name}</Text>
                      <Text style={s.perfMeta}>{format(new Date(report.created_at), 'dd MMM, HH:mm')}</Text>
                    </View>
                  </View>
                  <View style={[s.statusBadge, report.status === 'reviewed' ? s.statusActive : s.statusInactive]}>
                    <Text style={[s.statusText, report.status === 'reviewed' ? s.statusTextActive : s.statusTextInactive]}>
                      {report.status === 'reviewed' ? 'Reviewed' : 'Pending'}
                    </Text>
                  </View>
                </View>
                {report.signed_url && (
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setPreviewImageUrl(report.signed_url)}>
                    <Image
                      source={{ uri: report.signed_url }}
                      style={s.qualityPhoto}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                )}
                {report.notes ? <Text style={s.qualityNotes}>{report.notes}</Text> : null}
                {report.status === 'pending' && (
                  <TouchableOpacity style={s.reviewBtn} onPress={() => reviewQualityReport(report.id)} activeOpacity={0.8}>
                    <CheckCircle2 size={14} color={Colors.white} strokeWidth={2} />
                    <Text style={s.reviewBtnText}>Mark Reviewed</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </ScrollView>
      ) : activeTab === 'referral' ? (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.content, isWeb && s.contentWeb]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          <View style={s.referralCard}>
            <View style={s.referralCardHeader}>
              <View style={s.referralIconWrap}>
                <Gift size={22} color={Colors.accent} strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.referralCardTitle}>Referral Programme</Text>
                <Text style={s.referralCardSub}>Configure how riders earn rewards for referring new riders</Text>
              </View>
            </View>
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Card Title</Text>
              <TextInput
                style={s.fieldInput}
                value={referralForm.title}
                onChangeText={(v) => setReferralForm({ ...referralForm, title: v })}
                placeholder="e.g. Refer a Rider & Earn"
                placeholderTextColor={Colors.textDisabled}
              />
            </View>
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Reward Amount (₹)</Text>
              <TextInput
                style={s.fieldInput}
                value={referralForm.reward_amount}
                onChangeText={(v) => setReferralForm({ ...referralForm, reward_amount: v })}
                placeholder="500"
                placeholderTextColor={Colors.textDisabled}
                keyboardType="numeric"
              />
            </View>
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Required Completion Days</Text>
              <TextInput
                style={s.fieldInput}
                value={referralForm.required_completion_days}
                onChangeText={(v) => setReferralForm({ ...referralForm, required_completion_days: v })}
                placeholder="30"
                placeholderTextColor={Colors.textDisabled}
                keyboardType="numeric"
              />
              <Text style={s.referralHint}>Referred rider must complete this many delivery days for reward to apply</Text>
            </View>
            <View style={[s.fieldGroup, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
              <Text style={s.fieldLabel}>Show referral card in Rider App</Text>
              <Switch
                value={referralForm.is_active}
                onValueChange={(v) => setReferralForm({ ...referralForm, is_active: v })}
                trackColor={{ false: Colors.neutral[300], true: Colors.primary }}
                thumbColor={Colors.white}
              />
            </View>
            <TouchableOpacity
              style={[s.saveBtn, savingReferral && s.saveBtnDisabled]}
              onPress={saveReferral}
              disabled={savingReferral}
              activeOpacity={0.8}
            >
              {savingReferral
                ? <ActivityIndicator color={Colors.white} size="small" />
                : <Text style={s.saveBtnText}>{referralSaved ? 'Saved!' : 'Save Referral Settings'}</Text>}
            </TouchableOpacity>
          </View>

          <View style={s.referralListCard}>
            <View style={s.referralListHeader}>
              <View style={s.referralListIconWrap}>
                <Users size={18} color={Colors.primary} strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.referralListTitle}>Referral Riders & Delivery Progress</Text>
                <Text style={s.referralListSub}>Track each referral's delivery days and approve earned bonuses</Text>
              </View>
            </View>
            {adminReferrals.length === 0 ? (
              <View style={s.referralEmpty}>
                <Gift size={28} color={Colors.textDisabled} strokeWidth={1.2} />
                <Text style={s.referralEmptyText}>No referrals yet. Riders will appear here once they refer someone.</Text>
              </View>
            ) : (
              <View style={s.referralTableWrap}>
                <View style={s.referralTableHead}>
                  <Text style={[s.refTh, { flex: 1.5 }]}>Referrer</Text>
                  <Text style={[s.refTh, { flex: 1.5 }]}>Referred Rider</Text>
                  <Text style={[s.refTh, { flex: 1 }]}>Progress</Text>
                  <Text style={[s.refTh, { flex: 1 }]}>Status</Text>
                  <Text style={[s.refTh, { flex: 1 }]}>Reward</Text>
                  <Text style={[s.refTh, { width: 120, textAlign: 'right' }]}>Action</Text>
                </View>
                {adminReferrals.map((ref, idx) => {
                  const required = ref.required_delivery_days ?? referralConfig?.required_completion_days ?? 0;
                  const completed = ref.completed_delivery_days ?? 0;
                  const progressPct = required > 0 ? Math.min(100, Math.round((completed / required) * 100)) : 0;
                  return (
                    <View key={ref.id} style={[s.referralTableRow, idx % 2 === 1 && s.tableRowAlt]}>
                      <View style={[s.refTd, { flex: 1.5 }]}>
                        <Text style={s.refReferrerName}>{ref.referrer_name}</Text>
                        <Text style={s.refReferrerMobile}>{ref.referred_mobile}</Text>
                      </View>
                      <View style={[s.refTd, { flex: 1.5 }]}>
                        <Text style={s.refReferredName}>{ref.referred_name ?? ref.referred_mobile}</Text>
                        <Text style={s.refReferredSub}>Referred {format(new Date(ref.created_at), 'dd MMM yyyy')}</Text>
                      </View>
                      <View style={[s.refTd, { flex: 1 }]}>
                        <Text style={s.refProgressText}>{completed}/{required} days</Text>
                        <View style={s.refProgressBarBg}>
                          <View style={[s.refProgressBarFill, { width: `${progressPct}%` }]} />
                        </View>
                      </View>
                      <View style={[s.refTd, { flex: 1 }]}>
                        <View style={[s.refStatusBadge,
                          ref.approval_status === 'approved' && s.refStatusApproved,
                          ref.approval_status === 'eligible' && s.refStatusEligible,
                          ref.approval_status === 'rejected' && s.refStatusRejected,
                          ref.approval_status === 'pending' && s.refStatusPending,
                        ]}>
                          <Text style={[s.refStatusText,
                            ref.approval_status === 'approved' && s.refStatusTextApproved,
                            ref.approval_status === 'eligible' && s.refStatusTextEligible,
                            ref.approval_status === 'rejected' && s.refStatusTextRejected,
                            ref.approval_status === 'pending' && s.refStatusTextPending,
                          ]}>
                            {ref.approval_status === 'approved' ? 'Approved'
                              : ref.approval_status === 'eligible' ? 'Eligible'
                              : ref.approval_status === 'rejected' ? 'Rejected'
                              : 'Pending'}
                          </Text>
                        </View>
                      </View>
                      <View style={[s.refTd, { flex: 1 }]}>
                        <Text style={s.refRewardText}>
                          {ref.approval_status === 'approved' && ref.reward_amount
                            ? `₹${Number(ref.reward_amount).toLocaleString('en-IN')}`
                            : `₹${Number(referralConfig?.reward_amount ?? 0).toLocaleString('en-IN')}`}
                        </Text>
                      </View>
                      <View style={{ width: 120, flexDirection: 'row', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }}>
                        {ref.approval_status === 'eligible' && (
                          <TouchableOpacity style={s.refApproveBtn} onPress={() => approveReferral(ref.id)} activeOpacity={0.8}>
                            <CheckCircle2 size={13} color={Colors.white} strokeWidth={2} />
                            <Text style={s.refApproveBtnText}>Approve</Text>
                          </TouchableOpacity>
                        )}
                        {ref.approval_status === 'pending' && (
                          <TouchableOpacity style={s.refRejectBtn} onPress={() => rejectReferral(ref.id)} activeOpacity={0.8}>
                            <XCircle size={13} color={Colors.error} strokeWidth={2} />
                            <Text style={s.refRejectBtnText}>Reject</Text>
                          </TouchableOpacity>
                        )}
                        {ref.approval_status === 'approved' && (
                          <Text style={s.refApprovedDate}>
                            {ref.approved_at ? format(new Date(ref.approved_at), 'dd MMM') : ''}
                          </Text>
                        )}
                        {ref.approval_status === 'rejected' && (
                          <Text style={s.refRejectedLabel}>Rejected</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      ) : null}

      {previewImageUrl && (
        <View style={s.imagePreviewOverlay}>
          <TouchableOpacity style={s.imagePreviewCloseBtn} onPress={() => setPreviewImageUrl(null)} activeOpacity={0.8}>
            <X size={22} color={Colors.white} strokeWidth={2} />
          </TouchableOpacity>
          <Image source={{ uri: previewImageUrl }} style={s.imagePreviewFull} resizeMode="contain" />
        </View>
      )}

      <AppModal visible={showModal} onClose={() => { setShowTimePicker(false); setShowCutoffPicker(false); setShowModal(false); }} title={editing ? 'Edit Incentive' : 'Add Incentive'} scrollable>
        <View style={s.modalBody}>
          {formError ? (
            <View style={s.formErrorBox}>
              <Text style={s.formErrorText}>{formError}</Text>
            </View>
          ) : null}
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>Name <Text style={s.required}>*</Text></Text>
            <TextInput
              style={s.fieldInput}
              value={form.name}
              onChangeText={(v) => setForm({ ...form, name: v })}
              placeholder="e.g. Perfect Attendance Bonus"
              placeholderTextColor={Colors.textDisabled}
            />
          </View>
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>Amount (₹)</Text>
            <TextInput
              style={s.fieldInput}
              value={form.amount}
              onChangeText={(v) => setForm({ ...form, amount: v })}
              placeholder="0"
              placeholderTextColor={Colors.textDisabled}
              keyboardType="numeric"
            />
          </View>
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>Bonus Category</Text>
            <View style={s.categoryRow}>
              {(['on_time_attendance', 'on_time_delivery', 'no_leave', 'customer_feedback', 'flower_quality', 'custom'] as BonusCategory[]).map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[s.categoryBtn, form.bonus_category === cat && s.categoryBtnActive]}
                  onPress={() => setForm({ ...form, bonus_category: cat })}
                >
                  <Text style={[s.categoryBtnText, form.bonus_category === cat && s.categoryBtnTextActive]}>
                    {CATEGORY_LABELS[cat]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>Type</Text>
            <View style={s.typeToggleRow}>
              <TouchableOpacity
                style={[s.typeBtn, form.type === 'per_day' && s.typeBtnActive]}
                onPress={() => setForm({ ...form, type: 'per_day' })}
              >
                <Text style={[s.typeBtnText, form.type === 'per_day' && s.typeBtnTextActive]}>Per Day</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.typeBtn, form.type === 'per_month' && s.typeBtnActive]}
                onPress={() => setForm({ ...form, type: 'per_month' })}
              >
                <Text style={[s.typeBtnText, form.type === 'per_month' && s.typeBtnTextActive]}>Per Month</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>Cutoff Time (for on-time checks)</Text>
            {Platform.OS === 'web' ? (
              React.createElement('input' as any, {
                type: 'time',
                value: form.cutoff_time,
                onChange: (event: { target: { value: string } }) => setForm({ ...form, cutoff_time: event.target.value }),
                style: {
                  width: '100%',
                  height: 52,
                  boxSizing: 'border-box',
                  border: `1px solid ${Colors.border}`,
                  borderRadius: 8,
                  padding: '0 14px',
                  backgroundColor: Colors.white,
                  color: form.cutoff_time ? Colors.textPrimary : Colors.textDisabled,
                  fontFamily: Typography.fontFamily.sansRegular,
                  fontSize: 16,
                },
                'aria-label': 'Select cutoff time',
              })
            ) : (
              <>
                <TouchableOpacity
                  style={s.timeField}
                  onPress={() => setShowCutoffPicker(true)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.timeFieldText, !form.cutoff_time && s.timeFieldPlaceholder]}>
                    {form.cutoff_time ? displayTime(form.cutoff_time) : 'Select cutoff time'}
                  </Text>
                </TouchableOpacity>
                {showCutoffPicker && (
                  <DateTimePicker
                    value={form.cutoff_time ? timeToDate(form.cutoff_time) : new Date()}
                    mode="time"
                    display="default"
                    onChange={(event, selectedDate) => {
                      setShowCutoffPicker(false);
                      if (selectedDate) setForm({ ...form, cutoff_time: dateToTime(selectedDate) });
                    }}
                  />
                )}
              </>
            )}
          </View>
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>Time (legacy field)</Text>
            {Platform.OS === 'web' ? (
              React.createElement('input' as any, {
                type: 'time',
                value: form.time,
                onChange: (event: { target: { value: string } }) => setForm({ ...form, time: event.target.value }),
                style: {
                  width: '100%',
                  height: 52,
                  boxSizing: 'border-box',
                  border: `1px solid ${Colors.border}`,
                  borderRadius: 8,
                  padding: '0 14px',
                  backgroundColor: Colors.white,
                  color: form.time ? Colors.textPrimary : Colors.textDisabled,
                  fontFamily: Typography.fontFamily.sansRegular,
                  fontSize: 16,
                },
                'aria-label': 'Select incentive time',
              })
            ) : (
              <>
                <TouchableOpacity
                  style={s.timeField}
                  onPress={() => setShowTimePicker(true)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.timeFieldText, !form.time && s.timeFieldPlaceholder]}>
                    {form.time ? displayTime(form.time) : 'Select time'}
                  </Text>
                </TouchableOpacity>
                {showTimePicker && (
                  <DateTimePicker
                    value={timeToDate(form.time)}
                    mode="time"
                    display="default"
                    onChange={(event, selectedDate) => {
                      setShowTimePicker(false);
                      if (selectedDate) setForm({ ...form, time: dateToTime(selectedDate) });
                    }}
                  />
                )}
              </>
            )}
          </View>
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>Min Deliveries (optional, for custom category)</Text>
            <TextInput
              style={s.fieldInput}
              value={form.min_deliveries}
              onChangeText={(v) => setForm({ ...form, min_deliveries: v })}
              placeholder="e.g. 25"
              placeholderTextColor={Colors.textDisabled}
              keyboardType="numeric"
            />
          </View>
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>Min Present Days (optional)</Text>
            <TextInput
              style={s.fieldInput}
              value={form.min_present_days}
              onChangeText={(v) => setForm({ ...form, min_present_days: v })}
              placeholder="e.g. 20"
              placeholderTextColor={Colors.textDisabled}
              keyboardType="numeric"
            />
          </View>
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>Max Absent Days (optional)</Text>
            <TextInput
              style={s.fieldInput}
              value={form.max_absent_days}
              onChangeText={(v) => setForm({ ...form, max_absent_days: v })}
              placeholder="e.g. 2"
              placeholderTextColor={Colors.textDisabled}
              keyboardType="numeric"
            />
          </View>
          <View style={s.fieldGroup}>
            <View style={s.switchRow}>
              <Text style={s.fieldLabel}>Active</Text>
              <Switch
                value={form.is_active}
                onValueChange={(v) => setForm({ ...form, is_active: v })}
                trackColor={{ false: Colors.neutral[300], true: Colors.primary }}
                thumbColor={Colors.white}
              />
            </View>
          </View>
          <TouchableOpacity style={[s.saveBtn, saving && s.saveBtnDisabled]} onPress={save} disabled={saving} activeOpacity={0.8}>
            {saving ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={s.saveBtnText}>{editing ? 'Update' : 'Create'} Incentive</Text>}
          </TouchableOpacity>
        </View>
      </AppModal>

      <AppModal
        visible={showDeleteModal}
        onClose={() => {
          if (deleting) return;
          setShowDeleteModal(false);
          setIncentiveToDelete(null);
        }}
        title="Delete incentive?"
      >
        <View style={s.deleteModalBody}>
          <Text style={s.deleteModalText}>
            Are you sure you want to delete {incentiveToDelete?.name ?? 'this incentive'}? This cannot be undone.
          </Text>
          <View style={s.deleteModalActions}>
            <TouchableOpacity
              style={s.cancelDeleteBtn}
              onPress={() => {
                setShowDeleteModal(false);
                setIncentiveToDelete(null);
              }}
              disabled={deleting}
              activeOpacity={0.8}
            >
              <Text style={s.cancelDeleteText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.confirmDeleteBtn, deleting && s.confirmDeleteBtnDisabled]}
              onPress={deleteIncentive}
              disabled={deleting}
              activeOpacity={0.8}
            >
              {deleting ? <ActivityIndicator size="small" color={Colors.white} /> : <Trash2 size={15} color={Colors.white} strokeWidth={2} />}
              <Text style={s.confirmDeleteText}>{deleting ? 'Deleting...' : 'Delete'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </AppModal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EEF2F5' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[4], gap: Spacing[3],
  },
  headerWeb: { paddingHorizontal: 32, paddingVertical: 20 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  headerIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl,
    color: Colors.textPrimary, letterSpacing: -0.3,
  },
  titleWeb: { fontSize: Typography.size['2xl'] },
  subtitle: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs,
    color: Colors.textTertiary, marginTop: 2,
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    paddingHorizontal: 16, paddingVertical: 10, ...Shadow.sm,
  },
  addBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white,
  },
  recalcBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    paddingHorizontal: 16, paddingVertical: 10, ...Shadow.sm,
  },
  recalcBtnDisabled: { backgroundColor: Colors.neutral[300] },
  recalcBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white,
  },
  tabScroll: { maxHeight: 50, paddingHorizontal: Spacing[4] },
  tabScrollContent: { gap: Spacing[2], paddingBottom: Spacing[2] },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.md,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  tabActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  tabText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary,
  },
  tabTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  scroll: { flex: 1 },
  content: { padding: Spacing[4], gap: Spacing[3] },
  contentWeb: { padding: 32, maxWidth: 1200, alignSelf: 'center', width: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: Spacing[3] },
  emptyTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary,
  },
  emptySub: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
  },
  tableCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  tableHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: Colors.neutral[50], borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  th: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11,
    color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.neutral[50],
  },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  td: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary,
  },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  statusActive: { backgroundColor: '#E8F5E9' },
  statusInactive: { backgroundColor: '#FFEBEE' },
  statusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  statusTextActive: { color: Colors.success },
  statusTextInactive: { color: Colors.error },
  iconBtn: { padding: 6, borderRadius: 8, backgroundColor: Colors.neutral[50] },
  bestPerformerCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 20,
    borderWidth: 1, borderColor: '#FFD70044', ...Shadow.sm,
    marginBottom: Spacing[3],
  },
  bestPerformerLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  trophyWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#FFF8E1', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#FFD70044',
  },
  bestPerformerLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 11,
    color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  bestPerformerName: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg,
    color: Colors.textPrimary, marginTop: 2,
  },
  bestPerformerStats: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: Colors.textSecondary, marginTop: 2,
  },
  bestPerformerAmount: { alignItems: 'flex-end' },
  bestPerformerAmountText: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.success,
  },
  bestPerformerAmountLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary, marginTop: 2,
  },
  noRankingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 16,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
    marginBottom: Spacing[3],
  },
  noRankingText: {
    flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  recalcBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: Spacing[3],
  },
  recalcBannerSuccess: { backgroundColor: '#E8F5E9' },
  recalcBannerError: { backgroundColor: Colors.errorSurface },
  recalcBannerText: {
    flex: 1, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm,
  },
  recalcBannerTextSuccess: { color: Colors.success },
  recalcBannerTextError: { color: Colors.error },
  perfCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 20,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm, gap: Spacing[3],
  },
  perfCardAlt: { backgroundColor: Colors.neutral[50] },
  perfHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  perfRiderInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  perfAvatar: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  perfAvatarText: { fontFamily: Typography.fontFamily.bold, fontSize: 18 },
  perfName: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  perfNameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap',
  },
  rankBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full,
    borderWidth: 1,
  },
  rankBadgeText: {
    fontFamily: Typography.fontFamily.semiBold, fontSize: 10, letterSpacing: 0.3,
  },
  perfMeta: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2,
  },
  perfMetrics: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  perfMetric: { alignItems: 'center', gap: 2 },
  perfMetricValue: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary,
  },
  perfMetricLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary,
  },
  perfMetricDivider: { width: 1, height: 28, backgroundColor: Colors.border },
  perfIncentivesSection: { gap: Spacing[2], paddingTop: Spacing[2], borderTopWidth: 1, borderTopColor: Colors.border },
  perfIncentivesTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.textTertiary,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  perfIncentiveRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, gap: Spacing[3],
  },
  perfIncentiveInfo: { flex: 1, gap: 2 },
  perfIncentiveName: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary,
  },
  perfIncentiveAmount: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  perfIncentiveActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  evalBadgePassed: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.md,
    backgroundColor: Colors.success,
  },
  evalBadgePassedText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.white },
  evalBadgeFailed: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.md,
    backgroundColor: Colors.error,
  },
  evalBadgeFailedText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.white },
  evalBadgePending: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.md,
    backgroundColor: Colors.neutral[100],
  },
  evalBadgePendingText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.textTertiary },
  feedbackRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, gap: Spacing[3],
  },
  feedbackInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  feedbackLabel: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary,
  },
  feedbackToggle: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white,
  },
  feedbackToggleActive: {
    backgroundColor: Colors.success, borderColor: Colors.success,
  },
  feedbackToggleText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.textSecondary,
  },
  feedbackToggleTextActive: { color: Colors.white },
  qualifiedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#E8F5E9', borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8,
    marginTop: Spacing[1],
  },
  qualifiedText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.success,
  },
  qualityCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 20,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm, gap: Spacing[3],
  },
  qualityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qualityRiderInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  qualityPhoto: {
    width: '100%', height: 200, borderRadius: Radius.md, backgroundColor: Colors.neutral[100],
  },
  imagePreviewOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 9999,
    alignItems: 'center', justifyContent: 'center',
  },
  imagePreviewCloseBtn: {
    position: 'absolute', top: 40, right: 20, zIndex: 10000,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  imagePreviewFull: {
    width: '100%', height: '100%',
  },
  qualityNotes: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary,
  },
  reviewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 10,
  },
  reviewBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white,
  },
  modalBody: { paddingBottom: Spacing[5], gap: Spacing[4] },
  deleteModalBody: { paddingBottom: Spacing[4], gap: Spacing[5] },
  deleteModalText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    lineHeight: 24,
    color: Colors.textSecondary,
  },
  deleteModalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing[2] },
  cancelDeleteBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 18,
    paddingVertical: 11,
    backgroundColor: Colors.white,
  },
  cancelDeleteText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  confirmDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: Radius.md,
    paddingHorizontal: 18,
    paddingVertical: 11,
    backgroundColor: Colors.error,
  },
  confirmDeleteBtnDisabled: { backgroundColor: Colors.neutral[300] },
  confirmDeleteText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.white,
  },
  formErrorBox: {
    backgroundColor: Colors.errorSurface, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10,
  },
  formErrorText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.error },
  fieldGroup: { gap: Spacing[2] },
  fieldLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary,
  },
  required: { color: Colors.error },
  fieldInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary,
    backgroundColor: Colors.white,
  },
  timeField: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: 14, paddingVertical: 14,
    backgroundColor: Colors.white,
    justifyContent: 'center',
  },
  timeFieldText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  timeFieldPlaceholder: {
    color: Colors.textDisabled,
  },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  categoryBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white,
  },
  categoryBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  categoryBtnText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  categoryBtnTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  typeToggleRow: { flexDirection: 'row', gap: Spacing[2] },
  typeBtn: {
    flex: 1, paddingVertical: 12, borderRadius: Radius.md, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white,
  },
  typeBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  typeBtnText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary,
  },
  typeBtnTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: 14, ...Shadow.sm,
  },
  saveBtnDisabled: { backgroundColor: Colors.neutral[300] },
  saveBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white,
  },
  referralCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 20,
    borderWidth: 1, borderColor: Colors.border, gap: Spacing[4], ...Shadow.sm,
  },
  referralCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3] },
  referralIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: Colors.accentSurface, alignItems: 'center', justifyContent: 'center',
  },
  referralCardTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  referralCardSub: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 3,
  },
  referralHint: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 4,
  },
  referralListCard: {
    marginTop: Spacing[4], backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  referralListHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3],
    padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  referralListIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center',
  },
  referralListTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  referralListSub: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 3,
  },
  referralEmpty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  referralEmptyText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', paddingHorizontal: 24,
  },
  referralTableWrap: { paddingHorizontal: 8, paddingBottom: 8 },
  referralTableHead: {
    flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 6,
  },
  refTh: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.textTertiary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  referralTableRow: {
    flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center', gap: 6,
    borderBottomWidth: 1, borderBottomColor: Colors.border + '55',
  },
  refTd: { gap: 2 },
  refReferrerName: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textPrimary,
  },
  refReferrerMobile: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary,
  },
  refReferredName: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textPrimary,
  },
  refReferredSub: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary,
  },
  refProgressText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.textSecondary, marginBottom: 4,
  },
  refProgressBarBg: {
    height: 4, backgroundColor: Colors.neutral[200], borderRadius: 2, overflow: 'hidden',
  },
  refProgressBarFill: {
    height: '100%', backgroundColor: Colors.primary, borderRadius: 2,
  },
  refStatusBadge: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, alignSelf: 'flex-start',
  },
  refStatusApproved: { backgroundColor: Colors.successSurface },
  refStatusEligible: { backgroundColor: Colors.warningSurface },
  refStatusRejected: { backgroundColor: Colors.errorSurface },
  refStatusPending: { backgroundColor: Colors.neutral[100] },
  refStatusText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4,
  },
  refStatusTextApproved: { color: Colors.success },
  refStatusTextEligible: { color: Colors.warning },
  refStatusTextRejected: { color: Colors.error },
  refStatusTextPending: { color: Colors.textTertiary },
  refRewardText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textPrimary,
  },
  refApproveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.success, borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 6,
  },
  refApproveBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.white,
  },
  refRejectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.errorSurface, borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.error + '33',
  },
  refRejectBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.error,
  },
  refApprovedDate: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.success,
  },
  refRejectedLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.error,
  },
});
