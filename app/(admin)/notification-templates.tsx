import React, { useEffect, useState, useCallback } from 'react';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, Switch, TextInput, Modal,
  KeyboardAvoidingView, RefreshControl, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import {
  Plus, X, ChevronDown, ChevronUp, MessageSquare,
  MessageCircle, Bell, Smartphone, Pencil, Trash2,
  ShieldCheck, Zap, Clock,
} from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { NotificationTemplate, NotificationChannel, NotificationEventType } from '@/types/database';

const EVENT_TYPE_LABELS: Record<string, string> = {
  subscription_expiring_3days: 'Subscription Expiring (3 Days)',
  subscription_expiring_1day: 'Subscription Expiring (1 Day)',
  subscription_expired: 'Subscription Expired',
  subscription_renewed: 'Subscription Renewed',
  subscription_activated: 'Subscription Activated',
  subscription_paused: 'Subscription Paused',
  payment_pending: 'Payment Pending',
  payment_received: 'Payment Received',
  renewal_due: 'Renewal Due',
  order_dispatched: 'Order Dispatched',
  order_delivered: 'Order Delivered',
  custom: 'Custom',
};

const EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS) as NotificationEventType[];

const CHANNEL_CONFIG: Record<NotificationChannel, { label: string; color: string; bg: string }> = {
  sms: { label: 'SMS', color: '#1565C0', bg: '#E3F2FD' },
  whatsapp: { label: 'WhatsApp', color: '#2E7D32', bg: '#E8F5E9' },
  push: { label: 'Push', color: '#E65100', bg: '#FFF3E0' },
  in_app: { label: 'In-App', color: '#6A1B9A', bg: '#F3E5F5' },
};

const VARIABLES = [
  '{{customer_name}}', '{{mobile}}', '{{plan_name}}',
  '{{end_date}}', '{{days_left}}', '{{amount}}',
  '{{subscription_status}}', '{{order_date}}', '{{payment_id}}',
];

const CHANNELS: NotificationChannel[] = ['sms', 'whatsapp', 'push', 'in_app'];

const emptyForm = {
  name: '',
  event_type: '' as NotificationEventType | '',
  channel: '' as NotificationChannel | '',
  is_active: true,
  is_automated: false,
  subject: '',
  body: '',
  msg91_template_id: '',
  msg91_whatsapp_template_id: '',
  msg91_whatsapp_namespace: '',
  send_at_days_before: '',
};

// Event types that support time-based automation (days before end date)
const TIME_BASED_EVENTS: NotificationEventType[] = [
  'subscription_expiring_3days',
  'subscription_expiring_1day',
  'renewal_due',
];

// Event types the cron job can automate (but not time-based — fire when status changes)
const STATUS_BASED_EVENTS: NotificationEventType[] = [
  'subscription_expired',
  'subscription_activated',
  'subscription_renewed',
  'subscription_paused',
  'payment_received',
  'order_dispatched',
  'order_delivered',
];

export default function NotificationTemplatesScreen() {
  return (
    <ModuleGuard module="notifications">
      <NotificationTemplatesScreenContent />
    </ModuleGuard>
  );
}

function NotificationTemplatesScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { canManageNotifications } = useAuthStore();

  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<NotificationTemplate | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('notification_templates')
      .select('*')
      .order('event_type')
      .order('channel');
    setTemplates(data ?? []);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  usePageVisibility(() => { load(); });

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleEvent = (eventType: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      next.has(eventType) ? next.delete(eventType) : next.add(eventType);
      return next;
    });
  };

  const openAdd = () => {
    setEditTarget(null);
    setForm({ ...emptyForm });
    setModalVisible(true);
  };

  const openEdit = (t: NotificationTemplate) => {
    setEditTarget(t);
    setForm({
      name: t.name,
      event_type: t.event_type,
      channel: t.channel,
      is_active: t.is_active,
      is_automated: t.is_automated,
      subject: t.subject ?? '',
      body: t.body,
      msg91_template_id: t.msg91_template_id ?? '',
      msg91_whatsapp_template_id: t.msg91_whatsapp_template_id ?? '',
      msg91_whatsapp_namespace: t.msg91_whatsapp_namespace ?? '',
      send_at_days_before: t.send_at_days_before != null ? String(t.send_at_days_before) : '',
    });
    setModalVisible(true);
  };

  const handleToggleActive = async (t: NotificationTemplate) => {
    await supabase
      .from('notification_templates')
      .update({ is_active: !t.is_active })
      .eq('id', t.id);
    setTemplates((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, is_active: !x.is_active } : x))
    );
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.event_type || !form.channel || !form.body.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      event_type: form.event_type,
      channel: form.channel,
      is_active: form.is_active,
      is_automated: form.is_automated,
      subject: form.subject.trim() || null,
      body: form.body.trim(),
      msg91_template_id: form.msg91_template_id.trim() || null,
      msg91_whatsapp_template_id: form.msg91_whatsapp_template_id.trim() || null,
      msg91_whatsapp_namespace: form.msg91_whatsapp_namespace.trim() || null,
      send_at_days_before: form.send_at_days_before ? parseInt(form.send_at_days_before) : null,
    };

    if (editTarget) {
      const { data } = await supabase
        .from('notification_templates')
        .update(payload)
        .eq('id', editTarget.id)
        .select()
        .single();
      if (data) setTemplates((prev) => prev.map((x) => (x.id === editTarget.id ? data : x)));
    } else {
      const { data } = await supabase
        .from('notification_templates')
        .insert(payload)
        .select()
        .single();
      if (data) setTemplates((prev) => [...prev, data]);
    }
    setSaving(false);
    setModalVisible(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('notification_templates').delete().eq('id', id);
    setTemplates((prev) => prev.filter((x) => x.id !== id));
    setDeleteConfirm(null);
  };

  const insertVariable = (v: string) => {
    setForm((prev) => ({ ...prev, body: prev.body + v }));
  };

  const templatesByEvent = EVENT_TYPES.reduce<Record<string, NotificationTemplate[]>>((acc, ev) => {
    acc[ev] = templates.filter((t) => t.event_type === ev);
    return acc;
  }, {});

  if (!canManageNotifications) {
    return (
      <View style={styles.accessDenied}>
        <ShieldCheck size={48} color={Colors.textTertiary} strokeWidth={1.5} />
        <Text style={styles.accessDeniedTitle}>Access Restricted</Text>
        <Text style={styles.accessDeniedSub}>You don't have permission to manage notification templates.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, isWeb && styles.containerWeb, { paddingTop: isWeb ? 0 : insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Notification Templates</Text>
          <Text style={styles.headerSub}>{templates.length} template{templates.length !== 1 ? 's' : ''} configured</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Plus size={18} color={Colors.white} />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Automation summary bar */}
      {templates.filter((t) => t.is_automated && t.is_active).length > 0 && (
        <View style={styles.automationBar}>
          <Zap size={14} color={Colors.success} />
          <Text style={styles.automationBarText}>
            <Text style={styles.automationBarBold}>
              {templates.filter((t) => t.is_automated && t.is_active).length} template{templates.filter((t) => t.is_automated && t.is_active).length !== 1 ? 's' : ''}
            </Text>
            {' '}will fire automatically every day at 8 AM IST without any manual action.
          </Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {EVENT_TYPES.map((eventType) => {
          const evTemplates = templatesByEvent[eventType];
          const isExpanded = expandedEvents.has(eventType);
          const hasTemplates = evTemplates.length > 0;

          return (
            <View key={eventType} style={styles.eventGroup}>
              <TouchableOpacity style={styles.eventHeader} onPress={() => toggleEvent(eventType)} activeOpacity={0.7}>
                <View style={styles.eventHeaderLeft}>
                  <Text style={styles.eventLabel}>{EVENT_TYPE_LABELS[eventType]}</Text>
                  {hasTemplates && (
                    <View style={styles.countBadge}>
                      <Text style={styles.countText}>{evTemplates.length}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.eventHeaderRight}>
                  {hasTemplates && (
                    <View style={styles.channelPills}>
                      {evTemplates.map((t) => (
                        <View
                          key={t.id}
                          style={[styles.channelPill, { backgroundColor: CHANNEL_CONFIG[t.channel].bg }]}
                        >
                          <View style={[styles.channelDot, { backgroundColor: CHANNEL_CONFIG[t.channel].color }]} />
                        </View>
                      ))}
                    </View>
                  )}
                  {isExpanded ? (
                    <ChevronUp size={16} color={Colors.textTertiary} />
                  ) : (
                    <ChevronDown size={16} color={Colors.textTertiary} />
                  )}
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.eventBody}>
                  {evTemplates.length === 0 ? (
                    <Text style={styles.noTemplatesText}>No templates configured for this event.</Text>
                  ) : (
                    evTemplates.map((t) => (
                      <TemplateCard
                        key={t.id}
                        template={t}
                        onEdit={() => openEdit(t)}
                        onDelete={() => setDeleteConfirm(t.id)}
                        onToggle={() => handleToggleActive(t)}
                      />
                    ))
                  )}
                  <TouchableOpacity
                    style={styles.addToEventBtn}
                    onPress={() => {
                      setForm({ ...emptyForm, event_type: eventType as NotificationEventType });
                      setEditTarget(null);
                      setModalVisible(true);
                    }}
                  >
                    <Plus size={14} color={Colors.primary} />
                    <Text style={styles.addToEventText}>Add template for this event</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Delete confirm */}
      <Modal visible={!!deleteConfirm} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.confirmModal}>
            <Text style={styles.confirmTitle}>Delete Template</Text>
            <Text style={styles.confirmBody}>This will permanently delete the template and cannot be undone.</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDeleteConfirm(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteConfirm && handleDelete(deleteConfirm)}>
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
          <View style={styles.formModal}>
            <View style={styles.formModalHeader}>
              <Text style={styles.formModalTitle}>{editTarget ? 'Edit Template' : 'New Template'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll}>
              <FormField label="Template Name *">
                <TextInput
                  style={styles.input}
                  value={form.name}
                  onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
                  placeholder="e.g. Subscription Expiring — WhatsApp"
                  placeholderTextColor={Colors.textDisabled}
                />
              </FormField>

              <FormField label="Event Type *">
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipRow}>
                    {EVENT_TYPES.map((ev) => (
                      <TouchableOpacity
                        key={ev}
                        style={[styles.chip, form.event_type === ev && styles.chipActive]}
                        onPress={() => setForm((p) => ({ ...p, event_type: ev as NotificationEventType }))}
                      >
                        <Text style={[styles.chipText, form.event_type === ev && styles.chipTextActive]}>
                          {EVENT_TYPE_LABELS[ev]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </FormField>

              <FormField label="Channel *">
                <View style={styles.channelRow}>
                  {CHANNELS.map((ch) => (
                    <TouchableOpacity
                      key={ch}
                      style={[
                        styles.channelChip,
                        form.channel === ch && { backgroundColor: CHANNEL_CONFIG[ch].bg, borderColor: CHANNEL_CONFIG[ch].color },
                      ]}
                      onPress={() => setForm((p) => ({ ...p, channel: ch }))}
                    >
                      <Text style={[styles.channelChipText, form.channel === ch && { color: CHANNEL_CONFIG[ch].color }]}>
                        {CHANNEL_CONFIG[ch].label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </FormField>

              {(form.channel === 'push' || form.channel === 'in_app') && (
                <FormField label="Subject / Title">
                  <TextInput
                    style={styles.input}
                    value={form.subject}
                    onChangeText={(v) => setForm((p) => ({ ...p, subject: v }))}
                    placeholder="Notification title"
                    placeholderTextColor={Colors.textDisabled}
                  />
                </FormField>
              )}

              <FormField label="Message Body *">
                <TextInput
                  style={[styles.input, styles.textarea]}
                  value={form.body}
                  onChangeText={(v) => setForm((p) => ({ ...p, body: v }))}
                  placeholder="Type your message here. Use {{variable}} placeholders."
                  placeholderTextColor={Colors.textDisabled}
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                />
                <Text style={styles.varLabel}>Insert variable:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.varChips}>
                    {VARIABLES.map((v) => (
                      <TouchableOpacity key={v} style={styles.varChip} onPress={() => insertVariable(v)}>
                        <Text style={styles.varChipText}>{v}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </FormField>

              {/* Automation section */}
              <View style={styles.automationSection}>
                <View style={styles.automationHeaderRow}>
                  <View style={styles.automationHeaderLeft}>
                    <Zap size={16} color={Colors.success} />
                    <Text style={styles.automationTitle}>Send Automatically</Text>
                  </View>
                  <Switch
                    value={form.is_automated}
                    onValueChange={(v) => setForm((p) => ({ ...p, is_automated: v }))}
                    trackColor={{ false: Colors.neutral[300], true: '#C8E6C9' }}
                    thumbColor={form.is_automated ? Colors.success : Colors.neutral[400]}
                  />
                </View>
                <Text style={styles.automationHint}>
                  {form.is_automated
                    ? TIME_BASED_EVENTS.includes(form.event_type as NotificationEventType)
                      ? 'The daily cron will fire this based on subscription end date.'
                      : 'The system will send this automatically when the event occurs.'
                    : 'When enabled, the system sends this without any manual action.'}
                </Text>
                {form.is_automated && TIME_BASED_EVENTS.includes(form.event_type as NotificationEventType) && (
                  <FormField label="Trigger X days before end date">
                    <TextInput
                      style={styles.input}
                      value={form.send_at_days_before}
                      onChangeText={(v) => setForm((p) => ({ ...p, send_at_days_before: v.replace(/[^0-9]/g, '') }))}
                      placeholder="e.g. 3"
                      placeholderTextColor={Colors.textDisabled}
                      keyboardType="number-pad"
                    />
                  </FormField>
                )}
              </View>

              {form.channel === 'sms' && (
                <FormField label="MSG91 SMS Template ID">
                  <TextInput
                    style={styles.input}
                    value={form.msg91_template_id}
                    onChangeText={(v) => setForm((p) => ({ ...p, msg91_template_id: v }))}
                    placeholder="DLT registered template ID"
                    placeholderTextColor={Colors.textDisabled}
                  />
                </FormField>
              )}

              {form.channel === 'whatsapp' && (
                <>
                  <FormField label="MSG91 WhatsApp Template ID">
                    <TextInput
                      style={styles.input}
                      value={form.msg91_whatsapp_template_id}
                      onChangeText={(v) => setForm((p) => ({ ...p, msg91_whatsapp_template_id: v }))}
                      placeholder="Meta-approved template ID"
                      placeholderTextColor={Colors.textDisabled}
                    />
                  </FormField>
                  <FormField label="WhatsApp Namespace">
                    <TextInput
                      style={styles.input}
                      value={form.msg91_whatsapp_namespace}
                      onChangeText={(v) => setForm((p) => ({ ...p, msg91_whatsapp_namespace: v }))}
                      placeholder="WhatsApp namespace"
                      placeholderTextColor={Colors.textDisabled}
                    />
                  </FormField>
                </>
              )}

              <View style={styles.activeRow}>
                <Text style={styles.activeLabel}>Active</Text>
                <Switch
                  value={form.is_active}
                  onValueChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
                  trackColor={{ false: Colors.neutral[300], true: Colors.primaryLight }}
                  thumbColor={form.is_active ? Colors.primary : Colors.neutral[400]}
                />
              </View>

              {/* Live preview */}
              {form.body.trim() && (
                <View style={styles.previewBox}>
                  <Text style={styles.previewLabel}>Preview</Text>
                  {form.subject.trim() && <Text style={styles.previewSubject}>{form.subject}</Text>}
                  <Text style={styles.previewBody}>
                    {form.body
                      .replace('{{customer_name}}', 'Priya Sharma')
                      .replace('{{plan_name}}', 'Weekly Bloom')
                      .replace('{{end_date}}', '25 May 2026')
                      .replace('{{days_left}}', '3')
                      .replace('{{amount}}', '₹599')
                      .replace('{{mobile}}', '98XXXXXXXX')
                      .replace('{{payment_id}}', 'pay_XXXXX')}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.saveBtn, (!form.name || !form.event_type || !form.channel || !form.body) && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving || !form.name || !form.event_type || !form.channel || !form.body}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.saveBtnText}>{editTarget ? 'Save Changes' : 'Create Template'}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function TemplateCard({
  template, onEdit, onDelete, onToggle,
}: {
  template: NotificationTemplate;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const cfg = CHANNEL_CONFIG[template.channel];
  return (
    <View style={styles.templateCard}>
      <View style={styles.templateCardTop}>
        <View style={styles.templateCardBadges}>
          <View style={[styles.channelBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.channelBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          {template.is_automated && template.is_active && (
            <View style={styles.autoBadge}>
              <Zap size={10} color={Colors.success} />
              <Text style={styles.autoBadgeText}>
                Auto{template.send_at_days_before ? ` · ${template.send_at_days_before}d before` : ''}
              </Text>
            </View>
          )}
          {template.is_automated && !template.is_active && (
            <View style={styles.autoBadgeOff}>
              <Zap size={10} color={Colors.textTertiary} />
              <Text style={styles.autoBadgeOffText}>Auto (inactive)</Text>
            </View>
          )}
        </View>
        <View style={styles.templateCardActions}>
          <Switch
            value={template.is_active}
            onValueChange={onToggle}
            trackColor={{ false: Colors.neutral[300], true: Colors.primaryLight }}
            thumbColor={template.is_active ? Colors.primary : Colors.neutral[400]}
          />
          <TouchableOpacity onPress={onEdit} style={styles.iconBtn}>
            <Pencil size={15} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={styles.iconBtn}>
            <Trash2 size={15} color={Colors.error} />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.templateName}>{template.name}</Text>
      <Text style={styles.templateBody} numberOfLines={2}>{template.body}</Text>
      {(template.channel === 'sms' || template.channel === 'whatsapp') && (
        <Text style={styles.templateIdNote}>
          {template.channel === 'sms'
            ? template.msg91_template_id ? `MSG91 ID: ${template.msg91_template_id}` : 'MSG91 Template ID not set'
            : template.msg91_whatsapp_template_id ? `WA Template: ${template.msg91_whatsapp_template_id}` : 'WhatsApp Template ID not set — pending approval'}
        </Text>
      )}
      {!template.is_active && <View style={styles.inactiveBanner}><Text style={styles.inactiveBannerText}>Inactive — will not be sent</Text></View>}
    </View>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  containerWeb: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  accessDenied: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing[6], gap: Spacing[3] },
  accessDeniedTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  accessDeniedSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, textAlign: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[5], paddingVertical: Spacing[4],
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  headerSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[2],
  },
  addBtnText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.white },

  content: { padding: Spacing[4], gap: Spacing[3], paddingBottom: 40 },

  eventGroup: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  eventHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[4],
  },
  eventHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flex: 1 },
  eventLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.base, color: Colors.textPrimary },
  countBadge: { backgroundColor: Colors.primarySurface, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.primary },
  eventHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  channelPills: { flexDirection: 'row', gap: 4 },
  channelPill: { width: 12, height: 12, borderRadius: 6 },
  channelDot: { width: 12, height: 12, borderRadius: 6 },

  eventBody: { borderTopWidth: 1, borderTopColor: Colors.divider, padding: Spacing[3], gap: Spacing[3] },
  noTemplatesText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', paddingVertical: Spacing[2] },

  templateCard: {
    backgroundColor: Colors.neutral[50], borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing[3], gap: 6,
  },
  templateCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  channelBadge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  channelBadgeText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs },
  templateCardActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  iconBtn: { padding: 4 },
  templateName: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  templateBody: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary, lineHeight: 18 },
  templateIdNote: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  inactiveBanner: { backgroundColor: Colors.errorSurface, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  inactiveBannerText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.error },

  addToEventBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: Colors.primary, borderStyle: 'dashed',
    borderRadius: Radius.md, paddingVertical: Spacing[2], paddingHorizontal: Spacing[3],
    alignSelf: 'flex-start',
  },
  addToEventText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.primary },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  confirmModal: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    margin: Spacing[5], padding: Spacing[5], gap: Spacing[4],
  },
  confirmTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  confirmBody: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  confirmActions: { flexDirection: 'row', gap: Spacing[3] },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], alignItems: 'center' },
  cancelBtnText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  deleteBtn: { flex: 1, backgroundColor: Colors.error, borderRadius: Radius.md, paddingVertical: Spacing[3], alignItems: 'center' },
  deleteBtnText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.white },

  formModal: {
    backgroundColor: Colors.white, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    maxHeight: '92%', flex: Platform.OS === 'web' ? undefined : 0,
  },
  formModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing[5], borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  formModalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  formScroll: { padding: Spacing[5], gap: Spacing[4], paddingBottom: 40 },

  formField: { gap: 6 },
  formLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[3],
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base,
    color: Colors.textPrimary, backgroundColor: Colors.white,
  },
  textarea: { height: 120, textAlignVertical: 'top' },

  chipRow: { flexDirection: 'row', gap: Spacing[2] },
  chip: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.full,
    paddingHorizontal: Spacing[3], paddingVertical: 6,
  },
  chipActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  chipText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  chipTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansMedium },

  channelRow: { flexDirection: 'row', gap: Spacing[2], flexWrap: 'wrap' },
  channelChip: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[2],
  },
  channelChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },

  varLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 4 },
  varChips: { flexDirection: 'row', gap: 6 },
  varChip: { backgroundColor: Colors.accentSurface, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  varChipText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.accentDark },

  activeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing[2] },
  activeLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.base, color: Colors.textPrimary },

  previewBox: {
    backgroundColor: Colors.neutral[50], borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing[4], gap: 6,
  },
  previewLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8 },
  previewSubject: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  previewBody: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 20 },

  saveBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: Spacing[4], alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: Colors.neutral[300] },
  saveBtnText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.base, color: Colors.white },

  automationBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F1F8E9', borderBottomWidth: 1, borderBottomColor: '#C5E1A5',
    paddingHorizontal: Spacing[5], paddingVertical: Spacing[3],
  },
  automationBarText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: '#388E3C', flex: 1 },
  automationBarBold: { fontFamily: Typography.fontFamily.sansMedium },

  templateCardBadges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  autoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F1F8E9', borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  autoBadgeText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.success },
  autoBadgeOff: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.neutral[100], borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  autoBadgeOffText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },

  automationSection: {
    borderWidth: 1, borderColor: '#C5E1A5', borderRadius: Radius.md,
    backgroundColor: '#F9FBE7', padding: Spacing[4], gap: Spacing[3],
  },
  automationHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  automationHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  automationTitle: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.base, color: '#2E7D32' },
  automationHint: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: '#558B2F', lineHeight: 18 },
});
