// handlers/linkedin-easy-apply.js — LinkedIn Easy Apply Handler
// v3.5.0: Full implementation for Phase 7 (P10-C).
// Multi-step modal navigation, custom dropdowns, city typeahead,
// resume radio selection, smart question mapping, stuck detection,
// daily limit detection, human-like delays.
//
// IMPORTANT: LinkedIn Easy Apply is fundamentally different from ATS autofill:
// - Multi-step modal (1–10+ pages)
// - Custom [role="listbox"] dropdowns (not standard <select>)
// - City typeahead with autocomplete delay
// - Resume as radio card selection (not file upload)
// - Custom question mapping per step
// - Daily application limits enforced by LinkedIn
// - Anti-automation countermeasures required

import { fillTextInput } from '../fields/textInput.js';
import { FieldFillerQueue } from '../utils/fieldFillerQueue.js';
import { matchMultilingualLabel } from '../utils/multilingualLabels.js';

// ============================================================
// CONSTANTS
// ============================================================

const SELECTORS = {
  // Modal container — LinkedIn changes class names; role="dialog" is most stable
  modal: '[role="dialog"].jobs-easy-apply-modal, .artdeco-modal[role="dialog"], [role="dialog"][class*="easy-apply"], [role="dialog"][aria-labelledby*="easy-apply"]',
  modalContent: '.jobs-easy-apply-content, .artdeco-modal__content, [role="dialog"] [class*="content"]',

  // Navigation buttons — aria-label is most resilient to class name changes
  nextBtn: 'button[aria-label="Continue to next step"], button[aria-label="Next"], footer button[class*="primary"]:not([aria-label*="Submit"]):not([aria-label*="Review"])',
  reviewBtn: 'button[aria-label="Review your application"], button[aria-label="Review"], footer button[class*="primary"][aria-label*="eview"]',
  submitBtn: 'button[aria-label="Submit application"], button.jobs-apply-button[aria-label*="Submit"], button[aria-label*="Submit"][class*="primary"]',
  dismissBtn: 'button[aria-label="Dismiss"], button.artdeco-modal__dismiss, [role="dialog"] button[aria-label="Close"], [role="dialog"] button[data-test-modal-close-btn]',

  // Form elements
  textInput: 'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"]',
  textarea: 'textarea',
  select: 'select',
  customDropdown: '[role="listbox"]',
  customCombobox: '[role="combobox"]',
  radioGroup: 'fieldset input[type="radio"]',
  radioCard: 'input[type="radio"][name*="resume"]',
  checkbox: 'input[type="checkbox"]',
  fileInput: 'input[type="file"]',

  // Resume
  resumeRadio: 'input[type="radio"][name*="resume"]',
  resumeCard: '.jobs-document-upload-redesign-card, .jobs-resume-picker__resume-card',

  // City typeahead
  cityInput: 'input[id*="city"], input[aria-label*="City"], input[placeholder*="city"]',
  typeaheadOption: '[role="option"]',
  typeaheadListbox: '[role="listbox"]',

  // Unfollow checkbox
  unfollowCheckbox: 'input[id*="follow"], label[for*="follow"]',

  // Error / status indicators
  validationError: '.artdeco-inline-feedback--error, .fb-form-element--error',
  loadingScreen: '.jobs-apply-loading, .artdeco-loader',
  dailyLimitMsg: '.jobs-apply-limit, [class*="apply-limit"]',

  // Field labels
  label: 'label, .fb-dash-form-element__label, .artdeco-text-input--label',
  fieldContainer: '.fb-dash-form-element, .jobs-easy-apply-form-section__grouping',
};

const TIMING = {
  betweenActions: { min: 200, max: 600 },     // Human-like delays between actions
  typeaheadWait: 1000,                          // Wait for city autocomplete dropdown
  dynamicContentSettle: 800,                    // Wait for new step to render
  stuckTimeout: 120000,                         // 2 minutes — then refresh
  loadingTimeout: 20000,                        // 20s loading screen timeout
  beforeSubmit: 1500,                           // Pause before final submit
};

// ============================================================
// SMART QUESTION MAPPING
// ============================================================

