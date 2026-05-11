import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Platform, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChartPie as PieChart, ArrowLeft, Plus, X, ArrowUpRight, ArrowDownRight, Search, ChevronDown } from 'lucide-react-native';
import { router } from 'expo-router';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

type LedgerEntryType = 'credit' | 'debit';
type LedgerCategory = 'subscription_payment' | 'vendor_payment' | 'expense' | 'refund' | 'adjustment' | 'other';

interface LedgerEntry {
  id: string;
  entry_date: string;
  entry_type: LedgerEntryType;
  category: LedgerCategory;
  amount: number;
  description: string;
  party_name: string | null;
  payment_method: string | null;
  created_at: string;
}

const CATEGORIES: { value: LedgerCategory; label: string }[] = [
  { value: 'subscription_payment', label: 'Subscription Payment' },
  { value: 'vendor_payment',       label: 'Vendor Payment' },
  { value: 'expense',              label: 'Expense' },
  { value: 'refund',               label: 'Refund' },
  { value: 'adjustment',           label: 'Adjustment' },
  { value: 'other',                label: 'Other' },
];

const CAT_COLORS: Record<LedgerCategory, string> = {
  subscription_payment: Colors.primary,
  vendor_payment:       Colors.warning,
  expense:              Colors.secondary,
  refund:               Colors.error,
  adjustment:           Colors.accent,
  other:                Colors.neutral[400],
};

const PERIOD_OPTIONS = [
  { label: 'This Month', value: 0 },
  { label: 'Last Month', value: 1 },
  { label: '3 Months',   value: 3 },
  { label: 'All Time',   value: -1 },
];

const EMPTY_FORM = {
  entry_date: format(new Date(), 'yyyy-MM-dd'),
  entry_type: 'debit' as LedgerEntryType,
  category: 'other' as LedgerCategory,
  amount: '',
  description: '',
  party_name: '',
  payment_method: '',
};

