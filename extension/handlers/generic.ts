// handlers/generic.ts — Universal / Generic ATS Form Filler
// v2.15.0: Item #1 — DOM heuristic-based form filler for any ATS
// not covered by a dedicated handler.
//
// Strategy:
//   1. Label/input association (for, wrapping <label>, aria-label, aria-labelledby)
//   2. Name attribute pattern matching (name="first_name", name="email", etc.)
//   3. Placeholder text analysis
//   4. LABEL_PATTERNS fuzzy-match (reuses Indeed's proven approach)
//   5. Falls back to aiAnswerer.js for unrecognized custom questions
//
// This handler is intentionally conservative — it only fills fields
// where it has high confidence in the mapping. Unknown fields are
// collected and sent to the AI answerer.

import { fillTextInput } from '../fields/textInput.ts';
import { fillSelect, fillCheckboxRadio } from '../fields/dropdown.ts';
import { fillSearchableDropdown } from '../fields/dropdownSearchable.ts';
import { uploadFile, base64ToFile } from '../utils/fileUpload.ts';
import { FieldFillerQueue } from '../utils/fieldFillerQueue.ts';
import { answerCustomQuestions, collectUnmatchedQuestions } from '../utils/aiAnswerer.ts';
import { matchMultilingualLabel } from '../utils/multilingualLabels.ts';

// ============================================================
// LABEL → PROFILE MAPPING (fuzzy regex patterns)
// Reuses the proven INDEED_LABEL_PATTERNS approach.
// ============================================================

const GENERIC_LABEL_PATTERNS = [
  { pattern: /^first[\s_-]*name/i, value: (p) => p.firstName },
  { pattern: /^last[\s_-]*name|^surname|^family[\s_-]*name/i, value: (p) => p.lastName },
  { pattern: /^full[\s_-]*name|^your[\s_-]*name|^name$/i, value: (p) => [p.firstName, p.lastName].filter(Boolean).join(' ') },
  { pattern: /e[\s_-]*mail/i, value: (p) => p.email },
  { pattern: /phone|mobile|cell|telephone/i, value: (p) => p.phone },
  { pattern: /^city$|current[\s_-]*city/i, value: (p) => p.city || p.location },
  { pattern: /^state$|^province$/i, value: (p) => p.state },
  { pattern: /^zip|^postal/i, value: (p) => p.zip },
  { pattern: /^address|^street/i, value: (p) => p.address },
  { pattern: /^country$/i, value: (p) => p.country || 'United States' },
  { pattern: /linkedin/i, value: (p) => p.linkedin },
  { pattern: /github/i, value: (p) => p.github },
  { pattern: /portfolio|personal[\s_-]*(?:site|website|url)|^website$|^url$/i, value: (p) => p.portfolio || p.website },
  { pattern: /current[\s_-]*(?:company|employer|organization)/i, value: (p) => p.currentCompany },
  { pattern: /current[\s_-]*(?:title|position|role|job[\s_-]*title)/i, value: (p) => p.currentTitle },
  { pattern: /headline|professional[\s_-]*summary|about[\s_-]*(?:you|yourself)/i, value: (p) => p.summary },
  { pattern: /years?[\s_-]*(?:of[\s_-]*)?(?:experience|exp)/i, value: (p) => p.yearsExperience },
  { pattern: /salary|compensation|pay[\s_-]*expect/i, value: (p, pref) => pref.salaryExpectation },
  { pattern: /cover[\s_-]*letter/i, value: (p) => p.coverLetter },
  { pattern: /school|university|college|education/i, value: (p) => p.school },
  { pattern: /degree/i, value: (p) => p.degree },
  { pattern: /major|field[\s_-]*of[\s_-]*study/i, value: (p) => p.major },
  { pattern: /gpa|grade[\s_-]*point/i, value: (p) => p.gpa },
];

// Name attribute patterns → profile property
const NAME_ATTR_PATTERNS = [
  { pattern: /^first[_-]?name$/i, value: (p) => p.firstName },
  { pattern: /^last[_-]?name$/i, value: (p) => p.lastName },
  { pattern: /^(full[_-]?)?name$/i, value: (p) => [p.firstName, p.lastName].filter(Boolean).join(' ') },
  { pattern: /^e?mail$/i, value: (p) => p.email },
  { pattern: /^phone$/i, value: (p) => p.phone },
  { pattern: /^city$/i, value: (p) => p.city || p.location },
  { pattern: /^state$/i, value: (p) => p.state },
  { pattern: /^zip$/i, value: (p) => p.zip },
  { pattern: /^country$/i, value: (p) => p.country || 'United States' },
  { pattern: /^linkedin/i, value: (p) => p.linkedin },
  { pattern: /^github/i, value: (p) => p.github },
  { pattern: /^(website|portfolio|url)$/i, value: (p) => p.portfolio || p.website },
  { pattern: /^(company|org|organization|employer)$/i, value: (p) => p.currentCompany },
  { pattern: /^(title|position|role|job[_-]?title)$/i, value: (p) => p.currentTitle },
];

