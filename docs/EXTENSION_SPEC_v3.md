# Brilliant Jobs Extension — v3.0 Spec

**Status:** Specification  
**Created:** February 26, 2026  
**Current Extension Version:** 2.6.6  
**Target Version:** 3.0.0  

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Feature A: Role-Based Access Control](#2-feature-a-role-based-access-control)
3. [Feature B: ATS Form-Fill Submission Layer](#3-feature-b-ats-form-fill-submission-layer)
4. [Feature C: Recruiter Email Discovery](#4-feature-c-recruiter-email-discovery)
5. [Feature D: Build Fingerprint Obfuscation](#5-feature-d-build-fingerprint-obfuscation)
6. [Feature E: Centralized Data Pipeline](#6-feature-e-centralized-data-pipeline)
7. [Database Schema Changes](#7-database-schema-changes)
8. [Edge Functions](#8-edge-functions)
9. [Migration Plan](#9-migration-plan)
10. [Risk Assessment](#10-risk-assessment)

---

## 1. Architecture Overview

### Current State (v2.6.6)

The extension is a LinkedIn-focused network intelligence tool running as a Chrome side panel:

| Component | Purpose |
|-----------|---------|
| `background.js` | Service worker: scanner loop, alarm scheduling, profile visiting, intercepted data cache |
| `popup.js` | Side panel UI: auth gate, 4 tabs (Harvest, Scan, Jobs, Data), scanner state display |
| `popup.html` | UI layout with auth gate, tab system, unified activity log |
| `interceptor.js` | MAIN world: monkey-patches fetch/XHR to capture LinkedIn DashProfileCards API responses |
| `interceptor-bridge.js` | ISOLATED world: relays between MAIN world (postMessage) and background (chrome.runtime) |
| `human-sim.js` | Behavioral simulation: bezier mouse paths, natural scrolling, idle wiggle, random glances |
| `supabase.js` | REST API helper for Supabase (select, upsert, update, count, rpc) |
| `popup-bridge.js` | Creates dummy DOM elements popup.js expects before it loads |
| `popup-post.js` | Overrides addLog for unified log, loads version info panel |

**Data flow today:**
```
LinkedIn page → interceptor.js (MAIN) → postMessage → interceptor-bridge.js (ISOLATED)
→ chrome.runtime.sendMessage → background.js cache → visitNextProfile() reads cache
→ supabase.upsert('companies', ...) → Supabase DB
```

### Target State (v3.0)

```
┌──────────────────────────────────────────────────────────┐
│  Extension v3.0                                          │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ ALL USERS (after login)                             │ │
│  │                                                     │ │
│  │  • ATS Form-Fill Submission (Greenhouse, Lever,     │ │
│  │    Ashby, Workable, Recruitee)                      │ │
│  │  • Recruiter Email Outreach (via server-side        │ │
│  │    contact discovery)                               │ │
│  │  • Application tracking sync to pipeline            │ │
│  │  • Profile data collection (own profile only)       │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ ADMIN ONLY (role='admin' on profiles table)         │ │
│  │                                                     │ │
│  │  • Harvest tab (connection list scraping)           │ │
│  │  • Scan tab (profile visiting + company extraction) │ │
│  │  • Jobs tab (LinkedIn job scraping)                 │ │
│  │  • Data tab (export TSV, top companies)             │ │
│  │  • Network interceptor (passive API capture)        │ │
│  │  • Human-sim injection for scanner                  │ │
│  │  • Full activity log                                │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ CENTRALIZED DATA PIPELINE                           │ │
│  │                                                     │ │
│  │  extension_events table ← all extension actions     │ │
│  │  application_submissions table ← form fills         │ │
│  │  Data syncs on: harvest, scan, apply, error         │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Feature A: Role-Based Access Control

### Problem

All extension functionality is currently visible to any logged-in user. The LinkedIn intelligence features (harvest, scan, intercept) are admin-only tools that regular users should never see. Exposing them creates liability risk and confuses the UX.

### Implementation

#### 2A.1 — Profile Role Check

On login, after the existing approval check in `popup.js`, also fetch the user's role:

```javascript
// In checkAuth(), after approval check passes:
const profiles = await supabase.select('profiles',
  `select=approved,role&id=eq.${session.user_id}`);

if (!profiles || profiles.length === 0 || !profiles[0].approved) {
  showAuthGate();
  return;
}

currentUser = {
  id: session.user_id,
  email: session.email,
  role: profiles[0].role || 'user'  // default to 'user'
};

// Cache role locally so background.js can check it
await chrome.storage.local.set({
  userRole: currentUser.role
});

showApp(session.email, currentUser.role);
```

#### 2A.2 — UI Gating

`showApp()` receives the role and conditionally renders tabs:

```javascript
function showApp(email, role) {
  $('#auth-gate').style.display = 'none';
  $('#app-content').style.display = 'block';
  $('#auth-user-bar').classList.add('active');
  $('#auth-user-email').textContent = email;

  if (role === 'admin') {
    // Show all tabs: Harvest, Scan, Jobs, Data, Apply
    showAdminTabs();
  } else {
    // Show only: Apply tab (+ future user tabs)
    showUserTabs();
  }

  initApp();
}

function showAdminTabs() {
  // All tabs visible, scanner indicator visible
  $$('.tab').forEach(t => t.style.display = '');
  $('#scanner-indicator').style.display = '';
}

function showUserTabs() {
  // Hide admin tabs
  ['harvest', 'scan', 'jobs', 'data'].forEach(tabName => {
    const tab = $(`.tab[data-tab="${tabName}"]`);
    if (tab) tab.style.display = 'none';
    const content = $(`#tab-${tabName}`);
    if (content) content.style.display = 'none';
  });

  // Hide scanner indicator (no scanning for regular users)
  $('#scanner-indicator').style.display = 'none';

  // Activate the Apply tab by default
  const applyTab = $(`.tab[data-tab="apply"]`);
  if (applyTab) {
    $$('.tab').forEach(t => t.classList.remove('active'));
    $$('.tab-content').forEach(tc => tc.classList.remove('active'));
    applyTab.classList.add('active');
    $('#tab-apply').classList.add('active');
  }
}
```

#### 2A.3 — Background Script Gating

The scanner should refuse to start for non-admin users:

```javascript
// In startScanner():
async function startScanner(includePast = true) {
  const { userRole } = await chrome.storage.local.get('userRole');
  if (userRole !== 'admin') {
    logMsg('Scanner is admin-only.', 'error');
    return;
  }
  // ... existing scanner logic
}
```

#### 2A.4 — Content Script Gating

The interceptor and human-sim scripts only need to run for admins. However, since content scripts are declared in manifest.json and run automatically, they'll still inject. The gating happens at the *action* level:

- `interceptor.js`: Still captures API data passively (low risk, no behavioral footprint). Data is only *used* when background.js runs scanner logic, which is admin-gated.
- `human-sim.js`: Only injected via `chrome.scripting.executeScript()` from `visitNextProfile()`, which is already admin-gated.

No changes needed to content script injection — the functional gate in `background.js` is sufficient.

#### 2A.5 — Database Requirement

The `profiles` table needs a `role` column if it doesn't exist:

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';
-- Set existing admin accounts
UPDATE profiles SET role = 'admin' WHERE email = 'gould.marston@gmail.com';
```

---

## 3. Feature B: ATS Form-Fill Submission Layer

### Overview

When a user clicks "Apply" on a job in the Brilliant Jobs dashboard, the extension:
1. Opens the ATS apply page in a new tab
2. Detects which ATS platform it is
3. Fills standard fields from the user's stored application profile
4. Uploads their selected resume
5. Handles custom questions where possible (or flags them for manual completion)
6. Optionally auto-submits, or highlights the submit button for user review

### 3B.1 — Application Profile Storage

Users configure their application profile once. Stored in `chrome.storage.local` and synced to Supabase `application_profiles` table.

```javascript
// Schema for application_profiles table
{
  user_id: uuid,          // FK to profiles
  first_name: text,
  last_name: text,
  email: text,
  phone: text,
  linkedin_url: text,
  website_url: text,
  city: text,
  state: text,
  country: text,          // default 'United States'
  work_authorization: text, // 'authorized', 'visa_required', 'citizen'
  requires_sponsorship: boolean,
  gender: text,           // for EEO (optional, user chooses to share)
  race_ethnicity: text,   // for EEO (optional)
  veteran_status: text,   // for EEO (optional)
  disability_status: text, // for EEO (optional)
  preferred_resume_id: uuid, // FK to resume_archive
  cover_letter_template: text,
  custom_answers: jsonb,  // cached answers to common questions
  updated_at: timestamptz
}
```

#### Profile Setup UI

New tab in the extension: **"Apply"** tab (visible to all users).

First section: **Application Profile** — form fields for the above. Loads from `chrome.storage.local`, syncs to Supabase on save.

```
┌──────────────────────────────────────────┐
│  APPLY                                    │
│                                           │
│  ┌─ Application Profile ──────────────┐  │
│  │ First Name: [Marston          ]    │  │
│  │ Last Name:  [Gould            ]    │  │
│  │ Email:      [marston@email.com]    │  │
│  │ Phone:      [912-555-1234     ]    │  │
│  │ LinkedIn:   [linkedin.com/in/mg]   │  │
│  │ Location:   [Savannah, GA     ]    │  │
│  │ Work Auth:  [Authorized ▾     ]    │  │
│  │ Sponsorship: [No ▾            ]    │  │
│  │ Resume:     [Resume_v3.pdf ▾  ]    │  │
│  │                                    │  │
│  │ [Save Profile]                     │  │
│  └────────────────────────────────────┘  │
│                                           │
│  ┌─ Quick Apply ──────────────────────┐  │
│  │ Paste any ATS apply URL:           │  │
│  │ [https://boards.greenhouse.io/...]  │  │
│  │ [Fill & Review]  [Auto Submit]     │  │
│  └────────────────────────────────────┘  │
│                                           │
│  ┌─ Recent Applications ──────────────┐  │
│  │ ✓ Acme Corp — Software Eng  2m ago │  │
│  │ ⏳ BigCo — PM (needs review) 5m ago│  │
│  │ ✓ StartupX — Data Eng     1hr ago │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### 3B.2 — ATS Detection Module

New file: `ats-detector.js`

Detects which ATS the current page belongs to based on URL patterns:

```javascript
const ATS_PATTERNS = {
  greenhouse: {
    match: /boards\.greenhouse\.io|job-boards\.greenhouse\.io/,
    applyMatch: /boards\.greenhouse\.io\/[^/]+\/jobs\/\d+/,
    name: 'Greenhouse'
  },
  lever: {
    match: /jobs\.lever\.co/,
    applyMatch: /jobs\.lever\.co\/[^/]+\/[a-f0-9-]+\/apply/,
    name: 'Lever'
  },
  ashby: {
    match: /jobs\.ashbyhq\.com/,
    applyMatch: /jobs\.ashbyhq\.com\/[^/]+\/application/,
    name: 'Ashby'
  },
  workable: {
    match: /apply\.workable\.com|[^.]+\.workable\.com\/j\//,
    applyMatch: /apply\.workable\.com|workable\.com\/j\/[A-Z0-9]+/,
    name: 'Workable'
  },
  recruitee: {
    match: /[^.]+\.recruitee\.com/,
    applyMatch: /recruitee\.com\/o\/[^/]+/,
    name: 'Recruitee'
  }
};

function detectATS(url) {
  for (const [key, config] of Object.entries(ATS_PATTERNS)) {
    if (config.match.test(url)) {
      return {
        platform: key,
        name: config.name,
        isApplyPage: config.applyMatch.test(url)
      };
    }
  }
  return null;
}
```

### 3B.3 — ATS Form Mapper

New file: `ats-form-mapper.js`

Each ATS has a predictable form structure. The mapper knows which CSS selectors correspond to which fields. This runs as a content script injected into ATS pages.

```javascript
const FORM_MAPS = {

  greenhouse: {
    // Greenhouse uses #application_form with standard input names
    firstName:     '#first_name',
    lastName:      '#last_name',
    email:         '#email',
    phone:         '#phone',
    location:      '#job_application_location',
    linkedin:      'input[name*="linkedin" i], input[autocomplete="url"][placeholder*="linkedin" i]',
    website:       'input[name*="website" i], input[name*="portfolio" i]',
    resume:        '#resume_file, input[type="file"][name*="resume" i]',
    coverLetter:   '#cover_letter_file, input[type="file"][name*="cover" i]',
    submitButton:  '#submit_app, button[type="submit"]',
    // EEO fields (optional)
    gender:        'select[name*="gender" i]',
    race:          'select[name*="race" i], select[name*="ethnicity" i]',
    veteran:       'select[name*="veteran" i]',
    disability:    'select[name*="disability" i]',
    // Custom questions container
    customSection: '.field:not([id^="first_name"]):not([id^="last_name"]):not([id^="email"]):not([id^="phone"])'
  },

  lever: {
    // Lever uses a React-based form
    firstName:     'input[name="name"]',  // Lever uses a single "name" field
    fullName:      'input[name="name"]',  // Will need to combine first+last
    email:         'input[name="email"]',
    phone:         'input[name="phone"]',
    linkedin:      'input[name="urls.LinkedIn"]',
    website:       'input[name="urls.Portfolio"], input[name="urls.Website"]',
    resume:        'input[type="file"][name="resume"]',
    location:      'input[name="location"]',
    submitButton:  'button[type="submit"], .application-submit-btn',
    customSection: '.application-additional'
  },

  ashby: {
    firstName:     'input[name="firstName"], input[name="_systemfield_first_name"]',
    lastName:      'input[name="lastName"], input[name="_systemfield_last_name"]',
    email:         'input[name="email"], input[name="_systemfield_email"]',
    phone:         'input[name="phone"], input[name="_systemfield_phone"]',
    linkedin:      'input[name="linkedInUrl"], input[name="_systemfield_linkedin"]',
    resume:        'input[type="file"]',
    submitButton:  'button[type="submit"]',
    customSection: '.ashby-application-form-field-entry'
  },

  workable: {
    firstName:     'input[name="firstname"]',
    lastName:      'input[name="lastname"]',
    email:         'input[name="email"]',
    phone:         'input[name="phone"]',
    resume:        'input[type="file"][accept*="pdf"]',
    linkedin:      'input[name*="linkedin" i]',
    submitButton:  'button[type="submit"]',
    customSection: '.styles__custom-field'
  },

  recruitee: {
    firstName:     'input[name="first_name"]',
    lastName:      'input[name="last_name"]',
    email:         'input[name="email"]',
    phone:         'input[name="phone"]',
    resume:        'input[type="file"]',
    submitButton:  'button[type="submit"]',
    customSection: '.custom-question'
  }
};
```

### 3B.4 — Form Fill Orchestrator

New file: `ats-filler.js` — content script injected into ATS apply pages.

Uses `human-sim.js` for realistic input behavior (mouse movement to field, click, type with variable keystroke delays).

```javascript
// Injected into ATS page via chrome.scripting.executeScript
// Receives profile data via message from background.js

async function fillApplicationForm(profile, formMap, options = {}) {
  const results = { filled: [], skipped: [], custom: [] };
  const HumanSim = window.HumanSim;

  // Field fill helper with human-like input simulation
  async function fillField(selector, value, fieldName) {
    const el = document.querySelector(selector);
    if (!el || !value) {
      results.skipped.push(fieldName);
      return false;
    }

    // Scroll field into view
    await HumanSim.scrollToElement(el);
    await HumanSim.sleep(HumanSim.rand(200, 500));

    // Move mouse to field
    await HumanSim.moveToElement(el);
    await HumanSim.sleep(HumanSim.rand(100, 300));

    // Click to focus
    el.click();
    el.focus();
    await HumanSim.sleep(HumanSim.rand(150, 400));

    // Clear existing value
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await HumanSim.sleep(HumanSim.rand(50, 150));

    // Type character by character with variable delays
    for (let i = 0; i < value.length; i++) {
      const char = value[i];
      el.value += char;

      // Dispatch realistic keyboard events
      el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

      // Variable typing speed: slower at start, occasional pauses
      let delay = HumanSim.rand(30, 90);
      if (i < 3) delay += HumanSim.rand(50, 150);             // slower start
      if (Math.random() < 0.08) delay += HumanSim.rand(200, 600);  // thinking pause
      await HumanSim.sleep(delay);
    }

    // Blur event (tabbing away)
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    await HumanSim.sleep(HumanSim.rand(200, 500));

    results.filled.push(fieldName);
    return true;
  }

  // Select dropdown helper
  async function fillSelect(selector, value, fieldName) {
    const el = document.querySelector(selector);
    if (!el || !value) { results.skipped.push(fieldName); return false; }

    await HumanSim.moveToElement(el);
    el.click();
    await HumanSim.sleep(HumanSim.rand(200, 400));

    // Find matching option (case-insensitive partial match)
    const options = [...el.querySelectorAll('option')];
    const match = options.find(o =>
      o.textContent.toLowerCase().includes(value.toLowerCase()) ||
      o.value.toLowerCase().includes(value.toLowerCase())
    );

    if (match) {
      el.value = match.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      results.filled.push(fieldName);
      return true;
    }

    results.skipped.push(fieldName);
    return false;
  }

  // Resume file upload helper
  async function uploadResume(selector, resumeBlob, fileName) {
    const input = document.querySelector(selector);
    if (!input) { results.skipped.push('resume'); return false; }

    const file = new File([resumeBlob], fileName, { type: 'application/pdf' });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));

    results.filled.push('resume');
    return true;
  }

  // === FILL STANDARD FIELDS ===

  // Handle full name vs first/last split
  if (formMap.fullName && !formMap.firstName) {
    await fillField(formMap.fullName, `${profile.first_name} ${profile.last_name}`, 'name');
  } else {
    await fillField(formMap.firstName, profile.first_name, 'first_name');
    await fillField(formMap.lastName, profile.last_name, 'last_name');
  }

  await fillField(formMap.email, profile.email, 'email');
  await fillField(formMap.phone, profile.phone, 'phone');
  await fillField(formMap.linkedin, profile.linkedin_url, 'linkedin');
  await fillField(formMap.website, profile.website_url, 'website');
  await fillField(formMap.location, `${profile.city}, ${profile.state}`, 'location');

  // EEO fields (only if user opted in)
  if (profile.gender) await fillSelect(formMap.gender, profile.gender, 'gender');
  if (profile.race_ethnicity) await fillSelect(formMap.race, profile.race_ethnicity, 'race');
  if (profile.veteran_status) await fillSelect(formMap.veteran, profile.veteran_status, 'veteran');
  if (profile.disability_status) await fillSelect(formMap.disability, profile.disability_status, 'disability');

  // Upload resume
  if (formMap.resume && profile.resumeBlob) {
    await uploadResume(formMap.resume, profile.resumeBlob, profile.resumeFileName);
  }

  // === DETECT CUSTOM QUESTIONS ===
  const customFields = document.querySelectorAll(formMap.customSection || '.nonexistent');
  for (const field of customFields) {
    const label = field.querySelector('label')?.textContent?.trim() || '';
    const input = field.querySelector('input, select, textarea');
    if (label && input) {
      // Check cached answers
      const cachedAnswer = profile.custom_answers?.[label.toLowerCase()];
      if (cachedAnswer) {
        if (input.tagName === 'SELECT') {
          await fillSelect(input, cachedAnswer, label);
        } else {
          await fillField(input, cachedAnswer, label);
        }
      } else {
        results.custom.push({ label, type: input.type || input.tagName.toLowerCase() });
      }
    }
  }

  return results;
}
```

### 3B.5 — Submission Flow (Background Orchestration)

New message handler in `background.js`:

```javascript
// Message from dashboard or extension popup: apply to job
if (msg.type === 'applyToJob') {
  const { jobId, applyUrl, mode } = msg;
  // mode: 'fill_review' | 'auto_submit'

  handleApplyToJob(jobId, applyUrl, mode)
    .then(result => sendResponse(result));
  return true;
}

async function handleApplyToJob(jobId, applyUrl, mode) {
  // 1. Load application profile
  const { applicationProfile } = await chrome.storage.local.get('applicationProfile');
  if (!applicationProfile?.first_name) {
    return { success: false, error: 'Application profile not configured' };
  }

  // 2. Load resume blob from IndexedDB or fetch from Supabase storage
  const resumeData = await loadResumeBlob(applicationProfile.preferred_resume_id);

  // 3. Open ATS page in new tab
  const tab = await chrome.tabs.create({ url: applyUrl, active: mode === 'fill_review' });

  // 4. Wait for page load
  await waitForTabLoad(tab.id);
  await sleep(2000); // Extra buffer for React/SPA rendering

  // 5. Detect ATS platform
  const detection = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (patterns) => {
      // detectATS logic runs in page context
      for (const [key, config] of Object.entries(patterns)) {
        if (new RegExp(config.match).test(window.location.href)) {
          return { platform: key, name: config.name };
        }
      }
      return null;
    },
    args: [serializePatterns(ATS_PATTERNS)]
  });

  const ats = detection?.[0]?.result;
  if (!ats) {
    return { success: false, error: 'Unrecognized ATS platform' };
  }

  // 6. Inject human-sim + form filler
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['human-sim.js']
  });

  // 7. Execute form fill
  const fillResult = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: fillApplicationForm,
    args: [
      { ...applicationProfile, resumeBlob: resumeData.blob, resumeFileName: resumeData.name },
      FORM_MAPS[ats.platform],
      { autoSubmit: mode === 'auto_submit' }
    ]
  });

  const result = fillResult?.[0]?.result;

  // 8. Handle custom questions that couldn't be filled
  if (result?.custom?.length > 0) {
    // Notify user that manual input is needed
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'Application Needs Review',
      message: `${result.custom.length} custom question(s) need your input for this application.`
    });
    // Keep tab active for user to complete
    await chrome.tabs.update(tab.id, { active: true });
  }

  // 9. Auto-submit if requested and all fields filled
  if (mode === 'auto_submit' && result?.custom?.length === 0) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (submitSelector) => {
        const btn = document.querySelector(submitSelector);
        if (btn) {
          window.HumanSim.moveToElement(btn).then(() => {
            window.HumanSim.sleep(window.HumanSim.rand(300, 800)).then(() => {
              btn.click();
            });
          });
        }
      },
      args: [FORM_MAPS[ats.platform].submitButton]
    });
  }

  // 10. Log the submission
  await logSubmission(jobId, ats.platform, result, mode);

  return { success: true, ...result, ats: ats.name };
}
```

### 3B.6 — Dashboard Integration

The "Apply" action on the Brilliant Jobs dashboard sends a message to the extension:

```javascript
// In dashboard js/jobs.js — when user clicks "Apply" on a job card
function applyViaExtension(jobId, applyUrl) {
  // Check if extension is installed by trying to send a message
  if (window.bjExtensionId) {
    chrome.runtime.sendMessage(window.bjExtensionId, {
      type: 'applyToJob',
      jobId,
      applyUrl,
      mode: userPreferences.autoSubmit ? 'auto_submit' : 'fill_review'
    }, response => {
      if (response?.success) {
        showToast(`Application ${response.filled?.length || 0} fields filled via ${response.ats}`);
        updatePipelineStage(jobId, 'applied');
      } else {
        showToast(response?.error || 'Extension error', 'error');
      }
    });
  } else {
    // Fallback: open ATS page directly
    window.open(applyUrl, '_blank');
  }
}
```

### 3B.7 — Manifest Changes for ATS Host Permissions

```json
{
  "host_permissions": [
    "https://www.linkedin.com/*",
    "https://qojhagupdnbtomfoxnsf.supabase.co/*",
    "https://boards.greenhouse.io/*",
    "https://job-boards.greenhouse.io/*",
    "https://jobs.lever.co/*",
    "https://jobs.ashbyhq.com/*",
    "https://apply.workable.com/*",
    "https://*.workable.com/*",
    "https://*.recruitee.com/*"
  ],
  "externally_connectable": {
    "matches": ["https://brilliantjobs.app/*"]
  }
}
```

The `externally_connectable` key allows the dashboard website to send messages to the extension, enabling the "Apply" button integration.

---

## 4. Feature C: Recruiter Email Discovery

### Architecture

Recruiter lookup is **server-side only** — never through the user's browser. An Edge Function calls a third-party enrichment API with the company domain.

### 4C.1 — Edge Function: `lookup-recruiter`

```
Dashboard "Contact Recruiter" click
  → POST /lookup-recruiter { company_domain, job_title }
  → Edge Function checks cache (recruiter_contacts table)
  → If miss: calls Hunter.io or Apollo API
  → Returns { name, email, title, confidence }
  → Dashboard shows "Send Email" with pre-filled template
