import { useGetDashboardSummary, useGetRecentActivity, useGetTopRetailers, } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
const fmt = (n) => "\u20B9" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
function KpiCard({ label, value, icon, accent, onPress }) {
    const colors = useColors();
    const content = (<View style={[
            styles.kpiCard,
            { backgroundColor: colors.card, borderColor: colors.border },
        ]}>
      <View style={[
            styles.kpiIconWrap,
            { backgroundColor: accent ? accent + "22" : colors.secondary },
        ]}>
        <Feather name={icon} size={18} color={accent !== null && accent !== void 0 ? accent : colors.primary}/>
      </View>
      <Text style={[styles.kpiValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>);
    if (onPress) {
        return (<Pressable style={{ width: "47%", marginHorizontal: "1.5%" }} onPress={onPress}>
        {content}
      </Pressable>);
    }
    return content;
}
const activityIcon = {
    sale: { icon: "shopping-bag", color: "#22c55e" },
    payment: { icon: "credit-card", color: "#3b82f6" },
    stock_in: { icon: "arrow-down-circle", color: "#f59e0b" },
    stock_out: { icon: "arrow-up-circle", color: "#ef4444" },
    new_retailer: { icon: "user-plus", color: "#a855f7" },
    invoice: { icon: "file-text", color: "#06b6d4" },
};
export default function DashboardScreen() {
    var _a, _b, _c, _d, _e, _f;
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const topPad = Platform.OS === "web" ? 67 : insets.top;
    const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;
    const { data: summary, isLoading: loadingSummary, refetch: refetchSummary } = useGetDashboardSummary();
    const { data: activity, isLoading: loadingActivity, refetch: refetchActivity } = useGetRecentActivity();
    const { data: topRetailers, isLoading: loadingTop } = useGetTopRetailers();
    const isLoading = loadingSummary || loadingActivity || loadingTop;
    const refetch = () => { refetchSummary(); refetchActivity(); };
    return (<ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad + 16 }} refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary}/>} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.appTitle, { color: colors.foreground }]}>Batra Butterfly</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </Text>
        </View>
      </View>

      {isLoading && !summary ? (<ActivityIndicator color={colors.primary} style={{ marginTop: 32 }}/>) : (<>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>OVERVIEW</Text>
          <View style={styles.kpiGrid}>
            <KpiCard label="Today's Sales" value={fmt((_a = summary === null || summary === void 0 ? void 0 : summary.todaySales) !== null && _a !== void 0 ? _a : 0)} icon="trending-up" accent="#22c55e" onPress={() => router.push("/(tabs)/invoices")}/>
            <KpiCard label="Outstanding" value={fmt((_b = summary === null || summary === void 0 ? void 0 : summary.totalOutstanding) !== null && _b !== void 0 ? _b : 0)} icon="credit-card" accent="#f59e0b" onPress={() => router.push("/(tabs)/retailers")}/>
            <KpiCard label="Retailers" value={String((_c = summary === null || summary === void 0 ? void 0 : summary.totalRetailers) !== null && _c !== void 0 ? _c : 0)} icon="users" onPress={() => router.push("/(tabs)/retailers")}/>
            <KpiCard label="Overdue" value={String((_d = summary === null || summary === void 0 ? void 0 : summary.overdueRetailerCount) !== null && _d !== void 0 ? _d : 0)} icon="alert-circle" accent={(summary === null || summary === void 0 ? void 0 : summary.overdueRetailerCount) ? "#ef4444" : undefined} onPress={() => router.push("/(tabs)/retailers")}/>
            <KpiCard label="Products" value={String((_e = summary === null || summary === void 0 ? void 0 : summary.totalProducts) !== null && _e !== void 0 ? _e : 0)} icon="package" onPress={() => router.push("/(tabs)/stock")}/>
            <KpiCard label="Low Stock" value={String((_f = summary === null || summary === void 0 ? void 0 : summary.lowStockCount) !== null && _f !== void 0 ? _f : 0)} icon="alert-triangle" accent={(summary === null || summary === void 0 ? void 0 : summary.lowStockCount) ? "#f59e0b" : undefined} onPress={() => router.push("/(tabs)/stock")}/>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: 24 }]}>
            TOP RETAILERS
          </Text>
          {!topRetailers || topRetailers.length === 0 ? (<View style={styles.emptyState}>
              <Feather name="users" size={32} color={colors.mutedForeground}/>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No retailer data</Text>
            </View>) : (topRetailers.slice(0, 5).map((r, i) => (<Pressable key={r.id} style={({ pressed }) => [
                    styles.retailerRow,
                    { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 },
                ]} onPress={() => router.push(`/retailer/${r.id}`)}>
                <View style={[styles.rankDot, { backgroundColor: i < 3 ? rankColors[i] + "44" : colors.secondary }]}>
                  <Text style={[styles.rankDotText, { color: i < 3 ? rankColors[i] : colors.mutedForeground }]}>
                    {i + 1}
                  </Text>
                </View>
                <View style={styles.retailerMeta}>
                  <Text style={[styles.retailerName, { color: colors.foreground }]} numberOfLines={1}>{r.name}</Text>
                  <Text style={[styles.retailerSub, { color: colors.mutedForeground }]}>
                    {fmt(r.totalPurchaseLast30Days)} · {r.orderFrequency} orders
                  </Text>
                </View>
                <Text style={[styles.retailerGrowth, { color: r.growthRate >= 0 ? "#22c55e" : "#ef4444" }]}>
                  {r.growthRate >= 0 ? "+" : ""}{r.growthRate.toFixed(1)}%
                </Text>
              </Pressable>)))}

          <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: 24 }]}>
            RECENT ACTIVITY
          </Text>
          {!activity || activity.length === 0 ? (<View style={styles.emptyState}>
              <Feather name="activity" size={32} color={colors.mutedForeground}/>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No recent activity</Text>
            </View>) : (activity.slice(0, 15).map((item) => {
                var _a;
                const meta = (_a = activityIcon[item.type]) !== null && _a !== void 0 ? _a : { icon: "circle", color: colors.mutedForeground };
                return (<View key={item.id} style={[
                        styles.activityRow,
                        { borderBottomColor: colors.border },
                    ]}>
                  <View style={[styles.activityIcon, { backgroundColor: meta.color + "22" }]}>
                    <Feather name={meta.icon} size={16} color={meta.color}/>
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={[styles.activityDesc, { color: colors.foreground }]} numberOfLines={1}>
                      {item.description}
                    </Text>
                    <Text style={[styles.activitySub, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {item.entityName} \u00b7 {new Date(item.date).toLocaleDateString("en-IN")}
                    </Text>
                  </View>
                  {item.amount !== null && (<Text style={[styles.activityAmount, { color: colors.foreground }]}>
                      {fmt(item.amount)}
                    </Text>)}
                </View>);
            }))}
        </>)}
    </ScrollView>);
}
const rankColors = ["#f59e0b", "#94a3b8", "#cd7c2e"];
const styles = StyleSheet.create({
    container: { flex: 1 },
    headerRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        paddingHorizontal: 16,
        marginBottom: 20,
    },
    appTitle: {
        fontSize: 24,
        fontFamily: "Inter_700Bold",
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 13,
        fontFamily: "Inter_400Regular",
        marginTop: 2,
    },
    sectionTitle: {
        fontSize: 11,
        fontFamily: "Inter_600SemiBold",
        letterSpacing: 1,
        paddingHorizontal: 16,
        marginBottom: 10,
    },
    kpiGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        paddingHorizontal: 12,
        gap: 8,
    },
    kpiCard: {
        width: "100%",
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
    },
    kpiIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 10,
    },
    kpiValue: {
        fontSize: 22,
        fontFamily: "Inter_700Bold",
        letterSpacing: -0.5,
    },
    kpiLabel: {
        fontSize: 12,
        fontFamily: "Inter_400Regular",
        marginTop: 2,
    },
    retailerRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: 12,
    },
    rankDot: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
    },
    rankDotText: {
        fontSize: 12,
        fontFamily: "Inter_700Bold",
    },
    retailerMeta: { flex: 1 },
    retailerName: {
        fontSize: 14,
        fontFamily: "Inter_600SemiBold",
    },
    retailerSub: {
        fontSize: 12,
        fontFamily: "Inter_400Regular",
        marginTop: 1,
    },
    retailerGrowth: {
        fontSize: 13,
        fontFamily: "Inter_600SemiBold",
    },
    activityRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: 12,
    },
    activityIcon: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    activityContent: { flex: 1 },
    activityDesc: {
        fontSize: 14,
        fontFamily: "Inter_500Medium",
    },
    activitySub: {
        fontSize: 12,
        fontFamily: "Inter_400Regular",
        marginTop: 2,
    },
    activityAmount: {
        fontSize: 14,
        fontFamily: "Inter_600SemiBold",
    },
    emptyState: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 40,
        gap: 12,
    },
    emptyText: {
        fontSize: 14,
        fontFamily: "Inter_400Regular",
    },
});
