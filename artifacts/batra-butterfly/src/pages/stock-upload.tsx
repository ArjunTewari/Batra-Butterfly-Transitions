import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import {
  useAnalyzeStockImage,
  useConfirmStockMovement,
  getListStockQueryKey,
  useListStock,
  useListSuppliers,
  getListSuppliersQueryKey,
} from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Image as ImageIcon, CheckCircle2, AlertCircle, RefreshCw, Box, Plus, X, Factory } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const MAX_IMAGES = 5;

const formSchema = z.object({
  articleCode: z.string().min(1, "Article code is required"),
  name: z.string().min(1, "Product name is required"),
  price: z.coerce.number().min(1, "Selling price must be greater than 0"),
  purchasePrice: z.coerce.number().min(0, "Purchase price must be positive"),
  quantity: z.coerce.number().min(1, "Quantity must be greater than 0"),
  supplierName: z.string().optional(),
});

interface ImageEntry {
  preview: string;
  base64: string;
}

export default function StockUpload() {
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [showSupplierSuggestions, setShowSupplierSuggestions] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supplierInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: stockItems } = useListStock({ query: { queryKey: getListStockQueryKey() } });
  const { data: suppliers } = useListSuppliers({ query: { queryKey: getListSuppliersQueryKey() } });

  const analyzeImage = useAnalyzeStockImage();
  const confirmMovement = useConfirmStockMovement();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      articleCode: "",
      name: "",
      price: 0,
      purchasePrice: 0,
      quantity: 1,
      supplierName: "",
    },
  });

  const filteredSuppliers = suppliers
    ? suppliers.filter((s) => s.name.toLowerCase().includes(supplierQuery.toLowerCase()))
    : [];

  const handleSupplierSelect = (id: number, name: string) => {
    setSelectedSupplierId(id);
    setSupplierQuery(name);
    form.setValue("supplierName", name);
    setShowSupplierSuggestions(false);
  };

  const handleSupplierInputChange = (value: string) => {
    setSupplierQuery(value);
    form.setValue("supplierName", value);
    setSelectedSupplierId(null);
    setShowSupplierSuggestions(true);
  };

  // Close suggestions on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (supplierInputRef.current && !supplierInputRef.current.contains(e.target as Node)) {
        setShowSupplierSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const remaining = MAX_IMAGES - images.length;
    const toAdd = files.slice(0, remaining);

    const newEntries: ImageEntry[] = [];
    let loaded = 0;

    toAdd.forEach((file) => {
      const preview = URL.createObjectURL(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        newEntries.push({ preview, base64: reader.result as string });
        loaded++;
        if (loaded === toAdd.length) {
          setImages((prev) => {
            const updated = [...prev, ...newEntries];
            setActiveIdx(updated.length - 1);
            return updated;
          });
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (idx: number) => {
    setImages((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      setActiveIdx(Math.min(activeIdx, Math.max(0, next.length - 1)));
      return next;
    });
    analyzeImage.reset();
    form.reset();
  };

  const handleAnalyze = () => {
    if (!images.length) return;
    analyzeImage.mutate(
      { data: { imageBase64s: images.map((img) => img.base64) } },
      {
        onSuccess: (data) => {
          const isNew = !data.matchedProduct;
          const matched = data.matchedProduct;
          toast({
            title: isNew ? "New product detected" : "Existing product found",
            description: isNew
              ? `Confidence: ${(data.confidence * 100).toFixed(0)}% — Article ${data.predictedArticleCode}`
              : matched
                ? `${matched.name} (${matched.articleCode}) — In stock: ${matched.currentStock}`
                : `Article ${data.predictedArticleCode}`,
          });

          form.setValue("articleCode", data.predictedArticleCode);
          if (isNew) {
            form.setValue("name", data.suggestedName ?? "");
            form.setValue("price", data.suggestedPrice ?? 0);
            form.setValue("purchasePrice", 0);
          } else if (matched) {
            form.setValue("name", matched.name);
            form.setValue("price", matched.price ?? 0);
            form.setValue("purchasePrice", matched.purchasePrice ?? 0);
          }
        },
        onError: (err: unknown) => {
          const apiErr = err as { status?: number; message?: string };
          if (apiErr?.status === 401) {
            toast({
              variant: "destructive",
              title: "Session expired",
              description: "Please log in again to continue.",
            });
            window.location.href = "/account";
            return;
          }
          toast({
            variant: "destructive",
            title: "Analysis failed",
            description: apiErr?.message || "Could not identify the footwear. Please enter the article manually.",
          });
        },
      },
    );
  };

  // Auto-analyze when first image is added
  const prevImageCount = useRef(0);
  if (images.length > prevImageCount.current && images.length > 0 && !analyzeImage.isPending) {
    prevImageCount.current = images.length;
    setTimeout(handleAnalyze, 0);
  }

  const isNewProduct = analyzeImage.data ? !analyzeImage.data.matchedProduct : false;

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const matchedProduct =
      analyzeImage.data?.allProducts.find((p) => p.articleCode === values.articleCode) ||
      stockItems?.find((p) => p.articleCode === values.articleCode);

    confirmMovement.mutate(
      {
        data: {
          productId: matchedProduct?.id,
          articleCode: values.articleCode,
          quantity: values.quantity,
          type: "in",
          imageUrl: images[0]?.base64 ?? null,
          imageUrls: images.map((img) => img.base64),
          name: values.name.trim(),
          price: values.price,
          purchasePrice: values.purchasePrice,
          supplierId: selectedSupplierId ?? undefined,
          supplierName: values.supplierName?.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: isNewProduct ? "New product created" : "Stock updated",
            description: isNewProduct
              ? `Created ${values.articleCode} and added ${values.quantity} items.`
              : `Restocked ${values.articleCode} — ${values.quantity} items added.`,
          });
          setImages([]);
          prevImageCount.current = 0;
          form.reset();
          setSupplierQuery("");
          setSelectedSupplierId(null);
          analyzeImage.reset();
          if (fileInputRef.current) fileInputRef.current.value = "";
          queryClient.invalidateQueries({ queryKey: getListStockQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            title: "Failed",
            description: (err as Error)?.message || "Could not process stock movement.",
          });
        },
      },
    );
  };

  const hasImages = images.length > 0;
  const canAddMore = images.length < MAX_IMAGES;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <Link href="/stock" className="inline-flex items-center text-sm text-gray-400 hover:text-white mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Stock
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">AI Stock Input</h1>
        <p className="text-gray-400 mt-1">Upload up to {MAX_IMAGES} photos — AI uses all images for better recognition</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Col: Upload & Preview */}
        <Card className="bg-black border-white/10">
          <CardHeader>
            <CardTitle>Capture Images</CardTitle>
            <CardDescription className="text-gray-400">
              Add up to {MAX_IMAGES} photos from different angles
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Main preview */}
            <div
              className={`relative border-2 border-dashed rounded-lg overflow-hidden transition-all flex flex-col items-center justify-center min-h-[260px] cursor-pointer
                ${hasImages ? "border-white/20" : "border-white/10 hover:border-white/30 bg-white/[0.02]"}
              `}
              onClick={() => !hasImages && fileInputRef.current?.click()}
            >
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileChange}
              />

              <AnimatePresence mode="wait">
                {hasImages ? (
                  <motion.div
                    key="preview"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 w-full h-full"
                  >
                    <img
                      src={images[activeIdx]?.preview}
                      alt="Preview"
                      className="w-full h-full object-contain p-2"
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="placeholder"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center p-6 text-center"
                  >
                    <div className="h-16 w-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                      <ImageIcon className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="text-lg font-medium text-white mb-2">Tap to Add Photos</p>
                    <p className="text-sm text-gray-500">Select up to {MAX_IMAGES} images from your gallery</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {analyzeImage.isPending && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                  <div className="h-12 w-12 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4"></div>
                  <p className="text-white font-medium">Analyzing {images.length} image{images.length > 1 ? "s" : ""} with Vision AI…</p>
                </div>
              )}
            </div>

            {/* Thumbnail strip */}
            {hasImages && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-2 flex-wrap"
              >
                {images.map((img, idx) => (
                  <div
                    key={idx}
                    className={`relative w-16 h-16 rounded-md overflow-hidden border-2 cursor-pointer transition-all
                      ${idx === activeIdx ? "border-white" : "border-white/20 hover:border-white/50"}
                    `}
                    onClick={() => setActiveIdx(idx)}
                  >
                    <img src={img.preview} alt={`img-${idx}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                      className="absolute top-0.5 right-0.5 bg-black/70 rounded-full p-0.5 hover:bg-red-600/80 transition-colors"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ))}

                {canAddMore && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-16 h-16 rounded-md border-2 border-dashed border-white/20 hover:border-white/50 flex items-center justify-center transition-all"
                  >
                    <Plus className="h-5 w-5 text-gray-400" />
                  </button>
                )}
              </motion.div>
            )}

            {/* Re-analyze button */}
            {hasImages && !analyzeImage.isPending && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full border-white/10 text-gray-300 hover:text-white"
                onClick={handleAnalyze}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Re-analyse {images.length} image{images.length > 1 ? "s" : ""}
              </Button>
            )}

            {/* Analysis result */}
            {analyzeImage.data && !analyzeImage.isPending && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 flex items-start gap-4"
              >
                <div className="mt-1">
                  {analyzeImage.data.confidence > 0.8 ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                  )}
                </div>
                <div>
                  <h4 className="font-semibold text-white">Analysis Complete</h4>
                  <p className="text-sm text-gray-400 mt-1">
                    Detected Article: <span className="text-white font-medium">{analyzeImage.data.predictedArticleCode}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Confidence Score: {(analyzeImage.data.confidence * 100).toFixed(1)}%
                    {images.length > 1 && ` · ${images.length} images used`}
                  </p>
                </div>
              </motion.div>
            )}
          </CardContent>
        </Card>

        {/* Right Col: Form */}
        <Card className="bg-black border-white/10">
          <CardHeader>
            <CardTitle>Confirm Details</CardTitle>
            <CardDescription className="text-gray-400">
              {isNewProduct
                ? "New product detected. Fill in the details to create it."
                : "Existing product found. You can update the prices before restocking."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="articleCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Article Code</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. BT-402"
                          className="bg-white/5 border-white/10 text-white font-medium"
                          {...field}
                          data-testid="input-upload-article"
                          disabled={!hasImages}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter product name"
                          className="bg-white/5 border-white/10 text-white"
                          {...field}
                          data-testid="input-upload-name"
                          disabled={!hasImages}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="purchasePrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Purchase Price (₹)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="0"
                            className="bg-white/5 border-white/10 text-white"
                            {...field}
                            data-testid="input-upload-purchase"
                            disabled={!hasImages}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Selling Price (₹)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="0"
                            className="bg-white/5 border-white/10 text-white"
                            {...field}
                            data-testid="input-upload-price"
                            disabled={!hasImages}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          className="bg-white/5 border-white/10 text-white"
                          {...field}
                          data-testid="input-upload-qty"
                          disabled={!hasImages}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Supplier / Factory Name — with autocomplete */}
                <FormField
                  control={form.control}
                  name="supplierName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <Factory className="inline h-3.5 w-3.5 mr-1" />
                        Supplier / Factory Name
                      </FormLabel>
                      <FormControl>
                        <div className="relative" ref={supplierInputRef}>
                          <Input
                            placeholder="Type or select supplier..."
                            className="bg-white/5 border-white/10 text-white"
                            value={supplierQuery}
                            onChange={(e) => {
                              handleSupplierInputChange(e.target.value);
                              field.onChange(e.target.value);
                            }}
                            onFocus={() => setShowSupplierSuggestions(true)}
                            disabled={!hasImages}
                            data-testid="input-upload-supplier"
                          />
                          <AnimatePresence>
                            {showSupplierSuggestions && filteredSuppliers.length > 0 && (
                              <motion.div
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                className="absolute z-20 w-full mt-1 bg-black border border-white/10 rounded-md shadow-lg max-h-48 overflow-y-auto"
                              >
                                {filteredSuppliers.map((s) => (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => {
                                      handleSupplierSelect(s.id, s.name);
                                      field.onChange(s.name);
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors flex items-center justify-between"
                                  >
                                    <span>{s.name}</span>
                                    {selectedSupplierId === s.id && (
                                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    )}
                                  </button>
                                ))}
                              </motion.div>
                            )}
                            {showSupplierSuggestions && supplierQuery.trim() && filteredSuppliers.length === 0 && (
                              <motion.div
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                className="absolute z-20 w-full mt-1 bg-black border border-white/10 rounded-md shadow-lg p-3"
                              >
                                <p className="text-sm text-gray-400">
                                  No existing supplier found. <span className="text-white font-medium">"{supplierQuery.trim()}"</span> will be created automatically.
                                </p>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={!hasImages || confirmMovement.isPending || analyzeImage.isPending}
                  className="w-full bg-white text-black hover:bg-gray-200 py-6 text-lg font-semibold"
                  data-testid="button-submit-upload"
                >
                  {confirmMovement.isPending ? (
                    "Processing..."
                  ) : (
                    <>
                      <Box className="mr-2 h-5 w-5" />
                      {isNewProduct ? "Create Product" : "Restock Product"}
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
