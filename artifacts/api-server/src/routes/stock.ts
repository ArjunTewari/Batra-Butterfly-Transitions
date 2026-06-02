import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, productsTable, stockMovementsTable, productImagesTable, suppliersTable } from "@workspace/db";
import {
  CreateStockItemBody,
  AnalyzeStockImageBody,
  ConfirmStockMovementBody,
  AnalyzeSaleImageBody,
  ConfirmSaleBody,
} from "@workspace/api-zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { requireAuth } from "../middleware/requireAuth";

const router: IRouter = Router();

function parseBase64Image(imageBase64: string): { rawBase64: string; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" } {
  const base64Match = imageBase64.match(/^data:([a-zA-Z0-9/+]+);base64,(.+)$/);
  const rawBase64 = base64Match ? base64Match[2] : imageBase64;
  const detectedMime = base64Match ? base64Match[1] : "image/jpeg";
  const mediaType = (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(detectedMime)
    ? detectedMime
    : "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  return { rawBase64, mediaType };
}

router.get("/stock", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const products = await db.select().from(productsTable).where(eq(productsTable.accountId, accountId)).orderBy(productsTable.name);
  res.json(products.map((p) => ({
    id: p.id,
    articleCode: p.articleCode,
    name: p.name,
    price: parseFloat(p.price),
    purchasePrice: p.purchasePrice ? parseFloat(p.purchasePrice) : null,
    currentStock: p.currentStock,
    imageUrl: p.imageUrl ?? null,
    createdAt: p.createdAt.toISOString(),
  })));
});

router.post("/stock", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
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
    imageUrl: parsed.data.imageUrl ?? null,
  }).returning();
  res.status(201).json({
    id: product.id,
    articleCode: product.articleCode,
    name: product.name,
    price: parseFloat(product.price),
    purchasePrice: product.purchasePrice ? parseFloat(product.purchasePrice) : null,
    currentStock: product.currentStock,
    imageUrl: product.imageUrl ?? null,
    createdAt: product.createdAt.toISOString(),
  });
});

router.post("/stock/analyze", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const parsed = AnalyzeStockImageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const allProducts = await db.select().from(productsTable).where(eq(productsTable.accountId, accountId)).orderBy(productsTable.name);
  const productList = allProducts.map((p) => ({
    id: p.id,
    articleCode: p.articleCode,
    name: p.name,
    price: parseFloat(p.price),
    currentStock: p.currentStock,
    imageUrl: p.imageUrl ?? null,
    createdAt: p.createdAt.toISOString(),
  }));

  // Collect all images from the request: single imageBase64 or imageBase64s array
  const images: string[] = [];
  if (parsed.data.imageBase64) {
    images.push(parsed.data.imageBase64);
  }
  if (parsed.data.imageBase64s && parsed.data.imageBase64s.length > 0) {
    for (const img of parsed.data.imageBase64s) {
      if (!images.includes(img)) images.push(img);
    }
  }

  if (images.length === 0) {
    res.status(400).json({ error: "At least one image is required for analysis" });
    return;
  }

  const parsedImages = images.map(parseBase64Image);
  const articleCodeList = productList.map(p => `${p.articleCode} (${p.name})`).join("\n");

  // Build content array with all images
  const content: Array<{ type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string } } | { type: "text"; text: string }> = [];
  for (const img of parsedImages) {
    content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.rawBase64 } });
  }

  const imageCount = images.length;
  content.push({
    type: "text",
    text: `You are a footwear inventory assistant. Analyze ${imageCount > 1 ? `these ${imageCount} shoe images` : "this shoe image"} and identify which article code it most likely matches from the inventory list below.

Existing inventory:
${articleCodeList || "(no products yet)"}

Instructions:
- ${imageCount > 1 ? "Look at ALL images to get the best view of the shoe" : "Look at the shoe style, color, design, and type"}
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
  "suggestedName": "Shoe Name",
  "suggestedPrice": 999
}`,
  });

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5",
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
      const aiResult = JSON.parse(jsonText) as {
        predictedArticleCode: string;
        confidence: number;
        reasoning?: string;
        suggestedName?: string;
        suggestedPrice?: number;
      };
      predictedArticleCode = aiResult.predictedArticleCode ?? predictedArticleCode;
      confidence = typeof aiResult.confidence === "number" ? aiResult.confidence : confidence;
      suggestedName = aiResult.suggestedName ?? "";
      suggestedPrice = typeof aiResult.suggestedPrice === "number" ? aiResult.suggestedPrice : 0;
    }
  } catch {
    req.log.warn("Failed to parse AI response for stock image analysis");
  }

  const matchedProduct = productList.find(p => p.articleCode === predictedArticleCode) ?? null;

  res.json({
    predictedArticleCode,
    confidence: Math.round(confidence * 100) / 100,
    suggestedName,
    suggestedPrice,
    matchedProduct: matchedProduct ?? undefined,
    allProducts: productList,
    imageUrls: images,
  });
});

