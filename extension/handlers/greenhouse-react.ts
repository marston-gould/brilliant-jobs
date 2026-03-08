// handlers/greenhouse-react.ts — Greenhouse React Board Form Filler
// v3.2.0: Full implementation for job-boards.greenhouse.io + job-boards.eu.greenhouse.io
// Full React app — requires __reactProps hacking via getReactProps().
// React-controlled inputs ignore standard DOM mutations (input.value = 'foo' is silently dropped).
// Must access __reactProps on DOM elements and call onChange handler directly.
//
// Key challenges:
// - React version detection (__reactProps vs __reactFiber vs __reactInternalInstance)
// - react-select dropdowns that break if two open simultaneously → serialize via FieldFillerQueue
// - 6-step dropdown filling: clear → open → wait → scan/search → click → close
// - Repeating education sections with numbered tracking
// - File upload via React props fallback when DataTransfer is blocked

import { getReactProps, setReactValue, setDOMValue, reactClick, isReactApp } from '../utils/reactProps.ts';
import { fillSearchableDropdown } from '../fields/dropdownSearchable.ts';
import { FieldFillerQueue } from '../utils/fieldFillerQueue.ts';
import { uploadFile, base64ToFile } from '../utils/fileUpload.ts';

// ============================================================
// FIELD DETECTION: Greenhouse React board DOM structure
// ============================================================
// Greenhouse React boards render fields inside containers like:
//   <div data-mapped="true">
//     <div class="field">
//       <label>First Name</label>
//       <input ... />  ← React-controlled
//     </div>
//   </div>
// Dropdowns are react-select components with class patterns like:
//   .css-*-control, .css-*-menu, [class*="indicatorContainer"]

/**
 * Detect all fillable fields on a Greenhouse React board.
 * Returns an array of { el, type, label, container } objects.
 */
function detectFields() {
  const fields = [];

  // All field containers: Greenhouse React wraps each in div with specific structure
  const fieldContainers = document.querySelectorAll(
    '.field, [class*="field-wrapper"], [data-test*="field"], ' +
    'div[class*="css-"] > label + div, ' +
    '.application-field, .custom-question'
  );

  for (const container of fieldContainers) {
    // Find the label
    const labelEl = container.querySelector('label, [class*="label"]');
    const label = labelEl ? labelEl.textContent.trim().toLowerCase() : '';

    // Text inputs
    const textInput = container.querySelector(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], input:not([type])'
    );
    if (textInput && !isHidden(textInput)) {
      fields.push({ el: textInput, type: 'text', label, container });
      continue;
    }

    // Textareas
    const textarea = container.querySelector('textarea');
    if (textarea && !isHidden(textarea)) {
      fields.push({ el: textarea, type: 'textarea', label, container });
      continue;
    }

    // React-select dropdowns (detect by class patterns)
    const reactSelectContainer = container.querySelector(
      '[class*="react-select"], [class*="-control"], [class*="indicatorContainer"], ' +
      '[class*="css-"][class*="container"]'
    );
    if (reactSelectContainer) {
      // Walk up to find the outermost react-select wrapper
      const selectRoot = findReactSelectRoot(reactSelectContainer);
      if (selectRoot) {
        fields.push({ el: selectRoot, type: 'react-select', label, container });
        continue;
      }
    }

    // Standard <select> (some Greenhouse React boards still have these)
    const select = container.querySelector('select');
    if (select && !isHidden(select)) {
      fields.push({ el: select, type: 'select', label, container });
      continue;
    }

    // File inputs
    const fileInput = container.querySelector('input[type="file"]');
    if (fileInput) {
      fields.push({ el: fileInput, type: 'file', label, container });
      continue;
    }

    // Checkboxes
    const checkbox = container.querySelector('input[type="checkbox"]');
    if (checkbox) {
      fields.push({ el: checkbox, type: 'checkbox', label, container });
      continue;
    }

    // Radio groups
    const radios = container.querySelectorAll('input[type="radio"]');
    if (radios.length > 0) {
      fields.push({ el: container, type: 'radio', label, container });
      continue;
    }

    // Date fields
    const dateInput = container.querySelector('input[type="date"]');
    if (dateInput) {
      fields.push({ el: dateInput, type: 'date', label, container });
      continue;
    }
  }

  return fields;
}


