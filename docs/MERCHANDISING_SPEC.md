# Brilliant Jobs — Merchandising System Spec

**Status:** Design complete, ready to build
**Phase:** Landing page polish + admin infrastructure (pre-launch)
**Priority:** P1 — Core operational capability
**Affects:** `roadmap.html` (new Merchandising tab), all public pages (starting with `index.html`), Supabase schema
**Replaces:** `ROTATING_HERO_COPY_SPEC.md` (hardcoded approach)

---

## OVERVIEW

The merchandising system enables database-driven, admin-managed rotating content across any page and any DOM element on the Brilliant Jobs site. Instead of hardcoded copy arrays in JavaScript, all rotating content lives in Supabase and is managed through a new **Merchandising** tab in the admin console (`roadmap.html`).

Each merchandising placement is defined by five dimensions:

| Dimension | Description | Example |
|-----------|-------------|---------|
| **Page URL** | Which page the content appears on | `/`, `/pricing`, `/about` |
| **Element ID** | The DOM target element | `hero-headline`, `cta-banner`, `social-proof` |
| **Element Name** | Human-readable label in admin | "Hero Rotating Copy", "Pricing CTA" |
| **Cohort** | Which cohort(s) see this configuration | `all`, `cohort_alpha`, `cohort_beta` |
| **Audience** | Which visitor segment sees this | `all`, `new`, `returning`, `lapsed`, `active` |

For any given combination of Page URL + Element ID + Cohort + Audience, the admin assigns **one or more rotating content entries**. The frontend fetches the applicable pool and rotates through it on each visit.

### Why This Replaces the Hardcoded Approach

The original spec (`ROTATING_HERO_COPY_SPEC.md`) stored 51 copy entries as inline JavaScript arrays. That approach was fine for a single hero section, but it doesn't scale:

- **No cohort targeting.** Every visitor in a segment saw the same pool.
- **Code deploys required.** Adding or editing a single line of copy meant pushing to GitHub.
- **Single page, single element.** Extending to other pages or other DOM locations meant duplicating the pattern.
- **No admin visibility.** Marston couldn't see, search, or manage the copy bank without reading source code.

The merchandising system solves all of these by making content management an admin operation, not a development task.

---

## DATABASE SCHEMA

### Table: `merch_placements`

Defines where content can appear. Each row is a unique targetable location on the site.

```sql
CREATE TABLE merch_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_url TEXT NOT NULL,                    -- e.g. '/', '/pricing'
  element_id TEXT NOT NULL,                  -- DOM id to target, e.g. 'hero-headline'
  element_name TEXT NOT NULL,                -- Human label, e.g. 'Hero Rotating Copy'
  element_description TEXT,                  -- Optional notes for admin context
  content_format JSONB NOT NULL DEFAULT '{"fields": ["h1", "sub"]}',  -- Defines the shape of content entries
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (page_url, element_id)
);

-- Seed the first placement
INSERT INTO merch_placements (page_url, element_id, element_name, element_description, content_format)
VALUES (
  '/',
  'hero-headline',
  'Hero Rotating Copy',
  'Main hero section h1 + subheadline on the landing page. Rotates per visit based on audience segment.',
  '{"fields": ["h1", "sub"], "supports_html": true, "placeholders": ["{JOBS}", "{COMPANIES}"]}'
);
```

**Notes:**
- `content_format` is a JSONB descriptor that tells the admin UI what fields to show when creating/editing content entries for this placement. For the hero, it's `h1` + `sub`. A future CTA banner might be `headline` + `button_text` + `button_url`.
- The `UNIQUE (page_url, element_id)` constraint prevents duplicate placements for the same DOM target.

### Table: `merch_rules`

Defines targeting rules — which cohort + audience combination gets which pool of content for a given placement.

```sql
CREATE TABLE merch_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id UUID NOT NULL REFERENCES merch_placements(id) ON DELETE CASCADE,
  cohort_id UUID REFERENCES cohort_definitions(id) ON DELETE SET NULL,  -- NULL = all cohorts
  audience TEXT NOT NULL DEFAULT 'all',       -- 'all', 'new', 'returning', 'lapsed', 'active'
  priority INTEGER NOT NULL DEFAULT 0,        -- Higher = evaluated first (for override logic)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (placement_id, cohort_id, audience)
);

-- Index for frontend lookup
CREATE INDEX idx_merch_rules_lookup ON merch_rules (placement_id, audience, is_active);

COMMENT ON COLUMN merch_rules.cohort_id IS 'NULL means this rule applies to all cohorts. Specific cohort_id takes priority over NULL.';
COMMENT ON COLUMN merch_rules.priority IS 'When multiple rules match (e.g. cohort-specific + all-cohorts), highest priority wins.';
```

