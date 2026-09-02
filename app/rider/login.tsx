import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  Image,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bike, Phone, ArrowRight, UserPlus, ShieldCheck } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import Input from '@/components/ui/Input';

const { width } = Dimensions.get('window');
const ACCENT = '#3AAFE4';

export default function RiderLoginScreen() {
  const insets = useSafeAreaInsets();
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canContinue = /^[6-9]\d{9}$/.test(mobile.trim());

  const handleContinue = async () => {
    if (!canContinue) {
      setError('Please enter a valid 10-digit Indian mobile number');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const { data: rider } = await supabase
        .from('riders')
        .select('approval_status')
        .eq('mobile', mobile.trim())
        .maybeSingle();

      if (!rider) {
        setError('No rider account found for this number. Please register first.');
        setLoading(false);
        return;
      }
      if (rider.approval_status === 'pending_approval') {
        setError('Your registration is pending admin approval. Please wait for confirmation.');
        setLoading(false);
        return;
      }
      if (rider.approval_status === 'rejected') {
        setError('Your application was rejected. Please contact the admin team.');
        setLoading(false);
        return;
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ mobile: mobile.trim(), channel: 'whatsapp' }),
      });
      const data = await res.json();

      if (!data?.success) {
        setError(data?.error || 'Failed to send OTP. Please try again.');
        setLoading(false);
        return;
      }

      router.push({ pathname: '/rider/otp-verify', params: { mobile: mobile.trim(), channel: 'whatsapp' } });
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const MobileInput = () => (
    <Input
      label="Mobile Number"
      value={mobile}
      onChangeText={(t) => { setMobile(t.replace(/[^0-9]/g, '').slice(0, 10)); setError(''); }}
      keyboardType="phone-pad"
      maxLength={10}
      placeholder="98765 43210"
      prefix={
        <View style={s.countryCode}>
          <Text style={s.flag}>🇮🇳</Text>
          <Text style={s.code}>+91</Text>
        </View>
      }
      autoFocus
      returnKeyType="done"
      onSubmitEditing={handleContinue}
    />
  );

  const SendOtpBtn = () => (
    <TouchableOpacity
      style={[s.primaryBtn, (!canContinue || loading) && s.primaryBtnDisabled]}
      onPress={handleContinue}
      disabled={!canContinue || loading}
      activeOpacity={0.85}
    >
      {loading
        ? <ActivityIndicator size="small" color={Colors.white} />
        : <><Text style={s.primaryBtnText}>Send OTP</Text><ArrowRight size={18} color={Colors.white} strokeWidth={2.2} /></>
      }
    </TouchableOpacity>
  );

  const RegisterBtn = () => (
    <TouchableOpacity style={s.registerBtn} onPress={() => router.push('/rider/register')} activeOpacity={0.85}>
      <UserPlus size={18} color={Colors.primary} strokeWidth={1.8} />
      <Text style={s.registerBtnText}>Register as a Rider</Text>
    </TouchableOpacity>
  );

  if (Platform.OS !== 'web') {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          style={s.container}
          contentContainerStyle={[s.scroll, { paddingTop: insets.top, paddingBottom: insets.bottom + Spacing[8] }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Image
            source={{ uri: 'https://images.pexels.com/photos/1402787/pexels-photo-1402787.jpeg?auto=compress&cs=tinysrgb&w=800' }}
            style={s.heroImage}
            resizeMode="cover"
          />
          <View style={s.heroOverlay} />
          <View style={[s.heroBrand, { top: insets.top + Spacing[4] }]}>
            <Bike size={20} color={ACCENT} strokeWidth={1.8} />
            <Text style={s.heroBrandText}>Rider Portal</Text>
          </View>

          <View style={s.card}>
            <View style={s.iconWrap}>
              <Phone size={24} color={Colors.primary} strokeWidth={1.8} />
            </View>
            <Text style={s.heading}>Sign In</Text>
            <Text style={s.subheading}>Enter your registered mobile to receive an OTP</Text>

            <View style={s.formGroup}>
              <MobileInput />
              {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}
              <SendOtpBtn />
            </View>

            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>New rider?</Text>
              <View style={s.dividerLine} />
            </View>

            <RegisterBtn />

            <TouchableOpacity onPress={() => router.replace('/auth/welcome')} style={s.backLink}>
              <Text style={s.backLinkText}>Back to customer portal</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // Web layout
  return (
    <View style={w.container}>
      <View style={w.left}>
        <Image
          source={{ uri: 'https://images.pexels.com/photos/1402787/pexels-photo-1402787.jpeg?auto=compress&cs=tinysrgb&w=1200' }}
          style={w.leftImage}
          resizeMode="cover"
        />
        <View style={w.leftOverlay} />
        <View style={w.leftContent}>
          <View style={w.brandRow}>
            <View style={w.bikeIconWrap}>
              <Bike size={24} color={ACCENT} strokeWidth={1.8} />
            </View>
            <View>
              <Text style={w.brandName}>33 Crores</Text>
              <Text style={w.portalLabel}>Rider Portal</Text>
            </View>
          </View>
          <View style={w.heroText}>
            <Text style={w.heroTitle}>Deliver happiness,{'\n'}one bouquet at a time</Text>
            <Text style={w.heroSub}>View your daily delivery schedule, track assignments, and keep customers smiling.</Text>
          </View>
          <View style={w.features}>
            {['View your daily delivery schedule', 'Track assigned orders in real-time', 'Mark deliveries as completed'].map((f) => (
              <View key={f} style={w.featureRow}>
                <View style={w.featureDot} />
                <Text style={w.featureText}>{f}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={w.right}>
        <View style={w.form}>
          <View style={w.formHeader}>
            <View style={w.formIcon}>
              <Phone size={26} color={Colors.primary} strokeWidth={1.8} />
            </View>
            <Text style={w.formTitle}>Rider Sign In</Text>
            <Text style={w.formSub}>Enter your registered mobile to receive an OTP</Text>
          </View>

          <MobileInput />
          {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}
          <SendOtpBtn />

          <View style={s.divider}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>New rider?</Text>
            <View style={s.dividerLine} />
          </View>

          <RegisterBtn />

          <View style={w.linksRow}>
            <TouchableOpacity onPress={() => router.replace('/auth/welcome')}>
              <Text style={w.linkText}>Customer portal</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.replace('/admin/login')}>
              <Text style={w.linkText}>Admin portal</Text>
            </TouchableOpacity>
          </View>

          <View style={w.secNote}>
            <ShieldCheck size={13} color={Colors.textTertiary} />
            <Text style={w.secText}>Restricted access — authorized riders only</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1 },
  heroImage: { width, height: 220 },
  heroOverlay: { position: 'absolute', top: 0, left: 0, right: 0, height: 220, backgroundColor: 'rgba(10,20,30,0.55)' },
  heroBrand: {
    position: 'absolute', left: Spacing[6],
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 1, borderColor: 'rgba(58,175,228,0.4)',
    paddingHorizontal: Spacing[3], paddingVertical: 8, borderRadius: 30,
  },
  heroBrandText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
  card: {
    flex: 1, backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    marginTop: -Radius.xl, paddingHorizontal: Spacing[6], paddingTop: Spacing[7],
    paddingBottom: Spacing[6], gap: Spacing[5],
  },
  iconWrap: { width: 56, height: 56, borderRadius: Radius.lg, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  heading: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['3xl'], color: Colors.textPrimary, letterSpacing: -0.4 },
  subheading: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textSecondary, lineHeight: 24, marginTop: -Spacing[2] },
  formGroup: { gap: Spacing[4] },
  countryCode: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingRight: Spacing[2], borderRightWidth: 1, borderRightColor: Colors.border },
  flag: { fontSize: 16 },
  code: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.base, color: Colors.textPrimary },
  errorBox: { backgroundColor: Colors.errorSurface, borderRadius: Radius.md, padding: Spacing[3] },
  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2],
    backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing[4], minHeight: 56,
  },
  primaryBtnDisabled: { opacity: 0.42 },
  primaryBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.md, color: Colors.white, letterSpacing: 0.2 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  registerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2],
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: Radius.lg,
    paddingVertical: Spacing[4], minHeight: 52, backgroundColor: Colors.primarySurface,
  },
  registerBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.primary },
  backLink: { alignItems: 'center', paddingVertical: Spacing[1] },
  backLinkText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textDecorationLine: 'underline' },
});

