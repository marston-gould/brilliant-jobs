/**
 * LP-RESTRUCTURE-S1 validation tests
 * Landing Page Restructure Session 1: Schema + Stats Fix + DOM Restructure
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';

// ── 1. Migration file ─────────────────────────────────────────────────────────
describe('migration v9.41', () => {
  const sql = fs.readFileSync('supabase/migrations/v9.41-lp-restructure-s1.sql', 'utf8');

  it('migration file exists', () => {
    expect(fs.existsSync('supabase/migrations/v9.41-lp-restructure-s1.sql')).toBe(true);
  });

  it('creates landing_sections table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS landing_sections');
  });

  it('has all required columns', () => {
    expect(sql).toContain('sort_order');
    expect(sql).toContain('is_visible');
    expect(sql).toContain('archived_at');
    expect(sql).toContain('title');
    expect(sql).toContain('subtitle');
    expect(sql).toContain('body_text');
    expect(sql).toContain('image_url');
    expect(sql).toContain('image_alt');
    expect(sql).toContain('cta_text');
    expect(sql).toContain('cta_url');
    expect(sql).toContain('orientation');
    expect(sql).toContain('segment');
  });

  it('orientation CHECK constraint includes all 3 values', () => {
    expect(sql).toContain("'auto'");
    expect(sql).toContain("'image-left'");
    expect(sql).toContain("'image-right'");
  });

  it('segment CHECK constraint includes all 4 values', () => {
    expect(sql).toContain("'all'");
    expect(sql).toContain("'new'");
    expect(sql).toContain("'returning'");
    expect(sql).toContain("'lapsed'");
  });

  it('enables RLS', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  });

  it('has public read policy (SELECT using true)', () => {
    expect(sql).toContain('landing_sections_public_read');
    expect(sql).toContain('FOR SELECT');
    expect(sql).toContain('USING (true)');
  });

  it('has admin write policy gated on profiles.role = admin', () => {
    expect(sql).toContain('landing_sections_admin_write');
    expect(sql).toContain("profiles.role = 'admin'");
  });

  it('has updated_at trigger function', () => {
    expect(sql).toContain('fn_landing_sections_updated_at');
    expect(sql).toContain('BEFORE UPDATE');
  });

  it('has performance index on visible sections', () => {
    expect(sql).toContain('idx_landing_sections_visible_sort');
    expect(sql).toContain('WHERE is_visible = true');
  });

  it('seeds 4 initial sections', () => {
    const insertMatches = sql.match(/\(\s*\d,\s*false,/g);
    expect(insertMatches).not.toBeNull();
    expect(insertMatches.length).toBe(4);
  });

  it('seed sections default to is_visible = false (draft)', () => {
    // All 4 seeds should have false
    const falseCount = (sql.match(/\d, false,/g) || []).length;
    expect(falseCount).toBe(4);
  });
});

// ── 2. index.html DOM restructure ─────────────────────────────────────────────
describe('index.html DOM restructure', () => {
  const html = fs.readFileSync('index.html', 'utf8');

  it('benefit grid (#benefits) removed', () => {
    expect(html).not.toContain('id="benefits"');
    expect(html).not.toContain('class="benefit-grid"');
    expect(html).not.toContain('class="benefit-card"');
  });

  it('benefits-short section removed', () => {
    expect(html).not.toContain('id="benefits-short"');
  });

  it('walkthrough carousel removed', () => {
    expect(html).not.toContain('id="walkthrough"');
    expect(html).not.toContain('carousel-track');
    expect(html).not.toContain('carousel-slide');
  });

  it('#lp-benefit-sections container present', () => {
    expect(html).toContain('id="lp-benefit-sections"');
  });

  it('#lp-benefit-sections appears before ghost section', () => {
    const benefitPos = html.indexOf('id="lp-benefit-sections"');
    const ghostPos = html.indexOf('GHOST TRANSPARENCY');
    expect(benefitPos).toBeLessThan(ghostPos);
  });

  it('#lp-benefit-sections appears after comparison table (#why)', () => {
    const whyPos = html.indexOf('id="why"');
    const benefitPos = html.indexOf('id="lp-benefit-sections"');
    expect(whyPos).toBeLessThan(benefitPos);
  });
});

// ── 3. Stats bar dual metrics ─────────────────────────────────────────────────
describe('index.html dual stats', () => {
  const html = fs.readFileSync('index.html', 'utf8');

  it('stats bar has Career Pages Monitored label', () => {
    expect(html).toContain('Career Pages Monitored');
  });

  it('stats bar has Companies Hiring Now label', () => {
    expect(html).toContain('Companies Hiring Now');
  });

  it('lp-companies element has data-stat=total-pages attribute', () => {
    expect(html).toContain('id="lp-companies" data-stat="total-pages"');
  });

  it('lp-companies-hiring-stat element exists for Companies Hiring Now', () => {
    expect(html).toContain('id="lp-companies-hiring-stat"');
  });

  it('hero sub references 39K career pages via data-stat=total-pages', () => {
    expect(html).toContain('data-stat="total-pages"');
    expect(html).toContain('id="lp-hero-companies"');
  });

  it('hero sub has lp-companies-hiring for 8.7K companies hiring', () => {
    expect(html).toContain('id="lp-companies-hiring"');
  });

  it('hero sub text references scanning career pages', () => {
    expect(html).toContain('company career pages daily');
  });
});

// ── 4. landing-app.js stats wiring ────────────────────────────────────────────
describe('landing-app.js applyStats', () => {
  const js = fs.readFileSync('js/landing-app.js', 'utf8');

  it('hydrates lp-companies-hiring-stat (companies hiring now in stats bar)', () => {
    expect(js).toContain('lp-companies-hiring-stat');
  });

  it('hydrates lp-companies-hiring (companies hiring in hero sub)', () => {
    expect(js).toContain('lp-companies-hiring');
  });

  it('hydrates lp-companies with totalCompanies (39K career pages)', () => {
    expect(js).toContain("getElementById('lp-companies')");
    expect(js).toContain('totalCompanies');
  });

  it('hydrates all data-stat=total-pages spans', () => {
    expect(js).toContain('data-stat="total-pages"');
  });

  it('fallback uses 39,000+ for career pages monitored', () => {
    expect(js).toContain("'39,000+'");
  });

  it('fallback uses 8,700+ for companies hiring now', () => {
    expect(js).toContain("'8,700+'");
  });

  it('no silent catch blocks swallowing stats errors', () => {
    // Empty catch blocks are a violation
    expect(js).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/);
  });
});

// ── 5. Version ────────────────────────────────────────────────────────────────
describe('version', () => {
  it('version.js is v9.41', () => {
    const ver = fs.readFileSync('js/version.js', 'utf8');
    expect(ver).toMatch(/v\d+\.\d+/);
  });

  it('dist bundle contains v9.41', () => {
    const bundle = fs.readFileSync('dist/dashboard.min.js', 'utf8');
    expect(bundle).toMatch(/v\d+\.\d+/);
  });
});
