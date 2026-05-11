import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { SubscriptionStatus, OrderStatus } from '@/types/database';

type Status = SubscriptionStatus | OrderStatus | 'scheduled_pause';

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  active: { label: 'Active', bg: Colors.successSurface, text: Colors.success, dot: Colors.success },
  paused: { label: 'Paused', bg: Colors.warningSurface, text: Colors.warning, dot: Colors.warning },
  cancelled: { label: 'Cancelled', bg: Colors.neutral[100], text: Colors.neutral[600], dot: Colors.neutral[500] },
  expired: { label: 'Expired', bg: Colors.errorSurface, text: Colors.error, dot: Colors.error },
  renewed: { label: 'Renewed', bg: Colors.neutral[100], text: Colors.neutral[500], dot: Colors.neutral[400] },
  pending: { label: 'Pending', bg: Colors.warningSurface, text: Colors.warning, dot: Colors.warning },
  confirmed: { label: 'Confirmed', bg: Colors.primarySurface, text: Colors.primary, dot: Colors.primary },
  paid: { label: 'Paid', bg: Colors.successSurface, text: Colors.success, dot: Colors.success },
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
