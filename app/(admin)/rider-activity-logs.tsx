import React, { useEffect, useState, useCallback } from 'react';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Platform,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Search,
  RefreshCw,
  MapPin,
  Smartphone,
  CalendarDays,
  Truck,
  ExternalLink,
  Clock,
  Navigation,
} from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import DatePickerField from '@/components/ui/DatePickerField';
import Modal from '@/components/ui/Modal';
import { format, parseISO, subDays } from 'date-fns';

const IST_TIME_ZONE = 'Asia/Kolkata';

type TabKey = 'app_open' | 'present' | 'delivery';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'app_open', label: 'App Open' },
  { key: 'present', label: 'Present' },
  { key: 'delivery', label: 'Delivery' },
];

const PAGE_SIZE = 50;

interface RiderOption {
  id: string;
  name: string;
}

interface AppOpenRow {
  id: string;
  rider_name: string;
  opened_at: string;
  latitude: number | null;
  longitude: number | null;
  location_source: string;
}

interface PresentRow {
  id: string;
  rider_name: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  check_in_latitude: number | null;
  check_in_longitude: number | null;
  location_name: string | null;
}

interface DeliveryRow {
  id: string;
  rider_name: string;
  order_ref: string | null;
  customer_name: string | null;
  customer_mobile: string | null;
  delivered_at: string;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
}

function toNum(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

function istDateStr(value: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function timeLabel(ts: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(ts));
}

function dateTimeLabel(ts: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(ts));
}

function dateLabel(dateStr: string): string {
  return format(parseISO(dateStr), 'EEEE, d MMMM yyyy');
}

function istDayStart(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+05:30`).toISOString();
}

function istDayEnd(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59.999+05:30`).toISOString();
}

function mapUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export default function RiderActivityLogs() {
  return (
    <ModuleGuard module="riders">
      <RiderActivityLogsContent />
    </ModuleGuard>
  );
}

function RiderActivityLogsContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';

  const [tab, setTab] = useState<TabKey>('app_open');
  const [search, setSearch] = useState('');
  const [riderId, setRiderId] = useState<string>('all');
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 6), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [openPicker, setOpenPicker] = useState<null | 'from' | 'to'>(null);

  const [riders, setRiders] = useState<RiderOption[]>([]);
  const [appOpens, setAppOpens] = useState<AppOpenRow[]>([]);
  const [present, setPresent] = useState<PresentRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  // Load rider list once for the filter dropdown
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('riders')
        .select('id, profile:profiles(full_name), name')
        .order('created_at', { ascending: true });
      if (data) {
        setRiders(
          (data as any[]).map((r) => ({
            id: r.id,
            name: r.profile?.full_name ?? r.name ?? 'Rider',
          })),
        );
      }
    })();
  }, []);

  const load = useCallback(
    async (pageNum = 0, append = false) => {
      if (pageNum === 0) setLoading(true);
      else setLoadingMore(true);

      const fromTs = istDayStart(fromDate);
      const toTs = istDayEnd(toDate);
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      try {
        if (tab === 'app_open') {
          let q = supabase
            .from('rider_app_opens')
            .select('id, opened_at, latitude, longitude, location_source, rider:riders(id, profile:profiles(full_name))', { count: 'exact' })
            .gte('opened_at', fromTs)
            .lte('opened_at', toTs)
            .order('opened_at', { ascending: false });
          if (riderId !== 'all') q = q.eq('rider_id', riderId);
          const { data, count } = await q.range(from, to);
          const rows: AppOpenRow[] = ((data ?? []) as any[]).map((r) => ({
            id: r.id,
            rider_name: r.rider?.profile?.full_name ?? 'Rider',
            opened_at: r.opened_at,
            latitude: toNum(r.latitude),
            longitude: toNum(r.longitude),
            location_source: r.location_source ?? 'unavailable',
          }));
          setAppOpens(append ? (prev) => [...prev, ...rows] : rows);
          setHasMore(from + PAGE_SIZE < (count ?? 0));
        } else if (tab === 'present') {
          let q = supabase
            .from('rider_attendance')
            .select('id, date, status, check_in_time, check_out_time, check_in_latitude, check_in_longitude, rider:riders(id, profile:profiles(full_name)), location:check_in_location_id(name)', { count: 'exact' })
            .eq('status', 'present')
            .gte('date', fromDate)
            .lte('date', toDate)
            .order('date', { ascending: false })
            .order('check_in_time', { ascending: false });
          if (riderId !== 'all') q = q.eq('rider_id', riderId);
          const { data, count } = await q.range(from, to);
          const rows: PresentRow[] = ((data ?? []) as any[]).map((r) => ({
            id: r.id,
            rider_name: r.rider?.profile?.full_name ?? 'Rider',
            date: r.date,
            check_in_time: r.check_in_time,
            check_out_time: r.check_out_time,
            check_in_latitude: toNum(r.check_in_latitude),
            check_in_longitude: toNum(r.check_in_longitude),
            location_name: r.location?.name ?? null,
          }));
          setPresent(append ? (prev) => [...prev, ...rows] : rows);
          setHasMore(from + PAGE_SIZE < (count ?? 0));
        } else {
          let q = supabase
            .from('rider_order_assignments')
            .select('id, order_id, custom_order_id, delivered_at, delivery_latitude, delivery_longitude, rider:riders!rider_id(id, profile:profiles(full_name)), order:orders(id, user:profiles(full_name, mobile)), custom_order:custom_orders(id, user:profiles(full_name, mobile))', { count: 'exact' })
            .eq('status', 'delivered')
            .not('delivered_at', 'is', null)
            .gte('delivered_at', fromTs)
            .lte('delivered_at', toTs)
            .order('delivered_at', { ascending: false });
          if (riderId !== 'all') q = q.eq('rider_id', riderId);
          const { data, count, error } = await q.range(from, to);
          if (error) console.error('delivery logs query error', error.message);
          const rows: DeliveryRow[] = ((data ?? []) as any[]).map((r) => ({
            id: r.id,
            rider_name: r.rider?.profile?.full_name ?? 'Rider',
            order_ref: r.custom_order_id
              ? `CO-${r.custom_order_id.slice(0, 8).toUpperCase()}`
              : r.order_id
                ? `ORD-${r.order_id.slice(0, 8).toUpperCase()}`
                : null,
            customer_name: r.order?.user?.full_name ?? r.custom_order?.user?.full_name ?? null,
            customer_mobile: r.order?.user?.mobile ?? r.custom_order?.user?.mobile ?? null,
            delivered_at: r.delivered_at!,
            delivery_latitude: toNum(r.delivery_latitude),
            delivery_longitude: toNum(r.delivery_longitude),
          }));
          setDeliveries(append ? (prev) => [...prev, ...rows] : rows);
          setHasMore(from + PAGE_SIZE < (count ?? 0));
        }
      } catch (e) {
        console.error('rider activity logs load error', e);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [tab, riderId, fromDate, toDate],
  );

  useEffect(() => {
    setPage(0);
    load(0, false);
  }, [load]);

  const riderOptions = riders.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()),
  );

  const openMap = (lat: number | null, lng: number | null) => {
    if (lat == null || lng == null) return;
    const url = mapUrl(lat, lng);
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  };

  const renderMapLink = (lat: number | null, lng: number | null) => {
    if (lat == null || lng == null) {
      return (
        <View style={styles.noLocationRow}>
          <MapPin size={11} color={Colors.textDisabled} strokeWidth={1.8} />
          <Text style={styles.noLocationText}>No GPS recorded</Text>
        </View>
      );
    }
    return (
      <TouchableOpacity style={styles.mapLink} onPress={() => openMap(lat, lng)}>
        <MapPin size={11} color={Colors.primary} strokeWidth={2} />
        <Text style={styles.mapLinkText}>View on map</Text>
        <ExternalLink size={10} color={Colors.primary} strokeWidth={2} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, !isWeb && { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Rider Activity Logs</Text>
          <Text style={styles.subtitle}>App open, present and delivery history with location</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => load(0, false)}>
          <RefreshCw size={16} color={Colors.textSecondary} strokeWidth={1.8} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabsRow}>
        {TABS.map((t) => {
          const active = tab === t.key;
          const Icon = t.key === 'app_open' ? Smartphone : t.key === 'present' ? CalendarDays : Truck;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setTab(t.key)}
            >
              <Icon size={14} color={active ? Colors.primary : Colors.textSecondary} strokeWidth={active ? 2.2 : 1.8} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Search size={15} color={Colors.textTertiary} strokeWidth={1.8} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search rider..."
            placeholderTextColor={Colors.textDisabled}
          />
        </View>
        <TouchableOpacity
          style={styles.dateBtn}
          onPress={() => setOpenPicker('from')}
          activeOpacity={0.7}
        >
          <CalendarDays size={15} color={Colors.primary} strokeWidth={1.8} />
          <View style={styles.dateBtnTextWrap}>
            <Text style={styles.dateBtnLabel}>From</Text>
            <Text style={styles.dateBtnValue}>{format(parseISO(fromDate), 'dd MMM yyyy')}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.dateBtn}
          onPress={() => setOpenPicker('to')}
          activeOpacity={0.7}
        >
          <CalendarDays size={15} color={Colors.primary} strokeWidth={1.8} />
          <View style={styles.dateBtnTextWrap}>
            <Text style={styles.dateBtnLabel}>To</Text>
            <Text style={styles.dateBtnValue}>{format(parseISO(toDate), 'dd MMM yyyy')}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {riderOptions.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.riderChips} contentContainerStyle={{ paddingHorizontal: Spacing[6], gap: 6 }}>
          <TouchableOpacity
            style={[styles.chip, riderId === 'all' && styles.chipActive]}
            onPress={() => setRiderId('all')}
          >
            <Text style={[styles.chipText, riderId === 'all' && styles.chipTextActive]}>All riders</Text>
          </TouchableOpacity>
          {riderOptions.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={[styles.chip, riderId === r.id && styles.chipActive]}
              onPress={() => setRiderId(r.id)}
            >
              <Text style={[styles.chipText, riderId === r.id && styles.chipTextActive]}>{r.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading logs...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.listWrap}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            if (
              contentOffset.y + layoutMeasurement.height >= contentSize.height - 200 &&
              !loadingMore &&
              hasMore
            ) {
              const nextPage = page + 1;
              setPage(nextPage);
              load(nextPage, true);
            }
          }}
          scrollEventThrottle={400}
        >
          {tab === 'app_open' &&
            (appOpens.length === 0 ? (
              <EmptyBlock icon={Smartphone} text="No app opens recorded in this date range yet" />
            ) : (
              appOpens.map((r) => (
                <View key={r.id} style={styles.card}>
                  <View style={[styles.cardIconWrap, { backgroundColor: '#E3F2FD' }]}>
                    <Smartphone size={16} color="#1565C0" strokeWidth={1.8} />
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle}>{r.rider_name}</Text>
                    <View style={styles.cardMetaRow}>
                      <Clock size={11} color={Colors.textTertiary} strokeWidth={1.8} />
                      <Text style={styles.cardMetaText}>
                        Opened at {timeLabel(r.opened_at)} · {dateTimeLabel(r.opened_at)}
                      </Text>
                    </View>
                    {renderMapLink(r.latitude, r.longitude)}
                  </View>
                </View>
              ))
            ))}

          {tab === 'present' &&
            (present.length === 0 ? (
              <EmptyBlock icon={CalendarDays} text="No present records in this date range" />
            ) : (
              present.map((r) => (
                <View key={r.id} style={styles.card}>
                  <View style={[styles.cardIconWrap, { backgroundColor: Colors.successSurface }]}>
                    <CalendarDays size={16} color={Colors.success} strokeWidth={1.8} />
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle}>{r.rider_name}</Text>
                    <View style={styles.cardMetaRow}>
                      <Clock size={11} color={Colors.textTertiary} strokeWidth={1.8} />
                      <Text style={styles.cardMetaText}>
                        {dateLabel(r.date)}
                        {r.check_in_time ? ` · In ${timeLabel(r.check_in_time)}` : ''}
                        {r.check_out_time ? ` · Out ${timeLabel(r.check_out_time)}` : ''}
                      </Text>
                    </View>
                    {r.location_name && (
                      <View style={styles.cardMetaRow}>
                        <Navigation size={11} color={Colors.textTertiary} strokeWidth={1.8} />
                        <Text style={styles.cardMetaText}>Checked in at {r.location_name}</Text>
                      </View>
                    )}
                    {renderMapLink(r.check_in_latitude, r.check_in_longitude)}
                  </View>
                </View>
              ))
            ))}

          {tab === 'delivery' &&
            (deliveries.length === 0 ? (
              <EmptyBlock icon={Truck} text="No deliveries recorded in this date range" />
            ) : (
              deliveries.map((r) => (
                <View key={r.id} style={styles.card}>
                  <View style={[styles.cardIconWrap, { backgroundColor: '#FFF3E0' }]}>
                    <Truck size={16} color="#E65100" strokeWidth={1.8} />
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle}>{r.rider_name}</Text>
                    <View style={styles.cardMetaRow}>
                      <Clock size={11} color={Colors.textTertiary} strokeWidth={1.8} />
                      <Text style={styles.cardMetaText}>
                        Delivered at {timeLabel(r.delivered_at)} · {dateTimeLabel(r.delivered_at)}
                      </Text>
                    </View>
                    {(r.customer_name || r.order_ref) && (
                      <View style={styles.cardMetaRow}>
                        <Text style={styles.cardMetaText}>
                          {r.customer_name ?? 'Customer'}
                          {r.customer_mobile ? ` · +91 ${r.customer_mobile}` : ''}
                          {r.order_ref ? ` · ${r.order_ref}` : ''}
                        </Text>
                      </View>
                    )}
                    {r.delivery_latitude != null && r.delivery_longitude != null && (
                      <View style={styles.cardMetaRow}>
                        <MapPin size={11} color={Colors.textTertiary} strokeWidth={1.8} />
                        <Text style={styles.cardMetaText}>
                          Location {r.delivery_latitude.toFixed(6)}, {r.delivery_longitude.toFixed(6)}
                        </Text>
                      </View>
                    )}
                    {renderMapLink(r.delivery_latitude, r.delivery_longitude)}
                  </View>
                </View>
              ))
            ))}

          {loadingMore && (
            <View style={styles.loadMoreRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.loadMoreText}>Loading more...</Text>
            </View>
          )}

          <View style={{ height: Spacing[8] }} />
        </ScrollView>
      )}

      <Modal
        visible={openPicker !== null}
        onClose={() => setOpenPicker(null)}
        title={openPicker === 'from' ? 'Select From Date' : 'Select To Date'}
      >
        <DatePickerField
          label="Date"
          value={parseISO(openPicker === 'from' ? fromDate : toDate)}
          onChange={(d) => {
            const next = format(d, 'yyyy-MM-dd');
            if (openPicker === 'from') setFromDate(next);
            else setToDate(next);
            setOpenPicker(null);
          }}
          minDate={openPicker === 'to' ? parseISO(fromDate) : undefined}
          maxDate={openPicker === 'from' ? parseISO(toDate) : new Date()}
          defaultOpen
        />
      </Modal>
    </View>
  );
}

