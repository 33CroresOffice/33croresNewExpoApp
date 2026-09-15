import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Switch, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Pencil, Tag, X, Check, Trash2, FolderOpen } from 'lucide-react-native';
import ModuleGuard from '@/components/admin/ModuleGuard';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { PoojaItemCategory } from '@/types/database';

const EMPTY = { name: '', description: '' };

export default function PoojaItemCategoriesScreen() {
  return <ModuleGuard module="catalog"><PoojaItemCategoriesContent /></ModuleGuard>;
}

function PoojaItemCategoriesContent() {
  const insets = useSafeAreaInsets();
  const [categories, setCategories] = useState<PoojaItemCategory[]>([]);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<PoojaItemCategory | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PoojaItemCategory | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const [catRes, itemsRes] = await Promise.all([
      supabase.from('pooja_item_categories').select('*').order('sort_order').order('name'),
      supabase.from('pooja_items').select('category_id'),
    ]);
    const cats = (catRes.data ?? []) as PoojaItemCategory[];
    setCategories(cats);
    const counts: Record<string, number> = {};
    for (const item of (itemsRes.data ?? [])) {
      if (item.category_id) counts[item.category_id] = (counts[item.category_id] ?? 0) + 1;
    }
    setItemCounts(counts);
    setLoading(false);
    setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openCreate = () => { setEditing(null); setForm(EMPTY); setError(''); setModal(true); };
  const openEdit = (cat: PoojaItemCategory) => { setEditing(cat); setForm({ name: cat.name, description: cat.description }); setError(''); setModal(true); };

  const save = async () => {
    if (!form.name.trim()) { setError('Category name is required'); return; }
    setSaving(true); setError('');
    const payload = { name: form.name.trim(), description: form.description.trim() };
    const result = editing
      ? await supabase.from('pooja_item_categories').update(payload).eq('id', editing.id)
      : await supabase.from('pooja_item_categories').insert({ ...payload, sort_order: categories.length });
    if (result.error) { setError(result.error.message); setSaving(false); return; }
    setSaving(false); setModal(false); load();
  };

  const toggle = async (cat: PoojaItemCategory) => {
    await supabase.from('pooja_item_categories').update({ is_active: !cat.is_active }).eq('id', cat.id);
    setCategories(current => current.map(c => c.id === cat.id ? { ...c, is_active: !c.is_active } : c));
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await supabase.from('pooja_items').update({ category_id: null }).eq('category_id', deleteTarget.id);
    await supabase.from('pooja_item_categories').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    load();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Pooja Item Categories</Text>
          <Text style={styles.subtitle}>Group pooja items into categories for easier management</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={openCreate}>
          <Plus size={17} color={Colors.white} />
          <Text style={styles.addText}>Add category</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <View style={styles.info}>
          <Tag size={19} color={Colors.accent} />
          <Text style={styles.infoText}>Categories help you organize pooja items. When adding or editing a pooja item, admins can pick from these categories.</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 50 }} />
        ) : categories.length === 0 ? (
          <View style={styles.empty}>
            <FolderOpen size={42} color={Colors.textDisabled} />
            <Text style={styles.emptyTitle}>No categories yet</Text>
            <Text style={styles.emptyText}>Add the first pooja item category.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {categories.map(cat => (
              <View key={cat.id} style={[styles.itemCard, !cat.is_active && styles.inactive]}>
                <View style={styles.itemIcon}>
                  <Tag size={18} color={Colors.accent} />
                </View>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{cat.name}</Text>
                  <Text style={styles.itemDescription}>{cat.description || 'No description'}</Text>
                  <View style={styles.badgeRow}>
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>{itemCounts[cat.id] ?? 0} items</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity style={styles.edit} onPress={() => openEdit(cat)}>
                  <Pencil size={15} color={Colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => setDeleteTarget(cat)}>
                  <Trash2 size={15} color={Colors.error} />
                </TouchableOpacity>
                <Switch
                  value={cat.is_active}
                  onValueChange={() => toggle(cat)}
                  trackColor={{ false: Colors.neutral[300], true: Colors.primaryLight }}
                  thumbColor={cat.is_active ? Colors.primary : Colors.neutral[500]}
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editing ? 'Edit category' : 'Add category'}</Text>
              <TouchableOpacity onPress={() => setModal(false)}>
                <X size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.form}>
              <Text style={styles.label}>Name *</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={name => setForm({ ...form, name })}
                placeholder="e.g. Incense & Fragrance"
                placeholderTextColor={Colors.textDisabled}
              />
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={form.description}
                onChangeText={description => setForm({ ...form, description })}
                multiline
                placeholder="What items belong in this category?"
                placeholderTextColor={Colors.textDisabled}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </ScrollView>
            <View style={styles.footer}>
              <TouchableOpacity style={styles.cancel} onPress={() => setModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.save} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.white} /> : <><Check size={16} color={Colors.white} /><Text style={styles.saveText}>{editing ? 'Save changes' : 'Add category'}</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={styles.overlay}>
          <View style={styles.deleteSheet}>
            <View style={styles.deleteIconWrap}>
              <Trash2 size={28} color={Colors.error} />
            </View>
            <Text style={styles.deleteTitle}>Delete category?</Text>
            <Text style={styles.deleteMessage}>
              "{deleteTarget?.name}" will be removed. Pooja items in this category will be unassigned but not deleted.
            </Text>
            <View style={styles.footer}>
              <TouchableOpacity style={styles.cancel} onPress={() => setDeleteTarget(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteConfirm} onPress={confirmDelete} disabled={deleting}>
                {deleting ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.deleteConfirmText}>Delete</Text>}
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
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[6], paddingVertical: Spacing[5],
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: 26, color: Colors.textPrimary },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 3 },
  addButton: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.md,
  },
  addText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.white, fontSize: Typography.size.sm },
  content: { padding: Spacing[6], gap: Spacing[4], maxWidth: 1000, width: '100%', alignSelf: 'center' },
  info: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3],
    padding: Spacing[4], backgroundColor: Colors.accentSurface, borderRadius: Radius.md,
  },
  infoText: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.accentDark, lineHeight: 20 },
  list: { gap: Spacing[3] },
  itemCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    padding: Spacing[4], backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  inactive: { opacity: 0.6 },
  itemIcon: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.accentSurface, alignItems: 'center', justifyContent: 'center',
  },
  itemInfo: { flex: 1, gap: 3 },
  itemName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  itemDescription: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  countBadge: {
    backgroundColor: Colors.primarySurface, borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  countBadgeText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.primary },
  edit: { padding: 8 },
  deleteBtn: { padding: 8 },
  empty: { alignItems: 'center', paddingVertical: 80, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  emptyText: { fontFamily: Typography.fontFamily.sansRegular, color: Colors.textTertiary },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.4)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { width: '100%', maxWidth: 560, maxHeight: '90%', backgroundColor: Colors.white, borderRadius: Radius.xl, overflow: 'hidden' },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 22, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  sheetTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  form: { padding: 22, gap: 4 },
  label: { fontFamily: Typography.fontFamily.sansMedium, color: Colors.textSecondary, fontSize: Typography.size.sm, marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 11,
    fontFamily: Typography.fontFamily.sansRegular, color: Colors.textPrimary, fontSize: Typography.size.base,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  error: { color: Colors.error, fontFamily: Typography.fontFamily.sansRegular, marginTop: 8 },
  footer: { flexDirection: 'row', gap: 12, padding: 18, borderTopWidth: 1, borderTopColor: Colors.border },
  cancel: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
  },
  cancelText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textSecondary },
  save: {
    flex: 2, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.primary,
  },
  saveText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.white },
  deleteSheet: {
    width: '100%', maxWidth: 440, backgroundColor: Colors.white,
    borderRadius: Radius.xl, overflow: 'hidden', padding: 28, alignItems: 'center',
  },
  deleteIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.error + '15', alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  deleteTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary, marginBottom: 8 },
  deleteMessage: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  deleteConfirm: {
    flex: 2, paddingVertical: 12, alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.md, backgroundColor: Colors.error,
  },
  deleteConfirmText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.white },
});
