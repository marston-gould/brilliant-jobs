// handlers/lever.js — Lever ATS Form Filler
// v3.0.0: Standard HTML forms with consistent name attributes.
// No React, no custom widgets. Quick win to prove the handler architecture.
//
// Field mapping (from competitive analysis):
//   [name='name']         → fullName (single field, combine first+last)
//   [name='email']        → email
//   [name='phone']        → phone
//   [name='org']          → currentCompany
//   [name='urls[LinkedIn]'] → linkedin
//   [name='urls[GitHub]']   → github
//   [name='urls[Portfolio]'] → portfolio
//   Resume: input#resume-upload-input via DataTransfer

import { fillTextInput } from '../fields/textInput.js';
import { fillSelect, fillCheckboxRadio } from '../fields/dropdown.js';
import { uploadFile, base64ToFile } from '../utils/fileUpload.js';
import { FieldFillerQueue } from '../utils/fieldFillerQueue.js';

// Lever field name → profile property mapping
const LEVER_FIELD_MAP = {
  'name': (p) => [p.firstName, p.lastName].filter(Boolean).join(' '),
  'email': (p) => p.email,
  'phone': (p) => p.phone,
  'org': (p) => p.currentCompany,
  'urls[LinkedIn]': (p) => p.linkedin,
  'urls[GitHub]': (p) => p.github,
  'urls[Portfolio]': (p) => p.portfolio || p.website,
  'urls[Twitter]': (p) => p.twitter,
  'urls[Other]': (p) => p.website
};

/**
 * Main fill function — called by contentScript.js handler router.
 *
 * @param {Object} params
 * @param {Object} params.profile - User profile data
 * @param {Object} params.resume - { base64, filename, mimeType }
 * @param {Object} params.preferences - User preferences (visa, relocation, etc.)
 * @returns {Object} { success: boolean, filledCount: number, totalFields: number, errors: string[] }
 */
async function fill({ profile, resume, preferences }) {
  const errors = [];
  let filledCount = 0;
  let totalFields = 0;

  const queue = new FieldFillerQueue({
    betweenFields: 100,
    onError: ({ field, error }) => errors.push(`${field}: ${error}`)
  });

  // ---- Text fields ----
  for (const [fieldName, getValue] of Object.entries(LEVER_FIELD_MAP)) {
    const value = getValue(profile);
    if (!value) continue;

    const input = document.querySelector(`[name='${fieldName}']`);
    if (!input) continue;

    totalFields++;
    queue.enqueue(async () => {
      const result = await fillTextInput(input, value);
      if (result.success) filledCount++;
      return result;
    }, fieldName);
  }

  // ---- Standard <select> dropdowns ----
  const selects = document.querySelectorAll('select');
  for (const select of selects) {
    const label = findFieldLabel(select);
    const value = mapLabelToValue(label, profile, preferences);
    if (!value) continue;

    totalFields++;
    queue.enqueue(async () => {
      const result = fillSelect(select, value);
      if (result.success) filledCount++;
      return result;
    }, label || select.name);
  }

  // ---- Checkboxes ----
  const checkboxes = document.querySelectorAll('input[type="checkbox"]');
  for (const cb of checkboxes) {
    const label = findFieldLabel(cb);
    const value = mapLabelToValue(label, profile, preferences);
    if (value === undefined) continue;

    totalFields++;
    const result = fillCheckboxRadio(cb, value);
    if (result.success) filledCount++;
  }

  // ---- Resume upload ----
  const resumeInput = document.querySelector('#resume-upload-input') ||
                      document.querySelector('input[type="file"][name*="resume"]') ||
                      document.querySelector('input[type="file"]');

  if (resumeInput && resume?.base64) {
    totalFields++;
    const file = base64ToFile(resume.base64, resume.filename || 'resume.pdf', resume.mimeType);
    const result = await uploadFile(resumeInput, file);
    if (result.success) filledCount++;
    else errors.push(`Resume upload: ${result.error}`);
  }

  // Wait for queue to drain
  await queue.enqueueAll([]);

  return {
    success: errors.length === 0,
    filledCount,
    totalFields,
    errors,
    ats: 'lever'
  };
}

/**
 * Find the label text for a form element on Lever.
 */
function findFieldLabel(el) {
  // Lever wraps fields in div.application-question
  const container = el.closest('.application-question, .custom-question, .field');
  if (container) {
    const label = container.querySelector('label, .label, .application-label');
    if (label) return label.textContent.trim().toLowerCase();
  }

  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.textContent.trim().toLowerCase();
  }

  return el.getAttribute('aria-label')?.toLowerCase() || '';
}

/**
 * Map a field label to the appropriate value from profile/preferences.
 * Handles common ATS questions.
 */
function mapLabelToValue(label, profile, prefs) {
  if (!label) return undefined;

  // Work authorization
  if (/authoriz|legal.*(work|employ)/i.test(label)) {
    return prefs?.legallyAuthorized;
  }
  // Visa sponsorship
  if (/visa|sponsor/i.test(label)) {
    return prefs?.visaSponsorship;
  }
  // Relocation
  if (/relocat|willing.*(move|reloc)/i.test(label)) {
    return prefs?.willingToRelocate;
  }
  // Years of experience
  if (/years?.*(experience|exp)/i.test(label)) {
    return prefs?.yearsExperience;
  }
  // Salary
  if (/salary|compensation|pay/i.test(label)) {
    return prefs?.desiredSalary;
  }
  // Start date
  if (/start.*(date|when)|available|earliest/i.test(label)) {
    return prefs?.startDate || prefs?.availableDate;
  }
  // How did you hear
  if (/how.*hear|referr|source/i.test(label)) {
    return prefs?.referralSource || 'Job board';
  }
  // Location / city
  if (/city|location|where.*based/i.test(label)) {
    return profile?.location || profile?.city;
  }

  return undefined;
}

// Export the handler
export default { fill };
export { fill };
