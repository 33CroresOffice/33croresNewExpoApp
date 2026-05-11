import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Package, Store, Calendar, FileText,
  Save, CircleCheck as CheckCircle2,
} from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import StatusChip from '@/components/ui/StatusChip';

const GRADIENT_TOP = '#1B3A18';
const GRADIENT_BOT = '#3D7A35';

export default function VendorProcurementOrderDetail() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { id } = useLocalSearchParams<{ id: string }>();

  const [order, setOrder] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [prices, setPrices] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!id) return;
    const [orderRes, itemsRes] = await Promise.all([
      supabase.from('procurement_orders')
        .select('*, vendor:vendors(business_name, contact_person, mobile, email, address, city)')
        .eq('id', id).maybeSingle(),
      supabase.from('procurement_order_items')
        .select('*, flower_type:flower_types(display_name, unit_type)')
        .eq('procurement_order_id', id).order('created_at'),
    ]);
    if (orderRes.data) setOrder(orderRes.data);
    if (itemsRes.data) {
      setItems(itemsRes.data);
      const initialPrices: Record<string, string> = {};
      itemsRes.data.forEach((item: any) => {
        initialPrices[item.id] = item.price_per_unit != null ? String(item.price_per_unit) : '';
      });
      setPrices(initialPrices);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const saveAll = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const updates = items
      .map(item => ({ item, price: parseFloat(prices[item.id] ?? '') }))
      .filter(({ price }) => !isNaN(price) && price >= 0);

    if (updates.length === 0) {
      setSaveError('Please enter at least one valid price.');
      setSaving(false);
      return;
    }

    for (const { item, price } of updates) {
      const { error } = await supabase
        .from('procurement_order_items')
        .update({ price_per_unit: price })
        .eq('id', item.id);
      if (error) {
        setSaveError(error.message);
        setSaving(false);
        return;
      }
    }

    const { data: freshItems } = await supabase
      .from('procurement_order_items')
      .select('total_price')
      .eq('procurement_order_id', id!);

    if (freshItems) {
      const newTotal = freshItems.reduce((sum, i) => sum + (i.total_price ?? 0), 0);
      await supabase.from('procurement_orders').update({ total_amount: newTotal }).eq('id', id!);
    }

    await load();
    setSaveSuccess(true);
    setSaving(false);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  if (loading) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[s.container, s.center]}>
        <Text style={s.notFoundText}>Order not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={s.backLink}>
          <Text style={s.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const vendor = order.vendor as any;
  const totalPriced = items.filter(i => i.price_per_unit != null).length;
  const allPriced = totalPriced === items.length && items.length > 0;

  const hasChanges = items.some(item => {
    const current = prices[item.id] ?? '';
    const saved = item.price_per_unit != null ? String(item.price_per_unit) : '';
    return current !== saved && current !== '';
  });

  return (
    <View style={s.container}>
      <LinearGradient
        colors={[GRADIENT_TOP, GRADIENT_BOT]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[s.gradientHeader, { paddingTop: isWeb ? 24 : insets.top + Spacing[3] }]}
      >
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
            <ArrowLeft size={20} color='rgba(255,255,255,0.9)' strokeWidth={2} />
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <View style={s.headerIconWrap}>
              <Package size={15} color='#C8962A' strokeWidth={1.8} />
            </View>
            <View>
              <Text style={s.headerTitle}>{order.order_number}</Text>
              <Text style={s.headerSub}>
                {order.created_at ? format(parseISO(order.created_at), 'dd MMM yyyy') : '—'}
              </Text>
            </View>
          </View>
          <StatusChip status={order.status} />
        </View>

        <View style={s.orderStats}>
          <View style={s.orderStatItem}>
            <Text style={s.orderStatValue}>{items.length}</Text>
            <Text style={s.orderStatLabel}>Items</Text>
          </View>
          <View style={s.orderStatDivider} />
          <View style={s.orderStatItem}>
            <Text style={s.orderStatValue}>{totalPriced}</Text>
            <Text style={s.orderStatLabel}>Priced</Text>
          </View>
          <View style={s.orderStatDivider} />
          <View style={s.orderStatItem}>
            <Text style={s.orderStatValue}>₹{Number(order.total_amount).toLocaleString('en-IN')}</Text>
            <Text style={s.orderStatLabel}>Total</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, isWeb && s.contentWeb]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={s.cardIconWrap}>
              <Store size={14} color={Colors.primary} strokeWidth={1.8} />
            </View>
            <Text style={s.cardTitle}>Business</Text>
          </View>
          <Text style={s.vendorName}>{vendor?.business_name ?? vendor?.contact_person ?? '—'}</Text>
          {vendor?.mobile && <Text style={s.vendorMeta}>{vendor.mobile}</Text>}
          {vendor?.email && <Text style={s.vendorMeta}>{vendor.email}</Text>}
          {(vendor?.address || vendor?.city) && (
            <Text style={s.vendorMeta}>{[vendor.address, vendor.city].filter(Boolean).join(', ')}</Text>
          )}
        </View>

        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={s.cardIconWrap}>
              <Calendar size={14} color={Colors.primary} strokeWidth={1.8} />
            </View>
            <Text style={s.cardTitle}>Order Details</Text>
          </View>
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Order Date</Text>
            <Text style={s.detailValue}>
              {order.order_date ? format(parseISO(order.order_date), 'dd MMM yyyy') : '—'}
            </Text>
          </View>
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Required By</Text>
            <Text style={s.detailValue}>
              {order.requirement_date ? format(parseISO(order.requirement_date), 'dd MMM yyyy') : '—'}
            </Text>
          </View>
          <View style={s.detailDivider} />
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Total Amount</Text>
            <Text style={[s.detailValue, s.totalAmount]}>
              ₹{Number(order.total_amount).toLocaleString('en-IN')}
            </Text>
          </View>
          {order.notes && (
            <View style={s.notesBox}>
              <FileText size={13} color={Colors.textTertiary} strokeWidth={1.8} />
              <Text style={s.notesText}>{order.notes}</Text>
            </View>
          )}
        </View>

        {saveError && (
          <View style={s.errorBanner}>
            <Text style={s.errorBannerText}>{saveError}</Text>
          </View>
        )}

        {saveSuccess && (
          <View style={s.successBanner}>
            <CheckCircle2 size={15} color={Colors.success} strokeWidth={2} />
            <Text style={s.successBannerText}>Prices saved successfully</Text>
          </View>
        )}

        <View style={s.card}>
          <View style={s.cardHeaderRow}>
            <View style={s.cardHeader}>
              <View style={s.cardIconWrap}>
                <Package size={14} color={Colors.primary} strokeWidth={1.8} />
              </View>
              <Text style={s.cardTitle}>Items</Text>
            </View>
            <View style={[s.pricedBadge, { backgroundColor: allPriced ? Colors.successSurface : Colors.primarySurface }]}>
              {allPriced && <CheckCircle2 size={11} color={Colors.success} strokeWidth={2} />}
              <Text style={[s.pricedBadgeText, { color: allPriced ? Colors.success : Colors.primary }]}>
                {totalPriced}/{items.length} priced
              </Text>
            </View>
          </View>

          {items.length === 0 ? (
            <Text style={s.emptyText}>No items found</Text>
          ) : (
            items.map((item, idx) => {
              const ft = item.flower_type as any;
              return (
                <View key={item.id} style={[s.itemRow, idx < items.length - 1 && s.itemRowBorder]}>
                  <View style={s.itemInfo}>
                    <Text style={s.itemName}>{ft?.display_name ?? 'Unknown'}</Text>
                    <Text style={s.itemQty}>
                      {item.quantity} {item.unit_type ?? ft?.unit_type ?? ''}
                    </Text>
                    {item.price_per_unit != null && (
                      <Text style={s.savedTotal}>
                        Saved: ₹{Number(item.total_price ?? 0).toLocaleString('en-IN')}
                      </Text>
                    )}
                  </View>

                  <View style={s.priceInputWrap}>
                    <Text style={s.rupeeSymbol}>₹</Text>
                    <TextInput
                      style={s.priceInput}
                      value={prices[item.id] ?? ''}
                      onChangeText={val => setPrices(prev => ({ ...prev, [item.id]: val }))}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={Colors.textDisabled}
                    />
                  </View>
                </View>
              );
            })
          )}
        </View>

        <TouchableOpacity
          style={[s.saveBtn, saving && s.saveBtnDisabled]}
          onPress={saveAll}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <>
              <Save size={18} color={Colors.white} strokeWidth={2} />
              <Text style={s.saveBtnText}>Save Prices</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0EDE8' },
  center: { justifyContent: 'center', alignItems: 'center', flex: 1 },
  notFoundText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textSecondary },
  backLink: { marginTop: Spacing[3] },
  backLinkText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.primary },

  gradientHeader: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[5],
    gap: Spacing[3],
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  headerIconWrap: {
    width: 32, height: 32, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: '#FFFFFF' },
  headerSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.55)', marginTop: 1 },

  orderStats: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: Radius.lg,
    padding: Spacing[3], gap: Spacing[3],
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  orderStatItem: { flex: 1, alignItems: 'center', gap: 2 },
  orderStatValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: '#FFFFFF' },
  orderStatLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: 'rgba(255,255,255,0.55)', letterSpacing: 0.4, textTransform: 'uppercase' },
  orderStatDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.2)' },

  scroll: { flex: 1 },
  content: { padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[10] },
  contentWeb: { padding: Spacing[8], maxWidth: 800, alignSelf: 'center', width: '100%' },

  card: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: Spacing[5], borderWidth: 1, borderColor: Colors.border,
    gap: Spacing[3], ...Shadow.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },

  vendorName: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  vendorMeta: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },

  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  detailValue: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  detailDivider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing[1] },
  totalAmount: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.primary },

  notesBox: {
    flexDirection: 'row', gap: Spacing[2], alignItems: 'flex-start',
    backgroundColor: Colors.neutral[50], borderRadius: Radius.md,
    padding: Spacing[3], borderWidth: 1, borderColor: Colors.border,
  },
  notesText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, flex: 1 },

  pricedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: Radius.full,
  },
  pricedBadgeText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11 },
  emptyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textDisabled, textAlign: 'center', paddingVertical: Spacing[4] },

  itemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing[3], gap: Spacing[3],
  },
  itemRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  itemInfo: { flex: 1 },
  itemName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  itemQty: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 12, color: Colors.textTertiary, marginTop: 2, textTransform: 'capitalize' },
  savedTotal: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.success, marginTop: 2 },

  priceInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderColor: Colors.primary + '60', borderRadius: Radius.sm,
    paddingHorizontal: Spacing[2], paddingVertical: 6,
    backgroundColor: Colors.primarySurface, minWidth: 100,
  },
  rupeeSymbol: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary },
  priceInput: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm,
    color: Colors.textPrimary, minWidth: 70, padding: 0,
  },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2],
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    paddingVertical: Spacing[4], marginTop: Spacing[2],
    ...Shadow.md,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },

  errorBanner: {
    backgroundColor: Colors.errorSurface, borderRadius: Radius.md,
    padding: Spacing[3], borderWidth: 1, borderColor: Colors.error + '30',
  },
  errorBannerText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error },

  successBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    backgroundColor: Colors.successSurface, borderRadius: Radius.md,
    padding: Spacing[3], borderWidth: 1, borderColor: Colors.success + '30',
  },
  successBannerText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.success },
});
