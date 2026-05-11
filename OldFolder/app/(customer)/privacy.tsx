import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';

const sections = [
  {
    title: '1. Information We Collect',
    body: 'We collect personal information you provide when creating an account, including your name, mobile number, and delivery address. We also collect usage data and payment transaction details (we do not store full card numbers).',
  },
  {
    title: '2. How We Use Your Information',
    body: 'Your information is used to process orders, manage your subscription, send delivery notifications via SMS or WhatsApp, and improve our services. We will never sell your data to third parties.',
  },
  {
    title: '3. SMS & WhatsApp Notifications',
    body: 'By registering, you consent to receive transactional messages related to your orders and subscriptions. You can manage these preferences at any time from the Profile > Notifications section of the app.',
  },
  {
    title: '4. Data Sharing',
    body: 'We share your delivery address and contact details with our logistics partners solely for the purpose of fulfilling your deliveries. These partners are bound by confidentiality agreements and may not use your data for any other purpose.',
  },
  {
    title: '5. Payment Security',
    body: 'All payments are processed securely through Razorpay, a PCI-DSS compliant payment gateway. 33 Crores does not store your full payment card details on our servers.',
  },
  {
    title: '6. Data Retention',
    body: 'We retain your personal data for as long as your account is active. You may request deletion of your account and associated data by contacting our support team. Some data may be retained for legal or accounting purposes.',
  },
  {
    title: '7. Cookies & Analytics',
    body: 'The app may collect anonymised usage analytics to help us understand how customers use our service and improve the experience. This data is aggregated and cannot be used to identify individual users.',
  },
  {
    title: '8. Your Rights',
    body: 'You have the right to access, correct, or delete your personal data at any time. To exercise these rights, please contact us at contact@33crores.com. We will respond to all requests within 30 days.',
  },
  {
    title: '9. Security',
    body: 'We implement industry-standard security measures including encryption in transit (HTTPS/TLS) and at rest to protect your personal information. However, no method of transmission over the internet is 100% secure.',
  },
  {
    title: '10. Changes to This Policy',
    body: 'We may update this Privacy Policy from time to time. We will notify you of significant changes through the app or via SMS. Continued use of our services constitutes acceptance of the updated policy.',
  },
  {
    title: '11. Contact Us',
    body: 'For any privacy-related questions or concerns, please reach out to us at contact@33crores.com or call +91-9776-88888-7.',
  },
];

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Privacy Policy</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.metaCard}>
          <Text style={styles.metaText}>Last updated: 1 April 2026</Text>
          <Text style={styles.metaDesc}>
            Your privacy matters to us. This policy explains how 33 Crores collects, uses, and protects your personal information.
          </Text>
        </View>

        {sections.map((s) => (
          <View key={s.title} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
            <Text style={styles.sectionBody}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>
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
  content: { padding: Spacing[5], gap: Spacing[4], paddingBottom: 40 },
  metaCard: {
    backgroundColor: Colors.primarySurface,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[2],
  },
  metaText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.primary,
  },
  metaDesc: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  sectionCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[5],
    gap: Spacing[2],
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  sectionTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  sectionBody: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
});
