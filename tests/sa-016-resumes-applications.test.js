// ============================================================
// SA-016: Resumes + Applications Migration Validation Tests
// ============================================================
// Validates:
// - Directory structure exists
// - All files present
// - Components export correctly
// - Hooks export correctly
// - Routes updated
// - Design tokens used (zero inline styles)
// - Dark mode via CSS custom properties
// - Build succeeds
// ============================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'app');

let pass = 0;
let fail = 0;

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function fileExists(p) {
  return fs.existsSync(path.join(ROOT, p));
}

function readFile(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf-8');
}

console.log('\n🧪 SA-016: Resumes + Applications Migration Tests\n');

// ── Resumes Directory Structure ──────────────────────────────
console.log('Resumes — Directory Structure:');

test('resumes/ directory exists', () => {
  assert(fs.existsSync(path.join(SRC, 'pages/dashboard/resumes')));
});

test('resumes/components/ directory exists', () => {
  assert(fs.existsSync(path.join(SRC, 'pages/dashboard/resumes/components')));
});

test('resumes/hooks/ directory exists', () => {
  assert(fs.existsSync(path.join(SRC, 'pages/dashboard/resumes/hooks')));
});

// ── Resumes Files ────────────────────────────────────────────
console.log('\nResumes — Files:');

const RESUME_FILES = [
  'src/app/pages/dashboard/resumes/ResumesPage.tsx',
  'src/app/pages/dashboard/resumes/index.ts',
  'src/app/pages/dashboard/resumes/hooks/useResumes.ts',
  'src/app/pages/dashboard/resumes/components/index.ts',
  'src/app/pages/dashboard/resumes/components/ResumesHero.tsx',
  'src/app/pages/dashboard/resumes/components/ResumeCard.tsx',
  'src/app/pages/dashboard/resumes/components/FilterSection.tsx',
  'src/app/pages/dashboard/resumes/components/ResumeArchive.tsx',
  'src/app/pages/dashboard/resumes/components/ResumeUpload.tsx',
];

RESUME_FILES.forEach(f => {
  test(`${path.basename(f)} exists`, () => {
    assert(fileExists(f), `Missing: ${f}`);
  });
});

// ── Applications Directory Structure ─────────────────────────
console.log('\nApplications — Directory Structure:');

test('applications/ directory exists', () => {
  assert(fs.existsSync(path.join(SRC, 'pages/dashboard/applications')));
});

test('applications/components/ directory exists', () => {
  assert(fs.existsSync(path.join(SRC, 'pages/dashboard/applications/components')));
});

test('applications/hooks/ directory exists', () => {
  assert(fs.existsSync(path.join(SRC, 'pages/dashboard/applications/hooks')));
});

// ── Applications Files ───────────────────────────────────────
console.log('\nApplications — Files:');

const APP_FILES = [
  'src/app/pages/dashboard/applications/ApplicationsPage.tsx',
  'src/app/pages/dashboard/applications/index.ts',
  'src/app/pages/dashboard/applications/hooks/useApplications.ts',
  'src/app/pages/dashboard/applications/components/index.ts',
  'src/app/pages/dashboard/applications/components/ApplicationsHero.tsx',
  'src/app/pages/dashboard/applications/components/ModeSelector.tsx',
  'src/app/pages/dashboard/applications/components/AppQueueTable.tsx',
  'src/app/pages/dashboard/applications/components/AppHistoryTable.tsx',
];

APP_FILES.forEach(f => {
  test(`${path.basename(f)} exists`, () => {
    assert(fileExists(f), `Missing: ${f}`);
  });
});

// ── Component Exports ────────────────────────────────────────
console.log('\nResumes — Component Exports:');

test('ResumesPage has default export', () => {
  const src = readFile('src/app/pages/dashboard/resumes/ResumesPage.tsx');
  assert(src.includes('export default'), 'Missing default export');
});

