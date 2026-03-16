// tests/spec-lpg-001-s2-linkedin-optimizer.test.js
// SPEC-LPG-001 Session 2: LinkedIn Profile Optimizer (F3)
// 65 validation tests

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf-8');

// --- Section 1: Migration ---
describe('1. Migration — linkedin_optimizations table', () => {
  const sql = read('supabase/migrations/v9.71-lpg-001-s2-linkedin-optimizations.sql');

  it('1.1 Migration file exists', () => {
    expect(sql.length).toBeGreaterThan(200);
  });

  it('1.2 Creates linkedin_optimizations table', () => {
    expect(sql).toContain('CREATE TABLE');
    expect(sql).toContain('linkedin_optimizations');
  });

  it('1.3 Has user_id FK to auth.users', () => {
    expect(sql).toContain('REFERENCES auth.users(id)');
  });

  it('1.4 Has overall_score CHECK 0-100', () => {
    expect(sql).toContain('CHECK (overall_score BETWEEN 0 AND 100)');
  });

  it('1.5 Has sections_json JSONB', () => {
    expect(sql).toContain('sections_json JSONB');
  });

  it('1.6 Has top_actions TEXT[]', () => {
    expect(sql).toContain('top_actions TEXT[]');
  });

  it('1.7 Has expires_at with 7 day default', () => {
    expect(sql).toContain("INTERVAL '7 days'");
  });

  it('1.8 RLS enabled', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  });

  it('1.9 SELECT policy for users', () => {
    expect(sql).toContain('FOR SELECT USING (user_id = auth.uid())');
  });

  it('1.10 INSERT policy for users', () => {
    expect(sql).toContain('FOR INSERT WITH CHECK (user_id = auth.uid())');
  });

  it('1.11 Service role policy', () => {
    expect(sql).toContain('service_role');
  });

  it('1.12 User index', () => {
    expect(sql).toContain('idx_linkedin_opt_user');
  });

  it('1.13 Expires index', () => {
    expect(sql).toContain('idx_linkedin_opt_expires');
  });
});

