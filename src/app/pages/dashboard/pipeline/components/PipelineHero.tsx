// ============================================================
// PipelineHero — Pipeline Stats Banner (SA-015)
// ============================================================

import { Card } from '@app/components';
import type { PipelineStats } from '../hooks/usePipeline';

interface PipelineHeroProps {
  stats: PipelineStats;
  view: 'pipeline' | 'ghost';
  onViewChange: (view: 'pipeline' | 'ghost') => void;
}

interface StatCardProps {
  label: string;
  value: string | number;
  accent?: boolean;
}

function StatCard({ label, value, accent }: StatCardProps) {
  return (
    <Card variant="inset" padding="sm" className="flex-1 min-w-0">
      <div className={`text-lg font-bold leading-tight ${accent ? 'text-accent' : 'text-text'}`}>
        {value}
      </div>
      <div className="text-[10px] text-text-faint uppercase tracking-wide mt-0.5 truncate">
        {label}
      </div>
    </Card>
  );
}

export function PipelineHero({ stats, view, onViewChange }: PipelineHeroProps) {
  return (
    <div className="space-y-2">
      {/* View toggle */}
      <div className="flex items-center gap-1 p-0.5 bg-bg-input rounded-md w-fit border border-border">
        <button
          type="button"
          onClick={() => onViewChange('pipeline')}
          className={`px-3 py-1 text-xs font-medium rounded transition-all ${
            view === 'pipeline'
              ? 'bg-bg-card text-text shadow-sm'
              : 'text-text-dim hover:text-text'
          }`}
        >
          Pipeline
        </button>
        <button
          type="button"
          onClick={() => onViewChange('ghost')}
          className={`px-3 py-1 text-xs font-medium rounded transition-all ${
            view === 'ghost'
              ? 'bg-bg-card text-text shadow-sm'
              : 'text-text-dim hover:text-text'
          }`}
        >
          Ghost Monitor
        </button>
      </div>

      {/* Stats row */}
      <div className="flex gap-2">
        <StatCard label="Total Tracked" value={stats.totalTracked} />
        <StatCard label="Active" value={stats.activeCount} accent />
        <StatCard label="Response Rate" value={stats.responseRate} />
        <StatCard label="Avg Days" value={stats.avgDaysToResponse} />
      </div>
    </div>
  );
}

export default PipelineHero;