```

```typescript
// supabase/functions/lookup-recruiter/index.ts

serve(async (req) => {
  const { company_domain, job_title } = await req.json();

  // 1. Check cache first (contacts discovered in last 30 days)
  const { data: cached } = await sb
    .from('recruiter_contacts')
    .select('*')
    .eq('company_domain', company_domain)
    .gt('discovered_at', new Date(Date.now() - 30 * 86400000).toISOString())
    .order('confidence', { ascending: false })
    .limit(3);

  if (cached?.length > 0) {
    return json({ contacts: cached, source: 'cache' });
  }

  // 2. Call Hunter.io Domain Search API
  const hunterRes = await fetch(
    `https://api.hunter.io/v2/domain-search?domain=${company_domain}` +
    `&department=human_resources&limit=5&api_key=${HUNTER_API_KEY}`
  );
  const hunterData = await hunterRes.json();

  // 3. Filter for recruiting/HR titles
  const recruitingTitles = /recruiter|talent|hiring|hr\b|human resource|people ops/i;
  const contacts = (hunterData.data?.emails || [])
    .filter(e => recruitingTitles.test(e.position || ''))
    .map(e => ({
      company_domain,
      name: `${e.first_name} ${e.last_name}`,
      email: e.value,
      title: e.position,
      confidence: e.confidence,
      source: 'hunter',
      discovered_at: new Date().toISOString()
    }));

  // 4. Cache results
  if (contacts.length > 0) {
    await sb.from('recruiter_contacts').upsert(contacts, {
      onConflict: 'email'
    });
  }

  return json({ contacts, source: 'hunter' });
});
```

### 4C.2 — Email Outreach via Extension

When the user clicks "Contact Recruiter," the dashboard shows a pre-filled email template. The extension doesn't send the email — instead it:

1. Opens the user's default email client via `mailto:` link
2. OR sends via the Resend API through an Edge Function (if user has configured this)

```javascript
// Dashboard UI — "Contact Recruiter" button handler
async function contactRecruiter(jobId, companyDomain, jobTitle) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/lookup-recruiter`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ company_domain: companyDomain, job_title: jobTitle })
  });

  const { contacts } = await res.json();

  if (contacts.length === 0) {
    showToast('No recruiter contacts found for this company.', 'warn');
    return;
  }

  // Show recruiter selection modal with email template
  showRecruiterModal(contacts, jobTitle);
}
```