// Standard question patterns — visa, authorization, relocation, etc.
const GENERIC_QUESTION_PATTERNS = [
  { pattern: /authorized[\s_-]*to[\s_-]*work|legally[\s_-]*authorized|work[\s_-]*(authorization|permit)|eligible[\s_-]*to[\s_-]*work/i, answer: (pref) => pref.workAuthorization || 'Yes' },
  { pattern: /visa[\s_-]*sponsor|require[\s_-]*sponsor|need[\s_-]*sponsor/i, answer: (pref) => pref.requireSponsorship || 'No' },
  { pattern: /willing[\s_-]*to[\s_-]*relocate|open[\s_-]*to[\s_-]*relocation/i, answer: (pref) => pref.willingToRelocate || 'Yes' },
  { pattern: /willing[\s_-]*to[\s_-]*commute|commute[\s_-]*to/i, answer: (pref) => pref.willingToCommute || 'Yes' },
  { pattern: /willing[\s_-]*to[\s_-]*travel|travel[\s_-]*require|percent.*travel/i, answer: (pref) => pref.willingToTravel || 'Yes' },
  { pattern: /background[\s_-]*check|criminal|conviction|felony/i, answer: (pref) => pref.backgroundCheck || 'No' },
  { pattern: /drug[\s_-]*(test|screen)/i, answer: (pref) => pref.drugTest || 'Yes' },
  { pattern: /start[\s_-]*date|when[\s_-]*can[\s_-]*you[\s_-]*start|available[\s_-]*to[\s_-]*start|earliest[\s_-]*start/i, answer: (pref) => pref.startDate || 'Immediately' },
  { pattern: /security[\s_-]*clearance/i, answer: (pref) => pref.securityClearance || 'No' },
  { pattern: /veteran|military[\s_-]*service/i, answer: (pref) => pref.veteranStatus || 'No' },
  { pattern: /disabled|disability/i, answer: (pref) => pref.disabilityStatus || 'Prefer not to say' },
  { pattern: /gender|sex/i, answer: (pref) => pref.gender || 'Prefer not to say' },
  { pattern: /race|ethnicity/i, answer: (pref) => pref.ethnicity || 'Prefer not to say' },
  { pattern: /18[\s_-]*years|age.*18|over.*18/i, answer: () => 'Yes' },
  { pattern: /how[\s_-]*did[\s_-]*you[\s_-]*hear|how[\s_-]*did[\s_-]*you[\s_-]*find|referral[\s_-]*source/i, answer: () => 'Job Board' },
  { pattern: /shift|schedule|work[\s_-]*hours|available[\s_-]*to[\s_-]*work/i, answer: (pref) => pref.shiftPreference || 'Full-time' },
];

// ============================================================
// LABEL RESOLUTION — multi-signal approach
// ============================================================

/**
 * Find the label text for a form element using multiple strategies.
 * Returns the best label string found, or ''.
 */
function resolveLabel(el) {
  // 1. Explicit <label for="id">
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label) return label.textContent.trim();
  }

  // 2. Wrapping <label>
  const parentLabel = el.closest('label');
  if (parentLabel) {
    // Get text excluding the input's own text
    const clone = parentLabel.cloneNode(true);
    clone.querySelectorAll('input, select, textarea').forEach(c => c.remove());
    const text = clone.textContent.trim();
    if (text) return text;
  }

  // 3. aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  // 4. aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean);
    if (parts.length) return parts.join(' ');
  }

  // 5. Closest field container label
  const container = el.closest('.field, .form-group, .form-field, [class*="field"], [class*="question"], [data-testid]');
  if (container) {
    const labelEl = container.querySelector('label, .label, [class*="label"], legend, .question-text, [class*="question"]');
    if (labelEl && !labelEl.contains(el)) return labelEl.textContent.trim();
  }

  // 6. Placeholder text (last resort for label)
  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return placeholder.trim();

  return '';
}

/**
 * Match a label string against GENERIC_LABEL_PATTERNS.
 * Returns the profile value or null.
 */
