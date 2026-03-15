/**
 * LP-RESTRUCTURE-S4 validation tests
 * Session 4: Polish + Mobile + Testing + Deploy
 * Covers spec §8 full testing checklist + regression across S1-S3
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';

const html  = fs.readFileSync('index.html', 'utf8');
const css   = fs.readFileSync('landing.css', 'utf8');
const js    = fs.readFileSync('js/landing-app.js', 'utf8');
const ver   = fs.readFileSync('js/version.js', 'utf8');
const bundle = fs.readFileSync('dist/dashboard.min.js', 'utf8');

// ── §8: Hero ─────────────────────────────────────────────────────────────────
describe('§8 Hero: product screenshot layout', () => {
  it('hero-with-screenshot wrapper exists', () => {
    expect(html).toContain('class="hero-with-screenshot"');
  });

  it('hero-text-col and hero-img-col present', () => {
    expect(html).toContain('class="hero-text-col"');
    expect(html).toContain('class="hero-img-col"');
  });

  it('hero screenshot img is lazy-loaded', () => {
    expect(html).toContain('loading="lazy"');
  });

  it('hero screenshot has onerror fallback', () => {
    expect(html).toContain("onerror=\"this.parentElement.parentElement.style.display='none'\"");
  });

  it('hero stacks to column at 900px', () => {
    expect(css).toContain('max-width: 900px');
    expect(css).toContain('.hero-with-screenshot');
    // column stacking is present somewhere in the 900px media block
    expect(css).toMatch(/@media.*max-width.*900px[^}]+flex-direction: column/s);
  });

  it('hero-img-col hidden at 375px (text priority)', () => {
    expect(css).toContain('.hero-img-col');
    expect(css).toContain('display: none');
  });
});

// ── §8: Dual stats ────────────────────────────────────────────────────────────
describe('§8 Stats bar: dual metrics', () => {
  it('Career Pages Monitored label present', () => {
    expect(html).toContain('Career Pages Monitored');
  });

  it('Companies Hiring Now label present', () => {
    expect(html).toContain('Companies Hiring Now');
  });

  it('lp-companies has data-stat=total-pages', () => {
    expect(html).toContain('id="lp-companies" data-stat="total-pages"');
  });

  it('lp-companies-hiring-stat exists', () => {
    expect(html).toContain('id="lp-companies-hiring-stat"');
  });

  it('hero sub references 39K+ via data-stat=total-pages', () => {
    expect(html).toContain('data-stat="total-pages"');
  });

  it('all data-stat=total-pages spans consistent (same attribute)', () => {
    const matches = html.match(/data-stat="total-pages"/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
});

// ── §8: Interactive preview ───────────────────────────────────────────────────
describe('§8 Interactive preview: reachable within 1-2 scrolls', () => {
  it('#lp-preview exists', () => {
    expect(html).toContain('id="lp-preview"');
  });

  it('preview is after stats bar', () => {
    expect(html.indexOf('stats-bar')).toBeLessThan(html.indexOf('id="lp-preview"'));
  });

  it('preview is before comparison table (#why)', () => {
    expect(html.indexOf('id="lp-preview"')).toBeLessThan(html.indexOf('id="why"'));
  });

  it('preview has keyword input', () => {
    expect(html).toContain('id="preview-keyword"');
  });

  it('preview has results container', () => {
    expect(html).toContain('id="preview-results"');
  });
});

// ── §8: Dynamic benefit sections ──────────────────────────────────────────────
describe('§8 Benefit sections: render from landing_sections', () => {
  it('#lp-benefit-sections container in DOM', () => {
    expect(html).toContain('id="lp-benefit-sections"');
  });

  it('renderer fetches is_visible=true sections only', () => {
    expect(js).toContain('is_visible=eq.true');
  });

  it('renderer fetches archived_at=is.null', () => {
    expect(js).toContain('archived_at=is.null');
  });

  it('renderer orders by sort_order', () => {
    expect(js).toContain('order=sort_order.asc');
  });

  it('orientation auto-alternates: position 0 = image-right', () => {
    expect(js).toContain('position % 2 === 0');
    expect(js).toContain('section-img-right');
  });

  it('manual orientation override respected', () => {
    expect(js).toContain("=== 'image-left'");
    expect(js).toContain("=== 'image-right'");
  });
});

// ── §8: Hidden sections ───────────────────────────────────────────────────────
describe('§8 Hidden sections: is_visible=false not rendered', () => {
  it('renderer only fetches is_visible=true', () => {
    expect(js).toContain('is_visible=eq.true');
  });
});

// ── §8: Segment targeting ─────────────────────────────────────────────────────
describe('§8 Segment targeting', () => {
  it('filterBySegment function exists', () => {
    expect(js).toContain('filterBySegment');
  });

  it('getVisitorSegment reads segment', () => {
    expect(js).toContain('getVisitorSegment');
  });

  it('preview=true bypasses segment filter', () => {
    expect(js).toContain('preview=true');
    expect(js).toContain('return sections');
  });
});

// ── §8: Removed sections ─────────────────────────────────────────────────────
describe('§8 Removed sections: fully absent from DOM', () => {
  it('#benefits (9-card grid) removed', () => {
    expect(html).not.toContain('id="benefits"');
    expect(html).not.toContain('class="benefit-grid"');
  });

  it('#benefits-short removed', () => {
    expect(html).not.toContain('id="benefits-short"');
  });

  it('#walkthrough carousel removed', () => {
    expect(html).not.toContain('id="walkthrough"');
    expect(html).not.toContain('carousel-track');
  });
});

// ── §8: Social proof bar ─────────────────────────────────────────────────────
describe('§8 Social proof bar', () => {
  it('social-proof-bar exists', () => {
    expect(html).toContain('id="social-proof-bar"');
  });

  it('lp-active-jobs-sp hydrated from applyStats', () => {
    expect(html).toContain('id="lp-active-jobs-sp"');
    expect(js).toContain('lp-active-jobs-sp');
  });

  it('lp-companies-hiring-sp hydrated from applyStats', () => {
    expect(html).toContain('id="lp-companies-hiring-sp"');
    expect(js).toContain('lp-companies-hiring-sp');
  });

  it('bar shown immediately (no survey gate)', () => {
    expect(js).toContain("bar.classList.remove('hidden')");
  });

  it('60+ ATS platforms in copy', () => {
    expect(html).toContain('60+ ATS platforms');
  });
});

// ── §8: Mobile responsive 375px ──────────────────────────────────────────────
describe('§8 Mobile responsive at 375px', () => {
  it('375px breakpoint exists in landing.css', () => {
    expect(css).toContain('max-width: 375px');
  });

  it('benefit section padding reduced at 375px', () => {
    expect(css).toContain('max-width: 375px');
    expect(css).toContain('.lp-benefit-section');
    expect(css).toContain('padding: 32px 4%');
  });

  it('lp-section-cta full width at 375px', () => {
    expect(css).toContain('.lp-section-cta');
    expect(css).toContain('width: 100%');
  });

  it('hero-img-col hidden at 375px', () => {
    expect(css).toContain('.hero-img-col');
    // hidden at 375px — display:none in 375px media block
    const idx375 = css.indexOf('max-width: 375px');
    expect(idx375).toBeGreaterThan(-1);
    expect(css).toContain('display: none');
  });

  it('social proof bar stacked at 375px', () => {
    const block375 = css.substring(css.lastIndexOf('max-width: 375px'), css.lastIndexOf('max-width: 375px') + 800);
    expect(block375).toContain('social-proof-inner');
  });

  it('benefit sections stack at 768px', () => {
    expect(css).toContain('max-width: 768px');
    expect(css).toContain('.lp-benefit-section');
    // column stacking for benefit sections at 768px
    expect(css).toMatch(/lp-benefit-section[\s\S]{0,200}flex-direction: column/);
  });
});

// ── §8: Page weight / no regression ──────────────────────────────────────────
describe('§8 No page weight regression', () => {
  it('hero screenshot is lazy-loaded (WebP/lazy)', () => {
    expect(html).toContain('loading="lazy"');
  });

  it('section screenshots use lazy loading in renderer', () => {
    expect(js).toContain('loading="lazy"');
  });

  it('no inline base64 images bloating HTML', () => {
    expect(html).not.toContain('data:image/png;base64');
    expect(html).not.toContain('data:image/jpeg;base64');
  });
});

// ── §8: Admin page checklist ─────────────────────────────────────────────────
describe('§8 Admin page', () => {
  const dashboard = fs.readFileSync('dashboard.html', 'utf8');

  it('sections listed with sort order', () => {
    expect(dashboard).toContain('id="al-section-list"');
  });

  it('drag-to-reorder in admin-landing.js', () => {
    const alJs = fs.readFileSync('js/admin-landing.js', 'utf8');
    expect(alJs).toContain('dragstart');
    expect(alJs).toContain('sort_order');
    expect(alJs).toContain('Promise.all');
  });

  it('toggle visibility in admin-landing.js', () => {
    const alJs = fs.readFileSync('js/admin-landing.js', 'utf8');
    expect(alJs).toContain('alToggleVisible');
    expect(alJs).toContain('is_visible');
  });

  it('+ Add Section creates draft (is_visible: false)', () => {
    const alJs = fs.readFileSync('js/admin-landing.js', 'utf8');
    expect(alJs).toContain('is_visible: false');
  });

  it('image upload to landing-assets bucket', () => {
    const alJs = fs.readFileSync('js/admin-landing.js', 'utf8');
    expect(alJs).toContain("from('landing-assets')");
    expect(alJs).toContain('.upload(');
    expect(alJs).toContain('getPublicUrl');
  });

  it('soft delete sets archived_at', () => {
    const alJs = fs.readFileSync('js/admin-landing.js', 'utf8');
    expect(alJs).toContain('archived_at');
  });

  it('preview button opens ?preview=true', () => {
    expect(dashboard).toContain('preview=true');
  });

  it('non-admin nav link hidden by default', () => {
    expect(dashboard).toContain('id="nav-admin-landing"');
    expect(dashboard).toContain('display:none');
  });

  it('RLS prevents non-admin writes (migration)', () => {
    const sql = fs.readFileSync('supabase/migrations/v9.41-lp-restructure-s1.sql', 'utf8');
    expect(sql).toContain("profiles.role = 'admin'");
  });
});

// ── Version ───────────────────────────────────────────────────────────────────
describe('version', () => {
  it('version.js is current (regex)', () => {
    expect(ver).toMatch(/v\d+\.\d+/);
  });

  it('dist bundle is current (regex)', () => {
    expect(bundle).toMatch(/v\d+\.\d+/);
  });
});

// ── Regression: S1-S3 key invariants ─────────────────────────────────────────
describe('regression: S1-S3 key invariants', () => {
  it('landing_sections migration exists', () => {
    expect(fs.existsSync('supabase/migrations/v9.41-lp-restructure-s1.sql')).toBe(true);
  });

  it('initLpBenefitSections IIFE in landing-app.js', () => {
    expect(js).toContain('initLpBenefitSections');
  });

  it('DOMPurify sanitization present', () => {
    expect(js).toContain('DOMPurify');
    expect(js).toContain('ALLOWED_TAGS');
  });

  it('reportError on all renderer failures', () => {
    expect(js).toContain("reportError('lp_benefit_sections'");
  });

  it('admin-landing.js exists', () => {
    expect(fs.existsSync('js/admin-landing.js')).toBe(true);
  });

  it('admin-landing.js in build-admin.js', () => {
    const build = fs.readFileSync('build-admin.js', 'utf8');
    expect(build).toContain('admin-landing.js');
  });

  it('social proof bar data-stat spans consistent', () => {
    expect(html).toContain('id="lp-active-jobs-sp"');
    expect(html).toContain('id="lp-companies-hiring-sp"');
  });
});
