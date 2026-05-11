import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleCheck as CheckCircle, Calendar, Flower } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { Subscription } from '@/types/database';
import Button from '@/components/ui/Button';
import { format } from 'date-fns';

export default function ConfirmationScreen() {
  const insets = useSafeAreaInsets();
  const { subscriptionId, isRenewal } = useLocalSearchParams<{ subscriptionId: string; isRenewal?: string }>();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const isRenewalFlow = isRenewal === '1' || !!subscription?.renewed_from_subscription_id;

  useEffect(() => {
    if (!subscriptionId) return;
    supabase
      .from('subscriptions')
      .select('*, plan:subscription_plans(*), delivery_address:addresses(*)')
      .eq('id', subscriptionId)
      .single()
      .then(({ data }) => { if (data) setSubscription(data as Subscription); });
  }, [subscriptionId]);

  return (
    <LinearGradient
      colors={[Colors.primaryDark, Colors.primary, Colors.primaryLight]}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing[8] }]}>
        <View style={styles.iconContainer}>
          <CheckCircle size={64} color={Colors.white} strokeWidth={1.5} />
        </View>

        <View style={styles.textBlock}>
          <Text style={styles.title}>
            {isRenewalFlow ? 'Subscription Renewed!' : "You're subscribed!"}
          </Text>
          <Text style={styles.subtitle}>
            {isRenewalFlow
              ? 'Your subscription has been successfully renewed.'
              : 'Welcome to the 33 Crores family.'}
          </Text>
        </View>

        {subscription && (
          <View style={styles.detailsCard}>
            <View style={styles.detailRow}>
              <Flower size={18} color={Colors.primary} />
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Plan</Text>
                <Text style={styles.detailValue}>{subscription.plan?.name}</Text>
              </View>
            </View>

            {!isRenewalFlow && (
              <>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <Calendar size={18} color={Colors.primary} />
                  <View style={styles.detailInfo}>
                    <Text style={styles.detailLabel}>First Delivery</Text>
                    <Text style={styles.detailValue}>
                      {subscription.next_delivery_date
                        ? format(new Date(subscription.next_delivery_date), 'EEEE, dd MMMM yyyy')
                        : 'Tomorrow'}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>
        )}

        <View style={styles.actions}>
          <Button
            label="View Receipt"
            onPress={() => router.push({
              pathname: '/(customer)/receipt',
              params: { type: 'new', subscriptionId },
            })}
            style={styles.primaryBtn}
            textStyle={styles.primaryBtnText}
            size="lg"
            fullWidth
          />
          <Button
            label="View My Subscription"
            onPress={() => router.replace('/(customer)/subscriptions')}
            variant="ghost"
            size="lg"
            fullWidth
            textStyle={{ color: Colors.white }}
          />
          <Button
            label="Go to Home"
            onPress={() => router.replace('/(customer)')}
            variant="ghost"
            size="lg"
            fullWidth
            textStyle={{ color: 'rgba(255,255,255,0.7)' }}
          />
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    alignItems: 'center',
    padding: Spacing[6],
    gap: Spacing[8],
  },
  iconContainer: {
    marginTop: Spacing[8],
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: { gap: Spacing[3], alignItems: 'center' },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['4xl'],
    color: Colors.white,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: Typography.size.base * 1.7,
  },
  detailsCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing[5],
    width: '100%',
    gap: Spacing[4],
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  detailInfo: { flex: 1, gap: 2 },
  detailLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  detailDivider: { height: 1, backgroundColor: Colors.divider },
  actions: { width: '100%', gap: Spacing[3] },
  primaryBtn: { backgroundColor: Colors.white },
  primaryBtnText: { color: Colors.primaryDark },
});
