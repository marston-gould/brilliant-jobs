# Task: Landing Page Phase 1 — Try Before You Buy + Walkthrough — Pod 2 Handoff

**From:** Pod 1 (Growth) — CPO
**To:** Pod 2 (Engineering) — CTO
**Date:** February 20, 2026
**Priority:** P2 — Post-launch conversion optimization
**Effort:** ~4-5 dev days
**Spec:** `docs/try-before-you-buy-feature-brief.md`
**Depends on:** Entitlements/Cohort live (done), Stats Page Redesign done (for walkthrough screenshots)
**Note:** Phase 2 (Visit-Based Personalization) ships separately, 4-6 weeks later, after PostHog data from Phase 1.

---

## What Exists Today

**Landing page (`index.html`, 1414 lines):**
- Dark theme, vanilla JS, no framework
- Supabase client lazy-loaded (`loadSupabase()`) — only for auth + `get_landing_stats()` RPC
- Anon key present (for auth only — all data access goes through RPCs)
- `get_landing_stats()` SECURITY DEFINER RPC already powers hero stat counters
- Static filter preview at L762 ("See it in action" — hardcoded pills + fake "47 jobs" result)
- Signup/login modal with email+password+LinkedIn+optin
- `IntersectionObserver` fade-in already wired for `.fade-up` elements
- Sections in order: Hero → The Problem → What You Get → Employer Accountability → How It Works → Market Intelligence → Pricing → Comparison table → Bottom CTA → Auth modal

**Available infrastructure:**
- 18 Edge Functions deployed (Supabase CLI, source not in GitHub repo)
- `buildFilterQuery()` in `js/job-feed.js` — production filter logic
- `getLocationMatchIds()` in `js/browsers.js` — location radius matching
- PostHog loaded on landing page (via Ahrefs analytics tag — verify if PostHog is separate)

---

## This Task: Phase 1 Only

Phase 1 replaces the static filter demo with a live interactive preview and adds a product walkthrough carousel. Phase 2 (visit personalization) ships later.

---

## Build Order (8 steps)

### Step 1: Edge Function `preview-jobs` (1.5 days)

New Edge Function. This is the only data access point — no Supabase client queries from the public page.

**Endpoint:** `POST /functions/v1/preview-jobs`

**Request body:**
```json
{
  "keyword": "SEO growth",
  "location": "Portland, OR",
  "remote": true,
  "session_token": "abc123..."
}
```

**Response (success):**
```json
{
  "total": 47,
  "median_salary": 128000,
  "remote_pct": 62,
  "companies": 24,
  "titles": [
    "Senior Director of Market…",
    "Growth Marketing Lead —…",
    "SEO Manager, Enterprise…"
  ],
  "queries_remaining": 1,
  "session_token": "abc123..."
}
```

**Response (rate limited):**
```json
{
  "error": "rate_limited",
  "queries_remaining": 0,
  "message": "Preview limit reached. Sign up free to explore unlimited filters."
}
```

**Implementation requirements:**

1. **Session token:** Generate on first request if none provided. Use `crypto.randomUUID()`. Store in a Map keyed by token with `{ queries: 0, created: Date.now() }`. Tokens expire after 30 minutes.

2. **Rate limit:** Max 2 queries per session token. Enforced server-side. Return `queries_remaining` in every response.

3. **Query logic:** Reuse the same filter patterns as `buildFilterQuery()` but implemented in SQL:
   - Keyword → `title ILIKE '%keyword%'` (or trigram if available)
   - Location → match against `loc_city`, `loc_state` (simplified — no radius for v1, just exact city/state match)
   - Remote → `loc_type = 'remote'` OR `location ILIKE '%remote%'`
   - Always filter `status != 'closed'`

4. **Aggregation (server-side):**
   - `total`: COUNT(*)
   - `median_salary`: PERCENTILE_CONT(0.5) on `(salary_min + salary_max) / 2` WHERE salary_min IS NOT NULL
   - `remote_pct`: COUNT WHERE remote / total * 100
   - `companies`: COUNT(DISTINCT company_name)

