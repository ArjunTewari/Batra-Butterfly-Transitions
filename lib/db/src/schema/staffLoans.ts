import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";
import { staffTable } from "./staff";

export const staffLoansTable = pgTable("staff_loans", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accountsTable.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  note: text("note"),
  status: text("status").notNull().default("active"),
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStaffLoanSchema = createInsertSchema(staffLoansTable).omit({ id: true, accountId: true, createdAt: true });
export type InsertStaffLoan = z.infer<typeof insertStaffLoanSchema>;
export type StaffLoan = typeof staffLoansTable.$inferSelect;
