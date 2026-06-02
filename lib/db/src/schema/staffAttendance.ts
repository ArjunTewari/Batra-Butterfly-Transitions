import { pgTable, serial, integer, text, timestamp, date, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";
import { staffTable } from "./staff";

export const staffAttendanceTable = pgTable("staff_attendance", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accountsTable.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  status: text("status").notNull().default("present"),
  checkInTime: timestamp("check_in_time", { withTimezone: true }),
  method: text("method").notNull().default("manual"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("staff_attendance_acct_staff_date_uniq").on(t.accountId, t.staffId, t.date)]);

export const insertStaffAttendanceSchema = createInsertSchema(staffAttendanceTable).omit({ id: true, accountId: true, createdAt: true });
export type InsertStaffAttendance = z.infer<typeof insertStaffAttendanceSchema>;
export type StaffAttendance = typeof staffAttendanceTable.$inferSelect;
