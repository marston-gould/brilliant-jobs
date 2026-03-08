// handlers/greenhouse-legacy.ts — Greenhouse Legacy Board Form Filler
// v3.2.0: Full implementation for boards.greenhouse.io + boards.eu.greenhouse.io
// Standard HTML forms with select2 dropdowns, div.field containers.
// Key selectors: div.field (containers), select2-container, #s2id_* prefixes.
//
// Greenhouse legacy boards serve standard HTML. Inputs respond to normal
// DOM value + dispatchEvent. The main complexity is select2 searchable
// dropdowns for location, department, and custom questions.

import { fillTextInput } from '../fields/textInput.ts';
import { fillSelect, fillCheckboxRadio } from '../fields/dropdown.ts';
import { fillSearchableDropdown } from '../fields/dropdownSearchable.ts';
import { fillDateField } from '../fields/dateFields.ts';
import { fillCheckbox } from '../fields/checkbox.ts';
import { fillRadioGroup } from '../fields/radioGroup.ts';
import { FieldFillerQueue } from '../utils/fieldFillerQueue.ts';
import { uploadFile, base64ToFile } from '../utils/fileUpload.ts';
import { matchMultilingualLabel } from '../utils/multilingualLabels.ts';

// ============================================================
// FIELD MAP: Greenhouse Legacy CSS/name selectors → profile keys
// ============================================================

const GH_LEGACY_FIELD_MAP = [
  // Personal info
  { selector: '#first_name, input[name="job_application[first_name]"]', key: 'firstName' },
  { selector: '#last_name, input[name="job_application[last_name]"]', key: 'lastName' },
  { selector: '#email, input[name="job_application[email]"]', key: 'email' },
  { selector: '#phone, input[name="job_application[phone]"]', key: 'phone' },
  { selector: 'input[name="job_application[location]"]', key: 'location' },

  // URLs
  { selector: 'input[name="job_application[urls][LinkedIn]"], input[autocomplete="linkedin"]', key: 'linkedin' },
  { selector: 'input[name="job_application[urls][GitHub]"]', key: 'github' },
  { selector: 'input[name="job_application[urls][Portfolio]"], input[name="job_application[urls][Website]"]', key: 'portfolio' },

  // Company / title
  { selector: 'input[name*="[current_company]"], input[id*="current_company"]', key: 'currentCompany' },
  { selector: 'input[name*="[current_title]"], input[id*="current_title"]', key: 'currentTitle' },
];

// Education field patterns (repeating sections)
const EDUCATION_FIELDS = [
  { selector: 'input[name*="[school_name]"]', key: 'school' },
  { selector: 'input[name*="[degree]"]', key: 'degree' },
  { selector: 'input[name*="[discipline]"], input[name*="[major]"]', key: 'major' },
  { selector: 'input[name*="[start_date]"]', key: 'startDate' },
  { selector: 'input[name*="[end_date]"]', key: 'endDate' },
];

/**
 * Main fill function — called by contentScript.js handler router.
 *
 * @param {Object} params
 * @param {Object} params.profile - User profile data
 * @param {Object} params.resume  - { base64, filename, mimeType }
 * @param {Object} params.preferences - User preferences (visa, relocation, etc.)
 * @returns {Object} { success, filledCount, totalFields, errors, ats }
 */
