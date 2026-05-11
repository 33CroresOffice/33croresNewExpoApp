import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Platform, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Package, Plus, X, ArrowLeft, Store, Clock, CircleCheck as CheckCircle, Circle as XCircle, Truck, ChevronDown, User, Search } from 'lucide-react-native';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { ProcurementOrder, Vendor, FlowerType, ProcurementOrderStatus } from '@/types/database';
import DatePickerField from '@/components/ui/DatePickerField';

const STATUS_CONFIG: Record<string, { bg: string; text: string; border: string; icon: any; label: string }> = {
  draft:     { bg: Colors.neutral[100],    text: Colors.neutral[600],   border: Colors.neutral[300],  icon: Clock,        label: 'Draft' },
  sent:      { bg: '#E3F2FD',             text: '#1565C0',             border: '#90CAF9',            icon: Truck,        label: 'Sent' },
  accepted:  { bg: Colors.successSurface, text: Colors.success,        border: '#A5D6A7',            icon: CheckCircle,  label: 'Accepted' },
  fulfilled: { bg: '#E8F5E9',             text: '#1B5E20',             border: '#81C784',            icon: CheckCircle,  label: 'Fulfilled' },
  cancelled: { bg: Colors.errorSurface,   text: Colors.error,          border: '#EF9A9A',            icon: XCircle,      label: 'Cancelled' },
};

const STATUS_OPTIONS: ProcurementOrderStatus[] = ['draft', 'sent', 'accepted', 'fulfilled', 'cancelled'];
const TABS = ['all', ...STATUS_OPTIONS];

