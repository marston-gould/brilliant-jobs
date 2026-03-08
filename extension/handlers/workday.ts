// handlers/workday.ts — Workday ATS Form Filler
// v3.9.0: Phase 11 (P10-E) Workday Apply handler
//
// Workday uses a complex multi-page wizard with dynamic rendering.
// Application URL patterns:
//   - https://{company}.wd{N}.myworkdayjobs.com/en-US/{site}/job/{title}/{id}/apply
//   - https://{company}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/job/{id}/apply
//
// Workday form characteristics:
//   - Multi-page wizard: My Information → My Experience → Application Questions → Voluntary Disclosures → Review
//   - Page detection: [data-automation-id="pageHeaderTitle"], .css-1vqj0ow
//   - Fields wrapped in [data-automation-id] containers
//   - Custom dropdowns: [data-automation-id="selectWidget"], multiSelectContainer
//   - Date pickers: [data-automation-id="dateSectionMonth-display"], custom calendar
//   - File upload: [data-automation-id="file-upload-drop-zone"]
//   - Navigation: Next/Previous buttons with [data-automation-id="bottom-navigation-next-button"]
//   - Dynamic rendering: React-based, fields appear/disappear based on selections
//   - Auto-populated fields: Workday may pre-fill from parsed resume
//
// IMPORTANT: Workday's DOM is heavily data-automation-id driven. Use those selectors preferentially.

import { fillTextInput } from '../fields/textInput.ts';
import { fillSelect, fillCheckboxRadio, fillCustomDropdown } from '../fields/dropdown.ts';
import { fillSearchableDropdown } from '../fields/dropdownSearchable.ts';
import { uploadFile, base64ToFile } from '../utils/fileUpload.ts';
import { FieldFillerQueue } from '../utils/fieldFillerQueue.ts';
import { matchMultilingualLabel } from '../utils/multilingualLabels.ts';
import { fillMyExperience } from './workday-experience.js';

// ============================================================
// WORKDAY AUTOMATION-ID FIELD MAP
// ============================================================

// Workday uses data-automation-id attributes extensively.
// These are more reliable than labels since they're programmatic.
const WORKDAY_AUTOMATION_MAP = {
  // Personal Info
  'legalNameSection_firstName': (p) => p.firstName,
  'legalNameSection_lastName': (p) => p.lastName,
  'addressSection_addressLine1': (p) => p.address,
  'addressSection_city': (p) => p.city,
  'addressSection_countryRegion': (p) => p.state,
  'addressSection_postalCode': (p) => p.zip,
  'phone-number': (p) => p.phone,
  'phone-device-type': () => 'Mobile',
  'email': (p) => p.email,

  // Source / how did you hear
  'source': () => 'Job Board',
  'sourcePrompt': () => 'Job Board',
};

// Label-based fuzzy matching (fallback when automation-id isn't present)
const WORKDAY_LABEL_PATTERNS = [
  { pattern: /^first\s*name/i, value: (p) => p.firstName },
  { pattern: /^last\s*name/i, value: (p) => p.lastName },
  { pattern: /^legal\s*first/i, value: (p) => p.firstName },
  { pattern: /^legal\s*last/i, value: (p) => p.lastName },
  { pattern: /^preferred\s*name/i, value: (p) => p.firstName },
  { pattern: /full\s*name|^name$/i, value: (p) => [p.firstName, p.lastName].filter(Boolean).join(' ') },
  { pattern: /e-?mail/i, value: (p) => p.email },
  { pattern: /phone|mobile|cell/i, value: (p) => p.phone },
  { pattern: /^address|street\s*address/i, value: (p) => p.address },
  { pattern: /^city$/i, value: (p) => p.city },
  { pattern: /^state|province|region/i, value: (p) => p.state },
  { pattern: /postal|zip/i, value: (p) => p.zip },
  { pattern: /country/i, value: (p) => p.country || 'United States' },
  { pattern: /linkedin/i, value: (p) => p.linkedin },
  { pattern: /website|portfolio|url/i, value: (p) => p.portfolio || p.website },
  { pattern: /job\s*title|position\s*title|current\s*title/i, value: (p) => p.currentTitle },
  { pattern: /company|employer|organization/i, value: (p) => p.currentCompany },
  { pattern: /school|university|college/i, value: (p) => p.school },
  { pattern: /degree/i, value: (p) => p.degree },
  { pattern: /field\s*of\s*study|major/i, value: (p) => p.major },
  { pattern: /gpa|grade\s*point/i, value: (p) => p.gpa },
  { pattern: /start\s*date/i, value: (p, pref) => pref.startDate || '' },
  { pattern: /end\s*date/i, value: () => '' }, // Leave empty — current job
  { pattern: /years?\s*(of\s*)?experience/i, value: (p) => p.yearsExperience },
];

