import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ModuleGuard from '@/components/admin/ModuleGuard';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Activity,
  AlertCircle,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  IndianRupee,
  PackageCheck,
  Receipt,
  RefreshCw,
  Truck,
  Users,
  WalletCards,
  ChevronDown,
  ChevronUp,
  Package,
} from 'lucide-react-native';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { Colors, Radius, Shadow, Spacing, Typography } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

interface MonthlyReport {
  subscriptions: number;
  renewals: number;
  expiredSubscriptions: number;
  assignedOrders: number;
  deliveries: number;
  attendance: number;
  presentAttendance: number;
  absentAttendance: number;
  leaveAttendance: number;
  halfDayAttendance: number;
  vendorPayments: number;
  vendorPaymentCount: number;
  riderPayouts: number;
  riderPayoutCount: number;
  revenue: number;
  subscriptionRevenue: number;
  customOrderRevenue: number;
  expenses: number;
  expenseCount: number;
}

interface SummaryCardConfig {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  color: string;
  background: string;
}

interface ProcurementFlowerRow {
  flowerName: string;
  unit: string;
  quantity: number;
  orderCount: number;
  purchaseAmount: number;
  paidAmount: number;
  pendingAmount: number;
}

interface ProcurementVendorRow {
  vendorName: string;
  orderCount: number;
  purchaseAmount: number;
  paidAmount: number;
  pendingAmount: number;
  flowers: ProcurementFlowerRow[];
}

const EMPTY_REPORT: MonthlyReport = {
  subscriptions: 0,
  renewals: 0,
  expiredSubscriptions: 0,
  assignedOrders: 0,
  deliveries: 0,
  attendance: 0,
  presentAttendance: 0,
  absentAttendance: 0,
  leaveAttendance: 0,
  halfDayAttendance: 0,
  vendorPayments: 0,
  vendorPaymentCount: 0,
  riderPayouts: 0,
  riderPayoutCount: 0,
  revenue: 0,
  subscriptionRevenue: 0,
  customOrderRevenue: 0,
  expenses: 0,
  expenseCount: 0,
};

const money = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;
const count = (value: number) => value.toLocaleString('en-IN');

function rangeForMonth(month: Date) {
  const start = format(startOfMonth(month), 'yyyy-MM-dd');
  const end = format(endOfMonth(month), 'yyyy-MM-dd');
  return { start, end, endTimestamp: `${end}T23:59:59` };
}

function procurementMonthKey(order: { requirement_date?: string | null; order_date?: string | null; created_at?: string | null }): string {
  return (order.requirement_date ?? order.order_date ?? order.created_at ?? '').slice(0, 7);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] ?? character));
}

export default function MonthlyReportScreen() {
  return (
    <ModuleGuard module="finance">
      <MonthlyReportContent />
    </ModuleGuard>
  );
}

function MonthlyReportContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [report, setReport] = useState<MonthlyReport>(EMPTY_REPORT);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [exportMessage, setExportMessage] = useState('');
  const [procurementRows, setProcurementRows] = useState<ProcurementVendorRow[]>([]);
  const [expandedVendors, setExpandedVendors] = useState<Record<string, boolean>>({});

  const period = useMemo(() => rangeForMonth(selectedMonth), [selectedMonth]);
  const monthKey = format(selectedMonth, 'yyyy-MM');
  const currentMonth = startOfMonth(new Date());
  const selectedYear = selectedMonth.getFullYear();
  const currentYear = currentMonth.getFullYear();
  const years = Array.from({ length: 6 }, (_, index) => currentYear - index);

  const load = useCallback(async () => {
    setError('');
    try {
      const [subscriptionsRes, expiredRes, renewalsRes, assignedRes, deliveriesRes, attendanceRes, vendorPaymentsRes, payoutsRes, paymentsRes, customOrdersRes, expensesRes, dailyRequirementsRes, procurementOrdersRes] = await Promise.all([
        supabase.from('subscriptions').select('id').gte('created_at', period.start).lte('created_at', period.endTimestamp),
        supabase.from('subscriptions').select('id').eq('status', 'expired').gte('end_date', period.start).lte('end_date', period.end),
        supabase.from('subscription_renewal_history').select('id').gte('renewed_at', period.start).lte('renewed_at', period.endTimestamp),
        supabase.from('rider_order_assignments').select('id').gte('assigned_at', period.start).lte('assigned_at', period.endTimestamp),
        supabase.from('rider_order_assignments').select('id').eq('status', 'delivered').gte('delivered_at', period.start).lte('delivered_at', period.endTimestamp),
        supabase.from('rider_attendance').select('status').gte('date', period.start).lte('date', period.end),
        supabase.from('vendor_payments').select('amount, status').eq('status', 'completed').gte('payment_date', period.start).lte('payment_date', period.end),
        supabase.from('rider_payouts').select('final_amount, status').eq('status', 'paid').gte('paid_at', period.start).lte('paid_at', period.endTimestamp),
        supabase.from('payments').select('amount, status').eq('status', 'success').gte('created_at', period.start).lte('created_at', period.endTimestamp),
        supabase.from('custom_orders').select('total_price, payment_status').eq('payment_status', 'paid').gte('created_at', period.start).lte('created_at', period.endTimestamp),
        supabase.from('expenses').select('amount').gte('expense_date', period.start).lte('expense_date', period.end),
        supabase.from('daily_requirements').select('id, requirement_date, flower_type_id, total_quantity, unit_type, procurement_order_id').gte('requirement_date', period.start).lte('requirement_date', period.end),
        supabase.from('procurement_orders').select('id, vendor_id, requirement_date, order_date, created_at, total_amount, status, vendor:vendors(business_name), items:procurement_order_items(id, flower_type_id, quantity, unit_type, price_per_unit, total_price, flower:flower_types(display_name, unit_type))'),
      ]);

      const queryError = [subscriptionsRes, expiredRes, renewalsRes, assignedRes, deliveriesRes, attendanceRes, vendorPaymentsRes, payoutsRes, paymentsRes, customOrdersRes, expensesRes, dailyRequirementsRes, procurementOrdersRes].find(result => result.error)?.error;
      if (queryError) {
        throw new Error(queryError.message);
      }

      const attendance = attendanceRes.data ?? [];
      const vendorPayments = vendorPaymentsRes.data ?? [];
      const payouts = payoutsRes.data ?? [];
      const payments = paymentsRes.data ?? [];
      const customOrders = customOrdersRes.data ?? [];
      const expenses = expensesRes.data ?? [];
      const dailyRequirementOrderIds = new Set(((dailyRequirementsRes.data ?? []) as any[]).map(requirement => requirement.procurement_order_id).filter(Boolean));
      const procurementOrders = ((procurementOrdersRes.data ?? []) as any[]).filter(order => procurementMonthKey(order) === monthKey || dailyRequirementOrderIds.has(order.id));
      const procurementOrderIds = procurementOrders.filter(order => order.status !== 'cancelled').map(order => order.id as string);
      const procurementPaymentsRes = procurementOrderIds.length > 0
        ? await supabase.from('vendor_payments').select('procurement_order_id, amount, status').in('procurement_order_id', procurementOrderIds).eq('status', 'completed')
        : { data: [], error: null };
      if (procurementPaymentsRes.error) throw new Error(procurementPaymentsRes.error.message);
      const paidByOrder = new Map<string, number>();
      (procurementPaymentsRes.data ?? []).forEach((payment: any) => {
        paidByOrder.set(payment.procurement_order_id, (paidByOrder.get(payment.procurement_order_id) ?? 0) + Number(payment.amount ?? 0));
      });
      const vendorMap = new Map<string, { vendorName: string; orderIds: Set<string>; purchaseAmount: number; paidAmount: number; flowers: Map<string, { flowerName: string; unit: string; quantity: number; orderIds: Set<string>; purchaseAmount: number; paidAmount: number }> }>();
      procurementOrders.filter(order => order.status !== 'cancelled').forEach(order => {
        const vendorId = order.vendor_id as string;
        const vendor = vendorMap.get(vendorId) ?? { vendorName: order.vendor?.business_name ?? 'Unknown vendor', orderIds: new Set<string>(), purchaseAmount: 0, paidAmount: 0, flowers: new Map() };
        const orderTotal = Number(order.total_amount ?? 0);
        const paidAmount = Math.min(Math.max(paidByOrder.get(order.id) ?? 0, 0), Math.max(orderTotal, 0));
        vendor.orderIds.add(order.id);
        vendor.purchaseAmount += orderTotal;
        vendor.paidAmount += paidAmount;
        (order.items ?? []).forEach((item: any) => {
          const flowerId = item.flower_type_id as string;
          const itemAmount = Number(item.total_price ?? (Number(item.quantity ?? 0) * Number(item.price_per_unit ?? 0)));
          const flower = vendor.flowers.get(flowerId) ?? { flowerName: item.flower?.display_name ?? 'Unknown flower', unit: item.unit_type ?? item.flower?.unit_type ?? '—', quantity: 0, orderIds: new Set<string>(), purchaseAmount: 0, paidAmount: 0 };
          const paidShare = orderTotal > 0 ? paidAmount * Math.max(itemAmount, 0) / orderTotal : 0;
          flower.quantity += Number(item.quantity ?? 0);
          flower.orderIds.add(order.id);
          flower.purchaseAmount += itemAmount;
          flower.paidAmount += paidShare;
          vendor.flowers.set(flowerId, flower);
        });
        vendorMap.set(vendorId, vendor);
      });
      setProcurementRows(Array.from(vendorMap.values()).map(vendor => ({
        vendorName: vendor.vendorName,
        orderCount: vendor.orderIds.size,
        purchaseAmount: vendor.purchaseAmount,
        paidAmount: vendor.paidAmount,
        pendingAmount: Math.max(vendor.purchaseAmount - vendor.paidAmount, 0),
        flowers: Array.from(vendor.flowers.values()).map(flower => ({
          flowerName: flower.flowerName,
          unit: flower.unit,
          quantity: flower.quantity,
          orderCount: flower.orderIds.size,
          purchaseAmount: flower.purchaseAmount,
          paidAmount: flower.paidAmount,
          pendingAmount: Math.max(flower.purchaseAmount - flower.paidAmount, 0),
        })).sort((a, b) => a.flowerName.localeCompare(b.flowerName)),
      })).sort((a, b) => a.vendorName.localeCompare(b.vendorName)));
      setExpandedVendors({});
      const subscriptionRevenue = payments.reduce((total, payment) => total + Number(payment.amount ?? 0) / 100, 0);
      const customOrderRevenue = customOrders.reduce((total, order) => total + Number(order.total_price ?? 0) / 100, 0);

      setReport({
        subscriptions: subscriptionsRes.data?.length ?? 0,
        renewals: renewalsRes.data?.length ?? 0,
        expiredSubscriptions: expiredRes.data?.length ?? 0,
        assignedOrders: assignedRes.data?.length ?? 0,
        deliveries: deliveriesRes.data?.length ?? 0,
        attendance: attendance.length,
        presentAttendance: attendance.filter(record => record.status === 'present').length,
        absentAttendance: attendance.filter(record => record.status === 'absent').length,
        leaveAttendance: attendance.filter(record => record.status === 'leave').length,
        halfDayAttendance: attendance.filter(record => record.status === 'half_day').length,
        vendorPayments: vendorPayments.reduce((total, payment) => total + Number(payment.amount ?? 0), 0),
        vendorPaymentCount: vendorPayments.length,
        riderPayouts: payouts.reduce((total, payout) => total + Number(payout.final_amount ?? 0), 0),
        riderPayoutCount: payouts.length,
        revenue: subscriptionRevenue + customOrderRevenue,
        subscriptionRevenue,
        customOrderRevenue,
        expenses: expenses.reduce((total, expense) => total + Number(expense.amount ?? 0), 0),
        expenseCount: expenses.length,
      });
    } catch (loadError) {
      console.error('monthly report load error', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Could not load the monthly report.');
      setReport(EMPTY_REPORT);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  usePageVisibility(load);

  useEffect(() => {
    if (!loading) load();
  }, [load, loading]);

  const changeYear = (year: number) => {
    const month = selectedMonth.getMonth();
    const next = new Date(year, month, 1);
    if (next > currentMonth) {
      setSelectedMonth(currentMonth);
    } else {
      setSelectedMonth(next);
    }
  };

  const changeMonth = (monthIndex: number) => {
    const next = new Date(selectedYear, monthIndex, 1);
    if (next <= currentMonth) setSelectedMonth(next);
  };

  const summaryCards: SummaryCardConfig[] = [
    { label: 'Subscriptions', value: count(report.subscriptions), detail: 'New this month', icon: <Users size={18} color={Colors.primary} />, color: Colors.primary, background: Colors.primarySurface },
    { label: 'Renewals', value: count(report.renewals), detail: 'Completed renewals', icon: <RefreshCw size={18} color={Colors.secondary} />, color: Colors.secondary, background: Colors.secondarySurface },
    { label: 'Expired', value: count(report.expiredSubscriptions), detail: 'Ended this month', icon: <CalendarDays size={18} color={Colors.error} />, color: Colors.error, background: '#FFEBEE' },
    { label: 'Assigned Orders', value: count(report.assignedOrders), detail: 'Assigned to riders', icon: <Truck size={18} color={Colors.accentDark} />, color: Colors.accentDark, background: Colors.accentSurface },
    { label: 'Deliveries', value: count(report.deliveries), detail: 'Marked delivered', icon: <PackageCheck size={18} color={Colors.success} />, color: Colors.success, background: '#E8F5E9' },
    { label: 'Attendance', value: count(report.attendance), detail: `${count(report.presentAttendance)} present`, icon: <BarChart3 size={18} color={Colors.primary} />, color: Colors.primary, background: Colors.primarySurface },
    { label: 'Vendor Payments', value: money(report.vendorPayments), detail: `${count(report.vendorPaymentCount)} completed`, icon: <CircleDollarSign size={18} color={Colors.warning} />, color: Colors.warning, background: '#FFF3E0' },
    { label: 'Rider Payouts', value: money(report.riderPayouts), detail: `${count(report.riderPayoutCount)} paid`, icon: <WalletCards size={18} color={Colors.secondary} />, color: Colors.secondary, background: Colors.secondarySurface },
    { label: 'Revenue', value: money(report.revenue), detail: 'Successful payments', icon: <IndianRupee size={18} color={Colors.success} />, color: Colors.success, background: '#E8F5E9' },
    { label: 'Expenses', value: money(report.expenses), detail: `${count(report.expenseCount)} entries`, icon: <Receipt size={18} color={Colors.error} />, color: Colors.error, background: '#FFEBEE' },
  ];

  const exportRows = [
    ['Subscriptions', count(report.subscriptions), 'New subscriptions'],
    ['Renewals', count(report.renewals), 'Completed renewals'],
    ['Expired subscriptions', count(report.expiredSubscriptions), 'Subscriptions ending in month'],
    ['Assigned orders', count(report.assignedOrders), 'Orders assigned to riders'],
    ['Deliveries', count(report.deliveries), 'Orders marked delivered'],
    ['Rider attendance', count(report.attendance), `${report.presentAttendance} present, ${report.absentAttendance} absent, ${report.leaveAttendance} leave, ${report.halfDayAttendance} half day`],
    ['Vendor payments', money(report.vendorPayments), `${report.vendorPaymentCount} completed payments`],
    ['Rider payouts', money(report.riderPayouts), `${report.riderPayoutCount} paid payouts`],
    ['Revenue', money(report.revenue), `Subscriptions ${money(report.subscriptionRevenue)}; custom orders ${money(report.customOrderRevenue)}`],
    ['Expenses', money(report.expenses), `${report.expenseCount} expense entries`],
    ...procurementRows.flatMap(vendor => [
      [`Procurement — ${vendor.vendorName}`, money(vendor.purchaseAmount), `${vendor.orderCount} orders; paid ${money(vendor.paidAmount)}; pending ${money(vendor.pendingAmount)}`],
      ...vendor.flowers.map(flower => [`  ${flower.flowerName}`, `${flower.quantity.toLocaleString('en-IN')} ${flower.unit}`, `${flower.orderCount} orders; ${money(flower.purchaseAmount)} purchase; paid ${money(flower.paidAmount)}; pending ${money(flower.pendingAmount)}`]),
    ]),
  ];

  const exportExcel = () => {
    if (!isWeb) {
      setExportMessage('Excel export is available from the web admin panel.');
      return;
    }
    const csv = [['Monthly Tracking Report', format(selectedMonth, 'MMMM yyyy')], ['Metric', 'Total', 'Details'], ...exportRows]
      .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `monthly-tracking-${monthKey}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setExportMessage('Excel-compatible report downloaded.');
  };

  const exportPdf = () => {
    if (!isWeb) {
      setExportMessage('PDF export is available from the web admin panel.');
      return;
    }
    const tableRows = exportRows.map(row => `<tr><td>${escapeHtml(row[0])}</td><td>${escapeHtml(row[1])}</td><td>${escapeHtml(row[2])}</td></tr>`).join('');
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      setExportMessage('Allow pop-ups to export the PDF.');
      return;
    }
    printWindow.document.write(`<!doctype html><html><head><title>Monthly Tracking Report - ${escapeHtml(format(selectedMonth, 'MMMM yyyy'))}</title><style>body{font-family:Arial,sans-serif;color:#1f2a20;padding:32px}h1{margin:0 0 4px}p{color:#66736a;margin:0 0 24px}table{border-collapse:collapse;width:100%}th,td{text-align:left;border:1px solid #dce3dc;padding:10px}th{background:#edf5ed}td:nth-child(2){font-weight:700;text-align:right}@media print{button{display:none}}</style></head><body><h1>Monthly Tracking Report</h1><p>${escapeHtml(format(selectedMonth, 'MMMM yyyy'))}</p><table><thead><tr><th>Metric</th><th>Total</th><th>Details</th></tr></thead><tbody>${tableRows}</tbody></table><script>window.onload=function(){window.print();}</script></body></html>`);
    printWindow.document.close();
    setExportMessage('Print dialog opened. Choose “Save as PDF” to create the PDF.');
  };

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 0 : insets.top }]}> 
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}><BarChart3 size={isWeb ? 22 : 19} color={Colors.primary} /></View>
          <View><Text style={[styles.title, isWeb && styles.titleWeb]}>Monthly Tracking Report</Text><Text style={styles.subtitle}>Month-wise admin operations and finance summary</Text></View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.exportButton} onPress={exportExcel}><FileSpreadsheet size={16} color={Colors.primary} /><Text style={styles.exportButtonText}>Excel</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.exportButton, styles.pdfButton]} onPress={exportPdf}><FileText size={16} color={Colors.white} /><Text style={styles.pdfButtonText}>PDF</Text></TouchableOpacity>
        </View>
      </View>

      <View style={[styles.filterPanel, isWeb && styles.filterPanelWeb]}>
        <View style={styles.filterHeading}><CalendarDays size={16} color={Colors.primary} /><Text style={styles.filterTitle}>Report month</Text><Text style={styles.selectedLabel}>{format(selectedMonth, 'MMMM yyyy')}</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.yearRow}>
          {years.map(year => <TouchableOpacity key={year} style={[styles.yearChip, year === selectedYear && styles.yearChipActive]} onPress={() => changeYear(year)}><Text style={[styles.yearChipText, year === selectedYear && styles.yearChipTextActive]}>{year}</Text></TouchableOpacity>)}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthRow}>
          {Array.from({ length: 12 }, (_, monthIndex) => {
            const monthDate = new Date(selectedYear, monthIndex, 1);
            const disabled = monthDate > currentMonth;
            return <TouchableOpacity key={monthIndex} disabled={disabled} style={[styles.monthChip, monthIndex === selectedMonth.getMonth() && styles.monthChipActive, disabled && styles.monthChipDisabled]} onPress={() => changeMonth(monthIndex)}><Text style={[styles.monthChipText, monthIndex === selectedMonth.getMonth() && styles.monthChipTextActive, disabled && styles.monthChipTextDisabled]}>{format(monthDate, 'MMM')}</Text></TouchableOpacity>;
          })}
        </ScrollView>
      </View>

      {error ? <View style={styles.errorBanner}><AlertCircle size={15} color={Colors.error} /><Text style={styles.errorText}>{error}</Text></View> : null}
      {exportMessage ? <TouchableOpacity style={styles.messageBanner} onPress={() => setExportMessage('')}><Download size={14} color={Colors.primary} /><Text style={styles.messageText}>{exportMessage}</Text></TouchableOpacity> : null}

      {loading ? <View style={styles.loading}><ActivityIndicator size="large" color={Colors.primary} /></View> : (
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, isWeb && styles.contentWeb]} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
          <View style={styles.reportIntro}><View><Text style={styles.reportTitle}>{format(selectedMonth, 'MMMM yyyy')}</Text><Text style={styles.reportSubtitle}>All figures shown for this month only</Text></View><TouchableOpacity style={styles.monthNav} onPress={() => setSelectedMonth(new Date(selectedYear, selectedMonth.getMonth() - 1, 1))}><ChevronLeft size={16} color={Colors.primary} /><Text style={styles.monthNavText}>Previous month</Text></TouchableOpacity><TouchableOpacity style={styles.monthNav} disabled={monthKey === format(currentMonth, 'yyyy-MM')} onPress={() => setSelectedMonth(new Date(selectedYear, selectedMonth.getMonth() + 1, 1))}><Text style={[styles.monthNavText, monthKey === format(currentMonth, 'yyyy-MM') && styles.disabledText]}>Next month</Text><ChevronRight size={16} color={monthKey === format(currentMonth, 'yyyy-MM') ? Colors.textDisabled : Colors.primary} /></TouchableOpacity></View>
          <View style={[styles.cardsGrid, isWeb && styles.cardsGridWeb]}>{summaryCards.map(card => <View key={card.label} style={styles.summaryCard}><View style={[styles.cardIcon, { backgroundColor: card.background }]}>{card.icon}</View><Text style={styles.cardLabel}>{card.label}</Text><Text style={[styles.cardValue, { color: card.color }]}>{card.value}</Text><Text style={styles.cardDetail}>{card.detail}</Text></View>)}</View>
          <View style={[styles.tablesGrid, isWeb && styles.tablesGridWeb]}>
            <ReportTable title="Operations" icon={<Activity size={17} color={Colors.primary} />} rows={[["Subscriptions", count(report.subscriptions), 'New'], ['Renewals', count(report.renewals), 'Completed'], ['Expired subscriptions', count(report.expiredSubscriptions), 'Ended'], ['Assigned orders', count(report.assignedOrders), 'Assigned'], ['Deliveries', count(report.deliveries), 'Delivered'], ['Rider attendance', count(report.attendance), `${report.presentAttendance} present`]]} />
            <ReportTable title="Financials" icon={<IndianRupee size={17} color={Colors.success} />} rows={[["Revenue", money(report.revenue), 'Payments'], ['Vendor payments', money(report.vendorPayments), `${report.vendorPaymentCount} completed`], ['Rider payouts', money(report.riderPayouts), `${report.riderPayoutCount} paid`], ['Expenses', money(report.expenses), `${report.expenseCount} entries`], ['Subscription revenue', money(report.subscriptionRevenue), 'Successful payments'], ['Custom order revenue', money(report.customOrderRevenue), 'Paid custom orders']]} moneyColumn />
          </View>
          <View style={styles.attendanceCard}><View style={styles.sectionHeader}><View style={styles.sectionTitleWrap}><Users size={17} color={Colors.primary} /><Text style={styles.sectionTitle}>Rider attendance breakdown</Text></View><Text style={styles.sectionPeriod}>{format(selectedMonth, 'MMM yyyy')}</Text></View><View style={styles.attendanceRow}><AttendanceItem label="Present" value={report.presentAttendance} color={Colors.success} /><AttendanceItem label="Absent" value={report.absentAttendance} color={Colors.error} /><AttendanceItem label="Leave" value={report.leaveAttendance} color={Colors.textTertiary} /><AttendanceItem label="Half day" value={report.halfDayAttendance} color={Colors.accentDark} /></View></View>
          <ProcurementReport rows={procurementRows} expandedVendors={expandedVendors} onToggleVendor={(vendorName) => setExpandedVendors(previous => ({ ...previous, [vendorName]: !previous[vendorName] }))} monthLabel={format(selectedMonth, 'MMM yyyy')} />
        </ScrollView>
      )}
    </View>
  );
}

