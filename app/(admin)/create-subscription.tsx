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
} from 'react-native';
import ModuleGuard from '@/components/admin/ModuleGuard';
import { router } from 'expo-router';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { SubscriptionPlan, Profile, DeliveryFrequency } from '@/types/database';
import {
  ArrowLeft, User, MapPin, Package, CreditCard,
  Search, Check, ChevronDown, X, Plus, CircleCheck,
} from 'lucide-react-native';
import { addWeeks, addMonths, addDays, format, isValid, parseISO } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

type PlaceCategory = 'Individual' | 'Apartment' | 'Business' | 'Temple';
type AddressType = 'Home' | 'Work' | 'Other';
type PaymentMode = 'cash' | 'upi' | 'razorpay' | 'bank_transfer' | 'card' | 'cheque';

interface SavedAddress {
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

interface FormErrors {
  userSearch?: string;
  newFullName?: string;
  newMobile?: string;
  placeCategory?: string;
  flatPlot?: string;
  locality?: string;
  city?: string;
  state?: string;
  addressType?: string;
  planId?: string;
  duration?: string;
  startDate?: string;
  amount?: string;
  paymentMode?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLACE_CATEGORIES: PlaceCategory[] = ['Individual', 'Apartment', 'Business', 'Temple'];
const ADDRESS_TYPES: AddressType[] = ['Home', 'Work', 'Other'];
const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'razorpay', label: 'Razorpay' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
];

const DURATION_OPTIONS: { value: DeliveryFrequency; label: string; months: number; days?: number }[] = [
  { value: 'weekly', label: 'Weekly (1 week)', months: 0.25 },
  { value: 'biweekly', label: 'Bi-Weekly (2 weeks)', months: 0.5 },
  { value: 'monthly', label: 'Monthly (29 days)', months: 1, days: 29 },
  { value: '3months', label: '3 Months (89 days)', months: 3, days: 89 },
  { value: '6months', label: '6 Months (179 days)', months: 6, days: 179 },
];

const INDIA_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

// Prices stored in paise → convert to rupees for display
const toRupees = (paise: number) => Math.round(paise / 100);

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <Text style={styles.fieldError}>{error}</Text>;
}

function PillSelector<T extends string>({
  options,
  value,
  onChange,
  error,
}: {
  options: T[];
  value: T | '';
  onChange: (v: T) => void;
  error?: string;
}) {
  return (
    <>
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
      <FieldError error={error} />
    </>
  );
}

// Native date picker for web using <input type="date">
function DatePickerInput({
  label,
  value,
  onChange,
  error,
  required,
  editable = true,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  editable?: boolean;
  placeholder?: string;
}) {
  if (Platform.OS === 'web') {
    return (
      <View style={styles.fieldWrap}>
        <FieldLabel label={label} required={required} />
        <View style={[styles.textInput, error ? styles.inputError : null, !editable && styles.inputDisabled]}>
          {/* @ts-ignore – web-only element */}
          <input
            type="date"
            value={value}
            onChange={(e: any) => editable && onChange(e.target.value)}
            disabled={!editable}
            placeholder={placeholder}
            style={{
              border: 'none',
              outline: 'none',
              fontFamily: 'DMSans-Regular',
              fontSize: 15,
              color: value ? '#1A1917' : '#8C8880',
              backgroundColor: 'transparent',
              width: '100%',
              cursor: editable ? 'pointer' : 'not-allowed',
            }}
          />
        </View>
        <FieldError error={error} />
      </View>
    );
  }

  // Native fallback: plain text input
  return (
    <FormInput
      label={label}
      value={value}
      onChangeText={onChange}
      error={error}
      required={required}
      placeholder={placeholder ?? 'YYYY-MM-DD'}
      editable={editable}
    />
  );
}