function matchLabelToProfile(label, profile, preferences) {
  if (!label) return null;

  for (const { pattern, value } of GENERIC_LABEL_PATTERNS) {
    if (pattern.test(label)) {
      return value(profile, preferences || {}) || null;
    }
  }

  // Also try multilingual matching
  const multiMatch = matchMultilingualLabel(label);
  if (multiMatch) {
    // multiMatch returns a field key like 'firstName', 'email', etc.
    if (profile[multiMatch]) return profile[multiMatch];
  }

  return null;
}

/**
 * Match a name attribute against NAME_ATTR_PATTERNS.
 * Returns the profile value or null.
 */
function matchNameAttrToProfile(nameAttr, profile) {
  if (!nameAttr) return null;

  for (const { pattern, value } of NAME_ATTR_PATTERNS) {
    if (pattern.test(nameAttr)) {
      return value(profile) || null;
    }
  }
  return null;
}

/**
 * Match a label string against GENERIC_QUESTION_PATTERNS.
 * Returns the preference value or null.
 */
function matchLabelToQuestion(label, preferences) {
  if (!label) return null;

  for (const { pattern, answer } of GENERIC_QUESTION_PATTERNS) {
    if (pattern.test(label)) {
      return answer(preferences || {}) || null;
    }
  }
  return null;
}

// ============================================================
// FORM DISCOVERY — find all fillable fields
// ============================================================

/**
 * Discover all visible, fillable form fields on the page.
 * Returns an array of { element, label, nameAttr, type, fieldId }.
 */
function discoverFields() {
  const fields = [];
  const seen = new Set();

  const selector = [
    'input[type="text"]', 'input[type="email"]', 'input[type="tel"]',
    'input[type="url"]', 'input[type="number"]', 'input[type="search"]',
    'input:not([type])', // defaults to text
    'textarea',
    'select',
    '[role="combobox"]', '[role="listbox"]',
    'input[type="radio"]', 'input[type="checkbox"]',
  ].join(', ');

  document.querySelectorAll(selector).forEach(el => {
    // Skip hidden, disabled, or already-identified
    if (el.type === 'hidden' || el.disabled || el.offsetParent === null) return;
    const fieldId = el.id || el.name || `generic-${fields.length}`;
    if (seen.has(fieldId)) return;
    seen.add(fieldId);

    fields.push({
      element: el,
      label: resolveLabel(el),
      nameAttr: el.name || '',
      type: el.tagName === 'SELECT' ? 'select' :
            el.tagName === 'TEXTAREA' ? 'textarea' :
            el.getAttribute('role') || el.type || 'text',
      fieldId
    });
  });

  return fields;
}

// ============================================================
// RESUME UPLOAD — find and fill file input
// ============================================================

