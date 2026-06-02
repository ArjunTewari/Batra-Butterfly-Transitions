import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, staffTable, salesTable } from "@workspace/db";
import {
  CreateStaffBody,
  GetStaffPerformanceQueryParams,
  GetStaffDetailParams,
  CreateSaleBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middleware/requireAuth";

const router: IRouter = Router();

async function computeStaffPerformance(
  staff: { id: number; name: string; commissionRate: string; createdAt: Date },
  sales: { amount: string }[]
) {
  const totalSales = sales.reduce((s, e) => s + parseFloat(e.amount), 0);
  const totalOrders = sales.length;
  const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
  const commission = totalSales * (parseFloat(staff.commissionRate) / 100);
  return {
    id: staff.id,
    name: staff.name,
    commissionRate: parseFloat(staff.commissionRate),
    totalSales,
    totalOrders,
    avgOrderValue,
    commission,
  };
}

router.get("/staff", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const staffList = await db.select().from(staffTable).where(eq(staffTable.accountId, accountId)).orderBy(staffTable.name);
  res.json(staffList.map((s) => ({
    id: s.id,
    name: s.name,
    commissionRate: parseFloat(s.commissionRate),
    createdAt: s.createdAt.toISOString(),
  })));
});

router.post("/staff", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const parsed = CreateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [staff] = await db.insert(staffTable).values({
    accountId,
    name: parsed.data.name,
    commissionRate: String(parsed.data.commissionRate),
  }).returning();
  res.status(201).json({
    id: staff.id,
    name: staff.name,
    commissionRate: parseFloat(staff.commissionRate),
    createdAt: staff.createdAt.toISOString(),
  });
});

router.get("/staff/performance", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const qParams = GetStaffPerformanceQueryParams.safeParse(req.query);
  const staffList = await db.select().from(staffTable).where(eq(staffTable.accountId, accountId));

  const results = await Promise.all(
    staffList.map(async (s) => {
      const sales = await db.select().from(salesTable).where(and(eq(salesTable.staffId, s.id), eq(salesTable.accountId, accountId)));
      let filteredSales = sales;
      if (qParams.success && (qParams.data.month || qParams.data.year)) {
        filteredSales = sales.filter((sale) => {
          const d = sale.date;
          if (qParams.data.month && d.getMonth() + 1 !== qParams.data.month) return false;
          if (qParams.data.year && d.getFullYear() !== qParams.data.year) return false;
          return true;
        });
      }
      return computeStaffPerformance(s, filteredSales);
    })
  );

  res.json(results.sort((a, b) => b.totalSales - a.totalSales));
});

router.get("/staff/:id", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetStaffDetailParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [staff] = await db.select().from(staffTable).where(and(eq(staffTable.id, params.data.id), eq(staffTable.accountId, accountId)));
  if (!staff) {
    res.status(404).json({ error: "Staff not found" });
    return;
  }
  const sales = await db.select().from(salesTable).where(and(eq(salesTable.staffId, params.data.id), eq(salesTable.accountId, accountId)));
  res.json(await computeStaffPerformance(staff, sales));
});

router.post("/sales", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const parsed = CreateSaleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [sale] = await db.insert(salesTable).values({
    accountId,
    retailerId: parsed.data.retailerId,
    staffId: parsed.data.staffId,
    amount: String(parsed.data.amount),
    date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
  }).returning();
  res.status(201).json({
    id: sale.id,
    retailerId: sale.retailerId,
    staffId: sale.staffId,
    amount: parseFloat(sale.amount),
    date: sale.date.toISOString(),
    createdAt: sale.createdAt.toISOString(),
  });
});

export default router;