const w = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', minHeight: '100%' as any },
  left: { flex: 1, position: 'relative', overflow: 'hidden' },
  leftImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  leftOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,30,40,0.72)' },
  leftContent: { flex: 1, padding: Spacing[12], justifyContent: 'space-between', position: 'relative', zIndex: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  bikeIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(58,175,228,0.18)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(58,175,228,0.3)' },
  brandName: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.white },
  portalLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: 'rgba(255,255,255,0.6)' },
  heroText: { gap: Spacing[4] },
  heroTitle: { fontFamily: Typography.fontFamily.bold, fontSize: 42, color: Colors.white, lineHeight: 52 },
  heroSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.lg, color: 'rgba(255,255,255,0.75)', lineHeight: 28, maxWidth: 380 },
  features: { gap: Spacing[3] },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  featureDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT },
  featureText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: 'rgba(255,255,255,0.8)' },
  right: { width: 480, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', padding: Spacing[10] },
  form: { width: '100%', maxWidth: 400, gap: Spacing[5] },
  formHeader: { gap: Spacing[2] },
  formIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing[2] },
  formTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['3xl'], color: Colors.textPrimary },
  formSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textTertiary },
  linksRow: { flexDirection: 'row', justifyContent: 'space-between' },
  linkText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textDecorationLine: 'underline' },
  secNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2] },
  secText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
});
