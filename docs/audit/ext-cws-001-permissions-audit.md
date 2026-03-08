# EXT-CWS-001: Extension Manifest Permissions Audit

> **Session:** REM-004 | **Date:** 2026-03-08 | **Pair:** Frontend + QA | **Reviewer:** Forward-Looking Dev

## Summary

All 7 declared permissions are justified and in active use. No permissions removed.
Host permissions are scoped to 15 specific ATS domains + Supabase + BrilliantJobs.
`optional_host_permissions: ["https://*/*"]` retained for generic handler fallback on unrecognized ATS platforms.

## Distribution Model

The extension is distributed via **website-direct sideloading** (not Chrome Web Store).
This means CWS automated review is not a factor, but permissions should still follow
minimum-privilege principles for user trust and security posture.

## Permission Justification (7/7 justified)

| Permission | Used By | Justification |
|-----------|---------|---------------|
| `activeTab` | contentScript.ts, background.ts | Required for dynamic script injection on ATS pages the user navigates to. Core to the form-fill workflow — the extension needs to interact with the active tab's DOM when the user clicks "Fill". |
| `scripting` | background.ts — `chrome.scripting.executeScript` | Core to scanner operation and autofill. Used for DOM scraping, challenge detection, scroll simulation on LinkedIn, and dynamic contentScript injection on ATS pages not covered by static content_scripts matches. |
| `storage` | 12+ files — `chrome.storage.local` | Extension requires persistent local state for auth session, scanner state, tier data, fill metrics, kill-switch cache, and application tracking. No sync storage used (data is device-local). |
| `tabs` | background.ts — `chrome.tabs.query/get/update/create` | Scanner needs tab control for LinkedIn profile visiting, icon badge updates, ATS redirect detection, and opening the side panel. |
| `alarms` | background.ts — `chrome.alarms` for nextVisit, scheduledResume, dailyCheck, keepAlive, heartbeat | Service worker scheduling. Scanner scheduling requires alarms because MV3 service workers are ephemeral — alarms are the only reliable way to wake the service worker on a schedule. |
| `sidePanel` | manifest.json — `chrome.sidePanel.open` | Primary extension UI. The popup is rendered as a side panel (popup.html) for persistent visibility while the user browses job boards. |
| `notifications` | background.ts — `chrome.notifications.create` | User-facing status notifications for scanner progress, CAPTCHA alerts, application confirmations, and token refresh failures (added REM-002). |

## Host Permissions Audit (23 patterns)

### ATS Platforms (19 patterns → 15 ATS platforms)

| Domain Pattern | ATS Platform | Handler | Routed? |
|---------------|-------------|---------|---------|
| `boards.greenhouse.io/*` | Greenhouse (legacy) | greenhouse-legacy.ts | ✅ |
| `boards.eu.greenhouse.io/*` | Greenhouse EU (legacy) | greenhouse-legacy.ts | ✅ |
| `job-boards.greenhouse.io/*` | Greenhouse (React) | greenhouse-react.ts | ✅ |
| `job-boards.eu.greenhouse.io/*` | Greenhouse EU (React) | greenhouse-react.ts | ✅ |
| `jobs.lever.co/*` | Lever | lever.ts | ✅ |
| `jobs.ashbyhq.com/*` | Ashby | ashby.ts | ✅ |
| `apply.workable.com/*` | Workable | workable.ts | ✅ |
| `*.recruitee.com/*` | Recruitee | recruitee.ts | ✅ |
| `*.myworkdayjobs.com/*` | Workday | workday.ts | ✅ |
| `smartapply.indeed.com/*` | Indeed | indeed.ts | ✅ |
| `apply.indeed.com/*` | Indeed | indeed.ts | ✅ |
| `m5.apply.indeed.com/*` | Indeed | indeed.ts | ✅ |
| `*.indeed.com/*` | Indeed (all subdomains) | indeed.ts | ✅ |
| `*.icims.com/*` | iCIMS | icims.ts | ✅ |
| `*.taleo.net/*` | Taleo | taleo.ts | ✅ |
| `jobs.smartrecruiters.com/*` | SmartRecruiters | smartrecruiters.ts | ✅ |
| `careers.smartrecruiters.com/*` | SmartRecruiters | smartrecruiters.ts | ✅ |
| `*.avature.net/*` | Avature | avature.ts | ✅ |
| `*.bamboohr.com/*` | BambooHR | bamboohr.ts | ✅ (wired REM-004) |
| `*.applytojob.com/*` | JazzHR | jazzhr.ts | ✅ (wired REM-004) |

