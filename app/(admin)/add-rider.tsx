import React, { useState } from 'react';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, ActivityIndicator, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, User, Phone, Shield, IndianRupee,
  AlertCircle, Check, UserPlus, Bike,
} from 'lucide-react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import DatePickerField from '@/components/ui/DatePickerField';
import PhotoUploadField from '@/components/ui/PhotoUploadField';

const WEB = Platform.OS === 'web';
const CONTENT_MAX = 800;
const PAGE_BG = '#F2F3EE';

type VehicleType = 'bike' | 'scooter' | 'bicycle' | 'foot';
const VEHICLE_OPTIONS: { value: VehicleType; label: string }[] = [
  { value: 'bike', label: 'Bike' },
  { value: 'scooter', label: 'Scooter' },
  { value: 'bicycle', label: 'Bicycle' },
  { value: 'foot', label: 'On Foot' },
];

const ZONE_OPTIONS = ['North', 'South', 'East', 'West', 'Central', 'General'];

type IdCardType = 'pan' | 'dl' | 'voter' | 'passport' | 'other';
const ID_CARD_OPTIONS: { value: IdCardType; label: string }[] = [
  { value: 'pan', label: 'PAN' },
  { value: 'dl', label: 'Driving License' },
  { value: 'voter', label: 'Voter ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'other', label: 'Other' },
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
  aadhaar_number: '',
  aadhaar_photo_url: null as string | null,
  id_card_type: '' as IdCardType | '',
  id_card_number: '',
  id_card_photo_url: null as string | null,
  license_photo_url: null as string | null,
};

export default function AddRiderScreen() {
  return (
    <ModuleGuard module="riders">
      <AddRiderScreenContent />
    </ModuleGuard>
  );
}

function AddRiderScreenContent() {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const p = (key: keyof typeof EMPTY_FORM) => (v: any) =>
    setForm(prev => ({ ...prev, [key]: v }));

  const save = async () => {
    if (!form.full_name.trim()) { setFormError('Full name is required'); return; }
    if (!form.mobile.trim()) { setFormError('Mobile number is required'); return; }
    if (!form.address.trim()) { setFormError('Address is required'); return; }
    if (!form.vehicle_number.trim()) { setFormError('Vehicle number is required'); return; }
    if (!form.license_number.trim()) { setFormError('License number is required'); return; }
    if (!form.monthly_salary.trim()) { setFormError('Monthly salary is required'); return; }
    if (!form.joining_date) { setFormError('Joining date is required'); return; }
    if (!form.aadhaar_number.trim()) { setFormError('Aadhaar number is required'); return; }
    if (!form.aadhaar_photo_url) { setFormError('Aadhaar photo is required'); return; }
    if (!form.id_card_type) { setFormError('ID card type is required'); return; }
    if (!form.id_card_number.trim()) { setFormError('ID card number is required'); return; }
    if (!form.id_card_photo_url) { setFormError('ID card photo is required'); return; }
    if (!form.license_photo_url) { setFormError('License photo is required'); return; }
    setSaving(true); setFormError('');

    const payload: any = {
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
      aadhaar_number: form.aadhaar_number.trim(),
      aadhaar_photo_url: form.aadhaar_photo_url || null,
      id_card_type: form.id_card_type || null,
      id_card_number: form.id_card_number.trim() || null,
      id_card_photo_url: form.id_card_photo_url || null,
      license_photo_url: form.license_photo_url || null,
    };

    const { error } = await supabase.from('riders').insert(payload);
    setSaving(false);
    if (error) { setFormError(error.message); return; }
    router.back();
  };

  return (
    <View style={[s.root, { paddingTop: WEB ? 0 : insets.top }]}>

      {/* ── TOP BAR ── */}
      <View style={s.topBar}>
        <View style={s.topBarInner}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <ArrowLeft size={20} color={Colors.textPrimary} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.topBarTitle}>Add Rider</Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ── HERO ── */}
        <View style={s.hero}>
          <View style={s.heroInner}>
            <View style={s.heroLeft}>
              <View style={s.heroIconCircle}>
                <UserPlus size={24} color={Colors.white} strokeWidth={1.8} />
              </View>
              <View>
                <Text style={s.heroTitle}>New Rider Profile</Text>
                <Text style={s.heroSub}>Fill in the details to onboard a delivery rider</Text>
              </View>
            </View>
            <View style={s.heroBadge}>
              <View style={[s.statusDot, form.is_active && s.statusDotOn]} />
              <Text style={[s.statusText, form.is_active && s.statusTextOn]}>
                {form.is_active ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── CARDS ── */}
        <View style={s.contentWrap}>

          {/* Profile Photo */}
          <Card icon={<User size={15} color={Colors.primary} strokeWidth={2} />} title="Profile Photo" iconBg={Colors.primarySurface} iconColor={Colors.primary}>
            <PhotoUploadField
              label="Rider Photo"
              value={form.profile_photo_url}
              onChange={p('profile_photo_url')}
              storagePath={`riders/new-${Date.now()}/profile`}
              aspectRatio={[1, 1]}
              hint="Upload a clear, well-lit face photo"
            />
          </Card>

          {/* Personal Details */}
          <Card icon={<User size={15} color="#1565C0" strokeWidth={2} />} title="Personal Details" iconBg="#E3F2FD" iconColor="#1565C0">
            <Field label="Full Name" required value={form.full_name} onChange={p('full_name')} placeholder="e.g. Ravi Kumar" />
            <Row>
              <Field label="Mobile" required value={form.mobile} onChange={p('mobile')} placeholder="9876543210" keyboardType="phone-pad" />
              <Field label="Alternate Mobile" value={form.alternate_mobile} onChange={p('alternate_mobile')} placeholder="Optional" keyboardType="phone-pad" />
            </Row>
            <Field label="Email" value={form.email} onChange={p('email')} placeholder="rider@example.com" keyboardType="email-address" />
            <Field label="Address" required value={form.address} onChange={p('address')} placeholder="Full residential address" multiline />
          </Card>

          {/* Vehicle & Zone */}
          <Card icon={<Bike size={15} color="#6A1B9A" strokeWidth={2} />} title="Vehicle & Zone" iconBg="#F3E5F5" iconColor="#6A1B9A">
            <FieldLabel label="Vehicle Type" required />
            <View style={s.chips}>
              {VEHICLE_OPTIONS.map(opt => (
                <Chip key={opt.value} label={opt.label} active={form.vehicle_type === opt.value} onPress={() => setForm(p2 => ({ ...p2, vehicle_type: opt.value }))} />
              ))}
            </View>
            <FieldLabel label="Delivery Zone" required />
            <View style={s.chips}>
              {ZONE_OPTIONS.map(z => (
                <Chip key={z} label={z} active={form.zone === z} onPress={() => setForm(p2 => ({ ...p2, zone: z }))} />
              ))}
            </View>
            <Row>
              <Field label="Vehicle Number" required value={form.vehicle_number} onChange={p('vehicle_number')} placeholder="MH01AB1234" />
              <Field label="License Number" required value={form.license_number} onChange={p('license_number')} placeholder="DL-0000000000000" />
            </Row>
          </Card>

          {/* ID Documents — all fields compulsory */}
          <Card icon={<Shield size={15} color="#00695C" strokeWidth={2} />} title="ID Documents" iconBg="#E0F2F1" iconColor="#00695C">

            {/* Aadhaar — compulsory */}
            <View style={s.aadhaarBox}>
              <View style={s.aadhaarHeader}>
                <View style={s.aadhaarBadge}><Text style={s.aadhaarBadgeText}>Required</Text></View>
                <Text style={s.aadhaarLabel}>Aadhaar Details</Text>
              </View>
              <Field label="Aadhaar Number" required value={form.aadhaar_number} onChange={p('aadhaar_number')} placeholder="XXXX XXXX XXXX" keyboardType="numeric" />
              <PhotoUploadField
                label="Aadhaar Card Photo"
                value={form.aadhaar_photo_url}
                onChange={p('aadhaar_photo_url')}
                storagePath={`riders/new-${Date.now()}/aadhaar`}
                aspectRatio={[8, 5]}
                hint="Front side of Aadhaar card"
              />
            </View>

            {/* Additional ID — also compulsory */}
            <View style={s.requiredBox}>
              <View style={s.requiredHeader}>
                <View style={s.requiredBadge}><Text style={s.requiredBadgeText}>Required</Text></View>
                <Text style={s.requiredLabel}>Additional ID & License</Text>
              </View>
              <FieldLabel label="ID Card Type" required />
              <View style={s.chips}>
                {ID_CARD_OPTIONS.map(opt => (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    active={form.id_card_type === opt.value}
                    onPress={() => setForm(p2 => ({ ...p2, id_card_type: p2.id_card_type === opt.value ? '' : opt.value }))}
                  />
                ))}
              </View>
              <Field label="ID Card Number" required value={form.id_card_number} onChange={p('id_card_number')} placeholder="Enter document number" />
              <Row>
                <PhotoUploadField label="ID Card Photo" value={form.id_card_photo_url} onChange={p('id_card_photo_url')} storagePath={`riders/new-${Date.now()}/id-card`} aspectRatio={[4, 3]} hint="Front side of ID" />
                <PhotoUploadField label="License Photo" value={form.license_photo_url} onChange={p('license_photo_url')} storagePath={`riders/new-${Date.now()}/license`} aspectRatio={[4, 3]} hint="Driving license" />
              </Row>
            </View>

          </Card>

          {/* Emergency Contact */}
          <Card icon={<Phone size={15} color="#E65100" strokeWidth={2} />} title="Emergency Contact" iconBg="#FFF3E0" iconColor="#E65100">
            <Row>
              <Field label="Contact Name" value={form.emergency_contact_name} onChange={p('emergency_contact_name')} placeholder="Relative's name" />
              <Field label="Contact Mobile" value={form.emergency_contact_mobile} onChange={p('emergency_contact_mobile')} placeholder="9876543210" keyboardType="phone-pad" />
            </Row>
          </Card>

          {/* Compensation */}
          <Card icon={<IndianRupee size={15} color={Colors.accentDark} strokeWidth={2} />} title="Compensation & Schedule" iconBg={Colors.accentSurface} iconColor={Colors.accentDark}>
            <Row>
              <Field label="Monthly Salary (₹)" required value={form.monthly_salary} onChange={p('monthly_salary')} placeholder="0" keyboardType="numeric" />
              <View style={{ flex: 1 }}>
                <DatePickerField
                  label="Joining Date"
                  required
                  value={form.joining_date instanceof Date ? form.joining_date : null}
                  onChange={p('joining_date')}
                  minDate={new Date(2000, 0, 1)}
                  maxDate={new Date()}
                />
              </View>
            </Row>
            <Field label="Internal Notes" value={form.notes} onChange={p('notes')} placeholder="Any additional notes about this rider…" multiline />
            <View style={s.toggleRow}>
              <View style={s.toggleLeft}>
                <View style={[s.toggleIcon, form.is_active && s.toggleIconOn]}>
                  <Check size={11} color={form.is_active ? Colors.white : Colors.neutral[400]} strokeWidth={3} />
                </View>
                <View>
                  <Text style={s.toggleLabel}>Mark as Active</Text>
                  <Text style={s.toggleHint}>Active riders receive delivery assignments</Text>
                </View>
              </View>
              <Switch value={form.is_active} onValueChange={p('is_active')} trackColor={{ true: Colors.primary, false: Colors.neutral[300] }} thumbColor={Colors.white} />
            </View>
          </Card>

          {!!formError && (
            <View style={s.errorBanner}>
              <AlertCircle size={14} color={Colors.error} strokeWidth={2} />
              <Text style={s.errorText}>{formError}</Text>
            </View>
          )}

          <View style={{ height: Spacing[6] }} />
        </View>
      </ScrollView>

      {/* ── FOOTER ── */}
      <View style={[s.footer, { paddingBottom: WEB ? Spacing[4] : insets.bottom + Spacing[3] }]}>
        <View style={s.footerInner}>
          <TouchableOpacity style={s.cancelBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.65 }]} onPress={save} disabled={saving} activeOpacity={0.85}>
            {saving
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <><UserPlus size={16} color={Colors.white} strokeWidth={2} /><Text style={s.saveText}>Add Rider</Text></>
            }
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

