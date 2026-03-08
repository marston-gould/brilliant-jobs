import React from 'react';
import { Card } from '@app/components';

interface JobsHeroProps {
  total: number; page: number
}

export function JobsHero(props: JobsHeroProps) {
  const stats = [
    { label: 'Total Jobs', value: props.total.toLocaleString() },
    { label: 'Page', value: String(props.page) },
    { label: 'Per Page', value: '50' },
    { label: 'Pages', value: String(Math.ceil(props.total / 50) || 1) },
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
