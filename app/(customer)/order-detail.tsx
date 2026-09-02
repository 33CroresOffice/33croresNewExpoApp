import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, MapPin, Calendar, FileText, Leaf, User, Phone, Bike, CircleCheck as CheckCircle } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { Order } from '@/types/database';
import StepTracker from '@/components/ui/StepTracker';
import StatusChip from '@/components/ui/StatusChip';
import { format } from 'date-fns';

export default function OrderDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id, selectedDate } = useLocalSearchParams<{ id: string; selectedDate?: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('orders')
      .select('*, subscription:subscriptions(*, plan:subscription_plans(*), delivery_address:addresses(*))')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) setOrder(data as Order);
        setLoading(false);
      });
  }, [id]);

  const [assignment, setAssignment] = useState<{
    status: string;
    rider: { full_name: string; mobile: string } | null;
    delivered_at: string | null;
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('rider_order_assignments')
      .select('status, delivered_at, rider:riders!rider_order_assignments_rider_id_fkey(full_name, mobile)')
      .eq('order_id', id)
      .in('status', ['assigned', 'accepted', 'picked_up', 'delivered'])
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setAssignment(data[0] as any);
      });
  }, [id]);

  if (loading || !order) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Order Details</Text>
          <View style={{ width: 36 }} />
        </View>
      </View>
    );
  }

  const sub = order.subscription as any;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Order Details</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.statusCard}>
          <View style={styles.statusTop}>
            <View style={styles.statusInfo}>
              <Text style={styles.orderId}>Order #{order.id.slice(0, 8).toUpperCase()}</Text>
              <Text style={styles.orderDate}>{format(new Date(selectedDate ?? order.scheduled_date), 'EEEE, dd MMMM yyyy')}</Text>
            </View>
            <StatusChip status={order.status} />
          </View>

          <View style={styles.divider} />

          <StepTracker status={order.status} />

          {order.admin_note && (
            <View style={styles.adminNote}>
              <FileText size={14} color={Colors.textTertiary} />
              <Text style={styles.adminNoteText}>{order.admin_note}</Text>
            </View>
          )}
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Leaf size={18} color={Colors.primary} />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Plan</Text>
              <Text style={styles.infoValue}>{sub?.plan?.name}</Text>
            </View>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.subscriptionDates}>
            <View style={styles.dateBlock}>
              <Calendar size={14} color={Colors.textTertiary} />
              <Text style={styles.dateBlockLabel}>Subscription Start</Text>
              <Text style={styles.dateBlockValue}>
                {sub?.start_date ? format(new Date(sub.start_date), 'dd MMM yyyy') : '—'}
              </Text>
            </View>
            <View style={styles.dateSeparator} />
            <View style={styles.dateBlock}>
              <Calendar size={14} color={Colors.textTertiary} />
              <Text style={styles.dateBlockLabel}>Subscription End</Text>
              <Text style={styles.dateBlockValue}>
                {sub?.end_date ? format(new Date(sub.end_date), 'dd MMM yyyy') : '—'}
              </Text>
            </View>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoRow}>
            <MapPin size={18} color={Colors.accent} />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Delivery Address</Text>
              <Text style={styles.infoValue}>
                {sub?.delivery_address
                  ? `${sub.delivery_address.street}, ${sub.delivery_address.city}, ${sub.delivery_address.state} - ${sub.delivery_address.pincode}`
                  : 'Not available'}
              </Text>
            </View>
          </View>

          {order.delivered_at && (
            <>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Calendar size={18} color={Colors.success} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Delivered At</Text>
                  <Text style={styles.infoValue}>{format(new Date(order.delivered_at), 'dd MMM yyyy, hh:mm a')}</Text>
                </View>
              </View>
            </>
          )}
        </View>

        {assignment?.rider && (
          <View style={styles.infoCard}>
            <View style={styles.riderCardHeader}>
              <View style={styles.riderIconWrap}>
                <Bike size={18} color={Colors.primary} />
              </View>
              <Text style={styles.riderCardTitle}>Delivery Rider</Text>
            </View>
            <View style={styles.riderInfoRow}>
              <View style={styles.riderAvatar}>
                <Text style={styles.riderAvatarText}>{assignment.rider.full_name[0]?.toUpperCase()}</Text>
              </View>
              <View style={styles.riderDetails}>
                <View style={styles.riderDetailLine}>
                  <User size={12} color={Colors.textTertiary} />
                  <Text style={styles.riderDetailText}>{assignment.rider.full_name}</Text>
                </View>
                <View style={styles.riderDetailLine}>
                  <Phone size={12} color={Colors.textTertiary} />
                  <Text style={styles.riderDetailText}>{assignment.rider.mobile}</Text>
                </View>
                {assignment.delivered_at && (
                  <View style={styles.riderDetailLine}>
                    <CheckCircle size={12} color={Colors.success} />
                    <Text style={[styles.riderDetailText, { color: Colors.success }]}>
                      Delivered {format(new Date(assignment.delivered_at), 'dd MMM, hh:mm a')}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}
      </ScrollView>
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
  content: { padding: Spacing[5], gap: Spacing[4] },
  statusCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[5],
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing[4],
    ...Shadow.sm,
  },
  statusTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  statusInfo: { gap: 3 },
  orderId: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  orderDate: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  divider: { height: 1, backgroundColor: Colors.divider },
  adminNote: {
    flexDirection: 'row',
    gap: Spacing[2],
    backgroundColor: Colors.neutral[50],
    padding: Spacing[3],
    borderRadius: Radius.md,
  },
  adminNoteText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    flex: 1,
  },
  infoCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[5],
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing[4],
    ...Shadow.sm,
  },
  infoRow: { flexDirection: 'row', gap: Spacing[3], alignItems: 'flex-start' },
  infoContent: { flex: 1, gap: 3 },
  infoLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    lineHeight: Typography.size.sm * 1.5,
  },
  infoDivider: { height: 1, backgroundColor: Colors.divider },
  subscriptionDates: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    paddingVertical: Spacing[1],
  },
  dateBlockLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  dateBlockValue: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  dateSeparator: {
    width: 1,
    height: 40,
    backgroundColor: Colors.divider,
    marginHorizontal: Spacing[2],
  },
  riderCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginBottom: Spacing[3],
  },
  riderIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderCardTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  riderInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  riderAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderAvatarText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.lg,
    color: Colors.white,
  },
  riderDetails: {
    flex: 1,
    gap: 6,
  },
  riderDetailLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  riderDetailText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
});
