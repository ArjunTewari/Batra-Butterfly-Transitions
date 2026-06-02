import { Router, type IRouter } from "express";
import { eq, and, desc, inArray, count } from "drizzle-orm";
import {
  db,
  staffTable,
  staffAttendanceTable,
  staffLoansTable,
  staffPaymentsTable,
  invoicesTable,
  invoiceItemsTable,
} from "@workspace/db";
import {
  FaceScanAttendanceBody,
  EnrollStaffFaceBody,
  MarkAttendanceBody,
  CreateStaffLoanBody,
  CreateStaffPaymentBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middleware/requireAuth";

const router: IRouter = Router();

const FACE_MATCH_THRESHOLD = 0.55;

function parseId(raw: string | string[]): number | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function euclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

async function commissionItemCount(accountId: number, staffId: number, month?: number, year?: number): Promise<{ totalItems: number; totalSales: number; totalOrders: number }> {
  const invoices = await db
    .select({ id: invoicesTable.id, totalAmount: invoicesTable.totalAmount, date: invoicesTable.date })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.accountId, accountId), eq(invoicesTable.staffId, staffId), eq(invoicesTable.status, "confirmed")));
  const filtered = invoices.filter((inv) => {
    if (month && inv.date.getMonth() + 1 !== month) return false;
    if (year && inv.date.getFullYear() !== year) return false;
    return true;
  });
  let totalItems = 0;
  if (filtered.length > 0) {
    const [row] = await db
      .select({ c: count() })
      .from(invoiceItemsTable)
      .where(inArray(invoiceItemsTable.invoiceId, filtered.map((i) => i.id)));
    totalItems = Number(row?.c ?? 0);
  }
  const totalSales = filtered.reduce((s, i) => s + parseFloat(i.totalAmount), 0);
  return { totalItems, totalSales, totalOrders: filtered.length };
}

// --- Attendance ---

router.get("/staff/attendance", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const date = typeof req.query.date === "string" && req.query.date ? req.query.date : todayStr();
  const staffList = await db.select().from(staffTable).where(eq(staffTable.accountId, accountId)).orderBy(staffTable.name);
  const rows = await db.select().from(staffAttendanceTable).where(and(eq(staffAttendanceTable.accountId, accountId), eq(staffAttendanceTable.date, date)));
  const byStaff = new Map(rows.map((r) => [r.staffId, r]));
  res.json(staffList.map((s) => {
    const r = byStaff.get(s.id);
    return {
      staffId: s.id,
      staffName: s.name,
      enrolled: Array.isArray(s.faceDescriptor) && s.faceDescriptor.length > 0,
      status: r?.status ?? null,
      checkInTime: r?.checkInTime ? r.checkInTime.toISOString() : null,
      method: r?.method ?? null,
    };
  }));
});

router.post("/staff/attendance/face-scan", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const parsed = FaceScanAttendanceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const descriptor = parsed.data.descriptor;

  const staffList = await db.select().from(staffTable).where(eq(staffTable.accountId, accountId));
  const enrolled = staffList.filter((s) => Array.isArray(s.faceDescriptor) && s.faceDescriptor!.length === descriptor.length);

  let best: { staff: typeof staffList[number]; dist: number } | null = null;
  for (const s of enrolled) {
    const dist = euclidean(s.faceDescriptor!, descriptor);
    if (!best || dist < best.dist) best = { staff: s, dist };
  }

  if (!best || best.dist > FACE_MATCH_THRESHOLD) {
    res.json({ matched: false, staffId: null, staffName: null, distance: best ? best.dist : null, alreadyMarked: false });
    return;
  }

  const date = todayStr();
  const [existing] = await db.select().from(staffAttendanceTable).where(and(eq(staffAttendanceTable.accountId, accountId), eq(staffAttendanceTable.staffId, best.staff.id), eq(staffAttendanceTable.date, date)));

  if (existing) {
    res.json({
      matched: true,
      staffId: best.staff.id,
      staffName: best.staff.name,
      distance: best.dist,
      alreadyMarked: true,
      attendance: { id: existing.id, staffId: existing.staffId, staffName: best.staff.name, date: existing.date, status: existing.status, checkInTime: existing.checkInTime ? existing.checkInTime.toISOString() : null, method: existing.method, note: existing.note ?? null },
    });
    return;
  }

  const now = new Date();
  const [rec] = await db.insert(staffAttendanceTable).values({ accountId, staffId: best.staff.id, date, status: "present", checkInTime: now, method: "face" }).returning();
  res.json({
    matched: true,
    staffId: best.staff.id,
    staffName: best.staff.name,
    distance: best.dist,
    alreadyMarked: false,
    attendance: { id: rec.id, staffId: rec.staffId, staffName: best.staff.name, date: rec.date, status: rec.status, checkInTime: rec.checkInTime ? rec.checkInTime.toISOString() : null, method: rec.method, note: rec.note ?? null },
  });
});

