import React, { useEffect, useState, useCallback } from 'react';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import ModuleGuard from '@/components/admin/ModuleGuard';
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
import {
  Plus, X, Check, Pencil, Sprout, Leaf, Upload, Image as ImageIcon,
  Eye, EyeOff, ChevronRight, ChevronDown, Search, AlertCircle, Package, Tag, Flame,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { SubscriptionPlan, FlowerType, PlanFlowerRequirement, UnitType, ProductType } from '@/types/database';
import Badge from '@/components/ui/Badge';
import PoojaPackageModal from '@/components/admin/PoojaPackageModal';

const FREQ_OPTIONS = [
  { label: 'Weekly', value: 'weekly' },
  { label: 'Bi-weekly', value: 'biweekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: '3 Months', value: '3months' },
  { label: '6 Months', value: '6months' },
  { label: 'Daily', value: 'daily' },
];

const UNIT_OPTIONS: UnitType[] = ['pieces', 'bunch', 'stems', 'dozen', 'kg', 'grams', 'ml', 'litre', 'packet', 'tray', 'box', 'meter'];

const EMPTY_FORM = {
  name: '',
  description: '',
  selling_price: '',
  mrp_price: '',
  frequency: 'monthly' as string,
  image_url: '',
  image_local_uri: '',
  features: '',
  product_type: 'flower' as ProductType,
  supports_one_time: false,
};

const freqLabel: Record<string, string> = {
  weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly',
  '3months': '3 Months', '6months': '6 Months', daily: 'Daily',
};

export default function AdminPlansScreen() {
  return (
    <ModuleGuard module="catalog">
      <AdminPlansScreenContent />
    </ModuleGuard>
  );
}

function AdminPlansScreenContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [plans, setPlans] = useState<(SubscriptionPlan & { _reqCount?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [flowerModalPlan, setFlowerModalPlan] = useState<SubscriptionPlan | null>(null);
  const [poojaModalPlan, setPoojaModalPlan] = useState<SubscriptionPlan | null>(null);

  const load = async () => {
    try {
      const { data } = await supabase.from('subscription_plans').select('*').order('sort_order');
      if (data) {
        // Fetch flower requirement counts for all plans in one query
        const { data: reqCounts } = await supabase
          .from('plan_flower_requirements')
          .select('plan_id');
        const countMap: Record<string, number> = {};
        for (const r of reqCounts ?? []) {
          countMap[r.plan_id] = (countMap[r.plan_id] ?? 0) + 1;
        }
        const plansWithCounts = data.map(p => ({ ...p, _reqCount: countMap[p.id] ?? 0 }));
        setPlans(plansWithCounts);
      }
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  usePageVisibility(load);

  const handleToggleActive = async (id: string, current: boolean) => {
    await supabase.from('subscription_plans').update({ is_active: !current }).eq('id', id);
    setPlans(prev => prev.map(p => p.id === id ? { ...p, is_active: !current } : p));
  };

  const handleToggleVisible = async (id: string, current: boolean) => {
    await supabase.from('subscription_plans').update({ show_in_customer_plans: !current }).eq('id', id);
    setPlans(prev => prev.map(p => p.id === id ? { ...p, show_in_customer_plans: !current } : p));
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowFormModal(true);
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
      product_type: plan.product_type ?? 'flower',
      supports_one_time: plan.supports_one_time ?? false,
    });
    setFormError('');
    setShowFormModal(true);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setForm(prev => ({ ...prev, image_local_uri: result.assets[0].uri, image_url: '' }));
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
        canvas.toBlob(b => { if (b) resolve(b); else reject(new Error('compression failed')); }, 'image/jpeg', 0.8);
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
      features: form.features.split('\n').map(f => f.trim()).filter(Boolean),
      sort_order: editing ? editing.sort_order : plans.length,
      product_type: form.product_type,
      supports_one_time: form.product_type === 'pooja' ? form.supports_one_time : false,
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
    setShowFormModal(false);
  };

  const formatPrice = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

  // ===== Plan Card (shared between web and mobile) =====
  const PlanCard = ({ plan }: { plan: SubscriptionPlan & { _reqCount?: number } }) => {
    const reqCount = plan._reqCount ?? 0;
    const hasFlowers = reqCount > 0;
    const isPooja = plan.product_type === 'pooja';

    return (
      <View style={s.planCard}>
        {/* Top row: image + name/price */}
        <View style={s.cardTop}>
          <View style={s.cardImageWrap}>
            {plan.image_url ? (
              <Image source={{ uri: plan.image_url }} style={s.cardImage} resizeMode="cover" />
            ) : (
              <View style={s.cardImagePlaceholder}>
                <Sprout size={20} color={Colors.textDisabled} strokeWidth={1.5} />
              </View>
            )}
            <View style={s.cardFreqBadge}>
              <Text style={s.cardFreqText}>{freqLabel[plan.frequency] ?? plan.frequency}</Text>
            </View>
          </View>

          <View style={s.cardInfo}>
            <Text style={s.cardName} numberOfLines={1}>{plan.name}</Text>
            {plan.description ? (
              <Text style={s.cardDesc} numberOfLines={2}>{plan.description}</Text>
            ) : null}
            <View style={s.cardPriceRow}>
              <Text style={s.cardPrice}>{formatPrice(plan.price)}</Text>
              {plan.mrp_price && plan.mrp_price > plan.price ? (
                <Text style={s.cardMrp}>{formatPrice(plan.mrp_price)}</Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Badges row */}
        <View style={s.cardBadges}>
          <View style={[s.cardBadge, plan.is_active ? s.badgeActive : s.badgeInactive]}>
            <View style={[s.badgeDot, { backgroundColor: plan.is_active ? Colors.success : Colors.neutral[400] }]} />
            <Text style={[s.badgeText, { color: plan.is_active ? Colors.success : Colors.textTertiary }]}>
              {plan.is_active ? 'Active' : 'Inactive'}
            </Text>
          </View>

          <TouchableOpacity
            style={[s.cardBadge, plan.show_in_customer_plans !== false ? s.badgeVisible : s.badgeHidden]}
            onPress={() => handleToggleVisible(plan.id, plan.show_in_customer_plans ?? true)}
            activeOpacity={0.7}
          >
            {plan.show_in_customer_plans !== false ? (
              <Eye size={11} color={Colors.primary} strokeWidth={2} />
            ) : (
              <EyeOff size={11} color={Colors.textTertiary} strokeWidth={2} />
            )}
            <Text style={[s.badgeText, { color: plan.show_in_customer_plans !== false ? Colors.primary : Colors.textTertiary }]}>
              {plan.show_in_customer_plans !== false ? 'Visible' : 'Hidden'}
            </Text>
          </TouchableOpacity>

          <View style={[s.cardBadge, isPooja ? s.badgeFlowers : hasFlowers ? s.badgeFlowers : s.badgeNoFlowers]}>
            {isPooja ? <Flame size={11} color={Colors.accent} strokeWidth={2} /> : <Leaf size={11} color={hasFlowers ? Colors.success : Colors.warning} strokeWidth={2} />}
            <Text style={[s.badgeText, { color: isPooja ? Colors.accentDark : hasFlowers ? Colors.success : Colors.warning }]}>
              {isPooja ? 'Pooja package' : hasFlowers ? `${reqCount} flower${reqCount !== 1 ? 's' : ''}` : 'No flowers'}
            </Text>
          </View>
        </View>

        {/* Action buttons */}
        <View style={s.cardActions}>
          <TouchableOpacity
            style={[s.cardActionBtn, isPooja ? s.actionBtnPrimary : hasFlowers ? s.actionBtnPrimary : s.actionBtnWarning]}
            onPress={() => isPooja ? setPoojaModalPlan(plan) : setFlowerModalPlan(plan)}
            activeOpacity={0.75}
          >
            {isPooja ? <Flame size={14} color={Colors.accentDark} strokeWidth={2} /> : <Sprout size={14} color={hasFlowers ? Colors.primary : Colors.warning} strokeWidth={2} />}
            <Text style={[s.cardActionText, { color: isPooja ? Colors.accentDark : hasFlowers ? Colors.primary : Colors.warning }]}>
              {isPooja ? 'Configure Package' : hasFlowers ? 'Manage Flowers' : 'Add Flowers'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.cardActionBtnSecondary}
            onPress={() => openEdit(plan)}
            activeOpacity={0.75}
          >
            <Pencil size={14} color={Colors.textSecondary} strokeWidth={2} />
            <Text style={s.cardActionTextSecondary}>Edit</Text>
          </TouchableOpacity>

          <View style={s.cardToggleWrap}>
            <Switch
              value={plan.is_active}
              onValueChange={() => handleToggleActive(plan.id, plan.is_active)}
              trackColor={{ false: Colors.neutral[300], true: Colors.primaryLight }}
              thumbColor={plan.is_active ? Colors.primary : Colors.neutral[400]}
            />
          </View>
        </View>

        {/* Warning if no flowers */}
        {!hasFlowers && !isPooja && (
          <View style={s.cardWarning}>
            <AlertCircle size={12} color={Colors.warning} strokeWidth={2} />
            <Text style={s.cardWarningText}>No flower breakup defined — daily requirements won't generate for this plan.</Text>
          </View>
        )}
      </View>
    );
  };

  // ===== Form Modal (shared) =====
  const formModal = (
    <Modal visible={showFormModal} transparent animationType="fade" onRequestClose={() => setShowFormModal(false)}>
      <View style={s.overlay}>
        <View style={[s.sheet, isWeb && s.sheetWeb]}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{editing ? 'Edit Plan' : 'Create New Plan'}</Text>
            <TouchableOpacity onPress={() => setShowFormModal(false)} hitSlop={8}>
              <X size={20} color={Colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <ScrollView style={s.sheetBody} showsVerticalScrollIndicator={false}>
            <Text style={s.fieldLabel}>Plan Name *</Text>
            <TextInput
              style={s.field}
              value={form.name}
              onChangeText={v => setForm({ ...form, name: v })}
              placeholder="e.g. Bloom Monthly"
              placeholderTextColor={Colors.textDisabled}
            />

            <Text style={s.fieldLabel}>Description</Text>
            <TextInput
              style={[s.field, s.fieldMultiline]}
              value={form.description}
              onChangeText={v => setForm({ ...form, description: v })}
              placeholder="Brief description..."
              placeholderTextColor={Colors.textDisabled}
              multiline
            />

            <View style={s.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Selling Price (₹) *</Text>
                <TextInput
                  style={s.field}
                  value={form.selling_price}
                  onChangeText={v => setForm({ ...form, selling_price: v })}
                  placeholder="e.g. 999"
                  placeholderTextColor={Colors.textDisabled}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>MRP (₹)</Text>
                <TextInput
                  style={s.field}
                  value={form.mrp_price}
                  onChangeText={v => setForm({ ...form, mrp_price: v })}
                  placeholder="e.g. 1299"
                  placeholderTextColor={Colors.textDisabled}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <Text style={s.fieldLabel}>Product type</Text>
            <View style={s.freqWrap}>
              {([['flower', 'Flowers'], ['pooja', 'Pooja package']] as const).map(([value, label]) => (
                <TouchableOpacity key={value} style={[s.freqChip, form.product_type === value && s.freqChipActive]} onPress={() => setForm({ ...form, product_type: value })}>
                  <Text style={[s.freqChipText, form.product_type === value && s.freqChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {form.product_type === 'pooja' && <TouchableOpacity style={s.oneTimeRow} onPress={() => setForm({ ...form, supports_one_time: !form.supports_one_time })}><Switch value={form.supports_one_time} onValueChange={supports_one_time => setForm({ ...form, supports_one_time })} trackColor={{ false: Colors.neutral[300], true: Colors.primaryLight }} thumbColor={form.supports_one_time ? Colors.primary : Colors.neutral[400]} /><View><Text style={s.oneTimeLabel}>Allow one-time purchase</Text><Text style={s.oneTimeHint}>Customers can choose a date for a single occasion</Text></View></TouchableOpacity>}

            <Text style={s.fieldLabel}>Frequency</Text>
            <View style={s.freqWrap}>
              {FREQ_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[s.freqChip, form.frequency === opt.value && s.freqChipActive]}
                  onPress={() => setForm({ ...form, frequency: opt.value })}
                >
                  <Text style={[s.freqChipText, form.frequency === opt.value && s.freqChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>Plan Image</Text>
            <TouchableOpacity style={s.imagePicker} onPress={pickImage} activeOpacity={0.75}>
              {(form.image_local_uri || form.image_url) ? (
                <View style={s.imagePreviewWrap}>
                  <Image source={{ uri: form.image_local_uri || form.image_url }} style={s.imagePreview} resizeMode="cover" />
                  <View style={s.imageOverlay}>
                    <Upload size={16} color={Colors.white} />
                    <Text style={s.imageOverlayText}>Change</Text>
                  </View>
                </View>
              ) : (
                <View style={s.imageEmpty}>
                  <ImageIcon size={28} color={Colors.textDisabled} strokeWidth={1.5} />
                  <Text style={s.imageEmptyText}>Tap to upload</Text>
                  <Text style={s.imageEmptyHint}>4:3 ratio recommended</Text>
                </View>
              )}
            </TouchableOpacity>
            {uploadingImage && (
              <View style={s.uploadingRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={s.uploadingText}>Uploading image...</Text>
              </View>
            )}

            <Text style={s.fieldLabel}>Features (one per line)</Text>
            <TextInput
              style={[s.field, s.fieldMultiline]}
              value={form.features}
              onChangeText={v => setForm({ ...form, features: v })}
              placeholder={'Fresh seasonal bouquets\nFree delivery'}
              placeholderTextColor={Colors.textDisabled}
              multiline
            />

            {formError ? <Text style={s.errorText}>{formError}</Text> : null}
          </ScrollView>

          <View style={s.sheetFooter}>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowFormModal(false)}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving || uploadingImage}>
              {saving ? <ActivityIndicator size="small" color={Colors.white} /> : (
                <>
                  <Check size={16} color={Colors.white} strokeWidth={2} />
                  <Text style={s.saveBtnText}>{editing ? 'Save Changes' : 'Create Plan'}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // ===== Flower Requirements Modal =====
  const poojaModal = <PoojaPackageModal plan={poojaModalPlan} onClose={() => setPoojaModalPlan(null)} onSaved={load} />;

  const flowerModal = (
    <FlowerRequirementsModal
      plan={flowerModalPlan}
      onClose={() => { setFlowerModalPlan(null); load(); }}
    />
  );

  if (isWeb) {
    return (
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {formModal}
        {flowerModal}
        {poojaModal}
        {/* Page header */}
        <View style={s.pageHeader}>
          <View style={s.pageHeaderLeft}>
            <View style={s.pageHeaderIcon}>
              <Package size={22} color={Colors.primary} strokeWidth={1.8} />
            </View>
            <View>
              <Text style={s.pageTitle}>Subscription Plans</Text>
              <Text style={s.pageSubtitle}>{plans.length} plans · {plans.filter(p => p.is_active).length} active</Text>
            </View>
          </View>
          <TouchableOpacity style={s.createBtn} onPress={openCreate} activeOpacity={0.85}>
            <Plus size={16} color={Colors.white} strokeWidth={2.5} />
            <Text style={s.createBtnText}>New Plan</Text>
          </TouchableOpacity>
        </View>

        {/* Plan grid */}
        {loading ? (
          <View style={s.loadingWrap}><ActivityIndicator color={Colors.primary} /></View>
        ) : plans.length === 0 ? (
          <View style={s.emptyWrap}>
            <Package size={48} color={Colors.textDisabled} strokeWidth={1.2} />
            <Text style={s.emptyTitle}>No plans yet</Text>
            <Text style={s.emptySub}>Create your first subscription plan to get started.</Text>
            <TouchableOpacity style={s.createBtn} onPress={openCreate}>
              <Plus size={16} color={Colors.white} strokeWidth={2.5} />
              <Text style={s.createBtnText}>Create Plan</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.planGrid}>
            {plans.map(plan => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  // ===== Mobile =====
  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {formModal}
      {flowerModal}
      {poojaModal}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <X size={22} color={Colors.textPrimary} strokeWidth={1.8} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Subscription Plans</Text>
        <TouchableOpacity style={s.addBtn} onPress={openCreate}>
          <Plus size={18} color={Colors.white} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContentMobile}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? (
          <View style={s.loadingWrap}><ActivityIndicator color={Colors.primary} /></View>
        ) : plans.length === 0 ? (
          <View style={s.emptyWrap}>
            <Package size={48} color={Colors.textDisabled} strokeWidth={1.2} />
            <Text style={s.emptyTitle}>No plans yet</Text>
            <Text style={s.emptySub}>Create your first subscription plan to get started.</Text>
            <TouchableOpacity style={s.createBtn} onPress={openCreate}>
              <Plus size={16} color={Colors.white} strokeWidth={2.5} />
              <Text style={s.createBtnText}>Create Plan</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.planList}>
            {plans.map(plan => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ===== Flower Requirements Modal Component =====
function FlowerRequirementsModal({ plan, onClose }: { plan: SubscriptionPlan | null; onClose: () => void }) {
  const isWeb = Platform.OS === 'web';
  const [reqs, setReqs] = useState<PlanFlowerRequirement[]>([]);
  const [flowerTypes, setFlowerTypes] = useState<FlowerType[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [flowerDropdownOpen, setFlowerDropdownOpen] = useState(false);
  const [flowerSearch, setFlowerSearch] = useState('');
  const [reqForm, setReqForm] = useState<{ flower_type_id: string; quantity: string; unit_type: UnitType }>({
    flower_type_id: '', quantity: '1', unit_type: 'bunch',
  });
  const [savingReq, setSavingReq] = useState(false);
  const [reqError, setReqError] = useState('');

  const loadReqs = useCallback(async () => {
    if (!plan) return;
    const [reqRes, typesRes] = await Promise.all([
      supabase.from('plan_flower_requirements').select('*, flower_type:flower_types(*)').eq('plan_id', plan.id),
      supabase.from('flower_types').select('*').eq('is_active', true).order('sort_order'),
    ]);
    if (reqRes.data) setReqs(reqRes.data);
    if (typesRes.data) setFlowerTypes(typesRes.data);
    setLoadingReqs(false);
  }, [plan]);

  useEffect(() => { if (plan) { setLoadingReqs(true); loadReqs(); } }, [loadReqs]);

  const saveReq = async () => {
    if (!plan) return;
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
    setShowAddForm(false);
    setReqForm({ flower_type_id: '', quantity: '1', unit_type: 'bunch' });
    loadReqs();
  };

  const deleteReq = async (id: string) => {
    await supabase.from('plan_flower_requirements').delete().eq('id', id);
    setReqs(prev => prev.filter(r => r.id !== id));
  };

  return (
    <Modal visible={!!plan} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.sheet, isWeb && s.sheetWeb, { maxWidth: 520 }]}>
          <View style={s.sheetHeader}>
            <View style={s.sheetHeaderLeft}>
              <Sprout size={18} color={Colors.primary} strokeWidth={2} />
              <Text style={s.sheetTitle} numberOfLines={1}>Flowers in {plan?.name ?? ''}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <X size={20} color={Colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <ScrollView style={s.sheetBody} showsVerticalScrollIndicator={false}>
            {/* Summary */}
            <View style={s.flowerSummary}>
              <View style={s.flowerSummaryItem}>
                <Text style={s.flowerSummaryValue}>{reqs.length}</Text>
                <Text style={s.flowerSummaryLabel}>Flower Types</Text>
              </View>
              <View style={s.flowerSummaryDivider} />
              <View style={s.flowerSummaryItem}>
                <Text style={s.flowerSummaryValue}>{freqLabel[plan?.frequency ?? 'monthly'] ?? 'Monthly'}</Text>
                <Text style={s.flowerSummaryLabel}>Frequency</Text>
              </View>
            </View>

            {loadingReqs ? (
              <View style={s.loadingWrap}><ActivityIndicator color={Colors.primary} /></View>
            ) : reqs.length === 0 ? (
              <View style={s.flowerEmpty}>
                <Sprout size={36} color={Colors.textDisabled} strokeWidth={1.2} />
                <Text style={s.flowerEmptyTitle}>No flowers added yet</Text>
                <Text style={s.flowerEmptySub}>
                  Add the specific flowers and quantities that make up this plan's daily delivery pack.
                  This is required for daily requirement generation.
                </Text>
              </View>
            ) : (
              <View style={s.flowerList}>
                {reqs.map(r => (
                  <View key={r.id} style={s.flowerRow}>
                    <View style={s.flowerRowDot}>
                      <Leaf size={12} color={Colors.primary} strokeWidth={2} />
                    </View>
                    <Text style={s.flowerRowName}>{(r.flower_type as any)?.display_name ?? 'Unknown'}</Text>
                    <View style={s.flowerRowQtyBadge}>
                      <Text style={s.flowerRowQty}>{r.quantity_per_delivery} {r.unit_type}</Text>
                    </View>
                    <TouchableOpacity onPress={() => deleteReq(r.id)} style={s.flowerRowDelete}>
                      <X size={14} color={Colors.error} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Add form */}
            {showAddForm ? (
              <View style={s.addFlowerForm}>
                <Text style={s.fieldLabel}>Select Flower</Text>
                <View style={s.flowerSelectWrap}>
                  <TouchableOpacity
                    style={[s.flowerSelectTrigger, flowerDropdownOpen && s.flowerSelectTriggerOpen]}
                    onPress={() => setFlowerDropdownOpen(open => !open)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.flowerSelectValue, !reqForm.flower_type_id && s.flowerSelectPlaceholder]} numberOfLines={1}>
                      {flowerTypes.find(ft => ft.id === reqForm.flower_type_id)?.display_name ?? 'Choose a flower'}
                    </Text>
                    <ChevronDown size={17} color={Colors.textSecondary} strokeWidth={1.8} />
                  </TouchableOpacity>

                  {flowerDropdownOpen && (
                    <View style={s.flowerDropdown}>
                      <View style={s.flowerSearchBox}>
                        <Search size={15} color={Colors.textTertiary} strokeWidth={1.8} />
                        <TextInput
                          style={s.flowerSearchInput}
                          value={flowerSearch}
                          onChangeText={setFlowerSearch}
                          placeholder="Search flowers..."
                          placeholderTextColor={Colors.textDisabled}
                          autoFocus={isWeb}
                        />
                        {flowerSearch ? (
                          <TouchableOpacity onPress={() => setFlowerSearch('')} hitSlop={8}>
                            <X size={14} color={Colors.textTertiary} strokeWidth={2} />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      <ScrollView style={s.flowerDropdownList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        {flowerTypes
                          .filter(ft => ft.display_name.toLowerCase().includes(flowerSearch.trim().toLowerCase()))
                          .map(ft => (
                            <TouchableOpacity
                              key={ft.id}
                              style={[s.flowerOption, reqForm.flower_type_id === ft.id && s.flowerOptionActive]}
                              onPress={() => {
                                setReqForm(p => ({ ...p, flower_type_id: ft.id, unit_type: ft.unit_type as UnitType }));
                                setFlowerDropdownOpen(false);
                                setFlowerSearch('');
                              }}
                            >
                              <View style={s.flowerOptionInfo}>
                                <Text style={[s.flowerOptionName, reqForm.flower_type_id === ft.id && s.flowerOptionNameActive]}>{ft.display_name}</Text>
                                <Text style={s.flowerOptionUnit}>{ft.unit_type}</Text>
                              </View>
                              {reqForm.flower_type_id === ft.id && <Check size={15} color={Colors.primary} strokeWidth={2.2} />}
                            </TouchableOpacity>
                          ))}
                        {flowerTypes.filter(ft => ft.display_name.toLowerCase().includes(flowerSearch.trim().toLowerCase())).length === 0 && (
                          <View style={s.flowerNoResults}>
                            <Text style={s.flowerNoResultsText}>No flowers found</Text>
                          </View>
                        )}
                      </ScrollView>
                    </View>
                  )}
                </View>

                <View style={s.fieldRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Quantity</Text>
                    <TextInput
                      style={s.field}
                      value={reqForm.quantity}
                      onChangeText={v => setReqForm(p => ({ ...p, quantity: v }))}
                      keyboardType="numeric"
                      placeholder="e.g. 10"
                      placeholderTextColor={Colors.textDisabled}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Unit</Text>
                    {isWeb ? (
                      <select
                        value={reqForm.unit_type}
                        onChange={e => setReqForm(p => ({ ...p, unit_type: e.target.value as UnitType }))}
                        style={{
                          border: `1px solid ${Colors.border}`,
                          borderRadius: Radius.md,
                          padding: '10px 12px',
                          fontFamily: Typography.fontFamily.sansRegular,
                          fontSize: Typography.size.base,
                          color: Colors.textPrimary,
                          backgroundColor: Colors.white,
                          width: '100%',
                          cursor: 'pointer',
                          outline: 'none',
                        } as any}
                      >
                        {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    ) : (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 4 }}>
                        {UNIT_OPTIONS.map(u => (
                          <TouchableOpacity
                            key={u}
                            style={[s.unitChip, reqForm.unit_type === u && s.unitChipActive]}
                            onPress={() => setReqForm(p => ({ ...p, unit_type: u }))}
                          >
                            <Text style={[s.unitChipText, reqForm.unit_type === u && s.unitChipTextActive]}>{u}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                </View>

                {reqError ? <Text style={s.errorText}>{reqError}</Text> : null}

                <View style={s.addFormActions}>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => { setShowAddForm(false); setReqError(''); }}>
                    <Text style={s.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.saveBtn} onPress={saveReq} disabled={savingReq}>
                    {savingReq ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveBtnText}>Add</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={s.addFlowerBtn} onPress={() => { setShowAddForm(true); setReqError(''); }} activeOpacity={0.8}>
                <Plus size={16} color={Colors.primary} strokeWidth={2.5} />
                <Text style={s.addFlowerBtnText}>Add Flower</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ===== Styles =====
const s = StyleSheet.create({
  // Layout
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { padding: Spacing[6], paddingBottom: Spacing[10], gap: Spacing[5], maxWidth: 1200, alignSelf: 'center', width: '100%' },
  scrollContentMobile: { padding: Spacing[5], paddingBottom: Spacing[10], gap: Spacing[4] },

  // Header (mobile)
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { padding: Spacing[1] },
  headerTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },

  // Page header (web)
  pageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[2] },
  pageHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  pageHeaderIcon: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontFamily: Typography.fontFamily.bold, fontSize: 26, color: Colors.textPrimary, letterSpacing: -0.5 },
  pageSubtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 2 },
  createBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.md },
  createBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },

  // Plan grid (web)
  planGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[4] },
  planList: { gap: Spacing[4] },

  // Plan card
  planCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border, gap: Spacing[3], ...Shadow.sm, width: '100%' },
  cardTop: { flexDirection: 'row', gap: Spacing[3] },
  cardImageWrap: { width: 64, height: 64, borderRadius: Radius.md, overflow: 'hidden', position: 'relative' },
  cardImage: { width: '100%', height: '100%' },
  cardImagePlaceholder: { width: '100%', height: '100%', backgroundColor: Colors.neutral[50], alignItems: 'center', justifyContent: 'center' },
  cardFreqBadge: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', paddingVertical: 2, paddingHorizontal: 4 },
  cardFreqText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 8, color: Colors.white, textAlign: 'center' },
  cardInfo: { flex: 1, gap: 3 },
  cardName: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.textPrimary },
  cardDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, lineHeight: 16 },
  cardPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing[2], marginTop: 2 },
  cardPrice: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.primary },
  cardMrp: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textDecorationLine: 'line-through' },

  // Badges
  cardBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  cardBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: Radius.full },
  badgeActive: { backgroundColor: Colors.successSurface },
  badgeInactive: { backgroundColor: Colors.neutral[100] },
  badgeVisible: { backgroundColor: Colors.primarySurface },
  badgeHidden: { backgroundColor: Colors.neutral[100] },
  badgeFlowers: { backgroundColor: Colors.successSurface },
  badgeNoFlowers: { backgroundColor: Colors.warningSurface },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10 },

  // Card actions
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingTop: Spacing[1], borderTopWidth: 1, borderTopColor: Colors.divider },
  cardActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 12, borderRadius: Radius.md, borderWidth: 1 },
  actionBtnPrimary: { borderColor: Colors.primary + '40', backgroundColor: Colors.primarySurface },
  actionBtnWarning: { borderColor: Colors.warning + '40', backgroundColor: Colors.warningSurface },
  cardActionText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs },
  cardActionBtnSecondary: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  cardActionTextSecondary: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.xs, color: Colors.textSecondary },
  cardToggleWrap: { marginLeft: 'auto' },

  // Warning
  cardWarning: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2], backgroundColor: Colors.warningSurface, borderRadius: Radius.sm, padding: Spacing[2] },
  cardWarningText: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.warning, lineHeight: 14 },

  // Loading / empty
  loadingWrap: { paddingTop: 80, alignItems: 'center' },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  emptySub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 320 },

  // Modal / Sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  sheet: { backgroundColor: Colors.white, borderRadius: Radius.xl, width: '100%', maxHeight: '90%', overflow: 'hidden' },
  sheetWeb: { maxWidth: 560 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sheetHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flex: 1 },
  sheetTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary, flexShrink: 1 },
  sheetBody: { paddingHorizontal: 24, paddingVertical: 16 },
  sheetFooter: { flexDirection: 'row', gap: 12, paddingHorizontal: 24, paddingVertical: 14, borderTopWidth: 1, borderTopColor: Colors.border },

  // Form fields
  oneTimeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], padding: Spacing[3], backgroundColor: Colors.accentSurface, borderRadius: Radius.md, marginTop: Spacing[2] },
  oneTimeLabel: { fontFamily: Typography.fontFamily.sansMedium, color: Colors.textPrimary, fontSize: Typography.size.sm },
  oneTimeHint: { fontFamily: Typography.fontFamily.sansRegular, color: Colors.textTertiary, fontSize: Typography.size.xs, marginTop: 2 },
  fieldLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary, marginBottom: 6, marginTop: 12 },
  field: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary, backgroundColor: Colors.white },
  fieldMultiline: { minHeight: 70, textAlignVertical: 'top' },
  fieldRow: { flexDirection: 'row', gap: 12 },
  freqWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  freqChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  freqChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  freqChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  freqChipTextActive: { color: Colors.white },

  // Image picker
  imagePicker: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, borderStyle: 'dashed', overflow: 'hidden' },
  imagePreviewWrap: { position: 'relative', height: 140 },
  imagePreview: { width: '100%', height: 140 },
  imageOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  imageOverlayText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.white },
  imageEmpty: { height: 100, alignItems: 'center', justifyContent: 'center', gap: 6 },
  imageEmptyText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textTertiary },
  imageEmptyHint: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textDisabled },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  uploadingText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },

  // Modal buttons
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  saveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.primary },
  saveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error, marginTop: 8 },

  // Flower modal
  flowerSummary: { flexDirection: 'row', backgroundColor: Colors.neutral[50], borderRadius: Radius.md, padding: Spacing[4], marginBottom: Spacing[4] },
  flowerSummaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  flowerSummaryValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary },
  flowerSummaryLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  flowerSummaryDivider: { width: 1, backgroundColor: Colors.divider },

  flowerEmpty: { alignItems: 'center', paddingVertical: Spacing[6], gap: Spacing[3] },
  flowerEmptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  flowerEmptySub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 320, lineHeight: 20 },

  flowerList: { gap: Spacing[2] },
  flowerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], backgroundColor: Colors.neutral[50], borderRadius: Radius.md },
  flowerRowDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  flowerRowName: { flex: 1, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  flowerRowQtyBadge: { backgroundColor: Colors.white, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border },
  flowerRowQty: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textSecondary },
  flowerRowDelete: { padding: 4 },

  addFlowerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.primary, borderStyle: 'dashed', backgroundColor: Colors.primarySurface, marginTop: Spacing[3] },
  addFlowerBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary },

  addFlowerForm: { backgroundColor: Colors.neutral[50], borderRadius: Radius.md, padding: Spacing[4], marginTop: Spacing[3], gap: Spacing[1] },
  addFormActions: { flexDirection: 'row', gap: Spacing[3], marginTop: Spacing[3] },

  // Searchable flower selector
  flowerSelectWrap: { position: 'relative', zIndex: 20 },
  flowerSelectTrigger: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing[2], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing[3], backgroundColor: Colors.white },
  flowerSelectTriggerOpen: { borderColor: Colors.primary },
  flowerSelectValue: { flex: 1, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.base, color: Colors.textPrimary },
  flowerSelectPlaceholder: { color: Colors.textTertiary },
  flowerDropdown: { marginTop: 6, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, overflow: 'hidden', ...Shadow.md },
  flowerSearchBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], borderBottomWidth: 1, borderBottomColor: Colors.border, paddingHorizontal: Spacing[3], backgroundColor: Colors.neutral[50] },
  flowerSearchInput: { flex: 1, minHeight: 42, paddingVertical: 8, fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textPrimary },
  flowerDropdownList: { maxHeight: 190 },
  flowerOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing[3], paddingHorizontal: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  flowerOptionActive: { backgroundColor: Colors.primarySurface },
  flowerOptionInfo: { flex: 1, gap: 2 },
  flowerOptionName: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  flowerOptionNameActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  flowerOptionUnit: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'capitalize' },
  flowerNoResults: { alignItems: 'center', paddingVertical: Spacing[4] },
  flowerNoResultsText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },

  // Flower chips
  ftChip: { paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  ftChipActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  ftChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  ftChipTextActive: { color: Colors.primary },

  // Unit chips
  unitChip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  unitChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  unitChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textSecondary },
  unitChipTextActive: { color: Colors.white },
});
