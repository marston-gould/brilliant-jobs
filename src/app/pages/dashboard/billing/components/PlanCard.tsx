// ============================================================
// PlanCard — Current plan display + upgrade (SA-017)
// ============================================================

import { Card, Button, Badge } from '@app/components';

interface PlanCardProps {
  currentPlan: string;
  planPrice: number;
  billingPeriod: string;
  periodEnd: string;
  onOpenPortal: () => void;
  onOpenCheckout: (mode: string) => void;
}

export function PlanCard({ currentPlan, planPrice, billingPeriod, periodEnd, onOpenPortal, onOpenCheckout }: PlanCardProps) {
  return (
    <Card variant="default" padding="lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text">Current Plan</h3>
        <Badge variant="default">{currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}</Badge>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-xs">
          <span className="text-text-faint">Price</span>
          <span className="text-text font-medium">${planPrice}/{billingPeriod === 'yearly' ? 'year' : 'month'}</span>
        </div>
        {periodEnd && (
          <div className="flex justify-between text-xs">
            <span className="text-text-faint">Renews</span>
            <span className="text-text font-medium">{periodEnd}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {currentPlan !== 'pro' && (
          <Button variant="primary" size="sm" onClick={() => onOpenCheckout('upgrade')}>
            Upgrade
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onOpenPortal}>
          Manage Subscription
        </Button>
      </div>
    </Card>
  );
}