// Question patterns for radio/checkbox/text screening questions
const WORKDAY_QUESTION_PATTERNS = [
  { pattern: /authorized\s*to\s*work|legally\s*authorized|eligib.*work/i, answer: (pref) => pref.workAuthorization || 'Yes' },
  { pattern: /visa\s*sponsor|require\s*sponsor|need\s*sponsor/i, answer: (pref) => pref.requireSponsorship || 'No' },
  { pattern: /willing\s*to\s*relocate|open\s*to\s*relocation/i, answer: (pref) => pref.willingToRelocate || 'Yes' },
  { pattern: /willing\s*to\s*travel/i, answer: (pref) => pref.willingToTravel || 'Yes' },
  { pattern: /background\s*check|criminal|conviction/i, answer: (pref) => pref.backgroundCheck || 'No' },
  { pattern: /start\s*date|when\s*can\s*you\s*start|earliest/i, answer: (pref) => pref.startDate || 'Immediately' },
  { pattern: /security\s*clearance/i, answer: (pref) => pref.securityClearance || 'No' },
  { pattern: /salary|compensation|desired\s*pay/i, answer: (pref) => pref.salaryExpectation },
  { pattern: /how\s*did\s*you\s*hear|referral|source/i, answer: () => 'Job Board' },
  { pattern: /18\s*years|age.*18|at\s*least\s*18/i, answer: () => 'Yes' },

  // EEO / Voluntary Disclosures
  { pattern: /veteran|military/i, answer: (pref) => pref.veteranStatus || 'I am not a protected veteran' },
  { pattern: /disabled|disability/i, answer: (pref) => pref.disabilityStatus || 'I don\'t wish to answer' },
  { pattern: /gender|sex/i, answer: (pref) => pref.gender || 'Decline to Self Identify' },
  { pattern: /race|ethnicity/i, answer: (pref) => pref.ethnicity || 'Decline to Self Identify' },
  { pattern: /hispanic|latino/i, answer: (pref) => pref.hispanicLatino || 'Decline to Self Identify' },
];

// ============================================================
// MAIN FILL FUNCTION
// ============================================================

/**
 * Main fill function — called by contentScript.js handler router.
 */
async function fill({ profile, resume, preferences }) {
  const errors = [];
  let filledCount = 0;
  let totalFields = 0;
  let currentStep = 0;
  const maxSteps = 10; // Workday can have many pages

  const queue = new FieldFillerQueue({
    betweenFields: 200, // Workday is sensitive to speed — use human-like delays
    onError: ({ field, error }) => errors.push(`${field}: ${error}`)
  });

  // Wait for initial page to load
  await waitForWorkdayPage();

  // ── Upload resume first if on the "My Information" page ──
  // Workday often auto-populates fields from parsed resume
  if (resume && resume.base64) {
    const uploaded = await uploadResumeIfPresent(resume, errors);
    if (uploaded) {
      filledCount++;
      totalFields++;
      // Wait for Workday to parse and auto-populate
      await delay(3000);
    }
  }

  // ── Multi-step loop: fill visible page, advance, repeat ──
  let hasMoreSteps = true;
  while (hasMoreSteps && currentStep < maxSteps) {
    currentStep++;

    // Detect page type
    const pageTitle = getWorkdayPageTitle();
    console.log(`[BJ] Workday step ${currentStep}: "${pageTitle}"`);

    // Fill current page — route to specialized handler if on My Experience
    let stepResult;
    if (/my\s*experience|work\s*experience|employment|education/i.test(pageTitle)) {
      console.log('[BJ] Workday: detected My Experience page — using specialized handler');
      stepResult = await fillMyExperience(profile, preferences, queue);
    } else {
      stepResult = await fillWorkdayPage(profile, preferences, queue);
    }
    filledCount += stepResult.filledCount;
    totalFields += stepResult.totalFields;
    errors.push(...stepResult.errors);

    // Try to advance — stop if we hit Review page or can't advance
    if (isReviewPage()) {
      console.log('[BJ] Workday: reached Review page — stopping autofill');
      break;
    }

    hasMoreSteps = await clickNextButton();
    if (hasMoreSteps) {
      await delay(1500); // Workday page transitions are slow
      await waitForWorkdayPage();
    }
  }

  return {
    success: errors.length === 0 || filledCount > 0,
    filledCount,
    totalFields,
    errors,
    needsIntervention: true, // Always require user review on Workday
    multiStep: currentStep > 1,
    stepsCompleted: currentStep,
  };
}

