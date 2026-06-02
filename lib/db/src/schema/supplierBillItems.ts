import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { supplierBillsTable } from "./supplierBills";
import { productsTable } from "./products";

export const supplierBillItemsTable = pgTable("supplier_bill_items", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").notNull().references(() => supplierBillsTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  articleCode: text("article_code").notNull(),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  totalPrice: numeric("total_price", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSupplierBillItemSchema = createInsertSchema(supplierBillItemsTable).omit({ id: true, createdAt: true });
export type InsertSupplierBillItem = z.infer<typeof insertSupplierBillItemSchema>;
export type SupplierBillItem = typeof supplierBillItemsTable.$inferSelect;
