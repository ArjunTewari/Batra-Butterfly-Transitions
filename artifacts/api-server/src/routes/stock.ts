import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";
import { db, productsTable, stockMovementsTable, productImagesTable, suppliersTable } from "@workspace/db";
import {
  CreateStockItemBody,
  AnalyzeStockImageBody,
  ConfirmStockMovementBody,
  AnalyzeSaleImageBody,
  ConfirmSaleBody,
  TagPricesBody,
} from "@workspace/api-zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { requireAuth } from "../middleware/requireAuth";
import { trackAiUsage } from "../lib/trackAiUsage";

const router: IRouter = Router();

// ── Cloudinary catalog (uploaded by user, avoids Airtable robots.txt blocks) ──
interface CloudinaryAttachment { cloudinary_url: string }
interface CloudinaryCatalogRecord {
  fields: {
    "Product code": string;
    Attachments_Cloudinary?: CloudinaryAttachment[];
  };
}
function loadCloudinaryCatalog(): Map<string, string[]> {
  try {
    const raw = readFileSync(join(process.cwd(), "src/data/cloudinary-catalog.json"), "utf-8");
    const records = JSON.parse(raw) as CloudinaryCatalogRecord[];
    const map = new Map<string, string[]>();
    for (const rec of records) {
      const code = (rec.fields["Product code"] ?? "").trim();
      const urls = (rec.fields.Attachments_Cloudinary ?? []).map((a) => a.cloudinary_url).filter(Boolean);
      if (code && urls.length > 0) map.set(code, urls);
    }
    return map;
  } catch {
    return new Map();
  }
}
const cloudinaryImageMap = loadCloudinaryCatalog();

// Resize Cloudinary images before sending to Anthropic.
// At 800px max: ~640 tokens per image — lets us fit 200 refs in one call (128K tokens).
// Anthropic also enforces ≤2000px per dimension in multi-image requests.
function cloudinaryResized(url: string, maxPx = 800): string {
  // Cloudinary URL: https://res.cloudinary.com/<cloud>/image/upload/<transforms?>/v<ver>/<id>
  return url.replace(/\/image\/upload\//, `/image/upload/w_${maxPx},h_${maxPx},c_limit/`);
}

// Airtable source tables to import inventory from. Base/table IDs are not secret;
// the access token is read from the AIRTABLE_API_KEY secret at request time.
const AIRTABLE_SOURCES: ReadonlyArray<{ baseId: string; tableId: string }> = [
  { baseId: "appuqLiFCocS0gkgt", tableId: "tblEGjtkcy0SrQhwB" },
  { baseId: "appC9aBBwrRu5yBrT", tableId: "tblZTV0LAUwi3CQOQ" },
];
const AIRTABLE_PAGE_SIZE = 100;
const MAX_IMAGES_PER_PRODUCT = 2;
const MAX_TAG_IMAGE_BASE64_CHARS = 12 * 1024 * 1024; // ~9 MB decoded
const MAX_TAG_ITEMS = 60;

interface AirtableAttachment {
  url?: string;
  thumbnails?: { large?: { url?: string }; full?: { url?: string } };
}
interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return String(v).trim();
}

/* ─────────────────────── Airtable live catalog helpers ───────────────────── */

interface AirtableProduct {
  articleCode: string;
  name: string;
  price: number;
  purchasePrice: number | null;
  images: string[];
  supplierName: string;
}

