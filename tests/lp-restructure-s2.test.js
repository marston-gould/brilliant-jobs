/**
 * LP-RESTRUCTURE-S2 validation tests
 * Landing Page Restructure Session 2: Dynamic Section Renderer + Hero Screenshot
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';

// ── 1. landing-app.js renderer ───────────────────────────────────────────────
describe('landing-app.js benefit sections renderer', () => {
  const js = fs.readFileSync('js/landing-app.js', 'utf8');

  it('initLpBenefitSections IIFE exists', () => {
    expect(js).toContain('initLpBenefitSections');
  });

  it('fetches from landing_sections PostgREST endpoint', () => {
    expect(js).toContain('/rest/v1/landing_sections');
    expect(js).toContain('is_visible=eq.true');
    expect(js).toContain('order=sort_order.asc');
  });

  it('filters archived sections', () => {
    expect(js).toContain('archived_at=is.null');
  });

  it('orientation logic: auto alternates image-right/image-left by position', () => {
    expect(js).toContain('section-img-right');
    expect(js).toContain('section-img-left');
    expect(js).toContain("position % 2 === 0");
  });

  it('manual orientation overrides auto', () => {
    expect(js).toContain("=== 'image-left'");
    expect(js).toContain("=== 'image-right'");
  });

  it('sanitizes body_text via DOMPurify', () => {
    expect(js).toContain('DOMPurify');
    expect(js).toContain('sanitize');
  });

  it('DOMPurify allows only safe tags', () => {
    expect(js).toContain("ALLOWED_TAGS: ['strong', 'em', 'a', 'br']");
  });

  it('converts **bold** markdown', () => {
    expect(js).toContain('<strong>');
    expect(js).toContain('replace(/\\*\\*(.+?)\\*\\*/g');
  });

  it('renders browser frame with dots', () => {
    expect(js).toContain('lp-section-browser-frame');
    expect(js).toContain('lp-section-browser-dots');
  });

  it('renders section subtitle, title, body, cta', () => {
    expect(js).toContain('lp-section-subtitle');
    expect(js).toContain('lp-section-title');
    expect(js).toContain('lp-section-body');
    expect(js).toContain('lp-section-cta');
  });

  it('screenshot lazy-loaded', () => {
    expect(js).toContain('loading="lazy"');
  });

  it('placeholder rendered when no image_url', () => {
    expect(js).toContain('lp-section-img-placeholder');
    expect(js).toContain('Screenshot coming soon');
  });

  it('segment filtering: filters by visitor segment', () => {
    expect(js).toContain('filterBySegment');
    expect(js).toContain('getVisitorSegment');
  });

  it('preview=true bypasses segment filter (admin preview)', () => {
    expect(js).toContain('preview=true');
  });

  it('appends to #lp-benefit-sections container', () => {
    expect(js).toContain("getElementById('lp-benefit-sections')");
  });

  it('fires lp_sections_rendered PostHog event', () => {
    expect(js).toContain('lp_sections_rendered');
    expect(js).toContain('captureEvent');
  });

  it('reports errors via reportError — no silent failures', () => {
    expect(js).toContain("reportError('lp_benefit_sections'");
  });

  it('escapes HTML to prevent XSS in titles/subtitles', () => {
    expect(js).toContain('escapeHtml');
    expect(js).toContain('escapeAttr');
  });
});

// ── 2. landing.css benefit section styles ────────────────────────────────────
describe('landing.css benefit section styles', () => {
  const css = fs.readFileSync('landing.css', 'utf8');

  it('has .lp-benefit-section base flex layout', () => {
    expect(css).toContain('.lp-benefit-section');
    expect(css).toContain('display: flex');
  });

  it('section-img-right uses row direction (content left, image right)', () => {
    expect(css).toContain('.lp-benefit-section.section-img-right');
    expect(css).toContain('flex-direction: row');
  });

  it('section-img-left uses row-reverse (image left, content right)', () => {
    expect(css).toContain('.lp-benefit-section.section-img-left');
    expect(css).toContain('flex-direction: row-reverse');
  });

  it('stacks to column on mobile (max-width: 768px)', () => {
    expect(css).toContain('max-width: 768px');
    expect(css).toContain('flex-direction: column');
  });

  it('has browser frame styles', () => {
    expect(css).toContain('.lp-section-browser-frame');
    expect(css).toContain('.lp-section-browser-dots');
  });

  it('has hero screenshot 2-col layout', () => {
    expect(css).toContain('.hero-with-screenshot');
    expect(css).toContain('.hero-text-col');
    expect(css).toContain('.hero-img-col');
  });

  it('hero screenshot stacks on mobile (max-width: 900px)', () => {
    expect(css).toContain('max-width: 900px');
  });
});

// ── 3. index.html structure ───────────────────────────────────────────────────
describe('index.html S2 structure', () => {
  const html = fs.readFileSync('index.html', 'utf8');

  it('interactive preview section exists at #lp-preview', () => {
    expect(html).toContain('id="lp-preview"');
    expect(html).toContain('id="preview-section"');
    expect(html).toContain('id="preview-keyword"');
    expect(html).toContain('id="preview-results"');
  });

  it('preview is before comparison table (#why)', () => {
    const previewPos = html.indexOf('id="lp-preview"');
    const whyPos = html.indexOf('id="why"');
    expect(previewPos).toBeLessThan(whyPos);
  });

  it('preview is after stats bar', () => {
    const statsPos = html.indexOf('stats-bar');
    const previewPos = html.indexOf('id="lp-preview"');
    expect(statsPos).toBeLessThan(previewPos);
  });

  it('hero has 2-col wrapper', () => {
    expect(html).toContain('class="hero-with-screenshot"');
    expect(html).toContain('class="hero-text-col"');
    expect(html).toContain('class="hero-img-col"');
  });

  it('hero screenshot img present with lazy loading', () => {
    expect(html).toContain('id="lp-hero-screenshot"');
    expect(html).toContain('loading="lazy"');
  });

  it('hero screenshot has onerror fallback (hides frame if missing)', () => {
    expect(html).toContain("onerror=\"this.parentElement.parentElement.style.display='none'\"");
  });

  it('hero screenshot browser frame present', () => {
    expect(html).toContain('class="hero-screenshot-frame"');
    expect(html).toContain('class="hero-screenshot-dots"');
  });
});

// ── 4. version ────────────────────────────────────────────────────────────────
describe('version', () => {
  it('version.js is v9.45', () => {
    const ver = fs.readFileSync('js/version.js', 'utf8');
    expect(ver).toMatch(/v\d+\.\d+/);
  });

  it('dist bundle contains v9.45', () => {
    const bundle = fs.readFileSync('dist/dashboard.min.js', 'utf8');
    expect(bundle).toMatch(/v\d+\.\d+/);
  });
});
