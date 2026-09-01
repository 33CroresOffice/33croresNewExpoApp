import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, MessageSquare, ArrowRight } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { OtpChannel } from '@/types/database';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';

const { width } = Dimensions.get('window');

export default function OtpChannelScreen() {
  const insets = useSafeAreaInsets();
  const { mobile } = useLocalSearchParams<{ mobile: string }>();
  const [selectedChannel, setSelectedChannel] = useState<OtpChannel>('whatsapp');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const channels: { id: OtpChannel; label: string; desc: string; emoji: string }[] = [
    { id: 'whatsapp', label: 'WhatsApp', desc: 'Receive OTP on WhatsApp', emoji: '💬' }
  ];

  const handleSendOtp = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/send-otp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ mobile, channel: selectedChannel }),
        }
      );

      const data = await response.json();

      if (!data?.success) {
        setError(data?.error || 'Failed to send OTP. Please try again.');
        return;
      }

      router.push({
        pathname: '/auth/otp-verify',
        params: { mobile, channel: selectedChannel },
      });
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing[8] }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { top: insets.top + Spacing[3] }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <ArrowLeft size={20} color={Colors.white} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <Image
        source={require('@/assets/images/closeup-image-basket-with-flowers-onam-festival-background.jpg')}
        style={styles.heroImage}
        resizeMode="cover"
      />
      <View style={styles.heroOverlay} />
      <View style={[styles.heroBrand, { top: insets.top + Spacing[3] + 48 + Spacing[3] }]}>
        <Image source={require('@/assets/images/33logo-red_1.png')} style={styles.heroBrandLogo} resizeMode="contain" />
        <Text style={styles.heroBrandText}>Crores</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconBadge}>
            <MessageSquare size={22} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <Text style={styles.title}>How should we send the code?</Text>
          <View style={styles.mobilePill}>
            <Text style={styles.mobilePillText}>+91 {mobile}</Text>
          </View>
        </View>

        <View style={styles.channelList}>
          {channels.map((channel) => {
            const isSelected = selectedChannel === channel.id;
            return (
              <TouchableOpacity
                key={channel.id}
                style={[styles.channelCard, isSelected && styles.channelCardSelected]}
                onPress={() => setSelectedChannel(channel.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.channelEmoji}>{channel.emoji}</Text>
                <View style={styles.channelInfo}>
                  <Text style={[styles.channelLabel, isSelected && styles.channelLabelSelected]}>
                    {channel.label}
                  </Text>
                  <Text style={styles.channelDesc}>{channel.desc}</Text>
                </View>
                <View style={[styles.radio, isSelected && styles.radioSelected]}>
                  {isSelected && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.sendBtn, loading && styles.sendBtnDisabled]}
          onPress={handleSendOtp}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text style={styles.sendBtnText}>
            {loading ? 'Sending...' : `Send Code via ${selectedChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'}`}
          </Text>
          {!loading && <ArrowRight size={18} color={Colors.white} strokeWidth={2.2} />}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flexGrow: 1,
  },
  header: {
    position: 'absolute',
    left: Spacing[5],
    zIndex: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImage: {
    width,
    height: 220,
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 220,
    backgroundColor: 'rgba(8,8,8,0.35)',
  },
  heroBrand: {
    position: 'absolute',
    left: Spacing[6],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    paddingHorizontal: Spacing[3],
    paddingVertical: 8,
    borderRadius: 30
  },
  heroBrandLogo: {
    width: 28,
    height: 28,
  },
  heroBrandText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    color: Colors.white,
    letterSpacing: -0.2,
    marginLeft: -10
  },
  card: {
    flex: 1,
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    marginTop: -Radius.xl,
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[7],
    paddingBottom: Spacing[6],
    gap: Spacing[6],
  },
  cardHeader: {
    gap: Spacing[3],
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[1],
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['3xl'],
    color: Colors.textPrimary,
    letterSpacing: -0.4,
  },
  mobilePill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primarySurface,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: 5,
  },
  mobilePillText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.primary,
    letterSpacing: 0.3,
  },
  channelList: {
    gap: Spacing[3],
  },
  channelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing[4],
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    gap: Spacing[3],
    ...Shadow.sm,
  },
  channelCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  channelEmoji: {
    fontSize: 28,
  },
  channelInfo: {
    flex: 1,
    gap: 3,
  },
  channelLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.md,
    color: Colors.textPrimary,
  },
  channelLabelSelected: {
    color: Colors.primaryDark,
  },
  channelDesc: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: Colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  error: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.error,
    textAlign: 'center',
    marginTop: -Spacing[3],
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing[4],
    minHeight: 56,
  },
  sendBtnDisabled: {
    opacity: 0.6,
  },
  sendBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.md,
    color: Colors.white,
    letterSpacing: 0.2,
  },
});
