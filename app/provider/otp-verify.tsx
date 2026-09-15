import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ShieldCheck, Clock3 } from 'lucide-react-native';
import OTPInput from '@/components/ui/OTPInput';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export default function ProviderOtpVerifyScreen() {
  const { mobile, channel } = useLocalSearchParams<{ mobile: string; channel: string }>();
  const { setSession, loadProfile, setActivePanel } = useAuthStore();
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(300);

  useEffect(() => { if (countdown <= 0) return; const timer = setInterval(() => setCountdown((value) => value - 1), 1000); return () => clearInterval(timer); }, [countdown]);
  const formatTime = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  const verify = useCallback(async () => {
    if (otp.length !== 6) { setError('Please enter the complete 6-digit code.'); return; }
    setLoading(true); setError('');
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY }, body: JSON.stringify({ mobile, otp }) });
      const body = await response.json();
      if (!response.ok || !body?.success) { setError('Invalid or expired OTP. Please try again.'); return; }
      const signIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }, body: JSON.stringify({ email: body.email, password: body.password }) });
      const authData = await signIn.json();
      if (!signIn.ok || !authData.access_token) { setError('Authentication failed. Please try again.'); return; }
      await supabase.auth.setSession({ access_token: authData.access_token, refresh_token: authData.refresh_token });
      setSession(authData as any); await loadProfile(authData.user.id); await setActivePanel('pandit'); router.replace('/(provider)');
    } catch { setError('Something went wrong. Please try again.'); } finally { setLoading(false); }
  }, [otp, mobile, loadProfile, setSession, setActivePanel]);
  useEffect(() => { if (otp.length === 6 && !loading) verify(); }, [otp, loading, verify]);

  const resend = async () => {
    setResending(true); setError('');
    try { const response = await fetch(`${SUPABASE_URL}/functions/v1/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY }, body: JSON.stringify({ mobile, channel }) }); if (!response.ok) throw new Error(); setCountdown(300); setOtp(''); } catch { setError('Could not resend the code. Please try again.'); } finally { setResending(false); }
  };

  return <View style={styles.container}><TouchableOpacity style={styles.back} onPress={() => router.back()}><ArrowLeft size={20} color={Colors.textPrimary} /></TouchableOpacity><View style={styles.icon}><ShieldCheck size={28} color={Colors.primary} /></View><Text style={styles.title}>Verify your mobile</Text><Text style={styles.subtitle}>We sent a 6-digit code to <Text style={styles.highlight}>+91 {mobile}</Text> via {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}.</Text><OTPInput value={otp} onChange={setOtp} error={!!error} />{error ? <Text style={styles.error}>{error}</Text> : null}<View style={styles.timer}><Clock3 size={14} color={countdown > 0 ? Colors.textTertiary : Colors.error} /><Text style={styles.timerText}>{countdown > 0 ? `Expires in ${formatTime(countdown)}` : 'Code expired'}</Text></View><TouchableOpacity style={[styles.button, (otp.length !== 6 || loading) && styles.disabled]} onPress={verify} disabled={otp.length !== 6 || loading}>{loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.buttonText}>Verify & Sign In</Text>}</TouchableOpacity><View style={styles.resend}><Text style={styles.muted}>Didn't receive the code? </Text><TouchableOpacity onPress={resend} disabled={countdown > 0 || resending}><Text style={[styles.link, countdown > 0 && styles.disabledText]}>{resending ? 'Sending...' : 'Resend'}</Text></TouchableOpacity></View></View>;
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: Colors.background, padding: Spacing[6], paddingTop: 64, alignItems: 'center', gap: Spacing[4] }, back: { alignSelf: 'flex-start', width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border }, icon: { width: 66, height: 66, borderRadius: 22, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center', marginTop: Spacing[8] }, title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['3xl'], color: Colors.textPrimary }, subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, lineHeight: 24, color: Colors.textSecondary, textAlign: 'center', maxWidth: 390 }, highlight: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textPrimary }, error: { fontFamily: Typography.fontFamily.sansRegular, color: Colors.error, fontSize: Typography.size.sm }, timer: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] }, timerText: { fontFamily: Typography.fontFamily.sansRegular, color: Colors.textTertiary, fontSize: Typography.size.sm }, button: { width: '100%', maxWidth: 390, minHeight: 56, borderRadius: Radius.lg, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.45 }, buttonText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.white, fontSize: Typography.size.md }, resend: { flexDirection: 'row', alignItems: 'center' }, muted: { fontFamily: Typography.fontFamily.sansRegular, color: Colors.textTertiary, fontSize: Typography.size.sm }, link: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.primary, fontSize: Typography.size.sm }, disabledText: { color: Colors.textDisabled } });
