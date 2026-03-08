// ============================================================
// KillswitchPage — Main Admin Kill Switch Page Container (SA-017)
// ============================================================

import React from 'react';
import { KillswitchHero } from './components';
import { useKillswitch } from './hooks/useKillswitch';

export function KillswitchPage() {
  const [state, actions] = useKillswitch();

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-text-faint mt-2">Loading killswitch…</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-sm text-red-500 font-semibold">Failed to load killswitch</p>
          <p className="text-xs text-text-faint mt-1">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <KillswitchHero extensionEnabled={state.extensionEnabled} dashboardEnabled={state.dashboardEnabled} landingEnabled={state.landingEnabled} />

      <div id="admin-killswitch-panel" />

    </div>
  );
}

export default KillswitchPage;
