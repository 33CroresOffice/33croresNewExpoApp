import React, { useEffect, useState, useCallback } from 'react';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, Modal, TextInput, Switch, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Store, Phone, MapPin, CreditCard, Mail, FileText,
  ExternalLink, Pencil, X, Package, IndianRupee, CalendarDays,
  CircleCheck, Plus, Flower2, Trash2,
} from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { Vendor, ProcurementOrder, VendorPayment, VendorFlower, FlowerType, UnitType } from '@/types/database';

type Tab = 'overview' | 'orders' | 'payments' | 'flowers';

const UNIT_OPTIONS: UnitType[] = ['kg', 'grams', 'pieces', 'bunch', 'stems', 'dozen', 'ml', 'litre', 'packet', 'tray', 'box', 'meter'];

const PO_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: 'Draft',     color: Colors.textTertiary, bg: Colors.neutral[100] },
  sent:      { label: 'Sent',      color: Colors.primary,      bg: Colors.primarySurface },
  accepted:  { label: 'Accepted',  color: Colors.accentDark,   bg: Colors.accentSurface },
  fulfilled: { label: 'Fulfilled', color: Colors.success,      bg: '#E8F5E9' },
  cancelled: { label: 'Cancelled', color: Colors.error,        bg: '#FFEBEE' },
};

const PAY_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Pending',   color: Colors.warning, bg: '#FFF3E0' },
  completed: { label: 'Completed', color: Colors.success, bg: '#E8F5E9' },
  failed:    { label: 'Failed',    color: Colors.error,   bg: '#FFEBEE' },
};

const EMPTY_VENDOR_FORM = {
  business_name: '', contact_person: '', mobile: '', whatsapp: '',
  email: '', city: '', address: '', google_maps_url: '', gstin: '',
  bank_account_name: '', bank_account_number: '', bank_ifsc: '',
  upi_id: '', notes: '', is_active: true,
};

const EMPTY_EDIT_FLOWER = {
  id: '',
  unit_type: 'kg' as UnitType,
  price_per_unit: '',
  notes: '',
  is_active: true,
};

export default function VendorDetailScreen() {
  return (
    <ModuleGuard module="procurement">
      <VendorDetailScreenContent />
    </ModuleGuard>
  );
}

function VendorDetailScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { id } = useLocalSearchParams<{ id: string }>();

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [orders, setOrders] = useState<ProcurementOrder[]>([]);
  const [payments, setPayments] = useState<VendorPayment[]>([]);
  const [vendorFlowers, setVendorFlowers] = useState<VendorFlower[]>([]);
  const [flowerTypes, setFlowerTypes] = useState<FlowerType[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // Vendor edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [vendorForm, setVendorForm] = useState(EMPTY_VENDOR_FORM);
  const [savingVendor, setSavingVendor] = useState(false);
  const [vendorError, setVendorError] = useState('');

  // Edit single flower modal
  const [showEditFlower, setShowEditFlower] = useState(false);
  const [editFlower, setEditFlower] = useState(EMPTY_EDIT_FLOWER);
  const [savingEditFlower, setSavingEditFlower] = useState(false);
  const [editFlowerError, setEditFlowerError] = useState('');

  const load = useCallback(async () => {
    try {
      const [vendorRes, ordersRes, paymentsRes, flowersRes, flowerTypesRes] = await Promise.all([
        supabase.from('vendors').select('*').eq('id', id).maybeSingle(),
        supabase.from('procurement_orders').select('*').eq('vendor_id', id).order('created_at', { ascending: false }).limit(50),
        supabase.from('vendor_payments').select('*, procurement_order:procurement_orders(id, order_number)').eq('vendor_id', id).order('created_at', { ascending: false }).limit(50),
        supabase.from('vendor_flowers').select('*, flower_type:flower_types(*)').eq('vendor_id', id).order('created_at', { ascending: false }),
        supabase.from('flower_types').select('*').order('name'),
      ]);
      if (vendorRes.data) setVendor(vendorRes.data as Vendor);
      setOrders((ordersRes.data as ProcurementOrder[]) ?? []);
      setPayments((paymentsRes.data as VendorPayment[]) ?? []);
      setVendorFlowers((flowersRes.data as VendorFlower[]) ?? []);
      setFlowerTypes((flowerTypesRes.data as FlowerType[]) ?? []);
    } catch (e) {
      console.error('vendor detail load error', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── Vendor edit ──────────────────────────────────────────────
  const openEdit = () => {
    if (!vendor) return;
    setVendorForm({
      business_name: vendor.business_name ?? '', contact_person: vendor.contact_person ?? '',
      mobile: vendor.mobile ?? '', whatsapp: vendor.whatsapp ?? '', email: vendor.email ?? '',
      city: vendor.city ?? '', address: vendor.address ?? '',
      google_maps_url: vendor.google_maps_url ?? '', gstin: vendor.gstin ?? '',
      bank_account_name: vendor.bank_account_name ?? '', bank_account_number: vendor.bank_account_number ?? '',
      bank_ifsc: vendor.bank_ifsc ?? '', upi_id: vendor.upi_id ?? '',
      notes: vendor.notes ?? '', is_active: vendor.is_active,
    });
    setVendorError('');
    setShowEditModal(true);
  };

  const saveVendor = async () => {
    if (!vendor) return;
    if (!vendorForm.business_name.trim() && !vendorForm.contact_person.trim()) {
      setVendorError('Enter a business name or contact person'); return;
    }
    setSavingVendor(true); setVendorError('');
    const payload = {
      business_name: vendorForm.business_name.trim() || null,
      contact_person: vendorForm.contact_person.trim() || null,
      mobile: vendorForm.mobile.trim() || null,
      whatsapp: vendorForm.whatsapp.trim() || null,
      email: vendorForm.email.trim() || null,
      city: vendorForm.city.trim() || null,
      address: vendorForm.address.trim() || null,
      google_maps_url: vendorForm.google_maps_url.trim() || null,
      gstin: vendorForm.gstin.trim() || null,
      bank_account_name: vendorForm.bank_account_name.trim() || null,
      bank_account_number: vendorForm.bank_account_number.trim() || null,
      bank_ifsc: vendorForm.bank_ifsc.trim() || null,
      upi_id: vendorForm.upi_id.trim() || null,
      notes: vendorForm.notes.trim() || null,
      is_active: vendorForm.is_active,
    };
    const { error: err } = await supabase.from('vendors').update(payload).eq('id', vendor.id);
    setSavingVendor(false);
    if (err) { setVendorError(err.message); return; }
    setShowEditModal(false);
    load();
  };

  // ── Add flowers (navigates to dedicated page) ───────────────
  const alreadyAddedIds = new Set(vendorFlowers.map(vf => vf.flower_type_id));
  const availableFlowers = flowerTypes.filter(ft => !alreadyAddedIds.has(ft.id));

  const openAddFlowersPage = () => {
    router.push({ pathname: '/(admin)/vendor-add-flowers' as any, params: { vendorId: vendor!.id } });
  };

  // ── Edit single flower ───────────────────────────────────────
  const openEditFlower = (vf: VendorFlower) => {
    setEditFlower({
      id: vf.id,
      unit_type: vf.unit_type ?? 'kg',
      price_per_unit: String(vf.price_per_unit),
      notes: vf.notes ?? '',
      is_active: vf.is_active,
    });
    setEditFlowerError('');
    setShowEditFlower(true);
  };

  const saveEditFlower = async () => {
    if (!editFlower.price_per_unit || isNaN(Number(editFlower.price_per_unit))) {
      setEditFlowerError('Enter a valid price'); return;
    }
    setSavingEditFlower(true); setEditFlowerError('');
    const { error: err } = await supabase.from('vendor_flowers').update({
      unit_type: editFlower.unit_type,
      price_per_unit: Number(editFlower.price_per_unit),
      notes: editFlower.notes.trim() || null,
      is_active: editFlower.is_active,
    }).eq('id', editFlower.id);
    setSavingEditFlower(false);
    if (err) { setEditFlowerError(err.message); return; }
    setShowEditFlower(false);
    load();
  };

  const [flowerToDelete, setFlowerToDelete] = useState<VendorFlower | null>(null);
  const [deletingFlower, setDeletingFlower] = useState(false);

  const confirmDeleteFlower = (vf: VendorFlower) => setFlowerToDelete(vf);

  const deleteFlower = async () => {
    if (!flowerToDelete) return;
    setDeletingFlower(true);
    await supabase.from('vendor_flowers').delete().eq('id', flowerToDelete.id);
    setDeletingFlower(false);
    setFlowerToDelete(null);
    load();
  };

  const toggleFlowerActive = async (vf: VendorFlower) => {
    await supabase.from('vendor_flowers').update({ is_active: !vf.is_active }).eq('id', vf.id);
    load();
  };

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  const totalOrderValue = orders.reduce((s, o) => s + (o.total_amount ?? 0), 0);
  const totalPaid = payments.filter(p => p.status === 'completed').reduce((s, p) => s + p.amount, 0);
  const deliveredCount = orders.filter(o => o.status === 'fulfilled').length;

  if (loading) {
    return (
      <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (!vendor) {
    return (
      <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={s.notFoundText}>Vendor not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={s.notFoundLink}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'orders',   label: 'Orders',   count: orders.length },
    { key: 'payments', label: 'Payments', count: payments.length },
    { key: 'flowers',  label: 'Flowers',  count: vendorFlowers.length },
  ];

  return (
    <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top }]}>
      {/* Header */}
      <View style={[s.header, isWeb && s.headerWeb]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} strokeWidth={1.8} />
        </TouchableOpacity>
        <View style={s.headerProfile}>
          <View style={[s.headerAvatar, { backgroundColor: vendor.is_active ? Colors.primarySurface : Colors.neutral[100] }]}>
            <Text style={[s.headerAvatarText, { color: vendor.is_active ? Colors.primary : Colors.textTertiary }]}>
              {(vendor.business_name ?? vendor.contact_person ?? '?')[0]?.toUpperCase()}
            </Text>
            <View style={[s.onlineDot, { backgroundColor: vendor.is_active ? Colors.success : Colors.neutral[300] }]} />
          </View>
          <View style={s.headerInfo}>
            <Text style={s.headerName}>{vendor.business_name ?? vendor.contact_person ?? 'Unnamed Vendor'}</Text>
            <View style={s.headerMeta}>
              {vendor.contact_person && vendor.business_name ? <Text style={s.headerContact}>{vendor.contact_person}</Text> : null}
              {vendor.city ? (
                <>
                  <Text style={s.dot}>·</Text>
                  <MapPin size={11} color={Colors.textTertiary} strokeWidth={1.8} />
                  <Text style={s.headerCity}>{vendor.city}</Text>
                </>
              ) : null}
            </View>
          </View>
        </View>
        <TouchableOpacity style={s.editBtn} onPress={openEdit} activeOpacity={0.8}>
          <Pencil size={15} color={Colors.primary} strokeWidth={1.8} />
          <Text style={s.editBtnText}>Edit</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll} contentContainerStyle={[s.tabScrollContent, isWeb && s.tabScrollContentWeb]}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab.key} style={[s.tab, activeTab === tab.key && s.tabActive]} onPress={() => setActiveTab(tab.key)}>
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>
              {tab.label}{tab.count !== undefined && tab.count > 0 ? ` (${tab.count})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={s.scroll} contentContainerStyle={[s.content, isWeb && s.contentWeb]} showsVerticalScrollIndicator={false}>

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <>
            <View style={[s.metricsGrid, isWeb && s.metricsGridWeb]}>
              <MetricCard icon={<Package size={16} color={Colors.primary} strokeWidth={1.8} />} bg={Colors.primarySurface} label="Total Orders" value={String(orders.length)} />
              <MetricCard icon={<CircleCheck size={16} color={Colors.success} strokeWidth={1.8} />} bg="#E8F5E9" label="Fulfilled" value={String(deliveredCount)} />
              <MetricCard icon={<IndianRupee size={16} color={Colors.secondary} strokeWidth={1.8} />} bg={Colors.secondarySurface} label="Order Value" value={fmt(totalOrderValue)} />
              <MetricCard icon={<IndianRupee size={16} color={Colors.accentDark} strokeWidth={1.8} />} bg={Colors.accentSurface} label="Total Paid" value={fmt(totalPaid)} />
            </View>

            <View style={s.infoCard}>
              <Text style={s.infoCardTitle}>Contact Information</Text>
              <InfoRow icon={<Store size={14} color={Colors.primary} strokeWidth={1.8} />} label="Business" value={vendor.business_name ?? '—'} />
              <InfoRow icon={<FileText size={14} color={Colors.textTertiary} strokeWidth={1.8} />} label="Contact Person" value={vendor.contact_person ?? '—'} />
              {vendor.mobile ? <InfoRow icon={<Phone size={14} color={Colors.primary} strokeWidth={1.8} />} label="Mobile" value={vendor.mobile} /> : null}
              {vendor.whatsapp ? <InfoRow icon={<Phone size={14} color={Colors.success} strokeWidth={1.8} />} label="WhatsApp" value={vendor.whatsapp} /> : null}
              {vendor.email ? <InfoRow icon={<Mail size={14} color={Colors.textTertiary} strokeWidth={1.8} />} label="Email" value={vendor.email} /> : null}
              {vendor.city ? <InfoRow icon={<MapPin size={14} color={Colors.primary} strokeWidth={1.8} />} label="City" value={vendor.city} /> : null}
              {vendor.address ? <InfoRow icon={<MapPin size={14} color={Colors.textTertiary} strokeWidth={1.8} />} label="Address" value={vendor.address} /> : null}
              {vendor.google_maps_url ? (
                <TouchableOpacity
                  style={s.mapsLink}
                  onPress={() => {
                    if (Platform.OS === 'web') (window as any).open(vendor.google_maps_url!, '_blank');
                    else Linking.openURL(vendor.google_maps_url!);
                  }}
                >
                  <ExternalLink size={13} color={Colors.primary} strokeWidth={1.8} />
                  <Text style={s.mapsLinkText}>Open in Google Maps</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={s.infoCard}>
              <Text style={s.infoCardTitle}>Business Details</Text>
              <InfoRow icon={<FileText size={14} color={Colors.textTertiary} strokeWidth={1.8} />} label="GSTIN" value={vendor.gstin ?? '—'} />
              <InfoRow icon={<CalendarDays size={14} color={Colors.textTertiary} strokeWidth={1.8} />} label="Joined" value={format(new Date(vendor.created_at), 'dd MMM yyyy')} />
              <InfoRow icon={<CircleCheck size={14} color={vendor.is_active ? Colors.success : Colors.neutral[400]} strokeWidth={1.8} />} label="Status" value={vendor.is_active ? 'Active' : 'Inactive'} />
            </View>

            <View style={s.infoCard}>
              <Text style={s.infoCardTitle}>Payment Details</Text>
              {vendor.upi_id ? <InfoRow icon={<CreditCard size={14} color={Colors.primary} strokeWidth={1.8} />} label="UPI ID" value={vendor.upi_id} /> : null}
              {vendor.bank_account_name ? <InfoRow icon={<CreditCard size={14} color={Colors.textTertiary} strokeWidth={1.8} />} label="Bank A/C Name" value={vendor.bank_account_name} /> : null}
              {vendor.bank_account_number ? <InfoRow icon={<CreditCard size={14} color={Colors.textTertiary} strokeWidth={1.8} />} label="A/C Number" value={vendor.bank_account_number} /> : null}
              {vendor.bank_ifsc ? <InfoRow icon={<CreditCard size={14} color={Colors.textTertiary} strokeWidth={1.8} />} label="IFSC" value={vendor.bank_ifsc} /> : null}
              {!vendor.upi_id && !vendor.bank_account_number ? <Text style={s.emptyInline}>No payment details on file.</Text> : null}
            </View>

            {vendor.notes ? (
              <View style={s.infoCard}>
                <Text style={s.infoCardTitle}>Internal Notes</Text>
                <Text style={s.notesText}>{vendor.notes}</Text>
              </View>
            ) : null}
          </>
        )}

        {/* ORDERS */}
        {activeTab === 'orders' && (
          <View style={s.listGap}>
            {orders.length === 0 ? (
              <View style={s.emptyState}>
                <Package size={36} color={Colors.textDisabled} strokeWidth={1.2} />
                <Text style={s.emptyTitle}>No procurement orders</Text>
                <Text style={s.emptySub}>Orders placed with this vendor will appear here.</Text>
              </View>
            ) : orders.map(o => {
              const cfg = PO_STATUS_CONFIG[o.status] ?? { label: o.status, color: Colors.textSecondary, bg: Colors.neutral[100] };
              return (
                <TouchableOpacity
                  key={o.id}
                  style={s.listCard}
                  onPress={() => router.push({ pathname: '/(admin)/procurement-order-detail' as any, params: { id: o.id } })}
                  activeOpacity={0.8}
                >
                  <View style={s.listCardTop}>
                    <View style={s.listCardLeft}>
                      <Text style={s.orderNumber}>{o.order_number}</Text>
                      {o.requirement_date ? <Text style={s.orderDate}>{format(new Date(o.requirement_date), 'dd MMM yyyy')}</Text> : null}
                    </View>
                    <View style={[s.statusChip, { backgroundColor: cfg.bg }]}>
                      <Text style={[s.statusChipText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>
                  <View style={s.listCardBottom}>
                    <Text style={s.orderAmount}>{fmt(o.total_amount ?? 0)}</Text>
                    <Text style={s.orderCreated}>Created {format(new Date(o.created_at), 'dd MMM')}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* FLOWERS */}
        {activeTab === 'flowers' && (
          <View style={s.listGap}>
            <View style={s.flowerHeader}>
              <Text style={s.flowerHeaderTitle}>Supplied Flowers</Text>
              {availableFlowers.length > 0 && (
                <TouchableOpacity style={s.addFlowerBtn} onPress={openAddFlowersPage} activeOpacity={0.8}>
                  <Plus size={15} color={Colors.white} strokeWidth={2} />
                  <Text style={s.addFlowerBtnText}>Add Flowers</Text>
                </TouchableOpacity>
              )}
            </View>
            {vendorFlowers.length === 0 ? (
              <View style={s.emptyState}>
                <Flower2 size={36} color={Colors.textDisabled} strokeWidth={1.2} />
                <Text style={s.emptyTitle}>No flowers added yet</Text>
                <Text style={s.emptySub}>Tap "Add Flowers" to select what this vendor can supply and set unit prices.</Text>
              </View>
            ) : vendorFlowers.map(vf => (
              <View key={vf.id} style={s.listCard}>
                <View style={s.flowerCardTop}>
                  <View style={s.flowerCardLeft}>
                    <View style={[s.flowerIcon, { backgroundColor: vf.is_active ? Colors.primarySurface : Colors.neutral[100] }]}>
                      <Flower2 size={16} color={vf.is_active ? Colors.primary : Colors.textTertiary} strokeWidth={1.8} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.flowerName}>{vf.flower_type?.name ?? 'Unknown'}</Text>
                      <Text style={s.flowerUnit}>{vf.unit_type ?? '—'} per unit</Text>
                    </View>
                  </View>
                  <Text style={s.flowerPrice}>{fmt(vf.price_per_unit)}</Text>
                </View>
                {vf.notes ? <Text style={s.flowerNote}>{vf.notes}</Text> : null}
                <View style={s.flowerActions}>
                  <TouchableOpacity style={s.flowerActionBtn} onPress={() => toggleFlowerActive(vf)}>
                    <View style={[s.activeIndicator, { backgroundColor: vf.is_active ? Colors.success : Colors.neutral[300] }]} />
                    <Text style={[s.flowerActionText, { color: vf.is_active ? Colors.success : Colors.textTertiary }]}>
                      {vf.is_active ? 'Active' : 'Inactive'}
                    </Text>
                  </TouchableOpacity>
                  <View style={s.flowerActionsSpacer} />
                  <TouchableOpacity style={s.flowerActionBtn} onPress={() => openEditFlower(vf)}>
                    <Pencil size={13} color={Colors.textSecondary} strokeWidth={1.8} />
                    <Text style={s.flowerActionText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.flowerActionBtn} onPress={() => confirmDeleteFlower(vf)}>
                    <Trash2 size={13} color={Colors.error} strokeWidth={1.8} />
                    <Text style={[s.flowerActionText, { color: Colors.error }]}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* PAYMENTS */}
        {activeTab === 'payments' && (
          <View style={s.listGap}>
            {payments.length === 0 ? (
              <View style={s.emptyState}>
                <IndianRupee size={36} color={Colors.textDisabled} strokeWidth={1.2} />
                <Text style={s.emptyTitle}>No payments recorded</Text>
                <Text style={s.emptySub}>Payments made to this vendor will appear here.</Text>
              </View>
            ) : payments.map(p => {
              const cfg = PAY_STATUS_CONFIG[p.status] ?? { label: p.status, color: Colors.textSecondary, bg: Colors.neutral[100] };
              return (
                <View key={p.id} style={s.listCard}>
                  <View style={s.listCardTop}>
                    <View style={s.listCardLeft}>
                      <Text style={s.orderNumber}>{fmt(p.amount)}</Text>
                      {p.procurement_order?.order_number ? <Text style={s.orderDate}>Order {p.procurement_order.order_number}</Text> : null}
                    </View>
                    <View style={[s.statusChip, { backgroundColor: cfg.bg }]}>
                      <Text style={[s.statusChipText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>
                  <View style={s.listCardBottom}>
                    <Text style={s.orderAmount}>{p.payment_method.replace('_', ' ')}</Text>
                    <Text style={s.orderCreated}>{format(new Date(p.payment_date), 'dd MMM yyyy')}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Vendor edit modal ─────────────────────────────────── */}
      <Modal visible={showEditModal} transparent animationType="fade" onRequestClose={() => setShowEditModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Edit Vendor</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.sectionHead}>Contact</Text>
              <Field label="Business Name" value={vendorForm.business_name} onChange={v => setVendorForm(p => ({ ...p, business_name: v }))} placeholder="e.g. Krishna Flowers" />
              <Field label="Contact Person" value={vendorForm.contact_person} onChange={v => setVendorForm(p => ({ ...p, contact_person: v }))} placeholder="Owner's name" />
              <Field label="Mobile" value={vendorForm.mobile} onChange={v => setVendorForm(p => ({ ...p, mobile: v }))} placeholder="+91 9876543210" keyboardType="phone-pad" />
              <Field label="WhatsApp" value={vendorForm.whatsapp} onChange={v => setVendorForm(p => ({ ...p, whatsapp: v }))} placeholder="+91 9876543210" keyboardType="phone-pad" />
              <Field label="Email" value={vendorForm.email} onChange={v => setVendorForm(p => ({ ...p, email: v }))} placeholder="vendor@email.com" keyboardType="email-address" />
              <Field label="City" value={vendorForm.city} onChange={v => setVendorForm(p => ({ ...p, city: v }))} placeholder="Mumbai" />
              <Field label="Address" value={vendorForm.address} onChange={v => setVendorForm(p => ({ ...p, address: v }))} placeholder="Full address" multiline />
              <Field label="Google Maps URL" value={vendorForm.google_maps_url} onChange={v => setVendorForm(p => ({ ...p, google_maps_url: v }))} placeholder="https://maps.google.com/..." />
              <Text style={s.sectionHead}>Business</Text>
              <Field label="GSTIN" value={vendorForm.gstin} onChange={v => setVendorForm(p => ({ ...p, gstin: v }))} placeholder="27XXXXX" autoCapitalize="characters" />
              <Text style={s.sectionHead}>Payment Details</Text>
              <Field label="UPI ID" value={vendorForm.upi_id} onChange={v => setVendorForm(p => ({ ...p, upi_id: v }))} placeholder="vendor@upi" />
              <Field label="Bank Account Name" value={vendorForm.bank_account_name} onChange={v => setVendorForm(p => ({ ...p, bank_account_name: v }))} placeholder="Name as per bank" />
              <Field label="Bank Account Number" value={vendorForm.bank_account_number} onChange={v => setVendorForm(p => ({ ...p, bank_account_number: v }))} placeholder="000123456789" keyboardType="numeric" />
              <Field label="IFSC Code" value={vendorForm.bank_ifsc} onChange={v => setVendorForm(p => ({ ...p, bank_ifsc: v }))} placeholder="SBIN0001234" autoCapitalize="characters" />
              <Text style={s.sectionHead}>Notes</Text>
              <Field label="Internal Notes" value={vendorForm.notes} onChange={v => setVendorForm(p => ({ ...p, notes: v }))} placeholder="Any notes..." multiline />
              <View style={s.switchRow}>
                <Text style={s.fieldLabel}>Active</Text>
                <Switch value={vendorForm.is_active} onValueChange={v => setVendorForm(p => ({ ...p, is_active: v }))} trackColor={{ true: Colors.primary, false: Colors.neutral[200] }} thumbColor={Colors.white} />
              </View>
              {vendorError ? <Text style={s.errorText}>{vendorError}</Text> : null}
            </ScrollView>
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowEditModal(false)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={saveVendor} disabled={savingVendor}>
                {savingVendor ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveBtnText}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Delete flower confirmation modal ───────────────────── */}
      <Modal visible={!!flowerToDelete} transparent animationType="fade" onRequestClose={() => !deletingFlower && setFlowerToDelete(null)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb, { maxWidth: isWeb ? 400 : undefined }]}>
            <View style={s.deleteIconWrap}>
              <Trash2 size={26} color={Colors.error} strokeWidth={1.8} />
            </View>
            <Text style={s.deleteModalTitle}>Remove flower?</Text>
            <Text style={s.deleteModalSub}>
              Are you sure you want to remove <Text style={s.deleteFlowerName}>{flowerToDelete?.flower_type?.name ?? 'this flower'}</Text> from this vendor's supply list? This cannot be undone.
            </Text>
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setFlowerToDelete(null)} disabled={deletingFlower}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.deleteConfirmBtn} onPress={deleteFlower} disabled={deletingFlower}>
                {deletingFlower
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Text style={s.deleteConfirmBtnText}>Remove</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Edit single flower modal ──────────────────────────── */}
      <Modal visible={showEditFlower} transparent animationType="fade" onRequestClose={() => setShowEditFlower(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Edit Flower</Text>
              <TouchableOpacity onPress={() => setShowEditFlower(false)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.fieldLabel}>Unit</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.unitChips, { marginBottom: Spacing[4] }]}>
                {UNIT_OPTIONS.map(u => (
                  <TouchableOpacity
                    key={u}
                    style={[s.unitChip, editFlower.unit_type === u && s.unitChipActive]}
                    onPress={() => setEditFlower(p => ({ ...p, unit_type: u }))}
                  >
                    <Text style={[s.unitChipText, editFlower.unit_type === u && s.unitChipTextActive]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>Price per Unit (₹)</Text>
                <View style={s.priceInputWrap}>
                  <Text style={s.priceInputPrefix}>₹</Text>
                  <TextInput
                    style={s.priceInput}
                    value={editFlower.price_per_unit}
                    onChangeText={v => setEditFlower(p => ({ ...p, price_per_unit: v }))}
                    placeholder="0.00"
                    placeholderTextColor={Colors.textDisabled}
                    keyboardType="numeric"
                  />
                  <Text style={s.priceInputSuffix}>per {editFlower.unit_type}</Text>
                </View>
              </View>
              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>Notes (optional)</Text>
                <TextInput
                  style={[s.input, s.textarea]}
                  value={editFlower.notes}
                  onChangeText={v => setEditFlower(p => ({ ...p, notes: v }))}
                  placeholder="e.g. seasonal, grade A, etc."
                  placeholderTextColor={Colors.textDisabled}
                  multiline
                  numberOfLines={2}
                />
              </View>
              <View style={s.switchRow}>
                <Text style={s.fieldLabel}>Active</Text>
                <Switch value={editFlower.is_active} onValueChange={v => setEditFlower(p => ({ ...p, is_active: v }))} trackColor={{ true: Colors.primary, false: Colors.neutral[200] }} thumbColor={Colors.white} />
              </View>
              {editFlowerError ? <Text style={s.errorText}>{editFlowerError}</Text> : null}
            </ScrollView>
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowEditFlower(false)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={saveEditFlower} disabled={savingEditFlower}>
                {savingEditFlower ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveBtnText}>Update</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MetricCard({ icon, bg, label, value }: { icon: React.ReactNode; bg: string; label: string; value: string }) {
  return (
    <View style={s.metricCard}>
      <View style={[s.metricIcon, { backgroundColor: bg }]}>{icon}</View>
      <Text style={s.metricValue}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <View style={s.infoIcon}>{icon}</View>
      <View style={s.infoContent}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={s.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, multiline, keyboardType, autoCapitalize }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; multiline?: boolean; keyboardType?: any; autoCapitalize?: any;
}) {
  return (
    <View style={s.fieldGroup}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.input, multiline && s.textarea]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.textDisabled}
        multiline={multiline}
        numberOfLines={multiline ? 2 : 1}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? 'sentences'}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4], backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing[3],
  },
  headerWeb: { paddingHorizontal: Spacing[8], paddingVertical: Spacing[5] },
  backBtn: { padding: Spacing[1] },
  headerProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  headerAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  headerAvatarText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.primary },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: Colors.white },
  headerInfo: { flex: 1 },
  headerName: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  headerContact: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  headerCity: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  dot: { color: Colors.textDisabled, fontSize: Typography.size.sm },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.primarySurface, paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], borderRadius: Radius.full },
  editBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary },
  tabScroll: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, maxHeight: 52 },
  tabScrollContent: { paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], gap: Spacing[2], alignItems: 'center', flexDirection: 'row' },
  tabScrollContentWeb: { paddingHorizontal: Spacing[8] },
  tab: { height: 32, justifyContent: 'center', paddingHorizontal: Spacing[4], borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  tabActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  tabText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  scroll: { flex: 1 },
  content: { padding: Spacing[5] },
  contentWeb: { padding: Spacing[8], maxWidth: 900, alignSelf: 'center', width: '100%' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[3], marginBottom: Spacing[5] },
  metricsGridWeb: { gap: Spacing[4] },
  metricCard: { width: '47%', backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  metricIcon: { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing[2] },
  metricValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  metricLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  infoCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing[4], ...Shadow.sm },
  infoCardTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: Spacing[3] },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3], paddingVertical: Spacing[2] },
  infoIcon: { width: 28, height: 28, borderRadius: Radius.md, backgroundColor: Colors.neutral[50], alignItems: 'center', justifyContent: 'center' },
  infoContent: { flex: 1 },
  infoLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  infoValue: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary, marginTop: 1 },
  mapsLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: Spacing[3], alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.full, backgroundColor: Colors.primarySurface, borderWidth: 1, borderColor: Colors.primary + '40' },
  mapsLinkText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.primary },
  notesText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 20 },
  emptyInline: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, paddingVertical: Spacing[2] },
  listGap: { gap: Spacing[3] },
  listCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  listCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing[2] },
  listCardLeft: { flex: 1 },
  orderNumber: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  orderDate: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  statusChip: { paddingVertical: 3, paddingHorizontal: Spacing[3], borderRadius: Radius.full },
  statusChipText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs },
  listCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderAmount: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.primary },
  orderCreated: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  emptySub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 280 },
  notFoundText: { color: Colors.textSecondary, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base },
  notFoundLink: { color: Colors.primary, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.base },
  // Flowers tab
  flowerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[2] },
  flowerHeaderTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  addFlowerBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1], backgroundColor: Colors.primary, paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], borderRadius: Radius.full },
  addFlowerBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  flowerCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[2] },
  flowerCardLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], flex: 1 },
  flowerIcon: { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  flowerName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  flowerUnit: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  flowerPrice: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.primary },
  flowerNote: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginBottom: Spacing[2] },
  flowerActions: { flexDirection: 'row', alignItems: 'center', paddingTop: Spacing[2], borderTopWidth: 1, borderTopColor: Colors.border, gap: Spacing[3] },
  flowerActionsSpacer: { flex: 1 },
  flowerActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: Spacing[1] },
  flowerActionText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textSecondary },
  activeIndicator: { width: 7, height: 7, borderRadius: 4 },
  // Modal base
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: Spacing[5] },
  modal: { width: '100%', maxHeight: '92%', backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[5], gap: Spacing[3] },
  modalWeb: { maxWidth: 560 },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  modalSubtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 2 },
  sectionHead: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: Spacing[3], marginBottom: Spacing[1] },
  fieldGroup: { gap: Spacing[1], marginBottom: Spacing[3] },
  fieldLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary, marginBottom: Spacing[1] },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary, backgroundColor: Colors.neutral[50] },
  textarea: { minHeight: 64, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing[2], marginBottom: Spacing[3] },
  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error, marginTop: 2 },
  modalFooter: { flexDirection: 'row', gap: Spacing[3], paddingTop: Spacing[1] },
  cancelBtn: { flex: 1, paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  saveBtn: { flex: 2, paddingVertical: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  saveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
  // Delete confirmation modal
  deleteIconWrap: { width: 56, height: 56, borderRadius: Radius.full, backgroundColor: Colors.errorSurface, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: Spacing[4] },
  deleteModalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary, textAlign: 'center', marginBottom: Spacing[2] },
  deleteModalSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: Spacing[5] },
  deleteFlowerName: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textPrimary },
  deleteConfirmBtn: { flex: 2, paddingVertical: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.error, alignItems: 'center', justifyContent: 'center' },
  deleteConfirmBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
  // Edit flower modal — unit chips + price input
  unitChips: { gap: Spacing[2], paddingVertical: 2 },
  unitChip: { paddingHorizontal: Spacing[3], paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  unitChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  unitChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textSecondary },
  unitChipTextActive: { color: Colors.white },
  priceInputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.neutral[50], paddingHorizontal: Spacing[4] },
  priceInputPrefix: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary, marginRight: 4 },
  priceInput: { flex: 1, paddingVertical: Spacing[3], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary },
  priceInputSuffix: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginLeft: 4 },
});