### 4C.3 — Pricing Consideration

Hunter.io: 25 free searches/month, $49/month for 500 searches.
Apollo: 60 credits/month free, $49/month for 5,000 credits.

**Recommendation:** Start with Hunter.io free tier for validation. Gate this feature to Pro users (each lookup costs ~$0.10). Cache aggressively — most companies' recruiter contacts are stable for weeks.

---

## 5. Feature D: Build Fingerprint Obfuscation

### Problem

LinkedIn and ATS platforms can detect automation extensions by fingerprinting consistent file hashes, manifest metadata, and internal message channel names across users. If 10,000 users all have identical `interceptor.js` files with the same `bj-interceptor` channel name, pattern detection is trivial.

### Solution

A server-side build pipeline generates a unique extension build per download. No two builds share the same file fingerprints.

### 5D.1 — What Gets Randomized

| Component | Current (Static) | Obfuscated (Per-Build) |
|-----------|------------------|------------------------|
| File names | `interceptor.js`, `background.js` | `a7f3c9.js`, `e2d841.js` |
| Manifest `short_name` | `Brilliant Jobs` | Pool of 20+ variations |
| Manifest `description` | `Discover jobs through your professional network` | Pool of 20+ variations |
| postMessage channel: source | `bj-interceptor`, `bj-bridge` | `bj-{salt}`, `bjb-{salt}` |
| postMessage responseId prefix | `bj-response-` | `bjr-{salt}-` |
| CSS class names (injected) | `.scanner-dot`, `.log-line` | `.{prefix}-sd`, `.{prefix}-ll` |
| Whitespace/comments | Consistent | Randomized insertion |
| Variable names (internal) | `interceptedData`, `scannerState` | Shuffled from synonym pool |
| Build metadata | `version.json` with static build ID | Unique `build_id` per download |

