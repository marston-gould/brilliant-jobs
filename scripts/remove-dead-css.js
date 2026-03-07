#!/usr/bin/env node
/* CS-P1-009 CSS-004: Remove confirmed dead CSS classes from input.css */
const fs = require('fs');

const DEAD_CLASSES = new Set([
  'admin-delta', 'admin-period-toggle', 'admin-tabs',
  'ai-panel-actions', 'ai-panel-grid', 'ai-panel-header',
  'ai-panel-score', 'ai-panel-score-label', 'ai-panel-score-num',
  'ai-panel-section', 'ai-panel-section-title', 'ai-upgrade-prompt',
  'app-hero', 'app-settings-btn', 'app-settings-header', 'app-settings-tabs',
  'badge-soon', 'badge-warm', 'btn-lg', 'card-flush',
  'fas-title', 'ghost-bar', 'ghost-bar-fill', 'ghost-hero',
  'match-high', 'match-low', 'match-med',
  'pa-score-high', 'pa-score-low', 'pa-score-mid',
  'qb-salary-field', 'qb-salary-input', 'qb-salary-row', 'qb-salary-sep',
  'resume-card', 'resume-match-item', 'resume-match-list',
  'resume-match-score', 'resume-row', 'seo-loading',
  'sg-score-high', 'sg-score-low', 'sg-score-mid', 'sg-score-none',
  'sort-bar-label', 'source-pills',
  'top-co-count', 'top-co-name', 'top-co-rank', 'top-co-row',
  'tuning-level-cb',
  // Dead utility classes (added in DS1-3 but never used)
  'u-empty-sm', 'u-flex-center', 'u-flex-gap-6', 'u-fs-10',
  'u-fs-13', 'u-fs-14', 'u-fw-600', 'u-fw-700', 'u-text-accent',
  'u-text-green', 'u-text-red', 'u-text-warn',
  'u-flex', 'u-mt-4', 'u-mb-4', 'u-mb-6',
]);

const file = 'src/input.css';
const css = fs.readFileSync(file, 'utf8');
const lines = css.split('\n');
const out = [];
let skipping = false;
let braceDepth = 0;
let removedRules = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  if (skipping) {
    // Count braces to find end of rule
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
    }
    if (braceDepth <= 0) {
      skipping = false;
      braceDepth = 0;
      removedRules++;
    }
    continue;
  }

  // Check if this line starts a dead class rule
  const match = line.match(/^\s+\.([a-zA-Z][a-zA-Z0-9_-]+)\s*\{/);
  if (match && DEAD_CLASSES.has(match[1])) {
    skipping = true;
    braceDepth = 0;
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
    }
    if (braceDepth <= 0) {
      skipping = false;
      braceDepth = 0;
      removedRules++;
    }
    continue;
  }

  // Check for single-line rules: .class { ... }
  const singleLine = line.match(/^\s+\.([a-zA-Z][a-zA-Z0-9_-]+)\s*\{[^}]+\}\s*$/);
  if (singleLine && DEAD_CLASSES.has(singleLine[1])) {
    removedRules++;
    continue;
  }

  out.push(line);
}

fs.writeFileSync(file, out.join('\n'));
console.log(`Removed ${removedRules} dead CSS rules (${DEAD_CLASSES.size} targeted)`);
console.log(`Lines: ${lines.length} → ${out.length} (removed ${lines.length - out.length})`);