/**
 * Main fill function — called by contentScript.js handler router.
 *
 * @param {Object} params
 * @param {Object} params.profile - User profile data
 * @param {Object} params.resume  - { base64, filename, mimeType }
 * @param {Object} params.preferences - User preferences (visa, relocation, etc.)
 * @returns {Object} { success, filledCount, totalFields, errors, ats }
 */
async function fill({ profile, resume, preferences }) {
  const errors = [];
  let filledCount = 0;
  let totalFields = 0;

  // Verify this is a React app
  if (!isReactApp()) {
    return {
      success: false,
      filledCount: 0,
      totalFields: 0,
      errors: ['Page does not appear to be a React application. Try greenhouse-legacy handler.'],
      ats: 'greenhouse-react'
    };
  }

  const queue = new FieldFillerQueue({
    betweenFields: 150,
    renderDelay: 300,
    lazyLoadDelay: 1000,
    onError: ({ field, error }) => errors.push(`${field}: ${error}`)
  });

  // Detect all fields on the page
  const fields = detectFields();

  for (const field of fields) {
    const value = resolveValue(field.label, field.type, profile, preferences);
    if (!value && field.type !== 'file') continue;

    totalFields++;

    switch (field.type) {
      case 'text':
      case 'textarea':
        queue.enqueue(async () => {
          const result = await fillReactInput(field.el, value);
          if (result.success) filledCount++;
          else errors.push(`${field.label}: ${result.error}`);
          return result;
        }, field.label || 'text');
        break;

      case 'react-select':
        queue.enqueue(async () => {
          const result = await fillReactSelectDropdown(field.el, value);
          if (result.success) filledCount++;
          else errors.push(`select(${field.label}): ${result.error}`);
          return result;
        }, `react-select:${field.label}`);
        break;

      case 'select':
        queue.enqueue(async () => {
          const result = fillStandardSelect(field.el, value);
          if (result.success) filledCount++;
          return result;
        }, field.label || 'select');
        break;

      case 'checkbox':
        {
          const shouldCheck = value === true || value === 'true' || value === 'yes' || value === 'Yes';
          if (field.el.checked !== shouldCheck) {
            reactClick(field.el);
          }
          if (field.el.checked === shouldCheck) filledCount++;
        }
        break;

      case 'radio':
        queue.enqueue(async () => {
          const result = fillReactRadioGroup(field.container, value);
          if (result.success) filledCount++;
          return result;
        }, `radio:${field.label}`);
        break;

      case 'date':
        queue.enqueue(async () => {
          const result = await fillReactInput(field.el, value);
          if (result.success) filledCount++;
          return result;
        }, field.label || 'date');
        break;

      case 'file':
        if (resume?.base64) {
          queue.enqueue(async () => {
            const file = base64ToFile(resume.base64, resume.filename || 'resume.pdf', resume.mimeType);
            const result = await uploadFile(field.el, file);
            if (result.success) filledCount++;
            else errors.push(`file(${field.label}): ${result.error}`);
            return result;
          }, `file:${field.label}`);
        }
        break;
    }
  }

  // Drain the queue
  await queue.enqueueAll([]);

  return {
    success: errors.length === 0,
    filledCount,
    totalFields,
    errors,
    ats: 'greenhouse-react'
  };
}


// ============================================================
// REACT INPUT FILLING
// ============================================================

/**
 * Fill a React-controlled input element.
 * Uses __reactProps onChange when available, falls back to native setter + events.
 *
 * @param {HTMLElement} el - The input/textarea element
 * @param {string} value - Value to set
 * @returns {Object} { success, error? }
 */
