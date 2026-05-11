import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Platform, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Package, CreditCard, Phone, Tag, Plus, X, MessageSquare, ClipboardList, History, Pin, Pencil, Trash2, CircleCheck as CheckCircle, Circle, ChevronDown, MapPin, Bell, Star, CircleAlert as AlertCircle, Calendar, TriangleAlert as AlertTriangle, CirclePause as PauseCircle, Copy } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import StatusChip from '@/components/ui/StatusChip';
import { format, differenceInDays, parseISO } from 'date-fns';
import { useAuthStore } from '@/store/authStore';

type NoteType = 'general' | 'call' | 'complaint' | 'feedback' | 'renewal' | 'delivery_issue';

const NOTE_TYPES: { value: NoteType; label: string; color: string }[] = [
  { value: 'general',        label: 'General',        color: Colors.textSecondary },
  { value: 'call',           label: 'Call',           color: Colors.primary },
  { value: 'complaint',      label: 'Complaint',      color: Colors.error },
  { value: 'feedback',       label: 'Feedback',       color: Colors.success },
  { value: 'renewal',        label: 'Renewal',        color: Colors.secondary },
  { value: 'delivery_issue', label: 'Delivery Issue', color: Colors.warning },
];

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  subscription_created:  <Package size={13} color={Colors.primary} strokeWidth={2} />,
  subscription_paused:   <AlertCircle size={13} color={Colors.accentDark} strokeWidth={2} />,
  subscription_cancelled:<X size={13} color={Colors.error} strokeWidth={2} />,
  subscription_renewed:  <CheckCircle size={13} color={Colors.success} strokeWidth={2} />,
  payment_success:       <CreditCard size={13} color={Colors.success} strokeWidth={2} />,
  payment_failed:        <CreditCard size={13} color={Colors.error} strokeWidth={2} />,
  payment_refunded:      <CreditCard size={13} color={Colors.textSecondary} strokeWidth={2} />,
  order_delivered:       <CheckCircle size={13} color={Colors.success} strokeWidth={2} />,
  order_failed:          <AlertCircle size={13} color={Colors.error} strokeWidth={2} />,
  note_added:            <MessageSquare size={13} color={Colors.secondary} strokeWidth={2} />,
  tag_added:             <Tag size={13} color={Colors.accent} strokeWidth={2} />,
  tag_removed:           <Tag size={13} color={Colors.textTertiary} strokeWidth={2} />,
  task_created:          <ClipboardList size={13} color={Colors.primary} strokeWidth={2} />,
  task_completed:        <CheckCircle size={13} color={Colors.success} strokeWidth={2} />,
  profile_updated:       <Pencil size={13} color={Colors.textSecondary} strokeWidth={2} />,
  address_added:         <MapPin size={13} color={Colors.primary} strokeWidth={2} />,
};

type Tab = 'overview' | 'notes' | 'tasks' | 'activity';

