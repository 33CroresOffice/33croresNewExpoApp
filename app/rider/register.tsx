import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  ArrowRight,
  Bike,
  User,
  Phone,
  MapPin,
  Truck,
} from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import Input from '@/components/ui/Input';

const { width } = Dimensions.get('window');

type VehicleType = 'bike' | 'scooter' | 'bicycle' | 'foot';
const VEHICLE_OPTIONS: { value: VehicleType; label: string }[] = [
  { value: 'bike', label: 'Bike' },
  { value: 'scooter', label: 'Scooter' },
  { value: 'bicycle', label: 'Bicycle' },
  { value: 'foot', label: 'On Foot' },
];

const ZONE_OPTIONS = ['North', 'South', 'East', 'West', 'Central', 'General'];

const STEPS = ['Personal', 'Vehicle', 'Location'];

export default function RiderRegisterScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Step 0 – Personal
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [alternateMobile, setAlternateMobile] = useState('');
  const [email, setEmail] = useState('');

  // Step 1 – Vehicle
  const [vehicleType, setVehicleType] = useState<VehicleType>('bike');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');

  // Step 2 – Location
  const [zone, setZone] = useState('General');
  const [address, setAddress] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyMobile, setEmergencyMobile] = useState('');

  const validateStep = (): boolean => {
    setError('');
    if (step === 0) {
      if (!fullName.trim()) { setError('Full name is required'); return false; }
      if (!mobile.trim() || !/^[6-9]\d{9}$/.test(mobile.trim())) {
        setError('Enter a valid 10-digit Indian mobile number'); return false;
      }
    }
    if (step === 1) {
      if (!vehicleNumber.trim()) { setError('Vehicle number is required'); return false; }
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      // Check if mobile already registered
      const { data: existing } = await supabase
        .from('riders')
        .select('id, approval_status')
        .eq('mobile', mobile.trim())
        .maybeSingle();

      if (existing) {
        const msg = existing.approval_status === 'pending_approval'
          ? 'Your registration is already submitted and pending approval.'
          : existing.approval_status === 'approved'
          ? 'This mobile number is already registered. Please log in.'
          : 'Your previous application was rejected. Please contact admin.';
        setError(msg);
        setSaving(false);
        return;
      }

      const { error: insertError } = await supabase.from('riders').insert({
        full_name: fullName.trim(),
        mobile: mobile.trim(),
        alternate_mobile: alternateMobile.trim() || null,
        email: email.trim() || null,
        vehicle_type: vehicleType,
        vehicle_number: vehicleNumber.trim(),
        license_number: licenseNumber.trim() || null,
        zone,
        address: address.trim() || null,
        emergency_contact_name: emergencyName.trim() || null,
        emergency_contact_mobile: emergencyMobile.trim() || null,
        is_active: false,
        approval_status: 'pending_approval',
        registered_at: new Date().toISOString(),
        joining_date: new Date().toISOString().slice(0, 10),
      });

      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }

      router.replace({ pathname: '/rider/register-success', params: { mobile: mobile.trim() } });
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderStep0 = () => (
    <View style={styles.fieldGroup}>
      <Input
        label="Full Name *"
        value={fullName}
        onChangeText={setFullName}
        placeholder="Enter your full name"
        prefix={<User size={18} color={Colors.textTertiary} />}
        autoCapitalize="words"
      />
      <Input
        label="Mobile Number *"
        value={mobile}
        onChangeText={(t) => setMobile(t.replace(/[^0-9]/g, '').slice(0, 10))}
        keyboardType="phone-pad"
        maxLength={10}
        placeholder="98765 43210"
        prefix={
          <View style={styles.countryCode}>
            <Text style={styles.flag}>🇮🇳</Text>
            <Text style={styles.code}>+91</Text>
          </View>
        }
      />
      <Input
        label="Alternate Mobile"
        value={alternateMobile}
        onChangeText={(t) => setAlternateMobile(t.replace(/[^0-9]/g, '').slice(0, 10))}
        keyboardType="phone-pad"
        maxLength={10}
        placeholder="Optional"
        prefix={<Phone size={18} color={Colors.textTertiary} />}
      />
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholder="Optional"
      />
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.fieldGroup}>
      <View>
        <Text style={styles.fieldLabel}>Vehicle Type *</Text>
        <View style={styles.vehicleGrid}>
          {VEHICLE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.vehicleBtn, vehicleType === opt.value && styles.vehicleBtnActive]}
              onPress={() => setVehicleType(opt.value)}
              activeOpacity={0.8}
            >
              <Truck size={16} color={vehicleType === opt.value ? Colors.white : Colors.textSecondary} strokeWidth={1.8} />
              <Text style={[styles.vehicleBtnText, vehicleType === opt.value && styles.vehicleBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <Input
        label="Vehicle Number *"
        value={vehicleNumber}
        onChangeText={setVehicleNumber}
        placeholder="e.g. OD05AB1234"
        autoCapitalize="characters"
      />
      <Input
        label="License Number"
        value={licenseNumber}
        onChangeText={setLicenseNumber}
        placeholder="Optional"
        autoCapitalize="characters"
      />
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.fieldGroup}>
      <View>
        <Text style={styles.fieldLabel}>Delivery Zone</Text>
        <View style={styles.zoneGrid}>
          {ZONE_OPTIONS.map((z) => (
            <TouchableOpacity
              key={z}
              style={[styles.zoneBtn, zone === z && styles.zoneBtnActive]}
              onPress={() => setZone(z)}
              activeOpacity={0.8}
            >
              <Text style={[styles.zoneBtnText, zone === z && styles.zoneBtnTextActive]}>{z}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <Input
        label="Home Address"
        value={address}
        onChangeText={setAddress}
        placeholder="Your residential address"
        prefix={<MapPin size={18} color={Colors.textTertiary} />}
      />
      <Input
        label="Emergency Contact Name"
        value={emergencyName}
        onChangeText={setEmergencyName}
        placeholder="Optional"
        prefix={<User size={18} color={Colors.textTertiary} />}
      />
      <Input
        label="Emergency Contact Mobile"
        value={emergencyMobile}
        onChangeText={(t) => setEmergencyMobile(t.replace(/[^0-9]/g, '').slice(0, 10))}
        keyboardType="phone-pad"
        maxLength={10}
        placeholder="Optional"
        prefix={<Phone size={18} color={Colors.textTertiary} />}
      />
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top, paddingBottom: insets.bottom + Spacing[8] }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={[styles.backBtnWrap, { top: insets.top + Spacing[3] }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => step > 0 ? setStep(step - 1) : router.back()} activeOpacity={0.7}>
            <ArrowLeft size={20} color={Colors.white} strokeWidth={2} />
          </TouchableOpacity>
        </View>
        <Image
          source={{ uri: 'https://images.pexels.com/photos/1402787/pexels-photo-1402787.jpeg?auto=compress&cs=tinysrgb&w=800' }}
          style={styles.heroImage}
          resizeMode="cover"
        />
        <View style={styles.heroOverlay} />
        <View style={[styles.heroBrand, { top: insets.top + Spacing[3] + 48 + Spacing[3] }]}>
          <Bike size={20} color="#3AAFE4" strokeWidth={1.8} />
          <Text style={styles.heroBrandText}>Rider Registration</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          {/* Step indicator */}
          <View style={styles.stepIndicator}>
            {STEPS.map((label, i) => (
              <View key={label} style={styles.stepItem}>
                <View style={[styles.stepDot, i <= step && styles.stepDotActive, i < step && styles.stepDotDone]}>
                  <Text style={[styles.stepDotText, i <= step && styles.stepDotTextActive]}>{i + 1}</Text>
                </View>
                <Text style={[styles.stepLabel, i <= step && styles.stepLabelActive]}>{label}</Text>
                {i < STEPS.length - 1 && (
                  <View style={[styles.stepLine, i < step && styles.stepLineActive]} />
                )}
              </View>
            ))}
          </View>

          <View style={styles.cardHeader}>
            <View style={styles.iconBadge}>
              <Bike size={22} color={Colors.primary} strokeWidth={1.8} />
            </View>
            <Text style={styles.title}>
              {step === 0 ? 'Personal Details' : step === 1 ? 'Vehicle Info' : 'Location & Emergency'}
            </Text>
            <Text style={styles.subtitle}>
              {step === 0
                ? 'Tell us who you are so we can set up your rider profile'
                : step === 1
                ? 'What vehicle will you use for deliveries?'
                : 'Help us know your zone and emergency contact'}
            </Text>
          </View>

          {step === 0 && renderStep0()}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.nextBtn, saving && styles.nextBtnDisabled]}
            onPress={handleNext}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <>
                <Text style={styles.nextBtnText}>
                  {step < STEPS.length - 1 ? 'Next' : 'Submit Registration'}
                </Text>
                <ArrowRight size={18} color={Colors.white} strokeWidth={2.2} />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/rider/login')} style={styles.loginLink}>
            <Text style={styles.loginLinkText}>Already registered? Sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1 },
  backBtnWrap: { position: 'absolute', left: Spacing[5], zIndex: 10 },
  backBtn: {
    width: 40, height: 40, borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroImage: { width, height: 220 },
  heroOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 220,
    backgroundColor: 'rgba(10,20,30,0.55)',
  },
  heroBrand: {
    position: 'absolute', left: Spacing[6],
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1, borderColor: 'rgba(58,175,228,0.4)',
    paddingHorizontal: Spacing[3], paddingVertical: 8,
    borderRadius: 30,
  },
  heroBrandText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base, color: Colors.white,
  },
  card: {
    flex: 1, backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    marginTop: -Radius.xl,
    paddingHorizontal: Spacing[6], paddingTop: Spacing[7], paddingBottom: Spacing[6],
    gap: Spacing[5],
  },
  stepIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 0 },
  stepItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.neutral[100], borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  stepDotDone: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  stepDotText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 12, color: Colors.textTertiary,
  },
  stepDotTextActive: { color: Colors.primary },
  stepLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 11,
    color: Colors.textTertiary,
  },
  stepLabelActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansMedium },
  stepLine: { width: 24, height: 1.5, backgroundColor: Colors.border, marginHorizontal: 4 },
  stepLineActive: { backgroundColor: Colors.primary },
  cardHeader: { gap: Spacing[2] },
  iconBadge: {
    width: 52, height: 52, borderRadius: Radius.lg,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing[2],
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['3xl'], color: Colors.textPrimary, letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base, color: Colors.textSecondary,
    lineHeight: Typography.size.base * 1.6,
  },
  fieldGroup: { gap: Spacing[4] },
  fieldLabel: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm,
    color: Colors.textSecondary, marginBottom: Spacing[2],
  },
  vehicleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  vehicleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: Spacing[3], paddingVertical: Spacing[2],
    borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  vehicleBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  vehicleBtnText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  vehicleBtnTextActive: { color: Colors.white },
  zoneGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  zoneBtn: {
    paddingHorizontal: Spacing[3], paddingVertical: Spacing[2],
    borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  zoneBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  zoneBtnText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  zoneBtnTextActive: { color: Colors.white },
  errorBox: {
    backgroundColor: Colors.errorSurface, borderRadius: Radius.md, padding: Spacing[3],
  },
  errorText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error,
  },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2],
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    paddingVertical: Spacing[4], minHeight: 56,
  },
  nextBtnDisabled: { opacity: 0.5 },
  nextBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.md, color: Colors.white, letterSpacing: 0.2,
  },
  loginLink: { alignItems: 'center', paddingVertical: Spacing[2] },
  loginLinkText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: Colors.textTertiary, textDecorationLine: 'underline',
  },
  countryCode: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingRight: Spacing[2], borderRightWidth: 1, borderRightColor: Colors.border,
  },
  flag: { fontSize: 16 },
  code: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.base, color: Colors.textPrimary },
});
