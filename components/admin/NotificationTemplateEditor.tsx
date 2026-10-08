import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  TextInput, ScrollView, Platform, KeyboardAvoidingView,
  ActivityIndicator, Switch,
} from 'react-native';
import { X, Check } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import {
  NotificationTemplate, NotificationChannel,
} from '@/types/database';
import { NotificationDefinition, CHANNEL_META } from '@/constants/notifications';

interface Props {
  visible: boolean;
  template: NotificationTemplate | null;
  definition: NotificationDefinition | null;
  channel: string;
  onClose: () => void;
  onSave: (template: NotificationTemplate) => void;
}

export default function NotificationTemplateEditor({
  visible, template, definition, channel, onClose, onSave,
}: Props) {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [msg91TemplateId, setMsg91TemplateId] = useState('');
  const [msg91WhatsappId, setMsg91WhatsappId] = useState('');
  const [msg91Namespace, setMsg91Namespace] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const ch = channel as NotificationChannel;
  const meta = CHANNEL_META[ch];
  const isWhatsApp = ch === 'whatsapp';
  const isPush = ch === 'push';
  const isInApp = ch === 'in_app';

  useEffect(() => {
    if (visible) {
      setName(template?.name ?? `${definition?.title ?? ''} (${meta?.label ?? ch})`);
      setSubject(template?.subject ?? '');
      setBody(template?.body ?? 'Configure this template content.');
      setMsg91TemplateId(template?.msg91_template_id ?? '');
      setMsg91WhatsappId(template?.msg91_whatsapp_template_id ?? '');
      setMsg91Namespace(template?.msg91_whatsapp_namespace ?? '');
      setSoundEnabled(template?.sound_enabled ?? definition?.hasSound ?? false);
      setError('');
    }
  }, [visible, template, definition, ch]);

  const variables = definition?.variables ?? [];

  const insertVariable = (v: string) => {
    setBody((prev) => prev + v);
  };

  const previewBody = (text: string) => {
    let result = text;
    result = result.replace(/\{\{customer_name\}\}/g, 'Rahul');
    result = result.replace(/\{\{plan_name\}\}/g, 'Weekly Bloom');
    result = result.replace(/\{\{end_date\}\}/g, '25 Dec 2026');
    result = result.replace(/\{\{days_left\}\}/g, '3');
    result = result.replace(/\{\{amount\}\}/g, '\u20B9599');
    result = result.replace(/\{\{mobile\}\}/g, '98XXXXXX10');
    result = result.replace(/\{\{first_delivery_date\}\}/g, '30 Dec 2026');
    result = result.replace(/\{\{resume_date\}\}/g, '01 Jan 2027');
    result = result.replace(/\{\{delivery_address\}\}/g, 'Flat 201, Green Residency');
    result = result.replace(/\{\{festival_name\}\}/g, 'Diwali');
    result = result.replace(/\{\{info_message\}\}/g, 'We are open on all days this week.');
    result = result.replace(/\{\{offer_title\}\}/g, '20% Off');
    result = result.replace(/\{\{offer_details\}\}/g, 'Get 20% off on all plans');
    result = result.replace(/\{\{valid_until\}\}/g, '31 Dec 2026');
    result = result.replace(/\{\{total_price\}\}/g, '\u20B9350');
    result = result.replace(/\{\{amount\}\}/g, '\u20B91,200');
    result = result.replace(/\{\{count\}\}/g, '5');
    result = result.replace(/\{\{rider_name\}\}/g, 'Suresh');
    result = result.replace(/\{\{vendor_name\}\}/g, 'ABC Flowers');
    result = result.replace(/\{\{job_name\}\}/g, 'daily-renewal-check');
    result = result.replace(/\{\{unassigned_count\}\}/g, '3');
    result = result.replace(/\{\{pending_payments\}\}/g, '2');
    result = result.replace(/\{\{rider_absent\}\}/g, '1');
    return result;
  };

  const handleSave = async () => {
    if (!definition) return;
    if (!body.trim()) {
      setError('Message body cannot be empty.');
      return;
    }
    setSaving(true);
    setError('');

    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        body: body.trim(),
        subject: subject.trim() || null,
        sound_enabled: soundEnabled,
        msg91_template_id: msg91TemplateId.trim() || null,
        msg91_whatsapp_template_id: msg91WhatsappId.trim() || null,
        msg91_whatsapp_namespace: msg91Namespace.trim() || null,
      };

      if (template) {
        const { data, error: updateError } = await supabase
          .from('notification_templates')
          .update(payload)
          .eq('id', template.id)
          .select('*')
          .single();
        if (updateError) throw updateError;
        if (data) onSave(data as NotificationTemplate);
      } else {
        const insertPayload: Record<string, unknown> = {
          ...payload,
          event_type: definition.eventType,
          channel: ch,
          is_active: true,
          is_automated: definition.isAutomated ?? false,
          recipient_type: definition.recipientType,
          priority: definition.hasSound ? 'critical' : 'normal',
        };
        if (definition.reminderStage) insertPayload.reminder_stage = definition.reminderStage;
        if (definition.sendAtDaysBefore != null) insertPayload.send_at_days_before = definition.sendAtDaysBefore;

        const { data, error: insertError } = await supabase
          .from('notification_templates')
          .insert(insertPayload)
          .select('*')
          .single();
        if (insertError) throw insertError;
        if (data) onSave(data as NotificationTemplate);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>{definition?.title ?? 'Edit Template'}</Text>
              <Text style={styles.headerSub}>{meta?.label ?? ch} channel</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <X size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {/* Description */}
            {definition?.description && (
              <View style={styles.descBox}>
                <Text style={styles.descText}>{definition.description}</Text>
              </View>
            )}

            {/* Name */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Template Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Template name"
                placeholderTextColor={Colors.textDisabled}
              />
            </View>

            {/* Subject (push & in_app) */}
            {(isPush || isInApp) && (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{isPush ? 'Push Title' : 'In-App Title'} {isInApp ? '(optional)' : ''}</Text>
                <TextInput
                  style={styles.input}
                  value={subject}
                  onChangeText={setSubject}
                  placeholder={isPush ? 'Push notification title' : 'In-app notification title'}
                  placeholderTextColor={Colors.textDisabled}
                />
              </View>
            )}

            {/* Body */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Message Body</Text>
              <TextInput
                style={[styles.input, styles.bodyInput]}
                value={body}
                onChangeText={setBody}
                placeholder="Message body with {{variables}}"
                placeholderTextColor={Colors.textDisabled}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            {/* Variable chips */}
            {variables.length > 0 && (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Insert Variable</Text>
                <View style={styles.varRow}>
                  {variables.map((v) => (
                    <TouchableOpacity
                      key={v}
                      style={styles.varChip}
                      onPress={() => insertVariable(v)}
                    >
                      <Text style={styles.varChipText}>{v}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* WhatsApp MSG91 fields */}
            {isWhatsApp && (
              <>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>MSG91 WhatsApp Template ID</Text>
                  <TextInput
                    style={styles.input}
                    value={msg91WhatsappId}
                    onChangeText={setMsg91WhatsappId}
                    placeholder="e.g. 525516"
                    placeholderTextColor={Colors.textDisabled}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>MSG91 WhatsApp Namespace</Text>
                  <TextInput
                    style={styles.input}
                    value={msg91Namespace}
                    onChangeText={setMsg91Namespace}
                    placeholder="e.g. 73669fdc-xxxx-xxxx-xxxx"
                    placeholderTextColor={Colors.textDisabled}
                  />
                </View>
              </>
            )}

            {/* Sound toggle */}
            {definition?.hasSound && (
              <View style={styles.soundRow}>
                <View>
                  <Text style={styles.fieldLabel}>Alarm Sound</Text>
                  <Text style={styles.soundDesc}>Play an alarm sound when this notification is delivered</Text>
                </View>
                <Switch
                  value={soundEnabled}
                  onValueChange={setSoundEnabled}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                  thumbColor={Colors.white}
                />
              </View>
            )}

            {/* Preview */}
            <View style={styles.previewBox}>
              <Text style={styles.previewLabel}>Preview</Text>
              {(isPush || isInApp) && subject.trim() && (
                <Text style={styles.previewSubject}>{previewBody(subject)}</Text>
              )}
              <Text style={styles.previewBody}>{previewBody(body)}</Text>
            </View>

            {error && <Text style={styles.errorText}>{error}</Text>}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <Check size={16} color={Colors.white} />
                  <Text style={styles.saveBtnText}>Save</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[3],
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: Typography.size.lg, fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 2 },
  closeBtn: { padding: Spacing[2] },
  content: { padding: Spacing[4] },
  descBox: {
    backgroundColor: Colors.primarySurface, borderRadius: Radius.md,
    paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], marginBottom: Spacing[4],
  },
  descText: { fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 20 },
  field: { marginBottom: Spacing[4] },
  fieldLabel: { fontSize: Typography.size.sm, fontFamily: Typography.fontFamily.sansMedium, color: Colors.textPrimary, marginBottom: Spacing[2] },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: Spacing[3], paddingVertical: Spacing[3],
    fontSize: Typography.size.sm, color: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },
  bodyInput: { minHeight: 100, textAlignVertical: 'top' },
  varRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  varChip: {
    backgroundColor: Colors.primarySurface, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary,
  },
  varChipText: { fontSize: 11, fontFamily: Typography.fontFamily.sansMedium, color: Colors.primary },
  soundRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing[4],
  },
  soundDesc: { fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  previewBox: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing[3], marginBottom: Spacing[4], borderWidth: 1, borderColor: Colors.border,
  },
  previewLabel: { fontSize: Typography.size.xs, fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textTertiary, marginBottom: Spacing[2] },
  previewSubject: { fontSize: Typography.size.sm, fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textPrimary, marginBottom: 4 },
  previewBody: { fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 20 },
  errorText: { fontSize: Typography.size.sm, color: Colors.error, marginBottom: Spacing[3] },
  footer: {
    flexDirection: 'row', gap: Spacing[3],
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[3],
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  cancelBtn: {
    flex: 1, paddingVertical: Spacing[3], borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  cancelBtnText: { fontSize: Typography.size.sm, fontFamily: Typography.fontFamily.sansMedium, color: Colors.textSecondary },
  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: Spacing[3], borderRadius: Radius.md,
    backgroundColor: Colors.primary,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: Typography.size.sm, fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.white },
});