async function fill({ profile, resume, preferences }) {
  const errors = [];
  let filledCount = 0;
  let totalFields = 0;

  const queue = new FieldFillerQueue({
    betweenFields: 120,
    renderDelay: 300,
    lazyLoadDelay: 1000,
    onError: ({ field, error }) => errors.push(`${field}: ${error}`)
  });

  // ---- 1. Standard text inputs ----
  for (const mapping of GH_LEGACY_FIELD_MAP) {
    const value = profile[mapping.key];
    if (!value) continue;

    const input = document.querySelector(mapping.selector);
    if (!input) continue;

    totalFields++;
    queue.enqueue(async () => {
      const result = await fillTextInput(input, value);
      if (result.success) filledCount++;
      return result;
    }, mapping.key);
  }

  // ---- 2. Standard <select> dropdowns ----
  const selects = document.querySelectorAll('div.field select:not(.select2-offscreen)');
  for (const select of selects) {
    const label = findFieldLabel(select);
    const value = mapLabelToValue(label, profile, preferences);
    if (!value) continue;

    totalFields++;
    queue.enqueue(async () => {
      const result = fillSelect(select, value);
      if (result.success) filledCount++;
      return result;
    }, label || select.name || 'select');
  }

  // ---- 3. Select2 searchable dropdowns ----
  const select2Containers = document.querySelectorAll(
    '.select2-container, [class*="select2-container"], div.field .s2-container'
  );
  for (const container of select2Containers) {
    const fieldDiv = container.closest('div.field, .field-group, .application-field');
    if (!fieldDiv) continue;

    const label = findFieldLabel(container);
    const value = mapLabelToValue(label, profile, preferences);
    if (!value) continue;

    totalFields++;
    queue.enqueue(async () => {
      const result = await fillSelect2Dropdown(container, value);
      if (result.success) filledCount++;
      else errors.push(`select2(${label}): ${result.error}`);
      return result;
    }, `select2:${label}`);
  }

  // ---- 4. Textareas (cover letter, additional info) ----
  const textareas = document.querySelectorAll('div.field textarea, .application-field textarea');
  for (const ta of textareas) {
    const label = findFieldLabel(ta);
    const value = mapTextareaValue(label, profile, preferences);
    if (!value) continue;

    totalFields++;
    queue.enqueue(async () => {
      const result = await fillTextInput(ta, value);
      if (result.success) filledCount++;
      return result;
    }, label || 'textarea');
  }

  // ---- 5. Checkboxes ----
  const checkboxes = document.querySelectorAll('div.field input[type="checkbox"]');
  for (const cb of checkboxes) {
    const label = findFieldLabel(cb);
    const value = mapLabelToValue(label, profile, preferences);
    if (value === undefined) continue;

    totalFields++;
    const result = fillCheckboxRadio(cb, value);
    if (result.success) filledCount++;
  }

  // ---- 6. Radio groups ----
  const radioGroups = findRadioGroups();
  for (const { name, container } of radioGroups) {
    const label = findFieldLabel(container);
    const value = mapLabelToValue(label, profile, preferences);
    if (!value) continue;

    totalFields++;
    const result = fillRadioGroup(container, value);
    if (result.success) filledCount++;
    else errors.push(`radio(${label}): ${result.error || 'no match'}`);
  }

  // ---- 7. Date fields ----
  const dateInputs = document.querySelectorAll('div.field input[type="date"], div.field input[data-type="date"]');
  for (const dateInput of dateInputs) {
    const label = findFieldLabel(dateInput);
    const value = mapDateValue(label, preferences);
    if (!value) continue;

    totalFields++;
    queue.enqueue(async () => {
      const result = await fillDateField(dateInput, value);
      if (result.success) filledCount++;
      return result;
    }, label || 'date');
  }

  // ---- 8. Education sections (repeating) ----
  if (profile.education && profile.education.length > 0) {
    const eduSections = document.querySelectorAll(
      '#education_section .education, [data-controller*="education"], .education-field-group'
    );
    for (let i = 0; i < Math.min(eduSections.length, profile.education.length); i++) {
      const section = eduSections[i];
      const edu = profile.education[i];
      for (const mapping of EDUCATION_FIELDS) {
        const input = section.querySelector(mapping.selector);
        const value = edu[mapping.key];
        if (!input || !value) continue;

        totalFields++;
        queue.enqueue(async () => {
          const result = await fillTextInput(input, value);
          if (result.success) filledCount++;
          return result;
        }, `edu[${i}].${mapping.key}`);
      }
    }
  }

  // ---- 9. Resume upload ----
  const resumeInput =
    document.querySelector('#resume_upload_input') ||
    document.querySelector('input[type="file"][name*="resume"]') ||
    document.querySelector('input[type="file"][data-field="resume"]') ||
    document.querySelector('input[type="file"]');

  if (resumeInput && resume?.base64) {
    totalFields++;
    const file = base64ToFile(resume.base64, resume.filename || 'resume.pdf', resume.mimeType);
    const result = await uploadFile(resumeInput, file);
    if (result.success) filledCount++;
    else errors.push(`Resume upload: ${result.error}`);
  }

  // ---- 10. Cover letter upload (if separate) ----
  const coverInput = document.querySelector(
    'input[type="file"][name*="cover"], input[type="file"][data-field="cover_letter"]'
  );
  if (coverInput && resume?.coverBase64) {
    totalFields++;
    const file = base64ToFile(resume.coverBase64, resume.coverFilename || 'cover_letter.pdf', 'application/pdf');
    const result = await uploadFile(coverInput, file);
    if (result.success) filledCount++;
    else errors.push(`Cover letter upload: ${result.error}`);
  }

  // Drain the queue
  await queue.enqueueAll([]);

  return {
    success: errors.length === 0,
    filledCount,
    totalFields,
    errors,
    ats: 'greenhouse-legacy'
  };
}


