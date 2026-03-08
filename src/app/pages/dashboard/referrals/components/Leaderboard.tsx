import React from 'react';
import { Card } from '@app/components';
import type { LeaderboardEntry } from '../hooks/useReferrals';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  period: string;
  onSwitchPeriod: (p: 'week' | 'month' | 'all') => void;
}

export function Leaderboard({ entries, period, onSwitchPeriod }: LeaderboardProps) {
  const periods: Array<{ label: string; value: 'week' | 'month' | 'all' }> = [
    { label: 'Week', value: 'week' },
    { label: 'Month', value: 'month' },
    { label: 'All Time', value: 'all' },
  ];

  return (
    <Card variant="default" padding="lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text">Leaderboard</h3>
        <div className="flex gap-1">
          {periods.map(p => (
            <button
              key={p.value}
              className={`px-2 py-1 text-xs rounded ${period === p.value ? 'bg-accent text-white' : 'bg-bg-elevated text-text-faint hover:text-text'}`}
              onClick={() => onSwitchPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-text-faint text-center py-4">No referral data yet.</p>
      ) : (
        <div className="space-y-2">
          {entries.map(e => (
            <div key={e.rank} className="flex items-center justify-between py-2 px-3 bg-bg-elevated rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-text-faint w-6 text-center">#{e.rank}</span>
                <span className="text-sm text-text">{e.name}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-text-faint">
                <span>{e.referrals} referrals</span>
                <span className="font-mono text-green-500">+{e.credits}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