/* ── helpers ── */

function Card({ icon, title, iconBg, iconColor, children }: { icon: React.ReactNode; title: string; iconBg: string; iconColor: string; children: React.ReactNode }) {
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <View style={[s.cardIconWrap, { backgroundColor: iconBg }]}>{icon}</View>
        <Text style={s.cardTitle}>{title}</Text>
      </View>
      <View style={s.cardDivider} />
      <View style={s.cardBody}>{children}</View>
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={s.row}>{children}</View>;
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={s.fieldLabel}>
      {label}{required ? <Text style={s.req}> *</Text> : null}
    </Text>
  );
}

function Field({ label, required, value, onChange, placeholder, multiline, keyboardType }: {
  label: string; required?: boolean; value: string; onChange: (v: string) => void;
  placeholder?: string; multiline?: boolean; keyboardType?: any;
}) {
  return (
    <View style={s.fieldWrap}>
      <FieldLabel label={label} required={required} />
      <TextInput
        style={[s.input, multiline ? s.inputMulti : null]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.textDisabled}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        keyboardType={keyboardType}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.chip, active && s.chipActive]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },

  /* top bar */
  topBar: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  topBarInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: WEB ? Spacing[8] : Spacing[5],
    paddingVertical: Spacing[3],
    ...(WEB ? { maxWidth: CONTENT_MAX + 120, alignSelf: 'center' as any, width: '100%' } : {}),
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.md, color: Colors.textPrimary },

  /* scroll */
  scroll: { flex: 1 },

  /* hero */
  hero: { backgroundColor: Colors.primary },
  heroInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing[5], paddingHorizontal: WEB ? Spacing[8] : Spacing[5],
    ...(WEB ? { maxWidth: CONTENT_MAX + 120, alignSelf: 'center' as any, width: '100%' } : {}),
  },
  heroLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[4], flex: 1 },
  heroIconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontFamily: Typography.fontFamily.bold, fontSize: WEB ? Typography.size.xl : Typography.size.lg, color: Colors.white },
  heroSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.13)', borderRadius: Radius.full, paddingHorizontal: Spacing[3], paddingVertical: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.neutral[400] },
  statusDotOn: { backgroundColor: '#69F0AE' },
  statusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.6)' },
  statusTextOn: { color: '#69F0AE' },

  /* content */
  contentWrap: {
    paddingHorizontal: WEB ? Spacing[8] : Spacing[4],
    paddingTop: Spacing[5],
    gap: Spacing[4],
    ...(WEB ? { maxWidth: CONTENT_MAX + 120, alignSelf: 'center' as any, width: '100%' } : {}),
  },

  /* card */
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingHorizontal: Spacing[5], paddingTop: Spacing[4], paddingBottom: Spacing[3] },
  cardIconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  cardDivider: { height: 1, backgroundColor: Colors.divider },
  cardBody: { padding: Spacing[5], gap: Spacing[4] },

  /* row */
  row: { flexDirection: WEB ? 'row' : 'column', gap: Spacing[4] },

  /* field */
  fieldWrap: { flex: 1, gap: Spacing[2] },
  fieldLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  req: { color: Colors.error },
  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.full,
    paddingVertical: 11, paddingHorizontal: Spacing[4],
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base,
    color: Colors.textPrimary, backgroundColor: Colors.white,
  },
  inputMulti: { borderRadius: Radius.lg, minHeight: 88, paddingTop: Spacing[3] },

  /* chips */
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2], marginBottom: Spacing[1] },
  chip: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.full,
    paddingVertical: 7, paddingHorizontal: Spacing[4], backgroundColor: Colors.white,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  chipText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  chipTextActive: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.primary },

  /* aadhaar box — green accent */
  aadhaarBox: { borderWidth: 1.5, borderColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing[4], gap: Spacing[4], backgroundColor: Colors.primarySurface },
  aadhaarHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  aadhaarBadge: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: Spacing[3], paddingVertical: 3 },
  aadhaarBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.white, letterSpacing: 0.3 },
  aadhaarLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary },

  /* required box — teal accent for additional ID */
  requiredBox: { borderWidth: 1.5, borderColor: '#00695C', borderRadius: Radius.lg, padding: Spacing[4], gap: Spacing[4], backgroundColor: '#E0F2F1' },
  requiredHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  requiredBadge: { backgroundColor: '#00695C', borderRadius: Radius.full, paddingHorizontal: Spacing[3], paddingVertical: 3 },
  requiredBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.white, letterSpacing: 0.3 },
  requiredLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: '#00695C' },

  /* toggle */
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing[4], backgroundColor: Colors.neutral[50], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], flex: 1 },
  toggleIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.neutral[200], alignItems: 'center', justifyContent: 'center' },
  toggleIconOn: { backgroundColor: Colors.primary },
  toggleLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  toggleHint: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },

  /* error */
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.errorSurface, borderWidth: 1, borderColor: '#FFCDD2', borderRadius: Radius.md, padding: Spacing[4] },
  errorText: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error },

  /* footer */
  footer: { backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing[4], ...Shadow.lg },
  footerInner: {
    flexDirection: 'row', gap: Spacing[3],
    paddingHorizontal: WEB ? Spacing[8] : Spacing[5],
    ...(WEB ? { maxWidth: CONTENT_MAX + 120, alignSelf: 'center' as any, width: '100%' } : {}),
  },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' },
  cancelText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  saveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2], paddingVertical: 14, borderRadius: Radius.full, backgroundColor: Colors.primary },
  saveText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
});
