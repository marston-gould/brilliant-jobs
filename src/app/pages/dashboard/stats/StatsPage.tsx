// ============================================================
// StatsPage — Main Stats Page Container (SA-017)
// ============================================================
// Orchestrates stats display with ECharts visualization.
// Legacy stats.js renders charts into container divs.
// React manages the filter pills, stat cards, and layout.
// ============================================================

import { StatsHero, ChartContainer } from './components';
import { useStats } from './hooks/useStats';

export function StatsPage() {
  const [state, actions] = useStats();

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-text-faint mt-2">Loading stats…</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-sm text-red-500 font-semibold">Failed to load stats</p>
          <p className="text-xs text-text-faint mt-1">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <StatsHero
        cards={state.cards}
        filters={state.filters}
        onToggleFilter={actions.toggleFilter}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartContainer title="Jobs by Source" chartId="stats-chart-source" />
        <ChartContainer title="Jobs by Location Type" chartId="stats-chart-loctype" />
        <ChartContainer title="Level Distribution" chartId="stats-chart-levels" />
        <ChartContainer title="Salary Ranges" chartId="stats-chart-salary" />
        <ChartContainer title="Companies" chartId="stats-chart-companies" height="400px" />
        <ChartContainer title="Daily Trend" chartId="stats-chart-trend" />
      </div>
    </div>
  );
}

export default StatsPage;
