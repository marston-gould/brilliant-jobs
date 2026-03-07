/**
 * CS-018: Landing Page Architecture Tests
 * Validates CSS/JS extraction, cookie consent, PostHog identity bridge, CSP
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── HTML Structure Tests ──
describe('index.html — inline code extraction', () => {
  let html;
  beforeEach(() => {
    html = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');
  });

  it('has no inline <style> blocks', () => {
    // type="application/ld+json" blocks don't count
    const styleBlocks = html.match(/<style(?!\s+type=)[^>]*>/g);
    expect(styleBlocks).toBeNull();
  });

  it('has no inline executable <script> tags (only external src or JSON-LD)', () => {
    const scriptTags = html.match(/<script[^>]*>/g) || [];
    const inlineExecutable = scriptTags.filter(tag => {
      return !tag.includes('src=') && !tag.includes('type="application/ld+json"');
    });
    expect(inlineExecutable).toHaveLength(0);
  });

  it('links to external landing.css with version param', () => {
    expect(html).toMatch(/href="\/landing\.css\?v=/);
  });

  it('loads cookie-consent.js in head', () => {
    expect(html).toContain('<script src="/js/cookie-consent.js?v=');
  });

  it('loads landing-segment.js synchronously', () => {
    expect(html).toContain('<script src="/js/landing-segment.js?v=');
    // Must NOT have defer or async
    const match = html.match(/<script src="\/js\/landing-segment\.js[^"]*"[^>]*>/);
    expect(match[0]).not.toContain('defer');
    expect(match[0]).not.toContain('async');
  });

  it('loads landing-app.js as deferred', () => {
    expect(html).toMatch(/<script src="\/js\/landing-app\.js\?v=[^"]*"\s+defer>/);
  });

  it('loads safe-read-ls.js', () => {
    expect(html).toContain('<script src="/js/safe-read-ls.js?v=');
  });

  it('has ≤5 inline style= attributes', () => {
    const inlineStyles = (html.match(/\sstyle=/g) || []).length;
    expect(inlineStyles).toBeLessThanOrEqual(5);
  });

  it('does not contain duplicate merch inline script', () => {
    expect(html).not.toContain('C3: Landing Page Merchandising');
  });

  it('does not contain duplicate referral inline script', () => {
    // The inline referral script had URLSearchParams + bj_ref cookie
    const matches = html.match(/var ref = params\.get\('ref'\)/g);
    expect(matches).toBeNull();
  });
});

// ── External JS Files Existence ──
describe('extracted JS files exist', () => {
  const files = [
    'js/cookie-consent.js',
    'js/landing-segment.js',
    'js/safe-read-ls.js',
    'js/landing-app.js',
  ];

  files.forEach(file => {
    it(`${file} exists and is non-empty`, () => {
      const content = readFileSync(resolve(__dirname, '..', file), 'utf8');
      expect(content.length).toBeGreaterThan(10);
    });
  });
});

// ── Cookie Consent Script ──
describe('cookie-consent.js', () => {
  let content;
  beforeEach(() => {
    content = readFileSync(resolve(__dirname, '..', 'js', 'cookie-consent.js'), 'utf8');
  });

  it('defines bjError reporter', () => {
    expect(content).toContain('window.bjError');
  });

  it('checks for bj_consent cookie', () => {
    expect(content).toContain("'bj_consent'");
  });

  it('gates PostHog behind consent', () => {
    expect(content).toContain('function loadPostHog');
    expect(content).toContain("consent === 'granted'");
  });

  it('gates GTM behind consent', () => {
    expect(content).toContain('function loadGTM');
    expect(content).toContain('GTM-PLHNJQLC');
  });

  it('provides accept/decline UI', () => {
    expect(content).toContain('cc-accept');
    expect(content).toContain('cc-decline');
  });

  it('exposes public bjConsent API', () => {
    expect(content).toContain('window.bjConsent');
    expect(content).toContain('getStatus');
    expect(content).toContain('grant');
    expect(content).toContain('revoke');
  });

  it('sets consent cookie for 365 days', () => {
    expect(content).toContain('CONSENT_DAYS = 365');
  });
});

// ── Landing Segment Script ──
describe('landing-segment.js', () => {
  let content;
  beforeEach(() => {
    content = readFileSync(resolve(__dirname, '..', 'js', 'landing-segment.js'), 'utf8');
  });

  it('sets data-segment attribute on html element', () => {
    expect(content).toContain("setAttribute('data-segment'");
  });

  it('detects all 4 segments', () => {
    expect(content).toContain("'new'");
    expect(content).toContain("'active'");
    expect(content).toContain("'lapsed'");
    expect(content).toContain("'returning'");
  });

  it('redirects active users to dashboard', () => {
    expect(content).toContain("window.location.replace('/dashboard')");
  });

  it('removes non-matching segment sections from DOM', () => {
    expect(content).toContain('el.remove()');
  });
});

// ── PostHog Identity Bridge ──
describe('landing-app.js — PostHog identity bridge', () => {
  let content;
  beforeEach(() => {
    content = readFileSync(resolve(__dirname, '..', 'js', 'landing-app.js'), 'utf8');
  });

  it('calls posthog.identify in showLoggedIn', () => {
    expect(content).toContain('posthog.identify(user.id');
  });

  it('passes email and surface tag', () => {
    expect(content).toContain("surface: 'landing'");
  });

  it('wraps identify in try/catch', () => {
    expect(content).toContain("bjError('posthog_identify_landing'");
  });
});

// ── CSP Configuration ──
describe('vercel.json — CSP headers', () => {
  let config;
  beforeEach(() => {
    config = JSON.parse(readFileSync(resolve(__dirname, '..', 'vercel.json'), 'utf8'));
  });

  it('has landing-page-specific CSP', () => {
    const landingHeaders = config.headers.find(h => h.source === '/');
    expect(landingHeaders).toBeDefined();
    const csp = landingHeaders.headers.find(h => h.key === 'Content-Security-Policy');
    expect(csp).toBeDefined();
  });

  it('landing page CSP does NOT contain unsafe-inline in script-src', () => {
    const landingHeaders = config.headers.find(h => h.source === '/');
    const csp = landingHeaders.headers.find(h => h.key === 'Content-Security-Policy').value;
    // Extract script-src directive
    const scriptSrc = csp.match(/script-src\s+([^;]+)/)?.[1] || '';
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it('landing page CSP does NOT contain unsafe-inline in style-src', () => {
    const landingHeaders = config.headers.find(h => h.source === '/');
    const csp = landingHeaders.headers.find(h => h.key === 'Content-Security-Policy').value;
    const styleSrc = csp.match(/style-src\s+([^;]+)/)?.[1] || '';
    expect(styleSrc).not.toContain("'unsafe-inline'");
  });

  it('landing page CSP allows googletagmanager.com', () => {
    const landingHeaders = config.headers.find(h => h.source === '/');
    const csp = landingHeaders.headers.find(h => h.key === 'Content-Security-Policy').value;
    expect(csp).toContain('https://www.googletagmanager.com');
  });

  it('landing page CSP allows PostHog', () => {
    const landingHeaders = config.headers.find(h => h.source === '/');
    const csp = landingHeaders.headers.find(h => h.key === 'Content-Security-Policy').value;
    expect(csp).toContain('https://us.i.posthog.com');
  });
});

// ── landing.css ──
describe('landing.css — comprehensive stylesheet', () => {
  let css;
  beforeEach(() => {
    css = readFileSync(resolve(__dirname, '..', 'landing.css'), 'utf8');
  });

  it('contains font-face declarations', () => {
    expect(css).toContain('@font-face');
    expect(css).toContain("font-family: 'Outfit'");
  });

  it('contains CSS custom properties', () => {
    expect(css).toContain(':root');
    expect(css).toContain('--bg-main');
    expect(css).toContain('--primary');
  });

  it('contains cookie consent banner styles', () => {
    expect(css).toContain('#cookie-consent-banner');
    expect(css).toContain('.cc-btn-primary');
    expect(css).toContain('.cc-btn-secondary');
  });

  it('contains segment visibility rules', () => {
    expect(css).toContain('[data-segment=');
  });

  it('contains responsive breakpoints', () => {
    expect(css).toContain('@media');
  });
});
