import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ShieldOff } from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';
import { Colors, Typography, Spacing } from '@/constants/theme';

interface Props {
  module: string;
  children: React.ReactNode;
}

export default function ModuleGuard({ module, children }: Props) {
  const hasModule = useAuthStore((s) => s.hasModule);

  if (!hasModule(module)) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <ShieldOff size={40} color={Colors.neutral[400]} />
          <Text style={styles.title}>Access Restricted</Text>
          <Text style={styles.body}>
            You don't have permission to access this module.{'\n'}
            Contact your super admin to request access.
          </Text>
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[6],
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: Spacing[8],
    alignItems: 'center',
    gap: Spacing[3],
    maxWidth: 360,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: Spacing[2],
  },
  body: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: Typography.size.sm * 1.6,
  },
});
