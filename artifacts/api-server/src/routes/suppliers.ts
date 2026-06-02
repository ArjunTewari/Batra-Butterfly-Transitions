import { Router, type IRouter } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
import {
  db,
  suppliersTable,
  supplierBillsTable,
  supplierBillItemsTable,
  productsTable,
  stockMovementsTable,
} from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  CreateSupplierBody,
  GetSupplierParams,
  CreateSupplierBillParams,
  CreateSupplierBillBody,
  AnalyzeSupplierBillParams,
  AnalyzeSupplierBillBody,
  GetSupplierBillParams,
  ConfirmSupplierBillParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middleware/requireAuth";
import { trackAiUsage } from "../lib/trackAiUsage";

const router: IRouter = Router();

async function getBillWithItems(billId: number) {
  const [bill] = await db
    .select({
      id: supplierBillsTable.id,
      supplierId: supplierBillsTable.supplierId,
      supplierName: suppliersTable.name,
      billNumber: supplierBillsTable.billNumber,
      billDate: supplierBillsTable.billDate,
      totalAmount: supplierBillsTable.totalAmount,
      status: supplierBillsTable.status,
      imageUrl: supplierBillsTable.imageUrl,
      rawText: supplierBillsTable.rawText,
      confidence: supplierBillsTable.confidence,
      notes: supplierBillsTable.notes,
      createdAt: supplierBillsTable.createdAt,
    })
    .from(supplierBillsTable)
    .innerJoin(suppliersTable, eq(supplierBillsTable.supplierId, suppliersTable.id))
    .where(eq(supplierBillsTable.id, billId));

  if (!bill) return null;

  const items = await db
    .select()
    .from(supplierBillItemsTable)
    .where(eq(supplierBillItemsTable.billId, billId));

  return {
    ...bill,
    totalAmount: parseFloat(bill.totalAmount),
    confidence: bill.confidence ? parseFloat(bill.confidence) : null,
    billDate: bill.billDate.toISOString(),
    createdAt: bill.createdAt.toISOString(),
    items: items.map((item) => ({
      id: item.id,
      billId: item.billId,
      productId: item.productId ?? null,
      articleCode: item.articleCode,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: parseFloat(item.unitPrice),
      totalPrice: parseFloat(item.totalPrice),
    })),
  };
}

router.get("/suppliers", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const suppliers = await db.select().from(suppliersTable).where(eq(suppliersTable.accountId, accountId)).orderBy(suppliersTable.name);

  const summaries = await Promise.all(
    suppliers.map(async (s) => {
      const bills = await db
        .select({ totalAmount: supplierBillsTable.totalAmount, billDate: supplierBillsTable.billDate })
        .from(supplierBillsTable)
        .where(eq(supplierBillsTable.supplierId, s.id))
        .orderBy(desc(supplierBillsTable.billDate));

      const totalSpend = bills.reduce((sum, b) => sum + parseFloat(b.totalAmount), 0);
      const lastBill = bills[0];
      return {
        id: s.id,
        name: s.name,
        phone: s.phone ?? null,
        address: s.address ?? null,
        gstin: s.gstin ?? null,
        billCount: bills.length,
        totalSpend,
        lastBillDate: lastBill ? lastBill.billDate.toISOString() : null,
        createdAt: s.createdAt.toISOString(),
      };
    })
  );

  res.json(summaries);
});

router.post("/suppliers", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [supplier] = await db.insert(suppliersTable).values({
    accountId,
    name: parsed.data.name,
    phone: parsed.data.phone ?? null,
    address: parsed.data.address ?? null,
    gstin: parsed.data.gstin ?? null,
  }).returning();
  res.status(201).json({ ...supplier, createdAt: supplier.createdAt.toISOString() });
});

