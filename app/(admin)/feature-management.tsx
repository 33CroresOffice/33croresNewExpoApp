import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Info,
  Play,
  Power,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  XCircle,
  Zap,
} from 'lucide-react-native';
import { Colors, Radius, Shadow, Spacing, Typography } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

type ImpactLevel = 'low' | 'medium' | 'high';

type FeatureSetting = {
  id: string;
  feature_key: string;
  display_name: string;
  description: string;
  category: string;
  is_active: boolean;
  schedule_label: string | null;
  rpc_name: string | null;
  impact_level: ImpactLevel;
  impact_description: string;
  affected_areas: string;
  sort_order: number;
};

type RunLog = {
  automation_name: string;
  status: string;
  created_at: string;
  error_message: string | null;
};

type FeatureStatus = {
  status: string;
  created_at: string;
  error_message: string | null;
};

const CATEGORY_ORDER = [
  'Order Generation',
  'Rider Assignment',
  'Delivery Operations',
  'Procurement',
  'Notifications',
  'Subscriptions',
  'Finance',
  'System Health',
];

const CATEGORY_COLOR: Record<string, string> = {
  'Order Generation': '#1565C0',
  'Rider Assignment': '#2D5A27',
  'Delivery Operations': '#00838F',
  Procurement: '#A67C2E',
  Notifications: '#6A1B9A',
  Subscriptions: '#C8526A',
  Finance: '#5D4037',
  'System Health': '#455A64',
};

const DEPENDENCIES: Record<string, string[]> = {
  generate_daily_orders: ['auto_assign_riders', 'notify_customer_dispatch_in_app'],
  auto_assign_riders: ['retry_unassigned_relaxed', 'notify_rider_assignments_in_app'],
  auto_generate_procurement: ['auto_generate_vendor_payments', 'notify_vendors_procurement'],
  daily_renewal_check: ['send_renewal_payment_reminders'],
};

