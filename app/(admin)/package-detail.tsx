import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, IndianRupee, MapPin, Phone, UserRound, Package, CreditCard, FileText } from 'lucide-react-native';
import { format } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import StatusChip from '@/components/ui/StatusChip';

type PoojaOrderDetail = {
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
  user_name: string;
  user_mobile: string;
  plan: { name: string; description: string | null; image_url: string | null; frequency: string | null } | null;
  address: { street: string | null; city: string | null; state: string | null; pincode: string | null; landmark: string | null; apartment_name: string | null } | null;
};

export default function PackageDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<PoojaOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    const { data: order, error: orderError } = await supabase
      .from('pooja_orders')
      .select('id, user_id, delivery_date, delivery_time, special_instructions, status, payment_status, price, delivery_price, total_price, razorpay_payment_id, created_at, plan:subscription_plans(name, description, image_url, frequency), address:addresses(street, city, state, pincode, landmark, apartment_name)')
      .eq('id', id)
      .maybeSingle();

    if (orderError || !order) {
      setError(orderError ? orderError.message : 'Package not found.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    let userName = 'Customer';
    let userMobile = '';
    if ((order as any).user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, mobile')
        .eq('id', (order as any).user_id)
        .maybeSingle();
      if (profile) {
        userName = profile.full_name ?? 'Customer';
        userMobile = profile.mobile ?? '';
      }
    }

    setData({
      ...(order as any),
      user_name: userName,
      user_mobile: userMobile,
    } as PoojaOrderDetail);
    setLoading(false);
    setRefreshing(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;
  if (error || !data) return <View style={styles.center}><Text style={styles.errorText}>{error ?? 'Package not found.'}</Text><TouchableOpacity style={styles.backButton} onPress={() => router.back()}><Text style={styles.backButtonText}>Go back</Text></TouchableOpacity></View>;

  const title = data.plan?.name ?? 'Pooja Package';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
      <TouchableOpacity style={styles.backRow} onPress={() => router.back()}><ArrowLeft size={20} color={Colors.textPrimary} /><Text style={styles.backText}>Package Management</Text></TouchableOpacity>

      <View style={styles.heroCard}>
        <View style={styles.heroIcon}><Package size={24} color={Colors.accent} /></View>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>POOJA PACKAGE</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.orderId}>ID: {data.id}</Text>
        </View>
        <StatusChip status={data.status} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Customer Details</Text>
        <DetailRow icon={<UserRound size={17} color={Colors.primary} />} label="Name" value={data.user_name} />
        <DetailRow icon={<Phone size={17} color={Colors.primary} />} label="Mobile" value={data.user_mobile} />
      </View>

      {data.plan?.description ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}><Package size={16} color={Colors.primary} /><Text style={styles.sectionTitle}>Package Details</Text></View>
          <Text style={styles.bodyText}>{data.plan.description}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Schedule</Text>
        <DetailRow icon={<CalendarDays size={17} color={Colors.primary} />} label="Delivery date" value={format(new Date(data.delivery_date), 'dd MMM yyyy')} />
        <DetailRow icon={<Clock3 size={17} color={Colors.primary} />} label="Delivery time" value={data.delivery_time} />
        <DetailRow icon={<CalendarDays size={17} color={Colors.primary} />} label="Booked on" value={format(new Date(data.created_at), 'dd MMM yyyy, h:mm a')} />
      </View>

      {data.address ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}><MapPin size={16} color={Colors.primary} /><Text style={styles.sectionTitle}>Delivery Address</Text></View>
          <Text style={styles.bodyText}>
            {[data.address.street, data.address.apartment_name, data.address.landmark, data.address.city, data.address.state, data.address.pincode].filter(Boolean).join(', ')}
          </Text>
        </View>
      ) : null}

      {data.special_instructions ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}><FileText size={16} color={Colors.primary} /><Text style={styles.sectionTitle}>Special Instructions</Text></View>
          <Text style={styles.bodyText}>{data.special_instructions}</Text>
        </View>
      ) : null}

      <View style={styles.paymentCard}>
        <View style={styles.cardHeader}><CreditCard size={16} color={Colors.primary} /><Text style={styles.sectionTitle}>Payment Details</Text></View>
        <PaymentRow label="Package price" value={data.price} />
        <PaymentRow label="Delivery charge" value={data.delivery_price} />
        <View style={styles.paymentDivider} />
        <PaymentRow label="Total" value={data.total_price} bold />
        <View style={styles.paymentStatusRow}>
          <View style={[styles.payChip, { backgroundColor: data.payment_status === 'paid' ? Colors.successSurface : Colors.warning + '16' }]}>
            <Text style={[styles.payChipText, { color: data.payment_status === 'paid' ? Colors.success : Colors.warning }]}>
              {data.payment_status === 'paid' ? 'Paid' : 'Pending'}
            </Text>
          </View>
          {data.razorpay_payment_id ? <Text style={styles.paymentRef} numberOfLines={1}>Ref: {data.razorpay_payment_id}</Text> : null}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Booking Status</Text>
        <View style={styles.statusRow}>
          <StatusChip status={data.status} />
          <Text style={styles.statusText}>{data.status.replace(/_/g, ' ')}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <View style={styles.detailRow}><View style={styles.detailIcon}>{icon}</View><View style={styles.detailCopy}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View></View>;
}

function PaymentRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <View style={styles.paymentRow}>
      <Text style={[styles.paymentLabel, bold && styles.paymentLabelBold]}>{label}</Text>
      <View style={styles.paymentValueWrap}>
        <Text style={[styles.paymentValue, bold && styles.paymentValueBold]}>₹{(value / 100).toLocaleString('en-IN')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing[5], paddingTop: Spacing[8], gap: Spacing[4], paddingBottom: Spacing[10] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing[4], padding: Spacing[6] },
  errorText: { fontFamily: Typography.fontFamily.sansRegular, color: Colors.error, textAlign: 'center' },
  backButton: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  backButtonText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.white },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[2] },
  backText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textPrimary, fontSize: Typography.size.base },
  heroCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  heroIcon: { width: 48, height: 48, borderRadius: Radius.md, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1, gap: 3 },
  eyebrow: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, letterSpacing: 1.2, color: Colors.primary },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  orderId: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], gap: Spacing[3], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  sectionTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.md, color: Colors.textPrimary },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingVertical: Spacing[2], borderTopWidth: 1, borderTopColor: Colors.divider },
  detailIcon: { width: 32, height: 32, borderRadius: Radius.md, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  detailCopy: { flex: 1, gap: 2 },
  detailLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  detailValue: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary, textTransform: 'capitalize' },
  bodyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 22 },
  paymentCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], gap: Spacing[3], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing[3], paddingTop: Spacing[2], borderTopWidth: 1, borderTopColor: Colors.divider },
  paymentLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  paymentLabelBold: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  paymentValueWrap: { alignItems: 'flex-end', gap: 2 },
  paymentValue: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  paymentValueBold: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary },
  paymentDivider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing[1] },
  paymentStatusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], marginTop: Spacing[2] },
  payChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  payChipText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  paymentRef: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  statusText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, textTransform: 'capitalize' },
});
