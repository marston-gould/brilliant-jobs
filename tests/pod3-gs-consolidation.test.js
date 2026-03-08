/**
 * POD3-GS: Get Started + Setup Page Consolidation & UX Defect Resolution
 * Validates all 9 BUG fixes from the POD3 handoff spec.
 *
 * BUG-1: Content overlap resolved (Get Started = education, Setup = execution)
 * BUG-2: gs-progress-bar removed from Get Started
 * BUG-3: No connect/disconnect buttons on Get Started; all 3 cards uniform
 * BUG-4: Stats pull live data from Supabase (containers present)
 * BUG-5: "Hiring platforms" replaced with "companies hiring now"
 * BUG-6: Shared connectionState + renderConnectionStatus() for status sync
 * BUG-7: All 4 integration cards use unified connected/disconnected pattern
 * BUG-8: Hero blocks have consistent width treatment
 * BUG-9: All connect/disconnect buttons min-width: 140px
 */

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const dashboardHtml = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf-8');
const integrationsJs = fs.readFileSync(path.join(root, 'js/integrations.js'), 'utf-8');
const appJs = fs.readFileSync(path.join(root, 'js/app.js'), 'utf-8');
const inputCss = fs.readFileSync(path.join(root, 'src/input.css'), 'utf-8');
const stylesCss = fs.readFileSync(path.join(root, 'styles.css'), 'utf-8');

// ─── Section 1: BUG-2 — Progress bar removed ───
describe('BUG-2: Progress bar removed from Get Started', () => {
  test('gs-progress-bar element does not exist in HTML', () => {
    expect(dashboardHtml).not.toMatch(/id="gs-progress-bar"/);
  });

  test('gs-dot-resume, gs-dot-ext, gs-dot-gmail, gs-dot-filters removed', () => {
    expect(dashboardHtml).not.toMatch(/id="gs-dot-resume"/);
    expect(dashboardHtml).not.toMatch(/id="gs-dot-ext"/);
    expect(dashboardHtml).not.toMatch(/id="gs-dot-gmail"/);
    expect(dashboardHtml).not.toMatch(/id="gs-dot-filters"/);
  });

  test('gs-progress-pct element removed', () => {
    expect(dashboardHtml).not.toMatch(/id="gs-progress-pct"/);
  });

  test('updateSetupProgress in app.js is a no-op', () => {
    expect(appJs).toMatch(/function updateSetupProgress\(\)/);
    expect(appJs).not.toMatch(/getElementById\('gs-dot-resume'\)/);
    expect(appJs).not.toMatch(/getElementById\('gs-progress-pct'\)/);
  });
});

// ─── Section 2: BUG-3 — No connect buttons on Get Started ───
describe('BUG-3: Get Started has no connect/disconnect buttons', () => {
  // Extract the Get Started page section
  const gsStart = dashboardHtml.indexOf('id="page-brilliant"');
  const gsEnd = dashboardHtml.indexOf('id="page-setup"');
  const gsSection = dashboardHtml.slice(gsStart, gsEnd);

  test('No Connect Gmail button in Get Started', () => {
    expect(gsSection).not.toMatch(/onclick="connectGmail\(\)"/);
  });

  test('No Connect Calendar button in Get Started', () => {
    expect(gsSection).not.toMatch(/onclick="connectGoogleCalendar\(\)"/);
  });

  test('No Connect Drive button in Get Started', () => {
    expect(gsSection).not.toMatch(/onclick="connectGoogleDrive\(\)"/);
  });

  test('All three cards have "Set up on Setup page" links', () => {
    const links = gsSection.match(/Set up on Setup page/g);
    expect(links).not.toBeNull();
    expect(links.length).toBe(3);
  });

  test('All three cards navigate to Setup page on click', () => {
    const navClicks = gsSection.match(/data-page=setup/g);
    expect(navClicks).not.toBeNull();
    expect(navClicks.length).toBe(4); // 3 card links + 1 "Open Setup" CTA button
  });
});

// ─── Section 3: BUG-4 + BUG-5 — Live stats ───
describe('BUG-4 + BUG-5: Live stats and user-meaningful metrics', () => {
  test('gs-stat-positions container exists (live data target)', () => {
    expect(dashboardHtml).toMatch(/id="gs-stat-positions"/);
  });

  test('gs-stat-pages container exists (live data target)', () => {
    expect(dashboardHtml).toMatch(/id="gs-stat-pages"/);
  });

  test('gs-stat-companies container exists (live data target)', () => {
    expect(dashboardHtml).toMatch(/id="gs-stat-companies"/);
  });

  test('No hardcoded 320,000+ in HTML', () => {
    expect(dashboardHtml).not.toMatch(/>320,000\+</);
  });

  test('No hardcoded 39,000+ in stats section', () => {
    // The hero narrative text may still mention 39,000 — that's marketing copy
    // But the stat containers should not have hardcoded values
    expect(dashboardHtml).not.toMatch(/class="u-stat-lg">39,000\+</);
  });

  test('"hiring platforms covered" stat removed from data advantage section', () => {
    // Check only the data advantage stats section
    const gsStart = dashboardHtml.indexOf('gs-stat-positions');
    const gsEnd = dashboardHtml.indexOf('</div>', gsStart + 200);
    const statsSection = dashboardHtml.slice(gsStart, gsEnd);
    expect(statsSection).not.toMatch(/hiring platforms/);
    expect(dashboardHtml).not.toMatch(/hiring platforms covered/);
  });

  test('"companies hiring now" label present', () => {
    expect(dashboardHtml).toMatch(/companies hiring now/);
  });

  test('app.js has fetchGetStartedStats function', () => {
    expect(appJs).toMatch(/fetchGetStartedStats/);
    expect(appJs).toMatch(/gs-stat-positions/);
    expect(appJs).toMatch(/gs-stat-pages/);
    expect(appJs).toMatch(/gs-stat-companies/);
  });
});

