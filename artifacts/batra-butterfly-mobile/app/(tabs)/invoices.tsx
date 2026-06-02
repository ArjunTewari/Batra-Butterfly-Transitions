import {
  useListInvoices,
  useAnalyzeInvoiceImage,
  useCreateInvoice,
  useConfirmInvoice,
  useListRetailers,
  useListStaff,
} from "@workspace/api-client-react";
import type { InvoiceWithItems, InvoiceAnalysisResult } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";

const fmt = (n: number) =>
  "\u20B9" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

const statusColors: Record<string, { bg: string; text: string }> = {
  draft: { bg: "#f59e0b22", text: "#f59e0b" },
  confirmed: { bg: "#22c55e22", text: "#22c55e" },
  cancelled: { bg: "#ef444422", text: "#ef4444" },
};

function InvoiceCard({ invoice }: { invoice: InvoiceWithItems }) {
  const colors = useColors();
  const router = useRouter();
  const sc = statusColors[invoice.status] ?? statusColors.draft;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}
      onPress={() => router.push(`/invoice/${invoice.id}`)}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardMeta}>
          <Text style={[styles.invoiceNum, { color: colors.foreground }]}>{invoice.invoiceNumber}</Text>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {invoice.retailerName} \u00b7 {invoice.staffName}
          </Text>
        </View>
        <View>
          <View style={[styles.badge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.badgeText, { color: sc.text }]}>
              {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
            </Text>
          </View>
        </View>
      </View>
      <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />
      <View style={styles.cardFooter}>
        <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>
          {invoice.items.length} item{invoice.items.length !== 1 ? "s" : ""}
        </Text>
        <Text style={[styles.totalValue, { color: colors.foreground }]}>
          {fmt(invoice.totalAmount)}
        </Text>
        <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
          {new Date(invoice.date).toLocaleDateString("en-IN")}
        </Text>
      </View>
    </Pressable>
  );
}

type ManualItem = {
  articleCode: string;
  productName: string;
  quantity: string;
  unitPrice: string;
};

type CreateStep = "idle" | "picking" | "analyzing" | "review" | "creating" | "manual";

