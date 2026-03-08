// handlers/workable.ts — Workable ATS Form Filler
// v3.3.0: Full implementation for apply.workable.com
//
// Workable uses relatively standard HTML forms. The apply flow
// is typically a single page with standard inputs.
//
// DOM patterns observed:
//   - Form: form[data-ui="application-form"], .application-form
//   - Field containers: .styles--field, .form-group, [data-ui*="field"]
//   - Labels: <label> elements with for= attributes
//   - Text inputs: standard <input type="text|email|tel|url">
//   - Textareas: standard <textarea>
//   - Dropdowns: <select> or custom data-ui="dropdown"
//   - File: input[type="file"] (standard DataTransfer works)
//   - Checkboxes/radio: standard input types
//   - Name: often split first/last, sometimes single "Name" field
//   - Resume/CV: input[type="file"] with data-ui="resume-input" or name*="resume"

import { fillTextInput } from '../fields/textInput.ts';
import { fillSelect, fillCheckboxRadio, fillCustomDropdown } from '../fields/dropdown.ts';
import { fillSearchableDropdown } from '../fields/dropdownSearchable.ts';
import { uploadFile, base64ToFile } from '../utils/fileUpload.ts';
import { FieldFillerQueue } from '../utils/fieldFillerQueue.ts';

// Workable field label → profile property mapping
const WORKABLE_LABEL_MAP = {
  'first name': (p) => p.firstName,
  'last name': (p) => p.lastName,
  'full name': (p) => [p.firstName, p.lastName].filter(Boolean).join(' '),
  'name': (p) => [p.firstName, p.lastName].filter(Boolean).join(' '),
  'email': (p) => p.email,
  'email address': (p) => p.email,
  'phone': (p) => p.phone,
  'phone number': (p) => p.phone,
  'headline': (p) => p.currentTitle,
  'summary': (p) => p.summary,
  'address': (p) => p.address || p.location,
  'city': (p) => p.city || p.location,
  'location': (p) => p.location || p.city,
  'current company': (p) => p.currentCompany,
  'current title': (p) => p.currentTitle,
  'linkedin': (p) => p.linkedin,
  'linkedin profile': (p) => p.linkedin,
  'linkedin url': (p) => p.linkedin,
  'github': (p) => p.github,
  'github url': (p) => p.github,
  'portfolio': (p) => p.portfolio || p.website,
  'website': (p) => p.website,
  'website url': (p) => p.website
};

