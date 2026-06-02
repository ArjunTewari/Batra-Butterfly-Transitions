import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";
import { staffTable } from "./staff";

export const staffPaymentsTable = pgTable("staff_payments", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accountsTable.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  note: text("note"),
  status: text("status").notNull().default("pending"),
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStaffPaymentSchema = createInsertSchema(staffPaymentsTable).omit({ id: true, accountId: true, approvedAt: true, createdAt: true });
export type InsertStaffPayment = z.infer<typeof insertStaffPaymentSchema>;
export type StaffPayment = typeof staffPaymentsTable.$inferSelect;
