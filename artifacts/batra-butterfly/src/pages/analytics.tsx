import { useState } from "react";
import { 
  useGetTopRetailers, getGetTopRetailersQueryKey,
  useGetUnderBuyingRetailers, getGetUnderBuyingRetailersQueryKey
} from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDownRight, ArrowUpRight, AlertCircle } from "lucide-react";

export default function Analytics() {
  const [days, setDays] = useState("30");
  
  const { data: topRetailers, isLoading: loadingTop } = useGetTopRetailers(
    { days: Number(days) },
    { query: { queryKey: getGetTopRetailersQueryKey({ days: Number(days) }) } }
  );

  const { data: underBuying, isLoading: loadingUnder } = useGetUnderBuyingRetailers({
    query: { queryKey: getGetUnderBuyingRetailersQueryKey() }
  });

  const chartData = topRetailers?.map(r => ({
    name: r.name,
    total: r.totalPurchaseLast30Days,
    frequency: r.orderFrequency
  })) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-gray-400 mt-1">Data-driven insights and retailer performance</p>
        </div>
        
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-400">Timeframe:</span>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[120px] bg-black border-white/10 text-white">
              <SelectValue placeholder="Select days" />
            </SelectTrigger>
            <SelectContent className="bg-black border-white/10 text-white">
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="performance" className="w-full">
        <TabsList className="bg-white/5 border border-white/10 p-1 mb-4">
          <TabsTrigger value="performance" className="data-[state=active]:bg-white data-[state=active]:text-black text-gray-400 transition-all">Top Performers</TabsTrigger>
          <TabsTrigger value="risk" className="data-[state=active]:bg-white data-[state=active]:text-black text-gray-400 transition-all">Risk & Opportunity</TabsTrigger>
        </TabsList>
        
        <TabsContent value="performance" className="space-y-6">
          <Card className="bg-black border-white/10">
            <CardHeader>
              <CardTitle>Revenue by Retailer</CardTitle>
              <CardDescription className="text-gray-400">Top 10 highest grossing partners</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.slice(0, 10)} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      stroke="#ffffff50" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false}
                      angle={-45}
                      textAnchor="end"
                    />
                    <YAxis 
                      stroke="#ffffff50" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(value) => `₹${value / 1000}k`}
                    />
                    <Tooltip 
                      cursor={{ fill: '#ffffff05' }}
                      contentStyle={{ backgroundColor: '#000', borderColor: '#ffffff20', color: '#fff', borderRadius: '8px' }}
                      formatter={(value: number) => [formatCurrency(value), "Revenue"]}
                    />
                    <Bar dataKey="total" fill="#ffffff" radius={[4, 4, 0, 0]} maxBarSize={50} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {topRetailers?.slice(0, 4).map((retailer, i) => (
              <motion.div
                key={retailer.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className="bg-black border-white/10 hover:bg-white/[0.02] transition-colors h-full">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-semibold text-lg">{retailer.name}</h3>
                        <p className="text-sm text-gray-400">Score: {retailer.potentialScore}/100</p>
                      </div>
                      <div className={`flex items-center px-2 py-1 rounded text-xs font-medium ${
                        retailer.growthRate >= 0 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                      }`}>
                        {retailer.growthRate >= 0 ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                        {Math.abs(retailer.growthRate).toFixed(1)}%
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/10">
                      <div>
                        <p className="text-xs text-gray-500">Avg Order Value</p>
                        <p className="font-medium">{formatCurrency(retailer.avgOrderValue)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Order Frequency</p>
                        <p className="font-medium">{retailer.orderFrequency} orders/mo</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </TabsContent>
        
        <TabsContent value="risk" className="space-y-6">
          <Card className="bg-black border border-red-500/30 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-10">
              <AlertCircle className="w-32 h-32 text-red-500" />
            </div>
            <CardHeader>
              <CardTitle className="flex items-center text-red-400">
                <AlertCircle className="mr-2 h-5 w-5" />
                Under-buying Alerts
              </CardTitle>
              <CardDescription className="text-gray-400">Retailers showing a sudden drop in purchase volume</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingUnder ? (
                <div className="py-8 text-center text-gray-500">Analyzing patterns...</div>
              ) : underBuying?.length === 0 ? (
                <div className="py-8 text-center text-green-400">No under-buying risks detected.</div>
              ) : (
                <div className="divide-y divide-white/10 relative z-10">
                  {underBuying?.map((retailer, i) => (
                    <motion.div 
                      key={retailer.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div>
                        <h4 className="font-medium text-white">{retailer.name}</h4>
                        <p className="text-sm text-gray-400 mt-1">
                          Last order was {retailer.lastOrderGap} days ago (Avg frequency: every {Math.round(30/retailer.orderFrequency)} days)
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-right">
                          <p className="text-gray-500 text-xs">Last 30d</p>
                          <p className="font-medium text-red-400">{formatCurrency(retailer.totalPurchaseLast30Days)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-gray-500 text-xs">Prev 90d Avg</p>
                          <p className="font-medium text-white">{formatCurrency(retailer.totalPurchaseLast90Days / 3)}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
