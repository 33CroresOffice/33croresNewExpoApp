import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, X, Clock3, Flame, Inbox } from 'lucide-react-native';
import ModuleGuard from '@/components/admin/ModuleGuard';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { PoojaTypeRequest } from '@/types/database';

type RequestWithProvider = PoojaTypeRequest & { provider?: { full_name: string; mobile: string } | null };

export default function PoojaTypeRequestsScreen() {
  return <ModuleGuard module="catalog"><PoojaTypeRequestsContent /></ModuleGuard>;
}

function PoojaTypeRequestsContent() {
  const insets = useSafeAreaInsets();
  const [requests, setRequests] = useState<RequestWithProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('pooja_type_requests')
      .select('*, provider:service_providers(full_name, mobile)')
      .order('created_at', { ascending: false });
    setRequests((data ?? []) as unknown as RequestWithProvider[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const approve = async (id: string, name: string, description: string) => {
    setProcessing(true);
    const { data: maxSort } = await supabase.from('pooja_types').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
    await supabase.from('pooja_types').insert({ name: name.trim(), description: description.trim(), sort_order: (maxSort?.sort_order ?? 0) + 1 });
    await supabase.from('pooja_type_requests').update({ status: 'approved', reviewed_by: null, reviewed_at: new Date().toISOString() }).eq('id', id);
    setProcessing(false);
    load();
  };

  const reject = async (id: string) => {
    setProcessing(true);
    await supabase.from('pooja_type_requests').update({ status: 'rejected', rejection_reason: rejectReason.trim() || 'Not applicable', reviewed_by: null, reviewed_at: new Date().toISOString() }).eq('id', id);
    setRejecting(null);
    setRejectReason('');
    setProcessing(false);
    load();
  };

  const pending = requests.filter(r => r.status === 'pending');
  const reviewed = requests.filter(r => r.status !== 'pending');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Pooja Type Requests</Text>
          <Text style={styles.subtitle}>Review new pooja requests from Pandits</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
        {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 50 }} /> : requests.length === 0 ? (
          <View style={styles.empty}>
            <Inbox size={42} color={Colors.textDisabled} />
            <Text style={styles.emptyTitle}>No requests</Text>
            <Text style={styles.emptyText}>Pooja type requests from Pandits will appear here.</Text>
          </View>
        ) : (
          <>
            {pending.length > 0 && <Text style={styles.sectionLabel}>PENDING ({pending.length})</Text>}
            {pending.map(req => (
              <View key={req.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardIcon}><Flame size={18} color={Colors.warning} /></View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle}>{req.requested_name}</Text>
                    <Text style={styles.cardDesc}>{req.requested_description || 'No description provided'}</Text>
                    <Text style={styles.cardMeta}>From: {req.provider?.full_name ?? 'Unknown'} · {req.provider?.mobile ?? ''}</Text>
                  </View>
                </View>
                {rejecting === req.id ? (
                  <View style={styles.rejectBox}>
                    <TextInput style={styles.rejectInput} value={rejectReason} onChangeText={setRejectReason} placeholder="Rejection reason (optional)" placeholderTextColor={Colors.textDisabled} />
                    <View style={styles.rejectActions}>
                      <TouchableOpacity style={styles.cancelReject} onPress={() => { setRejecting(null); setRejectReason(''); }}><Text style={styles.cancelRejectText}>Cancel</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.confirmReject} onPress={() => reject(req.id)} disabled={processing}>
                        {processing ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.confirmRejectText}>Confirm reject</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.cardActions}>
                    <TouchableOpacity style={styles.rejectBtn} onPress={() => setRejecting(req.id)} disabled={processing}>
                      <X size={16} color={Colors.error} /><Text style={styles.rejectText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.approveBtn} onPress={() => approve(req.id, req.requested_name, req.requested_description)} disabled={processing}>
                      {processing ? <ActivityIndicator size="small" color={Colors.white} /> : <><Check size={16} color={Colors.white} /><Text style={styles.approveText}>Approve & add to catalogue</Text></>}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
            {reviewed.length > 0 && <Text style={styles.sectionLabel}>REVIEWED ({reviewed.length})</Text>}
            {reviewed.map(req => (
              <View key={req.id} style={[styles.card, styles.reviewedCard]}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardIcon}>
                    <Flame size={18} color={req.status === 'approved' ? Colors.success : Colors.error} />
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle}>{req.requested_name}</Text>
                    <Text style={styles.cardDesc}>{req.requested_description || 'No description provided'}</Text>
                    <Text style={styles.cardMeta}>From: {req.provider?.full_name ?? 'Unknown'}</Text>
                    {req.rejection_reason && <Text style={styles.rejectReason}>Rejected: {req.rejection_reason}</Text>}
                  </View>
                  <View style={[styles.statusBadge, req.status === 'approved' ? styles.statusApproved : styles.statusRejected]}>
                    <Text style={[styles.statusText, req.status === 'approved' ? styles.statusTextApproved : styles.statusTextRejected]}>{req.status}</Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing[6], paddingVertical: Spacing[5], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: 26, color: Colors.textPrimary },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 3 },
  content: { padding: Spacing[6], gap: Spacing[4], maxWidth: 1000, width: '100%', alignSelf: 'center' },
  sectionLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.textTertiary, letterSpacing: 0.8, marginBottom: Spacing[1] },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], gap: Spacing[3], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  reviewedCard: { opacity: 0.8 },
  cardHeader: { flexDirection: 'row', gap: Spacing[3], alignItems: 'flex-start' },
  cardIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.accentSurface, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1, gap: 3 },
  cardTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  cardDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 20 },
  cardMeta: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  rejectReason: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.error, marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: Spacing[2], borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing[3] },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.error + '55' },
  rejectText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.error, fontSize: Typography.size.sm },
  approveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: Radius.md, backgroundColor: Colors.success },
  approveText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.white, fontSize: Typography.size.sm },
  rejectBox: { gap: Spacing[2], borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing[3] },
  rejectInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, fontFamily: Typography.fontFamily.sansRegular, color: Colors.textPrimary },
  rejectActions: { flexDirection: 'row', gap: Spacing[2] },
  cancelReject: { flex: 1, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md },
  cancelRejectText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textSecondary, fontSize: Typography.size.sm },
  confirmReject: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: Radius.md, backgroundColor: Colors.error },
  confirmRejectText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.white, fontSize: Typography.size.sm },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  statusApproved: { backgroundColor: Colors.successSurface },
  statusRejected: { backgroundColor: Colors.errorSurface },
  statusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, textTransform: 'capitalize' },
  statusTextApproved: { color: Colors.success },
  statusTextRejected: { color: Colors.error },
  empty: { alignItems: 'center', paddingVertical: 80, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  emptyText: { fontFamily: Typography.fontFamily.sansRegular, color: Colors.textTertiary, textAlign: 'center' },
});
