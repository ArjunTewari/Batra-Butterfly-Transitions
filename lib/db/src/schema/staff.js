import { pgTable, serial, text, numeric, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { accountsTable } from "./accounts";
export const staffTable = pgTable("staff", {
    id: serial("id").primaryKey(),
    accountId: integer("account_id").notNull().references(() => accountsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    salary: numeric("salary", { precision: 12, scale: 2 }).notNull().default("0"),
    pin: text("pin"),
    faceDescriptor: jsonb("face_descriptor").$type(),
    facePhotoUrl: text("face_photo_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export const insertStaffSchema = createInsertSchema(staffTable).omit({ id: true, accountId: true, pin: true, createdAt: true, updatedAt: true });
