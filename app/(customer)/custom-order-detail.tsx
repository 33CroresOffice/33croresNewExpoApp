import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Flower2, Calendar, Clock, MapPin, MessageSquare, Package, IndianRupee, CircleCheck as CheckCircle, CreditCard, Timer, XCircle } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format } from 'date-fns';
import StatusChip from '@/components/ui/StatusChip';
import Button from '@/components/ui/Button';
import RazorpayWebView from '@/components/ui/RazorpayWebView';

function CustItemTypeBadge({ isGarland }: { isGarland: boolean }) {
  return (
    <View style={{
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 20,
      backgroundColor: isGarland ? '#FFF0E6' : '#EAF7EE',
      alignSelf: 'flex-start',
    }}>
      <Text style={{
        fontFamily: Typography.fontFamily.sansMedium,
        fontSize: 10,
        color: isGarland ? Colors.accent : Colors.success,
      }}>
        {isGarland ? 'Garland' : 'Flower'}
      </Text>
    </View>
  );
}

function ItemsOrderedSection({ items, orderType, styles }: { items: any[]; orderType: string; styles: any }) {
  const hasGarland = items.some((i) => i.measure_type);
  const hasFlower = items.some((i) => !i.measure_type);
  const mixed = hasGarland && hasFlower;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Package size={16} color={Colors.primary} />
        <Text style={styles.sectionTitle}>Items Ordered</Text>
      </View>

      {/* Flower items */}
      {hasFlower && (
        <View>
          {mixed && <Text style={styles.subSectionLabel}>Flower Items</Text>}
          <View style={styles.tableHead}>
            <Text style={[styles.thCell, { flex: 1 }]}>Flower</Text>
            <Text style={[styles.thCell, { width: 52 }]}>Qty</Text>
            <Text style={[styles.thCell, { width: 56 }]}>Unit</Text>
            <Text style={[styles.thCell, { width: 60 }]}>Type</Text>
          </View>
          {items.filter((i) => !i.measure_type).map((item: any, i: number) => (
            <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
              <Text style={[styles.tdCell, { flex: 1 }]}>{item.flower_name}</Text>
              <Text style={[styles.tdCell, { width: 52 }]}>{item.quantity}</Text>
              <Text style={[styles.tdMuted, { width: 56 }]}>{item.unit}</Text>
              <View style={{ width: 60 }}><CustItemTypeBadge isGarland={false} /></View>
            </View>
          ))}
        </View>
      )}

      {/* Garland items */}
      {hasGarland && (
        <View style={mixed ? styles.subSection : undefined}>
          {mixed && <Text style={styles.subSectionLabel}>Garland Items</Text>}
          <View style={styles.tableHead}>
            <Text style={[styles.thCell, { flex: 1 }]}>Flower</Text>
            <Text style={[styles.thCell, { width: 44 }]}>No.</Text>
            <Text style={[styles.thCell, { width: 56 }]}>Count</Text>
            <Text style={[styles.thCell, { width: 44 }]}>Size</Text>
            <Text style={[styles.thCell, { width: 60 }]}>Type</Text>
          </View>
          {items.filter((i) => i.measure_type).map((item: any, i: number) => (
            <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
              <Text style={[styles.tdCell, { flex: 1 }]}>{item.flower_name}</Text>
              <Text style={[styles.tdCell, { width: 44 }]}>{item.quantity ?? item.garland_count}</Text>
              <Text style={[styles.tdMuted, { width: 56 }]}>
                {item.measure_type === 'flower_count' ? (item.flower_count ?? '—') : '—'}
              </Text>
              <Text style={[styles.tdMuted, { width: 44 }]}>
                {item.measure_type === 'garland_size' ? (item.garland_size ?? '—') : '—'}
              </Text>
              <View style={{ width: 60 }}><CustItemTypeBadge isGarland={true} /></View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

let RazorpayCheckout: any = null;
if (Platform.OS !== 'web') {
  RazorpayCheckout = require('react-native-razorpay').default;
}

const ORDER_TYPE_LABEL: Record<string, string> = {
  flower: 'Flower Order',
  garland: 'Garland Order',
};

const STATUS_STEPS = ['pending', 'confirmed', 'paid', 'out_for_delivery', 'delivered'];
const STATUS_STEP_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Price Set',
  paid: 'Paid',
  out_for_delivery: 'On the Way',
  delivered: 'Delivered',
};

export default function CustomOrderDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, session } = useAuthStore();

  const [order, setOrder] = useState<any>(null);
  const [address, setAddress] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [webViewUrl, setWebViewUrl] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonError, setCancelReasonError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('custom_orders')
      .select('*')
      .eq('id', id)
      .single();

    if (data) {
      setOrder(data);
      if (data.address_id) {
        const { data: addr } = await supabase
          .from('addresses')
          .select('*')
          .eq('id', data.address_id)
          .maybeSingle();
        setAddress(addr);
      }
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const invokeFn = async (fnName: string, body: object) => {
    const { data, error } = await supabase.functions.invoke(fnName, { body });
    if (error) {
      let msg = error.message ?? 'Request failed';
      try {
        const ctx = (error as any).context;
        if (ctx) {
          const text = typeof ctx.text === 'function' ? await ctx.text() : null;
          if (text) {
            const parsed = JSON.parse(text);
            msg = parsed?.error ?? msg;
          }
        }
      } catch { /* ignore parse errors */ }
      if (data && (data as any).error) msg = (data as any).error;
      return { data: data ?? {}, error: { message: msg } };
    }
    return { data, error: null };
  };

  const verifyPayment = async (rzpOrderId: string, rzpPaymentId: string, rzpSignature: string) => {
    const { data, error } = await invokeFn('verify-custom-order-payment', {
      custom_order_id: id,
      razorpay_order_id: rzpOrderId,
      razorpay_payment_id: rzpPaymentId,
      razorpay_signature: rzpSignature,
    });
    if (error || !data?.success) {
      setPayError(data?.error || error?.message || 'Payment verification failed');
      setPaying(false);
      return;
    }
    // Refresh order to show paid status
    await load();
    setPaying(false);
  };

  const handleCancelOrder = async () => {
    if (!cancelReason.trim()) {
      setCancelReasonError('Please enter a reason for cancellation.');
      return;
    }
    setCancelReasonError('');
    setCancelling(true);
    const { error } = await supabase
      .from('custom_orders')
      .update({
        status: 'cancelled',
        cancel_reason: cancelReason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (!error) setOrder((prev: any) => prev ? { ...prev, status: 'cancelled', cancel_reason: cancelReason.trim() } : prev);
    setConfirmCancel(false);
    setCancelReason('');
    setCancelling(false);
  };

  const getCallbackUrl = (rzpOrderId: string) => {
    const base = Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : 'https://rzp-callback.33crores.app';
    return `${base}/(customer)/custom-order-detail?id=${id}&rzp_order=${rzpOrderId}`;
  };

  const handleWebViewCallback = async (params: Record<string, string>) => {
    setWebViewUrl(null);
    setPaying(true);
    await verifyPayment(
      params.razorpay_order_id ?? order?.razorpay_order_id,
      params.razorpay_payment_id,
      params.razorpay_signature
    );
  };

  const handlePay = async () => {
    setPayError('');
    setPaying(true);

    const { data: orderData, error: orderError } = await invokeFn('create-custom-order-payment', {
      custom_order_id: id,
    });

    if (orderError || !orderData?.success) {
      setPayError(orderData?.error || orderError?.message || 'Failed to initiate payment');
      setPaying(false);
      return;
    }

    // Test mode — skip gateway, verify immediately
    if (orderData.test_mode) {
      await verifyPayment(
        orderData.order_id,
        `pay_sim_${Date.now()}`,
        'simulated'
      );
      return;
    }

    if (Platform.OS === 'web') {
      // Use Razorpay.js on web
      try {
        const options = {
          key: orderData.key_id,
          amount: String(orderData.amount),
          currency: orderData.currency ?? 'INR',
          order_id: orderData.order_id,
          name: '33 Crores Flowers',
          description: ORDER_TYPE_LABEL[order.order_type] ?? 'Custom Order',
          prefill: {
            name: profile?.full_name ?? '',
            contact: profile?.mobile ?? '',
          },
          theme: { color: Colors.primary },
          handler: async (response: any) => {
            await verifyPayment(
              response.razorpay_order_id,
              response.razorpay_payment_id,
              response.razorpay_signature
            );
          },
          modal: { ondismiss: () => setPaying(false) },
        };
        const rzp = new (window as any).Razorpay(options);
        rzp.on('payment.failed', () => {
          setPayError('Payment failed. Please try again.');
          setPaying(false);
        });
        rzp.open();
      } catch {
        setPayError('Payment gateway not available on this browser.');
        setPaying(false);
      }
      return;
    }

    // Native Razorpay SDK
    try {
      const options = {
        description: ORDER_TYPE_LABEL[order.order_type] ?? 'Custom Order',
        image: '',
        currency: orderData.currency ?? 'INR',
        key: orderData.key_id,
        amount: String(orderData.amount),
        order_id: orderData.order_id,
        name: '33 Crores Flowers',
        prefill: {
          name: profile?.full_name ?? '',
          contact: profile?.mobile ?? '',
        },
        theme: { color: Colors.primary },
      };
      const response = await RazorpayCheckout.open(options);
      await verifyPayment(
        response.razorpay_order_id,
        response.razorpay_payment_id,
        response.razorpay_signature
      );
    } catch (e: any) {
      if (!e?.code) {
        setPayError('Payment failed. Please try again.');
      }
      setPaying(false);
    }
  };

  if (loading || !order) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Order Details</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>{loading ? 'Loading…' : 'Order not found.'}</Text>
        </View>
      </View>
    );
  }

  const isCancelled = order.status === 'cancelled';
  const canCancel = order.status === 'pending' || order.status === 'confirmed';
  const currentStepIndex = STATUS_STEPS.indexOf(order.status);
  const pricesReady = order.total_price > 0;
  const isPaid = order.payment_status === 'paid';
  const isPending = order.payment_status === 'pending';
  const isUnpaid = order.payment_status === 'unpaid';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Order Details</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Hero */}
        <View style={styles.heroCard}>
          <View style={styles.heroIconWrap}>
            <Flower2 size={28} color={Colors.primary} />
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.heroType}>{ORDER_TYPE_LABEL[order.order_type] ?? 'Custom Order'}</Text>
            <Text style={styles.heroDate}>
              Placed {format(new Date(order.created_at), 'dd MMM yyyy, hh:mm a')}
            </Text>
          </View>
          <StatusChip status={order.status} />
        </View>

        {/* Progress Tracker */}
        {!isCancelled && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Order Progress</Text>
            <View style={styles.stepRow}>
              {STATUS_STEPS.map((step, i) => {
                const done = i <= currentStepIndex;
                const active = i === currentStepIndex;
                const isLast = i === STATUS_STEPS.length - 1;
                return (
                  <View key={step} style={styles.stepItem}>
                    <View style={styles.stepConnectorRow}>
                      <View style={[styles.stepDot, done && styles.stepDotDone, active && styles.stepDotActive]} />
                      {!isLast && (
                        <View style={[styles.stepLine, done && i < currentStepIndex && styles.stepLineDone]} />
                      )}
                    </View>
                    <Text style={[styles.stepLabel, active && styles.stepLabelActive, done && !active && styles.stepLabelDone]}>
                      {STATUS_STEP_LABELS[step]}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {isCancelled && (
          <View style={styles.cancelledBanner}>
            <Text style={styles.cancelledText}>This order has been cancelled.</Text>
            {order.cancel_reason ? (
              <Text style={styles.cancelledReason}>Reason: {order.cancel_reason}</Text>
            ) : null}
          </View>
        )}

        {/* Cancel Order */}
        {canCancel && (
          confirmCancel ? (
            <View style={styles.confirmCancelCard}>
              <View style={styles.confirmCancelHeader}>
                <XCircle size={18} color={Colors.error} />
                <Text style={styles.confirmCancelTitle}>Cancel this order?</Text>
              </View>
              <Text style={styles.confirmCancelSub}>
                Please tell us why you want to cancel. This cannot be undone.
              </Text>
              <View style={styles.reasonInputWrap}>
                <TextInput
                  style={[styles.reasonInput, cancelReasonError ? styles.reasonInputError : null]}
                  placeholder="e.g. Changed my mind, duplicate order…"
                  placeholderTextColor={Colors.textTertiary}
                  value={cancelReason}
                  onChangeText={(v) => { setCancelReason(v); if (v.trim()) setCancelReasonError(''); }}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
                {cancelReasonError ? (
                  <Text style={styles.reasonInputErrorText}>{cancelReasonError}</Text>
                ) : null}
              </View>
              <View style={styles.confirmCancelBtns}>
                <TouchableOpacity
                  style={styles.confirmCancelNo}
                  onPress={() => { setConfirmCancel(false); setCancelReason(''); setCancelReasonError(''); }}
                  disabled={cancelling}
                >
                  <Text style={styles.confirmCancelNoText}>Keep Order</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmCancelYes, cancelling && { opacity: 0.6 }]}
                  onPress={handleCancelOrder}
                  disabled={cancelling}
                >
                  {cancelling
                    ? <ActivityIndicator size="small" color={Colors.white} />
                    : <Text style={styles.confirmCancelYesText}>Yes, Cancel</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.cancelOrderBtn}
              onPress={() => setConfirmCancel(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelOrderBtnText}>Cancel Order</Text>
            </TouchableOpacity>
          )
        )}

        {/* Payment Section */}
        {!isCancelled && (
          <View style={[styles.card, isPaid && styles.cardPaid]}>
            <View style={styles.cardHeader}>
              <IndianRupee size={16} color={isPaid ? Colors.success : pricesReady ? Colors.primary : Colors.textTertiary} />
              <Text style={styles.sectionTitle}>Payment</Text>
            </View>

            {isPaid ? (
              /* Paid */
              <View style={styles.paidBox}>
                <CheckCircle size={22} color={Colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.paidTitle}>Payment Received</Text>
                  <Text style={styles.paidSub}>Your order is confirmed and being prepared.</Text>
                </View>
              </View>
            ) : pricesReady ? (
              /* Prices set, awaiting payment */
              <>
                <Text style={styles.paymentReadyText}>
                  Please complete your payment to confirm your order.
                </Text>

                <View style={styles.priceBreakdown}>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceRowLabel}>Flower price</Text>
                    <Text style={styles.priceRowValue}>
                      ₹{(order.flower_price / 100).toLocaleString('en-IN')}
                    </Text>
                  </View>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceRowLabel}>Delivery charge</Text>
                    <Text style={styles.priceRowValue}>
                      ₹{(order.delivery_price / 100).toLocaleString('en-IN')}
                    </Text>
                  </View>
                  <View style={[styles.priceRow, styles.priceRowTotal]}>
                    <Text style={styles.priceRowTotalLabel}>Total</Text>
                    <Text style={styles.priceRowTotalValue}>
                      ₹{(order.total_price / 100).toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>

                {payError ? (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>{payError}</Text>
                  </View>
                ) : null}

                {isPending && !paying ? (
                  <View style={styles.infoBanner}>
                    <Text style={styles.infoBannerText}>Payment initiated. Tap below to retry if the window closed.</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[styles.payBtn, paying && styles.payBtnDisabled]}
                  onPress={handlePay}
                  disabled={paying}
                  activeOpacity={0.85}
                >
                  {paying ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <CreditCard size={18} color={Colors.white} />
                  )}
                  <Text style={styles.payBtnText}>
                    {paying ? 'Processing…' : `Pay ₹${(order.total_price / 100).toLocaleString('en-IN')}`}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              /* Prices not set yet */
              <View style={styles.awaitingPriceBox}>
                <Timer size={20} color={Colors.textTertiary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.awaitingPriceTitle}>Awaiting Price Quote</Text>
                  <Text style={styles.awaitingPriceSub}>
                    Our team is reviewing your order. You'll see the price and payment option here once it's ready.
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Items */}
        <ItemsOrderedSection items={order.items} orderType={order.order_type} styles={styles} />

        {/* Delivery Info */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Calendar size={16} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Delivery Details</Text>
          </View>
          <View style={styles.infoRow}>
            <Calendar size={14} color={Colors.textTertiary} />
            <Text style={styles.infoLabel}>Date</Text>
            <Text style={styles.infoValue}>{format(new Date(order.delivery_date), 'EEEE, dd MMM yyyy')}</Text>
          </View>
          <View style={styles.infoRow}>
            <Clock size={14} color={Colors.textTertiary} />
            <Text style={styles.infoLabel}>Time</Text>
            <Text style={styles.infoValue}>{order.delivery_time}</Text>
          </View>
          {address && (
            <View style={styles.infoRow}>
              <MapPin size={14} color={Colors.textTertiary} />
              <Text style={styles.infoLabel}>Address</Text>
              <Text style={[styles.infoValue, { flex: 1 }]} numberOfLines={3}>
                {address.apartment_name ? `${address.apartment_name}, ` : ''}{address.street}, {address.city}, {address.state} - {address.pincode}
                {address.landmark ? `\nNear ${address.landmark}` : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Special Instructions */}
        {order.special_instructions ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MessageSquare size={16} color={Colors.textTertiary} />
              <Text style={styles.sectionTitle}>Special Instructions</Text>
            </View>
            <Text style={styles.noteText}>{order.special_instructions}</Text>
          </View>
        ) : null}

        {/* Admin Note */}
        {order.admin_note ? (
          <View style={[styles.card, styles.adminNoteCard]}>
            <Text style={styles.adminNoteLabel}>Note from Admin</Text>
            <Text style={styles.adminNoteText}>{order.admin_note}</Text>
          </View>
        ) : null}

        <Text style={styles.orderId}>Order ID: {order.id}</Text>
      </ScrollView>

      {/* Native Razorpay WebView overlay */}
      {webViewUrl && Platform.OS !== 'web' && (
        <RazorpayWebView
          paymentUrl={webViewUrl}
          callbackUrlPrefix="https://rzp-callback.33crores.app"
          onSuccess={handleWebViewCallback}
          onCancel={() => { setWebViewUrl(null); setPaying(false); }}
        />
      )}
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
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textTertiary,
  },
  content: { padding: Spacing[5], gap: Spacing[4], paddingBottom: 48 },

  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInfo: { flex: 1, gap: 4 },
  heroType: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
  },
  heroDate: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },

  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing[3],
    ...Shadow.sm,
  },
  cardPaid: { borderColor: Colors.successLight },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  sectionTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },

  // Progress tracker
  stepRow: { flexDirection: 'row', alignItems: 'flex-start' },
  stepItem: { flex: 1, alignItems: 'center' },
  stepConnectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
    position: 'relative',
  },
  stepDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.neutral[200],
    borderWidth: 2,
    borderColor: Colors.neutral[300],
    zIndex: 1,
  },
  stepDotDone: { backgroundColor: Colors.primaryLight, borderColor: Colors.primaryLight },
  stepDotActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  stepLine: {
    position: 'absolute',
    left: '50%',
    right: 0,
    height: 2,
    backgroundColor: Colors.neutral[200],
    top: 6,
    zIndex: 0,
  },
  stepLineDone: { backgroundColor: Colors.primaryLight },
  stepLabel: {
    marginTop: Spacing[2],
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 10,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  stepLabelActive: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    color: Colors.primary,
    fontSize: 11,
  },
  stepLabelDone: { color: Colors.primaryLight },

  cancelledBanner: {
    backgroundColor: Colors.errorSurface,
    borderRadius: Radius.md,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.errorLight,
    alignItems: 'center',
    gap: Spacing[1],
  },
  cancelledText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.error,
  },
  cancelledReason: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.error,
    opacity: 0.8,
    textAlign: 'center',
  },

  cancelOrderBtn: {
    borderWidth: 1,
    borderColor: Colors.errorLight,
    borderRadius: Radius.md,
    paddingVertical: Spacing[3],
    alignItems: 'center',
  },
  cancelOrderBtnText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.error,
  },

  confirmCancelCard: {
    backgroundColor: Colors.errorSurface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.errorLight,
    padding: Spacing[4],
    gap: Spacing[3],
  },
  confirmCancelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  confirmCancelTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.error,
  },
  confirmCancelSub: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  reasonInputWrap: { gap: 4 },
  reasonInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing[3],
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    backgroundColor: Colors.white,
    minHeight: 80,
  },
  reasonInputError: { borderColor: Colors.error },
  reasonInputErrorText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.error,
  },
  confirmCancelBtns: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  confirmCancelNo: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: Spacing[3],
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  confirmCancelNoText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  confirmCancelYes: {
    flex: 1,
    backgroundColor: Colors.error,
    borderRadius: Radius.md,
    paddingVertical: Spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelYesText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.white,
  },

  // Payment
  paidBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
    backgroundColor: Colors.successSurface,
    borderRadius: Radius.md,
    padding: Spacing[3],
  },
  paidTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.success,
  },
  paidSub: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.success,
    marginTop: 2,
  },

  paymentReadyText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  priceBreakdown: {
    gap: Spacing[2],
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing[3],
    backgroundColor: Colors.neutral[50],
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceRowLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  priceRowValue: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  priceRowTotal: {
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingTop: Spacing[2],
    marginTop: Spacing[1],
  },
  priceRowTotalLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  priceRowTotalValue: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xl,
    color: Colors.primary,
  },

  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 14,
  },
  payBtnDisabled: { opacity: 0.6 },
  payBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.white,
  },

  errorBanner: {
    backgroundColor: Colors.errorSurface,
    borderRadius: Radius.md,
    padding: Spacing[3],
  },
  errorText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.error,
  },
  infoBanner: {
    backgroundColor: Colors.warningSurface,
    borderRadius: Radius.md,
    padding: Spacing[3],
  },
  infoBannerText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.warning,
  },

  awaitingPriceBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
    backgroundColor: Colors.neutral[100],
    borderRadius: Radius.md,
    padding: Spacing[3],
  },
  awaitingPriceTitle: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  awaitingPriceSub: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginTop: 2,
    lineHeight: 18,
  },

  // Items table
  tableHead: {
    flexDirection: 'row',
    paddingVertical: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  thCell: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  tdCell: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  tdMuted: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },

  // Info rows
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
  },
  infoLabel: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    width: 60,
  },
  infoValue: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    lineHeight: 20,
  },

  noteText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    fontStyle: 'italic',
  },

  adminNoteCard: {
    borderColor: Colors.accentLight,
    backgroundColor: Colors.accentSurface,
  },
  adminNoteLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.accentDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  adminNoteText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  orderId: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 10,
    color: Colors.textDisabled,
    textAlign: 'center',
  },
  subSection: {
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingTop: Spacing[3],
    marginTop: Spacing[1],
  },
  subSectionLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing[2],
  },
});
