import React, { useEffect, useState, useCallback } from 'react';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, Modal,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Package, Store, Calendar, FileText, IndianRupee, CreditCard as Edit3, Check, X, Clock, Truck, CircleCheck as CheckCircle, Circle as XCircle, ChevronDown } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { ProcurementOrder, ProcurementOrderItem, ProcurementOrderStatus } from '@/types/database';

const STATUS_CONFIG: Record<string, { bg: string; text: string; border: string; icon: any; label: string }> = {
  draft:     { bg: Colors.neutral[100],    text: Colors.neutral[600],   border: Colors.neutral[300],  icon: Clock,        label: 'Draft' },
  sent:      { bg: '#E3F2FD',             text: '#1565C0',             border: '#90CAF9',            icon: Truck,        label: 'Sent' },
  accepted:  { bg: Colors.successSurface, text: Colors.success,        border: '#A5D6A7',            icon: CheckCircle,  label: 'Accepted' },
  fulfilled: { bg: '#E8F5E9',             text: '#1B5E20',             border: '#81C784',            icon: CheckCircle,  label: 'Fulfilled' },
  cancelled: { bg: Colors.errorSurface,   text: Colors.error,          border: '#EF9A9A',            icon: XCircle,      label: 'Cancelled' },
};

const STATUS_OPTIONS: ProcurementOrderStatus[] = ['draft', 'sent', 'accepted', 'fulfilled', 'cancelled'];

export default function ProcurementOrderDetailScreen() {
  return (
    <ModuleGuard module="procurement">
      <ProcurementOrderDetailScreenContent />
    </ModuleGuard>
  );
}

function ProcurementOrderDetailScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { id } = useLocalSearchParams<{ id: string }>();

  const [order, setOrder] = useState<ProcurementOrder | null>(null);
  const [items, setItems] = useState<ProcurementOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      const [orderRes, itemsRes] = await Promise.all([
        supabase
          .from('procurement_orders')
          .select('*, vendor:vendors(business_name, contact_person, mobile, email, address, city)')
          .eq('id', id)
          .maybeSingle(),
        supabase
          .from('procurement_order_items')
          .select('*, flower_type:flower_types(display_name, unit_type)')
          .eq('procurement_order_id', id)
          .order('created_at'),
      ]);
      if (orderRes.data) setOrder(orderRes.data as any);
      if (itemsRes.data) setItems(itemsRes.data as any[]);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const startEditPrice = (item: ProcurementOrderItem) => {
    setEditingItemId(item.id);
    setEditPrice(item.total_price != null ? String(item.total_price) : '');
  };

  const cancelEdit = () => {
    setEditingItemId(null);
    setEditPrice('');
  };

  const savePrice = async (item: ProcurementOrderItem) => {
    const totalPrice = parseFloat(editPrice);
    if (isNaN(totalPrice) || totalPrice < 0) return;
    const unitPrice = item.quantity > 0 ? totalPrice / item.quantity : 0;
    setSaving(true);
    await supabase
      .from('procurement_order_items')
      .update({ price_per_unit: unitPrice })
      .eq('id', item.id);

    const { data: freshItems } = await supabase
      .from('procurement_order_items')
      .select('total_price')
      .eq('procurement_order_id', id!);

    if (freshItems) {
      const newTotal = freshItems.reduce((sum, i) => sum + (i.total_price ?? 0), 0);
      await supabase.from('procurement_orders').update({ total_amount: newTotal }).eq('id', id!);
    }

    await load();
    setEditingItemId(null);
    setEditPrice('');
    setSaving(false);
  };

  const updateStatus = async (status: ProcurementOrderStatus) => {
    setUpdatingStatus(true);
    await supabase.from('procurement_orders').update({ status }).eq('id', id!);
    setOrder(prev => prev ? { ...prev, status } : prev);
    setUpdatingStatus(false);
    setShowStatusModal(false);
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

  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.draft;
  const StatusIcon = cfg.icon;
  const vendor = order.vendor as any;
  const totalPriced = items.filter(i => i.price_per_unit != null).length;
  const allPriced = totalPriced === items.length && items.length > 0;

  return (
    <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top }]}>
      <View style={[s.header, isWeb && s.headerWeb]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={20} color={Colors.textPrimary} strokeWidth={1.8} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={s.headerIcon}>
            <Package size={16} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={s.headerTitle}>{order.order_number}</Text>
            <Text style={s.headerSub}>
              {order.created_at ? format(parseISO(order.created_at), 'dd MMM yyyy') : '—'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[s.statusBtn, { backgroundColor: cfg.bg, borderColor: cfg.border }]}
          onPress={() => setShowStatusModal(true)}
          activeOpacity={0.8}
        >
          <StatusIcon size={11} color={cfg.text} strokeWidth={2.5} />
          <Text style={[s.statusBtnText, { color: cfg.text }]}>{cfg.label}</Text>
          <ChevronDown size={12} color={cfg.text} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={[s.content, isWeb && s.contentWeb]} showsVerticalScrollIndicator={false}>

        <View style={s.card}>
          <View style={s.cardHeader}>
            <Store size={14} color={Colors.primary} strokeWidth={1.8} />
            <Text style={s.cardTitle}>Vendor</Text>
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
            <Calendar size={14} color={Colors.primary} strokeWidth={1.8} />
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

        <View style={s.card}>
          <View style={s.cardHeaderRow}>
            <View style={s.cardHeader}>
              <Package size={14} color={Colors.primary} strokeWidth={1.8} />
              <Text style={s.cardTitle}>Items</Text>
            </View>
            <View style={s.pricedBadge}>
              <Text style={s.pricedBadgeText}>
                {totalPriced}/{items.length} priced
              </Text>
            </View>
          </View>

          {items.length === 0 ? (
            <Text style={s.emptyText}>No items found</Text>
          ) : (
            items.map((item, idx) => {
              const ft = item.flower_type as any;
              const isEditing = editingItemId === item.id;
              return (
                <View key={item.id} style={[s.itemRow, idx < items.length - 1 && s.itemRowBorder]}>
                  <View style={s.itemInfo}>
                    <Text style={s.itemName}>{ft?.display_name ?? 'Unknown'}</Text>
                    <Text style={s.itemQty}>
                      {item.quantity} {item.unit_type ?? ft?.unit_type ?? ''}
                    </Text>
                  </View>

                  <View style={s.itemPriceCol}>
                    {isEditing ? (
                      <View style={s.editCol}>
                        <View style={s.editRow}>
                          <View style={s.priceInputWrap}>
                            <Text style={s.rupeeSymbol}>₹</Text>
                            <TextInput
                              style={s.priceInput}
                              value={editPrice}
                              onChangeText={setEditPrice}
                              keyboardType="decimal-pad"
                              placeholder="Total price"
                              placeholderTextColor={Colors.textDisabled}
                              autoFocus
                            />
                          </View>
                          <TouchableOpacity
                            style={s.iconBtn}
                            onPress={() => savePrice(item)}
                            disabled={saving}
                          >
                            {saving ? (
                              <ActivityIndicator size="small" color={Colors.success} />
                            ) : (
                              <Check size={15} color={Colors.success} strokeWidth={2.5} />
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity style={s.iconBtn} onPress={cancelEdit}>
                            <X size={15} color={Colors.error} strokeWidth={2.5} />
                          </TouchableOpacity>
                        </View>
                        {(() => {
                          const t = parseFloat(editPrice);
                          if (!isNaN(t) && item.quantity > 0) {
                            return (
                              <Text style={s.unitHint}>
                                ₹{(t / item.quantity).toFixed(2)} / {item.unit_type ?? (item.flower_type as any)?.unit_type ?? 'unit'}
                              </Text>
                            );
                          }
                          return null;
                        })()}
                      </View>
                    ) : (
                      <View style={s.priceDisplayRow}>
                        <View style={s.priceTextCol}>
                          {item.price_per_unit != null ? (
                            <>
                              <Text style={s.priceTotal}>₹{Number(item.total_price ?? 0).toLocaleString('en-IN')}</Text>
                              <Text style={s.pricePerUnit}>
                                ₹{Number(item.price_per_unit).toFixed(2)} / {item.unit_type ?? (item.flower_type as any)?.unit_type ?? 'unit'}
                              </Text>
                            </>
                          ) : (
                            <Text style={s.noPriceText}>No price set</Text>
                          )}
                        </View>
                        <TouchableOpacity style={s.editPriceBtn} onPress={() => startEditPrice(item)} activeOpacity={0.7}>
                          <IndianRupee size={12} color={Colors.primary} strokeWidth={2} />
                          <Edit3 size={11} color={Colors.primary} strokeWidth={2} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          )}

          {allPriced && (
            <View style={s.totalBox}>
              <Text style={s.totalBoxLabel}>Order Total</Text>
              <Text style={s.totalBoxValue}>₹{Number(order.total_amount).toLocaleString('en-IN')}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={showStatusModal} transparent animationType="fade" onRequestClose={() => setShowStatusModal(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowStatusModal(false)}>
          <View style={[s.statusModal, isWeb && s.statusModalWeb]}>
            <View style={s.statusModalHeader}>
              <Text style={s.statusModalTitle}>Update Status</Text>
              <TouchableOpacity onPress={() => setShowStatusModal(false)} style={s.closeBtn}>
                <X size={15} color={Colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            {STATUS_OPTIONS.map(st => {
              const sc = STATUS_CONFIG[st];
              const isActive = order.status === st;
              const Icon = sc.icon;
              return (
                <TouchableOpacity
                  key={st}
                  style={[s.statusOption, isActive && s.statusOptionActive]}
                  onPress={() => !isActive && updateStatus(st)}
                  activeOpacity={isActive ? 1 : 0.8}
                  disabled={updatingStatus}
                >
                  <View style={[s.statusOptionIcon, { backgroundColor: sc.bg }]}>
                    <Icon size={13} color={sc.text} strokeWidth={2} />
                  </View>
                  <Text style={[s.statusOptionText, isActive && { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold }]}>
                    {sc.label}
                  </Text>
                  {isActive && <CheckCircle size={15} color={Colors.primary} strokeWidth={2} />}
                  {updatingStatus && !isActive && <ActivityIndicator size="small" color={Colors.textDisabled} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.neutral[50] },
  center: { justifyContent: 'center', alignItems: 'center', flex: 1 },
  notFoundText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textSecondary },
  backLink: { marginTop: Spacing[3] },
  backLinkText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.primary },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    paddingHorizontal: Spacing[5], paddingVertical: Spacing[4],
    backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerWeb: { paddingHorizontal: Spacing[8] },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  headerIcon: {
    width: 36, height: 36, borderRadius: Radius.md,
    backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  headerSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },

  statusBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: Radius.full, borderWidth: 1,
  },
  statusBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 12 },

  scroll: { flex: 1 },
  content: { padding: Spacing[5], gap: Spacing[4] },
  contentWeb: { padding: Spacing[8], maxWidth: 800, alignSelf: 'center', width: '100%' },

  card: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: Spacing[5], borderWidth: 1, borderColor: Colors.border,
    gap: Spacing[3], ...Shadow.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },

  vendorName: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  vendorMeta: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },

  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  detailValue: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  totalAmount: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.primary },

  notesBox: {
    flexDirection: 'row', gap: Spacing[2], alignItems: 'flex-start',
    backgroundColor: Colors.neutral[50], borderRadius: Radius.md,
    padding: Spacing[3], borderWidth: 1, borderColor: Colors.border,
  },
  notesText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, flex: 1 },

  pricedBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full,
    backgroundColor: Colors.primarySurface,
  },
  pricedBadgeText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11, color: Colors.primary },
  emptyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textDisabled, textAlign: 'center', paddingVertical: Spacing[4] },

  itemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing[3], gap: Spacing[3],
  },
  itemRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  itemInfo: { flex: 1 },
  itemName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  itemQty: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 12, color: Colors.textTertiary, marginTop: 2, textTransform: 'capitalize' },

  itemPriceCol: { alignItems: 'flex-end' },
  priceDisplayRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  priceTextCol: { alignItems: 'flex-end' },
  pricePerUnit: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary, marginTop: 1 },
  priceTotal: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  noPriceText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textDisabled, fontStyle: 'italic' },

  editPriceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingVertical: 5, paddingHorizontal: 8,
    borderRadius: Radius.sm, backgroundColor: Colors.primarySurface,
    borderWidth: 1, borderColor: Colors.primary + '40',
  },

  editCol: { alignItems: 'flex-end', gap: 4 },
  unitHint: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.primary },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  priceInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.sm,
    paddingHorizontal: Spacing[2], paddingVertical: 5,
    backgroundColor: Colors.white, minWidth: 90,
  },
  rupeeSymbol: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  priceInput: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: Colors.textPrimary, minWidth: 60, padding: 0,
  },
  iconBtn: {
    width: 30, height: 30, borderRadius: Radius.sm,
    backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center',
  },

  totalBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: Spacing[3], paddingTop: Spacing[3],
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  totalBoxLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  totalBoxValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.primary },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: Spacing[5] },
  statusModal: {
    width: '100%', backgroundColor: Colors.white,
    borderRadius: Radius.xl, padding: Spacing[5], gap: Spacing[2],
  },
  statusModalWeb: { maxWidth: 360 },
  statusModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[2] },
  statusModalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  closeBtn: {
    width: 28, height: 28, borderRadius: Radius.sm,
    backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center',
  },
  statusOption: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    paddingVertical: Spacing[3], paddingHorizontal: Spacing[3],
    borderRadius: Radius.md, borderWidth: 1, borderColor: 'transparent',
  },
  statusOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  statusOptionIcon: { width: 28, height: 28, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  statusOptionText: { flex: 1, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
});
