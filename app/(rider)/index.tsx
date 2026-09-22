import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bike, PackageCheck, CircleCheck, CircleX, Clock, MapPin, CircleAlert as AlertCircle, Loader, ChevronRight, Navigation, Radio, Award, Trophy, Crown, Medal } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format } from 'date-fns';
import StatusChip from '@/components/ui/StatusChip';
import { useRouter, useRootNavigationState } from 'expo-router';
import { resolveRider } from '@/utils/riderLookup';
import { todayISTString, performAttendanceCheckIn, getCheckInErrorMessage } from '@/utils/attendanceCheckIn';
import { getCurrentMonthIST, getMonthRangeIST } from '@/utils/riderPeriod';


const GRADIENT_TOP = '#1A2E3A';
const GRADIENT_MID = '#1E3D50';
const GRADIENT_BOT = '#235068';
const ACCENT = '#3AAFE4';

interface RiderInfo {
  id: string;
  full_name: string;
  mobile: string;
  zone: string;
  vehicle_type: string;
  vehicle_number: string;
  is_active: boolean;
  profile_photo_url: string | null;
}

interface DashboardMetrics {
  deliveries: number;
  present: number;
  absent: number;
}

interface BonusBreakdown {
  id: string;
  name: string;
  eligibleCount: number;
  amount: number;
  total: number;
  unitLabel: string;
}

interface RankingEntry {
  rider_id: string;
  rider_name: string;
  rank_position: number;
  score: number;
  deliveries: number;
  present_days: number;
  total_earned: number;
  profile_photo_url: string | null;
  is_self: boolean;
}

