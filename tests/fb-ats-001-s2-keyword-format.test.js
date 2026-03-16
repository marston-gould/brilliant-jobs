/**
 * FB-ATS-001-S2: ATS-003 (Keyword Match Rate Breakdown UI) + ATS-001 (Resume Format Health Check)
 * 
 * Session: ATS Pass Rate Improvement — Phase 2
 * Date: 2026-03-16
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

// ════════════════════════════════════════════════════════════
// 1. ATS-003: Keyword Match Rate Bar — Score Gate Modal
// ════════════════════════════════════════════════════════════
describe('ATS-003: Keyword Match Rate — Score Gate Modal', () => {
  const src = readFile('js/apply-workflow.js');

  it('calculates match percentage from key_matches and key_gaps', () => {
    expect(src).toContain('keyMatches.length + keyGaps.length');
    expect(src).toContain('Math.round((keyMatches.length / totalKeywords) * 100)');
  });

  it('renders match rate label with X of Y format', () => {
    expect(src).toContain("' of ' + totalKeywords + ' keywords matched ('");
  });

  it('renders match rate progress bar track and fill', () => {
    expect(src).toContain('sg-match-rate-track');
    expect(src).toContain('sg-match-rate-fill');
  });

  it('color-codes bar: green >=75, warm >=50, red <50', () => {
    expect(src).toContain("matchPct >= 75 ? 'var(--green)' : matchPct >= 50 ? 'var(--warm)' : 'var(--red)'");
  });

  it('reads key_matches from scoreResult or recommendations.strong_matches', () => {
    expect(src).toContain('scoreResult.key_matches');
    expect(src).toContain('scoreResult.recommendations.strong_matches');
  });

  it('reads key_gaps from scoreResult or recommendations.missing_skills', () => {
    expect(src).toContain('scoreResult.key_gaps');
    expect(src).toContain('scoreResult.recommendations.missing_skills');
  });
});

// ════════════════════════════════════════════════════════════
// 2. ATS-003: Category Grouping — Core Requirements
// ════════════════════════════════════════════════════════════
describe('ATS-003: Category Grouping — core_requirements', () => {
  const src = readFile('js/apply-workflow.js');

  it('reads core_requirements from scoreResult', () => {
    expect(src).toContain('scoreResult.core_requirements');
  });

  it('groups requirements by category', () => {
    expect(src).toContain("var cat = cr.category || 'other'");
    expect(src).toContain('if (!categories[cat]) categories[cat] = [];');
  });

  it('has category labels for all expected types', () => {
    expect(src).toContain("technical: 'Technical Skills'");
    expect(src).toContain("soft: 'Soft Skills'");
    expect(src).toContain("tool: 'Tools & Platforms'");
    expect(src).toContain("domain: 'Domain Knowledge'");
    expect(src).toContain("certification: 'Certifications'");
  });

  it('renders per-category match counts', () => {
    expect(src).toContain('sg-cat-count');
    expect(src).toContain("catMatched + '/' + items.length");
  });

  it('distinguishes strong/partial/missing evidence', () => {
    expect(src).toContain("resume_evidence === 'strong'");
    expect(src).toContain("resume_evidence === 'partial'");
    expect(src).toContain('sg-partial-chip');
  });
});

// ════════════════════════════════════════════════════════════
// 3. ATS-003: Keyword Match Rate — Readiness Results
// ════════════════════════════════════════════════════════════
describe('ATS-003: Match Rate Bar — Readiness Panel', () => {
  const src = readFile('js/keywords.js');

  it('adds match rate bar to per-filter breakdown', () => {
    expect(src).toContain('ATS-003: Match rate progress bar');
    expect(src).toContain('sg-match-rate');
    expect(src).toContain('sg-match-rate-track');
    expect(src).toContain('sg-match-rate-fill');
  });

  it('calculates matchPct from fs.matched / fs.total', () => {
    expect(src).toContain('Math.round((fs.matched / fs.total) * 100)');
  });
});

// ════════════════════════════════════════════════════════════
// 4. ATS-003: PostHog Tracking
// ════════════════════════════════════════════════════════════
describe('ATS-003: PostHog keyword_breakdown_viewed', () => {
  const src = readFile('js/apply-workflow.js');

  it('fires keyword_breakdown_viewed event', () => {
    expect(src).toContain("capturePostHog('keyword_breakdown_viewed'");
  });

  it('includes match_rate property', () => {
    expect(src).toContain('match_rate: matchPct');
  });

  it('includes matched_count and missing_count', () => {
    expect(src).toContain('matched_count: keyMatches.length');
    expect(src).toContain('missing_count: keyGaps.length');
  });

  it('includes has_categories flag', () => {
    expect(src).toContain('has_categories: coreReqs.length > 0');
  });
});

// ════════════════════════════════════════════════════════════
// 5. ATS-003: CSS
// ════════════════════════════════════════════════════════════
describe('ATS-003: CSS Classes', () => {
  const css = readFile('src/input.css');

  it('has sg-match-rate styles', () => {
    expect(css).toContain('.sg-match-rate');
    expect(css).toContain('.sg-match-rate-label');
    expect(css).toContain('.sg-match-rate-track');
    expect(css).toContain('.sg-match-rate-fill');
  });

  it('has sg-cat-group styles', () => {
    expect(css).toContain('.sg-cat-group');
    expect(css).toContain('.sg-cat-header');
    expect(css).toContain('.sg-cat-count');
    expect(css).toContain('.sg-cat-items');
  });

  it('has sg-partial-chip for partial evidence', () => {
    expect(css).toContain('.sg-partial-chip');
  });
});

// ════════════════════════════════════════════════════════════
// 6. ATS-001: validate-resume-format EF — Structure
// ════════════════════════════════════════════════════════════
describe('ATS-001: validate-resume-format EF', () => {
  const src = readFile('supabase/functions/validate-resume-format/index.ts');

  it('exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'supabase/functions/validate-resume-format/index.ts'))).toBe(true);
  });

  it('has auth check', () => {
    expect(src).toContain('Unauthorized');
    expect(src).toContain('auth.getUser');
  });

  it('accepts resume_text or resume_id', () => {
    expect(src).toContain('resume_text or resume_id required');
  });

  it('fetches from resume_archive when resume_id provided', () => {
    expect(src).toContain("from('resume_archive')");
    expect(src).toContain('extracted_text');
  });

  it('returns format_score, issues, is_ats_ready, headers_detected', () => {
    expect(src).toContain('format_score');
    expect(src).toContain('is_ats_ready');
    expect(src).toContain('headers_detected');
  });
});

// ════════════════════════════════════════════════════════════
// 7. ATS-001: Format Checks
// ════════════════════════════════════════════════════════════
describe('ATS-001: Format Detection Rules', () => {
  const src = readFile('supabase/functions/validate-resume-format/index.ts');

  it('detects scanned/image-only PDFs (low word count)', () => {
    expect(src).toContain('scanned_pdf');
    expect(src).toContain('wordCount < 30');
  });

  it('detects multi-column layouts via short line ratio', () => {
    expect(src).toContain('multi_column');
    expect(src).toContain('shortLineRatio');
  });

  it('detects tables via tab characters', () => {
    expect(src).toContain('tables_detected');
    expect(src).toContain('tabLines');
  });

  it('checks for non-standard fonts from metadata', () => {
    expect(src).toContain('non_standard_fonts');
    expect(src).toContain('ATS_SAFE_FONTS');
  });

  it('detects contact info only in header/footer', () => {
    expect(src).toContain('header_footer_contact');
  });

  it('detects encoding issues', () => {
    expect(src).toContain('encoding_issues');
  });

  it('integrates ATS-007 header standardization check', () => {
    expect(src).toContain('non_standard_headers');
    expect(src).toContain('VARIANT_TO_STANDARD');
  });
});

// ════════════════════════════════════════════════════════════
// 8. ATS-001: ATS-Safe Font List
// ════════════════════════════════════════════════════════════
describe('ATS-001: ATS-Safe Font List', () => {
  const src = readFile('supabase/functions/validate-resume-format/index.ts');

  const requiredFonts = ['arial', 'calibri', 'times new roman', 'helvetica', 'georgia', 'garamond', 'cambria'];
  requiredFonts.forEach(font => {
    it(`includes ${font}`, () => {
      expect(src.toLowerCase()).toContain(`'${font}'`);
    });
  });
});

// ════════════════════════════════════════════════════════════
// 9. ATS-001: Scoring Logic
// ════════════════════════════════════════════════════════════
describe('ATS-001: Format Score Calculation', () => {
  const src = readFile('supabase/functions/validate-resume-format/index.ts');

  it('starts at 100 and deducts for issues', () => {
    expect(src).toContain('let formatScore = 100');
  });

  it('deducts 30 points per blocking issue', () => {
    expect(src).toContain('blockingCount * 30');
  });

  it('deducts 10 points per warning', () => {
    expect(src).toContain('warningCount * 10');
  });

  it('clamps between 0 and 100', () => {
    expect(src).toContain('Math.max(0, Math.min(100, formatScore))');
  });

  it('is_ats_ready when no blocking and <=1 warning', () => {
    expect(src).toContain('blockingCount === 0 && warningCount <= 1');
  });
});

// ════════════════════════════════════════════════════════════
// 10. ATS-001: Client Integration — resumes.js
// ════════════════════════════════════════════════════════════
describe('ATS-001: Client Integration', () => {
  const src = readFile('js/resumes.js');

  it('calls validateResumeFormat after text extraction', () => {
    expect(src).toContain('validateResumeFormat(id, text)');
  });

  it('validateResumeFormat function exists', () => {
    expect(src).toContain('async function validateResumeFormat(resumeId, text)');
  });

  it('calls EF via api-gateway route', () => {
    expect(src).toContain('/functions/v1/api-gateway/validate-resume-format');
  });

  it('stores formatCheck result on resume object', () => {
    expect(src).toContain('resumes[idx].formatCheck');
    expect(src).toContain('score: data.format_score');
    expect(src).toContain('isAtsReady: data.is_ats_ready');
  });

  it('fires resume_format_check_run PostHog event', () => {
    expect(src).toContain("capturePostHog('resume_format_check_run'");
  });

  it('buildFormatBadge renders ATS-Ready for clean resumes', () => {
    expect(src).toContain('ATS-Ready');
    expect(src).toContain('shield-check');
  });

  it('buildFormatBadge renders Format Issues for blocking issues', () => {
    expect(src).toContain('Format Issues');
    expect(src).toContain('triangle-alert');
  });

  it('showFormatIssues popup function exported to window', () => {
    expect(src).toContain('window.showFormatIssues');
  });

  it('showFormatIssues renders severity badges', () => {
    expect(src).toContain('Blocking');
    expect(src).toContain('Warning');
  });

  it('uses reportError on failure (no silent fails)', () => {
    expect(src).toContain("reportError('format-check'");
  });
});

// ════════════════════════════════════════════════════════════
// 11. ATS-001: Gateway Route
// ════════════════════════════════════════════════════════════
describe('ATS-001: Gateway Route', () => {
  const gw = readFile('supabase/functions/api-gateway/index.ts');

  it('has validate-resume-format route', () => {
    expect(gw).toContain('"validate-resume-format"');
  });
});

// ════════════════════════════════════════════════════════════
// 12. File Inventory
// ════════════════════════════════════════════════════════════
describe('File Inventory', () => {
  const files = [
    'supabase/functions/validate-resume-format/index.ts',
    'supabase/functions/api-gateway/index.ts',
    'js/apply-workflow.js',
    'js/keywords.js',
    'js/resumes.js',
    'src/input.css',
  ];
  files.forEach(f => {
    it(`${f} exists`, () => {
      expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
    });
  });
});
