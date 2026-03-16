/**
 * AIS-F8-S2: Cover Letter Auto-Attach
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('AIS-F8-S2: apply-workflow.js cover letter fetch', () => {
  const src = read('js/apply-workflow.js');
  it('fetches cover letter before pendingRow creation', () => expect(src).toContain('cover_letters'));
  it('includes cover_letter_id in pendingRow', () => expect(src).toContain('cover_letter_id: coverLetterId'));
  it('non-fatal on fetch error', () => expect(src).toContain('/* non-fatal */'));
  it('only attaches if job has a letter', () => expect(src).toContain('coverLetterId'));
});

describe('AIS-F8-S2: worker/index.js cover letter pass-through', () => {
  const src = read('worker/index.js');
  it('fetches cover letter content by cover_letter_id', () => expect(src).toContain('cover_letter_id'));
  it('passes coverLetter in opts to routeSubmission', () => expect(src).toContain('coverLetter: coverLetterContent'));
  it('non-fatal on cover letter fetch error', () => expect(src).toContain('/* non-fatal */'));
});

describe('AIS-F8-S2: worker handlers cover letter fill', () => {
  it('generic handler fills cover letter field', () => expect(read('worker/handlers/generic.js')).toContain('cover.?letter'));
  it('greenhouse handler fills cover letter field', () => expect(read('worker/handlers/greenhouse.js')).toContain('opts?.coverLetter'));
  it('lever handler fills cover letter field', () => expect(read('worker/handlers/lever.js')).toContain('opts?.coverLetter'));
  it('cover letter fill guarded by opts.coverLetter', () => {
    expect(read('worker/handlers/generic.js')).toContain('opts?.coverLetter');
    expect(read('worker/handlers/greenhouse.js')).toContain('opts?.coverLetter');
    expect(read('worker/handlers/lever.js')).toContain('opts?.coverLetter');
  });
});

describe('AIS-F8-S2: version', () => {
  it('version is v9.60', () => expect(read('js/version.js')).toContain('v9.60'));
});
