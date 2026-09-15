import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { CalendarClock, CheckCircle2, XCircle, Clock3, LogOut, Sparkles, Flame, Plus, Package, Languages } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

type Booking = {
  id: string;
  customer_name: string;
  preferred_date: string;
  preferred_time: string;
  consultation_mode: string;
  status: string;
  provider_services?: { name: string; description: string | null; duration_minutes: number } | null;
  provider_pooja_setups?: {
    description: string | null;
    duration_minutes: number;
    service_fee: number;
    language: string | null;
    special_instructions: string | null;
    pooja_type?: { name: string } | null;
    items?: { quantity: number; pooja_item?: { name: string; unit_type: string } | null }[];
  } | null;
};

export default function ProviderBookingsScreen() {
  const { session, signOut } = useAuthStore();
  const [provider, setProvider] = useState<any>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session?.user?.id) return;
    const { data: providerData } = await supabase.from('service_providers').select('id, full_name, category, approval_status').eq('auth_user_id', session.user.id).maybeSingle();
    setProvider(providerData);
    if (providerData) {
      const { data } = await supabase.from('provider_bookings').select('id, customer_name, preferred_date, preferred_time, consultation_mode, status, provider_services(name, description, duration_minutes), provider_pooja_setups(description, duration_minutes, service_fee, language, special_instructions, pooja_type:pooja_types(name), items:provider_pooja_items(quantity, pooja_item:pooja_items(name, unit_type)))').eq('provider_id', providerData.id).order('created_at', { ascending: false });
      setBookings((data ?? []) as unknown as Booking[]);
    }
    setLoading(false); setRefreshing(false);
  }, [session?.user?.id]);
  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: string) => { await supabase.from('provider_bookings').update({ status, updated_at: new Date().toISOString() }).eq('id', id); load(); };
  const pending = bookings.filter((item) => item.status === 'pending');
  const active = bookings.filter((item) => item.status !== 'pending');

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;
  return <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}><View style={styles.header}><View><Text style={styles.eyebrow}>SERVICE PROVIDER</Text><Text style={styles.title}>Welcome, {provider?.full_name?.split(' ')[0] ?? 'Provider'}</Text><Text style={styles.subtitle}>Manage your customer requests</Text></View><TouchableOpacity onPress={signOut} style={styles.logout}><LogOut size={17} color={Colors.error} /></TouchableOpacity></View><View style={styles.metrics}><View style={styles.metric}><Clock3 size={18} color={Colors.warning} /><Text style={styles.metricValue}>{pending.length}</Text><Text style={styles.metricLabel}>Pending</Text></View><View style={styles.metric}><CalendarClock size={18} color={Colors.primary} /><Text style={styles.metricValue}>{bookings.length}</Text><Text style={styles.metricLabel}>Total requests</Text></View><View style={styles.metric}><CheckCircle2 size={18} color={Colors.success} /><Text style={styles.metricValue}>{bookings.filter((item) => item.status === 'completed').length}</Text><Text style={styles.metricLabel}>Completed</Text></View></View>{(Array.isArray(provider?.category) ? (provider?.category as string[]).includes('pandit') : provider?.category === 'pandit') && <View style={styles.poojaPrompt}><View style={styles.poojaPromptIcon}><Flame size={20} color={Colors.accentDark} /></View><View style={styles.poojaPromptCopy}><Text style={styles.poojaPromptTitle}>Manage your pooja services</Text><Text style={styles.poojaPromptText}>Add the pooja types you offer and set prices so customers can discover and contact you.</Text></View><TouchableOpacity style={styles.poojaPromptButton} onPress={() => router.push('/(provider)/pooja')}><Plus size={15} color={Colors.white} /><Text style={styles.poojaPromptButtonText}>Add Pooja Type</Text></TouchableOpacity></View>}<Text style={styles.sectionTitle}>Pending requests</Text>{pending.length === 0 ? <View style={styles.empty}><Sparkles size={28} color={Colors.primary} /><Text style={styles.emptyTitle}>You are all caught up</Text><Text style={styles.emptyText}>New customer booking requests will appear here.</Text></View> : pending.map((booking) => <BookingCard key={booking.id} booking={booking} onAccept={() => updateStatus(booking.id, 'accepted')} onDecline={() => updateStatus(booking.id, 'declined')} />)}{active.length > 0 && <><Text style={styles.sectionTitle}>Recent activity</Text>{active.slice(0, 10).map((booking) => <BookingCard key={booking.id} booking={booking} onComplete={booking.status === 'confirmed' ? () => updateStatus(booking.id, 'completed') : undefined} />)}</>}</ScrollView>;
}

