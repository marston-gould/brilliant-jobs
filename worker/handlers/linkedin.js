// worker/handlers/linkedin.js
// AIS-F10-S1: LinkedIn Easy Apply Hardening
// AIS-F10-S2: Multi-Step + Profile Sync + Connection Awareness
//
// Handles LinkedIn Easy Apply (1-6 pages) with anti-detection measures:
//   - Randomized interaction delays (scroll pauses, field focus, tab simulation)
//   - Viewport-aware clicks (never click outside visible area)
//   - Max 15 Easy Apply per day per account
//   - CAPTCHA/verification detection + pause + alert
//   - Multi-step form navigation (page 1-6 → Review → Submit)
//   - LinkedIn profile data pre-fill from linkedin_profiles table
//   - Connection awareness: surface connections at company before applying

import { fillEeoQuestions } from '../utils/eeoc-filler.js';

const LI_DAILY_LIMIT = 15;
const MIN_STEP_DELAY_MS = 2500;
const MAX_STEP_DELAY_MS = 6000;
const MIN_TYPE_DELAY_MS = 80;
const MAX_TYPE_DELAY_MS = 220;
const MAX_EASY_APPLY_STEPS = 8;

// ─── Randomized delay ────────────────────────────────────────────────────────
async function jitter(minMs = MIN_STEP_DELAY_MS, maxMs = MAX_STEP_DELAY_MS) {
  const ms = minMs + Math.floor(Math.random() * (maxMs - minMs));
  await new Promise(r => setTimeout(r, ms));
}

// ─── Human-sim type (char-by-char with random delays) ────────────────────────
async function humanTypeLinkedIn(page, selector, text) {
  await page.focus(selector);
  await jitter(300, 700);
  // Clear then type
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  for (const ch of text) {
    await page.keyboard.type(ch);
    await new Promise(r => setTimeout(r, MIN_TYPE_DELAY_MS + Math.floor(Math.random() * (MAX_TYPE_DELAY_MS - MIN_TYPE_DELAY_MS))));
  }
}

// ─── Viewport-aware click ────────────────────────────────────────────────────
async function safeClick(page, selector) {
  const el = await page.$(selector);
  if (!el) return false;
  const box = await el.boundingBox();
  if (!box) return false;
  const vp = page.viewport() || { width: 1280, height: 800 };
  // Ensure within viewport
  if (box.x < 0 || box.y < 0 || box.x + box.width > vp.width || box.y + box.height > vp.height) {
    await el.scrollIntoViewIfNeeded();
    await jitter(500, 1200);
  }
  await el.click();
  return true;
}

// ─── CAPTCHA detection ───────────────────────────────────────────────────────
async function detectCaptcha(page) {
  const captchaSelectors = [
    'iframe[src*="captcha"]', '[id*="captcha"]', '[class*="captcha"]',
    'iframe[src*="recaptcha"]', '.challenge-page', '[data-test="verify-dialog"]',
  ];
  for (const sel of captchaSelectors) {
    if (await page.$(sel)) return true;
  }
  // Check page title for verification challenges
  const title = await page.title().catch(() => '');
  return /security check|verify|captcha|challenge/i.test(title);
}

