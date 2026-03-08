// handlers/indeed.ts — Indeed ATS Form Filler
// v3.9.0: Phase 11 (P10-E) Indeed Apply handler
//
// Indeed has multiple application paths:
//   1. "Apply now" → Indeed's own hosted form (ia.indeed.com)
//   2. "Apply on company site" → redirects to employer's ATS (handled by other handlers)
//   3. "Easily apply" → Indeed's streamlined form
//
// Indeed's hosted apply form patterns:
//   - Form container: #ia-container, .ia-BasePage, form[data-testid]
//   - Field containers: .ia-Questions-item, [data-testid*="question"]
//   - Labels: <label>, .ia-Questions-item-label, [data-testid*="label"]
//   - Text inputs: standard input + textarea
//   - Dropdowns: <select> or custom div[role="listbox"]
//   - File upload: input[type="file"] or button.ia-FileUpload
//   - Radio/checkbox: standard + custom div[role="radiogroup"]
//   - Multi-step: Indeed often splits into pages (contact → experience → questions → review)
//   - Continue buttons: button[data-testid="continue"], .ia-continueButton, button:contains("Continue")
//
// Fuzzy matching is required because Indeed's forms are employer-customizable.
// Field labels vary significantly across postings.

import { fillTextInput } from '../fields/textInput.ts';
import { fillSelect, fillCheckboxRadio, fillCustomDropdown } from '../fields/dropdown.ts';
import { fillSearchableDropdown } from '../fields/dropdownSearchable.ts';
import { uploadFile, base64ToFile } from '../utils/fileUpload.ts';
import { FieldFillerQueue } from '../utils/fieldFillerQueue.ts';
import { matchMultilingualLabel } from '../utils/multilingualLabels.ts';

// ============================================================
// FUZZY LABEL MATCHING
// ============================================================

// Label patterns → profile property.
// Uses regex for fuzzy matching since Indeed labels are employer-customizable.
const INDEED_LABEL_PATTERNS = [
  { pattern: /^first\s*name/i, value: (p) => p.firstName },
  { pattern: /^last\s*name/i, value: (p) => p.lastName },
  { pattern: /^full\s*name|^name$/i, value: (p) => [p.firstName, p.lastName].filter(Boolean).join(' ') },
  { pattern: /e-?mail/i, value: (p) => p.email },
  { pattern: /phone|mobile|cell|telephone/i, value: (p) => p.phone },
  { pattern: /city|location/i, value: (p) => p.city || p.location },
  { pattern: /state|province/i, value: (p) => p.state },
  { pattern: /zip|postal/i, value: (p) => p.zip },
  { pattern: /address|street/i, value: (p) => p.address },
  { pattern: /country/i, value: (p) => p.country || 'United States' },
  { pattern: /linkedin/i, value: (p) => p.linkedin },
  { pattern: /github/i, value: (p) => p.github },
  { pattern: /portfolio|website|url|personal\s*site/i, value: (p) => p.portfolio || p.website },
  { pattern: /current\s*(company|employer|organization)/i, value: (p) => p.currentCompany },
  { pattern: /current\s*(title|position|role|job\s*title)/i, value: (p) => p.currentTitle },
  { pattern: /headline|summary|about/i, value: (p) => p.summary },
  { pattern: /years?\s*(of\s*)?(experience|exp)/i, value: (p) => p.yearsExperience },
  { pattern: /salary|compensation|pay\s*expect/i, value: (p, pref) => pref.salaryExpectation },
  { pattern: /cover\s*letter/i, value: (p) => p.coverLetter },
  { pattern: /school|university|college|education/i, value: (p) => p.school },
  { pattern: /degree/i, value: (p) => p.degree },
  { pattern: /major|field\s*of\s*study/i, value: (p) => p.major },
  { pattern: /gpa|grade/i, value: (p) => p.gpa },
];

