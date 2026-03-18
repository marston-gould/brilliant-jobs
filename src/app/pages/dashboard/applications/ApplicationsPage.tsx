// ============================================================
// ApplicationsPage — Main Applications Page Container (SA-016)
// ============================================================
// Orchestrates all application components:
// - ApplicationsHero (stats: queued, pending, submitted, failed)
// - ModeSelector (manual/auto/notify mode switcher)
// - AppQueueTable (queue with add/process/remove actions)
// - AppHistoryTable (completed applications audit trail)
//
// Data flows through useApplications hook → legacy bridge.
// Dark mode: automatic via CSS custom properties.
// Zero inline styles. Design tokens via Tailwind.
// ============================================================

import { useState, useCallback } from 'react';
import { PageHeader } from '@app/components';
import {
  ApplicationsHero,
  ModeSelector,
  AppQueueTable,
  AppHistoryTable,
} from './components';
import { useApplications } from './hooks/useApplications';

type AppTab = 'pipeline' | 'review-queue' | 'settings';

export function ApplicationsPage() {
  const [state, actions] = useApplications();
  const [appTab, setAppTab] = useState<AppTab>('pipeline');

  const handleAddManual = useCallback(() => {
    const title = prompt('Job title:');
    if (!title) return;
    const company = prompt('Company:');
    if (!company) return;
    const url = prompt('Application URL (optional):') || '';
    actions.addManual(title, company, url);
  }, [actions]);

  const [rules, setRules] = useState<Record<string, boolean>>({});
  const [requireApproval, setRequireApproval] = useState(true);
  const [smartPrompts, setSmartPrompts] = useState(true);
  const [signalDetection, setSignalDetection] = useState(false);
  const [autoMatchResume, setAutoMatchResume] = useState(true);

  const persistPref = useCallback((key: string, value: any) => {
    import('@app/providers/bridge').then(({ providers }) => {
      providers.user.updatePreferences({ [key]: value }).catch(() => {});
    });
  }, []);
  const toggleRule = useCallback((key: string) => {
    setRules(prev => {
      const next = { ...prev, [key]: !prev[key] };
      // Persist to user preferences
      import('@app/providers/bridge').then(({ providers }) => {
        providers.user.updatePreferences({ autoApplyRules: next }).catch(() => {});
      });
      return next;
    });
  }, []);

  const savePipelineSettings = useCallback(async () => {
    try {
      const { providers } = await import('@app/providers/bridge');
      await providers.user.updatePreferences({ applicationMode: state.mode, autoApplyRules: rules });
      alert('Pipeline settings saved.');
    } catch { alert('Failed to save settings.'); }
  }, [state.mode, rules]);

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-red font-semibold">Failed to load applications</p>
        <p className="text-xs text-text-faint mt-1">{state.error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title="My Applications" subtitle="Track and manage your job applications" helpLink="applications" onHelp={() => {}} />

      {/* Settings summary banner — legacy: .app-settings-summary */}
      <div className="flex items-center justify-between p-3 px-4 rounded-lg border border-border bg-bg-card mb-4 cursor-pointer hover:border-border-hover transition-colors"
        onClick={() => setAppTab('settings')}>
        <div className="flex items-center gap-2 flex-wrap text-[12px] text-text-dim">
          <span className="font-semibold">Mode: {state.mode || 'Manual'}</span>
          <span className="text-text-faint">·</span>
          <span>Resume: {state.queue.length > 0 ? 'assigned' : 'none'}</span>
          <span className="text-text-faint">·</span>
          <span>Prompts: On</span>
        </div>
        <button className="text-[11px] font-semibold text-accent hover:underline" onClick={e => { e.stopPropagation(); setAppTab('settings'); }}>Edit →</button>
      </div>

      {/* Top-level tabs — legacy: Pipeline | Review Queue | Settings */}
      <div className="flex gap-1 p-[3px] rounded-lg bg-[var(--bg-hover)] w-fit mb-4">
        {([
          { key: 'pipeline' as AppTab, label: 'Pipeline' },
          { key: 'review-queue' as AppTab, label: 'Review Queue' },
          { key: 'settings' as AppTab, label: 'Settings' },
        ]).map(t => (
          <button
            key={t.key}
            className={`px-3.5 py-1 rounded-md text-[11px] font-semibold transition-all border
              ${appTab === t.key
                ? 'bg-accent text-white border-accent'
                : 'bg-bg-card text-text-dim border-border hover:border-accent'
              }
            `}
            onClick={() => setAppTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Pipeline tab — stat cards + stage list */}
      {appTab === 'pipeline' && (
        <>
          <ApplicationsHero queue={state.queue} history={state.history} />

          {/* Sub-tabs: Queue | History */}
          <div className="flex items-center gap-1 mb-4 border-b border-border">
            {(['queue', 'history'] as const).map(tab => (
              <button
                key={tab}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  state.activeTab === tab
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text-faint hover:text-text'
                }`}
                onClick={() => actions.setTab(tab)}
              >
                {tab === 'queue' ? `Queue (${state.queue.length})` : `History (${state.history.length})`}
              </button>
            ))}
          </div>

          {state.activeTab === 'queue' && (
            <AppQueueTable
              queue={state.queue}
              onRemove={actions.removeFromQueue}
              onProcess={actions.processQueue}
              onAddManual={handleAddManual}
            />
          )}
          {state.activeTab === 'history' && (
            <AppHistoryTable
              history={state.history}
              onClear={actions.clearHistory}
            />
          )}
        </>
      )}

      {/* Review Queue tab */}
      {appTab === 'review-queue' && (
        <div className="text-center py-12 text-text-faint">
          <p className="text-sm font-medium">No items pending review</p>
          <p className="text-xs mt-1">Applications requiring your approval will appear here</p>
        </div>
      )}

      {/* Settings tab */}
      {appTab === 'settings' && (
        <div className="space-y-5">
          {/* Application Mode — 6 cards per legacy lines 2206-2248 */}
          <div className="border border-border rounded-xl bg-bg-card p-6">
            <div className="text-[14px] font-bold text-text mb-1">Application Mode</div>
            <div className="text-[12px] text-text-dim mb-3">Controls how saved/matched jobs get processed. Can be overridden per filter.</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { key: 'manual', label: 'Manual', desc: 'I review each job and click Apply' },
                { key: 'score-gated', label: 'Score-Gated', desc: '1 click Apply, but low scores get a check first' },
                { key: 'auto-apply', label: 'Auto-Apply', desc: 'Submit my resume automatically' },
                { key: 'auto-score', label: 'Auto + Score Gate', desc: 'Auto-apply only if score meets threshold' },
                { key: 'auto-rewrite', label: 'Auto + Rewrite', desc: 'Auto-rewrite weak resumes, then submit' },
                { key: 'full-auto', label: 'Full Autopilot', desc: 'Score, rewrite + submit everything automatically' },
              ].map(m => (
                <button key={m.key}
                  className={`p-3 rounded-lg border text-left transition-all ${state.mode === m.key ? 'border-accent bg-accent/5' : 'border-border hover:border-accent'}`}
                  onClick={() => actions.setMode(m.key as any)}>
                  <div className="text-[12px] font-bold text-text">{m.label}</div>
                  <div className="text-[10px] text-text-dim mt-0.5">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Score Gate */}
          <div className="border border-border rounded-xl bg-bg-card p-6">
            <div className="text-[14px] font-bold text-text mb-1">Score Gate</div>
            <div className="text-[12px] text-text-dim mb-3">Minimum AI match score before applications are submitted</div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-text-dim w-28 flex-shrink-0">Score threshold</span>
                <input type="range" min={0} max={100} defaultValue={70} className="flex-1 accent-accent"
                  onChange={e => {
                    const val = e.target.value;
                    const label = e.target.nextElementSibling;
                    if (label) label.textContent = val;
                  }}
                  onMouseUp={e => {
                    import('@app/providers/bridge').then(({ providers }) => {
                      providers.user.updatePreferences({ scoreThreshold: Number((e.target as HTMLInputElement).value) }).catch(() => {});
                    });
                  }} />
                <span className="text-[13px] font-bold text-text min-w-[28px]">70</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-text-dim w-28 flex-shrink-0">Unscored jobs</span>
                <select className="px-2 py-1 rounded-md border border-border bg-bg-input text-[11px] text-text"
                  onChange={e => {
                    import('@app/providers/bridge').then(({ providers }) => {
                      providers.user.updatePreferences({ unscoredBehavior: e.target.value }).catch(() => {});
                    });
                  }}>
                  <option value="hold">Hold for manual review</option><option value="skip">Skip (do not apply)</option><option value="allow">Allow (apply anyway)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Approval Settings */}
          <div className="border border-border rounded-xl bg-bg-card p-6">
            <div className="text-[14px] font-bold text-text mb-1">Approval Settings</div>
            <div className="text-[12px] text-text-dim mb-3">When auto-applying, do you want to review before submission?</div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-lg bg-bg-input border border-border">
                <span className="text-[13px] text-text">Require my approval</span>
                <button onClick={() => {
                  setRequireApproval(!requireApproval);
                  import('@app/providers/bridge').then(({ providers }) => {
                    providers.user.updatePreferences({ requireApproval: !requireApproval }).catch(() => {});
                  });
                }} className={`w-10 h-[22px] rounded-full relative transition-colors ${requireApproval ? 'bg-accent' : 'bg-border-hover'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${requireApproval ? 'left-[20px]' : 'left-0.5'}`} />
                </button>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-bg-input border border-border">
                <span className="text-[13px] text-text flex-1">Auto-expire after</span>
                <select className="px-2 py-1 rounded-md border border-border bg-bg-main text-[11px] text-text"
                  defaultValue="48"
                  onChange={e => {
                    import('@app/providers/bridge').then(({ providers }) => {
                      providers.user.updatePreferences({ approvalExpireHours: Number(e.target.value) }).catch(() => {});
                    });
                  }}>
                  <option value="12">12 hours</option><option value="24">24 hours</option><option value="48">48 hours</option><option value="72">72 hours</option><option value="168">1 week</option>
                </select>
              </div>
            </div>
          </div>

          {/* Auto-Apply Rules */}
          <div className="border border-border rounded-xl bg-bg-card p-6">
            <div className="text-[14px] font-bold text-text mb-1">Auto-Apply Rules</div>
            <div className="text-[12px] text-text-dim mb-3">When in Auto mode, jobs matching these rules are submitted without approval.</div>
            <div className="space-y-2">
              {[
                { key: 'high-match', label: 'High-match jobs at network companies', desc: 'Auto-apply when resume match score is 80%+ AND you have a 1st-degree connection' },
                { key: 'saved-search', label: 'Saved search matches', desc: 'Auto-apply to new jobs matching any of your saved search filters' },
                { key: 'repost-ghost', label: 'Re-posts from ghosting companies', desc: 'Auto-apply when a company you previously applied to re-posts a role' },
              ].map(rule => (
                <div key={rule.key} className="flex items-center justify-between p-3 rounded-lg bg-bg-input border border-border">
                  <div><div className="text-[13px] font-semibold text-text">{rule.label}</div><div className="text-[11px] text-text-faint mt-0.5">{rule.desc}</div></div>
                  <button onClick={() => toggleRule(rule.key)} className={`w-10 h-[22px] rounded-full relative transition-colors ${rules[rule.key] ? 'bg-accent' : 'bg-border-hover'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${rules[rule.key] ? 'left-[20px]' : 'left-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>
            <button className="mt-3 px-3 py-1 rounded-md text-xs font-medium text-accent border border-accent hover:bg-accent/5">+ Add Custom Rule</button>
          </div>

          {/* Resume Assignment */}
          <div className="border border-border rounded-xl bg-bg-card p-6">
            <div className="text-[14px] font-bold text-text mb-1">Resume Assignment</div>
            <div className="text-[12px] text-text-dim mb-3">Which resume gets sent for each application type.</div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-lg bg-bg-input border border-border">
                <span className="text-[13px] text-text">Default resume for all applications</span>
                <select className="px-2 py-1 rounded-md border border-border bg-bg-main text-[11px] text-text-dim"><option>— Upload a resume first —</option></select>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-bg-input border border-border">
                <span className="text-[13px] text-text">Auto-select best-match resume per job</span>
                <button onClick={() => { setAutoMatchResume(!autoMatchResume); persistPref('autoMatchResume', !autoMatchResume); }}
                  className={`w-10 h-[22px] rounded-full relative transition-colors ${autoMatchResume ? 'bg-accent' : 'bg-border-hover'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoMatchResume ? 'left-[20px]' : 'left-0.5'}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Pipeline Intelligence */}
          <div className="border border-border rounded-xl bg-bg-card p-6">
            <div className="text-[14px] font-bold text-text mb-1">Pipeline Intelligence</div>
            <div className="text-[12px] text-text-dim mb-3">Automated tracking and smart prompts for your job applications.</div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-lg bg-bg-input border border-border">
                <span className="text-[13px] text-text">Smart Prompts — time-based check-in reminders</span>
                <button onClick={() => { setSmartPrompts(!smartPrompts); persistPref('smartPrompts', !smartPrompts); }}
                  className={`w-10 h-[22px] rounded-full relative transition-colors ${smartPrompts ? 'bg-accent' : 'bg-border-hover'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${smartPrompts ? 'left-[20px]' : 'left-0.5'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-bg-input border border-border">
                <span className="text-[13px] text-text">Signal Detection — auto-detect via Gmail & Calendar</span>
                <button onClick={() => { setSignalDetection(!signalDetection); persistPref('signalDetection', !signalDetection); }}
                  className={`w-10 h-[22px] rounded-full relative transition-colors ${signalDetection ? 'bg-accent' : 'bg-border-hover'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${signalDetection ? 'left-[20px]' : 'left-0.5'}`} />
                </button>
              </div>
            </div>
            {/* Prompt Cadences — legacy lines 2383-2401 */}
            <details className="mt-3">
              <summary className="text-[12px] font-semibold text-text-dim cursor-pointer">Prompt cadences</summary>
              <div className="space-y-2 mt-2">
                {[
                  { key: 'cadence_saved', label: 'Saved → Applied', val: 3 },
                  { key: 'cadence_applied', label: 'Applied → Response', val: 7 },
                  { key: 'cadence_responded', label: 'Responded → Interview', val: 5 },
                  { key: 'cadence_interview', label: 'Interview → Follow-up', val: 3 },
                ].map(c => (
                  <div key={c.key} className="flex items-center gap-3 p-2 rounded-lg bg-bg-input border border-border">
                    <span className="text-[12px] text-text flex-1">{c.label}</span>
                    <input type="number" defaultValue={c.val} min={1} max={30}
                      onBlur={e => persistPref(c.key, Number(e.target.value))}
                      className="w-14 px-2 py-1 rounded-md border border-border bg-bg-main text-[12px] text-text text-center" />
                    <span className="text-[11px] text-text-faint">days</span>
                  </div>
                ))}
              </div>
            </details>
          </div>

          {/* Save button */}
          <button onClick={savePipelineSettings} className="px-4 py-2 rounded-md bg-accent text-white text-sm font-semibold">Save Pipeline Settings</button>
        </div>
      )}
    </div>
  );
}

export default ApplicationsPage;
