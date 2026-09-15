import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Check, Flame, X } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { PoojaItem, SubscriptionPlan } from '@/types/database';

interface Props { plan: SubscriptionPlan | null; onClose: () => void; onSaved: () => void; }
type Selection = { quantity: string; unit_type: string };

export default function PoojaPackageModal({ plan, onClose, onSaved }: Props) {
  const [items, setItems] = useState<PoojaItem[]>([]);
  const [selected, setSelected] = useState<Record<string, Selection>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!plan) return;
    setLoading(true); setError('');
    Promise.all([
      supabase.from('pooja_items').select('*').eq('is_active', true).order('sort_order').order('name'),
      supabase.from('plan_pooja_items').select('*').eq('plan_id', plan.id),
    ]).then(([itemsResult, linksResult]) => {
      setItems((itemsResult.data ?? []) as PoojaItem[]);
      const next: Record<string, Selection> = {};
      (linksResult.data ?? []).forEach((link: any) => { next[link.pooja_item_id] = { quantity: String(link.quantity_per_delivery), unit_type: link.unit_type }; });
      setSelected(next); setLoading(false);
    }).catch(() => { setError('Could not load the catalogue'); setLoading(false); });
  }, [plan]);

  const toggle = (item: PoojaItem) => setSelected(current => { const next = { ...current }; if (next[item.id]) delete next[item.id]; else next[item.id] = { quantity: '1', unit_type: item.unit_type }; return next; });
  const save = async () => {
    if (!plan) return;
    setSaving(true); setError('');
    const { error: deleteError } = await supabase.from('plan_pooja_items').delete().eq('plan_id', plan.id);
    if (deleteError) { setError(deleteError.message); setSaving(false); return; }
    const rows = Object.entries(selected).map(([pooja_item_id, value]) => ({ plan_id: plan.id, pooja_item_id, quantity_per_delivery: Math.max(1, Number(value.quantity) || 1), unit_type: value.unit_type }));
    if (rows.length) { const { error: insertError } = await supabase.from('plan_pooja_items').insert(rows); if (insertError) { setError(insertError.message); setSaving(false); return; } }
    setSaving(false); onSaved(); onClose();
  };

  return <Modal visible={!!plan} transparent animationType="fade" onRequestClose={onClose}><View style={styles.overlay}><View style={styles.sheet}><View style={styles.header}><View><Text style={styles.title}>Build package</Text><Text style={styles.subtitle}>{plan?.name}</Text></View><TouchableOpacity onPress={onClose}><X size={20} color={Colors.textSecondary} /></TouchableOpacity></View>{loading ? <ActivityIndicator color={Colors.primary} style={{ margin: 40 }} /> : <ScrollView contentContainerStyle={styles.list}>{items.length === 0 ? <Text style={styles.empty}>Add items to the master catalogue first.</Text> : items.map(item => { const value = selected[item.id]; return <View key={item.id} style={[styles.row, value && styles.rowSelected]}><TouchableOpacity style={styles.rowMain} onPress={() => toggle(item)}><View style={[styles.checkbox, value && styles.checkboxSelected]}>{value ? <Check size={13} color={Colors.white} /> : null}</View><View style={styles.itemIcon}><Flame size={16} color={Colors.accent} /></View><View style={{ flex: 1 }}><Text style={styles.itemName}>{item.name}</Text><Text style={styles.itemUnit}>Unit: {item.unit_type}</Text></View></TouchableOpacity>{value ? <TextInput style={styles.quantity} value={value.quantity} onChangeText={quantity => setSelected(current => ({ ...current, [item.id]: { ...value, quantity } }))} keyboardType="numeric" /> : null}</View>})}</ScrollView>}{error ? <Text style={styles.error}>{error}</Text> : null}<View style={styles.footer}><TouchableOpacity style={styles.cancel} onPress={onClose}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.save} onPress={save} disabled={saving}>{saving ? <ActivityIndicator color={Colors.white} /> : <><Check size={16} color={Colors.white} /><Text style={styles.saveText}>Save package</Text></>}</TouchableOpacity></View></View></View></Modal>;
}

const styles = StyleSheet.create({ overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.4)', alignItems: 'center', justifyContent: 'center', padding: 20 }, sheet: { width: '100%', maxWidth: 620, maxHeight: '90%', backgroundColor: Colors.white, borderRadius: Radius.xl, overflow: 'hidden' }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 22, borderBottomWidth: 1, borderBottomColor: Colors.border }, title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary }, subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 2 }, list: { padding: 20, gap: 10 }, row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: 12, gap: 10 }, rowSelected: { borderColor: Colors.accent, backgroundColor: Colors.accentSurface }, rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }, checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: Colors.neutral[300], alignItems: 'center', justifyContent: 'center' }, checkboxSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary }, itemIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FCEED8', alignItems: 'center', justifyContent: 'center' }, itemName: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary }, itemUnit: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 }, quantity: { width: 55, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: 8, textAlign: 'center', color: Colors.textPrimary }, empty: { textAlign: 'center', color: Colors.textTertiary, padding: 30, fontFamily: Typography.fontFamily.sansRegular }, error: { color: Colors.error, paddingHorizontal: 20, paddingBottom: 10, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm }, footer: { flexDirection: 'row', gap: 12, padding: 18, borderTopWidth: 1, borderTopColor: Colors.border }, cancel: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md }, cancelText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textSecondary }, save: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 12 }, saveText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.white } });
