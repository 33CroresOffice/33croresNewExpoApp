import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, Modal, Share, Image } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CalendarDays, Clock3, Send, Flame, Star, MapPin, Languages as LanguagesIcon, Award, Check, X, Package, ChevronRight, IndianRupee, ChevronDown, CheckCircle2, Plus } from 'lucide-react-native';
import { format, addDays } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

type Provider = {
  id: string;
  full_name: string;
  category: string[];
  specialization: string;
  experience_years: number;
  languages: string[];
  city: string;
  address: string;
  bio: string;
  profile_photo_url: string | null;
  mobile: string;
};

type Service = {
  id: string;
  name: string;
  description: string;
  price: number;
  admin_override_price: number | null;
  duration_minutes: number;
  consultation_mode: string;
};

type Address = { id: string; street: string; city: string; pincode: string; landmark: string | null; apartment_name: string | null; locality_id: string | null };

type PoojaSetup = {
  id: string;
  description: string;
  duration_minutes: number;
  service_fee: number;
  language: string;
  special_instructions: string;
  pooja_type: { name: string } | null;
  items: { quantity: number; pooja_item: { name: string; unit_type: string } | null }[];
};

const TIME_OPTIONS = ['6:00 – 9:00 AM', '9:00 AM – 12:00 PM', '4:00 – 7:00 PM'];

function getDateOptions(): Date[] {
  return Array.from({ length: 30 }, (_, index) => addDays(new Date(), index + 1));
}

