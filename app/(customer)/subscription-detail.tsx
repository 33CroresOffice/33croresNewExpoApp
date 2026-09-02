import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Pause, MapPin, Calendar, Clock, History, TriangleAlert as AlertTriangle, RotateCcw, CircleCheck as CheckCircle, CalendarClock, Pencil, X, FileText, CreditCard, Receipt, Leaf } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { Subscription, SubscriptionRenewalHistory, Payment } from '@/types/database';
import StatusChip from '@/components/ui/StatusChip';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import DatePickerField from '@/components/ui/DatePickerField';
import { format, addMonths, isAfter, addDays, isBefore, differenceInDays, parseISO } from 'date-fns';
import { getMinSubscriptionStartDate, isPastCutoffIST, getSubscriptionCutoffNotice, toLocalDateStr } from '@/utils/istCutoff';
import { getEffectiveStatus } from '@/utils/subscriptionStatus';
import { dedupePauseHistory } from '@/utils/pauseHistory';

interface PauseHistory {
  id: string;
  pause_start_date: string;
  pause_until: string;
  resumed_at: string | null;
  is_cancelled: boolean;
  created_at: string;
}

function computeEndDate(sub: Subscription, pauseHistory: PauseHistory[]): Date {
  const base = new Date(sub.start_date);
  let totalPausedDays = 0;

  for (const p of pauseHistory) {
    if (p.is_cancelled) continue;
    const pauseStart = new Date(p.pause_start_date);
    // Full pause: inclusive (start through end). Early resume: non-inclusive of resumed_at.
    const days = p.resumed_at
      ? differenceInDays(new Date(p.resumed_at), pauseStart)
      : differenceInDays(new Date(p.pause_until), pauseStart) + 1;
    if (days > 0) totalPausedDays += days;
  }

  if (sub.status === 'paused' && sub.pause_start_date && sub.pause_until) {
    const alreadyCounted = pauseHistory.some(
      (p) => p.pause_start_date === sub.pause_start_date && !p.is_cancelled
    );
    if (!alreadyCounted) {
      const pauseStart = new Date(sub.pause_start_date);
      const pauseEnd = new Date(sub.pause_until);
      const days = differenceInDays(pauseEnd, pauseStart) + 1;
      if (days > 0) totalPausedDays += days;
    }
  }

  return addDays(base, 29 + totalPausedDays);
}

