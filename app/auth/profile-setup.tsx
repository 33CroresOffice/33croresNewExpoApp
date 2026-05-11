import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { User } from 'lucide-react-native';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export default function ProfileSetupScreen() {
  const insets = useSafeAreaInsets();
  const { session, setProfile } = useAuthStore();

  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    const trimmed = fullName.trim();
    if (!trimmed || trimmed.length < 2) {
      setError('Please enter your full name (at least 2 characters)');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (!session) {
        setError('Session expired. Please log in again.');
        return;
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/update-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ full_name: trimmed }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        console.error('update-profile error:', json);
        setError('Failed to save your profile. Please try again.');
        return;
      }

      if (json.profile) {
        setProfile(json.profile);
      } else {
        await useAuthStore.getState().loadProfile(session.user.id);
      }
      router.replace('/(customer)');
    } catch (e) {
      console.error('profile-setup error:', e);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing[8], paddingBottom: insets.bottom + Spacing[8] }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <User size={32} color={Colors.primary} />
          </View>
          <Text style={styles.title}>Tell us your name</Text>
          <Text style={styles.subtitle}>
            We'll use this to personalise your flower delivery experience
          </Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Full Name"
            value={fullName}
            onChangeText={(text) => {
              setFullName(text);
              setError('');
            }}
            placeholder="e.g. Priya Sharma"
            error={error}
            autoFocus
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
        </View>

        <View style={styles.benefits}>
          {[
            'Personalised bouquet recommendations',
            'Delivery updates addressed to you',
            'Exclusive member offers',
          ].map((item) => (
            <View key={item} style={styles.benefitItem}>
              <View style={styles.benefitDot} />
              <Text style={styles.benefitText}>{item}</Text>
            </View>
          ))}
        </View>

        <Button
          label="Complete Setup"
          onPress={handleSave}
          size="lg"
          fullWidth
          loading={loading}
          disabled={fullName.trim().length < 2}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: Spacing[6],
    gap: Spacing[8],
  },
  header: {
    gap: Spacing[3],
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[2],
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['3xl'],
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    lineHeight: Typography.size.base * 1.6,
  },
  form: {
    gap: Spacing[3],
  },
  benefits: {
    gap: Spacing[3],
    paddingVertical: Spacing[4],
    paddingHorizontal: Spacing[4],
    backgroundColor: Colors.primarySurface,
    borderRadius: 12,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  benefitDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  benefitText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.primaryDark,
    flex: 1,
  },
});