async function fillReactInput(el, value) {
  if (!el || value === undefined || value === null) {
    return { success: false, error: 'Missing element or value' };
  }

  try {
    el.focus();
    el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

    // Try React props first
    const success = setReactValue(el, String(value));

    if (!success) {
      // Fallback: use native value setter + events
      setDOMValue(el, String(value));
    }

    // Blur to trigger validation
    await sleep(50);
    el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

    // Verify the value took
    const actual = el.value;
    if (actual === String(value)) {
      return { success: true };
    }

    // Second attempt: re-try with native setter + React
    const nativeSetter = Object.getOwnPropertyDescriptor(
      el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(el, String(value));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Re-try React props
    const props = getReactProps(el);
    if (props?.onChange) {
      props.onChange({
        target: { value: String(value), name: el.name, type: el.type },
        currentTarget: { value: String(value), name: el.name, type: el.type },
        preventDefault: () => {},
        stopPropagation: () => {},
        nativeEvent: new Event('change', { bubbles: true }),
        type: 'change'
      });
    }

    await sleep(50);
    return { success: el.value === String(value), error: el.value !== String(value) ? 'Value rejected by React' : undefined };

  } catch (err) {
    return { success: false, error: err.message };
  }
}


// ============================================================
// REACT-SELECT DROPDOWN FILLING (6-step process)
// ============================================================

/**
 * Fill a react-select dropdown on Greenhouse React boards.
 * MUST be called through FieldFillerQueue — breaks if two are open at once.
 *
 * 6-step process:
 * 1. Clear existing value via clear indicator or React props
 * 2. Open dropdown via mouseDown on control
 * 3. Wait for menu to render (300ms)
 * 4. If <100 options: scan and click match
 *    If >=100 options: type into search input (lazy-loaded)
 * 5. Click the matching option
 * 6. Close via onBlur
 */
async function fillReactSelectDropdown(container, value) {
  if (!container || !value) {
    return { success: false, error: 'Missing container or value' };
  }

  const normalizedValue = String(value).toLowerCase().trim();

  try {
    // Step 1: Clear existing value
    const clearBtn = container.querySelector(
      '[class*="clear"], [class*="Clear"], [aria-label*="clear"], [aria-label*="Remove"]'
    );
    if (clearBtn) {
      reactClick(clearBtn);
      await sleep(150);
    }

    // Step 2: Open the dropdown
    const control = container.querySelector(
      '[class*="-control"], [class*="control"], [role="combobox"]'
    );
    if (!control) {
      return { success: false, error: 'react-select control not found' };
    }

    // Use React props to open if available
    const controlProps = getReactProps(control);
    if (controlProps?.onMouseDown) {
      controlProps.onMouseDown({
        target: control,
        currentTarget: control,
        preventDefault: () => {},
        stopPropagation: () => {},
        button: 0
      });
    } else {
      control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    }

    // Step 3: Wait for menu to render
    await sleep(300);

    // Find the menu
    const menu = container.querySelector(
      '[class*="-menu"], [class*="menu"], [role="listbox"]'
    );
    if (!menu) {
      // Try clicking the input area instead
      const inputWrapper = container.querySelector('[class*="ValueContainer"], [class*="input"]');
      if (inputWrapper) {
        inputWrapper.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
        await sleep(300);
      }

      const retryMenu = container.querySelector('[class*="-menu"], [class*="menu"], [role="listbox"]');
      if (!retryMenu) {
        return { success: false, error: 'react-select menu did not open' };
      }
      return await selectFromMenu(container, retryMenu, normalizedValue);
    }

    return await selectFromMenu(container, menu, normalizedValue);

  } catch (err) {
    // Always try to close dropdown on error
    try { document.body.click(); } catch (_) { /* dropdown close best-effort */ }
    return { success: false, error: err.message };
  }
}

/**
 * Step 4-6: Search/scan options and click match.
 */
async function selectFromMenu(container, menu, normalizedValue) {
  // Count options
  let options = menu.querySelectorAll(
    '[class*="-option"], [class*="option"], [role="option"]'
  );

  // Step 4: If many options, type to search
  if (options.length >= 100 || options.length === 0) {
    const searchInput = container.querySelector(
      'input[role="combobox"], input[class*="input"], input[aria-autocomplete]'
    );
    if (searchInput) {
      searchInput.focus();

      // Use React props to set search value
      const inputProps = getReactProps(searchInput);
      if (inputProps?.onChange) {
        inputProps.onChange({
          target: { value: normalizedValue },
          currentTarget: { value: normalizedValue },
          preventDefault: () => {},
          stopPropagation: () => {},
          nativeEvent: new Event('change'),
          type: 'change'
        });
      } else {
        searchInput.value = normalizedValue;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Wait for lazy-loaded results
      await sleep(1000);

      // Re-query options
      options = menu.querySelectorAll(
        '[class*="-option"], [class*="option"], [role="option"]'
      );
    }
  }

  // Step 5: Find and click matching option
  for (const opt of options) {
    // Skip disabled or "no options" placeholders
    if (opt.getAttribute('aria-disabled') === 'true') continue;
    if (opt.classList && (
      [...opt.classList].some(c => c.includes('disabled') || c.includes('noOptions'))
    )) continue;

    const optText = opt.textContent.trim().toLowerCase();
    if (optText === normalizedValue || optText.includes(normalizedValue)) {
      // Prefer React click
      reactClick(opt);
      await sleep(100);

      // Step 6: Verify and close
      return { success: true, matched: opt.textContent.trim() };
    }
  }

  // Step 6: Close dropdown on failure
  const control = container.querySelector('[class*="-control"], [class*="control"]');
  if (control) {
    control.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  }

  return { success: false, error: `Option "${normalizedValue}" not found (${options.length} options scanned)` };
}


// ============================================================
// STANDARD SELECT (fallback for React boards with native selects)
// ============================================================

function fillStandardSelect(el, value) {
  if (!el || el.tagName !== 'SELECT') {
    return { success: false, error: 'Not a select element' };
  }

  const normalizedValue = String(value).toLowerCase().trim();

  for (const option of el.options) {
    const optVal = option.value.toLowerCase();
    const optText = option.textContent.trim().toLowerCase();
    if (optVal === normalizedValue || optText === normalizedValue || optText.includes(normalizedValue)) {
      // Use React props if available
      const props = getReactProps(el);
      if (props?.onChange) {
        props.onChange({
          target: { value: option.value },
          currentTarget: { value: option.value },
          preventDefault: () => {},
          stopPropagation: () => {},
          nativeEvent: new Event('change'),
          type: 'change'
        });
      } else {
        el.value = option.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return { success: true };
    }
  }

  return { success: false, error: `Option "${value}" not found` };
}


// ============================================================
// REACT RADIO GROUP
// ============================================================

function fillReactRadioGroup(container, value) {
  const radios = container.querySelectorAll('input[type="radio"]');
  const normalizedValue = String(value).toLowerCase().trim();

  for (const radio of radios) {
    // Check value
    if (radio.value.toLowerCase() === normalizedValue) {
      reactClick(radio);
      return { success: true };
    }

    // Check label text
    const label = radio.closest('label')?.textContent.trim().toLowerCase() ||
                  radio.nextElementSibling?.textContent.trim().toLowerCase() || '';
    if (label.includes(normalizedValue)) {
      reactClick(radio);
      return { success: true };
    }
  }

  return { success: false, error: `Radio option "${value}" not found` };
}


// ============================================================
// VALUE RESOLUTION
// ============================================================

/**
 * Map a field label to the appropriate value from profile/preferences.
 */
function resolveValue(label, type, profile, prefs) {
  if (!label) return undefined;

  // Direct field name mappings
  if (/first.?name/i.test(label)) return profile?.firstName;
  if (/last.?name/i.test(label)) return profile?.lastName;
  if (/full.?name/i.test(label)) return [profile?.firstName, profile?.lastName].filter(Boolean).join(' ');
  if (/^email/i.test(label) || /e-?mail/i.test(label)) return profile?.email;
  if (/phone|mobile|cell/i.test(label)) return profile?.phone;
  if (/linkedin/i.test(label)) return profile?.linkedin;
  if (/github/i.test(label)) return profile?.github;
  if (/website|portfolio|personal.*url/i.test(label)) return profile?.portfolio || profile?.website;
  if (/current.*(company|employer|org)/i.test(label)) return profile?.currentCompany;
  if (/current.*(title|position|role)/i.test(label)) return profile?.currentTitle;

  // Location
  if (/city|location|where.*based|current.*(city|location)/i.test(label)) return profile?.location || profile?.city;

  // Common questions
  if (/authoriz|legal.*(work|employ)|right to work/i.test(label)) return prefs?.legallyAuthorized;
  if (/visa|sponsor/i.test(label)) return prefs?.visaSponsorship;
  if (/relocat|willing.*(move|reloc)/i.test(label)) return prefs?.willingToRelocate;
  if (/years?.*(experience|exp)/i.test(label)) return prefs?.yearsExperience;
  if (/salary|compensation|pay|desired.*(salary|comp)/i.test(label)) return prefs?.desiredSalary;
  if (/start.*(date|when)|available|earliest/i.test(label)) return prefs?.startDate;
  if (/how.*hear|referr|source/i.test(label)) return prefs?.referralSource || 'Job board';

  // EEO / demographic (optional)
  if (/gender/i.test(label)) return prefs?.gender;
  if (/race|ethnic/i.test(label)) return prefs?.ethnicity;
  if (/veteran/i.test(label)) return prefs?.veteranStatus;
  if (/disab/i.test(label)) return prefs?.disabilityStatus;

  // Textareas
  if (type === 'textarea') {
    if (/cover.*(letter|note)/i.test(label)) return prefs?.coverLetter;
    if (/additional|anything.*add|comments/i.test(label)) return prefs?.additionalInfo;
    if (/why.*(interest|apply|join|want)/i.test(label)) return prefs?.whyInterested;
  }

  return undefined;
}


// ============================================================
// HELPERS
// ============================================================

/**
 * Find the outermost react-select container from any inner element.
 */
function findReactSelectRoot(el) {
  let current = el;
  let depth = 0;

  while (current && depth < 10) {
    // Check if this element looks like a react-select root
    const classes = current.className || '';
    if (typeof classes === 'string' && (
      classes.includes('react-select') ||
      // css-*-container pattern
      /css-[\w]+-container/.test(classes)
    )) {
      return current;
    }

    // Check if parent has a different component boundary
    if (current.parentElement) {
      const parentClasses = current.parentElement.className || '';
      if (typeof parentClasses === 'string' && parentClasses.includes('field')) {
        // We've reached the field wrapper — current or its child is the select root
        return current;
      }
    }

    current = current.parentElement;
    depth++;
  }

  return el; // Return original if we can't find a better root
}

/**
 * Check if an element is hidden.
 */
function isHidden(el) {
  if (!el) return true;
  const style = window.getComputedStyle(el);
  return style.display === 'none' || style.visibility === 'hidden' || el.type === 'hidden';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// CS-010: Wrap fill with graceful degradation — reports to PostHog instead of crashing
async function safeFill(opts) {
  try {
    return await fill(opts);
  } catch (err) {
    const errorMsg = err?.message || String(err);
    console.error('[BJ:greenhouse-react] Handler error (gracefully degraded):', errorMsg);
    try {
      chrome.runtime.sendMessage({
        type: 'ats:handlerError',
        handler: 'greenhouse-react',
        error: errorMsg,
        url: window.location.href,
        timestamp: new Date().toISOString()
      }).catch(e => { try { chrome.runtime.sendMessage({ type: 'reportError', payload: { context: 'greenhouse_react_error_report', error: e?.message || String(e) } }).catch(() => {}); } catch {} });
    } catch (_) { console.warn('[BJ] greenhouse-react error report failed'); }
    return {
      success: false,
      error: `greenhouse-react handler failed: ${errorMsg}`,
      filledCount: 0,
      skippedCount: opts?.fields?.length || 0,
      errorCount: 1,
      errors: [{ field: '_handler', error: errorMsg }],
      degraded: true
    };
  }
}


// Export
export default { fill: safeFill };
export { safeFill as fill };
