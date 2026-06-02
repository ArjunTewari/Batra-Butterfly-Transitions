import {
  useGetStaffPerformance,
  useCreateStaff,
  useListStaff,
} from "@workspace/api-client-react";
import type { StaffPerformance } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
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

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const rankColors = ["#f59e0b", "#94a3b8", "#cd7c2e"];

function StaffCard({ member, rank }: { member: StaffPerformance; rank: number }) {
  const colors = useColors();
  const rankColor = rankColors[rank] ?? colors.mutedForeground;
  const isTop = rank < 3;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: isTop ? rankColor + "44" : colors.border,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.rankBadge, { backgroundColor: isTop ? rankColor + "22" : colors.secondary }]}>
          <Text style={[styles.rankText, { color: isTop ? rankColor : colors.mutedForeground }]}>
            #{rank + 1}
          </Text>
        </View>
        <View style={styles.avatarWrap}>
          <Text style={[styles.avatarText, { color: colors.foreground }]}>
            {member.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.cardMeta}>
          <Text style={[styles.cardName, { color: colors.foreground }]}>{member.name}</Text>
          <Text style={[styles.cardRate, { color: colors.mutedForeground }]}>
            {(member.commissionRate * 100).toFixed(1)}% commission
          </Text>
        </View>
      </View>
      <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.foreground }]}>{fmt(member.totalSales)}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Sales</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.foreground }]}>{member.totalOrders}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Orders</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: "#22c55e" }]}>{fmt(member.commission)}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Commission</Text>
        </View>
      </View>
    </View>
  );
}

export default function StaffScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;
  const queryClient = useQueryClient();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year] = useState(now.getFullYear());

  const [modalVisible, setModalVisible] = useState(false);
  const [staffName, setStaffName] = useState("");
  const [commissionRate, setCommissionRate] = useState("");

  const { data: performance, isLoading, refetch } = useGetStaffPerformance({ month, year });
  const { data: staffList } = useListStaff();
  const createStaff = useCreateStaff();

  const sorted = [...(performance ?? [])].sort((a, b) => b.totalSales - a.totalSales);
  const totalSales = sorted.reduce((s, m) => s + m.totalSales, 0);
  const totalCommission = sorted.reduce((s, m) => s + m.commission, 0);

  const handleCreate = async () => {
    if (!staffName.trim() || !commissionRate) {
      Alert.alert("Missing fields", "Please fill all required fields.");
      return;
    }
    const rate = parseFloat(commissionRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      Alert.alert("Invalid commission", "Enter a rate between 0 and 100.");
      return;
    }
    try {
      await createStaff.mutateAsync({
        data: { name: staffName.trim(), commissionRate: rate / 100 },
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/performance"] });
      setModalVisible(false);
      setStaffName("");
      setCommissionRate("");
      refetch();
    } catch {
      Alert.alert("Error", "Failed to add staff member.");
    }
  };

  const canSubmit = staffName.trim() && commissionRate;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: topPad + 12, paddingBottom: bottomPad + 16 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Staff</Text>
          {(staffList ?? []).length > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>
                {(staffList ?? []).length} members
              </Text>
            </View>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.monthRow}
        >
          {MONTHS.map((m, i) => {
            const idx = i + 1;
            return (
              <Pressable
                key={idx}
                style={[
                  styles.monthBtn,
                  {
                    backgroundColor: month === idx ? colors.primary : colors.secondary,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => setMonth(idx)}
              >
                <Text
                  style={[
                    styles.monthText,
                    { color: month === idx ? colors.primaryForeground : colors.mutedForeground },
                  ]}
                >
                  {m}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {totalSales > 0 && (
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.summaryValue, { color: colors.foreground }]}>{fmt(totalSales)}</Text>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Team Sales</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.summaryValue, { color: "#22c55e" }]}>{fmt(totalCommission)}</Text>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Total Commission</Text>
            </View>
          </View>
        )}

        {sorted.length === 0 && !isLoading ? (
          <View style={styles.emptyState}>
            <Feather name="briefcase" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No data for this month</Text>
          </View>
        ) : (
          sorted.map((member, rank) => (
            <StaffCard key={member.id} member={member} rank={rank} />
          ))
        )}
      </ScrollView>

      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => setModalVisible(true)}
      >
        <Feather name="plus" size={24} color={colors.primaryForeground} />
      </Pressable>

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => setModalVisible(false)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Add Staff</Text>
            <View style={{ width: 22 }} />
          </View>

          <ScrollView
            contentContainerStyle={styles.modalBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>NAME</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]}
              placeholder="Enter staff name"
              placeholderTextColor={colors.mutedForeground}
              value={staffName}
              onChangeText={setStaffName}
              autoCapitalize="words"
            />

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 16 }]}>
              COMMISSION RATE (%)
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]}
              placeholder="e.g. 5.0"
              placeholderTextColor={colors.mutedForeground}
              value={commissionRate}
              onChangeText={setCommissionRate}
              keyboardType="decimal-pad"
            />

            <Pressable
              style={[
                styles.actionBtn,
                {
                  backgroundColor: canSubmit ? colors.primary : colors.secondary,
                  marginTop: 24,
                  opacity: canSubmit ? 1 : 0.5,
                },
              ]}
              onPress={handleCreate}
              disabled={!canSubmit || createStaff.isPending}
            >
              {createStaff.isPending ? (
                <Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>Adding...</Text>
              ) : (
                <>
                  <Feather name="check-circle" size={20} color={colors.primaryForeground} />
                  <Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>Add Staff</Text>
                </>
              )}
            </Pressable>
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
  monthRow: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  monthBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  monthText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  summaryRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  summaryValue: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  summaryLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
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
    gap: 10,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1e1e1e",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  cardMeta: { flex: 1 },
  cardName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cardRate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  statsRow: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
  },
  statValue: { fontSize: 15, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 10 },
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
