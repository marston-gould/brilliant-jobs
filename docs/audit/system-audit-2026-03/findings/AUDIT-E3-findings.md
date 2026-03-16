# AUDIT-E3 — Extension: Security, Performance & Compliance
**Date:** 2026-03-16
**Properties:** #3 Security, #9 Performance, #12 Compliance & Privacy
**Session score:** 2.5/5
**Findings:** 7 (0×P0, 1×P1, 4×P2, 2×P3)

---

## #3 Security

### AUDIT-E3-001 — P1 — `originGuard.ts` and `BJ_ORIGIN_GUARD` never used
**File:** `extension/utils/originGuard.ts` (imported by nothing)
**Detail:** A purpose-built triple-layer origin validation utility (`validate`, `guard`, rate limiter) was implemented and ships in the build — but has **zero imports** across the entire extension. The `onMessageExternal` handler in `background.ts:3562` performs its own inline origin check (`allowedOrigins.includes(senderOrigin)`) that:
- Misses the tab URL verification (Layer 3)
- Misses rate limiting (60 req/min per origin)
- Duplicates the allowlist instead of referencing a single source of truth

This is the second dead security/observability utility found (alongside `errorReporter.ts`).
**Fix:** Replace the inline origin check in `onMessageExternal` with `await BJ_ORIGIN_GUARD.guard(sender)`. Remove the duplicate `allowedOrigins` array.

### AUDIT-E3-002 — P2 — No explicit Content Security Policy in manifest
**File:** `extension/manifest.json`
**Detail:** `content_security_policy` key is absent. MV3 has a restrictive default CSP, but not declaring it explicitly means: (1) no documentation of what's allowed, (2) any future need to relax it (e.g. wasm, blob URLs) will require understanding the implicit baseline first, (3) Chrome Web Store reviewers flag missing explicit CSP in security reviews.
**Fix:** Add explicit `content_security_policy` to manifest with `"extension_pages": "script-src 'self'; object-src 'self'"`.

### AUDIT-E3-003 — P2 — CI service_role scan misses 3 high-risk extension files
**File:** `.github/workflows/ci.yml:223`
**Detail:** The CI gate that scans for leaked `service_role` keys runs:
```
grep -r "service_role" js/ extension/utils/ extension/handlers/
```
It does **not** scan `extension/background.ts`, `extension/popup.ts`, or `extension/supabase.ts` — the three files that contain all Supabase credentials and all direct Supabase REST calls. If a `service_role` key were ever accidentally placed in these files, CI would not catch it.
**Fix:** Change the scan path to `extension/` (recursive) to cover all extension source.

### AUDIT-E3-004 — P2 — `externally_connectable` / `originGuard` allowlist mismatch
**File:** `extension/manifest.json`, `extension/utils/originGuard.ts`
**Detail:** `originGuard.ts` `ALLOWED_ORIGINS` includes `https://dev.brilliantjobs.app` but `manifest.json` `externally_connectable.matches` does not. Chrome enforces `externally_connectable` before any JS runs, so `dev.` messages are already blocked at the Chrome level — but the code claims to allow them, creating misleading documentation and a latent bug if the manifest is updated to add `dev.` without updating originGuard.
**Fix:** Align both lists. Either add `dev.brilliantjobs.app` to manifest or remove from originGuard allowlist.

---

## #9 Performance

### AUDIT-E3-005 — P2 — No bundle size gate for extension output
**File:** `scripts/gate-bundle-size.mjs`
**Detail:** CI bundle size gate covers 6 dashboard/admin files but zero extension files. `background.ts` is 3,675 lines of unminified source; `job-site-overlay.ts` is 2,823 lines. No ceiling prevents these from growing unbounded. A single large bundle loaded on every ATS page (job-site-overlay) can measurably delay page interactivity for users.
**Fix:** Add extension bundle size entries to `gate-bundle-size.mjs`: `background.js` (suggested limit: 500KB), `job-site-overlay.js` (suggested limit: 300KB).

---

## #12 Compliance & Privacy

### AUDIT-E3-006 — P3 — Sensitive profile data (EEO) stored in `chrome.storage.local`
**File:** `extension/background.ts:1226–1228`
**Detail:** `_syncProfileAndSettingsFromSupabase` stores the full `applicantProfile` — including `eeo_preferences` (gender, ethnicity, veteran status, disability status, citizenship) — into `chrome.storage.local`. This is GDPR/CCPA sensitive category data persisted in the browser's extension storage. While Chrome encrypts this storage on most platforms, it is accessible to any code running in the extension context and is not cleared on logout.
**Fix:** (1) Confirm `chrome.storage.local` is cleared on user logout. (2) Consider storing only the minimum needed fields rather than the full profile object. (3) Document the data retention policy for extension local storage.

### AUDIT-E3-007 — P3 — `extension_events` table has no retention/purge policy
**File:** `supabase/migrations/20260227_extension_events.sql`
**Detail:** The `extension_events` table accumulates rows indefinitely — no `pg_cron` purge, no TTL, no partition, no archival policy. It stores `job_url` (PII-adjacent — reveals companies the user applied to), `event_data` JSONB (includes button text, form actions, error messages), and `user_id`. Under GDPR, event logs with user identifiers require a defined retention period.
**Fix:** Add a `pg_cron` job to purge rows older than 90 days (consistent with Supabase EF log retention). Add a `COMMENT` to the table documenting its retention policy.

---

## Clean findings

| Area | Status |
|------|--------|
| No hardcoded secrets | ✅ `SUPABASE_KEY` is anon public key; PostHog key is public project key; no `service_role` in source |
| `externally_connectable` enforced | ✅ Manifest restricts external messages to `brilliantjobs.app` origins |
| RLS on `extension_events` | ✅ Insert/select policies require `auth.uid() = user_id` |
| Crypto storage for auth session | ✅ `BJ_CRYPTO.secureSet/secureGet` used for `authSession` |
| MV3 manifest | ✅ `manifest_version: 3` |
| Circuit breaker (kill switch) | ✅ DB-backed kill switch with remote activation |

---

## Summary

| Property | Score | Verdict |
|----------|-------|---------|
| #3 Security | 2.5/5 | Dead security utilities; no explicit CSP; CI scan gaps; allowlist mismatch |
| #9 Performance | 2.5/5 | No extension bundle size gate; two large unminified entry points |
| #12 Compliance | 3/5 | EEO in local storage; no retention policy on event log |
| **Session avg** | **2.5/5** | |

## Open Findings

| ID | Sev | Fix owner |
|----|-----|-----------|
| AUDIT-E3-001 | P1 | Sprint — wire originGuard into onMessageExternal |
| AUDIT-E3-002 | P2 | Sprint — add explicit CSP to manifest |
| AUDIT-E3-003 | P2 | Sprint — expand CI service_role scan to full extension/ |
| AUDIT-E3-004 | P2 | Sprint — align externally_connectable + originGuard allowlists |
| AUDIT-E3-005 | P2 | Sprint — add extension bundle size gates |
| AUDIT-E3-006 | P3 | Backlog — EEO storage + logout clear |
| AUDIT-E3-007 | P3 | Sprint — pg_cron purge for extension_events |
