// fields/checkbox.ts — Checkbox & Toggle Filler
// v3.0.0: Fills standard checkboxes, custom toggle switches, and
// terms/conditions acceptance on ATS forms.

import { getReactProps, reactClick } from '../utils/reactProps.ts';

/**
 * Set a checkbox to the desired state (checked/unchecked).
 *
 * @param {HTMLInputElement} el - The checkbox input
 * @param {boolean} checked - Desired state
 * @returns {Object} { success: boolean, error?: string }
 */
export function fillCheckbox(el, checked = true) {
  if (!el) {
    return { success: false, error: 'Missing element' };
  }

  // Standard <input type="checkbox">
  if (el.tagName === 'INPUT' && el.type === 'checkbox') {
    if (el.checked === checked) {
      return { success: true, changed: false };
    }

    // Try React props first
    const props = getReactProps(el);
    if (props?.onChange) {
      props.onChange({ target: { ...el, checked, type: 'checkbox' } });
      el.checked = checked;
      return { success: true, method: 'reactProps' };
    }

    // Standard DOM
    el.checked = checked;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { success: true, method: 'dom' };
  }

  // Custom toggle/switch (div/span with role="checkbox" or role="switch")
  const role = el.getAttribute('role');
  if (role === 'checkbox' || role === 'switch') {
    const isChecked = el.getAttribute('aria-checked') === 'true';
    if (isChecked === checked) {
      return { success: true, changed: false };
    }

    // Click to toggle
    reactClick(el);
    return { success: true, method: 'ariaClick' };
  }

  // Custom checkbox (label wrapping a hidden input)
  const hiddenInput = el.querySelector('input[type="checkbox"]');
  if (hiddenInput) {
    return fillCheckbox(hiddenInput, checked);
  }

  return { success: false, error: 'Element is not a recognized checkbox type' };
}

/**
 * Fill multiple checkboxes from a list of values.
 * Used for multi-select checkbox groups (e.g., "Select all that apply").
 *
 * @param {HTMLElement} container - Container with checkboxes
 * @param {string[]} values - Values or labels to check
 * @returns {Object} { success: boolean, matched: number, total: number }
 */
export function fillCheckboxGroup(container, values) {
  if (!container || !values || values.length === 0) {
    return { success: false, error: 'Missing container or values' };
  }

  const normalizedValues = values.map(v => v.toLowerCase().trim());
  const checkboxes = container.querySelectorAll('input[type="checkbox"]');
  let matched = 0;

  for (const cb of checkboxes) {
    const label = findCheckboxLabel(cb).toLowerCase().trim();
    const val = (cb.value || '').toLowerCase().trim();

    const shouldCheck = normalizedValues.some(v =>
      label.includes(v) || val.includes(v) || v.includes(label) || v.includes(val)
    );

    if (shouldCheck) {
      fillCheckbox(cb, true);
      matched++;
    }
  }

  return {
    success: matched > 0,
    matched,
    total: checkboxes.length
  };
}

/**
 * Accept terms/conditions checkbox.
 * Searches for common patterns (terms, agree, acknowledge, consent).
 *
 * @param {HTMLElement} container - Form or section container
 * @returns {Object} { success: boolean, error?: string }
 */
export function acceptTerms(container) {
  const root = container || document;
  const checkboxes = root.querySelectorAll(
    'input[type="checkbox"], [role="checkbox"]'
  );

  const termsPatterns = /\b(terms|agree|acknowledge|consent|confirm|accept|privacy|gdpr)\b/i;

  for (const cb of checkboxes) {
    const label = findCheckboxLabel(cb);
    if (termsPatterns.test(label)) {
      const result = fillCheckbox(cb, true);
      if (result.success) {
        return { success: true, label };
      }
    }
  }

  return { success: false, error: 'No terms/conditions checkbox found' };
}

// ============================================================
// HELPERS
// ============================================================

function findCheckboxLabel(el) {
  // Explicit label
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.textContent.trim();
  }

  // Wrapping label
  const parentLabel = el.closest('label');
  if (parentLabel) return parentLabel.textContent.trim();

  // aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  // Next sibling text
  const next = el.nextElementSibling;
  if (next && next.textContent) return next.textContent.trim();

  return el.value || '';
}
