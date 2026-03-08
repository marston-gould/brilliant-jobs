// fields/radioGroup.ts — Radio Button Group Filler
// v3.0.0: Fills radio button groups on ATS forms.
// Handles standard radio inputs, custom role="radio" elements,
// and LinkedIn's resume card selection pattern.

import { getReactProps, reactClick } from '../utils/reactProps.ts';

/**
 * Select a radio button in a group by matching value or label text.
 *
 * @param {HTMLElement} container - Container holding the radio group
 * @param {string} value - Value, label text, or partial match to select
 * @param {Object} options - { exact: boolean, name: string }
 * @returns {Object} { success: boolean, matched?: string, error?: string }
 */
export function fillRadioGroup(container, value, options = {}) {
  if (!container || !value) {
    return { success: false, error: 'Missing container or value' };
  }

  const normalizedValue = value.toLowerCase().trim();
  const { exact = false, name = null } = options;

  // Collect all radio-like elements
  let radios;
  if (name) {
    radios = container.querySelectorAll(`input[type="radio"][name="${name}"]`);
  } else {
    radios = container.querySelectorAll('input[type="radio"], [role="radio"]');
  }

  if (radios.length === 0) {
    return { success: false, error: 'No radio buttons found in container' };
  }

  // Score each radio for match quality
  let bestMatch = null;
  let bestScore = 0;

  for (const radio of radios) {
    const radioValue = (radio.value || '').toLowerCase().trim();
    const radioLabel = findRadioLabel(radio).toLowerCase().trim();

    let score = 0;

    // Exact value match
    if (radioValue === normalizedValue) score = 100;
    // Exact label match
    else if (radioLabel === normalizedValue) score = 90;
    // Value contains
    else if (!exact && radioValue.includes(normalizedValue)) score = 70;
    // Label contains
    else if (!exact && radioLabel.includes(normalizedValue)) score = 60;
    // Reverse contains
    else if (!exact && normalizedValue.includes(radioValue) && radioValue.length > 1) score = 50;
    else if (!exact && normalizedValue.includes(radioLabel) && radioLabel.length > 1) score = 40;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = radio;
    }
  }

  if (!bestMatch) {
    return { success: false, error: `No radio matching "${value}" found` };
  }

  // Select the radio
  return selectRadio(bestMatch);
}

/**
 * Select a specific radio button element.
 *
 * @param {HTMLElement} radio - The radio input or role="radio" element
 * @returns {Object} { success: boolean, matched: string }
 */
export function selectRadio(radio) {
  if (!radio) {
    return { success: false, error: 'Missing radio element' };
  }

  const label = findRadioLabel(radio);

  // Standard <input type="radio">
  if (radio.tagName === 'INPUT' && radio.type === 'radio') {
    // Try React props
    const props = getReactProps(radio);
    if (props?.onChange) {
      props.onChange({ target: { ...radio, checked: true, type: 'radio', value: radio.value } });
      radio.checked = true;
      return { success: true, matched: label, method: 'reactProps' };
    }

    // Standard DOM
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    radio.dispatchEvent(new Event('input', { bubbles: true }));
    radio.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { success: true, matched: label, method: 'dom' };
  }

  // Custom role="radio"
  if (radio.getAttribute('role') === 'radio') {
    reactClick(radio);
    return { success: true, matched: label, method: 'ariaClick' };
  }

  // LinkedIn resume card pattern: label wrapping input[type="radio"]
  const innerRadio = radio.querySelector('input[type="radio"]');
  if (innerRadio) {
    return selectRadio(innerRadio);
  }

  // Fallback: just click it
  reactClick(radio);
  return { success: true, matched: label, method: 'fallbackClick' };
}

/**
 * Smart question mapping for radio groups.
 * Maps common ATS questions to user preferences.
 *
 * @param {HTMLElement} container - Container with radio group
 * @param {string} questionText - The question/label text
 * @param {Object} preferences - User preferences (visaSponsorship, legallyAuthorized, etc.)
 * @returns {Object} { success: boolean, question: string, answer: string }
 */
export function fillSmartQuestion(container, questionText, preferences) {
  const q = questionText.toLowerCase();

  // Visa/sponsorship questions
  if (/visa|sponsor/i.test(q)) {
    const answer = preferences.visaSponsorship ? 'yes' : 'no';
    return fillRadioGroup(container, answer);
  }

  // Work authorization
  if (/authorize|legal.*work|eligible.*work|right to work/i.test(q)) {
    const answer = preferences.legallyAuthorized ? 'yes' : 'no';
    return fillRadioGroup(container, answer);
  }

  // Relocation
  if (/relocat|move|willing.*move/i.test(q)) {
    const answer = preferences.willingToRelocate ? 'yes' : 'no';
    return fillRadioGroup(container, answer);
  }

  // 18+ / age verification
  if (/18.*old|age.*18|legal.*age/i.test(q)) {
    return fillRadioGroup(container, 'yes');
  }

  // Gender (prefer not to say if no preference set)
  if (/gender/i.test(q)) {
    const answer = preferences.gender || 'Prefer not to say';
    return fillRadioGroup(container, answer);
  }

  // Race/ethnicity (prefer not to say if no preference set)
  if (/race|ethnic/i.test(q)) {
    const answer = preferences.ethnicity || 'Prefer not to say';
    return fillRadioGroup(container, answer);
  }

  // Veteran status
  if (/veteran|military/i.test(q)) {
    const answer = preferences.veteranStatus || 'Prefer not to say';
    return fillRadioGroup(container, answer);
  }

  // Disability
  if (/disabilit/i.test(q)) {
    const answer = preferences.disabilityStatus || 'Prefer not to say';
    return fillRadioGroup(container, answer);
  }

  return { success: false, error: 'No smart mapping for this question' };
}

// ============================================================
// HELPERS
// ============================================================

function findRadioLabel(el) {
  // Explicit label
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.textContent.trim();
  }

  // Wrapping label
  const parentLabel = el.closest('label');
  if (parentLabel) {
    // Get text excluding the input itself
    const clone = parentLabel.cloneNode(true);
    clone.querySelectorAll('input').forEach(inp => inp.remove());
    return clone.textContent.trim();
  }

  // aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  // aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl) return labelEl.textContent.trim();
  }

  // Next sibling
  const next = el.nextElementSibling;
  if (next) return next.textContent.trim();

  return el.value || '';
}