const QUESTION_PATTERNS = {
  // Work authorization
  legallyAuthorized: [
    /authoriz.*work/i, /legal.*work/i, /legally.*authorized/i,
    /eligible.*work/i, /right.*work/i, /permit.*work/i,
    /authorized.*employment/i
  ],
  // Visa sponsorship
  visaSponsorship: [
    /visa/i, /sponsor/i, /immigration/i, /work.*permit/i,
    /require.*sponsorship/i, /need.*sponsor/i
  ],
  // Relocation
  willingToRelocate: [
    /relocat/i, /willing.*move/i, /open.*relocation/i,
    /move.*to/i, /willing.*relocat/i
  ],
  // Years of experience
  yearsExperience: [
    /years?.*experience/i, /years?.*exp/i, /how.*many.*years/i,
    /total.*experience/i, /professional.*experience/i
  ],
  // Salary
  desiredSalary: [
    /salary/i, /compensation/i, /pay.*expectation/i,
    /desired.*pay/i, /expected.*salary/i
  ],
  // Start date
  startDate: [
    /start.*date/i, /available.*start/i, /earliest.*start/i,
    /when.*start/i, /notice.*period/i
  ],
  // How did you hear
  referralSource: [
    /how.*hear/i, /referr/i, /source/i, /how.*find/i,
    /where.*learn/i, /discover.*position/i
  ],
  // Gender (EEO)
  gender: [/gender/i, /sex/i],
  // Race/Ethnicity (EEO)
  race: [/race/i, /ethnic/i],
  // Veteran
  veteran: [/veteran/i, /military/i, /armed.*forces/i],
  // Disability
  disability: [/disabilit/i, /handicap/i, /impairment/i],
  // LinkedIn profile
  linkedin: [/linkedin.*url/i, /linkedin.*profile/i],
  // Website / portfolio
  website: [/website/i, /portfolio/i, /personal.*url/i],
  // Phone
  phone: [/phone/i, /mobile/i, /cell/i, /telephone/i],
  // Email
  email: [/email/i, /e-mail/i],
  // First name
  firstName: [/first.*name/i, /given.*name/i],
  // Last name
  lastName: [/last.*name/i, /family.*name/i, /surname/i],
  // City / location
  city: [/city/i, /location/i, /where.*based/i, /current.*location/i],
  // Address
  address: [/address/i, /street/i],
  // Headline / summary
  headline: [/headline/i, /professional.*summary/i, /about.*you/i],
  // Education
  education: [/degree/i, /education/i, /school/i, /university/i, /college/i],
  // GPA
  gpa: [/gpa/i, /grade.*point/i],
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function humanDelay() {
  const ms = TIMING.betweenActions.min +
    Math.random() * (TIMING.betweenActions.max - TIMING.betweenActions.min);
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(msg, type = 'info') {
  const prefix = '[BJ-LinkedIn]';
  if (type === 'error') console.error(prefix, msg);
  else if (type === 'warn') console.warn(prefix, msg);
  else console.log(prefix, msg);
}

/**
 * Wait for a selector to appear, with timeout.
 */
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) {
        observer.disconnect();
        resolve(found);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      // CS-010: Report selector miss to background for PostHog tracking
      try {
        chrome.runtime.sendMessage({
          type: 'ats:selectorMisses',
          misses: [{ fn: 'waitForElement', context: 'linkedin', selectors: [selector.substring(0, 100)], url: window.location.href, timestamp: Date.now() }],
          count: 1,
          url: window.location.href
        }).catch(() => {});
      } catch (_) { console.warn('[BJ] linkedin selector miss report failed'); }
      resolve(null);
    }, timeout);
  });
}

/**
 * Wait for the modal step to settle after navigation.
 * Uses MutationObserver to detect when the DOM stops changing.
 */
function waitForStepSettle(timeout = TIMING.dynamicContentSettle) {
  return new Promise(resolve => {
    const modal = document.querySelector(SELECTORS.modal);
    if (!modal) return resolve();

    let timer;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        observer.disconnect();
        resolve();
      }, 300);
    });

    observer.observe(modal, { childList: true, subtree: true, characterData: true });
    timer = setTimeout(() => {
      observer.disconnect();
      resolve();
    }, timeout);
  });
}

/**
 * Find the label text for a LinkedIn form field.
 */
