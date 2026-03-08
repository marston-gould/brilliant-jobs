// ============================================================
// TuningHero — Stats banner for Tuning page (SA-017)
// ============================================================

import React from 'react';
import { Card } from '@app/components';

interface TuningHeroProps {
  filterCount: number;
  levelCount: number;
  hiddenJobCount: number;
  dirty: boolean;
}

export function TuningHero({ filterCount, levelCount, hiddenJobCount, dirty }: TuningHeroProps) {
  const stats = [
    { label: 'Filters', value: String(filterCount) },
    { label: 'Levels', value: String(levelCount) },
    { label: 'Hidden Jobs', value: hiddenJobCount.toLocaleString() },
    { label: 'Status', value: dirty ? 'Unsaved' : 'Saved' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
      {stats.map(s => (
        <Card key={s.label} variant="default" padding="md">
          <p className="text-xs font-semibold text-text-faint uppercase tracking-wider mb-1">{s.label}</p>
          <p className={`text-2xl font-bold ${s.label === 'Status' && dirty ? 'text-amber-500' : 'text-text'}`}>{s.value}</p>
        </Card>
      ))}
    </div>
  );
}
