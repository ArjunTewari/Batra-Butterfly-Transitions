import { useListSuppliers } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
const fmt = (n) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
function SupplierCard({ supplier }) {
    const colors = useColors();
    const router = useRouter();
    return (<Pressable style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
        ]} onPress={() => router.push(`/supplier/${supplier.id}`)}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatarWrap, { backgroundColor: colors.muted }]}>
          <Text style={[styles.avatarText, { color: colors.foreground }]}>
            {supplier.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.cardMeta}>
          <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>
            {supplier.name}
          </Text>
          {supplier.phone ? (<Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
              {supplier.phone}
            </Text>) : null}
          {supplier.address ? (<Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>
              {supplier.address}
            </Text>) : null}
        </View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground}/>
      </View>

      <View style={[styles.cardDivider, { backgroundColor: colors.border }]}/>

      <View style={styles.cardFooter}>
        <View>
          <Text style={[styles.footerLabel, { color: colors.mutedForeground }]}>Bills</Text>
          <Text style={[styles.footerValue, { color: colors.foreground }]}>
            {supplier.billCount}
          </Text>
        </View>
        <View style={{ alignItems: "center" }}>
          <Text style={[styles.footerLabel, { color: colors.mutedForeground }]}>Total Spend</Text>
          <Text style={[styles.footerValue, { color: colors.foreground }]}>
            {fmt(supplier.totalSpend)}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[styles.footerLabel, { color: colors.mutedForeground }]}>Last Bill</Text>
          <Text style={[styles.footerValue, { color: colors.foreground }]}>
            {supplier.lastBillDate
            ? new Date(supplier.lastBillDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
            : "—"}
          </Text>
        </View>
      </View>
    </Pressable>);
}
export default function SuppliersScreen() {
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const topPad = Platform.OS === "web" ? 67 : insets.top;
    const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;
    const { data: suppliers = [], isLoading, refetch } = useListSuppliers();
    const [search, setSearch] = useState("");
    const [refreshing, setRefreshing] = useState(false);
    const filtered = suppliers.filter((s) => {
        var _a;
        return s.name.toLowerCase().includes(search.toLowerCase()) ||
            ((_a = s.phone) !== null && _a !== void 0 ? _a : "").includes(search);
    });
    const totalSpend = suppliers.reduce((sum, s) => sum + s.totalSpend, 0);
    const totalBills = suppliers.reduce((sum, s) => sum + s.billCount, 0);
    const onRefresh = async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    };
    return (<ScrollView style={[styles.root, { backgroundColor: colors.background }]} contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad, paddingHorizontal: 16 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.foreground}/>}>
      <Text style={[styles.title, { color: colors.foreground }]}>Suppliers</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Vendors & purchase bills</Text>

      {/* Summary row */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>SUPPLIERS</Text>
          <Text style={[styles.summaryValue, { color: colors.foreground }]}>{suppliers.length}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>BILLS</Text>
          <Text style={[styles.summaryValue, { color: colors.foreground }]}>{totalBills}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>SPEND</Text>
          <Text style={[styles.summaryValue, { color: colors.foreground }]}>{fmt(totalSpend)}</Text>
        </View>
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground}/>
        <TextInput style={[styles.searchInput, { color: colors.foreground }]} placeholder="Search suppliers..." placeholderTextColor={colors.mutedForeground} value={search} onChangeText={setSearch}/>
      </View>

      {isLoading ? ([...Array(4)].map((_, i) => (<View key={i} style={[styles.skeleton, { backgroundColor: colors.card }]}/>))) : filtered.length === 0 ? (<View style={styles.empty}>
          <Feather name="truck" size={36} color={colors.mutedForeground}/>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No suppliers found</Text>
        </View>) : (filtered.map((s) => <SupplierCard key={s.id} supplier={s}/>))}
    </ScrollView>);
}
const styles = StyleSheet.create({
    root: { flex: 1 },
    title: { fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 2 },
    subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 20 },
    summaryRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
    summaryCard: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, alignItems: "center" },
    summaryLabel: { fontSize: 9, fontFamily: "Inter_500Medium", letterSpacing: 0.8, marginBottom: 4 },
    summaryValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
    searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16 },
    searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
    card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
    cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
    avatarWrap: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
    avatarText: { fontSize: 15, fontFamily: "Inter_700Bold" },
    cardMeta: { flex: 1 },
    cardName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
    cardSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
    cardDivider: { height: 1, marginVertical: 10 },
    cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    footerLabel: { fontSize: 10, fontFamily: "Inter_400Regular", marginBottom: 2 },
    footerValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
    skeleton: { height: 110, borderRadius: 14, marginBottom: 12 },
    empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
    emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
