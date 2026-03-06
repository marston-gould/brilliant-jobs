import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';

// CX-06: Split into core (first render) and deferred (tab-specific) bundles
const coreFiles = [
  'js/version.js',
  'js/globals.js',
  'js/sync.js',
  'js/query-builder.js',
  'js/job-feed.js',
  'js/sort-bar.js',
  'js/keywords.js',
  'js/browsers.js',
  'js/location.js',
  'js/pipeline.js',
  'js/tuning.js',
  'js/tier-gating.js',
  'js/fingerprint.js',
  'js/app.js',
];

const deferredFiles = [
  'js/resumes.js',
  'js/integrations.js',
  'js/applications.js',
  'js/settings.js',
  'js/stats.js',
  'js/billing.js',
  'js/micro-surveys.js',
  'js/rewrite.js',
  'js/resume-archive.js',
  'js/resume-metrics.js',
  'js/overlay-analytics.js',
  'js/pipeline-overlay-tab.js',
  'js/chat.js',
  'js/apply-workflow.js',
  'js/referrals.js',
  'js/referral-outreach.js',
];

const jsFiles = [...coreFiles, ...deferredFiles];

// Full combined bundle (backward compat)
const combined = jsFiles.map(f => `// === ${f} ===\n${readFileSync(f, 'utf-8')}`).join('\n\n');

mkdirSync('dist', { recursive: true });
writeFileSync('dist/dashboard.js', combined);
writeFileSync('dist/_tmp.js', combined);

buildSync({
  entryPoints: ['dist/_tmp.js'],
  outfile: 'dist/dashboard.min.js',
  minifySyntax: true,
  minifyWhitespace: true,
  minifyIdentifiers: false,
  sourcemap: true,
  target: 'es2020',
  bundle: false,
});
unlinkSync('dist/_tmp.js');

// CX-06: Deferred bundle (loaded after first render)
const deferredCombined = deferredFiles.map(f => `// === ${f} ===\n${readFileSync(f, 'utf-8')}`).join('\n\n');
writeFileSync('dist/_tmp_deferred.js', deferredCombined);

buildSync({
  entryPoints: ['dist/_tmp_deferred.js'],
  outfile: 'dist/dashboard-deferred.min.js',
  minifySyntax: true,
  minifyWhitespace: true,
  minifyIdentifiers: false,
  sourcemap: true,
  target: 'es2020',
  bundle: false,
});
unlinkSync('dist/_tmp_deferred.js');

// CX-06: Core bundle (first render critical path)
const coreCombined = coreFiles.map(f => `// === ${f} ===\n${readFileSync(f, 'utf-8')}`).join('\n\n');
writeFileSync('dist/_tmp_core.js', coreCombined);

buildSync({
  entryPoints: ['dist/_tmp_core.js'],
  outfile: 'dist/dashboard-core.min.js',
  minifySyntax: true,
  minifyWhitespace: true,
  minifyIdentifiers: false,
  sourcemap: true,
  target: 'es2020',
  bundle: false,
});
unlinkSync('dist/_tmp_core.js');

const origSize = combined.length;
const minSize = readFileSync('dist/dashboard.min.js', 'utf-8').length;
const coreSize = readFileSync('dist/dashboard-core.min.js', 'utf-8').length;
const deferredSize = readFileSync('dist/dashboard-deferred.min.js', 'utf-8').length;
console.log(`✅ dist/dashboard.min.js (full)`);
console.log(`   ${jsFiles.length} files → ${(origSize/1024).toFixed(1)}KB → ${(minSize/1024).toFixed(1)}KB minified (${((1-minSize/origSize)*100).toFixed(0)}% smaller)`);
console.log(`✅ dist/dashboard-core.min.js (${coreFiles.length} files → ${(coreSize/1024).toFixed(1)}KB)`);
console.log(`✅ dist/dashboard-deferred.min.js (${deferredFiles.length} files → ${(deferredSize/1024).toFixed(1)}KB)`);

