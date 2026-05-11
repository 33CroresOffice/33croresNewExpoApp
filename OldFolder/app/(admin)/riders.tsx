import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, ActivityIndicator, RefreshControl,
  Modal, Switch, Alert, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bike, Plus, Search, X, ChevronRight, Phone, MapPin, Truck, Users, CircleCheck as CheckCircle, CircleAlert as AlertCircle, Pencil, Trash2, ChevronDown } from 'lucide-react-native';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import DatePickerField from '@/components/ui/DatePickerField';
import PhotoUploadField from '@/components/ui/PhotoUploadField';

type VehicleType = 'bike' | 'scooter' | 'bicycle' | 'foot';

const VEHICLE_LABELS: Record<VehicleType, string> = {
  bike: 'Bike', scooter: 'Scooter', bicycle: 'Bicycle', foot: 'On Foot',
};

const VEHICLE_OPTIONS: { value: VehicleType; label: string }[] = [
  { value: 'bike',     label: 'Bike' },
  { value: 'scooter',  label: 'Scooter' },
  { value: 'bicycle',  label: 'Bicycle' },
  { value: 'foot',     label: 'On Foot' },
];

const ZONE_OPTIONS = ['North', 'South', 'East', 'West', 'Central', 'General'];

type IdCardType = 'aadhaar' | 'pan' | 'dl' | 'voter' | 'passport' | 'other';

