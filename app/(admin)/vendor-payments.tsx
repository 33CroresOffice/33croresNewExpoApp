import React, { useEffect, useState, useCallback } from 'react';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CircleDollarSign, Search, ArrowLeft, Store,
  CircleCheck as CheckCircle, Clock, ChevronRight,
} from 'lucide-react-native';
import { router } from 'expo-router';
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

interface VendorPaymentRow {
  id: string;
  amount: number;
  status: string;
  payment_date: string;
  payment_method: string;
  notes: string;
  created_at: string;
  vendor_id: string;
  procurement_order_id: string;
  vendor?: { business_name: string; contact_person: string | null; mobile: string | null };
  procurement_order?: { order_number: string; total_amount: number };
}

const STATUS_TABS: { label: string; value: string }[] = [
  { label: 'All', value: 'all' },
  { label: 'Completed', value: 'completed' },
  { label: 'Pending', value: 'pending' },
];

const PERIOD_OPTIONS = [
  { label: 'This Month', value: 0 },
  { label: 'Last Month', value: 1 },
  { label: '3 Months', value: 3 },
  { label: 'All Time', value: -1 },
];

export default function VendorPaymentsScreen() {
  return (
    <ModuleGuard module="finance">
      <VendorPaymentsScreenContent />
    </ModuleGuard>
  );
}

function VendorPaymentsScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [payments, setPayments] = useState<VendorPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('all');
  const [dateFilter, setDateFilter] = useState(0);

  const load = useCallback(async () => {
    try {
      let query = supabase
        .from('vendor_payments')
        .select(
          'id, amount, status, payment_date, payment_method, notes, created_at, vendor_id, procurement_order_id, vendor:vendors(business_name, contact_person, mobile), procurement_order:procurement_orders(order_number, total_amount)'
        )
        .order('created_at', { ascending: false })
        .limit(300);
      if (dateFilter !== -1) {
        const now = new Date();
        const from = dateFilter === 0
          ? startOfMonth(now)
          : startOfMonth(subMonths(now, dateFilter === 1 ? 1 : dateFilter - 1));
        const to = dateFilter === 1 ? endOfMonth(subMonths(now, 1)) : now;
        query = query
          .gte('payment_date', format(from, 'yyyy-MM-dd'))
          .lte('payment_date', format(to, 'yyyy-MM-dd'));
      }
      const { data } = await query;
      if (data) setPayments(data as any);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateFilter]);

  useEffect(() => { load(); }, [load]);
  usePageVisibility(load);

  const filtered = payments.filter(p => tab === 'all' || p.status === tab);
  const totalPaid = payments.filter(p => p.status === 'completed').reduce((s, p) => s + Number(p.amount), 0);
  const totalPending = payments.filter(p => p.status === 'pending').reduce((s, p) => s + Number(p.amount), 0);
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

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
            <CircleDollarSign size={isWeb ? 22 : 18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>Vendor Payments</Text>
            <Text style={s.subtitle}>{payments.length} transactions</Text>
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
          <Text style={s.summaryPillLabel}>Transactions</Text>
          <Text style={s.summaryPillValue}>{payments.length}</Text>
        </View>
      </View>

      <View style={[s.filterRow, isWeb && s.filterRowWeb]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.periodPills}>
          {PERIOD_OPTIONS.map(p => (
            <TouchableOpacity key={p.value} style={[s.periodPill, dateFilter === p.value && s.periodPillActive]} onPress={() => setDateFilter(p.value)}>
              <Text style={[s.periodPillText, dateFilter === p.value && s.periodPillTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll} contentContainerStyle={s.tabs}>
        {STATUS_TABS.map(t => (
          <TouchableOpacity key={t.value} style={[s.tabBtn, tab === t.value && s.tabBtnActive]} onPress={() => setTab(t.value)}>
            <Text style={[s.tabText, tab === t.value && s.tabTextActive]}>
              {t.label} ({t.value === 'all' ? payments.length : payments.filter(p => p.status === t.value).length})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

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
                <Text style={[s.thCell, { flex: 2 }]}>Vendor</Text>
                <Text style={[s.thCell, { flex: 1.5 }]}>Order</Text>
                <Text style={[s.thCell, { width: 100, textAlign: 'right' }]}>Amount</Text>
                <Text style={[s.thCell, { width: 90, textAlign: 'center' }]}>Method</Text>
                <Text style={[s.thCell, { width: 90, textAlign: 'center' }]}>Status</Text>
                <Text style={[s.thCell, { width: 100, textAlign: 'right' }]}>Date</Text>
              </View>
              {filtered.length === 0 ? (
                <View style={s.emptyState}>
                  <CircleDollarSign size={36} color={Colors.textDisabled} strokeWidth={1.2} />
                  <Text style={s.emptyTitle}>No vendor payments found</Text>
                </View>
              ) : (
                filtered.map((p, idx) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[s.tableRow, idx % 2 === 1 && s.tableRowAlt]}
                    onPress={() => router.push({ pathname: '/(admin)/procurement-order-detail', params: { id: p.procurement_order_id } } as any)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.tdCell, { flex: 2 }]}>
                      <Text style={s.tdPrimary}>{p.vendor?.business_name ?? p.vendor?.contact_person ?? '—'}</Text>
                      {p.vendor?.mobile ? <Text style={s.tdSub}>{p.vendor.mobile}</Text> : null}
                    </View>
                    <Text style={[s.tdCell, { flex: 1.5 }, s.tdSec]} numberOfLines={1}>
                      {p.procurement_order?.order_number ?? '—'}
                    </Text>
                    <Text style={[s.tdCell, { width: 100, textAlign: 'right' }, s.tdBold]}>{fmt(Number(p.amount))}</Text>
                    <Text style={[s.tdCell, { width: 90, textAlign: 'center' }, s.tdSec]}>
                      {p.payment_method?.replace('_', ' ')}
                    </Text>
                    <View style={[s.tdCell, { width: 90, alignItems: 'center' }]}>
                      <View style={[s.statusPill, { backgroundColor: p.status === 'completed' ? '#E8F5E9' : Colors.accentSurface }]}>
                        {p.status === 'completed'
                          ? <CheckCircle size={12} color={Colors.success} strokeWidth={2} />
                          : <Clock size={12} color={Colors.accentDark} strokeWidth={2} />}
                        <Text style={[s.statusText, { color: p.status === 'completed' ? Colors.success : Colors.accentDark }]}>
                          {p.status === 'completed' ? 'Paid' : 'Pending'}
                        </Text>
                      </View>
                    </View>
                    <Text style={[s.tdCell, { width: 100, textAlign: 'right' }, s.tdDate]}>
                      {p.payment_date ? format(parseISO(p.payment_date), 'dd MMM yyyy') : '—'}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          ) : (
            filtered.length === 0 ? (
              <View style={s.emptyState}>
                <CircleDollarSign size={36} color={Colors.textDisabled} strokeWidth={1.2} />
                <Text style={s.emptyTitle}>No vendor payments found</Text>
              </View>
            ) : (
              filtered.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={s.mobileCard}
                  onPress={() => router.push({ pathname: '/(admin)/procurement-order-detail', params: { id: p.procurement_order_id } } as any)}
                  activeOpacity={0.85}
                >
                  <View style={s.mobileCardInfo}>
                    <Text style={s.mobileCardName}>{p.vendor?.business_name ?? '—'}</Text>
                    <Text style={s.mobileCardSub}>
                      {p.procurement_order?.order_number ?? '—'} · {p.payment_method?.replace('_', ' ')}
                    </Text>
                    {p.notes ? <Text style={s.mobileCardNotes} numberOfLines={1}>{p.notes}</Text> : null}
                    <Text style={s.mobileCardDate}>
                      {p.payment_date ? format(parseISO(p.payment_date), 'dd MMM yyyy') : '—'}
                    </Text>
                  </View>
                  <View style={s.mobileCardRight}>
                    <Text style={s.mobileCardAmt}>{fmt(Number(p.amount))}</Text>
                    <View style={[s.statusPill, { backgroundColor: p.status === 'completed' ? '#E8F5E9' : Colors.accentSurface }]}>
                      <Text style={[s.statusText, { color: p.status === 'completed' ? Colors.success : Colors.accentDark }]}>
                        {p.status === 'completed' ? 'Paid' : 'Pending'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )
          )}
        </ScrollView>
      )}
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
  filterRow: { paddingHorizontal: Spacing[5], paddingVertical: Spacing[2], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterRowWeb: { paddingHorizontal: Spacing[8] },
  periodPills: { flexDirection: 'row', gap: Spacing[2] },
  periodPill: { paddingVertical: Spacing[1], paddingHorizontal: Spacing[3], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  periodPillActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  periodPillText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  periodPillTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  tabScroll: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, maxHeight: 48, flexGrow: 0 },
  tabs: { flexDirection: 'row', paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], gap: Spacing[2] },
  tabBtn: { paddingVertical: Spacing[1], paddingHorizontal: Spacing[3], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  tabBtnActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  tabText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  scroll: { flex: 1 },
  content: { padding: Spacing[4] },
  contentWeb: { padding: Spacing[8], maxWidth: 1100, alignSelf: 'center', width: '100%' },
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
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 3, paddingHorizontal: Spacing[2], borderRadius: Radius.full },
  statusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  mobileCard: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], marginBottom: Spacing[3], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  mobileCardInfo: { flex: 1 },
  mobileCardName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  mobileCardSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },
  mobileCardNotes: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary, marginTop: 2 },
  mobileCardDate: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  mobileCardRight: { alignItems: 'flex-end', gap: Spacing[1] },
  mobileCardAmt: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary },
});
