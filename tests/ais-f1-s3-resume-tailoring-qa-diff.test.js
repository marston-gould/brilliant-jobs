/**
 * AIS-F1-S3: Resume Tailoring — Q&A Panel + Diff UI
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('AIS-F1-S3: rewrite.js Q&A panel', () => {
  const src = read('js/rewrite.js');
  it('Q&A phase 2 exists', () => expect(src).toContain('PHASE 2: Q&A'));
  it('skip question button present', () => expect(src).toContain('_rwSkipQuestion'));
  it('Q&A answers collected', () => expect(src).toContain('answers[q.id]'));
  it('progress through questions', () => expect(src).toContain('rw-skipped'));
});

describe('AIS-F1-S3: rewrite.js diff UI', () => {
  const src = read('js/rewrite.js');
  it('side-by-side diff rendered', () => expect(src).toContain('rw-diff-cols'));
  it('diff shows original column', () => expect(src).toContain('rw-diff-original'));
  it('diff shows rewritten column', () => expect(src).toContain('rw-diff-rewritten'));
  it('modified sections highlighted', () => expect(src).toContain('rw-diff-changed'));
  it('cherry-pick per section', () => expect(src).toContain('rw-cherry-pick'));
  it('toggle section include/exclude', () => expect(src).toContain('_rwToggleSection'));
});

describe('AIS-F1-S3: rewrite.js accept/reject + DOCX', () => {
  const src = read('js/rewrite.js');
  it('_rwAcceptAll exists', () => expect(src).toContain('_rwAcceptAll'));
  it('DOCX download wired', () => expect(src).toContain('.docx'));
  it('fallback plain text download on no DOCX lib', () => expect(src).toContain('_rwDownloadText'));
  it('rewrite panel in dashboard.html', () => expect(read('dashboard.html')).toContain('id="rewrite-panel"'));
  it('rewrite.js in build.js', () => expect(read('build.js')).toContain("'js/rewrite.js'"));
});

describe('AIS-F1-S3: version', () => {
  it('version is v9.64', () => expect(read('js/version.js')).toContain('v9.64'));
});
