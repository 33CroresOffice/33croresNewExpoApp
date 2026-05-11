import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Platform, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClipboardList, Plus, X, CircleCheck as CheckCircle, Circle, Search, ArrowLeft, ChevronDown, CircleAlert as AlertCircle, User } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { format, isToday, isTomorrow, isPast } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

type TaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled';
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
type TaskType = 'follow_up' | 'renewal' | 'complaint' | 'onboarding' | 'delivery_issue' | 'general';

interface CrmTask {
  id: string;
  title: string;
  description: string;
  task_type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  customer_id: string | null;
  customer?: { full_name: string | null; mobile: string } | null;
  created_at: string;
}

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bg: string }> = {
  urgent: { label: 'Urgent', color: Colors.error,        bg: '#FFEBEE' },
  high:   { label: 'High',   color: Colors.warning,      bg: '#FFF3E0' },
  medium: { label: 'Medium', color: Colors.accentDark,   bg: Colors.accentSurface },
  low:    { label: 'Low',    color: Colors.textTertiary,  bg: Colors.neutral[100] },
};

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  open:        { label: 'Open',        color: Colors.primary,      bg: Colors.primarySurface },
  in_progress: { label: 'In Progress', color: Colors.warning,      bg: '#FFF3E0' },
  done:        { label: 'Done',        color: Colors.success,      bg: '#E8F5E9' },
  cancelled:   { label: 'Cancelled',   color: Colors.textTertiary, bg: Colors.neutral[100] },
};

const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: 'follow_up',      label: 'Follow Up' },
  { value: 'renewal',        label: 'Renewal' },
  { value: 'complaint',      label: 'Complaint' },
  { value: 'onboarding',     label: 'Onboarding' },
  { value: 'delivery_issue', label: 'Delivery Issue' },
  { value: 'general',        label: 'General' },
];

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high',   label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low',    label: 'Low' },
];