// ─── Section 4: BUG-6 — Shared connection state ───
describe('BUG-6: Shared connectionState object', () => {
  test('_connectionState declared in integrations.js', () => {
    expect(integrationsJs).toMatch(/window\._connectionState\s*=/);
  });

  test('connectionState has all four integration flags', () => {
    expect(integrationsJs).toMatch(/ext:\s*false/);
    expect(integrationsJs).toMatch(/gmail:\s*false/);
    expect(integrationsJs).toMatch(/gcal:\s*false/);
    expect(integrationsJs).toMatch(/gdrive:\s*false/);
  });

  test('renderConnectionStatus function exists', () => {
    expect(integrationsJs).toMatch(/window\.renderConnectionStatus\s*=\s*function/);
  });

  test('renderConnectionStatus updates status bar dots', () => {
    expect(integrationsJs).toMatch(/getElementById\('status-ext'\)/);
    expect(integrationsJs).toMatch(/getElementById\('status-gmail'\)/);
    expect(integrationsJs).toMatch(/getElementById\('status-gcal'\)/);
    expect(integrationsJs).toMatch(/getElementById\('status-gdrive'\)/);
  });

  test('renderConnectionStatus updates card header dots', () => {
    expect(integrationsJs).toMatch(/getElementById\('ext-dot'\)/);
    expect(integrationsJs).toMatch(/getElementById\('gmail-dot'\)/);
    expect(integrationsJs).toMatch(/getElementById\('gcal-dot'\)/);
    expect(integrationsJs).toMatch(/getElementById\('gdrive-dot'\)/);
  });

  test('Gmail updates shared state via _connectionState', () => {
    expect(appJs).toMatch(/_connectionState\.gmail\s*=/);
    expect(appJs).toMatch(/renderConnectionStatus\(\)/);
  });

  test('Extension updates shared state via _connectionState', () => {
    expect(appJs).toMatch(/_connectionState\.ext\s*=/);
  });

  test('Drive updates shared state via renderGdriveState', () => {
    expect(integrationsJs).toMatch(/_connectionState\.gdrive\s*=/);
  });

  test('Calendar updates shared state', () => {
    expect(integrationsJs).toMatch(/_connectionState\.gcal\s*=/);
  });
});

