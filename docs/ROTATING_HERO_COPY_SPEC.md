# Brilliant Jobs — Rotating Hero Copy Spec

**Status:** Design complete, ready to build
**Phase:** Landing page polish (pre-launch)
**Priority:** P2 — High impact, low effort
**Affects:** `index.html` (landing page hero sections)
**Segments:** `returning` (unsigned), `lapsed` (signed up, logged out)

---

## OVERVIEW

Every time a visitor returns to brilliantjobs.app, the hero headline and subheadline should feel fresh. Instead of a static "Welcome back" message, the landing page draws from a large bank of rotating copy — funny, encouraging, self-aware lines that make the brand feel alive and human.

Core principle: **The landing page should never feel stale.** Returning visitors who see the same static copy on visit 2, 3, 10 lose the sense that the product is active and worth coming back to. Rotating copy creates a "what will it say this time?" micro-delight.

### Why This Matters

- **Unsigned returning visitors** are the highest-leverage conversion opportunity — they came back voluntarily but haven't committed. Fresh, personality-driven copy keeps them engaged.
- **Lapsed registered users** need a reason to log back in. A clever line hits different than "Welcome back."
- **Brand differentiation** — job search is miserable. A product that makes you smile before you even log in is memorable.

---

## VISITOR SEGMENTS & COPY POOLS

The existing segment detection (`index.html` v4.02) already identifies four visitor types. Rotating copy applies to two of them:

| Segment | Trigger | Rotating Copy? | Current Hero |
|---------|---------|---------------|--------------|
| `new` | First visit (`bj_visits === 0`) | **No** — static pitch | "The job search for people who are done with job boards." |
| `returning` | Repeat visit, no account (`bj_visits >= 1`) | **Yes** — Pool A | "See what's new since your last visit." |
| `lapsed` | Has account, no active session | **Yes** — Pool B | "Welcome back. Your search continues." |
| `active` | Active Supabase session | **No** — redirects to `/dashboard` | N/A |

### Pool A: Returning Visitors (Not Signed Up)

Tone: Funny, encouraging, slightly cheeky. These people know what the product is — the copy should feel like a friend who's rooting for them, not a sales pitch.

### Pool B: Lapsed Registered Users

Tone: Warmer, more personal. These people already committed once — the copy acknowledges the relationship and gently pulls them back in.

---

## COPY BANK

### Pool A — Returning Unsigned Visitors

**Format:** Each entry is a `{ h1, sub }` pair. The `h1` supports `<br>` and `<span class="accent">...</span>` for the accent-colored line.

