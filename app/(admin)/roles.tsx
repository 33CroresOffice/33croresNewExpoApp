import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, ActivityIndicator, Platform, TextInput, Modal,
} from 'react-native';
import {
  Shield, ChevronDown, ChevronUp, Users, Check,
  TriangleAlert as AlertTriangle, Plus, X, Pencil, Trash2,
  CircleCheck as CheckCircle, Layers,
} from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { CustomRole } from '@/types/database';
import ModuleGuard from '@/components/admin/ModuleGuard';

type ModuleRow = { key: string; label: string; description: string; sort_order: number };
type RoleInfo = { key: string; label: string; description: string; color: string; bg: string };

const BUILT_IN_ROLES: RoleInfo[] = [
  { key: 'super_admin', label: 'Super Admin',  description: 'Full access to all modules. Cannot be restricted.', color: Colors.primary,  bg: Colors.primarySurface },
  { key: 'operations',  label: 'Operations',   description: 'Manages orders, procurement, and riders.',         color: '#6A1B9A',        bg: '#F3E5F5' },
  { key: 'finance',     label: 'Finance',      description: 'Access to financial data, payments and expenses.',  color: '#1565C0',        bg: '#E3F2FD' },
  { key: 'crm',         label: 'CRM',          description: 'Customer relationship, segments and tasks.',        color: Colors.secondary, bg: Colors.secondarySurface },
  { key: 'catalog',     label: 'Catalog',      description: 'Manage subscription plans and flower types.',       color: Colors.warning,   bg: Colors.warningSurface },
];

const PRESET_COLORS = [
  '#0D47A1', '#1B5E20', '#B71C1C', '#E65100',
  '#4A148C', '#006064', '#37474F', '#4E342E',
];

export default function RolesScreen() {
  return (
    <ModuleGuard module="roles">
      <RolesContent />
    </ModuleGuard>
  );
}

