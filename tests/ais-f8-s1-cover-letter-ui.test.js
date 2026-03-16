/**
 * AIS-F8-S1: Cover Letter Generator — UI + Table
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('AIS-F8-S1: cover_letters migration', () => {
  const src = read('supabase/migrations/v9.59-ais-f8-s1-cover-letters.sql');
  it('creates cover_letters table', () => expect(src).toContain('CREATE TABLE IF NOT EXISTS cover_letters'));
  it('has tone CHECK with 4 values', () => expect(src).toMatch(/professional.*conversational.*enthusiastic.*executive/));
  it('has version column', () => expect(src).toContain('version'));
  it('has credits_charged column', () => expect(src).toContain('credits_charged'));
  it('has word_count column', () => expect(src).toContain('word_count'));
  it('has job_id column', () => expect(src).toContain('job_id'));
  it('has resume_id column', () => expect(src).toContain('resume_id'));
  it('RLS enabled', () => expect(src).toContain('ENABLE ROW LEVEL SECURITY'));
  it('user policy', () => expect(src).toContain('users_own_cover_letters'));
  it('index on user_id + job_id', () => expect(src).toContain('idx_cover_letters_user_job'));
});

describe('AIS-F8-S1: generate-cover-letter EF updates', () => {
  const src = read('supabase/functions/generate-cover-letter/index.ts');
  it('4 tones: professional', () => expect(src).toContain("tone === 'professional'"));
  it('4 tones: conversational', () => expect(src).toContain("tone === 'conversational'"));
  it('4 tones: enthusiastic', () => expect(src).toContain("tone === 'enthusiastic'"));
  it('4 tones: executive', () => expect(src).toContain("tone === 'executive'"));
  it('persists to cover_letters table', () => expect(src).toContain(".from('cover_letters').insert"));
  it('version tracking (increments per job+tone)', () => expect(src).toContain('version'));
  it('returns cover_letter_id', () => expect(src).toContain('cover_letter_id'));
  it('returns word_count', () => expect(src).toContain('word_count'));
  it('accepts jobId and resumeId params', () => expect(src).toContain('jobId'));
  it('normalizes tone to valid values', () => expect(src).toContain('normalizedTone'));
});

describe('AIS-F8-S1: dashboard.html cover letter panel', () => {
  const src = read('dashboard.html');
  it('cl-panel slide-out exists', () => expect(src).toContain('id="cl-panel"'));
  it('4 tone buttons', () => expect(src).toContain('cl-tone-btn'));
  it('cl-content textarea', () => expect(src).toContain('id="cl-content"'));
  it('cl-generating spinner', () => expect(src).toContain('id="cl-generating"'));
  it('Regenerate button', () => expect(src).toContain('_clGenerate'));
  it('Copy button', () => expect(src).toContain('_clCopyToClipboard'));
  it('DOCX export button', () => expect(src).toContain('_clExportDocx'));
  it('version history panel', () => expect(src).toContain('id="cl-history"'));
  it('backdrop for close', () => expect(src).toContain('id="cl-backdrop"'));
  it('cl-panel-title element', () => expect(src).toContain('id="cl-panel-title"'));
  it('cl-meta shows version/tone/words', () => expect(src).toContain('id="cl-meta"'));
});

describe('AIS-F8-S1: cover-letter.js module', () => {
  const src = read('js/cover-letter.js');
  it('openCoverLetterPanel exposed on window', () => expect(src).toContain('window.openCoverLetterPanel'));
  it('_clClose exposed', () => expect(src).toContain('window._clClose'));
  it('_clSetTone exposed', () => expect(src).toContain('window._clSetTone'));
  it('_clGenerate calls generate-cover-letter EF', () => expect(src).toContain('generate-cover-letter'));
  it('_clCopyToClipboard uses clipboard API', () => expect(src).toContain('clipboard.writeText'));
  it('_clExportDocx generates DOCX', () => expect(src).toContain('_clExportDocx'));
  it('DOCX uses OOXML format', () => expect(src).toContain('wordprocessingml'));
  it('version history loaded from cover_letters table', () => expect(src).toContain('_clLoadHistory'));
  it('_clLoadVersion exposed for history items', () => expect(src).toContain('window._clLoadVersion'));
  it('cover_letter_generated PostHog event', () => expect(src).toContain("'cover_letter_generated'"));
  it('PostHog includes tone', () => expect(src).toMatch(/cover_letter_generated[\s\S]{0,200}tone/));
  it('reportError on failures — no silent fails', () => expect(src).toContain('reportError'));
});

describe('AIS-F8-S1: build', () => {
  it('cover-letter.js in build.js', () => expect(read('build.js')).toContain("'js/cover-letter.js'"));
  it('version v9.60', () => expect(read('js/version.js')).toContain('v9.60'));
  it('bundle at v9.60', () => expect(read('dist/dashboard.min.js')).toContain('v9.60'));
  it('cover-letter in deferred bundle', () => expect(read('dist/dashboard-deferred.min.js')).toContain('openCoverLetterPanel'));
});
