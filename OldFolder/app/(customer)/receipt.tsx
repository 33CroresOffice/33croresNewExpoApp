import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Download, CircleCheck as CheckCircle, Calendar, CreditCard, Hash, Leaf, MapPin, RefreshCw } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Subscription, SubscriptionRenewalHistory } from '@/types/database';
import { format, parseISO } from 'date-fns';

export default function ReceiptScreen() {
  const insets = useSafeAreaInsets();
  const { type, subscriptionId, renewalId } = useLocalSearchParams<{
    type: 'new' | 'renewal';
    subscriptionId?: string;
    renewalId?: string;
  }>();
  const { profile } = useAuthStore();

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [renewal, setRenewal] = useState<SubscriptionRenewalHistory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (type === 'new' && subscriptionId) {
        const { data } = await supabase
          .from('subscriptions')
          .select('*, plan:subscription_plans(*), delivery_address:addresses(*)')
          .eq('id', subscriptionId)
          .single();
        if (data) setSubscription(data as Subscription);
      } else if (type === 'renewal' && renewalId) {
        const { data } = await supabase
          .from('subscription_renewal_history')
          .select('*, plan:subscription_plans(*)')
          .eq('id', renewalId)
          .single();
        if (data) {
          setRenewal(data as SubscriptionRenewalHistory);
          if (data.new_subscription_id) {
            const { data: subData } = await supabase
              .from('subscriptions')
              .select('*, plan:subscription_plans(*), delivery_address:addresses(*)')
              .eq('id', data.new_subscription_id)
              .maybeSingle();
            if (subData) setSubscription(subData as Subscription);
          }
        }
      }
      setLoading(false);
    };
    load();
  }, [type, subscriptionId, renewalId]);

  const handleShare = async () => {
    const isRenewal = type === 'renewal';
    const planName = subscription?.plan?.name ?? renewal?.plan?.name ?? 'Subscription';
    const amount = isRenewal
      ? renewal?.amount_paid != null ? `₹${(renewal.amount_paid / 100).toLocaleString('en-IN')}` : '—'
      : subscription?.plan?.price != null ? `₹${(subscription.plan.price / 100).toLocaleString('en-IN')}` : '—';
    const date = isRenewal
      ? renewal?.renewed_at ? format(new Date(renewal.renewed_at), 'dd MMM yyyy, hh:mm a') : '—'
      : subscription?.created_at ? format(new Date(subscription.created_at), 'dd MMM yyyy, hh:mm a') : '—';
    const ref = isRenewal ? renewal?.razorpay_payment_id : null;

    const text = [
      '33 Crores – Payment Receipt',
      '─────────────────────',
      `Type: ${isRenewal ? 'Subscription Renewal' : 'New Subscription'}`,
      `Plan: ${planName}`,
      `Amount Paid: ${amount}`,
      `Date: ${date}`,
      ref ? `Payment Ref: ${ref}` : null,
      '─────────────────────',
      'Thank you for choosing 33 Crores.',
    ].filter(Boolean).join('\n');

    await Share.share({ message: text });
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Receipt</Text>
          <View style={{ width: 36 }} />
        </View>
      </View>
    );
  }

  const isRenewal = type === 'renewal';
  const planName = subscription?.plan?.name ?? renewal?.plan?.name ?? 'Subscription';
  const amountPaise = isRenewal ? (renewal?.amount_paid ?? null) : (subscription?.plan?.price ?? null);
  const amountDisplay = amountPaise != null ? `₹${(amountPaise / 100).toLocaleString('en-IN')}` : '—';
  const dateDisplay = isRenewal
    ? (renewal?.renewed_at ? format(new Date(renewal.renewed_at), 'dd MMM yyyy, hh:mm a') : '—')
    : (subscription?.created_at ? format(new Date(subscription.created_at), 'dd MMM yyyy, hh:mm a') : '—');
  const paymentRef = isRenewal ? renewal?.razorpay_payment_id : null;
  const receiptNo = isRenewal
    ? (renewal?.id?.slice(0, 8).toUpperCase() ?? '—')
    : (subscription?.id?.slice(0, 8).toUpperCase() ?? '—');

  const address = (subscription as any)?.delivery_address;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Receipt</Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
          <Download size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.receiptCard}>
          <View style={styles.receiptTop}>
            <View style={styles.brandRow}>
              <View style={styles.brandIcon}>
                <Leaf size={20} color={Colors.white} />
              </View>
              <View>
                <Text style={styles.brandName}>33 Crores</Text>
                <Text style={styles.brandTagline}>Fresh Flowers Delivered</Text>
              </View>
            </View>

            <View style={styles.statusBadge}>
              <CheckCircle size={14} color={Colors.success} />
              <Text style={styles.statusText}>Payment Successful</Text>
            </View>
          </View>

          <View style={styles.zigzagDivider}>
            <View style={styles.zigzagLeft} />
            <View style={styles.dashedLine} />
            <View style={styles.zigzagRight} />
          </View>

          <View style={styles.receiptBody}>
            <View style={styles.receiptTypeRow}>
              <View style={[styles.receiptTypeBadge, isRenewal ? styles.renewalBadge : styles.newBadge]}>
                {isRenewal
                  ? <RefreshCw size={12} color={Colors.primary} />
                  : <Leaf size={12} color={Colors.primary} />
                }
                <Text style={styles.receiptTypeText}>
                  {isRenewal ? 'Subscription Renewal' : 'New Subscription'}
                </Text>
              </View>
            </View>

            <View style={styles.amountBlock}>
              <Text style={styles.amountLabel}>Amount Paid</Text>
              <Text style={styles.amountValue}>{amountDisplay}</Text>
            </View>

            <View style={styles.detailsGrid}>
              <ReceiptRow icon={<Hash size={14} color={Colors.textTertiary} />} label="Receipt No." value={receiptNo} />
              <ReceiptRow icon={<Calendar size={14} color={Colors.textTertiary} />} label="Date & Time" value={dateDisplay} />
              <ReceiptRow icon={<Leaf size={14} color={Colors.textTertiary} />} label="Plan" value={planName} />

              {isRenewal && renewal?.old_end_date && (
                <ReceiptRow
                  icon={<Calendar size={14} color={Colors.textTertiary} />}
                  label="Previous End"
                  value={format(parseISO(renewal.old_end_date), 'dd MMM yyyy')}
                />
              )}
              {isRenewal && renewal?.new_start_date && (
                <ReceiptRow
                  icon={<Calendar size={14} color={Colors.textTertiary} />}
                  label="New Period Start"
                  value={format(parseISO(renewal.new_start_date), 'dd MMM yyyy')}
                  highlight
                />
              )}
              {isRenewal && renewal?.new_end_date && (
                <ReceiptRow
                  icon={<Calendar size={14} color={Colors.textTertiary} />}
                  label="New Period End"
                  value={format(parseISO(renewal.new_end_date), 'dd MMM yyyy')}
                />
              )}

              {!isRenewal && subscription?.start_date && (
                <ReceiptRow
                  icon={<Calendar size={14} color={Colors.textTertiary} />}
                  label="Start Date"
                  value={format(parseISO(subscription.start_date), 'dd MMM yyyy')}
                  highlight
                />
              )}
              {!isRenewal && subscription?.end_date && (
                <ReceiptRow
                  icon={<Calendar size={14} color={Colors.textTertiary} />}
                  label="End Date"
                  value={format(parseISO(subscription.end_date), 'dd MMM yyyy')}
                />
              )}

              {address && (
                <ReceiptRow
                  icon={<MapPin size={14} color={Colors.textTertiary} />}
                  label="Delivery Address"
                  value={`${address.street}, ${address.city}, ${address.state} – ${address.pincode}`}
                />
              )}

              {paymentRef && (
                <ReceiptRow
                  icon={<CreditCard size={14} color={Colors.textTertiary} />}
                  label="Payment Reference"
                  value={paymentRef}
                  mono
                />
              )}
            </View>
          </View>

          <View style={styles.receiptFooter}>
            <Text style={styles.footerText}>Thank you for choosing 33 Crores</Text>
            <Text style={styles.footerSub}>Fresh flowers at your doorstep</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ReceiptRow({
  icon,
  label,
  value,
  highlight,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
}) {
  return (
    <View style={receiptRowStyles.row}>
      <View style={receiptRowStyles.left}>
        {icon}
        <Text style={receiptRowStyles.label}>{label}</Text>
      </View>
      <Text
        style={[
          receiptRowStyles.value,
          highlight && receiptRowStyles.valueHighlight,
          mono && receiptRowStyles.valueMono,
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

const receiptRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    gap: Spacing[3],
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    minWidth: 120,
  },
  label: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  value: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    flex: 1,
    textAlign: 'right',
  },
  valueHighlight: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  valueMono: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
});

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
  shareBtn: { padding: Spacing[1] },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    color: Colors.textPrimary,
  },
  content: { padding: Spacing[5] },
  receiptCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.md,
  },
  receiptTop: {
    padding: Spacing[5],
    backgroundColor: Colors.primarySurface,
    gap: Spacing[4],
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.lg,
    color: Colors.primaryDark,
    letterSpacing: -0.3,
  },
  brandTagline: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.primary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.successSurface,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.success,
  },
  zigzagDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 20,
    backgroundColor: Colors.white,
  },
  zigzagLeft: {
    width: 10,
    height: 20,
    backgroundColor: Colors.background,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
  },
  dashedLine: {
    flex: 1,
    height: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  zigzagRight: {
    width: 10,
    height: 20,
    backgroundColor: Colors.background,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  receiptBody: {
    padding: Spacing[5],
    gap: Spacing[5],
  },
  receiptTypeRow: {
    alignItems: 'flex-start',
  },
  receiptTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
  },
  newBadge: { backgroundColor: Colors.primarySurface },
  renewalBadge: { backgroundColor: Colors.accentSurface },
  receiptTypeText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountBlock: {
    alignItems: 'center',
    paddingVertical: Spacing[4],
    borderRadius: Radius.lg,
    backgroundColor: Colors.neutral[50],
    gap: Spacing[1],
  },
  amountLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 36,
    color: Colors.textPrimary,
    letterSpacing: -1,
  },
  detailsGrid: {
    gap: 0,
  },
  receiptFooter: {
    padding: Spacing[5],
    alignItems: 'center',
    gap: Spacing[1],
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    backgroundColor: Colors.neutral[50],
  },
  footerText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  footerSub: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
});
