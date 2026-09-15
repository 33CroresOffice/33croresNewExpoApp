import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, CalendarClock, Clock3, Flame, MapPin, IndianRupee, UserRound, Phone,
  CheckCircle2, XCircle, Navigation, MapPinCheck, Play, CheckCheck, ShieldCheck,
  MessageSquare, Sparkles,
} from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Booking = {
  id: string;
  customer_name: string;
  customer_mobile: string;
  customer_id: string;
  preferred_date: string;
  preferred_time: string;
  consultation_mode: string;
  notes: string | null;
  status: string;
  total_amount: number;
  advance_amount: number;
  remaining_amount: number;
  advance_payment_status: string;
  remaining_payment_status: string;
  arrival_otp_verified: boolean;
  arrival_otp: string | null;
  created_at: string;
  address: { street: string; city: string; pincode: string; landmark: string | null; apartment_name: string | null; locality_id: string | null } | null;
  provider_services?: { name: string; description: string | null; duration_minutes: number; consultation_mode: string | null } | null;
  provider_pooja_setups?: {
    description: string | null;
    duration_minutes: number;
    service_fee: number;
    language: string | null;
    pooja_type?: { name: string } | null;
  } | null;
};

const STATUS_LABELS: Record<string, string> = {
  request_sent: 'Request Sent',
  awaiting_advance_payment: 'Awaiting Advance',
  booking_confirmed: 'Booking Confirmed',
  pandit_on_the_way: 'Pandit On The Way',
  pandit_arrived: 'Pandit Arrived',
  pooja_in_progress: 'Pooja In Progress',
  pooja_completed: 'Pooja Completed',
  payment_completed: 'Payment Completed',
  settled: 'Settled',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

function statusColor(status: string): string {
  if (status === 'settled' || status === 'payment_completed') return Colors.success;
  if (status === 'declined' || status === 'cancelled') return Colors.error;
  if (status === 'request_sent' || status === 'awaiting_advance_payment') return Colors.warning;
  if (status === 'booking_confirmed') return Colors.success;
  if (status === 'pooja_in_progress') return Colors.primary;
  return Colors.accentDark;
}

export default function BookingDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('provider_bookings')
      .select('id, customer_name, customer_mobile, customer_id, preferred_date, preferred_time, consultation_mode, notes, status, total_amount, advance_amount, remaining_amount, advance_payment_status, remaining_payment_status, arrival_otp_verified, arrival_otp, created_at, provider_services(name, description, duration_minutes, consultation_mode), provider_pooja_setups(description, duration_minutes, service_fee, language, pooja_type:pooja_types(name)), address:addresses(street, city, pincode, landmark, apartment_name, locality_id)')
      .eq('id', id)
      .maybeSingle();
    if (!error && data) setBooking(data as unknown as Booking);
    setLoading(false);
    setRefreshing(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (rpcName: string) => {
    setActionLoading(rpcName);
    try {
      const { error } = await supabase.rpc(rpcName, { p_booking_id: id });
      if (error) throw error;
      await load();
    } catch (e: any) {
      console.error('booking action error', e);
    }
    setActionLoading(null);
  };

  const verifyOtp = async () => {
    if (otpInput.trim().length !== 6) { setOtpError('Enter the 6-digit OTP'); return; }
    setOtpVerifying(true); setOtpError(null);
    try {
      const { data, error } = await supabase.rpc('verify_arrival_otp', { p_booking_id: id, p_otp: otpInput.trim() });
      if (error) throw error;
      if (data?.success) { setOtpError(null); await load(); }
      else { setOtpError(data?.error ?? 'Verification failed'); }
    } catch (e: any) { setOtpError(e?.message ?? 'Could not verify OTP'); }
    setOtpVerifying(false);
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Booking Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Booking Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.errorText}>Booking not found</Text>
        </View>
      </View>
    );
  }

  const pooja = booking.provider_pooja_setups;
  const service = booking.provider_services;
  const title = pooja?.pooja_type?.name ?? service?.name ?? 'Service booking';
  const sc = statusColor(booking.status);
  const isLoading = (rpc: string) => actionLoading === rpc;

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing[8] }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Booking Details</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Hero card */}
      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={styles.heroIcon}>
            {pooja ? <Flame size={22} color={Colors.accent} /> : <Sparkles size={22} color={Colors.primary} />}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.heroTitle}>{title}</Text>
            <View style={[styles.statusBadge, { backgroundColor: sc + '16' }]}>
              <Text style={[styles.statusText, { color: sc }]}>{STATUS_LABELS[booking.status] ?? booking.status.replace(/_/g, ' ')}</Text>
            </View>
          </View>
        </View>
        {pooja?.description ? <Text style={styles.heroDesc}>{pooja.description}</Text> : null}
        {service?.description ? <Text style={styles.heroDesc}>{service.description}</Text> : null}
      </View>

      {/* Customer info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Customer</Text>
        <View style={styles.infoRow}>
          <UserRound size={16} color={Colors.primary} />
          <Text style={styles.infoValue}>{booking.customer_name}</Text>
        </View>
        <View style={styles.infoRow}>
          <Phone size={16} color={Colors.primary} />
          <Text style={styles.infoValue}>+91 {booking.customer_mobile}</Text>
        </View>
      </View>

      {/* Schedule */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Schedule</Text>
        <View style={styles.infoRow}>
          <CalendarClock size={16} color={Colors.neutral[500]} />
          <Text style={styles.infoValue}>{booking.preferred_date}</Text>
        </View>
        <View style={styles.infoRow}>
          <Clock3 size={16} color={Colors.neutral[500]} />
          <Text style={styles.infoValue}>{booking.preferred_time}</Text>
        </View>
        <View style={styles.infoRow}>
          <MapPin size={16} color={Colors.accent} />
          <Text style={styles.infoValue}>{booking.consultation_mode.replace(/_/g, ' ')}</Text>
        </View>
      </View>

      {booking.address ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pooja / Service Location</Text>
          <View style={styles.infoRow}>
            <MapPin size={16} color={Colors.primary} />
            <Text style={styles.infoValue}>
              {[booking.address.street, booking.address.apartment_name, booking.address.landmark, booking.address.city, booking.address.pincode].filter(Boolean).join(', ')}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Payment summary */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Payment</Text>
        <View style={styles.payRow}>
          <Text style={styles.payLabel}>Total Amount</Text>
          <Text style={styles.payValue}>₹{Number(booking.total_amount).toLocaleString('en-IN')}</Text>
        </View>
        <View style={styles.payDivider} />
        <View style={styles.payRow}>
          <Text style={styles.payLabel}>Advance</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.payValue}>₹{Number(booking.advance_amount).toLocaleString('en-IN')}</Text>
            <View style={[styles.payChip, { backgroundColor: booking.advance_payment_status === 'paid' ? Colors.successSurface : Colors.warning + '16' }]}>
              <Text style={[styles.payChipText, { color: booking.advance_payment_status === 'paid' ? Colors.success : Colors.warning }]}>
                {booking.advance_payment_status === 'paid' ? 'Paid' : 'Pending'}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.payDivider} />
        <View style={styles.payRow}>
          <Text style={styles.payLabel}>Remaining</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.payValue}>₹{Number(booking.remaining_amount).toLocaleString('en-IN')}</Text>
            <View style={[styles.payChip, { backgroundColor: booking.remaining_payment_status === 'paid' ? Colors.successSurface : Colors.warning + '16' }]}>
              <Text style={[styles.payChipText, { color: booking.remaining_payment_status === 'paid' ? Colors.success : Colors.warning }]}>
                {booking.remaining_payment_status === 'paid' ? 'Paid' : 'Pending'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Notes */}
      {booking.notes ? (
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <MessageSquare size={15} color={Colors.textSecondary} />
            <Text style={styles.cardTitle}>Customer Notes</Text>
          </View>
          <Text style={styles.notesText}>{booking.notes}</Text>
        </View>
      ) : null}

      {/* OTP info for provider */}
      {booking.status === 'pandit_arrived' && !booking.arrival_otp_verified ? (
        <View style={styles.card}>
          <View style={styles.otpHeader}>
            <ShieldCheck size={18} color={Colors.primary} />
            <Text style={styles.cardTitle}>OTP Verification</Text>
          </View>
          <Text style={styles.otpHint}>Ask the customer for the 6-digit OTP shown on their booking page, then enter it below to start the Pooja.</Text>
          <View style={styles.otpInputRow}>
            <TextInput
              style={styles.otpInput}
              value={otpInput}
              onChangeText={(text) => { setOtpInput(text.replace(/[^0-9]/g, '').slice(0, 6)); setOtpError(null); }}
              keyboardType="number-pad"
              placeholder="6-digit OTP"
              placeholderTextColor={Colors.textDisabled}
              maxLength={6}
            />
            <TouchableOpacity style={[styles.otpVerifyBtn, otpVerifying && styles.btnDisabled]} onPress={verifyOtp} disabled={otpVerifying || otpInput.length !== 6}>
              {otpVerifying ? <ActivityIndicator size="small" color={Colors.white} /> : <CheckCircle2 size={16} color={Colors.white} />}
              <Text style={styles.otpVerifyBtnText}>Verify</Text>
            </TouchableOpacity>
          </View>
          {otpError ? <Text style={styles.otpError}>{otpError}</Text> : null}
        </View>
      ) : null}

      {booking.arrival_otp_verified ? (
        <View style={styles.otpVerifiedBadge}>
          <ShieldCheck size={14} color={Colors.success} />
          <Text style={styles.otpVerifiedText}>OTP verified</Text>
        </View>
      ) : null}

      {/* Action buttons */}
      {booking.status === 'request_sent' ? (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.acceptBtn, isLoading('accept_provider_booking') && styles.btnDisabled]}
            onPress={() => handleAction('accept_provider_booking')}
            disabled={!!actionLoading}
          >
            {isLoading('accept_provider_booking') ? <ActivityIndicator size="small" color={Colors.white} /> : <CheckCircle2 size={16} color={Colors.white} />}
            <Text style={styles.acceptBtnText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.declineBtn, isLoading('decline_provider_booking') && styles.btnDisabled]}
            onPress={() => handleAction('decline_provider_booking')}
            disabled={!!actionLoading}
          >
            {isLoading('decline_provider_booking') ? <ActivityIndicator size="small" color={Colors.error} /> : <XCircle size={16} color={Colors.error} />}
            <Text style={styles.declineBtnText}>Decline</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {booking.status === 'booking_confirmed' ? (
        <TouchableOpacity style={styles.transitionBtn} onPress={() => handleAction('start_pandit_travel')} disabled={!!actionLoading}>
          {isLoading('start_pandit_travel') ? <ActivityIndicator size="small" color={Colors.primary} /> : <Navigation size={16} color={Colors.primary} />}
          <Text style={styles.transitionBtnText}>Start travelling</Text>
        </TouchableOpacity>
      ) : null}

      {booking.status === 'pandit_on_the_way' ? (
        <TouchableOpacity style={styles.transitionBtn} onPress={() => handleAction('pandit_arrived')} disabled={!!actionLoading}>
          {isLoading('pandit_arrived') ? <ActivityIndicator size="small" color={Colors.primary} /> : <MapPinCheck size={16} color={Colors.primary} />}
          <Text style={styles.transitionBtnText}>Mark as arrived</Text>
        </TouchableOpacity>
      ) : null}

      {booking.status === 'pandit_arrived' && booking.arrival_otp_verified ? (
        <TouchableOpacity style={styles.transitionBtn} onPress={() => handleAction('start_pooja')} disabled={!!actionLoading}>
          {isLoading('start_pooja') ? <ActivityIndicator size="small" color={Colors.primary} /> : <Play size={16} color={Colors.primary} />}
          <Text style={styles.transitionBtnText}>Start pooja</Text>
        </TouchableOpacity>
      ) : null}

      {booking.status === 'pooja_in_progress' ? (
        <TouchableOpacity style={styles.transitionBtn} onPress={() => handleAction('complete_pooja')} disabled={!!actionLoading}>
          {isLoading('complete_pooja') ? <ActivityIndicator size="small" color={Colors.primary} /> : <CheckCheck size={16} color={Colors.primary} />}
          <Text style={styles.transitionBtnText}>Complete pooja</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing[5], paddingTop: Spacing[4], gap: Spacing[4] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], marginBottom: Spacing[2] },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textSecondary },
  heroCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm, gap: Spacing[3] },
  heroTop: { flexDirection: 'row', gap: Spacing[3], alignItems: 'flex-start' },
  heroIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  heroDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 20 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, alignSelf: 'flex-start' },
  statusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm, gap: Spacing[2] },
  cardTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingVertical: 4 },
  infoValue: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, flex: 1 },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  payLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  payValue: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  payDivider: { height: 1, backgroundColor: Colors.divider },
  payChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  payChipText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10 },
  notesText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 20, marginTop: 4 },
  otpHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  otpHint: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary, lineHeight: 18, marginTop: 4 },
  otpInputRow: { flexDirection: 'row', gap: Spacing[2], alignItems: 'center', marginTop: 8 },
  otpInput: { flex: 1, borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary, textAlign: 'center', letterSpacing: 4, backgroundColor: Colors.white },
  otpVerifyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.primary, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], borderRadius: Radius.md },
  otpVerifyBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  otpError: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.error, marginTop: 6 },
  otpVerifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.successSurface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, alignSelf: 'flex-start' },
  otpVerifiedText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.success },
  actionRow: { flexDirection: 'row', gap: Spacing[3] },
  acceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.success, paddingVertical: Spacing[3], borderRadius: Radius.md },
  acceptBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  declineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.errorSurface, paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.error },
  declineBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.error },
  btnDisabled: { opacity: 0.6 },
  transitionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.primarySurface, paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary },
  transitionBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary },
});