function findFieldLabel(el) {
  // Check aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  // Check explicit <label>
  const id = el.id;
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) return label.textContent.trim();
  }

  // Check parent field container
  const container = el.closest(SELECTORS.fieldContainer) || el.closest('div[class*="form"]');
  if (container) {
    const label = container.querySelector(SELECTORS.label);
    if (label) return label.textContent.trim();
  }

  // Check preceding sibling label
  const prev = el.previousElementSibling;
  if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN')) {
    return prev.textContent.trim();
  }

  return el.placeholder || el.name || '';
}

/**
 * Map a label to a profile/preferences value using QUESTION_PATTERNS.
 */
function mapLabelToValue(label, profile, preferences) {
  if (!label) return undefined;

  for (const [key, patterns] of Object.entries(QUESTION_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(label)) {
        // Profile fields
        if (key === 'firstName') return profile?.firstName;
        if (key === 'lastName') return profile?.lastName;
        if (key === 'email') return profile?.email;
        if (key === 'phone') return profile?.phone;
        if (key === 'linkedin') return profile?.linkedin;
        if (key === 'website') return profile?.portfolio || profile?.website;
        if (key === 'city') return profile?.location || profile?.city;
        if (key === 'address') return profile?.address;
        if (key === 'headline') return profile?.headline;
        if (key === 'education') return profile?.education;
        if (key === 'gpa') return profile?.gpa;

        // Preferences fields
        if (key === 'legallyAuthorized') return preferences?.legallyAuthorized;
        if (key === 'visaSponsorship') return preferences?.visaSponsorship;
        if (key === 'willingToRelocate') return preferences?.willingToRelocate;
        if (key === 'yearsExperience') return preferences?.yearsExperience;
        if (key === 'desiredSalary') return preferences?.desiredSalary;
        if (key === 'startDate') return preferences?.startDate || preferences?.availableDate;
        if (key === 'referralSource') return preferences?.referralSource || 'Job board';

        // EEO — decline to self-identify by default
        if (key === 'gender' || key === 'race' || key === 'veteran' || key === 'disability') {
          return preferences?.[key] || 'Decline to self-identify';
        }

        return undefined;
      }
    }
  }

  // v5.40: Multilingual fallback — FR/ES/DE/IT label detection
  const multiMatch = matchMultilingualLabel(label, profile, preferences);
  if (multiMatch) return multiMatch.value;

  return undefined;
}

/**
 * Match a value to the closest option in a LinkedIn custom dropdown.
 * Returns the best matching [role="option"] element.
 */
function findBestDropdownOption(listbox, value) {
  if (!listbox || !value) return null;

  const options = listbox.querySelectorAll('[role="option"], li');
  if (options.length === 0) return null;

  const normalizedValue = value.toLowerCase().trim();

  // Exact match first
  for (const opt of options) {
    const text = opt.textContent.trim().toLowerCase();
    if (text === normalizedValue) return opt;
  }

  // Partial match — value contained in option text
  for (const opt of options) {
    const text = opt.textContent.trim().toLowerCase();
    if (text.includes(normalizedValue) || normalizedValue.includes(text)) return opt;
  }

  // Yes/No boolean matching
  if (/^(yes|true|1)$/i.test(normalizedValue)) {
    for (const opt of options) {
      if (/^yes$/i.test(opt.textContent.trim())) return opt;
    }
  }
  if (/^(no|false|0)$/i.test(normalizedValue)) {
    for (const opt of options) {
      if (/^no$/i.test(opt.textContent.trim())) return opt;
    }
  }

  return null;
}

// ============================================================
// STEP FILLERS
// ============================================================

/**
 * Fill all text inputs on the current modal step.
 */
async function fillTextFields(profile, preferences, errors) {
  let filled = 0;
  let total = 0;

  const inputs = document.querySelectorAll(
    `${SELECTORS.modal} ${SELECTORS.textInput}, ${SELECTORS.modal} ${SELECTORS.textarea}`
  );

  for (const input of inputs) {
    // Skip already-filled fields
    if (input.value && input.value.trim().length > 0) continue;
    // Skip hidden fields
    if (input.offsetParent === null) continue;

    const label = findFieldLabel(input);
    const value = mapLabelToValue(label, profile, preferences);
    if (!value) continue;

    total++;
    try {
      const result = await fillTextInput(input, String(value), { humanLike: true });
      if (result.success) filled++;
      else errors.push(`Text field "${label}": ${result.error}`);
    } catch (e) {
      errors.push(`Text field "${label}": ${e.message}`);
    }
    await humanDelay();
  }

  return { filled, total };
}

