import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
export const conversations = pgTable("conversations", {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const insertConversationSchema = createInsertSchema(conversations).omit({
    id: true,
    createdAt: true,
});
