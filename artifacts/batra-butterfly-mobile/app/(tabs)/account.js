import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState, useCallback } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
const DOMAIN = typeof process !== "undefined" && process.env["EXPO_PUBLIC_DOMAIN"]
    ? process.env["EXPO_PUBLIC_DOMAIN"]
    : "";
const API_BASE = DOMAIN ? `https://${DOMAIN}` : "";
const API = `${API_BASE}/api`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatInr(n) {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}
export default function AccountTab() {
    var _a;
    const { isMaster, user, logout, refetchUser } = useAuth();
    const insets = useSafeAreaInsets();
    const colors = useColors();
    const [account, setAccount] = useState(null);
    const [staff, setStaff] = useState([]);
    const [aiUsage, setAiUsage] = useState(null);
    const [loading, setLoading] = useState(true);
    const [businessName, setBusinessName] = useState("");
    const [phone, setPhone] = useState("");
    const [currentPw, setCurrentPw] = useState("");
    const [newPw, setNewPw] = useState("");
    const [saving, setSaving] = useState(false);
    const [pinMap, setPinMap] = useState({});
    const [showAddStaff, setShowAddStaff] = useState(false);
    const [newName, setNewName] = useState("");
    const [newCommission, setNewCommission] = useState("5");
    const [newPin, setNewPin] = useState("");
    const [addingStaff, setAddingStaff] = useState(false);
    const fetchAll = useCallback(async () => {
        var _a, _b;
        setLoading(true);
        try {
            const [accRes, staffRes, aiRes] = await Promise.all([
                fetch(`${API}/account`, { credentials: "include" }),
                fetch(`${API}/account/staff`, { credentials: "include" }),
                fetch(`${API}/account/ai-usage`, { credentials: "include" }),
            ]);
            const [acc, s, ai] = await Promise.all([accRes.json(), staffRes.json(), aiRes.json()]);
            setAccount(acc);
            setBusinessName((_a = acc.businessName) !== null && _a !== void 0 ? _a : "");
            setPhone((_b = acc.phone) !== null && _b !== void 0 ? _b : "");
            setStaff(s);
            setAiUsage(ai);
        }
        catch { }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { fetchAll(); }, [fetchAll]);
    const saveProfile = async () => {
        var _a, _b;
        setSaving(true);
        const body = {};
        if (businessName !== (account === null || account === void 0 ? void 0 : account.businessName))
            body.businessName = businessName;
        if (phone !== ((_a = account === null || account === void 0 ? void 0 : account.phone) !== null && _a !== void 0 ? _a : ""))
            body.phone = phone;
        if (newPw) {
            body.currentPassword = currentPw;
            body.newPassword = newPw;
        }
        try {
            const res = await fetch(`${API}/account`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) {
                Alert.alert("Error", (_b = data.error) !== null && _b !== void 0 ? _b : "Save failed");
                return;
            }
            setAccount(data);
            setCurrentPw("");
            setNewPw("");
            await refetchUser();
            Alert.alert("Saved", "Profile updated successfully");
        }
        catch {
            Alert.alert("Error", "Network error");
        }
        finally {
            setSaving(false);
        }
    };
    const addStaff = async () => {
        var _a;
        if (!newName.trim()) {
            Alert.alert("Error", "Name is required");
            return;
        }
        setAddingStaff(true);
        try {
            const res = await fetch(`${API}/staff`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ name: newName.trim(), commissionRate: parseFloat(newCommission) || 5 }),
            });
            const created = await res.json();
            if (!res.ok) {
                Alert.alert("Error", (_a = created.error) !== null && _a !== void 0 ? _a : "Failed");
                return;
            }
            if (newPin && newPin.length >= 4) {
                await fetch(`${API}/account/staff/${created.id}/pin`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ pin: newPin }),
                });
            }
            await fetchAll();
            setNewName("");
            setNewCommission("5");
            setNewPin("");
            setShowAddStaff(false);
            Alert.alert("Done", "Staff member added");
        }
        catch {
            Alert.alert("Error", "Network error");
        }
        finally {
            setAddingStaff(false);
        }
    };
    const setPin = async (staffId) => {
        const pin = pinMap[staffId];
        if (!pin || pin.length < 4) {
            Alert.alert("Error", "PIN must be at least 4 digits");
            return;
        }
        try {
            const res = await fetch(`${API}/account/staff/${staffId}/pin`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ pin }),
            });
            if (!res.ok) {
                Alert.alert("Error", "Failed to set PIN");
                return;
            }
            setPinMap((p) => ({ ...p, [staffId]: "" }));
            setStaff((prev) => prev.map((s) => s.id === staffId ? { ...s, hasPin: true } : s));
            Alert.alert("Done", "PIN set successfully");
        }
        catch {
            Alert.alert("Error", "Network error");
        }
    };
    const removePin = (staffId) => {
        Alert.alert("Remove PIN", "Remove PIN for this staff member?", [
            { text: "Cancel", style: "cancel" },
            { text: "Remove", style: "destructive", onPress: async () => {
                    try {
                        await fetch(`${API}/account/staff/${staffId}/pin`, { method: "DELETE", credentials: "include" });
                        setStaff((prev) => prev.map((s) => s.id === staffId ? { ...s, hasPin: false } : s));
                    }
                    catch { }
                } },
        ]);
    };
    const s = StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        scroll: { flex: 1 },
        scrollContent: { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100, paddingHorizontal: 16, gap: 20 },
        header: { marginBottom: 4 },
        headerTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground },
        headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 4 },
        section: { gap: 12 },
        sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 1 },
        card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 12 },
        codeCard: { backgroundColor: "#1a1200", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#f59e0b40", flexDirection: "row", alignItems: "center", gap: 12 },
        codeLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#f59e0b", textTransform: "uppercase", letterSpacing: 1 },
        codeText: { fontSize: 26, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: 6, marginTop: 2 },
        codeHint: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
        fieldLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 4 },
        input: { height: 44, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 14 },
        inputDisabled: { opacity: 0.5 },
        row: { flexDirection: "row", gap: 8, alignItems: "center" },
        primaryBtn: { backgroundColor: colors.foreground, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", flex: 1 },
        primaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.background },
        dangerBtn: { borderWidth: 1, borderColor: "#ef444440", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, alignItems: "center" },
        dangerBtnText: { fontFamily: "Inter_500Medium", fontSize: 13, color: "#ef4444" },
        logoutBtn: { backgroundColor: "#111", borderRadius: 10, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border },
        logoutBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#ef4444" },
        staffRow: { paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
        staffName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
        staffSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 },
        pinBadge: { fontSize: 11, fontFamily: "Inter_500Medium", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
        metricRow: { flexDirection: "row", gap: 10 },
        metricCard: { flex: 1, backgroundColor: colors.background, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border },
        metricLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
        metricValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground, marginTop: 2 },
        featureRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
        featureLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, textTransform: "capitalize" },
        featureVal: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
        divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
    });
    if (loading) {
        return (<View style={[s.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.foreground}/>
      </View>);
    }
    return (<View style={s.container}>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Text style={s.headerTitle}>Account</Text>
          <Text style={s.headerSub}>Manage your business, staff & AI usage</Text>
        </View>

        {/* Business Code */}
        {account && (<View style={s.codeCard}>
            <Feather name="shield" size={28} color="#f59e0b"/>
            <View style={{ flex: 1 }}>
              <Text style={s.codeLabel}>Business Code</Text>
              <Text style={s.codeText}>{account.businessCode}</Text>
              <Text style={s.codeHint}>Share with staff to allow login</Text>
            </View>
          </View>)}

        {/* Profile */}
        {isMaster && (<View style={s.section}>
            <Text style={s.sectionTitle}>Business Profile</Text>
            <View style={s.card}>
              <View>
                <Text style={s.fieldLabel}>Business Name</Text>
                <TextInput style={s.input} value={businessName} onChangeText={setBusinessName} placeholder="Business name" placeholderTextColor={colors.mutedForeground}/>
              </View>
              <View>
                <Text style={s.fieldLabel}>Email</Text>
                <TextInput style={[s.input, s.inputDisabled]} value={(_a = account === null || account === void 0 ? void 0 : account.email) !== null && _a !== void 0 ? _a : ""} editable={false}/>
              </View>
              <View>
                <Text style={s.fieldLabel}>Phone</Text>
                <TextInput style={s.input} value={phone} onChangeText={setPhone} placeholder="Phone number" placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad"/>
              </View>
              <View style={s.divider}/>
              <Text style={[s.fieldLabel, { marginBottom: 0 }]}>Change Password (optional)</Text>
              <TextInput style={s.input} value={currentPw} onChangeText={setCurrentPw} placeholder="Current password" placeholderTextColor={colors.mutedForeground} secureTextEntry/>
              <TextInput style={s.input} value={newPw} onChangeText={setNewPw} placeholder="New password (min 6 chars)" placeholderTextColor={colors.mutedForeground} secureTextEntry/>
              <Pressable style={({ pressed }) => [s.primaryBtn, { opacity: pressed || saving ? 0.7 : 1 }]} onPress={saveProfile} disabled={saving}>
                <Text style={s.primaryBtnText}>{saving ? "Saving..." : "Save Changes"}</Text>
              </Pressable>
            </View>
          </View>)}

        {/* Staff PINs */}
        {isMaster && (<View style={s.section}>
            <Text style={s.sectionTitle}>Staff Credentials</Text>
            <View style={s.card}>
              {/* Add new staff */}
              <Pressable style={({ pressed }) => [s.row, { backgroundColor: "#111", borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, opacity: pressed ? 0.7 : 1 }]} onPress={() => setShowAddStaff(!showAddStaff)}>
                <Feather name="user-plus" size={15} color={colors.foreground}/>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.foreground, flex: 1, marginLeft: 8 }}>Add New Staff Member</Text>
                <Feather name={showAddStaff ? "chevron-up" : "chevron-down"} size={15} color={colors.mutedForeground}/>
              </Pressable>
              {showAddStaff && (<View style={{ gap: 10, paddingTop: 4 }}>
                  <View>
                    <Text style={s.fieldLabel}>Full Name</Text>
                    <TextInput style={s.input} value={newName} onChangeText={setNewName} placeholder="Staff name" placeholderTextColor={colors.mutedForeground}/>
                  </View>
                  <View style={s.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.fieldLabel}>Commission %</Text>
                      <TextInput style={s.input} value={newCommission} onChangeText={setNewCommission} keyboardType="numeric" placeholder="5" placeholderTextColor={colors.mutedForeground}/>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.fieldLabel}>PIN (optional)</Text>
                      <TextInput style={[s.input, { textAlign: "center", letterSpacing: 6, fontFamily: "Inter_700Bold" }]} value={newPin} onChangeText={(t) => setNewPin(t.replace(/\D/g, "").slice(0, 8))} keyboardType="number-pad" secureTextEntry placeholder="••••" placeholderTextColor={colors.mutedForeground} maxLength={8}/>
                    </View>
                  </View>
                  <View style={s.row}>
                    <Pressable style={({ pressed }) => [s.primaryBtn, { opacity: pressed || addingStaff ? 0.7 : 1 }]} onPress={addStaff} disabled={addingStaff || !newName.trim()}>
                      <Text style={s.primaryBtnText}>{addingStaff ? "Adding..." : "Add Staff"}</Text>
                    </Pressable>
                    <Pressable style={[s.dangerBtn, { borderColor: colors.border }]} onPress={() => setShowAddStaff(false)}>
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.mutedForeground }}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>)}
              <View style={s.divider}/>
              {staff.length === 0 ? (<Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular" }}>No staff members yet.</Text>) : (staff.map((member, idx) => {
                var _a;
                return (<View key={member.id} style={[s.staffRow, idx === staff.length - 1 && { borderBottomWidth: 0, paddingBottom: 0 }]}>
                    <View style={[s.row, { justifyContent: "space-between", marginBottom: 8 }]}>
                      <View>
                        <Text style={s.staffName}>{member.name}</Text>
                        <Text style={s.staffSub}>{member.commissionRate}% commission</Text>
                      </View>
                      <Text style={[s.pinBadge, member.hasPin ? { backgroundColor: "#16a34a20", color: "#4ade80" } : { backgroundColor: colors.border, color: colors.mutedForeground }]}>
                        {member.hasPin ? "PIN Set" : "No PIN"}
                      </Text>
                    </View>
                    <View style={s.row}>
                      <TextInput style={[s.input, { flex: 1, textAlign: "center", letterSpacing: 6, fontFamily: "Inter_700Bold" }]} placeholder="New PIN" placeholderTextColor={colors.mutedForeground} value={(_a = pinMap[member.id]) !== null && _a !== void 0 ? _a : ""} onChangeText={(t) => setPinMap((p) => ({ ...p, [member.id]: t.replace(/\D/g, "").slice(0, 8) }))} keyboardType="number-pad" secureTextEntry maxLength={8}/>
                      <Pressable style={({ pressed }) => [s.primaryBtn, { flex: 0, paddingHorizontal: 14, opacity: pressed || !pinMap[member.id] ? 0.6 : 1 }]} onPress={() => setPin(member.id)} disabled={!pinMap[member.id]}>
                        <Text style={s.primaryBtnText}>Set</Text>
                      </Pressable>
                      {member.hasPin && (<Pressable style={s.dangerBtn} onPress={() => removePin(member.id)}>
                          <Feather name="trash-2" size={14} color="#ef4444"/>
                        </Pressable>)}
                    </View>
                  </View>);
            }))}
            </View>
          </View>)}

        {/* AI Usage */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>AI Usage & Cost</Text>
          <View style={s.card}>
            {aiUsage ? (<>
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                  {aiUsage.month ? MONTHS[aiUsage.month - 1] : ""} {aiUsage.year} — Current Month
                </Text>
                <View style={s.metricRow}>
                  <View style={s.metricCard}>
                    <Text style={s.metricLabel}>AI Calls</Text>
                    <Text style={s.metricValue}>{aiUsage.totalCalls}</Text>
                  </View>
                  <View style={s.metricCard}>
                    <Text style={s.metricLabel}>Monthly Cost</Text>
                    <Text style={[s.metricValue, { fontSize: 16 }]}>{formatInr(aiUsage.monthlyCostInr)}</Text>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>+20% service fee</Text>
                  </View>
                </View>
                <View style={s.metricRow}>
                  <View style={s.metricCard}>
                    <Text style={s.metricLabel}>Input Tokens</Text>
                    <Text style={[s.metricValue, { fontSize: 16 }]}>{(aiUsage.totalInputTokens / 1000).toFixed(1)}K</Text>
                  </View>
                  <View style={s.metricCard}>
                    <Text style={s.metricLabel}>Output Tokens</Text>
                    <Text style={[s.metricValue, { fontSize: 16 }]}>{(aiUsage.totalOutputTokens / 1000).toFixed(1)}K</Text>
                  </View>
                </View>
                {aiUsage.byFeature.length > 0 && (<>
                    <View style={s.divider}/>
                    <Text style={s.fieldLabel}>By Feature</Text>
                    {aiUsage.byFeature.map((f) => (<View key={f.feature} style={s.featureRow}>
                        <Text style={s.featureLabel}>{f.feature.replace(/_/g, " ")}</Text>
                        <Text style={s.featureVal}>{f.calls} calls · ${f.costUsd.toFixed(4)}</Text>
                      </View>))}
                  </>)}
                {aiUsage.totalCalls === 0 && (<Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 8 }}>
                    No AI calls this month yet.
                  </Text>)}
              </>) : (<ActivityIndicator color={colors.foreground}/>)}
          </View>
        </View>

        {/* Logout */}
        <Pressable style={({ pressed }) => [s.logoutBtn, { opacity: pressed ? 0.7 : 1 }]} onPress={logout}>
          <Text style={s.logoutBtnText}>Log Out</Text>
        </Pressable>
      </ScrollView>
    </View>);
}
