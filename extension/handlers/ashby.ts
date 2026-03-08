// handlers/ashby.ts — Ashby ATS Form Filler
// v3.3.0: Full implementation for jobs.ashbyhq.com
//
// Ashby uses relatively standard HTML forms with consistent structure.
// Fields are wrapped in div containers with label elements.
// Dropdowns are standard <select> or custom div-based listboxes.
// File upload is standard input[type="file"] via DataTransfer.
//
// DOM patterns observed:
//   - Form container: form, .ashby-application-form, [data-ui="application-form"]
//   - Field containers: .ashby-application-form-field-entry, [data-field-id]
//   - Labels: <label> elements or .ashby-application-form-field-entry-label
//   - Text inputs: standard <input type="text|email|tel|url">
//   - Textareas: standard <textarea>
//   - Dropdowns: <select> or div[role="combobox"] / div[role="listbox"]
//   - File: input[type="file"]
//   - Checkboxes: input[type="checkbox"]
//   - Radio: input[type="radio"]

import { fillTextInput } from '../fields/textInput.ts';
import { fillSelect, fillCheckboxRadio, fillCustomDropdown } from '../fields/dropdown.ts';
import { fillSearchableDropdown } from '../fields/dropdownSearchable.ts';
import { uploadFile, base64ToFile } from '../utils/fileUpload.ts';
import { FieldFillerQueue } from '../utils/fieldFillerQueue.ts';

// Ashby field label → profile property mapping
// Ashby labels are fairly consistent: "First Name", "Email", etc.
const ASHBY_LABEL_MAP = {
  'first name': (p) => p.firstName,
  'last name': (p) => p.lastName,
  'full name': (p) => [p.firstName, p.lastName].filter(Boolean).join(' '),
  'name': (p) => [p.firstName, p.lastName].filter(Boolean).join(' '),
  'email': (p) => p.email,
  'email address': (p) => p.email,
  'phone': (p) => p.phone,
  'phone number': (p) => p.phone,
  'linkedin': (p) => p.linkedin,
  'linkedin url': (p) => p.linkedin,
  'linkedin profile': (p) => p.linkedin,
  'github': (p) => p.github,
  'github url': (p) => p.github,
  'portfolio': (p) => p.portfolio || p.website,
  'portfolio url': (p) => p.portfolio || p.website,
  'website': (p) => p.website,
  'website url': (p) => p.website,
  'current company': (p) => p.currentCompany,
  'company': (p) => p.currentCompany,
  'current title': (p) => p.currentTitle,
  'job title': (p) => p.currentTitle,
  'title': (p) => p.currentTitle,
  'location': (p) => p.location || p.city,
  'city': (p) => p.city || p.location,
  'address': (p) => p.address || p.location
};

/**
 * Main fill function — called by contentScript.js handler router.
 */
async function fill({ profile, resume, preferences }) {
  const errors = [];
  let filledCount = 0;
  let totalFields = 0;

  const queue = new FieldFillerQueue({
    betweenFields: 120,
    onError: ({ field, error }) => errors.push(`${field}: ${error}`)
  });

  // ---- Text inputs & textareas ----
  const textInputs = document.querySelectorAll(
    'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], ' +
    'input:not([type]), textarea'
  );

  for (const input of textInputs) {
    if (input.type === 'hidden' || input.type === 'submit' || input.type === 'file') continue;

    const label = findFieldLabel(input);
    if (!label) continue;

    // Try direct label map first
    const labelKey = label.toLowerCase().trim();
    let value = null;

    for (const [key, getter] of Object.entries(ASHBY_LABEL_MAP)) {
      if (labelKey === key || labelKey.includes(key)) {
        value = getter(profile);
        break;
      }
    }

    // Try smart question mapping if direct map didn't match
    if (!value) {
      value = mapQuestionToValue(label, profile, preferences);
    }

    if (!value) continue;

    totalFields++;
    queue.enqueue(async () => {
      const result = await fillTextInput(input, value);
      if (result.success) filledCount++;
      return result;
    }, label);
  }

  // ---- Standard <select> dropdowns ----
  const selects = document.querySelectorAll('select');
  for (const select of selects) {
    const label = findFieldLabel(select);
    const value = mapQuestionToValue(label, profile, preferences);
    if (!value) continue;

    totalFields++;
    queue.enqueue(async () => {
      const result = fillSelect(select, value);
      if (result.success) filledCount++;
      return result;
    }, label || select.name);
  }

  // ---- Custom combobox/listbox dropdowns ----
  const comboboxes = document.querySelectorAll('[role="combobox"], [role="listbox"]');
  for (const combo of comboboxes) {
    // Skip if this is inside a select (already handled)
    if (combo.closest('select')) continue;

    const label = findFieldLabel(combo);
    const value = mapQuestionToValue(label, profile, preferences);
    if (!value) continue;

    totalFields++;
    queue.enqueue(async () => {
      const result = await fillSearchableDropdown(combo, value, { atsType: 'ashby' });
      if (result.success) filledCount++;
      return result;
    }, label || 'custom-dropdown');
  }

  // ---- Radio groups ----
  const radioGroups = new Map();
  document.querySelectorAll('input[type="radio"]').forEach(radio => {
    const name = radio.name || radio.closest('[data-field-id]')?.getAttribute('data-field-id') || 'unknown';
    if (!radioGroups.has(name)) radioGroups.set(name, []);
    radioGroups.get(name).push(radio);
  });

  for (const [name, radios] of radioGroups) {
    const label = findFieldLabel(radios[0]);
    const value = mapQuestionToValue(label, profile, preferences);
    if (!value) continue;

    totalFields++;
    // Find the radio whose label text matches the value
    let matched = false;
    for (const radio of radios) {
      const radioLabel = findRadioLabel(radio);
      if (radioLabel && matchesValue(radioLabel, value)) {
        const result = fillCheckboxRadio(radio, true);
        if (result.success) { filledCount++; matched = true; }
        break;
      }
    }
    if (!matched) errors.push(`Radio group "${label}": no option matched "${value}"`);
  }

  // ---- Checkboxes ----
  const checkboxes = document.querySelectorAll('input[type="checkbox"]');
  for (const cb of checkboxes) {
    const label = findFieldLabel(cb);
    const value = mapQuestionToValue(label, profile, preferences);
    if (value === undefined || value === null) continue;

    totalFields++;
    const result = fillCheckboxRadio(cb, value);
    if (result.success) filledCount++;
  }

  // ---- Resume upload ----
  const resumeInput = document.querySelector('input[type="file"][name*="resume"]') ||
                      document.querySelector('input[type="file"][accept*="pdf"]') ||
                      document.querySelector('input[type="file"]');

  if (resumeInput && resume?.base64) {
    totalFields++;
    const file = base64ToFile(resume.base64, resume.filename || 'resume.pdf', resume.mimeType);
    const result = await uploadFile(resumeInput, file);
    if (result.success) filledCount++;
    else errors.push(`Resume upload: ${result.error}`);
  }

  // ---- Cover letter upload (if separate input) ----
  const coverInputs = document.querySelectorAll('input[type="file"]');
  for (const input of coverInputs) {
    if (input === resumeInput) continue;
    const label = findFieldLabel(input);
    if (label && /cover/i.test(label) && resume?.coverBase64) {
      totalFields++;
      const file = base64ToFile(resume.coverBase64, resume.coverFilename || 'cover_letter.pdf', resume.coverMimeType || 'application/pdf');
      const result = await uploadFile(input, file);
      if (result.success) filledCount++;
      else errors.push(`Cover letter upload: ${result.error}`);
    }
  }

  // Wait for queue to drain
  await queue.drain();

  return {
    success: errors.length === 0,
    filledCount,
    totalFields,
    errors,
    ats: 'ashby'
  };
}

