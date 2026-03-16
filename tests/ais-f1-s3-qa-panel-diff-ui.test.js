/** AIS-F1-S3: Resume Tailoring — Q&A Panel + Diff UI */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');
describe('AIS-F1-S3: rewrite.js Q&A panel + diff UI', () => {
  const src = read('js/rewrite.js');
  it('Q&A phase exists', () => expect(src).toContain('PHASE 2: Q&A'));
  it('question skip support', () => expect(src).toContain('rw-skipped'));
  it('questions stored in state', () => expect(src).toContain('questions: []'));
  it('answers collected per question', () => expect(src).toContain('answers[q.id]'));
  it('cherry-pick section toggle', () => expect(src).toContain('rw-cherry-pick'));
  it('cherry-pick checkbox per section', () => expect(src).toContain('_rwToggleSection'));
  it('accept-all button', () => expect(src).toContain("Accept All"));
  it('DOCX download', () => expect(src).toContain('.docx'));
  it('DOCX builder function', () => expect(src).toContain('docx.Paragraph'));
  it('diff color coding (green/warm/red)', () => expect(src).toContain('var(--green)') && expect(src).toContain('var(--warm)') && expect(src).toContain('var(--red)'));
  it('score display after rewrite', () => expect(src).toContain('new_score'));
  it('reportError on failures', () => expect(src).toContain('reportError'));
  it('progress states tracked in _rwState.status', () => expect(src).toContain("_rwState.status = 'questions'"));
  it('rewrite panel in dashboard.html', () => expect(read('dashboard.html')).toContain('id="rewrite-panel"'));
  it('rewrite.js in build.js', () => expect(read('build.js')).toContain("'js/rewrite.js'"));
});
describe('AIS-F1-S3: version', () => {
  it('version is v9.62', () => expect(read('js/version.js')).toContain('v9.62'));
});