router.post("/staff/attendance/mark", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const parsed = MarkAttendanceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { staffId, status } = parsed.data;
  const date = parsed.data.date && parsed.data.date.length > 0 ? parsed.data.date : todayStr();

  const [staff] = await db.select().from(staffTable).where(and(eq(staffTable.id, staffId), eq(staffTable.accountId, accountId)));
  if (!staff) { res.status(404).json({ error: "Staff not found" }); return; }

  const [rec] = await db.insert(staffAttendanceTable)
    .values({ accountId, staffId, date, status, method: "manual" })
    .onConflictDoUpdate({ target: [staffAttendanceTable.accountId, staffAttendanceTable.staffId, staffAttendanceTable.date], set: { status, method: "manual" } })
    .returning();

  res.json({ id: rec.id, staffId: rec.staffId, staffName: staff.name, date: rec.date, status: rec.status, checkInTime: rec.checkInTime ? rec.checkInTime.toISOString() : null, method: rec.method, note: rec.note ?? null });
});

router.get("/staff/:id/attendance-summary", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
  const [staff] = await db.select().from(staffTable).where(and(eq(staffTable.id, id), eq(staffTable.accountId, accountId)));
  if (!staff) { res.status(404).json({ error: "Staff not found" }); return; }

  const now = new Date();
  const month = req.query.month ? parseInt(String(req.query.month), 10) : now.getMonth() + 1;
  const year = req.query.year ? parseInt(String(req.query.year), 10) : now.getFullYear();
  const prefix = `${year}-${String(month).padStart(2, "0")}`;

  const rows = await db.select().from(staffAttendanceTable).where(and(eq(staffAttendanceTable.accountId, accountId), eq(staffAttendanceTable.staffId, id)));
  const monthRows = rows.filter((r) => r.date.startsWith(prefix)).sort((a, b) => b.date.localeCompare(a.date));

  const present = monthRows.filter((r) => r.status === "present").length;
  const halfDay = monthRows.filter((r) => r.status === "half_day").length;
  const absent = monthRows.filter((r) => r.status === "absent").length;

  res.json({
    staffId: id,
    staffName: staff.name,
    month,
    year,
    present,
    halfDay,
    absent,
    totalMarked: monthRows.length,
    days: monthRows.map((r) => ({ date: r.date, status: r.status, checkInTime: r.checkInTime ? r.checkInTime.toISOString() : null })),
  });
});

// --- Face enrollment ---

router.post("/staff/:id/face-enroll", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = EnrollStaffFaceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [staff] = await db.select().from(staffTable).where(and(eq(staffTable.id, id), eq(staffTable.accountId, accountId)));
  if (!staff) { res.status(404).json({ error: "Staff not found" }); return; }

  const [updated] = await db.update(staffTable)
    .set({ faceDescriptor: parsed.data.descriptor, facePhotoUrl: parsed.data.photoUrl ?? staff.facePhotoUrl ?? null })
    .where(eq(staffTable.id, id))
    .returning();

  res.json({ id: updated.id, name: updated.name, commissionRate: parseFloat(updated.commissionRate), createdAt: updated.createdAt.toISOString() });
});

// --- Loans ---

router.get("/staff/:id/loans", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
  const loans = await db.select().from(staffLoansTable).where(and(eq(staffLoansTable.accountId, accountId), eq(staffLoansTable.staffId, id))).orderBy(desc(staffLoansTable.date));
  res.json(loans.map((l) => ({ id: l.id, staffId: l.staffId, amount: parseFloat(l.amount), note: l.note ?? null, status: l.status, date: l.date.toISOString() })));
});

router.post("/staff/loans", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const parsed = CreateStaffLoanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [staff] = await db.select().from(staffTable).where(and(eq(staffTable.id, parsed.data.staffId), eq(staffTable.accountId, accountId)));
  if (!staff) { res.status(404).json({ error: "Staff not found" }); return; }
  const [loan] = await db.insert(staffLoansTable).values({ accountId, staffId: parsed.data.staffId, amount: String(parsed.data.amount), note: parsed.data.note ?? null, status: "active" }).returning();
  res.status(201).json({ id: loan.id, staffId: loan.staffId, amount: parseFloat(loan.amount), note: loan.note ?? null, status: loan.status, date: loan.date.toISOString() });
});

router.post("/staff/loans/:id/clear", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
  const [loan] = await db.select().from(staffLoansTable).where(and(eq(staffLoansTable.id, id), eq(staffLoansTable.accountId, accountId)));
  if (!loan) { res.status(404).json({ error: "Loan not found" }); return; }
  const [updated] = await db.update(staffLoansTable).set({ status: "cleared" }).where(eq(staffLoansTable.id, id)).returning();
  res.json({ id: updated.id, staffId: updated.staffId, amount: parseFloat(updated.amount), note: updated.note ?? null, status: updated.status, date: updated.date.toISOString() });
});

// --- Payments (clearance + master approval) ---

