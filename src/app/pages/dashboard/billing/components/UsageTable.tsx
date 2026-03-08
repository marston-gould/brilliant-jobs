// ============================================================
// UsageTable — Credit usage history table (SA-017)
// ============================================================

import React from 'react';
import { Badge } from '@app/components';
import type { UsageEntry } from '../hooks/useBilling';

interface UsageTableProps {
  history: UsageEntry[];
}

export function UsageTable({ history }: UsageTableProps) {
  if (history.length === 0) {
    return (
      <p className="text-xs text-text-faint py-6 text-center">No usage history yet.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" role="table">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 px-3 text-xs font-semibold text-text-faint uppercase">Date</th>
            <th className="text-left py-2 px-3 text-xs font-semibold text-text-faint uppercase">Type</th>
            <th className="text-left py-2 px-3 text-xs font-semibold text-text-faint uppercase">Description</th>
            <th className="text-right py-2 px-3 text-xs font-semibold text-text-faint uppercase">Credits</th>
          </tr>
        </thead>
        <tbody>
          {history.slice(0, 50).map((entry, idx) => (
            <tr key={idx} className="border-b border-border last:border-0">
              <td className="py-2 px-3 text-text-faint text-xs">{entry.date}</td>
              <td className="py-2 px-3">
                <Badge variant="secondary">{entry.type}</Badge>
              </td>
              <td className="py-2 px-3 text-text text-xs">{entry.description}</td>
              <td className={`py-2 px-3 text-right text-xs font-mono ${entry.credits < 0 ? 'text-red-500' : 'text-green-500'}`}>
                {entry.credits > 0 ? '+' : ''}{entry.credits}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