// ============================================================
// SELECT2 DROPDOWN HANDLING (Greenhouse-specific)
// ============================================================

/**
 * Fill a select2 dropdown on Greenhouse legacy boards.
 * These render as div.select2-container with a hidden <select>.
 *
 * @param {HTMLElement} container - The select2-container element
 * @param {string} value - Text to search/select
 * @returns {Object} { success, error? }
 */
async function fillSelect2Dropdown(container, value) {
  try {
    // Step 1: Find and click the selection display to open dropdown
    const selection = container.querySelector(
      '.select2-choice, .select2-selection, .select2-selection--single'
    );
    if (!selection) {
      return { success: false, error: 'select2 selection element not found' };
    }

    // Open the dropdown
    selection.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    selection.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    await sleep(300);

    // Step 2: Find the search input (select2 creates a global dropdown)
    const searchInput =
      document.querySelector('.select2-search__field') ||
      document.querySelector('#select2-drop input.select2-input') ||
      document.querySelector('.select2-dropdown input[type="search"]') ||
      document.querySelector('.select2-search input');

    if (searchInput) {
      // Type the search value
      searchInput.focus();
      searchInput.value = value;
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

      // Wait for search results
      await sleep(600);
    }

    // Step 3: Find and click matching option
    const results =
      document.querySelector('.select2-results, .select2-results__options') ||
      document.querySelector('#select2-drop .select2-results');

    if (!results) {
      return { success: false, error: 'select2 results container not found' };
    }

    const options = results.querySelectorAll(
      '.select2-results__option, .select2-result, li.select2-results__option'
    );

    const normalizedValue = value.toLowerCase().trim();
    for (const opt of options) {
      // Skip "no results" and disabled options
      if (opt.classList.contains('select2-results__option--disabled') ||
          opt.getAttribute('aria-disabled') === 'true') continue;

      const optText = opt.textContent.trim().toLowerCase();
      if (optText === normalizedValue || optText.includes(normalizedValue)) {
        opt.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        opt.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await sleep(100);
        return { success: true };
      }
    }

    // Close dropdown on failure
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { success: false, error: `Option "${value}" not found in select2` };

  } catch (err) {
    return { success: false, error: err.message };
  }
}


// ============================================================
// LABEL DETECTION
// ============================================================

/**
 * Find the human-readable label for a form element on Greenhouse Legacy.
 * Greenhouse wraps fields in div.field with a <label> sibling.
 */
function findFieldLabel(el) {
  // Greenhouse pattern: div.field > label + input/select/etc
  const fieldDiv = el.closest('div.field, .field-group, .application-field');
  if (fieldDiv) {
    const label = fieldDiv.querySelector('label:not(.select2-offscreen)');
    if (label) return label.textContent.trim().toLowerCase();
  }

  // Direct label[for]
  const id = el.id || el.getAttribute('data-id');
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) return label.textContent.trim().toLowerCase();
  }

  // aria-label fallback
  return el.getAttribute('aria-label')?.toLowerCase() || '';
}


