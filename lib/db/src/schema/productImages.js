import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { productsTable } from "./products";
export const productImagesTable = pgTable("product_images", {
    id: serial("id").primaryKey(),
    productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
    imageUrl: text("image_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertProductImageSchema = createInsertSchema(productImagesTable).omit({ id: true, createdAt: true });