### 5D.2 — Build Pipeline (Edge Function)

New Edge Function: `build-extension`

Triggered when a user downloads the extension from brilliantjobs.app.

```typescript
// supabase/functions/build-extension/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { JSZip } from "https://esm.sh/jszip@3.10.1";

serve(async (req) => {
  const { user_id } = await req.json();

  // Generate per-build salt (8 char hex)
  const salt = crypto.randomUUID().slice(0, 8);
  const buildId = `${Date.now().toString(36)}-${salt}`;

  // Generate file name map
  const fileMap = {
    'background.js':         `${randomHex(6)}.js`,
    'interceptor.js':        `${randomHex(6)}.js`,
    'interceptor-bridge.js': `${randomHex(6)}.js`,
    'human-sim.js':          `${randomHex(6)}.js`,
    'supabase.js':           `${randomHex(6)}.js`,
    'popup.js':              `${randomHex(6)}.js`,
    'popup-bridge.js':       `${randomHex(6)}.js`,
    'popup-post.js':         `${randomHex(6)}.js`,
    'popup.html':            'popup.html',  // must stay (manifest reference)
    'help.html':             'help.html',
    'ats-detector.js':       `${randomHex(6)}.js`,
    'ats-form-mapper.js':    `${randomHex(6)}.js`,
    'ats-filler.js':         `${randomHex(6)}.js`,
  };

  // Channel name randomization
  const channels = {
    interceptorSource:  `bj${salt.slice(0,4)}`,
    bridgeSource:       `bjb${salt.slice(0,4)}`,
    responsePrefix:     `bjr${salt.slice(0,4)}-`,
  };

  // Manifest metadata pools
  const names = [
    'Career Tools', 'Job Helper', 'Professional Tools', 'Career Assist',
    'Job Scout', 'Opportunity Finder', 'Work Tools', 'Career Connect',
    'Job Flow', 'Professional Hub', 'Career Lens', 'Talent Scout',
    'Job Radar', 'Career Pilot', 'Work Flow Pro', 'Job Tracker',
    'Career Kit', 'Job Finder Plus', 'Work Connect', 'Opportunity Hub'
  ];
  const descriptions = [
    'Discover opportunities through your network',
    'Smart tools for your job search',
    'Professional career management utilities',
    'Streamline your job application process',
    'Connect with opportunities that matter',
    'Career tools for busy professionals',
    'Your personal job search assistant',
    'Professional networking tools',
    'Smart job discovery and tracking',
    'Career advancement toolkit'
  ];

  // Load source files from storage (canonical source lives in Supabase Storage)
  const sourceFiles = await loadSourceFiles();

  // Apply transforms to each file
  const transformedFiles = {};

  for (const [originalName, content] of Object.entries(sourceFiles)) {
    let transformed = content;

    // 1. Replace channel names
    transformed = transformed
      .replaceAll("'bj-interceptor'", `'${channels.interceptorSource}'`)
      .replaceAll("'bj-bridge'", `'${channels.bridgeSource}'`)
      .replaceAll("'bj-response-'", `'${channels.responsePrefix}'`);

    // 2. Replace file references (importScripts, executeScript calls)
    for (const [orig, obf] of Object.entries(fileMap)) {
      transformed = transformed.replaceAll(`'${orig}'`, `'${obf}'`);
      transformed = transformed.replaceAll(`"${orig}"`, `"${obf}"`);
    }

    // 3. Inject random whitespace/comments
    transformed = injectRandomWhitespace(transformed);

    // 4. CSS class prefix randomization (for popup.html)
    if (originalName.endsWith('.html') || originalName.endsWith('.js')) {
      const cssPrefix = `bj${randomHex(3)}`;
      transformed = randomizeCSSClasses(transformed, cssPrefix);
    }

    const newName = fileMap[originalName] || originalName;
    transformedFiles[newName] = transformed;
  }

  // Build manifest.json with randomized metadata + correct file references
  const manifest = buildManifest(fileMap, channels, {
    name: names[Math.floor(Math.random() * names.length)],
    description: descriptions[Math.floor(Math.random() * descriptions.length)],
  });
  transformedFiles['manifest.json'] = JSON.stringify(manifest, null, 2);

  // Build version.json with build ID
  transformedFiles['version.json'] = JSON.stringify({
    version: EXTENSION_VERSION,
    build: buildId,
    files: Object.fromEntries(
      Object.entries(fileMap).map(([orig, obf]) => [obf, EXTENSION_VERSION])
    )
  });

  // Copy static assets (icons)
  const icons = ['icon16.png', 'icon48.png', 'icon128.png',
                 'icon16-outline.png', 'icon48-outline.png', 'icon128-outline.png'];

  // Create ZIP
  const zip = new JSZip();
  for (const [name, content] of Object.entries(transformedFiles)) {
    zip.file(name, content);
  }
  for (const icon of icons) {
    const iconData = await loadIconFile(icon);
    zip.file(icon, iconData);
  }

  const zipBlob = await zip.generateAsync({ type: 'uint8array' });

  // Log build
  await sb.from('extension_builds').insert({
    user_id,
    build_id: buildId,
    salt,
    file_map: fileMap,
    channel_map: channels,
    built_at: new Date().toISOString()
  });

  return new Response(zipBlob, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="brilliant-jobs-${buildId}.zip"`
    }
  });
});

