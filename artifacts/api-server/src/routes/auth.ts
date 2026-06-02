import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { db, accountsTable, staffTable, retailersTable, ledgerEntriesTable, salesTable, productsTable } from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

function generateBusinessCode(businessName: string): string {
  const prefix = businessName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 5) || "BIZ";
  const suffix = Math.floor(1000 + Math.random() * 9000).toString();
  return `${prefix}${suffix}`;
}

const SignupBody = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  businessName: z.string().min(2),
  phone: z.string().optional(),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string(),
});

const StaffLoginBody = z.object({
  businessCode: z.string().min(1),
  pin: z.string().min(4),
});

router.post("/auth/signup", async (req, res): Promise<void> => {
  const parsed = SignupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid signup data", details: parsed.error.flatten() });
    return;
  }
  const { email, password, businessName, phone } = parsed.data;

  const [existing] = await db.select().from(accountsTable).where(eq(accountsTable.email, email.toLowerCase()));
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  let businessCode = generateBusinessCode(businessName);

  // ensure uniqueness
  let codeConflict = await db.select().from(accountsTable).where(eq(accountsTable.businessCode, businessCode));
  while (codeConflict.length > 0) {
    businessCode = generateBusinessCode(businessName);
    codeConflict = await db.select().from(accountsTable).where(eq(accountsTable.businessCode, businessCode));
  }

  const [account] = await db.insert(accountsTable).values({
    email: email.toLowerCase(),
    passwordHash,
    businessName,
    businessCode,
    phone: phone ?? null,
  }).returning();

  req.session.accountId = account.id;
  req.session.role = "master";

  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: "Session error" });
      return;
    }
    res.status(201).json({
      id: account.id,
      email: account.email,
      businessName: account.businessName,
      businessCode: account.businessCode,
      phone: account.phone,
      role: "master",
    });
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid login data" });
    return;
  }
  const { email, password } = parsed.data;

  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.email, email.toLowerCase()));
  if (!account) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, account.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  req.session.accountId = account.id;
  req.session.role = "master";

  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: "Session error" });
      return;
    }
    res.json({
      id: account.id,
      email: account.email,
      businessName: account.businessName,
      businessCode: account.businessCode,
      phone: account.phone,
      role: "master",
    });
  });
});

router.post("/auth/staff-login", async (req, res): Promise<void> => {
  const parsed = StaffLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid login data" });
    return;
  }
  const { businessCode, pin } = parsed.data;

  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.businessCode, businessCode.toUpperCase()));
  if (!account) {
    res.status(401).json({ error: "Invalid business code or PIN" });
    return;
  }

  const staffList = await db.select().from(staffTable).where(and(
    eq(staffTable.accountId, account.id)
  ));

  let matchedStaff = null;
  for (const s of staffList) {
    if (s.pin && await bcrypt.compare(pin, s.pin)) {
      matchedStaff = s;
      break;
    }
  }

  if (!matchedStaff) {
    res.status(401).json({ error: "Invalid business code or PIN" });
    return;
  }

  req.session.accountId = account.id;
  req.session.role = "staff";
  req.session.staffId = matchedStaff.id;

  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: "Session error" });
      return;
    }
    res.json({
      accountId: account.id,
      businessName: account.businessName,
      staffId: matchedStaff.id,
      staffName: matchedStaff.name,
      role: "staff",
    });
  });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session?.accountId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, req.session.accountId));
  if (!account) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Account not found" });
    return;
  }

  if (req.session.role === "staff" && req.session.staffId) {
    const [staff] = await db.select().from(staffTable).where(eq(staffTable.id, req.session.staffId));
    res.json({
      accountId: account.id,
      businessName: account.businessName,
      role: "staff",
      staffId: req.session.staffId,
      staffName: staff?.name ?? "Staff",
    });
    return;
  }

  res.json({
    id: account.id,
    email: account.email,
    businessName: account.businessName,
    businessCode: account.businessCode,
    phone: account.phone,
    role: "master",
  });
});

