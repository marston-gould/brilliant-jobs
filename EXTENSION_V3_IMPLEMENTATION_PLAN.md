# Extension v3.0 + Auto-Apply — Unified Implementation Plan

**Created:** February 26, 2026  
**Sources:** `EXTENSION_SPEC_v3.md`, `APPLY_WORKFLOW_SPEC.md`, `roadmap.html`, competitor analysis (11 extensions)  
**Current State:** Extension v2.7.0, Dashboard v4.85, apply-workflow.js (1,061 lines)  
**Target:** Extension v3.0.0, all roadmap auto-apply items closed  

---

## What Already Exists (DON'T REBUILD)

Before writing any code, read this. The following are **already built and working**:

### Dashboard (apply-workflow.js v4.85)
- **6 apply modes:** manual, score-gated, auto, score-gated-auto, auto-rewrite, autopilot
- **State machine:** pending → approved → submitted / failed / skipped / expired
- **`pending_applications` table** (24 cols): Supabase-backed, UUID PK, FK→profiles CASCADE, idempotency_key UNIQUE, 4 RLS policies, 2 indexes
- **`mock_ats_submissions` table**: logs every attempt with payload, response type, idempotency
- **`mock-ats-submit` Edge Function**: simulates 80/10/10 success/rejected/timeout
- **`callMockAtsSubmit()`**: 30s timeout, auth headers, idempotency keys, error classification
- **`proceedToApply()`**: creates pending_applications row → calls mock ATS → updates pipeline → fires notification
- **Score Gate Modal**: intercepts low-score applies, shows breakdown, offers rewrite
- **Rewrite Review Modal**: shows before/after score, change summary
- **Pending Applications panel**: approve/skip/retry UI on Applications page
- **`_guessAtsSource(url)`**: URL-based ATS detection (greenhouse, lever, ashby, workable, recruitee, usajobs)
- **Pipeline integration**: `_updatePipelineApplied()` marks stage='applied' with timestamp
- **`apply-on-notification` Edge Function**: email escalation → SMS → auto-apply chain
- **Notification system**: 8 Edge Functions, 18 email templates, 4 pg_cron schedules, Vonage SMS

### Extension (v2.7.0)
- **LinkedIn harvesting**: API interception, profile scanning, company extraction
- **Human-sim**: bezier mouse paths, natural scrolling, typing simulation
- **Supabase auth gate**: approved users only
- **4 tabs**: Harvest, Scan, Jobs, Data

### Database
- `ats_jobs.apply_url` column EXISTS but is **null everywhere** (never populated)
- `ats_jobs.url` column has the job listing URL (e.g., `boards.greenhouse.io/{slug}/jobs/{id}`)
- `ats_companies` has: slug, name, source, is_active — but NO `api_key_encrypted`, NO `linkedin_company_id`. Column is `name` not `company_name`.
- `pending_applications` and `mock_ats_submissions` tables exist and are live

---

## The Three Submission Paths

The roadmap requires THREE distinct ways to submit a resume. Each serves different use cases:

```
PATH 1: Apply Link Redirect (Mode 1)
  User clicks Apply → open ATS URL in browser → user fills form manually
  Status: WORKING (Mode 1 in apply-workflow.js)
  Gap: apply_url is null — we just use ats_jobs.url which is the listing page, not the apply page

PATH 2: Server-Side API Submission (Modes 3-6)
  Dashboard → submit-application Edge Function → ATS API → resume POSTed server-side
  Status: MOCK ONLY (mock-ats-submit returns fake responses)
  Gap: No real ATS API calls. Need: Recruitee (zero-auth), Greenhouse (API key), Lever (scraped key)

PATH 3: Extension Form-Fill (Modes 1-2, fallback for 3-6)
  Dashboard/Extension → open ATS page in browser → extension fills form → user reviews or auto-submits
  Status: NOT BUILT
  Gap: Entire Extension Spec v3 Feature B
```

The plan below builds all three paths and wires them into the existing state machine.

---

## Phase 1: Apply Link Construction (LAUNCH BLOCKER)

**Roadmap item:** `Tier 1 — Apply link construction (all 5 ATS platforms)` (todo)  
**Effort:** 4h  
**No extension changes.** Pure dashboard + database.

### Problem

