# Security Posture — Brilliant Jobs

> Last updated: CS-P1-002 (March 2026)

## Accepted Risks

### IX-SE-008: Supabase Anon Key in Client Source

**Status:** Accepted risk — documented, not a vulnerability.

The Supabase anon key (`eyJhbGciOiJIUzI1NiIs...`) is intentionally embedded in client-side JavaScript (`js/globals.js`). This is **by design** in Supabase's architecture — the anon key is a public key equivalent to an API route prefix, not a secret credential.

**Mitigations in place:**

1. **Row-Level Security (RLS)** enforced on all tables (CS-002, CS-013). The anon key can only access what RLS policies permit.
2. **Anon access restricted** — `ats_jobs`, `ats_companies`, and all user tables return zero rows for unauthenticated anon requests (CS-005 CORS lockdown). Only `ref_city_radius` (public reference data) and `get_landing_stats()` RPC (aggregate counts only) are accessible.
3. **Service role key** is never in client code. All write operations route through Edge Functions that use server-side service role credentials.
4. **Storage buckets** require authentication for all operations.

**Why not rotate or hide it:**
- Supabase client SDK requires this key for initialization
- Removing it would break all authenticated user sessions
- It provides no privilege escalation beyond what RLS permits
- Every Supabase project exposes this key by design

**Monitoring:** PostHog tracks API error rates. Anomalous 401/403 spikes would indicate abuse attempts against the anon key.

---

### SE-002: Service Role Key Rotation

**Status:** Deferred — accepted risk with compensating controls.

The service role key was exposed in git history (commit `4a5191787f15`, Feb 23 2026). Git history was cleaned via `git-filter-repo`. The key has not been rotated because:

1. Repository access is limited to Marston + Claude (2 principals)
2. No evidence of unauthorized access during exposure window
3. Key rotation requires coordinated update across all Edge Functions, secrets, and environments — scheduled for CS-P1-002

**Compensating controls:**
- Git history purged of all key material (BFG Repo-Cleaner, CS-001)
- EF auth registry classifies all 89 Edge Functions (CS-P1-001)
- RLS enforced on all tables regardless of key used
- Vault stores all API keys (CS-001 rotation)

---

## Security Headers

All surfaces enforce the following via `vercel.json`:
- `Content-Security-Policy` — **layered enforcement:**
  - `/dashboard` and `/admin` routes: no `unsafe-inline` in script-src (all inline scripts externalized in CS-P1-002)
  - `/` (landing page): no `unsafe-inline` in script-src (inline scripts externalized in CS-018)
  - `/(.*)`catch-all: retains `unsafe-inline` because `api/seo-page.js` generates inline scripts for SEO data pages (future: externalize these too)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` with preload
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — camera, microphone, geolocation disabled

## Cookie Security

All client-side cookies set with `Secure; SameSite=Lax` (CS-P1-002):
- `bj_ref` — referral attribution
- `bj_consent` — cookie consent preference
- `bj_returning` — returning visitor flag
