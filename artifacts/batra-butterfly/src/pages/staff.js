import { useState } from "react";
import { getListStaffQueryKey, useCreateStaff, useGetStaffPerformance, getGetStaffPerformanceQueryKey } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trophy, Target, Award } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
const formSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    commissionRate: z.coerce.number().min(0, "Rate must be positive").max(100, "Rate cannot exceed 100"),
});
export default function Staff() {
    const [isAddOpen, setIsAddOpen] = useState(false);
    const queryClient = useQueryClient();
    const { data: performance, isLoading } = useGetStaffPerformance({}, {
        query: { queryKey: getGetStaffPerformanceQueryKey({}) }
    });
    const createStaff = useCreateStaff();
    const form = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            commissionRate: 2.0,
        },
    });
    const onSubmit = (values) => {
        createStaff.mutate({ data: values }, {
            onSuccess: () => {
                setIsAddOpen(false);
                form.reset();
                queryClient.invalidateQueries({ queryKey: getListStaffQueryKey() });
                queryClient.invalidateQueries({ queryKey: getGetStaffPerformanceQueryKey({}) });
            }
        });
    };
    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };
    const item = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };
    // Sort by total sales for leaderboard
    const sortedPerformance = [...(performance || [])].sort((a, b) => b.totalSales - a.totalSales);
    return (<div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Staff Leaderboard</h1>
          <p className="text-gray-400 mt-1">Track sales performance and commissions</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-staff" className="bg-white text-black hover:bg-gray-200">
              <Plus className="mr-2 h-4 w-4"/>
              Add Staff Member
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-black border border-white/10 text-white sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New Staff Member</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField control={form.control} name="name" render={({ field }) => (<FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter staff name" className="bg-white/5 border-white/10 text-white" {...field} data-testid="input-staff-name"/>
                      </FormControl>
                      <FormMessage />
                    </FormItem>)}/>
                <FormField control={form.control} name="commissionRate" render={({ field }) => (<FormItem>
                      <FormLabel>Commission Rate (%)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" placeholder="2.0" className="bg-white/5 border-white/10 text-white" {...field} data-testid="input-staff-commission"/>
                      </FormControl>
                      <FormMessage />
                    </FormItem>)}/>
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createStaff.isPending} className="bg-white text-black hover:bg-gray-200" data-testid="button-submit-staff">
                    {createStaff.isPending ? "Saving..." : "Save Staff Member"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (<div className="text-gray-400">Loading performance data...</div>) : sortedPerformance.length === 0 ? (<div className="text-center py-12 text-gray-500 border border-white/5 rounded-lg border-dashed">
          No staff members found. Add one to start tracking performance.
        </div>) : (<motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 gap-4">
          {sortedPerformance.map((staff, index) => {
                const isTop3 = index < 3;
                return (<motion.div key={staff.id} variants={item}>
                <Card className={`bg-black border ${isTop3 ? 'border-white/20' : 'border-white/5'} overflow-hidden relative`}>
                  {index === 0 && <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/10 to-transparent opacity-50"/>}
                  {index === 1 && <div className="absolute inset-0 bg-gradient-to-r from-gray-300/10 to-transparent opacity-50"/>}
                  {index === 2 && <div className="absolute inset-0 bg-gradient-to-r from-amber-700/10 to-transparent opacity-50"/>}
                  
                  <CardContent className="p-0">
                    <div className="flex flex-col md:flex-row md:items-center p-6 relative z-10">
                      <div className="flex items-center space-x-6 md:w-1/3 mb-4 md:mb-0">
                        <div className={`flex items-center justify-center w-12 h-12 rounded-full font-bold text-xl ${index === 0 ? 'bg-yellow-500/20 text-yellow-500' :
                        index === 1 ? 'bg-gray-300/20 text-gray-300' :
                            index === 2 ? 'bg-amber-700/20 text-amber-600' :
                                'bg-white/5 text-gray-500'}`}>
                          {index + 1}
                        </div>
                        <div>
                          <h3 className="font-bold text-lg text-white flex items-center gap-2">
                            {staff.name}
                            {index === 0 && <Trophy className="h-4 w-4 text-yellow-500"/>}
                          </h3>
                          <p className="text-sm text-gray-400">Commission: {staff.commissionRate}%</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 md:w-2/3 text-center md:text-right">
                        <div>
                          <p className="text-xs text-gray-500 mb-1 flex items-center justify-center md:justify-end gap-1"><Target className="h-3 w-3"/> Total Sales</p>
                          <p className="font-bold text-white text-lg">{formatCurrency(staff.totalSales)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Orders</p>
                          <p className="font-bold text-white text-lg">{staff.totalOrders}</p>
                        </div>
                        <div>
                          <p className="text-xs text-green-500/70 mb-1 flex items-center justify-center md:justify-end gap-1"><Award className="h-3 w-3"/> Earned</p>
                          <p className="font-bold text-green-400 text-lg">{formatCurrency(staff.commission)}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>);
            })}
        </motion.div>)}
    </div>);
}