5. **Title obfuscation (server-side):**
   - Return max 10 titles
   - Truncate at 35 characters + "…"
   - No company names in response
   - No job IDs, URLs, or apply links
   - Random sample, not sorted

6. **Security:**
   - POST only
   - Validate input types (keyword: string max 100 chars, location: string max 100 chars, remote: boolean)
   - No Supabase anon key needed — Edge Function uses service_role internally
   - CORS: allow `https://brilliantjobs.app` only

**Pod 2 judgment calls:**
- **In-memory rate limiting** is fine for v1. The 2-query limit is low-stakes — if someone bypasses it by getting a new token, they still only see truncated titles with no company names. Persistent KV is overkill.
- **Location matching:** Exact city/state match is fine for v1. No radius needed on the preview — save that complexity for post-signup.
- **CAPTCHA:** Skip for v1. The 2-query limit + server-side obfuscation is sufficient.

### Step 2: Replace static filter preview with interactive version (1 day)

**Replace the existing static block (L762-774)** with an interactive section:

```html
<!-- INTERACTIVE PREVIEW — replaces static filter demo -->
<div class="preview-section fade-up" id="preview-section">
  <h3>See jobs in your field</h3>
  <div class="sub">Try a search — no account needed.</div>
  
  <!-- Filter inputs -->
  <div class="preview-filters" id="preview-filters">
    <div class="preview-input-row">
      <input type="text" id="preview-keyword" placeholder="Job title or keywords (e.g. SEO, growth marketing)" 
             class="preview-input" maxlength="100">
      <input type="text" id="preview-location" placeholder="City or state (e.g. Portland, OR)" 
             class="preview-input" maxlength="100">
      <label class="preview-toggle">
        <input type="checkbox" id="preview-remote"> Remote only
      </label>
    </div>
    <button class="btn btn-primary preview-go" id="preview-go">Search</button>
  </div>

  <!-- Results (hidden until first query) -->
  <div class="preview-results" id="preview-results" style="display:none">
    <!-- Stat cards -->
    <div class="preview-stats">
      <div class="preview-stat"><span class="preview-stat-val" id="pv-total">—</span><span class="preview-stat-label">Jobs Found</span></div>
      <div class="preview-stat"><span class="preview-stat-val" id="pv-salary">—</span><span class="preview-stat-label">Median Salary</span></div>
      <div class="preview-stat"><span class="preview-stat-val" id="pv-remote">—</span><span class="preview-stat-label">Remote</span></div>
      <div class="preview-stat"><span class="preview-stat-val" id="pv-companies">—</span><span class="preview-stat-label">Companies</span></div>
    </div>
    <!-- Teaser job titles -->
    <div class="preview-titles" id="pv-titles"></div>
    <!-- Signup nudge -->
    <div class="preview-cta">
      <span id="pv-cta-text">Create your free account to see all jobs</span>
      <button class="btn btn-primary" id="pv-signup-btn">Get Started Free</button>
    </div>
  </div>

  <!-- Rate limit state (hidden until 2 queries used) -->
  <div class="preview-locked" id="preview-locked" style="display:none">
    <p>You've previewed the data — sign up free to explore unlimited filters, salary data, and more.</p>
    <button class="btn btn-primary" id="pv-locked-signup">Get Started Free</button>
  </div>
</div>
```

**Client JS** (add to the inline `<script>` block at bottom of index.html):

