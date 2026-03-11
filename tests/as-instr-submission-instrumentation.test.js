// tests/as-instr-submission-instrumentation.test.js
// Validation tests for Auto-Submit Instrumentation
// Session: AS-INSTR

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

// ── 1. Migration Structure ──
describe('AS-INSTR: Migration v6.50 — submission_attempts table', () => {
  const sql = readFileSync('supabase/migrations/v6.50-submission-instrumentation.sql', 'utf8');

  it('creates submission_attempts table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.submission_attempts');
  });

  it('has all required columns', () => {
    const columns = [
      'user_id', 'pending_app_id', 'job_id', 'job_title', 'company_name',
      'job_url', 'ats_source', 'resume_id', 'resume_filename', 'resume_version',
      'submission_method', 'status', 'error_type', 'error_detail', 'http_status',
      'duration_ms', 'confirmation_id', 'response_body', 'created_at', 'scar_meta'
    ];
    columns.forEach(col => {
      expect(sql).toContain(col);
    });
  });

  it('has indexes for user, ats, status, created_at, company', () => {
    expect(sql).toContain('idx_sub_attempts_user');
    expect(sql).toContain('idx_sub_attempts_ats');
    expect(sql).toContain('idx_sub_attempts_status');
    expect(sql).toContain('idx_sub_attempts_created');
    expect(sql).toContain('idx_sub_attempts_company');
  });

  it('has RLS policies', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('Users read own submission attempts');
    expect(sql).toContain('Service role full access submission attempts');
  });

  it('creates v_submission_dashboard view', () => {
    expect(sql).toContain('CREATE OR REPLACE VIEW public.v_submission_dashboard');
    expect(sql).toContain('stats_24h');
    expect(sql).toContain('stats_7d');
    expect(sql).toContain('by_ats');
    expect(sql).toContain('by_error');
  });

  it('creates fn_submission_summary function', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.fn_submission_summary');
    expect(sql).toContain('recent_failures');
    expect(sql).toContain('recent_successes');
    expect(sql).toContain('daily_trend');
  });

  it('includes S-12 scar_meta column', () => {
    expect(sql).toContain('scar_meta');
    expect(sql).toContain('JSONB');
  });

  it('grants to authenticated and service_role', () => {
    expect(sql).toContain('GRANT SELECT ON public.submission_attempts TO authenticated');
    expect(sql).toContain('GRANT ALL ON public.submission_attempts TO service_role');
  });
});

// ── 2. submit-application EF Instrumentation ──
describe('AS-INSTR: submit-application EF — instrumentation logging', () => {
  const ef = readFileSync('supabase/functions/submit-application/index.ts', 'utf8');

  it('has timing start (startTime = Date.now())', () => {
    expect(ef).toContain('const startTime = Date.now()');
  });

  it('inserts into submission_attempts with duration_ms', () => {
    expect(ef).toContain('submission_attempts');
    expect(ef).toContain('duration_ms');
    expect(ef).toContain('Date.now() - startTime');
  });

  it('logs all required fields: job_title, company_name, job_url, ats_source, resume', () => {
    expect(ef).toContain('job_title:');
    expect(ef).toContain('company_name:');
    expect(ef).toContain('job_url:');
    expect(ef).toContain('ats_source:');
    expect(ef).toContain('resume_filename:');
  });

  it('logs error_type and error_detail', () => {
    expect(ef).toContain('error_type:');
    expect(ef).toContain('error_detail:');
  });

  it('logs http_status', () => {
    expect(ef).toContain('http_status:');
  });

  it('enriches job_title/company_name from pending_applications fallback', () => {
    expect(ef).toContain('Enrich job_title / company_name from pending_applications');
    expect(ef).toContain('instrJobTitle');
    expect(ef).toContain('instrCompanyName');
  });

  it('has instrumentation on timeout early-return path', () => {
    expect(ef).toContain('Instrumentation for timeout path');
    expect(ef).toContain('timeoutDurationMs');
  });

  it('has headless as valid submission_method', () => {
    expect(ef).toContain('"headless"');
  });

  it('has job_title and company_name on SubmitRequest interface', () => {
    expect(ef).toContain('job_title?: string');
    expect(ef).toContain('company_name?: string');
  });
});

// ── 3. Admin Panel ──
describe('AS-INSTR: Admin auto-submit panel', () => {
  const panel = readFileSync('js/admin-autosubmit.js', 'utf8');

  it('exists and defines loadAutoSubmitPanel', () => {
    expect(panel).toContain('function loadAutoSubmitPanel');
    expect(panel).toContain('window.loadAutoSubmitPanel');
  });

  it('calls fn_submission_summary RPC', () => {
    expect(panel).toContain("rpc('fn_submission_summary')");
  });

  it('renders overview stat cards (24h and 7d)', () => {
    expect(panel).toContain('Total (24h)');
    expect(panel).toContain('Failures (24h)');
    expect(panel).toContain('Fail Rate (24h)');
    expect(panel).toContain('P95 Duration (24h)');
    expect(panel).toContain('Total (7d)');
  });

  it('renders ATS failure rate table', () => {
    expect(panel).toContain('Failure Rate by ATS');
    expect(panel).toContain('failure_rate_pct');
  });

  it('renders error type breakdown', () => {
    expect(panel).toContain('Error Types');
    expect(panel).toContain('error_type');
  });

  it('renders recent failures table with all required columns', () => {
    expect(panel).toContain('Recent Failures');
    expect(panel).toContain('ATS');
    expect(panel).toContain('Customer');
    expect(panel).toContain('Resume');
    expect(panel).toContain('Company');
    expect(panel).toContain('URL');
  });

  it('renders recent successes table', () => {
    expect(panel).toContain('Recent Successes');
    expect(panel).toContain('confirmation_id');
  });

  it('has daily trend sparkline', () => {
    expect(panel).toContain('_buildTrendSparkline');
    expect(panel).toContain('Daily Trend');
  });

  it('has 2-minute auto-refresh', () => {
    expect(panel).toContain('120000');
    expect(panel).toContain('_autosubmitRefreshTimer');
  });
});

// ── 4. Admin Integration ──
describe('AS-INSTR: Admin integration', () => {
  const adminJs = readFileSync('js/admin.js', 'utf8');
  const adminHtml = readFileSync('admin.html', 'utf8');

  it('ADMIN_SUBPAGE_MAP has auto-submit entry', () => {
    expect(adminJs).toContain("'auto-submit'");
    expect(adminJs).toContain('loadAutoSubmitPanel');
  });

  it('admin.html has auto-submit panel container', () => {
    expect(adminHtml).toContain('admin-panel-auto-submit');
    expect(adminHtml).toContain('admin-autosubmit');
  });

  it('admin.html has admin-autosubmit.js script tag', () => {
    expect(adminHtml).toContain('admin-autosubmit.js');
  });
});

// ── 5. Build Output ──
describe('AS-INSTR: Build output', () => {
  it('admin bundle exists', () => {
    expect(existsSync('dist/admin.min.js')).toBe(true);
  });

  it('admin bundle includes auto-submit subpage entry', () => {
    const bundle = readFileSync('dist/admin.min.js', 'utf8');
    expect(bundle).toContain('auto-submit');
  });
});

// ── 6. File Inventory ──
describe('AS-INSTR: File inventory', () => {
  const files = [
    'supabase/migrations/v6.50-submission-instrumentation.sql',
    'js/admin-autosubmit.js',
  ];
  files.forEach(f => {
    it(`${f} exists`, () => {
      expect(existsSync(f)).toBe(true);
    });
  });
});
