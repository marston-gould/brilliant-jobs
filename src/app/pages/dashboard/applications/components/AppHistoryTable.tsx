// ============================================================
// AppHistoryTable — Application history table (SA-016)
// ============================================================

import { Button, Badge } from '@app/components';
import type { AppEntry, AppMode, AppStatus } from '../hooks/useApplications';

interface AppHistoryTableProps {
  history: AppEntry[];
  onClear: () => void;
}

function modeBadge(mode: AppMode) {
  const variants: Record<string, 'default' | 'info' | 'warning'> = {
    manual: 'default', 'score-gated': 'default', 'auto-apply': 'info', 'auto-score': 'info', 'auto-rewrite': 'info', 'full-auto': 'info', auto: 'info', notify: 'warning',
  };
  const labels: Record<string, string> = {
    manual: 'Manual', 'score-gated': 'Score-Gated', 'auto-apply': 'Auto-Apply', 'auto-score': 'Auto+Score', 'auto-rewrite': 'Auto+Rewrite', 'full-auto': 'Full Auto', auto: 'Auto', notify: 'Notify',
  };
  return <Badge variant={variants[mode] || 'default'} size="sm">{labels[mode] || mode}</Badge>;
}

function statusBadge(status: AppStatus) {
  const variants: Record<AppStatus, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
    queued: 'default',
    pending: 'warning',
    sent: 'info',
    submitted: 'success',
    failed: 'error',
  };
  const labels: Record<AppStatus, string> = {
    queued: 'Queued', pending: 'Pending', sent: 'Sent', submitted: 'Submitted', failed: 'Failed',
  };
  return <Badge variant={variants[status]} size="sm">{labels[status]}</Badge>;
}

export function AppHistoryTable({ history, onClear }: AppHistoryTableProps) {
  if (history.length === 0) {
    return (
      <div className="text-center py-12 rounded-lg border border-border bg-bg-card">
        <p className="text-sm font-semibold text-text-dim">No application history yet</p>
        <p className="text-xs text-text-faint mt-1">Completed applications will appear here with full audit trail.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-text-faint">{history.length} completed application{history.length !== 1 ? 's' : ''}</p>
        <Button variant="ghost" size="sm" onClick={onClear}>Clear History</Button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-card border-b border-border">
              <th className="text-left px-3 py-2 text-xs font-semibold text-text-faint">Job Title</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-text-faint hidden sm:table-cell">Company</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-text-faint hidden md:table-cell">Resume</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-text-faint">Mode</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-text-faint">Status</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-text-faint hidden md:table-cell">Submitted</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-text-faint hidden lg:table-cell">Source</th>
            </tr>
          </thead>
          <tbody>
            {history.map(app => (
              <tr key={app.id} className="border-b border-border last:border-b-0 hover:bg-bg-card/50">
                <td className="px-3 py-2">
                  <span className="text-text font-medium truncate block max-w-xs">{app.jobTitle}</span>
                </td>
                <td className="px-3 py-2 text-text-dim hidden sm:table-cell">{app.company}</td>
                <td className="px-3 py-2 text-xs text-text-faint hidden md:table-cell">{app.resumeName || '—'}</td>
                <td className="px-3 py-2">{modeBadge(app.mode)}</td>
                <td className="px-3 py-2">{statusBadge(app.status)}</td>
                <td className="px-3 py-2 text-xs text-text-faint hidden md:table-cell">{app.submittedAt || '—'}</td>
                <td className="px-3 py-2 text-xs text-text-faint hidden lg:table-cell">{app.source || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
