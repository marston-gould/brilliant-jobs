# AUDIT-D4 — Dashboard: Security, Testing & Compliance
**Date:** 2026-03-16  
**Properties:** #3 Security, #6 Testability, #12 Compliance & Privacy, #15 Accessibility  
**Session score:** 2.25/5  
**Findings:** 11 (0×P0, 1×P1, 6×P2, 4×P3)

---

## #3 Security

### AUDIT-D4-001 — P1 — XSS in renderOnboardProfile() [app.js:1453]
**File:** `js/app.js:1452–1458`  
**Detail:** `tag()` template literal injects user-supplied profile data (titles, skills, locations, industries) directly into `innerHTML` with no sanitization. Data originates from `extract-resume-profile` EF response (AI-extracted from resume upload — untrusted). A malicious resume could inject arbitrary HTML/JS into the dashboard.  
**Fix:** Add `escapeHtml()` inside `tag()` before interpolation.

### AUDIT-D4-002 — P2 — Undefined `escHtml` alias in resumes.js [resumes.js:2492,2504,2562,2574]
**File:** `js/resumes.js`  
**Detail:** `escHtml` is referenced in 4 places as a sanitizer for AI-generated bullet/summary content injected into `innerHTML`. `escHtml` is never defined anywhere in the codebase. The `typeof` guard causes it to fall back to `.replace(/</g, '&lt;')` — which only escapes `<`, missing `>`, `&`, `"`, `'`. Incomplete sanitizer on AI-generated output.  
**Fix:** Replace all `escHtml` references with `escapeHtml` (the canonical global).

### AUDIT-D4-003 — P2 — `javascript:` URI not blocked in job_url href [apply-workflow.js:2804]
**File:** `js/apply-workflow.js:2804`  
**Detail:** `app.job_url` from Supabase is inserted into an `<a href="...">` attribute via `escapeHtml()`. HTML entity encoding does not strip `javascript:` protocol — a poisoned job record could execute JS when the user clicks "Apply Now".  
**Fix:** Add a URL protocol allowlist check (`https:` / `http:` only) before rendering the href. Fall back to `#` if protocol is disallowed.

### AUDIT-D4-004 — P3 — `bjConfirm()` uses `innerHTML` with no sanitization guard [app.js:808]
**File:** `js/app.js:808`  
**Detail:** `msgEl.innerHTML = message` — currently all callers pass hardcoded string literals (safe). No guard prevents future callers from passing user-controlled data. Low risk today, latent risk as codebase grows.  
**Fix:** Either switch to `textContent` + structured DOM for the message, or document the "hardcoded-only" contract with a lint rule.

---

## #6 Testability

### AUDIT-D4-005 — P2 — 14 pre-existing test failures in main
**Detail:** Full vitest run shows 4 test files with failures:
- `tests/cs-p1-005.test.js` — 10 failures
- `tests/referral-consolidation.test.js` — 2 failures  
- `tests/fb-trial-001-s7-posthog-nudges.test.js` — 1 failure
- `tests/fb-pi-001-s1-schema-inbox.test.js` — 1 failure

14 failing tests in `main` means CI is either not enforcing zero-failure gate or these are known-deferred. Either way the signal is degraded — a new regression in these files won't be visible.  
**Fix:** Either fix the 14 tests or explicitly mark them `.skip` with a tracking comment. Never leave silent red in main.

### AUDIT-D4-006 — P2 — `escHtml` alias used but never defined (covered under #3 Security above)
Duplicate of AUDIT-D4-002 — listed here as a testability gap: no test catches the undefined reference because the `typeof` guard swallows it silently.

---

## #12 Compliance & Privacy

### AUDIT-D4-007 — P2 — Resume filename exposed in PostHog event [resumes.js:1401]
**File:** `js/resumes.js:1401`  
**Detail:** `posthog.capture('resume_panel_expanded', { resume_name: resumes[idx]?.name })` — `name` is the file system filename. Users commonly name resumes `John_Smith_Resume.pdf`, `FirstName_LastName_CV.pdf` etc. This sends a PII-bearing filename to PostHog's servers on every panel expand.  
**Fix:** Drop `resume_name` from the event, or hash/truncate it (e.g. send `has_custom_name: true/false` instead).

