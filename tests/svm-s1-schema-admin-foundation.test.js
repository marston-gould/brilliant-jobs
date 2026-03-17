/**
 * FB-SURVEY-ADMIN-001 SVM-S1: Schema Evolution + Admin Panel Foundation
 * Tests: migration, EF CRUD, admin panel, gateway route, build config
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function readFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf-8'); }

// ─── 1. Migration ────────────────────────────────────────────────────────────
describe('SVM-S1: Migration schema', () => {
  const mig = readFile('supabase/migrations/v10.28-fb-survey-admin-001-s1.sql');

  it('migration file exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'supabase/migrations/v10.28-fb-survey-admin-001-s1.sql'))).toBe(true);
  });
  it('adds questions JSONB column', () => {
    expect(mig).toContain('questions jsonb');
  });
  it('adds audience_config JSONB column with default', () => {
    expect(mig).toContain('audience_config jsonb');
    expect(mig).toContain('"type":"all"');
  });
  it('adds trigger_config JSONB column with default', () => {
    expect(mig).toContain('trigger_config jsonb');
    expect(mig).toContain('"type":"page_navigation"');
  });
  it('adds placement_config JSONB column', () => {
    expect(mig).toContain('placement_config jsonb');
  });
  it('backfills placement_config from channels array', () => {
    expect(mig).toContain('placement_config IS NULL');
    expect(mig).toContain("channels @> ARRAY['overlay']");
  });
  it('backfills trigger_config for cron campaigns', () => {
    expect(mig).toContain('nps_v1');
    expect(mig).toContain('periodic_v2');
    expect(mig).toContain('"type":"cron"');
  });
  it('backfills audience_config from target_audience', () => {
    expect(mig).toContain('min_sessions');
    expect(mig).toContain("'type', 'behavioral'");
  });
  it('creates active_type index', () => {
    expect(mig).toContain('idx_survey_campaigns_active_type');
  });
});

// ─── 2. admin-survey-manager EF ──────────────────────────────────────────────
describe('SVM-S1: admin-survey-manager EF', () => {
  const ef = readFile('supabase/functions/admin-survey-manager/index.ts');

  it('file exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'supabase/functions/admin-survey-manager/index.ts'))).toBe(true);
  });
  it('has list action', () => {
    expect(ef).toContain("case \"list\"");
    expect(ef).toContain('handleList');
  });
  it('list supports include_inactive flag', () => {
    expect(ef).toContain('include_inactive');
  });
  it('list enriches with response_count', () => {
    expect(ef).toContain('response_count');
    expect(ef).toContain("from(\"feedback\")");
  });
  it('has get action', () => {
    expect(ef).toContain("case \"get\"");
    expect(ef).toContain('handleGet');
  });
  it('has create action with validation', () => {
    expect(ef).toContain("case \"create\"");
    expect(ef).toContain('handleCreate');
    expect(ef).toContain('survey_version');
    expect(ef).toContain('survey_type');
    expect(ef).toContain('title');
  });
  it('create validates survey_type', () => {
    expect(ef).toContain('validTypes');
    expect(ef).toContain("nps");
    expect(ef).toContain("periodic");
    expect(ef).toContain("micro");
  });
  it('create syncs channels array from placement_config', () => {
    expect(ef).toContain('placement_config');
    expect(ef).toContain('channels');
  });
  it('create saves all 4 new JSONB columns', () => {
    expect(ef).toContain('questions:');
    expect(ef).toContain('audience_config:');
    expect(ef).toContain('trigger_config:');
    expect(ef).toContain('placement_config:');
  });
  it('create handles duplicate survey_version (23505)', () => {
    expect(ef).toContain('23505');
    expect(ef).toContain('already exists');
  });
  it('has update action with diff audit', () => {
    expect(ef).toContain("case \"update\"");
    expect(ef).toContain('handleUpdate');
    expect(ef).toContain('diff');
    expect(ef).toContain('before');
  });
  it('update syncs channels from placement_config', () => {
    expect(ef).toContain('updates.placement_config');
    expect(ef).toContain('updates.channels');
  });
  it('has delete action (soft-delete)', () => {
    expect(ef).toContain("case \"delete\"");
    expect(ef).toContain('is_active: false');
  });
  it('has duplicate action', () => {
    expect(ef).toContain("case \"duplicate\"");
    expect(ef).toContain('handleDuplicate');
    expect(ef).toContain('(Copy)');
  });
  it('duplicate starts inactive', () => {
    expect(ef).toContain('is_active: false');
  });
  it('all actions write to admin_audit_log', () => {
    expect(ef).toContain("admin_audit_log");
    expect(ef).toContain('survey_campaign_created');
    expect(ef).toContain('survey_campaign_updated');
    expect(ef).toContain('survey_campaign_deleted');
    expect(ef).toContain('survey_campaign_duplicated');
  });
  it('has no empty catch blocks', () => {
    const emptyCatch = /catch\s*\([^)]*\)\s*\{\s*\}/g;
    expect(ef.match(emptyCatch)).toBeNull();
  });
});

// ─── 3. Admin Panel JS ──────────────────────────────────────────────────────
describe('SVM-S1: admin-survey-manager.js panel', () => {
  const js = readFile('js/admin-survey-manager.js');

  it('file exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'js/admin-survey-manager.js'))).toBe(true);
  });
  it('exports loadSurveyManagerTab to window', () => {
    expect(js).toContain('window.loadSurveyManagerTab');
  });
  it('renders campaign table with columns', () => {
    expect(js).toContain('Title');
    expect(js).toContain('Type');
    expect(js).toContain('Priority');
    expect(js).toContain('Channels');
    expect(js).toContain('Responses');
    expect(js).toContain('Status');
    expect(js).toContain('Actions');
  });
  it('renders channel badges from placement_config', () => {
    expect(js).toContain('placement_config');
    expect(js).toContain('overlay');
    expect(js).toContain('Merch');
    expect(js).toContain('Email');
    expect(js).toContain('SMS');
  });
  it('renders trigger badge', () => {
    expect(js).toContain('trigger_config');
    expect(js).toContain('page_navigation');
    expect(js).toContain('cron');
    expect(js).toContain('event');
    expect(js).toContain('behavioral');
  });
  it('has active/inactive toggle', () => {
    expect(js).toContain('svm-show-inactive');
    expect(js).toContain('svmToggleInactive');
  });
  it('has New Survey button', () => {
    expect(js).toContain('svmOpenCreate');
    expect(js).toContain('New Survey');
  });
  it('has Edit action per campaign', () => {
    expect(js).toContain('svmEditCampaign');
  });
  it('has Duplicate action per campaign', () => {
    expect(js).toContain('svmDuplicateCampaign');
  });
  it('has Delete/Deactivate action per campaign', () => {
    expect(js).toContain('svmDeleteCampaign');
    expect(js).toContain('Deactivate');
  });
  it('calls admin-survey-manager EF', () => {
    expect(js).toContain("'admin-survey-manager'");
  });
  it('has XSS protection', () => {
    expect(js).toContain('_svmEsc');
    expect(js).toContain('textContent');
  });
  it('uses reportError on failures', () => {
    expect(js).toContain("reportError('admin_survey_manager'");
  });
});

// ─── 4. Admin Subpage Registration ───────────────────────────────────────────
describe('SVM-S1: Admin registration', () => {
  const admin = readFile('js/admin.js');

  it('surveys registered in ADMIN_SUBPAGE_MAP', () => {
    expect(admin).toContain("'surveys'");
    expect(admin).toContain('loadSurveyManagerTab');
  });
  it('surveys in growth section', () => {
    expect(admin).toContain("section: 'growth'");
  });
});

// ─── 5. Gateway Route ────────────────────────────────────────────────────────
describe('SVM-S1: Gateway route', () => {
  const gw = readFile('supabase/functions/api-gateway/index.ts');

  it('admin-survey-manager route #141', () => {
    expect(gw).toContain('"admin-survey-manager"');
    expect(gw).toContain('#141');
  });
  it('total routes updated to 141', () => {
    expect(gw).toContain('TOTAL: 141 routes');
  });
});

// ─── 6. Build Config ─────────────────────────────────────────────────────────
describe('SVM-S1: Build config', () => {
  const build = readFile('build-admin.js');

  it('admin-survey-manager.js in admin build', () => {
    expect(build).toContain("'js/admin-survey-manager.js'");
  });
});

// ─── 7. File Inventory ──────────────────────────────────────────────────────
describe('SVM-S1: File inventory', () => {
  const files = [
    'supabase/migrations/v10.28-fb-survey-admin-001-s1.sql',
    'supabase/functions/admin-survey-manager/index.ts',
    'js/admin-survey-manager.js',
  ];
  files.forEach(f => {
    it(f + ' exists', () => {
      expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
    });
  });
});
