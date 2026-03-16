/**
 * AIS-F2-S2: LinkedIn Import — Upload UI + Auto-Population
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('AIS-F2-S2: dashboard.html LinkedIn import UI', () => {
  const src = read('dashboard.html');
  it('gs-linkedin-import-step section exists', () => expect(src).toContain('gs-linkedin-import-step'));
  it('drag-and-drop upload zone exists', () => expect(src).toContain('li-import-upload-zone'));
  it('file input for PDF exists', () => expect(src).toContain('li-import-file-input'));
  it('accepts .pdf files only', () => expect(src).toContain('accept=".pdf"'));
  it('parsed profile preview container exists', () => expect(src).toContain('li-import-preview'));
  it('preview shows name', () => expect(src).toContain('li-preview-name'));
  it('preview shows headline', () => expect(src).toContain('li-preview-headline'));
  it('preview shows skills', () => expect(src).toContain('li-preview-skills'));
  it('Save Profile button present', () => expect(src).toContain('_liSaveProfile'));
  it('Cancel button present', () => expect(src).toContain('_liCancelPreview'));
  it('fraud warning container exists', () => expect(src).toContain('li-fraud-warning'));
  it('status display container exists', () => expect(src).toContain('li-import-status'));
  it('imported badge exists', () => expect(src).toContain('li-import-done-badge'));
  it('_liHandleDrop wired to drag zone', () => expect(src).toContain('_liHandleDrop'));
  it('_liHandleFile wired to file input', () => expect(src).toContain('_liHandleFile'));
});

describe('AIS-F2-S2: linkedin-import.js module', () => {
  const src = read('js/linkedin-import.js');
  it('_liHandleDrop exposed on window', () => expect(src).toContain('window._liHandleDrop'));
  it('_liHandleFile exposed on window', () => expect(src).toContain('window._liHandleFile'));
  it('_liSaveProfile exposed on window', () => expect(src).toContain('window._liSaveProfile'));
  it('_liCancelPreview exposed on window', () => expect(src).toContain('window._liCancelPreview'));
  it('calls parse-linkedin-pdf EF upload action', () => expect(src).toContain("action: 'upload'"));
  it('enforces PDF type check', () => expect(src).toContain("application/pdf"));
  it('enforces 10MB limit', () => expect(src).toContain('10 * 1024 * 1024'));
  it('reads file as base64 DataURL', () => expect(src).toContain('readAsDataURL'));
  it('fires linkedin_pdf_uploaded PostHog event', () => expect(src).toContain("'linkedin_pdf_uploaded'"));
  it('PostHog includes parse_success', () => expect(src).toContain('parse_success'));
  it('PostHog includes fields_extracted_count', () => expect(src).toContain('fields_extracted_count'));
  it('auto-populates first name field', () => expect(src).toContain("ap-first-name"));
  it('auto-populates location field', () => expect(src).toContain("ap-location"));
  it('suggests filter keywords from skills', () => expect(src).toContain('addWhatPill'));
  it('infers seniority from experience', () => expect(src).toContain('_inferSeniority'));
  it('seniority inference checks director/vp titles', () => expect(src).toContain('director'));
  it('seniority inference checks senior/lead titles', () => expect(src).toContain('senior'));
  it('calls saveApplicantProfile after save', () => expect(src).toContain('saveApplicantProfile'));
  it('shows imported badge after save', () => expect(src).toContain('li-import-done-badge'));
  it('fraud signals rendered in preview', () => expect(src).toContain('li-fraud-warning'));
  it('error handling with reportError — no silent fails', () => expect(src).toContain('reportError'));
  it('initLinkedInImport exported to window', () => expect(src).toContain('window.initLinkedInImport'));
  it('handles 409 duplicate error gracefully', () => expect(src).toContain('409'));
  it('handles 422 parse failure gracefully', () => expect(src).toContain('422'));
  it('cancel resets file input', () => expect(src).toContain("input.value = ''"));
});

describe('AIS-F2-S2: build.js and app.js wiring', () => {
  it('linkedin-import.js in build.js deferred chunk', () => expect(read('build.js')).toContain("'js/linkedin-import.js'"));
  it('initLinkedInImport called on brilliant tab in app.js', () => expect(read('js/app.js')).toContain('initLinkedInImport'));
});

describe('AIS-F2-S2: version and build', () => {
  it('version is v9.59', () => expect(read('js/version.js')).toContain('v9.59'));
  it('dist bundle at v9.59', () => expect(read('dist/dashboard.min.js')).toContain('v9.59'));
  it('linkedin-import.js in deferred bundle', () => expect(read('dist/dashboard-deferred.min.js')).toContain('_liHandleFile'));
});
