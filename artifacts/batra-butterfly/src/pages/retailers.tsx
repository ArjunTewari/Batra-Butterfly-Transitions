import { useState } from "react";
import { useListRetailers, getListRetailersQueryKey, useCreateRetailer } from "@workspace/api-client-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Phone, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().min(10, "Phone must be at least 10 characters"),
  creditLimit: z.coerce.number().min(0, "Credit limit must be positive"),
});

export default function Retailers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const queryClient = useQueryClient();
  
  const { data: retailers, isLoading } = useListRetailers({ query: { queryKey: getListRetailersQueryKey() } });
  
  const createRetailer = useCreateRetailer();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      phone: "",
      creditLimit: 0,
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createRetailer.mutate({ data: values }, {
      onSuccess: () => {
        setIsAddOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListRetailersQueryKey() });
      }
    });
  };

  const filteredRetailers = retailers?.filter(r => 
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.phone.includes(searchTerm)
  );

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Retailers</h1>
          <p className="text-gray-400 mt-1">Manage retail partners and their ledgers</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-retailer" className="bg-white text-black hover:bg-gray-200">
              <Plus className="mr-2 h-4 w-4" />
              Add Retailer
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-black border border-white/10 text-white sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New Retailer</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter business name" className="bg-white/5 border-white/10 text-white" {...field} data-testid="input-retailer-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter phone number" className="bg-white/5 border-white/10 text-white" {...field} data-testid="input-retailer-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="creditLimit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Credit Limit (₹)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="Enter credit limit" className="bg-white/5 border-white/10 text-white" {...field} data-testid="input-retailer-credit" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createRetailer.isPending} className="bg-white text-black hover:bg-gray-200" data-testid="button-submit-retailer">
                    {createRetailer.isPending ? "Saving..." : "Save Retailer"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
        <Input 
          placeholder="Search retailers by name or phone..." 
          className="pl-10 bg-black border-white/10 text-white w-full max-w-md"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          data-testid="input-search-retailers"
        />
      </div>

      {isLoading ? (
        <div className="text-gray-400">Loading retailers...</div>
      ) : filteredRetailers?.length === 0 ? (
        <div className="text-center py-12 text-gray-500 border border-white/5 rounded-lg border-dashed">
          No retailers found matching "{searchTerm}"
        </div>
      ) : (
        <motion.div 
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        >
          {filteredRetailers?.map((retailer) => (
            <motion.div key={retailer.id} variants={item}>
              <Link href={`/retailers/${retailer.id}`}>
                <Card className="bg-black border-white/10 hover:bg-white/[0.02] transition-colors cursor-pointer group h-full">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">{retailer.name}</h3>
                          {retailer.isOverdue && (
                            <Badge variant="destructive" className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border-red-500/50">
                              Overdue ({retailer.daysOverdue}d)
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center text-sm text-gray-400 mt-1">
                          <Phone className="h-3 w-3 mr-1" />
                          {retailer.phone}
                        </div>
                      </div>
                      <div className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white text-gray-400 group-hover:text-black transition-colors">
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mt-6">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Outstanding</p>
                        <p className={`font-medium ${retailer.outstanding > retailer.creditLimit ? 'text-red-400' : 'text-white'}`}>
                          {formatCurrency(retailer.outstanding)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Credit Limit</p>
                        <p className="text-gray-300 font-medium">
                          {formatCurrency(retailer.creditLimit)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="mt-4 w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${retailer.outstanding > retailer.creditLimit ? 'bg-red-500' : 'bg-blue-500'}`}
                        style={{ width: `${Math.min(100, Math.max(0, (retailer.outstanding / retailer.creditLimit) * 100))}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