async function seedDemoAccount(accountId: number): Promise<void> {
  const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

  const retailers = await db.insert(retailersTable).values([
    { accountId, name: "Sharma Shoe Mart", phone: "9811234567", creditLimit: "150000" },
    { accountId, name: "Patel Footwear", phone: "9822345678", creditLimit: "100000" },
    { accountId, name: "Gupta Brothers", phone: "9833456789", creditLimit: "75000" },
    { accountId, name: "Kumar Collections", phone: "9844567890", creditLimit: "50000" },
    { accountId, name: "Singh Shoes", phone: "9855678901", creditLimit: "200000" },
    { accountId, name: "Mehta Traders", phone: "9866789012", creditLimit: "80000" },
  ]).returning();

  const staff = await db.insert(staffTable).values([
    { accountId, name: "Rajesh Kumar", commissionRate: "8", pin: await bcrypt.hash("1111", 10) },
    { accountId, name: "Priya Sharma", commissionRate: "7", pin: await bcrypt.hash("2222", 10) },
    { accountId, name: "Amit Singh", commissionRate: "6", pin: await bcrypt.hash("3333", 10) },
  ]).returning();

  await db.insert(productsTable).values([
    { accountId, articleCode: "BB-101", name: "Classic Oxford", price: "2499", currentStock: 48 },
    { accountId, articleCode: "BB-102", name: "Sports Runner", price: "1899", currentStock: 72 },
    { accountId, articleCode: "BB-103", name: "Casual Loafer", price: "1599", currentStock: 35 },
    { accountId, articleCode: "BB-104", name: "Formal Derby", price: "3299", currentStock: 20 },
    { accountId, articleCode: "BB-105", name: "Sandal Pro", price: "999", currentStock: 90 },
    { accountId, articleCode: "BB-106", name: "Canvas Sneaker", price: "1299", currentStock: 55 },
    { accountId, articleCode: "BB-107", name: "Leather Monk", price: "4499", currentStock: 15 },
    { accountId, articleCode: "BB-108", name: "Kolhapuri Flat", price: "799", currentStock: 110 },
  ]);

  const salesData: { accountId: number; retailerId: number; staffId: number; amount: string; date: Date }[] = [];
  const ledgerData: { retailerId: number; type: string; amount: string; note: string; date: Date }[] = [];

  const amounts = [18500, 24000, 31000, 12500, 45000, 22000, 38000, 16000, 27000, 51000, 9500, 33000];
  retailers.forEach((r, ri) => {
    let balance = 0;
    for (let i = 0; i < 4 + ri; i++) {
      const days = 5 + i * 14 + ri * 3;
      const amount = amounts[(ri * 4 + i) % amounts.length];
      const staffMember = staff[i % staff.length];
      salesData.push({ accountId, retailerId: r.id, staffId: staffMember.id, amount: String(amount), date: daysAgo(days) });
      ledgerData.push({ retailerId: r.id, type: "sale", amount: String(amount), note: "Invoice", date: daysAgo(days) });
      balance += amount;
      if (i % 2 === 1) {
        const payment = Math.floor(amount * 0.6);
        ledgerData.push({ retailerId: r.id, type: "payment", amount: String(payment), note: "Cheque payment", date: daysAgo(days - 3) });
        balance -= payment;
      }
    }
  });

  if (salesData.length > 0) await db.insert(salesTable).values(salesData);
  if (ledgerData.length > 0) await db.insert(ledgerEntriesTable).values(ledgerData);
}

router.post("/auth/demo", async (req, res): Promise<void> => {
  let [account] = await db.select().from(accountsTable).where(eq(accountsTable.businessCode, "DEMO"));

  if (!account) {
    const passwordHash = await bcrypt.hash("demo-not-usable", 12);
    [account] = await db.insert(accountsTable).values({
      email: "demo@batrabutterfly.demo",
      passwordHash,
      businessName: "Batra Footwear (Demo)",
      businessCode: "DEMO",
      phone: "+91 98765 43210",
    }).returning();
    await seedDemoAccount(account.id);
  }

  req.session.accountId = account.id;
  req.session.role = "master";

  req.session.save((err) => {
    if (err) { res.status(500).json({ error: "Session error" }); return; }
    res.json({
      id: account.id,
      email: account.email,
      businessName: account.businessName,
      businessCode: account.businessCode,
      phone: account.phone,
      role: "master",
    });
  });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.clearCookie("bb.sid");
    res.json({ ok: true });
  });
});

export default router;
