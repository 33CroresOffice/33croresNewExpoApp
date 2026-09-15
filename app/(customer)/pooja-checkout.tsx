import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CalendarDays, Clock3, MapPin, Flame, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { addDays, format, startOfDay } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Address, SubscriptionPlan } from '@/types/database';
import Button from '@/components/ui/Button';

let RazorpayCheckout: any = null;
if (Platform.OS !== 'web') RazorpayCheckout = require('react-native-razorpay').default;

const TIME_SLOTS = ['6:00 AM – 9:00 AM', '9:00 AM – 12:00 PM', '4:00 PM – 7:00 PM'];

export default function PoojaCheckoutScreen() {
  const insets = useSafeAreaInsets();
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const { profile } = useAuthStore();
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(() => startOfDay(addDays(new Date(), 1)));
  const [deliveryTime, setDeliveryTime] = useState(TIME_SLOTS[0]);
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!profile || !planId) return;
      const [planRes, addressRes] = await Promise.all([
        supabase.from('subscription_plans').select('*, pooja_items:plan_pooja_items(*, pooja_item:pooja_items(*))').eq('id', planId).single(),
        supabase.from('addresses').select('*').eq('user_id', profile.id),
      ]);
      if (planRes.data) setPlan(planRes.data as SubscriptionPlan);
      if (addressRes.data) {
        setAddresses(addressRes.data as Address[]);
        const preferred = addressRes.data.find((address: Address) => address.is_default) ?? addressRes.data[0];
        setSelectedAddress(preferred?.id ?? '');
      }
      setLoading(false);
    };
    load();
  }, [planId, profile]);

  const invoke = async (name: string, body: object) => {
    const { data, error: invokeError } = await supabase.functions.invoke(name, { body });
    if (invokeError) return { data: data ?? {}, error: invokeError.message };
    return { data: data ?? {}, error: null };
  };

  const verifyPayment = async (payment: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }, orderId: string) => {
    const result = await invoke('verify-pooja-order-payment', {
      pooja_order_id: orderId,
      razorpay_payment_id: payment.razorpay_payment_id,
      razorpay_order_id: payment.razorpay_order_id,
      razorpay_signature: payment.razorpay_signature,
    });
    if (result.error || !result.data.success) {
      setError(result.data.error ?? result.error ?? 'Payment verification failed.');
      setPaying(false);
      return;
    }
    router.replace({ pathname: '/(customer)/confirmation', params: { poojaOrderId: result.data.pooja_order_id } });
  };

  const openWebPayment = (orderData: any) => new Promise<any>((resolve, reject) => {
    const options = {
      key: orderData.key_id,
      amount: String(orderData.amount),
      currency: orderData.currency ?? 'INR',
      order_id: orderData.order_id,
      name: '33 Crores Flowers',
      description: plan?.name ?? 'Pooja Package',
      prefill: { name: profile?.full_name ?? '', contact: profile?.mobile ?? '' },
      theme: { color: Colors.primary },
      handler: resolve,
      modal: { ondismiss: () => reject({ cancelled: true }) },
    };
    const checkout = new (window as any).Razorpay(options);
    checkout.on('payment.failed', (response: any) => reject(response.error));
    checkout.open();
  });

  const handlePay = async () => {
    if (!plan || !selectedAddress) { setError('Please add a delivery address before proceeding.'); return; }
    setPaying(true); setError('');
    const result = await invoke('create-pooja-order-payment', {
      plan_id: plan.id,
      address_id: selectedAddress,
      delivery_date: format(deliveryDate, 'yyyy-MM-dd'),
      delivery_time: deliveryTime,
      special_instructions: instructions.trim() || null,
    });
    if (result.error || !result.data.success) { setError(result.data.error ?? result.error ?? 'Could not start payment.'); setPaying(false); return; }
    if (result.data.test_mode) {
      await verifyPayment({ razorpay_payment_id: `pay_sim_${Date.now()}`, razorpay_order_id: result.data.order_id, razorpay_signature: 'simulated' }, result.data.pooja_order_id);
      return;
    }
    try {
      let payment: any;
      if (Platform.OS !== 'web' && RazorpayCheckout) {
        payment = await RazorpayCheckout.open({ key: result.data.key_id, amount: String(result.data.amount), currency: result.data.currency ?? 'INR', order_id: result.data.order_id, name: '33 Crores Flowers', description: plan.name, prefill: { name: profile?.full_name ?? '', contact: profile?.mobile ?? '' }, theme: { color: Colors.primary } });
      } else {
        if (!(window as any).Razorpay) await new Promise<void>((resolve, reject) => { const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.onload = () => resolve(); script.onerror = () => reject(new Error('Payment service unavailable')); document.body.appendChild(script); });
        payment = await openWebPayment(result.data);
      }
      await verifyPayment(payment, result.data.pooja_order_id);
    } catch (paymentError: any) {
      setError(paymentError?.cancelled || paymentError?.code === 0 ? 'Payment cancelled.' : paymentError?.description ?? 'Payment failed. Please try again.');
      setPaying(false);
    }
  };

  const moveDate = (days: number) => {
    const next = startOfDay(addDays(deliveryDate, days));
    if (next >= startOfDay(addDays(new Date(), 1))) setDeliveryDate(next);
  };

  if (loading || !plan) return <View style={[styles.container, { paddingTop: insets.top }]}><Text style={styles.loading}>Loading checkout...</Text></View>;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}> 
      <View style={styles.header}><TouchableOpacity onPress={() => router.back()} style={styles.back}><ArrowLeft size={22} color={Colors.textPrimary} /></TouchableOpacity><Text style={styles.title}>Checkout</Text><View style={{ width: 36 }} /></View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}><View style={styles.introIcon}><Flame size={20} color={Colors.accent} /></View><View style={{ flex: 1 }}><Text style={styles.packageName}>{plan.name}</Text><Text style={styles.packageSub}>One-time delivery</Text></View><Text style={styles.price}>₹{(plan.price / 100).toLocaleString('en-IN')}</Text></View>
        <View style={styles.packageDetails}><Text style={styles.packageDetailsTitle}>Package details</Text><Text style={styles.packageDescription}>{plan.description}</Text>{(plan.pooja_items ?? []).length > 0 ? <View style={styles.packageItems}>{(plan.pooja_items ?? []).map((item) => <View key={item.pooja_item_id} style={styles.packageItem}><Flame size={14} color={Colors.accent} /><Text style={styles.packageItemText}>{item.pooja_item?.name} · {item.quantity_per_delivery} {item.unit_type}</Text></View>)}</View> : null}</View>
        <View style={styles.card}><View style={styles.cardHeader}><MapPin size={17} color={Colors.primary} /><Text style={styles.cardTitle}>Delivery address</Text></View>{addresses.length === 0 ? <TouchableOpacity style={styles.addAddress} onPress={() => router.push({ pathname: '/(customer)/address-form', params: { returnTo: 'pooja-checkout', planId } })}><Text style={styles.addAddressText}>+ Add delivery address</Text></TouchableOpacity> : <View style={styles.addresses}>{addresses.map(address => <TouchableOpacity key={address.id} style={[styles.address, selectedAddress === address.id && styles.addressSelected]} onPress={() => setSelectedAddress(address.id)}><View style={[styles.radio, selectedAddress === address.id && styles.radioSelected]} /> <View style={{ flex: 1 }}><Text style={styles.addressLabel}>{address.label}</Text><Text style={styles.addressText}>{address.street}, {address.city}, {address.state} - {address.pincode}</Text></View></TouchableOpacity>)}<TouchableOpacity onPress={() => router.push({ pathname: '/(customer)/address-form', params: { returnTo: 'pooja-checkout', planId } })}><Text style={styles.addAnother}>+ Add another address</Text></TouchableOpacity></View>}</View>
        <View style={styles.card}><View style={styles.cardHeader}><CalendarDays size={17} color={Colors.primary} /><Text style={styles.cardTitle}>Choose delivery date</Text></View><View style={styles.datePicker}><TouchableOpacity onPress={() => moveDate(-1)}><ChevronLeft size={21} color={Colors.primary} /></TouchableOpacity><View style={styles.dateCenter}><Text style={styles.dateDay}>{format(deliveryDate, 'EEEE')}</Text><Text style={styles.dateValue}>{format(deliveryDate, 'dd MMMM yyyy')}</Text></View><TouchableOpacity onPress={() => moveDate(1)}><ChevronRight size={21} color={Colors.primary} /></TouchableOpacity></View></View>
        <View style={styles.card}><View style={styles.cardHeader}><Clock3 size={17} color={Colors.primary} /><Text style={styles.cardTitle}>Preferred time</Text></View><View style={styles.slotList}>{TIME_SLOTS.map(slot => <TouchableOpacity key={slot} style={[styles.slot, deliveryTime === slot && styles.slotSelected]} onPress={() => setDeliveryTime(slot)}><Text style={[styles.slotText, deliveryTime === slot && styles.slotTextSelected]}>{slot}</Text></TouchableOpacity>)}</View></View>
        <View style={styles.card}><Text style={styles.cardTitle}>Delivery notes <Text style={styles.optional}>(optional)</Text></Text><Text style={styles.hint}>You can share any delivery notes after placing the order.</Text></View>
        <View style={styles.summary}><Text style={styles.summaryTitle}>Order summary</Text><Text style={styles.oneTimeNote}>One-time delivery · No subscription or recurring billing</Text><View style={styles.summaryRow}><Text style={styles.summaryKey}>{plan.name}</Text><Text style={styles.summaryValue}>₹{(plan.price / 100).toLocaleString('en-IN')}</Text></View><View style={styles.summaryRow}><Text style={styles.summaryKey}>Delivery</Text><Text style={styles.free}>FREE</Text></View><View style={styles.divider} /><View style={styles.summaryRow}><Text style={styles.total}>Total</Text><Text style={styles.total}>₹{(plan.price / 100).toLocaleString('en-IN')}</Text></View></View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing[4] }]}><Button fullWidth label={paying ? 'Processing...' : `Pay ₹${(plan.price / 100).toLocaleString('en-IN')}`} onPress={handlePay} loading={paying} size="lg" /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background }, loading: { flex: 1, textAlign: 'center', paddingTop: 100, color: Colors.textTertiary, fontFamily: Typography.fontFamily.sansRegular },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border }, back: { padding: 6 }, title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary }, content: { padding: Spacing[5], gap: Spacing[4], paddingBottom: 110 },
  intro: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], backgroundColor: '#FFF8ED', borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: '#F3DFC0' }, introIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FCEED8', alignItems: 'center', justifyContent: 'center' }, packageName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary }, packageSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 }, price: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.accent }, packageDetails: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], gap: Spacing[3], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm }, packageDetailsTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary }, packageDescription: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, lineHeight: 21, color: Colors.textSecondary }, packageItems: { gap: Spacing[2], borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: Spacing[3] }, packageItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] }, packageItemText: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], gap: Spacing[3], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm }, cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] }, cardTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary }, optional: { fontFamily: Typography.fontFamily.sansRegular, color: Colors.textTertiary, fontSize: Typography.size.xs }, addresses: { gap: Spacing[3] }, address: { flexDirection: 'row', gap: Spacing[3], padding: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border }, addressSelected: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface }, radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.border, marginTop: 1 }, radioSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary }, addressLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary }, addressText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 }, addAddress: { padding: Spacing[3], borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.primary, borderStyle: 'dashed', alignItems: 'center' }, addAddressText: { color: Colors.primary, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm }, addAnother: { color: Colors.primary, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm },
  datePicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.neutral[50], borderRadius: Radius.md, padding: Spacing[3] }, dateCenter: { alignItems: 'center', gap: 2 }, dateDay: { fontFamily: Typography.fontFamily.sansMedium, color: Colors.textSecondary, fontSize: Typography.size.sm }, dateValue: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textPrimary, fontSize: Typography.size.base }, slotList: { gap: Spacing[2] }, slot: { padding: Spacing[3], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md }, slotSelected: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface }, slotText: { fontFamily: Typography.fontFamily.sansMedium, color: Colors.textSecondary, fontSize: Typography.size.sm }, slotTextSelected: { color: Colors.primary }, hint: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary }, summary: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, gap: Spacing[3] }, summaryTitle: { fontFamily: Typography.fontFamily.bold, color: Colors.textPrimary, fontSize: Typography.size.lg }, oneTimeNote: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.success, letterSpacing: 0.2 }, summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, summaryKey: { fontFamily: Typography.fontFamily.sansRegular, color: Colors.textSecondary, fontSize: Typography.size.sm }, summaryValue: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textPrimary, fontSize: Typography.size.sm }, free: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.success, fontSize: Typography.size.sm }, divider: { height: 1, backgroundColor: Colors.divider }, total: { fontFamily: Typography.fontFamily.bold, color: Colors.textPrimary, fontSize: Typography.size.base }, error: { color: Colors.error, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm }, footer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: Spacing[5], paddingTop: Spacing[4] },
});
