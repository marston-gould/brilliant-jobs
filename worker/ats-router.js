// worker/ats-router.js
// Detects ATS platform from job URL and dispatches to correct headless handler
// AS-1 + AS-3

import { fillGreenhouse } from './handlers/greenhouse.js';
import { fillLever } from './handlers/lever.js';
import { fillWorkable } from './handlers/workable.js';
import { fillAshby } from './handlers/ashby.js';
import { fillGeneric } from './handlers/generic.js';

/**
 * ATS platform detection rules.
 * Order matters — first match wins.
 */
const ATS_PATTERNS = [
  { name: 'greenhouse',  pattern: /boards\.greenhouse\.io|job-boards\.greenhouse\.io|job-boards\.eu\.greenhouse\.io/i, handler: fillGreenhouse },
  { name: 'lever',       pattern: /jobs\.lever\.co/i,                  handler: fillLever },
  { name: 'workable',    pattern: /apply\.workable\.com/i,             handler: fillWorkable },
  { name: 'ashby',       pattern: /jobs\.ashbyhq\.com/i,               handler: fillAshby },
  { name: 'recruitee',   pattern: /\.recruitee\.com/i,                 handler: null }, // API-only, no browser needed
  { name: 'workday',     pattern: /\.myworkdayjobs\.com/i,             handler: null }, // Phase 2: complex auth
  { name: 'indeed',      pattern: /indeed\.com/i,                      handler: null }, // Phase 2: anti-bot
  { name: 'linkedin',    pattern: /linkedin\.com/i,                    handler: null }, // Phase 2: auth required
  { name: 'taleo',       pattern: /taleo\.(net|com)/i,                 handler: null }, // Phase 2: Oracle legacy
  { name: 'icims',       pattern: /icims\.com/i,                       handler: null }, // Phase 2
  { name: 'smartrecruiters', pattern: /smartrecruiters\.com/i,          handler: null }, // Phase 2
];

/**
 * Detect ATS platform from a job URL.
 * @param {string} url
 * @returns {{ name: string, handler: Function|null } | null}
 */
export function detectAts(url) {
  for (const ats of ATS_PATTERNS) {
    if (ats.pattern.test(url)) {
      return { name: ats.name, handler: ats.handler };
    }
  }
  return { name: 'generic', handler: fillGeneric };
}

/**
 * Route a submission to the correct handler.
 * @param {import('playwright').Page} page — fresh browser page
 * @param {string} jobUrl — ATS application page URL
 * @param {object} profile — applicant profile (name, email, phone, linkedin, etc.)
 * @param {string} resumePath — local filesystem path to downloaded resume file
 * @param {object} opts — { logger, sb, userId, jobId }
 * @returns {Promise<{ status: string, error?: string, detail?: string, confirmationId?: string }>}
 */
export async function routeSubmission(page, jobUrl, profile, resumePath, opts = {}) {
  const { logger } = opts;
  const ats = detectAts(jobUrl);

  if (!ats) {
    return { status: 'error', error: 'unknown_ats', detail: `Could not detect ATS from URL: ${jobUrl}` };
  }

  if (!ats.handler) {
    return { status: 'no_api_support', error: 'no_headless_handler', detail: `ATS '${ats.name}' does not have a headless handler yet (Phase 2)` };
  }

  if (logger) logger.info(`[Router] Detected ATS: ${ats.name}, dispatching handler`, { url: jobUrl });

  try {
    const result = await ats.handler(page, jobUrl, profile, resumePath, opts);
    return { ...result, ats_name: ats.name };
  } catch (err) {
    if (logger) logger.error(`[Router] Handler crashed: ${ats.name}`, { error: err.message, url: jobUrl });
    return {
      status: 'error',
      error: 'handler_crash',
      detail: `${ats.name} handler threw: ${err.message}`,
    };
  }
}

/**
 * Get list of supported ATS platforms with handler status.
 */
export function getSupportedAts() {
  return ATS_PATTERNS.map(a => ({
    name: a.name,
    hasHandler: !!a.handler,
  }));
}
