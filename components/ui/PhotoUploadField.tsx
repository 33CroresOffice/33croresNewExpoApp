import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { Camera, Upload, X, Image as ImageIcon } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';

interface Props {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  storagePath: string;
  bucket?: string;
  aspectRatio?: [number, number];
  hint?: string;
}

export default function PhotoUploadField({
  label,
  value,
  onChange,
  storagePath,
  bucket = 'riders',
  aspectRatio = [4, 3],
  hint,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!value) { setPreviewUrl(null); return; }
    if (bucket === 'riders') { setPreviewUrl(value); return; }
    supabase.storage.from(bucket).createSignedUrl(value, 3600).then(({ data }) => setPreviewUrl(data?.signedUrl ?? null));
  }, [bucket, value]);

  const pickAndUpload = async () => {
    setError(null);

    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setError('Photo library permission is required.');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: aspectRatio,
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploading(true);

    try {
      const mimeType = asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
      const ext = mimeType === 'image/png' ? 'png' : 'jpg';
      const filePath = bucket === 'provider-photos'
        ? `${storagePath}-${Date.now()}.${ext}`
        : `${storagePath}.${ext}`;

      const uploadBody = Platform.OS === 'web'
        ? await (await fetch(asset.uri)).blob()
        : Uint8Array.from(atob(asset.base64 ?? ''), (character) => character.charCodeAt(0));

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, uploadBody, { contentType: mimeType, upsert: bucket !== 'provider-photos' });

      if (uploadError) throw uploadError;

      if (bucket === 'provider-photos') {
        setPreviewUrl(asset.uri);
      } else {
        const { data: signedData } = await supabase.storage.from(bucket).createSignedUrl(filePath, 3600);
        setPreviewUrl(signedData?.signedUrl ?? null);
      }
      onChange(filePath);
    } catch (e: unknown) {
      console.error('Photo upload failed', e);
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const remove = () => onChange(null);

  return (
    <View style={st.wrapper}>
      <Text style={st.label}>{label}</Text>
      {hint && <Text style={st.hint}>{hint}</Text>}

      {value ? (
        <View style={st.previewWrap}>
          <Image source={previewUrl ? { uri: previewUrl } : undefined} style={st.preview} resizeMode="cover" />
          <View style={st.previewActions}>
            <TouchableOpacity style={st.replaceBtn} onPress={pickAndUpload} activeOpacity={0.8} disabled={uploading}>
              {uploading ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Upload size={13} color={Colors.primary} strokeWidth={2} />
                  <Text style={st.replaceBtnText}>Replace</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={st.removeBtn} onPress={remove} activeOpacity={0.8}>
              <X size={13} color={Colors.error} strokeWidth={2} />
              <Text style={st.removeBtnText}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={[st.uploadBtn, uploading && st.uploadBtnDisabled]}
          onPress={pickAndUpload}
          activeOpacity={0.8}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <>
              <View style={st.uploadIcon}>
                <ImageIcon size={20} color={Colors.textTertiary} strokeWidth={1.5} />
              </View>
              <Text style={st.uploadText}>Tap to upload photo</Text>
              <Text style={st.uploadSubText}>JPG or PNG</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {error && <Text style={st.errorText}>{error}</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  wrapper: { gap: Spacing[1], marginBottom: Spacing[3] },
  label: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  hint: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginBottom: 2,
  },
  uploadBtn: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing[5],
    gap: Spacing[1],
    backgroundColor: Colors.neutral[50],
  },
  uploadBtnDisabled: { opacity: 0.6 },
  uploadIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing[1],
  },
  uploadText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  uploadSubText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  previewWrap: { gap: Spacing[2] },
  preview: {
    width: '100%',
    height: 140,
    borderRadius: Radius.md,
    backgroundColor: Colors.neutral[100],
  },
  previewActions: { flexDirection: 'row', gap: Spacing[2] },
  replaceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[1],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  replaceBtnText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.primary,
  },
  removeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[1],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.error + '40',
    backgroundColor: '#FFF5F5',
  },
  removeBtnText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.error,
  },
  errorText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.error,
  },
});