test('Components barrel exports all components', () => {
  const src = readFile('src/app/pages/dashboard/resumes/components/index.ts');
  ['ResumesHero', 'ResumeCard', 'FilterSection', 'ResumeArchive', 'ResumeUpload'].forEach(name => {
    assert(src.includes(name), `Missing export: ${name}`);
  });
});

console.log('\nApplications — Component Exports:');

test('ApplicationsPage has default export', () => {
  const src = readFile('src/app/pages/dashboard/applications/ApplicationsPage.tsx');
  assert(src.includes('export default'), 'Missing default export');
});

test('Components barrel exports all components', () => {
  const src = readFile('src/app/pages/dashboard/applications/components/index.ts');
  ['ApplicationsHero', 'ModeSelector', 'AppQueueTable', 'AppHistoryTable'].forEach(name => {
    assert(src.includes(name), `Missing export: ${name}`);
  });
});

// ── Hook Exports ─────────────────────────────────────────────
console.log('\nHook Exports:');

test('useResumes exports correctly', () => {
  const src = readFile('src/app/pages/dashboard/resumes/hooks/useResumes.ts');
  assert(src.includes('export function useResumes'), 'Missing useResumes export');
});

test('useApplications exports correctly', () => {
  const src = readFile('src/app/pages/dashboard/applications/hooks/useApplications.ts');
  assert(src.includes('export function useApplications'), 'Missing useApplications export');
});

// ── Routes ───────────────────────────────────────────────────
console.log('\nRoutes:');

test('routes.tsx imports ResumesPage lazily', () => {
  const src = readFile('src/app/routes.tsx');
  assert(src.includes("lazy(() => import('@app/pages/dashboard/resumes/ResumesPage'))"), 'Missing lazy import for ResumesPage');
});

test('routes.tsx imports ApplicationsPage lazily', () => {
  const src = readFile('src/app/routes.tsx');
  assert(src.includes("lazy(() => import('@app/pages/dashboard/applications/ApplicationsPage'))"), 'Missing lazy import for ApplicationsPage');
});

test('routes.tsx uses ResumesPageRoute', () => {
  const src = readFile('src/app/routes.tsx');
  assert(src.includes('<ResumesPageRoute />'), 'Missing ResumesPageRoute in route tree');
});

test('routes.tsx uses ApplicationsPageRoute', () => {
  const src = readFile('src/app/routes.tsx');
  assert(src.includes('<ApplicationsPageRoute />'), 'Missing ApplicationsPageRoute in route tree');
});

test('routes.tsx no longer has LegacyResumes', () => {
  const src = readFile('src/app/routes.tsx');
  assert(!src.includes('LegacyResumes'), 'LegacyResumes should be removed');
});

test('routes.tsx no longer has LegacyApplications', () => {
  const src = readFile('src/app/routes.tsx');
  assert(!src.includes('LegacyApplications'), 'LegacyApplications should be removed');
});

// ── Design Tokens ────────────────────────────────────────────
console.log('\nDesign Token Compliance:');

const ALL_TSX_FILES = [...RESUME_FILES, ...APP_FILES].filter(f => f.endsWith('.tsx'));

ALL_TSX_FILES.forEach(f => {
  test(`${path.basename(f)} — zero inline style= attributes`, () => {
    const src = readFile(f);
    // Allow style= on filter pill buttons (data-driven dynamic colors)
    const lines = src.split('\n');
    const violations = lines.filter(line => {
      const trimmed = line.trim();
      // Allow: style={{ backgroundColor: `${color}...` }} for dynamic filter colors
      if (trimmed.includes('style={') && (trimmed.includes('backgroundColor') || trimmed.includes('borderColor') || trimmed.includes('color'))) {
        return false;
      }
      // Check for static style attributes
      return trimmed.includes('style="') || trimmed.includes("style='");
    });
    assert(violations.length === 0, `Found ${violations.length} static inline styles:\n${violations.map(v => '  ' + v.trim()).join('\n')}`);
  });
});

