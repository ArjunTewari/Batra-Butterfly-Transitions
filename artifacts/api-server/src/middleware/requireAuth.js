export function requireAuth(req, res, next) {
    var _a;
    if (!((_a = req.session) === null || _a === void 0 ? void 0 : _a.accountId)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    next();
}
export function requireMaster(req, res, next) {
    var _a;
    if (!((_a = req.session) === null || _a === void 0 ? void 0 : _a.accountId)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (req.session.role !== "master") {
        res.status(403).json({ error: "Master access required" });
        return;
    }
    next();
}
