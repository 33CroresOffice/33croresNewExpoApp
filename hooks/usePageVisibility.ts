import { useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAdminRefresh } from '@/hooks/useAdminRefresh';

export function usePageVisibility(onVisible: () => void) {
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  const stableRefresh = useCallback(() => {
    onVisibleRef.current();
  }, []);

  // Mobile: re-run when screen gets focus
  useFocusEffect(
    useCallback(() => {
      onVisibleRef.current();
    }, [])
  );

  // Web: re-run when browser tab becomes visible again (no re-render, just a callback)
  useAdminRefresh(Platform.OS === 'web' ? stableRefresh : () => {});
}
