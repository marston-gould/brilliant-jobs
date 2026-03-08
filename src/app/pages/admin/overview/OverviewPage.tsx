// ============================================================
// OverviewPage — Main Admin Overview Page Container (SA-017)
// ============================================================

import { OverviewHero } from './components';
import { useOverview } from './hooks/useOverview';

export function OverviewPage() {
  const [state, _actions] = useOverview();

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-text-faint mt-2">Loading overview…</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-sm text-red-500 font-semibold">Failed to load overview</p>
          <p className="text-xs text-text-faint mt-1">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <OverviewHero totalJobs={state.totalJobs} activeUsers={state.activeUsers} efHealth={state.efHealth} cronHealth={state.cronHealth} />

      {/* Legacy admin panels render into DOM containers */}
      <div id="admin-board-health" className="mb-4" />
      <div id="admin-feed-health" className="mb-4" />
      <div id="admin-discovery" className="mb-4" />

    </div>
  );
}

export default OverviewPage;
