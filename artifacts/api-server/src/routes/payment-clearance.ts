import { Router, type IRouter } from "express";
import { eq, ilike, desc, and } from "drizzle-orm";
import { db, ledgerEntriesTable, vendorPaymentsTable, retailersTable, suppliersTable } from "@workspace/db";
import { CreatePaymentClearanceBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/requireAuth";
import { requireMaster } from "../middleware/requireAuth";

const router: IRouter = Router();

function formatRecord(p: {
  id: number; amount: string | number; notes: string | null; status: string;
  date: Date; approvedAt: Date | null; retailerName: string | null; vendorName: string | null;
}) {
  return {
    id: p.id,
    amount: parseFloat(String(p.amount)),
    notes: p.notes,
    status: p.status,
    date: p.date.toISOString(),
    approvedAt: p.approvedAt ? p.approvedAt.toISOString() : null,
    retailerName: p.retailerName,
    vendorName: p.vendorName,
  };
}

router.get("/payment-clearance", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const payments = await db
    .select({
      id: vendorPaymentsTable.id,
      amount: vendorPaymentsTable.amount,
      notes: vendorPaymentsTable.notes,
      status: vendorPaymentsTable.status,
      date: vendorPaymentsTable.date,
      approvedAt: vendorPaymentsTable.approvedAt,
      retailerName: retailersTable.name,
      vendorName: suppliersTable.name,
    })
    .from(vendorPaymentsTable)
    .leftJoin(retailersTable, eq(vendorPaymentsTable.retailerId, retailersTable.id))
    .leftJoin(suppliersTable, eq(vendorPaymentsTable.supplierId, suppliersTable.id))
    .where(eq(vendorPaymentsTable.accountId, accountId))
    .orderBy(desc(vendorPaymentsTable.date));

  res.json(payments.map(formatRecord));
});

router.post("/payment-clearance", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const parsed = CreatePaymentClearanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { amount, retailerName, vendorName, notes } = parsed.data;

  const [retailer] = await db
    .select()
    .from(retailersTable)
    .where(and(eq(retailersTable.accountId, accountId), ilike(retailersTable.name, `%${retailerName}%`)));

  if (!retailer) {
    res.status(404).json({ error: `Retailer matching "${retailerName}" not found` });
    return;
  }

  const [supplier] = await db
    .select()
    .from(suppliersTable)
    .where(and(eq(suppliersTable.accountId, accountId), ilike(suppliersTable.name, `%${vendorName}%`)));

  if (!supplier) {
    res.status(404).json({ error: `Vendor matching "${vendorName}" not found` });
    return;
  }

  // Store as pending — no ledger entry until master approves
  const [payment] = await db.insert(vendorPaymentsTable).values({
    accountId,
    supplierId: supplier.id,
    retailerId: retailer.id,
    amount: String(amount),
    notes: notes ?? null,
    status: "pending",
    date: new Date(),
  }).returning();

  res.status(201).json({
    success: true,
    retailer: { id: retailer.id, name: retailer.name },
    vendor: { id: supplier.id, name: supplier.name },
    amount,
  });
});

router.post("/payment-clearance/:id/approve", requireAuth, requireMaster, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const paymentId = parseInt(String(req.params.id), 10);
  if (isNaN(paymentId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [payment] = await db
    .select({
      id: vendorPaymentsTable.id,
      amount: vendorPaymentsTable.amount,
      notes: vendorPaymentsTable.notes,
      status: vendorPaymentsTable.status,
      date: vendorPaymentsTable.date,
      approvedAt: vendorPaymentsTable.approvedAt,
      retailerId: vendorPaymentsTable.retailerId,
      retailerName: retailersTable.name,
      vendorName: suppliersTable.name,
    })
    .from(vendorPaymentsTable)
    .leftJoin(retailersTable, eq(vendorPaymentsTable.retailerId, retailersTable.id))
    .leftJoin(suppliersTable, eq(vendorPaymentsTable.supplierId, suppliersTable.id))
    .where(and(eq(vendorPaymentsTable.id, paymentId), eq(vendorPaymentsTable.accountId, accountId)));

  if (!payment) { res.status(404).json({ error: "Payment clearance not found" }); return; }
  if (payment.status !== "pending") { res.status(400).json({ error: "Already processed" }); return; }

  const now = new Date();

  // Create ledger entry only on approval
  await db.insert(ledgerEntriesTable).values({
    retailerId: payment.retailerId,
    type: "payment",
    amount: String(payment.amount),
    note: payment.notes ?? `Payment clearance — vendor: ${payment.vendorName ?? ""}`,
    date: now,
  });

  const [updated] = await db
    .update(vendorPaymentsTable)
    .set({ status: "approved", approvedAt: now })
    .where(eq(vendorPaymentsTable.id, paymentId))
    .returning();

  res.json(formatRecord({ ...updated, retailerName: payment.retailerName, vendorName: payment.vendorName }));
});

router.post("/payment-clearance/:id/reject", requireAuth, requireMaster, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const paymentId = parseInt(String(req.params.id), 10);
  if (isNaN(paymentId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [payment] = await db
    .select({
      id: vendorPaymentsTable.id,
      amount: vendorPaymentsTable.amount,
      notes: vendorPaymentsTable.notes,
      status: vendorPaymentsTable.status,
      date: vendorPaymentsTable.date,
      approvedAt: vendorPaymentsTable.approvedAt,
      retailerName: retailersTable.name,
      vendorName: suppliersTable.name,
    })
    .from(vendorPaymentsTable)
    .leftJoin(retailersTable, eq(vendorPaymentsTable.retailerId, retailersTable.id))
    .leftJoin(suppliersTable, eq(vendorPaymentsTable.supplierId, suppliersTable.id))
    .where(and(eq(vendorPaymentsTable.id, paymentId), eq(vendorPaymentsTable.accountId, accountId)));

  if (!payment) { res.status(404).json({ error: "Payment clearance not found" }); return; }
  if (payment.status !== "pending") { res.status(400).json({ error: "Already processed" }); return; }

  const [updated] = await db
    .update(vendorPaymentsTable)
    .set({ status: "rejected" })
    .where(eq(vendorPaymentsTable.id, paymentId))
    .returning();

  res.json(formatRecord({ ...updated, retailerName: payment.retailerName, vendorName: payment.vendorName }));
});

export default router;
