import { useListPaymentClearances, useCreatePaymentClearance, getListPaymentClearancesQueryKey, } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Alert, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
const fmt = (n) => "\u20B9" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
export default function PaymentClearanceScreen() {
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const topPad = Platform.OS === "web" ? 67 : insets.top;
    const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;
    const queryClient = useQueryClient();
    const { data: clearances, isLoading, refetch } = useListPaymentClearances();
    const createClearance = useCreatePaymentClearance();
    const [modalVisible, setModalVisible] = useState(false);
    const [amount, setAmount] = useState("");
    const [retailerName, setRetailerName] = useState("");
    const [vendorName, setVendorName] = useState("");
    const [notes, setNotes] = useState("");
    const handleGenerate = async () => {
        var _a, _b, _c, _d, _e, _f;
        const amt = parseFloat(amount);
        if (!amt || amt <= 0) {
            Alert.alert("Invalid amount", "Enter a valid payment amount");
            return;
        }
        if (!retailerName.trim()) {
            Alert.alert("Missing retailer", "Enter the retailer name");
            return;
        }
        if (!vendorName.trim()) {
            Alert.alert("Missing vendor", "Enter the vendor name");
            return;
        }
        try {
            const result = await createClearance.mutateAsync({
                data: {
                    amount: amt,
                    retailerName: retailerName.trim(),
                    vendorName: vendorName.trim(),
                    notes: notes.trim() || undefined,
                },
            });
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            queryClient.invalidateQueries({ queryKey: getListPaymentClearancesQueryKey() });
            setModalVisible(false);
            setAmount("");
            setRetailerName("");
            setVendorName("");
            setNotes("");
            refetch();
            Alert.alert("Payment Cleared", `\u20B9${amt.toLocaleString("en-IN")} cleared from ${(_b = (_a = result.retailer) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : retailerName} to ${(_d = (_c = result.vendor) === null || _c === void 0 ? void 0 : _c.name) !== null && _d !== void 0 ? _d : vendorName}`);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to generate payment";
            const apiMsg = (_f = (_e = err === null || err === void 0 ? void 0 : err.response) === null || _e === void 0 ? void 0 : _e.data) === null || _f === void 0 ? void 0 : _f.error;
            Alert.alert("Error", apiMsg !== null && apiMsg !== void 0 ? apiMsg : msg);
        }
    };
    const canSubmit = amount && parseFloat(amount) > 0 && retailerName.trim() && vendorName.trim();
    return (<View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingTop: topPad + 12, paddingBottom: bottomPad + 16 }} refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary}/>} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Payment Clearance</Text>
        </View>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Deduct from retailer credit and record vendor payment
        </Text>

        {(clearances !== null && clearances !== void 0 ? clearances : []).length === 0 && !isLoading ? (<View style={styles.emptyState}>
            <Feather name="credit-card" size={36} color={colors.mutedForeground}/>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No payment clearances yet
            </Text>
          </View>) : ((clearances !== null && clearances !== void 0 ? clearances : []).map((c) => {
            var _a, _b;
            return (<View key={c.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={[styles.cardAmount, { color: colors.foreground }]}>
                    {fmt(c.amount)}
                  </Text>
                  <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>
                    {new Date(c.date).toLocaleDateString("en-IN")}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: "#22c55e22" }]}>
                  <Text style={[styles.badgeText, { color: "#22c55e" }]}>Cleared</Text>
                </View>
              </View>
              <View style={[styles.cardRow, { borderTopColor: colors.border }]}>
                <View style={styles.cardCol}>
                  <Text style={[styles.colLabel, { color: colors.mutedForeground }]}>Retailer</Text>
                  <Text style={[styles.colValue, { color: colors.foreground }]} numberOfLines={1}>
                    {(_a = c.retailerName) !== null && _a !== void 0 ? _a : "Unknown"}
                  </Text>
                </View>
                <View style={styles.cardCol}>
                  <Text style={[styles.colLabel, { color: colors.mutedForeground }]}>Vendor</Text>
                  <Text style={[styles.colValue, { color: colors.foreground }]} numberOfLines={1}>
                    {(_b = c.vendorName) !== null && _b !== void 0 ? _b : "Unknown"}
                  </Text>
                </View>
              </View>
              {c.notes && (<Text style={[styles.notes, { color: colors.mutedForeground }]} numberOfLines={2}>
                  {c.notes}
                </Text>)}
            </View>);
        }))}
      </ScrollView>

      <Pressable style={[styles.fab, { backgroundColor: colors.primary }]} onPress={() => setModalVisible(true)}>
        <Feather name="plus" size={24} color={colors.primaryForeground}/>
      </Pressable>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setModalVisible(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => setModalVisible(false)}>
              <Feather name="x" size={22} color={colors.foreground}/>
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              New Payment Clearance
            </Text>
            <View style={{ width: 22 }}/>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              RETAILER NAME
            </Text>
            <TextInput style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]} placeholder="Enter retailer name" placeholderTextColor={colors.mutedForeground} value={retailerName} onChangeText={setRetailerName} autoCapitalize="words"/>

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 16 }]}>
              VENDOR NAME
            </Text>
            <TextInput style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]} placeholder="Enter vendor name" placeholderTextColor={colors.mutedForeground} value={vendorName} onChangeText={setVendorName} autoCapitalize="words"/>

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 16 }]}>
              AMOUNT (\u20B9)
            </Text>
            <TextInput style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]} placeholder="0.00" placeholderTextColor={colors.mutedForeground} value={amount} onChangeText={setAmount} keyboardType="decimal-pad"/>

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 16 }]}>
              NOTES (OPTIONAL)
            </Text>
            <TextInput style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular", minHeight: 80 }]} placeholder="Add a note..." placeholderTextColor={colors.mutedForeground} value={notes} onChangeText={setNotes} multiline textAlignVertical="top"/>

            <Pressable style={[
            styles.actionBtn,
            {
                backgroundColor: canSubmit ? colors.primary : colors.secondary,
                marginTop: 24,
                opacity: canSubmit ? 1 : 0.5,
            },
        ]} onPress={handleGenerate} disabled={!canSubmit || createClearance.isPending}>
              {createClearance.isPending ? (<Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>
                  Processing...
                </Text>) : (<>
                  <Feather name="check-circle" size={20} color={colors.primaryForeground}/>
                  <Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>
                    Generate Payment
                  </Text>
                </>)}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>);
}
const styles = StyleSheet.create({
    container: { flex: 1 },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        marginBottom: 4,
    },
    title: {
        fontSize: 28,
        fontFamily: "Inter_700Bold",
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 13,
        fontFamily: "Inter_400Regular",
        paddingHorizontal: 16,
        marginBottom: 16,
    },
    emptyState: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 60,
        gap: 12,
    },
    emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
    card: {
        marginHorizontal: 16,
        marginBottom: 10,
        borderRadius: 12,
        borderWidth: 1,
        padding: 14,
        overflow: "hidden",
    },
    cardHeader: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
    },
    cardAmount: {
        fontSize: 20,
        fontFamily: "Inter_700Bold",
        letterSpacing: -0.5,
    },
    cardDate: {
        fontSize: 12,
        fontFamily: "Inter_400Regular",
        marginTop: 2,
    },
    badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
    cardRow: {
        flexDirection: "row",
        marginTop: 12,
        paddingTop: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        gap: 16,
    },
    cardCol: { flex: 1 },
    colLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
    colValue: { fontSize: 14, fontFamily: "Inter_500Medium", marginTop: 2 },
    notes: {
        fontSize: 12,
        fontFamily: "Inter_400Regular",
        marginTop: 8,
        lineHeight: 18,
    },
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
    sectionLabel: {
        fontSize: 11,
        fontFamily: "Inter_600SemiBold",
        letterSpacing: 1,
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderRadius: 10,
        padding: 12,
        fontSize: 15,
    },
    actionBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 14,
        borderRadius: 12,
        gap: 10,
    },
    actionBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
