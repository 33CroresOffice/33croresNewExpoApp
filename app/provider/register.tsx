import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, Sparkles, Compass, Landmark, User, Phone, MapPin, Check } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import Input from '@/components/ui/Input';
import PhotoUploadField from '@/components/ui/PhotoUploadField';

const CATEGORIES = [
  { value: 'astrology', label: 'Astrologer', icon: Sparkles, description: 'Vedic, tarot, numerology and spiritual guidance' },
  { value: 'vaastu', label: 'Vaastu Consultant', icon: Compass, description: 'Home, office and property energy consultations' },
  { value: 'pandit', label: 'Pandit', icon: Landmark, description: 'Puja, rituals, ceremonies and traditional services' },
] as const;
const STEPS = ['Categories', 'Profile', 'Professional', 'Documents'];
type Category = typeof CATEGORIES[number]['value'];

export default function ProviderRegisterScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<Category[]>(['astrology']);
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [alternateMobile, setAlternateMobile] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [experience, setExperience] = useState('');
  const [languages, setLanguages] = useState('Hindi, English');
  const [bio, setBio] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [idProof, setIdProof] = useState<string | null>(null);

  const validate = () => {
    setError('');
    if (step === 0 && categories.length === 0) { setError('Select at least one category.'); return false; }
    if (step === 1 && (!fullName.trim() || !/^[6-9]\d{9}$/.test(mobile.trim()))) { setError('Enter your name and a valid 10-digit mobile number.'); return false; }
    if (step === 2) {
      if (!experience.trim()) { setError('Add your years of experience.'); return false; }
    }
    if (step === 3 && (!profilePhoto || !idProof)) { setError('Please upload both a profile photo and identity proof.'); return false; }
    return true;
  };

  const submit = async () => {
    setSaving(true); setError('');
    const { data, error: rpcError } = await supabase.rpc('register_service_provider', {
      p_full_name: fullName.trim(), p_mobile: mobile.trim(), p_alternate_mobile: alternateMobile.trim() || null,
      p_email: email.trim() || null, p_category: categories, p_specialization: '',
      p_experience_years: Number(experience) || 0, p_languages: languages.split(',').map((item) => item.trim()).filter(Boolean),
      p_bio: bio.trim(), p_city: city.trim(), p_address: address.trim(), p_profile_photo_url: profilePhoto, p_id_proof_url: idProof,
    });
    if (rpcError || !data) { setError('We could not submit your application. Please check your details and try again.'); setSaving(false); return; }
    router.replace({ pathname: '/provider/register-success', params: { mobile: mobile.trim() } });
  };

  const next = () => {
    if (!validate()) return;
    if (step < STEPS.length - 1) setStep(step + 1); else submit();
  };
  const toggleCategory = (value: Category) => setCategories((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  const selectedIcons = CATEGORIES.filter((item) => categories.includes(item.value));

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing[4], paddingBottom: insets.bottom + Spacing[8] }]} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.back} onPress={() => step > 0 ? setStep(step - 1) : router.back()}><ArrowLeft size={20} color={Colors.textPrimary} /></TouchableOpacity>
        <View style={styles.brand}><View style={styles.brandIcon}>{selectedIcons[0] ? (() => { const I = selectedIcons[0].icon; return <I size={22} color={Colors.primary} />; })() : null}</View><Text style={styles.brandText}>Service Provider Portal</Text></View>
        <Text style={styles.title}>{step === 0 ? 'Join our expert network' : step === 1 ? 'Tell us about you' : step === 2 ? 'Your professional profile' : 'Build trust with customers'}</Text>
        <Text style={styles.subtitle}>{step === 0 ? 'Select all the categories you practice. Many experts offer more than one service.' : 'Your application will be reviewed before your profile goes live.'}</Text>
        <View style={styles.steps}>{STEPS.map((label, index) => <View key={label} style={styles.stepItem}><View style={[styles.dot, index <= step && styles.dotActive]}><Text style={[styles.dotText, index <= step && styles.dotTextActive]}>{index + 1}</Text></View><Text style={[styles.stepLabel, index <= step && styles.stepLabelActive]}>{label}</Text>{index < STEPS.length - 1 && <View style={[styles.line, index < step && styles.lineActive]} />}</View>)}</View>

        {step === 0 && <View style={styles.categoryList}>{CATEGORIES.map((item) => { const CategoryIcon = item.icon; const active = categories.includes(item.value); return <TouchableOpacity key={item.value} style={[styles.categoryCard, active && styles.categoryCardActive]} onPress={() => toggleCategory(item.value)} activeOpacity={0.85}><View style={[styles.categoryIcon, active && styles.categoryIconActive]}><CategoryIcon size={22} color={active ? Colors.white : Colors.primary} /></View><View style={styles.categoryCopy}><Text style={[styles.categoryTitle, active && styles.categoryTitleActive]}>{item.label}</Text><Text style={[styles.categoryDescription, active && styles.categoryDescriptionActive]}>{item.description}</Text></View><View style={[styles.checkbox, active && styles.checkboxActive]}>{active ? <Check size={12} color={Colors.white} strokeWidth={3} /> : null}</View></TouchableOpacity>; })}<Text style={styles.multiSelectHint}>Selected: {categories.length} {categories.length === 1 ? 'category' : 'categories'}</Text></View>}
        {step === 1 && <View style={styles.fields}><Input label="Full Name *" value={fullName} onChangeText={setFullName} placeholder="Your full name" prefix={<User size={18} color={Colors.textTertiary} />} /><Input label="Mobile Number *" value={mobile} onChangeText={(text) => setMobile(text.replace(/[^0-9]/g, '').slice(0, 10))} keyboardType="phone-pad" maxLength={10} placeholder="98765 43210" prefix={<Text style={styles.prefix}>+91</Text>} /><Input label="Alternate Mobile" value={alternateMobile} onChangeText={(text) => setAlternateMobile(text.replace(/[^0-9]/g, '').slice(0, 10))} keyboardType="phone-pad" maxLength={10} placeholder="Optional" prefix={<Phone size={18} color={Colors.textTertiary} />} /><Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="Optional" /><Input label="City" value={city} onChangeText={setCity} placeholder="Your city" prefix={<MapPin size={18} color={Colors.textTertiary} />} /><Input label="Address" value={address} onChangeText={setAddress} placeholder="Business or consultation address" /></View>}
        {step === 2 && <View style={styles.fields}>
          <Input label="Years of Experience *" value={experience} onChangeText={(text) => setExperience(text.replace(/[^0-9]/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="e.g. 8" />
          <Input label="Languages" value={languages} onChangeText={setLanguages} placeholder="Hindi, English" />
          <Input label="About Your Practice" value={bio} onChangeText={setBio} placeholder="Tell customers what makes your service special" multiline />
        </View>}
        {step === 3 && <View style={styles.fields}><PhotoUploadField label="Profile Photo *" value={profilePhoto} onChange={setProfilePhoto} bucket="provider-photos" storagePath={`pending/${mobile}/profile`} hint="Use a clear photo customers will recognize." /><PhotoUploadField label="Identity Proof *" value={idProof} onChange={setIdProof} bucket="provider-photos" storagePath={`pending/${mobile}/identity`} hint="Upload a clear government-issued identity document." /></View>}
        {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}
        <TouchableOpacity style={[styles.button, saving && styles.buttonDisabled]} onPress={next} disabled={saving} activeOpacity={0.85}>{saving ? <ActivityIndicator color={Colors.white} /> : <><Text style={styles.buttonText}>{step < STEPS.length - 1 ? 'Continue' : 'Submit Application'}</Text><ArrowRight size={18} color={Colors.white} /></>}</TouchableOpacity>
        <TouchableOpacity style={styles.loginLink} onPress={() => router.replace('/provider/login')}><Text style={styles.loginText}>Already approved? Sign in</Text></TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: Colors.background }, scroll: { flexGrow: 1, paddingHorizontal: Spacing[6], gap: Spacing[5] }, back: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border }, brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] }, brandIcon: { width: 48, height: 48, borderRadius: Radius.lg, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' }, brandText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary }, title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['4xl'], lineHeight: 46, color: Colors.textPrimary, letterSpacing: -0.5 }, subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, lineHeight: 24, color: Colors.textSecondary, marginTop: -Spacing[3] }, steps: { flexDirection: 'row', alignItems: 'center' }, stepItem: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }, dot: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border }, dotActive: { backgroundColor: Colors.primary, borderColor: Colors.primary }, dotText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.textTertiary }, dotTextActive: { color: Colors.white }, stepLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary }, stepLabelActive: { color: Colors.primary }, line: { height: 1, backgroundColor: Colors.border, flex: 1, marginHorizontal: 3 }, lineActive: { backgroundColor: Colors.primary }, categoryList: { gap: Spacing[3] }, categoryCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], padding: Spacing[4], borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white }, categoryCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface }, categoryIcon: { width: 48, height: 48, borderRadius: Radius.md, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' }, categoryIconActive: { backgroundColor: Colors.primary }, categoryCopy: { flex: 1, gap: 3 }, categoryTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.md, color: Colors.textPrimary }, categoryTitleActive: { color: Colors.primary }, categoryDescription: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 20 }, categoryDescriptionActive: { color: Colors.textSecondary }, radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: Colors.border }, radioActive: { borderWidth: 5, borderColor: Colors.primary }, checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' }, checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary }, multiSelectHint: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.primary, textAlign: 'center', marginTop: Spacing[2] }, fields: { gap: Spacing[3] }, prefix: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.base, color: Colors.textPrimary, paddingRight: Spacing[2] }, error: { backgroundColor: Colors.errorSurface, borderRadius: Radius.md, padding: Spacing[3] }, errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error }, button: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2], backgroundColor: Colors.primary, borderRadius: Radius.lg }, buttonDisabled: { opacity: 0.55 }, buttonText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.md, color: Colors.white }, loginLink: { alignItems: 'center', paddingVertical: Spacing[2] }, loginText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textDecorationLine: 'underline' }, });
