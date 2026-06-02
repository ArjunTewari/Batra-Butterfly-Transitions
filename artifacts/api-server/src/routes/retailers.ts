import { Router, type IRouter } from "express";
import { eq, sql, desc, and } from "drizzle-orm";
import { db, retailersTable, ledgerEntriesTable } from "@workspace/db";
import {
  CreateRetailerBody,
  UpdateRetailerBody,
  GetRetailerParams,
  UpdateRetailerParams,
  DeleteRetailerParams,
  GetRetailerLedgerParams,
  AddLedgerEntryParams,
  AddLedgerEntryBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middleware/requireAuth";

const router: IRouter = Router();

function computeRetailerSummary(
  retailer: { id: number; name: string; phone: string; creditLimit: string; createdAt: Date },
  entries: { type: string; amount: string; date: Date }[]
) {
  const sales = entries.filter((e) => e.type === "sale").reduce((s, e) => s + parseFloat(e.amount), 0);
  const payments = entries.filter((e) => e.type === "payment").reduce((s, e) => s + parseFloat(e.amount), 0);
  const outstanding = sales - payments;
  const paymentEntries = entries.filter((e) => e.type === "payment").sort((a, b) => b.date.getTime() - a.date.getTime());
  const lastPaymentDate = paymentEntries.length > 0 ? paymentEntries[0].date.toISOString() : null;

  const now = new Date();
  let daysOverdue = 0;
  if (outstanding > 0 && lastPaymentDate) {
    const lastPay = new Date(lastPaymentDate);
    daysOverdue = Math.max(0, Math.floor((now.getTime() - lastPay.getTime()) / (1000 * 60 * 60 * 24)));
  } else if (outstanding > 0 && !lastPaymentDate && entries.length > 0) {
    const firstSale = entries.filter(e => e.type === 'sale').sort((a, b) => a.date.getTime() - b.date.getTime())[0];
    if (firstSale) {
      daysOverdue = Math.floor((now.getTime() - firstSale.date.getTime()) / (1000 * 60 * 60 * 24));
    }
  }

  const isOverdue = outstanding > 0 && daysOverdue > 30;

  return {
    id: retailer.id,
    name: retailer.name,
    phone: retailer.phone,
    creditLimit: parseFloat(retailer.creditLimit),
    outstanding,
    lastPaymentDate,
    daysOverdue,
    isOverdue,
    createdAt: retailer.createdAt.toISOString(),
  };
}

router.get("/retailers", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const retailers = await db.select().from(retailersTable).where(eq(retailersTable.accountId, accountId)).orderBy(retailersTable.name);
  const results = await Promise.all(
    retailers.map(async (r) => {
      const entries = await db.select().from(ledgerEntriesTable).where(eq(ledgerEntriesTable.retailerId, r.id));
      return computeRetailerSummary(r, entries);
    })
  );
  res.json(results);
});

router.post("/retailers", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateRetailerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [retailer] = await db.insert(retailersTable).values({
    accountId: req.session.accountId!,
    name: parsed.data.name,
    phone: parsed.data.phone,
    creditLimit: String(parsed.data.creditLimit),
  }).returning();
  res.status(201).json({
    id: retailer.id,
    name: retailer.name,
    phone: retailer.phone,
    creditLimit: parseFloat(retailer.creditLimit),
    createdAt: retailer.createdAt.toISOString(),
  });
});

router.get("/retailers/:id", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetRetailerParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [retailer] = await db.select().from(retailersTable).where(and(eq(retailersTable.id, params.data.id), eq(retailersTable.accountId, accountId)));
  if (!retailer) {
    res.status(404).json({ error: "Retailer not found" });
    return;
  }
  const entries = await db.select().from(ledgerEntriesTable).where(eq(ledgerEntriesTable.retailerId, params.data.id));
  res.json(computeRetailerSummary(retailer, entries));
});

router.patch("/retailers/:id", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateRetailerParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateRetailerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone;
  if (parsed.data.creditLimit !== undefined) updateData.creditLimit = String(parsed.data.creditLimit);
  const [retailer] = await db.update(retailersTable).set(updateData).where(and(eq(retailersTable.id, params.data.id), eq(retailersTable.accountId, accountId))).returning();
  if (!retailer) {
    res.status(404).json({ error: "Retailer not found" });
    return;
  }
  res.json({
    id: retailer.id,
    name: retailer.name,
    phone: retailer.phone,
    creditLimit: parseFloat(retailer.creditLimit),
    createdAt: retailer.createdAt.toISOString(),
  });
});

router.delete("/retailers/:id", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteRetailerParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db.delete(retailersTable).where(and(eq(retailersTable.id, params.data.id), eq(retailersTable.accountId, accountId))).returning();
  if (!deleted) {
    res.status(404).json({ error: "Retailer not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/retailers/:id/ledger", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetRetailerLedgerParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [retailer] = await db.select().from(retailersTable).where(and(eq(retailersTable.id, params.data.id), eq(retailersTable.accountId, accountId)));
  if (!retailer) {
    res.status(404).json({ error: "Retailer not found" });
    return;
  }
  const entries = await db.select().from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.retailerId, params.data.id))
    .orderBy(desc(ledgerEntriesTable.date));
  res.json(entries.map((e) => ({
    id: e.id,
    retailerId: e.retailerId,
    type: e.type,
    amount: parseFloat(e.amount),
    note: e.note ?? null,
    date: e.date.toISOString(),
    createdAt: e.createdAt.toISOString(),
  })));
});

router.post("/retailers/:id/ledger/entry", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = AddLedgerEntryParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [retailer] = await db.select().from(retailersTable).where(and(eq(retailersTable.id, params.data.id), eq(retailersTable.accountId, accountId)));
  if (!retailer) {
    res.status(404).json({ error: "Retailer not found" });
    return;
  }
  const parsed = AddLedgerEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [entry] = await db.insert(ledgerEntriesTable).values({
    retailerId: params.data.id,
    type: parsed.data.type,
    amount: String(parsed.data.amount),
    note: parsed.data.note ?? null,
    date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
  }).returning();
  res.status(201).json({
    id: entry.id,
    retailerId: entry.retailerId,
    type: entry.type,
    amount: parseFloat(entry.amount),
    note: entry.note ?? null,
    date: entry.date.toISOString(),
    createdAt: entry.createdAt.toISOString(),
  });
});

export default router;
