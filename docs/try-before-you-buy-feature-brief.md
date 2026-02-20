# Feature Brief: Index Page Job Preview ("Try Before You Buy")

**From:** Pod 1 (Growth) — CPO
**To:** Pod 2 (Engineering) — CTO
**Date:** February 19, 2026
**Priority:** P2 — Post-launch conversion optimization
**Target:** v2.70+

---

## CPO Decision

This feature transforms the landing page (`index.html`) from a static brochure into a progressive conversion engine with three components, shipped in phases:

1. **Try Before You Buy** — interactive filter preview with counts + obfuscated titles
2. **Product Walkthrough** — annotated screenshot carousel showing the full dashboard experience
3. **Visit-Based Personalization** — different page variants for first-time, returning unregistered, returning registered (lapsed), and active users

**Governing principle:** Show enough to create intent, withhold enough to require signup. Then adapt the pitch to where the visitor is in their decision journey. A first-time visitor needs the full pitch. A third-time visitor needs a nudge. A lapsed user needs a reason to come back.

---

## User Stories

**Primary (conversion — first visit):**
**As a** first-time visitor to brilliantjobs.app,
**I want to** search for jobs in my field and see how many exist, salary ranges, and a preview of titles,
**So that** I can verify the platform has relevant data before creating an account.

**Secondary (credibility — first visit):**
**As a** skeptical job seeker evaluating yet another job platform,
**I want to** see a walkthrough of the full product experience,
**So that** I understand what I'll get after signing up and trust the platform enough to commit.

**Tertiary (re-engagement — return visitor):**
**As a** returning visitor who hasn't signed up yet,
**I want to** see a more direct, action-oriented experience that respects that I've already seen the pitch,
**So that** I'm nudged toward signing up without feeling like I'm re-reading a brochure.

**Quaternary (reactivation — lapsed user):**
**As a** registered user who hasn't logged in recently,
**I want to** see what's changed since I last visited and be directed back to my dashboard,
**So that** I'm reminded of the value and re-engage with the product.

---

## UX Flow

### Step 1: CTA in Hero
A "See jobs in your field" or "Try it free" button in the landing page hero section. Clicking it smooth-scrolls to the interactive preview section below.

### Step 2: Simplified Filter Bar
An inline section on `index.html` (hidden until CTA click) with three inputs:

- **Keyword** — single text input (maps to What pills in the dashboard)
- **Location** — single text input with autocomplete (maps to Where pills)
- **Remote toggle** — on/off (maps to `includeRemote` flag)

This is deliberately simpler than the full dashboard filter. Progressive disclosure — the full filter power is the post-signup reward.

### Step 3: Results Display
On filter submission, the section populates with:

**Stat cards** (same visual design as dashboard Stats page):
- Matching Jobs (total count)
- Median Salary (where available)
- Remote % (percentage of matching jobs that are remote)
- Companies Hiring (distinct company count)

**Teaser job list** (5–10 entries):
- Job titles shown but truncated (e.g., "Senior Director of Market…")
- Company names blurred or replaced with "Sign up to reveal"
- No job IDs, links, or apply URLs exposed
- Visual treatment: slight blur/opacity on company column to communicate "this is gated"

### Step 4: Signup CTA
Below the results: "Create your free account to see all [N] jobs" with prominent signup button.

### Step 5: Rate Limit Hit
After 2 queries, the filter becomes inactive and shows: "You've previewed the data — sign up free to explore unlimited filters, salary data, and more."

---

## Product Walkthrough Carousel

### Purpose
After the Try Before You Buy interaction, visitors who scroll further see a guided visual tour of the full dashboard. This bridges the gap between "I see the data is real" and "I understand what I'll get when I sign up."

### Format: Annotated Screenshot Carousel
A horizontal scroll-snap carousel of 5–6 full-dashboard screenshots, each with a headline and one-sentence description overlaid. No video production, no interactive simulation — just real screenshots with callouts.

### Slides

