import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ShieldCheck, ArrowRight, Clock } from 'lucide-react-native';
import OTPInput from '@/components/ui/OTPInput';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { DEFAULT_AUTH_ROUTE } from '@/constants/appRole';

const { width } = Dimensions.get('window');

export default function OtpVerifyScreen() {
  const insets = useSafeAreaInsets();
  const { mobile, channel } = useLocalSearchParams<{ mobile: string; channel: string }>();
  const { setSession, loadProfile } = useAuthStore();

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(300);
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleVerify = useCallback(async () => {
    if (otp.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ mobile, otp }),
      });

      const data = await res.json();

      if (!data?.success) {
        setError(data?.error || 'Invalid or expired OTP. Please try again.');
        return;
      }

      const signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email: data.email, password: data.password }),
      });

      const authData = await signInRes.json();

      if (!authData.access_token) {
        setError(authData.error_description || authData.msg || 'Authentication failed. Please try again.');
        return;
      }

      const session = {
        access_token: authData.access_token,
        refresh_token: authData.refresh_token,
        expires_in: authData.expires_in,
        token_type: authData.token_type,
        user: authData.user,
      };

      await supabase.auth.setSession({
        access_token: authData.access_token,
        refresh_token: authData.refresh_token,
      });

      setSession(session as any);
      const profile = await loadProfile(authData.user.id);

      if (!profile) {
        router.replace(DEFAULT_AUTH_ROUTE as any);
      } else if (profile.role === 'admin') {
        router.replace('/(admin)');
      } else if (profile.role === 'vendor') {
        router.replace('/(vendor)');
      } else if (!profile.full_name) {
        router.replace('/auth/profile-setup');
      } else {
        router.replace('/(customer)');
      }
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [otp, mobile]);

  const handleResend = async () => {
    setResending(true);
    setError('');
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ mobile, channel }),
      });
      const data = await res.json();
      if (data?.success) {
        setCountdown(300);
        setOtp('');
      } else {
        setError(data?.error || 'Failed to resend. Try again later.');
      }
    } catch {
      setError('Failed to resend. Try again later.');
    } finally {
      setResending(false);
    }
  };

  useEffect(() => {
    if (otp.length === 6 && !loading) {
      handleVerify();
    }
  }, [otp]);

  const canVerify = otp.length === 6;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top, paddingBottom: insets.bottom + Spacing[8] }]}
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
              <ShieldCheck size={22} color={Colors.primary} strokeWidth={1.8} />
            </View>
            <Text style={styles.title}>Enter verification code</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to{' '}
              <Text style={styles.highlight}>+91 {mobile}</Text>
              {' '}via {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}
            </Text>
          </View>

          <View style={styles.otpSection}>
            <OTPInput value={otp} onChange={setOtp} error={!!error} />

            <View style={styles.timerRow}>
              <Clock size={13} color={countdown > 0 ? Colors.textTertiary : Colors.error} strokeWidth={2} />
              {countdown > 0 ? (
                <Text style={styles.timerText}>
                  Expires in <Text style={styles.timerHighlight}>{formatTime(countdown)}</Text>
                </Text>
              ) : (
                <Text style={styles.expiredText}>Code has expired</Text>
              )}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>

          <TouchableOpacity
            style={[styles.verifyBtn, !canVerify && styles.verifyBtnDisabled]}
            onPress={handleVerify}
            disabled={!canVerify || loading}
            activeOpacity={0.85}
          >
            <Text style={styles.verifyBtnText}>{loading ? 'Verifying...' : 'Verify Code'}</Text>
            {!loading && <ArrowRight size={18} color={Colors.white} strokeWidth={2.2} />}
          </TouchableOpacity>

          <View style={styles.footer}>
            <View style={styles.resendRow}>
              <Text style={styles.resendText}>Didn't receive the code? </Text>
              <TouchableOpacity onPress={handleResend} disabled={countdown > 0 || resending} activeOpacity={0.7}>
                <Text style={[styles.resendLink, (countdown > 0 || resending) && styles.resendDisabled]}>
                  {resending ? 'Sending...' : 'Resend'}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.changeRow}>
              <Text style={styles.changeText}>Change mobile number</Text>
            </TouchableOpacity>
          </View>
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
    marginLeft: -10
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
  highlight: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    color: Colors.textPrimary,
  },
  otpSection: {
    gap: Spacing[4],
    alignItems: 'center',
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  timerText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  timerHighlight: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    color: Colors.primary,
  },
  expiredText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.error,
  },
  error: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.error,
    textAlign: 'center',
  },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing[4],
    minHeight: 56,
  },
  verifyBtnDisabled: {
    opacity: 0.42,
  },
  verifyBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.md,
    color: Colors.white,
    letterSpacing: 0.2,
  },
  footer: {
    gap: Spacing[2],
    alignItems: 'center',
    marginTop: -Spacing[2],
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resendText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  resendLink: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.primary,
  },
  resendDisabled: {
    color: Colors.textDisabled,
  },
  changeRow: {
    paddingVertical: Spacing[1],
  },
  changeText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    textDecorationLine: 'underline',
  },
});
