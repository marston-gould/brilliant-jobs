/**
 * LP-RESTRUCTURE-S3 validation tests
 * Landing Page Restructure Session 3: Admin Page + Social Proof
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';

// ── 1. admin-landing.js ───────────────────────────────────────────────────────
describe('admin-landing.js', () => {
  const js = fs.readFileSync('js/admin-landing.js', 'utf8');

  it('file exists', () => {
    expect(fs.existsSync('js/admin-landing.js')).toBe(true);
  });

  it('alInit exported to window', () => {
    expect(js).toContain('window.alInit');
  });

  it('loads sections from landing_sections table', () => {
    expect(js).toContain("from('landing_sections')");
    expect(js).toContain('sort_order');
    expect(js).toContain('archived_at');
  });

  it('toggle visibility — alToggleVisible exported', () => {
    expect(js).toContain('window.alToggleVisible');
    expect(js).toContain('is_visible');
  });

  it('drag-to-reorder — alReorder implemented', () => {
    expect(js).toContain('alReorder');
    expect(js).toContain('dragstart');
    expect(js).toContain('drop');
    expect(js).toContain('sort_order');
  });

  it('batch updates sort_order on reorder', () => {
    expect(js).toContain('Promise.all');
    expect(js).toContain('sort_order: s.sort_order');
  });

  it('open/close modal — alOpenModal and alCloseModal exported', () => {
    expect(js).toContain('window.alOpenModal');
    expect(js).toContain('window.alCloseModal');
  });

  it('modal has all required fields', () => {
    expect(js).toContain('al-f-subtitle');
    expect(js).toContain('al-f-title');
    expect(js).toContain('al-f-body');
    expect(js).toContain('al-f-cta-text');
    expect(js).toContain('al-f-cta-url');
    expect(js).toContain('al-f-orientation');
    expect(js).toContain('al-f-segment');
    expect(js).toContain('al-f-img');
  });

  it('alSaveSection handles both INSERT (new) and UPDATE (edit)', () => {
    expect(js).toContain('window.alSaveSection');
    expect(js).toContain('_editingId');
    expect(js).toContain('.insert(');
    expect(js).toContain('.update(');
  });

  it('new sections created as draft (is_visible: false)', () => {
    expect(js).toContain('is_visible: false');
  });

  it('image upload to landing-assets bucket', () => {
    expect(js).toContain('alUploadImage');
    expect(js).toContain("from('landing-assets')");
    expect(js).toContain('.upload(');
    expect(js).toContain('getPublicUrl');
  });

  it('image upload enforces 5MB limit', () => {
    expect(js).toContain('5 * 1024 * 1024');
  });

  it('soft delete — alSoftDelete sets archived_at', () => {
    expect(js).toContain('window.alSoftDelete');
    expect(js).toContain('archived_at');
    expect(js).toContain('confirm(');
  });

  it('all errors reported via reportError — no silent failures', () => {
    expect(js).toContain("reportError('admin_landing:load'");
    expect(js).toContain("reportError('admin_landing:save'");
    expect(js).toContain("reportError('admin_landing:upload'");
    expect(js).toContain("reportError('admin_landing:delete'");
  });

  it('fires PostHog events', () => {
    expect(js).toContain('captureEvent');
    expect(js).toContain('al_toggle_visibility');
    expect(js).toContain('al_save_section');
    expect(js).toContain('al_image_upload');
  });

  it('escapes HTML output — XSS prevention', () => {
    expect(js).toContain('escHtml');
  });
});

// ── 2. build-admin.js includes admin-landing.js ───────────────────────────────
describe('build-admin.js', () => {
  const build = fs.readFileSync('build-admin.js', 'utf8');

  it('admin-landing.js in admin bundle', () => {
    expect(build).toContain('admin-landing.js');
  });
});

// ── 3. dashboard.html admin page ─────────────────────────────────────────────
describe('dashboard.html admin landing page', () => {
  const html = fs.readFileSync('dashboard.html', 'utf8');

  it('page-admin-landing div exists', () => {
    expect(html).toContain('id="page-admin-landing"');
  });

  it('page has add section button', () => {
    expect(html).toContain('id="al-add-btn"');
  });

  it('page has preview button opening ?preview=true', () => {
    expect(html).toContain('preview=true');
    expect(html).toContain('id="al-preview-btn"');
  });

  it('modal overlay exists', () => {
    expect(html).toContain('id="al-modal-overlay"');
    expect(html).toContain('id="al-modal"');
  });

  it('modal has all required form fields', () => {
    expect(html).toContain('id="al-f-title"');
    expect(html).toContain('id="al-f-subtitle"');
    expect(html).toContain('id="al-f-body"');
    expect(html).toContain('id="al-f-orientation"');
    expect(html).toContain('id="al-f-segment"');
    expect(html).toContain('id="al-f-img"');
  });

  it('orientation dropdown has auto/image-left/image-right options', () => {
    expect(html).toContain('value="auto"');
    expect(html).toContain('value="image-right"');
    expect(html).toContain('value="image-left"');
  });

  it('segment dropdown has all/new/returning/lapsed options', () => {
    expect(html).toContain('value="all"');
    expect(html).toContain('value="new"');
    expect(html).toContain('value="returning"');
    expect(html).toContain('value="lapsed"');
  });

  it('admin-only nav link hidden by default (display:none)', () => {
    expect(html).toContain('id="nav-admin-landing"');
    expect(html).toContain('display:none');
  });
});

// ── 4. app.js wiring ─────────────────────────────────────────────────────────
describe('app.js admin-landing wiring', () => {
  const js = fs.readFileSync('js/app.js', 'utf8');

  it('admin-landing in page titles map', () => {
    expect(js).toContain("'admin-landing': 'Landing Page'");
  });

  it('admin-landing in page sections map', () => {
    expect(js).toContain("'admin-landing': 'intelligence'");
  });

  it('alInit called on tab switch to admin-landing', () => {
    expect(js).toContain("_tab === 'admin-landing'");
    expect(js).toContain('alInit()');
  });

  it('nav-admin-landing shown for admin users', () => {
    expect(js).toContain('nav-admin-landing');
    expect(js).toContain('navAdminLanding.style.display');
  });
});

// ── 5. Social proof bar ───────────────────────────────────────────────────────
describe('index.html social proof bar', () => {
  const html = fs.readFileSync('index.html', 'utf8');

  it('social-proof-bar exists', () => {
    expect(html).toContain('id="social-proof-bar"');
  });

  it('shows career pages count via data-stat=total-pages', () => {
    const barSection = html.substring(html.indexOf('id="social-proof-bar"'), html.indexOf('id="social-proof-bar"') + 600);
    expect(barSection).toContain('data-stat="total-pages"');
  });

  it('shows active jobs via lp-active-jobs-sp', () => {
    expect(html).toContain('id="lp-active-jobs-sp"');
  });

  it('shows companies hiring via lp-companies-hiring-sp', () => {
    expect(html).toContain('id="lp-companies-hiring-sp"');
  });

  it('60+ ATS platforms copy present', () => {
    expect(html).toContain('60+ ATS platforms');
  });
});

describe('landing-app.js social proof wiring', () => {
  const js = fs.readFileSync('js/landing-app.js', 'utf8');

  it('shows bar immediately (no survey threshold)', () => {
    expect(js).toContain("bar.classList.remove('hidden')");
  });

  it('hydrates lp-active-jobs-sp from stats', () => {
    expect(js).toContain('lp-active-jobs-sp');
  });

  it('hydrates lp-companies-hiring-sp from stats', () => {
    expect(js).toContain('lp-companies-hiring-sp');
  });
});

// ── 6. Version ────────────────────────────────────────────────────────────────
describe('version', () => {
  it('version.js is v9.46', () => {
    expect(fs.readFileSync('js/version.js', 'utf8')).toContain('v9.46');
  });

  it('dist/admin.min.js contains v9.46', () => {
    expect(fs.readFileSync('dist/admin.min.js', 'utf8')).toContain('v9.46');
  });
});