```javascript
// PREVIEW — Try Before You Buy
let previewToken = null;

$('#preview-go').addEventListener('click', async () => {
  const keyword = $('#preview-keyword').value.trim();
  const location = $('#preview-location').value.trim();
  const remote = $('#preview-remote').checked;

  if (!keyword && !location) {
    // Need at least one input
    return;
  }

  $('#preview-go').disabled = true;
  $('#preview-go').textContent = 'Searching...';

  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/preview-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, location, remote, session_token: previewToken })
    });
    const data = await res.json();

    if (data.error === 'rate_limited') {
      $('#preview-filters').style.display = 'none';
      $('#preview-results').style.display = 'none';
      $('#preview-locked').style.display = '';
      // PostHog
      if (window.posthog) posthog.capture('preview_rate_limited', { queries_used: 2 });
      return;
    }

    previewToken = data.session_token;

    // Populate stat cards
    $('#pv-total').textContent = data.total.toLocaleString();
    $('#pv-salary').textContent = data.median_salary ? '$' + Math.round(data.median_salary / 1000) + 'K' : 'N/A';
    $('#pv-remote').textContent = data.remote_pct + '%';
    $('#pv-companies').textContent = data.companies.toLocaleString();

    // Populate teaser titles
    const titlesEl = $('#pv-titles');
    titlesEl.innerHTML = data.titles.map(t =>
      '<div class="preview-title-row"><span class="preview-title">' + t + '</span><span class="preview-company">Sign up to reveal</span></div>'
    ).join('');

    // Update CTA text
    $('#pv-cta-text').textContent = 'Create your free account to see all ' + data.total.toLocaleString() + ' jobs';

    // Show results
    $('#preview-results').style.display = '';

    // PostHog
    if (window.posthog) posthog.capture('preview_results_shown', {
      total_jobs: data.total, has_salary_data: !!data.median_salary,
      queries_remaining: data.queries_remaining
    });

    // If last query, disable inputs but keep results visible
    if (data.queries_remaining === 0) {
      $('#preview-go').textContent = 'No queries remaining';
      $('#preview-go').disabled = true;
    } else {
      $('#preview-go').disabled = false;
      $('#preview-go').textContent = 'Search (' + data.queries_remaining + ' left)';
    }

  } catch (e) {
    console.error('[BJ] Preview error:', e);
    $('#preview-go').disabled = false;
    $('#preview-go').textContent = 'Search';
  }
});

// Wire signup buttons in preview section
['pv-signup-btn', 'pv-locked-signup'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', () => {
    openModal('signup');
    if (window.posthog) posthog.capture('preview_signup_clicked');
  });
});
```

### Step 3: Preview section CSS (0.5 day)

Add to `src/input.css` (or inline in index.html `<style>` block — match existing pattern):

```css
.preview-section {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 14px; padding: 32px; margin-top: 48px; overflow: hidden;
}
.preview-section h3 { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
.preview-section .sub { font-size: 13px; color: var(--text-faint); margin-bottom: 24px; }
.preview-input-row {
  display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px;
}
.preview-input {
  flex: 1; min-width: 180px; padding: 10px 14px; border-radius: 10px;
  border: 1px solid var(--border); background: var(--bg-input);
  color: var(--text); font-family: var(--sans); font-size: 14px;
}
.preview-input:focus { border-color: var(--accent); outline: none; }
.preview-input::placeholder { color: var(--text-faint); }
.preview-toggle {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; color: var(--text-dim); cursor: pointer; white-space: nowrap;
}
.preview-go {
  width: 100%; margin-top: 4px; font-size: 14px; padding: 12px;
}
.preview-stats {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
  margin: 24px 0 20px;
}
.preview-stat {
  background: var(--bg-input); border-radius: 10px; padding: 16px;
  text-align: center;
}
.preview-stat-val {
  display: block; font-size: 22px; font-weight: 700;
  font-family: var(--mono); color: var(--text); letter-spacing: -0.5px;
}
.preview-stat-label {
  font-size: 11px; color: var(--text-faint); text-transform: uppercase;
  letter-spacing: 0.5px; font-weight: 600; margin-top: 4px; display: block;
}
.preview-titles { margin-bottom: 20px; }
.preview-title-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.preview-title-row:last-child { border-bottom: none; }
.preview-title { color: var(--text); font-weight: 500; }
.preview-company {
  color: var(--text-faint); font-size: 11px; font-style: italic;
  filter: blur(0px); /* visual hint that this is gated */
  opacity: 0.5;
}
.preview-cta {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 16px; background: var(--bg-input);
  border-radius: 10px; margin-top: 16px;
}
.preview-cta span { font-size: 14px; color: var(--text-dim); font-weight: 500; }
.preview-locked {
  text-align: center; padding: 24px 0;
}
.preview-locked p {
  font-size: 14px; color: var(--text-dim); margin-bottom: 20px; line-height: 1.6;
}

@media (max-width: 640px) {
  .preview-stats { grid-template-columns: repeat(2, 1fr); }
  .preview-input-row { flex-direction: column; }
  .preview-cta { flex-direction: column; text-align: center; }
}
```