// ============================================================
// PAGE FILLING
// ============================================================

async function fillWorkdayPage(profile, preferences, queue) {
  const errors = [];
  let filledCount = 0;
  let totalFields = 0;

  // ── STEP 1: Fill by automation-id (most reliable) ──
  for (const [automationId, getValue] of Object.entries(WORKDAY_AUTOMATION_MAP)) {
    const input = document.querySelector(`[data-automation-id="${automationId}"] input, [data-automation-id="${automationId}"] textarea, input[data-automation-id="${automationId}"], textarea[data-automation-id="${automationId}"]`);
    if (!input || input.offsetParent === null || input.disabled) continue;
    if (input.value && input.value.trim().length > 0) continue;

    const value = getValue(profile);
    if (!value) continue;

    totalFields++;
    queue.enqueue(async () => {
      const result = await fillTextInput(input, String(value), { humanLike: true });
      if (result.success) filledCount++;
      return result;
    }, automationId);
  }

  // ── STEP 2: Fill text inputs by label matching ──
  const inputs = document.querySelectorAll(
    'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea'
  );

  for (const input of inputs) {
    if (input.offsetParent === null || input.disabled || input.readOnly) continue;
    if (input.value && input.value.trim().length > 0) continue;
    if (input.dataset.automationFilled) continue; // Skip if already filled in step 1

    const label = findWorkdayLabel(input);
    if (!label) continue;

    const value = matchWorkdayLabel(label, profile, preferences);
    if (!value) continue;

    totalFields++;
    queue.enqueue(async () => {
      const result = await fillTextInput(input, String(value), { humanLike: true });
      if (result.success) {
        input.dataset.automationFilled = 'true';
        filledCount++;
      }
      return result;
    }, label);
  }

  // ── STEP 3: Workday custom dropdowns ──
  const dropdowns = document.querySelectorAll(
    '[data-automation-id="selectWidget"], [data-automation-id="multiSelectContainer"], ' +
    '[data-automation-id*="dropdown"], [role="listbox"]'
  );

  for (const dd of dropdowns) {
    if (dd.offsetParent === null) continue;

    const label = findWorkdayLabel(dd);
    if (!label) continue;

    const value = matchWorkdayLabel(label, profile, preferences);
    if (!value) continue;

    totalFields++;
    queue.enqueue(async () => {
      const result = await fillWorkdayDropdown(dd, value);
      if (result.success) filledCount++;
      return result;
    }, label);
  }

  // ── STEP 4: Radio groups / checkboxes (screening questions, EEO) ──
  const radioGroups = document.querySelectorAll(
    '[data-automation-id*="radioGroup"], [role="radiogroup"], ' +
    'fieldset:has(input[type="radio"]), [data-automation-id*="question"]:has(input[type="radio"])'
  );

  for (const group of radioGroups) {
    if (group.offsetParent === null) continue;

    const label = findWorkdayLabel(group);
    if (!label) continue;

    const answer = matchWorkdayQuestion(label, preferences);
    if (!answer) continue;

    totalFields++;
    queue.enqueue(async () => {
      const result = selectWorkdayRadio(group, answer);
      if (result.success) filledCount++;
      return result;
    }, label);
  }

  // ── STEP 5: Checkbox questions ──
  const checkContainers = document.querySelectorAll(
    '[data-automation-id*="checkbox"]:has(input[type="checkbox"]), ' +
    '.css-1q9g0if:has(input[type="checkbox"])'
  );

  for (const container of checkContainers) {
    if (container.offsetParent === null) continue;

    const label = findWorkdayLabel(container);
    if (!label) continue;

    // Auto-check agreement/terms/consent checkboxes
    if (/agree|terms|consent|acknowledge|certif|confirm/i.test(label)) {
      const cb = container.querySelector('input[type="checkbox"]:not(:checked)');
      if (cb) {
        totalFields++;
        queue.enqueue(async () => {
          cb.click();
          await delay(100);
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          filledCount++;
          return { success: true };
        }, label);
      }
    }
  }

  await queue.run();
  return { filledCount, totalFields, errors };
}