// Smart question patterns — visa, authorization, relocation, etc.
const INDEED_QUESTION_PATTERNS = [
  { pattern: /authorized\s*to\s*work|legally\s*authorized|work\s*(authorization|permit)|eligible\s*to\s*work/i, answer: (pref) => pref.workAuthorization || 'Yes' },
  { pattern: /visa\s*sponsor|require\s*sponsor|need\s*sponsor/i, answer: (pref) => pref.requireSponsorship || 'No' },
  { pattern: /willing\s*to\s*relocate|open\s*to\s*relocation/i, answer: (pref) => pref.willingToRelocate || 'Yes' },
  { pattern: /willing\s*to\s*commute|commute\s*to/i, answer: (pref) => pref.willingToCommute || 'Yes' },
  { pattern: /willing\s*to\s*travel|travel\s*require|percent.*travel/i, answer: (pref) => pref.willingToTravel || 'Yes' },
  { pattern: /background\s*check|criminal|conviction|felony/i, answer: (pref) => pref.backgroundCheck || 'No' },
  { pattern: /drug\s*(test|screen)/i, answer: (pref) => pref.drugTest || 'Yes' },
  { pattern: /start\s*date|when\s*can\s*you\s*start|available\s*to\s*start|earliest\s*start/i, answer: (pref) => pref.startDate || 'Immediately' },
  { pattern: /security\s*clearance/i, answer: (pref) => pref.securityClearance || 'No' },
  { pattern: /veteran|military\s*service/i, answer: (pref) => pref.veteranStatus || 'No' },
  { pattern: /disabled|disability/i, answer: (pref) => pref.disabilityStatus || 'Prefer not to say' },
  { pattern: /gender|sex/i, answer: (pref) => pref.gender || 'Prefer not to say' },
  { pattern: /race|ethnicity/i, answer: (pref) => pref.ethnicity || 'Prefer not to say' },
  { pattern: /18\s*years|age.*18|over.*18/i, answer: () => 'Yes' },
  { pattern: /how\s*did\s*you\s*hear|how\s*did\s*you\s*find|referral\s*source|source/i, answer: () => 'Job Board' },
  { pattern: /shift|schedule|work\s*hours|available\s*to\s*work/i, answer: (pref) => pref.shiftPreference || 'Full-time' },
];

// ============================================================
// MAIN FILL FUNCTION
// ============================================================

/**
 * Main fill function — called by contentScript.js handler router.
 *
 * @param {Object} params
 * @param {Object} params.profile - User profile data
 * @param {Object} params.resume - { base64, filename, mimeType }
 * @param {Object} params.preferences - User preferences
 * @returns {Object} { success, filledCount, totalFields, errors, needsIntervention, multiStep }
 */
async function fill({ profile, resume, preferences }) {
  const errors = [];
  let filledCount = 0;
  let totalFields = 0;
  let currentStep = 0;
  const maxSteps = 8; // Safety cap

  const queue = new FieldFillerQueue({
    betweenFields: 150, // Slightly slower than other handlers — Indeed watches for automation
    onError: ({ field, error }) => errors.push(`${field}: ${error}`)
  });

  // ── Wait for form to be interactive ──
  await waitForForm();

  // ── Multi-step loop: fill current page, click Continue, repeat ──
  let hasMoreSteps = true;
  while (hasMoreSteps && currentStep < maxSteps) {
    currentStep++;
    const stepResult = await fillCurrentStep(profile, resume, preferences, queue);
    filledCount += stepResult.filledCount;
    totalFields += stepResult.totalFields;
    errors.push(...stepResult.errors);

    // Try to advance to next step
    hasMoreSteps = await advanceToNextStep();
    if (hasMoreSteps) {
      await delay(800); // Wait for next page to render
      await waitForForm();
    }
  }

  return {
    success: errors.length === 0 || filledCount > 0,
    filledCount,
    totalFields,
    errors,
    needsIntervention: errors.length > 0 || totalFields - filledCount > 2,
    multiStep: currentStep > 1,
    stepsCompleted: currentStep,
  };
}

// ============================================================
// STEP FILLING
// ============================================================