### Step 4: Hero CTA update (0.25 day)

Add a second CTA button in the hero that scrolls to the preview:

```html
<!-- In .hero-ctas (L616) -->
<button class="btn btn-primary" id="hero-signup-btn">Get Started — It's Free</button>
<button class="btn btn-ghost" id="hero-preview-btn">See Jobs in Your Field ↓</button>
```

```javascript
// Scroll to preview section
$('#hero-preview-btn').addEventListener('click', () => {
  document.getElementById('preview-section').scrollIntoView({ behavior: 'smooth' });
  if (window.posthog) posthog.capture('preview_cta_clicked');
});
```

```css
.btn-ghost {
  background: transparent; border: 1.5px solid var(--border);
  color: var(--text-dim); padding: 12px 28px; border-radius: 10px;
  font-weight: 600; font-size: 15px; cursor: pointer;
  transition: all 0.15s; font-family: var(--sans);
}
.btn-ghost:hover { border-color: var(--accent); color: var(--accent); }
```

### Step 5: Product Walkthrough Carousel (0.5 day)

Place below the preview section, above the final CTA:

```html
<!-- WALKTHROUGH CAROUSEL -->
<section class="section fade-up" id="walkthrough">
  <div class="section-label">See the Full Product</div>
  <h2>What you get after signing up</h2>
  <p class="section-desc">A 30-second tour of the dashboard experience.</p>

  <div class="carousel" id="walkthrough-carousel">
    <div class="carousel-track">
      <div class="carousel-slide">
        <img src="/img/walkthrough/feed.webp" alt="Personalized job feed" loading="lazy">
        <div class="carousel-caption">
          <h4>Your personalized job feed</h4>
          <p>Filter by keyword, location, salary, seniority — see only what matters to you.</p>
        </div>
      </div>
      <div class="carousel-slide">
        <img src="/img/walkthrough/match.webp" alt="Resume match scoring" loading="lazy">
        <div class="carousel-caption">
          <h4>Know your match before you apply</h4>
          <p>Every job scored against your resume. Know your odds before you invest time.</p>
        </div>
      </div>
      <div class="carousel-slide">
        <img src="/img/walkthrough/stats.webp" alt="Market analytics" loading="lazy">
        <div class="carousel-caption">
          <h4>See your market clearly</h4>
          <p>Salary distribution, hiring velocity, top companies — filtered to your search.</p>
        </div>
      </div>
      <div class="carousel-slide">
        <img src="/img/walkthrough/pipeline.webp" alt="Application pipeline" loading="lazy">
        <div class="carousel-caption">
          <h4>Track every application</h4>
          <p>From saved to offer. Never lose track of where you stand.</p>
        </div>
      </div>
      <div class="carousel-slide">
        <img src="/img/walkthrough/notifications.webp" alt="Job notifications" loading="lazy">
        <div class="carousel-caption">
          <h4>Get notified instantly</h4>
          <p>New jobs matching your filters, delivered daily.</p>
        </div>
      </div>
      <div class="carousel-slide carousel-slide-cta">
        <h4>Ready to start?</h4>
        <p>Create your free account — takes 30 seconds.</p>
        <button class="btn btn-primary" id="walkthrough-signup-btn">Get Started Free</button>
      </div>
    </div>
    <div class="carousel-dots" id="carousel-dots"></div>
  </div>
</section>
```

