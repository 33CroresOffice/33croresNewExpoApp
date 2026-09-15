import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CalendarDays, Clock3, Flame, MapPin, MessageSquare, UserRound, XCircle, CheckCircle2, ShieldCheck } from 'lucide-react-native';
import { format } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import StatusChip from '@/components/ui/StatusChip';
import Button from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';

let RazorpayCheckout: any = null;
if (Platform.OS !== 'web') RazorpayCheckout = require('react-native-razorpay').default;

type Booking = {
  id: string;
  preferred_date: string;
  preferred_time: string;
  consultation_mode: string;
  notes: string | null;
  status: string;
  provider: { full_name: string; mobile: string; city: string; specialization: string } | null;
  provider_services: { name: string; description: string; duration_minutes: number; consultation_mode: string } | null;
  provider_pooja_setups: { description: string; duration_minutes: number; service_fee: number; language: string | null; pooja_type: { name: string } | null } | null;
  total_amount: number;
  advance_amount: number;
  remaining_amount: number;
  advance_payment_status: string;
  remaining_payment_status: string;
  arrival_otp: string | null;
  arrival_otp_verified: boolean;
  address: { street: string; city: string; pincode: string; landmark: string | null; apartment_name: string | null; locality_id: string | null } | null;
};

export default function ServiceOrderDetailsScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuthStore();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payingStage, setPayingStage] = useState<'advance' | 'remaining' | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showConfirmedModal, setShowConfirmedModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const cancelBooking = async () => {
    if (!id) return;
    setCancelling(true);
    try {
      const { error: cancelError } = await supabase.rpc('cancel_provider_booking', { p_booking_id: id });
      if (cancelError) throw cancelError;
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Could not cancel booking.');
    }
    setCancelling(false);
  };

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error: queryError } = await supabase
      .from('provider_bookings')
      .select('id, preferred_date, preferred_time, consultation_mode, notes, status, total_amount, advance_amount, remaining_amount, advance_payment_status, remaining_payment_status, arrival_otp, arrival_otp_verified, provider:service_providers(full_name, mobile, city, specialization), provider_services(name, description, duration_minutes, consultation_mode), provider_pooja_setups(description, duration_minutes, service_fee, language, pooja_type:pooja_types(name)), address:addresses(street, city, pincode, landmark, apartment_name, locality_id)')
      .eq('id', id)
      .maybeSingle();
    if (queryError) setError('We could not load this service booking.');
    else setBooking(data as unknown as Booking | null);
    setLoading(false);
    setRefreshing(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const invoke = async (name: string, body: object) => {
    const { data, error: invokeError } = await supabase.functions.invoke(name, { body });
    return { data: data ?? {}, error: invokeError?.message ?? null };
  };

  const verifyPayment = async (payment: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }, stage: 'advance' | 'remaining') => {
    const result = await invoke('verify-provider-booking-payment', { booking_id: id, payment_stage: stage, ...payment });
    if (result.error || !result.data.success) setError(result.data.error ?? result.error ?? 'Payment verification failed.');
    else {
      await load();
      if (stage === 'advance' && result.data.success) setShowConfirmedModal(true);
    }
    setPayingStage(null);
  };

  const pay = async (stage: 'advance' | 'remaining') => {
    if (!id) return;
    setError(null);
    if (Platform.OS === 'web') {
      const paymentUrl = `${window.location.origin}/provider-booking-payment?id=${encodeURIComponent(id)}&stage=${encodeURIComponent(stage)}`;
      window.open(paymentUrl, 'razorpay_provider_booking', 'popup,width=480,height=760,resizable=yes,scrollbars=yes');
      return;
    }
    setPayingStage(stage);
    try {
      const result = await invoke('create-provider-booking-payment', { booking_id: id, payment_stage: stage });
      if (result.error || !result.data.success) { setError(result.data.error ?? result.error ?? 'Could not start payment.'); setPayingStage(null); return; }
      if (result.data.test_mode) { await verifyPayment({ razorpay_payment_id: `pay_sim_${Date.now()}`, razorpay_order_id: result.data.order_id, razorpay_signature: 'simulated' }, stage); return; }
      if (!RazorpayCheckout) throw new Error('Payment service unavailable');
      const payment = await RazorpayCheckout.open({ key: result.data.key_id, amount: String(result.data.amount), currency: result.data.currency ?? 'INR', order_id: result.data.order_id, name: '33 Crores Flowers', description: 'Pooja service booking', prefill: { name: profile?.full_name ?? '', contact: profile?.mobile ?? '' }, theme: { color: Colors.primary } });
      await verifyPayment(payment, stage);
    } catch (paymentError: any) { setError(paymentError?.cancelled || paymentError?.code === 0 ? 'Payment cancelled.' : paymentError?.description ?? 'Payment failed. Please try again.'); setPayingStage(null); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;
  if (error || !booking) return <View style={[styles.center, { paddingTop: insets.top }]}><Text style={styles.errorText}>{error ?? 'Service booking not found.'}</Text><TouchableOpacity style={styles.backButton} onPress={() => router.back()}><Text style={styles.backButtonText}>Go back</Text></TouchableOpacity></View>;

  const pooja = booking.provider_pooja_setups;
  const service = booking.provider_services;
  const title = pooja?.pooja_type?.name ?? service?.name ?? 'Service booking';
  const description = pooja?.description ?? service?.description;
  const duration = pooja?.duration_minutes ?? service?.duration_minutes;

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing[3], paddingBottom: insets.bottom + Spacing[8] }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <TouchableOpacity style={styles.backRow} onPress={() => router.back()}><ArrowLeft size={20} color={Colors.textPrimary} /><Text style={styles.backText}>Service order details</Text></TouchableOpacity>
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}><Flame size={24} color={Colors.accent} /></View>
          <View style={styles.heroCopy}><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>Service booking</Text></View>
          <StatusChip status={booking.status} />
        </View>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Booking details</Text>
          <DetailRow icon={<CalendarDays size={17} color={Colors.primary} />} label="Preferred date" value={format(new Date(booking.preferred_date), 'dd MMM yyyy')} />
          <DetailRow icon={<Clock3 size={17} color={Colors.primary} />} label="Preferred time" value={booking.preferred_time} />
          <DetailRow icon={<MapPin size={17} color={Colors.primary} />} label="Consultation mode" value={booking.consultation_mode.replace('_', ' ')} />
          {duration ? <DetailRow icon={<Clock3 size={17} color={Colors.primary} />} label="Duration" value={`${duration} minutes`} /> : null}
        </View>
        {booking.address ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Pooja / Service Location</Text>
            <DetailRow icon={<MapPin size={17} color={Colors.primary} />} label="Address" value={[booking.address.street, booking.address.apartment_name, booking.address.landmark, booking.address.city, booking.address.pincode].filter(Boolean).join(', ')} />
          </View>
        ) : null}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Service provider</Text>
          <DetailRow icon={<UserRound size={17} color={Colors.primary} />} label="Name" value={booking.provider?.full_name ?? 'Provider'} />
          {booking.provider?.specialization ? <DetailRow icon={<Flame size={17} color={Colors.primary} />} label="Specialization" value={booking.provider.specialization} /> : null}
          {booking.provider?.city ? <DetailRow icon={<MapPin size={17} color={Colors.primary} />} label="Location" value={booking.provider.city} /> : null}
        </View>
        {description ? <View style={styles.card}><Text style={styles.sectionTitle}>About this service</Text><Text style={styles.bodyText}>{description}</Text></View> : null}
        {booking.notes ? <View style={styles.card}><View style={styles.notesTitle}><MessageSquare size={17} color={Colors.primary} /><Text style={styles.sectionTitle}>Your notes</Text></View><Text style={styles.bodyText}>{booking.notes}</Text></View> : null}
        {booking.status === 'pandit_arrived' && booking.arrival_otp ? (
          <View style={styles.otpCard}>
            <View style={styles.otpHeader}>
              <ShieldCheck size={20} color={Colors.primary} />
              <Text style={styles.otpCardTitle}>Arrival OTP</Text>
            </View>
            <Text style={styles.otpCardHint}>Share this 6-digit code with your Pandit to verify arrival and start the Pooja.</Text>
            <View style={styles.otpCodeBox}>
              <Text style={styles.otpCodeText}>{booking.arrival_otp}</Text>
            </View>
            {booking.arrival_otp_verified ? (
              <View style={styles.otpVerifiedRow}>
                <CheckCircle2 size={14} color={Colors.success} />
                <Text style={styles.otpVerifiedText}>OTP verified by Pandit</Text>
              </View>
            ) : (
              <Text style={styles.otpWaitingText}>Waiting for Pandit to verify...</Text>
            )}
          </View>
        ) : null}
        {booking.total_amount > 0 && !['request_sent', 'declined', 'cancelled', 'settled'].includes(booking.status) ? <View style={styles.paymentCard}>
          <Text style={styles.sectionTitle}>Payment</Text>
          <View style={styles.paymentRow}><Text style={styles.paymentLabel}>Total service fee</Text><Text style={styles.paymentValue}>₹{booking.total_amount.toLocaleString('en-IN')}</Text></View>
          <View style={styles.paymentRow}><Text style={styles.paymentLabel}>30% advance</Text><Text style={styles.paymentValue}>₹{booking.advance_amount.toLocaleString('en-IN')} · {booking.advance_payment_status}</Text></View>
          <View style={styles.paymentRow}><Text style={styles.paymentLabel}>Remaining 70%</Text><Text style={styles.paymentValue}>₹{booking.remaining_amount.toLocaleString('en-IN')} · {booking.remaining_payment_status}</Text></View>
          {booking.status === 'awaiting_advance_payment' && booking.advance_payment_status !== 'paid' ? <><Text style={styles.paymentHint}>Pay the 30% advance to confirm your booking.</Text><Button fullWidth label={payingStage === 'advance' ? 'Processing...' : `Pay 30% advance · ₹${booking.advance_amount.toLocaleString('en-IN')}`} onPress={() => pay('advance')} loading={payingStage === 'advance'} /></> : null}
          {['booking_confirmed', 'pooja_completed'].includes(booking.status) && booking.advance_payment_status === 'paid' && booking.remaining_payment_status !== 'paid' ? <><Text style={styles.paymentHint}>{booking.status === 'pooja_completed' ? 'Please complete the remaining payment.' : 'You can pay the remaining 70% now, or after the pooja is completed.'}</Text><Button fullWidth label={payingStage === 'remaining' ? 'Processing...' : `Pay remaining 70% · ₹${booking.remaining_amount.toLocaleString('en-IN')}`} onPress={() => pay('remaining')} loading={payingStage === 'remaining'} /></> : null}
          {booking.remaining_payment_status === 'paid' ? <Text style={styles.paidText}>Payment complete</Text> : null}
        </View> : null}
        {['request_sent', 'awaiting_advance_payment'].includes(booking.status) ? (
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCancelModal(true)} disabled={cancelling}>
            <XCircle size={16} color={Colors.error} />
            <Text style={styles.cancelBtnText}>Cancel booking</Text>
          </TouchableOpacity>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>

      <Modal visible={showConfirmedModal} transparent animationType="fade" onRequestClose={() => setShowConfirmedModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.successSheet}>
            <View style={styles.successIcon}><CheckCircle2 size={32} color={Colors.white} /></View>
            <Text style={styles.successTitle}>Pooja Confirmed</Text>
            <Text style={styles.successMessage}>Your 30% advance payment has been received successfully. Your Pooja booking is now confirmed.</Text>
            <TouchableOpacity style={styles.successBtn} onPress={() => { setShowConfirmedModal(false); }}>
              <Text style={styles.successBtnText}>View Order</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showCancelModal} transparent animationType="fade" onRequestClose={() => setShowCancelModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmSheet}>
            <View style={styles.cancelIcon}><XCircle size={30} color={Colors.error} /></View>
            <Text style={styles.confirmTitle}>Cancel booking?</Text>
            <Text style={styles.confirmMessage}>Are you sure you want to cancel this booking request? This action cannot be undone.</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.keepBtn} onPress={() => setShowCancelModal(false)} disabled={cancelling}>
                <Text style={styles.keepBtnText}>Keep booking</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmCancelBtn} onPress={async () => { setShowCancelModal(false); await cancelBooking(); }} disabled={cancelling}>
                {cancelling ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.confirmCancelText}>Yes, cancel</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

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
  sectionTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.md, color: Colors.textPrimary },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingVertical: Spacing[2], borderTopWidth: 1, borderTopColor: Colors.divider },
  detailIcon: { width: 32, height: 32, borderRadius: Radius.md, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  detailCopy: { flex: 1, gap: 2 },
  detailLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  detailValue: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary, textTransform: 'capitalize' },
  bodyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 22 },
  notesTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  paymentCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, gap: Spacing[3], ...Shadow.sm },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing[3], paddingTop: Spacing[2], borderTopWidth: 1, borderTopColor: Colors.divider },
  paymentLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  paymentValue: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary, textTransform: 'capitalize' },
  paymentHint: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 21 },
  paidText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.success },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.errorSurface, paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.error },
  cancelBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.error },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  successSheet: { width: '100%', maxWidth: 380, backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[7], alignItems: 'center', gap: Spacing[3], ...Shadow.lg },
  successIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing[1] },
  successTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary, textAlign: 'center' },
  successMessage: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  successBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary, paddingVertical: Spacing[3], paddingHorizontal: Spacing[6], borderRadius: Radius.md, marginTop: Spacing[2], ...Shadow.sm },
  successBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
  confirmSheet: { width: '100%', maxWidth: 380, backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[6], alignItems: 'center', gap: Spacing[3], ...Shadow.lg },
  cancelIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.errorSurface, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing[1] },
  confirmTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary, textAlign: 'center' },
  confirmMessage: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  confirmActions: { flexDirection: 'row', width: '100%', gap: Spacing[3], marginTop: Spacing[2] },
  keepBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3] },
  keepBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  confirmCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.error, borderRadius: Radius.md, paddingVertical: Spacing[3] },
  confirmCancelText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },

  otpCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.primary, gap: Spacing[3], ...Shadow.sm },
  otpHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  otpCardTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.md, color: Colors.primary },
  otpCardHint: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 20 },
  otpCodeBox: { alignItems: 'center', paddingVertical: Spacing[4], backgroundColor: Colors.primarySurface, borderRadius: Radius.md },
  otpCodeText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['3xl'], color: Colors.primary, letterSpacing: 12 },
  otpVerifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  otpVerifiedText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.success },
  otpWaitingText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center' },

});
