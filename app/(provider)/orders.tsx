import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { router } from 'expo-router';
import { CalendarClock, CheckCircle2, Clock3, Flame, IndianRupee, MapPin, Sparkles, History, Bell, XCircle, Navigation, MapPinCheck, Play, CheckCheck, ShieldCheck } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

type Booking = {
  id: string;
  customer_name: string;
  preferred_date: string;
  preferred_time: string;
  consultation_mode: string;
  status: string;
  total_amount: number;
  advance_amount: number;
  advance_payment_status: string;
  remaining_payment_status: string;
  arrival_otp_verified: boolean;
  provider_services?: { name: string; description: string | null; duration_minutes: number } | null;
  provider_pooja_setups?: {
    description: string | null;
    duration_minutes: number;
    service_fee: number;
    language: string | null;
    pooja_type?: { name: string } | null;
  } | null;
};

export default function ProviderOrdersScreen() {
  const { session } = useAuthStore();
  const [provider, setProvider] = useState<any>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'requests' | 'current' | 'previous'>('requests');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session?.user?.id) return;
    const { data: providerData } = await supabase
      .from('service_providers')
      .select('id, full_name')
      .eq('auth_user_id', session.user.id)
      .maybeSingle();
    setProvider(providerData);
    if (providerData) {
      const { data } = await supabase
        .from('provider_bookings')
        .select('id, customer_name, preferred_date, preferred_time, consultation_mode, status, total_amount, advance_amount, advance_payment_status, remaining_payment_status, arrival_otp_verified, provider_services(name, description, duration_minutes), provider_pooja_setups(description, duration_minutes, service_fee, language, pooja_type:pooja_types(name))')
        .eq('provider_id', providerData.id)
        .order('preferred_date', { ascending: false });
      setBookings((data ?? []) as unknown as Booking[]);
    }
    setLoading(false);
    setRefreshing(false);
  }, [session?.user?.id]);

  useEffect(() => { load(); }, [load]);

  const requestStatuses = ['request_sent'];
  const currentStatuses = ['awaiting_advance_payment', 'booking_confirmed', 'pandit_on_the_way', 'pandit_arrived', 'pooja_in_progress', 'pooja_completed', 'payment_completed'];
  const previousStatuses = ['settled', 'declined', 'cancelled'];

  const requestOrders = bookings.filter((b) => requestStatuses.includes(b.status));
  const currentOrders = bookings.filter((b) => currentStatuses.includes(b.status));
  const previousOrders = bookings.filter((b) => previousStatuses.includes(b.status));

  const handleAction = async (rpcName: string, bookingId: string) => {
    if (rpcName === '__reload__') { await load(); return; }
    setActionLoading(`${rpcName}_${bookingId}`);
    try {
      const { error } = await supabase.rpc(rpcName, { p_booking_id: bookingId });
      if (error) throw error;
      await load();
    } catch (e: any) {
      console.error('booking action error', e);
    }
    setActionLoading(null);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;

  const displayedOrders = tab === 'requests' ? requestOrders : tab === 'current' ? currentOrders : previousOrders;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>SERVICE PROVIDER</Text>
          <Text style={styles.title}>My Orders</Text>
          <Text style={styles.subtitle}>Track your current and past bookings</Text>
        </View>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity style={[styles.tab, tab === 'requests' && styles.tabActive]} onPress={() => setTab('requests')}>
          <Bell size={16} color={tab === 'requests' ? Colors.white : Colors.textSecondary} />
          <Text style={[styles.tabText, tab === 'requests' && styles.tabTextActive]}>Requests ({requestOrders.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'current' && styles.tabActive]} onPress={() => setTab('current')}>
          <CalendarClock size={16} color={tab === 'current' ? Colors.white : Colors.textSecondary} />
          <Text style={[styles.tabText, tab === 'current' && styles.tabTextActive]}>Current ({currentOrders.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'previous' && styles.tabActive]} onPress={() => setTab('previous')}>
          <History size={16} color={tab === 'previous' ? Colors.white : Colors.textSecondary} />
          <Text style={[styles.tabText, tab === 'previous' && styles.tabTextActive]}>Previous ({previousOrders.length})</Text>
        </TouchableOpacity>
      </View>

      {displayedOrders.length === 0 ? (
        <View style={styles.empty}>
          <Sparkles size={28} color={Colors.primary} />
          <Text style={styles.emptyTitle}>{tab === 'requests' ? 'No new requests' : tab === 'current' ? 'No current orders' : 'No previous orders'}</Text>
          <Text style={styles.emptyText}>{tab === 'requests' ? 'New booking requests will appear here.' : tab === 'current' ? 'Active bookings will appear here.' : 'Completed and declined bookings will appear here.'}</Text>
        </View>
      ) : (
        displayedOrders.map((booking) => (
          <BookingCard
            key={booking.id}
            booking={booking}
            onPress={() => router.push({ pathname: '/(provider)/booking-detail' as any, params: { id: booking.id } })}
            onAction={handleAction}
            actionLoading={actionLoading}
          />
        ))
      )}
    </ScrollView>
  );
}

