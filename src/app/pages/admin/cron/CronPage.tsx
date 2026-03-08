// ============================================================
// CronPage — Main Admin Cron Page Container (SA-017)
// ============================================================

import React from 'react';
import { CronHero } from './components';
import { useCron } from './hooks/useCron';

export function CronPage() {
  const [state, actions] = useCron();

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-text-faint mt-2">Loading cron…</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-sm text-red-500 font-semibold">Failed to load cron</p>
          <p className="text-xs text-text-faint mt-1">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <CronHero total={state.jobs.length} activeCount={state.activeCount} failedCount={state.failedCount} />

      <div id="admin-cron-panel" />

    </div>
  );
}

export default CronPage;
