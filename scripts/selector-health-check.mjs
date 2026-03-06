#!/usr/bin/env node
// scripts/selector-health-check.mjs — CS-017: Weekly CI selector monitoring
// FIX-17 (EXT-FE-004): Runs Playwright against live ATS sites to validate
// that our extension's selectors still resolve on real pages.
//
// Usage:
//   node scripts/selector-health-check.mjs
//   node scripts/selector-health-check.mjs --report-only  (skip live checks, validate registry)
//
// Output: selector-health-report.json in the repo root
//
// Exit codes:
//   0 — all critical selectors healthy (or no monitorable URLs)
//   1 — one or more critical selector groups broken on live sites
//   2 — registry structure errors

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Dynamic import of registry (ESM) ──
async function loadRegistry() {
  const registryPath = join(ROOT, 'extension/selectors/registry.js');
  const module = await import(`file://${registryPath}`);
  return module.SELECTOR_REGISTRY;
}

// ── Registry Validation ──
function validateRegistry(registry) {
  const errors = [];

  if (!Array.isArray(registry)) {
    errors.push('SELECTOR_REGISTRY is not an array');
    return { valid: false, errors };
  }

  const handlerNames = new Set();
  const expectedHandlers = [
    'linkedin-easy-apply', 'greenhouse-react', 'greenhouse-legacy',
    'lever', 'workday', 'workday-experience', 'indeed', 'ashby',
    'icims', 'smartrecruiters', 'taleo', 'workable', 'recruitee',
    'avature', 'generic',
  ];

  for (const entry of registry) {
    if (!entry.handler) {
      errors.push('Entry missing handler name');
      continue;
    }

    handlerNames.add(entry.handler);

    if (!entry.selectors || typeof entry.selectors !== 'object') {
      errors.push(`${entry.handler}: missing selectors object`);
      continue;
    }

    let hasCritical = false;
    for (const [category, val] of Object.entries(entry.selectors)) {
      if (!val.selectors || !Array.isArray(val.selectors) || val.selectors.length === 0) {
        errors.push(`${entry.handler}.${category}: empty or invalid selectors array`);
      }
      if (val.critical) hasCritical = true;
    }

    if (!hasCritical) {
      errors.push(`${entry.handler}: no critical selectors defined`);
    }
  }

  for (const expected of expectedHandlers) {
    if (!handlerNames.has(expected)) {
      errors.push(`Missing handler: ${expected}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Live Site Health Check (Playwright) ──
async function runLiveChecks(registry) {
  const monitorable = registry.filter(entry =>
    entry.sampleUrls && entry.sampleUrls.length > 0 && !entry.authRequired
  );

  if (monitorable.length === 0) {
    console.log('⚠️  No monitorable URLs configured — skipping live checks');
    return { results: [], skipped: true };
  }

  let chromium;
  try {
    const pw = await import('playwright');
    chromium = pw.chromium;
  } catch (e) {
    console.error('❌ Playwright not installed. Run: npm install -D playwright && npx playwright install chromium');
    return { results: [], error: 'playwright_not_installed' };
  }

  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const entry of monitorable) {
    for (const url of entry.sampleUrls) {
      console.log(`\n🔍 Testing ${entry.handler} → ${url}`);

      const handlerResult = {
        handler: entry.handler,
        url,
        timestamp: new Date().toISOString(),
        categories: {},
        healthy: true,
        criticalFailures: 0,
      };

      try {
        const page = await browser.newPage();
        await page.setViewportSize({ width: 1280, height: 800 });

        // Navigate with generous timeout — ATS sites can be slow
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait for dynamic content to render
        await page.waitForTimeout(3000);

        for (const [category, val] of Object.entries(entry.selectors)) {
          const catResult = {
            description: val.description,
            critical: val.critical,
            selectorsChecked: val.selectors.length,
            selectorsFound: 0,
            matches: {},
          };

          for (const selector of val.selectors) {
            try {
              const count = await page.evaluate((sel) => {
                return document.querySelectorAll(sel).length;
              }, selector);

              catResult.matches[selector] = count;
              if (count > 0) catResult.selectorsFound++;
            } catch (e) {
              catResult.matches[selector] = `ERROR: ${e.message.substring(0, 100)}`;
            }
          }

          // A category passes if at least one selector matched
          catResult.passed = catResult.selectorsFound > 0;

          if (!catResult.passed && catResult.critical) {
            handlerResult.healthy = false;
            handlerResult.criticalFailures++;
          }

          handlerResult.categories[category] = catResult;
        }

        await page.close();
      } catch (e) {
        handlerResult.error = e.message.substring(0, 200);
        handlerResult.healthy = false;
        console.log(`  ❌ Page load failed: ${handlerResult.error}`);
      }

      // Log summary
      const cats = Object.values(handlerResult.categories);
      const passed = cats.filter(c => c.passed).length;
      const total = cats.length;
      const icon = handlerResult.healthy ? '✅' : '❌';
      console.log(`  ${icon} ${entry.handler}: ${passed}/${total} categories passed`);

      results.push(handlerResult);
    }
  }

  await browser.close();
  return { results, skipped: false };
}

// ── Report Generation ──
function generateReport(registryValidation, liveResults, registry) {
  // Count selectors
  let totalSelectors = 0;
  let criticalSelectors = 0;
  for (const entry of registry) {
    for (const [, v] of Object.entries(entry.selectors)) {
      totalSelectors += v.selectors.length;
      if (v.critical) criticalSelectors += v.selectors.length;
    }
  }

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      version: 'CS-017',
      registeredHandlers: registry.length,
      totalSelectors,
      criticalSelectors,
    },
    registryValidation,
    liveResults: liveResults.results,
    liveResultsSkipped: liveResults.skipped || false,
    summary: {
      registryValid: registryValidation.valid,
      handlersChecked: liveResults.results.length,
      handlersHealthy: liveResults.results.filter(r => r.healthy).length,
      handlersUnhealthy: liveResults.results.filter(r => !r.healthy).length,
      totalCriticalFailures: liveResults.results.reduce((sum, r) => sum + (r.criticalFailures || 0), 0),
      overallHealthy: registryValidation.valid &&
        liveResults.results.every(r => r.healthy),
    },
  };
}

// ── Main ──
async function main() {
  const reportOnly = process.argv.includes('--report-only');

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  CS-017: Extension Selector Health Monitor       ║');
  console.log('║  FIX-17 (EXT-FE-004)                           ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  // Step 1: Load registry
  let registry;
  try {
    registry = await loadRegistry();
    console.log(`✅ Registry loaded: ${registry.length} handlers`);
  } catch (e) {
    console.error(`❌ Registry load error: ${e.message}`);
    process.exit(2);
  }

  // Step 2: Validate registry structure
  const validation = validateRegistry(registry);
  if (!validation.valid) {
    console.error('\n❌ Registry validation failed:');
    for (const err of validation.errors) {
      console.error(`   - ${err}`);
    }
  } else {
    console.log('✅ Registry structure valid');
  }

  // Step 3: Live site checks (unless --report-only)
  let liveResults = { results: [], skipped: true };
  if (!reportOnly) {
    liveResults = await runLiveChecks(registry);
  } else {
    console.log('\n⏭  --report-only: skipping live site checks');
  }

  // Step 4: Generate report
  const report = generateReport(validation, liveResults, registry);
  const reportPath = join(ROOT, 'selector-health-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report written to: ${reportPath}`);

  // Step 5: Summary
  console.log('\n══════════════ SUMMARY ══════════════');
  console.log(`  Registry valid:        ${report.summary.registryValid ? '✅' : '❌'}`);
  console.log(`  Handlers registered:   ${report.meta.registeredHandlers}`);
  console.log(`  Total selectors:       ${report.meta.totalSelectors}`);
  console.log(`  Critical selectors:    ${report.meta.criticalSelectors}`);
  console.log(`  Live checks run:       ${report.summary.handlersChecked}`);
  console.log(`  Healthy:               ${report.summary.handlersHealthy}`);
  console.log(`  Critical failures:     ${report.summary.totalCriticalFailures}`);
  console.log(`  Overall status:        ${report.summary.overallHealthy ? '✅ HEALTHY' : '⚠️  ISSUES DETECTED'}`);
  console.log('════════════════════════════════════');

  // Exit code
  if (!validation.valid) process.exit(2);
  if (report.summary.totalCriticalFailures > 0) process.exit(1);
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(2);
});