```javascript
const POOL_A = [
  // — Persistence & coming back —
  {
    h1: 'You came back.<br><span class="accent">We respect that energy.</span>',
    sub: 'Still exploring? Good. {JOBS} jobs from {COMPANIES} company career pages — with salary data most sites won\'t show you.'
  },
  {
    h1: 'Oh hey,<br><span class="accent">you again.</span>',
    sub: 'We\'ve been adding jobs since your last visit. {JOBS} and counting — all from real company career pages.'
  },
  {
    h1: 'Back for<br><span class="accent">another look?</span>',
    sub: 'Smart move. {JOBS} jobs, salary data they don\'t want you to see, and zero sponsored listings. Take your time.'
  },
  {
    h1: 'Still thinking<br><span class="accent">about it?</span>',
    sub: 'No pressure. But {JOBS} jobs from {COMPANIES} company career pages are waiting — and we track which employers actually respond.'
  },
  {
    h1: 'We saved<br><span class="accent">your spot.</span>',
    sub: 'Not literally — we don\'t track you. But the {JOBS} jobs and salary data are still here whenever you\'re ready.'
  },
  {
    h1: 'Look who\'s<br><span class="accent">back in action.</span>',
    sub: 'The job market hasn\'t magically fixed itself yet, but {JOBS} real jobs with actual salary data is a decent start.'
  },

  // — Job search empathy —
  {
    h1: 'The job search is<br><span class="accent">still broken.</span>',
    sub: 'But at least we\'re honest about it. {JOBS} jobs from {COMPANIES} career pages, with ghost rate tracking so you know who actually responds.'
  },
  {
    h1: 'Job boards don\'t<br><span class="accent">care about you.</span>',
    sub: 'We do. That\'s why we pull {JOBS} jobs directly from company career pages, extract salary data, and track employer responsiveness.'
  },
  {
    h1: 'Your next job isn\'t<br><span class="accent">on a job board.</span>',
    sub: 'It\'s on a company career page. We monitor {COMPANIES} of them and pull {JOBS} jobs with salary data and ghost rates.'
  },
  {
    h1: 'You deserve better<br><span class="accent">than Indeed.</span>',
    sub: '{JOBS} jobs from real career pages. Salary data they hide. Ghost rates they\'d rather you didn\'t see. No sponsored posts. Ever.'
  },
  {
    h1: 'Applying into<br><span class="accent">the void?</span>',
    sub: 'Not here. We track which companies actually respond. {JOBS} jobs from {COMPANIES} career pages, with the data you need to search smarter.'
  },

  // — Encouragement —
  {
    h1: 'Finding a job is hard.<br><span class="accent">We make it less hard.</span>',
    sub: 'Not easy — we won\'t lie to you. But {JOBS} real jobs with salary data and ghost rate tracking? That\'s a solid head start.'
  },
  {
    h1: 'You\'re closer<br><span class="accent">than you think.</span>',
    sub: '{JOBS} jobs from {COMPANIES} company career pages. Filter by salary, seniority, location — and see which companies actually respond.'
  },
  {
    h1: 'This is the visit<br><span class="accent">where it clicks.</span>',
    sub: 'Maybe not — but {JOBS} jobs with salary data and ghost rate tracking gives you a real edge. Free to start.'
  },
  {
    h1: 'Something good is<br><span class="accent">about to happen.</span>',
    sub: 'We can feel it. Or maybe that\'s just the {JOBS} jobs from {COMPANIES} career pages we\'ve indexed. Either way, you\'re in the right place.'
  },
  {
    h1: 'Your resume is<br><span class="accent">better than you think.</span>',
    sub: 'Seriously. Create a free account and we\'ll score it against {JOBS} real job descriptions with AI-powered matching.'
  },

  // — Product differentiation —
  {
    h1: 'No sponsored jobs.<br><span class="accent">No pay-to-play.</span>',
    sub: 'Just {JOBS} real listings from {COMPANIES} company career pages. We work for job seekers, not employers.'
  },
  {
    h1: 'What if job search<br><span class="accent">wasn\'t terrible?</span>',
    sub: 'Radical idea, we know. {JOBS} jobs with extracted salary data, ghost rate tracking, and AI resume scoring. Free to try.'
  },
  {
    h1: 'Built for you,<br><span class="accent">not for recruiters.</span>',
    sub: 'No boosted listings, no hidden employers. {JOBS} jobs from {COMPANIES} career pages with the salary data and response rates you need.'
  },
  {
    h1: 'Every other site<br><span class="accent">is selling your clicks.</span>',
    sub: 'We don\'t. {JOBS} real jobs from real career pages, with salary data and employer accountability. That\'s the whole pitch.'
  },
  {
    h1: 'We show you who<br><span class="accent">ghosts applicants.</span>',
    sub: 'Controversial? Maybe. Necessary? Absolutely. {JOBS} jobs from {COMPANIES} career pages — with the transparency the job market needs.'
  },

  // — Humor/personality —
  {
    h1: 'Still free.<br><span class="accent">Still no ads.</span>',
    sub: 'We didn\'t suddenly become a regular job board while you were gone. {JOBS} real jobs, salary data, ghost rates. Same deal.'
  },
  {
    h1: 'Plot twist:<br><span class="accent">the job search gets better.</span>',
    sub: '{JOBS} jobs from {COMPANIES} career pages. Salary data. Ghost rate tracking. AI resume scoring. The plot thickens.'
  },
  {
    h1: 'Your future employer<br><span class="accent">is in here somewhere.</span>',
    sub: 'Hiding among {JOBS} jobs from {COMPANIES} company career pages. Let\'s go find them. Free to start.'
  },
  {
    h1: 'Third time\'s<br><span class="accent">the charm, right?</span>',
    sub: 'Or fourth. Or fifth. We don\'t judge. {JOBS} jobs with salary data and ghost rate tracking, whenever you\'re ready.'
  },
  {
    h1: 'Not to be dramatic,<br><span class="accent">but we missed you.</span>',
    sub: 'The {JOBS} jobs didn\'t go anywhere, but they\'d love for you to browse them. Salary data and ghost rates included.'
  },

  // — Urgency (light touch) —
  {
    h1: 'New jobs added<br><span class="accent">since you were here.</span>',
    sub: 'We refresh {COMPANIES} career pages continuously. {JOBS} active jobs right now — with salary data and ghost rate tracking.'
  },
  {
    h1: 'The market moves<br><span class="accent">while you wait.</span>',
    sub: 'New listings, closed listings, salary changes — it\'s all tracked across {JOBS} jobs from {COMPANIES} career pages.'
  },
  {
    h1: 'Jobs are closing<br><span class="accent">every day.</span>',
    sub: 'New ones open too. We track it all — {JOBS} active jobs from {COMPANIES} career pages, refreshed continuously.'
  },

  // — Deep visit (visits >= 3) extras —
  {
    h1: 'At this point<br><span class="accent">you should just sign up.</span>',
    sub: 'You clearly like us. We like you too. Free account, {JOBS} jobs, salary data, ghost rates, AI resume scoring. Come on.'
  },
  {
    h1: 'We admire<br><span class="accent">your persistence.</span>',
    sub: 'But imagine what you could do with saved filters, resume scoring, and real-time alerts instead of just browsing. Free to try.'
  },
  {
    h1: 'You\'ve visited<br><span class="accent">more than your parents call.</span>',
    sub: 'Just saying. A free account takes 30 seconds and unlocks saved filters, resume scoring, and job alerts across {JOBS} jobs.'
  },
  {
    h1: 'Okay, this is<br><span class="accent">getting serious.</span>',
    sub: 'Multiple visits, no account? Bold strategy. {JOBS} jobs with salary data are waiting — and they\'re free.'
  },
  {
    h1: 'We\'re not counting<br><span class="accent">your visits. (We are.)</span>',
    sub: 'And we\'re flattered. Create a free account to save filters, score resumes, and get alerts across {JOBS} jobs.'
  }
];
```

