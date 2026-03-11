// worker/handlers/generic.js
// Generic fallback handler for unknown ATS platforms
// Uses heuristic field detection to fill common form patterns
// AS-1

import { humanType, humanScroll, randomDelay } from '../utils/human-sim.js';
import { captureFailureScreenshot } from '../utils/screenshot.js';

/**
 * Generic form filler — attempts heuristic field detection.
 * This is the last-resort handler when no specific ATS is detected.
 */
export async function fillGeneric(page, jobUrl, profile, resumePath, opts = {}) {
  const { logger, sb, userId, jobId } = opts;
  const log = (msg, data) => logger?.info(`[Generic] ${msg}`, data);
  const warn = (msg, data) => logger?.warn(`[Generic] ${msg}`, data);

  try {
    log('Navigating', { url: jobUrl });
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(1000, 2000);

    // Look for Apply button
    const applyBtn = await page.$('a:has-text("Apply"), button:has-text("Apply"), a[href*="apply"]');
    if (applyBtn) {
      await applyBtn.click();
      await randomDelay(1500, 3000);
    }

    // Fill fields by label/placeholder/name heuristics
    const nameParts = (profile.name || '').trim().split(/\s+/);

    // Name fields
    await heuristicFill(page, ['first.?name', 'given.?name', 'fname'], nameParts[0] || '', log);
    await heuristicFill(page, ['last.?name', 'family.?name', 'lname', 'surname'], nameParts.slice(1).join(' ') || '', log);

    // If no first/last split, try full name
    await heuristicFill(page, ['full.?name', '^name$'], profile.name, log);

    // Email
    await heuristicFill(page, ['email'], profile.email, log);

    // Phone
    if (profile.phone) {
      await heuristicFill(page, ['phone', 'tel', 'mobile'], profile.phone, log);
    }

    // LinkedIn
    if (profile.linkedin) {
      await heuristicFill(page, ['linkedin'], profile.linkedin, log);
    }

    // AF-001: EEOC/OFCCP voluntary self-identification (heuristic select matching)
    const eeoFields = [
      { patterns: ['gender', 'sex'], value: profile.gender },
      { patterns: ['race', 'ethnic'], value: profile.ethnicity },
      { patterns: ['veteran', 'military'], value: profile.veteranStatus },
      { patterns: ['disabilit'], value: profile.disabilityStatus },
    ];
    for (const eeo of eeoFields) {
      if (!eeo.value) continue;
      try {
        const allSelects = await page.$$('select');
        for (const sel of allSelects) {
          const context = await sel.evaluate(el => {
            const parent = el.closest('.field, .question, fieldset, .form-group, label');
            return (parent ? parent.textContent : el.getAttribute('name') || el.getAttribute('aria-label') || '').toLowerCase();
          });
          if (eeo.patterns.some(p => context.includes(p))) {
            await humanSelect(page, sel, eeo.value);
            log(`Answered EEO ${eeo.patterns[0]}`, { value: eeo.value });
            break;
          }
        }
      } catch { /* skip */ }
    }

    // Resume
    if (resumePath) {
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        await fileInput.setInputFiles(resumePath);
        await randomDelay(1000, 2000);
        log('Resume uploaded via generic file input');
      }
    }

    // Submit
    await humanScroll(page, 400);
    const submitBtn = await page.$('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Apply")');
    if (!submitBtn) {
      if (sb) await captureFailureScreenshot(page, sb, userId, jobId, 'generic-no-submit');
      return { status: 'error', error: 'no_submit_button', detail: 'Generic handler could not find submit button' };
    }

    await submitBtn.click();
    await randomDelay(2000, 4000);

    // Basic outcome detection
    const url = page.url();
    if (url.includes('thank') || url.includes('success') || url.includes('confirm')) {
      return { status: 'submitted', confirmationId: `generic-${Date.now()}` };
    }

    const success = await page.$('text="Thank you", text="Application submitted", text="submitted"');
    if (success) { return { status: 'submitted', confirmationId: `generic-${Date.now()}` }; }

    const error = await page.$('.error, [role="alert"]');
    if (error) {
      const txt = await error.evaluate(el => el.textContent?.trim()?.substring(0, 200) || 'Error');
      return { status: 'rejected', error: 'validation_error', detail: txt };
    }

    return { status: 'error', error: 'outcome_unclear', detail: 'Generic handler: no clear outcome' };

  } catch (err) {
    warn('Handler error', { error: err.message });
    if (sb) await captureFailureScreenshot(page, sb, userId, jobId, 'generic-crash');
    return { status: 'error', error: 'handler_error', detail: err.message };
  }
}

/**
 * Heuristic field fill — searches inputs by name/placeholder/label patterns.
 */
async function heuristicFill(page, patterns, value, log) {
  if (!value) return;

  for (const pat of patterns) {
    const regex = new RegExp(pat, 'i');
    try {
      // Search by name attribute
      const inputs = await page.$$('input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]), textarea');
      for (const input of inputs) {
        const attrs = await input.evaluate(el => ({
          name: el.name || '',
          placeholder: el.placeholder || '',
          id: el.id || '',
          ariaLabel: el.getAttribute('aria-label') || '',
        }));

        if (regex.test(attrs.name) || regex.test(attrs.placeholder) || regex.test(attrs.id) || regex.test(attrs.ariaLabel)) {
          const currentVal = await input.evaluate(el => el.value);
          if (!currentVal) { // Don't overwrite existing values
            const sel = attrs.id ? `#${attrs.id}` : attrs.name ? `input[name="${attrs.name}"]` : null;
            if (sel) {
              await humanType(page, sel, value);
              log('Heuristic fill', { pattern: pat, selector: sel });
              return;
            }
          }
        }
      }
    } catch { /* next pattern */ }
  }
}
