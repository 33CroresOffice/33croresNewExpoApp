import React, { useEffect, useState, useCallback } from 'react';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
  TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, X, RefreshCw, ChevronRight, Lock, Clock as Unlock, Shield, CircleCheck as CheckCircle, Clock, SlidersHorizontal, CircleAlert as AlertCircle, Layers, Users } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Profile, AdminRole, CustomRole } from '@/types/database';
import ModuleGuard from '@/components/admin/ModuleGuard';

const BUILT_IN_ROLES: { value: AdminRole; label: string; description: string; color: string; bg: string }[] = [
  { value: 'super_admin', label: 'Super Admin', description: 'Full access + manage other admins', color: Colors.primary,  bg: Colors.primarySurface },
  { value: 'finance',     label: 'Finance',     description: 'Finance, payments & ledger',        color: '#1565C0',        bg: '#E3F2FD' },
  { value: 'operations',  label: 'Operations',  description: 'Orders, procurement & riders',      color: '#6A1B9A',        bg: '#F3E5F5' },
  { value: 'crm',         label: 'CRM',         description: 'Customers, segments & tasks',       color: Colors.secondary, bg: Colors.secondarySurface },
  { value: 'catalog',     label: 'Catalog',     description: 'Plans & flower types',              color: Colors.warning,   bg: Colors.warningSurface },
];

type ModuleRow = { key: string; label: string; description: string; sort_order: number };
type Override = { id: string; module: string; access: boolean; note: string; created_at: string; granted_by_name?: string };

interface AdminUser extends Profile {
  email?: string;
  custom_role?: CustomRole | null;
}

// Returns display info for a user's current role (built-in or custom)
function resolveRoleDisplay(
  user: AdminUser,
  customRoles: CustomRole[]
): { label: string; color: string; bg: string; isCustom: boolean } {
  if (user.custom_role_id) {
    const cr = user.custom_role ?? customRoles.find((r) => r.id === user.custom_role_id);
    if (cr) return { label: cr.name, color: cr.color, bg: cr.color + '20', isCustom: true };
  }
  const ri = BUILT_IN_ROLES.find((r) => r.value === user.admin_role);
  if (ri) return { label: ri.label, color: ri.color, bg: ri.bg, isCustom: false };
  return { label: 'Unknown', color: Colors.neutral[500], bg: Colors.neutral[100], isCustom: false };
}

export default function AdminUsersScreen() {
  return (
    <ModuleGuard module="admin_users">
      <AdminUsersContent />
    </ModuleGuard>
  );
}