async function fillCurrentStep(profile, resume, preferences, queue) {
  const errors = [];
  let filledCount = 0;
  let totalFields = 0;

  // ── TEXT INPUTS & TEXTAREAS ──
  const inputs = document.querySelectorAll(
    'input[type="text"], input[type="email"], input[type="tel"], ' +
    'input[type="url"], input[type="number"], textarea'
  );

  for (const input of inputs) {
    if (input.offsetParent === null || input.disabled || input.readOnly) continue;
    if (input.value && input.value.trim().length > 0) continue; // Already filled

    const label = findFieldLabel(input);
    if (!label) continue;

    const value = matchLabelToValue(label, profile, preferences);
    if (!value) continue;

    totalFields++;
    queue.enqueue(async () => {
      const result = await fillTextInput(input, String(value), { humanLike: true });
      if (result.success) filledCount++;
      return result;
    }, label);
  }

  // ── STANDARD <SELECT> DROPDOWNS ──
  const selects = document.querySelectorAll('select:not([aria-hidden="true"])');
  for (const select of selects) {
    if (select.offsetParent === null || select.disabled) continue;
    if (select.selectedIndex > 0) continue; // Already selected

    const label = findFieldLabel(select);
    if (!label) continue;

    const value = matchLabelToValue(label, profile, preferences);
    if (!value) continue;

    totalFields++;
    queue.enqueue(async () => {
      const result = fillSelect(select, value);
      if (result.success) filledCount++;
      return result;
    }, label);
  }

  // ── CUSTOM DROPDOWNS (div[role="listbox"], div[role="combobox"]) ──
  const customDropdowns = document.querySelectorAll(
    '[role="listbox"], [role="combobox"], ' +
    '[data-testid*="dropdown"], .ia-Dropdown'
  );
  for (const dd of customDropdowns) {
    if (dd.offsetParent === null) continue;

    const label = findFieldLabel(dd);
    if (!label) continue;

    const value = matchLabelToValue(label, profile, preferences);
    if (!value) continue;

    totalFields++;
    queue.enqueue(async () => {
      try {
        const result = await fillCustomDropdown(dd, value);
        if (result.success) filledCount++;
        return result;
      } catch (e) {
        errors.push(`${label}: dropdown fill failed — ${e.message}`);
        return { success: false };
      }
    }, label);
  }

  // ── RADIO GROUPS ──
  const radioGroups = document.querySelectorAll(
    '[role="radiogroup"], fieldset:has(input[type="radio"]), ' +
    '.ia-Questions-item:has(input[type="radio"])'
  );
  for (const group of radioGroups) {
    if (group.offsetParent === null) continue;

    const label = findFieldLabel(group) || group.querySelector('legend')?.textContent?.trim();
    if (!label) continue;

    const answer = matchQuestionToAnswer(label, preferences);
    if (!answer) continue;

    totalFields++;
    queue.enqueue(async () => {
      const result = selectRadioAnswer(group, answer);
      if (result.success) filledCount++;
      return result;
    }, label);
  }

  // ── CHECKBOXES ──
  const checkboxes = document.querySelectorAll(
    'input[type="checkbox"]:not(:checked)'
  );
  for (const cb of checkboxes) {
    if (cb.offsetParent === null || cb.disabled) continue;

    const label = findFieldLabel(cb);
    if (!label) continue;

    // Auto-check agreement/terms/consent checkboxes
    if (/agree|terms|consent|acknowledge|certif/i.test(label)) {
      totalFields++;
      queue.enqueue(async () => {
        cb.click();
        filledCount++;
        return { success: true };
      }, label);
    }
  }

  // ── RESUME UPLOAD ──
  if (resume && resume.base64) {
    const fileInput = document.querySelector(
      'input[type="file"][accept*="pdf"], input[type="file"][accept*="doc"], ' +
      'input[type="file"][name*="resume"], input[type="file"][name*="Resume"], ' +
      'input[type="file"][data-testid*="resume"], input[type="file"]'
    );

    if (fileInput && !fileInput.files?.length) {
      totalFields++;
      queue.enqueue(async () => {
        try {
          const file = base64ToFile(resume.base64, resume.filename, resume.mimeType || 'application/pdf');
          const result = await uploadFile(fileInput, file);
          if (result.success) filledCount++;
          return result;
        } catch (e) {
          errors.push(`resume: upload failed — ${e.message}`);
          return { success: false };
        }
      }, 'resume');
    }
  }

  await queue.run();
  return { filledCount, totalFields, errors };
}

// ============================================================
// MULTI-STEP NAVIGATION
// ============================================================

async function advanceToNextStep() {
  // Indeed uses various "Continue" / "Next" buttons between steps
  const continueSelectors = [
    'button[data-testid="continue-button"]',
    'button[data-testid="next-button"]',
    '.ia-continueButton button',
    '.ia-BasePage-footer button:not([data-testid*="back"])',
    'button.ia-continueButton',
    'button:not([type="submit"]):not([data-testid*="back"])',
  ];

  for (const selector of continueSelectors) {
    const buttons = document.querySelectorAll(selector);
    for (const btn of buttons) {
      const text = btn.textContent.trim().toLowerCase();
      if ((text === 'continue' || text === 'next' || text === 'save and continue')
          && !btn.disabled && btn.offsetParent !== null) {
        btn.click();
        // Wait for page transition
        await delay(1200);
        // Check if we actually moved (URL change or DOM change)
        return document.querySelector('.ia-Questions-item, [data-testid*="question"], form input') !== null;
      }
    }
  }

  return false;
}