### Pool B — Lapsed Registered Users

```javascript
const POOL_B = [
  // — Warm welcome back —
  {
    h1: 'Hey, remember us?<br><span class="accent">We remember you.</span>',
    sub: 'Your filters and saved jobs are right where you left them. New jobs have been added since your last visit.'
  },
  {
    h1: 'Welcome back.<br><span class="accent">We kept the lights on.</span>',
    sub: 'Your dashboard, your filters, your pipeline — all waiting. Plus new jobs added since you were last here.'
  },
  {
    h1: 'Missed you.<br><span class="accent">Not in a weird way.</span>',
    sub: 'Your account is right where you left it. Log in to see what\'s new in your job market.'
  },
  {
    h1: 'Your search<br><span class="accent">didn\'t stop while you were gone.</span>',
    sub: 'New jobs matching your filters have been rolling in. Log in to see what you\'ve missed.'
  },
  {
    h1: 'Good news:<br><span class="accent">we didn\'t delete anything.</span>',
    sub: 'Your filters, resumes, and pipeline are all intact. Bad news: you still need a job. Let\'s fix that.'
  },

  // — Light urgency —
  {
    h1: 'New matches<br><span class="accent">since your last visit.</span>',
    sub: 'Jobs matching your saved filters have been added. Log in to see what\'s fresh — some may close soon.'
  },
  {
    h1: 'Things have changed<br><span class="accent">since you were here.</span>',
    sub: 'New listings, closed listings, salary updates — your dashboard has the full picture. Log in to catch up.'
  },
  {
    h1: 'The job market<br><span class="accent">didn\'t wait for you.</span>',
    sub: 'But your saved filters did. Log in to see new matches, updated salaries, and which companies are hiring now.'
  },

  // — Encouragement —
  {
    h1: 'Ready for<br><span class="accent">round two?</span>',
    sub: 'Your filters and pipeline are warmed up. New jobs have landed since your last session. Let\'s go.'
  },
  {
    h1: 'The best time to search<br><span class="accent">was yesterday.</span>',
    sub: 'The second best time is right now. Your dashboard has new matches waiting.'
  },
  {
    h1: 'Pick up<br><span class="accent">where you left off.</span>',
    sub: 'Your saved filters, resume scores, and pipeline are all here. New jobs have been added since your last visit.'
  },
  {
    h1: 'Let\'s get you<br><span class="accent">back in the game.</span>',
    sub: 'Your account is ready. New jobs are in. Log in and let\'s find your next role.'
  },
  {
    h1: 'Taking a break<br><span class="accent">is totally valid.</span>',
    sub: 'But when you\'re ready, your filters and pipeline are exactly where you left them. New jobs are waiting.'
  },

  // — Humor —
  {
    h1: 'Still employed?<br><span class="accent">Congrats.</span>',
    sub: 'But if you\'re browsing, your dashboard has new matches since your last visit. No judgment — we get it.'
  },
  {
    h1: 'Plot twist:<br><span class="accent">you\'re back.</span>',
    sub: 'And your job search data is exactly where you left it. New listings, updated ghost rates, fresh salary data — all in your dashboard.'
  },
  {
    h1: 'Absence makes<br><span class="accent">the heart grow fonder.</span>',
    sub: 'And the inbox grow fuller. New matches are waiting in your dashboard. Welcome back.'
  },
  {
    h1: 'We didn\'t<br><span class="accent">unsubscribe you.</span>',
    sub: 'Your account, your filters, your data — all here. Log in to see what\'s changed in your job market.'
  },
  {
    h1: 'You ghosted us.<br><span class="accent">We get it.</span>',
    sub: 'Unlike some employers we track, we won\'t hold it against you. Your dashboard is waiting.'
  }
];
```