export default function RiderDashboard() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const isWeb = Platform.OS === 'web';

  const [rider, setRider] = useState<RiderInfo | null>(null);
  const [riderId, setRiderId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    deliveries: 0,
    present: 0,
    absent: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const hasRedirectedRef = useRef(false);
  const rankingPromptCheckedRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Attendance state
  const [todayAttendance, setTodayAttendance] = useState<{ status: string; check_in_time: string | null } | null | undefined>(undefined);
  const [attendanceLocations, setAttendanceLocations] = useState<{ id: string; name: string; latitude: number; longitude: number; radius_meters: number }[]>([]);
  const [checkingIn, setCheckingIn] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [showRankingModal, setShowRankingModal] = useState(false);
  const [onTimeAttendance, setOnTimeAttendance] = useState(0);
  const [onTimeDelivery, setOnTimeDelivery] = useState(0);
  const [bonusBreakdown, setBonusBreakdown] = useState<BonusBreakdown[]>([]);
  const [referralBonus, setReferralBonus] = useState<{ amount: number; approvedCount: number; eligibleCount: number; pendingCount: number } | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;

    const riderData = await resolveRider(
      profile.id,
      profile.mobile,
      'id, full_name, mobile, zone, vehicle_type, vehicle_number, is_active, profile_photo_url'
    );

    if (!riderData) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setRider(riderData);
    setRiderId(riderData.id);

    const todayStr = todayISTString();
    const currentMonth = getCurrentMonthIST();
    const { monthStart, nextMonth, monthStartISO, nextMonthISO } = getMonthRangeIST(currentMonth);

    const [todayAttendRes, locRes] = await Promise.all([
      supabase
        .from('rider_attendance')
        .select('status, check_in_time')
        .eq('rider_id', riderData.id)
        .eq('date', todayStr)
        .maybeSingle(),
      supabase
        .from('attendance_locations')
        .select('id, name, latitude, longitude, radius_meters')
        .eq('is_active', true),
    ]);

    setTodayAttendance(todayAttendRes.data ?? null);
    setAttendanceLocations((locRes.data ?? []) as any[]);

    const [rankRes, topRankingsRes, incentivesRes, evaluationsRes, referralsRes, referralConfigRes] = await Promise.all([
      supabase.from('rider_monthly_rankings').select('rank_position, score, on_time_attendance_days, on_time_delivery_days, total_earned, deliveries, present_days, absent_days').eq('rider_id', riderData.id).eq('month', currentMonth).maybeSingle(),
      supabase.from('rider_monthly_rankings').select('rider_id, rank_position, score, deliveries, present_days, total_earned').eq('month', currentMonth).order('rank_position', { ascending: true }).limit(3),
      supabase.from('rider_incentives').select('id, name, amount, type, evaluation_basis, bonus_category').eq('is_active', true),
      supabase.from('rider_incentive_evaluations').select('incentive_id, status, earned_amount').eq('rider_id', riderData.id).eq('month', currentMonth),
      supabase.from('rider_referrals').select('id, approval_status, reward_amount, completed_delivery_days, required_delivery_days, referred_name, referred_mobile').eq('referrer_rider_id', riderData.id),
      supabase.from('referral_config').select('reward_amount, required_completion_days').eq('is_active', true).order('created_at').limit(1).maybeSingle(),
    ]);

    const myRanking = rankRes.data as any;
    const onTimeAttendCount = Number(myRanking?.on_time_attendance_days ?? 0);
    const onTimeDeliverCount = Number(myRanking?.on_time_delivery_days ?? 0);

    const referralRows = (referralsRes.data ?? []) as any[];
    const refConfig = referralConfigRes.data as any;
    const refRewardAmount = Number(refConfig?.reward_amount ?? 0);
    const approvedReferrals = referralRows.filter((r) => r.approval_status === 'approved');
    const eligibleReferrals = referralRows.filter((r) => r.approval_status === 'eligible');
    const pendingReferrals = referralRows.filter((r) => r.approval_status === 'pending');
    const approvedReferralTotal = approvedReferrals.reduce((sum, r) => sum + Number(r.reward_amount ?? refRewardAmount), 0);
    const approvedCount = approvedReferrals.length;
    const eligibleCount = eligibleReferrals.length;
    const pendingCount = pendingReferrals.length;
    setReferralBonus({
      amount: refRewardAmount,
      approvedCount,
      eligibleCount,
      pendingCount,
    });

    setOnTimeAttendance(onTimeAttendCount);
    setOnTimeDelivery(onTimeDeliverCount);
    setMetrics({
      deliveries: Number(myRanking?.deliveries ?? 0),
      present: Number(myRanking?.present_days ?? 0),
      absent: Number(myRanking?.absent_days ?? 0),
    });

    const evaluationMap = new Map<string, { status: string; earned_amount: number }>();
    (evaluationsRes.data ?? []).forEach((evaluation: any) => {
      evaluationMap.set(evaluation.incentive_id, {
        status: evaluation.status,
        earned_amount: Number(evaluation.earned_amount ?? 0),
      });
    });

    const breakdown = ((incentivesRes.data ?? []) as any[]).map((incentive: any): BonusBreakdown | null => {
      const amount = Number(incentive.amount ?? 0);
      const basis = incentive.evaluation_basis ?? incentive.type;
      const category = incentive.bonus_category;
      const evaluation = evaluationMap.get(incentive.id);
      let eligibleCount = 0;
      let unitLabel = basis === 'per_day' ? 'days' : 'month';

      if (category === 'on_time_attendance') {
        eligibleCount = onTimeAttendCount;
        unitLabel = 'days';
      } else if (category === 'on_time_delivery') {
        eligibleCount = onTimeDeliverCount;
        unitLabel = 'days';
      } else if (evaluation?.status === 'passed' && amount > 0) {
        eligibleCount = basis === 'per_day'
          ? Math.round(evaluation.earned_amount / amount)
          : 1;
      }

      if (eligibleCount <= 0 || amount <= 0) return null;
      return {
        id: incentive.id,
        name: incentive.name,
        eligibleCount,
        amount,
        total: eligibleCount * amount,
        unitLabel,
      };
    }).filter((entry): entry is BonusBreakdown => entry !== null);

    if (approvedCount > 0 && approvedReferralTotal > 0) {
      breakdown.push({
        id: 'referral-approved',
        name: 'Refer Rider Bonus',
        eligibleCount: approvedCount,
        amount: approvedCount > 0 ? Math.round(approvedReferralTotal / approvedCount) : refRewardAmount,
        total: approvedReferralTotal,
        unitLabel: 'referrals',
      });
    }
    setBonusBreakdown(breakdown);

    const rankingRows = (topRankingsRes.data ?? []) as any[];
    if (rankingRows.length > 0) {
      const riderIds = rankingRows.map((entry: any) => entry.rider_id);
      const { data: riderNames } = await supabase.from('riders').select('id, full_name, profile_photo_url').in('id', riderIds);
      const riderMap = new Map<string, { full_name: string; profile_photo_url: string | null }>();
      (riderNames ?? []).forEach((entry: any) => riderMap.set(entry.id, { full_name: entry.full_name, profile_photo_url: entry.profile_photo_url ?? null }));
      setRankings(rankingRows.map((entry: any) => ({
        rider_id: entry.rider_id,
        rider_name: riderMap.get(entry.rider_id)?.full_name ?? 'Rider',
        rank_position: entry.rank_position,
        score: Number(entry.score ?? 0),
        deliveries: entry.deliveries ?? 0,
        present_days: entry.present_days ?? 0,
        total_earned: Number(entry.total_earned ?? 0),
        profile_photo_url: riderMap.get(entry.rider_id)?.profile_photo_url ?? null,
        is_self: entry.rider_id === riderData.id,
      })));
    } else {
      setRankings([]);
    }

    setLoading(false);
    setRefreshing(false);
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (hasRedirectedRef.current) return;
    if (loading || todayAttendance === undefined || !riderId) return;
    // Don't navigate until the root navigator has finished settling into
    // this screen. Firing router.replace here while the root layout is
    // still navigating into /(rider) races two navigations in the same
    // tick, which crashed release builds with "Maximum update depth
    // exceeded" (React Navigation's screen-options cleanup cascading into
    // an unmount/remount loop).
    if (!rootNavigationState?.key) return;
    if (todayAttendance?.status === 'present') {
      hasRedirectedRef.current = true;
      router.replace('/(rider)/assignments');
      return;
    }
    if (rankingPromptCheckedRef.current) return;
    rankingPromptCheckedRef.current = true;
    const key = `rider-ranking-prompt:${riderId}:${todayISTString()}`;
    AsyncStorage.getItem(key)
      .then((shown) => { if (shown !== 'shown') setShowRankingModal(true); })
      .catch(() => setShowRankingModal(true));
  }, [loading, todayAttendance, riderId, router, rootNavigationState?.key]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleCheckIn = async () => {
    if (!riderId) return;
    setGeoError('');
    setCheckingIn(true);
    try {
      const { coordinates, matchedLocation } = await performAttendanceCheckIn(attendanceLocations);

      const now = new Date().toISOString();
      const { error } = await supabase.from('rider_attendance').upsert(
        { rider_id: riderId, date: todayISTString(), status: 'present', check_in_time: now, check_in_location_id: matchedLocation.id, check_in_latitude: coordinates.latitude, check_in_longitude: coordinates.longitude },
        { onConflict: 'rider_id,date' }
      );
      if (error) {
        setGeoError('Could not save your attendance. Please check your connection and try again.');
      } else {
        setTodayAttendance({ status: 'present', check_in_time: now });
      }
    } catch (err) {
      setGeoError(getCheckInErrorMessage(err));
    } finally {
      setCheckingIn(false);
    }
  };


  const renderPerformanceCard = () => {
    const perfStats = [
      { label: 'On-Time Attendance', value: onTimeAttendance, color: Colors.success, bg: Colors.successSurface },
      { label: 'On-Time Delivery', value: onTimeDelivery, color: ACCENT, bg: 'rgba(58,175,228,0.12)' },
      { label: 'Absent', value: metrics.absent, color: Colors.error, bg: Colors.errorSurface },
    ];
    return (
      <View style={isWeb ? wStyles.perfCard : mStyles.perfCard}>
        <View style={isWeb ? wStyles.perfCardHeader : mStyles.perfCardHeader}>
          <View style={isWeb ? wStyles.perfIconWrap : mStyles.perfIconWrap}>
            <Award size={isWeb ? 18 : 16} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={isWeb ? wStyles.perfTitle : mStyles.perfTitle}>This Month's Performance</Text>
          </View>
        </View>
        <View style={isWeb ? wStyles.perfStatsRow : mStyles.perfStatsRow}>
          {perfStats.map((stat, i) => (
            <View key={stat.label} style={[isWeb ? wStyles.perfStatItem : mStyles.perfStatItem, { backgroundColor: stat.bg }]}>
              <Text style={[isWeb ? wStyles.perfStatValue : mStyles.perfStatValue, { color: stat.color }]}>{stat.value}</Text>
              <Text style={isWeb ? wStyles.perfStatLabel : mStyles.perfStatLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
        {bonusBreakdown.length > 0 && (
          <View style={bonusStyles.container}>
            <View style={bonusStyles.headingRow}>
              <Text style={bonusStyles.heading}>Bonus breakdown</Text>
              <Text style={bonusStyles.total}>{`₹${bonusBreakdown.reduce((sum, bonus) => sum + bonus.total, 0).toLocaleString('en-IN')}`}</Text>
            </View>
            {bonusBreakdown.map((bonus) => (
              <View key={bonus.id} style={bonusStyles.row}>
                <Text style={bonusStyles.name} numberOfLines={1}>{bonus.name.replace(/ Bonus$/i, '')}</Text>
                <Text style={bonusStyles.calculation}>{`${bonus.eligibleCount} ${bonus.unitLabel} × ₹${bonus.amount.toLocaleString('en-IN')} = ₹${bonus.total.toLocaleString('en-IN')}`}</Text>
              </View>
            ))}
          </View>
        )}
        {referralBonus && (referralBonus.approvedCount > 0 || referralBonus.eligibleCount > 0 || referralBonus.pendingCount > 0) && (
          <View style={[bonusStyles.container, { backgroundColor: Colors.primarySurface, borderColor: Colors.primary + '22' }]}>
            <View style={bonusStyles.headingRow}>
              <Text style={[bonusStyles.heading, { color: Colors.primary }]}>Refer Rider Bonus</Text>
              {referralBonus.approvedCount > 0 ? (
                <Text style={[bonusStyles.total, { color: Colors.primary }]}>{`₹${(referralBonus.approvedCount * referralBonus.amount).toLocaleString('en-IN')}`}</Text>
              ) : (
                <Text style={[bonusStyles.total, { color: Colors.textTertiary }]}>₹0</Text>
              )}
            </View>
            <View style={bonusStyles.row}>
              <Text style={bonusStyles.name}>Approved</Text>
              <Text style={bonusStyles.calculation}>{`${referralBonus.approvedCount} referrals × ₹${referralBonus.amount.toLocaleString('en-IN')} = ₹${(referralBonus.approvedCount * referralBonus.amount).toLocaleString('en-IN')}`}</Text>
            </View>
            {referralBonus.eligibleCount > 0 && (
              <View style={bonusStyles.row}>
                <Text style={bonusStyles.name}>Eligible for Approval</Text>
                <Text style={[bonusStyles.calculation, { color: Colors.warning }]}>{`${referralBonus.eligibleCount} awaiting admin approval`}</Text>
              </View>
            )}
            {referralBonus.pendingCount > 0 && (
              <View style={bonusStyles.row}>
                <Text style={bonusStyles.name}>In Progress</Text>
                <Text style={[bonusStyles.calculation, { color: Colors.textTertiary }]}>{`${referralBonus.pendingCount} referrals · days being counted`}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderIncentivePlanCard = () => {
    const slabs = [
      { orders: 5, amount: 1000 },
      { orders: 10, amount: 2250 },
      { orders: 20, amount: 5000 },
      { orders: 50, amount: 15000 },
      { orders: 100, amount: 40000 },
    ];
    return (
      <View style={incentivePlanStyles.card}>
        <View style={incentivePlanStyles.cornerTop} />
        <View style={incentivePlanStyles.cornerBottom} />
        <View style={incentivePlanStyles.brandMark}>
          <Text style={incentivePlanStyles.brandWord}>33 crores</Text>
          <Text style={incentivePlanStyles.brandTagline}>PATH TO SPIRITUALITY</Text>
        </View>
        <Text style={incentivePlanStyles.title}>Incentive Plan for New Subscription</Text>
        <View style={incentivePlanStyles.titleUnderline} />
        <View style={incentivePlanStyles.slabList}>
          {slabs.map((slab) => (
            <View key={slab.orders} style={incentivePlanStyles.slabRow}>
              <Text style={incentivePlanStyles.bullet}>•</Text>
              <Text style={incentivePlanStyles.slabText}>{`${slab.orders} Orders - ₹${slab.amount.toLocaleString('en-IN')} /-`}</Text>
            </View>
          ))}
        </View>
        <View style={incentivePlanStyles.footer}>
          <TouchableOpacity onPress={() => router.push('/(rider)/terms')} activeOpacity={0.7}>
            <Text style={incentivePlanStyles.terms}>*T&C APPLY</Text>
          </TouchableOpacity>
          <Text style={incentivePlanStyles.website}>www.33crores.com</Text>
        </View>
      </View>
    );
  };

  const renderAttendanceCard = () => {
    const checkedIn = todayAttendance?.status === 'present';
    return (
      <View style={isWeb ? wStyles.attendanceCard : mStyles.attendanceCard}>
        <View style={isWeb ? wStyles.attendanceHeader : mStyles.attendanceHeader}>
          <View style={isWeb ? wStyles.attendanceIconWrap : mStyles.attendanceIconWrap}>
            <Navigation size={18} color={ACCENT} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={isWeb ? wStyles.attendanceTitle : mStyles.attendanceTitle}>Today's Attendance</Text>
            <Text style={isWeb ? wStyles.attendanceDate : mStyles.attendanceDate}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
          </View>
          {checkedIn && (
            <View style={isWeb ? wStyles.attendanceBadge : mStyles.attendanceBadge}>
              <Text style={isWeb ? wStyles.attendanceBadgeText : mStyles.attendanceBadgeText}>Present</Text>
            </View>
          )}
        </View>

        {checkedIn && todayAttendance?.check_in_time && (
          <View style={isWeb ? wStyles.attendanceTimeRow : mStyles.attendanceTimeRow}>
            <Clock size={12} color={Colors.textTertiary} strokeWidth={1.8} />
            <Text style={isWeb ? wStyles.attendanceTimeText : mStyles.attendanceTimeText}>
              Checked in at {format(new Date(todayAttendance.check_in_time), 'hh:mm a')}
            </Text>
          </View>
        )}

        {!checkedIn && attendanceLocations.length > 0 && (
          <View style={isWeb ? wStyles.locationsList : mStyles.locationsList}>
            {attendanceLocations.map((loc) => (
              <View key={loc.id} style={isWeb ? wStyles.locationItem : mStyles.locationItem}>
                <Radio size={11} color={Colors.primary} strokeWidth={1.8} />
                <Text style={isWeb ? wStyles.locationItemText : mStyles.locationItemText}>{loc.name} · {loc.radius_meters}m radius</Text>
              </View>
            ))}
          </View>
        )}

        {!!geoError && (
          <View style={isWeb ? wStyles.geoErrorBox : mStyles.geoErrorBox}>
            <MapPin size={13} color={Colors.error} strokeWidth={1.8} />
            <Text style={isWeb ? wStyles.geoErrorText : mStyles.geoErrorText}>{geoError}</Text>
          </View>
        )}

        {!checkedIn && (
          <TouchableOpacity
            style={[isWeb ? wStyles.checkInBtn : mStyles.checkInBtn, checkingIn && { backgroundColor: Colors.neutral[300] }]}
            onPress={handleCheckIn}
            disabled={checkingIn}
            activeOpacity={0.85}
          >
            {checkingIn
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <Navigation size={15} color={Colors.white} strokeWidth={2} />}
            <Text style={isWeb ? wStyles.checkInBtnText : mStyles.checkInBtnText}>
              {checkingIn ? 'Getting Location...' : 'Mark Attendance'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const statusIcon = (status: string) => {
    if (status === 'delivered') return <PackageCheck size={16} color={Colors.success} strokeWidth={1.8} />;
    if (status === 'failed') return <AlertCircle size={16} color={Colors.error} strokeWidth={1.8} />;
    return <Loader size={16} color={Colors.warning} strokeWidth={1.8} />;
  };

  const metricCards = [
    { label: 'Deliveries', value: metrics.deliveries, icon: PackageCheck, color: ACCENT, bg: 'rgba(58,175,228,0.12)', filter: 'delivered' },
    { label: 'Present', value: metrics.present, icon: CircleCheck, color: Colors.success, bg: Colors.successSurface, filter: '' },
    { label: 'Absent', value: metrics.absent, icon: CircleX, color: Colors.error, bg: Colors.errorSurface, filter: '' },
  ];

  const closeRankingModal = async () => {
    setShowRankingModal(false);
    if (riderId) await AsyncStorage.setItem(`rider-ranking-prompt:${riderId}:${todayISTString()}`, 'shown');
  };

  const renderRankingModal = () => (
    <Modal visible={showRankingModal} transparent animationType="fade" onRequestClose={closeRankingModal}>
      <View style={rankingModalStyles.overlay}>
        <View style={rankingModalStyles.container}>
          <View style={rankingModalStyles.header}>
            <View style={rankingModalStyles.headerIcon}><Trophy size={18} color={Colors.white} strokeWidth={2} /></View>
            <View style={{ flex: 1 }}>
              <Text style={rankingModalStyles.title}>Rider Ranking</Text>
              <Text style={rankingModalStyles.subtitle}>Top 3 riders · {format(new Date(), 'MMMM yyyy')}</Text>
            </View>
          </View>
          <ScrollView style={rankingModalStyles.body} showsVerticalScrollIndicator={false}>
            {rankings.length === 0 ? (
              <View style={rankingModalStyles.empty}>
                <Award size={28} color={Colors.textTertiary} strokeWidth={1.5} />
                <Text style={rankingModalStyles.emptyText}>Rankings will appear after this month's performance is calculated.</Text>
              </View>
            ) : rankings.map((entry, index) => {
              const meta = entry.rank_position === 1
                ? { label: 'Gold', color: '#B77900', bg: '#FFF8E1', border: '#FFD166' }
                : entry.rank_position === 2
                  ? { label: 'Silver', color: '#607D8B', bg: '#ECEFF1', border: '#B0BEC5' }
                  : { label: 'Bronze', color: '#9A5635', bg: '#FBE9E7', border: '#E6A28B' };
              const isFirst = entry.rank_position === 1;
              return (
                <View key={entry.rider_id} style={[rankingModalStyles.row, isFirst && rankingModalStyles.firstRow, entry.is_self && rankingModalStyles.selfRow, index < rankings.length - 1 && rankingModalStyles.rowBorder]}>
                  <View style={[rankingModalStyles.medal, { backgroundColor: meta.bg, borderColor: meta.border }, isFirst && rankingModalStyles.firstMedal]}>
                    {isFirst ? <Crown size={18} color={meta.color} strokeWidth={2.2} /> : <Medal size={14} color={meta.color} strokeWidth={2.2} />}
                    <Text style={[rankingModalStyles.medalText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  {entry.profile_photo_url ? <Image source={{ uri: entry.profile_photo_url }} style={[rankingModalStyles.photo, isFirst && rankingModalStyles.firstPhoto]} /> : <View style={[rankingModalStyles.photo, isFirst && rankingModalStyles.firstPhoto, { backgroundColor: meta.bg }]}><Text style={[rankingModalStyles.initial, { color: meta.color }]}>{entry.rider_name.charAt(0).toUpperCase()}</Text></View>}
                  <View style={rankingModalStyles.info}>
                    <View style={rankingModalStyles.nameRow}><Text style={rankingModalStyles.name} numberOfLines={1}>{entry.rider_name}</Text>{entry.is_self && <View style={rankingModalStyles.youBadge}><Text style={rankingModalStyles.youText}>You</Text></View>}</View>
                    <View style={rankingModalStyles.stats}><Text style={[rankingModalStyles.stat, { color: meta.color, backgroundColor: `${meta.color}18` }]}>{entry.deliveries} deliveries</Text><Text style={[rankingModalStyles.stat, { color: meta.color, backgroundColor: `${meta.color}18` }]}>{entry.present_days} present</Text>{entry.total_earned > 0 && <Text style={[rankingModalStyles.stat, { color: Colors.success, backgroundColor: Colors.successSurface }]}>{`₹${entry.total_earned.toLocaleString('en-IN')} earned`}</Text>}</View>
                  </View>
                  <View style={rankingModalStyles.score}><Text style={[rankingModalStyles.scoreValue, { color: meta.color }]}>{Math.round(entry.score)}</Text><Text style={rankingModalStyles.scoreLabel}>points</Text></View>
                </View>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={rankingModalStyles.closeButton} onPress={closeRankingModal} activeOpacity={0.85}><Text style={rankingModalStyles.closeText}>Continue to Attendance</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  if (isWeb) {
    return (
      <>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#EEF2F5' }}
        contentContainerStyle={wStyles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <LinearGradient
          colors={[GRADIENT_TOP, GRADIENT_MID, GRADIENT_BOT]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={wStyles.gradientHeader}
        >
          <View style={wStyles.headerInner}>
            <View style={wStyles.headerLeft}>
              {rider?.profile_photo_url ? (
                <Image source={{ uri: rider.profile_photo_url }} style={wStyles.headerPhoto} />
              ) : (
                <View style={wStyles.headerIconWrap}>
                  <Text style={wStyles.headerIconText}>{rider ? rider.full_name[0].toUpperCase() : 'R'}</Text>
                </View>
              )}
              <View>
                <Text style={wStyles.headerTitle}>{rider ? rider.full_name : 'Dashboard'}</Text>
                <Text style={wStyles.headerDate}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        {!rider && !loading && (
          <View style={wStyles.noProfileCard}>
            <Bike size={36} color={Colors.textTertiary} strokeWidth={1.5} />
            <Text style={wStyles.noProfileTitle}>No rider profile linked</Text>
            <Text style={wStyles.noProfileSub}>Your account is not yet associated with a rider profile. Please contact the admin team.</Text>
          </View>
        )}

        {rider && (
          <View style={wStyles.body}>
            {/* Performance section */}
            {!loading && renderPerformanceCard()}

            {/* Attendance check-in card */}
            {!loading && todayAttendance !== undefined && renderAttendanceCard()}

            {/* Monthly incentive plan */}
            {!loading && renderIncentivePlanCard()}

          </View>
        )}

        {renderRankingModal()}
      </ScrollView>
      </>
    );
  }

  return (
    <View style={mStyles.container}>

      <LinearGradient
        colors={[GRADIENT_TOP, GRADIENT_MID, GRADIENT_BOT]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[mStyles.gradientHeader, { paddingTop: insets.top + Spacing[3] }]}
      >
        <View style={mStyles.headerTopRow}>
          <View style={mStyles.headerLeft}>
            {rider?.profile_photo_url ? (
              <Image source={{ uri: rider.profile_photo_url }} style={mStyles.headerPhoto} />
            ) : (
              <View style={mStyles.bikeIconWrap}>
                <Text style={mStyles.bikeIconText}>{rider ? rider.full_name[0].toUpperCase() : 'R'}</Text>
              </View>
            )}
            <View>
              <Text style={mStyles.headerTitle} numberOfLines={1}>{rider ? rider.full_name : 'Dashboard'}</Text>
            </View>
          </View>
        </View>

        <Text style={mStyles.dateText}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[mStyles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      >
        {!rider && !loading && (
          <View style={mStyles.noProfileCard}>
            <Bike size={28} color={Colors.textTertiary} strokeWidth={1.5} />
            <Text style={mStyles.noProfileText}>No rider profile linked. Contact admin.</Text>
          </View>
        )}

        {rider && (
          <>
            {/* Performance section */}
            {!loading && renderPerformanceCard()}

            {/* Attendance check-in card */}
            {!loading && todayAttendance !== undefined && renderAttendanceCard()}

            {/* Monthly incentive plan */}
            {!loading && renderIncentivePlanCard()}

          </>
        )}
      </ScrollView>
      {renderRankingModal()}
    </View>
  );
}

const mStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EEF2F5' },
  gradientHeader: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[5],
    gap: Spacing[3],
  },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], flex: 1 },
  bikeIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  bikeIconText: {
    fontFamily: Typography.fontFamily.bold, fontSize: 18, color: ACCENT,
  },
  headerPhoto: {
    width: 40, height: 40, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerEyebrow: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'], color: '#FFFFFF', letterSpacing: -0.3,
  },
  riderRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.lg, padding: Spacing[3],
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  riderAvatarSmall: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: `rgba(58,175,228,0.3)`,
    alignItems: 'center', justifyContent: 'center',
  },
  riderAvatarText: {
    fontFamily: Typography.fontFamily.bold, fontSize: 16, color: ACCENT,
  },
  riderContact: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: 'rgba(255,255,255,0.9)',
  },
  riderZone: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.55)',
  },
  activePill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full,
  },
  activePillText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11,
  },
  dateText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.3,
  },
  scrollContent: { padding: Spacing[4], gap: Spacing[4] },
  noProfileCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: Spacing[6],
    alignItems: 'center', gap: Spacing[3], borderWidth: 1, borderColor: Colors.border,
  },
  noProfileText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center',
  },
  metricsGrid: { flexDirection: 'row', gap: Spacing[2] },
  metricCard: {
    flex: 1, borderRadius: Radius.lg, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
    flexDirection: 'row',
  },
  metricAccentBar: {
    width: 4, borderTopLeftRadius: Radius.lg, borderBottomLeftRadius: Radius.lg,
  },
  metricCardInner: {
    flex: 1, padding: Spacing[4], gap: Spacing[2],
  },
  metricIconWrap: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  metricValue: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], letterSpacing: -0.5,
  },
  metricLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs,
    color: Colors.textTertiary, letterSpacing: 0.2,
  },
  section: { gap: Spacing[3] },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  sectionTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  sectionCountBadge: {
    backgroundColor: 'rgba(58,175,228,0.12)', borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  sectionCountText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: ACCENT,
  },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  seeAllText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: ACCENT,
  },
  pickupCountBadge: {
    backgroundColor: '#e0f2fe', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  pickupCountText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 12, color: '#0891b2',
  },
  pickupStatusBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full,
  },
  pickupStatusText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11,
  },
  listCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  listRow: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing[4],
    borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: Spacing[3],
  },
  listRowLast: { borderBottomWidth: 0 },
  listIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.neutral[50],
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  listInfo: { flex: 1, gap: 2 },
  listPrimary: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm, color: Colors.textPrimary,
  },
  listSecondary: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  deliverySectionLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 11, color: Colors.textTertiary,
    letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: Spacing[2],
  },
  deliveryRow: { flexDirection: 'row', gap: Spacing[3] },
  deliveryCard: {
    flex: 1, borderRadius: Radius.lg, backgroundColor: Colors.white,
    padding: Spacing[4], borderWidth: 1, gap: Spacing[2], ...Shadow.sm,
  },
  deliveryCardToday: { borderColor: 'rgba(22,163,74,0.3)', borderLeftWidth: 3, borderLeftColor: Colors.success },
  deliveryCardTomorrow: { borderColor: 'rgba(37,99,235,0.3)', borderLeftWidth: 3, borderLeftColor: '#2563EB' },
  deliveryIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  deliveryCount: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['3xl'], letterSpacing: -0.5,
  },
  deliveryLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  // Performance card
  perfCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: Spacing[4],
    borderWidth: 1, borderColor: Colors.border, gap: Spacing[3], ...Shadow.sm,
  },
  perfCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  perfIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center',
  },
  perfTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  perfSub: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2,
  },
  perfAmountBadge: {
    backgroundColor: Colors.successSurface, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4,
  },
  perfAmountText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.success,
  },
  perfStatsRow: { flexDirection: 'row', gap: Spacing[2] },
  perfStatItem: {
    flex: 1, borderRadius: Radius.md, padding: Spacing[3], alignItems: 'center', gap: 4,
  },
  perfStatValue: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, letterSpacing: -0.3,
  },
  perfStatLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary,
  },
  perfIncentiveList: { gap: Spacing[1], borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: Spacing[2] },
  perfIncentiveItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  perfIncentiveName: {
    flex: 1, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textPrimary,
  },
  perfIncentiveAmt: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.success,
  },
  // Incentive card
  incentiveCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: Spacing[4],
    borderWidth: 1, borderColor: Colors.border, gap: Spacing[3], ...Shadow.sm,
  },
  incentiveHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  incentiveIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center',
  },
  incentiveTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  incentiveSub: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2,
  },
  incentiveTotal: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.success,
  },
  incentiveList: { gap: Spacing[2] },
  incentiveItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  incentiveItemName: {
    flex: 1, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary,
  },
  incentiveItemAmount: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.success,
  },
  // Attendance card
  attendanceCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: Spacing[4],
    borderWidth: 1, borderColor: Colors.border, gap: Spacing[3], ...Shadow.sm,
  },
  attendanceHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  attendanceIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(58,175,228,0.12)', alignItems: 'center', justifyContent: 'center',
  },
  attendanceTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  attendanceDate: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2,
  },
  attendanceBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, backgroundColor: Colors.successSurface,
  },
  attendanceBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.success },
  attendanceTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  attendanceTimeText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary,
  },
  locationsList: { gap: 4 },
  locationItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationItemText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  geoErrorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: Colors.errorSurface, borderRadius: Radius.md, padding: 10,
  },
  geoErrorText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.error, flex: 1, lineHeight: 18,
  },
  checkInBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    paddingVertical: 13, minHeight: 48,
  },
  checkInBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white,
  },
});