**CSS:**
```css
.carousel { position: relative; overflow: hidden; border-radius: 14px; }
.carousel-track {
  display: flex; overflow-x: auto; scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch; scrollbar-width: none;
}
.carousel-track::-webkit-scrollbar { display: none; }
.carousel-slide {
  flex: 0 0 100%; scroll-snap-align: start; position: relative;
}
.carousel-slide img {
  width: 100%; border-radius: 12px; display: block;
  border: 1px solid var(--border);
}
.carousel-caption {
  position: absolute; bottom: 0; left: 0; right: 0;
  background: linear-gradient(transparent, rgba(0,0,0,0.85));
  padding: 40px 24px 20px; border-radius: 0 0 12px 12px;
}
.carousel-caption h4 { font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 4px; }
.carousel-caption p { font-size: 13px; color: rgba(255,255,255,0.7); }
.carousel-slide-cta {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; min-height: 300px; text-align: center;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 12px; padding: 40px;
}
.carousel-slide-cta h4 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
.carousel-slide-cta p { font-size: 14px; color: var(--text-dim); margin-bottom: 24px; }
.carousel-dots {
  display: flex; justify-content: center; gap: 8px; margin-top: 16px;
}
.carousel-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--border); cursor: pointer; transition: all 0.2s;
}
.carousel-dot.active { background: var(--accent); transform: scale(1.3); }
```

**JS (minimal — CSS scroll-snap does the heavy lifting):**
```javascript
// Carousel dots
const track = document.querySelector('.carousel-track');
const dotsContainer = document.getElementById('carousel-dots');
if (track && dotsContainer) {
  const slides = track.querySelectorAll('.carousel-slide');
  slides.forEach((_, i) => {
    const dot = document.createElement('span');
    dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
    dot.addEventListener('click', () => {
      slides[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    });
    dotsContainer.appendChild(dot);
  });
  // Update active dot on scroll
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const idx = [...slides].indexOf(e.target);
        dotsContainer.querySelectorAll('.carousel-dot').forEach((d, i) => {
          d.classList.toggle('active', i === idx);
        });
      }
    });
  }, { root: track, threshold: 0.5 });
  slides.forEach(s => observer.observe(s));
}

// Walkthrough signup button
const wBtn = document.getElementById('walkthrough-signup-btn');
if (wBtn) wBtn.addEventListener('click', () => openModal('signup'));
```

### Step 6: Screenshot assets (0.5 day)

**Blocking dependency for carousel.** Need 5 dashboard screenshots:

1. `feed.webp` — Jobs Feed with filters active, Match % visible
2. `match.webp` — Feed zoomed to Match % + resume readiness panel
3. `stats.webp` — Stats page with charts populated (depends on Stats Redesign being done)
4. `pipeline.webp` — Pipeline view with jobs in multiple stages
5. `notifications.webp` — Notification email or phone mockup

**Requirements:**
- Dashboard populated with realistic sample data (not empty states)
- Light theme (dashboard is light)
- 1200px wide minimum
- WebP format, < 200KB each
- Place in `/img/walkthrough/` directory

**Who produces these:** Marston (CPO) creates a demo account with curated data and takes screenshots. Or Pod 2 mocks the data. Either way, this blocks the carousel but not the Try Before You Buy preview.

### Step 7: PostHog instrumentation (0.5 day)

