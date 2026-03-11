/**
 * eeoc-filler.js — AF-005: Shared EEOC/OFCCP Auto-Fill Utility
 *
 * Centralizes detection + auto-fill logic for voluntary self-identification
 * questions on ATS forms. Called by all 5 handler modules after their primary
 * field-fill passes.
 *
 * Profile fields consumed:
 *   profile.gender          — "Male" | "Female" | "Non-binary" | "Prefer not to say" | null
 *   profile.ethnicity       — race/ethnicity string | "Prefer not to say" | null
 *   profile.veteranStatus   — "I am a veteran" | "I am not a veteran" | "Prefer not to say" | null
 *   profile.disabilityStatus — disability answer string | "Prefer not to say" | null
 *   profile.citizenshipStatus — citizenship/work-auth string | null
 *
 * Returns: { filled: number, skipped: number, skipReasons: string[] }
 *
 * PostHog events emitted via optional capturePostHog callback:
 *   eeoc_autofill_complete — { filled, skipped, skip_reasons }
 */

'use strict';

/** Values that mean "user declined to answer" — skip without filling */
const PREFER_NOT_TO_SAY_VALUES = new Set([
  'prefer not to say',
  'prefer not to answer',
  'i prefer not to say',
  'decline to state',
  'decline',
  'do not wish to provide',
  'choose not to disclose',
  'not disclosed',
]);

/**
 * Field definitions — ordered by specificity.
 * patterns: lowercase substrings to match against question label text.
 * profileKey: key on the profile object.
 * name: human-readable field name for logging.
 */
const EEO_FIELDS = [
  {
    name: 'gender',
    profileKey: 'gender',
    patterns: ['gender', 'what is your gender', ' sex '],
    // "sex" alone is too broad — only match when surrounded by spaces or at string boundary
    strictPatterns: [/\bsex\b/i, /gender/i],
  },
  {
    name: 'race_ethnicity',
    profileKey: 'ethnicity',
    patterns: ['race', 'ethnic', 'hispanic', 'latino'],
    strictPatterns: [/race|ethnic|hispanic|latino/i],
  },
  {
    name: 'veteran_status',
    profileKey: 'veteranStatus',
    patterns: ['veteran', 'military service', 'protected veteran'],
    strictPatterns: [/veteran|military\s+service|protected\s+veteran/i],
  },
  {
    name: 'disability_status',
    profileKey: 'disabilityStatus',
    patterns: ['disabilit', 'disabled', 'ada', 'ofccp', 'section 503'],
    strictPatterns: [/disabilit|disabled|ada\b|ofccp|section\s*503/i],
  },
  {
    name: 'citizenship_status',
    profileKey: 'citizenshipStatus',
    patterns: ['citizenship', 'citizen of', 'us citizen', 'country of citizenship'],
    strictPatterns: [/citizenship|us\s+citizen|country\s+of\s+citizenship/i],
  },
];

/**
 * Determine if a profile value should be skipped (user chose "prefer not to say").
 */
function shouldSkip(value) {
  if (!value) return { skip: true, reason: 'no_value' };
  const normalized = String(value).toLowerCase().trim();
  if (PREFER_NOT_TO_SAY_VALUES.has(normalized)) return { skip: true, reason: 'prefer_not_to_say' };
  return { skip: false };
}

/**
 * Match label text against a field definition.
 */
function matchesField(labelText, field) {
  const lower = labelText.toLowerCase();
  return field.patterns.some(p => lower.includes(p));
}

/**
 * Attempt to select a value in a <select> element by matching option text.
 * Tries exact match first, then partial/normalized match.
 * Returns true if a match was set.
 */