function InvoicesTab({
  subscription,
  payments,
  renewalHistory,
}: {
  subscription: Subscription;
  payments: Payment[];
  renewalHistory: SubscriptionRenewalHistory[];
}) {
  const formatPrice = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

  type InvoiceItem = {
    id: string;
    type: 'initial' | 'renewal';
    date: string;
    amount: number;
    planName: string;
    paymentRef: string | null;
    status: 'success' | 'pending' | 'failed';
    renewalId?: string;
    subscriptionId: string;
  };

  const renewalByPaymentId = new Map(
    renewalHistory
      .filter((r) => r.razorpay_payment_id)
      .map((r) => [r.razorpay_payment_id!, r])
  );

  const invoices: InvoiceItem[] = payments.map((p) => {
    const renewal = renewalByPaymentId.get(p.razorpay_payment_id ?? '');
    const isRenewal = !!renewal || (p.subscription_id !== subscription.id);
    return {
      id: p.id,
      type: isRenewal ? 'renewal' : 'initial',
      date: p.created_at,
      amount: p.amount,
      planName: renewal?.plan?.name ?? subscription.plan?.name ?? '—',
      paymentRef: p.razorpay_payment_id,
      status: p.status === 'success' ? 'success' : p.status === 'pending' ? 'pending' : 'failed',
      renewalId: renewal?.id,
      subscriptionId: p.subscription_id ?? subscription.id,
    };
  });

  invoices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (invoices.length === 0) {
    return (
      <View style={styles.invoiceEmpty}>
        <FileText size={40} color={Colors.textTertiary} />
        <Text style={styles.invoiceEmptyText}>No invoices yet.
Payments will appear here once made.</Text>
      </View>
    );
  }

  const statusConfig = {
    success: { bg: styles.invoiceStatusSuccess, color: Colors.success, label: 'Paid' },
    pending: { bg: styles.invoiceStatusPending, color: Colors.warning, label: 'Pending' },
    failed: { bg: styles.invoiceStatusFailed, color: Colors.error, label: 'Failed' },
  };

  return (
    <>
      {invoices.map((inv) => {
        const cfg = statusConfig[inv.status];
        const receiptParams = inv.type === 'renewal' && inv.renewalId
          ? { type: 'renewal' as const, renewalId: inv.renewalId }
          : { type: 'new' as const, subscriptionId: inv.subscriptionId ?? subscription.id };

        return (
          <View key={inv.id} style={styles.invoiceCard}>
            <View style={styles.invoiceHeader}>
              <View style={styles.invoiceHeaderLeft}>
                <View style={styles.invoiceIconWrap}>
                  {inv.type === 'renewal'
                    ? <RotateCcw size={18} color={Colors.primary} />
                    : <Leaf size={18} color={Colors.primary} />}
                </View>
                <View>
                  <Text style={styles.invoiceType}>
                    {inv.type === 'renewal' ? 'Renewal Payment' : 'Initial Payment'}
                  </Text>
                  <Text style={styles.invoiceDate}>
                    {format(new Date(inv.date), 'dd MMM yyyy, hh:mm a')}
                  </Text>
                </View>
              </View>
              <Text style={styles.invoiceAmount}>
                {inv.amount != null ? formatPrice(inv.amount) : '—'}
              </Text>
            </View>

            <View style={styles.invoiceBody}>
              <View style={styles.invoiceRow}>
                <Text style={styles.invoiceRowLabel}>Invoice No.</Text>
                <Text style={styles.invoiceRowValue}>{inv.id.slice(0, 8).toUpperCase()}</Text>
              </View>
              <View style={styles.invoiceRow}>
                <Text style={styles.invoiceRowLabel}>Plan</Text>
                <Text style={styles.invoiceRowValue}>{inv.planName}</Text>
              </View>
              {inv.paymentRef && (
                <View style={styles.invoiceRow}>
                  <Text style={styles.invoiceRowLabel}>Payment Ref</Text>
                  <Text style={styles.invoiceRowValue}>{inv.paymentRef}</Text>
                </View>
              )}
              <View style={styles.invoiceRow}>
                <Text style={styles.invoiceRowLabel}>Status</Text>
                <View style={[styles.invoiceStatusBadge, cfg.bg]}>
                  <Text style={[styles.invoiceStatusText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              </View>

              <View style={styles.invoiceFooter}>
                <TouchableOpacity
                  style={styles.invoiceReceiptBtn}
                  onPress={() => router.push({ pathname: '/(customer)/receipt', params: receiptParams })}
                >
                  <Receipt size={14} color={Colors.primary} />
                  <Text style={styles.invoiceReceiptBtnText}>View Receipt</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );
      })}
    </>
  );
}

export default function SubscriptionDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [pauseHistory, setPauseHistory] = useState<PauseHistory[]>([]);
  const [renewalHistory, setRenewalHistory] = useState<SubscriptionRenewalHistory[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'details' | 'invoices'>('details');
  const [refreshing, setRefreshing] = useState(false);
  const [pauseModal, setPauseModal] = useState(false);
  const [resumeModal, setResumeModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [pauseMode, setPauseMode] = useState<'fixed' | 'custom'>('custom');
  const [pauseMonths, setPauseMonths] = useState(1);
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);
  const [dateError, setDateError] = useState('');
  const [editPauseModal, setEditPauseModal] = useState(false);
  const [editStartDate, setEditStartDate] = useState<Date | null>(null);
  const [editEndDate, setEditEndDate] = useState<Date | null>(null);
  const [editDateError, setEditDateError] = useState('');

  const load = async () => {
    setRefreshing(true);
    const [subRes, histRes, renewalRes, paymentsRes] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('*, plan:subscription_plans(*), delivery_address:addresses(*)')
        .eq('id', id)
        .single(),
      supabase
        .from('subscription_pause_history')
        .select('*')
        .eq('subscription_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('subscription_renewal_history')
        .select('*, plan:subscription_plans(*)')
        .eq('original_subscription_id', id)
        .order('renewed_at', { ascending: false }),
      supabase
        .from('payments')
        .select('*')
        .eq('subscription_id', id)
        .order('created_at', { ascending: false }),
    ]);
    if (subRes.data) setSubscription(subRes.data as Subscription);
    if (histRes.data) {
      setPauseHistory(dedupePauseHistory(histRes.data as PauseHistory[]));
    }
    if (renewalRes.data) setRenewalHistory(renewalRes.data as SubscriptionRenewalHistory[]);
    if (paymentsRes.data) setPayments(paymentsRes.data as Payment[]);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, [id]);

  const handlePause = async () => {
    setDateError('');
    const minDate = getMinSubscriptionStartDate();
    let pauseStartStr: string;
    let pauseUntilStr: string;

    if (pauseMode === 'custom') {
      if (!customStartDate) { setDateError('Please select a start date'); return; }
      if (!customEndDate) { setDateError('Please select an end date'); return; }
      if (isBefore(customStartDate, minDate)) {
        setDateError(`Start date must be ${format(minDate, 'dd MMM yyyy')} or later due to the 5 PM IST cutoff.`);
        return;
      }
      if (isBefore(customEndDate, minDate)) {
        setDateError(`End date must be ${format(minDate, 'dd MMM yyyy')} or later due to the 5 PM IST cutoff.`);
        return;
      }
      if (isBefore(customEndDate, customStartDate)) { setDateError('End date must be on or after start date'); return; }
      pauseStartStr = toLocalDateStr(customStartDate);
      pauseUntilStr = toLocalDateStr(customEndDate);
    } else {
      const pauseStart = getMinSubscriptionStartDate();
      const resumeDate = addMonths(pauseStart, pauseMonths);
      pauseStartStr = toLocalDateStr(pauseStart);
      pauseUntilStr = toLocalDateStr(resumeDate);
    }

    setActionLoading(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const pauseStartsToday = new Date(pauseStartStr) <= today;

    await supabase.from('subscriptions').update({
      status: pauseStartsToday ? 'paused' : 'active',
      pause_start_date: pauseStartStr,
      pause_until: pauseUntilStr,
    }).eq('id', id);

    setPauseModal(false);
    setActionLoading(false);
    setCustomStartDate(null);
    setCustomEndDate(null);
    await load();
  };

  const handleResume = async () => {
    setActionLoading(true);
    const resumeEffectiveDate = getMinSubscriptionStartDate();
    const resumedAtStr = toLocalDateStr(resumeEffectiveDate);

    const activeEntry = pauseHistory.find((h) => h.resumed_at === null);

    await Promise.all([
      supabase.from('subscriptions').update({
        status: 'active',
        pause_until: null,
        next_delivery_date: resumedAtStr,
      }).eq('id', id),
      activeEntry
        ? supabase.from('subscription_pause_history')
            .update({ resumed_at: resumedAtStr })
            .eq('id', activeEntry.id)
        : Promise.resolve(),
    ]);

    setResumeModal(false);
    setActionLoading(false);
    await load();
  };

  const openEditPauseModal = () => {
    if (!subscription) return;
    const todayStr = toLocalDateStr(new Date());
    const pauseStarted = subscription.pause_start_date
      ? subscription.pause_start_date <= todayStr
      : false;
    setEditStartDate(pauseStarted || !subscription.pause_start_date ? null : new Date(subscription.pause_start_date));
    if (!pauseStarted && subscription.pause_start_date) {
      setEditStartDate(new Date(subscription.pause_start_date));
    }
    setEditEndDate(subscription.pause_until ? new Date(subscription.pause_until) : null);
    setEditDateError('');
    setEditPauseModal(true);
  };

  const handleEditPause = async () => {
    if (!subscription) return;
    setEditDateError('');

    const todayStr = toLocalDateStr(new Date());
    const pauseStarted = subscription.pause_start_date
      ? subscription.pause_start_date <= todayStr
      : false;

    const minDate = getMinSubscriptionStartDate();

    let newStartStr: string;
    let newEndStr: string;

    if (pauseStarted) {
      newStartStr = subscription.pause_start_date!;
      if (!editEndDate) { setEditDateError('Please select an end date'); return; }
      const startDate = new Date(subscription.pause_start_date!);
      if (isBefore(editEndDate, startDate)) {
        setEditDateError('End date must be on or after the pause start date');
        return;
      }
      newEndStr = toLocalDateStr(editEndDate);
    } else {
      if (!editStartDate) { setEditDateError('Please select a start date'); return; }
      if (!editEndDate) { setEditDateError('Please select an end date'); return; }
      if (isBefore(editStartDate, minDate)) {
        setEditDateError(`Start date must be ${format(minDate, 'dd MMM yyyy')} or later`);
        return;
      }
      if (isBefore(editEndDate, editStartDate)) {
        setEditDateError('End date must be on or after start date');
        return;
      }
      newStartStr = toLocalDateStr(editStartDate);
      newEndStr = toLocalDateStr(editEndDate);
    }

    setActionLoading(true);

    const activeEntry = pauseHistory.find((h) => h.resumed_at === null);

    await Promise.all([
      supabase.from('subscriptions').update({
        pause_start_date: newStartStr,
        pause_until: newEndStr,
      }).eq('id', id),
      activeEntry
        ? supabase.from('subscription_pause_history').update({
            pause_start_date: newStartStr,
            pause_until: newEndStr,
          }).eq('id', activeEntry.id)
        : Promise.resolve(),
    ]);

    setEditPauseModal(false);
    setActionLoading(false);
    await load();
  };

  const handleCancelPause = async () => {
    if (!subscription?.pause_start_date || !subscription.pause_until) return;

    setActionLoading(true);

    await Promise.all([
      supabase.from('subscriptions').update({
        status: 'active',
        pause_start_date: null,
        pause_until: null,
      }).eq('id', id),
      supabase.from('subscription_pause_history')
        .update({ is_cancelled: true })
        .eq('subscription_id', id)
        .eq('pause_start_date', subscription.pause_start_date)
        .eq('pause_until', subscription.pause_until)
        .is('resumed_at', null)
        .eq('is_cancelled', false),
    ]);

    setActionLoading(false);
    await load();
  };

  const formatPrice = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

  if (loading || !subscription) {
    return <View style={[styles.container, { paddingTop: insets.top }]} />;
  }

  const effectiveStatus = getEffectiveStatus(subscription);
  const isActive = effectiveStatus === 'active';
  const isPaused = effectiveStatus === 'paused';
  const isScheduledPause = effectiveStatus === 'scheduled_pause';
  const isExpired = effectiveStatus === 'expired';
  const isRenewed = effectiveStatus === 'renewed';

  const renewalWarningState = (() => {
    if (isRenewed || effectiveStatus === 'cancelled') return null;
    if (!subscription.end_date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = parseISO(subscription.end_date);
    const daysLeft = differenceInDays(end, today);
    if (isExpired) return 'expired' as const;
    if (daysLeft < 0 && daysLeft >= -2) return 'grace' as const;
    if (daysLeft >= 0 && daysLeft <= 5) return 'warning' as const;
    return null;
  })();

  const showRenewalBanner = renewalWarningState !== null;
  const showPauseAction = isActive && renewalWarningState === null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Subscription</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'details' && styles.tabActive]}
          onPress={() => setActiveTab('details')}
        >
          <FileText size={16} color={activeTab === 'details' ? Colors.primary : Colors.textTertiary} />
          <Text style={[styles.tabText, activeTab === 'details' && styles.tabTextActive]}>Details</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'invoices' && styles.tabActive]}
          onPress={() => setActiveTab('invoices')}
        >
          <Receipt size={16} color={activeTab === 'invoices' ? Colors.primary : Colors.textTertiary} />
          <Text style={[styles.tabText, activeTab === 'invoices' && styles.tabTextActive]}>Invoices</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {refreshing && <View style={styles.refreshOverlay} />}
        {activeTab === 'invoices' ? (
          <InvoicesTab
            subscription={subscription}
            payments={payments}
            renewalHistory={renewalHistory}
          />
        ) : (
        <>
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroInfo}>
              <Text style={styles.planName}>{subscription.plan?.name}</Text>
              <Text style={styles.planFreq}>{subscription.plan?.frequency} delivery</Text>
            </View>
            <StatusChip status={effectiveStatus} />
          </View>
          <View style={styles.heroPrice}>
            <Text style={styles.price}>{formatPrice(subscription.plan?.price ?? 0)}</Text>
            <Text style={styles.pricePer}>/month</Text>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <MapPin size={16} color={Colors.accent} />
            <Text style={styles.infoLabel}>Delivery To</Text>
            <Text style={styles.infoValue} numberOfLines={3}>
              {subscription.delivery_address
                ? [
                    subscription.delivery_address.apartment_name,
                    subscription.delivery_address.street,
                    subscription.delivery_address.landmark,
                    subscription.delivery_address.city,
                    `${subscription.delivery_address.state} - ${subscription.delivery_address.pincode}`,
                  ].filter(Boolean).join(', ')
                : '—'}
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Calendar size={16} color={Colors.neutral[500]} />
            <Text style={styles.infoLabel}>Started</Text>
            <Text style={styles.infoValue}>{format(new Date(subscription.start_date), 'dd MMM yyyy')}</Text>
          </View>
          <View style={styles.infoItem}>
            <Calendar size={16} color={Colors.primary} />
            <Text style={styles.infoLabel}>New End Date</Text>
            <Text style={styles.infoValue}>
              {subscription.new_end_date
                ? format(new Date(subscription.new_end_date), 'dd MMM yyyy')
                : '—'}
            </Text>
          </View>
        </View>

        {(() => {
          if (!subscription.end_date) return null;
          const originalEnd = new Date(subscription.end_date);
          const currentNewEnd = subscription.new_end_date
            ? new Date(subscription.new_end_date)
            : originalEnd;
          // Sum up paused days from non-cancelled history entries only
          const accumulatedPauseDays = pauseHistory
            .filter((p) => !p.is_cancelled)
            .reduce((sum, p) => {
              const pStart = new Date(p.pause_start_date);
              const days = p.resumed_at
                ? differenceInDays(new Date(p.resumed_at), pStart)
                : differenceInDays(new Date(p.pause_until), pStart) + 1;
              return sum + (days > 0 ? days : 0);
            }, 0);
          if (accumulatedPauseDays <= 0) return null;
          const totalPausedDays = accumulatedPauseDays;
          return (
            <View style={styles.pauseExtensionCard}>
              <View style={styles.pauseExtensionHeader}>
                <CalendarClock size={15} color={Colors.warning} />
                <Text style={styles.pauseExtensionTitle}>End Date Extended Due to Pause</Text>
              </View>
              <View style={styles.pauseExtensionRow}>
                <View style={styles.pauseExtensionDateBlock}>
                  <Text style={styles.pauseExtensionLabel}>ORIGINAL END DATE</Text>
                  <Text style={styles.pauseExtensionDateOld}>{format(originalEnd, 'dd MMM yyyy')}</Text>
                </View>
                <View style={styles.pauseExtensionArrow}>
                  <Text style={styles.pauseExtensionArrowText}>→</Text>
                </View>
                <View style={styles.pauseExtensionDateBlock}>
                  <Text style={styles.pauseExtensionLabel}>NEW END DATE</Text>
                  <Text style={styles.pauseExtensionDateNew}>{format(currentNewEnd, 'dd MMM yyyy')}</Text>
                </View>
              </View>
              <View style={styles.pauseExtensionPill}>
                <Text style={styles.pauseExtensionPillText}>
                  +{totalPausedDays} day{totalPausedDays !== 1 ? 's' : ''} added
                </Text>
              </View>
            </View>
          );
        })()}

        {showRenewalBanner && subscription.end_date && (
          <View style={[
            styles.renewalBanner,
            renewalWarningState === 'expired' ? styles.renewalBannerExpired : styles.renewalBannerWarn,
          ]}>
            <View style={styles.renewalBannerLeft}>
              <AlertTriangle
                size={16}
                color={renewalWarningState === 'expired' ? Colors.error : Colors.warning}
              />
              <View style={styles.renewalBannerText}>
                <Text style={[
                  styles.renewalTitle,
                  { color: renewalWarningState === 'expired' ? Colors.error : Colors.warning },
                ]}>
                  {renewalWarningState === 'expired'
                    ? 'Subscription Expired'
                    : renewalWarningState === 'grace'
                    ? 'Grace Period Active'
                    : 'Renewal Reminder'}
                </Text>
                <Text style={[
                  styles.renewalSubText,
                  { color: renewalWarningState === 'expired' ? Colors.error : Colors.warning },
                ]}>
                  {(() => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const end = parseISO(subscription.end_date!);
                    const daysLeft = differenceInDays(end, today);
                    if (renewalWarningState === 'expired') return `Ended on ${format(end, 'dd MMM yyyy')}. Renew to continue deliveries.`;
                    if (renewalWarningState === 'grace') return `${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''} past end date. Renew before deliveries stop.`;
                    if (daysLeft === 0) return 'Expires today. Renew now to avoid interruption.';
                    return `Expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} on ${format(end, 'dd MMM yyyy')}.`;
                  })()}
                </Text>
              </View>
            </View>
            <Button
              label="Renew Now"
              onPress={() => router.push({
                pathname: '/(customer)/checkout',
                params: { planId: subscription.plan_id, renewFromSubscriptionId: subscription.id },
              })}
              variant={renewalWarningState === 'expired' ? 'primary' : 'outline'}
              size="sm"
            />
          </View>
        )}

        {isPaused && (
          <View style={styles.pausedBanner}>
            <View style={styles.pausedBannerLeft}>
              <Pause size={16} color={Colors.warning} />
              <View style={styles.pausedBannerText}>
                <Text style={styles.pausedTitle}>Subscription Paused</Text>
                {subscription.pause_start_date && subscription.pause_until ? (
                  <>
                    <View style={styles.pauseDatesRow}>
                      <View style={styles.pauseDateBlock}>
                        <Text style={styles.pauseDateLabel}>FROM</Text>
                        <Text style={styles.pauseDateValue}>
                          {format(new Date(subscription.pause_start_date), 'dd MMM yyyy')}
                        </Text>
                      </View>
                      <View style={styles.pauseDateDivider} />
                      <View style={styles.pauseDateBlock}>
                        <Text style={styles.pauseDateLabel}>UNTIL</Text>
                        <Text style={styles.pauseDateValue}>
                          {format(new Date(subscription.pause_until), 'dd MMM yyyy')}
                        </Text>
                      </View>
                    </View>
                    {(() => {
                      const totalDays = differenceInDays(new Date(subscription.pause_until), new Date(subscription.pause_start_date)) + 1;
                      return (
                        <View style={styles.pauseDaysRow}>
                          <Text style={styles.pauseDaysText}>
                            {totalDays} day{totalDays !== 1 ? 's' : ''} paused
                          </Text>
                        </View>
                      );
                    })()}
                  </>
                ) : subscription.pause_until ? (
                  <Text style={styles.pausedSubText}>
                    Until {format(new Date(subscription.pause_until), 'dd MMM yyyy')}
                  </Text>
                ) : (
                  <Text style={styles.pausedSubText}>Paused indefinitely</Text>
                )}
              </View>
            </View>
            <View style={styles.pausedBannerActions}>
              <TouchableOpacity style={styles.editPauseBtn} onPress={openEditPauseModal}>
                <Pencil size={14} color={Colors.warning} />
                <Text style={styles.editPauseBtnText}>Edit</Text>
              </TouchableOpacity>
              <Button
                label="Resume Now"
                onPress={() => setResumeModal(true)}
                variant="outline"
                size="sm"
                loading={actionLoading}
              />
            </View>
          </View>
        )}

        {isScheduledPause && subscription.pause_start_date && subscription.pause_until && (
          <View style={styles.pausedBanner}>
            <View style={styles.pausedBannerLeft}>
              <CalendarClock size={16} color={Colors.warning} />
              <View style={styles.pausedBannerText}>
                <Text style={styles.pausedTitle}>Pause Scheduled</Text>
                <View style={styles.pauseDatesRow}>
                  <View style={styles.pauseDateBlock}>
                    <Text style={styles.pauseDateLabel}>FROM</Text>
                    <Text style={styles.pauseDateValue}>
                      {format(new Date(subscription.pause_start_date), 'dd MMM yyyy')}
                    </Text>
                  </View>
                  <View style={styles.pauseDateDivider} />
                  <View style={styles.pauseDateBlock}>
                    <Text style={styles.pauseDateLabel}>UNTIL</Text>
                    <Text style={styles.pauseDateValue}>
                      {format(new Date(subscription.pause_until), 'dd MMM yyyy')}
                    </Text>
                  </View>
                </View>
                {(() => {
                  const totalDays = differenceInDays(new Date(subscription.pause_until), new Date(subscription.pause_start_date)) + 1;
                  return (
                    <View style={styles.pauseDaysRow}>
                      <Text style={styles.pauseDaysText}>
                        {totalDays} day{totalDays !== 1 ? 's' : ''} scheduled
                      </Text>
                    </View>
                  );
                })()}
              </View>
            </View>
            <View style={styles.pausedBannerActions}>
              <TouchableOpacity style={styles.editPauseBtn} onPress={openEditPauseModal}>
                <Pencil size={14} color={Colors.warning} />
                <Text style={styles.editPauseBtnText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelPauseBtn} onPress={handleCancelPause} disabled={actionLoading}>
                <X size={14} color={Colors.error} />
                <Text style={styles.cancelPauseBtnText}>Cancel Pause</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isRenewed && (
          <View style={styles.renewedBanner}>
            <CheckCircle size={16} color={Colors.success} />
            <View style={styles.renewedBannerText}>
              <Text style={styles.renewedTitle}>Subscription Renewed</Text>
              <Text style={styles.renewedSubText}>
                This subscription has been renewed. It will remain active until its end date, after which your new subscription takes over.
              </Text>
            </View>
          </View>
        )}

        {showPauseAction && (
          <View style={styles.actionsSection}>
            <Text style={styles.actionsTitle}>Manage Subscription</Text>
            <TouchableOpacity style={styles.actionRow} onPress={() => setPauseModal(true)}>
              <Pause size={18} color={Colors.warning} />
              <Text style={[styles.actionText, { color: Colors.warning }]}>Pause Subscription</Text>
            </TouchableOpacity>
          </View>
        )}

        {renewalHistory.length > 0 && (
          <View style={styles.historySection}>
            <View style={styles.historySectionHeader}>
              <RotateCcw size={16} color={Colors.textTertiary} />
              <Text style={styles.historyTitle}>Renewal History</Text>
            </View>
            {renewalHistory.map((entry, index) => {
              const isLast = index === renewalHistory.length - 1;
              return (
                <View key={entry.id} style={[styles.historyItem, !isLast && styles.historyItemBorder]}>
                  <View style={[styles.historyDot, { backgroundColor: Colors.primary }]} />
                  <View style={styles.historyItemContent}>
                    <Text style={styles.renewalHistoryDate}>
                      {format(new Date(entry.renewed_at), 'dd MMM yyyy, hh:mm a')}
                    </Text>
                    {entry.old_end_date && (
                      <Text style={styles.renewalHistoryPeriod}>
                        Previous end: {format(parseISO(entry.old_end_date), 'dd MMM yyyy')}
                      </Text>
                    )}
                    {entry.new_start_date && entry.new_end_date && (
                      <Text style={styles.renewalHistoryPeriod}>
                        New period: {format(parseISO(entry.new_start_date), 'dd MMM yyyy')}
                        {' – '}
                        {format(parseISO(entry.new_end_date), 'dd MMM yyyy')}
                      </Text>
                    )}
                    {entry.amount_paid != null && (
                      <Text style={styles.renewalHistoryAmount}>
                        Paid ₹{(entry.amount_paid / 100).toLocaleString('en-IN')}
                      </Text>
                    )}
                    {entry.razorpay_payment_id && (
                      <Text style={styles.renewalHistoryRef}>
                        Ref: {entry.razorpay_payment_id}
                      </Text>
                    )}
                    <TouchableOpacity
                      style={styles.viewReceiptBtn}
                      onPress={() => router.push({
                        pathname: '/(customer)/receipt',
                        params: { type: 'renewal', renewalId: entry.id },
                      })}
                    >
                      <Text style={styles.viewReceiptBtnText}>View Receipt</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {pauseHistory.length > 0 && (
          <View style={styles.historySection}>
            <View style={styles.historySectionHeader}>
              <History size={16} color={Colors.textTertiary} />
              <Text style={styles.historyTitle}>Pause History</Text>
            </View>
            {pauseHistory.map((entry, index) => {
              const isLast = index === pauseHistory.length - 1;
              const today = new Date(); today.setHours(0, 0, 0, 0);
              const startDate = new Date(entry.pause_start_date);
              const endDate = new Date(entry.pause_until);
              const wasResumedEarly = entry.resumed_at !== null &&
                isBefore(new Date(entry.resumed_at), endDate);

              type PauseStatus = 'scheduled' | 'active' | 'resumed_early' | 'completed' | 'cancelled';
              const pauseStatus: PauseStatus = (() => {
                if (entry.is_cancelled) return 'cancelled';
                if (entry.resumed_at && wasResumedEarly) return 'resumed_early';
                if (today < startDate) return 'scheduled';
                if (!entry.resumed_at && today >= startDate && today <= endDate) return 'active';
                return 'completed';
              })();

              const statusConfig: Record<PauseStatus, { label: string; bg: string; text: string; dot: string }> = {
                scheduled:     { label: 'Scheduled',     bg: Colors.warningSurface,  text: Colors.warning,     dot: Colors.warning },
                active:        { label: 'Paused',        bg: Colors.warningSurface,  text: Colors.warning,     dot: Colors.warning },
                resumed_early: { label: 'Resumed Early', bg: Colors.primarySurface,  text: Colors.primaryDark, dot: Colors.primary },
                completed:     { label: 'Completed',     bg: Colors.successSurface,  text: Colors.success,     dot: Colors.success },
                cancelled:     { label: 'Cancelled',     bg: Colors.errorSurface,    text: Colors.error,       dot: Colors.neutral[300] },
              };
              const cfg = statusConfig[pauseStatus];

              const effectiveEnd = entry.resumed_at ? new Date(entry.resumed_at) : endDate;
              const days = differenceInDays(effectiveEnd, startDate) + 1;
              const planned = differenceInDays(endDate, startDate) + 1;

              return (
                <View key={entry.id} style={[styles.historyItem, !isLast && styles.historyItemBorder]}>
                  <View style={[styles.historyDot, { backgroundColor: cfg.dot }]} />
                  <View style={styles.historyItemContent}>
                    <View style={styles.historyDateRow}>
                      <Text style={styles.historyDateRange}>
                        {format(startDate, 'dd MMM yyyy')}
                        {' – '}
                        {format(endDate, 'dd MMM yyyy')}
                      </Text>
                      <View style={[styles.pauseStatusBadge, { backgroundColor: cfg.bg }]}>
                        <Text style={[styles.pauseStatusText, { color: cfg.text }]}>{cfg.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.historyDays}>
                      {pauseStatus === 'cancelled'
                        ? `${planned} day${planned !== 1 ? 's' : ''} planned · cancelled`
                        : wasResumedEarly
                        ? `${days} of ${planned} day${planned !== 1 ? 's' : ''} paused`
                        : pauseStatus === 'scheduled'
                        ? `${planned} day${planned !== 1 ? 's' : ''} planned`
                        : `${days} day${days !== 1 ? 's' : ''} paused`}
                    </Text>
                    {entry.resumed_at && (
                      <Text style={styles.historyResumedAt}>
                        Resumed on {format(new Date(entry.resumed_at), 'dd MMM yyyy')}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
        </>
        )}
      </ScrollView>

      <Modal visible={pauseModal} onClose={() => { setPauseModal(false); setDateError(''); setCustomStartDate(null); setCustomEndDate(null); }} title="Pause Subscription" scrollable>
        <View style={styles.modalContent}>
          {isPastCutoffIST() && (
            <View style={styles.cutoffNotice}>
              <Clock size={14} color={Colors.warning} />
              <Text style={styles.cutoffNoticeText}>{getSubscriptionCutoffNotice()}</Text>
            </View>
          )}

          <View style={styles.pauseModeTabs}>
            <TouchableOpacity
              style={[styles.pauseModeTab, pauseMode === 'fixed' && styles.pauseModeTabActive]}
              onPress={() => { setPauseMode('fixed'); setDateError(''); }}
            >
              <Text style={[styles.pauseModeTabText, pauseMode === 'fixed' && styles.pauseModeTabTextActive]}>
                Fixed Duration
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pauseModeTab, pauseMode === 'custom' && styles.pauseModeTabActive]}
              onPress={() => { setPauseMode('custom'); setDateError(''); }}
            >
              <Text style={[styles.pauseModeTabText, pauseMode === 'custom' && styles.pauseModeTabTextActive]}>
                Custom Dates
              </Text>
            </TouchableOpacity>
          </View>

          {pauseMode === 'fixed' ? (
            <>
              <Text style={styles.modalDesc}>
                Choose how long you'd like to pause. It will resume automatically.
              </Text>
              <View style={styles.pauseOptions}>
                {[1, 2, 3].map((m) => {
                  const pauseStart = getMinSubscriptionStartDate();
                  const resumeDate = addMonths(pauseStart, m);
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[styles.pauseOption, pauseMonths === m && styles.pauseOptionSelected]}
                      onPress={() => setPauseMonths(m)}
                    >
                      <Text style={[styles.pauseOptionText, pauseMonths === m && styles.pauseOptionTextSelected]}>
                        {m} month{m > 1 ? 's' : ''}
                      </Text>
                      <Text style={[styles.pauseOptionDate, pauseMonths === m && { color: Colors.primary }]}>
                        Starts: {format(pauseStart, 'dd MMM yyyy')}
                      </Text>
                      <Text style={[styles.pauseOptionDate, pauseMonths === m && { color: Colors.primary }]}>
                        Resumes: {format(resumeDate, 'dd MMM yyyy')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : (
            <>
              <Text style={styles.modalDesc}>
                Select the exact start and end dates for your pause period.
              </Text>
              <DatePickerField
                label="Start Date"
                value={customStartDate}
                onChange={(d) => { setCustomStartDate(d); setDateError(''); if (customEndDate && isBefore(customEndDate, d)) setCustomEndDate(null); }}
                minDate={getMinSubscriptionStartDate()}
              />
              <DatePickerField
                label="End Date"
                value={customEndDate}
                onChange={(d) => { setCustomEndDate(d); setDateError(''); }}
                minDate={customStartDate ? customStartDate : getMinSubscriptionStartDate()}
              />
              {customStartDate && customEndDate && !isBefore(customEndDate, customStartDate) && (
                <View style={styles.dateSummary}>
                  <Text style={styles.dateSummaryText}>
                    Paused from {format(customStartDate, 'dd MMM yyyy')} to {format(customEndDate, 'dd MMM yyyy')}
                  </Text>
                </View>
              )}
              {dateError ? <Text style={styles.dateError}>{dateError}</Text> : null}
            </>
          )}

          <Button label="Confirm Pause" onPress={handlePause} loading={actionLoading} fullWidth />
        </View>
      </Modal>

      <Modal
        visible={editPauseModal}
        onClose={() => { setEditPauseModal(false); setEditDateError(''); }}
        title="Edit Pause Dates"
        scrollable
      >
        {(() => {
          if (!subscription?.pause_start_date) return null;
          const pauseStarted = subscription.pause_start_date <= toLocalDateStr(new Date());
          return (
            <View style={styles.modalContent}>
              {pauseStarted && (
                <View style={styles.editPauseNotice}>
                  <Clock size={14} color={Colors.warning} />
                  <Text style={styles.editPauseNoticeText}>
                    Pause has already started on {format(new Date(subscription.pause_start_date), 'dd MMM yyyy')}. Only the end date can be changed.
                  </Text>
                </View>
              )}
              {!pauseStarted && (
                <DatePickerField
                  label="Start Date"
                  value={editStartDate}
                  onChange={(d) => {
                    setEditStartDate(d);
                    setEditDateError('');
                    if (editEndDate && isBefore(editEndDate, d)) setEditEndDate(null);
                  }}
                  minDate={getMinSubscriptionStartDate()}
                />
              )}
              <DatePickerField
                label="End Date"
                value={editEndDate}
                onChange={(d) => { setEditEndDate(d); setEditDateError(''); }}
                minDate={
                  pauseStarted
                    ? new Date(subscription.pause_start_date)
                    : editStartDate
                    ? editStartDate
                    : getMinSubscriptionStartDate()
                }
              />
              {editStartDate && editEndDate && !isBefore(editEndDate, editStartDate) && !pauseStarted && (
                <View style={styles.dateSummary}>
                  <Text style={styles.dateSummaryText}>
                    Paused from {format(editStartDate, 'dd MMM yyyy')} to {format(editEndDate, 'dd MMM yyyy')}
                  </Text>
                </View>
              )}
              {pauseStarted && editEndDate && (
                <View style={styles.dateSummary}>
                  <Text style={styles.dateSummaryText}>
                    Paused from {format(new Date(subscription.pause_start_date), 'dd MMM yyyy')} to {format(editEndDate, 'dd MMM yyyy')}
                  </Text>
                </View>
              )}
              {editDateError ? <Text style={styles.dateError}>{editDateError}</Text> : null}
              <Button label="Save Changes" onPress={handleEditPause} loading={actionLoading} fullWidth />
              <Button label="Cancel" onPress={() => setEditPauseModal(false)} variant="outline" fullWidth />
            </View>
          );
        })()}
      </Modal>

      <Modal visible={resumeModal} onClose={() => setResumeModal(false)} title="Resume Subscription">
        <View style={styles.modalContent}>
          {isPastCutoffIST() && (
            <View style={styles.cutoffNotice}>
              <Clock size={14} color={Colors.warning} />
              <Text style={styles.cutoffNoticeText}>{getSubscriptionCutoffNotice()}</Text>
            </View>
          )}
          <Text style={styles.modalDesc}>
            Your subscription will resume from{' '}
            <Text style={{ fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textPrimary }}>
              {format(getMinSubscriptionStartDate(), 'dd MMM yyyy')}
            </Text>
            . Your next delivery will be scheduled from that date.
          </Text>
          <Button label="Confirm Resume" onPress={handleResume} loading={actionLoading} fullWidth />
          <Button label="Cancel" onPress={() => setResumeModal(false)} variant="outline" fullWidth />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  refreshOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.4)',
    zIndex: 10,
  alignItems: 'center',
    justifyContent: 'center',
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
  content: { padding: Spacing[5], gap: Spacing[4] },
  heroCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[5],
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing[3],
    ...Shadow.sm,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroInfo: { gap: 3 },
  planName: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'],
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  planFreq: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    textTransform: 'capitalize',
  },
  heroPrice: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  price: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['3xl'],
    color: Colors.primary,
  },
  pricePer: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[3],
  },
  infoItem: {
    width: '47%',
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing[4],
    gap: Spacing[1],
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 10,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  infoValue: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  renewalBanner: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[3],
    borderWidth: 1,
  },
  renewalBannerWarn: {
    backgroundColor: Colors.warningSurface,
    borderColor: '#F6D860',
  },
  renewalBannerExpired: {
    backgroundColor: Colors.errorSurface,
    borderColor: Colors.errorLight,
  },
  renewalBannerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
  },
  renewalBannerText: { flex: 1, gap: Spacing[1] },
  renewalTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
  },
  renewalSubText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    lineHeight: Typography.size.sm * 1.5,
  },
  pausedBanner: {
    backgroundColor: Colors.warningSurface,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[3],
    borderWidth: 1,
    borderColor: '#F6D860',
  },
  pausedBannerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
  },
  pausedBannerText: { flex: 1, gap: Spacing[2] },
  pausedTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.warning,
  },
  pausedSubText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.warning,
  },
  pauseDatesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    marginTop: 2,
  },
  pauseDateBlock: { gap: 2 },
  pauseDateLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 9,
    color: Colors.warning,
    letterSpacing: 0.6,
    opacity: 0.8,
  },
  pauseDateValue: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.warning,
  },
  pauseDateDivider: {
    width: 16,
    height: 1.5,
    backgroundColor: Colors.warning,
    opacity: 0.4,
    marginTop: 10,
  },
  actionsSection: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  actionsTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    backgroundColor: Colors.neutral[50],
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[4],
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  actionText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  historySection: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  historySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    backgroundColor: Colors.neutral[50],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  historyTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[4],
    gap: Spacing[3],
  },
  historyItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  historyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.neutral[300],
    marginTop: 5,
  },
  historyItemContent: { flex: 1, gap: 4 },
  historyDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  historyDateRange: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  pauseStatusBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
  },
  pauseStatusText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: 10,
  },
  historyResumedAt: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  historyDays: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
  },
  pausedBannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  editPauseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  editPauseBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.warning,
  },
  cancelPauseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  cancelPauseBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.error,
  },
  editPauseNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    backgroundColor: Colors.warningSurface,
    borderRadius: Radius.md,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: '#F6D860',
  },
  editPauseNoticeText: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.warning,
    lineHeight: Typography.size.sm * 1.5,
  },
  pauseDaysRow: {
    marginTop: 4,
  },
  pauseDaysText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.warning,
    opacity: 0.85,
  },
  modalContent: { gap: Spacing[4], paddingBottom: Spacing[2] },
  modalDesc: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    lineHeight: Typography.size.base * 1.6,
  },
  pauseModeTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.neutral[100],
    borderRadius: Radius.md,
    padding: 3,
    gap: 3,
  },
  pauseModeTab: {
    flex: 1,
    paddingVertical: Spacing[2],
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  pauseModeTabActive: {
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  pauseModeTabText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  pauseModeTabTextActive: {
    color: Colors.primaryDark,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  pauseOptions: { gap: Spacing[3] },
  pauseOption: {
    padding: Spacing[4],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 3,
  },
  pauseOptionSelected: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  pauseOptionText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  pauseOptionTextSelected: { color: Colors.primaryDark },
  pauseOptionDate: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  dateSummary: {
    backgroundColor: Colors.primarySurface,
    borderRadius: Radius.md,
    padding: Spacing[3],
  },
  dateSummaryText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.primaryDark,
    textAlign: 'center',
  },
  dateError: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.error,
  },
  cutoffNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    backgroundColor: Colors.warningSurface,
    borderRadius: Radius.md,
    padding: Spacing[3],
  },
  cutoffNoticeText: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.warning,
    lineHeight: Typography.size.sm * 1.5,
  },
  renewalHistoryDate: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  renewalHistoryPeriod: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  renewalHistoryAmount: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.primary,
    marginTop: 2,
  },
  renewalHistoryRef: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  viewReceiptBtn: {
    marginTop: Spacing[2],
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignSelf: 'flex-start',
  },
  viewReceiptBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.primary,
  },
  pauseExtensionCard: {
    backgroundColor: Colors.warningSurface,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#F6D860',
    gap: Spacing[3],
  },
  pauseExtensionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  pauseExtensionTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.warning,
  },
  pauseExtensionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  pauseExtensionDateBlock: {
    flex: 1,
    gap: 3,
  },
  pauseExtensionLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 9,
    color: Colors.warning,
    letterSpacing: 0.5,
    opacity: 0.75,
    textTransform: 'uppercase',
  },
  pauseExtensionDateOld: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.warning,
    opacity: 0.6,
    textDecorationLine: 'line-through',
  },
  pauseExtensionDateNew: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.warning,
  },
  pauseExtensionArrow: {
    paddingHorizontal: Spacing[1],
  },
  pauseExtensionArrowText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.lg,
    color: Colors.warning,
    opacity: 0.5,
  },
  pauseExtensionPill: {
    backgroundColor: Colors.warning + '18',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: 4,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.warning + '30',
  },
  pauseExtensionPillText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 11,
    color: Colors.warning,
  },
  renewedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
    backgroundColor: Colors.successSurface,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.success + '40',
  },
  renewedBannerText: { flex: 1, gap: Spacing[1] },
  renewedTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.success,
  },
  renewedSubText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.success,
    lineHeight: Typography.size.sm * 1.5,
    opacity: 0.85,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[2],
    gap: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  tabTextActive: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  invoiceCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing[4],
    backgroundColor: Colors.neutral[50],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  invoiceHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  invoiceIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invoiceType: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  invoiceDate: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  invoiceAmount: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
  },
  invoiceBody: {
    padding: Spacing[4],
    gap: Spacing[3],
  },
  invoiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  invoiceRowLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  invoiceRowValue: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    flex: 1,
    textAlign: 'right',
  },
  invoiceFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  invoiceReceiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  invoiceReceiptBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.primary,
  },
  invoiceStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
  },
  invoiceStatusSuccess: {
    backgroundColor: Colors.successSurface,
  },
  invoiceStatusPending: {
    backgroundColor: Colors.warningSurface,
  },
  invoiceStatusFailed: {
    backgroundColor: Colors.errorSurface,
  },
  invoiceStatusText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 10,
  },
  invoiceEmpty: {
    alignItems: 'center',
    paddingVertical: Spacing[10],
    gap: Spacing[3],
  },
  invoiceEmptyText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});
