import React, { useState, useCallback } from 'react';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Platform, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Wallet, ArrowLeft, Search, X, CheckCircle2, Clock,
  Banknote, ChevronDown, Calendar, Bike,
} from 'lucide-react-native';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type PayoutStatus = 'draft' | 'approved' | 'paid';

interface RiderPayout {
  id: string;
  rider_id: string;
  period_start: string;
  period_end: string;
  total_deliveries: number;
  total_days_worked: number;
  base_amount: number;
  delivery_bonus: number;
  deductions: number;
  final_amount: number;
  status: PayoutStatus;
  payment_method: string | null;
  payment_reference: string;
  paid_at: string | null;
  notes: string;
  created_at: string;
  rider?: { full_name: string | null; mobile: string | null };
}

const STATUS_TABS: { label: string; value: PayoutStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Approved', value: 'approved' },
  { label: 'Paid', value: 'paid' },
];

const STATUS_CONFIG: Record<PayoutStatus, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  draft:    { label: 'Draft',    bg: Colors.neutral[100], text: Colors.textSecondary, icon: <Clock size={12} color={Colors.textSecondary} strokeWidth={2} /> },
  approved: { label: 'Approved', bg: Colors.accentSurface, text: Colors.accentDark, icon: <CheckCircle2 size={12} color={Colors.accentDark} strokeWidth={2} /> },
  paid:     { label: 'Paid',     bg: '#E8F5E9', text: Colors.success, icon: <Banknote size={12} color={Colors.success} strokeWidth={2} /> },
};

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
];

export default function RiderPayoutsScreen() {
  return (
    <ModuleGuard module="finance">
      <RiderPayoutsScreenContent />
    </ModuleGuard>
  );
}

function RiderPayoutsScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [payouts, setPayouts] = useState<RiderPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<PayoutStatus | 'all'>('all');
  const [payModal, setPayModal] = useState<RiderPayout | null>(null);
  const [payMethod, setPayMethod] = useState('cash');
  const [payRef, setPayRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('rider_payouts')
        .select('*, rider:profiles!rider_payouts_rider_id_fkey(full_name, mobile)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (data) setPayouts(data as RiderPayout[]);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  usePageVisibility(load);

  const filtered = payouts.filter(p => {
    if (tab !== 'all' && p.status !== tab) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (p.rider?.full_name ?? '').toLowerCase().includes(q) || (p.rider?.mobile ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const totalPaid = payouts.filter(p => p.status === 'paid').reduce((s, p) => s + p.final_amount, 0);
  const totalPending = payouts.filter(p => p.status === 'draft' || p.status === 'approved').reduce((s, p) => s + p.final_amount, 0);
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const approve = async (payout: RiderPayout) => {
    setActionLoading(payout.id);
    const { data, error: rpcError } = await supabase.rpc('approve_rider_payout', { p_payout_id: payout.id });
    if (rpcError || !data?.success) {
      setError(rpcError?.message ?? data?.error ?? 'Could not approve payout');
    } else {
      setPayouts(curr => curr.map(p => p.id === payout.id ? { ...p, status: 'approved' } : p));
    }
    setActionLoading(null);
  };

  const openPayModal = (payout: RiderPayout) => {
    setPayModal(payout);
    setPayMethod('cash');
    setPayRef('');
    setError('');
  };

  const confirmPay = async () => {
    if (!payModal) return;
    setSaving(true);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('mark_rider_payout_paid', {
      p_payout_id: payModal.id,
      p_method: payMethod,
      p_reference: payRef.trim(),
    });
    setSaving(false);
    if (rpcError || !data?.success) {
      setError(rpcError?.message ?? data?.error ?? 'Could not mark payout as paid');
      return;
    }
    setPayouts(curr => curr.map(p => p.id === payModal.id ? { ...p, status: 'paid', payment_method: payMethod, payment_reference: payRef.trim(), paid_at: new Date().toISOString() } : p));
    setPayModal(null);
  };

  return (
    <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top }]}>
      <View style={[s.header, isWeb && s.headerWeb]}>
        {!isWeb && (
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <ArrowLeft size={22} color={Colors.textPrimary} strokeWidth={1.8} />
          </TouchableOpacity>
        )}
        <View style={s.headerLeft}>
          <View style={s.headerIcon}>
            <Wallet size={isWeb ? 22 : 18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>Rider Payouts</Text>
            <Text style={s.subtitle}>{payouts.length} payout records</Text>
          </View>
        </View>
      </View>

      <View style={[s.summaryRow, isWeb && s.summaryRowWeb]}>
        <View style={s.summaryPill}>
          <Text style={s.summaryPillLabel}>Total Paid</Text>
          <Text style={[s.summaryPillValue, { color: Colors.success }]}>{fmt(totalPaid)}</Text>
        </View>
        <View style={s.summaryPill}>
          <Text style={s.summaryPillLabel}>Pending</Text>
          <Text style={[s.summaryPillValue, { color: Colors.accentDark }]}>{fmt(totalPending)}</Text>
        </View>
        <View style={s.summaryPill}>
          <Text style={s.summaryPillLabel}>Records</Text>
          <Text style={s.summaryPillValue}>{payouts.length}</Text>
        </View>
      </View>

      <View style={[s.searchRow, isWeb && s.searchRowWeb]}>
        <View style={s.searchWrap}>
          <Search size={14} color={Colors.textTertiary} strokeWidth={1.8} />
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search rider name or mobile..." placeholderTextColor={Colors.textDisabled} />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll} contentContainerStyle={s.tabs}>
        {STATUS_TABS.map(t => (
          <TouchableOpacity key={t.value} style={[s.tabBtn, tab === t.value && s.tabBtnActive]} onPress={() => setTab(t.value)}>
            <Text style={[s.tabText, tab === t.value && s.tabTextActive]}>
              {t.label} ({t.value === 'all' ? payouts.length : payouts.filter(p => p.status === t.value).length})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {error ? (
        <View style={s.errorBanner}>
          <X size={14} color={Colors.error} strokeWidth={1.8} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={s.center}><ActivityIndicator color={Colors.primary} /></View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.content, isWeb && s.contentWeb]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          {isWeb ? (
            <View style={s.table}>
              <View style={s.tableHead}>
                <Text style={[s.thCell, { flex: 2 }]}>Rider</Text>
                <Text style={[s.thCell, { width: 130 }]}>Period</Text>
                <Text style={[s.thCell, { width: 70, textAlign: 'center' }]}>Deliveries</Text>
                <Text style={[s.thCell, { width: 70, textAlign: 'center' }]}>Days</Text>
                <Text style={[s.thCell, { width: 100, textAlign: 'right' }]}>Base</Text>
                <Text style={[s.thCell, { width: 100, textAlign: 'right' }]}>Bonus</Text>
                <Text style={[s.thCell, { width: 100, textAlign: 'right' }]}>Deductions</Text>
                <Text style={[s.thCell, { width: 110, textAlign: 'right' }]}>Final</Text>
                <Text style={[s.thCell, { width: 90, textAlign: 'center' }]}>Status</Text>
                <Text style={[s.thCell, { width: 80, textAlign: 'center' }]}>Action</Text>
              </View>
              {filtered.length === 0 ? (
                <View style={s.emptyState}>
                  <Wallet size={36} color={Colors.textDisabled} strokeWidth={1.2} />
                  <Text style={s.emptyTitle}>No rider payouts found</Text>
                </View>
              ) : (
                filtered.map((p, idx) => {
                  const cfg = STATUS_CONFIG[p.status];
                  return (
                    <View key={p.id} style={[s.tableRow, idx % 2 === 1 && s.tableRowAlt]}>
                      <View style={[s.tdCell, { flex: 2 }]}>
                        <View style={s.riderCell}>
                          <View style={s.riderIcon}>
                            <Bike size={14} color={Colors.primary} strokeWidth={1.8} />
                          </View>
                          <View>
                            <Text style={s.tdPrimary}>{p.rider?.full_name ?? 'Unknown'}</Text>
                            {p.rider?.mobile ? <Text style={s.tdSub}>{p.rider.mobile}</Text> : null}
                          </View>
                        </View>
                      </View>
                      <Text style={[s.tdCell, { width: 130 }, s.tdDate]}>
                        {format(parseISO(p.period_start), 'dd MMM')} – {format(parseISO(p.period_end), 'dd MMM')}
                      </Text>
                      <Text style={[s.tdCell, { width: 70, textAlign: 'center' }, s.tdSec]}>{p.total_deliveries}</Text>
                      <Text style={[s.tdCell, { width: 70, textAlign: 'center' }, s.tdSec]}>{p.total_days_worked}</Text>
                      <Text style={[s.tdCell, { width: 100, textAlign: 'right' }, s.tdSec]}>{fmt(p.base_amount)}</Text>
                      <Text style={[s.tdCell, { width: 100, textAlign: 'right' }, { color: Colors.success }]}>{fmt(p.delivery_bonus)}</Text>
                      <Text style={[s.tdCell, { width: 100, textAlign: 'right' }, { color: Colors.error }]}>{fmt(p.deductions)}</Text>
                      <Text style={[s.tdCell, { width: 110, textAlign: 'right' }, s.tdBold]}>{fmt(p.final_amount)}</Text>
                      <View style={[s.tdCell, { width: 90, alignItems: 'center' }]}>
                        <View style={[s.statusPill, { backgroundColor: cfg.bg }]}>
                          {cfg.icon}
                          <Text style={[s.statusText, { color: cfg.text }]}>{cfg.label}</Text>
                        </View>
                      </View>
                      <View style={[s.tdCell, { width: 80, alignItems: 'center' }]}>
                        {actionLoading === p.id ? <ActivityIndicator size="small" color={Colors.primary} /> :
                          p.status === 'draft' ? (
                            <TouchableOpacity style={s.actionBtn} onPress={() => approve(p)}>
                              <Text style={s.actionBtnText}>Approve</Text>
                            </TouchableOpacity>
                          ) : p.status === 'approved' ? (
                            <TouchableOpacity style={[s.actionBtn, { backgroundColor: Colors.success }]} onPress={() => openPayModal(p)}>
                              <Text style={s.actionBtnText}>Pay</Text>
                            </TouchableOpacity>
                          ) : (
                            <Text style={s.paidDate}>{p.paid_at ? format(new Date(p.paid_at), 'dd MMM') : '—'}</Text>
                          )
                        }
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          ) : (
            filtered.length === 0 ? (
              <View style={s.emptyState}>
                <Wallet size={36} color={Colors.textDisabled} strokeWidth={1.2} />
                <Text style={s.emptyTitle}>No rider payouts found</Text>
              </View>
            ) : (
              filtered.map(p => {
                const cfg = STATUS_CONFIG[p.status];
                return (
                  <View key={p.id} style={s.mobileCard}>
                    <View style={s.mobileCardTop}>
                      <View style={s.riderCell}>
                        <View style={s.riderIcon}>
                          <Bike size={16} color={Colors.primary} strokeWidth={1.8} />
                        </View>
                        <View>
                          <Text style={s.mobileCardName}>{p.rider?.full_name ?? 'Unknown'}</Text>
                          <Text style={s.mobileCardSub}>{format(parseISO(p.period_start), 'dd MMM')} – {format(parseISO(p.period_end), 'dd MMM')}</Text>
                        </View>
                      </View>
                      <View style={[s.statusPill, { backgroundColor: cfg.bg }]}>
                        {cfg.icon}
                        <Text style={[s.statusText, { color: cfg.text }]}>{cfg.label}</Text>
                      </View>
                    </View>
                    <View style={s.mobileCardStats}>
                      <View style={s.statBlock}>
                        <Text style={s.statLabel}>Deliveries</Text>
                        <Text style={s.statValue}>{p.total_deliveries}</Text>
                      </View>
                      <View style={s.statBlock}>
                        <Text style={s.statLabel}>Days</Text>
                        <Text style={s.statValue}>{p.total_days_worked}</Text>
                      </View>
                      <View style={s.statBlock}>
                        <Text style={s.statLabel}>Bonus</Text>
                        <Text style={[s.statValue, { color: Colors.success }]}>{fmt(p.delivery_bonus)}</Text>
                      </View>
                      <View style={s.statBlock}>
                        <Text style={s.statLabel}>Deduct</Text>
                        <Text style={[s.statValue, { color: Colors.error }]}>{fmt(p.deductions)}</Text>
                      </View>
                    </View>
                    <View style={s.mobileCardBottom}>
                      <Text style={s.mobileCardFinal}>{fmt(p.final_amount)}</Text>
                      {p.status === 'draft' ? (
                        <TouchableOpacity style={s.actionBtn} onPress={() => approve(p)}>
                          <Text style={s.actionBtnText}>Approve</Text>
                        </TouchableOpacity>
                      ) : p.status === 'approved' ? (
                        <TouchableOpacity style={[s.actionBtn, { backgroundColor: Colors.success }]} onPress={() => openPayModal(p)}>
                          <Text style={s.actionBtnText}>Mark Paid</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={s.paidDate}>{p.paid_at ? `Paid ${format(new Date(p.paid_at), 'dd MMM yyyy')}` : 'Paid'}</Text>
                      )}
                    </View>
                  </View>
                );
              })
            )
          )}
        </ScrollView>
      )}

      <Modal visible={!!payModal} transparent animationType="fade" onRequestClose={() => setPayModal(null)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Mark Payout as Paid</Text>
              <TouchableOpacity onPress={() => setPayModal(null)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            {payModal && (
              <View>
                <View style={s.payInfo}>
                  <Text style={s.payInfoName}>{payModal.rider?.full_name ?? 'Unknown Rider'}</Text>
                  <Text style={s.payInfoAmount}>{fmt(payModal.final_amount)}</Text>
                  <Text style={s.payInfoPeriod}>{format(parseISO(payModal.period_start), 'dd MMM')} – {format(parseISO(payModal.period_end), 'dd MMM yyyy')}</Text>
                </View>
                <Text style={s.fieldLabel}>Payment Method</Text>
                <View style={s.methodRow}>
                  {PAYMENT_METHODS.map(m => (
                    <TouchableOpacity key={m.value} style={[s.methodBtn, payMethod === m.value && s.methodBtnActive]} onPress={() => setPayMethod(m.value)}>
                      <Text style={[s.methodBtnText, payMethod === m.value && s.methodBtnTextActive]}>{m.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={s.fieldGroup}>
                  <Text style={s.fieldLabel}>Reference / Transaction ID</Text>
                  <TextInput style={s.input} value={payRef} onChangeText={setPayRef} placeholder="UTR, UPI ref, etc. (optional)" placeholderTextColor={Colors.textDisabled} />
                </View>
                {error ? <Text style={s.errorText}>{error}</Text> : null}
              </View>
            )}
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setPayModal(null)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={confirmPay} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveBtnText}>Confirm Payment</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing[3] },
  headerWeb: { paddingHorizontal: Spacing[8], paddingVertical: Spacing[5] },
  backBtn: { padding: Spacing[1] },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  headerIcon: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  titleWeb: { fontSize: Typography.size['2xl'] },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },
  summaryRow: { flexDirection: 'row', gap: Spacing[3], paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  summaryRowWeb: { paddingHorizontal: Spacing[8] },
  summaryPill: { flex: 1, backgroundColor: Colors.neutral[50], borderRadius: Radius.md, padding: Spacing[3], alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  summaryPillLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  summaryPillValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, marginTop: 2 },
  searchRow: { paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchRowWeb: { paddingHorizontal: Spacing[8] },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.neutral[50], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2] },
  searchInput: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, outlineStyle: 'none' } as any,
  tabScroll: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, maxHeight: 48, flexGrow: 0 },
  tabs: { flexDirection: 'row', paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], gap: Spacing[2] },
  tabBtn: { paddingVertical: Spacing[1], paddingHorizontal: Spacing[3], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  tabBtnActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  tabText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingHorizontal: Spacing[5], paddingVertical: Spacing[2], backgroundColor: '#FFEBEE' },
  errorText: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error },
  scroll: { flex: 1 },
  content: { padding: Spacing[4] },
  contentWeb: { padding: Spacing[8], maxWidth: 1200, alignSelf: 'center', width: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  table: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  tableHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], backgroundColor: Colors.neutral[50], borderBottomWidth: 1, borderBottomColor: Colors.border },
  thCell: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, paddingRight: Spacing[2] },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  tdCell: { paddingRight: Spacing[2] },
  tdPrimary: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  tdSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },
  tdSec: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tdBold: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  tdDate: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  riderCell: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  riderIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 3, paddingHorizontal: Spacing[2], borderRadius: Radius.full },
  statusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  actionBtn: { backgroundColor: Colors.primary, paddingVertical: Spacing[1], paddingHorizontal: Spacing[3], borderRadius: Radius.sm },
  actionBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.white },
  paidDate: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  mobileCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], marginBottom: Spacing[3], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm, gap: Spacing[3] },
  mobileCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mobileCardName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  mobileCardSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  mobileCardStats: { flexDirection: 'row', gap: Spacing[2] },
  statBlock: { flex: 1, alignItems: 'center', backgroundColor: Colors.neutral[50], borderRadius: Radius.md, paddingVertical: Spacing[2] },
  statLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary, textTransform: 'uppercase' },
  statValue: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary, marginTop: 2 },
  mobileCardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing[2], borderTopWidth: 1, borderTopColor: Colors.divider },
  mobileCardFinal: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: Spacing[5] },
  modal: { width: '100%', maxHeight: '92%', backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[5], gap: Spacing[3] },
  modalWeb: { maxWidth: 460 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  payInfo: { alignItems: 'center', paddingVertical: Spacing[3], gap: 4 },
  payInfoName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  payInfoAmount: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.primary },
  payInfoPeriod: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  fieldLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary, marginBottom: Spacing[2] },
  methodRow: { flexDirection: 'row', gap: Spacing[2], marginBottom: Spacing[3] },
  methodBtn: { flex: 1, paddingVertical: Spacing[2], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50], alignItems: 'center' },
  methodBtnActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  methodBtnText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  methodBtnTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  fieldGroup: { gap: Spacing[1], marginBottom: Spacing[3] },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary, backgroundColor: Colors.neutral[50] },
  modalFooter: { flexDirection: 'row', gap: Spacing[3], paddingTop: Spacing[2] },
  cancelBtn: { flex: 1, paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  saveBtn: { flex: 2, paddingVertical: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.success, alignItems: 'center' },
  saveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
});