---

## TECHNICAL IMPLEMENTATION

### Architecture

```
index.html (existing)
├── Segment detection script (already exists, runs in <head>)
├── NEW: Copy rotation script (runs after segment detection)
│   ├── Reads segment from data-segment attribute
│   ├── Reads visit count from bj_visits
│   ├── Selects pool (A or B)
│   ├── Picks entry using rotation logic
│   └── Injects h1 + sub into DOM
├── Hero sections (existing, modified)
│   ├── segment-new: UNCHANGED (static)
│   ├── segment-returning: h1 + sub become injection targets
│   ├── segment-lapsed: h1 + sub become injection targets
│   └── segment-active: UNCHANGED (redirect)
```

### Selection Algorithm

**Goal:** No repeats until pool is exhausted. Weighted toward newer entries to keep the feel fresh as the pool grows.

```javascript
(function() {
  var segment = document.documentElement.getAttribute('data-segment');
  if (segment !== 'returning' && segment !== 'lapsed') return;

  var pool = segment === 'returning' ? POOL_A : POOL_B;
  var storageKey = 'bj_hero_seen_' + segment;
  var visits = parseInt(localStorage.getItem('bj_visits') || '1', 10);
  var isDeep = visits >= 3;

  // Track which indices have been shown
  var seen = [];
  try { seen = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch(e) {}

  // Filter pool: deep-visit entries (last 5 in Pool A) only shown for visits >= 3
  var available = pool.map(function(entry, i) { return i; });
  if (segment === 'returning' && !isDeep) {
    // Exclude the last 5 entries (deep-visit specific)
    available = available.slice(0, pool.length - 5);
  }

  // Remove already-seen indices
  var unseen = available.filter(function(i) { return seen.indexOf(i) === -1; });

  // If all seen, reset
  if (unseen.length === 0) {
    seen = [];
    unseen = available.slice();
    localStorage.removeItem(storageKey);
  }

  // Pick random from unseen
  var pick = unseen[Math.floor(Math.random() * unseen.length)];
  seen.push(pick);
  localStorage.setItem(storageKey, JSON.stringify(seen));

  var entry = pool[pick];

  // Inject into DOM — targeting the appropriate hero section
  var heroSelector = segment === 'returning'
    ? '.segment-returning'
    : '.segment-lapsed';
  var heroEl = document.querySelector('section' + heroSelector);
  if (!heroEl) return;

  var h1El = heroEl.querySelector('h1');
  var subEl = heroEl.querySelector('.hero-sub');

  if (h1El) h1El.innerHTML = entry.h1;
  if (subEl) {
    // Replace {JOBS} and {COMPANIES} placeholders with live stat spans
    var subHtml = entry.sub
      .replace('{JOBS}', '<span id="lp-hero-jobs-rot">—</span>')
      .replace('{COMPANIES}', '<span id="lp-hero-companies-rot">—</span>');
    subEl.innerHTML = subHtml;
  }
})();
```

