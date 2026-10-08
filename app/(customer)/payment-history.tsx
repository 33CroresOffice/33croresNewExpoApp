import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Calendar, IndianRupee, CheckCircle2, Receipt } from 'lucide-react-native';
import { format } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

type Tab = 'subscription' | 'customization';

type SubscriptionPayment = {
  id: string;
  plan_name: string;
  period_start: string;
  period_end: string;
  paid_on: string;
  amount: number;
  subscription_id: string;
};

type CustomPayment = {
  id: string;
  order_type: string;
  delivery_date: string;
  paid_on: string;
  amount: number;
};

export default function PaymentHistoryScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuthStore();
  const userId = session?.user?.id;

  const [activeTab, setActiveTab] = useState<Tab>('subscription');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [subPayments, setSubPayments] = useState<SubscriptionPayment[]>([]);
  const [customPayments, setCustomPayments] = useState<CustomPayment[]>([]);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [payRes, customRes] = await Promise.all([
        supabase
          .from('payments')
          .select('id, subscription_id, amount, created_at, status, subscription:subscriptions(id, start_date, end_date, plan:subscription_plans(name))')
          .eq('user_id', userId)
          .eq('status', 'success')
          .order('created_at', { ascending: false }),
        supabase
          .from('custom_orders')
          .select('id, order_type, delivery_date, total_price, payment_status, updated_at, created_at')
          .eq('user_id', userId)
          .eq('payment_status', 'paid')
          .order('updated_at', { ascending: false }),
      ]);

      const subs: SubscriptionPayment[] = (payRes.data ?? []).map((p: any) => ({
        id: p.id,
        plan_name: p.subscription?.plan?.name ?? 'Subscription',
        period_start: p.subscription?.start_date ?? '',
        period_end: p.subscription?.end_date ?? '',
        paid_on: p.created_at,
        amount: p.amount,
        subscription_id: p.subscription_id ?? p.subscription?.id ?? '',
      }));
      setSubPayments(subs);

      const customs: CustomPayment[] = (customRes.data ?? []).map((c: any) => ({
        id: c.id,
        order_type: c.order_type,
        delivery_date: c.delivery_date,
        paid_on: c.updated_at ?? c.created_at,
        amount: c.total_price ?? 0,
      }));
      setCustomPayments(customs);
    } catch (e) {
      console.error('payment-history load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const fmtAmount = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;
  const fmtDate = (d: string) => {
    if (!d) return '—';
    try { return format(new Date(d), 'dd MMM yyyy'); } catch { return '—'; }
  };
  const fmtDateTime = (d: string) => {
    if (!d) return '—';
    try { return format(new Date(d), 'dd MMM yyyy, hh:mm a'); } catch { return '—'; }
  };

  const onRefresh = () => { setRefreshing(true); load(); };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} strokeWidth={1.8} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment History</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'subscription' && styles.tabActive]}
          onPress={() => setActiveTab('subscription')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'subscription' && styles.tabTextActive]}>Subscription</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'customization' && styles.tabActive]}
          onPress={() => setActiveTab('customization')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'customization' && styles.tabTextActive]}>Customization</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} tintColor={Colors.primary} />}
      >
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : activeTab === 'subscription' ? (
          subPayments.length === 0 ? (
            <EmptyState text="No paid subscription payments yet." />
          ) : (
            subPayments.map((p) => (
              <View key={p.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <View style={styles.iconWrap}>
                      <Calendar size={18} color={Colors.primary} strokeWidth={1.8} />
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={1}>{p.plan_name}</Text>
                  </View>
                  <PaidBadge />
                </View>
                <View style={styles.cardBody}>
                  <Row label="Subscription Period" value={p.period_start && p.period_end ? `${fmtDate(p.period_start)} – ${fmtDate(p.period_end)}` : '—'} />
                  <Row label="Paid On" value={fmtDate(p.paid_on)} />
                  <Row label="Amount" value={fmtAmount(p.amount)} valueStyle={styles.amountText} />
                </View>
              </View>
            ))
          )
        ) : (
          customPayments.length === 0 ? (
            <EmptyState text="No paid customization orders yet." />
          ) : (
            customPayments.map((c) => (
              <View key={c.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <View style={styles.iconWrap}>
                      <IndianRupee size={18} color={Colors.accentDark} strokeWidth={1.8} />
                    </View>
                    <Text style={styles.cardTitle}>{c.order_type === 'garland' ? 'Garland Order' : 'Flower Order'}</Text>
                  </View>
                  <PaidBadge />
                </View>
                <View style={styles.cardBody}>
                  <Row label="Order ID" value={`#${c.id.slice(-8).toUpperCase()}`} />
                  <Row label="Order Date" value={fmtDate(c.delivery_date)} />
                  <Row label="Payment Date & Time" value={fmtDateTime(c.paid_on)} />
                  <Row label="Amount" value={fmtAmount(c.amount)} valueStyle={styles.amountText} />
                </View>
                <TouchableOpacity
                  style={styles.receiptBtn}
                  onPress={() => router.push({ pathname: '/(customer)/custom-order-detail' as any, params: { id: c.id } })}
                  activeOpacity={0.7}
                >
                  <Receipt size={14} color={Colors.primary} strokeWidth={1.8} />
                  <Text style={styles.receiptBtnText}>View Order</Text>
                </TouchableOpacity>
              </View>
            ))
          )
        )}
      </ScrollView>
    </View>
  );
}

function PaidBadge() {
  return (
    <View style={styles.paidBadge}>
      <CheckCircle2 size={13} color={Colors.success} strokeWidth={2.2} />
      <Text style={styles.paidBadgeText}>Paid</Text>
    </View>
  );
}

function Row({ label, value, valueStyle }: { label: string; value: string; valueStyle?: any }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueStyle]}>{value}</Text>
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.emptyWrap}>
      <IndianRupee size={40} color={Colors.textDisabled} strokeWidth={1.2} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing[3],
  },
  backBtn: { padding: Spacing[1] },
  headerTitle: {
    flex: 1,
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  headerSpacer: { width: 22 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[3],
    gap: Spacing[2],
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing[2] + 2,
    borderRadius: Radius.md,
    alignItems: 'center',
    backgroundColor: Colors.neutral[50],
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: {
    backgroundColor: Colors.primarySurface,
    borderColor: Colors.primary,
  },
  tabText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  scroll: { flex: 1 },
  content: { padding: Spacing[5], gap: Spacing[3] },
  loadingWrap: { paddingVertical: 60, alignItems: 'center' },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], flex: 1 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing[2] + 2,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: '#E8F5E9',
  },
  paidBadgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 11,
    color: Colors.success,
  },
  cardBody: { paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], gap: Spacing[2] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  rowValue: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  amountText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  receiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[2] + 2,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    backgroundColor: Colors.neutral[50],
  },
  receiptBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.primary,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: Spacing[3],
  },
  emptyText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});