`ats_jobs.apply_url` is null for all 350K+ jobs. The `url` column points to the job listing page, not the application form. When users click "Apply", Mode 1 opens the listing — they then have to find the apply button themselves.

### Solution

Construct `apply_url` from the data we already have. Every ATS has a deterministic apply URL pattern:

```sql
-- Populate apply_url for all existing jobs
UPDATE ats_jobs SET apply_url = CASE
  -- Greenhouse: boards.greenhouse.io/{slug}/jobs/{id} → same URL with #app anchor
  WHEN ats_source = 'greenhouse' THEN url || '#app'
  
  -- Lever: jobs.lever.co/{slug}/{uuid} → jobs.lever.co/{slug}/{uuid}/apply
  WHEN ats_source = 'lever' THEN url || '/apply'
  
  -- Ashby: jobs.ashbyhq.com/{slug}?jobId={id} → same URL loads apply form inline
  WHEN ats_source = 'ashby' THEN url
  
  -- Workable: apply.workable.com/{slug}/j/{shortcode} → same URL (form is on page)
  WHEN ats_source = 'workable' THEN url
  
  -- Recruitee: {slug}.recruitee.com/o/{title-slug} → same URL (form is on page)
  WHEN ats_source = 'recruitee' THEN url
  
  -- USAJobs: direct apply link (already correct if populated)
  WHEN ats_source = 'usajobs' THEN COALESCE(apply_url, url)
  
  ELSE url
END
WHERE apply_url IS NULL;
```

### Also: Update refresh-jobs Edge Function

Add `apply_url` population during job refresh so new jobs get it immediately:

```javascript
// In each ATS parser, after building the job row:
// Greenhouse
row.apply_url = `https://boards.greenhouse.io/${slug}/jobs/${jobId}#app`;
// Lever  
row.apply_url = `https://jobs.lever.co/${slug}/${jobId}/apply`;
// Ashby — form is inline on the job page
row.apply_url = row.url;
// Workable — form is inline
row.apply_url = row.url;
// Recruitee — form is inline
row.apply_url = row.url;
```

### Wire into apply-workflow.js

Currently `proceedToApply()` receives `jobUrl` which is `ats_jobs.url`. Update the dashboard to pass `apply_url` instead:

```javascript
// In js/jobs.js — when rendering the Apply button, pass apply_url
var applyUrl = job.apply_url || job.url;
handleApplyClick(job.greenhouse_id, job.title, job.company_name, applyUrl, btn);
```

### Acceptance Criteria

- [ ] `apply_url` populated for all existing jobs (backfill SQL)
- [ ] refresh-jobs sets `apply_url` for new jobs during refresh
- [ ] Dashboard passes `apply_url` to `handleApplyClick()`
- [ ] Mode 1 (Manual) opens the apply form, not just the listing
- [ ] Version bump: dashboard only (extension unchanged)

---

## Phase 2: Real ATS API Submission — Recruitee (Zero-Auth)

**Roadmap item:** `[REC] API resume submission (zero-auth)` (todo)  
**Effort:** 6h  
**This is the easiest real submission because Recruitee requires NO authentication.**

### New Edge Function: `submit-application`

Replaces `mock-ats-submit` as the real submission endpoint. Uses a feature flag to route between mock and real.

```
POST /functions/v1/submit-application
{
  job_id, ats_source, apply_url, resume_file_id, resume_filename,
  applicant: { name, email, phone, linkedin },
  pending_application_id, idempotency_key
}

→ Routes by ats_source:
  'recruitee' → POST {slug}.recruitee.com/api/offers/{offer_slug}/candidates (zero-auth)
  'greenhouse' → Phase 3
  'lever' → Phase 4
  others → fallback to mock or redirect
```

### Recruitee API Contract

```javascript
// POST https://{slug}.recruitee.com/api/offers/{offer_slug}/candidates
// Content-Type: multipart/form-data
// NO auth headers required

const formData = new FormData();
formData.append('candidate[name]', applicant.name);
formData.append('candidate[email]', applicant.email);
formData.append('candidate[phone]', applicant.phone || '');
formData.append('candidate[cv]', resumeBlob, resumeFilename);
// async=true for large PDFs
```

**Slug + offer_slug extraction:** Parse from `apply_url`:
- `https://company.recruitee.com/o/job-title-slug` → slug=`company`, offer_slug=`job-title-slug`
- `https://careers.company.com/o/job-title-slug` (custom domain) → need to look up slug from `ats_companies`

