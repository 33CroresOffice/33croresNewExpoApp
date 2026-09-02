import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleCheck, Bike } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';

export default function RegisterSuccessScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + Spacing[6] }]}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <CircleCheck size={64} color={Colors.success} strokeWidth={1.5} />
        </View>
        <Text style={styles.title}>Registration Submitted!</Text>
        <Text style={styles.subtitle}>
          Your rider profile has been submitted for review. You will be able to log in once the admin approves your application.
        </Text>

        <View style={styles.stepsCard}>
          {[
            { n: '1', text: 'Your profile is under review by the admin team' },
            { n: '2', text: 'Once approved, log in with your mobile number and OTP' },
            { n: '3', text: 'Start receiving delivery assignments' },
          ].map((item) => (
            <View key={item.n} style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{item.n}</Text>
              </View>
              <Text style={styles.stepText}>{item.text}</Text>
            </View>
          ))}
        </View>
      </View>

      <TouchableOpacity style={styles.btn} onPress={() => router.replace('/rider/login')} activeOpacity={0.85}>
        <Bike size={18} color={Colors.white} strokeWidth={1.8} />
        <Text style={styles.btnText}>Go to Sign In</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: Spacing[6] },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing[5] },
  iconWrap: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: Colors.successSurface,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['3xl'], color: Colors.textPrimary,
    letterSpacing: -0.4, textAlign: 'center',
  },
  subtitle: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base, color: Colors.textSecondary,
    lineHeight: Typography.size.base * 1.6, textAlign: 'center', maxWidth: 340,
  },
  stepsCard: {
    width: '100%', backgroundColor: Colors.white,
    borderRadius: Radius.lg, padding: Spacing[5], gap: Spacing[4],
    borderWidth: 1, borderColor: Colors.border,
  },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3] },
  stepNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepNumText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 13, color: Colors.primary,
  },
  stepText: {
    flex: 1, fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm, color: Colors.textSecondary,
    lineHeight: Typography.size.sm * 1.6,
  },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2],
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    paddingVertical: Spacing[4], minHeight: 56,
  },
  btnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.md, color: Colors.white, letterSpacing: 0.2,
  },
});