// ============================================================
// VALUE MAPPING (label → profile/preferences)
// ============================================================

function mapLabelToValue(label, profile, prefs) {
  if (!label) return undefined;

  // Work authorization
  if (/authoriz|legal.*(work|employ)|right to work/i.test(label)) return prefs?.legallyAuthorized;
  // Visa
  if (/visa|sponsor/i.test(label)) return prefs?.visaSponsorship;
  // Relocation
  if (/relocat|willing.*(move|reloc)/i.test(label)) return prefs?.willingToRelocate;
  // Years of experience
  if (/years?.*(experience|exp)/i.test(label)) return prefs?.yearsExperience;
  // Salary
  if (/salary|compensation|pay|desired.*(salary|comp)/i.test(label)) return prefs?.desiredSalary;
  // Start date
  if (/start.*(date|when)|available|earliest/i.test(label)) return prefs?.startDate;
  // How did you hear
  if (/how.*hear|referr|source/i.test(label)) return prefs?.referralSource || 'Job board';
  // Location
  if (/city|location|where.*based|current.*(city|location)/i.test(label)) return profile?.location || profile?.city;
  // Gender
  if (/gender/i.test(label)) return prefs?.gender;
  // Race / ethnicity
  if (/race|ethnic/i.test(label)) return prefs?.ethnicity;
  // Veteran
  if (/veteran/i.test(label)) return prefs?.veteranStatus;
  // Disability
  if (/disab/i.test(label)) return prefs?.disabilityStatus;
  // LinkedIn
  if (/linkedin/i.test(label)) return profile?.linkedin;
  // GitHub
  if (/github/i.test(label)) return profile?.github;
  // Website / portfolio
  if (/website|portfolio/i.test(label)) return profile?.portfolio || profile?.website;

  // v5.40: Multilingual fallback — FR/ES/DE/IT label detection
  const multiMatch = matchMultilingualLabel(label, profile, prefs);
  if (multiMatch) return multiMatch.value;

  return undefined;
}

function mapTextareaValue(label, profile, prefs) {
  if (!label) return undefined;

  if (/cover.*(letter|note)/i.test(label)) return prefs?.coverLetter;
  if (/additional|anything.*add|comments/i.test(label)) return prefs?.additionalInfo;
  if (/why.*(interest|apply|join|want)/i.test(label)) return prefs?.whyInterested;

  return undefined;
}

function mapDateValue(label, prefs) {
  if (!label) return undefined;
  if (/start|available|earliest/i.test(label)) return prefs?.startDate;
  if (/graduat|end/i.test(label)) return prefs?.graduationDate;
  return undefined;
}


// ============================================================
// RADIO GROUP DETECTION
// ============================================================

function findRadioGroups() {
  const groups = new Map();
  const radios = document.querySelectorAll('div.field input[type="radio"]');

  for (const radio of radios) {
    const name = radio.name;
    if (!name || groups.has(name)) continue;

    const container = radio.closest('div.field, .field-group, .application-field');
    if (container) {
      groups.set(name, { name, container });
    }
  }

  return Array.from(groups.values());
}


// ============================================================
// HELPERS
// ============================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// CS-010: Wrap fill with graceful degradation
async function safeFill(opts) {
  try {
    return await fill(opts);
  } catch (err) {
    const errorMsg = err?.message || String(err);
    console.error('[BJ:greenhouse-legacy] Handler error (gracefully degraded):', errorMsg);
    try {
      chrome.runtime.sendMessage({
        type: 'ats:handlerError',
        handler: 'greenhouse-legacy',
        error: errorMsg,
        url: window.location.href,
        timestamp: new Date().toISOString()
      }).catch(() => {});
    } catch (_) { console.warn('[BJ] greenhouse-legacy error report failed'); }
    return {
      success: false,
      error: `greenhouse-legacy handler failed: ${errorMsg}`,
      filledCount: 0,
      skippedCount: opts?.fields?.length || 0,
      errorCount: 1,
      errors: [{ field: '_handler', error: errorMsg }],
      degraded: true
    };
  }
}

// Export
export default { fill: safeFill };
export { safeFill as fill };