// === HELPER FUNCTIONS ===

function randomHex(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').slice(0, length);
}

function injectRandomWhitespace(code) {
  const lines = code.split('\n');
  return lines.map(line => {
    // 15% chance to add a blank line before
    if (Math.random() < 0.15 && line.trim() === '') return '\n' + line;
    // 10% chance to add trailing spaces
    if (Math.random() < 0.10) return line + ' '.repeat(Math.floor(Math.random() * 4) + 1);
    // 5% chance to add a benign comment
    if (Math.random() < 0.05 && !line.trim().startsWith('//') && line.trim().length > 0) {
      const comments = [
        '// init', '// ok', '// ready', '// next', '// done',
        '// handle', '// check', '// set', '// get', '// run'
      ];
      return line + '  ' + comments[Math.floor(Math.random() * comments.length)];
    }
    return line;
  }).join('\n');
}

function randomizeCSSClasses(content, prefix) {
  // Only randomize BJ-specific classes, not standard HTML/framework classes
  const bjClasses = [
    'scanner-dot', 'scanner-indicator', 'log-line', 'log-section',
    'log-header', 'log-title', 'source-badge', 'stat-value',
    'stat-label', 'tab-content'
  ];

  for (const cls of bjClasses) {
    const replacement = `${prefix}-${cls.replace(/-/g, '').slice(0, 4)}`;
    content = content.replaceAll(cls, replacement);
  }
  return content;
}
```

### 5D.3 — Manifest Builder

```javascript
function buildManifest(fileMap, channels, meta) {
  return {
    manifest_version: 3,
    name: meta.name,
    version: EXTENSION_VERSION,
    description: meta.description,
    permissions: [
      "activeTab", "scripting", "storage", "tabs",
      "alarms", "sidePanel", "notifications"
    ],
    host_permissions: [
      "https://www.linkedin.com/*",
      "https://qojhagupdnbtomfoxnsf.supabase.co/*",
      "https://boards.greenhouse.io/*",
      "https://job-boards.greenhouse.io/*",
      "https://jobs.lever.co/*",
      "https://jobs.ashbyhq.com/*",
      "https://apply.workable.com/*",
      "https://*.workable.com/*",
      "https://*.recruitee.com/*"
    ],
    background: {
      service_worker: fileMap['background.js']
    },
    content_scripts: [
      {
        matches: ["https://www.linkedin.com/*"],
        js: [fileMap['interceptor.js']],
        run_at: "document_start",
        world: "MAIN"
      },
      {
        matches: ["https://www.linkedin.com/*"],
        js: [fileMap['interceptor-bridge.js']],
        run_at: "document_start"
      }
    ],
    side_panel: {
      default_path: "popup.html"
    },
    action: {
      default_icon: {
        "16": "icon16.png",
        "48": "icon48.png",
        "128": "icon128.png"
      }
    },
    icons: {
      "16": "icon16.png",
      "48": "icon48.png",
      "128": "icon128.png"
    },
    externally_connectable: {
      matches: ["https://brilliantjobs.app/*"]
    }
  };
}
```

### 5D.4 — Update Mechanism

When a new extension version is released:

1. Canonical source files are updated in Supabase Storage
2. `EXTENSION_VERSION` constant is bumped in the build function
3. Existing users are notified via in-extension banner: "Update available — download new build"
4. Each user downloads a fresh unique build
5. The old `extension_builds` record is marked as `superseded`

Note: Chrome Web Store distribution is NOT used. Builds are downloaded directly from brilliantjobs.app and loaded as unpacked/developer mode extensions. This is required for per-build uniqueness.

---

## 6. Feature E: Centralized Data Pipeline

### Problem

Extension-collected data currently goes to:
- `connections` table (harvest + scan results)
- `companies` table (employer data from scanned profiles)
- `scanner_*` fields on `profiles` table (scanner state sync)

Missing:
- No centralized event log for extension actions
- No tracking of form-fill submissions
- No way to attribute dashboard pipeline moves to extension actions
- No analytics on extension usage patterns

### 6E.1 — Extension Events Table

Every significant extension action gets logged to a central table:

```sql
CREATE TABLE extension_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) NOT NULL,
  event_type text NOT NULL,
  -- Event types: 'harvest_start', 'harvest_complete', 'scan_visit',
  -- 'scan_complete', 'form_fill_start', 'form_fill_complete',
  -- 'form_fill_error', 'auto_submit', 'recruiter_lookup',
  -- 'extension_login', 'extension_update', 'profile_saved'
  payload jsonb DEFAULT '{}',
  -- Flexible payload per event type
  build_id text,
  -- Which unique build generated this event
  extension_version text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_ext_events_user ON extension_events(user_id);
CREATE INDEX idx_ext_events_type ON extension_events(event_type);
CREATE INDEX idx_ext_events_created ON extension_events(created_at);

-- RLS: Users can only insert/read their own events
ALTER TABLE extension_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own events"
  ON extension_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own events"
  ON extension_events FOR SELECT
  USING (auth.uid() = user_id);
```

### 6E.2 — Application Submissions Table

Tracks every form-fill attempt with detailed results:

```sql
CREATE TABLE application_submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) NOT NULL,
  job_id text,                    -- FK to ats_jobs.greenhouse_id if known
  ats_platform text NOT NULL,     -- 'greenhouse', 'lever', 'ashby', etc.
  apply_url text NOT NULL,
  company_name text,
  job_title text,
  mode text NOT NULL,             -- 'fill_review' or 'auto_submit'
  status text DEFAULT 'started',  -- 'started', 'filled', 'submitted',
                                  -- 'needs_review', 'error', 'cancelled'
  fields_filled text[],           -- ['first_name', 'email', 'phone', ...]
  fields_skipped text[],          -- ['website', 'cover_letter', ...]
  custom_questions jsonb,         -- [{ label, type, answered: bool }]
  error_message text,
  resume_id uuid,                 -- Which resume was used
  submitted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  build_id text
);

CREATE INDEX idx_app_subs_user ON application_submissions(user_id);
CREATE INDEX idx_app_subs_status ON application_submissions(status);

ALTER TABLE application_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own submissions"
  ON application_submissions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### 6E.3 — Recruiter Contacts Cache

```sql
CREATE TABLE recruiter_contacts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_domain text NOT NULL,
  name text,
  email text NOT NULL UNIQUE,
  title text,
  confidence int,           -- 0-100 from enrichment API
  source text,              -- 'hunter', 'apollo', 'manual'
  discovered_at timestamptz DEFAULT now()
);

CREATE INDEX idx_recruiter_domain ON recruiter_contacts(company_domain);
```

### 6E.4 — Extension Event Logger (Client-Side)

New function added to `supabase.js`:

```javascript
// Batch event queue — sends every 30 seconds or when 10 events accumulate
const eventQueue = [];
let eventFlushTimer = null;

async function logExtensionEvent(eventType, payload = {}) {
  const { authSession } = await chrome.storage.local.get('authSession');
  if (!authSession?.user_id) return;

  // Read build ID from version.json (cached)
  const buildId = await getBuildId();

  eventQueue.push({
    user_id: authSession.user_id,
    event_type: eventType,
    payload,
    build_id: buildId,
    extension_version: EXTENSION_VERSION,
    created_at: new Date().toISOString()
  });

  // Flush if batch is large enough
  if (eventQueue.length >= 10) {
    flushEvents();
  } else if (!eventFlushTimer) {
    eventFlushTimer = setTimeout(flushEvents, 30000);
  }
}

async function flushEvents() {
  if (eventQueue.length === 0) return;
  clearTimeout(eventFlushTimer);
  eventFlushTimer = null;

  const batch = eventQueue.splice(0);
  try {
    await supabase.upsert('extension_events', batch, 'id');
  } catch (e) {
    // Re-queue on failure
    eventQueue.unshift(...batch);
  }
}
```

### 6E.5 — Integration Points

Where events get logged in existing code:

