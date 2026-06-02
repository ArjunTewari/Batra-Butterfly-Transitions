import React, { createContext, useContext, useState, useEffect, useCallback, } from "react";
import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { setBaseUrl } from "@workspace/api-client-react";
const DOMAIN = typeof process !== "undefined" && process.env["EXPO_PUBLIC_DOMAIN"]
    ? process.env["EXPO_PUBLIC_DOMAIN"]
    : "";
const API_BASE = DOMAIN ? `https://${DOMAIN}` : "";
const API = `${API_BASE}/api`;
// Configure the API client base URL for Expo
if (API_BASE) {
    setBaseUrl(API_BASE);
}
const AuthContext = createContext({
    user: null,
    role: null,
    isMaster: false,
    businessName: "",
    loading: true,
    logout: async () => { },
    refetchUser: async () => { },
});
export function useAuth() {
    return useContext(AuthContext);
}
function LoginScreen({ onAuth }) {
    const [screen, setScreen] = useState("choose");
    return (<View style={styles.root}>
      {screen === "choose" && <ChooseScreen onSelect={setScreen}/>}
      {screen === "master-login" && <MasterLoginScreen onAuth={onAuth} onBack={() => setScreen("choose")}/>}
      {screen === "master-signup" && <MasterSignupScreen onAuth={onAuth} onBack={() => setScreen("choose")}/>}
      {screen === "staff-login" && <StaffLoginScreen onAuth={onAuth} onBack={() => setScreen("choose")}/>}
    </View>);
}
function ChooseScreen({ onSelect }) {
    const insets = useSafeAreaInsets();
    return (<KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.inner, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}><Text style={styles.logoEmoji}>🦋</Text></View>
        <Text style={styles.title}>Batra Butterfly</Text>
        <Text style={styles.subtitle}>Business Operating System</Text>
        <View style={styles.buttons}>
          <Pressable style={({ pressed }) => [styles.primaryBtn, { opacity: pressed ? 0.8 : 1 }]} onPress={() => onSelect("master-login")}>
            <Feather name="lock" size={18} color="#000"/>
            <Text style={styles.primaryBtnText}>Master Login</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.secondaryBtn, { opacity: pressed ? 0.8 : 1 }]} onPress={() => onSelect("master-signup")}>
            <Feather name="briefcase" size={18} color="#fff"/>
            <Text style={styles.secondaryBtnText}>Create New Account</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.7 : 1 }]} onPress={() => onSelect("staff-login")}>
            <Text style={styles.backBtnText}>Staff / Employee Login</Text>
          </Pressable>
          <DemoButton onAuth={onAuth}/>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>);
}
function DemoButton({ onAuth }) {
    const [loading, setLoading] = useState(false);
    const handleDemo = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/auth/demo`, { method: "POST", credentials: "include" });
            if (res.ok)
                onAuth(await res.json());
        }
        finally {
            setLoading(false);
        }
    };
    return (<View style={{ paddingTop: 16, borderTopWidth: 1, borderTopColor: "#1a1a1a", width: "100%", alignItems: "center" }}>
      <Pressable onPress={handleDemo} disabled={loading} style={({ pressed }) => ({ opacity: pressed || loading ? 0.5 : 1 })}>
        <Text style={{ color: "#555", fontFamily: "Inter_400Regular", fontSize: 13, textDecorationLine: "underline" }}>
          {loading ? "Loading demo..." : "Try demo (no sign-up needed)"}
        </Text>
      </Pressable>
    </View>);
}
function MasterLoginScreen({ onAuth, onBack }) {
    const insets = useSafeAreaInsets();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const handleSubmit = async () => {
        var _a;
        setError("");
        setLoading(true);
        try {
            const res = await fetch(`${API}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ email, password }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setError((_a = d.error) !== null && _a !== void 0 ? _a : "Login failed");
                return;
            }
            const user = await res.json();
            onAuth(user);
        }
        catch {
            setError("Network error.");
        }
        finally {
            setLoading(false);
        }
    };
    return (<KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.inner, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Master Login</Text>
        <Text style={styles.subtitle}>Sign in to your account</Text>
        <View style={styles.buttons}>
          <TextInput style={styles.input} placeholder="Email address" placeholderTextColor="#555" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false}/>
          <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#555" value={password} onChangeText={setPassword} secureTextEntry/>
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          <Pressable style={({ pressed }) => [styles.primaryBtn, { opacity: pressed || loading ? 0.7 : 1 }]} onPress={handleSubmit} disabled={loading || !email || !password}>
            <Text style={styles.primaryBtnText}>{loading ? "Signing in..." : "Sign In"}</Text>
          </Pressable>
          <Pressable style={styles.backBtn} onPress={onBack}><Text style={styles.backBtnText}>← Back</Text></Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>);
}
function MasterSignupScreen({ onAuth, onBack }) {
    const insets = useSafeAreaInsets();
    const [businessName, setBusinessName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const handleSubmit = async () => {
        var _a;
        setError("");
        setLoading(true);
        try {
            const res = await fetch(`${API}/auth/signup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ email, password, businessName, phone: phone || undefined }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setError((_a = d.error) !== null && _a !== void 0 ? _a : "Signup failed");
                return;
            }
            const user = await res.json();
            onAuth(user);
        }
        catch {
            setError("Network error.");
        }
        finally {
            setLoading(false);
        }
    };
    return (<KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.inner, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Set up your business</Text>
        <View style={styles.buttons}>
          <TextInput style={styles.input} placeholder="Business name" placeholderTextColor="#555" value={businessName} onChangeText={setBusinessName}/>
          <TextInput style={styles.input} placeholder="Email address" placeholderTextColor="#555" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false}/>
          <TextInput style={styles.input} placeholder="Phone (optional)" placeholderTextColor="#555" value={phone} onChangeText={setPhone} keyboardType="phone-pad"/>
          <TextInput style={styles.input} placeholder="Password (min 6 chars)" placeholderTextColor="#555" value={password} onChangeText={setPassword} secureTextEntry/>
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          <Pressable style={({ pressed }) => [styles.primaryBtn, { opacity: pressed || loading ? 0.7 : 1 }]} onPress={handleSubmit} disabled={loading || !businessName || !email || !password}>
            <Text style={styles.primaryBtnText}>{loading ? "Creating..." : "Create Account"}</Text>
          </Pressable>
          <Pressable style={styles.backBtn} onPress={onBack}><Text style={styles.backBtnText}>← Back</Text></Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>);
}
function StaffLoginScreen({ onAuth, onBack }) {
    const insets = useSafeAreaInsets();
    const [businessCode, setBusinessCode] = useState("");
    const [pin, setPin] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const handleSubmit = async () => {
        var _a;
        setError("");
        setLoading(true);
        try {
            const res = await fetch(`${API}/auth/staff-login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ businessCode: businessCode.toUpperCase(), pin }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setError((_a = d.error) !== null && _a !== void 0 ? _a : "Login failed");
                return;
            }
            const user = await res.json();
            onAuth(user);
        }
        catch {
            setError("Network error.");
        }
        finally {
            setLoading(false);
        }
    };
    return (<KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.inner, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Staff Login</Text>
        <Text style={styles.subtitle}>Enter your business code and PIN</Text>
        <View style={styles.buttons}>
          <TextInput style={[styles.input, { textTransform: "uppercase", letterSpacing: 4, fontFamily: "Inter_700Bold" }]} placeholder="BUSINESS CODE" placeholderTextColor="#555" value={businessCode} onChangeText={(t) => setBusinessCode(t.toUpperCase())} autoCapitalize="characters" autoCorrect={false}/>
          <TextInput style={[styles.input, { textAlign: "center", fontSize: 24, letterSpacing: 10, fontFamily: "Inter_700Bold" }]} placeholder="••••" placeholderTextColor="#555" value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={8}/>
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          <Pressable style={({ pressed }) => [styles.primaryBtn, { opacity: pressed || loading ? 0.7 : 1 }]} onPress={handleSubmit} disabled={loading || !businessCode || !pin}>
            <Text style={styles.primaryBtnText}>{loading ? "Signing in..." : "Staff Sign In"}</Text>
          </Pressable>
          <Pressable style={styles.backBtn} onPress={onBack}><Text style={styles.backBtnText}>← Back</Text></Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>);
}
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const fetchMe = useCallback(async () => {
        try {
            const res = await fetch(`${API}/auth/me`, { credentials: "include" });
            if (res.ok) {
                setUser(await res.json());
            }
            else {
                setUser(null);
            }
        }
        catch {
            setUser(null);
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { fetchMe(); }, [fetchMe]);
    const logout = async () => {
        await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
        setUser(null);
    };
    if (loading) {
        return (<View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ fontSize: 40 }}>🦋</Text>
        <ActivityIndicator color="#fff" style={{ marginTop: 16 }}/>
      </View>);
    }
    if (!user) {
        return <LoginScreen onAuth={(u) => setUser(u)}/>;
    }
    const role = user.role === "master" ? "master" : "staff";
    const businessName = user.businessName;
    return (<AuthContext.Provider value={{ user, role, isMaster: role === "master", businessName, loading: false, logout, refetchUser: fetchMe }}>
      {children}
    </AuthContext.Provider>);
}
const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: "#000" },
    inner: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 4 },
    logoWrap: { width: 72, height: 72, borderRadius: 20, backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center", marginBottom: 16 },
    logoEmoji: { fontSize: 36 },
    title: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.5, marginBottom: 6 },
    subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#666", marginBottom: 32 },
    buttons: { width: "100%", gap: 12, alignItems: "center" },
    input: { width: "100%", height: 52, backgroundColor: "#111", borderWidth: 1, borderColor: "#2a2a2a", borderRadius: 12, color: "#fff", fontSize: 16, fontFamily: "Inter_400Regular", paddingHorizontal: 16 },
    primaryBtn: { width: "100%", backgroundColor: "#fff", height: 52, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
    primaryBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#000" },
    secondaryBtn: { width: "100%", backgroundColor: "transparent", height: 52, borderRadius: 14, borderWidth: 1, borderColor: "#2a2a2a", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
    secondaryBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#ccc" },
    backBtn: { paddingVertical: 10 },
    backBtnText: { color: "#555", fontFamily: "Inter_400Regular", fontSize: 14 },
    errorText: { color: "#ef4444", fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
});
