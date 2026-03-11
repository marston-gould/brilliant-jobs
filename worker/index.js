// worker/index.js
// Brilliant Jobs Auto-Submit Worker
// Polls pending_applications for approved jobs, fills ATS forms via headless Chromium
// AS-1 + AS-2 + AS-3

import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { createServer } from 'http';
import { writeFileSync, mkdirSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { routeSubmission, getSupportedAts } from './ats-router.js';

// ── Config ──
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POLL_INTERVAL = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '30000');
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_BROWSERS || '5');
const DELAY_BETWEEN = parseInt(process.env.SUBMISSION_DELAY_MS || '30000');
const TEMP_DIR = '/tmp/bj-resumes';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[Worker] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── State ──
let activeSubmissions = 0;
let totalProcessed = 0;
let totalSuccess = 0;
let totalFailed = 0;
let lastPollAt = null;
let isShuttingDown = false;

// Ensure temp directory exists
if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true });

// ── Logger ──
function log(level, msg, data = {}) {
  const ts = new Date().toISOString();
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
    JSON.stringify({ ts, level, msg, ...data })
  );
}

const logger = {
  info: (msg, data) => log('info', msg, data),
  warn: (msg, data) => log('warn', msg, data),
  error: (msg, data) => log('error', msg, data),
};

// ══════════════════════════════════════════════════════════════
// HEALTH CHECK SERVER
// ══════════════════════════════════════════════════════════════

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      active: activeSubmissions,
      processed: totalProcessed,
      success: totalSuccess,
      failed: totalFailed,
      lastPoll: lastPollAt,
      supported: getSupportedAts(),
    }));
  } else if (req.url === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end([
      `bj_worker_active_submissions ${activeSubmissions}`,
      `bj_worker_total_processed ${totalProcessed}`,
      `bj_worker_total_success ${totalSuccess}`,
      `bj_worker_total_failed ${totalFailed}`,
    ].join('\n'));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(8080, () => {
  logger.info('Health check server listening on :8080');
});

// ══════════════════════════════════════════════════════════════
// MAIN POLL LOOP
// ══════════════════════════════════════════════════════════════

async function pollForApproved() {
  if (isShuttingDown) return;
  if (activeSubmissions >= MAX_CONCURRENT) {
    logger.info('Max concurrent reached, skipping poll', { active: activeSubmissions, max: MAX_CONCURRENT });
    return;
  }

  lastPollAt = new Date().toISOString();

  try {
    // Fetch approved applications with SKIP-LOCKED-like pattern
    // Mark as 'processing' atomically to prevent double-pickup
    const batchSize = MAX_CONCURRENT - activeSubmissions;
    const { data: pending, error } = await sb
      .from('pending_applications')
      .select('id, user_id, job_id, job_title, company_name, job_url, resume_id, filter_id, approval_mode, created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (error) {
      logger.error('Poll query failed', { error: error.message });
      return;
    }

    if (!pending || pending.length === 0) return;

    logger.info(`Found ${pending.length} approved applications`, { ids: pending.map(p => p.id) });

    // Mark as processing
    const ids = pending.map(p => p.id);
    await sb.from('pending_applications')
      .update({ status: 'processing' })
      .in('id', ids);

    // Process each (respecting concurrency + delay)
    for (const app of pending) {
      if (isShuttingDown) break;
      await processApplication(app);
      if (pending.indexOf(app) < pending.length - 1) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN));
      }
    }
  } catch (err) {
    logger.error('Poll loop error', { error: err.message });
  }
}

// ══════════════════════════════════════════════════════════════
// PROCESS SINGLE APPLICATION
// ══════════════════════════════════════════════════════════════