function BookingCard({ booking, onPress, onAction, actionLoading }: { booking: Booking; onPress: () => void; onAction: (rpc: string, id: string) => void; actionLoading: string | null }) {
  const pooja = booking.provider_pooja_setups;
  const service = booking.provider_services;
  const title = pooja?.pooja_type?.name ?? service?.name ?? 'Service booking';
  const isLoading = (rpc: string) => actionLoading === `${rpc}_${booking.id}`;
  const [otpInput, setOtpInput] = useState('');
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  const verifyOtp = async () => {
    if (otpInput.trim().length !== 6) { setOtpError('Enter the 6-digit OTP'); return; }
    setOtpVerifying(true); setOtpError(null);
    try {
      const { data, error } = await supabase.rpc('verify_arrival_otp', { p_booking_id: booking.id, p_otp: otpInput.trim() });
      if (error) throw error;
      if (data?.success) { setOtpError(null); onAction('__reload__', booking.id); }
      else { setOtpError(data?.error ?? 'Verification failed'); }
    } catch (e: any) { setOtpError(e?.message ?? 'Could not verify OTP'); }
    setOtpVerifying(false);
  };

  const statusColor =
    booking.status === 'settled' ? Colors.success :
    booking.status === 'declined' || booking.status === 'cancelled' ? Colors.error :
    booking.status === 'request_sent' ? Colors.warning :
    booking.status === 'booking_confirmed' ? Colors.success :
    booking.status === 'pooja_in_progress' ? Colors.primary :
    Colors.accentDark;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardTop}>
        <View style={styles.cardHeading}>
          <View style={styles.serviceTitleRow}>
            {pooja ? <Flame size={15} color={Colors.accent} /> : null}
            <Text style={styles.serviceTitle}>{title}</Text>
          </View>
          <Text style={styles.customer}>{booking.customer_name}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '16' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{booking.status.replace(/_/g, ' ')}</Text>
        </View>
      </View>
      <View style={styles.detailRow}>
        <View style={styles.detailItem}><CalendarClock size={14} color={Colors.textTertiary} /><Text style={styles.detailText}>{booking.preferred_date}</Text></View>
        <View style={styles.detailItem}><Clock3 size={14} color={Colors.textTertiary} /><Text style={styles.detailText}>{booking.preferred_time}</Text></View>
        <View style={styles.detailItem}><MapPin size={14} color={Colors.textTertiary} /><Text style={styles.detailText}>{booking.consultation_mode.replace('_', ' ')}</Text></View>
      </View>
      {booking.total_amount > 0 ? (
        <View style={styles.paymentRow}>
          <View style={styles.paymentItem}><IndianRupee size={13} color={Colors.textTertiary} /><Text style={styles.paymentText}>{booking.total_amount.toLocaleString('en-IN')}</Text></View>
          {booking.advance_payment_status === 'paid' ? <View style={styles.paidChip}><CheckCircle2 size={12} color={Colors.success} /><Text style={styles.paidText}>Advance paid</Text></View> : null}
          {booking.remaining_payment_status === 'paid' ? <View style={styles.paidChip}><CheckCircle2 size={12} color={Colors.success} /><Text style={styles.paidText}>Fully paid</Text></View> : null}
        </View>
      ) : null}

      {booking.status === 'request_sent' ? (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.acceptBtn, isLoading('accept_provider_booking') && styles.btnDisabled]}
            onPress={() => onAction('accept_provider_booking', booking.id)}
            disabled={!!actionLoading}
          >
            {isLoading('accept_provider_booking') ? <ActivityIndicator size="small" color={Colors.white} /> : <CheckCircle2 size={16} color={Colors.white} />}
            <Text style={styles.acceptBtnText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.declineBtn, isLoading('decline_provider_booking') && styles.btnDisabled]}
            onPress={() => onAction('decline_provider_booking', booking.id)}
            disabled={!!actionLoading}
          >
            {isLoading('decline_provider_booking') ? <ActivityIndicator size="small" color={Colors.error} /> : <XCircle size={16} color={Colors.error} />}
            <Text style={styles.declineBtnText}>Decline</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {booking.status === 'booking_confirmed' ? (
        <TouchableOpacity style={styles.transitionBtn} onPress={() => onAction('start_pandit_travel', booking.id)} disabled={!!actionLoading}>
          {isLoading('start_pandit_travel') ? <ActivityIndicator size="small" color={Colors.primary} /> : <Navigation size={16} color={Colors.primary} />}
          <Text style={styles.transitionBtnText}>Start travelling</Text>
        </TouchableOpacity>
      ) : null}

      {booking.status === 'pandit_on_the_way' ? (
        <TouchableOpacity style={styles.transitionBtn} onPress={() => onAction('pandit_arrived', booking.id)} disabled={!!actionLoading}>
          {isLoading('pandit_arrived') ? <ActivityIndicator size="small" color={Colors.primary} /> : <MapPinCheck size={16} color={Colors.primary} />}
          <Text style={styles.transitionBtnText}>Mark as arrived</Text>
        </TouchableOpacity>
      ) : null}

      {booking.status === 'pandit_arrived' && !booking.arrival_otp_verified ? (
        <View style={styles.otpSection}>
          <View style={styles.otpHeader}>
            <ShieldCheck size={16} color={Colors.primary} />
            <Text style={styles.otpTitle}>OTP Verification</Text>
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

      {booking.status === 'pandit_arrived' && booking.arrival_otp_verified ? (
        <View>
          <View style={styles.otpVerifiedBadge}>
            <ShieldCheck size={14} color={Colors.success} />
            <Text style={styles.otpVerifiedText}>OTP verified</Text>
          </View>
          <TouchableOpacity style={styles.transitionBtn} onPress={() => onAction('start_pooja', booking.id)} disabled={!!actionLoading}>
            {isLoading('start_pooja') ? <ActivityIndicator size="small" color={Colors.primary} /> : <Play size={16} color={Colors.primary} />}
            <Text style={styles.transitionBtnText}>Start pooja</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {booking.status === 'pooja_in_progress' ? (
        <TouchableOpacity style={styles.transitionBtn} onPress={() => onAction('complete_pooja', booking.id)} disabled={!!actionLoading}>
          {isLoading('complete_pooja') ? <ActivityIndicator size="small" color={Colors.primary} /> : <CheckCheck size={16} color={Colors.primary} />}
          <Text style={styles.transitionBtnText}>Complete pooja</Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing[5], paddingTop: Spacing[8], gap: Spacing[4], paddingBottom: Spacing[10] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, letterSpacing: 1.2, color: Colors.primary },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['3xl'], color: Colors.textPrimary, marginTop: 4 },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 3 },
  tabBar: { flexDirection: 'row', gap: Spacing[2], backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 4, borderWidth: 1, borderColor: Colors.border },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: Radius.md },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textSecondary },
  tabTextActive: { color: Colors.white },
  empty: { alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[7], gap: Spacing[2], borderWidth: 1, borderColor: Colors.border },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  emptyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, textAlign: 'center' },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], gap: Spacing[3], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing[3] },
  cardHeading: { flex: 1, gap: 3 },
  serviceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  serviceTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.md, color: Colors.textPrimary },
  customer: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: Radius.full, alignSelf: 'flex-start' },
  statusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, textTransform: 'capitalize' },
  detailRow: { flexDirection: 'row', gap: Spacing[3], flexWrap: 'wrap' },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary, textTransform: 'capitalize' },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: Spacing[2] },
  paymentItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  paymentText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  paidChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successSurface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  paidText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.success },
  actionRow: { flexDirection: 'row', gap: Spacing[3], borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: Spacing[3] },
  acceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.success, paddingVertical: Spacing[3], borderRadius: Radius.md },
  acceptBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  declineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.errorSurface, paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.error },
  declineBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.error },
  btnDisabled: { opacity: 0.6 },
  transitionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.primarySurface, paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary },
  transitionBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary },
  otpSection: { backgroundColor: Colors.primarySurface, borderRadius: Radius.md, padding: Spacing[3], gap: Spacing[2], borderWidth: 1, borderColor: Colors.primary },
  otpHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  otpTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary },
  otpHint: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary, lineHeight: 18 },
  otpInputRow: { flexDirection: 'row', gap: Spacing[2], alignItems: 'center' },
  otpInput: { flex: 1, borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary, textAlign: 'center', letterSpacing: 4, backgroundColor: Colors.white },
  otpVerifyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.primary, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], borderRadius: Radius.md },
  otpVerifyBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  otpError: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.error },
  otpVerifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.successSurface, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, alignSelf: 'flex-start' },
  otpVerifiedText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.success },
});
