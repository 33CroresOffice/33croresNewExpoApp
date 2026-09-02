export type PauseHistoryEntry = {
  id: string;
  subscription_id?: string;
  pause_start_date: string;
  pause_until: string;
  resumed_at?: string | null;
  is_cancelled?: boolean;
  created_at?: string;
};

export function dedupePauseHistory<T extends PauseHistoryEntry>(entries: T[]): T[] {
  const byPeriod = new Map<string, T>();

  for (const entry of entries) {
    const key = `${entry.subscription_id ?? ''}:${entry.pause_start_date}:${entry.pause_until}`;
    const existing = byPeriod.get(key);

    if (!existing) {
      byPeriod.set(key, entry);
      continue;
    }

    byPeriod.set(key, {
      ...existing,
      ...entry,
      resumed_at: existing.resumed_at ?? entry.resumed_at ?? null,
      is_cancelled: Boolean(existing.is_cancelled || entry.is_cancelled),
    });
  }

  return Array.from(byPeriod.values());
}
