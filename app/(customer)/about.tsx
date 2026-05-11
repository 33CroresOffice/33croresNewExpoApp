import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Flower2, Heart, Truck, Star } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';

export default function AboutScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>About Us</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Image source={require('@/assets/images/2.jpg')} style={styles.heroLogo} resizeMode="contain" />
          <Text style={styles.brandName}>33 Crores</Text>
          <Text style={styles.tagline}>Path to spirituality</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Our Story</Text>
          <Text style={styles.cardText}>
            33 Crores was founded with a simple belief — that fresh flowers have the power to transform everyday
            moments into something beautiful. We started as a small team of flower enthusiasts who wanted to bring
            the joy of a florist-curated bouquet directly to your doorstep, on a schedule that fits your life.
          </Text>
          <Text style={styles.cardText}>
            Today, we partner with the finest local farms and growers to source seasonal blooms that are cut fresh
            and delivered to thousands of homes across India every week.
          </Text>
        </View>

        <View style={styles.pillarsRow}>
          {[
            { icon: <Star size={22} color={Colors.accent} />, title: 'Quality', desc: 'Farm-fresh, hand-selected blooms every delivery' },
            { icon: <Heart size={22} color={Colors.secondary} />, title: 'Care', desc: 'Every bouquet arranged with love and attention' },
            { icon: <Truck size={22} color={Colors.primary} />, title: 'Reliable', desc: 'On-time delivery you can count on, every time' },
          ].map((item) => (
            <View key={item.title} style={styles.pillarCard}>
              <View style={styles.pillarIcon}>{item.icon}</View>
              <Text style={styles.pillarTitle}>{item.title}</Text>
              <Text style={styles.pillarDesc}>{item.desc}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Our Mission</Text>
          <Text style={styles.cardText}>
            To make fresh flowers an effortless, affordable part of daily life — bringing colour, fragrance,
            and happiness into your home without the hassle of planning or last-minute runs to the market.
          </Text>
        </View>

        <View style={styles.statsRow}>
          {[
            { value: '10,000+', label: 'Happy Customers' },
            { value: '50+', label: 'Flower Varieties' },
            { value: '4.9★', label: 'Average Rating' },
          ].map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.contactCard}>
          <Text style={styles.cardTitle}>Get In Touch</Text>
          <Text style={styles.cardText}>contact@33crores.com</Text>
          <Text style={styles.cardText}>+91-9776-88888-7</Text>
          <Text style={styles.cardText}>Mon – Sat, 9 AM – 6 PM</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  backBtn: { padding: Spacing[1] },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    color: Colors.textPrimary,
  },
  content: { padding: Spacing[5], gap: Spacing[4], paddingBottom: 40 },
  heroCard: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    padding: Spacing[8],
    alignItems: 'center',
    gap: Spacing[2],
  },
  heroLogo: {
    width: 120,
    height: 60,
    marginBottom: Spacing[2],
  },
  brandName: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['3xl'],
    color: Colors.white,
    letterSpacing: -0.5,
  },
  tagline: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[5],
    gap: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  cardTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
  },
  cardText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  pillarsRow: { flexDirection: 'row', gap: Spacing[3] },
  pillarCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    alignItems: 'center',
    gap: Spacing[2],
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  pillarIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillarTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  pillarDesc: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 16,
  },
  statsRow: { flexDirection: 'row', gap: Spacing[3] },
  statCard: {
    flex: 1,
    backgroundColor: Colors.primarySurface,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    color: Colors.primaryDark,
  },
  statLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.primary,
    textAlign: 'center',
  },
  contactCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[5],
    gap: Spacing[2],
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
});
