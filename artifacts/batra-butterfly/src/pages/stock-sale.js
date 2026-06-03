import { useState, useRef, useCallback } from "react";
import { Link } from "wouter";
import { useAnalyzeSaleImage, useConfirmSale, useCreateInvoice, useConfirmInvoice, useListRetailers, useListStaff, getListStockQueryKey, getListInvoicesQueryKey, getListRetailersQueryKey, } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/components/ui/select";
import { ArrowLeft, Camera, Images, ShoppingBag, CheckCircle2, AlertCircle, Trash2, PackageOpen, Minus, Plus, FileText, Copy, Share2, Receipt, } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { compressImage } from "@/lib/image";
const DEFAULT_SALE_QUANTITY = 6;
const CHARGE_CONFIG = [
    { key: "miscCharge", label: "Misc" },
    { key: "claimCharge", label: "Claim" },
    { key: "cashDeposit", label: "Cash Deposit" },
    { key: "gstCharge", label: "GST" },
    { key: "packingCharge", label: "Packing" },
];
const INITIAL_CHARGES = {
    miscCharge: { enabled: false, value: "" },
    claimCharge: { enabled: false, value: "" },
    cashDeposit: { enabled: false, value: "" },
    gstCharge: { enabled: false, value: "" },
    packingCharge: { enabled: false, value: "" },
};
export default function StockSale() {
    var _a;
    const [imagePreview, setImagePreview] = useState(null);
    const [imageBase64, setImageBase64] = useState(null);
    const [items, setItems] = useState([]);
    const [selectedRetailerId, setSelectedRetailerId] = useState("");
    const [selectedStaffId, setSelectedStaffId] = useState("");
    const [invoiceNotes, setInvoiceNotes] = useState("");
    const [charges, setCharges] = useState(INITIAL_CHARGES);
    const [invoiceConfirmed, setInvoiceConfirmed] = useState(false);
    const [confirmedInvoiceId, setConfirmedInvoiceId] = useState(null);
    const [confirmedInvoiceNumber, setConfirmedInvoiceNumber] = useState(null);
    const fileInputRef = useRef(null);
    const galleryInputRef = useRef(null);
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const analyzeSale = useAnalyzeSaleImage();
    const confirmSale = useConfirmSale();
    const createInvoice = useCreateInvoice();
    const confirmInvoice = useConfirmInvoice();
    const { data: retailers } = useListRetailers();
    const { data: staff } = useListStaff();
    const handleImageUpload = async (e) => {
        var _a;
        const file = (_a = e.target.files) === null || _a === void 0 ? void 0 : _a[0];
        if (!file)
            return;
        setImagePreview(URL.createObjectURL(file));
        setItems([]);
        setInvoiceConfirmed(false);
        setConfirmedInvoiceId(null);
        const base64String = await compressImage(file);
        setImageBase64(base64String);
        analyzeSale.mutate({ data: { imageBase64: base64String } }, {
            onSuccess: (data) => {
                // Default every detected product to a standard set quantity of 6 (editable).
                setItems(data.detectedItems.map((item) => ({
                    ...item,
                    quantity: DEFAULT_SALE_QUANTITY,
                })));
                toast({
                    title: "Sale items detected",
                    description: `Found ${data.detectedItems.length} item type(s) in the image.`,
                });
            },
            onError: () => {
                toast({
                    variant: "destructive",
                    title: "Analysis failed",
                    description: "Could not detect items. Please try a clearer image.",
                });
            },
        });
    };
    const updateQuantity = (index, delta) => {
        setItems((prev) => prev.map((item, i) => i === index ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item));
    };
    const setQuantityDirect = (index, value) => {
        setItems((prev) => prev.map((item, i) => i === index ? { ...item, quantity: Math.max(1, value) } : item));
    };
    const removeItem = (index) => {
        setItems((prev) => prev.filter((_, i) => i !== index));
    };
    const validItems = items.filter((item) => !item.notFound);
    const totalUnits = validItems.reduce((sum, i) => sum + i.quantity, 0);
    const totalAmount = validItems.reduce((sum, i) => { var _a, _b; return sum + i.quantity * ((_b = (_a = i.matchedProduct) === null || _a === void 0 ? void 0 : _a.price) !== null && _b !== void 0 ? _b : 0); }, 0);
    const chargeValue = (key) => {
        const c = charges[key];
        if (!c.enabled)
            return 0;
        const n = parseFloat(c.value);
        return Number.isFinite(n) && n > 0 ? n : 0;
    };
    const activeCharges = CHARGE_CONFIG.map((c) => ({ ...c, amount: chargeValue(c.key) })).filter((c) => c.amount > 0);
    const chargesTotal = activeCharges.reduce((sum, c) => sum + c.amount, 0);
    const grandTotal = totalAmount + chargesTotal;
    const toggleCharge = (key) => setCharges((prev) => ({ ...prev, [key]: { ...prev[key], enabled: !prev[key].enabled } }));
    const setChargeValue = (key, value) => setCharges((prev) => ({ ...prev, [key]: { ...prev[key], value } }));
    const selectedRetailer = retailers === null || retailers === void 0 ? void 0 : retailers.find((r) => String(r.id) === selectedRetailerId);
    const selectedStaff = staff === null || staff === void 0 ? void 0 : staff.find((s) => String(s.id) === selectedStaffId);
    const generateInvoiceNumber = useCallback(() => {
        const now = new Date();
        return `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${Math.floor(Math.random() * 9000) + 1000}`;
    }, []);
    const buildInvoiceText = () => {
        var _a, _b;
        const retailerName = ((_a = selectedRetailer === null || selectedRetailer === void 0 ? void 0 : selectedRetailer.name) !== null && _a !== void 0 ? _a : "—").toUpperCase();
        const retailerPhone = (_b = selectedRetailer === null || selectedRetailer === void 0 ? void 0 : selectedRetailer.phone) !== null && _b !== void 0 ? _b : "";
        const now = new Date();
        const dateStr = now.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        }).replace(/\//g, "-");
        const timeStr = now.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
        }).toUpperCase();
        const challanNo = confirmedInvoiceNumber !== null && confirmedInvoiceNumber !== void 0 ? confirmedInvoiceNumber : generateInvoiceNumber();
        const pad = (s, n) => s.slice(0, n).padEnd(n);
        const header = [
            "           ESTIMATE",
            "=".repeat(48),
            `Challan No : ${pad(challanNo, 20)} Date : ${dateStr} ( ${timeStr} )`,
            `M/S : ${pad(retailerName, 26)} Ph n : ${retailerPhone}`,
            `Addr :                                 Tran : .`,
            "=".repeat(48),
            `${"Description of Goods".padEnd(20)} ${"Qty.".padStart(6)} ${"Unit".padEnd(5)} ${"Price".padStart(8)} ${"Amount Rs.".padStart(10)}`,
            "-".repeat(48),
        ];
        const itemLines = validItems.map((item) => {
            var _a, _b, _c, _d, _e, _f;
            const name = ((_b = (_a = item.matchedProduct) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : item.articleCode).slice(0, 20).padEnd(20);
            const qty = `${item.quantity}.00`.padStart(6);
            const unit = "Pcs. ";
            const price = (_d = (_c = item.matchedProduct) === null || _c === void 0 ? void 0 : _c.price.toFixed(2).padStart(8)) !== null && _d !== void 0 ? _d : "      0.00";
            const amount = (item.quantity * ((_f = (_e = item.matchedProduct) === null || _e === void 0 ? void 0 : _e.price) !== null && _f !== void 0 ? _f : 0)).toFixed(2).padStart(10);
            return `${name} ${qty} ${unit} ${price} ${amount}`;
        });
        const chargeLines = activeCharges.map((c) => `${c.label.padEnd(40)} ${c.amount.toFixed(2).padStart(10)}`);
        const footer = [
            "-".repeat(48),
            `${"Sub Total".padEnd(40)} ${totalAmount.toFixed(2).padStart(10)}`,
            ...chargeLines,
            "",
            `Grand Total : ${" ".repeat(8)} ${String(totalUnits).padStart(6)} Pcs. ${" ".repeat(8)} \u20B9 ${grandTotal.toFixed(2).padStart(8)}`,
            "=".repeat(48),
            invoiceNotes ? `Note : ${invoiceNotes}` : "",
        ].filter(Boolean);
        return [...header, ...itemLines, ...footer].join("\n");
    };
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(buildInvoiceText());
            toast({ title: "Copied to clipboard", description: "Invoice text ready to paste." });
        }
        catch {
            toast({ variant: "destructive", title: "Copy failed", description: "Could not access clipboard." });
        }
    };
    const handleShare = async () => {
        const text = buildInvoiceText();
        if (navigator.share) {
            try {
                await navigator.share({ title: "Sale Invoice", text });
            }
            catch { /* user cancelled */ }
        }
        else {
            await handleCopy();
        }
    };
    const handleQuickSale = () => {
        if (validItems.length === 0) {
            toast({ variant: "destructive", title: "No valid items" });
            return;
        }
        confirmSale.mutate({
            data: {
                items: validItems.map((item) => {
                    var _a;
                    return ({
                        articleCode: item.articleCode,
                        productId: (_a = item.matchedProduct) === null || _a === void 0 ? void 0 : _a.id,
                        quantity: item.quantity,
                    });
                }),
                imageUrl: imageBase64 !== null && imageBase64 !== void 0 ? imageBase64 : undefined,
            },
        }, {
            onSuccess: (data) => {
                toast({ title: "Sale confirmed", description: data.message });
                resetPage();
                queryClient.invalidateQueries({ queryKey: getListStockQueryKey() });
            },
            onError: (err) => {
                toast({
                    variant: "destructive",
                    title: "Failed to confirm sale",
                    description: (err === null || err === void 0 ? void 0 : err.message) || "Could not process sale.",
                });
            },
        });
    };
    const handleCreateInvoice = () => {
        if (!selectedRetailerId) {
            toast({ variant: "destructive", title: "Select a retailer", description: "Choose a retailer before creating the invoice." });
            return;
        }
        if (!selectedStaffId) {
            toast({ variant: "destructive", title: "Select staff", description: "Choose the staff member who made the sale." });
            return;
        }
        if (validItems.length === 0) {
            toast({ variant: "destructive", title: "No valid items" });
            return;
        }
        const invoiceNumber = generateInvoiceNumber();
        createInvoice.mutate({
            data: {
                retailerId: Number(selectedRetailerId),
                staffId: Number(selectedStaffId),
                invoiceNumber,
                notes: invoiceNotes || undefined,
                imageUrl: imageBase64 !== null && imageBase64 !== void 0 ? imageBase64 : undefined,
                miscCharge: chargeValue("miscCharge"),
                claimCharge: chargeValue("claimCharge"),
                cashDeposit: chargeValue("cashDeposit"),
                gstCharge: chargeValue("gstCharge"),
                packingCharge: chargeValue("packingCharge"),
                items: validItems.map((item) => {
                    var _a, _b, _c, _d, _e;
                    return ({
                        articleCode: item.articleCode,
                        productName: (_b = (_a = item.matchedProduct) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : item.articleCode,
                        quantity: item.quantity,
                        unitPrice: (_d = (_c = item.matchedProduct) === null || _c === void 0 ? void 0 : _c.price) !== null && _d !== void 0 ? _d : 0,
                        productId: (_e = item.matchedProduct) === null || _e === void 0 ? void 0 : _e.id,
                    });
                }),
            },
        }, {
            onSuccess: (invoice) => {
                confirmInvoice.mutate({ id: invoice.id }, {
                    onSuccess: () => {
                        setInvoiceConfirmed(true);
                        setConfirmedInvoiceId(invoice.id);
                        setConfirmedInvoiceNumber(invoiceNumber);
                        toast({
                            title: "Invoice created & confirmed",
                            description: `Invoice ${invoiceNumber} posted. Stock deducted and ${selectedRetailer === null || selectedRetailer === void 0 ? void 0 : selectedRetailer.name}'s account updated.`,
                        });
                        queryClient.invalidateQueries({ queryKey: getListStockQueryKey() });
                        queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
                        queryClient.invalidateQueries({ queryKey: getListRetailersQueryKey() });
                    },
                    onError: (err) => {
                        toast({
                            variant: "destructive",
                            title: "Invoice created but confirmation failed",
                            description: (err === null || err === void 0 ? void 0 : err.message) || "Invoice is in draft status.",
                        });
                    },
                });
            },
            onError: (err) => {
                toast({
                    variant: "destructive",
                    title: "Failed to create invoice",
                    description: (err === null || err === void 0 ? void 0 : err.message) || "Could not create invoice.",
                });
            },
        });
    };
    const resetPage = () => {
        setImagePreview(null);
        setImageBase64(null);
        setItems([]);
        setSelectedRetailerId("");
        setSelectedStaffId("");
        setInvoiceNotes("");
        setCharges(INITIAL_CHARGES);
        setInvoiceConfirmed(false);
        setConfirmedInvoiceId(null);
        setConfirmedInvoiceNumber(null);
        if (fileInputRef.current)
            fileInputRef.current.value = "";
        if (galleryInputRef.current)
            galleryInputRef.current.value = "";
    };
    const isCreatingInvoice = createInvoice.isPending || confirmInvoice.isPending;
    return (<div className="space-y-6 max-w-[1400px] mx-auto">
      <div>
        <Link href="/stock" className="inline-flex items-center text-sm text-gray-400 hover:text-white mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4 mr-1"/>
          Back to Stock
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">AI Sale Entry</h1>
        <p className="text-gray-400 mt-1">
          Upload a photo of sold items — AI detects each product, auto-fills the invoice
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Column 1: Photo Upload ── */}
        <Card className="bg-black border-white/10">
          <CardHeader>
            <CardTitle>Sale Photo</CardTitle>
            <CardDescription className="text-gray-400">
              Capture all sold footwear in one shot
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Hidden inputs */}
            <input type="file" accept="image/*" capture="environment" className="hidden" ref={fileInputRef} onChange={handleImageUpload}/>
            <input type="file" accept="image/*" className="hidden" ref={galleryInputRef} onChange={handleImageUpload}/>

            <div className={`relative border-2 border-dashed rounded-lg overflow-hidden transition-all flex flex-col items-center justify-center min-h-[200px]
                ${imagePreview ? "border-white/20" : "border-white/10 bg-white/[0.02]"}`}>
              <AnimatePresence mode="wait">
                {imagePreview ? (<motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 w-full h-full">
                    <img src={imagePreview} alt="Sale items" className="w-full h-full object-contain p-2"/>
                  </motion.div>) : (<motion.div key="placeholder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center p-6 text-center">
                    <p className="text-sm text-gray-500">Photo will appear here after upload</p>
                  </motion.div>)}
              </AnimatePresence>
              {analyzeSale.isPending && (<div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                  <div className="h-12 w-12 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4"/>
                  <p className="text-white font-medium">Detecting items with AI...</p>
                </div>)}
            </div>

            {/* Camera / Gallery buttons */}
            <div className="flex gap-2 mt-3">
              <Button variant="outline" className="flex-1 border-white/10 text-white hover:bg-white/5" onClick={() => { var _a; return (_a = fileInputRef.current) === null || _a === void 0 ? void 0 : _a.click(); }} disabled={analyzeSale.isPending}>
                <Camera className="mr-2 h-4 w-4"/> Camera
              </Button>
              <Button variant="outline" className="flex-1 border-white/10 text-white hover:bg-white/5" onClick={() => { var _a; return (_a = galleryInputRef.current) === null || _a === void 0 ? void 0 : _a.click(); }} disabled={analyzeSale.isPending}>
                <Images className="mr-2 h-4 w-4"/> Gallery
              </Button>
            </div>

            {items.length > 0 && (<motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0"/>
                <div>
                  <p className="text-sm font-medium text-white">{items.length} item type{items.length !== 1 ? "s" : ""} detected</p>
                  <p className="text-xs text-gray-400">{totalUnits} units · {formatCurrency(totalAmount)}</p>
                </div>
              </motion.div>)}
          </CardContent>
        </Card>

        {/* ── Column 2: Detected Items ── */}
        <Card className="bg-black border-white/10">
          <CardHeader>
            <CardTitle>Detected Items</CardTitle>
            <CardDescription className="text-gray-400">
              Adjust quantities or remove errors
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!imagePreview && !analyzeSale.isPending && (<div className="flex flex-col items-center justify-center py-14 text-center text-gray-500">
                <PackageOpen className="h-12 w-12 mb-4 text-white/10"/>
                <p>Upload a photo to detect sold items</p>
              </div>)}
            {analyzeSale.isPending && (<div className="flex flex-col items-center justify-center py-14 text-gray-400">
                <div className="h-8 w-8 border-2 border-white/20 border-t-white rounded-full animate-spin mb-3"/>
                <p className="text-sm">Scanning for footwear items...</p>
              </div>)}

            <AnimatePresence>
              {items.length > 0 && !analyzeSale.isPending && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                  {items.map((item, index) => {
                var _a, _b, _c;
                return (<motion.div key={`${item.articleCode}-${index}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ delay: index * 0.04 }} className={`p-2.5 rounded-lg border flex items-center gap-2.5 ${item.notFound ? "bg-red-500/5 border-red-500/20" : "bg-white/[0.03] border-white/10"}`}>
                      <div className="h-10 w-10 rounded-md bg-white/5 flex items-center justify-center shrink-0 overflow-hidden">
                        {((_a = item.matchedProduct) === null || _a === void 0 ? void 0 : _a.imageUrl) ? (<img src={item.matchedProduct.imageUrl} alt={item.matchedProduct.name} className="w-full h-full object-cover"/>) : (<ShoppingBag className="h-5 w-5 text-white/20"/>)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Badge className={`text-xs shrink-0 ${item.notFound ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-black/60 text-white border-white/10"}`}>
                            {item.articleCode}
                          </Badge>
                          {item.notFound && <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0"/>}
                        </div>
                        <p className="text-xs font-medium text-white mt-0.5 truncate">{(_c = (_b = item.matchedProduct) === null || _b === void 0 ? void 0 : _b.name) !== null && _c !== void 0 ? _c : "Unknown"}</p>
                        {item.matchedProduct && (<p className="text-xs text-gray-500">{formatCurrency(item.matchedProduct.price)}</p>)}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button variant="ghost" size="icon" className="h-6 w-6 bg-white/5 hover:bg-white/10 text-white" onClick={() => updateQuantity(index, -1)} disabled={item.notFound}>
                          <Minus className="h-3 w-3"/>
                        </Button>
                        <Input type="number" value={item.quantity} onChange={(e) => setQuantityDirect(index, parseInt(e.target.value) || 1)} className="h-6 w-10 text-center bg-white/5 border-white/10 text-white p-1 text-xs" disabled={item.notFound} min={1}/>
                        <Button variant="ghost" size="icon" className="h-6 w-6 bg-white/5 hover:bg-white/10 text-white" onClick={() => updateQuantity(index, 1)} disabled={item.notFound}>
                          <Plus className="h-3 w-3"/>
                        </Button>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-600 hover:text-red-400 shrink-0" onClick={() => removeItem(index)}>
                        <Trash2 className="h-3.5 w-3.5"/>
                      </Button>
                    </motion.div>);
            })}

                  {items.some((i) => i.notFound) && (<p className="text-xs text-red-400 mt-2 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3"/>
                      Red items not found — remove before invoicing
                    </p>)}

                  <div className="pt-3 border-t border-white/10 mt-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{validItems.length} product(s) · {totalUnits} units</span>
                      <span className="font-semibold text-white">{formatCurrency(totalAmount)}</span>
                    </div>
                    <Button onClick={handleQuickSale} disabled={confirmSale.isPending || totalUnits === 0} variant="outline" className="w-full border-white/10 text-white hover:bg-white/5 text-sm py-2">
                      {confirmSale.isPending ? "Processing..." : "Quick Sale (no invoice)"}
                    </Button>
                  </div>
                </motion.div>)}
            </AnimatePresence>
          </CardContent>
        </Card>

        {/* ── Column 3: Invoice ── */}
        <Card className="bg-black border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5"/>
              Invoice
            </CardTitle>
            <CardDescription className="text-gray-400">
              Create a retailer invoice — updates ledger automatically
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {invoiceConfirmed ? (<motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-center space-y-2">
                  <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto"/>
                  <p className="font-semibold text-white">Invoice Confirmed</p>
                  <p className="text-sm text-gray-400">
                    Stock deducted · {selectedRetailer === null || selectedRetailer === void 0 ? void 0 : selectedRetailer.name}'s ledger updated
                  </p>
                  {confirmedInvoiceId && (<Link href={`/invoices/${confirmedInvoiceId}`}>
                      <Button variant="outline" size="sm" className="mt-2 border-white/10 text-white hover:bg-white/5">
                        View Invoice →
                      </Button>
                    </Link>)}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 border-white/10 text-white hover:bg-white/5" onClick={handleCopy}>
                    <Copy className="mr-2 h-4 w-4"/> Copy
                  </Button>
                  <Button variant="outline" className="flex-1 border-white/10 text-white hover:bg-white/5" onClick={handleShare}>
                    <Share2 className="mr-2 h-4 w-4"/> Share
                  </Button>
                </div>
                <Button onClick={resetPage} className="w-full bg-white text-black hover:bg-gray-200">
                  New Sale
                </Button>
              </motion.div>) : (<>
                {/* Retailer */}
                <div className="space-y-1.5">
                  <Label className="text-sm text-gray-300">Retailer *</Label>
                  <Select value={selectedRetailerId} onValueChange={setSelectedRetailerId} disabled={validItems.length === 0}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Select retailer…"/>
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-950 border-white/10 text-white">
                      {retailers === null || retailers === void 0 ? void 0 : retailers.map((r) => (<SelectItem key={r.id} value={String(r.id)}>
                          {r.name}
                        </SelectItem>))}
                    </SelectContent>
                  </Select>
                  {selectedRetailer && (<Input readOnly value={(_a = selectedRetailer.phone) !== null && _a !== void 0 ? _a : "No phone on file"} className="bg-white/5 border-white/10 text-gray-300 mt-1.5" data-testid="input-retailer-phone"/>)}
                </div>

                {/* Staff */}
                <div className="space-y-1.5">
                  <Label className="text-sm text-gray-300">Staff *</Label>
                  <Select value={selectedStaffId} onValueChange={setSelectedStaffId} disabled={validItems.length === 0}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Select staff…"/>
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-950 border-white/10 text-white">
                      {staff === null || staff === void 0 ? void 0 : staff.map((s) => (<SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Items summary */}
                <div className="space-y-1.5">
                  <Label className="text-sm text-gray-300">Items</Label>
                  {validItems.length === 0 ? (<div className="py-4 text-center text-xs text-gray-600 border border-dashed border-white/10 rounded-lg">
                      Detected items will appear here
                    </div>) : (<div className="space-y-1 rounded-lg border border-white/10 divide-y divide-white/5 overflow-hidden">
                      {validItems.map((item, i) => {
                    var _a, _b, _c, _d;
                    return (<div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="text-white font-medium truncate text-xs">{(_b = (_a = item.matchedProduct) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : item.articleCode}</p>
                            <p className="text-gray-500 text-xs">{item.articleCode} × {item.quantity}</p>
                          </div>
                          <p className="text-white font-medium text-xs shrink-0 ml-2">
                            {formatCurrency(item.quantity * ((_d = (_c = item.matchedProduct) === null || _c === void 0 ? void 0 : _c.price) !== null && _d !== void 0 ? _d : 0))}
                          </p>
                        </div>);
                })}
                      {chargesTotal > 0 && (<div className="flex justify-between px-3 py-1.5 text-xs">
                          <span className="text-gray-400">Sub Total</span>
                          <span className="text-gray-300">{formatCurrency(totalAmount)}</span>
                        </div>)}
                      {activeCharges.map((c) => (<div key={c.key} className="flex justify-between px-3 py-1.5 text-xs">
                          <span className="text-gray-400">{c.label}</span>
                          <span className="text-gray-300">{formatCurrency(c.amount)}</span>
                        </div>))}
                      <div className="flex justify-between px-3 py-2 bg-white/[0.03]">
                        <span className="text-sm font-semibold text-white">
                          {chargesTotal > 0 ? "Grand Total" : "Total"}
                        </span>
                        <span className="text-sm font-bold text-white">{formatCurrency(grandTotal)}</span>
                      </div>
                    </div>)}
                </div>

                {/* Extra Charges */}
                <div className="space-y-1.5">
                  <Label className="text-sm text-gray-300">Extra Charges</Label>
                  <div className="rounded-lg border border-white/10 divide-y divide-white/5 overflow-hidden">
                    {CHARGE_CONFIG.map((c) => {
                const state = charges[c.key];
                return (<div key={c.key} className="flex items-center gap-2 px-3 py-2">
                          <button type="button" onClick={() => toggleCharge(c.key)} disabled={validItems.length === 0} aria-pressed={state.enabled} className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${state.enabled
                        ? "bg-white border-white text-black"
                        : "border-white/30 text-transparent hover:border-white/60"} ${validItems.length === 0 ? "opacity-40 cursor-not-allowed" : ""}`} data-testid={`checkbox-charge-${c.key}`}>
                            <CheckCircle2 className="h-3 w-3"/>
                          </button>
                          <span className="text-sm text-gray-300 flex-1">{c.label}</span>
                          <div className="relative w-28 shrink-0">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">₹</span>
                            <Input type="number" inputMode="decimal" min={0} placeholder="0" value={state.value} onChange={(e) => setChargeValue(c.key, e.target.value)} onFocus={() => {
                        if (!state.enabled)
                            toggleCharge(c.key);
                    }} disabled={!state.enabled || validItems.length === 0} className="h-8 pl-5 bg-white/5 border-white/10 text-white text-sm text-right" data-testid={`input-charge-${c.key}`}/>
                          </div>
                        </div>);
            })}
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <Label className="text-sm text-gray-300">Notes (optional)</Label>
                  <Input placeholder="e.g. Cash payment, partial delivery…" className="bg-white/5 border-white/10 text-white placeholder:text-gray-600" value={invoiceNotes} onChange={(e) => setInvoiceNotes(e.target.value)} disabled={validItems.length === 0}/>
                </div>

                {/* Export row */}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 border-white/10 text-white hover:bg-white/5" onClick={handleCopy} disabled={validItems.length === 0}>
                    <Copy className="mr-1.5 h-3.5 w-3.5"/> Copy
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 border-white/10 text-white hover:bg-white/5" onClick={handleShare} disabled={validItems.length === 0}>
                    <Share2 className="mr-1.5 h-3.5 w-3.5"/> Share
                  </Button>
                </div>

                {/* Create Invoice button */}
                <Button onClick={handleCreateInvoice} disabled={isCreatingInvoice || validItems.length === 0 || !selectedRetailerId || !selectedStaffId} className="w-full bg-white text-black hover:bg-gray-200 py-5 text-sm font-semibold" data-testid="button-create-invoice">
                  {isCreatingInvoice ? (<span className="flex items-center gap-2">
                      <div className="h-4 w-4 border-2 border-black/30 border-t-black rounded-full animate-spin"/>
                      {createInvoice.isPending ? "Creating…" : "Confirming…"}
                    </span>) : (<>
                      <FileText className="mr-2 h-4 w-4"/>
                      Create &amp; Confirm Invoice
                    </>)}
                </Button>

                <p className="text-xs text-gray-600 text-center leading-relaxed">
                  This will create a confirmed invoice, deduct stock, and update the retailer's outstanding balance.
                </p>
              </>)}
          </CardContent>
        </Card>
      </div>
    </div>);
}
