import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useListSuppliers, useCreateSupplier, getListSuppliersQueryKey, } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { Truck, Plus, Search, Phone, MapPin, Receipt, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { useForm } from "react-hook-form";
export default function Suppliers() {
    const { data: suppliers = [], isLoading } = useListSuppliers();
    const createSupplier = useCreateSupplier();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const [search, setSearch] = useState("");
    const [showCreate, setShowCreate] = useState(false);
    const { register, handleSubmit, reset, formState: { errors } } = useForm();
    const filtered = suppliers.filter((s) => {
        var _a, _b;
        return s.name.toLowerCase().includes(search.toLowerCase()) ||
            ((_a = s.phone) !== null && _a !== void 0 ? _a : "").includes(search) ||
            ((_b = s.gstin) !== null && _b !== void 0 ? _b : "").toLowerCase().includes(search.toLowerCase());
    });
    const onCreateSubmit = async (data) => {
        try {
            await createSupplier.mutateAsync({
                data: {
                    name: data.name,
                    phone: data.phone || undefined,
                    address: data.address || undefined,
                    gstin: data.gstin || undefined,
                },
            });
            await queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
            toast({ title: "Supplier added" });
            reset();
            setShowCreate(false);
        }
        catch {
            toast({ title: "Failed to create supplier", variant: "destructive" });
        }
    };
    return (<div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-gray-400 mt-1">Manage vendors and scan purchase bills</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4"/> Add Supplier
        </Button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="bg-black border-white/10">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Total Suppliers</p>
            <p className="text-2xl font-bold mt-1">{suppliers.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-black border-white/10">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Total Bills</p>
            <p className="text-2xl font-bold mt-1">{suppliers.reduce((s, x) => s + x.billCount, 0)}</p>
          </CardContent>
        </Card>
        <Card className="bg-black border-white/10">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Total Spend</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(suppliers.reduce((s, x) => s + x.totalSpend, 0))}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"/>
        <Input placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-black border-white/10 text-white placeholder:text-gray-500"/>
      </div>

      {/* Supplier list */}
      {isLoading ? (<div className="space-y-3">
          {[...Array(4)].map((_, i) => (<div key={i} className="h-28 bg-white/5 rounded-xl animate-pulse"/>))}
        </div>) : filtered.length === 0 ? (<div className="text-center py-20 text-gray-500">
          <Truck className="h-12 w-12 mx-auto mb-3 opacity-30"/>
          <p>No suppliers found</p>
        </div>) : (<div className="space-y-3">
          {filtered.map((supplier, i) => (<motion.div key={supplier.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Link href={`/suppliers/${supplier.id}`}>
                <Card className="bg-black border-white/10 hover:border-white/30 cursor-pointer transition-all duration-200 group">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold">{supplier.name.charAt(0)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-white group-hover:text-white/80 transition truncate">
                            {supplier.name}
                          </h3>
                          {supplier.phone && (<p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                              <Phone className="h-3 w-3"/> {supplier.phone}
                            </p>)}
                          {supplier.address && (<p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5 truncate">
                              <MapPin className="h-3 w-3 flex-shrink-0"/> {supplier.address}
                            </p>)}
                          {supplier.gstin && (<p className="text-xs text-gray-500 mt-0.5 font-mono">GSTIN: {supplier.gstin}</p>)}
                        </div>
                      </div>
                      <div className="flex items-center gap-6 ml-4 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-xs text-gray-400 flex items-center gap-1">
                            <Receipt className="h-3 w-3"/> {supplier.billCount} bills
                          </p>
                          <p className="text-sm font-semibold text-white mt-0.5">
                            {formatCurrency(supplier.totalSpend)}
                          </p>
                          {supplier.lastBillDate && (<p className="text-xs text-gray-500">
                              Last: {new Date(supplier.lastBillDate).toLocaleDateString("en-IN")}
                            </p>)}
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-600 group-hover:text-white transition"/>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>))}
        </div>)}

      {/* Create Supplier Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-black border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Add Supplier</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onCreateSubmit)} className="space-y-4 mt-2">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider">Name *</label>
              <Input {...register("name", { required: true })} placeholder="Supplier company name" className="mt-1 bg-white/5 border-white/10 text-white"/>
              {errors.name && <p className="text-xs text-red-400 mt-1">Required</p>}
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider">Phone</label>
              <Input {...register("phone")} placeholder="9876543210" className="mt-1 bg-white/5 border-white/10 text-white"/>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider">Address</label>
              <Input {...register("address")} placeholder="City, State" className="mt-1 bg-white/5 border-white/10 text-white"/>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider">GSTIN</label>
              <Input {...register("gstin")} placeholder="27BBBCS5678B2Z1" className="mt-1 bg-white/5 border-white/10 text-white font-mono"/>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={createSupplier.isPending}>
                {createSupplier.isPending ? "Adding..." : "Add Supplier"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>);
}
