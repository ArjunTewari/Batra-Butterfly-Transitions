import { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.accountId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export function requireMaster(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.accountId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.session.role !== "master") {
    res.status(403).json({ error: "Master access required" });
    return;
  }
  next();
}