export default function InvoicesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: invoices, isLoading, refetch } = useListInvoices();
  const { data: retailers } = useListRetailers();
  const { data: staff } = useListStaff();

  const analyzeImage = useAnalyzeInvoiceImage();
  const createInvoice = useCreateInvoice();
  const confirmInvoice = useConfirmInvoice();

  const [filter, setFilter] = useState<"all" | "draft" | "confirmed">("all");
  const [modalVisible, setModalVisible] = useState(false);
  const [step, setStep] = useState<CreateStep>("idle");
  const [analysis, setAnalysis] = useState<InvoiceAnalysisResult | null>(null);
  const [selectedRetailerId, setSelectedRetailerId] = useState<number>(0);
  const [selectedStaffId, setSelectedStaffId] = useState<number>(0);
  const [notes, setNotes] = useState("");

  // Manual entry state
  const [manualItems, setManualItems] = useState<ManualItem[]>([
    { articleCode: "", productName: "", quantity: "1", unitPrice: "" },
  ]);
  const [manualInvoiceNumber, setManualInvoiceNumber] = useState(`INV-${Date.now()}`);

  const filtered = (invoices ?? []).filter((inv) =>
    filter === "all" ? true : inv.status === filter
  );
  const draftCount = (invoices ?? []).filter((i) => i.status === "draft").length;

  async function handlePickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Please allow photo access to scan invoices.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0].base64) {
      await handleAnalyze(result.assets[0].base64, result.assets[0].mimeType ?? "image/jpeg");
    }
  }

  async function handleCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Please allow camera access to scan invoices.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0].base64) {
      await handleAnalyze(result.assets[0].base64, result.assets[0].mimeType ?? "image/jpeg");
    }
  }

  async function handleAnalyze(base64: string, mimeType: string) {
    setStep("analyzing");
    try {
      const result = await analyzeImage.mutateAsync({
        data: { imageBase64: base64, mimeType },
      });
      setAnalysis(result);
      setStep("review");
    } catch {
      Alert.alert("Error", "Could not analyze image. Please try again.");
      setStep("idle");
    }
  }

  async function handleConfirm() {
    if (!analysis || !selectedRetailerId || !selectedStaffId) {
      Alert.alert("Missing info", "Please select a retailer and staff member.");
      return;
    }
    setStep("creating");
    try {
      const invoice = await createInvoice.mutateAsync({
        data: {
          retailerId: selectedRetailerId,
          staffId: selectedStaffId,
          invoiceNumber: `INV-${Date.now()}`,
          notes: notes || undefined,
          items: analysis.items.map((item) => ({
            articleCode: item.articleCode ?? "UNKNOWN",
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice ?? 0,
          })),
        },
      });
      await confirmInvoice.mutateAsync({ id: invoice.id });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      setModalVisible(false);
      resetModal();
      refetch();
    } catch {
      Alert.alert("Error", "Failed to create invoice. Please try again.");
      setStep("review");
    }
  }

  async function handleConfirmManual() {
    if (!selectedRetailerId || !selectedStaffId) {
      Alert.alert("Missing info", "Please select a retailer and staff member.");
      return;
    }
    const validItems = manualItems
      .filter((i) => i.productName.trim() && i.quantity && i.unitPrice)
      .map((i) => ({
        articleCode: i.articleCode.trim() || "UNKNOWN",
        productName: i.productName.trim(),
        quantity: parseInt(i.quantity, 10),
        unitPrice: parseFloat(i.unitPrice),
      }));
    if (validItems.length === 0) {
      Alert.alert("Missing items", "Add at least one valid line item.");
      return;
    }
    setStep("creating");
    try {
      const invoice = await createInvoice.mutateAsync({
        data: {
          retailerId: selectedRetailerId,
          staffId: selectedStaffId,
          invoiceNumber: manualInvoiceNumber.trim() || `INV-${Date.now()}`,
          notes: notes || undefined,
          items: validItems,
        },
      });
      await confirmInvoice.mutateAsync({ id: invoice.id });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      setModalVisible(false);
      resetModal();
      refetch();
    } catch {
      Alert.alert("Error", "Failed to create invoice. Please try again.");
      setStep("manual");
    }
  }

  function resetModal() {
    setStep("idle");
    setAnalysis(null);
    setSelectedRetailerId(0);
    setSelectedStaffId(0);
    setNotes("");
    setManualItems([{ articleCode: "", productName: "", quantity: "1", unitPrice: "" }]);
    setManualInvoiceNumber(`INV-${Date.now()}`);
  }

  const manualTotal = manualItems.reduce(
    (s, i) => s + (parseInt(i.quantity, 10) || 0) * (parseFloat(i.unitPrice) || 0),
    0
  );

  function updateManualItem(index: number, field: keyof ManualItem, value: string) {
    setManualItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function removeManualItem(index: number) {
    setManualItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addManualItem() {
    setManualItems((prev) => [...prev, { articleCode: "", productName: "", quantity: "1", unitPrice: "" }]);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 12, paddingBottom: bottomPad + 16 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Invoices</Text>
          {draftCount > 0 && (
            <View style={[styles.badge, { backgroundColor: "#f59e0b22" }]}>
              <Text style={[styles.badgeText, { color: "#f59e0b" }]}>{draftCount} draft</Text>
            </View>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {(["all", "draft", "confirmed"] as const).map((f) => (
            <Pressable
              key={f}
              style={[
                styles.filterBtn,
                {
                  backgroundColor: filter === f ? colors.primary : colors.secondary,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => setFilter(f)}
            >
              <Text
                style={[
                  styles.filterText,
                  { color: filter === f ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {filtered.length === 0 && !isLoading ? (
          <View style={styles.emptyState}>
            <Feather name="file-text" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No invoices</Text>
          </View>
        ) : (
          filtered.map((inv) => <InvoiceCard key={inv.id} invoice={inv} />)
        )}
      </ScrollView>

      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => { setModalVisible(true); setStep("idle"); }}
      >
        <Feather name="plus" size={24} color={colors.primaryForeground} />
      </Pressable>

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => { setModalVisible(false); resetModal(); }}
      >
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => { setModalVisible(false); resetModal(); }}>
              <Feather name="x" size={22} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Invoice</Text>
            <View style={{ width: 22 }} />
          </View>

          <ScrollView
            contentContainerStyle={styles.modalBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {step === "idle" && (
              <>
                <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
                  Scan an invoice photo using your camera or gallery. AI will extract the details automatically.
                </Text>
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                  onPress={handleCamera}
                >
                  <Feather name="camera" size={20} color={colors.primaryForeground} />
                  <Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>Open Camera</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1, marginTop: 10 }]}
                  onPress={handlePickImage}
                >
                  <Feather name="image" size={20} color={colors.foreground} />
                  <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Choose from Gallery</Text>
                </Pressable>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1 }]}
                  onPress={() => setStep("manual")}
                >
                  <Feather name="edit-3" size={20} color={colors.foreground} />
                  <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Manual Entry</Text>
                </Pressable>
              </>
            )}

            {step === "analyzing" && (
              <View style={styles.analyzing}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={[styles.analyzingText, { color: colors.mutedForeground }]}>
                  Analyzing invoice with AI...
                </Text>
              </View>
            )}

            {step === "review" && analysis && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>EXTRACTED ITEMS</Text>
                {analysis.items.map((item, i) => (
                  <View key={i} style={[styles.itemRow, { borderBottomColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemName, { color: colors.foreground }]}>{item.productName}</Text>
                      <Text style={[styles.itemCode, { color: colors.mutedForeground }]}>{item.articleCode}</Text>
                    </View>
                    <Text style={[styles.itemQty, { color: colors.mutedForeground }]}>\u00d7{item.quantity}</Text>
                    <Text style={[styles.itemPrice, { color: colors.foreground }]}>{fmt(item.unitPrice)}</Text>
                  </View>
                ))}

                <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.totalLabel2, { color: colors.foreground }]}>Total</Text>
                  <Text style={[styles.totalValue2, { color: colors.foreground }]}>
                    {fmt(analysis.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0))}
                  </Text>
                </View>

                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 16 }]}>RETAILER</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
                  {(retailers ?? []).map((r) => (
                    <Pressable
                      key={r.id}
                      style={[
                        styles.selectChip,
                        {
                          backgroundColor: selectedRetailerId === r.id ? colors.primary : colors.secondary,
                          borderColor: colors.border,
                        },
                      ]}
                      onPress={() => setSelectedRetailerId(r.id)}
                    >
                      <Text style={{ color: selectedRetailerId === r.id ? colors.primaryForeground : colors.foreground, fontFamily: "Inter_500Medium", fontSize: 13 }}>
                        {r.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 12 }]}>STAFF</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
                  {(staff ?? []).map((s) => (
                    <Pressable
                      key={s.id}
                      style={[
                        styles.selectChip,
                        {
                          backgroundColor: selectedStaffId === s.id ? colors.primary : colors.secondary,
                          borderColor: colors.border,
                        },
                      ]}
                      onPress={() => setSelectedStaffId(s.id)}
                    >
                      <Text style={{ color: selectedStaffId === s.id ? colors.primaryForeground : colors.foreground, fontFamily: "Inter_500Medium", fontSize: 13 }}>
                        {s.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 12 }]}>NOTES (optional)</Text>
                <TextInput
                  style={[styles.notesInput, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                  placeholder="Add a note..."
                  placeholderTextColor={colors.mutedForeground}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                />

                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.primary, marginTop: 20 }]}
                  onPress={handleConfirm}
                  disabled={createInvoice.isPending}
                >
                  {createInvoice.isPending ? (
                    <ActivityIndicator color={colors.primaryForeground} size="small" />
                  ) : (
                    <>
                      <Feather name="check-circle" size={20} color={colors.primaryForeground} />
                      <Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>Confirm Invoice</Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1, marginTop: 10 }]}
                  onPress={() => setStep("idle")}
                >
                  <Feather name="arrow-left" size={20} color={colors.foreground} />
                  <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Scan Again</Text>
                </Pressable>
              </>
            )}

            {step === "manual" && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>INVOICE NUMBER</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                  value={manualInvoiceNumber}
                  onChangeText={setManualInvoiceNumber}
                  placeholder="INV-..."
                  placeholderTextColor={colors.mutedForeground}
                />

                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 12 }]}>RETAILER</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
                  {(retailers ?? []).map((r) => (
                    <Pressable
                      key={r.id}
                      style={[
                        styles.selectChip,
                        {
                          backgroundColor: selectedRetailerId === r.id ? colors.primary : colors.secondary,
                          borderColor: colors.border,
                        },
                      ]}
                      onPress={() => setSelectedRetailerId(r.id)}
                    >
                      <Text style={{ color: selectedRetailerId === r.id ? colors.primaryForeground : colors.foreground, fontFamily: "Inter_500Medium", fontSize: 13 }}>
                        {r.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 12 }]}>STAFF</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
                  {(staff ?? []).map((s) => (
                    <Pressable
                      key={s.id}
                      style={[
                        styles.selectChip,
                        {
                          backgroundColor: selectedStaffId === s.id ? colors.primary : colors.secondary,
                          borderColor: colors.border,
                        },
                      ]}
                      onPress={() => setSelectedStaffId(s.id)}
                    >
                      <Text style={{ color: selectedStaffId === s.id ? colors.primaryForeground : colors.foreground, fontFamily: "Inter_500Medium", fontSize: 13 }}>
                        {s.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 16 }]}>LINE ITEMS</Text>
                {manualItems.map((item, idx) => (
                  <View key={idx} style={[styles.manualItemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.manualItemHeader}>
                      <Text style={[styles.manualItemLabel, { color: colors.mutedForeground }]}>Item {idx + 1}</Text>
                      {manualItems.length > 1 && (
                        <Pressable onPress={() => removeManualItem(idx)}>
                          <Feather name="trash-2" size={16} color="#ef4444" />
                        </Pressable>
                      )}
                    </View>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular", marginBottom: 8 }]}
                      placeholder="Article code"
                      placeholderTextColor={colors.mutedForeground}
                      value={item.articleCode}
                      onChangeText={(v) => updateManualItem(idx, "articleCode", v)}
                      autoCapitalize="characters"
                    />
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular", marginBottom: 8 }]}
                      placeholder="Product name"
                      placeholderTextColor={colors.mutedForeground}
                      value={item.productName}
                      onChangeText={(v) => updateManualItem(idx, "productName", v)}
                    />
                    <View style={styles.qtyRow}>
                      <TextInput
                        style={[styles.input, { flex: 1, backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular", marginRight: 8 }]}
                        placeholder="Qty"
                        placeholderTextColor={colors.mutedForeground}
                        value={item.quantity}
                        onChangeText={(v) => updateManualItem(idx, "quantity", v)}
                        keyboardType="number-pad"
                      />
                      <TextInput
                        style={[styles.input, { flex: 2, backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                        placeholder="Unit price"
                        placeholderTextColor={colors.mutedForeground}
                        value={item.unitPrice}
                        onChangeText={(v) => updateManualItem(idx, "unitPrice", v)}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>
                ))}

                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1, marginTop: 4 }]}
                  onPress={addManualItem}
                >
                  <Feather name="plus" size={18} color={colors.foreground} />
                  <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Add Another Item</Text>
                </Pressable>

                <View style={[styles.totalRow, { borderTopColor: colors.border, marginTop: 12 }]}>
                  <Text style={[styles.totalLabel2, { color: colors.foreground }]}>Total</Text>
                  <Text style={[styles.totalValue2, { color: colors.foreground }]}>{fmt(manualTotal)}</Text>
                </View>

                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 12 }]}>NOTES (optional)</Text>
                <TextInput
                  style={[styles.notesInput, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                  placeholder="Add a note..."
                  placeholderTextColor={colors.mutedForeground}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                />

                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.primary, marginTop: 20 }]}
                  onPress={handleConfirmManual}
                  disabled={createInvoice.isPending}
                >
                  {createInvoice.isPending ? (
                    <ActivityIndicator color={colors.primaryForeground} size="small" />
                  ) : (
                    <>
                      <Feather name="check-circle" size={20} color={colors.primaryForeground} />
                      <Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>Confirm Invoice</Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1, marginTop: 10 }]}
                  onPress={() => setStep("idle")}
                >
                  <Feather name="arrow-left" size={20} color={colors.foreground} />
                  <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Back</Text>
                </Pressable>
              </>
            )}

            {step === "creating" && (
              <View style={styles.analyzing}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={[styles.analyzingText, { color: colors.mutedForeground }]}>
                  Creating invoice...
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  filterRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: 14,
  },
  cardMeta: { flex: 1, marginRight: 10 },
  invoiceNum: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cardSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardDivider: { height: StyleSheet.hairlineWidth },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  totalLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  totalValue: { fontSize: 15, fontFamily: "Inter_700Bold" },
  dateText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 100,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#fff",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalBody: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  modalDesc: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 24, lineHeight: 20 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
  },
  actionBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  analyzing: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 16 },
  analyzingText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginBottom: 8 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  itemName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  itemCode: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  itemQty: { fontSize: 14, fontFamily: "Inter_400Regular" },
  itemPrice: { fontSize: 14, fontFamily: "Inter_600SemiBold", minWidth: 70, textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  totalLabel2: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  totalValue2: { fontSize: 15, fontFamily: "Inter_700Bold" },
  selectChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 16 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
  },
  manualItemCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  manualItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  manualItemLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },
  qtyRow: { flexDirection: "row" },
});
