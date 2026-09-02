import React, { useEffect, useState, useCallback } from 'react';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, TextInput, Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Users, User, Tag, Send, ChevronRight, Check, ShieldCheck,
  MessageSquare, Bell, Smartphone, MessageCircle, Search, X,
} from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { NotificationTemplate, NotificationChannel, SubscriptionPlan } from '@/types/database';

const CHANNEL_CONFIG: Record<NotificationChannel, { label: string; color: string; bg: string }> = {
  sms: { label: 'SMS', color: '#1565C0', bg: '#E3F2FD' },
  whatsapp: { label: 'WhatsApp', color: '#2E7D32', bg: '#E8F5E9' },
  push: { label: 'Push', color: '#E65100', bg: '#FFF3E0' },
  in_app: { label: 'In-App', color: '#6A1B9A', bg: '#F3E5F5' },
};

const CHANNELS: NotificationChannel[] = ['sms', 'whatsapp', 'push', 'in_app'];

const VARIABLES = [
  '{{customer_name}}', '{{mobile}}', '{{plan_name}}',
  '{{end_date}}', '{{days_left}}', '{{amount}}',
];

type AudienceType = 'all_active' | 'by_plan' | 'individual';
type MessageMode = 'template' | 'custom';

export default function SendNotificationScreen() {
  return (
    <ModuleGuard module="notifications">
      <SendNotificationScreenContent />
    </ModuleGuard>
  );
}

function SendNotificationScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { canManageNotifications, profile } = useAuthStore();

  const [step, setStep] = useState(1);

  // Step 1 — Audience
  const [audienceType, setAudienceType] = useState<AudienceType>('all_active');
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<any[]>([]);
  const [estimatedCount, setEstimatedCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);

  // Step 2 — Message
  const [messageMode, setMessageMode] = useState<MessageMode>('template');
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // Auto-select WhatsApp channel when a heavy_rainfall template is chosen
  useEffect(() => {
    const t = templates.find((t) => t.id === selectedTemplateId);
    if (t?.event_type === 'heavy_rainfall') {
      setSelectedChannels(new Set(['whatsapp']));
    }
  }, [selectedTemplateId, templates]);
  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody] = useState('');

  // Step 3 — Channels
  const [selectedChannels, setSelectedChannels] = useState<Set<NotificationChannel>>(new Set(['sms']));

  // Step 4 — Send
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null);
  const [sendError, setSendError] = useState('');

  const loadPlans = useCallback(async () => {
    const { data } = await supabase.from('subscription_plans').select('*').eq('is_active', true).order('sort_order');
    setPlans(data ?? []);
  }, []);

  const loadTemplates = useCallback(async () => {
    const { data } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('is_active', true)
      .order('event_type');
    setTemplates(data ?? []);
  }, []);

  useEffect(() => {
    loadPlans();
    loadTemplates();
  }, [loadPlans, loadTemplates]);

  const refreshCount = useCallback(async () => {
    if (audienceType === 'individual') {
      setEstimatedCount(selectedCustomers.length);
      return;
    }
    setCountLoading(true);
    let query = supabase.from('subscriptions').select('user_id', { count: 'exact', head: true }).eq('status', 'active');
    if (audienceType === 'by_plan' && selectedPlanId) query = query.eq('plan_id', selectedPlanId);
    const { count } = await query;
    setEstimatedCount(count ?? 0);
    setCountLoading(false);
  }, [audienceType, selectedPlanId, selectedCustomers.length]);

  useEffect(() => { refreshCount(); }, [refreshCount]);

  const searchCustomers = useCallback(async (q: string) => {
    if (q.length < 2) { setCustomerResults([]); return; }
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, mobile')
      .eq('role', 'customer')
      .or(`full_name.ilike.%${q}%,mobile.ilike.%${q}%`)
      .limit(10);
    setCustomerResults(data ?? []);
  }, []);

  useEffect(() => { searchCustomers(customerSearch); }, [customerSearch, searchCustomers]);

  const toggleChannel = (ch: NotificationChannel) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      next.has(ch) ? next.delete(ch) : next.add(ch);
      return next;
    });
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const previewCustomerName =
    audienceType === 'individual' && selectedCustomers.length > 0
      ? (selectedCustomers[0].full_name ?? selectedCustomers[0].mobile)
      : 'Customer';

  const previewBody = (body: string) =>
    body
      .replace(/\{\{customer_name\}\}/g, previewCustomerName)
      .replace(/\{\{plan_name\}\}/g, 'Weekly Bloom')
      .replace(/\{\{end_date\}\}/g, '25 May 2026')
      .replace(/\{\{days_left\}\}/g, '3')
      .replace(/\{\{amount\}\}/g, '₹599')
      .replace(/\{\{mobile\}\}/g, '98XXXXXXXX');

  const handleSend = async () => {
    setSending(true);
    setSendError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

      // Resolve audience to a flat list of user_ids
      let userIds: string[] = [];
      if (audienceType === 'individual') {
        userIds = selectedCustomers.map((c) => c.id);
      } else {
        let query = supabase.from('subscriptions').select('user_id').eq('status', 'active');
        if (audienceType === 'by_plan' && selectedPlanId) {
          query = query.eq('plan_id', selectedPlanId);
        }
        const { data: subs } = await query;
        userIds = [...new Set((subs ?? []).map((s: any) => s.user_id))];
      }

      if (userIds.length === 0) {
        setSendError('No recipients found for the selected audience.');
        setSending(false);
        return;
      }

      const eventType = messageMode === 'template' ? (selectedTemplate?.event_type ?? 'custom') : 'custom';
      const accessToken = session?.access_token ?? anonKey;
      const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

      let totalSent = 0;
      let totalFailed = 0;
      let lastError = '';

      // Call once per selected channel
      for (const ch of selectedChannels) {
        const templateForChannel =
          messageMode === 'template'
            ? (templates.find((t) => t.name === selectedTemplate?.name && t.channel === ch)
                ?? templates.find((t) => t.id === selectedTemplateId))
            : null;

        const body: Record<string, unknown> = {
          user_ids: userIds,
          channel: ch,
          event_type: eventType,
          triggered_by: profile?.id,
        };

        if (messageMode === 'template' && templateForChannel) {
          body.template_id = templateForChannel.id;
        } else if (messageMode === 'custom') {
          body.event_type = 'custom';
          body.custom_subject = customSubject;
          body.custom_body = customBody;
        }

        const res = await fetch(`${supabaseUrl}/functions/v1/send-bulk-notification`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        const result = await res.json();
        totalSent += result.sent ?? 0;
        totalFailed += result.failed ?? 0;
        if (!result.success && result.error) lastError = result.error;
      }

      if (totalSent > 0 || totalFailed >= 0) {
        setSendResult({ sent: totalSent, failed: totalFailed, skipped: 0 });
        setStep(5);
      } else {
        setSendError(lastError || 'The notification was not sent.');
      }
    } catch (e) {
      setSendError(String(e));
    } finally {
      setSending(false);
    }
  };

  const resetFlow = () => {
    setStep(1);
    setAudienceType('all_active');
    setSelectedPlanId('');
    setSelectedCustomers([]);
    setMessageMode('template');
    setSelectedTemplateId('');
    setCustomSubject('');
    setCustomBody('');
    setSelectedChannels(new Set(['sms']));
    setSendResult(null);
    setSendError('');
  };

  if (!canManageNotifications) {
    return (
      <View style={styles.accessDenied}>
        <ShieldCheck size={48} color={Colors.textTertiary} strokeWidth={1.5} />
        <Text style={styles.accessDeniedTitle}>Access Restricted</Text>
        <Text style={styles.accessDeniedSub}>You don't have permission to send notifications.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, isWeb && styles.containerWeb, { paddingTop: isWeb ? 0 : insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Send Notification</Text>
          <Text style={styles.headerSub}>Manual broadcast to customers</Text>
        </View>

        {step < 5 && (
          <View style={styles.stepBar}>
            {[1, 2, 3, 4].map((s) => (
              <View key={s} style={styles.stepItem}>
                <View style={[styles.stepDot, step >= s && styles.stepDotActive, step > s && styles.stepDotDone]}>
                  {step > s ? (
                    <Check size={10} color={Colors.white} />
                  ) : (
                    <Text style={[styles.stepNum, step >= s && styles.stepNumActive]}>{s}</Text>
                  )}
                </View>
                {s < 4 && <View style={[styles.stepLine, step > s && styles.stepLineDone]} />}
              </View>
            ))}
          </View>
        )}

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {step === 1 && (
            <StepCard title="Who should receive this?" subtitle="Select your audience">
              {([
                { key: 'all_active', label: 'All Active Subscribers', icon: Users, desc: 'Everyone with an active subscription' },
                { key: 'by_plan', label: 'Specific Plan', icon: Tag, desc: 'All active subscribers on a specific plan' },
                { key: 'individual', label: 'Individual Customers', icon: User, desc: 'Search and select specific customers' },
              ] as const).map(({ key, label, icon: Icon, desc }) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.audienceOption, audienceType === key && styles.audienceOptionActive]}
                  onPress={() => setAudienceType(key)}
                >
                  <View style={[styles.audienceIconWrap, audienceType === key && styles.audienceIconWrapActive]}>
                    <Icon size={20} color={audienceType === key ? Colors.white : Colors.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.audienceLabel, audienceType === key && styles.audienceLabelActive]}>{label}</Text>
                    <Text style={styles.audienceDesc}>{desc}</Text>
                  </View>
                  {audienceType === key && <Check size={16} color={Colors.primary} />}
                </TouchableOpacity>
              ))}

              {audienceType === 'by_plan' && (
                <View style={styles.subSection}>
                  <Text style={styles.subLabel}>Select Plan</Text>
                  {plans.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.planOption, selectedPlanId === p.id && styles.planOptionActive]}
                      onPress={() => setSelectedPlanId(p.id)}
                    >
                      <Text style={[styles.planOptionText, selectedPlanId === p.id && styles.planOptionTextActive]}>{p.name}</Text>
                      {selectedPlanId === p.id && <Check size={14} color={Colors.primary} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {audienceType === 'individual' && (
                <View style={styles.subSection}>
                  <View style={styles.searchBox}>
                    <Search size={16} color={Colors.textTertiary} />
                    <TextInput
                      style={styles.searchInput}
                      value={customerSearch}
                      onChangeText={setCustomerSearch}
                      placeholder="Search by name or mobile…"
                      placeholderTextColor={Colors.textDisabled}
                    />
                  </View>
                  {customerResults.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.customerResult}
                      onPress={() => {
                        if (!selectedCustomers.find((x) => x.id === c.id)) {
                          setSelectedCustomers((prev) => [...prev, c]);
                        }
                        setCustomerSearch('');
                        setCustomerResults([]);
                      }}
                    >
                      <Text style={styles.customerResultName}>{c.full_name ?? '—'}</Text>
                      <Text style={styles.customerResultMobile}>{c.mobile}</Text>
                    </TouchableOpacity>
                  ))}
                  {selectedCustomers.length > 0 && (
                    <View style={styles.selectedChips}>
                      {selectedCustomers.map((c) => (
                        <View key={c.id} style={styles.selectedChip}>
                          <Text style={styles.selectedChipText}>{c.full_name ?? c.mobile}</Text>
                          <TouchableOpacity onPress={() => setSelectedCustomers((prev) => prev.filter((x) => x.id !== c.id))}>
                            <X size={12} color={Colors.primary} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              <View style={styles.countBox}>
                <Text style={styles.countLabel}>Estimated recipients:</Text>
                {countLoading ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Text style={styles.countValue}>{estimatedCount ?? '—'}</Text>
                )}
              </View>
            </StepCard>
          )}

          {step === 2 && (
            <StepCard title="What to send?" subtitle="Choose a template or write a custom message">
              <View style={styles.modeToggle}>
                {(['template', 'custom'] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.modeBtn, messageMode === m && styles.modeBtnActive]}
                    onPress={() => setMessageMode(m)}
                  >
                    <Text style={[styles.modeBtnText, messageMode === m && styles.modeBtnTextActive]}>
                      {m === 'template' ? 'Use Template' : 'Custom Message'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {messageMode === 'template' && (
                <View style={{ gap: Spacing[2] }}>
                  {templates.length === 0 ? (
                    <Text style={styles.noTemplatesText}>No active templates. Create one in Templates first.</Text>
                  ) : (
                    templates.map((t) => (
                      <TouchableOpacity
                        key={t.id}
                        style={[styles.templateOption, selectedTemplateId === t.id && styles.templateOptionActive]}
                        onPress={() => setSelectedTemplateId(t.id)}
                      >
                        <View style={styles.templateOptionTop}>
                          <View style={[styles.chBadge, { backgroundColor: CHANNEL_CONFIG[t.channel].bg }]}>
                            <Text style={[styles.chBadgeText, { color: CHANNEL_CONFIG[t.channel].color }]}>
                              {CHANNEL_CONFIG[t.channel].label}
                            </Text>
                          </View>
                          {selectedTemplateId === t.id && <Check size={14} color={Colors.primary} />}
                        </View>
                        <Text style={styles.templateOptionName}>{t.name}</Text>
                        <Text style={styles.templateOptionBody} numberOfLines={2}>{t.body}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}

              {messageMode === 'custom' && (
                <View style={{ gap: Spacing[3] }}>
                  <View style={styles.formField}>
                    <Text style={styles.formLabel}>Subject / Title</Text>
                    <TextInput
                      style={styles.input}
                      value={customSubject}
                      onChangeText={setCustomSubject}
                      placeholder="Notification title"
                      placeholderTextColor={Colors.textDisabled}
                    />
                  </View>
                  <View style={styles.formField}>
                    <Text style={styles.formLabel}>Message Body *</Text>
                    <TextInput
                      style={[styles.input, styles.textarea]}
                      value={customBody}
                      onChangeText={setCustomBody}
                      placeholder="Type your message. Use {{variable}} placeholders."
                      placeholderTextColor={Colors.textDisabled}
                      multiline
                      numberOfLines={5}
                      textAlignVertical="top"
                    />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                      <View style={styles.varChips}>
                        {VARIABLES.map((v) => (
                          <TouchableOpacity key={v} style={styles.varChip} onPress={() => setCustomBody((p) => p + v)}>
                            <Text style={styles.varChipText}>{v}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                </View>
              )}
            </StepCard>
          )}

          {step === 3 && (
            <StepCard title="Which channels?" subtitle="Select all channels to send through">
              {CHANNELS.map((ch) => {
                const cfg = CHANNEL_CONFIG[ch];
                const active = selectedChannels.has(ch);
                return (
                  <TouchableOpacity
                    key={ch}
                    style={[styles.channelOption, active && styles.channelOptionActive]}
                    onPress={() => toggleChannel(ch)}
                  >
                    <View style={[styles.channelIconWrap, { backgroundColor: cfg.bg }]}>
                      <Text style={[styles.channelIconText, { color: cfg.color }]}>{cfg.label[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.channelOptionLabel}>{cfg.label}</Text>
                      <Text style={styles.channelOptionDesc}>
                        {ch === 'sms' && 'Send via MSG91 SMS (requires DLT template)'}
                        {ch === 'whatsapp' && 'Send via MSG91 WhatsApp (requires approved template)'}
                        {ch === 'push' && 'Send via Expo Push Notifications'}
                        {ch === 'in_app' && 'Show in customer notification feed'}
                      </Text>
                    </View>
                    <View style={[styles.checkBox, active && styles.checkBoxActive]}>
                      {active && <Check size={12} color={Colors.white} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </StepCard>
          )}

          {step === 4 && (
            <StepCard title="Review and Confirm" subtitle="Preview before sending">
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Audience</Text>
                <Text style={styles.reviewValue}>
                  {audienceType === 'all_active' ? 'All Active Subscribers' : audienceType === 'by_plan' ? `Plan: ${plans.find((p) => p.id === selectedPlanId)?.name ?? '—'}` : `${selectedCustomers.length} individual(s)`}
                </Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Recipients</Text>
                <Text style={styles.reviewValueBold}>{estimatedCount ?? '—'}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Channels</Text>
                <View style={styles.reviewChannels}>
                  {Array.from(selectedChannels).map((ch) => (
                    <View key={ch} style={[styles.chBadge, { backgroundColor: CHANNEL_CONFIG[ch].bg }]}>
                      <Text style={[styles.chBadgeText, { color: CHANNEL_CONFIG[ch].color }]}>{CHANNEL_CONFIG[ch].label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.previewBox}>
                <Text style={styles.previewLabel}>Message Preview</Text>
                {(messageMode === 'template' ? selectedTemplate?.subject : customSubject) ? (
                  <Text style={styles.previewSubject}>
                    {previewBody(messageMode === 'template' ? (selectedTemplate?.subject ?? '') : customSubject)}
                  </Text>
                ) : null}
                <Text style={styles.previewBody}>
                  {previewBody(messageMode === 'template' ? (selectedTemplate?.body ?? '') : customBody)}
                </Text>
              </View>

              {sendError ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{sendError}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <>
                    <Send size={16} color={Colors.white} />
                    <Text style={styles.sendBtnText}>Send Now</Text>
                  </>
                )}
              </TouchableOpacity>
            </StepCard>
          )}

          {step === 5 && sendResult && (
            <View style={styles.successCard}>
              <View style={styles.successIcon}>
                <Check size={32} color={Colors.white} />
              </View>
              <Text style={styles.successTitle}>Notifications Sent!</Text>
              <View style={styles.successStats}>
                <View style={styles.successStat}>
                  <Text style={[styles.successStatVal, { color: Colors.success }]}>{sendResult.sent}</Text>
                  <Text style={styles.successStatLabel}>Sent</Text>
                </View>
                <View style={styles.successStat}>
                  <Text style={[styles.successStatVal, { color: Colors.error }]}>{sendResult.failed}</Text>
                  <Text style={styles.successStatLabel}>Failed</Text>
                </View>
                <View style={styles.successStat}>
                  <Text style={[styles.successStatVal, { color: Colors.textTertiary }]}>{sendResult.skipped}</Text>
                  <Text style={styles.successStatLabel}>Skipped</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.resetBtn} onPress={resetFlow}>
                <Text style={styles.resetBtnText}>Send Another</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {step < 5 && (
          <View style={styles.footer}>
            {step > 1 && (
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep((s) => s - 1)}>
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
            )}
            {step < 4 && (
              <TouchableOpacity
                style={[styles.nextBtn, !canProceed(step, audienceType, selectedPlanId, selectedCustomers, messageMode, selectedTemplateId, customBody, selectedChannels) && styles.nextBtnDisabled]}
                onPress={() => setStep((s) => s + 1)}
                disabled={!canProceed(step, audienceType, selectedPlanId, selectedCustomers, messageMode, selectedTemplateId, customBody, selectedChannels)}
              >
                <Text style={styles.nextBtnText}>Next</Text>
                <ChevronRight size={16} color={Colors.white} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function canProceed(
  step: number,
  audienceType: AudienceType,
  selectedPlanId: string,
  selectedCustomers: any[],
  messageMode: MessageMode,
  selectedTemplateId: string,
  customBody: string,
  selectedChannels: Set<NotificationChannel>,
): boolean {
  if (step === 1) {
    if (audienceType === 'by_plan') return !!selectedPlanId;
    if (audienceType === 'individual') return selectedCustomers.length > 0;
    return true;
  }
  if (step === 2) {
    if (messageMode === 'template') return !!selectedTemplateId;
    return customBody.trim().length > 0;
  }
  if (step === 3) return selectedChannels.size > 0;
  return true;
}

function StepCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <View style={styles.stepCard}>
      <Text style={styles.stepCardTitle}>{title}</Text>
      <Text style={styles.stepCardSub}>{subtitle}</Text>
      <View style={styles.stepCardBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  containerWeb: { flex: 1 },
  accessDenied: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing[6], gap: Spacing[3] },
  accessDeniedTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  accessDeniedSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, textAlign: 'center' },

  header: {
    paddingHorizontal: Spacing[5], paddingVertical: Spacing[4],
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  headerSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },

  stepBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: Spacing[4], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  stepItem: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.neutral[200], justifyContent: 'center', alignItems: 'center',
  },
  stepDotActive: { backgroundColor: Colors.primary },
  stepDotDone: { backgroundColor: Colors.primaryLight },
  stepNum: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textTertiary },
  stepNumActive: { color: Colors.white },
  stepLine: { width: 32, height: 2, backgroundColor: Colors.neutral[200] },
  stepLineDone: { backgroundColor: Colors.primaryLight },

  content: { padding: Spacing[4], paddingBottom: 100 },

  stepCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing[5], ...Shadow.sm },
  stepCardTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  stepCardSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 4, marginBottom: Spacing[4] },
  stepCardBody: { gap: Spacing[3] },

  audienceOption: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    padding: Spacing[4],
  },
  audienceOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  audienceIconWrap: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.neutral[100], justifyContent: 'center', alignItems: 'center' },
  audienceIconWrapActive: { backgroundColor: Colors.primary },
  audienceLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.base, color: Colors.textPrimary },
  audienceLabelActive: { color: Colors.primary },
  audienceDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },

  subSection: { gap: Spacing[2], paddingTop: Spacing[2] },
  subLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  planOption: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    padding: Spacing[3], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  planOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  planOptionText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  planOptionTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansMedium },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: Spacing[3], paddingVertical: Spacing[2],
  },
  searchInput: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  customerResult: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: Spacing[3], flexDirection: 'row', justifyContent: 'space-between' },
  customerResultName: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  customerResultMobile: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  selectedChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  selectedChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primarySurface, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  selectedChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.primary },

  countBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.neutral[50], borderRadius: Radius.md, padding: Spacing[3] },
  countLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  countValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.primary },

  modeToggle: { flexDirection: 'row', backgroundColor: Colors.neutral[100], borderRadius: Radius.md, padding: 4, gap: 4 },
  modeBtn: { flex: 1, paddingVertical: Spacing[2], borderRadius: Radius.sm, alignItems: 'center' },
  modeBtnActive: { backgroundColor: Colors.white, ...Shadow.sm },
  modeBtnText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary },
  modeBtnTextActive: { color: Colors.textPrimary },
  noTemplatesText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', paddingVertical: Spacing[4] },
  templateOption: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing[3], gap: 4 },
  templateOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  templateOptionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  templateOptionName: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  templateOptionBody: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },

  formField: { gap: 6 },
  formLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary },
  textarea: { height: 120, textAlignVertical: 'top' },
  varChips: { flexDirection: 'row', gap: 6 },
  varChip: { backgroundColor: Colors.accentSurface, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  varChipText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.accentDark },

  channelOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing[4] },
  channelOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  channelIconWrap: { width: 40, height: 40, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  channelIconText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
  channelOptionLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.base, color: Colors.textPrimary },
  channelOptionDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  checkBox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  checkBoxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },

  chBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  chBadgeText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs },

  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing[2], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  reviewLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  reviewValue: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary, flex: 1, textAlign: 'right' },
  reviewValueBold: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.primary },
  reviewChannels: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' },

  previewBox: { backgroundColor: Colors.neutral[50], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing[4], gap: 6, marginTop: Spacing[2] },
  previewLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8 },
  previewSubject: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  previewBody: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 20 },

  errorBox: { backgroundColor: Colors.errorSurface, borderRadius: Radius.sm, padding: Spacing[3], marginTop: Spacing[2] },
  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.error },

  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2], backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: Spacing[4], marginTop: Spacing[4] },
  sendBtnDisabled: { backgroundColor: Colors.neutral[300] },
  sendBtnText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.base, color: Colors.white },

  footer: {
    flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing[3],
    padding: Spacing[4], backgroundColor: Colors.white,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  backBtn: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing[5], paddingVertical: Spacing[3] },
  backBtnText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: Spacing[5], paddingVertical: Spacing[3] },
  nextBtnDisabled: { backgroundColor: Colors.neutral[300] },
  nextBtnText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.white },

  successCard: { alignItems: 'center', padding: Spacing[8], gap: Spacing[4] },
  successIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.success, justifyContent: 'center', alignItems: 'center' },
  successTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.textPrimary },
  successStats: { flexDirection: 'row', gap: Spacing[6] },
  successStat: { alignItems: 'center', gap: 4 },
  successStatVal: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['3xl'] },
  successStatLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  resetBtn: { marginTop: Spacing[2], backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: Spacing[8], paddingVertical: Spacing[4] },
  resetBtnText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.base, color: Colors.white },
});
