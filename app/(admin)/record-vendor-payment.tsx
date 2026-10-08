import React, { useEffect, useState, useCallback } from 'react';
import ModuleGuard from '@/components/admin/ModuleGuard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, Image, Modal,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, CircleDollarSign, X, Maximize2 } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import PhotoUploadField from '@/components/ui/PhotoUploadField';

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque', 'upi'];

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
  upi: 'UPI',
};

export default function RecordVendorPaymentScreen() {
  return (
    <ModuleGuard module="procurement">
      <RecordVendorPaymentContent />
    </ModuleGuard>
  );
}

function RecordVendorPaymentContent() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { id } = useLocalSearchParams<{ id: string }>();

  const [order, setOrder] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payNotes, setPayNotes] = useState('');
  const [receiptImagePath, setReceiptImagePath] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrPreviewVisible, setQrPreviewVisible] = useState(false);

  const load = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    try {
      const [orderRes, payRes] = await Promise.all([
        supabase
          .from('procurement_orders')
          .select('id, order_number, total_amount, vendor_id, vendor:vendors(business_name, contact_person, mobile, upi_id, qr_code_image_path)')
          .eq('id', id)
          .maybeSingle(),
        supabase
          .from('vendor_payments')
          .select('id, amount, status, payment_method')
          .eq('procurement_order_id', id)
          .order('created_at', { ascending: false }),
      ]);
      if (orderRes.data) setOrder(orderRes.data);
      if (payRes.data) setPayments(payRes.data);
    } catch (e) {
      console.error('load error', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const totalPaid = payments.filter(p => p.status === 'completed').reduce((s, p) => s + Number(p.amount), 0);
  const orderTotal = Number(order?.total_amount ?? 0);
  const amountDue = orderTotal - totalPaid;
  const fullyPaid = amountDue <= 0 && totalPaid > 0;

  const recordPayment = async () => {
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount'); return; }
    setRecording(true);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    const { error: insertError } = await supabase.from('vendor_payments').insert({
      procurement_order_id: id!,
      vendor_id: order?.vendor_id ?? order?.vendor?.id,
      amount: amt,
      payment_method: payMethod,
      notes: payNotes,
      receipt_image_path: receiptImagePath,
      status: 'completed',
      recorded_by: session?.user?.id ?? null,
    });
    if (insertError) {
      setError('Could not record the payment. Please try again.');
      setRecording(false);
      return;
    }
    const newTotalPaid = totalPaid + amt;
    if (newTotalPaid >= orderTotal && orderTotal > 0 && order?.status !== 'paid' && order?.status !== 'cancelled') {
      await supabase.from('procurement_orders').update({ status: 'paid' }).eq('id', id!);
    }
    setRecording(false);
    router.back();
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.notFoundText}>Order not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const vendor = order.vendor as any;
  const qrImageUri = vendor?.qr_code_image_path
    ? vendor.qr_code_image_path.startsWith('http')
      ? vendor.qr_code_image_path
      : supabase.storage.from('vendor-qr-codes').getPublicUrl(vendor.qr_code_image_path).data.publicUrl
    : null;

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 0 : insets.top }]}>
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={20} color={Colors.textPrimary} strokeWidth={1.8} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerIcon}>
            <CircleDollarSign size={16} color={Colors.primary} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Record Vendor Payment</Text>
            <Text style={styles.headerSub}>{order.order_number ?? '—'}</Text>
          </View>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isWeb && styles.contentWeb, { paddingBottom: insets.bottom + Spacing[8] }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Order Total</Text>
              <Text style={styles.summaryValue}>₹{orderTotal.toLocaleString('en-IN')}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Paid</Text>
              <Text style={[styles.summaryValue, { color: Colors.success }]}>₹{totalPaid.toLocaleString('en-IN')}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Balance</Text>
              <Text style={[styles.summaryValue, { color: fullyPaid ? Colors.success : Colors.error }]}>
                ₹{Math.max(amountDue, 0).toLocaleString('en-IN')}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Vendor</Text>
          <Text style={styles.vendorName}>{vendor?.business_name ?? vendor?.contact_person ?? '—'}</Text>
          {vendor?.mobile ? <Text style={styles.vendorMeta}>{vendor.mobile}</Text> : null}
          {vendor?.upi_id ? <Text style={styles.vendorMeta}>UPI: {vendor.upi_id}</Text> : null}
        </View>

        <View style={styles.card}>
          <View style={styles.formSection}>
            <Text style={styles.fieldLabel}>Payment Amount *</Text>
            <View style={styles.amountInputWrap}>
              <Text style={styles.rupeeSymbol}>₹</Text>
              <TextInput
                style={styles.amountInput}
                value={payAmount}
                onChangeText={setPayAmount}
                keyboardType="decimal-pad"
                placeholder="Enter amount"
                placeholderTextColor={Colors.textDisabled}
              />
            </View>
          </View>

          <View style={styles.formDivider} />

          <View style={styles.formSection}>
            <Text style={styles.fieldLabel}>Payment Method</Text>
            <View style={styles.methodRow}>
              {PAYMENT_METHODS.map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.methodChip, payMethod === m && styles.methodChipActive]}
                  onPress={() => setPayMethod(m)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.methodText, payMethod === m && styles.methodTextActive]}>
                    {METHOD_LABELS[m]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {payMethod === 'upi' && qrImageUri ? (
            <>
              <View style={styles.formDivider} />
              <View style={styles.qrBox}>
                <View style={styles.qrHeaderRow}>
                  <View>
                    <Text style={styles.fieldLabel}>Vendor QR Code</Text>
                    <Text style={styles.qrSubtext}>Tap the code to view it larger</Text>
                  </View>
                  <Maximize2 size={15} color={Colors.primary} strokeWidth={1.8} />
                </View>
                <TouchableOpacity
                  style={styles.qrPreviewWrap}
                  onPress={() => setQrPreviewVisible(true)}
                  activeOpacity={0.85}
                >
                  <Image source={{ uri: qrImageUri }} style={styles.qrImage} resizeMode="contain" />
                  <Text style={styles.qrHint}>Scan this QR code to pay this vendor via UPI</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          <View style={styles.formDivider} />

          <View style={styles.formSection}>
            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput
              style={styles.notesInput}
              value={payNotes}
              onChangeText={setPayNotes}
              placeholder="Optional notes..."
              placeholderTextColor={Colors.textDisabled}
              multiline
            />
          </View>

          <View style={styles.formDivider} />

          <View style={styles.formSection}>
            <Text style={styles.fieldLabel}>Payment Receipt</Text>
            <PhotoUploadField
              label="Upload Receipt"
              value={receiptImagePath}
              onChange={setReceiptImagePath}
              storagePath={`vendor-receipts/${id ?? 'new'}`}
              bucket="vendor-receipts"
              aspectRatio={[4, 3]}
              hint="Upload a screenshot or photo of the payment receipt for your records."
            />
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>

        <TouchableOpacity
          style={[styles.recordBtn, fullyPaid && styles.recordBtnDisabled]}
          onPress={recordPayment}
          disabled={recording || fullyPaid}
          activeOpacity={0.85}
        >
          {fullyPaid ? (
            <Text style={styles.recordBtnText}>Fully Paid</Text>
          ) : recording ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <>
              <Check size={15} color={Colors.white} strokeWidth={2.5} />
              <Text style={styles.recordBtnText}>Record Payment</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={qrPreviewVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setQrPreviewVisible(false)}
      >
        <View style={styles.qrModalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setQrPreviewVisible(false)}
          />
          <View style={styles.qrModalCard}>
            <View style={styles.qrModalHeader}>
              <View>
                <Text style={styles.qrModalTitle}>Vendor QR Code</Text>
                <Text style={styles.qrModalSubtext}>Scan to complete the UPI payment</Text>
              </View>
              <TouchableOpacity
                style={styles.qrCloseBtn}
                onPress={() => setQrPreviewVisible(false)}
                activeOpacity={0.8}
                accessibilityLabel="Close QR code preview"
              >
                <X size={18} color={Colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <View style={styles.qrModalImageWrap}>
              {qrImageUri ? <Image source={{ uri: qrImageUri }} style={styles.qrModalImage} resizeMode="contain" /> : null}
            </View>
            <TouchableOpacity style={styles.qrDoneBtn} onPress={() => setQrPreviewVisible(false)} activeOpacity={0.85}>
              <Text style={styles.qrDoneBtnText}>Close Preview</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.neutral[50] },
  center: { justifyContent: 'center', alignItems: 'center', flex: 1 },
  notFoundText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.lg, color: Colors.textSecondary },
  backLink: { marginTop: Spacing[3] },
  backLinkText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: Typography.size.sm, color: Colors.primary },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    paddingHorizontal: Spacing[5], paddingVertical: Spacing[4],
    backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerWeb: { paddingHorizontal: Spacing[8] },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  headerIcon: {
    width: 36, height: 36, borderRadius: Radius.md,
    backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  headerSub: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 1 },
  headerSpacer: { width: 28 },

  scroll: { flex: 1 },
  content: { padding: Spacing[5], gap: Spacing[4] },
  contentWeb: { padding: Spacing[8], maxWidth: 560, alignSelf: 'center', width: '100%' },

  summaryCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing[4] },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 10, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, marginTop: 3 },
  summaryDivider: { width: 1, height: 36, backgroundColor: Colors.border },

  card: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: Spacing[5], borderWidth: 1, borderColor: Colors.border,
    gap: Spacing[3], ...Shadow.sm,
  },
  formSection: { gap: Spacing[1] },
  formDivider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing[2] },
  sectionLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textPrimary },
  vendorName: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary, marginTop: 2 },
  vendorMeta: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },

  fieldLabel: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 12, color: Colors.textSecondary, marginTop: Spacing[2] },
  amountInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.md,
    paddingHorizontal: Spacing[3], paddingVertical: 8,
    backgroundColor: Colors.white, marginTop: 4,
  },
  rupeeSymbol: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.textSecondary },
  amountInput: {
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.base,
    color: Colors.textPrimary, flex: 1, padding: 0,
  },

  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  methodChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  methodChipActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  methodText: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11, color: Colors.textSecondary },
  methodTextActive: { color: Colors.primary },

  qrBox: { marginTop: Spacing[3], gap: Spacing[2] },
  qrHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  qrSubtext: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 11, color: Colors.textTertiary, marginTop: 2 },
  qrPreviewWrap: {
    alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.neutral[50],
    borderRadius: Radius.lg, paddingVertical: Spacing[4], paddingHorizontal: Spacing[3],
    borderWidth: 1, borderColor: Colors.border,
  },
  qrImage: { width: 190, height: 190, borderRadius: Radius.md, backgroundColor: Colors.white },
  qrHint: { fontFamily: Typography.fontFamily.sansMedium, fontSize: 11, color: Colors.textSecondary, textAlign: 'center' },
  qrModalOverlay: { flex: 1, backgroundColor: 'rgba(18, 27, 24, 0.72)', justifyContent: 'center', alignItems: 'center', padding: Spacing[5] },
  qrModalCard: { width: '100%', maxWidth: 460, backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[5], gap: Spacing[4], ...Shadow.lg },
  qrModalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing[3] },
  qrModalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.textPrimary },
  qrModalSubtext: { fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: 3 },
  qrCloseBtn: { width: 32, height: 32, borderRadius: Radius.md, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  qrModalImageWrap: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.neutral[50], borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border },
  qrModalImage: { width: '100%', maxWidth: 360, height: 360, borderRadius: Radius.md, backgroundColor: Colors.white },
  qrDoneBtn: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.neutral[100], borderRadius: Radius.md, paddingVertical: 12 },
  qrDoneBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },

  notesInput: {
    minHeight: 64, textAlignVertical: 'top', borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, padding: Spacing[3], marginTop: 4,
    fontFamily: Typography.fontFamily.sansRegular, fontSize: Typography.size.sm,
    color: Colors.textPrimary, backgroundColor: Colors.white,
  },

  errorText: { fontFamily: Typography.fontFamily.sansRegular, fontSize: 12, color: Colors.error, marginTop: Spacing[2] },

  recordBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: Radius.md,
  },
  recordBtnDisabled: { backgroundColor: Colors.neutral[300] },
  recordBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.white },
});
