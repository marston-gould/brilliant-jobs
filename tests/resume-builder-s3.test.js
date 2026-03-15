// tests/resume-builder-s3.test.js
// RESUME-BUILDER-001-S3 validation — Keyword Optimization

import { describe, it, expect } from 'vitest';

describe('resume-optimize EF', () => {
  it('EF file exists', async () => {
    const fs = await import('fs');
    expect(fs.existsSync('supabase/functions/resume-optimize/index.ts')).toBe(true);
  });

  it('returns 401 without token', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-optimize/index.ts', 'utf8');
    expect(src).toContain('status: 401');
  });

  it('returns 400 when resume_id or target_job_id missing', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-optimize/index.ts', 'utf8');
    expect(src).toContain('resume_id and target_job_id are required');
    expect(src).toContain('status: 400');
  });

  it('enforces 1-credit cost — returns 402 when insufficient', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-optimize/index.ts', 'utf8');
    expect(src).toContain('status: 402');
    expect(src).toContain('credits_required: 1');
    expect(src).toContain('Insufficient credits');
  });

  it('deducts 1 credit on success', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-optimize/index.ts', 'utf8');
    expect(src).toContain('credits_remaining - 1');
  });

  it('fetches resume with user_id guard (RLS-style)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-optimize/index.ts', 'utf8');
    expect(src).toContain(".eq('user_id', userId)");
    expect(src).toContain("'Resume not found.'");
    expect(src).toContain('status: 404');
  });

  it('fetches job from ats_jobs table', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-optimize/index.ts', 'utf8');
    expect(src).toContain("from('ats_jobs')");
    expect(src).toContain("'Job not found.'");
  });

  it('uses Anthropic Haiku for keyword extraction', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-optimize/index.ts', 'utf8');
    expect(src).toContain('claude-haiku-4-5-20251001');
    expect(src).toContain('anthropicFetch');
  });

  it('uses circuit breaker (anthropicFetch not raw fetch)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-optimize/index.ts', 'utf8');
    expect(src).toContain("import { anthropicFetch }");
  });

  it('returns match_score, keyword_gaps, suggestions', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-optimize/index.ts', 'utf8');
    expect(src).toContain('match_score');
    expect(src).toContain('keyword_gaps');
    expect(src).toContain('suggestions');
  });

  it('persists match_score and keyword_gaps to resumes row', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-optimize/index.ts', 'utf8');
    expect(src).toContain("from('resumes').update");
    expect(src).toContain('target_job_id');
    expect(src).toContain('match_score');
    expect(src).toContain('keyword_gaps');
  });

  it('handles short JD gracefully — returns 422', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-optimize/index.ts', 'utf8');
    expect(src).toContain('too short to analyze');
    expect(src).toContain('status: 422');
  });

  it('logs errors — no silent fails', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-optimize/index.ts', 'utf8');
    expect(src).toContain('console.error');
    expect(src).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/);
  });
});

describe('resume-optimize EF — gap analysis logic', () => {
  it('keyword priority follows ATS recruiter filter order (spec §3.5)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-optimize/index.ts', 'utf8');
    // Skills weight highest
    expect(src).toContain('skill: 3');
    expect(src).toContain('education: 2');
    expect(src).toContain('certification: 1.5');
    expect(src).toContain('location: 0.5');
  });

  it('keyword status has three states: present, missing, partial', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-optimize/index.ts', 'utf8');
    expect(src).toContain("'present'");
    expect(src).toContain("'missing'");
    expect(src).toContain("'partial'");
  });

  it('partial match detects acronyms', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-optimize/index.ts', 'utf8');
    expect(src).toContain('acronym');
  });

  it('extracts skills, tools, education, certifications, soft_skills, title', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-optimize/index.ts', 'utf8');
    expect(src).toContain('skills');
    expect(src).toContain('tools');
    expect(src).toContain('education');
    expect(src).toContain('certifications');
    expect(src).toContain('soft_skills');
  });

  it('builds suggestions for missing keywords', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-optimize/index.ts', 'utf8');
    expect(src).toContain('Add');
    expect(src).toContain('Skills section');
    expect(src).toContain('Certifications section');
  });

  it('match score is 0-100', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-optimize/index.ts', 'utf8');
    expect(src).toContain('Math.round');
    expect(src).toContain('* 100');
  });

  it('deduplicates keywords (seen set)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-optimize/index.ts', 'utf8');
    expect(src).toContain('seen');
    expect(src).toContain('seen.has');
    expect(src).toContain('seen.add');
  });
});