// ─── Check LinkedIn daily limit ──────────────────────────────────────────────
async function checkLinkedInDailyLimit(sb, userId) {
  const today = new Date().toISOString().slice(0, 10);
  const { count } = await sb.from('submission_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('ats_source', 'linkedin')
    .gte('created_at', today + 'T00:00:00Z')
    .eq('status', 'submitted');
  return { count: count || 0, allowed: (count || 0) < LI_DAILY_LIMIT };
}

// ─── Fill a single Easy Apply page ──────────────────────────────────────────
async function fillEasyApplyPage(page, profile, liProfile, log) {
  // Name fields
  const nameParts = (profile.name || '').trim().split(/\s+/);
  const firstNameSel = 'input[id*="firstName"], input[name*="first"], input[placeholder*="First"]';
  const lastNameSel = 'input[id*="lastName"], input[name*="last"], input[placeholder*="Last"]';
  if (await page.$(firstNameSel) && nameParts[0]) {
    await humanTypeLinkedIn(page, firstNameSel, nameParts[0]);
    await jitter(400, 900);
  }
  if (await page.$(lastNameSel) && nameParts.slice(1).join(' ')) {
    await humanTypeLinkedIn(page, lastNameSel, nameParts.slice(1).join(' '));
    await jitter(400, 900);
  }

  // Email
  const emailSel = 'input[type="email"], input[id*="email"], input[name*="email"]';
  if (await page.$(emailSel) && profile.email) {
    await humanTypeLinkedIn(page, emailSel, profile.email);
    await jitter(300, 700);
  }

  // Phone
  const phoneSel = 'input[id*="phone"], input[type="tel"]';
  if (await page.$(phoneSel) && profile.phone) {
    await humanTypeLinkedIn(page, phoneSel, profile.phone);
    await jitter(300, 700);
  }

  // AIS-F10-S2: LinkedIn-specific pre-fill from linkedin_profiles (headline, current company)
  if (liProfile) {
    const headlineSel = 'input[id*="headline"], input[name*="headline"]';
    if (await page.$(headlineSel) && liProfile.headline) {
      await humanTypeLinkedIn(page, headlineSel, liProfile.headline);
      await jitter(300, 700);
    }
    const companySel = 'input[id*="company"], input[name*="company"]';
    if (await page.$(companySel) && liProfile.experience_json) {
      try {
        const exp = typeof liProfile.experience_json === 'string' ? JSON.parse(liProfile.experience_json) : liProfile.experience_json;
        const currentCompany = Array.isArray(exp) && exp[0] ? (exp[0].company || '') : '';
        if (currentCompany) {
          await humanTypeLinkedIn(page, companySel, currentCompany);
          await jitter(300, 700);
        }
      } catch { /* non-fatal */ }
    }
  }

  // Work auth (most LinkedIn forms ask this)
  const workAuthSel = 'select[id*="authorization"], select[name*="authorization"]';
  const workAuthEl = await page.$(workAuthSel);
  if (workAuthEl && profile.workAuth !== false) {
    await page.select(workAuthSel, 'yes');
    await jitter(300, 600);
  }

  // Sponsorship
  const sponsorSel = 'select[id*="sponsorship"], select[name*="sponsorship"]';
  const sponsorEl = await page.$(sponsorSel);
  if (sponsorEl) {
    await page.select(sponsorSel, profile.needsSponsorship ? 'yes' : 'no');
    await jitter(300, 600);
  }

  // Resume upload
  const fileInput = await page.$('input[type="file"][name*="resume"], input[type="file"][id*="resume"]');
  if (fileInput && opts?.resumePath) {
    await fileInput.setInputFiles(opts.resumePath);
    await jitter(1000, 2000);
    log('Resume uploaded to LinkedIn EasyApply');
  }

  // EEOC questions
  await fillEeoQuestions(page, profile, log, opts?.capturePostHog).catch(() => {});

  // Cover letter
  if (opts?.coverLetter) {
    const clSel = 'textarea[id*="cover"], textarea[name*="cover"], textarea[placeholder*="cover letter"]';
    if (await page.$(clSel)) {
      await humanTypeLinkedIn(page, clSel, opts.coverLetter);
      await jitter(400, 800);
    }
  }

  // Simulate a brief scroll (human behavior)
  await page.evaluate(() => window.scrollBy(0, 200 + Math.floor(Math.random() * 300)));
  await jitter(600, 1200);
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function fillLinkedIn(page, jobUrl, profile, resumePath, opts = {}) {
  const { logger, sb, userId, jobId } = opts;
  const log = (msg, data) => logger?.info(`[linkedin] ${msg}`, data || {});

  try {
    // AIS-F10-S1: Check daily limit
    if (sb && userId) {
      const { allowed, count } = await checkLinkedInDailyLimit(sb, userId);
      if (!allowed) {
        return { status: 'error', error: 'linkedin_daily_limit', detail: `Max ${LI_DAILY_LIMIT} Easy Apply per day (used ${count})` };
      }
    }

    // AIS-F10-S2: Fetch LinkedIn profile for richer pre-fill
    let liProfile = null;
    if (sb && userId) {
      const { data: liRow } = await sb.from('linkedin_profiles')
        .select('display_name, headline, skills_array, experience_json')
        .eq('user_id', userId)
        .maybeSingle().catch(() => ({ data: null }));
      if (liRow) liProfile = liRow;
    }

    // AIS-F10-S2: Connection awareness — check for connections at company
    if (sb && userId && opts.companyName) {
      const { data: conns } = await sb.from('extension_network_data')
        .select('connection_name, connection_title')
        .eq('user_id', userId)
        .ilike('company_name', opts.companyName.slice(0, 30) + '%')
        .limit(3)
        .catch(() => ({ data: null }));
      if (conns && conns.length > 0) {
        log('Connection awareness: found ' + conns.length + ' connection(s) at ' + opts.companyName, { connections: conns });
        // Emit for dashboard notification
        opts.capturePostHog?.('linkedin_easy_apply_triggered', {
          job_id: jobId,
          connections_at_company: conns.length,
          connection_names: conns.map(c => c.connection_name).join(', '),
        });
      }
    }

    log('Starting LinkedIn Easy Apply', { url: jobUrl });

    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await jitter(1500, 3000);

    // Click Easy Apply button
    const easyApplyBtn = await page.$('button[aria-label*="Easy Apply"], button.jobs-apply-button');
    if (!easyApplyBtn) {
      return { status: 'error', error: 'no_easy_apply_button', detail: 'Easy Apply button not found on page' };
    }
    await safeClick(page, 'button[aria-label*="Easy Apply"], button.jobs-apply-button');
    await jitter(MIN_STEP_DELAY_MS, MAX_STEP_DELAY_MS);

    // Multi-step navigation loop (AIS-F10-S2)
    let stepCount = 0;
    let submitted = false;

    while (stepCount < MAX_EASY_APPLY_STEPS && !submitted) {
      stepCount++;

      // CAPTCHA check on each step
      if (await detectCaptcha(page)) {
        log('CAPTCHA detected on step ' + stepCount + ' — pausing');
        return { status: 'error', error: 'captcha_detected', detail: `CAPTCHA triggered on step ${stepCount}. Please complete manually.` };
      }

      const pageText = await page.evaluate(() => document.body.innerText || '').catch(() => '');

      // Detect submission success
      if (/application was sent|application submitted|you.ve applied/i.test(pageText)) {
        submitted = true;
        break;
      }

      // Fill current page
      await fillEasyApplyPage(page, profile, liProfile, log);

      // Look for Next/Submit/Review button
      const nextBtnSel = 'button[aria-label*="Continue"], button[aria-label*="Next"], button[aria-label*="Review"], footer button.jobs-easy-apply-modal__action-button--primary';
      const submitBtnSel = 'button[aria-label*="Submit application"], button[aria-label*="Submit"]';

      const submitBtn = await page.$(submitBtnSel);
      if (submitBtn) {
        log('Submit button found on step ' + stepCount);
        await safeClick(page, submitBtnSel);
        await jitter(2000, 4000);

        // Check for success
        const postSubmitText = await page.evaluate(() => document.body.innerText || '').catch(() => '');
        if (/application was sent|submitted|you.ve applied/i.test(postSubmitText)) {
          submitted = true;
        }
        break;
      }

      const nextBtn = await page.$(nextBtnSel);
      if (nextBtn) {
        await safeClick(page, nextBtnSel);
        await jitter(MIN_STEP_DELAY_MS, MAX_STEP_DELAY_MS);
      } else {
        log('No next or submit button found on step ' + stepCount + ' — attempting submit');
        break;
      }
    }

    if (submitted) {
      log('LinkedIn Easy Apply submitted successfully', { steps: stepCount });
      return { status: 'submitted', confirmationId: `linkedin-easy-apply-${Date.now()}` };
    }

    return { status: 'error', error: 'outcome_unclear', detail: `Completed ${stepCount} steps without confirmed submission` };

  } catch (err) {
    log('LinkedIn handler error: ' + err.message);
    return { status: 'error', error: 'handler_error', detail: err.message };
  }
}
