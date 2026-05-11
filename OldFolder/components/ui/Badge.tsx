import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary' | 'secondary';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
  dot?: boolean;
}

export default function Badge({ label, variant = 'neutral', style, dot = false }: BadgeProps) {
  return (
    <View style={[styles.badge, styles[variant], style]}>
      {dot && <View style={[styles.dot, styles[`dot_${variant}`]]} />}
      <Text style={[styles.label, styles[`label_${variant}`]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
    borderRadius: Radius.full,
    gap: 4,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    letterSpacing: 0.3,
  },

  success: { backgroundColor: Colors.successSurface },
  warning: { backgroundColor: Colors.warningSurface },
  error: { backgroundColor: Colors.errorSurface },
  info: { backgroundColor: Colors.primarySurface },
  neutral: { backgroundColor: Colors.neutral[100] },
  primary: { backgroundColor: Colors.primarySurface },
  secondary: { backgroundColor: Colors.secondarySurface },

  label_success: { color: Colors.success },
  label_warning: { color: Colors.warning },
  label_error: { color: Colors.error },
  label_info: { color: Colors.primary },
  label_neutral: { color: Colors.neutral[600] },
  label_primary: { color: Colors.primaryDark },
  label_secondary: { color: Colors.secondaryDark },

  dot_success: { backgroundColor: Colors.success },
  dot_warning: { backgroundColor: Colors.warning },
  dot_error: { backgroundColor: Colors.error },
  dot_info: { backgroundColor: Colors.primary },
  dot_neutral: { backgroundColor: Colors.neutral[500] },
  dot_primary: { backgroundColor: Colors.primary },
  dot_secondary: { backgroundColor: Colors.secondary },
});
