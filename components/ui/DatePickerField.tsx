import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal as RNModal, Dimensions } from 'react-native';
import { ChevronLeft, ChevronRight, Calendar, ChevronDown } from 'lucide-react-native';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isBefore,
  isAfter,
  startOfToday,
  getYear,
  getMonth,
  setYear,
  setMonth,
} from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';

type PickerView = 'day' | 'month' | 'year';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CAL_WIDTH = 264;
const CAL_HEIGHT_EST = 356;

interface Props {
  label: string;
  required?: boolean;
  value: Date | null;
  onChange: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  /** Start with the calendar already open (used inside dialogs) */
  defaultOpen?: boolean;
  /** Compact inline dropdown style for filter bars */
  compact?: boolean;
  /** Hide the field label (compact mode) */
  hideLabel?: boolean;
  /** Controlled open state — when provided, the parent decides if the calendar is visible */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Which edge of the field the dropdown aligns to */
  align?: 'left' | 'right';
}

interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function DatePickerField({ label, required, value, onChange, minDate, maxDate, defaultOpen, compact = false, hideLabel = false, open: openProp, onOpenChange, align = 'left' }: Props) {
  const [internalOpen, setInternalOpen] = useState(!!defaultOpen);
  const open = openProp !== undefined ? openProp : internalOpen;
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    const resolved = typeof next === 'function' ? next(open) : next;
    if (onOpenChange) onOpenChange(resolved);
    else setInternalOpen(resolved);
  };
  const [pickerView, setPickerView] = useState<PickerView>('day');
  const [viewMonth, setViewMonth] = useState(() => value ?? startOfToday());
  const fieldRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const today = startOfToday();
  const currentYear = getYear(today);
  const minYear = minDate ? getYear(minDate) : 1924;
  const maxYear = maxDate ? getYear(maxDate) : currentYear;

  // Year range: build array from minYear..maxYear reversed (most recent first)
  const years: number[] = [];
  for (let y = maxYear; y >= minYear; y--) years.push(y);

  const isDisabled = (d: Date) => {
    if (minDate && isBefore(d, minDate) && !isSameDay(d, minDate)) return true;
    if (maxDate && isAfter(d, maxDate) && !isSameDay(d, maxDate)) return true;
    return false;
  };

  const isMonthDisabled = (year: number, monthIdx: number) => {
    const firstDay = new Date(year, monthIdx, 1);
    const lastDay = new Date(year, monthIdx + 1, 0);
    if (minDate && isBefore(lastDay, minDate)) return true;
    if (maxDate && isAfter(firstDay, maxDate)) return true;
    return false;
  };

  const isYearDisabled = (year: number) => {
    if (minDate && year < getYear(minDate)) return true;
    if (maxDate && year > getYear(maxDate)) return true;
    return false;
  };

  const buildCalendarDays = () => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const start = startOfWeek(monthStart, { weekStartsOn: 1 });
    const end = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days: Date[] = [];
    let cur = start;
    while (cur <= end) {
      days.push(cur);
      cur = addDays(cur, 1);
    }
    return days;
  };

  const handleYearSelect = (year: number) => {
    setViewMonth(setYear(viewMonth, year));
    setPickerView('month');
  };

  const handleMonthSelect = (monthIdx: number) => {
    setViewMonth(setMonth(setYear(viewMonth, getYear(viewMonth)), monthIdx));
    setPickerView('day');
  };

  const days = buildCalendarDays();

  const handleFieldPress = () => {
    if (!open && !value) setViewMonth(startOfToday());
    setPickerView('day');
    if (compact && fieldRef.current) {
      fieldRef.current.measureInWindow((x, y, width, height) => {
        setAnchor({ x, y, width, height });
        setOpen((o) => !o);
      });
    } else {
      setOpen((o) => !o);
    }
  };

  const win = Dimensions.get('window');
  const calLeft = anchor
    ? Math.min(Math.max(8, align === 'right' ? anchor.x + anchor.width - CAL_WIDTH : anchor.x), Math.max(8, win.width - CAL_WIDTH - 8))
    : 0;
  const calTop = anchor
    ? anchor.y + anchor.height + 6 + CAL_HEIGHT_EST > win.height
      ? Math.max(8, anchor.y - CAL_HEIGHT_EST - 6)
      : anchor.y + anchor.height + 6
    : 0;

  const calendarBody = (
    <>
      {/* ── Header ── */}
      <View style={styles.calHeader}>
        {pickerView === 'day' && (
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => setViewMonth(subMonths(viewMonth, 1))}
          >
            <ChevronLeft size={18} color={Colors.textPrimary} />
          </TouchableOpacity>
        )}
        {pickerView === 'month' && (
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => setPickerView('year')}
          >
            <ChevronLeft size={18} color={Colors.textPrimary} />
          </TouchableOpacity>
        )}
        {pickerView === 'year' && <View style={styles.navBtn} />}

        {/* Tappable title — drills up through views */}
        <TouchableOpacity
          style={styles.headerTitleBtn}
          onPress={() => {
            if (pickerView === 'day') setPickerView('month');
            else if (pickerView === 'month') setPickerView('year');
          }}
          activeOpacity={pickerView === 'year' ? 1 : 0.7}
        >
          <Text style={styles.monthLabel}>
            {pickerView === 'day'
              ? format(viewMonth, 'MMMM yyyy')
              : pickerView === 'month'
              ? format(viewMonth, 'yyyy')
              : 'Select Year'}
          </Text>
          {pickerView !== 'year' && (
            <ChevronDown size={14} color={Colors.primary} style={{ marginLeft: 4 }} />
          )}
        </TouchableOpacity>

        {pickerView === 'day' && (
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => setViewMonth(addMonths(viewMonth, 1))}
          >
            <ChevronRight size={18} color={Colors.textPrimary} />
          </TouchableOpacity>
        )}
        {pickerView === 'month' && (
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => setViewMonth(setYear(viewMonth, getYear(viewMonth) + 1))}
          >
            <ChevronRight size={18} color={Colors.textPrimary} />
          </TouchableOpacity>
        )}
        {pickerView === 'year' && <View style={styles.navBtn} />}
      </View>

      {/* ── Year grid ── */}
      {pickerView === 'year' && (
        <ScrollView
          style={styles.yearScroll}
          contentContainerStyle={styles.yearScrollContent}
          showsVerticalScrollIndicator
          nestedScrollEnabled
          scrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.yearGrid}>
            {years.map((y) => {
              const sel = getYear(viewMonth) === y;
              const dis = isYearDisabled(y);
              return (
                <TouchableOpacity
                  key={y}
                  style={[styles.yearCell, sel && styles.yearCellSelected, dis && styles.cellDisabled]}
                  onPress={() => { if (!dis) handleYearSelect(y); }}
                  activeOpacity={dis ? 1 : 0.7}
                >
                  <Text style={[styles.yearText, sel && styles.yearTextSelected, dis && styles.textDisabled]}>
                    {y}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* ── Month grid ── */}
      {pickerView === 'month' && (
        <View style={styles.monthGrid}>
          {MONTHS.map((m, idx) => {
            const sel = getMonth(viewMonth) === idx && getYear(viewMonth) === getYear(viewMonth);
            const dis = isMonthDisabled(getYear(viewMonth), idx);
            return (
              <TouchableOpacity
                key={m}
                style={[styles.monthCell, sel && styles.monthCellSelected, dis && styles.cellDisabled]}
                onPress={() => { if (!dis) handleMonthSelect(idx); }}
                activeOpacity={dis ? 1 : 0.7}
              >
                <Text style={[styles.monthText, sel && styles.monthTextSelected, dis && styles.textDisabled]}>
                  {m}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── Day grid ── */}
      {pickerView === 'day' && (
        <>
          <View style={styles.weekRow}>
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
              <Text key={d} style={styles.weekDay}>{d}</Text>
            ))}
          </View>
          <View style={styles.daysGrid}>
            {days.map((d, i) => {
              const outside = !isSameMonth(d, viewMonth);
              const disabled = isDisabled(d);
              const selected = value ? isSameDay(d, value) : false;
              const isToday = isSameDay(d, today);
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.dayCell,
                    selected && styles.dayCellSelected,
                    isToday && !selected && styles.dayCellToday,
                    (disabled || outside) && styles.dayCellDisabled,
                  ]}
                  onPress={() => {
                    if (disabled || outside) return;
                    // Normalize to local midnight to prevent any timezone shift
                    onChange(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
                    setOpen(false);
                  }}
                  activeOpacity={disabled || outside ? 1 : 0.7}
                >
                  <Text
                    style={[
                      styles.dayText,
                      selected && styles.dayTextSelected,
                      isToday && !selected && styles.dayTextToday,
                      (disabled || outside) && styles.dayTextDisabled,
                    ]}
                  >
                    {format(d, 'd')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}
    </>
  );

  return (
    <View style={compact ? [styles.wrapper, styles.wrapperCompact] : styles.wrapper}>
      {!hideLabel && (
        <Text style={compact ? styles.labelCompact : styles.label}>{label}{required ? <Text style={styles.req}> *</Text> : null}</Text>
      )}
      <View ref={compact ? fieldRef : undefined}>
      <TouchableOpacity
        style={[
          styles.fieldBtn,
          open && styles.fieldBtnOpen,
          compact && [styles.fieldBtnCompact, (open || value) && styles.fieldBtnCompactActive],
        ]}
        onPress={handleFieldPress}
        activeOpacity={0.7}
      >
        <Calendar size={compact ? 14 : 16} color={value || open ? Colors.primary : Colors.textTertiary} strokeWidth={2} />
        {compact ? (
          <>
            <Text style={[styles.compactLabelText, value && styles.compactLabelTextActive]}>{label}</Text>
            {value && (
              <Text style={styles.compactValueText}>{format(value, 'dd MMM yy')}</Text>
            )}
          </>
        ) : (
          <Text
            style={[styles.fieldText, !value && styles.fieldPlaceholder]}
            numberOfLines={1}
          >
            {value ? format(value, 'dd MMM yyyy') : label}
          </Text>
        )}
        <ChevronDown
          size={compact ? 14 : 16}
          color={value || open ? Colors.primary : Colors.textTertiary}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
      </TouchableOpacity>

      {!compact && open && (
        <View style={styles.calendar}>
          {calendarBody}
        </View>
      )}
      </View>

      {compact && (
        <RNModal
          visible={open}
          transparent
          animationType="fade"
          onRequestClose={() => setOpen(false)}
          statusBarTranslucent
        >
          <TouchableOpacity style={styles.overlayBackdrop} activeOpacity={1} onPress={() => setOpen(false)}>
            <View
              style={[styles.calendarCompact, { top: calTop, left: calLeft }]}
              onStartShouldSetResponder={() => true}
            >
              {calendarBody}
            </View>
          </TouchableOpacity>
        </RNModal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing[2] },
  wrapperCompact: { gap: 0 },
  labelCompact: { display: 'none' },
  label: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  req: { color: Colors.error },
  fieldBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    backgroundColor: Colors.white,
  },
  fieldBtnOpen: { borderColor: Colors.primary },
  fieldBtnCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    height: 36,
    backgroundColor: Colors.white,
  },
  fieldBtnCompactActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  compactLabelText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  compactLabelTextActive: { color: Colors.primary },
  compactValueText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  calendarCompact: {
    position: 'absolute',
    zIndex: 1000,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing[3],
    gap: Spacing[2],
    width: CAL_WIDTH,
    ...Shadow.lg,
  },
  fieldText: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  fieldPlaceholder: {
    color: Colors.textTertiary,
    fontFamily: Typography.fontFamily.sansRegular,
  },
  calendar: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing[3],
    gap: Spacing[2],
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[1],
    paddingBottom: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    marginBottom: Spacing[1],
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: Colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[2],
    paddingVertical: Spacing[1],
    borderRadius: Radius.sm,
  },
  monthLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.primary,
  },

  // Year picker
  yearScroll: {
    maxHeight: 320,
    minHeight: 120,
  },
  yearScrollContent: {
    flexGrow: 1,
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
    justifyContent: 'center',
    paddingVertical: Spacing[1],
  },
  yearCell: {
    width: 62,
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.neutral[50],
  },
  yearCellSelected: { backgroundColor: Colors.primary },
  yearText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  yearTextSelected: {
    color: Colors.white,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },

  // Month picker
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
    justifyContent: 'center',
    paddingVertical: Spacing[1],
  },
  monthCell: {
    width: 68,
    paddingVertical: Spacing[3],
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.neutral[50],
  },
  monthCellSelected: { backgroundColor: Colors.primary },
  monthText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  monthTextSelected: {
    color: Colors.white,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },

  cellDisabled: { opacity: 0.35 },
  textDisabled: { color: Colors.textDisabled },

  // Day picker
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: Spacing[1],
  },
  weekDay: {
    width: 32,
    textAlign: 'center',
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    gap: 2,
  },
  dayCell: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellSelected: { backgroundColor: Colors.primary },
  dayCellToday: { borderWidth: 1.5, borderColor: Colors.primary },
  dayCellDisabled: { opacity: 0.3 },
  dayText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  dayTextSelected: {
    color: Colors.white,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  dayTextToday: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  dayTextDisabled: { color: Colors.textDisabled },
});
