// handlers/bamboohr.js — ES1-6: BambooHR ATS handler
// BambooHR career pages use standard form patterns.
// This handler extends the generic handler with BambooHR-specific
// selectors for better field detection.

import { safeFill } from './generic.js';

const BAMBOOHR_SELECTORS = {
  // BambooHR uses a React-based application form
  formContainer: '.BambooHR-ATS-board__apply-form, .ApplicationForm, [data-testid="application-form"], form[id*="application"]',
  firstName: 'input[name="firstName"], input[name="first_name"], input[id*="firstName"]',
  lastName: 'input[name="lastName"], input[name="last_name"], input[id*="lastName"]',
  email: 'input[name="email"], input[type="email"]',
  phone: 'input[name="phone"], input[type="tel"]',
  resume: 'input[type="file"][name*="resume"], input[type="file"][accept*="pdf"]',
  coverLetter: 'textarea[name*="cover"], textarea[name*="letter"]',
  linkedIn: 'input[name*="linkedin"], input[placeholder*="LinkedIn"]',
  location: 'input[name*="location"], input[name*="city"], input[name*="address"]',
  submitButton: 'button[type="submit"], input[type="submit"], button.fab-Button--primary',
};

/**
 * Fill a BambooHR application form.
 * Falls back to generic handler if BambooHR-specific selectors fail.
 */
export default async function fill(profile, options = {}) {
  const form = document.querySelector(BAMBOOHR_SELECTORS.formContainer);
  if (!form) {
    // Fall back to generic handler
    return safeFill(profile, options);
  }

  // Try BambooHR-specific field mapping first
  const fieldMap = [
    { selector: BAMBOOHR_SELECTORS.firstName, value: profile.firstName },
    { selector: BAMBOOHR_SELECTORS.lastName, value: profile.lastName },
    { selector: BAMBOOHR_SELECTORS.email, value: profile.email },
    { selector: BAMBOOHR_SELECTORS.phone, value: profile.phone },
    { selector: BAMBOOHR_SELECTORS.linkedIn, value: profile.linkedinUrl },
    { selector: BAMBOOHR_SELECTORS.location, value: profile.location },
  ];

  let filled = 0;
  let total = fieldMap.length;

  for (const { selector, value } of fieldMap) {
    if (!value) continue;
    const el = form.querySelector(selector);
    if (!el) continue;

    try {
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      filled++;
    } catch {
      // Individual field failure is non-fatal
    }
  }

  // For any remaining custom fields, delegate to generic
  if (filled < 2) {
    return safeFill(profile, options);
  }

  return { filled, total, handler: 'bamboohr' };
}
