import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';

const sections = [
  {
    title: '1. Acceptance of Terms',
    body: 'By accessing or using the 33 Crores app and services, you agree to be bound by these Terms & Conditions. If you do not agree to all the terms, please do not use our services.',
  },
  {
    title: '2. Subscription Plans',
    body: '33 Crores offers monthly flower subscription plans. By subscribing, you authorise us to charge your selected payment method on a recurring monthly basis. You may cancel your subscription at any time before the next billing cycle.',
  },
  {
    title: '3. Deliveries',
    body: 'We deliver to the address specified at checkout. Delivery schedules depend on your chosen plan (daily, alternate days, or weekly). 33 Crores is not responsible for delays caused by events beyond our control, including natural disasters, strikes, or incorrect address information provided by the customer.',
  },
  {
    title: '4. Product Quality',
    body: 'We take great care to deliver fresh, high-quality blooms. If you receive damaged or wilted flowers, please contact our support team within 24 hours of delivery with photos, and we will arrange a replacement or refund at our discretion.',
  },
  {
    title: '5. Cancellation & Refunds',
    body: 'You may cancel your subscription at any time. Cancellations take effect from the next billing cycle; no refunds are issued for the current billing period unless a quality issue is confirmed by our team. Refunds, where applicable, are processed within 5–7 business days.',
  },
  {
    title: '6. User Accounts',
    body: 'You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. Please notify us immediately of any unauthorised use of your account.',
  },
  {
    title: '7. Intellectual Property',
    body: 'All content, trademarks, logos, and intellectual property on the 33 Crores platform are the property of 33 Crores and may not be used without prior written permission.',
  },
  {
    title: '8. Limitation of Liability',
    body: 'To the maximum extent permitted by law, 33 Crores shall not be liable for any indirect, incidental, or consequential damages arising from the use of our services.',
  },
  {
    title: '9. Changes to Terms',
    body: 'We reserve the right to update these Terms & Conditions at any time. Continued use of the app after changes are posted constitutes your acceptance of the revised terms.',
  },
  {
    title: '10. Contact Us',
    body: 'For questions about these terms, please contact us at contact@33crores.com or call +91-9776-88888-7.',
  },
];

export default function TermsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Terms & Conditions</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.metaCard}>
          <Text style={styles.metaText}>Last updated: 1 April 2026</Text>
          <Text style={styles.metaDesc}>
            Please read these terms carefully before using 33 Crores services.
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
