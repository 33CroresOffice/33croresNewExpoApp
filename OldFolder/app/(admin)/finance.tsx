import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrendingUp, TrendingDown, DollarSign, CreditCard, ArrowUpRight, ArrowDownRight, Receipt, Wallet, ChevronRight, ChartBar as BarChart3, ChartPie as PieChart } from 'lucide-react-native';
import { router } from 'expo-router';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

interface FinanceSummary {
  totalRevenue: number;
  totalRefunds: number;
  netRevenue: number;
  totalVendorPayments: number;
  totalExpenses: number;
  grossProfit: number;
  profitMargin: number;
  activeSubscriptions: number;
  newSubscriptions: number;
}

interface MonthlyBar {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
}

interface CategorySpend {
  category: string;
  amount: number;
  color: string;
}

const PERIOD_OPTIONS = [
  { label: 'This Month', value: 0 },
  { label: 'Last Month', value: 1 },
  { label: '3 Months', value: 3 },
];

const CATEGORY_COLORS: Record<string, string> = {
  delivery:     Colors.primary,
  utilities:    Colors.primaryLight,
  salaries:     Colors.accent,
  marketing:    Colors.secondary,
  packaging:    '#7B68EE',
  equipment:    Colors.secondaryLight,
  rent:         Colors.accentDark,
  miscellaneous: Colors.secondaryDark,
  other:        Colors.neutral[400],
};