const ID_CARD_OPTIONS: { value: IdCardType; label: string }[] = [
  { value: 'aadhaar',  label: 'Aadhaar Card' },
  { value: 'pan',      label: 'PAN Card' },
  { value: 'dl',       label: 'Driving License' },
  { value: 'voter',    label: 'Voter ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'other',    label: 'Other' },
];

const EMPTY_FORM = {
  full_name: '',
  mobile: '',
  alternate_mobile: '',
  email: '',
  vehicle_type: 'bike' as VehicleType,
  vehicle_number: '',
  license_number: '',
  zone: 'General',
  joining_date: new Date(),
  address: '',
  emergency_contact_name: '',
  emergency_contact_mobile: '',
  monthly_salary: '',
  notes: '',
  is_active: true,
  profile_photo_url: null as string | null,
  id_card_type: '' as IdCardType | '',
  id_card_number: '',
  id_card_photo_url: null as string | null,
  license_photo_url: null as string | null,
};

export default function RidersScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { profile: adminProfile } = useAuthStore();

  const [riders, setRiders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<boolean | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [vehiclePicker, setVehiclePicker] = useState(false);
  const [zonePicker, setZonePicker] = useState(false);
  const [idCardPicker, setIdCardPicker] = useState(false);

  const [metrics, setMetrics] = useState({ total: 0, active: 0, todayDeliveries: 0, pendingAssignments: 0 });
  const [onLeaveToday, setOnLeaveToday] = useState<Set<string>>(new Set());
  const [busyRiderIds, setBusyRiderIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const [ridersRes, todayAssignRes, pendingRes, leaveRes, activeAssignRes] = await Promise.all([
        supabase.from('riders').select('*, rider_order_assignments!rider_order_assignments_rider_id_fkey(count)').order('is_active', { ascending: false }).order('full_name'),
        supabase.from('rider_order_assignments').select('id').in('status', ['delivered']).gte('delivered_at', today + 'T00:00:00').lt('delivered_at', today + 'T23:59:59'),
        supabase.from('rider_order_assignments').select('id').in('status', ['assigned', 'accepted', 'picked_up']),
        supabase.from('rider_leave_requests').select('rider_id').eq('leave_date', today).eq('status', 'approved'),
        supabase.from('rider_order_assignments').select('rider_id').in('status', ['assigned', 'accepted', 'picked_up']),
      ]);
      const r = ridersRes.data ?? [];
      const leaveSet = new Set((leaveRes.data ?? []).map((l: any) => l.rider_id as string));
      const busySet = new Set((activeAssignRes.data ?? []).map((a: any) => a.rider_id as string));
      setRiders(r);
      setOnLeaveToday(leaveSet);
      setBusyRiderIds(busySet);
      setMetrics({
        total: r.length,
        active: r.filter((x: any) => x.is_active && !leaveSet.has(x.id)).length,
        todayDeliveries: todayAssignRes.data?.length ?? 0,
        pendingAssignments: pendingRes.data?.length ?? 0,
      });
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = riders.filter(r => {
    if (filterActive !== null && r.is_active !== filterActive) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return r.full_name.toLowerCase().includes(q) || r.mobile.includes(q) || r.zone?.toLowerCase().includes(q);
    }
    return true;
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setFormError('');
    setVehiclePicker(false);
    setZonePicker(false);
    setIdCardPicker(false);
    setShowModal(true);
  };

  const openEdit = (rider: any) => {
    setEditing(rider);
    setForm({
      full_name: rider.full_name,
      mobile: rider.mobile,
      alternate_mobile: rider.alternate_mobile ?? '',
      email: rider.email ?? '',
      vehicle_type: rider.vehicle_type,
      vehicle_number: rider.vehicle_number ?? '',
      license_number: rider.license_number ?? '',
      zone: rider.zone ?? 'General',
      joining_date: rider.joining_date ? parseISO(rider.joining_date) : new Date(),
      address: rider.address ?? '',
      emergency_contact_name: rider.emergency_contact_name ?? '',
      emergency_contact_mobile: rider.emergency_contact_mobile ?? '',
      monthly_salary: rider.monthly_salary != null ? String(rider.monthly_salary) : '',
      notes: rider.notes ?? '',
      is_active: rider.is_active,
      profile_photo_url: rider.profile_photo_url ?? null,
      id_card_type: rider.id_card_type ?? '',
      id_card_number: rider.id_card_number ?? '',
      id_card_photo_url: rider.id_card_photo_url ?? null,
      license_photo_url: rider.license_photo_url ?? null,
    });
    setFormError('');
    setVehiclePicker(false);
    setZonePicker(false);
    setIdCardPicker(false);
    setShowModal(true);
  };

  const save = async () => {
    if (!form.full_name.trim()) { setFormError('Full name is required'); return; }
    if (!form.mobile.trim()) { setFormError('Mobile number is required'); return; }
    setSaving(true); setFormError('');

    const payload = {
      full_name: form.full_name.trim(),
      mobile: form.mobile.trim(),
      alternate_mobile: form.alternate_mobile.trim() || null,
      email: form.email.trim() || null,
      vehicle_type: form.vehicle_type,
      vehicle_number: form.vehicle_number.trim() || null,
      license_number: form.license_number.trim() || null,
      zone: form.zone || 'General',
      joining_date: format(form.joining_date instanceof Date ? form.joining_date : new Date(), 'yyyy-MM-dd'),
      address: form.address.trim(),
      emergency_contact_name: form.emergency_contact_name.trim(),
      emergency_contact_mobile: form.emergency_contact_mobile.trim(),
      monthly_salary: parseInt(form.monthly_salary) || 0,
      notes: form.notes.trim(),
      is_active: form.is_active,
      profile_photo_url: form.profile_photo_url || null,
      id_card_type: form.id_card_type || null,
      id_card_number: form.id_card_number.trim() || null,
      id_card_photo_url: form.id_card_photo_url || null,
      license_photo_url: form.license_photo_url || null,
    };

    const { error } = editing
      ? await supabase.from('riders').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id)
      : await supabase.from('riders').insert(payload);

    setSaving(false);
    if (error) { setFormError(error.message); return; }
    setShowModal(false);
    load();
  };

  const deleteRider = async (id: string) => {
    if (Platform.OS !== 'web') {
      Alert.alert('Delete Rider', 'This will remove the rider and all their assignments.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => { await supabase.from('riders').delete().eq('id', id); load(); } },
      ]);
    } else {
      await supabase.from('riders').delete().eq('id', id);
      load();
    }
  };

  const toggleActive = async (rider: any) => {
    await supabase.from('riders').update({ is_active: !rider.is_active, updated_at: new Date().toISOString() }).eq('id', rider.id);
    load();
  };

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  return (
    <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top }]}>
      {/* Header */}
      <View style={[s.header, isWeb && s.headerWeb]}>
        <View style={s.headerLeft}>
          <View style={s.headerIcon}>
            <Bike size={isWeb ? 22 : 18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>Riders</Text>
            <Text style={s.subtitle}>{metrics.active} available · {metrics.total} total</Text>
          </View>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openCreate} activeOpacity={0.8}>
          <Plus size={16} color={Colors.white} strokeWidth={2} />
          <Text style={s.addBtnText}>Add Rider</Text>
        </TouchableOpacity>
      </View>

      {/* Metrics */}
      <View style={[s.metricsRow, isWeb && s.metricsRowWeb]}>
        <MetricPill icon={<Users size={13} color={Colors.primary} strokeWidth={2} />} label="Total" value={String(metrics.total)} color={Colors.primary} bg={Colors.primarySurface} />
        <MetricPill icon={<CheckCircle size={13} color={Colors.success} strokeWidth={2} />} label="Available" value={String(metrics.active)} color={Colors.success} bg="#E8F5E9" />
        <MetricPill icon={<Truck size={13} color={Colors.accentDark} strokeWidth={2} />} label="Delivered Today" value={String(metrics.todayDeliveries)} color={Colors.accentDark} bg={Colors.accentSurface} />
        <MetricPill icon={<AlertCircle size={13} color={Colors.warning} strokeWidth={2} />} label="In Transit" value={String(metrics.pendingAssignments)} color={Colors.warning} bg="#FFF3E0" />
      </View>

      {/* Today's Availability Grid */}
      {riders.filter(r => r.is_active).length > 0 && (
        <View style={[s.availGrid, isWeb && s.availGridWeb]}>
          <Text style={s.availTitle}>Today's Availability</Text>
          <View style={s.availChips}>
            {riders.filter(r => r.is_active).map(rider => {
              const isLeave = onLeaveToday.has(rider.id);
              const isBusy = !isLeave && busyRiderIds.has(rider.id);
              const bg = isLeave ? '#FFF3E0' : isBusy ? Colors.accentSurface : '#E8F5E9';
              const dot = isLeave ? Colors.warning : isBusy ? Colors.accentDark : Colors.success;
              const textColor = isLeave ? Colors.warning : isBusy ? Colors.accentDark : Colors.success;
              return (
                <TouchableOpacity
                  key={rider.id}
                  style={[s.availChip, { backgroundColor: bg, borderColor: dot + '40' }]}
                  onPress={() => router.push({ pathname: '/(admin)/rider-detail' as any, params: { id: rider.id } })}
                  activeOpacity={0.8}
                >
                  <View style={[s.availDot, { backgroundColor: dot }]} />
                  <Text style={[s.availChipText, { color: textColor }]} numberOfLines={1}>{rider.full_name.split(' ')[0]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={s.availLegend}>
            <View style={s.availLegendItem}><View style={[s.availDot, { backgroundColor: Colors.success }]} /><Text style={s.availLegendText}>Available</Text></View>
            <View style={s.availLegendItem}><View style={[s.availDot, { backgroundColor: Colors.accentDark }]} /><Text style={s.availLegendText}>Delivering</Text></View>
            <View style={s.availLegendItem}><View style={[s.availDot, { backgroundColor: Colors.warning }]} /><Text style={s.availLegendText}>On Leave</Text></View>
          </View>
        </View>
      )}

      {/* Search + Filters */}
      <View style={[s.filterBar, isWeb && s.filterBarWeb]}>
        <View style={s.searchWrap}>
          <Search size={14} color={Colors.textTertiary} strokeWidth={1.8} />
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search name, mobile, zone…" placeholderTextColor={Colors.textDisabled} />
          {search ? <TouchableOpacity onPress={() => setSearch('')}><X size={14} color={Colors.textTertiary} /></TouchableOpacity> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterPills}>
          {([{ label: 'All', value: null }, { label: 'Active', value: true }, { label: 'Inactive', value: false }] as { label: string; value: boolean | null }[]).map(f => (
            <TouchableOpacity key={String(f.value)} style={[s.filterPill, filterActive === f.value && s.filterPillActive]} onPress={() => setFilterActive(f.value)}>
              <Text style={[s.filterPillText, filterActive === f.value && s.filterPillTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
      ) : filtered.length === 0 ? (
        <View style={s.emptyState}>
          <Bike size={40} color={Colors.textDisabled} strokeWidth={1.2} />
          <Text style={s.emptyTitle}>No riders found</Text>
          <Text style={s.emptySub}>Add your first delivery rider to get started.</Text>
        </View>
      ) : isWeb ? (
        <ScrollView style={s.scroll} contentContainerStyle={s.contentWeb} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
          <View style={s.tableCard}>
            <View style={s.tableHead}>
              <Text style={[s.th, { flex: 3 }]}>Rider</Text>
              <Text style={[s.th, { flex: 2 }]}>Mobile</Text>
              <Text style={[s.th, { flex: 1.5 }]}>Zone</Text>
              <Text style={[s.th, { flex: 1.5 }]}>Vehicle</Text>
              <Text style={[s.th, { flex: 1.5 }]}>Salary</Text>
              <Text style={[s.th, { flex: 1 }]}>Status</Text>
              <Text style={[s.th, { width: 80, textAlign: 'right' }]}>Actions</Text>
            </View>
            {filtered.map((rider, idx) => (
              <TouchableOpacity key={rider.id} style={[s.tableRow, idx % 2 === 1 && s.tableRowAlt]} onPress={() => router.push({ pathname: '/(admin)/rider-detail' as any, params: { id: rider.id } })} activeOpacity={0.8}>
                <View style={[s.td, { flex: 3, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] }]}>
                  <View style={[s.avatar, { backgroundColor: rider.is_active ? Colors.primarySurface : Colors.neutral[100] }]}>
                    {rider.profile_photo_url ? (
                      <Image source={{ uri: rider.profile_photo_url }} style={s.avatarImg} />
                    ) : (
                      <Text style={[s.avatarText, { color: rider.is_active ? Colors.primary : Colors.textTertiary }]}>{rider.full_name.charAt(0).toUpperCase()}</Text>
                    )}
                  </View>
                  <Text style={s.tdText}>{rider.full_name}</Text>
                </View>
                <View style={[s.td, { flex: 2 }]}><Text style={s.tdText}>{rider.mobile}</Text></View>
                <View style={[s.td, { flex: 1.5 }]}>
                  <View style={s.zoneBadge}><MapPin size={11} color={Colors.textTertiary} strokeWidth={1.8} /><Text style={s.zoneText}>{rider.zone}</Text></View>
                </View>
                <View style={[s.td, { flex: 1.5 }]}>
                  <View style={s.vehicleBadge}><Text style={s.vehicleText}>{VEHICLE_LABELS[rider.vehicle_type as VehicleType]}</Text></View>
                </View>
                <View style={[s.td, { flex: 1.5 }]}>
                  <Text style={s.tdText}>{rider.monthly_salary ? fmt(rider.monthly_salary) : '—'}</Text>
                </View>
                <View style={[s.td, { flex: 1 }]}>
                  <View style={[s.statusDot, { backgroundColor: rider.is_active ? Colors.success : Colors.neutral[300] }]} />
                </View>
                <View style={[s.td, { width: 80, flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing[2] }]}>
                  <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); openEdit(rider); }} style={s.iconBtn}>
                    <Pencil size={14} color={Colors.textTertiary} strokeWidth={1.8} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); deleteRider(rider.id); }} style={s.iconBtn}>
                    <Trash2 size={14} color={Colors.error} strokeWidth={1.8} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      ) : (
        <ScrollView style={s.scroll} contentContainerStyle={s.contentMobile} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
          {filtered.map(rider => (
            <TouchableOpacity key={rider.id} style={s.riderCard} onPress={() => router.push({ pathname: '/(admin)/rider-detail' as any, params: { id: rider.id } })} activeOpacity={0.8}>
              <View style={s.cardLeft}>
                <View style={[s.avatar, { backgroundColor: rider.is_active ? Colors.primarySurface : Colors.neutral[100] }]}>
                  {rider.profile_photo_url ? (
                    <Image source={{ uri: rider.profile_photo_url }} style={s.avatarImg} />
                  ) : (
                    <Text style={[s.avatarText, { color: rider.is_active ? Colors.primary : Colors.textTertiary }]}>{rider.full_name.charAt(0).toUpperCase()}</Text>
                  )}
                </View>
                <View style={[s.onlineDot, { backgroundColor: rider.is_active ? Colors.success : Colors.neutral[300] }]} />
              </View>
              <View style={s.cardBody}>
                <View style={s.cardTop}>
                  <Text style={s.riderName}>{rider.full_name}</Text>
                  <View style={s.vehicleBadge}><Text style={s.vehicleText}>{VEHICLE_LABELS[rider.vehicle_type as VehicleType]}</Text></View>
                </View>
                <View style={s.cardMeta}>
                  <Phone size={11} color={Colors.textTertiary} strokeWidth={1.8} />
                  <Text style={s.metaText}>{rider.mobile}</Text>
                  <MapPin size={11} color={Colors.textTertiary} strokeWidth={1.8} />
                  <Text style={s.metaText}>{rider.zone}</Text>
                </View>
                <Text style={s.rateText}>{rider.monthly_salary ? `${fmt(rider.monthly_salary)}/month` : 'No salary set'}</Text>
              </View>
              <ChevronRight size={16} color={Colors.textTertiary} strokeWidth={1.8} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editing ? 'Edit Rider' : 'Add Rider'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <SectionLabel label="Profile Photo" />
              <PhotoUploadField
                label="Rider Photo"
                value={form.profile_photo_url}
                onChange={url => setForm(p => ({ ...p, profile_photo_url: url }))}
                storagePath={`riders/${editing?.id ?? 'new-' + Date.now()}/profile`}
                aspectRatio={[1, 1]}
                hint="Upload a clear face photo of the rider"
              />

              <SectionLabel label="Personal Details" />
              <View style={[s.fieldRow, isWeb && s.fieldRowWeb]}>
                <ModalField label="Full Name *" value={form.full_name} onChange={v => setForm(p => ({ ...p, full_name: v }))} placeholder="Ravi Kumar" flex={2} />
              </View>
              <View style={[s.fieldRow, isWeb && s.fieldRowWeb]}>
                <ModalField label="Mobile *" value={form.mobile} onChange={v => setForm(p => ({ ...p, mobile: v }))} placeholder="9876543210" keyboardType="phone-pad" flex={1} />
                <ModalField label="Alternate Mobile" value={form.alternate_mobile} onChange={v => setForm(p => ({ ...p, alternate_mobile: v }))} placeholder="Optional" keyboardType="phone-pad" flex={1} />
              </View>
              <ModalField label="Email" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} placeholder="rider@email.com" keyboardType="email-address" />
              <ModalField label="Address" value={form.address} onChange={v => setForm(p => ({ ...p, address: v }))} placeholder="Full address" multiline />

              <SectionLabel label="Vehicle & Zone" />
              <View style={[s.fieldRow, isWeb && s.fieldRowWeb]}>
                <View style={[s.fieldGroup, { flex: 1 }]}>
                  <Text style={s.fieldLabel}>Vehicle Type</Text>
                  <TouchableOpacity style={s.pickerBtn} onPress={() => setVehiclePicker(p => !p)}>
                    <Text style={s.pickerValue}>{VEHICLE_LABELS[form.vehicle_type]}</Text>
                    <ChevronDown size={14} color={Colors.textTertiary} strokeWidth={1.8} />
                  </TouchableOpacity>
                  {vehiclePicker && (
                    <View style={s.pickerDropdown}>
                      {VEHICLE_OPTIONS.map(o => (
                        <TouchableOpacity key={o.value} style={[s.pickerOption, form.vehicle_type === o.value && s.pickerOptionActive]} onPress={() => { setForm(p => ({ ...p, vehicle_type: o.value })); setVehiclePicker(false); }}>
                          <Text style={[s.pickerOptionText, form.vehicle_type === o.value && s.pickerOptionTextActive]}>{o.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
                <ModalField label="Vehicle Number" value={form.vehicle_number} onChange={v => setForm(p => ({ ...p, vehicle_number: v }))} placeholder="MH01AB1234" flex={1} />
              </View>
              <View style={[s.fieldRow, isWeb && s.fieldRowWeb]}>
                <ModalField label="License Number" value={form.license_number} onChange={v => setForm(p => ({ ...p, license_number: v }))} placeholder="DL number" flex={1} />
                <View style={[s.fieldGroup, { flex: 1 }]}>
                  <Text style={s.fieldLabel}>Zone</Text>
                  <TouchableOpacity style={s.pickerBtn} onPress={() => setZonePicker(p => !p)}>
                    <Text style={s.pickerValue}>{form.zone || 'Select zone'}</Text>
                    <ChevronDown size={14} color={Colors.textTertiary} strokeWidth={1.8} />
                  </TouchableOpacity>
                  {zonePicker && (
                    <View style={s.pickerDropdown}>
                      {ZONE_OPTIONS.map(z => (
                        <TouchableOpacity key={z} style={[s.pickerOption, form.zone === z && s.pickerOptionActive]} onPress={() => { setForm(p => ({ ...p, zone: z })); setZonePicker(false); }}>
                          <Text style={[s.pickerOptionText, form.zone === z && s.pickerOptionTextActive]}>{z}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </View>

              <SectionLabel label="ID Documents" />
              <View style={[s.fieldGroup]}>
                <Text style={s.fieldLabel}>ID Card Type</Text>
                <TouchableOpacity style={s.pickerBtn} onPress={() => setIdCardPicker(p => !p)}>
                  <Text style={[s.pickerValue, !form.id_card_type && { color: Colors.textDisabled }]}>
                    {form.id_card_type ? ID_CARD_OPTIONS.find(o => o.value === form.id_card_type)?.label ?? form.id_card_type : 'Select ID type'}
                  </Text>
                  <ChevronDown size={14} color={Colors.textTertiary} strokeWidth={1.8} />
                </TouchableOpacity>
                {idCardPicker && (
                  <View style={s.pickerDropdown}>
                    {ID_CARD_OPTIONS.map(o => (
                      <TouchableOpacity key={o.value} style={[s.pickerOption, form.id_card_type === o.value && s.pickerOptionActive]} onPress={() => { setForm(p => ({ ...p, id_card_type: o.value })); setIdCardPicker(false); }}>
                        <Text style={[s.pickerOptionText, form.id_card_type === o.value && s.pickerOptionTextActive]}>{o.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              <ModalField label="ID Card Number" value={form.id_card_number} onChange={v => setForm(p => ({ ...p, id_card_number: v }))} placeholder="Enter ID number" />
              <PhotoUploadField
                label="ID Card Photo"
                value={form.id_card_photo_url}
                onChange={url => setForm(p => ({ ...p, id_card_photo_url: url }))}
                storagePath={`riders/${editing?.id ?? 'new-' + Date.now()}/id-card`}
                aspectRatio={[4, 3]}
                hint="Upload front side of the ID document"
              />
              <PhotoUploadField
                label="License Photo"
                value={form.license_photo_url}
                onChange={url => setForm(p => ({ ...p, license_photo_url: url }))}
                storagePath={`riders/${editing?.id ?? 'new-' + Date.now()}/license`}
                aspectRatio={[4, 3]}
                hint="Upload the driving license photo"
              />

              <SectionLabel label="Emergency Contact" />
              <View style={[s.fieldRow, isWeb && s.fieldRowWeb]}>
                <ModalField label="Contact Name" value={form.emergency_contact_name} onChange={v => setForm(p => ({ ...p, emergency_contact_name: v }))} placeholder="Relative name" flex={1} />
                <ModalField label="Contact Mobile" value={form.emergency_contact_mobile} onChange={v => setForm(p => ({ ...p, emergency_contact_mobile: v }))} placeholder="9876543210" keyboardType="phone-pad" flex={1} />
              </View>

              <SectionLabel label="Salary" />
              <ModalField label="Monthly Salary (₹)" value={form.monthly_salary} onChange={v => setForm(p => ({ ...p, monthly_salary: v }))} placeholder="0" keyboardType="numeric" />
              <View style={s.fieldGroup}>
                <DatePickerField
                  label="Joining Date"
                  value={form.joining_date instanceof Date ? form.joining_date : null}
                  onChange={d => setForm(p => ({ ...p, joining_date: d }))}
                  minDate={new Date(2000, 0, 1)}
                  maxDate={new Date()}
                />
              </View>
              <ModalField label="Notes" value={form.notes} onChange={v => setForm(p => ({ ...p, notes: v }))} placeholder="Any internal notes…" multiline />

              <View style={s.activeRow}>
                <Text style={s.fieldLabel}>Active</Text>
                <Switch value={form.is_active} onValueChange={v => setForm(p => ({ ...p, is_active: v }))} trackColor={{ true: Colors.primary, false: Colors.neutral[300] }} thumbColor={Colors.white} />
              </View>

              {formError ? <Text style={s.errorText}>{formError}</Text> : null}
            </ScrollView>
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveBtnText}>{editing ? 'Update' : 'Add Rider'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MetricPill({ icon, label, value, color, bg }: { icon: React.ReactNode; label: string; value: string; color: string; bg: string }) {
  return (
    <View style={[s.metricPill, { backgroundColor: bg }]}>
      {icon}
      <View>
        <Text style={[s.metricValue, { color }]}>{value}</Text>
        <Text style={s.metricLabel}>{label}</Text>
      </View>
    </View>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <Text style={s.sectionLabel}>{label}</Text>;
}

function ModalField({ label, value, onChange, placeholder, multiline, keyboardType, flex }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; keyboardType?: any; flex?: number }) {
  return (
    <View style={[s.fieldGroup, flex !== undefined && { flex }]}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput style={[s.input, multiline && s.textarea]} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={Colors.textDisabled} multiline={multiline} numberOfLines={multiline ? 3 : 1} keyboardType={keyboardType} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerWeb: { paddingHorizontal: Spacing[8], paddingVertical: Spacing[5] },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  headerIcon: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  titleWeb: { fontSize: Typography.size['2xl'] },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.primary, paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], borderRadius: Radius.full },
  addBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  metricsRow: { flexDirection: 'row', paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], gap: Spacing[3], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  metricsRowWeb: { paddingHorizontal: Spacing[8] },
  metricPill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderRadius: Radius.md },
  metricValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
  metricLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary },
  availGrid: { paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  availGridWeb: { paddingHorizontal: Spacing[8] },
  availTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary, marginBottom: Spacing[3] },
  availChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  availChip: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1], paddingVertical: 5, paddingHorizontal: Spacing[3], borderRadius: Radius.full, borderWidth: 1 },
  availDot: { width: 7, height: 7, borderRadius: 4 },
  availChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs },
  availLegend: { flexDirection: 'row', gap: Spacing[5], marginTop: Spacing[3] },
  availLegendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1] },
  availLegendText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary },
  filterBar: { paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing[2] },
  filterBarWeb: { paddingHorizontal: Spacing[8] },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.neutral[50], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2] },
  searchInput: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, outlineStyle: 'none' } as any,
  filterPills: { flexDirection: 'row', gap: Spacing[2] },
  filterPill: { paddingVertical: Spacing[1], paddingHorizontal: Spacing[3], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  filterPillActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  filterPillText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  filterPillTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  scroll: { flex: 1 },
  contentWeb: { padding: Spacing[8] },
  contentMobile: { padding: Spacing[4], gap: Spacing[3] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyState: { alignItems: 'center', paddingTop: 70, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  emptySub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 260 },
  tableCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  tableHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], backgroundColor: Colors.neutral[50], borderBottomWidth: 1, borderBottomColor: Colors.border },
  th: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  td: { flexDirection: 'row', alignItems: 'center' },
  tdText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  riderCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, gap: Spacing[3], ...Shadow.sm },
  cardLeft: { position: 'relative' },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: Colors.white },
  cardBody: { flex: 1, gap: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  riderName: { flex: 1, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  rateText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  vehicleBadge: { paddingHorizontal: Spacing[2], paddingVertical: 2, borderRadius: Radius.full, backgroundColor: Colors.accentSurface },
  vehicleText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.accentDark },
  zoneBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  zoneText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  iconBtn: { padding: Spacing[1] },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: Spacing[4] },
  modal: { width: '100%', maxHeight: '92%', backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[5], gap: Spacing[3] },
  modalWeb: { maxWidth: 560 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  sectionLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: Spacing[2], marginBottom: Spacing[1] },
  fieldGroup: { gap: Spacing[1], marginBottom: Spacing[3] },
  fieldRow: { gap: Spacing[3] },
  fieldRowWeb: { flexDirection: 'row' },
  fieldLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary, backgroundColor: Colors.neutral[50] },
  textarea: { minHeight: 64, textAlignVertical: 'top' },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], backgroundColor: Colors.neutral[50] },
  pickerValue: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  pickerDropdown: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.white, marginTop: 2, overflow: 'hidden', zIndex: 100 },
  pickerOption: { paddingVertical: Spacing[3], paddingHorizontal: Spacing[4] },
  pickerOptionActive: { backgroundColor: Colors.primarySurface },
  pickerOptionText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  pickerOptionTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  activeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[3] },
  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error, marginBottom: Spacing[2] },
  modalFooter: { flexDirection: 'row', gap: Spacing[3] },
  cancelBtn: { flex: 1, paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  saveBtn: { flex: 2, paddingVertical: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  saveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
});