function RolesContent() {
  const { profile: currentUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'builtin' | 'custom'>('builtin');
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Built-in tab state
  const [roleModules, setRoleModules] = useState<Record<string, Set<string>>>({});
  const [userCounts, setUserCounts] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  // Custom roles tab state
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [customRoleModules, setCustomRoleModules] = useState<Record<string, Set<string>>>({});
  const [customUserCounts, setCustomUserCounts] = useState<Record<string, number>>({});
  const [expandedCustom, setExpandedCustom] = useState<string | null>(null);
  const [savingCustom, setSavingCustom] = useState<string | null>(null);

  // Create/edit modal
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<CustomRole | null>(null);
  const [modalForm, setModalForm] = useState({ name: '', description: '', color: PRESET_COLORS[0] });
  const [modalModules, setModalModules] = useState<Set<string>>(new Set());
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<CustomRole | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [modsRes, rmRes, profilesRes, crRes, crmRes] = await Promise.all([
      supabase.from('modules').select('*').order('sort_order'),
      supabase.from('role_modules').select('role, module'),
      supabase.from('profiles').select('admin_role, custom_role_id').eq('role', 'admin'),
      supabase.from('custom_roles').select('*').order('created_at'),
      supabase.from('custom_role_modules').select('custom_role_id, module'),
    ]);

    if (modsRes.data) setModules(modsRes.data);

    if (rmRes.data) {
      const map: Record<string, Set<string>> = {};
      for (const r of BUILT_IN_ROLES) map[r.key] = new Set();
      for (const row of rmRes.data) {
        if (!map[row.role]) map[row.role] = new Set();
        map[row.role].add(row.module);
      }
      setRoleModules(map);
    }

    if (profilesRes.data) {
      const builtinCounts: Record<string, number> = {};
      const customCounts: Record<string, number> = {};
      for (const p of profilesRes.data) {
        if (p.custom_role_id) {
          customCounts[p.custom_role_id] = (customCounts[p.custom_role_id] ?? 0) + 1;
        } else if (p.admin_role) {
          builtinCounts[p.admin_role] = (builtinCounts[p.admin_role] ?? 0) + 1;
        }
      }
      setUserCounts(builtinCounts);
      setCustomUserCounts(customCounts);
    }

    if (crRes.data) setCustomRoles(crRes.data);

    if (crmRes.data) {
      const map: Record<string, Set<string>> = {};
      for (const row of crmRes.data) {
        if (!map[row.custom_role_id]) map[row.custom_role_id] = new Set();
        map[row.custom_role_id].add(row.module);
      }
      setCustomRoleModules(map);
    }

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Built-in role toggle ────────────────────────────────────────────────────
  const toggleBuiltinModule = async (roleKey: string, moduleKey: string, currentlyGranted: boolean) => {
    if (roleKey === 'super_admin') return;
    const key = `${roleKey}:${moduleKey}`;
    setSaving(key);
    if (currentlyGranted) {
      const { error } = await supabase.from('role_modules').delete().eq('role', roleKey).eq('module', moduleKey);
      if (error) { showToast('Failed to revoke module', 'error'); }
      else {
        setRoleModules((prev) => { const n = { ...prev }; n[roleKey] = new Set(n[roleKey]); n[roleKey].delete(moduleKey); return n; });
        showToast(`Revoked "${moduleKey}" from ${roleKey}`);
      }
    } else {
      const { error } = await supabase.from('role_modules').insert({ role: roleKey, module: moduleKey });
      if (error) { showToast('Failed to grant module', 'error'); }
      else {
        setRoleModules((prev) => { const n = { ...prev }; n[roleKey] = new Set(n[roleKey]); n[roleKey].add(moduleKey); return n; });
        showToast(`Granted "${moduleKey}" to ${roleKey}`);
      }
    }
    setSaving(null);
  };

  // ── Custom role module toggle (inline, for existing roles) ──────────────────
  const toggleCustomModule = async (roleId: string, moduleKey: string, currentlyGranted: boolean) => {
    const key = `${roleId}:${moduleKey}`;
    setSavingCustom(key);
    if (currentlyGranted) {
      const { error } = await supabase.from('custom_role_modules').delete().eq('custom_role_id', roleId).eq('module', moduleKey);
      if (error) { showToast('Failed to revoke module', 'error'); }
      else {
        setCustomRoleModules((prev) => { const n = { ...prev }; n[roleId] = new Set(n[roleId]); n[roleId].delete(moduleKey); return n; });
        showToast('Module revoked');
      }
    } else {
      const { error } = await supabase.from('custom_role_modules').insert({ custom_role_id: roleId, module: moduleKey });
      if (error) { showToast('Failed to grant module', 'error'); }
      else {
        setCustomRoleModules((prev) => { const n = { ...prev }; n[roleId] = new Set(n[roleId] ?? []); n[roleId].add(moduleKey); return n; });
        showToast('Module granted');
      }
    }
    setSavingCustom(null);
  };

  // ── Open create modal ───────────────────────────────────────────────────────
  const openCreate = () => {
    setEditTarget(null);
    setModalForm({ name: '', description: '', color: PRESET_COLORS[0] });
    setModalModules(new Set());
    setModalError('');
    setShowModal(true);
  };

  const openEdit = (cr: CustomRole) => {
    setEditTarget(cr);
    setModalForm({ name: cr.name, description: cr.description, color: cr.color });
    setModalModules(new Set(customRoleModules[cr.id] ?? []));
    setModalError('');
    setShowModal(true);
  };

  // ── Save create/edit ────────────────────────────────────────────────────────
  const saveModal = async () => {
    if (!modalForm.name.trim()) { setModalError('Name is required.'); return; }
    if (modalModules.size === 0) { setModalError('Select at least one module.'); return; }
    setModalSaving(true);
    setModalError('');

    if (editTarget) {
      // Update name/desc/color
      const { error } = await supabase
        .from('custom_roles')
        .update({ name: modalForm.name.trim(), description: modalForm.description.trim(), color: modalForm.color })
        .eq('id', editTarget.id);
      if (error) { setModalError(error.message); setModalSaving(false); return; }

      // Replace modules: delete all then re-insert
      await supabase.from('custom_role_modules').delete().eq('custom_role_id', editTarget.id);
      if (modalModules.size > 0) {
        const rows = [...modalModules].map((m) => ({ custom_role_id: editTarget.id, module: m }));
        await supabase.from('custom_role_modules').insert(rows);
      }

      setCustomRoles((prev) => prev.map((r) => r.id === editTarget.id
        ? { ...r, name: modalForm.name.trim(), description: modalForm.description.trim(), color: modalForm.color }
        : r
      ));
      setCustomRoleModules((prev) => ({ ...prev, [editTarget.id]: new Set(modalModules) }));
      showToast('Custom role updated');
    } else {
      // Create new
      const { data, error } = await supabase
        .from('custom_roles')
        .insert({ name: modalForm.name.trim(), description: modalForm.description.trim(), color: modalForm.color, created_by: currentUser?.id })
        .select()
        .single();
      if (error) { setModalError(error.message); setModalSaving(false); return; }

      const rows = [...modalModules].map((m) => ({ custom_role_id: data.id, module: m }));
      await supabase.from('custom_role_modules').insert(rows);

      setCustomRoles((prev) => [...prev, data]);
      setCustomRoleModules((prev) => ({ ...prev, [data.id]: new Set(modalModules) }));
      showToast('Custom role created');
    }

    setModalSaving(false);
    setShowModal(false);
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    const { error } = await supabase.from('custom_roles').delete().eq('id', deleteTarget.id);
    if (error) { showToast(error.message, 'error'); }
    else {
      setCustomRoles((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setCustomRoleModules((prev) => { const n = { ...prev }; delete n[deleteTarget.id]; return n; });
      showToast('Custom role deleted');
    }
    setDeleteLoading(false);
    setDeleteTarget(null);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      {toast && (
        <View style={[styles.toast, toast.type === 'error' ? styles.toastError : styles.toastSuccess]}>
          <Check size={14} color={Colors.white} />
          <Text style={styles.toastText}>{toast.msg}</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Shield size={22} color={Colors.primary} />
          <View>
            <Text style={styles.headerTitle}>Role Management</Text>
            <Text style={styles.headerSub}>Configure module access for built-in and custom roles</Text>
          </View>
        </View>
        {activeTab === 'custom' && (
          <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
            <Plus size={15} color={Colors.white} />
            <Text style={styles.addBtnText}>New Custom Role</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'builtin' && styles.tabActive]}
          onPress={() => setActiveTab('builtin')}
        >
          <Shield size={14} color={activeTab === 'builtin' ? Colors.primary : Colors.textTertiary} />
          <Text style={[styles.tabText, activeTab === 'builtin' && styles.tabTextActive]}>Built-in Roles</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'custom' && styles.tabActive]}
          onPress={() => setActiveTab('custom')}
        >
          <Layers size={14} color={activeTab === 'custom' ? Colors.primary : Colors.textTertiary} />
          <Text style={[styles.tabText, activeTab === 'custom' && styles.tabTextActive]}>
            Custom Roles
            {customRoles.length > 0 && (
              <Text style={styles.tabBadge}> {customRoles.length}</Text>
            )}
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'builtin' ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.warningBanner}>
            <AlertTriangle size={15} color={Colors.warning} />
            <Text style={styles.warningText}>
              Changing a role's modules affects all users with that role immediately.
              Individual user overrides are preserved and still apply on top.
            </Text>
          </View>

          {BUILT_IN_ROLES.map((role) => {
            const isOpen = expanded === role.key;
            const isSuperAdmin = role.key === 'super_admin';
            const grantedSet = roleModules[role.key] ?? new Set();
            const count = userCounts[role.key] ?? 0;

            return (
              <View key={role.key} style={[styles.roleCard, Shadow.sm]}>
                <TouchableOpacity
                  style={styles.roleHeader}
                  onPress={() => setExpanded(isOpen ? null : role.key)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.roleBadge, { backgroundColor: role.bg }]}>
                    <Shield size={16} color={role.color} />
                  </View>
                  <View style={styles.roleInfo}>
                    <Text style={styles.roleLabel}>{role.label}</Text>
                    <Text style={styles.roleDesc}>{role.description}</Text>
                  </View>
                  <View style={styles.roleMeta}>
                    <View style={styles.userCountPill}>
                      <Users size={11} color={Colors.textTertiary} />
                      <Text style={styles.userCountText}>{count}</Text>
                    </View>
                    {!isSuperAdmin && (
                      <Text style={[styles.grantedCount, { color: role.color }]}>
                        {grantedSet.size}/{modules.length}
                      </Text>
                    )}
                    {isOpen ? <ChevronUp size={16} color={Colors.textTertiary} /> : <ChevronDown size={16} color={Colors.textTertiary} />}
                  </View>
                </TouchableOpacity>

                {isOpen && (
                  <View style={styles.moduleList}>
                    {isSuperAdmin ? (
                      <View style={styles.superNote}>
                        <CheckCircle size={16} color={Colors.success} />
                        <Text style={styles.superNoteText}>Super Admin always has access to all modules. This cannot be changed.</Text>
                      </View>
                    ) : (
                      modules.map((mod) => {
                        const granted = grantedSet.has(mod.key);
                        const isSaving = saving === `${role.key}:${mod.key}`;
                        return (
                          <View key={mod.key} style={styles.moduleRow}>
                            <View style={styles.moduleInfo}>
                              <Text style={styles.moduleLabel}>{mod.label}</Text>
                              <Text style={styles.moduleDescText}>{mod.description}</Text>
                            </View>
                            {isSaving ? (
                              <ActivityIndicator size="small" color={Colors.primary} />
                            ) : (
                              <Switch
                                value={granted}
                                onValueChange={() => toggleBuiltinModule(role.key, mod.key, granted)}
                                trackColor={{ false: Colors.neutral[200], true: Colors.primaryLight + '60' }}
                                thumbColor={granted ? Colors.primary : Colors.neutral[400]}
                              />
                            )}
                          </View>
                        );
                      })
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {customRoles.length === 0 ? (
            <View style={styles.emptyState}>
              <Layers size={40} color={Colors.neutral[300]} strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>No custom roles yet</Text>
              <Text style={styles.emptyBody}>
                Create a custom role to mix and match any set of modules for a user.
              </Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={openCreate}>
                <Plus size={15} color={Colors.white} />
                <Text style={styles.emptyBtnText}>Create Custom Role</Text>
              </TouchableOpacity>
            </View>
          ) : (
            customRoles.map((cr) => {
              const isOpen = expandedCustom === cr.id;
              const grantedSet = customRoleModules[cr.id] ?? new Set();
              const count = customUserCounts[cr.id] ?? 0;

              return (
                <View key={cr.id} style={[styles.roleCard, Shadow.sm]}>
                  <TouchableOpacity
                    style={styles.roleHeader}
                    onPress={() => setExpandedCustom(isOpen ? null : cr.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.roleBadge, { backgroundColor: cr.color + '20' }]}>
                      <Layers size={16} color={cr.color} />
                    </View>
                    <View style={styles.roleInfo}>
                      <Text style={styles.roleLabel}>{cr.name}</Text>
                      <Text style={styles.roleDesc}>{cr.description || 'No description'}</Text>
                    </View>
                    <View style={styles.roleMeta}>
                      <View style={styles.userCountPill}>
                        <Users size={11} color={Colors.textTertiary} />
                        <Text style={styles.userCountText}>{count}</Text>
                      </View>
                      <Text style={[styles.grantedCount, { color: cr.color }]}>
                        {grantedSet.size}/{modules.length}
                      </Text>
                      <TouchableOpacity
                        style={styles.editIconBtn}
                        onPress={(e) => { e.stopPropagation?.(); openEdit(cr); }}
                      >
                        <Pencil size={13} color={Colors.textTertiary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.editIconBtn}
                        onPress={(e) => { e.stopPropagation?.(); setDeleteTarget(cr); }}
                      >
                        <Trash2 size={13} color={Colors.error} />
                      </TouchableOpacity>
                      {isOpen ? <ChevronUp size={16} color={Colors.textTertiary} /> : <ChevronDown size={16} color={Colors.textTertiary} />}
                    </View>
                  </TouchableOpacity>

                  {isOpen && (
                    <View style={styles.moduleList}>
                      {modules.map((mod) => {
                        const granted = grantedSet.has(mod.key);
                        const isSaving = savingCustom === `${cr.id}:${mod.key}`;
                        return (
                          <View key={mod.key} style={styles.moduleRow}>
                            <View style={styles.moduleInfo}>
                              <Text style={styles.moduleLabel}>{mod.label}</Text>
                              <Text style={styles.moduleDescText}>{mod.description}</Text>
                            </View>
                            {isSaving ? (
                              <ActivityIndicator size="small" color={Colors.primary} />
                            ) : (
                              <Switch
                                value={granted}
                                onValueChange={() => toggleCustomModule(cr.id, mod.key, granted)}
                                trackColor={{ false: Colors.neutral[200], true: cr.color + '60' }}
                                thumbColor={granted ? cr.color : Colors.neutral[400]}
                              />
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Create/Edit Modal */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalTop}>
              <Text style={styles.modalTitle}>{editTarget ? 'Edit Custom Role' : 'Create Custom Role'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><X size={20} color={Colors.textSecondary} /></TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Role Name *</Text>
                <TextInput
                  style={styles.input}
                  value={modalForm.name}
                  onChangeText={(v) => setModalForm((p) => ({ ...p, name: v }))}
                  placeholder="e.g. Warehouse Manager"
                  placeholderTextColor={Colors.textDisabled}
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Description</Text>
                <TextInput
                  style={[styles.input, styles.inputMulti]}
                  value={modalForm.description}
                  onChangeText={(v) => setModalForm((p) => ({ ...p, description: v }))}
                  placeholder="What is this role for?"
                  placeholderTextColor={Colors.textDisabled}
                  multiline
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Color</Text>
                <View style={styles.colorRow}>
                  {PRESET_COLORS.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.colorSwatch, { backgroundColor: c }, modalForm.color === c && styles.colorSwatchSelected]}
                      onPress={() => setModalForm((p) => ({ ...p, color: c }))}
                    >
                      {modalForm.color === c && <Check size={12} color={Colors.white} />}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Modules *</Text>
                <Text style={styles.fieldHint}>Select any combination of modules this role can access</Text>
                <View style={styles.moduleCheckList}>
                  {modules.map((mod) => {
                    const checked = modalModules.has(mod.key);
                    return (
                      <TouchableOpacity
                        key={mod.key}
                        style={[styles.moduleCheckRow, checked && { borderColor: modalForm.color, backgroundColor: modalForm.color + '10' }]}
                        onPress={() => {
                          setModalModules((prev) => {
                            const n = new Set(prev);
                            checked ? n.delete(mod.key) : n.add(mod.key);
                            return n;
                          });
                        }}
                      >
                        <View style={[styles.checkbox, checked && { backgroundColor: modalForm.color, borderColor: modalForm.color }]}>
                          {checked && <Check size={10} color={Colors.white} />}
                        </View>
                        <View style={styles.moduleCheckInfo}>
                          <Text style={[styles.moduleCheckLabel, checked && { color: modalForm.color }]}>{mod.label}</Text>
                          <Text style={styles.moduleCheckDesc}>{mod.description}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            {modalError ? (
              <Text style={styles.errorText}>{modalError}</Text>
            ) : null}

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: modalForm.color }]}
                onPress={saveModal}
                disabled={modalSaving}
              >
                {modalSaving
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Text style={styles.saveText}>{editTarget ? 'Save Changes' : 'Create Role'}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete confirm */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={styles.overlay}>
          <View style={[styles.modal, { maxWidth: 400 }]}>
            <View style={styles.modalTop}>
              <Text style={styles.modalTitle}>Delete Custom Role</Text>
              <TouchableOpacity onPress={() => setDeleteTarget(null)}><X size={20} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <Text style={styles.deleteBody}>
              Are you sure you want to delete <Text style={{ fontFamily: Typography.fontFamily.sansSemiBold }}>{deleteTarget?.name}</Text>?
              {'\n\n'}
              Users assigned this role will lose their module access until reassigned to another role.
            </Text>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDeleteTarget(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: Colors.error }]} onPress={confirmDelete} disabled={deleteLoading}>
                {deleteLoading ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.saveText}>Delete</Text>}
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[6], paddingVertical: Spacing[5],
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  headerTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  headerSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], backgroundColor: Colors.primary, borderRadius: Radius.md },
  addBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },

  tabBar: {
    flexDirection: 'row', backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: Spacing[6],
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    paddingVertical: Spacing[3], paddingHorizontal: Spacing[4],
    borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1,
  },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary },
  tabTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  tabBadge: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.primary },

  scroll: { flex: 1 },
  scrollContent: { padding: Spacing[6], gap: Spacing[4] },

  warningBanner: {
    flexDirection: 'row', gap: Spacing[2], backgroundColor: Colors.warningSurface,
    borderWidth: 1, borderColor: Colors.warning + '40', borderRadius: Radius.md,
    padding: Spacing[4], marginBottom: Spacing[2], alignItems: 'flex-start',
  },
  warningText: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.warning, lineHeight: Typography.size.sm * 1.5 },

  roleCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  roleHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing[4], gap: Spacing[3] },
  roleBadge: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  roleInfo: { flex: 1 },
  roleLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  roleDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 2 },
  roleMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  userCountPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.neutral[100], paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.full },
  userCountText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textTertiary },
  grantedCount: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs },
  editIconBtn: { width: 26, height: 26, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },

  moduleList: { borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: Spacing[4], paddingVertical: Spacing[2] },
  moduleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: Spacing[3] },
  moduleInfo: { flex: 1 },
  moduleLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  moduleDescText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },

  superNote: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], backgroundColor: Colors.successSurface, borderRadius: Radius.md, padding: Spacing[4], margin: Spacing[2] },
  superNoteText: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.success },

  emptyState: { alignItems: 'center', justifyContent: 'center', gap: Spacing[3], paddingVertical: Spacing[12] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  emptyBody: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 300 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[3], paddingHorizontal: Spacing[5], backgroundColor: Colors.primary, borderRadius: Radius.md, marginTop: Spacing[2] },
  emptyBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: Spacing[5] },
  modal: { width: '100%', maxWidth: 520, backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[6], gap: Spacing[4], maxHeight: '90%' },
  modalTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },

  formField: { gap: Spacing[2], marginBottom: Spacing[3] },
  fieldLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  fieldHint: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: -4 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[3], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary, backgroundColor: Colors.white },
  inputMulti: { minHeight: 64, textAlignVertical: 'top' },

  colorRow: { flexDirection: 'row', gap: Spacing[2], flexWrap: 'wrap' },
  colorSwatch: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  colorSwatchSelected: { borderColor: Colors.white, borderWidth: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3 },

  moduleCheckList: { gap: Spacing[2] },
  moduleCheckRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], padding: Spacing[3], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: Colors.neutral[300], alignItems: 'center', justifyContent: 'center' },
  moduleCheckInfo: { flex: 1 },
  moduleCheckLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  moduleCheckDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },

  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error },
  modalFooter: { flexDirection: 'row', gap: Spacing[3] },
  cancelBtn: { flex: 1, paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  saveBtn: { flex: 2, paddingVertical: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  saveText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },

  deleteBody: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: Typography.size.sm * 1.6 },

  toast: {
    position: 'absolute', top: Platform.OS === 'web' ? 16 : 50, right: 16, zIndex: 100,
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], borderRadius: Radius.md,
  },
  toastSuccess: { backgroundColor: Colors.success },
  toastError: { backgroundColor: Colors.error },
  toastText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.white },
});
