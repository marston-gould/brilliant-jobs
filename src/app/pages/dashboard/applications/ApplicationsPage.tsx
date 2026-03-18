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
      <div className="flex gap-1.5 mb-4">
        {([
          { key: 'pipeline' as AppTab, label: 'Pipeline' },
          { key: 'review-queue' as AppTab, label: 'Review Queue' },
          { key: 'settings' as AppTab, label: 'Settings' },
        ]).map(t => (
          <button
            key={t.key}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all border
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

      {/* Settings tab — legacy: Application Mode, Auto-Apply Rules, Resume Assignment, Pipeline Intelligence */}
      {appTab === 'settings' && (
        <div className="space-y-5">
          {/* Application Mode */}
          <div className="border border-border rounded-xl bg-bg-card p-5">
            <div className="text-[14px] font-bold text-text mb-1">Application Mode</div>
            <div className="text-[12px] text-text-dim mb-3">Controls how saved/matched jobs get processed. Can be overridden per filter.</div>
            <ModeSelector mode={state.mode} onSetMode={actions.setMode} />
          </div>

          {/* Auto-Apply Rules */}
          <div className="border border-border rounded-xl bg-bg-card p-5">
            <div className="text-[14px] font-bold text-text mb-1">Auto-Apply Rules</div>
            <div className="text-[12px] text-text-dim mb-3">When in Auto mode, jobs matching these rules are submitted without approval.</div>
            <div className="space-y-2">
              {[
                { label: 'High-match jobs at network companies', desc: 'Auto-apply when resume match score is 80%+ AND you have a 1st-degree connection at the company' },
                { label: 'Saved search matches', desc: 'Auto-apply to new jobs matching any of your saved search filters' },
                { label: 'Re-posts from ghosting companies', desc: 'Auto-apply when a company you previously applied to re-posts a role' },
              ].map(rule => (
                <div key={rule.label} className="flex items-center justify-between p-3 rounded-lg bg-bg-input border border-border">
                  <div>
                    <div className="text-[13px] font-semibold text-text">{rule.label}</div>
                    <div className="text-[11px] text-text-faint mt-0.5">{rule.desc}</div>
                  </div>
                  <button className="w-9 h-5 rounded-full bg-border-hover relative transition-colors">
                    <span className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Resume Assignment */}
          <div className="border border-border rounded-xl bg-bg-card p-5">
            <div className="text-[14px] font-bold text-text mb-1">Resume Assignment</div>
            <div className="text-[12px] text-text-dim mb-3">Which resume gets sent for each application type.</div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-lg bg-bg-input border border-border">
                <span className="text-[13px] text-text">Default resume for all applications</span>
                <select className="px-2 py-1 rounded-md border border-border bg-bg-main text-[11px] text-text-dim">
                  <option>— Upload a resume first —</option>
                </select>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-bg-input border border-border">
                <span className="text-[13px] text-text">Auto-select best-match resume per job</span>
                <button className="w-9 h-5 rounded-full bg-accent relative transition-colors">
                  <span className="absolute top-0.5 left-[18px] w-4 h-4 bg-white rounded-full shadow transition-transform" />
                </button>
              </div>
            </div>
          </div>

          {/* Pipeline Intelligence */}
          <div className="border border-border rounded-xl bg-bg-card p-5">
            <div className="text-[14px] font-bold text-text mb-1">Pipeline Intelligence</div>
            <div className="text-[12px] text-text-dim mb-3">Automated tracking and smart prompts for your job applications.</div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-lg bg-bg-input border border-border">
                <span className="text-[13px] text-text">Smart Prompts — time-based check-in reminders</span>
                <button className="w-9 h-5 rounded-full bg-accent relative transition-colors">
                  <span className="absolute top-0.5 left-[18px] w-4 h-4 bg-white rounded-full shadow transition-transform" />
                </button>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-bg-input border border-border">
                <span className="text-[13px] text-text">Signal Detection — auto-detect pipeline changes via Gmail & Calendar</span>
                <button className="w-9 h-5 rounded-full bg-border-hover relative transition-colors">
                  <span className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ApplicationsPage;
