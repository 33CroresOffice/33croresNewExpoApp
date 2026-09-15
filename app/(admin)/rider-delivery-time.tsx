import React, { useCallback, useState } from 'react';
import ModuleGuard from '@/components/admin/ModuleGuard';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock, Save, Check, AlertCircle } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { usePageVisibility } from '@/hooks/usePageVisibility';

function formatTime(value: string | null): string {
  if (!value) return 'No limit';
  const [hourText, minute] = value.slice(0, 5).split(':');
  const hour = Number(hourText);
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export default function RiderDeliveryTimeScreen() {
  return <ModuleGuard module="riders"><RiderDeliveryTimeContent /></ModuleGuard>;
}

function RiderDeliveryTimeContent() {
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('auto_assignment_settings')
      .select('delivery_deadline_time').eq('id', 1).maybeSingle();
    if (loadError) setError('Unable to load the delivery time limit.');
    setValue(data?.delivery_deadline_time?.slice(0, 5) ?? '');
    setLoading(false);
  }, []);

  usePageVisibility(load);

  const save = async () => {
    const nextValue = value.trim();
    if (nextValue && !/^([01]\d|2[0-3]):[0-5]\d$/.test(nextValue)) {
      setError('Enter time in 24-hour format, for example 18:00.');
      return;
    }
    setSaving(true); setSaved(false); setError('');
    const { error: saveError } = await supabase.from('auto_assignment_settings')
      .update({ delivery_deadline_time: nextValue || null, updated_at: new Date().toISOString() }).eq('id', 1);
    setSaving(false);
    if (saveError) { setError('Unable to save the delivery time limit.'); return; }
    setValue(nextValue); setSaved(true);
  };

  return (
    <View style={[styles.root, { paddingTop: Platform.OS === 'web' ? 0 : insets.top }]}> 
      <View style={styles.header}>
        <View style={styles.icon}><Clock size={22} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><Text style={styles.title}>Delivery Time</Text><Text style={styles.subtitle}>One delivery deadline shared by all riders</Text></View>
      </View>
      <View style={styles.card}>
        <View style={styles.cardHeader}><View><Text style={styles.cardTitle}>All Riders</Text><Text style={styles.cardText}>Riders must mark deliveries complete by this time every day.</Text></View><View style={styles.badge}><Text style={styles.badgeText}>IST</Text></View></View>
        <Text style={styles.label}>Latest delivery time</Text>
        <View style={styles.formRow}><TextInput value={value} onChangeText={next => { setValue(next); setSaved(false); setError(''); }} placeholder="HH:MM" placeholderTextColor={Colors.textDisabled} maxLength={5} style={styles.timeInput} keyboardType="numeric" /><TouchableOpacity style={styles.save} onPress={save} disabled={saving}>{saving ? <ActivityIndicator size="small" color={Colors.white} /> : saved ? <Check size={15} color={Colors.white} /> : <Save size={15} color={Colors.white} />}<Text style={styles.saveText}>{saved ? 'Saved' : 'Save'}</Text></TouchableOpacity></View>
        <Text style={styles.current}>Current limit: {formatTime(value || null)}</Text>
        <Text style={styles.help}>Leave the field blank to allow deliveries at any time.</Text>
        {error ? <View style={styles.error}><AlertCircle size={16} color={Colors.error} /><Text style={styles.errorText}>{error}</Text></View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F3EE' },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], padding: Spacing[6] },
  icon: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 4 },
  card: { marginHorizontal: Spacing[6], maxWidth: 680, padding: Spacing[5], backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  cardText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 5 },
  badge: { backgroundColor: Colors.primarySurface, borderRadius: Radius.sm, paddingHorizontal: Spacing[2], paddingVertical: 5 },
  badgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.primary },
  label: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: Spacing[5], marginBottom: Spacing[2] },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  timeInput: { width: 110, paddingHorizontal: Spacing[3], paddingVertical: 11, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary, fontFamily: Typography.fontFamily.sansMedium, textAlign: 'center' },
  save: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing[4], paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.primary },
  saveText: { color: Colors.white, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm },
  current: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.primary, marginTop: Spacing[4] },
  help: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: Spacing[2] },
  error: { marginTop: Spacing[4], padding: Spacing[3], backgroundColor: Colors.errorSurface, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  errorText: { color: Colors.error, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm },
});
