import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Pencil,
  MapPin,
  Calendar,
  Clock,
  MessageSquare,
  ChevronDown,
} from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Address, CustomOrderItem, GarlandOrderItem, CustomOrderType } from '@/types/database';
import { format, addDays } from 'date-fns';
import {
  getMinAllowedDate,
  isPastCutoffIST,
  toLocalDateStr,
} from '@/utils/istCutoff';

const FLOWER_OPTIONS = [
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

const AFTER_CUTOFF_TIME_SLOTS = ALL_TIME_SLOTS.filter((slot) => {
  const [time, period] = slot.split(' ');
  const [h] = time.split(':').map(Number);
  const hour24 = period === 'PM' && h !== 12 ? h + 12 : period === 'AM' && h === 12 ? 0 : h;
  return hour24 >= 10;
});

interface SavedFlower extends CustomOrderItem { _key: string }
interface SavedGarland extends GarlandOrderItem { _key: string }

function makeKey() { return Math.random().toString(36).slice(2); }

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
          showsVerticalScrollIndicator={true}
          renderItem={({ item }) => {
            const isActive = item === selected;
            return (
              <TouchableOpacity
                style={[pmStyles.item, isActive && pmStyles.itemActive]}
                onPress={() => { onSelect(item); onClose(); }}
              >
                <Text style={[pmStyles.itemText, isActive && pmStyles.itemTextActive]}>{item}</Text>
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
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
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
});

export default function CustomOrderScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();

  const [orderType, setOrderType] = useState<CustomOrderType>('flower');

  // --- Flower draft state ---
  const [savedFlowers, setSavedFlowers] = useState<SavedFlower[]>([]);
  const [draftFlower, setDraftFlower] = useState('');
  const [draftQuantity, setDraftQuantity] = useState('');
  const [draftUnit, setDraftUnit] = useState('Piece');
  const [showFlowerPicker, setShowFlowerPicker] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);

  // --- Garland draft state ---
  const [savedGarlands, setSavedGarlands] = useState<SavedGarland[]>([]);
  const [gDraftFlower, setGDraftFlower] = useState('');
  const [gDraftCount, setGDraftCount] = useState('');
  const [gMeasureType, setGMeasureType] = useState<'flower_count' | 'garland_size'>('flower_count');
  const [gFlowerCount, setGFlowerCount] = useState('');
  const [gGarlandSize, setGGarlandSize] = useState('');
  const [showGFlowerPicker, setShowGFlowerPicker] = useState(false);
  const [showGSizePicker, setShowGSizePicker] = useState(false);

  // --- Delivery & address state ---
  const [deliveryDate, setDeliveryDate] = useState<Date>(getMinAllowedDate());
  const [deliveryTime, setDeliveryTime] = useState(() => isPastCutoffIST() ? '10:00 AM' : '08:00 AM');
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState('');
  const [showAllAddresses, setShowAllAddresses] = useState(false);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successModal, setSuccessModal] = useState(false);
  const [successDate, setSuccessDate] = useState('');

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAddressWarning, setShowAddressWarning] = useState(false);

  const minDate = getMinAllowedDate();
  const pastCutoff = isPastCutoffIST();

  const isRestrictedDate = (date: Date) =>
    pastCutoff && format(date, 'yyyy-MM-dd') === format(minDate, 'yyyy-MM-dd');

  const availableTimeSlots = isRestrictedDate(deliveryDate) ? AFTER_CUTOFF_TIME_SLOTS : ALL_TIME_SLOTS;

  const clampTimeForDate = (date: Date, currentTime: string) => {
    if (!isRestrictedDate(date)) return currentTime;
    const isAllowed = AFTER_CUTOFF_TIME_SLOTS.includes(currentTime);
    return isAllowed ? currentTime : '10:00 AM';
  };

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('addresses')
      .select('*')
      .eq('user_id', profile.id)
      .then(({ data }) => {
        if (data) {
          setAddresses(data);
          const def = data.find((a) => a.is_default);
          setSelectedAddress(def?.id || data[0]?.id || '');
        }
      });
  }, [profile]);

  // --- Flower handlers ---
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

  const removeFlower = (key: string) => setSavedFlowers((p) => p.filter((i) => i._key !== key));

  // --- Garland handlers ---
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

  const removeGarland = (key: string) => setSavedGarlands((p) => p.filter((i) => i._key !== key));

  // --- Date ---
  const handleDateChange = (direction: 'prev' | 'next') => {
    setDeliveryDate((prev) => {
      const next = direction === 'next' ? addDays(prev, 1) : addDays(prev, -1);
      if (next < minDate) return prev;
      setDeliveryTime((t) => clampTimeForDate(next, t));
      return next;
    });
  };

  const handleSelectDate = (daysFromMin: number) => {
    const selected = addDays(minDate, daysFromMin);
    setDeliveryDate(selected);
    setDeliveryTime((t) => clampTimeForDate(selected, t));
    setShowDatePicker(false);
  };

  // --- Submit ---
  const validateAndSubmit = async () => {
    setError('');

    const totalItems = savedFlowers.length + savedGarlands.length;
    if (totalItems === 0) {
      setError('Please add at least one flower or garland item.');
      return;
    }
    if (deliveryDate < minDate) {
      setError(`Delivery date must be ${format(minDate, 'dd MMM yyyy')} or later.`);
      return;
    }
    if (!selectedAddress) {
      setShowAddressWarning(true);
      setError('Please select a delivery address.');
      return;
    }

    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();
    const uid = user?.id ?? profile!.id;

    const flowerItems = savedFlowers.map(({ flower_name, quantity, unit }) => ({
      flower_name, quantity, unit,
    }));
    const garlandItems = savedGarlands.map(({ flower_name, garland_count, measure_type, flower_count, garland_size }) => ({
      flower_name, quantity: garland_count, unit: 'garland',
      measure_type, flower_count, garland_size,
    }));
    const items = [...flowerItems, ...garlandItems];

    const derivedOrderType =
      savedFlowers.length > 0 && savedGarlands.length > 0
        ? 'garland'  // mixed order stored as 'garland' type (supports both)
        : savedGarlands.length > 0 ? 'garland' : 'flower';

    const { error: insertError } = await supabase.from('custom_orders').insert({
      user_id: uid,
      order_type: derivedOrderType,
      items,
      delivery_date: toLocalDateStr(deliveryDate),
      delivery_time: deliveryTime,
      address_id: selectedAddress || null,
      special_instructions: specialInstructions.trim() || null,
    });

    setSubmitting(false);

    if (insertError) {
      setError(`Failed to place order: ${insertError.message}`);
      return;
    }

    setSuccessDate(format(deliveryDate, 'dd MMM yyyy'));
    setSuccessModal(true);
  };

  const visibleAddresses = showAllAddresses ? addresses : addresses.slice(0, 1);
  const garlandSaveDisabled =
    !gDraftFlower || !gDraftCount ||
    (gMeasureType === 'flower_count' ? !gFlowerCount : !gGarlandSize);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Custom Order</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.subtitle}>
          Create your own custom flower arrangement for any occasion
        </Text>

        {pastCutoff && (
          <View style={styles.cutoffBanner}>
            <Clock size={14} color={Colors.warning} />
            <Text style={styles.cutoffText}>
              Orders placed after 5 PM are delivered the next day from 10 AM onwards. Earliest delivery: {format(minDate, 'dd MMM yyyy')}.
            </Text>
          </View>
        )}

        {/* Order type tabs */}
        <View style={styles.typeTabs}>
          <TouchableOpacity
            style={[styles.typeTab, orderType === 'flower' && styles.typeTabActive]}
            onPress={() => setOrderType('flower')}
          >
            <Text style={styles.typeTabEmoji}>🪷</Text>
            <Text style={[styles.typeTabText, orderType === 'flower' && styles.typeTabTextActive]}>
              Flower
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeTab, orderType === 'garland' && styles.typeTabActive]}
            onPress={() => setOrderType('garland')}
          >
            <Text style={styles.typeTabEmoji}>🌼</Text>
            <Text style={[styles.typeTabText, orderType === 'garland' && styles.typeTabTextActive]}>
              Garland
            </Text>
          </TouchableOpacity>
        </View>

        {/* ---- FLOWER FORM ---- */}
        {orderType === 'flower' && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardIconBg}>
                <Text style={styles.cardIconEmoji}>🌺</Text>
              </View>
              <Text style={styles.cardTitle}>Flower</Text>
            </View>

            <View style={styles.twoCol}>
              <View style={styles.colFlex}>
                <Text style={styles.fieldLabel}>Flower</Text>
                <TouchableOpacity
                  style={styles.dropdown}
                  onPress={() => setShowFlowerPicker(true)}
                >
                  <Text style={draftFlower ? styles.dropdownValue : styles.dropdownPlaceholder}>
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
                <TouchableOpacity
                  style={styles.dropdown}
                  onPress={() => setShowUnitPicker(true)}
                >
                  <Text style={styles.dropdownValue}>{draftUnit}</Text>
                  <ChevronDown size={14} color={Colors.textTertiary} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, (!draftFlower || !draftQuantity) && styles.saveBtnDisabled]}
                onPress={handleSaveFlower}
                disabled={!draftFlower || !draftQuantity}
              >
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ---- GARLAND FORM ---- */}
        {orderType === 'garland' && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardIconBg}>
                <Text style={styles.cardIconEmoji}>🌼</Text>
              </View>
              <Text style={styles.cardTitle}>Garland</Text>
            </View>

            <View style={styles.twoCol}>
              <View style={styles.colFlex}>
                <Text style={styles.fieldLabel}>Flower</Text>
                <TouchableOpacity
                  style={styles.dropdown}
                  onPress={() => setShowGFlowerPicker(true)}
                >
                  <Text style={gDraftFlower ? styles.dropdownValue : styles.dropdownPlaceholder}>
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

            {/* Measure type toggle */}
            <View style={styles.measureToggleRow}>
              <TouchableOpacity
                style={[styles.measureToggleBtn, gMeasureType === 'flower_count' && styles.measureToggleBtnActive]}
                onPress={() => setGMeasureType('flower_count')}
              >
                <View style={[styles.radioCircle, gMeasureType === 'flower_count' && styles.radioCircleActive]}>
                  {gMeasureType === 'flower_count' && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.measureToggleText, gMeasureType === 'flower_count' && styles.measureToggleTextActive]}>
                  Flower Count
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.measureToggleBtn, gMeasureType === 'garland_size' && styles.measureToggleBtnActive]}
                onPress={() => setGMeasureType('garland_size')}
              >
                <View style={[styles.radioCircle, gMeasureType === 'garland_size' && styles.radioCircleActive]}>
                  {gMeasureType === 'garland_size' && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.measureToggleText, gMeasureType === 'garland_size' && styles.measureToggleTextActive]}>
                  Garland Size
                </Text>
              </TouchableOpacity>
            </View>

            {/* Conditional field */}
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
                  <Text style={gGarlandSize ? styles.dropdownValue : styles.dropdownPlaceholder}>
                    {gGarlandSize || 'Select size'}
                  </Text>
                  <ChevronDown size={14} color={Colors.textTertiary} />
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={[styles.saveBtnFull, garlandSaveDisabled && styles.saveBtnFullDisabled]}
              onPress={handleSaveGarland}
              disabled={garlandSaveDisabled}
            >
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ---- SAVED FLOWERS LIST ---- */}
        {savedFlowers.length > 0 && (
          <View style={styles.savedSection}>
            <Text style={styles.savedSectionTitle}>Saved Flowers</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, styles.colFlower]}>Flower</Text>
              <Text style={[styles.tableHeaderCell, styles.colQty]}>Qty</Text>
              <Text style={[styles.tableHeaderCell, styles.colUnit]}>Unit</Text>
              <View style={styles.colActions} />
            </View>
            {savedFlowers.map((item) => (
              <View key={item._key} style={styles.tableRow}>
                <Text style={[styles.tableCell, styles.colFlower]} numberOfLines={1}>{item.flower_name}</Text>
                <Text style={[styles.tableCell, styles.colQty]}>{item.quantity}</Text>
                <Text style={[styles.tableCell, styles.colUnit]}>{item.unit}</Text>
                <View style={styles.colActions}>
                  <TouchableOpacity style={styles.actionBtn}>
                    <Pencil size={14} color="#5B8DEF" strokeWidth={1.8} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => removeFlower(item._key)}>
                    <Trash2 size={14} color={Colors.error} strokeWidth={1.8} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ---- SAVED GARLANDS LIST ---- */}
        {savedGarlands.length > 0 && (
          <View style={styles.savedSection}>
            <Text style={styles.savedSectionTitle}>Saved Garlands</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, styles.colGFlower]}>Flower</Text>
              <Text style={[styles.tableHeaderCell, styles.colGCount]}>No. of{'\n'}Garlands</Text>
              <Text style={[styles.tableHeaderCell, styles.colGMeasure]}>Flower{'\n'}Count</Text>
              <Text style={[styles.tableHeaderCell, styles.colGSize]}>Size</Text>
              <View style={styles.colActions} />
            </View>
            {savedGarlands.map((item) => (
              <View key={item._key} style={styles.tableRow}>
                <Text style={[styles.tableCell, styles.colGFlower]} numberOfLines={1}>{item.flower_name}</Text>
                <Text style={[styles.tableCell, styles.colGCount]}>{item.garland_count}</Text>
                <Text style={[styles.tableCell, styles.colGMeasure]}>{item.measure_type === 'flower_count' ? item.flower_count : '-'}</Text>
                <Text style={[styles.tableCell, styles.colGSize]}>{item.measure_type === 'garland_size' ? item.garland_size : '-'}</Text>
                <View style={styles.colActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => removeGarland(item._key)}>
                    <Trash2 size={14} color={Colors.error} strokeWidth={1.8} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ---- DELIVERY DATE & TIME ---- */}
        <View style={styles.card}>
          <View style={styles.deliveryField}>
            <View style={styles.cardHeaderRow}>
              <Calendar size={16} color={Colors.primary} />
              <Text style={styles.fieldLabel}>Delivery Date</Text>
            </View>
            <View style={styles.datePickerRow}>
              <TouchableOpacity onPress={() => handleDateChange('prev')} style={styles.dateArrow}>
                <Text style={styles.dateArrowText}>‹</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dateDisplay}
                onPress={() => setShowDatePicker(!showDatePicker)}
              >
                <Text style={styles.dateDisplayText}>{format(deliveryDate, 'dd-MM-yyyy')}</Text>
                <Calendar size={14} color={Colors.textTertiary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDateChange('next')} style={styles.dateArrow}>
                <Text style={styles.dateArrowText}>›</Text>
              </TouchableOpacity>
            </View>
            <Modal visible={showDatePicker} transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
              <TouchableOpacity style={pmStyles.backdrop} activeOpacity={1} onPress={() => setShowDatePicker(false)} />
              <View style={pmStyles.sheet}>
                <View style={pmStyles.handle} />
                <Text style={pmStyles.title}>Select Delivery Date</Text>
                <FlatList
                  data={Array.from({ length: 14 }, (_, i) => i)}
                  keyExtractor={(i) => String(i)}
                  style={pmStyles.list}
                  showsVerticalScrollIndicator={true}
                  renderItem={({ item: i }) => {
                    const d = addDays(minDate, i);
                    const isSelected = format(deliveryDate, 'yyyy-MM-dd') === format(d, 'yyyy-MM-dd');
                    return (
                      <TouchableOpacity
                        style={[pmStyles.item, isSelected && pmStyles.itemActive]}
                        onPress={() => handleSelectDate(i)}
                      >
                        <Text style={[pmStyles.itemText, isSelected && pmStyles.itemTextActive]}>
                          {format(d, 'EEE, dd MMM yyyy')}{i === 0 ? (pastCutoff ? '  (10 AM or later)' : '  (earliest)') : ''}
                        </Text>
                        {isSelected && <View style={pmStyles.dot} />}
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            </Modal>
          </View>

          <View style={styles.deliveryField}>
            <View style={styles.cardHeaderRow}>
              <Clock size={16} color={Colors.primary} />
              <Text style={styles.fieldLabel}>Delivery Time</Text>
            </View>
            <TouchableOpacity
              style={styles.dateDisplay}
              onPress={() => setShowTimePicker(!showTimePicker)}
            >
              <Text style={styles.dateDisplayText}>{deliveryTime}</Text>
              <Clock size={14} color={Colors.textTertiary} />
            </TouchableOpacity>
            <PickerModal
              visible={showTimePicker}
              title="Select Delivery Time"
              options={availableTimeSlots}
              selected={deliveryTime}
              onSelect={setDeliveryTime}
              onClose={() => setShowTimePicker(false)}
            />
          </View>
        </View>

        {/* ---- ADDRESS ---- */}
        <View style={[styles.card, showAddressWarning && styles.cardError]}>
          <View style={styles.cardHeaderRow}>
            <MapPin size={16} color={Colors.primary} />
            <Text style={styles.cardTitle}>Delivery Address</Text>
          </View>

          {addresses.length === 0 ? (
            <TouchableOpacity
              style={styles.addAddressBtn}
              onPress={() => router.push({ pathname: '/(customer)/address-form', params: { returnTo: 'custom-order' } })}
            >
              <Text style={styles.addAddressBtnText}>+ Add delivery address</Text>
            </TouchableOpacity>
          ) : (
            <>
              {visibleAddresses.map((addr) => (
                <TouchableOpacity
                  key={addr.id}
                  style={[styles.addressOption, selectedAddress === addr.id && styles.addressSelected]}
                  onPress={() => { setSelectedAddress(addr.id); setShowAddressWarning(false); setError(''); }}
                >
                  <View style={[styles.radioCircle, selectedAddress === addr.id && styles.radioCircleActive]}>
                    {selectedAddress === addr.id && <View style={styles.radioDot} />}
                  </View>
                  <View style={styles.addressInfo}>
                    <Text style={styles.addressLabel}>{addr.label}</Text>
                    <Text style={styles.addressText}>
                      {addr.street}, {addr.city}, {addr.state} {addr.pincode}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
              {addresses.length > 1 && (
                <TouchableOpacity style={styles.showAllBtn} onPress={() => setShowAllAddresses(!showAllAddresses)}>
                  <Text style={styles.showAllText}>{showAllAddresses ? 'Show Less' : 'Show All Addresses'}</Text>
                  <ChevronDown size={14} color={Colors.textPrimary} style={showAllAddresses ? { transform: [{ rotate: '180deg' }] } : {}} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.addAnotherBtn}
                onPress={() => router.push({ pathname: '/(customer)/address-form', params: { returnTo: 'custom-order' } })}
              >
                <Text style={styles.addAnotherText}>Add Address</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ---- NOTES ---- */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <MessageSquare size={16} color={Colors.textTertiary} />
            <TextInput
              style={styles.notesInput}
              placeholder="Any suggestions? We will pass it on..."
              placeholderTextColor={Colors.textTertiary}
              multiline
              numberOfLines={3}
              value={specialInstructions}
              onChangeText={setSpecialInstructions}
            />
          </View>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 10 }]}>
        <TouchableOpacity
          onPress={validateAndSubmit}
          activeOpacity={0.88}
          disabled={submitting}
          style={styles.buyBtn}
        >
          <LinearGradient
            colors={['#F4792B', '#E05A1A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.buyBtnGradient}
          >
            <Text style={styles.buyBtnText}>
              {submitting ? 'Placing Order...' : 'BUY NOW'}
            </Text>
            {!submitting && <ArrowRight size={18} color="#fff" strokeWidth={2.5} />}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <PickerModal
        visible={showFlowerPicker}
        title="Select Flower"
        options={FLOWER_OPTIONS}
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
        options={FLOWER_OPTIONS}
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

      <Modal visible={successModal} transparent animationType="fade" onRequestClose={() => { }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalIconBg}>
              <Text style={{ fontSize: 36 }}>{savedGarlands.length > 0 && savedFlowers.length > 0 ? '🌸' : savedGarlands.length > 0 ? '🌼' : '🌺'}</Text>
            </View>
            <Text style={styles.modalTitle}>Order Placed!</Text>
            <Text style={styles.modalBody}>
              Your custom order for{' '}
              <Text style={styles.modalBold}>{successDate}</Text> has been received.
              We will confirm it shortly.
            </Text>
            <TouchableOpacity
              style={styles.modalBtn}
              onPress={() => { setSuccessModal(false); router.back(); }}
            >
              <Text style={styles.modalBtnText}>Great, Thanks!</Text>
            </TouchableOpacity>
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
  content: { padding: Spacing[5], gap: Spacing[4], paddingBottom: 120 },
  subtitle: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  cutoffBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    backgroundColor: Colors.warningSurface,
    borderRadius: Radius.md,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: '#F6D860',
  },
  cutoffText: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.warning,
    lineHeight: Typography.size.sm * 1.5,
  },
  typeTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.neutral[100],
    borderRadius: Radius.full,
    padding: 3,
    gap: 3,
  },
  typeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
    gap: Spacing[1],
  },
  typeTabActive: { backgroundColor: Colors.accent },
  typeTabEmoji: { fontSize: 16 },
  typeTabText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  typeTabTextActive: {
    color: Colors.white,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing[3],
    ...Shadow.sm,
  },
  cardError: { borderColor: Colors.error },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  cardIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#1A1A2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconEmoji: { fontSize: 16 },
  cardTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  twoCol: { flexDirection: 'row', gap: Spacing[3], alignItems: 'flex-end' },
  colFlex: { flex: 1, gap: 4 },
  colFixed: { width: 110, gap: 4 },
  fieldLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginBottom: 2,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    backgroundColor: Colors.background,
    height: 40,
  },
  inputFull: { width: '100%' },
  dropdownPlaceholder: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  dropdownValue: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
    height: 40,
  },
  pickerList: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    overflow: 'hidden',
    marginTop: 4,
    maxHeight: 200,
    ...Shadow.sm,
  },
  pickerItem: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  pickerItemActive: { backgroundColor: Colors.primarySurface },
  pickerItemText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  pickerItemTextActive: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.sansMedium,
  },
  measureToggleRow: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  measureToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
  },
  measureToggleBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: '#FFF4EE',
  },
  measureToggleText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  measureToggleTextActive: { color: Colors.accent },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: { borderColor: Colors.accent },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent,
  },
  saveBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[5],
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { backgroundColor: Colors.neutral[300] },
  saveBtnFull: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnFullDisabled: { backgroundColor: Colors.neutral[300] },
  saveBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.white,
  },
  savedSection: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  savedSectionTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[2],
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  tableHeaderCell: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  tableCell: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  colFlower: { flex: 1 },
  colQty: { width: 44 },
  colUnit: { width: 60 },
  colGFlower: { flex: 1 },
  colGCount: { width: 52 },
  colGMeasure: { width: 52 },
  colGSize: { width: 44 },
  colActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
    width: 52,
    justifyContent: 'flex-end',
  },
  actionBtn: { padding: 4 },
  deliveryField: { gap: 6 },
  datePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  dateArrow: {
    width: 32,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
  },
  dateArrowText: { fontSize: 20, color: Colors.textSecondary, lineHeight: 24 },
  dateDisplay: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    backgroundColor: Colors.background,
    height: 40,
  },
  dateDisplayText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  addAddressBtn: {
    padding: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addAddressBtnText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.primary,
  },
  addressOption: {
    flexDirection: 'row',
    gap: Spacing[3],
    padding: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addressSelected: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  addressInfo: { flex: 1, gap: 2 },
  addressLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  addressText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    lineHeight: 16,
  },
  showAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[1],
    paddingVertical: Spacing[2],
  },
  showAllText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  addAnotherBtn: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
  },
  addAnotherText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.white,
  },
  notesInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    minHeight: 60,
    textAlignVertical: 'top',
    paddingTop: 0,
  },
  errorText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.error,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[4],
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    ...Shadow.lg,
  },
  buyBtn: { borderRadius: Radius.xl, overflow: 'hidden' },
  buyBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[4],
    borderRadius: Radius.xl,
  },
  buyBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.base,
    color: Colors.white,
    letterSpacing: 1.2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[5],
  },
  modalSheet: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing[6],
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    gap: Spacing[3],
    ...Shadow.lg,
  },
  modalIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[1],
  },
  modalTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'],
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  modalBody: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalBold: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    color: Colors.textPrimary,
  },
  modalBtn: {
    marginTop: Spacing[2],
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[8],
  },
  modalBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.white,
  },
});
