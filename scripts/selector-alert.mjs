#!/usr/bin/env node
// scripts/selector-alert.mjs — CS-017: Alert on selector breakage
// Reads selector-health-report.json and sends alert email via Resend
// when critical failures are detected.
//
// Usage: node scripts/selector-alert.mjs
//
// Requires: RESEND_API_KEY environment variable

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function sendAlert(report) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error('❌ RESEND_API_KEY not set — cannot send alert email');
    // Still log to stdout for CI visibility
    console.log('\n📧 ALERT (email not sent — no API key):');
    console.log(formatAlertBody(report));
    return;
  }

  const body = {
    from: 'Brilliant Jobs CI <ci@brilliantjobs.app>',
    to: ['marston@brilliantjobs.app'],
    subject: `⚠️ Selector Health Alert: ${report.summary.totalCriticalFailures} critical failure(s)`,
    html: formatAlertHtml(report),
    text: formatAlertBody(report),
  };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`✅ Alert email sent: ${data.id}`);
    } else {
      const err = await res.text();
      console.error(`❌ Resend API error (${res.status}): ${err}`);
    }
  } catch (e) {
    console.error(`❌ Failed to send alert: ${e.message}`);
  }
}

function formatAlertBody(report) {
  const lines = [
    'Extension Selector Health Check — ALERT',
    `Generated: ${report.meta.generatedAt}`,
    `Handlers Registered: ${report.meta.registeredHandlers}`,
    `Registry Valid: ${report.summary.registryValid}`,
    '',
    `=== FAILURES ===`,
  ];

  if (!report.summary.registryValid) {
    lines.push('');
    lines.push('Registry validation errors:');
    for (const err of report.registryValidation.errors) {
      lines.push(`  - ${err}`);
    }
  }

  for (const result of report.liveResults) {
    if (!result.healthy) {
      lines.push('');
      lines.push(`--- ${result.handler} (${result.url}) ---`);
      if (result.error) {
        lines.push(`  Page load error: ${result.error}`);
      }
      for (const [cat, catResult] of Object.entries(result.categories || {})) {
        if (!catResult.passed && catResult.critical) {
          lines.push(`  ❌ ${cat} (critical): 0/${catResult.selectorsChecked} selectors matched`);
          for (const [sel, count] of Object.entries(catResult.matches)) {
            lines.push(`     ${sel} → ${count}`);
          }
        }
      }
    }
  }

  lines.push('');
  lines.push('Action required: Review the failing selectors and update handlers.');
  lines.push('Full report: selector-health-report.json in the repo.');

  return lines.join('\n');
}

function formatAlertHtml(report) {
  const failures = report.liveResults.filter(r => !r.healthy);

  let html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #d32f2f;">⚠️ Extension Selector Health Alert</h2>
  <p style="color: #666;">Generated: ${report.meta.generatedAt}</p>

  <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Handlers Registered</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${report.meta.registeredHandlers}</td>
    </tr>
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Critical Failures</td>
      <td style="padding: 8px; border: 1px solid #ddd; color: #d32f2f; font-weight: bold;">${report.summary.totalCriticalFailures}</td>
    </tr>
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Registry Valid</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${report.summary.registryValid ? '✅' : '❌'}</td>
    </tr>
  </table>`;

  if (!report.summary.registryValid) {
    html += `
  <h3 style="color: #d32f2f;">Registry Validation Errors</h3>
  <ul>
    ${report.registryValidation.errors.map(e => `<li>${e}</li>`).join('\n    ')}
  </ul>`;
  }

  for (const result of failures) {
    html += `
  <h3 style="color: #d32f2f;">${result.handler}</h3>
  <p style="color: #666; font-size: 13px;">${result.url}</p>`;

    if (result.error) {
      html += `<p style="color: #d32f2f;">Page load error: ${result.error}</p>`;
    }

    for (const [cat, catResult] of Object.entries(result.categories || {})) {
      if (!catResult.passed && catResult.critical) {
        html += `
  <div style="background: #fef2f2; border-left: 4px solid #d32f2f; padding: 8px 12px; margin: 8px 0;">
    <strong>❌ ${cat}</strong> (${catResult.description})<br>
    <span style="font-size: 13px; color: #666;">0 of ${catResult.selectorsChecked} selectors matched</span>
    <pre style="font-size: 12px; background: #fff; padding: 8px; margin: 8px 0; overflow-x: auto;">${
      Object.entries(catResult.matches).map(([sel, count]) => `${sel} → ${count}`).join('\n')
    }</pre>
  </div>`;
      }
    }
  }

  html += `
  <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;">
  <p style="color: #999; font-size: 12px;">Sent by Brilliant Jobs CI (CS-017: selector-monitor.yml)</p>
</div>`;

  return html;
}

// ── Main ──
async function main() {
  const reportPath = join(ROOT, 'selector-health-report.json');
  let report;

  try {
    report = JSON.parse(readFileSync(reportPath, 'utf-8'));
  } catch (e) {
    console.error(`❌ Cannot read report: ${reportPath}`);
    console.error('   Run selector-health-check.mjs first.');
    process.exit(1);
  }

  if (report.summary.overallHealthy) {
    console.log('✅ All selectors healthy — no alert needed.');
    process.exit(0);
  }

  console.log('⚠️  Issues detected — sending alert...');
  await sendAlert(report);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
