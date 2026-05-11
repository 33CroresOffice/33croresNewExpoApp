import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, RefreshControl, Modal, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Leaf, ArrowLeft, RefreshCw, ChevronLeft, ChevronRight, Package, Check, X, Calendar } from 'lucide-react-native';
import { router } from 'expo-router';
import { format, addDays, subDays, parseISO } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { DailyRequirement } from '@/types/database';

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending:   { bg: Colors.warningSurface,   text: Colors.warning,  label: 'Pending' },
  ordered:   { bg: Colors.primarySurface,   text: Colors.primary,  label: 'Ordered' },
  fulfilled: { bg: Colors.successSurface,   text: Colors.success,  label: 'Fulfilled' },
};

export default function DailyRequirementsScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [date, setDate] = useState(new Date());
  const [requirements, setRequirements] = useState<DailyRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [genError, setGenError] = useState('');

  const dateStr = format(date, 'yyyy-MM-dd');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('daily_requirements')
        .select('*, flower_type:flower_types(display_name, unit_type)')
        .eq('requirement_date', dateStr)
        .order('created_at');
      if (data) setRequirements(data);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [dateStr]);

  const generate = async () => {
    setGenerating(true);
    setGenError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-daily-requirements`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
          'Apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        },
        body: JSON.stringify({ date: dateStr }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Generation failed');
      load();
    } catch (e: any) {
      setGenError(e.message ?? 'Failed to generate requirements');
    }
    setGenerating(false);
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('daily_requirements').update({ status }).eq('id', id);
    setRequirements(prev => prev.map(r => r.id === id ? { ...r, status: status as any } : r));
  };

  const totalPending = requirements.filter(r => r.status === 'pending').length;
  const totalOrdered = requirements.filter(r => r.status === 'ordered').length;
  const totalFulfilled = requirements.filter(r => r.status === 'fulfilled').length;

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
            <Leaf size={isWeb ? 22 : 18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>Daily Requirements</Text>
            <Text style={s.subtitle}>{format(date, 'EEEE, dd MMM yyyy')}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[s.genBtn, generating && s.genBtnDisabled]}
          onPress={generate}
          disabled={generating}
          activeOpacity={0.8}
        >
          {generating ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <>
              <RefreshCw size={14} color={Colors.white} strokeWidth={2} />
              <Text style={s.genBtnText}>Generate</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={s.datePicker}>
        <TouchableOpacity onPress={() => setDate(d => subDays(d, 1))} style={s.dateArrow}>
          <ChevronLeft size={20} color={Colors.textSecondary} strokeWidth={1.8} />
        </TouchableOpacity>
        <View style={s.dateCenter}>
          <Calendar size={14} color={Colors.textTertiary} strokeWidth={1.8} />
          <Text style={s.dateText}>{format(date, 'dd MMMM yyyy')}</Text>
          {format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') && (
            <View style={s.todayBadge}><Text style={s.todayText}>Today</Text></View>
          )}
        </View>
        <TouchableOpacity onPress={() => setDate(d => addDays(d, 1))} style={s.dateArrow}>
          <ChevronRight size={20} color={Colors.textSecondary} strokeWidth={1.8} />
        </TouchableOpacity>
      </View>

      {genError ? (
        <View style={s.errorBanner}>
          <Text style={s.errorBannerText}>{genError}</Text>
        </View>
      ) : null}

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, isWeb && s.contentWeb]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {(totalPending > 0 || totalOrdered > 0 || totalFulfilled > 0) && (
          <View style={[s.statsRow, isWeb && s.statsRowWeb]}>
            <View style={[s.statCard, { borderLeftColor: Colors.warning }]}>
              <Text style={[s.statValue, { color: Colors.warning }]}>{totalPending}</Text>
              <Text style={s.statLabel}>Pending</Text>
            </View>
            <View style={[s.statCard, { borderLeftColor: Colors.primary }]}>
              <Text style={[s.statValue, { color: Colors.primary }]}>{totalOrdered}</Text>
              <Text style={s.statLabel}>Ordered</Text>
            </View>
            <View style={[s.statCard, { borderLeftColor: Colors.success }]}>
              <Text style={[s.statValue, { color: Colors.success }]}>{totalFulfilled}</Text>
              <Text style={s.statLabel}>Fulfilled</Text>
            </View>
          </View>
        )}

        {loading ? (
          <View style={s.center}><ActivityIndicator color={Colors.primary} /></View>
        ) : requirements.length === 0 ? (
          <View style={s.emptyState}>
            <Leaf size={48} color={Colors.textDisabled} strokeWidth={1.2} />
            <Text style={s.emptyTitle}>No requirements for this date</Text>
            <Text style={s.emptySub}>Tap "Generate" to compute flower requirements based on active subscriptions.</Text>
            <TouchableOpacity style={s.generateLargeBtn} onPress={generate} disabled={generating}>
              {generating ? <ActivityIndicator size="small" color={Colors.white} /> : (
                <>
                  <RefreshCw size={16} color={Colors.white} strokeWidth={2} />
                  <Text style={s.generateLargeBtnText}>Generate Requirements</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.list}>
            {isWeb ? (
              <View style={s.tableCard}>
                <View style={s.tableHead}>
                  <Text style={[s.thCell, { flex: 3 }]}>Flower</Text>
                  <Text style={[s.thCell, { flex: 1, textAlign: 'right' }]}>Qty</Text>
                  <Text style={[s.thCell, { flex: 1 }]}>Unit</Text>
                  <Text style={[s.thCell, { flex: 1 }]}>Subscriptions</Text>
                  <Text style={[s.thCell, { flex: 1 }]}>Custom Orders</Text>
                  <Text style={[s.thCell, { flex: 1 }]}>Status</Text>
                  <Text style={[s.thCell, { width: 120 }]}>Actions</Text>
                </View>
                {requirements.map((r, i) => {
                  const sc = STATUS_COLORS[r.status] ?? STATUS_COLORS.pending;
                  return (
                    <View key={r.id} style={[s.tableRow, i % 2 === 1 && s.tableRowAlt]}>
                      <View style={[{ flex: 3 }, s.flowerCell]}>
                        <View style={s.flowerDot}>
                          <Leaf size={12} color={Colors.primary} strokeWidth={2} />
                        </View>
                        <Text style={s.tdPrimary}>{(r.flower_type as any)?.display_name ?? 'Unknown'}</Text>
                      </View>
                      <Text style={[s.tdCell, { flex: 1, textAlign: 'right', fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary }]}>{r.total_quantity}</Text>
                      <Text style={[s.tdCell, { flex: 1 }]}>{r.unit_type ?? (r.flower_type as any)?.unit_type}</Text>
                      <Text style={[s.tdCell, { flex: 1 }]}>{r.active_subscriptions_count}</Text>
                      <Text style={[s.tdCell, { flex: 1 }]}>{(r as any).custom_orders_count ?? 0}</Text>
                      <View style={{ flex: 1 }}>
                        <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
                          <Text style={[s.statusText, { color: sc.text }]}>{sc.label}</Text>
                        </View>
                      </View>
                      <View style={[{ width: 120 }, s.actionsCell]}>
                        {r.status !== 'ordered' && (
                          <TouchableOpacity style={s.actionBtn} onPress={() => updateStatus(r.id, 'ordered')}>
                            <Package size={14} color={Colors.primary} strokeWidth={2} />
                          </TouchableOpacity>
                        )}
                        {r.status !== 'fulfilled' && (
                          <TouchableOpacity style={s.actionBtn} onPress={() => updateStatus(r.id, 'fulfilled')}>
                            <Check size={14} color={Colors.success} strokeWidth={2} />
                          </TouchableOpacity>
                        )}
                        {r.status !== 'pending' && (
                          <TouchableOpacity style={s.actionBtn} onPress={() => updateStatus(r.id, 'pending')}>
                            <X size={14} color={Colors.warning} strokeWidth={2} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              requirements.map(r => {
                const sc = STATUS_COLORS[r.status] ?? STATUS_COLORS.pending;
                return (
                  <View key={r.id} style={s.reqCard}>
                    <View style={s.reqCardTop}>
                      <View style={s.flowerDot}>
                        <Leaf size={14} color={Colors.primary} strokeWidth={2} />
                      </View>
                      <View style={s.reqInfo}>
                        <Text style={s.reqFlower}>{(r.flower_type as any)?.display_name ?? 'Unknown'}</Text>
                        <Text style={s.reqSubs}>
                          {r.active_subscriptions_count} subscription{r.active_subscriptions_count !== 1 ? 's' : ''}
                          {((r as any).custom_orders_count ?? 0) > 0 ? ` · ${(r as any).custom_orders_count} custom` : ''}
                        </Text>
                      </View>
                      <View>
                        <Text style={s.reqQty}>{r.total_quantity}</Text>
                        <Text style={s.reqUnit}>{r.unit_type ?? (r.flower_type as any)?.unit_type}</Text>
                      </View>
                    </View>
                    <View style={s.reqCardBottom}>
                      <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
                        <Text style={[s.statusText, { color: sc.text }]}>{sc.label}</Text>
                      </View>
                      <View style={s.reqActions}>
                        {r.status !== 'ordered' && (
                          <TouchableOpacity style={s.reqActionBtn} onPress={() => updateStatus(r.id, 'ordered')}>
                            <Package size={14} color={Colors.primary} strokeWidth={2} />
                            <Text style={[s.reqActionText, { color: Colors.primary }]}>Mark Ordered</Text>
                          </TouchableOpacity>
                        )}
                        {r.status !== 'fulfilled' && (
                          <TouchableOpacity style={s.reqActionBtn} onPress={() => updateStatus(r.id, 'fulfilled')}>
                            <Check size={14} color={Colors.success} strokeWidth={2} />
                            <Text style={[s.reqActionText, { color: Colors.success }]}>Fulfilled</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
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
  genBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.primary, paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], borderRadius: Radius.full },
  genBtnDisabled: { opacity: 0.6 },
  genBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  datePicker: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: Spacing[3] },
  dateArrow: { padding: Spacing[3], paddingHorizontal: Spacing[4] },
  dateCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2] },
  dateText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  todayBadge: { backgroundColor: Colors.primarySurface, paddingVertical: 2, paddingHorizontal: 8, borderRadius: Radius.full },
  todayText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.primary },
  errorBanner: { backgroundColor: Colors.errorSurface, padding: Spacing[4], borderBottomWidth: 1, borderBottomColor: Colors.error },
  errorBannerText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error },
  scroll: { flex: 1 },
  content: { padding: Spacing[5], gap: Spacing[4] },
  contentWeb: { padding: Spacing[8], maxWidth: 1100, alignSelf: 'center', width: '100%' },
  statsRow: { flexDirection: 'row', gap: Spacing[3] },
  statsRowWeb: { gap: Spacing[4] },
  statCard: { flex: 1, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderLeftWidth: 3, ...Shadow.sm },
  statValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'] },
  statLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  center: { paddingTop: 80, alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  emptySub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 300 },
  generateLargeBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.primary, paddingVertical: Spacing[3], paddingHorizontal: Spacing[6], borderRadius: Radius.full, marginTop: Spacing[3] },
  generateLargeBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
  list: { gap: Spacing[3] },
  tableCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  tableHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], backgroundColor: Colors.neutral[50], borderBottomWidth: 1, borderBottomColor: Colors.border },
  thCell: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  flowerCell: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  flowerDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  tdPrimary: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  tdCell: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  statusBadge: { alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 10, borderRadius: Radius.full },
  statusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs },
  actionsCell: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  actionBtn: { width: 30, height: 30, borderRadius: Radius.sm, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  reqCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, gap: Spacing[3], ...Shadow.sm },
  reqCardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  reqInfo: { flex: 1 },
  reqFlower: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  reqSubs: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  reqQty: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.textPrimary, textAlign: 'right' },
  reqUnit: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, textAlign: 'right' },
  reqCardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reqActions: { flexDirection: 'row', gap: Spacing[3] },
  reqActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reqActionText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs },
});