export default function AdminCustomerDetailScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile: adminProfile } = useAuthStore();

  const [profile, setProfile] = useState<any>(null);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [pauseHistory, setPauseHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('general');
  const [noteTypePicker, setNoteTypePicker] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [editingNote, setEditingNote] = useState<any | null>(null);

  const [showTagModal, setShowTagModal] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [profileRes, subsRes, paymentsRes, notesRes, tagsRes, allTagsRes, tasksRes, activityRes, ordersRes, addressesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
        supabase.from('subscriptions').select('*, plan:subscription_plans(name, price, frequency, mrp_price)').eq('user_id', id).order('created_at', { ascending: false }),
        supabase.from('payments').select('*').eq('user_id', id).order('created_at', { ascending: false }).limit(20),
        supabase.from('customer_notes').select('*').eq('customer_id', id).order('is_pinned', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('customer_tag_assignments').select('tag:customer_tags(id, name, color)').eq('customer_id', id),
        supabase.from('customer_tags').select('*'),
        supabase.from('crm_tasks').select('*').eq('customer_id', id).order('due_date', { ascending: true }).order('created_at', { ascending: false }),
        supabase.from('customer_activity_log').select('*').eq('customer_id', id).order('created_at', { ascending: false }).limit(50),
        supabase.from('orders').select('*').eq('user_id', id).order('scheduled_date', { ascending: false }).limit(10),
        supabase.from('addresses').select('*').eq('user_id', id),
      ]);

      const subs = subsRes.data ?? [];
      if (profileRes.data) setProfile(profileRes.data);
      setSubscriptions(subs);
      setPayments(paymentsRes.data ?? []);
      setNotes(notesRes.data ?? []);
      setTags((tagsRes.data ?? []).map((a: any) => a.tag).filter(Boolean));
      setAllTags(allTagsRes.data ?? []);
      setTasks(tasksRes.data ?? []);
      setActivity(activityRes.data ?? []);
      setOrders(ordersRes.data ?? []);
      setAddresses(addressesRes.data ?? []);

      if (subs.length > 0) {
        const subIds = subs.map((s: any) => s.id);
        const { data: pauseData } = await supabase
          .from('subscription_pause_history')
          .select('*, subscription:subscriptions(id, end_date, plan:subscription_plans(name))')
          .in('subscription_id', subIds)
          .order('created_at', { ascending: false });
        setPauseHistory(pauseData ?? []);
      }
    } catch (e) {
      console.error('customer-detail load error', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const getEffectiveStatus = (sub: any): string => {
    const today = new Date().toISOString().slice(0, 10);
    if (sub.pause_start_date && sub.pause_until && sub.pause_start_date <= today && sub.pause_until >= today) return 'paused';
    return sub.status;
  };

  const fmt = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;
  const totalSpent = payments.filter(p => p.status === 'success').reduce((s, p) => s + p.amount, 0);
  const deliveredOrders = orders.filter(o => o.status === 'delivered').length;

  const saveNote = async () => {
    if (!noteContent.trim()) return;
    setSavingNote(true);
    if (editingNote) {
      await supabase.from('customer_notes').update({ content: noteContent.trim(), note_type: noteType, is_pinned: editingNote.is_pinned, updated_at: new Date().toISOString() }).eq('id', editingNote.id);
    } else {
      await supabase.from('customer_notes').insert({ customer_id: id, author_id: adminProfile?.id, content: noteContent.trim(), note_type: noteType });
      await supabase.from('customer_activity_log').insert({ customer_id: id, actor_id: adminProfile?.id, activity_type: 'note_added', description: `Note added: ${noteContent.trim().slice(0, 80)}`, metadata: { note_type: noteType } });
    }
    setSavingNote(false);
    setShowNoteModal(false);
    setNoteContent('');
    setNoteType('general');
    setEditingNote(null);
    load();
  };

  const togglePin = async (note: any) => {
    await supabase.from('customer_notes').update({ is_pinned: !note.is_pinned }).eq('id', note.id);
    load();
  };

  const deleteNote = async (noteId: string) => {
    await supabase.from('customer_notes').delete().eq('id', noteId);
    load();
  };

  const toggleTag = async (tag: any) => {
    const assigned = tags.find(t => t.id === tag.id);
    if (assigned) {
      await supabase.from('customer_tag_assignments').delete().eq('customer_id', id).eq('tag_id', tag.id);
      await supabase.from('customer_activity_log').insert({ customer_id: id, actor_id: adminProfile?.id, activity_type: 'tag_removed', description: `Tag removed: ${tag.name}`, metadata: { tag_id: tag.id } });
    } else {
      await supabase.from('customer_tag_assignments').insert({ customer_id: id, tag_id: tag.id, assigned_by: adminProfile?.id });
      await supabase.from('customer_activity_log').insert({ customer_id: id, actor_id: adminProfile?.id, activity_type: 'tag_added', description: `Tag added: ${tag.name}`, metadata: { tag_id: tag.id } });
    }
    load();
  };

  const updateTaskStatus = async (task: any, newStatus: string) => {
    await supabase.from('crm_tasks').update({ status: newStatus, resolved_at: newStatus === 'done' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', task.id);
    if (newStatus === 'done') {
      await supabase.from('customer_activity_log').insert({ customer_id: id, actor_id: adminProfile?.id, activity_type: 'task_completed', description: `Task completed: ${task.title}`, metadata: {} });
    }
    load();
  };

  if (loading) {
    return (
      <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: Colors.textSecondary, fontFamily: 'DMSans-Regular', fontSize: 15 }}>Customer not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: Colors.primary, fontFamily: 'DMSans-Medium', fontSize: 15 }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'notes',    label: 'Notes',    count: notes.length },
    { key: 'tasks',    label: 'Tasks',    count: tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length },
    { key: 'activity', label: 'Activity', count: activity.length },
  ];

  return (
    <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top }]}>
      {/* Header */}
      <View style={[s.header, isWeb && s.headerWeb]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} strokeWidth={1.8} />
        </TouchableOpacity>
        <View style={s.headerProfile}>
          <View style={s.headerAvatar}>
            <Text style={s.headerAvatarText}>{profile.full_name?.charAt(0)?.toUpperCase() ?? '?'}</Text>
          </View>
          <View style={s.headerInfo}>
            <Text style={s.headerName}>{profile.full_name ?? 'Customer'}</Text>
            <View style={s.headerMeta}>
              <Phone size={11} color={Colors.textTertiary} strokeWidth={1.8} />
              <Text style={s.headerMobile}>{profile.mobile}</Text>
              <Text style={s.headerDot}>·</Text>
              <Text style={s.headerJoined}>Joined {format(new Date(profile.created_at), 'MMM yyyy')}</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity style={s.taskBtn} onPress={() => router.push({ pathname: '/(admin)/crm-tasks' as any, params: { customer_id: id, customer_name: profile.full_name ?? profile.mobile } })}>
          <ClipboardList size={15} color={Colors.primary} strokeWidth={1.8} />
          <Text style={s.taskBtnText}>Task</Text>
        </TouchableOpacity>
      </View>

      {/* Tags row */}
      <View style={[s.tagsRow, isWeb && s.tagsRowWeb]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tagsScroll}>
          {tags.map(tag => (
            <View key={tag.id} style={[s.tagChip, { borderColor: tag.color, backgroundColor: tag.color + '14' }]}>
              <View style={[s.tagDot, { backgroundColor: tag.color }]} />
              <Text style={[s.tagText, { color: tag.color }]}>{tag.name}</Text>
            </View>
          ))}
          <TouchableOpacity style={s.addTagBtn} onPress={() => setShowTagModal(true)}>
            <Plus size={12} color={Colors.textTertiary} strokeWidth={2} />
            <Text style={s.addTagText}>Tag</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll} contentContainerStyle={[s.tabScrollContent, isWeb && s.tabScrollContentWeb]}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab.key} style={[s.tab, activeTab === tab.key && s.tabActive]} onPress={() => setActiveTab(tab.key)}>
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>{tab.label}{tab.count !== undefined && tab.count > 0 ? ` (${tab.count})` : ''}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={s.scroll} contentContainerStyle={[s.content, isWeb && s.contentWeb]} showsVerticalScrollIndicator={false}>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <>
            <View style={[s.metricsRow, isWeb && s.metricsRowWeb]}>
              <MetricCard icon={<CreditCard size={16} color={Colors.success} strokeWidth={1.8} />} bg="#E8F5E9" label="Total Spent" value={fmt(totalSpent)} />
              <MetricCard icon={<Package size={16} color={Colors.primary} strokeWidth={1.8} />} bg={Colors.primarySurface} label="Subscriptions" value={String(subscriptions.length)} />
              <MetricCard icon={<CheckCircle size={16} color={Colors.success} strokeWidth={1.8} />} bg="#E8F5E9" label="Delivered" value={String(deliveredOrders)} />
              <MetricCard icon={<ClipboardList size={16} color={Colors.warning} strokeWidth={1.8} />} bg="#FFF3E0" label="Open Tasks" value={String(tasks.filter(t => t.status === 'open' || t.status === 'in_progress').length)} />
            </View>

            {subscriptions.length > 0 && (
              <SectionBlock title="Subscriptions">
                {subscriptions.map((sub, i) => {
                  const effectiveStatus = getEffectiveStatus(sub);
                  const renewalBadge = (() => {
                    if (!sub.end_date) return null;
                    if (effectiveStatus === 'expired') return { label: 'Expired', color: Colors.error, bg: Colors.errorSurface };
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const daysLeft = differenceInDays(parseISO(sub.end_date), today);
                    if (daysLeft < 0 && daysLeft >= -2) return { label: 'Grace Period', color: Colors.warning, bg: Colors.warningSurface };
                    if (daysLeft >= 0 && daysLeft <= 5) return { label: `${daysLeft}d left`, color: Colors.warning, bg: Colors.warningSurface };
                    return null;
                  })();

                  return (
                    <View key={sub.id} style={[s.listRow, i > 0 && s.listRowBorder]}>
                      <View style={s.subInfo}>
                        <Text style={s.subPlan}>{sub.plan?.name}</Text>
                        <Text style={s.subMeta}>{sub.plan?.frequency} · Since {format(new Date(sub.start_date), 'dd MMM yyyy')}</Text>
                      </View>
                      <View style={s.subRight}>
                        {renewalBadge && (
                          <View style={[s.renewalBadge, { backgroundColor: renewalBadge.bg }]}>
                            <AlertTriangle size={10} color={renewalBadge.color} strokeWidth={2} />
                            <Text style={[s.renewalBadgeText, { color: renewalBadge.color }]}>{renewalBadge.label}</Text>
                          </View>
                        )}
                        <StatusChip status={effectiveStatus} />
                      </View>
                    </View>
                  );
                })}
              </SectionBlock>
            )}

            {addresses.length > 0 && (
              <SectionBlock title="Addresses">
                {addresses.map((addr, i) => (
                  <View key={addr.id} style={[s.listRow, i > 0 && s.listRowBorder]}>
                    <View style={s.addrIcon}>
                      <MapPin size={14} color={Colors.primary} strokeWidth={1.8} />
                    </View>
                    <View style={s.addrInfo}>
                      <Text style={s.addrLabel}>{addr.label}{addr.is_default ? ' · Default' : ''}</Text>
                      <Text style={s.addrText}>{addr.street}, {addr.city}, {addr.pincode}</Text>
                    </View>
                  </View>
                ))}
              </SectionBlock>
            )}

            {/* PAUSE / RESUME LOGS — moved here */}
            {pauseHistory.length > 0 && (
              <View style={s.pauseCard}>
                <View style={s.pauseCardHeader}>
                  <View style={s.pauseCardHeaderLeft}>
                    <PauseCircle size={16} color={Colors.textSecondary} strokeWidth={1.8} />
                    <Text style={s.pauseCardTitle}>Subscription Pause/Resume Logs</Text>
                  </View>
                  <Text style={s.pauseCardTotal}>Total: {pauseHistory.length}</Text>
                </View>

                <View style={s.pauseTable}>
                  <View style={[s.pauseTableRow, s.pauseTableHeader]}>
                    {['Action', 'Pause Start', 'Pause End', 'Resume', 'New End', 'Paused Days'].map(h => (
                      <Text key={h} style={s.pauseTableHeaderText}>{h}</Text>
                    ))}
                  </View>
                  {pauseHistory.map((ph, i) => {
                    const pauseStart = ph.pause_start_date ? parseISO(ph.pause_start_date) : null;
                    const pauseEnd   = ph.pause_until      ? parseISO(ph.pause_until)      : null;
                    const pausedDays = pauseStart && pauseEnd ? differenceInDays(pauseEnd, pauseStart) + 1 : null;
                    const sub        = subscriptions.find(s => s.id === ph.subscription_id);
                    const origEnd    = sub?.end_date ? parseISO(sub.end_date) : null;
                    const newEnd     = origEnd && pausedDays ? new Date(origEnd.getTime() + pausedDays * 86400000) : null;
                    const isCancelled = ph.is_cancelled;
                    const isResumed   = !!ph.resumed_at;
                    return (
                      <View key={ph.id} style={[s.pauseTableRow, i % 2 === 1 && s.pauseTableRowAlt]}>
                        <View style={s.pauseActionCell}>
                          <View style={[s.pauseActionBadge, { backgroundColor: isCancelled ? '#FFF0F0' : isResumed ? '#E8F5E9' : '#FFF3E0' }]}>
                            <Text style={[s.pauseActionText, { color: isCancelled ? Colors.error : isResumed ? Colors.success : '#E65100' }]}>
                              {isCancelled ? 'Cancelled' : isResumed ? 'Resumed' : 'Paused'}
                            </Text>
                          </View>
                        </View>
                        <Text style={s.pauseTableCell}>{pauseStart ? format(pauseStart, 'dd MMM, yyyy') : '—'}</Text>
                        <Text style={s.pauseTableCell}>{pauseEnd   ? format(pauseEnd,   'dd MMM,\nyyyy') : '—'}</Text>
                        <Text style={s.pauseTableCell}>{ph.resumed_at ? format(parseISO(ph.resumed_at), 'dd MMM, yyyy') : 'N/A'}</Text>
                        <Text style={s.pauseTableCell}>{newEnd ? format(newEnd, 'dd MMM,\nyyyy') : '—'}</Text>
                        <Text style={[s.pauseTableCell, s.pauseTableCellBold]}>{pausedDays !== null ? `${pausedDays} days` : '—'}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ORDER & SUBSCRIPTION SUMMARY per subscription */}
            {subscriptions.map(sub => {
              const effectiveStatus = getEffectiveStatus(sub);
              return (
                <View key={`sum-${sub.id}`} style={s.summaryCard}>
                  <View style={s.summaryHeader}>
                    <View style={s.summaryHeaderLeft}>
                      <ClipboardList size={16} color={Colors.textSecondary} strokeWidth={1.8} />
                      <Text style={s.summaryTitle}>Order & Subscription Summary</Text>
                    </View>
                    <TouchableOpacity
                      style={s.copyIdBtn}
                      onPress={() => {
                        if (typeof navigator !== 'undefined' && navigator.clipboard) {
                          navigator.clipboard.writeText(sub.id);
                        }
                      }}
                    >
                      <Copy size={12} color={Colors.error} strokeWidth={2} />
                      <Text style={s.copyIdText}>Copy ID</Text>
                    </TouchableOpacity>
                  </View>

                  <SummaryRow label="Order ID" value={`ORD-${sub.id.slice(0, 14).toUpperCase()}`} mono />
                  <SummaryRow label="Product" value={sub.plan?.name ?? '—'} />
                  <SummaryRow label="Total Price" value={sub.plan?.price ? `₹ ${(sub.plan.price / 100).toFixed(2)}` : '—'} bold />
                  <SummaryRow label="Start Date" value={sub.start_date ? format(parseISO(sub.start_date), 'dd MMM, yyyy') : '—'} />
                  <SummaryRow label="End Date" value={sub.end_date ? format(parseISO(sub.end_date), 'dd MMM, yyyy') : '—'} />

                  {(sub.pause_start_date && sub.pause_until) && (
                    <View style={s.summaryNote}>
                      <AlertCircle size={13} color={Colors.warning} strokeWidth={2} />
                      <Text style={s.summaryNoteText}>
                        Subscription paused/resumed; extended end date: {format(parseISO(sub.pause_until), 'dd MMM, yyyy')}.
                      </Text>
                    </View>
                  )}

                  <View style={[s.summaryRowWrap, s.summaryRowLast]}>
                    <Text style={s.summaryLabel}>Status</Text>
                    <StatusChip status={effectiveStatus} />
                  </View>
                </View>
              );
            })}

          </>
        )}

        {/* NOTES TAB */}
        {activeTab === 'notes' && (
          <>
            <TouchableOpacity style={s.addNoteBtn} onPress={() => { setNoteContent(''); setNoteType('general'); setEditingNote(null); setShowNoteModal(true); }} activeOpacity={0.8}>
              <Plus size={16} color={Colors.white} strokeWidth={2} />
              <Text style={s.addNoteBtnText}>Add Note</Text>
            </TouchableOpacity>
            {notes.length === 0 ? (
              <View style={s.emptyState}>
                <MessageSquare size={32} color={Colors.textDisabled} strokeWidth={1.2} />
                <Text style={s.emptyTitle}>No notes yet</Text>
                <Text style={s.emptySub}>Add notes about calls, feedback, or complaints.</Text>
              </View>
            ) : (
              notes.map(note => {
                const typeCfg = NOTE_TYPES.find(t => t.value === note.note_type) ?? NOTE_TYPES[0];
                return (
                  <View key={note.id} style={[s.noteCard, note.is_pinned && s.noteCardPinned]}>
                    <View style={s.noteHeader}>
                      <View style={[s.noteTypePill, { backgroundColor: typeCfg.color + '18' }]}>
                        <View style={[s.noteTypeDot, { backgroundColor: typeCfg.color }]} />
                        <Text style={[s.noteTypeText, { color: typeCfg.color }]}>{typeCfg.label}</Text>
                      </View>
                      {note.is_pinned && (
                        <View style={s.pinnedBadge}>
                          <Pin size={10} color={Colors.accentDark} strokeWidth={2} />
                          <Text style={s.pinnedText}>Pinned</Text>
                        </View>
                      )}
                      <Text style={s.noteDate}>{format(new Date(note.created_at), 'dd MMM · HH:mm')}</Text>
                      <View style={s.noteActions}>
                        <TouchableOpacity onPress={() => togglePin(note)} style={s.noteActionBtn}>
                          <Pin size={13} color={note.is_pinned ? Colors.accentDark : Colors.textTertiary} strokeWidth={1.8} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => { setEditingNote(note); setNoteContent(note.content); setNoteType(note.note_type); setShowNoteModal(true); }} style={s.noteActionBtn}>
                          <Pencil size={13} color={Colors.textTertiary} strokeWidth={1.8} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => deleteNote(note.id)} style={s.noteActionBtn}>
                          <Trash2 size={13} color={Colors.error} strokeWidth={1.8} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Text style={s.noteContent}>{note.content}</Text>
                  </View>
                );
              })
            )}
          </>
        )}

        {/* TASKS TAB */}
        {activeTab === 'tasks' && (
          <>
            <TouchableOpacity style={s.addNoteBtn} onPress={() => router.push({ pathname: '/(admin)/crm-tasks' as any, params: { customer_id: id, customer_name: profile.full_name ?? profile.mobile } })} activeOpacity={0.8}>
              <Plus size={16} color={Colors.white} strokeWidth={2} />
              <Text style={s.addNoteBtnText}>New Task</Text>
            </TouchableOpacity>
            {tasks.length === 0 ? (
              <View style={s.emptyState}>
                <ClipboardList size={32} color={Colors.textDisabled} strokeWidth={1.2} />
                <Text style={s.emptyTitle}>No tasks</Text>
                <Text style={s.emptySub}>Create tasks to follow up with this customer.</Text>
              </View>
            ) : (
              tasks.map(task => {
                const isDone = task.status === 'done' || task.status === 'cancelled';
                const pColor = task.priority === 'urgent' ? Colors.error : task.priority === 'high' ? Colors.warning : task.priority === 'medium' ? Colors.accentDark : Colors.textTertiary;
                return (
                  <View key={task.id} style={s.taskCard}>
                    <TouchableOpacity style={s.taskCheck} onPress={() => updateTaskStatus(task, isDone ? 'open' : 'done')}>
                      {isDone ? <CheckCircle size={22} color={Colors.success} strokeWidth={1.8} /> : <Circle size={22} color={Colors.neutral[300]} strokeWidth={1.8} />}
                    </TouchableOpacity>
                    <View style={s.taskBody}>
                      <Text style={[s.taskTitle, isDone && s.taskTitleDone]}>{task.title}</Text>
                      {task.description ? <Text style={s.taskDesc} numberOfLines={1}>{task.description}</Text> : null}
                      <View style={s.taskMeta}>
                        <View style={[s.taskPriBadge, { backgroundColor: pColor + '18' }]}>
                          <Text style={[s.taskPriText, { color: pColor }]}>{task.priority}</Text>
                        </View>
                        {task.due_date && <Text style={s.taskDue}>Due {format(new Date(task.due_date + 'T00:00:00'), 'dd MMM')}</Text>}
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

        {/* ACTIVITY TAB */}
        {activeTab === 'activity' && (
          activity.length === 0 ? (
            <View style={s.emptyState}>
              <History size={32} color={Colors.textDisabled} strokeWidth={1.2} />
              <Text style={s.emptyTitle}>No activity yet</Text>
            </View>
          ) : (
            <View style={s.timeline}>
              {activity.map((event, idx) => (
                <View key={event.id} style={s.timelineRow}>
                  <View style={s.timelineLeft}>
                    <View style={[s.timelineIconCircle, { backgroundColor: getActivityBg(event.activity_type) }]}>
                      {ACTIVITY_ICONS[event.activity_type] ?? <History size={13} color={Colors.textTertiary} strokeWidth={2} />}
                    </View>
                    {idx < activity.length - 1 && <View style={s.timelineLine} />}
                  </View>
                  <View style={s.timelineBody}>
                    <Text style={s.timelineDesc}>{event.description}</Text>
                    <Text style={s.timelineDate}>{format(new Date(event.created_at), 'dd MMM yyyy · HH:mm')}</Text>
                  </View>
                </View>
              ))}
            </View>
          )
        )}
      </ScrollView>

      {/* Note Modal */}
      <Modal visible={showNoteModal} transparent animationType="fade" onRequestClose={() => setShowNoteModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editingNote ? 'Edit Note' : 'Add Note'}</Text>
              <TouchableOpacity onPress={() => setShowNoteModal(false)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Type</Text>
              <TouchableOpacity style={s.pickerBtn} onPress={() => setNoteTypePicker(p => !p)}>
                <View style={[s.noteTypeDot, { backgroundColor: NOTE_TYPES.find(t => t.value === noteType)?.color }]} />
                <Text style={s.pickerValue}>{NOTE_TYPES.find(t => t.value === noteType)?.label}</Text>
                <ChevronDown size={14} color={Colors.textTertiary} strokeWidth={1.8} />
              </TouchableOpacity>
              {noteTypePicker && (
                <View style={s.pickerDropdown}>
                  {NOTE_TYPES.map(t => (
                    <TouchableOpacity key={t.value} style={[s.pickerOption, noteType === t.value && s.pickerOptionActive]} onPress={() => { setNoteType(t.value); setNoteTypePicker(false); }}>
                      <View style={[s.noteTypeDot, { backgroundColor: t.color }]} />
                      <Text style={[s.pickerOptionText, noteType === t.value && s.pickerOptionTextActive]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Note</Text>
              <TextInput style={[s.input, s.textarea]} value={noteContent} onChangeText={setNoteContent} placeholder="Write your note here..." placeholderTextColor={Colors.textDisabled} multiline numberOfLines={5} autoFocus />
            </View>
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowNoteModal(false)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={saveNote} disabled={savingNote || !noteContent.trim()}>
                {savingNote ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveBtnText}>{editingNote ? 'Update' : 'Save Note'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Tag Modal */}
      <Modal visible={showTagModal} transparent animationType="fade" onRequestClose={() => setShowTagModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Manage Tags</Text>
              <TouchableOpacity onPress={() => { setShowTagModal(false); load(); }}><X size={18} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.tagGrid}>
                {allTags.map(tag => {
                  const assigned = tags.some(t => t.id === tag.id);
                  return (
                    <TouchableOpacity key={tag.id} style={[s.tagToggle, { borderColor: tag.color, backgroundColor: assigned ? tag.color + '20' : Colors.neutral[50] }]} onPress={() => toggleTag(tag)} activeOpacity={0.8}>
                      {assigned && <CheckCircle size={13} color={tag.color} strokeWidth={2} />}
                      <Text style={[s.tagToggleText, { color: assigned ? tag.color : Colors.textSecondary }]}>{tag.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            <TouchableOpacity style={s.saveBtn} onPress={() => { setShowTagModal(false); load(); }}>
              <Text style={s.saveBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SummaryRow({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <View style={s.summaryRowWrap}>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={[s.summaryValue, mono && s.summaryValueMono, bold && s.summaryValueBold]}>{value}</Text>
    </View>
  );
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.listCard}>{children}</View>
    </View>
  );
}

function MetricCard({ icon, bg, label, value }: { icon: React.ReactNode; bg: string; label: string; value: string }) {
  return (
    <View style={s.metricCard}>
      <View style={[s.metricIconCircle, { backgroundColor: bg }]}>{icon}</View>
      <Text style={s.metricValue}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

function getActivityBg(type: string) {
  if (type.includes('payment_success') || type.includes('delivered') || type.includes('completed') || type.includes('renewed')) return '#E8F5E9';
  if (type.includes('failed') || type.includes('cancelled') || type.includes('removed')) return '#FFEBEE';
  if (type.includes('paused')) return Colors.accentSurface;
  if (type.includes('note') || type.includes('tag')) return Colors.secondarySurface;
  return Colors.primarySurface;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing[3] },
  headerWeb: { paddingHorizontal: Spacing[8], paddingVertical: Spacing[5] },
  backBtn: { padding: Spacing[1] },
  headerProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  headerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  headerAvatarText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.white },
  headerInfo: { flex: 1 },
  headerName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  headerMobile: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  headerDot: { color: Colors.textDisabled, fontSize: Typography.size.xs },
  headerJoined: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  taskBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1], paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  taskBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary },
  tagsRow: { paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tagsRowWeb: { paddingHorizontal: Spacing[8] },
  tagsScroll: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  tagChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing[3], paddingVertical: Spacing[1], borderRadius: Radius.full, borderWidth: 1 },
  tagDot: { width: 6, height: 6, borderRadius: 3 },
  tagText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs },
  addTagBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: Spacing[3], paddingVertical: Spacing[1], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  addTagText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textTertiary },
  tabScroll: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, maxHeight: 48, flexGrow: 0 },
  tabScrollContent: { flexDirection: 'row', paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], gap: Spacing[2] },
  tabScrollContentWeb: { paddingHorizontal: Spacing[8] },
  tab: { paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  tabActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  tabText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  scroll: { flex: 1 },
  content: { padding: Spacing[5], gap: Spacing[4] },
  contentWeb: { padding: Spacing[8], maxWidth: 900, alignSelf: 'center', width: '100%', gap: Spacing[5] },
  metricsRow: { flexDirection: 'row', gap: Spacing[3] },
  metricsRowWeb: { gap: Spacing[4] },
  metricCard: { flex: 1, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[3], alignItems: 'center', gap: 3, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  metricIconCircle: { width: 32, height: 32, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  metricValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary },
  metricLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary, textAlign: 'center' },
  section: { gap: Spacing[2] },
  sectionTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 },
  listCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[4] },
  listRowBorder: { borderTopWidth: 1, borderTopColor: Colors.divider },
  subInfo: { flex: 1, gap: 3 },
  subPlan: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.base, color: Colors.textPrimary },
  subMeta: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  subRight: { alignItems: 'flex-end', gap: Spacing[1] },
  renewalBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: Spacing[2], paddingVertical: 2, borderRadius: Radius.full },
  renewalBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10 },
  addrIcon: { width: 30, height: 30, borderRadius: Radius.md, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center', marginRight: Spacing[3] },
  addrInfo: { flex: 1 },
  addrLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  addrText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  payInfo: { flex: 1 },
  payRef: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary },
  payDate: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  payRight: { alignItems: 'flex-end', gap: 4 },
  payAmt: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm },
  orderInfo: { flex: 1 },
  orderDate: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  orderNote: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  addNoteBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.primary, paddingVertical: Spacing[3], paddingHorizontal: Spacing[5], borderRadius: Radius.md, alignSelf: 'flex-start' },
  addNoteBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  emptyState: { alignItems: 'center', paddingTop: 50, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  emptySub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 260 },
  noteCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing[4], gap: Spacing[2], ...Shadow.sm },
  noteCardPinned: { borderColor: Colors.accentDark, backgroundColor: Colors.accentSurface },
  noteHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  noteTypePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.full },
  noteTypeDot: { width: 6, height: 6, borderRadius: 3 },
  noteTypeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  pinnedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: Spacing[2], paddingVertical: 2, borderRadius: Radius.full, backgroundColor: Colors.accentSurface },
  pinnedText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.accentDark },
  noteDate: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, textAlign: 'right' },
  noteActions: { flexDirection: 'row', gap: Spacing[1] },
  noteActionBtn: { padding: Spacing[1] },
  noteContent: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, lineHeight: 20 },
  taskCard: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, gap: Spacing[3], ...Shadow.sm },
  taskCheck: { paddingTop: 2 },
  taskBody: { flex: 1, gap: 4 },
  taskTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  taskTitleDone: { textDecorationLine: 'line-through', color: Colors.textTertiary },
  taskDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], marginTop: 3 },
  taskPriBadge: { paddingHorizontal: Spacing[2], paddingVertical: 2, borderRadius: Radius.full },
  taskPriText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  taskDue: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  timeline: { gap: 0 },
  timelineRow: { flexDirection: 'row', gap: Spacing[3] },
  timelineLeft: { alignItems: 'center', width: 32 },
  timelineIconCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  timelineLine: { width: 1, flex: 1, backgroundColor: Colors.border, minHeight: 16 },
  timelineBody: { flex: 1, paddingBottom: Spacing[4] },
  timelineDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  timelineDate: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 3 },
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[3], marginBottom: Spacing[3] },
  tagToggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], borderRadius: Radius.full, borderWidth: 1.5 },
  tagToggleText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: Spacing[5] },
  modal: { width: '100%', maxHeight: '88%', backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[5], gap: Spacing[3] },
  modalWeb: { maxWidth: 500 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  fieldGroup: { gap: Spacing[1] },
  fieldLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary, marginBottom: Spacing[1] },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary, backgroundColor: Colors.neutral[50] },
  textarea: { minHeight: 100, textAlignVertical: 'top' },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], backgroundColor: Colors.neutral[50] },
  pickerValue: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary },
  pickerDropdown: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.white, marginTop: 2, overflow: 'hidden' },
  pickerOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[3], paddingHorizontal: Spacing[4] },
  pickerOptionActive: { backgroundColor: Colors.primarySurface },
  pickerOptionText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary },
  pickerOptionTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  modalFooter: { flexDirection: 'row', gap: Spacing[3] },
  cancelBtn: { flex: 1, paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  saveBtn: { flex: 2, paddingVertical: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  saveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },

  // Order & Subscription Summary card
  summaryCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  summaryHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  summaryTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  copyIdBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: Spacing[1], paddingHorizontal: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.error + '60', backgroundColor: '#FFF5F5' },
  copyIdText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 12, color: Colors.error },
  summaryRowWrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], borderTopWidth: 1, borderTopColor: Colors.divider },
  summaryRowLast: {},
  summaryLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  summaryValue: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, textAlign: 'right', flex: 1, marginLeft: Spacing[4] },
  summaryValueMono: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 12, letterSpacing: 0.3 },
  summaryValueBold: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
  summaryNote: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2], marginHorizontal: Spacing[5], marginBottom: Spacing[3], backgroundColor: '#FFF8E1', borderRadius: Radius.md, padding: Spacing[3], borderWidth: 1, borderColor: '#FFE082' },
  summaryNoteText: { flex: 1, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.warning, lineHeight: 18 },

  // Pause/Resume Logs card
  pauseCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  pauseCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  pauseCardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  pauseCardTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  pauseCardTotal: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  pauseTable: { overflow: 'hidden' },
  pauseTableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], gap: Spacing[1] },
  pauseTableRowAlt: { backgroundColor: Colors.neutral[50] },
  pauseTableHeader: { backgroundColor: Colors.neutral[100], borderBottomWidth: 1, borderBottomColor: Colors.border },
  pauseTableHeaderText: { flex: 1, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.textSecondary },
  pauseTableCell: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: 12, color: Colors.textPrimary },
  pauseTableCellBold: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.primary },
  pauseActionCell: { flex: 1 },
  pauseActionBadge: { paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.full, alignSelf: 'flex-start' },
  pauseActionText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
});
