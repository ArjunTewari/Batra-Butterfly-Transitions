import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  Mail,
  Phone,
  Key,
  Shield,
  Cpu,
  BarChart3,
  Eye,
  EyeOff,
  Save,
  Trash2,
  Lock,
  Plus,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";

const API = "/api";

interface AccountData {
  id: number;
  email: string;
  businessName: string;
  businessCode: string;
  phone: string | null;
  createdAt: string;
}

interface StaffItem {
  id: number;
  name: string;
  commissionRate: number;
  hasPin: boolean;
  createdAt: string;
}

interface AiUsage {
  month: number;
  year: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCalls: number;
  totalCostUsd: number;
  monthlyCostUsd: number;
  monthlyCostInr: number;
  byFeature: {
    feature: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    calls: number;
  }[];
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatInr(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        {title}
      </h2>
      <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
        {children}
      </div>
    </div>
  );
}

export default function AccountPage() {
  const { isMaster, refetchUser } = useAuth();

  const [account, setAccount] = useState<AccountData | null>(null);
  const [staff, setStaff] = useState<StaffItem[]>([]);
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(true);

  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");

  const [pinMap, setPinMap] = useState<Record<number, string>>({});
  const [pinMsg, setPinMsg] = useState<Record<number, string>>({});

  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffCommission, setNewStaffCommission] = useState("5");
  const [newStaffPin, setNewStaffPin] = useState("");
  const [addingStaff, setAddingStaff] = useState(false);
  const [addStaffMsg, setAddStaffMsg] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`${API}/account`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${API}/account/staff`, { credentials: "include" }).then((r) =>
        r.json(),
      ),
      fetch(`${API}/account/ai-usage`, { credentials: "include" }).then((r) =>
        r.json(),
      ),
    ])
      .then(([acc, s, ai]) => {
        setAccount(acc);
        setBusinessName(acc.businessName ?? "");
        setPhone(acc.phone ?? "");
        setStaff(s);
        setAiUsage(ai);
        setLoadingAccount(false);
      })
      .catch(() => setLoadingAccount(false));
  }, []);

  const saveProfile = async () => {
    setSavingProfile(true);
    setProfileMsg("");
    const body: Record<string, string> = {};
    if (businessName !== account?.businessName)
      body.businessName = businessName;
    if (phone !== (account?.phone ?? "")) body.phone = phone;
    if (newPassword) {
      body.currentPassword = currentPassword;
      body.newPassword = newPassword;
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
        setProfileMsg(data.error ?? "Save failed");
        return;
      }
      setAccount(data);
      setBusinessName(data.businessName);
      setPhone(data.phone ?? "");
      setCurrentPassword("");
      setNewPassword("");
      setProfileMsg("Saved successfully!");
      await refetchUser();
    } catch {
      setProfileMsg("Network error.");
    } finally {
      setSavingProfile(false);
    }
  };

  const setPin = async (staffId: number) => {
    const pin = pinMap[staffId];
    if (!pin || pin.length < 4) {
      setPinMsg((m) => ({ ...m, [staffId]: "PIN must be at least 4 digits" }));
      return;
    }
    setPinMsg((m) => ({ ...m, [staffId]: "" }));
    try {
      const res = await fetch(`${API}/account/staff/${staffId}/pin`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPinMsg((m) => ({ ...m, [staffId]: data.error ?? "Failed" }));
        return;
      }
      setPinMap((p) => ({ ...p, [staffId]: "" }));
      setPinMsg((m) => ({ ...m, [staffId]: "PIN set!" }));
      setStaff((prev) =>
        prev.map((s) => (s.id === staffId ? { ...s, hasPin: true } : s)),
      );
    } catch {
      setPinMsg((m) => ({ ...m, [staffId]: "Network error" }));
    }
  };

  const addStaff = async () => {
    if (!newStaffName.trim()) {
      setAddStaffMsg("Name is required");
      return;
    }
    setAddingStaff(true);
    setAddStaffMsg("");
    try {
      const res = await fetch(`${API}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: newStaffName.trim(),
          commissionRate: parseFloat(newStaffCommission) || 5,
        }),
      });
      const created = await res.json();
      if (!res.ok) {
        setAddStaffMsg(created.error ?? "Failed to create staff");
        return;
      }
      if (newStaffPin && newStaffPin.length >= 4) {
        await fetch(`${API}/account/staff/${created.id}/pin`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ pin: newStaffPin }),
        });
      }
      const staffRes = await fetch(`${API}/account/staff`, {
        credentials: "include",
      });
      setStaff(await staffRes.json());
      setNewStaffName("");
      setNewStaffCommission("5");
      setNewStaffPin("");
      setShowAddStaff(false);
      setAddStaffMsg("Staff member added!");
    } catch {
      setAddStaffMsg("Network error");
    } finally {
      setAddingStaff(false);
    }
  };

  const removePin = async (staffId: number) => {
    try {
      const res = await fetch(`${API}/account/staff/${staffId}/pin`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) return;
      setPinMsg((m) => ({ ...m, [staffId]: "PIN removed" }));
      setStaff((prev) =>
        prev.map((s) => (s.id === staffId ? { ...s, hasPin: false } : s)),
      );
    } catch {}
  };

  if (loadingAccount) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading account...</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 max-w-2xl"
    >
      <div>
        <h1 className="text-2xl font-bold text-white">Account Settings</h1>
        <p className="text-gray-400 text-sm mt-1">
          Manage your business profile, staff credentials, and AI usage
        </p>
      </div>

      {/* Business Code */}
      {account && (
        <div className="bg-white/5 border border-yellow-500/20 rounded-xl p-4 flex items-center gap-4">
          <Shield className="h-8 w-8 text-yellow-400 flex-shrink-0" />
          <div>
            <p className="text-xs text-yellow-400 font-medium uppercase tracking-wider">
              Business Code
            </p>
            <p className="text-white font-mono text-2xl font-bold tracking-widest">
              {account.businessCode}
            </p>
            <p className="text-gray-500 text-xs mt-0.5">
              Share this code with staff so they can log in
            </p>
          </div>
        </div>
      )}

      {/* Profile */}
      {isMaster && (
        <Section title="Business Profile">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400">Business Name</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 pl-10"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  value={account?.email ?? ""}
                  disabled
                  className="bg-white/5 border-white/10 text-gray-500 pl-10"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400">Phone</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 pl-10"
                  placeholder="Phone number"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 pt-4 space-y-3">
            <p className="text-xs text-gray-400 font-medium">
              Change Password (optional)
            </p>
            <Input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="bg-white/10 border-white/20 text-white placeholder:text-gray-500"
            />
            <div className="relative">
              <Input
                type={showNewPw ? "text" : "password"}
                placeholder="New password (min 6 chars)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNewPw(!showNewPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showNewPw ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {profileMsg && (
            <p
              className={`text-sm ${profileMsg.includes("!") || profileMsg.includes("success") ? "text-green-400" : "text-red-400"}`}
            >
              {profileMsg}
            </p>
          )}

          <Button
            className="bg-white text-black hover:bg-gray-200 font-semibold"
            onClick={saveProfile}
            disabled={savingProfile}
          >
            <Save className="h-4 w-4 mr-2" />
            {savingProfile ? "Saving..." : "Save Changes"}
          </Button>
        </Section>
      )}

      {/* Staff PINs */}
      {isMaster && (
        <Section title="Staff Credentials">
          {/* Add new staff */}
          <div className="pb-4 border-b border-white/10">
            <Button
              variant="outline"
              size="sm"
              className="border-white/20 text-gray-300 hover:bg-white/5 hover:text-white"
              onClick={() => {
                setShowAddStaff(!showAddStaff);
                setAddStaffMsg("");
              }}
            >
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              Add New Staff Member
            </Button>
            <AnimatePresence>
              {showAddStaff && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 space-y-3">
                    <Input
                      placeholder="Full name"
                      value={newStaffName}
                      onChange={(e) => setNewStaffName(e.target.value)}
                      className="bg-white/10 border-white/20 text-white placeholder:text-gray-500"
                    />
                    <div className="flex gap-2">
                      <div className="flex-1 space-y-1">
                        <label className="text-xs text-gray-400">
                          Commission %
                        </label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={newStaffCommission}
                          onChange={(e) =>
                            setNewStaffCommission(e.target.value)
                          }
                          className="bg-white/10 border-white/20 text-white"
                        />
                      </div>
                      <div className="flex-1 space-y-1">
                        <label className="text-xs text-gray-400">
                          PIN (4-8 digits, optional)
                        </label>
                        <Input
                          type="password"
                          placeholder="PIN"
                          value={newStaffPin}
                          onChange={(e) =>
                            setNewStaffPin(
                              e.target.value.replace(/\D/g, "").slice(0, 8),
                            )
                          }
                          className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 text-center tracking-widest font-mono"
                          inputMode="numeric"
                          maxLength={8}
                        />
                      </div>
                    </div>
                    {addStaffMsg && (
                      <p
                        className={`text-xs ${addStaffMsg.includes("!") ? "text-green-400" : "text-red-400"}`}
                      >
                        {addStaffMsg}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-white text-black hover:bg-gray-200 font-semibold"
                        onClick={addStaff}
                        disabled={addingStaff || !newStaffName.trim()}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        {addingStaff ? "Adding..." : "Add Staff"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-gray-500"
                        onClick={() => setShowAddStaff(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {addStaffMsg && !showAddStaff && (
              <p className="text-xs text-green-400 mt-2">{addStaffMsg}</p>
            )}
          </div>

          {staff.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No staff members yet. Add one above.
            </p>
          ) : (
            <div className="space-y-4">
              {staff.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-col gap-2 pb-4 border-b border-white/5 last:border-0"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium text-sm">{s.name}</p>
                      <p className="text-gray-500 text-xs">
                        {s.commissionRate}% commission
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {s.hasPin ? (
                        <span className="text-xs bg-green-500/15 text-green-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Key className="h-3 w-3" /> PIN Set
                        </span>
                      ) : (
                        <span className="text-xs bg-white/5 text-gray-500 px-2 py-0.5 rounded-full">
                          No PIN
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder="New PIN (4-8 digits)"
                      value={pinMap[s.id] ?? ""}
                      onChange={(e) =>
                        setPinMap((p) => ({
                          ...p,
                          [s.id]: e.target.value.replace(/\D/g, "").slice(0, 8),
                        }))
                      }
                      className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 h-9 text-sm max-w-[180px] text-center tracking-widest font-mono"
                      inputMode="numeric"
                      maxLength={8}
                    />
                    <Button
                      size="sm"
                      className="bg-white text-black hover:bg-gray-200 h-9 px-3 text-xs font-semibold"
                      onClick={() => setPin(s.id)}
                      disabled={!pinMap[s.id]}
                    >
                      <Lock className="h-3 w-3 mr-1" />
                      Set PIN
                    </Button>
                    {s.hasPin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-500/30 text-red-400 hover:bg-red-500/10 h-9 px-3 text-xs"
                        onClick={() => removePin(s.id)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Remove
                      </Button>
                    )}
                  </div>
                  {pinMsg[s.id] && (
                    <p
                      className={`text-xs ${pinMsg[s.id] === "PIN set!" || pinMsg[s.id] === "PIN removed" ? "text-green-400" : "text-red-400"}`}
                    >
                      {pinMsg[s.id]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* AI Usage */}
      <Section title="AI Usage & Cost">
        {aiUsage ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Cpu className="h-4 w-4" />
              <span>
                {MONTHS[aiUsage.month - 1]} {aiUsage.year} — Current Month
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">AI Calls</p>
                <p className="text-2xl font-bold text-white">
                  {aiUsage.totalCalls.toLocaleString()}
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">Monthly Cost</p>
                <p className="text-2xl font-bold text-white">
                  {formatInr(aiUsage.monthlyCostInr)}
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">Input Tokens</p>
                <p className="text-lg font-bold text-white">
                  {(aiUsage.totalInputTokens / 1000).toFixed(1)}K
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">Output Tokens</p>
                <p className="text-lg font-bold text-white">
                  {(aiUsage.totalOutputTokens / 1000).toFixed(1)}K
                </p>
              </div>
            </div>

            {aiUsage.byFeature.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                  <BarChart3 className="h-3.5 w-3.5" /> By Feature
                </p>
                <div className="space-y-2">
                  {aiUsage.byFeature.map((f) => (
                    <div
                      key={f.feature}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-gray-300 capitalize">
                        {f.feature.replace(/_/g, " ")}
                      </span>
                      <div className="flex gap-4 text-gray-500 text-xs">
                        <span>{f.calls} calls</span>
                        <span>${f.costUsd.toFixed(4)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {aiUsage.totalCalls === 0 && (
              <p className="text-gray-600 text-sm text-center py-4">
                No AI calls this month yet.
              </p>
            )}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Loading usage data...</p>
        )}
      </Section>
    </motion.div>
  );
}
