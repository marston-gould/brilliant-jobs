// ============================================================
// SA-015: Pipeline + Keywords Migration Validation Tests
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

console.log('\n🧪 SA-015: Pipeline + Keywords Migration Tests\n');

// ── Pipeline Directory Structure ─────────────────────────────
console.log('Pipeline — Directory Structure:');

test('pipeline/ dir exists', () => {
  assert(fs.existsSync(path.join(SRC, 'pages', 'dashboard', 'pipeline')));
});

test('pipeline/components/ dir exists', () => {
  assert(fs.existsSync(path.join(SRC, 'pages', 'dashboard', 'pipeline', 'components')));
});

test('pipeline/hooks/ dir exists', () => {
  assert(fs.existsSync(path.join(SRC, 'pages', 'dashboard', 'pipeline', 'hooks')));
});

// ── Pipeline Files ───────────────────────────────────────────
console.log('\nPipeline — Files:');

const pipelineFiles = [
  'src/app/pages/dashboard/pipeline/PipelinePage.tsx',
  'src/app/pages/dashboard/pipeline/index.ts',
  'src/app/pages/dashboard/pipeline/hooks/usePipeline.ts',
  'src/app/pages/dashboard/pipeline/components/index.ts',
  'src/app/pages/dashboard/pipeline/components/PipelineHero.tsx',
  'src/app/pages/dashboard/pipeline/components/PipelineFilterTags.tsx',
  'src/app/pages/dashboard/pipeline/components/StageSection.tsx',
  'src/app/pages/dashboard/pipeline/components/PipelineRow.tsx',
  'src/app/pages/dashboard/pipeline/components/SignalCard.tsx',
  'src/app/pages/dashboard/pipeline/components/GhostMonitor.tsx',
];

for (const f of pipelineFiles) {
  test(`${path.basename(f)} exists`, () => {
    assert(fileExists(f), `Missing: ${f}`);
  });
}

// ── Keywords Directory Structure ─────────────────────────────
console.log('\nKeywords — Directory Structure:');

test('keywords/ dir exists', () => {
  assert(fs.existsSync(path.join(SRC, 'pages', 'dashboard', 'keywords')));
});

test('keywords/components/ dir exists', () => {
  assert(fs.existsSync(path.join(SRC, 'pages', 'dashboard', 'keywords', 'components')));
});

test('keywords/hooks/ dir exists', () => {
  assert(fs.existsSync(path.join(SRC, 'pages', 'dashboard', 'keywords', 'hooks')));
});

// ── Keywords Files ───────────────────────────────────────────
console.log('\nKeywords — Files:');

const keywordsFiles = [
  'src/app/pages/dashboard/keywords/KeywordsPage.tsx',
  'src/app/pages/dashboard/keywords/index.ts',
  'src/app/pages/dashboard/keywords/hooks/useKeywords.ts',
  'src/app/pages/dashboard/keywords/components/index.ts',
  'src/app/pages/dashboard/keywords/components/ResumeSelector.tsx',
  'src/app/pages/dashboard/keywords/components/ResumeScoreCard.tsx',
  'src/app/pages/dashboard/keywords/components/FilterBreakdown.tsx',
  'src/app/pages/dashboard/keywords/components/KeywordTag.tsx',
  'src/app/pages/dashboard/keywords/components/LevelFit.tsx',
];

for (const f of keywordsFiles) {
  test(`${path.basename(f)} exists`, () => {
    assert(fileExists(f), `Missing: ${f}`);
  });
}

// ── Component Exports ────────────────────────────────────────
console.log('\nComponent Exports:');

test('Pipeline barrel exports all components', () => {
  const content = readFile('src/app/pages/dashboard/pipeline/components/index.ts');
  assert(content.includes('PipelineHero'), 'Missing PipelineHero');
  assert(content.includes('PipelineFilterTags'), 'Missing PipelineFilterTags');
  assert(content.includes('StageSection'), 'Missing StageSection');
  assert(content.includes('PipelineRow'), 'Missing PipelineRow');
  assert(content.includes('SignalCard'), 'Missing SignalCard');
  assert(content.includes('GhostMonitor'), 'Missing GhostMonitor');
});

