import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Switch, ActivityIndicator, RefreshControl, Platform } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Pencil, Flame, X, Check, ChevronDown, Tag } from 'lucide-react-native';
import ModuleGuard from '@/components/admin/ModuleGuard';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { PoojaItem, PoojaItemCategory } from '@/types/database';

const EMPTY = { name: '', description: '', unit_type: 'pieces', category_id: '' };
const UNITS = ['pieces', 'packet', 'bunch', 'box', 'ml', 'grams', 'kg', 'dozen'];

export default function PoojaItemsScreen() {
  return <ModuleGuard module="catalog"><PoojaItemsContent /></ModuleGuard>;
}

function PoojaItemsContent() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<PoojaItem[]>([]);
  const [categories, setCategories] = useState<PoojaItemCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<PoojaItem | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [categoryDropdown, setCategoryDropdown] = useState(false);

  const load = useCallback(async () => {
    const [itemsRes, catRes] = await Promise.all([
      supabase.from('pooja_items').select('*, category:pooja_item_categories(*)').order('sort_order').order('name'),
      supabase.from('pooja_item_categories').select('*').order('sort_order').order('name'),
    ]);
    setItems((itemsRes.data ?? []) as PoojaItem[]);
    setCategories((catRes.data ?? []) as PoojaItemCategory[]);
    setLoading(false);
    setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openCreate = () => { setEditing(null); setForm(EMPTY); setError(''); setModal(true); };
  const openEdit = (item: PoojaItem) => {
    setEditing(item);
    setForm({ name: item.name, description: item.description, unit_type: item.unit_type, category_id: item.category_id ?? '' });
    setError('');
    setModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) { setError('Item name is required'); return; }
    setSaving(true); setError('');
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      unit_type: form.unit_type,
      category_id: form.category_id || null,
    };
    const result = editing
      ? await supabase.from('pooja_items').update(payload).eq('id', editing.id)
      : await supabase.from('pooja_items').insert({ ...payload, sort_order: items.length });
    if (result.error) { setError(result.error.message); setSaving(false); return; }
    setSaving(false); setModal(false); load();
  };

  const toggle = async (item: PoojaItem) => {
    await supabase.from('pooja_items').update({ is_active: !item.is_active }).eq('id', item.id);
    setItems(current => current.map(value => value.id === item.id ? { ...value, is_active: !value.is_active } : value));
  };

  const selectedCategory = categories.find(c => c.id === form.category_id);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Pooja Items</Text>
          <Text style={styles.subtitle}>Master catalogue for package building</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={openCreate}>
          <Plus size={17} color={Colors.white} />
          <Text style={styles.addText}>Add item</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <View style={styles.info}>
          <Flame size={19} color={Colors.accent} />
          <Text style={styles.infoText}>Keep one shared list of essentials. Admins can select these items when creating a pooja package.</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 50 }} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Flame size={42} color={Colors.textDisabled} />
            <Text style={styles.emptyTitle}>No items yet</Text>
            <Text style={styles.emptyText}>Add the first reusable pooja item.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {items.map(item => (
              <View key={item.id} style={[styles.itemCard, !item.is_active && styles.inactive]}>
                <View style={styles.itemIcon}>
                  <Flame size={18} color={Colors.accent} />
                </View>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemDescription}>{item.description || 'No description'}</Text>
                  <View style={styles.badgeRow}>
                    <Text style={styles.unit}>{item.unit_type}</Text>
                    {item.category && (
                      <View style={styles.categoryBadge}>
                        <Tag size={9} color={Colors.primary} strokeWidth={2} />
                        <Text style={styles.categoryBadgeText}>{item.category.name}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <TouchableOpacity style={styles.edit} onPress={() => openEdit(item)}>
                  <Pencil size={15} color={Colors.textSecondary} />
                </TouchableOpacity>
                <Switch
                  value={item.is_active}
                  onValueChange={() => toggle(item)}
                  trackColor={{ false: Colors.neutral[300], true: Colors.primaryLight }}
                  thumbColor={item.is_active ? Colors.primary : Colors.neutral[500]}
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => { setModal(false); setCategoryDropdown(false); }}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editing ? 'Edit pooja item' : 'Add pooja item'}</Text>
              <TouchableOpacity onPress={() => { setModal(false); setCategoryDropdown(false); }}>
                <X size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.form}>
              <Text style={styles.label}>Name *</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={name => setForm({ ...form, name })}
                placeholder="e.g. Camphor"
                placeholderTextColor={Colors.textDisabled}
              />
              {/* Category Dropdown */}
              <Text style={styles.label}>Category</Text>
              <TouchableOpacity
                style={styles.dropdown}
                onPress={() => setCategoryDropdown(prev => !prev)}
              >
                <View style={styles.dropdownInner}>
                  {selectedCategory ? (
                    <View style={styles.dropdownSelected}>
                      <Tag size={13} color={Colors.primary} strokeWidth={2} />
                      <Text style={styles.dropdownSelectedText}>{selectedCategory.name}</Text>
                    </View>
                  ) : (
                    <Text style={styles.dropdownPlaceholder}>Select a category (optional)</Text>
                  )}
                  <ChevronDown size={16} color={Colors.textTertiary} style={{ transform: [{ rotate: categoryDropdown ? '180deg' : '0deg' }] }} />
                </View>
              </TouchableOpacity>
              {categoryDropdown && (
                <View style={styles.dropdownList}>
                  <TouchableOpacity
                    style={styles.dropdownItem}
                    onPress={() => { setForm({ ...form, category_id: '' }); setCategoryDropdown(false); }}
                  >
                    <Text style={styles.dropdownItemTextNone}>No category</Text>
                  </TouchableOpacity>
                  {categories.length === 0 ? (
                    <TouchableOpacity
                      style={styles.dropdownItem}
                      onPress={() => { setCategoryDropdown(false); router.push('/(admin)/pooja-item-categories' as never); }}
                    >
                      <Text style={styles.dropdownItemTextNone}>No categories yet — tap to create</Text>
                    </TouchableOpacity>
                  ) : (
                    categories.map(cat => (
                      <TouchableOpacity
                        key={cat.id}
                        style={[styles.dropdownItem, form.category_id === cat.id && styles.dropdownItemActive]}
                        onPress={() => { setForm({ ...form, category_id: cat.id }); setCategoryDropdown(false); }}
                      >
                        <Text style={[styles.dropdownItemText, form.category_id === cat.id && styles.dropdownItemTextActive]}>{cat.name}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}

              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={form.description}
                onChangeText={description => setForm({ ...form, description })}
                multiline
                placeholder="What is included?"
                placeholderTextColor={Colors.textDisabled}
              />

              <Text style={styles.label}>Unit</Text>
              <View style={styles.units}>
                {UNITS.map(unit => (
                  <TouchableOpacity
                    key={unit}
                    style={[styles.unitChip, form.unit_type === unit && styles.unitChipActive]}
                    onPress={() => setForm({ ...form, unit_type: unit })}
                  >
                    <Text style={[styles.unitChipText, form.unit_type === unit && styles.unitChipTextActive]}>{unit}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </ScrollView>
            <View style={styles.footer}>
              <TouchableOpacity style={styles.cancel} onPress={() => { setModal(false); setCategoryDropdown(false); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.save} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.white} /> : <><Check size={16} color={Colors.white} /><Text style={styles.saveText}>{editing ? 'Save changes' : 'Add item'}</Text></>}
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
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 2, alignItems: 'center' },
  unit: {
    alignSelf: 'flex-start', color: Colors.accentDark, backgroundColor: Colors.accentSurface,
    borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3,
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs,
  },
  categoryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.primarySurface, borderRadius: Radius.full,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  categoryBadgeText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.primary },
  edit: { padding: 8 },
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
  dropdown: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 11,
  },
  dropdownInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropdownSelected: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dropdownSelectedText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary },
  dropdownPlaceholder: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textDisabled },
  dropdownList: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    marginTop: 4, maxHeight: 200, overflow: 'auto',
    backgroundColor: Colors.white,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0,0,0,.12)' as any } : {}),
  },
  dropdownItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  dropdownItemActive: { backgroundColor: Colors.primarySurface },
  dropdownItemText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  dropdownItemTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  dropdownItemTextNone: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  units: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unitChip: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 8 },
  unitChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  unitChipText: { fontFamily: Typography.fontFamily.sansMedium, color: Colors.textSecondary, fontSize: Typography.size.sm },
  unitChipTextActive: { color: Colors.white },
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
});
