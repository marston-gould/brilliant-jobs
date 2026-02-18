# Brilliant Jobs — Full Platform Audit

**Date:** 2026-02-18
**Scope:** Security, scalability, multiuser readiness, code quality
**Method:** Live RLS penetration testing, source code review, schema analysis

---

## Executive Summary

The platform has strong foundations but critical security gaps that must be fixed before any public launch. The two highest-priority issues are: (1) the core job data tables have no RLS write protection, meaning any anonymous user can modify or delete the entire job database via the public API key, and (2) all user-specific data (filters, pipeline, resumes, tuning) lives in localStorage, which means users lose everything on device/browser switch and the platform cannot operate as a true multiuser system.

---

## 🔴 CRITICAL — Fix Before Launch

### C1: ats_jobs and ats_companies have NO write protection

**Verified by live penetration test.** Using only the anon key (visible in client-side JS), an anonymous user can:
- **INSERT** fake jobs into the feed (tested: row created successfully)
- **UPDATE** any job's title, salary, content, status (tested: modified a real job, reverted)
- **DELETE** any job from the database (tested: deleted test row)
- Do the same on ats_companies (tested: inserted and deleted)

**Impact:** Anyone who inspects the page source can extract the anon key and corrupt the entire job database with a single curl command. A malicious actor could delete all 135K+ jobs, insert spam listings, or modify salary data.

**Also vulnerable (same pattern):**
- `refresh_log` — anon can insert/delete operational data
- `seekers_raw` — anon can insert/delete
- `job_locations` — anon can insert/delete

**Fix:** Add RLS policies immediately:
```sql
-- ats_jobs: read-only for everyone, write only for service role
ALTER TABLE ats_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON ats_jobs FOR SELECT USING (true);
CREATE POLICY "Service write" ON ats_jobs FOR ALL USING (auth.role() = 'service_role');

-- ats_companies: same pattern
ALTER TABLE ats_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON ats_companies FOR SELECT USING (true);
CREATE POLICY "Service write" ON ats_companies FOR ALL USING (auth.role() = 'service_role');

-- refresh_log, seekers_raw, job_locations: service-only
ALTER TABLE refresh_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service only" ON refresh_log FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE seekers_raw ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service only" ON seekers_raw FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE job_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON job_locations FOR SELECT USING (true);
CREATE POLICY "Service write" ON job_locations FOR ALL USING (auth.role() = 'service_role');
```

**Side effect:** The client-side code in `keywords.js` and `job-feed.js` currently writes salary/content enrichment data back to `ats_jobs` using the anon key (8 update calls found). After adding RLS, these writes will silently fail. Options:
1. Move enrichment to an Edge Function (best — server-side, uses service role)
2. Create a narrow authenticated RLS policy allowing logged-in users to update only `content`, `salary_*` columns
3. Accept that client-side enrichment stops and rely solely on Edge Function parsing

**Recommendation:** Option 1. Create a `enrich-job` Edge Function that accepts a job ID and content/salary payload, validates it, and writes with service role.

### C2: No security headers

The site returns only `strict-transport-security`. Missing:
- `Content-Security-Policy` — no protection against XSS/injection
- `X-Frame-Options` — site can be iframed (clickjacking)
- `X-Content-Type-Options` — no MIME sniffing protection
- `Referrer-Policy` — leaks full URL on navigation
- `Permissions-Policy` — no feature restriction