async function trySelectValue(page, selectEl, value) {
  const normalized = value.toLowerCase().trim();
  const matched = await selectEl.evaluate((el, val) => {
    const norm = val.toLowerCase().trim();
    const opts = Array.from(el.options);
    // 1. Exact text match (case-insensitive)
    let opt = opts.find(o => o.text.toLowerCase().trim() === norm);
    // 2. Partial text match — option text contains value
    if (!opt) opt = opts.find(o => o.text.toLowerCase().includes(norm));
    // 3. Value attribute match
    if (!opt) opt = opts.find(o => o.value.toLowerCase().trim() === norm);
    // 4. Value contains norm
    if (!opt) opt = opts.find(o => o.value.toLowerCase().includes(norm));
    if (opt) {
      el.value = opt.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }, normalized);
  return matched;
}

/**
 * Attempt to click a radio button whose label text matches value.
 * Returns true if clicked.
 */
async function tryRadioValue(page, groupEl, value) {
  const normalized = value.toLowerCase().trim();
  const clicked = await groupEl.evaluate((group, val) => {
    const norm = val.toLowerCase().trim();
    const radios = Array.from(group.querySelectorAll('input[type="radio"]'));
    for (const radio of radios) {
      const label = document.querySelector(`label[for="${radio.id}"]`);
      const labelText = (label?.textContent || radio.value || '').toLowerCase().trim();
      if (labelText === norm || labelText.includes(norm) || radio.value.toLowerCase() === norm) {
        radio.click();
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  }, normalized);
  return clicked;
}

/**
 * Main export: fill EEOC questions on the current page.
 *
 * @param {object} page        — Playwright Page
 * @param {object} profile     — Worker profile object (with gender, ethnicity, etc.)
 * @param {function} log       — Handler-provided log function
 * @param {function} [capturePostHog] — Optional PostHog capture fn(event, props)
 * @returns {{ filled: number, skipped: number, skipReasons: string[] }}
 */
async function fillEeoQuestions(page, profile, log, capturePostHog) {
  const result = { filled: 0, skipped: 0, skipReasons: [] };

  for (const field of EEO_FIELDS) {
    const value = profile[field.profileKey];
    const { skip, reason } = shouldSkip(value);

    if (skip) {
      if (reason !== 'no_value') {
        // Only count as "skipped" if user explicitly chose prefer-not-to-say
        result.skipped++;
        result.skipReasons.push(`${field.name}:${reason}`);
        log(`EEO skip — ${field.name}`, { reason });
      }
      continue;
    }

    let filled = false;

    try {
      // ── Strategy 1: Select dropdowns ───────────────────────────────
      const allSelects = await page.$$('select');
      for (const selectEl of allSelects) {
        const labelText = await selectEl.evaluate(el => {
          const container = el.closest('.field, .question, fieldset, .form-group, .application-question, [data-ui="custom-field"]');
          const label = container?.querySelector('label, .question-label, .field-label');
          return (label?.textContent || container?.textContent || el.getAttribute('aria-label') || el.getAttribute('name') || '').toLowerCase();
        });

        if (!matchesField(labelText, field)) continue;

        const matched = await trySelectValue(page, selectEl, value);
        if (matched) {
          log(`EEO filled (select) — ${field.name}`, { value });
          filled = true;
          result.filled++;
          break;
        }
      }

      if (filled) continue;

      // ── Strategy 2: Radio groups ────────────────────────────────────
      const radioGroups = await page.$$('fieldset, .field, .question, .application-question, [data-ui="custom-field"], .form-group');
      for (const groupEl of radioGroups) {
        const labelText = await groupEl.evaluate(el => {
          const label = el.querySelector('legend, label, .question-label, .field-label');
          return (label?.textContent || '').toLowerCase();
        });

        if (!matchesField(labelText, field)) continue;

        // Check this group has radio buttons
        const hasRadios = await groupEl.evaluate(el => el.querySelectorAll('input[type="radio"]').length > 0);
        if (!hasRadios) continue;

        const clicked = await tryRadioValue(page, groupEl, value);
        if (clicked) {
          log(`EEO filled (radio) — ${field.name}`, { value });
          filled = true;
          result.filled++;
          break;
        }
      }

    } catch (err) {
      log(`EEO fill error — ${field.name}`, { error: err.message });
    }

    if (!filled) {
      log(`EEO no match — ${field.name}`, { value });
    }
  }

  // ── PostHog event ───────────────────────────────────────────────────
  if (typeof capturePostHog === 'function' && (result.filled > 0 || result.skipped > 0)) {
    try {
      capturePostHog('eeoc_autofill_complete', {
        eeoc_questions_filled: result.filled,
        eeoc_questions_skipped: result.skipped,
        eeoc_skip_reasons: result.skipReasons,
      });
    } catch { /* non-blocking */ }
  }

  return result;
}

module.exports = { fillEeoQuestions };
