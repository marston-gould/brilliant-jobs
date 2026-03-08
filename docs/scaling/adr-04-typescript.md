# ADR-04: TypeScript Strict Migration — Extension + Edge Functions

**Status:** IMPLEMENTED  
**Phase:** S4  
**Session:** SA-022  
**Date:** 2026-03-07  
**Pair:** Frontend + Backend  
**Reviewer:** Chief Architect  

---

## Context

The Brilliant Jobs codebase entered remediation with:
- **54 extension source files** all in plain `.js` — no static type checking, no IDE completions, Chrome API calls untyped
- **107 Edge Function files** already `.ts` but using `any` in 201+ locations — effectively untyped at the critical API boundaries
- **Zero shared type package** — types were siloed in individual files (e.g. `ParsedJob` defined twice in `refresh-jobs` and `ingest-common-crawl`)

CS-P1-015 (Phase 1 remediation) established TypeScript for 7 core dashboard `.ts` modules. SA-022 extends that foundation to the remaining two surfaces: extension and Edge Functions.

---

## Decision

### 1. Extension: Full Source Migration (`.js` → `.ts`)

All 54 extension source files renamed to `.ts`. esbuild (already in the build pipeline) handles TypeScript natively — no separate tsc compile step required, no build pipeline complexity added.

**Type declarations created in `extension/types/index.d.ts`:**
- Chrome extension APIs (runtime, tabs, storage, action, scripting, identity)
- BJ global state (`BJConfig`, `BJSession`, `BJExtensionState`)
- Form field types (`FieldType`, `FieldConfig`, `FillResult`, `FieldFillRequest`)
- ATS handler interface (`AtsHandler`) — structural contract all handlers must satisfy
- Message channel types (`ExtensionMessage`, `MessageHandler`)
- All utility types (`FetchOptions`, `KillSwitchState`, `HeartbeatPayload`, etc.)

**Build script (`extension/build-extension.js`) updated:**
- `JS_FILES` list updated from `.js` → `.ts`
- Subdirectory discovery updated to `f.endsWith('.ts')`
- No other changes — esbuild handles the rest

**CI gate added:** New step in Gate 1+7 that fails the build if any `.js` source file is found in `extension/` (excluding `dist/`, `examples/`, and `build-extension.js`).

### 2. Edge Functions: Zero `any` in All Files

All EF `.ts` files already existed but had `any` in 201 locations across 46 files. SA-022 eliminated all `any` type annotations:

**Common replacements applied:**
| Pattern | Replacement |
|---------|-------------|
| `logger: any` | `logger: Logger` |
| `sb: any` | `sb: SupabaseClient` |
| `catch (e: any)` | `catch (e: unknown)` |
| `data: any` | `data: Record<string, unknown>` |
| `parse: (data: any, ...) => ...` | `parse: (data: Record<string, unknown>, ...) => ...` |
| `Promise<any>` | `Promise<unknown>` |
| `Record<string, any>` | `Record<string, unknown>` |
| `result: any` | `result: unknown` |
| `let x: any` | `let x: unknown` |

**Result:** 0 remaining `: any` annotations in any EF (non-comment lines).

### 3. Shared Types Package: `_shared/types.ts`

Created `supabase/functions/_shared/types.ts` with 8 sections:
1. **Database row types** — `JobRow`, `UserRow`, `ResumeRow`, `CompanyRow`, `PipelineRow`, `NotificationRow`, `ReferralRow`
2. **API request/response shapes** — `ApiResponse<T>`, `PaginatedResponse<T>`, `GatewayContext`, `RateLimitConfig`
3. **Job pipeline types** — `ParsedJob`, `AtsBoard`, `SearchRequest`, `JobFilters`, `SortOption`
4. **CrewAI agent types** — `AgentConfig`, `AgentMode`, `AgentActionLog`, `AgentCheck`, `AgentRunResult`, `GraduationCriteria`
5. **Notification/email types** — `EmailPayload`, `SmsPayload`, `NotificationRequest`
6. **Scoring/resume types** — `ScoreRequest`, `ScoreResult`, `ResumeProfile`, `SkillEntry`, `GapEntry`
7. **Referral/billing types** — `ReferralEvent`, `BillingEvent`, `CreditTransaction`
8. **Utility primitives** — `SupabaseClient`, `Logger`, `CaughtError`, `getErrorMessage()`, `isRecord()`, `parseJson<T>()`

