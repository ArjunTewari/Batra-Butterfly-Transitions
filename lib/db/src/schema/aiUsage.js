import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { accountsTable } from "./accounts";
export const aiUsageTable = pgTable("ai_usage", {
    id: serial("id").primaryKey(),
    accountId: integer("account_id").notNull().references(() => accountsTable.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    feature: text("feature").notNull(), // 'invoice_scan' | 'stock_scan'
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertAiUsageSchema = createInsertSchema(aiUsageTable).omit({ id: true, createdAt: true });