**Fix:** Add to `vercel.json`:
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://analytics.ahrefs.com https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://qojhagupdnbtomfoxnsf.supabase.co; img-src 'self' data:; font-src 'self'" }
      ]
    }
  ]
}
```

### C3: Job description content rendered as raw HTML (XSS vector)

`keywords.js` line 1124: `bodyEl.innerHTML = decodeJobContent(rawContent);`

Job descriptions from ATS systems are HTML and are inserted directly via `innerHTML` without sanitization. The `decodeJobContent()` function actually **decodes** HTML entities back to executable HTML. If any ATS system or compromised employer includes a `<script>` tag or event handler in their job description, it executes in the user's browser with full access to their Supabase session.

**Impact:** Stored XSS — any malicious content in the 135K+ job descriptions executes when a user views that job.

**Fix:** Either:
1. Use DOMPurify to sanitize before inserting: `bodyEl.innerHTML = DOMPurify.sanitize(decodeJobContent(rawContent));`
2. Use a Content-Security-Policy that blocks inline scripts (defense in depth)

**Recommendation:** Both. Add DOMPurify (~7KB gzipped) and CSP.

---

## 🟡 HIGH — Fix Before Multiuser Scale

### H1: All user data lives in localStorage (not portable)

19 localStorage keys store user-critical data that would be lost on device/browser switch:

**Must migrate to Supabase for multiuser:**
| Key | Data | Impact if Lost |
|-----|------|----------------|
| `bj_saved_filters` | All saved search filters | Complete search config gone |
| `bj_tuning` | Company/title/location/industry exclusions, level hierarchy | All tuning config gone |
| `bj_pipeline_meta` | Application pipeline (stages, dates, notes) | All application tracking gone |
| `bj_applied_jobs` | Applied job IDs | Lose track of applications |
| `bj_applied_dates` | Application dates | Lose timeline |
| `bj_saved_jobs` | Saved/bookmarked jobs | Lose bookmarks |
| `bj_hidden_jobs` | Hidden job IDs | Hidden jobs reappear |
| `bj_resumes` | Resume metadata (text extraction results cached) | Lose resume analysis |
| `bj_app_queue` | Application queue | Lose queued applications |
| `bj_app_history` | Application history | Lose history |

**Can stay in localStorage (UI preferences):**
| Key | Data | OK to lose |
|-----|------|------------|
| `bj_active_tab` | Current nav tab | Yes |
| `bj_collapse` | UI section collapse states | Yes |
| `bj_sf_checked` | Filter checkbox states | Yes |
| `bj_show_previews` | Preview toggle | Yes |
| `bj_last_feed_view` | Last feed view timestamp | Yes |
| `bj_pl_collapse` | Pipeline collapse states | Yes |
| `bj_readiness` | Readiness score cache | Yes (regenerated) |

**Migration approach:** Create Supabase tables for user_filters, user_tuning, user_pipeline. Read from Supabase on login, write on change. Keep localStorage as offline cache with Supabase as source of truth.

### H2: No CORS lockdown

Supabase is accepting requests from any origin. Any website can make authenticated API calls using a stolen session token.

**Fix:** Configure CORS in Supabase Dashboard → API → CORS: restrict to `https://brilliantjobs.app` only.

### H3: Client-side enrichment writes to shared data

8 places in `keywords.js` and `job-feed.js` where the client writes salary/content enrichment data back to `ats_jobs`. In a multiuser system, this creates race conditions (two users enriching the same job simultaneously) and after RLS fix (C1), these writes will fail.

**Fix:** Move all enrichment to a dedicated Edge Function. Client sends job ID + enrichment data to the function, which writes with service role key.

### H4: Unbounded queries on high-volume tables

Several queries lack pagination limits and will degrade as data grows:
- `connections` export: `select('*').limit(5000)` — fine for now but won't scale
- `company_slug` count: `select('company_slug').limit(2000)` — fetches 2K rows just to count unique companies
- `ref_city_radius` browser: fetches in 1000-row pages but loads all 210 rows into memory
- `ats_companies` browser: `select('slug, name, job_count, source')` — no limit visible

**Fix:** Use `count: 'exact', head: true` for count-only queries. Add server-side distinct count functions. Paginate all data-heavy queries.

---

## 🟡 MEDIUM — Address for Production Quality

### M1: No input sanitization on user-generated content

User inputs (filter names, resume names, feedback titles, collection names) are stored and rendered without HTML escaping. `truncate()` function does not escape — it just slices strings. These are inserted via template literals into `innerHTML`.

A user could name a filter `<img src=x onerror=alert(1)>` and it would execute when rendered in the feed or filter pills.

**Fix:** Add an `escapeHtml()` utility and apply it to all user-generated strings before template literal insertion:
```javascript
function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
```

### M2: Duplicate Supabase client initialization

`app.js` (landing page) and `js/globals.js` (dashboard) both define `SUPABASE_URL`, `SUPABASE_KEY`, and create `sb` client. If both scripts ever load on the same page, it would create conflicts.

**Fix:** Single initialization point. Landing page should use its own scoped client, dashboard should use globals.js only.

### M3: No error boundaries or user-facing error handling

Most Supabase calls have try/catch but errors are only logged to console. Users see nothing when queries fail — the UI just appears empty or stale.

**Fix:** Add a toast/notification system for transient errors. Show user-friendly messages for common failures (network, auth expired, timeout).

