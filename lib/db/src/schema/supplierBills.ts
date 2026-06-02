import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { suppliersTable } from "./suppliers";

export const supplierBillsTable = pgTable("supplier_bills", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id, { onDelete: "cascade" }),
  billNumber: text("bill_number").notNull(),
  billDate: timestamp("bill_date", { withTimezone: true }).notNull().defaultNow(),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("draft"),
  imageUrl: text("image_url"),
  rawText: text("raw_text"),
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSupplierBillSchema = createInsertSchema(supplierBillsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSupplierBill = z.infer<typeof insertSupplierBillSchema>;
export type SupplierBill = typeof supplierBillsTable.$inferSelect;
