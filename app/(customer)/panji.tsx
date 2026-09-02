import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft, ChevronRight, Sun, Sunset, Star, CalendarDays,
  Clock, Sparkles,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  addMonths, subMonths, isToday, isSameDay, parseISO,
} from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { PanjiEntry } from '@/types/database';

const GREGORIAN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type EntryMap = Record<string, PanjiEntry>;

function PanjiInfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={detailStyles.infoRow}>
      <Text style={detailStyles.infoLabel}>{label}</Text>
      <Text style={detailStyles.infoValue}>{value}</Text>
    </View>
  );
}

export default function PanjiScreen() {
  const insets = useSafeAreaInsets();
  const [viewMonth, setViewMonth] = useState(new Date());
  const [entryMap, setEntryMap] = useState<EntryMap>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  const dateStripRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const loadMonth = useCallback(async (month: Date, silent = false) => {
    if (!silent) setLoading(true);
    const start = format(startOfMonth(month), 'yyyy-MM-dd');
    const end = format(endOfMonth(month), 'yyyy-MM-dd');
    const { data } = await supabase
      .from('panji_entries')
      .select('*')
      .gte('date', start)
      .lte('date', end)
      .eq('is_published', true)
      .order('date');
    if (data) {
      const map: EntryMap = {};
      for (const e of data) map[e.date] = e as PanjiEntry;
      setEntryMap(map);
    } else {
      setEntryMap({});
    }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => { loadMonth(viewMonth); }, [viewMonth, loadMonth]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMonth(viewMonth, true);
    setRefreshing(false);
  };

  const switchEntry = (dateStr: string) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    setSelectedDate(dateStr);
  };

  const changeMonth = (dir: 1 | -1) => {
    const newMonth = dir === 1 ? addMonths(viewMonth, 1) : subMonths(viewMonth, 1);
    setViewMonth(newMonth);
    const newDateStr = format(dir === 1 ? startOfMonth(newMonth) : startOfMonth(newMonth), 'yyyy-MM-dd');
    setSelectedDate(newDateStr);
  };

  const days = eachDayOfInterval({ start: startOfMonth(viewMonth), end: endOfMonth(viewMonth) });
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayEntry = entryMap[todayStr];
  const selectedEntry = entryMap[selectedDate];

  // ── Today Hero Card ──────────────────────────────────────────────────────────
  const renderTodayHero = () => {
    const isCurrentMonth = format(viewMonth, 'yyyy-MM') === format(new Date(), 'yyyy-MM');
    if (!isCurrentMonth) return null;
    return (
      <LinearGradient
        colors={['#1C3A18', '#2D5A27', '#3A7A32']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <LinearGradient
          colors={['#D4A853', '#F0C060', '#D4A853']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.heroAccent}
        />
        <View style={styles.heroContent}>
          <View style={styles.heroTop}>
            <View style={styles.heroTodayBadge}>
              <Sparkles size={12} color="#F0C060" />
              <Text style={styles.heroTodayText}>Today</Text>
            </View>
            <Text style={styles.heroGregorianDate}>{format(new Date(), 'EEEE, d MMMM yyyy')}</Text>
          </View>

          {todayEntry ? (
            <>
              <Text style={styles.heroOdiaDate}>{todayEntry.odia_date || todayEntry.odia_month}</Text>
              <View style={styles.heroPanchangaRow}>
                <View style={styles.heroPanchangaItem}>
                  <Text style={styles.heroPanchangaLabel}>Tithi</Text>
                  <Text style={styles.heroPanchangaValue}>{todayEntry.tithi || '—'}</Text>
                </View>
                <View style={styles.heroDivider} />
                <View style={styles.heroPanchangaItem}>
                  <Text style={styles.heroPanchangaLabel}>Nakshatra</Text>
                  <Text style={styles.heroPanchangaValue}>{todayEntry.nakshatra || '—'}</Text>
                </View>
                <View style={styles.heroDivider} />
                <View style={styles.heroPanchangaItem}>
                  <Text style={styles.heroPanchangaLabel}>Vara</Text>
                  <Text style={styles.heroPanchangaValue}>{todayEntry.vara || '—'}</Text>
                </View>
              </View>
              {(todayEntry.festivals?.length ?? 0) > 0 && (
                <View style={styles.heroFestivals}>
                  {todayEntry.festivals.map((f, i) => (
                    <View key={i} style={styles.heroFestivalChip}>
                      <Star size={10} color="#F0C060" />
                      <Text style={styles.heroFestivalText}>{f}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={styles.heroEmpty}>
              <CalendarDays size={28} color="rgba(255,255,255,0.3)" strokeWidth={1.5} />
              <Text style={styles.heroEmptyText}>Panji entry not yet published for today</Text>
            </View>
          )}
        </View>
      </LinearGradient>
    );
  };

  // ── Date strip ───────────────────────────────────────────────────────────────
  const renderDateStrip = () => (
    <View style={styles.dateStripOuter}>
      <TouchableOpacity style={styles.stripArrow} onPress={() => changeMonth(-1)}>
        <ChevronLeft size={18} color={Colors.textSecondary} />
      </TouchableOpacity>
      <ScrollView
        ref={dateStripRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dateStripContent}
      >
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const hasEntry = !!entryMap[dateStr];
          const isSelected = selectedDate === dateStr;
          const isTodayDate = isToday(day);
          return (
            <TouchableOpacity
              key={dateStr}
              style={[
                styles.dateChip,
                isSelected && styles.dateChipSelected,
                isTodayDate && !isSelected && styles.dateChipToday,
              ]}
              onPress={() => switchEntry(dateStr)}
            >
              <Text style={[styles.dateChipWeekday, isSelected && styles.dateChipTextSelected]}>
                {format(day, 'EEE')}
              </Text>
              <Text style={[styles.dateChipNum, isSelected && styles.dateChipTextSelected, isTodayDate && !isSelected && styles.dateChipNumToday]}>
                {format(day, 'd')}
              </Text>
              <View style={[styles.dateChipDot, hasEntry && (isSelected ? styles.dateChipDotSelected : styles.dateChipDotFilled)]} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <TouchableOpacity style={styles.stripArrow} onPress={() => changeMonth(1)}>
        <ChevronRight size={18} color={Colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );

  // ── Entry detail card ────────────────────────────────────────────────────────
  const renderEntryDetail = () => {
    if (!selectedEntry) {
      return (
        <View style={styles.noEntryCard}>
          <CalendarDays size={32} color={Colors.neutral[300]} strokeWidth={1.5} />
          <Text style={styles.noEntryTitle}>No Panji entry available</Text>
          <Text style={styles.noEntryBody}>The entry for this day hasn't been published yet. Check back soon.</Text>
        </View>
      );
    }

    return (
      <Animated.View style={[styles.entryCard, { opacity: fadeAnim }]}>
        {/* Date header */}
        <View style={styles.entryDateHeader}>
          <View>
            <Text style={styles.entryGregorianDate}>
              {format(parseISO(selectedDate), 'EEEE, d MMMM yyyy')}
            </Text>
            <Text style={styles.entryOdiaDate}>{selectedEntry.odia_date}</Text>
          </View>
          {selectedEntry.odia_year > 0 && (
            <View style={styles.odiaYearBadge}>
              <Text style={styles.odiaYearText}>{selectedEntry.odia_year} Saka</Text>
            </View>
          )}
        </View>

        {/* Panchanga grid */}
        <View style={styles.panchangaGrid}>
          {[
            { label: 'Tithi', value: selectedEntry.tithi },
            { label: 'Nakshatra', value: selectedEntry.nakshatra },
            { label: 'Yoga', value: selectedEntry.yoga },
            { label: 'Karana', value: selectedEntry.karana },
            { label: 'Vara', value: selectedEntry.vara },
            { label: 'Odia Month', value: selectedEntry.odia_month },
          ].filter((i) => i.value).map((item) => (
            <View key={item.label} style={styles.panchangaItem}>
              <Text style={styles.panchangaLabel}>{item.label}</Text>
              <Text style={styles.panchangaValue}>{item.value}</Text>
            </View>
          ))}
        </View>

        {/* Sunrise / Sunset */}
        {(selectedEntry.sunrise || selectedEntry.sunset) && (
          <View style={styles.sunTimesRow}>
            {selectedEntry.sunrise ? (
              <View style={styles.sunTimeItem}>
                <Sun size={16} color={Colors.warning} strokeWidth={1.8} />
                <View>
                  <Text style={styles.sunTimeLabel}>Sunrise</Text>
                  <Text style={styles.sunTimeValue}>{selectedEntry.sunrise}</Text>
                </View>
              </View>
            ) : null}
            {selectedEntry.sunset ? (
              <View style={styles.sunTimeItem}>
                <Sunset size={16} color={Colors.secondary} strokeWidth={1.8} />
                <View>
                  <Text style={styles.sunTimeLabel}>Sunset</Text>
                  <Text style={styles.sunTimeValue}>{selectedEntry.sunset}</Text>
                </View>
              </View>
            ) : null}
          </View>
        )}

        {/* Auspicious timings */}
        {(selectedEntry.auspicious_timings?.length ?? 0) > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Clock size={14} color={Colors.success} />
              <Text style={styles.sectionTitle}>Auspicious Timings</Text>
            </View>
            {selectedEntry.auspicious_timings.map((t, i) => (
              <View key={i} style={styles.timingRow}>
                <View style={styles.timingDot} />
                <Text style={styles.timingText}>{t}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Festivals */}
        {(selectedEntry.festivals?.length ?? 0) > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Star size={14} color={Colors.accent} />
              <Text style={styles.sectionTitle}>Festivals & Vratas</Text>
            </View>
            <View style={styles.festivalChips}>
              {selectedEntry.festivals.map((f, i) => (
                <View key={i} style={styles.festivalChip}>
                  <Text style={styles.festivalChipText}>{f}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Description */}
        {selectedEntry.description ? (
          <View style={styles.section}>
            <Text style={styles.descriptionText}>{selectedEntry.description}</Text>
          </View>
        ) : null}
      </Animated.View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: Platform.OS !== 'web' ? insets.top : 0 }]}>
      {/* Header */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topBarTitle}>Odia Panji</Text>
          <Text style={styles.topBarSub}>{format(viewMonth, 'MMMM yyyy')}</Text>
        </View>
        <View style={styles.monthNavRow}>
          <TouchableOpacity style={styles.monthNavBtn} onPress={() => changeMonth(-1)}>
            <ChevronLeft size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.monthNavLabel}>{format(viewMonth, 'MMM yyyy')}</Text>
          <TouchableOpacity style={styles.monthNavBtn} onPress={() => changeMonth(1)}>
            <ChevronRight size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading Panji...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Today hero */}
          {renderTodayHero()}

          {/* Date strip */}
          {renderDateStrip()}

          {/* Entry detail */}
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionLabel}>
              {selectedDate === todayStr ? "Today's Panji" : format(parseISO(selectedDate), 'd MMMM yyyy')}
            </Text>
            {renderEntryDetail()}
          </View>

          <View style={styles.bottomPad} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[5], paddingTop: Spacing[4], paddingBottom: Spacing[3],
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  topBarTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  topBarSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 1 },
  monthNavRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1] },
  monthNavBtn: { width: 30, height: 30, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  monthNavLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary, minWidth: 72, textAlign: 'center' },

  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing[3] },
  loadingText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },

  scroll: { flex: 1 },
  scrollContent: { gap: Spacing[4] },
  bottomPad: { height: Spacing[6] },

  // Hero
  heroCard: { margin: Spacing[4], borderRadius: Radius.xl, overflow: 'hidden' },
  heroAccent: { height: 3 },
  heroContent: { padding: Spacing[5], gap: Spacing[3] },
  heroTop: { gap: Spacing[1] },
  heroTodayBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: 'rgba(212,168,83,0.2)', paddingHorizontal: Spacing[3], paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(212,168,83,0.4)' },
  heroTodayText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: '#F0C060' },
  heroGregorianDate: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: 'rgba(255,255,255,0.65)', marginTop: 4 },
  heroOdiaDate: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.white },
  heroPanchangaRow: { flexDirection: 'row', gap: Spacing[3], paddingVertical: Spacing[3], borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.12)' },
  heroPanchangaItem: { flex: 1, alignItems: 'center', gap: 3 },
  heroPanchangaLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: 'rgba(255,255,255,0.55)' },
  heroPanchangaValue: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  heroDivider: { width: 1, height: '100%', backgroundColor: 'rgba(255,255,255,0.15)' },
  heroFestivals: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  heroFestivalChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: Spacing[3], borderRadius: Radius.full, backgroundColor: 'rgba(212,168,83,0.2)', borderWidth: 1, borderColor: 'rgba(212,168,83,0.35)' },
  heroFestivalText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11, color: '#F0C060' },
  heroEmpty: { alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[4] },
  heroEmptyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: 'rgba(255,255,255,0.45)', textAlign: 'center' },

  // Date strip
  dateStripOuter: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border, paddingVertical: Spacing[2] },
  stripArrow: { width: 36, height: '100%', alignItems: 'center', justifyContent: 'center' },
  dateStripContent: { paddingHorizontal: Spacing[2], gap: Spacing[1] },
  dateChip: { width: 48, paddingVertical: Spacing[2], borderRadius: Radius.md, alignItems: 'center', gap: 3, borderWidth: 1, borderColor: 'transparent' },
  dateChipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dateChipToday: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary + '50' },
  dateChipWeekday: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary },
  dateChipNum: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  dateChipNumToday: { color: Colors.primary },
  dateChipTextSelected: { color: Colors.white },
  dateChipDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent' },
  dateChipDotFilled: { backgroundColor: Colors.success },
  dateChipDotSelected: { backgroundColor: 'rgba(255,255,255,0.6)' },

  // Detail section
  detailSection: { paddingHorizontal: Spacing[4], gap: Spacing[3] },
  detailSectionLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },

  // No entry
  noEntryCard: { alignItems: 'center', gap: Spacing[3], backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[8], borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  noEntryTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  noEntryBody: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center' },

  // Entry card
  entryCard: { backgroundColor: Colors.white, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  entryDateHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: Spacing[5], borderBottomWidth: 1, borderBottomColor: Colors.border },
  entryGregorianDate: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary },
  entryOdiaDate: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary, marginTop: 3 },
  odiaYearBadge: { paddingVertical: 4, paddingHorizontal: Spacing[3], backgroundColor: Colors.primarySurface, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.primary + '30' },
  odiaYearText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.primary },

  // Panchanga grid
  panchangaGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: Spacing[3], gap: 1, borderBottomWidth: 1, borderBottomColor: Colors.border },
  panchangaItem: { width: '33.33%', padding: Spacing[3], gap: 4 },
  panchangaLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary },
  panchangaValue: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },

  // Sun times
  sunTimesRow: { flexDirection: 'row', gap: Spacing[1], padding: Spacing[4], borderBottomWidth: 1, borderBottomColor: Colors.border },
  sunTimeItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3], backgroundColor: Colors.neutral[50], borderRadius: Radius.md, padding: Spacing[3] },
  sunTimeLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary },
  sunTimeValue: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },

  // Sections
  section: { padding: Spacing[4], borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing[3] },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  sectionTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  timingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  timingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  timingText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  festivalChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  festivalChip: { paddingVertical: Spacing[1] + 2, paddingHorizontal: Spacing[3], borderRadius: Radius.full, backgroundColor: Colors.accent + '20', borderWidth: 1, borderColor: Colors.accent + '50' },
  festivalChipText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.accent },
  descriptionText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: Typography.size.sm * 1.6 },
});

const detailStyles = StyleSheet.create({
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing[2] },
  infoLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  infoValue: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
});
