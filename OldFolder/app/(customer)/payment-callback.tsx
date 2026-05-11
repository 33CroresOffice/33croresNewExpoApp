import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleCheck as CheckCircle, Circle as XCircle } from 'lucide-react-native';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import Button from '@/components/ui/Button';

export default function PaymentCallbackScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    razorpay_payment_id?: string;
    razorpay_payment_link_id?: string;
    razorpay_payment_link_reference_id?: string;
    razorpay_payment_link_status?: string;
    razorpay_signature?: string;
    plan_id?: string;
    address_id?: string;
    renew_from_subscription_id?: string;
  }>();

  const { session } = useAuthStore();
  const [status, setStatus] = useState<'verifying' | 'success' | 'failed'>('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  const [subscriptionId, setSubscriptionId] = useState('');

  useEffect(() => {
    verifyPayment();
  }, []);

  const getToken = async (): Promise<string | null> => {
    const { data: { session: fresh } } = await supabase.auth.getSession();
    return fresh?.access_token ?? session?.access_token ?? null;
  };

  const verifyPayment = async () => {
    try {
      const {
        razorpay_payment_id,
        razorpay_payment_link_id,
        razorpay_payment_link_reference_id,
        razorpay_payment_link_status,
        razorpay_signature,
        plan_id,
        address_id,
        renew_from_subscription_id,
      } = params;

      if (!razorpay_payment_id || !razorpay_signature) {
        setErrorMsg('Missing payment details. Please contact support.');
        setStatus('failed');
        return;
      }

      const token = await getToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-razorpay-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          razorpay_payment_id,
          razorpay_payment_link_id,
          razorpay_payment_link_reference_id,
          razorpay_payment_link_status,
          razorpay_signature,
          plan_id,
          address_id,
          renew_from_subscription_id: renew_from_subscription_id ?? null,
        }),
      });

      const data = await res.json();

      if (data?.success) {
        setSubscriptionId(data.subscription_id);
        setStatus('success');
      } else {
        setErrorMsg(data?.error || 'Payment verification failed. Please contact support.');
        setStatus('failed');
      }
    } catch (err) {
      setErrorMsg('Something went wrong: ' + String(err));
      setStatus('failed');
    }
  };

  const goToConfirmation = () => {
    router.replace({
      pathname: '/(customer)/confirmation',
      params: {
        subscriptionId,
        isRenewal: params.renew_from_subscription_id ? '1' : '0',
      },
    });
  };

  if (status === 'verifying') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.verifyingText}>Verifying your payment...</Text>
        <Text style={styles.verifyingSubtext}>Please wait, do not close this window.</Text>
      </View>
    );
  }

  if (status === 'success') {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + Spacing[4] }]}>
        <CheckCircle size={72} color={Colors.success} strokeWidth={1.5} />
        <Text style={styles.successTitle}>Payment Successful!</Text>
        <Text style={styles.successSubtext}>Your subscription is now active.</Text>
        <View style={styles.btnContainer}>
          <Button label="View Confirmation" onPress={goToConfirmation} size="lg" fullWidth />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + Spacing[4] }]}>
      <XCircle size={72} color={Colors.error} strokeWidth={1.5} />
      <Text style={styles.failedTitle}>Payment Failed</Text>
      <Text style={styles.failedSubtext}>{errorMsg}</Text>
      <View style={styles.btnContainer}>
        <Button label="Go Back" onPress={() => router.replace('/(customer)/plans')} size="lg" fullWidth variant="outline" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[6],
    gap: Spacing[4],
  },
  verifyingText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  verifyingSubtext: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  successTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'],
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  successSubtext: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  failedTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'],
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  failedSubtext: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.error,
    textAlign: 'center',
    lineHeight: 20,
  },
  btnContainer: {
    width: '100%',
    marginTop: Spacing[4],
  },
});
