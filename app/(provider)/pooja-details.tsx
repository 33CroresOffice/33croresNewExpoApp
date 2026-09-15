import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check, Clock3, IndianRupee, Languages, Package, Flame, X } from 'lucide-react-native';
import CollapsibleCategory from '@/components/ui/CollapsibleCategory';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { ProviderPoojaSetup, PoojaItem } from '@/types/database';

const LANGUAGES = ['Hindi', 'Sanskrit', 'Marathi', 'Tamil', 'Telugu', 'Kannada', 'Bengali', 'Gujarati', 'Punjabi', 'English'];

export default function PoojaDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthStore();
  const [setup, setSetup] = useState<ProviderPoojaSetup | null>(null);
  const [poojaItems, setPoojaItems] = useState<PoojaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('60');
  const [language, setLanguage] = useState('Hindi');
  const [instructions, setInstructions] = useState('');
  const [setupItems, setSetupItems] = useState<{ pooja_item_id: string; quantity: string }[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [setupRes, itemsRes] = await Promise.all([
      supabase
        .from('provider_pooja_setups')
        .select('*, pooja_type:pooja_types(*), items:provider_pooja_items(*, pooja_item:pooja_items(*))')
        .eq('id', id)
        .maybeSingle(),
      supabase.from('pooja_items').select('*, category:pooja_item_categories(*)').eq('is_active', true).order('sort_order').order('name'),
    ]);

    const setupData = setupRes.data as unknown as ProviderPoojaSetup | null;
    setSetup(setupData);
    if (setupData) {
      setDescription(setupData.description ?? '');
      setDuration(String(setupData.duration_minutes ?? 60));
      setLanguage(setupData.language || 'Hindi');
      setInstructions(setupData.special_instructions ?? '');
      setSetupItems((setupData.items ?? []).map(item => ({ pooja_item_id: item.pooja_item_id, quantity: String(item.quantity) })));
    }
    setPoojaItems((itemsRes.data ?? []) as PoojaItem[]);
    setLoading(false);
    setRefreshing(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!id) return;
    if (Number(duration) <= 0 || Number(duration) > 1440) { setError('Duration must be between 1 and 1440 minutes.'); return; }
    setSaving(true); setError(''); setSaved(false);
    try {
      const { error: updErr } = await supabase
        .from('provider_pooja_setups')
        .update({
          description: description.trim(),
          duration_minutes: Number(duration),
          language,
          special_instructions: instructions.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (updErr) throw updErr;

      await supabase.from('provider_pooja_items').delete().eq('pooja_setup_id', id);
      if (setupItems.length > 0) {
        const rows = setupItems.map(item => ({
          pooja_setup_id: id,
          pooja_item_id: item.pooja_item_id,
          quantity: Number(item.quantity) || 1,
        }));
        const { error: itemsErr } = await supabase.from('provider_pooja_items').insert(rows);
        if (itemsErr) throw itemsErr;
      }

      setSaved(true);
      load();
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      console.error('Pooja details save failed', e);
      setError('Could not save changes. Please try again.');
    }
    setSaving(false);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Pooja Details</Text>
      </View>

      {setup && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryIcon}><Flame size={20} color={Colors.accent} /></View>
            <View style={styles.summaryInfo}>
              <Text style={styles.summaryName}>{setup.pooja_type?.name ?? 'Unknown pooja'}</Text>
              <View style={styles.summaryMeta}>
                <View style={styles.metaItem}><IndianRupee size={14} color={Colors.textTertiary} /><Text style={styles.metaText}>{setup.service_fee}</Text></View>
              </View>
            </View>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.label}>Description</Text>
        <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} multiline placeholder="Describe what this pooja includes" placeholderTextColor={Colors.textDisabled} textAlignVertical="top" />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Duration (minutes) *</Text>
        <TextInput style={styles.input} value={duration} onChangeText={setDuration} keyboardType="number-pad" placeholder="60" placeholderTextColor={Colors.textDisabled} />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Language</Text>
        <View style={styles.typeGrid}>
          {LANGUAGES.map(lang => (
            <TouchableOpacity key={lang} style={[styles.typeChip, language === lang && styles.typeChipActive]} onPress={() => setLanguage(lang)}>
              <Text style={[styles.typeChipText, language === lang && styles.typeChipTextActive]}>{lang}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Special Instructions</Text>
        <TextInput style={[styles.input, styles.multiline]} value={instructions} onChangeText={setInstructions} multiline placeholder="Any special instructions for the customer" placeholderTextColor={Colors.textDisabled} textAlignVertical="top" />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Pooja Item List</Text>
        <Text style={styles.subLabel}>Select items and quantities required for this pooja</Text>
        {(() => {
          const groups: Record<string, { name: string; items: PoojaItem[] }> = {};
          for (const item of poojaItems) {
            const catId = item.category_id ?? 'uncategorized';
            const catName = item.category?.name ?? 'Uncategorized';
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
              {group.items.map(item => {
                const selected = setupItems.find(si => si.pooja_item_id === item.id);
                return (
                  <View key={item.id} style={styles.itemSelectRow}>
                    <TouchableOpacity style={styles.itemSelectCheck} onPress={() => {
                      if (selected) {
                        setSetupItems(prev => prev.filter(si => si.pooja_item_id !== item.id));
                      } else {
                        setSetupItems(prev => [...prev, { pooja_item_id: item.id, quantity: '1' }]);
                      }
                    }}>
                      <View style={[styles.checkbox, selected && styles.checkboxActive]}>
                        {selected ? <Check size={14} color={Colors.white} /> : null}
                      </View>
                      <Text style={styles.itemSelectName}>{item.name}</Text>
                      <Text style={styles.itemSelectUnit}>{item.unit_type}</Text>
                    </TouchableOpacity>
                    {selected && (
                      <TextInput style={styles.qtyInput} value={selected.quantity} onChangeText={text => setSetupItems(prev => prev.map(si => si.pooja_item_id === item.id ? { ...si, quantity: text } : si))} keyboardType="decimal-pad" placeholder="1" placeholderTextColor={Colors.textDisabled} />
                    )}
                  </View>
                );
              })}
            </CollapsibleCategory>
          ));
        })()}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {saved ? <Text style={styles.savedText}>Changes saved successfully.</Text> : null}

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
          <Text style={styles.cancelBtnText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color={Colors.white} /> : <><Check size={16} color={Colors.white} /><Text style={styles.saveBtnText}>Save changes</Text></>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing[5], paddingTop: Spacing[8], gap: Spacing[4], paddingBottom: Spacing[10] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing[3], paddingHorizontal: Spacing[6] },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  topBarTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  summaryCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  summaryHeader: { flexDirection: 'row', gap: Spacing[3], alignItems: 'center' },
  summaryIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.accentSurface, alignItems: 'center', justifyContent: 'center' },
  summaryInfo: { flex: 1, gap: 3 },
  summaryName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  summaryMeta: { flexDirection: 'row', gap: Spacing[4], flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  section: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, gap: 4 },
  label: { fontFamily: Typography.fontFamily.sansMedium, color: Colors.textSecondary, fontSize: Typography.size.sm, marginBottom: 4 },
  subLabel: { fontFamily: Typography.fontFamily.sansRegular, color: Colors.textTertiary, fontSize: Typography.size.xs, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 11, fontFamily: Typography.fontFamily.sansRegular, color: Colors.textPrimary, fontSize: Typography.size.base },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 8 },
  typeChipActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  typeChipText: { fontFamily: Typography.fontFamily.sansMedium, color: Colors.textSecondary, fontSize: Typography.size.sm },
  typeChipTextActive: { color: Colors.primary },
  itemSelectRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingVertical: 6 },
  itemSelectCheck: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  itemSelectName: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  itemSelectUnit: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  qtyInput: { width: 60, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 6, fontFamily: Typography.fontFamily.sansRegular, color: Colors.textPrimary, textAlign: 'center' },
  error: { color: Colors.error, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm },
  savedText: { color: Colors.success, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm },
  footer: { flexDirection: 'row', gap: 12, paddingTop: Spacing[2] },
  cancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md },
  cancelBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textSecondary },
  saveBtn: { flex: 2, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.primary },
  saveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.white },
});
