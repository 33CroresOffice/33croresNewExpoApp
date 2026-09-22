import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const GRADIENT_TOP = '#1A2E3A';
const GRADIENT_MID = '#1E3D50';
const GRADIENT_BOT = '#235068';
const ACCENT = '#3AAFE4';
import {
  LogOut,
  Bike,
  Phone,
  Mail,
  MapPin,
  FileText,
  CircleDollarSign,
  ShieldCheck,
  User,
  BadgeCheck,
  Wallet,
  Trophy,
  Award,
  Crown,
  Medal,
  Gift,
  Share2,
} from 'lucide-react-native';
import { Share } from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format } from 'date-fns';
import StatusChip from '@/components/ui/StatusChip';
import { resolveRider } from '@/utils/riderLookup';
import { getCurrentMonthIST } from '@/utils/riderPeriod';

interface RiderProfile {
  id: string;
  full_name: string;
  mobile: string;
  alternate_mobile: string | null;
  email: string | null;
  vehicle_type: string | null;
  vehicle_number: string | null;
  license_number: string | null;
  zone: string | null;
  is_active: boolean;
  joining_date: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_mobile: string | null;
  monthly_salary: number | null;
  per_delivery_rate: number | null;
  profile_photo_url: string | null;
}

interface RankEntry {
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

interface Payout {
  id: string;
  period_start: string;
  period_end: string;
  total_deliveries: number;
  final_amount: number;
  status: string;
  payment_method: string | null;
  paid_at: string | null;
}

interface ReferralConfig {
  title: string;
  reward_amount: number;
  required_completion_days: number;
  is_active: boolean;
}

export default function RiderProfile() {
  const insets = useSafeAreaInsets();
  const { profile, signOut } = useAuthStore();
  const isWeb = Platform.OS === 'web';

  const [rider, setRider] = useState<RiderProfile | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [rankings, setRankings] = useState<RankEntry[]>([]);
  const [referralConfig, setReferralConfig] = useState<ReferralConfig | null>(null);
  const [monthlyEarned, setMonthlyEarned] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.id) return;

    const riderData = await resolveRider(
      profile.id,
      profile.mobile,
      'id, full_name, mobile, alternate_mobile, email, vehicle_type, vehicle_number, license_number, zone, is_active, joining_date, address, emergency_contact_name, emergency_contact_mobile, monthly_salary, per_delivery_rate, profile_photo_url'
    );

    if (riderData) {
      setRider(riderData as RiderProfile);

      const currentMonth = getCurrentMonthIST();

      const [payoutRes, rankRes, myRankRes, refConfigRes] = await Promise.all([
        supabase
          .from('rider_payouts')
          .select('id, period_start, period_end, total_deliveries, final_amount, status, payment_method, paid_at')
          .eq('rider_id', riderData.id)
          .order('period_start', { ascending: false })
          .limit(6),
        supabase
          .from('rider_monthly_rankings')
          .select('rider_id, rank_position, score, deliveries, present_days, total_earned')
          .eq('month', currentMonth)
          .order('rank_position', { ascending: true })
          .limit(3),
        supabase
          .from('rider_monthly_rankings')
          .select('total_earned')
          .eq('rider_id', riderData.id)
          .eq('month', currentMonth)
          .maybeSingle(),
        supabase.from('referral_config').select('*').eq('is_active', true).order('created_at').limit(1).maybeSingle(),
      ]);

      if (payoutRes.data) setPayouts(payoutRes.data as Payout[]);
      setReferralConfig((refConfigRes.data as any) ?? null);
      setMonthlyEarned(Number((myRankRes.data as any)?.total_earned ?? 0));
      if (rankRes.data && rankRes.data.length > 0) {
        const riderIds = (rankRes.data as any[]).map((r: any) => r.rider_id);
        const { data: riderNames } = await supabase
          .from('riders')
          .select('id, full_name, profile_photo_url')
          .in('id', riderIds);
        const riderMap = new Map<string, { full_name: string; profile_photo_url: string | null }>();
        (riderNames ?? []).forEach((r: any) => riderMap.set(r.id, { full_name: r.full_name, profile_photo_url: r.profile_photo_url ?? null }));
        const entries: RankEntry[] = (rankRes.data as any[]).map((r: any) => ({
          rider_id: r.rider_id,
          rider_name: riderMap.get(r.rider_id)?.full_name ?? 'Rider',
          rank_position: r.rank_position,
          score: Number(r.score ?? 0),
          deliveries: r.deliveries ?? 0,
          present_days: r.present_days ?? 0,
          total_earned: Number(r.total_earned ?? 0),
          profile_photo_url: riderMap.get(r.rider_id)?.profile_photo_url ?? null,
          is_self: r.rider_id === riderData.id,
        }));
        setRankings(entries);
      } else {
        setRankings([]);
      }
    }

