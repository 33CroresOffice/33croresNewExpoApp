import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Platform, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyRound, Plus, X, Pencil, ArrowLeft, Search, Trash2, ShieldAlert } from 'lucide-react-native';
import { router } from 'expo-router';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import ModuleGuard from '@/components/admin/ModuleGuard';

interface SecretKey {
  id: string;
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
}

const EMPTY_FORM = {
  key: '',
  value: '',
};

export default function SecretKeysScreen() {
  return (
    <ModuleGuard module="secret_keys">
      <SecretKeysContent />
    </ModuleGuard>
  );
}

function SecretKeysContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [items, setItems] = useState<SecretKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SecretKey | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SecretKey | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('secret_keys')
        .select('*')
        .order('key');
      if (data) setItems(data as SecretKey[]);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  usePageVisibility(load);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowModal(true);
  };

  const openEdit = (item: SecretKey) => {
    setEditing(item);
    setForm({
      key: item.key,
      value: item.value,
    });
    setError('');
    setShowModal(true);
  };

  const save = async () => {
    if (!form.key.trim()) { setError('Key is required'); return; }
    if (!form.value.trim()) { setError('Value is required'); return; }

    setSaving(true);
    setError('');

    const payload = {
      key: form.key.trim(),
      value: form.value.trim(),
    };

    const { error: err } = editing
      ? await supabase.from('secret_keys').update(payload).eq('id', editing.id)
      : await supabase.from('secret_keys').insert(payload);

    setSaving(false);
    if (err) { setError('Could not save the key. Please try again.'); return; }
    setShowModal(false);
    load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error: err } = await supabase.from('secret_keys').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (err) { setError('Could not delete the key. Please try again.'); return; }
    setDeleteTarget(null);
    load();
  };

  const filtered = items.filter(item => {
    if (!search) return true;
    return item.key.toLowerCase().includes(search.toLowerCase());
  });

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
            <KeyRound size={isWeb ? 20 : 18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>Secret Keys (Official Use Only)</Text>
            <Text style={s.subtitle}>{items.length} {items.length === 1 ? 'key' : 'keys'} configured · Authorized personnel only</Text>
          </View>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openCreate} activeOpacity={0.85}>
          <Plus size={15} color={Colors.white} strokeWidth={2.5} />
          <Text style={s.addBtnText}>Add Secret Key</Text>
        </TouchableOpacity>
      </View>

      <View style={s.warningBanner}>
        <ShieldAlert size={16} color={Colors.warning} strokeWidth={2} />
        <Text style={s.warningText}>Official Use Only — Authorized personnel only. Do not share these keys.</Text>
      </View>

      {isWeb && (
        <View style={s.toolbar}>
          <View style={s.searchBox}>
            <Search size={16} color={Colors.textTertiary} strokeWidth={1.8} />
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search by key name..."
              placeholderTextColor={Colors.textDisabled}
            />
          </View>
        </View>
      )}

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, isWeb && s.contentWeb]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
        ) : filtered.length === 0 ? (
          <View style={s.emptyState}>
            <View style={s.emptyIcon}>
              <KeyRound size={28} color={Colors.textDisabled} strokeWidth={1.4} />
            </View>
            <Text style={s.emptyTitle}>
              {search ? 'No keys found' : 'No secret keys yet'}
            </Text>
            <Text style={s.emptySub}>
              {search ? 'Try a different search term.' : 'Add API keys and secrets for third-party services like MSG91, Razorpay, and OTP.'}
            </Text>
            {!search && (
              <TouchableOpacity style={s.emptyBtn} onPress={openCreate} activeOpacity={0.85}>
                <Plus size={14} color={Colors.white} strokeWidth={2.5} />
                <Text style={s.emptyBtnText}>Add First Secret Key</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : isWeb ? (
          <View style={s.tableCard}>
            <View style={s.tableHead}>
              <Text style={[s.thCell, { width: 60 }]}>SL</Text>
              <Text style={[s.thCell, { flex: 2 }]}>Key</Text>
              <Text style={[s.thCell, { flex: 3 }]}>Value</Text>
              <Text style={[s.thCell, { width: 100 }]}>Actions</Text>
            </View>
            {filtered.map((item, i) => (
              <View key={item.id} style={[s.tableRow, i % 2 === 1 && s.tableRowAlt]}>
                <Text style={[s.tdSl, { width: 60 }]}>{i + 1}</Text>
                <View style={[{ flex: 2 }, s.nameCell]}>
                  <View style={[s.rowIcon, { backgroundColor: Colors.primarySurface }]}>
                    <KeyRound size={15} color={Colors.primary} strokeWidth={1.8} />
                  </View>
                  <Text style={s.tdPrimary} numberOfLines={1}>{item.key}</Text>
                </View>
                <View style={{ flex: 3 }}>
                  <Text style={s.tdValue} numberOfLines={1}>{'•'.repeat(Math.min(item.value.length, 12))}</Text>
                </View>
                <View style={{ width: 100, flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity onPress={() => openEdit(item)} style={s.iconBtn}>
                    <Pencil size={14} color={Colors.textSecondary} strokeWidth={1.8} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setDeleteTarget(item)} style={s.iconBtnDanger}>
                    <Trash2 size={14} color={Colors.error} strokeWidth={1.8} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={s.mobileList}>
            {filtered.map((item, i) => (
              <View key={item.id} style={s.card}>
                <View style={s.cardTop}>
                  <View style={s.cardLeft}>
                    <View style={s.slBadge}>
                      <Text style={s.slText}>{i + 1}</Text>
                    </View>
                    <View style={s.cardInfo}>
                      <Text style={s.cardKey}>{item.key}</Text>
                      <Text style={s.cardValue} numberOfLines={2}>{'•'.repeat(Math.min(item.value.length, 12))}</Text>
                    </View>
                  </View>
                  <View style={s.cardActions}>
                    <TouchableOpacity onPress={() => openEdit(item)} style={s.editIconBtn}>
                      <Pencil size={15} color={Colors.textSecondary} strokeWidth={1.8} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setDeleteTarget(item)} style={s.deleteIconBtn}>
                      <Trash2 size={15} color={Colors.error} strokeWidth={1.8} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <View style={s.modalTitleRow}>
                <View style={s.modalIcon}>
                  <KeyRound size={16} color={Colors.primary} strokeWidth={1.8} />
                </View>
                <Text style={s.modalTitle}>{editing ? 'Edit Secret Key' : 'Add Secret Key'}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowModal(false)} style={s.closeBtn}>
                <X size={16} color={Colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={s.modalScroll}>
              <View style={s.formGroup}>
                <Text style={s.label}>Key *</Text>
                <TextInput
                  style={s.input}
                  value={form.key}
                  onChangeText={v => setForm(p => ({ ...p, key: v }))}
                  placeholder="e.g. MSG91_API_KEY"
                  placeholderTextColor={Colors.textDisabled}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={s.hint}>Use uppercase with underscores. Must be unique.</Text>
              </View>

              <View style={s.formGroup}>
                <Text style={s.label}>Value *</Text>
                <TextInput
                  style={[s.input, s.textArea]}
                  value={form.value}
                  onChangeText={v => setForm(p => ({ ...p, value: v }))}
                  placeholder="Enter the secret value"
                  placeholderTextColor={Colors.textDisabled}
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                />
              </View>

              {error ? <Text style={s.errorText}>{error}</Text> : null}
            </ScrollView>

            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving} activeOpacity={0.85}>
                {saving ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <>
                    <KeyRound size={14} color={Colors.white} strokeWidth={2} />
                    <Text style={s.saveBtnText}>{editing ? 'Save Changes' : 'Add Key'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb, { maxWidth: 400 }]}>
            <View style={s.modalHeader}>
              <View style={s.modalTitleRow}>
                <View style={[s.modalIcon, { backgroundColor: Colors.errorSurface }]}>
                  <Trash2 size={16} color={Colors.error} strokeWidth={1.8} />
                </View>
                <Text style={s.modalTitle}>Delete Secret Key</Text>
              </View>
              <TouchableOpacity onPress={() => setDeleteTarget(null)} style={s.closeBtn}>
                <X size={16} color={Colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <Text style={s.deleteMsg}>
              Are you sure you want to delete{'\n'}
              <Text style={s.deleteName}>{deleteTarget?.key}</Text>?{'\n\n'}
              Services using this key will fall back to server defaults.
            </Text>
            {error ? <Text style={s.errorText}>{error}</Text> : null}
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setDeleteTarget(null)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.deleteConfirmBtn} onPress={confirmDelete} disabled={deleting} activeOpacity={0.85}>
                {deleting ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <>
                    <Trash2 size={14} color={Colors.white} strokeWidth={2} />
                    <Text style={s.saveBtnText}>Delete</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.neutral[50] },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[5], paddingVertical: Spacing[4],
    backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: Spacing[3],
  },
  headerWeb: { paddingHorizontal: Spacing[8], paddingVertical: Spacing[5] },
  backBtn: { padding: Spacing[1] },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  headerIcon: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  titleWeb: { fontSize: Typography.size['2xl'] },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    backgroundColor: Colors.primary,
    paddingVertical: 10, paddingHorizontal: Spacing[4],
    borderRadius: Radius.md, ...Shadow.sm,
  },
  addBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },

  toolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[8], paddingVertical: Spacing[3],
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: Spacing[3], paddingVertical: 8,
    backgroundColor: Colors.neutral[50], width: 320,
  },
  searchInput: {
    flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: Colors.textPrimary, padding: 0,
  },

  scroll: { flex: 1 },
  warningBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    paddingHorizontal: Spacing[5], paddingVertical: Spacing[3],
    backgroundColor: Colors.warningSurface,
    borderBottomWidth: 1, borderBottomColor: Colors.warning,
  },
  warningText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm,
    color: Colors.warning, flex: 1,
  },
  content: { padding: Spacing[5], gap: Spacing[3] },
  contentWeb: { padding: Spacing[8], maxWidth: 1200, alignSelf: 'center', width: '100%' },

  center: { paddingTop: 80, alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: Spacing[4] },
  emptyIcon: {
    width: 64, height: 64, borderRadius: Radius.xl,
    backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  emptySub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 320 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, paddingVertical: Spacing[3], paddingHorizontal: Spacing[5],
    borderRadius: Radius.md, marginTop: Spacing[2], ...Shadow.sm,
  },
  emptyBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },

  tableCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  tableHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[5], paddingVertical: Spacing[3],
    backgroundColor: Colors.neutral[50], borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  thCell: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: 11,
    color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6,
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[5], paddingVertical: Spacing[4],
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  tdSl: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary },
  nameCell: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  rowIcon: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  tdPrimary: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary, flexShrink: 1 },
  tdValue: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, flexShrink: 1 },

  iconBtn: {
    width: 30, height: 30, borderRadius: Radius.sm,
    backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center',
  },
  iconBtnDanger: {
    width: 30, height: 30, borderRadius: Radius.sm,
    backgroundColor: Colors.errorSurface, alignItems: 'center', justifyContent: 'center',
  },

  mobileList: { gap: Spacing[3] },
  card: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: Spacing[4], borderWidth: 1, borderColor: Colors.border,
    gap: Spacing[2], ...Shadow.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  slBadge: {
    width: 32, height: 32, borderRadius: Radius.sm,
    backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center',
  },
  slText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 12, color: Colors.textTertiary },
  cardInfo: { flex: 1 },
  cardKey: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  cardValue: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 4 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  editIconBtn: {
    width: 32, height: 32, borderRadius: Radius.sm,
    backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center',
  },
  deleteIconBtn: {
    width: 32, height: 32, borderRadius: Radius.sm,
    backgroundColor: Colors.errorSurface, alignItems: 'center', justifyContent: 'center',
  },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: Spacing[5] },
  modal: {
    width: '100%', maxHeight: '92%',
    backgroundColor: Colors.white, borderRadius: Radius.xl,
    padding: Spacing[5], gap: Spacing[4],
  },
  modalWeb: { maxWidth: 540 },
  modalScroll: { maxHeight: 400 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  modalIcon: {
    width: 32, height: 32, borderRadius: Radius.sm,
    backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  closeBtn: {
    width: 32, height: 32, borderRadius: Radius.sm,
    backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center',
  },

  formGroup: { gap: Spacing[2], marginBottom: Spacing[4] },
  label: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingVertical: Spacing[3], paddingHorizontal: Spacing[4],
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base,
    color: Colors.textPrimary, backgroundColor: Colors.neutral[50],
  },
  textArea: {
    minHeight: 80, textAlignVertical: 'top',
  },
  hint: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary, marginTop: 4 },

  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error, marginBottom: Spacing[2] },

  deleteMsg: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textSecondary, lineHeight: Typography.size.base * 1.6, marginBottom: Spacing[2] },
  deleteName: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textPrimary },

  modalFooter: { flexDirection: 'row', gap: Spacing[3], paddingTop: Spacing[2] },
  cancelBtn: {
    flex: 1, paddingVertical: Spacing[3], borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  cancelBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  saveBtn: {
    flex: 2, paddingVertical: Spacing[3], borderRadius: Radius.md,
    backgroundColor: Colors.primary, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    ...Shadow.sm,
  },
  deleteConfirmBtn: {
    flex: 2, paddingVertical: Spacing[3], borderRadius: Radius.md,
    backgroundColor: Colors.error, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    ...Shadow.sm,
  },
  saveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
});
