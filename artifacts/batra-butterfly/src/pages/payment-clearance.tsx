import { useState } from "react";
import { motion } from "framer-motion";
import {
  useListPaymentClearances,
  useCreatePaymentClearance,
  useApprovePaymentClearance,
  useRejectPaymentClearance,
  getListPaymentClearancesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CreditCard, Building2, Store, DollarSign, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const fmt = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
    approved: "bg-green-500/15 text-green-300 border-green-500/30",
    rejected: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  const labels: Record<string, string> = { pending: "Pending Approval", approved: "Approved", rejected: "Rejected" };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${map[status] ?? map.pending}`}>
      {labels[status] ?? status}
    </span>
  );
}

export default function PaymentClearance() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isMaster } = useAuth();

  const [amount, setAmount] = useState("");
  const [retailerName, setRetailerName] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [notes, setNotes] = useState("");

  const { data: clearances, isLoading } = useListPaymentClearances();
  const createClearance = useCreatePaymentClearance();
  const approveClearance = useApprovePaymentClearance();
  const rejectClearance = useRejectPaymentClearance();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListPaymentClearancesQueryKey() });

  const handleGenerate = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast({ title: "Invalid amount", description: "Enter a valid payment amount", variant: "destructive" });
      return;
    }
    if (!retailerName.trim()) {
      toast({ title: "Missing retailer", description: "Enter the retailer name", variant: "destructive" });
      return;
    }
    if (!vendorName.trim()) {
      toast({ title: "Missing vendor", description: "Enter the vendor name", variant: "destructive" });
      return;
    }

    try {
      const result = await createClearance.mutateAsync({
        data: { amount: amt, retailerName: retailerName.trim(), vendorName: vendorName.trim(), notes: notes.trim() || undefined },
      });
      toast({
        title: "Clearance Requested",
        description: `₹${amt.toLocaleString("en-IN")} from ${result.retailer.name} → ${result.vendor.name}. Awaiting master approval.`,
      });
      setAmount(""); setRetailerName(""); setVendorName(""); setNotes("");
      await invalidate();
    } catch (err: unknown) {
      const apiMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast({ title: "Error", description: apiMsg ?? "Failed to request clearance", variant: "destructive" });
    }
  };

  const handleApprove = (id: number) => {
    approveClearance.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Approved", description: "Retailer ledger deducted." });
        invalidate();
      },
      onError: () => toast({ title: "Failed", variant: "destructive" }),
    });
  };

  const handleReject = (id: number) => {
    rejectClearance.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Rejected", description: "Clearance request rejected." });
        invalidate();
      },
      onError: () => toast({ title: "Failed", variant: "destructive" }),
    });
  };

  const isSubmitting = createClearance.isPending;
  const canSubmit = amount && parseFloat(amount) > 0 && retailerName.trim() && vendorName.trim();

  const pending = clearances?.filter((c) => c.status === "pending") ?? [];
  const others = clearances?.filter((c) => c.status !== "pending") ?? [];

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-white tracking-tight">Payment Clearance</h1>
        <p className="text-gray-400 mt-1">Request a clearance — deducted from retailer after master approval</p>
      </motion.div>

      {/* Entry Form */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="bg-black border-white/10">
          <CardHeader className="pb-4">
            <CardTitle className="text-white flex items-center gap-2">
              <CreditCard className="h-5 w-5" /> Request Clearance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-400 text-xs uppercase tracking-wide flex items-center gap-1.5">
                  <DollarSign className="h-3 w-3" /> Payment Amount *
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₹</span>
                  <Input type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)}
                    className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 pl-7" min="0" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-400 text-xs uppercase tracking-wide flex items-center gap-1.5">
                  <Store className="h-3 w-3" /> Retailer Name *
                </Label>
                <Input placeholder="e.g. Sharma Footwear" value={retailerName} onChange={(e) => setRetailerName(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-gray-600" />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-400 text-xs uppercase tracking-wide flex items-center gap-1.5">
                  <Building2 className="h-3 w-3" /> Vendor Name *
                </Label>
                <Input placeholder="e.g. Agra Footwear Co." value={vendorName} onChange={(e) => setVendorName(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-gray-600" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-400 text-xs uppercase tracking-wide">Notes (optional)</Label>
              <Input placeholder="e.g. Q2 stock clearance" value={notes} onChange={(e) => setNotes(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-600" />
            </div>
            <div className="pt-1">
              <Button className="w-full md:w-auto bg-white text-black hover:bg-gray-200 font-semibold px-8 py-5"
                onClick={handleGenerate} disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</>
                ) : (
                  <><CreditCard className="h-4 w-4 mr-2" /> Request Clearance</>
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-600">
              Clearance requests are sent to the master for approval before the retailer's balance is deducted.
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Pending approvals — master sees action buttons */}
      {(isMaster || pending.length > 0) && !isLoading && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-yellow-400" /> Pending Approval
            {pending.length > 0 && (
              <span className="ml-2 bg-yellow-500/20 text-yellow-300 text-xs px-2 py-0.5 rounded-full">{pending.length}</span>
            )}
          </h2>

          {pending.length === 0 ? (
            <Card className="bg-black border-white/10">
              <CardContent className="py-8 text-center text-gray-500 text-sm">No pending clearances</CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {pending.map((c, i) => (
                <motion.div key={c.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                  <Card className="bg-black border-yellow-500/20">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                            <CreditCard className="h-4 w-4 text-yellow-400" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 text-sm flex-wrap">
                              <span className="text-white font-medium">{c.retailerName ?? "—"}</span>
                              <span className="text-gray-600">→</span>
                              <span className="text-gray-300">{c.vendorName ?? "—"}</span>
                              <StatusBadge status={c.status} />
                            </div>
                            {c.notes && <p className="text-xs text-gray-500 mt-0.5">{c.notes}</p>}
                            <p className="text-xs text-gray-600 mt-0.5">
                              {new Date(c.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-lg font-bold text-white">{fmt(c.amount)}</p>
                          {isMaster && (
                            <div className="flex gap-2">
                              <Button size="sm" className="bg-green-600 hover:bg-green-500 text-white"
                                onClick={() => handleApprove(c.id)}
                                disabled={approveClearance.isPending || rejectClearance.isPending}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                              </Button>
                              <Button size="sm" variant="ghost"
                                className="border border-red-500/30 text-red-400 hover:bg-red-500/10"
                                onClick={() => handleReject(c.id)}
                                disabled={approveClearance.isPending || rejectClearance.isPending}>
                                <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* History */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-400" /> History
        </h2>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
          </div>
        ) : others.length === 0 ? (
          <Card className="bg-black border-white/10">
            <CardContent className="py-12 text-center text-gray-500">No processed clearances yet</CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {others.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className="bg-black border-white/10 hover:border-white/20 transition-colors">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${c.status === "approved" ? "bg-green-500/10" : "bg-red-500/10"}`}>
                          {c.status === "approved"
                            ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                            : <XCircle className="h-4 w-4 text-red-400" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 text-sm flex-wrap">
                            <span className="text-white font-medium">{c.retailerName ?? "—"}</span>
                            <span className="text-gray-600">→</span>
                            <span className="text-gray-300">{c.vendorName ?? "—"}</span>
                            <StatusBadge status={c.status} />
                          </div>
                          {c.notes && <p className="text-xs text-gray-500 mt-0.5">{c.notes}</p>}
                          <p className="text-xs text-gray-600 mt-0.5">
                            {new Date(c.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                            {c.approvedAt && ` · ${c.status === "approved" ? "Approved" : "Rejected"} ${new Date(c.approvedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`}
                          </p>
                        </div>
                      </div>
                      <p className="text-lg font-bold text-white">{fmt(c.amount)}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
