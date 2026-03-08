// ============================================================
// IntegrationsHero — Stats banner for Integrations page (SA-017)
// ============================================================

import { Card } from '@app/components';

interface IntegrationsHeroProps {
  gdriveConnected: boolean;
  gmailConnected: boolean;
  extensionInstalled: boolean;
  fileCount: number;
}

export function IntegrationsHero({ gdriveConnected, gmailConnected, extensionInstalled, fileCount }: IntegrationsHeroProps) {
  const connectedCount = [gdriveConnected, gmailConnected, extensionInstalled].filter(Boolean).length;

  const stats = [
    { label: 'Connected', value: `${connectedCount}/3`, highlight: connectedCount === 3 },
    { label: 'Google Drive', value: gdriveConnected ? 'Active' : 'Off', highlight: gdriveConnected },
    { label: 'Gmail', value: gmailConnected ? 'Active' : 'Off', highlight: gmailConnected },
    { label: 'Extension', value: extensionInstalled ? 'Active' : 'Off', highlight: extensionInstalled },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
      {stats.map(s => (
        <Card key={s.label} variant="default" padding="md">
          <p className="text-xs font-semibold text-text-faint uppercase tracking-wider mb-1">{s.label}</p>
          <p className={`text-2xl font-bold ${s.highlight ? 'text-green-500' : 'text-text-faint'}`}>
            {s.value}
          </p>
        </Card>
      ))}
    </div>
  );
}
