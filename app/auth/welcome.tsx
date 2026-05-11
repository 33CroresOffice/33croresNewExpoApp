import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';

const { width, height } = Dimensions.get('window');

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <Image
        source={{ uri: 'https://images.pexels.com/photos/931177/pexels-photo-931177.jpeg?auto=compress&cs=tinysrgb&w=1200' }}
        style={styles.heroImage}
        resizeMode="cover"
      />

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.15)', 'rgba(8,8,8,0.92)']}
        locations={[0.25, 0.5, 1]}
        style={styles.gradient}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + Spacing[2] }]}>
        <View style={styles.brandPill}>
          <Image source={require('@/assets/images/2.jpg')} style={styles.brandLogoSmall} resizeMode="contain" />
          <Text style={styles.brandPillText}>33 Crores</Text>
        </View>
      </View>

      <View style={[styles.content, { paddingBottom: insets.bottom + Spacing[8] }]}>
        <View style={styles.heroText}>
          <Text style={styles.headline}>Fresh flowers,{'\n'}delivered with love</Text>
          <Text style={styles.tagline}>Handcrafted seasonal bouquets from local farms, straight to your doorstep.</Text>
        </View>

        <View style={styles.features}>
          {[
            { label: 'Handpicked seasonal bouquets' },
            { label: 'Delivered to your door' },
            { label: 'Customise every delivery' },
          ].map((item) => (
            <View key={item.label} style={styles.featureRow}>
              <View style={styles.featureDot} />
              <Text style={styles.featureText}>{item.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push('/auth/mobile')}
            activeOpacity={0.88}
          >
            <Text style={styles.primaryBtnText}>Get Started</Text>
            <ArrowRight size={18} color={Colors.white} strokeWidth={2.2} />
          </TouchableOpacity>

          <View style={styles.secondaryRow}>
            <Text style={styles.hintText}>Already a member? </Text>
            <TouchableOpacity onPress={() => router.push('/auth/mobile')} activeOpacity={0.7}>
              <Text style={styles.hintLink}>Log in</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.portalLinksRow}>
            <TouchableOpacity onPress={() => router.push('/vendor/login')} activeOpacity={0.7}>
              <Text style={styles.portalLinkText}>Vendor portal</Text>
            </TouchableOpacity>
            <View style={styles.portalLinkDivider} />
            <TouchableOpacity onPress={() => router.push('/rider/login')} activeOpacity={0.7}>
              <Text style={styles.portalLinkText}>Rider portal</Text>
            </TouchableOpacity>
            <View style={styles.portalLinkDivider} />
            <TouchableOpacity onPress={() => router.push('/admin/login')} activeOpacity={0.7}>
              <Text style={styles.portalLinkText}>Admin portal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  heroImage: {
    width,
    height: height * 0.7,
    position: 'absolute',
    top: 0,
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: height * 0.8,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing[6],
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: 7,
  },
  brandLogoSmall: {
    width: 18,
    height: 18,
    borderRadius: 4,
  },
  brandPillText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.white,
    letterSpacing: 0.3,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing[6],
    gap: Spacing[5],
  },
  heroText: {
    gap: Spacing[3],
  },
  headline: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['5xl'],
    color: Colors.white,
    letterSpacing: -0.8,
    lineHeight: Typography.size['5xl'] * 1.12,
  },
  tagline: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: 'rgba(255,255,255,0.72)',
    lineHeight: Typography.size.base * 1.6,
  },
  features: {
    gap: Spacing[2],
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.secondary,
  },
  featureText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: 'rgba(255,255,255,0.82)',
  },
  actions: {
    gap: Spacing[3],
    paddingTop: Spacing[2],
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.secondary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing[4],
    minHeight: 56,
  },
  primaryBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.md,
    color: Colors.white,
    letterSpacing: 0.2,
  },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hintText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.55)',
  },
  hintLink: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.white,
    textDecorationLine: 'underline',
  },
  portalLinksRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing[3],
    paddingVertical: Spacing[1],
  },
  portalLinkText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: 'rgba(255,255,255,0.38)',
    letterSpacing: 0.2,
  },
  portalLinkDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
});