### M4: location_cache table is 153K rows

This is a cache table that appears to have been populated from a bulk geocoding run. For a cache, it's very large. It's read-only for anon (good) but adds database weight.

**Recommendation:** Evaluate if this is actively used. If it's a one-time import artifact, consider whether it should be a reference table instead.

### M5: No rate limiting on Supabase queries

The anon key allows unlimited queries. A bot could scrape the entire job database via the REST API.

**Fix:** 
- Add Supabase rate limiting (Dashboard → API → Rate Limits)
- Consider revoking anon SELECT on ats_jobs and routing through an Edge Function with rate limiting
- At minimum, monitor API usage in Supabase Dashboard

### M6: resume_filter_assignments lacks user_id column

The `resume_filter_assignments` table has `resume_id` and `filter_name` but no `user_id`. When multiple users exist, there's no way to scope filter assignments to a specific user without joining through the `resumes` table.

**Fix:** Add `user_id` column and RLS policy, or ensure all queries join through `resumes.user_id`.

---

## 🟢 LOW — Technical Debt

### L1: Mixed var/const/let declarations

`globals.js` uses `var` for most state variables while other files use `const`/`let`. This is technically functional but inconsistent and risks hoisting bugs.

### L2: No build-time JS validation

There's no linting or syntax checking in the build pipeline. CSS has Tailwind CLI but JS is deployed raw. A typo could break the entire dashboard.

**Fix:** Add `eslint` or at minimum a `node -c` syntax check to the build/deploy pipeline.

### L3: Magic numbers in query builders

Pagination size (50), multi-filter limit (200), staleness thresholds (5d/7d/14d), and other constants are scattered across files as inline numbers.

**Fix:** Consolidate into a config object in globals.js.

### L4: IndexedDB for resume files (not portable)

Resume file blobs are stored in IndexedDB (`bj_resume_files`). Like localStorage, this is device-bound. Combined with H1, users lose both resume metadata AND the actual files on device switch.

**Fix:** Already have Supabase Storage bucket + resumes table. Complete the migration to store all resume blobs in Supabase Storage.

---

## Summary Table

| ID | Issue | Severity | Category | Effort |
|----|-------|----------|----------|--------|
| C1 | ats_jobs/ats_companies open to anon writes | 🔴 Critical | Security | 1 hour (SQL) |
| C2 | No security headers (CSP, X-Frame, etc.) | 🔴 Critical | Security | 30 min |
| C3 | Raw HTML job descriptions (stored XSS) | 🔴 Critical | Security | 1 hour |
| H1 | All user data in localStorage | 🟡 High | Multiuser | 2-3 days |
| H2 | No CORS lockdown | 🟡 High | Security | 15 min |
| H3 | Client-side enrichment writes to shared table | 🟡 High | Scalability | 2-3 hours |
| H4 | Unbounded queries | 🟡 High | Scalability | 2-3 hours |
| M1 | No input sanitization (self-XSS) | 🟡 Medium | Security | 2 hours |
| M2 | Duplicate Supabase client init | 🟡 Medium | Code quality | 30 min |
| M3 | No user-facing error handling | 🟡 Medium | UX | 3-4 hours |
| M4 | location_cache 153K rows | 🟡 Medium | Performance | 1 hour |
| M5 | No API rate limiting | 🟡 Medium | Security | 1 hour |
| M6 | resume_filter_assignments no user_id | 🟡 Medium | Multiuser | 30 min |
| L1 | Mixed var/const/let | 🟢 Low | Code quality | 1 hour |
| L2 | No JS build validation | 🟢 Low | DevOps | 30 min |
| L3 | Magic numbers | 🟢 Low | Code quality | 1 hour |
| L4 | Resume blobs in IndexedDB | 🟢 Low | Multiuser | 2 hours |

---

## Recommended Fix Order

1. **C1: RLS fix** — Run the SQL in Supabase SQL editor. Takes 5 minutes but is the single highest-impact security fix.
2. **C2: Security headers** — Update vercel.json and push. 
3. **C3: DOMPurify** — Add the library and wrap innerHTML calls.
4. **H2: CORS** — Configure in Supabase Dashboard.
5. **H3: Enrichment Edge Function** — Move client-side writes to server.
6. **M1: escapeHtml** — Add utility, audit all innerHTML with user data.
7. **H1: localStorage → Supabase migration** — Major effort but required for multiuser.