/**
 * Fill standard <select> dropdowns on the current step.
 */
async function fillSelectDropdowns(profile, preferences, errors) {
  let filled = 0;
  let total = 0;

  const selects = document.querySelectorAll(`${SELECTORS.modal} select`);

  for (const select of selects) {
    if (select.value && select.value !== '') continue;
    if (select.offsetParent === null) continue;

    const label = findFieldLabel(select);
    const value = mapLabelToValue(label, profile, preferences);
    if (!value) continue;

    total++;
    const options = Array.from(select.options);
    const match = options.find(o =>
      o.text.toLowerCase().includes(String(value).toLowerCase()) ||
      o.value.toLowerCase() === String(value).toLowerCase()
    );

    if (match) {
      select.value = match.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      filled++;
    } else {
      errors.push(`Select "${label}": no matching option for "${value}"`);
    }
    await humanDelay();
  }

  return { filled, total };
}

/**
 * Fill LinkedIn custom [role="listbox"] dropdowns.
 * These are NOT standard <select> elements.
 */
async function fillCustomDropdowns(profile, preferences, errors) {
  let filled = 0;
  let total = 0;

  // Find combobox triggers or custom dropdown triggers
  const triggers = document.querySelectorAll(
    `${SELECTORS.modal} [role="combobox"], ${SELECTORS.modal} [aria-haspopup="listbox"]`
  );

  for (const trigger of triggers) {
    if (trigger.offsetParent === null) continue;

    const label = findFieldLabel(trigger);
    const value = mapLabelToValue(label, profile, preferences);
    if (!value) continue;

    total++;
    try {
      // Click to open the dropdown
      trigger.click();
      await sleep(400);

      // Find the listbox
      const listbox = document.querySelector(`${SELECTORS.modal} [role="listbox"]`) ||
                       trigger.closest('[data-test-form-element]')?.querySelector('[role="listbox"]');

      if (!listbox) {
        errors.push(`Custom dropdown "${label}": listbox not found after click`);
        // Press Escape to close
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        continue;
      }

      const bestOption = findBestDropdownOption(listbox, String(value));
      if (bestOption) {
        bestOption.click();
        filled++;
      } else {
        errors.push(`Custom dropdown "${label}": no matching option for "${value}"`);
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }
    } catch (e) {
      errors.push(`Custom dropdown "${label}": ${e.message}`);
    }
    await humanDelay();
  }

  return { filled, total };
}

/**
 * Fill city typeahead fields.
 * Type the city, wait for the autocomplete dropdown, click the first match.
 */
async function fillCityTypeahead(profile, preferences, errors) {
  let filled = 0;
  let total = 0;

  const cityInputs = document.querySelectorAll(`${SELECTORS.modal} ${SELECTORS.cityInput}`);

  for (const input of cityInputs) {
    if (input.value && input.value.trim().length > 0) continue;
    if (input.offsetParent === null) continue;

    const cityValue = profile?.city || profile?.location;
    if (!cityValue) continue;

    total++;
    try {
      // Clear and type the city
      input.focus();
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(100);

      // Type character by character for more natural behavior
      for (const char of cityValue) {
        input.value += char;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(50 + Math.random() * 50);
      }

      // Wait for autocomplete dropdown
      await sleep(TIMING.typeaheadWait);

      // Click the first option
      const option = document.querySelector(
        `${SELECTORS.modal} ${SELECTORS.typeaheadOption}`
      );

      if (option) {
        option.click();
        filled++;
      } else {
        // Fallback: ArrowDown + Enter
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await sleep(200);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        filled++;
        log(`City typeahead: used ArrowDown+Enter fallback for "${cityValue}"`, 'warn');
      }
    } catch (e) {
      errors.push(`City typeahead: ${e.message}`);
    }
    await humanDelay();
  }

  return { filled, total };
}

/**
 * Handle resume selection.
 * LinkedIn uses radio cards for existing resumes, not file upload.
 * Only fall back to file input if no existing resume found.
 */
