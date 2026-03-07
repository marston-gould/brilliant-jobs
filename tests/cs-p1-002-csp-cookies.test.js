// CS-P1-002: CSP + Cookies + Admin Auth + Key Rotation Tests
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');

// ── SE-005: CSP — No unsafe-inline in script-src ──

describe('SE-005: CSP enforcement', () => {
  const dashboardHtml = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf-8');
  const adminHtml = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf-8');
  const vercelJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf-8'));

  it('dashboard.html has zero inline <script> blocks (no src-less script tags)', () => {
    // Match <script> tags that do NOT have a src attribute
    const inlineScripts = dashboardHtml.match(/<script(?![^>]*\bsrc\b)[^>]*>/gi) || [];
    expect(inlineScripts.length).toBe(0);
  });

  it('admin.html has zero inline <script> blocks', () => {
    const inlineScripts = adminHtml.match(/<script(?![^>]*\bsrc\b)[^>]*>/gi) || [];
    expect(inlineScripts.length).toBe(0);
  });

  it('dashboard.html includes externalized posthog-dashboard.js', () => {
    expect(dashboardHtml).toContain('js/posthog-dashboard.js');
  });

  it('dashboard.html includes externalized dashboard-inline.js', () => {
    expect(dashboardHtml).toContain('js/dashboard-inline.js');
  });

  it('admin.html includes externalized posthog-admin.js', () => {
    expect(adminHtml).toContain('js/posthog-admin.js');
  });

  it('admin.html includes externalized admin-inline.js', () => {
    expect(adminHtml).toContain('js/admin-inline.js');
  });

  it('externalized JS files exist', () => {
    expect(fs.existsSync(path.join(ROOT, 'js/posthog-dashboard.js'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'js/posthog-admin.js'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'js/dashboard-inline.js'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'js/admin-inline.js'))).toBe(true);
  });

  it('posthog-dashboard.js contains PostHog init with dashboard config', () => {
    const content = fs.readFileSync(path.join(ROOT, 'js/posthog-dashboard.js'), 'utf-8');
    expect(content).toContain('posthog.init');
    expect(content).toContain('capture_pageleave: true');
    expect(content).toContain("maskTextSelector: '.sensitive-data'");
    expect(content).toContain('startExceptionAutocapture');
  });

  it('posthog-admin.js contains PostHog init with admin config', () => {
    const content = fs.readFileSync(path.join(ROOT, 'js/posthog-admin.js'), 'utf-8');
    expect(content).toContain('posthog.init');
    expect(content).toContain('startExceptionAutocapture');
    // Admin should NOT have dashboard-specific configs
    expect(content).not.toContain('capture_pageleave');
    expect(content).not.toContain('enable_recording_console_log');
  });

  it('dashboard-inline.js contains all extracted functionality', () => {
    const content = fs.readFileSync(path.join(ROOT, 'js/dashboard-inline.js'), 'utf-8');
    expect(content).toContain('pdfjsLib.GlobalWorkerOptions.workerSrc');
    expect(content).toContain('bjPreloadChunks');
    expect(content).toContain('switchFeedbackTab');
    expect(content).toContain('Market Intelligence Cards');
    expect(content).toContain("role', 'button'"); // a11y setup - setAttribute call
    expect(content).toContain('Skip to main content');
  });

  it('dashboard CSP meta tag does not contain unsafe-inline for scripts', () => {
    const cspMeta = dashboardHtml.match(/<meta[^>]*Content-Security-Policy[^>]*>/i);
    expect(cspMeta).toBeTruthy();
    const cspContent = cspMeta[0];
    // Extract script-src directive
    const scriptSrc = cspContent.match(/script-src[^;]*/i);
    expect(scriptSrc).toBeTruthy();
    expect(scriptSrc[0]).not.toContain('unsafe-inline');
  });

  it('vercel.json catch-all CSP does not contain unsafe-inline for scripts', () => {
    const catchAllRoute = vercelJson.headers.find(h => h.source === '/(.*)');
    expect(catchAllRoute).toBeTruthy();
    const cspHeader = catchAllRoute.headers.find(h => h.key === 'Content-Security-Policy');
    expect(cspHeader).toBeTruthy();
    const scriptSrc = cspHeader.value.match(/script-src[^;]*/i);
    expect(scriptSrc).toBeTruthy();
    expect(scriptSrc[0]).not.toContain('unsafe-inline');
  });

  it('vercel.json landing page CSP does not contain unsafe-inline for scripts', () => {
    const landingRoute = vercelJson.headers.find(h => h.source === '/');
    expect(landingRoute).toBeTruthy();
    const cspHeader = landingRoute.headers.find(h => h.key === 'Content-Security-Policy');
    expect(cspHeader).toBeTruthy();
    const scriptSrc = cspHeader.value.match(/script-src[^;]*/i);
    expect(scriptSrc).toBeTruthy();
    expect(scriptSrc[0]).not.toContain('unsafe-inline');
  });

  it('style-src retains unsafe-inline (practical necessity for inline styles)', () => {
    const catchAllRoute = vercelJson.headers.find(h => h.source === '/(.*)');
    const cspHeader = catchAllRoute.headers.find(h => h.key === 'Content-Security-Policy');
    const styleSrc = cspHeader.value.match(/style-src[^;]*/i);
    expect(styleSrc).toBeTruthy();
    expect(styleSrc[0]).toContain("'unsafe-inline'");
  });
});

// ── IX-SE-006: Cookies with Secure flag ──

