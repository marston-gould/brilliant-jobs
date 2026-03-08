import { Card } from '@app/components';

interface MonitoringHeroProps {
  alertCount: number; activeAlerts: number; resolvedToday: number; avgResponseTime: number
}

export function MonitoringHero(props: MonitoringHeroProps) {
  const stats = [
    { label: 'Total Alerts', value: String(props.alertCount) },
    { label: 'Active', value: String(props.activeAlerts) },
    { label: 'Resolved Today', value: String(props.resolvedToday) },
    { label: 'Avg Response', value: props.avgResponseTime > 0 ? props.avgResponseTime.toFixed(0) + 'ms' : '—' },
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
