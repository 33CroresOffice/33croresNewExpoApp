import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Switch, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Pencil, Flame, X, Check, ChevronRight } from 'lucide-react-native';
import ModuleGuard from '@/components/admin/ModuleGuard';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { PoojaType } from '@/types/database';

const EMPTY = { name: '', description: '' };

export default function PoojaTypesScreen() {
  return <ModuleGuard module="catalog"><PoojaTypesContent /></ModuleGuard>;
}

function PoojaTypesContent() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<PoojaType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<PoojaType | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('pooja_types').select('*').order('sort_order').order('name');
    setItems((data ?? []) as PoojaType[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openCreate = () => { setEditing(null); setForm(EMPTY); setError(''); setModal(true); };
  const openEdit = (item: PoojaType) => { setEditing(item); setForm({ name: item.name, description: item.description }); setError(''); setModal(true); };

  const save = async () => {
    if (!form.name.trim()) { setError('Pooja name is required'); return; }
    setSaving(true); setError('');
    const payload = { name: form.name.trim(), description: form.description.trim() };
    const result = editing
      ? await supabase.from('pooja_types').update(payload).eq('id', editing.id)
      : await supabase.from('pooja_types').insert({ ...payload, sort_order: items.length });
    if (result.error) { setError('Could not save this pooja type.'); setSaving(false); return; }
    setSaving(false); setModal(false); load();
  };

  const toggle = async (item: PoojaType) => {
    await supabase.from('pooja_types').update({ is_active: !item.is_active }).eq('id', item.id);
    setItems(current => current.map(value => value.id === item.id ? { ...value, is_active: !value.is_active } : value));
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Pooja Types</Text>
          <Text style={styles.subtitle}>Catalogue of poojas and skills for Pandits</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={openCreate}>
          <Plus size={17} color={Colors.white} /><Text style={styles.addText}>Add type</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
        <View style={styles.info}>
          <Flame size={19} color={Colors.accent} />
          <Text style={styles.infoText}>These pooja types appear in the Pandit app. Pandits can select from this list and request new ones if missing.</Text>
        </View>
        {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 50 }} /> : items.length === 0 ? (
          <View style={styles.empty}>
            <Flame size={42} color={Colors.textDisabled} />
            <Text style={styles.emptyTitle}>No pooja types yet</Text>
            <Text style={styles.emptyText}>Add the first pooja type for Pandits to select.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {items.map(item => (
              <View key={item.id} style={[styles.itemCard, !item.is_active && styles.inactive]}>
                <View style={styles.itemIcon}><Flame size={18} color={Colors.accent} /></View>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemDescription}>{item.description || 'No description'}</Text>
                </View>
                <TouchableOpacity style={styles.edit} onPress={() => openEdit(item)}><Pencil size={15} color={Colors.textSecondary} /></TouchableOpacity>
                <Switch value={item.is_active} onValueChange={() => toggle(item)} trackColor={{ false: Colors.neutral[300], true: Colors.primaryLight }} thumbColor={item.is_active ? Colors.primary : Colors.neutral[500]} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editing ? 'Edit pooja type' : 'Add pooja type'}</Text>
              <TouchableOpacity onPress={() => setModal(false)}><X size={20} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.form}>
              <Text style={styles.label}>Name *</Text>
              <TextInput style={styles.input} value={form.name} onChangeText={name => setForm({ ...form, name })} placeholder="e.g. Griha Pravesh" placeholderTextColor={Colors.textDisabled} />
              <Text style={styles.label}>Description</Text>
              <TextInput style={[styles.input, styles.multiline]} value={form.description} onChangeText={description => setForm({ ...form, description })} multiline placeholder="What does this pooja involve?" placeholderTextColor={Colors.textDisabled} />
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </ScrollView>
            <View style={styles.footer}>
              <TouchableOpacity style={styles.cancel} onPress={() => setModal(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.save} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.white} /> : <><Check size={16} color={Colors.white} /><Text style={styles.saveText}>{editing ? 'Save changes' : 'Add type'}</Text></>}
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
  edit: { padding: 8 },
  empty: { alignItems: 'center', paddingVertical: 80, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  emptyText: { fontFamily: Typography.fontFamily.sansRegular, color: Colors.textTertiary },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.4)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { width: '100%', maxWidth: 560, maxHeight: '90%', backgroundColor: Colors.white, borderRadius: Radius.xl, overflow: 'hidden' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 22, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sheetTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  form: { padding: 22, gap: 4 },
  label: { fontFamily: Typography.fontFamily.sansMedium, color: Colors.textSecondary, fontSize: Typography.size.sm, marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 11, fontFamily: Typography.fontFamily.sansRegular, color: Colors.textPrimary, fontSize: Typography.size.base },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  error: { color: Colors.error, fontFamily: Typography.fontFamily.sansRegular, marginTop: 8 },
  footer: { flexDirection: 'row', gap: 12, padding: 18, borderTopWidth: 1, borderTopColor: Colors.border },
  cancel: { flex: 1, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md },
  cancelText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textSecondary },
  save: { flex: 2, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.primary },
  saveText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.white },
});
