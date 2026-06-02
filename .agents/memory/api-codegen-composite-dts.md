---
name: API codegen requires rebuilding api-client-react declarations
description: Why newly generated React Query hooks are invisible to artifacts until the composite lib's .d.ts is rebuilt.
---

After running `pnpm --filter @workspace/api-spec run codegen`, newly generated hooks/types (e.g. a new `useDeleteStockItem`) appear in `lib/api-client-react/src/generated/api.ts` but artifacts that import `@workspace/api-client-react` still fail typecheck with "has no exported member".

**Why:** `lib/api-client-react` is a composite TS project (`composite: true`, `emitDeclarationOnly`, `outDir: dist`) and artifacts reference it via tsconfig `references`. In non-build mode (`tsc -p ... --noEmit`), TypeScript resolves imports to the referenced project's **emitted `dist/*.d.ts`**, not its `src` — even though `package.json` `exports` points at `./src/index.ts`. So stale `dist` declarations hide newly generated members. Codegen does NOT rebuild the lib's declarations.

**How to apply:** After codegen that adds/changes generated exports, rebuild the lib's declarations before typechecking artifacts:
`pnpm exec tsc --build lib/api-client-react/tsconfig.json --force`
Do NOT rely on `pnpm run typecheck:libs` for this — it currently fails globally on unrelated module-resolution errors in other libs (csstype, undici-types, p-limit, `expo/tsconfig.base` not found), which aborts before api-client-react emits. Build the single lib project directly instead.
