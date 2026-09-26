import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  TextInput,
  Modal,
  FlatList,
} from 'react-native';
import ModuleGuard from '@/components/admin/ModuleGuard';
import { router } from 'expo-router';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { Profile, Address } from '@/types/database';
import {
  ArrowLeft,
  Search,
  Check,
  ChevronDown,
  X,
  Plus,
  Trash2,
  Sparkles,
  MapPin,
  Calendar,
  Clock,
  User,
  Store,
} from 'lucide-react-native';
import { format, addDays, parseISO } from 'date-fns';

type PlaceCategory = 'Individual' | 'Apartment' | 'Business' | 'Temple';
type AddressType = 'Home' | 'Work' | 'Other';

const FLOWER_OPTIONS_FALLBACK = [
  'Rose', 'Marigold', 'Jasmine', 'Lotus', 'Sunflower', 'Lily',
  'Carnation', 'Orchid', 'Chrysanthemum', 'Tuberose', 'Gerbera', 'Other',
];

const UNIT_OPTIONS = ['Kg', 'Gm', 'Piece', 'Bouquet', 'Bundle', 'Garland', 'Packet'];

const GARLAND_SIZE_OPTIONS = Array.from({ length: 20 }, (_, i) => `${i + 1} ft`);

const ALL_TIME_SLOTS = [
  '06:00 AM', '07:00 AM', '08:00 AM', '09:00 AM', '10:00 AM',
  '11:00 AM', '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM',
  '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM', '08:00 PM',
];

const PLACE_CATEGORIES: PlaceCategory[] = ['Individual', 'Apartment', 'Business', 'Temple'];
const ADDRESS_TYPES: AddressType[] = ['Home', 'Work', 'Other'];

const INDIA_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

const STATE_OPTIONS = INDIA_STATES.map((s) => ({ value: s, label: s }));

interface SavedFlower {
  _key: string;
  flower_name: string;
  quantity: string;
  unit: string;
}

interface SavedGarland {
  _key: string;
  flower_name: string;
  garland_count: string;
  measure_type: 'flower_count' | 'garland_size';
  flower_count?: string;
  garland_size?: string;
}

interface SavedAddressRow {
  id: string;
  label: string;
  street: string;
  city: string;
  state: string;
  pincode: string;
  landmark: string | null;
  place_category: string | null;
  apartment_name: string | null;
  is_default: boolean;
}

function makeKey() {
  return Math.random().toString(36).slice(2);
}

