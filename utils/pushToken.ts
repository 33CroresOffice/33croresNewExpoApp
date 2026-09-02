import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getProjectId(): string | undefined {
  const easProjectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (easProjectId) return easProjectId;
  return undefined;
}

export async function registerForPushNotificationsAsync(userId: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) {
    console.warn('[push] Push tokens require a physical device — skipping registration.');
    return null;
  }

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[push] Notification permission not granted — skipping registration.');
      return null;
    }

    const projectId = getProjectId();
    const token = (
      await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
      )
    ).data;

    const platform: 'ios' | 'android' | 'unknown' =
      Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'unknown';

    const { error } = await supabase
      .from('expo_push_tokens')
      .upsert(
        { user_id: userId, token, platform, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );

    if (error) {
      console.error('[push] Failed to upsert push token:', error.message);
      return null;
    }

    return token;
  } catch (err) {
    console.error('[push] Registration failed:', err);
    return null;
  }
}

export async function unregisterPushTokenAsync(userId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { error } = await supabase.from('expo_push_tokens').delete().eq('user_id', userId);
    if (error) console.error('[push] Failed to delete push token:', error.message);
  } catch (err) {
    console.error('[push] Unregister failed:', err);
  }
}
