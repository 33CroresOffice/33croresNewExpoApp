import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Hop as Home, Briefcase, MapPin, Building2, Landmark, User } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

const PLACE_CATEGORIES = [
  { label: 'Individual', value: 'individual' },
  { label: 'Apartment', value: 'apartment' },
  { label: 'Business', value: 'business' },
  { label: 'Temple', value: 'temple' },
];

const ADDRESS_TYPES = [
  { label: 'Home', value: 'Home' },
  { label: 'Work', value: 'Office' },
  { label: 'Other', value: 'Other' },
];

export default function AddressFormScreen() {
  const insets = useSafeAreaInsets();
  const { id, returnTo, planId } = useLocalSearchParams<{ id?: string; returnTo?: string; planId?: string }>();
  const { profile } = useAuthStore();

  const [placeCategory, setPlaceCategory] = useState('individual');
  const [flatPlotNo, setFlatPlotNo] = useState('');
  const [apartmentName, setApartmentName] = useState('');
  const [locality, setLocality] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [landmark, setLandmark] = useState('');
  const [label, setLabel] = useState('Home');
  const [isDefault, setIsDefault] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (id) {
      supabase.from('addresses').select('*').eq('id', id).single().then(({ data }) => {
        if (data) {
          setPlaceCategory(data.place_category ?? 'individual');
          setLabel(data.label);
          setCity(data.city);
          setState(data.state);
          setPincode(data.pincode);
          setIsDefault(data.is_default);
          setLandmark(data.landmark ?? '');
          setApartmentName(data.apartment_name ?? '');
          // street field was previously "flat, locality combined" — try to split
          const street = data.street ?? '';
          const parts = street.split(',').map((s: string) => s.trim());
          setFlatPlotNo(parts[0] ?? '');
          setLocality(parts.slice(1).join(', '));
        }
      });
    }
  }, [id]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!flatPlotNo.trim()) e.flatPlotNo = 'Flat / Apartment / Plot No. is required';
    if (!locality.trim()) e.locality = 'Locality is required';
    if (!city.trim()) e.city = 'Town / City is required';
    if (!state.trim()) e.state = 'State is required';
    if (!/^\d{6}$/.test(pincode)) e.pincode = 'Enter a valid 6-digit pincode';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || !profile) return;
    setLoading(true);

    try {
      if (isDefault) {
        await supabase.from('addresses').update({ is_default: false }).eq('user_id', profile.id);
      }

      const street = locality.trim()
        ? `${flatPlotNo.trim()}, ${locality.trim()}`
        : flatPlotNo.trim();

      const payload = {
        user_id: profile.id,
        label,
        place_category: placeCategory,
        street,
        apartment_name: apartmentName.trim() || null,
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        landmark: landmark.trim() || null,
        is_default: isDefault,
      };

      if (id) {
        await supabase.from('addresses').update(payload).eq('id', id);
      } else {
        await supabase.from('addresses').insert(payload);
      }

      if (returnTo === 'checkout' && planId) {
        router.replace({ pathname: '/(customer)/checkout', params: { planId } });
      } else {
        router.back();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>{id ? 'Edit Address' : 'Add Address'}</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Place Category */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Place Category</Text>
            <View style={styles.chipGrid}>
              {PLACE_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.value}
                  style={[styles.chip, placeCategory === cat.value && styles.chipSelected]}
                  onPress={() => setPlaceCategory(cat.value)}
                >
                  <Text style={[styles.chipText, placeCategory === cat.value && styles.chipTextSelected]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Flat / Apartment / Plot No. */}
          <Input
            label="Flat / Apartment / Plot No. *"
            value={flatPlotNo}
            onChangeText={setFlatPlotNo}
            placeholder="e.g. Flat 4B, House No. 12"
            error={errors.flatPlotNo}
          />

          {/* Apartment Name (optional) */}
          <Input
            label="Apartment / Building Name"
            value={apartmentName}
            onChangeText={setApartmentName}
            placeholder="e.g. Green Valley Residency"
          />

          {/* Locality */}
          <Input
            label="Locality / Area *"
            value={locality}
            onChangeText={setLocality}
            placeholder="e.g. Banjara Hills"
            error={errors.locality}
          />

          {/* Town / City */}
          <Input
            label="Town / City *"
            value={city}
            onChangeText={setCity}
            placeholder="e.g. Hyderabad"
            error={errors.city}
          />

          {/* State */}
          <Input
            label="State *"
            value={state}
            onChangeText={setState}
            placeholder="e.g. Telangana"
            error={errors.state}
          />

          {/* Pincode */}
          <Input
            label="Pincode *"
            value={pincode}
            onChangeText={(t) => setPincode(t.replace(/\D/g, '').slice(0, 6))}
            placeholder="500034"
            keyboardType="number-pad"
            maxLength={6}
            error={errors.pincode}
          />

          {/* Landmark */}
          <Input
            label="Landmark"
            value={landmark}
            onChangeText={setLandmark}
            placeholder="e.g. Near Apollo Hospital"
          />

          {/* Address Type */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Address Type</Text>
            <View style={styles.labelRow}>
              {ADDRESS_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.labelChip, label === t.value && styles.labelChipSelected]}
                  onPress={() => setLabel(t.value)}
                >
                  <Text style={[styles.labelChipText, label === t.value && styles.labelChipTextSelected]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Default address toggle */}
          <TouchableOpacity style={styles.defaultRow} onPress={() => setIsDefault(!isDefault)}>
            <View style={[styles.checkbox, isDefault && styles.checkboxChecked]}>
              {isDefault && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.defaultLabel}>Set as default delivery address</Text>
          </TouchableOpacity>

          <Button
            label={id ? 'Update Address' : 'Save Address'}
            onPress={handleSave}
            loading={loading}
            size="lg"
            fullWidth
          />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  backBtn: { padding: Spacing[1] },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    color: Colors.textPrimary,
  },
  content: { padding: Spacing[5], gap: Spacing[4], paddingBottom: Spacing[8] },

  section: { gap: Spacing[2] },
  sectionLabel: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  chip: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  chipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  chipText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  chipTextSelected: { color: Colors.primaryDark },

  labelRow: { flexDirection: 'row', gap: Spacing[3] },
  labelChip: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  labelChipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  labelChipText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  labelChipTextSelected: { color: Colors.primaryDark },

  defaultRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkmark: { color: Colors.white, fontSize: 13, fontWeight: 'bold' },
  defaultLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
});
