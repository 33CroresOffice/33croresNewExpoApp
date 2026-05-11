import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Check, Package, Truck } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { SubscriptionPlan } from '@/types/database';
import Button from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/SkeletonLoader';

export default function PlanDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('subscription_plans').select('*').eq('id', id).single();
      if (data) setPlan(data);
      setLoading(false);
    };
    load();
  }, [id]);

  const formatPrice = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

  if (loading || !plan) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + Spacing[4] }]}>
        <View style={{ padding: Spacing[5], gap: 12 }}>
          <Skeleton height={300} borderRadius={16} />
          <Skeleton height={28} width="60%" />
          <Skeleton height={18} width="80%" />
          <Skeleton height={48} borderRadius={10} style={{ marginTop: 8 }} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.hero}>
          <Image
            source={{ uri: plan.image_url ?? 'https://images.pexels.com/photos/931177/pexels-photo-931177.jpeg?auto=compress&cs=tinysrgb&w=800' }}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.55)', 'transparent']}
            style={styles.topGradient}
          />
          <TouchableOpacity
            style={[styles.backBtn, { top: insets.top + Spacing[3] }]}
            onPress={() => router.back()}
          >
            <ArrowLeft size={22} color={Colors.white} />
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <View style={styles.titleBlock}>
              <Text style={styles.planName}>{plan.name}</Text>
            </View>
            <View style={styles.priceBlock}>
              <Text style={styles.price}>{formatPrice(plan.price)}</Text>
              <Text style={styles.pricePer}>/month</Text>
            </View>
          </View>

          <Text style={styles.description}>{plan.description}</Text>

          <View style={styles.statsRow}>
            {[
              { icon: <Package size={18} color={Colors.primary} />, label: `${plan.deliveries_per_month} deliveries/mo` },
              { icon: <Truck size={18} color={Colors.accent} />, label: 'Free delivery' },
            ].map((stat) => (
              <View key={stat.label} style={styles.statItem}>
                {stat.icon}
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>What's included</Text>
          <View style={styles.featuresList}>
            {(plan.features as string[]).map((feat) => (
              <View key={feat} style={styles.featureItem}>
                <View style={styles.checkCircle}>
                  <Check size={13} color={Colors.white} strokeWidth={2.5} />
                </View>
                <Text style={styles.featureText}>{feat}</Text>
              </View>
            ))}
          </View>

        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing[4] }]}>
        <View style={styles.footerPrice}>
          <Text style={styles.footerPriceAmount}>{formatPrice(plan.price)}</Text>
          <Text style={styles.footerPricePer}>/month</Text>
        </View>
        <Button
          label="Subscribe Now"
          onPress={() => router.push({ pathname: '/(customer)/checkout', params: { planId: plan.id } })}
          size="lg"
          style={styles.subscribeBtn}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  hero: { height: 300, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  topGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 100 },
  backBtn: {
    position: 'absolute',
    left: Spacing[5],
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: Spacing[5], gap: Spacing[5] },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  titleBlock: { flex: 1, gap: 4 },
  planName: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'],
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  freq: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  priceBlock: { alignItems: 'flex-end', gap: 1 },
  price: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'],
    color: Colors.primary,
  },
  pricePer: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  description: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    lineHeight: Typography.size.base * 1.6,
    marginTop: -Spacing[2],
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.neutral[50],
    borderRadius: Radius.md,
    padding: Spacing[4],
    gap: Spacing[2],
  },
  statItem: { flex: 1, alignItems: 'center', gap: 5 },
  statLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  divider: { height: 1, backgroundColor: Colors.divider },
  sectionTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
    marginBottom: -Spacing[2],
  },
  featuresList: { gap: Spacing[3] },
  featureItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    flex: 1,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[4],
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    ...Shadow.lg,
  },
  footerPrice: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  footerPriceAmount: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'],
    color: Colors.primary,
  },
  footerPricePer: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  subscribeBtn: { flex: 1 },
});