function AdminUsersContent() {
  const insets = useSafeAreaInsets();
  const { profile: currentUser, refreshModules } = useAuthStore();

  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createRoleMode, setCreateRoleMode] = useState<'builtin' | 'custom'>('builtin');
  const [form, setForm] = useState({ full_name: '', email: '', password: '', admin_role: 'operations' as AdminRole, custom_role_id: '' });

  // Drawer
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [roleModules, setRoleModules] = useState<string[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [overrideSaving, setOverrideSaving] = useState<string | null>(null);
  const [overrideNote, setOverrideNote] = useState('');

  // Change role modal
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [changeRoleMode, setChangeRoleMode] = useState<'builtin' | 'custom'>('builtin');
  const [newBuiltinRole, setNewBuiltinRole] = useState<AdminRole>('operations');
  const [newCustomRoleId, setNewCustomRoleId] = useState('');
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [adminRes, modRes, crRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'admin').order('created_at', { ascending: true }),
      supabase.from('modules').select('*').order('sort_order'),
      supabase.from('custom_roles').select('*').order('name'),
    ]);
    if (adminRes.data) setAdmins(adminRes.data as AdminUser[]);
    if (modRes.data) setModules(modRes.data);
    if (crRes.data) setCustomRoles(crRes.data);
    setLoading(false);
  }, []);

  usePageVisibility(load);

  const openDrawer = async (user: AdminUser) => {
    setSelectedUser(user);
    setDrawerLoading(true);
    setOverrideNote('');

    // Load overrides + base role modules
    const [ovRes, baseModRes] = await Promise.all([
      supabase
        .from('user_module_overrides')
        .select('id, module, access, note, created_at, granted_by')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      user.custom_role_id
        ? supabase.from('custom_role_modules').select('module').eq('custom_role_id', user.custom_role_id)
        : supabase.from('role_modules').select('module').eq('role', user.admin_role ?? ''),
    ]);

    let ovWithNames: Override[] = [];
    if (ovRes.data) {
      const granterIds = [...new Set(ovRes.data.map((o: any) => o.granted_by).filter(Boolean))];
      let granterMap: Record<string, string> = {};
      if (granterIds.length > 0) {
        const { data: granters } = await supabase.from('profiles').select('id, full_name').in('id', granterIds);
        if (granters) granterMap = Object.fromEntries(granters.map((g: any) => [g.id, g.full_name]));
      }
      ovWithNames = ovRes.data.map((o: any) => ({
        ...o,
        granted_by_name: o.granted_by ? granterMap[o.granted_by] : undefined,
      }));
    }

    setOverrides(ovWithNames);
    setRoleModules((baseModRes.data ?? []).map((r: any) => r.module));
    setDrawerLoading(false);
  };

  const setModuleOverride = async (moduleKey: string, access: boolean | null) => {
    if (!selectedUser) return;
    setOverrideSaving(moduleKey);

    if (access === null) {
      const { error } = await supabase
        .from('user_module_overrides')
        .delete()
        .eq('user_id', selectedUser.id)
        .eq('module', moduleKey);
      if (!error) {
        setOverrides((prev) => prev.filter((o) => o.module !== moduleKey));
        await refreshModules();
      }
    } else {
      const existing = overrides.find((o) => o.module === moduleKey);
      if (existing) {
        const { error } = await supabase
          .from('user_module_overrides')
          .update({ access, note: overrideNote, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (!error) setOverrides((prev) => prev.map((o) => o.module === moduleKey ? { ...o, access, note: overrideNote } : o));
      } else {
        const { data, error } = await supabase
          .from('user_module_overrides')
          .insert({ user_id: selectedUser.id, module: moduleKey, access, note: overrideNote, granted_by: currentUser?.id })
          .select('id, module, access, note, created_at, granted_by')
          .single();
        if (!error && data) setOverrides((prev) => [{ ...data, granted_by_name: currentUser?.full_name ?? undefined }, ...prev]);
      }
      await refreshModules();
    }
    setOverrideSaving(null);
  };

  const saveRole = async () => {
    if (!selectedUser) return;
    setRoleSaving(true);
    setRoleError('');

    const update: Record<string, unknown> = {};
    if (changeRoleMode === 'builtin') {
      update.admin_role = newBuiltinRole;
      update.custom_role_id = null;
    } else {
      if (!newCustomRoleId) { setRoleError('Select a custom role.'); setRoleSaving(false); return; }
      update.admin_role = null;
      update.custom_role_id = newCustomRoleId;
    }

    const { error } = await supabase.from('profiles').update(update).eq('id', selectedUser.id);
    if (error) { setRoleError(error.message); setRoleSaving(false); return; }

    const updatedUser = { ...selectedUser, ...update } as AdminUser;
    setSelectedUser(updatedUser);
    setAdmins((prev) => prev.map((a) => a.id === selectedUser.id ? updatedUser : a));

    // Reload role modules
    if (changeRoleMode === 'builtin') {
      const { data } = await supabase.from('role_modules').select('module').eq('role', newBuiltinRole);
      setRoleModules((data ?? []).map((r: any) => r.module));
    } else {
      const { data } = await supabase.from('custom_role_modules').select('module').eq('custom_role_id', newCustomRoleId);
      setRoleModules((data ?? []).map((r: any) => r.module));
    }

    setShowRoleModal(false);
    setRoleSaving(false);
    await refreshModules();
  };

  const saveNew = async () => {
    if (!form.full_name.trim() || !form.email.trim() || !form.password.trim()) {
      setCreateError('All fields are required.');
      return;
    }
    if (form.password.length < 6) { setCreateError('Password must be at least 6 characters.'); return; }
    if (createRoleMode === 'custom' && !form.custom_role_id) {
      setCreateError('Select a custom role.'); return;
    }
    setSaving(true);
    setCreateError('');

    const { data: { session } } = await supabase.auth.getSession();
    const body: Record<string, unknown> = {
      full_name: form.full_name.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
    };
    if (createRoleMode === 'builtin') {
      body.admin_role = form.admin_role;
    } else {
      body.custom_role_id = form.custom_role_id;
    }

    const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-admin-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.error) { setCreateError(json.error); setSaving(false); return; }
    setShowCreate(false);
    load();
    setSaving(false);
  };

  const isSuperAdminUser = (u: AdminUser) => u.admin_role === 'super_admin';
  const isWeb = Platform.OS === 'web';

  const getModuleState = (moduleKey: string): 'role' | 'granted' | 'revoked' => {
    const override = overrides.find((o) => o.module === moduleKey);
    if (!override) return 'role';
    return override.access ? 'granted' : 'revoked';
  };

  const isEffectivelyGranted = (moduleKey: string): boolean => {
    if (selectedUser?.admin_role === 'super_admin') return true;
    const state = getModuleState(moduleKey);
    if (state === 'granted') return true;
    if (state === 'revoked') return false;
    return roleModules.includes(moduleKey);
  };

  // Group admins: built-in roles first, then custom roles
  const builtinGroups = BUILT_IN_ROLES.map((ri) => ({
    ...ri,
    users: admins.filter((a) => !a.custom_role_id && a.admin_role === ri.value),
    isCustom: false as const,
    groupId: ri.value,
  }));

  const customGroups = customRoles.map((cr) => ({
    label: cr.name, color: cr.color, bg: cr.color + '20',
    users: admins.filter((a) => a.custom_role_id === cr.id),
    isCustom: true as const,
    groupId: cr.id,
  }));

  const allGroups = [...builtinGroups, ...customGroups];

  return (
    <View style={[styles.root, !isWeb && { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Admin Users</Text>
          <Text style={styles.subtitle}>{admins.length} admin{admins.length !== 1 ? 's' : ''} configured</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={load}>
            <RefreshCw size={16} color={Colors.textSecondary} strokeWidth={1.8} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => {
              setForm({ full_name: '', email: '', password: '', admin_role: 'operations', custom_role_id: '' });
              setCreateRoleMode('builtin');
              setCreateError('');
              setShowCreate(true);
            }}
          >
            <Plus size={16} color={Colors.white} />
            <Text style={styles.addBtnText}>New Admin</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <View style={styles.body}>
          {/* User list */}
          <ScrollView style={styles.userList} contentContainerStyle={styles.userListContent}>
            {allGroups.map((group) => (
              <View key={group.groupId} style={styles.roleGroup}>
                <View style={[styles.roleGroupLabel, { borderLeftColor: group.color }]}>
                  <View style={[styles.rolePill, { backgroundColor: group.bg }]}>
                    {group.isCustom
                      ? <Layers size={12} color={group.color} />
                      : <Shield size={12} color={group.color} />
                    }
                    <Text style={[styles.rolePillText, { color: group.color }]}>{group.label}</Text>
                  </View>
                  <Text style={styles.groupCount}>{group.users.length} user{group.users.length !== 1 ? 's' : ''}</Text>
                </View>
                {group.users.length === 0 ? (
                  <Text style={styles.emptyGroup}>No users</Text>
                ) : (
                  group.users.map((admin) => {
                    const disp = resolveRoleDisplay(admin, customRoles);
                    const isSelected = selectedUser?.id === admin.id;
                    return (
                      <TouchableOpacity
                        key={admin.id}
                        style={[styles.userCard, isSelected && styles.userCardSelected]}
                        onPress={() => openDrawer(admin)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.userAvatar, { backgroundColor: disp.bg }]}>
                          <Text style={[styles.userAvatarText, { color: disp.color }]}>
                            {admin.full_name?.[0]?.toUpperCase() ?? 'A'}
                          </Text>
                        </View>
                        <View style={styles.userCardInfo}>
                          <Text style={styles.userName}>{admin.full_name ?? 'Unnamed'}</Text>
                          <Text style={styles.userEmail} numberOfLines={1}>{admin.email ?? admin.mobile}</Text>
                        </View>
                        <ChevronRight size={14} color={isSelected ? Colors.primary : Colors.neutral[300]} />
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            ))}
          </ScrollView>

          {/* Right panel */}
          {selectedUser ? (
            <View style={styles.drawer}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* User header */}
                {(() => {
                  const disp = resolveRoleDisplay(selectedUser, customRoles);
                  return (
                    <View style={styles.drawerHeader}>
                      <View style={[styles.drawerAvatar, { backgroundColor: disp.bg }]}>
                        <Text style={[styles.drawerAvatarText, { color: disp.color }]}>
                          {selectedUser.full_name?.[0]?.toUpperCase() ?? 'A'}
                        </Text>
                      </View>
                      <View style={styles.drawerUserInfo}>
                        <Text style={styles.drawerUserName}>{selectedUser.full_name ?? 'Unnamed'}</Text>
                        <Text style={styles.drawerUserEmail}>{selectedUser.email ?? selectedUser.mobile}</Text>
                        <View style={styles.drawerRoleRow}>
                          <View style={[styles.rolePill, { backgroundColor: disp.bg }]}>
                            {disp.isCustom
                              ? <Layers size={11} color={disp.color} />
                              : <Shield size={11} color={disp.color} />
                            }
                            <Text style={[styles.rolePillText, { color: disp.color }]}>{disp.label}</Text>
                          </View>
                          {!isSuperAdminUser(selectedUser) && (
                            <TouchableOpacity
                              style={styles.changeRoleBtn}
                              onPress={() => {
                                if (selectedUser.custom_role_id) {
                                  setChangeRoleMode('custom');
                                  setNewCustomRoleId(selectedUser.custom_role_id);
                                } else {
                                  setChangeRoleMode('builtin');
                                  setNewBuiltinRole(selectedUser.admin_role ?? 'operations');
                                }
                                setRoleError('');
                                setShowRoleModal(true);
                              }}
                            >
                              <Text style={styles.changeRoleBtnText}>Change Role</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                      <TouchableOpacity onPress={() => setSelectedUser(null)}>
                        <X size={18} color={Colors.textTertiary} />
                      </TouchableOpacity>
                    </View>
                  );
                })()}

                {drawerLoading ? (
                  <View style={styles.drawerLoading}><ActivityIndicator color={Colors.primary} /></View>
                ) : isSuperAdminUser(selectedUser) ? (
                  <View style={styles.superNote}>
                    <CheckCircle size={20} color={Colors.success} />
                    <Text style={styles.superNoteText}>Super Admin has full access to all modules. Individual overrides do not apply.</Text>
                  </View>
                ) : (
                  <>
                    {/* Override note */}
                    <View style={styles.noteSection}>
                      <Text style={styles.sectionTitle}>Note / Reason (optional)</Text>
                      <TextInput
                        style={styles.noteInput}
                        value={overrideNote}
                        onChangeText={setOverrideNote}
                        placeholder="e.g. Temporarily granted for audit"
                        placeholderTextColor={Colors.textDisabled}
                        multiline
                      />
                      <Text style={styles.noteHint}>Recorded with any override you set below.</Text>
                    </View>

                    {/* Module access matrix */}
                    <View style={styles.modulesSection}>
                      <Text style={styles.sectionTitle}>Module Access</Text>
                      <View style={styles.legendRow}>
                        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.success }]} /><Text style={styles.legendText}>Has access</Text></View>
                        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.neutral[300] }]} /><Text style={styles.legendText}>No access</Text></View>
                      </View>
                      {modules.map((mod) => {
                        const state = getModuleState(mod.key);
                        const effective = isEffectivelyGranted(mod.key);
                        const roleDefault = roleModules.includes(mod.key);
                        const isSaving = overrideSaving === mod.key;

                        return (
                          <View key={mod.key} style={styles.moduleRow}>
                            <View style={styles.moduleLeft}>
                              <View style={[styles.moduleStatusDot, { backgroundColor: effective ? Colors.success : Colors.neutral[200] }]} />
                              <View style={styles.moduleTextBlock}>
                                <Text style={styles.moduleLabel}>{mod.label}</Text>
                                <View style={styles.moduleMetaRow}>
                                  {state === 'granted' && (
                                    <View style={styles.overrideBadge}>
                                      <Unlock size={10} color={Colors.success} />
                                      <Text style={[styles.overrideBadgeText, { color: Colors.success }]}>Extra Grant</Text>
                                    </View>
                                  )}
                                  {state === 'revoked' && (
                                    <View style={[styles.overrideBadge, { backgroundColor: Colors.errorSurface }]}>
                                      <Lock size={10} color={Colors.error} />
                                      <Text style={[styles.overrideBadgeText, { color: Colors.error }]}>Revoked</Text>
                                    </View>
                                  )}
                                  {state === 'role' && (
                                    <Text style={styles.moduleRoleMeta}>{roleDefault ? 'From role' : 'Not in role'}</Text>
                                  )}
                                </View>
                              </View>
                            </View>

                            {isSaving ? (
                              <ActivityIndicator size="small" color={Colors.primary} />
                            ) : (
                              <View style={styles.moduleActions}>
                                <TouchableOpacity
                                  style={[styles.moduleActionBtn, state === 'granted' && styles.moduleActionActive]}
                                  onPress={() => setModuleOverride(mod.key, state === 'granted' ? null : true)}
                                >
                                  <Unlock size={13} color={state === 'granted' ? Colors.success : Colors.neutral[400]} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[styles.moduleActionBtn, state === 'role' && styles.moduleActionDefault]}
                                  onPress={() => state !== 'role' && setModuleOverride(mod.key, null)}
                                >
                                  <Shield size={13} color={state === 'role' ? Colors.primary : Colors.neutral[400]} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[styles.moduleActionBtn, state === 'revoked' && styles.moduleActionRevoked]}
                                  onPress={() => setModuleOverride(mod.key, state === 'revoked' ? null : false)}
                                >
                                  <Lock size={13} color={state === 'revoked' ? Colors.error : Colors.neutral[400]} />
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>

                    {/* Override history */}
                    {overrides.length > 0 && (
                      <View style={styles.historySection}>
                        <Text style={styles.sectionTitle}>Override History</Text>
                        {overrides.map((ov) => (
                          <View key={ov.id} style={styles.historyRow}>
                            <View style={[styles.historyIcon, { backgroundColor: ov.access ? Colors.successSurface : Colors.errorSurface }]}>
                              {ov.access ? <Unlock size={12} color={Colors.success} /> : <Lock size={12} color={Colors.error} />}
                            </View>
                            <View style={styles.historyInfo}>
                              <Text style={styles.historyModule}>{modules.find((m) => m.key === ov.module)?.label ?? ov.module}</Text>
                              <Text style={styles.historyMeta}>
                                {ov.access ? 'Granted' : 'Revoked'}
                                {ov.granted_by_name ? ` by ${ov.granted_by_name}` : ''}
                                {ov.note ? ` — ${ov.note}` : ''}
                              </Text>
                              <View style={styles.historyTime}>
                                <Clock size={10} color={Colors.textDisabled} />
                                <Text style={styles.historyTimeText}>
                                  {new Date(ov.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </Text>
                              </View>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </ScrollView>
            </View>
          ) : (
            <View style={styles.emptyDrawer}>
              <SlidersHorizontal size={32} color={Colors.neutral[300]} strokeWidth={1.5} />
              <Text style={styles.emptyDrawerText}>Select a user to manage access</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Create admin modal ─────────────────────────────────────────────── */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalTop}>
              <Text style={styles.modalTitle}>Create Admin User</Text>
              <TouchableOpacity onPress={() => setShowCreate(false)}><X size={20} color={Colors.textSecondary} /></TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Full Name *</Text>
                <TextInput style={styles.input} value={form.full_name} onChangeText={(v) => setForm((p) => ({ ...p, full_name: v }))} placeholder="e.g. Rahul Sharma" placeholderTextColor={Colors.textDisabled} />
              </View>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Email Address *</Text>
                <TextInput style={styles.input} value={form.email} onChangeText={(v) => setForm((p) => ({ ...p, email: v }))} placeholder="admin@example.com" placeholderTextColor={Colors.textDisabled} autoCapitalize="none" keyboardType="email-address" />
              </View>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Password *</Text>
                <TextInput style={styles.input} value={form.password} onChangeText={(v) => setForm((p) => ({ ...p, password: v }))} placeholder="Min 6 characters" placeholderTextColor={Colors.textDisabled} secureTextEntry />
              </View>

              {/* Role type toggle */}
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Role Type *</Text>
                <View style={styles.roleTypeRow}>
                  <TouchableOpacity
                    style={[styles.roleTypeBtn, createRoleMode === 'builtin' && styles.roleTypeBtnActive]}
                    onPress={() => setCreateRoleMode('builtin')}
                  >
                    <Shield size={14} color={createRoleMode === 'builtin' ? Colors.primary : Colors.textTertiary} />
                    <Text style={[styles.roleTypeBtnText, createRoleMode === 'builtin' && styles.roleTypeBtnTextActive]}>Built-in Role</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.roleTypeBtn, createRoleMode === 'custom' && styles.roleTypeBtnActive]}
                    onPress={() => setCreateRoleMode('custom')}
                  >
                    <Layers size={14} color={createRoleMode === 'custom' ? Colors.primary : Colors.textTertiary} />
                    <Text style={[styles.roleTypeBtnText, createRoleMode === 'custom' && styles.roleTypeBtnTextActive]}>Custom Role</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {createRoleMode === 'builtin' ? (
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>Select Role</Text>
                  <View style={styles.roleGrid}>
                    {BUILT_IN_ROLES.filter((r) => r.value !== 'super_admin').map((r) => (
                      <TouchableOpacity
                        key={r.value}
                        style={[styles.roleOption, form.admin_role === r.value && { borderColor: r.color, backgroundColor: r.bg }]}
                        onPress={() => setForm((p) => ({ ...p, admin_role: r.value }))}
                      >
                        <Text style={[styles.roleOptionLabel, form.admin_role === r.value && { color: r.color }]}>{r.label}</Text>
                        <Text style={styles.roleOptionDesc}>{r.description}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>Select Custom Role</Text>
                  {customRoles.length === 0 ? (
                    <View style={styles.noCustomRoles}>
                      <Layers size={20} color={Colors.neutral[400]} />
                      <Text style={styles.noCustomRolesText}>No custom roles yet. Create one in Role Management first.</Text>
                    </View>
                  ) : (
                    <View style={styles.roleGrid}>
                      {customRoles.map((cr) => (
                        <TouchableOpacity
                          key={cr.id}
                          style={[styles.roleOption, form.custom_role_id === cr.id && { borderColor: cr.color, backgroundColor: cr.color + '15' }]}
                          onPress={() => setForm((p) => ({ ...p, custom_role_id: cr.id }))}
                        >
                          <View style={styles.customRoleOptionHeader}>
                            <View style={[styles.customRoleDot, { backgroundColor: cr.color }]} />
                            <Text style={[styles.roleOptionLabel, form.custom_role_id === cr.id && { color: cr.color }]}>{cr.name}</Text>
                          </View>
                          {cr.description ? <Text style={styles.roleOptionDesc}>{cr.description}</Text> : null}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            {createError ? (
              <View style={styles.errorRow}><AlertCircle size={14} color={Colors.error} /><Text style={styles.errorText}>{createError}</Text></View>
            ) : null}

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCreate(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveNew} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.saveText}>Create Admin</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Change role modal ──────────────────────────────────────────────── */}
      <Modal visible={showRoleModal} transparent animationType="fade" onRequestClose={() => setShowRoleModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalTop}>
              <Text style={styles.modalTitle}>Change Role</Text>
              <TouchableOpacity onPress={() => setShowRoleModal(false)}><X size={20} color={Colors.textSecondary} /></TouchableOpacity>
            </View>

            {selectedUser && (
              <View style={styles.miniUserRow}>
                <Users size={14} color={Colors.textSecondary} />
                <Text style={styles.miniUserName}>{selectedUser.full_name}</Text>
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Role type toggle */}
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Role Type</Text>
                <View style={styles.roleTypeRow}>
                  <TouchableOpacity
                    style={[styles.roleTypeBtn, changeRoleMode === 'builtin' && styles.roleTypeBtnActive]}
                    onPress={() => setChangeRoleMode('builtin')}
                  >
                    <Shield size={14} color={changeRoleMode === 'builtin' ? Colors.primary : Colors.textTertiary} />
                    <Text style={[styles.roleTypeBtnText, changeRoleMode === 'builtin' && styles.roleTypeBtnTextActive]}>Built-in Role</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.roleTypeBtn, changeRoleMode === 'custom' && styles.roleTypeBtnActive]}
                    onPress={() => setChangeRoleMode('custom')}
                  >
                    <Layers size={14} color={changeRoleMode === 'custom' ? Colors.primary : Colors.textTertiary} />
                    <Text style={[styles.roleTypeBtnText, changeRoleMode === 'custom' && styles.roleTypeBtnTextActive]}>Custom Role</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {changeRoleMode === 'builtin' ? (
                <View style={styles.formField}>
                  <View style={styles.roleGrid}>
                    {BUILT_IN_ROLES.filter((r) => r.value !== 'super_admin').map((r) => (
                      <TouchableOpacity
                        key={r.value}
                        style={[styles.roleOption, newBuiltinRole === r.value && { borderColor: r.color, backgroundColor: r.bg }]}
                        onPress={() => setNewBuiltinRole(r.value)}
                      >
                        <Text style={[styles.roleOptionLabel, newBuiltinRole === r.value && { color: r.color }]}>{r.label}</Text>
                        <Text style={styles.roleOptionDesc}>{r.description}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={styles.formField}>
                  {customRoles.length === 0 ? (
                    <View style={styles.noCustomRoles}>
                      <Layers size={20} color={Colors.neutral[400]} />
                      <Text style={styles.noCustomRolesText}>No custom roles yet. Create one in Role Management first.</Text>
                    </View>
                  ) : (
                    <View style={styles.roleGrid}>
                      {customRoles.map((cr) => (
                        <TouchableOpacity
                          key={cr.id}
                          style={[styles.roleOption, newCustomRoleId === cr.id && { borderColor: cr.color, backgroundColor: cr.color + '15' }]}
                          onPress={() => setNewCustomRoleId(cr.id)}
                        >
                          <View style={styles.customRoleOptionHeader}>
                            <View style={[styles.customRoleDot, { backgroundColor: cr.color }]} />
                            <Text style={[styles.roleOptionLabel, newCustomRoleId === cr.id && { color: cr.color }]}>{cr.name}</Text>
                          </View>
                          {cr.description ? <Text style={styles.roleOptionDesc}>{cr.description}</Text> : null}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            {roleError ? (
              <View style={styles.errorRow}><AlertCircle size={14} color={Colors.error} /><Text style={styles.errorText}>{roleError}</Text></View>
            ) : null}

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowRoleModal(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveRole} disabled={roleSaving}>
                {roleSaving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.saveText}>Save</Text>}
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
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: Spacing[6], paddingTop: Spacing[6], paddingBottom: Spacing[4],
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.textPrimary },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  iconBtn: { width: 36, height: 36, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], backgroundColor: Colors.primary, borderRadius: Radius.md },
  addBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, flexDirection: 'row' },

  userList: { width: 300, borderRightWidth: 1, borderRightColor: Colors.border, backgroundColor: Colors.white },
  userListContent: { padding: Spacing[4], gap: Spacing[3] },
  roleGroup: { gap: Spacing[1] },
  roleGroupLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], borderLeftWidth: 2, paddingLeft: Spacing[2], paddingVertical: 2, marginBottom: Spacing[1] },
  rolePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: Spacing[2], borderRadius: Radius.full },
  rolePillText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11 },
  groupCount: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, textAlign: 'right' },
  emptyGroup: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textDisabled, paddingLeft: Spacing[3], paddingVertical: Spacing[1] },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], padding: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  userCardSelected: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  userAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm },
  userCardInfo: { flex: 1 },
  userName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  userEmail: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },

  drawer: { flex: 1, backgroundColor: Colors.background, padding: Spacing[5] },
  drawerHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3], backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing[4] },
  drawerAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  drawerAvatarText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg },
  drawerUserInfo: { flex: 1 },
  drawerUserName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  drawerUserEmail: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 1 },
  drawerRoleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], marginTop: Spacing[2] },
  changeRoleBtn: { paddingVertical: 3, paddingHorizontal: Spacing[2], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  changeRoleBtnText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11, color: Colors.textSecondary },
  drawerLoading: { padding: Spacing[8], alignItems: 'center' },
  superNote: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], backgroundColor: Colors.successSurface, borderRadius: Radius.lg, padding: Spacing[4] },
  superNoteText: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.success },

  noteSection: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing[4] },
  noteInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing[3], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, minHeight: 60, textAlignVertical: 'top' },
  noteHint: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textDisabled, marginTop: Spacing[1] },

  modulesSection: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing[4] },
  sectionTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary, marginBottom: Spacing[3] },
  legendRow: { flexDirection: 'row', gap: Spacing[4], marginBottom: Spacing[3] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  moduleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  moduleLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  moduleStatusDot: { width: 8, height: 8, borderRadius: 4 },
  moduleTextBlock: { flex: 1 },
  moduleLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  moduleMetaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1], marginTop: 2 },
  overrideBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.successSurface, paddingHorizontal: 5, paddingVertical: 2, borderRadius: Radius.full },
  overrideBadgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10 },
  moduleRoleMeta: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textDisabled },
  moduleActions: { flexDirection: 'row', gap: Spacing[1] },
  moduleActionBtn: { width: 30, height: 30, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  moduleActionActive: { borderColor: Colors.success, backgroundColor: Colors.successSurface },
  moduleActionDefault: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  moduleActionRevoked: { borderColor: Colors.error, backgroundColor: Colors.errorSurface },

  historySection: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing[4] },
  historyRow: { flexDirection: 'row', gap: Spacing[3], paddingVertical: Spacing[2], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  historyIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  historyInfo: { flex: 1 },
  historyModule: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  historyMeta: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },
  historyTime: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  historyTimeText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textDisabled },

  emptyDrawer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing[3] },
  emptyDrawerText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: Spacing[5] },
  modal: { width: '100%', maxWidth: 520, backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[6], gap: Spacing[4], maxHeight: '90%' },
  modalTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  miniUserRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.neutral[50], padding: Spacing[3], borderRadius: Radius.md },
  miniUserName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  formField: { gap: Spacing[2] },
  fieldLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[3], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary, backgroundColor: Colors.white },

  roleTypeRow: { flexDirection: 'row', gap: Spacing[2] },
  roleTypeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2], paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  roleTypeBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  roleTypeBtnText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary },
  roleTypeBtnTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },

  roleGrid: { gap: Spacing[2] },
  roleOption: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing[3], gap: 2 },
  roleOptionLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  roleOptionDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  customRoleOptionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  customRoleDot: { width: 10, height: 10, borderRadius: 5 },

  noCustomRoles: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], backgroundColor: Colors.neutral[50], borderRadius: Radius.md, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border },
  noCustomRolesText: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error },
  modalFooter: { flexDirection: 'row', gap: Spacing[3] },
  cancelBtn: { flex: 1, paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  saveBtn: { flex: 2, paddingVertical: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  saveText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
});
