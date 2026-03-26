// ============================================================
// PipelineHero — Pipeline Stats Banner (SA-015)
// ============================================================

import { Card } from '@app/components';
import type { PipelineStats } from '../hooks/usePipeline';

interface PipelineHeroProps {
  stats: PipelineStats;
  view: 'pipeline' | 'kanban' | 'ghost';
  onViewChange: (view: 'pipeline' | 'kanban' | 'ghost') => void;
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

const VIEW_TABS: { key: 'pipeline' | 'kanban' | 'ghost'; label: string; title: string }[] = [
  { key: 'pipeline', label: '≡ List',    title: 'Collapsible stage list view' },
  { key: 'kanban',   label: '⊞ Board',   title: 'Horizontal kanban board view' },
  { key: 'ghost',    label: '👻 Ghosts', title: 'Ghost detection monitor' },
];

export function PipelineHero({ stats, view, onViewChange }: PipelineHeroProps) {
  return (
    <div className="space-y-2">
      {/* View toggle */}
      <div className="flex items-center gap-1 p-0.5 bg-bg-input rounded-md w-fit border border-border">
        {VIEW_TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            title={tab.title}
            onClick={() => onViewChange(tab.key)}
            className={`px-3 py-1 text-xs font-medium rounded transition-all ${
              view === tab.key
                ? 'bg-bg-card text-text shadow-sm'
                : 'text-text-dim hover:text-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
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
