import React, { useEffect, useState, useCallback } from 'react';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Flower2, ArrowLeft, Sparkles, TrendingDown, TrendingUp, Wallet, X, List, LayoutGrid,
  ChevronDown, ChevronRight,
} from 'lucide-react-native';
import { router } from 'expo-router';
import { format, startOfMonth, subMonths } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import DatePickerField from '@/components/ui/DatePickerField';

interface FlowerPurchaseItem {
  id: string;
  quantity: number;
  unit_type: string | null;
  price_per_unit: number | null;
  total_price: number | null;
  garland_details: { quantity?: number; size?: string }[] | null;
  flower_type?: { name: string };
  procurement_order?: {
    id: string;
    order_number: string;
    order_date: string;
    status: string;
    vendor?: { business_name: string } | null;
  } | null;
}

const PERIOD_OPTIONS = [
  { label: 'This Month', value: 0 },
  { label: '3 Months', value: 3 },
];

export default function FlowerPaymentsScreen() {
  return (
    <ModuleGuard module="finance">
      <FlowerPaymentsScreenContent />
    </ModuleGuard>
  );
}

function FlowerPaymentsScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [items, setItems] = useState<FlowerPurchaseItem[]>([]);
  const [customKeys, setCustomKeys] = useState<Set<string>>(new Set());
  const [revenue, setRevenue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateFilter, setDateFilter] = useState(0);
  const [rangeFrom, setRangeFrom] = useState<Date | null>(null);
  const [rangeTo, setRangeTo] = useState<Date | null>(null);
  const [openPicker, setOpenPicker] = useState<'from' | 'to' | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  const toggleDate = useCallback((date: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const range = (() => {
        if (dateFilter === -2) {
          if (!rangeFrom || !rangeTo) return null;
          return { from: rangeFrom, to: rangeTo };
        }
        if (dateFilter === -1) return null;
        const now = new Date();
        const from = dateFilter === 0
          ? startOfMonth(now)
          : startOfMonth(subMonths(now, 2));
        return { from, to: now };
      })();

      let query = supabase
        .from('procurement_order_items')
        .select('id, quantity, unit_type, price_per_unit, total_price, garland_details, flower_type:flower_types(name), procurement_order:procurement_orders!inner(id, order_number, order_date, status, vendor:vendors(business_name))')
        .neq('procurement_orders.status', 'cancelled')
        .order('id', { ascending: true })
        .limit(1000);
      if (range) {
        query = query
          .gte('procurement_orders.order_date', format(range.from, 'yyyy-MM-dd'))
          .lte('procurement_orders.order_date', format(range.to, 'yyyy-MM-dd'));
      }
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as any[];
      setItems(rows);

      // Dates whose daily requirements included customization orders
      const dates = [...new Set(rows.map(r => r.procurement_order?.order_date).filter(Boolean))] as string[];
      const keys = new Set<string>();
      if (dates.length > 0) {
        const { data: reqs } = await supabase
          .from('daily_requirements')
          .select('requirement_date, flower_type_id, custom_orders_count')
          .gt('custom_orders_count', 0)
          .in('requirement_date', dates);
        (reqs ?? []).forEach((r: any) => keys.add(`${r.requirement_date}|${r.flower_type_id}`));
      }
      setCustomKeys(keys);

      if (range) {
        const { data: pays } = await supabase
          .from('payments')
          .select('amount, status')
          .eq('status', 'success')
          .gte('created_at', range.from.toISOString())
          .lte('created_at', range.to.toISOString());
        setRevenue((pays ?? []).reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0) / 100);
      } else {
        setRevenue(0);
      }
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateFilter, rangeFrom, rangeTo]);

  useEffect(() => { load(); }, [load]);
  usePageVisibility(load);

  const clearRange = useCallback(() => {
    setRangeFrom(null);
    setRangeTo(null);
    setOpenPicker(null);
    setDateFilter(0);
  }, []);

  const isCustomItem = (it: FlowerPurchaseItem) => {
    if (it.garland_details && it.garland_details.length > 0) return true;
    const key = `${it.procurement_order?.order_date}|${(it as any).flower_type_id}`;
    return customKeys.has(key);
  };

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const totalPurchase = items.reduce((sum, it) => sum + Number(it.total_price ?? 0), 0);
  const hasPurchases = items.length > 0;
  const margin = revenue - totalPurchase;

  const byDate = new Map<string, FlowerPurchaseItem[]>();
  items.forEach(it => {
    const d = it.procurement_order?.order_date;
    if (!d) return;
    const list = byDate.get(d) ?? [];
    list.push(it);
    byDate.set(d, list);
  });
  const dateGroups = [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  const qtyLabel = (it: FlowerPurchaseItem) => {
    const qty = Number(it.quantity);
    if (it.unit_type === 'kg') return `${qty} kg`;
    if (it.unit_type === 'bunch') return `${qty} bunch`;
    return `${qty} pc`;
  };

  const renderGridCard = (it: FlowerPurchaseItem) => {
    const custom = isCustomItem(it);
    return (
      <View key={it.id} style={[s.gridCard, isWeb && s.gridCardWeb]}>
        <View style={s.gridCardTop}>
          <Text style={s.gridCardName} numberOfLines={1}>{it.flower_type?.name ?? '—'}</Text>
          <Text style={s.gridCardAmt}>{fmt(Number(it.total_price ?? 0))}</Text>
        </View>
        {custom && (
          <View style={[s.customBadge, { alignSelf: 'flex-start', marginTop: Spacing[1] }]}>
            <Sparkles size={10} color={Colors.accentDark} strokeWidth={2} />
            <Text style={s.customBadgeText}>Customization</Text>
          </View>
        )}
        <View style={s.gridCardMeta}>
          <View style={s.gridCardMetaRow}>
            <Text style={s.gridCardMetaLabel}>Quantity</Text>
            <Text style={s.gridCardMetaValue}>{qtyLabel(it)}</Text>
          </View>
          <View style={s.gridCardMetaRow}>
            <Text style={s.gridCardMetaLabel}>Price / Unit</Text>
            <Text style={s.gridCardMetaValue}>{it.price_per_unit != null ? fmt(Number(it.price_per_unit)) : '—'}</Text>
          </View>
        </View>
        <View style={s.gridCardFooter}>
          <Text style={s.gridCardVendor} numberOfLines={1}>{it.procurement_order?.vendor?.business_name ?? '—'}</Text>
          <Text style={s.gridCardOrder} numberOfLines={1}>{it.procurement_order?.order_number ?? '—'}</Text>
        </View>
      </View>
    );
  };

  const renderRow = (it: FlowerPurchaseItem, idx: number) => {
    const custom = isCustomItem(it);
    return isWeb ? (
      <View key={it.id} style={[s.tableRow, idx % 2 === 1 && s.tableRowAlt]}>
        <Text style={[s.tdCell, { width: 110 }, s.tdDate]}>{it.procurement_order?.order_date ? format(new Date(`${it.procurement_order.order_date}T00:00:00`), 'dd MMM yyyy') : '—'}</Text>
        <View style={[s.tdCell, { flex: 2.2 }]}>
          <View style={s.nameRow}>
            <Text style={s.tdPrimary}>{it.flower_type?.name ?? '—'}</Text>
            {custom && (
              <View style={s.customBadge}>
                <Sparkles size={10} color={Colors.accentDark} strokeWidth={2} />
                <Text style={s.customBadgeText}>Customization</Text>
              </View>
            )}
          </View>
          <Text style={s.tdSub}>{it.procurement_order?.order_number ?? '—'}</Text>
        </View>
        <Text style={[s.tdCell, { flex: 1, textAlign: 'right' }, s.tdSec]}>{qtyLabel(it)}</Text>
        <Text style={[s.tdCell, { flex: 1.1, textAlign: 'right' }, s.tdSec]}>{it.price_per_unit != null ? fmt(Number(it.price_per_unit)) : '—'}</Text>
        <Text style={[s.tdCell, { flex: 1.2, textAlign: 'right' }, s.tdBold]}>{fmt(Number(it.total_price ?? 0))}</Text>
        <Text style={[s.tdCell, { flex: 1.4, textAlign: 'right' }, s.tdSec]} numberOfLines={1}>{it.procurement_order?.vendor?.business_name ?? '—'}</Text>
      </View>
    ) : (
      <View key={it.id} style={s.mobileCard}>
        <View style={s.mobileCardInfo}>
          <View style={s.nameRow}>
            <Text style={s.mobileCardName}>{it.flower_type?.name ?? '—'}</Text>
            {custom && (
              <View style={s.customBadge}>
                <Sparkles size={10} color={Colors.accentDark} strokeWidth={2} />
                <Text style={s.customBadgeText}>Customization</Text>
              </View>
            )}
          </View>
          <Text style={s.mobileCardSub}>{it.procurement_order?.order_number ?? '—'} · {it.procurement_order?.vendor?.business_name ?? '—'}</Text>
        </View>
        <View style={s.mobileCardRight}>
          <Text style={s.mobileCardQty}>{qtyLabel(it)}</Text>
          <Text style={s.mobileCardAmt}>{fmt(Number(it.total_price ?? 0))}</Text>
        </View>
      </View>
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
            <Flower2 size={isWeb ? 22 : 18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>Flower Payments</Text>
            <Text style={s.subtitle}>Daily flower purchase details</Text>
          </View>
        </View>
      </View>

      <View style={[s.summaryRow, isWeb && s.summaryRowWeb]}>
        <View style={s.summaryPill}>
          <View style={s.summaryLabelRow}>
            <TrendingDown size={12} color={Colors.error} strokeWidth={2} />
            <Text style={s.summaryPillLabel}>Purchase Cost</Text>
          </View>
          <Text style={[s.summaryPillValue, { color: Colors.error }]}>{fmt(totalPurchase)}</Text>
        </View>
        <View style={s.summaryPill}>
          <View style={s.summaryLabelRow}>
            <TrendingUp size={12} color={Colors.success} strokeWidth={2} />
            <Text style={s.summaryPillLabel}>Revenue</Text>
          </View>
          <Text style={[s.summaryPillValue, { color: Colors.success }]}>{revenue > 0 || dateFilter === -2 || dateFilter === 3 ? fmt(revenue) : fmt(0)}</Text>
        </View>
        <View style={s.summaryPill}>
          <View style={s.summaryLabelRow}>
            <Wallet size={12} color={Colors.textSecondary} strokeWidth={2} />
            <Text style={s.summaryPillLabel}>Margin</Text>
          </View>
          <Text style={[s.summaryPillValue, { color: margin >= 0 ? Colors.success : Colors.error }]}>{hasPurchases ? fmt(margin) : '—'}</Text>
        </View>
        <View style={s.summaryPill}>
          <Text style={s.summaryPillLabel}>Items</Text>
          <Text style={s.summaryPillValue}>{items.length}</Text>
        </View>
      </View>

      <View style={[s.filterRow, isWeb && s.filterRowWeb]}>
        <View style={s.filterInner}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.periodPills}>
            {PERIOD_OPTIONS.map(p => (
              <TouchableOpacity key={p.value} style={[s.periodPill, dateFilter === p.value && s.periodPillActive]} onPress={() => { setDateFilter(p.value); setRangeFrom(null); setRangeTo(null); }}>
                <Text style={[s.periodPillText, dateFilter === p.value && s.periodPillTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={s.periodDivider} />
          <View style={s.rangeField}>
            <DatePickerField
              label="From"
              compact
              value={rangeFrom}
              open={openPicker === 'from'}
              onOpenChange={(o) => setOpenPicker(o ? 'from' : null)}
              maxDate={rangeTo ?? new Date()}
              onChange={(d) => {
                setRangeFrom(d);
                if (rangeTo && d > rangeTo) setRangeTo(null);
                setDateFilter(-2);
              }}
            />
          </View>
          <View style={s.rangeField}>
            <DatePickerField
              label="To"
              compact
              align="right"
              value={rangeTo}
              open={openPicker === 'to'}
              onOpenChange={(o) => setOpenPicker(o ? 'to' : null)}
              minDate={rangeFrom ?? undefined}
              maxDate={new Date()}
              onChange={(d) => {
                setRangeTo(d);
                setDateFilter(-2);
              }}
            />
          </View>
          {dateFilter === -2 && rangeFrom && rangeTo && (
            <TouchableOpacity style={s.rangeClear} onPress={clearRange}>
              <X size={14} color={Colors.textTertiary} strokeWidth={2} />
            </TouchableOpacity>
          )}
          <View style={s.viewToggleWrap}>
            <TouchableOpacity
              style={[s.viewToggleBtn, s.viewToggleLeft, viewMode === 'list' && s.viewToggleBtnActive]}
              onPress={() => setViewMode('list')}
            >
              <List size={14} color={viewMode === 'list' ? Colors.primary : Colors.textTertiary} strokeWidth={2} />
              <Text style={[s.viewToggleText, viewMode === 'list' && s.viewToggleTextActive]}>List</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.viewToggleBtn, s.viewToggleRight, viewMode === 'grid' && s.viewToggleBtnActive]}
              onPress={() => setViewMode('grid')}
            >
              <LayoutGrid size={14} color={viewMode === 'grid' ? Colors.primary : Colors.textTertiary} strokeWidth={2} />
              <Text style={[s.viewToggleText, viewMode === 'grid' && s.viewToggleTextActive]}>Grid</Text>
            </TouchableOpacity>
          </View>
        </View>
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
          {dateGroups.length === 0 ? (
            <View style={s.emptyState}>
              <Flower2 size={36} color={Colors.textDisabled} strokeWidth={1.2} />
              <Text style={s.emptyTitle}>No flower purchases found for this period</Text>
            </View>
          ) : (
            dateGroups.map(([date, group]) => {
              const dayTotal = group.reduce((sum, it) => sum + Number(it.total_price ?? 0), 0);
              const expanded = viewMode === 'grid' || expandedDates.has(date);
              return (
                <View key={date} style={s.dateGroup}>
                  {viewMode === 'list' ? (
                    <TouchableOpacity
                      style={s.dateHeadBtn}
                      onPress={() => toggleDate(date)}
                      activeOpacity={0.7}
                    >
                      <View style={s.dateHeadLeft}>
                        <Text style={s.dateHeadText}>
                          {format(new Date(`${date}T00:00:00`), isWeb ? 'dd MMM yyyy' : 'EEEE, dd MMM yyyy')}
                        </Text>
                        <Text style={s.dateHeadCount}>{group.length} {group.length === 1 ? 'item' : 'items'}</Text>
                      </View>
                      <View style={s.dateHeadRight}>
                        <Text style={s.dateHeadTotal}>{fmt(dayTotal)}</Text>
                        {expanded
                          ? <ChevronDown size={16} color={Colors.textSecondary} strokeWidth={2} />
                          : <ChevronRight size={16} color={Colors.textSecondary} strokeWidth={2} />}
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View style={s.dateHead}>
                      <Text style={s.dateHeadText}>{format(new Date(`${date}T00:00:00`), 'EEEE, dd MMM yyyy')}</Text>
                      <Text style={s.dateHeadTotal}>{fmt(dayTotal)}</Text>
                    </View>
                  )}
                  {expanded && (
                    viewMode === 'grid' ? (
                      <View style={s.gridWrap}>{group.map(renderGridCard)}</View>
                    ) : isWeb ? (
                      <View style={s.table}>
                        <View style={s.tableHead}>
                          <Text style={[s.thCell, { flex: 2.2 }]}>Flower</Text>
                          <Text style={[s.thCell, { flex: 1, textAlign: 'right' }]}>Quantity</Text>
                          <Text style={[s.thCell, { flex: 1.1, textAlign: 'right' }]}>Price / Unit</Text>
                          <Text style={[s.thCell, { flex: 1.2, textAlign: 'right' }]}>Total Amount</Text>
                          <Text style={[s.thCell, { flex: 1.4, textAlign: 'right' }]}>Vendor</Text>
                        </View>
                        {group.map((it, idx) => renderRow(it, idx))}
                      </View>
                    ) : (
                      <View>{group.map((it, idx) => renderRow(it, idx))}</View>
                    )
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
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
  summaryRow: { flexDirection: 'row', gap: Spacing[3], paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  summaryRowWeb: { paddingHorizontal: Spacing[8] },
  summaryPill: { flex: 1, backgroundColor: Colors.neutral[50], borderRadius: Radius.md, padding: Spacing[3], alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  summaryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  summaryPillLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  summaryPillValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, marginTop: 2 },
  filterRow: { paddingHorizontal: Spacing[5], paddingVertical: Spacing[2], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterRowWeb: { paddingHorizontal: Spacing[8] },
  filterInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  periodPills: { flexDirection: 'row', gap: Spacing[2], alignItems: 'center' },
  periodDivider: { width: 1, height: 24, backgroundColor: Colors.border },
  rangeField: { width: 152 },
  rangeClear: { padding: Spacing[2] },
  periodPill: { paddingVertical: Spacing[1], paddingHorizontal: Spacing[3], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  periodPillActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  periodPillText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  periodPillTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  viewToggleWrap: { flexDirection: 'row', marginLeft: 'auto', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.neutral[50] },
  viewToggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: Spacing[1] + 2, paddingHorizontal: Spacing[3] },
  viewToggleLeft: { borderRightWidth: 1, borderRightColor: Colors.border },
  viewToggleRight: {},
  viewToggleBtnActive: { backgroundColor: Colors.primarySurface },
  viewToggleText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textTertiary },
  viewToggleTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[3] },
  gridCard: { flexGrow: 1, flexBasis: '46%', backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing[3], ...Shadow.sm },
  gridCardWeb: { flexBasis: '30%', minWidth: 220 },
  gridCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing[2] },
  gridCardName: { flex: 1, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  gridCardAmt: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.error },
  gridCardMeta: { marginTop: Spacing[3], gap: Spacing[1] },
  gridCardMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gridCardMetaLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  gridCardMetaValue: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textSecondary },
  gridCardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing[3], paddingTop: Spacing[2], borderTopWidth: 1, borderTopColor: Colors.divider, gap: Spacing[2] },
  gridCardVendor: { flex: 1, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textSecondary, textAlign: 'left' },
  gridCardOrder: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, textAlign: 'right' },
  scroll: { flex: 1 },
  content: { padding: Spacing[4] },
  contentWeb: { padding: Spacing[8], maxWidth: 1100, alignSelf: 'center', width: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  dateGroup: { marginBottom: Spacing[6] },
  dateHeadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4],
    ...Shadow.sm,
  },
  dateHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flex: 1 },
  dateHeadRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  dateHeadCount: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  dateHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing[2], paddingHorizontal: Spacing[1] },
  dateHeadText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  dateHeadTotal: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.error },
  table: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  tableHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], backgroundColor: Colors.neutral[50], borderBottomWidth: 1, borderBottomColor: Colors.border },
  thCell: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, paddingRight: Spacing[2] },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  tdCell: { paddingRight: Spacing[2] },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  customBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 2, paddingHorizontal: Spacing[2], borderRadius: Radius.full, backgroundColor: Colors.accentSurface },
  customBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.accentDark },
  tdPrimary: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  tdSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },
  tdSec: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tdDate: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  tdBold: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  mobileCard: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], marginBottom: Spacing[3], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  mobileCardInfo: { flex: 1 },
  mobileCardName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  mobileCardSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },
  mobileCardRight: { alignItems: 'flex-end', gap: Spacing[1] },
  mobileCardQty: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  mobileCardAmt: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary },
});
