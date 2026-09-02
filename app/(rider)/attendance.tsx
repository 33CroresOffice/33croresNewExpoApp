import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CalendarDays, CircleCheck as CheckCircle2, Circle as XCircle,
  TrendingUp, MapPin, Navigation, Radio, Truck, PackageCheck, Clock,
} from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from 'date-fns';
import { resolveRider } from '@/utils/riderLookup';

const GRADIENT_TOP = '#1A2E3A';
const GRADIENT_MID = '#1E3D50';
const GRADIENT_BOT = '#235068';
const ACCENT = '#3AAFE4';

interface AttendanceRecord {
  id: string;
  date: string;
  status: 'present' | 'absent';
  check_in_time: string | null;
  check_out_time: string | null;
  notes: string | null;
}

interface AttendanceLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

interface DayOrder {
  id: string;
  order_id: string;
  status: string;
  customer_name: string | null;
  addr_street: string | null;
  addr_city: string | null;
  plan_name: string | null;
  delivered_at: string | null;
}

const STATUS_CONFIG = {
  present: { label: 'Present', color: Colors.success, bg: Colors.successSurface, Icon: CheckCircle2 },
  absent:  { label: 'Absent',  color: Colors.error,   bg: Colors.errorSurface,   Icon: XCircle },
};

const ORDER_STATUS_META: Record<string, { color: string; bg: string; label: string }> = {
  delivered: { color: Colors.success,  bg: Colors.successSurface, label: 'Delivered' },
  picked_up: { color: '#0891b2',       bg: '#e0f2fe',             label: 'Picked Up' },
  accepted:  { color: Colors.primary,  bg: Colors.primarySurface, label: 'Accepted' },
  assigned:  { color: Colors.warning,  bg: Colors.warningSurface, label: 'Pending' },
  failed:    { color: Colors.error,    bg: Colors.errorSurface,   label: 'Failed' },
  reassigned:{ color: Colors.textTertiary, bg: Colors.neutral[100], label: 'Reassigned' },
};

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator?.geolocation) { reject(new Error('Geolocation not supported')); return; }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, timeout: 10000, maximumAge: 0,
    });
  });
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function todayISTString(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export default function RiderAttendance() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();

  const [riderId, setRiderId] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [locations, setLocations] = useState<AttendanceLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [geoError, setGeoError] = useState('');

  // Selected date (ISO string yyyy-MM-dd), default today
  const [selectedDate, setSelectedDate] = useState<string>(todayISTString());
  const [dayOrders, setDayOrders] = useState<DayOrder[]>([]);
  const [dayOrdersLoading, setDayOrdersLoading] = useState(false);

  const currentMonth = new Date();
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // ── Load month attendance + locations ──────────────────────────────────────
  const load = useCallback(async () => {
    if (!profile?.id) return;

    let rId = riderId;
    if (!rId) {
      const riderData = await resolveRider(profile.id, profile.mobile, 'id');
      if (!riderData) { setLoading(false); setRefreshing(false); return; }
      rId = riderData.id;
      setRiderId(rId);
    }

    const [attendRes, locRes] = await Promise.all([
      supabase
        .from('rider_attendance')
        .select('id, date, status, check_in_time, check_out_time, notes')
        .eq('rider_id', rId)
        .gte('date', format(monthStart, 'yyyy-MM-dd'))
        .lte('date', format(monthEnd, 'yyyy-MM-dd'))
        .order('date', { ascending: false }),
      supabase
        .from('attendance_locations')
        .select('id, name, latitude, longitude, radius_meters')
        .eq('is_active', true),
    ]);

    if (attendRes.data) setAttendance(attendRes.data as AttendanceRecord[]);
    if (locRes.data) setLocations(locRes.data as AttendanceLocation[]);
    setLoading(false);
    setRefreshing(false);
  }, [profile?.id, riderId]);

  useEffect(() => { load(); }, [load]);

  // ── Load orders for selected date ─────────────────────────────────────────
  const loadDayOrders = useCallback(async (dateStr: string) => {
    if (!riderId) return;
    setDayOrdersLoading(true);
    setDayOrders([]);

    const { data: assignData } = await supabase
      .from('rider_order_assignments')
      .select('id, order_id, status, delivered_at')
      .eq('rider_id', riderId);

    if (!assignData || assignData.length === 0) {
      setDayOrdersLoading(false);
      return;
    }

    const orderIds = assignData.map((a: any) => a.order_id).filter(Boolean);
    const { data: ordersData } = await supabase
      .from('orders')
      .select('id, scheduled_date, user_id, subscription_id')
      .in('id', orderIds)
      .eq('scheduled_date', dateStr);

    if (!ordersData || ordersData.length === 0) {
      setDayOrdersLoading(false);
      return;
    }

    const userIds = ordersData.map((o: any) => o.user_id).filter(Boolean);
    const subIds = ordersData.map((o: any) => o.subscription_id).filter(Boolean);

    const [profilesRes, subsRes] = await Promise.all([
      userIds.length > 0
        ? supabase.from('profiles').select('id, full_name').in('id', userIds)
        : Promise.resolve({ data: [] }),
      subIds.length > 0
        ? supabase.from('subscriptions').select('id, plan_id, delivery_address_id').in('id', subIds)
        : Promise.resolve({ data: [] }),
    ]);

    const planIds = (subsRes.data ?? []).map((s: any) => s.plan_id).filter(Boolean);
    const addrIds = (subsRes.data ?? []).map((s: any) => s.delivery_address_id).filter(Boolean);

    const [plansRes, addrsRes] = await Promise.all([
      planIds.length > 0
        ? supabase.from('subscription_plans').select('id, name').in('id', planIds)
        : Promise.resolve({ data: [] }),
      addrIds.length > 0
        ? supabase.from('addresses').select('id, street, city').in('id', addrIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profileMap: Record<string, any> = {};
    (profilesRes.data ?? []).forEach((p: any) => { profileMap[p.id] = p; });
    const planMap: Record<string, any> = {};
    (plansRes.data ?? []).forEach((p: any) => { planMap[p.id] = p; });
    const addrMap: Record<string, any> = {};
    (addrsRes.data ?? []).forEach((a: any) => { addrMap[a.id] = a; });
    const subMap: Record<string, any> = {};
    (subsRes.data ?? []).forEach((s: any) => { subMap[s.id] = s; });
    const orderMap: Record<string, any> = {};
    ordersData.forEach((o: any) => {
      const prof = profileMap[o.user_id];
      const sub = subMap[o.subscription_id];
      const plan = sub ? planMap[sub.plan_id] : null;
      const addr = sub ? addrMap[sub.delivery_address_id] : null;
      orderMap[o.id] = {
        customer_name: prof?.full_name ?? null,
        addr_street: addr?.street ?? null,
        addr_city: addr?.city ?? null,
        plan_name: plan?.name ?? null,
      };
    });

    const enriched: DayOrder[] = assignData
      .filter((a: any) => orderMap[a.order_id])
      .map((a: any) => ({
        id: a.id,
        order_id: a.order_id,
        status: a.status,
        delivered_at: a.delivered_at ?? null,
        ...(orderMap[a.order_id] ?? {}),
      }));

    setDayOrders(enriched);
    setDayOrdersLoading(false);
  }, [riderId]);

  // Reload orders whenever selectedDate or riderId changes
  useEffect(() => {
    if (riderId) loadDayOrders(selectedDate);
  }, [selectedDate, riderId]);

  // ── Check-in ───────────────────────────────────────────────────────────────
  const handleCheckIn = async () => {
    setGeoError('');
    if (locations.length === 0) {
      setGeoError('No attendance locations configured. Contact admin.');
      return;
    }
    setCheckingIn(true);
    try {
      let pos: GeolocationPosition;
      try {
        pos = await getCurrentPosition();
      } catch {
        setGeoError('Unable to get your location. Please allow location access and try again.');
        setCheckingIn(false);
        return;
      }

      const { latitude: userLat, longitude: userLng } = pos.coords;
      let matchedLocation: AttendanceLocation | null = null;
      let minDist = Infinity;
      for (const loc of locations) {
        const dist = haversineMeters(userLat, userLng, loc.latitude, loc.longitude);
        if (dist <= loc.radius_meters && dist < minDist) {
          minDist = dist;
          matchedLocation = loc;
        }
      }

      if (!matchedLocation) {
        const nearest = locations.reduce((best, loc) => {
          const d = haversineMeters(userLat, userLng, loc.latitude, loc.longitude);
          return d < haversineMeters(userLat, userLng, best.latitude, best.longitude) ? loc : best;
        }, locations[0]);
        const nearestDist = Math.round(haversineMeters(userLat, userLng, nearest.latitude, nearest.longitude));
        setGeoError(`You are ${nearestDist}m from "${nearest.name}" (radius: ${nearest.radius_meters}m). Move closer to check in.`);
        setCheckingIn(false);
        return;
      }

      const todayStr = todayISTString();
      const { error } = await supabase
        .from('rider_attendance')
        .upsert({
          rider_id: riderId,
          date: todayStr,
          status: 'present' as const,
          check_in_time: new Date().toISOString(),
          check_in_location_id: matchedLocation.id,
          check_in_latitude: userLat,
          check_in_longitude: userLng,
        }, { onConflict: 'rider_id,date' });

      if (error) {
        setGeoError(error.message || 'Failed to mark attendance. Please try again.');
      } else {
        await load();
      }
    } finally {
      setCheckingIn(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const getRecordForDay = (day: Date): AttendanceRecord | null =>
    attendance.find((a) => isSameDay(parseISO(a.date), day)) ?? null;

  const selectedRecord = attendance.find((a) => a.date === selectedDate) ?? null;
  const todayStr = todayISTString();
  const todayRecord = attendance.find((a) => a.date === todayStr) ?? null;

  const presentCount = attendance.filter((a) => a.status === 'present').length;
  const absentCount  = attendance.filter((a) => a.status === 'absent').length;
  const daysElapsed  = Math.min(new Date().getDate(), daysInMonth.length);

  const attendanceRate = daysElapsed > 0
    ? Math.round((presentCount / daysElapsed) * 100)
    : 0;

  const statRows = [
    { label: 'Present', value: presentCount, color: Colors.success, bg: Colors.successSurface, Icon: CheckCircle2 },
    { label: 'Absent',  value: absentCount,  color: Colors.error,   bg: Colors.errorSurface,   Icon: XCircle },
  ];

  // ── Render helpers ─────────────────────────────────────────────────────────
  const renderCalendarGrid = () => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const firstDayOfWeek = monthStart.getDay();
    const cells: (Date | null)[] = [...Array(firstDayOfWeek).fill(null), ...daysInMonth];
    const todayDate = new Date();

    return (
      <View style={calStyles.calendarWrap}>
        <View style={calStyles.dayNamesRow}>
          {dayNames.map((d) => (
            <View key={d} style={calStyles.dayNameCell}>
              <Text style={calStyles.dayNameText}>{d}</Text>
            </View>
          ))}
        </View>
        <View style={calStyles.daysGrid}>
          {cells.map((day, idx) => {
            if (!day) return <View key={`empty-${idx}`} style={calStyles.dayCell} />;
            const record = getRecordForDay(day);
            const isToday = isSameDay(day, todayDate);
            const dateStr = format(day, 'yyyy-MM-dd');
            const isSelected = selectedDate === dateStr;
            const statusConf = record ? STATUS_CONFIG[record.status] : null;

            return (
              <TouchableOpacity
                key={day.toISOString()}
                style={[
                  calStyles.dayCell,
                  statusConf && !isSelected && { backgroundColor: statusConf.bg },
                  isSelected && calStyles.selectedCell,
                  isToday && !isSelected && calStyles.todayCell,
                ]}
                onPress={() => setSelectedDate(dateStr)}
                activeOpacity={0.7}
              >
                <Text style={[
                  calStyles.dayNumber,
                  statusConf && !isSelected && { color: statusConf.color },
                  isToday && !isSelected && calStyles.todayNumber,
                  isSelected && calStyles.selectedNumber,
                ]}>
                  {format(day, 'd')}
                </Text>
                {statusConf && !isSelected && (
                  <statusConf.Icon size={10} color={statusConf.color} strokeWidth={2} />
                )}
                {isSelected && (
                  <View style={calStyles.selectedDot} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderCheckInSection = () => {
    const isPresent = todayRecord?.status === 'present';
    return (
      <View style={styles.checkInCard}>
        <View style={styles.checkInHeader}>
          <View style={styles.checkInIconWrap}>
            <Navigation size={20} color={ACCENT} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.checkInTitle}>Today's Attendance</Text>
            <Text style={styles.checkInDate}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
          </View>
          {todayRecord && (
            <View style={[styles.checkInBadge, { backgroundColor: isPresent ? Colors.successSurface : Colors.warningSurface }]}>
              <Text style={[styles.checkInBadgeText, { color: isPresent ? Colors.success : Colors.warning }]}>
                {STATUS_CONFIG[todayRecord.status]?.label ?? todayRecord.status}
              </Text>
            </View>
          )}
        </View>

        {todayRecord?.check_in_time && (
          <View style={styles.checkInTimeRow}>
            <Clock size={13} color={Colors.textTertiary} strokeWidth={1.8} />
            <Text style={styles.checkInTimeText}>
              Checked in at {format(new Date(todayRecord.check_in_time), 'hh:mm a')}
            </Text>
          </View>
        )}

        {!todayRecord && locations.length > 0 && (
          <View style={styles.locationsList}>
            {locations.map((loc) => (
              <View key={loc.id} style={styles.locationItem}>
                <Radio size={12} color={Colors.primary} strokeWidth={1.8} />
                <Text style={styles.locationItemText}>{loc.name} · {loc.radius_meters}m radius</Text>
              </View>
            ))}
          </View>
        )}

        {!!geoError && (
          <View style={styles.geoErrorBox}>
            <MapPin size={14} color={Colors.error} strokeWidth={1.8} />
            <Text style={styles.geoErrorText}>{geoError}</Text>
          </View>
        )}

        {!todayRecord && (
          <TouchableOpacity
            style={[styles.checkInBtn, checkingIn && styles.checkInBtnDisabled]}
            onPress={handleCheckIn}
            disabled={checkingIn}
            activeOpacity={0.85}
          >
            {checkingIn
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <Navigation size={16} color={Colors.white} strokeWidth={2} />}
            <Text style={styles.checkInBtnText}>
              {checkingIn ? 'Getting Location...' : 'Mark Attendance'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderSelectedDayPanel = () => {
    const isToday = selectedDate === todayStr;
    const selectedDateObj = parseISO(selectedDate);
    const conf = selectedRecord ? STATUS_CONFIG[selectedRecord.status] : null;

    return (
      <View style={styles.dayPanel}>
        {/* Day panel header */}
        <View style={styles.dayPanelHeader}>
          <View style={styles.dayPanelDateWrap}>
            <Text style={styles.dayPanelDay}>{format(selectedDateObj, 'dd')}</Text>
            <View>
              <Text style={styles.dayPanelMonth}>{format(selectedDateObj, 'MMMM yyyy')}</Text>
              <Text style={styles.dayPanelWeekday}>{format(selectedDateObj, 'EEEE')}{isToday ? ' · Today' : ''}</Text>
            </View>
          </View>
          {conf ? (
            <View style={[styles.dayPanelBadge, { backgroundColor: conf.bg }]}>
              <conf.Icon size={12} color={conf.color} strokeWidth={2} />
              <Text style={[styles.dayPanelBadgeText, { color: conf.color }]}>{conf.label}</Text>
            </View>
          ) : (
            <View style={[styles.dayPanelBadge, { backgroundColor: Colors.neutral[100] }]}>
              <Text style={[styles.dayPanelBadgeText, { color: Colors.textTertiary }]}>No Record</Text>
            </View>
          )}
        </View>

        {/* Check-in / Check-out times */}
        {selectedRecord?.check_in_time && (
          <View style={styles.dayPanelTimes}>
            <View style={styles.dayPanelTimeItem}>
              <View style={[styles.dayPanelTimeIcon, { backgroundColor: Colors.successSurface }]}>
                <CheckCircle2 size={14} color={Colors.success} strokeWidth={2} />
              </View>
              <View>
                <Text style={styles.dayPanelTimeLabel}>Check In</Text>
                <Text style={styles.dayPanelTimeValue}>
                  {format(new Date(selectedRecord.check_in_time), 'hh:mm a')}
                </Text>
              </View>
            </View>
            {selectedRecord.check_out_time && (
              <View style={styles.dayPanelTimeItem}>
                <View style={[styles.dayPanelTimeIcon, { backgroundColor: Colors.errorSurface }]}>
                  <XCircle size={14} color={Colors.error} strokeWidth={2} />
                </View>
                <View>
                  <Text style={styles.dayPanelTimeLabel}>Check Out</Text>
                  <Text style={styles.dayPanelTimeValue}>
                    {format(new Date(selectedRecord.check_out_time), 'hh:mm a')}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {selectedRecord?.notes ? (
          <View style={styles.dayPanelNotes}>
            <Text style={styles.dayPanelNotesText}>{selectedRecord.notes}</Text>
          </View>
        ) : null}

        {/* Deliveries for selected day */}
        <View style={styles.dayPanelDeliveries}>
          <View style={styles.dayPanelDeliveryHeader}>
            <Truck size={14} color={Colors.textSecondary} strokeWidth={1.8} />
            <Text style={styles.dayPanelDeliveryTitle}>Deliveries</Text>
            {!dayOrdersLoading && (
              <View style={styles.dayPanelDeliveryCount}>
                <Text style={styles.dayPanelDeliveryCountText}>{dayOrders.length}</Text>
              </View>
            )}
          </View>

          {dayOrdersLoading ? (
            <View style={styles.dayDeliveryLoading}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.dayDeliveryLoadingText}>Loading deliveries...</Text>
            </View>
          ) : dayOrders.length === 0 ? (
            <View style={styles.dayDeliveryEmpty}>
              <PackageCheck size={24} color={Colors.neutral[400]} strokeWidth={1.5} />
              <Text style={styles.dayDeliveryEmptyText}>No deliveries on this date</Text>
            </View>
          ) : (
            <View style={styles.deliveryList}>
              {dayOrders.map((order) => {
                const sm = ORDER_STATUS_META[order.status] ?? ORDER_STATUS_META.assigned;
                const addrText = [order.addr_street, order.addr_city].filter(Boolean).join(', ') || '—';
                return (
                  <View key={order.id} style={styles.deliveryItem}>
                    <View style={[styles.deliveryIconWrap, { backgroundColor: sm.bg }]}>
                      <PackageCheck size={16} color={sm.color} strokeWidth={1.8} />
                    </View>
                    <View style={styles.deliveryInfo}>
                      <Text style={styles.deliveryCustomer} numberOfLines={1}>
                        {order.customer_name ?? 'Customer'}
                      </Text>
                      <View style={styles.deliveryAddrRow}>
                        <MapPin size={10} color={Colors.textTertiary} strokeWidth={1.8} />
                        <Text style={styles.deliveryAddr} numberOfLines={1}>{addrText}</Text>
                      </View>
                      {order.plan_name && (
                        <Text style={styles.deliveryPlan} numberOfLines={1}>{order.plan_name}</Text>
                      )}
                      {order.delivered_at && (
                        <View style={styles.deliveryTimeRow}>
                          <CheckCircle2 size={10} color={Colors.success} strokeWidth={2} />
                          <Text style={styles.deliveryTime}>
                            {format(new Date(order.delivered_at), 'hh:mm a')}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={[styles.deliveryStatusPill, { backgroundColor: sm.bg }]}>
                      <Text style={[styles.deliveryStatusText, { color: sm.color }]}>{sm.label}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderAttendanceLog = () =>
    attendance.length === 0 ? (
      <View style={styles.emptyState}>
        <CalendarDays size={32} color={Colors.textTertiary} strokeWidth={1.5} />
        <Text style={styles.emptyTitle}>No records this month</Text>
      </View>
    ) : (
      <View style={styles.listCard}>
        {attendance.map((record, i) => {
          const conf = STATUS_CONFIG[record.status];
          const isSelected = record.date === selectedDate;
          return (
            <TouchableOpacity
              key={record.id}
              style={[styles.listRow, i === attendance.length - 1 && styles.listRowLast, isSelected && styles.listRowSelected]}
              onPress={() => setSelectedDate(record.date)}
              activeOpacity={0.75}
            >
              <View style={[styles.listIconWrap, { backgroundColor: conf.bg }]}>
                <conf.Icon size={16} color={conf.color} strokeWidth={1.8} />
              </View>
              <View style={styles.listInfo}>
                <Text style={styles.listDate}>{format(parseISO(record.date), 'EEEE, dd MMMM')}</Text>
                {record.check_in_time && (
                  <Text style={styles.listMeta}>
                    In: {format(new Date(record.check_in_time), 'hh:mm a')}
                    {record.check_out_time ? `  ·  Out: ${format(new Date(record.check_out_time), 'hh:mm a')}` : ''}
                  </Text>
                )}
                {record.notes ? <Text style={styles.listNotes} numberOfLines={1}>{record.notes}</Text> : null}
              </View>
              <View style={[styles.statusBadge, { backgroundColor: conf.bg }]}>
                <Text style={[styles.statusBadgeText, { color: conf.color }]}>{conf.label}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );

  return (
    <View style={[styles.container, { backgroundColor: '#EEF2F5' }]}>
      <LinearGradient
        colors={[GRADIENT_TOP, GRADIENT_MID, GRADIENT_BOT]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.gradientHeader, { paddingTop: insets.top + Spacing[3] }]}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerIconWrap}>
            <CalendarDays size={18} color={ACCENT} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerEyebrow}>Rider Portal</Text>
            <Text style={styles.headerTitle}>Attendance</Text>
          </View>
          <View style={styles.monthBadge}>
            <Text style={styles.monthBadgeText}>{format(currentMonth, 'MMM yyyy')}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={Colors.primary}
          />
        }
      >
        {/* This Month Report */}
        <View style={styles.monthReport}>
          {/* Header */}
          <View style={styles.monthReportHeader}>
            <View style={styles.monthReportTitleRow}>
              <TrendingUp size={15} color={ACCENT} strokeWidth={2} />
              <Text style={styles.monthReportTitle}>This Month</Text>
            </View>
            <Text style={styles.monthReportSub}>{format(currentMonth, 'MMMM yyyy')}</Text>
          </View>

          {/* Attendance Rate hero */}
          <View style={styles.rateHero}>
            <View style={styles.rateCircle}>
              <Text style={styles.rateValue}>{loading ? '—' : `${attendanceRate}%`}</Text>
              <Text style={styles.rateLabel}>Attendance{'\n'}Rate</Text>
            </View>
            <View style={styles.rateBarWrap}>
              <View style={styles.rateBarTrack}>
                <View style={[styles.rateBarFill, { width: `${loading ? 0 : attendanceRate}%` }]} />
              </View>
              <View style={styles.rateBarLegend}>
                <Text style={styles.rateBarNote}>{loading ? '—' : `${daysElapsed} days elapsed`}</Text>
                <Text style={styles.rateBarNote}>{loading ? '—' : `${daysInMonth.length} days total`}</Text>
              </View>
            </View>
          </View>

          {/* Stat grid */}
          <View style={styles.statGrid}>
            {statRows.map((s) => (
              <View key={s.label} style={[styles.statCell, { backgroundColor: s.bg }]}>
                <View style={styles.statCellTop}>
                  <s.Icon size={14} color={s.color} strokeWidth={2} />
                  <Text style={[styles.statCellValue, { color: s.color }]}>
                    {loading ? '—' : s.value}
                  </Text>
                </View>
                <Text style={[styles.statCellLabel, { color: s.color }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* GPS Check-in card (always shown) */}
        {!loading && renderCheckInSection()}

        {/* Calendar */}
        <View style={styles.calendarCard}>
          <Text style={styles.cardTitle}>{format(currentMonth, 'MMMM yyyy')}</Text>
          {renderCalendarGrid()}
        </View>

        {/* Selected day detail panel */}
        {!loading && renderSelectedDayPanel()}

        {/* Attendance log */}
        <View>
          <Text style={styles.sectionTitle}>Attendance Log</Text>
          {renderAttendanceLog()}
        </View>
      </ScrollView>
    </View>
  );
}

const calStyles = StyleSheet.create({
  calendarWrap: { gap: 2 },
  dayNamesRow: { flexDirection: 'row', marginBottom: 2 },
  dayNameCell: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  dayNameText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: 10,
    color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.3,
  },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: `${100 / 7}%`, aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 6, gap: 1, padding: 1,
  },
  todayCell: { borderWidth: 1.5, borderColor: Colors.primary },
  selectedCell: { backgroundColor: Colors.primary },
  selectedDot: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.white,
  },
  dayNumber: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: 12, color: Colors.textPrimary,
  },
  todayNumber: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  selectedNumber: { color: Colors.white, fontFamily: Typography.fontFamily.sansSemiBold },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradientHeader: { paddingHorizontal: Spacing[5], paddingBottom: Spacing[4] },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  headerIconWrap: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerEyebrow: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs,
    color: 'rgba(255,255,255,0.6)', letterSpacing: 0.8, textTransform: 'uppercase',
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'],
    color: '#FFFFFF', letterSpacing: -0.3,
  },
  monthBadge: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  monthBadgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: '#FFFFFF',
  },
  scrollContent: { padding: Spacing[4], gap: Spacing[4] },

  // This Month Report card
  monthReport: {
    backgroundColor: Colors.white, borderRadius: 16, padding: Spacing[4],
    borderWidth: 1, borderColor: Colors.border, gap: Spacing[4], ...Shadow.sm,
  },
  monthReportHeader: { gap: 2 },
  monthReportTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  monthReportTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  monthReportSub: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs,
    color: Colors.textTertiary, marginLeft: 21,
  },

  rateHero: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[4],
    backgroundColor: Colors.neutral[50], borderRadius: Radius.md, padding: Spacing[3],
  },
  rateCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    gap: 1, flexShrink: 0,
  },
  rateValue: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg,
    color: Colors.white, letterSpacing: -0.5,
  },
  rateLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 9,
    color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 13,
  },
  rateBarWrap: { flex: 1, gap: Spacing[2] },
  rateBarTrack: {
    height: 8, backgroundColor: Colors.neutral[200], borderRadius: Radius.full, overflow: 'hidden',
  },
  rateBarFill: {
    height: '100%', backgroundColor: Colors.primary, borderRadius: Radius.full,
  },
  rateBarLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  rateBarNote: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary,
  },

  statGrid: { flexDirection: 'row', gap: Spacing[2] },
  statCell: {
    flex: 1, borderRadius: 12, padding: Spacing[3], gap: 4,
  },
  statCellTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statCellValue: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, letterSpacing: -0.5,
  },
  statCellLabel: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: 10, letterSpacing: 0.2,
  },

  // Check-in card
  checkInCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: Spacing[4],
    borderWidth: 1, borderColor: Colors.border, gap: Spacing[3], ...Shadow.sm,
  },
  checkInHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  checkInIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(58,175,228,0.12)', alignItems: 'center', justifyContent: 'center',
  },
  checkInTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  checkInDate: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2,
  },
  checkInBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  checkInBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  checkInTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkInTimeText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary,
  },
  locationsList: { gap: 4 },
  locationItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationItemText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  geoErrorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: Colors.errorSurface, borderRadius: Radius.md, padding: 10,
  },
  geoErrorText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.error, flex: 1, lineHeight: 18,
  },
  checkInBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: 14, minHeight: 50,
  },
  checkInBtnDisabled: { backgroundColor: Colors.neutral[300] },
  checkInBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white,
  },

  // Calendar
  calendarCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: Spacing[4],
    borderWidth: 1, borderColor: Colors.border, gap: Spacing[3], ...Shadow.sm,
  },
  cardTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },

  // Selected day panel
  dayPanel: {
    backgroundColor: Colors.white, borderRadius: 16, padding: Spacing[4],
    borderWidth: 1, borderColor: Colors.border, gap: Spacing[4], ...Shadow.sm,
  },
  dayPanelHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  dayPanelDateWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  dayPanelDay: {
    fontFamily: Typography.fontFamily.bold, fontSize: 40, color: Colors.primary,
    lineHeight: 44, letterSpacing: -1,
  },
  dayPanelMonth: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  dayPanelWeekday: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2,
  },
  dayPanelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full,
  },
  dayPanelBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 12 },

  dayPanelTimes: {
    flexDirection: 'row', gap: Spacing[4],
    backgroundColor: Colors.neutral[50], borderRadius: Radius.md, padding: Spacing[3],
  },
  dayPanelTimeItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  dayPanelTimeIcon: {
    width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  dayPanelTimeLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 10,
    color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.4,
  },
  dayPanelTimeValue: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary,
  },

  dayPanelNotes: {
    backgroundColor: Colors.accentSurface, borderRadius: Radius.md, padding: Spacing[3],
    borderLeftWidth: 3, borderLeftColor: Colors.accent,
  },
  dayPanelNotesText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: Colors.textSecondary, lineHeight: 20,
  },

  dayPanelDeliveries: { gap: Spacing[3] },
  dayPanelDeliveryHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
  },
  dayPanelDeliveryTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm,
    color: Colors.textPrimary, flex: 1,
  },
  dayPanelDeliveryCount: {
    minWidth: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  dayPanelDeliveryCountText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.primary,
  },

  dayDeliveryLoading: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: Spacing[4], justifyContent: 'center',
  },
  dayDeliveryLoadingText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
  },
  dayDeliveryEmpty: {
    alignItems: 'center', gap: 6, paddingVertical: Spacing[5],
    backgroundColor: Colors.neutral[50], borderRadius: Radius.md,
  },
  dayDeliveryEmptyText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
  },

  deliveryList: { gap: Spacing[2] },
  deliveryItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.neutral[50], borderRadius: Radius.md,
    padding: Spacing[3], gap: Spacing[3],
    borderWidth: 1, borderColor: Colors.border,
  },
  deliveryIconWrap: {
    width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  deliveryInfo: { flex: 1, gap: 3 },
  deliveryCustomer: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary,
  },
  deliveryAddrRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deliveryAddr: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, flex: 1,
  },
  deliveryPlan: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.primary,
  },
  deliveryTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deliveryTime: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.success,
  },
  deliveryStatusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  deliveryStatusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },

  sectionTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary,
  },

  // Attendance log list
  listCard: {
    backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  listRow: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing[4],
    borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: Spacing[3],
  },
  listRowLast: { borderBottomWidth: 0 },
  listRowSelected: { backgroundColor: Colors.primarySurface },
  listIconWrap: {
    width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  listInfo: { flex: 1, gap: 1 },
  listDate: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary,
  },
  listMeta: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  listNotes: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  statusBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  emptyState: { paddingVertical: 40, alignItems: 'center', gap: Spacing[2] },
  emptyTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
});