const wStyles = StyleSheet.create({
  content: { paddingBottom: 64, gap: 0 },
  gradientHeader: { paddingBottom: 0 },
  headerInner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 32, paddingTop: 32, paddingBottom: 20,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  headerIconWrap: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerIconText: {
    fontFamily: Typography.fontFamily.bold, fontSize: 24, color: ACCENT,
  },
  headerPhoto: {
    width: 52, height: 52, borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerEyebrow: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 11,
    color: 'rgba(255,255,255,0.55)', letterSpacing: 1, textTransform: 'uppercase',
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold, fontSize: 30,
    color: '#FFFFFF', letterSpacing: -0.5, marginTop: 2,
  },
  headerDate: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.5)', marginTop: 3,
  },
  profileCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginHorizontal: 32, marginBottom: 28,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: Radius.lg,
    padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  profileLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarCircle: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: `rgba(58,175,228,0.25)`, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: Typography.fontFamily.bold, fontSize: 22, color: ACCENT },
  profileName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: '#FFFFFF' },
  profileMeta: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  profileCity: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.45)', marginTop: 1 },
  statsRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  statItem: { alignItems: 'center', gap: 2 },
  statDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.2)' },
  statValue: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'],
    color: '#FFFFFF', letterSpacing: -0.3,
  },
  statLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.55)',
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusPillText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 13 },
  noProfileCard: {
    margin: 32,
    backgroundColor: Colors.white, borderRadius: 20, padding: 40,
    alignItems: 'center', gap: 12, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  noProfileTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary,
  },
  noProfileSub: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
    textAlign: 'center', maxWidth: 400,
  },
  body: { padding: 32, gap: 24 },
  metricsGrid: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  metricCard: {
    flex: 1, minWidth: 160, backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: 20, borderWidth: 1, borderColor: Colors.border, gap: 8, ...Shadow.sm,
    cursor: 'pointer' as any,
  },
  metricIconWrap: {
    width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
  },
  metricValue: {
    fontFamily: Typography.fontFamily.bold, fontSize: 26, color: Colors.textPrimary, letterSpacing: -0.3,
  },
  metricLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
  },
  deliverySection: { gap: 10 },
  deliverySectionLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 11, color: Colors.textTertiary,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  deliveryRow: { flexDirection: 'row', gap: 16 },
  deliveryCard: {
    flex: 1, borderRadius: Radius.lg, backgroundColor: Colors.white,
    padding: 20, borderWidth: 1, gap: 10, ...Shadow.sm,
    cursor: 'pointer' as any,
  },
  deliveryCardToday: { borderColor: 'rgba(22,163,74,0.25)', borderLeftWidth: 4, borderLeftColor: Colors.success },
  deliveryCardTomorrow: { borderColor: 'rgba(37,99,235,0.25)', borderLeftWidth: 4, borderLeftColor: '#2563EB' },
  deliveryIconWrap: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  deliveryCount: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 32, letterSpacing: -0.5,
  },
  deliveryLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm, color: Colors.textTertiary,
  },
  tableCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  tableHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tableTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  tableHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 11,
    backgroundColor: Colors.neutral[50],
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  thCell: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11,
    color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.neutral[50],
    minHeight: 52,
  },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  tdCell: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary,
    paddingRight: 8,
  },
  emptyState: { paddingVertical: 40, alignItems: 'center', gap: 10 },
  emptyText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
  },
  // Performance card (web)
  perfCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: Colors.border, gap: 16, ...Shadow.sm,
  },
  perfCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  perfIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center',
  },
  perfTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  perfSub: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2,
  },
  perfAmountBadge: {
    backgroundColor: Colors.successSurface, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 5,
  },
  perfAmountText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 12, color: Colors.success,
  },
  perfStatsRow: { flexDirection: 'row', gap: 10 },
  perfStatItem: {
    flex: 1, borderRadius: Radius.md, padding: 14, alignItems: 'center', gap: 6,
  },
  perfStatValue: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], letterSpacing: -0.3,
  },
  perfStatLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary,
  },
  perfIncentiveList: { gap: 6, borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: 12 },
  perfIncentiveItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  perfIncentiveName: {
    flex: 1, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary,
  },
  perfIncentiveAmt: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.success,
  },
  // Incentive card (web)
  incentiveCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: Colors.border, gap: Spacing[3], ...Shadow.sm,
  },
  incentiveHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  incentiveIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center',
  },
  incentiveTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  incentiveSub: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2,
  },
  incentiveTotal: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.success,
  },
  incentiveList: { gap: Spacing[2] },
  incentiveItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  incentiveItemName: {
    flex: 1, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary,
  },
  incentiveItemAmount: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.success,
  },
  // Attendance card (web)
  attendanceCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: Colors.border, gap: Spacing[3], ...Shadow.sm,
  },
  attendanceHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  attendanceIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(58,175,228,0.12)', alignItems: 'center', justifyContent: 'center',
  },
  attendanceTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  attendanceDate: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2,
  },
  attendanceBadge: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.successSurface,
  },
  attendanceBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 12, color: Colors.success },
  attendanceTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  attendanceTimeText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary,
  },
  locationsList: { gap: 4 },
  locationItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationItemText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  geoErrorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: Colors.errorSurface, borderRadius: Radius.md, padding: 10,
  },
  geoErrorText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.error, flex: 1, lineHeight: 18,
  },
  checkInBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    paddingVertical: 12, minHeight: 46, alignSelf: 'flex-start', paddingHorizontal: 20,
  },
  checkInBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white,
  },
});

const rankingModalStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  container: {
    backgroundColor: Colors.white, borderRadius: 20, overflow: 'hidden',
    width: '100%', maxWidth: 420, ...Shadow.lg,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    paddingHorizontal: Spacing[5], paddingVertical: Spacing[4],
    backgroundColor: GRADIENT_TOP,
  },
  headerIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.6)', marginTop: 2,
  },
  body: { maxHeight: 380, padding: Spacing[2] },
  empty: { paddingVertical: Spacing[6], alignItems: 'center', gap: Spacing[3] },
  emptyText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 280,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[3], paddingVertical: Spacing[3], gap: Spacing[3],
    borderRadius: 12,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  selfRow: { backgroundColor: '#EBF5FF' },
  firstRow: { paddingVertical: Spacing[4], backgroundColor: '#FFFDF5' },
  medal: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, flexShrink: 0, gap: 1,
  },
  firstMedal: { width: 50, height: 50, borderRadius: 25, borderWidth: 2 },
  medalText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 9, letterSpacing: 0.5 },
  photo: { width: 40, height: 40, borderRadius: 20, flexShrink: 0 },
  firstPhoto: { width: 48, height: 48, borderRadius: 24 },
  initial: { fontFamily: Typography.fontFamily.bold, fontSize: 16 },
  info: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary, flexShrink: 1 },
  youBadge: { backgroundColor: Colors.primarySurface, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 1 },
  youText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 9, color: Colors.primary },
  stats: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  stat: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 10, paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  score: { alignItems: 'center', flexShrink: 0 },
  scoreValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, letterSpacing: -0.3 },
  scoreLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 9, color: Colors.textTertiary, marginTop: 1 },
  closeButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, marginHorizontal: Spacing[4], marginBottom: Spacing[4],
  },
  closeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
});

