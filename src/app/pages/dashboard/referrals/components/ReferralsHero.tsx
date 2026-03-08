import { Card } from '@app/components';
import type { ReferralStats } from '../hooks/useReferrals';

interface ReferralsHeroProps {
  stats: ReferralStats;
}

export function ReferralsHero({ stats }: ReferralsHeroProps) {
  const items = [
    { label: 'Total Referred', value: String(stats.totalReferred) },
    { label: 'Active Users', value: String(stats.activeUsers) },
    { label: 'Credits Earned', value: stats.creditsEarned.toLocaleString() },
    { label: 'Conversion', value: `${stats.conversionRate}%` },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
      {items.map(s => (
        <Card key={s.label} variant="default" padding="md">
          <p className="text-xs font-semibold text-text-faint uppercase tracking-wider mb-1">{s.label}</p>
          <p className="text-2xl font-bold text-text">{s.value}</p>
        </Card>
      ))}
    </div>
  );
}
