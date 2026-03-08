// ============================================================
// ApplicationsHero — Stats banner for Applications page (SA-016)
// ============================================================

import React from 'react';
import { Card } from '@app/components';
import type { AppEntry } from '../hooks/useApplications';

interface ApplicationsHeroProps {
  queue: AppEntry[];
  history: AppEntry[];
}

export function ApplicationsHero({ queue, history }: ApplicationsHeroProps) {
  const all = [...queue, ...history];
  const queued = queue.filter(a => a.status === 'queued').length;
  const pending = queue.filter(a => a.status === 'pending' || a.status === 'sent').length;
  const submitted = all.filter(a => a.status === 'submitted').length;
  const failed = all.filter(a => a.status === 'failed').length;

  const stats = [
    { label: 'Queued', value: queued, variant: 'default' as const },
    { label: 'Pending', value: pending, variant: 'default' as const },
    { label: 'Submitted', value: submitted, variant: 'default' as const },
    { label: 'Failed', value: failed, variant: 'default' as const },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
      {stats.map(s => (
        <Card key={s.label} variant="default" padding="md">
          <p className="text-xs font-semibold text-text-faint uppercase tracking-wider mb-1">{s.label}</p>
          <p className={`text-2xl font-bold ${
            s.label === 'Failed' && s.value > 0 ? 'text-red-500' : 'text-text'
          }`}>
            {s.value}
          </p>
        </Card>
      ))}
    </div>
  );
}