### Live Stats Hydration

The existing landing page already fetches live Supabase stats and injects them into `#lp-hero-jobs` and `#lp-hero-companies`. After copy rotation, the stat spans have new IDs (`lp-hero-jobs-rot`, `lp-hero-companies-rot`). Add hydration for these in the existing stats fetch:

```javascript
// Add to the existing stats hydration function:
var rotJobs = document.getElementById('lp-hero-jobs-rot');
var rotCompanies = document.getElementById('lp-hero-companies-rot');
if (rotJobs) rotJobs.textContent = formatNumber(jobCount);
if (rotCompanies) rotCompanies.textContent = formatNumber(companyCount);
```

### HTML Changes

Minimal. The existing `segment-returning` and `segment-lapsed` hero sections keep their structure. The rotation script overwrites the `h1` and `.hero-sub` content after the DOM is ready. No new HTML elements needed.

The existing static content serves as a **fallback** — if JS fails or localStorage is unavailable, users see the original copy. Progressive enhancement.

### localStorage Keys

| Key | Type | Purpose |
|-----|------|---------|
| `bj_hero_seen_returning` | JSON array of ints | Indices already shown to this returning visitor |
| `bj_hero_seen_lapsed` | JSON array of ints | Indices already shown to this lapsed user |

These are lightweight (a few bytes each) and self-resetting when the pool is exhausted.

---

## MANAGING THE COPY BANK

### Adding New Entries

Append to the end of the appropriate pool array. The rotation system handles the rest — new entries are automatically included in the unseen pool.

### Seasonal / Timely Entries

For time-sensitive copy (e.g., New Year, back-to-school, end-of-quarter hiring surge), add entries with a `season` flag and filter in the selection logic:

```javascript
{
  h1: 'New year,<br><span class="accent">new job?</span>',
  sub: 'January is the biggest hiring month. {JOBS} active jobs from {COMPANIES} career pages — get in early.',
  season: { month: [1], label: 'january' }
}
```

This is a **post-launch enhancement** — not needed for v1. The spec includes it for future extensibility.

### A/B Testing (Future)

The rotation system naturally supports A/B testing via PostHog. Emit an event on each copy display:

