import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Bell, CheckCheck } from 'lucide-react-native';
import { formatDistanceToNow } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { InAppNotification } from '@/types/database';

const EVENT_ICONS: Record<string, { emoji: string; color: string; bg: string }> = {
  subscription_expiring_3days: { emoji: '⏰', color: Colors.warning, bg: Colors.warningSurface },
  subscription_expiring_1day:  { emoji: '⚠️', color: Colors.error,   bg: Colors.errorSurface },
  subscription_expired:        { emoji: '📭', color: Colors.error,   bg: Colors.errorSurface },
  subscription_renewed:        { emoji: '🔄', color: Colors.success, bg: Colors.successSurface },
  subscription_activated:      { emoji: '✅', color: Colors.success, bg: Colors.successSurface },
  subscription_paused:         { emoji: '⏸️', color: Colors.accent,  bg: Colors.accentSurface },
  payment_pending:             { emoji: '💳', color: Colors.warning, bg: Colors.warningSurface },
  payment_received:            { emoji: '✅', color: Colors.success, bg: Colors.successSurface },
  renewal_due:                 { emoji: '🔔', color: Colors.accent,  bg: Colors.accentSurface },
  order_dispatched:            { emoji: '🚴', color: Colors.primary, bg: Colors.primarySurface },
  order_delivered:             { emoji: '🌸', color: Colors.success, bg: Colors.successSurface },
  custom:                      { emoji: '💬', color: Colors.textSecondary, bg: Colors.neutral[100] },
};

function getIconConfig(eventType: string) {
  return EVENT_ICONS[eventType] ?? EVENT_ICONS.custom;
}

function cleanAmounts(text: string): string {
  return text
    .replace(/(\d+)\.00(?=\D|$)/g, '$1')
    .replace(/(\d+)00(?=\D|$)/g, '$1');
}

export default function NotificationFeedScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuthStore();

  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    if (!session?.user?.id) return;
    const { data } = await supabase
      .from('in_app_notifications')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setNotifications((data as InAppNotification[]) ?? []);
  }, [session?.user?.id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!session?.user?.id) return;
    const channel = supabase
      .channel('in_app_notifs')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'in_app_notifications',
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as InAppNotification, ...prev]);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const markRead = async (id: string) => {
    await supabase
      .from('in_app_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const markAllRead = async () => {
    if (!session?.user?.id) return;
    setMarkingAll(true);
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length > 0) {
      await supabase
        .from('in_app_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in('id', unreadIds);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    }
    setMarkingAll(false);
  };

  const handleTap = (notif: InAppNotification) => {
    if (!notif.is_read) markRead(notif.id);
    if (notif.related_subscription_id) {
      router.push({ pathname: '/(customer)/subscription-detail', params: { id: notif.related_subscription_id } });
    } else if (notif.related_order_id) {
      router.push({ pathname: '/(customer)/order-detail', params: { id: notif.related_order_id } });
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn} disabled={markingAll}>
            {markingAll ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <CheckCheck size={18} color={Colors.primary} />
            )}
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      {unreadCount > 0 && (
        <View style={styles.unreadBanner}>
          <Text style={styles.unreadBannerText}>{unreadCount} unread — tap the checkmark to mark all as read</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.emptyState}>
          <Bell size={48} color={Colors.textTertiary} strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.emptyDesc}>You have no notifications yet.</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          {notifications.map((notif) => {
            const cfg = getIconConfig(notif.event_type);
            const isActionable = !!(notif.related_subscription_id || notif.related_order_id);
            return (
              <TouchableOpacity
                key={notif.id}
                style={[styles.notifRow, !notif.is_read && styles.notifRowUnread]}
                onPress={() => handleTap(notif)}
                activeOpacity={isActionable ? 0.7 : 1}
              >
                <View style={[styles.iconWrap, { backgroundColor: cfg.bg }]}>
                  <Text style={styles.iconEmoji}>{cfg.emoji}</Text>
                </View>
                <View style={styles.notifContent}>
                  <View style={styles.notifTop}>
                    <Text style={styles.notifTitle} numberOfLines={1}>{notif.title}</Text>
                    {!notif.is_read && <View style={styles.unreadDot} />}
                  </View>
                  <Text style={styles.notifBody} numberOfLines={3}>{cleanAmounts(notif.body)}</Text>
                  <Text style={styles.notifTime}>
                    {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
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
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: Spacing[1] },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  markAllBtn: { padding: Spacing[1] },

  unreadBanner: {
    backgroundColor: Colors.primarySurface, paddingHorizontal: Spacing[5], paddingVertical: Spacing[2],
  },
  unreadBannerText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.primary },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing[3], padding: Spacing[8] },
  emptyTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  emptyDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },

  list: { padding: Spacing[4], gap: Spacing[2], paddingBottom: 40 },

  notifRow: {
    flexDirection: 'row', gap: Spacing[3], backgroundColor: Colors.white,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing[4], ...Shadow.sm,
  },
  notifRowUnread: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary + '40' },

  iconWrap: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  iconEmoji: { fontSize: 22 },

  notifContent: { flex: 1, gap: 4 },
  notifTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  notifTitle: { flex: 1, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, flexShrink: 0 },
  notifBody: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary, lineHeight: 18 },
  notifTime: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
});
