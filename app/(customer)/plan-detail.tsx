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
import { ArrowLeft, Check, Package, Truck, Flame, CalendarDays } from 'lucide-react-native';
import CollapsibleCategory from '@/components/ui/CollapsibleCategory';
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
      const { data } = await supabase
        .from('subscription_plans')
        .select('*, pooja_items:plan_pooja_items(*, pooja_item:pooja_items(id, name, description, unit_type, is_active, category_id, category:pooja_item_categories(id, name, sort_order)))')
        .eq('id', id)
        .single();
      if (data) setPlan(data);
      setLoading(false);
    };
    load();
  }, [id]);

  const formatPrice = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;
  const isPooja = plan?.product_type === 'pooja';

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
              <Text style={styles.pricePer}>{isPooja ? '/delivery' : '/month'}</Text>
            </View>
          </View>

          <Text style={styles.description}>{plan.description}</Text>

          <View style={styles.statsRow}>
            {[
              { icon: isPooja ? <Flame size={18} color={Colors.accent} /> : <Package size={18} color={Colors.primary} />, label: isPooja ? 'Pooja essentials' : `${plan.deliveries_per_month} deliveries/mo` },
              { icon: <Truck size={18} color={Colors.accent} />, label: 'Free delivery' },
            ].map((stat) => (
              <View key={stat.label} style={styles.statItem}>
                {stat.icon}
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>{isPooja ? 'Included in this package' : "What's included"}</Text>
          {isPooja ? (
            <View style={styles.poojaItemsList}>
              {(() => {
                const items = (plan.pooja_items ?? []).filter((item) => item.pooja_item?.is_active === true && item.pooja_item.name.trim().length > 0);
                const groups: Record<string, { name: string; items: typeof items }> = {};
                for (const item of items) {
                  const catId = item.pooja_item?.category_id ?? 'uncategorized';
                  const catName = item.pooja_item?.category?.name ?? 'Uncategorized';
                  if (!groups[catId]) groups[catId] = { name: catName, items: [] };
                  groups[catId].items.push(item);
                }
                const groupEntries = Object.values(groups).sort((a, b) => {
                  if (a.name === 'Uncategorized') return 1;
                  if (b.name === 'Uncategorized') return -1;
                  return a.name.localeCompare(b.name);
                });
                return groupEntries.map((group, idx) => (
                  <CollapsibleCategory key={group.name} title={group.name} itemCount={group.items.length} defaultExpanded={idx === 0}>
                    {group.items.map((item) => (
                      <View key={item.pooja_item_id} style={styles.poojaItemRow}>
                        <View style={styles.poojaItemIcon}><Flame size={16} color={Colors.accent} strokeWidth={2} /></View>
                        <View style={styles.poojaItemInfo}>
                          <Text style={styles.poojaItemName}>{item.pooja_item?.name}</Text>
                          <Text style={styles.poojaItemDescription}>{item.pooja_item?.description}</Text>
                        </View>
                        <Text style={styles.poojaItemQty}>{item.quantity_per_delivery} {item.unit_type}</Text>
                      </View>
                    ))}
                  </CollapsibleCategory>
                ));
              })()}
            </View>
          ) : (
            <View style={styles.featuresList}>
              {(plan.features as string[]).map((feat) => (
                <View key={feat} style={styles.featureItem}>
                  <View style={styles.checkCircle}><Check size={13} color={Colors.white} strokeWidth={2.5} /></View>
                  <Text style={styles.featureText}>{feat}</Text>
                </View>
              ))}
            </View>
          )}

        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing[4] }]}>
        <View style={styles.footerPrice}>
          <Text style={styles.footerPriceAmount}>{formatPrice(plan.price)}</Text>
          <Text style={styles.footerPricePer}>{isPooja ? '/delivery' : '/month'}</Text>
        </View>
        {isPooja && plan.supports_one_time ? (
          <Button label="Buy Now" onPress={() => router.push({ pathname: '/(customer)/pooja-checkout', params: { planId: plan.id } })} size="lg" style={styles.subscribeBtn} />
        ) : (
          <Button label="Subscribe Now" onPress={() => router.push({ pathname: '/(customer)/checkout', params: { planId: plan.id } })} size="lg" style={styles.subscribeBtn} />
        )}
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
  poojaItemsList: { gap: Spacing[3] },
  poojaItemRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], padding: Spacing[3], backgroundColor: '#FFF8ED', borderRadius: Radius.md, borderWidth: 1, borderColor: '#F3DFC0' },
  poojaItemIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FCEED8', alignItems: 'center', justifyContent: 'center' },
  poojaItemInfo: { flex: 1, gap: 2 },
  poojaItemName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  poojaItemDescription: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  poojaItemQty: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.accent }, 
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
