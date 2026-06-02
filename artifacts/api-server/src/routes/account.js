import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq, and, sql } from "drizzle-orm";
import { db, accountsTable, staffTable, aiUsageTable } from "@workspace/db";
import { requireMaster, requireAuth } from "../middleware/requireAuth";
import { z } from "zod/v4";
const router = Router();
const UpdateAccountBody = z.object({
    businessName: z.string().min(2).optional(),
    phone: z.string().optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(6).optional(),
});
const SetStaffPinBody = z.object({
    pin: z.string().min(4).max(8).regex(/^\d+$/, "PIN must be numeric"),
});
// GET /account — current account details
router.get("/account", requireAuth, async (req, res) => {
    const [account] = await db.select({
        id: accountsTable.id,
        email: accountsTable.email,
        businessName: accountsTable.businessName,
        businessCode: accountsTable.businessCode,
        phone: accountsTable.phone,
        createdAt: accountsTable.createdAt,
    }).from(accountsTable).where(eq(accountsTable.id, req.session.accountId));
    if (!account) {
        res.status(404).json({ error: "Account not found" });
        return;
    }
    res.json({ ...account, createdAt: account.createdAt.toISOString() });
});
// PATCH /account — update account details or password
router.patch("/account", requireMaster, async (req, res) => {
    const parsed = UpdateAccountBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const { businessName, phone, currentPassword, newPassword } = parsed.data;
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, req.session.accountId));
    if (!account) {
        res.status(404).json({ error: "Account not found" });
        return;
    }
    const updates = {};
    if (businessName)
        updates.businessName = businessName;
    if (phone !== undefined)
        updates.phone = phone || null;
    if (newPassword) {
        if (!currentPassword) {
            res.status(400).json({ error: "Current password is required to change password" });
            return;
        }
        const valid = await bcrypt.compare(currentPassword, account.passwordHash);
        if (!valid) {
            res.status(401).json({ error: "Current password is incorrect" });
            return;
        }
        updates.passwordHash = await bcrypt.hash(newPassword, 12);
    }
    if (Object.keys(updates).length === 0) {
        res.json({ message: "No changes" });
        return;
    }
    const [updated] = await db.update(accountsTable).set(updates).where(eq(accountsTable.id, req.session.accountId)).returning();
    res.json({
        id: updated.id,
        email: updated.email,
        businessName: updated.businessName,
        businessCode: updated.businessCode,
        phone: updated.phone,
        createdAt: updated.createdAt.toISOString(),
    });
});
// GET /account/staff — list staff with PIN status
router.get("/account/staff", requireAuth, async (req, res) => {
    const staffList = await db.select().from(staffTable).where(eq(staffTable.accountId, req.session.accountId));
    res.json(staffList.map((s) => ({
        id: s.id,
        name: s.name,
        commissionRate: parseFloat(s.commissionRate),
        hasPin: !!s.pin,
        createdAt: s.createdAt.toISOString(),
    })));
});
// PUT /account/staff/:id/pin — set/change staff PIN
router.put("/account/staff/:id/pin", requireMaster, async (req, res) => {
    const staffId = parseInt(req.params.id, 10);
    if (isNaN(staffId)) {
        res.status(400).json({ error: "Invalid staff ID" });
        return;
    }
    const parsed = SetStaffPinBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const [staff] = await db.select().from(staffTable).where(and(eq(staffTable.id, staffId), eq(staffTable.accountId, req.session.accountId)));
    if (!staff) {
        res.status(404).json({ error: "Staff not found" });
        return;
    }
    const pinHash = await bcrypt.hash(parsed.data.pin, 10);
    await db.update(staffTable).set({ pin: pinHash }).where(eq(staffTable.id, staffId));
    res.json({ success: true, staffId, message: "PIN updated successfully" });
});
// DELETE /account/staff/:id/pin — remove staff PIN
router.delete("/account/staff/:id/pin", requireMaster, async (req, res) => {
    const staffId = parseInt(req.params.id, 10);
    const [staff] = await db.select().from(staffTable).where(and(eq(staffTable.id, staffId), eq(staffTable.accountId, req.session.accountId)));
    if (!staff) {
        res.status(404).json({ error: "Staff not found" });
        return;
    }
    await db.update(staffTable).set({ pin: null }).where(eq(staffTable.id, staffId));
    res.json({ success: true });
});
// GET /account/ai-usage — current month AI usage + cost
router.get("/account/ai-usage", requireAuth, async (req, res) => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const rows = await db
        .select({
        feature: aiUsageTable.feature,
        totalInputTokens: sql `sum(${aiUsageTable.inputTokens})::int`,
        totalOutputTokens: sql `sum(${aiUsageTable.outputTokens})::int`,
        totalCostUsd: sql `sum(${aiUsageTable.costUsd})`,
        callCount: sql `count(*)::int`,
    })
        .from(aiUsageTable)
        .where(and(eq(aiUsageTable.accountId, req.session.accountId), eq(aiUsageTable.month, month), eq(aiUsageTable.year, year)))
        .groupBy(aiUsageTable.feature);
    const totalCostUsd = rows.reduce((s, r) => { var _a; return s + parseFloat((_a = r.totalCostUsd) !== null && _a !== void 0 ? _a : "0"); }, 0);
    const totalInputTokens = rows.reduce((s, r) => { var _a; return s + ((_a = r.totalInputTokens) !== null && _a !== void 0 ? _a : 0); }, 0);
    const totalOutputTokens = rows.reduce((s, r) => { var _a; return s + ((_a = r.totalOutputTokens) !== null && _a !== void 0 ? _a : 0); }, 0);
    const totalCalls = rows.reduce((s, r) => { var _a; return s + ((_a = r.callCount) !== null && _a !== void 0 ? _a : 0); }, 0);
    // Monthly cost to user: AI cost + 20% markup + ₹299 platform fee
    const platformFeeUsd = 0; // no flat fee, just 20% markup
    const markupMultiplier = 1.2;
    const monthlyCostUsd = totalCostUsd * markupMultiplier;
    // Convert to INR (approximate exchange rate)
    const usdToInr = 84;
    const monthlyCostInr = monthlyCostUsd * usdToInr;
    res.json({
        month,
        year,
        totalInputTokens,
        totalOutputTokens,
        totalCalls,
        totalCostUsd,
        monthlyCostUsd,
        monthlyCostInr,
        byFeature: rows.map((r) => {
            var _a, _b, _c, _d;
            return ({
                feature: r.feature,
                inputTokens: (_a = r.totalInputTokens) !== null && _a !== void 0 ? _a : 0,
                outputTokens: (_b = r.totalOutputTokens) !== null && _b !== void 0 ? _b : 0,
                costUsd: parseFloat((_c = r.totalCostUsd) !== null && _c !== void 0 ? _c : "0"),
                calls: (_d = r.callCount) !== null && _d !== void 0 ? _d : 0,
            });
        }),
    });
});
export default router;