router.get("/staff/payments", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const rows = await db
    .select({ id: staffPaymentsTable.id, staffId: staffPaymentsTable.staffId, staffName: staffTable.name, amount: staffPaymentsTable.amount, note: staffPaymentsTable.note, status: staffPaymentsTable.status, date: staffPaymentsTable.date, approvedAt: staffPaymentsTable.approvedAt })
    .from(staffPaymentsTable)
    .innerJoin(staffTable, eq(staffPaymentsTable.staffId, staffTable.id))
    .where(eq(staffPaymentsTable.accountId, accountId))
    .orderBy(desc(staffPaymentsTable.date));
  const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
  const filtered = statusFilter ? rows.filter((r) => r.status === statusFilter) : rows;
  res.json(filtered.map((r) => ({ id: r.id, staffId: r.staffId, staffName: r.staffName, amount: parseFloat(r.amount), note: r.note ?? null, status: r.status, date: r.date.toISOString(), approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null })));
});

router.post("/staff/payments", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const parsed = CreateStaffPaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [staff] = await db.select().from(staffTable).where(and(eq(staffTable.id, parsed.data.staffId), eq(staffTable.accountId, accountId)));
  if (!staff) { res.status(404).json({ error: "Staff not found" }); return; }
  const [payment] = await db.insert(staffPaymentsTable).values({ accountId, staffId: parsed.data.staffId, amount: String(parsed.data.amount), note: parsed.data.note ?? null, status: "pending" }).returning();
  res.status(201).json({ id: payment.id, staffId: payment.staffId, staffName: staff.name, amount: parseFloat(payment.amount), note: payment.note ?? null, status: payment.status, date: payment.date.toISOString(), approvedAt: null });
});

async function setPaymentStatus(req: Parameters<Parameters<typeof router.post>[1]>[0], res: Parameters<Parameters<typeof router.post>[1]>[1], newStatus: "approved" | "rejected"): Promise<void> {
  if (req.session.role !== "master") { res.status(403).json({ error: "Only the master account can approve or reject payments" }); return; }
  const accountId = req.session.accountId!;
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
  const [payment] = await db.select().from(staffPaymentsTable).where(and(eq(staffPaymentsTable.id, id), eq(staffPaymentsTable.accountId, accountId)));
  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }
  const [updated] = await db.update(staffPaymentsTable).set({ status: newStatus, approvedAt: newStatus === "approved" ? new Date() : null }).where(eq(staffPaymentsTable.id, id)).returning();
  const [staff] = await db.select().from(staffTable).where(eq(staffTable.id, updated.staffId));
  res.json({ id: updated.id, staffId: updated.staffId, staffName: staff?.name ?? "", amount: parseFloat(updated.amount), note: updated.note ?? null, status: updated.status, date: updated.date.toISOString(), approvedAt: updated.approvedAt ? updated.approvedAt.toISOString() : null });
}

router.post("/staff/payments/:id/approve", requireAuth, (req, res) => setPaymentStatus(req, res, "approved"));
router.post("/staff/payments/:id/reject", requireAuth, (req, res) => setPaymentStatus(req, res, "rejected"));

// --- Salary overview ---

router.get("/staff/:id/salary", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
  const [staff] = await db.select().from(staffTable).where(and(eq(staffTable.id, id), eq(staffTable.accountId, accountId)));
  if (!staff) { res.status(404).json({ error: "Staff not found" }); return; }

  const now = new Date();
  const month = req.query.month ? parseInt(String(req.query.month), 10) : now.getMonth() + 1;
  const year = req.query.year ? parseInt(String(req.query.year), 10) : now.getFullYear();
  const prefix = `${year}-${String(month).padStart(2, "0")}`;

  const { totalItems } = await commissionItemCount(accountId, id, month, year);
  const earnings = totalItems; // ₹1 per invoice line item

  const payments = await db.select().from(staffPaymentsTable).where(and(eq(staffPaymentsTable.accountId, accountId), eq(staffPaymentsTable.staffId, id)));
  const inMonth = (d: Date) => d.getMonth() + 1 === month && d.getFullYear() === year;
  const paymentsApproved = payments.filter((p) => p.status === "approved" && inMonth(p.date)).reduce((s, p) => s + parseFloat(p.amount), 0);
  const paymentsPending = payments.filter((p) => p.status === "pending" && inMonth(p.date)).reduce((s, p) => s + parseFloat(p.amount), 0);

  const loans = await db.select().from(staffLoansTable).where(and(eq(staffLoansTable.accountId, accountId), eq(staffLoansTable.staffId, id)));
  const loanOutstanding = loans.filter((l) => l.status === "active").reduce((s, l) => s + parseFloat(l.amount), 0);

  const attendance = await db.select().from(staffAttendanceTable).where(and(eq(staffAttendanceTable.accountId, accountId), eq(staffAttendanceTable.staffId, id)));
  const monthAtt = attendance.filter((a) => a.date.startsWith(prefix));
  const presentDays = monthAtt.filter((a) => a.status === "present").length;
  const halfDays = monthAtt.filter((a) => a.status === "half_day").length;
  const payableDays = presentDays + halfDays * 0.5;

  const deductions = loanOutstanding;
  const netPayable = earnings - deductions - paymentsApproved;

  res.json({
    staffId: id,
    staffName: staff.name,
    month,
    year,
    earnings,
    deductions,
    paymentsApproved,
    paymentsPending,
    netPayable,
    presentDays,
    halfDays,
    payableDays,
    loanOutstanding,
    totalItems,
  });
});

export default router;