// Fetch ALL records from both Airtable tables (max 200 total).  No pagination
// in the response — we stream everything into one array.
async function fetchAirtableProducts(): Promise<AirtableProduct[]> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  if (!apiKey) return [];
  const products: AirtableProduct[] = [];
  for (const source of AIRTABLE_SOURCES) {
    let offset: string | undefined;
    for (;;) {
      const url = new URL(`https://api.airtable.com/v0/${source.baseId}/${source.tableId}`);
      url.searchParams.set("pageSize", String(AIRTABLE_PAGE_SIZE));
      if (offset) url.searchParams.set("offset", offset);
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!resp.ok) break;
      const data = (await resp.json()) as { records?: AirtableRecord[]; offset?: string };
      const records = Array.isArray(data.records) ? data.records : [];
      for (const rec of records) {
        const f = rec.fields ?? {};
        const articleCode = toText(f["Product code"]);
        if (!articleCode) continue;
        const attachments = (Array.isArray(f["Attachments"]) ? f["Attachments"] : []) as AirtableAttachment[];
        const images = attachments
          .map((a) => a?.thumbnails?.large?.url || a?.url)
          .filter((u): u is string => typeof u === "string")
          .slice(0, MAX_IMAGES_PER_PRODUCT);
        products.push({
          articleCode,
          name: articleCode,
          price: toNumber(f["Selling Rate"]),
          purchasePrice: toNumber(f["Purchase Rate"]) || null,
          images,
          supplierName: toText(f["Supplier Name"]),
        });
      }
      offset = data.offset ?? undefined;
      if (!offset) break;
    }
  }
  return products;
}

