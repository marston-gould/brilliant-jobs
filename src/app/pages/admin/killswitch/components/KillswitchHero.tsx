import { Card } from '@app/components';

interface KillswitchHeroProps {
  extensionEnabled: boolean; dashboardEnabled: boolean; landingEnabled: boolean
}

export function KillswitchHero(props: KillswitchHeroProps) {
  const stats = [
    { label: 'Extension', value: props.extensionEnabled ? 'ON' : 'OFF' },
    { label: 'Dashboard', value: props.dashboardEnabled ? 'ON' : 'OFF' },
    { label: 'Landing', value: props.landingEnabled ? 'ON' : 'OFF' },
    { label: 'Status', value: (props.extensionEnabled && props.dashboardEnabled && props.landingEnabled) ? 'All Live' : 'Partial' },
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
