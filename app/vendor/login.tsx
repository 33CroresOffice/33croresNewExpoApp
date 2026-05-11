import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { Mail, Lock, Store, ShieldCheck } from 'lucide-react-native';

export default function VendorLoginScreen() {
  const { setSession, loadProfile } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        setError('Invalid credentials. Please try again.');
        setLoading(false);
        return;
      }

      if (!data.session) {
        setError('Login failed. Please try again.');
        setLoading(false);
        return;
      }

      setSession(data.session);

      const profile = await loadProfile(data.session.user.id);

      if (!profile) {
        await supabase.auth.signOut();
        setError('Account not found. Please contact support.');
        setLoading(false);
        return;
      }

      if (profile.role !== 'vendor') {
        await supabase.auth.signOut();
        setError('Access denied. This portal is for vendors only.');
        setLoading(false);
        return;
      }

      // Routing is handled by onAuthStateChange in _layout.tsx
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  if (Platform.OS !== 'web') {
    return (
      <KeyboardAvoidingView style={styles.mobileContainer} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.mobileScroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.mobileCard}>
            <View style={styles.logoRow}>
              <Image source={require('@/assets/images/2.jpg')} style={styles.logoImg} resizeMode="contain" />
              <View>
                <Text style={styles.brandName}>33 Crores</Text>
                <Text style={styles.portalLabel}>Vendor Portal</Text>
              </View>
            </View>

            <View style={styles.iconWrap}>
              <Store size={32} color={Colors.accent} strokeWidth={1.6} />
            </View>

            <Text style={styles.heading}>Vendor Sign In</Text>
            <Text style={styles.subheading}>Access your procurement portal</Text>

            <View style={styles.form}>
              <Input
                label="Email address"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="vendor@example.com"
                prefix={<Mail size={18} color={Colors.textTertiary} />}
              />
              <Input
                label="Password"
                value={password}
                onChangeText={setPassword}
                isPassword
                placeholder="Enter your password"
                prefix={<Lock size={18} color={Colors.textTertiary} />}
              />

              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <Button
                label="Sign in to Vendor Portal"
                onPress={handleLogin}
                loading={loading}
                fullWidth
                size="lg"
              />
            </View>

            <TouchableOpacity onPress={() => router.replace('/auth/welcome')}>
              <Text style={styles.backLink}>Back to customer portal</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.webContainer}>
      <View style={styles.webLeft}>
        <Image
          source={{ uri: 'https://images.pexels.com/photos/931177/pexels-photo-931177.jpeg?auto=compress&cs=tinysrgb&w=1200' }}
          style={styles.webImage}
          resizeMode="cover"
        />
        <View style={styles.webImageOverlay} />
        <View style={styles.webLeftContent}>
          <View style={styles.logoRow}>
            <Image source={require('@/assets/images/2.jpg')} style={styles.logoImg} resizeMode="contain" />
            <View>
              <Text style={[styles.brandName, { color: Colors.white }]}>33 Crores</Text>
              <Text style={[styles.portalLabel, { color: 'rgba(255,255,255,0.75)' }]}>Vendor Portal</Text>
            </View>
          </View>

          <View style={styles.webLeftText}>
            <Text style={styles.webHeroTitle}>Supply fresh flowers,{'\n'}grow your business</Text>
            <Text style={styles.webHeroSub}>
              Manage procurement orders, track payments, and partner with us to deliver the freshest blooms.
            </Text>
          </View>

          <View style={styles.featureList}>
            {[
              'View and manage procurement orders',
              'Track payment status in real-time',
              'Manage your flower inventory',
            ].map((item) => (
              <View key={item} style={styles.featureItem}>
                <View style={styles.featureDot} />
                <Text style={styles.featureText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.webRight}>
        <View style={styles.webForm}>
          <View style={styles.webFormHeader}>
            <View style={styles.webIconWrap}>
              <Store size={28} color={Colors.accent} strokeWidth={1.6} />
            </View>
            <Text style={styles.webFormTitle}>Vendor Sign In</Text>
            <Text style={styles.webFormSub}>Enter your credentials to access the vendor portal</Text>
          </View>

          <View style={styles.form}>
            <Input
              label="Email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="vendor@example.com"
              prefix={<Mail size={18} color={Colors.textTertiary} />}
            />
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              isPassword
              placeholder="Enter your password"
              prefix={<Lock size={18} color={Colors.textTertiary} />}
            />

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Button
              label="Sign in to Vendor Portal"
              onPress={handleLogin}
              loading={loading}
              fullWidth
              size="lg"
            />
          </View>

          <View style={styles.linksRow}>
            <TouchableOpacity
              style={styles.backLinkRow}
              onPress={() => router.replace('/auth/welcome')}
            >
              <Text style={styles.backLink}>Back to customer portal</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.replace('/admin/login')}
            >
              <Text style={styles.altPortalLink}>Admin portal</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.securityNote}>
            <ShieldCheck size={14} color={Colors.textTertiary} />
            <Text style={styles.securityText}>
              Restricted access — authorized vendors only
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mobileContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  mobileScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing[6],
  },
  mobileCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing[6],
    gap: Spacing[4],
    ...Shadow.md,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  webContainer: {
    flex: 1,
    flexDirection: 'row',
    minHeight: '100%' as any,
  },
  webLeft: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  webImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  webImageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(100,60,10,0.72)',
  },
  webLeftContent: {
    flex: 1,
    padding: Spacing[12],
    justifyContent: 'space-between',
    position: 'relative',
    zIndex: 1,
  },
  webLeftText: {
    gap: Spacing[4],
  },
  webHeroTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 42,
    color: Colors.white,
    lineHeight: 52,
  },
  webHeroSub: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.lg,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 28,
    maxWidth: 380,
  },
  featureList: {
    gap: Spacing[3],
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  featureDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accentLight,
  },
  featureText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: 'rgba(255,255,255,0.85)',
  },
  webRight: {
    width: 480,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[10],
  },
  webForm: {
    width: '100%',
    maxWidth: 400,
    gap: Spacing[6],
  },
  webFormHeader: {
    gap: Spacing[2],
  },
  webIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: Colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[2],
  },
  webFormTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['3xl'],
    color: Colors.textPrimary,
  },
  webFormSub: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textTertiary,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  logoImg: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
  },
  brandName: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    color: Colors.textPrimary,
  },
  portalLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  heading: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['3xl'],
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  subheading: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: -Spacing[2],
  },
  form: {
    gap: Spacing[4],
  },
  errorBox: {
    backgroundColor: Colors.errorSurface,
    borderRadius: Radius.md,
    padding: Spacing[3],
  },
  errorText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.error,
  },
  linksRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backLinkRow: {
    alignItems: 'flex-start',
  },
  backLink: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  altPortalLink: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    textDecorationLine: 'underline',
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
  },
  securityText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
});
