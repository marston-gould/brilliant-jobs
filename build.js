import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';

const jsFiles = [
  'js/globals.js',
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
  'js/admin.js',
  'js/billing.js',
  'js/micro-surveys.js',
  'js/rewrite.js',
  'js/app.js',
];

// Simple concatenation — wrap each file in an IIFE to avoid const/let scope collisions
// during esbuild minification. Functions declared inside are hoisted to global in sloppy mode.
const combined = jsFiles.map(f => {
  const src = readFileSync(f, 'utf-8');
  // Wrap in IIFE but keep function declarations accessible globally
  // by NOT using strict mode (browser sloppy mode hoists function decls)
  return `// === ${f} ===\n;(function(){\n${src}\n})();`;
}).join('\n\n');

mkdirSync('dist', { recursive: true });
writeFileSync('dist/dashboard.js', combined);
writeFileSync('dist/_tmp.js', combined);

buildSync({
  entryPoints: ['dist/_tmp.js'],
  outfile: 'dist/dashboard.min.js',
  minify: true,
  sourcemap: true,
  target: 'es2020',
  bundle: false,
});

unlinkSync('dist/_tmp.js');

const origSize = combined.length;
const minSize = readFileSync('dist/dashboard.min.js', 'utf-8').length;
console.log(`✅ dist/dashboard.min.js`);
console.log(`   ${jsFiles.length} files → ${(origSize/1024).toFixed(1)}KB → ${(minSize/1024).toFixed(1)}KB minified (${((1-minSize/origSize)*100).toFixed(0)}% smaller)`);
