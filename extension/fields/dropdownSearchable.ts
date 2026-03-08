// fields/dropdownSearchable.ts — Searchable Dropdown Filler
// v3.0.0: Fills react-select, select2, and custom searchable dropdowns.
// These are the complex dropdowns found on Greenhouse (both legacy and React).
// MUST be used through FieldFillerQueue to prevent race conditions.

import { getReactProps, reactClick } from '../utils/reactProps.ts';

/**
 * Fill a searchable dropdown (react-select, select2, or custom).
 * This function handles the full 6-step process:
 * 1. Clear existing value via React props or DOM
 * 2. Open dropdown via mouseUp/click
 * 3. Wait for render (300ms)
 * 4. Scan options or type search query
 * 5. Click matching option
 * 6. Close via onBlur
 *
 * @param {HTMLElement} container - The dropdown container element
 * @param {string} value - Value or text to select
 * @param {Object} options - { searchable: boolean, lazyLoaded: boolean }
 * @returns {Object} { success: boolean, matched?: string, error?: string }
 */
export async function fillSearchableDropdown(container, value, options = {}) {
  if (!container || !value) {
    return { success: false, error: 'Missing container or value' };
  }

  const { searchable = true, lazyLoaded = false } = options;
  const normalizedValue = value.toLowerCase().trim();

  try {
    // Detect dropdown type
    const type = detectDropdownType(container);

    if (type === 'react-select') {
      return await fillReactSelect(container, normalizedValue, { searchable, lazyLoaded });
    }
    if (type === 'select2') {
      return await fillSelect2(container, normalizedValue);
    }
    if (type === 'custom-listbox') {
      return await fillCustomListbox(container, normalizedValue);
    }

    return { success: false, error: `Unknown dropdown type in container` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// DROPDOWN TYPE DETECTION
// ============================================================

function detectDropdownType(el) {
  // react-select: has class containing 'react-select' or css-* prefix containers
  if (el.querySelector('[class*="react-select"], [class*="-control"], [class*="css-"]')) {
    return 'react-select';
  }
  // select2: has class 'select2-container' or 'select2-selection'
  if (el.querySelector('.select2-container, .select2-selection')) {
    return 'select2';
  }
  // Custom listbox: has role="listbox" or role="combobox"
  if (el.querySelector('[role="listbox"], [role="combobox"]') || el.getAttribute('role') === 'combobox') {
    return 'custom-listbox';
  }
  return null;
}

// ============================================================
// REACT-SELECT (Greenhouse React boards)
// ============================================================

async function fillReactSelect(container, value, { searchable, lazyLoaded }) {
  // Step 1: Clear existing value
  const clearBtn = container.querySelector('[class*="clear"], [aria-label*="clear"], [aria-label*="Remove"]');
  if (clearBtn) {
    reactClick(clearBtn);
    await wait(150);
  }

  // Step 2: Open dropdown
  const control = container.querySelector('[class*="-control"], [class*="indicatorContainer"]') || container;
  const input = container.querySelector('input[role="combobox"], input[aria-autocomplete]') || container.querySelector('input');

  // Open via mouseDown on control (react-select pattern)
  control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await wait(50);
  control.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

  // Step 3: Wait for render
  await wait(300);

  // Step 4: Search or scan
  let options = getVisibleOptions(container);

  if (searchable && input) {
    // Type into search input
    input.focus();
    // Use native input setter to trigger React state update
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    nativeInputValueSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // Wait for filtered results
    await wait(lazyLoaded ? 1000 : 300);
    options = getVisibleOptions(container);
  }

  // Step 5: Find and click best match
  const match = findBestOption(options, value);
  if (!match) {
    // Close dropdown
    document.body.click();
    return { success: false, error: `No option matching "${value}" found` };
  }

  reactClick(match.element);
  await wait(100);

  // Step 6: Close and scroll back
  const activeEl = document.activeElement;
  if (activeEl) {
    activeEl.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  }

  return { success: true, matched: match.text };
}

// ============================================================
// SELECT2 (Greenhouse Legacy boards)
// ============================================================

async function fillSelect2(container, value) {
  // Find the select2 trigger
  const trigger = container.querySelector('.select2-selection') || container;

  // Open
  trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await wait(300);

  // Find the search input (appears in the dropdown overlay)
  const searchInput = document.querySelector('.select2-search__field, .select2-search input');
  if (searchInput) {
    searchInput.focus();
    searchInput.value = value;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    await wait(400);
  }

  // Find options in the dropdown
  const dropdownOptions = document.querySelectorAll('.select2-results__option');
  let bestMatch = null;
  let bestScore = 0;

  for (const opt of dropdownOptions) {
    if (opt.getAttribute('aria-disabled') === 'true') continue;
    const text = opt.textContent.trim().toLowerCase();
    const score = matchScore(text, value);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = opt;
    }
  }

  if (!bestMatch) {
    // Close select2
    document.body.click();
    return { success: false, error: `No select2 option matching "${value}"` };
  }

  bestMatch.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  await wait(100);

  return { success: true, matched: bestMatch.textContent.trim() };
}

// ============================================================
// CUSTOM LISTBOX (LinkedIn, generic)
// ============================================================

async function fillCustomListbox(container, value) {
  // Find the combobox input or trigger
  const input = container.querySelector('[role="combobox"], input') || container;

  // Focus and type
  input.focus();
  if (input.tagName === 'INPUT') {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    reactClick(input);
  }

  // Wait for listbox to appear
  await wait(1000);

  // Find the listbox (might be outside the container)
  const listbox = document.querySelector('[role="listbox"]') ||
    container.querySelector('[role="listbox"]');

  if (!listbox) {
    return { success: false, error: 'Listbox did not appear' };
  }

  const options = listbox.querySelectorAll('[role="option"]');
  let bestMatch = null;
  let bestScore = 0;

  for (const opt of options) {
    const text = opt.textContent.trim().toLowerCase();
    const score = matchScore(text, value);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = opt;
    }
  }

  if (!bestMatch && options.length > 0) {
    // Fallback: select first option
    bestMatch = options[0];
  }

  if (!bestMatch) {
    return { success: false, error: 'No options in listbox' };
  }

  reactClick(bestMatch);
  await wait(100);

  return { success: true, matched: bestMatch.textContent.trim() };
}

// ============================================================
// HELPERS
// ============================================================

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getVisibleOptions(container) {
  // react-select options
  const rcOptions = document.querySelectorAll('[class*="-option"], [id*="option"]');
  if (rcOptions.length > 0) {
    return Array.from(rcOptions).map(el => ({
      element: el,
      text: el.textContent.trim()
    }));
  }

  // Generic role="option"
  const roleOptions = document.querySelectorAll('[role="option"]');
  return Array.from(roleOptions).map(el => ({
    element: el,
    text: el.textContent.trim()
  }));
}

function findBestOption(options, value) {
  let best = null;
  let bestScore = 0;

  for (const opt of options) {
    const score = matchScore(opt.text.toLowerCase(), value);
    if (score > bestScore) {
      bestScore = score;
      best = opt;
    }
  }

  return bestScore > 0 ? best : null;
}

function matchScore(text, query) {
  if (text === query) return 100;
  if (text.startsWith(query)) return 80;
  if (text.includes(query)) return 60;
  if (query.includes(text) && text.length > 2) return 40;
  return 0;
}