### Table: `merch_content`

The actual rotating content entries. Each entry belongs to a rule and contains the content fields defined by the placement's `content_format`.

```sql
CREATE TABLE merch_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES merch_rules(id) ON DELETE CASCADE,
  content JSONB NOT NULL,                     -- e.g. {"h1": "You came back.<br>...", "sub": "Still exploring?..."}
  sort_order INTEGER NOT NULL DEFAULT 0,      -- For manual ordering in admin
  category TEXT,                              -- Optional grouping label, e.g. 'humor', 'urgency', 'empathy'
  min_visits INTEGER DEFAULT 0,               -- Only show after N visits (deep-visit gating)
  max_visits INTEGER,                         -- Stop showing after N visits (NULL = no limit)
  season JSONB,                               -- Optional: {"months": [1,2], "label": "new-year"}
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for frontend fetch
CREATE INDEX idx_merch_content_rule ON merch_content (rule_id, is_active, sort_order);

COMMENT ON COLUMN merch_content.content IS 'JSONB matching the content_format of the parent placement. For hero: {"h1": "...", "sub": "..."}';
COMMENT ON COLUMN merch_content.min_visits IS 'Deep-visit gating. Entry only appears if visitor has >= min_visits. 0 = always eligible.';
COMMENT ON COLUMN merch_content.season IS 'Seasonal filtering. NULL = always eligible. {"months": [12,1], "label": "winter"} = Dec+Jan only.';
```

### RLS Policies

```sql
-- merch_placements: public read, admin write
ALTER TABLE merch_placements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read active placements" ON merch_placements
  FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage placements" ON merch_placements
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- merch_rules: public read, admin write
ALTER TABLE merch_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read active rules" ON merch_rules
  FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage rules" ON merch_rules
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- merch_content: public read, admin write
ALTER TABLE merch_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read active content" ON merch_content
  FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage content" ON merch_content
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
```

### Entity Relationship

```
merch_placements (1) ──── (many) merch_rules (1) ──── (many) merch_content
     │                              │
     │ page_url                     │ cohort_id ──→ cohort_definitions
     │ element_id                   │ audience
     │ element_name                 │ priority
     │ content_format               │
```

---

## ADMIN CONSOLE: MERCHANDISING TAB

### Tab Position

Add **Merchandising** as a new tab in `roadmap.html`, positioned after the existing tabs:

```
Feed Health | Cohort Performance | SEO | Experience | Monetization | Merchandising
```

### Layout

