var _a;
import pino from "pino";
const isProduction = process.env.NODE_ENV === "production";
export const logger = pino({
    level: (_a = process.env.LOG_LEVEL) !== null && _a !== void 0 ? _a : "info",
    redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers['set-cookie']",
    ],
    ...(isProduction
        ? {}
        : {
            transport: {
                target: "pino-pretty",
                options: { colorize: true },
            },
        }),
});
