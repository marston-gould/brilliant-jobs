// ============================================================
// SettingsHero — Stats banner for Settings page (SA-017)
// ============================================================

import { Card } from '@app/components';

interface SettingsHeroProps {
  jobCount: number;
  filterCount: number;
  resumeCount: number;
  email: string;
}

export function SettingsHero({ jobCount, filterCount, resumeCount, email }: SettingsHeroProps) {
  const stats = [
    { label: 'Account', value: email || '—' },
    { label: 'Jobs Tracked', value: jobCount.toLocaleString() },
    { label: 'Filters', value: String(filterCount) },
    { label: 'Resumes', value: String(resumeCount) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
      {stats.map(s => (
        <Card key={s.label} variant="default" padding="md">
          <p className="text-xs font-semibold text-text-faint uppercase tracking-wider mb-1">{s.label}</p>
          <p className="text-lg font-bold text-text truncate">{s.value}</p>
        </Card>
      ))}
    </div>
  );
}