async function handleResumeSelection(resume, errors) {
  let filled = 0;
  let total = 0;

  // Try radio card selection first (existing resume on LinkedIn)
  const resumeRadios = document.querySelectorAll(`${SELECTORS.modal} ${SELECTORS.resumeRadio}`);
  if (resumeRadios.length > 0) {
    total++;
    // Select the first (most recent) resume card
    const firstResume = resumeRadios[0];
    if (!firstResume.checked) {
      firstResume.click();
      firstResume.dispatchEvent(new Event('change', { bubbles: true }));
    }
    filled++;
    log('Selected existing resume via radio card');
    return { filled, total };
  }

  // Fallback: file upload input (rare on Easy Apply)
  const fileInput = document.querySelector(`${SELECTORS.modal} ${SELECTORS.fileInput}`);
  if (fileInput && resume?.base64) {
    total++;
    try {
      const { base64ToFile, uploadFile } = await import('../utils/fileUpload.js');
      const file = base64ToFile(resume.base64, resume.filename || 'resume.pdf', resume.mimeType);
      const result = await uploadFile(fileInput, file);
      if (result.success) filled++;
      else errors.push(`Resume upload: ${result.error}`);
    } catch (e) {
      errors.push(`Resume upload: ${e.message}`);
    }
  }

  return { filled, total };
}

/**
 * Fill radio button groups (non-resume).
 */
async function fillRadioGroups(profile, preferences, errors) {
  let filled = 0;
  let total = 0;

  const fieldsets = document.querySelectorAll(`${SELECTORS.modal} fieldset`);

  for (const fieldset of fieldsets) {
    if (fieldset.offsetParent === null) continue;
    const radios = fieldset.querySelectorAll('input[type="radio"]');
    if (radios.length === 0) continue;
    // Skip resume radio groups
    if (radios[0].name && radios[0].name.includes('resume')) continue;
    // Skip if already selected
    if (Array.from(radios).some(r => r.checked)) continue;

    const label = findFieldLabel(fieldset) || findFieldLabel(radios[0]);
    const value = mapLabelToValue(label, profile, preferences);
    if (!value) continue;

    total++;
    const normalizedValue = String(value).toLowerCase();

    // Find matching radio by label text
    let matched = false;
    for (const radio of radios) {
      const radioLabel = radio.parentElement?.textContent?.trim()?.toLowerCase() || '';
      if (radioLabel.includes(normalizedValue) || normalizedValue.includes(radioLabel) ||
          (normalizedValue === 'yes' && radioLabel === 'yes') ||
          (normalizedValue === 'no' && radioLabel === 'no')) {
        radio.click();
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        filled++;
        matched = true;
        break;
      }
    }

    if (!matched) {
      errors.push(`Radio group "${label}": no matching option for "${value}"`);
    }
    await humanDelay();
  }

  return { filled, total };
}

/**
 * Handle checkbox fields.
 */
async function fillCheckboxes(profile, preferences, errors) {
  let filled = 0;
  let total = 0;

  const checkboxes = document.querySelectorAll(`${SELECTORS.modal} input[type="checkbox"]`);

  for (const cb of checkboxes) {
    if (cb.offsetParent === null) continue;
    if (cb.checked) continue;
    // Skip follow company checkbox (we uncheck it later)
    if (cb.id?.includes('follow') || cb.name?.includes('follow')) continue;

    const label = findFieldLabel(cb);
    const value = mapLabelToValue(label, profile, preferences);
    if (value === undefined) continue;

    total++;
    if (value === true || value === 'yes' || value === 'Yes') {
      cb.click();
      filled++;
    }
    await humanDelay();
  }

  return { filled, total };
}

// ============================================================
// MODAL NAVIGATION
// ============================================================

/**
 * Detect if we've hit LinkedIn's daily Easy Apply limit.
 */
function detectDailyLimit() {
  const limitMsg = document.querySelector(SELECTORS.dailyLimitMsg);
  if (limitMsg) return true;

  // Check body text for limit message
  const modal = document.querySelector(SELECTORS.modal);
  if (modal) {
    const text = modal.textContent.toLowerCase();
    if (text.includes('reached') && text.includes('limit') && text.includes('easy apply')) {
      return true;
    }
  }
  return false;
}

