import { Card } from '@app/components';

interface CronHeroProps {
  total: number; activeCount: number; failedCount: number
}

export function CronHero(props: CronHeroProps) {
  const stats = [
    { label: 'Total Jobs', value: String(props.total) },
    { label: 'Active', value: String(props.activeCount) },
    { label: 'Failed', value: String(props.failedCount) },
    { label: 'Health', value: props.failedCount === 0 ? '100%' : Math.round(((props.total - props.failedCount) / props.total) * 100) + '%' },
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
