// worker/handlers/greenhouse.js
// Headless browser handler for Greenhouse application forms
// Covers: boards.greenhouse.io, job-boards.greenhouse.io, job-boards.eu.greenhouse.io
// AS-1: 40% of jobs (~176K)

import { humanType, humanClick, humanSelect, humanFileUpload, humanScroll, randomDelay } from '../utils/human-sim.js';
import { captureFailureScreenshot, capturePageState } from '../utils/screenshot.js';

/**
 * Fill and submit a Greenhouse application form.
 * @param {import('playwright').Page} page
 * @param {string} jobUrl — Greenhouse job URL
 * @param {object} profile — { name, email, phone, linkedin, resumePath, workAuth, sponsorship }
 * @param {string} resumePath — local file path to resume PDF
 * @param {object} opts — { logger, sb, userId, jobId }
 * @returns {Promise<{ status: string, confirmationId?: string, error?: string, detail?: string }>}
 */
export async function fillGreenhouse(page, jobUrl, profile, resumePath, opts = {}) {
  const { logger, sb, userId, jobId } = opts;
  const log = (msg, data) => logger?.info(`[GH] ${msg}`, data);
  const warn = (msg, data) => logger?.warn(`[GH] ${msg}`, data);

  try {
    // ── Navigate to application page ──
    log('Navigating to job URL', { url: jobUrl });
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(1000, 2000);

    // ── Detect if we need to click "Apply" button first ──
    const applyBtn = await page.$('#apply_button, a[href*="#app"], button:has-text("Apply"), a:has-text("Apply for this job")');
    if (applyBtn) {
      log('Clicking Apply button');
      await applyBtn.click();
      await randomDelay(1500, 3000);
      await page.waitForSelector('#application_form, form[id*="application"], #s2_app', { timeout: 15000 }).catch(() => {});
    }

    // ── Detect form type (React vs Legacy) ──
    const isReact = await page.$('[data-reactroot], [id="react-app"], #__next') !== null;
    log('Form type detected', { isReact });

    // ── Fill standard fields ──

    // First name / Last name (split from profile.name)
    const nameParts = (profile.name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    await tryFill(page, '#first_name, input[name="first_name"], input[name*="first_name"], input[autocomplete="given-name"]', firstName, log);
    await tryFill(page, '#last_name, input[name="last_name"], input[name*="last_name"], input[autocomplete="family-name"]', lastName, log);

    // Email
    await tryFill(page, '#email, input[name="email"], input[type="email"], input[autocomplete="email"]', profile.email, log);

    // Phone
    if (profile.phone) {
      await tryFill(page, '#phone, input[name="phone"], input[type="tel"], input[autocomplete="tel"]', profile.phone, log);
    }

    // LinkedIn
    if (profile.linkedin) {
      await tryFill(page, 'input[name*="linkedin"], input[name*="LinkedIn"], input[placeholder*="linkedin"], input[id*="linkedin"]', profile.linkedin, log);
    }

    // ── Resume upload ──
    if (resumePath) {
      log('Uploading resume');
      const fileInput = await page.$('input[type="file"][name*="resume"], input[type="file"][id*="resume"], input[type="file"]:first-of-type');
      if (fileInput) {
        await fileInput.setInputFiles(resumePath);
        await randomDelay(1000, 2000);
        log('Resume uploaded');
      } else {
        // Try drag-drop zone
        const dropZone = await page.$('.drop-zone, [data-dropzone], .resume-upload, .file-upload');
        if (dropZone) {
          const input = await page.$('input[type="file"]');
          if (input) {
            await input.setInputFiles(resumePath);
            await randomDelay(1000, 2000);
          }
        }
        warn('Could not find resume file input');
      }
    }

    // ── Answer common custom questions ──
    await answerCommonQuestions(page, profile, log);

    // ── Scroll to bottom to reveal submit button ──
    await humanScroll(page, 500);
    await randomDelay(500, 1000);

    // ── Find and click submit ──
    const submitBtn = await page.$('input[type="submit"], button[type="submit"], #submit_app, button:has-text("Submit Application"), button:has-text("Submit"), input[value="Submit Application"]');

    if (!submitBtn) {
      warn('Submit button not found');
      const state = await capturePageState(page);
      if (sb) await captureFailureScreenshot(page, sb, userId, jobId, 'gh-no-submit');
      return { status: 'error', error: 'no_submit_button', detail: `Submit button not found. Page: ${state.title}` };
    }

    log('Clicking submit');
    await submitBtn.click();
    await randomDelay(2000, 4000);

    // ── Detect success or error ──
    const result = await detectOutcome(page, log);

    if (result.status !== 'submitted' && sb) {
      await captureFailureScreenshot(page, sb, userId, jobId, 'gh-fail');
    }

    return result;

  } catch (err) {
    warn('Handler error', { error: err.message });
    if (sb) await captureFailureScreenshot(page, sb, userId, jobId, 'gh-crash');
    return { status: 'error', error: 'handler_error', detail: err.message };
  }
}

/**
 * Try to fill a field — silent failure if field not found.
 */
async function tryFill(page, selectors, value, log) {
  if (!value) return;
  const selectorList = selectors.split(',').map(s => s.trim());
  for (const sel of selectorList) {
    try {
      const el = await page.$(sel);
      if (el) {
        await humanType(page, sel, value);
        log('Filled field', { selector: sel });
        return;
      }
    } catch { /* next selector */ }
  }
}

/**
 * Answer common Greenhouse custom questions.
 * Work authorization, sponsorship, start date, salary, etc.
 */
async function answerCommonQuestions(page, profile, log) {
  // Work authorization
  const authSelectors = [
    'select[name*="authorized"], select[id*="authorized"]',
    'select[name*="work_auth"], select[id*="work_auth"]',
    'select[name*="legally"]',
  ];
  for (const sel of authSelectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        const authVal = profile.workAuth ? 'Yes' : 'No';
        await humanSelect(page, sel, authVal);
        log('Answered work authorization', { value: authVal });
        break;
      }
    } catch { /* next */ }
  }

  // Sponsorship
  const sponsorSelectors = [
    'select[name*="sponsor"], select[id*="sponsor"]',
    'select[name*="visa"], select[id*="visa"]',
  ];
  for (const sel of sponsorSelectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        const sponsorVal = profile.needsSponsorship ? 'Yes' : 'No';
        await humanSelect(page, sel, sponsorVal);
        log('Answered sponsorship', { value: sponsorVal });
        break;
      }
    } catch { /* next */ }
  }

  // Radio buttons for yes/no questions
  const radioGroups = await page.$$('fieldset, .field, [data-field]');
  for (const group of radioGroups) {
    try {
      const labelText = await group.evaluate(el => el.textContent?.toLowerCase() || '');
      if (labelText.includes('authorized to work') || labelText.includes('legally authorized')) {
        const yesRadio = await group.$('input[type="radio"][value*="yes" i], input[type="radio"][value="1"], label:has-text("Yes") input[type="radio"]');
        const noRadio = await group.$('input[type="radio"][value*="no" i], input[type="radio"][value="0"], label:has-text("No") input[type="radio"]');
        const target = profile.workAuth ? yesRadio : noRadio;
        if (target) {
          await target.click();
          await randomDelay(200, 400);
          log('Clicked work auth radio');
        }
      }
      if (labelText.includes('sponsor') || labelText.includes('visa')) {
        const yesRadio = await group.$('input[type="radio"][value*="yes" i], label:has-text("Yes") input[type="radio"]');
        const noRadio = await group.$('input[type="radio"][value*="no" i], label:has-text("No") input[type="radio"]');
        const target = profile.needsSponsorship ? yesRadio : noRadio;
        if (target) {
          await target.click();
          await randomDelay(200, 400);
          log('Clicked sponsorship radio');
        }
      }
    } catch { /* skip group */ }
  }
}

