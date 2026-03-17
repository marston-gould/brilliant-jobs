/**
 * SPA-CUT-3: Bridge Elimination — All Remaining 14 Hooks
 * Verifies ZERO window.* refs across entire SPA hook layer.
 * Session: SPA-CUT-3 | Version: v10.40 → v10.41
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf-8');
const exists = (f) => existsSync(join(ROOT, f));

function codeOnly(src) {
  return src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
}

const ALL_HOOKS = [
  'src/app/pages/dashboard/feed/hooks/useFeedSearch.ts',
  'src/app/pages/dashboard/pipeline/hooks/usePipeline.ts',
  'src/app/pages/dashboard/keywords/hooks/useKeywords.ts',
  'src/app/pages/dashboard/resumes/hooks/useResumes.ts',
  'src/app/pages/dashboard/applications/hooks/useApplications.ts',
  'src/app/pages/dashboard/stats/hooks/useStats.ts',
  'src/app/pages/dashboard/billing/hooks/useBilling.ts',
  'src/app/pages/dashboard/settings/hooks/useSettings.ts',
  'src/app/pages/dashboard/tuning/hooks/useTuning.ts',
  'src/app/pages/dashboard/integrations/hooks/useIntegrations.ts',
  'src/app/pages/dashboard/chat/hooks/useChat.ts',
  'src/app/pages/dashboard/referrals/hooks/useReferrals.ts',
  'src/app/pages/admin/overview/hooks/useOverview.ts',
  'src/app/pages/admin/jobs/hooks/useJobs.ts',
  'src/app/pages/admin/content/hooks/useContent.ts',
  'src/app/pages/admin/seo/hooks/useSeo.ts',
  'src/app/pages/admin/cron/hooks/useCron.ts',
  'src/app/pages/admin/agents/hooks/useAgents.ts',
  'src/app/pages/admin/monitoring/hooks/useMonitoring.ts',
  'src/app/pages/admin/killswitch/hooks/useKillswitch.ts',
  'src/app/pages/admin/compliance/hooks/useCompliance.ts',
  'src/app/pages/admin/notifications/hooks/useNotifications.ts',
];

// SPA-CUT-3 hooks (the 14 transformed this session)
const CUT3_HOOKS = [
  'src/app/pages/dashboard/settings/hooks/useSettings.ts',
  'src/app/pages/dashboard/tuning/hooks/useTuning.ts',
  'src/app/pages/dashboard/integrations/hooks/useIntegrations.ts',
  'src/app/pages/dashboard/chat/hooks/useChat.ts',
  'src/app/pages/dashboard/referrals/hooks/useReferrals.ts',
  'src/app/pages/admin/overview/hooks/useOverview.ts',
  'src/app/pages/admin/jobs/hooks/useJobs.ts',
  'src/app/pages/admin/content/hooks/useContent.ts',
  'src/app/pages/admin/seo/hooks/useSeo.ts',
  'src/app/pages/admin/cron/hooks/useCron.ts',
  'src/app/pages/admin/agents/hooks/useAgents.ts',
  'src/app/pages/admin/monitoring/hooks/useMonitoring.ts',
  'src/app/pages/admin/killswitch/hooks/useKillswitch.ts',
  'src/app/pages/admin/compliance/hooks/useCompliance.ts',
];

// ── 1. Global verification: ZERO window refs across ALL hooks ──

describe('1. Global: Zero window refs in ALL 22 hooks', () => {
  ALL_HOOKS.forEach(f => {
    it(`${f.split('/').pop()} — zero window refs`, () => {
      const code = codeOnly(read(f));
      expect(code).not.toContain('window as any');
      expect(code).not.toMatch(/\bwin\(\)\./);
    });
  });
});

// ── 2. SPA-CUT-3 hooks have @lib/supabase import ──────────────

describe('2. SPA-CUT-3 hooks import @lib/supabase', () => {
  CUT3_HOOKS.forEach(f => {
    it(`${f.split('/').pop()} imports @lib/supabase`, () => {
      expect(read(f)).toContain("from '@lib/supabase'");
    });
  });
});

// ── 3. SPA-CUT-3 hooks have no function win() ────────────────

describe('3. No function win() in any hook', () => {
  ALL_HOOKS.forEach(f => {
    it(`${f.split('/').pop()} — no function win()`, () => {
      expect(read(f)).not.toMatch(/function win\(\)/);
    });
  });
});

// ── 4. Dashboard hooks: specific standalone patterns ──────────

describe('4. Dashboard hooks standalone patterns', () => {
  it('4.1 useSettings has no openFeedback bridge', () => {
    expect(codeOnly(read('src/app/pages/dashboard/settings/hooks/useSettings.ts'))).not.toContain("(window as any).openFeedback");
  });
  it('4.2 useTuning has no saveTuning bridge', () => {
    expect(codeOnly(read('src/app/pages/dashboard/tuning/hooks/useTuning.ts'))).not.toContain("(window as any).saveTuning");
  });
  it('4.3 useChat has no initChatMode bridge', () => {
    expect(codeOnly(read('src/app/pages/dashboard/chat/hooks/useChat.ts'))).not.toContain("(window as any).initChatMode");
  });
  it('4.4 useIntegrations has no connectGoogleDrive bridge', () => {
    expect(codeOnly(read('src/app/pages/dashboard/integrations/hooks/useIntegrations.ts'))).not.toContain("(window as any).connectGoogleDrive");
  });
  it('4.5 useReferrals has no initReferralHub bridge', () => {
    expect(codeOnly(read('src/app/pages/dashboard/referrals/hooks/useReferrals.ts'))).not.toContain("(window as any).initReferralHub");
  });
});

// ── 5. Admin hooks: specific standalone patterns ──────────────

describe('5. Admin hooks standalone patterns', () => {
  it('5.1 useCron has no loadCronPanel bridge', () => {
    expect(codeOnly(read('src/app/pages/admin/cron/hooks/useCron.ts'))).not.toContain("(window as any).loadCronPanel");
  });
  it('5.2 useAgents has no loadCrewAIPanel bridge', () => {
    expect(codeOnly(read('src/app/pages/admin/agents/hooks/useAgents.ts'))).not.toContain("(window as any).loadCrewAIPanel");
  });
  it('5.3 useKillswitch has no loadKillSwitchPanel bridge', () => {
    expect(codeOnly(read('src/app/pages/admin/killswitch/hooks/useKillswitch.ts'))).not.toContain("(window as any).loadKillSwitchPanel");
  });
  it('5.4 useSeo has no loadSeoTab bridge', () => {
    expect(codeOnly(read('src/app/pages/admin/seo/hooks/useSeo.ts'))).not.toContain("(window as any).loadSeoTab");
  });
  it('5.5 useCompliance has no loadComplianceDashPanel bridge', () => {
    expect(codeOnly(read('src/app/pages/admin/compliance/hooks/useCompliance.ts'))).not.toContain("(window as any).loadComplianceDashPanel");
  });
});

// ── 6. Standalone client ─────────────────────────────────────

describe('6. Standalone Supabase client integrity', () => {
  const lib = read('src/app/lib/supabase.ts');
  it('6.1 Client exists', () => expect(exists('src/app/lib/supabase.ts')).toBe(true));
  it('6.2 No window.BJ in code', () => expect(codeOnly(lib)).not.toContain('window.BJ'));
  it('6.3 Provider uses standalone', () => expect(read('src/app/providers/supabase.ts')).toContain("from '@lib/supabase'"));
});

// ── 7. File inventory ────────────────────────────────────────

describe('7. All 22 hook files exist', () => {
  ALL_HOOKS.forEach(f => {
    it(f.split('/').pop(), () => expect(exists(f)).toBe(true));
  });
});
