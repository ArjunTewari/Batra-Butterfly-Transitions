import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSupplier,
  useAnalyzeSupplierBill,
  useCreateSupplierBill,
  useConfirmSupplierBill,
  getGetSupplierQueryKey,
} from "@workspace/api-client-react";
import type { SupplierBillWithItems, SupplierBillAnalysisResult } from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Image as ImageIcon,
  Package,
  Truck,
  Phone,
  MapPin,
  Receipt,
  ChevronDown,
  ChevronUp,
  Link2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

function BillCard({ bill, onConfirm, confirming }: { bill: SupplierBillWithItems; onConfirm: () => void; confirming: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isDraft = bill.status === "draft";
  const { isMaster } = useAuth();

  return (
    <Card className="bg-black border-white/10">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Receipt className="h-5 w-5 text-gray-400" />
            <div>
              <p className="font-semibold text-white">{bill.billNumber}</p>
              <p className="text-xs text-gray-400">{new Date(bill.billDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-semibold text-white">{formatCurrency(bill.totalAmount)}</p>
              <p className="text-xs text-gray-400">{bill.items.length} items</p>
            </div>
            <Badge
              className={
                bill.status === "confirmed"
                  ? "bg-green-500/10 text-green-400 border-green-500/20"
                  : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
              }
            >
              {bill.status}
            </Badge>
            {isDraft && (
              isMaster ? (
                <Button size="sm" onClick={onConfirm} disabled={confirming} className="gap-1">
                  {confirming ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  Confirm
                </Button>
              ) : (
                <span className="text-xs px-2.5 py-1 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 whitespace-nowrap">
                  📨 Sent for Approval
                </span>
              )
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 space-y-2">
                <div className="grid grid-cols-4 gap-2 text-xs text-gray-500 uppercase tracking-wider px-2">
                  <span>Article</span>
                  <span>Product</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Total</span>
                </div>
                {bill.items.map((item) => (
                  <div key={item.id} className="grid grid-cols-4 gap-2 text-sm bg-white/5 rounded-lg px-3 py-2 items-center">
                    <span className="font-mono text-xs text-gray-300">{item.articleCode}</span>
                    <span className="text-white truncate">{item.productName}</span>
                    <span className="text-right text-gray-300">{item.quantity}</span>
                    <span className="text-right text-white">{formatCurrency(item.totalPrice)}</span>
                  </div>
                ))}
                <div className="flex justify-end pt-1 pr-3">
                  <p className="text-sm font-semibold text-white">
                    Total: {formatCurrency(bill.totalAmount)}
                  </p>
                </div>
              </div>
              {bill.notes && (
                <p className="text-xs text-gray-500 mt-2 px-2">Note: {bill.notes}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

export default function SupplierDetail() {
  const { id } = useParams<{ id: string }>();
  const supplierId = parseInt(id ?? "0", 10);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: supplier, isLoading } = useGetSupplier(supplierId);
  const analyzeImage = useAnalyzeSupplierBill();
  const createBill = useCreateSupplierBill();
  const confirmBill = useConfirmSupplierBill();

  const [scanOpen, setScanOpen] = useState(false);
  const [scanStep, setScanStep] = useState<"upload" | "review">("upload");
  const [scanResult, setScanResult] = useState<SupplierBillAnalysisResult | null>(null);
  const [scanImage, setScanImage] = useState<string | null>(null);
  const [editedItems, setEditedItems] = useState<Array<{
    articleCode: string; productName: string; quantity: number; unitPrice: number;
  }>>([]);
  const [billNote, setBillNote] = useState("");
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      setScanImage(dataUrl);

      try {
        const result = await analyzeImage.mutateAsync({
          id: supplierId,
          data: { imageBase64: base64, mimeType: file.type },
        });
        setScanResult(result);
        const items = result.items ?? [];
        setEditedItems(items.map((it) => ({
          articleCode: it.articleCode ?? "",
          productName: it.productName,
          quantity: it.quantity,
          unitPrice: it.unitPrice ?? 0,
        })));
        setScanStep("review");
      } catch {
        toast({ title: "Failed to analyze image", variant: "destructive" });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmBill = async (billId: number) => {
    setConfirmingId(billId);
    try {
      const result = await confirmBill.mutateAsync({ id: billId });
      await queryClient.invalidateQueries({ queryKey: getGetSupplierQueryKey(supplierId) });
      toast({
        title: "Bill confirmed",
        description: `${(result as { stockUpdates: unknown[] }).stockUpdates.length} product(s) restocked`,
      });
    } catch {
      toast({ title: "Failed to confirm bill", variant: "destructive" });
    } finally {
      setConfirmingId(null);
    }
  };

  const handleCreateBill = async () => {
    if (!scanResult || editedItems.length === 0) return;
    try {
      await createBill.mutateAsync({
        id: supplierId,
        data: {
          billNumber: scanResult.billNumber ?? `BILL-${Date.now()}`,
          billDate: scanResult.date ?? new Date().toISOString().split("T")[0],
          notes: billNote || undefined,
          items: editedItems.map((it) => ({
            articleCode: it.articleCode || "UNKNOWN",
            productName: it.productName,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
          })),
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetSupplierQueryKey(supplierId) });
      toast({ title: "Bill saved as draft" });
      setScanOpen(false);
      setScanStep("upload");
      setScanResult(null);
      setScanImage(null);
      setEditedItems([]);
      setBillNote("");
    } catch {
      toast({ title: "Failed to save bill", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-white/5 rounded animate-pulse" />
        <div className="h-32 bg-white/5 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="text-center py-20 text-gray-500">
        <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p>Supplier not found</p>
        <Link href="/suppliers">
          <Button variant="ghost" className="mt-4">Back to Suppliers</Button>
        </Link>
      </div>
    );
  }

  const confirmedBills = supplier.bills.filter((b) => b.status === "confirmed");
  const draftBills = supplier.bills.filter((b) => b.status === "draft");
  const totalSpend = confirmedBills.reduce((s, b) => s + b.totalAmount, 0);
  const matchedImages = supplier.stockImages.filter((sm) => sm.billId !== null);
  const unmatchedImages = supplier.stockImages.filter((sm) => sm.billId === null);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/suppliers">
          <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{supplier.name}</h1>
          <div className="flex items-center gap-4 mt-1">
            {supplier.phone && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Phone className="h-3 w-3" /> {supplier.phone}
              </span>
            )}
            {supplier.address && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {supplier.address}
              </span>
            )}
            {supplier.gstin && (
              <span className="text-xs text-gray-500 font-mono">GSTIN: {supplier.gstin}</span>
            )}
          </div>
        </div>
        <Button onClick={() => { setScanStep("upload"); setScanOpen(true); }} className="gap-2">
          <Camera className="h-4 w-4" /> Scan Bill
        </Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="bg-black border-white/10">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Total Bills</p>
            <p className="text-2xl font-bold">{supplier.bills.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-black border-white/10">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Confirmed</p>
            <p className="text-2xl font-bold text-green-400">{confirmedBills.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-black border-white/10">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Drafts</p>
            <p className="text-2xl font-bold text-yellow-400">{draftBills.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-black border-white/10">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Total Spend</p>
            <p className="text-2xl font-bold">{formatCurrency(totalSpend)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Stock Concurrency panel */}
      {supplier.stockImages.length > 0 && (
        <Card className="bg-black border-white/10 mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4 text-blue-400" />
              Stock–Bill Concurrency
              <Badge className="ml-2 bg-blue-500/10 text-blue-400 border-blue-500/20">
                {matchedImages.length}/{supplier.stockImages.length} matched
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {supplier.stockImages.map((sm) => (
                <div key={sm.stockMovementId} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2">
                  {sm.imageUrl ? (
                    <img src={sm.imageUrl} alt="" className="h-10 w-10 rounded object-cover flex-shrink-0" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-white/5 flex items-center justify-center flex-shrink-0">
                      <Package className="h-4 w-4 text-gray-600" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{sm.productName}</p>
                    <p className="text-xs text-gray-400 font-mono">{sm.articleCode} · qty {sm.quantity} · {new Date(sm.date).toLocaleDateString("en-IN")}</p>
                  </div>
                  {sm.billId ? (
                    <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-xs gap-1">
                      <CheckCircle2 className="h-3 w-3" /> {sm.billNumber}
                    </Badge>
                  ) : (
                    <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 text-xs">
                      Unmatched
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bills */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Purchase Bills</h2>
        {supplier.bills.length === 0 ? (
          <div className="text-center py-12 text-gray-500 border border-white/5 rounded-xl">
            <Receipt className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No bills yet. Scan a supplier bill to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {supplier.bills.map((bill) => (
              <BillCard
                key={bill.id}
                bill={bill}
                onConfirm={() => handleConfirmBill(bill.id)}
                confirming={confirmingId === bill.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Scan Dialog */}
      <Dialog open={scanOpen} onOpenChange={(open) => { if (!open) { setScanOpen(false); setScanStep("upload"); setScanResult(null); setScanImage(null); setEditedItems([]); } }}>
        <DialogContent className="bg-black border-white/10 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Scan Supplier Bill — {supplier.name}
            </DialogTitle>
          </DialogHeader>

          {scanStep === "upload" && (
            <div className="space-y-4 mt-2">
              {analyzeImage.isPending ? (
                <div className="flex flex-col items-center gap-3 py-12">
                  <Loader2 className="h-10 w-10 animate-spin text-white/60" />
                  <p className="text-gray-400">Analyzing bill with AI…</p>
                </div>
              ) : (
                <>
                  <div
                    onClick={() => fileRef.current?.click()}
                    className="border-2 border-dashed border-white/10 rounded-xl p-10 text-center cursor-pointer hover:border-white/30 transition-colors"
                  >
                    <ImageIcon className="h-10 w-10 mx-auto mb-3 text-gray-500" />
                    <p className="text-gray-400">Click to upload a photo of the supplier bill</p>
                    <p className="text-xs text-gray-600 mt-1">JPG, PNG, WebP supported</p>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </>
              )}
            </div>
          )}

          {scanStep === "review" && scanResult && (
            <div className="space-y-4 mt-2">
              {/* AI result summary */}
              <div className="bg-white/5 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">AI Extraction</p>
                  <Badge className={
                    scanResult.confidence > 0.7
                      ? "bg-green-500/10 text-green-400 border-green-500/20"
                      : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                  }>
                    {Math.round(scanResult.confidence * 100)}% confidence
                  </Badge>
                </div>
                {scanResult.billNumber && <p className="text-xs text-gray-400">Bill #: <span className="text-white">{scanResult.billNumber}</span></p>}
                {scanResult.date && <p className="text-xs text-gray-400">Date: <span className="text-white">{scanResult.date}</span></p>}
                {scanResult.supplierName && <p className="text-xs text-gray-400">Supplier on bill: <span className="text-white">{scanResult.supplierName}</span></p>}
                {scanResult.totalAmount != null && <p className="text-xs text-gray-400">Total: <span className="text-white">{formatCurrency(scanResult.totalAmount)}</span></p>}
                {scanResult.rawText && <p className="text-xs text-gray-500 italic">"{scanResult.rawText.slice(0, 120)}…"</p>}
              </div>

              {/* Editable items */}
              <div>
                <p className="text-sm font-medium mb-2">Extracted Items (edit if needed)</p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {editedItems.map((item, i) => (
                    <div key={i} className="grid grid-cols-4 gap-2 bg-white/5 rounded-lg p-2">
                      <Input
                        value={item.articleCode}
                        onChange={(e) => setEditedItems((prev) => prev.map((it, j) => j === i ? { ...it, articleCode: e.target.value } : it))}
                        placeholder="Article"
                        className="bg-transparent border-white/10 text-xs text-white h-8"
                      />
                      <Input
                        value={item.productName}
                        onChange={(e) => setEditedItems((prev) => prev.map((it, j) => j === i ? { ...it, productName: e.target.value } : it))}
                        placeholder="Product"
                        className="bg-transparent border-white/10 text-xs text-white h-8"
                      />
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => setEditedItems((prev) => prev.map((it, j) => j === i ? { ...it, quantity: parseInt(e.target.value) || 0 } : it))}
                        placeholder="Qty"
                        className="bg-transparent border-white/10 text-xs text-white h-8"
                      />
                      <Input
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) => setEditedItems((prev) => prev.map((it, j) => j === i ? { ...it, unitPrice: parseFloat(e.target.value) || 0 } : it))}
                        placeholder="Price"
                        className="bg-transparent border-white/10 text-xs text-white h-8"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">Columns: Article Code · Product · Qty · Unit Price (₹)</p>
              </div>

              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider">Notes (optional)</label>
                <Input
                  value={billNote}
                  onChange={(e) => setBillNote(e.target.value)}
                  placeholder="Any notes about this bill..."
                  className="mt-1 bg-white/5 border-white/10 text-white"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  onClick={() => { setScanStep("upload"); setScanResult(null); setScanImage(null); setEditedItems([]); }}
                  className="flex-1"
                >
                  <RefreshCw className="h-4 w-4 mr-2" /> Rescan
                </Button>
                <Button
                  onClick={handleCreateBill}
                  disabled={createBill.isPending || editedItems.length === 0}
                  className="flex-1"
                >
                  {createBill.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Save as Draft
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
