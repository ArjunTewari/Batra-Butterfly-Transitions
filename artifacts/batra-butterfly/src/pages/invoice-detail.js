import { useParams, useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useGetInvoice, useConfirmInvoice, useDeleteInvoice, getListInvoicesQueryKey, getGetDailySalesSummaryQueryKey, } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, Trash2, Package, User, Building2, Loader2, } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
function StatusBadge({ status }) {
    var _a;
    const colors = {
        draft: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
        confirmed: "bg-green-500/20 text-green-300 border-green-500/30",
        cancelled: "bg-red-500/20 text-red-300 border-red-500/30",
    };
    return (<span className={`text-sm px-3 py-1 rounded-full border font-medium ${(_a = colors[status]) !== null && _a !== void 0 ? _a : colors.draft}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>);
}
export default function InvoiceDetail() {
    const { id } = useParams();
    const [, navigate] = useLocation();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const invoiceId = parseInt(id !== null && id !== void 0 ? id : "0", 10);
    const { data: invoice, isLoading } = useGetInvoice(invoiceId, {
        query: { queryKey: ["invoices", invoiceId], enabled: !!invoiceId },
    });
    const { isMaster } = useAuth();
    const confirmInvoice = useConfirmInvoice();
    const deleteInvoice = useDeleteInvoice();
    const handleConfirm = () => {
        confirmInvoice.mutate({ id: invoiceId }, {
            onSuccess: (data) => {
                toast({
                    title: "Invoice confirmed",
                    description: `Stock updated for ${data.stockUpdates.length} products. Commission earned: ${formatCurrency(data.commissionEarned)}`,
                });
                queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
                queryClient.invalidateQueries({ queryKey: getGetDailySalesSummaryQueryKey() });
            },
            onError: (err) => {
                toast({ variant: "destructive", title: "Failed to confirm", description: String(err) });
            },
        });
    };
    const handleDelete = () => {
        deleteInvoice.mutate({ id: invoiceId }, {
            onSuccess: () => {
                toast({ title: "Invoice deleted" });
                navigate("/invoices");
                queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
            },
            onError: (err) => {
                toast({ variant: "destructive", title: "Failed to delete", description: String(err) });
            },
        });
    };
    if (isLoading) {
        return (<div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400"/>
      </div>);
    }
    if (!invoice) {
        return (<div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-gray-400">Invoice not found</p>
        <Link href="/invoices" className="text-sm text-gray-500 hover:text-white mt-2 transition-colors">
          Back to Invoices
        </Link>
      </div>);
    }
    return (<div className="space-y-6 max-w-3xl">
      {/* Back */}
      <Link href="/invoices" className="inline-flex items-center text-sm text-gray-400 hover:text-white transition-colors">
        <ArrowLeft className="h-4 w-4 mr-1"/> Back to Invoices
      </Link>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">{invoice.invoiceNumber}</h1>
            <StatusBadge status={invoice.status}/>
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
        <div className="text-right">
          <p className="text-3xl font-bold text-white">{formatCurrency(invoice.totalAmount)}</p>
          <p className="text-sm text-gray-400 mt-0.5">{invoice.items.length} items</p>
        </div>
      </motion.div>

      {/* Meta cards */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="grid grid-cols-2 gap-4">
        <Card className="bg-black border-white/10">
          <CardContent className="p-4 flex items-center gap-3">
            <Building2 className="h-5 w-5 text-gray-500 flex-shrink-0"/>
            <div>
              <p className="text-xs text-gray-500">Retailer</p>
              <p className="text-sm font-semibold text-white">{invoice.retailerName}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-black border-white/10">
          <CardContent className="p-4 flex items-center gap-3">
            <User className="h-5 w-5 text-gray-500 flex-shrink-0"/>
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
              <Package className="h-4 w-4 text-gray-400"/> Line Items
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
              {invoice.items.map((item, i) => (<div key={item.id} className="grid grid-cols-[1fr_80px_100px_100px] gap-4 py-2.5 border-b border-white/5 last:border-0 px-1">
                  <div>
                    <p className="text-sm font-medium text-white">{item.productName}</p>
                    <p className="text-xs text-gray-500">{item.articleCode}</p>
                  </div>
                  <p className="text-sm text-right text-white">{item.quantity}</p>
                  <p className="text-sm text-right text-white">{formatCurrency(item.unitPrice)}</p>
                  <p className="text-sm font-semibold text-right text-white">{formatCurrency(item.totalPrice)}</p>
                </div>))}
              <div className="grid grid-cols-[1fr_80px_100px_100px] gap-4 pt-3 px-1">
                <div className="col-span-3 text-right text-sm text-gray-400">Total</div>
                <div className="text-right text-xl font-bold text-white">{formatCurrency(invoice.totalAmount)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Notes */}
      {invoice.notes && (<motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="bg-black border-white/10">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">Notes</p>
              <p className="text-sm text-white">{invoice.notes}</p>
            </CardContent>
          </Card>
        </motion.div>)}

      {/* Cascade info for confirmed */}
      {invoice.status === "confirmed" && (<motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="bg-green-950/30 border-green-500/20">
            <CardContent className="p-4 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5"/>
              <div>
                <p className="text-sm font-semibold text-green-300">Invoice Confirmed</p>
                <p className="text-xs text-green-400/70 mt-0.5">
                  Stock quantities updated · Retailer ledger debited · Staff commission recorded
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>)}

      {/* Actions */}
      {invoice.status === "draft" && (<motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="flex gap-3">
          <Button variant="ghost" className="border border-red-500/30 text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={handleDelete} disabled={deleteInvoice.isPending}>
            <Trash2 className="h-4 w-4 mr-2"/> Delete Draft
          </Button>
          {isMaster ? (<Button className="flex-1 bg-white text-black hover:bg-gray-200 font-semibold py-5" onClick={handleConfirm} disabled={confirmInvoice.isPending}>
              {confirmInvoice.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin"/> Confirming...</>) : (<><CheckCircle2 className="h-4 w-4 mr-2"/> Confirm Invoice</>)}
            </Button>) : (<div className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-md bg-yellow-500/10 border border-yellow-500/20">
              <span className="text-yellow-400 text-sm font-medium">📨 Sent for Approval</span>
              <span className="text-gray-500 text-xs">(Master only)</span>
            </div>)}
        </motion.div>)}

      <p className="text-xs text-gray-700 text-center">
        Confirming will deduct stock, record a ledger sale for {invoice.retailerName}, and log commission for {invoice.staffName}
      </p>
    </div>);
}
