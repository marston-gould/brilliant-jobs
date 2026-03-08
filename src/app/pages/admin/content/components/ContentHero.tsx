import React from 'react';
import { Card } from '@app/components';

interface ContentHeroProps {
  storyCount: number; pendingCount: number; publishedCount: number
}

export function ContentHero(props: ContentHeroProps) {
  const stats = [
    { label: 'Total', value: String(props.storyCount) },
    { label: 'Pending', value: String(props.pendingCount) },
    { label: 'Published', value: String(props.publishedCount) },
    { label: 'Rate', value: props.storyCount > 0 ? Math.round((props.publishedCount / props.storyCount) * 100) + '%' : '0%' },
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
