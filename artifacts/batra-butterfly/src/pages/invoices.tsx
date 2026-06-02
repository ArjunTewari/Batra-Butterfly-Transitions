import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useListInvoices,
  useCreateInvoice,
  useAnalyzeInvoiceImage,
  useGetDailySalesSummary,
  useConfirmInvoice,
  useDeleteInvoice,
  useListRetailers,
  useListStaff,
  getListInvoicesQueryKey,
  getGetDailySalesSummaryQueryKey,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  Plus,
  Trash2,
  Camera,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Image as ImageIcon,
  RefreshCw,
  TrendingUp,
  Receipt,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

const lineItemSchema = z.object({
  articleCode: z.string().min(1, "Required"),
  productName: z.string().min(1, "Required"),
  quantity: z.coerce.number().min(1),
  unitPrice: z.coerce.number().min(0),
});

const invoiceFormSchema = z.object({
  retailerId: z.coerce.number().min(1, "Select a retailer"),
  staffId: z.coerce.number().min(1, "Select a staff member"),
  invoiceNumber: z.string().min(1, "Invoice number required"),
  date: z.string().min(1, "Date required"),
  notes: z.string().optional(),
  items: z.array(lineItemSchema).min(1, "At least one item required"),
});

type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

function today() {
  return new Date().toISOString().split("T")[0];
}