| # | Headline | Screenshot | Description |
|---|----------|-----------|-------------|
| 1 | "Your personalized job feed" | Jobs Feed with filters active, Match % column visible | Filter by keyword, location, salary, seniority — see only what matters to you. |
| 2 | "Know your match before you apply" | Feed zoomed to Match % column + resume readiness panel | Every job scored against your resume. Know your odds before you invest time. |
| 3 | "See your market clearly" | Stats page with charts populated | Salary distribution, hiring velocity, top companies — filtered to your search. |
| 4 | "Track every application" | Pipeline view with jobs in multiple stages | From saved to offer. Never lose track of where you stand. |
| 5 | "Get notified instantly" | Notification email screenshot (phone mockup) | New jobs matching your filters, delivered daily. |
| 6 | "Ready to start?" | Full-width signup CTA | Create your free account — takes 30 seconds. |

### Technical Implementation
- CSS `scroll-snap-type: x mandatory` carousel (no JS framework)
- Navigation dots below carousel (clickable)
- `IntersectionObserver` triggers subtle fade-in on scroll into view
- Screenshots are static images — easy to update as product evolves
- Lazy-loaded (`loading="lazy"`) to avoid impacting page load

### Screenshot Requirements
- Dashboard must be populated with realistic sample data (not empty states)
- Dark theme, matching the actual product
- Minimum resolution: 1200px wide for desktop, cropped variants for mobile
- Consider creating a dedicated demo account with curated filter data for captures

### Placement
Below the Try Before You Buy section, above the final signup CTA. Natural scroll progression: interactive data → visual tour → convert.

---

## Visit-Based Page Personalization

### Visitor Segmentation

Four distinct visitor segments, detected client-side:

| Segment | Detection Method | Key Signal |
|---------|-----------------|------------|
| **New visitor** | No `bj_visits` in localStorage AND no Supabase auth session | First time on the site |
| **Returning unregistered** | `bj_visits` >= 2 in localStorage AND no Supabase auth session AND no `bj_has_account` flag | Came back but never signed up |
| **Returning registered (lapsed)** | Supabase auth session expired/absent BUT `bj_has_account` flag exists in localStorage | Signed up before but hasn't been active |
| **Active registered user** | Valid Supabase auth session detected | Has an account and is logged in (or recently was) |

### Detection Logic

```javascript
async function getVisitorSegment() {
  // Increment visit counter
  const visits = parseInt(localStorage.getItem('bj_visits') || '0') + 1;
  localStorage.setItem('bj_visits', visits.toString());
  
  // Check for Supabase auth session
  const { data: { session } } = await supabase.auth.getSession();
  const hasAccount = localStorage.getItem('bj_has_account') === 'true';
  
  if (session) {
    return 'active_registered';      // Logged in — redirect to dashboard
  } else if (hasAccount) {
    return 'lapsed_registered';      // Had account, not logged in
  } else if (visits >= 2) {
    return 'returning_unregistered'; // Been here before, no account
  } else {
    return 'new_visitor';            // First visit
  }
}
```

**Important:** The `bj_has_account` flag is set in localStorage on first successful login in the dashboard. This persists even after the auth session expires, allowing the landing page to distinguish "never signed up" from "signed up but lapsed" without requiring an active session.

### Page Variants

#### Segment 1: New Visitor (visit 1)
**Goal:** Educate + build credibility + first conversion attempt

Full landing page experience:
- Full hero with positioning copy ("Discover jobs that job boards miss")
- Benefits section
- Social proof / stats bar (135K+ jobs, 7,500+ companies)
- Try Before You Buy (collapsed, CTA to expand)
- Product walkthrough carousel
- Final signup CTA

#### Segment 2: Returning Unregistered (visit 2+, no account)
**Goal:** Skip the pitch, drive action