```javascript
// PostHog event (if posthog is loaded)
if (window.posthog) {
  posthog.capture('hero_copy_shown', {
    segment: segment,
    copy_index: pick,
    copy_h1_preview: entry.h1.replace(/<[^>]*>/g, '').substring(0, 50),
    visit_number: visits
  });
}
```

This lets you measure which headlines correlate with higher signup rates.

---

## POSTHOG EVENTS

| Event | Properties | Purpose |
|-------|-----------|---------|
| `hero_copy_shown` | `segment`, `copy_index`, `copy_h1_preview`, `visit_number` | Track which copy was displayed |
| `hero_copy_signup_click` | `segment`, `copy_index`, `visit_number` | Track signup clicks per copy variant |

Wire `hero_copy_signup_click` to the existing signup button click handlers in the `segment-returning` and `segment-lapsed` hero sections.

---

## COPY GUIDELINES FOR FUTURE ADDITIONS

When adding new entries to the pools, follow these rules:

1. **Keep h1 to 2–3 lines.** The `<br>` break should create a natural reading rhythm. The `<span class="accent">` line is the punchline.

2. **Subheadlines are 1–2 sentences max.** They ground the headline with product value — stats, features, differentiators.

3. **Use `{JOBS}` and `{COMPANIES}` placeholders** in subs where specific numbers add credibility. These get replaced with live Supabase data.

4. **Never be mean.** Funny-encouraging, not funny-at-your-expense. The reader is probably stressed about their job search.

5. **Never sound desperate.** "Please sign up" energy kills the vibe. The product should feel confident and a little above it all.

6. **Don't repeat concepts across entries.** Check the existing pool before adding — if there's already a "ghosting" joke, don't add another one.

7. **Pool A (unsigned) can be more sales-forward.** These people haven't committed, so product-value messaging is appropriate.

8. **Pool B (lapsed) should be warmer.** These people already signed up — acknowledge the relationship, don't re-pitch.

9. **Deep-visit entries (last 5 in Pool A) can be more direct.** Someone on visit 5+ is clearly interested — it's okay to nudge harder.

10. **Test by reading it out loud.** If it sounds like a banner ad, rewrite it. If it sounds like something a smart friend would text you, ship it.

---

## SUCCESS METRICS

| Metric | Target | Measurement |
|--------|--------|-------------|
| Copy rotation working | 100% of returning/lapsed visitors see rotated copy | PostHog `hero_copy_shown` event fires |
| No repeat on consecutive visits | < 5% same-copy rate on visits n and n+1 | PostHog sequence analysis |
| Signup rate from returning visitors | ≥ baseline (no regression) | PostHog funnel: `hero_copy_shown` → signup |
| Qualitative brand perception | "This site has personality" in user feedback | Manual review of feedback submissions |

---

## BUILD ORDER

1. **Copy arrays** — Add `POOL_A` and `POOL_B` as inline `<script>` in `index.html`, after the segment detection script
2. **Rotation logic** — Add the selection + injection script (from Technical Implementation above)
3. **Stats hydration** — Add `lp-hero-jobs-rot` / `lp-hero-companies-rot` handling to the existing stats fetch
4. **PostHog events** — Add `hero_copy_shown` and wire signup click tracking
5. **QA** — Manual test: clear localStorage, visit multiple times, verify rotation, verify no console errors, verify fallback

**Estimated effort:** 1–2 hours for a developer familiar with the codebase. The copy is the hard part, and it's done.

---

## APPENDIX: ENTRY COUNTS

| Pool | Segment | Total Entries | Deep-Visit Only | Available (visits 1-2) | Available (visits 3+) |
|------|---------|--------------|-----------------|----------------------|---------------------|
| A | `returning` | 33 | 5 | 28 | 33 |
| B | `lapsed` | 18 | 0 | 18 | 18 |

At 28+ unique entries for returning visitors, a daily visitor won't see a repeat for almost a month. This pool should grow over time — target 50+ entries per pool within 3 months of launch.
