import { Router, type IRouter } from "express";
import { eq, and, inArray, count } from "drizzle-orm";
import { db, staffTable, salesTable, invoicesTable, invoiceItemsTable } from "@workspace/db";
import {
  CreateStaffBody,
  GetStaffPerformanceQueryParams,
  GetStaffDetailParams,
  CreateSaleBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middleware/requireAuth";

const router: IRouter = Router();

// Commission is a flat ₹1 per invoice line item across the staff member's
// confirmed invoices (not a percentage of sales value).
async function computeStaffPerformance(
  staff: { id: number; name: string; commissionRate: string },
  accountId: number,
  month?: number,
  year?: number
) {
  const invoices = await db
    .select({ id: invoicesTable.id, totalAmount: invoicesTable.totalAmount, date: invoicesTable.date })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.accountId, accountId), eq(invoicesTable.staffId, staff.id), eq(invoicesTable.status, "confirmed")));

  const filtered = invoices.filter((inv) => {
    if (month && inv.date.getMonth() + 1 !== month) return false;
    if (year && inv.date.getFullYear() !== year) return false;
    return true;
  });

  const totalSales = filtered.reduce((s, e) => s + parseFloat(e.totalAmount), 0);
  const totalOrders = filtered.length;
  const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

  let commission = 0;
  if (filtered.length > 0) {
    const [row] = await db
      .select({ c: count() })
      .from(invoiceItemsTable)
      .where(inArray(invoiceItemsTable.invoiceId, filtered.map((i) => i.id)));
    commission = Number(row?.c ?? 0);
  }

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

  const month = qParams.success ? qParams.data.month : undefined;
  const year = qParams.success ? qParams.data.year : undefined;
  const results = await Promise.all(
    staffList.map((s) => computeStaffPerformance(s, accountId, month, year))
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
  res.json(await computeStaffPerformance(staff, accountId));
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