async function handleResumeUpload(resume) {
  if (!resume?.base64) return { success: false, reason: 'no_resume_data' };

  // Look for file inputs
  const fileInputs = document.querySelectorAll('input[type="file"]');
  if (fileInputs.length === 0) return { success: false, reason: 'no_file_input' };

  // Prefer inputs associated with resume/CV labels
  let targetInput = null;
  for (const input of fileInputs) {
    const label = resolveLabel(input);
    if (/resume|cv|curriculum/i.test(label)) {
      targetInput = input;
      break;
    }
  }
  // Fallback to first file input
  if (!targetInput) targetInput = fileInputs[0];

  try {
    const file = base64ToFile(
      resume.base64,
      resume.filename || 'resume.pdf',
      resume.mimeType || 'application/pdf'
    );
    const result = await uploadFile(targetInput, file);
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// MAIN FILL FUNCTION
// ============================================================

/**
 * Main fill function — called by contentScript.js handler router.
 *
 * @param {Object} params
 * @param {Object} params.profile - User profile data
 * @param {Object} params.resume - { base64, filename, mimeType, text }
 * @param {Object} params.preferences - User preferences (visa, relocation, etc.)
 * @param {Object} params.jobContext - { title, company } for AI context
 * @param {string} params.authToken - Supabase auth token for AI calls
 * @returns {Object} { success, filledCount, totalFields, errors, aiFieldCount }
 */
async function fill({ profile, resume, preferences, jobContext, authToken }) {
  const errors = [];
  let filledCount = 0;
  let totalFields = 0;
  let aiFieldCount = 0;
  const filledFieldIds = new Set();

  const queue = new FieldFillerQueue({
    betweenFields: 120,
    onError: ({ field, error }) => errors.push(`${field}: ${error}`)
  });

  const fields = discoverFields();
  totalFields = fields.length;

  // ── Pass 1: Name attribute matching (highest confidence) ──
  for (const field of fields) {
    if (filledFieldIds.has(field.fieldId)) continue;

    const nameValue = matchNameAttrToProfile(field.nameAttr, profile);
    if (nameValue && (field.type === 'text' || field.type === 'email' || field.type === 'tel' ||
        field.type === 'url' || field.type === 'number' || field.type === 'textarea' || !field.element.type)) {
      filledFieldIds.add(field.fieldId);
      queue.enqueue(async () => {
        const result = await fillTextInput(field.element, nameValue);
        if (result.success) filledCount++;
        return result;
      }, `name-attr:${field.nameAttr}`);
    }
  }

  // ── Pass 2: Label pattern matching ──
  for (const field of fields) {
    if (filledFieldIds.has(field.fieldId)) continue;

    // Try profile field match
    const profileValue = matchLabelToProfile(field.label, profile, preferences);
    if (profileValue) {
      filledFieldIds.add(field.fieldId);

      if (field.type === 'select') {
        queue.enqueue(async () => {
          const result = await fillSelect(field.element, profileValue);
          if (result.success) filledCount++;
          else {
            // Try searchable dropdown fallback
            const sr = await fillSearchableDropdown(field.element, profileValue);
            if (sr.success) filledCount++;
          }
        }, `label:${field.label}`);
      } else {
        queue.enqueue(async () => {
          const result = await fillTextInput(field.element, profileValue);
          if (result.success) filledCount++;
          return result;
        }, `label:${field.label}`);
      }
      continue;
    }

    // Try question pattern match (visa, authorization, etc.)
    const questionValue = matchLabelToQuestion(field.label, preferences);
    if (questionValue) {
      filledFieldIds.add(field.fieldId);

      if (field.type === 'select') {
        queue.enqueue(async () => {
          const result = await fillSelect(field.element, questionValue);
          if (result.success) filledCount++;
        }, `question:${field.label}`);
      } else if (field.type === 'radio' || field.type === 'checkbox') {
        queue.enqueue(async () => {
          const result = await fillCheckboxRadio(field.element, questionValue);
          if (result.success) filledCount++;
        }, `question:${field.label}`);
      } else {
        queue.enqueue(async () => {
          const result = await fillTextInput(field.element, questionValue);
          if (result.success) filledCount++;
          return result;
        }, `question:${field.label}`);
      }
    }
  }

  // ── Execute queued fills ──
  await queue.run();

  // ── Pass 3: Resume upload ──
  if (resume?.base64) {
    const uploadResult = await handleResumeUpload(resume);
    if (uploadResult.success) filledCount++;
    else if (uploadResult.error) errors.push(`Resume upload: ${uploadResult.error}`);
  }

  // ── Pass 4: AI answerer for unmatched fields ──
  if (authToken) {
    try {
      const formContainer = document.querySelector('form') || document.body;
      const unmatched = collectUnmatchedQuestions(formContainer, filledFieldIds);

      if (unmatched.length > 0) {
        const aiAnswers = await answerCustomQuestions(
          unmatched, profile, resume, jobContext, authToken
        );

        if (aiAnswers && aiAnswers.length > 0) {
          const aiQueue = new FieldFillerQueue({
            betweenFields: 120,
            onError: ({ field, error }) => errors.push(`AI ${field}: ${error}`)
          });

          for (const answer of aiAnswers) {
            if (!answer.answer) continue;
            const el = document.getElementById(answer.id) ||
                       document.querySelector(`[name="${CSS.escape(answer.id)}"]`);
            if (!el) continue;

            aiFieldCount++;
            filledFieldIds.add(answer.id);

            if (el.tagName === 'SELECT') {
              aiQueue.enqueue(async () => {
                const result = await fillSelect(el, answer.answer);
                if (result.success) filledCount++;
              }, `ai:${answer.id}`);
            } else if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
              aiQueue.enqueue(async () => {
                const result = await fillTextInput(el, answer.answer);
                if (result.success) filledCount++;
              }, `ai:${answer.id}`);
            }
          }

          await aiQueue.run();
        }
      }
    } catch (aiErr) {
      errors.push(`AI answerer: ${aiErr.message}`);
    }
  }

  return {
    success: filledCount > 0,
    filledCount,
    totalFields,
    errors,
    aiFieldCount,
    handler: 'generic'
  };
}

export default { fill };
export { fill, GENERIC_LABEL_PATTERNS, GENERIC_QUESTION_PATTERNS };
