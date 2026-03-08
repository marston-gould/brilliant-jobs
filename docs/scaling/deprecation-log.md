# Deprecation Log

> This file is the authoritative record of all deprecated and retired components, routes, and patterns.
> Updated at: SA-023 (2026-03-07)

## Lifecycle States

`ACTIVE → DEPRECATED → RETIRED`

Grace period: 90 days. Immediate retirement permitted only for security vulnerabilities.

---

## Currently Deprecated

| ID | Component | Deprecated In | Deprecated Date | Replacement | Retirement Gate | Owner |
|----|-----------|--------------|----------------|-------------|----------------|-------|
| DEP-001 | Direct EF URL paths (`/functions/v1/<ef-name>`) | SA-005 | 2026-03-07 | Route through `/functions/v1/api-gateway` with route key | CI grep: no `functions/v1/` calls outside gateway config in client JS | Backend Eng |

## Retired

| ID | Component | Retired Date | Notes |
|----|-----------|-------------|-------|
| RET-001 | `LegacyPageWrapper` shim in `src/app/routes.tsx` | 2026-03-07 (SA-023) | All 22 dashboard + admin routes migrated to lazy-loaded React components. SA-017 complete. |

---

## Declaration Template

When adding a deprecation:

```markdown
| DEP-NNN | Component name | Session | YYYY-MM-DD | Replacement description | Retirement gate | Owner |
```

In code, add:
```typescript
// @deprecated 2026-XX-XX — Use [replacement] instead. See docs/scaling/deprecation-log.md DEP-NNN
console.warn('[DEPRECATED DEP-NNN] Direct EF call. Route through api-gateway instead.');
```
