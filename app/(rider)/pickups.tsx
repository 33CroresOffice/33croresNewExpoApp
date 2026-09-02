import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  Modal,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ShoppingBag,
  MapPin,
  Phone,
  X,
  Calendar,
  Package,
  FileText,
  CircleCheck as CheckCircle2,
  Clock,
  Navigation,
  Save,
  IndianRupee,
} from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format } from 'date-fns';
import { resolveRider } from '@/utils/riderLookup';

const GRADIENT_TOP = '#1A2E3A';
const GRADIENT_MID = '#1E3D50';
const GRADIENT_BOT = '#235068';
const ACCENT = '#3AAFE4';

interface PickupItem {
  id: string;
  flower_type_id: string;
  quantity: number;
  unit_type: string | null;
  price_per_unit: number | null;
  total_price: number | null;
  price_set_by: 'vendor' | 'rider' | null;
  flower_type: { display_name: string; unit_type: string } | null;
}

interface PickupOrder {
  id: string;
  order_number: string;
  status: string;
  requirement_date: string | null;
  order_date: string | null;
  total_amount: number | null;
  notes: string | null;
  pickup_notes: string | null;
  pickup_assigned_at: string | null;
  picked_up_at: string | null;
  vendor: {
    business_name: string | null;
    contact_person: string | null;
    mobile: string | null;
    address: string | null;
    city: string | null;
  } | null;
  items: PickupItem[] | null;
}

const statusMeta: Record<string, { color: string; bg: string; label: string }> = {
  accepted: { color: '#0891b2', bg: '#e0f2fe', label: 'Pending Pickup' },
  fulfilled: { color: Colors.success, bg: Colors.successSurface, label: 'Picked Up' },
  sent: { color: Colors.warning, bg: Colors.warningSurface, label: 'Sent' },
  draft: { color: Colors.textTertiary, bg: Colors.neutral[100], label: 'Draft' },
  cancelled: { color: Colors.error, bg: Colors.errorSurface, label: 'Cancelled' },
};

const statusStyle = (status: string) =>
  statusMeta[status] ?? { color: Colors.textTertiary, bg: Colors.neutral[100], label: status };

