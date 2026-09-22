import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, FileText } from 'lucide-react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

const terms = [
  'Incentives and bonuses will be calculated monthly.',
  'New Subscription Incentive: Riders can earn incentives by bringing new and successfully activated subscriptions.',
  'Only valid, confirmed and paid subscriptions will be considered.',
  'Cancelled, refunded, duplicate, fake, or invalid subscriptions will not be counted.',
  'Subscription incentives will be provided according to the target/milestone achieved during the month.',
  'On-Time Attendance: Riders can earn additional incentives for maintaining regular and timely attendance.',
  'On-Time Delivery: Riders can earn incentives for completing assigned deliveries within the scheduled delivery period.',
  'No-Leave Bonus: Riders may receive an additional bonus for maintaining full attendance during the month.',
  'Customer Feedback: Good customer ratings and positive feedback may qualify the rider for an additional incentive.',
  'Refer a New Rider: Riders can refer a new delivery rider to join 33 Crores and earn a referral incentive after the referred rider successfully joins and completes the required eligibility period.',
  'The referred rider must be a new rider who has not previously worked with or registered with 33 Crores.',
  'Attendance, deliveries, subscriptions, referrals, and customer feedback will be verified by Admin before incentive approval.',
  'Fake referrals, fraudulent orders, manipulated attendance, or incorrect delivery records may result in cancellation of the incentive.',
  'Incentives displayed in the Rider App are provisional until verified and approved by Admin.',
  'Incentive eligibility, targets, and rules may be updated by 33 Crores when required.',
];

export default function RiderTermsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing[3] }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.75}>
          <ArrowLeft size={20} color={Colors.white} strokeWidth={2} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <FileText size={18} color="#3AAFE4" strokeWidth={1.8} />
          <Text style={styles.headerTitle}>Terms & Conditions</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing[8] }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.introCard}>
          <Text style={styles.title}>Rider Incentive – Terms & Conditions</Text>
          <Text style={styles.subtitle}>Please review the rules that apply to rider incentives and bonuses.</Text>
        </View>

        <View style={styles.termsCard}>
          {terms.map((term, index) => (
            <View key={term} style={styles.termRow}>
              <Text style={styles.number}>{index + 1}</Text>
              <Text style={styles.termText}>{term}</Text>
            </View>
          ))}
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
    gap: Spacing[3],
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[4],
    backgroundColor: '#0F1E28',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  headerTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.lg,
    color: Colors.white,
  },
  content: { padding: Spacing[5], gap: Spacing[4] },
  introCard: {
    backgroundColor: Colors.primarySurface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
    padding: Spacing[5],
    gap: Spacing[2],
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    lineHeight: 26,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    lineHeight: 21,
    color: Colors.textSecondary,
  },
  termsCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing[5],
    gap: Spacing[4],
  },
  termRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3] },
  number: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    textAlign: 'center',
    paddingTop: 3,
    backgroundColor: Colors.primarySurface,
    color: Colors.primary,
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
  },
  termText: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    lineHeight: 24,
    color: Colors.textSecondary,
  },
});
