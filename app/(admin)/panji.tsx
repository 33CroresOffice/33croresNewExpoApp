import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, Switch, Platform,
} from 'react-native';
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, X, Check,
  Upload, Download, Eye, EyeOff, Save, Trash2, TriangleAlert as AlertTriangle,
  CircleCheck as CheckCircle, FileText, RefreshCw,
} from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { PanjiEntry } from '@/types/database';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, addMonths, subMonths, isSameMonth, isToday,
} from 'date-fns';

const ODIA_MONTHS = [
  'Baisakha', 'Jyestha', 'Ashadha', 'Shravana', 'Bhadra', 'Ashwina',
  'Kartika', 'Margashira', 'Pausha', 'Magha', 'Phalguna', 'Chaitra',
];

const ODIA_WEEKDAYS = ['Rabibara', 'Somabara', 'Mangalabara', 'Budhavara', 'Gurubara', 'Shukrabara', 'Shanibara'];

const CSV_TEMPLATE_HEADERS = [
  'date', 'odia_date', 'odia_month', 'odia_year', 'tithi', 'nakshatra',
  'yoga', 'karana', 'vara', 'sunrise', 'sunset',
  'auspicious_timings (semicolon separated)', 'festivals (semicolon separated)', 'description',
].join(',');

const CSV_EXAMPLE_ROW = [
  '2026-05-01', '8 Baisakha 1948', 'Baisakha', '1948', 'Ashtami', 'Punarvasu',
  'Shobhana', 'Bava', 'Shukrabara', '05:45 AM', '06:32 PM',
  '06:00-07:00 Amrita;10:30-11:30 Shubha', 'Akshaya Tritiya', '',
].join(',');

type EntryMap = Record<string, PanjiEntry>;

interface ParsedRow {
  row: number;
  data: Partial<PanjiEntry>;
  errors: string[];
}

function emptyForm(): Partial<PanjiEntry> {
  return {
    odia_date: '', odia_month: ODIA_MONTHS[0], odia_year: 1947,
    tithi: '', nakshatra: '', yoga: '', karana: '',
    vara: ODIA_WEEKDAYS[0], sunrise: '', sunset: '',
    auspicious_timings: [], festivals: [], description: '', is_published: false,
  };
}

export default function PanjiScreen() {
  return (
    <ModuleGuard module="panji">
      <PanjiContent />
    </ModuleGuard>
  );
}