The Merchandising tab uses a master-detail layout:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ MERCHANDISING                                                          │
├────────────────────────┬────────────────────────────────────────────────┤
│                        │                                                │
│  PLACEMENTS            │  PLACEMENT DETAIL                              │
│                        │                                                │
│  ┌──────────────────┐  │  Element: Hero Rotating Copy                   │
│  │ / hero-headline   │◄─│  Page: /    Element ID: hero-headline          │
│  │ Hero Rotating Copy│  │  Format: h1 + sub                             │
│  └──────────────────┘  │  Status: ● Active                              │
│                        │                                                │
│  ┌──────────────────┐  │  ─────────────────────────────────────────      │
│  │ / cta-banner      │  │                                                │
│  │ CTA Banner        │  │  RULES                    [+ Add Rule]        │
│  └──────────────────┘  │                                                │
│                        │  ┌─────────────────────────────────────────┐    │
│  [+ Add Placement]     │  │ All Cohorts × Returning   12 entries ▸ │    │
│                        │  │ All Cohorts × Lapsed      18 entries ▸ │    │
│                        │  │ Cohort Beta × Returning    5 entries ▸ │    │
│                        │  └─────────────────────────────────────────┘    │
│                        │                                                │
│                        │  ─────────────────────────────────────────      │
│                        │                                                │
│                        │  CONTENT ENTRIES (All Cohorts × Returning)      │
│                        │                                                │
│                        │  ┌───┬─────────────────────────┬────────────┐  │
│                        │  │ # │ h1 preview              │ category   │  │
│                        │  ├───┼─────────────────────────┼────────────┤  │
│                        │  │ 1 │ You came back. We res...│ persistence│  │
│                        │  │ 2 │ Oh hey, you again.      │ persistence│  │
│                        │  │ 3 │ Back for another look?  │ persistence│  │
│                        │  │...│                         │            │  │
│                        │  └───┴─────────────────────────┴────────────┘  │
│                        │                                                │
│                        │  [+ Add Entry]  [Bulk Import]                  │
│                        │                                                │
└────────────────────────┴────────────────────────────────────────────────┘
```

### Admin UI Components

#### 1. Placement List (Left Panel)

- Lists all `merch_placements` grouped by `page_url`
- Each card shows: page URL, element ID, element name, entry count, active/inactive badge
- Click to select → loads detail in right panel
- "Add Placement" button opens a form: page URL, element ID, element name, content format fields

#### 2. Placement Detail (Right Panel — Top)

- Shows selected placement metadata (read-only unless editing)
- Edit button toggles inline editing of element name, description, content format
- Active/inactive toggle with confirmation ("Deactivating will hide all content for this placement")

#### 3. Rules Section (Right Panel — Middle)

- Lists all `merch_rules` for the selected placement
- Each rule row shows: cohort name (or "All Cohorts"), audience segment, entry count, priority, active badge
- Click a rule to expand and show its content entries below
- "Add Rule" opens a form: cohort selector (dropdown from `cohort_definitions` + "All"), audience selector (dropdown: all/new/returning/lapsed/active), priority

#### 4. Content Entries Section (Right Panel — Bottom)

- Shows all `merch_content` for the selected rule
- Table columns: sort order, h1 preview (first 50 chars, HTML stripped), sub preview, category, min/max visits, active toggle
- Click a row to open an edit modal with full content fields
- Drag-and-drop reordering (updates `sort_order`)
- "Add Entry" opens a modal with fields matching the placement's `content_format`
- "Bulk Import" accepts JSON array for mass-loading content (used for initial migration of the 51 existing entries)

#### 5. Content Entry Edit Modal

```
┌─────────────────────────────────────────┐
│ Edit Content Entry                      │
│                                         │
│ h1:                                     │
│ ┌─────────────────────────────────────┐ │
│ │ You came back.<br><span class=      │ │
│ │ "accent">We respect that energy.    │ │
│ │ </span>                             │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ sub:                                    │
│ ┌─────────────────────────────────────┐ │
│ │ Still exploring? Good. {JOBS} jobs  │ │
│ │ from {COMPANIES} company career...  │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Category: [persistence    ▾]            │
│ Min visits: [0  ]  Max visits: [   ]    │
│ Season months: [          ]             │
│ Active: [✓]                             │
│                                         │
│ Preview:                                │
│ ┌─────────────────────────────────────┐ │
│ │ You came back.                      │ │
│ │ We respect that energy.             │ │
│ │                                     │ │
│ │ Still exploring? Good. 135,000 jobs │ │
│ │ from 7,500 company career pages...  │ │
│ └─────────────────────────────────────┘ │
│                                         │
│        [Cancel]  [Save]                 │
└─────────────────────────────────────────┘
```

The preview section renders the HTML with placeholders replaced by current live stats (fetched once on modal open).

---

## FRONTEND FETCH LOGIC

### How Pages Load Merchandising Content

Replace the hardcoded pool arrays with a single fetch-and-inject pattern that works on any page.

#### 1. Merchandising Client Script (`merch-client.js`)

This is a lightweight script included on every public page that supports merchandising. It runs after segment detection.

```javascript
/**
 * Brilliant Jobs Merchandising Client
 * Fetches and injects rotating content from Supabase.
 * Depends on: segment detection (data-segment attribute), bj_visits localStorage
 */
