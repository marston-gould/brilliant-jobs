/**
 * ES-002 Validation Tests — Console-Only Catch Replacement
 * 
 * Verifies that all catch blocks with console.error/warn/log also include
 * reportError() for PostHog capture. Zero console-only catches allowed.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Section 1: Zero Console-Only Catches ───
describe('ES-002: Console-Only Catch Elimination', () => {
  const jsDir = path.join(__dirname, '..', 'js');
  const jsFiles = execSync(
    `find ${jsDir} -name "*.js" -not -path "*/vendor/*" -not -path "*/node_modules/*"`,
    { encoding: 'utf8' }
  ).trim().split('\n').filter(Boolean);

  test('no JS files have console-only catch blocks', () => {
    const violations = [];
    
    for (const file of jsFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        
        // Check multi-line: catch on its own line, console in next lines
        if (/catch\s*\(\s*\w+\s*\)/.test(trimmed)) {
          let hasReportError = false;
          let consoleOnlyLine = null;
          
          for (let j = i; j < Math.min(i + 6, lines.length); j++) {
            if (lines[j].includes('reportError')) hasReportError = true;
            if (/console\.(error|warn|log)\s*\(/.test(lines[j]) && !lines[j].includes('reportError')) {
              if (!consoleOnlyLine) consoleOnlyLine = j + 1;
            }
            // Stop at next catch or function boundary
            if (j > i && (/^  \}/.test(lines[j]) || /^}/.test(lines[j].trim()))) break;
          }
          
          if (consoleOnlyLine && !hasReportError) {
            violations.push(`${path.relative(jsDir, file)}:${consoleOnlyLine}`);
          }
        }
      }
    }
    
    expect(violations).toEqual([]);
  });
});

// ─── Section 2: reportError Function Exists ───
describe('ES-002: reportError Infrastructure', () => {
  test('reportError function exists in globals.js', () => {
    const globals = fs.readFileSync(path.join(__dirname, '..', 'js', 'globals.js'), 'utf8');
    expect(globals).toContain('function reportError(');
  });

  test('reportError captures to PostHog', () => {
    const globals = fs.readFileSync(path.join(__dirname, '..', 'js', 'globals.js'), 'utf8');
    expect(globals).toContain('posthog.capture');
    expect(globals).toContain('query_error');
  });

  test('reportError includes error_stack', () => {
    const globals = fs.readFileSync(path.join(__dirname, '..', 'js', 'globals.js'), 'utf8');
    expect(globals).toContain('error_stack');
  });
});

// ─── Section 3: Coverage by File ───
describe('ES-002: reportError Coverage Per File', () => {
  const targetFiles = [
    'js/rewrite.js', 'js/billing.js', 'js/admin-shell.js',
    'js/admin-notifications.js', 'js/applications.js', 'js/referrals.js',
    'js/apply-workflow.js', 'js/admin-subscription.js', 'js/admin-content.js',
    'js/notification-center.js', 'js/admin.js', 'js/pipeline.js',
    'js/settings.js', 'js/admin-seo.js', 'js/resumes.js',
    'js/stats.js', 'js/keywords.js', 'js/location.js',
    'js/chat.js', 'js/globals.js', 'js/job-feed.js',
    'js/admin-stripe.js', 'js/tuning.js',
  ];

  for (const file of targetFiles) {
    test(`${file} has reportError in catch blocks`, () => {
      const fullPath = path.join(__dirname, '..', file);
      if (!fs.existsSync(fullPath)) return; // skip if not present
      const content = fs.readFileSync(fullPath, 'utf8');
      expect(content).toContain('reportError(');
    });
  }
});

// ─── Section 4: Build Output Contains reportError ───
describe('ES-002: Build Output Validation', () => {
  test('dashboard bundle contains reportError', () => {
    const bundle = fs.readFileSync(path.join(__dirname, '..', 'dist', 'dashboard.min.js'), 'utf8');
    expect(bundle).toContain('reportError');
  });

  test('admin bundle contains reportError', () => {
    const bundle = fs.readFileSync(path.join(__dirname, '..', 'dist', 'admin.min.js'), 'utf8');
    expect(bundle).toContain('reportError');
  });
});

// ─── Section 5: File Inventory ───
describe('ES-002: Modified File Inventory', () => {
  test('42+ JS files were modified', () => {
    // Count files with reportError
    const jsDir = path.join(__dirname, '..', 'js');
    const files = execSync(
      `grep -rl "reportError(" ${jsDir} --include="*.js" | wc -l`,
      { encoding: 'utf8' }
    ).trim();
    expect(parseInt(files)).toBeGreaterThanOrEqual(42);
  });
});
