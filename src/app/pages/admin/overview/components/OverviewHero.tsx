import React from 'react';
import { Card } from '@app/components';

interface OverviewHeroProps {
  totalJobs: number; activeUsers: number; efHealth: number; cronHealth: number
}

export function OverviewHero(props: OverviewHeroProps) {
  const stats = [
    { label: 'Total Jobs', value: props.totalJobs.toLocaleString() },
    { label: 'Active Users', value: String(props.activeUsers) },
    { label: 'EF Health', value: props.efHealth + '%' },
    { label: 'Cron Health', value: props.cronHealth + '%' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
      {stats.map(s => (
        <Card key={s.label} variant="default" padding="md">
          <p className="text-xs font-semibold text-text-faint uppercase tracking-wider mb-1">{s.label}</p>
          <p className="text-2xl font-bold text-text">{s.value}</p>
        </Card>
      ))}
    </div>
  );
}
