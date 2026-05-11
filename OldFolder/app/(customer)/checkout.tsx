import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, MapPin, Calendar, ChevronLeft, ChevronRight, RotateCcw, Clock } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { SubscriptionPlan, Address } from '@/types/database';
import Button from '@/components/ui/Button';
import { format, addDays, startOfDay } from 'date-fns';
import { getMinSubscriptionStartDate, isPastCutoffIST } from '@/utils/istCutoff';
import RazorpayWebView from '@/components/ui/RazorpayWebView';

let RazorpayCheckout: any = null;
if (Platform.OS !== 'web') {
  RazorpayCheckout = require('react-native-razorpay').default;
}

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const { planId, renewFromSubscriptionId } = useLocalSearchParams<{ planId: string; renewFromSubscriptionId?: string }>();
  const { profile, session } = useAuthStore();

  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string>('');
  const [startDate, setStartDate] = useState(() => getMinSubscriptionStartDate());
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [webViewUrl, setWebViewUrl] = useState<string | null>(null);

  const pastCutoff = isPastCutoffIST();
  const minDate = getMinSubscriptionStartDate();

  const loadAddresses = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('addresses').select('*').eq('user_id', profile.id);
    if (data) {
      setAddresses(data);
      setSelectedAddress((prev) => {
        if (prev && data.find((a) => a.id === prev)) return prev;
        const def = data.find((a) => a.is_default);
        return def?.id || data[0]?.id || '';
      });
    }
  }, [profile]);

  useEffect(() => {
    const load = async () => {
      if (!profile) return;
      const [planRes, addressRes] = await Promise.all([
        supabase.from('subscription_plans').select('*').eq('id', planId).single(),
        supabase.from('addresses').select('*').eq('user_id', profile.id),
      ]);
      if (planRes.data) setPlan(planRes.data);
      if (addressRes.data) {
        setAddresses(addressRes.data);
        const def = addressRes.data.find((a) => a.is_default);
        setSelectedAddress(def?.id || addressRes.data[0]?.id || '');
      }
      setLoading(false);
    };
    load();
  }, [profile, planId]);

  useFocusEffect(
    useCallback(() => {
      if (!loading) {
        loadAddresses();
      }
    }, [loading, loadAddresses])
  );

  const formatPrice = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

  const invokeFn = async (fnName: string, body: object) => {
    const { data, error } = await supabase.functions.invoke(fnName, { body });
    if (error) {
      console.error(`[invokeFn] ${fnName} error:`, error);
      const msg = (data as any)?.error ?? error.message ?? 'Request failed';
      return { data: data ?? {}, error: { message: msg } };
    }
    return { data, error: null };
  };

  const completePayment = async (orderId: string) => {
    const { data: verifyData, error: verifyError } = await invokeFn('verify-razorpay-payment', {
      razorpay_order_id: orderId,
      razorpay_payment_id: `pay_sim_${Date.now()}`,
      razorpay_signature: 'simulated',
      plan_id: planId,
      address_id: selectedAddress || null,
      renew_from_subscription_id: renewFromSubscriptionId ?? null,
    });
    if (verifyError) {
      setError(verifyData?.error || verifyError.message || 'Payment verification failed');
      setPaying(false);
      return;
    }
    if (verifyData?.success) {
      router.replace({
        pathname: '/(customer)/confirmation',
        params: { subscriptionId: verifyData.subscription_id, isRenewal: renewFromSubscriptionId ? '1' : '0' },
      });
    } else {
      setError(verifyData?.error || 'Payment failed. Please try again.');
      setPaying(false);
    }
  };

  const getCallbackUrl = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const base = window.location.origin;
      const params = new URLSearchParams({
        plan_id: planId as string,
        address_id: selectedAddress,
        ...(renewFromSubscriptionId ? { renew_from_subscription_id: renewFromSubscriptionId } : {}),
      });
      return `${base}/(customer)/payment-callback?${params.toString()}`;
    }
    const params = new URLSearchParams({
      plan_id: planId as string,
      address_id: selectedAddress,
      ...(renewFromSubscriptionId ? { renew_from_subscription_id: renewFromSubscriptionId } : {}),
    });
    return `https://rzp-callback.33crores.app/payment-callback?${params.toString()}`;
  };

  const handleWebViewCallback = async (params: Record<string, string>) => {
    setWebViewUrl(null);
    setPaying(true);

    try {
      const { data, error } = await supabase.functions.invoke('verify-razorpay-payment', {
        body: {
          razorpay_payment_id: params.razorpay_payment_id,
          razorpay_payment_link_id: params.razorpay_payment_link_id,
          razorpay_payment_link_reference_id: params.razorpay_payment_link_reference_id,
          razorpay_payment_link_status: params.razorpay_payment_link_status,
          razorpay_signature: params.razorpay_signature,
          plan_id: planId,
          address_id: selectedAddress || null,
          renew_from_subscription_id: renewFromSubscriptionId ?? null,
        },
      });

      if (error || !data?.success) {
        setError((data as any)?.error || error?.message || 'Payment verification failed. Please try again.');
        setPaying(false);
      } else {
        router.replace({
          pathname: '/(customer)/confirmation',
          params: { subscriptionId: data.subscription_id, isRenewal: renewFromSubscriptionId ? '1' : '0' },
        });
      }
    } catch (err) {
      setError('Something went wrong: ' + String(err));
      setPaying(false);
    }
  };

  const openRazorpayWeb = (orderData: any) => {
    return new Promise<{ razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }>((resolve, reject) => {
      const options = {
        key: orderData.key_id,
        amount: String(orderData.amount),
        currency: orderData.currency ?? 'INR',
        order_id: orderData.order_id,
        name: '33 Crores Flowers',
        description: plan!.name,
        prefill: {
          name: profile?.full_name ?? '',
          contact: profile?.mobile ?? '',
        },
        theme: { color: Colors.primary },
        handler: (response: any) => resolve(response),
        modal: {
          ondismiss: () => reject({ cancelled: true }),
        },
      };
      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (response: any) => reject(response.error));
      rzp.open();
    });
  };

  const handlePay = async () => {
    if (!selectedAddress) {
      setError('Please add a delivery address before proceeding');
      return;
    }
    setPaying(true);
    setError('');

    try {
      const { data: orderData, error: orderError } = await invokeFn('create-razorpay-order', {
        plan_id: planId,
        amount: plan!.price,
        plan_name: plan!.name,
      });

      if (orderError || !orderData?.success) {
        const msg = orderData?.error || orderError?.message || 'Failed to initiate payment';
        console.error('[handlePay] order error:', msg, orderData);
        setError(msg);
        setPaying(false);
        return;
      }

      if (orderData.test_mode) {
        await completePayment(orderData.order_id);
        return;
      }

      if (Platform.OS !== 'web' && RazorpayCheckout) {
        const options = {
          key: orderData.key_id,
          amount: String(orderData.amount),
          currency: orderData.currency ?? 'INR',
          order_id: orderData.order_id,
          name: '33 Crores Flowers',
          description: plan!.name,
          prefill: {
            name: profile?.full_name ?? '',
            contact: profile?.mobile ?? '',
          },
          theme: { color: Colors.primary },
        };

        try {
          const paymentData = await RazorpayCheckout.open(options);
          await completePaymentWithData({
            razorpay_payment_id: paymentData.razorpay_payment_id,
            razorpay_order_id: paymentData.razorpay_order_id,
            razorpay_signature: paymentData.razorpay_signature,
          });
        } catch (razorpayErr: any) {
          if (razorpayErr?.code === 0) {
            setError('Payment cancelled.');
          } else {
            setError(razorpayErr?.description || 'Payment failed. Please try again.');
          }
          setPaying(false);
        }
        return;
      }

      if (!(window as any).Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
          document.body.appendChild(script);
        });
      }

      try {
        const paymentData = await openRazorpayWeb(orderData);
        await completePaymentWithData({
          razorpay_payment_id: paymentData.razorpay_payment_id,
          razorpay_order_id: paymentData.razorpay_order_id,
          razorpay_signature: paymentData.razorpay_signature,
        });
      } catch (rzpErr: any) {
        if (rzpErr?.cancelled) {
          setError('Payment cancelled.');
        } else {
          setError(rzpErr?.description || 'Payment failed. Please try again.');
        }
        setPaying(false);
      }
    } catch (err) {
      console.error('handlePay caught error:', err);
      setError('Something went wrong: ' + String(err));
      setPaying(false);
    }
  };

  const completePaymentWithData = async (paymentData: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => {
    const { data: verifyData, error: verifyError } = await invokeFn('verify-razorpay-payment', {
      razorpay_payment_id: paymentData.razorpay_payment_id,
      razorpay_order_id: paymentData.razorpay_order_id,
      razorpay_signature: paymentData.razorpay_signature,
      plan_id: planId,
      address_id: selectedAddress || null,
      renew_from_subscription_id: renewFromSubscriptionId ?? null,
    });
    if (verifyError) {
      setError(verifyData?.error || verifyError.message || 'Payment verification failed');
      setPaying(false);
      return;
    }
    if (verifyData?.success) {
      router.replace({
        pathname: '/(customer)/confirmation',
        params: { subscriptionId: verifyData.subscription_id, isRenewal: renewFromSubscriptionId ? '1' : '0' },
      });
    } else {
      setError(verifyData?.error || 'Payment failed. Please try again.');
      setPaying(false);
    }
  };

  const shiftDate = (days: number) => {
    const next = startOfDay(addDays(startDate, days));
    if (next >= minDate) setStartDate(next);
  };

  if (loading || !plan) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading checkout...</Text>
        </View>
      </View>
    );
  }

  const isPrevDisabled = startDate <= minDate;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Checkout</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {renewFromSubscriptionId && (
          <View style={styles.renewalNotice}>
            <RotateCcw size={15} color={Colors.primaryDark} />
            <Text style={styles.renewalNoticeText}>Renewing your existing subscription</Text>
          </View>
        )}

        {/* Plan Summary */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Plan</Text>
          <View style={styles.planRow}>
            <View style={styles.planInfo}>
              <Text style={styles.planName}>{plan.name}</Text>
              <Text style={styles.planFreq}>{plan.frequency} delivery</Text>
            </View>
            <Text style={styles.planPrice}>{formatPrice(plan.price)}/mo</Text>
          </View>
        </View>

        {/* Delivery Address */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MapPin size={16} color={Colors.primary} />
            <Text style={styles.cardLabel}>Delivery Address</Text>
          </View>
          {addresses.length === 0 ? (
            <TouchableOpacity
              style={styles.addAddressBtn}
              onPress={() => router.push({ pathname: '/(customer)/address-form', params: { returnTo: 'checkout', planId } })}
            >
              <Text style={styles.addAddressBtnText}>+ Add delivery address</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.addressList}>
              {addresses.map((addr) => (
                <TouchableOpacity
                  key={addr.id}
                  style={[styles.addressOption, selectedAddress === addr.id && styles.addressSelected]}
                  onPress={() => setSelectedAddress(addr.id)}
                >
                  <View style={[styles.radio, selectedAddress === addr.id && styles.radioSelected]}>
                    {selectedAddress === addr.id && <View style={styles.radioDot} />}
                  </View>
                  <View style={styles.addressInfo}>
                    <Text style={styles.addressLabel}>{addr.label}</Text>
                    <Text style={styles.addressText}>{addr.street}, {addr.city}, {addr.state} - {addr.pincode}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/(customer)/address-form', params: { returnTo: 'checkout', planId } })}
              >
                <Text style={styles.addAnotherText}>+ Add another address</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* First Delivery Date Picker — hidden for renewals */}
        {!renewFromSubscriptionId && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Calendar size={16} color={Colors.primary} />
              <Text style={styles.cardLabel}>First Delivery Date</Text>
            </View>

            {pastCutoff && (
              <View style={styles.cutoffBanner}>
                <Clock size={14} color={Colors.warning} />
                <Text style={styles.cutoffText}>
                  Subscriptions placed after 5 PM start from the day after tomorrow. Earliest start: {format(minDate, 'dd MMM yyyy')}.
                </Text>
              </View>
            )}

            <View style={styles.datePicker}>
              <TouchableOpacity
                style={[styles.dateArrow, isPrevDisabled && styles.dateArrowDisabled]}
                onPress={() => shiftDate(-1)}
                disabled={isPrevDisabled}
              >
                <ChevronLeft size={20} color={isPrevDisabled ? Colors.textTertiary : Colors.primary} />
              </TouchableOpacity>
              <View style={styles.dateDisplay}>
                <Text style={styles.dateDay}>{format(startDate, 'EEEE')}</Text>
                <Text style={styles.dateValue}>{format(startDate, 'dd MMMM yyyy')}</Text>
                {format(startDate, 'yyyy-MM-dd') === format(minDate, 'yyyy-MM-dd') && (
                  <Text style={styles.earliestLabel}>earliest</Text>
                )}
              </View>
              <TouchableOpacity style={styles.dateArrow} onPress={() => shiftDate(1)}>
                <ChevronRight size={20} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Order Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Order Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryKey}>{plan.name}</Text>
            <Text style={styles.summaryValue}>{formatPrice(plan.price)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryKey}>Delivery</Text>
            <Text style={[styles.summaryValue, { color: Colors.success }]}>FREE</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryTotal}>Total</Text>
            <Text style={styles.summaryTotalAmount}>{formatPrice(plan.price)}</Text>
          </View>
          <Text style={styles.billingNote}>Billed monthly. Cancel anytime.</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing[4] }]}>
        <Button
          label={paying ? 'Processing...' : `Pay ${formatPrice(plan.price)}`}
          onPress={handlePay}
          size="lg"
          fullWidth
          loading={paying}
        />
      </View>

      {webViewUrl && Platform.OS !== 'web' && (
        <RazorpayWebView
          paymentUrl={webViewUrl}
          callbackUrlPrefix="https://rzp-callback.33crores.app/payment-callback"
          onSuccess={handleWebViewCallback}
          onCancel={() => { setWebViewUrl(null); setPaying(false); }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textTertiary,
  },
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
  content: { padding: Spacing[5], gap: Spacing[4], paddingBottom: 100 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing[3],
    ...Shadow.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  cardLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  planRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planInfo: { gap: 2 },
  planName: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  planFreq: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    textTransform: 'capitalize',
  },
  planPrice: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.lg,
    color: Colors.primary,
  },
  addAddressBtn: {
    padding: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addAddressBtnText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.primary,
  },
  addressList: { gap: Spacing[3] },
  addressOption: {
    flexDirection: 'row',
    gap: Spacing[3],
    padding: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addressSelected: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioSelected: { borderColor: Colors.primary },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.primary },
  addressInfo: { flex: 1, gap: 2 },
  addressLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  addressText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    lineHeight: 16,
  },
  addAnotherText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.primary,
  },
  datePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[2],
  },
  dateArrow: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
  },
  dateArrowDisabled: { opacity: 0.4 },
  dateDisplay: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  dateDay: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateValue: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.primary,
  },
  cutoffBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    backgroundColor: Colors.warningSurface,
    borderRadius: Radius.md,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.warningLight,
  },
  cutoffText: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.warning,
    lineHeight: 18,
  },
  earliestLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 10,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  summaryCard: {
    backgroundColor: Colors.primarySurface,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[3],
  },
  summaryTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.primaryDark,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryKey: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  summaryDivider: { height: 1, backgroundColor: Colors.primaryLight, opacity: 0.3 },
  summaryTotal: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.primaryDark,
  },
  summaryTotalAmount: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.lg,
    color: Colors.primaryDark,
  },
  billingNote: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.primaryDark,
    opacity: 0.7,
    textAlign: 'center',
  },
  renewalNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.primarySurface,
    borderRadius: Radius.md,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.primaryLight,
  },
  renewalNoticeText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.primaryDark,
  },
  error: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.error,
    textAlign: 'center',
  },
  footer: {
    padding: Spacing[5],
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    ...Shadow.lg,
  },
});