### Dashboard Change

Update `apply-workflow.js` to call `submit-application` instead of `mock-ats-submit`:

```javascript
// Replace callMockAtsSubmit with callSubmitApplication
// Same contract, same error handling, new endpoint
var endpoint = SUPABASE_URL + '/functions/v1/submit-application';
// Feature flag: if USE_REAL_SUBMIT is false, fall back to mock
if (!window.BJ_USE_REAL_SUBMIT) {
  endpoint = SUPABASE_URL + '/functions/v1/mock-ats-submit';
}
```

### Acceptance Criteria

- [ ] `submit-application` Edge Function deployed
- [ ] Recruitee zero-auth submission works end-to-end
- [ ] Resume fetched from Supabase Storage, POSTed as multipart
- [ ] Idempotency: duplicate submissions blocked
- [ ] `pending_applications.status` updated to 'submitted' on success
- [ ] `mock_ats_submissions` still logs for audit trail
- [ ] Feature flag `BJ_USE_REAL_SUBMIT` controls routing
- [ ] Fallback to mock for non-Recruitee platforms
- [ ] Dashboard `apply-workflow.js` updated to call new endpoint

---

## Phase 3: Real ATS API Submission — Greenhouse

**Roadmap item:** `Tier 2 — API resume submission (Recruitee + Greenhouse)` (todo)  
**Effort:** 8h  
**Greenhouse requires a Job Board API token (gh_token) embedded in employer career pages.**

### 3A: API Key Scraping + Storage (4h)

**Roadmap item:** `ATS API key scraping + storage` (todo)

During board refresh, scrape the Greenhouse Job Board API token from the employer's career page:

