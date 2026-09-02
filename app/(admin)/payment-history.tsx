import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  ActivityIndicator, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, CreditCard, MapPin, RefreshCw, Search, X } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { usePageVisibility } from '@/hooks/usePageVisibility';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PAGE_SIZE = 12;

const FREQUENCY_MONTHS: Record<string, number> = {
  weekly: 1,
  biweekly: 1,
  monthly: 1,
  '3months': 3,
  '6months': 6,
};

type ModalData = {
  planName: string;
  startDate: string;
  endDate: string;
  address: string;
  amount: number;
};

type MonthCell = {
  covered: boolean;
  isStart: boolean;
  modal?: ModalData;
};

type HistoryRow = {
  id: string;
  name: string;
  mobile: string;
  planName: string;
  planAmount: string;
  endDate: string;
  monthCells: MonthCell[];
};

function formatAmount(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatDate(date: string | null): string {
  if (!date) return '—';
  const [year, month, day] = date.slice(0, 10).split('-');
  return `${day}-${month}-${year}`;
}

function formatAddress(addr: any): string {
  if (!addr) return '—';
  const parts = [addr.apartment_name, addr.street, addr.landmark, addr.city, addr.pincode].filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
}

export default function PaymentHistoryScreen() {
  return (
    <ModuleGuard module="operations">
      <PaymentHistoryContent />
    </ModuleGuard>
  );
}

function PaymentHistoryContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [modalData, setModalData] = useState<ModalData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const fetchStart = `${year - 1}-01-01T00:00:00.000Z`;
    const fetchEnd = `${year + 1}-01-01T00:00:00.000Z`;
    const [subscriptionsRes, paymentsRes] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('id, user_id, start_date, end_date, new_end_date, plan:subscription_plans(name, price, frequency), profile:profiles(full_name, mobile), delivery_address:addresses(apartment_name, street, landmark, city, pincode)')
        .eq('status', 'active')
        .order('user_id'),
      supabase
        .from('payments')
        .select('subscription_id, user_id, amount, status, created_at')
        .gte('created_at', fetchStart)
        .lt('created_at', fetchEnd),
    ]);

    if (subscriptionsRes.error || paymentsRes.error) {
      setError('Unable to load payment history. Please refresh and try again.');
      setRows([]);
      setLoading(false);
      return;
    }

    const subs = (subscriptionsRes.data ?? []) as Array<any>;
    const payments = (paymentsRes.data ?? []) as Array<{ subscription_id: string | null; user_id: string; amount: number; status: string; created_at: string }>;

    const subMap = new Map<string, { duration: number; planName: string; planAmount: string; startDate: string; endDate: string; address: string }>();
    subs.forEach((sub: any) => {
      const freq = sub.plan?.frequency ?? 'monthly';
      subMap.set(sub.id, {
        duration: FREQUENCY_MONTHS[freq] ?? 1,
        planName: sub.plan?.name ? `${sub.plan.name} · ${freq}` : 'Plan unavailable',
        planAmount: formatAmount(sub.plan?.price ?? 0),
        startDate: formatDate(sub.start_date),
        endDate: formatDate(sub.new_end_date ?? sub.end_date),
        address: formatAddress(sub.delivery_address),
      });
    });

    const subsByUser = new Map<string, any[]>();
    subs.forEach((sub: any) => {
      const list = subsByUser.get(sub.user_id) ?? [];
      list.push(sub);
      subsByUser.set(sub.user_id, list);
    });

    const paymentsByUser = new Map<string, typeof payments>();
    payments.forEach((payment) => {
      const list = paymentsByUser.get(payment.user_id) ?? [];
      list.push(payment);
      paymentsByUser.set(payment.user_id, list);
    });

    const customerRows = new Map<string, HistoryRow>();
    subsByUser.forEach((userSubs, userId) => {
      const profile = userSubs[0]?.profile;
      const planNames = new Set<string>();
      const planAmounts = new Set<string>();
      let latestEndDate = '';
      userSubs.forEach((sub: any) => {
        const freq = sub.plan?.frequency ?? 'monthly';
        const name = sub.plan?.name ? `${sub.plan.name} · ${freq}` : 'Plan unavailable';
        planNames.add(name);
        planAmounts.add(formatAmount(sub.plan?.price ?? 0));
        const effectiveEndDate = sub.new_end_date ?? sub.end_date;
        if (effectiveEndDate && (!latestEndDate || effectiveEndDate > latestEndDate)) latestEndDate = effectiveEndDate;
      });

      const cells: MonthCell[] = Array.from({ length: 12 }, () => ({ covered: false, isStart: false }));
      const userPayments = paymentsByUser.get(userId) ?? [];
      userPayments.forEach((payment) => {
        if (payment.status !== 'success' || !payment.subscription_id) return;
        const subInfo = subMap.get(payment.subscription_id);
        if (!subInfo) return;
        const duration = subInfo.duration;
        const paymentDate = new Date(payment.created_at);
        const startAbs = paymentDate.getUTCFullYear() * 12 + paymentDate.getUTCMonth();
        for (let i = 0; i < duration; i++) {
          const abs = startAbs + i;
          const rel = abs - year * 12;
          if (rel < 0 || rel > 11) continue;
          cells[rel].covered = true;
          if (i === 0) {
            cells[rel].isStart = true;
            cells[rel].modal = {
              planName: subInfo.planName,
              startDate: subInfo.startDate,
              endDate: subInfo.endDate,
              address: subInfo.address,
              amount: payment.amount,
            };
          }
        }
      });

      customerRows.set(userId, {
        id: userId,
        name: profile?.full_name ?? 'Name not set',
        mobile: profile?.mobile ?? '',
        planName: Array.from(planNames).join(' · '),
        planAmount: Array.from(planAmounts).join(' · '),
        endDate: formatDate(latestEndDate || null),
        monthCells: cells,
      });
    });

    const nextRows = Array.from(customerRows.values());
    nextRows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    setRows(nextRows);
    setPage(1);
    setLoading(false);
  }, [year]);

  useEffect(() => { load(); }, [load]);
  usePageVisibility(load);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(query) || row.mobile.includes(query) || row.planName.toLowerCase().includes(query));
  }, [rows, search]);

  useEffect(() => { setPage(1); }, [search, year]);

  const currentYear = new Date().getFullYear();
  const dueThroughMonth = year < currentYear ? 11 : year > currentYear ? -1 : new Date().getMonth();
  const paidCount = filteredRows.reduce((total, row) => total + row.monthCells.filter((c) => c.covered).length, 0);
  const unpaidCount = filteredRows.reduce((total, row) => total + row.monthCells.reduce((count, cell, i) => count + (!cell.covered && i <= dueThroughMonth ? 1 : 0), 0), 0);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <View style={[styles.root, !isWeb && { paddingTop: insets.top }]}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, isWeb && styles.contentWeb, { paddingBottom: insets.bottom + Spacing[8] }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.iconWrap}><CreditCard size={22} color={Colors.primary} strokeWidth={1.8} /></View>
            <View>
              <Text style={[styles.title, isWeb && styles.titleWeb]}>Payment History</Text>
              <Text style={styles.subtitle}>Month-wise subscription payments by customer</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={load}><RefreshCw size={16} color={Colors.textSecondary} strokeWidth={1.8} /></TouchableOpacity>
        </View>

        <View style={styles.toolbar}>
          <View style={styles.searchBox}>
            <Search size={15} color={Colors.textTertiary} strokeWidth={1.8} />
            <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Search customer or plan..." placeholderTextColor={Colors.textTertiary} />
          </View>
          <View style={styles.yearPicker}>
            <TouchableOpacity style={styles.yearButton} onPress={() => setYear((value) => value - 1)}><ChevronLeft size={16} color={Colors.textSecondary} /></TouchableOpacity>
            <Text style={styles.yearText}>{year}</Text>
            <TouchableOpacity style={styles.yearButton} onPress={() => setYear((value) => value + 1)}><ChevronRight size={16} color={Colors.textSecondary} /></TouchableOpacity>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>{filteredRows.length} customers</Text>
          <Text style={[styles.summaryText, { color: Colors.success }]}>{paidCount} paid months</Text>
          <Text style={[styles.summaryText, { color: Colors.error }]}>{unpaidCount} unpaid months</Text>
          <View style={styles.legend}><View style={styles.legendDot} /><Text style={styles.legendText}>Needs attention</Text></View>
        </View>

        {loading ? <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View> : error ? <View style={styles.empty}><Text style={styles.emptyText}>{error}</Text></View> : filteredRows.length === 0 ? <View style={styles.empty}><CreditCard size={34} color={Colors.textTertiary} /><Text style={styles.emptyText}>No subscriptions found</Text></View> : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.heading, styles.customerColumn]}>Customer</Text>
                <Text style={[styles.heading, styles.planColumn]}>Selected plan</Text>
                <Text style={[styles.heading, styles.amountColumn]}>Amount</Text>
                <Text style={[styles.heading, styles.endColumn]}>Ends</Text>
                {MONTHS.map((month) => <Text key={month} style={[styles.heading, styles.monthColumn]}>{month}</Text>)}
              </View>
              {visibleRows.map((row, index) => (
                <View key={row.id} style={[styles.tableRow, index % 2 === 1 && styles.altRow]}>
                  <View style={styles.customerColumn}><Text style={styles.customerName}>{row.name}</Text><Text style={styles.mobile}>{row.mobile}</Text></View>
                  <Text style={[styles.cellText, styles.planColumn]} numberOfLines={2}>{row.planName}</Text>
                  <Text style={[styles.cellText, styles.amountColumn]}>{row.planAmount}</Text>
                  <Text style={[styles.cellText, styles.endColumn]}>{row.endDate}</Text>
                  {row.monthCells.map((cell, monthIndex) => {
                    if (cell.covered && cell.isStart && cell.modal) {
                      return (
                        <TouchableOpacity
                          key={`${row.id}-${monthIndex}`}
                          style={[styles.monthCell, styles.paidCell, styles.startCell]}
                          onPress={() => setModalData(cell.modal!)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.monthText, styles.paidText, styles.startText]}>Paid</Text>
                        </TouchableOpacity>
                      );
                    }
                    if (cell.covered) {
                      return (
                        <View key={`${row.id}-${monthIndex}`} style={[styles.monthCell, styles.paidCell, styles.disabledCell]}>
                          <Text style={[styles.monthText, styles.paidText, styles.disabledText]}>Paid</Text>
                        </View>
                      );
                    }
                    const future = monthIndex > dueThroughMonth;
                    return (
                      <View key={`${row.id}-${monthIndex}`} style={[styles.monthCell, future ? styles.futureCell : styles.unpaidCell]}>
                        <Text style={[styles.monthText, future ? styles.futureText : styles.unpaidText]}>
                          {future ? '—' : 'Unpaid'}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
        )}

        {!loading && !error && filteredRows.length > 0 && (
          <View style={styles.pagination}>
            <Text style={styles.paginationInfo}>Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}</Text>
            <View style={styles.paginationControls}>
              <TouchableOpacity style={[styles.pageButton, currentPage === 1 && styles.disabledButton]} disabled={currentPage === 1} onPress={() => setPage((value) => value - 1)}>
                <ChevronLeft size={16} color={currentPage === 1 ? Colors.textDisabled : Colors.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.pageText}>Page {currentPage} of {totalPages}</Text>
              <TouchableOpacity style={[styles.pageButton, currentPage === totalPages && styles.disabledButton]} disabled={currentPage === totalPages} onPress={() => setPage((value) => value + 1)}>
                <ChevronRight size={16} color={currentPage === totalPages ? Colors.textDisabled : Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Payment details modal */}
      <Modal visible={!!modalData} transparent animationType="fade" onRequestClose={() => setModalData(null)}>
        <View style={styles.overlay}>
          <View style={[styles.modalCard, isWeb && styles.modalCardWeb]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Payment Details</Text>
              <TouchableOpacity onPress={() => setModalData(null)} style={styles.modalCloseBtn}>
                <X size={18} color={Colors.textSecondary} strokeWidth={1.8} />
              </TouchableOpacity>
            </View>
            {modalData && (
              <View style={styles.modalBody}>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Plan</Text>
                  <Text style={styles.modalValue}>{modalData.planName}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Start Date</Text>
                  <Text style={styles.modalValue}>{modalData.startDate}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>End Date</Text>
                  <Text style={styles.modalValue}>{modalData.endDate}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Amount</Text>
                  <Text style={[styles.modalValue, { color: Colors.success }]}>{formatAmount(modalData.amount)}</Text>
                </View>
                <View style={[styles.modalRow, styles.modalAddressRow]}>
                  <View style={styles.modalAddressLabelWrap}>
                    <MapPin size={14} color={Colors.primary} strokeWidth={1.8} />
                    <Text style={styles.modalLabel}>Address</Text>
                  </View>
                  <Text style={[styles.modalValue, styles.modalAddressValue]}>{modalData.address}</Text>
                </View>
              </View>
            )}
            <TouchableOpacity style={styles.modalDoneBtn} onPress={() => setModalData(null)}>
              <Text style={styles.modalDoneBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: { padding: Spacing[4], gap: Spacing[4] },
  contentWeb: { padding: Spacing[8], gap: Spacing[5] },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  iconWrap: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primarySurface },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.textPrimary },
  titleWeb: { fontSize: Typography.size['3xl'] },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },
  refreshButton: { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing[3] },
  searchBox: { flex: 1, maxWidth: 420, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingHorizontal: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  searchInput: { flex: 1, color: Colors.textPrimary, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, paddingVertical: 0 },
  yearPicker: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.md, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  yearButton: { padding: Spacing[3] },
  yearText: { minWidth: 52, textAlign: 'center', fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  summaryRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing[4], padding: Spacing[4], backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  summaryText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  legend: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], marginLeft: 'auto' },
  legendDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#FDE2E2', borderWidth: 1, borderColor: '#E57373' },
  legendText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  table: { minWidth: 1460, backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  tableHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[3], paddingVertical: Spacing[3], backgroundColor: Colors.neutral[50], borderBottomWidth: 1, borderBottomColor: Colors.border },
  tableRow: { flexDirection: 'row', alignItems: 'center', minHeight: 66, paddingHorizontal: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  altRow: { backgroundColor: '#FCFCFA' },
  heading: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.4 },
  customerColumn: { width: 190, paddingRight: Spacing[2] },
  planColumn: { width: 150, paddingRight: Spacing[2] },
  amountColumn: { width: 92, paddingRight: Spacing[2] },
  endColumn: { width: 98, paddingRight: Spacing[2] },
  monthColumn: { width: 68, textAlign: 'center' },
  customerName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  mobile: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 3 },
  cellText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  monthCell: { width: 60, marginHorizontal: 4, paddingVertical: 7, borderRadius: Radius.sm, alignItems: 'center' },
  paidCell: { backgroundColor: '#E8F5E9' },
  startCell: { borderWidth: 1.5, borderColor: Colors.success },
  disabledCell: { opacity: 0.55 },
  unpaidCell: { backgroundColor: '#FDE2E2', borderWidth: 1, borderColor: '#F3A6A6' },
  futureCell: { backgroundColor: Colors.neutral[50] },
  monthText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10 },
  paidText: { color: Colors.success },
  startText: { textDecorationLine: 'underline' },
  disabledText: {},
  unpaidText: { color: Colors.error },
  futureText: { color: Colors.textDisabled },
  center: { minHeight: 220, alignItems: 'center', justifyContent: 'center' },
  empty: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: Spacing[3] },
  emptyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing[3], padding: Spacing[3], backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  paginationInfo: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  paginationControls: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  pageButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  disabledButton: { opacity: 0.45 },
  pageText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textSecondary },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: Spacing[5] },
  modalCard: { width: '100%', maxWidth: 420, backgroundColor: Colors.white, borderRadius: Radius.lg, overflow: 'hidden', ...Shadow.lg },
  modalCardWeb: { maxWidth: 460 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  modalCloseBtn: { padding: Spacing[1] },
  modalBody: { padding: Spacing[5], gap: Spacing[4] },
  modalRow: { gap: Spacing[1] },
  modalLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.4 },
  modalValue: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  modalAddressLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  modalAddressRow: { gap: Spacing[2] },
  modalAddressValue: { lineHeight: 20 },
  modalDoneBtn: { marginHorizontal: Spacing[5], marginBottom: Spacing[5], paddingVertical: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  modalDoneBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
});
