import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, retailersTable, salesTable } from "@workspace/db";
import { requireAuth } from "../middleware/requireAuth";
const router = Router();
async function getRetailerAnalytics(retailerId, retailerName, retailerPhone, accountId) {
    const now = new Date();
    const days30ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const days90ago = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const allSales = await db.select().from(salesTable).where(and(eq(salesTable.retailerId, retailerId), eq(salesTable.accountId, accountId)));
    const sales30 = allSales.filter((s) => s.date >= days30ago);
    const sales30to90 = allSales.filter((s) => s.date >= days90ago && s.date < days30ago);
    const totalPurchaseLast30Days = sales30.reduce((s, e) => s + parseFloat(e.amount), 0);
    const totalPurchaseLast90Days = allSales.filter((s) => s.date >= days90ago).reduce((s, e) => s + parseFloat(e.amount), 0);
    const avgOrderValue = allSales.length > 0 ? allSales.reduce((s, e) => s + parseFloat(e.amount), 0) / allSales.length : 0;
    const orderFrequency = allSales.length;
    let lastOrderGap = null;
    if (allSales.length > 0) {
        const lastSale = allSales.sort((a, b) => b.date.getTime() - a.date.getTime())[0];
        lastOrderGap = Math.floor((now.getTime() - lastSale.date.getTime()) / (1000 * 60 * 60 * 24));
    }
    const avg30 = sales30.length > 0 ? totalPurchaseLast30Days / sales30.length : 0;
    const avg30to90 = sales30to90.length > 0 ? sales30to90.reduce((s, e) => s + parseFloat(e.amount), 0) / sales30to90.length : 0;
    const growthRate = avg30to90 > 0 ? ((avg30 - avg30to90) / avg30to90) * 100 : 0;
    const freqScore = Math.min(orderFrequency / 10, 1);
    const consistencyScore = lastOrderGap !== null ? Math.max(0, 1 - lastOrderGap / 60) : 0;
    const potentialScore = Math.round((freqScore * 0.5 + consistencyScore * 0.5) * 100);
    const historicalAvg = allSales.length > 0 ? allSales.reduce((s, e) => s + parseFloat(e.amount), 0) / allSales.length : 0;
    const isUnderBuying = historicalAvg > 0 && avg30 < historicalAvg * 0.7;
    return {
        id: retailerId,
        name: retailerName,
        phone: retailerPhone,
        totalPurchaseLast30Days,
        totalPurchaseLast90Days,
        avgOrderValue,
        orderFrequency,
        lastOrderGap,
        growthRate,
        potentialScore,
        isUnderBuying,
    };
}
router.get("/analytics/top-retailers", requireAuth, async (req, res) => {
    const accountId = req.session.accountId;
    const retailers = await db.select().from(retailersTable).where(eq(retailersTable.accountId, accountId));
    const analytics = await Promise.all(retailers.map((r) => getRetailerAnalytics(r.id, r.name, r.phone, accountId)));
    const sorted = analytics.sort((a, b) => b.totalPurchaseLast30Days - a.totalPurchaseLast30Days).slice(0, 10);
    res.json(sorted);
});
router.get("/analytics/under-buying", requireAuth, async (req, res) => {
    const accountId = req.session.accountId;
    const retailers = await db.select().from(retailersTable).where(eq(retailersTable.accountId, accountId));
    const analytics = await Promise.all(retailers.map((r) => getRetailerAnalytics(r.id, r.name, r.phone, accountId)));
    res.json(analytics.filter((a) => a.isUnderBuying));
});
export default router;