/**
 * Find the label text for a form element on Ashby.
 */
function findFieldLabel(el) {
  // 1. Ashby-specific field container
  const ashbyContainer = el.closest('.ashby-application-form-field-entry, [data-field-id]');
  if (ashbyContainer) {
    const label = ashbyContainer.querySelector('label, .ashby-application-form-field-entry-label, [class*="label"]');
    if (label) return label.textContent.trim();
  }

  // 2. Standard label[for]
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.textContent.trim();
  }

  // 3. Wrapping label
  const parentLabel = el.closest('label');
  if (parentLabel) return parentLabel.textContent.trim();

  // 4. Generic container with label
  const container = el.closest('.field, .form-group, .form-field, [class*="field"]');
  if (container) {
    const label = container.querySelector('label, .label, [class*="label"]');
    if (label) return label.textContent.trim();
  }

  // 5. aria-label
  return el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
}

/**
 * Find the label for a radio button.
 */
function findRadioLabel(radio) {
  // Label wrapping the radio
  const parentLabel = radio.closest('label');
  if (parentLabel) {
    const text = parentLabel.textContent.trim();
    if (text) return text;
  }
  // Label[for]
  if (radio.id) {
    const label = document.querySelector(`label[for="${radio.id}"]`);
    if (label) return label.textContent.trim();
  }
  // Next sibling text
  const next = radio.nextElementSibling || radio.nextSibling;
  if (next) {
    const text = next.textContent?.trim();
    if (text) return text;
  }
  return radio.value || '';
}

/**
 * Map a question/label to the appropriate value from profile/preferences.
 */
function mapQuestionToValue(label, profile, prefs) {
  if (!label) return undefined;
  const l = label.toLowerCase();

  // Direct profile fields
  for (const [key, getter] of Object.entries(ASHBY_LABEL_MAP)) {
    if (l === key || l.includes(key)) return getter(profile);
  }

  // Work authorization
  if (/authoriz|legal.*(work|employ)/i.test(l)) return prefs?.legallyAuthorized;
  // Visa sponsorship
  if (/visa|sponsor/i.test(l)) return prefs?.visaSponsorship;
  // Relocation
  if (/relocat|willing.*(move|reloc)/i.test(l)) return prefs?.willingToRelocate;
  // Years of experience
  if (/years?.*(experience|exp)/i.test(l)) return prefs?.yearsExperience;
  // Salary
  if (/salary|compensation|pay|desired.*(salary|comp)/i.test(l)) return prefs?.desiredSalary;
  // Start date
  if (/start.*(date|when)|available|earliest/i.test(l)) return prefs?.startDate || prefs?.availableDate;
  // How did you hear / source
  if (/how.*hear|referr|source/i.test(l)) return prefs?.referralSource || 'Job board';
  // Gender / EEO
  if (/gender/i.test(l)) return prefs?.gender;
  // Race / ethnicity
  if (/race|ethnic/i.test(l)) return prefs?.race;
  // Veteran
  if (/veteran/i.test(l)) return prefs?.veteranStatus;
  // Disability
  if (/disab/i.test(l)) return prefs?.disabilityStatus;

  return undefined;
}

/**
 * Check if a label matches a target value (fuzzy).
 */
function matchesValue(label, value) {
  if (!label || !value) return false;
  const l = label.toLowerCase().trim();
  const v = String(value).toLowerCase().trim();
  return l === v || l.includes(v) || v.includes(l);
}

export default { fill };
export { fill };
