import { useRef, useState, useCallback, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetStaffSalary,
  getGetStaffSalaryQueryKey,
  useGetStaffAttendanceSummary,
  getGetStaffAttendanceSummaryQueryKey,
  useListStaffLoans,
  getListStaffLoansQueryKey,
  useCreateStaffLoan,
  useClearStaffLoan,
  useListStaffPayments,
  getListStaffPaymentsQueryKey,
  useCreateStaffPayment,
  useApproveStaffPayment,
  useRejectStaffPayment,
  useEnrollStaffFace,
  type StaffLoan,
  type StaffPayment,
} from "@workspace/api-client-react";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Wallet,
  TrendingUp,
  TrendingDown,
  CalendarDays,
  HandCoins,
  ScanFace,
  Camera,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Plus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { loadFaceModels, computeDescriptor } from "@/lib/face";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function StaffDetail() {
  const { id } = useParams<{ id: string }>();
  const staffId = parseInt(id ?? "0", 10);
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isMaster } = useAuth();

  const params = { month, year };

  const { data: salary, isLoading: salaryLoading } = useGetStaffSalary(staffId, params, {
    query: { queryKey: getGetStaffSalaryQueryKey(staffId, params), enabled: !!staffId },
  });
  const { data: summary } = useGetStaffAttendanceSummary(staffId, params, {
    query: { queryKey: getGetStaffAttendanceSummaryQueryKey(staffId, params), enabled: !!staffId },
  });
  const { data: loans } = useListStaffLoans(staffId, {
    query: { queryKey: getListStaffLoansQueryKey(staffId), enabled: !!staffId },
  });
  const { data: allPayments } = useListStaffPayments(
    {},
    { query: { queryKey: getListStaffPaymentsQueryKey({}) } },
  );

  const createLoan = useCreateStaffLoan();
  const clearLoan = useClearStaffLoan();
  const createPayment = useCreateStaffPayment();
  const approvePayment = useApproveStaffPayment();
  const rejectPayment = useRejectStaffPayment();
  const enrollFace = useEnrollStaffFace();

  const [loanAmount, setLoanAmount] = useState("");
  const [loanNote, setLoanNote] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");

  // Face enrollment camera
  const [cameraOn, setCameraOn] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const payments: StaffPayment[] = (allPayments ?? []).filter((p) => p.staffId === staffId);
  const loanList: StaffLoan[] = loans ?? [];

  const refetchSalary = () => {
    queryClient.invalidateQueries({ queryKey: getGetStaffSalaryQueryKey(staffId, params) });
  };

  const startCamera = async () => {
    try {
      loadFaceModels().then(() => setModelsReady(true));
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
      streamRef.current = stream;
      setCameraOn(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch {
      toast({ variant: "destructive", title: "Camera unavailable", description: "Allow camera access to enroll." });
    }
  };

  const capturePhoto = (): string | undefined => {
    const video = videoRef.current;
    if (!video) return undefined;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  };

  const handleEnroll = async () => {
    if (!videoRef.current) return;
    setEnrolling(true);
    try {
      const { descriptor, detected } = await computeDescriptor(videoRef.current);
      if (!detected) {
        toast({ variant: "destructive", title: "No face detected", description: "Center the face and retry." });
        return;
      }
      const photoUrl = capturePhoto();
      enrollFace.mutate(
        { id: staffId, data: { descriptor, photoUrl } },
        {
          onSuccess: () => {
            toast({ title: "Face enrolled", description: "This staff can now check in via face scan." });
            stopCamera();
          },
          onError: (err) =>
            toast({ variant: "destructive", title: "Enroll failed", description: (err as Error)?.message || "Try again." }),
        },
      );
    } finally {
      setEnrolling(false);
    }
  };

  const handleAddLoan = () => {
    const amount = parseFloat(loanAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ variant: "destructive", title: "Enter a valid amount" });
      return;
    }
    createLoan.mutate(
      { data: { staffId, amount, note: loanNote || undefined } },
      {
        onSuccess: () => {
          setLoanAmount("");
          setLoanNote("");
          queryClient.invalidateQueries({ queryKey: getListStaffLoansQueryKey(staffId) });
          refetchSalary();
          toast({ title: "Loan recorded" });
        },
        onError: (err) =>
          toast({ variant: "destructive", title: "Failed", description: (err as Error)?.message }),
      },
    );
  };

  const handleClearLoan = (loanId: number) => {
    clearLoan.mutate(
      { id: loanId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListStaffLoansQueryKey(staffId) });
          refetchSalary();
          toast({ title: "Loan cleared" });
        },
        onError: (err) =>
          toast({ variant: "destructive", title: "Failed", description: (err as Error)?.message }),
      },
    );
  };

  const handleRequestPayment = () => {
    const amount = parseFloat(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ variant: "destructive", title: "Enter a valid amount" });
      return;
    }
    createPayment.mutate(
      { data: { staffId, amount, note: payNote || undefined } },
      {
        onSuccess: () => {
          setPayAmount("");
          setPayNote("");
          queryClient.invalidateQueries({ queryKey: getListStaffPaymentsQueryKey({}) });
          refetchSalary();
          toast({ title: "Payment requested", description: "Awaiting master approval." });
        },
        onError: (err) =>
          toast({ variant: "destructive", title: "Failed", description: (err as Error)?.message }),
      },
    );
  };

  const handleApprove = (paymentId: number) => {
    approvePayment.mutate(
      { id: paymentId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListStaffPaymentsQueryKey({}) });
          refetchSalary();
          toast({ title: "Payment approved" });
        },
        onError: (err) =>
          toast({ variant: "destructive", title: "Failed", description: (err as Error)?.message }),
      },
    );
  };

  const handleReject = (paymentId: number) => {
    rejectPayment.mutate(
      { id: paymentId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListStaffPaymentsQueryKey({}) });
          refetchSalary();
          toast({ title: "Payment rejected" });
        },
        onError: (err) =>
          toast({ variant: "destructive", title: "Failed", description: (err as Error)?.message }),
      },
    );
  };

  const staffName = salary?.staffName ?? "Staff";
  const years = [now.getFullYear(), now.getFullYear() - 1];

  return (
    <div className="space-y-6 max-w-[1100px] mx-auto">
      <div>
        <Link
          href="/staff"
          className="inline-flex items-center text-sm text-gray-400 hover:text-white mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Staff
        </Link>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{staffName}</h1>
            <p className="text-gray-400 mt-1">Salary overview, attendance & payments</p>
          </div>
          <div className="flex gap-2">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-950 border-white/10 text-white">
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-950 border-white/10 text-white">
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Salary overview */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="bg-black border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" /> Salary Overview
            </CardTitle>
            <CardDescription className="text-gray-400">
              {MONTHS[month - 1]} {year} · commission ₹1 per invoiced item
            </CardDescription>
          </CardHeader>
          <CardContent>
            {salaryLoading ? (
              <div className="flex items-center justify-center py-8 text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : salary ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-white/10 p-4">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3 text-green-400" /> Earnings
                    </p>
                    <p className="text-xl font-bold text-green-400 mt-1">{formatCurrency(salary.earnings)}</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">{salary.totalItems} items</p>
                  </div>
                  <div className="rounded-lg border border-white/10 p-4">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <TrendingDown className="h-3 w-3 text-red-400" /> Deductions
                    </p>
                    <p className="text-xl font-bold text-red-400 mt-1">{formatCurrency(salary.deductions)}</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">loans + approved payouts</p>
                  </div>
                  <div className="rounded-lg border border-white/10 p-4">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="h-3 w-3 text-yellow-400" /> Pending
                    </p>
                    <p className="text-xl font-bold text-yellow-400 mt-1">{formatCurrency(salary.paymentsPending)}</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">awaiting approval</p>
                  </div>
                  <div className="rounded-lg border border-white/20 bg-white/[0.03] p-4">
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <Wallet className="h-3 w-3" /> Net Payable
                    </p>
                    <p className="text-xl font-bold text-white mt-1">{formatCurrency(salary.netPayable)}</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">earnings − deductions</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-gray-500 pt-1">
                  <span>Present: <span className="text-white">{salary.presentDays}</span></span>
                  <span>Half days: <span className="text-white">{salary.halfDays}</span></span>
                  <span>Payable days: <span className="text-white">{salary.payableDays}</span></span>
                  <span>Loan outstanding: <span className="text-white">{formatCurrency(salary.loanOutstanding)}</span></span>
                  <span>Approved payouts: <span className="text-white">{formatCurrency(salary.paymentsApproved)}</span></span>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No salary data.</p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Attendance summary */}
        <Card className="bg-black border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4" /> Attendance — {MONTHS[month - 1]}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary ? (
              <>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded-lg border border-white/10 p-3 text-center">
                    <p className="text-lg font-bold text-green-400">{summary.present}</p>
                    <p className="text-[10px] text-gray-500">Present</p>
                  </div>
                  <div className="rounded-lg border border-white/10 p-3 text-center">
                    <p className="text-lg font-bold text-yellow-400">{summary.halfDay}</p>
                    <p className="text-[10px] text-gray-500">Half Day</p>
                  </div>
                  <div className="rounded-lg border border-white/10 p-3 text-center">
                    <p className="text-lg font-bold text-red-400">{summary.absent}</p>
                    <p className="text-[10px] text-gray-500">Absent</p>
                  </div>
                </div>
                {summary.days.length > 0 ? (
                  <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                    {summary.days.map((d) => (
                      <div key={d.date} className="flex items-center justify-between text-xs py-1.5 border-b border-white/5 last:border-0">
                        <span className="text-gray-400">
                          {new Date(d.date + "T00:00:00").toLocaleDateString("en-IN", {
                            weekday: "short", day: "numeric", month: "short",
                          })}
                        </span>
                        <span className={
                          d.status === "present" ? "text-green-400"
                            : d.status === "half_day" ? "text-yellow-400" : "text-red-400"
                        }>
                          {d.status === "half_day" ? "Half Day" : d.status.charAt(0).toUpperCase() + d.status.slice(1)}
                          {d.checkInTime ? ` · ${new Date(d.checkInTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-600 text-center py-4">No attendance recorded this month.</p>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center py-8 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Face enrollment */}
        <Card className="bg-black border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScanFace className="h-4 w-4" /> Face Enrollment
            </CardTitle>
            <CardDescription className="text-gray-400">
              Register this staff's face for attendance check-in
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-white/[0.03] border border-white/10 flex items-center justify-center">
              {cameraOn ? (
                <video ref={videoRef} playsInline muted className="w-full h-full object-cover -scale-x-100" />
              ) : (
                <div className="flex flex-col items-center text-gray-600">
                  <Camera className="h-8 w-8 mb-2 text-white/10" />
                  <p className="text-xs">Camera is off</p>
                </div>
              )}
              {enrolling && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-white" />
                </div>
              )}
            </div>
            {!cameraOn ? (
              <Button onClick={startCamera} variant="outline" className="w-full border-white/10 text-white hover:bg-white/5" data-testid="button-enroll-camera">
                <Camera className="mr-2 h-4 w-4" /> Start Camera
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  onClick={handleEnroll}
                  disabled={enrolling || enrollFace.isPending || !modelsReady}
                  className="flex-1 bg-white text-black hover:bg-gray-200"
                  data-testid="button-enroll-face"
                >
                  {!modelsReady ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</>
                  ) : enrolling || enrollFace.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enrolling…</>
                  ) : (
                    <><ScanFace className="mr-2 h-4 w-4" /> Capture & Enroll</>
                  )}
                </Button>
                <Button variant="outline" onClick={stopCamera} className="border-white/10 text-white hover:bg-white/5">
                  Stop
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Loans */}
        <Card className="bg-black border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HandCoins className="h-4 w-4" /> Loans / Advances
            </CardTitle>
            <CardDescription className="text-gray-400">
              Active loans are deducted from net payable
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Amount"
                value={loanAmount}
                onChange={(e) => setLoanAmount(e.target.value)}
                className="bg-white/5 border-white/10 text-white w-28"
                data-testid="input-loan-amount"
              />
              <Input
                placeholder="Note (optional)"
                value={loanNote}
                onChange={(e) => setLoanNote(e.target.value)}
                className="bg-white/5 border-white/10 text-white flex-1"
                data-testid="input-loan-note"
              />
              <Button
                onClick={handleAddLoan}
                disabled={createLoan.isPending}
                className="bg-white text-black hover:bg-gray-200"
                data-testid="button-add-loan"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {loanList.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-4">No loans recorded.</p>
            ) : (
              <div className="space-y-2">
                {loanList.map((loan) => (
                  <div key={loan.id} className="flex items-center justify-between p-2.5 rounded-lg border border-white/10 bg-white/[0.02]">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{formatCurrency(loan.amount)}</p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {new Date(loan.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        {loan.note ? ` · ${loan.note}` : ""}
                      </p>
                    </div>
                    {loan.status === "active" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-white/10 text-white hover:bg-white/5 text-xs"
                        onClick={() => handleClearLoan(loan.id)}
                        disabled={clearLoan.isPending}
                        data-testid={`button-clear-loan-${loan.id}`}
                      >
                        Clear
                      </Button>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">Cleared</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payments / clearance */}
        <Card className="bg-black border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4" /> Payment Clearance
            </CardTitle>
            <CardDescription className="text-gray-400">
              {isMaster ? "Approve or reject payout requests" : "Request a payout (needs master approval)"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Amount"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="bg-white/5 border-white/10 text-white w-28"
                data-testid="input-payment-amount"
              />
              <Input
                placeholder="Note (optional)"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                className="bg-white/5 border-white/10 text-white flex-1"
                data-testid="input-payment-note"
              />
              <Button
                onClick={handleRequestPayment}
                disabled={createPayment.isPending}
                className="bg-white text-black hover:bg-gray-200"
                data-testid="button-request-payment"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {payments.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-4">No payment requests.</p>
            ) : (
              <div className="space-y-2">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg border border-white/10 bg-white/[0.02]">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{formatCurrency(p.amount)}</p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {new Date(p.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        {p.note ? ` · ${p.note}` : ""}
                      </p>
                    </div>
                    {p.status === "pending" ? (
                      isMaster ? (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-green-400 hover:bg-green-500/10"
                            onClick={() => handleApprove(p.id)}
                            disabled={approvePayment.isPending}
                            data-testid={`button-approve-payment-${p.id}`}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-red-400 hover:bg-red-500/10"
                            onClick={() => handleReject(p.id)}
                            disabled={rejectPayment.isPending}
                            data-testid={`button-reject-payment-${p.id}`}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">Pending</span>
                      )
                    ) : (
                      <span className={`text-xs px-2 py-1 rounded-full border ${
                        p.status === "approved"
                          ? "bg-green-500/15 text-green-400 border-green-500/20"
                          : "bg-red-500/15 text-red-400 border-red-500/20"
                      }`}>
                        {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
