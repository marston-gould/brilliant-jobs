import { Card } from '@app/components';

interface NotificationsHeroProps {
  totalSent: number; deliveryRate: number; templateCount: number; failedCount: number
}

export function NotificationsHero(props: NotificationsHeroProps) {
  const stats = [
    { label: 'Total Sent', value: props.totalSent.toLocaleString() },
    { label: 'Delivery Rate', value: props.deliveryRate.toFixed(1) + '%' },
    { label: 'Templates', value: String(props.templateCount) },
    { label: 'Failed', value: String(props.failedCount) },
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