(function() {
  'use strict';

  var SUPABASE_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
  var SUPABASE_ANON = '...'; // anon key
  var PAGE_URL = window.location.pathname;  // e.g. '/'
  var SEGMENT = document.documentElement.getAttribute('data-segment') || 'new';
  var VISITS = parseInt(localStorage.getItem('bj_visits') || '0', 10);
  var COHORT_ID = localStorage.getItem('bj_cohort_id') || null;  // Set during signup/login

  // Fetch all active content for this page + segment
  // The query joins placements → rules → content and filters server-side
  async function fetchMerchContent() {
    try {
      var response = await fetch(
        SUPABASE_URL + '/rest/v1/rpc/get_merch_content',
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON,
            'Authorization': 'Bearer ' + SUPABASE_ANON,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            p_page_url: PAGE_URL,
            p_audience: SEGMENT,
            p_cohort_id: COHORT_ID,
            p_visit_count: VISITS,
            p_month: new Date().getMonth() + 1
          })
        }
      );

      if (!response.ok) return;
      var placements = await response.json();
      // placements = [{ element_id, content_entries: [{content, id}, ...] }, ...]

      placements.forEach(function(placement) {
        injectContent(placement.element_id, placement.content_entries);
      });
    } catch (e) {
      // Silent fail — static fallback content remains visible
      console.warn('Merch fetch failed:', e.message);
    }
  }

  // Select and inject one entry from the pool
  function injectContent(elementId, entries) {
    if (!entries || entries.length === 0) return;

    var storageKey = 'bj_merch_seen_' + elementId;
    var seen = [];
    try { seen = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch(e) {}

    // Filter out already-seen entries
    var unseen = entries.filter(function(e) { return seen.indexOf(e.id) === -1; });

    // Reset if all seen
    if (unseen.length === 0) {
      seen = [];
      unseen = entries.slice();
      localStorage.removeItem(storageKey);
    }

    // Random pick
    var pick = unseen[Math.floor(Math.random() * unseen.length)];
    seen.push(pick.id);
    localStorage.setItem(storageKey, JSON.stringify(seen));

    // Inject into DOM
    var content = pick.content;
    Object.keys(content).forEach(function(field) {
      // Convention: element_id + '-' + field = target element
      // e.g. element_id = 'hero-headline', field = 'h1' → target = hero-headline-h1
      // OR: use data attributes on children
      var target = document.getElementById(elementId + '-' + field);
      if (!target) {
        // Fallback: look for [data-merch-field="field"] inside the element
        var parent = document.getElementById(elementId);
        if (parent) target = parent.querySelector('[data-merch-field="' + field + '"]');
      }
      if (target) {
        var html = content[field]
          .replace('{JOBS}', '<span class="merch-stat" data-merch-stat="jobs">—</span>')
          .replace('{COMPANIES}', '<span class="merch-stat" data-merch-stat="companies">—</span>');
        target.innerHTML = html;
      }
    });

    // PostHog tracking
    if (window.posthog) {
      posthog.capture('merch_content_shown', {
        element_id: elementId,
        content_id: pick.id,
        page_url: PAGE_URL,
        segment: SEGMENT,
        visit_number: VISITS
      });
    }
  }

  // Run after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchMerchContent);
  } else {
    fetchMerchContent();
  }
})();
```

#### 2. Supabase RPC: `get_merch_content`

Server-side function that handles the join + filtering + priority resolution:

```sql
CREATE OR REPLACE FUNCTION get_merch_content(
  p_page_url TEXT,
  p_audience TEXT,
  p_cohort_id UUID DEFAULT NULL,
  p_visit_count INTEGER DEFAULT 0,
  p_month INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB := '[]'::JSONB;
BEGIN
  WITH matched_rules AS (
    -- Find all rules matching this page + audience + cohort
    -- Cohort-specific rules take priority over all-cohorts rules
    SELECT DISTINCT ON (p.id)
      p.id AS placement_id,
      p.element_id,
      r.id AS rule_id,
      r.priority
    FROM merch_placements p
    JOIN merch_rules r ON r.placement_id = p.id
    WHERE p.page_url = p_page_url
      AND p.is_active = true
      AND r.is_active = true
      AND (r.audience = 'all' OR r.audience = p_audience)
      AND (r.cohort_id IS NULL OR r.cohort_id = p_cohort_id)
    ORDER BY p.id,
      -- Prefer specific cohort over all-cohorts
      CASE WHEN r.cohort_id IS NOT NULL THEN 0 ELSE 1 END,
      -- Prefer specific audience over 'all'
      CASE WHEN r.audience != 'all' THEN 0 ELSE 1 END,
      -- Then by explicit priority
      r.priority DESC
  ),
  filtered_content AS (
    SELECT
      mr.element_id,
      jsonb_build_object(
        'id', c.id,
        'content', c.content,
        'category', c.category
      ) AS entry
    FROM matched_rules mr
    JOIN merch_content c ON c.rule_id = mr.rule_id
    WHERE c.is_active = true
      AND c.min_visits <= p_visit_count
      AND (c.max_visits IS NULL OR c.max_visits >= p_visit_count)
      AND (
        c.season IS NULL
        OR p_month = ANY(
          SELECT jsonb_array_elements_text(c.season -> 'months')::INTEGER
        )
      )
    ORDER BY c.sort_order
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'element_id', element_id,
      'content_entries', entries
    )
  )
  INTO result
  FROM (
    SELECT element_id, jsonb_agg(entry) AS entries
    FROM filtered_content
    GROUP BY element_id
  ) grouped;

  RETURN COALESCE(result, '[]'::JSONB);
