import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Bell, Smartphone } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { registerForPushNotificationsAsync, unregisterPushTokenAsync } from '@/utils/pushToken';

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuthStore();

  const [pushEnabled, setPushEnabled] = useState(true);
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('notification_preferences')
        .select('push_enabled, in_app_enabled')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (data) {
        setPushEnabled(data.push_enabled);
        setInAppEnabled(data.in_app_enabled);
      }
      setLoading(false);
    })();
  }, [session?.user?.id]);

  const handleToggle = async (type: 'push' | 'in_app', value: boolean) => {
    if (!session?.user?.id) return;
    setSaving(true);
    const update = type === 'push' ? { push_enabled: value } : { in_app_enabled: value };
    await supabase
      .from('notification_preferences')
      .upsert({ user_id: session.user.id, ...update }, { onConflict: 'user_id' });
    if (type === 'push') {
      setPushEnabled(value);
      if (value) {
        registerForPushNotificationsAsync(session.user.id).catch(() => {});
      } else {
        unregisterPushTokenAsync(session.user.id).catch(() => {});
      }
    } else {
      setInAppEnabled(value);
    }
    setSaving(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <Text style={styles.description}>
            Choose how you'd like to receive updates about your orders and deliveries.
          </Text>

          <View style={styles.transactionalCard}>
            <Text style={styles.transactionalTitle}>Transactional notifications are always on</Text>
            <Text style={styles.transactionalDesc}>
              SMS and WhatsApp notifications for payments, delivery confirmations, and subscription updates are sent automatically. These cannot be disabled to ensure you never miss critical updates.
            </Text>
          </View>

          <View style={styles.card}>
            {[
              {
                label: 'Push Notifications',
                desc: 'Receive alerts on your device even when the app is in the background',
                value: pushEnabled,
                type: 'push' as const,
                Icon: Bell,
              },
              {
                label: 'In-App Notifications',
                desc: 'Show notifications in the bell feed inside the app',
                value: inAppEnabled,
                type: 'in_app' as const,
                Icon: Smartphone,
              },
            ].map((pref, i) => (
              <View key={pref.type} style={[styles.row, i > 0 && styles.rowBorder]}>
                <View style={styles.rowIconWrap}>
                  <pref.Icon size={18} color={Colors.primary} />
                </View>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowLabel}>{pref.label}</Text>
                  <Text style={styles.rowDesc}>{pref.desc}</Text>
                </View>
                <Switch
                  value={pref.value}
                  onValueChange={(v) => handleToggle(pref.type, v)}
                  trackColor={{ false: Colors.neutral[300], true: Colors.primaryLight }}
                  thumbColor={pref.value ? Colors.primary : Colors.neutral[400]}
                  disabled={saving}
                />
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.feedLink} onPress={() => router.push('/(customer)/notification-feed')}>
            <Bell size={16} color={Colors.primary} />
            <Text style={styles.feedLinkText}>View notification history</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[5], paddingVertical: Spacing[4],
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  backBtn: { padding: Spacing[1] },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: Spacing[5], gap: Spacing[4], paddingBottom: 40 },
  description: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: Colors.textSecondary, lineHeight: 20,
  },
  transactionalCard: {
    backgroundColor: Colors.primarySurface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.primary + '30', padding: Spacing[4], gap: 6,
  },
  transactionalTitle: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.primary },
  transactionalDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary, lineHeight: 18 },
  card: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing[4], gap: Spacing[3],
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.divider },
  rowIconWrap: {
    width: 36, height: 36, borderRadius: Radius.md,
    backgroundColor: Colors.primarySurface, justifyContent: 'center', alignItems: 'center',
  },
  rowInfo: { flex: 1, gap: 3 },
  rowLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.base, color: Colors.textPrimary },
  rowDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, lineHeight: 16 },
  feedLink: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    justifyContent: 'center', paddingVertical: Spacing[3],
  },
  feedLinkText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.primary },
});
