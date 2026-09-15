import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CalendarDays, Clock3, Flame, MapPin, MessageSquare, IndianRupee, CreditCard, Package } from 'lucide-react-native';
import { format } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import StatusChip from '@/components/ui/StatusChip';

type PoojaOrder = {
  id: string;
  delivery_date: string;
  delivery_time: string;
  special_instructions: string | null;
  status: string;
  payment_status: string;
  price: number;
  delivery_price: number;
  total_price: number;
  razorpay_payment_id: string | null;
  created_at: string;
  plan: { name: string; description: string | null; image_url: string | null; frequency: string | null } | null;
  address: { street: string | null; locality_id: string | null; apartment_name: string | null; landmark: string | null; city: string | null; pincode: string | null } | null;
};

export default function PoojaOrderDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<PoojaOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const { data: raw, error: queryError } = await supabase
      .from('pooja_orders')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (queryError || !raw) {
      setError(queryError ? queryError.message : 'Pooja order not found.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const [planRes, addrRes] = await Promise.all([
      supabase.from('subscription_plans').select('name, description, image_url, frequency').eq('id', raw.plan_id).maybeSingle(),
      raw.address_id
        ? supabase.from('addresses').select('street, locality_id, apartment_name, landmark, city, pincode').eq('id', raw.address_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    setOrder({
      ...raw,
      plan: planRes.data ?? null,
      address: addrRes.data ?? null,
    } as unknown as PoojaOrder);
    setLoading(false);
    setRefreshing(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;
  if (error || !order) return (
    <View style={[styles.center, { paddingTop: insets.top }]}>
      <Text style={styles.errorText}>{error ?? 'Pooja order not found.'}</Text>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}><Text style={styles.backButtonText}>Go back</Text></TouchableOpacity>
    </View>
  );

  const planName = order.plan?.name ?? 'Pooja Package';
  const addr = order.address;

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing[3], paddingBottom: insets.bottom + Spacing[8] }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
      <TouchableOpacity style={styles.backRow} onPress={() => router.back()}><ArrowLeft size={20} color={Colors.textPrimary} /><Text style={styles.backText}>Pooja Order Details</Text></TouchableOpacity>

      {/* Hero */}
      <View style={styles.heroCard}>
        <View style={styles.heroIcon}><Flame size={24} color={Colors.accent} /></View>
        <View style={styles.heroCopy}>
          <Text style={styles.title}>{planName}</Text>
          <Text style={styles.subtitle}>Pooja Package</Text>
        </View>
        <StatusChip status={order.status} />
      </View>

      {/* Package info */}
      {order.plan?.description ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}><Package size={16} color={Colors.primary} /><Text style={styles.sectionTitle}>Package Details</Text></View>
          <Text style={styles.bodyText}>{order.plan.description}</Text>
        </View>
      ) : null}

      {/* Schedule */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Schedule</Text>
        <DetailRow icon={<CalendarDays size={17} color={Colors.primary} />} label="Delivery date" value={format(new Date(order.delivery_date), 'dd MMM yyyy')} />
        <DetailRow icon={<Clock3 size={17} color={Colors.primary} />} label="Delivery time" value={order.delivery_time} />
        <DetailRow icon={<CalendarDays size={17} color={Colors.primary} />} label="Booked on" value={format(new Date(order.created_at), 'dd MMM yyyy, hh:mm a')} />
      </View>

      {/* Delivery address */}
      {addr ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}><MapPin size={16} color={Colors.primary} /><Text style={styles.sectionTitle}>Delivery Address</Text></View>
          <Text style={styles.bodyText}>
            {addr.street}
            {addr.apartment_name ? `\n${addr.apartment_name}` : ''}
            {addr.landmark ? `\nLandmark: ${addr.landmark}` : ''}
            {addr.locality_id ? `\n${addr.locality_id}` : ''}
            {addr.city ? `\n${addr.city}` : ''}
            {addr.pincode ? ` - ${addr.pincode}` : ''}
          </Text>
        </View>
      ) : null}

      {/* Special instructions */}
      {order.special_instructions ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}><MessageSquare size={16} color={Colors.primary} /><Text style={styles.sectionTitle}>Special Instructions</Text></View>
          <Text style={styles.bodyText}>{order.special_instructions}</Text>
        </View>
      ) : null}

      {/* Payment */}
      <View style={styles.card}>
        <View style={styles.cardHeader}><CreditCard size={16} color={Colors.primary} /><Text style={styles.sectionTitle}>Payment</Text></View>
        <View style={styles.paymentRow}><Text style={styles.paymentLabel}>Package price</Text><Text style={styles.paymentValue}>₹{(order.price / 100).toLocaleString('en-IN')}</Text></View>
        <View style={styles.paymentRow}><Text style={styles.paymentLabel}>Delivery charge</Text><Text style={styles.paymentValue}>₹{(order.delivery_price / 100).toLocaleString('en-IN')}</Text></View>
        <View style={styles.paymentDivider} />
        <View style={styles.paymentRow}><Text style={styles.paymentLabelBold}>Total</Text><Text style={styles.paymentValueBold}>₹{(order.total_price / 100).toLocaleString('en-IN')}</Text></View>
        <View style={styles.paymentStatusRow}>
          <View style={[styles.payChip, { backgroundColor: order.payment_status === 'paid' ? Colors.successSurface : Colors.warning + '16' }]}>
            <Text style={[styles.payChipText, { color: order.payment_status === 'paid' ? Colors.success : Colors.warning }]}>
              {order.payment_status === 'paid' ? 'Paid' : 'Pending'}
            </Text>
          </View>
          {order.razorpay_payment_id ? <Text style={styles.paymentRef} numberOfLines={1}>Ref: {order.razorpay_payment_id}</Text> : null}
        </View>
      </View>

      {/* Booking status */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Booking Status</Text>
        <View style={styles.statusRow}>
          <StatusChip status={order.status} />
          <Text style={styles.statusText}>{STATUS_LABELS[order.status] ?? order.status.replace(/_/g, ' ')}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Order placed, awaiting confirmation',
  confirmed: 'Order confirmed',
  processing: 'Being prepared',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <View style={styles.detailRow}><View style={styles.detailIcon}>{icon}</View><View style={styles.detailCopy}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: Spacing[5], gap: Spacing[4] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing[4], padding: Spacing[6] },
  errorText: { fontFamily: Typography.fontFamily.sansRegular, color: Colors.error, textAlign: 'center' },
  backButton: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  backButtonText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.white },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[2] },
  backText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textPrimary, fontSize: Typography.size.base },
  heroCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  heroIcon: { width: 48, height: 48, borderRadius: Radius.md, backgroundColor: Colors.accentSurface, alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1, gap: 3 },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, gap: Spacing[3], ...Shadow.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  sectionTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.md, color: Colors.textPrimary },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingVertical: Spacing[2], borderTopWidth: 1, borderTopColor: Colors.divider },
  detailIcon: { width: 32, height: 32, borderRadius: Radius.md, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  detailCopy: { flex: 1, gap: 2 },
  detailLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  detailValue: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  bodyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 22 },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing[1] },
  paymentLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  paymentValue: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  paymentDivider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing[2] },
  paymentLabelBold: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  paymentValueBold: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary },
  paymentStatusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], marginTop: Spacing[2] },
  payChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  payChipText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  paymentRef: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  statusText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, textTransform: 'capitalize' },
});
