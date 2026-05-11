import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Plus, MapPin, Pencil, Trash2, Hop as Home, Briefcase, MoveHorizontal as MoreHorizontal, Star, Building2, TriangleAlert as AlertTriangle } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Address } from '@/types/database';
import EmptyState from '@/components/ui/EmptyState';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';

const LABEL_ICON: Record<string, React.ReactNode> = {
  Home: <Home size={14} color={Colors.primary} />,
  Office: <Briefcase size={14} color={Colors.primary} />,
  Other: <MapPin size={14} color={Colors.primary} />,
};

const PLACE_CATEGORY_LABEL: Record<string, string> = {
  individual: 'Individual',
  apartment: 'Apartment',
  business: 'Business',
  temple: 'Temple',
};

export default function AddressesScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Address | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [settingDefault, setSettingDefault] = useState<string | null>(null);

  const load = async () => {
    if (!profile) return;
    const { data: { user } } = await supabase.auth.getUser();
    const uid = user?.id ?? profile.id;
    const { data } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', uid)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });
    if (data) setAddresses(data);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, [profile]);

  useFocusEffect(
    useCallback(() => { load(); }, [profile])
  );

  const confirmDelete = (addr: Address) => {
    setDeleteError('');
    setDeleteTarget(addr);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');

    const { error } = await supabase.from('addresses').delete().eq('id', deleteTarget.id);

    if (error) {
      setDeleteError(error.message);
      setDeleting(false);
      return;
    }

    // If we deleted the default, promote the next address
    if (deleteTarget.is_default && profile) {
      const remaining = addresses.filter((a) => a.id !== deleteTarget.id);
      if (remaining.length > 0) {
        await supabase.from('addresses').update({ is_default: true }).eq('id', remaining[0].id);
      }
    }

    setDeleting(false);
    setDeleteTarget(null);
    await load();
  };

  const handleSetDefault = async (addr: Address) => {
    if (!profile || addr.is_default) return;
    setSettingDefault(addr.id);
    await supabase.from('addresses').update({ is_default: false }).eq('user_id', profile.id);
    await supabase.from('addresses').update({ is_default: true }).eq('id', addr.id);
    setSettingDefault(null);
    await load();
  };

  const formatAddress = (addr: Address) => {
    const parts: string[] = [];
    if (addr.apartment_name) parts.push(addr.apartment_name);
    parts.push(addr.street);
    parts.push(`${addr.city}, ${addr.state} - ${addr.pincode}`);
    if (addr.landmark) parts.push(`Near ${addr.landmark}`);
    return parts;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>My Addresses</Text>
        <TouchableOpacity onPress={() => router.push('/(customer)/address-form')} style={styles.addBtn}>
          <Plus size={20} color={Colors.white} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {!loading && addresses.length === 0 ? (
          <EmptyState
            icon={<MapPin size={48} color={Colors.neutral[400]} />}
            title="No addresses saved"
            description="Add a delivery address to get started"
            actionLabel="Add Address"
            onAction={() => router.push('/(customer)/address-form')}
          />
        ) : (
          <View style={styles.list}>
            {addresses.map((addr) => {
              const addrAny = addr as any;
              const lines = formatAddress(addr);
              const isSettingThisDefault = settingDefault === addr.id;

              return (
                <View
                  key={addr.id}
                  style={[styles.addressCard, addr.is_default && styles.addressCardDefault]}
                >
                  {addr.is_default && (
                    <View style={styles.defaultBanner}>
                      <Star size={11} color={Colors.primary} fill={Colors.primary} />
                      <Text style={styles.defaultBannerText}>Default delivery address</Text>
                    </View>
                  )}

                  <View style={styles.cardTop}>
                    <View style={styles.labelRow}>
                      <View style={styles.labelIconWrap}>
                        {LABEL_ICON[addr.label] ?? <MapPin size={14} color={Colors.primary} />}
                      </View>
                      <Text style={styles.labelText}>{addr.label}</Text>
                      {addrAny.place_category && addrAny.place_category !== 'individual' && (
                        <View style={styles.categoryPill}>
                          <Text style={styles.categoryText}>
                            {PLACE_CATEGORY_LABEL[addrAny.place_category] ?? addrAny.place_category}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.actions}>
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => router.push({ pathname: '/(customer)/address-form', params: { id: addr.id } })}
                      >
                        <Pencil size={15} color={Colors.textTertiary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.iconBtn, styles.deleteBtn]}
                        onPress={() => confirmDelete(addr)}
                      >
                        <Trash2 size={15} color={Colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.addressLines}>
                    {lines.map((line, i) => (
                      <Text key={i} style={[styles.addressLine, i === 0 && styles.addressLineFirst]}>
                        {line}
                      </Text>
                    ))}
                  </View>

                  {!addr.is_default && (
                    <TouchableOpacity
                      style={[styles.setDefaultBtn, isSettingThisDefault && styles.setDefaultBtnLoading]}
                      onPress={() => handleSetDefault(addr)}
                      disabled={!!settingDefault}
                    >
                      <Star size={13} color={isSettingThisDefault ? Colors.textDisabled : Colors.primary} />
                      <Text style={[styles.setDefaultText, isSettingThisDefault && styles.setDefaultTextLoading]}>
                        {isSettingThisDefault ? 'Setting...' : 'Set as default'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}

            <Button
              label="Add New Address"
              onPress={() => router.push('/(customer)/address-form')}
              variant="outline"
              fullWidth
            />
          </View>
        )}
      </ScrollView>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={!!deleteTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteTarget(null)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.sheet}>
            <View style={modalStyles.iconWrap}>
              <View style={modalStyles.iconBg}>
                <Trash2 size={28} color={Colors.error} />
              </View>
            </View>

            <Text style={modalStyles.title}>Delete Address?</Text>
            <Text style={modalStyles.body}>
              This will permanently remove your{' '}
              <Text style={modalStyles.bold}>{deleteTarget?.label}</Text> address at{' '}
              <Text style={modalStyles.bold}>{deleteTarget?.street}</Text>. This action cannot be undone.
            </Text>

            {deleteTarget?.is_default && addresses.length > 1 && (
              <View style={modalStyles.warningBox}>
                <AlertTriangle size={14} color={Colors.warning} />
                <Text style={modalStyles.warningText}>
                  This is your default address. The next address will automatically become the default.
                </Text>
              </View>
            )}

            {deleteError ? (
              <View style={modalStyles.errorBox}>
                <Text style={modalStyles.errorText}>{deleteError}</Text>
              </View>
            ) : null}

            <View style={modalStyles.buttons}>
              <TouchableOpacity
                style={modalStyles.cancelBtn}
                onPress={() => { setDeleteTarget(null); setDeleteError(''); }}
                disabled={deleting}
              >
                <Text style={modalStyles.cancelText}>Keep Address</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.deleteBtn, deleting && modalStyles.deleteBtnLoading]}
                onPress={handleDelete}
                disabled={deleting}
              >
                <Trash2 size={15} color={Colors.white} />
                <Text style={modalStyles.deleteText}>
                  {deleting ? 'Deleting...' : 'Yes, Delete'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: Spacing[5], gap: Spacing[4] },
  list: { gap: Spacing[3] },

  addressCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[3],
    borderWidth: 1.5,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  addressCardDefault: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },

  defaultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
    backgroundColor: Colors.primaryLight + '33',
    paddingHorizontal: Spacing[2],
    paddingVertical: 4,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
    marginBottom: -Spacing[1],
  },
  defaultBannerText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: 11,
    color: Colors.primaryDark,
    letterSpacing: 0.2,
  },

  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  labelIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  categoryPill: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.neutral[100],
  },
  categoryText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: 11,
    color: Colors.textTertiary,
  },

  actions: { flexDirection: 'row', gap: Spacing[1] },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: Colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: { backgroundColor: '#FEE2E2' },

  addressLines: { gap: 3 },
  addressLine: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  addressLineFirst: {
    fontFamily: Typography.fontFamily.sansMedium,
    color: Colors.textPrimary,
  },

  setDefaultBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
    marginTop: Spacing[1],
  },
  setDefaultBtnLoading: {
    borderColor: Colors.border,
    backgroundColor: Colors.neutral[50],
  },
  setDefaultText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.primary,
  },
  setDefaultTextLoading: { color: Colors.textDisabled },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[5],
  },
  sheet: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing[6],
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    gap: Spacing[3],
    ...Shadow.lg,
  },
  iconWrap: { marginBottom: Spacing[1] },
  iconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'],
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  body: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  bold: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    color: Colors.textPrimary,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    backgroundColor: '#FEF3C7',
    borderRadius: Radius.md,
    padding: Spacing[3],
    width: '100%',
  },
  warningText: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: '#92400E',
    lineHeight: 18,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing[3],
    width: '100%',
    marginTop: Spacing[2],
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: Colors.error,
  },
  deleteBtnLoading: { opacity: 0.6 },
  deleteText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.white,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: Radius.md,
    padding: Spacing[3],
    width: '100%',
  },
  errorText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.error,
    textAlign: 'center',
  },
});