/**
 * Check for validation errors on current step.
 */
function hasValidationErrors() {
  return document.querySelectorAll(`${SELECTORS.modal} ${SELECTORS.validationError}`).length > 0;
}

/**
 * Get the current step number and total (from progress bar).
 */
function getStepProgress() {
  // LinkedIn shows progress like "Step 1 of 4" or as aria-valuetext on progress bar
  const progressBar = document.querySelector(`${SELECTORS.modal} progress, ${SELECTORS.modal} [role="progressbar"]`);
  if (progressBar) {
    const valueText = progressBar.getAttribute('aria-valuetext') || '';
    const match = valueText.match(/(\d+)\s*of\s*(\d+)/i);
    if (match) return { current: parseInt(match[1]), total: parseInt(match[2]) };

    const value = parseFloat(progressBar.getAttribute('aria-valuenow') || progressBar.value || 0);
    const max = parseFloat(progressBar.getAttribute('aria-valuemax') || progressBar.max || 100);
    if (max > 0) return { current: Math.round(value / max * 10), total: 10 };
  }

  return { current: 0, total: 0 };
}

/**
 * Click the next/review/submit button.
 * Returns the action taken: 'next', 'review', 'submit', or null.
 */
async function clickNavButton() {
  // Priority: Submit > Review > Next
  const submitBtn = document.querySelector(`${SELECTORS.modal} ${SELECTORS.submitBtn}`);
  if (submitBtn && !submitBtn.disabled) {
    await sleep(TIMING.beforeSubmit);
    submitBtn.click();
    return 'submit';
  }

  const reviewBtn = document.querySelector(`${SELECTORS.modal} ${SELECTORS.reviewBtn}`);
  if (reviewBtn && !reviewBtn.disabled) {
    reviewBtn.click();
    return 'review';
  }

  const nextBtn = document.querySelector(`${SELECTORS.modal} ${SELECTORS.nextBtn}`);
  if (nextBtn && !nextBtn.disabled) {
    nextBtn.click();
    return 'next';
  }

  return null;
}

/**
 * Unfollow company before submitting (optional — prevents LinkedIn spam).
 */
function unfollowCompany() {
  const followCheckbox = document.querySelector(`${SELECTORS.modal} ${SELECTORS.unfollowCheckbox}`);
  if (!followCheckbox) return;

  if (followCheckbox.tagName === 'INPUT' && followCheckbox.checked) {
    followCheckbox.click();
    log('Unchecked "Follow company" checkbox');
  } else if (followCheckbox.tagName === 'LABEL') {
    const input = document.getElementById(followCheckbox.getAttribute('for'));
    if (input && input.checked) {
      input.click();
      log('Unchecked "Follow company" via label');
    }
  }
}

// ============================================================
// MAIN FILL FUNCTION
// ============================================================

/**
 * Main fill function — orchestrates multi-step Easy Apply modal.
 *
 * @param {Object} params
 * @param {Object} params.profile - User profile data
 * @param {Object} params.resume - { base64, filename, mimeType }
 * @param {Object} params.preferences - User preferences (visa, relocation, etc.)
 * @returns {Object} { success, filledCount, totalFields, errors, stepsCompleted, ats }
 */
