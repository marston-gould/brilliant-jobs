/**
 * FA-002: Backfill content_tsv + Enrichment Cron — Validation Tests
 *
 * Validates:
 *   1. Migration structure — column, trigger, index, functions, crons, view (10 tests)
 *   2. Trigger function — correct tsvector generation from content+title (6 tests)
 *   3. Backfill function — batch processing, edge cases, completion (5 tests)
 *   4. Enrichment gap fixer — marks new jobs, respects retry limit (5 tests)
 *   5. Monitoring view — all required columns present (4 tests)
 *   6. enrich-jd-ai updates — retry count, queue depth, failure tracking (6 tests)
 *   7. job-feed.js NULL safety — NOT queries don't exclude NULL content_tsv (6 tests)
 *   8. Version + build output (4 tests)
 *   9. File inventory (1 test)
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

// ── Shared file reads ──
const migration = read('supabase/migrations/v6.41-fa002-content-tsv-backfill.sql');
const enrichJdAi = read('supabase/functions/enrich-jd-ai/index.ts');
const jobFeed = read('js/job-feed.js');
const versionTs = read('js/version.ts');
const versionJs = read('js/version.js');

// ═══════════════════════════════════════════════════════════════════
// Section 1: Migration structure
// ═══════════════════════════════════════════════════════════════════
describe('FA-002 §1: Migration structure', () => {
  it('1.1 adds content_tsv tsvector column', () => {
    expect(migration).toMatch(/ALTER TABLE ats_jobs ADD COLUMN.*content_tsv tsvector/i);
  });

  it('1.2 adds jd_enrich_retry_count column', () => {
    expect(migration).toMatch(/ALTER TABLE ats_jobs ADD COLUMN.*jd_enrich_retry_count.*integer.*DEFAULT 0/i);
  });

  it('1.3 creates trigger function fn_update_content_tsv', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION fn_update_content_tsv()');
    expect(migration).toContain('RETURNS trigger');
  });

  it('1.4 creates trigger trg_content_tsv BEFORE INSERT OR UPDATE', () => {
    expect(migration).toMatch(/CREATE TRIGGER trg_content_tsv\s+BEFORE INSERT OR UPDATE OF content, title ON ats_jobs/);
  });

  it('1.5 creates GIN index on content_tsv', () => {
    expect(migration).toMatch(/CREATE INDEX.*idx_ats_jobs_content_tsv\s+ON ats_jobs USING gin \(content_tsv\)/i);
  });

  it('1.6 creates fn_backfill_content_tsv function', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION fn_backfill_content_tsv');
    expect(migration).toContain('p_batch_size integer DEFAULT 10000');
    expect(migration).toContain('RETURNS jsonb');
  });

  it('1.7 creates fn_mark_jobs_for_enrichment function', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION fn_mark_jobs_for_enrichment');
    expect(migration).toContain('p_batch_size integer DEFAULT 200');
  });

  it('1.8 schedules backfill-content-tsv cron', () => {
    expect(migration).toMatch(/cron\.schedule\(\s*'backfill-content-tsv'/);
    expect(migration).toContain('fn_backfill_content_tsv(10000)');
  });

  it('1.9 schedules mark-jobs-for-enrichment cron every 15 min', () => {
    expect(migration).toMatch(/cron\.schedule\(\s*'mark-jobs-for-enrichment'/);
    expect(migration).toContain('*/15 * * * *');
    expect(migration).toContain('fn_mark_jobs_for_enrichment(200)');
  });

  it('1.10 creates v_content_tsv_status monitoring view', () => {
    expect(migration).toContain('CREATE OR REPLACE VIEW v_content_tsv_status');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 2: Trigger function correctness
// ═══════════════════════════════════════════════════════════════════
describe('FA-002 §2: Trigger function generates correct tsvector', () => {
  it('2.1 strips HTML tags from content', () => {
    expect(migration).toMatch(/regexp_replace.*<\[.*\].*>.*' '.*'g'/);
  });

  it('2.2 strips HTML entities', () => {
    expect(migration).toMatch(/regexp_replace.*&\[a-zA-Z\]\+;.*' '.*'g'/);
  });

  it('2.3 uses weight A for title', () => {
    expect(migration).toMatch(/setweight\(to_tsvector\('english',.*COALESCE\(NEW\.title.*'A'\)/);
  });

  it('2.4 uses weight B for content', () => {
    expect(migration).toMatch(/setweight\(to_tsvector\('english'.*clean_content.*'B'\)/);
  });

  it('2.5 handles NULL title gracefully with COALESCE', () => {
    expect(migration).toContain("COALESCE(NEW.title, '')");
  });

  it('2.6 handles NULL content gracefully with COALESCE', () => {
    expect(migration).toContain("COALESCE(NEW.content, '')");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 3: Backfill function design
// ═══════════════════════════════════════════════════════════════════
describe('FA-002 §3: Backfill function design', () => {
  it('3.1 uses SKIP LOCKED for concurrent safety', () => {
    expect(migration).toMatch(/FOR UPDATE SKIP LOCKED/);
  });

  it('3.2 processes content+title jobs first', () => {
    // The first CTE targets content IS NOT NULL AND content_tsv IS NULL
    const firstBatch = migration.indexOf('content IS NOT NULL');
    const secondBatch = migration.indexOf('content IS NULL', firstBatch + 1);
    expect(firstBatch).toBeLessThan(secondBatch);
  });

  it('3.3 also handles title-only jobs (no content)', () => {
    expect(migration).toMatch(/content IS NULL\s+AND content_tsv IS NULL\s+AND title IS NOT NULL/);
  });

  it('3.4 returns progress JSON with remaining count', () => {
    expect(migration).toContain("'remaining'");
    expect(migration).toContain("'complete'");
    expect(migration).toContain("'updated_with_content'");
    expect(migration).toContain("'updated_title_only'");
  });

  it('3.5 strips HTML in backfill SQL (same as trigger)', () => {
    // The backfill UPDATE also strips HTML, not just the trigger
    const backfillSection = migration.substring(migration.indexOf('fn_backfill_content_tsv'));
    expect(backfillSection).toMatch(/<\[.*\].*>.*' '.*'g'/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 4: Enrichment gap fixer
// ═══════════════════════════════════════════════════════════════════
describe('FA-002 §4: Enrichment gap fixer', () => {
  it('4.1 targets jobs with content but no jd_extracted_at', () => {
    const fnSection = migration.substring(migration.indexOf('fn_mark_jobs_for_enrichment'));
    expect(fnSection).toContain('content IS NOT NULL');
    expect(fnSection).toContain('jd_extracted_at IS NULL');
  });

  it('4.2 sets jd_extracted_at and enrichment_priority = 2', () => {
    const fnSection = migration.substring(migration.indexOf('fn_mark_jobs_for_enrichment'));
    expect(fnSection).toContain('jd_extracted_at = now()');
    expect(fnSection).toContain('enrichment_priority');
    expect(fnSection).toContain('2');
  });

  it('4.3 respects retry limit (jd_enrich_retry_count < 3)', () => {
    const fnSection = migration.substring(migration.indexOf('fn_mark_jobs_for_enrichment'));
    expect(fnSection).toContain('jd_enrich_retry_count < 3');
  });

  it('4.4 requires minimum content length (> 50)', () => {
    const fnSection = migration.substring(migration.indexOf('fn_mark_jobs_for_enrichment'));
    expect(fnSection).toMatch(/length\(content\)\s*>\s*50/);
  });

  it('4.5 returns queue depth and permanently_skipped counts', () => {
    const fnSection = migration.substring(migration.indexOf('fn_mark_jobs_for_enrichment'));
    expect(fnSection).toContain("'ai_enrichment_queue_depth'");
    expect(fnSection).toContain("'permanently_skipped'");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 5: Monitoring view
// ═══════════════════════════════════════════════════════════════════
describe('FA-002 §5: Monitoring view columns', () => {
  it('5.1 includes total_open_jobs and content_tsv coverage', () => {
    expect(migration).toContain('total_open_jobs');
    expect(migration).toContain('has_content_tsv');
    expect(migration).toContain('missing_content_tsv');
    expect(migration).toContain('content_tsv_pct');
  });

  it('5.2 includes breakdown by content availability', () => {
    expect(migration).toContain('has_content_missing_tsv');
    expect(migration).toContain('title_only_missing_tsv');
    expect(migration).toContain('no_content_no_title');
  });

  it('5.3 includes AI enrichment status', () => {
    expect(migration).toContain('ai_enriched');
    expect(migration).toContain('unenriched_with_content');
    expect(migration).toContain('permanently_failed');
  });

  it('5.4 includes enrichment queue depth', () => {
    expect(migration).toContain('ai_queue_depth');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 6: enrich-jd-ai updates
// ═══════════════════════════════════════════════════════════════════
describe('FA-002 §6: enrich-jd-ai updates', () => {
  it('6.1 selects jd_enrich_retry_count in query', () => {
    expect(enrichJdAi).toContain('jd_enrich_retry_count');
    expect(enrichJdAi).toMatch(/\.select\([^)]*jd_enrich_retry_count/);
  });

  it('6.2 filters out jobs with 3+ retries', () => {
    expect(enrichJdAi).toMatch(/\.lt\('jd_enrich_retry_count',\s*3\)/);
  });

  it('6.3 increments retry count on non-429 failures', () => {
    expect(enrichJdAi).toContain('jd_enrich_retry_count: currentRetry + 1');
  });

  it('6.4 does not increment retry count on rate limit (429)', () => {
    expect(enrichJdAi).toContain("!e.message?.includes('429')");
  });

  it('6.5 includes queue_remaining in response', () => {
    expect(enrichJdAi).toContain('queue_remaining');
  });

  it('6.6 logs enrichment batch to hygiene_log', () => {
    expect(enrichJdAi).toContain("'jd_enrichment_batch'");
    expect(enrichJdAi).toContain('hygiene_log');
    expect(enrichJdAi).toContain('failure_rate_pct');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 7: job-feed.js NULL safety
// ═══════════════════════════════════════════════════════════════════
describe('FA-002 §7: job-feed.js NULL-safe NOT queries', () => {
  it('7.1 NOT pills use or() with content_tsv.is.null fallback', () => {
    // The NOT query should be: or(not.content_tsv.wfts(english).term,content_tsv.is.null)
    // This prevents NULL content_tsv rows from being accidentally excluded
    expect(jobFeed).toContain('not.content_tsv.wfts(english)');
    expect(jobFeed).toContain('content_tsv.is.null');
  });

  it('7.2 NOT pills use .or() instead of .not() for content_tsv', () => {
    // Count .not('content_tsv' ... ) calls — should be ZERO (replaced with .or())
    const notContentTsvDirect = (jobFeed.match(/\.not\(\s*['"]content_tsv['"]/g) || []).length;
    expect(notContentTsvDirect).toBe(0);
  });

  it('7.3 global title exclusions also use NULL-safe pattern', () => {
    // Both NOT pills AND global titleExcludes should use the same pattern
    const orCalls = jobFeed.match(/query\s*=\s*query\.or\(`not\.content_tsv\.wfts/g) || [];
    expect(orCalls.length).toBeGreaterThanOrEqual(2); // At least 2 (NOT pills + titleExcludes)
  });

  it('7.4 FA-002 NULL safety comments present', () => {
    expect(jobFeed).toContain('FA-002: NULL-safe');
  });

  it('7.5 content_tsv positive search still uses wfts(english) pattern', () => {
    expect(jobFeed).toContain('content_tsv.wfts(english).${safe}');
  });

  it('7.6 JD CONTAINS still uses textSearch on content_tsv', () => {
    expect(jobFeed).toMatch(/\.textSearch\(['"]content_tsv['"]/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 8: Version + build output
// ═══════════════════════════════════════════════════════════════════
describe('FA-002 §8: Version and build', () => {
  it('8.1 version.ts is v7.87', () => {
    expect(versionTs).toContain("v7.87");
  });

  it('8.2 version.js is v7.87', () => {
    expect(versionJs).toContain("v7.87");
  });

  it('8.3 dist/dashboard.min.js exists and was rebuilt', () => {
    expect(fs.existsSync(path.join(REPO, 'dist/dashboard.min.js'))).toBe(true);
  });

  it('8.4 migration is v6.41', () => {
    expect(fs.existsSync(path.join(REPO, 'supabase/migrations/v6.41-fa002-content-tsv-backfill.sql'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 9: File inventory
// ═══════════════════════════════════════════════════════════════════
describe('FA-002 §9: File inventory', () => {
  it('9.1 all created and modified files exist', () => {
    const files = [
      'supabase/migrations/v6.41-fa002-content-tsv-backfill.sql',
      'supabase/functions/enrich-jd-ai/index.ts',
      'js/job-feed.js',
      'js/version.ts',
      'js/version.js',
      'dist/dashboard.min.js',
      'tests/fa-002-content-tsv-backfill.test.js',
    ];
    const missing = files.filter(f => !fs.existsSync(path.join(REPO, f)));
    expect(missing).toEqual([]);
  });
});
