/**
 * SPA-CUT-1: Bridge Elimination Tests
 * Verifies Feed, Pipeline, Keywords hooks cut from legacy window.* bridge.
 * Session: SPA-CUT-1 | Version: v10.38 → v10.39
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf-8');
const exists = (f) => existsSync(join(ROOT, f));

const LIB = 'src/app/lib/supabase.ts';
const PROV = 'src/app/providers/supabase.ts';
const FEED = 'src/app/pages/dashboard/feed/hooks/useFeedSearch.ts';
const PIPE = 'src/app/pages/dashboard/pipeline/hooks/usePipeline.ts';
const KEYS = 'src/app/pages/dashboard/keywords/hooks/useKeywords.ts';

function codeOnly(src) {
  return src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
}

// ── 1. Standalone Supabase Client ────────────────────────────

describe('1. Standalone Supabase Client', () => {
  const src = read(LIB);
  it('1.01 File exists', () => expect(exists(LIB)).toBe(true));
  it('1.02 Uses createClient', () => expect(src).toContain('createClient'));
  it('1.03 No window.BJ in code', () => expect(codeOnly(src)).not.toContain('window.BJ'));
  it('1.04 Exports supabase', () => expect(src).toMatch(/export\s+(const|let)\s+supabase/));
  it('1.05 Exports getSession', () => expect(src).toContain('export async function getSession'));
  it('1.06 Exports getUser', () => expect(src).toContain('export async function getUser'));
  it('1.07 Exports getAccessToken', () => expect(src).toContain('export async function getAccessToken'));
  it('1.08 Exports callGateway', () => expect(src).toContain('export async function callGateway'));
  it('1.09 Exports isFeatureEnabled', () => expect(src).toContain('export async function isFeatureEnabled'));
  it('1.10 Exports safeReadLS', () => expect(src).toContain('export function safeReadLS'));
  it('1.11 Exports safeWriteLS', () => expect(src).toContain('export function safeWriteLS'));
  it('1.12 Correct project ref', () => expect(src).toContain('qojhagupdnbtomfoxnsf'));
  it('1.13 Handles enc: prefix', () => expect(src).toContain('enc:'));
  it('1.14 GATEWAY_URL', () => expect(src).toContain('/functions/v1/api-gateway'));
});

// ── 2. Path Aliases ──────────────────────────────────────────

describe('2. Path Aliases', () => {
  it('2.1 Vite @lib alias', () => expect(read('vite.config.js')).toContain("'@lib'"));
  it('2.2 tsconfig @lib/*', () => expect(read('tsconfig.json')).toContain('"@lib/*"'));
});

// ── 3. Provider Standalone ───────────────────────────────────

describe('3. Provider', () => {
  const src = read(PROV);
  it('3.1 Imports @lib/supabase', () => expect(src).toContain("from '@lib/supabase'"));
  it('3.2 No window.BJ bridge', () => expect(codeOnly(src)).not.toMatch(/\(window\s+as\s+any\)\.BJ/));
});

// ── 4. Feed Hook Cut ─────────────────────────────────────────

describe('4. Feed Hook', () => {
  const src = read(FEED);
  const code = codeOnly(src);
  it('4.01 Imports @lib/supabase', () => expect(src).toContain("from '@lib/supabase'"));
  it('4.02 Zero (window as any)', () => expect(code).not.toContain('window as any'));
  it('4.03 Zero win()', () => expect(code).not.toMatch(/\bwin\(\)\./));
  it('4.04 savedJobIds from LS', () => expect(src).toContain("safeReadLS<string[]>('bj_saved_jobs'"));
  it('4.05 appliedJobIds from LS', () => expect(src).toContain("safeReadLS<string[]>('bj_applied_jobs'"));
  it('4.06 hiddenJobIds from LS', () => expect(src).toContain("safeReadLS<any[]>('bj_hidden_jobs'"));
  it('4.07 savedFilters from LS', () => expect(src).toContain("safeReadLS<SavedFilter[]>('bj_saved_filters'"));
  it('4.08 Module fraud cache', () => expect(src).toContain('const _fraudCache:'));
  it('4.09 Module AI cache', () => expect(src).toContain('const _aiJdCacheLocal:'));
  it('4.10 Standalone feature flags', () => expect(src).toContain('_isFlagEnabled'));
  it('4.11 saveJob direct Supabase', () => expect(src).toContain("from('user_pipeline').upsert"));
  it('4.12 unsaveJob direct delete', () => expect(src).toContain("from('user_pipeline').delete()"));
  it('4.13 hideJob writes LS', () => expect(src).toContain("localStorage.setItem('bj_hidden_jobs'"));
  it('4.14 markApplied writes LS', () => expect(src).toContain("localStorage.setItem('bj_applied_jobs'"));
});

// ── 5. Pipeline Hook Cut ─────────────────────────────────────

describe('5. Pipeline Hook', () => {
  const src = read(PIPE);
  const code = codeOnly(src);
  it('5.01 Imports @lib/supabase', () => expect(src).toContain("from '@lib/supabase'"));
  it('5.02 Zero win() in code', () => expect(code).not.toMatch(/\bwin\(\)\./));
  it('5.03 No function win()', () => expect(src).not.toMatch(/function win\(\)/));
  it('5.04 Loads user_pipeline', () => expect(src).toContain("from('user_pipeline')"));
  it('5.05 Loads pipeline_signals', () => expect(src).toContain("from('pipeline_signals')"));
  it('5.06 moveStage updates DB', () => expect(src).toMatch(/from\('user_pipeline'\)\.update/));
  it('5.07 confirmSignal updates DB', () => expect(src).toMatch(/from\('pipeline_signals'\)\.update/));
  it('5.08 unsave deletes from DB', () => expect(src).toMatch(/from\('user_pipeline'\)\.delete\(\)/));
  it('5.09 Module pipeline cache', () => expect(src).toContain('let _pipelineCache:'));
  it('5.10 Module signals cache', () => expect(src).toContain('let _pendingSignalsCache:'));
  it('5.11 Async getUserId', () => expect(src).toContain('async function getUserId'));
  it('5.12 PipelineMeta timestamps', () => {
    expect(src).toContain('interviewAt?:');
    expect(src).toContain('offerAt?:');
    expect(src).toContain('hiredAt?:');
  });
});

// ── 6. Keywords Hook Cut ─────────────────────────────────────

describe('6. Keywords Hook', () => {
  const src = read(KEYS);
  const code = codeOnly(src);
  it('6.1 Imports @lib/supabase', () => expect(src).toContain("from '@lib/supabase'"));
  it('6.2 Zero window refs', () => {
    expect(code).not.toContain('window as any');
    expect(code).not.toMatch(/\bwin\(\)\./);
  });
  it('6.3 No function win()', () => expect(src).not.toMatch(/function win\(\)/));
  it('6.4 Resumes from LS', () => expect(src).toContain("safeReadLS<any[]>('bj_resumes'"));
  it('6.5 Readiness from LS', () => expect(src).toContain("'bj_readiness'"));
  it('6.6 callGateway for scoring', () => {
    expect(src).toContain('callGateway');
    expect(src).toContain("'score-resume'");
  });
  it('6.7 Persists readiness to LS', () => expect(src).toContain("safeWriteLS('bj_readiness'"));
});

// ── 7. Build Output ──────────────────────────────────────────

describe('7. SPA Build', () => {
  it('7.1 dist/spa exists', () => expect(exists('dist/spa')).toBe(true));
  it('7.2 FeedPage chunk', () => {
    const f = readdirSync(join(ROOT, 'dist/spa/assets'));
    expect(f.some(x => x.startsWith('FeedPage'))).toBe(true);
  });
  it('7.3 PipelinePage chunk', () => {
    const f = readdirSync(join(ROOT, 'dist/spa/assets'));
    expect(f.some(x => x.startsWith('PipelinePage'))).toBe(true);
  });
  it('7.4 KeywordsPage chunk', () => {
    const f = readdirSync(join(ROOT, 'dist/spa/assets'));
    expect(f.some(x => x.startsWith('KeywordsPage'))).toBe(true);
  });
  it('7.5 providers chunk', () => {
    const f = readdirSync(join(ROOT, 'dist/spa/assets'));
    expect(f.some(x => x.startsWith('providers'))).toBe(true);
  });
});

// ── 8. File Inventory ────────────────────────────────────────

describe('8. File Inventory', () => {
  [LIB, PROV, FEED, PIPE, KEYS].forEach(f => {
    it(f.split('/').pop() + ' exists', () => expect(exists(f)).toBe(true));
  });
});
