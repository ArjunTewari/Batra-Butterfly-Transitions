import { Router, type IRouter } from "express";
import { eq, ilike, desc, and } from "drizzle-orm";
import { db, ledgerEntriesTable, vendorPaymentsTable, retailersTable, suppliersTable } from "@workspace/db";
import { CreatePaymentClearanceBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/requireAuth";

const router: IRouter = Router();

router.get("/payment-clearance", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const payments = await db
    .select({
      id: vendorPaymentsTable.id,
      amount: vendorPaymentsTable.amount,
      notes: vendorPaymentsTable.notes,
      date: vendorPaymentsTable.date,
      retailerName: retailersTable.name,
      vendorName: suppliersTable.name,
    })
    .from(vendorPaymentsTable)
    .leftJoin(retailersTable, eq(vendorPaymentsTable.retailerId, retailersTable.id))
    .leftJoin(suppliersTable, eq(vendorPaymentsTable.supplierId, suppliersTable.id))
    .where(eq(vendorPaymentsTable.accountId, accountId))
    .orderBy(desc(vendorPaymentsTable.date));

  res.json(payments.map((p) => ({ ...p, amount: parseFloat(String(p.amount)) })));
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

  await db.insert(ledgerEntriesTable).values({
    retailerId: retailer.id,
    type: "payment",
    amount: String(amount),
    note: notes ?? `Payment clearance — vendor: ${supplier.name}`,
    date: new Date(),
  });

  const [payment] = await db.insert(vendorPaymentsTable).values({
    accountId,
    supplierId: supplier.id,
    retailerId: retailer.id,
    amount: String(amount),
    notes: notes ?? null,
    date: new Date(),
  }).returning();

  res.status(201).json({
    success: true,
    retailer: { id: retailer.id, name: retailer.name },
    vendor: { id: supplier.id, name: supplier.name },
    amount,
  });
});

export default router;
