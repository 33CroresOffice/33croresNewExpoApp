import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  RefreshControl,
  Modal,
  TextInput,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, ChevronRight, ChevronDown, X, Check, Pencil, Sprout, Leaf, Upload, Image as ImageIcon } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { SubscriptionPlan, FlowerType, PlanFlowerRequirement, UnitType } from '@/types/database';
import Badge from '@/components/ui/Badge';

const FREQ_OPTIONS = [
  { label: 'Weekly', value: 'weekly' },
  { label: 'Bi-weekly', value: 'biweekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: '3 Months', value: '3months' },
  { label: '6 Months', value: '6months' },
];

const EMPTY_FORM = {
  name: '',
  description: '',
  selling_price: '',
  mrp_price: '',
  frequency: 'monthly' as string,
  image_url: '',
  image_local_uri: '',
  features: '',
};

export default function AdminPlansScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  const load = async () => {
    try {
      const { data } = await supabase.from('subscription_plans').select('*').order('sort_order');
      if (data) setPlans(data);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleToggleActive = async (id: string, current: boolean) => {
    await supabase.from('subscription_plans').update({ is_active: !current }).eq('id', id);
    setPlans((prev) => prev.map((p) => p.id === id ? { ...p, is_active: !current } : p));
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (plan: SubscriptionPlan) => {
    setEditing(plan);
    setForm({
      name: plan.name,
      description: plan.description,
      selling_price: (plan.price / 100).toString(),
      mrp_price: plan.mrp_price ? (plan.mrp_price / 100).toString() : '',
      frequency: plan.frequency,
      image_url: plan.image_url ?? '',
      image_local_uri: '',
      features: Array.isArray(plan.features) ? (plan.features as string[]).join('\n') : '',
    });
    setFormError('');
    setShowModal(true);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setForm((prev) => ({ ...prev, image_local_uri: result.assets[0].uri, image_url: '' }));
    }
  };

  const compressImage = async (localUri: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        const MAX = 1200;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
          else { width = Math.round((width * MAX) / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((b) => { if (b) resolve(b); else reject(new Error('compression failed')); }, 'image/jpeg', 0.8);
      };
      img.onerror = reject;
      img.src = localUri;
    });
  };

  const uploadImage = async (localUri: string): Promise<string | null> => {
    try {
      let blob: Blob;
      if (Platform.OS === 'web') {
        blob = await compressImage(localUri);
      } else {
        const response = await fetch(localUri);
        blob = await response.blob();
      }
      const fileName = `plan-${Date.now()}.jpg`;
      const { data, error } = await supabase.storage
        .from('avatars')
        .upload(`plans/${fileName}`, blob, { contentType: 'image/jpeg', upsert: true });
      if (error || !data) return null;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(data.path);
      return urlData.publicUrl;
    } catch {
      return null;
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('Plan name is required'); return; }
    const sellingRupees = parseFloat(form.selling_price);
    if (isNaN(sellingRupees) || sellingRupees <= 0) { setFormError('Enter a valid selling price'); return; }
    const mrpRupees = form.mrp_price ? parseFloat(form.mrp_price) : sellingRupees;
    if (isNaN(mrpRupees) || mrpRupees <= 0) { setFormError('Enter a valid MRP'); return; }

    setSaving(true);
    setFormError('');

    let finalImageUrl: string | null = form.image_url.trim() || null;

    if (form.image_local_uri) {
      setUploadingImage(true);
      const uploaded = await uploadImage(form.image_local_uri);
      setUploadingImage(false);
      if (!uploaded) {
        setFormError('Image upload failed. Please try again.');
        setSaving(false);
        return;
      }
      finalImageUrl = uploaded;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      price: Math.round(sellingRupees * 100),
      mrp_price: Math.round(mrpRupees * 100),
      frequency: form.frequency,
      deliveries_per_month: 1,
      image_url: finalImageUrl,
      features: form.features.split('\n').map((f) => f.trim()).filter(Boolean),
      sort_order: editing ? editing.sort_order : plans.length,
    };

    if (editing) {
      const { error: updateErr } = await supabase.from('subscription_plans').update(payload).eq('id', editing.id);
      if (updateErr) { setFormError(updateErr.message); setSaving(false); return; }
    } else {
      const { error: insertErr } = await supabase.from('subscription_plans').insert({ ...payload, is_active: true });
      if (insertErr) { setFormError(insertErr.message); setSaving(false); return; }
    }

    await load();
    setSaving(false);
    setShowModal(false);
  };

  const formatPrice = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;
  const freqLabel: Record<string, string> = { weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly', '3months': '3 Months', '6months': '6 Months' };

  const FlowerRequirementsSection = ({ plan }: { plan: SubscriptionPlan }) => {
    const [reqs, setReqs] = useState<PlanFlowerRequirement[]>([]);
    const [flowerTypes, setFlowerTypes] = useState<FlowerType[]>([]);
    const [loadingReqs, setLoadingReqs] = useState(true);
    const [showReqModal, setShowReqModal] = useState(false);
    const [reqForm, setReqForm] = useState<{ flower_type_id: string; quantity: string; unit_type: UnitType }>({
      flower_type_id: '', quantity: '1', unit_type: 'bunch',
    });
    const [savingReq, setSavingReq] = useState(false);
    const [reqError, setReqError] = useState('');
    const [showUnitDropdown, setShowUnitDropdown] = useState(false);
    const isWeb = Platform.OS === 'web';

    const loadReqs = useCallback(async () => {
      const [reqRes, typesRes] = await Promise.all([
        supabase.from('plan_flower_requirements').select('*, flower_type:flower_types(*)').eq('plan_id', plan.id),
        supabase.from('flower_types').select('*').eq('is_active', true).order('sort_order'),
      ]);
      if (reqRes.data) setReqs(reqRes.data);
      if (typesRes.data) setFlowerTypes(typesRes.data);
      setLoadingReqs(false);
    }, [plan.id]);

    useEffect(() => { loadReqs(); }, [loadReqs]);

    const saveReq = async () => {
      if (!reqForm.flower_type_id) { setReqError('Select a flower type'); return; }
      const qty = parseFloat(reqForm.quantity);
      if (isNaN(qty) || qty <= 0) { setReqError('Enter a valid quantity'); return; }
      setSavingReq(true); setReqError('');
      const { error: err } = await supabase.from('plan_flower_requirements').upsert({
        plan_id: plan.id,
        flower_type_id: reqForm.flower_type_id,
        quantity_per_delivery: qty,
        unit_type: reqForm.unit_type,
      }, { onConflict: 'plan_id,flower_type_id' });
      setSavingReq(false);
      if (err) { setReqError(err.message); return; }
      setShowReqModal(false);
      loadReqs();
    };

    const deleteReq = async (id: string) => {
      await supabase.from('plan_flower_requirements').delete().eq('id', id);
      setReqs(prev => prev.filter(r => r.id !== id));
    };

    const selectedType = flowerTypes.find(f => f.id === reqForm.flower_type_id);

    return (
      <View style={reqStyles.wrap}>
        <View style={reqStyles.header}>
          <View style={reqStyles.headerLeft}>
            <Sprout size={14} color={Colors.primary} strokeWidth={2} />
            <Text style={reqStyles.title}>Flower Requirements / Delivery</Text>
          </View>
          <TouchableOpacity style={reqStyles.addSmallBtn} onPress={() => { setReqForm({ flower_type_id: '', quantity: '1', unit_type: 'bunch' }); setReqError(''); setShowReqModal(true); }}>
            <Plus size={13} color={Colors.primary} strokeWidth={2.5} />
            <Text style={reqStyles.addSmallText}>Add</Text>
          </TouchableOpacity>
        </View>
        {loadingReqs ? (
          <ActivityIndicator size="small" color={Colors.primary} style={{ alignSelf: 'flex-start', marginLeft: Spacing[2] }} />
        ) : reqs.length === 0 ? (
          <Text style={reqStyles.empty}>No flower requirements set. Add to enable daily requirement generation.</Text>
        ) : (
          <View style={reqStyles.reqList}>
            {reqs.map(r => (
              <View key={r.id} style={reqStyles.reqRow}>
                <View style={reqStyles.reqDot}>
                  <Leaf size={12} color={Colors.primary} strokeWidth={2} />
                </View>
                <Text style={reqStyles.reqName}>{(r.flower_type as any)?.display_name ?? 'Unknown'}</Text>
                <Text style={reqStyles.reqQty}>{r.quantity_per_delivery} {r.unit_type}</Text>
                <TouchableOpacity onPress={() => deleteReq(r.id)} style={reqStyles.deleteBtn}>
                  <X size={13} color={Colors.error} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        <Modal visible={showReqModal} transparent animationType="fade" onRequestClose={() => setShowReqModal(false)}>
          <View style={reqStyles.overlay}>
            <View style={reqStyles.modal}>
              <View style={reqStyles.modalTop}>
                <Text style={reqStyles.modalTitle}>Add Flower Requirement</Text>
                <TouchableOpacity onPress={() => setShowReqModal(false)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity>
              </View>
              <View style={reqStyles.formGroup}>
                <Text style={reqStyles.label}>Flower Type *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}>
                  {flowerTypes.map(ft => (
                    <TouchableOpacity
                      key={ft.id}
                      style={[reqStyles.ftChip, reqForm.flower_type_id === ft.id && reqStyles.ftChipActive]}
                      onPress={() => setReqForm(p => ({ ...p, flower_type_id: ft.id, unit_type: ft.unit_type as UnitType }))}
                    >
                      <Text style={[reqStyles.ftChipText, reqForm.flower_type_id === ft.id && reqStyles.ftChipTextActive]}>{ft.display_name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={reqStyles.formRow}>
                <View style={[reqStyles.formGroup, { flex: 1 }]}>
                  <Text style={reqStyles.label}>Quantity *</Text>
                  <TextInput
                    style={reqStyles.input}
                    value={reqForm.quantity}
                    onChangeText={v => setReqForm(p => ({ ...p, quantity: v }))}
                    keyboardType="numeric"
                    placeholder="e.g. 10"
                    placeholderTextColor={Colors.textDisabled}
                  />
                </View>
                <View style={[reqStyles.formGroup, { flex: 1 }]}>
                  <Text style={reqStyles.label}>Unit</Text>
                  {isWeb ? (
                    <select
                      value={reqForm.unit_type}
                      onChange={e => setReqForm(p => ({ ...p, unit_type: e.target.value as UnitType }))}
                      style={{
                        border: `1px solid ${Colors.border}`,
                        borderRadius: Radius.md,
                        paddingTop: Spacing[3],
                        paddingBottom: Spacing[3],
                        paddingLeft: Spacing[3],
                        paddingRight: Spacing[3],
                        fontFamily: Typography.fontFamily.sansRegular,
                        fontSize: Typography.size.base,
                        color: Colors.textPrimary,
                        backgroundColor: Colors.white,
                        width: '100%',
                        cursor: 'pointer',
                        outline: 'none',
                      } as any}
                    >
                      {(['pieces', 'bunch', 'stems', 'dozen', 'kg', 'grams', 'ml', 'litre', 'packet', 'tray', 'box', 'meter'] as UnitType[]).map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={reqStyles.unitDropdownTrigger}
                        onPress={() => setShowUnitDropdown(v => !v)}
                        activeOpacity={0.8}
                      >
                        <Text style={reqStyles.unitDropdownValue}>{reqForm.unit_type}</Text>
                        <ChevronDown size={16} color={Colors.textSecondary} strokeWidth={1.8} />
                      </TouchableOpacity>
                      {showUnitDropdown && (
                        <View style={reqStyles.unitDropdownMenuMobile}>
                          {(['pieces', 'bunch', 'stems', 'dozen', 'kg', 'grams', 'ml', 'litre', 'packet', 'tray', 'box', 'meter'] as UnitType[]).map(u => (
                            <TouchableOpacity
                              key={u}
                              style={[reqStyles.unitDropdownItem, reqForm.unit_type === u && reqStyles.unitDropdownItemActive]}
                              onPress={() => { setReqForm(p => ({ ...p, unit_type: u })); setShowUnitDropdown(false); }}
                            >
                              <Text style={[reqStyles.unitDropdownItemText, reqForm.unit_type === u && reqStyles.unitDropdownItemTextActive]}>{u}</Text>
                              {reqForm.unit_type === u && <Check size={14} color={Colors.primary} strokeWidth={2} />}
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </>
                  )}
                </View>
              </View>
              {reqError ? <Text style={reqStyles.error}>{reqError}</Text> : null}
              <View style={reqStyles.footer}>
                <TouchableOpacity style={reqStyles.cancelBtn} onPress={() => setShowReqModal(false)}>
                  <Text style={reqStyles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={reqStyles.saveBtn} onPress={saveReq} disabled={savingReq}>
                  {savingReq ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={reqStyles.saveText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  };

  const planFormModal = (
    <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.sheet, isWeb && modalStyles.sheetWeb]}>
          <View style={modalStyles.modalHeader}>
            <Text style={modalStyles.modalTitle}>{editing ? 'Edit Plan' : 'Create New Plan'}</Text>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <X size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={modalStyles.form} showsVerticalScrollIndicator={false}>
            <View style={modalStyles.fieldGroup}>
              <Text style={modalStyles.label}>Plan Name *</Text>
              <TextInput
                style={modalStyles.input}
                value={form.name}
                onChangeText={(v) => setForm({ ...form, name: v })}
                placeholder="e.g. Bloom Monthly"
                placeholderTextColor={Colors.textDisabled}
              />
            </View>

            <View style={modalStyles.fieldGroup}>
              <Text style={modalStyles.label}>Description</Text>
              <TextInput
                style={[modalStyles.input, modalStyles.textarea]}
                value={form.description}
                onChangeText={(v) => setForm({ ...form, description: v })}
                placeholder="Brief description of this plan..."
                placeholderTextColor={Colors.textDisabled}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={modalStyles.row}>
              <View style={[modalStyles.fieldGroup, { flex: 1 }]}>
                <Text style={modalStyles.label}>Selling Price (₹) *</Text>
                <TextInput
                  style={modalStyles.input}
                  value={form.selling_price}
                  onChangeText={(v) => setForm({ ...form, selling_price: v })}
                  placeholder="e.g. 999"
                  placeholderTextColor={Colors.textDisabled}
                  keyboardType="numeric"
                />
              </View>
              <View style={[modalStyles.fieldGroup, { flex: 1 }]}>
                <Text style={modalStyles.label}>MRP (₹)</Text>
                <TextInput
                  style={modalStyles.input}
                  value={form.mrp_price}
                  onChangeText={(v) => setForm({ ...form, mrp_price: v })}
                  placeholder="e.g. 1299"
                  placeholderTextColor={Colors.textDisabled}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={modalStyles.fieldGroup}>
              <Text style={modalStyles.label}>Frequency</Text>
              <View style={modalStyles.freqWrap}>
                {FREQ_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[modalStyles.freqChip, form.frequency === opt.value && modalStyles.freqChipActive]}
                    onPress={() => setForm({ ...form, frequency: opt.value })}
                  >
                    <Text style={[modalStyles.freqChipText, form.frequency === opt.value && modalStyles.freqChipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={modalStyles.fieldGroup}>
              <Text style={modalStyles.label}>Plan Image</Text>
              <TouchableOpacity style={modalStyles.imagePicker} onPress={pickImage} activeOpacity={0.75}>
                {(form.image_local_uri || form.image_url) ? (
                  <View style={modalStyles.imagePreviewWrap}>
                    <Image
                      source={{ uri: form.image_local_uri || form.image_url }}
                      style={modalStyles.imagePreview}
                      resizeMode="cover"
                    />
                    <View style={modalStyles.imageOverlay}>
                      <Upload size={16} color={Colors.white} />
                      <Text style={modalStyles.imageOverlayText}>Change Image</Text>
                    </View>
                  </View>
                ) : (
                  <View style={modalStyles.imageEmpty}>
                    <ImageIcon size={28} color={Colors.textDisabled} strokeWidth={1.5} />
                    <Text style={modalStyles.imageEmptyText}>Tap to upload image</Text>
                    <Text style={modalStyles.imageEmptyHint}>Recommended: 4:3 ratio</Text>
                  </View>
                )}
              </TouchableOpacity>
              {uploadingImage && (
                <View style={modalStyles.uploadingRow}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={modalStyles.uploadingText}>Uploading image...</Text>
                </View>
              )}
            </View>

            <View style={modalStyles.fieldGroup}>
              <Text style={modalStyles.label}>Features (one per line)</Text>
              <TextInput
                style={[modalStyles.input, modalStyles.textarea]}
                value={form.features}
                onChangeText={(v) => setForm({ ...form, features: v })}
                placeholder={'Fresh seasonal bouquets\nFree delivery\nCustom notes'}
                placeholderTextColor={Colors.textDisabled}
                multiline
                numberOfLines={4}
              />
            </View>

            {formError ? <Text style={modalStyles.errorText}>{formError}</Text> : null}
          </ScrollView>

          <View style={modalStyles.modalFooter}>
            <TouchableOpacity style={modalStyles.cancelBtn} onPress={() => setShowModal(false)}>
              <Text style={modalStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={modalStyles.saveBtn} onPress={handleSave} disabled={saving || uploadingImage}>
              {saving ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <Check size={16} color={Colors.white} />
                  <Text style={modalStyles.saveText}>{editing ? 'Save Changes' : 'Create Plan'}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (isWeb) {
    return (
      <ScrollView style={webStyles.scroll} contentContainerStyle={webStyles.content} showsVerticalScrollIndicator={false}>
        {planFormModal}
        <View style={webStyles.pageHeader}>
          <View>
            <Text style={webStyles.pageTitle}>Subscription Plans</Text>
            <Text style={webStyles.pageSubtitle}>{plans.length} plans configured</Text>
          </View>
          <TouchableOpacity style={webStyles.createBtn} onPress={openCreate}>
            <Plus size={16} color={Colors.white} />
            <Text style={webStyles.createBtnText}>New Plan</Text>
          </TouchableOpacity>
        </View>

        <View style={webStyles.tableCard}>
          <View style={webStyles.tableHead}>
            <Text style={[webStyles.thCell, { flex: 3 }]}>Plan</Text>
            <Text style={[webStyles.thCell, { flex: 1 }]}>Selling Price</Text>
            <Text style={[webStyles.thCell, { flex: 1 }]}>MRP</Text>
            <Text style={[webStyles.thCell, { flex: 1 }]}>Frequency</Text>
            <Text style={[webStyles.thCell, { flex: 1 }]}>Status</Text>
            <Text style={[webStyles.thCell, { width: 100 }]}>Actions</Text>
          </View>

          {plans.length === 0 && (
            <View style={webStyles.emptyState}>
              <Text style={webStyles.emptyText}>No plans yet. Create your first subscription plan.</Text>
            </View>
          )}

          {plans.map((plan, i) => (
            <View key={plan.id}>
              <View style={[webStyles.tableRow, i % 2 === 1 && webStyles.tableRowAlt]}>
                <View style={[webStyles.planCell, { flex: 3 }]}>
                  <Text style={webStyles.planName}>{plan.name}</Text>
                  <Text style={webStyles.planDesc} numberOfLines={1}>{plan.description}</Text>
                </View>
                <Text style={[webStyles.tdCell, { flex: 1 }]}>{formatPrice(plan.price)}</Text>
                <Text style={[webStyles.tdCell, webStyles.mrpCell, { flex: 1 }]}>{plan.mrp_price ? formatPrice(plan.mrp_price) : '—'}</Text>
                <View style={{ flex: 1 }}>
                  <Badge label={freqLabel[plan.frequency] ?? plan.frequency} variant="neutral" />
                </View>
                <View style={{ flex: 1 }}>
                  <Switch
                    value={plan.is_active}
                    onValueChange={() => handleToggleActive(plan.id, plan.is_active)}
                    trackColor={{ false: Colors.neutral[300], true: Colors.primaryLight }}
                    thumbColor={plan.is_active ? Colors.primary : Colors.neutral[400]}
                  />
                </View>
                <View style={[webStyles.actionsCell, { width: 100 }]}>
                  <TouchableOpacity style={webStyles.iconBtn} onPress={() => openEdit(plan)}>
                    <Pencil size={15} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={webStyles.reqRow}>
                <FlowerRequirementsSection plan={plan} />
              </View>
            </View>
          ))}
        </View>

      </ScrollView>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {planFormModal}
      <View style={styles.header}>
        <Text style={styles.title}>Subscription Plans</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
          <Plus size={18} color={Colors.white} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <Text style={styles.sectionTitle}>Plans ({plans.length})</Text>
        {plans.map((plan) => (
          <View key={plan.id} style={styles.planCard}>
            <View style={styles.planTop}>
              <View style={styles.planInfo}>
                <Text style={styles.planName}>{plan.name}</Text>
                <View style={styles.planMeta}>
                  <Badge label={freqLabel[plan.frequency]} variant="neutral" />
                  <Text style={styles.planPrice}>{formatPrice(plan.price)}/mo</Text>
                </View>
              </View>
              <View style={styles.planActions}>
                <View style={styles.planToggle}>
                  <Text style={styles.toggleLabel}>{plan.is_active ? 'Active' : 'Inactive'}</Text>
                  <Switch
                    value={plan.is_active}
                    onValueChange={() => handleToggleActive(plan.id, plan.is_active)}
                    trackColor={{ false: Colors.neutral[300], true: Colors.primaryLight }}
                    thumbColor={plan.is_active ? Colors.primary : Colors.neutral[400]}
                  />
                </View>
                <TouchableOpacity onPress={() => openEdit(plan)} style={styles.editIconBtn}>
                  <Pencil size={14} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.planDesc} numberOfLines={2}>{plan.description}</Text>
            <View style={styles.planStats}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{formatPrice(plan.price)}</Text>
                <Text style={styles.statLabel}>selling price</Text>
              </View>
              {plan.mrp_price > 0 && (
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, styles.mrpValue]}>{formatPrice(plan.mrp_price)}</Text>
                  <Text style={styles.statLabel}>MRP</Text>
                </View>
              )}
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{(plan.features as string[]).length}</Text>
                <Text style={styles.statLabel}>features</Text>
              </View>
            </View>
            <FlowerRequirementsSection plan={plan} />
          </View>
        ))}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'],
    color: Colors.textPrimary,
    letterSpacing: -0.3,
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
  sectionTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  planCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  planTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  planInfo: { flex: 1, gap: Spacing[2] },
  planName: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
  },
  planMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  planPrice: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.primary,
  },
  planActions: { alignItems: 'flex-end', gap: Spacing[2] },
  planToggle: { alignItems: 'flex-end', gap: 3 },
  toggleLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  editIconBtn: { padding: 4 },
  planDesc: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    lineHeight: 18,
  },
  planStats: { flexDirection: 'row', gap: Spacing[6] },
  statItem: { gap: 2 },
  statValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    color: Colors.textPrimary,
  },
  statLabel: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  mrpValue: {
    textDecorationLine: 'line-through',
    color: Colors.textTertiary,
  },
});

const webStyles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#F7F7F4' },
  content: { padding: 32, paddingBottom: 64, gap: 24 },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  pageTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 28,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  createBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.white,
  },
  tableCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: Colors.neutral[50],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  thCell: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  tableRowAlt: { backgroundColor: Colors.neutral[50] },
  planCell: { gap: 3 },
  planName: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  planDesc: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  tdCell: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  mrpCell: {
    textDecorationLine: 'line-through',
    color: Colors.textTertiary,
  },
  actionsCell: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: Colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: { paddingVertical: 48, alignItems: 'center' },
  emptyText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  reqRow: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sheet: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    width: '100%',
    maxHeight: '90%',
    overflow: 'hidden',
  },
  sheetWeb: {
    maxWidth: 560,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    color: Colors.textPrimary,
  },
  form: { paddingHorizontal: 24, paddingVertical: 16 },
  fieldGroup: { marginBottom: 16, gap: 6 },
  row: { flexDirection: 'row', gap: 12 },
  label: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    backgroundColor: Colors.white,
  },
  textarea: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  freqRow: { flexDirection: 'row', gap: 8 },
  freqWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  freqChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.neutral[50],
  },
  freqChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  freqChipText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  freqChipTextActive: { color: Colors.white },
  imagePicker: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  imagePreviewWrap: {
    position: 'relative',
    height: 160,
  },
  imagePreview: {
    width: '100%',
    height: 160,
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  imageOverlayText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.white,
  },
  imageEmpty: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  imageEmptyText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  imageEmptyHint: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textDisabled,
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  uploadingText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  errorText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.error,
    marginBottom: 8,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
  },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
  },
  saveText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.white,
  },
});

const reqStyles = StyleSheet.create({
  wrap: {
    gap: Spacing[2],
    paddingTop: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    marginTop: Spacing[2],
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  title: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  addSmallBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 3, paddingHorizontal: Spacing[2], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.primary },
  addSmallText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.primary },
  empty: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, fontStyle: 'italic' },
  reqList: { gap: 6 },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  reqDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  reqName: { flex: 1, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  reqQty: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  deleteBtn: { padding: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: Spacing[5] },
  modal: { width: '100%', maxWidth: 480, backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[5], gap: Spacing[4] },
  modalTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  formGroup: { gap: Spacing[2] },
  formRow: { flexDirection: 'row', gap: Spacing[3] },
  label: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[3], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary },
  ftChip: { paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  ftChipActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  ftChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  ftChipTextActive: { color: Colors.primary },
  unitDropdownTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[3], backgroundColor: Colors.white },
  unitDropdownValue: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary, textTransform: 'capitalize' },
  unitDropdownMenu: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, marginTop: 4, ...Shadow.md, zIndex: 100 },
  unitDropdownMenuMobile: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, marginTop: 4, ...Shadow.md },
  unitDropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing[3], paddingHorizontal: Spacing[3] },
  unitDropdownItemActive: { backgroundColor: Colors.primarySurface },
  unitDropdownItemText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary, textTransform: 'capitalize' },
  unitDropdownItemTextActive: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.primary },
  error: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error },
  footer: { flexDirection: 'row', gap: Spacing[3] },
  cancelBtn: { flex: 1, paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  saveBtn: { flex: 2, paddingVertical: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  saveText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
});
