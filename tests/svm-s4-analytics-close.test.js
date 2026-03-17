/**
 * FB-SURVEY-ADMIN-001 SVM-S4: Analytics + Response Viewer + Close
 * Tests: analytics EF action, responses EF action, CSV export, admin UI wiring
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function readFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf-8'); }

// ─── 1. EF Analytics Action ─────────────────────────────────────────────────
describe('SVM-S4: admin-survey-manager analytics action', () => {
  const ef = readFile('supabase/functions/admin-survey-manager/index.ts');

  it('has analytics action in router', () => {
    expect(ef).toContain("case \"analytics\"");
    expect(ef).toContain('handleAnalytics');
  });
  it('requires survey_version param', () => {
    expect(ef).toContain('survey_version required');
  });
  it('counts total responses', () => {
    expect(ef).toContain('totalCount');
    expect(ef).toContain("count: \"exact\"");
  });
  it('counts 7d and 30d responses', () => {
    expect(ef).toContain('count7d');
    expect(ef).toContain('count30d');
    expect(ef).toContain('7 * 86400000');
    expect(ef).toContain('30 * 86400000');
  });
  it('sums credits granted', () => {
    expect(ef).toContain("source\", \"survey_reward\"");
    expect(ef).toContain('totalCredits');
  });
  it('returns avg_credits', () => {
    expect(ef).toContain('avg_credits');
  });
  it('returns channel breakdown', () => {
    expect(ef).toContain('channel_breakdown');
    expect(ef).toContain("notification_log");
  });
});

// ─── 2. EF Responses Action ─────────────────────────────────────────────────
describe('SVM-S4: admin-survey-manager responses action', () => {
  const ef = readFile('supabase/functions/admin-survey-manager/index.ts');

  it('has responses action in router', () => {
    expect(ef).toContain("case \"responses\"");
    expect(ef).toContain('handleResponses');
  });
  it('supports pagination (page + page_size)', () => {
    expect(ef).toContain('page');
    expect(ef).toContain('pageSize');
    expect(ef).toContain('.range(');
  });
  it('anonymizes user emails', () => {
    expect(ef).toContain('email_anon');
    expect(ef).toContain('***');
  });
  it('enriches with credits_earned', () => {
    expect(ef).toContain('credits_earned');
    expect(ef).toContain('creditMap');
  });
  it('returns has_more for pagination', () => {
    expect(ef).toContain('has_more');
  });
});

// ─── 3. EF CSV Export Action ─────────────────────────────────────────────────
describe('SVM-S4: admin-survey-manager CSV export', () => {
  const ef = readFile('supabase/functions/admin-survey-manager/index.ts');

  it('has export_csv action in router', () => {
    expect(ef).toContain("case \"export_csv\"");
    expect(ef).toContain('handleExportCsv');
  });
  it('builds CSV header with answer columns', () => {
    expect(ef).toContain('answerCols');
    expect(ef).toContain('header');
  });
  it('flattens answers JSONB into CSV columns', () => {
    expect(ef).toContain('allKeys');
    expect(ef).toContain('ansVals');
  });
  it('returns Content-Type text/csv', () => {
    expect(ef).toContain('text/csv');
  });
  it('returns Content-Disposition attachment', () => {
    expect(ef).toContain('Content-Disposition');
    expect(ef).toContain('attachment');
  });
});

// ─── 4. Admin Panel Analytics UI ─────────────────────────────────────────────
describe('SVM-S4: Admin panel analytics UI', () => {
  const js = readFile('js/admin-survey-manager.js');

  it('has svmShowAnalytics function', () => {
    expect(js).toContain('window.svmShowAnalytics');
  });
  it('response count in table is clickable to open analytics', () => {
    expect(js).toContain('svmShowAnalytics');
    expect(js).toContain('response_count');
  });
  it('shows stat cards (total, 7d, 30d, credits, avg)', () => {
    expect(js).toContain('_svmStatCard');
    expect(js).toContain('Total Responses');
    expect(js).toContain('Last 7 Days');
    expect(js).toContain('Last 30 Days');
    expect(js).toContain('Credits Granted');
  });
  it('shows channel breakdown', () => {
    expect(js).toContain('Channel Breakdown');
    expect(js).toContain('channel_breakdown');
  });
  it('has back to campaigns button', () => {
    expect(js).toContain('svmBackToList');
    expect(js).toContain('Back to campaigns');
  });
  it('has export CSV button', () => {
    expect(js).toContain('svmExportCsv');
    expect(js).toContain('Export CSV');
  });
});

// ─── 5. Admin Panel Response Viewer ──────────────────────────────────────────
describe('SVM-S4: Admin panel response viewer', () => {
  const js = readFile('js/admin-survey-manager.js');

  it('loads responses with pagination', () => {
    expect(js).toContain('svmLoadResponses');
    expect(js).toContain('_svmResponsePage');
  });
  it('shows anonymized email', () => {
    expect(js).toContain('email_anon');
  });
  it('shows date and credits per response', () => {
    expect(js).toContain('credits_earned');
    expect(js).toContain('toLocaleDateString');
  });
  it('has expand/collapse per response', () => {
    expect(js).toContain('svm-resp-');
    expect(js).toContain("display===\\'none\\'");
  });
  it('renders answer key-value pairs', () => {
    expect(js).toContain('r.answers');
    expect(js).toContain('Object.keys');
  });
  it('has load more button', () => {
    expect(js).toContain('svmLoadMoreResponses');
    expect(js).toContain('svm-responses-more');
  });
});

// ─── 6. CSV Export Client ────────────────────────────────────────────────────
describe('SVM-S4: CSV export client', () => {
  const js = readFile('js/admin-survey-manager.js');

  it('svmExportCsv calls EF with export_csv action', () => {
    expect(js).toContain("action: 'export_csv'");
  });
  it('creates Blob and triggers download', () => {
    expect(js).toContain('Blob');
    expect(js).toContain('createObjectURL');
    expect(js).toContain('.download =');
  });
  it('cleans up after download', () => {
    expect(js).toContain('revokeObjectURL');
    expect(js).toContain('removeChild');
  });
});

// ─── 7. Error Handling ──────────────────────────────────────────────────────
describe('SVM-S4: Error handling', () => {
  const ef = readFile('supabase/functions/admin-survey-manager/index.ts');
  const js = readFile('js/admin-survey-manager.js');

  it('EF has no empty catch blocks', () => {
    const emptyCatch = /catch\s*\([^)]*\)\s*\{\s*\}/g;
    expect(ef.match(emptyCatch)).toBeNull();
  });
  it('admin JS uses reportError on failures', () => {
    expect(js).toContain("reportError('admin_survey_manager'");
  });
});

// ─── 8. File Inventory ──────────────────────────────────────────────────────
describe('SVM-S4: File inventory', () => {
  it('test file exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'tests/svm-s4-analytics-close.test.js'))).toBe(true);
  });
});