END;
$$;
```

---

## RULE RESOLUTION LOGIC

When multiple rules could match a visitor, the system resolves conflicts using this priority cascade:

1. **Cohort-specific + audience-specific** (e.g., Cohort Beta × Returning) — highest priority
2. **Cohort-specific + audience 'all'** (e.g., Cohort Beta × All)
3. **All cohorts + audience-specific** (e.g., All × Returning)
4. **All cohorts + audience 'all'** (e.g., All × All) — lowest priority (catch-all)

Within the same specificity tier, the `priority` column breaks ties (higher wins).

This means you can set up a default pool for all returning visitors, then override it for a specific cohort to test different messaging — without touching the default.

---

## HTML INTEGRATION

### Landing Page (`index.html`)

The existing hero sections get `data-merch-field` attributes to make them injection targets:

```html
<!-- Returning visitor hero (already exists, add data attributes) -->
<section class="segment-returning" style="display:none">
  <div id="hero-headline">
    <h1 data-merch-field="h1">See what's new since your last visit.</h1>
    <p class="hero-sub" data-merch-field="sub">
      Your next opportunity might have just been posted.
    </p>
  </div>
  <!-- CTA button unchanged -->
</section>

<!-- Lapsed user hero -->
<section class="segment-lapsed" style="display:none">
  <div id="hero-headline-lapsed">
    <h1 data-merch-field="h1">Welcome back. Your search continues.</h1>
    <p class="hero-sub" data-merch-field="sub">
      Your filters and saved jobs are right where you left them.
    </p>
  </div>
