// handlers/lever.js — Lever ATS Form Filler
// v3.0.0: Standard HTML forms with consistent name attributes.
// v3.9.0: AI-powered custom question answering via Claude Haiku (C2).
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
import { answerCustomQuestions, collectUnmatchedQuestions } from '../utils/aiAnswerer.js';
import { matchMultilingualLabel } from '../utils/multilingualLabels.js';

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
 * @param {Object} params.resume - { base64, filename, mimeType, text }
 * @param {Object} params.preferences - User preferences (visa, relocation, etc.)
 * @param {Object} params.jobContext - { title, company } for AI context
 * @param {string} params.authToken - Supabase auth token for AI calls
 * @returns {Object} { success: boolean, filledCount: number, totalFields: number, errors: string[] }
 */
async function fill({ profile, resume, preferences, jobContext, authToken }) {
  const errors = [];
  let filledCount = 0;
  let totalFields = 0;
  const filledFieldIds = new Set();

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
    filledFieldIds.add(input.id || input.name || fieldName);
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
    filledFieldIds.add(select.id || select.name || label);
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
    filledFieldIds.add(cb.id || cb.name || label);
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

  // Wait for queue to drain before AI phase
  await queue.enqueueAll([]);

  // ---- AI-powered custom question answering (C2) ----
  try {
    const formContainer = document.querySelector('.application-form, form, .posting-page');
    const unmatched = collectUnmatchedQuestions(formContainer, filledFieldIds);

    if (unmatched.length > 0 && authToken) {
      console.log(`[lever] ${unmatched.length} unmatched custom questions — calling AI`);
      const answers = await answerCustomQuestions(
        unmatched, profile, resume, jobContext || {}, authToken
      );

      for (const ans of answers) {
        if (!ans.answer || ans.confidence === 'low') continue;

        const field = document.getElementById(ans.id) ||
                      document.querySelector(`[name="${ans.id}"]`);
        if (!field) continue;

        totalFields++;
        if (field.tagName === 'SELECT') {
          const result = fillSelect(field, ans.answer);
          if (result.success) filledCount++;
        } else if (field.tagName === 'TEXTAREA' || field.type === 'text' || field.type === 'url' || field.type === 'number') {
          const result = await fillTextInput(field, ans.answer);
          if (result.success) filledCount++;
        }
      }
    }
  } catch (aiErr) {
    // AI answering is best-effort — never block form fill
    console.warn('[lever] AI question answering error (non-blocking):', aiErr.message || aiErr);
  }

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

  // v5.40: Multilingual fallback — FR/ES/DE/IT label detection
  const multiMatch = matchMultilingualLabel(label, profile, prefs);
  if (multiMatch) return multiMatch.value;

  return undefined;
}

// CS-010: Wrap fill with graceful degradation
async function safeFill(opts) {
  try {
    return await fill(opts);
  } catch (err) {
    const errorMsg = err?.message || String(err);
    console.error('[BJ:lever] Handler error (gracefully degraded):', errorMsg);
    try {
      chrome.runtime.sendMessage({
        type: 'ats:handlerError',
        handler: 'lever',
        error: errorMsg,
        url: window.location.href,
        timestamp: new Date().toISOString()
      }).catch(() => {});
    } catch (_) { console.warn('[BJ] lever error report failed'); }
    return {
      success: false,
      error: `lever handler failed: ${errorMsg}`,
      filledCount: 0,
      skippedCount: opts?.fields?.length || 0,
      errorCount: 1,
      errors: [{ field: '_handler', error: errorMsg }],
      degraded: true
    };
  }
}

// Export the handler
export default { fill: safeFill };
export { safeFill as fill };
