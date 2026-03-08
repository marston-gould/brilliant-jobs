// ============================================================
// GhostMonitor — Ghost Detection Sub-tab (SA-015)
// ============================================================

import { Badge, Button, Card } from '@app/components';
import type { GhostEntry } from '../hooks/usePipeline';

// ── Ghost stats cards ────────────────────────────────────────

interface GhostStatsProps {
  stats: {
    active: number;
    avgWait: string;
    likelyGhosted: number;
    ghosted: number;
  };
}

function GhostStats({ stats }: GhostStatsProps) {
  return (
    <div className="flex gap-2">
      <Card variant="inset" padding="sm" className="flex-1 min-w-0">
        <div className="text-lg font-bold text-text leading-tight">{stats.active}</div>
        <div className="text-[10px] text-text-faint uppercase tracking-wide mt-0.5">Active</div>
      </Card>
      <Card variant="inset" padding="sm" className="flex-1 min-w-0">
        <div className="text-lg font-bold text-text leading-tight">{stats.avgWait}</div>
        <div className="text-[10px] text-text-faint uppercase tracking-wide mt-0.5">Avg Wait</div>
      </Card>
      <Card variant="inset" padding="sm" className="flex-1 min-w-0">
        <div className="text-lg font-bold text-warm leading-tight">{stats.likelyGhosted}</div>
        <div className="text-[10px] text-text-faint uppercase tracking-wide mt-0.5">Likely Ghosted</div>
      </Card>
      <Card variant="inset" padding="sm" className="flex-1 min-w-0">
        <div className="text-lg font-bold text-red leading-tight">{stats.ghosted}</div>
        <div className="text-[10px] text-text-faint uppercase tracking-wide mt-0.5">Ghosted</div>
      </Card>
    </div>
  );
}

// ── Score bar ────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const colorClass = score >= 80 ? 'bg-red' : score >= 50 ? 'bg-warm' : score >= 25 ? 'bg-accent' : 'bg-green';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-10 h-1.5 bg-bg-input rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[11px] font-medium text-text">{score}</span>
    </div>
  );
}

// ── Ghost row ────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  active: 'Active', waiting: 'Waiting',
  likely_ghosted: 'Likely Ghosted', ghosted: 'Ghosted',
};

const STATUS_CLASSES: Record<string, string> = {
  active: 'text-green', waiting: 'text-warm',
  likely_ghosted: 'text-red', ghosted: 'text-red font-semibold',
};

const LISTING_LABELS: Record<string, { text: string; className: string }> = {
  open: { text: 'Open', className: 'text-green' },
  closed: { text: 'Closed', className: 'text-red' },
  removed: { text: 'Removed', className: 'text-red' },
  unknown: { text: '—', className: 'text-text-faint' },
};

interface GhostRowProps {
  entry: GhostEntry;
  onArchive: (entryId: string) => void;
}

function GhostRow({ entry, onArchive }: GhostRowProps) {
  const appliedStr = entry.applied_at
    ? new Date(entry.applied_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';
  const listing = LISTING_LABELS[entry.listing_status] ?? LISTING_LABELS['unknown']!;

  return (
    <tr className="border-b border-border/50 hover:bg-bg-hover/50 transition-colors">
      <td className="py-2 px-2 text-xs text-text-dim truncate max-w-[120px]" title={entry.company_slug || ''}>
        {entry.company_name || entry.company_slug || '—'}
      </td>
      <td className="py-2 px-2 text-xs text-text truncate max-w-[180px]" title={entry.job_title || ''}>
        {(entry.job_title || '').length > 30 ? (entry.job_title || '').slice(0, 30) + '…' : (entry.job_title || '—')}
      </td>
      <td className="py-2 px-2 text-xs text-text-dim whitespace-nowrap">{appliedStr}</td>
      <td className="py-2 px-2 text-xs text-text-dim whitespace-nowrap">{entry.days_since_applied || 0}d</td>
      <td className={`py-2 px-2 text-xs whitespace-nowrap ${listing.className}`}>{listing.text}</td>
      <td className="py-2 px-2"><ScoreBar score={entry.ghost_score || 0} /></td>
      <td className={`py-2 px-2 text-xs whitespace-nowrap ${STATUS_CLASSES[entry.ghost_status] || ''}`}>
        {STATUS_LABELS[entry.ghost_status] || entry.ghost_status}
      </td>
      <td className="py-2 px-2">
        {entry.ghost_status === 'ghosted' ? (
          <Button size="sm" variant="ghost" onClick={() => onArchive(entry.pipeline_entry_id)}>
            Archive
          </Button>
        ) : entry.ghost_status === 'likely_ghosted' ? (
          <span className="text-[11px] text-text-dim">Follow up</span>
        ) : (
          <span className="text-[11px] text-text-faint">—</span>
        )}
      </td>
    </tr>
  );
}

// ── Main component ───────────────────────────────────────────

interface GhostMonitorProps {
  entries: GhostEntry[];
  loading: boolean;
  stats: GhostStatsProps['stats'];
  onArchive: (entryId: string) => void;
}

export function GhostMonitor({ entries, loading, stats, onArchive }: GhostMonitorProps) {
  return (
    <div className="space-y-3">
      <GhostStats stats={stats} />

      <Card variant="outline" padding="none" className="overflow-hidden">
        {loading ? (
          <div className="py-8 text-center">
            <div className="inline-block w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-text-faint mt-2">Loading ghost data…</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="py-8 text-center text-xs text-text-faint">
            No active applications to monitor. Apply to jobs from the Feed to see ghost detection here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-bg-input/50">
                  <th className="py-1.5 px-2 text-[10px] font-medium text-text-faint uppercase tracking-wider">Company</th>
                  <th className="py-1.5 px-2 text-[10px] font-medium text-text-faint uppercase tracking-wider">Title</th>
                  <th className="py-1.5 px-2 text-[10px] font-medium text-text-faint uppercase tracking-wider">Applied</th>
                  <th className="py-1.5 px-2 text-[10px] font-medium text-text-faint uppercase tracking-wider">Days</th>
                  <th className="py-1.5 px-2 text-[10px] font-medium text-text-faint uppercase tracking-wider">Listing</th>
                  <th className="py-1.5 px-2 text-[10px] font-medium text-text-faint uppercase tracking-wider">Score</th>
                  <th className="py-1.5 px-2 text-[10px] font-medium text-text-faint uppercase tracking-wider">Status</th>
                  <th className="py-1.5 px-2 text-[10px] font-medium text-text-faint uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <GhostRow key={entry.pipeline_entry_id} entry={entry} onArchive={onArchive} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default GhostMonitor;