export default function RiderPickups() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const isWeb = Platform.OS === 'web';

  const [riderId, setRiderId] = useState<string | null>(null);
  const [orders, setOrders] = useState<PickupOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<PickupOrder | null>(null);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [savingPrices, setSavingPrices] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [priceSaved, setPriceSaved] = useState(false);
  const [markingPickedUp, setMarkingPickedUp] = useState(false);
  const [pickupError, setPickupError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;

    let rId = riderId;
    if (!rId) {
      const riderData = await resolveRider(profile.id, profile.mobile, 'id');
      if (!riderData) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      rId = riderData.id;
      setRiderId(rId);
    }

    const { data, error } = await supabase
      .from('procurement_orders')
      .select(
        'id, order_number, status, requirement_date, order_date, total_amount, notes, pickup_notes, pickup_assigned_at, picked_up_at, vendor:vendors(business_name, contact_person, mobile, address, city), items:procurement_order_items(id, flower_type_id, quantity, unit_type, price_per_unit, total_price, price_set_by, flower_type:flower_types(display_name, unit_type))'
      )
      .eq('pickup_rider_id', rId)
      .not('status', 'eq', 'cancelled')
      .order('pickup_assigned_at', { ascending: false });

    if (!error && data) {
      setOrders(data as unknown as PickupOrder[]);
    }
    setLoading(false);
    setRefreshing(false);
  }, [profile?.id, riderId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const openDetail = (o: PickupOrder) => {
    setSelected(o);
    setPriceError(null);
    setPickupError(null);
    const inputs: Record<string, string> = {};
    o.items?.forEach((it) => {
      inputs[it.id] = it.total_price != null ? String(it.total_price) : '';
    });
    setPriceInputs(inputs);
    // If every item already has a price saved in DB, treat as already saved
    const allAlreadyPriced = (o.items ?? []).length > 0 &&
      (o.items ?? []).every((it) => it.price_per_unit != null && it.price_per_unit > 0);
    setPriceSaved(allAlreadyPriced);
  };

  const markPickedUp = async () => {
    if (!selected) return;
    const allPriced = selected.items?.every((it) => it.price_per_unit != null && it.price_per_unit > 0);
    if (!allPriced) {
      setPickupError('Enter and save prices for all items before marking as picked up');
      return;
    }
    setMarkingPickedUp(true);
    setPickupError(null);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('procurement_orders')
      .update({ status: 'fulfilled', picked_up_at: now })
      .eq('id', selected.id);
    setMarkingPickedUp(false);
    if (error) {
      setPickupError('Failed to mark as picked up. Try again.');
      return;
    }
    const updated = { ...selected, status: 'fulfilled', picked_up_at: now };
    setSelected(updated);
    setOrders((prev) => prev.map((o) => (o.id === selected.id ? updated : o)));
  };

  const savePrices = async () => {
    if (!selected?.items) return;
    setPriceError(null);

    const updates: { id: string; price_per_unit: number; quantity: number }[] = [];
    for (const it of selected.items) {
      // Vendor-set prices are locked — skip them
      if (it.price_set_by === 'vendor') continue;
      const raw = (priceInputs[it.id] ?? '').trim();
      if (!raw) {
        setPriceError('Enter total price for all items');
        return;
      }
      const totalPrice = parseFloat(raw);
      if (isNaN(totalPrice) || totalPrice < 0) {
        setPriceError('Prices must be valid numbers');
        return;
      }
      const qty = Number(it.quantity);
      const perUnit = qty > 0 ? Math.round((totalPrice / qty) * 100) / 100 : 0;
      updates.push({ id: it.id, price_per_unit: perUnit, quantity: qty });
    }

    if (updates.length === 0) {
      setPriceError('All prices are already set by the vendor');
      return;
    }

    setSavingPrices(true);
    let newTotal = 0;
    // Add vendor-set prices (already in DB) to the order total
    for (const it of selected.items) {
      if (it.price_set_by === 'vendor') {
        newTotal += Number(it.total_price ?? 0);
      }
    }
    for (const u of updates) {
      // total_price is a generated column (quantity * price_per_unit) — computed by DB
      const derivedTotal = Math.round(u.price_per_unit * u.quantity * 100) / 100;
      newTotal += derivedTotal;
      const { error } = await supabase
        .rpc('update_pickup_item_prices', {
          p_item_id: u.id,
          p_price_per_unit: u.price_per_unit,
          p_total_price: 0,
        });
      if (error) {
        setSavingPrices(false);
        setPriceError(`Failed: ${error.message || error.code || 'unknown'}`);
        return;
      }
    }

    const { error: orderErr } = await supabase
      .rpc('update_pickup_order_total', {
        p_order_id: selected.id,
        p_total_amount: Math.round(newTotal * 100) / 100,
      });

    setSavingPrices(false);
    if (orderErr) {
      setPriceError('Prices saved but total update failed');
      return;
    }

    const updatedItems = selected.items.map((it) => {
      const u = updates.find((x) => x.id === it.id);
      return u ? { ...it, price_per_unit: u.price_per_unit, total_price: Math.round(u.price_per_unit * u.quantity * 100) / 100 } : it;
    });
    setSelected({ ...selected, items: updatedItems, total_amount: Math.round(newTotal * 100) / 100 });
    setOrders((prev) => prev.map((o) => (o.id === selected.id ? { ...o, items: updatedItems, total_amount: Math.round(newTotal * 100) / 100 } : o)));
    setPriceSaved(true);
  };

  const pendingCount = orders.filter((o) => o.status !== 'fulfilled').length;
  const doneCount = orders.filter((o) => o.status === 'fulfilled').length;

  const isPickupActive = (status: string) => status !== 'fulfilled' && status !== 'cancelled';

  const renderItems = (o: PickupOrder) => {
    if (!o.items || o.items.length === 0) return null;
    const canEdit = isPickupActive(o.status);
    const allPriced = o.items.every((it) =>
      it.price_set_by === 'vendor'
        ? it.price_per_unit != null && it.price_per_unit > 0
        : (priceInputs[it.id] ?? '').trim() !== '' && !isNaN(parseFloat((priceInputs[it.id] ?? '').trim()))
    );
    const computedTotal = canEdit
      ? o.items.reduce((sum, it) => {
          if (it.price_set_by === 'vendor') {
            return sum + (Number(it.total_price ?? 0));
          }
          const raw = (priceInputs[it.id] ?? '').trim();
          const p = raw ? parseFloat(raw) : 0;
          return sum + (isNaN(p) ? 0 : p);
        }, 0)
      : Number(o.total_amount ?? 0);

    return (
      <View style={mStyles.detailCard}>
        <View style={mStyles.detailCardHeader}>
          <View style={[mStyles.detailIconWrap, { backgroundColor: Colors.primarySurface }]}>
            <Package size={16} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <Text style={mStyles.detailCardTitle}>Items ({o.items.length})</Text>
        </View>
        {o.items.map((it, idx) => (
          <View key={it.id} style={[mStyles.itemRow, idx === o.items!.length - 1 && mStyles.itemRowLast]}>
            <View style={{ flex: 1 }}>
              <Text style={mStyles.itemName}>{it.flower_type?.display_name ?? 'Flower'}</Text>
              <Text style={mStyles.itemQty}>
                {Number(it.quantity)} {it.unit_type ?? it.flower_type?.unit_type ?? 'units'}
              </Text>
            </View>
            {canEdit && it.price_set_by !== 'vendor' && it.price_per_unit == null ? (
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <View style={mStyles.priceInputWrap}>
                  <IndianRupee size={12} color={Colors.textTertiary} strokeWidth={2} />
                  <TextInput
                    style={mStyles.priceInput}
                    value={priceInputs[it.id] ?? ''}
                    onChangeText={(v) => { setPriceInputs((p) => ({ ...p, [it.id]: v })); setPriceSaved(false); }}
                    placeholder="Total price"
                    placeholderTextColor={Colors.textTertiary}
                    keyboardType="numeric"
                    returnKeyType="done"
                  />
                </View>
                {(() => {
                  const raw = (priceInputs[it.id] ?? '').trim();
                  const total = raw ? parseFloat(raw) : NaN;
                  const qty = Number(it.quantity);
                  if (!isNaN(total) && total > 0 && qty > 0) {
                    const perUnit = Math.round((total / qty) * 100) / 100;
                    return (
                      <Text style={mStyles.itemPricePerUnit}>
                        ₹{perUnit.toLocaleString('en-IN')}/unit
                      </Text>
                    );
                  }
                  return null;
                })()}
              </View>
            ) : (
              <View style={{ alignItems: 'flex-end' }}>
                {it.total_price != null && (
                  <Text style={mStyles.itemPrice}>
                    ₹{Number(it.total_price).toLocaleString('en-IN')}
                  </Text>
                )}
                {it.price_per_unit != null && (
                  <Text style={mStyles.itemPricePerUnit}>
                    ₹{Number(it.price_per_unit).toLocaleString('en-IN')}/unit
                  </Text>
                )}
                {canEdit && it.price_set_by === 'vendor' && (
                  <Text style={[mStyles.itemPricePerUnit, { fontStyle: 'italic' }]}>
                    Set by vendor
                  </Text>
                )}
              </View>
            )}
          </View>
        ))}
        <View style={mStyles.itemsTotalRow}>
          <Text style={mStyles.itemsTotalLabel}>Total</Text>
          <Text style={mStyles.itemsTotalValue}>
            ₹{Math.round(computedTotal * 100) / 100 < 0 ? 0 : Math.round(computedTotal * 100) / 100}
          </Text>
        </View>
        {canEdit && (
          <View style={mStyles.priceActionWrap}>
            {priceError && <Text style={mStyles.priceErrorText}>{priceError}</Text>}
            {priceSaved && (
              <View style={mStyles.priceSavedRow}>
                <CheckCircle2 size={14} color={Colors.success} strokeWidth={2} />
                <Text style={mStyles.priceSavedText}>Prices saved</Text>
              </View>
            )}
            <TouchableOpacity
              style={[mStyles.saveBtn, savingPrices && mStyles.saveBtnDisabled]}
              onPress={savePrices}
              disabled={savingPrices}
            >
              {savingPrices ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Save size={14} color="#FFF" strokeWidth={2} />
                  <Text style={mStyles.saveBtnText}>Save Prices</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
        {isPickupActive(o.status) && (
          <View style={mStyles.pickupActionWrap}>
            {pickupError && <Text style={mStyles.priceErrorText}>{pickupError}</Text>}
            <TouchableOpacity
              style={[
                mStyles.pickupBtn,
                (!priceSaved || !allPriced) && mStyles.pickupBtnDisabled,
                markingPickedUp && mStyles.pickupBtnDisabled,
              ]}
              onPress={markPickedUp}
              disabled={!priceSaved || !allPriced || markingPickedUp}
            >
              {markingPickedUp ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <CheckCircle2 size={16} color="#FFF" strokeWidth={2} />
                  <Text style={mStyles.pickupBtnText}>Picked Up</Text>
                </>
              )}
            </TouchableOpacity>
            {!priceSaved && (
              <Text style={mStyles.pickupHintText}>Save prices to enable pickup confirmation</Text>
            )}
          </View>
        )}
        {o.status === 'fulfilled' && o.picked_up_at && (
          <View style={mStyles.pickedUpInfoRow}>
            <CheckCircle2 size={14} color={Colors.success} strokeWidth={2} />
            <Text style={mStyles.pickedUpInfoText}>
              Picked up on {format(new Date(o.picked_up_at), 'dd MMM yyyy, hh:mm a')}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderDetail = () => {
    if (!selected) return null;
    const o = selected;
    const vendor = o.vendor as any;
    const ss = statusStyle(o.status);

    return (
      <Modal transparent animationType="slide" visible={!!selected}>
        <View style={mStyles.modalOverlay}>
          <Pressable style={mStyles.modalBackdrop} onPress={() => setSelected(null)} />
          <View style={[mStyles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={mStyles.modalHandle} />
            <View style={mStyles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={mStyles.modalTitle}>{o.order_number}</Text>
                <View style={[mStyles.statusBadge, { backgroundColor: ss.bg }]}>
                  <Text style={[mStyles.statusBadgeText, { color: ss.color }]}>{ss.label}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setSelected(null)} style={mStyles.modalClose}>
                <X size={20} color={Colors.textTertiary} strokeWidth={1.8} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={mStyles.detailSection}>
                {/* Vendor */}
                <View style={mStyles.detailCard}>
                  <View style={mStyles.detailCardHeader}>
                    <View style={[mStyles.detailIconWrap, { backgroundColor: '#e0f2fe' }]}>
                      <ShoppingBag size={16} color="#0891b2" strokeWidth={1.8} />
                    </View>
                    <Text style={mStyles.detailCardTitle}>Vendor</Text>
                  </View>
                  <Text style={mStyles.detailBigText}>{vendor?.business_name ?? vendor?.contact_person ?? '—'}</Text>
                  {vendor?.contact_person && vendor?.business_name && (
                    <Text style={mStyles.detailSubText}>{vendor.contact_person}</Text>
                  )}
                  {vendor?.mobile && (
                    <View style={mStyles.detailRow}>
                      <Phone size={13} color={Colors.textTertiary} strokeWidth={1.8} />
                      <Text style={mStyles.detailSmallText}>{vendor.mobile}</Text>
                    </View>
                  )}
                  {(vendor?.address || vendor?.city) && (
                    <View style={mStyles.detailRow}>
                      <MapPin size={13} color={Colors.textTertiary} strokeWidth={1.8} />
                      <Text style={mStyles.detailSmallText} numberOfLines={3}>
                        {[vendor.address, vendor.city].filter(Boolean).join(', ')}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Schedule */}
                <View style={mStyles.detailCard}>
                  <View style={mStyles.detailCardHeader}>
                    <View style={[mStyles.detailIconWrap, { backgroundColor: Colors.warningSurface }]}>
                      <Calendar size={16} color={Colors.warning} strokeWidth={1.8} />
                    </View>
                    <Text style={mStyles.detailCardTitle}>Schedule</Text>
                  </View>
                  {o.requirement_date && (
                    <View style={mStyles.detailRow}>
                      <Clock size={13} color={Colors.textTertiary} strokeWidth={1.8} />
                      <Text style={mStyles.detailSmallText}>
                        Required by {format(new Date(o.requirement_date + 'T00:00:00'), 'dd MMM yyyy')}
                      </Text>
                    </View>
                  )}
                  {o.pickup_assigned_at && (
                    <View style={mStyles.detailRow}>
                      <Navigation size={13} color={Colors.textTertiary} strokeWidth={1.8} />
                      <Text style={mStyles.detailSmallText}>
                        Assigned {format(new Date(o.pickup_assigned_at), 'dd MMM yyyy, hh:mm a')}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Items with price entry */}
                {renderItems(o)}

                {/* Notes */}
                {(o.pickup_notes || o.notes) && (
                  <View style={mStyles.detailCard}>
                    <View style={mStyles.detailCardHeader}>
                      <View style={[mStyles.detailIconWrap, { backgroundColor: Colors.neutral[100] }]}>
                        <FileText size={16} color={Colors.textSecondary} strokeWidth={1.8} />
                      </View>
                      <Text style={mStyles.detailCardTitle}>Notes</Text>
                    </View>
                    {o.pickup_notes && (
                      <View style={mStyles.noteBlock}>
                        <Text style={mStyles.noteLabel}>Pickup instructions</Text>
                        <Text style={mStyles.noteText}>{o.pickup_notes}</Text>
                      </View>
                    )}
                    {o.notes && (
                      <View style={mStyles.noteBlock}>
                        <Text style={mStyles.noteLabel}>Order notes</Text>
                        <Text style={mStyles.noteText}>{o.notes}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  if (isWeb) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: '#EEF2F5' }}
        contentContainerStyle={wStyles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <LinearGradient
          colors={[GRADIENT_TOP, GRADIENT_MID, GRADIENT_BOT]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={wStyles.gradientHeader}
        >
          <View style={wStyles.headerInner}>
            <View style={wStyles.headerLeft}>
              <View style={wStyles.headerIconWrap}>
                <ShoppingBag size={22} color={ACCENT} strokeWidth={1.8} />
              </View>
              <View>
                <Text style={wStyles.headerEyebrow}>Rider Portal</Text>
                <Text style={wStyles.headerTitle}>Pickup Orders</Text>
                <Text style={wStyles.headerDate}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
              </View>
            </View>
            {orders.length > 0 && (
              <View style={wStyles.headerCountBadge}>
                <Text style={wStyles.headerCountText}>{orders.length} {orders.length === 1 ? 'order' : 'orders'}</Text>
              </View>
            )}
          </View>
        </LinearGradient>

        <View style={{ margin: 32, marginTop: 16 }}>
          {!loading && orders.length > 0 && (
            <View style={wStyles.summaryRow}>
              <View style={[wStyles.summaryChip, { backgroundColor: '#e0f2fe' }]}>
                <Clock size={14} color="#0891b2" strokeWidth={1.8} />
                <Text style={[wStyles.summaryText, { color: '#0891b2' }]}>{pendingCount} Pending</Text>
              </View>
              <View style={[wStyles.summaryChip, { backgroundColor: Colors.successSurface }]}>
                <CheckCircle2 size={14} color={Colors.success} strokeWidth={1.8} />
                <Text style={[wStyles.summaryText, { color: Colors.success }]}>{doneCount} Done</Text>
              </View>
            </View>
          )}

          {loading ? (
            <View style={wStyles.emptyState}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : orders.length === 0 ? (
            <View style={wStyles.emptyState}>
              <ShoppingBag size={32} color={Colors.textTertiary} strokeWidth={1.5} />
              <Text style={wStyles.emptyText}>No pickup orders assigned</Text>
            </View>
          ) : (
            <View style={{ gap: 12, marginTop: 16 }}>
              {orders.map((o) => {
                const vendor = o.vendor as any;
                const ss = statusStyle(o.status);
                const itemCount = o.items?.length ?? 0;
                const hasPrices = o.items?.some((it) => it.price_per_unit != null) ?? false;
                return (
                  <TouchableOpacity
                    key={o.id}
                    style={wStyles.orderCard}
                    onPress={() => openDetail(o)}
                    activeOpacity={0.78}
                  >
                    <View style={wStyles.orderCardTop}>
                      <View style={[wStyles.orderIconWrap, { backgroundColor: ss.bg }]}>
                        <ShoppingBag size={18} color={ss.color} strokeWidth={1.8} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={wStyles.orderNumber}>{o.order_number}</Text>
                        <Text style={wStyles.orderVendor} numberOfLines={1}>
                          {vendor?.business_name ?? vendor?.contact_person ?? '—'}
                        </Text>
                      </View>
                      <View style={[wStyles.statusBadge, { backgroundColor: ss.bg }]}>
                        <Text style={[wStyles.statusBadgeText, { color: ss.color }]}>{ss.label}</Text>
                      </View>
                    </View>
                    <View style={wStyles.orderCardBottom}>
                      {o.requirement_date && (
                        <View style={wStyles.orderMetaRow}>
                          <Calendar size={12} color={Colors.textTertiary} strokeWidth={1.8} />
                          <Text style={wStyles.orderMetaText}>
                            {format(new Date(o.requirement_date + 'T00:00:00'), 'dd MMM yyyy')}
                          </Text>
                        </View>
                      )}
                      <View style={wStyles.orderMetaRow}>
                        <Package size={12} color={Colors.textTertiary} strokeWidth={1.8} />
                        <Text style={wStyles.orderMetaText}>{itemCount} {itemCount === 1 ? 'item' : 'items'}</Text>
                      </View>
                      {o.status === 'accepted' && (
                        <View style={[wStyles.orderMetaRow, { backgroundColor: hasPrices ? Colors.successSurface : '#fef3c7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full }]}>
                          <Text style={[wStyles.orderMetaText, { color: hasPrices ? Colors.success : Colors.warning, fontFamily: Typography.fontFamily.sansSemiBold }]}>
                            {hasPrices ? 'Priced' : 'Needs pricing'}
                          </Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {renderDetail()}
      </ScrollView>
    );
  }

  return (
    <View style={[mStyles.container, { backgroundColor: '#EEF2F5' }]}>
      <LinearGradient
        colors={[GRADIENT_TOP, GRADIENT_MID, GRADIENT_BOT]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[mStyles.gradientHeader, { paddingTop: insets.top + Spacing[3] }]}
      >
        <View style={mStyles.headerTopRow}>
          <View style={mStyles.headerLeft}>
            <View style={mStyles.headerIconWrap}>
              <ShoppingBag size={18} color={ACCENT} strokeWidth={1.8} />
            </View>
            <View>
              <Text style={mStyles.headerEyebrow}>Rider Portal</Text>
              <Text style={mStyles.headerTitle}>Pickup Orders</Text>
              <Text style={mStyles.headerDate}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
            </View>
          </View>
          {orders.length > 0 && (
            <View style={mStyles.headerCountPill}>
              <Text style={mStyles.headerCountText}>{orders.length}</Text>
            </View>
          )}
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[mStyles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      >
        {loading && (
          <View style={mStyles.loadingState}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        )}
        {!loading && orders.length === 0 && (
          <View style={mStyles.emptyState}>
            <ShoppingBag size={36} color={Colors.textTertiary} strokeWidth={1.5} />
            <Text style={mStyles.emptyTitle}>No pickup orders</Text>
            <Text style={mStyles.emptyText}>You have no procurement pickups assigned yet.</Text>
          </View>
        )}
        {!loading && orders.map((o) => {
          const vendor = o.vendor as any;
          const ss = statusStyle(o.status);
          const itemCount = o.items?.length ?? 0;
          const hasPrices = o.items?.some((it) => it.price_per_unit != null) ?? false;
          return (
            <TouchableOpacity
              key={o.id}
              style={mStyles.card}
              onPress={() => openDetail(o)}
              activeOpacity={0.78}
            >
              <View style={mStyles.cardTopRow}>
                <View style={[mStyles.cardIconWrap, { backgroundColor: ss.bg }]}>
                  <ShoppingBag size={18} color={ss.color} strokeWidth={1.8} />
                </View>
                <View style={mStyles.cardInfo}>
                  <Text style={mStyles.cardOrderNumber} numberOfLines={1}>{o.order_number}</Text>
                  <Text style={mStyles.cardVendor} numberOfLines={1}>
                    {vendor?.business_name ?? vendor?.contact_person ?? '—'}
                  </Text>
                </View>
                <View style={[mStyles.statusBadge, { backgroundColor: ss.bg }]}>
                  <Text style={[mStyles.statusBadgeText, { color: ss.color }]}>{ss.label}</Text>
                </View>
              </View>
              <View style={mStyles.cardDivider} />
              <View style={mStyles.cardBody}>
                {o.requirement_date && (
                  <View style={mStyles.cardDetailRow}>
                    <Calendar size={13} color={Colors.textTertiary} strokeWidth={1.8} />
                    <Text style={mStyles.cardDetailText}>
                      {format(new Date(o.requirement_date + 'T00:00:00'), 'dd MMM yyyy')}
                    </Text>
                  </View>
                )}
                <View style={mStyles.cardDetailRow}>
                  <Package size={13} color={Colors.textTertiary} strokeWidth={1.8} />
                  <Text style={mStyles.cardDetailText}>{itemCount} {itemCount === 1 ? 'item' : 'items'}</Text>
                </View>
                {o.status === 'accepted' && (
                  <View style={[mStyles.cardDetailRow, { backgroundColor: hasPrices ? Colors.successSurface : '#fef3c7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, alignSelf: 'flex-start' }]}>
                    <Text style={[mStyles.cardDetailText, { color: hasPrices ? Colors.success : Colors.warning, fontFamily: Typography.fontFamily.sansSemiBold }]}>
                      {hasPrices ? 'Priced' : 'Needs pricing'}
                    </Text>
                  </View>
                )}
                {vendor?.mobile && (
                  <View style={mStyles.cardDetailRow}>
                    <Phone size={13} color={Colors.textTertiary} strokeWidth={1.8} />
                    <Text style={mStyles.cardDetailText}>{vendor.mobile}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {renderDetail()}
    </View>
  );
}

const mStyles = StyleSheet.create({
  container: { flex: 1 },
  gradientHeader: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[4],
  },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], flex: 1 },
  headerIconWrap: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerEyebrow: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'], color: '#FFFFFF', letterSpacing: -0.3,
  },
  headerDate: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.5)', marginTop: 2,
  },
  headerCountPill: {
    minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  headerCountText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: '#FFFFFF',
  },
  scrollContent: { padding: Spacing[4], gap: Spacing[3] },
  loadingState: { paddingVertical: 60, alignItems: 'center' },
  card: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  cardTopRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[4], paddingTop: Spacing[4], paddingBottom: Spacing[3],
    gap: Spacing[3],
  },
  cardIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardInfo: { flex: 1, gap: 2 },
  cardOrderNumber: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  cardVendor: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  statusBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, flexShrink: 0,
  },
  statusBadgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11,
  },
  cardDivider: { height: 1, backgroundColor: Colors.divider, marginHorizontal: Spacing[4] },
  cardBody: { padding: Spacing[4], gap: Spacing[2] },
  cardDetailRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  cardDetailText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm, color: Colors.textSecondary,
  },
  emptyState: { paddingVertical: 60, alignItems: 'center', gap: Spacing[3] },
  emptyTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary,
  },
  emptyText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
    textAlign: 'center',
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '90%', paddingTop: 12,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.neutral[200],
    alignSelf: 'center', marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: Spacing[5], paddingBottom: Spacing[4],
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xl, color: Colors.textPrimary,
    marginBottom: 8,
  },
  modalClose: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.neutral[100],
    alignItems: 'center', justifyContent: 'center',
  },
  detailSection: { padding: Spacing[5], gap: Spacing[4] },
  detailCard: {
    backgroundColor: Colors.neutral[50], borderRadius: Radius.lg,
    padding: Spacing[4], gap: Spacing[2],
  },
  detailCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], marginBottom: Spacing[1] },
  detailIconWrap: {
    width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  detailCardTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary,
  },
  detailBigText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  detailSubText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary,
  },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 },
  detailSmallText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, flex: 1, lineHeight: 20,
  },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  itemRowLast: { borderBottomWidth: 0 },
  itemName: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary,
  },
  itemQty: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2,
  },
  itemPricePerUnit: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  itemPrice: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary, marginTop: 2,
  },
  priceInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: 8, paddingVertical: 4, backgroundColor: Colors.white,
    minWidth: 100,
  },
  priceInput: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm,
    color: Colors.textPrimary, paddingVertical: 2, paddingHorizontal: 2,
    minWidth: 40, textAlign: 'right',
  },
  priceUnitLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary,
  },
  itemsTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 12, marginTop: 4, borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  itemsTotalLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary,
  },
  itemsTotalValue: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  priceActionWrap: { marginTop: Spacing[3], gap: Spacing[2] },
  priceErrorText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.error,
  },
  priceSavedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priceSavedText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.success,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.primary, paddingVertical: 10, borderRadius: Radius.md,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: '#FFFFFF',
  },
  pickupActionWrap: { marginTop: Spacing[3], gap: Spacing[2], borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing[3] },
  pickupBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.success, paddingVertical: 14, borderRadius: Radius.md,
  },
  pickupBtnDisabled: { opacity: 0.5 },
  pickupBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: '#FFFFFF',
  },
  pickupHintText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, textAlign: 'center',
  },
  pickedUpInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing[2] },
  pickedUpInfoText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.success,
  },
  noteBlock: { gap: 2, marginTop: 4 },
  noteLabel: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textTertiary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  noteText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 20,
  },
});

const wStyles = StyleSheet.create({
  content: { paddingBottom: 64, gap: 0 },
  gradientHeader: { paddingBottom: 0 },
  headerInner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 32, paddingTop: 32, paddingBottom: 20,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  headerIconWrap: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerEyebrow: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 11,
    color: 'rgba(255,255,255,0.55)', letterSpacing: 1, textTransform: 'uppercase',
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold, fontSize: 30,
    color: '#FFFFFF', letterSpacing: -0.5, marginTop: 2,
  },
  headerDate: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.5)', marginTop: 3,
  },
  headerCountBadge: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerCountText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: 'rgba(255,255,255,0.9)',
  },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  summaryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full,
  },
  summaryText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm,
  },
  emptyState: { paddingVertical: 40, alignItems: 'center', gap: 10 },
  emptyText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
  },
  orderCard: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 12,
    cursor: 'pointer' as any,
  },
  orderCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orderIconWrap: {
    width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  orderNumber: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  orderVendor: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  statusBadge: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, flexShrink: 0,
  },
  statusBadgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11,
  },
  orderCardBottom: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' as any },
  orderMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  orderMetaText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary,
  },
});
