import { useRef, useState, useCallback } from "react";
import { useGetStaffPerformance, getGetStaffPerformanceQueryKey, useCreateStaff, useEnrollStaffFace, getListStaffQueryKey, } from "@workspace/api-client-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trophy, Target, CalendarCheck, Camera, CheckCircle2, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { loadFaceModels, computeDescriptor } from "@/lib/face";
const formSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    salary: z.coerce.number().min(0, "Salary must be positive"),
});
export default function Staff() {
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [cameraOn, setCameraOn] = useState(false);
    const [capturedDescriptor, setCapturedDescriptor] = useState(null);
    const [capturing, setCapturing] = useState(false);
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const queryClient = useQueryClient();
    const { isMaster } = useAuth();
    const { data: performance, isLoading } = useGetStaffPerformance({}, {
        query: { queryKey: getGetStaffPerformanceQueryKey({}) }
    });
    const createStaff = useCreateStaff();
    const enrollFace = useEnrollStaffFace();
    const form = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: { name: "", salary: 0 },
    });
    const startCamera = useCallback(async () => {
        try {
            await loadFaceModels();
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
            streamRef.current = stream;
            if (videoRef.current)
                videoRef.current.srcObject = stream;
            setCameraOn(true);
        }
        catch {
            setCameraOn(false);
        }
    }, []);
    const stopCamera = useCallback(() => {
        var _a;
        (_a = streamRef.current) === null || _a === void 0 ? void 0 : _a.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setCameraOn(false);
    }, []);
    const captureface = useCallback(async () => {
        if (!videoRef.current)
            return;
        setCapturing(true);
        const result = await computeDescriptor(videoRef.current);
        setCapturing(false);
        if (result.detected && result.descriptor.length > 0) {
            setCapturedDescriptor(result.descriptor);
            stopCamera();
        }
    }, [stopCamera]);
    const onSubmit = (values) => {
        createStaff.mutate({ data: values }, {
            onSuccess: (staff) => {
                if (capturedDescriptor) {
                    enrollFace.mutate({ id: staff.id, data: { descriptor: capturedDescriptor } }, { onSettled: () => { } });
                }
                setIsAddOpen(false);
                form.reset();
                setCapturedDescriptor(null);
                stopCamera();
                queryClient.invalidateQueries({ queryKey: getListStaffQueryKey() });
                queryClient.invalidateQueries({ queryKey: getGetStaffPerformanceQueryKey({}) });
            }
        });
    };
    const handleDialogChange = (open) => {
        if (!open) {
            stopCamera();
            setCapturedDescriptor(null);
            form.reset();
        }
        setIsAddOpen(open);
    };
    const container = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.1 } }
    };
    const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };
    const sortedPerformance = [...(performance || [])].sort((a, b) => b.totalSales - a.totalSales);
    return (<div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Staff Leaderboard</h1>
          <p className="text-gray-400 mt-1">Track sales performance</p>
        </div>

        <div className="flex gap-2">
          <Link href="/staff/attendance">
            <Button variant="outline" className="border-white/10 text-white hover:bg-white/5" data-testid="button-attendance">
              <CalendarCheck className="mr-2 h-4 w-4"/>
              Attendance
            </Button>
          </Link>
          {isMaster && (<Dialog open={isAddOpen} onOpenChange={handleDialogChange}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-staff" className="bg-white text-black hover:bg-gray-200">
                  <Plus className="mr-2 h-4 w-4"/>
                  Add Staff Member
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-black border border-white/10 text-white sm:max-w-[440px]">
                <DialogHeader>
                  <DialogTitle>Add New Staff Member</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-4">
                    <FormField control={form.control} name="name" render={({ field }) => (<FormItem>
                          <FormLabel>Full Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter staff name" className="bg-white/5 border-white/10 text-white" {...field} data-testid="input-staff-name"/>
                          </FormControl>
                          <FormMessage />
                        </FormItem>)}/>
                    <FormField control={form.control} name="salary" render={({ field }) => (<FormItem>
                          <FormLabel>Monthly Salary (₹)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" placeholder="0" className="bg-white/5 border-white/10 text-white" {...field} data-testid="input-staff-salary"/>
                          </FormControl>
                          <FormMessage />
                        </FormItem>)}/>

                    {/* Face Capture */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-white">Face Registration <span className="text-gray-500 font-normal">(optional)</span></p>
                      {capturedDescriptor ? (<div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-950/20 p-3">
                          <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0"/>
                          <span className="text-sm text-green-300">Face captured — ready for attendance</span>
                          <button type="button" onClick={() => setCapturedDescriptor(null)} className="ml-auto text-xs text-gray-500 hover:text-gray-300">Redo</button>
                        </div>) : cameraOn ? (<div className="space-y-2">
                          <video ref={videoRef} autoPlay muted playsInline className="w-full rounded-lg border border-white/10 bg-black" style={{ height: 180, objectFit: "cover" }}/>
                          <div className="flex gap-2">
                            <Button type="button" size="sm" className="flex-1 bg-white text-black hover:bg-gray-200" onClick={captureface} disabled={capturing}>
                              {capturing ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin"/> Detecting...</> : "Capture Face"}
                            </Button>
                            <Button type="button" size="sm" variant="ghost" className="text-gray-400" onClick={stopCamera}>Cancel</Button>
                          </div>
                        </div>) : (<Button type="button" variant="outline" size="sm" className="border-white/10 text-gray-300 hover:bg-white/5 w-full" onClick={startCamera}>
                          <Camera className="h-3.5 w-3.5 mr-2"/> Start Camera
                        </Button>)}
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button type="submit" disabled={createStaff.isPending} className="bg-white text-black hover:bg-gray-200" data-testid="button-submit-staff">
                        {createStaff.isPending ? "Saving..." : "Save Staff Member"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>)}
        </div>
      </div>

      {isLoading ? (<div className="text-gray-400">Loading performance data...</div>) : sortedPerformance.length === 0 ? (<div className="text-center py-12 text-gray-500 border border-white/5 rounded-lg border-dashed">
          No staff members found. {isMaster && "Add one to start tracking performance."}
        </div>) : (<motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 gap-4">
          {sortedPerformance.map((staff, index) => {
                const isTop3 = index < 3;
                return (<motion.div key={staff.id} variants={item}>
                <Link href={`/staff/${staff.id}`}>
                  <Card className={`bg-black border ${isTop3 ? 'border-white/20' : 'border-white/5'} overflow-hidden relative cursor-pointer hover:border-white/30 transition-colors`}>
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
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 md:w-2/3 text-center md:text-right">
                          <div>
                            <p className="text-xs text-gray-500 mb-1 flex items-center justify-center md:justify-end gap-1"><Target className="h-3 w-3"/> Total Sales</p>
                            <p className="font-bold text-white text-lg">{formatCurrency(staff.totalSales)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Orders</p>
                            <p className="font-bold text-white text-lg">{staff.totalOrders}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>);
            })}
        </motion.div>)}
    </div>);
}
