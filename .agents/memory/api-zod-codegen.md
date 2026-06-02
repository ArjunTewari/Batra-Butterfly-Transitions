---
name: api-zod codegen & lib dts gotchas
description: How regenerating OpenAPI/orval affects @workspace/api-zod, @workspace/db and consuming artifacts
---

# api-zod / lib dts after codegen

- `@workspace/api-zod` and `@workspace/db` packages export from `./src/index.ts` (no dist in `exports`), BUT artifacts that consume them via tsconfig **project references** (e.g. `artifacts/api-server` references `lib/api-zod`, `lib/db`) read the **emitted `dist/*.d.ts`**, not source. After `pnpm --filter @workspace/api-spec run codegen` you MUST rebuild the lib declarations: `pnpm exec tsc --build lib/api-zod/tsconfig.json lib/db/tsconfig.json lib/api-client-react/tsconfig.json --force`. Otherwise consumers see stale types ("no exported member", missing new fields).
- **Why:** composite/project-reference libs are consumed via their declaration output; codegen only rewrites `src/generated`, it does not re-emit dts.

# Zod schema const names come from operationId, not component schema name

- orval zod client names the request-body schema after the **operationId** + `Body`, e.g. operationId `faceScanAttendance` → zod const `FaceScanAttendanceBody` (NOT `FaceScanBody`, even if the OpenAPI component is `FaceScanBody`). Same for `enrollStaffFace` → `EnrollStaffFaceBody`. Check `lib/api-zod/src/generated/api.ts` for the real `export const` names before importing.

# api-zod barrel must export zod values only

- `lib/api-zod/src/index.ts` must be `export * from "./generated/api"` ONLY. The orval zod config also emits TS interfaces into `generated/types` with the SAME names as the zod consts; re-exporting both (`export *` or even `export type *` from types) causes TS2308 ambiguity that blocks declaration emit (composite + emitDeclarationOnly → no dist written → consumers stale). Consumers import zod **values** from api-zod and get **types** from `@workspace/api-client-react`.
- **Why:** value (zod const) + type (interface) sharing a name across two `export *` breaks declaration emit. Keep types out of the api-zod barrel.
