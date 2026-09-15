import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, Flame, IndianRupee, MapPin, Phone, UserRound, Package, CreditCard, FileText } from 'lucide-react-native';
import { format } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import StatusChip from '@/components/ui/StatusChip';

type PoojaOrderDetail = {
  type: 'pooja_package';
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
  address: { full_address: string; locality: string | null; apartment_name: string | null; landmark: string | null; city: string | null; pincode: string | null } | null;
};

type PanditBookingDetail = {
  type: 'pandit_booking';
  id: string;
  customer_name: string;
  customer_mobile: string;
  preferred_date: string;
  preferred_time: string;
  consultation_mode: string;
  notes: string | null;
  status: string;
  created_at: string;
  total_amount: number;
  advance_amount: number;
  remaining_amount: number;
  advance_payment_status: string;
  remaining_payment_status: string;
  provider: { full_name: string; mobile: string; city: string | null; specialization: string | null } | null;
  provider_services: { name: string; description: string | null; duration_minutes: number } | null;
  provider_pooja_setups: { description: string | null; duration_minutes: number; service_fee: number; language: string | null; pooja_type: { name: string } | null; items: { quantity: number; pooja_item: { name: string; unit_type: string } | null }[] } | null;
};

export default function PackageDetailScreen() {
  const { id, type } = useLocalSearchParams<{ id: string; type: string }>();
  const [data, setData] = useState<PoojaOrderDetail | PanditBookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !type) return;
    setError(null);
    if (type === 'pooja_package') {
      const { data: poojaData, error: poojaError } = await supabase
        .from('pooja_orders')
        .select('id, delivery_date, delivery_time, special_instructions, status, payment_status, price, delivery_price, total_price, razorpay_payment_id, created_at, user:profiles(full_name, mobile), plan:subscription_plans(name, description, image_url, frequency), address:addresses(full_address, locality, apartment_name, landmark, city, pincode)')
        .eq('id', id)
        .maybeSingle();
      if (poojaError) { setError('Could not load this package.'); }
      else if (poojaData) {
        const u = (poojaData as any).user;
        setData({
          type: 'pooja_package',
          ...(poojaData as any),
          user_name: u?.full_name ?? 'Customer',
          user_mobile: u?.mobile ?? '',
        } as PoojaOrderDetail);
      }
    } else {
      const { data: bookingData, error: bookingError } = await supabase
        .from('provider_bookings')
        .select('id, customer_name, customer_mobile, preferred_date, preferred_time, consultation_mode, notes, status, created_at, total_amount, advance_amount, remaining_amount, advance_payment_status, remaining_payment_status, provider:service_providers(full_name, mobile, city, specialization), provider_services(name, description, duration_minutes), provider_pooja_setups(description, duration_minutes, service_fee, language, pooja_type:pooja_types(name), items:provider_pooja_items(quantity, pooja_item:pooja_items(name, unit_type)))')
        .eq('id', id)
        .maybeSingle();
      if (bookingError) { setError('Could not load this booking.'); }
      else if (bookingData) {
        setData({ type: 'pandit_booking', ...(bookingData as any) } as PanditBookingDetail);
      }
    }
    setLoading(false);
    setRefreshing(false);
  }, [id, type]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;
  if (error || !data) return <View style={styles.center}><Text style={styles.errorText}>{error ?? 'Package not found.'}</Text><TouchableOpacity style={styles.backButton} onPress={() => router.back()}><Text style={styles.backButtonText}>Go back</Text></TouchableOpacity></View>;

  const isPooja = data.type === 'pooja_package';
  const title = isPooja ? (data as PoojaOrderDetail).plan?.name ?? 'Pooja Package' : (data as PanditBookingDetail).provider_pooja_setups?.pooja_type?.name ?? (data as PanditBookingDetail).provider_services?.name ?? 'Pandit Booking';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
      <TouchableOpacity style={styles.backRow} onPress={() => router.back()}><ArrowLeft size={20} color={Colors.textPrimary} /><Text style={styles.backText}>Package Management</Text></TouchableOpacity>

      {/* Hero */}
      <View style={styles.heroCard}>
        <View style={styles.heroIcon}>{isPooja ? <Package size={24} color={Colors.accent} /> : <Flame size={24} color={Colors.primary} />}</View>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>{isPooja ? 'POOJA PACKAGE' : 'PANDIT BOOKING'}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.orderId}>ID: {data.id}</Text>
        </View>
        <StatusChip status={data.status} />
      </View>

      {/* Customer details */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Customer Details</Text>
        <DetailRow icon={<UserRound size={17} color={Colors.primary} />} label="Name" value={isPooja ? (data as PoojaOrderDetail).user_name : (data as PanditBookingDetail).customer_name} />
        <DetailRow icon={<Phone size={17} color={Colors.primary} />} label="Mobile" value={isPooja ? (data as PoojaOrderDetail).user_mobile : (data as PanditBookingDetail).customer_mobile} />
      </View>

      {/* Package / Pooja details */}
      {isPooja ? (
        <>
          {(data as PoojaOrderDetail).plan?.description ? (
            <View style={styles.card}>
              <View style={styles.cardHeader}><Package size={16} color={Colors.primary} /><Text style={styles.sectionTitle}>Package Details</Text></View>
              <Text style={styles.bodyText}>{(data as PoojaOrderDetail).plan!.description}</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Schedule</Text>
            <DetailRow icon={<CalendarDays size={17} color={Colors.primary} />} label="Delivery date" value={format(new Date((data as PoojaOrderDetail).delivery_date), 'dd MMM yyyy')} />
            <DetailRow icon={<Clock3 size={17} color={Colors.primary} />} label="Delivery time" value={(data as PoojaOrderDetail).delivery_time} />
            <DetailRow icon={<CalendarDays size={17} color={Colors.primary} />} label="Booked on" value={format(new Date(data.created_at), 'dd MMM yyyy, h:mm a')} />
          </View>

          {(data as PoojaOrderDetail).address ? (
            <View style={styles.card}>
              <View style={styles.cardHeader}><MapPin size={16} color={Colors.primary} /><Text style={styles.sectionTitle}>Delivery Address</Text></View>
              <Text style={styles.bodyText}>
                {(data as PoojaOrderDetail).address!.full_address}
                {(data as PoojaOrderDetail).address!.apartment_name ? `\n${(data as PoojaOrderDetail).address!.apartment_name}` : ''}
                {(data as PoojaOrderDetail).address!.landmark ? `\nLandmark: ${(data as PoojaOrderDetail).address!.landmark}` : ''}
                {(data as PoojaOrderDetail).address!.locality ? `\n${(data as PoojaOrderDetail).address!.locality}` : ''}
                {(data as PoojaOrderDetail).address!.city ? `\n${(data as PoojaOrderDetail).address!.city}` : ''}
                {(data as PoojaOrderDetail).address!.pincode ? ` - ${(data as PoojaOrderDetail).address!.pincode}` : ''}
              </Text>
            </View>
          ) : null}

          {(data as PoojaOrderDetail).special_instructions ? (
            <View style={styles.card}>
              <View style={styles.cardHeader}><FileText size={16} color={Colors.primary} /><Text style={styles.sectionTitle}>Special Instructions</Text></View>
              <Text style={styles.bodyText}>{(data as PoojaOrderDetail).special_instructions}</Text>
            </View>
          ) : null}
        </>
      ) : (
        <>
          {/* Pandit booking details */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Booking Details</Text>
            <DetailRow icon={<CalendarDays size={17} color={Colors.primary} />} label="Preferred date" value={format(new Date((data as PanditBookingDetail).preferred_date), 'dd MMM yyyy')} />
            <DetailRow icon={<Clock3 size={17} color={Colors.primary} />} label="Preferred time" value={(data as PanditBookingDetail).preferred_time} />
            <DetailRow icon={<MapPin size={17} color={Colors.primary} />} label="Consultation mode" value={(data as PanditBookingDetail).consultation_mode.replace('_', ' ')} />
            {(data as PanditBookingDetail).provider_pooja_setups?.duration_minutes || (data as PanditBookingDetail).provider_services?.duration_minutes ? (
              <DetailRow icon={<Clock3 size={17} color={Colors.primary} />} label="Duration" value={`${(data as PanditBookingDetail).provider_pooja_setups?.duration_minutes ?? (data as PanditBookingDetail).provider_services?.duration_minutes} minutes`} />
            ) : null}
            <DetailRow icon={<CalendarDays size={17} color={Colors.primary} />} label="Requested on" value={format(new Date(data.created_at), 'dd MMM yyyy, h:mm a')} />
          </View>

          {/* Pandit details */}
          {(data as PanditBookingDetail).provider ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Pandit Details</Text>
              <DetailRow icon={<UserRound size={17} color={Colors.primary} />} label="Name" value={(data as PanditBookingDetail).provider!.full_name} />
              <DetailRow icon={<Phone size={17} color={Colors.primary} />} label="Mobile" value={(data as PanditBookingDetail).provider!.mobile} />
              {(data as PanditBookingDetail).provider!.specialization ? <DetailRow icon={<Flame size={17} color={Colors.primary} />} label="Specialization" value={(data as PanditBookingDetail).provider!.specialization} /> : null}
              {(data as PanditBookingDetail).provider!.city ? <DetailRow icon={<MapPin size={17} color={Colors.primary} />} label="Location" value={(data as PanditBookingDetail).provider!.city} /> : null}
            </View>
          ) : null}

          {/* Pooja details + items */}
          {(data as PanditBookingDetail).provider_pooja_setups ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Pooja Details</Text>
              {(data as PanditBookingDetail).provider_pooja_setups!.description ? <Text style={styles.bodyText}>{(data as PanditBookingDetail).provider_pooja_setups!.description}</Text> : null}
              {(data as PanditBookingDetail).provider_pooja_setups!.language ? <DetailRow icon={<Flame size={17} color={Colors.primary} />} label="Language" value={(data as PanditBookingDetail).provider_pooja_setups!.language} /> : null}
              {(data as PanditBookingDetail).provider_pooja_setups!.items?.length ? (
                <View style={styles.itemsSection}>
                  <Text style={styles.itemsLabel}>Required Pooja Items</Text>
                  {(data as PanditBookingDetail).provider_pooja_setups!.items.map((item, index) => (
                    <View style={styles.itemRow} key={`${item.pooja_item?.name ?? 'item'}-${index}`}>
                      <Text style={styles.itemName}>{item.pooja_item?.name ?? 'Item'}</Text>
                      <Text style={styles.itemQuantity}>{item.quantity} {item.pooja_item?.unit_type ?? ''}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {(data as PanditBookingDetail).provider_services?.description ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Service Description</Text>
              <Text style={styles.bodyText}>{(data as PanditBookingDetail).provider_services!.description}</Text>
            </View>
          ) : null}

          {(data as PanditBookingDetail).notes ? (
            <View style={styles.card}>
              <View style={styles.cardHeader}><FileText size={16} color={Colors.primary} /><Text style={styles.sectionTitle}>Customer Notes</Text></View>
              <Text style={styles.bodyText}>{(data as PanditBookingDetail).notes}</Text>
            </View>
          ) : null}
        </>
      )}

      {/* Payment details */}
      <View style={styles.paymentCard}>
        <View style={styles.cardHeader}><CreditCard size={16} color={Colors.primary} /><Text style={styles.sectionTitle}>Payment Details</Text></View>
        {isPooja ? (
          <>
            <PaymentRow label="Package price" value={(data as PoojaOrderDetail).price} />
            <PaymentRow label="Delivery charge" value={(data as PoojaOrderDetail).delivery_price} />
            <View style={styles.paymentDivider} />
            <PaymentRow label="Total" value={(data as PoojaOrderDetail).total_price} bold />
            <View style={styles.paymentStatusRow}>
              <View style={[styles.payChip, { backgroundColor: (data as PoojaOrderDetail).payment_status === 'paid' ? Colors.successSurface : Colors.warning + '16' }]}>
                <Text style={[styles.payChipText, { color: (data as PoojaOrderDetail).payment_status === 'paid' ? Colors.success : Colors.warning }]}>
                  {(data as PoojaOrderDetail).payment_status === 'paid' ? 'Paid' : 'Pending'}
                </Text>
              </View>
              {(data as PoojaOrderDetail).razorpay_payment_id ? <Text style={styles.paymentRef} numberOfLines={1}>Ref: {(data as PoojaOrderDetail).razorpay_payment_id}</Text> : null}
            </View>
          </>
        ) : (
          <>
            <PaymentRow label="Total service fee" value={(data as PanditBookingDetail).total_amount} />
            <PaymentRow label="30% advance" value={(data as PanditBookingDetail).advance_amount} status={(data as PanditBookingDetail).advance_payment_status} />
            <PaymentRow label="Remaining 70%" value={(data as PanditBookingDetail).remaining_amount} status={(data as PanditBookingDetail).remaining_payment_status} />
          </>
        )}
      </View>

      {/* Booking status */}
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

function PaymentRow({ label, value, status, bold }: { label: string; value: number; status?: string; bold?: boolean }) {
  return (
    <View style={styles.paymentRow}>
      <Text style={[styles.paymentLabel, bold && styles.paymentLabelBold]}>{label}</Text>
      <View style={styles.paymentValueWrap}>
        <Text style={[styles.paymentValue, bold && styles.paymentValueBold]}>₹{(value / 100).toLocaleString('en-IN')}</Text>
        {status ? <Text style={[styles.paymentStatus, { color: status === 'paid' ? Colors.success : Colors.warning }]}>{status}</Text> : null}
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
  itemsSection: { borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: Spacing[3], gap: Spacing[2] },
  itemsLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing[3] },
  itemName: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  itemQuantity: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.accentDark },
  paymentCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], gap: Spacing[3], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing[3], paddingTop: Spacing[2], borderTopWidth: 1, borderTopColor: Colors.divider },
  paymentLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  paymentLabelBold: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  paymentValueWrap: { alignItems: 'flex-end', gap: 2 },
  paymentValue: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  paymentValueBold: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary },
  paymentStatus: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, textTransform: 'capitalize' },
  paymentDivider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing[1] },
  paymentStatusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], marginTop: Spacing[2] },
  payChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  payChipText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  paymentRef: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  statusText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, textTransform: 'capitalize' },
});
