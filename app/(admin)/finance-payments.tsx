import React, { useEffect, useState, useCallback } from 'react';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreditCard, Search, ArrowLeft, CircleCheck as CheckCircle, Circle as XCircle, Clock, RotateCcw, Flower2, Sparkles, X } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { format, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { PaymentStatus } from '@/types/database';
import DatePickerField from '@/components/ui/DatePickerField';

interface PaymentRow {
  id: string;
  amount: number;
  status: PaymentStatus;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  created_at: string;
  profile?: { full_name: string | null; mobile: string };
  subscription?: { plan?: { name: string } };
}

interface CustomPaymentRow {
  id: string;
  total_price: number;
  payment_status: string;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  created_at: string;
  order_type: string | null;
  profile?: { full_name: string | null; mobile: string };
}

const PERIOD_OPTIONS = [
  { label: 'This Month', value: 0 },
  { label: 'Last Month', value: 1 },
  { label: '3 Months', value: 3 },
  { label: 'All Time', value: -1 },
];

const STATUS_TABS: { label: string; value: PaymentStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Success', value: 'success' },
  { label: 'Pending', value: 'pending' },
];

const STATUS_CONFIG: Record<PaymentStatus, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  success:  { label: 'Success',  bg: '#E8F5E9', text: Colors.success, icon: <CheckCircle size={12} color={Colors.success} strokeWidth={2} /> },
  pending:  { label: 'Pending',  bg: Colors.accentSurface, text: Colors.accentDark, icon: <Clock size={12} color={Colors.accentDark} strokeWidth={2} /> },
  failed:   { label: 'Failed',   bg: '#FFEBEE', text: Colors.error, icon: <XCircle size={12} color={Colors.error} strokeWidth={2} /> },
  refunded: { label: 'Refunded', bg: Colors.neutral[100], text: Colors.textSecondary, icon: <RotateCcw size={12} color={Colors.textSecondary} strokeWidth={2} /> },
};

const CUSTOM_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  paid:     { label: 'Paid',     bg: '#E8F5E9', text: Colors.success, icon: <CheckCircle size={12} color={Colors.success} strokeWidth={2} /> },
  pending:  { label: 'Pending',  bg: Colors.accentSurface, text: Colors.accentDark, icon: <Clock size={12} color={Colors.accentDark} strokeWidth={2} /> },
  unpaid:   { label: 'Unpaid',   bg: '#FFEBEE', text: Colors.error, icon: <XCircle size={12} color={Colors.error} strokeWidth={2} /> },
};

const SOURCE_TABS = [
  { key: 'subscription', label: 'Subscription', icon: <Flower2 size={14} strokeWidth={1.8} /> },
  { key: 'customization', label: 'Customization', icon: <Sparkles size={14} strokeWidth={1.8} /> },
] as const;

type SourceTab = (typeof SOURCE_TABS)[number]['key'];

const CUSTOM_STATUS_TABS: { label: string; value: string | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Paid', value: 'paid' },
  { label: 'Pending', value: 'pending' },
  { label: 'Unpaid', value: 'unpaid' },
];

export default function FinancePaymentsScreen() {
  return (
    <ModuleGuard module="finance">
      <FinancePaymentsScreenContent />
    </ModuleGuard>
  );
}

function FinancePaymentsScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [customPayments, setCustomPayments] = useState<CustomPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<PaymentStatus | 'all'>('all');
  const [customTab, setCustomTab] = useState<string | 'all'>('all');
  const [sourceTab, setSourceTab] = useState<SourceTab>(tabParam === 'customization' ? 'customization' : 'subscription');
  const [dateFilter, setDateFilter] = useState(0);
  const [rangeFrom, setRangeFrom] = useState<Date | null>(null);
  const [rangeTo, setRangeTo] = useState<Date | null>(null);
  const [openPicker, setOpenPicker] = useState<'from' | 'to' | null>(null);

  const load = useCallback(async () => {
    try {
      const range = (() => {
        if (dateFilter === -2) {
          if (!rangeFrom || !rangeTo) return null;
          return { from: startOfDay(rangeFrom).toISOString(), to: endOfDay(rangeTo).toISOString() };
        }
        if (dateFilter === -1) return null;
        const now = new Date();
        let fromDate: Date;
        let toDate: Date;
        if (dateFilter === 0) {
          fromDate = startOfMonth(now);
          toDate = now;
        } else if (dateFilter === 1) {
          fromDate = startOfMonth(subMonths(now, 1));
          toDate = endOfMonth(subMonths(now, 1));
        } else {
          fromDate = startOfMonth(subMonths(now, dateFilter - 1));
          toDate = now;
        }
        return { from: fromDate.toISOString(), to: toDate.toISOString() };
      })();

      let subQuery = supabase
        .from('payments')
        .select('*, profile:profiles(full_name, mobile), subscription:subscriptions(plan:subscription_plans(name))')
        .order('created_at', { ascending: false })
        .limit(300);
      let customQuery = supabase
        .from('custom_orders')
        .select('id, total_price, payment_status, razorpay_order_id, razorpay_payment_id, created_at, order_type, profile:profiles(full_name, mobile)')
        .in('payment_status', ['paid', 'pending'])
        .order('created_at', { ascending: false })
        .limit(300);
      if (range) {
        subQuery = subQuery.gte('created_at', range.from).lte('created_at', range.to);
        customQuery = customQuery.gte('created_at', range.from).lte('created_at', range.to);
      }
      const [{ data }, { data: customData }] = await Promise.all([subQuery, customQuery]);
      if (data) setPayments(data as any);
      if (customData) setCustomPayments(customData as any);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateFilter, rangeFrom, rangeTo]);

  const clearRange = useCallback(() => {
    setRangeFrom(null);
    setRangeTo(null);
    setOpenPicker(null);
    setDateFilter(0);
  }, []);

  useEffect(() => { load(); }, [load]);
  usePageVisibility(load);

  const filtered = payments.filter(p => {
    if (tab !== 'all' && p.status !== tab) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (p.profile?.full_name ?? '').toLowerCase().includes(q) ||
        (p.profile?.mobile ?? '').toLowerCase().includes(q) ||
        (p.subscription?.plan?.name ?? '').toLowerCase().includes(q) ||
        (p.razorpay_payment_id ?? p.razorpay_order_id).toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredCustom = customPayments.filter(p => {
    if (customTab !== 'all' && p.payment_status !== customTab) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (p.profile?.full_name ?? '').toLowerCase().includes(q) ||
        (p.profile?.mobile ?? '').toLowerCase().includes(q) ||
        (p.order_type ?? '').toLowerCase().includes(q) ||
        (p.razorpay_payment_id ?? p.razorpay_order_id).toLowerCase().includes(q)
      );
    }
    return true;
  });

  const fmt = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  const totalSuccess = payments.filter(p => p.status === 'success').reduce((s, p) => s + p.amount, 0);
  const totalPending = payments.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0);
  const totalRefunded = payments.filter(p => p.status === 'refunded').reduce((s, p) => s + p.amount, 0);
  const customTotalPaid = customPayments.filter(p => p.payment_status === 'paid').reduce((s, p) => s + p.total_price, 0);
  const customTotalPending = customPayments.filter(p => p.payment_status === 'pending').reduce((s, p) => s + p.total_price, 0);

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
            <CreditCard size={isWeb ? 22 : 18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>Payments</Text>
            <Text style={s.subtitle}>{sourceTab === 'subscription' ? payments.length : customPayments.length} transactions</Text>
          </View>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll} contentContainerStyle={s.tabs}>
        {SOURCE_TABS.map(t => {
          const Icon = t.key === 'subscription' ? Flower2 : Sparkles;
          const active = sourceTab === t.key;
          return (
            <TouchableOpacity key={t.key} style={[s.sourceTabBtn, active && s.sourceTabBtnActive]} onPress={() => setSourceTab(t.key)}>
              <Icon size={14} color={active ? Colors.primary : Colors.textSecondary} strokeWidth={1.8} />
              <Text style={[s.sourceTabText, active && s.sourceTabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {sourceTab === 'subscription' ? (
        <>
      <View style={[s.summaryRow, isWeb && s.summaryRowWeb]}>
        {[
          { label: 'Collected', value: fmt(totalSuccess), color: Colors.success },
          { label: 'Pending', value: fmt(totalPending), color: Colors.accentDark },
          { label: 'Refunded', value: fmt(totalRefunded), color: Colors.error },
        ].map(item => (
          <View key={item.label} style={s.summaryPill}>
            <Text style={s.summaryPillLabel}>{item.label}</Text>
            <Text style={[s.summaryPillValue, { color: item.color }]}>{item.value}</Text>
          </View>
        ))}
      </View>

      <View style={[s.searchRow, isWeb && s.searchRowWeb]}>
        <View style={s.searchWrap}>
          <Search size={14} color={Colors.textTertiary} strokeWidth={1.8} />
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search by name, mobile, plan or reference..." placeholderTextColor={Colors.textDisabled} />
        </View>
        <View style={s.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.periodPills}>
            {PERIOD_OPTIONS.map(p => (
              <TouchableOpacity key={p.value} style={[s.periodPill, dateFilter === p.value && s.periodPillActive]} onPress={() => { setDateFilter(p.value); setRangeFrom(null); setRangeTo(null); }}>
                <Text style={[s.periodPillText, dateFilter === p.value && s.periodPillTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={s.periodDivider} />
          <View style={s.rangeField}>
            <DatePickerField
              label="From"
              compact
              value={rangeFrom}
              open={openPicker === 'from'}
              onOpenChange={(o) => setOpenPicker(o ? 'from' : null)}
              maxDate={rangeTo ?? new Date()}
              onChange={(d) => {
                setRangeFrom(d);
                if (rangeTo && d > rangeTo) setRangeTo(null);
                setDateFilter(-2);
              }}
            />
          </View>
          <View style={s.rangeField}>
            <DatePickerField
              label="To"
              compact
              align="right"
              value={rangeTo}
              open={openPicker === 'to'}
              onOpenChange={(o) => setOpenPicker(o ? 'to' : null)}
              minDate={rangeFrom ?? undefined}
              maxDate={new Date()}
              onChange={(d) => {
                setRangeTo(d);
                setDateFilter(-2);
              }}
            />
          </View>
          {dateFilter === -2 && rangeFrom && rangeTo && (
            <TouchableOpacity style={s.rangeClear} onPress={clearRange}>
              <X size={14} color={Colors.textTertiary} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
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
        </>
      ) : (
        <>
      <View style={[s.summaryRow, isWeb && s.summaryRowWeb]}>
        {[
          { label: 'Collected', value: fmt(customTotalPaid), color: Colors.success },
          { label: 'Pending', value: fmt(customTotalPending), color: Colors.accentDark },
          { label: 'Orders', value: String(customPayments.length), color: Colors.textPrimary },
        ].map(item => (
          <View key={item.label} style={s.summaryPill}>
            <Text style={s.summaryPillLabel}>{item.label}</Text>
            <Text style={[s.summaryPillValue, { color: item.color }]}>{item.value}</Text>
          </View>
        ))}
      </View>

      <View style={[s.searchRow, isWeb && s.searchRowWeb]}>
        <View style={s.searchWrap}>
          <Search size={14} color={Colors.textTertiary} strokeWidth={1.8} />
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search by name, mobile, type or reference..." placeholderTextColor={Colors.textDisabled} />
        </View>
        <View style={s.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.periodPills}>
            {PERIOD_OPTIONS.map(p => (
              <TouchableOpacity key={p.value} style={[s.periodPill, dateFilter === p.value && s.periodPillActive]} onPress={() => { setDateFilter(p.value); setRangeFrom(null); setRangeTo(null); }}>
                <Text style={[s.periodPillText, dateFilter === p.value && s.periodPillTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={s.periodDivider} />
          <View style={s.rangeField}>
            <DatePickerField
              label="From"
              compact
              value={rangeFrom}
              open={openPicker === 'from'}
              onOpenChange={(o) => setOpenPicker(o ? 'from' : null)}
              maxDate={rangeTo ?? new Date()}
              onChange={(d) => {
                setRangeFrom(d);
                if (rangeTo && d > rangeTo) setRangeTo(null);
                setDateFilter(-2);
              }}
            />
          </View>
          <View style={s.rangeField}>
            <DatePickerField
              label="To"
              compact
              align="right"
              value={rangeTo}
              open={openPicker === 'to'}
              onOpenChange={(o) => setOpenPicker(o ? 'to' : null)}
              minDate={rangeFrom ?? undefined}
              maxDate={new Date()}
              onChange={(d) => {
                setRangeTo(d);
                setDateFilter(-2);
              }}
            />
          </View>
          {dateFilter === -2 && rangeFrom && rangeTo && (
            <TouchableOpacity style={s.rangeClear} onPress={clearRange}>
              <X size={14} color={Colors.textTertiary} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll} contentContainerStyle={s.tabs}>
        {CUSTOM_STATUS_TABS.map(t => (
          <TouchableOpacity key={t.value} style={[s.tabBtn, customTab === t.value && s.tabBtnActive]} onPress={() => setCustomTab(t.value)}>
            <Text style={[s.tabText, customTab === t.value && s.tabTextActive]}>
              {t.label} ({t.value === 'all' ? customPayments.length : customPayments.filter(p => p.payment_status === t.value).length})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
        </>
      )}

      {loading ? (
        <View style={s.center}><ActivityIndicator color={Colors.primary} /></View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.content, isWeb && s.contentWeb]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          {sourceTab === 'subscription' ? (
            isWeb ? (
            <View style={s.table}>
              <View style={s.tableHead}>
                <Text style={[s.thCell, { flex: 2 }]}>Customer</Text>
                <Text style={[s.thCell, { flex: 2 }]}>Plan</Text>
                <Text style={[s.thCell, { flex: 2 }]}>Reference</Text>
                <Text style={[s.thCell, { width: 90, textAlign: 'right' }]}>Amount</Text>
                <Text style={[s.thCell, { width: 90, textAlign: 'center' }]}>Status</Text>
                <Text style={[s.thCell, { width: 100, textAlign: 'right' }]}>Date</Text>
              </View>
              {filtered.length === 0 ? (
                <View style={s.emptyState}>
                  <CreditCard size={36} color={Colors.textDisabled} strokeWidth={1.2} />
                  <Text style={s.emptyTitle}>No payments found</Text>
                </View>
              ) : (
                filtered.map((p, idx) => {
                  const cfg = STATUS_CONFIG[p.status];
                  return (
                    <View key={p.id} style={[s.tableRow, idx % 2 === 1 && s.tableRowAlt]}>
                      <View style={[s.tdCell, { flex: 2 }]}>
                        <Text style={s.tdPrimary}>{p.profile?.full_name ?? 'Unknown'}</Text>
                        <Text style={s.tdSub}>{p.profile?.mobile ?? ''}</Text>
                      </View>
                      <Text style={[s.tdCell, { flex: 2 }, s.tdSec]} numberOfLines={1}>{p.subscription?.plan?.name ?? '—'}</Text>
                      <Text style={[s.tdCell, { flex: 2 }, s.tdMono]} numberOfLines={1}>{p.razorpay_payment_id ?? p.razorpay_order_id}</Text>
                      <Text style={[s.tdCell, { width: 90, textAlign: 'right' }, s.tdBold]}>{fmt(p.amount)}</Text>
                      <View style={[s.tdCell, { width: 90, alignItems: 'center' }]}>
                        <View style={[s.statusPill, { backgroundColor: cfg.bg }]}>
                          {cfg.icon}
                          <Text style={[s.statusText, { color: cfg.text }]}>{cfg.label}</Text>
                        </View>
                      </View>
                      <Text style={[s.tdCell, { width: 100, textAlign: 'right' }, s.tdDate]}>{format(new Date(p.created_at), 'dd MMM yyyy')}</Text>
                    </View>
                  );
                })
              )}
            </View>
          ) : (
            filtered.length === 0 ? (
              <View style={s.emptyState}>
                <CreditCard size={36} color={Colors.textDisabled} strokeWidth={1.2} />
                <Text style={s.emptyTitle}>No payments found</Text>
              </View>
            ) : (
              filtered.map(p => {
                const cfg = STATUS_CONFIG[p.status];
                return (
                  <View key={p.id} style={s.mobileCard}>
                    <View style={s.mobileCardInfo}>
                      <Text style={s.mobileCardName}>{p.profile?.full_name ?? 'Unknown'}</Text>
                      <Text style={s.mobileCardSub}>{p.subscription?.plan?.name ?? '—'} · {p.profile?.mobile ?? ''}</Text>
                      <Text style={s.mobileCardRef} numberOfLines={1}>{p.razorpay_payment_id ?? p.razorpay_order_id}</Text>
                    </View>
                    <View style={s.mobileCardRight}>
                      <Text style={s.mobileCardAmt}>{fmt(p.amount)}</Text>
                      <View style={[s.statusPill, { backgroundColor: cfg.bg }]}>
                        <Text style={[s.statusText, { color: cfg.text }]}>{cfg.label}</Text>
                      </View>
                      <Text style={s.mobileCardDate}>{format(new Date(p.created_at), 'dd MMM yy')}</Text>
                    </View>
                  </View>
                );
              })
            )
          )
          ) : (
            isWeb ? (
            <View style={s.table}>
              <View style={s.tableHead}>
                <Text style={[s.thCell, { flex: 2 }]}>Customer</Text>
                <Text style={[s.thCell, { flex: 2 }]}>Order Type</Text>
                <Text style={[s.thCell, { flex: 2 }]}>Reference</Text>
                <Text style={[s.thCell, { width: 90, textAlign: 'right' }]}>Amount</Text>
                <Text style={[s.thCell, { width: 90, textAlign: 'center' }]}>Status</Text>
                <Text style={[s.thCell, { width: 100, textAlign: 'right' }]}>Date</Text>
              </View>
              {filteredCustom.length === 0 ? (
                <View style={s.emptyState}>
                  <Sparkles size={36} color={Colors.textDisabled} strokeWidth={1.2} />
                  <Text style={s.emptyTitle}>No customization payments found</Text>
                </View>
              ) : (
                filteredCustom.map((p, idx) => {
                  const cfg = CUSTOM_STATUS_CONFIG[p.payment_status] ?? CUSTOM_STATUS_CONFIG.unpaid;
                  return (
                    <View key={p.id} style={[s.tableRow, idx % 2 === 1 && s.tableRowAlt]}>
                      <View style={[s.tdCell, { flex: 2 }]}>
                        <Text style={s.tdPrimary}>{p.profile?.full_name ?? 'Unknown'}</Text>
                        <Text style={s.tdSub}>{p.profile?.mobile ?? ''}</Text>
                      </View>
                      <Text style={[s.tdCell, { flex: 2 }, s.tdSec]} numberOfLines={1}>{p.order_type === 'garland' ? 'Custom Garland' : 'Custom Flowers'}</Text>
                      <Text style={[s.tdCell, { flex: 2 }, s.tdMono]} numberOfLines={1}>{p.razorpay_payment_id ?? p.razorpay_order_id}</Text>
                      <Text style={[s.tdCell, { width: 90, textAlign: 'right' }, s.tdBold]}>{fmt(p.total_price)}</Text>
                      <View style={[s.tdCell, { width: 90, alignItems: 'center' }]}>
                        <View style={[s.statusPill, { backgroundColor: cfg.bg }]}>
                          {cfg.icon}
                          <Text style={[s.statusText, { color: cfg.text }]}>{cfg.label}</Text>
                        </View>
                      </View>
                      <Text style={[s.tdCell, { width: 100, textAlign: 'right' }, s.tdDate]}>{format(new Date(p.created_at), 'dd MMM yyyy')}</Text>
                    </View>
                  );
                })
              )}
            </View>
          ) : (
            filteredCustom.length === 0 ? (
              <View style={s.emptyState}>
                <Sparkles size={36} color={Colors.textDisabled} strokeWidth={1.2} />
                <Text style={s.emptyTitle}>No customization payments found</Text>
              </View>
            ) : (
              filteredCustom.map(p => {
                const cfg = CUSTOM_STATUS_CONFIG[p.payment_status] ?? CUSTOM_STATUS_CONFIG.unpaid;
                return (
                  <View key={p.id} style={s.mobileCard}>
                    <View style={s.mobileCardInfo}>
                      <Text style={s.mobileCardName}>{p.profile?.full_name ?? 'Unknown'}</Text>
                      <Text style={s.mobileCardSub}>{p.order_type === 'garland' ? 'Custom Garland' : 'Custom Flowers'} · {p.profile?.mobile ?? ''}</Text>
                      <Text style={s.mobileCardRef} numberOfLines={1}>{p.razorpay_payment_id ?? p.razorpay_order_id}</Text>
                    </View>
                    <View style={s.mobileCardRight}>
                      <Text style={s.mobileCardAmt}>{fmt(p.total_price)}</Text>
                      <View style={[s.statusPill, { backgroundColor: cfg.bg }]}>
                        <Text style={[s.statusText, { color: cfg.text }]}>{cfg.label}</Text>
                      </View>
                      <Text style={s.mobileCardDate}>{format(new Date(p.created_at), 'dd MMM yy')}</Text>
                    </View>
                  </View>
                );
              })
            )
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
  searchRow: { paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing[2] },
  searchRowWeb: { paddingHorizontal: Spacing[8] },
  periodPills: { flexDirection: 'row', gap: Spacing[2], alignItems: 'center' },
  periodPill: { paddingVertical: Spacing[1], paddingHorizontal: Spacing[3], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  periodPillActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  periodPillText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  periodPillTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  periodDivider: { width: 1, height: 24, backgroundColor: Colors.border },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  rangeField: { width: 152 },
  rangeClear: { padding: Spacing[2] },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.neutral[50], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2] },
  searchInput: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, outlineStyle: 'none' } as any,
  tabScroll: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, maxHeight: 48, flexGrow: 0 },
  tabs: { flexDirection: 'row', paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], gap: Spacing[2] },
  sourceTabBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  sourceTabBtnActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  sourceTabText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  sourceTabTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
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
  tdMono: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary },
  tdBold: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  tdDate: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 3, paddingHorizontal: Spacing[2], borderRadius: Radius.full },
  statusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  mobileCard: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], marginBottom: Spacing[3], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  mobileCardInfo: { flex: 1 },
  mobileCardName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  mobileCardSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },
  mobileCardRef: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary, marginTop: 2 },
  mobileCardRight: { alignItems: 'flex-end', gap: Spacing[1] },
  mobileCardAmt: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary },
  mobileCardDate: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
});
