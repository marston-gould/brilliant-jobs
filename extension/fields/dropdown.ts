// fields/dropdown.ts — Dropdown Filler
// v3.0.0: Fills standard <select>, select2, and basic dropdowns.
// For searchable/react-select dropdowns, use dropdownSearchable.js

import { setDOMValue, getReactProps, reactClick } from '../utils/reactProps.ts';

/**
 * Fill a standard <select> dropdown.
 *
 * @param {HTMLSelectElement} el - The select element
 * @param {string} value - Value or text to select
 * @returns {Object} { success: boolean, error?: string }
 */
export function fillSelect(el, value) {
  if (!el || el.tagName !== 'SELECT') {
    return { success: false, error: 'Not a select element' };
  }

  const normalizedValue = value.toLowerCase().trim();

  // Try matching by value first, then by text content
  let matched = false;
  for (const option of el.options) {
    if (
      option.value.toLowerCase() === normalizedValue ||
      option.textContent.trim().toLowerCase() === normalizedValue ||
      option.textContent.trim().toLowerCase().includes(normalizedValue)
    ) {
      el.value = option.value;
      matched = true;
      break;
    }
  }

  if (!matched) {
    return { success: false, error: `Option "${value}" not found` };
  }

  // Dispatch events
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('input', { bubbles: true }));

  return { success: true };
}

/**
 * Fill a custom dropdown (role="listbox" or similar).
 * Used for LinkedIn, Ashby, and other custom dropdown implementations.
 *
 * @param {HTMLElement} trigger - The element that opens the dropdown
 * @param {string} value - Text of the option to select
 * @param {Object} options - { containerSelector, optionSelector, waitMs }
 * @returns {Object} { success: boolean, error?: string }
 */
export async function fillCustomDropdown(trigger, value, options = {}) {
  const waitMs = options.waitMs || 300;
  const optionSelector = options.optionSelector ||
    '[role="option"], li[data-value], [class*="option"]';

  try {
    // Open the dropdown
    trigger.click();
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    await new Promise(r => setTimeout(r, waitMs));

    // Find the dropdown container
    const container = options.containerSelector
      ? document.querySelector(options.containerSelector)
      : (trigger.closest('[role="listbox"]') ||
         document.querySelector('[role="listbox"]') ||
         document.querySelector('[class*="dropdown-menu"]:not([style*="display: none"])'));

    if (!container) {
      return { success: false, error: 'Dropdown container not found' };
    }

    // Find and click the matching option
    const optionEls = container.querySelectorAll(optionSelector);
    const normalizedValue = value.toLowerCase().trim();

    for (const opt of optionEls) {
      const optText = opt.textContent.trim().toLowerCase();
      if (optText === normalizedValue || optText.includes(normalizedValue)) {
        // Use React click if available, otherwise DOM click
        const props = getReactProps(opt);
        if (props?.onClick) {
          reactClick(opt);
        } else {
          opt.click();
        }
        return { success: true };
      }
    }

    // Close dropdown on failure
    trigger.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    document.body.click();

    return { success: false, error: `Option "${value}" not found in custom dropdown` };

  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Fill a checkbox or radio button.
 *
 * @param {HTMLInputElement} el - checkbox or radio input
 * @param {boolean|string} value - true/false for checkbox, value for radio
 * @returns {Object} { success: boolean }
 */
export function fillCheckboxRadio(el, value) {
  if (el.type === 'checkbox') {
    const shouldCheck = value === true || value === 'true' || value === 'yes' || value === 'Yes';
    if (el.checked !== shouldCheck) {
      el.click();
    }
    return { success: el.checked === shouldCheck };
  }

  if (el.type === 'radio') {
    const normalizedValue = String(value).toLowerCase().trim();
    // Find the radio group
    const name = el.name;
    if (name) {
      const radios = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
      for (const radio of radios) {
        const radioLabel = findRadioLabel(radio);
        if (
          radio.value.toLowerCase() === normalizedValue ||
          radioLabel.toLowerCase().includes(normalizedValue)
        ) {
          radio.click();
          return { success: true };
        }
      }
    }
    return { success: false, error: 'Radio option not found' };
  }

  return { success: false, error: 'Not a checkbox or radio' };
}

/**
 * Find the label for a radio button.
 */
function findRadioLabel(radio) {
  // Check for label[for]
  if (radio.id) {
    const label = document.querySelector(`label[for="${radio.id}"]`);
    if (label) return label.textContent.trim();
  }
  // Check parent label
  const parentLabel = radio.closest('label');
  if (parentLabel) return parentLabel.textContent.trim();
  // Check next sibling
  const next = radio.nextElementSibling;
  if (next) return next.textContent.trim();
  return '';
}