    setLoading(false);
    setRefreshing(false);
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  const currentMonth = format(new Date(), 'MMMM yyyy');

  const formatCurrency = (amt: number) =>
    `₹${amt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const totalEarned = monthlyEarned;

  const hasCompensation = rider !== null && [rider.monthly_salary, rider.per_delivery_rate]
    .some((value) => typeof value === 'number' && Number.isFinite(value) && value > 0);

  const RANK_META: Record<number, { label: string; color: string; bg: string; border: string; row: string }> = {
    1: { label: 'Gold', color: '#B77900', bg: '#FFF8E1', border: '#FFD166', row: '#FFFDF5' },
    2: { label: 'Silver', color: '#607D8B', bg: '#ECEFF1', border: '#B0BEC5', row: Colors.white },
    3: { label: 'Bronze', color: '#9A5635', bg: '#FBE9E7', border: '#E6A28B', row: Colors.white },
  };

  const renderRankingsSection = () => (
    <View style={mStyles.section}>
      <View style={mStyles.rankingsCard}>
        <LinearGradient
          colors={[GRADIENT_TOP, GRADIENT_MID]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={mStyles.rankingsHeader}
        >
          <View style={mStyles.rankingsHeaderIcon}>
            <Trophy size={15} color="#FFFFFF" strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={mStyles.rankingsTitle}>Rider Ranking</Text>
            <Text style={mStyles.rankingsSubtitle}>Top 3 · {currentMonth}</Text>
          </View>
        </LinearGradient>
        <View style={mStyles.rankingsBody}>
          {rankings.length === 0 ? (
            <View style={mStyles.rankingsEmpty}>
              <Award size={28} color={Colors.textTertiary} strokeWidth={1.5} />
              <Text style={mStyles.rankingsEmptyText}>Rankings will appear after this month's performance is calculated.</Text>
            </View>
          ) : rankings.map((entry, idx) => {
            const meta = RANK_META[entry.rank_position] ?? RANK_META[3] ?? { label: '#'+entry.rank_position, color: Colors.textTertiary, bg: Colors.neutral[100], border: Colors.border, row: Colors.white };
            const isFirst = entry.rank_position === 1;
            return (
              <View key={entry.rider_id} style={[
                mStyles.rankRow,
                isFirst && mStyles.rankRowFirst,
                idx < rankings.length - 1 && mStyles.rankRowBorder,
                entry.is_self && mStyles.rankRowSelf,
              ]}>
                <View style={[mStyles.rankMedal, { backgroundColor: meta.bg, borderColor: meta.border }, isFirst && mStyles.rankMedalFirst]}>
                  {isFirst ? (
                    <Crown size={18} color={meta.color} strokeWidth={2.2} />
                  ) : (
                    <Medal size={14} color={meta.color} strokeWidth={2.2} />
                  )}
                  <Text style={[mStyles.rankMedalText, { color: meta.color }]}>{meta.label}</Text>
                </View>
                {entry.profile_photo_url ? (
                  <Image source={{ uri: entry.profile_photo_url }} style={[mStyles.rankPhoto, isFirst && mStyles.rankPhotoFirst]} />
                ) : (
                  <View style={[mStyles.rankPhoto, isFirst && mStyles.rankPhotoFirst, { backgroundColor: meta.bg }]}>
                    <Text style={[mStyles.rankInitial, { color: meta.color }]}>{entry.rider_name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={mStyles.rankInfo}>
                  <View style={mStyles.rankNameRow}>
                    <Text style={mStyles.rankName} numberOfLines={1}>{entry.rider_name}</Text>
                    <View style={[mStyles.rankBadge, { backgroundColor: meta.bg, borderColor: meta.border }]}>
                      {isFirst ? (
                        <Crown size={9} color={meta.color} strokeWidth={2.2} />
                      ) : (
                        <Medal size={9} color={meta.color} strokeWidth={2.2} />
                      )}
                      <Text style={[mStyles.rankBadgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    {entry.is_self && <View style={mStyles.youBadge}><Text style={mStyles.youBadgeText}>You</Text></View>}
                  </View>
                  <View style={mStyles.rankStatsRow}>
                    <View style={[mStyles.rankStatPill, { backgroundColor: `${meta.color}18` }]}>
                      <Text style={[mStyles.rankStatText, { color: meta.color }]}>{entry.deliveries} del</Text>
                    </View>
                    <View style={[mStyles.rankStatPill, { backgroundColor: `${meta.color}18` }]}>
                      <Text style={[mStyles.rankStatText, { color: meta.color }]}>{entry.present_days} pres</Text>
                    </View>
                    {entry.total_earned > 0 && (
                      <View style={[mStyles.rankStatPill, { backgroundColor: Colors.successSurface }]}>
                        <Text style={[mStyles.rankStatText, { color: Colors.success }]}>{formatCurrency(entry.total_earned)}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={mStyles.rankScoreBlock}>
                  <Text style={[mStyles.rankScoreValue, { color: meta.color }]}>{Math.round(entry.score)}</Text>
                  <Text style={mStyles.rankScoreLabel}>pts</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );

  const renderInfoRow = (Icon: any, label: string, value: string | null, accent?: string) => {
    if (!value) return null;
    return (
      <View style={infoStyles.row}>
        <View style={[infoStyles.iconWrap, { backgroundColor: accent ? `${accent}18` : Colors.neutral[100] }]}>
          <Icon size={16} color={accent ?? Colors.textTertiary} strokeWidth={1.8} />
        </View>
        <View style={infoStyles.content}>
          <Text style={infoStyles.label}>{label}</Text>
          <Text style={infoStyles.value}>{value}</Text>
        </View>
      </View>
    );
  };

  const handleRefer = async () => {
    if (!rider) return;
    const msg = `🌸 Join 33 Crores as a Morning Delivery Rider! 🏍️

Looking for a part-time delivery job in Bhubaneswar?
💰 Salary: Starts from ₹8,000/month
⏰ Working Hours: Only 3 hours per day
🌅 Morning Delivery Work
📍 Location: Bhubaneswar
🏍️ Bike/Scooter required

Interested in joining the 33 Crores delivery team?
📞 Call / WhatsApp: 9776 888 887

Join us and earn with just a few hours of work every morning!

33 Crores – Fresh Flowers Delivered Every Morning 🌸`;
    try {
      await Share.share({ message: msg });
    } catch (_) {}
  };

  const renderReferralCard = () => {
    if (!referralConfig) return null;
    return (
      <View style={isWeb ? wStyles.referralCard : mStyles.referralCard}>
        <View style={isWeb ? wStyles.referralGlow : mStyles.referralGlow} />
        <View style={isWeb ? wStyles.referralTop : mStyles.referralTop}>
          <View style={isWeb ? wStyles.referralIconWrap : mStyles.referralIconWrap}>
            <Gift size={isWeb ? 22 : 20} color="#FFFFFF" strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={isWeb ? wStyles.referralTitle : mStyles.referralTitle}>{referralConfig.title}</Text>
            <Text style={isWeb ? wStyles.referralSub : mStyles.referralSub}>
              Refer a rider · Earn ₹{referralConfig.reward_amount.toLocaleString('en-IN')} when they complete {referralConfig.required_completion_days} delivery days
            </Text>
          </View>
          <View style={isWeb ? wStyles.referralAmountBadge : mStyles.referralAmountBadge}>
            <Text style={isWeb ? wStyles.referralAmountText : mStyles.referralAmountText}>
              ₹{referralConfig.reward_amount.toLocaleString('en-IN')}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={isWeb ? wStyles.referBtn : mStyles.referBtn}
          onPress={handleRefer}
          activeOpacity={0.85}
        >
          <Share2 size={isWeb ? 16 : 15} color="#FFFFFF" strokeWidth={2} />
          <Text style={isWeb ? wStyles.referBtnText : mStyles.referBtnText}>Refer a Rider</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const noProfile = !rider && !loading;

  if (isWeb) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: '#EEF2F5' }}
        contentContainerStyle={wStyles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <LinearGradient
          colors={[GRADIENT_TOP, GRADIENT_MID, GRADIENT_BOT]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={wStyles.gradientHeader}
        >
          <View style={wStyles.headerInner}>
            <View style={wStyles.headerLeft}>
              <View style={wStyles.headerIconWrap}>
                <User size={22} color={ACCENT} strokeWidth={1.8} />
              </View>
              <View>
                <Text style={wStyles.headerEyebrow}>Rider Portal</Text>
                <Text style={wStyles.headerTitle}>My Profile</Text>
                <Text style={wStyles.headerDate}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
              </View>
            </View>
            <TouchableOpacity style={wStyles.signOutBtn} onPress={signOut} activeOpacity={0.8}>
              <LogOut size={16} color='rgba(255,255,255,0.75)' strokeWidth={1.8} />
              <Text style={wStyles.signOutText}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {noProfile && (
          <View style={wStyles.noProfileCard}>
            <User size={36} color={Colors.textTertiary} strokeWidth={1.5} />
            <Text style={wStyles.noProfileTitle}>No rider profile linked</Text>
            <Text style={wStyles.noProfileSub}>Contact the admin team to link your account.</Text>
          </View>
        )}

        {rider && (
          <View style={wStyles.stackLayout}>
            {renderReferralCard()}

            <View style={[wStyles.card, { padding: 0, overflow: 'hidden' }]}>              <LinearGradient
                colors={[GRADIENT_TOP, GRADIENT_MID]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={wStyles.rankingsHeader}
              >
                <View style={wStyles.rankingsHeaderIcon}>
                  <Trophy size={18} color="#FFFFFF" strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={wStyles.rankingsTitle}>Rider Ranking</Text>
                  <Text style={wStyles.rankingsSubtitle}>Top 3 riders · {currentMonth}</Text>
                </View>
              </LinearGradient>
              <View style={wStyles.rankingsBody}>
                {rankings.length === 0 ? (
                  <View style={wStyles.rankingsEmpty}>
                    <Award size={28} color={Colors.textTertiary} strokeWidth={1.5} />
                    <Text style={wStyles.rankingsEmptyText}>Rankings will appear after this month's performance is calculated.</Text>
                  </View>
                ) : rankings.map((entry, idx) => {
                  const meta = RANK_META[entry.rank_position] ?? RANK_META[3] ?? { label: '#'+entry.rank_position, color: Colors.textTertiary, bg: Colors.neutral[100], border: Colors.border, row: Colors.white };
                  const isFirst = entry.rank_position === 1;
                  return (
                    <View key={entry.rider_id} style={[
                      wStyles.rankRow,
                      isFirst && wStyles.rankRowFirst,
                      idx < rankings.length - 1 && wStyles.rankRowBorder,
                      entry.is_self && wStyles.rankRowSelf,
                    ]}>
                      <View style={[wStyles.rankMedal, { backgroundColor: meta.bg, borderColor: meta.border }, isFirst && wStyles.rankMedalFirst]}>
                        {isFirst ? (
                          <Crown size={20} color={meta.color} strokeWidth={2.2} />
                        ) : (
                          <Medal size={16} color={meta.color} strokeWidth={2.2} />
                        )}
                        <Text style={[wStyles.rankMedalText, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                      {entry.profile_photo_url ? (
                        <Image source={{ uri: entry.profile_photo_url }} style={[wStyles.rankPhoto, isFirst && wStyles.rankPhotoFirst]} />
                      ) : (
                        <View style={[wStyles.rankPhoto, isFirst && wStyles.rankPhotoFirst, { backgroundColor: meta.bg }]}>
                          <Text style={[wStyles.rankInitial, { color: meta.color }]}>{entry.rider_name.charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1, gap: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Text style={wStyles.rankName}>{entry.rider_name}</Text>
                          <View style={[wStyles.rankBadge, { backgroundColor: meta.bg, borderColor: meta.border }]}>
                            {isFirst ? (
                              <Crown size={11} color={meta.color} strokeWidth={2.2} />
                            ) : (
                              <Medal size={11} color={meta.color} strokeWidth={2.2} />
                            )}
                            <Text style={[wStyles.rankBadgeText, { color: meta.color }]}>{meta.label}</Text>
                          </View>
                          {entry.is_self && (
                            <View style={wStyles.youBadge}>
                              <Text style={wStyles.youBadgeText}>You</Text>
                            </View>
                          )}
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                          <View style={[wStyles.rankStatPill, { backgroundColor: `${meta.color}18` }]}>
                            <Text style={[wStyles.rankStatText, { color: meta.color }]}>{entry.deliveries} deliveries</Text>
                          </View>
                          <View style={[wStyles.rankStatPill, { backgroundColor: `${meta.color}18` }]}>
                            <Text style={[wStyles.rankStatText, { color: meta.color }]}>{entry.present_days} present</Text>
                          </View>
                          {entry.total_earned > 0 && (
                            <View style={[wStyles.rankStatPill, { backgroundColor: Colors.successSurface }]}>
                              <Text style={[wStyles.rankStatText, { color: Colors.success }]}>{formatCurrency(entry.total_earned)} earned</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={wStyles.rankScoreBlock}>
                        <Text style={[wStyles.rankScoreValue, { color: meta.color }]}>{Math.round(entry.score)}</Text>
                        <Text style={wStyles.rankScoreLabel}>points</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={wStyles.profileCard}>
              <View style={wStyles.profileCardLeft}>
                <View style={wStyles.avatarWrap}>
                  <Text style={wStyles.avatarText}>{rider.full_name[0].toUpperCase()}</Text>
                </View>
                <View style={wStyles.profileCardInfo}>
                  <Text style={wStyles.riderName}>{rider.full_name}</Text>
                  {rider.zone && (
                    <View style={wStyles.zoneRow}>
                      <MapPin size={13} color={Colors.textTertiary} strokeWidth={1.8} />
                      <Text style={wStyles.zoneText}>{rider.zone} Zone</Text>
                    </View>
                  )}
                  <View style={[wStyles.statusPill, {
                    backgroundColor: rider.is_active ? Colors.successSurface : Colors.errorSurface
                  }]}>
                    <Text style={[wStyles.statusPillText, {
                      color: rider.is_active ? Colors.success : Colors.error
                    }]}>
                      {rider.is_active ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={wStyles.earningsBlock}>
                <Wallet size={18} color={Colors.accent} strokeWidth={1.8} />
                <Text style={wStyles.earningsValue}>{formatCurrency(totalEarned)}</Text>
                <Text style={wStyles.earningsLabel}>Total Earned</Text>
              </View>
            </View>

            <View style={wStyles.card}>
              <Text style={wStyles.cardTitle}>Personal Information</Text>
              <View style={wStyles.infoGrid}>
                {renderInfoRow(Phone, 'Mobile', rider.mobile, Colors.success)}
                {renderInfoRow(Phone, 'Alternate Mobile', rider.alternate_mobile, Colors.success)}
                {renderInfoRow(Mail, 'Email', rider.email, Colors.primary)}
                {renderInfoRow(MapPin, 'Address', rider.address, Colors.warning)}
                {renderInfoRow(FileText, 'Joining Date', rider.joining_date ? format(new Date(rider.joining_date), 'dd MMMM yyyy') : null)}
              </View>
            </View>

            <View style={wStyles.card}>
              <Text style={wStyles.cardTitle}>Vehicle Info</Text>
              <View style={wStyles.infoGrid}>
                {renderInfoRow(Bike, 'Vehicle Type', rider.vehicle_type ? rider.vehicle_type.charAt(0).toUpperCase() + rider.vehicle_type.slice(1) : null, Colors.primary)}
                {renderInfoRow(FileText, 'Vehicle Number', rider.vehicle_number, Colors.primary)}
                {renderInfoRow(BadgeCheck, 'License Number', rider.license_number, Colors.primary)}
              </View>
            </View>

            <View style={wStyles.card}>
              <Text style={wStyles.cardTitle}>Emergency Contact</Text>
              <View style={wStyles.infoGrid}>
                {renderInfoRow(User, 'Contact Name', rider.emergency_contact_name)}
                {renderInfoRow(Phone, 'Contact Mobile', rider.emergency_contact_mobile)}
              </View>
            </View>

            {hasCompensation && (
              <View style={wStyles.card}>
                <Text style={wStyles.cardTitle}>Compensation</Text>
                <View style={wStyles.infoGrid}>
                  {renderInfoRow(CircleDollarSign, 'Monthly Salary', rider.monthly_salary ? formatCurrency(rider.monthly_salary) : null, Colors.accent)}
                  {renderInfoRow(CircleDollarSign, 'Per Delivery Rate', rider.per_delivery_rate ? formatCurrency(rider.per_delivery_rate) : null, Colors.accent)}
                </View>
              </View>
            )}

            <View style={[wStyles.card, { padding: 0 }]}>
              <Text style={[wStyles.cardTitle, { paddingHorizontal: 20, paddingTop: 20 }]}>Payout History</Text>
              {payouts.length === 0 ? (
                <View style={wStyles.emptyState}>
                  <CircleDollarSign size={28} color={Colors.textTertiary} strokeWidth={1.5} />
                  <Text style={wStyles.emptyText}>No payouts yet</Text>
                </View>
              ) : (
                <>
                  <View style={wStyles.tableHead}>
                    <Text style={[wStyles.thCell, { flex: 1 }]}>Period</Text>
                    <Text style={[wStyles.thCell, { width: 100 }]}>Deliveries</Text>
                    <Text style={[wStyles.thCell, { width: 130 }]}>Amount</Text>
                    <Text style={[wStyles.thCell, { width: 110 }]}>Status</Text>
                  </View>
                  {payouts.map((p, i) => (
                    <View key={p.id} style={[wStyles.tableRow, i % 2 === 1 && wStyles.tableRowAlt]}>
                      <Text style={[wStyles.tdCell, { flex: 1, fontFamily: Typography.fontFamily.sansMedium }]}>
                        {format(new Date(p.period_start), 'dd MMM')} – {format(new Date(p.period_end), 'dd MMM yyyy')}
                      </Text>
                      <Text style={[wStyles.tdCell, { width: 100 }]}>{p.total_deliveries}</Text>
                      <Text style={[wStyles.tdCell, { width: 130, fontFamily: Typography.fontFamily.sansSemiBold }]}>
                        {formatCurrency(p.final_amount)}
                      </Text>
                      <View style={{ width: 110 }}>
                        <StatusChip status={p.status} />
                      </View>
                    </View>
                  ))}
                </>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={[mStyles.container, { backgroundColor: '#EEF2F5' }]}>
      <LinearGradient
        colors={[GRADIENT_TOP, GRADIENT_MID, GRADIENT_BOT]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[mStyles.gradientHeader, { paddingTop: insets.top + Spacing[3] }]}
      >
        <View style={mStyles.headerTopRow}>
          <View style={mStyles.headerLeft}>
            <View style={mStyles.headerIconWrap}>
              <User size={18} color={ACCENT} strokeWidth={1.8} />
            </View>
            <View>
              <Text style={mStyles.headerEyebrow}>Rider Portal</Text>
              <Text style={mStyles.headerTitle}>My Profile</Text>
            </View>
          </View>
          <TouchableOpacity style={mStyles.signOutBtn} onPress={signOut} activeOpacity={0.7}>
            <LogOut size={16} color='rgba(255,255,255,0.7)' strokeWidth={1.8} />
          </TouchableOpacity>
        </View>

        {rider && (
          <View style={mStyles.profileHeroRow}>
            <View style={mStyles.profileAvatar}>
              <Text style={mStyles.profileAvatarText}>{rider.full_name[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={mStyles.profileName}>{rider.full_name}</Text>
              {rider.zone && <Text style={mStyles.profileZone}>{rider.zone} Zone</Text>}
            </View>
            <View style={[mStyles.activePill, { backgroundColor: rider.is_active ? 'rgba(76,175,80,0.2)' : 'rgba(198,40,40,0.2)' }]}>
              <Text style={[mStyles.activePillText, { color: rider.is_active ? '#4CAF50' : Colors.error }]}>
                {rider.is_active ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>
        )}

        <View style={mStyles.earningsBanner}>
          <Wallet size={16} color={ACCENT} strokeWidth={1.8} />
          <Text style={mStyles.earningsBannerLabel}>Total Earned</Text>
          <Text style={mStyles.earningsBannerValue}>{formatCurrency(totalEarned)}</Text>
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[mStyles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {noProfile && (
          <View style={mStyles.noProfileCard}>
            <User size={28} color={Colors.textTertiary} strokeWidth={1.5} />
            <Text style={mStyles.noProfileText}>No rider profile linked. Contact admin.</Text>
          </View>
        )}

        {rider && (
          <>
            {renderReferralCard()}

            {renderRankingsSection()}

            <View style={mStyles.section}>
              <Text style={mStyles.sectionTitle}>Personal Info</Text>
              <View style={mStyles.infoCard}>
                {renderInfoRow(Phone, 'Mobile', rider.mobile, Colors.success)}
                {rider.alternate_mobile && renderInfoRow(Phone, 'Alternate Mobile', rider.alternate_mobile, Colors.success)}
                {rider.email && renderInfoRow(Mail, 'Email', rider.email, Colors.primary)}
                {rider.address && renderInfoRow(MapPin, 'Address', rider.address, Colors.warning)}
                {rider.joining_date && renderInfoRow(FileText, 'Joining Date', format(new Date(rider.joining_date), 'dd MMMM yyyy'))}
              </View>
            </View>

            <View style={mStyles.section}>
              <Text style={mStyles.sectionTitle}>Vehicle</Text>
              <View style={mStyles.infoCard}>
                {renderInfoRow(Bike, 'Type', rider.vehicle_type ? rider.vehicle_type.charAt(0).toUpperCase() + rider.vehicle_type.slice(1) : null, Colors.primary)}
                {renderInfoRow(FileText, 'Number', rider.vehicle_number, Colors.primary)}
                {renderInfoRow(BadgeCheck, 'License', rider.license_number, Colors.primary)}
              </View>
            </View>

            {(rider.emergency_contact_name || rider.emergency_contact_mobile) && (
              <View style={mStyles.section}>
                <Text style={mStyles.sectionTitle}>Emergency Contact</Text>
                <View style={mStyles.infoCard}>
                  {renderInfoRow(User, 'Name', rider.emergency_contact_name)}
                  {renderInfoRow(Phone, 'Mobile', rider.emergency_contact_mobile)}
                </View>
              </View>
            )}

            {hasCompensation && (
              <View style={mStyles.section}>
                <Text style={mStyles.sectionTitle}>Compensation</Text>
                <View style={mStyles.infoCard}>
                  {renderInfoRow(CircleDollarSign, 'Monthly Salary', rider.monthly_salary ? formatCurrency(rider.monthly_salary) : null, Colors.accent)}
                  {renderInfoRow(CircleDollarSign, 'Per Delivery', rider.per_delivery_rate ? formatCurrency(rider.per_delivery_rate) : null, Colors.accent)}
                </View>
              </View>
            )}

            {payouts.length > 0 && (
              <View style={mStyles.section}>
                <Text style={mStyles.sectionTitle}>Payout History</Text>
                <View style={mStyles.listCard}>
                  {payouts.map((p, i) => (
                    <View key={p.id} style={[mStyles.listRow, i === payouts.length - 1 && mStyles.listRowLast]}>
                      <View style={[mStyles.listIconWrap, { backgroundColor: Colors.accentSurface }]}>
                        <CircleDollarSign size={16} color={Colors.accent} strokeWidth={1.8} />
                      </View>
                      <View style={mStyles.listInfo}>
                        <Text style={mStyles.listPrimary}>
                          {format(new Date(p.period_start), 'dd MMM')} – {format(new Date(p.period_end), 'dd MMM yyyy')}
                        </Text>
                        <Text style={mStyles.listSub}>
                          {p.total_deliveries} deliveries · {formatCurrency(p.final_amount)}
                        </Text>
                      </View>
                      <StatusChip status={p.status} />
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={mStyles.securityNote}>
              <ShieldCheck size={14} color={Colors.textTertiary} strokeWidth={1.8} />
              <Text style={mStyles.securityText}>Rider portal — authorized access only</Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3] },
  iconWrap: {
    width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  content: { flex: 1, gap: 1 },
  label: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  value: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
});

const mStyles = StyleSheet.create({
  container: { flex: 1 },
  gradientHeader: {
    paddingHorizontal: Spacing[5], paddingBottom: Spacing[4], gap: Spacing[3],
  },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], flex: 1 },
  headerIconWrap: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerEyebrow: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'],
    color: '#FFFFFF', letterSpacing: -0.3,
  },
  signOutBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  profileHeroRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.lg, padding: Spacing[3],
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  profileAvatar: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(58,175,228,0.3)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  profileAvatarText: { fontFamily: Typography.fontFamily.bold, fontSize: 18, color: ACCENT },
  profileName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: '#FFFFFF' },
  profileZone: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.55)' },
  activePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  activePillText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  earningsBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.lg, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3],
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  earningsBannerLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.6)', flex: 1,
  },
  earningsBannerValue: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'],
    color: ACCENT, letterSpacing: -0.3,
  },
  scrollContent: { padding: Spacing[5], gap: Spacing[5] },
  rankingsCard: {
    backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  rankingsHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[4],
  },
  rankingsHeaderIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rankingsTitle: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: '#FFFFFF',
  },
  rankingsSubtitle: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.6)', marginTop: 2,
  },
  rankingsBody: { padding: Spacing[2] },
  rankingsEmpty: { paddingVertical: Spacing[6], alignItems: 'center', gap: Spacing[3] },
  rankingsEmptyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 280 },
  rankRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[3], paddingVertical: Spacing[3], gap: Spacing[3],
    borderRadius: 12,
  },
  rankRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  rankRowSelf: { backgroundColor: '#EBF5FF' },
  rankRowFirst: { paddingVertical: Spacing[4], backgroundColor: '#FFFDF5' },
  rankMedal: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, flexShrink: 0, gap: 1 },
  rankMedalFirst: { width: 50, height: 50, borderRadius: 25, borderWidth: 2 },
  rankMedalText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 9, letterSpacing: 0.5 },
  rankPhoto: { width: 40, height: 40, borderRadius: 20, flexShrink: 0 },
  rankPhotoFirst: { width: 48, height: 48, borderRadius: 24 },
  rankInitial: { fontFamily: Typography.fontFamily.bold, fontSize: 16 },
  rankNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rankInfo: { flex: 1, gap: 4 },
  rankName: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  rankStatsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  rankStatPill: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  rankStatText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 10 },
  rankBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.full,
    borderWidth: 1, flexShrink: 0,
  },
  rankBadgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 9, letterSpacing: 0.3,
  },
  youBadge: {
    backgroundColor: Colors.primarySurface, borderRadius: Radius.full,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  youBadgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.primary,
  },
  rankScoreBlock: { alignItems: 'center', gap: 1, minWidth: 44 },
  rankScoreValue: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, letterSpacing: -0.5,
  },
  rankScoreLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary,
  },
  noProfileCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: Spacing[6],
    alignItems: 'center', gap: Spacing[3], borderWidth: 1, borderColor: Colors.border,
  },
  noProfileText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center',
  },
  section: { gap: Spacing[3] },
  sectionTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  infoCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: Spacing[4],
    borderWidth: 1, borderColor: Colors.border, gap: Spacing[4], ...Shadow.sm,
  },
  listCard: {
    backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  listRow: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing[4],
    borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: Spacing[3],
  },
  listRowLast: { borderBottomWidth: 0 },
  listIconWrap: {
    width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  listInfo: { flex: 1, gap: 1 },
  listPrimary: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary,
  },
  listSub: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  securityNote: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2], paddingVertical: Spacing[2],
  },
  securityText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  // Referral card (mobile)
  referralCard: {
    borderRadius: 16, padding: Spacing[4], overflow: 'hidden',
    backgroundColor: '#1A2E3A',
    borderWidth: 1, borderColor: 'rgba(58,175,228,0.25)', ...Shadow.md,
  },
  referralGlow: {
    position: 'absolute', top: -30, right: -30,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(58,175,228,0.1)',
  },
  referralTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3], marginBottom: Spacing[3] },
  referralIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(212,168,83,0.25)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(212,168,83,0.3)',
  },
  referralTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: '#FFFFFF',
  },
  referralSub: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs,
    color: 'rgba(255,255,255,0.55)', marginTop: 3, lineHeight: 16,
  },
  referralAmountBadge: {
    backgroundColor: 'rgba(212,168,83,0.2)', borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(212,168,83,0.35)',
  },
  referralAmountText: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm, color: Colors.accentLight,
  },
  referBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.accent, borderRadius: Radius.lg, paddingVertical: 13,
  },
  referBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: '#FFFFFF',
  },
});

const wStyles = StyleSheet.create({
  content: { paddingBottom: 64, gap: 0 },
  gradientHeader: { paddingBottom: 0 },
  headerInner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 32, paddingTop: 32, paddingBottom: 28,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  headerIconWrap: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
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
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 4,
  },
  signOutText: {
    fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: 'rgba(255,255,255,0.75)',
  },
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
  stackLayout: { flexDirection: 'column', gap: 18, padding: 32, paddingTop: 24 },
  card: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: Colors.border, gap: 16, ...Shadow.sm,
    overflow: 'hidden',
  },
  cardTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  infoGrid: { gap: 16 },
  profileCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 20,
  },
  profileCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 },
  profileCardInfo: { gap: 6, flex: 1 },
  avatarWrap: {
    width: 64, height: 64, borderRadius: 18, backgroundColor: Colors.primarySurface,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontFamily: Typography.fontFamily.bold, fontSize: 26, color: Colors.primary },
  riderName: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xl, color: Colors.textPrimary,
  },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  zoneText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
  },
  statusPill: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full, alignSelf: 'flex-start',
  },
  statusPillText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 12 },
  earningsBlock: {
    alignItems: 'center', gap: 4,
    backgroundColor: Colors.accentSurface, borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 16, flexShrink: 0,
  },
  earningsValue: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.accent, letterSpacing: -0.3,
  },
  earningsLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary,
  },
  tableHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: Colors.neutral[50],
    borderTopWidth: 1, borderTopColor: Colors.border,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  thCell: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11,
    color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: Colors.neutral[50],
    minHeight: 50,
  },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  tdCell: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: Colors.textPrimary, paddingRight: 8,
  },
  emptyState: { paddingVertical: 40, alignItems: 'center', gap: 10 },
  emptyText: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary,
  },
  rankingsHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 24, paddingVertical: 18,
  },
  rankingsHeaderIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rankingsTitle: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: '#FFFFFF',
  },
  rankingsSubtitle: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: 'rgba(255,255,255,0.55)', marginTop: 2,
  },
  rankingsBody: { padding: 8 },
  rankingsEmpty: { paddingVertical: 40, alignItems: 'center', gap: 12 },
  rankingsEmptyText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 320 },
  rankRow: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 16, paddingVertical: 16,
    borderRadius: 12,
  },
  rankRowFirst: { paddingVertical: 20, backgroundColor: '#FFFDF5' },
  rankRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  rankRowSelf: { backgroundColor: '#EBF5FF' },
  rankMedal: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, flexShrink: 0, gap: 2 },
  rankMedalFirst: { width: 56, height: 56, borderRadius: 28, borderWidth: 2 },
  rankMedalText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, letterSpacing: 0.5 },
  rankPhoto: { width: 44, height: 44, borderRadius: 22, flexShrink: 0 },
  rankPhotoFirst: { width: 52, height: 52, borderRadius: 26 },
  rankInitial: { fontFamily: Typography.fontFamily.bold, fontSize: 18 },
  rankName: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary,
  },
  rankStatPill: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  rankStatText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11 },
  rankBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.full,
    borderWidth: 1, flexShrink: 0,
  },
  rankBadgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, letterSpacing: 0.3,
  },
  youBadge: {
    backgroundColor: Colors.primarySurface, borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  youBadgeText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.primary,
  },
  rankScoreBlock: { alignItems: 'center', gap: 2, minWidth: 60 },
  rankScoreValue: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, letterSpacing: -0.5,
  },
  rankScoreLabel: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary,
  },
  // Referral card (web)
  referralCard: {
    borderRadius: 16, padding: 20, overflow: 'hidden',
    backgroundColor: '#1A2E3A',
    borderWidth: 1, borderColor: 'rgba(58,175,228,0.25)', ...Shadow.md,
  },
  referralGlow: {
    position: 'absolute', top: -40, right: -40,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(58,175,228,0.08)',
  },
  referralTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginBottom: 16 },
  referralIconWrap: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: 'rgba(212,168,83,0.25)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(212,168,83,0.3)',
  },
  referralTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: '#FFFFFF',
  },
  referralSub: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.55)', marginTop: 4, lineHeight: 20,
  },
  referralAmountBadge: {
    backgroundColor: 'rgba(212,168,83,0.2)', borderRadius: Radius.full,
    paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(212,168,83,0.35)',
    alignSelf: 'flex-start',
  },
  referralAmountText: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.accentLight,
  },
  referBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: Colors.accent, borderRadius: Radius.lg, paddingVertical: 14,
    alignSelf: 'flex-start', paddingHorizontal: 24, cursor: 'pointer' as any,
  },
  referBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: '#FFFFFF',
  },
});
