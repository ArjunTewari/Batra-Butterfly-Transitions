var _a;
import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import router from "./routes";
import { logger } from "./lib/logger";
const PgSession = connectPgSimple(session);
const app = express();
// Behind Replit's reverse proxy (TLS terminated upstream). Trust the proxy so
// Express sees the original HTTPS protocol and will send `secure` session cookies.
app.set("trust proxy", 1);
app.use(pinoHttp({
    logger,
    serializers: {
        req(req) {
            var _a;
            return {
                id: req.id,
                method: req.method,
                url: (_a = req.url) === null || _a === void 0 ? void 0 : _a.split("?")[0],
            };
        },
        res(res) {
            return {
                statusCode: res.statusCode,
            };
        },
    },
}));
app.use(cors({
    origin: true,
    credentials: true,
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(session({
    store: new PgSession({
        conString: process.env["DATABASE_URL"],
        tableName: "sessions",
        createTableIfMissing: true,
        ttl: 7 * 24 * 60 * 60, // 7 days in seconds
    }),
    secret: (_a = process.env["SESSION_SECRET"]) !== null && _a !== void 0 ? _a : "bb-dev-secret-change-in-prod",
    name: "bb.sid",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env["NODE_ENV"] === "production",
        sameSite: process.env["NODE_ENV"] === "production" ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
}));
app.use("/api", router);
export default app;
