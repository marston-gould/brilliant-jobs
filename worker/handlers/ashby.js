// worker/handlers/ashby.js
// Headless browser handler for Ashby application forms
// Covers: jobs.ashbyhq.com/*
// AS-3: 8% of jobs (~34K)

import { humanType, humanSelect, humanScroll, randomDelay } from '../utils/human-sim.js';
import { captureFailureScreenshot } from '../utils/screenshot.js';

/**
 * Fill and submit an Ashby application form.
 * Ashby is React-based — forms render dynamically, fields have name attributes.
 */
export async function fillAshby(page, jobUrl, profile, resumePath, opts = {}) {
  const { logger, sb, userId, jobId } = opts;
  const log = (msg, data) => logger?.info(`[Ashby] ${msg}`, data);
  const warn = (msg, data) => logger?.warn(`[Ashby] ${msg}`, data);

  try {
    log('Navigating', { url: jobUrl });
    await page.goto(jobUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await randomDelay(1000, 2500);

    // Ashby: click Apply button to open form
    const applyBtn = await page.$('button:has-text("Apply"), a:has-text("Apply for this job"), [data-testid="apply-button"]');
    if (applyBtn) {
      log('Clicking Apply');
      await applyBtn.click();
      await randomDelay(1500, 3000);
    }

    // Wait for form to render (React)
    await page.waitForSelector('form, [role="form"], input[name="_systemfield_name"]', { timeout: 15000 }).catch(() => {});

    // ── Fill fields ──
    // Ashby uses _systemfield_ prefix for standard fields
    await tryFill(page, 'input[name="_systemfield_name"], input[name="name"], input[placeholder*="Full name"]', profile.name, log);
    await tryFill(page, 'input[name="_systemfield_email"], input[name="email"], input[type="email"]', profile.email, log);

    if (profile.phone) {
      await tryFill(page, 'input[name="_systemfield_phone"], input[name="phone"], input[type="tel"]', profile.phone, log);
    }

    if (profile.linkedin) {
      await tryFill(page, 'input[name*="linkedin" i], input[placeholder*="LinkedIn"]', profile.linkedin, log);
    }

    // Resume
    if (resumePath) {
      log('Uploading resume');
      const fileInput = await page.$('input[type="file"][name="_systemfield_resume"], input[type="file"]');
      if (fileInput) {
        await fileInput.setInputFiles(resumePath);
        await randomDelay(1500, 3000);
        log('Resume uploaded');
      } else {
        warn('Resume input not found');
      }
    }

    // Custom questions
    await answerAshbyQuestions(page, profile, log);

    // ── Submit ──
    await humanScroll(page, 400);
    await randomDelay(500, 1000);

    const submitBtn = await page.$('button[type="submit"], button:has-text("Submit"), button:has-text("Submit Application")');
    if (!submitBtn) {
      warn('Submit not found');
      if (sb) await captureFailureScreenshot(page, sb, userId, jobId, 'ashby-no-submit');
      return { status: 'error', error: 'no_submit_button', detail: 'Submit not found on Ashby' };
    }

    log('Clicking submit');
    await submitBtn.click();
    await randomDelay(2000, 4000);

    return await detectAshbyOutcome(page, log, sb, userId, jobId);

  } catch (err) {
    warn('Handler error', { error: err.message });
    if (sb) await captureFailureScreenshot(page, sb, userId, jobId, 'ashby-crash');
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

async function answerAshbyQuestions(page, profile, log) {
  // Ashby custom fields use _customfield_ prefix
  const customFields = await page.$$('[class*="custom-field"], [data-field-type], .ashby-application-form-field');
  for (const field of customFields) {
    try {
      const label = await field.evaluate(el => el.querySelector('label')?.textContent?.toLowerCase()?.trim() || '');
      if (label.includes('authorized') || label.includes('legally')) {
        const select = await field.$('select');
        if (select) { await humanSelect(page, 'select', profile.workAuth ? 'Yes' : 'No'); log('Work auth'); }
      }
      if (label.includes('sponsor') || label.includes('visa')) {
        const select = await field.$('select');
        if (select) { await humanSelect(page, 'select', profile.needsSponsorship ? 'Yes' : 'No'); log('Sponsorship'); }
      }
    } catch { /* skip */ }
  }
}

async function detectAshbyOutcome(page, log, sb, userId, jobId) {
  await randomDelay(1000, 2000);

  const url = page.url();
  if (url.includes('/thank') || url.includes('/success') || url.includes('/confirmation')) {
    return { status: 'submitted', confirmationId: `ashby-${Date.now()}` };
  }

  const success = await page.$('text="Thank you", text="Application received", text="submitted", [data-testid="success"]');
  if (success) { return { status: 'submitted', confirmationId: `ashby-${Date.now()}` }; }

  const error = await page.$('.error, [role="alert"], .validation-error');
  if (error) {
    const txt = await error.evaluate(el => el.textContent?.trim()?.substring(0, 200) || 'Error');
    if (sb) await captureFailureScreenshot(page, sb, userId, jobId, 'ashby-error');
    return { status: 'rejected', error: 'validation_error', detail: txt };
  }

  const captcha = await page.$('iframe[src*="recaptcha"], .g-recaptcha');
  if (captcha) { return { status: 'error', error: 'captcha_detected', detail: 'CAPTCHA on Ashby' }; }

  return { status: 'error', error: 'outcome_unclear', detail: 'No clear outcome on Ashby' };
}
