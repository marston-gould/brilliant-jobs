// ============================================================
// AgentsPage — Main Admin Agents Page Container (SA-017)
// ============================================================

import React from 'react';
import { AgentsHero } from './components';
import { useAgents } from './hooks/useAgents';

export function AgentsPage() {
  const [state, actions] = useAgents();

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-text-faint mt-2">Loading agents…</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-sm text-red-500 font-semibold">Failed to load agents</p>
          <p className="text-xs text-text-faint mt-1">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <AgentsHero agentCount={state.agentCount} activeCount={state.activeCount} actionCount={state.actionCount} errorRate={state.errorRate} />

      <div id="admin-crewai-panel" />

    </div>
  );
}

export default AgentsPage;
