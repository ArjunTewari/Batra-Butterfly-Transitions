import {
  useGetRetailer,
  useGetRetailerLedger,
  useAddLedgerEntry,
} from "@workspace/api-client-react";
import type { LedgerEntry } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useNavigation } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const colors = useColors();
  const isPayment = entry.type === "payment";
  return (
    <View style={[styles.ledgerRow, { borderBottomColor: colors.border }]}>
      <View
        style={[
          styles.ledgerIcon,
          { backgroundColor: isPayment ? "#22c55e22" : "#f59e0b22" },
        ]}
      >
        <Feather
          name={isPayment ? "arrow-down-left" : "arrow-up-right"}
          size={16}
          color={isPayment ? "#22c55e" : "#f59e0b"}
        />
      </View>
      <View style={styles.ledgerMeta}>
        <Text style={[styles.ledgerType, { color: colors.foreground }]}>
          {isPayment ? "Payment Received" : "Sale"}
        </Text>
        {entry.note ? (
          <Text style={[styles.ledgerNote, { color: colors.mutedForeground }]} numberOfLines={1}>
            {entry.note}
          </Text>
        ) : null}
        <Text style={[styles.ledgerDate, { color: colors.mutedForeground }]}>
          {new Date(entry.date).toLocaleDateString("en-IN")}
        </Text>
      </View>
      <Text
        style={[
          styles.ledgerAmount,
          { color: isPayment ? "#22c55e" : colors.foreground },
        ]}
      >
        {isPayment ? "+" : "-"}
        {fmt(entry.amount)}
      </Text>
    </View>
  );
}

export default function RetailerDetailScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const retailerId = parseInt(id ?? "0", 10);

  const { data: retailer, isLoading: loadingRetailer, refetch: refetchRetailer } = useGetRetailer(retailerId);
  const { data: ledger, isLoading: loadingLedger, refetch: refetchLedger } = useGetRetailerLedger(retailerId);
  const addEntry = useAddLedgerEntry();

  const [modalVisible, setModalVisible] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isLoading = loadingRetailer || loadingLedger;
  const refetch = () => { refetchRetailer(); refetchLedger(); };

  useEffect(() => {
    if (retailer) navigation.setOptions({ title: retailer.name });
  }, [retailer, navigation]);

  async function handlePayment() {
    const amt = parseFloat(amount.replace(/,/g, ""));
    if (!amt || isNaN(amt) || amt <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount.");
      return;
    }
    setSubmitting(true);
    try {
      await addEntry.mutateAsync({
        id: retailerId,
        data: {
          type: "payment",
          amount: amt,
          note: note || undefined,
          date: new Date().toISOString().slice(0, 10),
        },
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: [`/api/retailers/${retailerId}/ledger`] });
      queryClient.invalidateQueries({ queryKey: [`/api/retailers/${retailerId}`] });
      setModalVisible(false);
      setAmount("");
      setNote("");
      refetch();
    } catch {
      Alert.alert("Error", "Failed to record payment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const utilizationPct =
    retailer && retailer.creditLimit > 0
      ? Math.min(1, retailer.outstanding / retailer.creditLimit)
      : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {isLoading && !retailer ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
        ) : retailer ? (
          <>
            <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.avatarWrap}>
                <Text style={[styles.avatarText, { color: colors.foreground }]}>
                  {retailer.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={[styles.retailerName, { color: colors.foreground }]}>{retailer.name}</Text>
              <Text style={[styles.retailerPhone, { color: colors.mutedForeground }]}>{retailer.phone}</Text>

              {retailer.isOverdue && (
                <View style={[styles.overdueTag, { backgroundColor: "#ef444422" }]}>
                  <Feather name="alert-circle" size={12} color="#ef4444" />
                  <Text style={[styles.overdueText, { color: "#ef4444" }]}>
                    {retailer.daysOverdue} days overdue
                  </Text>
                </View>
              )}

              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={[styles.statValue, { color: retailer.isOverdue ? "#ef4444" : colors.foreground }]}>
                    {fmt(retailer.outstanding)}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Outstanding</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                <View style={styles.stat}>
                  <Text style={[styles.statValue, { color: colors.foreground }]}>{fmt(retailer.creditLimit)}</Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Credit Limit</Text>
                </View>
              </View>

              <View style={[styles.barTrack, { backgroundColor: colors.secondary }]}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${utilizationPct * 100}%` as any,
                      backgroundColor: utilizationPct > 0.8 ? "#ef4444" : utilizationPct > 0.5 ? "#f59e0b" : "#22c55e",
                    },
                  ]}
                />
              </View>
              <Text style={[styles.barLabel, { color: colors.mutedForeground }]}>
                {Math.round(utilizationPct * 100)}% credit utilized
              </Text>
            </View>

            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>LEDGER</Text>
            {!ledger || ledger.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="list" size={28} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No transactions yet</Text>
              </View>
            ) : (
              [...ledger].reverse().map((entry) => (
                <LedgerRow key={entry.id} entry={entry} />
              ))
            )}
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Retailer not found</Text>
          </View>
        )}
      </ScrollView>

      {retailer && (
        <View
          style={[
            styles.fab,
            { backgroundColor: colors.primary, bottom: insets.bottom + 20 },
          ]}
        >
          <Pressable
            style={styles.fabInner}
            onPress={() => setModalVisible(true)}
          >
            <Feather name="plus" size={22} color={colors.primaryForeground} />
            <Text style={[styles.fabText, { color: colors.primaryForeground }]}>Record Payment</Text>
          </Pressable>
        </View>
      )}

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={[styles.modal, { backgroundColor: colors.background }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => setModalVisible(false)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Record Payment</Text>
            <View style={{ width: 22 }} />
          </View>
          <View style={styles.modalBody}>
            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>AMOUNT (₹)</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" },
              ]}
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              autoFocus
            />
            <Text style={[styles.inputLabel, { color: colors.mutedForeground, marginTop: 16 }]}>NOTE (optional)</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" },
              ]}
              placeholder="e.g. Bank transfer"
              placeholderTextColor={colors.mutedForeground}
              value={note}
              onChangeText={setNote}
            />
            <Pressable
              style={[styles.confirmBtn, { backgroundColor: colors.primary, marginTop: 24 }]}
              onPress={handlePayment}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.primaryForeground} size="small" />
              ) : (
                <Text style={[styles.confirmBtnText, { color: colors.primaryForeground }]}>Confirm Payment</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  profileCard: {
    margin: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
  },
  avatarWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#1e1e1e",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarText: { fontSize: 26, fontFamily: "Inter_700Bold" },
  retailerName: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  retailerPhone: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 4 },
  overdueTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  overdueText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  statsRow: {
    flexDirection: "row",
    width: "100%",
    marginTop: 20,
    marginBottom: 16,
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },
  barTrack: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: { height: 6, borderRadius: 3 },
  barLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 6 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    paddingHorizontal: 16,
    marginBottom: 4,
    marginTop: 8,
  },
  ledgerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  ledgerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  ledgerMeta: { flex: 1 },
  ledgerType: { fontSize: 14, fontFamily: "Inter_500Medium" },
  ledgerNote: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  ledgerDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  ledgerAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  fab: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 14,
    overflow: "hidden",
  },
  fabInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    gap: 10,
  },
  fabText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
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
  modalBody: { padding: 20 },
  inputLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
  },
  confirmBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 12,
  },
  confirmBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
