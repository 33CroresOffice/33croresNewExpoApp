import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ClipboardList,
  ChevronRight,
  RefreshCw,
  Calendar,
  CreditCard,
  Flower2,
  CirclePause as PauseCircle,
  CircleCheck as CheckCircle2,
  TriangleAlert as AlertTriangle,
} from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Order, Subscription, SubscriptionRenewalHistory } from '@/types/database';
import StatusChip from '@/components/ui/StatusChip';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/SkeletonLoader';
import { format, differenceInDays, parseISO } from 'date-fns';
import { getEffectiveStatus } from '@/utils/subscriptionStatus';

const C = Colors;

type Tab = 'upcoming' | 'past' | 'custom' | 'renewals';

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [customOrders, setCustomOrders] = useState<any[]>([]);
  const [renewals, setRenewals] = useState<SubscriptionRenewalHistory[]>([]);
  const [activeSubs, setActiveSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('upcoming');

  const load = async () => {
    if (!profile) return;
    const { data: { user } } = await supabase.auth.getUser();
    const uid = user?.id ?? profile.id;
    const [ordersRes, customRes, renewalsRes, subsRes] = await Promise.all([
      supabase
        .from('orders')
        .select('*, subscription:subscriptions(*, plan:subscription_plans(*))')
        .eq('user_id', uid)
        .order('scheduled_date', { ascending: false }),
      supabase
        .from('custom_orders')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false }),
      supabase
        .from('subscription_renewal_history')
        .select('*, plan:subscription_plans(*)')
        .eq('user_id', uid)
        .order('renewed_at', { ascending: false }),
      supabase
        .from('subscriptions')
        .select('*, plan:subscription_plans(*)')
        .eq('user_id', uid)
        .in('status', ['active', 'paused'])
        .order('created_at', { ascending: false }),
    ]);
    if (ordersRes.data) setOrders(ordersRes.data as Order[]);
    if (customRes.data) setCustomOrders(customRes.data);
    if (renewalsRes.data) setRenewals(renewalsRes.data as SubscriptionRenewalHistory[]);
    if (subsRes.data) setActiveSubs(subsRes.data as Subscription[]);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, [profile]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filteredOrders = orders.filter((o) => {
    const d = new Date(o.scheduled_date);
    d.setHours(0, 0, 0, 0);
    if (activeTab === 'upcoming') return d >= today || o.status === 'out_for_delivery';
    if (activeTab === 'past') return o.status === 'delivered';
    return false;
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past', label: 'Past' },
    { key: 'custom', label: 'Custom' },
    { key: 'renewals', label: 'Renewals' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>My Orders</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing[8] }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={C.primary}
          />
        }
      >
        {/* Active subscriptions strip */}
        {!loading && activeSubs.length > 0 && (
          <View style={styles.activeSubsSection}>
            <Text style={styles.activeSubsLabel}>Active Subscriptions</Text>
            {activeSubs.map((sub) => {
              const effectiveStatus = getEffectiveStatus(sub as any);
              const isPaused = effectiveStatus === 'paused';
              const isScheduledPause = effectiveStatus === 'scheduled_pause';
              const endDate = sub.end_date ? parseISO(sub.end_date) : null;
              const daysLeft = endDate ? differenceInDays(endDate, today) : null;
              const isUrgent = daysLeft != null && daysLeft <= 5;

              const statusColor = isPaused ? '#B45309' : isScheduledPause ? '#B45309' : C.primary;
              const statusBg = isPaused ? '#FEF3C7' : isScheduledPause ? '#FEF3C7' : C.primarySurface;
              const statusLabel = isPaused ? 'Paused' : isScheduledPause ? 'Pause Scheduled' : 'Active';

              const nextInfo = (() => {
                if (isPaused && sub.pause_until) return `Resumes ${format(new Date(sub.pause_until), 'dd MMM yyyy')}`;
                if (isScheduledPause && sub.pause_start_date) return `Pauses ${format(new Date(sub.pause_start_date), 'dd MMM yyyy')}`;
                if (sub.next_delivery_date) return `Next: ${format(new Date(sub.next_delivery_date), 'dd MMM yyyy')}`;
                return null;
              })();

              return (
                <TouchableOpacity
                  key={sub.id}
                  style={styles.activeSubCard}
                  onPress={() => router.push({ pathname: '/(customer)/subscription-detail', params: { id: sub.id } })}
                  activeOpacity={0.88}
                >
                  {/* Hero image */}
                  <Image
                    source={{ uri: (sub as any).plan?.image_url ?? 'https://images.pexels.com/photos/931177/pexels-photo-931177.jpeg?auto=compress&cs=tinysrgb&w=800' }}
                    style={styles.activeSubImg}
                    resizeMode="cover"
                  />

                  {/* Card body */}
                  <View style={styles.activeSubBody}>
                    <View style={styles.activeSubRow}>
                      <Text style={styles.activeSubName} numberOfLines={1}>{(sub as any).plan?.name}</Text>
                      <View style={[styles.activeSubBadge, { backgroundColor: statusBg }]}>
                        {isPaused || isScheduledPause
                          ? <PauseCircle size={10} color={statusColor} strokeWidth={2.2} />
                          : <CheckCircle2 size={10} color={statusColor} strokeWidth={2.2} />}
                        <Text style={[styles.activeSubBadgeText, { color: statusColor }]}>{statusLabel}</Text>
                      </View>
                      <ChevronRight size={14} color={C.textTertiary} strokeWidth={1.8} />
                    </View>

                    <Text style={styles.activeSubFreq}>
                      {(sub as any).plan?.frequency?.charAt(0).toUpperCase()}{(sub as any).plan?.frequency?.slice(1)} · ₹{((sub as any).plan?.price / 100).toLocaleString('en-IN')}/mo
                    </Text>

                    <View style={styles.activeSubDivider} />

                    <View style={styles.activeSubMeta}>
                      <View style={styles.activeSubMetaBlock}>
                        <Text style={styles.activeSubMetaLabel}>Started</Text>
                        <Text style={styles.activeSubMetaValue}>{format(new Date(sub.start_date), 'dd MMM yyyy')}</Text>
                      </View>
                      {endDate && (
                        <View style={styles.activeSubMetaBlock}>
                          <Text style={styles.activeSubMetaLabel}>End Date</Text>
                          <Text style={styles.activeSubMetaValue}>{format(endDate, 'dd MMM yyyy')}</Text>
                        </View>
                      )}
                      {daysLeft != null && daysLeft >= 0 && (
                        <View style={[styles.activeSubDaysChip, isUrgent ? styles.activeSubDaysChipUrgent : styles.activeSubDaysChipNormal]}>
                          <Text style={[styles.activeSubDaysText, isUrgent ? styles.activeSubDaysTextUrgent : styles.activeSubDaysTextNormal]}>
                            {daysLeft === 0 ? 'Last day' : `${daysLeft}d left`}
                          </Text>
                        </View>
                      )}
                    </View>

                    {nextInfo && (
                      <View style={styles.activeSubNextRow}>
                        <View style={[styles.activeSubNextDot, { backgroundColor: statusColor }]} />
                        <Text style={[styles.activeSubNextText, { color: statusColor }]}>{nextInfo}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Tabs */}
        <View style={styles.tabs}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab content */}
        <View style={styles.tabContent}>
          {loading ? (
            <View style={styles.skeletonList}>
              {[1, 2, 3].map((k) => (
                <View key={k} style={{ gap: 8 }}>
                  <Skeleton height={80} borderRadius={12} />
                </View>
              ))}
            </View>
          ) : activeTab === 'custom' ? (
            customOrders.length === 0 ? (
              <EmptyState
                icon={<Flower2 size={52} color={C.neutral[400]} />}
                title="No custom orders yet"
                description="Place a custom flower or garland order for any occasion"
                actionLabel="Create Custom Order"
                onAction={() => router.push('/(customer)/custom-order')}
              />
            ) : (
              <View style={styles.list}>
                {customOrders.map((order) => (
                  <TouchableOpacity
                    key={order.id}
                    style={styles.customCard}
                    onPress={() => router.push({ pathname: '/(customer)/custom-order-detail', params: { id: order.id } })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.customCardTop}>
                      <View style={styles.customIconWrap}>
                        <Flower2 size={18} color={C.primary} />
                      </View>
                      <View style={styles.customCardInfo}>
                        <Text style={styles.customCardTitle}>
                          {order.order_type === 'garland' ? 'Garland Order' : 'Flower Order'}
                        </Text>
                        <Text style={styles.customCardDate}>
                          Delivery: {format(new Date(order.delivery_date), 'dd MMM yyyy')} · {order.delivery_time}
                        </Text>
                      </View>
                      <StatusChip status={order.status} />
                    </View>
                    <View style={styles.customItemsList}>
                      {(order.items as any[]).map((item: any, i: number) => (
                        <View key={i} style={styles.customItem}>
                          <View style={styles.customItemDot} />
                          <Text style={styles.customItemText}>
                            {item.flower_name} — {item.quantity} {item.unit}
                          </Text>
                        </View>
                      ))}
                    </View>
                    {order.special_instructions ? (
                      <Text style={styles.customNote} numberOfLines={2}>
                        Note: {order.special_instructions}
                      </Text>
                    ) : null}
                    <View style={styles.customFooter}>
                      <Text style={styles.customCreated}>
                        Placed {format(new Date(order.created_at), 'dd MMM yyyy, hh:mm a')}
                      </Text>
                      <ChevronRight size={14} color={C.textTertiary} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )
          ) : activeTab === 'renewals' ? (
            renewals.length === 0 ? (
              <EmptyState
                icon={<RefreshCw size={52} color={C.neutral[400]} />}
                title="No renewals yet"
                description="Your subscription renewal history will appear here"
              />
            ) : (
              <View style={styles.list}>
                {renewals.map((renewal) => (
                  <View key={renewal.id} style={styles.renewalCard}>
                    <View style={styles.renewalHeader}>
                      <View style={styles.renewalIconWrap}>
                        <RefreshCw size={16} color={C.primary} />
                      </View>
                      <View style={styles.renewalHeaderText}>
                        <Text style={styles.renewalPlan}>
                          {(renewal as any).plan?.name ?? 'Subscription Renewed'}
                        </Text>
                        <Text style={styles.renewalDate}>
                          {format(new Date(renewal.renewed_at), 'dd MMM yyyy, hh:mm a')}
                        </Text>
                      </View>
                      {renewal.amount_paid != null && (
                        <View style={styles.renewalAmountBadge}>
                          <Text style={styles.renewalAmount}>
                            ₹{(renewal.amount_paid / 100).toLocaleString('en-IN')}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.renewalDivider} />

                    <View style={styles.renewalDates}>
                      {renewal.old_end_date && (
                        <View style={styles.renewalDateBlock}>
                          <Calendar size={13} color={C.textTertiary} />
                          <Text style={styles.renewalDateLabel}>Previous End</Text>
                          <Text style={styles.renewalDateValue}>
                            {format(new Date(renewal.old_end_date), 'dd MMM yyyy')}
                          </Text>
                        </View>
                      )}
                      {renewal.new_start_date && (
                        <View style={styles.renewalDateBlock}>
                          <Calendar size={13} color={C.primary} />
                          <Text style={styles.renewalDateLabel}>New Start</Text>
                          <Text style={[styles.renewalDateValue, { color: C.primary }]}>
                            {format(new Date(renewal.new_start_date), 'dd MMM yyyy')}
                          </Text>
                        </View>
                      )}
                      {renewal.new_end_date && (
                        <View style={styles.renewalDateBlock}>
                          <Calendar size={13} color={C.textTertiary} />
                          <Text style={styles.renewalDateLabel}>New End</Text>
                          <Text style={styles.renewalDateValue}>
                            {format(new Date(renewal.new_end_date), 'dd MMM yyyy')}
                          </Text>
                        </View>
                      )}
                    </View>

                    {renewal.razorpay_payment_id && (
                      <View style={styles.paymentRef}>
                        <CreditCard size={12} color={C.textTertiary} />
                        <Text style={styles.paymentRefText} numberOfLines={1}>
                          Ref: {renewal.razorpay_payment_id}
                        </Text>
                      </View>
                    )}

                    <TouchableOpacity
                      style={styles.viewReceiptBtn}
                      onPress={() => router.push({
                        pathname: '/(customer)/receipt',
                        params: { type: 'renewal', renewalId: renewal.id },
                      })}
                    >
                      <Text style={styles.viewReceiptBtnText}>View Receipt</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )
          ) : filteredOrders.length === 0 ? (
            <EmptyState
              icon={<ClipboardList size={52} color={C.neutral[400]} />}
              title={activeTab === 'upcoming' ? 'No upcoming deliveries' : 'No completed deliveries'}
              description={
                activeTab === 'upcoming'
                  ? 'Subscribe to a plan to start receiving fresh flowers'
                  : 'Your completed delivery history will appear here'
              }
              actionLabel={activeTab === 'upcoming' ? 'Browse Plans' : undefined}
              onAction={activeTab === 'upcoming' ? () => router.push('/(customer)/plans') : undefined}
            />
          ) : (
            <View style={styles.list}>
              {filteredOrders.map((order) => (
                <TouchableOpacity
                  key={order.id}
                  style={styles.orderCard}
                  onPress={() => router.push({ pathname: '/(customer)/order-detail', params: { id: order.id } })}
                  activeOpacity={0.85}
                >
                  <View style={styles.orderLeft}>
                    <View style={styles.dateBlock}>
                      <Text style={styles.dateDay}>
                        {format(new Date(order.scheduled_date), 'dd')}
                      </Text>
                      <Text style={styles.dateMonth}>
                        {format(new Date(order.scheduled_date), 'MMM')}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.orderBody}>
                    <Text style={styles.orderPlan} numberOfLines={1}>
                      {(order.subscription as any)?.plan?.name ?? 'Subscription'}
                    </Text>
                    <Text style={styles.orderDate}>
                      {format(new Date(order.scheduled_date), 'EEEE, dd MMM yyyy')}
                    </Text>
                    <StatusChip status={order.status} />
                  </View>

                  <ChevronRight size={18} color={C.neutral[400]} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: {
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.white,
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'],
    color: C.textPrimary,
    letterSpacing: -0.3,
  },
  scrollContent: {
    paddingBottom: Spacing[8],
  },

  // Active subscription cards
  activeSubsSection: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[5],
    paddingBottom: Spacing[2],
    gap: Spacing[3],
  },
  activeSubsLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 11,
    color: C.primary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  activeSubCard: {
    backgroundColor: C.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    ...Shadow.md,
  },
  activeSubImg: {
    width: '100%',
    height: 130,
  },
  activeSubBody: {
    padding: Spacing[4],
    gap: 6,
  },
  activeSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeSubName: {
    flex: 1,
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.base,
    color: C.textPrimary,
    letterSpacing: -0.2,
  },
  activeSubBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  activeSubBadgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 10,
    letterSpacing: 0.2,
  },
  activeSubFreq: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: C.textTertiary,
    textTransform: 'capitalize',
  },
  activeSubDivider: {
    height: 1,
    backgroundColor: C.divider,
    marginVertical: 2,
  },
  activeSubMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
  },
  activeSubMetaBlock: {
    gap: 2,
  },
  activeSubMetaLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 10,
    color: C.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  activeSubMetaValue: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: C.textPrimary,
  },
  activeSubDaysChip: {
    marginLeft: 'auto' as any,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  activeSubDaysChipNormal: {
    backgroundColor: C.primarySurface,
  },
  activeSubDaysChipUrgent: {
    backgroundColor: '#FEF3C7',
  },
  activeSubDaysText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 11,
  },
  activeSubDaysTextNormal: {
    color: C.primaryDark,
  },
  activeSubDaysTextUrgent: {
    color: '#92400E',
  },
  activeSubNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeSubNextDot: {
    width: 5,
    height: 5,
    borderRadius: Radius.full,
  },
  activeSubNextText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: 11,
  },

  // Tabs
  tabs: {
    flexDirection: 'row',
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginTop: Spacing[4],
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing[3],
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: C.primary },
  tabText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: C.textTertiary,
  },
  tabTextActive: {
    color: C.primary,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  tabContent: {
    padding: Spacing[5],
    gap: Spacing[3],
  },
  skeletonList: { gap: Spacing[3] },
  list: { gap: Spacing[3] },

  // Order cards
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
    backgroundColor: C.white,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: C.border,
    ...Shadow.sm,
  },
  orderLeft: {},
  dateBlock: {
    width: 44,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: C.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  dateDay: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    color: C.primary,
    lineHeight: 24,
  },
  dateMonth: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: 10,
    color: C.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  orderBody: { flex: 1, gap: 4 },
  orderPlan: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: C.textPrimary,
  },
  orderDate: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: C.textTertiary,
  },

  // Renewal cards
  renewalCard: {
    backgroundColor: C.white,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: C.border,
    gap: Spacing[3],
    ...Shadow.sm,
  },
  renewalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  renewalIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: C.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  renewalHeaderText: { flex: 1, gap: 3 },
  renewalPlan: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: C.textPrimary,
  },
  renewalDate: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: C.textTertiary,
  },
  renewalAmountBadge: {
    backgroundColor: C.successSurface,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1],
  },
  renewalAmount: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: C.success,
  },
  renewalDivider: { height: 1, backgroundColor: C.divider },
  renewalDates: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  renewalDateBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  renewalDateLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 10,
    color: C.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  renewalDateValue: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: C.textPrimary,
    textAlign: 'center',
  },
  paymentRef: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: C.neutral[50],
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
  },
  paymentRefText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: C.textTertiary,
    flex: 1,
  },
  viewReceiptBtn: {
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.primary,
    alignSelf: 'flex-start',
  },
  viewReceiptBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: C.primary,
  },

  // Custom order cards
  customCard: {
    backgroundColor: C.white,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: C.border,
    gap: Spacing[3],
    ...Shadow.sm,
  },
  customCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
  },
  customIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: C.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customCardInfo: { flex: 1, gap: 3 },
  customCardTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: C.textPrimary,
  },
  customCardDate: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: C.textTertiary,
    lineHeight: 16,
  },
  customItemsList: {
    gap: Spacing[1],
    paddingLeft: Spacing[2],
    borderLeftWidth: 2,
    borderLeftColor: C.primaryLight,
  },
  customItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  customItemDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.primary,
  },
  customItemText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: C.textSecondary,
  },
  customNote: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: C.textTertiary,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  customFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  customCreated: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 11,
    color: C.textDisabled,
  },
});
