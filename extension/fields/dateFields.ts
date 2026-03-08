// fields/dateFields.ts — Date Field Filler
// v3.0.0: Fills date inputs, date pickers, and split date fields (month/day/year).
// ATS platforms use various date formats and input patterns.

import { setReactValue, setDOMValue, isReactApp } from '../utils/reactProps.ts';

/**
 * Fill a standard date input (<input type="date">).
 *
 * @param {HTMLInputElement} el - The date input element
 * @param {string} dateStr - Date string (ISO, MM/DD/YYYY, or YYYY-MM-DD)
 * @returns {Object} { success: boolean, error?: string }
 */
export function fillDateInput(el, dateStr) {
  if (!el || !dateStr) {
    return { success: false, error: 'Missing element or date value' };
  }

  try {
    const parsed = parseDate(dateStr);
    if (!parsed) {
      return { success: false, error: `Could not parse date: ${dateStr}` };
    }

    // Standard date input expects YYYY-MM-DD
    const isoDate = formatISO(parsed);

    if (isReactApp(el)) {
      const result = setReactValue(el, isoDate);
      if (result) return { success: true };
    }

    // Standard DOM approach
    setDOMValue(el, isoDate);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Fill split date fields (separate month, day, year selects or inputs).
 * Common on Greenhouse and Workday for start date, graduation date.
 *
 * @param {Object} fields - { month: HTMLElement, day: HTMLElement, year: HTMLElement }
 * @param {string} dateStr - Date string
 * @returns {Object} { success: boolean, error?: string }
 */
export function fillSplitDate(fields, dateStr) {
  if (!fields || !dateStr) {
    return { success: false, error: 'Missing fields or date value' };
  }

  const parsed = parseDate(dateStr);
  if (!parsed) {
    return { success: false, error: `Could not parse date: ${dateStr}` };
  }

  const results = [];

  // Month (1-12 or 01-12 or month name)
  if (fields.month) {
    const monthVal = findMonthValue(fields.month, parsed.month);
    if (monthVal !== null) {
      setFieldValue(fields.month, monthVal);
      results.push('month');
    }
  }

  // Day
  if (fields.day) {
    setFieldValue(fields.day, String(parsed.day));
    results.push('day');
  }

  // Year
  if (fields.year) {
    setFieldValue(fields.year, String(parsed.year));
    results.push('year');
  }

  return {
    success: results.length > 0,
    filled: results
  };
}

// ============================================================
// HELPERS
// ============================================================

function parseDate(str) {
  if (!str) return null;

  // ISO: YYYY-MM-DD
  let match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return { year: +match[1], month: +match[2], day: +match[3] };

  // US: MM/DD/YYYY
  match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return { year: +match[3], month: +match[1], day: +match[2] };

  // EU: DD/MM/YYYY
  match = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (match) return { year: +match[3], month: +match[2], day: +match[1] };

  // Try native Date parsing as fallback
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  }

  return null;
}

function formatISO({ year, month, day }) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

function findMonthValue(el, monthNum) {
  if (el.tagName === 'SELECT') {
    for (const opt of el.options) {
      const val = opt.value.toLowerCase().trim();
      const txt = opt.textContent.toLowerCase().trim();
      if (
        val === String(monthNum) ||
        val === String(monthNum).padStart(2, '0') ||
        txt === MONTH_NAMES[monthNum - 1] ||
        txt.startsWith(MONTH_NAMES[monthNum - 1].slice(0, 3))
      ) {
        return opt.value;
      }
    }
  }
  // Input field — just use the number
  return String(monthNum).padStart(2, '0');
}

function setFieldValue(el, value) {
  if (isReactApp(el)) {
    setReactValue(el, value);
    return;
  }

  if (el.tagName === 'SELECT') {
    el.value = value;
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