function ReportTable({ title, icon, rows, moneyColumn = false }: { title: string; icon: React.ReactNode; rows: string[][]; moneyColumn?: boolean }) {
  return <View style={styles.tableCard}><View style={styles.sectionHeader}><View style={styles.sectionTitleWrap}>{icon}<Text style={styles.sectionTitle}>{title}</Text></View><Text style={styles.tableHeaderTotal}>Monthly total</Text></View><View style={styles.tableHead}><Text style={[styles.tableHeadText, styles.tableMetric]}>Metric</Text><Text style={[styles.tableHeadText, styles.tableValue]}>{moneyColumn ? 'Amount' : 'Total'}</Text><Text style={[styles.tableHeadText, styles.tableNote]}>Details</Text></View>{rows.map((row, index) => <View key={row[0]} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}><Text style={[styles.tableCell, styles.tableMetric]}>{row[0]}</Text><Text style={[styles.tableCell, styles.tableValue, styles.tableValueStrong]}>{row[1]}</Text><Text style={[styles.tableCell, styles.tableNote]}>{row[2]}</Text></View>)}</View>;
}

function formatVendorQuantity(flowers: ProcurementFlowerRow[]): string {
  const totals = new Map<string, number>();
  flowers.forEach(flower => totals.set(flower.unit, (totals.get(flower.unit) ?? 0) + flower.quantity));
  return Array.from(totals.entries()).map(([unit, quantity]) => `${quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${unit}`).join(', ');
}

