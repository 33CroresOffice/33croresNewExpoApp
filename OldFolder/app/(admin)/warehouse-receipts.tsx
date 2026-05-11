import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Platform, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Warehouse, Plus, X, ArrowLeft, Check, TriangleAlert as AlertTriangle, Package } from 'lucide-react-native';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { WarehouseReceipt, ProcurementOrder } from '@/types/database';

const RECEIPT_STATUS: Record<string, { bg: string; text: string; icon: any }> = {
  complete: { bg: Colors.successSurface,  text: Colors.success, icon: Check },
  partial:  { bg: Colors.warningSurface,  text: Colors.warning, icon: AlertTriangle },
  rejected: { bg: Colors.errorSurface,    text: Colors.error,   icon: X },
};

export default function WarehouseReceiptsScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [receipts, setReceipts] = useState<WarehouseReceipt[]>([]);
  const [openOrders, setOpenOrders] = useState<ProcurementOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState<{
    procurement_order_id: string;
    status: 'complete' | 'partial' | 'rejected';
    notes: string;
    items: { flower_type_id: string; ordered_quantity: string; received_quantity: string; unit_type: string; notes: string }[];
  }>({
    procurement_order_id: '',
    status: 'complete',
    notes: '',
    items: [],
  });

  const load = async () => {
    try {
      const [receiptsRes, ordersRes] = await Promise.all([
        supabase
          .from('warehouse_receipts')
          .select('*, items:warehouse_receipt_items(*, flower_type:flower_types(display_name))')
          .order('created_at', { ascending: false }),
        supabase
          .from('procurement_orders')
          .select('*, vendor:vendors(business_name, contact_person), items:procurement_order_items(*, flower_type:flower_types(display_name, unit_type))')
          .in('status', ['accepted', 'sent'])
          .order('created_at', { ascending: false }),
      ]);
      if (receiptsRes.data) setReceipts(receiptsRes.data);
      if (ordersRes.data) setOpenOrders(ordersRes.data);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const selectOrder = (orderId: string) => {
    const order = openOrders.find(o => o.id === orderId);
    if (!order) return;
    const items = (order.items ?? []).map((item: any) => ({
      flower_type_id: item.flower_type_id,
      ordered_quantity: String(item.quantity ?? 0),
      received_quantity: String(item.quantity ?? 0),
      unit_type: item.unit_type ?? item.flower_type?.unit_type ?? 'bunch',
      notes: '',
    }));
    setForm(p => ({ ...p, procurement_order_id: orderId, items }));
  };

  const save = async () => {
    if (!form.procurement_order_id) { setError('Select a procurement order'); return; }
    if (form.items.length === 0) { setError('No items to record'); return; }
    setSaving(true); setError('');
    const { data: receipt, error: err } = await supabase
      .from('warehouse_receipts')
      .insert({
        procurement_order_id: form.procurement_order_id,
        status: form.status,
        notes: form.notes.trim() || null,
      })
      .select()
      .single();
    if (err || !receipt) { setSaving(false); setError(err?.message ?? 'Failed to record receipt'); return; }
    const itemPayloads = form.items.map(i => ({
      warehouse_receipt_id: receipt.id,
      flower_type_id: i.flower_type_id,
      ordered_quantity: parseFloat(i.ordered_quantity) || 0,
      received_quantity: parseFloat(i.received_quantity) || 0,
      unit_type: i.unit_type || null,
      notes: i.notes.trim() || null,
    }));
    await supabase.from('warehouse_receipt_items').insert(itemPayloads);
    await supabase.from('procurement_orders').update({ status: form.status === 'complete' ? 'fulfilled' : 'accepted' }).eq('id', form.procurement_order_id);
    setSaving(false);
    setShowModal(false);
    load();
  };

  const openCreateModal = () => {
    setForm({ procurement_order_id: '', status: 'complete', notes: '', items: [] });
    setError('');
    setShowModal(true);
  };

  return (
    <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top }]}>
      <View style={[s.header, isWeb && s.headerWeb]}>
        {!isWeb && (
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <ArrowLeft size={22} color={Colors.textPrimary} strokeWidth={1.8} />
          </TouchableOpacity>
        )}
        <View style={s.headerLeft}>
          <View style={s.headerIcon}>
            <Warehouse size={isWeb ? 22 : 18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>Warehouse Receipts</Text>
            <Text style={s.subtitle}>{receipts.length} receipts recorded</Text>
          </View>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openCreateModal} activeOpacity={0.8}>
          <Plus size={16} color={Colors.white} strokeWidth={2} />
          <Text style={s.addBtnText}>Record Receipt</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, isWeb && s.contentWeb]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator color={Colors.primary} /></View>
        ) : receipts.length === 0 ? (
          <View style={s.emptyState}>
            <Warehouse size={40} color={Colors.textDisabled} strokeWidth={1.2} />
            <Text style={s.emptyTitle}>No receipts yet</Text>
            <Text style={s.emptySub}>Record goods received from vendors to track delivery accuracy.</Text>
          </View>
        ) : isWeb ? (
          <View style={s.tableCard}>
            <View style={s.tableHead}>
              <Text style={[s.thCell, { flex: 1 }]}>Date</Text>
              <Text style={[s.thCell, { flex: 2 }]}>Procurement Order</Text>
              <Text style={[s.thCell, { flex: 1 }]}>Status</Text>
              <Text style={[s.thCell, { flex: 1 }]}>Items</Text>
              <Text style={[s.thCell, { flex: 2 }]}>Notes</Text>
            </View>
            {receipts.map((r, i) => {
              const sc = RECEIPT_STATUS[r.status] ?? RECEIPT_STATUS.complete;
              const Icon = sc.icon;
              const items = r.items ?? [];
              const discrepancies = items.filter((it: any) => it.has_discrepancy).length;
              return (
                <View key={r.id} style={[s.tableRow, i % 2 === 1 && s.tableRowAlt]}>
                  <Text style={[s.tdCell, { flex: 1 }]}>{r.received_at ? format(parseISO(r.received_at), 'dd MMM yyyy') : '—'}</Text>
                  <Text style={[s.tdCell, { flex: 2 }]}>{(r as any).procurement_order?.order_number ?? (r.procurement_order_id ? r.procurement_order_id.slice(0, 8) : '—')}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
                      <Icon size={11} color={sc.text} strokeWidth={2} />
                      <Text style={[s.statusText, { color: sc.text }]}>{r.status}</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.tdCell}>{items.length} items</Text>
                    {discrepancies > 0 ? <Text style={[s.tdCell, { color: Colors.warning }]}>{discrepancies} discrepan.</Text> : null}
                  </View>
                  <Text style={[s.tdCell, { flex: 2 }]} numberOfLines={2}>{r.notes ?? '—'}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          receipts.map(r => {
            const sc = RECEIPT_STATUS[r.status] ?? RECEIPT_STATUS.complete;
            const Icon = sc.icon;
            const items = r.items ?? [];
            const discrepancies = items.filter((it: any) => it.has_discrepancy).length;
            return (
              <View key={r.id} style={s.receiptCard}>
                <View style={s.receiptTop}>
                  <View style={[s.receiptIcon, { backgroundColor: sc.bg }]}>
                    <Icon size={18} color={sc.text} strokeWidth={2} />
                  </View>
                  <View style={s.receiptInfo}>
                    <Text style={s.receiptDate}>{format(parseISO(r.received_at), 'dd MMM yyyy, HH:mm')}</Text>
                    <View style={[s.statusBadge, { backgroundColor: sc.bg, alignSelf: 'flex-start', marginTop: 4 }]}>
                      <Text style={[s.statusText, { color: sc.text }]}>{r.status}</Text>
                    </View>
                  </View>
                </View>
                <Text style={s.receiptItems}>{items.length} items recorded{discrepancies > 0 ? ` · ${discrepancies} discrepancy` : ''}</Text>
                {r.notes ? <Text style={s.receiptNotes}>{r.notes}</Text> : null}
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Record Warehouse Receipt</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.sectionLabel}>Procurement Order *</Text>
              {openOrders.length === 0 ? (
                <Text style={s.emptyOrders}>No accepted procurement orders to receive against. Mark an order as "accepted" first.</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing[4] }} contentContainerStyle={{ gap: 8 }}>
                  {openOrders.map(o => {
                    const vendor = o.vendor as any;
                    return (
                      <TouchableOpacity
                        key={o.id}
                        style={[s.orderChip, form.procurement_order_id === o.id && s.orderChipActive]}
                        onPress={() => selectOrder(o.id)}
                      >
                        <Text style={[s.orderChipText, form.procurement_order_id === o.id && s.orderChipTextActive]}>
                          {o.order_number}
                        </Text>
                        <Text style={[s.orderChipSub, form.procurement_order_id === o.id && { color: Colors.primary }]}>
                          {vendor?.business_name ?? vendor?.contact_person}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              <Text style={s.sectionLabel}>Receipt Status</Text>
              <View style={s.statusRow}>
                {(['complete', 'partial', 'rejected'] as const).map(st => {
                  const sc = RECEIPT_STATUS[st];
                  const Icon = sc.icon;
                  return (
                    <TouchableOpacity
                      key={st}
                      style={[s.statusChip, form.status === st && { backgroundColor: sc.bg, borderColor: sc.text }]}
                      onPress={() => setForm(p => ({ ...p, status: st }))}
                    >
                      <Icon size={13} color={form.status === st ? sc.text : Colors.textSecondary} strokeWidth={2} />
                      <Text style={[s.statusChipText, form.status === st && { color: sc.text }]}>{st}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {form.items.length > 0 && (
                <>
                  <Text style={[s.sectionLabel, { marginTop: Spacing[4] }]}>Items Received</Text>
                  {form.items.map((item, i) => {
                    const ft = openOrders.find(o => o.id === form.procurement_order_id)?.items?.find((it: any) => it.flower_type_id === item.flower_type_id)?.flower_type as any;
                    return (
                      <View key={i} style={s.receiptItemCard}>
                        <Text style={s.itemFlowerName}>{ft?.display_name ?? item.flower_type_id}</Text>
                        <View style={s.itemRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.fieldLabel}>Ordered</Text>
                            <Text style={s.itemOrdered}>{item.ordered_quantity} {item.unit_type}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.fieldLabel}>Received *</Text>
                            <TextInput
                              style={[s.input, parseFloat(item.received_quantity) !== parseFloat(item.ordered_quantity) && s.inputMismatch]}
                              value={item.received_quantity}
                              onChangeText={v => setForm(p => ({ ...p, items: p.items.map((it, idx) => idx === i ? { ...it, received_quantity: v } : it) }))}
                              keyboardType="numeric"
                              placeholderTextColor={Colors.textDisabled}
                            />
                          </View>
                        </View>
                        {parseFloat(item.received_quantity) !== parseFloat(item.ordered_quantity) && (
                          <View style={s.discrepancyBanner}>
                            <AlertTriangle size={12} color={Colors.warning} strokeWidth={2} />
                            <Text style={s.discrepancyText}>Discrepancy detected</Text>
                          </View>
                        )}
                        <TextInput
                          style={s.input}
                          value={item.notes}
                          onChangeText={v => setForm(p => ({ ...p, items: p.items.map((it, idx) => idx === i ? { ...it, notes: v } : it) }))}
                          placeholder="Notes for this item..."
                          placeholderTextColor={Colors.textDisabled}
                        />
                      </View>
                    );
                  })}
                </>
              )}

              <Text style={[s.sectionLabel, { marginTop: Spacing[4] }]}>Overall Notes</Text>
              <TextInput
                style={[s.input, s.textarea, { marginBottom: Spacing[4] }]}
                value={form.notes}
                onChangeText={v => setForm(p => ({ ...p, notes: v }))}
                placeholder="Any notes about this delivery..."
                placeholderTextColor={Colors.textDisabled}
                multiline
                numberOfLines={3}
              />
              {error ? <Text style={s.errorText}>{error}</Text> : null}
            </ScrollView>
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveBtnText}>Save Receipt</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing[3] },
  headerWeb: { paddingHorizontal: Spacing[8], paddingVertical: Spacing[5] },
  backBtn: { padding: Spacing[1] },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  headerIcon: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  titleWeb: { fontSize: Typography.size['2xl'] },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.primary, paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], borderRadius: Radius.full },
  addBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  scroll: { flex: 1 },
  content: { padding: Spacing[5], gap: Spacing[3] },
  contentWeb: { padding: Spacing[8], maxWidth: 1100, alignSelf: 'center', width: '100%' },
  center: { paddingTop: 80, alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  emptySub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 280 },
  tableCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  tableHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], backgroundColor: Colors.neutral[50], borderBottomWidth: 1, borderBottomColor: Colors.border },
  thCell: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  tdCell: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 8, borderRadius: Radius.full },
  statusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, textTransform: 'capitalize' },
  receiptCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, gap: Spacing[2], ...Shadow.sm },
  receiptTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3] },
  receiptIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  receiptInfo: { flex: 1 },
  receiptDate: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  receiptItems: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  receiptNotes: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, fontStyle: 'italic' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: Spacing[5] },
  modal: { width: '100%', maxHeight: '92%', backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[5], gap: Spacing[4] },
  modalWeb: { maxWidth: 600 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  sectionLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: Spacing[2] },
  emptyOrders: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, fontStyle: 'italic', marginBottom: Spacing[4] },
  orderChip: { paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50], gap: 2 },
  orderChipActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  orderChipText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  orderChipTextActive: { color: Colors.primary },
  orderChipSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  statusRow: { flexDirection: 'row', gap: Spacing[2], marginBottom: Spacing[3] },
  statusChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[1], paddingVertical: Spacing[2], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  statusChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary, textTransform: 'capitalize' },
  receiptItemCard: { backgroundColor: Colors.neutral[50], borderRadius: Radius.md, padding: Spacing[3], marginBottom: Spacing[3], gap: Spacing[2], borderWidth: 1, borderColor: Colors.border },
  itemFlowerName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  itemRow: { flexDirection: 'row', gap: Spacing[3] },
  fieldLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textTertiary, marginBottom: 4 },
  itemOrdered: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary, backgroundColor: Colors.white },
  inputMismatch: { borderColor: Colors.warning, backgroundColor: Colors.warningSurface },
  textarea: { minHeight: 72, textAlignVertical: 'top' },
  discrepancyBanner: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.warningSurface, padding: 6, borderRadius: Radius.sm },
  discrepancyText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.warning },
  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error, marginBottom: Spacing[2] },
  modalFooter: { flexDirection: 'row', gap: Spacing[3], paddingTop: Spacing[2] },
  cancelBtn: { flex: 1, paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  saveBtn: { flex: 2, paddingVertical: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  saveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
});