// ============================================================
// WORKDAY-SPECIFIC DROPDOWN FILLING
// ============================================================

async function fillWorkdayDropdown(container, value) {
  try {
    // Workday dropdowns: click to open, then select from list
    const trigger = container.querySelector(
      'button, [role="button"], [data-automation-id*="select"], .css-1vqj0ow'
    ) || container;

    trigger.click();
    await delay(500);

    // Wait for options to appear
    const optionsList = document.querySelector(
      '[data-automation-id="selectOption"], [role="option"], ' +
      '.css-9m7glq, [data-automation-id*="promptOption"]'
    );

    if (!optionsList) {
      // Try to find options in a portal/overlay
      await delay(300);
    }

    // Find all visible options
    const options = document.querySelectorAll(
      '[data-automation-id*="promptOption"], [role="option"], ' +
      '[data-automation-id="selectOption"], .css-9m7glq'
    );

    const valueLower = String(value).toLowerCase();

    // Exact match first
    for (const opt of options) {
      if (opt.textContent.trim().toLowerCase() === valueLower) {
        opt.click();
        await delay(200);
        return { success: true };
      }
    }

    // Partial/fuzzy match
    for (const opt of options) {
      const text = opt.textContent.trim().toLowerCase();
      if (text.includes(valueLower) || valueLower.includes(text)) {
        opt.click();
        await delay(200);
        return { success: true };
      }
    }

    // Close dropdown if nothing matched (click elsewhere)
    document.body.click();
    await delay(200);
    return { success: false };

  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ============================================================
// WORKDAY-SPECIFIC RADIO SELECTION
// ============================================================

function selectWorkdayRadio(group, answer) {
  const radios = group.querySelectorAll('input[type="radio"], [role="radio"]');
  const answerLower = String(answer).toLowerCase();

  // Try exact match
  for (const radio of radios) {
    const label = findWorkdayLabel(radio) || radio.value || '';
    if (label.toLowerCase().trim() === answerLower) {
      radio.click();
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true };
    }
  }

  // Fuzzy match
  for (const radio of radios) {
    const label = (findWorkdayLabel(radio) || radio.value || '').toLowerCase();
    if ((answerLower === 'yes' && /^yes/i.test(label)) ||
        (answerLower === 'no' && /^no/i.test(label)) ||
        label.includes(answerLower) || answerLower.includes(label)) {
      radio.click();
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true };
    }
  }

  return { success: false };
}

// ============================================================
// RESUME UPLOAD
// ============================================================

async function uploadResumeIfPresent(resume, errors) {
  const dropZone = document.querySelector(
    '[data-automation-id="file-upload-drop-zone"], [data-automation-id="resumeDropzone"], ' +
    '[data-automation-id*="fileUpload"], input[type="file"]'
  );

  if (!dropZone) return false;

  const fileInput = dropZone.tagName === 'INPUT' ? dropZone :
    dropZone.querySelector('input[type="file"]');

  if (!fileInput) {
    // Workday may use drag-and-drop only — try clicking the zone to trigger file dialog
    const clickTarget = dropZone.querySelector('button, a, [role="button"]') || dropZone;
    clickTarget.click();
    await delay(500);
    const input = document.querySelector('input[type="file"]');
    if (!input) {
      errors.push('resume: no file input found after clicking upload zone');
      return false;
    }
    try {
      const file = base64ToFile(resume.base64, resume.filename, resume.mimeType || 'application/pdf');
      const result = await uploadFile(input, file);
      return result.success;
    } catch (e) {
      errors.push(`resume: upload failed — ${e.message}`);
      return false;
    }
  }

  try {
    const file = base64ToFile(resume.base64, resume.filename, resume.mimeType || 'application/pdf');
    const result = await uploadFile(fileInput, file);
    return result.success;
  } catch (e) {
    errors.push(`resume: upload failed — ${e.message}`);
    return false;
  }
}

