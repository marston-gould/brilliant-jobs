/**
 * FB-ATS-001-S4: ATS-005 (LinkedIn Keyword Alignment Nudge)
 * 
 * Session: ATS Pass Rate Improvement — Phase 4 (Final)
 * Date: 2026-03-16
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

// ════════════════════════════════════════════════════════════
// 1. LinkedIn Alignment Module — Core Logic
// ════════════════════════════════════════════════════════════
describe('ATS-005: linkedin-alignment.js — Core', () => {
  const src = readFile('js/linkedin-alignment.js');

  it('file exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'js/linkedin-alignment.js'))).toBe(true);
  });

  it('exports checkLinkedInAlignment to window', () => {
    expect(src).toContain('window.checkLinkedInAlignment');
  });

  it('reads linkedin_profiles table (skills_array, experience_json, headline)', () => {
    expect(src).toContain("from('linkedin_profiles')");
    expect(src).toContain('skills_array');
    expect(src).toContain('experience_json');
    expect(src).toContain('headline');
  });

  it('compares resume keywords against LinkedIn text', () => {
    expect(src).toContain('linkedInText.indexOf(kw)');
  });

  it('minimum 3-keyword gap threshold', () => {
    expect(src).toContain('gaps.length < 3');
  });

  it('caps gaps at 8', () => {
    expect(src).toContain('gaps.slice(0, 8)');
  });
});

// ════════════════════════════════════════════════════════════
// 2. Once-Per-Day Cap
// ════════════════════════════════════════════════════════════
describe('ATS-005: Once-Per-Day Cap', () => {
  const src = readFile('js/linkedin-alignment.js');

  it('tracks _linkedinAlignmentCheckedToday flag', () => {
    expect(src).toContain('_linkedinAlignmentCheckedToday');
  });

  it('reads last check from localStorage', () => {
    expect(src).toContain('bj_linkedin_alignment_last');
    expect(src).toContain('localStorage.getItem');
  });

  it('compares dates (toDateString)', () => {
    expect(src).toContain('toDateString()');
  });

  it('sets last check timestamp on check', () => {
    expect(src).toContain("localStorage.setItem('bj_linkedin_alignment_last'");
  });

  it('returns early if already checked today', () => {
    expect(src).toContain('if (_linkedinAlignmentCheckedToday) return');
  });
});

// ════════════════════════════════════════════════════════════
// 3. Resume Keyword Sources
// ════════════════════════════════════════════════════════════
describe('ATS-005: Resume Keyword Sources', () => {
  const src = readFile('js/linkedin-alignment.js');

  it('reads from readinessCache', () => {
    expect(src).toContain('readinessCache');
    expect(src).toContain('topMatched');
  });

  it('reads from jobMatchScores', () => {
    expect(src).toContain('jobMatchScores');
    expect(src).toContain('key_matches');
  });

  it('deduplicates keywords', () => {
    expect(src).toContain('indexOf(v) === i');
  });
});

// ════════════════════════════════════════════════════════════
// 4. Suggestion Heuristics
// ════════════════════════════════════════════════════════════
describe('ATS-005: Suggestion Heuristics', () => {
  const src = readFile('js/linkedin-alignment.js');

  it('classifies tool-like keywords to Skills section', () => {
    expect(src).toContain("section: 'Skills'");
  });

  it('classifies soft skills to Summary section', () => {
    expect(src).toContain("section: 'Summary'");
  });

  it('defaults to Experience section', () => {
    expect(src).toContain("section: 'Experience'");
  });

  it('generates per-keyword suggestion text', () => {
    expect(src).toContain('suggestion:');
    expect(src).toContain('Add "');
  });
});

// ════════════════════════════════════════════════════════════
// 5. Nudge UI
// ════════════════════════════════════════════════════════════
describe('ATS-005: Nudge UI', () => {
  const src = readFile('js/linkedin-alignment.js');

  it('creates fixed-position notification card', () => {
    expect(src).toContain('bj-linkedin-alignment-nudge');
    expect(src).toContain('position:fixed');
    expect(src).toContain('bottom:20px');
    expect(src).toContain('right:20px');
  });

  it('shows keyword gap header with company context', () => {
    expect(src).toContain('LinkedIn Keyword Gap');
    expect(src).toContain('companyName');
  });

  it('renders per-keyword chips with section badges', () => {
    expect(src).toContain('sectionColor');
    expect(src).toContain('s.section');
    expect(src).toContain('s.keyword');
  });

  it('has Update LinkedIn CTA linking to profile', () => {
    expect(src).toContain('https://www.linkedin.com/in/me/');
    expect(src).toContain('Update LinkedIn');
  });

  it('has dismiss button', () => {
    expect(src).toContain('Dismiss');
    expect(src).toContain('_dismissLinkedInNudge');
  });

  it('has suppress option for role type', () => {
    expect(src).toContain('show for this role type');
  });

  it('auto-dismisses after 30 seconds', () => {
    expect(src).toContain('30000');
    expect(src).toContain('setTimeout');
  });

  it('removes existing nudge before showing new one', () => {
    expect(src).toContain("document.getElementById('bj-linkedin-alignment-nudge')");
    expect(src).toContain('existing.remove()');
  });
});

// ════════════════════════════════════════════════════════════
// 6. PostHog Events
// ════════════════════════════════════════════════════════════
describe('ATS-005: PostHog Events', () => {
  const src = readFile('js/linkedin-alignment.js');

  it('fires linkedin_alignment_nudge_shown', () => {
    expect(src).toContain("capturePostHog('linkedin_alignment_nudge_shown'");
  });

  it('includes gap_count and keywords in shown event', () => {
    expect(src).toContain('gap_count: gaps.length');
    expect(src).toContain('keywords: gaps');
  });

  it('fires linkedin_alignment_nudge_dismissed', () => {
    expect(src).toContain("capturePostHog('linkedin_alignment_nudge_dismissed'");
  });

  it('fires linkedin_alignment_cta_clicked', () => {
    expect(src).toContain("capturePostHog('linkedin_alignment_cta_clicked'");
  });
});

// ════════════════════════════════════════════════════════════
// 7. Apply Workflow Integration
// ════════════════════════════════════════════════════════════
describe('ATS-005: Apply Workflow Integration', () => {
  const src = readFile('js/apply-workflow.js');

  it('calls checkLinkedInAlignment after worker submission success', () => {
    expect(src).toContain("typeof checkLinkedInAlignment === 'function'");
    expect(src).toContain('checkLinkedInAlignment(');
  });

  it('calls checkLinkedInAlignment after proceedToApply completion', () => {
    // The second call at the end of proceedToApply
    const matches = src.match(/checkLinkedInAlignment\(/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('passes jobId, jobTitle, companyName to check', () => {
    expect(src).toContain('checkLinkedInAlignment(jobId, jobTitle, companyName)');
  });
});

// ════════════════════════════════════════════════════════════
// 8. Build Integration
// ════════════════════════════════════════════════════════════
describe('ATS-005: Build Integration', () => {
  const build = readFile('build.js');

  it('linkedin-alignment.js in deferred chunk', () => {
    expect(build).toContain('linkedin-alignment.js');
  });
});

// ════════════════════════════════════════════════════════════
// 9. No Silent Failures
// ════════════════════════════════════════════════════════════
describe('ATS-005: No Silent Failures', () => {
  const src = readFile('js/linkedin-alignment.js');

  it('uses reportError on catch', () => {
    expect(src).toContain("reportError('linkedin-alignment'");
  });

  it('logs warnings to console', () => {
    expect(src).toContain('[linkedin-alignment] Error:');
  });

  it('typeof guards on external dependencies', () => {
    expect(src).toContain("typeof sb === 'undefined'");
    expect(src).toContain("typeof currentUser === 'undefined'");
    expect(src).toContain("typeof capturePostHog === 'function'");
    expect(src).toContain("typeof escapeHtml === 'function'");
  });
});

// ════════════════════════════════════════════════════════════
// 10. File Inventory
// ════════════════════════════════════════════════════════════
describe('File Inventory', () => {
  const files = [
    'js/linkedin-alignment.js',
    'js/apply-workflow.js',
    'build.js',
  ];
  files.forEach(f => {
    it(`${f} exists`, () => {
      expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
    });
  });
});
