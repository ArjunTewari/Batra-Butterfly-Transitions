import { useGetSupplier, useAnalyzeSupplierBill, useCreateSupplierBill, useConfirmSupplierBill, getGetSupplierQueryKey, } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, Modal, ActivityIndicator, Image, } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
const fmt = (n) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
function BillRow({ bill, onConfirm, confirming, }) {
    const colors = useColors();
    const { isMaster } = useAuth();
    const [expanded, setExpanded] = useState(false);
    const isDraft = bill.status === "draft";
    return (<View style={[styles.billCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable style={styles.billHeader} onPress={() => setExpanded(!expanded)}>
        <View style={styles.billLeft}>
          <Feather name="file-text" size={16} color={colors.mutedForeground}/>
          <View style={{ marginLeft: 10 }}>
            <Text style={[styles.billNum, { color: colors.foreground }]}>{bill.billNumber}</Text>
            <Text style={[styles.billDate, { color: colors.mutedForeground }]}>
              {new Date(bill.billDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </Text>
          </View>
        </View>
        <View style={styles.billRight}>
          <Text style={[styles.billAmt, { color: colors.foreground }]}>{fmt(bill.totalAmount)}</Text>
          <View style={[
            styles.badge,
            {
                backgroundColor: isDraft ? "#f59e0b22" : "#22c55e22",
            },
        ]}>
            <Text style={[styles.badgeText, { color: isDraft ? "#f59e0b" : "#22c55e" }]}>
              {bill.status}
            </Text>
          </View>
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground}/>
        </View>
      </Pressable>

      {expanded && (<View style={{ marginTop: 10 }}>
          <View style={[styles.divider, { backgroundColor: colors.border }]}/>
          <View style={styles.itemHeader}>
            <Text style={[styles.itemHeaderText, { color: colors.mutedForeground }]}>ARTICLE</Text>
            <Text style={[styles.itemHeaderText, { color: colors.mutedForeground, flex: 2 }]}>PRODUCT</Text>
            <Text style={[{ ...styles.itemHeaderText, textAlign: "right" }, { color: colors.mutedForeground }]}>QTY</Text>
            <Text style={[{ ...styles.itemHeaderText, textAlign: "right" }, { color: colors.mutedForeground }]}>TOTAL</Text>
          </View>
          {bill.items.map((item) => (<View key={item.id} style={[styles.itemRow, { backgroundColor: colors.muted }]}>
              <Text style={[styles.itemCode, { color: colors.mutedForeground }]}>{item.articleCode}</Text>
              <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>{item.productName}</Text>
              <Text style={[styles.itemQty, { color: colors.foreground }]}>{item.quantity}</Text>
              <Text style={[styles.itemTotal, { color: colors.foreground }]}>{fmt(item.totalPrice)}</Text>
            </View>))}
          {isDraft && (isMaster ? (<Pressable style={[styles.confirmBtn, { backgroundColor: colors.foreground }]} onPress={onConfirm} disabled={confirming}>
                {confirming ? (<ActivityIndicator size="small" color={colors.background}/>) : (<>
                    <Feather name="check-circle" size={14} color={colors.background}/>
                    <Text style={[styles.confirmBtnText, { color: colors.background }]}>Confirm & Add Stock</Text>
                  </>)}
              </Pressable>) : (<View style={[styles.confirmBtn, { backgroundColor: "#f59e0b22", borderWidth: 1, borderColor: "#f59e0b44" }]}>
                <Feather name="send" size={14} color="#f59e0b"/>
                <Text style={[styles.confirmBtnText, { color: "#f59e0b" }]}>Sent for Approval</Text>
              </View>))}
        </View>)}
    </View>);
}
export default function SupplierDetailScreen() {
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const topPad = Platform.OS === "web" ? 67 : insets.top;
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const supplierId = parseInt(id !== null && id !== void 0 ? id : "0", 10);
    const queryClient = useQueryClient();
    const { data: supplier, isLoading, refetch } = useGetSupplier(supplierId);
    const analyzeImage = useAnalyzeSupplierBill();
    const createBill = useCreateSupplierBill();
    const confirmBill = useConfirmSupplierBill();
    const [refreshing, setRefreshing] = useState(false);
    const [scanModal, setScanModal] = useState(false);
    const [scanStep, setScanStep] = useState("upload");
    const [scanResult, setScanResult] = useState(null);
    const [editedItems, setEditedItems] = useState([]);
    const [confirmingId, setConfirmingId] = useState(null);
    const onRefresh = async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    };
    const handleScan = async () => {
        var _a, _b, _c;
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        let result;
        if (perm.granted) {
            result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
        }
        else {
            result = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7 });
        }
        if (result.canceled || !((_a = result.assets[0]) === null || _a === void 0 ? void 0 : _a.base64))
            return;
        setScanStep("analyzing");
        setScanModal(true);
        try {
            const asset = result.assets[0];
            const mimeType = (_b = asset.mimeType) !== null && _b !== void 0 ? _b : "image/jpeg";
            const analysis = await analyzeImage.mutateAsync({
                id: supplierId,
                data: { imageBase64: asset.base64, mimeType },
            });
            const r = analysis;
            setScanResult(analysis);
            setEditedItems(((_c = r.items) !== null && _c !== void 0 ? _c : []).map((it) => {
                var _a, _b;
                return ({
                    articleCode: (_a = it.articleCode) !== null && _a !== void 0 ? _a : "",
                    productName: it.productName,
                    quantity: String(it.quantity),
                    unitPrice: String((_b = it.unitPrice) !== null && _b !== void 0 ? _b : 0),
                });
            }));
            setScanStep("review");
        }
        catch {
            Alert.alert("Error", "Failed to analyze the bill image.");
            setScanModal(false);
            setScanStep("upload");
        }
    };
    const handleSaveDraft = async () => {
        var _a, _b;
        if (!scanResult || editedItems.length === 0)
            return;
        const r = scanResult;
        try {
            await createBill.mutateAsync({
                id: supplierId,
                data: {
                    billNumber: (_a = r.billNumber) !== null && _a !== void 0 ? _a : `BILL-${Date.now()}`,
                    billDate: (_b = r.date) !== null && _b !== void 0 ? _b : new Date().toISOString().split("T")[0],
                    items: editedItems.map((it) => ({
                        articleCode: it.articleCode || "UNKNOWN",
                        productName: it.productName,
                        quantity: parseInt(it.quantity) || 1,
                        unitPrice: parseFloat(it.unitPrice) || 0,
                    })),
                },
            });
            await queryClient.invalidateQueries({ queryKey: getGetSupplierQueryKey(supplierId) });
            Alert.alert("Saved", "Bill saved as draft.");
            setScanModal(false);
            setScanStep("upload");
            setScanResult(null);
            setEditedItems([]);
        }
        catch {
            Alert.alert("Error", "Failed to save bill.");
        }
    };
    const handleConfirmBill = async (billId) => {
        setConfirmingId(billId);
        try {
            const result = await confirmBill.mutateAsync({ id: billId });
            await queryClient.invalidateQueries({ queryKey: getGetSupplierQueryKey(supplierId) });
            const updates = result.stockUpdates;
            Alert.alert("Confirmed", `${updates.length} product(s) restocked.`);
        }
        catch {
            Alert.alert("Error", "Failed to confirm bill.");
        }
        finally {
            setConfirmingId(null);
        }
    };
    if (isLoading) {
        return (<View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.foreground}/>
      </View>);
    }
    if (!supplier) {
        return (<View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground }}>Supplier not found</Text>
      </View>);
    }
    const confirmedBills = supplier.bills.filter((b) => b.status === "confirmed");
    const totalSpend = confirmedBills.reduce((s, b) => s + b.totalAmount, 0);
    const matchedImages = supplier.stockImages.filter((sm) => sm.billId !== null);
    return (<>
      <ScrollView style={[styles.root, { backgroundColor: colors.background }]} contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: insets.bottom + 100, paddingHorizontal: 16 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.foreground}/>}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.foreground}/>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{supplier.name}</Text>
            {supplier.phone ? (<Text style={[styles.sub, { color: colors.mutedForeground }]}>{supplier.phone}</Text>) : null}
            {supplier.address ? (<Text style={[styles.sub, { color: colors.mutedForeground }]} numberOfLines={1}>{supplier.address}</Text>) : null}
          </View>
          <Pressable style={[styles.scanBtn, { backgroundColor: colors.foreground }]} onPress={handleScan}>
            <Feather name="camera" size={16} color={colors.background}/>
            <Text style={[styles.scanBtnText, { color: colors.background }]}>Scan Bill</Text>
          </Pressable>
        </View>

        {/* KPI row */}
        <View style={styles.kpiRow}>
          <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>BILLS</Text>
            <Text style={[styles.kpiValue, { color: colors.foreground }]}>{supplier.bills.length}</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>CONFIRMED</Text>
            <Text style={[styles.kpiValue, { color: "#22c55e" }]}>{confirmedBills.length}</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>SPEND</Text>
            <Text style={[styles.kpiValue, { color: colors.foreground }]}>{fmt(totalSpend)}</Text>
          </View>
        </View>

        {/* Stock concurrency panel */}
        {supplier.stockImages.length > 0 && (<View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Feather name="link" size={14} color="#60a5fa"/>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Stock–Bill Concurrency</Text>
              <View style={[styles.badge, { backgroundColor: "#3b82f622" }]}>
                <Text style={[styles.badgeText, { color: "#60a5fa" }]}>
                  {matchedImages.length}/{supplier.stockImages.length} matched
                </Text>
              </View>
            </View>
            {supplier.stockImages.map((sm) => (<View key={sm.stockMovementId} style={[styles.smRow, { backgroundColor: colors.muted }]}>
                {sm.imageUrl ? (<Image source={{ uri: sm.imageUrl }} style={styles.smImage}/>) : (<View style={[styles.smImage, { backgroundColor: colors.border, alignItems: "center", justifyContent: "center" }]}>
                    <Feather name="package" size={14} color={colors.mutedForeground}/>
                  </View>)}
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.smName, { color: colors.foreground }]} numberOfLines={1}>{sm.productName}</Text>
                  <Text style={[styles.smMeta, { color: colors.mutedForeground }]}>
                    {sm.articleCode} · qty {sm.quantity}
                  </Text>
                </View>
                {sm.billId ? (<View style={[styles.badge, { backgroundColor: "#22c55e22" }]}>
                    <Text style={[styles.badgeText, { color: "#22c55e" }]}>{sm.billNumber}</Text>
                  </View>) : (<View style={[styles.badge, { backgroundColor: "#f59e0b22" }]}>
                    <Text style={[styles.badgeText, { color: "#f59e0b" }]}>Unmatched</Text>
                  </View>)}
              </View>))}
          </View>)}

        {/* Bills list */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 10, marginTop: 4 }]}>Purchase Bills</Text>
        {supplier.bills.length === 0 ? (<View style={styles.empty}>
            <Feather name="file-text" size={32} color={colors.mutedForeground}/>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No bills yet. Tap "Scan Bill" to start.</Text>
          </View>) : (supplier.bills.map((bill) => (<BillRow key={bill.id} bill={bill} onConfirm={() => handleConfirmBill(bill.id)} confirming={confirmingId === bill.id}/>)))}
      </ScrollView>

      {/* Scan Modal */}
      <Modal visible={scanModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Scan Bill — {supplier.name}
            </Text>
            <Pressable onPress={() => { setScanModal(false); setScanStep("upload"); setScanResult(null); setEditedItems([]); }}>
              <Feather name="x" size={22} color={colors.foreground}/>
            </Pressable>
          </View>

          {scanStep === "analyzing" && (<View style={styles.center}>
              <ActivityIndicator size="large" color={colors.foreground}/>
              <Text style={[styles.sub, { color: colors.mutedForeground, marginTop: 16 }]}>Analyzing bill with AI…</Text>
            </View>)}

          {scanStep === "review" && scanResult && (<ScrollView contentContainerStyle={styles.modalBody}>
              {/* Summary */}
              <View style={[styles.aiBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.aiTitle, { color: colors.foreground }]}>AI Extraction Result</Text>
                {scanResult.billNumber && (<Text style={[styles.aiMeta, { color: colors.mutedForeground }]}>
                    Bill #: <Text style={{ color: colors.foreground }}>{scanResult.billNumber}</Text>
                  </Text>)}
                {scanResult.date && (<Text style={[styles.aiMeta, { color: colors.mutedForeground }]}>
                    Date: <Text style={{ color: colors.foreground }}>{scanResult.date}</Text>
                  </Text>)}
                {scanResult.supplierName && (<Text style={[styles.aiMeta, { color: colors.mutedForeground }]}>
                    Supplier on bill: <Text style={{ color: colors.foreground }}>{scanResult.supplierName}</Text>
                  </Text>)}
                <Text style={[styles.aiMeta, { color: colors.mutedForeground }]}>
                  Confidence: <Text style={{ color: colors.foreground }}>{Math.round(scanResult.confidence * 100)}%</Text>
                </Text>
              </View>

              <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 8 }]}>Items (edit if needed)</Text>
              {editedItems.map((item, i) => (<View key={i} style={[styles.editRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <TextInput style={[styles.editInput, { color: colors.foreground, borderColor: colors.border }]} value={item.articleCode} onChangeText={(v) => setEditedItems((p) => p.map((it, j) => j === i ? { ...it, articleCode: v } : it))} placeholder="Article" placeholderTextColor={colors.mutedForeground}/>
                  <TextInput style={[styles.editInput, { color: colors.foreground, borderColor: colors.border, flex: 2 }]} value={item.productName} onChangeText={(v) => setEditedItems((p) => p.map((it, j) => j === i ? { ...it, productName: v } : it))} placeholder="Product" placeholderTextColor={colors.mutedForeground}/>
                  <TextInput style={[styles.editInput, { color: colors.foreground, borderColor: colors.border }]} value={item.quantity} onChangeText={(v) => setEditedItems((p) => p.map((it, j) => j === i ? { ...it, quantity: v } : it))} placeholder="Qty" placeholderTextColor={colors.mutedForeground} keyboardType="numeric"/>
                  <TextInput style={[styles.editInput, { color: colors.foreground, borderColor: colors.border }]} value={item.unitPrice} onChangeText={(v) => setEditedItems((p) => p.map((it, j) => j === i ? { ...it, unitPrice: v } : it))} placeholder="₹" placeholderTextColor={colors.mutedForeground} keyboardType="numeric"/>
                </View>))}

              <Pressable style={[styles.confirmBtn, { backgroundColor: colors.foreground, marginTop: 20 }]} onPress={handleSaveDraft} disabled={createBill.isPending}>
                {createBill.isPending ? (<ActivityIndicator size="small" color={colors.background}/>) : (<>
                    <Feather name="save" size={16} color={colors.background}/>
                    <Text style={[styles.confirmBtnText, { color: colors.background }]}>Save as Draft</Text>
                  </>)}
              </Pressable>
            </ScrollView>)}
        </View>
      </Modal>
    </>);
}
const styles = StyleSheet.create({
    root: { flex: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 20 },
    backBtn: { paddingTop: 2 },
    title: { fontSize: 22, fontFamily: "Inter_700Bold" },
    sub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
    scanBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
    scanBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
    kpiRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
    kpiCard: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, alignItems: "center" },
    kpiLabel: { fontSize: 9, fontFamily: "Inter_500Medium", letterSpacing: 0.8, marginBottom: 4 },
    kpiValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
    section: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 16 },
    sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
    sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    badgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
    smRow: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 8, marginBottom: 8 },
    smImage: { width: 40, height: 40, borderRadius: 8 },
    smName: { fontSize: 13, fontFamily: "Inter_500Medium" },
    smMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
    divider: { height: 1, marginVertical: 10 },
    billCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
    billHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    billLeft: { flexDirection: "row", alignItems: "center" },
    billNum: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
    billDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
    billRight: { flexDirection: "row", alignItems: "center", gap: 10 },
    billAmt: { fontSize: 15, fontFamily: "Inter_700Bold" },
    itemHeader: { flexDirection: "row", gap: 6, paddingHorizontal: 8, marginBottom: 6 },
    itemHeaderText: { flex: 1, fontSize: 9, fontFamily: "Inter_500Medium", letterSpacing: 0.8 },
    itemRow: { flexDirection: "row", gap: 6, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 8, marginBottom: 4, alignItems: "center" },
    itemCode: { flex: 1, fontSize: 10, fontFamily: "Inter_400Regular" },
    itemName: { flex: 2, fontSize: 12, fontFamily: "Inter_400Regular" },
    itemQty: { width: 30, fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "right" },
    itemTotal: { width: 60, fontSize: 12, fontFamily: "Inter_600SemiBold", textAlign: "right" },
    confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 10, marginTop: 12 },
    confirmBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
    empty: { alignItems: "center", paddingVertical: 40, gap: 10 },
    emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
    modal: { flex: 1 },
    modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
    modalTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
    modalBody: { padding: 20 },
    aiBox: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 16 },
    aiTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
    aiMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 4 },
    editRow: { flexDirection: "row", gap: 6, borderRadius: 10, borderWidth: 1, padding: 8, marginBottom: 8 },
    editInput: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 6 },
});