async function fill({ profile, resume, preferences }) {
  const errors = [];
  let totalFilled = 0;
  let totalFields = 0;
  let stepsCompleted = 0;
  let stuckTimer = null;
  let isStuck = false;

  log('Starting LinkedIn Easy Apply fill');

  // ── Pre-check: daily limit ──
  if (detectDailyLimit()) {
    return {
      success: false,
      filledCount: 0,
      totalFields: 0,
      errors: ['LinkedIn daily Easy Apply limit reached. Try again tomorrow.'],
      stepsCompleted: 0,
      ats: 'linkedin-easy-apply'
    };
  }

  // ── Pre-check: modal visible ──
  const modal = await waitForElement(SELECTORS.modal, 5000);
  if (!modal) {
    return {
      success: false,
      filledCount: 0,
      totalFields: 0,
      errors: ['Easy Apply modal not found. Is the job listing open?'],
      stepsCompleted: 0,
      ats: 'linkedin-easy-apply'
    };
  }

  // ── Stuck detection: 2-minute timeout ──
  const startStuckDetection = () => {
    clearTimeout(stuckTimer);
    stuckTimer = setTimeout(() => {
      isStuck = true;
      log('STUCK DETECTED: 2-minute timeout on a single step', 'error');
    }, TIMING.stuckTimeout);
  };

  // ── Loading screen timeout ──
  const waitForLoadingClear = async () => {
    const loadingEl = document.querySelector(`${SELECTORS.modal} ${SELECTORS.loadingScreen}`);
    if (!loadingEl) return true;

    return new Promise(resolve => {
      const timeout = setTimeout(() => {
        observer.disconnect();
        resolve(false);
      }, TIMING.loadingTimeout);

      const observer = new MutationObserver(() => {
        if (!document.querySelector(`${SELECTORS.modal} ${SELECTORS.loadingScreen}`)) {
          clearTimeout(timeout);
          observer.disconnect();
          resolve(true);
        }
      });
      observer.observe(modal, { childList: true, subtree: true });
    });
  };

  // ── Multi-step loop ──
  const MAX_STEPS = 15; // Safety limit

  for (let step = 0; step < MAX_STEPS; step++) {
    if (isStuck) {
      errors.push('Form got stuck — timed out on a step. Page may need refresh.');
      break;
    }

    // Reset stuck timer for each new step
    startStuckDetection();

    // Wait for loading to clear
    const loadingCleared = await waitForLoadingClear();
    if (!loadingCleared) {
      errors.push('Loading screen timed out (20s).');
      break;
    }

    // Wait for dynamic content to settle
    await waitForStepSettle();

    log(`Filling step ${step + 1}...`);

    // Check for daily limit mid-flow
    if (detectDailyLimit()) {
      errors.push('LinkedIn daily Easy Apply limit reached during application.');
      break;
    }

    // ── Fill all field types on this step ──
    const textResult = await fillTextFields(profile, preferences, errors);
    const selectResult = await fillSelectDropdowns(profile, preferences, errors);
    const customResult = await fillCustomDropdowns(profile, preferences, errors);
    const cityResult = await fillCityTypeahead(profile, preferences, errors);
    const resumeResult = await handleResumeSelection(resume, errors);
    const radioResult = await fillRadioGroups(profile, preferences, errors);
    const checkboxResult = await fillCheckboxes(profile, preferences, errors);

    const stepFilled = textResult.filled + selectResult.filled + customResult.filled +
      cityResult.filled + resumeResult.filled + radioResult.filled + checkboxResult.filled;
    const stepTotal = textResult.total + selectResult.total + customResult.total +
      cityResult.total + resumeResult.total + radioResult.total + checkboxResult.total;

    totalFilled += stepFilled;
    totalFields += stepTotal;

    log(`Step ${step + 1}: filled ${stepFilled}/${stepTotal} fields`);

    // ── Unfollow company on review/submit steps ──
    unfollowCompany();

    // ── Navigate to next step ──
    await humanDelay();
    const action = await clickNavButton();

    if (action === 'submit') {
      stepsCompleted = step + 1;
      log(`Application submitted after ${stepsCompleted} steps`);
      break;
    }

    if (action === 'next' || action === 'review') {
      stepsCompleted = step + 1;
      // Wait for page transition
      await sleep(TIMING.dynamicContentSettle);
      continue;
    }

    // No button found — check for validation errors
    if (hasValidationErrors()) {
      errors.push(`Step ${step + 1}: validation errors present — fields may need manual attention`);
      stepsCompleted = step + 1;
      break;
    }

    // No nav button and no errors — we might be done or stuck
    log(`Step ${step + 1}: no navigation button found`, 'warn');
    stepsCompleted = step + 1;
    break;
  }

  // Cleanup
  clearTimeout(stuckTimer);

  const needsIntervention = hasValidationErrors() || errors.length > 0 || isStuck;

  return {
    success: !needsIntervention && stepsCompleted > 0,
    filledCount: totalFilled,
    totalFields: totalFields,
    errors,
    stepsCompleted,
    needsIntervention,
    interventionReason: needsIntervention
      ? 'Some fields may need manual attention. Please review and submit.'
      : null,
    ats: 'linkedin-easy-apply'
  };
}

// Export the handler
export default { fill };
export { fill };
