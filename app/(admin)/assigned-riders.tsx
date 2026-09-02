import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, ActivityIndicator, RefreshControl, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, ChevronDown, MapPin, Building2, Bike, Check, SquareCheck as CheckSquare, Square, User, CircleAlert as AlertCircle, CircleCheck as CheckCircle, Truck } from 'lucide-react-native';
import { addDays, format, parseISO } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import ModuleGuard from '@/components/admin/ModuleGuard';

interface DeliveryRow {
  order_id: string;
  locality_id: string | null;
  locality_name: string | null;
  apartment_id: number | null;
  apartment_name: string | null;
  address_id: string;
  street: string;
  city: string;
  assignment_id: string | null;
  assignment_status: string | null;
  rider_id: string | null;
  rider_name: string | null;
  rider_mobile: string | null;
  delivered_at: string | null;
}

interface LocalityGroup {
  locality_id: string;
  locality_name: string;
  apartments: ApartmentGroup[];
  totalDeliveries: number;
  totalAssigned: number;
  totalUnassigned: number;
  totalDelivered: number;
}

interface ApartmentGroup {
  apartment_id: string;
  apartment_name: string;
  deliveries: DeliveryRow[];
  assignedCount: number;
  unassignedCount: number;
  deliveredCount: number;
}

interface Rider {
  id: string;
  full_name: string;
  mobile: string;
}

const NO_APARTMENT = '__no_apartment__';

export default function AssignedRidersScreen() {
  return (
    <ModuleGuard module="riders">
      <AssignedRidersContent />
    </ModuleGuard>
  );
}

function AssignedRidersContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { profile: adminProfile } = useAuthStore();

  const [selectedDate, setSelectedDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedLocalityId, setSelectedLocalityId] = useState<string | null>(null);
  const [showLocalityDropdown, setShowLocalityDropdown] = useState(false);
  const [selectedApartments, setSelectedApartments] = useState<Set<string>>(new Set());
  const [selectedRider, setSelectedRider] = useState<Rider | null>(null);
  const [showRiderPicker, setShowRiderPicker] = useState(false);
  const [riderSearch, setRiderSearch] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState<{ assigned: number; reassigned: number; failed: number } | null>(null);
  const [showResult, setShowResult] = useState(false);

  const load = useCallback(async () => {
    if (!selectedDate) return;
    setLoading(true);
    setError(null);
    try {
      const ordersRes = await supabase
        .from('orders')
        .select(`
          id, scheduled_date, status,
          subscription:subscriptions(
            id, status,
            delivery_address:addresses(id, street, city, locality_id, apartment_id, apartment_name)
          )
        `)
        .eq('scheduled_date', selectedDate)
        .in('status', ['scheduled', 'out_for_delivery', 'delivered'])
        .order('created_at');

      if (ordersRes.error) throw new Error(ordersRes.error.message);

      const orderRows = (ordersRes.data ?? []) as any[];

      const activeOrderIds = orderRows
        .filter(o => o.subscription?.status === 'active' && o.subscription?.delivery_address)
        .map(o => o.id);

      const [ridersRes, assignmentsRes] = await Promise.all([
        supabase
          .from('riders')
          .select('id, full_name, mobile')
          .eq('is_active', true)
          .order('full_name'),
        activeOrderIds.length > 0
          ? supabase
              .from('rider_order_assignments')
              .select('id, order_id, status, rider_id, delivered_at, rider:riders!rider_order_assignments_rider_id_fkey(full_name, mobile)')
              .in('order_id', activeOrderIds)
              .in('status', ['assigned', 'accepted', 'picked_up', 'delivered'])
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      if (ridersRes.error) throw new Error(ridersRes.error.message);
      if (assignmentsRes.error) throw new Error(assignmentsRes.error.message);

      const assignmentByOrderId = new Map<string, {
        assignment_id: string;
        status: string;
        rider_id: string;
        rider_name: string;
        rider_mobile: string;
        delivered_at: string | null;
      }>();
      for (const a of (assignmentsRes.data ?? []) as any[]) {
        if (a.order_id) {
          assignmentByOrderId.set(a.order_id, {
            assignment_id: a.id,
            status: a.status,
            rider_id: a.rider_id,
            rider_name: a.rider?.full_name ?? null,
            rider_mobile: a.rider?.mobile ?? null,
            delivered_at: a.delivered_at,
          });
        }
      }

      const preliminaryRows: DeliveryRow[] = [];
      for (const order of orderRows) {
        const sub = order.subscription;
        if (!sub || sub.status !== 'active') continue;
        const addr = sub.delivery_address;
        if (!addr) continue;
        const assignment = assignmentByOrderId.get(order.id);
        preliminaryRows.push({
          order_id: order.id,
          locality_id: addr.locality_id ?? null,
          locality_name: null,
          apartment_id: addr.apartment_id ?? null,
          apartment_name: addr.apartment_name ?? null,
          address_id: addr.id,
          street: addr.street ?? '',
          city: addr.city ?? '',
          assignment_id: assignment?.assignment_id ?? null,
          assignment_status: assignment?.status ?? null,
          rider_id: assignment?.rider_id ?? null,
          rider_name: assignment?.rider_name ?? null,
          rider_mobile: assignment?.rider_mobile ?? null,
          delivered_at: assignment?.delivered_at ?? null,
        });
      }

      const localityCodes = [...new Set(preliminaryRows.map(r => r.locality_id).filter(Boolean))] as string[];
      const activeLocalityMap = new Map<string, string>();
      if (localityCodes.length > 0) {
        const { data: localities, error: locErr } = await supabase
          .from('localities')
          .select('unique_code, locality_name, status')
          .in('unique_code', localityCodes);
        if (locErr) throw new Error(locErr.message);
        for (const l of (localities ?? []) as any[]) {
          if (l.status === 'active') {
            activeLocalityMap.set(l.unique_code, l.locality_name);
          }
        }
      }

      const rows: DeliveryRow[] = [];
      for (const row of preliminaryRows) {
        if (!row.locality_id) continue;
        const locName = activeLocalityMap.get(row.locality_id);
        if (!locName) continue;
        row.locality_name = locName;
        rows.push(row);
      }

      setDeliveries(rows);
      setRiders((ridersRes.data ?? []) as Rider[]);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load deliveries');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  usePageVisibility(load);

  const localityGroups: LocalityGroup[] = useMemo(() => {
    const byLocality = new Map<string, DeliveryRow[]>();
    for (const row of deliveries) {
      if (!row.locality_id) continue;
      const arr = byLocality.get(row.locality_id) ?? [];
      arr.push(row);
      byLocality.set(row.locality_id, arr);
    }

    const groups: LocalityGroup[] = [];
    for (const [locKey, locRows] of byLocality.entries()) {
      const byApartment = new Map<string, DeliveryRow[]>();
      for (const row of locRows) {
        const aptKey = row.apartment_id != null
          ? `${row.apartment_id}`
          : row.apartment_name ?? NO_APARTMENT;
        const arr = byApartment.get(aptKey) ?? [];
        arr.push(row);
        byApartment.set(aptKey, arr);
      }

      const apartments: ApartmentGroup[] = [];
      for (const [aptKey, aptRows] of byApartment.entries()) {
        const assigned = aptRows.filter(r => r.assignment_id && r.assignment_status !== 'reassigned' && r.assignment_status !== 'delivered');
        const delivered = aptRows.filter(r => r.assignment_status === 'delivered');
        apartments.push({
          apartment_id: aptKey,
          apartment_name: aptRows[0]?.apartment_name ?? (aptKey === NO_APARTMENT ? 'Other / No Apartment' : 'Unknown'),
          deliveries: aptRows,
          assignedCount: assigned.length,
          unassignedCount: aptRows.length - assigned.length - delivered.length,
          deliveredCount: delivered.length,
        });
      }
      apartments.sort((a, b) => a.apartment_name.localeCompare(b.apartment_name));

      groups.push({
        locality_id: locKey,
        locality_name: locRows[0]?.locality_name ?? 'Unknown',
        apartments,
        totalDeliveries: locRows.length,
        totalAssigned: locRows.filter(r => r.assignment_id && r.assignment_status !== 'reassigned' && r.assignment_status !== 'delivered').length,
        totalUnassigned: locRows.filter(r => !r.assignment_id || r.assignment_status === 'reassigned').length,
        totalDelivered: locRows.filter(r => r.assignment_status === 'delivered').length,
      });
    }
    groups.sort((a, b) => a.locality_name.localeCompare(b.locality_name));
    return groups;
  }, [deliveries]);

  const selectedLocality = useMemo(
    () => localityGroups.find(g => g.locality_id === selectedLocalityId) ?? null,
    [localityGroups, selectedLocalityId],
  );

  const summary = useMemo(() => {
    const total = deliveries.length;
    const assigned = deliveries.filter(r => r.assignment_id && r.assignment_status !== 'reassigned' && r.assignment_status !== 'delivered').length;
    const delivered = deliveries.filter(r => r.assignment_status === 'delivered').length;
    const unassigned = total - assigned - delivered;
    return { total, assigned, unassigned, delivered };
  }, [deliveries]);

  const toggleApartment = (aptId: string) => {
    setSelectedApartments(prev => {
      const next = new Set(prev);
      if (next.has(aptId)) next.delete(aptId);
      else next.add(aptId);
      return next;
    });
  };

  const toggleAllApartments = () => {
    if (!selectedLocality) return;
    const aptIds = selectedLocality.apartments.map(a => a.apartment_id);
    const allSelected = aptIds.every(id => selectedApartments.has(id));
    setSelectedApartments(prev => {
      const next = new Set(prev);
      if (allSelected) {
        aptIds.forEach(id => next.delete(id));
      } else {
        aptIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const isAllApartmentsSelected = () => {
    if (!selectedLocality || selectedLocality.apartments.length === 0) return false;
    return selectedLocality.apartments.every(a => selectedApartments.has(a.apartment_id));
  };

  const selectedDeliveryCount = useMemo(() => {
    if (!selectedLocality) return 0;
    let count = 0;
    for (const apt of selectedLocality.apartments) {
      if (selectedApartments.has(apt.apartment_id)) {
        count += apt.deliveries.length;
      }
    }
    return count;
  }, [selectedApartments, selectedLocality]);

  const doAssign = async () => {
    if (!selectedRider || selectedApartments.size === 0 || !selectedLocality) return;
    setAssigning(true);
    setError(null);

    try {
      const orderIds: string[] = [];
      for (const apt of selectedLocality.apartments) {
        if (selectedApartments.has(apt.apartment_id)) {
          for (const d of apt.deliveries) {
            orderIds.push(d.order_id);
          }
        }
      }

      if (orderIds.length === 0) {
        setAssigning(false);
        return;
      }

      let assigned = 0;
      let reassigned = 0;
      let failed = 0;

      for (const orderId of orderIds) {
        const existing = deliveries.find(d => d.order_id === orderId);
        const hasActiveAssignment = existing?.assignment_id && existing.assignment_status !== 'reassigned';

        if (hasActiveAssignment && existing?.assignment_id) {
          const { error: reassignErr } = await supabase
            .from('rider_order_assignments')
            .update({ status: 'reassigned', is_reassigned: true, updated_at: new Date().toISOString() })
            .eq('id', existing.assignment_id);

          if (reassignErr) { failed++; continue; }
          reassigned++;
        }

        const { error: insertErr } = await supabase
          .from('rider_order_assignments')
          .insert({
            rider_id: selectedRider.id,
            order_id: orderId,
            assigned_by: adminProfile?.id,
            status: 'assigned',
            delivery_fee: 0,
            notes: hasActiveAssignment ? `Reassigned from ${existing?.rider_name ?? 'previous rider'}` : 'Bulk assigned',
          });

        if (insertErr) { failed++; continue; }

        await supabase.from('orders').update({ status: 'out_for_delivery' }).eq('id', orderId);
        assigned++;
      }

      setAssignResult({ assigned, reassigned, failed });
      setShowResult(true);
      setSelectedApartments(new Set());
      setSelectedRider(null);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Assignment failed');
    } finally {
      setAssigning(false);
    }
  };

  const filteredRiders = riders.filter(r => {
    if (!riderSearch.trim()) return true;
    const q = riderSearch.toLowerCase();
    return r.full_name.toLowerCase().includes(q) || r.mobile.includes(q);
  });

  const dateInputValue = selectedDate
    ? format(parseISO(selectedDate), 'dd MMM yyyy')
    : 'Select date';

  return (
    <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top }]}>
      <View style={[s.header, isWeb && s.headerWeb]}>
        {!isWeb && (
          <TouchableOpacity style={s.backBtn}>
            <Calendar size={20} color={Colors.textPrimary} strokeWidth={1.8} />
          </TouchableOpacity>
        )}
        <View style={s.headerLeft}>
          <View style={s.headerIcon}>
            <Bike size={isWeb ? 20 : 18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>Assigned Riders</Text>
            <Text style={s.subtitle}>Date-wise rider assignment by locality & apartment</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, isWeb && s.contentWeb]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Date Selector */}
        <View style={s.dateSection}>
          <Text style={s.dateLabel}>Delivery Date</Text>
          <TouchableOpacity
            style={[s.dateField, showDatePicker && s.dateFieldOpen]}
            onPress={() => setShowDatePicker(!showDatePicker)}
            activeOpacity={0.7}
          >
            <Calendar size={16} color={Colors.primary} />
            <Text style={s.dateText}>{dateInputValue}</Text>
            <ChevronDown size={16} color={Colors.textTertiary} style={{ transform: [{ rotate: showDatePicker ? '180deg' : '0deg' }] }} />
          </TouchableOpacity>
          {showDatePicker && (
            <ScrollView style={s.datePickerScroll} showsVerticalScrollIndicator={false}>
              <View style={s.datePickerGrid}>
                {generateDateRange(30).map((d) => {
                  const dateStr = format(d, 'yyyy-MM-dd');
                  const isSelected = dateStr === selectedDate;
                  const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');
                  return (
                    <TouchableOpacity
                      key={dateStr}
                      style={[s.dateCell, isSelected && s.dateCellSelected, isToday && !isSelected && s.dateCellToday]}
                      onPress={() => { setSelectedDate(dateStr); setShowDatePicker(false); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.dateCellDay, isSelected && s.dateCellDaySelected, isToday && !isSelected && s.dateCellDayToday]}>
                        {format(d, 'dd')}
                      </Text>
                      <Text style={[s.dateCellMon, isSelected && s.dateCellMonSelected, isToday && !isSelected && s.dateCellMonToday]}>
                        {format(d, 'MMM')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </View>

        {error && (
          <View style={s.errorBanner}>
            <AlertCircle size={16} color={Colors.error} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {loading ? (
          <View style={s.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
        ) : deliveries.length === 0 ? (
          <View style={s.emptyState}>
            <View style={s.emptyIcon}>
              <Truck size={28} color={Colors.textDisabled} strokeWidth={1.4} />
            </View>
            <Text style={s.emptyTitle}>No deliveries for {format(parseISO(selectedDate), 'dd MMM yyyy')}</Text>
            <Text style={s.emptySub}>Select a different date or generate orders for this date.</Text>
          </View>
        ) : (
          <>
            {/* Summary Cards */}
            <View style={s.summaryRow}>
              <View style={[s.summaryCard, { borderLeftColor: Colors.primary }]}>
                <Text style={s.summaryValue}>{summary.total}</Text>
                <Text style={s.summaryLabel}>Total</Text>
              </View>
              <View style={[s.summaryCard, { borderLeftColor: Colors.accent }]}>
                <Text style={s.summaryValue}>{summary.assigned}</Text>
                <Text style={s.summaryLabel}>Assigned</Text>
              </View>
              <View style={[s.summaryCard, { borderLeftColor: Colors.warning }]}>
                <Text style={s.summaryValue}>{summary.unassigned}</Text>
                <Text style={s.summaryLabel}>Unassigned</Text>
              </View>
              <View style={[s.summaryCard, { borderLeftColor: Colors.success }]}>
                <Text style={s.summaryValue}>{summary.delivered}</Text>
                <Text style={s.summaryLabel}>Delivered</Text>
              </View>
            </View>

            {/* Locality Dropdown */}
            <View style={s.localitySection}>
              <Text style={s.sectionLabel}>Select Locality</Text>
              <TouchableOpacity
                style={[s.localityField, showLocalityDropdown && s.localityFieldOpen]}
                onPress={() => setShowLocalityDropdown(!showLocalityDropdown)}
                activeOpacity={0.7}
              >
                {selectedLocality ? (
                  <View style={s.localitySelectedRow}>
                    <View style={s.localityOptionIcon}>
                      <MapPin size={16} color={Colors.primary} />
                    </View>
                    <View style={s.localitySelectedInfo}>
                      <Text style={s.localitySelectedName}>{selectedLocality.locality_name}</Text>
                      <Text style={s.localitySelectedMeta}>
                        {selectedLocality.totalDeliveries} deliveries · {selectedLocality.apartments.length} apartments
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={s.localityPlaceholderRow}>
                    <MapPin size={16} color={Colors.textTertiary} />
                    <Text style={s.localityPlaceholder}>Choose a locality...</Text>
                  </View>
                )}
                <ChevronDown size={16} color={Colors.textTertiary} style={{ transform: [{ rotate: showLocalityDropdown ? '180deg' : '0deg' }] }} />
              </TouchableOpacity>

              {showLocalityDropdown && (
                <View style={s.localityDropdown}>
                  <ScrollView style={s.localityList} showsVerticalScrollIndicator={false}>
                    {localityGroups.map((loc) => (
                      <TouchableOpacity
                        key={loc.locality_id}
                        style={[s.localityOption, selectedLocalityId === loc.locality_id && s.localityOptionSelected]}
                        onPress={() => {
                          setSelectedLocalityId(loc.locality_id);
                          setShowLocalityDropdown(false);
                          setSelectedApartments(new Set());
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={s.localityOptionIcon}>
                          <MapPin size={14} color={Colors.primary} />
                        </View>
                        <View style={s.localityOptionInfo}>
                          <Text style={s.localityOptionName}>{loc.locality_name}</Text>
                          <Text style={s.localityOptionMeta}>
                            {loc.totalDeliveries} deliveries · {loc.apartments.length} apartments
                            {loc.totalUnassigned > 0 ? ` · ${loc.totalUnassigned} unassigned` : ''}
                          </Text>
                        </View>
                        {selectedLocalityId === loc.locality_id && <Check size={16} color={Colors.primary} />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Apartment Checkboxes (only for selected locality) */}
            {selectedLocality && (
              <View style={s.aptSection}>
                <View style={s.aptSectionHeader}>
                  <Text style={s.sectionLabel}>Apartments in {selectedLocality.locality_name}</Text>
                  <TouchableOpacity
                    style={s.selectAllBtn}
                    onPress={toggleAllApartments}
                    activeOpacity={0.7}
                  >
                    {isAllApartmentsSelected() ? (
                      <CheckSquare size={18} color={Colors.primary} />
                    ) : (
                      <Square size={18} color={Colors.neutral[400]} />
                    )}
                    <Text style={s.selectAllText}>
                      {isAllApartmentsSelected() ? 'Deselect All' : 'Select All'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={s.aptCard}>
                  {selectedLocality.apartments.map((apt, idx) => {
                    const isSelected = selectedApartments.has(apt.apartment_id);
                    const isLast = idx === selectedLocality.apartments.length - 1;
                    return (
                      <View key={apt.apartment_id} style={[s.aptRow, !isLast && s.aptRowBorder]}>
                        <TouchableOpacity
                          style={s.aptSelectBtn}
                          onPress={() => toggleApartment(apt.apartment_id)}
                          activeOpacity={0.7}
                        >
                          {isSelected ? <CheckSquare size={20} color={Colors.primary} /> : <Square size={20} color={Colors.neutral[400]} />}
                        </TouchableOpacity>
                        <View style={s.aptInfo}>
                          <View style={s.aptNameRow}>
                            <Building2 size={14} color={Colors.textTertiary} />
                            <Text style={s.aptName} numberOfLines={1}>{apt.apartment_name}</Text>
                          </View>
                          <Text style={s.aptMeta}>
                            {apt.deliveries.length} deliveries · {apt.assignedCount} assigned · {apt.unassignedCount} unassigned
                            {apt.deliveredCount > 0 ? ` · ${apt.deliveredCount} delivered` : ''}
                          </Text>
                        </View>

                        {apt.assignedCount > 0 && apt.deliveries.slice(0, 1).map((d) => (
                          d.rider_name ? (
                            <View style={s.aptRiderBadge} key={d.order_id}>
                              <View style={s.aptRiderAvatar}>
                                <Text style={s.aptRiderAvatarText}>{d.rider_name[0]?.toUpperCase()}</Text>
                              </View>
                              <Text style={s.aptRiderName} numberOfLines={1}>{d.rider_name}</Text>
                            </View>
                          ) : null
                        ))}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Rider Selector */}
            <View style={s.riderSection}>
              <Text style={s.sectionLabel}>Select Rider</Text>
              <TouchableOpacity
                style={s.riderField}
                onPress={() => setShowRiderPicker(!showRiderPicker)}
                activeOpacity={0.7}
              >
                {selectedRider ? (
                  <View style={s.riderSelectedRow}>
                    <View style={s.riderAvatar}>
                      <Text style={s.riderAvatarText}>{selectedRider.full_name[0]?.toUpperCase()}</Text>
                    </View>
                    <View>
                      <Text style={s.riderNameText}>{selectedRider.full_name}</Text>
                      <Text style={s.riderMobileText}>{selectedRider.mobile}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={s.riderPlaceholderRow}>
                    <User size={16} color={Colors.textTertiary} />
                    <Text style={s.riderPlaceholder}>Choose a rider to assign...</Text>
                  </View>
                )}
                <ChevronDown size={16} color={Colors.textTertiary} style={{ transform: [{ rotate: showRiderPicker ? '180deg' : '0deg' }] }} />
              </TouchableOpacity>

              {showRiderPicker && (
                <View style={s.riderDropdown}>
                  <View style={s.riderSearchBox}>
                    <User size={14} color={Colors.textTertiary} />
                    <TextInput
                      style={s.riderSearchInput}
                      value={riderSearch}
                      onChangeText={setRiderSearch}
                      placeholder="Search rider by name or mobile..."
                      placeholderTextColor={Colors.textDisabled}
                    />
                  </View>
                  <ScrollView style={s.riderList} showsVerticalScrollIndicator={false}>
                    {filteredRiders.map((r) => (
                      <TouchableOpacity
                        key={r.id}
                        style={[s.riderOption, selectedRider?.id === r.id && s.riderOptionSelected]}
                        onPress={() => { setSelectedRider(r); setShowRiderPicker(false); setRiderSearch(''); }}
                        activeOpacity={0.7}
                      >
                        <View style={s.riderOptionAvatar}>
                          <Text style={s.riderOptionAvatarText}>{r.full_name[0]?.toUpperCase()}</Text>
                        </View>
                        <View style={s.riderOptionInfo}>
                          <Text style={s.riderOptionName}>{r.full_name}</Text>
                          <Text style={s.riderOptionMobile}>{r.mobile}</Text>
                        </View>
                        {selectedRider?.id === r.id && <Check size={16} color={Colors.primary} />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Sticky Action Bar */}
      {!loading && deliveries.length > 0 && (
        <View style={[s.actionBar, { paddingBottom: isWeb ? Spacing[3] : insets.bottom + Spacing[2] }]}>
          <View style={s.actionBarInfo}>
            <Text style={s.actionBarCount}>{selectedDeliveryCount}</Text>
            <Text style={s.actionBarLabel}>deliveries selected</Text>
          </View>
          <TouchableOpacity
            style={[s.assignBtn, (!selectedRider || selectedApartments.size === 0 || assigning) && s.assignBtnDisabled]}
            onPress={doAssign}
            disabled={!selectedRider || selectedApartments.size === 0 || assigning}
            activeOpacity={0.8}
          >
            {assigning ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <>
                <Bike size={16} color={Colors.white} strokeWidth={2} />
                <Text style={s.assignBtnText}>Assign Rider</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Result Modal */}
      <Modal visible={showResult} transparent animationType="fade" onRequestClose={() => setShowResult(false)}>
        <View style={s.modalOverlay}>
          <View style={s.resultCard}>
            <View style={s.resultIconWrap}>
              <CheckCircle size={36} color={Colors.success} />
            </View>
            <Text style={s.resultTitle}>Assignment Complete</Text>
            <View style={s.resultStats}>
              <View style={s.resultStat}>
                <Text style={s.resultStatValue}>{assignResult?.assigned ?? 0}</Text>
                <Text style={s.resultStatLabel}>Assigned</Text>
              </View>
              {assignResult && assignResult.reassigned > 0 && (
                <View style={s.resultStat}>
                  <Text style={s.resultStatValue}>{assignResult.reassigned}</Text>
                  <Text style={s.resultStatLabel}>Reassigned</Text>
                </View>
              )}
              {assignResult && assignResult.failed > 0 && (
                <View style={s.resultStat}>
                  <Text style={[s.resultStatValue, { color: Colors.error }]}>{assignResult.failed}</Text>
                  <Text style={s.resultStatLabel}>Failed</Text>
                </View>
              )}
            </View>
            <TouchableOpacity style={s.resultBtn} onPress={() => setShowResult(false)} activeOpacity={0.8}>
              <Text style={s.resultBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function generateDateRange(days: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result: Date[] = [];
  for (let i = 1; i <= days; i++) {
    result.push(addDays(today, i));
  }
  return result;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerWeb: { paddingHorizontal: Spacing[6], paddingVertical: Spacing[5] },
  backBtn: { padding: Spacing[1] },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], flex: 1 },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
  },
  titleWeb: { fontSize: Typography.size.xl },
  subtitle: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  scroll: { flex: 1 },
  content: { padding: Spacing[4], gap: Spacing[4], paddingBottom: 100 },
  contentWeb: { padding: Spacing[6], maxWidth: 900, alignSelf: 'center', width: '100%' },

  // Date selector
  dateSection: { gap: Spacing[2] },
  dateLabel: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    backgroundColor: Colors.white,
  },
  dateFieldOpen: { borderColor: Colors.primary },
  dateText: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  datePickerScroll: { maxHeight: 240, marginTop: Spacing[2] },
  datePickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  dateCell: {
    width: 52,
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dateCellSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dateCellToday: { borderColor: Colors.primary, borderWidth: 1.5 },
  dateCellDay: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  dateCellDaySelected: { color: Colors.white },
  dateCellDayToday: { color: Colors.primary },
  dateCellMon: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  dateCellMonSelected: { color: Colors.white },
  dateCellMonToday: { color: Colors.primary },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.errorSurface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
  },
  errorText: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.error,
  },

  // Loading / empty
  center: { paddingVertical: Spacing[10], alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: Spacing[10], gap: Spacing[3] },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
  },
  emptySub: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
  },

  // Summary
  summaryRow: { flexDirection: 'row', gap: Spacing[2] },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    borderLeftWidth: 3,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    ...Shadow.sm,
  },
  summaryValue: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xl,
    color: Colors.textPrimary,
  },
  summaryLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },

  // Locality dropdown
  localitySection: { gap: Spacing[2] },
  localityField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    backgroundColor: Colors.white,
  },
  localityFieldOpen: { borderColor: Colors.primary },
  localitySelectedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], flex: 1 },
  localitySelectedInfo: { flex: 1 },
  localitySelectedName: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  localitySelectedMeta: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  localityPlaceholderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flex: 1 },
  localityPlaceholder: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textTertiary,
  },
  localityDropdown: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.md,
  },
  localityList: { maxHeight: 280 },
  localityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  localityOptionSelected: { backgroundColor: Colors.primarySurface },
  localityOptionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  localityOptionInfo: { flex: 1 },
  localityOptionName: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  localityOptionMeta: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginTop: 1,
  },

  // Apartment section
  aptSection: { gap: Spacing[2] },
  aptSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
    paddingVertical: Spacing[1],
    paddingHorizontal: Spacing[2],
  },
  selectAllText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.primary,
  },
  aptCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  aptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
  },
  aptRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  aptSelectBtn: { padding: Spacing[1] },
  aptInfo: { flex: 1 },
  aptNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  aptName: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  aptMeta: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  aptRiderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
    backgroundColor: Colors.primarySurface,
    paddingHorizontal: Spacing[2],
    paddingVertical: Spacing[1],
    borderRadius: Radius.sm,
  },
  aptRiderAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aptRiderAvatarText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 10,
    color: Colors.white,
  },
  aptRiderName: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.primary,
  },

  // Rider selector
  riderSection: { gap: Spacing[2] },
  sectionLabel: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  riderField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    backgroundColor: Colors.white,
  },
  riderSelectedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], flex: 1 },
  riderAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderAvatarText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.primary,
  },
  riderNameText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  riderMobileText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  riderPlaceholderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flex: 1 },
  riderPlaceholder: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textTertiary,
  },
  riderDropdown: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.md,
  },
  riderSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  riderSearchInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    paddingVertical: Spacing[1],
  },
  riderList: { maxHeight: 240 },
  riderOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
  },
  riderOptionSelected: { backgroundColor: Colors.primarySurface },
  riderOptionAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderOptionAvatarText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  riderOptionInfo: { flex: 1 },
  riderOptionName: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  riderOptionMobile: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },

  // Action bar
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[3],
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    ...Shadow.lg,
  },
  actionBarInfo: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing[2] },
  actionBarCount: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xl,
    color: Colors.primary,
  },
  actionBarLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[3],
    borderRadius: Radius.md,
  },
  assignBtnDisabled: { backgroundColor: Colors.neutral[300] },
  assignBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.white,
  },

  // Result modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing[5],
  },
  resultCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[6],
    alignItems: 'center',
    gap: Spacing[4],
    width: '100%',
    maxWidth: 360,
  },
  resultIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.successSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
  },
  resultStats: { flexDirection: 'row', gap: Spacing[4] },
  resultStat: { alignItems: 'center' },
  resultStatValue: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size['2xl'],
    color: Colors.success,
  },
  resultStatLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  resultBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing[6],
    paddingVertical: Spacing[3],
    borderRadius: Radius.md,
  },
  resultBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.white,
  },
});