| Location | Event Type | Payload |
|----------|-----------|---------|
| `startHarvest()` | `harvest_start` | `{}` |
| Harvest complete | `harvest_complete` | `{ count, new_added, duration_sec }` |
| `visitNextProfile()` success | `scan_visit` | `{ profile_slug, companies_found, hiring_signal }` |
| `handleApplyToJob()` start | `form_fill_start` | `{ job_id, ats_platform, apply_url }` |
| Form fill complete | `form_fill_complete` | `{ job_id, fields_filled, fields_skipped, custom_count }` |
| Auto-submit click | `auto_submit` | `{ job_id, ats_platform }` |
| Form fill error | `form_fill_error` | `{ job_id, error, ats_platform }` |
| `loginUser()` success | `extension_login` | `{ email }` |
| Profile saved | `profile_saved` | `{ fields_updated }` |

### 6E.6 — Sync to Pipeline

When a form fill succeeds or an auto-submit completes, automatically update the user's pipeline in `pipeline_jobs`:

```javascript
// After successful submission
async function syncSubmissionToPipeline(jobId, status) {
  if (!jobId) return;

  await supabase.upsert('pipeline_jobs', [{
    user_id: currentUser.id,
    job_id: jobId,
    stage: 'applied',
    applied_at: new Date().toISOString(),
    source: 'extension_autofill',
    updated_at: new Date().toISOString()
  }], 'user_id,job_id');
}
```

---

## 6F. Feature F: Extension-Discovered Data → Central Database

### Problem

The extension currently discovers two categories of high-value data that never reach the central database:

1. **LinkedIn job listings** — The Jobs tab scrapes search results (job ID, title, company, location, salary, apply URL) but only stores them in local memory and exports to TSV. These jobs often link to Greenhouse/Lever/Ashby apply pages — the same ATS platforms already in `ats_jobs`. This data is thrown away.

2. **Company discovery from profile scanning** — The scanner extracts LinkedIn company IDs and names from connection profiles and upserts to the `companies` table. But there's no bridge from `companies` (LinkedIn company ID + name) to `ats_boards` / `ats_companies` (ATS board slugs). A connection working at "Stripe" with LinkedIn company ID 2135371 should trigger a check: does Stripe have a Greenhouse/Lever board we're not tracking yet?

Both represent the extension feeding intelligence *back* into the platform's data flywheel.

### 6F.1 — LinkedIn Jobs → `ats_jobs` Pipeline

#### What Changes in the Jobs Tab

Currently `scrapeCurrentPage()` collects: `jobId`, `title`, `company`, `location`, `workplaceType`, `easyApply`, `salary`, `jobUrl`.

After scraping, the data goes to `allJobs[]` in memory → TSV download. We add a parallel push to Supabase.

#### ATS Apply URL Extraction

The key enrichment: when a user clicks into a LinkedIn job detail, the apply button often links to an external ATS page. The extension can extract this.

New injected function for the Jobs tab workflow:

```javascript
// Injected into LinkedIn tab after job list scrape
// Visits each job detail page briefly to extract the external apply URL
async function extractApplyUrls(jobIds) {
  const results = {};

  for (const jobId of jobIds) {
    try {
      // Click the job card to load detail panel (LinkedIn SPA)
      const card = document.querySelector(
        `[data-occludable-job-id="${jobId}"], [data-job-id="${jobId}"]`
      );
      if (!card) continue;
      card.click();

      // Wait for detail panel to render
      await new Promise(r => setTimeout(r, 1500));

      // Look for external apply button
      const applyBtn = document.querySelector(
        'a.jobs-apply-button[href*="greenhouse"], ' +
        'a.jobs-apply-button[href*="lever.co"], ' +
        'a.jobs-apply-button[href*="ashbyhq"], ' +
        'a.jobs-apply-button[href*="workable"], ' +
        'a.jobs-apply-button[href*="recruitee"], ' +
        'a[data-tracking-control-name="public_jobs_apply-link-offsite"],' +
        'a.jobs-apply-button--top-card'
      );

      if (applyBtn) {
        const href = applyBtn.getAttribute('href') || '';
        if (href) {
          results[jobId] = {
            apply_url: href,
            ats_source: detectATSFromUrl(href)
          };
        }
      }

      // Also check for "Easy Apply" (LinkedIn native — no ATS URL)
      const easyApplyBtn = document.querySelector(
        'button.jobs-apply-button[aria-label*="Easy Apply"]'
      );
      if (easyApplyBtn && !results[jobId]) {
        results[jobId] = {
          apply_url: `https://www.linkedin.com/jobs/view/${jobId}/`,
          ats_source: 'linkedin_easy_apply'
        };
      }

    } catch (e) {
      // Silent continue
    }
  }

  return results;
}

function detectATSFromUrl(url) {
  if (/boards\.greenhouse\.io|job-boards\.greenhouse\.io/.test(url)) return 'greenhouse';
  if (/jobs\.lever\.co/.test(url)) return 'lever';
  if (/jobs\.ashbyhq\.com/.test(url)) return 'ashby';
  if (/workable\.com/.test(url)) return 'workable';
  if (/recruitee\.com/.test(url)) return 'recruitee';
  return 'external';
}
```

#### Upsert to `ats_jobs`

After scraping + apply URL extraction, push to central DB:

```javascript
// In popup.js, after scrape loop completes (line ~924)
// Replace the current "Done!" log with:

addLog('j-log', `Done! ${allJobs.length} total jobs. Syncing to database...`, 'success');

// Extract apply URLs for jobs that have external apply links
const applyUrls = await chrome.scripting.executeScript({
  target: { tabId: tab.id },
  func: extractApplyUrls,
  args: [allJobs.slice(0, 50).map(j => j.jobId)]  // First 50 to avoid timeout
});
const urlMap = applyUrls?.[0]?.result || {};

// Build rows for ats_jobs upsert
const jobRows = allJobs.map(j => {
  const applyData = urlMap[j.jobId] || {};
  return {
    greenhouse_id: `li_${j.jobId}`,           // Prefix to avoid collision with ATS-native IDs
    ats_source: applyData.ats_source || 'linkedin',
    title: j.title,
    company_name: j.company,
    location: j.location,
    loc_type: j.workplaceType
      ? j.workplaceType.toLowerCase()
      : null,
    salary_raw: j.salary || null,
    url: j.jobUrl,
    apply_url: applyData.apply_url || j.jobUrl,
    is_open: true,
    first_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    discovered_by: 'extension',                // Tag source for analytics
  };
}).filter(j => j.title);  // Skip empty

// Batch upsert (500 at a time)
const BATCH = 500;
let synced = 0;
for (let i = 0; i < jobRows.length; i += BATCH) {
  const batch = jobRows.slice(i, i + BATCH);
  try {
    await supabase.upsert('ats_jobs', batch, 'greenhouse_id,ats_source');
    synced += batch.length;
  } catch (e) {
    addLog('j-log', `Sync error at batch ${i}: ${e.message}`, 'error');
  }
}

addLog('j-log', `✓ ${synced} jobs synced to central database`, 'success');

// Also extract board slugs from apply URLs for ats_companies discovery
const newBoards = [];
for (const [jobId, data] of Object.entries(urlMap)) {
  if (!data.apply_url || data.ats_source === 'linkedin_easy_apply') continue;

  const slug = extractBoardSlug(data.apply_url, data.ats_source);
  if (slug) {
    const job = allJobs.find(j => j.jobId === jobId);
    newBoards.push({
      slug,
      source: data.ats_source,
      company_name: job?.company || '',
      discovered_via: 'extension_job_scrape',
      discovered_at: new Date().toISOString()
    });
  }
}

if (newBoards.length > 0) {
  try {
    // Use ignore-duplicates so we don't overwrite existing boards
    const headers = supabase.headers();
    headers['Prefer'] = 'return=representation,resolution=ignore-duplicates';
    await fetch(`${SUPABASE_URL}/rest/v1/ats_companies?on_conflict=slug,source`, {
      method: 'POST',
      headers,
      body: JSON.stringify(newBoards)
    });
    addLog('j-log', `✓ ${newBoards.length} new ATS boards discovered`, 'success');
  } catch (e) {
    addLog('j-log', `Board sync error: ${e.message}`, 'error');
  }
}

