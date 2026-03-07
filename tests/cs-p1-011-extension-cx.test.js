// tests/cs-p1-011-extension-cx.test.js — CS-P1-011: Extension CX Hardening
// Tests for ES1-2 (a11y), ES1-4 (token sync), ES1-5 (version check),
// ES1-6 (ATS coverage), ES1-7 (password reset), ES1-8 (tab labels)

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const EXT_DIR = join(__dirname, '..', 'extension');

// ============================================================
// ES1-8: Tab Labels — User-Friendly
// ============================================================
describe('ES1-8: User-friendly tab labels', () => {
  const popupHtml = readFileSync(join(EXT_DIR, 'popup.html'), 'utf-8');

  it('tabs use user-friendly labels instead of jargon', () => {
    // Should NOT have jargon labels
    expect(popupHtml).not.toMatch(/>Harvest</);
    expect(popupHtml).not.toMatch(/>Scan</);
    expect(popupHtml).not.toMatch(/>Data</);

    // Should have user-friendly labels
    expect(popupHtml).toContain('>Contacts</div>');
    expect(popupHtml).toContain('>Company Scan</div>');
    expect(popupHtml).toContain('>Jobs</div>');
    expect(popupHtml).toContain('>Export</div>');
  });

  it('button labels are user-friendly', () => {
    expect(popupHtml).toContain('Find Connections');
    expect(popupHtml).toContain('Start Company Scan');
    expect(popupHtml).toContain('Collect Job Listings');
    expect(popupHtml).not.toContain('Harvest Connections');
    expect(popupHtml).not.toContain('Start Scanning');
    expect(popupHtml).not.toContain('Scrape All Pages');
  });

  it('popup-post.js log sources match new tab names', () => {
    const postJs = readFileSync(join(EXT_DIR, 'popup-post.js'), 'utf-8');
    expect(postJs).toContain("'contacts'");
    expect(postJs).toContain("'company-scan'");
    expect(postJs).toContain("'export'");
    expect(postJs).not.toContain("'harvest'");
  });
});

// ============================================================
// ES1-7: Password Reset Flow
// ============================================================
describe('ES1-7: Password reset flow', () => {
  const popupHtml = readFileSync(join(EXT_DIR, 'popup.html'), 'utf-8');
  const popupJs = readFileSync(join(EXT_DIR, 'popup.js'), 'utf-8');

  it('has a password reset panel in popup.html', () => {
    expect(popupHtml).toContain('id="auth-reset-panel"');
    expect(popupHtml).toContain('id="reset-email"');
    expect(popupHtml).toContain('id="reset-send-btn"');
    expect(popupHtml).toContain('id="reset-back-link"');
  });

  it('forgot password link triggers reset panel (not external URL)', () => {
    expect(popupHtml).toContain('id="auth-forgot-link"');
    // Should NOT link to external URL
    expect(popupHtml).not.toContain('href="https://brilliantjobs.app" target="_blank"');
  });

  it('popup.js has Supabase /recover API call', () => {
    expect(popupJs).toContain('/auth/v1/recover');
    expect(popupJs).toContain('auth-forgot-link');
    expect(popupJs).toContain('reset-send-btn');
    expect(popupJs).toContain('reset-back-link');
  });

  it('reset panel is hidden from auth gate', () => {
    expect(popupJs).toContain('auth-reset-panel');
    expect(popupJs).toContain("resetPanel.style.display = 'none'");
  });

  it('password reset captures PostHog event', () => {
    expect(popupJs).toContain("phCapture('password_reset_requested'");
  });
});

