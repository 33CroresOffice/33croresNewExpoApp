import React, { useEffect, useState } from 'react';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Switch, Platform, ActivityIndicator, RefreshControl, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Store, Plus, X, Pencil, ArrowLeft, Phone, MapPin, CreditCard, ExternalLink } from 'lucide-react-native';
import { router } from 'expo-router';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { Vendor } from '@/types/database';

const EMPTY_FORM = {
  business_name: '',
  contact_person: '',
  mobile: '',
  whatsapp: '',
  email: '',
  city: '',
  address: '',
  google_maps_url: '',
  gstin: '',
  bank_account_name: '',
  bank_account_number: '',
  bank_ifsc: '',
  upi_id: '',
  notes: '',
  is_active: true,
};

export default function VendorsScreen() {
  return (
    <ModuleGuard module="procurement">
      <VendorsScreenContent />
    </ModuleGuard>
  );
}

function VendorsScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'active' | 'inactive'>('active');

  const load = async () => {
    try {
      const { data } = await supabase.from('vendors').select('*').order('business_name');
      if (data) setVendors(data);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  usePageVisibility(load);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowModal(true);
  };

  const openEdit = (v: Vendor) => {
    setEditing(v);
    setForm({
      business_name: v.business_name ?? '',
      contact_person: v.contact_person ?? '',
      mobile: v.mobile ?? '',
      whatsapp: v.whatsapp ?? '',
      email: v.email ?? '',
      city: v.city ?? '',
      address: v.address ?? '',
      google_maps_url: v.google_maps_url ?? '',
      gstin: v.gstin ?? '',
      bank_account_name: v.bank_account_name ?? '',
      bank_account_number: v.bank_account_number ?? '',
      bank_ifsc: v.bank_ifsc ?? '',
      upi_id: v.upi_id ?? '',
      notes: v.notes ?? '',
      is_active: v.is_active,
    });
    setError('');
    setShowModal(true);
  };

  const save = async () => {
    if (!form.business_name.trim() && !form.contact_person.trim()) {
      setError('Enter a business name or contact person'); return;
    }
    setSaving(true); setError('');
    const payload = {
      business_name: form.business_name.trim() || null,
      contact_person: form.contact_person.trim() || null,
      mobile: form.mobile.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      email: form.email.trim() || null,
      city: form.city.trim() || null,
      address: form.address.trim() || null,
      google_maps_url: form.google_maps_url.trim() || null,
      gstin: form.gstin.trim() || null,
      bank_account_name: form.bank_account_name.trim() || null,
      bank_account_number: form.bank_account_number.trim() || null,
      bank_ifsc: form.bank_ifsc.trim() || null,
      upi_id: form.upi_id.trim() || null,
      notes: form.notes.trim() || null,
      is_active: form.is_active,
    };
    const { error: err } = editing
      ? await supabase.from('vendors').update(payload).eq('id', editing.id)
      : await supabase.from('vendors').insert(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setShowModal(false);
    load();
  };

  const filtered = vendors.filter(v => tab === 'active' ? v.is_active : !v.is_active);

  const VendorCard = ({ v }: { v: Vendor }) => (
    <TouchableOpacity style={[s.card, isWeb && s.cardWeb]} onPress={() => router.push({ pathname: '/(admin)/vendor-detail' as any, params: { id: v.id } })} activeOpacity={0.8}>
      <View style={s.cardTop}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{(v.business_name ?? v.contact_person ?? '?')[0]?.toUpperCase()}</Text>
        </View>
        <View style={s.cardInfo}>
          <Text style={s.vendorName}>{v.business_name ?? v.contact_person ?? 'Unnamed Vendor'}</Text>
          {v.contact_person && v.business_name ? <Text style={s.contactName}>{v.contact_person}</Text> : null}
          {v.city ? (
            <View style={s.row}>
              <MapPin size={11} color={Colors.textTertiary} strokeWidth={1.8} />
              <Text style={s.cityText}>{v.city}</Text>
            </View>
          ) : null}
        </View>
        <View style={[s.statusDot, { backgroundColor: v.is_active ? Colors.success : Colors.neutral[300] }]} />
      </View>
      <View style={s.cardFooter}>
        {v.mobile ? (
          <View style={s.pill}>
            <Phone size={11} color={Colors.textTertiary} strokeWidth={1.8} />
            <Text style={s.pillText}>{v.mobile}</Text>
          </View>
        ) : null}
        {v.upi_id ? (
          <View style={s.pill}>
            <CreditCard size={11} color={Colors.textTertiary} strokeWidth={1.8} />
            <Text style={s.pillText}>UPI</Text>
          </View>
        ) : null}
        {v.bank_account_number ? (
          <View style={s.pill}>
            <CreditCard size={11} color={Colors.textTertiary} strokeWidth={1.8} />
            <Text style={s.pillText}>Bank</Text>
          </View>
        ) : null}
        {v.google_maps_url ? (
          <TouchableOpacity
            style={[s.pill, s.pillMaps]}
            onPress={e => {
              e.stopPropagation?.();
              if (Platform.OS === 'web') {
                (window as any).open(v.google_maps_url!, '_blank');
              } else {
                Linking.openURL(v.google_maps_url!);
              }
            }}
          >
            <MapPin size={11} color={Colors.primary} strokeWidth={1.8} />
            <Text style={s.pillMapsText}>Maps</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top }]}>
      <View style={[s.header, isWeb && s.headerWeb]}>
        {!isWeb && (
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <ArrowLeft size={22} color={Colors.textPrimary} strokeWidth={1.8} />
          </TouchableOpacity>
        )}
        <View style={s.headerLeft}>
          <View style={s.headerIcon}>
            <Store size={isWeb ? 22 : 18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>Vendors</Text>
            <Text style={s.subtitle}>{vendors.filter(v => v.is_active).length} active</Text>
          </View>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openCreate} activeOpacity={0.8}>
          <Plus size={16} color={Colors.white} strokeWidth={2} />
          <Text style={s.addBtnText}>Add Vendor</Text>
        </TouchableOpacity>
      </View>

      <View style={s.tabs}>
        {(['active', 'inactive'] as const).map(t => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab === t && s.tabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>
              {t === 'active' ? `Active (${vendors.filter(v => v.is_active).length})` : `Inactive (${vendors.filter(v => !v.is_active).length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, isWeb && s.contentWeb]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator color={Colors.primary} /></View>
        ) : filtered.length === 0 ? (
          <View style={s.emptyState}>
            <Store size={40} color={Colors.textDisabled} strokeWidth={1.2} />
            <Text style={s.emptyTitle}>No vendors</Text>
            <Text style={s.emptySub}>Add your flower suppliers to start creating procurement orders.</Text>
          </View>
        ) : (
          <View style={[s.grid, isWeb && s.gridWeb]}>
            {filtered.map(v => <VendorCard key={v.id} v={v} />)}
          </View>
        )}
      </ScrollView>

      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editing ? 'Edit Vendor' : 'New Vendor'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.sectionHead}>Contact</Text>
              <Field label="Business Name" value={form.business_name} onChange={v => setForm(p => ({ ...p, business_name: v }))} placeholder="e.g. Krishna Flowers" />
              <Field label="Contact Person" value={form.contact_person} onChange={v => setForm(p => ({ ...p, contact_person: v }))} placeholder="Owner's name" />
              <Field label="Mobile" value={form.mobile} onChange={v => setForm(p => ({ ...p, mobile: v }))} placeholder="+91 9876543210" keyboardType="phone-pad" />
              <Field label="WhatsApp" value={form.whatsapp} onChange={v => setForm(p => ({ ...p, whatsapp: v }))} placeholder="+91 9876543210" keyboardType="phone-pad" />
              <Field label="Email" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} placeholder="vendor@email.com" keyboardType="email-address" />
              <Field label="City" value={form.city} onChange={v => setForm(p => ({ ...p, city: v }))} placeholder="Mumbai" />
              <Field label="Address" value={form.address} onChange={v => setForm(p => ({ ...p, address: v }))} placeholder="Full address" multiline />
              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>Google Maps Location</Text>
                <View style={s.mapsInputRow}>
                  <MapPin size={15} color={Colors.textTertiary} strokeWidth={1.8} style={{ marginTop: 1 }} />
                  <TextInput
                    style={[s.input, s.mapsInput]}
                    value={form.google_maps_url}
                    onChangeText={v => setForm(p => ({ ...p, google_maps_url: v }))}
                    placeholder="https://maps.google.com/..."
                    placeholderTextColor={Colors.textDisabled}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                </View>
                {form.google_maps_url.trim().length > 0 && (
                  <TouchableOpacity
                    style={s.mapsPreview}
                    onPress={() => {
                      if (Platform.OS === 'web') {
                        (window as any).open(form.google_maps_url, '_blank');
                      } else {
                        Linking.openURL(form.google_maps_url);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <ExternalLink size={12} color={Colors.primary} strokeWidth={2} />
                    <Text style={s.mapsPreviewText}>Open in Google Maps</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={s.sectionHead}>Business</Text>
              <Field label="GSTIN" value={form.gstin} onChange={v => setForm(p => ({ ...p, gstin: v }))} placeholder="27XXXXX" autoCapitalize="characters" />
              <Text style={s.sectionHead}>Payment Details</Text>
              <Field label="UPI ID" value={form.upi_id} onChange={v => setForm(p => ({ ...p, upi_id: v }))} placeholder="vendor@upi" />
              <Field label="Bank Account Name" value={form.bank_account_name} onChange={v => setForm(p => ({ ...p, bank_account_name: v }))} placeholder="Name as per bank" />
              <Field label="Bank Account Number" value={form.bank_account_number} onChange={v => setForm(p => ({ ...p, bank_account_number: v }))} placeholder="000123456789" keyboardType="numeric" />
              <Field label="IFSC Code" value={form.bank_ifsc} onChange={v => setForm(p => ({ ...p, bank_ifsc: v }))} placeholder="SBIN0001234" autoCapitalize="characters" />
              <Text style={s.sectionHead}>Notes</Text>
              <Field label="Internal Notes" value={form.notes} onChange={v => setForm(p => ({ ...p, notes: v }))} placeholder="Any notes about this vendor..." multiline />
              <View style={s.switchRow}>
                <Text style={s.fieldLabel}>Active</Text>
                <Switch
                  value={form.is_active}
                  onValueChange={v => setForm(p => ({ ...p, is_active: v }))}
                  trackColor={{ true: Colors.primary, false: Colors.neutral[200] }}
                  thumbColor={Colors.white}
                />
              </View>
              {error ? <Text style={s.errorText}>{error}</Text> : null}
            </ScrollView>
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveBtnText}>Save Vendor</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, multiline, keyboardType, autoCapitalize }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; keyboardType?: any; autoCapitalize?: any }) {
  return (
    <View style={s.fieldGroup}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.input, multiline && s.textarea]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.textDisabled}
        multiline={multiline}
        numberOfLines={multiline ? 2 : 1}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? 'sentences'}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4], backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing[3],
  },
  headerWeb: { paddingHorizontal: Spacing[8], paddingVertical: Spacing[5] },
  backBtn: { padding: Spacing[1] },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  headerIcon: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  titleWeb: { fontSize: Typography.size['2xl'] },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.primary, paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], borderRadius: Radius.full },
  addBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  tabs: { flexDirection: 'row', paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], gap: Spacing[2], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabBtn: { paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  tabBtnActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  tabText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  scroll: { flex: 1 },
  content: { padding: Spacing[5] },
  contentWeb: { padding: Spacing[8], maxWidth: 1100, alignSelf: 'center', width: '100%' },
  center: { paddingTop: 80, alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  emptySub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 280 },
  grid: { gap: Spacing[3] },
  gridWeb: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[4] },
  card: {
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4],
    borderWidth: 1, borderColor: Colors.border, gap: Spacing[3], ...Shadow.sm,
  },
  cardWeb: { width: '31%', minWidth: 260 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3] },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.primary },
  cardInfo: { flex: 1 },
  vendorName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  contactName: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  cityText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  cardFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.neutral[100], paddingVertical: 4, paddingHorizontal: Spacing[2], borderRadius: Radius.full },
  pillText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textSecondary },
  pillMaps: { backgroundColor: Colors.primarySurface },
  pillMapsText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11, color: Colors.primary },
  mapsInputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  mapsInput: { flex: 1, borderColor: Colors.border },
  mapsPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6,
    alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 10,
    borderRadius: Radius.full, backgroundColor: Colors.primarySurface,
    borderWidth: 1, borderColor: Colors.primary + '40',
  },
  mapsPreviewText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11, color: Colors.primary },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: Spacing[5] },
  modal: { width: '100%', maxHeight: '92%', backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[5], gap: Spacing[3] },
  modalWeb: { maxWidth: 580 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  sectionHead: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: Spacing[3], marginBottom: Spacing[1] },
  fieldGroup: { gap: Spacing[1], marginBottom: Spacing[3] },
  fieldLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary, backgroundColor: Colors.neutral[50] },
  textarea: { minHeight: 64, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing[2], marginBottom: Spacing[3] },
  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error, marginBottom: Spacing[2] },
  modalFooter: { flexDirection: 'row', gap: Spacing[3], paddingTop: Spacing[2] },
  cancelBtn: { flex: 1, paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  saveBtn: { flex: 2, paddingVertical: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  saveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
});
