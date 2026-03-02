import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';

const jsFiles = [
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
  'js/tier-gating.js',
  'js/apply-workflow.js',
  'js/fingerprint.js',
  'js/referrals.js',
  'js/app.js',
];

// Simple concatenation — no IIFE wrapper needed.
const combined = jsFiles.map(f => `// === ${f} ===\n${readFileSync(f, 'utf-8')}`).join('\n\n');

mkdirSync('dist', { recursive: true });
writeFileSync('dist/dashboard.js', combined);
writeFileSync('dist/_tmp.js', combined);

// IMPORTANT: Do NOT use minifyIdentifiers with concatenated (non-bundled) files.
// esbuild renames local vars to short names (a,b,c,d) globally, causing collisions
// across different function scopes in the concatenated output.
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

const origSize = combined.length;
const minSize = readFileSync('dist/dashboard.min.js', 'utf-8').length;
console.log(`✅ dist/dashboard.min.js`);
console.log(`   ${jsFiles.length} files → ${(origSize/1024).toFixed(1)}KB → ${(minSize/1024).toFixed(1)}KB minified (${((1-minSize/origSize)*100).toFixed(0)}% smaller)`);
