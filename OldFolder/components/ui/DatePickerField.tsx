import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
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
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';

type View = 'day' | 'month' | 'year';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Props {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
}

export default function DatePickerField({ label, value, onChange, minDate, maxDate }: Props) {
  const [open, setOpen] = useState(false);
  const [pickerView, setPickerView] = useState<View>('day');
  const [viewMonth, setViewMonth] = useState(() => {
    if (value) return value;
    if (minDate) return minDate;
    const d = startOfToday();
    d.setFullYear(d.getFullYear() - 25);
    return d;
  });

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

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.fieldBtn, open && styles.fieldBtnOpen]}
        onPress={() => { setOpen((o) => !o); setPickerView('day'); }}
        activeOpacity={0.7}
      >
        <Calendar size={16} color={value ? Colors.primary : Colors.textTertiary} />
        <Text style={[styles.fieldText, !value && styles.fieldPlaceholder]}>
          {value ? format(value, 'dd MMM yyyy') : 'Select date'}
        </Text>
        <ChevronDown
          size={16}
          color={Colors.textTertiary}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
      </TouchableOpacity>

      {open && (
        <View style={styles.calendar}>
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
            <ScrollView style={styles.yearScroll} showsVerticalScrollIndicator={false}>
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
                        onChange(d);
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
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing[2] },
  label: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
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
  yearScroll: { maxHeight: 200 },
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