function PickerModal({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: string[];
  selected: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={pmStyles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={pmStyles.sheet}>
        <View style={pmStyles.handle} />
        <Text style={pmStyles.title}>{title}</Text>
        <FlatList
          data={options}
          keyExtractor={(item) => item}
          style={pmStyles.list}
          showsVerticalScrollIndicator
          renderItem={({ item }) => {
            const isActive = item === selected;
            return (
              <TouchableOpacity
                style={[pmStyles.item, isActive && pmStyles.itemActive]}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <Text style={[pmStyles.itemText, isActive && pmStyles.itemTextActive]}>
                  {item}
                </Text>
                {isActive && <View style={pmStyles.dot} />}
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const pmStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    maxHeight: '65%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.neutral[300],
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  list: { flexGrow: 0 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  itemActive: { backgroundColor: Colors.primarySurface },
  itemText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  itemTextActive: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    color: Colors.primary,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
});

function SectionCard({
  icon,
  title,
  children,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <View style={styles.card}>
      <View style={[styles.cardHeader, accent ? { borderLeftColor: accent } : {}]}>
        <View style={[styles.cardIconWrap, accent ? { backgroundColor: accent + '18' } : {}]}>
          {icon}
        </View>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {label}
      {required && <Text style={styles.requiredStar}> *</Text>}
    </Text>
  );
}

function PillSelector<T extends string>({
  options,
  value,
  onChange,
}: {
  options: T[];
  value: T | '';
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.pillRow}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt}
          style={[styles.pill, value === opt && styles.pillActive]}
          onPress={() => onChange(opt)}
        >
          <Text style={[styles.pillText, value === opt && styles.pillTextActive]}>{opt}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View style={styles.fieldWrap}>
      <FieldLabel label={label} />
      <TouchableOpacity
        style={[styles.selectBox, open && styles.inputFocused]}
        onPress={() => setOpen(!open)}
        activeOpacity={0.8}
      >
        <Text style={[styles.selectText, !selected && styles.placeholderText]}>
          {selected ? selected.label : (placeholder ?? 'Select...')}
        </Text>
        <ChevronDown
          size={16}
          color={Colors.textTertiary}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
      </TouchableOpacity>
      {open && (
        <View style={styles.inlineDropdown}>
          <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.dropdownItem, value === opt.value && styles.dropdownItemActive]}
                onPress={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    value === opt.value && styles.dropdownItemTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
                {value === opt.value && <Check size={14} color={Colors.primary} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address';
  multiline?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <FieldLabel label={label} />
      <TextInput
        style={[
          styles.textInput,
          focused && styles.inputFocused,
          multiline && { minHeight: 80, textAlignVertical: 'top' },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textTertiary}
        keyboardType={keyboardType}
        multiline={multiline}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}

export default function CustomizeOrderScreen() {
  return (
    <ModuleGuard module="orders">
      <CustomizeOrderScreenContent />
    </ModuleGuard>
  );
}

function CustomizeOrderScreenContent() {
  const isWeb = Platform.OS === 'web';

  // Customer section
  const [userMode, setUserMode] = useState<'search' | 'new'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [newFullName, setNewFullName] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const [creatingNewUser, setCreatingNewUser] = useState(false);

  // Address section
  const [savedAddresses, setSavedAddresses] = useState<SavedAddressRow[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addressMode, setAddressMode] = useState<'saved' | 'new'>('saved');
  const [placeCategory, setPlaceCategory] = useState<PlaceCategory | ''>('');
  const [flatPlot, setFlatPlot] = useState('');
  const [apartmentName, setApartmentName] = useState('');
  const [locality, setLocality] = useState('');
  const [city, setCity] = useState('');
  const [addrState, setAddrState] = useState('');
  const [pincode, setPincode] = useState('');
  const [landmark, setLandmark] = useState('');
  const [addressType, setAddressType] = useState<AddressType | ''>('');

  // Order items
  const [orderType, setOrderType] = useState<'flower' | 'garland'>('flower');
  const [flowerOptions, setFlowerOptions] = useState<string[]>(FLOWER_OPTIONS_FALLBACK);

  const [savedFlowers, setSavedFlowers] = useState<SavedFlower[]>([]);
  const [draftFlower, setDraftFlower] = useState('');
  const [draftQuantity, setDraftQuantity] = useState('');
  const [draftUnit, setDraftUnit] = useState('Piece');
  const [showFlowerPicker, setShowFlowerPicker] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);

  const [savedGarlands, setSavedGarlands] = useState<SavedGarland[]>([]);
  const [gDraftFlower, setGDraftFlower] = useState('');
  const [gDraftCount, setGDraftCount] = useState('');
  const [gMeasureType, setGMeasureType] = useState<'flower_count' | 'garland_size'>(
    'flower_count'
  );
  const [gFlowerCount, setGFlowerCount] = useState('');
  const [gGarlandSize, setGGarlandSize] = useState('');
  const [showGFlowerPicker, setShowGFlowerPicker] = useState(false);
  const [showGSizePicker, setShowGSizePicker] = useState(false);

  // Delivery
  const [deliveryDate, setDeliveryDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [deliveryTime, setDeliveryTime] = useState('08:00 AM');
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [successOrderId, setSuccessOrderId] = useState('');

  // Load flower types
  useEffect(() => {
    supabase
      .from('flower_types')
      .select('display_name')
      .eq('is_active', true)
      .order('sort_order')
      .order('display_name')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setFlowerOptions(data.map((f) => f.display_name));
        }
      });
  }, []);

  // Load addresses when user selected
  useEffect(() => {
    if (!selectedUser) {
      setSavedAddresses([]);
      setSelectedAddressId(null);
      setAddressMode('saved');
      return;
    }
    setAddressesLoading(true);
    supabase
      .from('addresses')
      .select(
        'id, label, street, city, state, pincode, landmark, place_category, apartment_name, is_default'
      )
      .eq('user_id', selectedUser.id)
      .order('is_default', { ascending: false })
      .then(({ data }) => {
        const addrs = (data as SavedAddressRow[]) ?? [];
        setSavedAddresses(addrs);
        if (addrs.length > 0) {
          const def = addrs.find((a) => a.is_default) ?? addrs[0];
          setSelectedAddressId(def.id);
          setAddressMode('saved');
        } else {
          setAddressMode('new');
        }
        setAddressesLoading(false);
      });
  }, [selectedUser]);

  // Search users
  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, mobile, role')
      .eq('role', 'customer')
      .or(`mobile.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(8);
    setSearchResults((data as Profile[]) ?? []);
    setSearching(false);
  }, []);

  // Create new customer via edge function
  const createNewCustomer = async (): Promise<Profile | null> => {
    setCreatingNewUser(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-customer-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ full_name: newFullName.trim(), mobile: newMobile.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to create customer');
        return null;
      }
      const newProfile: Profile = {
        id: json.user_id,
        full_name: newFullName.trim(),
        mobile: newMobile.trim(),
        role: 'customer',
      } as Profile;
      return newProfile;
    } catch {
      setError('Failed to create customer');
      return null;
    } finally {
      setCreatingNewUser(false);
    }
  };

  // Create new address
  const createNewAddress = async (userId: string): Promise<string | null> => {
    const label = addressType || 'Home';
    const { data, error: addrError } = await supabase
      .from('addresses')
      .insert({
        user_id: userId,
        label,
        street: flatPlot.trim(),
        city: city.trim(),
        state: addrState,
        pincode: pincode.trim() || null,
        landmark: landmark.trim() || null,
        place_category: placeCategory,
        apartment_name: apartmentName.trim() || null,
        is_default: false,
      })
      .select('id')
      .single();
    if (addrError || !data) {
      setError(`Failed to create address: ${addrError?.message ?? 'Unknown error'}`);
      return null;
    }
    return data.id;
  };

  // Flower handlers
  const handleSaveFlower = () => {
    if (!draftFlower.trim() || !draftQuantity.trim()) return;
    setSavedFlowers((prev) => [
      ...prev,
      { _key: makeKey(), flower_name: draftFlower, quantity: draftQuantity, unit: draftUnit },
    ]);
    setDraftFlower('');
    setDraftQuantity('');
    setDraftUnit('Piece');
  };

  const removeFlower = (key: string) =>
    setSavedFlowers((p) => p.filter((i) => i._key !== key));

  // Garland handlers
  const handleSaveGarland = () => {
    if (!gDraftFlower.trim() || !gDraftCount.trim()) return;
    if (gMeasureType === 'flower_count' && !gFlowerCount.trim()) return;
    if (gMeasureType === 'garland_size' && !gGarlandSize.trim()) return;
    setSavedGarlands((prev) => [
      ...prev,
      {
        _key: makeKey(),
        flower_name: gDraftFlower,
        garland_count: gDraftCount,
        measure_type: gMeasureType,
        flower_count: gMeasureType === 'flower_count' ? gFlowerCount : undefined,
        garland_size: gMeasureType === 'garland_size' ? gGarlandSize : undefined,
      },
    ]);
    setGDraftFlower('');
    setGDraftCount('');
    setGFlowerCount('');
    setGGarlandSize('');
    setGMeasureType('flower_count');
  };

  const removeGarland = (key: string) =>
    setSavedGarlands((p) => p.filter((i) => i._key !== key));

  // Submit
  const handleSubmit = async () => {
    setError('');

    // Validate customer
    let userId: string;
    let customer = selectedUser;

    if (userMode === 'search') {
      if (!selectedUser) {
        setError('Please select a customer or create a new one.');
        return;
      }
      userId = selectedUser.id;
    } else {
      if (!newFullName.trim()) {
        setError('Full name is required.');
        return;
      }
      if (!newMobile.trim() || !/^\d{10}$/.test(newMobile.trim())) {
        setError('Enter a valid 10-digit mobile number.');
        return;
      }
      const newCustomer = await createNewCustomer();
      if (!newCustomer) return;
      customer = newCustomer;
      userId = newCustomer.id;
    }

    // Validate address
    let addressId: string | null = null;
    const useNewAddress = userMode === 'new' || addressMode === 'new';
    if (useNewAddress) {
      if (!placeCategory) {
        setError('Place category is required.');
        return;
      }
      if (!flatPlot.trim()) {
        setError('Apartment / Flat / Plot is required.');
        return;
      }
      if (!locality.trim()) {
        setError('Locality is required.');
        return;
      }
      if (!city.trim()) {
        setError('Town / City is required.');
        return;
      }
      if (!addrState) {
        setError('State is required.');
        return;
      }
      const newAddrId = await createNewAddress(userId);
      if (!newAddrId) return;
      addressId = newAddrId;
    } else {
      if (!selectedAddressId) {
        setError('Please select a saved address.');
        return;
      }
      addressId = selectedAddressId;
    }

    // Validate items
    const totalItems = savedFlowers.length + savedGarlands.length;
    if (totalItems === 0) {
      setError('Please add at least one flower or garland item.');
      return;
    }

    if (!deliveryDate) {
      setError('Delivery date is required.');
      return;
    }
    if (!deliveryTime) {
      setError('Delivery time is required.');
      return;
    }

    setSubmitting(true);

    const flowerItems = savedFlowers.map(({ flower_name, quantity, unit }) => ({
      flower_name,
      quantity,
      unit,
    }));
    const garlandItems = savedGarlands.map(
      ({ flower_name, garland_count, measure_type, flower_count, garland_size }) => ({
        flower_name,
        quantity: garland_count,
        unit: 'garland',
        measure_type,
        flower_count,
        garland_size,
      })
    );
    const items = [...flowerItems, ...garlandItems];

    const derivedOrderType =
      savedFlowers.length > 0 && savedGarlands.length > 0
        ? 'garland'
        : savedGarlands.length > 0
        ? 'garland'
        : 'flower';

    const { data: insertData, error: insertError } = await supabase
      .from('custom_orders')
      .insert({
        user_id: userId,
        order_type: derivedOrderType,
        items,
        delivery_date: deliveryDate,
        delivery_time: deliveryTime,
        address_id: addressId,
        special_instructions: specialInstructions.trim() || null,
      })
      .select('id')
      .single();

    setSubmitting(false);

    if (insertError) {
      setError(`Failed to create order: ${insertError.message}`);
      return;
    }

    setSuccessOrderId(insertData?.id ?? '');
    setSuccess(true);
  };

  const handleReset = () => {
    setUserMode('search');
    setSearchQuery('');
    setSearchResults([]);
    setSelectedUser(null);
    setNewFullName('');
    setNewMobile('');
    setSavedAddresses([]);
    setSelectedAddressId(null);
    setAddressMode('saved');
    setPlaceCategory('');
    setFlatPlot('');
    setApartmentName('');
    setLocality('');
    setCity('');
    setAddrState('');
    setPincode('');
    setLandmark('');
    setAddressType('');
    setOrderType('flower');
    setSavedFlowers([]);
    setDraftFlower('');
    setDraftQuantity('');
    setDraftUnit('Piece');
    setSavedGarlands([]);
    setGDraftFlower('');
    setGDraftCount('');
    setGFlowerCount('');
    setGGarlandSize('');
    setGMeasureType('flower_count');
    setDeliveryDate(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
    setDeliveryTime('08:00 AM');
    setSpecialInstructions('');
    setError('');
    setSuccess(false);
  };

  const garlandSaveDisabled =
    !gDraftFlower || !gDraftCount ||
    (gMeasureType === 'flower_count' ? !gFlowerCount : !gGarlandSize);

  return (
    <View style={styles.container}>
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Sparkles size={20} color={Colors.primary} strokeWidth={2} />
          </View>
          <View>
            <Text style={[styles.title, isWeb && styles.titleWeb]}>Customize Order</Text>
            <Text style={styles.subtitle}>Create a custom flower/garland order for a customer</Text>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, isWeb && styles.contentWeb]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Customer Section */}
        <SectionCard
          icon={<User size={18} color={Colors.primary} strokeWidth={2} />}
          title="Customer"
          accent={Colors.primary}
        >
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, userMode === 'search' && styles.tabBtnActive]}
              onPress={() => setUserMode('search')}
            >
              <Text style={[styles.tabBtnText, userMode === 'search' && styles.tabBtnTextActive]}>
                Search Existing
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, userMode === 'new' && styles.tabBtnActive]}
              onPress={() => setUserMode('new')}
            >
              <Text style={[styles.tabBtnText, userMode === 'new' && styles.tabBtnTextActive]}>
                New Customer
              </Text>
            </TouchableOpacity>
          </View>

          {userMode === 'search' ? (
            <View>
              <View style={styles.searchRow}>
                <Search size={16} color={Colors.textTertiary} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by name or mobile..."
                  placeholderTextColor={Colors.textTertiary}
                  value={searchQuery}
                  onChangeText={handleSearch}
                />
                {searching && <ActivityIndicator size="small" color={Colors.primary} />}
              </View>

              {searchResults.length > 0 && !selectedUser && (
                <View style={styles.searchResults}>
                  {searchResults.map((u) => (
                    <TouchableOpacity
                      key={u.id}
                      style={styles.searchResultItem}
                      onPress={() => {
                        setSelectedUser(u);
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                    >
                      <View style={styles.searchResultAvatar}>
                        <Text style={styles.searchResultAvatarText}>
                          {u.full_name?.[0]?.toUpperCase() ?? '?'}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.searchResultName}>{u.full_name}</Text>
                        <Text style={styles.searchResultMobile}>{u.mobile}</Text>
                      </View>
                      <Check size={16} color={Colors.primary} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {selectedUser && (
                <View style={styles.selectedUserCard}>
                  <View style={styles.selectedUserAvatar}>
                    <Text style={styles.selectedUserAvatarText}>
                      {selectedUser.full_name?.[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedUserName}>{selectedUser.full_name}</Text>
                    <Text style={styles.selectedUserMobile}>{selectedUser.mobile}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedUser(null);
                      setSavedAddresses([]);
                      setSelectedAddressId(null);
                    }}
                  >
                    <X size={18} color={Colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <View style={{ gap: Spacing[3] }}>
              <FormInput
                label="Full Name"
                value={newFullName}
                onChangeText={setNewFullName}
                placeholder="e.g. Rajesh Kumar"
              />
              <FormInput
                label="Mobile Number"
                value={newMobile}
                onChangeText={setNewMobile}
                placeholder="10-digit mobile"
                keyboardType="numeric"
              />
              {creatingNewUser && (
                <View style={styles.creatingRow}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.creatingText}>Creating customer account...</Text>
                </View>
              )}
            </View>
          )}
        </SectionCard>

        {/* Address Section */}
        {selectedUser && userMode === 'search' && savedAddresses.length > 0 && (
          <SectionCard
            icon={<MapPin size={18} color={Colors.success} strokeWidth={2} />}
            title="Delivery Address"
            accent={Colors.success}
          >
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tabBtn, addressMode === 'saved' && styles.tabBtnActive]}
                onPress={() => setAddressMode('saved')}
              >
                <Text
                  style={[styles.tabBtnText, addressMode === 'saved' && styles.tabBtnTextActive]}
                >
                  Saved Addresses
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, addressMode === 'new' && styles.tabBtnActive]}
                onPress={() => setAddressMode('new')}
              >
                <Text
                  style={[styles.tabBtnText, addressMode === 'new' && styles.tabBtnTextActive]}
                >
                  New Address
                </Text>
              </TouchableOpacity>
            </View>

            {addressesLoading ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : addressMode === 'saved' ? (
              <View style={{ gap: Spacing[2] }}>
                {savedAddresses.map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={[
                      styles.addressCard,
                      selectedAddressId === a.id && styles.addressCardActive,
                    ]}
                    onPress={() => setSelectedAddressId(a.id)}
                  >
                    <View style={styles.addressRadio}>
                      {selectedAddressId === a.id && <View style={styles.addressRadioDot} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.addressLabel}>{a.label}</Text>
                      <Text style={styles.addressText} numberOfLines={2}>
                        {a.street}, {a.city}, {a.state} {a.pincode}
                      </Text>
                      {a.landmark ? (
                        <Text style={styles.addressLandmark}>Landmark: {a.landmark}</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </SectionCard>
        )}

        {/* New Address Form (for new customers or when addressMode === 'new') */}
        {(userMode === 'new' || addressMode === 'new') && (
          <SectionCard
            icon={<MapPin size={18} color={Colors.success} strokeWidth={2} />}
            title={userMode === 'new' ? 'Customer Address' : 'New Delivery Address'}
            accent={Colors.success}
          >
            <View style={styles.fieldWrap}>
              <FieldLabel label="Place Category" required />
              <PillSelector
                options={PLACE_CATEGORIES}
                value={placeCategory}
                onChange={(v) => setPlaceCategory(v)}
              />
            </View>

            <View style={styles.twoCol}>
              <View style={styles.twoColItem}>
                <FormInput
                  label="Apartment / Flat / Plot"
                  value={flatPlot}
                  onChangeText={setFlatPlot}
                  placeholder="e.g. Flat 4B"
                />
              </View>
              <View style={styles.twoColItem}>
                <FormInput
                  label="Apartment Name"
                  value={apartmentName}
                  onChangeText={setApartmentName}
                  placeholder="e.g. Sunrise Residency"
                />
              </View>
            </View>

            <View style={styles.twoCol}>
              <View style={styles.twoColItem}>
                <FormInput
                  label="Locality"
                  value={locality}
                  onChangeText={setLocality}
                  placeholder="e.g. Koramangala"
                />
              </View>
              <View style={styles.twoColItem}>
                <FormInput
                  label="Town / City"
                  value={city}
                  onChangeText={setCity}
                  placeholder="e.g. Bangalore"
                />
              </View>
            </View>

            <View style={styles.twoCol}>
              <View style={styles.twoColItem}>
                <SelectField
                  label="State"
                  value={addrState}
                  options={STATE_OPTIONS}
                  onChange={setAddrState}
                  placeholder="Select state"
                />
              </View>
              <View style={styles.twoColItem}>
                <FormInput
                  label="Pincode"
                  value={pincode}
                  onChangeText={setPincode}
                  placeholder="e.g. 560034"
                  keyboardType="numeric"
                />
              </View>
            </View>

            <FormInput
              label="Landmark"
              value={landmark}
              onChangeText={setLandmark}
              placeholder="e.g. Near Metro Station"
            />

            <View style={styles.fieldWrap}>
              <FieldLabel label="Address Type" required />
              <PillSelector
                options={ADDRESS_TYPES}
                value={addressType}
                onChange={(v) => setAddressType(v)}
              />
            </View>
          </SectionCard>
        )}

        {/* Order Items Section */}
        <SectionCard
          icon={<Sparkles size={18} color={Colors.warning} strokeWidth={2} />}
          title="Order Items"
          accent={Colors.warning}
        >
          <View style={styles.typeTabs}>
            <TouchableOpacity
              style={[styles.typeTab, orderType === 'flower' && styles.typeTabActive]}
              onPress={() => setOrderType('flower')}
            >
              <Text style={[styles.typeTabText, orderType === 'flower' && styles.typeTabTextActive]}>
                Flower
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeTab, orderType === 'garland' && styles.typeTabActive]}
              onPress={() => setOrderType('garland')}
            >
              <Text
                style={[styles.typeTabText, orderType === 'garland' && styles.typeTabTextActive]}
              >
                Garland
              </Text>
            </TouchableOpacity>
          </View>

          {orderType === 'flower' && (
            <View>
              <View style={styles.twoCol}>
                <View style={styles.colFlex}>
                  <Text style={styles.fieldLabel}>Flower</Text>
                  <TouchableOpacity style={styles.dropdown} onPress={() => setShowFlowerPicker(true)}>
                    <Text
                      style={draftFlower ? styles.dropdownValue : styles.dropdownPlaceholder}
                    >
                      {draftFlower || 'Select flower'}
                    </Text>
                    <ChevronDown size={14} color={Colors.textTertiary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.colFixed}>
                  <Text style={styles.fieldLabel}>Quantity</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 2"
                    placeholderTextColor={Colors.textTertiary}
                    keyboardType="numeric"
                    value={draftQuantity}
                    onChangeText={setDraftQuantity}
                  />
                </View>
              </View>

              <View style={styles.twoCol}>
                <View style={styles.colFlex}>
                  <Text style={styles.fieldLabel}>Unit</Text>
                  <TouchableOpacity style={styles.dropdown} onPress={() => setShowUnitPicker(true)}>
                    <Text style={styles.dropdownValue}>{draftUnit}</Text>
                    <ChevronDown size={14} color={Colors.textTertiary} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[
                    styles.saveItemBtn,
                    (!draftFlower || !draftQuantity) && styles.saveItemBtnDisabled,
                  ]}
                  onPress={handleSaveFlower}
                  disabled={!draftFlower || !draftQuantity}
                >
                  <Plus size={14} color={Colors.white} />
                  <Text style={styles.saveItemBtnText}>Add</Text>
                </TouchableOpacity>
              </View>

              {savedFlowers.length > 0 && (
                <View style={styles.savedItemsList}>
                  {savedFlowers.map((f) => (
                    <View key={f._key} style={styles.savedItemRow}>
                      <View style={styles.savedItemInfo}>
                        <Text style={styles.savedItemName}>{f.flower_name}</Text>
                        <Text style={styles.savedItemDetail}>
                          {f.quantity} {f.unit}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => removeFlower(f._key)}>
                        <Trash2 size={16} color={Colors.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {orderType === 'garland' && (
            <View>
              <View style={styles.twoCol}>
                <View style={styles.colFlex}>
                  <Text style={styles.fieldLabel}>Flower</Text>
                  <TouchableOpacity
                    style={styles.dropdown}
                    onPress={() => setShowGFlowerPicker(true)}
                  >
                    <Text
                      style={gDraftFlower ? styles.dropdownValue : styles.dropdownPlaceholder}
                    >
                      {gDraftFlower || 'Select flower'}
                    </Text>
                    <ChevronDown size={14} color={Colors.textTertiary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.colFixed}>
                  <Text style={styles.fieldLabel}>No. of Garlands</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 2"
                    placeholderTextColor={Colors.textTertiary}
                    keyboardType="numeric"
                    value={gDraftCount}
                    onChangeText={setGDraftCount}
                  />
                </View>
              </View>

              <View style={styles.measureToggleRow}>
                <TouchableOpacity
                  style={[
                    styles.measureToggleBtn,
                    gMeasureType === 'flower_count' && styles.measureToggleBtnActive,
                  ]}
                  onPress={() => setGMeasureType('flower_count')}
                >
                  <View
                    style={[
                      styles.radioCircle,
                      gMeasureType === 'flower_count' && styles.radioCircleActive,
                    ]}
                  >
                    {gMeasureType === 'flower_count' && <View style={styles.radioDot} />}
                  </View>
                  <Text
                    style={[
                      styles.measureToggleText,
                      gMeasureType === 'flower_count' && styles.measureToggleTextActive,
                    ]}
                  >
                    Flower Count
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.measureToggleBtn,
                    gMeasureType === 'garland_size' && styles.measureToggleBtnActive,
                  ]}
                  onPress={() => setGMeasureType('garland_size')}
                >
                  <View
                    style={[
                      styles.radioCircle,
                      gMeasureType === 'garland_size' && styles.radioCircleActive,
                    ]}
                  >
                    {gMeasureType === 'garland_size' && <View style={styles.radioDot} />}
                  </View>
                  <Text
                    style={[
                      styles.measureToggleText,
                      gMeasureType === 'garland_size' && styles.measureToggleTextActive,
                    ]}
                  >
                    Garland Size
                  </Text>
                </TouchableOpacity>
              </View>

              {gMeasureType === 'flower_count' ? (
                <View>
                  <Text style={styles.fieldLabel}>Flower Count</Text>
                  <TextInput
                    style={[styles.input, styles.inputFull]}
                    placeholder="e.g. 50"
                    placeholderTextColor={Colors.textTertiary}
                    keyboardType="numeric"
                    value={gFlowerCount}
                    onChangeText={setGFlowerCount}
                  />
                </View>
              ) : (
                <View>
                  <Text style={styles.fieldLabel}>Size</Text>
                  <TouchableOpacity
                    style={[styles.dropdown, styles.inputFull]}
                    onPress={() => setShowGSizePicker(true)}
                  >
                    <Text
                      style={gGarlandSize ? styles.dropdownValue : styles.dropdownPlaceholder}
                    >
                      {gGarlandSize || 'Select size'}
                    </Text>
                    <ChevronDown size={14} color={Colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                style={[styles.saveItemBtn, garlandSaveDisabled && styles.saveItemBtnDisabled]}
                onPress={handleSaveGarland}
                disabled={!!garlandSaveDisabled}
              >
                <Plus size={14} color={Colors.white} />
                <Text style={styles.saveItemBtnText}>Add Garland</Text>
              </TouchableOpacity>

              {savedGarlands.length > 0 && (
                <View style={styles.savedItemsList}>
                  {savedGarlands.map((g) => (
                    <View key={g._key} style={styles.savedItemRow}>
                      <View style={styles.savedItemInfo}>
                        <Text style={styles.savedItemName}>{g.flower_name}</Text>
                        <Text style={styles.savedItemDetail}>
                          {g.garland_count} garland(s)
                          {g.measure_type === 'flower_count'
                            ? ` · ${g.flower_count} flowers each`
                            : ` · ${g.garland_size}`}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => removeGarland(g._key)}>
                        <Trash2 size={16} color={Colors.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </SectionCard>

        {/* Delivery Section */}
        <SectionCard
          icon={<Calendar size={18} color={Colors.info} strokeWidth={2} />}
          title="Delivery Details"
          accent={Colors.info}
        >
          <View style={styles.twoCol}>
            <View style={styles.twoColItem}>
              <FieldLabel label="Delivery Date" required />
              {isWeb ? (
                <View style={styles.textInput}>
                  {/* @ts-ignore web-only */}
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e: any) => setDeliveryDate(e.target.value)}
                    style={{
                      border: 'none',
                      outline: 'none',
                      fontFamily: 'DMSans-Regular',
                      fontSize: 15,
                      color: deliveryDate ? '#1A1917' : '#8C8880',
                      backgroundColor: 'transparent',
                      width: '100%',
                      cursor: 'pointer',
                    }}
                  />
                </View>
              ) : (
                <TextInput
                  style={styles.textInput}
                  value={deliveryDate}
                  onChangeText={setDeliveryDate}
                  placeholder="YYYY-MM-DD"
                />
              )}
            </View>
            <View style={styles.twoColItem}>
              <FieldLabel label="Delivery Time" required />
              <TouchableOpacity
                style={styles.dropdown}
                onPress={() => setShowTimePicker(true)}
              >
                <Text style={styles.dropdownValue}>{deliveryTime}</Text>
                <ChevronDown size={14} color={Colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>

          <FormInput
            label="Special Instructions"
            value={specialInstructions}
            onChangeText={setSpecialInstructions}
            placeholder="Any special delivery notes..."
            multiline
          />
        </SectionCard>

        {/* Error */}
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Submit */}
        <View style={styles.submitRow}>
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <>
                <Sparkles size={16} color={Colors.white} />
                <Text style={styles.submitBtnText}>Create Order</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
            <Text style={styles.resetBtnText}>Reset</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Picker modals */}
      <PickerModal
        visible={showFlowerPicker}
        title="Select Flower"
        options={flowerOptions}
        selected={draftFlower}
        onSelect={setDraftFlower}
        onClose={() => setShowFlowerPicker(false)}
      />
      <PickerModal
        visible={showUnitPicker}
        title="Select Unit"
        options={UNIT_OPTIONS}
        selected={draftUnit}
        onSelect={setDraftUnit}
        onClose={() => setShowUnitPicker(false)}
      />
      <PickerModal
        visible={showGFlowerPicker}
        title="Select Flower"
        options={flowerOptions}
        selected={gDraftFlower}
        onSelect={setGDraftFlower}
        onClose={() => setShowGFlowerPicker(false)}
      />
      <PickerModal
        visible={showGSizePicker}
        title="Select Garland Size"
        options={GARLAND_SIZE_OPTIONS}
        selected={gGarlandSize}
        onSelect={setGGarlandSize}
        onClose={() => setShowGSizePicker(false)}
      />
      <PickerModal
        visible={showTimePicker}
        title="Select Delivery Time"
        options={ALL_TIME_SLOTS}
        selected={deliveryTime}
        onSelect={setDeliveryTime}
        onClose={() => setShowTimePicker(false)}
      />

      {/* Success modal */}
      <Modal visible={success} transparent animationType="fade" onRequestClose={handleReset}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isWeb && styles.modalCardWeb]}>
            <View style={styles.modalIconWrap}>
              <Check size={32} color={Colors.success} strokeWidth={2.5} />
            </View>
            <Text style={styles.modalTitle}>Order Created Successfully</Text>
            <Text style={styles.modalDesc}>
              The custom order has been created and will appear under Orders → Custom Orders.
            </Text>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalSecondaryBtn}
                onPress={handleReset}
              >
                <Text style={styles.modalSecondaryBtnText}>Create Another</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalPrimaryBtn}
                onPress={() => {
                  setSuccess(false);
                  router.push('/(admin)/orders?tab=custom');
                }}
              >
                <Text style={styles.modalPrimaryBtnText}>View Orders</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing[3],
  },
  headerWeb: { paddingHorizontal: Spacing[8], paddingVertical: Spacing[5] },
  backBtn: { padding: Spacing[1] },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  titleWeb: { fontSize: Typography.size['2xl'] },
  subtitle: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  content: { padding: Spacing[5], gap: Spacing[4] },
  contentWeb: { padding: Spacing[8], maxWidth: 900, alignSelf: 'center', width: '100%' },

  // Cards
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  cardBody: { padding: Spacing[5], gap: Spacing[3] },

  // Tab buttons
  tabRow: { flexDirection: 'row', gap: Spacing[2] },
  tabBtn: {
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  tabBtnActive: {
    backgroundColor: Colors.primarySurface,
    borderColor: Colors.primary,
  },
  tabBtnText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  tabBtnTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },

  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    paddingVertical: 4,
  },
  searchResults: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    overflow: 'hidden',
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  searchResultAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultAvatarText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.primary,
  },
  searchResultName: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  searchResultMobile: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },

  // Selected user
  selectedUserCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    backgroundColor: Colors.primarySurface,
    borderRadius: Radius.md,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  selectedUserAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedUserAvatarText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.base,
    color: Colors.white,
  },
  selectedUserName: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  selectedUserMobile: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
  },

  // Creating new user
  creatingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  creatingText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },

  // Address
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    padding: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  addressCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  addressRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  addressLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  addressText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  addressLandmark: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },

  // Form fields
  fieldWrap: { gap: Spacing[1] },
  fieldLabel: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  requiredStar: { color: Colors.error },
  textInput: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    minHeight: 50,
  },
  inputFocused: { borderColor: Colors.primary },

  // Pills
  pillRow: { flexDirection: 'row', gap: Spacing[2], flexWrap: 'wrap' },
  pill: {
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  pillActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  pillText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  pillTextActive: { color: Colors.primary },

  // Select
  selectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    minHeight: 50,
  },
  selectText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  placeholderText: { color: Colors.textTertiary },
  inlineDropdown: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    marginTop: Spacing[1],
    overflow: 'hidden',
    ...Shadow.sm,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  dropdownItemActive: { backgroundColor: Colors.primarySurface },
  dropdownItemText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  dropdownItemTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },

  // Two col
  twoCol: { flexDirection: 'row', gap: Spacing[3] },
  twoColItem: { flex: 1 },

  // Order type tabs
  typeTabs: { flexDirection: 'row', gap: Spacing[2] },
  typeTab: {
    flex: 1,
    paddingVertical: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    alignItems: 'center',
  },
  typeTabActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  typeTabText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
  },
  typeTabTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },

  // Item form
  colFlex: { flex: 1 },
  colFixed: { width: 100 },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    minHeight: 50,
  },
  dropdownValue: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  dropdownPlaceholder: { color: Colors.textTertiary },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    minHeight: 50,
  },
  inputFull: { marginTop: Spacing[2] },

  // Measure toggle
  measureToggleRow: { flexDirection: 'row', gap: Spacing[3] },
  measureToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[2],
  },
  measureToggleBtnActive: {},
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: { borderColor: Colors.primary },
  radioDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: Colors.primary },
  measureToggleText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  measureToggleTextActive: { color: Colors.primary },

  // Save item button
  saveItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
    backgroundColor: Colors.primary,
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.md,
    alignSelf: 'flex-start',
  },
  saveItemBtnDisabled: { opacity: 0.5 },
  saveItemBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.white,
  },

  // Saved items
  savedItemsList: { gap: Spacing[2], marginTop: Spacing[3] },
  savedItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: Colors.neutral[50],
    borderWidth: 1,
    borderColor: Colors.border,
  },
  savedItemInfo: { flex: 1 },
  savedItemName: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  savedItemDetail: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },

  // Error
  errorBanner: {
    backgroundColor: Colors.errorSurface,
    borderRadius: Radius.md,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.error + '40',
  },
  errorText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.error,
  },

  // Submit
  submitRow: { flexDirection: 'row', gap: Spacing[3], alignItems: 'center' },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.primary,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[6],
    borderRadius: Radius.md,
    ...Shadow.sm,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.white,
  },
  resetBtn: {
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[5],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resetBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
  },

  // Success modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    width: '90%',
    padding: Spacing[6],
    alignItems: 'center',
    ...Shadow.lg,
  },
  modalCardWeb: { width: 420, maxWidth: '90%' },
  modalIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.successSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[4],
  },
  modalTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
    marginBottom: Spacing[2],
  },
  modalDesc: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing[5],
  },
  modalFooter: { flexDirection: 'row', gap: Spacing[3] },
  modalSecondaryBtn: {
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[5],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalSecondaryBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  modalPrimaryBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[5],
    borderRadius: Radius.md,
  },
  modalPrimaryBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.white,
  },
});
