import { pgTable, serial, integer, text, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";
import { retailersTable } from "./retailers";
import { staffTable } from "./staff";

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accountsTable.id, { onDelete: "cascade" }),
  invoiceNumber: text("invoice_number").notNull(),
  retailerId: integer("retailer_id").notNull().references(() => retailersTable.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  miscCharge: numeric("misc_charge", { precision: 12, scale: 2 }).notNull().default("0"),
  claimCharge: numeric("claim_charge", { precision: 12, scale: 2 }).notNull().default("0"),
  cashDeposit: numeric("cash_deposit", { precision: 12, scale: 2 }).notNull().default("0"),
  gstCharge: numeric("gst_charge", { precision: 12, scale: 2 }).notNull().default("0"),
  packingCharge: numeric("packing_charge", { precision: 12, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("draft"),
  imageUrl: text("image_url"),
  notes: text("notes"),
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex("invoices_account_number_uniq").on(t.accountId, t.invoiceNumber)]);

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({ id: true, accountId: true, createdAt: true, updatedAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;