async function processApplication(app) {
  activeSubmissions++;
  const startTime = Date.now();
  let browser = null;
  let resumeLocalPath = null;

  try {
    logger.info('Processing application', {
      id: app.id, jobTitle: app.job_title, company: app.company_name, jobUrl: app.job_url,
    });

    // ── Fetch user profile ──
    const { data: profileRow } = await sb
      .from('profiles')
      .select('user_data, email')
      .eq('id', app.user_id)
      .maybeSingle();

    if (!profileRow) {
      await failApplication(app, 'no_profile', 'User profile not found', startTime);
      return;
    }

    const userData = profileRow.user_data || {};
    const applicantProfile = userData.applicant_profile || {};
    const profile = {
      name: applicantProfile.name || userData.display_name || '',
      email: applicantProfile.email || profileRow.email || '',
      phone: applicantProfile.phone || '',
      linkedin: applicantProfile.linkedin || '',
      location: applicantProfile.location || '',
      workAuth: applicantProfile.work_authorization !== false,
      needsSponsorship: applicantProfile.needs_sponsorship === true,
      // AF-001: EEOC/OFCCP voluntary self-identification
      gender: (applicantProfile.eeo_preferences || {}).gender || null,
      ethnicity: (applicantProfile.eeo_preferences || {}).ethnicity || null,
      veteranStatus: (applicantProfile.eeo_preferences || {}).veteranStatus || null,
      disabilityStatus: (applicantProfile.eeo_preferences || {}).disabilityStatus || null,
    };

    if (!profile.name || !profile.email) {
      await failApplication(app, 'incomplete_profile', 'Missing name or email in applicant profile', startTime);
      return;
    }

    // ── Download resume ──
    if (app.resume_id) {
      const { data: resumeFiles } = await sb.storage.from('resumes').list(app.user_id);
      const resumeFile = resumeFiles?.find(f => f.id === app.resume_id || f.name.includes(app.resume_id));

      if (resumeFile) {
        const { data: resumeBlob } = await sb.storage
          .from('resumes')
          .download(`${app.user_id}/${resumeFile.name}`);

        if (resumeBlob) {
          resumeLocalPath = join(TEMP_DIR, `${app.id}-resume.pdf`);
          const buffer = Buffer.from(await resumeBlob.arrayBuffer());
          writeFileSync(resumeLocalPath, buffer);
          logger.info('Resume downloaded', { path: resumeLocalPath, size: buffer.length });
        }
      }
    }

    // ── Launch browser ──
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1280 + Math.floor(Math.random() * 200), height: 800 + Math.floor(Math.random() * 200) },
      userAgent: getRandomUserAgent(),
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    // ── Route to handler ──
    const result = await routeSubmission(page, app.job_url, profile, resumeLocalPath, {
      logger, sb, userId: app.user_id, jobId: app.job_id,
    });

    const durationMs = Date.now() - startTime;

    // ── Log to submission_attempts ──
    await sb.from('submission_attempts').insert({
      user_id: app.user_id,
      pending_app_id: app.id,
      job_id: app.job_id,
      job_title: app.job_title,
      company_name: app.company_name,
      job_url: app.job_url,
      ats_source: result.ats_name || 'unknown',
      resume_id: app.resume_id,
      submission_method: 'headless',
      status: result.status,
      error_type: result.error || null,
      error_detail: result.detail || null,
      duration_ms: durationMs,
      confirmation_id: result.confirmationId || null,
      response_body: result,
    }).catch(e => logger.warn('Instrumentation insert failed', { error: e.message }));

    // ── Update pending_application ──
    const newStatus = result.status === 'submitted' ? 'submitted' : 'failed';
    await sb.from('pending_applications')
      .update({
        status: newStatus,
        submitted_at: result.status === 'submitted' ? new Date().toISOString() : null,
      })
      .eq('id', app.id);

    totalProcessed++;
    if (result.status === 'submitted') {
      totalSuccess++;
      logger.info('Application submitted successfully', {
        id: app.id, company: app.company_name, duration: durationMs,
        confirmationId: result.confirmationId,
      });
    } else {
      totalFailed++;
      logger.warn('Application failed', {
        id: app.id, company: app.company_name, error: result.error,
        detail: result.detail, duration: durationMs,
      });
    }

  } catch (err) {
    logger.error('Application processing error', { id: app.id, error: err.message });
    await failApplication(app, 'processing_error', err.message, startTime);
    totalProcessed++;
    totalFailed++;
  } finally {
    activeSubmissions--;
    if (browser) await browser.close().catch(() => {});
    if (resumeLocalPath && existsSync(resumeLocalPath)) {
      try { unlinkSync(resumeLocalPath); } catch { /* ok */ }
    }
  }
}

async function failApplication(app, errorType, errorDetail, startTime) {
  const durationMs = Date.now() - startTime;
  await sb.from('pending_applications')
    .update({ status: 'failed' })
    .eq('id', app.id)
    .catch(() => {});

  await sb.from('submission_attempts').insert({
    user_id: app.user_id,
    pending_app_id: app.id,
    job_id: app.job_id,
    job_title: app.job_title,
    company_name: app.company_name,
    job_url: app.job_url,
    ats_source: 'unknown',
    submission_method: 'headless',
    status: 'error',
    error_type: errorType,
    error_detail: errorDetail,
    duration_ms: durationMs,
  }).catch(() => {});
}

// ══════════════════════════════════════════════════════════════
// USER AGENT ROTATION
// ══════════════════════════════════════════════════════════════

function getRandomUserAgent() {
  const agents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

// ══════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ══════════════════════════════════════════════════════════════

process.on('SIGTERM', () => {
  logger.info('SIGTERM received — graceful shutdown');
  isShuttingDown = true;
  // Wait for active submissions to finish (max 60s)
  const shutdownTimeout = setTimeout(() => {
    logger.warn('Shutdown timeout — forcing exit');
    process.exit(0);
  }, 60000);

  const check = setInterval(() => {
    if (activeSubmissions === 0) {
      clearInterval(check);
      clearTimeout(shutdownTimeout);
      logger.info('All submissions complete — exiting');
      server.close();
      process.exit(0);
    }
  }, 1000);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received');
  isShuttingDown = true;
  process.exit(0);
});

// ══════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════

logger.info('Worker starting', {
  pollInterval: POLL_INTERVAL,
  maxConcurrent: MAX_CONCURRENT,
  delayBetween: DELAY_BETWEEN,
  supported: getSupportedAts(),
});

// Initial poll
pollForApproved();

// Recurring poll
setInterval(pollForApproved, POLL_INTERVAL);
