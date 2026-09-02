import React, { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Switch, Platform, ActivityIndicator,
  RefreshControl, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Flower2, Plus, X, Pencil, ArrowLeft, Package, Camera, Image as ImageIcon } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { FlowerType, UnitType } from '@/types/database';

const UNIT_OPTIONS: { value: UnitType; label: string; desc: string }[] = [
  { value: 'bunch',  label: 'Bunch',  desc: 'Tied clusters' },
  { value: 'stems',  label: 'Stems',  desc: 'Individual stems' },
  { value: 'pieces', label: 'Pieces', desc: 'Counted units' },
  { value: 'dozen',  label: 'Dozen',  desc: 'Sets of 12' },
  { value: 'kg',     label: 'Kg',     desc: 'By weight' },
  { value: 'grams',  label: 'Grams',  desc: 'Precise weight' },
];

const UNIT_COLORS: Record<UnitType, { bg: string; text: string; border: string }> = {
  bunch:  { bg: Colors.primarySurface,  text: Colors.primary,      border: Colors.primary + '40' },
  stems:  { bg: Colors.secondarySurface, text: Colors.secondary,   border: Colors.secondary + '40' },
  pieces: { bg: Colors.accentSurface,   text: Colors.accentDark,   border: Colors.accent + '40' },
  dozen:  { bg: '#F3E8FF',              text: '#7C3AED',            border: '#C4B5FD' },
  kg:     { bg: '#E3F2FD',              text: '#1565C0',            border: '#90CAF9' },
  grams:  { bg: '#E8F5E9',              text: '#2E7D32',            border: '#A5D6A7' },
};

const MONTHS = [
  { num: 1, short: 'Jan' }, { num: 2, short: 'Feb' }, { num: 3, short: 'Mar' },
  { num: 4, short: 'Apr' }, { num: 5, short: 'May' }, { num: 6, short: 'Jun' },
  { num: 7, short: 'Jul' }, { num: 8, short: 'Aug' }, { num: 9, short: 'Sep' },
  { num: 10, short: 'Oct' }, { num: 11, short: 'Nov' }, { num: 12, short: 'Dec' },
];

const EMPTY_FORM = {
  display_name: '',
  unit_type: 'bunch' as UnitType,
  description: '',
  available_months: null as number[] | null,
  is_active: true,
};

function monthLabel(months: number[] | null): string {
  if (!months || months.length === 0) return 'Year-round';
  if (months.length === 12) return 'Year-round';
  const sorted = [...months].sort((a, b) => a - b);
  return sorted.map(m => MONTHS[m - 1].short).join(', ');
}

export default function FlowerTypesScreen() {
  return (
    <ModuleGuard module="catalog">
      <FlowerTypesScreenContent />
    </ModuleGuard>
  );
}

function FlowerTypesScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { action } = useLocalSearchParams<{ action?: string }>();
  const [items, setItems] = useState<FlowerType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FlowerType | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');

  // Auto-open add modal when navigated with ?action=add
  useEffect(() => {
    if (action === 'add' && !loading) {
      openCreate();
    }
  }, [action, loading]);

  const load = async () => {
    try {
      const { data } = await supabase
        .from('flower_types')
        .select('*')
        .order('sort_order')
        .order('display_name');
      if (data) setItems(data);
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
    setImageUri(null);
    setError('');
    setShowModal(true);
  };

  const openEdit = (item: FlowerType) => {
    setEditing(item);
    setForm({
      display_name: item.display_name,
      unit_type: item.unit_type as UnitType,
      description: item.description ?? '',
      available_months: item.available_months ?? null,
      is_active: item.is_active,
    });
    setImageUri(item.image_url ?? null);
    setError('');
    setShowModal(true);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { setError('Camera roll permission is required'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const uploadImage = async (localUri: string): Promise<string | null> => {
    setImageUploading(true);
    try {
      const response = await fetch(localUri);
      const blob = await response.blob();
      const ext = localUri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const fileName = `flowers/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, { contentType: `image/${ext}`, upsert: true });
      if (uploadError) { setError(uploadError.message); return null; }
      const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
      return data.publicUrl;
    } catch {
      setError('Image upload failed');
      return null;
    } finally {
      setImageUploading(false);
    }
  };

  const save = async () => {
    if (!form.display_name.trim()) { setError('Display name is required'); return; }
    setSaving(true);
    setError('');

    let finalImageUrl = editing?.image_url ?? null;

    if (imageUri && imageUri !== editing?.image_url) {
      const uploaded = await uploadImage(imageUri);
      if (!uploaded) { setSaving(false); return; }
      finalImageUrl = uploaded;
    } else if (!imageUri) {
      finalImageUrl = null;
    }

    const slug = form.display_name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const payload = {
      name: editing ? editing.name : slug,
      display_name: form.display_name.trim(),
      unit_type: form.unit_type,
      description: form.description.trim() || null,
      available_months: form.available_months && form.available_months.length > 0 ? form.available_months : null,
      is_active: form.is_active,
      image_url: finalImageUrl,
    };

    const { error: err } = editing
      ? await supabase.from('flower_types').update(payload).eq('id', editing.id)
      : await supabase.from('flower_types').insert(payload);

    setSaving(false);
    if (err) { setError(err.message); return; }
    setShowModal(false);
    load();
  };

  const toggleActive = async (item: FlowerType) => {
    await supabase.from('flower_types').update({ is_active: !item.is_active }).eq('id', item.id);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: !i.is_active } : i));
  };

  const toggleMonth = (m: number) => {
    setForm(p => {
      const cur = p.available_months ?? [];
      const next = cur.includes(m) ? cur.filter(x => x !== m) : [...cur, m];
      return { ...p, available_months: next.length > 0 ? next : null };
    });
  };

  const activeCount = items.filter(i => i.is_active).length;
  const inactiveCount = items.filter(i => !i.is_active).length;

  const filtered = filterActive === 'all' ? items
    : filterActive === 'active' ? items.filter(i => i.is_active)
    : items.filter(i => !i.is_active);

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
            <Flower2 size={isWeb ? 20 : 18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>Flower Types</Text>
            <Text style={s.subtitle}>{activeCount} active · {inactiveCount} inactive</Text>
          </View>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openCreate} activeOpacity={0.85}>
          <Plus size={15} color={Colors.white} strokeWidth={2.5} />
          <Text style={s.addBtnText}>Add Flower</Text>
        </TouchableOpacity>
      </View>

      {isWeb && items.length > 0 && (
        <View style={s.statsBar}>
          <View style={s.statItem}>
            <Text style={s.statNum}>{items.length}</Text>
            <Text style={s.statLabel}>Total</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={[s.statNum, { color: Colors.primary }]}>{activeCount}</Text>
            <Text style={s.statLabel}>Active</Text>
          </View>
          <View style={s.statDivider} />
          {UNIT_OPTIONS.slice(0, 4).map(u => {
            const uc = UNIT_COLORS[u.value];
            const cnt = items.filter(i => i.unit_type === u.value).length;
            if (cnt === 0) return null;
            return (
              <View key={u.value} style={s.statItem}>
                <Text style={[s.statNum, { color: uc.text }]}>{cnt}</Text>
                <Text style={s.statLabel}>{u.label}</Text>
              </View>
            );
          })}
        </View>
      )}

      <View style={s.tabBar}>
        {(['all', 'active', 'inactive'] as const).map(f => {
          const isActive = filterActive === f;
          const count = f === 'all' ? items.length : f === 'active' ? activeCount : inactiveCount;
          return (
            <TouchableOpacity
              key={f}
              style={[s.tab, isActive && s.tabActive]}
              onPress={() => setFilterActive(f)}
              activeOpacity={0.7}
            >
              <Text style={[s.tabText, isActive && s.tabTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
              <View style={[s.tabBadge, isActive && s.tabBadgeActive]}>
                <Text style={[s.tabBadgeText, isActive && s.tabBadgeTextActive]}>{count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

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
              <Flower2 size={28} color={Colors.textDisabled} strokeWidth={1.4} />
            </View>
            <Text style={s.emptyTitle}>
              {filterActive === 'all' ? 'No flower types yet' : `No ${filterActive} flowers`}
            </Text>
            <Text style={s.emptySub}>
              {filterActive === 'all'
                ? 'Add flower varieties to enable procurement and plan tracking.'
                : `No ${filterActive} flower types at the moment.`}
            </Text>
            {filterActive === 'all' && (
              <TouchableOpacity style={s.emptyBtn} onPress={openCreate} activeOpacity={0.85}>
                <Plus size={14} color={Colors.white} strokeWidth={2.5} />
                <Text style={s.emptyBtnText}>Add First Flower</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : isWeb ? (
          <View style={s.tableCard}>
            <View style={s.tableHead}>
              <Text style={[s.thCell, { flex: 2 }]}>Flower</Text>
              <Text style={[s.thCell, { width: 90 }]}>Unit</Text>
              <Text style={[s.thCell, { flex: 1.5 }]}>Availability</Text>
              <Text style={[s.thCell, { flex: 1.5 }]}>Description</Text>
              <Text style={[s.thCell, { width: 80 }]}>Status</Text>
              <Text style={[s.thCell, { width: 80 }]}>Actions</Text>
            </View>
            {filtered.map((item, i) => {
              const uc = UNIT_COLORS[item.unit_type as UnitType] ?? UNIT_COLORS.bunch;
              return (
                <View key={item.id} style={[s.tableRow, i % 2 === 1 && s.tableRowAlt, !item.is_active && s.tableRowInactive]}>
                  <View style={[{ flex: 2 }, s.nameCell]}>
                    {item.image_url ? (
                      <Image source={{ uri: item.image_url }} style={s.flowerImg} />
                    ) : (
                      <View style={[s.flowerAvatar, { backgroundColor: item.is_active ? Colors.primarySurface : Colors.neutral[100] }]}>
                        <Flower2 size={16} color={item.is_active ? Colors.primary : Colors.textDisabled} strokeWidth={1.8} />
                      </View>
                    )}
                    <Text style={[s.tdPrimary, !item.is_active && s.tdMuted]}>{item.display_name}</Text>
                  </View>
                  <View style={{ width: 90 }}>
                    <View style={[s.unitBadge, { backgroundColor: uc.bg, borderColor: uc.border }]}>
                      <Text style={[s.unitBadgeText, { color: uc.text }]}>{item.unit_type}</Text>
                    </View>
                  </View>
                  <Text style={[s.tdCell, { flex: 1.5 }]} numberOfLines={2}>
                    {monthLabel(item.available_months)}
                  </Text>
                  <Text style={[s.tdCell, { flex: 1.5 }]} numberOfLines={2}>
                    {item.description || '—'}
                  </Text>
                  <View style={{ width: 80 }}>
                    <Switch
                      value={item.is_active}
                      onValueChange={() => toggleActive(item)}
                      trackColor={{ true: Colors.primary, false: Colors.neutral[200] }}
                      thumbColor={Colors.white}
                    />
                  </View>
                  <View style={{ width: 80, alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => openEdit(item)} style={s.editBtn}>
                      <Pencil size={15} color={Colors.textSecondary} strokeWidth={1.8} />
                      <Text style={s.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={s.mobileList}>
            {filtered.map(item => {
              const uc = UNIT_COLORS[item.unit_type as UnitType] ?? UNIT_COLORS.bunch;
              return (
                <View key={item.id} style={[s.card, !item.is_active && s.cardInactive]}>
                  <View style={s.cardTop}>
                    <View style={s.cardLeft}>
                      {item.image_url ? (
                        <Image source={{ uri: item.image_url }} style={s.cardImg} />
                      ) : (
                        <View style={[s.flowerAvatar, { backgroundColor: item.is_active ? Colors.primarySurface : Colors.neutral[100] }]}>
                          <Flower2 size={18} color={item.is_active ? Colors.primary : Colors.textDisabled} strokeWidth={1.8} />
                        </View>
                      )}
                      <View style={s.cardInfo}>
                        <Text style={[s.cardName, !item.is_active && s.textMuted]}>{item.display_name}</Text>
                        <View style={s.cardMeta}>
                          <View style={[s.unitBadge, { backgroundColor: uc.bg, borderColor: uc.border }]}>
                            <Text style={[s.unitBadgeText, { color: uc.text }]}>{item.unit_type}</Text>
                          </View>
                          <Text style={s.cardAvail}>{monthLabel(item.available_months)}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={s.cardActions}>
                      <Switch
                        value={item.is_active}
                        onValueChange={() => toggleActive(item)}
                        trackColor={{ true: Colors.primary, false: Colors.neutral[200] }}
                        thumbColor={Colors.white}
                      />
                      <TouchableOpacity onPress={() => openEdit(item)} style={s.editIconBtn}>
                        <Pencil size={15} color={Colors.textSecondary} strokeWidth={1.8} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  {item.description ? (
                    <Text style={s.cardDesc} numberOfLines={2}>{item.description}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <View style={s.modalTitleRow}>
                <View style={s.modalIcon}>
                  <Flower2 size={16} color={Colors.primary} strokeWidth={1.8} />
                </View>
                <Text style={s.modalTitle}>{editing ? 'Edit Flower Type' : 'Add Flower Type'}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowModal(false)} style={s.closeBtn}>
                <X size={16} color={Colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* Image upload */}
              <View style={s.formGroup}>
                <Text style={s.label}>Photo</Text>
                <TouchableOpacity style={s.imagePicker} onPress={pickImage} activeOpacity={0.8}>
                  {imageUri ? (
                    <>
                      <Image source={{ uri: imageUri }} style={s.imagePreview} />
                      <View style={s.imageOverlay}>
                        <Camera size={18} color={Colors.white} strokeWidth={1.8} />
                        <Text style={s.imageOverlayText}>Change</Text>
                      </View>
                    </>
                  ) : (
                    <View style={s.imagePlaceholder}>
                      <ImageIcon size={24} color={Colors.textDisabled} strokeWidth={1.5} />
                      <Text style={s.imagePlaceholderText}>Tap to upload photo</Text>
                      <Text style={s.imagePlaceholderHint}>Square images work best</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {imageUri && (
                  <TouchableOpacity onPress={() => setImageUri(null)} style={s.removeImageBtn}>
                    <X size={12} color={Colors.error} strokeWidth={2.5} />
                    <Text style={s.removeImageText}>Remove photo</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Display Name */}
              <View style={s.formGroup}>
                <Text style={s.label}>Display Name *</Text>
                <TextInput
                  style={s.input}
                  value={form.display_name}
                  onChangeText={v => setForm(p => ({ ...p, display_name: v }))}
                  placeholder="e.g. Red Roses"
                  placeholderTextColor={Colors.textDisabled}
                />
              </View>

              {/* Unit Type */}
              <View style={s.formGroup}>
                <Text style={s.label}>Unit Type *</Text>
                <View style={s.unitGrid}>
                  {UNIT_OPTIONS.map(u => {
                    const isSelected = form.unit_type === u.value;
                    const uc = UNIT_COLORS[u.value];
                    return (
                      <TouchableOpacity
                        key={u.value}
                        style={[s.unitOption, isSelected && { borderColor: uc.text, backgroundColor: uc.bg }]}
                        onPress={() => setForm(p => ({ ...p, unit_type: u.value }))}
                        activeOpacity={0.8}
                      >
                        <Package size={13} color={isSelected ? uc.text : Colors.textTertiary} strokeWidth={1.8} />
                        <View>
                          <Text style={[s.unitOptionLabel, isSelected && { color: uc.text }]}>{u.label}</Text>
                          <Text style={[s.unitOptionDesc, isSelected && { color: uc.text + 'AA' }]}>{u.desc}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Availability Months */}
              <View style={s.formGroup}>
                <View style={s.availHeader}>
                  <Text style={s.label}>Availability</Text>
                  <TouchableOpacity
                    onPress={() => setForm(p => ({ ...p, available_months: null }))}
                    style={[s.yearRoundBtn, (!form.available_months || form.available_months.length === 0) && s.yearRoundBtnActive]}
                  >
                    <Text style={[s.yearRoundText, (!form.available_months || form.available_months.length === 0) && s.yearRoundTextActive]}>
                      Year-round
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={s.monthGrid}>
                  {MONTHS.map(m => {
                    const sel = form.available_months?.includes(m.num) ?? false;
                    return (
                      <TouchableOpacity
                        key={m.num}
                        style={[s.monthChip, sel && s.monthChipActive]}
                        onPress={() => toggleMonth(m.num)}
                        activeOpacity={0.75}
                      >
                        <Text style={[s.monthChipText, sel && s.monthChipTextActive]}>{m.short}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={s.hint}>
                  {form.available_months && form.available_months.length > 0
                    ? `Available in: ${monthLabel(form.available_months)}`
                    : 'Available throughout the year'}
                </Text>
              </View>

              {/* Description */}
              <View style={s.formGroup}>
                <Text style={s.label}>Description</Text>
                <TextInput
                  style={[s.input, s.textarea]}
                  value={form.description}
                  onChangeText={v => setForm(p => ({ ...p, description: v }))}
                  placeholder="Optional notes about this flower variety..."
                  placeholderTextColor={Colors.textDisabled}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Active toggle */}
              <View style={s.switchRow}>
                <View>
                  <Text style={s.label}>Active</Text>
                  <Text style={s.switchHint}>Inactive flowers won't appear in procurement</Text>
                </View>
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
              <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving || imageUploading} activeOpacity={0.85}>
                {saving || imageUploading ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <>
                    <Flower2 size={14} color={Colors.white} strokeWidth={2} />
                    <Text style={s.saveBtnText}>{editing ? 'Save Changes' : 'Add Flower'}</Text>
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

  statsBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[8], paddingVertical: Spacing[4],
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: Spacing[6],
  },
  statItem: { alignItems: 'center', gap: 2 },
  statNum: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  statLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary },
  statDivider: { width: 1, height: 28, backgroundColor: Colors.border },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: Spacing[5],
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: Spacing[3], paddingHorizontal: Spacing[4],
    borderBottomWidth: 2, borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary },
  tabTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  tabBadge: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: Colors.neutral[200], alignItems: 'center', justifyContent: 'center',
  },
  tabBadgeActive: { backgroundColor: Colors.primarySurface },
  tabBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.textTertiary },
  tabBadgeTextActive: { color: Colors.primary },

  scroll: { flex: 1 },
  content: { padding: Spacing[5], gap: Spacing[3] },
  contentWeb: { padding: Spacing[8], maxWidth: 1200, alignSelf: 'center', width: '100%' },

  center: { paddingTop: 80, alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: Spacing[4] },
  emptyIcon: {
    width: 64, height: 64, borderRadius: Radius.xl,
    backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  emptySub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 300 },
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
  tableRowInactive: { opacity: 0.55 },
  nameCell: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  flowerImg: { width: 36, height: 36, borderRadius: Radius.sm },
  flowerAvatar: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  tdPrimary: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  tdMuted: { color: Colors.textTertiary },
  tdCell: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  unitBadge: {
    alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 8,
    borderRadius: Radius.full, borderWidth: 1,
  },
  unitBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, textTransform: 'capitalize' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: Radius.sm, backgroundColor: Colors.neutral[100] },
  editBtnText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 12, color: Colors.textSecondary },

  mobileList: { gap: Spacing[3] },
  card: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: Spacing[4], borderWidth: 1, borderColor: Colors.border,
    gap: Spacing[2], ...Shadow.sm,
  },
  cardInactive: { opacity: 0.6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  cardImg: { width: 44, height: 44, borderRadius: Radius.md },
  cardInfo: { flex: 1 },
  cardName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  textMuted: { color: Colors.textTertiary },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  cardAvail: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textDisabled },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  editIconBtn: {
    width: 32, height: 32, borderRadius: Radius.sm,
    backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center',
  },
  cardDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: Spacing[5] },
  modal: {
    width: '100%', maxHeight: '92%',
    backgroundColor: Colors.white, borderRadius: Radius.xl,
    padding: Spacing[5], gap: Spacing[4],
  },
  modalWeb: { maxWidth: 540 },
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
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  hint: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary },

  imagePicker: {
    width: '100%', height: 130, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed',
    backgroundColor: Colors.neutral[50], overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  imagePreview: { width: '100%', height: '100%', resizeMode: 'cover' },
  imageOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: 6,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  imageOverlayText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  imagePlaceholder: { alignItems: 'center', gap: 6 },
  imagePlaceholderText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary },
  imagePlaceholderHint: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textDisabled },
  removeImageBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  removeImageText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 12, color: Colors.error },

  unitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  unitOption: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: Spacing[2], paddingHorizontal: Spacing[3],
    borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.neutral[50],
    minWidth: 90,
  },
  unitOptionLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  unitOptionDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textDisabled, marginTop: 1 },

  availHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  yearRoundBtn: {
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[100],
  },
  yearRoundBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  yearRoundText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11, color: Colors.textTertiary },
  yearRoundTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthChip: {
    width: 46, height: 34, borderRadius: Radius.sm,
    borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.neutral[50], alignItems: 'center', justifyContent: 'center',
  },
  monthChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  monthChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 12, color: Colors.textTertiary },
  monthChipTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },

  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: Spacing[3], paddingVertical: Spacing[3],
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  switchHint: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary, marginTop: 2 },

  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error, marginBottom: Spacing[2] },

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
  saveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
});
