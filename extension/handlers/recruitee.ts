// handlers/recruitee.ts — Recruitee ATS Form Filler
// v3.3.0: Full implementation for *.recruitee.com
//
// Recruitee uses standard HTML forms on {company}.recruitee.com.
// Additionally, Recruitee supports server-side API submission
// (zero auth, POST to careers page /c/new) — this is the ONLY
// ATS in our stack with a free server-side submission path.
//
// DOM patterns observed:
//   - Form: form.new_candidate, form[action*="/c/new"]
//   - Field containers: .form-group, .field
//   - Labels: <label> with for= attributes
//   - Text inputs: standard input types
//   - Textareas: standard <textarea>
//   - Dropdowns: standard <select>
//   - File: input[type="file"] for resume
//   - Checkboxes/radio: standard types
//   - Name fields: often "candidate[first_name]", "candidate[last_name]"
//   - CSRF: input[name="authenticity_token"] (required for server-side submission)
//
// API path (for future server-side submission):
//   POST {company}.recruitee.com/c/new
//   Content-Type: multipart/form-data
//   Fields: candidate[first_name], candidate[last_name], candidate[email],
//           candidate[phone], candidate[resume], offer_id, authenticity_token

import { fillTextInput } from '../fields/textInput.ts';
import { fillSelect, fillCheckboxRadio } from '../fields/dropdown.ts';
import { uploadFile, base64ToFile } from '../utils/fileUpload.ts';
import { FieldFillerQueue } from '../utils/fieldFillerQueue.ts';

// Recruitee uses predictable input names: candidate[field]
const RECRUITEE_NAME_MAP = {
  'candidate[first_name]': (p) => p.firstName,
  'candidate[last_name]': (p) => p.lastName,
  'candidate[name]': (p) => [p.firstName, p.lastName].filter(Boolean).join(' '),
  'candidate[email]': (p) => p.email,
  'candidate[phone]': (p) => p.phone,
  'candidate[city]': (p) => p.city || p.location,
  'candidate[location]': (p) => p.location || p.city,
  'candidate[current_position]': (p) => p.currentTitle,
  'candidate[current_employer]': (p) => p.currentCompany
};

// Label-based mapping as fallback
const RECRUITEE_LABEL_MAP = {
  'first name': (p) => p.firstName,
  'last name': (p) => p.lastName,
  'full name': (p) => [p.firstName, p.lastName].filter(Boolean).join(' '),
  'name': (p) => [p.firstName, p.lastName].filter(Boolean).join(' '),
  'email': (p) => p.email,
  'email address': (p) => p.email,
  'phone': (p) => p.phone,
  'phone number': (p) => p.phone,
  'city': (p) => p.city || p.location,
  'location': (p) => p.location || p.city,
  'linkedin': (p) => p.linkedin,
  'linkedin profile': (p) => p.linkedin,
  'linkedin url': (p) => p.linkedin,
  'github': (p) => p.github,
  'portfolio': (p) => p.portfolio || p.website,
  'website': (p) => p.website,
  'current position': (p) => p.currentTitle,
  'current company': (p) => p.currentCompany,
  'current employer': (p) => p.currentCompany
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
    if (input.name === 'authenticity_token') continue; // Skip CSRF token

    const inputName = (input.name || '').toLowerCase();
    const label = findFieldLabel(input);
    let value = null;

    // 1. Try name-based mapping (Recruitee has very predictable names)
    for (const [pattern, getter] of Object.entries(RECRUITEE_NAME_MAP)) {
      if (inputName === pattern) {
        value = getter(profile);
        break;
      }
    }

    // 2. Try label-based mapping
    if (!value && label) {
      const labelKey = label.toLowerCase().trim();
      for (const [key, getter] of Object.entries(RECRUITEE_LABEL_MAP)) {
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
    if (select.name === 'authenticity_token') continue;
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
    if (!matched) errors.push(`Radio "${label}": no option matched "${value}"`);
  }

  // ---- Checkboxes ----
  const checkboxes = document.querySelectorAll('input[type="checkbox"]');
  for (const cb of checkboxes) {
    // Skip GDPR/consent checkboxes — user should review these manually
    const label = findFieldLabel(cb);
    if (/consent|gdpr|privacy|terms|agree/i.test(label || '')) continue;

    const value = mapQuestionToValue(label, profile, preferences);
    if (value === undefined || value === null) continue;

    totalFields++;
    const result = fillCheckboxRadio(cb, value);
    if (result.success) filledCount++;
  }

  // ---- Resume upload ----
  const resumeInput = document.querySelector('input[type="file"][name*="resume"]') ||
                      document.querySelector('input[type="file"][name*="candidate[resume]"]') ||
                      document.querySelector('input[type="file"][accept*="pdf"]') ||
                      document.querySelector('input[type="file"]');

  if (resumeInput && resume?.base64) {
    totalFields++;
    const file = base64ToFile(resume.base64, resume.filename || 'resume.pdf', resume.mimeType);
    const result = await uploadFile(resumeInput, file);
    if (result.success) filledCount++;
    else errors.push(`Resume upload: ${result.error}`);
  }

  await queue.drain();

  return {
    success: errors.length === 0,
    filledCount,
    totalFields,
    errors,
    ats: 'recruitee',
    // Flag that Recruitee also supports server-side submission
    serverSideCapable: true,
    csrfToken: document.querySelector('input[name="authenticity_token"]')?.value || null,
    offerId: document.querySelector('input[name="offer_id"]')?.value || null,
    formAction: document.querySelector('form.new_candidate, form[action*="/c/new"]')?.action || null
  };
}

/**
 * Find the label text for a form element on Recruitee.
 */
function findFieldLabel(el) {
  // 1. Standard label[for]
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.textContent.trim();
  }

  // 2. Wrapping label
  const parentLabel = el.closest('label');
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true);
    clone.querySelectorAll('input, select, textarea').forEach(c => c.remove());
    const text = clone.textContent.trim();
    if (text) return text;
  }

  // 3. Container with label
  const container = el.closest('.form-group, .field, [class*="field"]');
  if (container) {
    const label = container.querySelector('label, .label');
    if (label && !label.querySelector('input, select, textarea')) {
      return label.textContent.trim();
    }
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
  return radio.value || '';
}

function mapQuestionToValue(label, profile, prefs) {
  if (!label) return undefined;
  const l = label.toLowerCase();

  for (const [key, getter] of Object.entries(RECRUITEE_LABEL_MAP)) {
    if (l === key || l.includes(key)) return getter(profile);
  }

  if (/authoriz|legal.*(work|employ)/i.test(l)) return prefs?.legallyAuthorized;
  if (/visa|sponsor/i.test(l)) return prefs?.visaSponsorship;
  if (/relocat|willing.*(move|reloc)/i.test(l)) return prefs?.willingToRelocate;
  if (/years?.*(experience|exp)/i.test(l)) return prefs?.yearsExperience;
  if (/salary|compensation|pay/i.test(l)) return prefs?.desiredSalary;
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