function parseBase64Image(imageBase64: string): { rawBase64: string; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" } {
  const base64Match = imageBase64.match(/^data:([a-zA-Z0-9/+]+);base64,(.+)$/);
  const rawBase64 = base64Match ? base64Match[2] : imageBase64;
  const detectedMime = base64Match ? base64Match[1] : "image/jpeg";
  const mediaType = (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(detectedMime)
    ? detectedMime
    : "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  return { rawBase64, mediaType };
}

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" } | null> {
  try {
    const resp = await fetch(url, { timeout: 8000 } as any);
    if (!resp.ok) return null;
    const buffer = Buffer.from(await resp.arrayBuffer());
    const contentType = resp.headers.get("content-type") ?? "";
    const mediaType = (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(contentType)
      ? contentType
      : "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    const base64 = `data:${mediaType};base64,${buffer.toString("base64")}`;
    return { base64, mediaType };
  } catch {
    return null;
  }
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

// Live Airtable catalog — no import, just read and return
router.get("/stock/airtable", requireAuth, async (req, res): Promise<void> => {
  const airtableProducts = await fetchAirtableProducts();
  const localProducts = await db.select().from(productsTable).where(eq(productsTable.accountId, req.session.accountId!));
  // Merge local stock into Airtable products
  const merged = airtableProducts.map((ap) => {
    const local = localProducts.find((lp) => lp.articleCode === ap.articleCode);
    return {
      articleCode: ap.articleCode,
      name: ap.name,
      price: ap.price,
      purchasePrice: ap.purchasePrice,
      currentStock: local?.currentStock ?? 0,
      imageUrl: ap.images[0] ?? null,
      images: ap.images,
      supplierName: ap.supplierName,
      localId: local?.id ?? null,
    };
  });
  res.json(merged);
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

  // Resolve supplier: use provided ID (scoped to this account), or find/create by name
  let resolvedSupplierId: number | null = null;
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

  // Pull the catalog from Airtable (not the local DB)
  const airtableProducts = await fetchAirtableProducts();
  const localProducts = await db.select().from(productsTable).where(eq(productsTable.accountId, accountId));
  const productList = airtableProducts.map((ap) => {
    const local = localProducts.find((lp) => lp.articleCode === ap.articleCode);
    return {
      articleCode: ap.articleCode,
      name: ap.name,
      price: ap.price,
      currentStock: local?.currentStock ?? 0,
      imageUrl: ap.images[0] ?? null,
      images: ap.images,
    };
  });

  const { imageBase64 } = parsed.data;
  const { rawBase64, mediaType } = parseBase64Image(imageBase64);
  const articleCodeList = productList.map(p => `${p.articleCode} (${p.name}, stock: ${p.currentStock})`).join("\n");

  type ContentBlock =
    | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string } }
    | { type: "text"; text: string };

  interface DetectedItem { index: number; description: string; quantity: number }
  interface AiItem { itemIndex: number; articleCode: string; quantity: number; confidence: number; reasoning?: string }

  // ── PHASE 1: Count exactly how many distinct items are in the photo ──────────
  // No catalog references here — pure vision count so we anchor the result count.
  req.log.info("Phase 1: counting distinct items in sale photo");
  const countMsg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: [
        {
          type: "text",
          text: `Look at this footwear sale photo carefully. Count every DISTINCT shoe model or style visible — each unique design counts once regardless of how many pairs there are.

For each distinct item assign a sequential index (1, 2, 3…) and give a short description (colour, key style feature, hardware detail).

Return ONLY valid JSON, no markdown:
{"items":[{"index":1,"description":"beige slide with round YSL-style gold logo","quantity":1}]}`,
        },
        { type: "image", source: { type: "base64", media_type: mediaType, data: rawBase64 } },
      ] as ContentBlock[],
    }],
  });

  const countBlock = countMsg.content[0];
  const countRaw = countBlock.type === "text" ? countBlock.text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim() : "{}";
  let detectedItemsPhase1: DetectedItem[] = [];
  try {
    const parsed2 = JSON.parse(countRaw) as { items: DetectedItem[] };
    detectedItemsPhase1 = Array.isArray(parsed2.items) ? parsed2.items : [];
  } catch { /* fall through with empty list */ }
  req.log.info({ count: detectedItemsPhase1.length, items: detectedItemsPhase1.map(i => i.description) }, "Phase 1 complete");

  if (detectedItemsPhase1.length === 0) {
    res.json({ detectedItems: [], imageUrl: imageBase64 });
    return;
  }

  // ── PHASE 2: Match each detected item to catalog (4 parallel calls) ──────────
  // Each call uses a different reference image index per product so every product
  // gets 4 chances; Claude is told the exact item list from Phase 1 to match against.

  interface RefEntry { articleCode: string; data: string; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" }

  const NUM_CALLS = 4;
  const urlsByIndex: Array<Array<{ articleCode: string; url: string }>> = Array.from({ length: NUM_CALLS }, () => []);
  for (const [code, urls] of cloudinaryImageMap.entries()) {
    for (let i = 0; i < NUM_CALLS; i++) {
      if (urls[i]) urlsByIndex[i].push({ articleCode: code, url: cloudinaryResized(urls[i]) });
    }
  }

  const allUrls = urlsByIndex.flat();
  req.log.info({ totalImages: allUrls.length }, "Phase 2: fetching reference images");
  const fetchResults = await Promise.all(
    allUrls.map(async ({ articleCode, url }) => {
      const fetched = await fetchImageAsBase64(url);
      if (!fetched) return null;
      const { rawBase64: refRaw } = parseBase64Image(fetched.base64);
      return { articleCode, url, data: refRaw, mediaType: fetched.mediaType } as RefEntry & { url: string };
    })
  );

  const fetchMap = new Map(fetchResults.filter(Boolean).map(r => [r!.url, r!]));
  const activeBatches: RefEntry[][] = urlsByIndex.map(group =>
    group.map(({ articleCode, url }) => {
      const f = fetchMap.get(url);
      return f ? { articleCode, data: f.data, mediaType: f.mediaType } : null;
    }).filter((r): r is RefEntry => r !== null)
  ).filter(batch => batch.length > 0);
  if (activeBatches.length === 0) activeBatches.push([]);

  const itemListText = detectedItemsPhase1.map(i => `Item ${i.index}: ${i.description}`).join("\n");

  const MATCH_INSTRUCTIONS = `You are matching footwear from a sale photo to catalog products.

The sale photo contains EXACTLY ${detectedItemsPhase1.length} distinct item(s):
${itemListText}

Full catalog (article code, name, stock):
${articleCodeList || "(no products yet)"}

Instructions:
- For each of the ${detectedItemsPhase1.length} described items above, find its best matching article code from the REFERENCE PHOTOS (each labelled [articleCode]).
- Match by visual similarity: style, colour, silhouette, hardware/buckle/logo, sole shape.
- Return exactly one entry per item. If no reference photo closely matches an item, use "UNKNOWN".
- Return ONLY valid JSON, no markdown.

Return this exact JSON format:
{"items":[{"itemIndex":1,"articleCode":"1001/101","quantity":1,"confidence":0.92,"reasoning":"Same beige slide with round YSL gold logo"}]}`;

  const batchResults = await Promise.allSettled(
    activeBatches.map(async (batchRefs, batchIdx) => {
      const content: ContentBlock[] = [];
      content.push({ type: "text", text: "You are a footwear inventory expert matching items in a sale photo to catalog products." });
      content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: rawBase64 } });
      if (batchRefs.length > 0) {
        content.push({ type: "text", text: `REFERENCE PHOTOS (${batchRefs.length} catalog products, each labelled with [articleCode]):` });
        for (const ref of batchRefs) {
          content.push({ type: "text", text: `[${ref.articleCode}]` });
          content.push({ type: "image", source: { type: "base64", media_type: ref.mediaType, data: ref.data } });
        }
      }
      content.push({ type: "text", text: MATCH_INSTRUCTIONS });
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        messages: [{ role: "user", content }],
      });
      const block = msg.content[0];
      const rawText = block.type === "text" ? block.text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim() : "";
      req.log.info({ batchIdx, refs: batchRefs.length, rawText }, "Phase 2 batch response");
      try {
        const obj = JSON.parse(rawText) as { items: AiItem[] };
        return Array.isArray(obj.items) ? obj.items : [];
      } catch { return []; }
    })
  );

  // Merge by itemIndex: for each of the N items, keep the highest-confidence match
  const bestByIndex = new Map<number, AiItem>();
  for (const result of batchResults) {
    if (result.status === "rejected") { req.log.warn({ reason: String(result.reason) }, "Phase 2 batch failed"); continue; }
    for (const item of result.value) {
      if (!item.itemIndex) continue;
      const existing = bestByIndex.get(item.itemIndex);
      if (!existing || (item.confidence ?? 0) > (existing.confidence ?? 0)) {
        bestByIndex.set(item.itemIndex, item);
      }
    }
  }

  // Result is capped at exactly the N items from Phase 1
  const mergedItems = Array.from(bestByIndex.values())
    .filter(i => i.articleCode && i.articleCode !== "UNKNOWN")
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  req.log.info({ phase1Count: detectedItemsPhase1.length, detected: mergedItems.length }, "Sale analysis complete");

  const responseItems = mergedItems.map((item) => {
    const matchedProduct = productList.find(p => p.articleCode === item.articleCode) ?? null;
    // Use quantity from Phase 1 if available, otherwise fall back to Phase 2's estimate
    const phase1Item = detectedItemsPhase1.find(d => d.index === item.itemIndex);
    return {
      articleCode: item.articleCode,
      quantity: Math.max(1, Math.round(phase1Item?.quantity ?? item.quantity ?? 1)),
      confidence: Math.round((item.confidence ?? 0.5) * 100) / 100,
      reasoning: item.reasoning,
      matchedProduct: matchedProduct ?? undefined,
      notFound: !matchedProduct || item.articleCode === "UNKNOWN",
    };
  });

  responseItems.sort((a, b) => b.confidence - a.confidence);

  res.json({
    detectedItems: responseItems,
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

  // Lazy-create from Airtable catalog when product is missing locally
  const airtableProducts = await fetchAirtableProducts();

  for (const item of items) {
    let product = item.productId
      ? (await db.select().from(productsTable).where(and(eq(productsTable.id, item.productId), eq(productsTable.accountId, accountId))))[0]
      : undefined;

    if (!product) {
      product = (await db.select().from(productsTable).where(and(eq(productsTable.articleCode, item.articleCode), eq(productsTable.accountId, accountId))))[0];
    }

    // Lazy-create from Airtable catalog if not found locally
    if (!product) {
      const at = airtableProducts.find((a) => a.articleCode === item.articleCode);
      if (at) {
        const [newProduct] = await db.insert(productsTable).values({
          accountId,
          articleCode: at.articleCode,
          name: at.name,
          price: String(at.price),
          purchasePrice: at.purchasePrice != null ? String(at.purchasePrice) : null,
          currentStock: 0,
          imageUrl: at.images[0] ?? null,
        }).returning();
        product = newProduct;
      }
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

router.delete("/stock/products/:id", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
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

router.post("/stock/tag-prices", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const parsed = TagPricesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { imageBase64, items } = parsed.data;

  // Bound payload to protect the AI call and server memory.
  if (imageBase64.length > MAX_TAG_IMAGE_BASE64_CHARS) {
    res.status(413).json({ error: "Image is too large. Please use an image under ~9 MB." });
    return;
  }
  if (items.length > MAX_TAG_ITEMS) {
    res.status(400).json({ error: `Too many items (max ${MAX_TAG_ITEMS}).` });
    return;
  }
  if (items.length === 0) {
    res.json({ tags: [] });
    return;
  }

  const { rawBase64, mediaType } = parseBase64Image(imageBase64);
  const itemList = items
    .map((i, idx) => `${idx + 1}. ${i.articleCode} — ₹${i.price}${i.label ? ` (${i.label})` : ""}`)
    .join("\n");

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: rawBase64 } },
          {
            type: "text",
            text: `You are placing price tags on a footwear sale photo. The photo (above) shows one or more distinct footwear pairs/items. Below are the items sold in this photo with their article codes and selling prices:

${itemList}

For EACH distinct footwear pair/item visible in the photo, return a tag object with:
- "anchor_x": horizontal CENTER of that pair as a percentage 0-100 of image WIDTH
- "anchor_y": vertical CENTER of that pair as a percentage 0-100 of image HEIGHT
- "side": "bottom" if the pair sits in the UPPER half of the image (so the tag hangs below it), or "top" if the pair sits in the LOWER half (so the tag floats above it) — pick whichever keeps the tag inside the image
- "articleCode": the best matching article code from the list above; use "" if none clearly matches

Match each visible pair to exactly one list item where possible. Return ONLY valid JSON, no markdown:
{"tags":[{"anchor_x":50,"anchor_y":40,"side":"top","articleCode":"1053/45"}]}`,
          },
        ],
      },
    ],
  });

  interface AiTag {
    anchor_x: number;
    anchor_y: number;
    side?: string;
    articleCode?: string;
  }

  await trackAiUsage({
    accountId,
    model: "claude-haiku-4-5",
    feature: "price_tag",
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  });

  let aiTags: AiTag[] = [];
  try {
    const block = message.content[0];
    if (block.type === "text") {
      const jsonText = block.text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      const result = JSON.parse(jsonText) as { tags?: AiTag[] };
      aiTags = Array.isArray(result.tags) ? result.tags : [];
    }
  } catch {
    req.log.warn("Failed to parse AI response for price tagging");
  }

  const clampPct = (n: number): number => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 50));

  const tags = aiTags.map((t, idx) => {
    const matched = items.find((i) => i.articleCode === t.articleCode);
    const fallback = items[idx % items.length];
    const chosen = matched ?? fallback;
    return {
      anchor_x: clampPct(t.anchor_x),
      anchor_y: clampPct(t.anchor_y),
      side: t.side === "bottom" ? "bottom" : "top",
      articleCode: chosen.articleCode,
      price: chosen.price,
      label: chosen.label ?? chosen.articleCode,
    };
  });

  res.json({ tags });
});

export default router;
