# Design Treatment Handoff: My Applications + Setup Page Parallelism

**Author:** Pod 1 (Growth)
**Date:** 2026-02-26
**Target Version:** v4.86
**Audience:** Pod 2 (Engineering)

---

## Executive Summary

Two design coherence issues need resolution before product demos:

1. **My Applications tab** — the only content tab without the navy hero banner pattern established in v4.83. Uses legacy `.stat-grid` cards, has confusing double-navigation (List/Board toggle + Queue/Rules/Notifications/History tabs), and visually disconnects from the rest of the dashboard.

2. **Setup page integration cards** — the four cards (Extension, Gmail, Calendar, Drive) lack structural parallelism. Connected vs disconnected states render differently across cards, buttons shift position between states, and confirmation badges are styled inconsistently.

Both are Pod 1 UX issues — no backend changes required.

---

## Part 1: Setup Page — Integration Card Parallelism

### Problem

The four integration cards on the Setup page have inconsistent internal layouts:

**Chrome Extension (connected):**
- Status shows in a bordered card-within-card (`Extension connected / Active now · last synced at 12:07 PM`)
- Download button is hidden entirely (`dlBox.style.display = 'none'`)
- Installation guide `<details>` element sits below

**Gmail (connected):**
- Status shows as inline badge (`✓ Connected gould.marston@gmail.com`)
- Disconnect button sits inline with the status text
- Description paragraph sits below

**Calendar & Drive (disconnected):**
- Gray dot + "Not connected" text
- Green connect button + "Read-only access" label
- Description paragraph below

**Core issues:**
- Connected confirmation is styled differently per card (bordered box vs inline badge)
- Action buttons move between states — Disconnect appears in a different zone than where Connect was
- Extension hides its action zone entirely when connected; Gmail replaces the button inline
- No CSS exists for the zone classes (`.setup-int-status`, `.setup-int-action`, `.setup-int-desc`, `.setup-int-context`) — all unstyled

### Solution: Fixed 4-Zone Layout

Every card body should render 4 fixed zones in the same order, regardless of connection state. Content changes; position doesn't.

```
┌─────────────────────────────────────┐
│  HEADER (icon + name + subtitle + dot)  │  ← existing, no changes
├─────────────────────────────────────┤
│  ZONE 1: STATUS                         │  ← always present, fixed height
│  ZONE 2: ACTION                         │  ← always present, fixed height
│  ZONE 3: DESCRIPTION                    │  ← always present
│  ZONE 4: EXTRAS (install guide, files)  │  ← card-specific, optional
└─────────────────────────────────────┘
```

### Zone 1: Status — Unified Treatment

**Disconnected state (all cards):**
```html
<div class="setup-int-status">
  <span class="setup-status-badge disconnected">
    <span class="setup-status-dot"></span>
    Not connected
  </span>
</div>
```

**Connected state (all cards):**
```html
<div class="setup-int-status">
  <span class="setup-status-badge connected">
    <svg ...checkmark.../> Connected
  </span>
  <span class="setup-int-context">gould.marston@gmail.com</span>
</div>
```

Key rules:
- Green checkmark badge is identical across all four cards when connected
- Context text (email, "Active now · last synced at 12:07 PM") appears in `.setup-int-context` — same class, same position
- Extension's bordered card-within-card is removed — use the same inline badge as Gmail
- The entire Extension "Extension connected" bordered box (`#ext-zone-connected`) is replaced with the standard badge pattern

### Zone 2: Action — Fixed Position, Content Swaps

**Disconnected state:**
```html
<div class="setup-int-action">
  <button class="btn btn-primary btn-sm">Connect Gmail</button>
  <span class="setup-int-permission">Read-only access</span>
</div>
```

**Connected state:**
```html
<div class="setup-int-action">
  <button class="btn btn-secondary btn-sm setup-int-disconnect">Disconnect Gmail</button>
</div>
```

Key rules:
- Action zone is always in the same vertical position — between status and description
- Disconnected → primary button (green/blue) + permission label
- Connected → secondary button (gray "Disconnect") — same position, never inline with status
- Extension connected state: hide the download button, show nothing in this zone (or show a subtle "Reinstall" link if needed) — but the zone itself stays in place to prevent layout shift
- Never hide the zone div — use `visibility: hidden` or render an empty placeholder to maintain height

### Zone 3: Description — Always Present