export default function CustomerProviderDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useAuthStore();

  const [provider, setProvider] = useState<Provider | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [poojaSetups, setPoojaSetups] = useState<PoojaSetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [bookingType, setBookingType] = useState<'service' | 'pooja' | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedPooja, setSelectedPooja] = useState<PoojaSetup | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [notes, setNotes] = useState('');
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [successBookingId, setSuccessBookingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [providerRes, serviceRes, poojaRes] = await Promise.all([
      supabase.from('service_providers').select('id, full_name, mobile, email, category, specialization, experience_years, languages, city, address, bio, profile_photo_url, approval_status, is_active, bookings_enabled').eq('id', id).maybeSingle(),
      supabase.from('provider_services').select('*').eq('provider_id', id).eq('is_active', true).order('created_at'),
      supabase.from('provider_pooja_setups').select('id, description, duration_minutes, service_fee, language, special_instructions, pooja_type:pooja_types(name), items:provider_pooja_items(quantity, pooja_item:pooja_items(name, unit_type))').eq('provider_id', id).eq('is_active', true).order('created_at'),
    ]);
    const providerData = providerRes.data as Provider | null;
    setProvider(providerData);
    if (providerData?.profile_photo_url) {
      const { data: signedPhoto } = await supabase.storage
        .from('provider-photos')
        .createSignedUrl(providerData.profile_photo_url, 3600);
      setProfilePhotoUrl(signedPhoto?.signedUrl ?? null);
    } else {
      setProfilePhotoUrl(null);
    }
    setServices((serviceRes.data ?? []) as Service[]);
    setPoojaSetups((poojaRes.data ?? []) as unknown as PoojaSetup[]);
    if (session?.user?.id) {
      const { data: addrData } = await supabase.from('addresses').select('id, street, city, pincode, landmark, apartment_name, locality_id').eq('user_id', session.user.id).order('created_at', { ascending: false });
      setAddresses((addrData ?? []) as Address[]);
    }
    setLoading(false);
    setRefreshing(false);
  }, [id, session?.user?.id]);

  useEffect(() => { load(); }, [load]);

  const openServiceBooking = (service: Service) => {
    setBookingType('service');
    setSelectedService(service);
    setSelectedPooja(null);
    setDate(''); setTime(''); setShowDatePicker(false); setShowTimePicker(false); setNotes(''); setMessage(''); setSelectedAddressId(null); setShowAddressPicker(false);
    setShowModal(true);
  };

  const openPoojaBooking = (pooja: PoojaSetup) => {
    setBookingType('pooja');
    setSelectedPooja(pooja);
    setSelectedService(null);
    setDate(''); setTime(''); setShowDatePicker(false); setShowTimePicker(false); setNotes(''); setMessage(''); setSelectedAddressId(null); setShowAddressPicker(false);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setShowDatePicker(false);
    setShowTimePicker(false);
    setBookingType(null);
    setSelectedService(null);
    setSelectedPooja(null);
  };

  const book = async () => {
    if (!session?.user?.id || !provider) { setMessage('Please sign in to book a service.'); return; }
    if (!date || !time) { setMessage('Choose a preferred date and time.'); return; }
    if (!selectedAddressId) { setMessage('Select a Pooja/Service location address.'); return; }
    setSending(true); setMessage('');
    try {
      if (bookingType === 'pooja' && selectedPooja) {
        const { data: bookingId, error: rpcError } = await supabase.rpc('create_pooja_booking', {
          p_provider_id: provider.id,
          p_pooja_setup_id: selectedPooja.id,
          p_customer_name: profile?.full_name ?? 'Customer',
          p_customer_mobile: profile?.mobile ?? '',
          p_preferred_date: date,
          p_preferred_time: time,
          p_notes: notes.trim() || null,
          p_address_id: selectedAddressId,
        });
        if (rpcError) throw rpcError;
        closeModal();
        setSuccessBookingId(bookingId);
        return;
      } else if (bookingType === 'service' && selectedService) {
        const { data: bookingId, error: rpcError } = await supabase.rpc('create_provider_booking', {
          p_provider_id: provider.id,
          p_service_id: selectedService.id,
          p_customer_name: profile?.full_name ?? 'Customer',
          p_customer_mobile: profile?.mobile ?? '',
          p_preferred_date: date,
          p_preferred_time: time,
          p_consultation_mode: selectedService.consultation_mode,
          p_notes: notes.trim() || null,
          p_address_id: selectedAddressId,
        });
        if (rpcError) throw rpcError;
        closeModal();
        setSuccessBookingId(bookingId);
        return;
      } else {
        setMessage('Select a service or pooja to book.');
        setSending(false);
        return;
      }
    } catch (e: any) {
      setMessage(e?.message ?? 'We could not send this booking request. Please try again.');
    }
    setSending(false);
  };

  const shareProfile = async () => {
    if (!provider) return;
    try {
      await Share.share({ message: `Check out ${provider.full_name} on 33 Crores Flowers — ${provider.specialization} in ${provider.city || 'your area'}.` });
    } catch {}
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;
  if (!provider) return <View style={styles.center}><Text style={styles.emptyTitle}>Provider not found.</Text></View>;

  const bookingTitle = bookingType === 'pooja' ? selectedPooja?.pooja_type?.name ?? 'Pooja' : selectedService?.name ?? 'Service';

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing[3] }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareBtn} onPress={shareProfile}>
            <Text style={styles.shareBtnText}>Share</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.avatarWrap}>
              {profilePhotoUrl ? (
                <Image source={{ uri: profilePhotoUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatar}><Text style={styles.avatarText}>{provider.full_name.charAt(0).toUpperCase()}</Text></View>
              )}
              <View style={styles.verifiedBadge}><Check size={11} color={Colors.white} strokeWidth={3} /></View>
            </View>
            <View style={styles.heroInfo}>
              <Text style={styles.heroName}>{provider.full_name}</Text>
              <Text style={styles.heroCategory}>{provider.category.join(', ')}</Text>
              <Text style={styles.heroSpecialization}>{provider.specialization}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Award size={16} color={Colors.accent} />
              <Text style={styles.statValue}>{provider.experience_years}+</Text>
              <Text style={styles.statLabel}>Years</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <MapPin size={16} color={Colors.accent} />
              <Text style={styles.statValue} numberOfLines={1}>{provider.city || 'Online'}</Text>
              <Text style={styles.statLabel}>Location</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <LanguagesIcon size={16} color={Colors.accent} />
              <Text style={styles.statValue} numberOfLines={1}>{(provider.languages ?? []).length}</Text>
              <Text style={styles.statLabel}>Languages</Text>
            </View>
          </View>

          {provider.bio ? (
            <View style={styles.bioWrap}>
              <Text style={styles.bioLabel}>About</Text>
              <Text style={styles.bioText}>{provider.bio}</Text>
            </View>
          ) : null}

          {provider.languages && provider.languages.length > 0 ? (
            <View style={styles.langWrap}>
              {provider.languages.map(lang => (
                <View key={lang} style={styles.langChip}><Text style={styles.langChipText}>{lang}</Text></View>
              ))}
            </View>
          ) : null}
        </View>

        {poojaSetups.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Flame size={18} color={Colors.accent} />
              <Text style={styles.sectionTitle}>Pooja Services</Text>
            </View>
            <Text style={styles.sectionSub}>Book a pooja with this pandit. Choose a service and pick your preferred date and time.</Text>
            {poojaSetups.map(pooja => (
              <View key={pooja.id} style={styles.poojaCard}>
                <View style={styles.poojaHeader}>
                  <View style={styles.poojaIcon}><Flame size={16} color={Colors.accent} /></View>
                  <View style={styles.poojaTitleWrap}>
                    <Text style={styles.poojaTitle}>{pooja.pooja_type?.name ?? 'Pooja Service'}</Text>
                    <Text style={styles.poojaDesc} numberOfLines={2}>{pooja.description || 'Traditional pooja service'}</Text>
                  </View>
                  <View style={styles.poojaPriceWrap}>
                    <IndianRupee size={13} color={Colors.primary} />
                    <Text style={styles.poojaPrice}>{pooja.service_fee}</Text>
                  </View>
                </View>

                <View style={styles.poojaMetaRow}>
                  <View style={styles.poojaMetaItem}><Clock3 size={12} color={Colors.textTertiary} /><Text style={styles.poojaMetaText}>{pooja.duration_minutes} min</Text></View>
                  {pooja.language ? <View style={styles.poojaMetaItem}><LanguagesIcon size={12} color={Colors.textTertiary} /><Text style={styles.poojaMetaText}>{pooja.language}</Text></View> : null}
                </View>

                {pooja.items.length > 0 ? (
                  <View style={styles.poojaItemsWrap}>
                    <View style={styles.poojaItemsLabel}><Package size={11} color={Colors.textTertiary} /><Text style={styles.poojaItemsLabelText}>Items included</Text></View>
                    <Text style={styles.poojaItemsText}>{pooja.items.map(item => `${item.pooja_item?.name ?? 'Item'} (${item.quantity} ${item.pooja_item?.unit_type ?? ''})`).join('  ·  ')}</Text>
                  </View>
                ) : null}

                {pooja.special_instructions ? (
                  <View style={styles.poojaInstructionsWrap}><Text style={styles.poojaInstructionsText}>{pooja.special_instructions}</Text></View>
                ) : null}

                <TouchableOpacity style={styles.bookPoojaBtn} onPress={() => openPoojaBooking(pooja)} activeOpacity={0.85}>
                  <CalendarDays size={15} color={Colors.white} />
                  <Text style={styles.bookPoojaBtnText}>Book this pooja</Text>
                  <ChevronRight size={16} color={Colors.white} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        {services.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Star size={18} color={Colors.primary} />
              <Text style={styles.sectionTitle}>Consultation Services</Text>
            </View>
            {services.map(service => {
              const price = service.admin_override_price ?? service.price;
              return (
                <View key={service.id} style={styles.serviceCard}>
                  <View style={styles.serviceTop}>
                    <View style={styles.serviceCopy}>
                      <Text style={styles.serviceName}>{service.name}</Text>
                      <Text style={styles.serviceDesc} numberOfLines={2}>{service.description || `${service.duration_minutes} minute consultation`}</Text>
                    </View>
                    <View style={styles.servicePriceWrap}>
                      <IndianRupee size={13} color={Colors.primary} />
                      <Text style={styles.servicePrice}>{price}</Text>
                    </View>
                  </View>
                  <View style={styles.serviceMetaRow}>
                    <View style={styles.serviceMetaItem}><Clock3 size={12} color={Colors.textTertiary} /><Text style={styles.serviceMetaText}>{service.duration_minutes} min</Text></View>
                    <View style={styles.serviceMetaItem}><Text style={styles.serviceMetaText}>{service.consultation_mode.replace('_', ' ')}</Text></View>
                  </View>
                  <TouchableOpacity style={styles.bookServiceBtn} onPress={() => openServiceBooking(service)} activeOpacity={0.85}>
                    <Text style={styles.bookServiceBtnText}>Book consultation</Text>
                    <ChevronRight size={16} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ) : null}

        {poojaSetups.length === 0 && services.length === 0 ? (
          <View style={styles.noServices}>
            <Flame size={32} color={Colors.textDisabled} />
            <Text style={styles.noServicesTitle}>No services available yet</Text>
            <Text style={styles.noServicesText}>This provider hasn't listed any services. Check back soon.</Text>
          </View>
        ) : null}

        <View style={{ height: Spacing[10] }} />
      </ScrollView>

      <Modal visible={showModal} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Book {bookingTitle}</Text>
              <TouchableOpacity onPress={closeModal}><X size={20} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              {bookingType === 'pooja' && selectedPooja ? (
                <View style={styles.modalSummary}>
                  <View style={styles.modalSummaryIcon}><Flame size={18} color={Colors.accent} /></View>
                  <View style={styles.modalSummaryInfo}>
                    <Text style={styles.modalSummaryName}>{selectedPooja.pooja_type?.name ?? 'Pooja'}</Text>
                    <Text style={styles.modalSummaryMeta}>{selectedPooja.duration_minutes} min · {selectedPooja.language || 'Language on request'}</Text>
                  </View>
                  <View style={styles.modalSummaryPrice}>
                    <IndianRupee size={13} color={Colors.primary} />
                    <Text style={styles.modalSummaryPriceText}>{selectedPooja.service_fee}</Text>
                  </View>
                </View>
              ) : bookingType === 'service' && selectedService ? (
                <View style={styles.modalSummary}>
                  <View style={styles.modalSummaryIcon}><Star size={18} color={Colors.primary} /></View>
                  <View style={styles.modalSummaryInfo}>
                    <Text style={styles.modalSummaryName}>{selectedService.name}</Text>
                    <Text style={styles.modalSummaryMeta}>{selectedService.duration_minutes} min · {selectedService.consultation_mode.replace('_', ' ')}</Text>
                  </View>
                  <View style={styles.modalSummaryPrice}>
                    <IndianRupee size={13} color={Colors.primary} />
                    <Text style={styles.modalSummaryPriceText}>{selectedService.admin_override_price ?? selectedService.price}</Text>
                  </View>
                </View>
              ) : null}

              <Text style={styles.modalLabel}>Preferred date *</Text>
              <TouchableOpacity style={[styles.modalInputRow, showDatePicker && styles.modalInputRowActive]} onPress={() => { setShowDatePicker(!showDatePicker); setShowTimePicker(false); }} activeOpacity={0.8}>
                <CalendarDays size={17} color={Colors.primary} />
                <Text style={[styles.modalInput, !date && styles.modalPlaceholder]}>{date ? format(new Date(`${date}T00:00:00`), 'dd/MM/yyyy') : 'Select date (DD/MM/YYYY)'}</Text>
                <ChevronDown size={16} color={Colors.textTertiary} style={{ transform: [{ rotate: showDatePicker ? '180deg' : '0deg' }] }} />
              </TouchableOpacity>
              {showDatePicker ? (
                <View style={styles.datePickerPanel}>
                  <Text style={styles.pickerHint}>Choose a date</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateOptions}>
                    {getDateOptions().map(option => {
                      const value = format(option, 'yyyy-MM-dd');
                      const selected = date === value;
                      return <TouchableOpacity key={value} style={[styles.dateOption, selected && styles.dateOptionSelected]} onPress={() => { setDate(value); setShowDatePicker(false); }}>
                        <Text style={[styles.dateOptionDay, selected && styles.dateOptionSelectedText]}>{format(option, 'EEE')}</Text>
                        <Text style={[styles.dateOptionNumber, selected && styles.dateOptionSelectedText]}>{format(option, 'dd')}</Text>
                        <Text style={[styles.dateOptionMonth, selected && styles.dateOptionSelectedText]}>{format(option, 'MMM')}</Text>
                      </TouchableOpacity>;
                    })}
                  </ScrollView>
                </View>
              ) : null}

              <Text style={styles.modalLabel}>Preferred time *</Text>
              <TouchableOpacity style={[styles.modalInputRow, showTimePicker && styles.modalInputRowActive]} onPress={() => { setShowTimePicker(!showTimePicker); setShowDatePicker(false); }} activeOpacity={0.8}>
                <Clock3 size={17} color={Colors.primary} />
                <Text style={[styles.modalInput, !time && styles.modalPlaceholder]}>{time || 'Select preferred time'}</Text>
                <ChevronDown size={16} color={Colors.textTertiary} style={{ transform: [{ rotate: showTimePicker ? '180deg' : '0deg' }] }} />
              </TouchableOpacity>
              {showTimePicker ? (
                <View style={styles.timePickerPanel}>
                  <Text style={styles.pickerHint}>Choose a time window</Text>
                  {TIME_OPTIONS.map(slot => <TouchableOpacity key={slot} style={[styles.timeOption, time === slot && styles.timeOptionSelected]} onPress={() => { setTime(slot); setShowTimePicker(false); }}>
                    <Clock3 size={15} color={time === slot ? Colors.primary : Colors.textTertiary} />
                    <Text style={[styles.timeOptionText, time === slot && styles.timeOptionSelectedText]}>{slot}</Text>
                    {time === slot ? <Check size={15} color={Colors.primary} /> : null}
                  </TouchableOpacity>)}
                </View>
              ) : null}

              <Text style={styles.modalLabel}>Pooja/Service Location *</Text>
              <TouchableOpacity
                style={[styles.modalInputRow, showAddressPicker && styles.modalInputRowActive]}
                onPress={() => { setShowAddressPicker(!showAddressPicker); setShowDatePicker(false); setShowTimePicker(false); }}
                activeOpacity={0.8}
              >
                <MapPin size={17} color={Colors.primary} />
                <Text style={[styles.modalInput, !selectedAddressId && styles.modalPlaceholder]}>
                  {selectedAddressId
                    ? (() => {
                        const addr = addresses.find(a => a.id === selectedAddressId);
                        if (!addr) return 'Address selected';
                        return [addr.street, addr.apartment_name, addr.landmark, addr.city, addr.pincode].filter(Boolean).join(', ');
                      })()
                    : 'Select saved address'}
                </Text>
                <ChevronDown size={16} color={Colors.textTertiary} style={{ transform: [{ rotate: showAddressPicker ? '180deg' : '0deg' }] }} />
              </TouchableOpacity>
              {showAddressPicker ? (
                <View style={styles.addressPickerPanel}>
                  <Text style={styles.pickerHint}>Choose a saved address</Text>
                  {addresses.length === 0 ? (
                    <View style={styles.noAddressWrap}>
                      <Text style={styles.noAddressText}>No saved addresses found.</Text>
                      <TouchableOpacity style={styles.addAddrLink} onPress={() => { closeModal(); router.push('/(customer)/address-form'); }}>
                        <Plus size={14} color={Colors.primary} />
                        <Text style={styles.addAddrLinkText}>Add a new address</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    addresses.map(addr => (
                      <TouchableOpacity
                        key={addr.id}
                        style={[styles.addressOption, selectedAddressId === addr.id && styles.addressOptionSelected]}
                        onPress={() => { setSelectedAddressId(addr.id); setShowAddressPicker(false); }}
                        activeOpacity={0.8}
                      >
                        <View style={styles.addressOptionIcon}>
                          <MapPin size={14} color={selectedAddressId === addr.id ? Colors.primary : Colors.textTertiary} />
                        </View>
                        <View style={styles.addressOptionCopy}>
                          <Text style={[styles.addressOptionStreet, selectedAddressId === addr.id && styles.addressOptionSelectedText]}>
                            {addr.street}{addr.apartment_name ? `, ${addr.apartment_name}` : ''}
                          </Text>
                          <Text style={[styles.addressOptionCity, selectedAddressId === addr.id && styles.addressOptionSelectedText]}>
                            {[addr.landmark, addr.city, addr.pincode].filter(Boolean).join(', ')}
                          </Text>
                        </View>
                        {selectedAddressId === addr.id ? <Check size={16} color={Colors.primary} /> : null}
                      </TouchableOpacity>
                    ))
                  )}
                  <TouchableOpacity style={styles.addAddrLink} onPress={() => { closeModal(); router.push('/(customer)/address-form'); }}>
                    <Plus size={14} color={Colors.primary} />
                    <Text style={styles.addAddrLinkText}>Add a new address</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <Text style={styles.modalLabel}>Notes (optional)</Text>
              <TextInput style={[styles.modalInputBox, styles.modalMultiline]} value={notes} onChangeText={setNotes} placeholder="Any special requests for the pandit" placeholderTextColor={Colors.textDisabled} multiline textAlignVertical="top" />

              {message ? <Text style={[styles.modalMessage, message.includes('sent') ? styles.modalMessageSuccess : styles.modalMessageError]}>{message}</Text> : null}
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={closeModal}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalBookBtn} onPress={book} disabled={sending}>
                {sending ? <ActivityIndicator color={Colors.white} /> : <><Send size={16} color={Colors.white} /><Text style={styles.modalBookBtnText}>Send request</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!successBookingId} transparent animationType="fade" onRequestClose={() => setSuccessBookingId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.successSheet}>
            <View style={styles.successIcon}><CheckCircle2 size={32} color={Colors.white} /></View>
            <Text style={styles.successTitle}>Booking Request Sent</Text>
            <Text style={styles.successMessage}>Your booking request has been sent successfully to the Pandit.</Text>
            <TouchableOpacity style={styles.successBtn} onPress={() => { const bid = successBookingId; setSuccessBookingId(null); router.push({ pathname: '/(customer)/service-order-details' as any, params: { id: bid } }); }}>
              <Text style={styles.successBtnText}>View Order</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: Spacing[5], paddingBottom: Spacing[10] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing[3] },
  emptyTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textSecondary },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing[4] },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  shareBtn: { paddingHorizontal: Spacing[4], paddingVertical: Spacing[2], borderRadius: Radius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  shareBtnText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.primary },

  heroCard: { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[5], gap: Spacing[4], borderWidth: 1, borderColor: Colors.border, ...Shadow.md },
  heroTop: { flexDirection: 'row', gap: Spacing[4], alignItems: 'center' },
  avatarWrap: { position: 'relative' },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['3xl'], color: Colors.primary },
  verifiedBadge: { position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.success, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: Colors.white },
  heroInfo: { flex: 1, gap: 3 },
  heroName: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.textPrimary },
  heroCategory: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.primary, textTransform: 'capitalize' },
  heroSpecialization: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary },

  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.neutral[50], borderRadius: Radius.lg, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4] },
  statItem: { alignItems: 'center', gap: 2, flex: 1 },
  statValue: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  statLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary },
  statDivider: { width: 1, height: 28, backgroundColor: Colors.divider },

  bioWrap: { gap: 4 },
  bioLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  bioText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 21 },

  langWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  langChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.primarySurface, borderWidth: 1, borderColor: Colors.primary },
  langChipText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.primary },

  section: { marginTop: Spacing[5], gap: Spacing[3] },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  sectionTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  sectionSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, lineHeight: 18, marginBottom: Spacing[1] },

  poojaCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], gap: Spacing[3], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  poojaHeader: { flexDirection: 'row', gap: Spacing[3], alignItems: 'flex-start' },
  poojaIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.accentSurface, alignItems: 'center', justifyContent: 'center' },
  poojaTitleWrap: { flex: 1, gap: 3 },
  poojaTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.md, color: Colors.textPrimary },
  poojaDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 20 },
  poojaPriceWrap: { flexDirection: 'row', alignItems: 'center' },
  poojaPrice: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.primary },

  poojaMetaRow: { flexDirection: 'row', gap: Spacing[4], flexWrap: 'wrap' },
  poojaMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  poojaMetaText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },

  poojaItemsWrap: { backgroundColor: Colors.neutral[50], borderRadius: Radius.md, padding: Spacing[3], gap: 4 },
  poojaItemsLabel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  poojaItemsLabelText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 10, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  poojaItemsText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textSecondary, lineHeight: 18 },

  poojaInstructionsWrap: { borderLeftWidth: 2, borderLeftColor: Colors.accent, paddingLeft: Spacing[3] },
  poojaInstructionsText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, fontStyle: 'italic', lineHeight: 18 },

  bookPoojaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2], backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: Spacing[3], ...Shadow.sm },
  bookPoojaBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.white },

  serviceCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], gap: Spacing[3], borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  serviceTop: { flexDirection: 'row', gap: Spacing[3], alignItems: 'flex-start' },
  serviceCopy: { flex: 1, gap: 3 },
  serviceName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.md, color: Colors.textPrimary },
  serviceDesc: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 20 },
  servicePriceWrap: { flexDirection: 'row', alignItems: 'center' },
  servicePrice: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.primary },
  serviceMetaRow: { flexDirection: 'row', gap: Spacing[4] },
  serviceMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  serviceMetaText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, textTransform: 'capitalize' },
  bookServiceBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2], borderWidth: 1.5, borderColor: Colors.primary, borderRadius: Radius.md, paddingVertical: Spacing[3] },
  bookServiceBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary },

  noServices: { alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[10] },
  noServicesTitle: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  noServicesText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalSheet: { width: '100%', maxWidth: 520, maxHeight: '88%', backgroundColor: Colors.white, borderRadius: Radius.xl, overflow: 'hidden', ...Shadow.lg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 22, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  modalBody: { padding: 22, gap: Spacing[2] },

  modalSummary: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], backgroundColor: Colors.neutral[50], borderRadius: Radius.lg, padding: Spacing[3], marginBottom: Spacing[3] },
  modalSummaryIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.accentSurface, alignItems: 'center', justifyContent: 'center' },
  modalSummaryInfo: { flex: 1, gap: 2 },
  modalSummaryName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textPrimary },
  modalSummaryMeta: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  modalSummaryPrice: { flexDirection: 'row', alignItems: 'center' },
  modalSummaryPriceText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.primary },

  modalLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: Spacing[3], marginBottom: 4 },
  modalInputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[3], minHeight: 48 },
  modalInputRowActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  modalInput: { flex: 1, fontFamily: Typography.fontFamily.sansRegular, color: Colors.textPrimary, fontSize: Typography.size.base },
  modalPlaceholder: { color: Colors.textDisabled },
  datePickerPanel: { backgroundColor: Colors.neutral[50], borderRadius: Radius.md, padding: Spacing[3], gap: Spacing[2], borderWidth: 1, borderColor: Colors.border },
  pickerHint: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.xs, color: Colors.textTertiary },
  dateOptions: { gap: Spacing[2] },
  dateOption: { width: 58, alignItems: 'center', gap: 2, paddingVertical: Spacing[2], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  dateOptionSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dateOptionDay: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 10, color: Colors.textTertiary, textTransform: 'uppercase' },
  dateOptionNumber: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  dateOptionMonth: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary },
  dateOptionSelectedText: { color: Colors.white },
  timePickerPanel: { backgroundColor: Colors.neutral[50], borderRadius: Radius.md, padding: Spacing[3], gap: Spacing[2], borderWidth: 1, borderColor: Colors.border },
  addressPickerPanel: { backgroundColor: Colors.neutral[50], borderRadius: Radius.md, padding: Spacing[3], gap: Spacing[2], borderWidth: 1, borderColor: Colors.border },
  noAddressWrap: { alignItems: 'center', gap: Spacing[2], paddingVertical: Spacing[3] },
  noAddressText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary },
  addAddrLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing[2] },
  addAddrLinkText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.primary },
  addressOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], minHeight: 56, paddingHorizontal: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  addressOptionSelected: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  addressOptionIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  addressOptionCopy: { flex: 1, gap: 2 },
  addressOptionStreet: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textPrimary },
  addressOptionCity: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  addressOptionSelectedText: { color: Colors.primary },
  timeOption: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingHorizontal: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  timeOptionSelected: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  timeOptionText: { flex: 1, fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  timeOptionSelectedText: { color: Colors.primary },
  modalInputBox: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], fontFamily: Typography.fontFamily.sansRegular, color: Colors.textPrimary, fontSize: Typography.size.base },
  modalMultiline: { minHeight: 70, textAlignVertical: 'top' },

  modalSlots: { gap: Spacing[2] },
  modalSlot: { padding: Spacing[3], borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, alignItems: 'center' },
  modalSlotActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  modalSlotText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  modalSlotTextActive: { color: Colors.primary },

  modalMessage: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, marginTop: Spacing[3] },
  modalMessageSuccess: { color: Colors.success },
  modalMessageError: { color: Colors.error },

  modalFooter: { flexDirection: 'row', gap: 12, padding: 18, borderTopWidth: 1, borderTopColor: Colors.border },
  modalCancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md },
  modalCancelText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.textSecondary },
  modalBookBtn: { flex: 2, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.primary, ...Shadow.sm },
  modalBookBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.white },

  successSheet: { width: '100%', maxWidth: 380, backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[7], alignItems: 'center', gap: Spacing[3], ...Shadow.lg },
  successIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing[1] },
  successTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textPrimary, textAlign: 'center' },
  successMessage: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  successBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary, paddingVertical: Spacing[3], paddingHorizontal: Spacing[6], borderRadius: Radius.md, marginTop: Spacing[2], ...Shadow.sm },
  successBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
});