// --- Section 2: Edge Function ---
describe('2. optimize-linkedin-profile EF', () => {
  const ef = read('supabase/functions/optimize-linkedin-profile/index.ts');

  it('2.1 EF exists and is non-trivial', () => {
    expect(ef.length).toBeGreaterThan(3000);
  });

  it('2.2 Has analyze action', () => {
    expect(ef).toContain("action === 'analyze'");
  });

  it('2.3 Reads linkedin_profiles table', () => {
    expect(ef).toContain("from('linkedin_profiles')");
  });

  it('2.4 Checks 7-day cache', () => {
    expect(ef).toContain('expires_at');
    expect(ef).toContain('cached');
  });

  it('2.5 Force bypass cache', () => {
    expect(ef).toContain('force');
  });

  it('2.6 Returns 404 when no profile', () => {
    expect(ef).toContain('No LinkedIn profile found');
    expect(ef).toContain('404');
  });

  it('2.7 Costs 2 credits', () => {
    expect(ef).toContain('credits_remaining - 2');
    expect(ef).toContain('costs 2 credits');
  });

  it('2.8 Uses anthropicFetch', () => {
    expect(ef).toContain('anthropicFetch');
  });

  it('2.9 System prompt scores 5 sections', () => {
    expect(ef).toContain('Headline');
    expect(ef).toContain('Summary');
    expect(ef).toContain('Experience');
    expect(ef).toContain('Skills');
    expect(ef).toContain('Education');
  });

  it('2.10 Section weights sum to 1.0', () => {
    expect(ef).toContain('headline: 0.20');
    expect(ef).toContain('summary: 0.25');
    expect(ef).toContain('experience: 0.30');
    expect(ef).toContain('skills: 0.15');
    expect(ef).toContain('education: 0.10');
  });

  it('2.11 Computes weighted score (not trusting LLM)', () => {
    expect(ef).toContain('computeWeightedScore');
  });

  it('2.12 Caches to linkedin_optimizations', () => {
    expect(ef).toContain("from('linkedin_optimizations').insert");
  });

  it('2.13 Structured error logging', () => {
    const logs = ef.match(/console\.error\(JSON\.stringify/g);
    expect(logs.length).toBeGreaterThanOrEqual(2);
  });

  it('2.14 Empty sections scored as 0', () => {
    expect(ef).toContain('score: 0');
  });

  it('2.15 Returns top_3_actions', () => {
    expect(ef).toContain('top_3_actions');
  });
});

// --- Section 3: Gateway Route ---
describe('3. API Gateway Route', () => {
  const gw = read('supabase/functions/api-gateway/index.ts');

  it('3.1 optimize-linkedin-profile route exists', () => {
    expect(gw).toContain('"optimize-linkedin-profile"');
  });
});

// --- Section 4: Dashboard HTML ---
describe('4. Dashboard HTML — LinkedIn Tab', () => {
  const html = read('dashboard.html');

  it('4.1 LinkedIn nav item exists', () => {
    expect(html).toContain('data-page="linkedin"');
  });

  it('4.2 LinkedIn page shell exists', () => {
    expect(html).toContain('id="page-linkedin"');
  });

  it('4.3 No profile CTA section', () => {
    expect(html).toContain('id="li-no-profile"');
  });

  it('4.4 Score section container', () => {
    expect(html).toContain('id="li-score-section"');
  });

  it('4.5 Score gauge container', () => {
    expect(html).toContain('id="li-score-gauge"');
  });

  it('4.6 Re-Analyze button', () => {
    expect(html).toContain('id="li-reanalyze-btn"');
    expect(html).toContain('_bjAnalyzeLinkedIn(true)');
  });

  it('4.7 Re-Analyze shows credit cost', () => {
    expect(html).toContain('2 credits');
  });

  it('4.8 Top actions banner', () => {
    expect(html).toContain('id="li-top-actions"');
  });

  it('4.9 Section cards container', () => {
    expect(html).toContain('id="li-sections"');
  });

  it('4.10 Loading skeleton', () => {
    expect(html).toContain('id="li-loading"');
  });

  it('4.11 Upload CTA links to Get Started', () => {
    expect(html).toContain("switchPage('brilliant')");
  });
});

// --- Section 5: Client JS ---
describe('5. linkedin.js — Client Code', () => {
  const js = read('js/linkedin.js');

  it('5.1 File exists and is non-trivial', () => {
    expect(js.length).toBeGreaterThan(1000);
  });

  it('5.2 _bjAnalyzeLinkedIn function', () => {
    expect(js).toContain('window._bjAnalyzeLinkedIn');
  });

  it('5.3 initLinkedInTab function', () => {
    expect(js).toContain('window.initLinkedInTab');
  });

  it('5.4 Score gauge SVG rendering', () => {
    expect(js).toContain('_renderScoreGauge');
    expect(js).toContain('<svg');
    expect(js).toContain('stroke-dasharray');
  });

  it('5.5 Section card rendering', () => {
    expect(js).toContain('_renderSectionCard');
  });

  it('5.6 Color coding by score', () => {
    expect(js).toContain('score >= 75');
    expect(js).toContain('score >= 50');
  });

  it('5.7 PostHog linkedin_optimizer_viewed', () => {
    expect(js).toContain("'linkedin_optimizer_viewed'");
  });

  it('5.8 PostHog linkedin_optimizer_analyzed', () => {
    expect(js).toContain("'linkedin_optimizer_analyzed'");
  });

  it('5.9 Calls api-gateway/optimize-linkedin-profile', () => {
    expect(js).toContain('optimize-linkedin-profile');
  });

  it('5.10 Handles 404 (no profile) gracefully', () => {
    expect(js).toContain('resp.status === 404');
  });

  it('5.11 Error handling with reportError', () => {
    expect(js).toContain("reportError('_bjAnalyzeLinkedIn'");
  });

  it('5.12 BJ namespace exports', () => {
    expect(js).toContain('window.BJ._bjAnalyzeLinkedIn');
    expect(js).toContain('window.BJ.initLinkedInTab');
  });

  it('5.13 Renders all 5 section cards in order', () => {
    expect(js).toContain("['headline', 'summary', 'experience', 'skills', 'education']");
  });

  it('5.14 Cache info display', () => {
    expect(js).toContain('li-cache-info');
  });
});

// --- Section 6: app.js Wiring ---
describe('6. app.js — LinkedIn Tab Wiring', () => {
  const app = read('js/app.js');

  it('6.1 linkedin in _bjPageTitles', () => {
    expect(app).toContain("linkedin: 'LinkedIn'");
  });

  it('6.2 linkedin in _bjPageSections', () => {
    expect(app).toContain("linkedin: 'search'");
  });

  it('6.3 Tab handler calls initLinkedInTab', () => {
    expect(app).toContain("_tab === 'linkedin'");
    expect(app).toContain('initLinkedInTab');
  });

  it('6.4 lastTab restore handler', () => {
    expect(app).toContain("lastTab === 'linkedin'");
  });
});

// --- Section 7: Build ---
describe('7. Build Configuration', () => {
  const build = read('build.js');

  it('7.1 linkedin.js in deferred chunk', () => {
    expect(build).toContain("'js/linkedin.js'");
  });
});

// --- Section 8: File Inventory ---
describe('8. File Inventory', () => {
  it('8.1 Migration file', () => {
    expect(existsSync(resolve(ROOT, 'supabase/migrations/v9.71-lpg-001-s2-linkedin-optimizations.sql'))).toBe(true);
  });
  it('8.2 EF file', () => {
    expect(existsSync(resolve(ROOT, 'supabase/functions/optimize-linkedin-profile/index.ts'))).toBe(true);
  });
  it('8.3 linkedin.js', () => {
    expect(existsSync(resolve(ROOT, 'js/linkedin.js'))).toBe(true);
  });
  it('8.4 Test file', () => {
    expect(existsSync(resolve(ROOT, 'tests/spec-lpg-001-s2-linkedin-optimizer.test.js'))).toBe(true);
  });
});
