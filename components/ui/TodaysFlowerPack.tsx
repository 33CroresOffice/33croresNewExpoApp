import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { Leaf, AlertTriangle } from 'lucide-react-native';
import { format } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

interface FlowerPackItem {
  flower_type_id: string;
  display_name: string;
  quantity_per_delivery: number;
  unit_type: string;
  image_url: string | null;
  substituted: boolean;
  original_flower_name: string | null;
}

interface TodaysFlowerPackProps {
  planId: string;
  deliveryDate?: string;
  compact?: boolean;
}

export default function TodaysFlowerPack({ planId, deliveryDate, compact }: TodaysFlowerPackProps) {
  const [flowers, setFlowers] = useState<FlowerPackItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const dateStr = deliveryDate ?? format(new Date(), 'yyyy-MM-dd');
    loadFlowers(planId, dateStr);
  }, [planId, deliveryDate]);

  const loadFlowers = async (pid: string, dateStr: string) => {
    try {
      // 1. Get plan flower requirements
      const { data: planFlowers } = await supabase
        .from('plan_flower_requirements')
        .select(`
          flower_type_id,
          quantity_per_delivery,
          unit_type,
          flower_type:flower_types(display_name, unit_type, image_url)
        `)
        .eq('plan_id', pid);

      if (!planFlowers || planFlowers.length === 0) {
        setLoading(false);
        return;
      }

      // 2. Check availability rules for this date
      const { data: rules } = await supabase
        .from('flower_availability')
        .select(`
          flower_type_id,
          alternate_flower_type_id,
          alternate_quantity,
          alternate_unit_type,
          alternate_flower_type:flower_types!flower_availability_alternate_flower_type_id_fkey(display_name, unit_type, image_url)
        `)
        .lte('unavailable_from', dateStr)
        .gte('unavailable_to', dateStr);

      const ruleMap: Record<string, any> = {};
      for (const r of rules ?? []) {
        ruleMap[r.flower_type_id] = r;
      }

      // 3. Build the flower list with substitutions applied
      const items: FlowerPackItem[] = (planFlowers as any[]).map(pf => {
        const rule = ruleMap[pf.flower_type_id];
        const ft = pf.flower_type as any;

        if (rule && rule.alternate_flower_type_id) {
          const alt = rule.alternate_flower_type as any;
          return {
            flower_type_id: rule.alternate_flower_type_id,
            display_name: alt?.display_name ?? 'Substitute',
            quantity_per_delivery: rule.alternate_quantity ?? pf.quantity_per_delivery,
            unit_type: rule.alternate_unit_type ?? pf.unit_type,
            image_url: alt?.image_url ?? null,
            substituted: true,
            original_flower_name: ft?.display_name ?? null,
          };
        }

        return {
          flower_type_id: pf.flower_type_id,
          display_name: ft?.display_name ?? 'Unknown',
          quantity_per_delivery: pf.quantity_per_delivery,
          unit_type: pf.unit_type ?? ft?.unit_type ?? 'pieces',
          image_url: ft?.image_url ?? null,
          substituted: false,
          original_flower_name: rule ? ft?.display_name ?? null : null,
        };
      });

      setFlowers(items);
    } catch (e) {
      console.error('FlowerPack load error', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={s.container}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  if (flowers.length === 0) return null;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerIcon}>
          <Leaf size={14} color={Colors.primary} strokeWidth={2} />
        </View>
        <Text style={s.title}>Today's Flower Pack</Text>
      </View>
      <View style={[s.flowerRow, compact && s.flowerRowCompact]}>
        {flowers.map((f, i) => (
          <View key={i} style={s.flowerItem}>
            <View style={s.flowerImageWrap}>
              {f.image_url ? (
                <Image source={{ uri: f.image_url }} style={s.flowerImage} resizeMode="cover" />
              ) : (
                <View style={s.flowerImagePlaceholder}>
                  <Leaf size={16} color={Colors.textDisabled} strokeWidth={1.5} />
                </View>
              )}
              {f.substituted && (
                <View style={s.subBadge}>
                  <AlertTriangle size={7} color={Colors.white} strokeWidth={2.5} />
                </View>
              )}
            </View>
            <Text style={s.flowerName} numberOfLines={1}>{f.display_name}</Text>
            {f.substituted && f.original_flower_name ? (
              <Text style={s.flowerSubText} numberOfLines={1}>Replaces {f.original_flower_name}</Text>
            ) : null}
            <Text style={s.flowerQty}>{f.quantity_per_delivery} {f.unit_type}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], marginBottom: Spacing[3] },
  headerIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  flowerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[3] },
  flowerRowCompact: { gap: Spacing[2] },
  flowerItem: { alignItems: 'center', width: 72 },
  flowerImageWrap: { width: 56, height: 56, borderRadius: 28, overflow: 'hidden', borderWidth: 1.5, borderColor: Colors.primarySurface, position: 'relative' },
  flowerImage: { width: '100%', height: '100%' },
  flowerImagePlaceholder: { width: '100%', height: '100%', backgroundColor: Colors.neutral[50], alignItems: 'center', justifyContent: 'center' },
  subBadge: { position: 'absolute', top: -2, right: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.warning, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.white },
  flowerName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.textPrimary, marginTop: Spacing[1], textAlign: 'center' },
  flowerSubText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 8, color: Colors.warning, textAlign: 'center' },
  flowerQty: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 10, color: Colors.textTertiary, marginTop: 1 },
});