// ─── Section 5: BUG-7 — Unified visual pattern ───
describe('BUG-7: All four cards use identical connected/disconnected pattern', () => {
  test('Extension has ext-setup-connected container', () => {
    expect(dashboardHtml).toMatch(/id="ext-setup-connected"/);
  });

  test('Extension has ext-setup-disconnected container', () => {
    expect(dashboardHtml).toMatch(/id="ext-setup-disconnected"/);
  });

  test('Gmail has gmail-setup-connected container', () => {
    expect(dashboardHtml).toMatch(/id="gmail-setup-connected"/);
  });

  test('Calendar has gcal-setup-connected container', () => {
    expect(dashboardHtml).toMatch(/id="gcal-setup-connected"/);
  });

  test('Calendar has gcal-setup-disconnected container', () => {
    expect(dashboardHtml).toMatch(/id="gcal-setup-disconnected"/);
  });

  test('Drive has gdrive-setup-connected container', () => {
    expect(dashboardHtml).toMatch(/id="gdrive-setup-connected"/);
  });

  test('Drive has gdrive-setup-disconnected container', () => {
    expect(dashboardHtml).toMatch(/id="gdrive-setup-disconnected"/);
  });

  test('Extension card header uses setup-dot class (not ext-dot)', () => {
    // The ext-dot in the header should be class="setup-dot"
    expect(dashboardHtml).toMatch(/class="setup-dot" id="ext-dot"/);
  });

  test('All four header dots use setup-dot class', () => {
    expect(dashboardHtml).toMatch(/class="setup-dot" id="ext-dot"/);
    expect(dashboardHtml).toMatch(/class="setup-dot" id="gmail-dot"/);
    expect(dashboardHtml).toMatch(/class="setup-dot" id="gcal-dot"/);
    expect(dashboardHtml).toMatch(/class="setup-dot" id="gdrive-dot"/);
  });

  test('Calendar connect/disconnect functions exist', () => {
    expect(integrationsJs).toMatch(/window\.connectGoogleCalendar/);
    expect(integrationsJs).toMatch(/window\.disconnectGoogleCalendar/);
  });

  test('Calendar state persisted to localStorage', () => {
    expect(integrationsJs).toMatch(/bj_gcal/);
    expect(integrationsJs).toMatch(/localStorage\.setItem\('bj_gcal'/);
  });

  test('Connected state pattern: phone-verified-badge + Connected label', () => {
    // All four connected containers should have the green checkmark badge
    const connectedBadges = dashboardHtml.match(/phone-verified-badge/g);
    expect(connectedBadges).not.toBeNull();
    expect(connectedBadges.length).toBeGreaterThanOrEqual(4);
  });
});

// ─── Section 6: BUG-8 — Hero width consistency ───
describe('BUG-8: Hero blocks consistent', () => {
  test('Setup page-body has max-width: 760px', () => {
    // Check the Setup page section for max-width
    const setupSection = dashboardHtml.slice(
      dashboardHtml.indexOf('id="page-setup"'),
      dashboardHtml.indexOf('id="page-jobs"')
    );
    expect(setupSection).toMatch(/max-width:\s*760px/);
  });

  test('gs-hero CSS uses border-radius: 12px', () => {
    expect(inputCss).toMatch(/\.gs-hero\s*\{[^}]*border-radius:\s*12px/);
  });

  test('setup-hero CSS uses border-radius: 12px', () => {
    expect(inputCss).toMatch(/\.setup-hero\s*\{[^}]*border-radius:\s*12px/);
  });

  test('gs-hero CSS uses padding: 28px 32px', () => {
    expect(inputCss).toMatch(/\.gs-hero\s*\{[^}]*padding:\s*28px 32px/);
  });

  test('setup-hero CSS uses padding: 28px 32px', () => {
    expect(inputCss).toMatch(/\.setup-hero\s*\{[^}]*padding:\s*28px 32px/);
  });
});

// ─── Section 7: BUG-9 — Button sizing ───
describe('BUG-9: Connect/disconnect buttons uniform sizing', () => {
  test('setup-connect-btn utility class in input.css', () => {
    expect(inputCss).toMatch(/\.setup-connect-btn/);
    expect(inputCss).toMatch(/min-width:\s*140px/);
  });

  test('setup-connect-btn in compiled styles.css', () => {
    expect(stylesCss).toMatch(/setup-connect-btn/);
  });

  test('Gmail connect button uses setup-connect-btn', () => {
    expect(dashboardHtml).toMatch(/setup-connect-btn.*onclick="connectGmail\(\)"/s);
  });

  test('Gmail disconnect button uses setup-connect-btn', () => {
    expect(dashboardHtml).toMatch(/setup-connect-btn.*onclick="disconnectGmail\(\)"/s);
  });

  test('Calendar connect button uses setup-connect-btn', () => {
    expect(dashboardHtml).toMatch(/setup-connect-btn.*onclick="connectGoogleCalendar\(\)"/s);
  });

  test('Drive connect button uses setup-connect-btn', () => {
    expect(dashboardHtml).toMatch(/setup-connect-btn.*onclick="connectGoogleDrive\(\)"/s);
  });
});

// ─── Section 8: Version discipline ───
describe('Version discipline', () => {
  const versionJs = fs.readFileSync(path.join(root, 'js/version.js'), 'utf-8');

  test('Product version bumped to v7.80', () => {
    expect(versionJs).toMatch(/v7\.80/);
  });

  test('Tailwind CSS rebuilt (styles.css exists and has content)', () => {
    expect(stylesCss.length).toBeGreaterThan(10000);
  });

  test('dist/dashboard.min.js exists', () => {
    expect(fs.existsSync(path.join(root, 'dist/dashboard.min.js'))).toBe(true);
  });
});

// ─── Section 9: BJ namespace registration ───
describe('BJ namespace registration', () => {
  test('connectGoogleCalendar registered in BJ namespace', () => {
    expect(integrationsJs).toMatch(/connectGoogleCalendar/);
    expect(integrationsJs).toMatch(/window\.BJ\[name\]/);
  });

  test('disconnectGoogleCalendar registered in BJ namespace', () => {
    expect(integrationsJs).toMatch(/disconnectGoogleCalendar/);
  });

  test('renderConnectionStatus registered in BJ namespace', () => {
    expect(integrationsJs).toMatch(/renderConnectionStatus/);
  });
});

// ─── Section 10: File inventory ───
describe('File inventory', () => {
  const expected = [
    'dashboard.html',
    'js/integrations.js',
    'js/app.js',
    'src/input.css',
    'styles.css',
    'js/version.js',
  ];

  test.each(expected)('%s exists', (file) => {
    expect(fs.existsSync(path.join(root, file))).toBe(true);
  });
});
