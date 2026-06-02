import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
const MENU_ITEMS = [
    { label: "Staff Leaderboard", icon: "briefcase", route: "/(tabs)/staff" },
    { label: "Stock Inventory", icon: "package", route: "/(tabs)/stock" },
    { label: "Payment Clearance", icon: "credit-card", route: "/(tabs)/payment-clearance" },
];
export default function MoreScreen() {
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const topPad = Platform.OS === "web" ? 67 : insets.top;
    const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;
    return (<ScrollView style={[styles.root, { backgroundColor: colors.background }]} contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad, paddingHorizontal: 16 }}>
      <Text style={[styles.title, { color: colors.foreground }]}>More</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Additional tools</Text>

      {MENU_ITEMS.map((item) => (<Pressable key={item.label} style={({ pressed }) => [
                styles.row,
                { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]} onPress={() => router.push(item.route)}>
          <View style={[styles.iconWrap, { backgroundColor: colors.muted }]}>
            <Feather name={item.icon} size={18} color={colors.foreground}/>
          </View>
          <Text style={[styles.label, { color: colors.foreground }]}>{item.label}</Text>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground}/>
        </Pressable>))}
    </ScrollView>);
}
const styles = StyleSheet.create({
    root: { flex: 1 },
    title: { fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 2 },
    subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 20 },
    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        marginBottom: 12,
    },
    iconWrap: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
    },
    label: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
