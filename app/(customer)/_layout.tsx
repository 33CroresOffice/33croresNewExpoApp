import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Animated } from 'react-native';
import { Tabs, router, usePathname } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Hop as Home, Package, ClipboardList, User, Layers, IndianRupee, X, Sparkles } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 88 : Platform.OS === 'web' ? 60 : 64;
const TAB_BAR_PADDING_BOTTOM = Platform.OS === 'ios' ? 28 : Platform.OS === 'web' ? 8 : 10;

type PendingOrder = {
  id: string;
  order_type: string;
  total_price: number;
};

function PendingPaymentBanner() {
  const { session } = useAuthStore();
  const pathname = usePathname();
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const slideAnim = useRef(new Animated.Value(80)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const mountedRef = useRef(false);

  const isOnOrderDetail = pathname?.includes('custom-order-detail');

  const checkPending = useCallback(async () => {
    if (!session?.user?.id) return;
    const { data } = await supabase
      .from('custom_orders')
      .select('id, order_type, total_price')
      .eq('user_id', session.user.id)
      .eq('status', 'confirmed')
      .neq('payment_status', 'paid')
      .gt('total_price', 0)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const isNew = !mountedRef.current || !pendingOrder;
      setPendingOrder(data);
      setDismissed(false);
      if (isNew) {
        Animated.parallel([
          Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 10 }),
          Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        ]).start();
      }
    } else {
      setPendingOrder(null);
    }
    mountedRef.current = true;
  }, [session?.user?.id]);

  useEffect(() => { checkPending(); }, [checkPending]);
  useFocusEffect(useCallback(() => { checkPending(); }, [checkPending]));

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 80, duration: 220, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setDismissed(true));
  };

  if (!pendingOrder || dismissed || isOnOrderDetail) return null;

  const label = pendingOrder.order_type === 'garland' ? 'Customized Garland' : 'Customized Flower';
  const price = `₹${(pendingOrder.total_price / 100).toLocaleString('en-IN')}`;

  return (
    <Animated.View
      style={[
        styles.bannerOuter,
        { transform: [{ translateY: slideAnim }], opacity: opacityAnim },
      ]}
    >
      <LinearGradient
        colors={['#1C3A18', '#2D5A27', '#3A7A32']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bannerGradient}
      >
        {/* Decorative accent strip */}
        <LinearGradient
          colors={['#D4A853', '#F0C060', '#D4A853']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.accentStrip}
        />

        <View style={styles.bannerInner}>
          {/* Left: icon + text */}
          <View style={styles.bannerLeft}>
            <View style={styles.bannerIconWrap}>
              <LinearGradient
                colors={['#D4A853', '#F0C060']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.bannerIconGrad}
              >
                <IndianRupee size={15} color="#fff" strokeWidth={2.5} />
              </LinearGradient>
              <View style={styles.sparkleWrap}>
                <Sparkles size={9} color="#F0C060" strokeWidth={2} />
              </View>
            </View>
            <View style={styles.bannerTextWrap}>
              <View style={styles.bannerTitleRow}>
                <Text style={styles.bannerTitle}>Pending Payment</Text>
                <View style={styles.pricePill}>
                  <Text style={styles.pricePillText}>{price}</Text>
                </View>
              </View>
              <Text style={styles.bannerSub} numberOfLines={1}>{label} · Tap Pay to complete</Text>
            </View>
          </View>

          {/* Right: dismiss + pay */}
          <View style={styles.bannerActions}>
            <TouchableOpacity
              style={styles.dismissBtn}
              onPress={dismiss}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={14} color="rgba(255,255,255,0.55)" strokeWidth={2.2} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.payBtnWrap}
              onPress={() =>
                router.push({ pathname: '/(customer)/custom-order-detail', params: { id: pendingOrder.id } })
              }
              activeOpacity={0.82}
            >
              <LinearGradient
                colors={['#D4A853', '#C8932A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.payBtnGrad}
              >
                <Text style={styles.payBtnText}>Pay Now</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

export default function CustomerLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: Colors.tabBarActive,
          tabBarInactiveTintColor: Colors.tabBarInactive,
          tabBarStyle: {
            backgroundColor: Colors.tabBar,
            borderTopColor: Colors.tabBarBorder,
            borderTopWidth: 1,
            height: TAB_BAR_HEIGHT,
            paddingBottom: TAB_BAR_PADDING_BOTTOM,
            paddingTop: 8,
          },
          tabBarLabelStyle: {
            fontFamily: Typography.fontFamily.sansMedium,
            fontSize: 11,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => <Home size={size} color={color} strokeWidth={1.8} />,
          }}
        />
        <Tabs.Screen
          name="plans"
          options={{
            title: 'Plans',
            tabBarIcon: ({ color, size }) => <Layers size={size} color={color} strokeWidth={1.8} />,
          }}
        />
        <Tabs.Screen
          name="subscriptions"
          options={{
            title: 'Subscriptions',
            tabBarIcon: ({ color, size }) => <Package size={size} color={color} strokeWidth={1.8} />,
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: 'Orders',
            tabBarIcon: ({ color, size }) => <ClipboardList size={size} color={color} strokeWidth={1.8} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => <User size={size} color={color} strokeWidth={1.8} />,
          }}
        />
        <Tabs.Screen name="about" options={{ href: null }} />
        <Tabs.Screen name="custom-order" options={{ href: null }} />
        <Tabs.Screen name="address-form" options={{ href: null }} />
        <Tabs.Screen name="addresses" options={{ href: null }} />
        <Tabs.Screen name="checkout" options={{ href: null }} />
        <Tabs.Screen name="confirmation" options={{ href: null }} />
        <Tabs.Screen name="edit-profile" options={{ href: null }} />
        <Tabs.Screen name="help" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
        <Tabs.Screen name="order-detail" options={{ href: null }} />
        <Tabs.Screen name="plan-detail" options={{ href: null }} />
        <Tabs.Screen name="privacy" options={{ href: null }} />
        <Tabs.Screen name="subscription-detail" options={{ href: null }} />
        <Tabs.Screen name="terms" options={{ href: null }} />
        <Tabs.Screen name="receipt" options={{ href: null }} />
        <Tabs.Screen name="payment-callback" options={{ href: null }} />
        <Tabs.Screen name="custom-order-detail" options={{ href: null }} />
      </Tabs>
      <PendingPaymentBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  bannerOuter: {
    position: 'absolute',
    bottom: TAB_BAR_HEIGHT,
    left: 0,
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 16,
  },
  bannerGradient: {
    overflow: 'hidden',
  },
  accentStrip: {
    height: 2,
    width: '100%',
  },
  bannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    paddingVertical: 11,
    gap: Spacing[3],
  },
  bannerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minWidth: 0,
  },
  bannerIconWrap: {
    position: 'relative',
    flexShrink: 0,
  },
  bannerIconGrad: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  sparkleWrap: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: '#1C3A18',
    borderRadius: 10,
    padding: 1,
  },
  bannerTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  bannerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    flexWrap: 'nowrap',
  },
  bannerTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 13,
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  pricePill: {
    backgroundColor: 'rgba(212,168,83,0.25)',
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.45)',
  },
  pricePillText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 11,
    color: '#F0C060',
    letterSpacing: 0.2,
  },
  bannerSub: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.1,
  },
  bannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    flexShrink: 0,
  },
  dismissBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  payBtnWrap: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    shadowColor: '#D4A853',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  payBtnGrad: {
    paddingHorizontal: Spacing[4],
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  payBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});
