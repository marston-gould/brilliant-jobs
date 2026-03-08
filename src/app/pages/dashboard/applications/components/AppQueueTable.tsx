// ============================================================
// AppQueueTable — Application queue table (SA-016)
// ============================================================

import React from 'react';
import { Button, Badge } from '@app/components';
import type { AppEntry, AppMode, AppStatus } from '../hooks/useApplications';

interface AppQueueTableProps {
  queue: AppEntry[];
  onRemove: (idx: number) => void;
  onProcess: () => void;
  onAddManual: () => void;
}

function modeBadge(mode: AppMode) {
  const variants: Record<AppMode, 'default' | 'info' | 'warning'> = {
    manual: 'default',
    auto: 'info',
    notify: 'warning',
  };
  const labels: Record<AppMode, string> = {
    manual: 'Manual',
    auto: 'Auto',
    notify: 'Notify',
  };
  return <Badge variant={variants[mode]} size="sm">{labels[mode]}</Badge>;
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
    queued: 'Queued',
    pending: 'Pending Approval',
    sent: 'Notification Sent',
    submitted: 'Submitted',
    failed: 'Failed',
  };
  return <Badge variant={variants[status]} size="sm">{labels[status]}</Badge>;
}

export function AppQueueTable({ queue, onRemove, onProcess, onAddManual }: AppQueueTableProps) {
  return (
    <div>
      {/* Actions bar */}
      <div className="flex items-center gap-2 mb-3">
        <Button variant="primary" size="sm" onClick={onAddManual}>+ Add Manual</Button>
        {queue.length > 0 && (
          <Button variant="secondary" size="sm" onClick={onProcess}>Process Queue</Button>
        )}
      </div>

      {/* Table */}
      {queue.length === 0 ? (
        <div className="text-center py-12 rounded-lg border border-border bg-bg-card">
          <p className="text-sm font-semibold text-text-dim">No applications in queue</p>
          <p className="text-xs text-text-faint mt-1">Add jobs manually or they will appear here from saved jobs.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-card border-b border-border">
                <th className="text-left px-3 py-2 text-xs font-semibold text-text-faint">Job Title</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-text-faint hidden sm:table-cell">Company</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-text-faint hidden md:table-cell">Resume</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-text-faint">Mode</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-text-faint">Status</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-text-faint hidden md:table-cell">Added</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-text-faint">Actions</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((app, idx) => (
                <tr key={app.id} className="border-b border-border last:border-b-0 hover:bg-bg-card/50">
                  <td className="px-3 py-2">
                    <span className="text-text font-medium truncate block max-w-xs">{app.jobTitle}</span>
                  </td>
                  <td className="px-3 py-2 text-text-dim hidden sm:table-cell">{app.company}</td>
                  <td className="px-3 py-2 text-xs text-text-faint hidden md:table-cell">{app.resumeName || '—'}</td>
                  <td className="px-3 py-2">{modeBadge(app.mode)}</td>
                  <td className="px-3 py-2">{statusBadge(app.status)}</td>
                  <td className="px-3 py-2 text-xs text-text-faint hidden md:table-cell">{app.addedAt}</td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="danger" size="sm" onClick={() => onRemove(idx)} title="Remove">✕</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