// ============================================================
// LABEL & NAVIGATION UTILITIES
// ============================================================

function findWorkdayLabel(element) {
  // 1. data-automation-id based label
  const automationId = element.getAttribute('data-automation-id');
  if (automationId) {
    const labelEl = element.querySelector('[data-automation-id*="formLabel"], [data-automation-id*="label"]');
    if (labelEl) return labelEl.textContent.trim();
  }

  // 2. Standard label[for]
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label) return label.textContent.trim();
  }

  // 3. aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  // 4. Parent container label
  const container = element.closest('[data-automation-id]');
  if (container) {
    const labelEl = container.querySelector('label, [data-automation-id*="label"], legend');
    if (labelEl && labelEl !== element) return labelEl.textContent.trim();
  }

  // 5. Preceding label sibling
  const prev = element.previousElementSibling;
  if (prev && (prev.tagName === 'LABEL' || prev.querySelector('label'))) {
    return (prev.tagName === 'LABEL' ? prev : prev.querySelector('label')).textContent.trim();
  }

  // 6. Placeholder
  if (element.placeholder) return element.placeholder.trim();

  return null;
}

function matchWorkdayLabel(label, profile, preferences) {
  if (!label) return null;

  for (const { pattern, value } of WORKDAY_LABEL_PATTERNS) {
    if (pattern.test(label)) {
      const val = value(profile, preferences);
      if (val) return val;
    }
  }

  // Also check question patterns for text answer fields
  for (const { pattern, answer } of WORKDAY_QUESTION_PATTERNS) {
    if (pattern.test(label)) {
      return answer(preferences);
    }
  }

  // v5.40: Multilingual fallback — FR/ES/DE/IT label detection
  const multiMatch = matchMultilingualLabel(label, profile, preferences);
  if (multiMatch) return multiMatch.value;

  return null;
}

function matchWorkdayQuestion(label, preferences) {
  if (!label) return null;

  for (const { pattern, answer } of WORKDAY_QUESTION_PATTERNS) {
    if (pattern.test(label)) {
      return answer(preferences);
    }
  }

  return null;
}

function getWorkdayPageTitle() {
  const titleEl = document.querySelector(
    '[data-automation-id="pageHeaderTitle"], [data-automation-id="stepHeader"], ' +
    'h2[data-automation-id], .css-1vqj0ow h2'
  );
  return titleEl ? titleEl.textContent.trim() : 'Unknown page';
}

function isReviewPage() {
  const title = getWorkdayPageTitle().toLowerCase();
  return /review|submit|summary|confirmation/i.test(title);
}

async function clickNextButton() {
  const nextBtn = document.querySelector(
    '[data-automation-id="bottom-navigation-next-button"], ' +
    '[data-automation-id="nextButton"], ' +
    'button[data-automation-id*="next"], ' +
    'button[data-automation-id*="continue"]'
  );

  if (!nextBtn || nextBtn.disabled || nextBtn.offsetParent === null) return false;

  nextBtn.click();
  await delay(1500);

  // Verify we moved to a new page (check for error messages first)
  const errors = document.querySelectorAll(
    '[data-automation-id*="errorMessage"], .css-1tlkn1q, [role="alert"]'
  );

  if (errors.length > 0) {
    console.warn('[BJ] Workday: validation errors detected on current page');
    return false; // Stay on current page — user needs to fix errors
  }

  return true;
}

// ============================================================
// UTILITIES
// ============================================================

function waitForWorkdayPage(timeout = 15000) {
  return new Promise((resolve) => {
    const selectors = [
      '[data-automation-id="pageHeaderTitle"]',
      '[data-automation-id="legalNameSection_firstName"]',
      'form input[data-automation-id]',
      '[data-automation-id="file-upload-drop-zone"]',
      '[data-automation-id*="question"]',
    ];

    for (const sel of selectors) {
      if (document.querySelector(sel)) return resolve(true);
    }

    const obs = new MutationObserver(() => {
      for (const sel of selectors) {
        if (document.querySelector(sel)) {
          obs.disconnect();
          resolve(true);
          return;
        }
      }
    });

    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(false); }, timeout);
  });
}

function delay(ms) {
  const jitter = ms * 0.25;
  const actual = ms + (Math.random() * jitter * 2 - jitter);
  return new Promise(resolve => setTimeout(resolve, actual));
}

export { fill };
