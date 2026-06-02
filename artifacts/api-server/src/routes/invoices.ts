import { Router, type IRouter } from "express";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { db, retailersTable, staffTable, invoicesTable, invoiceItemsTable, productsTable, stockMovementsTable, ledgerEntriesTable, salesTable } from "@workspace/db";
import {
  CreateInvoiceBody,
  AnalyzeInvoiceImageBody,
  GetInvoiceParams,
  DeleteInvoiceParams,
  ConfirmInvoiceParams,
  ListInvoicesQueryParams,
} from "@workspace/api-zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { sendWhatsAppMessage } from "../lib/twilio";
import { requireAuth } from "../middleware/requireAuth";
import { trackAiUsage } from "../lib/trackAiUsage";

const router: IRouter = Router();

async function getInvoiceWithItems(invoiceId: number) {
  const [invoice] = await db
    .select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      retailerId: invoicesTable.retailerId,
      retailerName: retailersTable.name,
      staffId: invoicesTable.staffId,
      staffName: staffTable.name,
      totalAmount: invoicesTable.totalAmount,
      status: invoicesTable.status,
      imageUrl: invoicesTable.imageUrl,
      notes: invoicesTable.notes,
      date: invoicesTable.date,
      createdAt: invoicesTable.createdAt,
    })
    .from(invoicesTable)
    .innerJoin(retailersTable, eq(invoicesTable.retailerId, retailersTable.id))
    .innerJoin(staffTable, eq(invoicesTable.staffId, staffTable.id))
    .where(eq(invoicesTable.id, invoiceId));

  if (!invoice) return null;

  const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoiceId));

  return {
    ...invoice,
    totalAmount: parseFloat(invoice.totalAmount),
    date: invoice.date.toISOString(),
    createdAt: invoice.createdAt.toISOString(),
    items: items.map((item) => ({
      id: item.id,
      invoiceId: item.invoiceId,
      productId: item.productId ?? null,
      articleCode: item.articleCode,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: parseFloat(item.unitPrice),
      totalPrice: parseFloat(item.totalPrice),
    })),
  };
}

router.get("/invoices", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const qParams = ListInvoicesQueryParams.safeParse(req.query);

  const invoices = await db
    .select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      retailerId: invoicesTable.retailerId,
      retailerName: retailersTable.name,
      staffId: invoicesTable.staffId,
      staffName: staffTable.name,
      totalAmount: invoicesTable.totalAmount,
      status: invoicesTable.status,
      imageUrl: invoicesTable.imageUrl,
      notes: invoicesTable.notes,
      date: invoicesTable.date,
      createdAt: invoicesTable.createdAt,
    })
    .from(invoicesTable)
    .innerJoin(retailersTable, eq(invoicesTable.retailerId, retailersTable.id))
    .innerJoin(staffTable, eq(invoicesTable.staffId, staffTable.id))
    .where(eq(invoicesTable.accountId, accountId))
    .orderBy(desc(invoicesTable.date));

  let filtered = invoices;
  if (qParams.success) {
    if (qParams.data.status) filtered = filtered.filter(i => i.status === qParams.data.status);
    if (qParams.data.retailerId) filtered = filtered.filter(i => i.retailerId === qParams.data.retailerId);
    if (qParams.data.staffId) filtered = filtered.filter(i => i.staffId === qParams.data.staffId);
    if (qParams.data.from) filtered = filtered.filter(i => i.date >= new Date(qParams.data.from!));
    if (qParams.data.to) filtered = filtered.filter(i => i.date <= new Date(qParams.data.to!));
  }

  const results = await Promise.all(
    filtered.map(async (inv) => {
      const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, inv.id));
      return {
        ...inv,
        totalAmount: parseFloat(inv.totalAmount),
        date: inv.date.toISOString(),
        createdAt: inv.createdAt.toISOString(),
        items: items.map((item) => ({
          id: item.id,
          invoiceId: item.invoiceId,
          productId: item.productId ?? null,
          articleCode: item.articleCode,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: parseFloat(item.unitPrice),
          totalPrice: parseFloat(item.totalPrice),
        })),
      };
    })
  );

  res.json(results);
});

