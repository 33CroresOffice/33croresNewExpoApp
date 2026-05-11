import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, X, ShieldCheck, User, Trash2, RefreshCw } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Profile, AdminRole } from '@/types/database';

const ADMIN_ROLES: { value: AdminRole; label: string; description: string; color: string }[] = [
  { value: 'super_admin', label: 'Super Admin', description: 'Full access + manage other admins', color: '#2D5A27' },
  { value: 'finance',     label: 'Finance',     description: 'Finance, payments & ledger',      color: '#1565C0' },
  { value: 'operations',  label: 'Operations',  description: 'Orders, procurement & riders',    color: '#6A1B9A' },
  { value: 'crm',         label: 'CRM',         description: 'Customers, segments & tasks',     color: '#C62828' },
  { value: 'catalog',     label: 'Catalog',     description: 'Plans & flower types',            color: '#E65100' },
];

const ROLE_COLOR: Record<AdminRole, string> = {
  super_admin: '#2D5A27',
  finance:     '#1565C0',
  operations:  '#6A1B9A',
  crm:         '#C62828',
  catalog:     '#E65100',
};

const ROLE_SURFACE: Record<AdminRole, string> = {
  super_admin: '#EBF5E8',
  finance:     '#E3F2FD',
  operations:  '#F3E5F5',
  crm:         '#FFEBEE',
  catalog:     '#FFF3E0',
};

interface AdminUser extends Profile {
  auth_email?: string;
}

