// ============================================================
// BillingPage — Main Billing Page Container (SA-017)
// ============================================================
// Orchestrates all billing components:
// - BillingHero (credits, plan, burn rate, days left)
// - PlanCard (current plan + upgrade/portal)
// - UsageTable (credit usage history)
//
// Data flows through useBilling hook → legacy bridge.
// Dark mode: automatic via CSS custom properties.
// Zero inline styles. Design tokens via Tailwind.
// ============================================================

import React, { useState } from 'react';
import { BillingHero, PlanCard, UsageTable } from './components';
import { useBilling } from './hooks/useBilling';

export function BillingPage() {
  const [state, actions] = useBilling();
  const [activeTab, setActiveTab] = useState<'overview' | 'usage'>('overview');

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-text-faint mt-2">Loading billing…</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-sm text-red-500 font-semibold">Failed to load billing</p>
          <p className="text-xs text-text-faint mt-1">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <BillingHero
        creditBalance={state.creditBalance}
        currentPlan={state.currentPlan}
        burnRate={state.burnRate}
        daysRemaining={state.daysRemaining}
        lowCreditAlert={state.lowCreditAlert}
      />

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-4 border-b border-border">
        {(['overview', 'usage'] as const).map(tab => (
          <button
            key={tab}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-accent text-accent'
                : 'border-transparent text-text-faint hover:text-text hover:border-border'
            }`}
            onClick={() => setActiveTab(tab)}
            role="tab"
            aria-selected={activeTab === tab}
          >
            {tab === 'overview' ? 'Plan' : 'Usage History'}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <PlanCard
          currentPlan={state.currentPlan}
          planPrice={state.planPrice}
          billingPeriod={state.billingPeriod}
          periodEnd={state.periodEnd}
          onOpenPortal={actions.openPortal}
          onOpenCheckout={actions.openCheckout}
        />
      )}

      {activeTab === 'usage' && (
        <UsageTable history={state.usageHistory} />
      )}
    </div>
  );
}

export default BillingPage;