router.get("/invoices/daily-summary", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const days = parseInt(String(req.query.days ?? "30"), 10);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const confirmedInvoices = await db
    .select({ id: invoicesTable.id, date: invoicesTable.date, totalAmount: invoicesTable.totalAmount, retailerName: retailersTable.name })
    .from(invoicesTable)
    .innerJoin(retailersTable, eq(invoicesTable.retailerId, retailersTable.id))
    .where(and(eq(invoicesTable.accountId, accountId), eq(invoicesTable.status, "confirmed"), gte(invoicesTable.date, since)))
    .orderBy(desc(invoicesTable.date));

  const grouped = new Map<string, { totalAmount: number; invoiceCount: number; retailers: string[] }>();
  for (const inv of confirmedInvoices) {
    const dateKey = inv.date.toISOString().split("T")[0];
    const existing = grouped.get(dateKey) ?? { totalAmount: 0, invoiceCount: 0, retailers: [] };
    existing.totalAmount += parseFloat(inv.totalAmount);
    existing.invoiceCount += 1;
    existing.retailers.push(inv.retailerName);
    grouped.set(dateKey, existing);
  }

  res.json(Array.from(grouped.entries()).sort(([a], [b]) => b.localeCompare(a)).map(([date, data]) => ({
    date,
    totalAmount: data.totalAmount,
    invoiceCount: data.invoiceCount,
    topRetailer: data.retailers[0] ?? null,
  })));
});

router.post("/invoices/analyze-image", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const parsed = AnalyzeInvoiceImageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { imageBase64, mimeType } = parsed.data;
  const mediaType = (mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp") ?? "image/jpeg";

  const message = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 8192,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
        { type: "text", text: `You are analyzing a sales invoice for a footwear distribution business.
Extract all the following information from this invoice image and return it as valid JSON only (no markdown, no explanation):
{
  "invoiceNumber": "string or null",
  "date": "ISO date string YYYY-MM-DD or null",
  "retailerName": "string or null",
  "totalAmount": number or null,
  "confidence": number between 0 and 1,
  "rawText": "brief summary of what you see",
  "items": [{ "articleCode": "string or null", "productName": "string describing the footwear item", "quantity": integer, "unitPrice": number or null, "totalPrice": number or null }]
}
Return ONLY the JSON object, nothing else.` },
      ],
    }],
  });

  await trackAiUsage({
    accountId,
    model: "claude-opus-4-7",
    feature: "invoice_scan",
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  });

  const block = message.content[0];
  const rawText = block.type === "text" ? block.text : "{}";
  let parsed2: Record<string, unknown>;
  try { parsed2 = JSON.parse(rawText); } catch {
    parsed2 = { invoiceNumber: null, date: null, retailerName: null, totalAmount: null, confidence: 0.1, rawText: rawText.slice(0, 200), items: [] };
  }

  res.json({
    invoiceNumber: parsed2.invoiceNumber ?? null,
    date: parsed2.date ?? null,
    retailerName: parsed2.retailerName ?? null,
    totalAmount: parsed2.totalAmount ?? null,
    confidence: typeof parsed2.confidence === "number" ? parsed2.confidence : 0.5,
    rawText: typeof parsed2.rawText === "string" ? parsed2.rawText : "",
    items: Array.isArray(parsed2.items) ? parsed2.items : [],
  });
});

router.get("/invoices/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetInvoiceParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const invoice = await getInvoiceWithItems(params.data.id);
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.json(invoice);
});

router.post("/invoices", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const parsed = CreateInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { retailerId, staffId, invoiceNumber, date, notes, imageUrl, items } = parsed.data;
  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const [invoice] = await db.insert(invoicesTable).values({
    accountId,
    invoiceNumber,
    retailerId,
    staffId,
    totalAmount: String(totalAmount),
    status: "draft",
    imageUrl: imageUrl ?? null,
    notes: notes ?? null,
    date: date ? new Date(date) : new Date(),
  }).returning();

  for (const item of items) {
    let productId: number | null = item.productId ?? null;
    if (!productId && item.articleCode) {
      const [product] = await db.select().from(productsTable).where(and(eq(productsTable.articleCode, item.articleCode), eq(productsTable.accountId, accountId)));
      if (product) productId = product.id;
    }
    await db.insert(invoiceItemsTable).values({
      invoiceId: invoice.id,
      productId,
      articleCode: item.articleCode,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: String(item.unitPrice),
      totalPrice: String(item.quantity * item.unitPrice),
    });
  }

  const result = await getInvoiceWithItems(invoice.id);

  const [retailer] = await db.select({ name: retailersTable.name, phone: retailersTable.phone }).from(retailersTable).where(eq(retailersTable.id, retailerId));
  if (retailer) {
    await sendWhatsAppMessage(retailer.phone, `Hi ${retailer.name},\n\nA new invoice (${invoiceNumber}) has been created for you.\n\nTotal: ₹${totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}\nItems: ${items.length}\nStatus: Draft`);
  }

  res.status(201).json(result);
});