export default function LedgerScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { profile } = useAuthStore();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<LedgerEntryType | 'all'>('all');
  const [period, setPeriod] = useState(0);

  const load = useCallback(async () => {
    try {
      let query = supabase.from('finance_ledger').select('*').order('entry_date', { ascending: false }).order('created_at', { ascending: false });
      if (period !== -1) {
        const now = new Date();
        const from = format(startOfMonth(subMonths(now, period)), 'yyyy-MM-dd');
        const to = period === 0 ? format(now, 'yyyy-MM-dd') : format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');
        query = query.gte('entry_date', from).lte('entry_date', to);
      }
      const { data } = await query.limit(500);
      if (data) setEntries(data as LedgerEntry[]);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const amt = parseFloat(form.amount);
    if (!form.description.trim()) { setError('Description is required'); return; }
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount'); return; }
    setSaving(true); setError('');
    const { error: err } = await supabase.from('finance_ledger').insert({
      entry_date: form.entry_date,
      entry_type: form.entry_type,
      category: form.category,
      amount: amt,
      description: form.description.trim(),
      party_name: form.party_name.trim() || null,
      payment_method: form.payment_method.trim() || null,
      recorded_by: profile?.id ?? null,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setShowModal(false);
    load();
  };

  const filtered = entries.filter(e => {
    if (typeFilter !== 'all' && e.entry_type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return e.description.toLowerCase().includes(q) || (e.party_name ?? '').toLowerCase().includes(q) || e.category.toLowerCase().includes(q);
    }
    return true;
  });

  const totalCredit = filtered.filter(e => e.entry_type === 'credit').reduce((s, e) => s + Number(e.amount), 0);
  const totalDebit = filtered.filter(e => e.entry_type === 'debit').reduce((s, e) => s + Number(e.amount), 0);
  const balance = totalCredit - totalDebit;
  const fmt = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  const catLabel = (c: LedgerCategory) => CATEGORIES.find(x => x.value === c)?.label ?? c;

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
            <PieChart size={isWeb ? 22 : 18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>Ledger</Text>
            <Text style={s.subtitle}>All financial transactions</Text>
          </View>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => { setForm({ ...EMPTY_FORM, entry_date: format(new Date(), 'yyyy-MM-dd') }); setError(''); setShowModal(true); }} activeOpacity={0.8}>
          <Plus size={16} color={Colors.white} strokeWidth={2} />
          <Text style={s.addBtnText}>Add Entry</Text>
        </TouchableOpacity>
      </View>

      <View style={[s.balanceRow, isWeb && s.balanceRowWeb]}>
        <View style={s.balancePill}>
          <Text style={s.balancePillLabel}>Total Credit</Text>
          <Text style={[s.balancePillValue, { color: Colors.success }]}>{fmt(totalCredit)}</Text>
        </View>
        <View style={s.balancePill}>
          <Text style={s.balancePillLabel}>Total Debit</Text>
          <Text style={[s.balancePillValue, { color: Colors.error }]}>{fmt(totalDebit)}</Text>
        </View>
        <View style={[s.balancePill, s.balancePillMain, { borderColor: balance >= 0 ? Colors.primary : Colors.error }]}>
          <Text style={s.balancePillLabel}>Net Balance</Text>
          <Text style={[s.balancePillValue, { color: balance >= 0 ? Colors.primary : Colors.error }]}>
            {balance >= 0 ? '+' : '−'}{fmt(balance)}
          </Text>
        </View>
      </View>

      <View style={[s.controlsRow, isWeb && s.controlsRowWeb]}>
        <View style={s.searchWrap}>
          <Search size={14} color={Colors.textTertiary} strokeWidth={1.8} />
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search entries..." placeholderTextColor={Colors.textDisabled} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.periodPills}>
          {PERIOD_OPTIONS.map(p => (
            <TouchableOpacity key={p.value} style={[s.periodPill, period === p.value && s.periodPillActive]} onPress={() => setPeriod(p.value)}>
              <Text style={[s.periodPillText, period === p.value && s.periodPillTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={s.typeTabs}>
        {([{ label: 'All', value: 'all' }, { label: 'Credits', value: 'credit' }, { label: 'Debits', value: 'debit' }] as const).map((t: any) => (
          <TouchableOpacity key={t.value} style={[s.typeTab, typeFilter === t.value && s.typeTabActive]} onPress={() => setTypeFilter(t.value)}>
            <Text style={[s.typeTabText, typeFilter === t.value && s.typeTabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

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
                <Text style={[s.thCell, { width: 140 }]}>Category</Text>
                <Text style={[s.thCell, { flex: 2 }]}>Party</Text>
                <Text style={[s.thCell, { width: 70, textAlign: 'center' }]}>Type</Text>
                <Text style={[s.thCell, { width: 100, textAlign: 'right' }]}>Amount</Text>
              </View>
              {filtered.length === 0 ? (
                <View style={s.emptyState}>
                  <PieChart size={36} color={Colors.textDisabled} strokeWidth={1.2} />
                  <Text style={s.emptyTitle}>No entries found</Text>
                </View>
              ) : (
                <>
                  {filtered.map((e, idx) => (
                    <View key={e.id} style={[s.tableRow, idx % 2 === 1 && s.tableRowAlt]}>
                      <Text style={[s.tdCell, { width: 90 }, s.tdDate]}>{format(new Date(e.entry_date), 'dd MMM yy')}</Text>
                      <Text style={[s.tdCell, { flex: 3 }, s.tdPrimary]} numberOfLines={1}>{e.description}</Text>
                      <View style={[s.tdCell, { width: 140 }]}>
                        <View style={[s.catBadge, { backgroundColor: CAT_COLORS[e.category] + '18' }]}>
                          <View style={[s.catDot, { backgroundColor: CAT_COLORS[e.category] }]} />
                          <Text style={[s.catBadgeText, { color: CAT_COLORS[e.category] }]} numberOfLines={1}>{catLabel(e.category)}</Text>
                        </View>
                      </View>
                      <Text style={[s.tdCell, { flex: 2 }, s.tdSec]} numberOfLines={1}>{e.party_name ?? '—'}</Text>
                      <View style={[s.tdCell, { width: 70, alignItems: 'center' }]}>
                        <View style={[s.typeBadge, { backgroundColor: e.entry_type === 'credit' ? '#E8F5E9' : '#FFEBEE' }]}>
                          {e.entry_type === 'credit'
                            ? <ArrowUpRight size={11} color={Colors.success} strokeWidth={2.2} />
                            : <ArrowDownRight size={11} color={Colors.error} strokeWidth={2.2} />}
                          <Text style={[s.typeBadgeText, { color: e.entry_type === 'credit' ? Colors.success : Colors.error }]}>
                            {e.entry_type === 'credit' ? 'In' : 'Out'}
                          </Text>
                        </View>
                      </View>
                      <Text style={[s.tdCell, { width: 100, textAlign: 'right', fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: e.entry_type === 'credit' ? Colors.success : Colors.error }]}>
                        {e.entry_type === 'credit' ? '+' : '−'}{fmt(e.amount)}
                      </Text>
                    </View>
                  ))}
                  <View style={s.tableFooter}>
                    <Text style={s.tableFooterLabel}>{filtered.length} entries · Net</Text>
                    <Text style={[s.tableFooterValue, { color: balance >= 0 ? Colors.success : Colors.error }]}>
                      {balance >= 0 ? '+' : '−'}{fmt(balance)}
                    </Text>
                  </View>
                </>
              )}
            </View>
          ) : (
            filtered.length === 0 ? (
              <View style={s.emptyState}>
                <PieChart size={36} color={Colors.textDisabled} strokeWidth={1.2} />
                <Text style={s.emptyTitle}>No entries found</Text>
              </View>
            ) : (
              filtered.map(e => (
                <View key={e.id} style={s.mobileCard}>
                  <View style={[s.mobileCardIcon, { backgroundColor: e.entry_type === 'credit' ? '#E8F5E9' : '#FFEBEE' }]}>
                    {e.entry_type === 'credit'
                      ? <ArrowUpRight size={16} color={Colors.success} strokeWidth={2} />
                      : <ArrowDownRight size={16} color={Colors.error} strokeWidth={2} />}
                  </View>
                  <View style={s.mobileCardContent}>
                    <Text style={s.mobileCardDesc} numberOfLines={1}>{e.description}</Text>
                    <View style={s.mobileCardMeta}>
                      <View style={[s.catBadge, { backgroundColor: CAT_COLORS[e.category] + '18' }]}>
                        <View style={[s.catDot, { backgroundColor: CAT_COLORS[e.category] }]} />
                        <Text style={[s.catBadgeText, { color: CAT_COLORS[e.category] }]}>{catLabel(e.category)}</Text>
                      </View>
                      <Text style={s.mobileCardDate}>{format(new Date(e.entry_date), 'dd MMM yy')}</Text>
                    </View>
                    {e.party_name ? <Text style={s.mobileCardParty}>{e.party_name}</Text> : null}
                  </View>
                  <Text style={[s.mobileCardAmt, { color: e.entry_type === 'credit' ? Colors.success : Colors.error }]}>
                    {e.entry_type === 'credit' ? '+' : '−'}{fmt(e.amount)}
                  </Text>
                </View>
              ))
            )
          )}
        </ScrollView>
      )}

      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>New Ledger Entry</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.sectionHead}>Entry Type</Text>
              <View style={s.typeToggleRow}>
                {([{ value: 'credit', label: 'Credit (Income)' }, { value: 'debit', label: 'Debit (Expense)' }] as const).map(t => (
                  <TouchableOpacity key={t.value} style={[s.typeToggleBtn, form.entry_type === t.value && { backgroundColor: (t.value === 'credit' ? Colors.success : Colors.error) + '18', borderColor: t.value === 'credit' ? Colors.success : Colors.error }]} onPress={() => setForm(p => ({ ...p, entry_type: t.value }))}>
                    {t.value === 'credit' ? <ArrowUpRight size={14} color={form.entry_type === t.value ? Colors.success : Colors.textTertiary} strokeWidth={2} /> : <ArrowDownRight size={14} color={form.entry_type === t.value ? Colors.error : Colors.textTertiary} strokeWidth={2} />}
                    <Text style={[s.typeToggleText, form.entry_type === t.value && { color: t.value === 'credit' ? Colors.success : Colors.error, fontFamily: Typography.fontFamily.sansSemiBold }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Field label="Amount (₹)" value={form.amount} onChange={v => setForm(p => ({ ...p, amount: v }))} placeholder="0.00" keyboardType="decimal-pad" />
              <Field label="Description" value={form.description} onChange={v => setForm(p => ({ ...p, description: v }))} placeholder="What is this transaction for?" />
              <Field label="Date (YYYY-MM-DD)" value={form.entry_date} onChange={v => setForm(p => ({ ...p, entry_date: v }))} placeholder="2026-03-31" />
              <SelectField label="Category" options={CATEGORIES} value={form.category} onChange={v => setForm(p => ({ ...p, category: v as LedgerCategory }))} />
              <Field label="Party Name" value={form.party_name} onChange={v => setForm(p => ({ ...p, party_name: v }))} placeholder="Customer or vendor name (optional)" />
              <Field label="Payment Method" value={form.payment_method} onChange={v => setForm(p => ({ ...p, payment_method: v }))} placeholder="Cash, UPI, etc. (optional)" />
              {error ? <Text style={s.errorText}>{error}</Text> : null}
            </ScrollView>
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveBtnText}>Save Entry</Text>}
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
  balanceRow: { flexDirection: 'row', gap: Spacing[3], paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  balanceRowWeb: { paddingHorizontal: Spacing[8] },
  balancePill: { flex: 1, backgroundColor: Colors.neutral[50], borderRadius: Radius.md, padding: Spacing[3], alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  balancePillMain: { borderWidth: 1.5 },
  balancePillLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  balancePillValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm, marginTop: 2 },
  controlsRow: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingHorizontal: Spacing[5], paddingTop: Spacing[3], gap: Spacing[2] },
  controlsRowWeb: { paddingHorizontal: Spacing[8] },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.neutral[50], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2] },
  searchInput: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, outlineStyle: 'none' } as any,
  periodPills: { flexDirection: 'row', gap: Spacing[2], paddingBottom: Spacing[3] },
  periodPill: { paddingVertical: Spacing[1], paddingHorizontal: Spacing[3], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  periodPillActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  periodPillText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  periodPillTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  typeTabs: { flexDirection: 'row', paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], gap: Spacing[2], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  typeTab: { paddingVertical: Spacing[1], paddingHorizontal: Spacing[4], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  typeTabActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  typeTabText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  typeTabTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  scroll: { flex: 1 },
  content: { padding: Spacing[4] },
  contentWeb: { padding: Spacing[8], maxWidth: 1100, alignSelf: 'center', width: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  table: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  tableHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], backgroundColor: Colors.neutral[50], borderBottomWidth: 1, borderBottomColor: Colors.border },
  thCell: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, paddingRight: Spacing[2] },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  tdCell: { paddingRight: Spacing[2] },
  tdPrimary: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  tdSec: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tdDate: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  catBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.full },
  catBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  catDot: { width: 6, height: 6, borderRadius: 3 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.full },
  typeBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  tableFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.neutral[50] },
  tableFooterLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tableFooterValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
  mobileCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], marginBottom: Spacing[3], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  mobileCardIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  mobileCardContent: { flex: 1, gap: 3 },
  mobileCardDesc: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  mobileCardMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  mobileCardDate: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  mobileCardParty: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  mobileCardAmt: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: Spacing[5] },
  modal: { width: '100%', maxHeight: '92%', backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[5], gap: Spacing[3] },
  modalWeb: { maxWidth: 500 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  sectionHead: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: Spacing[2] },
  typeToggleRow: { flexDirection: 'row', gap: Spacing[3], marginBottom: Spacing[3] },
  typeToggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[3], paddingHorizontal: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  typeToggleText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
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