</section>
```

The static content remains as a **progressive enhancement fallback** — if the merchandising fetch fails, visitors see the default copy.

### Future Pages

Any page can opt into merchandising by:
1. Adding `data-merch-field` attributes to target elements
2. Including the `merch-client.js` script
3. Registering the placement in the admin console

No code changes needed on the merchandising system itself — just register the new placement and start adding content.

---

## DATA MIGRATION

### Migrating Existing Copy Bank

The 51 entries from the original `ROTATING_HERO_COPY_SPEC.md` (33 Pool A + 18 Pool B) need to be migrated into the new schema. This is a one-time operation via the admin "Bulk Import" feature or a migration script.

**Migration mapping:**

| Original | New Schema |
|----------|-----------|
| Pool A entries | `merch_content` rows under rule: placement=`hero-headline`, cohort=`NULL` (all), audience=`returning` |
| Pool A deep-visit entries (last 5) | Same rule, with `min_visits = 3` |
| Pool B entries | `merch_content` rows under rule: placement=`hero-headline`, cohort=`NULL` (all), audience=`lapsed` |
| Entry categories (persistence, empathy, etc.) | `merch_content.category` column |

The migration script should preserve the original ordering as `sort_order` values.

---

## POSTHOG EVENTS

| Event | Properties | Purpose |
|-------|-----------|---------|
| `merch_content_shown` | `element_id`, `content_id`, `page_url`, `segment`, `visit_number`, `cohort_id` | Track which content was displayed |
| `merch_content_click` | `element_id`, `content_id`, `page_url`, `action` | Track CTA clicks tied to specific content |

Wire `merch_content_click` to signup/login buttons within merchandised sections.

---

## ADMIN CONSOLE IMPLEMENTATION

### File Changes

All admin UI lives in `roadmap.html`. Add the Merchandising tab following existing patterns:

1. **Tab button** in the admin tab bar
2. **Tab panel** with the master-detail layout described above
3. **JavaScript functions** for CRUD operations against `merch_placements`, `merch_rules`, `merch_content` via Supabase client (service role in admin context)

### Admin Operations

| Operation | Table | Notes |
|-----------|-------|-------|
| List placements | `merch_placements` | Grouped by `page_url`, sorted by `element_name` |
| Add placement | `merch_placements` | Form: page_url, element_id, element_name, content_format |
| Edit placement | `merch_placements` | Inline edit name, description, format. Toggle active. |
| Delete placement | `merch_placements` | Confirmation required. CASCADE deletes rules + content. |
| List rules | `merch_rules` | Filtered by selected placement. Shows cohort name, audience, entry count. |
| Add rule | `merch_rules` | Form: cohort (dropdown from `cohort_definitions` + "All"), audience (dropdown), priority |
| Edit rule | `merch_rules` | Change cohort, audience, priority, active toggle |
| Delete rule | `merch_rules` | Confirmation. CASCADE deletes content entries. |
| List content | `merch_content` | Filtered by selected rule. Table with preview, category, visits, active. |
| Add content entry | `merch_content` | Modal with fields from placement's `content_format` |
| Edit content entry | `merch_content` | Same modal, pre-populated |
| Delete content entry | `merch_content` | Confirmation |
| Reorder content | `merch_content` | Drag-and-drop → batch update `sort_order` |
| Bulk import | `merch_content` | Accepts JSON array, creates entries under selected rule |
| Toggle active | All tables | Quick toggle without full edit flow |

### Admin CSS

Follow existing admin console patterns — light theme, card-based layout, consistent with Feed Health / Cohort Performance tabs. Use existing design tokens and Tailwind utilities.

---

## COPY GUIDELINES

When adding new content entries through the admin, follow these rules:

1. **Keep h1 to 2–3 lines.** Use `<br>` for line breaks. Use `<span class="accent">...</span>` for the accent-colored punchline.
2. **Subheadlines are 1–2 sentences max.** Ground the headline with product value.
3. **Use `{JOBS}` and `{COMPANIES}` placeholders** where live stats add credibility.
4. **Never be mean.** Funny-encouraging, not funny-at-your-expense.
5. **Never sound desperate.** No "please sign up" energy.
6. **Don't repeat concepts across entries.** Check existing entries before adding.
7. **Returning visitors (audience: returning) can be more sales-forward.** They haven't committed.
8. **Lapsed users (audience: lapsed) should be warmer.** Acknowledge the relationship.
9. **Use `min_visits` for escalating directness.** Visit 1-2 = light touch. Visit 3+ = more direct nudges.
10. **Test by reading it out loud.** Smart friend energy, not banner ad energy.

---

## SUCCESS METRICS

| Metric | Target | Measurement |
|--------|--------|-------------|
| Merchandising system operational | All placements serving content from database | Admin console shows green status |
| No-deploy content updates | 100% of copy changes happen through admin | Zero GitHub commits for copy changes |
| Copy rotation working | 100% of targeted visitors see rotated content | PostHog `merch_content_shown` fires |
| No repeat on consecutive visits | < 5% same-content rate on visits n and n+1 | PostHog sequence analysis |
| Signup rate | ≥ baseline (no regression from migration) | PostHog funnel: content shown → signup |
| Admin usability | Marston can add/edit/disable content entries in < 60 seconds | Manual verification |

---

## BUILD ORDER

### Phase 1: Database (Pod 2)
1. Create `merch_placements`, `merch_rules`, `merch_content` tables
2. Create `get_merch_content` RPC function
3. Set up RLS policies
4. Run migration script to load existing 51 entries

### Phase 2: Admin UI (Pod 2)
5. Add Merchandising tab to `roadmap.html`
6. Build placement list (left panel)
7. Build placement detail + rules section (right panel)
8. Build content entries table + edit modal
9. Build bulk import functionality

### Phase 3: Frontend Integration (Pod 2)
10. Create `merch-client.js`
11. Add `data-merch-field` attributes to landing page hero sections
12. Wire up live stats hydration for `{JOBS}` / `{COMPANIES}` placeholders
13. Add PostHog event tracking
14. Remove hardcoded pool arrays from `index.html` (after verifying database-driven content works)

### Phase 4: QA
15. Test all audience segments see correct content
16. Test cohort-specific overrides
17. Test deep-visit gating (`min_visits`)
18. Test seasonal filtering
19. Test fallback (disable merchandising → static content visible)
20. Test admin CRUD operations end-to-end
21. Verify PostHog events fire correctly

**Estimated effort:** 3–4 dev days. Phase 1 is ~2 hours, Phase 2 is ~2 days (bulk of the work is admin UI), Phase 3 is ~half day, Phase 4 is ~half day.

---

## APPENDIX: INITIAL CONTENT ENTRY COUNTS

After migration of existing copy bank:

| Placement | Rule (Cohort × Audience) | Total Entries | Deep-Visit Only (min_visits ≥ 3) |
|-----------|-------------------------|--------------|----------------------------------|
| Hero Rotating Copy | All × Returning | 33 | 5 |
| Hero Rotating Copy | All × Lapsed | 18 | 0 |

Target: 50+ entries per audience pool within 3 months of launch. The admin console makes this trivial — no code deploys required.
