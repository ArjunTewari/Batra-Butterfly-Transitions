import { Router } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, productsTable, stockMovementsTable, productImagesTable, suppliersTable } from "@workspace/db";
import { CreateStockItemBody, AnalyzeStockImageBody, ConfirmStockMovementBody, AnalyzeSaleImageBody, ConfirmSaleBody, } from "@workspace/api-zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { requireAuth } from "../middleware/requireAuth";
const router = Router();
function parseBase64Image(imageBase64) {
    const base64Match = imageBase64.match(/^data:([a-zA-Z0-9/+]+);base64,(.+)$/);
    const rawBase64 = base64Match ? base64Match[2] : imageBase64;
    const detectedMime = base64Match ? base64Match[1] : "image/jpeg";
    const mediaType = (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(detectedMime)
        ? detectedMime
        : "image/jpeg");
    return { rawBase64, mediaType };
}
router.get("/stock", requireAuth, async (req, res) => {
    const accountId = req.session.accountId;
    const products = await db.select().from(productsTable).where(eq(productsTable.accountId, accountId)).orderBy(productsTable.name);
    res.json(products.map((p) => {
        var _a;
        return ({
            id: p.id,
            articleCode: p.articleCode,
            name: p.name,
            price: parseFloat(p.price),
            purchasePrice: p.purchasePrice ? parseFloat(p.purchasePrice) : null,
            currentStock: p.currentStock,
            imageUrl: (_a = p.imageUrl) !== null && _a !== void 0 ? _a : null,
            createdAt: p.createdAt.toISOString(),
        });
    }));
});
router.post("/stock", requireAuth, async (req, res) => {
    var _a, _b;
    const accountId = req.session.accountId;
    const parsed = CreateStockItemBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const [product] = await db.insert(productsTable).values({
        accountId,
        articleCode: parsed.data.articleCode,
        name: parsed.data.name,
        price: String(parsed.data.price),
        purchasePrice: parsed.data.purchasePrice != null ? String(parsed.data.purchasePrice) : null,
        currentStock: parsed.data.currentStock,
        imageUrl: (_a = parsed.data.imageUrl) !== null && _a !== void 0 ? _a : null,
    }).returning();
    res.status(201).json({
        id: product.id,
        articleCode: product.articleCode,
        name: product.name,
        price: parseFloat(product.price),
        purchasePrice: product.purchasePrice ? parseFloat(product.purchasePrice) : null,
        currentStock: product.currentStock,
        imageUrl: (_b = product.imageUrl) !== null && _b !== void 0 ? _b : null,
        createdAt: product.createdAt.toISOString(),
    });
});
router.post("/stock/analyze", requireAuth, async (req, res) => {
    var _a, _b, _c;
    const accountId = req.session.accountId;
    const parsed = AnalyzeStockImageBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const allProducts = await db.select().from(productsTable).where(eq(productsTable.accountId, accountId)).orderBy(productsTable.name);
    const productList = allProducts.map((p) => {
        var _a;
        return ({
            id: p.id,
            articleCode: p.articleCode,
            name: p.name,
            price: parseFloat(p.price),
            currentStock: p.currentStock,
            imageUrl: (_a = p.imageUrl) !== null && _a !== void 0 ? _a : null,
            createdAt: p.createdAt.toISOString(),
        });
    });
    // Collect all images from the request: single imageBase64 or imageBase64s array
    const images = [];
    if (parsed.data.imageBase64) {
        images.push(parsed.data.imageBase64);
    }
    if (parsed.data.imageBase64s && parsed.data.imageBase64s.length > 0) {
        for (const img of parsed.data.imageBase64s) {
            if (!images.includes(img))
                images.push(img);
        }
    }
    if (images.length === 0) {
        res.status(400).json({ error: "At least one image is required for analysis" });
        return;
    }
    const parsedImages = images.map(parseBase64Image);
    const articleCodeList = productList.map(p => `${p.articleCode} (${p.name})`).join("\n");
    // Build content array with all images
    const content = [];
    for (const img of parsedImages) {
        content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.rawBase64 } });
    }
    const imageCount = images.length;
    content.push({
        type: "text",
        text: `You are a footwear inventory assistant. Analyze ${imageCount > 1 ? `these ${imageCount} footwear images` : "this footwear image"} and identify which article code it most likely matches from the inventory list below.

The image may contain shoes, chappals, slides, sandals, boots, or any type of footwear.

Existing inventory:
${articleCodeList || "(no products yet)"}

Instructions:
- ${imageCount > 1 ? "Look at ALL images to get the best view of the footwear" : "Look at the footwear style, color, design, and type (shoe, chappal, slide, sandal, boot)"}
- CRITICAL: Check for any handwritten tags, stickers, or labels on the shoe with numbers/letters. If a tag shows a code like "103074", "BB-001", etc., use that as the article code.
- If the shoe has a visible price tag or label, note that price.
- Match it to the most likely article code from the list above
- If you cannot confidently match it to any existing article, suggest:
  - A new article code in format "BB-NEW-001"
  - A short product name (e.g., "Kolhapuri Chappal")
  - A suggested selling price in Indian Rupees (e.g., 999)
- Return ONLY valid JSON, no markdown, no explanation

Return this exact JSON format:
{
  "predictedArticleCode": "BB-XXX",
  "confidence": 0.85,
  "reasoning": "Brief reason for the match",
  "suggestedName": "Footwear Name",
  "suggestedPrice": 999
}`,
    });
    const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        messages: [
            {
                role: "user",
                content,
            },
        ],
    });
    let predictedArticleCode = "BB-UNKNOWN-001";
    let confidence = 0.3;
    let suggestedName = "";
    let suggestedPrice = 0;
    try {
        const block = message.content[0];
        if (block.type === "text") {
            const jsonText = block.text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
            const aiResult = JSON.parse(jsonText);
            predictedArticleCode = (_a = aiResult.predictedArticleCode) !== null && _a !== void 0 ? _a : predictedArticleCode;
            confidence = typeof aiResult.confidence === "number" ? aiResult.confidence : confidence;
            suggestedName = (_b = aiResult.suggestedName) !== null && _b !== void 0 ? _b : "";
            suggestedPrice = typeof aiResult.suggestedPrice === "number" ? aiResult.suggestedPrice : 0;
        }
    }
    catch {
        req.log.warn("Failed to parse AI response for stock image analysis");
    }
    const matchedProduct = (_c = productList.find(p => p.articleCode === predictedArticleCode)) !== null && _c !== void 0 ? _c : null;
    res.json({
        predictedArticleCode,
        confidence: Math.round(confidence * 100) / 100,
        suggestedName,
        suggestedPrice,
        matchedProduct: matchedProduct !== null && matchedProduct !== void 0 ? matchedProduct : undefined,
        allProducts: productList,
        imageUrls: images,
    });
});
router.post("/stock/confirm", requireAuth, async (req, res) => {
    var _a;
    const accountId = req.session.accountId;
    const parsed = ConfirmStockMovementBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const { articleCode, quantity, type: movementType, imageUrl, imageUrls, productId, name, price, purchasePrice, supplierName, supplierId } = parsed.data;
    // Resolve supplier: use provided ID (scoped to this account), or find/create by name
    let resolvedSupplierId = null;
    if (supplierId != null) {
        const [ownedSupplier] = await db
            .select({ id: suppliersTable.id })
            .from(suppliersTable)
            .where(and(eq(suppliersTable.id, supplierId), eq(suppliersTable.accountId, accountId)));
        if (!ownedSupplier) {
            res.status(404).json({ error: "Supplier not found." });
            return;
        }
        resolvedSupplierId = ownedSupplier.id;
    }
    if (!resolvedSupplierId && (supplierName === null || supplierName === void 0 ? void 0 : supplierName.trim())) {
        const trimmed = supplierName.trim();
        const [existing] = await db.select().from(suppliersTable).where(and(eq(suppliersTable.name, trimmed), eq(suppliersTable.accountId, accountId)));
        if (existing) {
            resolvedSupplierId = existing.id;
        }
        else {
            const [newSupplier] = await db.insert(suppliersTable).values({
                accountId,
                name: trimmed,
                phone: null,
                address: null,
                gstin: null,
            }).returning();
            resolvedSupplierId = newSupplier.id;
        }
    }
    let product = productId
        ? (await db.select().from(productsTable).where(and(eq(productsTable.id, productId), eq(productsTable.accountId, accountId))))[0]
        : undefined;
    // If not found by ID, try by articleCode
    if (!product) {
        product = (await db.select().from(productsTable).where(and(eq(productsTable.articleCode, articleCode), eq(productsTable.accountId, accountId))))[0];
    }
    // Auto-create new product if it doesn't exist
    if (!product) {
        if (!name || !price) {
            res.status(400).json({ error: "New product requires name and price." });
            return;
        }
        const [newProduct] = await db.insert(productsTable).values({
            accountId,
            articleCode,
            name,
            price: String(price),
            purchasePrice: purchasePrice != null ? String(purchasePrice) : null,
            currentStock: quantity,
            imageUrl: imageUrl !== null && imageUrl !== void 0 ? imageUrl : null,
        }).returning();
        product = newProduct;
    }
    else {
        const newStock = movementType === "in"
            ? product.currentStock + quantity
            : Math.max(0, product.currentStock - quantity);
        const updates = { currentStock: newStock };
        if (price !== undefined)
            updates.price = String(price);
        if (purchasePrice !== undefined)
            updates.purchasePrice = purchasePrice != null ? String(purchasePrice) : null;
        await db.update(productsTable).set(updates).where(eq(productsTable.id, product.id));
    }
    // Store all images in product_images table
    if (imageUrls && imageUrls.length > 0) {
        for (const img of imageUrls) {
            await db.insert(productImagesTable).values({
                productId: product.id,
                imageUrl: img,
            }).onConflictDoNothing();
        }
    }
    const [movement] = await db.insert(stockMovementsTable).values({
        productId: product.id,
        supplierId: resolvedSupplierId,
        type: movementType,
        quantity,
        imageUrl: imageUrl !== null && imageUrl !== void 0 ? imageUrl : null,
        date: new Date(),
    }).returning();
    res.status(201).json({
        id: movement.id,
        productId: movement.productId,
        productName: product.name,
        articleCode: product.articleCode,
        type: movement.type,
        quantity: movement.quantity,
        imageUrl: (_a = movement.imageUrl) !== null && _a !== void 0 ? _a : null,
        date: movement.date.toISOString(),
        createdAt: movement.createdAt.toISOString(),
    });
});
router.post("/stock/analyze-sale", requireAuth, async (req, res) => {
    var _a, _b;
    const accountId = req.session.accountId;
    const parsed = AnalyzeSaleImageBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const allProducts = await db.select().from(productsTable).where(eq(productsTable.accountId, accountId)).orderBy(productsTable.name);
    const productList = allProducts.map((p) => {
        var _a;
        return ({
            id: p.id,
            articleCode: p.articleCode,
            name: p.name,
            price: parseFloat(p.price),
            currentStock: p.currentStock,
            imageUrl: (_a = p.imageUrl) !== null && _a !== void 0 ? _a : null,
            createdAt: p.createdAt.toISOString(),
        });
    });
    const { imageBase64 } = parsed.data;
    const { rawBase64, mediaType } = parseBase64Image(imageBase64);
    const articleCodeList = productList.map(p => `${p.articleCode} (${p.name}, stock: ${p.currentStock})`).join("\n");
    // Gather reference images of known products so the AI can visually compare the
    // sale photo against the actual catalog. This dramatically improves matching
    // accuracy versus relying on the text article list alone.
    const REFERENCE_IMAGE_CAP = 30;
    const IMAGES_PER_PRODUCT = 2;
    const storedImages = await db
        .select({
        productId: productImagesTable.productId,
        imageUrl: productImagesTable.imageUrl,
    })
        .from(productImagesTable)
        .innerJoin(productsTable, and(eq(productImagesTable.productId, productsTable.id), eq(productsTable.accountId, accountId)));
    const imagesByProduct = new Map();
    for (const row of storedImages) {
        const list = (_a = imagesByProduct.get(row.productId)) !== null && _a !== void 0 ? _a : [];
        if (list.length < IMAGES_PER_PRODUCT) {
            list.push(row.imageUrl);
            imagesByProduct.set(row.productId, list);
        }
    }
    // Build the reference list, prioritising in-stock products. Fall back to the
    // product's primary imageUrl when no extra images are stored.
    const reference = [];
    const prioritised = [...productList].sort((a, b) => b.currentStock - a.currentStock);
    for (const p of prioritised) {
        if (reference.length >= REFERENCE_IMAGE_CAP)
            break;
        const stored = (_b = imagesByProduct.get(p.id)) !== null && _b !== void 0 ? _b : [];
        const candidates = stored.length > 0 ? stored : (p.imageUrl ? [p.imageUrl] : []);
        for (const img of candidates) {
            if (reference.length >= REFERENCE_IMAGE_CAP)
                break;
            reference.push({ articleCode: p.articleCode, name: p.name, image: img });
        }
    }
    const content = [];
    content.push({
        type: "text",
        text: `You are a footwear inventory assistant. The FIRST image below is the SALE PHOTO showing one or more footwear items that have been sold. Identify each distinct shoe/slide/chappal/sandal/boot/item visible and match it to the inventory.`,
    });
    content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: rawBase64 } });
    if (reference.length > 0) {
        content.push({
            type: "text",
            text: `Below are REFERENCE PHOTOS of known products from the catalog. Each reference is preceded by its article code. Compare the sale photo against these reference photos to find the closest visual match (color, pattern, strap style, sole, embellishments).`,
        });
        for (const ref of reference) {
            const { rawBase64: refRaw, mediaType: refMime } = parseBase64Image(ref.image);
            content.push({ type: "text", text: `Reference — ${ref.articleCode} (${ref.name}):` });
            content.push({ type: "image", source: { type: "base64", media_type: refMime, data: refRaw } });
        }
    }
    content.push({
        type: "text",
        text: `Full inventory (article code, name, stock):
${articleCodeList || "(no products yet)"}

Instructions:
- Count each DISTINCT shoe model/style visible in the SALE PHOTO.
- For each item, prefer a visual match against the REFERENCE PHOTOS above; use the matching reference's article code.
- If no reference photo matches, fall back to the closest article code from the inventory list by description.
- Estimate the quantity of each matched article visible in the sale photo.
- If an item genuinely matches nothing, use "UNKNOWN".
- Return ONLY valid JSON, no markdown, no explanation.

Return this exact JSON format:
{
  "items": [
    {
      "articleCode": "BB-XXX",
      "quantity": 2,
      "confidence": 0.85,
      "reasoning": "Brief reason"
    }
  ]
}`,
    });
    const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        messages: [
            {
                role: "user",
                content,
            },
        ],
    });
    let aiItems = [];
    try {
        const block = message.content[0];
        if (block.type === "text") {
            const jsonText = block.text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
            const parsed = JSON.parse(jsonText);
            aiItems = Array.isArray(parsed.items) ? parsed.items : [];
        }
    }
    catch {
        req.log.warn("Failed to parse AI response for sale analysis");
    }
    const detectedItems = aiItems.map((item) => {
        var _a, _b;
        const matchedProduct = (_a = productList.find(p => p.articleCode === item.articleCode)) !== null && _a !== void 0 ? _a : null;
        return {
            articleCode: item.articleCode,
            quantity: Math.max(1, Math.round(item.quantity)),
            confidence: Math.round(((_b = item.confidence) !== null && _b !== void 0 ? _b : 0.5) * 100) / 100,
            matchedProduct: matchedProduct !== null && matchedProduct !== void 0 ? matchedProduct : undefined,
            notFound: !matchedProduct || item.articleCode === "UNKNOWN",
        };
    });
    res.json({
        detectedItems,
        allProducts: productList,
        imageUrl: imageBase64,
    });
});
router.post("/stock/confirm-sale", requireAuth, async (req, res) => {
    var _a;
    const accountId = req.session.accountId;
    const parsed = ConfirmSaleBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const { items, imageUrl } = parsed.data;
    const movements = [];
    for (const item of items) {
        let product = item.productId
            ? (await db.select().from(productsTable).where(and(eq(productsTable.id, item.productId), eq(productsTable.accountId, accountId))))[0]
            : undefined;
        if (!product) {
            product = (await db.select().from(productsTable).where(and(eq(productsTable.articleCode, item.articleCode), eq(productsTable.accountId, accountId))))[0];
        }
        if (!product) {
            req.log.warn({ articleCode: item.articleCode }, "Product not found during sale confirmation, skipping");
            continue;
        }
        const newStock = Math.max(0, product.currentStock - item.quantity);
        await db.update(productsTable).set({ currentStock: newStock }).where(eq(productsTable.id, product.id));
        const [movement] = await db.insert(stockMovementsTable).values({
            productId: product.id,
            type: "out",
            quantity: item.quantity,
            imageUrl: imageUrl !== null && imageUrl !== void 0 ? imageUrl : null,
            date: new Date(),
        }).returning();
        movements.push({
            id: movement.id,
            productId: movement.productId,
            productName: product.name,
            articleCode: product.articleCode,
            type: movement.type,
            quantity: movement.quantity,
            imageUrl: (_a = movement.imageUrl) !== null && _a !== void 0 ? _a : null,
            date: movement.date.toISOString(),
            createdAt: movement.createdAt.toISOString(),
        });
    }
    const totalItems = movements.reduce((sum, m) => sum + m.quantity, 0);
    res.status(201).json({
        movements,
        totalItems,
        message: `Sale confirmed: ${movements.length} product(s), ${totalItems} total unit(s) deducted from stock.`,
    });
});
router.get("/stock/movements", requireAuth, async (req, res) => {
    const accountId = req.session.accountId;
    const movements = await db
        .select({
        id: stockMovementsTable.id,
        productId: stockMovementsTable.productId,
        productName: productsTable.name,
        articleCode: productsTable.articleCode,
        type: stockMovementsTable.type,
        quantity: stockMovementsTable.quantity,
        imageUrl: stockMovementsTable.imageUrl,
        date: stockMovementsTable.date,
        createdAt: stockMovementsTable.createdAt,
    })
        .from(stockMovementsTable)
        .innerJoin(productsTable, and(eq(stockMovementsTable.productId, productsTable.id), eq(productsTable.accountId, accountId)))
        .orderBy(desc(stockMovementsTable.date));
    res.json(movements.map((m) => {
        var _a;
        return ({
            id: m.id,
            productId: m.productId,
            productName: m.productName,
            articleCode: m.articleCode,
            type: m.type,
            quantity: m.quantity,
            imageUrl: (_a = m.imageUrl) !== null && _a !== void 0 ? _a : null,
            date: m.date.toISOString(),
            createdAt: m.createdAt.toISOString(),
        });
    }));
});
router.delete("/stock/products/:id", requireAuth, async (req, res) => {
    const accountId = req.session.accountId;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        res.status(400).json({ error: "Invalid product id" });
        return;
    }
    const [product] = await db
        .select()
        .from(productsTable)
        .where(and(eq(productsTable.id, id), eq(productsTable.accountId, accountId)));
    if (!product) {
        res.status(404).json({ error: "Product not found" });
        return;
    }
    // product_images and stock_movements cascade on delete; invoice_items.productId
    // is set to null, so invoice history is preserved.
    await db.delete(productsTable).where(and(eq(productsTable.id, id), eq(productsTable.accountId, accountId)));
    res.status(204).end();
});
export default router;
