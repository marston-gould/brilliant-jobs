// handlers/jazzhr.ts — ES1-6: JazzHR ATS handler
// JazzHR application pages use standard HTML forms with
// predictable class names and field IDs.

import { safeFill } from './generic.js';

const JAZZHR_SELECTORS = {
  formContainer: '#applicant_form, .jazzhr-application, form[action*="jazz"], form.application-form',
  firstName: '#applicant_first_name, input[name="first_name"], input[name="applicant[first_name]"]',
  lastName: '#applicant_last_name, input[name="last_name"], input[name="applicant[last_name]"]',
  email: '#applicant_email, input[name="email"], input[name="applicant[email]"]',
  phone: '#applicant_phone, input[name="phone"], input[name="applicant[phone]"]',
  resume: 'input[type="file"][name*="resume"], input[type="file"][id*="resume"]',
  coverLetter: 'textarea[name*="cover_letter"], textarea[id*="cover_letter"]',
  linkedIn: 'input[name*="linkedin"], input[name*="linked_in"]',
  location: '#applicant_location, input[name*="address"], input[name*="city"]',
  submitButton: 'button[type="submit"], input[type="submit"], .apply-button',
};

/**
 * Fill a JazzHR application form.
 * Falls back to generic handler if JazzHR-specific selectors fail.
 */
export default async function fill(profile, options = {}) {
  const form = document.querySelector(JAZZHR_SELECTORS.formContainer);
  if (!form) {
    return safeFill(profile, options);
  }

  const fieldMap = [
    { selector: JAZZHR_SELECTORS.firstName, value: profile.firstName },
    { selector: JAZZHR_SELECTORS.lastName, value: profile.lastName },
    { selector: JAZZHR_SELECTORS.email, value: profile.email },
    { selector: JAZZHR_SELECTORS.phone, value: profile.phone },
    { selector: JAZZHR_SELECTORS.linkedIn, value: profile.linkedinUrl },
    { selector: JAZZHR_SELECTORS.location, value: profile.location },
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

  if (filled < 2) {
    return safeFill(profile, options);
  }

  return { filled, total, handler: 'jazzhr' };
}
