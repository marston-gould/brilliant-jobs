// worker/handlers/lever.js
// Headless browser handler for Lever application forms
// Covers: jobs.lever.co/*
// AS-3: 13% of jobs (~59K)

import { humanType, humanClick, humanSelect, humanFileUpload, humanScroll, randomDelay } from '../utils/human-sim.js';
import { captureFailureScreenshot, capturePageState } from '../utils/screenshot.js';
import { fillEeoQuestions } from '../utils/eeoc-filler.js';

/**
 * Fill and submit a Lever application form.
 * Lever forms are relatively simple: name, email, phone, resume, optional LinkedIn + custom questions.
 */
export async function fillLever(page, jobUrl, profile, resumePath, opts = {}) {
  const { logger, sb, userId, jobId } = opts;
  const log = (msg, data) => logger?.info(`[Lever] ${msg}`, data);
  const warn = (msg, data) => logger?.warn(`[Lever] ${msg}`, data);

  try {
    // ── Navigate — Lever apply URL pattern: jobs.lever.co/{company}/{jobId}/apply ──
    const applyUrl = jobUrl.includes('/apply') ? jobUrl : jobUrl.replace(/\/?$/, '/apply');
    log('Navigating to apply URL', { url: applyUrl });
    await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(1000, 2000);

    // ── Check if application form is present ──
    const form = await page.$('.application-form, form[action*="apply"], #application-form');
    if (!form) {
      // Maybe we're on the job description page — look for Apply button
      const applyBtn = await page.$('a.postings-btn[href*="apply"], a:has-text("Apply for this job"), button:has-text("Apply")');
      if (applyBtn) {
        log('Clicking Apply button');
        await applyBtn.click();
        await randomDelay(1500, 3000);
      }
    }

    // ── Pre-flight: verify submit button exists before filling ──
    const preflightSubmit = await page.$('button[type="submit"], button:has-text("Submit application"), button:has-text("Submit"), input[type="submit"]');
    const formCheck = await page.$('.application-form, form[action*="apply"], #application-form, form');
    if (!formCheck && !preflightSubmit) {
      warn('Pre-flight failed: no form or submit button found — aborting before fill');
      const state = await capturePageState(page);
      if (sb) await captureFailureScreenshot(page, sb, userId, jobId, 'lever-preflight-fail');
      return { status: 'error', error: 'no_application_form', detail: `No application form found. Page: ${state.title}` };
    }

    // ── Fill standard fields ──
    // Lever uses name="name" for full name (single field)
    await tryFill(page, 'input[name="name"], #resume-name, input[placeholder*="Full name"]', profile.name, log);
    await tryFill(page, 'input[name="email"], input[type="email"], #resume-email', profile.email, log);

    if (profile.phone) {
      await tryFill(page, 'input[name="phone"], input[type="tel"], #resume-phone', profile.phone, log);
    }

    // LinkedIn / website
    if (profile.linkedin) {
      await tryFill(page, 'input[name*="linkedin"], input[name="urls[LinkedIn]"], input[placeholder*="LinkedIn"]', profile.linkedin, log);
    }

    // ── Resume upload ──
    if (resumePath) {
      log('Uploading resume');
      const fileInput = await page.$('input[type="file"][name="resume"], input[type="file"]');
      if (fileInput) {
        await fileInput.setInputFiles(resumePath);
        await randomDelay(1500, 3000);
        // Wait for upload confirmation
        await page.waitForSelector('.resume-uploaded, .file-name, .upload-success', { timeout: 10000 }).catch(() => {});
        log('Resume uploaded');
      } else {
        warn('Resume file input not found');
      }
    }

    // ── Custom questions (text inputs, textareas, selects) ──
    await answerLeverQuestions(page, profile, log, opts);

    // ── Submit ──
    await humanScroll(page, 400);
    await randomDelay(500, 1000);

    const submitBtn = await page.$('button[type="submit"], button:has-text("Submit application"), button:has-text("Submit"), input[type="submit"]');
    if (!submitBtn) {
      warn('Submit button not found');
      if (sb) await captureFailureScreenshot(page, sb, userId, jobId, 'lever-no-submit');
      return { status: 'error', error: 'no_submit_button', detail: 'Submit button not found on Lever form' };
    }

    log('Clicking submit');
    await submitBtn.click();
    await randomDelay(2000, 4000);

    // ── Detect outcome ──
    return await detectLeverOutcome(page, log, sb, userId, jobId);

  } catch (err) {
    warn('Handler error', { error: err.message });
    if (sb) await captureFailureScreenshot(page, sb, userId, jobId, 'lever-crash');
    return { status: 'error', error: 'handler_error', detail: err.message };
  }
}

