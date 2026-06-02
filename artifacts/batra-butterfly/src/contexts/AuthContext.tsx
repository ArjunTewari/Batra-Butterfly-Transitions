import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, User, Mail, Building2, Eye, EyeOff, LogOut } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const API = "/api";

type Role = "master" | "staff";

interface MasterUser {
  id: number;
  email: string;
  businessName: string;
  businessCode: string;
  phone: string | null;
  role: "master";
}

interface StaffUser {
  accountId: number;
  businessName: string;
  staffId: number;
  staffName: string;
  role: "staff";
}

type AuthUser = MasterUser | StaffUser;

interface AuthContextType {
  user: AuthUser | null;
  role: Role | null;
  isMaster: boolean;
  businessName: string;
  loading: boolean;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  isMaster: false,
  businessName: "",
  loading: true,
  logout: async () => {},
  refetchUser: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

type Screen = "choose" | "master-login" | "master-signup" | "staff-login";

function LoginScreen({ onAuth }: { onAuth: (user: AuthUser) => void }) {
  const [screen, setScreen] = useState<Screen>("choose");

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center space-y-3 mb-8">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto">
            <span className="text-3xl">🦋</span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Batra Butterfly</h1>
          <p className="text-gray-400 text-sm">Business Operating System</p>
        </div>

        <AnimatePresence mode="wait">
          {screen === "choose" && (
            <motion.div
              key="choose"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-3"
            >
              <Button
                className="w-full h-14 bg-white text-black hover:bg-gray-200 font-semibold text-base"
                onClick={() => setScreen("master-login")}
              >
                <Lock className="h-4 w-4 mr-2" />
                Master Login
              </Button>
              <Button
                variant="outline"
                className="w-full h-14 border-white/20 text-gray-300 hover:bg-white/5 hover:text-white text-base"
                onClick={() => setScreen("master-signup")}
              >
                <Building2 className="h-4 w-4 mr-2" />
                Create New Account
              </Button>
              <Button
                variant="ghost"
                className="w-full h-12 text-gray-500 hover:text-gray-300 text-sm"
                onClick={() => setScreen("staff-login")}
              >
                <User className="h-4 w-4 mr-2" />
                Staff / Employee Login
              </Button>
              <DemoButton onAuth={onAuth} />
            </motion.div>
          )}

          {screen === "master-login" && (
            <MasterLoginForm
              key="master-login"
              onAuth={onAuth}
              onBack={() => setScreen("choose")}
            />
          )}

          {screen === "master-signup" && (
            <MasterSignupForm
              key="master-signup"
              onAuth={onAuth}
              onBack={() => setScreen("choose")}
            />
          )}

          {screen === "staff-login" && (
            <StaffLoginForm
              key="staff-login"
              onAuth={onAuth}
              onBack={() => setScreen("choose")}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function DemoButton({ onAuth }: { onAuth: (u: AuthUser) => void }) {
  const [loading, setLoading] = useState(false);
  const handleDemo = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/demo`, { method: "POST", credentials: "include" });
      if (res.ok) onAuth(await res.json());
    } finally { setLoading(false); }
  };
  return (
    <div className="pt-2 border-t border-white/10 w-full text-center">
      <button
        onClick={handleDemo}
        disabled={loading}
        className="text-xs text-gray-600 hover:text-gray-400 transition-colors underline underline-offset-2"
      >
        {loading ? "Loading demo..." : "Try demo (no sign-up needed)"}
      </button>
    </div>
  );
}

function MasterLoginForm({
  onAuth,
  onBack,
}: {
  onAuth: (u: AuthUser) => void;
  onBack: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
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
        setError(d.error ?? "Login failed");
        return;
      }
      const user = await res.json();
      onAuth(user);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-4"
    >
      <p className="text-gray-400 text-sm text-center">Sign in to your master account</p>
      <div className="space-y-3">
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 pl-10 h-12"
            autoFocus
          />
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            type={showPw ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 pl-10 pr-10 h-12"
          />
          <button
            type="button"
            onClick={() => setShowPw(!showPw)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          >
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {error && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-sm text-center">
          {error}
        </motion.p>
      )}
      <Button
        className="w-full h-12 bg-white text-black hover:bg-gray-200 font-semibold"
        onClick={handleSubmit}
        disabled={loading || !email || !password}
      >
        {loading ? "Signing in..." : "Sign In"}
      </Button>
      <Button variant="ghost" className="w-full text-gray-500 hover:text-gray-300" onClick={onBack}>
        ← Back
      </Button>
    </motion.div>
  );
}

function MasterSignupForm({
  onAuth,
  onBack,
}: {
  onAuth: (u: AuthUser) => void;
  onBack: () => void;
}) {
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
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
        setError(d.error ?? "Signup failed");
        return;
      }
      const user = await res.json();
      onAuth(user);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-4"
    >
      <p className="text-gray-400 text-sm text-center">Create your business account</p>
      <div className="space-y-3">
        <div className="relative">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Business name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 pl-10 h-12"
            autoFocus
          />
        </div>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 pl-10 h-12"
          />
        </div>
        <Input
          type="tel"
          placeholder="Phone (optional)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 h-12"
        />
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            type={showPw ? "text" : "password"}
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 pl-10 pr-10 h-12"
          />
          <button
            type="button"
            onClick={() => setShowPw(!showPw)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          >
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {error && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-sm text-center">
          {error}
        </motion.p>
      )}
      <Button
        className="w-full h-12 bg-white text-black hover:bg-gray-200 font-semibold"
        onClick={handleSubmit}
        disabled={loading || !businessName || !email || !password}
      >
        {loading ? "Creating account..." : "Create Account"}
      </Button>
      <Button variant="ghost" className="w-full text-gray-500 hover:text-gray-300" onClick={onBack}>
        ← Back
      </Button>
    </motion.div>
  );
}

function StaffLoginForm({
  onAuth,
  onBack,
}: {
  onAuth: (u: AuthUser) => void;
  onBack: () => void;
}) {
  const [businessCode, setBusinessCode] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
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
        setError(d.error ?? "Login failed");
        return;
      }
      const user = await res.json();
      onAuth(user);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-4"
    >
      <p className="text-gray-400 text-sm text-center">Enter your business code and PIN</p>
      <div className="space-y-3">
        <Input
          placeholder="Business Code (e.g. BATRA1234)"
          value={businessCode}
          onChange={(e) => setBusinessCode(e.target.value.toUpperCase())}
          className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 h-12 uppercase font-mono tracking-widest"
          autoFocus
        />
        <Input
          type="password"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 h-12 text-center text-2xl tracking-[0.5em]"
          maxLength={8}
          inputMode="numeric"
        />
      </div>
      {error && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-sm text-center">
          {error}
        </motion.p>
      )}
      <Button
        className="w-full h-12 bg-white text-black hover:bg-gray-200 font-semibold"
        onClick={handleSubmit}
        disabled={loading || !businessCode || !pin}
      >
        {loading ? "Signing in..." : "Staff Sign In"}
      </Button>
      <Button variant="ghost" className="w-full text-gray-500 hover:text-gray-300" onClick={onBack}>
        ← Back
      </Button>
    </motion.div>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch(`${API}/auth/me`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const logout = async () => {
    await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <span className="text-4xl">🦋</span>
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onAuth={(u) => setUser(u)} />;
  }

  const role: Role = user.role === "master" ? "master" : "staff";
  const businessName = user.role === "master" ? user.businessName : user.businessName;

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isMaster: role === "master",
        businessName,
        loading: false,
        logout,
        refetchUser: fetchMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function LogoutButton() {
  const { logout, user, isMaster } = useAuth();
  const displayName = user
    ? isMaster
      ? (user as MasterUser).businessName
      : (user as StaffUser).staffName
    : "";

  return (
    <button
      onClick={logout}
      className="flex items-center gap-2 px-3 py-2 w-full text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-md transition-colors"
    >
      <LogOut className="h-4 w-4 flex-shrink-0" />
      <span className="overflow-hidden whitespace-nowrap truncate max-w-[140px]">
        {displayName} · Log out
      </span>
    </button>
  );
}