export default function AdminUsersScreen() {
  const insets = useSafeAreaInsets();
  const { isSuperAdmin } = useAuthStore();

  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ full_name: '', email: '', password: '', admin_role: 'operations' as AdminRole });
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editRole, setEditRole] = useState<AdminRole>('operations');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'admin')
        .order('created_at', { ascending: true });
      if (!err && data) setAdmins(data as AdminUser[]);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!isSuperAdmin) {
    return (
      <View style={styles.accessDenied}>
        <ShieldCheck size={48} color={Colors.textTertiary} strokeWidth={1.5} />
        <Text style={styles.accessDeniedTitle}>Access Restricted</Text>
        <Text style={styles.accessDeniedSub}>Only Super Admins can manage admin users.</Text>
      </View>
    );
  }

  const openAdd = () => {
    setForm({ full_name: '', email: '', password: '', admin_role: 'operations' });
    setError('');
    setShowModal(true);
  };

  const saveNew = async () => {
    if (!form.full_name.trim() || !form.email.trim() || !form.password.trim()) {
      setError('All fields are required.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-admin-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            full_name: form.full_name.trim(),
            email: form.email.trim().toLowerCase(),
            password: form.password,
            admin_role: form.admin_role,
          }),
        }
      );
      const json = await res.json();
      if (json.error) { setError(json.error); setSaving(false); return; }
      setShowModal(false);
      load();
    } catch (e) {
      setError('Something went wrong.');
    }
    setSaving(false);
  };

  const openEdit = (admin: AdminUser) => {
    setEditTarget(admin);
    setEditRole(admin.admin_role ?? 'operations');
    setEditError('');
    setShowEditModal(true);
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setEditSaving(true);
    setEditError('');
    const { error: err } = await supabase
      .from('profiles')
      .update({ admin_role: editRole })
      .eq('id', editTarget.id);
    if (err) { setEditError(err.message); setEditSaving(false); return; }
    setShowEditModal(false);
    load();
    setEditSaving(false);
  };

  const isWeb = Platform.OS === 'web';

  return (
    <View style={[styles.root, !isWeb && { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Admin Users</Text>
          <Text style={styles.subtitle}>{admins.length} admin{admins.length !== 1 ? 's' : ''} configured</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.refreshBtn} onPress={load}>
            <RefreshCw size={16} color={Colors.textSecondary} strokeWidth={1.8} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
            <Plus size={16} color={Colors.white} strokeWidth={2} />
            <Text style={styles.addBtnText}>New Admin</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {ADMIN_ROLES.map(roleInfo => {
            const group = admins.filter(a => a.admin_role === roleInfo.value);
            return (
              <View key={roleInfo.value} style={styles.roleGroup}>
                <View style={[styles.roleGroupHeader, { borderLeftColor: roleInfo.color }]}>
                  <View style={[styles.roleBadge, { backgroundColor: roleInfo.color + '18' }]}>
                    <ShieldCheck size={14} color={roleInfo.color} strokeWidth={2} />
                    <Text style={[styles.roleBadgeText, { color: roleInfo.color }]}>{roleInfo.label}</Text>
                  </View>
                  <Text style={styles.roleDesc}>{roleInfo.description}</Text>
                  <Text style={styles.roleCount}>{group.length} user{group.length !== 1 ? 's' : ''}</Text>
                </View>
                {group.length === 0 ? (
                  <Text style={styles.emptyGroup}>No admins with this role</Text>
                ) : (
                  group.map(admin => (
                    <View key={admin.id} style={styles.adminCard}>
                      <View style={[styles.adminAvatar, { backgroundColor: roleInfo.color + '18' }]}>
                        <Text style={[styles.adminAvatarText, { color: roleInfo.color }]}>
                          {admin.full_name?.[0]?.toUpperCase() ?? 'A'}
                        </Text>
                      </View>
                      <View style={styles.adminInfo}>
                        <Text style={styles.adminName}>{admin.full_name ?? 'Unnamed'}</Text>
                        <Text style={styles.adminEmail}>{admin.email ?? admin.mobile}</Text>
                      </View>
                      {admin.admin_role !== 'super_admin' && (
                        <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(admin)}>
                          <Text style={styles.editBtnText}>Change Role</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalTop}>
              <Text style={styles.modalTitle}>Create Admin User</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <X size={20} color={Colors.textSecondary} strokeWidth={1.8} />
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Full Name *</Text>
              <TextInput
                style={styles.input}
                value={form.full_name}
                onChangeText={v => setForm(p => ({ ...p, full_name: v }))}
                placeholder="e.g. Rahul Sharma"
                placeholderTextColor={Colors.textDisabled}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Email Address *</Text>
              <TextInput
                style={styles.input}
                value={form.email}
                onChangeText={v => setForm(p => ({ ...p, email: v }))}
                placeholder="admin@example.com"
                placeholderTextColor={Colors.textDisabled}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Password *</Text>
              <TextInput
                style={styles.input}
                value={form.password}
                onChangeText={v => setForm(p => ({ ...p, password: v }))}
                placeholder="Min 6 characters"
                placeholderTextColor={Colors.textDisabled}
                secureTextEntry
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Admin Role *</Text>
              <View style={styles.roleGrid}>
                {ADMIN_ROLES.filter(r => r.value !== 'super_admin').map(r => (
                  <TouchableOpacity
                    key={r.value}
                    style={[
                      styles.roleOption,
                      form.admin_role === r.value && { borderColor: r.color, backgroundColor: r.color + '10' },
                    ]}
                    onPress={() => setForm(p => ({ ...p, admin_role: r.value }))}
                  >
                    <Text style={[styles.roleOptionLabel, form.admin_role === r.value && { color: r.color }]}>{r.label}</Text>
                    <Text style={styles.roleOptionDesc}>{r.description}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveNew} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.saveText}>Create Admin</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showEditModal} transparent animationType="fade" onRequestClose={() => setShowEditModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalTop}>
              <Text style={styles.modalTitle}>Change Role</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <X size={20} color={Colors.textSecondary} strokeWidth={1.8} />
              </TouchableOpacity>
            </View>

            {editTarget && (
              <View style={styles.editUserRow}>
                <View style={styles.editUserAvatar}>
                  <User size={18} color={Colors.textSecondary} strokeWidth={1.8} />
                </View>
                <View>
                  <Text style={styles.editUserName}>{editTarget.full_name ?? 'Unnamed'}</Text>
                  <Text style={styles.editUserEmail}>{editTarget.email ?? editTarget.mobile}</Text>
                </View>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.label}>Select New Role</Text>
              <View style={styles.roleGrid}>
                {ADMIN_ROLES.filter(r => r.value !== 'super_admin').map(r => (
                  <TouchableOpacity
                    key={r.value}
                    style={[
                      styles.roleOption,
                      editRole === r.value && { borderColor: r.color, backgroundColor: r.color + '10' },
                    ]}
                    onPress={() => setEditRole(r.value)}
                  >
                    <Text style={[styles.roleOptionLabel, editRole === r.value && { color: r.color }]}>{r.label}</Text>
                    <Text style={styles.roleOptionDesc}>{r.description}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {editError ? <Text style={styles.errorText}>{editError}</Text> : null}

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowEditModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveEdit} disabled={editSaving}>
                {editSaving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.saveText}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: Spacing[6], paddingTop: Spacing[6], paddingBottom: Spacing[4] },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.textPrimary },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  refreshBtn: { width: 36, height: 36, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], backgroundColor: Colors.primary, borderRadius: Radius.md },
  addBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: Spacing[6], gap: Spacing[5] },

  roleGroup: { gap: Spacing[2] },
  roleGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], borderLeftWidth: 3, paddingLeft: Spacing[3], paddingVertical: Spacing[1], marginBottom: Spacing[1] },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: Spacing[2], borderRadius: Radius.full },
  roleBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs },
  roleDesc: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  roleCount: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textTertiary },
  emptyGroup: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textDisabled, paddingLeft: Spacing[3], paddingVertical: Spacing[2] },

  adminCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border },
  adminAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  adminAvatarText: { fontFamily: Typography.fontFamily.sansBold, fontSize: Typography.size.base },
  adminInfo: { flex: 1 },
  adminName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  adminEmail: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },
  editBtn: { paddingVertical: Spacing[1], paddingHorizontal: Spacing[3], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  editBtnText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11, color: Colors.textSecondary },

  accessDenied: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing[3], padding: Spacing[8] },
  accessDeniedTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  accessDeniedSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textTertiary, textAlign: 'center' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: Spacing[5] },
  modal: { width: '100%', maxWidth: 520, backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[6], gap: Spacing[4] },
  modalTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },

  formGroup: { gap: Spacing[2] },
  label: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[3], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary, backgroundColor: Colors.white },

  roleGrid: { gap: Spacing[2] },
  roleOption: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing[3], gap: 2 },
  roleOptionLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  roleOptionDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },

  editUserRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], backgroundColor: Colors.neutral[50], borderRadius: Radius.md, padding: Spacing[3] },
  editUserAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  editUserName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  editUserEmail: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },

  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error },
  modalFooter: { flexDirection: 'row', gap: Spacing[3] },
  cancelBtn: { flex: 1, paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  saveBtn: { flex: 2, paddingVertical: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  saveText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
});