// ============================================================
// ES1-2: Extension A11y Baseline
// ============================================================
describe('ES1-2: Extension a11y baseline', () => {
  const popupHtml = readFileSync(join(EXT_DIR, 'popup.html'), 'utf-8');
  const overlayJs = readFileSync(join(EXT_DIR, 'inject-overlay.js'), 'utf-8');
  const toolbarJs = readFileSync(join(EXT_DIR, 'toolbar-overlay.js'), 'utf-8');

  describe('popup.html a11y', () => {
    it('has lang attribute on html element', () => {
      expect(popupHtml).toContain('<html lang="en">');
    });

    it('has skip link for keyboard users', () => {
      expect(popupHtml).toContain('class="skip-link"');
    });

    it('tabs have proper ARIA roles', () => {
      expect(popupHtml).toContain('role="tablist"');
      expect(popupHtml).toContain('role="tab"');
      expect(popupHtml).toContain('role="tabpanel"');
    });

    it('auth region has aria-label', () => {
      expect(popupHtml).toContain('aria-label="Authentication"');
    });

    it('version mismatch banner has role=alert', () => {
      expect(popupHtml).toContain('id="version-mismatch-banner"');
      expect(popupHtml).toContain('role="alert"');
    });
  });

  describe('inject-overlay.js a11y', () => {
    it('overlay has role=dialog', () => {
      expect(overlayJs).toContain("setAttribute('role', 'dialog')");
    });

    it('overlay has aria-label', () => {
      expect(overlayJs).toContain("setAttribute('aria-label', 'Brilliant Jobs form fill progress')");
    });

    it('progress bar has ARIA progressbar role', () => {
      expect(overlayJs).toContain('role="progressbar"');
      expect(overlayJs).toContain('aria-valuemin="0"');
      expect(overlayJs).toContain('aria-valuemax="100"');
    });

    it('close button has aria-label', () => {
      expect(overlayJs).toContain('aria-label="Dismiss fill overlay"');
    });

    it('supports Escape key to dismiss', () => {
      expect(overlayJs).toContain("e.key === 'Escape'");
    });

    it('field list has role=log and aria-live', () => {
      expect(overlayJs).toContain('role="log"');
      expect(overlayJs).toContain('aria-live="polite"');
    });

    it('spinner is aria-hidden', () => {
      expect(overlayJs).toContain('aria-hidden="true"');
    });

    it('has focus-visible styles', () => {
      expect(overlayJs).toContain('focus-visible');
    });
  });

  describe('toolbar-overlay.js a11y', () => {
    it('toolbar has role=toolbar', () => {
      expect(toolbarJs).toContain("setAttribute('role', 'toolbar')");
    });

    it('toolbar has aria-label', () => {
      expect(toolbarJs).toContain("setAttribute('aria-label', 'Brilliant Jobs job page toolbar')");
    });

    it('dismiss button has aria-label', () => {
      expect(toolbarJs).toContain('aria-label="Dismiss job toolbar"');
    });

    it('picker button has aria-expanded and aria-haspopup', () => {
      expect(toolbarJs).toContain('aria-expanded="false"');
      expect(toolbarJs).toContain('aria-haspopup="true"');
    });

    it('stage dropdown has role=menu', () => {
      expect(toolbarJs).toContain('role="menu"');
    });

    it('stage options have role=menuitem', () => {
      expect(toolbarJs).toContain('role="menuitem"');
    });

    it('supports Escape key to dismiss', () => {
      expect(toolbarJs).toContain("e.key !== 'Escape'");
    });

    it('updates aria-expanded on dropdown toggle', () => {
      expect(toolbarJs).toContain("pickerBtn.setAttribute('aria-expanded'");
    });

    it('has focus-visible styles', () => {
      expect(toolbarJs).toContain('focus-visible');
    });

    it('fraud alert has role=alert', () => {
      expect(toolbarJs).toContain('role="alert"');
    });
  });
});

// ============================================================
// ES1-5: Version Mismatch Check
// ============================================================
describe('ES1-5: Version mismatch check', () => {
  const popupHtml = readFileSync(join(EXT_DIR, 'popup.html'), 'utf-8');
  const postJs = readFileSync(join(EXT_DIR, 'popup-post.js'), 'utf-8');

  it('has version mismatch banner element', () => {
    expect(popupHtml).toContain('id="version-mismatch-banner"');
    expect(popupHtml).toContain('Update available');
  });

  it('has dismiss button for version banner', () => {
    expect(popupHtml).toContain('id="version-mismatch-dismiss"');
  });

  it('popup-post.js has version check function', () => {
    expect(postJs).toContain('checkExtensionVersion');
    expect(postJs).toContain('extension_latest_version');
    expect(postJs).toContain('compareSemver');
  });

  it('version check queries app_config table', () => {
    expect(postJs).toContain('app_config');
    expect(postJs).toContain('extension_latest_version');
  });

  it('version check fails silently (non-critical)', () => {
    expect(postJs).toContain('Version check is non-critical');
  });
});

