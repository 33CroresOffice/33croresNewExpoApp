import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
  UIManager,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, MapPin, Building2, ChevronDown, Check, Search, X, Plus } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import Button from '@/components/ui/Button';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

interface Locality {
  id: number;
  locality_name: string;
  unique_code: string;
  pincode: string;
  status: string;
}

interface Apartment {
  id: number;
  locality_id: string;
  apartment_name: string | null;
  status: string;
}

export default function AddressFormScreen() {
  const insets = useSafeAreaInsets();
  const { id, returnTo, planId } = useLocalSearchParams<{ id?: string; returnTo?: string; planId?: string }>();
  const { profile } = useAuthStore();

  const [placeCategory, setPlaceCategory] = useState('individual');
  const [localityId, setLocalityId] = useState('');
  const [apartmentId, setApartmentId] = useState<string>('');
  const [customApartmentName, setCustomApartmentName] = useState('');
  const [flatPlotNo, setFlatPlotNo] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('');
  const [stateField, setStateField] = useState('');
  const [pincode, setPincode] = useState('');
  const [label, setLabel] = useState('Home');
  const [isDefault, setIsDefault] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [localities, setLocalities] = useState<Locality[]>([]);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [loadingLocalities, setLoadingLocalities] = useState(false);
  const [loadingApartments, setLoadingApartments] = useState(false);

  const [localityDropdown, setLocalityDropdown] = useState(false);
  const [apartmentDropdown, setApartmentDropdown] = useState(false);
  const [localitySearch, setLocalitySearch] = useState('');
  const [apartmentSearch, setApartmentSearch] = useState('');

  const localitySearchRef = useRef<TextInput>(null);
  const apartmentSearchRef = useRef<TextInput>(null);

  const resetForm = useCallback(() => {
    setPlaceCategory('individual');
    setLocalityId('');
    setApartmentId('');
    setCustomApartmentName('');
    setFlatPlotNo('');
    setLandmark('');
    setCity('');
    setStateField('');
    setPincode('');
    setLabel('Home');
    setIsDefault(false);
    setErrors({});
    setApartments([]);
    setLocalityDropdown(false);
    setApartmentDropdown(false);
    setLocalitySearch('');
    setApartmentSearch('');
  }, []);

  // Reset form state when entering "add new" mode (no id) on focus
  useFocusEffect(
    useCallback(() => {
      if (!id) {
        resetForm();
      }
    }, [id, resetForm])
  );

  const selectedLocality = localities.find(l => l.unique_code === localityId);
  const selectedApartment = apartments.find(a => a.id === Number(apartmentId));

  // Whether the apartment field should show as a free-text input (no apartments in locality)
  const showCustomApartmentInput =
    placeCategory === 'apartment' && localityId && !loadingApartments && apartments.length === 0;

  const filteredLocalities = localities.filter(l =>
    l.locality_name.toLowerCase().includes(localitySearch.toLowerCase().trim()) ||
    l.unique_code.toLowerCase().includes(localitySearch.toLowerCase().trim()),
  );

  const filteredApartments = apartments.filter(a =>
    (a.apartment_name ?? '').toLowerCase().includes(apartmentSearch.toLowerCase().trim()),
  );

  // Load localities
  useEffect(() => {
    setLoadingLocalities(true);
    supabase
      .from('localities')
      .select('id, locality_name, unique_code, pincode, status')
      .eq('status', 'active')
      .order('locality_name')
      .then(({ data }) => {
        setLocalities((data as Locality[]) ?? []);
        setLoadingLocalities(false);
      });
  }, []);

  // Load apartments when locality changes
  const fetchApartments = useCallback(async (code: string) => {
    if (!code) {
      setApartments([]);
      return;
    }
    setLoadingApartments(true);
    setApartmentId('');
    setCustomApartmentName('');
    const { data } = await supabase
      .from('flower__apartment')
      .select('id, locality_id, apartment_name, status')
      .eq('locality_id', code)
      .eq('status', 'active')
      .order('apartment_name');
    setApartments((data as Apartment[]) ?? []);
    setLoadingApartments(false);
  }, []);

  const onLocalitySelect = (loc: Locality) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setLocalityId(loc.unique_code);
    setPincode(loc.pincode || '');
    setLocalityDropdown(false);
    setLocalitySearch('');
    fetchApartments(loc.unique_code);
  };

  // Load existing address for editing
  useEffect(() => {
    if (!id) return;
    supabase.from('addresses').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) return;
      setPlaceCategory(data.place_category ?? 'individual');
      setLabel(data.label);
      setCity(data.city ?? '');
      setStateField(data.state ?? '');
      setPincode(data.pincode ?? '');
      setIsDefault(data.is_default);
      setLandmark(data.landmark ?? '');
      setFlatPlotNo(data.street ?? '');
      if (data.locality_id) {
        setLocalityId(data.locality_id);
        fetchApartments(data.locality_id).then(() => {
          if (data.apartment_id) {
            setApartmentId(String(data.apartment_id));
          } else if (data.apartment_name && placeCategory === 'apartment') {
            setCustomApartmentName(data.apartment_name);
          }
        });
      }
    });
  }, [id, fetchApartments]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!placeCategory) e.placeCategory = 'Select a place category';
    if (!localityId) e.locality = 'Select a locality';
    if (placeCategory === 'apartment') {
      if (showCustomApartmentInput) {
        if (!customApartmentName.trim()) e.apartment = 'Enter an apartment name';
      } else if (!apartmentId) {
        e.apartment = 'Select an apartment';
      }
    }
    if (!flatPlotNo.trim()) e.flatPlotNo = 'Flat / Plot No. is required';
    if (!city.trim()) e.city = 'Town / City is required';
    if (!stateField.trim()) e.state = 'State is required';
    if (!/^\d{6}$/.test(pincode)) e.pincode = 'Pincode is auto-filled from locality';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || !profile) return;
    setLoading(true);

    try {
      // If apartment category with custom name, create the apartment record first
      let finalApartmentId: number | null = null;
      let finalApartmentName: string | null = null;

      if (placeCategory === 'apartment') {
        if (showCustomApartmentInput && customApartmentName.trim()) {
          const { data: newApt, error: aptError } = await supabase
            .from('flower__apartment')
            .insert({
              locality_id: localityId,
              apartment_name: customApartmentName.trim(),
              status: 'active',
            })
            .select('id, apartment_name')
            .single();
          if (!aptError && newApt) {
            finalApartmentId = newApt.id;
            finalApartmentName = newApt.apartment_name;
          }
        } else if (apartmentId) {
          finalApartmentId = Number(apartmentId);
          finalApartmentName = selectedApartment?.apartment_name ?? null;
        }
      }

      if (isDefault) {
        await supabase.from('addresses').update({ is_default: false }).eq('user_id', profile.id);
      }

      const payload = {
        user_id: profile.id,
        label,
        place_category: placeCategory,
        street: flatPlotNo.trim(),
        locality_id: localityId || null,
        apartment_id: finalApartmentId,
        apartment_name: finalApartmentName,
        city: city.trim(),
        state: stateField.trim(),
        pincode: pincode.trim(),
        landmark: landmark.trim() || null,
        is_default: isDefault,
        latitude: null,
        longitude: null,
      };

      if (id) {
        await supabase.from('addresses').update(payload).eq('id', id);
      } else {
        await supabase.from('addresses').insert(payload);
      }

      if (returnTo === 'checkout' && planId) {
        router.replace({ pathname: '/(customer)/checkout', params: { planId } });
      } else if (returnTo === 'custom-order') {
        const { data: inserted } = await supabase
          .from('addresses')
          .select('id')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        router.replace({
          pathname: '/(customer)/custom-order',
          params: { newAddressId: inserted?.id ?? '' },
        });
      } else {
        router.replace('/(customer)/addresses');
      }
      resetForm();
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
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setPlaceCategory(cat.value);
                    if (cat.value !== 'apartment') {
                      setApartmentId('');
                      setCustomApartmentName('');
                    }
                  }}
                >
                  <Text style={[styles.chipText, placeCategory === cat.value && styles.chipTextSelected]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Locality Dropdown */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Locality *</Text>
            <View style={styles.dropdownContainer}>
              <TouchableOpacity
                style={[styles.dropdownBtn, localityDropdown && styles.dropdownBtnOpen, errors.locality && styles.dropdownBtnError]}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setLocalityDropdown(o => !o);
                  setApartmentDropdown(false);
                  if (!localityDropdown) setLocalitySearch('');
                }}
                activeOpacity={0.7}
              >
                <View style={styles.dropdownBtnLeft}>
                  <MapPin size={16} color={selectedLocality ? Colors.primary : Colors.textDisabled} strokeWidth={1.8} />
                  {loadingLocalities ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Text
                      style={[styles.dropdownBtnText, !selectedLocality && styles.dropdownPlaceholder]}
                      numberOfLines={1}
                    >
                      {selectedLocality ? selectedLocality.locality_name : 'Select locality'}
                    </Text>
                  )}
                </View>
                <ChevronDown
                  size={18}
                  color={Colors.textTertiary}
                  strokeWidth={2}
                  style={{ transform: [{ rotate: localityDropdown ? '180deg' : '0deg' }] }}
                />
              </TouchableOpacity>

              {localityDropdown && (
                <View style={styles.dropdownList}>
                  {/* Search box */}
                  <View style={styles.searchBox}>
                    <Search size={16} color={Colors.textTertiary} strokeWidth={1.8} />
                    <TextInput
                      ref={localitySearchRef}
                      style={styles.searchInput}
                      placeholder="Search locality..."
                      placeholderTextColor={Colors.textDisabled}
                      value={localitySearch}
                      onChangeText={setLocalitySearch}
                      autoCorrect={false}
                    />
                    {localitySearch.length > 0 && (
                      <TouchableOpacity onPress={() => setLocalitySearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <X size={16} color={Colors.textTertiary} strokeWidth={2} />
                      </TouchableOpacity>
                    )}
                  </View>

                  <ScrollView style={styles.dropdownScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                    {filteredLocalities.length === 0 ? (
                      <View style={styles.dropdownEmptyItem}>
                        <Text style={styles.dropdownEmptyText}>No localities found</Text>
                      </View>
                    ) : (
                      filteredLocalities.map(loc => {
                        const sel = localityId === loc.unique_code;
                        return (
                          <TouchableOpacity
                            key={loc.id}
                            style={[styles.dropdownItem, sel && styles.dropdownItemActive]}
                            onPress={() => onLocalitySelect(loc)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.dropdownItemLeft}>
                              <MapPin size={15} color={sel ? Colors.primary : Colors.textTertiary} strokeWidth={1.8} />
                              <Text style={[styles.dropdownItemText, sel && styles.dropdownItemTextActive]} numberOfLines={1}>
                                {loc.locality_name}
                              </Text>
                            </View>
                            <View style={styles.dropdownItemRight}>
                              <View style={[styles.dropdownCodeBadge, sel && styles.dropdownCodeBadgeActive]}>
                                <Text style={[styles.dropdownCodeText, sel && styles.dropdownCodeTextActive]}>{loc.unique_code}</Text>
                              </View>
                              {sel && <Check size={14} color={Colors.primary} strokeWidth={2.5} />}
                            </View>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              )}
            </View>
            {errors.locality ? <Text style={styles.errorText}>{errors.locality}</Text> : null}
          </View>

          {/* Apartment field — only for apartment category */}
          {placeCategory === 'apartment' && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Apartment *</Text>

              {/* Custom text input when no apartments exist for the locality */}
              {showCustomApartmentInput ? (
                <View style={styles.customAptContainer}>
                  <View style={styles.customAptInfo}>
                    <View style={styles.customAptBadge}>
                      <Plus size={12} color={Colors.primary} strokeWidth={2.5} />
                      <Text style={styles.customAptBadgeText}>New apartment</Text>
                    </View>
                    <Text style={styles.customAptInfoText}>
                      No apartments found in {selectedLocality?.locality_name ?? 'this locality'}. Enter the name below to add it.
                    </Text>
                  </View>
                  <TextInput
                    style={[styles.textInput, errors.apartment && styles.textInputError]}
                    value={customApartmentName}
                    onChangeText={setCustomApartmentName}
                    placeholder="Enter apartment name"
                    placeholderTextColor={Colors.textDisabled}
                  />
                  {errors.apartment ? <Text style={styles.errorText}>{errors.apartment}</Text> : null}
                </View>
              ) : (
                /* Normal dropdown with search */
                <View style={styles.dropdownContainer}>
                  <TouchableOpacity
                    style={[
                      styles.dropdownBtn,
                      apartmentDropdown && styles.dropdownBtnOpen,
                      !localityId && styles.dropdownBtnDisabled,
                      errors.apartment && styles.dropdownBtnError,
                    ]}
                    onPress={() => {
                      if (!localityId) return;
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setApartmentDropdown(o => !o);
                      setLocalityDropdown(false);
                      if (!apartmentDropdown) setApartmentSearch('');
                    }}
                    activeOpacity={0.7}
                    disabled={!localityId}
                  >
                    <View style={styles.dropdownBtnLeft}>
                      <Building2 size={16} color={selectedApartment ? Colors.primary : Colors.textDisabled} strokeWidth={1.8} />
                      {loadingApartments ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                      ) : (
                        <Text
                          style={[styles.dropdownBtnText, !selectedApartment && styles.dropdownPlaceholder]}
                          numberOfLines={1}
                        >
                          {selectedApartment
                            ? selectedApartment.apartment_name ?? '(Unnamed)'
                            : localityId
                              ? 'Select apartment'
                              : 'Select locality first'}
                        </Text>
                      )}
                    </View>
                    <ChevronDown
                      size={18}
                      color={localityId ? Colors.textTertiary : Colors.textDisabled}
                      strokeWidth={2}
                      style={{ transform: [{ rotate: apartmentDropdown ? '180deg' : '0deg' }] }}
                    />
                  </TouchableOpacity>

                  {apartmentDropdown && (
                    <View style={styles.dropdownList}>
                      {/* Search box */}
                      <View style={styles.searchBox}>
                        <Search size={16} color={Colors.textTertiary} strokeWidth={1.8} />
                        <TextInput
                          ref={apartmentSearchRef}
                          style={styles.searchInput}
                          placeholder="Search apartment..."
                          placeholderTextColor={Colors.textDisabled}
                          value={apartmentSearch}
                          onChangeText={setApartmentSearch}
                          autoCorrect={false}
                        />
                        {apartmentSearch.length > 0 && (
                          <TouchableOpacity onPress={() => setApartmentSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <X size={16} color={Colors.textTertiary} strokeWidth={2} />
                          </TouchableOpacity>
                        )}
                      </View>

                      <ScrollView style={styles.dropdownScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                        {filteredApartments.length === 0 ? (
                          <View style={styles.dropdownEmptyItem}>
                            <Text style={styles.dropdownEmptyText}>No apartments found</Text>
                          </View>
                        ) : (
                          filteredApartments.map(apt => {
                            const sel = Number(apartmentId) === apt.id;
                            return (
                              <TouchableOpacity
                                key={apt.id}
                                style={[styles.dropdownItem, sel && styles.dropdownItemActive]}
                                onPress={() => {
                                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                  setApartmentId(String(apt.id));
                                  setApartmentDropdown(false);
                                  setApartmentSearch('');
                                }}
                                activeOpacity={0.7}
                              >
                                <View style={styles.dropdownItemLeft}>
                                  <Building2 size={15} color={sel ? Colors.primary : Colors.textTertiary} strokeWidth={1.8} />
                                  <Text style={[styles.dropdownItemText, sel && styles.dropdownItemTextActive]} numberOfLines={1}>
                                    {apt.apartment_name ?? '(Unnamed)'}
                                  </Text>
                                </View>
                                {sel && <Check size={14} color={Colors.primary} strokeWidth={2.5} />}
                              </TouchableOpacity>
                            );
                          })
                        )}
                      </ScrollView>
                    </View>
                  )}
                </View>
              )}
              {errors.apartment && !showCustomApartmentInput ? <Text style={styles.errorText}>{errors.apartment}</Text> : null}
            </View>
          )}

          {/* Flat / Plot No. */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Flat / Plot No. *</Text>
            <TextInput
              style={styles.textInput}
              value={flatPlotNo}
              onChangeText={setFlatPlotNo}
              placeholder="e.g. Flat 4B, House No. 12"
              placeholderTextColor={Colors.textDisabled}
            />
            {errors.flatPlotNo ? <Text style={styles.errorText}>{errors.flatPlotNo}</Text> : null}
          </View>

          {/* Landmark */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Landmark</Text>
            <TextInput
              style={styles.textInput}
              value={landmark}
              onChangeText={setLandmark}
              placeholder="e.g. Near Apollo Hospital"
              placeholderTextColor={Colors.textDisabled}
            />
          </View>

          {/* Town / City */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Town / City *</Text>
            <TextInput
              style={styles.textInput}
              value={city}
              onChangeText={setCity}
              placeholder="e.g. Bhubaneswar"
              placeholderTextColor={Colors.textDisabled}
            />
            {errors.city ? <Text style={styles.errorText}>{errors.city}</Text> : null}
          </View>

          {/* State */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>State *</Text>
            <TextInput
              style={styles.textInput}
              value={stateField}
              onChangeText={setStateField}
              placeholder="e.g. Odisha"
              placeholderTextColor={Colors.textDisabled}
            />
            {errors.state ? <Text style={styles.errorText}>{errors.state}</Text> : null}
          </View>

          {/* Pincode — read only, auto-filled */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Pincode *</Text>
            <View style={styles.pincodeReadOnly}>
              <Text style={[styles.pincodeText, !pincode && styles.pincodePlaceholder]}>
                {pincode || 'Auto-filled from locality'}
              </Text>
              <View style={styles.pincodeBadge}>
                <Text style={styles.pincodeBadgeText}>Auto</Text>
              </View>
            </View>
            {errors.pincode ? <Text style={styles.errorText}>{errors.pincode}</Text> : null}
          </View>

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

  // Input fields
  inputGroup: { gap: Spacing[2] },
  inputLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[4],
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    backgroundColor: Colors.white,
  },
  textInputError: { borderColor: Colors.error },

  // Custom apartment input
  customAptContainer: { gap: Spacing[2] },
  customAptInfo: { gap: Spacing[2] },
  customAptBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.primarySurface,
  },
  customAptBadgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 11,
    color: Colors.primary,
  },
  customAptInfoText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    lineHeight: 16,
  },

  // Pincode read-only
  pincodeReadOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[4],
    backgroundColor: Colors.neutral[50],
  },
  pincodeText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  pincodePlaceholder: {
    color: Colors.textDisabled,
    fontFamily: Typography.fontFamily.sansRegular,
  },
  pincodeBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.primarySurface,
  },
  pincodeBadgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 10,
    color: Colors.primary,
  },

  // Dropdown
  dropdownContainer: {},
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[4],
    backgroundColor: Colors.white,
  },
  dropdownBtnOpen: {
    borderColor: Colors.primary,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  dropdownBtnError: { borderColor: Colors.error },
  dropdownBtnDisabled: { backgroundColor: Colors.neutral[50], opacity: 0.7 },
  dropdownBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flex: 1 },
  dropdownBtnText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    flex: 1,
  },
  dropdownPlaceholder: { color: Colors.textDisabled },

  dropdownList: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderTopWidth: 0,
    borderBottomLeftRadius: Radius.md,
    borderBottomRightRadius: Radius.md,
    backgroundColor: Colors.white,
    overflow: 'hidden',
    marginBottom: Spacing[1],
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    backgroundColor: Colors.neutral[50],
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  dropdownScroll: { maxHeight: 220 },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  dropdownItemActive: { backgroundColor: Colors.primarySurface },
  dropdownItemLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flex: 1 },
  dropdownItemText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    flex: 1,
  },
  dropdownItemTextActive: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  dropdownItemRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dropdownCodeBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.neutral[100],
  },
  dropdownCodeBadgeActive: { backgroundColor: Colors.primary + '20' },
  dropdownCodeText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 10,
    color: Colors.textTertiary,
  },
  dropdownCodeTextActive: { color: Colors.primary },
  dropdownEmptyItem: { paddingVertical: Spacing[4], alignItems: 'center' },
  dropdownEmptyText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textDisabled,
  },

  // Address type
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

  // Default toggle
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

  errorText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.error,
    marginTop: 2,
  },
});
