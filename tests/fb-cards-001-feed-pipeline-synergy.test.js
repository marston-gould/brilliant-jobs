/**
 * FB-CARDS-001 — Feed + Pipeline Card Synergy & Match Score Fix
 * Validates Fix A (match badge decoupled from Preview JD) and Fix B (pipeline row synergy)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf-8');

const jobFeedJs = read('js/job-feed.js');
const pipelineJs = read('js/pipeline.js');
const versionJs = read('js/version.js');

describe('FB-CARDS-001: Fix A — Match Score Decoupled from Preview JD', () => {
  it('match badge is computed outside showPreview block', () => {
    // Match data should be extracted before the showPreview conditional
    const metaRowSection = jobFeedJs.slice(
      jobFeedJs.indexOf('const metaParts = [];'),
      jobFeedJs.indexOf('// Action buttons')
    );
    expect(metaRowSection).toContain('_matchPct');
    expect(metaRowSection).toContain('_matchData');
    expect(metaRowSection).toContain('jobMatchScores');
  });

  it('match badge pushed to metaParts array (meta row)', () => {
    const metaRowSection = jobFeedJs.slice(
      jobFeedJs.indexOf('const metaParts = [];'),
      jobFeedJs.indexOf('// Action buttons')
    );
    expect(metaRowSection).toContain('metaParts.push');
    expect(metaRowSection).toContain('_matchPct');
    expect(metaRowSection).toContain('%');
  });

  it('match badge NOT inside showPreview block', () => {
    // The snippet section should not contain matchBadgeHtml anymore
    const snippetSection = jobFeedJs.slice(
      jobFeedJs.indexOf('// Preview JD snippet'),
      jobFeedJs.indexOf('// Card HTML')
    );
    expect(snippetSection).not.toContain('matchBadgeHtml');
    expect(snippetSection).not.toContain('matchPct');
    expect(snippetSection).not.toContain('% match');
  });

  it('preview snippet only contains jc-snippet div (no match badge)', () => {
    const snippetSection = jobFeedJs.slice(
      jobFeedJs.indexOf('// Preview JD snippet'),
      jobFeedJs.indexOf('// Card HTML')
    );
    expect(snippetSection).toContain('jc-snippet');
    expect(snippetSection).toContain('data-preview-id');
    // Should NOT have old match badge span
    expect(snippetSection).not.toContain('background:var(--accent);color:#fff');
  });

  it('color tiers: consistent blue pill with white text for all scores ≥40', () => {
    const metaRow = jobFeedJs.slice(
      jobFeedJs.indexOf('FB-CARDS-001 Fix A'),
      jobFeedJs.indexOf('// Action buttons')
    );
    expect(metaRow).toContain('--accent');
    expect(metaRow).toContain('#fff');
    // Should NOT have tiered green/amber/dim colors
    expect(metaRow).not.toContain('--green-dim');
    expect(metaRow).not.toContain('--warm-dim');
  });

  it('jobs below 40% match do not render badge', () => {
    const metaRow = jobFeedJs.slice(
      jobFeedJs.indexOf('FB-CARDS-001 Fix A'),
      jobFeedJs.indexOf('// Action buttons')
    );
    // The guard condition should check >= 40
    expect(metaRow).toContain('_matchPct >= 40');
  });

  it('PostHog feed_match_badge_visible event fires', () => {
    expect(jobFeedJs).toContain("'feed_match_badge_visible'");
    expect(jobFeedJs).toContain('preview_on');
    expect(jobFeedJs).toContain('jobs_with_score');
    expect(jobFeedJs).toContain('jobs_total');
  });
});

describe('FB-CARDS-001: Fix B — Pipeline Row Synergy', () => {
  describe('Location + Salary columns', () => {
    it('pipeline table header includes Location and Salary after Company', () => {
      // Headers are on line with Title/Company/Location/Salary/Level
      const headerLine = pipelineJs.match(/html \+= '.*<th>Title<\/th><th>Company<\/th><th>Location<\/th><th>Salary<\/th><th>Level<\/th>/);
      expect(headerLine).toBeTruthy();
    });

    it('pipeline row renders location cell', () => {
      expect(pipelineJs).toContain('_plLoc');
      expect(pipelineJs).toContain('window.formatLocation');
    });

    it('pipeline row renders salary cell', () => {
      expect(pipelineJs).toContain('_plSal');
      expect(pipelineJs).toContain('window.formatSalaryCell');
    });

    it('location cell truncates at 20 chars', () => {
      expect(pipelineJs).toContain("_plLoc.length > 20");
      expect(pipelineJs).toContain("_plLoc.slice(0, 20)");
    });
  });

  describe('Trust + Ghost badges in Pipeline', () => {
    it('fraud score cache is hydrated for pipeline jobs', () => {
      expect(pipelineJs).toContain('_plFraudCache');
      expect(pipelineJs).toContain('job_fraud_scores');
      expect(pipelineJs).toContain('fraud_score, fraud_label, confidence');
    });

    it('reuses existing _fraudScoreCache if available', () => {
      expect(pipelineJs).toContain("typeof _fraudScoreCache !== 'undefined'");
    });

    it('renders caution trust badge inline after title', () => {
      expect(pipelineJs).toContain('_plTrustBadge');
      expect(pipelineJs).toContain("_plTrust.label === 'caution'");
      expect(pipelineJs).toContain('alert-triangle');
      expect(pipelineJs).toContain('Caution');
    });

    it('renders suspicious trust badge inline after title', () => {
      expect(pipelineJs).toContain("_plTrust.label === 'suspicious'");
      expect(pipelineJs).toContain('shield-alert');
      expect(pipelineJs).toContain('Suspicious');
    });

    it('renders ghost badge inline after title when ghost score exists', () => {
      expect(pipelineJs).toContain('_plGhostBadge');
      expect(pipelineJs).toContain('_plGhostCount');
      expect(pipelineJs).toContain('_plGhostCache');
      expect(pipelineJs).toContain('x-circle');
      expect(pipelineJs).toContain('ghost');
    });

    it('title cell includes trust and ghost badges', () => {
      // The title td should include the badge variables
      const titleLine = pipelineJs.match(/html \+= '<td class="pl-title"[^>]*>.*_plTrustBadge.*_plGhostBadge/);
      expect(titleLine).toBeTruthy();
    });

    it('PostHog pipeline_trust_badge_rendered event fires', () => {
      expect(pipelineJs).toContain("'pipeline_trust_badge_rendered'");
      expect(pipelineJs).toContain('job_id: item.id');
      expect(pipelineJs).toContain('stage: stage');
    });

    it('PostHog pipeline_ghost_badge_rendered event fires', () => {
      expect(pipelineJs).toContain("'pipeline_ghost_badge_rendered'");
      expect(pipelineJs).toContain('ghost_count: _plGhostCount');
    });
  });

  describe('Match % color tier alignment', () => {
    it('pipeline uses same color tiers as feed: 80/60/40', () => {
      const matchLine = pipelineJs.slice(
        pipelineJs.indexOf('FB-CARDS-001: Match color tiers aligned'),
        pipelineJs.indexOf('FB-CARDS-001: Match color tiers aligned') + 500
      );
      expect(matchLine).toContain('>= 80');
      expect(matchLine).toContain('>= 60');
      expect(matchLine).toContain('>= 40');
      expect(matchLine).toContain('--green');
      expect(matchLine).toContain('--warm');
      expect(matchLine).toContain('--text-dim');
      expect(matchLine).toContain('--text-faint');
    });

    it('no longer uses old 70/40 thresholds', () => {
      // The old line had >= 70, should be gone
      const matchArea = pipelineJs.slice(
        pipelineJs.indexOf('const matchColor'),
        pipelineJs.indexOf('const matchColor') + 300
      );
      expect(matchArea).not.toContain('>= 70');
    });
  });

  describe('ats_jobs query extended', () => {
    it('includes salary_currency and salary_rate columns', () => {
      expect(pipelineJs).toContain('salary_currency');
      expect(pipelineJs).toContain('salary_rate');
    });

    it('ghost data fetched from ghost_company_scores table', () => {
      expect(pipelineJs).toContain('ghost_company_scores');
      expect(pipelineJs).toContain('effective_count');
    });
  });
});

describe('FB-CARDS-001: Shared function exports', () => {
  it('formatLocation exported to window from job-feed.js', () => {
    expect(jobFeedJs).toContain('window.formatLocation = formatLocation');
  });

  it('formatSalaryCell exported to window from job-feed.js', () => {
    expect(jobFeedJs).toContain('window.formatSalaryCell = formatSalaryCell');
  });
});

describe('FB-CARDS-001: Version + Build', () => {
  it('version is v10.37', () => {
    expect(versionJs).toContain('v10.37');
  });

  it('dashboard bundle exists and contains v10.37', () => {
    const bundle = read('dist/dashboard.min.js');
    expect(bundle).toContain('v10.37');
  });

  it('deferred bundle exists', () => {
    const bundle = read('dist/dashboard-deferred.min.js');
    expect(bundle.length).toBeGreaterThan(1000);
  });

  it('admin bundle exists', () => {
    const bundle = read('dist/admin.min.js');
    expect(bundle.length).toBeGreaterThan(1000);
  });

  it('pipeline chunk exists and contains _plFraudCache', () => {
    const bundle = read('dist/dashboard-pipeline.min.js');
    expect(bundle).toContain('_plFraudCache');
  });
});

describe('FB-CARDS-001: File inventory', () => {
  const expectedModified = [
    'js/job-feed.js',
    'js/pipeline.js',
    'js/version.js',
    'dist/dashboard.min.js',
    'dist/dashboard-deferred.min.js',
    'dist/dashboard-pipeline.min.js',
    'dist/admin.min.js',
    'styles.css',
  ];

  for (const f of expectedModified) {
    it(`${f} exists`, () => {
      expect(() => read(f)).not.toThrow();
    });
  }
});
