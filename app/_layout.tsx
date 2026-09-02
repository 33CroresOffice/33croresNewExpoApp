import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useFonts } from 'expo-font';
import {
  DMSerifDisplay_400Regular,
  DMSerifDisplay_400Regular_Italic,
} from '@expo-google-fonts/dm-serif-display';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import * as SplashScreen from 'expo-splash-screen';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import VersionCheck from 'react-native-version-check';

SplashScreen.preventAutoHideAsync();

const APP_STORE_URL = 'https://apps.apple.com/in/app/33-crores/id6443912970';

const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.thirtythreecroresapp';

const ANDROID_PACKAGE_NAME = 'com.thirtythreecroresapp';
const IOS_APP_ID = '6443912970';

const getLocalAppVersion = () => {
  const nativeVersion = Application.nativeApplicationVersion;
  const expoVersion = Constants.expoConfig?.version;
  let versionCheckVersion = '';
  if (Platform.OS !== 'web') {
    try { versionCheckVersion = VersionCheck.getCurrentVersion(); } catch {}
  }
  return nativeVersion || expoVersion || versionCheckVersion || '';
};

const getIosAppStoreVersion = async () => {
  try {
    const response = await fetch(
      `https://itunes.apple.com/lookup?id=${IOS_APP_ID}&country=in`
    );
    const text = await response.text();
    if (!text || text.trim().startsWith('<')) return '';
    const json = JSON.parse(text);
    if (json?.resultCount > 0 && json?.results?.[0]?.version) {
      return json.results[0].version;
    }
    return '';
  } catch (error) {
    console.log('iOS App Store version check error:', error);
    return '';
  }
};

const getAndroidPlayStoreVersion = async () => {
  try {
    const latestVersion = await VersionCheck.getLatestVersion({
      provider: 'playStore',
      packageName: ANDROID_PACKAGE_NAME,
    });
    return latestVersion || '';
  } catch (error) {
    console.log('Android Play Store version check error:', error);
    return '';
  }
};

const normalizeVersion = (version?: string) => {
  return String(version || '').trim().replace(/[^\d.]/g, '');
};

const convertVersionToParts = (version?: string) => {
  const cleanVersion = normalizeVersion(version);
  if (!cleanVersion) return [];
  return cleanVersion.split('.').map(item => {
    const number = Number(item);
    return Number.isNaN(number) ? 0 : number;
  });
};

const isStoreVersionGreaterThanCurrent = (
  currentVersion?: string,
  storeVersion?: string
) => {
  const currentParts = convertVersionToParts(currentVersion);
  const storeParts = convertVersionToParts(storeVersion);
  if (!currentParts.length || !storeParts.length) return false;
  const maxLength = Math.max(currentParts.length, storeParts.length);
  for (let i = 0; i < maxLength; i += 1) {
    const currentValue = currentParts[i] || 0;
    const storeValue = storeParts[i] || 0;
    if (storeValue > currentValue) return true;
    if (storeValue < currentValue) return false;
  }
  return false;
};

