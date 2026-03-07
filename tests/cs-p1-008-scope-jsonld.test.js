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
