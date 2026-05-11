import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CircleDollarSign, TrendingUp, Clock } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format } from 'date-fns';
import StatusChip from '@/components/ui/StatusChip';

const GRADIENT_TOP = '#2A1A0A';
const GRADIENT_BOT = '#7A4A0E';
const ACCENT_GOLD = '#C8962A';

const FILTER_OPTIONS = [
  { key: 'all', label: 'All Payments' },
  { key: 'completed', label: 'Received' },
  { key: 'pending', label: 'Pending' },
];

export default function VendorPayments() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { statusFilter: initialFilter } = useLocalSearchParams<{ statusFilter?: string }>();
  const { profile } = useAuthStore();
  const isWeb = Platform.OS === 'web';

  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const f = Array.isArray(initialFilter) ? initialFilter[0] : initialFilter;
    if (f) setActiveFilter(f);
  }, [initialFilter]);

  const load = async (userId?: string) => {
    const uid = userId ?? profile?.id;
    if (!uid) { setLoading(false); setRefreshing(false); return; }
    setErrorMsg(null);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setErrorMsg('Session not found. Please sign in again.');
      setLoading(false); setRefreshing(false); return;
    }

    const { data: vendorData, error: vendorError } = await supabase
      .from('vendors').select('id').eq('user_id', uid).maybeSingle();

    if (vendorError) { setErrorMsg(`Vendor lookup error: ${vendorError.message}`); setLoading(false); setRefreshing(false); return; }
    if (!vendorData) { setErrorMsg('No vendor profile linked to this account.'); setLoading(false); setRefreshing(false); return; }

    const { data, error } = await supabase
      .from('vendor_payments')
      .select('id, amount, status, payment_date, payment_method, notes')
      .eq('vendor_id', vendorData.id)
      .order('payment_date', { ascending: false });

    if (error) { setErrorMsg(`Payments error: ${error.message}`); setLoading(false); setRefreshing(false); return; }
    setPayments(data ?? []);
    setLoading(false); setRefreshing(false);
  };

  useEffect(() => {
    if (profile?.id) load(profile.id);
    else setLoading(false);
  }, [profile?.id]);

  const filteredPayments = payments.filter((p) => {
    if (activeFilter === 'completed') return p.status === 'completed';
    if (activeFilter === 'pending') return p.status === 'pending';
    return true;
  });

  const totalReceived = payments.filter(p => p.status === 'completed').reduce((s, p) => s + Number(p.amount), 0);
  const totalPending = payments.filter(p => p.status === 'pending').reduce((s, p) => s + Number(p.amount), 0);
  const filteredTotal = filteredPayments.reduce((s, p) => s + Number(p.amount), 0);

  const formatCurrency = (amount: number) =>
    `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const containerPadding = isWeb ? 32 : Spacing[4];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[GRADIENT_TOP, GRADIENT_BOT]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.gradientHeader, { paddingTop: isWeb ? 24 : insets.top + Spacing[3] }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <ArrowLeft size={20} color='rgba(255,255,255,0.9)' strokeWidth={2} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.headerIconWrap}>
              <CircleDollarSign size={16} color={ACCENT_GOLD} strokeWidth={1.8} />
            </View>
            <Text style={styles.headerTitle}>Payments</Text>
          </View>
          <View style={{ width: 38 }} />
        </View>

        <View style={[styles.summaryCards, { paddingHorizontal: 0 }]}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconWrap}>
              <TrendingUp size={14} color={ACCENT_GOLD} strokeWidth={1.8} />
            </View>
            <Text style={styles.summaryValue}>{formatCurrency(totalReceived)}</Text>
            <Text style={styles.summaryLabel}>Total Received</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconWrap}>
              <Clock size={14} color='rgba(255,255,255,0.6)' strokeWidth={1.8} />
            </View>
            <Text style={styles.summaryValue}>{formatCurrency(totalPending)}</Text>
            <Text style={styles.summaryLabel}>Pending</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconWrap}>
              <CircleDollarSign size={14} color='rgba(255,255,255,0.6)' strokeWidth={1.8} />
            </View>
            <Text style={styles.summaryValue}>{payments.length}</Text>
            <Text style={styles.summaryLabel}>Transactions</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={[styles.filterRow, { paddingHorizontal: containerPadding }]}>
        {FILTER_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.filterBtn, activeFilter === opt.key && styles.filterBtnActive]}
            onPress={() => setActiveFilter(opt.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterText, activeFilter === opt.key && styles.filterTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!loading && filteredPayments.length > 0 && (
        <View style={[styles.summaryBar, { paddingHorizontal: containerPadding }]}>
          <Text style={styles.summaryBarLabel}>
            {filteredPayments.length} payment{filteredPayments.length !== 1 ? 's' : ''}
          </Text>
          <Text style={styles.summaryBarAmount}>{formatCurrency(filteredTotal)}</Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { padding: containerPadding }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(profile?.id); }} tintColor={ACCENT_GOLD} />
        }
      >
        {loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Loading...</Text>
          </View>
        ) : errorMsg ? (
          <View style={styles.emptyState}>
            <CircleDollarSign size={36} color={Colors.error} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: Colors.error }]}>Error loading payments</Text>
            <Text style={styles.emptyText}>{errorMsg}</Text>
          </View>
        ) : filteredPayments.length === 0 ? (
          <View style={styles.emptyState}>
            <CircleDollarSign size={40} color={Colors.neutral[300]} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>No payments found</Text>
            <Text style={styles.emptyText}>No payments match the selected filter.</Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {filteredPayments.map((pmt, i) => (
              <View
                key={pmt.id}
                style={[styles.listRow, i === filteredPayments.length - 1 && styles.listRowLast]}
              >
                <View style={[styles.iconWrap, {
                  backgroundColor: pmt.status === 'completed' ? Colors.successSurface : Colors.warningSurface,
                }]}>
                  <CircleDollarSign
                    size={17}
                    color={pmt.status === 'completed' ? Colors.success : Colors.warning}
                    strokeWidth={1.8}
                  />
                </View>
                <View style={styles.listInfo}>
                  <Text style={styles.listAmount}>{formatCurrency(Number(pmt.amount))}</Text>
                  <Text style={styles.listDate}>
                    {pmt.payment_date ? format(new Date(pmt.payment_date), 'dd MMM yyyy') : '—'}
                    {pmt.payment_method ? ` · ${pmt.payment_method}` : ''}
                  </Text>
                  {pmt.notes ? <Text style={styles.listNotes}>{pmt.notes}</Text> : null}
                </View>
                <StatusChip status={pmt.status} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0EDE8' },
  gradientHeader: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[5],
    gap: Spacing[3],
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  headerIconWrap: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.lg, color: '#FFFFFF', letterSpacing: -0.2,
  },
  summaryCards: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: Radius.lg,
    padding: Spacing[3],
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  summaryCard: { flex: 1, alignItems: 'center', gap: 4 },
  summaryIconWrap: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  summaryValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: '#FFFFFF' },
  summaryLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: 'rgba(255,255,255,0.55)', letterSpacing: 0.4, textTransform: 'uppercase' },
  summaryDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.2)' },
  filterRow: {
    flexDirection: 'row', gap: Spacing[2],
    paddingVertical: Spacing[3],
    backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  filterBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  filterBtnActive: { backgroundColor: ACCENT_GOLD, borderColor: ACCENT_GOLD },
  filterText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },
  summaryBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing[3],
    backgroundColor: Colors.accentSurface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  summaryBarLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  summaryBarAmount: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: ACCENT_GOLD },
  scrollContent: { gap: Spacing[3], paddingBottom: Spacing[10] },
  emptyState: { paddingVertical: 60, alignItems: 'center', gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  emptyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center' },
  listCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  listRow: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing[4],
    borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: Spacing[3],
  },
  listRowLast: { borderBottomWidth: 0 },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  listInfo: { flex: 1, gap: 3 },
  listAmount: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary },
  listDate: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  listNotes: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },
});
