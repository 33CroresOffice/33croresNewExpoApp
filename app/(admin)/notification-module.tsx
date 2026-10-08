import React, { useEffect, useState, useCallback, useMemo } from 'react';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, Switch,
  RefreshControl, LayoutAnimation,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import {
  ChevronDown, ChevronUp, MessageCircle, Bell, Smartphone,
  Zap, Volume2, Users, Truck, ShieldAlert, AlertTriangle, Pencil,
} from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import {
  NotificationTemplate, NotificationChannel, NotificationRecipientType,
} from '@/types/database';
import {
  NOTIFICATION_DEFINITIONS, NOTIFICATION_CATEGORIES,
  NotificationDefinition,
  CHANNEL_META, RECIPIENT_TYPE_LABELS,
} from '@/constants/notifications';
import NotificationTemplateEditor from '@/components/admin/NotificationTemplateEditor';

type TabType = NotificationRecipientType;

export default function NotificationModuleScreen() {
  return (
    <ModuleGuard module="notifications">
      <NotificationModuleScreenContent />
    </ModuleGuard>
  );
}

function NotificationModuleScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { canManageNotifications } = useAuthStore();

  const [activeTab, setActiveTab] = useState<TabType>('customer');
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [editingDef, setEditingDef] = useState<NotificationDefinition | null>(null);
  const [editingChannel, setEditingChannel] = useState<string>('');

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

  const toggleCategory = (catId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const toggleTemplateActive = useCallback(async (template: NotificationTemplate) => {
    const newActive = !template.is_active;
    await supabase
      .from('notification_templates')
      .update({ is_active: newActive })
      .eq('id', template.id);
    setTemplates((prev) =>
      prev.map((t) => (t.id === template.id ? { ...t, is_active: newActive } : t)),
    );
  }, []);

  const toggleChannelForDef = useCallback(async (
    def: NotificationDefinition,
    channel: string,
  ) => {
    const existing = templates.find(
      (t) =>
        t.event_type === def.eventType &&
        t.channel === channel &&
        (t.reminder_stage ?? null) === (def.reminderStage ?? null),
    );

    if (existing) {
      const newActive = !existing.is_active;
      await supabase
        .from('notification_templates')
        .update({ is_active: newActive })
        .eq('id', existing.id);
      setTemplates((prev) =>
        prev.map((t) => (t.id === existing.id ? { ...t, is_active: newActive } : t)),
      );
    } else {
      const payload: Record<string, unknown> = {
        name: `${def.title} (${CHANNEL_META[channel]?.label ?? channel})`,
        event_type: def.eventType,
        channel,
        is_active: true,
        is_automated: def.isAutomated ?? false,
        body: 'Configure this template content.',
        recipient_type: def.recipientType,
        priority: def.hasSound ? 'critical' : 'normal',
        sound_enabled: def.hasSound ?? false,
      };
      if (def.reminderStage) payload.reminder_stage = def.reminderStage;
      if (def.sendAtDaysBefore != null) payload.send_at_days_before = def.sendAtDaysBefore;

      const { data } = await supabase
        .from('notification_templates')
        .insert(payload)
        .select('*')
        .single();
      if (data) setTemplates((prev) => [...prev, data]);
    }
  }, [templates]);

  const openEditor = (def: NotificationDefinition, channel: string) => {
    const existing = templates.find(
      (t) =>
        t.event_type === def.eventType &&
        t.channel === channel &&
        (t.reminder_stage ?? null) === (def.reminderStage ?? null),
    );
    setEditingTemplate(existing ?? null);
    setEditingDef(def);
    setEditingChannel(channel);
    setEditorVisible(true);
  };

  const handleEditorSave = (updated: NotificationTemplate) => {
    setTemplates((prev) => {
      const exists = prev.find((t) => t.id === updated.id);
      if (exists) return prev.map((t) => (t.id === updated.id ? updated : t));
      return [...prev, updated];
    });
    setEditorVisible(false);
  };

  const definitionsForTab = useMemo(
    () => NOTIFICATION_DEFINITIONS.filter((d) => d.recipientType === activeTab),
    [activeTab],
  );

  const categoriesForTab = useMemo(
    () => NOTIFICATION_CATEGORIES[activeTab],
    [activeTab],
  );

  const getTemplateForDef = useCallback(
    (def: NotificationDefinition, channel: string): NotificationTemplate | undefined =>
      templates.find(
        (t) =>
          t.event_type === def.eventType &&
          t.channel === channel &&
          (t.reminder_stage ?? null) === (def.reminderStage ?? null),
      ),
    [templates],
  );

  const isDefActive = useCallback(
    (def: NotificationDefinition): boolean =>
      def.channels.some((ch) => getTemplateForDef(def, ch)?.is_active ?? false),
    [getTemplateForDef],
  );

  const activeCount = definitionsForTab.filter(isDefActive).length;
  const totalCount = definitionsForTab.length;

  if (!canManageNotifications) {
    return (
      <View style={styles.accessDenied}>
        <ShieldAlert size={48} color={Colors.textTertiary} strokeWidth={1.5} />
        <Text style={styles.accessDeniedTitle}>Access Restricted</Text>
        <Text style={styles.accessDeniedSub}>You don't have permission to manage notifications.</Text>
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
          <Text style={styles.headerTitle}>Notification Module</Text>
          <Text style={styles.headerSub}>
            {activeCount} of {totalCount} {RECIPIENT_TYPE_LABELS[activeTab]} notifications active
          </Text>
        </View>
      </View>

      <View style={styles.tabBar}>
        {(['customer', 'vendor', 'admin'] as TabType[]).map((tab) => {
          const tabDefs = NOTIFICATION_DEFINITIONS.filter((d) => d.recipientType === tab);
          const tabActive = tabDefs.filter((d) =>
            d.channels.some((ch) => getTemplateForDef(d, ch)?.is_active ?? false),
          ).length;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              {tab === 'customer' && <Users size={15} color={activeTab === tab ? Colors.primary : Colors.textTertiary} />}
              {tab === 'vendor' && <Truck size={15} color={activeTab === tab ? Colors.primary : Colors.textTertiary} />}
              {tab === 'admin' && <ShieldAlert size={15} color={activeTab === tab ? Colors.primary : Colors.textTertiary} />}
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {RECIPIENT_TYPE_LABELS[tab]}
              </Text>
              <View style={[styles.tabBadge, activeTab === tab && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, activeTab === tab && styles.tabBadgeTextActive]}>
                  {tabActive}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {templates.filter((t) => t.is_automated && t.is_active).length > 0 && (
          <View style={styles.automationBar}>
            <Zap size={14} color={Colors.success} />
            <Text style={styles.automationBarText}>
              <Text style={styles.automationBarBold}>
                {templates.filter((t) => t.is_automated && t.is_active).length} automated
              </Text>
              {' '}notifications will fire automatically.
            </Text>
          </View>
        )}

        {categoriesForTab.map((category) => {
          const catDefs = definitionsForTab.filter((d) => d.category === category.id);
          if (catDefs.length === 0) return null;
          const isExpanded = expandedCategories.has(category.id);
          const catActiveCount = catDefs.filter(isDefActive).length;

          return (
            <View key={category.id} style={styles.categorySection}>
              <TouchableOpacity
                style={styles.categoryHeader}
                onPress={() => toggleCategory(category.id)}
                activeOpacity={0.7}
              >
                <View style={styles.categoryHeaderLeft}>
                  <Text style={styles.categoryLabel}>{category.label}</Text>
                  <Text style={styles.categoryDesc}>{category.description}</Text>
                </View>
                <View style={styles.categoryHeaderRight}>
                  <View style={[styles.categoryCountBadge, catActiveCount > 0 && styles.categoryCountBadgeActive]}>
                    <Text style={[styles.categoryCountText, catActiveCount > 0 && styles.categoryCountTextActive]}>
                      {catActiveCount}/{catDefs.length}
                    </Text>
                  </View>
                  {isExpanded ? (
                    <ChevronUp size={18} color={Colors.textTertiary} strokeWidth={2} />
                  ) : (
                    <ChevronDown size={18} color={Colors.textTertiary} strokeWidth={2} />
                  )}
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.categoryBody}>
                  {catDefs.map((def) => {
                    const isOn = isDefActive(def);
                    const allChannelsActive = def.channels.every(
                      (ch) => getTemplateForDef(def, ch)?.is_active ?? false,
                    );
                    return (
                      <View key={`${def.eventType}-${def.reminderStage ?? 'none'}`} style={styles.notifCard}>
                        <View style={styles.notifCardHeader}>
                          <View style={styles.notifCardInfo}>
                            <View style={styles.notifTitleRow}>
                              {def.hasSound && (
                                <View style={styles.soundBadge}>
                                  <Volume2 size={11} color={Colors.warning} strokeWidth={2.5} />
                                </View>
                              )}
                              <Text style={styles.notifTitle}>{def.title}</Text>
                            </View>
                            <Text style={styles.notifDesc}>{def.description}</Text>
                            {def.isAutomated && (
                              <View style={styles.autoTag}>
                                <Zap size={9} color={Colors.success} strokeWidth={2.5} />
                                <Text style={styles.autoTagText}>Automated</Text>
                              </View>
                            )}
                          </View>
                          <Switch
                            value={isOn}
                            onValueChange={() => {
                              def.channels.forEach((ch) => {
                                const tmpl = getTemplateForDef(def, ch);
                                if (allChannelsActive && tmpl?.is_active) {
                                  toggleTemplateActive(tmpl);
                                } else if (!allChannelsActive && (!tmpl || !tmpl.is_active)) {
                                  toggleChannelForDef(def, ch);
                                }
                              });
                            }}
                            trackColor={{ false: Colors.border, true: Colors.primary }}
                            thumbColor={Colors.white}
                          />
                        </View>

                        <View style={styles.channelRow}>
                          {def.channels.map((ch) => {
                            const tmpl = getTemplateForDef(def, ch);
                            const active = tmpl?.is_active ?? false;
                            const meta = CHANNEL_META[ch];
                            const needsConfig = active && ch === 'whatsapp' && tmpl && !tmpl.msg91_whatsapp_template_id;
                            return (
                              <View key={ch} style={styles.channelChipWrap}>
                                <TouchableOpacity
                                  style={[
                                    styles.channelChip,
                                    active && { backgroundColor: meta.bg, borderColor: meta.color },
                                  ]}
                                  onPress={() => toggleChannelForDef(def, ch)}
                                  activeOpacity={0.7}
                                >
                                  {ch === 'whatsapp' && <MessageCircle size={13} color={active ? meta.color : Colors.textTertiary} strokeWidth={2} />}
                                  {ch === 'push' && <Bell size={13} color={active ? meta.color : Colors.textTertiary} strokeWidth={2} />}
                                  {ch === 'in_app' && <Smartphone size={13} color={active ? meta.color : Colors.textTertiary} strokeWidth={2} />}
                                  <Text style={[styles.channelChipText, { color: active ? meta.color : Colors.textTertiary }]}>
                                    {meta.label}
                                  </Text>
                                  {needsConfig && <AlertTriangle size={10} color={Colors.warning} strokeWidth={2.5} />}
                                </TouchableOpacity>
                                {active && (
                                  <TouchableOpacity
                                    style={styles.configBtn}
                                    onPress={() => openEditor(def, ch)}
                                  >
                                    <Pencil size={11} color={Colors.primary} strokeWidth={2.5} />
                                    <Text style={styles.configBtnText}>Edit</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: Spacing[8] }} />
      </ScrollView>

      <NotificationTemplateEditor
        visible={editorVisible}
        template={editingTemplate}
        definition={editingDef}
        channel={editingChannel}
        onClose={() => setEditorVisible(false)}
        onSave={handleEditorSave}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  containerWeb: { maxWidth: 900, width: '100%', alignSelf: 'center' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  accessDenied: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing[6] },
  accessDeniedTitle: { fontSize: Typography.size.lg, fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textPrimary, marginTop: Spacing[3] },
  accessDeniedSub: { fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: Spacing[1] },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[3],
  },
  headerTitle: { fontSize: Typography.size.xl, fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 2 },
  tabBar: {
    flexDirection: 'row', paddingHorizontal: Spacing[4], gap: Spacing[2], marginBottom: Spacing[2],
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: Spacing[2], paddingHorizontal: Spacing[3],
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
  },
  tabActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  tabText: { fontSize: Typography.size.sm, fontFamily: Typography.fontFamily.sansMedium, color: Colors.textTertiary },
  tabTextActive: { color: Colors.primary },
  tabBadge: {
    minWidth: 20, height: 20, borderRadius: 10, backgroundColor: Colors.surface,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5,
  },
  tabBadgeActive: { backgroundColor: Colors.primary },
  tabBadgeText: { fontSize: 10, fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textTertiary },
  tabBadgeTextActive: { color: Colors.white },
  content: { paddingHorizontal: Spacing[4], paddingBottom: Spacing[4] },
  automationBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.successSurface, borderRadius: Radius.md,
    paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], marginBottom: Spacing[3],
  },
  automationBarText: { fontSize: Typography.size.xs, color: Colors.textSecondary },
  automationBarBold: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.success },
  categorySection: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    marginBottom: Spacing[3], ...Shadow.sm,
  },
  categoryHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing[4],
  },
  categoryHeaderLeft: { flex: 1 },
  categoryHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  categoryLabel: { fontSize: Typography.size.base, fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textPrimary },
  categoryDesc: { fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  categoryCountBadge: {
    minWidth: 36, height: 22, borderRadius: 11, backgroundColor: Colors.surface,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6,
  },
  categoryCountBadgeActive: { backgroundColor: Colors.primarySurface },
  categoryCountText: { fontSize: 11, fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textTertiary },
  categoryCountTextActive: { color: Colors.primary },
  categoryBody: { paddingHorizontal: Spacing[3], paddingBottom: Spacing[3] },
  notifCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing[3], marginBottom: Spacing[2],
  },
  notifCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  notifCardInfo: { flex: 1, marginRight: Spacing[3] },
  notifTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  soundBadge: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.warningSurface,
    justifyContent: 'center', alignItems: 'center',
  },
  notifTitle: { fontSize: Typography.size.sm, fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textPrimary },
  notifDesc: { fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2, lineHeight: 16 },
  autoTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    marginTop: Spacing[2], backgroundColor: Colors.successSurface,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start',
  },
  autoTagText: { fontSize: 10, fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.success },
  channelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2], marginTop: Spacing[3] },
  channelChipWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  channelChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  channelChipText: { fontSize: 11, fontFamily: Typography.fontFamily.sansMedium },
  configBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingVertical: 3, paddingHorizontal: 6, borderRadius: 6,
  },
  configBtnText: { fontSize: 10, fontFamily: Typography.fontFamily.sansMedium, color: Colors.primary },
});
