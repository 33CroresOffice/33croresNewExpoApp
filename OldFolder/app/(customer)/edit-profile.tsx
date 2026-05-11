import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  Image,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, User, Phone, Mail, MessageSquare, ChevronDown, Camera } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import DatePickerField from '@/components/ui/DatePickerField';

const GENDER_OPTIONS = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
  { label: 'Prefer not to say', value: 'prefer_not_to_say' },
];


export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const { profile, setProfile } = useAuthStore();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [dob, setDob] = useState<Date | null>(
    profile?.date_of_birth ? new Date(profile.date_of_birth) : null
  );
  const [gender, setGender] = useState(profile?.gender ?? '');
  const [about, setAbout] = useState(profile?.about ?? '');
  const [avatarUri, setAvatarUri] = useState<string | null>(profile?.avatar_url ?? null);
  const [genderPickerVisible, setGenderPickerVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handlePickImage = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setErrors((e) => ({ ...e, global: 'Photo library permission is required to upload a photo.' }));
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploadingAvatar(true);

    try {
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const filePath = `${profile!.id}/avatar.${ext}`;

      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, arrayBuffer, { contentType: mimeType, upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile!.id);
      setAvatarUri(publicUrl);
      setProfile({ ...profile!, avatar_url: publicUrl });
    } catch {
      setErrors((e) => ({ ...e, global: 'Failed to upload photo. Please try again.' }));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!fullName.trim() || fullName.trim().length < 2) {
      next.fullName = 'Full name must be at least 2 characters';
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = 'Enter a valid email address';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setLoading(true);

    const update: Record<string, string | null> = {
      full_name: fullName.trim(),
      email: email.trim() || null,
      gender: gender || null,
      about: about.trim() || null,
      date_of_birth: dob ? dob.toISOString().split('T')[0] : null,
    };

    const { data, error: updateError } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', profile!.id)
      .select()
      .single();

    if (updateError) {
      setErrors({ global: 'Failed to update profile. Please try again.' });
    } else if (data) {
      setProfile(data);
      router.back();
    }
    setLoading(false);
  };

  const selectedGenderLabel = GENDER_OPTIONS.find((o) => o.value === gender)?.label ?? '';
  const initials = (fullName || profile?.full_name || '?').charAt(0).toUpperCase();

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Edit Profile</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar with upload */}
          <View style={styles.avatarRow}>
            <TouchableOpacity onPress={handlePickImage} activeOpacity={0.85} style={styles.avatarTouchable}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
              )}
              <View style={styles.cameraBtn}>
                {uploadingAvatar ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Camera size={14} color={Colors.white} />
                )}
              </View>
            </TouchableOpacity>
            <Text style={styles.avatarHint}>Tap to change photo</Text>
          </View>

          {errors.global && (
            <Text style={styles.globalError}>{errors.global}</Text>
          )}

          {/* Full Name */}
          <Input
            label="Full Name"
            value={fullName}
            onChangeText={(t) => { setFullName(t); setErrors((e) => ({ ...e, fullName: '' })); }}
            placeholder="Your full name"
            error={errors.fullName}
            autoCapitalize="words"
            prefix={<User size={16} color={Colors.textTertiary} />}
          />

          {/* Phone — read only */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Phone Number</Text>
            <View style={styles.readOnlyWrapper}>
              <View style={styles.fieldPrefix}>
                <Phone size={16} color={Colors.textTertiary} />
              </View>
              <Text style={styles.readOnlyText}>+91 {profile?.mobile}</Text>
            </View>
          </View>

          {/* Email */}
          <Input
            label="Email"
            value={email}
            onChangeText={(t) => { setEmail(t); setErrors((e) => ({ ...e, email: '' })); }}
            placeholder="your@email.com"
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
            prefix={<Mail size={16} color={Colors.textTertiary} />}
          />

          {/* Date of Birth */}
          <DatePickerField
            label="Date of Birth"
            value={dob}
            onChange={(d) => setDob(d)}
            maxDate={new Date()}
            minDate={new Date(1900, 0, 1)}
          />

          {/* Gender */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Gender</Text>
            <TouchableOpacity
              style={styles.selectWrapper}
              onPress={() => setGenderPickerVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={[styles.selectText, !selectedGenderLabel && styles.selectPlaceholder]}>
                {selectedGenderLabel || 'Select Gender'}
              </Text>
              <ChevronDown size={18} color={Colors.neutral[400]} />
            </TouchableOpacity>
          </View>

          {/* About Yourself */}
          <Input
            label="About Yourself"
            value={about}
            onChangeText={setAbout}
            placeholder="Tell us a little about yourself"
            multiline
            numberOfLines={3}
            style={styles.textArea}
            prefix={<MessageSquare size={16} color={Colors.textTertiary} />}
          />

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Button label="Save" onPress={handleSave} loading={loading} size="lg" fullWidth />
            </View>
          </View>
        </ScrollView>
      </View>

      {/* Gender Picker Modal */}
      <Modal
        visible={genderPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGenderPickerVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setGenderPickerVisible(false)}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Select Gender</Text>
            {GENDER_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.pickerOption, gender === opt.value && styles.pickerOptionActive]}
                onPress={() => { setGender(opt.value); setGenderPickerVisible(false); }}
              >
                <Text style={[styles.pickerOptionText, gender === opt.value && styles.pickerOptionTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
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
  avatarRow: { alignItems: 'center', gap: Spacing[2], marginBottom: Spacing[2] },
  avatarTouchable: { position: 'relative' },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.primarySurface,
  },
  avatarImage: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: Colors.primarySurface,
  },
  avatarText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['3xl'],
    color: Colors.white,
  },
  cameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  avatarHint: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  globalError: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.error,
    textAlign: 'center',
  },
  field: { gap: Spacing[1] },
  fieldLabel: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  readOnlyWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.neutral[50],
    minHeight: 50,
    gap: 0,
  },
  fieldPrefix: {
    paddingLeft: Spacing[3],
    justifyContent: 'center',
  },
  readOnlyText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textTertiary,
    paddingHorizontal: Spacing[2],
    paddingVertical: Spacing[3],
  },
  selectWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    minHeight: 50,
    paddingHorizontal: Spacing[4],
  },
  selectText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  selectPlaceholder: {
    color: Colors.textDisabled,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: Spacing[3],
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing[3],
    marginTop: Spacing[2],
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing[3],
    backgroundColor: Colors.white,
  },
  cancelText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[6],
  },
  pickerCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    width: '100%',
    overflow: 'hidden',
    ...Shadow.lg,
  },
  pickerTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  pickerOption: {
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  pickerOptionActive: {
    backgroundColor: Colors.primarySurface,
  },
  pickerOptionText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  pickerOptionTextActive: {
    color: Colors.primary,
  },
});
