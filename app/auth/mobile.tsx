import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, Phone } from 'lucide-react-native';
import Input from '@/components/ui/Input';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';

const { width } = Dimensions.get('window');

export default function MobileScreen() {
  const insets = useSafeAreaInsets();
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState('');

  const validate = () => {
    const cleaned = mobile.replace(/\s/g, '');
    if (!cleaned || cleaned.length !== 10 || !/^[6-9]\d{9}$/.test(cleaned)) {
      setError('Please enter a valid 10-digit Indian mobile number');
      return false;
    }
    setError('');
    return true;
  };

  const handleContinue = () => {
    if (!validate()) return;
    router.push({ pathname: '/auth/otp-channel', params: { mobile: mobile.replace(/\s/g, '') } });
  };

  const canContinue = mobile.length === 10;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing[8] }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { top: insets.top + Spacing[3] }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <ArrowLeft size={20} color={Colors.white} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <Image
          source={require('@/assets/images/closeup-image-basket-with-flowers-onam-festival-background.jpg')}
          style={styles.heroImage}
          resizeMode="cover"
        />
        <View style={styles.heroOverlay} />
        <View style={[styles.heroBrand, { top: insets.top + Spacing[3] + 48 + Spacing[3] }]}>
          <Image source={require('@/assets/images/33logo-red_1.png')} style={styles.heroBrandLogo} resizeMode="contain" />
          <Text style={styles.heroBrandText}>Crores</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.iconBadge}>
              <Phone size={22} color={Colors.primary} strokeWidth={1.8} />
            </View>
            <Text style={styles.title}>Enter your mobile number</Text>
            <Text style={styles.subtitle}>We'll send a one-time verification code to confirm your identity</Text>
          </View>

          <View style={styles.form}>
            <Input
              label="Mobile Number"
              value={mobile}
              onChangeText={(text) => {
                setMobile(text.replace(/[^0-9]/g, '').slice(0, 10));
                setError('');
              }}
              keyboardType="phone-pad"
              maxLength={10}
              placeholder="98765 43210"
              error={error}
              prefix={
                <View style={styles.countryCode}>
                  <Text style={styles.flag}>🇮🇳</Text>
                  <Text style={styles.code}>+91</Text>
                </View>
              }
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleContinue}
            />
            <Text style={styles.note}>
              Standard SMS/WhatsApp rates may apply. Your number is only used for authentication.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.continueBtn, !canContinue && styles.continueBtnDisabled]}
            onPress={handleContinue}
            disabled={!canContinue}
            activeOpacity={0.85}
          >
            <Text style={styles.continueBtnText}>Continue</Text>
            <ArrowRight size={18} color={Colors.white} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flexGrow: 1,
  },
  header: {
    position: 'absolute',
    left: Spacing[5],
    zIndex: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImage: {
    width,
    height: 220,
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 220,
    backgroundColor: 'rgba(8,8,8,0.35)',
  },
  heroBrand: {
    position: 'absolute',
    left: Spacing[6],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    paddingHorizontal: Spacing[3],
    paddingVertical: 8,
    borderRadius: 30
  },
  heroBrandLogo: {
    width: 28,
    height: 28,
  },
  heroBrandText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    color: Colors.white,
    letterSpacing: -0.2,
    marginLeft: -7
  },
  card: {
    flex: 1,
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    marginTop: -Radius.xl,
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[7],
    paddingBottom: Spacing[6],
    gap: Spacing[6],
  },
  cardHeader: {
    gap: Spacing[2],
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[3],
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['3xl'],
    color: Colors.textPrimary,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    lineHeight: Typography.size.base * 1.6,
  },
  form: {
    gap: Spacing[3],
  },
  countryCode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingRight: Spacing[2],
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  flag: {
    fontSize: 16,
  },
  code: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  note: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    lineHeight: Typography.size.xs * 1.6,
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing[4],
    minHeight: 56,
  },
  continueBtnDisabled: {
    opacity: 0.42,
  },
  continueBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.md,
    color: Colors.white,
    letterSpacing: 0.2,
  },
});
