import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Clock3, Flame, IndianRupee, Languages as LanguagesIcon, Package, MapPin } from 'lucide-react-native';
import CollapsibleCategory from '@/components/ui/CollapsibleCategory';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type PoojaSetup = {
  description: string | null;
  duration_minutes: number;
  service_fee: number;
  language: string | null;
  special_instructions: string | null;
  pooja_type: { name: string } | null;
  items: { quantity: number; pooja_item: { name: string; unit_type: string; category_id: string | null; category: { name: string } | null } | null }[];
};

type Share = {
  id: string;
  share_token: string;
  provider: { full_name: string; city: string | null } | null;
  pooja_setup: PoojaSetup | null;
};

export default function PoojaListViewScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [share, setShare] = useState<Share | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) { setError('Invalid share link.'); setLoading(false); setRefreshing(false); return; }
    const { data, error: queryError } = await supabase
      .from('pooja_list_shares')
      .select('id, share_token, provider:service_providers(full_name, city), pooja_setup:provider_pooja_setups(description, duration_minutes, service_fee, language, special_instructions, pooja_type:pooja_types(name), items:provider_pooja_items(quantity, pooja_item:pooja_items(name, unit_type, category_id, category:pooja_item_categories(name))))')
      .eq('share_token', token)
      .is('is_revoked', false)
      .maybeSingle();
    if (queryError || !data) { setError('This share link is not available or has expired.'); }
    else setShare(data as unknown as Share);
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;
  if (error || !share) return (
    <View style={[styles.center, { paddingTop: insets.top }]}>
      <Text style={styles.errorText}>{error ?? 'Share link not found.'}</Text>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}><Text style={styles.backButtonText}>Go back</Text></TouchableOpacity>
    </View>
  );

  const setup = share.pooja_setup;
  const poojaName = setup?.pooja_type?.name ?? 'Pooja';
  const items = setup?.items ?? [];
  const providerName = share.provider?.full_name ?? 'Pandit';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing[3], paddingBottom: insets.bottom + Spacing[8] }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
    >
      <TouchableOpacity style={styles.backRow} onPress={() => router.back()}>
        <ArrowLeft size={20} color={Colors.textPrimary} />
        <Text style={styles.backText}>Pooja List</Text>
      </TouchableOpacity>

      <View style={styles.heroCard}>
        <View style={styles.heroIcon}><Flame size={24} color={Colors.accent} /></View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>Shared by {providerName}</Text>
          <Text style={styles.heroTitle}>{poojaName}</Text>
          {share.provider?.city ? <Text style={styles.heroLocation}>{share.provider.city}</Text> : null}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Pooja details</Text>
        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Clock3 size={16} color={Colors.primary} />
            <Text style={styles.detailLabel}>Duration</Text>
            <Text style={styles.detailValue}>{setup?.duration_minutes ?? 0} min</Text>
          </View>
          <View style={styles.detailItem}>
            <IndianRupee size={16} color={Colors.primary} />
            <Text style={styles.detailLabel}>Service fee</Text>
            <Text style={styles.detailValue}>₹{setup?.service_fee ?? 0}</Text>
          </View>
          <View style={styles.detailItem}>
            <LanguagesIcon size={16} color={Colors.primary} />
            <Text style={styles.detailLabel}>Language</Text>
            <Text style={styles.detailValue}>{setup?.language ?? '—'}</Text>
          </View>
        </View>
        {setup?.description ? <Text style={styles.bodyText}>{setup.description}</Text> : null}
        {setup?.special_instructions ? <Text style={styles.instructions}>{setup.special_instructions}</Text> : null}
      </View>

      <View style={styles.card}>
        <View style={styles.itemsHeader}>
          <Package size={18} color={Colors.primary} />
          <Text style={styles.sectionTitle}>Pooja Item List</Text>
        </View>
        {items.length > 0 ? (() => {
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
              {group.items.map((item, index) => (
                <View key={index} style={styles.itemRow}>
                  <Text style={styles.itemName}>{item.pooja_item?.name ?? 'Item'}</Text>
                  <Text style={styles.itemQty}>{item.quantity} {item.pooja_item?.unit_type ?? ''}</Text>
                </View>
              ))}
            </CollapsibleCategory>
          ));
        })() : <Text style={styles.emptyText}>No items listed</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: Spacing[5], gap: Spacing[4] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing[4], padding: Spacing[6] },
  errorText: { fontFamily: Typography.fontFamily.sansRegular, color: Colors.error, textAlign: 'center' },
  backButton: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  backButtonText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.white },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[2] },
  backText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textPrimary, fontSize: Typography.size.base },
  heroCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  heroIcon: { width: 48, height: 48, borderRadius: Radius.md, backgroundColor: Colors.accentSurface, alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1, gap: 3 },
  heroEyebrow: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.accentDark, textTransform: 'capitalize' },
  heroTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  heroLocation: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, gap: Spacing[3], ...Shadow.sm },
  sectionTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.md, color: Colors.textPrimary },
  detailsRow: { flexDirection: 'row', gap: Spacing[3] },
  detailItem: { flex: 1, alignItems: 'center', gap: 4, backgroundColor: Colors.neutral[50], borderRadius: Radius.md, padding: Spacing[3] },
  detailLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  bodyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 22 },
  instructions: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, fontStyle: 'italic', lineHeight: 20, borderLeftWidth: 2, borderLeftColor: Colors.accent, paddingLeft: Spacing[3] },
  itemsHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing[3], borderTopWidth: 1, borderTopColor: Colors.divider },
  itemName: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  itemQty: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.accentDark },
  emptyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', paddingVertical: Spacing[4] },
});