```html
<div class="setup-int-desc">
  Detects confirmation emails, interview requests, and rejections...
</div>
```

No changes needed to content. This zone already exists but needs consistent spacing.

### Zone 4: Extras — Card-Specific

- Extension: `<details>` installation guide (no changes)
- Drive: linked files section (no changes)
- Gmail/Calendar: nothing (zone doesn't render)

### CSS Required

```css
.setup-int-status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  margin-bottom: 12px;
}

.setup-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
}

.setup-status-badge.disconnected {
  color: var(--text-faint);
}

.setup-status-badge.connected {
  color: var(--green);
}

.setup-status-badge .setup-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-faint);
  flex-shrink: 0;
}

.setup-status-badge.connected .setup-status-dot {
  background: var(--green);
  box-shadow: 0 0 6px hsla(var(--green-hsl), 0.4);
}

.setup-int-context {
  font-size: 11px;
  color: var(--text-dim);
  margin-left: 4px;
}

.setup-int-action {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  margin-bottom: 12px;
}

.setup-int-permission {
  font-size: 11px;
  color: var(--text-faint);
}

.setup-int-desc {
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.6;
}
```

### JS Changes Required

**js/app.js — `checkExtensionStatus()`:**
- Remove the bordered card rendering (`#ext-zone-connected` / `#ext-zone-disconnected`)
- Use the same badge pattern: show `.setup-status-badge.connected` with checkmark SVG + context text
- Instead of `dlBox.style.display = 'none'`, swap the download button for a Disconnect/Reinstall secondary button (or empty zone)

**js/app.js — `updateGmailUI()`:**
- Already close to correct — just ensure the Disconnect button renders in Zone 2 (`.setup-int-action`), not inline with the status badge in Zone 1
- Currently, `#gmail-setup-connected` contains both the badge AND the Disconnect button — split them

**js/integrations.js — `renderGdriveState()`:**
- Same pattern: connected state should show badge in Zone 1, Disconnect in Zone 2
- Currently hiding/showing `connectBtn` and `disconnectBtn` which live in the same zone — this is correct, just verify the zone classes match

**js/app.js — Calendar:**
- Same pattern as Gmail — split status badge from disconnect button into separate zones

### Files Modified

- `dashboard.html` — restructure all 4 card bodies into the 4-zone pattern
- `styles.css` (or `src/input.css`) — add the 6 new zone classes
- `js/app.js` — update `checkExtensionStatus()`, `updateGmailUI()`, calendar state logic
- `js/integrations.js` — update `renderGdriveState()`
- `dist/dashboard.min.js` — rebuild

### Estimated Effort

2–3 hours. All HTML/CSS/JS — no backend, no database, no edge functions.

---

## Part 2: My Applications — Hero + Navigation Redesign

### Problem

My Applications is the only content tab that doesn't follow the v4.83 design pattern. Every other tab has:

1. **Navy hero banner** with headline, subtitle, and embedded stat chips
2. **Content directly below** — no standalone stat-grid cards at the top

My Applications currently has:
- Bare `<h2>My Applications</h2>` page header (no hero)
- A List/Board toggle (good, but small)
- Four standalone `.stat-card` elements (Queued, Pending Approval, Submitted, Failed)
- A secondary `.app-flow-tabs` tab bar (Queue, Rules & Settings, Notifications, History)
- The user navigates two levels of tabs to reach content — confusing

### Solution

#### 2a. Add Navy Hero Banner

Add `.app-hero` using the same pattern as `.feed-hero`, `.resume-hero`, etc.

**Headline:** `Your applications. <span style="color:#f59e0b;">Under control.</span>`
**Subtitle:** `Queue jobs for submission, set automation rules, and track every application from send to response — with ghost detection when things go quiet.`

**Hero stat chips (absorb current stat cards):**

| Chip | ID | Source | Notes |
|------|----|--------|-------|
| Queued | `a-queued` | `appQueue.filter(a => a.status === 'queued').length` | Ready to send |
| Submitted | `a-submitted` | `[...appQueue, ...appHistory].filter(a => a.status === 'submitted').length` | Total sent |
| Response Rate | `a-response` | From pipeline data — `responded / applied` | Cross-linked from Ghost Monitor |
| This Week | `a-week` | Applications with `addedAt` in last 7 days | Activity velocity |

**HTML structure:**
```html
<div class="app-hero">
  <div style="font-size:18px;font-weight:800;margin-bottom:4px;">
    Your applications. <span style="color:#f59e0b;">Under control.</span>
  </div>
  <div style="font-size:12px;color:rgba(255,255,255,0.8);line-height:1.6;max-width:480px;">
    Queue jobs for submission, set automation rules, and track every
    application from send to response — with ghost detection when
    things go quiet.
  </div>
  <div class="hero-stats">
    <div class="hero-stat">
      <div class="hero-stat-val" id="a-queued">0</div>
      <div class="hero-stat-label">Queued</div>
    </div>
    <div class="hero-stat">
      <div class="hero-stat-val" id="a-submitted">0</div>
      <div class="hero-stat-label">Submitted</div>
    </div>
    <div class="hero-stat">
      <div class="hero-stat-val hs-green" id="a-response">—</div>
      <div class="hero-stat-label">Response Rate</div>
    </div>
    <div class="hero-stat">
      <div class="hero-stat-val" id="a-week" style="color:#3b82f6;">0</div>
      <div class="hero-stat-label">This Week</div>
    </div>
  </div>
</div>
```

**CSS (add to styles.css):**
```css
.app-hero {
  background: #1b3e6f;
  color: #fff;
  border-radius: 14px;
  padding: 24px 28px;
  margin-bottom: 16px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
}
.app-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse 70% 60% at 10% 100%, rgba(61, 135, 255, 0.15), transparent),
    radial-gradient(ellipse 50% 50% at 90% 0%, rgba(137, 90, 246, 0.1), transparent);
}
.app-hero > * { position: relative; }
```

(This is identical to `.feed-hero` — could also just reuse `.feed-hero` class or create a shared `.page-hero` base class.)

#### 2b. Remove Standalone Stat Cards

Delete the `.stat-grid` block with the 4 stat cards from inside `#app-view-list-panel`. The hero chips replace them.

#### 2c. Simplify Navigation — Merge to 3-Way Toggle

Replace the current double-navigation (List/Board toggle + app-flow-tabs) with a single 3-way toggle:

```
[ Queue ]  [ Pipeline ]  [ History ]
```

- **Queue** = current List view (application queue table)
- **Pipeline** = current Board view (collapsible stage sections from `#pl-stages-container-board`)
- **History** = current History sub-tab (completed/failed applications)

**Move Rules & Notifications into a Settings panel:**
- Add a gear icon button to the right of the 3-way toggle: `⚙ Settings`
- Clicking it opens a collapsible card below the toggle (same pattern as Tuning's collapsible cards)
- Contains: Application mode selection, Score gate settings, Approval settings, Notification matrix, Escalation timeline, Quiet hours
- This removes two tabs (Rules & Settings, Notifications) from the primary navigation and groups all configuration in one place

**HTML structure:**
```html
<!-- 3-way toggle -->
<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
  <div style="display:flex;gap:4px;background:var(--bg-hover);border-radius:8px;padding:3px;">
    <button class="btn btn-sm app-nav-toggle active"
            data-panel="queue" onclick="switchAppPanel('queue')"
            style="padding:4px 14px;font-size:11px;border-radius:6px;">
      Queue
    </button>
    <button class="btn btn-sm app-nav-toggle"
            data-panel="pipeline" onclick="switchAppPanel('pipeline')"
            style="padding:4px 14px;font-size:11px;border-radius:6px;">
      Pipeline
    </button>
    <button class="btn btn-sm app-nav-toggle"
            data-panel="history" onclick="switchAppPanel('history')"
            style="padding:4px 14px;font-size:11px;border-radius:6px;">
      History
    </button>
  </div>
  <button class="btn btn-sm btn-secondary" id="app-settings-toggle"
          onclick="toggleAppSettings()"
          style="margin-left:auto;padding:4px 12px;font-size:11px;">
    ⚙ Settings
  </button>
</div>

<!-- Settings panel (collapsed by default) -->
<div id="app-settings-panel" class="card" style="display:none;margin-bottom:16px;">
  <!-- Move content from panel-rules and panel-notifications here -->
</div>

<!-- Content panels -->
<div id="app-panel-queue">...</div>
<div id="app-panel-pipeline" style="display:none;">...</div>
<div id="app-panel-history" style="display:none;">...</div>
```

#### 2d. JS Changes

**New function `switchAppPanel(panel)`:**
```javascript
window.switchAppPanel = function(panel) {
  // Toggle buttons
  document.querySelectorAll('.app-nav-toggle').forEach(b => b.classList.remove('active'));
  document.querySelector(`.app-nav-toggle[data-panel="${panel}"]`).classList.add('active');
  // Toggle panels
  ['queue', 'pipeline', 'history'].forEach(p => {
    const el = document.getElementById('app-panel-' + p);
    if (el) el.style.display = (p === panel) ? '' : 'none';
  });
};
```

**New function `toggleAppSettings()`:**
```javascript
window.toggleAppSettings = function() {
  const panel = document.getElementById('app-settings-panel');
  panel.style.display = panel.style.display === 'none' ? '' : 'none';
};
```

**Update `renderAppQueue()`:**
- Change stat card updates to target hero chip IDs (`a-queued`, `a-submitted`, `a-response`, `a-week`)
- Add "This Week" calculation: `appQueue.filter(a => { const d = new Date(a.addedAt); return (Date.now() - d.getTime()) < 604800000; }).length`

**Remove `switchAppView()`:**
- The old List/Board toggle function is replaced by `switchAppPanel()`

### Files Modified

- `dashboard.html` — restructure My Applications page section
- `styles.css` (or `src/input.css`) — add `.app-hero` class + mobile responsive
- `js/applications.js` — update stat rendering, add `switchAppPanel()`, `toggleAppSettings()`
- `js/app.js` — remove `switchAppView()` (line ~594)
- `dist/dashboard.min.js` — rebuild

### Estimated Effort

3–4 hours. All frontend — no backend changes.

---

## Part 3: Ghost Monitor Hero (Bonus)

Ghost Monitor also uses the old `.stat-grid` pattern. For full design coherence, add a `.ghost-hero` banner:

**Headline:** `Ghost Monitor. <span style="color:#f59e0b;">No silence unnoticed.</span>`
**Subtitle:** `Track response rates and expose companies that ghost applicants — powered by email signals, listing status, and company history.`

**Hero stat chips (absorb current stat cards):**

| Chip | ID | Source |
|------|----|--------|
| Active | `g-active` | Applications being tracked |
| Avg Wait | `g-avg-wait` | Average days waiting |
| Likely Ghosted | `g-likely` | High ghost score |
| Gmail | `g-gmail-status` | Connected/Not Connected |

Same CSS as other heroes. Estimated: 1 hour.

---

## Acceptance Criteria

### Setup Page
- [ ] All 4 cards have identical zone layout (Status → Action → Description → Extras)
- [ ] Connected badge (green check + text) is identical across all 4 cards
- [ ] Disconnect button is always in Zone 2 (never inline with status badge)
- [ ] No layout shift when toggling between connected/disconnected states
- [ ] Extension no longer uses bordered card-within-card for connected status
- [ ] Mobile responsive (cards stack at 700px breakpoint — already handled by existing `.setup-grid` media query)

### My Applications
- [ ] Navy hero banner with headline, subtitle, and 4 stat chips
- [ ] No standalone `.stat-grid` cards visible
- [ ] 3-way toggle (Queue / Pipeline / History) replaces double-navigation
- [ ] Settings (Rules + Notifications) accessible via gear button, collapsed by default
- [ ] Hero stat chips update dynamically from same data sources as old stat cards
- [ ] Mobile responsive (hero shrinks at 600px — already handled by existing media query)

### Ghost Monitor (Bonus)
- [ ] Navy hero banner with headline, subtitle, and stat chips
- [ ] No standalone `.stat-grid` cards visible

---

## Risk Mitigation

- **No backend changes** — this is entirely HTML/CSS/JS
- **No data model changes** — same localStorage keys, same Supabase queries
- **Pipeline board view** is just being relocated into the new 3-way toggle — no logic changes to `renderPipeline()`
- **Existing JS functions** (`renderAppQueue`, `renderAppHistory`, `renderPipeline`) continue to work — only their container element IDs may need updating if panel IDs change
- **CSS class naming** follows existing patterns (`.app-hero` mirrors `.feed-hero`)

---

## Version Plan

- v4.86a — Setup card parallelism
- v4.86b — My Applications hero + nav restructure
- v4.86c — Ghost Monitor hero (if time permits)
- Rebuild `dist/dashboard.min.js` after each
