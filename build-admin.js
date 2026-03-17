import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';

const jsFiles = [
  'js/version.ts',
  'js/globals.ts',
  'js/admin.ts',
  'js/admin-blocks.ts',
  'js/admin-companies.ts',
  'js/admin-jobs.ts',
  'js/admin-email.ts',
  'js/admin-notifications.ts',
  'js/admin-landing.ts',
  'js/admin-signals.ts',
  'js/admin-cron.ts',
  'js/admin-killswitch.ts',
  'js/admin-monitoring.ts',
  'js/admin-alerts.ts',
  'js/admin-error-replay.ts',
  'js/admin-client-errors.ts',
  'js/admin-ef-health.ts',
  'js/admin-db-activity.ts',
  'js/admin-posthog-insights.ts',
  'js/admin-feed-health.ts',
  'js/admin-cache-health.ts',
  'js/admin-enrichment.ts',
  'js/admin-seo.ts',
  'js/admin-content.ts',
  'js/admin-merch.ts',
  'js/admin-survey-manager.ts',
  'js/admin-referrals.ts',
  'js/admin-stripe.ts',
  'js/admin-subscription.ts',
  'js/admin-ghost.ts',
  'js/admin-templates.ts',
  'js/admin-revenue.ts',
  'js/admin-feedback.ts',
  'js/admin-notif-analytics.ts',
  'js/admin-biz-ops.ts',
  'js/admin-compliance.ts',
  'js/admin-shell.ts',
];

const combined = jsFiles.map(f => `// === ${f} ===\n${readFileSync(f, 'utf-8')}`).join('\n\n');

mkdirSync('dist', { recursive: true });
writeFileSync('dist/admin.js', combined);
writeFileSync('dist/_tmp_admin.ts', combined);

buildSync({
  entryPoints: ['dist/_tmp_admin.ts'],
  outfile: 'dist/admin.min.js',
  minifySyntax: true,
  minifyWhitespace: true,
  minifyIdentifiers: false,
  sourcemap: true,
  target: 'es2020',
  bundle: false,
});

unlinkSync('dist/_tmp_admin.ts');

const origSize = combined.length;
const minSize = readFileSync('dist/admin.min.js', 'utf-8').length;
console.log('dist/admin.min.js built');
console.log(jsFiles.length + ' files => ' + (origSize/1024).toFixed(1) + 'KB => ' + (minSize/1024).toFixed(1) + 'KB minified');
