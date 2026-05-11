import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { profile, setProfile } = useAuthStore();
  const [notifSms, setNotifSms] = useState(profile?.notification_sms ?? true);
  const [notifWhatsapp, setNotifWhatsapp] = useState(profile?.notification_whatsapp ?? true);
  const [saving, setSaving] = useState(false);

  const handleToggle = async (type: 'sms' | 'whatsapp', value: boolean) => {
    if (!profile) return;
    setSaving(true);
    const update = type === 'sms' ? { notification_sms: value } : { notification_whatsapp: value };
    await supabase.from('profiles').update(update).eq('id', profile.id);
    if (type === 'sms') setNotifSms(value);
    else setNotifWhatsapp(value);
    setProfile({ ...profile, ...update });
    setSaving(false);
  };

  const prefs = [
    {
      label: 'SMS Notifications',
      desc: 'Receive delivery updates and order confirmations via SMS',
      value: notifSms,
      type: 'sms' as const,
    },
    {
      label: 'WhatsApp Notifications',
      desc: 'Receive delivery updates and reminders via WhatsApp',
      value: notifWhatsapp,
      type: 'whatsapp' as const,
    },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Text style={styles.description}>
          Choose how you'd like to receive updates about your orders and deliveries.
        </Text>

        <View style={styles.card}>
          {prefs.map((pref, i) => (
            <View key={pref.type} style={[styles.row, i > 0 && styles.rowBorder]}>
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

        <View style={styles.noteCard}>
          <Text style={styles.noteText}>
            Transactional notifications (order confirmations, delivery alerts) may still be sent regardless of these settings to ensure you receive critical updates.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  backBtn: { padding: Spacing[1] },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    color: Colors.textPrimary,
  },
  content: { padding: Spacing[5], gap: Spacing[4], paddingBottom: 40 },
  description: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing[4],
    gap: Spacing[3],
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.divider },
  rowInfo: { flex: 1, gap: 4 },
  rowLabel: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  rowDesc: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    lineHeight: 16,
  },
  noteCard: {
    backgroundColor: Colors.warningSurface,
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  noteText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.warning,
    lineHeight: 18,
  },
});
