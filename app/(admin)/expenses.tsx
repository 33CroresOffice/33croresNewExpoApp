import React, { useEffect, useState, useCallback } from 'react';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Platform, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Receipt, Plus, X, Pencil, ArrowLeft, Search, ChevronDown } from 'lucide-react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

type ExpenseCategory = 'delivery' | 'utilities' | 'salaries' | 'marketing' | 'packaging' | 'equipment' | 'rent' | 'miscellaneous' | 'other';
type ExpensePaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'cheque' | 'card';

interface Expense {
  id: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  expense_date: string;
  payment_method: ExpensePaymentMethod;
  vendor_name: string | null;
  notes: string;
  created_at: string;
}

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'delivery',      label: 'Delivery' },
  { value: 'utilities',     label: 'Utilities' },
  { value: 'salaries',      label: 'Salaries' },
  { value: 'marketing',     label: 'Marketing' },
  { value: 'packaging',     label: 'Packaging' },
  { value: 'equipment',     label: 'Equipment' },
  { value: 'rent',          label: 'Rent' },
  { value: 'miscellaneous', label: 'Miscellaneous' },
  { value: 'other',         label: 'Other' },
];

const PAYMENT_METHODS: { value: ExpensePaymentMethod; label: string }[] = [
  { value: 'cash',          label: 'Cash' },
  { value: 'upi',           label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque',        label: 'Cheque' },
  { value: 'card',          label: 'Card' },
];

const CAT_COLORS: Record<ExpenseCategory, string> = {
  delivery:      Colors.primary,
  utilities:     Colors.primaryLight,
  salaries:      Colors.accent,
  marketing:     Colors.secondary,
  packaging:     '#7B68EE',
  equipment:     Colors.secondaryLight,
  rent:          Colors.accentDark,
  miscellaneous: Colors.secondaryDark,
  other:         Colors.neutral[400],
};

const EMPTY_FORM = {
  amount: '',
  category: 'miscellaneous' as ExpenseCategory,
  description: '',
  expense_date: format(new Date(), 'yyyy-MM-dd'),
  payment_method: 'cash' as ExpensePaymentMethod,
  vendor_name: '',
  notes: '',
};

export default function ExpensesScreen() {
  return (
    <ModuleGuard module="finance">
      <ExpensesScreenContent />
    </ModuleGuard>
  );
}

function ExpensesScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { profile } = useAuthStore();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<ExpenseCategory | 'all'>('all');

  const load = useCallback(async () => {
    try {
      const { data } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false }).order('created_at', { ascending: false });
      if (data) setExpenses(data as Expense[]);
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
    setForm({ ...EMPTY_FORM, expense_date: format(new Date(), 'yyyy-MM-dd') });
    setError('');
    setShowModal(true);
  };

  const openEdit = (e: Expense) => {
    setEditing(e);
    setForm({ amount: String(e.amount), category: e.category, description: e.description, expense_date: e.expense_date, payment_method: e.payment_method, vendor_name: e.vendor_name ?? '', notes: e.notes });
    setError('');
    setShowModal(true);
  };

  const save = async () => {
    const amt = parseFloat(form.amount);
    if (!form.description.trim()) { setError('Description is required'); return; }
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount greater than 0'); return; }
    setSaving(true); setError('');
    const payload = {
      amount: amt,
      category: form.category,
      description: form.description.trim(),
      expense_date: form.expense_date,
      payment_method: form.payment_method,
      vendor_name: form.vendor_name.trim() || null,
      notes: form.notes.trim(),
      recorded_by: profile?.id ?? null,
    };
    const { error: err } = editing
      ? await supabase.from('expenses').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id)
      : await supabase.from('expenses').insert(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    if (!editing) {
      await supabase.from('finance_ledger').insert({
        entry_date: payload.expense_date,
        entry_type: 'debit',
        category: 'expense',
        amount: amt,
        description: payload.description,
        party_name: payload.vendor_name,
        payment_method: payload.payment_method,
        recorded_by: profile?.id ?? null,
      });
    }
    setShowModal(false);
    load();
  };

  const filtered = expenses.filter(e => {
    if (catFilter !== 'all' && e.category !== catFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return e.description.toLowerCase().includes(q) || (e.vendor_name ?? '').toLowerCase().includes(q) || e.category.toLowerCase().includes(q);
    }
    return true;
  });

  const totalFiltered = filtered.reduce((s, e) => s + Number(e.amount), 0);
  const totalAll = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const fmt = (n: number) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  const catLabel = (c: ExpenseCategory) => CATEGORIES.find(x => x.value === c)?.label ?? c;

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
            <Receipt size={isWeb ? 22 : 18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>Expenses</Text>
            <Text style={s.subtitle}>{fmt(totalAll)} total · {expenses.length} entries</Text>
          </View>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openCreate} activeOpacity={0.8}>
          <Plus size={16} color={Colors.white} strokeWidth={2} />
          <Text style={s.addBtnText}>Add Expense</Text>
        </TouchableOpacity>
      </View>

      <View style={[s.filterRow, isWeb && s.filterRowWeb]}>
        <View style={s.searchWrap}>
          <Search size={14} color={Colors.textTertiary} strokeWidth={1.8} />
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search expenses..." placeholderTextColor={Colors.textDisabled} />
        </View>
        {catFilter !== 'all' || search.trim() ? (
          <View style={s.filterTotal}>
            <Text style={s.filterTotalText}>{fmt(totalFiltered)}</Text>
          </View>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll} contentContainerStyle={s.catTabs}>
        <TouchableOpacity style={[s.catTab, catFilter === 'all' && s.catTabActive]} onPress={() => setCatFilter('all')}>
          <Text style={[s.catTabText, catFilter === 'all' && s.catTabTextActive]}>All ({expenses.length})</Text>
        </TouchableOpacity>
        {CATEGORIES.filter(c => expenses.some(e => e.category === c.value)).map(c => (
          <TouchableOpacity key={c.value} style={[s.catTab, catFilter === c.value && s.catTabActive, catFilter === c.value && { borderColor: CAT_COLORS[c.value] }]} onPress={() => setCatFilter(c.value)}>
            <View style={[s.catDot, { backgroundColor: CAT_COLORS[c.value] }]} />
            <Text style={[s.catTabText, catFilter === c.value && { color: CAT_COLORS[c.value], fontFamily: Typography.fontFamily.sansSemiBold }]}>
              {c.label} ({expenses.filter(e => e.category === c.value).length})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={Colors.primary} /></View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.content, isWeb && s.contentWeb]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          {isWeb ? (
            <View style={s.table}>
              <View style={s.tableHead}>
                <Text style={[s.thCell, { width: 90 }]}>Date</Text>
                <Text style={[s.thCell, { flex: 3 }]}>Description</Text>
                <Text style={[s.thCell, { width: 110 }]}>Category</Text>
                <Text style={[s.thCell, { width: 90 }]}>Method</Text>
                <Text style={[s.thCell, { flex: 2 }]}>Vendor</Text>
                <Text style={[s.thCell, { width: 100, textAlign: 'right' }]}>Amount</Text>
                <Text style={[s.thCell, { width: 40 }]}></Text>
              </View>
              {filtered.length === 0 ? (
                <View style={s.emptyState}>
                  <Receipt size={36} color={Colors.textDisabled} strokeWidth={1.2} />
                  <Text style={s.emptyTitle}>No expenses found</Text>
                </View>
              ) : (
                <>
                  {filtered.map((e, idx) => (
                    <View key={e.id} style={[s.tableRow, idx % 2 === 1 && s.tableRowAlt]}>
                      <Text style={[s.tdCell, { width: 90 }, s.tdDate]}>{format(new Date(e.expense_date), 'dd MMM yy')}</Text>
                      <View style={[s.tdCell, { flex: 3 }]}>
                        <Text style={s.tdPrimary} numberOfLines={1}>{e.description}</Text>
                        {e.notes ? <Text style={s.tdSub} numberOfLines={1}>{e.notes}</Text> : null}
                      </View>
                      <View style={[s.tdCell, { width: 110 }]}>
                        <View style={[s.catBadge, { backgroundColor: CAT_COLORS[e.category] + '20' }]}>
                          <View style={[s.catDot, { backgroundColor: CAT_COLORS[e.category] }]} />
                          <Text style={[s.catBadgeText, { color: CAT_COLORS[e.category] }]}>{catLabel(e.category)}</Text>
                        </View>
                      </View>
                      <Text style={[s.tdCell, { width: 90 }, s.tdSec]}>{PAYMENT_METHODS.find(m => m.value === e.payment_method)?.label ?? e.payment_method}</Text>
                      <Text style={[s.tdCell, { flex: 2 }, s.tdDate]} numberOfLines={1}>{e.vendor_name ?? '—'}</Text>
                      <Text style={[s.tdCell, { width: 100, textAlign: 'right' }, s.tdBold]}>{fmt(e.amount)}</Text>
                      <TouchableOpacity style={[s.tdCell, { width: 40, alignItems: 'center' }]} onPress={() => openEdit(e)}>
                        <Pencil size={14} color={Colors.textTertiary} strokeWidth={1.8} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <View style={s.tableFooter}>
                    <Text style={s.tableFooterLabel}>Total ({filtered.length} entries)</Text>
                    <Text style={s.tableFooterValue}>{fmt(totalFiltered)}</Text>
                  </View>
                </>
              )}
            </View>
          ) : (
            filtered.length === 0 ? (
              <View style={s.emptyState}>
                <Receipt size={36} color={Colors.textDisabled} strokeWidth={1.2} />
                <Text style={s.emptyTitle}>No expenses found</Text>
                <Text style={s.emptySub}>Tap "Add Expense" to record your first expense.</Text>
              </View>
            ) : (
              <>
                {filtered.map(e => (
                  <TouchableOpacity key={e.id} style={s.mobileCard} onPress={() => openEdit(e)} activeOpacity={0.8}>
                    <View style={[s.catIconCircle, { backgroundColor: CAT_COLORS[e.category] + '20' }]}>
                      <View style={[s.catDot, { backgroundColor: CAT_COLORS[e.category] }]} />
                    </View>
                    <View style={s.mobileCardMid}>
                      <Text style={s.mobileCardDesc} numberOfLines={1}>{e.description}</Text>
                      <View style={s.mobileCardMeta}>
                        <Text style={s.mobileCardCat}>{catLabel(e.category)}</Text>
                        <Text style={s.metaDot}>·</Text>
                        <Text style={s.mobileCardDate}>{format(new Date(e.expense_date), 'dd MMM yyyy')}</Text>
                        {e.vendor_name ? <><Text style={s.metaDot}>·</Text><Text style={s.mobileCardDate}>{e.vendor_name}</Text></> : null}
                      </View>
                    </View>
                    <Text style={s.mobileCardAmt}>{fmt(e.amount)}</Text>
                  </TouchableOpacity>
                ))}
                <View style={s.mobileTotalRow}>
                  <Text style={s.mobileTotalLabel}>Total</Text>
                  <Text style={s.mobileTotalValue}>{fmt(totalFiltered)}</Text>
                </View>
              </>
            )
          )}
        </ScrollView>
      )}

      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editing ? 'Edit Expense' : 'New Expense'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Field label="Amount (₹)" value={form.amount} onChange={v => setForm(p => ({ ...p, amount: v }))} placeholder="0.00" keyboardType="decimal-pad" />
              <Field label="Description" value={form.description} onChange={v => setForm(p => ({ ...p, description: v }))} placeholder="What was this expense for?" />
              <Field label="Date (YYYY-MM-DD)" value={form.expense_date} onChange={v => setForm(p => ({ ...p, expense_date: v }))} placeholder="2026-03-31" />
              <SelectField label="Category" options={CATEGORIES} value={form.category} onChange={v => setForm(p => ({ ...p, category: v as ExpenseCategory }))} />
              <SelectField label="Payment Method" options={PAYMENT_METHODS} value={form.payment_method} onChange={v => setForm(p => ({ ...p, payment_method: v as ExpensePaymentMethod }))} />
              <Field label="Vendor / Paid To" value={form.vendor_name} onChange={v => setForm(p => ({ ...p, vendor_name: v }))} placeholder="Name or business (optional)" />
              <Field label="Notes" value={form.notes} onChange={v => setForm(p => ({ ...p, notes: v }))} placeholder="Additional notes..." multiline />
              {error ? <Text style={s.errorText}>{error}</Text> : null}
            </ScrollView>
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveBtnText}>{editing ? 'Update' : 'Save Expense'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, multiline, keyboardType }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; keyboardType?: any }) {
  return (
    <View style={s.fieldGroup}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput style={[s.input, multiline && s.textarea]} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={Colors.textDisabled} multiline={multiline} numberOfLines={multiline ? 3 : 1} keyboardType={keyboardType} />
    </View>
  );
}

function SelectField({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);
  return (
    <View style={s.fieldGroup}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TouchableOpacity style={s.pickerBtn} onPress={() => setOpen(o => !o)}>
        <Text style={s.pickerValue}>{current?.label ?? value}</Text>
        <ChevronDown size={14} color={Colors.textTertiary} strokeWidth={1.8} />
      </TouchableOpacity>
      {open && (
        <View style={s.pickerDropdown}>
          {options.map(o => (
            <TouchableOpacity key={o.value} style={[s.pickerOption, o.value === value && s.pickerOptionActive]} onPress={() => { onChange(o.value); setOpen(false); }}>
              <Text style={[s.pickerOptionText, o.value === value && s.pickerOptionTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
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
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterRowWeb: { paddingHorizontal: Spacing[8] },
  searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.neutral[50], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2] },
  searchInput: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, outlineStyle: 'none' } as any,
  filterTotal: { paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], backgroundColor: Colors.primarySurface, borderRadius: Radius.md },
  filterTotalText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary },
  catScroll: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, maxHeight: 48, flexGrow: 0 },
  catTabs: { flexDirection: 'row', paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], gap: Spacing[2] },
  catTab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: Spacing[1], paddingHorizontal: Spacing[3], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  catTabActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  catDot: { width: 7, height: 7, borderRadius: 4 },
  catTabText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  catTabTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  scroll: { flex: 1 },
  content: { padding: Spacing[4] },
  contentWeb: { padding: Spacing[8], maxWidth: 1100, alignSelf: 'center', width: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  emptySub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 260 },
  table: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  tableHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], backgroundColor: Colors.neutral[50], borderBottomWidth: 1, borderBottomColor: Colors.border },
  thCell: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, paddingRight: Spacing[2] },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  tdCell: { paddingRight: Spacing[2] },
  tdPrimary: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  tdSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },
  tdSec: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tdBold: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  tdDate: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  catBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.full },
  catBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  tableFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.neutral[50] },
  tableFooterLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tableFooterValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary },
  mobileCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], marginBottom: Spacing[3], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  catIconCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  mobileCardMid: { flex: 1 },
  mobileCardDesc: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  mobileCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, flexWrap: 'wrap' },
  mobileCardCat: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textSecondary },
  metaDot: { color: Colors.textDisabled, fontSize: Typography.size.xs },
  mobileCardDate: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  mobileCardAmt: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary },
  mobileTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing[3], paddingHorizontal: Spacing[1], borderTopWidth: 1, borderTopColor: Colors.border, marginTop: Spacing[1] },
  mobileTotalLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  mobileTotalValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: Spacing[5] },
  modal: { width: '100%', maxHeight: '92%', backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[5], gap: Spacing[3] },
  modalWeb: { maxWidth: 500 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  fieldGroup: { gap: Spacing[1], marginBottom: Spacing[3] },
  fieldLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary, backgroundColor: Colors.neutral[50] },
  textarea: { minHeight: 72, textAlignVertical: 'top' },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], backgroundColor: Colors.neutral[50] },
  pickerValue: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary },
  pickerDropdown: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.white, marginTop: 2, overflow: 'hidden' },
  pickerOption: { paddingVertical: Spacing[3], paddingHorizontal: Spacing[4] },
  pickerOptionActive: { backgroundColor: Colors.primarySurface },
  pickerOptionText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary },
  pickerOptionTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error, marginBottom: Spacing[2] },
  modalFooter: { flexDirection: 'row', gap: Spacing[3], paddingTop: Spacing[2] },
  cancelBtn: { flex: 1, paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  saveBtn: { flex: 2, paddingVertical: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  saveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
});
