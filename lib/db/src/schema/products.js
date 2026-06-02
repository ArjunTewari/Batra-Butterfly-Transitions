import { pgTable, serial, text, numeric, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { accountsTable } from "./accounts";
export const productsTable = pgTable("products", {
    id: serial("id").primaryKey(),
    accountId: integer("account_id").notNull().references(() => accountsTable.id, { onDelete: "cascade" }),
    articleCode: text("article_code").notNull(),
    name: text("name").notNull(),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }),
    currentStock: integer("current_stock").notNull().default(0),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex("products_account_article_uniq").on(t.accountId, t.articleCode)]);
export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, accountId: true, createdAt: true, updatedAt: true });
