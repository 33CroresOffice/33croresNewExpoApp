import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Animated } from 'react-native';
import { Tabs, router, usePathname } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Hop as Home, Package, ClipboardList, User, Layers, IndianRupee, X, Sparkles, Sun, BriefcaseBusiness } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import * as Application from 'expo-application';
import Constants from 'expo-constants';

const TAB_BAR_HEIGHT = Platform.OS === 'web' ? 72 : 68;
const TAB_BAR_PADDING_BOTTOM = Platform.OS === 'web' ? 8 : 8;

type PendingOrder = {
  id: string;
  order_type: string;
  total_price: number;
};

function PendingPaymentBanner() {
  const insets = useSafeAreaInsets();
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
        { bottom: TAB_BAR_HEIGHT + insets.bottom, transform: [{ translateY: slideAnim }], opacity: opacityAnim },
      ]}
    >
      <LinearGradient
        colors={['#1C3A18', '#2D5A27', '#3A7A32']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bannerGradient}
      >
        <LinearGradient
          colors={['#D4A853', '#F0C060', '#D4A853']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.accentStrip}
        />

        <View style={styles.bannerInner}>
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

function useLoginLogger() {
  const { session } = useAuthStore();

  useEffect(() => {
    if (!session?.user?.id) return;
    const userId = session.user.id;

    (async () => {
      try {
        const platform = Platform.OS;
        const deviceModel =
          Platform.OS === 'android'
            ? (Application.modelName ?? 'Unknown')
            : Platform.OS === 'ios'
            ? (Application.modelName ?? 'Unknown')
            : 'Web';
        const appVersion =
          Application.nativeApplicationVersion ??
          Constants.expoConfig?.version ??
          'Unknown';
        const osVersion = String(Platform.Version ?? 'Unknown');

        await supabase.from('customer_login_logs').insert({
          user_id: userId,
          platform,
          device_model: deviceModel,
          app_version: appVersion,
          os_version: osVersion,
        });
      } catch {}
    })();
  }, [session?.user?.id]);
}

function CustomerBottomNav() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 0 : insets.bottom;
  const items = [
    { name: 'Home', path: '/(customer)', icon: Home },
    { name: 'Plans', path: '/(customer)/plans', icon: Layers },
    { name: 'Services', path: '/(customer)/services', icon: BriefcaseBusiness },
    { name: 'Orders', path: '/(customer)/subscriptions', icon: Package },
    { name: 'Panji', path: '/(customer)/panji', icon: Sun },
    { name: 'Profile', path: '/(customer)/profile', icon: User },
  ];

  return (
    <View style={[styles.tabBar, { height: TAB_BAR_HEIGHT + bottomInset, paddingBottom: bottomInset }]}>
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.name === 'Home'
          ? pathname === '/(customer)' || pathname === '/'
          : pathname?.endsWith(item.path.split('/').pop() ?? '');
        const color = isActive ? Colors.tabBarActive : Colors.tabBarInactive;
        return (
          <TouchableOpacity
            key={item.name}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            onPress={() => router.push(item.path as never)}
            style={styles.tabBarItem}
            activeOpacity={0.75}
          >
            <Icon size={22} color={color} strokeWidth={1.8} />
            <Text style={[styles.tabBarLabel, { color }]}>{item.name}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function usePushTokenRegistration() {
  const { session } = useAuthStore();
  const userId = session?.user?.id;
  const [pushEnabled, setPushEnabled] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('notification_preferences')
        .select('push_enabled')
        .eq('user_id', userId)
        .maybeSingle();
      if (!cancelled) setPushEnabled(data?.push_enabled ?? true);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  usePushNotifications(userId, pushEnabled);
}

export default function CustomerLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 0 : insets.bottom;
  useLoginLogger();
  usePushTokenRegistration();
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
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
          name="services"
          options={{
            title: 'Services',
            tabBarIcon: ({ color, size }) => <BriefcaseBusiness size={size} color={color} strokeWidth={1.8} />,
          }}
        />
        <Tabs.Screen
          name="subscriptions"
          options={{
            title: 'Orders',
            tabBarIcon: ({ color, size }) => <Package size={size} color={color} strokeWidth={1.8} />,
          }}
        />
        <Tabs.Screen name="orders" options={{ tabBarButton: () => null }} />
        <Tabs.Screen
          name="panji"
          options={{
            title: 'Panji',
            tabBarIcon: ({ color, size }) => <Sun size={size} color={color} strokeWidth={1.8} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => <User size={size} color={color} strokeWidth={1.8} />,
          }}
        />
        <Tabs.Screen name="about" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="custom-order" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="address-form" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="addresses" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="checkout" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="pooja-checkout" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="confirmation" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="edit-profile" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="help" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="notifications" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="order-detail" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="plan-detail" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="privacy" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="subscription-detail" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="terms" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="receipt" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="payment-callback" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="custom-order-detail" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="delivery-history" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="notification-feed" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="pooja-list-view" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="service-provider" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="service-order-details" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="provider-booking-payment" options={{ tabBarButton: () => null }} />
      </Tabs>
      <CustomerBottomNav />
      <PendingPaymentBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-around',
    backgroundColor: Colors.tabBar,
    borderTopColor: Colors.tabBarBorder,
    borderTopWidth: 1,
    paddingTop: 6,
    width: '100%',
    overflow: 'hidden',
  },
  tabBarItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 2,
    paddingVertical: 2,
    gap: 3,
  },
  tabBarLabel: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
  bannerOuter: {
    position: 'absolute',
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
