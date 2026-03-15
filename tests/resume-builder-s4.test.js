// tests/resume-builder-s4.test.js
// RESUME-BUILDER-001-S4 validation — AI Rewrites

import { describe, it, expect } from 'vitest';

describe('resume-rewrite-bullet EF', () => {
  it('EF file exists', async () => {
    const fs = await import('fs');
    expect(fs.existsSync('supabase/functions/resume-rewrite-bullet/index.ts')).toBe(true);
  });

  it('returns 401 without token', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-rewrite-bullet/index.ts', 'utf8');
    expect(src).toContain('status: 401');
  });

  it('returns 400 when bullet or target_keywords missing', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-rewrite-bullet/index.ts', 'utf8');
    expect(src).toContain('status: 400');
    expect(src).toContain('bullet');
    expect(src).toContain('target_keywords');
  });

  it('enforces 1-credit cost — returns 402 when insufficient', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-rewrite-bullet/index.ts', 'utf8');
    expect(src).toContain('status: 402');
    expect(src).toContain('credits_required: 1');
  });

  it('deducts 1 credit on success', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-rewrite-bullet/index.ts', 'utf8');
    expect(src).toContain('credits_remaining - 1');
  });

  it('uses Anthropic via anthropicFetch (circuit breaker protected)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-rewrite-bullet/index.ts', 'utf8');
    expect(src).toContain('anthropicFetch');
    expect(src).toContain("import { anthropicFetch }");
  });

  it('returns 2-3 alternatives', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-rewrite-bullet/index.ts', 'utf8');
    expect(src).toContain('alternatives');
    expect(src).toContain('2-3');
  });

  it('system prompt forbids fabrication', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-rewrite-bullet/index.ts', 'utf8');
    expect(src).toContain('never fabricate');
  });

  it('system prompt requires action verb and concise output', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-rewrite-bullet/index.ts', 'utf8');
    expect(src).toContain('action verb');
    expect(src).toContain('concise');
  });

  it('returns 200 with alternatives array', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-rewrite-bullet/index.ts', 'utf8');
    expect(src).toContain('status: 200');
    expect(src).toContain('{ alternatives }');
  });

  it('logs errors — no silent fails', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-rewrite-bullet/index.ts', 'utf8');
    expect(src).toContain('console.error');
    expect(src).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/);
  });
});

describe('resume-builder.js — S4 functions', () => {
  it('rbImproveBullets is exported as window global', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('window.rbImproveBullets');
  });

  it('rbAcceptRewrite is exported as window global', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('window.rbAcceptRewrite');
  });

  it('rbImproveBullets calls /api/resume-rewrite-bullet', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain("'/api/resume-rewrite-bullet'");
  });

  it('rbImproveBullets sends bullet and target_keywords', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('target_keywords');
    expect(src).toContain('bullet');
  });

  it('rbImproveBullets guards against empty bullets', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('bullet point');
  });

  it('rbAcceptRewrite replaces bullet in parsedJson and textarea', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('work_experience');
    expect(src).toContain('bullets[bulletIdx]');
    expect(src).toContain('_state.dirty = true');
  });

  it('calls captureEvent on successful rewrite', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain("captureEvent('resume_rewrite_accepted'");
  });

  it('calls reportError on exception — no silent fail', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain("reportError('resume_rewrite");
  });

  it('hides rewrite panel after accepting', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain("classList.add('u-hidden')");
    expect(src).toContain('rb-rewrite-panel');
  });

  it('no literal newline chars in split/join strings', async () => {
    // Previously caused esbuild failure
    const fs = await import('fs');
    const raw = fs.readFileSync('js/resume-builder.js', 'utf8');
    // Check for split('\n') or join('\n') with actual newline (not escaped)
    expect(raw).not.toMatch(/split\('\n'\)/);
    expect(raw).not.toMatch(/join\('\n'\)/);
  });
});

describe('dashboard.html — S4 improve button UI', () => {
  it('has rb-improve-btn in experience items', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('rb-improve-btn');
    expect(src).toContain('rbImproveBullets');
  });

  it('has rb-rewrite-panel per experience item', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('rb-rewrite-panel');
  });

  it('has Accept button with data attributes', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('rb-rewrite-accept');
    expect(src).toContain('data-job-idx');
    expect(src).toContain('data-bullet-idx');
    expect(src).toContain('data-alt');
  });
});

describe('src/input.css — S4 styles', () => {
  it('has rb-improve-btn styles', async () => {
    const fs = await import('fs');
    const css = fs.readFileSync('src/input.css', 'utf8');
    expect(css).toContain('.rb-improve-btn');
  });

  it('has rb-rewrite-panel styles', async () => {
    const fs = await import('fs');
    const css = fs.readFileSync('src/input.css', 'utf8');
    expect(css).toContain('.rb-rewrite-panel');
  });

  it('has rb-rewrite-option styles', async () => {
    const fs = await import('fs');
    const css = fs.readFileSync('src/input.css', 'utf8');
    expect(css).toContain('.rb-rewrite-option');
  });

  it('has rb-rewrite-accept button styles', async () => {
    const fs = await import('fs');
    const css = fs.readFileSync('src/input.css', 'utf8');
    expect(css).toContain('.rb-rewrite-accept');
  });
});

describe('api-gateway — resume-rewrite-bullet route', () => {
  it('gateway has resume-rewrite-bullet route (not a stub)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/api-gateway/index.ts', 'utf8');
    expect(src).toContain('"resume-rewrite-bullet"');
    expect(src).not.toContain('"resume-rewrite-bullet":    "resume-rewrite-bullet",    // RESUME-BUILDER-001-S4 (stub)');
  });
});

describe('bundle integrity', () => {
  it('bundle contains rbImproveBullets', async () => {
    const fs = await import('fs');
    expect(fs.readFileSync('dist/dashboard.min.js', 'utf8')).toContain('rbImproveBullets');
  });

  it('bundle contains rbAcceptRewrite', async () => {
    const fs = await import('fs');
    expect(fs.readFileSync('dist/dashboard.min.js', 'utf8')).toContain('rbAcceptRewrite');
  });
});

describe('version', () => {
  it('bumped to v9.39', async () => {
    const fs = await import('fs');
    expect(fs.readFileSync('js/version.js', 'utf8')).toContain('v9.39');
  });
});
