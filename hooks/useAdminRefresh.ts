import { useEffect } from 'react';

type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyAdminRefresh() {
  listeners.forEach((fn) => fn());
}

export function useAdminRefresh(onRefresh: () => void) {
  useEffect(() => {
    listeners.add(onRefresh);
    return () => {
      listeners.delete(onRefresh);
    };
  }, [onRefresh]);
}