// Inline select — renders options inline to avoid overflow/clipping issues
function SelectField({
  label,
  value,
  options,
  onChange,
  error,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={styles.fieldWrap}>
      <FieldLabel label={label} required={required} />
      <TouchableOpacity
        style={[styles.selectBox, error ? styles.inputError : null, open && styles.inputFocused]}
        onPress={() => setOpen(!open)}
        activeOpacity={0.8}
      >
        <Text style={[styles.selectText, !selected && styles.placeholderText]}>
          {selected ? selected.label : (placeholder ?? 'Select…')}
        </Text>
        <ChevronDown
          size={16}
          color={Colors.textTertiary}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
      </TouchableOpacity>

      {/* Inline expanded list — no absolute positioning, no overflow issues */}
      {open && (
        <View style={styles.inlineDropdown}>
          <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.dropdownItem, value === opt.value && styles.dropdownItemActive]}
                onPress={() => { onChange(opt.value); setOpen(false); }}
              >
                <Text style={[styles.dropdownItemText, value === opt.value && styles.dropdownItemTextActive]}>
                  {opt.label}
                </Text>
                {value === opt.value && <Check size={14} color={Colors.primary} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
      <FieldError error={error} />
    </View>
  );
}

function FormInput({
  label,
  value,
  onChangeText,
  error,
  required,
  placeholder,
  keyboardType,
  editable = true,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  required?: boolean;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address';
  editable?: boolean;
  multiline?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <FieldLabel label={label} required={required} />
      <TextInput
        style={[
          styles.textInput,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
          !editable && styles.inputDisabled,
          multiline && { minHeight: 80, textAlignVertical: 'top' },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textTertiary}
        keyboardType={keyboardType}
        editable={editable}
        multiline={multiline}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <FieldError error={error} />
    </View>
  );
}

function AddressFormFields({
  placeCategory, setPlaceCategory,
  flatPlot, setFlatPlot,
  apartmentName, setApartmentName,
  locality, setLocality,
  city, setCity,
  addrState, setAddrState,
  pincode, setPincode,
  landmark, setLandmark,
  addressType, setAddressType,
  stateOptions,
  errors, setErrors,
}: {
  placeCategory: PlaceCategory | '';
  setPlaceCategory: (v: PlaceCategory) => void;
  flatPlot: string; setFlatPlot: (v: string) => void;
  apartmentName: string; setApartmentName: (v: string) => void;
  locality: string; setLocality: (v: string) => void;
  city: string; setCity: (v: string) => void;
  addrState: string; setAddrState: (v: string) => void;
  pincode: string; setPincode: (v: string) => void;
  landmark: string; setLandmark: (v: string) => void;
  addressType: AddressType | ''; setAddressType: (v: AddressType) => void;
  stateOptions: { value: string; label: string }[];
  errors: FormErrors;
  setErrors: React.Dispatch<React.SetStateAction<FormErrors>>;
}) {
  return (
    <>
      <View style={styles.fieldWrap}>
        <FieldLabel label="Place Category" required />
        <PillSelector
          options={PLACE_CATEGORIES} value={placeCategory}
          onChange={(v) => { setPlaceCategory(v); setErrors((e) => ({ ...e, placeCategory: undefined })); }}
          error={errors.placeCategory}
        />
      </View>

      <View style={styles.twoCol}>
        <View style={styles.twoColItem}>
          <FormInput
            label="Apartment / Flat / Plot" value={flatPlot} required
            onChangeText={(v) => { setFlatPlot(v); setErrors((e) => ({ ...e, flatPlot: undefined })); }}
            placeholder="e.g. Flat 4B" error={errors.flatPlot}
          />
        </View>
        <View style={styles.twoColItem}>
          <FormInput
            label="Apartment Name" value={apartmentName}
            onChangeText={setApartmentName} placeholder="e.g. Sunrise Residency"
          />
        </View>
      </View>

      <View style={styles.twoCol}>
        <View style={styles.twoColItem}>
          <FormInput
            label="Locality" value={locality} required
            onChangeText={(v) => { setLocality(v); setErrors((e) => ({ ...e, locality: undefined })); }}
            placeholder="e.g. Koramangala" error={errors.locality}
          />
        </View>
        <View style={styles.twoColItem}>
          <FormInput
            label="Town / City" value={city} required
            onChangeText={(v) => { setCity(v); setErrors((e) => ({ ...e, city: undefined })); }}
            placeholder="e.g. Bangalore" error={errors.city}
          />
        </View>
      </View>

      <View style={styles.twoCol}>
        <View style={styles.twoColItem}>
          <SelectField
            label="State" value={addrState} options={stateOptions} required
            onChange={(v) => { setAddrState(v); setErrors((e) => ({ ...e, state: undefined })); }}
            placeholder="Select state" error={errors.state}
          />
        </View>
        <View style={styles.twoColItem}>
          <FormInput
            label="Pincode" value={pincode}
            onChangeText={setPincode} placeholder="e.g. 560034" keyboardType="numeric"
          />
        </View>
      </View>

      <FormInput
        label="Landmark" value={landmark}
        onChangeText={setLandmark} placeholder="e.g. Near Metro Station"
      />

      <View style={styles.fieldWrap}>
        <FieldLabel label="Address Type" required />
        <PillSelector
          options={ADDRESS_TYPES} value={addressType}
          onChange={(v) => { setAddressType(v); setErrors((e) => ({ ...e, addressType: undefined })); }}
          error={errors.addressType}
        />
      </View>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CreateSubscriptionScreen() {
  return (
    <ModuleGuard module="orders">
      <CreateSubscriptionScreenContent />
    </ModuleGuard>
  );
}

function CreateSubscriptionScreenContent() {
  const isWeb = Platform.OS === 'web';

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);

  // User section
  const [userMode, setUserMode] = useState<'search' | 'new'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [newFullName, setNewFullName] = useState('');
  const [newMobile, setNewMobile] = useState('');

  // Address section
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
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

  // Product section
  const [planId, setPlanId] = useState('');
  const [duration, setDuration] = useState<DeliveryFrequency | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Payment section
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode | ''>('');

  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // ── Load plans ──
  useEffect(() => {
    supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        if (data) setPlans(data as SubscriptionPlan[]);
        setPlansLoading(false);
      });
  }, []);

  // ── Auto-fill amount from plan (prices stored in paise → rupees) ──
  useEffect(() => {
    if (planId) {
      const plan = plans.find((p) => p.id === planId);
      if (plan) setAmount(String(toRupees(plan.price)));
    }
  }, [planId, plans]);

  // ── Auto-calculate end date ──
  useEffect(() => {
    if (!startDate || !duration) { setEndDate(''); return; }
    try {
      const start = parseISO(startDate);
      if (!isValid(start)) { setEndDate(''); return; }
      const durOpt = DURATION_OPTIONS.find((d) => d.value === duration);
      if (!durOpt) { setEndDate(''); return; }
      let end: Date;
      if (durOpt.days !== undefined) {
        end = addDays(start, durOpt.days);
      } else if (durOpt.months < 1) {
        end = addWeeks(start, Math.round(durOpt.months * 4));
      } else {
        end = addMonths(start, durOpt.months);
      }
      setEndDate(format(end, 'yyyy-MM-dd'));
    } catch {
      setEndDate('');
    }
  }, [startDate, duration]);

  // ── Load addresses when user is selected ──
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
      .select('id, label, street, city, state, pincode, landmark, place_category, apartment_name, is_default')
      .eq('user_id', selectedUser.id)
      .order('is_default', { ascending: false })
      .then(({ data }) => {
        const addrs = (data as SavedAddress[]) ?? [];
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

  // ── Search users ──
  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
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

  // ── Validation ──
  const validate = (): boolean => {
    const e: FormErrors = {};

    if (userMode === 'search') {
      if (!selectedUser) e.userSearch = 'Please select a user or create a new one.';
    } else {
      if (!newFullName.trim()) e.newFullName = 'Full name is required.';
      if (!newMobile.trim()) e.newMobile = 'Mobile number is required.';
      else if (!/^\d{10}$/.test(newMobile.trim())) e.newMobile = 'Enter a valid 10-digit mobile number.';
    }

    const useNewAddress = userMode === 'new' || addressMode === 'new';
    if (useNewAddress) {
      if (!placeCategory) e.placeCategory = 'Place category is required.';
      if (!flatPlot.trim()) e.flatPlot = 'Apartment / Flat / Plot is required.';
      if (!locality.trim()) e.locality = 'Locality is required.';
      if (!city.trim()) e.city = 'Town / City is required.';
      if (!addrState) e.state = 'State is required.';
      if (!addressType) e.addressType = 'Address type is required.';
    } else {
      if (!selectedAddressId) e.flatPlot = 'Please select an address.';
    }

    if (!planId) e.planId = 'Please select a product / plan.';
    if (!duration) e.duration = 'Subscription duration is required.';
    if (!startDate) e.startDate = 'Start date is required.';

    if (!amount.trim()) e.amount = 'Amount is required.';
    else if (isNaN(Number(amount)) || Number(amount) <= 0) e.amount = 'Amount must be a number greater than 0.';
    if (!paymentMode) e.paymentMode = 'Payment mode is required.';

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const isComplete = (): boolean => {
    const userOk = userMode === 'search'
      ? !!selectedUser
      : (newFullName.trim().length > 0 && /^\d{10}$/.test(newMobile.trim()));
    const useNewAddress = userMode === 'new' || addressMode === 'new';
    const addrOk = useNewAddress
      ? !!(placeCategory && flatPlot.trim() && locality.trim() && city.trim() && addrState && addressType)
      : !!selectedAddressId;
    const productOk = !!planId && !!duration && !!startDate;
    const paymentOk = amount.trim() && Number(amount) > 0 && !!paymentMode;
    return !!(userOk && addrOk && productOk && paymentOk);
  };

  const [submitError, setSubmitError] = useState('');

  const handleSubmit = async () => {
    if (!validate()) return;

    // Snapshot state before any async work to avoid stale closures
    const snap = {
      userMode, selectedUser, newFullName, newMobile,
      addressMode, selectedAddressId,
      placeCategory, flatPlot, apartmentName, locality,
      city, addrState, pincode, landmark, addressType,
      planId, startDate, endDate, amount, paymentMode,
    };

    setSubmitting(true);
    setSubmitError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const useNewAddress = snap.userMode === 'new' || snap.addressMode === 'new';
      const streetParts = [snap.flatPlot.trim(), snap.apartmentName.trim()].filter(Boolean).join(', ');
      const streetFull = [streetParts, snap.locality.trim()].filter(Boolean).join(', ');

      const body: Record<string, any> = {
        user_mode: snap.userMode,
        plan_id: snap.planId,
        start_date: snap.startDate,
        end_date: snap.endDate || null,
        amount_rupees: Number(snap.amount),
        payment_mode: snap.paymentMode,
      };

      if (!useNewAddress && snap.selectedAddressId) {
        body.address_id = snap.selectedAddressId;
      } else {
        body.address_label = snap.addressType;
        body.address_street = streetFull;
        body.address_city = snap.city.trim();
        body.address_state = snap.addrState;
        body.address_pincode = snap.pincode.trim();
        body.address_landmark = snap.landmark.trim() || null;
      }

      if (snap.userMode === 'search') {
        body.user_id = snap.selectedUser!.id;
      } else {
        body.new_full_name = snap.newFullName.trim();
        body.new_mobile = snap.newMobile.trim();
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-create-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'Apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(body),
      });

      let json: any = {};
      try { json = await res.json(); } catch {}

      if (!res.ok || json.error) {
        setSubmitError(json.error ?? `Error ${res.status}: Subscription creation failed.`);
        setSubmitting(false);
        return;
      }

      setSubmitting(false);
      setSuccess(true);
    } catch (err: any) {
      setSubmitError(err?.message ?? 'An unexpected error occurred.');
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSuccess(false);
    setSelectedUser(null); setSearchQuery(''); setUserMode('search');
    setNewFullName(''); setNewMobile('');
    setSavedAddresses([]); setSelectedAddressId(null); setAddressMode('saved');
    setPlaceCategory(''); setFlatPlot(''); setApartmentName('');
    setLocality(''); setCity(''); setAddrState(''); setPincode('');
    setLandmark(''); setAddressType('');
    setPlanId(''); setDuration(''); setStartDate(''); setEndDate('');
    setAmount(''); setPaymentMode('');
    setErrors({});
  };

  // ── Success screen ──
  if (success) {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successCard}>
          <View style={styles.successIconWrap}>
            <CircleCheck size={56} color={Colors.success} />
          </View>
          <Text style={styles.successTitle}>Subscription Created</Text>
          <Text style={styles.successSub}>
            The subscription has been successfully created and is now active.
          </Text>
          <View style={styles.successActions}>
            <TouchableOpacity style={styles.successBtnPrimary} onPress={() => router.push('/(admin)/orders' as any)}>
              <Text style={styles.successBtnPrimaryText}>View Orders</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.successBtnOutline} onPress={handleReset}>
              <Text style={styles.successBtnOutlineText}>Create Another</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  const durationOptions = DURATION_OPTIONS.map((d) => ({ value: d.value, label: d.label }));
  const stateOptions = INDIA_STATES.map((s) => ({ value: s, label: s }));

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Create Subscription</Text>
          <Text style={styles.headerSub}>Set up a new subscription for a customer</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, isWeb && styles.scrollContentWeb]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.formCol, isWeb && styles.formColWeb]}>

          {/* ── Section 1: User Details ── */}
          <SectionCard
            icon={<User size={18} color={Colors.primary} />}
            title="User Details"
            accent={Colors.primary}
          >
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, userMode === 'search' && styles.toggleBtnActive]}
                onPress={() => { setUserMode('search'); setErrors((e) => ({ ...e, userSearch: undefined, newFullName: undefined, newMobile: undefined })); }}
              >
                <Search size={14} color={userMode === 'search' ? Colors.white : Colors.textSecondary} />
                <Text style={[styles.toggleText, userMode === 'search' && styles.toggleTextActive]}>Search Existing</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, userMode === 'new' && styles.toggleBtnActive]}
                onPress={() => { setUserMode('new'); setSelectedUser(null); setErrors((e) => ({ ...e, userSearch: undefined })); }}
              >
                <Plus size={14} color={userMode === 'new' ? Colors.white : Colors.textSecondary} />
                <Text style={[styles.toggleText, userMode === 'new' && styles.toggleTextActive]}>New User</Text>
              </TouchableOpacity>
            </View>

            {userMode === 'search' ? (
              <View>
                <FieldLabel label="Search by name or mobile" required />
                <View style={[styles.searchBox, errors.userSearch ? styles.inputError : null]}>
                  <Search size={16} color={Colors.textTertiary} />
                  <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={handleSearch}
                    placeholder="Type name or mobile number…"
                    placeholderTextColor={Colors.textTertiary}
                  />
                  {searching && <ActivityIndicator size="small" color={Colors.primary} />}
                  {searchQuery.length > 0 && !searching && (
                    <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); setSelectedUser(null); }}>
                      <X size={16} color={Colors.textTertiary} />
                    </TouchableOpacity>
                  )}
                </View>

                {selectedUser && (
                  <View style={styles.selectedUserCard}>
                    <View style={styles.selectedUserAvatar}>
                      <Text style={styles.selectedUserAvatarText}>
                        {selectedUser.full_name?.[0]?.toUpperCase() ?? 'U'}
                      </Text>
                    </View>
                    <View style={styles.selectedUserInfo}>
                      <Text style={styles.selectedUserName}>{selectedUser.full_name ?? 'Unknown'}</Text>
                      <Text style={styles.selectedUserMobile}>{selectedUser.mobile}</Text>
                    </View>
                    <TouchableOpacity onPress={() => { setSelectedUser(null); setSearchQuery(''); setSearchResults([]); }}>
                      <X size={16} color={Colors.textTertiary} />
                    </TouchableOpacity>
                  </View>
                )}

                {!selectedUser && searchResults.length > 0 && (
                  <View style={styles.resultsList}>
                    {searchResults.map((u) => (
                      <TouchableOpacity
                        key={u.id}
                        style={styles.resultItem}
                        onPress={() => { setSelectedUser(u); setSearchResults([]); setErrors((e) => ({ ...e, userSearch: undefined })); }}
                      >
                        <View style={styles.resultAvatar}>
                          <Text style={styles.resultAvatarText}>{u.full_name?.[0]?.toUpperCase() ?? 'U'}</Text>
                        </View>
                        <View style={styles.resultInfo}>
                          <Text style={styles.resultName}>{u.full_name ?? 'Unknown'}</Text>
                          <Text style={styles.resultMobile}>{u.mobile}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {!selectedUser && searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                  <View style={styles.noResults}>
                    <Text style={styles.noResultsText}>No customers found. Try a different search or create a new user.</Text>
                  </View>
                )}
                <FieldError error={errors.userSearch} />
              </View>
            ) : (
              <View style={styles.twoCol}>
                <View style={styles.twoColItem}>
                  <FormInput
                    label="Full Name" value={newFullName} required
                    onChangeText={(v) => { setNewFullName(v); setErrors((e) => ({ ...e, newFullName: undefined })); }}
                    placeholder="Customer full name" error={errors.newFullName}
                  />
                </View>
                <View style={styles.twoColItem}>
                  <FormInput
                    label="Mobile Number" value={newMobile} required keyboardType="phone-pad"
                    onChangeText={(v) => { setNewMobile(v); setErrors((e) => ({ ...e, newMobile: undefined })); }}
                    placeholder="10-digit mobile" error={errors.newMobile}
                  />
                </View>
              </View>
            )}
          </SectionCard>

          {/* ── Section 2: Address Details ── */}
          <SectionCard
            icon={<MapPin size={18} color="#1565C0" />}
            title="Address Details"
            accent="#1565C0"
          >
            {/* Existing user: show saved addresses picker */}
            {userMode === 'search' && selectedUser && (
              <>
                {addressesLoading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                    <Text style={styles.loadingText}>Loading addresses…</Text>
                  </View>
                ) : (
                  <>
                    {savedAddresses.length > 0 && (
                      <>
                        <View style={styles.toggleRow}>
                          <TouchableOpacity
                            style={[styles.toggleBtn, addressMode === 'saved' && styles.toggleBtnActive]}
                            onPress={() => setAddressMode('saved')}
                          >
                            <MapPin size={14} color={addressMode === 'saved' ? Colors.white : Colors.textSecondary} />
                            <Text style={[styles.toggleText, addressMode === 'saved' && styles.toggleTextActive]}>Saved Addresses</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.toggleBtn, addressMode === 'new' && styles.toggleBtnActive]}
                            onPress={() => setAddressMode('new')}
                          >
                            <Plus size={14} color={addressMode === 'new' ? Colors.white : Colors.textSecondary} />
                            <Text style={[styles.toggleText, addressMode === 'new' && styles.toggleTextActive]}>New Address</Text>
                          </TouchableOpacity>
                        </View>

                        {addressMode === 'saved' && (
                          <View style={styles.savedAddrList}>
                            {savedAddresses.map((addr) => (
                              <TouchableOpacity
                                key={addr.id}
                                style={[styles.savedAddrCard, selectedAddressId === addr.id && styles.savedAddrCardActive]}
                                onPress={() => { setSelectedAddressId(addr.id); setErrors((e) => ({ ...e, flatPlot: undefined })); }}
                                activeOpacity={0.8}
                              >
                                <View style={styles.savedAddrRadio}>
                                  <View style={[styles.radioOuter, selectedAddressId === addr.id && styles.radioOuterActive]}>
                                    {selectedAddressId === addr.id && <View style={styles.radioInner} />}
                                  </View>
                                </View>
                                <View style={styles.savedAddrInfo}>
                                  <View style={styles.savedAddrTopRow}>
                                    <Text style={[styles.savedAddrLabel, selectedAddressId === addr.id && styles.savedAddrLabelActive]}>
                                      {addr.label}
                                    </Text>
                                    {addr.is_default && (
                                      <View style={styles.defaultBadgeSmall}>
                                        <Text style={styles.defaultBadgeSmallText}>Default</Text>
                                      </View>
                                    )}
                                    {addr.place_category && (
                                      <View style={styles.categoryBadge}>
                                        <Text style={styles.categoryBadgeText}>{addr.place_category}</Text>
                                      </View>
                                    )}
                                  </View>
                                  <Text style={styles.savedAddrStreet} numberOfLines={2}>
                                    {addr.street}{addr.city ? `, ${addr.city}` : ''}{addr.state ? `, ${addr.state}` : ''}
                                    {addr.pincode ? ` - ${addr.pincode}` : ''}
                                  </Text>
                                  {addr.landmark ? (
                                    <Text style={styles.savedAddrLandmark}>Near: {addr.landmark}</Text>
                                  ) : null}
                                </View>
                              </TouchableOpacity>
                            ))}
                            <FieldError error={errors.flatPlot} />
                          </View>
                        )}
                      </>
                    )}

                    {/* No saved addresses or new address mode */}
                    {(savedAddresses.length === 0 || addressMode === 'new') && (
                      <AddressFormFields
                        placeCategory={placeCategory} setPlaceCategory={setPlaceCategory}
                        flatPlot={flatPlot} setFlatPlot={setFlatPlot}
                        apartmentName={apartmentName} setApartmentName={setApartmentName}
                        locality={locality} setLocality={setLocality}
                        city={city} setCity={setCity}
                        addrState={addrState} setAddrState={setAddrState}
                        pincode={pincode} setPincode={setPincode}
                        landmark={landmark} setLandmark={setLandmark}
                        addressType={addressType} setAddressType={setAddressType}
                        stateOptions={stateOptions}
                        errors={errors} setErrors={setErrors}
                      />
                    )}
                  </>
                )}
              </>
            )}

            {/* New user: always show address form */}
            {(userMode === 'new' || !selectedUser) && (
              <AddressFormFields
                placeCategory={placeCategory} setPlaceCategory={setPlaceCategory}
                flatPlot={flatPlot} setFlatPlot={setFlatPlot}
                apartmentName={apartmentName} setApartmentName={setApartmentName}
                locality={locality} setLocality={setLocality}
                city={city} setCity={setCity}
                addrState={addrState} setAddrState={setAddrState}
                pincode={pincode} setPincode={setPincode}
                landmark={landmark} setLandmark={setLandmark}
                addressType={addressType} setAddressType={setAddressType}
                stateOptions={stateOptions}
                errors={errors} setErrors={setErrors}
              />
            )}
          </SectionCard>

          {/* ── Section 3: Product Details ── */}
          <SectionCard
            icon={<Package size={18} color="#E65100" />}
            title="Product Details"
            accent="#E65100"
          >
            <View style={styles.fieldWrap}>
              <FieldLabel label="Select Plan" required />
              {plansLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.loadingText}>Loading plans…</Text>
                </View>
              ) : (
                <>
                  <View style={styles.planGrid}>
                    {plans.map((p) => (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.planCard, planId === p.id && styles.planCardActive]}
                        onPress={() => { setPlanId(p.id); setErrors((e) => ({ ...e, planId: undefined })); }}
                      >
                        <View style={styles.planCardTop}>
                          <Text
                            style={[styles.planCardName, planId === p.id && styles.planCardNameActive]}
                            numberOfLines={1}
                          >
                            {p.name}
                          </Text>
                          {planId === p.id && <Check size={14} color={Colors.primary} />}
                        </View>
                        <Text style={[styles.planCardPrice, planId === p.id && styles.planCardPriceActive]}>
                          ₹{toRupees(p.price)}
                        </Text>
                        <Text style={styles.planCardFreq}>{p.frequency}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <FieldError error={errors.planId} />
                </>
              )}
            </View>

            <SelectField
              label="Subscription Duration" value={duration} options={durationOptions} required
              onChange={(v) => { setDuration(v as DeliveryFrequency); setErrors((e) => ({ ...e, duration: undefined })); }}
              placeholder="Select duration" error={errors.duration}
            />

            <View style={styles.twoCol}>
              <View style={styles.twoColItem}>
                <DatePickerInput
                  label="Start Date" value={startDate} required
                  onChange={(v) => { setStartDate(v); setErrors((e) => ({ ...e, startDate: undefined })); }}
                  error={errors.startDate}
                />
              </View>
              <View style={styles.twoColItem}>
                <DatePickerInput
                  label="End Date"
                  value={endDate}
                  onChange={setEndDate}
                  placeholder="Select end date"
                />
              </View>
            </View>
          </SectionCard>

          {/* ── Section 4: Payment Details ── */}
          <SectionCard
            icon={<CreditCard size={18} color="#2E7D32" />}
            title="Payment Details"
            accent="#2E7D32"
          >
            <View style={styles.twoCol}>
              <View style={styles.twoColItem}>
                <FormInput
                  label="Amount (₹)" value={amount} required keyboardType="numeric"
                  onChangeText={(v) => { setAmount(v); setErrors((e) => ({ ...e, amount: undefined })); }}
                  placeholder="Enter amount" error={errors.amount}
                />
              </View>
              <View style={styles.twoColItem}>
                <SelectField
                  label="Payment Mode" value={paymentMode} options={PAYMENT_MODES} required
                  onChange={(v) => { setPaymentMode(v as PaymentMode); setErrors((e) => ({ ...e, paymentMode: undefined })); }}
                  placeholder="Select mode" error={errors.paymentMode}
                />
              </View>
            </View>

            <View style={styles.defaultsRow}>
              <View style={styles.defaultBadge}>
                <View style={[styles.defaultDot, { backgroundColor: Colors.success }]} />
                <Text style={styles.defaultBadgeText}>Status: <Text style={styles.defaultBadgeValue}>Active</Text></Text>
              </View>
              <View style={styles.defaultBadge}>
                <View style={[styles.defaultDot, { backgroundColor: Colors.success }]} />
                <Text style={styles.defaultBadgeText}>Payment Status: <Text style={styles.defaultBadgeValue}>Paid</Text></Text>
              </View>
            </View>
          </SectionCard>

          {/* ── Submit ── */}
          <View style={styles.submitWrap}>
            {!!submitError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{submitError}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.submitBtn, (!isComplete() || submitting) && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!isComplete() || submitting}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator color={Colors.white} size="small" />
                : <Text style={styles.submitBtnText}>Create Subscription</Text>
              }
            </TouchableOpacity>
            {!isComplete() && (
              <Text style={styles.submitHint}>Fill all required fields to enable submission.</Text>
            )}
          </View>

        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F0' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingHorizontal: Spacing[6],
    paddingVertical: Spacing[5],
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    ...Shadow.sm,
  },
  backBtn: {
    width: 36, height: 36,
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'],
    color: Colors.textPrimary,
  },
  headerSub: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing[5], paddingBottom: Spacing[16] },
  scrollContentWeb: { alignItems: 'center' },
  formCol: { gap: Spacing[5], width: '100%' },
  formColWeb: { maxWidth: 860, width: '100%' },

  // Card
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    ...Shadow.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
  },
  cardIconWrap: {
    width: 34, height: 34,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
  },
  cardBody: { padding: Spacing[5], gap: Spacing[4] },

  // Toggle
  toggleRow: { flexDirection: 'row', gap: Spacing[2], marginBottom: Spacing[2] },
  toggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    paddingVertical: Spacing[2], paddingHorizontal: Spacing[4],
    borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  toggleBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  toggleText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm, color: Colors.textSecondary,
  },
  toggleTextActive: { color: Colors.white },

  // Search
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing[3],
    backgroundColor: Colors.white, minHeight: 48,
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    paddingVertical: Spacing[2],
  },
  selectedUserCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    padding: Spacing[3],
    backgroundColor: Colors.primarySurface,
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.primary + '30',
    marginTop: Spacing[3],
  },
  selectedUserAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  selectedUserAvatarText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base, color: Colors.white,
  },
  selectedUserInfo: { flex: 1 },
  selectedUserName: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  selectedUserMobile: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm, color: Colors.textSecondary,
  },
  resultsList: {
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, marginTop: Spacing[2],
    overflow: 'hidden', backgroundColor: Colors.white,
  },
  resultItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    padding: Spacing[3],
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  resultAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center', justifyContent: 'center',
  },
  resultAvatarText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm, color: Colors.primary,
  },
  resultInfo: { flex: 1 },
  resultName: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm, color: Colors.textPrimary,
  },
  resultMobile: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  noResults: { paddingVertical: Spacing[3] },
  noResultsText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm, color: Colors.textTertiary,
  },

  // Fields
  fieldWrap: { gap: Spacing[2] },
  fieldLabel: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm, color: Colors.textSecondary,
  },
  requiredStar: { color: Colors.error },
  fieldError: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: Colors.error, marginTop: 2,
  },
  textInput: {
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3], paddingVertical: 12,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base, color: Colors.textPrimary,
    backgroundColor: Colors.white, minHeight: 48,
  },
  inputFocused: { borderColor: Colors.primary },
  inputError: { borderColor: Colors.error },
  inputDisabled: { backgroundColor: Colors.background, color: Colors.textTertiary },

  // Select
  selectBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: 12,
    backgroundColor: Colors.white, minHeight: 48,
  },
  selectText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base, color: Colors.textPrimary, flex: 1,
  },
  placeholderText: { color: Colors.textTertiary },

  // Inline dropdown — pushes content down instead of overlapping
  inlineDropdown: {
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    marginTop: Spacing[1],
    overflow: 'hidden',
    ...Shadow.sm,
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[4], paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  dropdownItemActive: { backgroundColor: Colors.primarySurface },
  dropdownItemText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm, color: Colors.textPrimary,
  },
  dropdownItemTextActive: {
    fontFamily: Typography.fontFamily.sansMedium, color: Colors.primary,
  },

  // Pills
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  pill: {
    paddingVertical: Spacing[2], paddingHorizontal: Spacing[4],
    borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  pillActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  pillText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm, color: Colors.textSecondary,
  },
  pillTextActive: { color: Colors.primary },

  // Saved address picker
  savedAddrList: { gap: Spacing[3] },
  savedAddrCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3],
    padding: Spacing[4],
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.md, backgroundColor: Colors.white,
  },
  savedAddrCardActive: {
    borderColor: Colors.primary, backgroundColor: Colors.primarySurface,
  },
  savedAddrRadio: { paddingTop: 2 },
  radioOuter: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOuterActive: { borderColor: Colors.primary },
  radioInner: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  savedAddrInfo: { flex: 1, gap: Spacing[1] },
  savedAddrTopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flexWrap: 'wrap' },
  savedAddrLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm, color: Colors.textPrimary,
  },
  savedAddrLabelActive: { color: Colors.primary },
  savedAddrStreet: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 18,
  },
  savedAddrLandmark: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  defaultBadgeSmall: {
    paddingVertical: 2, paddingHorizontal: Spacing[2],
    backgroundColor: Colors.successSurface, borderRadius: Radius.full,
  },
  defaultBadgeSmallText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs, color: Colors.success,
  },
  categoryBadge: {
    paddingVertical: 2, paddingHorizontal: Spacing[2],
    backgroundColor: '#EFF6FF', borderRadius: Radius.full,
  },
  categoryBadgeText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs, color: '#1D4ED8',
  },

  // Two-column layout
  twoCol: { flexDirection: 'row', gap: Spacing[4] },
  twoColItem: { flex: 1 },

  // Plan grid
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingVertical: Spacing[4] },
  loadingText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm, color: Colors.textTertiary,
  },
  planGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[3] },
  planCard: {
    minWidth: 120, flex: 1, padding: Spacing[3],
    borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.white, gap: Spacing[1],
  },
  planCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  planCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planCardName: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm, color: Colors.textSecondary, flex: 1,
  },
  planCardNameActive: { color: Colors.primary },
  planCardPrice: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl, color: Colors.textPrimary, marginTop: 2,
  },
  planCardPriceActive: { color: Colors.primary },
  planCardFreq: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'capitalize',
  },

  // Defaults
  defaultsRow: { flexDirection: 'row', gap: Spacing[3], flexWrap: 'wrap' },
  defaultBadge: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    paddingVertical: Spacing[2], paddingHorizontal: Spacing[3],
    backgroundColor: Colors.successSurface, borderRadius: Radius.full,
  },
  defaultDot: { width: 7, height: 7, borderRadius: 4 },
  defaultBadgeText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: Colors.textSecondary,
  },
  defaultBadgeValue: {
    fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.success,
  },

  // Submit
  submitWrap: { gap: Spacing[3], alignItems: 'center', paddingBottom: Spacing[6] },
  errorBanner: {
    width: '100%', backgroundColor: '#FEF2F2', borderRadius: Radius.sm,
    borderWidth: 1, borderColor: '#FECACA', padding: Spacing[3],
  },
  errorBannerText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm, color: '#DC2626', textAlign: 'center',
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md, paddingVertical: 16,
    paddingHorizontal: Spacing[10],
    alignItems: 'center', justifyContent: 'center',
    width: '100%', minHeight: 56, ...Shadow.sm,
  },
  submitBtnDisabled: { backgroundColor: Colors.textDisabled },
  submitBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base, color: Colors.white, letterSpacing: 0.3,
  },
  submitHint: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: Colors.textTertiary, textAlign: 'center',
  },

  // Success
  successContainer: {
    flex: 1, backgroundColor: '#F5F5F0',
    alignItems: 'center', justifyContent: 'center', padding: Spacing[6],
  },
  successCard: {
    backgroundColor: Colors.white, borderRadius: Radius.xl,
    padding: Spacing[10], alignItems: 'center',
    maxWidth: 420, width: '100%', gap: Spacing[4], ...Shadow.lg,
  },
  successIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.successSurface,
    alignItems: 'center', justifyContent: 'center',
  },
  successTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['3xl'], color: Colors.textPrimary, textAlign: 'center',
  },
  successSub: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base, color: Colors.textTertiary,
    textAlign: 'center', lineHeight: 24,
  },
  successActions: { width: '100%', gap: Spacing[3], marginTop: Spacing[2] },
  successBtnPrimary: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 14, alignItems: 'center',
  },
  successBtnPrimaryText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base, color: Colors.white,
  },
  successBtnOutline: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md,
    paddingVertical: 14, alignItems: 'center',
  },
  successBtnOutlineText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base, color: Colors.textSecondary,
  },
});
