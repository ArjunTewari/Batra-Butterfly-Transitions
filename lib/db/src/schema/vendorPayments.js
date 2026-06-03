import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { accountsTable } from "./accounts";
import { retailersTable } from "./retailers";
import { suppliersTable } from "./suppliers";
export const vendorPaymentsTable = pgTable("vendor_payments", {
    id: serial("id").primaryKey(),
    accountId: integer("account_id").notNull().references(() => accountsTable.id, { onDelete: "cascade" }),
    supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id),
    retailerId: integer("retailer_id").notNull().references(() => retailersTable.id),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    notes: text("notes"),
    status: text("status").notNull().default("pending"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertVendorPaymentSchema = createInsertSchema(vendorPaymentsTable).omit({ id: true, accountId: true, createdAt: true });
