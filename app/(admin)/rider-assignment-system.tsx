import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, TextInput, Platform, Modal, Pressable,
} from 'react-native';
import {
  Zap, MapPin, Clock, Settings, Play, AlertTriangle, CheckCircle2,
  Users, Bike, Layers, RefreshCw, X, Save, Truck, Calendar,
} from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format } from 'date-fns';

const isWeb = Platform.OS === 'web';

export default function RiderAssignmentSystemPage() {
  const { profile } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [riders, setRiders] = useState<any[]>([]);
  const [zoneAssignments, setZoneAssignments] = useState<any[]>([]);
  const [localities, setLocalities] = useState<any[]>([]);
  const [runResult, setRunResult] = useState<any>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState<any>({});
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [zoneModalRider, setZoneModalRider] = useState<any>(null);
  const [zoneSearch, setZoneSearch] = useState('');
  const [stats, setStats] = useState({ totalOrders: 0, unassigned: 0, assigned: 0, delivered: 0, totalRiders: 0, activeRiders: 0, onLeave: 0 });

  const load = useCallback(async () => {
    const [settingsRes, ridersRes, zonesRes, locRes] = await Promise.all([
      supabase.from('auto_assignment_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('riders').select('id, full_name, mobile, zone, is_active, max_daily_deliveries, vehicle_type').order('full_name'),
      supabase.from('rider_zone_assignments').select('*, rider:rider_id(id, full_name), locality:localities(id, locality_name)').order('created_at', { ascending: false }),
      supabase.from('localities').select('id, locality_name').order('locality_name'),
    ]);

    setSettings(settingsRes.data);
    setSettingsForm(settingsRes.data ?? {});
    setRiders(ridersRes.data ?? []);
    setZoneAssignments(zonesRes.data ?? []);
    setLocalities(locRes.data ?? []);

    const todayIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [ordersRes, leaveRes] = await Promise.all([
      supabase.from('orders').select('id, status').eq('scheduled_date', todayIST),
      supabase.from('rider_leave_requests').select('rider_id').eq('leave_date', todayIST).eq('status', 'approved'),
    ]);

    const orders = ordersRes.data ?? [];
    const leaveRiders = leaveRes.data ?? [];
    setStats({
      totalOrders: orders.length,
      unassigned: orders.filter((o: any) => o.status === 'scheduled').length,
      assigned: orders.filter((o: any) => o.status === 'out_for_delivery').length,
      delivered: orders.filter((o: any) => o.status === 'delivered').length,
      totalRiders: ridersRes.data?.length ?? 0,
      activeRiders: (ridersRes.data ?? []).filter((r: any) => r.is_active).length,
      onLeave: leaveRiders.length,
    });

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runAutoAssign = async () => {
    setRunning('auto');
    const todayIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data, error } = await supabase.rpc('auto_assign_riders', { target_date: todayIST });
    setRunning(null);
    if (error) {
      setRunResult({ type: 'error', message: error.message });
    } else {
      setRunResult({ type: 'success', data });
    }
    load();
  };

  const runLeaveRedistribution = async () => {
    setRunning('leave');
    const todayIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data, error } = await supabase.rpc('redistribute_planned_leave', { target_date: todayIST });
    setRunning(null);
    if (error) {
      setRunResult({ type: 'error', message: error.message });
    } else {
      setRunResult({ type: 'success', data });
    }
    load();
  };

  const runNoShowDetection = async () => {
    setRunning('noshow');
    const todayIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data, error } = await supabase.rpc('redistribute_no_shows', { target_date: todayIST });
    setRunning(null);
    if (error) {
      setRunResult({ type: 'error', message: error.message });
    } else {
      setRunResult({ type: 'success', data });
    }
    load();
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    const { error } = await supabase.from('auto_assignment_settings').update({
      auto_assign_enabled: settingsForm.auto_assign_enabled,
      no_show_cutoff_time: settingsForm.no_show_cutoff_time,
      warehouse_lat: settingsForm.warehouse_lat ? parseFloat(settingsForm.warehouse_lat) : null,
      warehouse_lng: settingsForm.warehouse_lng ? parseFloat(settingsForm.warehouse_lng) : null,
      default_max_daily_deliveries: parseInt(settingsForm.default_max_daily_deliveries, 10) || 15,
      nightly_redistribution_time: settingsForm.nightly_redistribution_time,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
    setSavingSettings(false);
    if (error) {
      setRunResult({ type: 'error', message: error.message });
    } else {
      setRunResult({ type: 'success', message: 'Settings saved successfully' });
      load();
    }
  };

  const addZoneAssignment = async (riderId: string, localityId: number, priority: string) => {
    const { error } = await supabase.from('rider_zone_assignments').insert({
      rider_id: riderId,
      locality_id: localityId,
      priority_level: priority,
    });
    if (error) {
      setRunResult({ type: 'error', message: error.message });
    } else {
      load();
    }
  };

  const removeZoneAssignment = async (id: string) => {
    await supabase.from('rider_zone_assignments').delete().eq('id', id);
    load();
  };

  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.headerIconWrap}>
            <Zap size={24} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={s.headerTitle}>Rider Assignment System</Text>
            <Text style={s.headerSub}>Automatic zone-based assignment, leave redistribution, and no-show detection</Text>
          </View>
        </View>
        <View style={[s.statusBadge, settings?.auto_assign_enabled ? s.statusActive : s.statusInactive]}>
          <View style={[s.statusDot, { backgroundColor: settings?.auto_assign_enabled ? Colors.success : Colors.textTertiary }]} />
          <Text style={[s.statusText, { color: settings?.auto_assign_enabled ? Colors.success : Colors.textTertiary }]}>
            {settings?.auto_assign_enabled ? 'Active' : 'Disabled'}
          </Text>
        </View>
      </View>

      {/* Stats Grid */}
      <View style={s.statsGrid}>
        <StatCard label="Today's Orders" value={stats.totalOrders} icon={Calendar} color={Colors.primary} bg={Colors.primarySurface} />
        <StatCard label="Unassigned" value={stats.unassigned} icon={AlertTriangle} color={Colors.warning} bg={Colors.warningSurface} highlight={stats.unassigned > 0} />
        <StatCard label="Assigned" value={stats.assigned} icon={Truck} color="#0369A1" bg="#E0F2FE" />
        <StatCard label="Delivered" value={stats.delivered} icon={CheckCircle2} color={Colors.success} bg={Colors.successSurface} />
        <StatCard label="Active Riders" value={stats.activeRiders} icon={Bike} color={Colors.secondary} bg={Colors.secondarySurface} />
        <StatCard label="On Leave" value={stats.onLeave} icon={Users} color={Colors.accent} bg={Colors.accentSurface} />
      </View>

      {/* Manual Triggers */}
      <Section title="Manual Triggers" icon={Play}>
        <Text style={s.sectionDesc}>Run assignment functions on demand. These normally run automatically via cron jobs.</Text>
        <View style={s.triggerGrid}>
          <TriggerCard
            title="Auto-Assign Riders"
            desc="Assign all unassigned orders for today using zone hierarchy and load balancing"
            icon={Zap}
            onPress={runAutoAssign}
            loading={running === 'auto'}
            color={Colors.primary}
          />
          <TriggerCard
            title="Redistribute Planned Leave"
            desc="Reassign orders from riders on approved leave to backup riders"
            icon={RefreshCw}
            onPress={runLeaveRedistribution}
            loading={running === 'leave'}
            color={Colors.secondary}
          />
          <TriggerCard
            title="Detect No-Shows"
            desc="Find riders who haven't checked in and reassign their orders to present riders"
            icon={AlertTriangle}
            onPress={runNoShowDetection}
            loading={running === 'noshow'}
            color={Colors.warning}
          />
        </View>

        {runResult && (
          <View style={[s.resultBox, runResult.type === 'error' ? s.resultError : s.resultSuccess]}>
            {runResult.type === 'error' ? (
              <Text style={s.resultText}>{runResult.message}</Text>
            ) : (
              <View style={s.resultContent}>
                <CheckCircle2 size={16} color={Colors.success} strokeWidth={2} />
                <Text style={s.resultText}>
                  {runResult.message ??
                    `Assigned: ${runResult.data?.assigned ?? 0} | Failed: ${runResult.data?.failed ?? 0}` +
                    (runResult.data?.shortage_mode ? ' (shortage mode)' : '') +
                    (runResult.data?.redistributed != null ? ` | Redistributed: ${runResult.data.redistributed}` : '') +
                    (runResult.data?.no_shows != null ? ` | No-shows: ${runResult.data.no_shows}` : '')
                  }
                </Text>
              </View>
            )}
            <TouchableOpacity onPress={() => setRunResult(null)}>
              <X size={16} color={Colors.textTertiary} />
            </TouchableOpacity>
          </View>
        )}
      </Section>

      {/* Settings */}
      <Section title="Assignment Settings" icon={Settings}>
        <View style={s.settingsGrid}>
          <SettingToggle
            label="Auto-Assignment Enabled"
            value={settingsForm.auto_assign_enabled ?? true}
            onToggle={() => setSettingsForm({ ...settingsForm, auto_assign_enabled: !settingsForm.auto_assign_enabled })}
          />
          <SettingInput
            label="No-Show Cutoff Time (IST)"
            value={settingsForm.no_show_cutoff_time ?? '06:15'}
            onChangeText={(v: string) => setSettingsForm({ ...settingsForm, no_show_cutoff_time: v })}
            placeholder="06:15"
          />
          <SettingInput
            label="Default Max Daily Deliveries"
            value={String(settingsForm.default_max_daily_deliveries ?? 15)}
            onChangeText={(v: string) => setSettingsForm({ ...settingsForm, default_max_daily_deliveries: v })}
            placeholder="15"
            keyboardType="numeric"
          />
          <SettingInput
            label="Nightly Redistribution Time"
            value={settingsForm.nightly_redistribution_time ?? '22:00'}
            onChangeText={(v: string) => setSettingsForm({ ...settingsForm, nightly_redistribution_time: v })}
            placeholder="22:00"
          />
          <SettingInput
            label="Warehouse Latitude"
            value={settingsForm.warehouse_lat ? String(settingsForm.warehouse_lat) : ''}
            onChangeText={(v: string) => setSettingsForm({ ...settingsForm, warehouse_lat: v })}
            placeholder="20.2961"
            keyboardType="numeric"
          />
          <SettingInput
            label="Warehouse Longitude"
            value={settingsForm.warehouse_lng ? String(settingsForm.warehouse_lng) : ''}
            onChangeText={(v: string) => setSettingsForm({ ...settingsForm, warehouse_lng: v })}
            placeholder="85.8245"
            keyboardType="numeric"
          />
        </View>

        <View style={s.lastRunRow}>
          <View style={s.lastRunItem}>
            <Clock size={12} color={Colors.textTertiary} strokeWidth={1.8} />
            <Text style={s.lastRunText}>Auto-assign: {settings?.last_auto_assign_run ? format(new Date(settings.last_auto_assign_run), 'dd MMM, HH:mm') : 'Never'}</Text>
          </View>
          <View style={s.lastRunItem}>
            <Clock size={12} color={Colors.textTertiary} strokeWidth={1.8} />
            <Text style={s.lastRunText}>Leave: {settings?.last_nightly_run ? format(new Date(settings.last_nightly_run), 'dd MMM, HH:mm') : 'Never'}</Text>
          </View>
          <View style={s.lastRunItem}>
            <Clock size={12} color={Colors.textTertiary} strokeWidth={1.8} />
            <Text style={s.lastRunText}>No-show: {settings?.last_no_show_run ? format(new Date(settings.last_no_show_run), 'dd MMM, HH:mm') : 'Never'}</Text>
          </View>
        </View>

        <TouchableOpacity style={s.saveBtn} onPress={saveSettings} disabled={savingSettings}>
          {savingSettings ? <ActivityIndicator size="small" color={Colors.white} /> : <Save size={16} color={Colors.white} strokeWidth={2} />}
          <Text style={s.saveBtnText}>Save Settings</Text>
        </TouchableOpacity>
      </Section>

      {/* Zone Assignments */}
      <Section title="Zone Assignments" icon={Layers}>
        <Text style={s.sectionDesc}>Map riders to delivery areas. Primary riders get orders first; backup riders cover when primary is unavailable.</Text>

        <View style={s.zoneHeader}>
          <Text style={s.zoneColTitle}>Rider</Text>
          <Text style={s.zoneColLocality}>Locality</Text>
          <Text style={s.zoneColPriority}>Priority</Text>
          <Text style={s.zoneColAction}></Text>
        </View>

        {zoneAssignments.length === 0 ? (
          <View style={s.zoneEmpty}>
            <MapPin size={24} color={Colors.textTertiary} strokeWidth={1.5} />
            <Text style={s.zoneEmptyText}>No zone assignments yet. Use the button below to add one.</Text>
          </View>
        ) : (
          zoneAssignments.map((za: any) => (
            <View key={za.id} style={s.zoneRow}>
              <Text style={s.zoneRiderName}>{za.rider?.full_name ?? 'Unknown'}</Text>
              <Text style={s.zoneLocalityName}>{za.locality?.locality_name ?? 'Unknown'}</Text>
              <View style={[s.zonePriorityBadge, za.priority_level === 'primary' ? s.zonePrimary : s.zoneBackup]}>
                <Text style={[s.zonePriorityText, { color: za.priority_level === 'primary' ? Colors.primary : Colors.accentDark }]}>
                  {za.priority_level === 'primary' ? 'Primary' : 'Backup'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => removeZoneAssignment(za.id)} style={s.zoneRemoveBtn}>
                <X size={14} color={Colors.error} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          ))
        )}

        <TouchableOpacity style={s.addZoneBtn} onPress={() => { setZoneModalRider(null); setZoneSearch(''); setShowZoneModal(true); }}>
          <MapPin size={16} color={Colors.primary} strokeWidth={2} />
          <Text style={s.addZoneBtnText}>Add Zone Assignment</Text>
        </TouchableOpacity>
      </Section>

      {/* Zone Assignment Modal */}
      <Modal transparent animationType="fade" visible={showZoneModal} onRequestClose={() => setShowZoneModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Add Zone Assignment</Text>
              <TouchableOpacity onPress={() => setShowZoneModal(false)} style={s.modalCloseBtn}>
                <X size={20} color={Colors.textTertiary} strokeWidth={1.8} />
              </TouchableOpacity>
            </View>

            <Text style={s.fieldLabel}>Select Rider</Text>
            <View style={s.riderPickerList}>
              {riders.filter((r: any) => r.is_active).map((r: any) => (
                <TouchableOpacity
                  key={r.id}
                  style={[s.riderPickerItem, zoneModalRider?.id === r.id && s.riderPickerItemActive]}
                  onPress={() => setZoneModalRider(r)}
                >
                  <Bike size={14} color={zoneModalRider?.id === r.id ? Colors.primary : Colors.textTertiary} strokeWidth={1.8} />
                  <Text style={[s.riderPickerText, zoneModalRider?.id === r.id && s.riderPickerTextActive]}>{r.full_name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {zoneModalRider && (
              <>
                <Text style={s.fieldLabel}>Search Locality</Text>
                <TextInput
                  style={s.searchInput}
                  value={zoneSearch}
                  onChangeText={setZoneSearch}
                  placeholder="Type a locality name..."
                  placeholderTextColor={Colors.textDisabled}
                />
                <View style={s.localityList}>
                  {localities
                    .filter((l: any) => !zoneAssignments.some((za: any) => za.rider_id === zoneModalRider.id && za.locality_id === l.id))
                    .filter((l: any) => !zoneSearch.trim() || l.locality_name.toLowerCase().includes(zoneSearch.toLowerCase()))
                    .slice(0, 10)
                    .map((l: any) => (
                      <View key={l.id} style={s.localityRow}>
                        <Text style={s.localityName}>{l.locality_name}</Text>
                        <View style={s.localityBtns}>
                          <TouchableOpacity
                            style={[s.localityBtn, s.localityBtnPrimary]}
                            onPress={() => { addZoneAssignment(zoneModalRider.id, l.id, 'primary'); setShowZoneModal(false); }}
                          >
                            <Text style={[s.localityBtnText, { color: Colors.primary }]}>Primary</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.localityBtn, s.localityBtnBackup]}
                            onPress={() => { addZoneAssignment(zoneModalRider.id, l.id, 'backup'); setShowZoneModal(false); }}
                          >
                            <Text style={[s.localityBtnText, { color: Colors.accentDark }]}>Backup</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function StatCard({ label, value, icon: Icon, color, bg, highlight }: any) {
  return (
    <View style={[s.statCard, { backgroundColor: bg }, highlight && s.statCardHighlight]}>
      <View style={[s.statIconWrap, { backgroundColor: color + '15' }]}>
        <Icon size={16} color={color} strokeWidth={1.8} />
      </View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function TriggerCard({ title, desc, icon: Icon, onPress, loading, color }: any) {
  return (
    <TouchableOpacity style={s.triggerCard} onPress={onPress} disabled={loading} activeOpacity={0.8}>
      <View style={[s.triggerIconWrap, { backgroundColor: color + '15' }]}>
        {loading ? <ActivityIndicator size="small" color={color} /> : <Icon size={18} color={color} strokeWidth={1.8} />}
      </View>
      <View style={s.triggerContent}>
        <Text style={s.triggerTitle}>{title}</Text>
        <Text style={s.triggerDesc}>{desc}</Text>
      </View>
    </TouchableOpacity>
  );
}

function Section({ title, icon: Icon, children }: any) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Icon size={18} color={Colors.textPrimary} strokeWidth={1.8} />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function SettingToggle({ label, value, onToggle }: any) {
  return (
    <View style={s.settingRow}>
      <Text style={s.settingLabel}>{label}</Text>
      <TouchableOpacity
        style={[s.toggle, value ? s.toggleOn : s.toggleOff]}
        onPress={onToggle}
      >
        <View style={[s.toggleKnob, value ? s.toggleKnobOn : s.toggleKnobOff]} />
      </TouchableOpacity>
    </View>
  );
}

function SettingInput({ label, value, onChangeText, placeholder, keyboardType }: any) {
  return (
    <View style={s.settingRow}>
      <Text style={s.settingLabel}>{label}</Text>
      <TextInput
        style={s.settingInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textDisabled}
        keyboardType={keyboardType || 'default'}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: isWeb ? 32 : 16, gap: Spacing[4], paddingBottom: 64 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FA' },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], flex: 1 },
  headerIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary, letterSpacing: -0.3 },
  headerSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2, maxWidth: 500 },

  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full },
  statusActive: { backgroundColor: Colors.successSurface },
  statusInactive: { backgroundColor: Colors.neutral[100] },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[3] },
  statCard: { minWidth: 140, flex: 1, borderRadius: Radius.lg, padding: Spacing[4], gap: 6, ...Shadow.sm },
  statCardHighlight: { borderWidth: 2, borderColor: Colors.warning },
  statIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.textPrimary },
  statLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },

  section: { backgroundColor: Colors.white, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing[5], gap: Spacing[3], ...Shadow.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  sectionTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  sectionDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, lineHeight: 17, marginBottom: Spacing[2] },

  triggerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[3] },
  triggerCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], padding: Spacing[4], borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50], flex: 1, minWidth: 280, ...Shadow.sm },
  triggerIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  triggerContent: { flex: 1, gap: 2 },
  triggerTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  triggerDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, lineHeight: 16 },

  resultBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], padding: Spacing[3], borderRadius: Radius.md, marginTop: Spacing[2] },
  resultSuccess: { backgroundColor: Colors.successSurface },
  resultError: { backgroundColor: Colors.errorSurface },
  resultContent: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flex: 1 },
  resultText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary, flex: 1 },

  settingsGrid: { gap: Spacing[2] },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], borderRadius: Radius.md, backgroundColor: Colors.neutral[50], borderWidth: 1, borderColor: Colors.border },
  settingLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary, flex: 1 },
  settingInput: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: Spacing[3], paddingVertical: 6, minWidth: 120, textAlign: 'right', outlineStyle: 'none' } as any,

  toggle: { width: 44, height: 24, borderRadius: 12, justifyContent: 'center', padding: 2 },
  toggleOn: { backgroundColor: Colors.success },
  toggleOff: { backgroundColor: Colors.neutral[300] },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, ...Shadow.sm },
  toggleKnobOn: { backgroundColor: Colors.white, alignSelf: 'flex-end' },
  toggleKnobOff: { backgroundColor: Colors.white, alignSelf: 'flex-start' },

  lastRunRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[3], marginTop: Spacing[2] },
  lastRunItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lastRunText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary },

  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2], paddingVertical: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.primary, marginTop: Spacing[2] },
  saveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },

  zoneHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.neutral[50], borderRadius: Radius.md },
  zoneColTitle: { flex: 1, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  zoneColLocality: { flex: 1, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  zoneColPriority: { width: 80, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  zoneColAction: { width: 32 },

  zoneRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing[3], paddingHorizontal: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  zoneRiderName: { flex: 1, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  zoneLocalityName: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  zonePriorityBadge: { width: 80, alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, borderRadius: Radius.full },
  zonePrimary: { backgroundColor: Colors.primarySurface },
  zoneBackup: { backgroundColor: Colors.accentSurface },
  zonePriorityText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10 },
  zoneRemoveBtn: { width: 32, alignItems: 'center' },

  zoneEmpty: { alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[5] },
  zoneEmptyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 300 },

  addZoneBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2], paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary, backgroundColor: Colors.primarySurface, marginTop: Spacing[3] },
  addZoneBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: Spacing[4] },
  modalCard: { width: '100%', maxWidth: 520, maxHeight: '85%', backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[5], gap: Spacing[3] },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  modalCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },

  fieldLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },

  riderPickerList: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  riderPickerItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  riderPickerItemActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  riderPickerText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  riderPickerTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },

  searchInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[3], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, outlineStyle: 'none' } as any,

  localityList: { gap: Spacing[1], maxHeight: 300 },
  localityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  localityName: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, flex: 1 },
  localityBtns: { flexDirection: 'row', gap: Spacing[1] },
  localityBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: Radius.sm },
  localityBtnPrimary: { backgroundColor: Colors.primarySurface },
  localityBtnBackup: { backgroundColor: Colors.accentSurface },
  localityBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10 },
});
