import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';

export default function ProviderBookingPaymentScreen() {
  const { id, stage } = useLocalSearchParams<{ id: string; stage: 'advance' | 'remaining' }>();
  const { profile } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (Platform.OS !== 'web' || !id || !stage) {
      setError('This payment link is incomplete.');
      setLoading(false);
      return;
    }
    let active = true;
    const startCheckout = async () => {
      const { data: orderData, error: orderError } = await supabase.functions.invoke('create-provider-booking-payment', { body: { booking_id: id, payment_stage: stage } });
      if (!active) return;
      if (orderError || !orderData?.success) { setError(orderData?.error ?? orderError?.message ?? 'Could not start payment.'); setLoading(false); return; }
      if (orderData.test_mode) {
        const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-provider-booking-payment', { body: { booking_id: id, payment_stage: stage, razorpay_payment_id: `pay_sim_${Date.now()}`, razorpay_order_id: orderData.order_id, razorpay_signature: 'simulated' } });
        if (!verifyError && verifyData?.success) router.replace({ pathname: '/(customer)/service-order-details', params: { id } });
        else { setError(verifyData?.error ?? verifyError?.message ?? 'Payment verification failed.'); setLoading(false); }
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => {
        if (!active) return;
        const Razorpay = (window as any).Razorpay;
        if (!Razorpay) { setError('Razorpay checkout could not load.'); setLoading(false); return; }
        const checkout = new Razorpay({
        key: orderData.key_id,
        amount: String(orderData.amount),
        currency: orderData.currency || 'INR',
        order_id: orderData.order_id,
        name: '33 Crores Flowers',
        description: stage === 'advance' ? '30% advance for pooja booking' : 'Remaining balance for pooja booking',
        prefill: { name: profile?.full_name ?? '', contact: profile?.mobile ?? '' },
        theme: { color: Colors.primary },
        handler: async (payment: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          setLoading(true);
          const { data, error: verifyError } = await supabase.functions.invoke('verify-provider-booking-payment', { body: { booking_id: id, payment_stage: stage, ...payment } });
          if (!active) return;
          if (verifyError || !data?.success) { setError(data?.error ?? verifyError?.message ?? 'Payment verification failed.'); setLoading(false); return; }
          router.replace({ pathname: '/(customer)/service-order-details', params: { id } });
        },
        modal: { ondismiss: () => { if (active) { setError('Payment cancelled.'); setLoading(false); } } },
      });
      checkout.on('payment.failed', (response: any) => { if (active) { setError(response?.error?.description ?? 'Payment failed. Please try again.'); setLoading(false); } });
        setLoading(false);
        checkout.open();
      };
      script.onerror = () => { if (active) { setError('Razorpay checkout could not load.'); setLoading(false); } };
      document.head.appendChild(script);
    };
    startCheckout();
    return () => { active = false; };
  }, [id, profile?.full_name, profile?.mobile, stage]);

  return <View style={styles.container}>
    {loading ? <><ActivityIndicator size="large" color={Colors.primary} /><Text style={styles.message}>Opening secure payment...</Text></> : null}
    {error ? <><Text style={styles.error}>{error}</Text><Button label="Return to booking" onPress={() => router.replace({ pathname: '/(customer)/service-order-details', params: { id } })} /></> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: Spacing[6], gap: Spacing[3] },
  message: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  error: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.base, color: Colors.error, textAlign: 'center', marginBottom: Spacing[2] },
});
