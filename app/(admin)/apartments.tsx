import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Switch, Platform, ActivityIndicator,
  RefreshControl, LayoutAnimation, UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Building2, Plus, X, Pencil, ArrowLeft, Search, Trash2, MapPin, ChevronDown, Check } from 'lucide-react-native';
import { router } from 'expo-router';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import ModuleGuard from '@/components/admin/ModuleGuard';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Apartment {
  id: number;
  locality_id: string;
  apartment_name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Locality {
  id: number;
  locality_name: string;
  unique_code: string;
}

const EMPTY_FORM = {
  locality_id: '',
  apartment_name: '',
  status: 'active' as string,
};

export default function ApartmentsScreen() {
  return (
    <ModuleGuard module="catalog">
      <ApartmentsContent />
    </ModuleGuard>
  );
}

function ApartmentsContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [items, setItems] = useState<Apartment[]>([]);
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Apartment | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [deleteTarget, setDeleteTarget] = useState<Apartment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [aptRes, locRes] = await Promise.all([
        supabase.from('flower__apartment').select('*').order('apartment_name'),
        supabase.from('localities').select('id, locality_name, unique_code').order('locality_name'),
      ]);
      if (aptRes.data) setItems(aptRes.data as Apartment[]);
      if (locRes.data) setLocalities(locRes.data as Locality[]);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  usePageVisibility(load);

  const localityMap = new Map(localities.map(l => [l.unique_code, l.locality_name]));

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setDropdownOpen(false);
    setShowModal(true);
  };

  const openEdit = (item: Apartment) => {
    setEditing(item);
    setForm({
      locality_id: item.locality_id ?? '',
      apartment_name: item.apartment_name ?? '',
      status: item.status,
    });
    setError('');
    setDropdownOpen(false);
    setShowModal(true);
  };

  const save = async () => {
    if (!form.locality_id) { setError('Please select a locality'); return; }

    setSaving(true);
    setError('');

    const payload = {
      locality_id: form.locality_id,
      apartment_name: form.apartment_name.trim() || null,
      status: form.status,
    };

    const { error: err } = editing
      ? await supabase.from('flower__apartment').update(payload).eq('id', editing.id)
      : await supabase.from('flower__apartment').insert(payload);

    setSaving(false);
    if (err) { setError(err.message); return; }
    setShowModal(false);
    load();
  };

  const toggleStatus = async (item: Apartment) => {
    const newStatus = item.status === 'active' ? 'inactive' : 'active';
    await supabase.from('flower__apartment').update({ status: newStatus }).eq('id', item.id);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: newStatus } : i));
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error: err } = await supabase.from('flower__apartment').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (err) { setError(err.message); return; }
    setDeleteTarget(null);
    load();
  };

  const filtered = items.filter(item => {
    const matchesSearch = !search ||
      (item.apartment_name?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (localityMap.get(item.locality_id ?? '')?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesStatus = filterStatus === 'all' || item.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const activeCount = items.filter(i => i.status === 'active').length;
  const inactiveCount = items.filter(i => i.status !== 'active').length;

  const selectedLocality = localities.find(l => l.unique_code === form.locality_id);

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
            <Building2 size={isWeb ? 20 : 18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>Apartments</Text>
            <Text style={s.subtitle}>{activeCount} active · {inactiveCount} inactive · {items.length} total</Text>
          </View>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openCreate} activeOpacity={0.85}>
          <Plus size={15} color={Colors.white} strokeWidth={2.5} />
          <Text style={s.addBtnText}>Add Apartment</Text>
        </TouchableOpacity>
      </View>

      {isWeb && (
        <View style={s.toolbar}>
          <View style={s.searchBox}>
            <Search size={16} color={Colors.textTertiary} strokeWidth={1.8} />
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search by apartment name or locality..."
              placeholderTextColor={Colors.textDisabled}
            />
          </View>
          <View style={s.tabBar}>
            {(['all', 'active', 'inactive'] as const).map(f => {
              const isActive = filterStatus === f;
              const count = f === 'all' ? items.length : f === 'active' ? activeCount : inactiveCount;
              return (
                <TouchableOpacity
                  key={f}
                  style={[s.tab, isActive && s.tabActive]}
                  onPress={() => setFilterStatus(f)}
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
              <Building2 size={28} color={Colors.textDisabled} strokeWidth={1.4} />
            </View>
            <Text style={s.emptyTitle}>
              {search ? 'No apartments found' : 'No apartments yet'}
            </Text>
            <Text style={s.emptySub}>
              {search ? 'Try a different search term.' : 'Add apartments to link them with localities.'}
            </Text>
            {!search && (
              <TouchableOpacity style={s.emptyBtn} onPress={openCreate} activeOpacity={0.85}>
                <Plus size={14} color={Colors.white} strokeWidth={2.5} />
                <Text style={s.emptyBtnText}>Add First Apartment</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : isWeb ? (
          <View style={s.tableCard}>
            <View style={s.tableHead}>
              <Text style={[s.thCell, { width: 60 }]}>SL</Text>
              <Text style={[s.thCell, { flex: 2 }]}>Name</Text>
              <Text style={[s.thCell, { flex: 2 }]}>Locality</Text>
              <Text style={[s.thCell, { width: 100 }]}>Status</Text>
              <Text style={[s.thCell, { width: 120 }]}>Actions</Text>
            </View>
            {filtered.map((item, i) => (
              <View key={item.id} style={[s.tableRow, i % 2 === 1 && s.tableRowAlt, item.status !== 'active' && s.tableRowInactive]}>
                <Text style={[s.tdSl, { width: 60 }]}>{i + 1}</Text>
                <View style={[{ flex: 2 }, s.nameCell]}>
                  <View style={[s.rowIcon, { backgroundColor: item.status === 'active' ? Colors.primarySurface : Colors.neutral[100] }]}>
                    <Building2 size={15} color={item.status === 'active' ? Colors.primary : Colors.textDisabled} strokeWidth={1.8} />
                  </View>
                  <Text style={[s.tdPrimary, item.status !== 'active' && s.tdMuted]} numberOfLines={1}>
                    {item.apartment_name || '(Unnamed)'}
                  </Text>
                </View>
                <View style={[{ flex: 2 }, s.nameCell]}>
                  <View style={[s.rowIcon, { backgroundColor: Colors.neutral[100] }]}>
                    <MapPin size={14} color={Colors.textTertiary} strokeWidth={1.8} />
                  </View>
                  <Text style={s.tdCell} numberOfLines={1}>
                    {localityMap.get(item.locality_id ?? '') ?? '—'}
                  </Text>
                </View>
                <View style={{ width: 100 }}>
                  <View style={[s.statusPill, item.status === 'active' ? s.statusActive : s.statusInactive]}>
                    <View style={[s.statusDot, item.status === 'active' ? s.statusDotActive : s.statusDotInactive]} />
                    <Text style={[s.statusText, item.status === 'active' ? s.statusTextActive : s.statusTextInactive]}>
                      {item.status === 'active' ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                </View>
                <View style={{ width: 120, flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity onPress={() => openEdit(item)} style={s.iconBtn}>
                    <Pencil size={14} color={Colors.textSecondary} strokeWidth={1.8} />
                  </TouchableOpacity>
                  <View style={s.switchWrap}>
                    <Switch
                      value={item.status === 'active'}
                      onValueChange={() => toggleStatus(item)}
                      trackColor={{ true: Colors.primary, false: Colors.neutral[200] }}
                      thumbColor={Colors.white}
                      style={s.rowSwitch}
                    />
                  </View>
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
              <View key={item.id} style={[s.card, item.status !== 'active' && s.cardInactive]}>
                <View style={s.cardTop}>
                  <View style={s.cardLeft}>
                    <View style={s.slBadge}>
                      <Text style={s.slText}>{i + 1}</Text>
                    </View>
                    <View style={s.cardInfo}>
                      <Text style={[s.cardName, item.status !== 'active' && s.textMuted]}>
                        {item.apartment_name || '(Unnamed)'}
                      </Text>
                      <View style={s.cardMeta}>
                        <MapPin size={11} color={Colors.textDisabled} strokeWidth={1.8} />
                        <Text style={s.cardLocality}>{localityMap.get(item.locality_id ?? '') ?? 'Unknown'}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={s.cardActions}>
                    <Switch
                      value={item.status === 'active'}
                      onValueChange={() => toggleStatus(item)}
                      trackColor={{ true: Colors.primary, false: Colors.neutral[200] }}
                      thumbColor={Colors.white}
                    />
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
                  <Building2 size={16} color={Colors.primary} strokeWidth={1.8} />
                </View>
                <Text style={s.modalTitle}>{editing ? 'Edit Apartment' : 'Add Apartment'}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowModal(false)} style={s.closeBtn}>
                <X size={16} color={Colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={s.modalScroll}>
              {/* Name field */}
              <View style={s.formGroup}>
                <Text style={s.label}>Apartment Name *</Text>
                <TextInput
                  style={s.input}
                  value={form.apartment_name}
                  onChangeText={v => setForm(p => ({ ...p, apartment_name: v }))}
                  placeholder="e.g. Royal Lagoon"
                  placeholderTextColor={Colors.textDisabled}
                />
              </View>

              {/* Locality dropdown */}
              <View style={s.formGroup}>
                <Text style={s.label}>Locality *</Text>
                {localities.length === 0 ? (
                  <View style={s.dropdownEmpty}>
                    <MapPin size={14} color={Colors.error} strokeWidth={1.8} />
                    <Text style={s.dropdownEmptyText}>No localities available. Add localities first.</Text>
                  </View>
                ) : (
                  <View style={s.dropdownContainer}>
                    <TouchableOpacity
                      style={[s.dropdownBtn, dropdownOpen && s.dropdownBtnOpen]}
                      onPress={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setDropdownOpen(o => !o);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={s.dropdownBtnLeft}>
                        <MapPin size={15} color={selectedLocality ? Colors.primary : Colors.textDisabled} strokeWidth={1.8} />
                        <Text
                          style={[s.dropdownBtnText, !selectedLocality && s.dropdownPlaceholder]}
                          numberOfLines={1}
                        >
                          {selectedLocality
                            ? `${selectedLocality.locality_name} (${selectedLocality.unique_code})`
                            : 'Select a locality'}
                        </Text>
                      </View>
                      <ChevronDown
                        size={16}
                        color={Colors.textTertiary}
                        strokeWidth={2}
                        style={{ transform: [{ rotate: dropdownOpen ? '180deg' : '0deg' }] }}
                      />
                    </TouchableOpacity>

                    {dropdownOpen && (
                      <View style={s.dropdownList}>
                        <ScrollView style={s.dropdownScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                          {localities.map(loc => {
                            const sel = form.locality_id === loc.unique_code;
                            return (
                              <TouchableOpacity
                                key={loc.id}
                                style={[s.dropdownItem, sel && s.dropdownItemActive]}
                                onPress={() => {
                                  setForm(p => ({ ...p, locality_id: loc.unique_code }));
                                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                  setDropdownOpen(false);
                                }}
                                activeOpacity={0.7}
                              >
                                <View style={s.dropdownItemLeft}>
                                  <MapPin size={14} color={sel ? Colors.primary : Colors.textTertiary} strokeWidth={1.8} />
                                  <Text style={[s.dropdownItemText, sel && s.dropdownItemTextActive]} numberOfLines={1}>
                                    {loc.locality_name}
                                  </Text>
                                </View>
                                <View style={s.dropdownItemRight}>
                                  <View style={[s.dropdownCodeBadge, sel && s.dropdownCodeBadgeActive]}>
                                    <Text style={[s.dropdownCodeText, sel && s.dropdownCodeTextActive]}>{loc.unique_code}</Text>
                                  </View>
                                  {sel && <Check size={14} color={Colors.primary} strokeWidth={2.5} />}
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                )}
              </View>

              <View style={s.switchRow}>
                <View>
                  <Text style={s.label}>Active</Text>
                  <Text style={s.switchHint}>Inactive apartments won't appear in dropdowns</Text>
                </View>
                <Switch
                  value={form.status === 'active'}
                  onValueChange={v => setForm(p => ({ ...p, status: v ? 'active' : 'inactive' }))}
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
              <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving} activeOpacity={0.85}>
                {saving ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <>
                    <Building2 size={14} color={Colors.white} strokeWidth={2} />
                    <Text style={s.saveBtnText}>{editing ? 'Save Changes' : 'Add Apartment'}</Text>
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
                <Text style={s.modalTitle}>Delete Apartment</Text>
              </View>
              <TouchableOpacity onPress={() => setDeleteTarget(null)} style={s.closeBtn}>
                <X size={16} color={Colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <Text style={s.deleteMsg}>
              Are you sure you want to delete{'\n'}
              <Text style={s.deleteName}>{deleteTarget?.apartment_name || '(Unnamed)'}</Text>?
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
  tabBar: { flexDirection: 'row', gap: Spacing[1] },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6, paddingHorizontal: Spacing[3],
    borderRadius: Radius.md, backgroundColor: Colors.neutral[100],
  },
  tabActive: { backgroundColor: Colors.primarySurface },
  tabText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary },
  tabTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  tabBadge: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: Colors.neutral[200], alignItems: 'center', justifyContent: 'center',
  },
  tabBadgeActive: { backgroundColor: Colors.primary + '30' },
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
  tdSl: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary },
  nameCell: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  rowIcon: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  tdPrimary: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary, flexShrink: 1 },
  tdMuted: { color: Colors.textTertiary },
  tdCell: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, flexShrink: 1 },

  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: Radius.full, alignSelf: 'flex-start',
  },
  statusActive: { backgroundColor: Colors.successSurface },
  statusInactive: { backgroundColor: Colors.neutral[100] },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusDotActive: { backgroundColor: Colors.success },
  statusDotInactive: { backgroundColor: Colors.textDisabled },
  statusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  statusTextActive: { color: Colors.success },
  statusTextInactive: { color: Colors.textDisabled },

  iconBtn: {
    width: 30, height: 30, borderRadius: Radius.sm,
    backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center',
  },
  iconBtnDanger: {
    width: 30, height: 30, borderRadius: Radius.sm,
    backgroundColor: Colors.errorSurface, alignItems: 'center', justifyContent: 'center',
  },
  switchWrap: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  rowSwitch: { transform: [{ scale: 0.85 }] },

  mobileList: { gap: Spacing[3] },
  card: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: Spacing[4], borderWidth: 1, borderColor: Colors.border,
    gap: Spacing[2], ...Shadow.sm,
  },
  cardInactive: { opacity: 0.6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  slBadge: {
    width: 32, height: 32, borderRadius: Radius.sm,
    backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center',
  },
  slText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 12, color: Colors.textTertiary },
  cardInfo: { flex: 1 },
  cardName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  textMuted: { color: Colors.textTertiary },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  cardLocality: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textDisabled },
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

  dropdownEmpty: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: Spacing[3], borderRadius: Radius.md,
    backgroundColor: Colors.errorSurface, borderWidth: 1, borderColor: Colors.error + '30',
  },
  dropdownEmptyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error, flexShrink: 1 },

  dropdownContainer: {},
  dropdownBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingVertical: Spacing[3], paddingHorizontal: Spacing[4],
    backgroundColor: Colors.neutral[50],
  },
  dropdownBtnOpen: { borderColor: Colors.primary, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 0 },
  dropdownBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flex: 1 },
  dropdownBtnText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary, flex: 1 },
  dropdownPlaceholder: { color: Colors.textDisabled },

  dropdownList: {
    borderWidth: 1, borderColor: Colors.primary, borderTopWidth: 0,
    borderBottomLeftRadius: Radius.md, borderBottomRightRadius: Radius.md,
    backgroundColor: Colors.white, overflow: 'hidden',
  },
  dropdownScroll: { maxHeight: 220 },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing[3], paddingHorizontal: Spacing[4],
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  dropdownItemActive: { backgroundColor: Colors.primarySurface },
  dropdownItemLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flex: 1 },
  dropdownItemText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, flex: 1 },
  dropdownItemTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  dropdownItemRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dropdownCodeBadge: {
    paddingVertical: 2, paddingHorizontal: 6, borderRadius: Radius.full,
    backgroundColor: Colors.neutral[100],
  },
  dropdownCodeBadgeActive: { backgroundColor: Colors.primary + '20' },
  dropdownCodeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.textTertiary },
  dropdownCodeTextActive: { color: Colors.primary },

  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: Spacing[3], paddingVertical: Spacing[3],
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  switchHint: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary, marginTop: 2 },

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
