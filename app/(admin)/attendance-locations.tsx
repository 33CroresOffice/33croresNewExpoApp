import React, { useEffect, useState, useCallback } from 'react';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, ActivityIndicator, RefreshControl, Modal, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin, Plus, X, Pencil, Trash2, CircleCheck as CheckCircle, Radio, Navigation, LocateFixed } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format } from 'date-fns';

interface AttendanceLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_active: boolean;
  created_at: string;
}

const EMPTY_FORM = {
  name: '',
  latitude: '',
  longitude: '',
  radius_meters: '200',
  is_active: true,
};

export default function AttendanceLocationsScreen() {
  return (
    <ModuleGuard module="riders">
      <AttendanceLocationsScreenContent />
    </ModuleGuard>
  );
}

function AttendanceLocationsScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { profile } = useAuthStore();
  const [locations, setLocations] = useState<AttendanceLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('attendance_locations')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setLocations(data as AttendanceLocation[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  usePageVisibility(load);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setError('');
    setModalVisible(true);
  };

  const openEdit = (loc: AttendanceLocation) => {
    setEditingId(loc.id);
    setForm({
      name: loc.name,
      latitude: String(loc.latitude),
      longitude: String(loc.longitude),
      radius_meters: String(loc.radius_meters),
      is_active: loc.is_active,
    });
    setError('');
    setModalVisible(true);
  };

  const validate = () => {
    if (!form.name.trim()) return 'Location name is required.';
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    if (isNaN(lat) || lat < -90 || lat > 90) return 'Enter a valid latitude (-90 to 90).';
    if (isNaN(lng) || lng < -180 || lng > 180) return 'Enter a valid longitude (-180 to 180).';
    const r = parseInt(form.radius_meters);
    if (isNaN(r) || r < 10 || r > 10000) return 'Radius must be between 10 and 10000 meters.';
    return '';
  };

  const save = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      latitude: parseFloat(form.latitude),
      longitude: parseFloat(form.longitude),
      radius_meters: parseInt(form.radius_meters),
      is_active: form.is_active,
      created_by: profile?.id,
    };
    if (editingId) {
      await supabase.from('attendance_locations').update(payload).eq('id', editingId);
    } else {
      await supabase.from('attendance_locations').insert(payload);
    }
    setSaving(false);
    setModalVisible(false);
    load();
  };

  const deleteLocation = async (id: string) => {
    setDeletingId(id);
    await supabase.from('attendance_locations').delete().eq('id', id);
    setDeletingId(null);
    load();
  };

  const toggleActive = async (loc: AttendanceLocation) => {
    await supabase.from('attendance_locations').update({ is_active: !loc.is_active }).eq('id', loc.id);
    setLocations((prev) => prev.map((l) => l.id === loc.id ? { ...l, is_active: !l.is_active } : l));
  };

  const useCurrentLocation = () => {
    if (!navigator?.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setForm((f) => ({
          ...f,
          latitude: lat.toFixed(6),
          longitude: lng.toFixed(6),
        }));
        // Reverse geocode to get a place name
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
          );
          const data = await res.json();
          const addr = data.address ?? {};
          const name =
            addr.amenity ||
            addr.building ||
            addr.road ||
            addr.suburb ||
            addr.neighbourhood ||
            addr.city_district ||
            addr.city ||
            addr.town ||
            addr.village ||
            'Current Location';
          setForm((f) => ({ ...f, name: f.name || name }));
        } catch {
          // name stays blank if reverse geocode fails
        }
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        if (err.code === 1) setError('Location permission denied. Please allow access in your browser.');
        else setError('Unable to retrieve location. Please enter coordinates manually.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const renderForm = () => (
    <Modal visible={modalVisible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingId ? 'Edit Location' : 'Add Attendance Location'}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalClose}>
              <X size={20} color={Colors.textTertiary} strokeWidth={1.8} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            <TouchableOpacity
              style={styles.currentLocBtn}
              onPress={useCurrentLocation}
              disabled={locating}
              activeOpacity={0.8}
            >
              {locating
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <LocateFixed size={15} color={Colors.primary} strokeWidth={2} />}
              <Text style={styles.currentLocBtnText}>
                {locating ? 'Detecting location...' : 'Use Current Location'}
              </Text>
            </TouchableOpacity>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Location Name *</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                placeholder="e.g. Main Warehouse, HQ"
                placeholderTextColor={Colors.textTertiary}
              />
            </View>

            <View style={styles.fieldRow}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>Latitude *</Text>
                <TextInput
                  style={styles.input}
                  value={form.latitude}
                  onChangeText={(v) => setForm((f) => ({ ...f, latitude: v }))}
                  placeholder="e.g. 12.9716"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>Longitude *</Text>
                <TextInput
                  style={styles.input}
                  value={form.longitude}
                  onChangeText={(v) => setForm((f) => ({ ...f, longitude: v }))}
                  placeholder="e.g. 77.5946"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Check-in Radius (meters) *</Text>
              <TextInput
                style={styles.input}
                value={form.radius_meters}
                onChangeText={(v) => setForm((f) => ({ ...f, radius_meters: v }))}
                placeholder="200"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="number-pad"
              />
              <Text style={styles.fieldHint}>Riders must be within this distance to mark attendance.</Text>
            </View>

            <View style={styles.fieldGroupRow}>
              <Text style={styles.fieldLabel}>Active</Text>
              <Switch
                value={form.is_active}
                onValueChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                trackColor={{ false: Colors.neutral[200], true: Colors.primaryLight }}
                thumbColor={form.is_active ? Colors.primary : Colors.neutral[400]}
              />
            </View>

            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.saveBtnText}>{editingId ? 'Update' : 'Add Location'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderLocationCard = (loc: AttendanceLocation) => (
    <View key={loc.id} style={[styles.card, !loc.is_active && styles.cardInactive]}>
      <View style={styles.cardLeft}>
        <View style={[styles.cardIconWrap, { backgroundColor: loc.is_active ? Colors.primarySurface : Colors.neutral[100] }]}>
          <MapPin size={20} color={loc.is_active ? Colors.primary : Colors.textTertiary} strokeWidth={1.8} />
        </View>
        <View style={styles.cardInfo}>
          <View style={styles.cardNameRow}>
            <Text style={styles.cardName}>{loc.name}</Text>
            <View style={[styles.statusBadge, { backgroundColor: loc.is_active ? Colors.successSurface : Colors.neutral[100] }]}>
              <View style={[styles.statusDot, { backgroundColor: loc.is_active ? Colors.success : Colors.neutral[400] }]} />
              <Text style={[styles.statusText, { color: loc.is_active ? Colors.success : Colors.textTertiary }]}>
                {loc.is_active ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>
          <View style={styles.cardMetaRow}>
            <Navigation size={12} color={Colors.textTertiary} strokeWidth={1.8} />
            <Text style={styles.cardMeta}>{loc.latitude}, {loc.longitude}</Text>
          </View>
          <View style={styles.cardMetaRow}>
            <Radio size={12} color={Colors.textTertiary} strokeWidth={1.8} />
            <Text style={styles.cardMeta}>Radius: {loc.radius_meters}m</Text>
          </View>
        </View>
      </View>
      <View style={styles.cardActions}>
        <Switch
          value={loc.is_active}
          onValueChange={() => toggleActive(loc)}
          trackColor={{ false: Colors.neutral[200], true: Colors.primaryLight }}
          thumbColor={loc.is_active ? Colors.primary : Colors.neutral[400]}
        />
        <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(loc)}>
          <Pencil size={15} color={Colors.primary} strokeWidth={1.8} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: Colors.errorSurface }]}
          onPress={() => deleteLocation(loc.id)}
          disabled={deletingId === loc.id}
        >
          {deletingId === loc.id
            ? <ActivityIndicator size="small" color={Colors.error} />
            : <Trash2 size={15} color={Colors.error} strokeWidth={1.8} />}
        </TouchableOpacity>
      </View>
    </View>
  );

  const content = (
    <>
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderLeft}>
          <View style={styles.headerIconWrap}>
            <MapPin size={20} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={styles.pageTitle}>Attendance Locations</Text>
            <Text style={styles.pageSubtitle}>Riders must be within the radius to check in</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate} activeOpacity={0.8}>
          <Plus size={16} color={Colors.white} strokeWidth={2} />
          <Text style={styles.addBtnText}>Add Location</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : locations.length === 0 ? (
        <View style={styles.emptyState}>
          <MapPin size={40} color={Colors.textTertiary} strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>No locations configured</Text>
          <Text style={styles.emptyText}>Add a GPS location with a radius. Riders must be within this zone to mark attendance.</Text>
          <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
            <Plus size={16} color={Colors.white} strokeWidth={2} />
            <Text style={styles.addBtnText}>Add First Location</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.list}>
          {locations.map(renderLocationCard)}
        </View>
      )}

      {renderForm()}
    </>
  );

  if (isWeb) {
    return (
      <ScrollView
        style={styles.webScroll}
        contentContainerStyle={styles.webContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {content}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.mobileContent, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {content}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F9' },
  webScroll: { flex: 1, backgroundColor: '#F4F6F9' },
  webContent: { padding: 32, gap: 24, paddingBottom: 64 },
  mobileContent: { padding: 16, gap: 16 },

  pageHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    flexWrap: 'wrap', gap: 12,
  },
  pageHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center', justifyContent: 'center',
  },
  pageTitle: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'],
    color: Colors.textPrimary, letterSpacing: -0.3,
  },
  pageSubtitle: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: Colors.textTertiary, marginTop: 2,
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  addBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white,
  },

  loadingWrap: { paddingVertical: 80, alignItems: 'center' },
  emptyState: {
    backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.border,
    padding: 48, alignItems: 'center', gap: 12, ...Shadow.sm,
  },
  emptyTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary,
  },
  emptyText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
    textAlign: 'center', maxWidth: 400,
  },

  list: { gap: 12 },
  card: {
    backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, ...Shadow.sm,
  },
  cardInactive: { opacity: 0.6 },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIconWrap: {
    width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardInfo: { flex: 1, gap: 4 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardName: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardMeta: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  actionBtn: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center', justifyContent: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  modalCard: {
    backgroundColor: Colors.white, borderRadius: 20,
    width: '100%', maxWidth: 520, maxHeight: '90%',
    overflow: 'hidden', ...Shadow.lg,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 18,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xl, color: Colors.textPrimary,
  },
  modalClose: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center',
  },
  modalBody: { padding: 24, maxHeight: 420 },
  modalFooter: {
    flexDirection: 'row', gap: 12, padding: 20,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },

  currentLocBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: Colors.primarySurface, marginBottom: 20,
  },
  currentLocBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary,
  },
  fieldGroup: { gap: 6, marginBottom: 16 },
  fieldGroupRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  fieldRow: { flexDirection: 'row', gap: 12 },
  fieldLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary,
  },
  fieldHint: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2,
  },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary,
    backgroundColor: Colors.neutral[50],
  },
  errorBox: {
    backgroundColor: Colors.errorSurface, borderRadius: Radius.md, padding: 10, marginBottom: 8,
  },
  errorText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error,
  },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary,
  },
  saveBtn: {
    flex: 2, paddingVertical: 12, borderRadius: Radius.lg,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white,
  },
});
