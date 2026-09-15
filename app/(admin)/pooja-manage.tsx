import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Switch, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Pencil, Flame, X, Check, Inbox, Trash2, Clock3, ChevronRight } from 'lucide-react-native';
import ModuleGuard from '@/components/admin/ModuleGuard';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { PoojaType, PoojaTypeRequest } from '@/types/database';

type Tab = 'types' | 'requests';
type RequestWithProvider = PoojaTypeRequest & { provider?: { full_name: string; mobile: string } | null };

const UNITS = ['pieces', 'packet', 'bunch', 'box', 'ml', 'grams', 'kg', 'dozen', 'litres'];

const EMPTY_TYPE = { name: '', description: '' };

export default function PoojaManageScreen() {
  return <ModuleGuard module="catalog"><PoojaManageContent /></ModuleGuard>;
}

function PoojaManageContent() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('types');

  // Types state
  const [types, setTypes] = useState<PoojaType[]>([]);
  const [typeModal, setTypeModal] = useState(false);
  const [editingType, setEditingType] = useState<PoojaType | null>(null);
  const [typeForm, setTypeForm] = useState(EMPTY_TYPE);
  const [typeError, setTypeError] = useState('');
  const [typeSaving, setTypeSaving] = useState(false);

  // Requests state
  const [requests, setRequests] = useState<RequestWithProvider[]>([]);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [requestProcessing, setRequestProcessing] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [typesRes, reqRes] = await Promise.all([
      supabase.from('pooja_types').select('*').order('sort_order').order('name'),
      supabase.from('pooja_type_requests').select('*, provider:service_providers(full_name, mobile)').order('created_at', { ascending: false }),
    ]);
    setTypes((typesRes.data ?? []) as PoojaType[]);
    setRequests((reqRes.data ?? []) as unknown as RequestWithProvider[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ─── Types CRUD ───────────────────────────────────────────────────────────
  const openCreateType = () => { setEditingType(null); setTypeForm(EMPTY_TYPE); setTypeError(''); setTypeModal(true); };
  const openEditType = (t: PoojaType) => { setEditingType(t); setTypeForm({ name: t.name, description: t.description }); setTypeError(''); setTypeModal(true); };

  const saveType = async () => {
    if (!typeForm.name.trim()) { setTypeError('Pooja name is required'); return; }
    setTypeSaving(true); setTypeError('');
    const payload = { name: typeForm.name.trim(), description: typeForm.description.trim() };
    const result = editingType
      ? await supabase.from('pooja_types').update(payload).eq('id', editingType.id)
      : await supabase.from('pooja_types').insert({ ...payload, sort_order: types.length });
    if (result.error) { setTypeError('Could not save this pooja type.'); setTypeSaving(false); return; }
    setTypeSaving(false); setTypeModal(false); load();
  };

  const toggleType = async (t: PoojaType) => {
    await supabase.from('pooja_types').update({ is_active: !t.is_active }).eq('id', t.id);
    setTypes(prev => prev.map(v => v.id === t.id ? { ...v, is_active: !v.is_active } : v));
  };

  const deleteType = (t: PoojaType) => {
    Alert.alert('Delete pooja type', `Remove "${t.name}" from the catalogue? Pandits using this type will lose their setups.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await supabase.from('pooja_types').delete().eq('id', t.id);
        load();
      }},
    ]);
  };

  // ─── Requests ─────────────────────────────────────────────────────────────
  const approveRequest = async (id: string, name: string, description: string) => {
    setRequestProcessing(true);
    const { data: maxSort } = await supabase.from('pooja_types').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
    await supabase.from('pooja_types').insert({ name: name.trim(), description: description.trim(), sort_order: (maxSort?.sort_order ?? 0) + 1 });
    await supabase.from('pooja_type_requests').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', id);
    setRequestProcessing(false);
    load();
  };

  const rejectRequest = async (id: string) => {
    setRequestProcessing(true);
    await supabase.from('pooja_type_requests').update({ status: 'rejected', rejection_reason: rejectReason.trim() || 'Not applicable', reviewed_at: new Date().toISOString() }).eq('id', id);
    setRejectingId(null); setRejectReason(''); setRequestProcessing(false);
    load();
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const reviewedRequests = requests.filter(r => r.status !== 'pending');

  const TABS: { key: Tab; label: string; icon: typeof Flame; count?: number }[] = [
    { key: 'types', label: 'Pooja Types', icon: Flame },
    { key: 'requests', label: 'Pandit Requests', icon: Inbox, count: pendingRequests.length },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Puja Manage</Text>
          <Text style={styles.subtitle}>Manage pooja types and pandit requests</Text>
        </View>
        {tab === 'types' && <TouchableOpacity style={styles.addButton} onPress={openCreateType}><Plus size={17} color={Colors.white} /><Text style={styles.addText}>Add type</Text></TouchableOpacity>}
      </View>

      <View style={styles.tabBar}>
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <TouchableOpacity key={t.key} style={[styles.tab, active && styles.tabActive]} onPress={() => setTab(t.key)}>
              <Icon size={16} color={active ? Colors.primary : Colors.textTertiary} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              {t.count ? <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{t.count}</Text></View> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
        {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 50 }} /> : (
          <>
            {/* ─── POOJA TYPES TAB ─── */}
            {tab === 'types' && (
              <>
                <View style={styles.info}>
                  <Flame size={19} color={Colors.accent} />
                  <Text style={styles.infoText}>These pooja types appear in the Pandit app. Pandits select from this list and can request new ones if missing.</Text>
                </View>
                {types.length === 0 ? (
                  <View style={styles.empty}><Flame size={42} color={Colors.textDisabled} /><Text style={styles.emptyTitle}>No pooja types yet</Text><Text style={styles.emptyText}>Add the first pooja type for Pandits to select.</Text></View>
                ) : (
                  <View style={styles.list}>
                    {types.map(item => (
                      <View key={item.id} style={[styles.itemCard, !item.is_active && styles.inactive]}>
                        <View style={styles.itemIcon}><Flame size={18} color={Colors.accent} /></View>
                        <View style={styles.itemInfo}>
                          <Text style={styles.itemName}>{item.name}</Text>
                          <Text style={styles.itemDescription}>{item.description || 'No description'}</Text>
                        </View>
                        <TouchableOpacity style={styles.editBtn} onPress={() => openEditType(item)}><Pencil size={15} color={Colors.textSecondary} /></TouchableOpacity>
                        <TouchableOpacity style={styles.editBtn} onPress={() => deleteType(item)}><Trash2 size={15} color={Colors.error} /></TouchableOpacity>
                        <Switch value={item.is_active} onValueChange={() => toggleType(item)} trackColor={{ false: Colors.neutral[300], true: Colors.primaryLight }} thumbColor={item.is_active ? Colors.primary : Colors.neutral[500]} />
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            {/* ─── PANDIT REQUESTS TAB ─── */}
            {tab === 'requests' && (
              <>
                {requests.length === 0 ? (
                  <View style={styles.empty}><Inbox size={42} color={Colors.textDisabled} /><Text style={styles.emptyTitle}>No requests</Text><Text style={styles.emptyText}>Pooja type requests from Pandits will appear here.</Text></View>
                ) : (
                  <>
                    {pendingRequests.length > 0 && <Text style={styles.sectionLabel}>PENDING ({pendingRequests.length})</Text>}
                    {pendingRequests.map(req => (
                      <View key={req.id} style={styles.card}>
                        <View style={styles.cardHeader}>
                          <View style={styles.cardIcon}><Flame size={18} color={Colors.warning} /></View>
                          <View style={styles.cardInfo}>
                            <Text style={styles.cardTitle}>{req.requested_name}</Text>
                            <Text style={styles.cardDesc}>{req.requested_description || 'No description provided'}</Text>
                            <Text style={styles.cardMeta}>From: {req.provider?.full_name ?? 'Unknown'} · {req.provider?.mobile ?? ''}</Text>
                          </View>
                        </View>
                        {rejectingId === req.id ? (
                          <View style={styles.rejectBox}>
                            <TextInput style={styles.rejectInput} value={rejectReason} onChangeText={setRejectReason} placeholder="Rejection reason (optional)" placeholderTextColor={Colors.textDisabled} />
                            <View style={styles.rejectActions}>
                              <TouchableOpacity style={styles.cancelReject} onPress={() => { setRejectingId(null); setRejectReason(''); }}><Text style={styles.cancelRejectText}>Cancel</Text></TouchableOpacity>
                              <TouchableOpacity style={styles.confirmReject} onPress={() => rejectRequest(req.id)} disabled={requestProcessing}>
                                {requestProcessing ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.confirmRejectText}>Confirm reject</Text>}
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <View style={styles.cardActions}>
                            <TouchableOpacity style={styles.rejectBtn} onPress={() => setRejectingId(req.id)} disabled={requestProcessing}>
                              <X size={16} color={Colors.error} /><Text style={styles.rejectText}>Reject</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.approveBtn} onPress={() => approveRequest(req.id, req.requested_name, req.requested_description)} disabled={requestProcessing}>
                              {requestProcessing ? <ActivityIndicator size="small" color={Colors.white} /> : <><Check size={16} color={Colors.white} /><Text style={styles.approveText}>Approve & add to catalogue</Text></>}
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    ))}
                    {reviewedRequests.length > 0 && <Text style={styles.sectionLabel}>REVIEWED ({reviewedRequests.length})</Text>}
                    {reviewedRequests.map(req => (
                      <View key={req.id} style={[styles.card, styles.reviewedCard]}>
                        <View style={styles.cardHeader}>
                          <View style={styles.cardIcon}><Flame size={18} color={req.status === 'approved' ? Colors.success : Colors.error} /></View>
                          <View style={styles.cardInfo}>
                            <Text style={styles.cardTitle}>{req.requested_name}</Text>
                            <Text style={styles.cardDesc}>{req.requested_description || 'No description provided'}</Text>
                            <Text style={styles.cardMeta}>From: {req.provider?.full_name ?? 'Unknown'}</Text>
                            {req.rejection_reason ? <Text style={styles.rejectReason}>Rejected: {req.rejection_reason}</Text> : null}
                          </View>
                          <View style={[styles.statusBadge, req.status === 'approved' ? styles.statusApproved : styles.statusRejected]}>
                            <Text style={[styles.statusText, req.status === 'approved' ? styles.statusTextApproved : styles.statusTextRejected]}>{req.status}</Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* ─── TYPE MODAL ─── */}
      <Modal visible={typeModal} transparent animationType="fade" onRequestClose={() => setTypeModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editingType ? 'Edit pooja type' : 'Add pooja type'}</Text>
              <TouchableOpacity onPress={() => setTypeModal(false)}><X size={20} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.form}>
              <Text style={styles.label}>Name *</Text>
              <TextInput style={styles.input} value={typeForm.name} onChangeText={name => setTypeForm({ ...typeForm, name })} placeholder="e.g. Griha Pravesh" placeholderTextColor={Colors.textDisabled} />
              <Text style={styles.label}>Description</Text>
              <TextInput style={[styles.input, styles.multiline]} value={typeForm.description} onChangeText={description => setTypeForm({ ...typeForm, description })} multiline placeholder="What does this pooja involve?" placeholderTextColor={Colors.textDisabled} />
              {typeError ? <Text style={styles.error}>{typeError}</Text> : null}
            </ScrollView>
            <View style={styles.footer}>
              <TouchableOpacity style={styles.cancel} onPress={() => setTypeModal(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.save} onPress={saveType} disabled={typeSaving}>
                {typeSaving ? <ActivityIndicator color={Colors.white} /> : <><Check size={16} color={Colors.white} /><Text style={styles.saveText}>{editingType ? 'Save changes' : 'Add type'}</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing[6], paddingVertical: Spacing[5], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: 26, color: Colors.textPrimary },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 3 },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.md },
  addText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.white, fontSize: Typography.size.sm },

  tabBar: { flexDirection: 'row', backgroundColor: Colors.white, paddingHorizontal: Spacing[4], borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing[2] },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary },
  tabTextActive: { color: Colors.primary },
  tabBadge: { backgroundColor: Colors.warning, borderRadius: 10, minWidth: 18, height: 18, paddingHorizontal: 5, justifyContent: 'center', alignItems: 'center' },
  tabBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.white },

  content: { padding: Spacing[6], gap: Spacing[4], maxWidth: 1000, width: '100%', alignSelf: 'center' },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3], padding: Spacing[4], backgroundColor: Colors.accentSurface, borderRadius: Radius.md },
  infoText: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.accentDark, lineHeight: 20 },

  list: { gap: Spacing[3] },
  itemCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], padding: Spacing[4], backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  inactive: { opacity: 0.6 },
  itemIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.accentSurface, alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1, gap: 3 },
  itemName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  itemDescription: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  unitBadge: { alignSelf: 'flex-start', color: Colors.accentDark, backgroundColor: Colors.accentSurface, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, overflow: 'hidden' },
  editBtn: { padding: 8 },

  empty: { alignItems: 'center', paddingVertical: 80, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  emptyText: { fontFamily: Typography.fontFamily.sansRegular, color: Colors.textTertiary, textAlign: 'center' },

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

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.4)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { width: '100%', maxWidth: 560, maxHeight: '90%', backgroundColor: Colors.white, borderRadius: Radius.xl, overflow: 'hidden' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 22, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sheetTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  form: { padding: 22, gap: 4 },
  label: { fontFamily: Typography.fontFamily.sansMedium, color: Colors.textSecondary, fontSize: Typography.size.sm, marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 11, fontFamily: Typography.fontFamily.sansRegular, color: Colors.textPrimary, fontSize: Typography.size.base },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  units: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unitChip: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 8 },
  unitChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  unitChipText: { fontFamily: Typography.fontFamily.sansMedium, color: Colors.textSecondary, fontSize: Typography.size.sm },
  unitChipTextActive: { color: Colors.white },
  error: { color: Colors.error, fontFamily: Typography.fontFamily.sansRegular, marginTop: 8 },
  footer: { flexDirection: 'row', gap: 12, padding: 18, borderTopWidth: 1, borderTopColor: Colors.border },
  cancel: { flex: 1, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md },
  cancelText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textSecondary },
  save: { flex: 2, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.primary },
  saveText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.white },
});
