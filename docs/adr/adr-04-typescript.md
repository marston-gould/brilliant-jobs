# ADR-04: TypeScript Migration Strategy

**Status:** Accepted  
**Date:** 2026-03-07  
**Decision makers:** Pod 3 Engineering Lead + Frontend Engineer  
**Context:** FE-006 (No TypeScript)

## Context

The dashboard codebase is ~86 JavaScript files (~40,000 lines) with no type safety. Runtime errors from type mismatches are the #1 error category. The build system uses esbuild for code-splitting via file concatenation, not ES module bundling.

## Decision

Incremental migration using a "strict-by-default, file-at-a-time" approach:

1. **TypeScript is added alongside JavaScript** — `.ts` files coexist with `.js` files
2. **Strict mode from day one** — `tsconfig.json` has `strict: true`, no "any" escape hatches
3. **Build system handles both** — esbuild strips types during concatenation; `transformSync` generates `.js` from `.ts` for direct HTML `<script>` loading
4. **CI enforces forward progress** — `tsc --noEmit` gate rejects type errors; guard rejects edits to generated `.js` files
5. **globals.ts uses `@ts-nocheck` temporarily** — 1134 lines migrated structurally (types added) but not yet strict-checked; Phase 2 removes the directive

## File Migration Priority

| Phase | Files | Count | Lines | Rationale |
|-------|-------|-------|-------|-----------|
| Phase 1 (this session) | globals, api, sync, version, fingerprint, tier-gating, lazy-loader | 7 | ~1,688 | Every other module depends on these |
| Phase 2 | job-feed, pipeline, keywords, resumes, applications, aggregations | 6 | ~8,400 | Primary data-fetching modules |
| Phase 3 | sort-bar, query-builder, chat, overlay-analytics, settings, billing, stats | 7 | ~6,800 | UI interaction logic |
| Phase 4 | All remaining js/ files | ~55 | ~23,000 | Long tail |
| Phase 5 | Extension (background, popup, contentScript, etc.) | 43 | ~18,000 | Separate build |
| Phase 6 | Edge Functions | 88+ | Varies | Many already use TypeScript headers |

## Architecture Decisions

### Concatenation-compatible TypeScript

The existing build concatenates files into chunks, not ES module bundling. TypeScript files work in this model because:
- `.ts` files without `import`/`export` are "scripts" — all top-level declarations are in the global scope
- esbuild strips type annotations when processing `.ts` temp files
- `tsc --noEmit` checks types without producing output

### Shared Type Definitions

`js/types/index.d.ts` provides:
- External library declarations (Supabase CDN, PostHog, DOMPurify)
- Core data types (SupabaseJob, UserProfile, SearchParams, etc.)
- Window interface augmentation (for `window.X` access patterns)
- Ambient declarations for non-migrated `.js` modules

### Generated .js Files

Build step uses `esbuild.transformSync()` to compile `.ts` → `.js` for HTML pages that use `<script src="/js/version.js">`. These generated files:
- Are NOT source-controlled (they're build artifacts)
- Are regenerated on every `node build.js` run
- Preserve global scope (no IIFE wrapping)

### globals.ts @ts-nocheck

The 1134-line globals.ts has type annotations on all function signatures but uses `@ts-nocheck` because:
- 149 remaining strict-mode errors need individual attention
- These are mostly null safety, `unknown` catch variables, and index signature issues
- Removing `@ts-nocheck` is tracked as Phase 2 work

## Rules for New Code

1. **All new files MUST be `.ts`** with strict mode compliance
2. **No `any` type** — use `unknown` with type guards, or define proper interfaces
3. **Zero tolerance for `@ts-expect-error`** in new code
4. **When modifying a `.js` file**, migrate it to `.ts` first if practical
5. **CI gate rejects** new `.js` files in migrated directories

## Consequences

- **Positive:** Type errors caught at build time, IDE autocomplete, self-documenting APIs
- **Positive:** Incremental approach doesn't require big-bang rewrite
- **Negative:** Two source formats coexist during migration (~6-12 months)
- **Negative:** globals.ts strict compliance deferred to Phase 2
- **Risk:** Generated `.js` files could drift if build step is skipped — mitigated by CI guard

## Migration Completion Criteria

- [ ] All `.js` files in `js/` converted to `.ts`
- [ ] `@ts-nocheck` removed from globals.ts
- [ ] `checkJs: true` enabled for any remaining `.js` files
- [ ] Type definitions cover all Supabase table schemas
- [ ] ADR marked as IMPLEMENTED