/**
 * Detect submission outcome (success, error, or CAPTCHA).
 */
async function detectOutcome(page, log) {
  // Wait for page to settle
  await randomDelay(1000, 2000);

  // Check for success indicators
  const successIndicators = [
    '.flash-success', '#flash_success',
    'text="Application submitted"', 'text="Thank you"', 'text="Your application has been"',
    'h1:has-text("Thanks")', 'h1:has-text("Thank you")', '.thank-you',
    'text="successfully submitted"',
  ];

  for (const sel of successIndicators) {
    try {
      const el = sel.startsWith('text=')
        ? await page.getByText(sel.replace('text=', '').replace(/"/g, '')).first()
        : await page.$(sel);
      if (el) {
        log('Success detected', { indicator: sel });
        return { status: 'submitted', confirmationId: `gh-${Date.now()}` };
      }
    } catch { /* next */ }
  }

  // Check for CAPTCHA
  const captcha = await page.$('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .g-recaptcha, .h-captcha, #captcha');
  if (captcha) {
    log('CAPTCHA detected');
    return { status: 'error', error: 'captcha_detected', detail: 'CAPTCHA challenge appeared — needs manual submission' };
  }

  // Check for validation errors
  const errorEl = await page.$('.error, .field-error, .flash-error, [data-error], .invalid-feedback');
  if (errorEl) {
    const errorText = await errorEl.evaluate(el => el.textContent?.trim()?.substring(0, 200) || 'Unknown validation error');
    log('Validation error detected', { error: errorText });
    return { status: 'rejected', error: 'validation_error', detail: errorText };
  }

  // Check URL change (some Greenhouse apps redirect on success)
  const currentUrl = page.url();
  if (currentUrl.includes('/thank') || currentUrl.includes('/confirmation') || currentUrl.includes('/success')) {
    log('Success detected via URL redirect', { url: currentUrl });
    return { status: 'submitted', confirmationId: `gh-redirect-${Date.now()}` };
  }

  // Ambiguous — page may still be loading or form may have silent error
  log('Outcome ambiguous — no clear success or error indicators');
  return { status: 'error', error: 'outcome_unclear', detail: 'No success or error indicators detected after submission' };
}