Streamlined experience:
- Shorter hero: "Ready to see what's out there?" — filter preview is the primary CTA
- Try Before You Buy section auto-expanded or promoted to hero position
- Benefits section compressed or hidden (they've read it)
- "Since you last visited" hook if possible (e.g., "X new jobs posted this week in [their previous keyword]" — requires cookie storing last query keyword)
- Product walkthrough still visible on scroll
- Stronger CTA copy: "Sign up free — takes 30 seconds"
- Visit 3+: Add objection-handling FAQ section ("Is it really free?", "How is this different from LinkedIn?", "Where does the data come from?")

#### Segment 3: Returning Registered / Lapsed (has account, no session)
**Goal:** Reactivate — get them back to the dashboard

Minimal marketing, maximum re-engagement:
- Hero: "Welcome back — your job feed is waiting" + "Log in" primary button + "Sign up" secondary
- Show a teaser: "X new jobs match your filters since [last_seen date]" (if we can store/retrieve this without auth — otherwise skip)
- Skip benefits, skip walkthrough — they already know the product
- Single focused CTA: "Log back in"
- If auth session is fully expired, pre-fill email on login form if stored in localStorage

#### Segment 4: Active Registered User (valid session)
**Goal:** Don't sell — redirect

- Auto-redirect to `dashboard.html` after 1-second delay
- Or: minimal banner at top — "Welcome back, [name] — Go to dashboard →" with the rest of the landing page visible below (in case they came to the landing page intentionally, e.g., to share the URL)

### Implementation Approach

**CSS-driven visibility, not separate pages.** All content exists in a single `index.html`. Segments control visibility via a data attribute on `<body>`:

```css
/* Default: everything visible (new visitor) */

/* Returning unregistered: compress pitch, expand preview */
[data-segment="returning_unregistered"] .full-pitch-only { display: none; }
[data-segment="returning_unregistered"] .returning-hero { display: block; }
[data-segment="returning_unregistered"] .try-before-you-buy { /* auto-expand styles */ }

/* Lapsed registered: minimal marketing */
[data-segment="lapsed_registered"] .full-pitch-only { display: none; }
[data-segment="lapsed_registered"] .walkthrough-section { display: none; }
[data-segment="lapsed_registered"] .reactivation-hero { display: block; }

/* Active registered: redirect or minimal */
[data-segment="active_registered"] .marketing-content { display: none; }
[data-segment="active_registered"] .redirect-banner { display: block; }
```

**No FOUC (Flash of Unstyled Content):** Run the segment detection script in `<head>` before the body renders. The visit counter and localStorage checks are synchronous and instant. The Supabase auth check is async but fast — add a brief loading state (100–200ms max) or default to `new_visitor` and upgrade the segment when auth resolves.

### Privacy and UX Notes

- **Never announce tracking.** The personalization should feel natural, not surveilled. Don't say "Welcome back, we see this is your 3rd visit." Just change the tone and content.
- **localStorage is the only storage.** No server-side visitor profiles for unregistered users. If they clear localStorage or use incognito, they get the new visitor experience — that's fine.
- **The `bj_has_account` flag is set client-side on first login.** It's not sensitive data — it just indicates "this browser has logged in before." It doesn't contain email, name, or any PII.
- **Supabase auth check on landing page:** Only used to detect active sessions for redirect. The landing page does NOT load the full Supabase client for unregistered visitors — only the lightweight auth check. Import only `@supabase/supabase-js/auth` if tree-shaking allows, or conditionally load.

---

## Full Page Flow (All Segments Combined)

```
┌─────────────────────────────────────────────────────┐
│  HERO                                                │
│  New: Full positioning copy + "See jobs" CTA         │
│  Returning: "Ready to see what's out there?"         │
│  Lapsed: "Welcome back — your feed is waiting"       │
│  Active: Auto-redirect banner                        │
├─────────────────────────────────────────────────────┤
│  SOCIAL PROOF BAR                                    │
│  "135K+ jobs · 7,500+ companies · 5 ATS platforms"   │
│  (All segments except Active)                        │
├─────────────────────────────────────────────────────┤
│  BENEFITS SECTION                                    │
│  (New only — hidden for Returning/Lapsed)            │
├─────────────────────────────────────────────────────┤
│  TRY BEFORE YOU BUY                                  │
│  New: Collapsed, expand on CTA click                 │
│  Returning: Auto-expanded, promoted position         │
│  Lapsed/Active: Hidden                               │
├─────────────────────────────────────────────────────┤
│  PRODUCT WALKTHROUGH CAROUSEL                        │
│  New + Returning: Visible                            │
│  Lapsed/Active: Hidden                               │
├─────────────────────────────────────────────────────┤
│  OBJECTION FAQ                                       │
│  (Visit 3+ Returning only)                           │
│  "Is it really free?" / "How is this different?"     │
├─────────────────────────────────────────────────────┤
│  FINAL CTA                                           │
│  New/Returning: "Create your free account"           │
│  Lapsed: "Log back in"                               │
│  Active: (not shown — already redirected)            │
├─────────────────────────────────────────────────────┤
│  FOOTER                                              │
└─────────────────────────────────────────────────────┘
```

---

## Security Requirements

### Non-Negotiable — Pod 2 Veto Territory

**1. Edge Function as sole data gateway**
- Public `index.html` has NO Supabase anon key, NO direct database access
- All queries routed through a new Edge Function: `preview-jobs`
- Edge Function uses service role key internally
- Accepts: `{ keyword, location, remote, sessionToken }`
- Returns: `{ stats: { total, medianSalary, remotePercent, companies }, titles: ["truncated…"] }`

**2. Server-side rate limiting**
- Maximum 2 queries per session token
- Session token: cryptographically random, set via HTTP-only cookie on first page load
- After 2 queries, Edge Function returns `{ limited: true }` — no data
- IP-based rate limiting as secondary defense (Vercel edge middleware)
- Do NOT rely on client-side counters or localStorage — trivially bypassed

**3. Data obfuscation**
- Job titles truncated server-side to first 35 characters + "…"
- No company names in response
- No `greenhouse_id`, `ats_source`, or any database identifiers
- No job URLs or application links
- No raw salary values — only pre-computed median
- Location info limited to country/state level, no specific addresses

**4. Anti-scraping measures**
- POST-only endpoint (no GET with query params in URL)
- Require valid session token header
- Response contains no linkable data — cannot reconstruct individual job listings
- Consider adding a CAPTCHA challenge before second query (optional, evaluate friction vs. protection)

---

## Acceptance Criteria

### Landing Page UI
- [ ] "See jobs in your field" CTA button in hero section
- [ ] Clicking CTA smooth-scrolls to interactive preview section
- [ ] Preview section hidden by default, revealed on CTA click
- [ ] Simplified filter bar: keyword input, location input with autocomplete, remote toggle
- [ ] Stat cards render with counts after filter submission
- [ ] Teaser job list shows 5–10 truncated titles with blurred company column
- [ ] Signup CTA below results: "Create your free account to see all [N] jobs"
- [ ] Loading state (shimmer/skeleton) while Edge Function responds

### Rate Limiting
- [ ] First 2 queries return full results
- [ ] Third query returns rate limit message instead of data
- [ ] Rate limit message includes signup CTA
- [ ] Filter inputs become disabled after rate limit
- [ ] Rate limit enforced server-side (session token + IP fallback)
- [ ] Client-side state mirrors server state but is not the source of truth

### Edge Function (`preview-jobs`)
- [ ] Accepts POST with `{ keyword, location, remote, sessionToken }`
- [ ] Validates session token, checks rate limit
- [ ] Runs simplified filter query against `ats_jobs`
- [ ] Returns only: aggregate stats + truncated titles (no IDs, no companies, no links)
- [ ] Returns `{ limited: true }` after 2 queries per session
- [ ] No Supabase anon key exposed to client

### Responsive
- [ ] Filter bar stacks vertically on mobile (< 640px)
- [ ] Stat cards wrap to 2×2 grid on mobile
- [ ] Teaser list readable on mobile (single column)

---

## Data Requirements

### Edge Function Query
```
SELECT title, salary_min, salary_max, loc_type, location, company_name
FROM ats_jobs
WHERE [simplified filter conditions]
LIMIT 5000
```

Aggregation happens server-side in the Edge Function:
- Count total matching
- Compute median salary (where salary data exists)
- Count remote percentage
- Count distinct companies
- Select 10 random titles, truncate to 35 chars

### Existing Infrastructure to Reuse
- `buildFilterQuery()` logic (port simplified version to Edge Function)
- Location matching logic from `getLocationMatchIds()`
- Stat card visual design from Stats page spec

### New Code Required

| Module | Purpose |
|--------|---------|
| `supabase/functions/preview-jobs/` | New Edge Function — filter query, aggregation, rate limiting, obfuscation |
| `index.html` additions | Interactive preview section (HTML + inline JS) |
| `src/input.css` additions | Preview section styling (stat cards, teaser list, blur effects) |
| Vercel edge middleware (optional) | IP-based rate limiting layer |

---

## Success Metrics

### Phase 1: Try Before You Buy + Walkthrough

| Metric | Target | Measurement |
|--------|--------|-------------|
| Preview interaction rate | > 15% of landing page visitors click "See jobs in your field" | PostHog `preview_cta_clicked` |
| Preview-to-signup conversion | > 25% of preview users sign up | PostHog funnel: `preview_filter_submitted` → `signup_completed` |
| Preview queries per session | Average 1.5–2.0 (most people use both attempts) | PostHog `preview_query_count` |
| Walkthrough engagement | > 30% of scrollers reach the carousel, > 50% of those swipe at least once | PostHog `walkthrough_viewed` + `walkthrough_swiped` |
| Signup lift | > 20% increase in landing page → signup conversion vs. pre-feature baseline | PostHog A/B (if traffic allows) or before/after comparison |

### Phase 2: Visit-Based Personalization

| Metric | Target | Measurement |
|--------|--------|-------------|
| Return visitor conversion | > 2x signup rate for visit-2 vs. visit-1 visitors | PostHog cohort: `visitor_segment` = returning_unregistered |
| Lapsed reactivation | > 15% of lapsed visitors log back in | PostHog funnel: `landing_page_visit` {segment: lapsed} → `dashboard_loaded` |
| Active user redirect | > 90% of active users reach dashboard within 3 seconds | PostHog `active_user_redirected` |
| Visit-3+ conversion | > 3x signup rate for visit-3+ vs visit-1 | PostHog cohort comparison |

### PostHog Events to Instrument

```
-- Phase 1: Try Before You Buy
preview_cta_clicked        — { }
preview_filter_submitted   — { keyword, location, remote }
preview_results_shown      — { total_jobs, has_salary_data }
preview_signup_clicked     — { total_jobs_shown, queries_used }
preview_rate_limited       — { queries_used: 2 }

-- Phase 1: Walkthrough
walkthrough_viewed         — { }  (IntersectionObserver fires)
walkthrough_swiped         — { slide_number, direction }
walkthrough_cta_clicked    — { from_slide: 6 }

-- Phase 2: Visit-Based Personalization
landing_page_visit         — { visit_number, segment, referrer }
segment_detected           — { segment, visit_count, has_account }
lapsed_login_clicked       — { }
active_user_redirected     — { redirect_delay_ms }
faq_section_viewed         — { visit_number }
```

---

## Build Order (Suggested for Pod 2)

### Phase 1: Try Before You Buy + Walkthrough (v2.70)

1. **Edge Function `preview-jobs`** — query logic, aggregation, truncation, rate limiting
2. **Session token mechanism** — cookie-based token generation + validation
3. **HTML section in `index.html`** — hidden preview section with filter bar + results area
4. **CSS** — stat cards, teaser list with blur effect, responsive breakpoints
5. **Client JS** — CTA scroll, filter submission via fetch, result rendering, rate limit handling
6. **Walkthrough carousel** — HTML structure, screenshot images, scroll-snap CSS, navigation dots
7. **PostHog instrumentation** — Phase 1 events (preview + walkthrough)
8. **Polish** — loading states, empty states, error handling, mobile testing

**Estimated effort:** 4–5 dev days (Edge Function ~1.5 days; preview frontend ~1 day; walkthrough carousel ~0.5 day; screenshots + polish ~1 day; PostHog ~0.5 day).

### Phase 2: Visit-Based Personalization (v2.71)

**Prerequisite:** Deploy Phase 1 and collect 2–4 weeks of PostHog data on landing page behavior before building variants. Data informs which sections to show/hide per segment.

1. **Visit counter + segment detection** — localStorage counter, `bj_has_account` flag (set in dashboard on first login), Supabase auth check
2. **`bj_has_account` flag in dashboard** — add `localStorage.setItem('bj_has_account', 'true')` to login success handler in dashboard JS
3. **Segment-specific hero variants** — 3 hero blocks (new, returning, lapsed), CSS-driven visibility
4. **Conditional section visibility** — CSS rules tied to `data-segment` attribute
5. **Returning visitor enhancements** — auto-expand preview, compressed benefits, "since your last visit" hook
6. **Lapsed user reactivation** — login-focused hero, skip marketing content
7. **Active user redirect** — auth detection + auto-redirect with fallback banner
8. **Objection FAQ section** — for visit-3+ returning unregistered
9. **PostHog instrumentation** — Phase 2 events (segment, visit tracking)
10. **Polish** — FOUC prevention, mobile testing across all segments

**Estimated effort:** 3–4 dev days (segment detection ~0.5 day; hero variants + CSS rules ~1 day; lapsed/active user logic ~0.5 day; FAQ section ~0.5 day; `bj_has_account` flag + testing ~0.5 day; PostHog + polish ~0.5 day).

**Total across both phases:** 7–9 dev days, spread across 2 releases.

**Dependency:** Phase 1 has no dependencies. Phase 2 depends on Phase 1 being live + PostHog data collection. Phase 2 also requires a one-line change in the dashboard JS (setting the `bj_has_account` flag on login).

---

## Constraints and Guardrails

### Both Phases
- **No framework** — vanilla JS, consistent with landing page
- **Dark theme** — match existing `index.html` design aesthetic
- **Fonts** — Outfit + JetBrains Mono (already loaded on landing page)
- **No emojis in UI**
- **CSS** — additions go in `src/input.css`
- **Single `index.html`** — all variants live in one file, CSS-driven visibility

### Phase 1 (Try Before You Buy)
- **No Supabase client on public page** — Edge Function is the only data access point
- **Max 2 queries** — hard limit, enforced server-side
- **Titles truncated server-side** — never send full titles to client
- **No company names** — never included in Edge Function response

### Phase 2 (Visit-Based Personalization)
- **Never announce tracking** — no "Welcome back, we see this is your 3rd visit" messaging
- **localStorage only for unregistered visitors** — no server-side visitor profiles
- **`bj_has_account` flag contains no PII** — just a boolean indicating prior login
- **No FOUC** — segment detection runs in `<head>` before body renders
- **Graceful degradation** — if localStorage is unavailable (incognito, cleared), default to new visitor experience

---

## Open Questions for Pod 2

### Phase 1
1. **Session token storage:** HTTP-only cookie vs. server-generated token returned in first response? Cookie is simpler but adds CORS considerations for the Edge Function.
2. **Location autocomplete:** Reuse the same location data source as the dashboard, or a lighter-weight approach for the public page (e.g., static list of top 50 metros)?
3. **Rate limit persistence:** In-memory (resets on Edge Function cold start) vs. KV store (persistent)? In-memory is simpler but less reliable. For a 2-query limit, even in-memory with IP fallback may be sufficient.
4. **CAPTCHA:** Add before the second query to deter automated scraping, or skip to minimize friction? Recommend skipping for v1 — the 2-query limit + server-side obfuscation is sufficient protection initially.
5. **Screenshot pipeline:** Who produces the dashboard screenshots for the walkthrough? Need a demo account with curated data. Suggest Marston creates and maintains this.

### Phase 2
6. **Supabase client on landing page:** Currently the landing page pulls live stats (job count, company count) from Supabase. Is the auth module already loaded, or does segment detection for active/lapsed users require adding a new dependency? If so, evaluate bundle size impact.
7. **`bj_has_account` flag placement:** Which JS module in the dashboard handles login success? That's where the one-line localStorage write goes.
8. **"Since your last visit" data:** Storing the last-queried keyword in a cookie would enable "X new [keyword] jobs since [date]" for returning unregistered visitors. Is this worth the added cookie complexity, or should we skip it for v1?
9. **FOUC timing:** The Supabase auth check is async. If it takes 500ms+, the page will briefly render as "new visitor" before upgrading to "lapsed" or "active." Options: (a) accept the brief flash, (b) show a lightweight loading screen for 200ms while auth resolves, (c) only check auth if `bj_has_account` flag exists (fast path — skip auth entirely for truly new visitors).

---

*This brief was produced by Pod 1 (Growth). Pod 2 has authority to push back on effort estimates, suggest simpler alternatives, and flag technical risks. Security requirements are non-negotiable — Pod 2 veto territory.*
