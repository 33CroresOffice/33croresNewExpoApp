import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  ImageBackground,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, Flower2, Truck, Heart, Star, Sparkles, ChevronRight, User, Calendar, CirclePause as PauseCircle, CircleCheck as CheckCircle2, Paintbrush, RotateCcw, TriangleAlert as AlertTriangle, Timer } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { SubscriptionPlan } from '@/types/database';
import { SkeletonCard } from '@/components/ui/SkeletonLoader';
import { format, addDays, differenceInDays, parseISO } from 'date-fns';
import { getEffectiveStatus } from '@/utils/subscriptionStatus';

type PauseRecord = {
  pause_start_date: string;
  pause_until: string;
  resumed_at: string | null;
};

type ActiveSub = {
  id: string;
  plan_id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  next_delivery_date: string | null;
  pause_until: string | null;
  pause_start_date: string | null;
  plan: { name: string; frequency: string; price: number; image_url: string | null } | null;
  pause_history: PauseRecord[];
};

function getRenewalState(sub: ActiveSub): 'expired' | 'grace' | 'warning' | null {
  if (!sub.end_date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = parseISO(sub.end_date);
  const daysLeft = differenceInDays(end, today);

  if (sub.status === 'expired') return 'expired';
  if (daysLeft < 0 && daysLeft >= -2) return 'grace';
  if (daysLeft >= 0 && daysLeft <= 5) return 'warning';
  return null;
}

function getDaysLeftLabel(endDate: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = parseISO(endDate);
  const daysLeft = differenceInDays(end, today);
  if (daysLeft < 0) return `${Math.abs(daysLeft)}d past due — renew to continue`;
  if (daysLeft === 0) return 'Expires today — renew now';
  return `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — renew`;
}

function computeEndDate(sub: ActiveSub): Date {
  const base = new Date(sub.start_date);
  let totalPausedDays = 0;

  for (const p of sub.pause_history) {
    const pauseStart = new Date(p.pause_start_date);
    const pauseEnd = p.resumed_at ? new Date(p.resumed_at) : new Date(p.pause_until);
    const days = differenceInDays(pauseEnd, pauseStart);
    if (days > 0) totalPausedDays += days;
  }

  if (sub.status === 'paused' && sub.pause_start_date && sub.pause_until) {
    const alreadyCounted = sub.pause_history.some(
      (p) => p.pause_start_date === sub.pause_start_date
    );
    if (!alreadyCounted) {
      const pauseStart = new Date(sub.pause_start_date);
      const pauseEnd = new Date(sub.pause_until);
      const days = differenceInDays(pauseEnd, pauseStart);
      if (days > 0) totalPausedDays += days;
    }
  }

  return addDays(base, 29 + totalPausedDays);
}

const { width, height } = Dimensions.get('window');

const C = {
  bg: '#F7F5F0',
  surface: '#FFFFFF',
  primary: '#2D5A27',
  primaryLight: '#C8EDBB',
  primaryDark: '#062100',
  accent: '#A0522D',
  accentLight: '#F5E6D8',
  text: '#1A1A1A',
  textMid: '#4A4A4A',
  textSoft: '#888888',
  border: '#E8E3DC',
  overlay: 'rgba(10,26,8,0.55)',
  overlayDeep: 'rgba(10,26,8,0.72)',
  white: '#FFFFFF',
  tag: '#EAF5E4',
  tagText: '#2D5A27',
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [activeSubs, setActiveSubs] = useState<ActiveSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    const [plansRes, subsRes] = await Promise.all([
      supabase.from('subscription_plans').select('*').eq('is_active', true).order('sort_order'),
      supabase
        .from('subscriptions')
        .select('id, plan_id, status, start_date, end_date, pause_start_date, next_delivery_date, pause_until, plan:subscription_plans(name, frequency, price, image_url), pause_history:subscription_pause_history(pause_start_date, pause_until, resumed_at)')
        .in('status', ['active', 'paused', 'expired'])
        .order('created_at', { ascending: false })
        .limit(5),
    ]);
    if (plansRes.data) setPlans(plansRes.data);
    if (subsRes.data) setActiveSubs(subsRes.data as ActiveSub[]);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { loadData(); }, []);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const formatPrice = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

  const frequencyLabel: Record<string, string> = {
    weekly: 'Weekly',
    biweekly: 'Bi-weekly',
    monthly: 'Monthly',
  };

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: C.bg }]}
      contentContainerStyle={{ paddingBottom: Spacing[10] }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
    >
      {/* Full-bleed Hero */}
      <ImageBackground
        source={require('@/assets/images/closeup-image-basket-with-flowers-onam-festival-background.jpg')}
        style={styles.hero}
        resizeMode="cover"
        imageStyle={styles.heroImg}
      >
        {/* Gradient tint — transparent top, dark bottom */}
        <LinearGradient
          colors={['rgba(0,0,0,0.08)', 'rgba(10,20,10,0.55)', 'rgba(10,24,12,0.88)']}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Top nav row */}
        <View style={[styles.nav, { paddingTop: insets.top + 12 }]}>
          <View style={styles.adminPill}>
            <Image source={require('@/assets/images/33logo-red_1.png')} style={styles.navLogoImg} resizeMode="contain" />
            <Text style={styles.navTitle}>Crores</Text>
          </View>
          <TouchableOpacity
            style={styles.adminPill}
            onPress={() => router.push('/(customer)/profile')}
            activeOpacity={0.85}
          >
            <User size={13} color={C.white} strokeWidth={2} />
            <Text style={styles.adminPillText}>Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Hero copy */}
        <View style={styles.heroCopy}>
          <View style={styles.heroTag}>
            <Sparkles size={10} color='#f9c06a' strokeWidth={2} />
            <Text style={styles.heroTagText}>Get Flowers as per season</Text>
          </View>
          <Text style={styles.heroHeadline}>Fresh sacred flowers delivered to your,{'\n'}doorstep every morning</Text>
          <View style={styles.heroBtns}>
            <TouchableOpacity
              style={styles.heroBtnPrimary}
              onPress={() => router.push('/(customer)/plans')}
              activeOpacity={0.9}
            >
              <Text style={styles.heroBtnPrimaryText}>Explore Plans</Text>
              <ArrowRight size={14} color={C.primary} strokeWidth={2.5} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.heroBtnOutline}
              onPress={() => router.push('/(customer)/subscriptions')}
              activeOpacity={0.9}
            >
              <Text style={styles.heroBtnOutlineText}>My Subscriptions</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Bottom white curve */}
        <View style={styles.heroCurve} />
      </ImageBackground>

      {/* Quick stats row */}
      <View style={styles.statsRow}>
        {[
          { value: '500+', label: 'Happy customers' },
          { value: '20+', label: 'Flower varieties' },
          { value: '98%', label: 'On-time delivery' },
        ].map((stat) => (
          <View key={stat.label} style={styles.statItem}>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Customize Order Banner */}
      <View style={styles.customOrderBanner}>
        <View style={styles.customOrderLeft}>
          <View style={styles.customOrderIcon}>
            <Paintbrush size={18} color={C.white} strokeWidth={1.8} />
          </View>
          <View style={styles.customOrderText}>
            <Text style={styles.customOrderTitle}>Customize Your Order</Text>
            <Text style={styles.customOrderSub}>One-time custom flower or garland delivery</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.customOrderBtn}
          onPress={() => router.push('/(customer)/custom-order')}
          activeOpacity={0.88}
        >
          <Text style={styles.customOrderBtnText}>Order Now</Text>
          <ArrowRight size={13} color={C.white} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      {/* Active Subscriptions */}
      {activeSubs.length > 0 && (
        <View style={styles.subSection}>
          <View style={styles.subSectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow2}>MY SUBSCRIPTIONS</Text>
              <Text style={styles.sectionHeading2}>Active deliveries</Text>
            </View>
            <TouchableOpacity
              style={styles.viewAllBtn2}
              onPress={() => router.push('/(customer)/subscriptions')}
              activeOpacity={0.8}
            >
              <Text style={styles.viewAllText2}>View all</Text>
              <ChevronRight size={13} color={C.primary} />
            </TouchableOpacity>
          </View>
          {activeSubs.map((sub) => {
            const effectiveStatus = getEffectiveStatus(sub as any);
            const isPaused = effectiveStatus === 'paused';
            const isScheduledPause = effectiveStatus === 'scheduled_pause';
            const isExpired = effectiveStatus === 'expired';
            const renewalState = getRenewalState(sub);
            const needsRenewal = renewalState !== null;
            const endDate = sub.end_date ? parseISO(sub.end_date) : computeEndDate(sub);
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const daysLeft = differenceInDays(endDate, today);
            const totalDays = differenceInDays(endDate, new Date(sub.start_date));
            const progress = isExpired ? 1 : Math.min(1, Math.max(0, 1 - daysLeft / Math.max(totalDays, 1)));
            const isUrgent = !isExpired && daysLeft <= 5;

            const statusColor = isExpired ? '#DC2626' : (isPaused || isScheduledPause) ? '#B45309' : C.primary;
            const statusBg = isExpired ? '#FEE2E2' : (isPaused || isScheduledPause) ? '#FEF3C7' : C.primarySurface;

            const nextInfo = (() => {
              if (isExpired) return null;
              if (isPaused && sub.pause_until) return { label: 'Resumes', date: format(new Date(sub.pause_until), 'dd MMM yyyy'), color: '#B45309' };
              if (isScheduledPause && sub.pause_start_date) return { label: 'Pauses', date: format(new Date(sub.pause_start_date), 'dd MMM yyyy'), color: '#B45309' };
              if (sub.next_delivery_date) return { label: 'Next delivery', date: format(new Date(sub.next_delivery_date), 'dd MMM yyyy'), color: C.primary };
              return null;
            })();

            return (
              <TouchableOpacity
                key={sub.id}
                style={[styles.subCard, isExpired && styles.subCardExpired]}
                onPress={() => router.push({ pathname: '/(customer)/subscription-detail', params: { id: sub.id } })}
                activeOpacity={0.9}
              >
                {/* Left image panel */}
                <View style={styles.subCardImgWrap}>
                  <Image
                    source={{ uri: sub.plan?.image_url ?? 'https://images.pexels.com/photos/931177/pexels-photo-931177.jpeg?auto=compress&cs=tinysrgb&w=400' }}
                    style={styles.subCardImg}
                    resizeMode="cover"
                  />
                  {/* Frequency pill overlaid on image */}
                  <View style={styles.subCardFreqBadge}>
                    <Text style={styles.subCardFreqBadgeText} numberOfLines={1}>
                      {sub.plan?.frequency?.charAt(0).toUpperCase()}{sub.plan?.frequency?.slice(1)}
                    </Text>
                  </View>
                </View>

                {/* Right content */}
                <View style={styles.subCardBody}>
                  {/* Title row */}
                  <View style={styles.subCardTop}>
                    <Text style={styles.subCardName} numberOfLines={1}>{sub.plan?.name}</Text>
                    <View style={[styles.subStatusBadge, { backgroundColor: statusBg }]}>
                      {isExpired
                        ? <AlertTriangle size={10} color={statusColor} strokeWidth={2.2} />
                        : (isPaused || isScheduledPause)
                          ? <PauseCircle size={10} color={statusColor} strokeWidth={2.2} />
                          : <CheckCircle2 size={10} color={statusColor} strokeWidth={2.2} />}
                      <Text style={[styles.subStatusText, { color: statusColor }]}>
                        {isExpired ? 'Expired' : isPaused ? 'Paused' : isScheduledPause ? 'Pause Scheduled' : 'Active'}
                      </Text>
                    </View>
                  </View>

                  {/* Countdown display */}
                  <View style={styles.countdownBlock}>
                    <View style={styles.countdownRow}>
                      <Text style={[styles.countdownDays, { color: isUrgent ? '#D97706' : isExpired ? '#DC2626' : C.primaryDark }]}>
                        {isExpired ? '0' : daysLeft === 0 ? '0' : `${daysLeft}`}
                      </Text>
                      <View style={styles.countdownMeta}>
                        <Text style={[styles.countdownDaysLabel, { color: isUrgent ? '#D97706' : isExpired ? '#DC2626' : C.primary }]}>
                          {isExpired ? 'days — expired' : daysLeft === 0 ? 'last day' : `day${daysLeft === 1 ? '' : 's'} left`}
                        </Text>
                        <Text style={styles.countdownEndsOn}>
                          {`until ${format(endDate, 'dd MMM yyyy')}`}
                        </Text>
                      </View>
                    </View>

                    {/* Progress bar */}
                    <View style={styles.progressTrack}>
                      <View style={[
                        styles.progressFill,
                        { width: `${Math.max(2, progress * 100)}%` as any },
                        isExpired ? styles.progressExpired : isUrgent ? styles.progressUrgent : styles.progressNormal,
                      ]} />
                    </View>
                  </View>

                  {/* Next delivery / pause info */}
                  {nextInfo && (
                    <View style={styles.subCardNextRow}>
                      <View style={[styles.subCardNextDot, { backgroundColor: nextInfo.color }]} />
                      <Text style={[styles.subCardNextText, { color: nextInfo.color }]}>
                        {nextInfo.label} <Text style={styles.subCardNextDate}>{nextInfo.date}</Text>
                      </Text>
                    </View>
                  )}

                  {/* Renewal banner — shown when expired OR days left ≤ 5 */}
                  {(isExpired || daysLeft <= 5) && (
                    <TouchableOpacity
                      style={[
                        styles.renewBanner,
                        isExpired ? styles.renewBannerExpired : styles.renewBannerWarn,
                      ]}
                      onPress={(e) => {
                        e.stopPropagation();
                        router.push({
                          pathname: '/(customer)/checkout',
                          params: { planId: sub.plan_id, renewFromSubscriptionId: sub.id },
                        });
                      }}
                      activeOpacity={0.85}
                    >
                      <RotateCcw size={11} color={isExpired ? '#DC2626' : '#92400E'} strokeWidth={2.2} />
                      <Text style={[styles.renewBannerText, isExpired ? styles.renewBannerTextExpired : styles.renewBannerTextWarn]} numberOfLines={1}>
                        {isExpired
                          ? 'Subscription expired — Renew now'
                          : daysLeft === 0
                            ? 'Expires today — renew now'
                            : `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — renew`}
                      </Text>
                      <View style={[styles.renewBtn, isExpired ? styles.renewBtnExpired : styles.renewBtnWarn]}>
                        <Text style={styles.renewBtnText}>Renew</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.subCardChevron}>
                  <ChevronRight size={15} color={C.textSoft} strokeWidth={1.8} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* How it works */}
      <View style={styles.section}>
        <Text style={styles.sectionEyebrow}>HOW IT WORKS</Text>
        <Text style={styles.sectionHeading}>Three simple steps</Text>
        <View style={styles.stepsRow}>
          {[
            { icon: Star, label: 'Choose a Plan', sub: 'Pick frequency & size', bg: C.primaryLight, color: C.primary },
            { icon: Heart, label: 'Make Payments', sub: 'Secured Payment Gateway', bg: '#FDEBD0', color: C.accent },
            { icon: Truck, label: 'Get Delivered', sub: 'Right to your door', bg: '#D6EAF8', color: '#1A5276' },
          ].map((step, i) => {
            const Icon = step.icon;
            return (
              <View key={step.label} style={styles.stepCard}>
                <View style={[styles.stepIconBg, { backgroundColor: step.bg }]}>
                  <Icon size={20} color={step.color} strokeWidth={1.8} />
                </View>
                <Text style={styles.stepNum}>0{i + 1}</Text>
                <Text style={styles.stepCardTitle}>{step.label}</Text>
                <Text style={styles.stepCardSub}>{step.sub}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Plans */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>SUBSCRIPTION PLANS</Text>
            <Text style={styles.sectionHeading}>Our offerings</Text>
          </View>
          <TouchableOpacity
            style={styles.viewAllBtn}
            onPress={() => router.push('/(customer)/plans')}
            activeOpacity={0.8}
          >
            <Text style={styles.viewAllText}>View all</Text>
            <ChevronRight size={13} color={C.primary} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={{ gap: Spacing[3] }}>
            <SkeletonCard /><SkeletonCard />
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.plansScroll}
          >
            {plans.map((plan, index) => (
              <TouchableOpacity
                key={plan.id}
                style={[styles.planCard, index === 0 && styles.planCardFeatured]}
                onPress={() => router.push({ pathname: '/(customer)/plan-detail', params: { id: plan.id } })}
                activeOpacity={0.88}
              >
                <Image
                  source={{ uri: plan.image_url ?? 'https://images.pexels.com/photos/931177/pexels-photo-931177.jpeg?auto=compress&cs=tinysrgb&w=600' }}
                  style={styles.planImg}
                  resizeMode="cover"
                />
                <View style={styles.planGradient} />
                <View style={styles.planFreqBadge}>
                  <Text style={styles.planFreqText}>{frequencyLabel[plan.frequency]}</Text>
                </View>
                <View style={styles.planBottom}>
                  <Text style={styles.planName} numberOfLines={1}>{plan.name}</Text>
                  <View style={styles.planPriceRow}>
                    <Text style={styles.planPrice}>{formatPrice(plan.price)}</Text>
                    <Text style={styles.planPer}>/mo</Text>
                  </View>
                  <View style={styles.planCta}>
                    <Text style={styles.planCtaText}>View details</Text>
                    <ArrowRight size={12} color="rgba(255,255,255,0.85)" />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Testimonial */}
      <View style={[styles.section, { paddingBottom: 0 }]}>
        <View style={styles.testimonialCard}>
          <View style={styles.quoteBox}>
            <Text style={styles.quoteChar}>"</Text>
          </View>
          <Text style={styles.testimonialBody}>
            33 Crores transformed my home. Every delivery is like receiving a gift from nature. The bouquets are always fresh and beautifully arranged.
          </Text>
          <View style={styles.testimonialFooter}>
            <View style={styles.testimonialAvatar}>
              <Text style={styles.testimonialInitials}>PS</Text>
            </View>
            <View>
              <Text style={styles.testimonialName}>Priya Sharma</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} size={11} color={Colors.accent} fill={Colors.accent} />
                ))}
              </View>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning,';
  if (hour < 17) return 'Good afternoon,';
  return 'Good evening,';
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  hero: {
    width: '100%',
    height: height * 0.62,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  heroImg: {
    resizeMode: 'cover',
  },
  heroCurve: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 28,
    backgroundColor: '#f5f5f0',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },

  nav: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[3],
  },
  navBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  navIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLogoImg: {
    width: 40,
    height: 40,
  },
  navTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 22,
    color: C.white,
    letterSpacing: -0.2,
    marginLeft: -15
  },
  adminPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    paddingHorizontal: Spacing[3],
    paddingVertical: 8,
    borderRadius: Radius.full,
  },
  adminPillText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: C.white,
    letterSpacing: 0.3,
  },

  heroCopy: {
    paddingHorizontal: Spacing[5],
    paddingBottom: 44,
    gap: Spacing[2],
  },
  heroTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(249,192,106,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(249,192,106,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    marginBottom: 2,
  },
  heroTagText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 11,
    color: '#f9c06a',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heroHeadline: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 30,
    color: C.white,
    letterSpacing: -0.4,
    lineHeight: 36,
  },
  heroSub: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.68)',
    lineHeight: 19,
    marginBottom: Spacing[1],
  },
  heroBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    marginTop: Spacing[2],
  },
  heroBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.white,
    paddingHorizontal: Spacing[4],
    paddingVertical: 11,
    borderRadius: Radius.full,
  },
  heroBtnPrimaryText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: C.primary,
    letterSpacing: 0.2,
  },
  heroBtnOutline: {
    paddingHorizontal: Spacing[4],
    paddingVertical: 11,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroBtnOutlineText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: C.white,
    letterSpacing: 0.2,
  },

  customOrderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.primary,
    marginHorizontal: Spacing[5],
    marginTop: Spacing[5],
    borderRadius: Radius.lg,
    padding: Spacing[4],
    ...Shadow.sm,
  },
  customOrderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    flex: 1,
  },
  customOrderIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customOrderText: { flex: 1, gap: 2 },
  customOrderTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: C.white,
  },
  customOrderSub: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 10,
    color: 'rgba(255,255,255,0.75)',
  },
  customOrderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
  },
  customOrderBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: C.white,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    marginHorizontal: Spacing[5],
    borderRadius: 20,
    marginTop: -28,
    ...Shadow.md,
    paddingVertical: Spacing[4],
    paddingHorizontal: Spacing[3],
    zIndex: 10,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  statValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    color: C.primary,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 10,
    color: C.textSoft,
    textAlign: 'center',
  },

  subSection: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[6],
    gap: Spacing[3],
  },
  subSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: Spacing[1],
  },
  sectionEyebrow2: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 10,
    color: C.primary,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  sectionHeading2: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    color: C.text,
    letterSpacing: -0.3,
  },
  viewAllBtn2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: C.primaryLight,
    paddingHorizontal: Spacing[3],
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  viewAllText2: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: C.primary,
  },
  subCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    ...Shadow.md,
  },
  subCardImg: {
    width: 90,
    height: 120,
    alignSelf: 'stretch',
  },
  subCardChevron: {
    paddingRight: 10,
    paddingLeft: 2,
    alignSelf: 'center',
  },
  subCardBody: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2,
  },
  subCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  subCardName: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.sm,
    color: C.text,
    flex: 1,
    letterSpacing: -0.2,
  },
  subStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  subCardExpired: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF8F8',
  },
  subCardImgWrap: {
    width: 90,
    alignSelf: 'stretch',
    position: 'relative',
    overflow: 'hidden',
  },
  subCardFreqBadge: {
    position: 'absolute',
    bottom: 8,
    left: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignItems: 'center',
  },
  subCardFreqBadgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 9,
    color: '#FFFFFF',
    letterSpacing: 0.4,
    textTransform: 'capitalize',
  },
  subStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  subStatusText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 10,
    letterSpacing: 0.2,
  },
  countdownBlock: {
    marginTop: 6,
    gap: 5,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  countdownDays: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 28,
    lineHeight: 30,
    letterSpacing: -1,
  },
  countdownMeta: {
    paddingBottom: 2,
    gap: 1,
  },
  countdownDaysLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 11,
    letterSpacing: 0.1,
    textTransform: 'lowercase',
  },
  countdownEndsOn: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 10,
    color: C.textSoft,
  },
  progressTrack: {
    height: 3,
    backgroundColor: C.divider,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  progressNormal: {
    backgroundColor: C.primary,
  },
  progressUrgent: {
    backgroundColor: '#D97706',
  },
  progressExpired: {
    backgroundColor: '#DC2626',
  },
  subCardNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  subCardNextDot: {
    width: 5,
    height: 5,
    borderRadius: Radius.full,
  },
  subCardNextText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: 10.5,
  },
  subCardNextDate: {
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  renewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  renewBannerWarn: {
    backgroundColor: '#FEF3C7',
  },
  renewBannerExpired: {
    backgroundColor: '#FEE2E2',
  },
  renewBannerText: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 10,
    letterSpacing: 0.1,
  },
  renewBannerTextWarn: {
    color: '#92400E',
  },
  renewBannerTextExpired: {
    color: '#DC2626',
  },
  renewBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  renewBtnWarn: {
    backgroundColor: '#D97706',
  },
  renewBtnExpired: {
    backgroundColor: '#DC2626',
  },
  renewBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 10,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  section: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[7],
  },
  sectionEyebrow: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 10,
    color: C.primary,
    letterSpacing: 1.5,
    marginBottom: 5,
  },
  sectionHeading: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    color: C.text,
    letterSpacing: -0.3,
    marginBottom: Spacing[4],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: Spacing[4],
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: C.primaryLight,
    paddingHorizontal: Spacing[3],
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  viewAllText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: C.primary,
  },

  stepsRow: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  stepCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 18,
    padding: Spacing[3],
    gap: 5,
    borderWidth: 1,
    borderColor: C.border,
  },
  stepIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stepNum: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 20,
    color: C.border,
    letterSpacing: -1,
    lineHeight: 22,
  },
  stepCardTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 11,
    color: C.text,
    lineHeight: 15,
  },
  stepCardSub: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 10,
    color: C.textSoft,
    lineHeight: 13,
  },

  plansScroll: {
    gap: Spacing[3],
    paddingBottom: 4,
  },
  planCard: {
    width: width * 0.58,
    height: 220,
    borderRadius: 22,
    overflow: 'hidden',
    ...Shadow.md,
  },
  planCardFeatured: {
    width: width * 0.64,
  },
  planImg: {
    ...StyleSheet.absoluteFillObject as any,
  },
  planGradient: {
    ...StyleSheet.absoluteFillObject as any,
    backgroundColor: 'rgba(10,26,8,0.48)',
  },
  planFreqBadge: {
    position: 'absolute',
    top: Spacing[3],
    left: Spacing[3],
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: Spacing[2] + 2,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  planFreqText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 10,
    color: C.white,
    letterSpacing: 0.4,
  },
  planBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing[4],
    gap: 4,
  },
  planName: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.base,
    color: C.white,
    letterSpacing: -0.2,
  },
  planPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  planPrice: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    color: C.white,
  },
  planPer: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.65)',
  },
  planCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  planCtaText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: 'rgba(255,255,255,0.82)',
  },

  testimonialCard: {
    backgroundColor: C.surface,
    borderRadius: 22,
    padding: Spacing[5],
    gap: Spacing[4],
    borderWidth: 1,
    borderColor: C.border,
  },
  quoteBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quoteChar: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 28,
    color: C.white,
    lineHeight: 32,
    marginTop: -4,
  },
  testimonialBody: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.base,
    color: C.textMid,
    lineHeight: Typography.size.base * 1.7,
    fontStyle: 'italic',
  },
  testimonialFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: Spacing[4],
  },
  testimonialAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testimonialInitials: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: C.white,
  },
  testimonialName: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: C.text,
  },
  starsRow: { flexDirection: 'row', gap: 2, marginTop: 3 },
});