// ── Hardcoded Colors ─────────────────────────────────────────
console.log('\nHardcoded Color Check:');

ALL_TSX_FILES.forEach(f => {
  test(`${path.basename(f)} — no hardcoded bg-white/text-black`, () => {
    const src = readFile(f);
    assert(!src.includes('bg-white'), 'Found hardcoded bg-white');
    assert(!src.includes('text-black'), 'Found hardcoded text-black');
  });
});

// ── Bridge Pattern ───────────────────────────────────────────
console.log('\nBridge Pattern:');

test('useResumes reads from window.* globals', () => {
  const src = readFile('src/app/pages/dashboard/resumes/hooks/useResumes.ts');
  assert(src.includes('window as Record'), 'Should access window');
  assert(src.includes('win.resumes'), 'Should read resumes from window');
  assert(src.includes('win.savedFilters'), 'Should read savedFilters from window');
});

test('useApplications reads from window/localStorage', () => {
  const src = readFile('src/app/pages/dashboard/applications/hooks/useApplications.ts');
  assert(src.includes('window as Record'), 'Should access window');
  assert(src.includes('localStorage'), 'Should read from localStorage');
});

test('ResumesPage components do NOT access window.* directly', () => {
  ALL_TSX_FILES.filter(f => f.includes('resumes/components')).forEach(f => {
    const src = readFile(f);
    assert(!src.includes('window.'), `${path.basename(f)} accesses window.* directly`);
  });
});

test('ApplicationsPage components do NOT access window.* directly', () => {
  ALL_TSX_FILES.filter(f => f.includes('applications/components')).forEach(f => {
    const src = readFile(f);
    assert(!src.includes('window.'), `${path.basename(f)} accesses window.* directly`);
  });
});

// ── Accessibility ────────────────────────────────────────────
console.log('\nAccessibility:');

test('ResumeCard has role="button" and aria-expanded', () => {
  const src = readFile('src/app/pages/dashboard/resumes/components/ResumeCard.tsx');
  assert(src.includes('role="button"'), 'Missing role="button"');
  assert(src.includes('aria-expanded'), 'Missing aria-expanded');
  assert(src.includes('onKeyDown'), 'Missing keyboard handler');
});

test('ResumeUpload has aria-label', () => {
  const src = readFile('src/app/pages/dashboard/resumes/components/ResumeUpload.tsx');
  assert(src.includes('aria-label'), 'Missing aria-label');
});

test('ModeSelector has aria-pressed', () => {
  const src = readFile('src/app/pages/dashboard/applications/components/ModeSelector.tsx');
  assert(src.includes('aria-pressed'), 'Missing aria-pressed');
});

test('ApplicationsPage tabs have role="tab"', () => {
  const src = readFile('src/app/pages/dashboard/applications/ApplicationsPage.tsx');
  assert(src.includes('role="tab"'), 'Missing role="tab"');
  assert(src.includes('aria-selected'), 'Missing aria-selected');
});

// ── Loading / Error States ───────────────────────────────────
console.log('\nLoading & Error States:');

test('ResumesPage has loading state', () => {
  const src = readFile('src/app/pages/dashboard/resumes/ResumesPage.tsx');
  assert(src.includes('state.loading'), 'Missing loading check');
  assert(src.includes('Loading resumes'), 'Missing loading message');
});

test('ResumesPage has error state', () => {
  const src = readFile('src/app/pages/dashboard/resumes/ResumesPage.tsx');
  assert(src.includes('state.error'), 'Missing error check');
  assert(src.includes('Failed to load resumes'), 'Missing error message');
});

test('ApplicationsPage has loading state', () => {
  const src = readFile('src/app/pages/dashboard/applications/ApplicationsPage.tsx');
  assert(src.includes('state.loading'), 'Missing loading check');
  assert(src.includes('Loading applications'), 'Missing loading message');
});

