/**
 * CS-P1-008: Schema.org Microdata + JSON-LD Sync Tests
 * Validates: index.html scope attributes, landing-app.js JSON-LD sync
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── index.html Microdata Tests ──
describe('index.html — Schema.org microdata (scope attributes)', () => {
  let html;
  beforeEach(() => {
    html = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');
  });

  it('has itemscope WebPage on body', () => {
    expect(html).toMatch(/<body\s[^>]*itemscope/);
    expect(html).toMatch(/<body\s[^>]*itemtype="https:\/\/schema\.org\/WebPage"/);
  });

  it('has itemprop mainContentOfPage on main element', () => {
    expect(html).toMatch(/<main[^>]*itemprop="mainContentOfPage"/);
  });

  it('has itemscope Organization on at least one nav logo', () => {
    expect(html).toMatch(/class="nav-logo"[^>]*itemscope[^>]*itemtype="https:\/\/schema\.org\/Organization"/);
  });

  it('has itemprop name and logo on nav Organization', () => {
    // Find a nav-logo with itemscope and check it contains itemprop="name" and itemprop="logo"
    const orgMatch = html.match(/<div class="nav-logo"[^>]*itemscope[^>]*>[\s\S]*?<\/div>\s*\n/);
    expect(orgMatch).not.toBeNull();
    expect(orgMatch[0]).toContain('itemprop="logo"');
    expect(orgMatch[0]).toContain('itemprop="name"');
  });

  it('has itemscope FAQPage on FAQ section', () => {
    expect(html).toMatch(/id="objection-faq"[^>]*itemscope[^>]*itemtype="https:\/\/schema\.org\/FAQPage"/);
  });

  it('has itemscope Question on each FAQ item', () => {
    const faqItems = html.match(/class="faq-item"[^>]*itemscope[^>]*itemtype="https:\/\/schema\.org\/Question"/g);
    expect(faqItems).not.toBeNull();
    expect(faqItems.length).toBe(4);
  });

  it('has itemprop acceptedAnswer with Answer type on each FAQ item', () => {
    const answers = html.match(/itemprop="acceptedAnswer"[^>]*itemtype="https:\/\/schema\.org\/Answer"/g);
    expect(answers).not.toBeNull();
    expect(answers.length).toBe(4);
  });

  it('has itemprop name on FAQ summaries', () => {
    const summaries = html.match(/<summary itemprop="name">/g);
    expect(summaries).not.toBeNull();
    expect(summaries.length).toBe(4);
  });

  it('has itemprop text on FAQ answers', () => {
    const answerTexts = html.match(/itemprop="text"/g);
    expect(answerTexts).not.toBeNull();
    expect(answerTexts.length).toBeGreaterThanOrEqual(4);
  });

  it('has itemscope SoftwareApplication on pricing section', () => {
    expect(html).toMatch(/id="pricing"[^>]*itemscope[^>]*itemtype="https:\/\/schema\.org\/SoftwareApplication"/);
  });

  it('has meta tags for application name, category, and OS in pricing', () => {
    expect(html).toContain('<meta itemprop="name" content="Brilliant Jobs">');
    expect(html).toContain('<meta itemprop="applicationCategory" content="BusinessApplication">');
    expect(html).toContain('<meta itemprop="operatingSystem" content="Web, Chrome">');
  });

  it('has itemscope Offer on each pricing card', () => {
    const offers = html.match(/class="price-card[^"]*"[^>]*itemprop="offers"[^>]*itemscope[^>]*itemtype="https:\/\/schema\.org\/Offer"/g);
    expect(offers).not.toBeNull();
    expect(offers.length).toBe(3);
  });

  it('has meta price and priceCurrency on each offer', () => {
    const prices = html.match(/<meta itemprop="price" content="[^"]+"><meta itemprop="priceCurrency" content="USD">/g);
    expect(prices).not.toBeNull();
    expect(prices.length).toBe(3);
  });

  it('price values match displayed amounts', () => {
    // Free = 0, Starter = 20, Pro = 40
    expect(html).toContain('<meta itemprop="price" content="0">');
    expect(html).toContain('<meta itemprop="price" content="20">');
    expect(html).toContain('<meta itemprop="price" content="40">');
  });
});

// ── landing-app.js JSON-LD Sync Tests ──
describe('landing-app.js — JSON-LD sync (LS1-10)', () => {
  let js;
  beforeEach(() => {
    js = readFileSync(resolve(__dirname, '..', 'js', 'landing-app.js'), 'utf8');
  });

  it('contains JSON-LD sync code in applyStats', () => {
    expect(js).toContain('application/ld+json');
    expect(js).toContain('LS1-10');
  });

  it('targets SoftwareApplication nodes for job count updates', () => {
    expect(js).toContain("'SoftwareApplication'");
  });

  it('targets Organization nodes for company count updates', () => {
    expect(js).toContain("'Organization'");
  });

  it('targets FAQPage nodes for FAQ answer count updates', () => {
    expect(js).toContain("'FAQPage'");
  });

  it('uses regex replacement to update count strings', () => {
    // Should match patterns like "315,000+ jobs" or "39,000+ company"
    expect(js).toMatch(/replace\(.*jobs/);
    expect(js).toMatch(/replace\(.*company/);
  });

  it('wraps JSON-LD sync in try/catch for safety', () => {
    // The outer try/catch should call bjError on failure
    expect(js).toContain('jsonld_sync_error');
  });

  it('only writes back to script if changes were made', () => {
    expect(js).toContain('if (changed) script.textContent');
  });
});

// ── LS1-4: Single H1 ──
describe('index.html — single H1 (LS1-4)', () => {
  let html;
  beforeEach(() => {
    html = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');
  });

  it('has exactly one H1 tag', () => {
    const h1s = html.match(/<h1[\s>]/g);
    expect(h1s).toHaveLength(1);
  });

  it('returning hero uses H2 with hero-heading class', () => {
    expect(html).toMatch(/<h2 class="hero-heading"[^>]*>See what's new/);
  });

  it('lapsed hero uses H2 with hero-heading class', () => {
    expect(html).toMatch(/<h2 class="hero-heading"[^>]*>Welcome back/);
  });
});

// ── LS1-8: localStorage safety ──
describe('landing-segment.js — localStorage safety (LS1-8)', () => {
  let js;
  beforeEach(() => {
    js = readFileSync(resolve(__dirname, '..', 'js', 'landing-segment.js'), 'utf8');
  });

  it('wraps localStorage access in try/catch', () => {
    expect(js).toContain('try {');
    expect(js).toContain('catch (e)');
  });

  it('references LS1-8 in header comment', () => {
    expect(js).toContain('LS1-8');
  });

  it('defaults to segment new on failure', () => {
    // segment should be initialized to 'new' before the try block
    expect(js).toMatch(/var segment = ['"]new['"]/);
  });
});

// ── IX-A11Y-003: Form labels ──
describe('index.html — form labels (IX-A11Y-003)', () => {
  let html;
  beforeEach(() => {
    html = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');
  });

  it('has label for preview-keyword', () => {
    expect(html).toMatch(/<label for="preview-keyword"/);
  });

  it('has label for preview-location', () => {
    expect(html).toMatch(/<label for="preview-location"/);
  });

  it('preview labels use sr-only class', () => {
    const labels = html.match(/<label for="preview-\w+" class="sr-only">/g);
    expect(labels).toHaveLength(2);
  });

  it('auth modal inputs have visible labels', () => {
    expect(html).toContain('<label for="login-email">');
    expect(html).toContain('<label for="login-password">');
    expect(html).toContain('<label for="forgot-email">');
  });
});

// ── LS1-7: Responsive breakpoints ──
describe('landing.css — breakpoints (LS1-7)', () => {
  let css;
  beforeEach(() => {
    css = readFileSync(resolve(__dirname, '..', 'landing.css'), 'utf8');
  });

  it('has at least 5 breakpoints', () => {
    const breakpoints = css.match(/@media\s*\(max-width:\s*\d+px\)/g);
    expect(breakpoints.length).toBeGreaterThanOrEqual(5);
  });

  it('has 900px tablet breakpoint', () => {
    expect(css).toContain('max-width: 900px');
  });

  it('has 1024px breakpoint', () => {
    expect(css).toContain('max-width: 1024px');
  });

  it('has 768px breakpoint', () => {
    expect(css).toContain('max-width: 768px');
  });

  it('has 480px breakpoint', () => {
    expect(css).toContain('max-width: 480px');
  });
});

// ── LS1-11: Carousel no-JS fallback ──
describe('landing.css — carousel no-JS fallback (LS1-11)', () => {
  let css;
  beforeEach(() => {
    css = readFileSync(resolve(__dirname, '..', 'landing.css'), 'utf8');
  });

  it('has no-JS fallback for carousel track', () => {
    expect(css).toContain('html:not([data-segment]) .carousel .carousel-track');
  });

  it('hides carousel dots without JS', () => {
    expect(css).toContain('html:not([data-segment]) .carousel .carousel-dots');
  });
});

// ── CSS utility classes ──
describe('landing.css — utility classes', () => {
  let css;
  beforeEach(() => {
    css = readFileSync(resolve(__dirname, '..', 'landing.css'), 'utf8');
  });

  it('has sr-only class for visually hidden content', () => {
    expect(css).toMatch(/\.sr-only\s*\{/);
  });

  it('hero-heading shares styles with hero h1', () => {
    expect(css).toMatch(/\.hero h1,\s*\.hero \.hero-heading/);
  });
});
