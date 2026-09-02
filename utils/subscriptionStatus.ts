import { Subscription } from '@/types/database';

export type EffectiveStatus =
  | 'active'
  | 'pending'
  | 'paused'
  | 'scheduled_pause'
  | 'expired'
  | 'cancelled'
  | 'renewed';

export function getEffectiveStatus(sub: Subscription): EffectiveStatus {
  if (
    sub.status === 'expired' ||
    sub.status === 'cancelled' ||
    sub.status === 'renewed'
  ) {
    return sub.status as EffectiveStatus;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // If start_date is in the future, show as pending regardless of DB status
  if (sub.start_date) {
    const startDate = new Date(sub.start_date);
    startDate.setHours(0, 0, 0, 0);
    if (startDate > today) {
      return 'pending';
    }
  }

  if (sub.status === 'pending') {
    return 'pending';
  }

  if (sub.pause_start_date && sub.pause_until) {
    const pauseStart = new Date(sub.pause_start_date);
    pauseStart.setHours(0, 0, 0, 0);
    const pauseUntil = new Date(sub.pause_until);
    pauseUntil.setHours(0, 0, 0, 0);

    if (today < pauseStart) {
      return 'scheduled_pause';
    }
    if (today >= pauseStart && today <= pauseUntil) {
      return 'paused';
    }
  }

  if (sub.status === 'paused' && (!sub.pause_start_date || !sub.pause_until)) {
    return 'paused';
  }

  return 'active';
}
