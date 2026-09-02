import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Flower2, Calendar, Phone, Package, MessageSquare, StickyNote, IndianRupee, CircleCheck as CheckCircle } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import StatusChip from '@/components/ui/StatusChip';
import Button from '@/components/ui/Button';

function ItemTypeBadge({ isGarland }: { isGarland: boolean }) {
  return (
    <View style={{
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 20,
      backgroundColor: isGarland ? '#FFF0E6' : '#EAF7EE',
      alignSelf: 'flex-start',
    }}>
      <Text style={{
        fontFamily: Typography.fontFamily.sansMedium,
        fontSize: 10,
        color: isGarland ? Colors.accent : Colors.success,
      }}>
        {isGarland ? 'Garland' : 'Flower'}
      </Text>
    </View>
  );
}

function AdminItemsOrderedSection({ items, orderType, cardStyle, styles }: {
  items: any[];
  orderType: string;
  cardStyle: any;
  styles: any;
}) {
  const hasGarland = items.some((i) => i.measure_type);
  const hasFlower = items.some((i) => !i.measure_type);
  const mixed = hasGarland && hasFlower;

  return (
    <View style={cardStyle}>
      <View style={styles.cardHeader}>
        <Package size={15} color={Colors.primary} />
        <Text style={styles.sectionTitle}>Items Ordered</Text>
      </View>

      {/* Flower items */}
      {hasFlower && (
        <View>
          {mixed && <Text style={styles.subSectionLabel}>Flower Items</Text>}
          <View style={styles.tableHead}>
            <Text style={[styles.thCell, { flex: 1 }]}>Flower</Text>
            <Text style={[styles.thCell, { width: 52 }]}>Qty</Text>
            <Text style={[styles.thCell, { width: 64 }]}>Unit</Text>
            <Text style={[styles.thCell, { width: 60 }]}>Type</Text>
          </View>
          {items.filter((i) => !i.measure_type).map((item: any, i: number) => (
            <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
              <Text style={[styles.tdCell, { flex: 1 }]}>{item.flower_name}</Text>
              <Text style={[styles.tdCell, { width: 52 }]}>{item.quantity}</Text>
              <Text style={[styles.tdMuted, { width: 64 }]}>{item.unit}</Text>
              <View style={{ width: 60 }}><ItemTypeBadge isGarland={false} /></View>
            </View>
          ))}
        </View>
      )}

      {/* Garland items */}
      {hasGarland && (
        <View style={mixed ? styles.subSection : undefined}>
          {mixed && <Text style={styles.subSectionLabel}>Garland Items</Text>}
          <View style={styles.tableHead}>
            <Text style={[styles.thCell, { flex: 1 }]}>Flower</Text>
            <Text style={[styles.thCell, { width: 44 }]}>No.</Text>
            <Text style={[styles.thCell, { width: 58 }]}>Count</Text>
            <Text style={[styles.thCell, { width: 48 }]}>Size</Text>
            <Text style={[styles.thCell, { width: 60 }]}>Type</Text>
          </View>
          {items.filter((i) => i.measure_type).map((item: any, i: number) => (
            <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
              <Text style={[styles.tdCell, { flex: 1 }]}>{item.flower_name}</Text>
              <Text style={[styles.tdCell, { width: 44 }]}>{item.quantity ?? item.garland_count}</Text>
              <Text style={[styles.tdMuted, { width: 58 }]}>
                {item.measure_type === 'flower_count' ? (item.flower_count ?? '—') : '—'}
              </Text>
              <Text style={[styles.tdMuted, { width: 48 }]}>
                {item.measure_type === 'garland_size' ? (item.garland_size ?? '—') : '—'}
              </Text>
              <View style={{ width: 60 }}><ItemTypeBadge isGarland={true} /></View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const ORDER_TYPE_LABEL: Record<string, string> = {
  flower: 'Flower Order',
  garland: 'Garland Order',
};

const CUSTOM_STATUSES = [
  { label: 'Pending', value: 'pending', manual: false },
  { label: 'Confirmed', value: 'confirmed', manual: false },
  { label: 'Paid', value: 'paid', manual: false },
  { label: 'Out for Delivery', value: 'out_for_delivery', manual: true },
  { label: 'Delivered', value: 'delivered', manual: true },
  { label: 'Cancelled', value: 'cancelled', manual: true },
];

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  unpaid: { label: 'Unpaid', color: Colors.textTertiary, bg: Colors.neutral[100] },
  pending: { label: 'Payment Pending', color: Colors.warning, bg: Colors.warningSurface },
  paid: { label: 'Paid', color: Colors.success, bg: Colors.successSurface },
};

export default function AdminCustomOrderDetailScreen() {
  return (
    <ModuleGuard module="orders">
      <AdminCustomOrderDetailScreenContent />
    </ModuleGuard>
  );
}

function AdminCustomOrderDetailScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { id } = useLocalSearchParams<{ id: string }>();

  const [order, setOrder] = useState<any>(null);
  const [address, setAddress] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [flowerPrice, setFlowerPrice] = useState('');
  const [deliveryPrice, setDeliveryPrice] = useState('');
  const [savingPrices, setSavingPrices] = useState(false);
  const [pricesSaved, setPricesSaved] = useState(false);

  const [adminNote, setAdminNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await supabase
        .from('custom_orders')
        .select('*, user:profiles(full_name, mobile)')
        .eq('id', id)
        .single();

      if (data) {
        setOrder(data);
        setAdminNote(data.admin_note ?? '');
        // Convert paise → rupees for display
        setFlowerPrice(data.flower_price > 0 ? String(data.flower_price / 100) : '');
        setDeliveryPrice(data.delivery_price > 0 ? String(data.delivery_price / 100) : '');
        if (data.address_id) {
          const { data: addr } = await supabase
            .from('addresses')
            .select('*')
            .eq('id', data.address_id)
            .maybeSingle();
          setAddress(addr);
        }
      }
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleStatusChange = async (status: string) => {
    setUpdating(true);
    const { error } = await supabase
      .from('custom_orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) setOrder((prev: any) => prev ? { ...prev, status } : prev);
    setUpdating(false);
  };

  const handleSavePrices = async () => {
    const fp = Math.round(parseFloat(flowerPrice || '0') * 100);
    const dp = Math.round(parseFloat(deliveryPrice || '0') * 100);
    if (fp < 0 || dp < 0) return;

    setSavingPrices(true);
    const currentStatus = order?.status;
    const { error } = await supabase
      .from('custom_orders')
      .update({
        flower_price: fp,
        delivery_price: dp,
        prices_set_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(currentStatus === 'pending' ? { status: 'confirmed' } : {}),
      })
      .eq('id', id);

    if (!error) {
      setOrder((prev: any) => prev ? {
        ...prev,
        flower_price: fp,
        delivery_price: dp,
        total_price: fp + dp,
        prices_set_at: new Date().toISOString(),
        status: prev.status === 'pending' ? 'confirmed' : prev.status,
      } : prev);
      setPricesSaved(true);
      setTimeout(() => setPricesSaved(false), 3000);
    }
    setSavingPrices(false);
  };

  const handleSaveNote = async () => {
    setSavingNote(true);
    const { error } = await supabase
      .from('custom_orders')
      .update({ admin_note: adminNote.trim() || null, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) setOrder((prev: any) => prev ? { ...prev, admin_note: adminNote.trim() || null } : prev);
    setSavingNote(false);
  };

  const formatRupees = (paise: number) =>
    paise > 0 ? `₹${(paise / 100).toLocaleString('en-IN')}` : '—';

  if (loading || !order) {
    return (
      <View style={[styles.container, { paddingTop: isWeb ? 0 : insets.top }]}>
        {!isWeb && (
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <ArrowLeft size={22} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.title}>Custom Order</Text>
            <View style={{ width: 36 }} />
          </View>
        )}
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>{loading ? 'Loading…' : 'Order not found.'}</Text>
        </View>
      </View>
    );
  }

  const paymentCfg = PAYMENT_STATUS_CONFIG[order.payment_status] ?? PAYMENT_STATUS_CONFIG.unpaid;
  const totalRupees = order.total_price > 0 ? (order.total_price / 100).toLocaleString('en-IN') : null;

  const content = (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={isWeb ? webStyles.content : styles.content}
    >
      {isWeb && (
        <View style={webStyles.pageHeader}>
          <TouchableOpacity onPress={() => router.back()} style={webStyles.backRow}>
            <ArrowLeft size={16} color={Colors.textTertiary} />
            <Text style={webStyles.backText}>Back to Orders</Text>
          </TouchableOpacity>
          <Text style={webStyles.pageTitle}>Custom Order</Text>
          <Text style={webStyles.pageSubtitle}>#{order.id.slice(0, 8).toUpperCase()}</Text>
        </View>
      )}

      <View style={isWeb ? webStyles.grid : null}>
        {/* LEFT COLUMN */}
        <View style={isWeb ? webStyles.leftCol : null}>

          {/* Hero */}
          <View style={isWeb ? webStyles.card : styles.card}>
            <View style={styles.heroRow}>
              <View style={styles.heroIconWrap}>
                <Flower2 size={24} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroType}>{ORDER_TYPE_LABEL[order.order_type] ?? 'Custom Order'}</Text>
                <Text style={styles.heroMeta}>
                  Placed {format(new Date(order.created_at), 'dd MMM yyyy, hh:mm a')}
                </Text>
              </View>
              <StatusChip status={order.status} />
            </View>

            {/* Payment status badge */}
            <View style={[styles.paymentBadge, { backgroundColor: paymentCfg.bg }]}>
              <IndianRupee size={13} color={paymentCfg.color} />
              <Text style={[styles.paymentBadgeText, { color: paymentCfg.color }]}>
                {paymentCfg.label}
                {totalRupees ? ` · ₹${totalRupees}` : ''}
              </Text>
            </View>

            {/* Cancel reason banner */}
            {order.status === 'cancelled' && order.cancel_reason ? (
              <View style={styles.cancelReasonBanner}>
                <Text style={styles.cancelReasonLabel}>Cancellation Reason</Text>
                <Text style={styles.cancelReasonText}>{order.cancel_reason}</Text>
              </View>
            ) : null}
          </View>

          {/* Customer */}
          <View style={isWeb ? webStyles.card : styles.card}>
            <View style={styles.cardHeader}>
              <Phone size={15} color={Colors.primary} />
              <Text style={styles.sectionTitle}>Customer</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Name</Text>
              <Text style={styles.infoValue}>{order.user?.full_name ?? '—'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Mobile</Text>
              <Text style={styles.infoValue}>+91 {order.user?.mobile}</Text>
            </View>
          </View>

          {/* Items */}
          <AdminItemsOrderedSection
            items={order.items}
            orderType={order.order_type}
            cardStyle={isWeb ? webStyles.card : styles.card}
            styles={styles}
          />

          {/* Delivery details */}
          <View style={isWeb ? webStyles.card : styles.card}>
            <View style={styles.cardHeader}>
              <Calendar size={15} color={Colors.primary} />
              <Text style={styles.sectionTitle}>Delivery Details</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Date</Text>
              <Text style={styles.infoValue}>{format(new Date(order.delivery_date), 'EEEE, dd MMM yyyy')}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Time</Text>
              <Text style={styles.infoValue}>{order.delivery_time || '—'}</Text>
            </View>
            {address ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Address</Text>
                <Text style={[styles.infoValue, { flex: 1 }]}>
                  {address.apartment_name ? `${address.apartment_name}, ` : ''}{address.street}, {address.city}, {address.state} — {address.pincode}
                  {address.landmark ? `\nNear ${address.landmark}` : ''}
                </Text>
              </View>
            ) : null}
          </View>

          {order.special_instructions ? (
            <View style={isWeb ? webStyles.card : styles.card}>
              <View style={styles.cardHeader}>
                <MessageSquare size={15} color={Colors.textTertiary} />
                <Text style={styles.sectionTitle}>Special Instructions</Text>
              </View>
              <Text style={styles.noteText}>{order.special_instructions}</Text>
            </View>
          ) : null}

        </View>

        {/* RIGHT COLUMN */}
        <View style={isWeb ? webStyles.rightCol : null}>

          {/* Pricing */}
          <View style={isWeb ? webStyles.card : styles.card}>
            <View style={styles.cardHeader}>
              <IndianRupee size={15} color={Colors.primary} />
              <Text style={styles.sectionTitle}>Set Order Pricing</Text>
            </View>

            {order.payment_status === 'paid' ? (
              <View style={styles.paidSummary}>
                <CheckCircle size={18} color={Colors.success} />
                <Text style={styles.paidSummaryText}>Payment received by customer</Text>
                <View style={styles.priceBreakdown}>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceRowLabel}>Flower price</Text>
                    <Text style={styles.priceRowValue}>{formatRupees(order.flower_price)}</Text>
                  </View>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceRowLabel}>Delivery charge</Text>
                    <Text style={styles.priceRowValue}>{formatRupees(order.delivery_price)}</Text>
                  </View>
                  <View style={[styles.priceRow, styles.priceRowTotal]}>
                    <Text style={styles.priceRowTotalLabel}>Total paid</Text>
                    <Text style={styles.priceRowTotalValue}>{formatRupees(order.total_price)}</Text>
                  </View>
                </View>
              </View>
            ) : (
              <>
                <Text style={styles.pricingHint}>
                  Enter prices in rupees. Once saved, the customer will see a payment button in their order detail.
                </Text>
                <View style={styles.priceInputRow}>
                  <View style={styles.priceInputGroup}>
                    <Text style={styles.priceInputLabel}>Flower Price (₹)</Text>
                    <View style={styles.priceInputWrap}>
                      <Text style={styles.rupeeSymbol}>₹</Text>
                      <TextInput
                        style={styles.priceInput}
                        placeholder="0"
                        placeholderTextColor={Colors.textDisabled}
                        keyboardType="numeric"
                        value={flowerPrice}
                        onChangeText={setFlowerPrice}
                      />
                    </View>
                  </View>
                  <View style={styles.priceInputGroup}>
                    <Text style={styles.priceInputLabel}>Delivery Charge (₹)</Text>
                    <View style={styles.priceInputWrap}>
                      <Text style={styles.rupeeSymbol}>₹</Text>
                      <TextInput
                        style={styles.priceInput}
                        placeholder="0"
                        placeholderTextColor={Colors.textDisabled}
                        keyboardType="numeric"
                        value={deliveryPrice}
                        onChangeText={setDeliveryPrice}
                      />
                    </View>
                  </View>
                </View>

                {/* Live total preview */}
                {(flowerPrice || deliveryPrice) ? (
                  <View style={styles.totalPreview}>
                    <Text style={styles.totalPreviewLabel}>Total</Text>
                    <Text style={styles.totalPreviewValue}>
                      ₹{((parseFloat(flowerPrice || '0') + parseFloat(deliveryPrice || '0'))).toLocaleString('en-IN')}
                    </Text>
                  </View>
                ) : null}

                {pricesSaved && (
                  <View style={styles.savedBanner}>
                    <CheckCircle size={14} color={Colors.success} />
                    <Text style={styles.savedBannerText}>Prices saved — customer can now pay</Text>
                  </View>
                )}

                <Button
                  label={savingPrices ? 'Saving…' : 'Save Prices & Notify Customer'}
                  onPress={handleSavePrices}
                  disabled={savingPrices || (!flowerPrice && !deliveryPrice)}
                />
              </>
            )}
          </View>

          {/* Update Status */}
          <View style={isWeb ? webStyles.card : styles.card}>
            <Text style={styles.sectionTitle}>Update Status</Text>
            <Text style={styles.statusHint}>
              Pending → Confirmed (auto on price set) → Paid (auto on payment) → Out for Delivery → Delivered
            </Text>
            <View style={styles.statusGrid}>
              {CUSTOM_STATUSES.map((s) => (
                <TouchableOpacity
                  key={s.value}
                  style={[
                    styles.statusBtn,
                    order.status === s.value && styles.statusBtnActive,
                    !s.manual && order.status !== s.value && styles.statusBtnAuto,
                    s.value === 'cancelled' && order.status !== s.value && styles.statusBtnCancel,
                    order.status === s.value && s.value === 'cancelled' && styles.statusBtnCancelActive,
                  ]}
                  onPress={() => s.manual && handleStatusChange(s.value)}
                  disabled={!s.manual || order.status === s.value || updating}
                  activeOpacity={s.manual ? 0.7 : 1}
                >
                  <Text style={[
                    styles.statusBtnText,
                    order.status === s.value && styles.statusBtnTextActive,
                    !s.manual && order.status !== s.value && styles.statusBtnTextAuto,
                    s.value === 'cancelled' && order.status !== s.value && s.manual && styles.statusBtnTextCancel,
                  ]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Admin Note */}
          <View style={isWeb ? webStyles.card : styles.card}>
            <View style={styles.cardHeader}>
              <StickyNote size={15} color={Colors.accentDark} />
              <Text style={styles.sectionTitle}>Admin Note</Text>
            </View>
            <TextInput
              style={styles.noteInput}
              placeholder="Add an internal note visible to the customer…"
              placeholderTextColor={Colors.textDisabled}
              value={adminNote}
              onChangeText={setAdminNote}
              multiline
              numberOfLines={3}
            />
            <Button
              label={savingNote ? 'Saving…' : 'Save Note'}
              onPress={handleSaveNote}
              disabled={savingNote || adminNote === (order.admin_note ?? '')}
            />
          </View>

          <Text style={styles.orderId}>Order ID: {order.id}</Text>
        </View>
      </View>
    </ScrollView>
  );

  if (isWeb) {
    return <View style={webStyles.container}>{content}</View>;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Custom Order</Text>
        <View style={{ width: 36 }} />
      </View>
      {content}
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
  backBtn: { padding: Spacing[1] },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    color: Colors.textPrimary,
  },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textTertiary,
  },
  content: { padding: Spacing[5], gap: Spacing[4], paddingBottom: 48 },

  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing[3],
    ...Shadow.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  sectionTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },

  heroRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroType: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
  },
  heroMeta: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  cancelReasonBanner: {
    backgroundColor: Colors.errorSurface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.errorLight,
    padding: Spacing[3],
    gap: 4,
  },
  cancelReasonLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.error,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cancelReasonText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
  },
  paymentBadgeText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
    paddingVertical: Spacing[1],
  },
  infoLabel: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    width: 64,
  },
  infoValue: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    lineHeight: 20,
  },

  tableHead: {
    flexDirection: 'row',
    paddingVertical: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  thCell: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  tdCell: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  tdMuted: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },

  noteText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    fontStyle: 'italic',
  },

  // Pricing
  pricingHint: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    lineHeight: 18,
  },
  priceInputRow: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  priceInputGroup: { flex: 1, gap: Spacing[1] },
  priceInputLabel: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
  },
  priceInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.neutral[50],
    paddingHorizontal: Spacing[3],
  },
  rupeeSymbol: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textTertiary,
    marginRight: 4,
  },
  priceInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    paddingVertical: Spacing[3],
  },
  totalPreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.primarySurface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
  },
  totalPreviewLabel: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.primary,
  },
  totalPreviewValue: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.lg,
    color: Colors.primary,
  },
  savedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.successSurface,
    borderRadius: Radius.md,
    padding: Spacing[3],
  },
  savedBannerText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.success,
  },
  paidSummary: {
    gap: Spacing[3],
    alignItems: 'flex-start',
  },
  paidSummaryText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.success,
  },
  priceBreakdown: {
    width: '100%',
    gap: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingTop: Spacing[3],
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  priceRowLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  priceRowValue: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  priceRowTotal: {
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingTop: Spacing[2],
    marginTop: Spacing[1],
  },
  priceRowTotalLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  priceRowTotalValue: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.lg,
    color: Colors.primary,
  },

  // Status
  statusHint: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    lineHeight: 16,
  },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  statusBtn: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  statusBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  statusBtnAuto: { backgroundColor: Colors.neutral[50], borderColor: Colors.divider, opacity: 0.7 },
  statusBtnCancel: { borderColor: Colors.errorLight },
  statusBtnCancelActive: { backgroundColor: Colors.error, borderColor: Colors.error },
  statusBtnText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
  },
  statusBtnTextActive: { color: Colors.white },
  statusBtnTextAuto: { color: Colors.textTertiary },
  statusBtnTextCancel: { color: Colors.error },

  noteInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing[3],
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: Colors.neutral[50],
  },

  orderId: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 10,
    color: Colors.textDisabled,
    textAlign: 'center',
    marginTop: Spacing[2],
  },
  subSection: {
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingTop: Spacing[3],
    marginTop: Spacing[1],
  },
  subSectionLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing[2],
  },
});

const webStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F4' },
  content: { padding: 32, paddingBottom: 64 },
  pageHeader: { marginBottom: 24, gap: 4 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  backText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  pageTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 28,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  grid: { flexDirection: 'row', gap: 24, alignItems: 'flex-start' },
  leftCol: { flex: 3, gap: 20 },
  rightCol: { flex: 2, gap: 20 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing[3],
    ...Shadow.sm,
  },
});