```javascript
// In refresh-jobs Edge Function, for Greenhouse boards:
// The embed iframe src contains the token:
// <iframe src="https://boards.greenhouse.io/embed/job_board?for={slug}&token={TOKEN}">
// Or the JavaScript bundle contains: gh_token = "TOKEN"

async function scrapeGreenhouseToken(slug) {
  const pageUrl = `https://boards.greenhouse.io/${slug}`;
  const html = await fetch(pageUrl).then(r => r.text());
  
  // Pattern 1: iframe embed
  const iframeMatch = html.match(/token=([a-zA-Z0-9]+)/);
  if (iframeMatch) return iframeMatch[1];
  
  // Pattern 2: JS variable
  const jsMatch = html.match(/gh_token\s*[=:]\s*["']([a-zA-Z0-9]+)["']/);
  if (jsMatch) return jsMatch[1];
  
  return null;
}
```

**Database change:**

```sql
ALTER TABLE ats_companies 
  ADD COLUMN IF NOT EXISTS api_key_encrypted text,
  ADD COLUMN IF NOT EXISTS api_key_source text; -- 'scraped', 'manual', 'partner'
```

Store tokens encrypted (or plain if low-risk — these are public-facing job board tokens, not secret API keys).

### 3B: Greenhouse API Submission (4h)

Add Greenhouse route to `submit-application`:

```javascript
// POST https://boards-api.greenhouse.io/v1/boards/{slug}/jobs/{jobId}
// Content-Type: multipart/form-data
// No auth header — token goes in form data

const formData = new FormData();
formData.append('first_name', applicant.firstName);
formData.append('last_name', applicant.lastName);
formData.append('email', applicant.email);
formData.append('phone', applicant.phone || '');
formData.append('resume', resumeBlob, resumeFilename);
formData.append('mapped_url_token', ghToken); // The scraped token
```

### Acceptance Criteria

- [ ] Token scraping runs during board refresh for Greenhouse boards
- [ ] `ats_companies.api_key_encrypted` populated for boards where token found
- [ ] `submit-application` routes Greenhouse jobs through real API
- [ ] Resume uploaded as multipart/form-data with token
- [ ] Jobs without a scraped token fall back to redirect (Path 1)
- [ ] Success rate tracked in `mock_ats_submissions`

---

## Phase 4: Real ATS API Submission — Lever

**Roadmap item:** `[LV] API key scraping + resume submission` (todo)  
**Effort:** 6h

### Lever API Contract

```javascript
// Lever uses a Postings API key embedded in employer career page JS
// POST https://api.lever.co/v0/postings/{slug}/{postingId}?key={API_KEY}
// Content-Type: multipart/form-data

formData.append('name', `${applicant.firstName} ${applicant.lastName}`);
formData.append('email', applicant.email);
formData.append('phone', applicant.phone || '');
formData.append('resume', resumeBlob, resumeFilename);
formData.append('silent', 'true'); // Suppress candidate email
formData.append('urls[LinkedIn]', applicant.linkedin || '');
```

**Key scraping:** Lever embeds the API key in the career page JavaScript. During refresh, parse it the same way as Greenhouse tokens.

### Acceptance Criteria

- [ ] Lever API key scraping during board refresh
- [ ] `submit-application` routes Lever jobs through real API
- [ ] `silent=true` suppresses candidate notification email
- [ ] De-duplication by email — Lever rejects duplicates per posting

---

## Phase 5: Extension — Role-Based Access Control

**Spec:** Extension Spec v3 §2  
**Effort:** 4h  
**Extension version:** 2.8.0

This is Phase 1 from the Extension Spec. No changes to the plan — implement exactly as specified:

- Add `role` column to profiles (if not exists)
- Role check in `popup.js` `checkAuth()`
- `showUserTabs()` / `showAdminTabs()` gating
- Scanner admin-only gate in `background.js`
- Admin toggle in header

### Acceptance Criteria

Per Extension Spec v3 §2A.1–2A.5. Plus:
- [ ] `version.json` → 2.8.0
- [ ] `manifest.json` → 2.8.0
- [ ] Console prints version

---

## Phase 6: Extension — Application Profile + Form-Fill Engine

**Spec:** Extension Spec v3 §3B  
**Roadmap items:** `Auto-apply form-fill automation` (todo), `Application auto-detect from extension` (todo)  
**Effort:** 20h  
**Extension version:** 2.9.0

Combines Extension Spec Phases 2+3. This is the big one.

### 6A: Application Profile + Apply Tab UI (6h)

- `application_profiles` table + RLS
- Apply tab in popup.html (profile form, Quick Apply, Recent Applications)
- Profile sync: chrome.storage.local ↔ Supabase

### 6B: ATS Detection + Form Mapping (4h)

- `ats-detector.js` — URL pattern matching
- `ats-form-mapper.js` — CSS selectors per ATS
- Validate against competitor extensions (FastApply `platforms/` folder has working selectors for all 5)

### 6C: Form Fill Orchestrator (6h)

- `ats-filler.js` — content script with human-sim
- Character-by-character typing, mouse movement, scroll
- Resume upload via DataTransfer API
- Custom question detection + cached answers
- CAPTCHA detection → pause for user (no solving)

### 6D: Dashboard ↔ Extension Integration (4h)

**Spec:** Extension Spec v3 §3B.6  
**Roadmap item:** `Application auto-detect from extension` (todo)

- `externally_connectable` for brilliantjobs.app
- Dashboard Apply button → extension form-fill for Mode 1/2
- Extension detects when user submits on ATS page → logs to `application_submissions` → updates pipeline
- ATS redirect detection: when user clicks "Apply" on LinkedIn and lands on a Greenhouse/Lever page, extension prompts "Track this application?"

### Wire into existing state machine

The extension form-fill becomes an alternative submission path in `apply-workflow.js`:

```javascript
async function proceedToApply(jobId, jobTitle, companyName, jobUrl) {
  // ... existing mode checks ...
  
  // MODE 1: Try extension form-fill first (if installed)
  if (mode === APPLY_MODES.MANUAL || mode === APPLY_MODES.SCORE_GATED) {
    if (window.bjExtensionId) {
      // Extension fills the form, user reviews
      chrome.runtime.sendMessage(window.bjExtensionId, {
        type: 'applyToJob',
        jobId, applyUrl: jobUrl, mode: 'fill_review'
      }, onExtensionResponse);
      return;
    }
    // Fallback: just open URL
    window.open(jobUrl, '_blank');
    return;
  }
  
  // MODES 3-6: Try server-side API first
  var result = await callSubmitApplication(savedApp, resume.id, resume.filename);
  
  if (result.ok) {
    // Server-side worked — done
  } else if (result.error === 'no_api_key' && window.bjExtensionId) {
    // No API key for this board — fall back to extension form-fill
    chrome.runtime.sendMessage(window.bjExtensionId, {
      type: 'applyToJob',
      jobId, applyUrl: jobUrl, mode: 'auto_submit'
    }, onExtensionResponse);
  } else {
    // Neither worked — redirect to ATS page
    window.open(jobUrl, '_blank');
  }
}
```

### Acceptance Criteria

- [ ] Application profile saves/loads in extension
- [ ] Form fill works on all 5 ATS platforms
- [ ] Human-sim delays on all form interactions
- [ ] Dashboard can trigger extension form-fill via externally_connectable
- [ ] Extension detects ATS page visits and prompts to track
- [ ] Fallback chain: API → extension form-fill → redirect
- [ ] Version bump: extension 2.9.0, dashboard version bump

---

## Phase 7: Extension — Data Pipeline + Board Discovery

**Spec:** Extension Spec v3 §6E + §6F  
**Roadmap item:** `[GH] Board discovery from LinkedIn outbound links` (todo)  
**Effort:** 10h  
**Extension version:** 2.10.0

### 7A: Centralized Event Logging (4h)

- `extension_events` table + RLS
- `logExtensionEvent()` in supabase.js with batch queue
- Instrument all existing code paths

### 7B: Extension-Discovered Jobs → ats_jobs (3h)

- Jobs tab scrape → upsert to `ats_jobs` with `li_` prefix
- Extract ATS apply URLs from LinkedIn job detail panels
- Parse board slugs → upsert to `ats_companies`

### 7C: Board Discovery Pipeline (3h)

- `board_discovery_queue` table
- Scanner queues unknown companies
- `discover-boards-from-companies` Edge Function
- pg_cron daily at 3 AM UTC

### Database Migrations

```sql
-- extension_events (new)
CREATE TABLE extension_events ( ... );  -- per Extension Spec §6E.1

-- ats_jobs modification
ALTER TABLE ats_jobs ADD COLUMN IF NOT EXISTS discovered_by text DEFAULT 'refresh';

-- ats_companies modifications  
ALTER TABLE ats_companies
  ADD COLUMN IF NOT EXISTS linkedin_company_id text,
  ADD COLUMN IF NOT EXISTS discovered_via text DEFAULT 'dataforseo';

-- board_discovery_queue (new)
CREATE TABLE board_discovery_queue ( ... );  -- per Extension Spec §6F.3
```

### Acceptance Criteria

- [ ] Event logging fires for all extension actions
- [ ] Jobs tab syncs to ats_jobs
- [ ] Board slugs discovered from LinkedIn apply URLs
- [ ] Scanner queues unknown companies
- [ ] Edge Function processes queue daily
- [ ] Version bump: extension 2.10.0

---

## Phase 8: Remaining ATS API Submissions

**Roadmap items:** `[ASH] API resume submission` (todo), `[WK] API resume submission (Phase 2+)` (todo)  
**Effort:** 6h  
**Post-launch — these require partnership or difficult key discovery**

### Ashby

Ashby's `applicationForm.submit` endpoint requires an API key with `candidatesWrite` permission. This is NOT publicly exposed on career pages.

**Options:**
1. Apply for Ashby partner program (preferred)
2. Fall back to extension form-fill (works now after Phase 6)
3. Fall back to redirect (Mode 1)

### Workable

Workable requires per-employer Bearer tokens (account-level API keys). Not scrape-able.

**Options:**
1. Apply for Workable integration program
2. Extension form-fill (Phase 6)
3. Redirect (Mode 1)

### Implementation

Add routes in `submit-application` Edge Function for each platform as keys become available. The fallback chain (Phase 6D) handles platforms without API access gracefully.

---

## Phase 9: Recruiter Email Discovery

**Spec:** Extension Spec v3 §4C  
**Effort:** 6h  

- `lookup-recruiter` Edge Function (Hunter.io)
- `recruiter_contacts` table + cache
- Dashboard "Contact Recruiter" button + modal
- Pro-only gate, credit-based

No changes from Extension Spec — implement as specified.

---

## Phase 10: Build Fingerprint Obfuscation

**Spec:** Extension Spec v3 §5D  
**Extension version:** 3.0.0  
**Effort:** 12h  

- `build-extension` Edge Function
- `extension_builds` table
- Per-build randomization (file names, channels, manifest, CSS, whitespace)
- Download page on brilliantjobs.app
- Update notification mechanism

No changes from Extension Spec — implement as specified. This is always last.

---

## Roadmap Item Checklist

Every item you listed, mapped to which phase closes it:

| Roadmap Item | Status Before | Closed By | Path |
|---|---|---|---|
| Auto-apply decision engine | `progress` | **Already done** (v4.84-4.85) | — |
| Tier 1 — Apply link construction (all 5 ATS) | `todo` LAUNCH BLOCKER | **Phase 1** | SQL backfill + refresh-jobs |
| Tier 2 — API resume submission (Recruitee + Greenhouse) | `todo` | **Phases 2 + 3** | submit-application EF |
| Applications table + submission tracking schema | `done` | **Already done** (v4.84) | — |
| Application queue and status tracking | `done` | **Already done** (v4.85) | — |
| Application auto-detect from extension | `todo` | **Phase 6D** | Extension content scripts |
| Board discovery from LinkedIn outbound links | `todo` | **Phase 7B** | Extension Jobs tab + scanner |
| ATS API key scraping + storage | `todo` | **Phase 3A** | refresh-jobs + ats_companies |
| [LV] API key scraping + resume submission | `todo` | **Phase 4** | submit-application EF |
| [ASH] API resume submission | `todo` | **Phase 8** (needs partnership) | Fallback: Phase 6 form-fill |
| [WK] API resume submission (Phase 2+) | `todo` | **Phase 8** (needs partnership) | Fallback: Phase 6 form-fill |
| [REC] API resume submission (zero-auth) | `todo` | **Phase 2** | submit-application EF |
| Auto-apply form-fill automation | `todo` | **Phase 6C** | Extension ats-filler.js |

**Extension Spec v3 features not in roadmap (also covered):**

| Feature | Closed By |
|---|---|
| Role-based access control | Phase 5 |
| Application profile storage | Phase 6A |
| Centralized data pipeline | Phase 7A |
| Extension-discovered jobs → central DB | Phase 7B |
| Recruiter email discovery | Phase 9 |
| Build fingerprint obfuscation | Phase 10 |

---

## Submission Fallback Chain (Final Architecture)

When a user triggers an apply action, the system tries each path in order:

```
User clicks Apply
  │
  ├─ Mode 1 (Manual) or Mode 2 (Score-Gated)
  │   ├─ Extension installed? → Form-fill (user reviews before submit)
  │   └─ No extension? → Open apply_url in new tab
  │
  └─ Modes 3-6 (Auto/Autopilot)
      ├─ ATS has API key? → Server-side API submission (submit-application EF)
      │   ├─ Recruitee: zero-auth POST
      │   ├─ Greenhouse: token-based POST
      │   ├─ Lever: key-based POST
      │   └─ Success → pipeline updated, notification sent
      │
      ├─ No API key + Extension installed? → Form-fill (auto-submit mode)
      │
      └─ No API key + No extension? → Queue as 'pending', notify user to apply manually
```

Every job can be applied to regardless of API access. The paths degrade gracefully.

---

## Phase Sequencing

```
Phase 1 (Apply Links)          ← LAUNCH BLOCKER, do first, no extension needed
  │
  ├─ Phase 2 (Recruitee API)   ← First real submission, easiest win
  │   └─ Phase 3 (Greenhouse API + key scraping)
  │       └─ Phase 4 (Lever API)
  │
  └─ Phase 5 (Extension RBAC)  ← Can run in parallel with 2-4
      └─ Phase 6 (Extension Form-Fill)  ← Biggest phase
          └─ Phase 7 (Extension Data Pipeline)
              └─ Phase 8 (Ashby/Workable — needs partnerships)
                  └─ Phase 9 (Recruiter Discovery)
                      └─ Phase 10 (Build Obfuscation — always last)
```

**Critical path to launch:** Phase 1 only. Everything else can ship after launch.

---

## Version Discipline

Every deployment MUST update:
1. Extension: `version.json` + `manifest.json` + console log
2. Dashboard: version in UI footer + browser console
3. Commit message references phase number
4. Roadmap item status updated from `todo` to `done`
