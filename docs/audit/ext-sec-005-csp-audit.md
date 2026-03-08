# EXT-SEC-005: Extension Content Script CSP Bypass Audit

> **Session:** REM-001 | **Date:** 2026-03-08 | **Pair:** Security + DevOps

## Scope

Audit all injection points in extension content scripts for CSP bypass vectors.
Specifically: `innerHTML`, `insertAdjacentHTML`, `outerHTML`, `document.write` usage.

## Findings

### Files Audited

| File | innerHTML Uses | Sanitized | Risk |
|------|---------------|-----------|------|
| `inject-overlay.ts` | 2 (write) | ✅ escHtml() on all dynamic data (L302) | **SAFE** — Static template + escaped interpolation |
| `toolbar-overlay.ts` | 3 (write) | ✅ escHtml() on all labels/metadata (L417–442, L580–586, L688–694) | **SAFE** — All dynamic values escaped |
| `contentScript.ts` | 2 (read) | N/A (reading from page) | **SAFE** — Reads ATS page HTML for data extraction, does not inject |
| `content.ts` | 1 (write) | N/A (static string) | **SAFE** — Static `'✨ Sync to Brilliant Jobs'` |
| `popup.ts` | 2 (write) | ✅ escHtml() on company names (L1437) | **SAFE** — Dynamic data escaped; static fallback |
| `popup-post.ts` | 2 (clear) | N/A (clearing content) | **SAFE** — `innerHTML = ''` to reset containers |
| `background.ts` | 1 (read) | N/A (reading from page) | **SAFE** — Reads `.pv-top-card` innerHTML for data extraction |

### Sanitization Coverage

- **escHtml()** defined in 3 files: `inject-overlay.ts:13`, `toolbar-overlay.ts:525`, `popup.ts:7`
- All three implementations are identical: replaces `&`, `<`, `>`, `"`, `'` with HTML entities
- **Every innerHTML write that interpolates dynamic data uses escHtml()**
- No `insertAdjacentHTML`, `outerHTML`, or `document.write` found

### Data Flow Trace

The `contentScript.ts` reads `el.innerHTML` from ATS pages (L313, L331) and passes it via
`chrome.runtime.sendMessage` to the background script. This HTML is stored in Supabase
(`ats_jobs.description_html`). The dashboard renders this HTML through DOMPurify (CS-004).
No re-rendering of scraped HTML occurs within the extension itself.

### `data-stage` Attribute Injection

`toolbar-overlay.ts` interpolates `data-stage="${s}"` where `s` comes from the hardcoded
`PICKER_STAGES` array (`['saved', 'applied', 'interview', 'offer']`). No user-controlled
data reaches attribute interpolation.

## Verdict

**✅ NO VULNERABILITIES FOUND.** All injection points are properly mitigated:

1. Static HTML templates with no dynamic interpolation → safe by construction
2. Dynamic interpolation protected by escHtml() → XSS-safe
3. innerHTML reads (data extraction from ATS pages) → no injection vector
4. Scraped HTML rendered on dashboard via DOMPurify → sanitized at render time

## Recommendations (Defense-in-Depth)

1. ~~Add CSP meta tag to popup.html~~ — Already has CSP via manifest.json `content_security_policy`
2. Consider consolidating the 3 separate `escHtml()` definitions into a shared utility — low priority, cosmetic
3. Continue using escHtml() for all future innerHTML writes in extension code