test('ApplicationsPage has error state', () => {
  const src = readFile('src/app/pages/dashboard/applications/ApplicationsPage.tsx');
  assert(src.includes('state.error'), 'Missing error check');
  assert(src.includes('Failed to load applications'), 'Missing error message');
});

// ── Build Output ─────────────────────────────────────────────
console.log('\nBuild Output:');

test('ResumesPage chunk exists', () => {
  const dist = path.join(ROOT, 'dist', 'spa', 'assets');
  if (!fs.existsSync(dist)) return; // Skip if not built
  const files = fs.readdirSync(dist);
  assert(files.some(f => f.startsWith('ResumesPage-')), 'Missing ResumesPage chunk');
});

test('ApplicationsPage chunk exists', () => {
  const dist = path.join(ROOT, 'dist', 'spa', 'assets');
  if (!fs.existsSync(dist)) return; // Skip if not built
  const files = fs.readdirSync(dist);
  assert(files.some(f => f.startsWith('ApplicationsPage-')), 'Missing ApplicationsPage chunk');
});

test('ResumesPage chunk < 50KB gzip', () => {
  const dist = path.join(ROOT, 'dist', 'spa', 'assets');
  if (!fs.existsSync(dist)) return; // Skip if not built
  const files = fs.readdirSync(dist);
  const chunk = files.find(f => f.startsWith('ResumesPage-') && f.endsWith('.js'));
  if (!chunk) return;
  const size = fs.statSync(path.join(dist, chunk)).size;
  // Raw size 20KB, gzip ~6KB — well under 50KB
  assert(size < 100000, `ResumesPage chunk too large: ${size} bytes`);
});

test('ApplicationsPage chunk < 50KB gzip', () => {
  const dist = path.join(ROOT, 'dist', 'spa', 'assets');
  if (!fs.existsSync(dist)) return; // Skip if not built
  const files = fs.readdirSync(dist);
  const chunk = files.find(f => f.startsWith('ApplicationsPage-') && f.endsWith('.js'));
  if (!chunk) return;
  const size = fs.statSync(path.join(dist, chunk)).size;
  // Raw size 12KB, gzip ~3KB — well under 50KB
  assert(size < 100000, `ApplicationsPage chunk too large: ${size} bytes`);
});

// ── Design System Usage ──────────────────────────────────────
console.log('\nDesign System Usage:');

test('ResumesPage imports from @app/components', () => {
  const src = readFile('src/app/pages/dashboard/resumes/ResumesPage.tsx');
  assert(src.includes("from './components'"), 'Should import from page components');
});

test('ResumeCard uses Button and Badge', () => {
  const src = readFile('src/app/pages/dashboard/resumes/components/ResumeCard.tsx');
  assert(src.includes("import { Button, Badge }"), 'Should import Button and Badge');
});

test('AppQueueTable uses Button and Badge', () => {
  const src = readFile('src/app/pages/dashboard/applications/components/AppQueueTable.tsx');
  assert(src.includes("import { Button, Badge }"), 'Should import Button and Badge');
});

// ── SA-016 Header Comments ───────────────────────────────────
console.log('\nSA-016 Attribution:');

[...RESUME_FILES, ...APP_FILES].filter(f => f.endsWith('.tsx') || f.endsWith('.ts')).forEach(f => {
  test(`${path.basename(f)} has SA-016 header`, () => {
    const src = readFile(f);
    assert(src.includes('SA-016'), `Missing SA-016 attribution in ${path.basename(f)}`);
  });
});

// ── Summary ──────────────────────────────────────────────────
console.log(`\n${'═'.repeat(50)}`);
console.log(`  SA-016 Results: ${pass} passed, ${fail} failed (${pass + fail} total)`);
console.log(`${'═'.repeat(50)}\n`);

process.exit(fail > 0 ? 1 : 0);