export default function FinanceScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState(0);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [monthlyBars, setMonthlyBars] = useState<MonthlyBar[]>([]);
  const [categorySpend, setCategorySpend] = useState<CategorySpend[]>([]);
  const [recentLedger, setRecentLedger] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const periodStart = startOfMonth(subMonths(now, period === 0 ? 0 : period));
      const periodEnd = period === 0 ? now : endOfMonth(subMonths(now, 1));
      const startStr = format(periodStart, 'yyyy-MM-dd');
      const endStr = format(periodEnd, 'yyyy-MM-dd');

      const [paymentsRes, vendorPayRes, expensesRes, subsRes, ledgerRes] = await Promise.all([
        supabase.from('payments').select('amount, status, created_at')
          .gte('created_at', startStr).lte('created_at', endStr + 'T23:59:59'),
        supabase.from('vendor_payments').select('amount, status, payment_date')
          .gte('payment_date', startStr).lte('payment_date', endStr),
        supabase.from('expenses').select('amount, category, expense_date')
          .gte('expense_date', startStr).lte('expense_date', endStr),
        supabase.from('subscriptions').select('status, created_at'),
        supabase.from('finance_ledger').select('*').order('entry_date', { ascending: false }).limit(8),
      ]);

      const payments = paymentsRes.data ?? [];
      const vendorPays = vendorPayRes.data ?? [];
      const expenses = expensesRes.data ?? [];
      const subs = subsRes.data ?? [];
      const ledger = ledgerRes.data ?? [];

      const totalRevenue = payments.filter(p => p.status === 'success').reduce((s, p) => s + p.amount / 100, 0);
      const totalRefunds = payments.filter(p => p.status === 'refunded').reduce((s, p) => s + p.amount / 100, 0);
      const netRevenue = totalRevenue - totalRefunds;
      const totalVendorPayments = vendorPays.filter(p => p.status === 'completed').reduce((s, p) => s + Number(p.amount), 0);
      const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
      const grossProfit = netRevenue - totalVendorPayments - totalExpenses;
      const profitMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
      const activeSubscriptions = subs.filter(s => s.status === 'active').length;
      const newSubscriptions = subs.filter(s => {
        const d = new Date(s.created_at);
        return d >= periodStart && d <= periodEnd;
      }).length;

      setSummary({ totalRevenue, totalRefunds, netRevenue, totalVendorPayments, totalExpenses, grossProfit, profitMargin, activeSubscriptions, newSubscriptions });

      const bars: MonthlyBar[] = [];
      for (let i = 5; i >= 0; i--) {
        const m = subMonths(now, i);
        const ms = format(startOfMonth(m), 'yyyy-MM-dd');
        const me = format(endOfMonth(m), 'yyyy-MM-dd');
        const [pR, vpR, eR] = await Promise.all([
          supabase.from('payments').select('amount, status').gte('created_at', ms).lte('created_at', me + 'T23:59:59'),
          supabase.from('vendor_payments').select('amount, status').gte('payment_date', ms).lte('payment_date', me),
          supabase.from('expenses').select('amount').gte('expense_date', ms).lte('expense_date', me),
        ]);
        const rev = (pR.data ?? []).filter(p => p.status === 'success').reduce((s, p) => s + p.amount / 100, 0);
        const vp = (vpR.data ?? []).filter(p => p.status === 'completed').reduce((s, p) => s + Number(p.amount), 0);
        const exp = (eR.data ?? []).reduce((s, e) => s + Number(e.amount), 0);
        bars.push({ month: format(m, 'MMM'), revenue: rev, expenses: vp + exp, profit: rev - vp - exp });
      }
      setMonthlyBars(bars);

      const catMap: Record<string, number> = {};
      expenses.forEach(e => { catMap[e.category] = (catMap[e.category] ?? 0) + Number(e.amount); });
      setCategorySpend(Object.entries(catMap).map(([category, amount]) => ({ category, amount, color: CATEGORY_COLORS[category] ?? Colors.neutral[400] })).sort((a, b) => b.amount - a.amount));
      setRecentLedger(ledger);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const fmt = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  const maxBar = Math.max(...monthlyBars.map(b => Math.max(b.revenue, b.expenses)), 1);

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
            <BarChart3 size={isWeb ? 22 : 18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>Finance</Text>
            <Text style={s.subtitle}>Overview & analytics</Text>
          </View>
        </View>
      </View>

      <View style={[s.periodRow, isWeb && s.periodRowWeb]}>
        {PERIOD_OPTIONS.map(p => (
          <TouchableOpacity key={p.value} style={[s.periodBtn, period === p.value && s.periodBtnActive]} onPress={() => setPeriod(p.value)}>
            <Text style={[s.periodText, period === p.value && s.periodTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, isWeb && s.contentWeb]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {summary && (
          <>
            <View style={[s.metricsGrid, isWeb && s.metricsGridWeb]}>
              <MetricCard icon={<TrendingUp size={18} color={Colors.success} strokeWidth={1.8} />} iconBg="#E8F5E9" label="Gross Revenue" value={fmt(summary.totalRevenue)} sub={`${summary.newSubscriptions} new subs`} isWeb={isWeb} />
              <MetricCard icon={<DollarSign size={18} color={Colors.primary} strokeWidth={1.8} />} iconBg={Colors.primarySurface} label="Net Revenue" value={fmt(summary.netRevenue)} sub={summary.totalRefunds > 0 ? `−${fmt(summary.totalRefunds)} refunds` : 'No refunds'} isWeb={isWeb} />
              <MetricCard icon={<TrendingDown size={18} color={Colors.warning} strokeWidth={1.8} />} iconBg="#FFF3E0" label="Vendor Costs" value={fmt(summary.totalVendorPayments)} sub="Procurement paid" isWeb={isWeb} />
              <MetricCard icon={<Receipt size={18} color={Colors.secondary} strokeWidth={1.8} />} iconBg={Colors.secondarySurface} label="Expenses" value={fmt(summary.totalExpenses)} sub="Operational costs" isWeb={isWeb} />
              <MetricCard icon={<Wallet size={18} color={summary.grossProfit >= 0 ? Colors.success : Colors.error} strokeWidth={1.8} />} iconBg={summary.grossProfit >= 0 ? '#E8F5E9' : '#FFEBEE'} label="Gross Profit" value={fmt(summary.grossProfit)} valueColor={summary.grossProfit >= 0 ? Colors.success : Colors.error} sub={`${summary.profitMargin.toFixed(1)}% margin`} isWeb={isWeb} />
              <MetricCard icon={<CreditCard size={18} color={Colors.accent} strokeWidth={1.8} />} iconBg={Colors.accentSurface} label="Active Subs" value={String(summary.activeSubscriptions)} sub="Currently active" isWeb={isWeb} />
            </View>

            <View>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>Revenue vs. Costs (6 months)</Text>
              </View>
              <View style={s.chartCard}>
                <View style={s.legend}>
                  <LegendDot color={Colors.primary} label="Revenue" />
                  <LegendDot color={Colors.warning} label="Costs" />
                  <LegendDot color={Colors.success} label="Profit" />
                </View>
                <View style={s.barChart}>
                  {monthlyBars.map(bar => (
                    <View key={bar.month} style={s.barGroup}>
                      <View style={s.barStack}>
                        <View style={[s.bar, { height: Math.max((bar.revenue / maxBar) * 120, 2), backgroundColor: Colors.primary, opacity: 0.85 }]} />
                        <View style={[s.bar, { height: Math.max((bar.expenses / maxBar) * 120, 2), backgroundColor: Colors.warning, opacity: 0.75 }]} />
                        <View style={[s.bar, { height: Math.max((Math.max(bar.profit, 0) / maxBar) * 120, 2), backgroundColor: Colors.success, opacity: 0.6 }]} />
                      </View>
                      <Text style={s.barLabel}>{bar.month}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {categorySpend.length > 0 && (
              <View>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>Expense Breakdown</Text>
                  <TouchableOpacity onPress={() => router.push('/(admin)/expenses' as any)} style={s.seeAll}>
                    <Text style={s.seeAllText}>View all</Text>
                    <ChevronRight size={14} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={s.chartCard}>
                  <View style={s.expenseTotal}>
                    <Text style={s.expenseTotalAmt}>{fmt(summary.totalExpenses)}</Text>
                    <Text style={s.expenseTotalLabel}>Total expenses this period</Text>
                  </View>
                  {categorySpend.map(c => {
                    const pct = summary.totalExpenses > 0 ? (c.amount / summary.totalExpenses) * 100 : 0;
                    const label = c.category.charAt(0).toUpperCase() + c.category.slice(1).replace(/_/g, ' ');
                    return (
                      <View key={c.category} style={s.catRow}>
                        <View style={[s.catDot, { backgroundColor: c.color }]} />
                        <Text style={s.catLabel}>{label}</Text>
                        <View style={s.catBarWrap}>
                          <View style={[s.catBar, { width: `${pct}%` as any, backgroundColor: c.color, opacity: 0.6 }]} />
                        </View>
                        <Text style={s.catPct}>{pct.toFixed(0)}%</Text>
                        <Text style={s.catAmt}>{fmt(c.amount)}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            <View>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>Quick Actions</Text>
              </View>
              <View style={[s.quickActions, isWeb && s.quickActionsWeb]}>
                <QuickActionCard icon={<Receipt size={20} color={Colors.primary} strokeWidth={1.8} />} label="Expenses" sub="Track & manage" onPress={() => router.push('/(admin)/expenses' as any)} isWeb={isWeb} />
                <QuickActionCard icon={<CreditCard size={20} color={Colors.secondary} strokeWidth={1.8} />} label="Payments" sub="Customer payments" onPress={() => router.push('/(admin)/finance-payments' as any)} isWeb={isWeb} />
                <QuickActionCard icon={<PieChart size={20} color={Colors.accent} strokeWidth={1.8} />} label="Ledger" sub="All transactions" onPress={() => router.push('/(admin)/ledger' as any)} isWeb={isWeb} />
              </View>
            </View>

            {recentLedger.length > 0 && (
              <View>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>Recent Transactions</Text>
                  <TouchableOpacity onPress={() => router.push('/(admin)/ledger' as any)} style={s.seeAll}>
                    <Text style={s.seeAllText}>View all</Text>
                    <ChevronRight size={14} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={s.chartCard}>
                  {recentLedger.map((entry, idx) => (
                    <View key={entry.id} style={[s.ledgerRow, idx < recentLedger.length - 1 && s.ledgerDivider]}>
                      <View style={[s.ledgerIcon, { backgroundColor: entry.entry_type === 'credit' ? '#E8F5E9' : '#FFEBEE' }]}>
                        {entry.entry_type === 'credit'
                          ? <ArrowUpRight size={14} color={Colors.success} strokeWidth={2} />
                          : <ArrowDownRight size={14} color={Colors.error} strokeWidth={2} />}
                      </View>
                      <View style={s.ledgerInfo}>
                        <Text style={s.ledgerDesc} numberOfLines={1}>{entry.description}</Text>
                        <Text style={s.ledgerMeta}>{entry.party_name ? `${entry.party_name} · ` : ''}{format(new Date(entry.entry_date), 'dd MMM yyyy')}</Text>
                      </View>
                      <Text style={[s.ledgerAmt, { color: entry.entry_type === 'credit' ? Colors.success : Colors.error }]}>
                        {entry.entry_type === 'credit' ? '+' : '−'}{fmt(entry.amount)}
                      </Text>
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

function MetricCard({ icon, iconBg, label, value, sub, valueColor, isWeb }: { icon: React.ReactNode; iconBg: string; label: string; value: string; sub?: string; valueColor?: string; isWeb: boolean }) {
  return (
    <View style={[s.metricCard, isWeb && s.metricCardWeb]}>
      <View style={[s.metricIcon, { backgroundColor: iconBg }]}>{icon}</View>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={[s.metricValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
      {sub ? <Text style={s.metricSub}>{sub}</Text> : null}
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={s.legendItem}>
      <View style={[s.legendDot, { backgroundColor: color }]} />
      <Text style={s.legendLabel}>{label}</Text>
    </View>
  );
}

function QuickActionCard({ icon, label, sub, onPress, isWeb }: { icon: React.ReactNode; label: string; sub: string; onPress: () => void; isWeb: boolean }) {
  return (
    <TouchableOpacity style={[s.qCard, isWeb && s.qCardWeb]} onPress={onPress} activeOpacity={0.8}>
      <View style={s.qIcon}>{icon}</View>
      <View style={s.qText}>
        <Text style={s.qLabel}>{label}</Text>
        <Text style={s.qSub}>{sub}</Text>
      </View>
      <ChevronRight size={14} color={Colors.textTertiary} />
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
  periodRow: { flexDirection: 'row', gap: Spacing[2], paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  periodRowWeb: { paddingHorizontal: Spacing[8] },
  periodBtn: { paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  periodBtnActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  periodText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  periodTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  scroll: { flex: 1 },
  content: { padding: Spacing[5], gap: Spacing[5] },
  contentWeb: { padding: Spacing[8], maxWidth: 1100, alignSelf: 'center', width: '100%', gap: Spacing[6] },
  metricsGrid: { gap: Spacing[3] },
  metricsGridWeb: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[4] },
  metricCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, gap: Spacing[1], ...Shadow.sm },
  metricCardWeb: { flex: 1, minWidth: 160 },
  metricIcon: { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing[1] },
  metricLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  metricValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.textPrimary, letterSpacing: -0.5 },
  metricSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[3] },
  sectionTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.primary },
  chartCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  legend: { flexDirection: 'row', gap: Spacing[4], marginBottom: Spacing[4] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1] },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing[2], height: 140 },
  barGroup: { flex: 1, alignItems: 'center', gap: Spacing[1] },
  barStack: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, flex: 1 },
  bar: { flex: 1, borderRadius: 3, minHeight: 2 },
  barLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary },
  expenseTotal: { alignItems: 'center', paddingBottom: Spacing[4], borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: Spacing[3] },
  expenseTotalAmt: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['3xl'], color: Colors.textPrimary, letterSpacing: -0.8 },
  expenseTotalLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 2 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[2] },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary, width: 90 },
  catBarWrap: { flex: 1, height: 6, backgroundColor: Colors.neutral[100], borderRadius: 3, overflow: 'hidden' },
  catBar: { height: 6, borderRadius: 3 },
  catPct: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, width: 32, textAlign: 'right' },
  catAmt: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary, width: 72, textAlign: 'right' },
  quickActions: { gap: Spacing[3] },
  quickActionsWeb: { flexDirection: 'row', gap: Spacing[4] },
  qCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', alignItems: 'center', gap: Spacing[3], ...Shadow.sm },
  qCardWeb: { flex: 1 },
  qIcon: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  qText: { flex: 1 },
  qLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  qSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingVertical: Spacing[3] },
  ledgerDivider: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  ledgerIcon: { width: 32, height: 32, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  ledgerInfo: { flex: 1 },
  ledgerDesc: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  ledgerMeta: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  ledgerAmt: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm },
});