function BookingCard({ booking, onAccept, onDecline, onComplete }: { booking: Booking; onAccept?: () => void; onDecline?: () => void; onComplete?: () => void }) {
  const statusColor = booking.status === 'accepted' ? Colors.success : booking.status === 'declined' ? Colors.error : Colors.textTertiary;
  const pooja = booking.provider_pooja_setups;
  const title = pooja?.pooja_type?.name ?? booking.provider_services?.name ?? 'Service request';
  const items = pooja?.items ?? [];
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardHeading}>
          <Text style={styles.customer}>{booking.customer_name}</Text>
          <View style={styles.serviceTitleRow}>{pooja ? <Flame size={15} color={Colors.accent} /> : null}<Text style={styles.service}>{title}</Text></View>
        </View>
        <View style={[styles.status, { backgroundColor: statusColor + '16' }]}><Text style={[styles.statusText, { color: statusColor }]}>{booking.status.replace('_', ' ')}</Text></View>
      </View>
      <View style={styles.details}><Text style={styles.detail}>{booking.preferred_date}</Text><Text style={styles.detail}>{booking.preferred_time}</Text><Text style={styles.detail}>{booking.consultation_mode.replace('_', ' ')}</Text></View>
      {pooja ? <View style={styles.poojaDetails}>
        {pooja.description ? <Text style={styles.poojaDescription}>{pooja.description}</Text> : null}
        <View style={styles.poojaMeta}><View style={styles.poojaMetaItem}><Clock3 size={14} color={Colors.textTertiary} /><Text style={styles.poojaMetaText}>{pooja.duration_minutes} min</Text></View><View style={styles.poojaMetaItem}><Languages size={14} color={Colors.textTertiary} /><Text style={styles.poojaMetaText}>{pooja.language || 'Language on request'}</Text></View><Text style={styles.poojaFee}>₹{pooja.service_fee}</Text></View>
        {items.length > 0 ? <View style={styles.itemsRow}><Package size={14} color={Colors.textTertiary} /><Text style={styles.itemsText}>{items.map(item => `${item.pooja_item?.name ?? 'Item'} (${item.quantity} ${item.pooja_item?.unit_type ?? ''})`).join(' · ')}</Text></View> : null}
        {pooja.special_instructions ? <Text style={styles.instructions}>Instructions: {pooja.special_instructions}</Text> : null}
      </View> : null}
      {onAccept && onDecline ? <View style={styles.actions}><TouchableOpacity style={styles.decline} onPress={onDecline}><XCircle size={16} color={Colors.error} /><Text style={styles.declineText}>Decline</Text></TouchableOpacity><TouchableOpacity style={styles.accept} onPress={onAccept}><CheckCircle2 size={16} color={Colors.white} /><Text style={styles.acceptText}>Accept</Text></TouchableOpacity></View> : null}
      {onComplete ? <TouchableOpacity style={styles.complete} onPress={onComplete}><CheckCircle2 size={16} color={Colors.primary} /><Text style={styles.completeText}>Mark service completed</Text></TouchableOpacity> : null}
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: Colors.background }, content: { padding: Spacing[5], paddingTop: Spacing[8], gap: Spacing[4], paddingBottom: Spacing[10] }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, eyebrow: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, letterSpacing: 1.2, color: Colors.primary }, title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['3xl'], color: Colors.textPrimary, marginTop: 4 }, subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 3 }, logout: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.errorSurface, alignItems: 'center', justifyContent: 'center' }, metrics: { flexDirection: 'row', gap: Spacing[3] }, metric: { flex: 1, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[3], gap: 5, borderWidth: 1, borderColor: Colors.border }, metricValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary }, metricLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary }, poojaPrompt: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], backgroundColor: Colors.accentSurface, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.accentLight }, poojaPromptIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' }, poojaPromptCopy: { flex: 1, gap: 3 }, poojaPromptTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary }, poojaPromptText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary, lineHeight: 17 }, poojaPromptButton: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primary, paddingHorizontal: 10, paddingVertical: 9, borderRadius: Radius.md }, poojaPromptButtonText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.white }, sectionTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary, marginTop: Spacing[3] }, empty: { alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[7], gap: Spacing[2], borderWidth: 1, borderColor: Colors.border }, emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary }, emptyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, textAlign: 'center' }, card: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], gap: Spacing[3], borderWidth: 1, borderColor: Colors.border }, cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing[3] }, cardHeading: { flex: 1, gap: 3 }, serviceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, customer: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.md, color: Colors.textPrimary }, service: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 3 }, status: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: Radius.full, alignSelf: 'flex-start' }, statusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, textTransform: 'capitalize' }, details: { flexDirection: 'row', gap: Spacing[3], flexWrap: 'wrap' }, poojaDetails: { backgroundColor: Colors.accentSurface, borderRadius: Radius.md, padding: Spacing[3], gap: Spacing[2] }, poojaDescription: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, lineHeight: 19, color: Colors.textSecondary }, poojaMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], flexWrap: 'wrap' }, poojaMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 }, poojaMetaText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'capitalize' }, poojaFee: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary }, itemsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 }, itemsText: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, lineHeight: 17, color: Colors.textSecondary }, instructions: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, lineHeight: 17, color: Colors.textSecondary }, detail: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary, textTransform: 'capitalize' }, actions: { flexDirection: 'row', gap: Spacing[2] }, complete: { minHeight: 42, borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }, completeText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.primary, fontSize: Typography.size.sm }, decline: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: Colors.error + '55', borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }, declineText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.error, fontSize: Typography.size.sm }, accept: { flex: 1, minHeight: 42, backgroundColor: Colors.success, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }, acceptText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.white, fontSize: Typography.size.sm } });