router.get("/suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const params = GetSupplierParams.safeParse({ id: parseInt(req.params.id as string, 10) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [supplier] = await db.select().from(suppliersTable).where(and(eq(suppliersTable.id, params.data.id), eq(suppliersTable.accountId, accountId)));
  if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }

  const bills = await db.select({ id: supplierBillsTable.id }).from(supplierBillsTable).where(eq(supplierBillsTable.supplierId, supplier.id)).orderBy(desc(supplierBillsTable.createdAt));
  const billsWithItems = await Promise.all(bills.map((b) => getBillWithItems(b.id)));

  const stockImages = await db
    .select({
      stockMovementId: stockMovementsTable.id,
      productId: stockMovementsTable.productId,
      articleCode: productsTable.articleCode,
      productName: productsTable.name,
      quantity: stockMovementsTable.quantity,
      imageUrl: stockMovementsTable.imageUrl,
      date: stockMovementsTable.date,
    })
    .from(stockMovementsTable)
    .innerJoin(productsTable, and(eq(stockMovementsTable.productId, productsTable.id), eq(productsTable.accountId, accountId)))
    .where(eq(stockMovementsTable.supplierId, supplier.id))
    .orderBy(desc(stockMovementsTable.date));

  const movementToBill = new Map<number, { billId: number; billNumber: string }>();
  for (const bill of billsWithItems) {
    if (!bill || bill.status !== "confirmed") continue;
    for (const item of bill.items) {
      if (item.productId) {
        const match = stockImages.find((sm) => sm.productId === item.productId);
        if (match && !movementToBill.has(match.stockMovementId)) {
          movementToBill.set(match.stockMovementId, { billId: bill.id, billNumber: bill.billNumber });
        }
      }
    }
  }

  res.json({
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone ?? null,
    address: supplier.address ?? null,
    gstin: supplier.gstin ?? null,
    createdAt: supplier.createdAt.toISOString(),
    bills: billsWithItems.filter(Boolean),
    stockImages: stockImages.map((sm) => ({
      stockMovementId: sm.stockMovementId,
      productId: sm.productId,
      articleCode: sm.articleCode,
      productName: sm.productName,
      quantity: sm.quantity,
      imageUrl: sm.imageUrl ?? null,
      date: sm.date.toISOString(),
      billId: movementToBill.get(sm.stockMovementId)?.billId ?? null,
      billNumber: movementToBill.get(sm.stockMovementId)?.billNumber ?? null,
    })),
  });
});

router.get("/suppliers/:id/bills", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const params = GetSupplierParams.safeParse({ id: parseInt(req.params.id as string, 10) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [supplier] = await db.select().from(suppliersTable).where(and(eq(suppliersTable.id, params.data.id), eq(suppliersTable.accountId, accountId)));
  if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }

  const bills = await db.select({ id: supplierBillsTable.id }).from(supplierBillsTable).where(eq(supplierBillsTable.supplierId, params.data.id)).orderBy(desc(supplierBillsTable.createdAt));
  const results = await Promise.all(bills.map((b) => getBillWithItems(b.id)));
  res.json(results.filter(Boolean));
});

router.post("/suppliers/:id/bills/scan", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const params = AnalyzeSupplierBillParams.safeParse({ id: parseInt(req.params.id as string, 10) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = AnalyzeSupplierBillBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  let supplierName: string | null = null;
  const [s] = await db.select({ name: suppliersTable.name }).from(suppliersTable).where(and(eq(suppliersTable.id, params.data.id), eq(suppliersTable.accountId, accountId)));
  if (!s) { res.status(404).json({ error: "Supplier not found" }); return; }
  supplierName = s.name;

  const { imageBase64, mimeType } = parsed.data;
  const mediaType = (mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp") ?? "image/jpeg";

  const message = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 8192,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
        { type: "text", text: `You are analyzing a supplier purchase bill for a footwear distribution business.${supplierName ? ` The expected supplier is "${supplierName}".` : ""}
Extract all the following information from this bill image and return it as valid JSON only (no markdown, no explanation):
{
  "supplierName": "string or null",
  "billNumber": "string or null",
  "date": "ISO date string YYYY-MM-DD or null",
  "totalAmount": number or null,
  "confidence": number between 0 and 1,
  "rawText": "brief summary",
  "items": [{ "articleCode": "string or null", "productName": "string", "quantity": integer, "unitPrice": number or null, "totalPrice": number or null }]
}
Return ONLY the JSON object, nothing else.` },
      ],
    }],
  });

  // Track AI usage
  await trackAiUsage({
    accountId,
    model: "claude-opus-4-7",
    feature: "supplier_bill_scan",
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  });

  const block = message.content[0];
  const rawText = block.type === "text" ? block.text : "{}";
  let result: Record<string, unknown>;
  try {
    result = JSON.parse(rawText);
  } catch {
    result = { supplierName: null, billNumber: null, date: null, totalAmount: null, confidence: 0.1, rawText: rawText.slice(0, 200), items: [] };
  }

  res.json({
    supplierName: result.supplierName ?? supplierName ?? null,
    billNumber: result.billNumber ?? null,
    date: result.date ?? null,
    totalAmount: result.totalAmount ?? null,
    confidence: typeof result.confidence === "number" ? result.confidence : 0.5,
    rawText: typeof result.rawText === "string" ? result.rawText : "",
    items: Array.isArray(result.items) ? result.items : [],
  });
});

