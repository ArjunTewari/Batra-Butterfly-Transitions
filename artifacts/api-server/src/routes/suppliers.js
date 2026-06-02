import { Router } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
import { db, suppliersTable, supplierBillsTable, supplierBillItemsTable, productsTable, stockMovementsTable, } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { CreateSupplierBody, GetSupplierParams, CreateSupplierBillParams, CreateSupplierBillBody, AnalyzeSupplierBillParams, AnalyzeSupplierBillBody, GetSupplierBillParams, ConfirmSupplierBillParams, } from "@workspace/api-zod";
import { requireAuth } from "../middleware/requireAuth";
import { trackAiUsage } from "../lib/trackAiUsage";
const router = Router();
async function getBillWithItems(billId) {
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
    if (!bill)
        return null;
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
        items: items.map((item) => {
            var _a;
            return ({
                id: item.id,
                billId: item.billId,
                productId: (_a = item.productId) !== null && _a !== void 0 ? _a : null,
                articleCode: item.articleCode,
                productName: item.productName,
                quantity: item.quantity,
                unitPrice: parseFloat(item.unitPrice),
                totalPrice: parseFloat(item.totalPrice),
            });
        }),
    };
}
router.get("/suppliers", requireAuth, async (req, res) => {
    const accountId = req.session.accountId;
    const suppliers = await db.select().from(suppliersTable).where(eq(suppliersTable.accountId, accountId)).orderBy(suppliersTable.name);
    const summaries = await Promise.all(suppliers.map(async (s) => {
        var _a, _b, _c;
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
            phone: (_a = s.phone) !== null && _a !== void 0 ? _a : null,
            address: (_b = s.address) !== null && _b !== void 0 ? _b : null,
            gstin: (_c = s.gstin) !== null && _c !== void 0 ? _c : null,
            billCount: bills.length,
            totalSpend,
            lastBillDate: lastBill ? lastBill.billDate.toISOString() : null,
            createdAt: s.createdAt.toISOString(),
        };
    }));
    res.json(summaries);
});
router.post("/suppliers", requireAuth, async (req, res) => {
    var _a, _b, _c;
    const accountId = req.session.accountId;
    const parsed = CreateSupplierBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const [supplier] = await db.insert(suppliersTable).values({
        accountId,
        name: parsed.data.name,
        phone: (_a = parsed.data.phone) !== null && _a !== void 0 ? _a : null,
        address: (_b = parsed.data.address) !== null && _b !== void 0 ? _b : null,
        gstin: (_c = parsed.data.gstin) !== null && _c !== void 0 ? _c : null,
    }).returning();
    res.status(201).json({ ...supplier, createdAt: supplier.createdAt.toISOString() });
});
router.get("/suppliers/:id", requireAuth, async (req, res) => {
    var _a, _b, _c;
    const accountId = req.session.accountId;
    const params = GetSupplierParams.safeParse({ id: parseInt(req.params.id, 10) });
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [supplier] = await db.select().from(suppliersTable).where(and(eq(suppliersTable.id, params.data.id), eq(suppliersTable.accountId, accountId)));
    if (!supplier) {
        res.status(404).json({ error: "Supplier not found" });
        return;
    }
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
    const movementToBill = new Map();
    for (const bill of billsWithItems) {
        if (!bill || bill.status !== "confirmed")
            continue;
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
        phone: (_a = supplier.phone) !== null && _a !== void 0 ? _a : null,
        address: (_b = supplier.address) !== null && _b !== void 0 ? _b : null,
        gstin: (_c = supplier.gstin) !== null && _c !== void 0 ? _c : null,
        createdAt: supplier.createdAt.toISOString(),
        bills: billsWithItems.filter(Boolean),
        stockImages: stockImages.map((sm) => {
            var _a, _b, _c, _d, _e;
            return ({
                stockMovementId: sm.stockMovementId,
                productId: sm.productId,
                articleCode: sm.articleCode,
                productName: sm.productName,
                quantity: sm.quantity,
                imageUrl: (_a = sm.imageUrl) !== null && _a !== void 0 ? _a : null,
                date: sm.date.toISOString(),
                billId: (_c = (_b = movementToBill.get(sm.stockMovementId)) === null || _b === void 0 ? void 0 : _b.billId) !== null && _c !== void 0 ? _c : null,
                billNumber: (_e = (_d = movementToBill.get(sm.stockMovementId)) === null || _d === void 0 ? void 0 : _d.billNumber) !== null && _e !== void 0 ? _e : null,
            });
        }),
    });
});
router.get("/suppliers/:id/bills", requireAuth, async (req, res) => {
    const accountId = req.session.accountId;
    const params = GetSupplierParams.safeParse({ id: parseInt(req.params.id, 10) });
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [supplier] = await db.select().from(suppliersTable).where(and(eq(suppliersTable.id, params.data.id), eq(suppliersTable.accountId, accountId)));
    if (!supplier) {
        res.status(404).json({ error: "Supplier not found" });
        return;
    }
    const bills = await db.select({ id: supplierBillsTable.id }).from(supplierBillsTable).where(eq(supplierBillsTable.supplierId, params.data.id)).orderBy(desc(supplierBillsTable.createdAt));
    const results = await Promise.all(bills.map((b) => getBillWithItems(b.id)));
    res.json(results.filter(Boolean));
});
router.post("/suppliers/:id/bills/scan", requireAuth, async (req, res) => {
    var _a, _b, _c, _d, _e, _f;
    const accountId = req.session.accountId;
    const params = AnalyzeSupplierBillParams.safeParse({ id: parseInt(req.params.id, 10) });
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const parsed = AnalyzeSupplierBillBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    let supplierName = null;
    const [s] = await db.select({ name: suppliersTable.name }).from(suppliersTable).where(and(eq(suppliersTable.id, params.data.id), eq(suppliersTable.accountId, accountId)));
    if (!s) {
        res.status(404).json({ error: "Supplier not found" });
        return;
    }
    supplierName = s.name;
    const { imageBase64, mimeType } = parsed.data;
    const mediaType = (_a = mimeType) !== null && _a !== void 0 ? _a : "image/jpeg";
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
    let result;
    try {
        result = JSON.parse(rawText);
    }
    catch {
        result = { supplierName: null, billNumber: null, date: null, totalAmount: null, confidence: 0.1, rawText: rawText.slice(0, 200), items: [] };
    }
    res.json({
        supplierName: (_c = (_b = result.supplierName) !== null && _b !== void 0 ? _b : supplierName) !== null && _c !== void 0 ? _c : null,
        billNumber: (_d = result.billNumber) !== null && _d !== void 0 ? _d : null,
        date: (_e = result.date) !== null && _e !== void 0 ? _e : null,
        totalAmount: (_f = result.totalAmount) !== null && _f !== void 0 ? _f : null,
        confidence: typeof result.confidence === "number" ? result.confidence : 0.5,
        rawText: typeof result.rawText === "string" ? result.rawText : "",
        items: Array.isArray(result.items) ? result.items : [],
    });
});
router.post("/suppliers/:id/bills", requireAuth, async (req, res) => {
    var _a;
    const accountId = req.session.accountId;
    const params = CreateSupplierBillParams.safeParse({ id: parseInt(req.params.id, 10) });
    if (!params.success) {
        res.status(400).json({ error: "Invalid supplier id" });
        return;
    }
    const parsed = CreateSupplierBillBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const [supplier] = await db.select({ id: suppliersTable.id }).from(suppliersTable).where(and(eq(suppliersTable.id, params.data.id), eq(suppliersTable.accountId, accountId)));
    if (!supplier) {
        res.status(404).json({ error: "Supplier not found" });
        return;
    }
    const { billNumber, billDate, notes, imageUrl, items } = parsed.data;
    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const [bill] = await db.insert(supplierBillsTable).values({
        supplierId: params.data.id,
        billNumber,
        billDate: billDate ? new Date(billDate) : new Date(),
        totalAmount: String(totalAmount),
        status: "draft",
        imageUrl: imageUrl !== null && imageUrl !== void 0 ? imageUrl : null,
        notes: notes !== null && notes !== void 0 ? notes : null,
    }).returning();
    for (const item of items) {
        const typedItem = item;
        let productId = (_a = typedItem.productId) !== null && _a !== void 0 ? _a : null;
        if (!productId && typedItem.articleCode) {
            const [product] = await db.select().from(productsTable).where(and(eq(productsTable.articleCode, typedItem.articleCode), eq(productsTable.accountId, accountId)));
            if (product)
                productId = product.id;
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
router.get("/suppliers/bills/:id", requireAuth, async (req, res) => {
    const params = GetSupplierBillParams.safeParse({ id: parseInt(req.params.id, 10) });
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const bill = await getBillWithItems(params.data.id);
    if (!bill) {
        res.status(404).json({ error: "Bill not found" });
        return;
    }
    res.json(bill);
});
router.post("/suppliers/bills/:id/confirm", requireAuth, async (req, res) => {
    const accountId = req.session.accountId;
    const params = ConfirmSupplierBillParams.safeParse({ id: parseInt(req.params.id, 10) });
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const bill = await getBillWithItems(params.data.id);
    if (!bill) {
        res.status(404).json({ error: "Bill not found" });
        return;
    }
    if (bill.status === "confirmed") {
        res.status(400).json({ error: "Bill already confirmed" });
        return;
    }
    const stockUpdates = [];
    for (const item of bill.items) {
        if (!item.productId)
            continue;
        const [updated] = await db
            .update(productsTable)
            .set({ currentStock: sql `${productsTable.currentStock} + ${item.quantity}` })
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
