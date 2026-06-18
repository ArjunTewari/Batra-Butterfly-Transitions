import { useState } from "react";
import { Link } from "wouter";
import {
  useCreateStockItem,
  useDeleteStockItem,
  useListAirtableStock,
  getListAirtableStockQueryKey,
} from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  Plus,
  Package,
  Upload,
  ArrowRight,
  PackageOpen,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatCurrency } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  articleCode: z.string().min(1, "Article code is required"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  price: z.coerce.number().min(1, "Selling price must be greater than 0"),
  purchasePrice: z.coerce.number().min(0, "Purchase price must be positive"),
  currentStock: z.coerce.number().min(0, "Stock cannot be negative"),
});

export default function Stock() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: stock, isLoading } = useListAirtableStock({
    query: { queryKey: getListAirtableStockQueryKey() },
  });

  const createStockItem = useCreateStockItem();
  const deleteStockItem = useDeleteStockItem();

  const handleDelete = (id: number) => {
    deleteStockItem.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAirtableStockQueryKey() });
        },
      },
    );
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      articleCode: "",
      name: "",
      price: 0,
      purchasePrice: 0,
      currentStock: 0,
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createStockItem.mutate(
      { data: values },
      {
        onSuccess: () => {
          setIsAddOpen(false);
          form.reset();
          queryClient.invalidateQueries({ queryKey: getListAirtableStockQueryKey() });
        },
      },
    );
  };

  const filteredStock = stock?.filter(
    (item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.articleCode.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 },
    },
  };

  const cardItem = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Stock Management
          </h1>
          <p className="text-gray-400 mt-1">
            Live catalog from Airtable — stock is tracked locally
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/stock/upload">
            <Button
              variant="outline"
              className="bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white"
              data-testid="button-stock-upload"
            >
              <Upload className="mr-2 h-4 w-4" />
              AI Upload
            </Button>
          </Link>

          <Link href="/stock/sale">
            <Button
              variant="outline"
              className="bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white"
              data-testid="button-stock-sale"
            >
              <ShoppingBag className="mr-2 h-4 w-4" />
              Sale
            </Button>
          </Link>

          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button
                data-testid="button-add-stock"
                className="bg-white text-black hover:bg-gray-200"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-black border border-white/10 text-white sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Product</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-4 pt-4"
                >
                  <FormField
                    control={form.control}
                    name="articleCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Article Code</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. BT-402"
                            className="bg-white/5 border-white/10 text-white"
                            {...field}
                            data-testid="input-stock-article"
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
                            data-testid="input-stock-name"
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
                              data-testid="input-stock-purchase"
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
                              data-testid="input-stock-price"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="currentStock"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Initial Stock</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="0"
                            className="bg-white/5 border-white/10 text-white"
                            {...field}
                            data-testid="input-stock-qty"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end pt-4">
                    <Button
                      type="submit"
                      disabled={createStockItem.isPending}
                      className="bg-white text-black hover:bg-gray-200"
                      data-testid="button-submit-stock"
                    >
                      {createStockItem.isPending ? "Saving..." : "Save Product"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
        <Input
          placeholder="Search by name or article code..."
          className="pl-10 bg-black border-white/10 text-white w-full max-w-md"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          data-testid="input-search-stock"
        />
      </div>

      {isLoading ? (
        <div className="text-gray-400">Loading stock data...</div>
      ) : filteredStock?.length === 0 ? (
        <div className="text-center py-12 text-gray-500 border border-white/5 rounded-lg border-dashed">
          No products found matching "{searchTerm}"
        </div>
      ) : (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          {filteredStock?.map((item) => (
            <motion.div key={item.articleCode} variants={cardItem}>
              <Card className="bg-black border-white/10 hover:bg-white/[0.02] transition-colors group h-full">
                <CardContent className="p-0">
                  <div className="h-32 bg-white/5 flex items-center justify-center relative overflow-hidden">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                      />
                    ) : (
                      <PackageOpen className="h-12 w-12 text-white/10" />
                    )}
                    <Badge className="absolute top-2 right-2 bg-black/60 backdrop-blur-md text-white border-white/10">
                      {item.articleCode}
                    </Badge>
                    {item.localId != null && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            type="button"
                            className="absolute top-2 left-2 p-1.5 rounded-md bg-black/60 backdrop-blur-md text-gray-400 hover:text-red-400 hover:bg-black/80 transition-colors"
                            data-testid={`button-delete-${item.localId}`}
                            aria-label="Delete product"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-black border border-white/10 text-white">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete "{item.name}"?</AlertDialogTitle>
                            <AlertDialogDescription className="text-gray-400">
                              This permanently removes the product, its photos, and its
                              stock movement history. Past invoices are kept. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white">
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(item.localId!)}
                              className="bg-red-600 text-white hover:bg-red-700"
                              data-testid={`button-confirm-delete-${item.localId}`}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                  <div className="p-4">
                    <h3
                      className="font-semibold text-lg truncate"
                      title={item.name}
                    >
                      {item.name}
                    </h3>
                    <div className="grid grid-cols-3 gap-3 mt-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Purchase</p>
                        <p className="font-medium text-white">
                          {item.purchasePrice
                            ? formatCurrency(item.purchasePrice)
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Selling</p>
                        <p className="font-medium text-white">
                          {formatCurrency(item.price)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500 mb-1">In Stock</p>
                        <p
                          className={`font-bold text-lg ${item.currentStock <= 10 ? "text-red-400" : "text-green-400"}`}
                        >
                          {item.currentStock}
                        </p>
                      </div>
                    </div>
                    {item.purchasePrice && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">Margin</span>
                          <span className="text-xs font-medium text-green-400">
                            {formatCurrency(item.price - item.purchasePrice)}{" "}
                            per unit
                            <span className="text-gray-500 ml-1">
                              (
                              {Math.round(
                                ((item.price - item.purchasePrice) /
                                  item.price) *
                                  100,
                              )}
                              %)
                            </span>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
