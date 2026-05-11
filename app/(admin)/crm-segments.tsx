import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Platform, ActivityIndicator, RefreshControl,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tag, Plus, X, Pencil, Trash2, ArrowLeft, Users, ChevronDown, ChevronRight } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

interface Segment {
  id: string;
  name: string;
  description: string;
  color: string;
  filter_criteria: any;
  is_dynamic: boolean;
  customer_count: number;
  created_at: string;
}

interface Tag_ {
  id: string;
  name: string;
  color: string;
  description: string;
  _count?: number;
}

const PRESET_COLORS = [
  '#2D5A27', '#4A8C42', '#C8526A', '#E07A8F', '#D4A853',
  '#A67C2E', '#2E7D32', '#E65100', '#C62828', '#1565C0',
  '#6A1B9A', '#00695C', '#4A4744', '#8C8880',
];

const EMPTY_SEG = { name: '', description: '', color: '#2D5A27' };
const EMPTY_TAG = { name: '', color: '#2D5A27', description: '' };

export default function CrmSegmentsScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { profile } = useAuthStore();
  const params = useLocalSearchParams<{ highlight?: string }>();

  const [segments, setSegments] = useState<Segment[]>([]);
  const [tags, setTags] = useState<Tag_[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'segments' | 'tags'>('segments');

  const [showSegModal, setShowSegModal] = useState(false);
  const [editSeg, setEditSeg] = useState<Segment | null>(null);
  const [segForm, setSegForm] = useState(EMPTY_SEG);
  const [savingSeg, setSavingSeg] = useState(false);
  const [segError, setSegError] = useState('');

  const [showTagModal, setShowTagModal] = useState(false);
  const [editTag, setEditTag] = useState<Tag_ | null>(null);
  const [tagForm, setTagForm] = useState(EMPTY_TAG);
  const [savingTag, setSavingTag] = useState(false);
  const [tagError, setTagError] = useState('');

  const [expandedSeg, setExpandedSeg] = useState<string | null>(params.highlight ?? null);
  const [segMembers, setSegMembers] = useState<Record<string, any[]>>({});
  const [loadingMembers, setLoadingMembers] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [segsRes, tagsRes] = await Promise.all([
        supabase.from('customer_segments').select('*').order('created_at', { ascending: true }),
        supabase.from('customer_tags').select('*, customer_tag_assignments(count)').order('created_at', { ascending: true }),
      ]);
      setSegments(segsRes.data ?? []);
      setTags((tagsRes.data ?? []).map(t => ({ ...t, _count: t.customer_tag_assignments?.[0]?.count ?? 0 })));
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadSegmentMembers = async (segId: string) => {
    if (segMembers[segId]) { setExpandedSeg(segId); return; }
    setLoadingMembers(segId);
    const { data } = await supabase.from('customer_segment_members').select('customer:profiles(id, full_name, mobile)').eq('segment_id', segId).limit(20);
    setSegMembers(p => ({ ...p, [segId]: (data ?? []).map(d => d.customer) }));
    setLoadingMembers(null);
    setExpandedSeg(segId);
  };

  const toggleSegExpand = (id: string) => {
    if (expandedSeg === id) { setExpandedSeg(null); return; }
    loadSegmentMembers(id);
  };

  const saveSeg = async () => {
    if (!segForm.name.trim()) { setSegError('Name is required'); return; }
    setSavingSeg(true); setSegError('');
    const payload = { name: segForm.name.trim(), description: segForm.description.trim(), color: segForm.color, created_by: profile?.id ?? null };
    const { error } = editSeg
      ? await supabase.from('customer_segments').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editSeg.id)
      : await supabase.from('customer_segments').insert(payload);
    setSavingSeg(false);
    if (error) { setSegError(error.message); return; }
    setShowSegModal(false);
    load();
  };

  const deleteSeg = async (id: string) => {
    if (Platform.OS !== 'web') {
      Alert.alert('Delete Segment', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => { await supabase.from('customer_segments').delete().eq('id', id); load(); } },
      ]);
    } else {
      await supabase.from('customer_segments').delete().eq('id', id);
      load();
    }
  };

  const saveTag = async () => {
    if (!tagForm.name.trim()) { setTagError('Name is required'); return; }
    setSavingTag(true); setTagError('');
    const payload = { name: tagForm.name.trim(), color: tagForm.color, description: tagForm.description.trim(), created_by: profile?.id ?? null };
    const { error } = editTag
      ? await supabase.from('customer_tags').update(payload).eq('id', editTag.id)
      : await supabase.from('customer_tags').insert(payload);
    setSavingTag(false);
    if (error) { setTagError(error.message); return; }
    setShowTagModal(false);
    load();
  };

  const deleteTag = async (id: string) => {
    if (Platform.OS !== 'web') {
      Alert.alert('Delete Tag', 'This will remove the tag from all customers.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => { await supabase.from('customer_tags').delete().eq('id', id); load(); } },
      ]);
    } else {
      await supabase.from('customer_tags').delete().eq('id', id);
      load();
    }
  };

  return (
    <View style={[s.container, { paddingTop: isWeb ? 0 : insets.top }]}>
      <View style={[s.header, isWeb && s.headerWeb]}>
        {!isWeb && (
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <ArrowLeft size={22} color={Colors.textPrimary} strokeWidth={1.8} />
          </TouchableOpacity>
        )}
        <View style={s.headerLeft}>
          <View style={s.headerIcon}>
            <Tag size={isWeb ? 22 : 18} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[s.title, isWeb && s.titleWeb]}>Segments & Tags</Text>
            <Text style={s.subtitle}>{segments.length} segments · {tags.length} tags</Text>
          </View>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => {
          if (activeTab === 'segments') { setEditSeg(null); setSegForm(EMPTY_SEG); setSegError(''); setShowSegModal(true); }
          else { setEditTag(null); setTagForm(EMPTY_TAG); setTagError(''); setShowTagModal(true); }
        }} activeOpacity={0.8}>
          <Plus size={16} color={Colors.white} strokeWidth={2} />
          <Text style={s.addBtnText}>New {activeTab === 'segments' ? 'Segment' : 'Tag'}</Text>
        </TouchableOpacity>
      </View>

      <View style={[s.tabRow, isWeb && s.tabRowWeb]}>
        <TouchableOpacity style={[s.tab, activeTab === 'segments' && s.tabActive]} onPress={() => setActiveTab('segments')}>
          <Text style={[s.tabText, activeTab === 'segments' && s.tabTextActive]}>Segments ({segments.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, activeTab === 'tags' && s.tabActive]} onPress={() => setActiveTab('tags')}>
          <Text style={[s.tabText, activeTab === 'tags' && s.tabTextActive]}>Tags ({tags.length})</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={Colors.primary} /></View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.content, isWeb && s.contentWeb]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          {activeTab === 'segments' ? (
            segments.length === 0 ? (
              <View style={s.emptyState}>
                <Tag size={36} color={Colors.textDisabled} strokeWidth={1.2} />
                <Text style={s.emptyTitle}>No segments yet</Text>
                <Text style={s.emptySub}>Create segments to group customers by behavior or attributes.</Text>
              </View>
            ) : (
              segments.map(seg => (
                <View key={seg.id} style={s.segCard}>
                  <TouchableOpacity style={s.segHeader} onPress={() => toggleSegExpand(seg.id)} activeOpacity={0.8}>
                    <View style={[s.segColorBar, { backgroundColor: seg.color }]} />
                    <View style={s.segInfo}>
                      <Text style={s.segName}>{seg.name}</Text>
                      {seg.description ? <Text style={s.segDesc} numberOfLines={1}>{seg.description}</Text> : null}
                    </View>
                    <View style={s.segRight}>
                      <View style={[s.segCountBadge, { backgroundColor: seg.color + '18', borderColor: seg.color + '40' }]}>
                        <Users size={11} color={seg.color} strokeWidth={2} />
                        <Text style={[s.segCountText, { color: seg.color }]}>{seg.customer_count}</Text>
                      </View>
                      {seg.is_dynamic ? <View style={s.dynamicBadge}><Text style={s.dynamicText}>Dynamic</Text></View> : null}
                    </View>
                    <View style={s.segActions}>
                      <TouchableOpacity onPress={() => { setEditSeg(seg); setSegForm({ name: seg.name, description: seg.description, color: seg.color }); setSegError(''); setShowSegModal(true); }} style={s.actionBtn}>
                        <Pencil size={14} color={Colors.textTertiary} strokeWidth={1.8} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteSeg(seg.id)} style={s.actionBtn}>
                        <Trash2 size={14} color={Colors.error} strokeWidth={1.8} />
                      </TouchableOpacity>
                      {expandedSeg === seg.id
                        ? <ChevronDown size={16} color={Colors.textTertiary} strokeWidth={1.8} />
                        : <ChevronRight size={16} color={Colors.textTertiary} strokeWidth={1.8} />}
                    </View>
                  </TouchableOpacity>
                  {expandedSeg === seg.id && (
                    <View style={s.segBody}>
                      {loadingMembers === seg.id ? (
                        <ActivityIndicator size="small" color={Colors.primary} style={{ padding: Spacing[3] }} />
                      ) : (segMembers[seg.id] ?? []).length === 0 ? (
                        <Text style={s.noMembers}>No members added to this segment yet.</Text>
                      ) : (
                        <View style={s.memberList}>
                          {(segMembers[seg.id] ?? []).map(m => (
                            <TouchableOpacity key={m?.id} style={s.memberRow} onPress={() => router.push({ pathname: '/(admin)/customer-detail' as any, params: { id: m?.id } })} activeOpacity={0.8}>
                              <View style={[s.memberAvatar, { backgroundColor: seg.color + '20' }]}>
                                <Text style={[s.memberAvatarText, { color: seg.color }]}>{(m?.full_name ?? m?.mobile ?? '?').charAt(0).toUpperCase()}</Text>
                              </View>
                              <Text style={s.memberName}>{m?.full_name ?? m?.mobile}</Text>
                              <ChevronRight size={13} color={Colors.textTertiary} />
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              ))
            )
          ) : (
            tags.length === 0 ? (
              <View style={s.emptyState}>
                <Tag size={36} color={Colors.textDisabled} strokeWidth={1.2} />
                <Text style={s.emptyTitle}>No tags yet</Text>
              </View>
            ) : (
              <View style={[s.tagsGrid, isWeb && s.tagsGridWeb]}>
                {tags.map(tag => (
                  <View key={tag.id} style={s.tagCard}>
                    <View style={[s.tagColorStrip, { backgroundColor: tag.color }]} />
                    <View style={s.tagCardBody}>
                      <View style={s.tagCardTop}>
                        <View style={[s.tagPill, { backgroundColor: tag.color + '18', borderColor: tag.color + '40' }]}>
                          <Text style={[s.tagPillText, { color: tag.color }]}>{tag.name}</Text>
                        </View>
                        <View style={s.tagCardActions}>
                          <TouchableOpacity onPress={() => { setEditTag(tag); setTagForm({ name: tag.name, color: tag.color, description: tag.description }); setTagError(''); setShowTagModal(true); }} style={s.actionBtn}>
                            <Pencil size={13} color={Colors.textTertiary} strokeWidth={1.8} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => deleteTag(tag.id)} style={s.actionBtn}>
                            <Trash2 size={13} color={Colors.error} strokeWidth={1.8} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      {tag.description ? <Text style={s.tagDesc} numberOfLines={2}>{tag.description}</Text> : null}
                      <View style={s.tagCardMeta}>
                        <Users size={12} color={Colors.textTertiary} strokeWidth={1.8} />
                        <Text style={s.tagMetaText}>{tag._count ?? 0} customers</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )
          )}
        </ScrollView>
      )}

      {/* Segment Modal */}
      <Modal visible={showSegModal} transparent animationType="fade" onRequestClose={() => setShowSegModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editSeg ? 'Edit Segment' : 'New Segment'}</Text>
              <TouchableOpacity onPress={() => setShowSegModal(false)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <ModalField label="Segment Name" value={segForm.name} onChange={v => setSegForm(p => ({ ...p, name: v }))} placeholder="e.g. High Value Customers" />
              <ModalField label="Description" value={segForm.description} onChange={v => setSegForm(p => ({ ...p, description: v }))} placeholder="What defines this segment?" multiline />
              <Text style={s.fieldLabel}>Color</Text>
              <ColorPicker selected={segForm.color} onChange={c => setSegForm(p => ({ ...p, color: c }))} />
              {segError ? <Text style={s.errorText}>{segError}</Text> : null}
            </ScrollView>
            <ModalFooter onCancel={() => setShowSegModal(false)} onSave={saveSeg} saving={savingSeg} saveLabel={editSeg ? 'Update' : 'Create Segment'} />
          </View>
        </View>
      </Modal>

      {/* Tag Modal */}
      <Modal visible={showTagModal} transparent animationType="fade" onRequestClose={() => setShowTagModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, isWeb && s.modalWeb]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editTag ? 'Edit Tag' : 'New Tag'}</Text>
              <TouchableOpacity onPress={() => setShowTagModal(false)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <ModalField label="Tag Name" value={tagForm.name} onChange={v => setTagForm(p => ({ ...p, name: v }))} placeholder="e.g. VIP" />
              <ModalField label="Description" value={tagForm.description} onChange={v => setTagForm(p => ({ ...p, description: v }))} placeholder="Optional description" multiline />
              <Text style={s.fieldLabel}>Color</Text>
              <ColorPicker selected={tagForm.color} onChange={c => setTagForm(p => ({ ...p, color: c }))} />
              {tagError ? <Text style={s.errorText}>{tagError}</Text> : null}
            </ScrollView>
            <ModalFooter onCancel={() => setShowTagModal(false)} onSave={saveTag} saving={savingTag} saveLabel={editTag ? 'Update' : 'Create Tag'} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ModalField({ label, value, onChange, placeholder, multiline }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  return (
    <View style={s.fieldGroup}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput style={[s.input, multiline && s.textarea]} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={Colors.textDisabled} multiline={multiline} numberOfLines={multiline ? 3 : 1} />
    </View>
  );
}

function ColorPicker({ selected, onChange }: { selected: string; onChange: (c: string) => void }) {
  return (
    <View style={s.colorGrid}>
      {PRESET_COLORS.map(c => (
        <TouchableOpacity key={c} style={[s.colorSwatch, { backgroundColor: c }, selected === c && s.colorSwatchActive]} onPress={() => onChange(c)}>
          {selected === c && <View style={s.colorCheck} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ModalFooter({ onCancel, onSave, saving, saveLabel }: { onCancel: () => void; onSave: () => void; saving: boolean; saveLabel: string }) {
  return (
    <View style={s.modalFooter}>
      <TouchableOpacity style={s.cancelBtn} onPress={onCancel}>
        <Text style={s.cancelBtnText}>Cancel</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.saveBtn} onPress={onSave} disabled={saving}>
        {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveBtnText}>{saveLabel}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing[3] },
  headerWeb: { paddingHorizontal: Spacing[8], paddingVertical: Spacing[5] },
  backBtn: { padding: Spacing[1] },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  headerIcon: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  titleWeb: { fontSize: Typography.size['2xl'] },
  subtitle: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.primary, paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], borderRadius: Radius.full },
  addBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },
  tabRow: { flexDirection: 'row', paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], gap: Spacing[2], backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabRowWeb: { paddingHorizontal: Spacing[8] },
  tab: { paddingVertical: Spacing[2], paddingHorizontal: Spacing[4], borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.neutral[50] },
  tabActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  tabText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  scroll: { flex: 1 },
  content: { padding: Spacing[5], gap: Spacing[4] },
  contentWeb: { padding: Spacing[8], maxWidth: 900, alignSelf: 'center', width: '100%', gap: Spacing[4] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  emptySub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 280 },
  segCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  segHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], padding: Spacing[4] },
  segColorBar: { width: 4, height: 42, borderRadius: 2 },
  segInfo: { flex: 1 },
  segName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  segDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  segRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  segCountBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing[2], paddingVertical: 4, borderRadius: Radius.md, borderWidth: 1 },
  segCountText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm },
  dynamicBadge: { paddingHorizontal: Spacing[2], paddingVertical: 2, borderRadius: Radius.full, backgroundColor: Colors.primarySurface },
  dynamicText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 10, color: Colors.primary },
  segActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1] },
  actionBtn: { padding: Spacing[2] },
  segBody: { borderTopWidth: 1, borderTopColor: Colors.divider, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4] },
  noMembers: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', paddingVertical: Spacing[2] },
  memberList: { gap: Spacing[1] },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingVertical: Spacing[2] },
  memberAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm },
  memberName: { flex: 1, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  tagsGrid: { gap: Spacing[3] },
  tagsGridWeb: { flexDirection: 'row', flexWrap: 'wrap' },
  tagCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  tagColorStrip: { height: 4 },
  tagCardBody: { padding: Spacing[4], gap: Spacing[2] },
  tagCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tagPill: { paddingHorizontal: Spacing[3], paddingVertical: Spacing[1], borderRadius: Radius.full, borderWidth: 1 },
  tagPillText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm },
  tagCardActions: { flexDirection: 'row', gap: Spacing[1] },
  tagDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tagCardMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1] },
  tagMetaText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: Spacing[5] },
  modal: { width: '100%', maxHeight: '90%', backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[5], gap: Spacing[3] },
  modalWeb: { maxWidth: 440 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  fieldGroup: { gap: Spacing[1], marginBottom: Spacing[3] },
  fieldLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary, marginBottom: Spacing[1] },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base, color: Colors.textPrimary, backgroundColor: Colors.neutral[50] },
  textarea: { minHeight: 72, textAlignVertical: 'top' },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2], marginBottom: Spacing[3] },
  colorSwatch: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  colorSwatchActive: { borderWidth: 3, borderColor: Colors.white, ...Shadow.sm },
  colorCheck: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.white },
  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.error, marginBottom: Spacing[2] },
  modalFooter: { flexDirection: 'row', gap: Spacing[3] },
  cancelBtn: { flex: 1, paddingVertical: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  saveBtn: { flex: 2, paddingVertical: Spacing[3], borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  saveBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
});
