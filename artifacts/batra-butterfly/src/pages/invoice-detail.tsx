import { useParams, useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetInvoice,
  useConfirmInvoice,
  useDeleteInvoice,
  getListInvoicesQueryKey,
  getGetDailySalesSummaryQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CheckCircle2,
  Trash2,
  Package,
  User,
  Building2,
  Loader2,
  FileDown,
  Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { downloadInvoicePDF, openInvoicePDF } from "@/lib/invoice-pdf";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    confirmed: "bg-green-500/20 text-green-300 border-green-500/30",
    cancelled: "bg-red-500/20 text-red-300 border-red-500/30",
  };
  return (
    <span className={`text-sm px-3 py-1 rounded-full border font-medium ${colors[status] ?? colors.draft}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invoiceId = parseInt(id ?? "0", 10);

  const { data: invoice, isLoading } = useGetInvoice(invoiceId, {
    query: { queryKey: ["invoices", invoiceId], enabled: !!invoiceId },
  });

  const confirmInvoice = useConfirmInvoice();
  const deleteInvoice = useDeleteInvoice();

  const handleConfirm = () => {
    confirmInvoice.mutate(
      { id: invoiceId },
      {
        onSuccess: () => {
          toast({ title: "Invoice confirmed", description: "Stock updated and ledger debited." });
          queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDailySalesSummaryQueryKey() });
        },
        onError: (err: unknown) => {
          toast({ variant: "destructive", title: "Failed to confirm", description: String(err) });
        },
      }
    );
  };

  const handleDelete = () => {
    deleteInvoice.mutate(
      { id: invoiceId },
      {
        onSuccess: () => {
          toast({ title: "Invoice deleted" });
          navigate("/invoices");
          queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
        },
        onError: (err: unknown) => {
          toast({ variant: "destructive", title: "Failed to delete", description: String(err) });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-gray-400">Invoice not found</p>
        <Link href="/invoices" className="text-sm text-gray-500 hover:text-white mt-2 transition-colors">
          Back to Invoices
        </Link>
      </div>
    );
  }

  const itemsSubtotal = invoice.items.reduce((sum, it) => sum + it.totalPrice, 0);
  const chargeRows = (
    [
      { label: "Misc", amount: invoice.miscCharge ?? 0 },
      { label: "Claim", amount: invoice.claimCharge ?? 0 },
      { label: "Cash Deposit", amount: invoice.cashDeposit ?? 0 },
      { label: "GST", amount: invoice.gstCharge ?? 0 },
      { label: "Packing", amount: invoice.packingCharge ?? 0 },
    ] as const
  ).filter((c) => c.amount > 0);

  const handleViewPDF = () => openInvoicePDF(invoice);
  const handleDownloadPDF = () => downloadInvoicePDF(invoice);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back */}
      <Link href="/invoices" className="inline-flex items-center text-sm text-gray-400 hover:text-white transition-colors">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Invoices
      </Link>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">{invoice.invoiceNumber}</h1>
            <StatusBadge status={invoice.status} />
          </div>
          <p className="text-gray-400 mt-1">
            {new Date(invoice.date).toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <p className="text-3xl font-bold text-white">{formatCurrency(invoice.totalAmount)}</p>
          <p className="text-sm text-gray-400">{invoice.items.length} items</p>
          <div className="flex gap-2 mt-1">
            <Button size="sm" variant="outline" className="border-white/10 text-gray-300 hover:bg-white/5" onClick={handleViewPDF}>
              <Eye className="h-3.5 w-3.5 mr-1.5" /> View PDF
            </Button>
            <Button size="sm" variant="outline" className="border-white/10 text-gray-300 hover:bg-white/5" onClick={handleDownloadPDF}>
              <FileDown className="h-3.5 w-3.5 mr-1.5" /> Download
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Meta cards */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 gap-4"
      >
        <Card className="bg-black border-white/10">
          <CardContent className="p-4 flex items-center gap-3">
            <Building2 className="h-5 w-5 text-gray-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-500">Retailer</p>
              <p className="text-sm font-semibold text-white">{invoice.retailerName}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-black border-white/10">
          <CardContent className="p-4 flex items-center gap-3">
            <User className="h-5 w-5 text-gray-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-500">Staff Member</p>
              <p className="text-sm font-semibold text-white">{invoice.staffName}</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Line items */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="bg-black border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4 text-gray-400" /> Line Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              <div className="grid grid-cols-[1fr_80px_100px_100px] gap-4 text-xs text-gray-500 pb-2 border-b border-white/10 mb-2 px-1">
                <span>Item</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit Price</span>
                <span className="text-right">Total</span>
              </div>
              {invoice.items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_80px_100px_100px] gap-4 py-2.5 border-b border-white/5 last:border-0 px-1"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{item.productName}</p>
                    <p className="text-xs text-gray-500">{item.articleCode}</p>
                  </div>
                  <p className="text-sm text-right text-white">{item.quantity}</p>
                  <p className="text-sm text-right text-white">{formatCurrency(item.unitPrice)}</p>
                  <p className="text-sm font-semibold text-right text-white">{formatCurrency(item.totalPrice)}</p>
                </div>
              ))}
              {chargeRows.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Sub Total</span>
                    <span className="text-gray-300">{formatCurrency(itemsSubtotal)}</span>
                  </div>
                  {chargeRows.map((c) => (
                    <div key={c.label} className="flex justify-between text-sm">
                      <span className="text-gray-400">{c.label}</span>
                      <span className="text-gray-300">{formatCurrency(c.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-[1fr_80px_100px_100px] gap-4 pt-3 px-1">
                <div className="col-span-3 text-right text-sm text-gray-400">
                  {chargeRows.length > 0 ? "Grand Total" : "Total"}
                </div>
                <div className="text-right text-xl font-bold text-white">{formatCurrency(invoice.totalAmount)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Notes */}
      {invoice.notes && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="bg-black border-white/10">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">Notes</p>
              <p className="text-sm text-white">{invoice.notes}</p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Confirmed banner */}
      {invoice.status === "confirmed" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="bg-green-950/30 border-green-500/20">
            <CardContent className="p-4 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-300">Invoice Confirmed</p>
                <p className="text-xs text-green-400/70 mt-0.5">
                  Stock quantities updated · Retailer ledger debited · Sale recorded
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Actions */}
      {invoice.status === "draft" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="flex gap-3"
        >
          <Button
            variant="ghost"
            className="border border-red-500/30 text-red-400 hover:text-red-300 hover:bg-red-500/10"
            onClick={handleDelete}
            disabled={deleteInvoice.isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Delete Draft
          </Button>
          <Button
            className="flex-1 bg-white text-black hover:bg-gray-200 font-semibold py-5"
            onClick={handleConfirm}
            disabled={confirmInvoice.isPending}
          >
            {confirmInvoice.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Confirming...</>
            ) : (
              <><CheckCircle2 className="h-4 w-4 mr-2" /> Confirm Invoice</>
            )}
          </Button>
        </motion.div>
      )}

      <p className="text-xs text-gray-700 text-center">
        Confirming will deduct stock and record a ledger sale for {invoice.retailerName}
      </p>
    </div>
  );
}
