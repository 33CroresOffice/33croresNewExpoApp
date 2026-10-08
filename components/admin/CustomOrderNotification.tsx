import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, Animated as RNAnimated } from 'react-native';
import { router } from 'expo-router';
import { BellRing, Flower2 } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { Colors, Spacing, Radius } from '@/constants/theme';

const startOfTodayISO = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

// Browsers start AudioContexts suspended unless unlocked by a user gesture.
// One shared context is created lazily and resumed on the first click/keypress,
// so the chime can actually be heard when an order arrives later.
let sharedCtx: AudioContext | null = null;
const getAudioCtx = (): AudioContext | null => {
  if (Platform.OS !== 'web') return null;
  try {
    const Ctx = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return null;
    if (!sharedCtx) sharedCtx = new Ctx();
    return sharedCtx;
  } catch { return null; }
};

const playChime = () => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t0 = ctx.state === 'running' ? ctx.currentTime : ctx.currentTime;
    [880, 1174.7].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.3, t0 + i * 0.18 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.18 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0 + i * 0.18);
      osc.stop(t0 + i * 0.18 + 0.45);
    });
  } catch { /* sound is best-effort */ }
};

export default function CustomOrderNotification() {
  const [todayCount, setTodayCount] = useState<number | null>(null);
  const blink = useRef(new RNAnimated.Value(1)).current;
  const blinkRef = useRef<RNAnimated.CompositeAnimation | null>(null);
  // Every custom order seen for today; prevents repeat chimes for the same order
  const seenIds = useRef<Set<string>>(new Set());
  // The very first load absorbs existing orders silently; only later arrivals alert
  const firstSyncDone = useRef(false);
  const chimeTimers = useRef<number[]>([]);

  const startBriefBlink = useCallback(() => {
    blinkRef.current?.stop();
    blink.setValue(1);
    blinkRef.current = RNAnimated.sequence([
      RNAnimated.timing(blink, { toValue: 0.15, duration: 400, useNativeDriver: true }),
      RNAnimated.timing(blink, { toValue: 1, duration: 400, useNativeDriver: true }),
      RNAnimated.timing(blink, { toValue: 0.15, duration: 400, useNativeDriver: true }),
      RNAnimated.timing(blink, { toValue: 1, duration: 400, useNativeDriver: true }),
      RNAnimated.timing(blink, { toValue: 0.15, duration: 400, useNativeDriver: true }),
      RNAnimated.timing(blink, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]);
    blinkRef.current.start(({ finished }) => {
      if (finished) blink.setValue(1);
    });
  }, [blink]);

  const CHIME_GAP_MS = 700;

const announce = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    ids.forEach((id) => seenIds.current.add(id));
    setTodayCount((c) => (c ?? 0) + ids.length);
    // One chime per new order, staggered so several orders arriving together
    // are each heard separately (deduped by id, so no repeats for one order)
    ids.forEach((_, i) => {
      chimeTimers.current.push(window.setTimeout(playChime, i * CHIME_GAP_MS));
    });
    startBriefBlink();
  }, [startBriefBlink]);

  const syncFromDb = useCallback(async () => {
    const { data, error } = await supabase
      .from('custom_orders')
      .select('id')
      .gte('created_at', startOfTodayISO())
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) { console.warn('[custom-order-banner] sync failed:', error.message); return; }
    const rows = (data ?? []) as { id: string }[];
    setTodayCount(rows.length);
    const fresh = rows.filter((r) => !seenIds.current.has(r.id)).map((r) => r.id);
    if (!firstSyncDone.current) {
      // Initial load: absorb everything without alerting
      fresh.forEach((id) => seenIds.current.add(id));
      firstSyncDone.current = true;
    } else {
      // Returning to the dashboard / periodic resync: alert for unseen orders
      announce(fresh);
    }
  }, [announce]);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    syncFromDb();

    // Live updates via Supabase Realtime, with a 15s poll as fallback in case
    // the websocket channel cannot connect. announce() dedupes by id, so an
    // order is never counted or chimed twice even if both paths see it.
    const channel = supabase
      .channel('admin-custom-order-alerts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'custom_orders' },
        (payload) => {
          const row = payload.new as { id: string } | null;
          if (!row?.id || seenIds.current.has(row.id)) return;
          announce([row.id]);
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[custom-order-banner] realtime channel issue:', status);
        }
      });

    const poll = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      syncFromDb();
    }, 15000);

    const onVisible = () => { if (document.visibilityState === 'visible') syncFromDb(); };
    document.addEventListener('visibilitychange', onVisible);

    // Unlock audio on the first user interaction so the chime can play later
    const unlockAudio = () => {
      const ctx = getAudioCtx();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      supabase.removeChannel(channel);
      chimeTimers.current.forEach((t) => window.clearTimeout(t));
      chimeTimers.current = [];
      blinkRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePress = () => {
    router.push('/(admin)/orders?tab=custom&customFilter=today' as any);
  };

  // Hidden entirely while loading and whenever there are no orders today
  if (!todayCount) return null;

  return (
    <RNAnimated.View
      style={[styles.banner, { opacity: blink }]}
      accessibilityRole="button"
      accessibilityLabel={`${todayCount} customize orders today`}
    >
      <TouchableOpacity style={styles.inner} onPress={handlePress} activeOpacity={0.85}>
        <View style={styles.iconWrap}>
          <BellRing size={16} color="#FFFFFF" strokeWidth={2} />
        </View>
        <Text style={styles.text}>
          {todayCount === 1 ? '1 Customize Order Today' : `${todayCount} Customize Orders Today`}
        </Text>
        <Flower2 size={15} color="#FFFFFF" strokeWidth={2} />
      </TouchableOpacity>
    </RNAnimated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: Spacing[5],
    marginBottom: Spacing[4],
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[4],
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