function nextInvoiceNumber() {
  const d = new Date();
  return `INV-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    confirmed: "bg-green-500/20 text-green-300 border-green-500/30",
    cancelled: "bg-red-500/20 text-red-300 border-red-500/30",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${colors[status] ?? colors.draft}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function Invoices() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("list");
  const [createMode, setCreateMode] = useState<"manual" | "photo">("manual");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>("image/jpeg");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: invoices, isLoading: invoicesLoading } = useListInvoices(
    undefined,
    { query: { queryKey: getListInvoicesQueryKey() } }
  );
  const { data: dailySummary } = useGetDailySalesSummary(
    undefined,
    { query: { queryKey: getGetDailySalesSummaryQueryKey() } }
  );
  const { data: retailers } = useListRetailers();
  const { data: staffList } = useListStaff();

  const analyzeImage = useAnalyzeInvoiceImage();
  const createInvoice = useCreateInvoice();
  const confirmInvoice = useConfirmInvoice();
  const deleteInvoice = useDeleteInvoice();

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      retailerId: 0,
      staffId: 0,
      invoiceNumber: nextInvoiceNumber(),
      date: today(),
      notes: "",
      items: [{ articleCode: "", productName: "", quantity: 1, unitPrice: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedItems = form.watch("items");
  const totalAmount = watchedItems.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0
  );

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImagePreview(URL.createObjectURL(file));
    setImageMime(file.type || "image/jpeg");

    const reader = new FileReader();
    reader.onloadend = () => {
      const full = reader.result as string;
      const base64Only = full.split(",")[1] ?? full;
      setImageBase64(base64Only);

      analyzeImage.mutate(
        { data: { imageBase64: base64Only, mimeType: file.type } },
        {
          onSuccess: (data) => {
            toast({
              title: "Invoice analyzed",
              description: `Confidence: ${(data.confidence * 100).toFixed(0)}% — ${data.items.length} items found`,
            });
            // Pre-fill form from AI extraction
            if (data.invoiceNumber) form.setValue("invoiceNumber", data.invoiceNumber);
            if (data.date) form.setValue("date", data.date);
            if (data.items.length > 0) {
              form.setValue(
                "items",
                data.items.map((it) => ({
                  articleCode: it.articleCode ?? "",
                  productName: it.productName,
                  quantity: it.quantity,
                  unitPrice: it.unitPrice ?? 0,
                }))
              );
            }
          },
          onError: () => {
            toast({
              variant: "destructive",
              title: "Analysis failed",
              description: "Could not read the invoice. Please fill in manually.",
            });
          },
        }
      );
    };
    reader.readAsDataURL(file);
  };

  const onSubmit = (values: InvoiceFormValues) => {
    createInvoice.mutate(
      {
        data: {
          ...values,
          imageUrl: imageBase64 ? `data:${imageMime};base64,${imageBase64}` : undefined,
        },
      },
      {
        onSuccess: (data) => {
          toast({ title: "Invoice created", description: `Draft #${data.invoiceNumber} saved` });
          setIsCreateOpen(false);
          setImagePreview(null);
          setImageBase64(null);
          form.reset({
            invoiceNumber: nextInvoiceNumber(),
            date: today(),
            notes: "",
            items: [{ articleCode: "", productName: "", quantity: 1, unitPrice: 0 }],
            retailerId: 0,
            staffId: 0,
          });
          queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDailySalesSummaryQueryKey() });
        },
        onError: (err: unknown) => {
          toast({ variant: "destructive", title: "Failed to create invoice", description: String(err) });
        },
      }
    );
  };

  const handleConfirm = (id: number) => {
    confirmInvoice.mutate(
      { id },
      {
        onSuccess: (data) => {
          toast({
            title: "Invoice confirmed",
            description: `Stock updated for ${data.stockUpdates.length} items.`,
          });
          queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDailySalesSummaryQueryKey() });
        },
        onError: (err: unknown) => {
          toast({ variant: "destructive", title: "Confirm failed", description: String(err) });
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteInvoice.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Invoice deleted" });
          queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
        },
      }
    );
  };

  const confirmedTotal = invoices
    ?.filter((i) => i.status === "confirmed")
    .reduce((s, i) => s + i.totalAmount, 0) ?? 0;

  const draftCount = invoices?.filter((i) => i.status === "draft").length ?? 0;

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } },
  };
  const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-gray-400 mt-1">Create, track, and confirm sales invoices</p>
        </div>
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="bg-white text-black hover:bg-gray-200 font-semibold"
        >
          <Plus className="h-4 w-4 mr-2" /> New Invoice
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "Confirmed Sales",
            value: formatCurrency(confirmedTotal),
            icon: TrendingUp,
            sub: "all time",
          },
          {
            label: "Total Invoices",
            value: String(invoices?.length ?? 0),
            icon: Receipt,
            sub: "all time",
          },
          {
            label: "Pending Drafts",
            value: String(draftCount),
            icon: FileText,
            sub: "awaiting confirmation",
          },
        ].map((kpi) => (
          <motion.div key={kpi.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="bg-black border-white/10">
              <CardContent className="p-5 flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                  <kpi.icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{kpi.value}</p>
                  <p className="text-sm text-gray-400">{kpi.label}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{kpi.sub}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="list" className="data-[state=active]:bg-white data-[state=active]:text-black">
            All Invoices
          </TabsTrigger>
          <TabsTrigger value="daily" className="data-[state=active]:bg-white data-[state=active]:text-black">
            Daily Sales
          </TabsTrigger>
        </TabsList>

        {/* Invoice List */}
        <TabsContent value="list" className="mt-4">
          {invoicesLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : !invoices?.length ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <FileText className="h-12 w-12 text-gray-700 mb-3" />
              <p className="text-gray-400">No invoices yet</p>
              <p className="text-sm text-gray-600 mt-1">Create your first invoice to get started</p>
            </div>
          ) : (
            <motion.div variants={container} initial="hidden" animate="show" className="space-y-3">
              {invoices.map((inv) => (
                <motion.div key={inv.id} variants={item}>
                  <Card className="bg-black border-white/10 hover:border-white/20 transition-all">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                            <Receipt className="h-5 w-5 text-gray-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-white text-sm">{inv.invoiceNumber}</p>
                              <StatusBadge status={inv.status} />
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {inv.retailerName} · {inv.staffName}
                            </p>
                            <p className="text-xs text-gray-600">
                              {new Date(inv.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                              {" · "}
                              {inv.items.length} item{inv.items.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <p className="font-bold text-white text-lg">{formatCurrency(inv.totalAmount)}</p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-gray-400 hover:text-white"
                              onClick={() => navigate(`/invoices/${inv.id}`)}
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                            {inv.status === "draft" && (
                              <>
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700 text-white text-xs"
                                  onClick={() => handleConfirm(inv.id)}
                                  disabled={confirmInvoice.isPending}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Confirm
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-400 hover:text-red-300"
                                  onClick={() => handleDelete(inv.id)}
                                  disabled={deleteInvoice.isPending}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}
        </TabsContent>

        {/* Daily Sales Summary */}
        <TabsContent value="daily" className="mt-4">
          {!dailySummary?.length ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <TrendingUp className="h-12 w-12 text-gray-700 mb-3" />
              <p className="text-gray-400">No confirmed sales yet</p>
              <p className="text-sm text-gray-600 mt-1">Confirm invoices to see daily sales</p>
            </div>
          ) : (
            <motion.div variants={container} initial="hidden" animate="show" className="space-y-3">
              {dailySummary.map((day) => {
                const expanded = expandedDays[day.date] ?? false;
                const dayInvoices = invoices?.filter(
                  (inv) =>
                    inv.status === "confirmed" &&
                    inv.date.split("T")[0] === day.date
                );
                return (
                  <motion.div key={day.date} variants={item}>
                    <Card className="bg-black border-white/10">
                      <CardContent className="p-4">
                        <button
                          className="w-full flex items-center justify-between gap-4 text-left"
                          onClick={() =>
                            setExpandedDays((prev) => ({
                              ...prev,
                              [day.date]: !expanded,
                            }))
                          }
                        >
                          <div className="flex items-center gap-4">
                            <div className="text-center min-w-[48px]">
                              <p className="text-2xl font-bold text-white leading-none">
                                {new Date(day.date + "T00:00:00").getDate()}
                              </p>
                              <p className="text-xs text-gray-400 uppercase">
                                {new Date(day.date + "T00:00:00").toLocaleDateString("en-IN", { month: "short" })}
                              </p>
                            </div>
                            <div>
                              <p className="font-bold text-white text-xl">{formatCurrency(day.totalAmount)}</p>
                              <p className="text-xs text-gray-400">
                                {day.invoiceCount} invoice{day.invoiceCount !== 1 ? "s" : ""}
                                {day.topRetailer ? ` · Top: ${day.topRetailer}` : ""}
                              </p>
                            </div>
                          </div>
                          {expanded ? (
                            <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          )}
                        </button>

                        <AnimatePresence>
                          {expanded && dayInvoices && dayInvoices.length > 0 && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="border-t border-white/10 mt-3 pt-3 space-y-2">
                                {dayInvoices.map((inv) => (
                                  <div
                                    key={inv.id}
                                    className="flex items-center justify-between text-sm py-1.5 hover:bg-white/5 rounded px-2 -mx-2 cursor-pointer"
                                    onClick={() => navigate(`/invoices/${inv.id}`)}
                                  >
                                    <div>
                                      <span className="text-white font-medium">{inv.invoiceNumber}</span>
                                      <span className="text-gray-500 ml-2">{inv.retailerName}</span>
                                    </div>
                                    <span className="text-white font-semibold">{formatCurrency(inv.totalAmount)}</span>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Invoice Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="bg-black border-white/10 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">New Invoice</DialogTitle>
          </DialogHeader>

          {/* Mode Toggle */}
          <div className="flex gap-2 mb-4">
            <Button
              type="button"
              variant={createMode === "manual" ? "default" : "ghost"}
              size="sm"
              onClick={() => setCreateMode("manual")}
              className={createMode === "manual" ? "bg-white text-black" : "text-gray-400"}
            >
              <FileText className="h-4 w-4 mr-1.5" /> Manual Entry
            </Button>
            <Button
              type="button"
              variant={createMode === "photo" ? "default" : "ghost"}
              size="sm"
              onClick={() => setCreateMode("photo")}
              className={createMode === "photo" ? "bg-white text-black" : "text-gray-400"}
            >
              <Camera className="h-4 w-4 mr-1.5" /> Scan Invoice Photo
            </Button>
          </div>

          {/* Photo Scanner */}
          <AnimatePresence>
            {createMode === "photo" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden mb-4"
              >
                <div
                  className={`relative border-2 border-dashed rounded-lg flex flex-col items-center justify-center min-h-[200px] cursor-pointer transition-all
                    ${imagePreview ? "border-white/20" : "border-white/10 hover:border-white/30 bg-white/[0.02]"}
                  `}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                  />
                  {imagePreview ? (
                    <img src={imagePreview} alt="Invoice" className="max-h-[200px] object-contain p-2" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-center p-6">
                      <ImageIcon className="h-10 w-10 text-gray-600" />
                      <p className="text-gray-400">Tap to upload or photograph invoice</p>
                      <p className="text-xs text-gray-600">Claude AI will extract all line items automatically</p>
                    </div>
                  )}
                  {analyzeImage.isPending && (
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center rounded-lg">
                      <Loader2 className="h-8 w-8 animate-spin text-white mb-2" />
                      <p className="text-sm text-white">Analyzing with Claude AI...</p>
                    </div>
                  )}
                </div>
                {analyzeImage.data && !analyzeImage.isPending && (
                  <div className="mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex items-start gap-3">
                    {analyzeImage.data.confidence > 0.6 ? (
                      <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-white">
                        {analyzeImage.data.items.length} items extracted — {(analyzeImage.data.confidence * 100).toFixed(0)}% confidence
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Review and edit the form below before saving
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Invoice Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Header fields */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="retailerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Retailer</FormLabel>
                      <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value ? String(field.value) : ""}>
                        <FormControl>
                          <SelectTrigger className="bg-white/5 border-white/10 text-white">
                            <SelectValue placeholder="Select retailer" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-black border-white/10 text-white">
                          {retailers?.map((r) => (
                            <SelectItem key={r.id} value={String(r.id)}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="staffId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Staff Member</FormLabel>
                      <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value ? String(field.value) : ""}>
                        <FormControl>
                          <SelectTrigger className="bg-white/5 border-white/10 text-white">
                            <SelectValue placeholder="Select staff" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-black border-white/10 text-white">
                          {staffList?.map((s) => (
                            <SelectItem key={s.id} value={String(s.id)}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="invoiceNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice Number</FormLabel>
                      <FormControl>
                        <Input className="bg-white/5 border-white/10 text-white" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl>
                        <Input type="date" className="bg-white/5 border-white/10 text-white" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Input className="bg-white/5 border-white/10 text-white" placeholder="Any notes..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-white">Line Items</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-gray-400 hover:text-white"
                    onClick={() => append({ articleCode: "", productName: "", quantity: 1, unitPrice: 0 })}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
                  </Button>
                </div>

                {/* Column headers */}
                <div className="grid grid-cols-[1fr_1.5fr_80px_100px_36px] gap-2 mb-1.5 text-xs text-gray-500 px-1">
                  <span>Article Code</span>
                  <span>Description</span>
                  <span>Qty</span>
                  <span>Unit Price</span>
                  <span />
                </div>

                <div className="space-y-2">
                  {fields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-[1fr_1.5fr_80px_100px_36px] gap-2 items-start">
                      <FormField
                        control={form.control}
                        name={`items.${index}.articleCode`}
                        render={({ field: f }) => (
                          <FormItem>
                            <FormControl>
                              <Input className="bg-white/5 border-white/10 text-white text-sm h-9" placeholder="BB-001" {...f} />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`items.${index}.productName`}
                        render={({ field: f }) => (
                          <FormItem>
                            <FormControl>
                              <Input className="bg-white/5 border-white/10 text-white text-sm h-9" placeholder="Product name" {...f} />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`items.${index}.quantity`}
                        render={({ field: f }) => (
                          <FormItem>
                            <FormControl>
                              <Input type="number" min={1} className="bg-white/5 border-white/10 text-white text-sm h-9" {...f} />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`items.${index}.unitPrice`}
                        render={({ field: f }) => (
                          <FormItem>
                            <FormControl>
                              <Input type="number" min={0} step={0.01} className="bg-white/5 border-white/10 text-white text-sm h-9" {...f} />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-red-400 hover:text-red-300 h-9 w-9 mt-0"
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div className="flex justify-end mt-4 pt-3 border-t border-white/10">
                  <div className="text-right">
                    <p className="text-sm text-gray-400">Total Amount</p>
                    <p className="text-2xl font-bold text-white">{formatCurrency(totalAmount)}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1 border border-white/10 text-gray-400 hover:text-white"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-white text-black hover:bg-gray-200 font-semibold"
                  disabled={createInvoice.isPending || analyzeImage.isPending}
                >
                  {createInvoice.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                  ) : (
                    "Save as Draft"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