// ============================================================
// ES1-4: Token Divergence Sync
// ============================================================
describe('ES1-4: Token divergence sync', () => {
  it('token-sync.js exists', () => {
    expect(existsSync(join(EXT_DIR, 'token-sync.js'))).toBe(true);
  });

  it('token-sync.js observes dashboard localStorage changes', () => {
    const syncJs = readFileSync(join(EXT_DIR, 'token-sync.js'), 'utf-8');
    expect(syncJs).toContain('storage');
    expect(syncJs).toContain('sb-qojhagupdnbtomfoxnsf-auth-token');
    expect(syncJs).toContain('dashboardTokenSync');
  });

  it('token-sync.js handles extension → dashboard sync', () => {
    const syncJs = readFileSync(join(EXT_DIR, 'token-sync.js'), 'utf-8');
    expect(syncJs).toContain('extensionTokenSync');
    expect(syncJs).toContain('localStorage.setItem');
  });

  it('manifest includes token-sync content script for brilliantjobs.app', () => {
    const manifest = JSON.parse(readFileSync(join(EXT_DIR, 'manifest.json'), 'utf-8'));
    const tokenSyncScript = manifest.content_scripts.find(cs => cs.js?.includes('token-sync.js'));
    expect(tokenSyncScript).toBeTruthy();
    expect(tokenSyncScript.matches).toContain('https://brilliantjobs.app/*');
  });

  it('background.js handles dashboardTokenSync message', () => {
    const bgJs = readFileSync(join(EXT_DIR, 'background.js'), 'utf-8');
    expect(bgJs).toContain('dashboardTokenSync');
  });

  it('background.js has syncTokenToDashboard function', () => {
    const bgJs = readFileSync(join(EXT_DIR, 'background.js'), 'utf-8');
    expect(bgJs).toContain('syncTokenToDashboard');
    expect(bgJs).toContain('extensionTokenSync');
  });

  it('manifest has brilliantjobs.app in host_permissions', () => {
    const manifest = JSON.parse(readFileSync(join(EXT_DIR, 'manifest.json'), 'utf-8'));
    expect(manifest.host_permissions).toContain('https://brilliantjobs.app/*');
  });
});

// ============================================================
// ES1-6: ATS Coverage Expansion
// ============================================================
describe('ES1-6: ATS coverage expansion', () => {
  it('BambooHR handler exists', () => {
    expect(existsSync(join(EXT_DIR, 'handlers', 'bamboohr.js'))).toBe(true);
  });

  it('JazzHR handler exists', () => {
    expect(existsSync(join(EXT_DIR, 'handlers', 'jazzhr.js'))).toBe(true);
  });

  it('BambooHR handler has form selectors', () => {
    const src = readFileSync(join(EXT_DIR, 'handlers', 'bamboohr.js'), 'utf-8');
    expect(src).toContain('BambooHR');
    expect(src).toContain('formContainer');
    expect(src).toContain('safeFill');
  });

  it('JazzHR handler has form selectors', () => {
    const src = readFileSync(join(EXT_DIR, 'handlers', 'jazzhr.js'), 'utf-8');
    expect(src).toContain('applicant_form');
    expect(src).toContain('formContainer');
    expect(src).toContain('safeFill');
  });

  it('selector registry includes BambooHR', () => {
    const reg = readFileSync(join(EXT_DIR, 'selectors', 'registry.js'), 'utf-8');
    expect(reg).toContain("handler: 'bamboohr'");
    expect(reg).toContain('bamboohr.com');
  });

  it('selector registry includes JazzHR', () => {
    const reg = readFileSync(join(EXT_DIR, 'selectors', 'registry.js'), 'utf-8');
    expect(reg).toContain("handler: 'jazzhr'");
    expect(reg).toContain('applytojob.com');
  });

  it('manifest includes BambooHR and JazzHR in host_permissions', () => {
    const manifest = JSON.parse(readFileSync(join(EXT_DIR, 'manifest.json'), 'utf-8'));
    expect(manifest.host_permissions).toContain('https://*.bamboohr.com/*');
    expect(manifest.host_permissions).toContain('https://*.applytojob.com/*');
  });

  it('manifest includes BambooHR and JazzHR in content_scripts', () => {
    const manifest = JSON.parse(readFileSync(join(EXT_DIR, 'manifest.json'), 'utf-8'));
    const atsScript = manifest.content_scripts.find(cs => cs.js?.includes('contentScript.js'));
    expect(atsScript.matches).toContain('https://*.bamboohr.com/*');
    expect(atsScript.matches).toContain('https://*.applytojob.com/*');
  });

  it('total handler count is now 17 (15 + BambooHR + JazzHR)', () => {
    const reg = readFileSync(join(EXT_DIR, 'selectors', 'registry.js'), 'utf-8');
    const handlerCount = (reg.match(/handler: '/g) || []).length;
    expect(handlerCount).toBe(17);
  });
});