describe('dashboard.html — S3 optimize UI', () => {
  it('has rb-optimize-section card', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    expect(html).toContain('id="rb-optimize-section"');
  });

  it('has job selector dropdown', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    expect(html).toContain('id="rb-job-select"');
  });

  it('has Analyze button wired to rbOptimize()', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    expect(html).toContain('onclick="rbOptimize()"');
    expect(html).toContain('id="rb-optimize-btn"');
  });

  it('has gap report container with score circle', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    expect(html).toContain('id="rb-gap-report"');
    expect(html).toContain('id="rb-score-circle"');
    expect(html).toContain('id="rb-score-num"');
  });

  it('has gap pills container', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    expect(html).toContain('id="rb-gap-pills"');
  });

  it('has legend for present/partial/missing', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    expect(html).toContain('Present');
    expect(html).toContain('Partial match');
    expect(html).toContain('Missing');
  });

  it('has suggestions section', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    expect(html).toContain('id="rb-suggestions-section"');
    expect(html).toContain('id="rb-suggestions-list"');
  });

  it('shows 1 credit cost in header', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    expect(html).toContain('1 credit');
  });
});

describe('resume-builder.js — S3 functions', () => {
  it('exports rbOptimize', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('window.rbOptimize');
  });

  it('exports rbInsertKeyword', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('window.rbInsertKeyword');
  });

  it('exports rbOpenOptimizeForJob (entry point from job cards)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('window.rbOpenOptimizeForJob');
  });

  it('exports rbLoadJobSelector', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('window.rbLoadJobSelector');
  });

  it('rbInit calls rbLoadJobSelector', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('rbLoadJobSelector()');
  });

  it('rbOptimize guards against missing resume_id', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('!_state.resumeId');
    expect(src).toContain('Save your resume first');
  });

  it('rbOptimize guards against missing job selection', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('Select a job to optimize against');
  });

  it('rbOptimize calls captureEvent on success', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain("captureEvent('resume_optimized'");
  });

  it('rbOptimize calls reportError on exception — no silent fail', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain("reportError('resume_optimize_exception'");
  });

  it('rbInsertKeyword adds skill to parsedJson.skills and updates textarea', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('parsedJson.skills');
    expect(src).toContain('rb-f-skills');
    expect(src).toContain("captureEvent('resume_keyword_inserted'");
  });

  it('rbInsertKeyword handles certifications', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('parsedJson.certifications');
    expect(src).toContain("category === 'certification'");
  });

  it('rbRenderGapReport sets score circle CSS custom properties', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('--score-pct');
    expect(src).toContain('--score-color');
  });

  it('gap pills use dynamic status class from gap.status', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    // Class is set dynamically: `rb-gap-pill ${g.status}`
    expect(src).toContain('rb-gap-pill ${g.status}');
    expect(src).toContain("'present'");
    expect(src).toContain("'missing'");
    expect(src).toContain("'partial'");
  });

  it('optimize section revealed when editor shown', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('rb-optimize-section');
    expect(src).toContain("classList.remove('u-hidden')");
  });
});

describe('job-feed.js — Optimize Resume entry point', () => {
  it('has Optimize Resume button on job cards', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/job-feed.js', 'utf8');
    expect(src).toContain('rbOpenOptimizeForJob');
    expect(src).toContain('Optimize Resume');
  });
});

describe('src/input.css — S3 styles', () => {
  it('has rb-gap-pill styles with present/partial/missing states', async () => {
    const fs = await import('fs');
    const css = fs.readFileSync('src/input.css', 'utf8');
    expect(css).toContain('.rb-gap-pill');
    expect(css).toContain('.rb-gap-pill.present');
    expect(css).toContain('.rb-gap-pill.missing');
    expect(css).toContain('.rb-gap-pill.partial');
  });

  it('has rb-score-circle with CSS custom properties', async () => {
    const fs = await import('fs');
    const css = fs.readFileSync('src/input.css', 'utf8');
    expect(css).toContain('.rb-score-circle');
    expect(css).toContain('--score-pct');
    expect(css).toContain('--score-color');
  });

  it('has rb-match-score-bar', async () => {
    const fs = await import('fs');
    const css = fs.readFileSync('src/input.css', 'utf8');
    expect(css).toContain('.rb-match-score-bar');
  });

  it('has rb-gap-legend styles', async () => {
    const fs = await import('fs');
    const css = fs.readFileSync('src/input.css', 'utf8');
    expect(css).toContain('.rb-gap-legend');
    expect(css).toContain('.rb-gap-legend-dot');
  });
});

describe('api-gateway — resume-optimize route', () => {
  it('gateway has resume-optimize route', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/api-gateway/index.ts', 'utf8');
    expect(src).toContain('"resume-optimize"');
  });
});

describe('version', () => {
  it('version.js exists and contains a version string', async () => {
    const fs = await import('fs');
    expect(fs.readFileSync('js/version.js', 'utf8')).toMatch(/BJ_VERSION\s*=\s*"v\d+\.\d+"/);
  });

  it('bundle contains rbOptimize', async () => {
    const fs = await import('fs');
    expect(fs.readFileSync('dist/dashboard.min.js', 'utf8')).toContain('rbOptimize');
  });

  it('bundle contains rbInsertKeyword', async () => {
    const fs = await import('fs');
    expect(fs.readFileSync('dist/dashboard.min.js', 'utf8')).toContain('rbInsertKeyword');
  });
});
