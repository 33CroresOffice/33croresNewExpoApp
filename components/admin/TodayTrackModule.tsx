import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, ScrollView, TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { Calendar, Users, Bike, Leaf, ChevronRight, X, Search } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';

interface FlowerReqRow {
  flower_type_id: string;
  total_quantity: number;
  unit_type: string | null;
  display_name: string;
}

interface RiderBreakdownRow {
  rider_id: string;
  rider_name: string;
  rider_mobile: string;
  assigned_count: number;
  delivered_count: number;
}

function toISODate(d: Date): string {
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().split('T')[0];
}

export default function TodayTrackModule() {
  const [fromDate, setFromDate] = useState(new Date());
  const [toDate, setToDate] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const [activeCustomers, setActiveCustomers] = useState(0);
  const [presentRiders, setPresentRiders] = useState(0);
  const [totalFlowerReq, setTotalFlowerReq] = useState(0);

  const [flowerRows, setFlowerRows] = useState<FlowerReqRow[]>([]);
  const [riderRows, setRiderRows] = useState<RiderBreakdownRow[]>([]);

  const [showFlowerModal, setShowFlowerModal] = useState(false);
  const [showRiderModal, setShowRiderModal] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  const [flowerSearch, setFlowerSearch] = useState('');
  const [riderSearch, setRiderSearch] = useState('');

  const fromStr = toISODate(fromDate);
  const toStr = toISODate(toDate);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subscriptionsRes, attendanceRes, reqRes] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('user_id')
          .eq('status', 'active')
          .or(`start_date.is.null,start_date.lte.${toStr}`)
          .or(`new_end_date.gte.${fromStr},and(new_end_date.is.null,or(end_date.is.null,end_date.gte.${fromStr}))`)
          .or(`pause_until.is.null,pause_until.lt.${fromStr}`),
        supabase
          .from('rider_attendance')
          .select('rider_id', { count: 'exact', head: true })
          .eq('status', 'present')
          .gte('date', fromStr)
          .lte('date', toStr),
        supabase
          .from('daily_requirements')
          .select('total_quantity, unit_type, flower_type_id, flower_type:flower_types(display_name)')
          .gte('requirement_date', fromStr)
          .lte('requirement_date', toStr),
      ]);

      const activeCustomerIds = new Set((subscriptionsRes.data ?? []).map((row: { user_id: string }) => row.user_id));
      setActiveCustomers(activeCustomerIds.size);
      setPresentRiders(attendanceRes.count ?? 0);

      const reqData = (reqRes.data ?? []) as any[];
      let totalQty = 0;
      const rows: FlowerReqRow[] = reqData.map((r) => {
        totalQty += Number(r.total_quantity ?? 0);
        return {
          flower_type_id: r.flower_type_id,
          total_quantity: Number(r.total_quantity ?? 0),
          unit_type: r.unit_type,
          display_name: r.flower_type?.display_name ?? 'Unknown',
        };
      });
      const merged: FlowerReqRow[] = [];
      for (const row of rows) {
        const existing = merged.find(m => m.flower_type_id === row.flower_type_id);
        if (existing) {
          existing.total_quantity += row.total_quantity;
        } else {
          merged.push({ ...row });
        }
      }
      merged.sort((a, b) => b.total_quantity - a.total_quantity);
      setFlowerRows(merged);
      setTotalFlowerReq(totalQty);
    } catch (e) {
      console.error('TodayTrack load error', e);
    } finally {
      setLoading(false);
    }
  }, [fromStr, toStr]);

  useEffect(() => { load(); }, [load]);

  const loadRiderBreakdown = useCallback(async () => {
    setModalLoading(true);
    try {
      const [assignedRes, deliveredRes, ridersRes] = await Promise.all([
        supabase
          .from('rider_order_assignments')
          .select('rider_id, status')
          .gte('assigned_at', `${fromStr}T00:00:00.000Z`)
          .lte('assigned_at', `${toStr}T23:59:59.999Z`)
          .in('status', ['assigned', 'accepted', 'picked_up', 'delivered']),
        supabase
          .from('rider_order_assignments')
          .select('rider_id')
          .eq('status', 'delivered')
          .gte('delivered_at', `${fromStr}T00:00:00.000Z`)
          .lte('delivered_at', `${toStr}T23:59:59.999Z`),
        supabase.from('riders').select('id, full_name, mobile').order('full_name'),
      ]);

      const riderMap = new Map<string, { name: string; mobile: string }>();
      for (const r of (ridersRes.data ?? []) as any[]) {
        riderMap.set(r.id, { name: r.full_name ?? 'Unknown', mobile: r.mobile ?? '' });
      }

      const assignedCounts = new Map<string, number>();
      for (const a of (assignedRes.data ?? []) as any[]) {
        assignedCounts.set(a.rider_id, (assignedCounts.get(a.rider_id) ?? 0) + 1);
      }
      const deliveredCounts = new Map<string, number>();
      for (const d of (deliveredRes.data ?? []) as any[]) {
        deliveredCounts.set(d.rider_id, (deliveredCounts.get(d.rider_id) ?? 0) + 1);
      }

      const allRiderIds = new Set([...assignedCounts.keys(), ...deliveredCounts.keys()]);
      const rows: RiderBreakdownRow[] = [];
      for (const riderId of allRiderIds) {
        const info = riderMap.get(riderId);
        rows.push({
          rider_id: riderId,
          rider_name: info?.name ?? 'Unknown',
          rider_mobile: info?.mobile ?? '',
          assigned_count: assignedCounts.get(riderId) ?? 0,
          delivered_count: deliveredCounts.get(riderId) ?? 0,
        });
      }
      rows.sort((a, b) => (b.assigned_count + b.delivered_count) - (a.assigned_count + a.delivered_count));
      setRiderRows(rows);
    } catch (e) {
      console.error('Rider breakdown error', e);
    } finally {
      setModalLoading(false);
    }
  }, [fromStr, toStr]);

  const openRiderModal = () => {
    setShowRiderModal(true);
    loadRiderBreakdown();
  };

  const filteredFlowers = flowerRows.filter(f =>
    f.display_name.toLowerCase().includes(flowerSearch.trim().toLowerCase())
  );
  const filteredRiders = riderRows.filter(r =>
    r.rider_name.toLowerCase().includes(riderSearch.trim().toLowerCase()) ||
    r.rider_mobile.includes(riderSearch.trim())
  );

  const shiftDate = (d: Date, days: number): Date => {
    const n = new Date(d);
    n.setDate(n.getDate() + days);
    return n;
  };

  const DateField = ({ label, value, onChange }: { label: string; value: Date; onChange: (d: Date) => void }) => (
    <View style={tStyles.dateFieldWrap}>
      <Text style={tStyles.dateFieldLabel}>{label}</Text>
      <View style={tStyles.dateFieldRow}>
        <TouchableOpacity onPress={() => onChange(shiftDate(value, -1))} style={tStyles.dateArrow} activeOpacity={0.7}>
          <Text style={tStyles.dateArrowText}>{"<"}</Text>
        </TouchableOpacity>
        <Text style={tStyles.dateFieldValue}>{format(value, 'dd MMM yyyy')}</Text>
        <TouchableOpacity onPress={() => onChange(shiftDate(value, 1))} style={tStyles.dateArrow} activeOpacity={0.7}>
          <Text style={tStyles.dateArrowText}>{">"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={tStyles.container}>
      <View style={tStyles.header}>
        <View style={tStyles.headerLeft}>
          <View style={tStyles.headerIcon}>
            <Calendar size={18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <Text style={tStyles.headerTitle}>Today&apos;s Track</Text>
        </View>
        <View style={tStyles.dateRow}>
          <DateField label="From" value={fromDate} onChange={setFromDate} />
          <DateField label="To" value={toDate} onChange={setToDate} />
        </View>
      </View>

      <View style={tStyles.cardsRow}>
        {/* Active Customers */}
        <TouchableOpacity
          style={tStyles.trackCard}
          onPress={() => router.push('/(admin)/orders' as any)}
          activeOpacity={0.82}
        >
          <View style={[tStyles.cardIconWrap, { backgroundColor: '#E0F2FE' }]}>
            <Users size={18} color="#0369A1" strokeWidth={1.8} />
          </View>
          <Text style={[tStyles.cardValue, { color: '#0369A1' }]}>
            {loading ? '—' : activeCustomers.toString()}
          </Text>
          <Text style={tStyles.cardLabel}>Active Customers</Text>
          <View style={tStyles.cardFooter}>
            <Text style={tStyles.cardFooterText}>Open orders</Text>
            <ChevronRight size={12} color="#0369A1" />
          </View>
        </TouchableOpacity>

        {/* Present Riders */}
        <TouchableOpacity
          style={tStyles.trackCard}
          onPress={openRiderModal}
          activeOpacity={0.82}
        >
          <View style={[tStyles.cardIconWrap, { backgroundColor: '#DCFCE7' }]}>
            <Bike size={18} color="#15803D" strokeWidth={1.8} />
          </View>
          <Text style={[tStyles.cardValue, { color: '#15803D' }]}>
            {loading ? '—' : presentRiders.toString()}
          </Text>
          <Text style={tStyles.cardLabel}>Present Riders</Text>
          <View style={tStyles.cardFooter}>
            <Text style={tStyles.cardFooterText}>View breakdown</Text>
            <ChevronRight size={12} color="#15803D" />
          </View>
        </TouchableOpacity>

        {/* Total Flower Requirement */}
        <View style={tStyles.trackCard}>
          <View style={[tStyles.cardIconWrap, { backgroundColor: '#FEF3C7' }]}>
            <Leaf size={18} color="#B45309" strokeWidth={1.8} />
          </View>
          <Text style={[tStyles.cardValue, { color: '#B45309' }]}>
            {loading ? '—' : totalFlowerReq.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </Text>
          <Text style={tStyles.cardLabel}>Flower Requirement</Text>
          <TouchableOpacity style={tStyles.viewDetailsBtn} onPress={() => setShowFlowerModal(true)} activeOpacity={0.7}>
            <Text style={tStyles.viewDetailsText}>View details</Text>
            <ChevronRight size={12} color="#B45309" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Flower Details Modal */}
      <Modal visible={showFlowerModal} transparent animationType="fade" onRequestClose={() => setShowFlowerModal(false)}>
        <View style={tStyles.overlay}>
          <View style={tStyles.modalSheet}>
            <View style={tStyles.modalHeader}>
              <View style={tStyles.modalHeaderLeft}>
                <Leaf size={18} color="#B45309" strokeWidth={1.8} />
                <Text style={tStyles.modalTitle}>Flower-wise Requirement</Text>
              </View>
              <TouchableOpacity onPress={() => setShowFlowerModal(false)} hitSlop={8}>
                <X size={20} color={Colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <View style={tStyles.modalDateRange}>
              <Text style={tStyles.modalDateText}>
                {format(fromDate, 'dd MMM')} — {format(toDate, 'dd MMM yyyy')}
              </Text>
            </View>

            <View style={tStyles.searchBox}>
              <Search size={15} color={Colors.textTertiary} strokeWidth={1.8} />
              <TextInput
                style={tStyles.searchInput}
                value={flowerSearch}
                onChangeText={setFlowerSearch}
                placeholder="Search flowers..."
                placeholderTextColor={Colors.textDisabled}
              />
              {flowerSearch ? (
                <TouchableOpacity onPress={() => setFlowerSearch('')} hitSlop={8}>
                  <X size={14} color={Colors.textTertiary} strokeWidth={2} />
                </TouchableOpacity>
              ) : null}
            </View>

            <ScrollView style={tStyles.modalBody} showsVerticalScrollIndicator={false}>
              {filteredFlowers.length === 0 ? (
                <View style={tStyles.emptyWrap}>
                  <Leaf size={32} color={Colors.textDisabled} strokeWidth={1.2} />
                  <Text style={tStyles.emptyText}>No flower requirements found</Text>
                </View>
              ) : (
                filteredFlowers.map((row, i) => (
                  <View key={row.flower_type_id} style={[tStyles.flowerRow, i % 2 === 1 && tStyles.flowerRowAlt]}>
                    <View style={tStyles.flowerDot}>
                      <Leaf size={12} color={Colors.primary} strokeWidth={2} />
                    </View>
                    <Text style={tStyles.flowerName}>{row.display_name}</Text>
                    <View style={tStyles.flowerQtyBadge}>
                      <Text style={tStyles.flowerQtyText}>
                        {row.total_quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {row.unit_type ?? ''}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={tStyles.modalFooter}>
              <View style={tStyles.modalTotalRow}>
                <Text style={tStyles.modalTotalLabel}>Total</Text>
                <Text style={tStyles.modalTotalValue}>
                  {totalFlowerReq.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </Text>
              </View>
              <TouchableOpacity style={tStyles.closeBtn} onPress={() => setShowFlowerModal(false)}>
                <Text style={tStyles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rider Breakdown Modal */}
      <Modal visible={showRiderModal} transparent animationType="fade" onRequestClose={() => setShowRiderModal(false)}>
        <View style={tStyles.overlay}>
          <View style={tStyles.modalSheet}>
            <View style={tStyles.modalHeader}>
              <View style={tStyles.modalHeaderLeft}>
                <Bike size={18} color="#15803D" strokeWidth={1.8} />
                <Text style={tStyles.modalTitle}>Rider-wise Breakdown</Text>
              </View>
              <TouchableOpacity onPress={() => setShowRiderModal(false)} hitSlop={8}>
                <X size={20} color={Colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <View style={tStyles.modalDateRange}>
              <Text style={tStyles.modalDateText}>
                {format(fromDate, 'dd MMM')} — {format(toDate, 'dd MMM yyyy')}
              </Text>
            </View>

            <View style={tStyles.searchBox}>
              <Search size={15} color={Colors.textTertiary} strokeWidth={1.8} />
              <TextInput
                style={tStyles.searchInput}
                value={riderSearch}
                onChangeText={setRiderSearch}
                placeholder="Search riders..."
                placeholderTextColor={Colors.textDisabled}
              />
              {riderSearch ? (
                <TouchableOpacity onPress={() => setRiderSearch('')} hitSlop={8}>
                  <X size={14} color={Colors.textTertiary} strokeWidth={2} />
                </TouchableOpacity>
              ) : null}
            </View>

            {modalLoading ? (
              <View style={tStyles.loadingWrap}><ActivityIndicator color={Colors.primary} /></View>
            ) : (
              <ScrollView style={tStyles.modalBody} showsVerticalScrollIndicator={false}>
                {filteredRiders.length === 0 ? (
                  <View style={tStyles.emptyWrap}>
                    <Bike size={32} color={Colors.textDisabled} strokeWidth={1.2} />
                    <Text style={tStyles.emptyText}>No rider assignments found</Text>
                  </View>
                ) : (
                  <>
                    <View style={tStyles.riderTableHeader}>
                      <Text style={[tStyles.riderTableHeadCell, { flex: 2 }]}>Rider</Text>
                      <Text style={[tStyles.riderTableHeadCell, { flex: 1, textAlign: 'center' }]}>Assigned</Text>
                      <Text style={[tStyles.riderTableHeadCell, { flex: 1, textAlign: 'center' }]}>Delivered</Text>
                    </View>
                    {filteredRiders.map((row, i) => (
                      <View key={row.rider_id} style={[tStyles.riderRow, i % 2 === 1 && tStyles.riderRowAlt]}>
                        <View style={{ flex: 2 }}>
                          <Text style={tStyles.riderName} numberOfLines={1}>{row.rider_name}</Text>
                          <Text style={tStyles.riderMobile} numberOfLines={1}>{row.rider_mobile}</Text>
                        </View>
                        <View style={[tStyles.riderCountCell, { flex: 1 }]}>
                          <View style={[tStyles.countBadge, { backgroundColor: '#E0F2FE' }]}>
                            <Text style={[tStyles.countText, { color: '#0369A1' }]}>{row.assigned_count}</Text>
                          </View>
                        </View>
                        <View style={[tStyles.riderCountCell, { flex: 1 }]}>
                          <View style={[tStyles.countBadge, { backgroundColor: '#DCFCE7' }]}>
                            <Text style={[tStyles.countText, { color: '#15803D' }]}>{row.delivered_count}</Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </>
                )}
              </ScrollView>
            )}

            <View style={tStyles.modalFooter}>
              <TouchableOpacity style={tStyles.closeBtn} onPress={() => setShowRiderModal(false)}>
                <Text style={tStyles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const tStyles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    ...Shadow.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
    flexWrap: 'wrap',
    gap: Spacing[3],
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  headerIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 14,
    color: '#64748B',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  dateRow: { flexDirection: 'row', gap: Spacing[4] },
  dateFieldWrap: { gap: 4 },
  dateFieldLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 10,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[2],
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dateArrow: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.neutral[100],
  },
  dateArrowText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  dateFieldValue: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    minWidth: 90,
    textAlign: 'center',
  },

  cardsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 14,
    gap: 12,
  },
  trackCard: {
    flex: 1,
    minWidth: 180,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  cardValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 26,
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  cardLabel: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  cardFooterText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: 10,
    color: '#94A3B8',
  },
  viewDetailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  viewDetailsText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 10,
    color: '#B45309',
  },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalSheet: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    width: '100%',
    maxWidth: 560,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  modalTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
  },
  modalDateRange: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  modalDateText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginHorizontal: 24,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    backgroundColor: Colors.neutral[50],
  },
  searchInput: {
    flex: 1,
    minHeight: 42,
    paddingVertical: 8,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  modalBody: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    maxHeight: 360,
  },
  loadingWrap: { paddingVertical: 40, alignItems: 'center' },
  emptyWrap: { alignItems: 'center', paddingVertical: 40, gap: Spacing[3] },
  emptyText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },

  flowerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  flowerRowAlt: { backgroundColor: Colors.neutral[50] },
  flowerDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center', justifyContent: 'center',
  },
  flowerName: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  flowerQtyBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  flowerQtyText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: '#B45309',
  },

  riderTableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.neutral[50],
    borderRadius: Radius.md,
    marginBottom: Spacing[1],
  },
  riderTableHeadCell: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 10,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    gap: Spacing[2],
  },
  riderRowAlt: { backgroundColor: Colors.neutral[50] },
  riderName: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  riderMobile: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  riderCountCell: { alignItems: 'center' },
  countBadge: {
    minWidth: 32, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center',
  },
  countText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
  },

  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing[3],
  },
  modalTotalRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  modalTotalLabel: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  modalTotalValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.lg,
    color: '#B45309',
  },
  closeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  closeBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
  },
});
