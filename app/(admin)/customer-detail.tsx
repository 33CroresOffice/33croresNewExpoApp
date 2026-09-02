import React, { useEffect, useState, useCallback } from 'react';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Platform, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Package, CreditCard, Phone, Tag, Plus, X, MessageSquare, ClipboardList, History, Pin, Pencil, Trash2, CircleCheck as CheckCircle, ChevronDown, MapPin, Bell, Star, CircleAlert as AlertCircle, Calendar, TriangleAlert as AlertTriangle, CirclePause as PauseCircle, ChevronRight, Flower2, GitBranch, RefreshCw, Ban, Clock, Smartphone, Apple, Monitor, User } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import StatusChip from '@/components/ui/StatusChip';
import { format, differenceInDays, parseISO } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { dedupePauseHistory } from '@/utils/pauseHistory';

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

type Tab = 'overview' | 'orders' | 'deliveries' | 'logins' | 'notes' | 'activity' | 'pauses' | 'profile';
type OrderSubTab = 'subscription' | 'customize';

export default function AdminCustomerDetailScreen() {
  return (
    <ModuleGuard module="crm">
      <AdminCustomerDetailScreenContent />
    </ModuleGuard>
  );
}

function AdminCustomerDetailScreenContent() {
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
  const [customOrders, setCustomOrders] = useState<any[]>([]);
  const [renewalHistory, setRenewalHistory] = useState<any[]>([]);
  const [loginLogs, setLoginLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [orderSubTab, setOrderSubTab] = useState<OrderSubTab>('subscription');

  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('general');
  const [noteTypePicker, setNoteTypePicker] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [editingNote, setEditingNote] = useState<any | null>(null);

  const [showTagModal, setShowTagModal] = useState(false);
  const [pauseModalSub, setPauseModalSub] = useState<any | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [profileRes, subsRes, paymentsRes, notesRes, tagsRes, allTagsRes, tasksRes, activityRes, ordersRes, addressesRes, customOrdersRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
        supabase.from('subscriptions').select('*, plan:subscription_plans(name, price, frequency, mrp_price), payments(id, amount, status, payment_mode, created_at, razorpay_order_id)').eq('user_id', id).order('created_at', { ascending: false }),
        supabase.from('payments').select('*').eq('user_id', id).order('created_at', { ascending: false }).limit(20),
        supabase.from('customer_notes').select('*').eq('customer_id', id).order('is_pinned', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('customer_tag_assignments').select('tag:customer_tags(id, name, color)').eq('customer_id', id),
        supabase.from('customer_tags').select('*'),
        supabase.from('crm_tasks').select('*').eq('customer_id', id).order('due_date', { ascending: true }).order('created_at', { ascending: false }),
        supabase.from('customer_activity_log').select('*').eq('customer_id', id).order('created_at', { ascending: false }).limit(50),
        supabase.from('orders').select('id, subscription_id, scheduled_date, status, delivered_at, admin_note').eq('user_id', id).order('scheduled_date', { ascending: false }),
        supabase.from('addresses').select('*').eq('user_id', id),
        supabase.from('custom_orders').select('*').eq('user_id', id).order('created_at', { ascending: false }),
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
      setCustomOrders(customOrdersRes.data ?? []);

      const subIds = (subsRes.data ?? []).map((s: any) => s.id);
      const [pauseRes, renewalRes] = await Promise.all([
        subIds.length > 0
          ? supabase
              .from('subscription_pause_history')
              .select('id, subscription_id, pause_start_date, pause_until, resumed_at, is_cancelled, created_at')
              .in('subscription_id', subIds)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('subscription_renewal_history')
          .select('*, plan:subscription_plans(name, price, frequency)')
          .eq('user_id', id)
          .order('renewed_at', { ascending: true }),
      ]);
      const dbPauses = (pauseRes as any).data ?? [];
      // Synthesize pause entries from subscription fields when no history record exists
      const subsWithPauses = (subsRes.data ?? []).filter((s: any) => s.pause_start_date && s.pause_until);
      const existingSubIds = new Set(dbPauses.map((p: any) => p.subscription_id));
      const synthesizedPauses = subsWithPauses
        .filter((s: any) => !existingSubIds.has(s.id))
        .map((s: any) => ({
          id: `synth-${s.id}`,
          subscription_id: s.id,
          pause_start_date: s.pause_start_date,
          pause_until: s.pause_until,
          resumed_at: null,
          is_cancelled: false,
          created_at: s.updated_at ?? s.pause_start_date,
        }));
      setPauseHistory(dedupePauseHistory([...dbPauses, ...synthesizedPauses]));
      setRenewalHistory(renewalRes.data ?? []);

      // Customer login logs
      const { data: loginData } = await supabase
        .from('customer_login_logs')
        .select('id, platform, device_model, app_version, os_version, logged_in_at')
        .eq('user_id', id)
        .order('logged_in_at', { ascending: false })
        .limit(100);
      setLoginLogs(loginData ?? []);
    } catch (e) {
      console.error('customer-detail load error', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const getEffectiveStatus = (sub: any): string => {
    const today = new Date().toISOString().slice(0, 10);
    if (sub.status === 'paused') return 'paused';
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
    { key: 'profile',    label: 'Profile' },
    { key: 'orders',     label: 'Orders',     count: subscriptions.length + customOrders.length },
    { key: 'deliveries', label: 'Deliveries', count: orders.filter(o => o.status === 'delivered').length },
    { key: 'logins',     label: 'Logins',     count: loginLogs.length },
    { key: 'notes',      label: 'Notes',      count: notes.length },
    { key: 'activity',   label: 'Activity',   count: activity.length },
    { key: 'pauses',     label: 'Pauses',     count: pauseHistory.length },
    { key: 'overview',   label: 'Overview' },
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
                    <TouchableOpacity
                      key={sub.id}
                      style={[s.listRow, i > 0 && s.listRowBorder]}
                      activeOpacity={0.7}
                      onPress={() => {
                        const todayStr = new Date().toISOString().split('T')[0];
                        const subOrders = orders.filter((o: any) => o.subscription_id === sub.id);
                        const todayOrder = subOrders.find((o: any) => o.scheduled_date === todayStr);
                        const upcoming = subOrders.filter((o: any) => o.scheduled_date >= todayStr).sort((a: any, b: any) => a.scheduled_date.localeCompare(b.scheduled_date));
                        const past = subOrders.filter((o: any) => o.scheduled_date < todayStr).sort((a: any, b: any) => b.scheduled_date.localeCompare(a.scheduled_date));
                        const target = todayOrder ?? upcoming[0] ?? past[0];
                        if (target) {
                          router.push({ pathname: '/(admin)/order-detail' as any, params: { id: target.id } });
                        } else {
                          router.push({ pathname: '/(admin)/orders', params: { subFilter: 'all' } } as any);
                        }
                      }}
                    >
                      <View style={s.subInfo}>
                        <Text style={s.subPlan}>{sub.plan?.name}</Text>
                        <Text style={s.subMeta}>{sub.plan?.frequency} · Since {format(new Date(sub.start_date), 'dd MMM yyyy')}</Text>
                      </View>
                      <View style={s.subRight}>
                        {renewalBadge ? (
                          <View style={[s.renewalBadge, { backgroundColor: renewalBadge.bg }]}>
                            <AlertTriangle size={10} color={renewalBadge.color} strokeWidth={2} />
                            <Text style={[s.renewalBadgeText, { color: renewalBadge.color }]}>{renewalBadge.label}</Text>
                          </View>
                        ) : (
                          <StatusChip status={effectiveStatus} />
                        )}
                        <ChevronRight size={16} color={Colors.textTertiary} strokeWidth={1.8} />
                      </View>
                    </TouchableOpacity>
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

          </>
        )}

        {/* ORDERS TAB */}
        {activeTab === 'orders' && (
          <>
            {/* Sub-tab toggle */}
            <View style={s.orderSubTabRow}>
              <TouchableOpacity
                style={[s.orderSubTab, orderSubTab === 'subscription' && s.orderSubTabActive]}
                onPress={() => setOrderSubTab('subscription')}
                activeOpacity={0.8}
              >
                <Package size={13} color={orderSubTab === 'subscription' ? Colors.white : Colors.textSecondary} strokeWidth={2} />
                <Text style={[s.orderSubTabText, orderSubTab === 'subscription' && s.orderSubTabTextActive]}>
                  Subscription Orders
                </Text>
                <View style={[s.orderSubTabBadge, orderSubTab === 'subscription' && s.orderSubTabBadgeActive]}>
                  <Text style={[s.orderSubTabBadgeText, orderSubTab === 'subscription' && s.orderSubTabBadgeTextActive]}>{subscriptions.length}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.orderSubTab, orderSubTab === 'customize' && s.orderSubTabActive]}
                onPress={() => setOrderSubTab('customize')}
                activeOpacity={0.8}
              >
                <Flower2 size={13} color={orderSubTab === 'customize' ? Colors.white : Colors.textSecondary} strokeWidth={2} />
                <Text style={[s.orderSubTabText, orderSubTab === 'customize' && s.orderSubTabTextActive]}>
                  Customize Orders
                </Text>
                <View style={[s.orderSubTabBadge, orderSubTab === 'customize' && s.orderSubTabBadgeActive]}>
                  <Text style={[s.orderSubTabBadgeText, orderSubTab === 'customize' && s.orderSubTabBadgeTextActive]}>{customOrders.length}</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Subscription Orders list */}
            {orderSubTab === 'subscription' && (
              subscriptions.length === 0 ? (
                <View style={s.emptyState}>
                  <Package size={32} color={Colors.textDisabled} strokeWidth={1.2} />
                  <Text style={s.emptyTitle}>No subscriptions yet</Text>
                </View>
              ) : (
                <View style={s.ordersListWrap}>
                  {subscriptions.map((sub: any, i: number) => {
                    const effectiveStatus = getEffectiveStatus(sub);
                    const latestPayment = (sub.payments ?? []).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
                    const payStatus = latestPayment?.status === 'success' || latestPayment?.status === 'captured' ? 'paid' : latestPayment?.status ?? '—';
                    const payColor = payStatus === 'paid' ? Colors.success : payStatus === 'failed' ? Colors.error : Colors.warning;
                    const subOrder = orders.find((o: any) => o.subscription_id === sub.id);
                    const orderRenewalBadge = (() => {
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
                      <TouchableOpacity
                        key={sub.id}
                        style={s.orderCard}
                        onPress={() => {
                          if (subOrder) {
                            router.push({ pathname: '/(admin)/order-detail', params: { id: subOrder.id } } as any);
                          } else {
                            router.push({ pathname: '/(admin)/orders', params: { subFilter: 'all' } } as any);
                          }
                        }}
                        activeOpacity={0.75}
                      >
                        {/* Top row: plan name + status */}
                        <View style={s.orderCardTop}>
                          <View style={s.orderCardProductWrap}>
                            <View style={s.orderCardIconBox}>
                              <Package size={15} color={Colors.primary} strokeWidth={2} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={s.orderCardPlan} numberOfLines={1}>{sub.plan?.name ?? '—'}</Text>
                              {sub.start_date && sub.end_date && (
                                <Text style={s.orderCardPeriod} numberOfLines={1}>
                                  {format(parseISO(sub.start_date), 'dd MMM yyyy')} – {format(parseISO(sub.end_date), 'dd MMM yyyy')}
                                </Text>
                              )}
                            </View>
                          </View>
                          {orderRenewalBadge ? (
                            <View style={[s.renewalBadge, { backgroundColor: orderRenewalBadge.bg }]}>
                              <AlertTriangle size={10} color={orderRenewalBadge.color} strokeWidth={2} />
                              <Text style={[s.renewalBadgeText, { color: orderRenewalBadge.color }]}>{orderRenewalBadge.label}</Text>
                            </View>
                          ) : (
                            <StatusChip status={effectiveStatus} />
                          )}
                        </View>

                        {/* Info grid */}
                        <View style={s.orderCardGrid}>
                          <View style={s.orderCardInfoCell}>
                            <Text style={s.orderCardInfoLabel}>Purchase Date</Text>
                            <Text style={s.orderCardInfoValue} numberOfLines={1}>
                              {sub.created_at ? format(new Date(sub.created_at), 'dd MMM yyyy') : '—'}
                            </Text>
                          </View>
                          <View style={s.orderCardInfoCell}>
                            <Text style={s.orderCardInfoLabel}>Pay Mode</Text>
                            <Text style={s.orderCardInfoValue} numberOfLines={1}>
                              {latestPayment?.payment_mode ?? '—'}
                            </Text>
                          </View>
                          <View style={s.orderCardInfoCell}>
                            <Text style={s.orderCardInfoLabel}>Pay Date</Text>
                            <Text style={s.orderCardInfoValue} numberOfLines={1}>
                              {latestPayment?.created_at ? format(new Date(latestPayment.created_at), 'dd MMM yyyy') : '—'}
                            </Text>
                          </View>
                          <View style={s.orderCardInfoCell}>
                            <Text style={s.orderCardInfoLabel}>Pay Status</Text>
                            <View style={[s.payStatusBadge, { backgroundColor: payColor + '18', marginTop: 2 }]}>
                              <View style={[s.payStatusDot, { backgroundColor: payColor }]} />
                              <Text style={[s.payStatusText, { color: payColor }]}>
                                {payStatus === 'paid' ? 'Paid' : payStatus.charAt(0).toUpperCase() + payStatus.slice(1)}
                              </Text>
                            </View>
                          </View>
                        </View>

                        {/* Bottom row: price + chevron */}
                        <View style={s.orderCardBottom}>
                          <Text style={s.orderCardPrice}>
                            {sub.plan?.price != null ? `₹${(sub.plan.price / 100).toLocaleString('en-IN')}` : '—'}
                          </Text>
                          <ChevronRight size={16} color={Colors.textTertiary} strokeWidth={2} />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )
            )}

            {/* Customize Orders list */}
            {orderSubTab === 'customize' && (
              customOrders.length === 0 ? (
                <View style={s.emptyState}>
                  <Flower2 size={32} color={Colors.textDisabled} strokeWidth={1.2} />
                  <Text style={s.emptyTitle}>No customize orders yet</Text>
                </View>
              ) : (
                <View style={s.ordersListWrap}>
                  {customOrders.map((co: any, i: number) => {
                    const payColor = co.payment_status === 'paid' || co.payment_status === 'captured' ? Colors.success : co.payment_status === 'failed' ? Colors.error : Colors.warning;
                    return (
                      <TouchableOpacity
                        key={co.id}
                        style={s.orderCard}
                        onPress={() => router.push({ pathname: '/(admin)/custom-order-detail', params: { id: co.id } } as any)}
                        activeOpacity={0.75}
                      >
                        <View style={s.orderCardTop}>
                          <View style={s.orderCardProductWrap}>
                            <View style={[s.orderCardIconBox, { backgroundColor: Colors.accentSurface }]}>
                              <Flower2 size={15} color={Colors.accentDark} strokeWidth={2} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={s.orderCardPlan} numberOfLines={1}>{co.description ?? co.flower_type ?? 'Custom Order'}</Text>
                              {co.delivery_date && (
                                <Text style={s.orderCardPeriod} numberOfLines={1}>
                                  Delivery: {format(parseISO(co.delivery_date), 'dd MMM yyyy')}
                                </Text>
                              )}
                            </View>
                          </View>
                          <StatusChip status={co.status} />
                        </View>

                        <View style={s.orderCardGrid}>
                          <View style={s.orderCardInfoCell}>
                            <Text style={s.orderCardInfoLabel}>Created Date</Text>
                            <Text style={s.orderCardInfoValue} numberOfLines={1}>
                              {co.created_at ? format(new Date(co.created_at), 'dd MMM yyyy') : '—'}
                            </Text>
                          </View>
                          <View style={s.orderCardInfoCell}>
                            <Text style={s.orderCardInfoLabel}>Pay Mode</Text>
                            <Text style={s.orderCardInfoValue} numberOfLines={1}>
                              {co.payment_mode ?? '—'}
                            </Text>
                          </View>
                          <View style={s.orderCardInfoCell}>
                            <Text style={s.orderCardInfoLabel}>Pay Status</Text>
                            <View style={[s.payStatusBadge, { backgroundColor: payColor + '18', marginTop: 2 }]}>
                              <View style={[s.payStatusDot, { backgroundColor: payColor }]} />
                              <Text style={[s.payStatusText, { color: payColor }]}>
                                {co.payment_status ? co.payment_status.charAt(0).toUpperCase() + co.payment_status.slice(1) : '—'}
                              </Text>
                            </View>
                          </View>
                        </View>

                        <View style={s.orderCardBottom}>
                          <Text style={s.orderCardPrice}>
                            {co.quoted_price != null ? `₹${Number(co.quoted_price).toLocaleString('en-IN')}` : '—'}
                          </Text>
                          <ChevronRight size={16} color={Colors.textTertiary} strokeWidth={2} />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )
            )}
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
        {/* DELIVERIES TAB */}
        {activeTab === 'deliveries' && (() => {
          if (orders.length === 0) {
            return (
              <View style={s.emptyState}>
                <Package size={32} color={Colors.textDisabled} strokeWidth={1.2} />
                <Text style={s.emptyTitle}>No delivery records</Text>
                <Text style={s.emptySub}>Deliveries will appear here once orders are scheduled.</Text>
              </View>
            );
          }

          // Group orders by month (latest first)
          const grouped: Record<string, any[]> = {};
          orders.forEach(order => {
            const key = format(parseISO(order.scheduled_date), 'MMMM yyyy');
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(order);
          });

          const deliveredCount = orders.filter(o => o.status === 'delivered').length;
          const skippedCount = orders.filter(o => o.status === 'skipped').length;
          const pendingCount = orders.filter(o => o.status === 'pending' || o.status === 'scheduled').length;

          return (
            <>
              {/* Summary strip */}
              <View style={s.dlvSummary}>
                <View style={s.dlvSummaryItem}>
                  <Text style={[s.dlvSummaryVal, { color: Colors.success }]}>{deliveredCount}</Text>
                  <Text style={s.dlvSummaryLbl}>Delivered</Text>
                </View>
                <View style={s.dlvSummaryDivider} />
                <View style={s.dlvSummaryItem}>
                  <Text style={[s.dlvSummaryVal, { color: Colors.warning }]}>{pendingCount}</Text>
                  <Text style={s.dlvSummaryLbl}>Upcoming</Text>
                </View>
                <View style={s.dlvSummaryDivider} />
                <View style={s.dlvSummaryItem}>
                  <Text style={[s.dlvSummaryVal, { color: Colors.textTertiary }]}>{skippedCount}</Text>
                  <Text style={s.dlvSummaryLbl}>Skipped</Text>
                </View>
                <View style={s.dlvSummaryDivider} />
                <View style={s.dlvSummaryItem}>
                  <Text style={s.dlvSummaryVal}>{orders.length}</Text>
                  <Text style={s.dlvSummaryLbl}>Total Days</Text>
                </View>
              </View>

              {Object.entries(grouped).map(([month, monthOrders]) => (
                <View key={month} style={s.dlvMonthBlock}>
                  <View style={s.dlvMonthHeader}>
                    <Text style={s.dlvMonthTitle}>{month}</Text>
                    <View style={s.dlvMonthBadge}>
                      <Text style={s.dlvMonthBadgeText}>
                        {monthOrders.filter(o => o.status === 'delivered').length}/{monthOrders.length}
                      </Text>
                    </View>
                  </View>
                  <View style={s.dlvCard}>
                    {monthOrders.map((order, i) => {
                      const isDelivered = order.status === 'delivered';
                      const isPending = order.status === 'pending' || order.status === 'scheduled';
                      const isSkipped = order.status === 'skipped';
                      const isFailed = order.status === 'failed';
                      const dotColor = isDelivered ? Colors.success : isPending ? Colors.warning : isFailed ? Colors.error : Colors.textDisabled;
                      const bgColor = isDelivered ? Colors.successSurface : isPending ? Colors.warningSurface : isFailed ? Colors.errorSurface : Colors.neutral[100];
                      const statusLabel = isDelivered ? 'Delivered' : isPending ? 'Upcoming' : order.status.charAt(0).toUpperCase() + order.status.slice(1);

                      return (
                        <TouchableOpacity
                          key={order.id}
                          style={[s.dlvRow, i > 0 && s.dlvRowBorder]}
                          onPress={() => router.push({ pathname: '/(admin)/order-detail', params: { id: order.id } } as any)}
                          activeOpacity={0.7}
                        >
                          <View style={[s.dlvDot, { backgroundColor: dotColor }]} />
                          <View style={s.dlvInfo}>
                            <Text style={s.dlvDate}>
                              {format(parseISO(order.scheduled_date), 'EEE, dd MMM yyyy')}
                            </Text>
                            {order.delivered_at && (
                              <Text style={s.dlvTime}>
                                Delivered at {format(new Date(order.delivered_at), 'HH:mm')}
                              </Text>
                            )}
                            {order.admin_note && (
                              <Text style={s.dlvNote} numberOfLines={1}>{order.admin_note}</Text>
                            )}
                          </View>
                          <View style={[s.dlvStatusBadge, { backgroundColor: bgColor }]}>
                            <Text style={[s.dlvStatusText, { color: dotColor }]}>{statusLabel}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </>
          );
        })()}

        {/* LOGINS TAB */}
        {activeTab === 'logins' && (() => {
          if (loginLogs.length === 0) {
            return (
              <View style={s.emptyState}>
                <Smartphone size={32} color={Colors.textDisabled} strokeWidth={1.2} />
                <Text style={s.emptyTitle}>No login records</Text>
                <Text style={s.emptySub}>Login activity from the mobile app will appear here.</Text>
              </View>
            );
          }

          // Platform counts
          const androidCount = loginLogs.filter(l => l.platform?.toLowerCase() === 'android').length;
          const iosCount = loginLogs.filter(l => l.platform?.toLowerCase() === 'ios').length;
          const webCount = loginLogs.filter(l => l.platform?.toLowerCase() === 'web' || !l.platform).length;

          return (
            <>
              {/* Platform summary */}
              <View style={s.loginSummary}>
                <View style={s.loginSummaryItem}>
                  <Text style={s.loginSummaryVal}>{loginLogs.length}</Text>
                  <Text style={s.loginSummaryLbl}>Total Logins</Text>
                </View>
                <View style={s.loginSummaryDivider} />
                {androidCount > 0 && (
                  <>
                    <View style={s.loginSummaryItem}>
                      <Text style={[s.loginSummaryVal, { color: '#2E7D32' }]}>{androidCount}</Text>
                      <Text style={s.loginSummaryLbl}>Android</Text>
                    </View>
                    <View style={s.loginSummaryDivider} />
                  </>
                )}
                {iosCount > 0 && (
                  <>
                    <View style={s.loginSummaryItem}>
                      <Text style={[s.loginSummaryVal, { color: '#1565C0' }]}>{iosCount}</Text>
                      <Text style={s.loginSummaryLbl}>iOS</Text>
                    </View>
                    <View style={s.loginSummaryDivider} />
                  </>
                )}
                {webCount > 0 && (
                  <View style={s.loginSummaryItem}>
                    <Text style={s.loginSummaryVal}>{webCount}</Text>
                    <Text style={s.loginSummaryLbl}>Web</Text>
                  </View>
                )}
              </View>

              <View style={s.loginCard}>
                {/* Header row */}
                <View style={s.loginTableHead}>
                  <Text style={[s.loginThCell, { flex: 1 }]}>Platform</Text>
                  <Text style={[s.loginThCell, { flex: 1.8 }]}>Device</Text>
                  <Text style={[s.loginThCell, { flex: 0.8 }]}>Version</Text>
                  <Text style={[s.loginThCell, { flex: 0.8 }]}>OS</Text>
                  <Text style={[s.loginThCell, { flex: 1.6, textAlign: 'right' }]}>Login Time</Text>
                </View>
                {loginLogs.map((log, i) => {
                  const p = (log.platform ?? '').toLowerCase();
                  const platformColor = p === 'android' ? '#2E7D32' : p === 'ios' ? '#1565C0' : Colors.textSecondary;
                  const platformBg = p === 'android' ? '#E8F5E9' : p === 'ios' ? '#E3F2FD' : Colors.neutral[100];
                  const platformLabel = p === 'android' ? 'Android' : p === 'ios' ? 'iOS' : 'Web';
                  return (
                    <View key={log.id} style={[s.loginTableRow, i % 2 === 1 && s.loginTableRowAlt]}>
                      <View style={{ flex: 1 }}>
                        <View style={[s.loginPlatformBadge, { backgroundColor: platformBg }]}>
                          {p === 'android' ? <Smartphone size={11} color={platformColor} strokeWidth={2} /> :
                           p === 'ios' ? <Apple size={11} color={platformColor} strokeWidth={2} /> :
                           <Monitor size={11} color={platformColor} strokeWidth={2} />}
                          <Text style={[s.loginPlatformText, { color: platformColor }]}>{platformLabel}</Text>
                        </View>
                      </View>
                      <Text style={[s.loginTdCell, { flex: 1.8 }]} numberOfLines={1}>{log.device_model || '—'}</Text>
                      <Text style={[s.loginTdCell, { flex: 0.8 }]}>{log.app_version || '—'}</Text>
                      <Text style={[s.loginTdCell, { flex: 0.8 }]} numberOfLines={1}>{log.os_version || '—'}</Text>
                      <View style={{ flex: 1.6, alignItems: 'flex-end' }}>
                        <Text style={s.loginTdTime}>{format(new Date(log.logged_in_at), 'dd MMM yyyy')}</Text>
                        <Text style={s.loginTdAgo}>{format(new Date(log.logged_in_at), 'HH:mm')}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          );
        })()}

        {/* PAUSES TAB */}
        {activeTab === 'pauses' && (() => {
          if (pauseHistory.length === 0) {
            return (
              <View style={s.emptyState}>
                <PauseCircle size={32} color={Colors.textDisabled} strokeWidth={1.2} />
                <Text style={s.emptyTitle}>No pause history</Text>
                <Text style={s.emptySub}>Subscription pause events will appear here.</Text>
              </View>
            );
          }

          return (
            <>
              {/* Summary banner */}
              <View style={s.lcSummaryBanner}>
                <View style={s.lcSummaryItem}>
                  <Text style={s.lcSummaryValue}>{pauseHistory.length}</Text>
                  <Text style={s.lcSummaryLabel}>Total Pauses</Text>
                </View>
                <View style={s.lcSummaryDivider} />
                <View style={s.lcSummaryItem}>
                  <Text style={s.lcSummaryValue}>{pauseHistory.filter((ph: any) => !!ph.resumed_at).length}</Text>
                  <Text style={s.lcSummaryLabel}>Resumed Early</Text>
                </View>
                <View style={s.lcSummaryDivider} />
                <View style={s.lcSummaryItem}>
                  <Text style={s.lcSummaryValue}>
                    {pauseHistory.reduce((total: number, ph: any) => {
                      if (!ph.pause_start_date || !ph.pause_until) return total;
                      return total + differenceInDays(parseISO(ph.pause_until), parseISO(ph.pause_start_date)) + 1;
                    }, 0)}d
                  </Text>
                  <Text style={s.lcSummaryLabel}>Total Days Paused</Text>
                </View>
                <View style={s.lcSummaryDivider} />
                <View style={s.lcSummaryItem}>
                  <Text style={s.lcSummaryValue}>{pauseHistory.filter((ph: any) => ph.is_cancelled).length}</Text>
                  <Text style={s.lcSummaryLabel}>Cancelled</Text>
                </View>
              </View>

              <View style={s.lcTimeline}>
                {pauseHistory.map((ph: any, idx: number) => {
                  const isLast = idx === pauseHistory.length - 1;
                  const pauseStart = ph.pause_start_date ? parseISO(ph.pause_start_date) : null;
                  const pauseEnd   = ph.pause_until      ? parseISO(ph.pause_until)      : null;
                  const pausedDays = pauseStart && pauseEnd
                    ? differenceInDays(pauseEnd, pauseStart) + 1
                    : null;
                  const isCancelled = ph.is_cancelled;
                  const isResumed   = !!ph.resumed_at;
                  const isActive    = !isCancelled && !isResumed && pauseEnd && pauseEnd >= new Date();

                  const dotColor = isCancelled ? Colors.error
                    : isResumed ? Colors.accent
                    : isActive  ? Colors.warning
                    : Colors.success;

                  const chipBg = isCancelled ? Colors.errorSurface
                    : isResumed ? Colors.accentSurface
                    : isActive  ? Colors.warningSurface
                    : Colors.successSurface;

                  const chipColor = isCancelled ? Colors.error
                    : isResumed ? Colors.accentDark
                    : isActive  ? Colors.warning
                    : Colors.success;

                  const chipLabel = isCancelled ? 'Cancelled'
                    : isResumed ? 'Resumed Early'
                    : isActive  ? 'Active Pause'
                    : 'Completed';

                  const planName = ph.subscription?.plan?.name ?? subscriptions.find((s: any) => s.id === ph.subscription_id)?.plan?.name ?? 'Subscription';

                  return (
                    <View key={ph.id} style={s.lcTimelineRow}>
                      <View style={s.lcTimelineLeft}>
                        <View style={[s.lcTimelineDot, { backgroundColor: dotColor }]} />
                        {!isLast && <View style={s.lcTimelineLine} />}
                      </View>

                      <View style={[s.pauseTlCard, isLast && { marginBottom: 0 }]}>
                        {/* Header */}
                        <View style={s.pauseTlHeader}>
                          <View style={s.pauseTlTitleRow}>
                            <PauseCircle size={13} color={Colors.textTertiary} strokeWidth={2} />
                            <Text style={s.pauseTlPlan} numberOfLines={1}>{planName}</Text>
                          </View>
                          <View style={[s.pauseTlChip, { backgroundColor: chipBg }]}>
                            <Text style={[s.pauseTlChipText, { color: chipColor }]}>{chipLabel}</Text>
                          </View>
                        </View>

                        {/* Date range */}
                        <View style={s.pauseTlDateRow}>
                          <View style={s.pauseTlDateBlock}>
                            <Text style={s.pauseTlDateLabel}>Paused From</Text>
                            <View style={s.pauseTlDateInner}>
                              <Calendar size={11} color={Colors.textTertiary} strokeWidth={2} />
                              <Text style={s.pauseTlDateValue}>
                                {pauseStart ? format(pauseStart, 'dd MMM yyyy') : '—'}
                              </Text>
                            </View>
                          </View>
                          <View style={s.pauseTlDateSep} />
                          <View style={s.pauseTlDateBlock}>
                            <Text style={s.pauseTlDateLabel}>Paused Until</Text>
                            <View style={s.pauseTlDateInner}>
                              <Calendar size={11} color={Colors.textTertiary} strokeWidth={2} />
                              <Text style={s.pauseTlDateValue}>
                                {pauseEnd ? format(pauseEnd, 'dd MMM yyyy') : '—'}
                              </Text>
                            </View>
                          </View>
                          <View style={s.pauseTlDateSep} />
                          <View style={s.pauseTlDateBlock}>
                            <Text style={s.pauseTlDateLabel}>Duration</Text>
                            <View style={s.pauseTlDateInner}>
                              <Clock size={11} color={Colors.textTertiary} strokeWidth={2} />
                              <Text style={[s.pauseTlDateValue, { color: Colors.textPrimary, fontFamily: Typography.fontFamily.sansSemiBold }]}>
                                {pausedDays !== null ? `${pausedDays} day${pausedDays !== 1 ? 's' : ''}` : '—'}
                              </Text>
                            </View>
                          </View>
                        </View>

                        {/* Renew / extended end date */}
                        {(() => {
                          if (isCancelled) return null;
                          const sub = subscriptions.find((s: any) => s.id === ph.subscription_id);
                          const subEnd = sub?.end_date;
                          if (!subEnd || !pauseStart || !pauseEnd) return null;
                          const pauseDays = differenceInDays(pauseEnd, pauseStart) + 1;
                          const extendedEnd = new Date(parseISO(subEnd).getTime() + pauseDays * 86400000);
                          return (
                            <View style={[s.pauseTlResumedRow, { backgroundColor: Colors.primarySurface }]}>
                              <RefreshCw size={11} color={Colors.primary} strokeWidth={2} />
                              <Text style={[s.pauseTlResumedText, { color: Colors.primary }]}>
                                Renew / extended end date: {format(extendedEnd, 'dd MMM yyyy')}
                              </Text>
                            </View>
                          );
                        })()}

                        {/* Resumed early note */}
                        {isResumed && ph.resumed_at && (
                          <View style={s.pauseTlResumedRow}>
                            <RefreshCw size={11} color={Colors.accentDark} strokeWidth={2} />
                            <Text style={s.pauseTlResumedText}>
                              Resumed early on {format(parseISO(ph.resumed_at), 'dd MMM yyyy')}
                            </Text>
                          </View>
                        )}

                        {isCancelled && (
                          <View style={[s.pauseTlResumedRow, { backgroundColor: Colors.errorSurface }]}>
                            <Ban size={11} color={Colors.error} strokeWidth={2} />
                            <Text style={[s.pauseTlResumedText, { color: Colors.error }]}>Pause was cancelled</Text>
                          </View>
                        )}

                        <Text style={s.pauseTlMeta}>
                          Recorded {format(new Date(ph.created_at), 'dd MMM yyyy, HH:mm')}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          );
        })()}

        {/* PROFILE TAB */}
        {activeTab === 'profile' && (
          <View style={s.profileCard}>
            {/* Avatar */}
            <View style={s.profileAvatarWrap}>
              <View style={s.profileAvatar}>
                <Text style={s.profileAvatarText}>{profile.full_name?.charAt(0)?.toUpperCase() ?? '?'}</Text>
              </View>
              <View style={s.profileAvatarInfo}>
                <Text style={s.profileAvatarName}>{profile.full_name ?? '—'}</Text>
                <View style={[s.profileRoleBadge, { backgroundColor: Colors.primarySurface }]}>
                  <Text style={[s.profileRoleText, { color: Colors.primary }]}>{profile.role ?? 'customer'}</Text>
                </View>
              </View>
            </View>

            <View style={s.profileDivider} />

            <ProfileField label="Mobile" value={profile.mobile ?? '—'} />
            <ProfileField label="Email" value={profile.email ?? '—'} />
            <ProfileField label="Date of Birth" value={profile.date_of_birth ? format(parseISO(profile.date_of_birth), 'dd MMM yyyy') : '—'} />
            <ProfileField label="Gender" value={profile.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : '—'} />
            <ProfileField label="About" value={profile.about ?? '—'} />

            <View style={s.profileDivider} />

            <ProfileField label="Address" value={(() => { const a = addresses.slice().sort((x: any, y: any) => (y.is_default ? 1 : 0) - (x.is_default ? 1 : 0))[0]; if (!a) return '—'; const parts = [a.apartment_name, a.street, a.landmark].filter(Boolean); return parts.join(', ') || '—'; })()} />

            <ProfileField label="SMS Notifications" value={profile.notification_sms ? 'Enabled' : 'Disabled'} valueColor={profile.notification_sms ? Colors.success : Colors.textTertiary} />
            <ProfileField label="WhatsApp Notifications" value={profile.notification_whatsapp ? 'Enabled' : 'Disabled'} valueColor={profile.notification_whatsapp ? Colors.success : Colors.textTertiary} />
            <ProfileField label="Verified" value={profile.is_verified ? 'Yes' : 'No'} valueColor={profile.is_verified ? Colors.success : Colors.error} />

            <View style={s.profileDivider} />

            <ProfileField label="Member Since" value={format(new Date(profile.created_at), 'dd MMM yyyy, HH:mm')} />
            <ProfileField label="Last Updated" value={profile.updated_at ? format(new Date(profile.updated_at), 'dd MMM yyyy, HH:mm') : '—'} />
            <ProfileField label="User ID" value={profile.id} mono />
          </View>
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

      {/* Pause Details Modal */}
      {pauseModalSub && (() => {
        const sub = pauseModalSub;
        const subPauseHistory = pauseHistory.filter(ph => ph.subscription_id === sub.id);
        const totalPausedDays = subPauseHistory.reduce((acc, ph) => {
          if (ph.is_cancelled || !ph.pause_start_date || !ph.pause_until) return acc;
          return acc + differenceInDays(parseISO(ph.pause_until), parseISO(ph.pause_start_date)) + 1;
        }, 0);
        return (
          <Modal visible transparent animationType="fade" onRequestClose={() => setPauseModalSub(null)}>
            <View style={s.overlay}>
              <View style={[s.pauseModal, isWeb && s.pauseModalWeb]}>
                {/* Modal Header */}
                <View style={s.pauseModalHeader}>
                  <View style={s.pauseModalHeaderLeft}>
                    <View style={s.pauseModalIconWrap}>
                      <PauseCircle size={18} color={Colors.accentDark} strokeWidth={1.8} />
                    </View>
                    <View>
                      <Text style={s.pauseModalTitle}>Pause Details</Text>
                      <Text style={s.pauseModalSubtitle}>{sub.plan?.name} · {sub.plan?.frequency}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setPauseModalSub(null)} style={s.pauseModalClose}>
                    <X size={18} color={Colors.textSecondary} strokeWidth={1.8} />
                  </TouchableOpacity>
                </View>

                {/* Current pause info banner */}
                {sub.pause_start_date && sub.pause_until && (
                  <View style={s.pauseCurrentBanner}>
                    <View style={s.pauseCurrentBannerRow}>
                      <View style={s.pauseCurrentDot} />
                      <Text style={s.pauseCurrentBannerLabel}>Currently Paused</Text>
                    </View>
                    <View style={s.pauseCurrentDates}>
                      <View style={s.pauseCurrentDateBlock}>
                        <Text style={s.pauseCurrentDateLabel}>Paused From</Text>
                        <Text style={s.pauseCurrentDateValue}>{format(parseISO(sub.pause_start_date), 'dd MMM yyyy')}</Text>
                      </View>
                      <View style={s.pauseCurrentDateDivider} />
                      <View style={s.pauseCurrentDateBlock}>
                        <Text style={s.pauseCurrentDateLabel}>Paused Until</Text>
                        <Text style={s.pauseCurrentDateValue}>{format(parseISO(sub.pause_until), 'dd MMM yyyy')}</Text>
                      </View>
                      <View style={s.pauseCurrentDateDivider} />
                      <View style={s.pauseCurrentDateBlock}>
                        <Text style={s.pauseCurrentDateLabel}>Extended End</Text>
                        <Text style={[s.pauseCurrentDateValue, { color: Colors.primary }]}>
                          {sub.end_date ? format(new Date(parseISO(sub.end_date).getTime() + (differenceInDays(parseISO(sub.pause_until), parseISO(sub.pause_start_date)) + 1) * 86400000), 'dd MMM yyyy') : '—'}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* Summary stats */}
                <View style={s.pauseStatRow}>
                  <View style={s.pauseStatBox}>
                    <Text style={s.pauseStatValue}>{subPauseHistory.length}</Text>
                    <Text style={s.pauseStatLabel}>Total Pauses</Text>
                  </View>
                  <View style={s.pauseStatBox}>
                    <Text style={s.pauseStatValue}>{totalPausedDays}</Text>
                    <Text style={s.pauseStatLabel}>Days Paused</Text>
                  </View>
                  <View style={s.pauseStatBox}>
                    <Text style={s.pauseStatValue}>{subPauseHistory.filter(ph => !!ph.resumed_at).length}</Text>
                    <Text style={s.pauseStatLabel}>Times Resumed</Text>
                  </View>
                </View>

                {/* History list */}
                <Text style={s.pauseHistoryHeading}>Pause / Resume History</Text>
                <ScrollView style={s.pauseHistoryScroll} showsVerticalScrollIndicator={false}>
                  {subPauseHistory.map((ph, i) => {
                    const pauseStart = ph.pause_start_date ? parseISO(ph.pause_start_date) : null;
                    const pauseEnd   = ph.pause_until      ? parseISO(ph.pause_until)      : null;
                    const pausedDays = pauseStart && pauseEnd ? differenceInDays(pauseEnd, pauseStart) + 1 : null;
                    const isCancelled = ph.is_cancelled;
                    const isResumed   = !!ph.resumed_at;
                    const actionColor = isCancelled ? Colors.error : isResumed ? Colors.success : '#E65100';
                    const actionBg    = isCancelled ? '#FFF0F0' : isResumed ? '#E8F5E9' : '#FFF3E0';
                    const actionLabel = isCancelled ? 'Cancelled' : isResumed ? 'Resumed' : 'Active Pause';
                    return (
                      <View key={ph.id} style={[s.pauseHistoryCard, i > 0 && { marginTop: Spacing[3] }]}>
                        <View style={s.pauseHistoryCardHeader}>
                          <View style={[s.pauseHistoryBadge, { backgroundColor: actionBg }]}>
                            <Text style={[s.pauseHistoryBadgeText, { color: actionColor }]}>{actionLabel}</Text>
                          </View>
                          {pausedDays !== null && (
                            <View style={s.pauseHistoryDuration}>
                              <Text style={s.pauseHistoryDurationText}>{pausedDays} days</Text>
                            </View>
                          )}
                          <Text style={s.pauseHistoryIndex}>#{i + 1}</Text>
                        </View>
                        <View style={s.pauseHistoryRows}>
                          <View style={s.pauseHistoryRow}>
                            <Text style={s.pauseHistoryRowLabel}>Pause Start</Text>
                            <Text style={s.pauseHistoryRowValue}>{pauseStart ? format(pauseStart, 'dd MMM yyyy') : '—'}</Text>
                          </View>
                          <View style={s.pauseHistoryRow}>
                            <Text style={s.pauseHistoryRowLabel}>Pause Until</Text>
                            <Text style={s.pauseHistoryRowValue}>{pauseEnd ? format(pauseEnd, 'dd MMM yyyy') : '—'}</Text>
                          </View>
                          {ph.resumed_at && (
                            <View style={s.pauseHistoryRow}>
                              <Text style={s.pauseHistoryRowLabel}>Resumed On</Text>
                              <Text style={[s.pauseHistoryRowValue, { color: Colors.success }]}>{format(parseISO(ph.resumed_at), 'dd MMM yyyy · HH:mm')}</Text>
                            </View>
                          )}
                          <View style={s.pauseHistoryRow}>
                            <Text style={s.pauseHistoryRowLabel}>Logged On</Text>
                            <Text style={s.pauseHistoryRowValue}>{format(parseISO(ph.created_at), 'dd MMM yyyy · HH:mm')}</Text>
                          </View>
                          {isCancelled && (
                            <View style={[s.pauseHistoryRow, { backgroundColor: '#FFF5F5', borderRadius: Radius.sm, padding: Spacing[2] }]}>
                              <Text style={[s.pauseHistoryRowLabel, { color: Colors.error }]}>Note</Text>
                              <Text style={[s.pauseHistoryRowValue, { color: Colors.error }]}>Pause cancelled before start</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>

                <TouchableOpacity style={[s.saveBtn, { marginTop: Spacing[4] }]} onPress={() => setPauseModalSub(null)}>
                  <Text style={s.saveBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        );
      })()}
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

function ProfileField({ label, value, mono, valueColor }: { label: string; value: string; mono?: boolean; valueColor?: string }) {
  return (
    <View style={s.pfRow}>
      <Text style={s.pfLabel}>{label}</Text>
      <Text style={[s.pfValue, mono && s.pfValueMono, valueColor ? { color: valueColor } : {}]} numberOfLines={mono ? 1 : 3}>{value}</Text>
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
  tabScroll: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, flexGrow: 0, flexShrink: 0 },
  tabScrollContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], gap: Spacing[2] },
  tabScrollContentWeb: { paddingHorizontal: Spacing[8] },
  tab: { height: 34, justifyContent: 'center', paddingHorizontal: Spacing[4], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
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

  // Orders tab styles
  orderSubTabRow: { flexDirection: 'row', gap: Spacing[2] },
  orderSubTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2], paddingVertical: Spacing[3], paddingHorizontal: Spacing[3], borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white },
  orderSubTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  orderSubTabText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  orderSubTabTextActive: { color: Colors.white },
  orderSubTabBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.full, backgroundColor: Colors.neutral[100] },
  orderSubTabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  orderSubTabBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.textSecondary },
  orderSubTabBadgeTextActive: { color: Colors.white },
  ordersListWrap: { flexDirection: 'column', gap: Spacing[3] },
  orderCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing[4],
    ...Shadow.sm,
  },
  orderCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[3],
  },
  orderCardProductWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    flex: 1,
    marginRight: Spacing[3],
  },
  orderCardIconBox: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderCardPlan: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  orderCardPeriod: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  orderCardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[4],
    paddingBottom: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  orderCardInfoCell: {
    minWidth: 90,
    flex: 1,
  },
  orderCardInfoLabel: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: 10,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  orderCardInfoValue: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textPrimary,
  },
  orderCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing[3],
  },
  orderCardPrice: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  payStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.full },
  payStatusDot: { width: 6, height: 6, borderRadius: 3 },
  payStatusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },

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

  // Pause history inline inside summary card
  pauseInlineSection: { borderTopWidth: 1, borderTopColor: Colors.divider, marginTop: 2 },
  pauseInlineHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], backgroundColor: Colors.neutral[50] },
  pauseInlineTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  pauseInlineCount: { marginLeft: 2, backgroundColor: Colors.primary + '18', borderRadius: Radius.full, paddingHorizontal: Spacing[2], paddingVertical: 1 },
  pauseInlineCountText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.primary },
  pauseInlineRow: { paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3] },
  pauseInlineRowBorder: { borderTopWidth: 1, borderTopColor: Colors.divider },
  pauseInlineBadge: { paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.full, alignSelf: 'flex-start', minWidth: 68, alignItems: 'center' },
  pauseInlineBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  pauseInlineDetails: { flex: 1, gap: Spacing[2] },
  pauseInlineDetailRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1] },
  pauseInlineDetailLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 12, color: Colors.textTertiary, width: 62 },
  pauseInlineDetailValue: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 12, color: Colors.textPrimary, flex: 1 },

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

  // Status row with View Details button
  statusRowRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  pauseDetailBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: Spacing[1], paddingHorizontal: Spacing[3], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.accentDark + '60', backgroundColor: Colors.accentSurface },
  pauseDetailBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.accentDark },

  // Pause Details Modal
  pauseModal: { width: '100%', maxHeight: '90%', backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[5], gap: Spacing[4] },
  pauseModalWeb: { maxWidth: 520 },
  pauseModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pauseModalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  pauseModalIconWrap: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.accentSurface, alignItems: 'center', justifyContent: 'center' },
  pauseModalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  pauseModalSubtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 1 },
  pauseModalClose: { padding: Spacing[1] },

  // Current pause banner
  pauseCurrentBanner: { backgroundColor: '#FFF8E1', borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: '#FFE082', gap: Spacing[3] },
  pauseCurrentBannerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  pauseCurrentDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.warning },
  pauseCurrentBannerLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.warning },
  pauseCurrentDates: { flexDirection: 'row', alignItems: 'center' },
  pauseCurrentDateBlock: { flex: 1, alignItems: 'center', gap: 3 },
  pauseCurrentDateDivider: { width: 1, height: 36, backgroundColor: '#FFE082' },
  pauseCurrentDateLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary },
  pauseCurrentDateValue: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },

  // Stats row
  pauseStatRow: { flexDirection: 'row', gap: Spacing[3] },
  pauseStatBox: { flex: 1, backgroundColor: Colors.neutral[50], borderRadius: Radius.lg, padding: Spacing[4], alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.border },
  pauseStatValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  pauseStatLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary, textAlign: 'center' },

  // History list
  pauseHistoryHeading: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 },
  pauseHistoryScroll: { maxHeight: 320 },
  pauseHistoryCard: { backgroundColor: Colors.neutral[50], borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  pauseHistoryCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  pauseHistoryBadge: { paddingHorizontal: Spacing[3], paddingVertical: 3, borderRadius: Radius.full },
  pauseHistoryBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 12 },
  pauseHistoryDuration: { marginLeft: 4, backgroundColor: Colors.primarySurface, paddingHorizontal: Spacing[2], paddingVertical: 2, borderRadius: Radius.full },
  pauseHistoryDurationText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.primary },
  pauseHistoryIndex: { marginLeft: 'auto' as any, fontFamily: Typography.fontFamily.sansRegular, fontSize: 12, color: Colors.textTertiary },
  pauseHistoryRows: { gap: 0 },
  pauseHistoryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], borderTopWidth: 1, borderTopColor: Colors.divider },
  pauseHistoryRowLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary },
  pauseHistoryRowValue: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },

  // Lifecycle tab
  lcSummaryBanner: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing[4], ...Shadow.sm },
  lcSummaryItem: { flex: 1, alignItems: 'center', gap: 3 },
  lcSummaryDivider: { width: 1, backgroundColor: Colors.divider, marginVertical: 4 },
  lcSummaryValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary },
  lcSummaryLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary, textAlign: 'center' },

  lcFirstJoined: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.primarySurface, borderRadius: Radius.md, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], borderWidth: 1, borderColor: Colors.primary + '30' },
  lcFirstJoinedText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.primary },

  lcTimeline: { gap: 0 },
  lcTimelineRow: { flexDirection: 'row', gap: Spacing[3] },
  lcTimelineLeft: { alignItems: 'center', width: 32 },
  lcTimelineDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: Colors.border },
  lcTimelineLine: { width: 2, flex: 1, backgroundColor: Colors.border, minHeight: 16 },

  lcPeriodCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing[4], gap: Spacing[3], ...Shadow.sm },
  lcPeriodHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lcPeriodHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flex: 1 },
  lcPeriodNumber: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  lcPeriodNumberText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  lcPeriodTitleWrap: { flex: 1 },
  lcPeriodPlan: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  lcPeriodFreq: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary, marginTop: 1 },

  lcStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.full },
  lcStatusDot: { width: 6, height: 6, borderRadius: 3 },
  lcStatusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },

  lcPeriodDates: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.neutral[50], borderRadius: Radius.md, padding: Spacing[3] },
  lcDateBlock: { flex: 1, gap: 3 },
  lcDateLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  lcDateValue: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  lcDateArrow: { alignItems: 'center', gap: 3, paddingHorizontal: Spacing[3] },
  lcDateArrowLine: { height: 1, width: 20, backgroundColor: Colors.border },
  lcDateDuration: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.textTertiary, backgroundColor: Colors.neutral[200], paddingHorizontal: 5, paddingVertical: 2, borderRadius: Radius.sm },

  lcPayRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  lcPayText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 12, color: Colors.textSecondary },

  lcPauseRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  lcPauseText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 12, color: Colors.accentDark },

  lcRenewalConnector: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing[2], paddingHorizontal: Spacing[2] },
  lcRenewalConnectorLine: { flex: 1, height: 1, backgroundColor: Colors.primary + '40' },
  lcRenewalBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing[3], paddingVertical: Spacing[1], backgroundColor: Colors.primarySurface, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.primary + '30', marginHorizontal: Spacing[2] },
  lcRenewalBadgeText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11, color: Colors.primary },

  lcGapBlock: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing[2], paddingHorizontal: Spacing[2] },
  lcGapLine: { flex: 1, height: 1, backgroundColor: Colors.error + '40' },
  lcGapBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing[3], paddingVertical: Spacing[1], backgroundColor: Colors.errorSurface, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.error + '30', marginHorizontal: Spacing[2] },
  lcGapText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11, color: Colors.error },

  lcConnectorLine: { width: 2, height: 16, backgroundColor: Colors.border, alignSelf: 'center', marginVertical: 2 },

  lcTodayCap: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], marginTop: Spacing[2], paddingLeft: Spacing[1] },
  lcTodayDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary, borderWidth: 2, borderColor: Colors.primaryLight },
  lcTodayText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textTertiary },

  // Deliveries tab
  dlvSummary: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing[4], ...Shadow.sm },
  dlvSummaryItem: { flex: 1, alignItems: 'center', gap: 3 },
  dlvSummaryDivider: { width: 1, backgroundColor: Colors.divider, marginVertical: 4 },
  dlvSummaryVal: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary },
  dlvSummaryLbl: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary, textAlign: 'center' },
  dlvMonthBlock: { gap: Spacing[2] },
  dlvMonthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing[1] },
  dlvMonthTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 },
  dlvMonthBadge: { backgroundColor: Colors.primarySurface, paddingHorizontal: Spacing[2], paddingVertical: 2, borderRadius: Radius.full },
  dlvMonthBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.primary },
  dlvCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  dlvRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], gap: Spacing[3] },
  dlvRowBorder: { borderTopWidth: 1, borderTopColor: Colors.divider },
  dlvDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  dlvInfo: { flex: 1, gap: 2 },
  dlvDate: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  dlvTime: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.success },
  dlvNote: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  dlvStatusBadge: { paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.full },
  dlvStatusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },

  // Logins tab
  loginSummary: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing[4], ...Shadow.sm },
  loginSummaryItem: { flex: 1, alignItems: 'center', gap: 3 },
  loginSummaryDivider: { width: 1, backgroundColor: Colors.divider, marginVertical: 4 },
  loginSummaryVal: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary },
  loginSummaryLbl: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary, textAlign: 'center' },
  loginCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  loginTableHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], backgroundColor: Colors.neutral[50], borderBottomWidth: 1, borderBottomColor: Colors.border },
  loginThCell: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  loginTableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  loginTableRowAlt: { backgroundColor: Colors.neutral[50] },
  loginPlatformBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.sm, alignSelf: 'flex-start' },
  loginPlatformText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11 },
  loginTdCell: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textPrimary, paddingRight: Spacing[2] },
  loginTdTime: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textPrimary, textAlign: 'right' },
  loginTdAgo: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary, textAlign: 'right', marginTop: 1 },

  // Profile tab
  profileCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  profileAvatarWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing[4], padding: Spacing[5] },
  profileAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.white },
  profileAvatarInfo: { flex: 1, gap: Spacing[2] },
  profileAvatarName: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  profileRoleBadge: { alignSelf: 'flex-start', paddingHorizontal: Spacing[3], paddingVertical: 3, borderRadius: Radius.full },
  profileRoleText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, textTransform: 'capitalize' },
  profileDivider: { height: 1, backgroundColor: Colors.divider, marginHorizontal: Spacing[5] },
  pfRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], borderTopWidth: 1, borderTopColor: Colors.divider },
  pfLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary, flex: 1 },
  pfValue: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, flex: 1.5, textAlign: 'right' },
  pfValueMono: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11, letterSpacing: 0.3, color: Colors.textTertiary },

  // Pause timeline tab cards
  pauseTlCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing[4],
    marginBottom: Spacing[4],
    gap: Spacing[3],
    ...Shadow.sm,
  },
  pauseTlHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing[2] },
  pauseTlTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  pauseTlPlan: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary, flex: 1 },
  pauseTlChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  pauseTlChipText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, letterSpacing: 0.2 },
  pauseTlDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    padding: Spacing[3],
  },
  pauseTlDateBlock: { flex: 1, gap: 4 },
  pauseTlDateLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  pauseTlDateInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pauseTlDateValue: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  pauseTlDateSep: { width: 1, height: 32, backgroundColor: Colors.border },
  pauseTlResumedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.accentSurface, borderRadius: Radius.md,
    paddingHorizontal: Spacing[3], paddingVertical: Spacing[2],
  },
  pauseTlResumedText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.accentDark },
  pauseTlMeta: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textDisabled },
});