// Workable-specific input name/id patterns
const WORKABLE_NAME_MAP = {
  'firstname': (p) => p.firstName,
  'first_name': (p) => p.firstName,
  'lastname': (p) => p.lastName,
  'last_name': (p) => p.lastName,
  'name': (p) => [p.firstName, p.lastName].filter(Boolean).join(' '),
  'email': (p) => p.email,
  'phone': (p) => p.phone,
  'headline': (p) => p.currentTitle,
  'summary': (p) => p.summary,
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
    betweenFields: 100,
    onError: ({ field, error }) => errors.push(`${field}: ${error}`)
  });

  // ---- Text inputs & textareas ----
  const textInputs = document.querySelectorAll(
    'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], ' +
    'input:not([type]), textarea'
  );

  for (const input of textInputs) {
    if (input.type === 'hidden' || input.type === 'submit' || input.type === 'file') continue;
    if (input.closest('[style*="display: none"], [style*="display:none"], [hidden]')) continue;

    const label = findFieldLabel(input);
    const inputName = (input.name || input.id || '').toLowerCase();

    let value = null;

    // 1. Try name/id mapping (Workable often uses predictable names)
    for (const [pattern, getter] of Object.entries(WORKABLE_NAME_MAP)) {
      if (inputName === pattern || inputName.includes(pattern)) {
        value = getter(profile);
        break;
      }
    }

    // 2. Try label mapping
    if (!value && label) {
      const labelKey = label.toLowerCase().trim();
      for (const [key, getter] of Object.entries(WORKABLE_LABEL_MAP)) {
        if (labelKey === key || labelKey.includes(key)) {
          value = getter(profile);
          break;
        }
      }
    }

    // 3. Try smart question mapping
    if (!value && label) {
      value = mapQuestionToValue(label, profile, preferences);
    }

    if (!value) continue;

    totalFields++;
    queue.enqueue(async () => {
      const result = await fillTextInput(input, value);
      if (result.success) filledCount++;
      return result;
    }, label || inputName);
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

  // ---- Custom dropdowns (Workable-specific) ----
  const customDropdowns = document.querySelectorAll(
    '[data-ui="dropdown"], [role="combobox"], [role="listbox"]'
  );
  for (const dd of customDropdowns) {
    if (dd.closest('select')) continue;
    const label = findFieldLabel(dd);
    const value = mapQuestionToValue(label, profile, preferences);
    if (!value) continue;

    totalFields++;
    queue.enqueue(async () => {
      const result = await fillSearchableDropdown(dd, value, { atsType: 'workable' });
      if (result.success) filledCount++;
      return result;
    }, label || 'custom-dropdown');
  }

  // ---- Radio groups ----
  const radioGroups = new Map();
  document.querySelectorAll('input[type="radio"]').forEach(radio => {
    const name = radio.name || 'unknown';
    if (!radioGroups.has(name)) radioGroups.set(name, []);
    radioGroups.get(name).push(radio);
  });

  for (const [name, radios] of radioGroups) {
    const label = findFieldLabel(radios[0]);
    const value = mapQuestionToValue(label, profile, preferences);
    if (!value) continue;

    totalFields++;
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
  const resumeInput = document.querySelector('[data-ui="resume-input"]') ||
                      document.querySelector('input[type="file"][name*="resume"]') ||
                      document.querySelector('input[type="file"][accept*="pdf"]') ||
                      document.querySelector('input[type="file"]');

  if (resumeInput && resume?.base64) {
    totalFields++;
    const file = base64ToFile(resume.base64, resume.filename || 'resume.pdf', resume.mimeType);
    const result = await uploadFile(resumeInput, file);
    if (result.success) filledCount++;
    else errors.push(`Resume upload: ${result.error}`);
  }

  // ---- Cover letter (separate file input) ----
  const allFileInputs = document.querySelectorAll('input[type="file"]');
  for (const input of allFileInputs) {
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

  await queue.drain();

  return {
    success: errors.length === 0,
    filledCount,
    totalFields,
    errors,
    ats: 'workable'
  };
}

/**
 * Find the label text for a form element on Workable.
 */
function findFieldLabel(el) {
  // 1. Workable-specific field container
  const container = el.closest('.styles--field, .form-group, [data-ui*="field"], [class*="field"]');
  if (container) {
    const label = container.querySelector('label, .label, [class*="label"]');
    if (label && !label.querySelector('input, select, textarea')) {
      return label.textContent.trim();
    }
  }

  // 2. Standard label[for]
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.textContent.trim();
  }

  // 3. Wrapping label
  const parentLabel = el.closest('label');
  if (parentLabel) {
    // Get text content excluding child input text
    const clone = parentLabel.cloneNode(true);
    clone.querySelectorAll('input, select, textarea').forEach(c => c.remove());
    const text = clone.textContent.trim();
    if (text) return text;
  }

  // 4. aria-label or placeholder
  return el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
}

function findRadioLabel(radio) {
  const parentLabel = radio.closest('label');
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true);
    clone.querySelectorAll('input').forEach(c => c.remove());
    const text = clone.textContent.trim();
    if (text) return text;
  }
  if (radio.id) {
    const label = document.querySelector(`label[for="${radio.id}"]`);
    if (label) return label.textContent.trim();
  }
  const next = radio.nextElementSibling || radio.nextSibling;
  if (next) {
    const text = next.textContent?.trim();
    if (text) return text;
  }
  return radio.value || '';
}

function mapQuestionToValue(label, profile, prefs) {
  if (!label) return undefined;
  const l = label.toLowerCase();

  // Direct profile fields
  for (const [key, getter] of Object.entries(WORKABLE_LABEL_MAP)) {
    if (l === key || l.includes(key)) return getter(profile);
  }

  // Smart question mapping
  if (/authoriz|legal.*(work|employ)/i.test(l)) return prefs?.legallyAuthorized;
  if (/visa|sponsor/i.test(l)) return prefs?.visaSponsorship;
  if (/relocat|willing.*(move|reloc)/i.test(l)) return prefs?.willingToRelocate;
  if (/years?.*(experience|exp)/i.test(l)) return prefs?.yearsExperience;
  if (/salary|compensation|pay|desired.*(salary|comp)/i.test(l)) return prefs?.desiredSalary;
  if (/start.*(date|when)|available|earliest/i.test(l)) return prefs?.startDate || prefs?.availableDate;
  if (/how.*hear|referr|source/i.test(l)) return prefs?.referralSource || 'Job board';
  if (/gender/i.test(l)) return prefs?.gender;
  if (/race|ethnic/i.test(l)) return prefs?.race;
  if (/veteran/i.test(l)) return prefs?.veteranStatus;
  if (/disab/i.test(l)) return prefs?.disabilityStatus;

  return undefined;
}

function matchesValue(label, value) {
  if (!label || !value) return false;
  const l = label.toLowerCase().trim();
  const v = String(value).toLowerCase().trim();
  return l === v || l.includes(v) || v.includes(l);
}

export default { fill };
export { fill };
