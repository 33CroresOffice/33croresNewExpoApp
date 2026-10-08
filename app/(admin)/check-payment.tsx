import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import ModuleGuard from '@/components/admin/ModuleGuard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CircleCheck as CheckCircle, Circle as XCircle, ArrowLeft, ClipboardList, Search, X, RefreshCw,
} from 'lucide-react-native';
import { router } from 'expo-router';
import { format, startOfDay, startOfMonth, subMonths } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import DatePickerField from '@/components/ui/DatePickerField';

type SourceTab = 'subscription' | 'customization';
type Badge = 'renewed' | 'expired';

interface Row {
  id: string;
  customer: string;
  mobile: string | null;
  detail: string;
  groupDate: string;
  badge: Badge | null;
  paid: boolean;
  paidAt: string | null;
  renewal: { from: string; to: string; source: 'App' | 'Admin'; days: number } | null;
}

const PERIOD_OPTIONS = [
  { label: 'This Month', value: 0 },
  { label: '3 Months', value: 3 },
];

export default function CheckPaymentScreen() {
  return (
    <ModuleGuard module="orders">
      <CheckPaymentContent />
    </ModuleGuard>
  );
}

function CheckPaymentContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [tab, setTab] = useState<SourceTab>('subscription');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState(0);
  const [rangeFrom, setRangeFrom] = useState<Date | null>(null);
  const [rangeTo, setRangeTo] = useState<Date | null>(null);
  const [openPicker, setOpenPicker] = useState<'from' | 'to' | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const range = (() => {
        if (dateFilter === -2) {
          if (!rangeFrom || !rangeTo) return null;
          return {
            from: format(startOfDay(rangeFrom), 'yyyy-MM-dd'),
            to: format(rangeTo, 'yyyy-MM-dd'),
          };
        }
        if (dateFilter === -1) return null;
        const now = new Date();
        const from = dateFilter === 0 ? startOfMonth(now) : startOfMonth(subMonths(now, 2));
        return { from: format(from, 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
      })();

      if (tab === 'subscription') {
        // All expired / renewed periods. Each period is its own row, grouped by
        // its own effective end date (new_end_date when pause-adjusted).
        const { data, error: qErr } = await supabase
          .from('subscriptions')
          .select('id, user_id, start_date, end_date, new_end_date, status, created_at, plan:subscription_plans(name), user:profiles(full_name, mobile), payments(status, created_at)')
          .not('end_date', 'is', null)
          .in('status', ['expired', 'renewed', 'cancelled', 'active', 'pending'])
          .order('end_date', { ascending: false })
          .limit(2000);
        if (qErr) throw qErr;
        const periodSubs = ((data ?? []) as any[]);

        // Every subscription (incl. active renewals) for these customers, so each
        // renewed period can be shown under its own end date with its own payment
        const userIds = [...new Set(periodSubs.map((s) => s.user_id).filter(Boolean))] as string[];
        const byUser = new Map<string, any[]>();
        if (userIds.length > 0) {
          const { data: allSubs, error: qErr2 } = await supabase
            .from('subscriptions')
            .select('id, user_id, start_date, end_date, new_end_date, status, created_at, renewed_from_subscription_id, plan:subscription_plans(name), user:profiles(full_name, mobile), payments(status, created_at)')
            .in('user_id', userIds)
            .not('end_date', 'is', null)
            .limit(3000);
          if (qErr2) throw qErr2;
          ((allSubs ?? []) as any[]).forEach((s) => {
            if (!s.user_id) return;
            const list = byUser.get(s.user_id) ?? [];
            list.push(s);
            byUser.set(s.user_id, list);
          });
        }

        const successPayments = (o: any) => ((o.payments ?? []) as any[])
          .filter((p) => p.status === 'success')
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        const paid = (o: any) => successPayments(o).length > 0;
        const effectiveExpiry = (o: any) => String(o.new_end_date ?? o.end_date ?? '').slice(0, 10);
        const continuesPeriod = (o: any, expiryStr: string) => {
          const start = String(o.start_date ?? '').slice(0, 10);
          if (!start || !expiryStr) return false;
          const gapDays = (new Date(`${start}T00:00:00`).getTime()
            - new Date(`${expiryStr}T00:00:00`).getTime()) / 86400000;
          return gapDays > -90 && gapDays <= 90;
        };
        const planName = (o: any) => {
          const plan = Array.isArray(o.plan) ? o.plan[0] : o.plan;
          return plan?.name ?? 'Subscription';
        };
        const toRow = (o: any, badge: Badge, renewal: Row['renewal'] = null): Row => {
          const pays = successPayments(o);
          return {
            id: o.id,
            customer: o.user?.full_name ?? 'Unknown customer',
            mobile: o.user?.mobile ?? null,
            detail: planName(o),
            groupDate: effectiveExpiry(o),
            badge,
            paid: pays.length > 0,
            paidAt: pays[0]?.created_at ?? null,
            renewal,
          };
        };

        const seen = new Set<string>();
        const mapped: Row[] = [];
        for (const s of periodSubs) {
          const userSubs = (byUser.get(s.user_id) ?? []) as any[];
          const expiryStr = effectiveExpiry(s);
          // Renewal = a later paid subscription for the same customer that
          // continues this period (linked explicitly or by start date)
          const isRenewalOf = (cur: any) => (o: any) => {
            if (o.id === cur.id || !paid(o)) return false;
            // Explicit back-link from a Customer App renewal always wins
            if (o.renewed_from_subscription_id === cur.id) return true;
            // Otherwise the renewal must come after this period. Records
            // backfilled in one batch share a timestamp, so fall back to
            // comparing start dates in that case
            const oc = String(o.created_at ?? '');
            const cc = String(cur.created_at ?? '');
            const after = oc && cc
              ? oc > cc || (oc === cc && String(o.start_date) > String(cur.start_date))
              : String(o.start_date) > String(cur.start_date);
            return after && continuesPeriod(o, effectiveExpiry(cur));
          };
          // Follow the full renewal chain so the latest period, its future
          // expiry and its payment are shown, never an older renewal
          const chain: any[] = [s];
          const visited = new Set<string>([s.id]);
          for (;;) {
            const next = userSubs.filter(isRenewalOf(chain[chain.length - 1]))
              .sort((a, b) => String(b.created_at ?? b.start_date).localeCompare(String(a.created_at ?? a.start_date)))[0] ?? null;
            if (!next || visited.has(next.id)) break;
            visited.add(next.id);
            chain.push(next);
          }
          const latest = chain.length > 1 ? chain[chain.length - 1] : null;
          const renewalInfo: Row['renewal'] = latest
            ? {
                from: expiryStr,
                to: effectiveExpiry(latest),
                // Customer-app renewals carry an explicit back-link; admin-created ones do not
                source: latest.renewed_from_subscription_id ? 'App' : 'Admin',
                days: Math.round((new Date(`${String(chain[1].start_date).slice(0, 10)}T00:00:00`).getTime()
                  - new Date(`${expiryStr}T00:00:00`).getTime()) / 86400000),
              }
            : null;
          // Newest successful payment across the renewals in the chain
          const renewalPayments = chain.slice(1).flatMap((o) => successPayments(o));
          const latestRenewalPayAt = renewalPayments.length > 0
            ? renewalPayments.map((p) => String(p.created_at)).sort().reverse()[0]
            : null;
          if (!seen.has(s.id)) {
            seen.add(s.id);
            const row = toRow(s, latest ? 'renewed' : 'expired', renewalInfo);
            if (latest) {
              row.paid = true;
              // Latest renewal payment; fall back to the renewal's creation
              // time when an admin-created renewal has no payment timestamp
              row.paidAt = latestRenewalPayAt
                ?? (latest.created_at ? String(latest.created_at) : null)
                ?? row.paidAt;
            }
            mapped.push(row);
          }
          // The renewal period itself (still active), under its own end date
          userSubs
            .filter((o) => o.status !== 'cancelled' && chain.includes(o) && !seen.has(o.id))
            .forEach((r) => {
              seen.add(r.id);
              const row = toRow(r, 'renewed');
              if (!row.paid && r.status !== 'pending') {
                row.paid = true;
                row.paidAt = r.created_at ? String(r.created_at) : null;
              }
              mapped.push(row);
            });
        }

        // Date filtering happens here so no record is dropped by the query itself
        const inRange = (d: string) => !range || (d >= range.from && d <= range.to);
        setRows(mapped.filter((r) => r.groupDate && inRange(r.groupDate)));
      } else {
        let query = supabase
          .from('custom_orders')
          .select('id, created_at, updated_at, delivery_date, order_type, payment_status, user:profiles(full_name, mobile)')
          .in('payment_status', ['paid', 'pending'])
          .not('delivery_date', 'is', null)
          .order('delivery_date', { ascending: false })
          .limit(1000);
        if (range) query = query.gte('delivery_date', range.from).lte('delivery_date', range.to);
        const { data, error: qErr } = await query;
        if (qErr) throw qErr;
        setRows(((data ?? []) as any[]).map((o) => ({
          id: o.id,
          customer: o.user?.full_name ?? 'Unknown customer',
          mobile: o.user?.mobile ?? null,
          detail: o.order_type ? `${o.order_type} order` : 'Custom order',
          groupDate: String(o.delivery_date).slice(0, 10),
          badge: null,
          paid: o.payment_status === 'paid',
          paidAt: o.payment_status === 'paid' ? (o.updated_at ?? null) : null,
        } as Row)));
      }
    } catch (e) {
      console.error('load error', e);
      setRows([]);
      setError('Unable to load payment records. Please refresh and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab, dateFilter, rangeFrom, rangeTo]);

  useEffect(() => { load(); }, [load]);
  usePageVisibility(load);

  const clearRange = useCallback(() => {
    setRangeFrom(null);
    setRangeTo(null);
    setOpenPicker(null);
    setDateFilter(0);
  }, []);

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.customer.toLowerCase().includes(q) || (r.mobile ?? '').includes(q) || r.detail.toLowerCase().includes(q);
  });

  const byDate = new Map<string, Row[]>();
  filtered.forEach((r) => {
    const list = byDate.get(r.groupDate) ?? [];
    list.push(r);
    byDate.set(r.groupDate, list);
  });
  const dateGroups = [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  dateGroups.forEach(([, group]) => group.sort((a, b) => a.customer.localeCompare(b.customer)));

  const paidCount = filtered.filter((r) => r.paid).length;
  const notPaidCount = filtered.length - paidCount;
  const fmtDate = (value: string | null) => {
    if (!value) return '—';
    try { return format(new Date(`${value}T00:00:00`), 'dd MMM yyyy'); } catch { return value; }
  };
  const fmtDateTime = (value: string | null) => {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
        timeZone: 'Asia/Kolkata',
      }).format(new Date(value));
    } catch { return value; }
  };
  const dayLabel = (value: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const tomorrow = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd');
    if (value === today) return 'Today';
    if (value === tomorrow) return 'Tomorrow';
    return null;
  };
  const renderBadge = (badge: Badge | null) => {
    if (!badge) return null;
    if (badge === 'renewed') {
      return (
        <View style={[s.badgeChip, { backgroundColor: '#E8F5E9' }]}>
          <RefreshCw size={11} color={Colors.success} strokeWidth={2.2} />
          <Text style={[s.badgeText, { color: Colors.success }]}>Renewed</Text>
        </View>
      );
    }
    if (badge === 'expired') {
      return (
        <View style={[s.badgeChip, { backgroundColor: '#FFEBEE' }]}>
          <XCircle size={11} color={Colors.error} strokeWidth={2.2} />
          <Text style={[s.badgeText, { color: Colors.error }]}>Expired</Text>
        </View>
      );
    }
    return null;
  };
  const renderPaid = (paid: boolean) => (
    <View style={[s.badgeChip, { backgroundColor: paid ? '#E8F5E9' : '#FFF3E0' }]}>
      {paid
        ? <CheckCircle size={11} color={Colors.success} strokeWidth={2.2} />
        : <XCircle size={11} color={Colors.warning} strokeWidth={2.2} />}
      <Text style={[s.badgeText, { color: paid ? Colors.success : Colors.warning }]}>{paid ? 'Paid' : 'Not Paid'}</Text>
    </View>
  );
  const renewalTimingText = (info: NonNullable<Row['renewal']>) => {
    if (info.days === 0) return `${info.source} · renewed on expiry day`;
    const n = Math.abs(info.days);
    return info.days > 0
      ? `${info.source} · renewed ${n} day${n === 1 ? '' : 's'} after expiry`
      : `${info.source} · renewed ${n} day${n === 1 ? '' : 's'} before expiry`;
  };

  const renderRow = (r: Row, idx: number) => (
    isWeb ? (
      <View key={r.id} style={[s.tableRow, idx % 2 === 1 && s.tableRowAlt]}>
        <View style={[s.tdCell, { flex: 1.4 }]}>
          <Text style={s.tdPrimary}>{r.customer}</Text>
          <Text style={s.tdSub}>{r.mobile ?? '—'}</Text>
        </View>
        <Text style={[s.tdCell, { flex: 1.2 }, s.tdSec]}>{r.detail}</Text>
        <View style={[s.tdCell, { width: 200, alignItems: 'flex-start' }]}>
          {renderBadge(r.badge)}
          {r.renewal && (
            <>
              <Text style={[s.tdSub, { marginTop: 3, color: Colors.textSecondary, fontFamily: Typography.fontFamily.sansMedium }]}>
                New expiry: {fmtDate(r.renewal.to)}
              </Text>
              <Text style={[s.tdSub, { color: Colors.textSecondary }]}>{renewalTimingText(r.renewal)}</Text>
            </>
          )}
        </View>
        <View style={[s.tdCell, { width: 230 }]}>
          {renderPaid(r.paid)}
          <Text style={[s.tdSub, { marginTop: 3 }, !r.paid && { color: Colors.textDisabled }]}>
            {r.paid ? fmtDateTime(r.paidAt) : 'No payment yet'}
          </Text>
        </View>
      </View>
    ) : (
      <View key={r.id} style={s.mobileCard}>
        <View style={s.mobileCardTop}>
          <View style={s.mobileCardInfo}>
            <Text style={s.mobileCardName}>{r.customer}</Text>
            <Text style={s.mobileCardSub}>{r.detail}</Text>
          </View>
          <View style={s.badgeStack}>
            {renderBadge(r.badge)}
            {renderPaid(r.paid)}
          </View>
        </View>
        <View style={s.mobileCardMeta}>
          <View style={s.mobileCardMetaItem}>
            <Text style={s.metaLabel}>{tab === 'subscription' ? 'Expiry / Renewal' : 'Delivery date'}</Text>
            <Text style={s.metaValue}>{fmtDate(r.groupDate)}</Text>
          </View>
          <View style={s.mobileCardMetaItem}>
            <Text style={s.metaLabel}>{r.paid ? 'Paid on' : 'Status'}</Text>
            <Text style={[s.metaValue, { color: r.paid ? Colors.success : Colors.warning }]}>
              {r.paid ? fmtDateTime(r.paidAt) : 'Not paid yet'}
            </Text>
          </View>
        </View>
        {r.renewal && (
          <View style={s.mobileCardMeta}>
            <View style={s.mobileCardMetaItem}>
              <Text style={s.metaLabel}>Renewal</Text>
              <Text style={s.metaValue}>New expiry: {fmtDate(r.renewal.to)}</Text>
              <Text style={[s.metaLabel, { textTransform: 'none', letterSpacing: 0, marginTop: 2, color: Colors.textSecondary }]}>
                {renewalTimingText(r.renewal)}
              </Text>
            </View>
          </View>
        )}
      </View>
    )
  );

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
            <Text style={[s.title, isWeb && s.titleWeb]}>Check Payment</Text>
            <Text style={s.subtitle}>{tab === 'subscription' ? 'Customers grouped by expiry / renewal day' : 'Custom orders grouped by delivery day'}</Text>
          </View>
        </View>
      </View>

      <View style={[s.tabRow, isWeb && s.filterRowWeb]}>
        <View style={s.tabs}>
          {([
            { key: 'subscription', label: 'Subscription' },
            { key: 'customization', label: 'Customization' },
          ] as { key: SourceTab; label: string }[]).map((t) => {
            const active = tab === t.key;
            return (
              <TouchableOpacity key={t.key} style={[s.tabBtn, active && s.tabBtnActive]} onPress={() => setTab(t.key)}>
                <Text style={[s.tabText, active && s.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={[s.filterRow, isWeb && s.filterRowWeb]}>
        <View style={s.filterInner}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.periodPills}>
            {PERIOD_OPTIONS.map((p) => (
              <TouchableOpacity
                key={p.value}
                style={[s.periodPill, dateFilter === p.value && s.periodPillActive]}
                onPress={() => { setDateFilter(p.value); setRangeFrom(null); setRangeTo(null); }}
              >
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
              maxDate={new Date(Date.now() + 90 * 86400000)}
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
        </View>
      </View>

      <View style={[s.searchRow, isWeb && s.searchRowWeb]}>
        <View style={s.searchWrap}>
          <Search size={14} color={Colors.textTertiary} strokeWidth={1.8} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by customer name, mobile or plan..."
            placeholderTextColor={Colors.textDisabled}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={13} color={Colors.textTertiary} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
        <View style={s.countRow}>
          <Text style={s.countPaid}>{paidCount} paid</Text>
          <Text style={s.countDot}>·</Text>
          <Text style={s.countUnpaid}>{notPaidCount} not paid</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={Colors.primary} /></View>
      ) : error ? (
        <View style={s.center}><Text style={s.errorText}>{error}</Text></View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.content, isWeb && s.contentWeb]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          {dateGroups.length === 0 ? (
            <View style={s.emptyState}>
              <ClipboardList size={36} color={Colors.textDisabled} strokeWidth={1.2} />
              <Text style={s.emptyTitle}>No records found for this period</Text>
            </View>
          ) : (
            dateGroups.map(([date, group]) => {
              const rel = dayLabel(date);
              return (
                <View key={date} style={s.dateGroup}>
                  <View style={s.dateHead}>
                    <View style={s.dateHeadLeft}>
                      <Text style={s.dateHeadText}>{format(new Date(`${date}T00:00:00`), 'EEEE, dd MMM yyyy')}</Text>
                      {rel && <Text style={s.dateRelBadge}>{rel}</Text>}
                    </View>
                    <Text style={s.dateHeadCount}>{group.length} {group.length === 1 ? 'customer' : 'customers'}</Text>
                  </View>
                  {isWeb ? (
                    <View style={s.table}>
                      <View style={s.tableHead}>
                        <Text style={[s.thCell, { flex: 1.4 }]}>Customer</Text>
                        <Text style={[s.thCell, { flex: 1.2 }]}>Plan / Order</Text>
                        <Text style={[s.thCell, { width: 200 }]}>Status / Renewal</Text>
                        <Text style={[s.thCell, { width: 230 }]}>Payment</Text>
                      </View>
                      {group.map((r, idx) => renderRow(r, idx))}
                    </View>
                  ) : (
                    <View>{group.map((r, idx) => renderRow(r, idx))}</View>
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
  tabRow: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: Spacing[2], paddingHorizontal: Spacing[5] },
  tabs: { flexDirection: 'row', gap: Spacing[2], alignSelf: 'flex-start' },
  tabBtn: { height: 32, justifyContent: 'center', alignItems: 'center', paddingVertical: 0, paddingHorizontal: Spacing[4], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  tabBtnActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  tabText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
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
  searchRow: { paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchRowWeb: { paddingHorizontal: Spacing[8] },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.neutral[50], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing[3] },
  searchInput: { flex: 1, paddingVertical: Spacing[2], color: Colors.textPrimary, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm },
  countRow: { flexDirection: 'row', gap: Spacing[2], marginTop: Spacing[2] },
  countPaid: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.success },
  countDot: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  countUnpaid: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.warning },
  scroll: { flex: 1 },
  content: { padding: Spacing[4] },
  contentWeb: { padding: Spacing[8], maxWidth: 1100, alignSelf: 'center', width: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error, textAlign: 'center', paddingHorizontal: Spacing[5] },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  dateGroup: { marginBottom: Spacing[6] },
  dateHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing[2], paddingHorizontal: Spacing[1] },
  dateHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  dateHeadText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  dateRelBadge: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.primary, backgroundColor: Colors.primarySurface, paddingHorizontal: Spacing[2], paddingVertical: 2, borderRadius: Radius.full, overflow: 'hidden' },
  dateHeadCount: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  table: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  tableHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], backgroundColor: Colors.neutral[50], borderBottomWidth: 1, borderBottomColor: Colors.border },
  thCell: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, paddingRight: Spacing[2] },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  tdCell: { paddingRight: Spacing[2] },
  tdPrimary: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  tdSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },
  tdSec: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  badgeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: Spacing[2], borderRadius: Radius.full, alignSelf: 'flex-start' },
  badgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10 },
  badgeStack: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  mobileCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], marginBottom: Spacing[3], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  mobileCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing[2] },
  mobileCardInfo: { flex: 1 },
  mobileCardName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  mobileCardSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  mobileCardMeta: { flexDirection: 'row', marginTop: Spacing[3], paddingTop: Spacing[3], borderTopWidth: 1, borderTopColor: Colors.divider, gap: Spacing[5] },
  mobileCardMetaItem: { flex: 1 },
  metaLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.4 },
  metaValue: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary, marginTop: 2 },
});