Wire all Phase 1 events. Verify PostHog is loaded on the landing page (check if it's via Ahrefs tag or separate).

```javascript
// Events to instrument:
// preview_cta_clicked       — hero button click (Step 4)
// preview_filter_submitted  — search button click (Step 2)
// preview_results_shown     — results rendered (Step 2)
// preview_signup_clicked    — any signup button in preview (Step 2)
// preview_rate_limited      — 2 queries used (Step 2)
// walkthrough_viewed        — IntersectionObserver on carousel
// walkthrough_swiped        — scroll event on carousel track
// walkthrough_cta_clicked   — final slide signup button
```

The JS snippets in Steps 2, 4, 5 already include PostHog calls. This step is verification + adding any missing events.

### Step 8: Polish + testing (0.5 day)

- Loading spinner on search button while waiting for Edge Function response
- Error state if Edge Function is down ("Preview temporarily unavailable")
- Empty state if 0 results ("No jobs found — try broader keywords")
- Mobile testing: preview inputs stack vertically, stat cards 2×2 grid, carousel swipe works
- Verify no Supabase anon key is used for preview queries (Edge Function only)
- Verify truncated titles contain no company names or IDs

---

## Acceptance Criteria

### Edge Function
- [ ] `preview-jobs` Edge Function deployed and responding
- [ ] Accepts POST with `keyword`, `location`, `remote`, `session_token`
- [ ] Returns `total`, `median_salary`, `remote_pct`, `companies`, `titles`, `queries_remaining`, `session_token`
- [ ] Titles truncated at 35 characters server-side
- [ ] No company names in response
- [ ] No job IDs, URLs, or apply links in response
- [ ] Max 10 titles returned (random sample)
- [ ] Rate limit: 2 queries per session token
- [ ] Session tokens expire after 30 minutes
- [ ] Returns `rate_limited` error after 2 queries
- [ ] CORS restricted to `https://brilliantjobs.app`
- [ ] Input validation on all fields

### Interactive Preview
- [ ] Static filter demo (L762-774) replaced with interactive version
- [ ] Keyword + Location + Remote toggle inputs functional
- [ ] Search button calls Edge Function (not Supabase directly)
- [ ] Stat cards populate with real aggregated data
- [ ] Teaser job titles render with "Sign up to reveal" for company column
- [ ] After 2 queries, filter inputs disabled, locked message shown
- [ ] Signup buttons in preview section open signup modal
- [ ] No Supabase anon key used for preview queries

### Hero
- [ ] "See Jobs in Your Field ↓" ghost button added to hero CTAs
- [ ] Button smooth-scrolls to preview section

### Walkthrough Carousel
- [ ] 5 screenshot slides + 1 CTA slide
- [ ] CSS scroll-snap navigation works
- [ ] Navigation dots present and functional
- [ ] Lazy-loaded images (`loading="lazy"`)
- [ ] Final slide has signup CTA
- [ ] Responsive on mobile (swipe works)

### PostHog
- [ ] All 8 Phase 1 events instrumented and firing

### Security
- [ ] No Supabase client query from public page for preview data
- [ ] Edge Function is sole data gateway
- [ ] Server-side rate limiting (not client-side)
- [ ] Titles obfuscated server-side (never sent full)
- [ ] No company names leak to client

---

## What NOT to Build in Phase 1

| Deferred to Phase 2 | Reason |
|---------------------|--------|
| Visit counter (`bj_visits`) | Phase 2 |
| `bj_has_account` localStorage flag | Phase 2 |
| Visitor segment detection | Phase 2 |
| Hero variants per segment | Phase 2 |
| Auto-redirect for active users | Phase 2 |
| Lapsed user reactivation flow | Phase 2 |
| Objection FAQ section | Phase 2 |
| `data-segment` CSS attribute | Phase 2 |

---

## Open Questions (Pod 2 decides)

1. **Session token storage:** In-memory Map in Edge Function is fine for v1. Cold starts reset the Map, but worst case a user gets 2 extra queries — acceptable.
2. **Location matching:** Exact `loc_city`/`loc_state` match for v1. No radius matching on preview — save for post-signup.
3. **Screenshot pipeline:** CPO to produce screenshots from a demo account. Can deploy carousel with placeholder images and swap later. Don't block the preview feature on screenshots.
4. **PostHog verification:** Confirm PostHog is loaded independently on landing page (not just Ahrefs). If not, add the PostHog snippet.

---

*Pod 1 has provided all HTML, CSS, JS, and Edge Function specs. Pod 2 executes. Security requirements (server-side truncation, no company names, rate limiting, no anon key for preview) are non-negotiable.*