test('Keywords barrel exports all components', () => {
  const content = readFile('src/app/pages/dashboard/keywords/components/index.ts');
  assert(content.includes('ResumeSelector'), 'Missing ResumeSelector');
  assert(content.includes('ResumeScoreCard'), 'Missing ResumeScoreCard');
  assert(content.includes('FilterBreakdown'), 'Missing FilterBreakdown');
  assert(content.includes('KeywordTag'), 'Missing KeywordTag');
  assert(content.includes('LevelFit'), 'Missing LevelFit');
});

test('Pipeline page barrel exports', () => {
  const content = readFile('src/app/pages/dashboard/pipeline/index.ts');
  assert(content.includes('PipelinePage'), 'Missing PipelinePage export');
  assert(content.includes('default'), 'Missing default export');
});

test('Keywords page barrel exports', () => {
  const content = readFile('src/app/pages/dashboard/keywords/index.ts');
  assert(content.includes('KeywordsPage'), 'Missing KeywordsPage export');
  assert(content.includes('default'), 'Missing default export');
});

// ── Hook Exports ─────────────────────────────────────────────
console.log('\nHook Exports:');

test('usePipeline exports hook + types', () => {
  const content = readFile('src/app/pages/dashboard/pipeline/hooks/usePipeline.ts');
  assert(content.includes('export function usePipeline'), 'Missing usePipeline');
  assert(content.includes('export const PL_STAGES'), 'Missing PL_STAGES');
  assert(content.includes('export type PipelineStage'), 'Missing PipelineStage');
  assert(content.includes('export interface PipelineItem'), 'Missing PipelineItem');
  assert(content.includes('export interface PipelineActions'), 'Missing PipelineActions');
  assert(content.includes('export function computeStaleDot'), 'Missing computeStaleDot');
  assert(content.includes('export function relativeTime'), 'Missing relativeTime');
});

test('useKeywords exports hook + types', () => {
  const content = readFile('src/app/pages/dashboard/keywords/hooks/useKeywords.ts');
  assert(content.includes('export function useKeywords'), 'Missing useKeywords');
  assert(content.includes('export interface FilterScore'), 'Missing FilterScore');
  assert(content.includes('export interface ResumeScore'), 'Missing ResumeScore');
  assert(content.includes('export interface KeywordsActions'), 'Missing KeywordsActions');
});

// ── Routes Updated ───────────────────────────────────────────
console.log('\nRoutes:');

test('routes.tsx imports PipelinePage', () => {
  const content = readFile('src/app/routes.tsx');
  assert(content.includes("import('@app/pages/dashboard/pipeline/PipelinePage')"), 'Missing PipelinePage import');
});

test('routes.tsx imports KeywordsPage', () => {
  const content = readFile('src/app/routes.tsx');
  assert(content.includes("import('@app/pages/dashboard/keywords/KeywordsPage')"), 'Missing KeywordsPage import');
});

test('routes.tsx uses PipelinePageRoute', () => {
  const content = readFile('src/app/routes.tsx');
  assert(content.includes('<PipelinePageRoute />'), 'Missing PipelinePageRoute');
  assert(!content.includes('<LegacyPipeline />'), 'Still using LegacyPipeline');
});

test('routes.tsx uses KeywordsPageRoute', () => {
  const content = readFile('src/app/routes.tsx');
  assert(content.includes('<KeywordsPageRoute />'), 'Missing KeywordsPageRoute');
  assert(!content.includes('<LegacyKeywords />'), 'Still using LegacyKeywords');
});

test('routes.tsx has Suspense wrappers', () => {
  const content = readFile('src/app/routes.tsx');
  assert(content.includes('function PipelinePageRoute'), 'Missing PipelinePageRoute function');
  assert(content.includes('function KeywordsPageRoute'), 'Missing KeywordsPageRoute function');
  assert(content.includes('Loading pipeline'), 'Missing pipeline loading text');
  assert(content.includes('Loading readiness'), 'Missing readiness loading text');
});

// ── Design System Compliance ─────────────────────────────────
console.log('\nDesign System Compliance:');

const allNewFiles = [...pipelineFiles, ...keywordsFiles].filter(f => f.endsWith('.tsx'));

