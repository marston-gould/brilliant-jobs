// ============================================================
// BillingHero — Stats banner for Billing page (SA-017)
// ============================================================

import React from 'react';
import { Card, Badge } from '@app/components';

interface BillingHeroProps {
  creditBalance: number;
  currentPlan: string;
  burnRate: number;
  daysRemaining: number;
  lowCreditAlert: boolean;
}

export function BillingHero({ creditBalance, currentPlan, burnRate, daysRemaining, lowCreditAlert }: BillingHeroProps) {
  const stats = [
    { label: 'Credits', value: creditBalance.toLocaleString(), alert: lowCreditAlert },
    { label: 'Plan', value: currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1), alert: false },
    { label: 'Burn Rate', value: `${burnRate}/day`, alert: false },
    { label: 'Days Left', value: daysRemaining > 365 ? '∞' : String(daysRemaining), alert: daysRemaining < 7 && daysRemaining > 0 },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
      {stats.map(s => (
        <Card key={s.label} variant="default" padding="md">
          <p className="text-xs font-semibold text-text-faint uppercase tracking-wider mb-1">{s.label}</p>
          <p className={`text-2xl font-bold ${s.alert ? 'text-red-500' : 'text-text'}`}>
            {s.value}
          </p>
        </Card>
      ))}
    </div>
  );
}