### AUDIT-D4-008 — P3 — Redundant `user_id` in event properties [resumes.js:2069,2123]
**File:** `js/resumes.js:2069`, `js/resumes.js:2123`  
**Detail:** `gap_insights_viewed` and `gap_term_clicked` send `user_id: currentUser.id` as an event property. PostHog already has this identity via `posthog.identify()` called at login. The redundant property adds unnecessary PII to the event payload and the PostHog event schema.  
**Fix:** Remove `user_id` from both event property objects.

---

## #15 Accessibility

### AUDIT-D4-009 — P2 — 91 inputs lack programmatic label association [dashboard.html]
**File:** `dashboard.html`  
**Detail:** 111 `<input>` elements have `id` attributes; only 20 `<label for="...">` elements exist. ~91 inputs have no associated label — screen readers will announce them as unlabelled. Affects every settings field, filter input, and form control on the dashboard.  
**Fix:** Audit each unlabelled input and add either a `<label for="...">` or `aria-label` / `aria-labelledby` attribute. Priority: visible form fields first.

### AUDIT-D4-010 — P2 — Modal overlays missing `role="dialog"` + `aria-modal` [dashboard.html]
**File:** `dashboard.html`  
**Detail:** Only 1 of the many modal/overlay patterns in the dashboard uses `role="dialog"` and `aria-modal="true"`. Score gate modal, confirm overlay, resume picker, cover letter modal, AIS panels — none declare themselves as dialogs to assistive technology. Screen reader users cannot distinguish modal context from the main page.  
**Fix:** Add `role="dialog" aria-modal="true" aria-labelledby="..."` to each modal overlay container. Add focus-trap on open, restore focus on close.

### AUDIT-D4-011 — P3 — No skip-to-content link; missing landmark roles [dashboard.html]
**File:** `dashboard.html`  
**Detail:** No `<a href="#main-content">Skip to content</a>` at top of page. Sidebar nav has no `role="navigation"`, header has no `role="banner"`, footer has no `role="contentinfo"`. Only `role="main"` is present. Keyboard-only users must tab through the entire sidebar on every page load.  
**Fix:** Add skip link as first focusable element. Add landmark roles to sidebar, header, footer.

### AUDIT-D4-012 — P3 — No existing a11y tests [tests/]
**Detail:** 187 test files, zero test files covering accessibility assertions. No axe-core integration, no keyboard navigation tests, no ARIA attribute validation.  
**Fix:** Add a single `tests/a11y-dashboard.test.js` using axe-core (already in node_modules) to catch regressions on critical interactive components.

---

## Summary

| Property | Score | Verdict |
|----------|-------|---------|
| #3 Security | 2/5 | XSS vectors in AI-rendered content; `javascript:` href unguarded |
| #6 Testability | 3/5 | Strong volume (187 files) but 14 failures in main degrade signal |
| #12 Compliance | 3.5/5 | PII-safe on content; filename + redundant user_id leakage fixable |
| #15 Accessibility | 1.5/5 | Structural a11y largely unaddressed; no tests; dialogs not declared |
| **Session avg** | **2.5/5** | |

## Open Findings Carried Forward

| ID | Sev | Fix owner |
|----|-----|-----------|
| AUDIT-D4-001 | P1 | Sprint |
| AUDIT-D4-002 | P2 | Sprint |
| AUDIT-D4-003 | P2 | Sprint |
| AUDIT-D4-005 | P2 | Sprint |
| AUDIT-D4-007 | P2 | Sprint |
| AUDIT-D4-009 | P2 | Sprint (a11y pass) |
| AUDIT-D4-010 | P2 | Sprint (a11y pass) |
| AUDIT-D4-004 | P3 | Backlog |
| AUDIT-D4-008 | P3 | Sprint |
| AUDIT-D4-011 | P3 | Backlog |
| AUDIT-D4-012 | P3 | Sprint |