export default function RootLayout() {
  useFrameworkReady();

  const { setSession, loadProfile, setLoading, isLoading } = useAuthStore();
  const pathname = usePathname();
  const pathnameRef = React.useRef(pathname);
  pathnameRef.current = pathname;
  const hasNavigatedRef = React.useRef(false);

  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [currentVersion, setCurrentVersion] = useState('');
  const [storeVersion, setStoreVersion] = useState('');
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const [fontsLoaded, fontError] = useFonts({
    'DMSerifDisplay-Regular': DMSerifDisplay_400Regular,
    'DMSerifDisplay-Italic': DMSerifDisplay_400Regular_Italic,
    'DMSans-Regular': DMSans_400Regular,
    'DMSans-Medium': DMSans_500Medium,
    'DMSans-SemiBold': DMSans_600SemiBold,
    'DMSans-Bold': DMSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  const checkAppUpdate = async () => {
    if (Platform.OS === 'web') return;
    try {
      setCheckingUpdate(true);
      const appCurrentVersion = getLocalAppVersion();
      let latestStoreVersion = '';
      if (Platform.OS === 'ios') {
        latestStoreVersion = await getIosAppStoreVersion();
      } else if (Platform.OS === 'android') {
        latestStoreVersion = await getAndroidPlayStoreVersion();
      }
      setCurrentVersion(appCurrentVersion || '');
      setStoreVersion(latestStoreVersion || '');
      const shouldShowUpdateModal = isStoreVersionGreaterThanCurrent(
        appCurrentVersion,
        latestStoreVersion
      );
      if (shouldShowUpdateModal) {
        setShowUpdateModal(true);
      } else {
        setShowUpdateModal(false);
      }
    } catch (error) {
      console.log('Version check error:', error);
      setShowUpdateModal(false);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const openStore = async () => {
    try {
      const storeUrl = Platform.OS === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
      const canOpen = await Linking.canOpenURL(storeUrl);
      if (canOpen) {
        await Linking.openURL(storeUrl);
      }
    } catch (error) {
      console.log('Open Store error:', error);
    }
  };

  useEffect(() => {
    if (!fontsLoaded && !fontError) return;

    checkAppUpdate();

    let initDone = false;

    const navigateForProfile = (profile: Awaited<ReturnType<typeof loadProfile>>) => {
      if (!profile) {
        router.replace('/auth/welcome');
      } else if (profile.role === 'admin') {
        router.replace('/(admin)');
      } else if (profile.role === 'vendor') {
        router.replace('/(vendor)');
      } else if (!profile.full_name) {
        router.replace('/auth/profile-setup');
      } else {
        router.replace('/(customer)');
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
        hasNavigatedRef.current = false;
        initDone = false;
        router.replace('/auth/welcome');
        return;
      }
      // SIGNED_IN events are handled by the login screens themselves;
      // the listener only keeps the session in sync.
      if (event === 'SIGNED_IN' && session) {
        setSession(session);
      }
    });

    const initSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          setSession(session);
          initDone = true;
          const profile = await loadProfile(session.user.id);
          setLoading(false);
          hasNavigatedRef.current = true;
          navigateForProfile(profile);
        } else {
          setLoading(false);
          initDone = true;
          const portalPaths = ['/admin/login', '/vendor/login', '/rider/login', '/auth/'];
          const isOnPortal = portalPaths.some((p) => pathnameRef.current.startsWith(p));
          if (!isOnPortal) {
            router.replace('/auth/welcome');
          }
        }
      } catch (error) {
        console.log('Init session error:', error);
        setLoading(false);
        initDone = true;
        router.replace('/auth/welcome');
      }
    };

    initSession();

    return () => subscription.unsubscribe();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  if (isLoading) {
    return (
      <View style={styles.splashContainer}>
        <ActivityIndicator size="large" color="#2D5A27" />
      </View>
    );
  }

  const storeName = Platform.OS === 'ios' ? 'App Store' : 'Play Store';

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="auth" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="vendor" />
        <Stack.Screen name="rider" />
        <Stack.Screen name="(customer)" />
        <Stack.Screen name="(admin)" />
        <Stack.Screen name="(vendor)" />
        <Stack.Screen name="(rider)" />
        <Stack.Screen name="+not-found" />
      </Stack>

      <StatusBar style="dark" />

      <Modal
        visible={showUpdateModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.updateCard}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>⬆</Text>
            </View>
            <Text style={styles.title}>Update Available</Text>
            <Text style={styles.message}>
              A new version of 33 Crores is available on {storeName}. Please
              update the app to continue using the latest features and
              improvements.
            </Text>
            <View style={styles.versionBox}>
              <View style={styles.versionItem}>
                <Text style={styles.versionLabel}>Current Version</Text>
                <Text style={styles.versionValue}>
                  {currentVersion || '-'}
                </Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.versionItem}>
                <Text style={styles.versionLabel}>Latest Version</Text>
                <Text style={styles.versionValue}>
                  {storeVersion || '-'}
                </Text>
              </View>
            </View>
            {checkingUpdate ? (
              <View style={styles.loadingButton}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.loadingText}>Checking...</Text>
              </View>
            ) : (
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.updateButton}
                onPress={openStore}
              >
                <Text style={styles.updateButtonText}>Update Now</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  updateCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFF1EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#FFD5C2',
  },
  iconText: {
    fontSize: 34,
    color: '#FF6B35',
    fontWeight: '900',
  },
  title: {
    fontSize: 24,
    fontFamily: 'DMSans-Bold',
    color: '#111827',
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
  },
  versionBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
  },
  versionItem: {
    flex: 1,
    alignItems: 'center',
  },
  versionLabel: {
    fontSize: 12,
    fontFamily: 'DMSans-Medium',
    color: '#6B7280',
    marginBottom: 5,
  },
  versionValue: {
    fontSize: 16,
    fontFamily: 'DMSans-Bold',
    color: '#111827',
  },
  divider: {
    width: 1,
    height: 38,
    backgroundColor: '#E5E7EB',
  },
  updateButton: {
    width: '100%',
    height: 54,
    borderRadius: 18,
    backgroundColor: '#FF6B35',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF6B35',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  updateButtonText: {
    fontSize: 16,
    fontFamily: 'DMSans-Bold',
    color: '#FFFFFF',
  },
  loadingButton: {
    width: '100%',
    height: 54,
    borderRadius: 18,
    backgroundColor: '#9CA3AF',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  loadingText: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
    color: '#FFFFFF',
  },
});