function EmptyBlock({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.center}>
      <Icon size={36} color={Colors.textDisabled} strokeWidth={1.5} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[6],
    paddingBottom: Spacing[3],
  },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.textPrimary },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 2 },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },

  tabsRow: {
    flexDirection: 'row',
    gap: Spacing[2],
    paddingHorizontal: Spacing[6],
    paddingBottom: Spacing[3],
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  tabActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  tabText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },

  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingHorizontal: Spacing[6],
    paddingBottom: Spacing[3],
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
  },
  dateBtnTextWrap: { gap: 1 },
  dateBtnLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 10,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateBtnValue: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },

  riderChips: { flexGrow: 0, paddingBottom: Spacing[3] },
  chip: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  chipActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  chipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textSecondary },
  chipTextActive: { color: Colors.primary },

  listWrap: { flex: 1 },
  list: { paddingHorizontal: Spacing[6], paddingTop: Spacing[1], gap: Spacing[2] },

  card: {
    flexDirection: 'row',
    gap: Spacing[3],
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing[3],
  },
  cardIconWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, gap: 3 },
  cardTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardMetaText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary },

  mapLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: Colors.primarySurface,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    marginTop: 2,
  },
  mapLinkText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11, color: Colors.primary },
  noLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  noLocationText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textDisabled },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing[3], padding: Spacing[8] },
  loadingText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  emptyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center' },

  loadMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[4],
  },
  loadMoreText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
});
