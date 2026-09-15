import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { SubscriptionStatus, OrderStatus } from '@/types/database';

type Status = SubscriptionStatus | OrderStatus | 'scheduled_pause' | string;

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  active: { label: 'Active', bg: Colors.successSurface, text: Colors.success, dot: Colors.success },
  paused: { label: 'Paused', bg: Colors.warningSurface, text: Colors.warning, dot: Colors.warning },
  cancelled: { label: 'Cancelled', bg: Colors.neutral[100], text: Colors.neutral[600], dot: Colors.neutral[500] },
  expired: { label: 'Expired', bg: Colors.errorSurface, text: Colors.error, dot: Colors.error },
  renewed: { label: 'Renewed', bg: Colors.neutral[100], text: Colors.neutral[500], dot: Colors.neutral[400] },
  request_sent: { label: 'Request Sent', bg: Colors.warningSurface, text: Colors.warning, dot: Colors.warning },
  pandit_accepted: { label: 'Accepted', bg: Colors.primarySurface, text: Colors.primary, dot: Colors.primary },
  awaiting_advance_payment: { label: 'Awaiting Advance', bg: Colors.warningSurface, text: Colors.warning, dot: Colors.warning },
  booking_confirmed: { label: 'Confirmed', bg: Colors.successSurface, text: Colors.success, dot: Colors.success },
  pandit_on_the_way: { label: 'On The Way', bg: Colors.accentSurface, text: Colors.accentDark, dot: Colors.accent },
  pandit_arrived: { label: 'Arrived', bg: Colors.accentSurface, text: Colors.accentDark, dot: Colors.accent },
  pooja_in_progress: { label: 'In Progress', bg: Colors.primarySurface, text: Colors.primary, dot: Colors.primary },
  pooja_completed: { label: 'Pooja Done', bg: Colors.successSurface, text: Colors.success, dot: Colors.success },
  payment_completed: { label: 'Paid', bg: Colors.successSurface, text: Colors.success, dot: Colors.success },
  settled: { label: 'Settled', bg: Colors.neutral[100], text: Colors.neutral[600], dot: Colors.neutral[500] },
  pending: { label: 'Pending', bg: Colors.warningSurface, text: Colors.warning, dot: Colors.warning },
  accepted: { label: 'Awaiting advance', bg: Colors.warningSurface, text: Colors.warning, dot: Colors.warning },
  confirmed: { label: 'Confirmed', bg: Colors.primarySurface, text: Colors.primary, dot: Colors.primary },
  paid: { label: 'Paid', bg: Colors.successSurface, text: Colors.success, dot: Colors.success },
  completed: { label: 'Paid', bg: Colors.successSurface, text: Colors.success, dot: Colors.success },
  declined: { label: 'Declined', bg: Colors.errorSurface, text: Colors.error, dot: Colors.error },
  cancelled: { label: 'Cancelled', bg: Colors.neutral[100], text: Colors.neutral[600], dot: Colors.neutral[500] },
  scheduled: { label: 'Scheduled', bg: Colors.primarySurface, text: Colors.primary, dot: Colors.primary },
  scheduled_pause: { label: 'Pause Scheduled', bg: Colors.warningSurface, text: Colors.warning, dot: Colors.warning },
  out_for_delivery: { label: 'Out for Delivery', bg: Colors.accentSurface, text: Colors.accentDark, dot: Colors.accent },
  delivered: { label: 'Delivered', bg: Colors.successSurface, text: Colors.success, dot: Colors.success },
  failed: { label: 'Failed', bg: Colors.errorSurface, text: Colors.error, dot: Colors.error },
};

interface StatusChipProps {
  status: Status | string;
}

export default function StatusChip({ status }: StatusChipProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.scheduled;

  return (
    <View style={[styles.chip, { backgroundColor: config.bg }]}>
      <View style={[styles.dot, { backgroundColor: config.dot }]} />
      <Text style={[styles.label, { color: config.text }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[2],
    paddingVertical: 4,
    borderRadius: Radius.full,
    gap: 5,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 0.2,
  },
});