// ============================================================
// LABEL MATCHING UTILITIES
// ============================================================

function findFieldLabel(element) {
  // 1. Check <label> with for= attribute
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label) return label.textContent.trim();
  }

  // 2. Check aria-label / aria-labelledby
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  const ariaLabelledBy = element.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const el = document.getElementById(ariaLabelledBy);
    if (el) return el.textContent.trim();
  }

  // 3. Check parent label
  const parentLabel = element.closest('label');
  if (parentLabel) return parentLabel.textContent.trim();

  // 4. Check previous sibling label
  const prev = element.previousElementSibling;
  if (prev && prev.tagName === 'LABEL') return prev.textContent.trim();

  // 5. Check Indeed-specific containers
  const container = element.closest('.ia-Questions-item, [data-testid*="question"], .form-group, .field-container');
  if (container) {
    const labelEl = container.querySelector('label, .ia-Questions-item-label, [data-testid*="label"], legend, .field-label');
    if (labelEl) return labelEl.textContent.trim();
  }

  // 6. Check placeholder
  if (element.placeholder) return element.placeholder.trim();

  // 7. Check name attribute as last resort
  if (element.name) return element.name.replace(/[_\-\[\]]/g, ' ').trim();

  return null;
}

function matchLabelToValue(label, profile, preferences) {
  if (!label) return null;
  const normalized = label.toLowerCase().trim();

  // Try profile fields first
  for (const { pattern, value } of INDEED_LABEL_PATTERNS) {
    if (pattern.test(normalized)) {
      const val = value(profile, preferences);
      if (val) return val;
    }
  }

  // Try question patterns (for text-based answers)
  for (const { pattern, answer } of INDEED_QUESTION_PATTERNS) {
    if (pattern.test(normalized)) {
      return answer(preferences);
    }
  }

  // v5.40: Multilingual fallback — FR/ES/DE/IT label detection
  const multiMatch = matchMultilingualLabel(label, profile, preferences);
  if (multiMatch) return multiMatch.value;

  return null;
}

function matchQuestionToAnswer(label, preferences) {
  if (!label) return null;
  const normalized = label.toLowerCase().trim();

  for (const { pattern, answer } of INDEED_QUESTION_PATTERNS) {
    if (pattern.test(normalized)) {
      return answer(preferences);
    }
  }

  return null;
}

function selectRadioAnswer(group, answer) {
  const radios = group.querySelectorAll('input[type="radio"]');
  const answerLower = String(answer).toLowerCase();

  for (const radio of radios) {
    const label = findFieldLabel(radio) || radio.value;
    if (!label) continue;

    const labelLower = label.toLowerCase().trim();
    if (labelLower === answerLower || labelLower.startsWith(answerLower) ||
        answerLower.startsWith(labelLower)) {
      radio.click();
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true };
    }
  }

  // Fuzzy: try "yes" matches "yes, ..." or partial match
  for (const radio of radios) {
    const label = (findFieldLabel(radio) || radio.value || '').toLowerCase();
    if ((answerLower === 'yes' && /^yes/i.test(label)) ||
        (answerLower === 'no' && /^no/i.test(label))) {
      radio.click();
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true };
    }
  }

  return { success: false };
}

// ============================================================
// UTILITIES
// ============================================================

function waitForForm(timeout = 10000) {
  return new Promise((resolve) => {
    const formSelectors = [
      '#ia-container form', 'form[data-testid]', '.ia-BasePage form',
      '.ia-Questions', 'form.ia-Questions', 'form',
    ];

    // Already present?
    for (const sel of formSelectors) {
      if (document.querySelector(sel)) return resolve(true);
    }

    // Wait via MutationObserver
    const obs = new MutationObserver(() => {
      for (const sel of formSelectors) {
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
  // Human-like jitter: ±20%
  const jitter = ms * 0.2;
  const actual = ms + (Math.random() * jitter * 2 - jitter);
  return new Promise(resolve => setTimeout(resolve, actual));
}

export { fill };
