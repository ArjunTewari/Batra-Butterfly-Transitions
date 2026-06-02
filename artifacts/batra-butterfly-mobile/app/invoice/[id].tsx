import {
  useListInvoices,
  useConfirmInvoice,
  useDeleteInvoice,
} from "@workspace/api-client-react";
import type { InvoiceWithItems } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";

const fmt = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

const statusColors: Record<string, { bg: string; text: string }> = {
  draft: { bg: "#f59e0b22", text: "#f59e0b" },
  confirmed: { bg: "#22c55e22", text: "#22c55e" },
  cancelled: { bg: "#ef444422", text: "#ef4444" },
};

export default function InvoiceDetailScreen() {
  const colors = useColors();
  const { isMaster } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const invoiceId = parseInt(id ?? "0", 10);

  const { data: invoices, isLoading, refetch } = useListInvoices();
  const confirmInvoice = useConfirmInvoice();
  const deleteInvoice = useDeleteInvoice();

  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const invoice = (invoices ?? []).find((inv) => inv.id === invoiceId);

  useEffect(() => {
    if (invoice) navigation.setOptions({ title: invoice.invoiceNumber });
  }, [invoice, navigation]);

  async function handleConfirm() {
    if (!invoice) return;
    Alert.alert(
      "Confirm Invoice",
      "This will update stock, ledger, and commissions. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setConfirming(true);
            try {
              await confirmInvoice.mutateAsync({ id: invoiceId });
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
              refetch();
            } catch {
              Alert.alert("Error", "Failed to confirm invoice.");
            } finally {
              setConfirming(false);
            }
          },
        },
      ]
    );
  }

  async function handleDelete() {
    Alert.alert(
      "Delete Invoice",
      "This will permanently delete this draft. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteInvoice.mutateAsync({ id: invoiceId });
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
              router.back();
            } catch {
              Alert.alert("Error", "Failed to delete invoice.");
              setDeleting(false);
            }
          },
        },
      ]
    );
  }

  if (isLoading && !invoice) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!invoice) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.notFound, { color: colors.mutedForeground }]}>Invoice not found</Text>
      </View>
    );
  }

  const sc = statusColors[invoice.status] ?? statusColors.draft;
  const isDraft = invoice.status === "draft";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.headerTop}>
            <View>
              <Text style={[styles.invoiceNum, { color: colors.foreground }]}>{invoice.invoiceNumber}</Text>
              <Text style={[styles.invoiceDate, { color: colors.mutedForeground }]}>
                {new Date(invoice.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
              <Text style={[styles.statusText, { color: sc.text }]}>
                {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
              </Text>
            </View>
          </View>

          <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Feather name="user" size={14} color={colors.mutedForeground} />
              <View>
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Retailer</Text>
                <Text style={[styles.metaValue, { color: colors.foreground }]}>{invoice.retailerName}</Text>
              </View>
            </View>
            <View style={styles.metaItem}>
              <Feather name="briefcase" size={14} color={colors.mutedForeground} />
              <View>
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Staff</Text>
                <Text style={[styles.metaValue, { color: colors.foreground }]}>{invoice.staffName}</Text>
              </View>
            </View>
          </View>

          {invoice.notes && (
            <View style={[styles.noteBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Text style={[styles.noteText, { color: colors.mutedForeground }]}>{invoice.notes}</Text>
            </View>
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>ITEMS</Text>
        <View style={[styles.itemsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {invoice.items.map((item, i) => (
            <View
              key={item.id}
              style={[
                styles.itemRow,
                {
                  borderBottomColor: colors.border,
                  borderBottomWidth: i < invoice.items.length - 1 ? StyleSheet.hairlineWidth : 0,
                },
              ]}
            >
              <View style={styles.itemLeft}>
                <Text style={[styles.itemName, { color: colors.foreground }]}>{item.productName}</Text>
                <View style={[styles.codeTag, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.codeText, { color: colors.mutedForeground }]}>{item.articleCode}</Text>
                </View>
              </View>
              <View style={styles.itemRight}>
                <Text style={[styles.itemQty, { color: colors.mutedForeground }]}>×{item.quantity}</Text>
                <Text style={[styles.itemUnitPrice, { color: colors.mutedForeground }]}>
                  {fmt(item.unitPrice)} each
                </Text>
                <Text style={[styles.itemTotal, { color: colors.foreground }]}>{fmt(item.totalPrice)}</Text>
              </View>
            </View>
          ))}
          <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Total</Text>
            <Text style={[styles.totalAmount, { color: colors.foreground }]}>{fmt(invoice.totalAmount)}</Text>
          </View>
        </View>
      </ScrollView>

      {isDraft && (
        <View
          style={[
            styles.actions,
            {
              borderTopColor: colors.border,
              backgroundColor: colors.background,
              paddingBottom: insets.bottom + 8,
            },
          ]}
        >
          <Pressable
            style={[styles.deleteBtn, { borderColor: colors.border, backgroundColor: colors.secondary }]}
            onPress={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator color={colors.destructive} size="small" />
            ) : (
              <Feather name="trash-2" size={20} color={colors.destructive} />
            )}
          </Pressable>
          {isMaster ? (
            <Pressable
              style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
              onPress={handleConfirm}
              disabled={confirming}
            >
              {confirming ? (
                <ActivityIndicator color={colors.primaryForeground} size="small" />
              ) : (
                <>
                  <Feather name="check-circle" size={20} color={colors.primaryForeground} />
                  <Text style={[styles.confirmBtnText, { color: colors.primaryForeground }]}>
                    Confirm Invoice
                  </Text>
                </>
              )}
            </Pressable>
          ) : (
            <View style={[styles.confirmBtn, { backgroundColor: "#f59e0b22", borderWidth: 1, borderColor: "#f59e0b44" }]}>
              <Feather name="send" size={18} color="#f59e0b" />
              <Text style={[styles.confirmBtnText, { color: "#f59e0b" }]}>Sent for Approval</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  notFound: { fontSize: 16, fontFamily: "Inter_400Regular" },
  headerCard: {
    margin: 16,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 16,
  },
  invoiceNum: { fontSize: 18, fontFamily: "Inter_700Bold" },
  invoiceDate: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 3 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  statusText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  cardDivider: { height: StyleSheet.hairlineWidth },
  metaRow: { flexDirection: "row", padding: 16, gap: 20 },
  metaItem: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  metaLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  metaValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  noteBox: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  noteText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  itemsCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 14,
  },
  itemLeft: { flex: 1, marginRight: 12 },
  itemName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  codeTag: { marginTop: 4, alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  codeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  itemRight: { alignItems: "flex-end" },
  itemQty: { fontSize: 14, fontFamily: "Inter_400Regular" },
  itemUnitPrice: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  itemTotal: { fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 4 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  totalLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  totalAmount: { fontSize: 20, fontFamily: "Inter_700Bold" },
  actions: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  deleteBtn: {
    width: 50,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  confirmBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