describe('IX-SE-006: Cookie Secure flag', () => {
  it('referral-capture.js sets Secure flag on cookies', () => {
    const content = fs.readFileSync(path.join(ROOT, 'js/referral-capture.js'), 'utf-8');
    // Find the setCookie function and verify it includes Secure
    const setCookieFn = content.match(/function setCookie[\s\S]*?^\s*\}/m);
    expect(setCookieFn).toBeTruthy();
    expect(setCookieFn[0]).toContain('Secure');
  });

  it('cookie-consent.js sets Secure flag on cookies', () => {
    const content = fs.readFileSync(path.join(ROOT, 'js/cookie-consent.js'), 'utf-8');
    // Find the setCookie function body which spans multiple lines
    expect(content).toContain(';Secure');
  });

  it('landing-app.js sets Secure flag on returning visitor cookie', () => {
    const content = fs.readFileSync(path.join(ROOT, 'js/landing-app.js'), 'utf-8');
    // Find the line that SETS (not reads) bj_returning cookie
    const cookieLine = content.split('\n').find(l => l.includes('bj_returning') && l.includes('document.cookie ='));
    expect(cookieLine).toBeTruthy();
    expect(cookieLine.toLowerCase()).toContain('secure');
  });

  it('all cookie-setting code includes SameSite attribute', () => {
    const files = ['js/referral-capture.js', 'js/cookie-consent.js', 'js/landing-app.js'];
    for (const file of files) {
      const content = fs.readFileSync(path.join(ROOT, file), 'utf-8');
      if (content.includes('document.cookie =')) {
        expect(content.toLowerCase()).toContain('samesite');
      }
    }
  });
});

// ── IX-SE-008: Anon key accepted risk documentation ──

describe('IX-SE-008: Anon key risk documentation', () => {
  it('SECURITY.md exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'SECURITY.md'))).toBe(true);
  });

  it('SECURITY.md documents IX-SE-008 accepted risk', () => {
    const content = fs.readFileSync(path.join(ROOT, 'SECURITY.md'), 'utf-8');
    expect(content).toContain('IX-SE-008');
    expect(content).toContain('anon key');
    expect(content).toContain('Accepted risk');
  });

  it('SECURITY.md documents RLS mitigations', () => {
    const content = fs.readFileSync(path.join(ROOT, 'SECURITY.md'), 'utf-8');
    expect(content).toContain('Row-Level Security');
  });
});

// ── AD-SE-001: Admin auth middleware (verify still in place) ──

describe('AD-SE-001: Admin auth middleware (regression check)', () => {
  it('admin-auth.ts exists in shared functions', () => {
    expect(fs.existsSync(path.join(ROOT, 'supabase/functions/_shared/admin-auth.ts'))).toBe(true);
  });

  it('admin-auth.ts exports requireAdmin', () => {
    const content = fs.readFileSync(path.join(ROOT, 'supabase/functions/_shared/admin-auth.ts'), 'utf-8');
    expect(content).toContain('export async function requireAdmin');
  });

  it('admin EFs import requireAdmin', () => {
    const efDirs = ['approve-content', 'generate-editorial-content', 'seo-sync'];
    for (const ef of efDirs) {
      const efPath = path.join(ROOT, `supabase/functions/${ef}/index.ts`);
      if (fs.existsSync(efPath)) {
        const content = fs.readFileSync(efPath, 'utf-8');
        expect(content).toContain('requireAdmin');
      }
    }
  });
});

// ── AD-SE-003: No service role key in client code ──

describe('AD-SE-003: Service role key not in client code', () => {
  it('globals.js uses anon key, not service_role key', () => {
    const content = fs.readFileSync(path.join(ROOT, 'js/globals.js'), 'utf-8');
    // The anon key JWT has role: "anon"
    expect(content).toContain('cm9sZSI6ImFub24i'); // base64 for "role":"anon"
    // The service_role key JWT has role: "service_role"
    expect(content).not.toContain('cm9sZSI6InNlcnZpY2Vfcm9sZSI'); // base64 for "role":"service_role"
  });

  it('no JS files contain the service_role JWT pattern', () => {
    const jsDir = path.join(ROOT, 'js');
    const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
    for (const file of jsFiles) {
      const content = fs.readFileSync(path.join(jsDir, file), 'utf-8');
      // Only check actual key values, not comments
      const lines = content.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
      const codeOnly = lines.join('\n');
      expect(codeOnly).not.toContain('cm9sZSI6InNlcnZpY2Vfcm9sZSI');
    }
  });
});

// ── SE-002: Key rotation procedure ──

describe('SE-002: Key rotation procedure', () => {
  it('rotation script exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'scripts/rotate-jwt-secret.sh'))).toBe(true);
  });

  it('rotation script covers all required steps', () => {
    const content = fs.readFileSync(path.join(ROOT, 'scripts/rotate-jwt-secret.sh'), 'utf-8');
    expect(content).toContain('globals.js'); // updates client key
    expect(content).toContain('supabase secrets set'); // updates EF secrets
    expect(content).toContain('functions deploy'); // redeploys EFs
    expect(content).toContain('CREDENTIALS_MASTER'); // updates docs
  });

  it('SECURITY.md documents SE-002 status', () => {
    const content = fs.readFileSync(path.join(ROOT, 'SECURITY.md'), 'utf-8');
    expect(content).toContain('SE-002');
    expect(content).toContain('Deferred');
    expect(content).toContain('git-filter-repo');
  });
});
