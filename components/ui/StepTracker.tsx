import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { Check } from 'lucide-react-native';
import { OrderStatus } from '@/types/database';

const STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'delivered', label: 'Delivered' },
];

const STATUS_INDEX: Record<OrderStatus, number> = {
  scheduled: 0,
  out_for_delivery: 1,
  delivered: 2,
  failed: -1,
};

interface StepTrackerProps {
  status: OrderStatus;
}

export default function StepTracker({ status }: StepTrackerProps) {
  const currentIndex = STATUS_INDEX[status];
  const isFailed = status === 'failed';

  return (
    <View style={styles.container}>
      {STEPS.map((step, index) => {
        const isCompleted = currentIndex > index;
        const isActive = currentIndex === index && !isFailed;
        const isFuture = currentIndex < index;

        return (
          <React.Fragment key={step.key}>
            <View style={styles.step}>
              <View
                style={[
                  styles.circle,
                  isCompleted && styles.circleCompleted,
                  isActive && styles.circleActive,
                  isFailed && styles.circleFailed,
                ]}
              >
                {isCompleted ? (
                  <Check size={12} color={Colors.white} strokeWidth={3} />
                ) : (
                  <View
                    style={[
                      styles.innerDot,
                      isActive && styles.innerDotActive,
                      isFuture && styles.innerDotFuture,
                    ]}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  isActive && styles.stepLabelActive,
                  isCompleted && styles.stepLabelCompleted,
                  isFuture && styles.stepLabelFuture,
                ]}
              >
                {step.label}
              </Text>
            </View>
            {index < STEPS.length - 1 && (
              <View
                style={[styles.line, isCompleted && styles.lineCompleted]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing[2],
  },
  step: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.neutral[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleCompleted: {
    backgroundColor: Colors.primary,
  },
  circleActive: {
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  circleFailed: {
    backgroundColor: Colors.error,
  },
  innerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.neutral[400],
  },
  innerDotActive: {
    backgroundColor: Colors.primary,
  },
  innerDotFuture: {
    backgroundColor: Colors.neutral[300],
  },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.neutral[200],
    marginTop: 13,
    marginHorizontal: -8,
  },
  lineCompleted: {
    backgroundColor: Colors.primary,
  },
  stepLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  stepLabelActive: {
    fontFamily: Typography.fontFamily.sansMedium,
    color: Colors.primary,
  },
  stepLabelCompleted: {
    color: Colors.textSecondary,
  },
  stepLabelFuture: {
    color: Colors.textDisabled,
  },
});
