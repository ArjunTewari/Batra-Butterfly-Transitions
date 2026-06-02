import { useGetDashboardSummary, useGetRecentActivity, useGetTopRetailers, getGetDashboardSummaryQueryKey, getGetRecentActivityQueryKey, getGetTopRetailersQueryKey } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IndianRupee, Users, AlertTriangle, ArrowUpRight, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};
const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3 } }
};
export default function Dashboard() {
    const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
    const { data: activity, isLoading: loadingActivity } = useGetRecentActivity({ query: { queryKey: getGetRecentActivityQueryKey() } });
    const { data: topRetailers, isLoading: loadingTop } = useGetTopRetailers({}, { query: { queryKey: getGetTopRetailersQueryKey() } });
    if (loadingSummary || loadingActivity || loadingTop) {
        return <div className="text-gray-400">Loading...</div>;
    }
    return (<div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-gray-400 mt-1">Batra Butterfly OS overview</p>
      </div>

      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div variants={item}>
          <Card className="bg-black border-white/10 shadow-xl overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-50"/>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-gray-400">Total Outstanding</CardTitle>
              <IndianRupee className="h-4 w-4 text-gray-400"/>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary ? formatCurrency(summary.totalOutstanding) : "₹0"}</div>
            </CardContent>
          </Card>
        </motion.div>
        
        <motion.div variants={item}>
          <Card className="bg-black border-white/10 shadow-xl overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent opacity-50"/>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-gray-400">Today's Sales</CardTitle>
              <TrendingUp className="h-4 w-4 text-gray-400"/>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-400">{summary ? formatCurrency(summary.todaySales) : "₹0"}</div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card className="bg-black border-white/10 shadow-xl overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent opacity-50"/>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-gray-400">Today's Profit</CardTitle>
              <TrendingUp className="h-4 w-4 text-orange-400"/>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-400">{summary ? formatCurrency(summary.todayProfit) : "₹0"}</div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card className="bg-black border-white/10 shadow-xl overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-transparent opacity-50"/>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-gray-400">Overdue Retailers</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-400"/>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-400">{(summary === null || summary === void 0 ? void 0 : summary.overdueRetailerCount) || 0}</div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card className="bg-black border-white/10 shadow-xl overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-50"/>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-gray-400">Total Staff</CardTitle>
              <Users className="h-4 w-4 text-gray-400"/>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(summary === null || summary === void 0 ? void 0 : summary.totalStaff) || 0}</div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
          <Card className="bg-black border-white/10">
            <CardContent className="p-0">
              {(activity === null || activity === void 0 ? void 0 : activity.length) === 0 ? (<div className="p-8 text-center text-gray-500">No recent activity</div>) : (<div className="divide-y divide-white/5">
                  {activity === null || activity === void 0 ? void 0 : activity.map((item) => (<div key={item.id} className="p-4 flex items-start space-x-4 hover:bg-white/5 transition-colors">
                      <div className="flex-1">
                        <p className="text-sm">{item.description}</p>
                        <div className="flex items-center mt-1 space-x-2 text-xs text-gray-500">
                          <span>{new Date(item.date).toLocaleString()}</span>
                          <span>•</span>
                          <span>{item.entityName}</span>
                        </div>
                      </div>
                      {item.amount && (<div className={`text-sm font-medium ${item.type === 'payment' ? 'text-green-400' : ''} ${item.type === 'sale' ? 'text-blue-400' : ''}`}>
                          {item.type === 'payment' ? '+' : ''}{formatCurrency(item.amount)}
                        </div>)}
                    </div>))}
                </div>)}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <h2 className="text-xl font-semibold mb-4 flex items-center justify-between">
            Top Retailers
            <ArrowUpRight className="h-4 w-4 text-gray-400"/>
          </h2>
          <Card className="bg-black border-white/10">
            <CardContent className="p-0">
              {(topRetailers === null || topRetailers === void 0 ? void 0 : topRetailers.length) === 0 ? (<div className="p-8 text-center text-gray-500">No top retailers data</div>) : (<div className="divide-y divide-white/5">
                  {topRetailers === null || topRetailers === void 0 ? void 0 : topRetailers.slice(0, 5).map((retailer, index) => (<div key={retailer.id} className="p-4 flex items-center space-x-4 hover:bg-white/5 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs text-gray-400">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{retailer.name}</p>
                        <p className="text-xs text-gray-500">{retailer.phone}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold">{formatCurrency(retailer.totalPurchaseLast30Days)}</div>
                        <div className="text-xs text-gray-500">Last 30 days</div>
                      </div>
                    </div>))}
                </div>)}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>);
}
