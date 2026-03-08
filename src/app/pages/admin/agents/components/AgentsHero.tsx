import { Card } from '@app/components';

interface AgentsHeroProps {
  agentCount: number; activeCount: number; actionCount: number; errorRate: number
}

export function AgentsHero(props: AgentsHeroProps) {
  const stats = [
    { label: 'Agents', value: String(props.agentCount) },
    { label: 'Active', value: String(props.activeCount) },
    { label: 'Actions', value: props.actionCount.toLocaleString() },
    { label: 'Error Rate', value: props.errorRate.toFixed(1) + '%' },
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
