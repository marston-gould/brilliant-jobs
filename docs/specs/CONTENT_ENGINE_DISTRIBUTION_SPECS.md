# Content Engine — Phase 3 Blocker Deliverables: Distribution Design Specs

**From:** Pod 1 (Growth)
**Date:** February 25, 2026
**Purpose:** Unblock Pod 2 Phase 3 (Distribution — blog, index merchandising, Data Lab, dashboard cards, embeds)

---

## 1. Blog Design Spec

### Pages

**`/blog`** — Index page (list of published stories)
**`/blog/{slug}`** — Individual story page

### Theme
Light theme. Matches existing public data pages (salary-data, hiring-trends, etc.). Same font stack: Outfit for headings, system sans-serif for body, JetBrains Mono for data callouts.

### `/blog` — Index Layout

```
┌─────────────────────────────────────────────────────┐
│  NAV BAR (same as data pages — Data Lab, Blog, etc) │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Market Intelligence                                │
│  Data-driven insights from the job market,          │
│  updated daily.                                     │
│                                                     │
│  ┌─── FILTER PILLS ──────────────────────────────┐  │
│  │ All  Salary  Location  Remote  Company  Trend  │  │
│  └────────────────────────────────────────────────┘  │
│                                                     │
│  ┌─── STORY CARD ────────────────────────────────┐  │
│  │ [SALARY]              February 24, 2026       │  │
│  │                                               │  │
│  │ Remote PM Roles Up 15% — Now 34% of All       │  │
│  │ PM Postings                                   │  │
│  │                                               │  │
│  │ Remote product manager positions increased     │  │
│  │ 15% week-over-week, reaching 1,420 open...    │  │
│  │                                               │  │
│  │ [MINI CHART ~~~~~~~~]     Read more →         │  │
│  └────────────────────────────────────────────────┘  │
│                                                     │
│  ┌─── STORY CARD ────────────────────────────────┐  │
│  │ [LOCATION]            February 23, 2026       │  │
│  │ ...                                           │  │
│  └────────────────────────────────────────────────┘  │
│                                                     │
│  [Load more]                                        │
│                                                     │
├─────────────────────────────────────────────────────┤
│  SIGNUP CTA BANNER                                  │
│  "Get personalized market intelligence.             │
│   Sign up free →"                                   │
├─────────────────────────────────────────────────────┤
│  FOOTER (same as data pages)                        │
└─────────────────────────────────────────────────────┘
```

**Story card specs:**
- Category pill: colored badge, top-left (colors from category balance rules — green/salary, blue/location, purple/remote, orange/company, teal/trend, gold/milestone)
- Date: top-right, muted text, format "February 24, 2026"
- Headline: 18px Outfit semibold, max 2 lines
- Lede: 14px, muted, max 2 lines, truncated with ellipsis
- Mini chart: 120×60px static thumbnail of the story's chart (rendered as a small ECharts instance or a static SVG snapshot). Right-aligned on desktop, full-width on mobile.
- "Read more →" link: accent blue, bottom-right
- Card: white background, 1px border `var(--border)`, 8px radius, 16px padding. Subtle shadow on hover.
- Spacing: 16px between cards

**Pagination:** "Load more" button, loads next 10 stories. No infinite scroll.

**Filter pills:** Category filters (All, Salary, Location, Remote, Company, Trend). Active pill gets accent background. Filters the story list client-side from the already-fetched batch, with additional fetch if needed.

### `/blog/{slug}` — Story Page Layout

