import React, { useEffect, useState, useCallback } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Package, ChevronRight, TriangleAlert as AlertTriangle, RotateCcw, History, Flower2 } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Subscription } from '@/types/database';
import StatusChip from '@/components/ui/StatusChip';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/SkeletonLoader';
import { format, differenceInDays, parseISO } from 'date-fns';
import { getEffectiveStatus } from '@/utils/subscriptionStatus';

function getRenewalState(sub: Subscription): 'expired' | 'grace' | 'warning' | null {
  if (sub.status === 'renewed' || sub.status === 'cancelled') return null;
  const effectiveEndDate = sub.new_end_date ?? sub.end_date;
  if (!effectiveEndDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = parseISO(effectiveEndDate);
  const daysLeft = differenceInDays(end, today);

  if (sub.status === 'expired') return 'expired';
  if (daysLeft < 0 && daysLeft >= -2) return 'grace';
  if (daysLeft >= 0 && daysLeft <= 5) return 'warning';
  return null;
}

function isPastSubscription(sub: Subscription): boolean {
  return sub.status === 'expired' || sub.status === 'cancelled' || sub.status === 'renewed';
}

export default function SubscriptionsScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [customOrders, setCustomOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [topTab, setTopTab] = useState<'subscription' | 'customize'>('subscription');

  const load = async () => {
    if (!profile) return;
    const { data: { user } } = await supabase.auth.getUser();
    const uid = user?.id ?? profile.id;
    const [subsRes, customRes] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('*, plan:subscription_plans(*), delivery_address:addresses(*)')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('custom_orders')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false }),
    ]);
    if (subsRes.data) setSubscriptions(subsRes.data as Subscription[]);
    if (customRes.data) setCustomOrders(customRes.data);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, [profile]);

  useFocusEffect(
    useCallback(() => {
      if (!loading) load();
    }, [profile])
  );

  const formatPrice = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

  const frequencyLabel: Record<string, string> = {
    weekly: 'Weekly',
    biweekly: 'Bi-weekly',
    monthly: 'Monthly',
  };

  const getDaysLeftLabel = (endDate: string): string => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = parseISO(endDate);
    const daysLeft = differenceInDays(end, today);
    if (daysLeft === 0) return 'Expires today';
    if (daysLeft === 1) return '1 day left';
    if (daysLeft > 1) return `${daysLeft} days left`;
    if (daysLeft === -1) return '1 day past end (grace period)';
    return `${Math.abs(daysLeft)} days past end (grace period)`;
  };

  const activeSubscriptions = subscriptions.filter((s) => !isPastSubscription(s));
  const pastSubscriptions = subscriptions.filter((s) => isPastSubscription(s));

  const renderCard = (sub: Subscription, dimmed = false) => {
    const effectiveStatus = getEffectiveStatus(sub);
    const renewalState = getRenewalState(sub);
    const isExpiredState = renewalState === 'expired';
    const needsRenewal = renewalState === 'grace' || renewalState === 'warning' || isExpiredState;

    return (
      <TouchableOpacity
        key={sub.id}
        style={[styles.card, dimmed && styles.cardPast]}
        onPress={() => router.push({ pathname: '/(customer)/subscription-detail', params: { id: sub.id } })}
        activeOpacity={0.85}
      >
        <Image
          source={{ uri: sub.plan?.image_url ?? 'https://images.pexels.com/photos/931177/pexels-photo-931177.jpeg?auto=compress&cs=tinysrgb&w=400' }}
          style={[styles.cardImage, dimmed && styles.cardImagePast]}
          resizeMode="cover"
        />
        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.cardTitle, dimmed && styles.cardTitlePast]}>{sub.plan?.name}</Text>
              {!isExpiredState && <StatusChip status={effectiveStatus} />}
            </View>
            <Text style={styles.cardFreq}>
              {frequencyLabel[sub.plan?.frequency ?? 'monthly']} • {formatPrice(sub.plan?.price ?? 0)}/mo
            </Text>
          </View>

          {needsRenewal && (sub.new_end_date ?? sub.end_date) && (
            <View style={[
              styles.renewalBanner,
              isExpiredState ? styles.renewalBannerExpired : styles.renewalBannerWarn,
            ]}>
              <AlertTriangle
                size={14}
                color={isExpiredState ? Colors.error : Colors.warning}
              />
              <Text style={[
                styles.renewalBannerText,
                { color: isExpiredState ? Colors.error : Colors.warning },
              ]}>
                {isExpiredState ? 'Subscription expired' : getDaysLeftLabel(sub.new_end_date ?? sub.end_date!)}
              </Text>
              <TouchableOpacity
                style={[styles.renewBtn, isExpiredState ? styles.renewBtnError : styles.renewBtnWarn]}
                onPress={() => router.push({
                  pathname: '/(customer)/checkout',
                  params: { planId: sub.plan_id, renewFromSubscriptionId: sub.id },
                })}
              >
                <RotateCcw size={11} color={Colors.white} />
                <Text style={styles.renewBtnText}>Renew</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.cardDivider} />

          <View style={styles.cardMeta}>
            {sub.start_date && (
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Started</Text>
                <Text style={styles.metaValue}>
                  {format(parseISO(sub.start_date), 'dd MMM yyyy')}
                </Text>
              </View>
            )}
            {(sub.new_end_date ?? sub.end_date) && (
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>{dimmed ? 'Ended' : 'New End Date'}</Text>
                <Text style={[
                  styles.metaValue,
                  needsRenewal && { color: isExpiredState ? Colors.error : Colors.warning },
                ]}>
                  {format(parseISO(sub.new_end_date ?? sub.end_date!), 'dd MMM yyyy')}
                </Text>
              </View>
            )}
          </View>
        </View>
        <ChevronRight size={18} color={Colors.neutral[400]} style={styles.chevron} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>My Orders</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => topTab === 'subscription' ? router.push('/(customer)/plans') : router.push('/(customer)/custom-order')}
        >
          <Plus size={18} color={Colors.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.topTabs}>
        <TouchableOpacity
          style={[styles.topTab, topTab === 'subscription' && styles.topTabActive]}
          onPress={() => setTopTab('subscription')}
        >
          <Text style={[styles.topTabText, topTab === 'subscription' && styles.topTabTextActive]}>Subscription</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.topTab, topTab === 'customize' && styles.topTabActive]}
          onPress={() => setTopTab('customize')}
        >
          <Text style={[styles.topTabText, topTab === 'customize' && styles.topTabTextActive]}>Customize</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing[5] }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {topTab === 'subscription' ? (
          loading ? (
            <View style={styles.skeletonList}>
              {[1, 2].map((k) => (
                <View key={k} style={styles.skeletonCard}>
                  <Skeleton height={120} borderRadius={12} />
                  <View style={{ padding: Spacing[4], gap: 8 }}>
                    <Skeleton height={18} width="55%" />
                    <Skeleton height={13} width="75%" />
                    <Skeleton height={13} width="45%" />
                  </View>
                </View>
              ))}
            </View>
          ) : subscriptions.length === 0 ? (
            <EmptyState
              icon={<Package size={52} color={Colors.neutral[400]} />}
              title="No subscriptions yet"
              description="Choose a plan and start receiving beautiful fresh flowers at your door"
              actionLabel="Browse Plans"
              onAction={() => router.push('/(customer)/plans')}
            />
          ) : (
            <View style={styles.list}>
              {activeSubscriptions.map((sub) => renderCard(sub, false))}

              <TouchableOpacity style={styles.newSubBtn} onPress={() => router.push('/(customer)/plans')}>
                <Plus size={18} color={Colors.primary} />
                <Text style={styles.newSubBtnText}>Add another subscription</Text>
              </TouchableOpacity>

              {pastSubscriptions.length > 0 && (
                <View style={styles.pastSection}>
                  <View style={styles.pastSectionHeader}>
                    <History size={15} color={Colors.textTertiary} />
                    <Text style={styles.pastSectionTitle}>Past Subscriptions</Text>
                  </View>
                  {pastSubscriptions.map((sub) => renderCard(sub, true))}
                </View>
              )}
            </View>
          )
        ) : loading ? (
          <View style={styles.skeletonList}>
            {[1, 2].map((k) => (
              <Skeleton key={k} height={80} borderRadius={12} />
            ))}
          </View>
        ) : customOrders.length === 0 ? (
          <EmptyState
            icon={<Flower2 size={52} color={Colors.neutral[400]} />}
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
                    <Flower2 size={18} color={Colors.primary} />
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
                    Placed {format(new Date(order.created_at), 'dd MMM yyyy')}
                  </Text>
                  <ChevronRight size={14} color={Colors.textTertiary} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'],
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: Spacing[5], gap: Spacing[4] },
  topTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  topTab: {
    flex: 1,
    paddingVertical: Spacing[3],
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  topTabActive: { borderBottomColor: Colors.primary },
  topTabText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  topTabTextActive: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  customCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.border,
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
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customCardInfo: { flex: 1, gap: 3 },
  customCardTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  customCardDate: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    lineHeight: 16,
  },
  customItemsList: {
    gap: Spacing[1],
    paddingLeft: Spacing[2],
    borderLeftWidth: 2,
    borderLeftColor: Colors.primaryLight,
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
    backgroundColor: Colors.primary,
  },
  customItemText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  customNote: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
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
    color: Colors.textDisabled,
  },
  skeletonList: { gap: Spacing[4] },
  skeletonCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  list: { gap: Spacing[4] },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  cardPast: {
    borderColor: Colors.neutral[200],
    opacity: 0.8,
  },
  cardImage: { width: '100%', height: 120 },
  cardImagePast: { opacity: 0.45 },
  cardBody: { padding: Spacing[4], gap: Spacing[3] },
  cardTop: { gap: Spacing[1] },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.md,
    color: Colors.textPrimary,
  },
  cardTitlePast: {
    color: Colors.textSecondary,
  },
  cardFreq: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  renewalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
  },
  renewalBannerWarn: {
    backgroundColor: Colors.warningSurface,
  },
  renewalBannerExpired: {
    backgroundColor: Colors.errorSurface,
  },
  renewalBannerText: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
  },
  renewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing[2],
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  renewBtnWarn: { backgroundColor: Colors.warning },
  renewBtnError: { backgroundColor: Colors.error },
  renewBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 10,
    color: Colors.white,
  },
  cardDivider: { height: 1, backgroundColor: Colors.divider },
  cardMeta: { flexDirection: 'row', gap: Spacing[6] },
  metaItem: { gap: 2 },
  metaLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  metaValue: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    maxWidth: 130,
  },
  chevron: { position: 'absolute', right: Spacing[4], top: '50%' },
  newSubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    padding: Spacing[4],
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
  },
  newSubBtnText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.base,
    color: Colors.primary,
  },
  pastSection: { gap: Spacing[3] },
  pastSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[1],
  },
  pastSectionTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
