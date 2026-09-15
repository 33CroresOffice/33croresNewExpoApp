import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, Clock3, ArrowRight } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';

export default function ProviderRegisterSuccessScreen() {
  const { mobile } = useLocalSearchParams<{ mobile?: string }>();
  return (
    <View style={styles.container}>
      <View style={styles.icon}><Check size={38} color={Colors.white} strokeWidth={2.4} /></View>
      <Text style={styles.eyebrow}>APPLICATION RECEIVED</Text>
      <Text style={styles.title}>Your expert profile is under review</Text>
      <Text style={styles.description}>Thank you for applying to join 33 Crores. Our team will review your details and documents. You can sign in once your application is approved.</Text>
      <View style={styles.card}><Clock3 size={20} color={Colors.primary} /><View style={styles.cardCopy}><Text style={styles.cardTitle}>What happens next?</Text><Text style={styles.cardText}>We will verify your application and activate your provider profile after approval.</Text>{mobile ? <Text style={styles.mobile}>Registered mobile: +91 {mobile}</Text> : null}</View></View>
      <TouchableOpacity style={styles.button} onPress={() => router.replace('/provider/login')} activeOpacity={0.85}><Text style={styles.buttonText}>Go to provider login</Text><ArrowRight size={18} color={Colors.white} /></TouchableOpacity>
      <TouchableOpacity onPress={() => router.replace('/auth/welcome')} style={styles.link}><Text style={styles.linkText}>Back to customer portal</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: Spacing[6], gap: Spacing[4] }, icon: { width: 76, height: 76, borderRadius: 38, backgroundColor: Colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing[2] }, eyebrow: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, letterSpacing: 1.4, color: Colors.success }, title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['4xl'], lineHeight: 44, color: Colors.textPrimary, textAlign: 'center', maxWidth: 500 }, description: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, lineHeight: 25, color: Colors.textSecondary, textAlign: 'center', maxWidth: 500 }, card: { width: '100%', maxWidth: 500, flexDirection: 'row', gap: Spacing[3], padding: Spacing[4], borderRadius: Radius.lg, backgroundColor: Colors.primarySurface }, cardCopy: { flex: 1, gap: Spacing[1] }, cardTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary }, cardText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, lineHeight: 21, color: Colors.textSecondary }, mobile: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.primary, marginTop: Spacing[2] }, button: { width: '100%', maxWidth: 500, minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2], backgroundColor: Colors.primary, borderRadius: Radius.lg }, buttonText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.md, color: Colors.white }, link: { padding: Spacing[2] }, linkText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textDecorationLine: 'underline' } });