const bonusStyles = StyleSheet.create({
  container: {
    marginTop: Spacing[3], padding: Spacing[3], gap: Spacing[2],
    backgroundColor: Colors.successSurface, borderRadius: Radius.md,
  borderWidth: 1, borderColor: Colors.success + '22',
  },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.success, letterSpacing: 0.3 },
  total: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm, color: Colors.success },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontFamily: Typography.fontFamily.sansMedium, fontSize: 11, color: Colors.textSecondary },
  calculation: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.textPrimary },
});

const incentivePlanStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8B4B4',
    overflow: 'hidden',
    position: 'relative',
  },
  cornerTop: {
    position: 'absolute', top: -28, right: -28,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#FDE8E8',
  },
  cornerBottom: {
    position: 'absolute', bottom: -28, left: -28,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#FDE8E8',
  },
  brandMark: {
    alignItems: 'center', paddingTop: 16, paddingBottom: 8, gap: 2,
  },
  brandWord: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 18, color: '#C53030', letterSpacing: 0.5,
  },
  brandTagline: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 8, color: '#C53030', letterSpacing: 2, textTransform: 'uppercase',
  },
  title: {
    textAlign: 'center',
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 13, color: Colors.textPrimary,
    marginTop: 4, paddingHorizontal: 20,
  },
  titleUnderline: {
    width: 50, height: 2, backgroundColor: '#C53030',
    alignSelf: 'center', marginTop: 6, borderRadius: 1,
  },
  slabList: {
    paddingHorizontal: 20, paddingVertical: 14, gap: 10,
  },
  slabRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
  },
  bullet: {
    fontSize: 14, color: '#C53030', lineHeight: 18, fontWeight: 'bold',
  },
  slabText: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: 13, color: Colors.textPrimary, lineHeight: 18,
  },
  footer: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 14, paddingTop: 4,
  },
  terms: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 9, color: Colors.textTertiary, letterSpacing: 0.5,
  },
  website: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 9, color: '#C53030',
  },
});