```
┌─────────────────────────────────────────────────────┐
│  NAV BAR                                            │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [SALARY]              February 24, 2026            │
│                                                     │
│  Remote PM Roles Up 15% — Now 34%                   │
│  of All PM Postings                                 │
│                                                     │
│  Remote product manager positions increased 15%     │
│  week-over-week, reaching 1,420 open roles.         │
│  Remote now accounts for 34% of all product         │
│  management postings tracked by Brilliant Jobs.     │
│                                                     │
│  ┌─── INLINE CHART (full width) ────────────────┐  │
│  │                                               │  │
│  │  [ECharts rendering from chart_config]        │  │
│  │  400px height, responsive width               │  │
│  │                                               │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  Body paragraph 1...                                │
│                                                     │
│  Body paragraph 2...                                │
│                                                     │
│  Body paragraph 3...                                │
│                                                     │
│  ┌─── SOURCE FOOTER ────────────────────────────┐  │
│  │  Source: Brilliant Jobs — real-time data from │  │
│  │  {N}+ positions across {N}+ companies.       │  │
│  │  [Explore the full data →] [Sign up free →]  │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌─── SHARE BAR ────────────────────────────────┐  │
│  │  Share: [LinkedIn] [X/Twitter] [Copy link]   │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌─── RELATED STORIES ──────────────────────────┐  │
│  │  More from Market Intelligence               │  │
│  │  [Card] [Card] [Card]                        │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
├─────────────────────────────────────────────────────┤
│  SIGNUP CTA BANNER                                  │
├─────────────────────────────────────────────────────┤
│  FOOTER                                             │
└─────────────────────────────────────────────────────┘
```

**Story page specs:**
- Headline: 28px Outfit bold (desktop), 22px (mobile)
- Lede: 16px, slightly bolder than body, sets up the finding
- Body: 15px, line-height 1.7, max-width 680px (readable measure)
- Inline chart: full content width, 400px height, ECharts rendered from `chart_config` JSON
- Source footer: light gray background, 13px, contains live job/company counts from Supabase
- Share bar: LinkedIn share URL, Twitter/X intent URL, copy-to-clipboard. Icons only, no text labels.
- Related stories: 3 most recent stories from a different category than the current one. Reuse story card component from index.

**SEO:**
- `<title>`: headline + " | Brilliant Jobs Market Intelligence"
- `<meta name="description">`: from `meta_description` field
- `<link rel="canonical">`: `https://brilliantjobs.app/blog/{slug}`
- `og:title`, `og:description` (from `social_snippet`), `og:type`: article, `og:image`: chart screenshot (if feasible, otherwise BJ logo)
- JSON-LD Article schema

**RSS:** `/blog/feed.xml` — standard RSS 2.0 with latest 20 stories. Title, link, description (lede), pubDate, category.

### Nav Bar Update

Add "Blog" (or "Intelligence") to the public page nav between "Data Lab" and "Help":

```
Data Lab  |  Blog  |  Help  |  Sign Up  |  Log In
```

Use "Blog" for now. Can rename to "Intelligence" or "Market Pulse" later if the content earns it.

---

## 2. Merchandising Placement Rules

Where editorial content surfaces beyond the blog.

### 2.1 Index Page — "Market Pulse" Section

**Placement:** After the "Job Boards vs Brilliant Jobs" comparison table, before the bottom CTA. This is mid-page content that shows the platform is alive and producing intelligence — not just a static landing page.

**Format:**
```
┌─────────────────────────────────────────────────┐
│  Market Pulse                                   │
│  Latest insights from our data                  │
│                                                 │
│  ┌──────┐  ┌──────┐  ┌──────┐                  │
│  │ Card │  │ Card │  │ Card │                   │
│  │      │  │      │  │      │                   │
│  └──────┘  └──────┘  └──────┘                  │
│                                                 │
│  See all insights →                             │
└─────────────────────────────────────────────────┘
```

**Card format (compact):**
- Category pill (small, 10px)
- Headline only (14px, 2 lines max)
- Key stat: one number pulled from `data_points` (e.g., "+15%", "$87K", "2,100 companies")
- Date (11px, muted)
- Entire card is clickable → `/blog/{slug}`

