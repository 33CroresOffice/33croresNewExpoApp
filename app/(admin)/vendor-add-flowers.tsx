import React, { useEffect, useState, useCallback } from 'react';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, TextInput, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Flower2, Check, Save } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { Vendor, VendorFlower, FlowerType, UnitType } from '@/types/database';

const UNIT_OPTIONS: UnitType[] = ['kg', 'grams', 'pieces', 'bunch', 'stems', 'dozen', 'ml', 'litre', 'packet', 'tray', 'box', 'meter'];

type FlowerEntry = {
  flower_type_id: string;
  name: string;
  unit_type: UnitType;
  price_per_unit: string;
  selected: boolean;
};

export default function AddVendorFlowersScreen() {
  return (
    <ModuleGuard module="procurement">
      <AddVendorFlowersContent />
    </ModuleGuard>
  );
}

function AddVendorFlowersContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { vendorId } = useLocalSearchParams<{ vendorId: string }>();

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<FlowerEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [vRes, ftRes, vfRes] = await Promise.all([
        supabase.from('vendors').select('*').eq('id', vendorId).maybeSingle(),
        supabase.from('flower_types').select('*').order('name'),
        supabase.from('vendor_flowers').select('flower_type_id').eq('vendor_id', vendorId),
      ]);
      if (vRes.data) setVendor(vRes.data as Vendor);
      const alreadyAdded = new Set(((vfRes.data as { flower_type_id: string }[]) ?? []).map(r => r.flower_type_id));
      const available = ((ftRes.data as FlowerType[]) ?? []).filter(ft => !alreadyAdded.has(ft.id));
      setEntries(available.map(ft => ({
        flower_type_id: ft.id,
        name: ft.name,
        unit_type: ft.unit_type ?? 'kg',
        price_per_unit: '',
        selected: false,
      })));
    } catch (e) {
      console.error('add flowers load error', e);
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => { load(); }, [load]);

  const toggleSelect = (id: string) => {
    setError('');
    setEntries(prev => prev.map(e =>
      e.flower_type_id === id ? { ...e, selected: !e.selected } : e
    ));
  };

  const updateEntry = (id: string, field: 'unit_type' | 'price_per_unit', value: string) => {
    setEntries(prev => prev.map(e =>
      e.flower_type_id === id ? { ...e, [field]: value } : e
    ));
  };

  const selectedEntries = entries.filter(e => e.selected);

  const save = async () => {
    if (!vendor) return;
    if (selectedEntries.length === 0) { setError('Select at least one flower'); return; }
    for (const e of selectedEntries) {
      if (!e.price_per_unit || isNaN(Number(e.price_per_unit)) || Number(e.price_per_unit) <= 0) {
        setError(`Enter a valid price for ${e.name}`); return;
      }
    }
    setSaving(true); setError('');
    const rows = selectedEntries.map(e => ({
      vendor_id: vendor.id,
      flower_type_id: e.flower_type_id,
      unit_type: e.unit_type,
      price_per_unit: Number(e.price_per_unit),
      is_active: true,
    }));
    const { error: err } = await supabase.from('vendor_flowers').upsert(rows, { onConflict: 'vendor_id,flower_type_id' });
    setSaving(false);
    if (err) { setError(err.message); return; }
    router.back();
  };

  if (loading) {
    return (
      <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (!vendor) {
    return (
      <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={s.notFoundText}>Vendor not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={s.notFoundLink}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[s.container, { paddingTop: isWeb ? 0 : insets.top }]}
      behavior={isWeb ? undefined : 'padding'}
    >
      {/* Header */}
      <View style={[s.header, isWeb && s.headerWeb]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} strokeWidth={1.8} />
        </TouchableOpacity>
        <View style={s.headerInfo}>
          <Text style={s.headerTitle}>Add Flowers</Text>
          <Text style={s.headerSub}>{vendor.business_name ?? vendor.contact_person ?? 'Vendor'}</Text>
        </View>
        {selectedEntries.length > 0 && (
          <View style={s.selectedBadge}>
            <Text style={s.selectedBadgeText}>{selectedEntries.length} selected</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, isWeb && s.contentWeb]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {entries.length === 0 ? (
          <View style={s.emptyState}>
            <Flower2 size={36} color={Colors.textDisabled} strokeWidth={1.2} />
            <Text style={s.emptyTitle}>All flowers already added</Text>
            <Text style={s.emptySub}>Every flower type is already in this vendor's supply list.</Text>
          </View>
        ) : entries.map(e => (
          <View key={e.flower_type_id} style={[s.card, e.selected && s.cardSelected]}>
            {/* Checkbox row */}
            <TouchableOpacity
              style={s.checkRow}
              onPress={() => toggleSelect(e.flower_type_id)}
              activeOpacity={0.7}
            >
              <View style={[s.checkbox, e.selected && s.checkboxChecked]}>
                {e.selected && <Check size={12} color={Colors.white} strokeWidth={2.5} />}
              </View>
              <View style={s.flowerIconWrap}>
                <Flower2 size={15} color={e.selected ? Colors.primary : Colors.textTertiary} strokeWidth={1.8} />
              </View>
              <View style={s.checkRowInfo}>
                <Text style={[s.checkRowName, e.selected && s.checkRowNameSelected]}>{e.name}</Text>
                <Text style={s.checkRowUnit}>{e.unit_type}</Text>
              </View>
            </TouchableOpacity>

            {/* Inline fields — visible only when selected */}
            {e.selected && (
              <View style={s.fields}>
                <View style={s.divider} />

                <Text style={s.fieldLabel}>Unit</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.unitChips}>
                  {UNIT_OPTIONS.map(u => (
                    <TouchableOpacity
                      key={u}
                      style={[s.unitChip, e.unit_type === u && s.unitChipActive]}
                      onPress={() => updateEntry(e.flower_type_id, 'unit_type', u)}
                    >
                      <Text style={[s.unitChipText, e.unit_type === u && s.unitChipTextActive]}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={s.fieldLabel}>Price</Text>
                <View style={s.priceInputWrap}>
                  <Text style={s.pricePrefix}>₹</Text>
                  <TextInput
                    style={s.priceInput}
                    value={e.price_per_unit}
                    onChangeText={v => updateEntry(e.flower_type_id, 'price_per_unit', v)}
                    placeholder="0.00"
                    placeholderTextColor={Colors.textDisabled}
                    keyboardType="numeric"
                  />
                  <Text style={s.priceSuffix}>per {e.unit_type}</Text>
                </View>
              </View>
            )}
          </View>
        ))}

        {error ? <Text style={s.errorText}>{error}</Text> : null}
      </ScrollView>

      {/* Footer */}
      <View style={[s.footer, isWeb && s.footerWeb, { paddingBottom: isWeb ? Spacing[4] : insets.bottom + Spacing[3] }]}>
        <TouchableOpacity style={s.cancelBtn} onPress={() => router.back()} disabled={saving}>
          <Text style={s.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.saveBtn, (selectedEntries.length === 0 || saving) && s.saveBtnDisabled]}
          onPress={save}
          disabled={saving || selectedEntries.length === 0}
        >
          {saving ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <>
              <Save size={16} color={Colors.white} strokeWidth={1.8} />
              <Text style={s.saveBtnText}>
                {selectedEntries.length === 0
                  ? 'Add Flowers'
                  : `Add ${selectedEntries.length} Flower${selectedEntries.length !== 1 ? 's' : ''}`}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
  headerInfo: { flex: 1 },
  headerTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  headerSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 2 },
  selectedBadge: { paddingVertical: Spacing[1], paddingHorizontal: Spacing[3], backgroundColor: Colors.primarySurface, borderRadius: Radius.full },
  selectedBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.primary },
  scroll: { flex: 1 },
  content: { padding: Spacing[4], gap: Spacing[3] },
  contentWeb: { padding: Spacing[8], maxWidth: 900, alignSelf: 'center', width: '100%' },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  emptySub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 280 },
  notFoundText: { color: Colors.textSecondary, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base },
  notFoundLink: { color: Colors.primary, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.base },
  // Card
  card: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  cardSelected: { borderColor: Colors.primary },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], padding: Spacing[4] },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white,
  },
  checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  flowerIconWrap: {
    width: 32, height: 32, borderRadius: Radius.md,
    backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center',
  },
  checkRowInfo: { flex: 1 },
  checkRowName: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.base, color: Colors.textPrimary },
  checkRowNameSelected: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.primary },
  checkRowUnit: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  // Expanded fields
  fields: { paddingHorizontal: Spacing[4], paddingBottom: Spacing[4] },
  divider: { height: 1, backgroundColor: Colors.border, marginBottom: Spacing[3] },
  fieldLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary, marginBottom: Spacing[2] },
  unitChips: { gap: Spacing[2], paddingVertical: 2, marginBottom: Spacing[3] },
  unitChip: {
    paddingHorizontal: Spacing[3], paddingVertical: 5, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50],
  },
  unitChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  unitChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textSecondary },
  unitChipTextActive: { color: Colors.white },
  priceInputWrap: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderColor: Colors.border, borderRadius: Radius.md,
    backgroundColor: Colors.neutral[50], paddingHorizontal: Spacing[4],
  },
  pricePrefix: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary, marginRight: 4 },
  priceInput: { flex: 1, paddingVertical: Spacing[3], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary },
  priceSuffix: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginLeft: 4 },
  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error },
  // Footer
  footer: {
    flexDirection: 'row', gap: Spacing[3], paddingHorizontal: Spacing[5],
    paddingTop: Spacing[3], backgroundColor: Colors.white,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  footerWeb: { paddingHorizontal: Spacing[8], alignSelf: 'center', width: '100%', maxWidth: 900 },
  cancelBtn: { flex: 1, paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  saveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2], paddingVertical: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.primary },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
});
