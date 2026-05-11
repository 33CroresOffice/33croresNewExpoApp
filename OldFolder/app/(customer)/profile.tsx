import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { User, Bell, ShoppingBag, MapPin, Circle as CircleHelp, Info, FileText, Shield, ChevronRight, Phone, LogOut } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';

type MenuItem = {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { profile, signOut } = useAuthStore();

  const handleSignOut = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to sign out?')) {
        signOut();
      }
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: signOut },
      ]);
    }
  };

  const menuItems: MenuItem[] = [
    {
      icon: <User size={20} color={Colors.textSecondary} />,
      label: 'Profile',
      onPress: () => router.push('/(customer)/edit-profile'),
    },
    {
      icon: <Bell size={20} color={Colors.textSecondary} />,
      label: 'Notifications',
      onPress: () => router.push('/(customer)/notifications'),
    },
    {
      icon: <ShoppingBag size={20} color={Colors.textSecondary} />,
      label: 'My Orders',
      onPress: () => router.push('/(customer)/orders'),
    },
    {
      icon: <MapPin size={20} color={Colors.textSecondary} />,
      label: 'Address',
      onPress: () => router.push('/(customer)/addresses'),
    },
    {
      icon: <CircleHelp size={20} color={Colors.textSecondary} />,
      label: 'Help & Support',
      onPress: () => router.push('/(customer)/help'),
    },
    {
      icon: <Info size={20} color={Colors.textSecondary} />,
      label: 'About us',
      onPress: () => router.push('/(customer)/about'),
    },
    {
      icon: <FileText size={20} color={Colors.textSecondary} />,
      label: 'Terms & Conditions',
      onPress: () => router.push('/(customer)/terms'),
    },
    {
      icon: <Shield size={20} color={Colors.textSecondary} />,
      label: 'Privacy Policy',
      onPress: () => router.push('/(customer)/privacy'),
    },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>My Profile</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Avatar Card */}
        <View style={styles.avatarCard}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {profile?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
              </Text>
            </View>
          )}
          <View style={styles.avatarInfo}>
            <Text style={styles.userName}>{profile?.full_name ?? 'User'}</Text>
            <View style={styles.mobileRow}>
              <Phone size={13} color={Colors.textTertiary} />
              <Text style={styles.mobileText}>+91 {profile?.mobile}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => router.push('/(customer)/edit-profile')}
          >
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Menu List */}
        <View style={styles.menuCard}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.menuRow, index > 0 && styles.menuRowBorder]}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={styles.menuIconBox}>{item.icon}</View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <ChevronRight size={18} color={Colors.neutral[400]} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
          <LogOut size={18} color={Colors.error} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>33 Crores v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'],
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  content: { padding: Spacing[5], gap: Spacing[4], paddingBottom: 40 },
  avatarCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'],
    color: Colors.white,
  },
  avatarInfo: { flex: 1, gap: 4 },
  userName: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
  },
  mobileRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  mobileText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  editBtn: {
    paddingHorizontal: Spacing[3],
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  editBtnText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.primary,
  },
  menuCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[4],
    gap: Spacing[3],
  },
  menuRowBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  menuIconBox: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    flex: 1,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    padding: Spacing[4],
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.errorSurface,
    backgroundColor: Colors.errorSurface,
  },
  signOutText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.error,
  },
  version: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textDisabled,
    textAlign: 'center',
    marginTop: -Spacing[2],
  },
});
