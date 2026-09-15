import React, { useEffect, useState } from 'react';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Platform, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CalendarDays, ArrowLeft, Plus, X, Pencil, Trash2,
  AlertTriangle, Check, RefreshCw, ChevronLeft, ChevronRight,
} from 'lucide-react-native';
import { router } from 'expo-router';
import { format, addDays, subDays, parseISO, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, getDay } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { FlowerType, FlowerAvailability, UnitType } from '@/types/database';

const UNIT_OPTIONS: UnitType[] = ['bunch', 'stems', 'pieces', 'dozen', 'kg', 'grams'];

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function FlowerAvailabilityScreen() {
  return (
    <ModuleGuard module="catalog">
      <FlowerAvailabilityScreenContent />
    </ModuleGuard>
  );
}

function FlowerAvailabilityScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [flowerTypes, setFlowerTypes] = useState<FlowerType[]>([]);
  const [availabilityRules, setAvailabilityRules] = useState<FlowerAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMonth, setViewMonth] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FlowerAvailability | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedFlowerId, setSelectedFlowerId] = useState<string | null>(null);

  const [form, setForm] = useState({
    flower_type_id: '',
    unavailable_from: new Date() as Date | null,
    unavailable_to: new Date() as Date | null,
    alternate_flower_type_id: '' as string,
    alternate_quantity: '' as string,
    alternate_unit_type: 'bunch' as string,
    reason: '' as string,
  });

  const load = async () => {
    try {
      const [ftRes, avRes] = await Promise.all([
        supabase.from('flower_types').select('*').eq('is_active', true).order('sort_order').order('display_name'),
        supabase.from('flower_availability')
          .select('*, flower_type:flower_types!flower_availability_flower_type_id_fkey(display_name, unit_type), alternate_flower_type:flower_types!flower_availability_alternate_flower_type_id_fkey(display_name)')
          .order('unavailable_from', { ascending: false }),
      ]);
      if (ftRes.data) setFlowerTypes(ftRes.data);
      if (avRes.data) setAvailabilityRules(avRes.data as any[]);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  usePageVisibility(load);
  useEffect(() => { load(); }, []);

  const openCreate = (flowerId?: string) => {
    setEditing(null);
    const today = new Date();
    setForm({
      flower_type_id: flowerId ?? '',
      unavailable_from: today,
      unavailable_to: today,
      alternate_flower_type_id: '',
      alternate_quantity: '',
      alternate_unit_type: 'bunch',
      reason: '',
    });
    setError('');
    setShowModal(true);
  };

  const openEdit = (rule: FlowerAvailability) => {
    setEditing(rule);
    setForm({
      flower_type_id: rule.flower_type_id,
      unavailable_from: parseISO(rule.unavailable_from),
      unavailable_to: parseISO(rule.unavailable_to),
      alternate_flower_type_id: rule.alternate_flower_type_id ?? '',
      alternate_quantity: rule.alternate_quantity != null ? String(rule.alternate_quantity) : '',
      alternate_unit_type: rule.alternate_unit_type ?? 'bunch',
      reason: rule.reason ?? '',
    });
    setError('');
    setShowModal(true);
  };

  const save = async () => {
    if (!form.flower_type_id) { setError('Select a flower'); return; }
    if (!form.unavailable_from || !form.unavailable_to) { setError('Set both dates'); return; }
    if (form.unavailable_to < form.unavailable_from) { setError('End date must be after start date'); return; }
    setSaving(true);
    setError('');

    const payload = {
      flower_type_id: form.flower_type_id,
      unavailable_from: format(form.unavailable_from, 'yyyy-MM-dd'),
      unavailable_to: format(form.unavailable_to, 'yyyy-MM-dd'),
      alternate_flower_type_id: form.alternate_flower_type_id || null,
      alternate_quantity: form.alternate_quantity ? parseFloat(form.alternate_quantity) : null,
      alternate_unit_type: form.alternate_quantity ? form.alternate_unit_type : null,
      reason: form.reason.trim() || null,
    };

    const { error: err } = editing
      ? await supabase.from('flower_availability').update(payload).eq('id', editing.id)
      : await supabase.from('flower_availability').insert(payload);

    setSaving(false);
    if (err) { setError(err.message); return; }
    setShowModal(false);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from('flower_availability').delete().eq('id', id);
    load();
  };

  // Calendar rendering
  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const calStart = subDays(monthStart, getDay(monthStart));
  const calEnd = addDays(monthEnd, 6 - getDay(monthEnd));
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  const isFlowerUnavailableOn = (flowerId: string, day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return availabilityRules.some(r =>
      r.flower_type_id === flowerId &&
      r.unavailable_from <= dayStr &&
      r.unavailable_to >= dayStr
    );
  };

  const getSubstituteFor = (flowerId: string, day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    const rule = availabilityRules.find(r =>
      r.flower_type_id === flowerId &&
      r.unavailable_from <= dayStr &&
      r.unavailable_to >= dayStr
    );
    if (!rule) return null;
    return rule.alternate_flower_type_id
      ? (rule as any).alternate_flower_type?.display_name ?? 'Substitute set'
      : 'No substitute';
  };

  const activeRules = selectedFlowerId
    ? availabilityRules.filter(r => r.flower_type_id === selectedFlowerId)
    : availabilityRules;

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
            <CalendarDays size={isWeb ? 20 : 18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>Flower Availability</Text>
            <Text style={s.subtitle}>{availabilityRules.length} unavailability rules</Text>
          </View>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => openCreate()} activeOpacity={0.85}>
          <Plus size={15} color={Colors.white} strokeWidth={2.5} />
          <Text style={s.addBtnText}>Add Rule</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, isWeb && s.contentWeb]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Flower filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.flowerChips}>
          <TouchableOpacity
            style={[s.chip, !selectedFlowerId && s.chipActive]}
            onPress={() => setSelectedFlowerId(null)}
          >
            <Text style={[s.chipText, !selectedFlowerId && s.chipTextActive]}>All Flowers</Text>
          </TouchableOpacity>
          {flowerTypes.map(ft => {
            const hasRules = availabilityRules.some(r => r.flower_type_id === ft.id);
            return (
              <TouchableOpacity
                key={ft.id}
                style={[s.chip, selectedFlowerId === ft.id && s.chipActive, hasRules && !selectedFlowerId && s.chipHasRules]}
                onPress={() => setSelectedFlowerId(ft.id)}
              >
                <Text style={[s.chipText, selectedFlowerId === ft.id && s.chipTextActive]}>{ft.display_name}</Text>
                {hasRules && <View style={s.chipDot} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Calendar */}
        <View style={s.calendarCard}>
          <View style={s.calHeader}>
            <TouchableOpacity onPress={() => setViewMonth(d => subDays(d, 30))} style={s.calArrow}>
              <ChevronLeft size={20} color={Colors.textSecondary} strokeWidth={1.8} />
            </TouchableOpacity>
            <Text style={s.calMonthLabel}>{format(viewMonth, 'MMMM yyyy')}</Text>
            <TouchableOpacity onPress={() => setViewMonth(d => addDays(d, 30))} style={s.calArrow}>
              <ChevronRight size={20} color={Colors.textSecondary} strokeWidth={1.8} />
            </TouchableOpacity>
          </View>

          <View style={s.calWeekHeader}>
            {WEEKDAY_LABELS.map(d => (
              <Text key={d} style={s.calWeekLabel}>{d}</Text>
            ))}
          </View>

          <View style={s.calGrid}>
            {calDays.map((day, i) => {
              const inMonth = isSameMonth(day, viewMonth);
              const isToday = isSameDay(day, new Date());
              const flowersToShow = selectedFlowerId
                ? flowerTypes.filter(ft => ft.id === selectedFlowerId)
                : flowerTypes.slice(0, 6);
              const unavailableFlowers = flowersToShow.filter(ft => isFlowerUnavailableOn(ft.id, day));
              return (
                <View
                  key={i}
                  style={[
                    s.calDay,
                    !inMonth && s.calDayOut,
                    isToday && s.calDayToday,
                  ]}
                >
                  <Text style={[s.calDayNum, !inMonth && s.calDayNumOut, isToday && s.calDayNumToday]}>
                    {format(day, 'd')}
                  </Text>
                  {unavailableFlowers.length > 0 && (
                    <View style={s.calDayBadges}>
                      {unavailableFlowers.slice(0, 3).map(ft => (
                        <View key={ft.id} style={s.calDayBadge}>
                          <View style={s.calDayBadgeDot} />
                          <Text style={s.calDayBadgeText} numberOfLines={1}>
                            {ft.display_name}
                          </Text>
                        </View>
                      ))}
                      {unavailableFlowers.length > 3 && (
                        <Text style={s.calDayMoreText}>+{unavailableFlowers.length - 3}</Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* Legend */}
        <View style={s.legend}>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: Colors.success }]} />
            <Text style={s.legendText}>Available</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: Colors.error }]} />
            <Text style={s.legendText}>Unavailable</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: Colors.warning }]} />
            <Text style={s.legendText}>Substituted</Text>
          </View>
        </View>

        {/* Rules list */}
        <Text style={s.sectionTitle}>Unavailability Rules</Text>
        {loading ? (
          <View style={s.center}><ActivityIndicator color={Colors.primary} /></View>
        ) : activeRules.length === 0 ? (
          <View style={s.emptyState}>
            <CalendarDays size={40} color={Colors.textDisabled} strokeWidth={1.2} />
            <Text style={s.emptyTitle}>No availability rules</Text>
            <Text style={s.emptySub}>Mark flowers as unavailable for specific periods and set alternates.</Text>
          </View>
        ) : (
          <View style={s.rulesList}>
            {activeRules.map((rule, i) => {
              const ft = (rule as any).flower_type;
              const alt = (rule as any).alternate_flower_type;
              return (
                <View key={rule.id} style={[s.ruleCard, i % 2 === 1 && s.ruleCardAlt]}>
                  <View style={s.ruleInfo}>
                    <Text style={s.ruleFlowerName}>{ft?.display_name ?? 'Unknown'}</Text>
                    <Text style={s.ruleDates}>
                      {format(parseISO(rule.unavailable_from), 'dd MMM yyyy')} → {format(parseISO(rule.unavailable_to), 'dd MMM yyyy')}
                    </Text>
                    {alt ? (
                      <View style={s.ruleAltRow}>
                        <Text style={s.ruleAltLabel}>Substitute:</Text>
                        <Text style={s.ruleAltValue}>
                          {alt.display_name}
                          {rule.alternate_quantity ? ` (${rule.alternate_quantity} ${rule.alternate_unit_type ?? ''})` : ''}
                        </Text>
                      </View>
                    ) : (
                      <View style={s.ruleNoAltRow}>
                        <AlertTriangle size={12} color={Colors.warning} strokeWidth={2} />
                        <Text style={s.ruleNoAltText}>No substitute assigned</Text>
                      </View>
                    )}
                    {rule.reason ? <Text style={s.ruleReason}>{rule.reason}</Text> : null}
                  </View>
                  <View style={s.ruleActions}>
                    <TouchableOpacity style={s.ruleActionBtn} onPress={() => openEdit(rule)}>
                      <Pencil size={14} color={Colors.primary} strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.ruleActionBtn} onPress={() => remove(rule.id)}>
                      <Trash2 size={14} color={Colors.error} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, isWeb && s.modalCardWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editing ? 'Edit Rule' : 'New Availability Rule'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)} style={s.modalClose}>
                <X size={20} color={Colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <ScrollView style={s.modalScroll} showsVerticalScrollIndicator={false}>
              {/* Flower selector */}
              <Text style={s.fieldLabel}>Flower</Text>
              <View style={s.flowerPickerRow}>
                {flowerTypes.map(ft => {
                  const selected = form.flower_type_id === ft.id;
                  return (
                    <TouchableOpacity
                      key={ft.id}
                      style={[s.flowerPickerChip, selected && s.flowerPickerChipActive]}
                      onPress={() => setForm(p => ({ ...p, flower_type_id: ft.id }))}
                    >
                      <Text style={[s.flowerPickerChipText, selected && s.flowerPickerChipTextActive]}>
                        {ft.display_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Date range */}
              <View style={s.dateRow}>
                <View style={s.dateCol}>
                  <Text style={s.fieldLabel}>Unavailable From</Text>
                  <DatePickerButton value={form.unavailable_from} onChange={(d) => setForm(p => ({ ...p, unavailable_from: d }))} />
                </View>
                <View style={s.dateCol}>
                  <Text style={s.fieldLabel}>Unavailable To</Text>
                  <DatePickerButton value={form.unavailable_to} onChange={(d) => setForm(p => ({ ...p, unavailable_to: d }))} />
                </View>
              </View>

              {/* Quick range buttons */}
              <View style={s.quickRangeRow}>
                <TouchableOpacity style={s.quickRangeBtn} onPress={() => {
                  const today = new Date();
                  setForm(p => ({ ...p, unavailable_from: today, unavailable_to: addDays(today, 7) }));
                }}>
                  <Text style={s.quickRangeText}>1 Week</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.quickRangeBtn} onPress={() => {
                  const today = new Date();
                  setForm(p => ({ ...p, unavailable_from: today, unavailable_to: addDays(today, 30) }));
                }}>
                  <Text style={s.quickRangeText}>1 Month</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.quickRangeBtn} onPress={() => {
                  const today = new Date();
                  setForm(p => ({ ...p, unavailable_from: today, unavailable_to: addMonths(today, 3) }));
                }}>
                  <Text style={s.quickRangeText}>3 Months</Text>
                </TouchableOpacity>
              </View>

              {/* Alternate flower */}
              <Text style={s.fieldLabel}>Alternate Flower (Optional)</Text>
              <View style={s.flowerPickerRow}>
                <TouchableOpacity
                  style={[s.flowerPickerChip, !form.alternate_flower_type_id && s.flowerPickerChipActive]}
                  onPress={() => setForm(p => ({ ...p, alternate_flower_type_id: '' }))}
                >
                  <Text style={[s.flowerPickerChipText, !form.alternate_flower_type_id && s.flowerPickerChipTextActive]}>
                    None
                  </Text>
                </TouchableOpacity>
                {flowerTypes.filter(ft => ft.id !== form.flower_type_id).map(ft => {
                  const selected = form.alternate_flower_type_id === ft.id;
                  return (
                    <TouchableOpacity
                      key={ft.id}
                      style={[s.flowerPickerChip, selected && s.flowerPickerChipActive]}
                      onPress={() => setForm(p => ({ ...p, alternate_flower_type_id: ft.id }))}
                    >
                      <Text style={[s.flowerPickerChipText, selected && s.flowerPickerChipTextActive]}>
                        {ft.display_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Alternate quantity */}
              {form.alternate_flower_type_id ? (
                <View style={s.altQtyRow}>
                  <View style={s.altQtyCol}>
                    <Text style={s.fieldLabel}>Alt. Quantity</Text>
                    <TextInput
                      style={s.textInput}
                      value={form.alternate_quantity}
                      onChangeText={v => setForm(p => ({ ...p, alternate_quantity: v }))}
                      placeholder="e.g. 2"
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={s.altQtyCol}>
                    <Text style={s.fieldLabel}>Alt. Unit</Text>
                    <View style={s.unitPickerRow}>
                      {UNIT_OPTIONS.map(u => (
                        <TouchableOpacity
                          key={u}
                          style={[s.unitChip, form.alternate_unit_type === u && s.unitChipActive]}
                          onPress={() => setForm(p => ({ ...p, alternate_unit_type: u }))}
                        >
                          <Text style={[s.unitChipText, form.alternate_unit_type === u && s.unitChipTextActive]}>{u}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              ) : null}

              {/* Reason */}
              <Text style={s.fieldLabel}>Reason (Optional)</Text>
              <TextInput
                style={[s.textInput, s.textInputMultiline]}
                value={form.reason}
                onChangeText={v => setForm(p => ({ ...p, reason: v }))}
                placeholder="e.g. Off-season, supply disruption..."
                multiline
              />

              {error ? <Text style={s.errorText}>{error}</Text> : null}
            </ScrollView>

            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, saving && s.saveBtnDisabled]} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveBtnText}>{editing ? 'Update' : 'Create'} Rule</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DatePickerButton({ value, onChange }: { value: Date | null; onChange: (d: Date) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <TouchableOpacity style={s.datePickerBtn} onPress={() => setOpen(o => !o)}>
      <Text style={s.datePickerText}>{value ? format(value, 'dd MMM yyyy') : 'Select date'}</Text>
      {open && (
        <View style={s.datePickerPopup}>
          <View style={s.datePickerNav}>
            <TouchableOpacity onPress={() => onChange(subDays(value ?? new Date(), 1))}>
              <ChevronLeft size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={s.datePickerMonth}>{value ? format(value, 'MMMM yyyy') : format(new Date(), 'MMMM yyyy')}</Text>
            <TouchableOpacity onPress={() => onChange(addDays(value ?? new Date(), 1))}>
              <ChevronRight size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => { setOpen(false); }} style={s.datePickerDoneBtn}>
            <Text style={s.datePickerDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing[3] },
  headerWeb: { paddingHorizontal: Spacing[8], paddingVertical: Spacing[5] },
  backBtn: { padding: Spacing[1] },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  headerIcon: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  titleWeb: { fontSize: Typography.size['2xl'] },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.primary, paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], borderRadius: Radius.full },
  addBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  scroll: { flex: 1 },
  content: { padding: Spacing[5], gap: Spacing[4] },
  contentWeb: { padding: Spacing[8], maxWidth: 1100, alignSelf: 'center', width: '100%' },
  flowerChips: { maxHeight: 50 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1], paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], borderRadius: Radius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, marginRight: Spacing[2] },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipHasRules: { borderColor: Colors.warning + '60' },
  chipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },
  chipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.warning },
  calendarCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing[4], ...Shadow.sm },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[3] },
  calArrow: { padding: Spacing[2] },
  calMonthLabel: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary },
  calWeekHeader: { flexDirection: 'row', marginBottom: Spacing[2] },
  calWeekLabel: { flex: 1, textAlign: 'center', fontFamily: Typography.fontFamily.sansMedium, fontSize: 10, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calDay: { width: '14.28%', minHeight: 60, borderWidth: 0.5, borderColor: Colors.divider, padding: 4 },
  calDayOut: { backgroundColor: Colors.neutral[50] },
  calDayToday: { backgroundColor: Colors.primarySurface + '40' },
  calDayNum: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textPrimary },
  calDayNumOut: { color: Colors.textDisabled },
  calDayNumToday: { fontFamily: Typography.fontFamily.bold, color: Colors.primary },
  calDayBadges: { marginTop: 2, gap: 2 },
  calDayBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.errorSurface, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  calDayBadgeDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.error },
  calDayBadgeText: { fontSize: 8, fontFamily: Typography.fontFamily.sansMedium, color: Colors.error, flexShrink: 1 },
  calDayMoreText: { fontSize: 8, fontFamily: Typography.fontFamily.sansMedium, color: Colors.textTertiary, paddingLeft: 4 },
  legend: { flexDirection: 'row', gap: Spacing[4], paddingHorizontal: Spacing[2] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  sectionTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary, marginTop: Spacing[2] },
  center: { paddingTop: 40, alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  emptySub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 300 },
  rulesList: { gap: Spacing[2] },
  ruleCard: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing[4], alignItems: 'flex-start', ...Shadow.sm },
  ruleCardAlt: { backgroundColor: Colors.neutral[50] },
  ruleInfo: { flex: 1, gap: Spacing[1] },
  ruleFlowerName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  ruleDates: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  ruleAltRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1], marginTop: 2 },
  ruleAltLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textTertiary },
  ruleAltValue: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.success },
  ruleNoAltRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1], marginTop: 2 },
  ruleNoAltText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.warning },
  ruleReason: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  ruleActions: { flexDirection: 'row', gap: 4 },
  ruleActionBtn: { width: 30, height: 30, borderRadius: Radius.sm, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, width: '90%', maxHeight: '85%' },
  modalCardWeb: { width: 600, maxWidth: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  modalClose: { padding: Spacing[1] },
  modalScroll: { padding: Spacing[5], maxHeight: 500 },
  fieldLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textTertiary, marginBottom: Spacing[2], marginTop: Spacing[3], textTransform: 'uppercase', letterSpacing: 0.5 },
  flowerPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  flowerPickerChip: { paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], borderRadius: Radius.full, backgroundColor: Colors.neutral[50], borderWidth: 1, borderColor: Colors.border },
  flowerPickerChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  flowerPickerChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  flowerPickerChipTextActive: { color: Colors.white },
  dateRow: { flexDirection: 'row', gap: Spacing[3] },
  dateCol: { flex: 1 },
  datePickerBtn: { backgroundColor: Colors.neutral[50], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], position: 'relative' },
  datePickerText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  datePickerPopup: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.md, zIndex: 10, padding: Spacing[3] },
  datePickerNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[2] },
  datePickerMonth: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  datePickerDoneBtn: { alignItems: 'center', paddingVertical: Spacing[2], backgroundColor: Colors.primarySurface, borderRadius: Radius.sm, marginTop: Spacing[2] },
  datePickerDoneText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary },
  quickRangeRow: { flexDirection: 'row', gap: Spacing[2], marginTop: Spacing[2] },
  quickRangeBtn: { paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], borderRadius: Radius.sm, backgroundColor: Colors.primarySurface },
  quickRangeText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.primary },
  altQtyRow: { flexDirection: 'row', gap: Spacing[3] },
  altQtyCol: { flex: 1 },
  unitPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[1] },
  unitChip: { paddingHorizontal: Spacing[2], paddingVertical: Spacing[1], borderRadius: Radius.sm, backgroundColor: Colors.neutral[50], borderWidth: 1, borderColor: Colors.border },
  unitChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  unitChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 10, color: Colors.textSecondary },
  unitChipTextActive: { color: Colors.white },
  textInput: { backgroundColor: Colors.neutral[50], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  textInputMultiline: { minHeight: 60, textAlignVertical: 'top' },
  errorText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.error, marginTop: Spacing[3] },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing[3], paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], borderTopWidth: 1, borderTopColor: Colors.border },
  cancelBtn: { paddingVertical: Spacing[3], paddingHorizontal: Spacing[5], borderRadius: Radius.md },
  cancelBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  saveBtn: { backgroundColor: Colors.primary, paddingVertical: Spacing[3], paddingHorizontal: Spacing[5], borderRadius: Radius.md, minWidth: 100, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
});
