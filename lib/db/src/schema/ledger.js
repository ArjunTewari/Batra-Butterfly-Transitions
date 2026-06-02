import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { retailersTable } from "./retailers";
export const ledgerEntriesTable = pgTable("ledger_entries", {
    id: serial("id").primaryKey(),
    retailerId: integer("retailer_id").notNull().references(() => retailersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // 'sale' | 'payment'
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    note: text("note"),
    date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertLedgerEntrySchema = createInsertSchema(ledgerEntriesTable).omit({ id: true, createdAt: true });
