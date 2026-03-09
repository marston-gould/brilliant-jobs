/**
 * FA-003: preview-jobs Content Search + Landing Page — Validation Tests
 *
 * Verifies:
 *   §1: preview-jobs EF uses content_tsv search alongside title ilike
 *   §2: Status filter changed to eq('status','open')
 *   §3: Landing page client unchanged (no regressions)
 *   §4: Version and build
 *   §5: File inventory
 */

const fs = require('fs');
const path = require('path');

const EF_PATH = path.join(__dirname, '..', 'supabase', 'functions', 'preview-jobs', 'index.ts');
const LANDING_PATH = path.join(__dirname, '..', 'js', 'landing-app.js');
const VERSION_TS = path.join(__dirname, '..', 'js', 'version.ts');
const VERSION_JS = path.join(__dirname, '..', 'js', 'version.js');
const ROADMAP_MD = path.join(__dirname, '..', 'ROADMAP.md');
const ROADMAP_HTML = path.join(__dirname, '..', 'roadmap.html');
const DIST_MIN = path.join(__dirname, '..', 'dist', 'dashboard.min.js');

const efCode = fs.readFileSync(EF_PATH, 'utf-8');
const landingCode = fs.readFileSync(LANDING_PATH, 'utf-8');

// ── §1: preview-jobs content_tsv search ──────────────────────────────

describe('FA-003 §1: preview-jobs uses content_tsv search', () => {
  it('1.1 keyword search uses .or() with title.ilike and content_tsv.wfts', () => {
    expect(efCode).toContain('title.ilike.%${keyword}%,content_tsv.wfts(english).${keyword}');
  });

  it('1.2 no longer uses standalone ilike on title for keyword', () => {
    // Old pattern: q = q.ilike('title', `%${keyword}%`)
    // Should NOT appear (replaced by .or() pattern)
    expect(efCode).not.toMatch(/\.ilike\('title',\s*`%\$\{keyword\}%`\)/);
  });

  it('1.3 FA-003 comment present explaining the change', () => {
    expect(efCode).toContain('FA-003');
  });

  it('1.4 uses wfts(english) not fts or phfts', () => {
    // wfts = websearch full-text search (handles multi-word queries, operators)
    expect(efCode).toContain('content_tsv.wfts(english)');
  });

  it('1.5 keyword OR condition uses .or() not separate filter calls', () => {
    // Must be a single .or() call, not two separate filter calls
    const orMatch = efCode.match(/q\s*=\s*q\.or\(`title\.ilike/);
    expect(orMatch).toBeTruthy();
  });
});

// ── §2: Status filter consistency ────────────────────────────────────

describe('FA-003 §2: Status filter uses eq(open)', () => {
  it('2.1 uses .eq("status", "open") not .neq("status", "closed")', () => {
    expect(efCode).toContain(".eq('status', 'open')");
  });

  it('2.2 does not use .neq("status", "closed")', () => {
    expect(efCode).not.toContain(".neq('status', 'closed')");
  });

  it('2.3 FA-003 comment on status filter change', () => {
    expect(efCode).toContain('consistency');
  });
});

// ── §3: Landing page client unchanged ────────────────────────────────

describe('FA-003 §3: Landing page client (no regressions)', () => {
  it('3.1 landing-app.js still calls preview-jobs endpoint', () => {
    expect(landingCode).toContain("'/functions/v1/preview-jobs'");
  });

  it('3.2 still sends keyword, location, remote, session_token', () => {
    expect(landingCode).toContain('keyword, location, remote, session_token');
  });

  it('3.3 still handles rate_limited response', () => {
    expect(landingCode).toContain("data.error === 'rate_limited'");
  });

  it('3.4 still populates pv-total, pv-salary, pv-remote, pv-companies', () => {
    expect(landingCode).toContain("pv-total");
    expect(landingCode).toContain("pv-salary");
    expect(landingCode).toContain("pv-remote");
    expect(landingCode).toContain("pv-companies");
  });

  it('3.5 still uses DOMPurify for title rendering', () => {
    expect(landingCode).toContain('DOMPurify.sanitize');
  });

  it('3.6 PostHog events still instrumented', () => {
    expect(landingCode).toContain('preview_filter_submitted');
    expect(landingCode).toContain('preview_results_shown');
    expect(landingCode).toContain('preview_rate_limited');
  });
});

// ── §4: Version and build ────────────────────────────────────────────

describe('FA-003 §4: Version and build', () => {
  it('4.1 version.ts is v7.88', () => {
    const vts = fs.readFileSync(VERSION_TS, 'utf-8');
    expect(vts).toContain('v7.88');
  });

  it('4.2 version.js is v7.88', () => {
    const vjs = fs.readFileSync(VERSION_JS, 'utf-8');
    expect(vjs).toContain('v7.88');
  });

  it('4.3 dist/dashboard.min.js exists', () => {
    expect(fs.existsSync(DIST_MIN)).toBe(true);
  });
});

// ── §5: File inventory ───────────────────────────────────────────────

describe('FA-003 §5: File inventory', () => {
  it('5.1 preview-jobs EF exists', () => {
    expect(fs.existsSync(EF_PATH)).toBe(true);
  });

  it('5.2 landing-app.js exists', () => {
    expect(fs.existsSync(LANDING_PATH)).toBe(true);
  });

  it('5.3 ROADMAP.md has FA-003 marked done', () => {
    const rm = fs.readFileSync(ROADMAP_MD, 'utf-8');
    expect(rm).toMatch(/FA-003.*✅/);
  });

  it('5.4 roadmap.html has FA-003 marked done', () => {
    const rh = fs.readFileSync(ROADMAP_HTML, 'utf-8');
    expect(rh).toMatch(/done.*FA-003/);
  });
});
