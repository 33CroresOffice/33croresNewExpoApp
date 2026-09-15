import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, Flame, IndianRupee, MapPin, Phone, UserRound, Handshake } from 'lucide-react-native';
import { format } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import StatusChip from '@/components/ui/StatusChip';

type Booking = {
  id: string;
  customer_name: string;
  customer_mobile: string;
  preferred_date: string;
  preferred_time: string;
  consultation_mode: string;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  total_amount: number;
  advance_amount: number;
  remaining_amount: number;
  advance_payment_status: string;
  remaining_payment_status: string;
  provider: { full_name: string; mobile: string; email: string | null; city: string | null; specialization: string | null } | null;
  provider_services: { name: string; description: string | null; duration_minutes: number; price: number | null; admin_override_price: number | null } | null;
  provider_pooja_setups: { description: string | null; duration_minutes: number; service_fee: number; language: string | null; special_instructions: string | null; pooja_type: { name: string } | null; items: { quantity: number; pooja_item: { name: string; unit_type: string } | null }[] } | null;
};

export default function ServiceOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error: queryError } = await supabase
      .from('provider_bookings')
      .select(`
        id, customer_name, customer_mobile, preferred_date, preferred_time, consultation_mode, notes, status,
        created_at, updated_at, total_amount, advance_amount, remaining_amount, advance_payment_status, remaining_payment_status,
        provider:service_providers(full_name, mobile, email, city, specialization),
        provider_services(name, description, duration_minutes, price, admin_override_price),
        provider_pooja_setups(description, duration_minutes, service_fee, language, special_instructions,
          pooja_type:pooja_types(name), items:provider_pooja_items(quantity, pooja_item:pooja_items(name, unit_type)))
      `)
      .eq('id', id)
      .maybeSingle();
    if (queryError) setError('We could not load this service order.');
    else setBooking(data as unknown as Booking | null);
    setLoading(false);
    setRefreshing(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;
  if (error || !booking) return <View style={styles.center}><Text style={styles.errorText}>{error ?? 'Service order not found.'}</Text><TouchableOpacity style={styles.backButton} onPress={() => router.back()}><Text style={styles.backButtonText}>Go back</Text></TouchableOpacity></View>;

  const pooja = booking.provider_pooja_setups;
  const service = booking.provider_services;
  const title = pooja?.pooja_type?.name ?? service?.name ?? 'Service order';
  const detailDescription = pooja?.description ?? service?.description;
  const duration = pooja?.duration_minutes ?? service?.duration_minutes;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
      <TouchableOpacity style={styles.backRow} onPress={() => router.back()}><ArrowLeft size={20} color={Colors.textPrimary} /><Text style={styles.backText}>Service orders</Text></TouchableOpacity>

      <View style={styles.heroCard}>
        <View style={styles.heroIcon}>{pooja ? <Flame size={24} color={Colors.accent} /> : <CheckCircle2 size={24} color={Colors.primary} />}</View>
        <View style={styles.heroCopy}><Text style={styles.eyebrow}>SERVICE ORDER</Text><Text style={styles.title}>{title}</Text><Text style={styles.orderId}>Order ID: {booking.id}</Text></View>
        <StatusChip status={booking.status} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Customer details</Text>
        <DetailRow icon={<UserRound size={17} color={Colors.primary} />} label="Name" value={booking.customer_name} />
        <DetailRow icon={<Phone size={17} color={Colors.primary} />} label="Mobile" value={booking.customer_mobile} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Service provider</Text>
        <DetailRow icon={<UserRound size={17} color={Colors.primary} />} label="Name" value={booking.provider?.full_name ?? 'Provider'} />
        {booking.provider?.mobile ? <DetailRow icon={<Phone size={17} color={Colors.primary} />} label="Mobile" value={booking.provider.mobile} /> : null}
        {booking.provider?.specialization ? <DetailRow icon={<Flame size={17} color={Colors.primary} />} label="Specialization" value={booking.provider.specialization} /> : null}
        {booking.provider?.city ? <DetailRow icon={<MapPin size={17} color={Colors.primary} />} label="Location" value={booking.provider.city} /> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Booking details</Text>
        <DetailRow icon={<CalendarDays size={17} color={Colors.primary} />} label="Preferred date" value={format(new Date(booking.preferred_date), 'dd MMM yyyy')} />
        <DetailRow icon={<Clock3 size={17} color={Colors.primary} />} label="Preferred time" value={booking.preferred_time} />
        <DetailRow icon={<MapPin size={17} color={Colors.primary} />} label="Consultation mode" value={booking.consultation_mode.replace('_', ' ')} />
        {duration ? <DetailRow icon={<Clock3 size={17} color={Colors.primary} />} label="Duration" value={`${duration} minutes`} /> : null}
        <DetailRow icon={<Clock3 size={17} color={Colors.primary} />} label="Requested on" value={format(new Date(booking.created_at), 'dd MMM yyyy, h:mm a')} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{pooja ? 'Pooja details' : 'Service details'}</Text>
        {detailDescription ? <Text style={styles.bodyText}>{detailDescription}</Text> : null}
        {pooja?.language ? <DetailRow icon={<Flame size={17} color={Colors.primary} />} label="Language" value={pooja.language} /> : null}
        {pooja?.special_instructions ? <View style={styles.noteBox}><Text style={styles.noteLabel}>Special instructions</Text><Text style={styles.bodyText}>{pooja.special_instructions}</Text></View> : null}
        {pooja?.items?.length ? <View style={styles.items}><Text style={styles.noteLabel}>Required items</Text>{pooja.items.map((item, index) => <View style={styles.itemRow} key={`${item.pooja_item?.name ?? 'item'}-${index}`}><Text style={styles.itemName}>{item.pooja_item?.name ?? 'Item'}</Text><Text style={styles.itemQuantity}>{item.quantity} {item.pooja_item?.unit_type ?? ''}</Text></View>)}</View> : null}
      </View>

      {booking.notes ? <View style={styles.card}><Text style={styles.sectionTitle}>Customer notes</Text><Text style={styles.bodyText}>{booking.notes}</Text></View> : null}

      <View style={styles.paymentCard}>
        <Text style={styles.sectionTitle}>Payment summary</Text>
        <PaymentRow label="Total service fee" value={booking.total_amount} />
        <PaymentRow label="30% advance" value={booking.advance_amount} status={booking.advance_payment_status} />
        <PaymentRow label="Remaining 70%" value={booking.remaining_amount} status={booking.remaining_payment_status} />
      </View>

      {booking.status === 'payment_completed' ? (
        <TouchableOpacity style={styles.settleBtn} onPress={async () => {
          setSettling(true);
          try {
            const { error: settleError } = await supabase.rpc('settle_booking', { p_booking_id: booking.id });
            if (settleError) throw settleError;
            await load();
          } catch (e: any) {
            setError(e?.message ?? 'Could not settle this booking.');
          }
          setSettling(false);
        }} disabled={settling}>
          {settling ? <ActivityIndicator size="small" color={Colors.white} /> : <><Handshake size={18} color={Colors.white} /><Text style={styles.settleBtnText}>Mark as settled</Text></>}
        </TouchableOpacity>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </ScrollView>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <View style={styles.detailRow}><View style={styles.detailIcon}>{icon}</View><View style={styles.detailCopy}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View></View>;
}

function PaymentRow({ label, value, status }: { label: string; value: number; status?: string }) {
  return <View style={styles.paymentRow}><Text style={styles.paymentLabel}>{label}</Text><View style={styles.paymentValueWrap}><Text style={styles.paymentValue}>₹{value.toLocaleString('en-IN')}</Text>{status ? <Text style={[styles.paymentStatus, { color: status === 'paid' ? Colors.success : Colors.warning }]}>{status}</Text> : null}</View></View>;
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
  sectionTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.md, color: Colors.textPrimary },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingVertical: Spacing[2], borderTopWidth: 1, borderTopColor: Colors.divider },
  detailIcon: { width: 32, height: 32, borderRadius: Radius.md, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  detailCopy: { flex: 1, gap: 2 },
  detailLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  detailValue: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary, textTransform: 'capitalize' },
  bodyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 22 },
  noteBox: { borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: Spacing[3], gap: Spacing[1] },
  noteLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  items: { borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: Spacing[3], gap: Spacing[2] },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing[3] },
  itemName: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  itemQuantity: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.accentDark },
  paymentCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], gap: Spacing[3], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing[3], paddingTop: Spacing[2], borderTopWidth: 1, borderTopColor: Colors.divider },
  paymentLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  paymentValueWrap: { alignItems: 'flex-end', gap: 2 },
  paymentValue: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  paymentStatus: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, textTransform: 'capitalize' },
  settleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.success, paddingVertical: Spacing[4], borderRadius: Radius.md, ...Shadow.sm },
  settleBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
});