### Infrastructure (4 patterns)

| Domain Pattern | Purpose | Justification |
|---------------|---------|---------------|
| `qojhagupdnbtomfoxnsf.supabase.co/*` | Supabase backend | Auth, job data, profile sync, application tracking. Required for all backend communication. |
| `brilliantjobs.app/*` | Dashboard | Token sync content script, externally_connectable messaging. |
| `www.brilliantjobs.app/*` | Dashboard (www) | Same as above — both www and non-www are used. |

### Indeed Wildcard Analysis

`*.indeed.com/*` is broader than the 3 specific Indeed subdomains also listed. This is justified because:
- contentScript.ts uses `hostnamePattern: /\.indeed\.com$/` to match any Indeed subdomain
- Indeed uses `ia.indeed.com` and other subdomains during the application flow
- The specific subdomains (`smartapply`, `apply`, `m5.apply`) are listed for static content_script injection; the wildcard covers dynamic injection via `chrome.scripting.executeScript`

**Recommendation:** Keep. Removing the wildcard would break Indeed application tracking on subdomains that aren't in the static list.

## Optional Host Permissions

```json
"optional_host_permissions": ["https://*/*"]
```

**Purpose:** Enables the generic handler fallback. When a user encounters a job application form on an ATS platform not in the 15 supported platforms, the extension can request permission to that specific domain at runtime and use `handlers/generic.ts` to attempt form fill.

**Risk assessment:** This is a broad optional permission. It does NOT grant access by default — the user must explicitly grant access per-domain via `chrome.permissions.request()`. The permission is only requested when the user clicks "Fill" on an unrecognized domain.

**Recommendation:** Keep. This is the correct MV3 pattern for progressive permission acquisition. The alternative (requesting `<all_urls>` as a required permission) would be worse for user trust.

## Web Accessible Resources

Handler JS files, fillMetrics, inject-overlay, toolbar-overlay, and inject.css are exposed to all ATS content script matches. This is required for dynamic `import()` of handler modules from the content script context.

**Recommendation:** No changes needed. Resources are correctly scoped to ATS domains only.

## Externally Connectable

Limited to `brilliantjobs.app`, `www.brilliantjobs.app`, and `staging.brilliantjobs.app`. This is the minimum scope needed for dashboard ↔ extension communication.

## REM-004 Changes

1. **BambooHR handler wired:** `bamboohr.ts` was created in CS-P1-011 (ES1-6) but never added to the contentScript ATS_HANDLERS routing table. Added with `hostnamePattern: /\.bamboohr\.com$/`, plus JD/title/company selectors and background.ts STATIC_DOMAINS entry.

2. **JazzHR handler wired:** `jazzhr.ts` was created in CS-P1-011 (ES1-6) but never added to the contentScript ATS_HANDLERS routing table. Added with `hostnamePattern: /\.applytojob\.com$/`, plus JD/title/company selectors and background.ts STATIC_DOMAINS entry.

3. **Manifest version bumped:** 2.21.0 → 2.23.0

## Conclusion

No permissions removed — all 7 are actively used and justified. Host permissions are appropriately scoped to specific ATS domains. The `optional_host_permissions` wildcard is the correct MV3 pattern for progressive permission acquisition by the generic handler. Two handler routing gaps (BambooHR, JazzHR) were fixed.