export default function ProcurementOrdersScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [orders, setOrders] = useState<ProcurementOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [flowerTypes, setFlowerTypes] = useState<FlowerType[]>([]);
  const [riders, setRiders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [showAssignRiderModal, setShowAssignRiderModal] = useState(false);
  const [assigningOrder, setAssigningOrder] = useState<ProcurementOrder | null>(null);
  const [selectedRider, setSelectedRider] = useState<any | null>(null);
  const [riderSearch, setRiderSearch] = useState('');
  const [pickupNotes, setPickupNotes] = useState('');
  const [assigningRider, setAssigningRider] = useState(false);

  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [requirementDate, setRequirementDate] = useState<Date | null>(new Date());
  const [form, setForm] = useState({
    vendor_id: '',
    notes: '',
    items: [{ flower_type_id: '', quantity: '', unit_type: '' }] as { flower_type_id: string; quantity: string; unit_type: string }[],
  });

  const load = async () => {
    try {
      const [ordersRes, vendorsRes, typesRes, ridersRes] = await Promise.all([
        supabase.from('procurement_orders')
          .select('*, vendor:vendors(business_name, contact_person, mobile), pickup_rider:riders(id, full_name, mobile, zone, vehicle_type)')
          .order('created_at', { ascending: false }),
        supabase.from('vendors').select('id, business_name, contact_person, mobile').eq('is_active', true).order('business_name'),
        supabase.from('flower_types').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('riders').select('id, full_name, mobile, zone, vehicle_type, is_active').eq('is_active', true).order('full_name'),
      ]);
      if (ordersRes.data) setOrders(ordersRes.data);
      if (vendorsRes.data) setVendors(vendorsRes.data as any[]);
      if (typesRes.data) setFlowerTypes(typesRes.data);
      if (ridersRes.data) setRiders(ridersRes.data);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setRequirementDate(new Date());
    setShowVendorDropdown(false);
    setForm({ vendor_id: '', notes: '', items: [{ flower_type_id: '', quantity: '', unit_type: '' }] });
  };

  const addItem = () => setForm(p => ({ ...p, items: [...p.items, { flower_type_id: '', quantity: '', unit_type: '' }] }));
  const removeItem = (i: number) => setForm(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));
  const updateItem = (i: number, field: string, value: string) => {
    setForm(p => ({
      ...p,
      items: p.items.map((item, idx) => {
        if (idx !== i) return item;
        const updated = { ...item, [field]: value };
        if (field === 'flower_type_id') {
          const ft = flowerTypes.find(f => f.id === value);
          updated.unit_type = ft?.unit_type ?? 'pieces';
        }
        return updated;
      }),
    }));
  };

  const save = async () => {
    if (!form.vendor_id) { setError('Select a vendor'); return; }
    if (form.items.some(i => !i.flower_type_id || !i.quantity)) { setError('Fill in all item details'); return; }
    setSaving(true); setError('');
    const { data: order, error: err } = await supabase
      .from('procurement_orders')
      .insert({
        vendor_id: form.vendor_id,
        requirement_date: requirementDate ? format(requirementDate, 'yyyy-MM-dd') : null,
        notes: form.notes.trim() || null,
        total_amount: 0,
      })
      .select()
      .single();
    if (err || !order) { setSaving(false); setError(err?.message ?? 'Failed to create order'); return; }
    const itemsPayload = form.items.map(i => ({
      procurement_order_id: order.id,
      flower_type_id: i.flower_type_id,
      quantity: parseFloat(i.quantity),
      unit_type: i.unit_type || 'pieces',
      price_per_unit: null,
    }));
    await supabase.from('procurement_order_items').insert(itemsPayload);
    setSaving(false);
    setShowModal(false);
    load();
  };

  const openAssignRider = (order: ProcurementOrder) => {
    setAssigningOrder(order);
    const existingRider = (order as any).pickup_rider ?? null;
    setSelectedRider(existingRider);
    setPickupNotes('');
    setRiderSearch('');
    setShowAssignRiderModal(true);
  };

  const saveAssignRider = async () => {
    if (!assigningOrder || !selectedRider) return;
    setAssigningRider(true);
    await supabase.from('procurement_orders').update({
      pickup_rider_id: selectedRider.id,
      pickup_notes: pickupNotes.trim() || null,
      pickup_assigned_at: new Date().toISOString(),
    }).eq('id', assigningOrder.id);
    setAssigningRider(false);
    setShowAssignRiderModal(false);
    load();
  };

  const updateStatus = async (id: string, status: ProcurementOrderStatus) => {
    await supabase.from('procurement_orders').update({ status }).eq('id', id);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
  };

  const filtered = statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter);
  const activeCount = orders.filter(o => !['cancelled', 'fulfilled'].includes(o.status)).length;
  const totalValue = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);

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
            <Package size={isWeb ? 20 : 18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>Procurement Orders</Text>
            <Text style={s.subtitle}>{activeCount} active · ₹{totalValue.toLocaleString('en-IN')} total value</Text>
          </View>
        </View>
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => { resetForm(); setError(''); setShowModal(true); }}
          activeOpacity={0.85}
        >
          <Plus size={15} color={Colors.white} strokeWidth={2.5} />
          <Text style={s.addBtnText}>New Order</Text>
        </TouchableOpacity>
      </View>

      {isWeb && (
        <View style={s.statsRow}>
          {STATUS_OPTIONS.map(st => {
            const cfg = STATUS_CONFIG[st];
            const count = orders.filter(o => o.status === st).length;
            const Icon = cfg.icon;
            return (
              <TouchableOpacity
                key={st}
                style={[s.statCard, statusFilter === st && s.statCardActive]}
                onPress={() => setStatusFilter(st === statusFilter ? 'all' : st)}
                activeOpacity={0.8}
              >
                <View style={[s.statIcon, { backgroundColor: cfg.bg }]}>
                  <Icon size={14} color={cfg.text} strokeWidth={2} />
                </View>
                <Text style={[s.statCount, statusFilter === st && { color: Colors.primary }]}>{count}</Text>
                <Text style={s.statLabel}>{cfg.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View style={s.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabContent}>
          {TABS.map(st => {
            const isActive = statusFilter === st;
            const count = st === 'all' ? orders.length : orders.filter(o => o.status === st).length;
            const cfg = STATUS_CONFIG[st];
            return (
              <TouchableOpacity
                key={st}
                style={[s.tab, isActive && s.tabActive]}
                onPress={() => setStatusFilter(st)}
                activeOpacity={0.7}
              >
                <Text style={[s.tabText, isActive && s.tabTextActive]}>
                  {st === 'all' ? 'All' : cfg?.label ?? st}
                </Text>
                <View style={[s.tabBadge, isActive && s.tabBadgeActive]}>
                  <Text style={[s.tabBadgeText, isActive && s.tabBadgeTextActive]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, isWeb && s.contentWeb]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
        ) : filtered.length === 0 ? (
          <View style={s.emptyState}>
            <View style={s.emptyIcon}>
              <Package size={28} color={Colors.textDisabled} strokeWidth={1.4} />
            </View>
            <Text style={s.emptyTitle}>No orders found</Text>
            <Text style={s.emptySub}>
              {statusFilter === 'all'
                ? 'Create your first procurement order to get started.'
                : `No ${STATUS_CONFIG[statusFilter]?.label?.toLowerCase() ?? statusFilter} orders at the moment.`}
            </Text>
          </View>
        ) : isWeb ? (
          <View style={s.tableCard}>
            <View style={s.tableHead}>
              <Text style={[s.thCell, { width: 110 }]}>Order</Text>
              <Text style={[s.thCell, { flex: 2 }]}>Vendor</Text>
              <Text style={[s.thCell, { flex: 1 }]}>Req. Date</Text>
              <Text style={[s.thCell, { flex: 1 }]}>Amount</Text>
              <Text style={[s.thCell, { width: 110 }]}>Status</Text>
              <Text style={[s.thCell, { flex: 1.5 }]}>Actions</Text>
            </View>
            {filtered.map((order, i) => {
              const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.draft;
              const StatusIcon = cfg.icon;
              const vendor = order.vendor as any;
              return (
                <TouchableOpacity key={order.id} style={[s.tableRow, i % 2 === 1 && s.tableRowAlt]} onPress={() => router.push({ pathname: '/(admin)/procurement-order-detail', params: { id: order.id } })} activeOpacity={0.75}>
                  <View style={{ width: 110 }}>
                    <Text style={s.orderNumText}>{order.order_number}</Text>
                    <Text style={s.orderDateSmall}>
                      {format(parseISO(order.created_at!), 'dd MMM')}
                    </Text>
                  </View>
                  <View style={{ flex: 2 }}>
                    <Text style={s.tdPrimary}>{vendor?.business_name ?? vendor?.contact_person ?? '—'}</Text>
                    {vendor?.mobile ? <Text style={s.tdMuted}>{vendor.mobile}</Text> : null}
                  </View>
                  <Text style={[s.tdCell, { flex: 1 }]}>
                    {order.requirement_date ? format(parseISO(order.requirement_date), 'dd MMM yyyy') : '—'}
                  </Text>
                  <Text style={[s.tdAmount, { flex: 1 }]}>
                    ₹{Number(order.total_amount).toLocaleString('en-IN')}
                  </Text>
                  <View style={{ width: 110, gap: 4 }}>
                    <View style={[s.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                      <StatusIcon size={10} color={cfg.text} strokeWidth={2.5} />
                      <Text style={[s.statusText, { color: cfg.text }]}>{cfg.label}</Text>
                    </View>
                    {order.status === 'accepted' && (order as any).pickup_rider && (
                      <View style={s.pickupRiderBadge}>
                        <User size={9} color="#0891b2" strokeWidth={2} />
                        <Text style={s.pickupRiderText} numberOfLines={1}>{(order as any).pickup_rider.full_name}</Text>
                      </View>
                    )}
                  </View>
                  <View style={[{ flex: 1.5 }, s.actionsCell]}>
                    {order.status === 'accepted' && (
                      <TouchableOpacity
                        style={[s.actionBtn, s.assignRiderBtn]}
                        onPress={(e) => { e.stopPropagation?.(); openAssignRider(order); }}
                      >
                        <User size={10} color="#0891b2" strokeWidth={2.5} />
                        <Text style={[s.actionBtnText, { color: '#0891b2' }]}>
                          {(order as any).pickup_rider ? 'Reassign Rider' : 'Assign Rider'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {STATUS_OPTIONS.filter(st => st !== order.status && st !== 'draft').map(st => {
                      const sc = STATUS_CONFIG[st];
                      return (
                        <TouchableOpacity
                          key={st}
                          style={[s.actionBtn, { backgroundColor: sc.bg, borderColor: sc.border }]}
                          onPress={(e) => { e.stopPropagation?.(); updateStatus(order.id, st as ProcurementOrderStatus); }}
                        >
                          <Text style={[s.actionBtnText, { color: sc.text }]}>{sc.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          filtered.map(order => {
            const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.draft;
            const StatusIcon = cfg.icon;
            const vendor = order.vendor as any;
            return (
              <TouchableOpacity key={order.id} style={s.orderCard} onPress={() => router.push({ pathname: '/(admin)/procurement-order-detail', params: { id: order.id } })} activeOpacity={0.85}>
                <View style={s.orderCardTop}>
                  <View style={s.orderMeta}>
                    <Text style={s.orderNumText}>{order.order_number}</Text>
                    <View style={[s.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                      <StatusIcon size={10} color={cfg.text} strokeWidth={2.5} />
                      <Text style={[s.statusText, { color: cfg.text }]}>{cfg.label}</Text>
                    </View>
                  </View>
                  <Text style={s.mobileAmount}>₹{Number(order.total_amount).toLocaleString('en-IN')}</Text>
                </View>
                <View style={s.orderCardVendor}>
                  <Store size={13} color={Colors.textTertiary} strokeWidth={1.8} />
                  <Text style={s.vendorNameText}>{vendor?.business_name ?? vendor?.contact_person ?? '—'}</Text>
                </View>
                {order.requirement_date && (
                  <View style={s.orderDateRow}>
                    <Clock size={11} color={Colors.textDisabled} strokeWidth={1.8} />
                    <Text style={s.orderDateLabel}>Required by {format(parseISO(order.requirement_date), 'dd MMM yyyy')}</Text>
                  </View>
                )}
                {order.status === 'accepted' && (order as any).pickup_rider && (
                  <View style={s.pickupRiderBadge}>
                    <User size={11} color="#0891b2" strokeWidth={2} />
                    <Text style={s.pickupRiderText}>{(order as any).pickup_rider.full_name}</Text>
                  </View>
                )}
                <View style={s.divider} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.mobileActions}>
                  {order.status === 'accepted' && (
                    <TouchableOpacity
                      style={[s.mobileActionBtn, s.assignRiderBtn]}
                      onPress={() => openAssignRider(order)}
                    >
                      <User size={11} color="#0891b2" strokeWidth={2.5} />
                      <Text style={[s.mobileActionText, { color: '#0891b2' }]}>
                        {(order as any).pickup_rider ? 'Reassign Rider' : 'Assign Rider'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {STATUS_OPTIONS.filter(st => st !== order.status && st !== 'draft').map(st => {
                    const sc = STATUS_CONFIG[st];
                    return (
                      <TouchableOpacity
                        key={st}
                        style={[s.mobileActionBtn, { backgroundColor: sc.bg, borderColor: sc.border }]}
                        onPress={() => updateStatus(order.id, st as ProcurementOrderStatus)}
                      >
                        <Text style={[s.mobileActionText, { color: sc.text }]}>Move to {sc.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <View style={s.modalTitleRow}>
                <View style={s.modalIcon}>
                  <Package size={16} color={Colors.primary} strokeWidth={1.8} />
                </View>
                <Text style={s.modalTitle}>New Procurement Order</Text>
              </View>
              <TouchableOpacity onPress={() => setShowModal(false)} style={s.modalClose}>
                <X size={16} color={Colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
              <Text style={s.sectionLabel}>Vendor *</Text>
              {vendors.length === 0 ? (
                <Text style={s.noDataText}>No active vendors found</Text>
              ) : (
                <View style={{ marginBottom: Spacing[5] }}>
                  <TouchableOpacity
                    style={[s.dropdownTrigger, showVendorDropdown && s.dropdownTriggerOpen]}
                    onPress={() => setShowVendorDropdown(v => !v)}
                    activeOpacity={0.8}
                  >
                    <Store size={14} color={form.vendor_id ? Colors.primary : Colors.textTertiary} strokeWidth={1.8} />
                    <Text style={[s.dropdownTriggerText, form.vendor_id && s.dropdownTriggerTextSelected]} numberOfLines={1}>
                      {form.vendor_id
                        ? (vendors.find(v => v.id === form.vendor_id)?.business_name ?? vendors.find(v => v.id === form.vendor_id)?.contact_person ?? 'Select vendor')
                        : 'Select vendor'}
                    </Text>
                    <ChevronDown
                      size={15}
                      color={Colors.textTertiary}
                      strokeWidth={2}
                      style={{ transform: [{ rotate: showVendorDropdown ? '180deg' : '0deg' }] }}
                    />
                  </TouchableOpacity>
                  {showVendorDropdown && (
                    <View style={s.dropdownList}>
                      {vendors.map((v, idx) => (
                        <TouchableOpacity
                          key={v.id}
                          style={[
                            s.dropdownItem,
                            idx < vendors.length - 1 && s.dropdownItemBorder,
                            form.vendor_id === v.id && s.dropdownItemActive,
                          ]}
                          onPress={() => { setForm(p => ({ ...p, vendor_id: v.id })); setShowVendorDropdown(false); }}
                          activeOpacity={0.7}
                        >
                          <Store size={13} color={form.vendor_id === v.id ? Colors.primary : Colors.textTertiary} strokeWidth={1.8} />
                          <View style={{ flex: 1 }}>
                            <Text style={[s.dropdownItemText, form.vendor_id === v.id && s.dropdownItemTextActive]}>
                              {v.business_name ?? v.contact_person}
                            </Text>
                            {v.mobile ? <Text style={s.dropdownItemMeta}>{v.mobile}</Text> : null}
                          </View>
                          {form.vendor_id === v.id && (
                            <CheckCircle size={14} color={Colors.primary} strokeWidth={2} />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              <View style={{ marginBottom: Spacing[5] }}>
                <DatePickerField
                  label="Requirement Date"
                  value={requirementDate}
                  onChange={setRequirementDate}
                />
              </View>

              <View style={s.itemsHeader}>
                <Text style={s.sectionLabel}>Items *</Text>
                <TouchableOpacity style={s.addItemBtn} onPress={addItem}>
                  <Plus size={12} color={Colors.primary} strokeWidth={2.5} />
                  <Text style={s.addItemText}>Add Item</Text>
                </TouchableOpacity>
              </View>

              {form.items.map((item, i) => (
                <View key={i} style={s.itemCard}>
                  <View style={s.itemCardHeader}>
                    <Text style={s.itemLabel}>Item {i + 1}</Text>
                    {form.items.length > 1 && (
                      <TouchableOpacity onPress={() => removeItem(i)} style={s.removeItemBtn}>
                        <X size={12} color={Colors.error} strokeWidth={2.5} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={s.fieldLabel}>Flower Type</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing[3] }} contentContainerStyle={{ gap: 6 }}>
                    {flowerTypes.map(ft => (
                      <TouchableOpacity
                        key={ft.id}
                        style={[s.ftChip, item.flower_type_id === ft.id && s.ftChipActive]}
                        onPress={() => updateItem(i, 'flower_type_id', ft.id)}
                      >
                        <Text style={[s.ftChipText, item.flower_type_id === ft.id && s.ftChipTextActive]}>{ft.display_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <View style={s.itemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.fieldLabel}>Quantity</Text>
                      <TextInput
                        style={s.input}
                        value={item.quantity}
                        onChangeText={v => updateItem(i, 'quantity', v)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={Colors.textDisabled}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.fieldLabel}>Unit</Text>
                      <View style={s.unitDisplay}>
                        <Text style={[s.unitText, !item.unit_type && s.unitPlaceholder]}>
                          {item.unit_type ? item.unit_type : '—'}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))}

              <View style={[s.notesLabelRow, { marginTop: Spacing[2] }]}>
                <Text style={s.sectionLabel}>Notes</Text>
                <Text style={s.optionalTag}>Optional</Text>
              </View>
              <TextInput
                style={[s.input, s.textarea, { marginBottom: Spacing[4] }]}
                value={form.notes}
                onChangeText={v => setForm(p => ({ ...p, notes: v }))}
                placeholder="Optional notes for the vendor..."
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
              <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving} activeOpacity={0.85}>
                {saving ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <>
                    <Package size={14} color={Colors.white} strokeWidth={2} />
                    <Text style={s.saveBtnText}>Create Order</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showAssignRiderModal} transparent animationType="fade" onRequestClose={() => setShowAssignRiderModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <View style={s.modalTitleRow}>
                <View style={[s.modalIcon, { backgroundColor: '#e0f2fe' }]}>
                  <Truck size={16} color="#0891b2" strokeWidth={1.8} />
                </View>
                <View>
                  <Text style={s.modalTitle}>Assign Pickup Rider</Text>
                  {assigningOrder && (
                    <Text style={s.modalSubtitle}>{(assigningOrder as any).order_number}</Text>
                  )}
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowAssignRiderModal(false)} style={s.modalClose}>
                <X size={16} color={Colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
              <Text style={s.sectionLabel}>Select Rider *</Text>
              <View style={s.riderSearchWrap}>
                <Search size={14} color={Colors.textTertiary} strokeWidth={1.8} />
                <TextInput
                  style={s.riderSearchInput}
                  value={riderSearch}
                  onChangeText={setRiderSearch}
                  placeholder="Search riders..."
                  placeholderTextColor={Colors.textDisabled}
                />
              </View>
              <View style={s.riderList}>
                {riders
                  .filter(r => !riderSearch || r.full_name.toLowerCase().includes(riderSearch.toLowerCase()) || r.zone?.toLowerCase().includes(riderSearch.toLowerCase()))
                  .map((rider, idx, arr) => (
                    <TouchableOpacity
                      key={rider.id}
                      style={[
                        s.riderItem,
                        idx < arr.length - 1 && s.riderItemBorder,
                        selectedRider?.id === rider.id && s.riderItemActive,
                      ]}
                      onPress={() => setSelectedRider(rider)}
                      activeOpacity={0.7}
                    >
                      <View style={[s.riderAvatar, selectedRider?.id === rider.id && s.riderAvatarActive]}>
                        <Text style={[s.riderAvatarText, selectedRider?.id === rider.id && s.riderAvatarTextActive]}>
                          {rider.full_name[0].toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.riderName, selectedRider?.id === rider.id && { color: '#0891b2' }]}>
                          {rider.full_name}
                        </Text>
                        <Text style={s.riderMeta}>
                          {rider.vehicle_type ? rider.vehicle_type.charAt(0).toUpperCase() + rider.vehicle_type.slice(1) : ''}
                          {rider.zone ? ` · ${rider.zone} Zone` : ''}
                        </Text>
                      </View>
                      {selectedRider?.id === rider.id && (
                        <CheckCircle size={16} color="#0891b2" strokeWidth={2} />
                      )}
                    </TouchableOpacity>
                  ))}
                {riders.filter(r => !riderSearch || r.full_name.toLowerCase().includes(riderSearch.toLowerCase()) || r.zone?.toLowerCase().includes(riderSearch.toLowerCase())).length === 0 && (
                  <View style={s.noRidersState}>
                    <User size={20} color={Colors.textDisabled} strokeWidth={1.5} />
                    <Text style={s.noRidersText}>No riders found</Text>
                  </View>
                )}
              </View>

              <View style={[s.notesLabelRow, { marginTop: Spacing[4] }]}>
                <Text style={s.sectionLabel}>Pickup Notes</Text>
                <Text style={s.optionalTag}>Optional</Text>
              </View>
              <TextInput
                style={[s.input, s.textarea, { marginBottom: Spacing[2] }]}
                value={pickupNotes}
                onChangeText={setPickupNotes}
                placeholder="Any special instructions for the rider..."
                placeholderTextColor={Colors.textDisabled}
                multiline
                numberOfLines={3}
              />
            </ScrollView>

            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowAssignRiderModal(false)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: '#0891b2' }, (!selectedRider) && s.saveBtnDisabled]}
                onPress={saveAssignRider}
                disabled={!selectedRider || assigningRider}
                activeOpacity={0.85}
              >
                {assigningRider ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <>
                    <Truck size={14} color={Colors.white} strokeWidth={2} />
                    <Text style={s.saveBtnText}>Assign Rider</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.neutral[50] },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[5], paddingVertical: Spacing[4],
    backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: Spacing[3],
  },
  headerWeb: { paddingHorizontal: Spacing[8], paddingVertical: Spacing[5] },
  backBtn: { padding: Spacing[1] },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  headerIcon: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  titleWeb: { fontSize: Typography.size['2xl'] },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    backgroundColor: Colors.primary,
    paddingVertical: 10, paddingHorizontal: Spacing[4],
    borderRadius: Radius.md,
    ...Shadow.sm,
  },
  addBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },

  statsRow: {
    flexDirection: 'row', gap: Spacing[3],
    paddingHorizontal: Spacing[8], paddingVertical: Spacing[4],
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  statCard: {
    flex: 1, alignItems: 'center', gap: 4,
    paddingVertical: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: 'transparent',
  },
  statCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  statIcon: { width: 28, height: 28, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  statCount: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  statLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary, textTransform: 'capitalize' },

  tabBar: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabContent: { paddingHorizontal: Spacing[5], gap: 0 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: Spacing[3], paddingHorizontal: Spacing[4],
    borderBottomWidth: 2, borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary },
  tabTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  tabBadge: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: Colors.neutral[200], alignItems: 'center', justifyContent: 'center',
  },
  tabBadgeActive: { backgroundColor: Colors.primarySurface },
  tabBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.textTertiary },
  tabBadgeTextActive: { color: Colors.primary },

  scroll: { flex: 1 },
  content: { padding: Spacing[5], gap: Spacing[3] },
  contentWeb: { padding: Spacing[8], maxWidth: 1280, alignSelf: 'center', width: '100%' },

  center: { paddingTop: 80, alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: Spacing[4] },
  emptyIcon: {
    width: 64, height: 64, borderRadius: Radius.xl,
    backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  emptySub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 300 },

  tableCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  tableHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[5], paddingVertical: Spacing[3],
    backgroundColor: Colors.neutral[50], borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  thCell: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: 11,
    color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6,
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[5], paddingVertical: Spacing[4],
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  orderNumText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  orderDateSmall: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textDisabled, marginTop: 2 },
  tdPrimary: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  tdMuted: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary, marginTop: 1 },
  tdCell: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tdAmount: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 8,
    borderRadius: Radius.full, borderWidth: 1,
  },
  statusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  actionsCell: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' },
  actionBtn: {
    paddingVertical: 3, paddingHorizontal: 8,
    borderRadius: Radius.full, borderWidth: 1,
  },
  actionBtnText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11 },

  orderCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: Spacing[4], borderWidth: 1, borderColor: Colors.border,
    gap: Spacing[2], ...Shadow.sm,
  },
  orderCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  orderMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flex: 1 },
  mobileAmount: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  orderCardVendor: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vendorNameText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  orderDateRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  orderDateLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  divider: { height: 1, backgroundColor: Colors.divider, marginVertical: 2 },
  mobileActions: { gap: 8, paddingTop: 2 },
  mobileActionBtn: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: Radius.full, borderWidth: 1 },
  mobileActionText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 12 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: Spacing[5] },
  modal: {
    width: '100%', maxHeight: '92%',
    backgroundColor: Colors.white, borderRadius: Radius.xl,
    padding: Spacing[5], gap: Spacing[4],
  },
  modalWeb: { maxWidth: 600 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  modalIcon: {
    width: 32, height: 32, borderRadius: Radius.sm,
    backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  modalClose: {
    width: 32, height: 32, borderRadius: Radius.sm,
    backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center',
  },

  sectionLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11,
    color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.7,
    marginBottom: Spacing[2],
  },
  noDataText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textDisabled, marginBottom: Spacing[4] },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingVertical: Spacing[3], paddingHorizontal: Spacing[4],
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base,
    color: Colors.textPrimary, backgroundColor: Colors.neutral[50],
  },
  textarea: { minHeight: 72, textAlignVertical: 'top' },

  dropdownTrigger: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingVertical: Spacing[3], paddingHorizontal: Spacing[4],
    backgroundColor: Colors.neutral[50],
  },
  dropdownTriggerOpen: { borderColor: Colors.primary, backgroundColor: Colors.white },
  dropdownTriggerText: {
    flex: 1, fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base, color: Colors.textDisabled,
  },
  dropdownTriggerTextSelected: { color: Colors.textPrimary },
  dropdownList: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    backgroundColor: Colors.white, marginTop: 4,
    ...Shadow.sm,
    maxHeight: 220, overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    paddingVertical: Spacing[3], paddingHorizontal: Spacing[4],
  },
  dropdownItemBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  dropdownItemActive: { backgroundColor: Colors.primarySurface },
  dropdownItemText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  dropdownItemTextActive: { color: Colors.primary },
  dropdownItemMeta: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 11,
    color: Colors.textTertiary, marginTop: 1,
  },
  notesLabelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], marginBottom: Spacing[2] },
  optionalTag: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 10,
    color: Colors.textDisabled, backgroundColor: Colors.neutral[100],
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full,
    overflow: 'hidden',
  },

  itemsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[3] },
  addItemBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 5, paddingHorizontal: 10, borderRadius: Radius.full,
    backgroundColor: Colors.primarySurface, borderWidth: 1, borderColor: Colors.primary,
  },
  addItemText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.primary },

  itemCard: {
    backgroundColor: Colors.neutral[50], borderRadius: Radius.md,
    padding: Spacing[3], marginBottom: Spacing[3],
    gap: Spacing[2], borderWidth: 1, borderColor: Colors.border,
  },
  itemCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  removeItemBtn: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.errorSurface, alignItems: 'center', justifyContent: 'center',
  },
  fieldLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11, color: Colors.textTertiary, marginBottom: 4 },
  ftChip: {
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white,
  },
  ftChipActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  ftChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11, color: Colors.textSecondary },
  ftChipTextActive: { color: Colors.primary },
  itemRow: { flexDirection: 'row', gap: Spacing[3] },
  unitDisplay: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingVertical: Spacing[3], paddingHorizontal: Spacing[4],
    backgroundColor: Colors.neutral[100], justifyContent: 'center',
  },
  unitText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base,
    color: Colors.textPrimary, textTransform: 'capitalize',
  },
  unitPlaceholder: { color: Colors.textDisabled, fontFamily: Typography.fontFamily.sansRegular },

  totalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.primarySurface, borderRadius: Radius.md,
    padding: Spacing[4], marginBottom: Spacing[4],
    borderWidth: 1, borderColor: Colors.primary + '30',
  },
  totalLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  totalSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary, marginTop: 2 },
  totalAmount: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.primary },

  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error, marginBottom: Spacing[2] },

  modalFooter: { flexDirection: 'row', gap: Spacing[3], paddingTop: Spacing[2] },
  cancelBtn: {
    flex: 1, paddingVertical: Spacing[3], borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  cancelBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  saveBtn: {
    flex: 2, paddingVertical: Spacing[3], borderRadius: Radius.md,
    backgroundColor: Colors.primary, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    ...Shadow.sm,
  },
  saveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
  saveBtnDisabled: { opacity: 0.5 },

  modalSubtitle: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs,
    color: Colors.textTertiary, marginTop: 1,
  },

  assignRiderBtn: {
    backgroundColor: '#e0f2fe', borderColor: '#7dd3fc', borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },

  pickupRiderBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#e0f2fe', borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start',
  },
  pickupRiderText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: 10,
    color: '#0891b2',
  },

  riderSearchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingVertical: Spacing[2], paddingHorizontal: Spacing[3],
    backgroundColor: Colors.neutral[50], marginBottom: Spacing[3],
  },
  riderSearchInput: {
    flex: 1, fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm, color: Colors.textPrimary,
    paddingVertical: 0,
  },
  riderList: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    backgroundColor: Colors.white, overflow: 'hidden', marginBottom: Spacing[2],
    maxHeight: 240,
  },
  riderItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    paddingVertical: Spacing[3], paddingHorizontal: Spacing[4],
  },
  riderItemBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  riderItemActive: { backgroundColor: '#e0f2fe' },
  riderAvatar: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center',
  },
  riderAvatarActive: { backgroundColor: '#bae6fd' },
  riderAvatarText: {
    fontFamily: Typography.fontFamily.bold, fontSize: 13, color: Colors.textSecondary,
  },
  riderAvatarTextActive: { color: '#0891b2' },
  riderName: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary,
  },
  riderMeta: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary,
    marginTop: 1, textTransform: 'capitalize',
  },
  noRidersState: {
    paddingVertical: Spacing[6], alignItems: 'center', gap: Spacing[2],
  },
  noRidersText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textDisabled,
  },
});