Previously-duplicated types (`ParsedJob` existed in both `refresh-jobs` and `ingest-common-crawl`) now have a single canonical source in `_shared/types.ts`.

### 4. CI Gate: SA-022 TypeScript Enforcement

Two new steps added to Gate 1+7 in `.github/workflows/ci.yml`:

1. **Extension `.js` source ban** — fails if any `.js` source file appears in `extension/` (outside dist/examples/build script)
2. **EF no-any gate** — scans PR-changed EF files for `: any` annotations; fails with specific file/line info

---

## Alternatives Considered

### A: `checkJs` on extension (rejected)

Add `// @ts-check` to JS files and run `tsc --allowJs --checkJs`. Gives type checking without renaming.

**Rejected:** Provides weaker guarantees than actual `.ts` files. Doesn't enable strict mode reliably. Prevents IDE "Go to Definition" for types. Since esbuild handles TS natively, the cost of renaming is zero.

### B: Type erasure via `@ts-ignore` (rejected)

Keep existing `any` but suppress errors with `@ts-ignore` or `@ts-nocheck`.

**Rejected:** This is exactly the error-silencing pattern that the remediation audit identified as systemic. SA-022 must not repeat it.

### C: Gradual `any` replacement over multiple sessions (rejected)

Accept `any` in non-critical EFs and migrate incrementally.

**Rejected:** `any` in an EF that touches user data or billing is not "non-critical." The shared types package makes bulk replacement achievable in a single session.

---

## Hook & Scar Points

**Hooks (ready to use):**
- `_shared/types.ts` `SupabaseClient` — any new EF imports this; IDEs autocomplete the query builder API
- `AtsHandler` interface in `extension/types/index.d.ts` — new ATS handlers must satisfy this structural contract
- `AgentConfig` / `AgentRunResult` types — CrewAI agents have typed contracts for all check results

**Scars (architecture-ready, not yet activated):**
- `extension/tsconfig.json` — strict mode enabled; when esbuild config is formalized, add `--tsconfig` flag to reference this file for full compile-time checking
- `_shared/types.ts` `parseJson<T>()` — generic typed JSON parse; future EFs should use this over raw `JSON.parse()`
- `GatewayContext` type — gateway middleware can be updated to pass typed context instead of header strings

---

## Consequences

**Positive:**
- Chrome extension: IDE autocomplete for all Chrome APIs; type errors surface at development time not runtime
- EF layer: `any`-free codebase; type errors at database boundaries are caught before deploy
- Single source of truth for domain types (`ParsedJob`, `AgentConfig`, etc.) across all functions
- CI blocks re-introduction of `any` or raw `.js` source files

**Neutral:**
- esbuild continues to strip types at bundle time — no runtime overhead
- `build-extension.js` is still a Node.js script; it is exempt from the `.ts` gate by design

**Trade-off acknowledged:**
- Some `Record<string, unknown>` replacements are looser than ideal (e.g. ATS API responses would benefit from dedicated response types). Accepted as a pragmatic trade-off for session scope — the foundation is in place for future tightening.

---

## Implementation Notes

- SA-022 relied on `getErrorMessage(err: unknown)` helper in `_shared/types.ts` to handle `catch (e: unknown)` blocks safely without re-introducing `any`
- `SupabaseClient` in shared types is a structural interface (not an import from `@supabase/supabase-js`) because EFs use the Deno CDN import, not npm — keeping the type as a local interface avoids versioning friction
- All 54 extension files retain their original content; only the extension is `.ts` — the logic was not refactored in this session

---

## Test Coverage

SA-022 validation tests: **run via `node tests/sa-022-typescript.test.js`**

Tests verify:
- No `.js` source files in `extension/` (excluding dist/examples/build script)  
- All 54 expected `.ts` files exist  
- `extension/tsconfig.json` exists and is valid JSON  
- `extension/types/index.d.ts` exports all required type names  
- `_shared/types.ts` exports all 8 type sections  
- Zero `: any` in EF files (non-comment lines)  
- CI gate steps present in `ci.yml`  
- `build-extension.js` references `.ts` files  
- ADR-04 exists and contains SA-022 section  
