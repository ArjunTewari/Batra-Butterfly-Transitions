import { useState } from "react";
import { useParams, Link } from "wouter";
import { 
  useGetRetailer, 
  getGetRetailerQueryKey,
  useGetRetailerLedger,
  getGetRetailerLedgerQueryKey,
  useAddLedgerEntry
} from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Phone, Calendar, Receipt, IndianRupee } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

const formSchema = z.object({
  type: z.enum(["sale", "payment"]),
  amount: z.coerce.number().min(1, "Amount must be greater than 0"),
  note: z.string().optional(),
});

export default function RetailerDetail() {
  const { id } = useParams();
  const retailerId = Number(id);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: retailer, isLoading: loadingRetailer } = useGetRetailer(retailerId, {
    query: { enabled: !!retailerId, queryKey: getGetRetailerQueryKey(retailerId) }
  });

  const { data: ledger, isLoading: loadingLedger } = useGetRetailerLedger(retailerId, {
    query: { enabled: !!retailerId, queryKey: getGetRetailerLedgerQueryKey(retailerId) }
  });

  const addLedgerEntry = useAddLedgerEntry();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: "payment",
      amount: 0,
      note: "",
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    addLedgerEntry.mutate({ id: retailerId, data: values }, {
      onSuccess: () => {
        setIsAddOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getGetRetailerLedgerQueryKey(retailerId) });
        queryClient.invalidateQueries({ queryKey: getGetRetailerQueryKey(retailerId) });
      }
    });
  };

  if (loadingRetailer || !retailer) {
    return <div className="text-gray-400">Loading...</div>;
  }

  const utilization = Math.min(100, Math.max(0, (retailer.outstanding / retailer.creditLimit) * 100));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/retailers" className="inline-flex items-center text-sm text-gray-400 hover:text-white mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Retailers
        </Link>
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{retailer.name}</h1>
              {retailer.isOverdue && (
                <Badge variant="destructive" className="bg-red-500/20 text-red-400 border-red-500/50">
                  Overdue ({retailer.daysOverdue}d)
                </Badge>
              )}
            </div>
            <div className="flex items-center text-gray-400 mt-2 gap-4 text-sm">
              <span className="flex items-center"><Phone className="h-3 w-3 mr-1" /> {retailer.phone}</span>
              <span className="flex items-center"><Calendar className="h-3 w-3 mr-1" /> Joined {new Date(retailer.createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-entry" className="bg-white text-black hover:bg-gray-200 w-full md:w-auto">
                Add Entry
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-black border border-white/10 text-white sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add Ledger Entry</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-white/5 border-white/10 text-white">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-black border-white/10 text-white">
                            <SelectItem value="payment">Payment Received</SelectItem>
                            <SelectItem value="sale">New Sale (Invoice)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount (₹)</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="0" className="bg-white/5 border-white/10 text-white" {...field} data-testid="input-entry-amount" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="note"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Note (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Invoice # or reference" className="bg-white/5 border-white/10 text-white" {...field} data-testid="input-entry-note" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={addLedgerEntry.isPending} className="bg-white text-black hover:bg-gray-200" data-testid="button-submit-entry">
                      {addLedgerEntry.isPending ? "Saving..." : "Save Entry"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-black border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Outstanding Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-3xl font-bold", retailer.outstanding > retailer.creditLimit ? "text-red-400" : "text-white")}>
              {formatCurrency(retailer.outstanding)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-black border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Credit Limit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-300">{formatCurrency(retailer.creditLimit)}</div>
            <div className="mt-4 w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
              <div 
                className={`h-full rounded-full ${utilization > 100 ? 'bg-red-500' : 'bg-blue-500'}`}
                style={{ width: `${utilization}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">{utilization.toFixed(1)}% utilized</p>
          </CardContent>
        </Card>
        <Card className="bg-black border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Last Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-white">
              {retailer.lastPaymentDate ? new Date(retailer.lastPaymentDate).toLocaleDateString() : "Never"}
            </div>
            {retailer.isOverdue && (
              <p className="text-xs text-red-400 mt-1">Overdue by {retailer.daysOverdue} days</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Ledger Timeline</h2>
        <Card className="bg-black border-white/10">
          <CardContent className="p-0">
            {loadingLedger ? (
              <div className="p-8 text-center text-gray-500">Loading ledger...</div>
            ) : ledger?.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No transactions yet</div>
            ) : (
              <div className="divide-y divide-white/5">
                {ledger?.map((entry, i) => (
                  <motion.div 
                    key={entry.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center space-x-4">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center",
                        entry.type === 'payment' ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                      )}>
                        {entry.type === 'payment' ? <IndianRupee className="h-5 w-5" /> : <Receipt className="h-5 w-5" />}
                      </div>
                      <div>
                        <p className="font-medium text-sm text-white">
                          {entry.type === 'payment' ? 'Payment Received' : 'Invoice Generated'}
                        </p>
                        <p className="text-xs text-gray-500 flex items-center gap-2">
                          <span>{new Date(entry.date).toLocaleString()}</span>
                          {entry.note && (
                            <>
                              <span>•</span>
                              <span>{entry.note}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className={cn(
                      "font-bold",
                      entry.type === 'payment' ? "text-green-400" : "text-red-400"
                    )}>
                      {entry.type === 'payment' ? '-' : '+'}{formatCurrency(entry.amount)}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