**Content rules:**
- Show latest 3 published stories
- Query: `content_stories WHERE status = 'published' ORDER BY published_at DESC LIMIT 3`
- If fewer than 3 stories exist, hide the entire section (don't show 1 lonely card)
- Refresh: on page load (no caching — this should always be fresh)
- No duplicate categories in the 3 visible cards if possible (if top 3 are all salary, show #1 salary, skip #2 salary, show #3 location, etc.)

### 2.2 Data Lab Hub — "Trending Insights" Section

**Placement:** Below the existing stat cards and above the page links grid. The Data Lab is where data-curious visitors land — editorial content reinforces that this is a living data source.

**Format:**
```
┌─────────────────────────────────────────────────┐
│  Trending Insights                              │
│                                                 │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐     │
│  │Card │ │Card │ │Card │ │Card │ │Card │      │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘     │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Card format (Data Lab variant):**
- Category pill
- Headline (14px, 2 lines)
- Key stat in large text (20px bold) — the single most impactful number from the story
- "Read →" link
- No date (Data Lab is about data, not recency)

**Content rules:**
- Show latest 5 published stories
- Horizontal scroll on mobile (CSS `overflow-x: auto`, `scroll-snap-type: x mandatory`)
- Same no-duplicate-category preference as index

### 2.3 Dashboard Insight Cards (Logged-In Users)

**Placement:** Top of the Jobs Feed page, above the filter bar. Collapsible section — user can dismiss with an "×" and it stays dismissed for that session (localStorage flag, resets daily).

**Format:**
```
┌─────────────────────────────────────────────────┐
│  📊 Market Intelligence                    [×]  │
│                                                 │
│  ┌───────────────────┐ ┌───────────────────┐   │
│  │ [SALARY]          │ │ [REMOTE]          │   │
│  │ SW Eng salaries   │ │ Remote PM roles   │   │
│  │ up 8% to $152K    │ │ now 34% of all    │   │
│  │ Read more →       │ │ Read more →       │   │
│  └───────────────────┘ └───────────────────┘   │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Card format (dashboard compact):**
- Category pill (tiny, 9px)
- Headline truncated to 1 line (13px)
- Key stat (15px bold) — the delta or primary number
- "Read more →" opens `/blog/{slug}` in new tab
- Card background: white card on the light dashboard, 1px border, 6px radius
- Max 2 cards side by side (desktop), stacked on mobile

**Content rules — Filter-Aware Matching:**
This is the personalization layer. Stories are matched to the user's saved filters:

```sql
-- Pseudocode for matching
SELECT cs.* FROM content_stories cs
WHERE cs.status = 'published'
AND (
  -- Match story tags against user's saved filter keywords
  EXISTS (
    SELECT 1 FROM user_filters uf
    WHERE uf.user_id = $user_id
    AND (
      cs.tags && ARRAY[uf.keyword_terms]  -- array overlap
      OR cs.data_points->>'location' ILIKE '%' || uf.location || '%'
      OR (uf.remote = true AND 'remote' = ANY(cs.tags))
    )
  )
)
ORDER BY cs.score DESC, cs.published_at DESC
LIMIT 2;
```

**Fallback:** If no filter-matched stories exist, show the 2 highest-scoring recent stories.

**Dismiss behavior:**
- Click "×" → hide section, set `localStorage.setItem('bj_insights_dismissed', Date.now())`
- On page load: if dismissed timestamp is from today, keep hidden. If from yesterday or earlier, show again.
- Individual card dismiss: click "×" on a card → add story ID to `localStorage` dismissed list → never show that story again

---

## 3. Dashboard Insight Card Format Spec

Detailed spec for Pod 2 to implement the dashboard cards.

### Card Component

```html
<div class="insight-card" data-story-id="{id}">
  <span class="insight-pill insight-pill--{category}">{CATEGORY}</span>
  <button class="insight-dismiss" aria-label="Dismiss">×</button>
  <div class="insight-headline">{headline, truncated 60 chars}</div>
  <div class="insight-stat">{key_stat}</div>
  <a href="/blog/{slug}" target="_blank" class="insight-link">Read more →</a>
</div>
```

### Key Stat Extraction

The "key stat" is the single most impactful number from `data_points`. Pod 2 extracts it with this priority:

1. If `data_points.pct_change` exists → format as "+15%" or "-8%"
2. If `data_points.salary_median` exists → format as "$145K"  
3. If `data_points.job_count` exists → format as "2,100 jobs"
4. If `data_points.remote_pct` exists → format as "34% remote"
5. Fallback: use the first numeric value in `data_points`

### CSS (add to `src/input.css`)

```css
.insight-section {
  margin-bottom: 16px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.insight-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
}
.insight-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (max-width: 640px) {
  .insight-grid { grid-template-columns: 1fr; }
}
.insight-card {
  position: relative;
  padding: 12px;
  background: var(--bg-page);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.insight-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.insight-pill--salary { background: #dcfce7; color: #166534; }
.insight-pill--location { background: #dbeafe; color: #1e40af; }
.insight-pill--remote { background: #f3e8ff; color: #6b21a8; }
.insight-pill--company { background: #ffedd5; color: #9a3412; }
.insight-pill--trend { background: #ccfbf1; color: #115e59; }
.insight-pill--milestone { background: #fef9c3; color: #854d0e; }
.insight-dismiss {
  position: absolute;
  top: 8px;
  right: 8px;
  background: none;
  border: none;
  color: var(--text-faint);
  cursor: pointer;
  font-size: 14px;
}
.insight-headline {
  margin: 8px 0 4px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--text);
}
.insight-stat {
  font-size: 15px;
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 6px;
}
.insight-link {
  font-size: 12px;
  color: var(--accent);
  text-decoration: none;
}
.insight-link:hover { text-decoration: underline; }
```

---

## 4. Embeddable Chart Brand Guidelines

### What Gets Embedded

Any chart from a published story or evergreen page can be embedded via `/embed/{chart-type}?params`. The embed renders the chart only — no nav, no header, no footer except the mandatory attribution bar.

### Attribution Bar (Mandatory, Cannot Be Removed)

Every embed includes a fixed-height attribution bar at the bottom:

```
┌─────────────────────────────────────────────┐
│  [Chart renders here]                       │
│                                             │
│                                             │
├─────────────────────────────────────────────┤
│  📊 Source: Brilliant Jobs                  │
│  brilliantjobs.app/data-lab     [View full] │
└─────────────────────────────────────────────┘
```

**Attribution bar specs:**
- Height: 32px fixed
- Background: `#f8fafc` (light gray)
- Border-top: 1px solid `#e2e8f0`
- Left: "📊" emoji + "Source: Brilliant Jobs" in 11px, color `#64748b`
- Right: "View full →" link in 11px accent blue, opens the source page in new tab
- The attribution bar is rendered inside the iframe and cannot be hidden by the embedder

### Embed URL Pattern

```
/embed/{chart-type}?{params}
```

Examples:
- `/embed/salary-by-role?role=software-engineer&range=90d`
- `/embed/job-volume?keyword=marketing&location=austin`
- `/embed/remote-pct?industry=tech&range=180d`
- `/embed/college-major-scatter` (no params, static chart)

### Embed Code Generator

On every data page and blog story, add a "Share this chart" button that reveals:

```html
<iframe 
  src="https://brilliantjobs.app/embed/salary-by-role?role=software-engineer" 
  width="100%" 
  height="450" 
  frameborder="0"
  title="Software Engineer Salary Trend — Brilliant Jobs">
</iframe>
```

**Button placement:** Below each chart, small text link: "📋 Embed this chart"
**Click behavior:** Reveals a text input with the iframe code, pre-selected for easy copy.

### Sizing

- Default: `width="100%"` (fills container), `height="450"` (chart 418px + attribution 32px)
- Minimum: 300×250 (chart will compress, attribution stays)
- Chart is responsive within the iframe via ECharts `resize()` on window resize

### CORS

```
Access-Control-Allow-Origin: *
X-Frame-Options: ALLOWALL
```

Embeds are intentionally open — we want backlinks from anyone embedding our charts.

### Backlink Requirement

The attribution bar's "View full →" link MUST point to the source page on brilliantjobs.app. This is non-negotiable — the entire point of embeds is earning backlinks. The link uses `target="_blank"` and `rel="noopener"`.

### What Cannot Be Embedded

- Dashboard charts (logged-in only data)
- Any chart containing individual user data
- Admin console charts

Only public page charts and blog story charts are embeddable.

---

## 5. Parameter Priority List (Phase 4 Blocker)

Derived from the keyword validation data. These are the single-parameter trend pages to batch-generate first:

### Role Trend Pages (by priority score)

| # | Parameter | URL | Target Keyword | Volume |
|---|-----------|-----|----------------|-------:|
| 1 | software-engineer | `/trends/software-engineer` | software engineer jobs | 49,500 |
| 2 | cybersecurity | `/trends/cybersecurity` | cybersecurity jobs | 90,500 |
| 3 | product-manager | `/trends/product-manager` | product manager jobs | 12,100 |
| 4 | data-engineer | `/trends/data-engineer` | data engineer jobs | 14,800 |
| 5 | marketing | `/trends/marketing` | marketing jobs remote | 18,100 |
| 6 | ai-machine-learning | `/trends/ai-machine-learning` | ai jobs, ML jobs | 21,000 |
| 7 | healthcare | `/trends/healthcare` | healthcare jobs | 22,200 |
| 8 | startup | `/trends/startup` | startup jobs | 8,100 |
| 9 | fintech | `/trends/fintech` | fintech jobs | 3,600 |
| 10 | ux-design | `/trends/ux-design` | UX designer salary | 8,100 |

### Remote Role Pages (by priority score)

| # | Parameter | URL | Target Keyword | Volume |
|---|-----------|-----|----------------|-------:|
| 1 | remote-software-engineer | `/remote/software-engineer` | remote software engineer jobs | 27,100 |
| 2 | remote-data-analyst | `/remote/data-analyst` | remote data analyst jobs | 18,100 |
| 3 | remote-marketing | `/remote/marketing` | marketing jobs remote | 18,100 |
| 4 | remote-product-manager | `/remote/product-manager` | remote product manager jobs | 4,400 |

### Salary Pages (by priority score)

| # | Parameter | URL | Target Keyword | Volume |
|---|-----------|-----|----------------|-------:|
| 1 | software-engineer | `/salary/software-engineer` | software engineer salary | 201,000 |
| 2 | product-manager | `/salary/product-manager` | product manager salary | 33,100 |
| 3 | data-scientist | `/salary/data-scientist` | data scientist salary | 22,200 |
| 4 | marketing-manager | `/salary/marketing-manager` | marketing manager salary | 18,100 |
| 5 | senior-software-engineer | `/salary/senior-software-engineer` | senior software engineer salary | 14,800 |
| 6 | ux-designer | `/salary/ux-designer` | UX designer salary | 8,100 |
| 7 | ml-engineer | `/salary/ml-engineer` | machine learning engineer salary | 4,400 |
| 8 | devops-engineer | `/salary/devops-engineer` | devops engineer salary | 2,900 |

### Comparison Pair Priority List

| # | Comparison | URL | Rationale |
|---|-----------|-----|-----------|
| 1 | Remote vs Office salary | `/compare/remote-vs-office` | "remote vs in office salary" + remote salary premium |
| 2 | Software Eng vs Product Mgr | `/compare/swe-vs-pm` | Two most popular career paths in tech |
| 3 | Startup vs Enterprise salary | `/compare/startup-vs-enterprise` | Common career decision point |
| 4 | Early career vs Mid career | `/compare/early-vs-mid-career` | Salary growth visualization |
| 5 | CS degree vs no degree | `/compare/degree-vs-no-degree` | Hot topic, ties into college outcomes page |

---

## What This Document Delivers

- ✅ Blog design spec (index + story page layouts, card formats, nav update, RSS, SEO)
- ✅ Merchandising placement rules (index "Market Pulse", Data Lab "Trending", content rules, dedup logic)
- ✅ Dashboard insight card format spec (HTML, CSS, filter-aware matching, dismiss behavior, key stat extraction)
- ✅ Embeddable chart brand guidelines (attribution bar, CORS, sizing, embed code generator, backlink requirements)
- ✅ Parameter priority list for batch trend page generation (Phase 4 blocker)
- ✅ Comparison pair priority list (Phase 4 blocker)

## Pod 1 Blocker Status — ALL COMPLETE

| Phase | Blocker | Status |
|-------|---------|--------|
| 1 | Keyword validation + page priority list | ✅ `CONTENT_ENGINE_KEYWORD_VALIDATION.md` |
| 1 | City pair priority list | ✅ In keyword validation doc |
| 2 | Editorial style guide | ✅ `CONTENT_ENGINE_EDITORIAL_RULES.md` |
| 2 | Anomaly thresholds (all 10 rules) | ✅ In editorial rules doc |
| 2 | Category balance rules | ✅ In editorial rules doc |
| 2 | Story templates (all 10 + 5 NY Fed) | ✅ In editorial rules + college outcomes docs |
| 3 | Blog design spec | ✅ This document |
| 3 | Merchandising placement rules | ✅ This document |
| 3 | Dashboard insight card format | ✅ This document |
| 3 | Embed brand guidelines | ✅ This document |
| 4 | Refresh cadence per page type | ✅ In keyword validation doc |
| 4 | Parameter priority list | ✅ This document |
| 4 | Comparison pair priority list | ✅ This document |

**Pod 2 is fully unblocked across all 4 phases.**
