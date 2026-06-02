---
name: Production session cookies (trust proxy)
description: Why the Express API logs users out in production (login 200, then every request 401) and the fix.
---

# Production session-cookie logout (login 200 → all 401)

Symptom: in the deployed app, `POST /api/auth/login` returns 200 but every
following request (`/api/auth/me`, `/api/account`, etc.) returns 401. Works fine
in development. Users perceive it as "it logged me out and I can't log back in",
often noticed right after an action like stock upload (but the action is not the
cause — any navigation after login triggers it).

**Root cause:** the session cookie is configured `secure: true` in production
(`NODE_ENV === "production"`), but Express sits behind Replit's TLS-terminating
reverse proxy. Without `app.set("trust proxy", 1)`, Express sees the proxied hop
as plain HTTP and **silently refuses to emit the `Secure` Set-Cookie**. The
session is created server-side but the browser never receives/stores the cookie,
so every subsequent request is unauthenticated.

**Fix:** call `app.set("trust proxy", 1)` BEFORE the `express-session`
middleware in `artifacts/api-server/src/app.ts`. This is required because the
prod cookie also uses `sameSite: "none"` + `secure: true` for cross-origin
(mobile/Expo) auth.

**Why it matters:** this is production-only and invisible in dev (dev uses
`secure: false`), so it cannot be caught locally — only via deployment logs or a
real published session. Requires a redeploy to take effect.

**Known related hardening (not yet done, flagged by review):** CORS is
`origin: true` + `credentials: true` which, combined with `SameSite=None`, is a
permissive cross-origin credential surface; and `SESSION_SECRET` has an insecure
static fallback string. Tighten only carefully — web app is same-origin via path
routing through the proxy, and the Expo native app is not subject to browser CORS.