function PanjiContent() {
  const { profile } = useAuthStore();

  const [viewMonth, setViewMonth] = useState(new Date());
  const [entryMap, setEntryMap] = useState<EntryMap>({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<PanjiEntry>>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Tag input state
  const [timingInput, setTimingInput] = useState('');
  const [festivalInput, setFestivalInput] = useState('');

  // Bulk import modal
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importParsed, setImportParsed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; updated: number } | null>(null);

  // ── Load entries for current month ──────────────────────────────────────────
  const loadMonth = useCallback(async (month: Date) => {
    setLoading(true);
    const start = format(startOfMonth(month), 'yyyy-MM-dd');
    const end = format(endOfMonth(month), 'yyyy-MM-dd');
    const { data } = await supabase
      .from('panji_entries')
      .select('*')
      .gte('date', start)
      .lte('date', end)
      .order('date');
    if (data) {
      const map: EntryMap = {};
      for (const e of data) map[e.date] = e as PanjiEntry;
      setEntryMap(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadMonth(viewMonth); }, [viewMonth, loadMonth]);

  // ── Select a day ─────────────────────────────────────────────────────────────
  const selectDay = (dateStr: string) => {
    setSelectedDate(dateStr);
    setSaveMsg(null);
    setTimingInput('');
    setFestivalInput('');
    const existing = entryMap[dateStr];
    if (existing) {
      setForm({ ...existing });
    } else {
      const d = new Date(dateStr + 'T00:00:00');
      setForm({ ...emptyForm(), vara: ODIA_WEEKDAYS[getDay(d)] });
    }
  };

  // ── Save entry ───────────────────────────────────────────────────────────────
  const saveEntry = async () => {
    if (!selectedDate) return;
    setSaving(true);
    setSaveMsg(null);
    const payload = {
      ...form,
      date: selectedDate,
      updated_by: profile?.id,
    };
    const existing = entryMap[selectedDate];
    let error: any;
    if (existing) {
      const res = await supabase.from('panji_entries').update(payload).eq('id', existing.id).select().single();
      error = res.error;
      if (!error && res.data) setEntryMap((m) => ({ ...m, [selectedDate]: res.data as PanjiEntry }));
    } else {
      const res = await supabase.from('panji_entries').insert({ ...payload, created_by: profile?.id }).select().single();
      error = res.error;
      if (!error && res.data) setEntryMap((m) => ({ ...m, [selectedDate]: res.data as PanjiEntry }));
    }
    setSaving(false);
    setSaveMsg(error ? { text: error.message, ok: false } : { text: 'Saved successfully', ok: true });
  };

  // ── Delete entry ─────────────────────────────────────────────────────────────
  const deleteEntry = async () => {
    if (!selectedDate || !entryMap[selectedDate]) return;
    setDeleting(true);
    const { error } = await supabase.from('panji_entries').delete().eq('id', entryMap[selectedDate].id);
    if (!error) {
      setEntryMap((m) => { const n = { ...m }; delete n[selectedDate]; return n; });
      setForm(emptyForm());
      setSaveMsg({ text: 'Entry deleted', ok: true });
    }
    setDeleting(false);
  };

  // ── CSV parse ────────────────────────────────────────────────────────────────
  const parseCSV = () => {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) { setParsedRows([]); setImportParsed(true); return; }
    const rows: ParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const errors: string[] = [];
      const dateStr = cols[0]?.trim();
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) errors.push('Invalid date format (use YYYY-MM-DD)');
      const year = parseInt(cols[3]?.trim() ?? '0', 10);
      if (isNaN(year) || year < 1800 || year > 2100) errors.push('Invalid odia_year');
      rows.push({
        row: i,
        errors,
        data: {
          date: dateStr,
          odia_date: cols[1]?.trim() ?? '',
          odia_month: cols[2]?.trim() ?? '',
          odia_year: year,
          tithi: cols[4]?.trim() ?? '',
          nakshatra: cols[5]?.trim() ?? '',
          yoga: cols[6]?.trim() ?? '',
          karana: cols[7]?.trim() ?? '',
          vara: cols[8]?.trim() ?? '',
          sunrise: cols[9]?.trim() ?? '',
          sunset: cols[10]?.trim() ?? '',
          auspicious_timings: cols[11]?.trim() ? cols[11].trim().split(';').map((s) => s.trim()).filter(Boolean) : [],
          festivals: cols[12]?.trim() ? cols[12].trim().split(';').map((s) => s.trim()).filter(Boolean) : [],
          description: cols[13]?.trim() ?? '',
        },
      });
    }
    setParsedRows(rows);
    setImportParsed(true);
  };

  // ── Bulk import ──────────────────────────────────────────────────────────────
  const doImport = async () => {
    const valid = parsedRows.filter((r) => r.errors.length === 0);
    if (valid.length === 0) return;
    setImporting(true);
    let imported = 0; let updated = 0; let skipped = 0;
    for (const row of valid) {
      const payload = { ...row.data, updated_by: profile?.id };
      const { data: existing } = await supabase
        .from('panji_entries').select('id').eq('date', row.data.date!).maybeSingle();
      if (existing) {
        const { error } = await supabase.from('panji_entries').update(payload).eq('id', existing.id);
        error ? skipped++ : updated++;
      } else {
        const { error } = await supabase.from('panji_entries').insert({ ...payload, created_by: profile?.id });
        error ? skipped++ : imported++;
      }
    }
    setImportResult({ imported, updated, skipped: skipped + parsedRows.filter((r) => r.errors.length > 0).length });
    setImporting(false);
    loadMonth(viewMonth);
  };

  const closeImport = () => {
    setShowImport(false);
    setCsvText('');
    setParsedRows([]);
    setImportParsed(false);
    setImportResult(null);
  };

  const downloadTemplate = () => {
    if (Platform.OS !== 'web') return;
    const content = CSV_TEMPLATE_HEADERS + '\n' + CSV_EXAMPLE_ROW;
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'panji_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Calendar grid ────────────────────────────────────────────────────────────
  const days = eachDayOfInterval({ start: startOfMonth(viewMonth), end: endOfMonth(viewMonth) });
  const firstDayOfWeek = getDay(startOfMonth(viewMonth));
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const getDayStatus = (dateStr: string): 'published' | 'draft' | 'none' => {
    const e = entryMap[dateStr];
    if (!e) return 'none';
    return e.is_published ? 'published' : 'draft';
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <CalendarDays size={22} color={Colors.primary} />
          <View>
            <Text style={styles.headerTitle}>Odia Panji Manager</Text>
            <Text style={styles.headerSub}>Create and publish daily Panji entries</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => loadMonth(viewMonth)}>
            <RefreshCw size={16} color={Colors.textSecondary} strokeWidth={1.8} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.importBtn} onPress={() => setShowImport(true)}>
            <Upload size={15} color={Colors.white} />
            <Text style={styles.importBtnText}>Bulk Import</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.body}>
        {/* ── Left: Calendar ── */}
        <View style={styles.calPanel}>
          {/* Month navigator */}
          <View style={styles.monthNav}>
            <TouchableOpacity style={styles.navArrow} onPress={() => setViewMonth((m) => subMonths(m, 1))}>
              <ChevronLeft size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>{format(viewMonth, 'MMMM yyyy')}</Text>
            <TouchableOpacity style={styles.navArrow} onPress={() => setViewMonth((m) => addMonths(m, 1))}>
              <ChevronRight size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Weekday headers */}
          <View style={styles.weekRow}>
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d) => (
              <Text key={d} style={styles.weekDayLabel}>{d}</Text>
            ))}
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.success }]} /><Text style={styles.legendText}>Published</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.warning }]} /><Text style={styles.legendText}>Draft</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.neutral[300] }]} /><Text style={styles.legendText}>Empty</Text></View>
          </View>

          {/* Calendar grid */}
          {loading ? (
            <View style={styles.calLoading}><ActivityIndicator color={Colors.primary} /></View>
          ) : (
            <View style={styles.calGrid}>
              {/* empty leading cells */}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <View key={`empty-${i}`} style={styles.calCell} />
              ))}
              {days.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const status = getDayStatus(dateStr);
                const isSelected = selectedDate === dateStr;
                const isT = isToday(day);
                return (
                  <TouchableOpacity
                    key={dateStr}
                    style={[
                      styles.calCell,
                      isSelected && styles.calCellSelected,
                      isT && !isSelected && styles.calCellToday,
                    ]}
                    onPress={() => selectDay(dateStr)}
                  >
                    <Text style={[
                      styles.calDayNum,
                      isSelected && styles.calDayNumSelected,
                      isT && !isSelected && styles.calDayNumToday,
                    ]}>
                      {format(day, 'd')}
                    </Text>
                    <View style={[
                      styles.calDot,
                      status === 'published' && { backgroundColor: Colors.success },
                      status === 'draft' && { backgroundColor: Colors.warning },
                      status === 'none' && { backgroundColor: 'transparent' },
                    ]} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Stats */}
          <View style={styles.calStats}>
            <View style={styles.statPill}>
              <Text style={styles.statNum}>{Object.values(entryMap).filter((e) => e.is_published).length}</Text>
              <Text style={styles.statLabel}>Published</Text>
            </View>
            <View style={styles.statPill}>
              <Text style={styles.statNum}>{Object.values(entryMap).filter((e) => !e.is_published).length}</Text>
              <Text style={styles.statLabel}>Draft</Text>
            </View>
            <View style={styles.statPill}>
              <Text style={styles.statNum}>{days.length - Object.keys(entryMap).length}</Text>
              <Text style={styles.statLabel}>Empty</Text>
            </View>
          </View>
        </View>

        {/* ── Right: Entry Editor ── */}
        {selectedDate ? (
          <ScrollView style={styles.editorPanel} contentContainerStyle={styles.editorContent}>
            {/* Editor header */}
            <View style={styles.editorHeader}>
              <View>
                <Text style={styles.editorDate}>{format(new Date(selectedDate + 'T00:00:00'), 'EEEE, d MMMM yyyy')}</Text>
                {entryMap[selectedDate] && (
                  <Text style={styles.editorMeta}>
                    Last edited {format(new Date(entryMap[selectedDate].updated_at), 'd MMM yyyy, h:mm a')}
                  </Text>
                )}
              </View>
              <View style={styles.editorHeaderRight}>
                {entryMap[selectedDate] && (
                  <TouchableOpacity style={styles.deleteBtn} onPress={deleteEntry} disabled={deleting}>
                    {deleting ? <ActivityIndicator size="small" color={Colors.error} /> : <Trash2 size={15} color={Colors.error} />}
                  </TouchableOpacity>
                )}
                <View style={styles.publishRow}>
                  <Text style={styles.publishLabel}>{form.is_published ? 'Published' : 'Draft'}</Text>
                  <Switch
                    value={form.is_published ?? false}
                    onValueChange={(v) => setForm((p) => ({ ...p, is_published: v }))}
                    trackColor={{ false: Colors.neutral[200], true: Colors.success + '60' }}
                    thumbColor={form.is_published ? Colors.success : Colors.neutral[400]}
                  />
                </View>
              </View>
            </View>

            {saveMsg && (
              <View style={[styles.saveMsg, saveMsg.ok ? styles.saveMsgOk : styles.saveMsgErr]}>
                {saveMsg.ok ? <CheckCircle size={14} color={Colors.success} /> : <AlertTriangle size={14} color={Colors.error} />}
                <Text style={[styles.saveMsgText, { color: saveMsg.ok ? Colors.success : Colors.error }]}>{saveMsg.text}</Text>
              </View>
            )}

            {/* Odia Date Info */}
            <View style={styles.fieldGroup}>
              <Text style={styles.groupTitle}>Odia Date</Text>
              <View style={styles.fieldRow}>
                <View style={[styles.field, { flex: 2 }]}>
                  <Text style={styles.fieldLabel}>Odia Date (text)</Text>
                  <TextInput style={styles.input} value={form.odia_date} onChangeText={(v) => setForm((p) => ({ ...p, odia_date: v }))} placeholder="e.g. 8 Baisakha 1948" placeholderTextColor={Colors.textDisabled} />
                </View>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Odia Year</Text>
                  <TextInput style={styles.input} value={String(form.odia_year ?? '')} onChangeText={(v) => setForm((p) => ({ ...p, odia_year: parseInt(v, 10) || 0 }))} placeholder="1948" placeholderTextColor={Colors.textDisabled} keyboardType="numeric" />
                </View>
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Odia Month</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {ODIA_MONTHS.map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.chip, form.odia_month === m && styles.chipSelected]}
                      onPress={() => setForm((p) => ({ ...p, odia_month: m }))}
                    >
                      <Text style={[styles.chipText, form.odia_month === m && styles.chipTextSelected]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* Panchanga fields */}
            <View style={styles.fieldGroup}>
              <Text style={styles.groupTitle}>Panchanga</Text>
              <View style={styles.fieldRow}>
                {(['tithi', 'nakshatra', 'yoga', 'karana'] as const).map((key) => (
                  <View key={key} style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>{key.charAt(0).toUpperCase() + key.slice(1)}</Text>
                    <TextInput style={styles.input} value={form[key]} onChangeText={(v) => setForm((p) => ({ ...p, [key]: v }))} placeholder={key} placeholderTextColor={Colors.textDisabled} />
                  </View>
                ))}
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Vara (Weekday)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {ODIA_WEEKDAYS.map((w) => (
                    <TouchableOpacity
                      key={w}
                      style={[styles.chip, form.vara === w && styles.chipSelected]}
                      onPress={() => setForm((p) => ({ ...p, vara: w }))}
                    >
                      <Text style={[styles.chipText, form.vara === w && styles.chipTextSelected]}>{w}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* Sunrise / Sunset */}
            <View style={styles.fieldGroup}>
              <Text style={styles.groupTitle}>Sun Times</Text>
              <View style={styles.fieldRow}>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Sunrise</Text>
                  <TextInput style={styles.input} value={form.sunrise} onChangeText={(v) => setForm((p) => ({ ...p, sunrise: v }))} placeholder="05:45 AM" placeholderTextColor={Colors.textDisabled} />
                </View>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Sunset</Text>
                  <TextInput style={styles.input} value={form.sunset} onChangeText={(v) => setForm((p) => ({ ...p, sunset: v }))} placeholder="06:32 PM" placeholderTextColor={Colors.textDisabled} />
                </View>
              </View>
            </View>

            {/* Auspicious Timings */}
            <View style={styles.fieldGroup}>
              <Text style={styles.groupTitle}>Auspicious Timings</Text>
              <View style={styles.tagInputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={timingInput}
                  onChangeText={setTimingInput}
                  placeholder="e.g. 06:00-07:00 Amrita"
                  placeholderTextColor={Colors.textDisabled}
                  onSubmitEditing={() => {
                    if (timingInput.trim()) {
                      setForm((p) => ({ ...p, auspicious_timings: [...(p.auspicious_timings ?? []), timingInput.trim()] }));
                      setTimingInput('');
                    }
                  }}
                />
                <TouchableOpacity style={styles.addTagBtn} onPress={() => {
                  if (timingInput.trim()) {
                    setForm((p) => ({ ...p, auspicious_timings: [...(p.auspicious_timings ?? []), timingInput.trim()] }));
                    setTimingInput('');
                  }
                }}>
                  <Plus size={16} color={Colors.white} />
                </TouchableOpacity>
              </View>
              <View style={styles.tagList}>
                {(form.auspicious_timings ?? []).map((t, i) => (
                  <View key={i} style={styles.tag}>
                    <Text style={styles.tagText}>{t}</Text>
                    <TouchableOpacity onPress={() => setForm((p) => ({ ...p, auspicious_timings: (p.auspicious_timings ?? []).filter((_, j) => j !== i) }))}>
                      <X size={12} color={Colors.primary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>

            {/* Festivals */}
            <View style={styles.fieldGroup}>
              <Text style={styles.groupTitle}>Festivals & Vratas</Text>
              <View style={styles.tagInputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={festivalInput}
                  onChangeText={setFestivalInput}
                  placeholder="e.g. Akshaya Tritiya"
                  placeholderTextColor={Colors.textDisabled}
                  onSubmitEditing={() => {
                    if (festivalInput.trim()) {
                      setForm((p) => ({ ...p, festivals: [...(p.festivals ?? []), festivalInput.trim()] }));
                      setFestivalInput('');
                    }
                  }}
                />
                <TouchableOpacity style={styles.addTagBtn} onPress={() => {
                  if (festivalInput.trim()) {
                    setForm((p) => ({ ...p, festivals: [...(p.festivals ?? []), festivalInput.trim()] }));
                    setFestivalInput('');
                  }
                }}>
                  <Plus size={16} color={Colors.white} />
                </TouchableOpacity>
              </View>
              <View style={styles.tagList}>
                {(form.festivals ?? []).map((f, i) => (
                  <View key={i} style={[styles.tag, styles.tagFestival]}>
                    <Text style={[styles.tagText, { color: Colors.secondary }]}>{f}</Text>
                    <TouchableOpacity onPress={() => setForm((p) => ({ ...p, festivals: (p.festivals ?? []).filter((_, j) => j !== i) }))}>
                      <X size={12} color={Colors.secondary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>

            {/* Description */}
            <View style={styles.fieldGroup}>
              <Text style={styles.groupTitle}>Admin Notes</Text>
              <TextInput
                style={[styles.input, styles.inputMulti]}
                value={form.description}
                onChangeText={(v) => setForm((p) => ({ ...p, description: v }))}
                placeholder="Any additional notes..."
                placeholderTextColor={Colors.textDisabled}
                multiline
              />
            </View>

            {/* Save button */}
            <TouchableOpacity style={styles.saveBtn} onPress={saveEntry} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <><Save size={16} color={Colors.white} /><Text style={styles.saveBtnText}>Save Entry</Text></>
              }
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <View style={styles.emptyEditor}>
            <CalendarDays size={40} color={Colors.neutral[300]} strokeWidth={1.5} />
            <Text style={styles.emptyEditorTitle}>Select a date</Text>
            <Text style={styles.emptyEditorSub}>Click any day on the calendar to create or edit its Panji entry</Text>
          </View>
        )}
      </View>

      {/* ── Bulk Import Modal ── */}
      <Modal visible={showImport} transparent animationType="fade" onRequestClose={closeImport}>
        <View style={styles.overlay}>
          <View style={styles.importModal}>
            <View style={styles.modalTop}>
              <View style={styles.modalTopLeft}>
                <Upload size={18} color={Colors.primary} />
                <Text style={styles.modalTitle}>Bulk Import Panji Entries</Text>
              </View>
              <TouchableOpacity onPress={closeImport}><X size={20} color={Colors.textSecondary} /></TouchableOpacity>
            </View>

            {importResult ? (
              <View style={styles.importResult}>
                <CheckCircle size={40} color={Colors.success} />
                <Text style={styles.importResultTitle}>Import Complete</Text>
                <View style={styles.importResultStats}>
                  <View style={styles.importStat}><Text style={[styles.importStatNum, { color: Colors.success }]}>{importResult.imported}</Text><Text style={styles.importStatLabel}>New entries</Text></View>
                  <View style={styles.importStat}><Text style={[styles.importStatNum, { color: Colors.primary }]}>{importResult.updated}</Text><Text style={styles.importStatLabel}>Updated</Text></View>
                  <View style={styles.importStat}><Text style={[styles.importStatNum, { color: Colors.error }]}>{importResult.skipped}</Text><Text style={styles.importStatLabel}>Skipped</Text></View>
                </View>
                <TouchableOpacity style={styles.saveBtn} onPress={closeImport}>
                  <Text style={styles.saveBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Template download */}
                <View style={styles.importSection}>
                  <Text style={styles.importSectionTitle}>1. Download Template</Text>
                  <Text style={styles.importSectionHint}>
                    CSV format: date, odia_date, odia_month, odia_year, tithi, nakshatra, yoga, karana, vara, sunrise, sunset, auspicious_timings (semicolons), festivals (semicolons), description
                  </Text>
                  {Platform.OS === 'web' && (
                    <TouchableOpacity style={styles.templateBtn} onPress={downloadTemplate}>
                      <Download size={14} color={Colors.primary} />
                      <Text style={styles.templateBtnText}>Download CSV Template</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* CSV paste area */}
                <View style={styles.importSection}>
                  <Text style={styles.importSectionTitle}>2. Paste CSV Data</Text>
                  <TextInput
                    style={styles.csvInput}
                    value={csvText}
                    onChangeText={(v) => { setCsvText(v); setImportParsed(false); setParsedRows([]); }}
                    placeholder={`${CSV_TEMPLATE_HEADERS}\n${CSV_EXAMPLE_ROW}`}
                    placeholderTextColor={Colors.textDisabled}
                    multiline
                  />
                  <TouchableOpacity
                    style={[styles.saveBtn, { marginTop: Spacing[3] }]}
                    onPress={parseCSV}
                    disabled={!csvText.trim()}
                  >
                    <FileText size={15} color={Colors.white} />
                    <Text style={styles.saveBtnText}>Validate & Preview</Text>
                  </TouchableOpacity>
                </View>

                {/* Preview table */}
                {importParsed && parsedRows.length > 0 && (
                  <View style={styles.importSection}>
                    <Text style={styles.importSectionTitle}>3. Preview ({parsedRows.length} rows)</Text>
                    <View style={styles.previewHeader}>
                      <Text style={[styles.previewCell, { flex: 1.2 }]}>Date</Text>
                      <Text style={[styles.previewCell, { flex: 1.5 }]}>Odia Date</Text>
                      <Text style={[styles.previewCell, { flex: 1 }]}>Tithi</Text>
                      <Text style={[styles.previewCell, { flex: 1 }]}>Festivals</Text>
                      <Text style={[styles.previewCell, { width: 60 }]}>Status</Text>
                    </View>
                    {parsedRows.map((row) => (
                      <View key={row.row} style={[styles.previewRow, row.errors.length > 0 && styles.previewRowError]}>
                        <Text style={[styles.previewCell, { flex: 1.2 }]} numberOfLines={1}>{row.data.date}</Text>
                        <Text style={[styles.previewCell, { flex: 1.5 }]} numberOfLines={1}>{row.data.odia_date}</Text>
                        <Text style={[styles.previewCell, { flex: 1 }]} numberOfLines={1}>{row.data.tithi}</Text>
                        <Text style={[styles.previewCell, { flex: 1 }]} numberOfLines={1}>{(row.data.festivals ?? []).join(', ')}</Text>
                        <View style={[{ width: 60 }, styles.previewCellCenter]}>
                          {row.errors.length === 0
                            ? <Check size={13} color={Colors.success} />
                            : <AlertTriangle size={13} color={Colors.error} />
                          }
                        </View>
                        {row.errors.length > 0 && (
                          <Text style={styles.previewError}>{row.errors.join('; ')}</Text>
                        )}
                      </View>
                    ))}

                    {/* Summary */}
                    <View style={styles.previewSummary}>
                      <Text style={styles.previewSummaryText}>
                        <Text style={{ color: Colors.success }}>{parsedRows.filter((r) => r.errors.length === 0).length} valid</Text>
                        {' · '}
                        <Text style={{ color: Colors.error }}>{parsedRows.filter((r) => r.errors.length > 0).length} with errors (will be skipped)</Text>
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[styles.saveBtn, parsedRows.filter((r) => r.errors.length === 0).length === 0 && styles.saveBtnDisabled]}
                      onPress={doImport}
                      disabled={importing || parsedRows.filter((r) => r.errors.length === 0).length === 0}
                    >
                      {importing
                        ? <ActivityIndicator size="small" color={Colors.white} />
                        : <><Upload size={15} color={Colors.white} /><Text style={styles.saveBtnText}>Import {parsedRows.filter((r) => r.errors.length === 0).length} Entries</Text></>
                      }
                    </TouchableOpacity>
                  </View>
                )}

                {importParsed && parsedRows.length === 0 && (
                  <View style={styles.importSection}>
                    <Text style={styles.importSectionHint}>No rows found in the CSV. Make sure it includes a header row and at least one data row.</Text>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[6], paddingVertical: Spacing[5],
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  headerTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  headerSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: Spacing[2], alignItems: 'center' },
  iconBtn: { width: 36, height: 36, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white },
  importBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], backgroundColor: Colors.primary, borderRadius: Radius.md },
  importBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },

  body: { flex: 1, flexDirection: 'row' },

  // Calendar panel
  calPanel: {
    width: 320, backgroundColor: Colors.white, borderRightWidth: 1, borderRightColor: Colors.border,
    padding: Spacing[4],
  },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[3] },
  navArrow: { width: 32, height: 32, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  weekRow: { flexDirection: 'row', marginBottom: Spacing[1] },
  weekDayLabel: { width: `${100/7}%` as any, textAlign: 'center', fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textTertiary, paddingVertical: Spacing[1] },
  legend: { flexDirection: 'row', gap: Spacing[3], marginBottom: Spacing[3], justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary },
  calLoading: { height: 180, alignItems: 'center', justifyContent: 'center' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100/7}%` as any, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm, gap: 2 },
  calCellSelected: { backgroundColor: Colors.primary },
  calCellToday: { backgroundColor: Colors.primarySurface },
  calDayNum: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  calDayNumSelected: { color: Colors.white },
  calDayNumToday: { color: Colors.primary },
  calDot: { width: 5, height: 5, borderRadius: 3 },
  calStats: { flexDirection: 'row', gap: Spacing[2], marginTop: Spacing[4], justifyContent: 'center' },
  statPill: { flex: 1, alignItems: 'center', padding: Spacing[2], backgroundColor: Colors.neutral[50], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  statNum: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  statLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary },

  // Editor panel
  editorPanel: { flex: 1, backgroundColor: Colors.background },
  editorContent: { padding: Spacing[6], gap: Spacing[4] },
  editorHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border },
  editorDate: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  editorMeta: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 3 },
  editorHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  deleteBtn: { width: 32, height: 32, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.errorSurface, backgroundColor: Colors.errorSurface, alignItems: 'center', justifyContent: 'center' },
  publishRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  publishLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  saveMsg: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], padding: Spacing[3], borderRadius: Radius.md, borderWidth: 1 },
  saveMsgOk: { backgroundColor: Colors.successSurface, borderColor: Colors.success + '40' },
  saveMsgErr: { backgroundColor: Colors.errorSurface, borderColor: Colors.error + '40' },
  saveMsgText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm },

  fieldGroup: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, gap: Spacing[3] },
  groupTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary, borderBottomWidth: 1, borderBottomColor: Colors.divider, paddingBottom: Spacing[2] },
  fieldRow: { flexDirection: 'row', gap: Spacing[3] },
  field: { gap: Spacing[1] },
  fieldLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textTertiary },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[2] + 2, paddingHorizontal: Spacing[3], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, backgroundColor: Colors.white },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  chipScroll: { marginTop: 4 },
  chip: { paddingVertical: Spacing[1] + 2, paddingHorizontal: Spacing[3], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50], marginRight: Spacing[2] },
  chipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  chipText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  chipTextSelected: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  tagInputRow: { flexDirection: 'row', gap: Spacing[2] },
  addTagBtn: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  tagList: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  tag: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1], paddingVertical: 4, paddingHorizontal: Spacing[3], borderRadius: Radius.full, backgroundColor: Colors.primarySurface, borderWidth: 1, borderColor: Colors.primary + '40' },
  tagFestival: { backgroundColor: Colors.secondarySurface, borderColor: Colors.secondary + '40' },
  tagText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.primary },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2], paddingVertical: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.primary },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },

  emptyEditor: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing[3] },
  emptyEditorTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  emptyEditorSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 300 },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: Spacing[5] },
  importModal: { width: '100%', maxWidth: 640, backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[6], gap: Spacing[4], maxHeight: '90%' },
  modalTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTopLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  importSection: { gap: Spacing[3], marginBottom: Spacing[2] },
  importSectionTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  importSectionHint: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, lineHeight: Typography.size.xs * 1.6 },
  templateBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary, alignSelf: 'flex-start' },
  templateBtnText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.primary },
  csvInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing[3], fontFamily: Typography.fontFamily.mono ?? Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textPrimary, minHeight: 140, textAlignVertical: 'top', backgroundColor: Colors.neutral[50] },
  previewHeader: { flexDirection: 'row', backgroundColor: Colors.neutral[100], padding: Spacing[2], borderRadius: Radius.sm },
  previewRow: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: Spacing[2], borderBottomWidth: 1, borderBottomColor: Colors.divider, paddingHorizontal: Spacing[1] },
  previewRowError: { backgroundColor: Colors.errorSurface },
  previewCell: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textPrimary, paddingHorizontal: 2 },
  previewCellCenter: { alignItems: 'center', justifyContent: 'center' },
  previewError: { width: '100%', fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.error, marginTop: 2 },
  previewSummary: { paddingVertical: Spacing[2] },
  previewSummaryText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  importResult: { alignItems: 'center', gap: Spacing[4], paddingVertical: Spacing[6] },
  importResultTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  importResultStats: { flexDirection: 'row', gap: Spacing[4] },
  importStat: { alignItems: 'center', gap: 4 },
  importStatNum: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'] },
  importStatLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
});
