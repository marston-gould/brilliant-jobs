// worker/handlers/workable.js
// Headless browser handler for Workable application forms
// Covers: apply.workable.com/*
// AS-3: 28% of jobs (~124K)

import { humanType, humanClick, humanSelect, humanScroll, randomDelay } from '../utils/human-sim.js';
import { captureFailureScreenshot } from '../utils/screenshot.js';
import { fillEeoQuestions } from '../utils/eeoc-filler.js';

/**
 * Fill and submit a Workable application form.
 * Workable forms: name, email, phone, resume, cover letter, custom questions.
 * Form fields use data-ui attributes for reliable selection.
 */
export async function fillWorkable(page, jobUrl, profile, resumePath, opts = {}) {
  const { logger, sb, userId, jobId } = opts;
  const log = (msg, data) => logger?.info(`[Workable] ${msg}`, data);
  const warn = (msg, data) => logger?.warn(`[Workable] ${msg}`, data);

  try {
    log('Navigating', { url: jobUrl });
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(1000, 2000);

    // Workable sometimes shows job description first — click Apply
    const applyBtn = await page.$('a[data-ui="overview-apply-btn"], button:has-text("Apply for this job"), a:has-text("Apply now")');
    if (applyBtn) {
      log('Clicking Apply button');
      await applyBtn.click();
      await randomDelay(1500, 3000);
    }

    // Wait for form
    await page.waitForSelector('form, [data-ui="application-form"]', { timeout: 15000 }).catch(() => {});

    // ── Pre-flight: verify form + submit button exist before filling ──
    const preflightSubmit = await page.$('[data-ui="submit-application"], button[type="submit"], button:has-text("Submit"), input[type="submit"]');
    const formCheck = await page.$('form, [data-ui="application-form"]');
    if (!formCheck && !preflightSubmit) {
      warn('Pre-flight failed: no form or submit button found — aborting before fill');
      const state = await capturePageState(page);
      if (sb) await captureFailureScreenshot(page, sb, userId, jobId, 'workable-preflight-fail');
      return { status: 'error', error: 'no_application_form', detail: `No application form found on Workable. Page: ${state.title}` };
    }

    // ── Fill fields ──
    // Workable uses data-ui="firstname", data-ui="lastname", etc.
    const nameParts = (profile.name || '').trim().split(/\s+/);
    await tryFill(page, '[data-ui="firstname"] input, input[name="firstname"], input[name="first_name"]', nameParts[0] || '', log);
    await tryFill(page, '[data-ui="lastname"] input, input[name="lastname"], input[name="last_name"]', nameParts.slice(1).join(' ') || '', log);
    await tryFill(page, '[data-ui="email"] input, input[name="email"], input[type="email"]', profile.email, log);

    if (profile.phone) {
      await tryFill(page, '[data-ui="phone"] input, input[name="phone"], input[type="tel"]', profile.phone, log);
    }

    // Resume
    if (resumePath) {
      log('Uploading resume');
      const fileInput = await page.$('[data-ui="resume"] input[type="file"], input[type="file"][accept*="pdf"], input[type="file"]');
      if (fileInput) {
        await fileInput.setInputFiles(resumePath);
        await randomDelay(1500, 3000);
        log('Resume uploaded');
      } else {
        warn('Resume file input not found');
      }
    }

    // LinkedIn
    if (profile.linkedin) {
      await tryFill(page, '[data-ui="linkedin"] input, input[name*="linkedin"]', profile.linkedin, log);
    }

    // Common custom questions
    await answerWorkableQuestions(page, profile, log, opts);

    // ── Submit ──
    await humanScroll(page, 400);
    await randomDelay(500, 1000);

    const submitBtn = await page.$('[data-ui="submit-application"], button[type="submit"], button:has-text("Submit"), input[type="submit"]');
    if (!submitBtn) {
      warn('Submit button not found');
      if (sb) await captureFailureScreenshot(page, sb, userId, jobId, 'workable-no-submit');
      return { status: 'error', error: 'no_submit_button', detail: 'Submit not found on Workable form' };
    }

    log('Clicking submit');
    await submitBtn.click();
    await randomDelay(2000, 4000);

    // ── Outcome ──
    return await detectWorkableOutcome(page, log, sb, userId, jobId);

  } catch (err) {
    warn('Handler error', { error: err.message });
    if (sb) await captureFailureScreenshot(page, sb, userId, jobId, 'workable-crash');
    return { status: 'error', error: 'handler_error', detail: err.message };
  }
}

async function tryFill(page, selectors, value, log) {
  if (!value) return;
  for (const sel of selectors.split(',').map(s => s.trim())) {
    try {
      const el = await page.$(sel);
      if (el) { await humanType(page, sel, value); log('Filled', { sel }); return; }
    } catch { /* next */ }
  }
}

async function answerWorkableQuestions(page, profile, log, opts = {}) {
  const questions = await page.$$('[data-ui="custom-field"], .custom-field, .form-group');
  for (const q of questions) {
    try {
      const labelText = await q.evaluate(el => el.querySelector('label')?.textContent?.toLowerCase()?.trim() || '');
      if (labelText.includes('authorized') || labelText.includes('legally')) {
        const sel = await q.$('select');
        if (sel) { await humanSelect(page, 'select', profile.workAuth ? 'Yes' : 'No'); log('Work auth answered'); }
      }
      if (labelText.includes('sponsor') || labelText.includes('visa')) {
        const sel = await q.$('select');
        if (sel) { await humanSelect(page, 'select', profile.needsSponsorship ? 'Yes' : 'No'); log('Sponsorship answered'); }
      }
    } catch { /* skip */ }
  }

  // AF-005: EEOC/OFCCP auto-fill via shared eeoc-filler utility
  await fillEeoQuestions(page, profile, log, opts?.capturePostHog);
}

async function detectWorkableOutcome(page, log, sb, userId, jobId) {
  await randomDelay(1000, 2000);

  const url = page.url();
  if (url.includes('/thank') || url.includes('/success') || url.includes('/confirmation')) {
    log('Success via redirect');
    return { status: 'submitted', confirmationId: `workable-${Date.now()}` };
  }

  const success = await page.$('[data-ui="application-success"], text="Thank you", text="Application submitted", text="submitted successfully"');
  if (success) {
    log('Success via text');
    return { status: 'submitted', confirmationId: `workable-${Date.now()}` };
  }

  const error = await page.$('.error, [data-ui="error"], .validation-error, [role="alert"]');
  if (error) {
    const txt = await error.evaluate(el => el.textContent?.trim()?.substring(0, 200) || 'Validation error');
    log('Error', { error: txt });
    if (sb) await captureFailureScreenshot(page, sb, userId, jobId, 'workable-error');
    return { status: 'rejected', error: 'validation_error', detail: txt };
  }

  const captcha = await page.$('iframe[src*="recaptcha"], .g-recaptcha');
  if (captcha) { return { status: 'error', error: 'captcha_detected', detail: 'CAPTCHA on Workable' }; }

  return { status: 'error', error: 'outcome_unclear', detail: 'No clear outcome on Workable form' };
}
