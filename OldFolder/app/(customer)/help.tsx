import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronDown, ChevronUp, Phone, Mail, MessageCircle } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';

const faqs = [
  {
    q: 'How does the subscription work?',
    a: 'Choose a plan (Starter, Plus, or Luxe), select your bouquet preference and delivery address, and complete payment. Fresh flowers will be delivered based on your plan frequency — daily, alternate days, or weekly.',
  },
  {
    q: 'Can I pause or cancel my subscription?',
    a: 'Yes! You can pause or cancel your subscription at any time from the Subscriptions section. Cancellations take effect from the next billing cycle and no refund is issued for the current period.',
  },
  {
    q: 'What if I receive wilted or damaged flowers?',
    a: 'We\'re so sorry! Please contact our support team within 24 hours of delivery with a photo. We\'ll arrange a replacement or issue a credit immediately.',
  },
  {
    q: 'Can I change my delivery address?',
    a: 'Yes, you can add or update delivery addresses from the Profile > Address section. Changes will apply from your next delivery.',
  },
  {
    q: 'What days do you deliver?',
    a: 'We deliver 7 days a week, including weekends and most public holidays. Your delivery schedule depends on your subscription plan.',
  },
  {
    q: 'Can I choose specific flowers?',
    a: 'You can select from our curated bouquet options when subscribing. Our florists create seasonal arrangements, so exact flowers may vary while maintaining the style you chose.',
  },
  {
    q: 'How do I update my payment method?',
    a: 'For a new subscription, simply go through checkout with the new payment method. For existing subscriptions, contact our support team and we\'ll guide you through the process.',
  },
  {
    q: 'Is there a minimum contract period?',
    a: 'No! All plans are monthly with no lock-in. You can cancel anytime before your next billing date.',
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <TouchableOpacity
      style={styles.faqItem}
      onPress={() => setOpen((v) => !v)}
      activeOpacity={0.8}
    >
      <View style={styles.faqQuestion}>
        <Text style={styles.faqQ}>{q}</Text>
        {open ? (
          <ChevronUp size={18} color={Colors.primary} />
        ) : (
          <ChevronDown size={18} color={Colors.neutral[400]} />
        )}
      </View>
      {open && <Text style={styles.faqA}>{a}</Text>}
    </TouchableOpacity>
  );
}

export default function HelpScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Help & Support</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.contactCard}>
          <Text style={styles.sectionTitle}>Contact Us</Text>
          <Text style={styles.contactDesc}>Our support team is available Mon – Sat, 9 AM to 6 PM.</Text>
          <View style={styles.contactActions}>
            <View style={styles.contactItem}>
              <View style={styles.contactIcon}>
                <Phone size={18} color={Colors.primary} />
              </View>
              <View>
                <Text style={styles.contactLabel}>Call Us</Text>
                <Text style={styles.contactValue}>+91-9776-88888-7</Text>
              </View>
            </View>
            <View style={[styles.contactItem, styles.contactBorder]}>
              <View style={styles.contactIcon}>
                <Mail size={18} color={Colors.accent} />
              </View>
              <View>
                <Text style={styles.contactLabel}>Email Us</Text>
                <Text style={styles.contactValue}>contact@33crores.com</Text>
              </View>
            </View>
            <View style={[styles.contactItem, styles.contactBorder]}>
              <View style={styles.contactIcon}>
                <MessageCircle size={18} color={Colors.success} />
              </View>
              <View>
                <Text style={styles.contactLabel}>WhatsApp</Text>
                <Text style={styles.contactValue}>+91-9776-88888-7</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.faqSection}>
          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
          <View style={styles.faqCard}>
            {faqs.map((item, i) => (
              <View key={item.q} style={i > 0 ? styles.faqBorder : undefined}>
                <FAQItem q={item.q} a={item.a} />
              </View>
            ))}
          </View>
        </View>
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
  content: { padding: Spacing[5], gap: Spacing[5], paddingBottom: 40 },
  sectionTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
    marginBottom: Spacing[3],
  },
  contactCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[5],
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  contactDesc: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing[4],
    lineHeight: 20,
  },
  contactActions: { gap: 0 },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingVertical: Spacing[3],
  },
  contactBorder: { borderTopWidth: 1, borderTopColor: Colors.divider },
  contactIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  contactValue: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  faqSection: { gap: 0 },
  faqCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  faqBorder: { borderTopWidth: 1, borderTopColor: Colors.divider },
  faqItem: { padding: Spacing[4] },
  faqQuestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[3],
  },
  faqQ: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    flex: 1,
    lineHeight: 20,
  },
  faqA: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginTop: Spacing[3],
  },
});