async function tryFill(page, selectors, value, log) {
  if (!value) return;
  for (const sel of selectors.split(',').map(s => s.trim())) {
    try {
      const el = await page.$(sel);
      if (el) {
        await humanType(page, sel, value);
        log('Filled field', { selector: sel });
        return;
      }
    } catch { /* next */ }
  }
}

async function answerLeverQuestions(page, profile, log, opts = {}) {
  // Lever custom questions are typically in .custom-questions or individual .application-question divs
  const questions = await page.$$('.application-question, .custom-question, .additional-field');

  for (const q of questions) {
    try {
      const labelText = await q.evaluate(el => {
        const label = el.querySelector('label, .question-label, .field-label');
        return label?.textContent?.toLowerCase()?.trim() || '';
      });

      // Work authorization
      if (labelText.includes('authorized') || labelText.includes('legally eligible')) {
        const select = await q.$('select');
        if (select) {
          await humanSelect(page, 'select', profile.workAuth ? 'Yes' : 'No');
          log('Answered work auth');
          continue;
        }
      }

      // Sponsorship
      if (labelText.includes('sponsor') || labelText.includes('visa')) {
        const select = await q.$('select');
        if (select) {
          await humanSelect(page, 'select', profile.needsSponsorship ? 'Yes' : 'No');
          log('Answered sponsorship');
          continue;
        }
      }

      // Location / city
      if (labelText.includes('location') || labelText.includes('city') || labelText.includes('where are you based')) {
        const input = await q.$('input[type="text"], textarea');
        if (input && profile.location) {
          const sel = await input.evaluate(el => {
            const id = el.id ? `#${el.id}` : null;
            const name = el.name ? `input[name="${el.name}"]` : null;
            return id || name || 'input[type="text"]';
          });
          await humanType(page, sel, profile.location);
          log('Answered location');
        }
      }

      // AF-005: EEOC/OFCCP auto-fill via shared eeoc-filler utility
      // (handled after per-question loop via post-pass below)
    } catch { /* skip question */ }
  }

  // AF-005: run shared EEOC filler as a post-pass over the full page
  await fillEeoQuestions(page, profile, log, opts?.capturePostHog);

  // AIS-F8-S2: Cover letter auto-attach
  const clEl = await page.$('textarea[name*="cover"], textarea[id*="cover"], textarea[placeholder*="cover"]');
  if (clEl) {
    if (opts?.capturePostHog) opts.capturePostHog('cover_letter_field_detected', { ats_type: 'lever', field_type: 'text' });
    if (opts?.coverLetter) {
      const sel = await clEl.evaluate(e => e.id ? '#'+e.id : 'textarea');
      await humanType(page, sel, opts.coverLetter);
      log('Cover letter filled (lever)');
      if (opts?.capturePostHog) opts.capturePostHog('cover_letter_attached', { ats_type: 'lever', method: 'headless' });
    } else {
      if (opts?.capturePostHog) opts.capturePostHog('cover_letter_field_skipped', { ats_type: 'lever', reason: 'no_letter_available' });
    }
  }
}

async function detectLeverOutcome(page, log, sb, userId, jobId) {
  await randomDelay(1000, 2000);

  // Lever success: URL changes to /thanks or page shows confirmation
  const url = page.url();
  if (url.includes('/thanks') || url.includes('/thank-you') || url.includes('/confirmation')) {
    log('Success detected via URL redirect');
    return { status: 'submitted', confirmationId: `lever-${Date.now()}` };
  }

  // Check for success text
  const successEl = await page.$('text="Thank you", text="Application submitted", text="Thanks for applying", .application-confirmation');
  if (successEl) {
    log('Success detected via text');
    return { status: 'submitted', confirmationId: `lever-${Date.now()}` };
  }

  // Check for errors
  const errorEl = await page.$('.error, .form-error, .validation-error, [role="alert"]');
  if (errorEl) {
    const errorText = await errorEl.evaluate(el => el.textContent?.trim()?.substring(0, 200) || 'Validation error');
    log('Error detected', { error: errorText });
    if (sb) await captureFailureScreenshot(page, sb, userId, jobId, 'lever-error');
    return { status: 'rejected', error: 'validation_error', detail: errorText };
  }

  // CAPTCHA
  const captcha = await page.$('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .g-recaptcha');
  if (captcha) {
    log('CAPTCHA detected');
    return { status: 'error', error: 'captcha_detected', detail: 'CAPTCHA on Lever form' };
  }

  log('Outcome ambiguous');
  return { status: 'error', error: 'outcome_unclear', detail: 'No clear success/error on Lever form' };
}