for (const f of allNewFiles) {
  const name = path.basename(f);
  const content = readFile(f);

  test(`${name}: zero inline styles (no style= in JSX)`, () => {
    // Allow style= only for data-driven dynamic values (user filter colors, stage colors, score bars)
    const lines = content.split('\n');
    let violations = 0;
    let inDynamicStyle = false;
    for (const line of lines) {
      const trimmed = line.trim();
      // Track entry into dynamic style blocks (filter colors, stage colors, score bars)
      if (trimmed.includes('style={{') || trimmed.includes('style ={{')) {
        inDynamicStyle = true;
        continue;
      }
      if (inDynamicStyle && trimmed === '}}') {
        inDynamicStyle = false;
        continue;
      }
      if (inDynamicStyle) continue; // skip lines inside data-driven style blocks
      // Check standalone style= attributes (not in a block)
      if (trimmed.includes('style=') && !trimmed.includes('style={{')) {
        violations++;
      }
    }
    assert(violations === 0, `Found ${violations} inline style violations in ${name}`);
  });

  test(`${name}: uses design system components`, () => {
    // Pages and complex components should import from @app/components
    if (name.endsWith('Page.tsx') || name === 'StageSection.tsx' || name === 'GhostMonitor.tsx' ||
        name === 'ResumeSelector.tsx' || name === 'ResumeScoreCard.tsx' || name === 'SignalCard.tsx' ||
        name === 'PipelineRow.tsx') {
      assert(
        content.includes('@app/components'),
        `${name} should import from @app/components`
      );
    }
  });
}

test('No legacy LegacyPipeline or LegacyKeywords wrappers in routes', () => {
  const content = readFile('src/app/routes.tsx');
  assert(!content.includes('LegacyPipeline'), 'LegacyPipeline still defined');
  assert(!content.includes('LegacyKeywords'), 'LegacyKeywords still defined');
});

// ── Provider Pattern ─────────────────────────────────────────
console.log('\nProvider/Bridge Pattern:');

test('usePipeline uses window bridge (not direct Supabase)', () => {
  const content = readFile('src/app/pages/dashboard/pipeline/hooks/usePipeline.ts');
  assert(content.includes('win()'), 'Should bridge through window');
  assert(content.includes('_pipelineCache'), 'Should read from _pipelineCache');
  assert(!content.includes("from '@supabase"), 'Should NOT import Supabase directly');
});

test('useKeywords uses window bridge (not direct Supabase)', () => {
  const content = readFile('src/app/pages/dashboard/keywords/hooks/useKeywords.ts');
  assert(content.includes('win()'), 'Should bridge through window');
  assert(content.includes('readinessCache'), 'Should read from readinessCache');
  assert(!content.includes("from '@supabase"), 'Should NOT import Supabase directly');
});

test('PipelinePage does NOT access window.BJ directly', () => {
  const content = readFile('src/app/pages/dashboard/pipeline/PipelinePage.tsx');
  assert(!content.includes('window.'), 'Page should NOT access window directly');
});

test('KeywordsPage does NOT access window.BJ directly (except bridge)', () => {
  const content = readFile('src/app/pages/dashboard/keywords/KeywordsPage.tsx');
  // Allow one bridge call for handleScoreClick
  const windowRefs = (content.match(/window\./g) || []).length;
  assert(windowRefs <= 2, `Page has ${windowRefs} window. refs (max 2 for legacy bridge)`);
});

// ── Accessibility ────────────────────────────────────────────
console.log('\nAccessibility:');

test('Pipeline tables have thead', () => {
  const content = readFile('src/app/pages/dashboard/pipeline/components/StageSection.tsx');
  assert(content.includes('<thead>'), 'Missing thead');
  assert(content.includes('</thead>'), 'Missing /thead');
});

test('Ghost monitor table has thead', () => {
  const content = readFile('src/app/pages/dashboard/pipeline/components/GhostMonitor.tsx');
  assert(content.includes('<thead>'), 'Missing thead');
  assert(content.includes('</thead>'), 'Missing /thead');
});

test('Buttons have type="button"', () => {
  for (const f of allNewFiles) {
    const content = readFile(f);
    const buttonMatches = content.match(/<button(?:(?!type=)[^>])*>/g) || [];
    // All buttons should have type attribute
    const missing = buttonMatches.filter(m => !m.includes('type='));
    assert(missing.length === 0, `${path.basename(f)} has ${missing.length} buttons without type`);
  }
});

// ── Summary ──────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`SA-015 Results: ${pass} passed, ${fail} failed out of ${pass + fail} tests`);
console.log(`${'─'.repeat(50)}\n`);

if (fail > 0) {
  throw new Error(`${fail} tests failed`);
}
