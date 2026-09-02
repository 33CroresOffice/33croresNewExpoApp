import { useEffect, useRef } from 'react';
import { registerForPushNotificationsAsync, unregisterPushTokenAsync } from '@/utils/pushToken';

export function usePushNotifications(userId: string | undefined, enabled: boolean = true) {
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  useEffect(() => {
    if (!userId) return;
    if (!enabled) {
      unregisterPushTokenAsync(userId);
      return;
    }
    registerForPushNotificationsAsync(userId).catch(() => {});
  }, [userId, enabled]);

  return { unregister: () => userIdRef.current && unregisterPushTokenAsync(userIdRef.current) };
}
