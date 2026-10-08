import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Modal,
  Platform,
  BackHandler,
} from 'react-native';
import { ShieldCheck, XCircle } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import Button from '@/components/ui/Button';

interface PaymentProcessingOverlayProps {
  visible: boolean;
  status: 'processing' | 'failed';
  message?: string;
  onDismiss: () => void;
}

export default function PaymentProcessingOverlay({
  visible,
  status,
  message,
  onDismiss,
}: PaymentProcessingOverlayProps) {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    const spinAnim = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true }),
    );
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    spinAnim.start();
    pulseAnim.start();
    return () => {
      spinAnim.stop();
      pulseAnim.stop();
    };
  }, [visible, spin, pulse]);

  useEffect(() => {
    if (!visible || Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [visible]);

  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Modal visible={visible} transparent={false} animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.container}>
        {status === 'processing' ? (
          <>
            <View style={styles.loaderWrap}>
              <Animated.View style={[styles.loaderRing, { transform: [{ rotate: spinDeg }, { scale: pulse }] }]} />
              <View style={styles.loaderIconWrap}>
                <ShieldCheck size={30} color={Colors.primary} strokeWidth={1.8} />
              </View>
            </View>
            <Text style={styles.title}>Payment Processing…</Text>
            <Text style={styles.subtitle}>Please wait while we confirm your payment.</Text>
            <Text style={styles.note}>Do not press back or close the app.</Text>
          </>
        ) : (
          <>
            <View style={[styles.loaderIconWrap, styles.failedIconWrap]}>
              <XCircle size={56} color={Colors.error} strokeWidth={1.6} />
            </View>
            <Text style={styles.title}>Payment Failed</Text>
            <Text style={styles.failText}>{message || 'We could not confirm your payment. If any amount was deducted it will be auto-refunded by your bank.'}</Text>
            <View style={styles.btnWrap}>
              <Button label="Go Back" onPress={onDismiss} size="lg" fullWidth variant="outline" />
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[6],
  },
  loaderWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[5],
  },
  loaderRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: Colors.primarySurface,
    borderTopColor: Colors.primary,
  },
  loaderIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failedIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.errorSurface,
    marginBottom: Spacing[5],
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginTop: Spacing[2],
  },
  note: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing[4],
  },
  failText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.error,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: Spacing[2],
  },
  btnWrap: {
    width: '100%',
    marginTop: Spacing[6],
  },
});
