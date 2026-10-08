import React, { useEffect, useState, useMemo } from 'react';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, RefreshControl, Modal, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Leaf, ArrowLeft, RefreshCw, ChevronLeft, ChevronRight, Package,
  Check, X, Calendar, Store, AlertTriangle, Lock, Send, Pencil,
  Bike, Users, ChevronDown, XCircle, ArrowRight,
} from 'lucide-react-native';
import { router } from 'expo-router';
import { format, addDays, subDays, parseISO } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { DailyRequirement, Vendor, FlowerType, ProcurementBatch } from '@/types/database';

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending:   { bg: Colors.warningSurface,   text: Colors.warning,  label: 'Pending' },
  ordered:   { bg: Colors.primarySurface,   text: Colors.primary,  label: 'Ordered' },
  fulfilled: { bg: Colors.successSurface,   text: Colors.success,  label: 'Fulfilled' },
};

const BATCH_STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  draft:    { bg: Colors.neutral[100],    text: Colors.neutral[600],   label: 'Draft' },
  approved: { bg: Colors.primarySurface,   text: Colors.primary,       label: 'Approved' },
  pushed:   { bg: Colors.successSurface,   text: Colors.success,        label: 'Pushed' },
};

export default function DailyRequirementsScreen() {
  return (
    <ModuleGuard module="procurement">
      <DailyRequirementsScreenContent />
    </ModuleGuard>
  );
}

function DailyRequirementsScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [date, setDate] = useState(addDays(new Date(), 1));
  const [requirements, setRequirements] = useState<DailyRequirement[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [batch, setBatch] = useState<ProcurementBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [genError, setGenError] = useState('');
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState('');
  const [vendorPickerFlowerId, setVendorPickerFlowerId] = useState<string | null>(null);
  const [vendorAssignments, setVendorAssignments] = useState<Record<string, string>>({});
  const [editQty, setEditQty] = useState<Record<string, string>>({});
  const [batchNotes, setBatchNotes] = useState('');
  const [orderCount, setOrderCount] = useState(0);

  // Pickup rider assignment state (shown after batch is pushed)
  const [procurementOrders, setProcurementOrders] = useState<any[]>([]);
  const [riders, setRiders] = useState<any[]>([]);
  const [pickupAssignments, setPickupAssignments] = useState<Record<string, string>>({}); // poId -> riderId
  const [showPickupModal, setShowPickupModal] = useState(false);
  const [pickupTargetPoId, setPickupTargetPoId] = useState<string | null>(null); // null = bulk assign all
  const [pickupRiderSearch, setPickupRiderSearch] = useState('');
  const [savingPickup, setSavingPickup] = useState(false);
  const [pickupError, setPickupError] = useState('');
  const [pickupSaved, setPickupSaved] = useState(false);

  // Item unavailability & reassignment state
  const [unavailItems, setUnavailItems] = useState<any[]>([]);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<any | null>(null);
  const [reassignVendorId, setReassignVendorId] = useState<string>('');
  const [reassignFlowerTypeId, setReassignFlowerTypeId] = useState<string>('');
  const [reassignQty, setReassignQty] = useState('');
  const [reassigning, setReassigning] = useState(false);
  const [reassignError, setReassignError] = useState('');
  const [flowerTypes, setFlowerTypes] = useState<any[]>([]);
  const [garlandDetails, setGarlandDetails] = useState<Record<string, { quantity: number; size: string }[]>>({});

  const dateStr = format(date, 'yyyy-MM-dd');

  const load = async () => {
    setLoading(true);
    setGenError('');
    try {
      const [reqRes, venRes, flowerRes] = await Promise.all([
        supabase
          .from('daily_requirements')
          .select('*')
          .eq('requirement_date', dateStr)
          .order('generated_at'),
        supabase.from('vendors').select('id, business_name, contact_person, mobile').eq('is_active', true).order('business_name'),
        supabase.from('flower_types').select('id, display_name, unit_type, image_url'),
      ]);
      if (reqRes.error) throw reqRes.error;
      if (venRes.error) throw venRes.error;
      if (flowerRes.error) throw flowerRes.error;

      const flowerTypesById = Object.fromEntries(
        (flowerRes.data ?? []).map(flower => [flower.id, flower]),
      );
      const rows = (reqRes.data ?? []).map(requirement => ({
        ...requirement,
        flower_type: flowerTypesById[requirement.flower_type_id],
        original_flower_type: requirement.original_flower_type_id
          ? flowerTypesById[requirement.original_flower_type_id]
          : undefined,
      }));

      setRequirements(rows as DailyRequirement[]);
      setVendors((venRes.data ?? []) as Vendor[]);
      setFlowerTypes((flowerRes.data ?? []) as any[]);

      // Fetch garland details from custom orders for this date
      const { data: customOrdersData } = await supabase
        .from('custom_orders')
        .select('items')
        .eq('delivery_date', dateStr)
        .not('status', 'in', '("cancelled","rejected")');
      const flowerNameToId: Record<string, string> = {};
      for (const ft of (flowerRes.data ?? [])) {
        flowerNameToId[(ft.display_name as string).toLowerCase().trim()] = ft.id;
      }
      const garlandMap: Record<string, { quantity: number; size: string }[]> = {};
      for (const order of (customOrdersData ?? [])) {
        const items = Array.isArray(order.items) ? order.items : [];
        for (const item of items) {
          if ((item.unit ?? '').toLowerCase().trim() !== 'garland') continue;
          const ftId = flowerNameToId[(item.flower_name ?? '').toLowerCase().trim()];
          if (!ftId) continue;
          const qty = Number(item.quantity ?? 0);
          const size = item.measure_type === 'garland_size' ? (item.garland_size ?? '') : (item.flower_count ? `${item.flower_count} flowers` : '');
          if (!garlandMap[ftId]) garlandMap[ftId] = [];
          garlandMap[ftId].push({ quantity: qty, size });
        }
      }
      setGarlandDetails(garlandMap);

      // Get eligible active subscription count for this date (matches Orders page logic)
      const { count: subCount } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .lte('start_date', dateStr)
        .or(`new_end_date.gte.${dateStr},and(new_end_date.is.null,or(end_date.is.null,end_date.gte.${dateStr}))`)
        .or(`pause_until.is.null,pause_until.lt.${dateStr}`);
      setOrderCount(subCount ?? 0);

      // Check for existing batch
      const { data: batchData } = await supabase
        .from('procurement_batches')
        .select('*')
        .eq('requirement_date', dateStr)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setBatch(batchData as any);

      // Load vendor assignments from batch items if batch exists
      if (batchData) {
        const { data: items } = await supabase
          .from('procurement_batch_items')
          .select('flower_type_id, vendor_id, quantity')
          .eq('batch_id', batchData.id);
        const assignments: Record<string, string> = {};
        const quantities: Record<string, string> = {};
        if (items) {
          for (const item of items) {
            if (item.vendor_id) assignments[item.flower_type_id] = item.vendor_id;
            quantities[item.flower_type_id] = String(item.quantity);
          }
        }
        setVendorAssignments(assignments);
        setEditQty(quantities);

        // Load procurement orders created for this batch (pushed batch only)
        if (batchData.status === 'pushed') {
          const [poRes, ridersRes, unavailRes] = await Promise.all([
            supabase
              .from('procurement_orders')
              .select('id, order_number, status, vendor_id, pickup_rider_id, pickup_notes, pickup_assigned_at, vendor:vendors(business_name, contact_person, mobile), items:procurement_order_items(id, quantity, unit_type, flower_type:flower_types(display_name))')
              .eq('requirement_date', dateStr)
              .not('status', 'eq', 'cancelled')
              .order('created_at'),
            supabase.from('riders').select('id, full_name, mobile, zone, vehicle_type').eq('is_active', true).order('full_name'),
            supabase
              .from('item_unavailability')
              .select('id, procurement_order_id, procurement_order_item_id, flower_type_id, reporter_role, reason, status, created_at, flower_type:flower_types(display_name), reassignment:item_reassignments!item_reassignments_unavailability_id_fkey(id, replacement_vendor_id, replacement_flower_type_id, replacement_quantity, replacement_vendor:vendors!item_reassignments_replacement_vendor_id_fkey(business_name), replacement_flower_type:flower_types!item_reassignments_replacement_flower_type_id_fkey(display_name))')
              .eq('requirement_date', dateStr)
              .order('created_at', { ascending: false }),
          ]);
          setProcurementOrders((poRes.data ?? []) as any[]);
          setRiders((ridersRes.data ?? []) as any[]);
          setUnavailItems((unavailRes.data ?? []) as any[]);
          const riderMap: Record<string, string> = {};
          for (const po of (poRes.data ?? []) as any[]) {
            if (po.pickup_rider_id) riderMap[po.id] = po.pickup_rider_id;
          }
          setPickupAssignments(riderMap);
        }
      } else {
        setVendorAssignments({});
        setEditQty({});
        setProcurementOrders([]);
        setUnavailItems([]);
      }
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  usePageVisibility(load);
  useEffect(() => { load(); }, [dateStr]);

  const generate = async () => {
    setGenerating(true);
    setGenError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-daily-requirements`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
          'Apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        },
        body: JSON.stringify({ date: dateStr }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Generation failed');
      setOrderCount(json.order_count ?? 0);
      load();
    } catch (e: any) {
      setGenError(e.message ?? 'Failed to generate requirements');
    }
    setGenerating(false);
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('daily_requirements').update({ status }).eq('id', id);
    setRequirements(prev => prev.map(r => r.id === id ? { ...r, status: status as any } : r));
  };

  const updateQty = async (id: string, flowerTypeId: string, newQty: string) => {
    const qty = parseFloat(newQty);
    if (isNaN(qty) || qty < 0) return;
    await supabase.from('daily_requirements').update({ total_quantity: qty }).eq('id', id);
    setRequirements(prev => prev.map(r => r.id === id ? { ...r, total_quantity: qty } : r));
  };

  const openApproveModal = () => {
    setApproveError('');
    setBatchNotes('');
    setShowApproveModal(true);
  };

  const approveAndPush = async () => {
    setApproving(true);
    setApproveError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-daily-requirements`;
      // We'll handle approval directly via supabase client

      // 1. Create or update batch
      let batchId = batch?.id;
      if (!batchId) {
        const { data: newBatch, error: batchErr } = await supabase
          .from('procurement_batches')
          .insert({
            requirement_date: dateStr,
            status: 'approved',
            notes: batchNotes.trim() || null,
            approved_by: session?.user?.id,
            approved_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (batchErr || !newBatch) { setApproveError(batchErr?.message ?? 'Failed to create batch'); setApproving(false); return; }
        batchId = newBatch.id;
        setBatch(newBatch);
      } else {
        await supabase.from('procurement_batches').update({
          status: 'approved',
          notes: batchNotes.trim() || null,
          approved_by: session?.user?.id,
          approved_at: new Date().toISOString(),
        }).eq('id', batchId);
      }

      // 2. Delete old batch items
      await supabase.from('procurement_batch_items').delete().eq('batch_id', batchId);

      // 3. Create batch items from requirements with vendor assignments
      const batchItems = requirements.map(r => ({
        batch_id: batchId,
        flower_type_id: r.flower_type_id,
        quantity: editQty[r.flower_type_id] ? parseFloat(editQty[r.flower_type_id]) : r.total_quantity,
        unit_type: r.unit_type,
        original_flower_type_id: r.original_flower_type_id,
        vendor_id: vendorAssignments[r.flower_type_id] || null,
      }));
      const { error: itemsErr } = await supabase.from('procurement_batch_items').insert(batchItems);
      if (itemsErr) { setApproveError(itemsErr.message); setApproving(false); return; }

      // 4. Link requirements to batch
      await supabase.from('daily_requirements').update({ batch_id: batchId, status: 'ordered' }).in('id', requirements.map(r => r.id));

      // 4b. Fetch garland details from custom orders for this date
      const { data: customOrdersData } = await supabase
        .from('custom_orders')
        .select('items')
        .eq('delivery_date', dateStr)
        .not('status', 'in', '("cancelled","rejected")');
      const flowerNameToId: Record<string, string> = {};
      for (const ft of flowerTypes) {
        flowerNameToId[(ft.display_name as string).toLowerCase().trim()] = ft.id;
      }
      const garlandByFlowerType: Record<string, { quantity: number; size: string }[]> = {};
      for (const order of (customOrdersData ?? [])) {
        const orderItems = Array.isArray(order.items) ? order.items : [];
        for (const item of orderItems) {
          if ((item.unit ?? '').toLowerCase().trim() !== 'garland') continue;
          const ftId = flowerNameToId[(item.flower_name ?? '').toLowerCase().trim()];
          if (!ftId) continue;
          const qty = Number(item.quantity ?? 0);
          const size = item.measure_type === 'garland_size' ? (item.garland_size ?? '') : (item.flower_count ? `${item.flower_count} flowers` : '');
          if (!garlandByFlowerType[ftId]) garlandByFlowerType[ftId] = [];
          garlandByFlowerType[ftId].push({ quantity: qty, size });
        }
      }

      // 5. Create procurement orders per vendor
      const vendorGroups: Record<string, typeof batchItems> = {};
      for (const item of batchItems) {
        if (!item.vendor_id) continue;
        if (!vendorGroups[item.vendor_id]) vendorGroups[item.vendor_id] = [];
        vendorGroups[item.vendor_id].push(item);
      }

      for (const [vendorId, items] of Object.entries(vendorGroups)) {
        const { data: po, error: poErr } = await supabase
          .from('procurement_orders')
          .insert({
            vendor_id: vendorId,
            requirement_date: dateStr,
            status: 'sent',
            total_amount: 0,
            created_by: session?.user?.id,
          })
          .select()
          .single();
        if (poErr || !po) continue;

        const poItems = items.map(item => ({
          procurement_order_id: po.id,
          flower_type_id: item.flower_type_id,
          quantity: item.quantity,
          unit_type: item.unit_type || 'pieces',
          price_per_unit: null,
          garland_details: garlandByFlowerType[item.flower_type_id] ?? null,
        }));
        await supabase.from('procurement_order_items').insert(poItems);

        // Update batch items with procurement_order_id
        await supabase.from('procurement_batch_items')
          .update({ procurement_order_id: po.id })
          .eq('batch_id', batchId)
          .eq('vendor_id', vendorId);
      }

      // 6. Update batch status to pushed
      await supabase.from('procurement_batches').update({ status: 'pushed' }).eq('id', batchId);

      setShowApproveModal(false);
      load();
    } catch (e: any) {
      setApproveError(e.message ?? 'Failed to approve');
    }
    setApproving(false);
  };

  const openPickupModal = (poId: string | null) => {
    setPickupTargetPoId(poId);
    setPickupRiderSearch('');
    setPickupError('');
    setShowPickupModal(true);
  };

  const selectPickupRider = (riderId: string) => {
    if (pickupTargetPoId === null) {
      // bulk assign all
      const next: Record<string, string> = {};
      for (const po of procurementOrders) next[po.id] = riderId;
      setPickupAssignments(next);
    } else {
      setPickupAssignments(prev => ({ ...prev, [pickupTargetPoId]: riderId }));
    }
    setShowPickupModal(false);
  };

  const clearPickupRider = (poId: string) => {
    setPickupAssignments(prev => {
      const next = { ...prev };
      delete next[poId];
      return next;
    });
  };

  const savePickupAssignments = async () => {
    setSavingPickup(true);
    setPickupError('');
    setPickupSaved(false);
    try {
      const now = new Date().toISOString();
      for (const po of procurementOrders) {
        const riderId = pickupAssignments[po.id] ?? null;
        const { error } = await supabase
          .from('procurement_orders')
          .update({
            pickup_rider_id: riderId,
            pickup_assigned_at: riderId ? now : null,
          })
          .eq('id', po.id);
        if (error) throw error;
      }
      setPickupSaved(true);
      setTimeout(() => setPickupSaved(false), 4000);
      load();
    } catch (e: any) {
      setPickupError(e.message ?? 'Failed to save assignments');
    }
    setSavingPickup(false);
  };

  const openReassignModal = (unavail: any) => {
    setReassignTarget(unavail);
    setReassignVendorId('');
    setReassignFlowerTypeId(unavail.flower_type_id ?? '');
    const item = procurementOrders
      .flatMap((po: any) => po.items ?? [])
      .find((it: any) => it.id === unavail.procurement_order_item_id);
    setReassignQty(item ? String(item.quantity) : '1');
    setReassignError('');
    setShowReassignModal(true);
  };

  const reassignItemInfo = () => {
    if (!reassignTarget) return null;
    const item = procurementOrders
      .flatMap((po: any) => po.items ?? [])
      .find((it: any) => it.id === reassignTarget.procurement_order_item_id);
    return item ?? null;
  };

  const confirmReassign = async () => {
    if (!reassignTarget || !reassignVendorId || !reassignFlowerTypeId) return;
    setReassigning(true);
    setReassignError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const origPo = procurementOrders.find((po: any) => po.id === reassignTarget.procurement_order_id);
      const origVendorId = origPo?.vendor_id ?? null;
      const item = procurementOrders
        .flatMap((po: any) => po.items ?? [])
        .find((it: any) => it.id === reassignTarget.procurement_order_item_id);
      const qty = parseFloat(reassignQty) || (item ? Number(item.quantity) : 1);
      const unitType = item?.unit_type ?? 'pieces';

      // 1. Create a new procurement order for the replacement vendor
      const { data: newPo, error: poErr } = await supabase
        .from('procurement_orders')
        .insert({
          vendor_id: reassignVendorId,
          requirement_date: dateStr,
          status: 'sent',
          total_amount: 0,
          created_by: session?.user?.id,
        })
        .select()
        .single();
      if (poErr || !newPo) { setReassignError(poErr?.message ?? 'Failed to create order'); setReassigning(false); return; }

      // 2. Add the replacement item to the new order
      const { error: itemErr } = await supabase
        .from('procurement_order_items')
        .insert({
          procurement_order_id: newPo.id,
          flower_type_id: reassignFlowerTypeId,
          quantity: qty,
          unit_type: unitType,
          price_per_unit: null,
        });
      if (itemErr) { setReassignError(itemErr.message); setReassigning(false); return; }

      // 3. Insert reassignment record
      const { error: reassignErr } = await supabase
        .from('item_reassignments')
        .insert({
          unavailability_id: reassignTarget.id,
          original_vendor_id: origVendorId,
          replacement_vendor_id: reassignVendorId,
          replacement_flower_type_id: reassignFlowerTypeId,
          replacement_quantity: qty,
          replacement_unit_type: unitType,
          replacement_procurement_order_id: newPo.id,
          reassigned_by: session?.user?.id,
        });
      if (reassignErr) { setReassignError(reassignErr.message); setReassigning(false); return; }

      // 4. Update unavailability status
      const { error: updateErr } = await supabase
        .from('item_unavailability')
        .update({ status: 'reassigned' })
        .eq('id', reassignTarget.id);
      if (updateErr) { setReassignError(updateErr.message); setReassigning(false); return; }

      setShowReassignModal(false);
      setReassignTarget(null);
      load();
    } catch (e: any) {
      setReassignError(e.message ?? 'Failed to reassign');
    }
    setReassigning(false);
  };

  const reassignedByFlower = useMemo(() => {
    const map: Record<string, { vendorName: string; flowerName?: string }> = {};
    for (const u of unavailItems) {
      if (u.status === 'reassigned' && u.flower_type_id) {
        const reassign = (u as any).reassignment?.[0];
        const repVendor = reassign?.replacement_vendor?.business_name;
        const repFlower = reassign?.replacement_flower_type?.display_name;
        if (repVendor) {
          map[u.flower_type_id] = { vendorName: repVendor, flowerName: repFlower };
        }
      }
    }
    return map;
  }, [unavailItems]);

  const totalPending = requirements.filter(r => r.status === 'pending').length;
  const totalOrdered = requirements.filter(r => r.status === 'ordered').length;
  const totalFulfilled = requirements.filter(r => r.status === 'fulfilled').length;
  const totalSubstituted = requirements.filter(r => (r as any).substituted).length;
  const unassignedCount = requirements.filter(r => !vendorAssignments[r.flower_type_id]).length;
  const isLocked = batch?.status === 'pushed';

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
            <Leaf size={isWeb ? 22 : 18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>Daily Requirements</Text>
            <Text style={s.subtitle}>{format(date, 'EEEE, dd MMM yyyy')}</Text>
          </View>
        </View>
        {!isLocked && (
          <TouchableOpacity
            style={[s.genBtn, generating && s.genBtnDisabled]}
            onPress={generate}
            disabled={generating}
            activeOpacity={0.8}
          >
            {generating ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <>
                <RefreshCw size={14} color={Colors.white} strokeWidth={2} />
                <Text style={s.genBtnText}>Generate</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={s.datePicker}>
        <TouchableOpacity onPress={() => setDate(d => subDays(d, 1))} style={s.dateArrow}>
          <ChevronLeft size={20} color={Colors.textSecondary} strokeWidth={1.8} />
        </TouchableOpacity>
        <View style={s.dateCenter}>
          <Calendar size={14} color={Colors.textTertiary} strokeWidth={1.8} />
          <Text style={s.dateText}>{format(date, 'dd MMMM yyyy')}</Text>
          {format(date, 'yyyy-MM-dd') === format(addDays(new Date(), 1), 'yyyy-MM-dd') && (
            <View style={s.todayBadge}><Text style={s.todayText}>Tomorrow</Text></View>
          )}
        </View>
        <TouchableOpacity onPress={() => setDate(d => addDays(d, 1))} style={s.dateArrow}>
          <ChevronRight size={20} color={Colors.textSecondary} strokeWidth={1.8} />
        </TouchableOpacity>
      </View>

      {genError ? (
        <View style={s.errorBanner}>
          <Text style={s.errorBannerText}>{genError}</Text>
        </View>
      ) : null}

      {isLocked && (
        <View style={s.lockedBanner}>
          <Lock size={14} color={Colors.success} strokeWidth={2} />
          <Text style={[s.lockedText, { flex: 1 }]}>Procurement approved and pushed to vendors.</Text>
          {procurementOrders.length > 0 && (
            <View style={s.lockedActions}>
              <TouchableOpacity style={s.assignAllBtn} onPress={() => openPickupModal(null)} activeOpacity={0.8}>
                <Users size={12} color={Colors.primary} strokeWidth={2} />
                <Text style={s.assignAllBtnText}>Assign All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.savePickupBannerBtn, savingPickup && s.saveBtnDisabled]}
                onPress={savePickupAssignments}
                disabled={savingPickup}
                activeOpacity={0.8}
              >
                {savingPickup
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Text style={s.savePickupBannerBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {isLocked && unavailItems.length > 0 && (
        <View style={s.unavailBanner}>
          <AlertTriangle size={14} color={Colors.error} strokeWidth={2} />
          <Text style={[s.unavailBannerText, { flex: 1 }]}>
            {unavailItems.filter(u => u.status === 'pending').length} item(s) reported unavailable — review and reassign below.
          </Text>
        </View>
      )}

      {batch && !isLocked && (
        <View style={s.batchBanner}>
          <View style={[s.batchBadge, { backgroundColor: BATCH_STATUS_COLORS[batch.status]?.bg ?? Colors.neutral[100] }]}>
            <Text style={[s.batchBadgeText, { color: BATCH_STATUS_COLORS[batch.status]?.text ?? Colors.neutral[600] }]}>
              {BATCH_STATUS_COLORS[batch.status]?.label ?? batch.status}
            </Text>
          </View>
          <Text style={s.batchNumber}>{batch.batch_number}</Text>
        </View>
      )}

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, isWeb && s.contentWeb]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {(totalPending > 0 || totalOrdered > 0 || totalFulfilled > 0) && (
          <View style={[s.statsRow, isWeb && s.statsRowWeb]}>
            <View style={[s.statCard, { borderLeftColor: Colors.warning }]}>
              <Text style={[s.statValue, { color: Colors.warning }]}>{totalPending}</Text>
              <Text style={s.statLabel}>Pending</Text>
            </View>
            <View style={[s.statCard, { borderLeftColor: Colors.primary }]}>
              <Text style={[s.statValue, { color: Colors.primary }]}>{totalOrdered}</Text>
              <Text style={s.statLabel}>Ordered</Text>
            </View>
            <View style={[s.statCard, { borderLeftColor: Colors.success }]}>
              <Text style={[s.statValue, { color: Colors.success }]}>{totalFulfilled}</Text>
              <Text style={s.statLabel}>Fulfilled</Text>
            </View>
            {totalSubstituted > 0 && (
              <View style={[s.statCard, { borderLeftColor: Colors.warning }]}>
                <Text style={[s.statValue, { color: Colors.warning }]}>{totalSubstituted}</Text>
                <Text style={s.statLabel}>Substituted</Text>
              </View>
            )}
          </View>
        )}

        {isLocked && unavailItems.length > 0 && (
          <View style={s.unavailSection}>
            <View style={s.unavailSectionHeader}>
              <XCircle size={16} color={Colors.error} strokeWidth={2} />
              <Text style={s.unavailSectionTitle}>Unavailable Items ({unavailItems.length})</Text>
            </View>
            {unavailItems.map((u, i) => {
              const ft = (u as any).flower_type?.display_name ?? 'Unknown';
              const reassign = (u as any).reassignment?.[0];
              const repVendor = reassign?.replacement_vendor?.business_name;
              const repFlower = reassign?.replacement_flower_type?.display_name;
              return (
                <View key={u.id} style={[s.unavailItem, i % 2 === 1 && s.tableRowAlt]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.unavailItemFlower}>{ft}</Text>
                    <Text style={s.unavailItemMeta}>
                      Reported by {u.reporter_role}
                      {u.reason ? ` · ${u.reason}` : ''}
                      {' · '}{format(new Date(u.created_at), 'dd MMM, hh:mm a')}
                    </Text>
                    {u.status === 'reassigned' && reassign && (
                      <View style={s.reassignedBadge}>
                        <Check size={10} color={Colors.success} strokeWidth={2} />
                        <Text style={s.reassignedText}>
                          Reassigned to {repVendor ?? 'vendor'}
                          {repFlower && repFlower !== ft ? ` (${repFlower})` : ''}
                        </Text>
                      </View>
                    )}
                  </View>
                  {u.status === 'pending' ? (
                    <TouchableOpacity
                      style={s.reassignBtn}
                      onPress={() => openReassignModal(u)}
                      activeOpacity={0.8}
                    >
                      <ArrowRight size={12} color={Colors.white} strokeWidth={2} />
                      <Text style={s.reassignBtnText}>Reassign</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={[s.statusBadge, { backgroundColor: u.status === 'reassigned' ? Colors.successSurface : Colors.neutral[100] }]}>
                      <Text style={[s.statusText, { color: u.status === 'reassigned' ? Colors.success : Colors.textTertiary }]}>
                        {u.status === 'reassigned' ? 'Reassigned' : 'Resolved'}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {loading ? (
          <View style={s.center}><ActivityIndicator color={Colors.primary} /></View>
        ) : requirements.length === 0 ? (
          <View style={s.emptyState}>
            <Leaf size={48} color={Colors.textDisabled} strokeWidth={1.2} />
            <Text style={s.emptyTitle}>No requirements for this date</Text>
            <Text style={s.emptySub}>
              {orderCount === 0
                ? "There are no scheduled deliveries for this date. Make sure the order generation cron has run."
                : "There are scheduled deliveries, but the subscription plans have no flower breakup defined. Go to Plans, open a plan, and add flower requirements (which flowers and quantities are in each package)."}
            </Text>
            <View style={s.emptyActions}>
              <TouchableOpacity style={s.generateLargeBtn} onPress={generate} disabled={generating}>
                {generating ? <ActivityIndicator size="small" color={Colors.white} /> : (
                  <>
                    <RefreshCw size={16} color={Colors.white} strokeWidth={2} />
                    <Text style={s.generateLargeBtnText}>Generate Requirements</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={s.goToPlansBtn} onPress={() => router.push('/(admin)/plans')}>
                <Text style={s.goToPlansBtnText}>Go to Plans</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={s.list}>
            {isWeb ? (
              <View style={s.tableCard}>
                <View style={s.tableHead}>
                  <Text style={[s.thCell, { flex: 2.5 }]}>Flower</Text>
                  <Text style={[s.thCell, { flex: 1, textAlign: 'right' }]}>Qty</Text>
                  <Text style={[s.thCell, { flex: 1 }]}>Unit</Text>
                  <Text style={[s.thCell, { flex: 1 }]}>Subs</Text>
                  <Text style={[s.thCell, { flex: 1 }]}>Custom</Text>
                  <Text style={[s.thCell, { flex: 2 }]}>Vendor</Text>
                  {isLocked && procurementOrders.length > 0 && (
                    <Text style={[s.thCell, { flex: 2 }]}>Pickup Rider</Text>
                  )}
                  <Text style={[s.thCell, { flex: 1 }]}>Status</Text>
                </View>
                {requirements.map((r, i) => {
                  const sc = STATUS_COLORS[r.status] ?? STATUS_COLORS.pending;
                  const isSubstituted = (r as any).substituted;
                  const origName = (r as any).original_flower_type?.display_name;
                  return (
                    <View key={r.id} style={[s.tableRow, i % 2 === 1 && s.tableRowAlt]}>
                      <View style={[{ flex: 2.5 }, s.flowerCell]}>
                        <View style={s.flowerDot}>
                          <Leaf size={12} color={Colors.primary} strokeWidth={2} />
                        </View>
                        <View>
                          <Text style={s.tdPrimary}>{(r.flower_type as any)?.display_name ?? 'Unknown'}</Text>
                          {isSubstituted && origName && (
                            <View style={s.subBadge}>
                              <AlertTriangle size={9} color={Colors.warning} strokeWidth={2} />
                              <Text style={s.subBadgeText}>Replaces {origName}</Text>
                            </View>
                          )}
                          {garlandDetails[r.flower_type_id]?.map((g, idx) => (
                            <View key={idx} style={s.garlandBadge}>
                              <Text style={s.garlandBadgeText}>{g.quantity} garland{g.quantity !== 1 ? 's' : ''}{g.size ? ` · ${g.size}` : ''}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
                        {isLocked ? (
                          <Text style={[s.tdCell, { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary }]}>{r.total_quantity}</Text>
                        ) : (
                          <TextInput
                            style={s.qtyInput}
                            value={editQty[r.flower_type_id] ?? String(r.total_quantity)}
                            onChangeText={v => setEditQty(prev => ({ ...prev, [r.flower_type_id]: v }))}
                            onEndEditing={() => updateQty(r.id, r.flower_type_id, editQty[r.flower_type_id] ?? String(r.total_quantity))}
                            keyboardType="numeric"
                          />
                        )}
                      </View>
                      <Text style={[s.tdCell, { flex: 1 }]}>{r.unit_type ?? (r.flower_type as any)?.unit_type}</Text>
                      <Text style={[s.tdCell, { flex: 1 }]}>{r.active_subscriptions_count}</Text>
                      <Text style={[s.tdCell, { flex: 1 }]}>{(r as any).custom_orders_count ?? 0}</Text>
                      <View style={{ flex: 2 }}>
                        {isLocked ? (
                          (() => {
                            const reassigned = reassignedByFlower[r.flower_type_id];
                            if (reassigned) {
                              return (
                                <View style={{ gap: 3 }}>
                                  <Text style={s.tdCell}>{reassigned.vendorName}</Text>
                                  <View style={s.reassignedByAdminBadge}>
                                    <Check size={9} color={Colors.success} strokeWidth={2} />
                                    <Text style={s.reassignedByAdminText}>Reassigned by Admin</Text>
                                  </View>
                                </View>
                              );
                            }
                            return <Text style={s.tdCell}>{vendors.find(v => v.id === vendorAssignments[r.flower_type_id])?.business_name ?? '—'}</Text>;
                          })()
                        ) : (
                          <View style={s.vendorDropdown}>
                            <TouchableOpacity
                              style={s.vendorDropdownBtn}
                              onPress={() => setVendorPickerFlowerId(r.flower_type_id)}
                            >
                              <Store size={12} color={Colors.textTertiary} strokeWidth={1.8} />
                              <Text style={s.vendorDropdownText} numberOfLines={1}>
                                {vendors.find(v => v.id === vendorAssignments[r.flower_type_id])?.business_name ?? 'Assign vendor'}
                              </Text>
                              <ChevronRight size={12} color={Colors.textTertiary} strokeWidth={1.8} style={{ transform: [{ rotate: '90deg' }] }} />
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                      {isLocked && procurementOrders.length > 0 && (() => {
                        const vendorId = vendorAssignments[r.flower_type_id];
                        const po = procurementOrders.find((p: any) => p.vendor_id === vendorId);
                        const assignedRider = po ? riders.find(rd => rd.id === pickupAssignments[po.id]) : null;
                        return (
                          <View style={{ flex: 2 }}>
                            {assignedRider ? (
                              <View style={s.inlineRiderBadge}>
                                <Bike size={11} color={Colors.success} strokeWidth={2} />
                                <Text style={s.inlineRiderName} numberOfLines={1}>{assignedRider.full_name}</Text>
                                <TouchableOpacity
                                  onPress={() => po && clearPickupRider(po.id)}
                                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                >
                                  <X size={11} color={Colors.textTertiary} strokeWidth={2} />
                                </TouchableOpacity>
                              </View>
                            ) : null}
                            {vendorId ? (
                              <TouchableOpacity
                                style={s.inlineRiderBtn}
                                onPress={() => po && openPickupModal(po.id)}
                                activeOpacity={0.8}
                              >
                                <Bike size={11} color={assignedRider ? Colors.textTertiary : Colors.primary} strokeWidth={2} />
                                <Text style={[s.inlineRiderBtnText, assignedRider && { color: Colors.textTertiary }]} numberOfLines={1}>
                                  {assignedRider ? 'Change' : 'Assign rider'}
                                </Text>
                              </TouchableOpacity>
                            ) : (
                              <Text style={s.tdCell}>—</Text>
                            )}
                          </View>
                        );
                      })()}
                      <View style={{ flex: 1 }}>
                        <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
                          <Text style={[s.statusText, { color: sc.text }]}>{sc.label}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              requirements.map(r => {
                const sc = STATUS_COLORS[r.status] ?? STATUS_COLORS.pending;
                const isSubstituted = (r as any).substituted;
                const origName = (r as any).original_flower_type?.display_name;
                return (
                  <View key={r.id} style={s.reqCard}>
                    <View style={s.reqCardTop}>
                      <View style={s.flowerDot}>
                        <Leaf size={14} color={Colors.primary} strokeWidth={2} />
                      </View>
                      <View style={s.reqInfo}>
                        <Text style={s.reqFlower}>{(r.flower_type as any)?.display_name ?? 'Unknown'}</Text>
                        {isSubstituted && origName && (
                          <View style={s.subBadge}>
                            <AlertTriangle size={9} color={Colors.warning} strokeWidth={2} />
                            <Text style={s.subBadgeText}>Replaces {origName}</Text>
                          </View>
                        )}
                        {garlandDetails[r.flower_type_id]?.map((g, idx) => (
                          <View key={idx} style={s.garlandBadge}>
                            <Text style={s.garlandBadgeText}>{g.quantity} garland{g.quantity !== 1 ? 's' : ''}{g.size ? ` · ${g.size}` : ''}</Text>
                          </View>
                        ))}
                        <Text style={s.reqSubs}>
                          {r.active_subscriptions_count} subscription{r.active_subscriptions_count !== 1 ? 's' : ''}
                          {((r as any).custom_orders_count ?? 0) > 0 ? ` · ${(r as any).custom_orders_count} custom` : ''}
                        </Text>
                      </View>
                      <View>
                        {isLocked ? (
                          <>
                            <Text style={s.reqQty}>{r.total_quantity}</Text>
                            <Text style={s.reqUnit}>{r.unit_type ?? (r.flower_type as any)?.unit_type}</Text>
                          </>
                        ) : (
                          <>
                            <TextInput
                              style={s.qtyInputMobile}
                              value={editQty[r.flower_type_id] ?? String(r.total_quantity)}
                              onChangeText={v => setEditQty(prev => ({ ...prev, [r.flower_type_id]: v }))}
                              onEndEditing={() => updateQty(r.id, r.flower_type_id, editQty[r.flower_type_id] ?? String(r.total_quantity))}
                              keyboardType="numeric"
                            />
                            <Text style={s.reqUnit}>{r.unit_type ?? (r.flower_type as any)?.unit_type}</Text>
                          </>
                        )}
                      </View>
                    </View>
                    <View style={s.reqCardBottom}>
                      <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
                        <Text style={[s.statusText, { color: sc.text }]}>{sc.label}</Text>
                      </View>
                      {!isLocked && (
                        <TouchableOpacity
                          style={s.vendorAssignBtn}
                          onPress={() => setVendorPickerFlowerId(r.flower_type_id)}
                        >
                          <Store size={12} color={Colors.primary} strokeWidth={1.8} />
                          <Text style={s.vendorAssignText} numberOfLines={1}>
                            {vendors.find(v => v.id === vendorAssignments[r.flower_type_id])?.business_name ?? 'Assign vendor'}
                          </Text>
                          <ChevronRight size={12} color={Colors.primary} strokeWidth={1.8} style={{ transform: [{ rotate: '90deg' }] }} />
                        </TouchableOpacity>
                      )}
                      {isLocked && (() => {
                        const reassigned = reassignedByFlower[r.flower_type_id];
                        if (reassigned) {
                          return (
                            <View style={{ gap: 4 }}>
                              <View style={s.vendorAssignBtn}>
                                <Store size={12} color={Colors.success} strokeWidth={1.8} />
                                <Text style={[s.vendorAssignText, { color: Colors.success }]} numberOfLines={1}>{reassigned.vendorName}</Text>
                              </View>
                              <View style={s.reassignedByAdminBadge}>
                                <Check size={9} color={Colors.success} strokeWidth={2} />
                                <Text style={s.reassignedByAdminText}>Reassigned by Admin</Text>
                              </View>
                            </View>
                          );
                        }
                        if (vendorAssignments[r.flower_type_id]) {
                          return (
                            <View style={s.vendorAssignBtn}>
                              <Store size={12} color={Colors.textTertiary} strokeWidth={1.8} />
                              <Text style={s.vendorAssignText} numberOfLines={1}>
                                {vendors.find(v => v.id === vendorAssignments[r.flower_type_id])?.business_name ?? '—'}
                              </Text>
                            </View>
                          );
                        }
                        return null;
                      })()}
                    </View>
                    {isLocked && procurementOrders.length > 0 && vendorAssignments[r.flower_type_id] && (() => {
                      const vendorId = vendorAssignments[r.flower_type_id];
                      const po = procurementOrders.find((p: any) => p.vendor_id === vendorId);
                      const assignedRider = po ? riders.find(rd => rd.id === pickupAssignments[po.id]) : null;
                      return (
                        <View style={s.mobileRiderRow}>
                          <Bike size={12} color={assignedRider ? Colors.success : Colors.textTertiary} strokeWidth={2} />
                          {assignedRider ? (
                            <Text style={s.mobileRiderName} numberOfLines={1}>{assignedRider.full_name}</Text>
                          ) : (
                            <Text style={s.mobileRiderEmpty}>No pickup rider assigned</Text>
                          )}
                          {assignedRider && (
                            <TouchableOpacity onPress={() => po && clearPickupRider(po.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                              <X size={11} color={Colors.textTertiary} strokeWidth={2} />
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            style={s.mobileRiderBtn}
                            onPress={() => po && openPickupModal(po.id)}
                            activeOpacity={0.8}
                          >
                            <Text style={s.mobileRiderBtnText}>{assignedRider ? 'Change' : 'Assign'}</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })()}
                  </View>
                );
              })
            )}

            {/* Approve & Push section */}
            {!isLocked && requirements.length > 0 && (
              <View style={s.approveSection}>
                <View style={s.approveInfo}>
                  <Text style={s.approveTitle}>Review & Approve Procurement</Text>
                  <Text style={s.approveSub}>
                    {requirements.length} flower requirements · {unassignedCount} unassigned
                    {unassignedCount > 0 ? ' (unassigned flowers will not be ordered)' : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[s.approveBtn, (unassignedCount > 0 || approving) && s.approveBtnDisabled]}
                  onPress={openApproveModal}
                  disabled={unassignedCount > 0 || approving}
                  activeOpacity={0.8}
                >
                  <Send size={16} color={Colors.white} strokeWidth={2} />
                  <Text style={s.approveBtnText}>Approve & Push to Vendors</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Pickup rider save feedback */}
            {isLocked && procurementOrders.length > 0 && (pickupError || pickupSaved) && (
              <View style={[s.pickupFeedback, pickupError ? s.pickupFeedbackError : s.pickupFeedbackSuccess]}>
                {pickupSaved && <Check size={14} color={Colors.success} strokeWidth={2} />}
                <Text style={pickupError ? s.pickupFeedbackErrorText : s.pickupFeedbackSuccessText}>
                  {pickupError || 'Rider assignments saved'}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Vendor picker modal */}
      <Modal visible={vendorPickerFlowerId !== null} transparent animationType="fade" onRequestClose={() => setVendorPickerFlowerId(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, isWeb && s.modalCardWeb, { maxHeight: '70%' }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Assign Vendor</Text>
              <TouchableOpacity onPress={() => setVendorPickerFlowerId(null)} style={s.modalClose}>
                <X size={20} color={Colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <ScrollView style={s.vendorPickerList}>
              <TouchableOpacity
                style={[
                  s.vendorPickerItem,
                  !vendorAssignments[vendorPickerFlowerId ?? ''] && s.vendorPickerItemSelected,
                ]}
                onPress={() => {
                  setVendorAssignments(prev => {
                    const copy = { ...prev };
                    delete copy[vendorPickerFlowerId ?? ''];
                    return copy;
                  });
                  setVendorPickerFlowerId(null);
                }}
              >
                <View style={s.vendorPickerRadio}>
                  {!vendorAssignments[vendorPickerFlowerId ?? ''] && <View style={s.vendorPickerRadioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.vendorPickerName}>No vendor</Text>
                  <Text style={s.vendorPickerSub}>Flower will not be ordered</Text>
                </View>
              </TouchableOpacity>
              {vendors.map(v => {
                const selected = vendorAssignments[vendorPickerFlowerId ?? ''] === v.id;
                return (
                  <TouchableOpacity
                    key={v.id}
                    style={[s.vendorPickerItem, selected && s.vendorPickerItemSelected]}
                    onPress={() => {
                      setVendorAssignments(prev => ({ ...prev, [vendorPickerFlowerId ?? '']: v.id }));
                      setVendorPickerFlowerId(null);
                    }}
                  >
                    <View style={s.vendorPickerRadio}>
                      {selected && <View style={s.vendorPickerRadioDot} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.vendorPickerName}>{v.business_name}</Text>
                      <Text style={s.vendorPickerSub}>{[v.contact_person, v.mobile].filter(Boolean).join(' · ')}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
              {vendors.length === 0 && (
                <View style={s.vendorPickerEmpty}>
                  <Text style={s.vendorPickerEmptyText}>No active vendors found</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Pickup Rider Picker Modal */}
      <Modal visible={showPickupModal} transparent animationType="fade" onRequestClose={() => setShowPickupModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, isWeb && s.modalCardWeb, { maxHeight: '80%' }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                {pickupTargetPoId === null ? 'Assign All Orders to Rider' : 'Assign Pickup Rider'}
              </Text>
              <TouchableOpacity onPress={() => setShowPickupModal(false)} style={s.modalClose}>
                <X size={20} color={Colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <View style={s.riderSearchWrap}>
              <TextInput
                style={s.riderSearchInput}
                value={pickupRiderSearch}
                onChangeText={setPickupRiderSearch}
                placeholder="Search riders..."
                autoFocus
              />
            </View>
            <ScrollView style={s.vendorPickerList}>
              {riders
                .filter(r =>
                  !pickupRiderSearch.trim() ||
                  r.full_name.toLowerCase().includes(pickupRiderSearch.toLowerCase()) ||
                  (r.mobile ?? '').includes(pickupRiderSearch)
                )
                .map(r => {
                  const isSelected = pickupTargetPoId !== null
                    ? pickupAssignments[pickupTargetPoId] === r.id
                    : Object.values(pickupAssignments).length > 0 &&
                      procurementOrders.every(po => pickupAssignments[po.id] === r.id);
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[s.vendorPickerItem, isSelected && s.vendorPickerItemSelected]}
                      onPress={() => selectPickupRider(r.id)}
                      activeOpacity={0.75}
                    >
                      <View style={s.vendorPickerRadio}>
                        {isSelected && <View style={s.vendorPickerRadioDot} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.vendorPickerName}>{r.full_name}</Text>
                        <Text style={s.vendorPickerSub}>
                          {[r.mobile, r.zone, r.vehicle_type].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      {isSelected && <Check size={16} color={Colors.primary} strokeWidth={2} />}
                    </TouchableOpacity>
                  );
                })}
              {riders.filter(r =>
                !pickupRiderSearch.trim() ||
                r.full_name.toLowerCase().includes(pickupRiderSearch.toLowerCase()) ||
                (r.mobile ?? '').includes(pickupRiderSearch)
              ).length === 0 && (
                <View style={s.vendorPickerEmpty}>
                  <Text style={s.vendorPickerEmptyText}>No riders found</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Approve confirmation modal */}
      <Modal visible={showApproveModal} transparent animationType="fade" onRequestClose={() => setShowApproveModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, isWeb && s.modalCardWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Approve Procurement Batch</Text>
              <TouchableOpacity onPress={() => setShowApproveModal(false)} style={s.modalClose}>
                <X size={20} color={Colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <View style={s.modalBody}>
              <Text style={s.modalDesc}>
                You are about to approve and push procurement orders to vendors. This will:
              </Text>
              <View style={s.modalChecklist}>
                <View style={s.modalCheckItem}>
                  <Check size={14} color={Colors.success} strokeWidth={2} />
                  <Text style={s.modalCheckText}>Freeze the requirement list (no further edits)</Text>
                </View>
                <View style={s.modalCheckItem}>
                  <Check size={14} color={Colors.success} strokeWidth={2} />
                  <Text style={s.modalCheckText}>Create procurement orders for each assigned vendor</Text>
                </View>
                <View style={s.modalCheckItem}>
                  <Check size={14} color={Colors.success} strokeWidth={2} />
                  <Text style={s.modalCheckText}>Push orders to vendor app instantly</Text>
                </View>
                {unassignedCount > 0 && (
                  <View style={s.modalCheckItem}>
                    <AlertTriangle size={14} color={Colors.warning} strokeWidth={2} />
                    <Text style={s.modalCheckText}>{unassignedCount} flowers have no vendor assigned</Text>
                  </View>
                )}
              </View>
              <Text style={s.fieldLabel}>Notes (Optional)</Text>
              <TextInput
                style={[s.textInput, s.textInputMultiline]}
                value={batchNotes}
                onChangeText={setBatchNotes}
                placeholder="Add any notes for this batch..."
                multiline
              />
              {approveError ? <Text style={s.errorText}>{approveError}</Text> : null}
            </View>
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowApproveModal(false)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, approving && s.saveBtnDisabled]} onPress={approveAndPush} disabled={approving}>
                {approving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveBtnText}>Approve & Push</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reassignment Modal */}
      <Modal visible={showReassignModal} transparent animationType="fade" onRequestClose={() => setShowReassignModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, isWeb && s.modalCardWeb, { maxHeight: '80%' }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Reassign Unavailable Item</Text>
              <TouchableOpacity onPress={() => setShowReassignModal(false)} style={s.modalClose}>
                <X size={20} color={Colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <View style={s.modalBody}>
              {reassignTarget && (
                <View style={s.reassignInfoBanner}>
                  <XCircle size={14} color={Colors.error} strokeWidth={2} />
                  <Text style={s.reassignInfoText}>
                    {(reassignTarget as any).flower_type?.display_name ?? 'Unknown flower'} reported unavailable by {(reassignTarget as any).reporter_role}
                  </Text>
                </View>
              )}
              <Text style={s.fieldLabel}>Replacement Vendor</Text>
              <View style={s.reassignPickerWrap}>
                {vendors.map(v => {
                  const sel = reassignVendorId === v.id;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      style={[s.vendorPickerItem, sel && s.vendorPickerItemSelected]}
                      onPress={() => setReassignVendorId(v.id)}
                    >
                      <View style={s.vendorPickerRadio}>
                        {sel && <View style={s.vendorPickerRadioDot} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.vendorPickerName}>{v.business_name}</Text>
                        <Text style={s.vendorPickerSub}>{[v.contact_person, v.mobile].filter(Boolean).join(' · ')}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {(() => {
                const item = reassignItemInfo();
                const ftName = (reassignTarget as any)?.flower_type?.display_name ?? 'Unknown flower';
                const qty = item ? Number(item.quantity) : parseFloat(reassignQty) || 1;
                const unit = item?.unit_type ?? (reassignTarget as any)?.flower_type?.unit_type ?? 'pieces';
                return (
                  <View style={s.reassignItemCard}>
                    <View style={s.reassignItemRow}>
                      <Leaf size={14} color={Colors.primary} strokeWidth={2} />
                      <Text style={s.reassignItemFlower}>{ftName}</Text>
                    </View>
                    <Text style={s.reassignItemQty}>
                      Quantity: {qty} {unit}
                    </Text>
                  </View>
                );
              })()}
              {reassignError ? <Text style={s.errorText}>{reassignError}</Text> : null}
            </View>
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowReassignModal(false)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.saveBtn, reassigning && s.saveBtnDisabled]}
                onPress={confirmReassign}
                disabled={reassigning || !reassignVendorId || !reassignFlowerTypeId}
              >
                {reassigning ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveBtnText}>Reassign Item</Text>}
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
  genBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.primary, paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], borderRadius: Radius.full },
  genBtnDisabled: { opacity: 0.6 },
  genBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  datePicker: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: Spacing[3] },
  dateArrow: { padding: Spacing[3], paddingHorizontal: Spacing[4] },
  dateCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2] },
  dateText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  todayBadge: { backgroundColor: Colors.primarySurface, paddingVertical: 2, paddingHorizontal: 8, borderRadius: Radius.full },
  todayText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.primary },
  errorBanner: { backgroundColor: Colors.errorSurface, padding: Spacing[4], borderBottomWidth: 1, borderBottomColor: Colors.error },
  errorBannerText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error },
  lockedBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.successSurface, padding: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.success + '40' },
  lockedText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.success },
  lockedActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  assignAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: Spacing[3], borderRadius: Radius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.primary },
  assignAllBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.primary },
  savePickupBannerBtn: { paddingVertical: 4, paddingHorizontal: Spacing[3], borderRadius: Radius.full, backgroundColor: Colors.primary, minWidth: 50, alignItems: 'center' },
  savePickupBannerBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.white },
  batchBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.white, padding: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.border },
  batchBadge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: Radius.full },
  batchBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs },
  batchNumber: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  scroll: { flex: 1 },
  content: { padding: Spacing[5], gap: Spacing[4] },
  contentWeb: { padding: Spacing[8], maxWidth: 1100, alignSelf: 'center', width: '100%' },
  statsRow: { flexDirection: 'row', gap: Spacing[3] },
  statsRowWeb: { gap: Spacing[4] },
  statCard: { flex: 1, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderLeftWidth: 3, ...Shadow.sm },
  statValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'] },
  statLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  center: { paddingTop: 80, alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  emptySub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 300 },
  generateLargeBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.primary, paddingVertical: Spacing[3], paddingHorizontal: Spacing[6], borderRadius: Radius.full, marginTop: Spacing[3] },
  generateLargeBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
  emptyActions: { flexDirection: 'row', gap: Spacing[3], marginTop: Spacing[2], alignItems: 'center' },
  goToPlansBtn: { paddingVertical: Spacing[3], paddingHorizontal: Spacing[5], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.primary },
  goToPlansBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.primary },
  list: { gap: Spacing[3] },
  tableCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  tableHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], backgroundColor: Colors.neutral[50], borderBottomWidth: 1, borderBottomColor: Colors.border },
  thCell: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  flowerCell: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  flowerDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  tdPrimary: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  tdCell: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  subBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.warningSurface, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1, marginTop: 2, alignSelf: 'flex-start' },
  subBadgeText: { fontSize: 9, fontFamily: Typography.fontFamily.sansMedium, color: Colors.warning },
  qtyInput: { width: 60, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary, textAlign: 'right' },
  qtyInputMobile: { width: 60, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary, textAlign: 'right' },
  statusBadge: { alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 10, borderRadius: Radius.full },
  statusText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs },
  vendorDropdown: { flexDirection: 'row' },
  vendorDropdownBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1], paddingHorizontal: Spacing[2], paddingVertical: Spacing[1], borderRadius: Radius.sm, backgroundColor: Colors.neutral[50], borderWidth: 1, borderColor: Colors.border, flex: 1 },
  vendorDropdownText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textSecondary, flexShrink: 1, flex: 1 },
  vendorPickerList: { paddingHorizontal: Spacing[2], paddingBottom: Spacing[4] },
  vendorPickerItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], borderRadius: Radius.md, marginHorizontal: Spacing[2], marginVertical: 2 },
  vendorPickerItemSelected: { backgroundColor: Colors.primarySurface },
  vendorPickerRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  vendorPickerRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  vendorPickerName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  vendorPickerSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  vendorPickerEmpty: { padding: Spacing[6], alignItems: 'center' },
  vendorPickerEmptyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  reqCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, gap: Spacing[3], ...Shadow.sm },
  reqCardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  reqInfo: { flex: 1 },
  reqFlower: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  reqSubs: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  reqQty: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.textPrimary, textAlign: 'right' },
  reqUnit: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, textAlign: 'right' },
  reqCardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  vendorAssignBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1], paddingHorizontal: Spacing[2], paddingVertical: Spacing[1], borderRadius: Radius.sm, backgroundColor: Colors.primarySurface, flexShrink: 1 },
  vendorAssignText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.primary, flexShrink: 1 },
  approveSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm, marginTop: Spacing[2] },
  approveInfo: { flex: 1 },
  approveTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary },
  approveSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  approveBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.primary, paddingVertical: Spacing[3], paddingHorizontal: Spacing[5], borderRadius: Radius.md },
  approveBtnDisabled: { opacity: 0.5 },
  approveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, width: '90%', maxHeight: '85%' },
  modalCardWeb: { width: 500, maxWidth: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  modalClose: { padding: Spacing[1] },
  modalBody: { padding: Spacing[5], gap: Spacing[3] },
  modalDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  modalChecklist: { gap: Spacing[2], paddingVertical: Spacing[2] },
  modalCheckItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  modalCheckText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  fieldLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  textInput: { backgroundColor: Colors.neutral[50], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  textInputMultiline: { minHeight: 60, textAlignVertical: 'top' },
  errorText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.error },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing[3], paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], borderTopWidth: 1, borderTopColor: Colors.border },
  cancelBtn: { paddingVertical: Spacing[3], paddingHorizontal: Spacing[5], borderRadius: Radius.md },
  cancelBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  saveBtn: { backgroundColor: Colors.primary, paddingVertical: Spacing[3], paddingHorizontal: Spacing[5], borderRadius: Radius.md, minWidth: 120, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  // Inline pickup rider column
  inlineRiderBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successSurface, paddingVertical: 3, paddingHorizontal: 6, borderRadius: Radius.full, marginBottom: 3, alignSelf: 'flex-start', maxWidth: '100%' },
  inlineRiderName: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11, color: Colors.success, flexShrink: 1 },
  inlineRiderBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 6, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.primary, backgroundColor: Colors.primarySurface, alignSelf: 'flex-start' },
  inlineRiderBtnText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11, color: Colors.primary },
  // Mobile card rider row
  mobileRiderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingTop: Spacing[2], borderTopWidth: 1, borderTopColor: Colors.divider },
  mobileRiderName: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.success, flex: 1 },
  mobileRiderEmpty: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, flex: 1 },
  mobileRiderBtn: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: Radius.full, backgroundColor: Colors.primarySurface, borderWidth: 1, borderColor: Colors.primary },
  mobileRiderBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.primary },
  // Feedback bar
  pickupFeedback: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], padding: Spacing[3], borderRadius: Radius.md, marginTop: Spacing[2] },
  pickupFeedbackSuccess: { backgroundColor: Colors.successSurface },
  pickupFeedbackError: { backgroundColor: Colors.errorSurface },
  pickupFeedbackSuccessText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.success },
  pickupFeedbackErrorText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.error },
  riderSearchWrap: { paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.border },
  riderSearchInput: { backgroundColor: Colors.neutral[50], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  unavailBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.errorSurface, padding: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.error + '40' },
  unavailBannerText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.error },
  unavailSection: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  unavailSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], backgroundColor: Colors.errorSurface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  unavailSectionTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm, color: Colors.error },
  unavailItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: Spacing[3] },
  unavailItemFlower: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  unavailItemMeta: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary, marginTop: 2 },
  reassignedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successSurface, borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4, alignSelf: 'flex-start' },
  reassignedText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11, color: Colors.success },
  reassignBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primary, paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderRadius: Radius.md },
  reassignBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.white },
  reassignInfoBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.errorSurface, borderRadius: Radius.md, padding: Spacing[3], marginBottom: Spacing[2] },
  reassignInfoText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.error, flex: 1 },
  reassignPickerWrap: { maxHeight: 200, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, marginBottom: Spacing[2] },
  reassignItemCard: { backgroundColor: Colors.neutral[50], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing[3], gap: 4 },
  reassignItemRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  reassignItemFlower: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  reassignItemQty: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  reassignedByAdminBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.successSurface, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1, alignSelf: 'flex-start' },
  reassignedByAdminText: { fontSize: 9, fontFamily: Typography.fontFamily.sansMedium, color: Colors.success },
  garlandBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primarySurface, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1, marginTop: 2, alignSelf: 'flex-start' },
  garlandBadgeText: { fontSize: 9, fontFamily: Typography.fontFamily.sansMedium, color: Colors.primary },
});
