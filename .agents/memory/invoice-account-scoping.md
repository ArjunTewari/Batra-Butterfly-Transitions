---
name: Invoice by-id account scoping
description: Multi-tenant IDOR rule for invoice (and similar) by-id DB helpers in the api-server.
---

# Invoice by-id account scoping

Any shared "fetch by id" DB helper in `artifacts/api-server` (e.g. `getInvoiceWithItems`) must take `accountId` and filter `where(and(eq(table.id, id), eq(table.accountId, accountId)))`. Returning by id alone is a cross-tenant IDOR — a logged-in user from another account can read/mutate the row by guessing the id.

**Why:** A code review caught that `getInvoiceWithItems(id)` had no account filter, so `GET /invoices/:id` and `POST /invoices/:id/confirm` leaked/mutated other accounts' invoices.

**How to apply:**
- by-id read helpers: require `accountId` param, scope the query.
- create routes that accept foreign keys (e.g. `retailerId`, `staffId`): verify each FK belongs to `req.session.accountId!` before insert (404 if not), don't trust the client.
- when a response shape adds DB columns (the invoice charge fields), make sure *every* endpoint that returns that shape selects + maps them (the `/invoices` list response was missing them while the OpenAPI schema expected them).