export default function FeatureManagement() {
  const insets = useSafeAreaInsets();
  const { isSuperAdmin } = useAuthStore();
  const [features, setFeatures] = useState<FeatureSetting[]>([]);
  const [lastRuns, setLastRuns] = useState<Record<string, FeatureStatus>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [runningKey, setRunningKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [featuresRes, logsRes] = await Promise.all([
      supabase.from('feature_settings').select('*').order('sort_order', { ascending: true }),
      supabase
        .from('automation_run_logs')
        .select('automation_name,status,created_at,error_message')
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    if (featuresRes.error) setError('Could not load feature settings.');
    if (logsRes.error) setError('Could not load recent feature activity.');

    setFeatures((featuresRes.data ?? []) as FeatureSetting[]);
    const runMap: Record<string, FeatureStatus> = {};
    ((logsRes.data ?? []) as RunLog[]).forEach((log) => {
      if (!runMap[log.automation_name]) {
        runMap[log.automation_name] = {
          status: log.status,
          created_at: log.created_at,
          error_message: log.error_message,
        };
      }
    });
    setLastRuns(runMap);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredFeatures = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return features;
    return features.filter((feature) =>
      `${feature.display_name} ${feature.category} ${feature.description} ${feature.affected_areas}`.toLowerCase().includes(query),
    );
  }, [features, search]);

  const groupedFeatures = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      items: filteredFeatures.filter((feature) => feature.category === category),
    })).filter((group) => group.items.length > 0);
  }, [filteredFeatures]);

  const activeCount = features.filter((feature) => feature.is_active).length;
  const inactiveCount = features.length - activeCount;

  const toggleFeature = async (feature: FeatureSetting, nextValue: boolean) => {
    setSavingKey(feature.feature_key);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('toggle_feature', {
      p_key: feature.feature_key,
      p_active: nextValue,
    });
    if (rpcError || !data?.success) {
      setError(rpcError?.message ?? 'The feature could not be updated.');
    } else {
      setFeatures((current) => current.map((item) => item.feature_key === feature.feature_key ? { ...item, is_active: nextValue } : item));
    }
    setSavingKey(null);
  };

  const runFeature = async (feature: FeatureSetting) => {
    setRunningKey(feature.feature_key);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('admin_run_automation', { p_name: feature.feature_key });
    if (rpcError || !data?.success) {
      setError(rpcError?.message ?? data?.error ?? 'The feature could not be run.');
    } else {
      await load();
    }
    setRunningKey(null);
  };

  const impactColor = (level: ImpactLevel) => {
    if (level === 'high') return Colors.error;
    if (level === 'medium') return Colors.warning;
    return Colors.success;
  };

  if (!isSuperAdmin) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}> 
        <ShieldAlert size={38} color={Colors.error} strokeWidth={1.7} />
        <Text style={styles.deniedTitle}>Super Admin access required</Text>
        <Text style={styles.deniedText}>Feature controls affect the entire delivery operation and are limited to Super Admins.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}> 
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading feature controls...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}> 
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <SlidersHorizontal size={25} color={Colors.accent} strokeWidth={1.8} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>Super Admin Controls</Text>
            <Text style={styles.title}>Feature Management</Text>
            <Text style={styles.subtitle}>Understand, activate, pause, and manually run every automated operation.</Text>
          </View>
        </View>

        <View style={styles.summaryGrid}>
          <View style={[styles.summaryCard, { borderTopColor: Colors.primary }]}>
            <Zap size={18} color={Colors.primary} strokeWidth={1.8} />
            <Text style={styles.summaryValue}>{features.length}</Text>
            <Text style={styles.summaryLabel}>Total features</Text>
          </View>
          <View style={[styles.summaryCard, { borderTopColor: Colors.success }]}>
            <CheckCircle2 size={18} color={Colors.success} strokeWidth={1.8} />
            <Text style={styles.summaryValue}>{activeCount}</Text>
            <Text style={styles.summaryLabel}>Active now</Text>
          </View>
          <View style={[styles.summaryCard, { borderTopColor: Colors.error }]}>
            <Power size={18} color={Colors.error} strokeWidth={1.8} />
            <Text style={styles.summaryValue}>{inactiveCount}</Text>
            <Text style={styles.summaryLabel}>Paused</Text>
          </View>
        </View>

        <View style={styles.infoBanner}>
          <Info size={17} color={Colors.primary} strokeWidth={1.8} />
          <Text style={styles.infoText}>Pausing a feature stops its scheduled job. Existing data is not deleted, but the related work will need to be handled manually.</Text>
        </View>

        <View style={styles.searchBox}>
          <Search size={18} color={Colors.textTertiary} strokeWidth={1.8} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search features, categories, or affected areas"
            placeholderTextColor={Colors.textTertiary}
            style={styles.searchInput}
          />
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <XCircle size={16} color={Colors.error} strokeWidth={1.8} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {groupedFeatures.map((group) => (
          <View key={group.category} style={styles.categorySection}>
            <View style={styles.categoryHeader}>
              <View style={[styles.categoryDot, { backgroundColor: CATEGORY_COLOR[group.category] ?? Colors.primary }]} />
              <Text style={styles.categoryTitle}>{group.category}</Text>
              <Text style={styles.categoryCount}>{group.items.length}</Text>
            </View>
            <View style={styles.featureList}>
              {group.items.map((feature) => {
                const isExpanded = expanded === feature.feature_key;
                const lastRun = lastRuns[feature.feature_key];
                const dependentKeys = DEPENDENCIES[feature.feature_key] ?? [];
                const inactiveDependents = dependentKeys.filter((key) => features.some((item) => item.feature_key === key && item.is_active));
                const color = CATEGORY_COLOR[feature.category] ?? Colors.primary;
                return (
                  <View key={feature.feature_key} style={[styles.featureCard, !feature.is_active && styles.featureCardInactive]}>
                    <TouchableOpacity style={styles.featureHeader} onPress={() => setExpanded(isExpanded ? null : feature.feature_key)} activeOpacity={0.75}>
                      <View style={[styles.featureIcon, { backgroundColor: `${color}14` }]}>
                        <Activity size={18} color={color} strokeWidth={1.8} />
                      </View>
                      <View style={styles.featureHeading}>
                        <View style={styles.featureNameRow}>
                          <Text style={styles.featureName}>{feature.display_name}</Text>
                          <View style={[styles.impactPill, { backgroundColor: `${impactColor(feature.impact_level)}16` }]}>
                            <Text style={[styles.impactText, { color: impactColor(feature.impact_level) }]}>{feature.impact_level} impact</Text>
                          </View>
                        </View>
                        <Text style={styles.schedule}>{feature.schedule_label ?? 'Manual only'}</Text>
                      </View>
                      <View style={styles.featureStatus}>
                        {savingKey === feature.feature_key ? <ActivityIndicator size="small" color={Colors.primary} /> : <Switch value={feature.is_active} onValueChange={(value) => toggleFeature(feature, value)} trackColor={{ false: Colors.neutral[300], true: Colors.primaryLight }} thumbColor={Colors.white} />}
                        {isExpanded ? <ChevronUp size={18} color={Colors.textTertiary} /> : <ChevronDown size={18} color={Colors.textTertiary} />}
                      </View>
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.details}>
                        <Text style={styles.description}>{feature.description}</Text>
                        <View style={styles.detailGrid}>
                          <View style={styles.detailBlock}>
                            <Text style={styles.detailLabel}>If paused</Text>
                            <Text style={styles.detailValue}>{feature.impact_description}</Text>
                          </View>
                          <View style={styles.detailBlock}>
                            <Text style={styles.detailLabel}>Affected areas</Text>
                            <Text style={styles.detailValue}>{feature.affected_areas}</Text>
                          </View>
                        </View>

                        {inactiveDependents.length > 0 && (
                          <View style={styles.dependencyWarning}>
                            <AlertTriangle size={15} color={Colors.warning} strokeWidth={1.8} />
                            <Text style={styles.dependencyText}>This feature supports other active automations. Pausing it may cause those features to produce incomplete results.</Text>
                          </View>
                        )}

                        <View style={styles.lastRunRow}>
                          <View style={styles.lastRunInfo}>
                            {lastRun?.status === 'success' ? <CheckCircle2 size={15} color={Colors.success} strokeWidth={1.8} /> : lastRun?.status === 'failed' ? <XCircle size={15} color={Colors.error} strokeWidth={1.8} /> : <Clock3 size={15} color={Colors.textTertiary} strokeWidth={1.8} />}
                            <Text style={styles.lastRunText}>{lastRun ? `Last run ${new Date(lastRun.created_at).toLocaleString()}` : 'No recorded runs yet'}</Text>
                          </View>
                          <TouchableOpacity style={[styles.runButton, runningKey === feature.feature_key && styles.runButtonDisabled]} onPress={() => runFeature(feature)} disabled={runningKey !== null}>
                            {runningKey === feature.feature_key ? <ActivityIndicator size="small" color={Colors.white} /> : <Play size={14} color={Colors.white} fill={Colors.white} strokeWidth={1.8} />}
                            <Text style={styles.runButtonText}>{runningKey === feature.feature_key ? 'Running' : 'Run Now'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        {groupedFeatures.length === 0 && (
          <View style={styles.emptyState}>
            <Search size={30} color={Colors.textTertiary} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>No matching features</Text>
            <Text style={styles.emptyText}>Try a different name, category, or affected area.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { width: '100%', maxWidth: 980, alignSelf: 'center', padding: Spacing[5], paddingBottom: 56 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing[6], backgroundColor: Colors.background },
  loadingText: { marginTop: Spacing[3], color: Colors.textSecondary, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm },
  deniedTitle: { marginTop: Spacing[4], color: Colors.textPrimary, fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl },
  deniedText: { marginTop: Spacing[2], maxWidth: 360, textAlign: 'center', color: Colors.textSecondary, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, lineHeight: 21 },
  hero: { flexDirection: 'row', alignItems: 'center', padding: Spacing[5], backgroundColor: Colors.primaryDark, borderRadius: Radius.lg, ...Shadow.md },
  heroIcon: { width: 50, height: 50, borderRadius: Radius.md, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center', marginRight: Spacing[4] },
  heroCopy: { flex: 1 },
  eyebrow: { color: Colors.accentLight, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: Colors.white, fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], marginTop: 3 },
  subtitle: { color: 'rgba(255,255,255,0.72)', fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, lineHeight: 20, marginTop: 4 },
  summaryGrid: { flexDirection: 'row', gap: Spacing[3], marginTop: Spacing[4] },
  summaryCard: { flex: 1, minWidth: 120, backgroundColor: Colors.surface, borderRadius: Radius.md, borderTopWidth: 3, padding: Spacing[3], ...Shadow.sm },
  summaryValue: { color: Colors.textPrimary, fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, marginTop: Spacing[2] },
  summaryLabel: { color: Colors.textTertiary, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, marginTop: 2 },
  infoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2], backgroundColor: Colors.primarySurface, borderRadius: Radius.md, padding: Spacing[3], marginTop: Spacing[4] },
  infoText: { flex: 1, color: Colors.primaryDark, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, lineHeight: 20 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing[3], marginTop: Spacing[4], ...Shadow.sm },
  searchInput: { flex: 1, minHeight: 46, paddingHorizontal: Spacing[2], color: Colors.textPrimary, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, outlineStyle: 'none' as any },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.errorSurface, borderRadius: Radius.md, padding: Spacing[3], marginTop: Spacing[3] },
  errorText: { flex: 1, color: Colors.error, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm },
  categorySection: { marginTop: Spacing[6] },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing[2] },
  categoryDot: { width: 8, height: 8, borderRadius: 4, marginRight: Spacing[2] },
  categoryTitle: { flex: 1, color: Colors.textPrimary, fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg },
  categoryCount: { color: Colors.textTertiary, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm },
  featureList: { gap: Spacing[2] },
  featureCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  featureCardInactive: { opacity: 0.78 },
  featureHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing[3] },
  featureIcon: { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginRight: Spacing[3] },
  featureHeading: { flex: 1, minWidth: 0 },
  featureNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flexWrap: 'wrap' },
  featureName: { color: Colors.textPrimary, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm },
  impactPill: { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3 },
  impactText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, textTransform: 'capitalize' },
  schedule: { color: Colors.textTertiary, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, marginTop: 4 },
  featureStatus: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], marginLeft: Spacing[2] },
  details: { borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.neutral[50], padding: Spacing[4] },
  description: { color: Colors.textSecondary, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, lineHeight: 22 },
  detailGrid: { flexDirection: 'row', gap: Spacing[4], marginTop: Spacing[4] },
  detailBlock: { flex: 1 },
  detailLabel: { color: Colors.textTertiary, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { color: Colors.textSecondary, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, lineHeight: 20, marginTop: 4 },
  dependencyWarning: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2], backgroundColor: Colors.warningSurface, borderRadius: Radius.sm, padding: Spacing[3], marginTop: Spacing[4] },
  dependencyText: { flex: 1, color: Colors.warning, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, lineHeight: 18 },
  lastRunRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing[3], marginTop: Spacing[4] },
  lastRunInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  lastRunText: { color: Colors.textTertiary, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs },
  runButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2] },
  runButtonDisabled: { opacity: 0.65 },
  runButtonText: { color: Colors.white, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs },
  emptyState: { alignItems: 'center', paddingVertical: 56 },
  emptyTitle: { color: Colors.textPrimary, fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, marginTop: Spacing[3] },
  emptyText: { color: Colors.textTertiary, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, marginTop: Spacing[2] },
});
