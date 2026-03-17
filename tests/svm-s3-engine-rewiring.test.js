/**
 * FB-SURVEY-ADMIN-001 SVM-S3: Engine Rewiring
 * Tests: delivery reads from JSONB, page-level overlay filtering, async question loading, audience_config
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function readFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf-8'); }

// ─── 1. Overlay: placement_config page filtering ────────────────────────────
describe('SVM-S3: Overlay page filtering', () => {
  const sd = readFile('js/survey-delivery.js');

  it('reads placement_config.overlay from campaign', () => {
    expect(sd).toContain('c.placement_config');
    expect(sd).toContain('pc.overlay');
  });
  it('checks overlay.enabled flag', () => {
    expect(sd).toContain('pc.overlay.enabled');
  });
  it('filters by overlay.pages array against current page', () => {
    expect(sd).toContain('pc.overlay.pages');
    expect(sd).toContain('currentPage');
    expect(sd).toContain("indexOf(currentPage)");
  });
  it('falls back to channels array if no placement_config', () => {
    expect(sd).toContain("c.channels.indexOf('overlay')");
  });
});

// ─── 2. Audience: full audience_config support ──────────────────────────────
describe('SVM-S3: Audience targeting from audience_config', () => {
  const sd = readFile('js/survey-delivery.js');

  it('reads audience_config with fallback to target_audience', () => {
    expect(sd).toContain('campaign.audience_config || campaign.target_audience');
  });
  it('handles type=all', () => {
    expect(sd).toContain("ac.type === 'all'");
  });
  it('handles type=time_cohort with signup date range', () => {
    expect(sd).toContain("ac.type === 'time_cohort'");
    expect(sd).toContain('ac.signup_after');
    expect(sd).toContain('ac.signup_before');
  });
  it('handles type=behavioral with plan/sessions/apps/days', () => {
    expect(sd).toContain("ac.type === 'behavioral'");
    expect(sd).toContain('ac.plan');
    expect(sd).toContain('ac.min_sessions');
    expect(sd).toContain('ac.min_applications');
    expect(sd).toContain('ac.days_since_signup_min');
  });
  it('has legacy flat target_audience fallback', () => {
    expect(sd).toContain('Legacy flat target_audience fallback');
  });
});

// ─── 3. survey.html: async question loading from DB ─────────────────────────
describe('SVM-S3: survey.html async question loading', () => {
  const html = readFile('survey.html');

  it('has async resolveVersionAsync function', () => {
    expect(html).toContain('async function resolveVersionAsync');
  });
  it('fetches from survey_campaigns REST API', () => {
    expect(html).toContain('survey_campaigns?survey_version=eq.');
    expect(html).toContain('select=survey_version,questions');
  });
  it('uses DB questions when available', () => {
    expect(html).toContain('rows[0].questions');
    expect(html).toContain('rows[0].questions.length > 0');
  });
  it('falls back to hardcoded banks on failure', () => {
    expect(html).toContain('DB question fetch failed');
    expect(html).toContain('exitVersions');
    expect(html).toContain('npsVersions');
  });
  it('init() called by async wrapper instead of directly', () => {
    expect(html).toContain('resolveVersionAsync wrapper');
    expect(html).toContain('resolved = await resolveVersionAsync()');
  });
});

// ─── 4. send-survey-invite: audience_config filtering ───────────────────────
describe('SVM-S3: Email EF audience_config', () => {
  const ef = readFile('supabase/functions/send-survey-invite/index.ts');

  it('reads audience_config from campaign', () => {
    expect(ef).toContain('campaign.audience_config');
  });
  it('time_cohort filters at DB level', () => {
    expect(ef).toContain("ac.type === \"time_cohort\"");
    expect(ef).toContain('gte("created_at"');
    expect(ef).toContain('lte("created_at"');
  });
  it('behavioral filters at app level', () => {
    expect(ef).toContain("ac.type === \"behavioral\"");
    expect(ef).toContain('ac.min_sessions');
    expect(ef).toContain('ac.min_applications');
    expect(ef).toContain('ac.plan');
    expect(ef).toContain('ac.days_since_signup_min');
  });
  it('fetches user_data for behavioral checks', () => {
    expect(ef).toContain('user_data');
    expect(ef).toContain('session_count');
    expect(ef).toContain('application_count');
  });
});

// ─── 5. File Inventory ──────────────────────────────────────────────────────
describe('SVM-S3: File inventory', () => {
  it('test file exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'tests/svm-s3-engine-rewiring.test.js'))).toBe(true);
  });
});