const STATUS_TABS: { label: string; value: TaskStatus | 'all' }[] = [
  { label: 'All',         value: 'all' },
  { label: 'Open',        value: 'open' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Done',        value: 'done' },
];

const TYPE_FILTER_ALL = 'all' as const;
type TypeFilter = TaskType | typeof TYPE_FILTER_ALL;

const EMPTY_FORM = {
  title: '',
  description: '',
  task_type: 'follow_up' as TaskType,
  priority: 'medium' as TaskPriority,
  due_date: '',
  customer_search: '',
  customer_id: null as string | null,
  customer_name: '',
};

export default function CrmTasksScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { profile } = useAuthStore();
  const params = useLocalSearchParams<{ customer_id?: string; customer_name?: string }>();

  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusTab, setStatusTab] = useState<TaskStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(TYPE_FILTER_ALL);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CrmTask | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM, customer_id: params.customer_id ?? null, customer_name: params.customer_name ?? '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<any[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('crm_tasks')
        .select('*, customer:profiles!crm_tasks_customer_id_fkey(full_name, mobile)')
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (data) setTasks(data as CrmTask[]);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const searchCustomers = async (q: string) => {
    if (q.length < 2) { setCustomerSuggestions([]); return; }
    setSearchingCustomers(true);
    const { data } = await supabase.from('profiles').select('id, full_name, mobile').eq('role', 'customer').or(`full_name.ilike.%${q}%,mobile.ilike.%${q}%`).limit(6);
    setCustomerSuggestions(data ?? []);
    setSearchingCustomers(false);
  };

  const openCreate = (defaultCustomerId?: string, defaultCustomerName?: string) => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, customer_id: defaultCustomerId ?? params.customer_id ?? null, customer_name: defaultCustomerName ?? params.customer_name ?? '' });
    setError('');
    setCustomerSuggestions([]);
    setShowModal(true);
  };

  const openEdit = (task: CrmTask) => {
    setEditing(task);
    setForm({
      ...EMPTY_FORM,
      title: task.title,
      description: task.description,
      task_type: task.task_type,
      priority: task.priority,
      due_date: task.due_date ?? '',
      customer_id: task.customer_id,
      customer_name: task.customer?.full_name ?? task.customer?.mobile ?? '',
    });
    setError('');
    setCustomerSuggestions([]);
    setShowModal(true);
  };

  const save = async () => {
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      task_type: form.task_type,
      priority: form.priority,
      due_date: form.due_date || null,
      customer_id: form.customer_id,
      created_by: profile?.id ?? null,
      assigned_to: profile?.id ?? null,
    };
    const { error: err } = editing
      ? await supabase.from('crm_tasks').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id)
      : await supabase.from('crm_tasks').insert(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    if (!editing && form.customer_id) {
      await supabase.from('customer_activity_log').insert({
        customer_id: form.customer_id,
        actor_id: profile?.id,
        activity_type: 'task_created',
        description: `Task created: ${form.title.trim()}`,
        metadata: { task_type: form.task_type, priority: form.priority },
      });
    }
    setShowModal(false);
    load();
  };

  const updateStatus = async (task: CrmTask, newStatus: TaskStatus) => {
    await supabase.from('crm_tasks').update({
      status: newStatus,
      resolved_at: newStatus === 'done' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', task.id);
    if (newStatus === 'done' && task.customer_id) {
      await supabase.from('customer_activity_log').insert({
        customer_id: task.customer_id,
        actor_id: profile?.id,
        activity_type: 'task_completed',
        description: `Task completed: ${task.title}`,
        metadata: {},
      });
    }
    load();
  };

  const filtered = tasks.filter(t => {
    if (statusTab !== 'all' && t.status !== statusTab) return false;
    if (typeFilter !== TYPE_FILTER_ALL && t.task_type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return t.title.toLowerCase().includes(q) || (t.customer?.full_name ?? '').toLowerCase().includes(q) || (t.customer?.mobile ?? '').includes(q) || t.task_type.includes(q);
    }
    return true;
  });

  const overdueTasks = filtered.filter(t => t.due_date && isPast(new Date(t.due_date + 'T00:00:00')) && !isToday(new Date(t.due_date + 'T00:00:00')) && t.status !== 'done' && t.status !== 'cancelled');
  const todayTasks = filtered.filter(t => t.due_date && isToday(new Date(t.due_date + 'T00:00:00')));
  const otherTasks = filtered.filter(t => !overdueTasks.find(o => o.id === t.id) && !todayTasks.find(o => o.id === t.id));

  const formatDue = (d: string | null) => {
    if (!d) return null;
    const date = new Date(d + 'T00:00:00');
    if (isToday(date)) return { label: 'Today', color: Colors.warning };
    if (isTomorrow(date)) return { label: 'Tomorrow', color: Colors.accentDark };
    if (isPast(date)) return { label: `Overdue: ${format(date, 'dd MMM')}`, color: Colors.error };
    return { label: format(date, 'dd MMM'), color: Colors.textTertiary };
  };

  const renderTask = (task: CrmTask) => {
    const pCfg = PRIORITY_CONFIG[task.priority];
    const sCfg = STATUS_CONFIG[task.status];
    const due = formatDue(task.due_date);
    const isDone = task.status === 'done' || task.status === 'cancelled';
    return (
      <TouchableOpacity key={task.id} style={s.taskCard} onPress={() => openEdit(task)} activeOpacity={0.8}>
        <TouchableOpacity style={s.taskCheck} onPress={() => updateStatus(task, isDone ? 'open' : 'done')}>
          {isDone
            ? <CheckCircle size={22} color={Colors.success} strokeWidth={1.8} />
            : <Circle size={22} color={Colors.neutral[300]} strokeWidth={1.8} />}
        </TouchableOpacity>
        <View style={s.taskBody}>
          <View style={s.taskTopRow}>
            <Text style={[s.taskTitle, isDone && s.taskTitleDone]} numberOfLines={1}>{task.title}</Text>
            <View style={[s.priorityBadge, { backgroundColor: pCfg.bg }]}>
              <Text style={[s.priorityText, { color: pCfg.color }]}>{pCfg.label}</Text>
            </View>
          </View>
          {task.description ? <Text style={s.taskDesc} numberOfLines={1}>{task.description}</Text> : null}
          <View style={s.taskFooter}>
            <View style={[s.typePill, { backgroundColor: getTypeColor(task.task_type) + '18' }]}>
              <Text style={[s.typePillText, { color: getTypeColor(task.task_type) }]}>{TASK_TYPES.find(t => t.value === task.task_type)?.label}</Text>
            </View>
            {task.customer && (
              <TouchableOpacity style={s.customerChip} onPress={() => router.push({ pathname: '/(admin)/customer-detail' as any, params: { id: task.customer_id! } })}>
                <User size={11} color={Colors.primary} strokeWidth={2} />
                <Text style={s.customerChipText} numberOfLines={1}>{task.customer.full_name ?? task.customer.mobile}</Text>
              </TouchableOpacity>
            )}
            {due && <Text style={[s.dueText, { color: due.color }]}>{due.label}</Text>}
            <View style={[s.statusBadge, { backgroundColor: sCfg.bg }]}>
              <Text style={[s.statusText, { color: sCfg.color }]}>{sCfg.label}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

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
            <ClipboardList size={isWeb ? 22 : 18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>Tasks</Text>
            <Text style={s.subtitle}>{tasks.filter(t => t.status === 'open' || t.status === 'in_progress').length} open · {overdueTasks.length} overdue</Text>
          </View>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => openCreate()} activeOpacity={0.8}>
          <Plus size={16} color={Colors.white} strokeWidth={2} />
          <Text style={s.addBtnText}>New Task</Text>
        </TouchableOpacity>
      </View>

      <View style={[s.searchRow, isWeb && s.searchRowWeb]}>
        <View style={s.searchWrap}>
          <Search size={14} color={Colors.textTertiary} strokeWidth={1.8} />
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search tasks or customers..." placeholderTextColor={Colors.textDisabled} />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll} contentContainerStyle={s.tabs}>
        {STATUS_TABS.map(t => {
          const count = t.value === 'all' ? tasks.length : tasks.filter(tk => tk.status === t.value).length;
          return (
            <TouchableOpacity key={t.value} style={[s.tabBtn, statusTab === t.value && s.tabBtnActive]} onPress={() => setStatusTab(t.value)}>
              <Text style={[s.tabText, statusTab === t.value && s.tabTextActive]}>{t.label} ({count})</Text>
            </TouchableOpacity>
          );
        })}
        <View style={s.tabDivider} />
        <TouchableOpacity
          style={[s.tabBtn, s.renewalTabBtn, typeFilter === 'renewal' && s.renewalTabBtnActive]}
          onPress={() => setTypeFilter(f => f === 'renewal' ? TYPE_FILTER_ALL : 'renewal')}
        >
          <Text style={[s.tabText, typeFilter === 'renewal' && s.renewalTabTextActive]}>
            Renewals ({tasks.filter(t => t.task_type === 'renewal').length})
          </Text>
        </TouchableOpacity>
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
          {filtered.length === 0 ? (
            <View style={s.emptyState}>
              <ClipboardList size={36} color={Colors.textDisabled} strokeWidth={1.2} />
              <Text style={s.emptyTitle}>No tasks found</Text>
              <Text style={s.emptySub}>Create follow-up tasks to stay on top of your customers.</Text>
            </View>
          ) : (
            <>
              {overdueTasks.length > 0 && (
                <View>
                  <View style={s.groupHeader}>
                    <AlertCircle size={14} color={Colors.error} strokeWidth={2} />
                    <Text style={[s.groupLabel, { color: Colors.error }]}>Overdue ({overdueTasks.length})</Text>
                  </View>
                  {overdueTasks.map(renderTask)}
                </View>
              )}
              {todayTasks.length > 0 && (
                <View>
                  <View style={s.groupHeader}>
                    <View style={[s.groupDot, { backgroundColor: Colors.warning }]} />
                    <Text style={[s.groupLabel, { color: Colors.warning }]}>Due Today ({todayTasks.length})</Text>
                  </View>
                  {todayTasks.map(renderTask)}
                </View>
              )}
              {otherTasks.length > 0 && (
                <View>
                  {(overdueTasks.length > 0 || todayTasks.length > 0) && (
                    <View style={s.groupHeader}>
                      <View style={[s.groupDot, { backgroundColor: Colors.neutral[400] }]} />
                      <Text style={[s.groupLabel, { color: Colors.textSecondary }]}>Other ({otherTasks.length})</Text>
                    </View>
                  )}
                  {otherTasks.map(renderTask)}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editing ? 'Edit Task' : 'New Task'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>Title *</Text>
                <TextInput style={s.input} value={form.title} onChangeText={v => setForm(p => ({ ...p, title: v }))} placeholder="What needs to be done?" placeholderTextColor={Colors.textDisabled} />
              </View>
              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>Description</Text>
                <TextInput style={[s.input, s.textarea]} value={form.description} onChangeText={v => setForm(p => ({ ...p, description: v }))} placeholder="Add more context..." placeholderTextColor={Colors.textDisabled} multiline numberOfLines={3} />
              </View>
              <View style={s.fieldRow}>
                <View style={[s.fieldGroup, { flex: 1 }]}>
                  <Text style={s.fieldLabel}>Type</Text>
                  <SelectField options={TASK_TYPES} value={form.task_type} onChange={v => setForm(p => ({ ...p, task_type: v as TaskType }))} />
                </View>
                <View style={[s.fieldGroup, { flex: 1 }]}>
                  <Text style={s.fieldLabel}>Priority</Text>
                  <SelectField options={PRIORITIES} value={form.priority} onChange={v => setForm(p => ({ ...p, priority: v as TaskPriority }))} />
                </View>
              </View>
              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>Due Date (YYYY-MM-DD)</Text>
                <TextInput style={s.input} value={form.due_date} onChangeText={v => setForm(p => ({ ...p, due_date: v }))} placeholder="e.g. 2026-04-15 (optional)" placeholderTextColor={Colors.textDisabled} />
              </View>
              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>Customer</Text>
                {form.customer_id ? (
                  <View style={s.customerSelected}>
                    <User size={14} color={Colors.primary} strokeWidth={1.8} />
                    <Text style={s.customerSelectedText}>{form.customer_name}</Text>
                    <TouchableOpacity onPress={() => setForm(p => ({ ...p, customer_id: null, customer_name: '', customer_search: '' }))}>
                      <X size={14} color={Colors.textTertiary} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    <View style={s.searchWrap}>
                      <Search size={14} color={Colors.textTertiary} strokeWidth={1.8} />
                      <TextInput style={s.searchInput} value={form.customer_search} onChangeText={v => { setForm(p => ({ ...p, customer_search: v })); searchCustomers(v); }} placeholder="Search customer..." placeholderTextColor={Colors.textDisabled} />
                      {searchingCustomers && <ActivityIndicator size="small" color={Colors.primary} />}
                    </View>
                    {customerSuggestions.length > 0 && (
                      <View style={s.suggestions}>
                        {customerSuggestions.map(c => (
                          <TouchableOpacity key={c.id} style={s.suggestionRow} onPress={() => { setForm(p => ({ ...p, customer_id: c.id, customer_name: c.full_name ?? c.mobile, customer_search: '' })); setCustomerSuggestions([]); }}>
                            <Text style={s.suggestionName}>{c.full_name ?? 'No name'}</Text>
                            <Text style={s.suggestionMobile}>{c.mobile}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </View>
              {error ? <Text style={s.errorText}>{error}</Text> : null}
            </ScrollView>
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveBtnText}>{editing ? 'Update' : 'Create Task'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function getTypeColor(type: TaskType) {
  const map: Record<TaskType, string> = {
    follow_up:      Colors.primary,
    renewal:        Colors.success,
    complaint:      Colors.error,
    onboarding:     Colors.secondary,
    delivery_issue: Colors.warning,
    general:        Colors.textSecondary,
  };
  return map[type] ?? Colors.textSecondary;
}

function SelectField({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);
  return (
    <View>
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
  searchRow: { paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchRowWeb: { paddingHorizontal: Spacing[8] },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.neutral[50], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2] },
  searchInput: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, outlineStyle: 'none' } as any,
  tabScroll: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, maxHeight: 48, flexGrow: 0 },
  tabs: { flexDirection: 'row', paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], gap: Spacing[2] },
  tabBtn: { paddingVertical: Spacing[1], paddingHorizontal: Spacing[3], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  tabBtnActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  tabText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  tabDivider: { width: 1, backgroundColor: Colors.border, marginHorizontal: Spacing[1], alignSelf: 'stretch' },
  renewalTabBtn: { borderColor: Colors.success + '60', backgroundColor: Colors.successSurface },
  renewalTabBtnActive: { backgroundColor: Colors.success, borderColor: Colors.success },
  renewalTabTextActive: { color: Colors.white, fontFamily: Typography.fontFamily.sansSemiBold },
  scroll: { flex: 1 },
  content: { padding: Spacing[4], gap: Spacing[3] },
  contentWeb: { padding: Spacing[8], maxWidth: 900, alignSelf: 'center', width: '100%', gap: Spacing[4] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  emptySub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 280 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], marginBottom: Spacing[2] },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm },
  taskCard: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, gap: Spacing[3], marginBottom: Spacing[3], ...Shadow.sm },
  taskCheck: { paddingTop: 2 },
  taskBody: { flex: 1, gap: Spacing[2] },
  taskTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2] },
  taskTitle: { flex: 1, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  taskTitleDone: { textDecorationLine: 'line-through', color: Colors.textTertiary },
  taskDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  taskFooter: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing[2] },
  priorityBadge: { paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.full },
  priorityText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  typePill: { paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.full },
  typePillText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  statusBadge: { paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.full },
  statusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  customerChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.full, backgroundColor: Colors.primarySurface },
  customerChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11, color: Colors.primary, maxWidth: 120 },
  dueText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: Spacing[5] },
  modal: { width: '100%', maxHeight: '92%', backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[5], gap: Spacing[3] },
  modalWeb: { maxWidth: 560 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  fieldGroup: { gap: Spacing[1], marginBottom: Spacing[3] },
  fieldRow: { flexDirection: 'row', gap: Spacing[3] },
  fieldLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary, backgroundColor: Colors.neutral[50] },
  textarea: { minHeight: 72, textAlignVertical: 'top' },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], backgroundColor: Colors.neutral[50] },
  pickerValue: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  pickerDropdown: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.white, marginTop: 2, overflow: 'hidden' },
  pickerOption: { paddingVertical: Spacing[3], paddingHorizontal: Spacing[4] },
  pickerOptionActive: { backgroundColor: Colors.primarySurface },
  pickerOptionText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  pickerOptionTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  customerSelected: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingHorizontal: Spacing[3], paddingVertical: Spacing[3], borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.md, backgroundColor: Colors.primarySurface },
  customerSelectedText: { flex: 1, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.base, color: Colors.primary },
  suggestions: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.white, marginTop: 2, overflow: 'hidden' },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  suggestionName: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  suggestionMobile: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error, marginBottom: Spacing[2] },
  modalFooter: { flexDirection: 'row', gap: Spacing[3] },
  cancelBtn: { flex: 1, paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  saveBtn: { flex: 2, paddingVertical: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  saveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
});