router.delete("/invoices/:id", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteInvoiceParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [inv] = await db.select().from(invoicesTable).where(and(eq(invoicesTable.id, params.data.id), eq(invoicesTable.accountId, accountId)));
  if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (inv.status === "confirmed") { res.status(400).json({ error: "Cannot delete a confirmed invoice" }); return; }
  await db.delete(invoicesTable).where(eq(invoicesTable.id, params.data.id));
  res.sendStatus(204);
});

router.post("/invoices/:id/confirm", requireAuth, async (req, res): Promise<void> => {
  if (req.session.role !== "master") {
    res.status(403).json({ error: "Only the master account can confirm invoices" });
    return;
  }
  const accountId = req.session.accountId!;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ConfirmInvoiceParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const invoice = await getInvoiceWithItems(params.data.id);
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (invoice.status === "confirmed") { res.status(400).json({ error: "Invoice already confirmed" }); return; }

  const stockUpdates: { articleCode: string; productName: string; quantityDeducted: number; newStock: number }[] = [];

  for (const item of invoice.items) {
    if (item.productId) {
      const [product] = await db.select().from(productsTable).where(and(eq(productsTable.id, item.productId), eq(productsTable.accountId, accountId)));
      if (product) {
        const newStock = Math.max(0, product.currentStock - item.quantity);
        await db.update(productsTable).set({ currentStock: newStock }).where(eq(productsTable.id, product.id));
        await db.insert(stockMovementsTable).values({ productId: product.id, type: "out", quantity: item.quantity, imageUrl: invoice.imageUrl ?? null, date: new Date(invoice.date) });
        stockUpdates.push({ articleCode: item.articleCode, productName: item.productName, quantityDeducted: item.quantity, newStock });
      }
    } else {
      stockUpdates.push({ articleCode: item.articleCode, productName: item.productName, quantityDeducted: item.quantity, newStock: 0 });
    }
  }

  const [ledgerEntry] = await db.insert(ledgerEntriesTable).values({
    retailerId: invoice.retailerId,
    type: "sale",
    amount: String(invoice.totalAmount),
    note: `Invoice #${invoice.invoiceNumber}`,
    date: new Date(invoice.date),
  }).returning();

  const [saleRecord] = await db.insert(salesTable).values({
    accountId,
    retailerId: invoice.retailerId,
    staffId: invoice.staffId,
    amount: String(invoice.totalAmount),
    date: new Date(invoice.date),
  }).returning();

  await db.update(invoicesTable).set({ status: "confirmed" }).where(eq(invoicesTable.id, params.data.id));

  const [staff] = await db.select().from(staffTable).where(eq(staffTable.id, invoice.staffId));
  const commissionRate = staff ? parseFloat(staff.commissionRate) : 5;
  const commissionEarned = invoice.totalAmount * (commissionRate / 100);

  res.json({
    invoice: await getInvoiceWithItems(params.data.id),
    stockUpdates,
    ledgerEntry: { id: ledgerEntry.id, retailerId: ledgerEntry.retailerId, type: ledgerEntry.type, amount: parseFloat(ledgerEntry.amount), note: ledgerEntry.note ?? null, date: ledgerEntry.date.toISOString(), createdAt: ledgerEntry.createdAt.toISOString() },
    saleRecord: { id: saleRecord.id, retailerId: saleRecord.retailerId, staffId: saleRecord.staffId, amount: parseFloat(saleRecord.amount), date: saleRecord.date.toISOString(), createdAt: saleRecord.createdAt.toISOString() },
    commissionEarned,
  });
});

export default router;
