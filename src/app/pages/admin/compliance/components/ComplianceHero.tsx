import { Card } from '@app/components';

interface ComplianceHeroProps {
  piiFieldCount: number; pendingDeletions: number; completedDeletions: number; lastAudit: string
}

export function ComplianceHero(props: ComplianceHeroProps) {
  const stats = [
    { label: 'PII Fields', value: String(props.piiFieldCount) },
    { label: 'Pending', value: String(props.pendingDeletions) },
    { label: 'Completed', value: String(props.completedDeletions) },
    { label: 'Last Audit', value: props.lastAudit || '—' },
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