function ProcurementReport({ rows, expandedVendors, onToggleVendor, monthLabel }: { rows: ProcurementVendorRow[]; expandedVendors: Record<string, boolean>; onToggleVendor: (vendorName: string) => void; monthLabel: string }) {
  return (
    <View style={styles.procurementCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleWrap}><Package size={17} color={Colors.accentDark} /><Text style={styles.sectionTitle}>Monthly Flower Procurement Report</Text></View>
        <Text style={styles.sectionPeriod}>{monthLabel}</Text>
      </View>
      <Text style={styles.procurementIntro}>Vendor totals from procurement orders created for Daily Requirements, with flower details inside each vendor.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.procurementTable}>
          <View style={styles.procurementHead}>
            <Text style={[styles.procurementHeadText, styles.procurementVendorColumn]}>Vendor / Flower</Text>
            <Text style={[styles.procurementHeadText, styles.procurementQuantityColumn]}>Total Quantity</Text>
            <Text style={[styles.procurementHeadText, styles.procurementOrdersColumn]}>Orders</Text>
            <Text style={[styles.procurementHeadText, styles.procurementMoneyColumn]}>Purchase Amount</Text>
            <Text style={[styles.procurementHeadText, styles.procurementMoneyColumn]}>Paid Amount</Text>
            <Text style={[styles.procurementHeadText, styles.procurementMoneyColumn]}>Pending Amount</Text>
          </View>
          {rows.length === 0 ? (
            <View style={styles.procurementEmpty}><Package size={28} color={Colors.textDisabled} /><Text style={styles.procurementEmptyTitle}>No flower procurement found</Text><Text style={styles.procurementEmptySub}>No procurement orders were recorded for this month.</Text></View>
          ) : rows.map((vendor, vendorIndex) => {
            const expanded = Boolean(expandedVendors[vendor.vendorName]);
            return (
              <View key={vendor.vendorName}>
                <TouchableOpacity style={[styles.procurementVendorRow, vendorIndex % 2 === 1 && styles.tableRowAlt]} onPress={() => onToggleVendor(vendor.vendorName)} activeOpacity={0.75}>
                  <View style={styles.procurementVendorCell}><View style={styles.procurementVendorName}>{expanded ? <ChevronUp size={15} color={Colors.primary} /> : <ChevronDown size={15} color={Colors.primary} />}<Text style={styles.procurementVendorText}>{vendor.vendorName}</Text></View><Text style={styles.procurementHint}>Vendor total</Text></View>
                  <Text style={[styles.procurementCell, styles.procurementQuantityColumn]}>{formatVendorQuantity(vendor.flowers)}</Text>
                  <Text style={[styles.procurementCell, styles.procurementOrdersColumn]}>{count(vendor.orderCount)}</Text>
                  <Text style={[styles.procurementCell, styles.procurementMoneyColumn, styles.procurementStrong]}>{money(vendor.purchaseAmount)}</Text>
                  <Text style={[styles.procurementCell, styles.procurementMoneyColumn, styles.procurementPaid]}>{money(vendor.paidAmount)}</Text>
                  <Text style={[styles.procurementCell, styles.procurementMoneyColumn, styles.procurementPending]}>{money(vendor.pendingAmount)}</Text>
                </TouchableOpacity>
                {expanded && vendor.flowers.map((flower, flowerIndex) => (
                  <View key={`${vendor.vendorName}-${flower.flowerName}`} style={[styles.procurementFlowerRow, flowerIndex % 2 === 1 && styles.tableRowAlt]}>
                    <View style={styles.procurementVendorCell}><Text style={styles.procurementFlowerText}>{flower.flowerName}</Text><Text style={styles.procurementHint}>{flower.unit}</Text></View>
                    <Text style={[styles.procurementCell, styles.procurementQuantityColumn]}>{flower.quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {flower.unit}</Text>
                    <Text style={[styles.procurementCell, styles.procurementOrdersColumn]}>{count(flower.orderCount)}</Text>
                    <Text style={[styles.procurementCell, styles.procurementMoneyColumn]}>{money(flower.purchaseAmount)}</Text>
                    <Text style={[styles.procurementCell, styles.procurementMoneyColumn, styles.procurementPaid]}>{money(flower.paidAmount)}</Text>
                    <Text style={[styles.procurementCell, styles.procurementMoneyColumn, styles.procurementPending]}>{money(flower.pendingAmount)}</Text>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function AttendanceItem({ label, value, color }: { label: string; value: number; color: string }) {
  return <View style={styles.attendanceItem}><Text style={[styles.attendanceValue, { color }]}>{value.toLocaleString('en-IN')}</Text><Text style={styles.attendanceLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing[4], paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerWeb: { paddingHorizontal: Spacing[8], paddingVertical: Spacing[5] },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  headerIcon: { width: 42, height: 42, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primarySurface },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  titleWeb: { fontSize: Typography.size['2xl'] },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: Spacing[2] },
  exportButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1], paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  exportButtonText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary },
  pdfButton: { backgroundColor: Colors.primary },
  pdfButtonText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  filterPanel: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], gap: Spacing[2] },
  filterPanelWeb: { paddingHorizontal: Spacing[8] },
  filterHeading: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  filterTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  selectedLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary, marginLeft: Spacing[1] },
  yearRow: { gap: Spacing[2], paddingVertical: Spacing[1] },
  yearChip: { paddingVertical: Spacing[1], paddingHorizontal: Spacing[3], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  yearChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  yearChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textSecondary },
  yearChipTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  monthRow: { gap: Spacing[2], paddingVertical: Spacing[1] },
  monthChip: { minWidth: 52, alignItems: 'center', paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  monthChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  monthChipDisabled: { opacity: 0.42 },
  monthChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textSecondary },
  monthChipTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  monthChipTextDisabled: { color: Colors.textDisabled },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingHorizontal: Spacing[5], paddingVertical: Spacing[2], backgroundColor: '#FFEBEE' },
  errorText: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error },
  messageBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingHorizontal: Spacing[5], paddingVertical: Spacing[2], backgroundColor: Colors.primarySurface },
  messageText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.primary },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { padding: Spacing[5], gap: Spacing[4] },
  contentWeb: { padding: Spacing[8], maxWidth: 1280, alignSelf: 'center', width: '100%', gap: Spacing[5] },
  reportIntro: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flexWrap: 'wrap' },
  reportTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  reportSubtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 2 },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, marginLeft: 'auto' },
  monthNavText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.primary },
  disabledText: { color: Colors.textDisabled },
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[3] },
  cardsGridWeb: { gap: Spacing[4] },
  summaryCard: { width: '47%', minHeight: 142, flexGrow: 1, flexBasis: 160, padding: Spacing[4], borderRadius: Radius.lg, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  cardIcon: { width: 34, height: 34, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing[2] },
  cardLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  cardValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, marginTop: 4 },
  cardDetail: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 3 },
  tablesGrid: { gap: Spacing[4] },
  tablesGridWeb: { flexDirection: 'row', alignItems: 'flex-start' },
  tableCard: { flex: 1, minWidth: 300, overflow: 'hidden', backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing[2], padding: Spacing[4], borderBottomWidth: 1, borderBottomColor: Colors.border },
  sectionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  sectionTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  tableHeaderTotal: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  tableHead: { flexDirection: 'row', paddingHorizontal: Spacing[4], paddingVertical: Spacing[2], backgroundColor: Colors.neutral[50] },
  tableHeadText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], borderTopWidth: 1, borderTopColor: Colors.divider },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  tableCell: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tableMetric: { flex: 1.2 },
  tableValue: { width: 104, textAlign: 'right' },
  tableValueStrong: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textPrimary },
  tableNote: { flex: 1, textAlign: 'right', marginLeft: Spacing[2], color: Colors.textTertiary },
  attendanceCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  sectionPeriod: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textTertiary },
  attendanceRow: { flexDirection: 'row', padding: Spacing[4], gap: Spacing[3] },
  attendanceItem: { flex: 1, alignItems: 'center', paddingVertical: Spacing[3], backgroundColor: Colors.neutral[50], borderRadius: Radius.md },
  attendanceValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl },
  attendanceLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 3 },
  procurementCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  procurementIntro: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, lineHeight: 17, color: Colors.textTertiary, paddingHorizontal: Spacing[4], paddingBottom: Spacing[3] },
  procurementTable: { minWidth: 900 },
  procurementHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], backgroundColor: Colors.neutral[50], borderTopWidth: 1, borderTopColor: Colors.border },
  procurementHeadText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.45 },
  procurementVendorColumn: { width: 230 },
  procurementQuantityColumn: { width: 150, textAlign: 'right' },
  procurementOrdersColumn: { width: 78, textAlign: 'right' },
  procurementMoneyColumn: { width: 138, textAlign: 'right' },
  procurementVendorRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], borderTopWidth: 1, borderTopColor: Colors.divider },
  procurementFlowerRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: Spacing[8], paddingRight: Spacing[4], paddingVertical: Spacing[3], borderTopWidth: 1, borderTopColor: Colors.divider, backgroundColor: '#FCFDFB' },
  procurementVendorCell: { width: 230 },
  procurementVendorName: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1] },
  procurementVendorText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  procurementFlowerText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  procurementHint: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  procurementCell: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  procurementStrong: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textPrimary },
  procurementPaid: { color: Colors.success },
  procurementPending: { color: Colors.warning },
  procurementEmpty: { alignItems: 'center', justifyContent: 'center', padding: Spacing[8], gap: Spacing[2] },
  procurementEmptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  procurementEmptySub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
});