router.post("/suppliers/:id/bills", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const params = CreateSupplierBillParams.safeParse({ id: parseInt(req.params.id as string, 10) });
  if (!params.success) { res.status(400).json({ error: "Invalid supplier id" }); return; }

  const parsed = CreateSupplierBillBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [supplier] = await db.select({ id: suppliersTable.id }).from(suppliersTable).where(and(eq(suppliersTable.id, params.data.id), eq(suppliersTable.accountId, accountId)));
  if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }

  const { billNumber, billDate, notes, imageUrl, items } = parsed.data;
  const totalAmount = items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => sum + item.quantity * item.unitPrice, 0);

  const [bill] = await db.insert(supplierBillsTable).values({
    supplierId: params.data.id,
    billNumber,
    billDate: billDate ? new Date(billDate) : new Date(),
    totalAmount: String(totalAmount),
    status: "draft",
    imageUrl: imageUrl ?? null,
    notes: notes ?? null,
  }).returning();

  for (const item of items) {
    const typedItem = item as { articleCode: string; productName: string; quantity: number; unitPrice: number; productId?: number };
    let productId: number | null = typedItem.productId ?? null;
    if (!productId && typedItem.articleCode) {
      const [product] = await db.select().from(productsTable).where(and(eq(productsTable.articleCode, typedItem.articleCode), eq(productsTable.accountId, accountId)));
      if (product) productId = product.id;
    }
    await db.insert(supplierBillItemsTable).values({
      billId: bill.id,
      productId,
      articleCode: typedItem.articleCode,
      productName: typedItem.productName,
      quantity: typedItem.quantity,
      unitPrice: String(typedItem.unitPrice),
      totalPrice: String(typedItem.quantity * typedItem.unitPrice),
    });
  }

  const result = await getBillWithItems(bill.id);
  res.status(201).json(result);
});

router.get("/suppliers/bills/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetSupplierBillParams.safeParse({ id: parseInt(req.params.id as string, 10) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const bill = await getBillWithItems(params.data.id);
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  res.json(bill);
});

router.post("/suppliers/bills/:id/confirm", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const params = ConfirmSupplierBillParams.safeParse({ id: parseInt(req.params.id as string, 10) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const bill = await getBillWithItems(params.data.id);
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  if (bill.status === "confirmed") { res.status(400).json({ error: "Bill already confirmed" }); return; }

  const stockUpdates: { articleCode: string; productName: string; quantityAdded: number; newStock: number }[] = [];

  for (const item of bill.items) {
    if (!item.productId) continue;
    const [updated] = await db
      .update(productsTable)
      .set({ currentStock: sql`${productsTable.currentStock} + ${item.quantity}` })
      .where(and(eq(productsTable.id, item.productId), eq(productsTable.accountId, accountId)))
      .returning({ currentStock: productsTable.currentStock, articleCode: productsTable.articleCode });

    if (updated) {
      await db.insert(stockMovementsTable).values({
        productId: item.productId,
        supplierId: bill.supplierId,
        type: "in",
        quantity: item.quantity,
        date: new Date(bill.billDate),
      });
      stockUpdates.push({ articleCode: item.articleCode, productName: item.productName, quantityAdded: item.quantity, newStock: updated.currentStock });
    }
  }

  await db.update(supplierBillsTable).set({ status: "confirmed" }).where(eq(supplierBillsTable.id, params.data.id));
  const updatedBill = await getBillWithItems(params.data.id);
  res.json({ bill: updatedBill, stockUpdates });
});

export default router;
