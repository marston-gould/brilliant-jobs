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

import React, { useCallback } from 'react';
import {
  ApplicationsHero,
  ModeSelector,
  AppQueueTable,
  AppHistoryTable,
} from './components';
import { useApplications } from './hooks/useApplications';

export function ApplicationsPage() {
  const [state, actions] = useApplications();

  const handleAddManual = useCallback(() => {
    const title = prompt('Job title:');
    if (!title) return;
    const company = prompt('Company:');
    if (!company) return;
    const url = prompt('Application URL (optional):') || '';
    actions.addManual(title, company, url);
  }, [actions]);

  // ── Loading state ──────────────────────────────────────────

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-text-faint mt-2">Loading applications…</p>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────

  if (state.error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-sm text-red-500 font-semibold">Failed to load applications</p>
          <p className="text-xs text-text-faint mt-1">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Stats */}
      <ApplicationsHero queue={state.queue} history={state.history} />

      {/* Mode selector */}
      <ModeSelector mode={state.mode} onSetMode={actions.setMode} />

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-4 border-b border-border">
        {(['queue', 'history'] as const).map(tab => (
          <button
            key={tab}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              state.activeTab === tab
                ? 'border-accent text-accent'
                : 'border-transparent text-text-faint hover:text-text hover:border-border'
            }`}
            onClick={() => actions.setTab(tab)}
            role="tab"
            aria-selected={state.activeTab === tab}
          >
            {tab === 'queue' ? `Queue (${state.queue.length})` : `History (${state.history.length})`}
          </button>
        ))}
      </div>

      {/* Tab content */}
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
    </div>
  );
}

export default ApplicationsPage;
