import {
  useListRetailers,
  useCreateRetailer,
  getListRetailersQueryKey,
} from "@workspace/api-client-react";
import type { RetailerSummary } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
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

import { useColors } from "@/hooks/useColors";

const fmt = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

function RetailerCard({ retailer }: { retailer: RetailerSummary }) {
  const colors = useColors();
  const router = useRouter();
  const overdue = retailer.isOverdue;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}
      onPress={() => router.push(`/retailer/${retailer.id}`)}
    >
      <View style={styles.cardHeader}>
        <View style={styles.avatarWrap}>
          <Text style={[styles.avatarText, { color: colors.foreground }]}>
            {retailer.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.cardMeta}>
          <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>
            {retailer.name}
          </Text>
          <Text style={[styles.cardPhone, { color: colors.mutedForeground }]}>
            {retailer.phone}
          </Text>
        </View>
        {overdue && (
          <View style={[styles.badge, { backgroundColor: "#ef444422" }]}>
            <Text style={[styles.badgeText, { color: "#ef4444" }]}>Overdue</Text>
          </View>
        )}
      </View>
      <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />
      <View style={styles.cardFooter}>
        <View>
          <Text style={[styles.footerLabel, { color: colors.mutedForeground }]}>Outstanding</Text>
          <Text style={[styles.footerValue, { color: overdue ? "#ef4444" : colors.foreground }]}>
            {fmt(retailer.outstanding)}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[styles.footerLabel, { color: colors.mutedForeground }]}>Credit Limit</Text>
          <Text style={[styles.footerValue, { color: colors.foreground }]}>
            {fmt(retailer.creditLimit)}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </View>
    </Pressable>
  );
}

export default function RetailersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const [search, setSearch] = useState("");
  const { data: retailers, isLoading, refetch } = useListRetailers();
  const createRetailer = useCreateRetailer();

  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = (retailers ?? []).filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.phone.includes(search)
  );
  const overdueCount = (retailers ?? []).filter((r) => r.isOverdue).length;

  const handleSave = async () => {
    if (!name.trim() || !phone.trim()) {
      Alert.alert("Missing fields", "Name and phone are required.");
      return;
    }
    setSaving(true);
    try {
      await createRetailer.mutateAsync({
        data: {
          name: name.trim(),
          phone: phone.trim(),
          creditLimit: parseFloat(creditLimit) || 0,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListRetailersQueryKey() });
      Alert.alert("Success", `"${name.trim()}" added as a retailer.`);
      setShowAdd(false);
      setName("");
      setPhone("");
      setCreditLimit("");
    } catch {
      Alert.alert("Error", "Failed to add retailer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingTop: topPad + 12, paddingBottom: bottomPad + 16 }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.foreground} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Retailers</Text>
          <Pressable
            style={[styles.addBtn, { backgroundColor: colors.foreground }]}
            onPress={() => setShowAdd(true)}
          >
            <Feather name="plus" size={18} color={colors.background} />
          </Pressable>
        </View>

        {overdueCount > 0 && (
          <View style={[styles.overdueBar, { backgroundColor: "#ef444422" }]}>
            <Text style={[styles.overdueText, { color: "#ef4444" }]}>
              {overdueCount} retailer{overdueCount > 1 ? "s" : ""} overdue
            </Text>
          </View>
        )}

        <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search retailers..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
          />
        </View>

        {filtered.length === 0 && !isLoading ? (
          <View style={styles.emptyState}>
            <Feather name="users" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No retailers found</Text>
          </View>
        ) : (
          filtered.map((r) => <RetailerCard key={r.id} retailer={r} />)
        )}
      </ScrollView>

      {/* Add Retailer Modal */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={[styles.modal, { backgroundColor: colors.background }]}
        >
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Add Retailer</Text>
            <Pressable onPress={() => { setShowAdd(false); setName(""); setPhone(""); setCreditLimit(""); }}>
              <Feather name="x" size={22} color={colors.foreground} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>NAME *</Text>
              <TextInput
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                placeholder="Retailer company name"
                placeholderTextColor={colors.mutedForeground}
                value={name}
                onChangeText={setName}
                autoFocus
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>PHONE *</Text>
              <TextInput
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                placeholder="9876543210"
                placeholderTextColor={colors.mutedForeground}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>CREDIT LIMIT (₹)</Text>
              <TextInput
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                placeholder="0"
                placeholderTextColor={colors.mutedForeground}
                value={creditLimit}
                onChangeText={setCreditLimit}
                keyboardType="numeric"
              />
            </View>

            <Pressable
              style={[styles.saveBtn, { backgroundColor: colors.foreground }, (!name.trim() || !phone.trim()) && { opacity: 0.4 }]}
              onPress={handleSave}
              disabled={saving || !name.trim() || !phone.trim()}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Text style={[styles.saveBtnText, { color: colors.background }]}>Add Retailer</Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
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
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  overdueBar: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  overdueText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  avatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#1e1e1e",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  cardMeta: { flex: 1 },
  cardName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  cardPhone: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  cardDivider: { height: StyleSheet.hairlineWidth },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  footerLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginBottom: 2,
  },
  footerValue: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  modalBody: {
    padding: 20,
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.8,
  },
  input: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  saveBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
