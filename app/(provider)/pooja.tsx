import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { router } from 'expo-router';
import { Plus, Pencil, Trash2, Flame, X, Check, Share2, Clock3, IndianRupee, Languages, Package } from 'lucide-react-native';
import CollapsibleCategory from '@/components/ui/CollapsibleCategory';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { PoojaType, ProviderPoojaSetup, PoojaItem, PoojaTypeRequest } from '@/types/database';

export default function ProviderPoojaSetupScreen() {
  const { session } = useAuthStore();
  const [providerId, setProviderId] = useState<string | null>(null);
  const [provider, setProvider] = useState<any>(null);
  const [setups, setSetups] = useState<ProviderPoojaSetup[]>([]);
  const [poojaTypes, setPoojaTypes] = useState<PoojaType[]>([]);
  const [poojaItems, setPoojaItems] = useState<PoojaItem[]>([]);
  const [requests, setRequests] = useState<PoojaTypeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Add pooja form state
  const [showForm, setShowForm] = useState(false);
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>([]);
  const [feesByType, setFeesByType] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Share state
  const [showShare, setShowShare] = useState(false);
  const [shareSetup, setShareSetup] = useState<ProviderPoojaSetup | null>(null);
  const [shareMobile, setShareMobile] = useState('');
  const [shareError, setShareError] = useState('');
  const [shareSaving, setShareSaving] = useState(false);
  const [shareSuccess, setShareSuccess] = useState('');

  const load = useCallback(async () => {
    if (!session?.user?.id) return;
    const { data: providerData } = await supabase
      .from('service_providers')
      .select('id, full_name, category, approval_status')
      .eq('auth_user_id', session.user.id)
      .maybeSingle();
    setProvider(providerData);
    if (!providerData) { setLoading(false); return; }
    setProviderId(providerData.id);

    const [setupsRes, typesRes, itemsRes, reqRes] = await Promise.all([
      supabase.from('provider_pooja_setups').select('*, pooja_type:pooja_types(*), items:provider_pooja_items(*, pooja_item:pooja_items(*, category:pooja_item_categories(*)))').eq('provider_id', providerData.id).order('created_at', { ascending: false }),
      supabase.from('pooja_types').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('pooja_items').select('*').eq('is_active', true).order('sort_order').order('name'),
      supabase.from('pooja_type_requests').select('*').eq('provider_id', providerData.id).order('created_at', { ascending: false }),
    ]);

    setSetups((setupsRes.data ?? []) as unknown as ProviderPoojaSetup[]);
    setPoojaTypes((typesRes.data ?? []) as PoojaType[]);
    setPoojaItems((itemsRes.data ?? []) as PoojaItem[]);
    setRequests((reqRes.data ?? []) as PoojaTypeRequest[]);
    setLoading(false);
    setRefreshing(false);
  }, [session?.user?.id]);

  useEffect(() => { load(); }, [load]);

  const isPandit = provider?.category?.includes('pandit') ?? false;
  const isApproved = provider?.approval_status === 'approved';

  const resetForm = () => {
    setSelectedTypeIds([]); setFeesByType({}); setError(''); setShowForm(false);
  };

  const openCreate = () => {
    resetForm();
    const existingFees = setups.reduce<Record<string, string>>((fees, setup) => {
      fees[setup.pooja_type_id] = String(setup.service_fee);
      return fees;
    }, {});
    setSelectedTypeIds(setups.map((setup) => setup.pooja_type_id));
    setFeesByType(existingFees);
    setShowForm(true);
  };

  const save = async () => {
    if (!providerId || selectedTypeIds.length === 0 || selectedTypeIds.some((typeId) => !(feesByType[typeId] ?? '').trim())) {
      setError('Select at least one pooja and enter its price.');
      return;
    }
    if (selectedTypeIds.some((typeId) => Number(feesByType[typeId]) < 0)) {
      setError('Service fee cannot be negative.');
      return;
    }
    setSaving(true); setError('');
    try {
      const selectedSet = new Set(selectedTypeIds);
      const removedSetups = setups.filter((setup) => !selectedSet.has(setup.pooja_type_id));
      for (const setup of removedSetups) {
        const { error: deleteError } = await supabase.from('provider_pooja_setups').delete().eq('id', setup.id);
        if (deleteError) throw deleteError;
      }
      for (const typeId of selectedTypeIds) {
        const existingSetup = setups.find((setup) => setup.pooja_type_id === typeId);
        const payload = { service_fee: Number(feesByType[typeId]), is_active: true, updated_at: new Date().toISOString() };
        if (existingSetup) {
          const { error: updateError } = await supabase.from('provider_pooja_setups').update(payload).eq('id', existingSetup.id);
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase.from('provider_pooja_setups').insert({ ...payload, provider_id: providerId, pooja_type_id: typeId });
          if (insertError) throw insertError;
        }
      }
      resetForm();
      load();
    } catch (e: unknown) {
      console.error('Pooja setup save failed', e);
      setError('Could not save the selected poojas. Please try again.');
    }
    setSaving(false);
  };

  const remove = (setupId: string) => {
    Alert.alert('Remove pooja', 'Are you sure you want to remove this pooja setup?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await supabase.from('provider_pooja_setups').delete().eq('id', setupId);
        load();
      }},
    ]);
  };

  const sharePooja = async () => {
    if (!providerId || !shareSetup || !shareMobile.trim()) { setShareError('Enter a customer mobile number.'); return; }
    if (!/^[6-9][0-9]{9}$/.test(shareMobile.trim())) { setShareError('Enter a valid 10-digit mobile number.'); return; }
    setShareSaving(true); setShareError(''); setShareSuccess('');
    try {
      const { data: shareData, error: shareErr } = await supabase.from('pooja_list_shares').insert({
        provider_id: providerId,
        pooja_setup_id: shareSetup.id,
        customer_mobile: shareMobile.trim(),
      }).select().single();
      if (shareErr) throw shareErr;

      if (!shareData?.id) throw new Error('Share record was not created');
      const { error: functionError } = await supabase.functions.invoke('share-pooja-list', {
        body: { shareId: shareData.id },
      });
      if (functionError) throw functionError;
      setShareSuccess('Pooja list shared! The customer will receive it via SMS and WhatsApp.');
      setShareMobile('');
    } catch (e: unknown) {
      console.error('Share failed', e);
      setShareError('Could not share the pooja list. Please try again.');
    }
    setShareSaving(false);
  };

  const availableTypes = poojaTypes;

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;

  if (!isPandit) {
    return <View style={styles.center}><Flame size={40} color={Colors.textDisabled} /><Text style={styles.emptyTitle}>Pooja setup is available for Pandits only.</Text></View>;
  }
  if (!isApproved) {
    return <View style={styles.center}><Flame size={40} color={Colors.textDisabled} /><Text style={styles.emptyTitle}>Your provider account is pending approval.</Text><Text style={styles.emptyText}>Once approved, you can set up your pooja offerings.</Text></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>POOJA SETUP</Text>
        <View style={styles.titleRow}>
          <Text style={styles.title}>My Poojas</Text>
          <TouchableOpacity style={styles.addBtn} onPress={openCreate} activeOpacity={0.85}>
            <Plus size={17} color={Colors.white} strokeWidth={2.5} />
            <Text style={styles.addBtnText}>Add Pooja</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>Manage your pooja offerings and item lists</Text>
      </View>

      {requests.filter(r => r.status === 'pending').length > 0 && (
        <View style={styles.pendingReqBanner}>
          <Clock3 size={16} color={Colors.warning} />
          <Text style={styles.pendingReqText}>{requests.filter(r => r.status === 'pending').length} pooja request(s) awaiting admin review</Text>
        </View>
      )}
      {requests.filter(r => r.status !== 'pending').length > 0 && (
        <View style={styles.reviewedReqBanner}>
          {requests.filter(r => r.status !== 'pending').slice(0, 3).map(req => (
            <View key={req.id} style={styles.reviewedReqItem}>
              <Text style={styles.reviewedReqName}>{req.requested_name}</Text>
              <View style={[styles.reqStatusBadge, req.status === 'approved' ? styles.reqStatusApproved : styles.reqStatusRejected]}>
                <Text style={[styles.reqStatusText, req.status === 'approved' ? styles.reqStatusTextApproved : styles.reqStatusTextRejected]}>{req.status}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {setups.length === 0 && !showForm ? (
        <View style={styles.empty}>
          <Flame size={36} color={Colors.primary} />
          <Text style={styles.emptyTitle}>No poojas set up yet</Text>
          <Text style={styles.emptyText}>Select a pooja from the catalogue, add your pricing and details, and build an item list for each pooja you offer.</Text>
        </View>
      ) : (
        setups.map(setup => (
          <View key={setup.id} style={styles.setupCard}>
            <TouchableOpacity style={styles.setupHeader} onPress={() => router.push({ pathname: '/(provider)/pooja-details' as any, params: { id: setup.id } })}>

              <View style={styles.setupIcon}><Flame size={18} color={Colors.accent} /></View>
              <View style={styles.setupInfo}>
                <Text style={styles.setupName}>{setup.pooja_type?.name ?? 'Unknown pooja'}</Text>
                <Text style={styles.setupDesc}>{setup.description || 'No description added'}</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.setupMeta}>
              <View style={styles.metaItem}><Clock3 size={14} color={Colors.textTertiary} /><Text style={styles.metaText}>{setup.duration_minutes} min</Text></View>
              <View style={styles.metaItem}><IndianRupee size={14} color={Colors.textTertiary} /><Text style={styles.metaText}>{setup.service_fee}</Text></View>
              {setup.language ? <View style={styles.metaItem}><Languages size={14} color={Colors.textTertiary} /><Text style={styles.metaText}>{setup.language}</Text></View> : null}
            </View>
            {setup.special_instructions ? <Text style={styles.setupInstructions}>{setup.special_instructions}</Text> : null}
            {setup.items && setup.items.length > 0 && (
              <View style={styles.itemsSection}>
                <Text style={styles.itemsLabel}>Pooja Item List ({setup.items.length})</Text>
                {(() => {
                  const groups: Record<string, { name: string; items: typeof setup.items }> = {};
                  for (const item of setup.items) {
                    const catId = item.pooja_item?.category_id ?? 'uncategorized';
                    const catName = item.pooja_item?.category?.name ?? 'Uncategorized';
                    if (!groups[catId]) groups[catId] = { name: catName, items: [] };
                    groups[catId].items.push(item);
                  }
                  const groupEntries = Object.values(groups).sort((a, b) => {
                    if (a.name === 'Uncategorized') return 1;
                    if (b.name === 'Uncategorized') return -1;
                    return a.name.localeCompare(b.name);
                  });
                  return groupEntries.map((group, idx) => (
                    <CollapsibleCategory key={group.name} title={group.name} itemCount={group.items.length} defaultExpanded={idx === 0}>
                      {group.items.map(item => (
                        <View key={item.id} style={styles.itemRow}>
                          <Package size={14} color={Colors.accent} />
                          <Text style={styles.itemName}>{item.pooja_item?.name ?? 'Unknown item'}</Text>
                          <Text style={styles.itemQty}>{item.quantity} {item.pooja_item?.unit_type ?? ''}</Text>
                        </View>
                      ))}
                    </CollapsibleCategory>
                  ));
                })()}
              </View>
            )}
            <View style={styles.setupActions}>
              <TouchableOpacity style={styles.shareAction} onPress={() => { setShareSetup(setup); setShareMobile(''); setShareError(''); setShareSuccess(''); setShowShare(true); }}>
                <Share2 size={15} color={Colors.primary} /><Text style={styles.shareActionText}>Share list</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.action} onPress={() => router.push({ pathname: '/(provider)/pooja-details' as any, params: { id: setup.id } })}>
                <Pencil size={15} color={Colors.primary} /><Text style={styles.actionText}>Details</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.action} onPress={() => remove(setup.id)}>
                <Trash2 size={15} color={Colors.error} /><Text style={[styles.actionText, { color: Colors.error }]}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {/* Setup Form Modal */}
      <Modal visible={showForm} transparent animationType="fade" onRequestClose={resetForm}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Add Pooja</Text>
              <TouchableOpacity onPress={resetForm}><X size={20} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.form}>
              <Text style={styles.label}>Pooja type *</Text>
              {availableTypes.length === 0 ? (
                <Text style={styles.noTypesText}>No active pooja types are available yet. Ask an admin to add one.</Text>
              ) : (
                <View style={styles.poojaTypeList}>
                  {availableTypes.map(type => {
                    const checked = selectedTypeIds.includes(type.id);
                    return <View key={type.id} style={styles.poojaTypeRow}>
                      <TouchableOpacity style={styles.poojaTypeCheck} onPress={() => setSelectedTypeIds((current) => checked ? current.filter((id) => id !== type.id) : [...current, type.id])}>
                        <View style={[styles.checkbox, checked && styles.checkboxActive]}>{checked ? <Check size={14} color={Colors.white} /> : null}</View>
                        <Text style={styles.poojaTypeName}>{type.name}</Text>
                      </TouchableOpacity>
                      <TextInput
                        style={[styles.priceInput, !checked && styles.priceInputDisabled]}
                        value={feesByType[type.id] ?? ''}
                        onChangeText={(value) => setFeesByType((current) => ({ ...current, [type.id]: value }))}
                        keyboardType="decimal-pad"
                        placeholder="Price ₹"
                        placeholderTextColor={Colors.textDisabled}
                        editable={checked}
                      />
                    </View>;
                  })}
                </View>
              )}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </ScrollView>
            <View style={styles.footer}>
              <TouchableOpacity style={styles.cancel} onPress={resetForm}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.save, (selectedTypeIds.length === 0 || selectedTypeIds.some((typeId) => !(feesByType[typeId] ?? '').trim())) && styles.saveDisabled]} onPress={save} disabled={saving || selectedTypeIds.length === 0 || selectedTypeIds.some((typeId) => !(feesByType[typeId] ?? '').trim())}>
                {saving ? <ActivityIndicator color={Colors.white} /> : <><Check size={16} color={Colors.white} /><Text style={styles.saveText}>Save selected poojas</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Share Modal */}
      <Modal visible={showShare} transparent animationType="fade" onRequestClose={() => setShowShare(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Share Pooja List</Text>
              <TouchableOpacity onPress={() => setShowShare(false)}><X size={20} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <View style={styles.form}>
              <Text style={styles.sharePoojaName}>{shareSetup?.pooja_type?.name ?? 'Pooja'}</Text>
              <Text style={styles.subLabel}>Enter the customer's mobile number. They will receive the pooja item list via SMS and WhatsApp with a link to view details.</Text>
              <TextInput style={styles.input} value={shareMobile} onChangeText={setShareMobile} keyboardType="number-pad" placeholder="10-digit mobile number" placeholderTextColor={Colors.textDisabled} maxLength={10} />
              {shareError ? <Text style={styles.error}>{shareError}</Text> : null}
              {shareSuccess ? <Text style={styles.successText}>{shareSuccess}</Text> : null}
            </View>
            <View style={styles.footer}>
              <TouchableOpacity style={styles.cancel} onPress={() => setShowShare(false)}><Text style={styles.cancelText}>Close</Text></TouchableOpacity>
              <TouchableOpacity style={styles.save} onPress={sharePooja} disabled={shareSaving}>
                {shareSaving ? <ActivityIndicator color={Colors.white} /> : <><Share2 size={16} color={Colors.white} /><Text style={styles.saveText}>Share now</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing[5], paddingTop: Spacing[8], gap: Spacing[4], paddingBottom: Spacing[10] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing[3], paddingHorizontal: Spacing[6] },
  header: { gap: 2 },
  eyebrow: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, letterSpacing: 1.2, color: Colors.primary },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing[3] },
  title: { flex: 1, fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['3xl'], color: Colors.textPrimary },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: Spacing[3], minHeight: 40, borderRadius: Radius.md, backgroundColor: Colors.primary, ...Shadow.sm },
  addBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  pendingReqBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], padding: Spacing[3], backgroundColor: Colors.warningSurface, borderRadius: Radius.md },
  pendingReqText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.warning },
  reviewedReqBanner: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing[3], gap: Spacing[2], borderWidth: 1, borderColor: Colors.border },
  reviewedReqItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewedReqName: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  reqStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  reqStatusApproved: { backgroundColor: Colors.successSurface },
  reqStatusRejected: { backgroundColor: Colors.errorSurface },
  reqStatusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, textTransform: 'capitalize' },
  reqStatusTextApproved: { color: Colors.success },
  reqStatusTextRejected: { color: Colors.error },
  empty: { alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[7], borderWidth: 1, borderColor: Colors.border },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textPrimary, fontSize: Typography.size.lg, textAlign: 'center' },
  emptyText: { fontFamily: Typography.fontFamily.sansRegular, color: Colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  setupCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], gap: Spacing[3], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  setupHeader: { flexDirection: 'row', gap: Spacing[3], alignItems: 'flex-start' },
  setupIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.accentSurface, alignItems: 'center', justifyContent: 'center' },
  setupInfo: { flex: 1, gap: 3 },
  setupName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.md, color: Colors.textPrimary },
  setupDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 20 },
  setupMeta: { flexDirection: 'row', gap: Spacing[4], flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  setupInstructions: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, fontStyle: 'italic', lineHeight: 20 },
  itemsSection: { gap: Spacing[1], borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: Spacing[2] },
  itemsLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  itemName: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  itemQty: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.accentDark },
  setupActions: { flexDirection: 'row', gap: Spacing[4], borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing[3] },
  shareAction: { flexDirection: 'row', gap: 5, alignItems: 'center', backgroundColor: Colors.primarySurface, paddingHorizontal: Spacing[2], paddingVertical: 4, borderRadius: Radius.md },
  shareActionText: { fontFamily: Typography.fontFamily.sansMedium, color: Colors.primary, fontSize: Typography.size.sm },
  action: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  actionText: { fontFamily: Typography.fontFamily.sansMedium, color: Colors.primary, fontSize: Typography.size.sm },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.4)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { width: '100%', maxWidth: 560, maxHeight: '90%', backgroundColor: Colors.white, borderRadius: Radius.xl, overflow: 'hidden' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 22, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sheetTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  form: { padding: 22, gap: 4 },
  label: { fontFamily: Typography.fontFamily.sansMedium, color: Colors.textSecondary, fontSize: Typography.size.sm, marginTop: 12, marginBottom: 4 },
  subLabel: { fontFamily: Typography.fontFamily.sansRegular, color: Colors.textTertiary, fontSize: Typography.size.xs, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 11, fontFamily: Typography.fontFamily.sansRegular, color: Colors.textPrimary, fontSize: Typography.size.base },
  noTypesText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, lineHeight: 20 },
  poojaTypeList: { gap: 8 },
  poojaTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  poojaTypeCheck: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  poojaTypeName: { flex: 1, fontFamily: Typography.fontFamily.sansMedium, color: Colors.textPrimary, fontSize: Typography.size.sm },
  priceInput: { width: 100, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 8, fontFamily: Typography.fontFamily.sansRegular, color: Colors.textPrimary, textAlign: 'right' },
  priceInputDisabled: { backgroundColor: Colors.neutral[100], color: Colors.textDisabled },
  saveDisabled: { opacity: 0.5 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  error: { color: Colors.error, fontFamily: Typography.fontFamily.sansRegular, marginTop: 8, fontSize: Typography.size.sm },
  successText: { color: Colors.success, fontFamily: Typography.fontFamily.sansMedium, marginTop: 8, fontSize: Typography.size.sm },
  footer: { flexDirection: 'row', gap: 12, padding: 18, borderTopWidth: 1, borderTopColor: Colors.border },
  cancel: { flex: 1, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md },
  cancelText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textSecondary },
  save: { flex: 2, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.primary },
  saveText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.white },
  sharePoojaName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary, marginBottom: 8 },
});
