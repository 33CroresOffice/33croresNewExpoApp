import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronRight, Layers } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { SubscriptionPlan } from '@/types/database';
import { SkeletonCard } from '@/components/ui/SkeletonLoader';
import Badge from '@/components/ui/Badge';

export default function PlansScreen() {
  const insets = useSafeAreaInsets();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .eq('show_in_customer_plans', true)
      .order('sort_order');
    if (data) setPlans(data);
    setLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const formatPrice = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

  const frequencyLabel: Record<string, string> = {
    weekly: 'Weekly',
    biweekly: 'Every 2 weeks',
    monthly: 'Monthly',
    '3months': 'Every 3 months',
    '6months': 'Every 6 months',
  };

  const badgeVariant: Record<string, 'neutral' | 'primary' | 'secondary'> = {
    monthly: 'neutral',
    biweekly: 'primary',
    weekly: 'secondary',
    '3months': 'neutral',
    '6months': 'neutral',
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Layers size={22} color={Colors.primary} strokeWidth={1.8} />
          <Text style={styles.title}>Plans</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing[5] }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={Colors.primary}
          />
        }
      >
        <View style={styles.heroSection}>
          <Text style={styles.heroTitle}>Fresh flowers,{'\n'}your way</Text>
          <Text style={styles.subtitle}>
            Choose a plan that suits your lifestyle. Cancel or pause anytime.
          </Text>
        </View>

        {loading ? (
          <View style={styles.list}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : plans.length === 0 ? (
          <View style={styles.emptyState}>
            <Layers size={48} color={Colors.textDisabled} strokeWidth={1.2} />
            <Text style={styles.emptyTitle}>No plans available</Text>
            <Text style={styles.emptySubtitle}>Check back soon for new subscription plans.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {plans.map((plan, index) => (
              <TouchableOpacity
                key={plan.id}
                style={[styles.planCard, index === 1 && styles.featuredCard]}
                onPress={() => router.push({ pathname: '/(customer)/plan-detail', params: { id: plan.id } })}
                activeOpacity={0.88}
              >
                {index === 1 && (
                  <View style={styles.featuredBadge}>
                    <Text style={styles.featuredBadgeText}>Most Popular</Text>
                  </View>
                )}

                <Image
                  source={{
                    uri: plan.image_url ??
                      'https://images.pexels.com/photos/931177/pexels-photo-931177.jpeg?auto=compress&cs=tinysrgb&w=600',
                  }}
                  style={styles.planImage}
                  resizeMode="cover"
                />

                <View style={styles.planBody}>
                  <View style={styles.planTop}>
                    <View style={styles.planTitleRow}>
                      <Text style={styles.planName}>{plan.name}</Text>
                      <Badge
                        label={frequencyLabel[plan.frequency] ?? plan.frequency}
                        variant={badgeVariant[plan.frequency] ?? 'neutral'}
                      />
                    </View>

                    <View style={styles.priceRow}>
                      <Text style={styles.price}>{formatPrice(plan.price)}</Text>
                      <Text style={styles.pricePer}>/month</Text>
                      {plan.mrp_price > plan.price && (
                        <Text style={styles.mrpPrice}>
                          {formatPrice(plan.mrp_price)}
                        </Text>
                      )}
                    </View>

                    <Text style={styles.planDesc} numberOfLines={2}>
                      {plan.description}
                    </Text>
                  </View>

                  <View style={styles.featuresList}>
                    {(plan.features as string[]).slice(0, 4).map((feat) => (
                      <View key={feat} style={styles.featureItem}>
                        <Check size={13} color={Colors.primary} strokeWidth={2.5} />
                        <Text style={styles.featureText}>{feat}</Text>
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={[styles.selectBtn, index === 1 && styles.selectBtnFeatured]}
                    onPress={() =>
                      router.push({ pathname: '/(customer)/plan-detail', params: { id: plan.id } })
                    }
                  >
                    <Text style={[styles.selectBtnText, index === 1 && styles.selectBtnTextFeatured]}>
                      View Details
                    </Text>
                    <ChevronRight size={16} color={index === 1 ? Colors.white : Colors.primary} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.guarantee}>
          <Text style={styles.guaranteeText}>
            Free delivery · Eco-friendly packaging · Cancel anytime
          </Text>
        </View>

        <View style={{ height: Spacing[8] }} />
      </ScrollView>
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    color: Colors.textPrimary,
  },
  content: { padding: Spacing[5], gap: Spacing[5] },
  heroSection: { gap: Spacing[2] },
  heroTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['3xl'],
    color: Colors.textPrimary,
    lineHeight: Typography.size['3xl'] * 1.2,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    lineHeight: Typography.size.base * 1.6,
  },
  list: { gap: Spacing[4] },
  planCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  featuredCard: {
    borderColor: Colors.primary,
    borderWidth: 2,
    ...Shadow.md,
  },
  featuredBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing[4],
    paddingVertical: 6,
    alignItems: 'center',
  },
  featuredBadgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.white,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  planImage: { width: '100%', height: 160 },
  planBody: { padding: Spacing[4], gap: Spacing[4] },
  planTop: { gap: Spacing[2] },
  planTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planName: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
    flex: 1,
    marginRight: Spacing[2],
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  price: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'],
    color: Colors.primary,
  },
  pricePer: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  mrpPrice: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textDisabled,
    textDecorationLine: 'line-through',
    marginLeft: Spacing[1],
  },
  planDesc: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    lineHeight: Typography.size.sm * 1.6,
  },
  featuresList: { gap: Spacing[2] },
  featureItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  featureText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    flex: 1,
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[1],
    paddingVertical: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  selectBtnFeatured: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  selectBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.primary,
  },
  selectBtnTextFeatured: { color: Colors.white },
  guarantee: {
    padding: Spacing[4],
    backgroundColor: Colors.primarySurface,
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  guaranteeText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.primaryDark,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing[16],
    gap: Spacing[3],
  },
  emptyTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
  },
  emptySubtitle: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});
