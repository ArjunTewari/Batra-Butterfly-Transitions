import "express-session";

declare module "express-session" {
  interface SessionData {
    accountId: number;
    role: "master" | "staff";
    staffId?: number;
  }
}
