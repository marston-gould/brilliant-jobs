// ============================================================
// ReferralsPage — Main Referrals Page Container (SA-017)
// ============================================================

import React from 'react';
import { ReferralsHero, SharePanel, Leaderboard } from './components';
import { useReferrals } from './hooks/useReferrals';

export function ReferralsPage() {
  const [state, actions] = useReferrals();

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-text-faint mt-2">Loading referrals…</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-sm text-red-500 font-semibold">Failed to load referrals</p>
          <p className="text-xs text-text-faint mt-1">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <ReferralsHero stats={state.stats} />

      <div className="space-y-4">
        <SharePanel
          link={state.link}
          code={state.code}
          onCopyLink={actions.copyLink}
          onCopyCode={actions.copyCode}
          onShareLinkedIn={actions.shareLinkedIn}
          onShareEmail={actions.shareEmail}
          onShareSMS={actions.shareSMS}
        />

        <Leaderboard
          entries={state.leaderboard}
          period={state.period}
          onSwitchPeriod={actions.switchPeriod}
        />
      </div>
    </div>
  );
}

export default ReferralsPage;