router.post("/stock/confirm", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const parsed = ConfirmStockMovementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { articleCode, quantity, type: movementType, imageUrl, imageUrls, productId, name, price, purchasePrice, supplierName, supplierId } = parsed.data;

  // Resolve supplier: use provided ID, or find/create by name
  let resolvedSupplierId: number | null = supplierId ?? null;
  if (!resolvedSupplierId && supplierName?.trim()) {
    const trimmed = supplierName.trim();
    const [existing] = await db.select().from(suppliersTable).where(and(eq(suppliersTable.name, trimmed), eq(suppliersTable.accountId, accountId)));
    if (existing) {
      resolvedSupplierId = existing.id;
    } else {
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
      imageUrl: imageUrl ?? null,
    }).returning();
    product = newProduct;
  } else {
    const newStock = movementType === "in"
      ? product.currentStock + quantity
      : Math.max(0, product.currentStock - quantity);
    const updates: Record<string, unknown> = { currentStock: newStock };
    if (price !== undefined) updates.price = String(price);
    if (purchasePrice !== undefined) updates.purchasePrice = purchasePrice != null ? String(purchasePrice) : null;
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
    imageUrl: imageUrl ?? null,
    date: new Date(),
  }).returning();

  res.status(201).json({
    id: movement.id,
    productId: movement.productId,
    productName: product.name,
    articleCode: product.articleCode,
    type: movement.type,
    quantity: movement.quantity,
    imageUrl: movement.imageUrl ?? null,
    date: movement.date.toISOString(),
    createdAt: movement.createdAt.toISOString(),
  });
});

router.post("/stock/analyze-sale", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const parsed = AnalyzeSaleImageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const allProducts = await db.select().from(productsTable).where(eq(productsTable.accountId, accountId)).orderBy(productsTable.name);
  const productList = allProducts.map((p) => ({
    id: p.id,
    articleCode: p.articleCode,
    name: p.name,
    price: parseFloat(p.price),
    currentStock: p.currentStock,
    imageUrl: p.imageUrl ?? null,
    createdAt: p.createdAt.toISOString(),
  }));

  const { imageBase64 } = parsed.data;
  const { rawBase64, mediaType } = parseBase64Image(imageBase64);
  const articleCodeList = productList.map(p => `${p.articleCode} (${p.name}, stock: ${p.currentStock})`).join("\n");

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: rawBase64 } },
          {
            type: "text",
            text: `You are a footwear inventory assistant. Analyze this image which shows multiple footwear items that have been sold. Identify each distinct shoe/item visible and match it to the inventory list.

Existing inventory:
${articleCodeList || "(no products yet)"}

Instructions:
- Count each DISTINCT shoe model/style visible in the image
- For each item, estimate the quantity of that article in the image
- Match each item to the closest article code from the inventory list
- If an item doesn't match any known article, use "UNKNOWN"
- Return ONLY valid JSON, no markdown, no explanation

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
          },
        ],
      },
    ],
  });

  interface AiItem {
    articleCode: string;
    quantity: number;
    confidence: number;
    reasoning?: string;
  }

  let aiItems: AiItem[] = [];
  try {
    const block = message.content[0];
    if (block.type === "text") {
      const jsonText = block.text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      const parsed = JSON.parse(jsonText) as { items: AiItem[] };
      aiItems = Array.isArray(parsed.items) ? parsed.items : [];
    }
  } catch {
    req.log.warn("Failed to parse AI response for sale analysis");
  }

  const detectedItems = aiItems.map((item) => {
    const matchedProduct = productList.find(p => p.articleCode === item.articleCode) ?? null;
    return {
      articleCode: item.articleCode,
      quantity: Math.max(1, Math.round(item.quantity)),
      confidence: Math.round((item.confidence ?? 0.5) * 100) / 100,
      matchedProduct: matchedProduct ?? undefined,
      notFound: !matchedProduct || item.articleCode === "UNKNOWN",
    };
  });

  res.json({
    detectedItems,
    allProducts: productList,
    imageUrl: imageBase64,
  });
});

router.post("/stock/confirm-sale", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
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
      imageUrl: imageUrl ?? null,
      date: new Date(),
    }).returning();

    movements.push({
      id: movement.id,
      productId: movement.productId,
      productName: product.name,
      articleCode: product.articleCode,
      type: movement.type,
      quantity: movement.quantity,
      imageUrl: movement.imageUrl ?? null,
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

router.get("/stock/movements", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
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

  res.json(movements.map((m) => ({
    id: m.id,
    productId: m.productId,
    productName: m.productName,
    articleCode: m.articleCode,
    type: m.type,
    quantity: m.quantity,
    imageUrl: m.imageUrl ?? null,
    date: m.date.toISOString(),
    createdAt: m.createdAt.toISOString(),
  })));
});

export default router;
