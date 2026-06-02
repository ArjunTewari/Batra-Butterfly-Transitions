import { useListStock, useCreateStockItem, } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Alert, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
const fmt = (n) => "\u20B9" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const LOW_STOCK_THRESHOLD = 5;
function StockCard({ item }) {
    const colors = useColors();
    const isLow = item.currentStock <= LOW_STOCK_THRESHOLD;
    const isOut = item.currentStock === 0;
    const margin = item.purchasePrice ? item.price - item.purchasePrice : 0;
    return (<View style={[
            styles.card,
            {
                backgroundColor: colors.card,
                borderColor: isOut ? "#ef444444" : isLow ? "#f59e0b44" : colors.border,
            },
        ]}>
      <View style={styles.cardRow}>
        <View style={[styles.codeWrap, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.codeText, { color: colors.mutedForeground }]} numberOfLines={1}>
            {item.articleCode}
          </Text>
        </View>
        <View style={styles.cardMeta}>
          <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={[styles.itemPrice, { color: colors.mutedForeground }]}>
            Buy {item.purchasePrice ? fmt(item.purchasePrice) : "—"} · Sell {fmt(item.price)}
          </Text>
        </View>
        <View style={styles.stockRight}>
          <View style={[
            styles.stockBadge,
            {
                backgroundColor: isOut ? "#ef444422" : isLow ? "#f59e0b22" : "#22c55e22",
            },
        ]}>
            <Text style={[
            styles.stockText,
            {
                color: isOut ? "#ef4444" : isLow ? "#f59e0b" : "#22c55e",
            },
        ]}>
              {item.currentStock}
            </Text>
          </View>
          <Text style={[styles.stockLabel, { color: colors.mutedForeground }]}>
            {isOut ? "Out" : isLow ? "Low" : "In stock"}
          </Text>
        </View>
      </View>
      {margin > 0 && (<View style={[styles.marginRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.marginLabel, { color: colors.mutedForeground }]}>Margin</Text>
          <Text style={[styles.marginValue, { color: "#22c55e" }]}>
            {fmt(margin)} per unit ({Math.round((margin / item.price) * 100)}%)
          </Text>
        </View>)}
    </View>);
}
export default function StockScreen() {
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const topPad = Platform.OS === "web" ? 67 : insets.top;
    const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;
    const queryClient = useQueryClient();
    const [search, setSearch] = useState("");
    const [filterLow, setFilterLow] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [articleCode, setArticleCode] = useState("");
    const [name, setName] = useState("");
    const [price, setPrice] = useState("");
    const [purchasePrice, setPurchasePrice] = useState("");
    const [currentStock, setCurrentStock] = useState("");
    const { data: stock, isLoading, refetch } = useListStock();
    const createProduct = useCreateStockItem();
    const filtered = (stock !== null && stock !== void 0 ? stock : [])
        .filter((item) => {
        if (filterLow && item.currentStock > LOW_STOCK_THRESHOLD)
            return false;
        if (search) {
            return (item.name.toLowerCase().includes(search.toLowerCase()) ||
                item.articleCode.toLowerCase().includes(search.toLowerCase()));
        }
        return true;
    })
        .sort((a, b) => a.currentStock - b.currentStock);
    const lowCount = (stock !== null && stock !== void 0 ? stock : []).filter((i) => i.currentStock <= LOW_STOCK_THRESHOLD).length;
    const handleCreate = async () => {
        if (!articleCode.trim() || !name.trim() || !price || !currentStock) {
            Alert.alert("Missing fields", "Please fill all required fields.");
            return;
        }
        try {
            await createProduct.mutateAsync({
                data: {
                    articleCode: articleCode.trim(),
                    name: name.trim(),
                    price: parseFloat(price),
                    purchasePrice: parseFloat(purchasePrice) || 0,
                    currentStock: parseInt(currentStock, 10),
                },
            });
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            queryClient.invalidateQueries({ queryKey: ["/api/stock"] });
            setModalVisible(false);
            setArticleCode("");
            setName("");
            setPrice("");
            setPurchasePrice("");
            setCurrentStock("");
            refetch();
        }
        catch {
            Alert.alert("Error", "Failed to create product.");
        }
    };
    const canSubmit = articleCode.trim() && name.trim() && price && currentStock;
    const totalValue = (stock !== null && stock !== void 0 ? stock : []).reduce((s, i) => s + i.price * i.currentStock, 0);
    const totalCost = (stock !== null && stock !== void 0 ? stock : []).reduce((s, i) => s + (i.purchasePrice || 0) * i.currentStock, 0);
    const totalMargin = totalValue - totalCost;
    return (<View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: topPad + 12, paddingBottom: bottomPad + 16 }} refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary}/>} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Stock</Text>
          {lowCount > 0 && (<View style={[styles.badge, { backgroundColor: "#f59e0b22" }]}>
              <Text style={[styles.badgeText, { color: "#f59e0b" }]}>{lowCount} low</Text>
            </View>)}
        </View>

        {totalValue > 0 && (<View style={[styles.valueCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.valueLabel, { color: colors.mutedForeground }]}>Total Inventory Value</Text>
            <Text style={[styles.valueAmount, { color: colors.foreground }]}>{fmt(totalValue)}</Text>
            <Text style={[styles.valueCount, { color: colors.mutedForeground }]}>
              {(stock !== null && stock !== void 0 ? stock : []).length} products · Cost {fmt(totalCost)} · Margin {fmt(totalMargin)}
            </Text>
          </View>)}

        <View style={[styles.searchWrap, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground}/>
          <TextInput style={[styles.searchInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]} placeholder="Search products..." placeholderTextColor={colors.mutedForeground} value={search} onChangeText={setSearch} clearButtonMode="while-editing"/>
        </View>

        <View style={styles.filterRow}>
          <Pressable style={[
            styles.toggleBtn,
            {
                backgroundColor: filterLow ? "#f59e0b22" : colors.secondary,
                borderColor: filterLow ? "#f59e0b44" : colors.border,
            },
        ]} onPress={() => setFilterLow((v) => !v)}>
            <Feather name="alert-triangle" size={14} color={filterLow ? "#f59e0b" : colors.mutedForeground}/>
            <Text style={[
            styles.toggleText,
            { color: filterLow ? "#f59e0b" : colors.mutedForeground },
        ]}>
              Low Stock Only
            </Text>
          </Pressable>
        </View>

        {filtered.length === 0 && !isLoading ? (<View style={styles.emptyState}>
            <Feather name="package" size={36} color={colors.mutedForeground}/>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No products found</Text>
          </View>) : (filtered.map((item) => <StockCard key={item.id} item={item}/>))}
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
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Add Product</Text>
            <View style={{ width: 22 }}/>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ARTICLE CODE</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]} placeholder="e.g. BB-2024-001" placeholderTextColor={colors.mutedForeground} value={articleCode} onChangeText={setArticleCode} autoCapitalize="characters"/>

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 16 }]}>PRODUCT NAME</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]} placeholder="Enter product name" placeholderTextColor={colors.mutedForeground} value={name} onChangeText={setName}/>

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 16 }]}>PURCHASE PRICE (\u20B9)</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]} placeholder="0.00" placeholderTextColor={colors.mutedForeground} value={purchasePrice} onChangeText={setPurchasePrice} keyboardType="decimal-pad"/>

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 16 }]}>SELLING PRICE (\u20B9)</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]} placeholder="0.00" placeholderTextColor={colors.mutedForeground} value={price} onChangeText={setPrice} keyboardType="decimal-pad"/>

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 16 }]}>INITIAL STOCK</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]} placeholder="0" placeholderTextColor={colors.mutedForeground} value={currentStock} onChangeText={setCurrentStock} keyboardType="number-pad"/>

            <Pressable style={[
            styles.actionBtn,
            {
                backgroundColor: canSubmit ? colors.primary : colors.secondary,
                marginTop: 24,
                opacity: canSubmit ? 1 : 0.5,
            },
        ]} onPress={handleCreate} disabled={!canSubmit || createProduct.isPending}>
              {createProduct.isPending ? (<Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>Creating...</Text>) : (<>
                  <Feather name="check-circle" size={20} color={colors.primaryForeground}/>
                  <Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>Add Product</Text>
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
        marginBottom: 12,
    },
    title: {
        fontSize: 28,
        fontFamily: "Inter_700Bold",
        letterSpacing: -0.5,
    },
    badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    badgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
    valueCard: {
        marginHorizontal: 16,
        marginBottom: 14,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
    },
    valueLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
    valueAmount: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5, marginTop: 4 },
    valueCount: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
    searchWrap: {
        flexDirection: "row",
        alignItems: "center",
        marginHorizontal: 16,
        marginBottom: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
        gap: 8,
    },
    searchInput: { flex: 1, fontSize: 15 },
    filterRow: {
        paddingHorizontal: 16,
        marginBottom: 12,
    },
    toggleBtn: {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1,
        gap: 6,
    },
    toggleText: { fontSize: 13, fontFamily: "Inter_500Medium" },
    card: {
        marginHorizontal: 16,
        marginBottom: 8,
        borderRadius: 12,
        borderWidth: 1,
        padding: 14,
    },
    cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    codeWrap: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        maxWidth: 80,
    },
    codeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
    cardMeta: { flex: 1 },
    itemName: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
    itemPrice: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
    stockRight: { alignItems: "center" },
    stockBadge: {
        width: 48,
        height: 48,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    stockText: { fontSize: 18, fontFamily: "Inter_700Bold" },
    stockLabel: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 4 },
    emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
    emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
    marginRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 10, marginTop: 10, borderTopWidth: 1 },
    marginLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
    marginValue: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
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