// Log extension event
logExtensionEvent('job_scrape_complete', {
  jobs_found: allJobs.length,
  jobs_synced: synced,
  boards_discovered: newBoards.length,
  apply_urls_extracted: Object.keys(urlMap).length
});
```

#### Board Slug Extraction Helper

```javascript
function extractBoardSlug(url, atsSource) {
  try {
    const u = new URL(url);
    switch (atsSource) {
      case 'greenhouse':
        // https://boards.greenhouse.io/{slug}/jobs/123
        const ghMatch = u.pathname.match(/^\/([^/]+)\/jobs/);
        return ghMatch ? ghMatch[1] : null;

      case 'lever':
        // https://jobs.lever.co/{slug}/abc-def-123
        const leverMatch = u.pathname.match(/^\/([^/]+)\//);
        return leverMatch ? leverMatch[1] : null;

      case 'ashby':
        // https://jobs.ashbyhq.com/{slug}
        const ashbyMatch = u.pathname.match(/^\/([^/]+)/);
        return ashbyMatch ? ashbyMatch[1] : null;

      case 'workable':
        // https://apply.workable.com/{slug}/j/ABCDEF
        // or https://{slug}.workable.com/j/ABCDEF
        if (u.hostname === 'apply.workable.com') {
          const wMatch = u.pathname.match(/^\/([^/]+)\//);
          return wMatch ? wMatch[1] : null;
        }
        return u.hostname.replace('.workable.com', '');

      case 'recruitee':
        // https://{slug}.recruitee.com/o/job-title
        return u.hostname.replace('.recruitee.com', '');

      default:
        return null;
    }
  } catch (e) {
    return null;
  }
}
```

### 6F.2 — Company Scanner → Board Discovery Pipeline

#### The Gap

The scanner already upserts to the `companies` table:
```javascript
// background.js line 819
await supabase.upsert('companies', companyRows, 'company_id,source_profile_slug,title');
```

Each row has `company_id` (LinkedIn numeric ID) and `company_name`. But there's no process to check: "Does this company have an ATS board we should be tracking?"

#### Cross-Reference Logic

After the scanner saves companies, trigger a board discovery check. This runs as a server-side Edge Function to avoid rate-limiting from the extension:

New Edge Function: `discover-boards-from-companies`

```typescript
// supabase/functions/discover-boards-from-companies/index.ts
//
// Called periodically (daily pg_cron) or on-demand
// Finds companies discovered by extension that don't have known ATS boards
// Attempts to find their Greenhouse/Lever/Ashby boards

serve(async (req) => {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 1. Find companies discovered by extension that aren't in ats_companies
  // Use company_name matching since LinkedIn company IDs ≠ ATS board slugs
  const { data: unmatched } = await sb.rpc('get_unmatched_companies', { limit_count: 100 });

  // RPC function:
  // SELECT DISTINCT c.company_name, c.company_id, c.company_url
  // FROM companies c
  // WHERE NOT EXISTS (
  //   SELECT 1 FROM ats_companies ac
  //   WHERE LOWER(ac.company_name) = LOWER(c.company_name)
  // )
  // AND c.company_name IS NOT NULL
  // AND LENGTH(c.company_name) > 2
  // ORDER BY c.company_name
  // LIMIT limit_count;

  if (!unmatched || unmatched.length === 0) {
    return json({ checked: 0, discovered: 0 });
  }

  let discovered = 0;

  for (const company of unmatched) {
    // 2. Try to find ATS board by company name slug
    const slug = company.company_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Try each ATS platform's board URL pattern
    const checks = [
      { source: 'greenhouse', url: `https://boards.greenhouse.io/${slug}` },
      { source: 'lever',      url: `https://jobs.lever.co/${slug}` },
      { source: 'ashby',      url: `https://jobs.ashbyhq.com/${slug}` },
    ];

    for (const check of checks) {
      try {
        const res = await fetch(check.url, { method: 'HEAD', redirect: 'follow' });
        if (res.ok) {
          // Board exists! Upsert to ats_companies
          await sb.from('ats_companies').upsert({
            slug,
            source: check.source,
            company_name: company.company_name,
            linkedin_company_id: company.company_id,
            status: 'new',
            discovered_via: 'extension_company_scan',
            discovered_at: new Date().toISOString()
          }, { onConflict: 'slug,source' });

          discovered++;
          break;  // Found a board, skip other platforms for this company
        }
      } catch (e) {
        // Connection error, skip
      }

      // Rate limit: 500ms between requests
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // 3. Log results
  await sb.from('extension_events').insert({
    user_id: null,  // System event
    event_type: 'board_discovery_run',
    payload: { checked: unmatched.length, discovered }
  });

  return json({ checked: unmatched.length, discovered });
});
```

#### Linking LinkedIn Company IDs to ATS Boards

Add `linkedin_company_id` column to `ats_companies` for future cross-referencing:

```sql
ALTER TABLE ats_companies
  ADD COLUMN IF NOT EXISTS linkedin_company_id text,
  ADD COLUMN IF NOT EXISTS discovered_via text DEFAULT 'dataforseo';

CREATE INDEX IF NOT EXISTS idx_ats_companies_linkedin_id
  ON ats_companies(linkedin_company_id)
  WHERE linkedin_company_id IS NOT NULL;
```

Once populated, the extension can do instant lookups: "User's connection works at LinkedIn company 12345 → we already track their Greenhouse board `stripe`."

#### Extension-Side: Flag New Companies for Discovery

In `background.js`, after the company upsert in `visitNextProfile()`, add a lightweight check:

```javascript
// After line 819: await supabase.upsert('companies', companyRows, ...)

// Flag new companies for board discovery
// Only check current employers (most likely to be actively hiring)
const currentCompanies = experienceData.companies.filter(c => c.is_current);
if (currentCompanies.length > 0) {
  const companyNames = currentCompanies.map(c => c.company_name).filter(Boolean);

  // Quick check: do we already have boards for these companies?
  try {
    const known = await supabase.select('ats_companies',
      `select=company_name&company_name=in.(${companyNames.map(n =>
        encodeURIComponent('"' + n.replace(/"/g, '') + '"')
      ).join(',')})&limit=100`
    );
    const knownNames = new Set((known || []).map(r => r.company_name?.toLowerCase()));
    const unknownCompanies = currentCompanies.filter(c =>
      c.company_name && !knownNames.has(c.company_name.toLowerCase())
    );

    if (unknownCompanies.length > 0) {
      // Queue for board discovery (insert into a discovery queue table)
      await supabase.upsert('board_discovery_queue', unknownCompanies.map(c => ({
        company_name: c.company_name,
        linkedin_company_id: c.company_id,
        linkedin_url: c.company_url,
        source_profile_slug: connection.profile_slug,
        status: 'pending',
        queued_at: new Date().toISOString()
      })), 'linkedin_company_id');

      logMsg(`  📋 ${unknownCompanies.length} companies queued for board discovery`, 'info');
    }
  } catch (e) {
    // Non-fatal — board discovery is opportunistic
  }
}
```

### 6F.3 — Board Discovery Queue Table

```sql
CREATE TABLE board_discovery_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name text NOT NULL,
  linkedin_company_id text UNIQUE,
  linkedin_url text,
  source_profile_slug text,       -- Which connection led to discovery
  status text DEFAULT 'pending',  -- 'pending', 'checked', 'found', 'not_found'
  discovered_board_slug text,     -- Set if a board was found
  discovered_board_source text,   -- 'greenhouse', 'lever', etc.
  queued_at timestamptz DEFAULT now(),
  checked_at timestamptz
);

CREATE INDEX idx_bdq_status ON board_discovery_queue(status);
CREATE INDEX idx_bdq_company ON board_discovery_queue(linkedin_company_id);
```

### 6F.4 — pg_cron Schedule

```sql
-- Run board discovery daily at 3 AM UTC
SELECT cron.schedule(
  'discover-boards-from-companies',
  '0 3 * * *',
  $$SELECT net.http_post(
    url := 'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/discover-boards-from-companies',
    headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY"}'::jsonb
  )$$
);
```

### 6F.5 — Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│  EXTENSION → CENTRAL DB DATA FLOWS                              │
│                                                                 │
│  Jobs Tab Scrape:                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────────┐ │
│  │ LinkedIn Job  │───▶│ Extract ATS  │───▶│ ats_jobs          │ │
│  │ Search Results│    │ Apply URLs   │    │ (li_{id} prefix)  │ │
│  └──────────────┘    └──────┬───────┘    └───────────────────┘ │
│                             │                                   │
│                             ▼                                   │
│                      ┌──────────────┐    ┌───────────────────┐ │
│                      │ Parse Board  │───▶│ ats_companies     │ │
│                      │ Slug from URL│    │ (new boards)      │ │
│                      └──────────────┘    └───────────────────┘ │
│                                                                 │
│  Profile Scanner:                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────────┐ │
│  │ Connection   │───▶│ companies    │───▶│ board_discovery   │ │
│  │ Profile Visit│    │ table        │    │ _queue            │ │
│  └──────────────┘    └──────────────┘    └───────┬───────────┘ │
│                                                   │             │
│                                          pg_cron daily          │
│                                                   │             │
│                                                   ▼             │
│                                          ┌───────────────────┐ │
│                                          │ discover-boards-  │ │
│                                          │ from-companies EF │ │
│                                          └───────┬───────────┘ │
│                                                   │             │
│                                                   ▼             │
│                                          ┌───────────────────┐ │
│                                          │ ats_companies     │ │
│                                          │ (validated boards)│ │
│                                          └───────────────────┘ │
│                                                                 │
│  Form Fill Submissions (from Feature B):                        │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────────┐ │
│  │ User clicks  │───▶│ Extension    │───▶│ application_      │ │
│  │ "Apply"      │    │ fills form   │    │ submissions       │ │
│  └──────────────┘    └──────────────┘    └───────┬───────────┘ │
│                                                   │             │
│                                                   ▼             │
│                                          ┌───────────────────┐ │
│                                          │ pipeline_jobs     │ │
│                                          │ (stage='applied') │ │
│                                          └───────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 6F.6 — Impact on Existing Infrastructure

| Component | Change |
|-----------|--------|
| `popup.js` (Jobs tab) | After scrape loop, upsert to `ats_jobs` + extract apply URLs + discover boards |
| `background.js` (scanner) | After company upsert, check `ats_companies` for unknowns → queue for discovery |
| `ats_jobs` table | Add `discovered_by` column (`'refresh'` for existing, `'extension'` for new) |
| `ats_companies` table | Add `linkedin_company_id`, `discovered_via` columns |
| New table | `board_discovery_queue` |
| New Edge Function | `discover-boards-from-companies` |
| New pg_cron | Daily board discovery at 3 AM UTC |

### 6F.7 — Deduplication Strategy

The `ats_jobs` table uses composite unique `(greenhouse_id, ats_source)`. Extension-discovered jobs use the prefix `li_` on the LinkedIn job ID to avoid collisions:

- Server-side refresh: `greenhouse_id = '4123456789'`, `ats_source = 'greenhouse'`
- Extension discovery: `greenhouse_id = 'li_4123456789'`, `ats_source = 'greenhouse'`

This means the same job can exist twice — once from server-side refresh (authoritative, with full description HTML) and once from extension discovery (lightweight, with LinkedIn metadata). The server-side version is canonical. A nightly cleanup job can merge these:

```sql
-- Mark extension-discovered jobs as duplicates if server already has them
UPDATE ats_jobs SET is_duplicate = true
WHERE greenhouse_id LIKE 'li_%'
AND EXISTS (
  SELECT 1 FROM ats_jobs aj2
  WHERE aj2.ats_source = ats_jobs.ats_source
  AND aj2.greenhouse_id = REPLACE(ats_jobs.greenhouse_id, 'li_', '')
);
```

However, many LinkedIn jobs won't have server-side equivalents (companies not yet in the board refresh cycle). These extension-discovered jobs fill the gap until the board is picked up by the discovery pipeline.

---

## 7. Database Schema Changes Summary

### New Tables

| Table | Purpose |
|-------|---------|
| `application_profiles` | User's stored application data for form filling |
| `application_submissions` | Log of every form-fill attempt and result |
| `extension_events` | Centralized event log for all extension actions |
| `recruiter_contacts` | Cached recruiter email lookup results |
| `extension_builds` | Registry of unique builds generated per user |
| `board_discovery_queue` | Companies found by extension pending ATS board lookup |

### Modified Tables

| Table | Change |
|-------|--------|
| `profiles` | Add `role text DEFAULT 'user'` column |
| `ats_jobs` | Add `discovered_by text DEFAULT 'refresh'` column |
| `ats_companies` | Add `linkedin_company_id text`, `discovered_via text DEFAULT 'dataforseo'` columns |

---

## 8. Edge Functions

### New Edge Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `build-extension` | HTTP POST from download page | Generates unique per-user extension build |
| `lookup-recruiter` | HTTP POST from dashboard | Finds recruiter contacts via Hunter.io/Apollo |
| `discover-boards-from-companies` | Daily pg_cron (3 AM UTC) | Checks extension-discovered companies for ATS boards |

### Modified Edge Functions

None — all new functionality is additive.

---

## 9. Migration Plan

### Phase 1: Role-Based Access (v2.7.0)
- Add `role` column to profiles
- Set admin flag on your account
- Modify `popup.js` to check role and gate tabs
- Modify `background.js` to gate scanner start
- No UI changes for admin — everything works as before
- Regular users see: login → empty "Apply" tab (coming soon placeholder)

### Phase 2: Application Profile + Form Fill (v2.8.0)
- Create `application_profiles` table
- Create `application_submissions` table
- Build "Apply" tab UI in popup.html
- Build `ats-detector.js`, `ats-form-mapper.js`, `ats-filler.js`
- Add ATS host permissions to manifest
- Add `externally_connectable` for dashboard comms
- Test form fill on all 5 ATS platforms
- Wire dashboard "Apply" button to extension

### Phase 3: Centralized Data Pipeline (v2.9.0)
- Create `extension_events` table
- Add `logExtensionEvent()` to supabase.js
- Instrument all existing code paths with event logging
- Add pipeline sync on submission complete
- Build admin analytics view for extension events
- **Add `discovered_by` column to `ats_jobs`**
- **Add `linkedin_company_id`, `discovered_via` columns to `ats_companies`**
- **Modify Jobs tab scrape loop to upsert discovered jobs to `ats_jobs`**
- **Add apply URL extraction from LinkedIn job detail panels**
- **Add board slug parsing from extracted apply URLs → `ats_companies`**
- **Create `board_discovery_queue` table**
- **Modify scanner `visitNextProfile()` to queue unknown companies for discovery**
- **Build `discover-boards-from-companies` Edge Function**
- **Add pg_cron schedule for daily board discovery**

### Phase 4: Recruiter Email Discovery (v2.10.0)
- Create `recruiter_contacts` table
- Build `lookup-recruiter` Edge Function
- Set up Hunter.io API account
- Build "Contact Recruiter" UI in dashboard
- Gate to Pro users (credit-based)

### Phase 5: Build Fingerprint Obfuscation (v3.0.0)
- Create `extension_builds` table
- Build `build-extension` Edge Function
- Upload canonical source files to Supabase Storage
- Build download page on brilliantjobs.app
- Test unique builds across multiple downloads
- Remove Chrome Web Store distribution if applicable
- All downloads go through build pipeline

---

## 10. Risk Assessment

### ATS Form Fill

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ATS updates form structure | Medium | Form fill breaks for that ATS | Selector fallback chains, monthly audit, user error reporting |
| CAPTCHA blocks submission | Low (rare on ATS apply pages) | Can't auto-submit | Detect CAPTCHA, pause for user, log event |
| Employer sees duplicate apps | Low | User embarrassment | Dedup check against `application_submissions` before filling |
| Application flagged as bot | Very Low (with human-sim) | App deprioritized | Human-sim timing, per-build fingerprinting |

### LinkedIn Detection

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Extension fingerprinted | Medium (without obfuscation) → Very Low (with) | Account restriction | Build obfuscation eliminates shared signatures |
| Behavioral detection | Low | Temporary throttle | Human-sim, business hours, randomized pacing |
| API response format change | Medium | Interceptor breaks | DOM fallback already exists, monitor LinkedIn changes |

### Build Obfuscation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Transform breaks functionality | Medium (during development) | Extension doesn't work | Integration test suite per transform, canary builds |
| User can't update easily | Medium | Running outdated version | In-extension update notification, one-click re-download |
| Source file transform misses a reference | Low | Broken internal messaging | Automated grep test across all files for untransformed strings |

---

## File Inventory (v3.0)

### New Files
| File | Purpose |
|------|---------|
| `ats-detector.js` | URL pattern matching for ATS platform detection |
| `ats-form-mapper.js` | CSS selector maps for each ATS form structure |
| `ats-filler.js` | Content script: form fill orchestration with human-sim |

### Modified Files
| File | Changes |
|------|---------|
| `background.js` | Add `applyToJob` message handler, admin gate on scanner, event logging |
| `popup.js` | Add role check in `checkAuth()`, `showUserTabs()`/`showAdminTabs()`, Apply tab init |
| `popup.html` | Add Apply tab HTML, application profile form, recent applications list |
| `supabase.js` | Add `logExtensionEvent()`, event queue/flush |
| `manifest.json` | Add ATS host permissions, `externally_connectable` |
| `version.json` | Bump to 3.0.0 |

### New Edge Functions
| Function | Files |
|----------|-------|
| `build-extension` | `supabase/functions/build-extension/index.ts` |
| `lookup-recruiter` | `supabase/functions/lookup-recruiter/index.ts` |
