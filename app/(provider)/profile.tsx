import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Award, BriefcaseBusiness, CheckCircle2, LogOut, MapPin, Save, ShieldCheck, UserRound } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

const CATEGORY_OPTIONS = ['astrology', 'vaastu', 'pandit'];

type ProviderProfile = {
  id: string;
  full_name: string;
  mobile: string;
  email: string | null;
  category: string[];
  specialization: string;
  experience_years: number;
  bio: string;
  city: string;
  address: string;
  approval_status: string;
  is_active: boolean;
  bookings_enabled: boolean;
};

export default function ProviderProfileScreen() {
  const { session, signOut } = useAuthStore();
  const [provider, setProvider] = useState<ProviderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [bio, setBio] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [experience, setExperience] = useState('');

  const load = useCallback(async () => {
    if (!session?.user?.id) return;

    const { data } = await supabase
      .from('service_providers')
      .select('id, full_name, mobile, email, category, specialization, experience_years, bio, city, address, approval_status, is_active, bookings_enabled')
      .eq('auth_user_id', session.user.id)
      .maybeSingle();

    if (!data) return;

    const profile = data as ProviderProfile;
    setProvider(profile);
    setCategories(profile.category ?? []);
    setFullName(profile.full_name ?? '');
    setEmail(profile.email ?? '');
    setCity(profile.city ?? '');
    setAddress(profile.address ?? '');
    setBio(profile.bio ?? '');
    setSpecialization(profile.specialization ?? '');
    setExperience(String(profile.experience_years ?? 0));
    setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!provider) return;
    if (categories.length === 0) {
      setMessage('Select at least one category.');
      return;
    }

    setSaving(true);
    setMessage('');
    const { error } = await supabase
      .from('service_providers')
      .update({
        category: categories,
        full_name: fullName.trim(),
        email: email.trim() || null,
        city: city.trim(),
        address: address.trim(),
        bio: bio.trim(),
        specialization: specialization.trim(),
        experience_years: Number(experience) || 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', provider.id);

    setMessage(error ? 'Could not save your changes.' : 'Profile saved successfully.');
    setSaving(false);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;

  const initials = fullName.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'P';
  const statusLabel = provider?.approval_status === 'approved' ? 'Approved profile' : 'Profile under review';
  const statusColor = provider?.approval_status === 'approved' ? Colors.success : Colors.warning;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.eyebrow}>PANDIT ACCOUNT</Text>
          <Text style={styles.title}>Your profile</Text>
          <Text style={styles.subtitle}>Make it easy for devotees to know you.</Text>
        </View>
        <TouchableOpacity style={styles.logout} onPress={signOut} activeOpacity={0.8}>
          <LogOut size={17} color={Colors.error} />
        </TouchableOpacity>
      </View>

      <View style={styles.profileHero}>
        <View style={styles.heroGlow} />
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroName}>{fullName || 'Your name'}</Text>
          <Text style={styles.heroSpecialization}>{specialization || 'Pooja specialist'}</Text>
          <View style={styles.locationRow}>
            <MapPin size={13} color={Colors.accentLight} />
            <Text style={styles.locationText}>{city || 'Add your city'}</Text>
          </View>
        </View>
        <View style={styles.statusPill}>
          <CheckCircle2 size={13} color={statusColor} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      <View style={styles.statsCard}>
        <View style={styles.statItem}>
          <Award size={18} color={Colors.accentDark} />
          <Text style={styles.statValue}>{experience || '0'}</Text>
          <Text style={styles.statLabel}>Years experience</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <BriefcaseBusiness size={18} color={Colors.primary} />
          <Text style={styles.statValue}>{categories.length}</Text>
          <Text style={styles.statLabel}>Specialties</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <ShieldCheck size={18} color={Colors.success} />
          <Text style={styles.statValue}>{provider?.bookings_enabled ? 'Open' : 'Paused'}</Text>
          <Text style={styles.statLabel}>Booking status</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIcon}><UserRound size={17} color={Colors.primary} /></View>
          <View>
            <Text style={styles.sectionTitle}>Personal details</Text>
            <Text style={styles.sectionSubtitle}>The information shown on your public profile.</Text>
          </View>
        </View>

        <Text style={styles.label}>Services you offer</Text>
        <View style={styles.categoryRow}>
          {CATEGORY_OPTIONS.map((item) => {
            const active = categories.includes(item);
            return (
              <TouchableOpacity key={item} style={[styles.categoryChip, active && styles.categoryChipActive]} onPress={() => setCategories((current) => active ? current.filter((value) => value !== item) : [...current, item])} activeOpacity={0.8}>
                {active ? <CheckCircle2 size={13} color={Colors.primary} /> : null}
                <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{item}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.formGrid}>
          <Field label="Full name" value={fullName} onChangeText={setFullName} />
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <Field label="City" value={city} onChangeText={setCity} />
          <Field label="Years of experience" value={experience} onChangeText={setExperience} keyboardType="number-pad" />
        </View>
        <Field label="Specialization" value={specialization} onChangeText={setSpecialization} />
        <Field label="Address" value={address} onChangeText={setAddress} />
        <Field label="About your practice" value={bio} onChangeText={setBio} multiline />
      </View>

      {message ? <View style={[styles.messageBox, message.includes('Could not') && styles.messageError]}><Text style={styles.message}>{message}</Text></View> : null}

      <TouchableOpacity style={[styles.save, saving && styles.saveDisabled]} onPress={save} disabled={saving} activeOpacity={0.85}>
        {saving ? <ActivityIndicator color={Colors.white} /> : <><Save size={17} color={Colors.white} /><Text style={styles.saveText}>Save profile</Text></>}
      </TouchableOpacity>
      <Text style={styles.footerNote}>Your profile helps customers choose the right Pandit for their Pooja.</Text>
    </ScrollView>
  );
}

function Field({ label, value, onChangeText, multiline = false, keyboardType = 'default' }: { label: string; value: string; onChangeText: (text: string) => void; multiline?: boolean; keyboardType?: 'default' | 'email-address' | 'number-pad' }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={[styles.input, multiline && styles.multiline]} value={value} onChangeText={onChangeText} keyboardType={keyboardType} multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'} placeholderTextColor={Colors.textDisabled} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing[5], paddingTop: Spacing[7], gap: Spacing[4], paddingBottom: Spacing[10] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, letterSpacing: 1.4, color: Colors.primary },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['3xl'], color: Colors.textPrimary, marginTop: 4 },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 3 },
  logout: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: Colors.errorSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F4C7C7' },
  profileHero: { minHeight: 148, backgroundColor: Colors.primaryDark, borderRadius: Radius.xl, padding: Spacing[5], flexDirection: 'row', alignItems: 'center', gap: Spacing[3], overflow: 'hidden', ...Shadow.md },
  heroGlow: { position: 'absolute', width: 210, height: 210, borderRadius: 105, right: -72, top: -82, backgroundColor: 'rgba(212,168,83,0.18)' },
  avatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.35)' },
  avatarText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.white, letterSpacing: 1 },
  heroCopy: { flex: 1, gap: 3 },
  heroName: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.white },
  heroSpecialization: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: 'rgba(255,255,255,0.72)' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  locationText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.accentLight },
  statusPill: { position: 'absolute', right: Spacing[4], bottom: Spacing[4], flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 8, paddingVertical: 5, borderRadius: Radius.full },
  statusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10 },
  statsCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: Colors.white, borderRadius: Radius.lg, paddingVertical: Spacing[4], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  statItem: { flex: 1, alignItems: 'center', gap: 3 },
  statValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  statLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary, textAlign: 'center' },
  statDivider: { width: 1, height: 38, backgroundColor: Colors.divider },
  card: { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[5], gap: Spacing[4], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingBottom: Spacing[1] },
  sectionIcon: { width: 36, height: 36, borderRadius: Radius.md, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  sectionSubtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  categoryChipActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  categoryChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary, textTransform: 'capitalize' },
  categoryChipTextActive: { color: Colors.primary },
  formGrid: { gap: Spacing[4] },
  field: { gap: 6 },
  label: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  input: { minHeight: 46, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing[3], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, backgroundColor: Colors.neutral[50] },
  multiline: { minHeight: 104, paddingTop: Spacing[3], lineHeight: 20 },
  messageBox: { backgroundColor: Colors.successSurface, borderRadius: Radius.md, padding: Spacing[3], borderWidth: 1, borderColor: '#C8E6C9' },
  messageError: { backgroundColor: Colors.errorSurface, borderColor: '#F4C7C7' },
  message: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.success, textAlign: 'center' },
  save: { minHeight: 54, borderRadius: Radius.lg, backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2], ...Shadow.md },
  saveDisabled: { opacity: 0.65 },
  saveText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.white, fontSize: Typography.size.md },
  footerNote: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, textAlign: 'center', lineHeight: 17, paddingHorizontal: Spacing[4] },
});