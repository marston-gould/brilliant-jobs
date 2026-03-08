// ============================================================
// MonitoringPage — Main Admin Monitoring Page Container (SA-017)
// ============================================================

import React from 'react';
import { MonitoringHero } from './components';
import { useMonitoring } from './hooks/useMonitoring';

export function MonitoringPage() {
  const [state, actions] = useMonitoring();

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-text-faint mt-2">Loading monitoring…</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-sm text-red-500 font-semibold">Failed to load monitoring</p>
          <p className="text-xs text-text-faint mt-1">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <MonitoringHero alertCount={state.alertCount} activeAlerts={state.activeAlerts} resolvedToday={state.resolvedToday} avgResponseTime={state.avgResponseTime} />

      <div id="admin-monitoring-panel" />

    </div>
  );
}

export default MonitoringPage;
