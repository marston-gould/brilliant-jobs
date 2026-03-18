// ============================================================
// useReferrals — Referrals data hook (SPA-PHASE-A rewrite)
// ============================================================
// Loads referral stats/leaderboard/code from providers.referrals
// (Supabase-backed). All actions are real implementations.
// ============================================================

import { useCallback, useEffect, useReducer } from 'react';
import { providers } from '@app/providers/bridge';

export interface ReferralStats {
  totalReferred: number;
  activeUsers: number;
  creditsEarned: number;
  conversionRate: number;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  referrals: number;
  credits: number;
}

interface ReferralsState {
  loading: boolean;
  error: string | null;
  link: string;
  code: string;
  stats: ReferralStats;
  leaderboard: LeaderboardEntry[];
  leaderboardEnabled: boolean;
  period: 'week' | 'month' | 'all';
}

type Action =
  | { type: 'LOADED'; data: Partial<ReferralsState> }
  | { type: 'ERROR'; error: string };

const initialState: ReferralsState = {
  loading: true,
  error: null,
  link: '',
  code: '',
  stats: { totalReferred: 0, activeUsers: 0, creditsEarned: 0, conversionRate: 0 },
  leaderboard: [],
  leaderboardEnabled: false,
  period: 'month',
};

function reducer(state: ReferralsState, action: Action): ReferralsState {
  switch (action.type) {
    case 'LOADED': return { ...state, loading: false, error: null, ...action.data };
    case 'ERROR': return { ...state, loading: false, error: action.error };
    default: return state;
  }
}

export function useReferrals(): [ReferralsState, {
  copyLink: () => void;
  copyCode: () => void;
  shareLinkedIn: () => void;
  shareEmail: () => void;
  shareSMS: () => void;
  switchPeriod: (period: 'week' | 'month' | 'all') => void;
  toggleLeaderboard: (enabled: boolean) => void;
  openShareModal: (context?: string) => void;
}] {
  const [state, dispatch] = useReducer(reducer, initialState);

  const loadData = useCallback(async () => {
    try {
      const [rawStats, rawLeaderboard, code] = await Promise.all([
        providers.referrals.getStats(),
        providers.referrals.getLeaderboard(),
        providers.referrals.getCode(),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = rawStats as any;
      const stats: ReferralStats = {
        totalReferred: s?.totalReferred ?? 0,
        activeUsers: s?.converted ?? 0,
        creditsEarned: s?.creditsEarned ?? 0,
        conversionRate: s?.totalReferred > 0
          ? Math.round(((s?.converted ?? 0) / s.totalReferred) * 100)
          : 0,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const leaderboard: LeaderboardEntry[] = (rawLeaderboard as any[]).map((e: any) => ({
        rank: e.rank ?? 0,
        name: e.displayName ?? e.userId?.substring(0, 8) ?? '—',
        referrals: e.referralCount ?? 0,
        credits: e.creditsEarned ?? 0,
      }));

      const link = code ? `${window.location.origin}?ref=${code}` : '';

      dispatch({
        type: 'LOADED',
        data: { code, link, stats, leaderboard, leaderboardEnabled: leaderboard.length > 0 },
      });
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      (window as any).__bjToast?.(`${label} copied!`, 'success');
    }).catch(() => {
      (window as any).__bjToast?.('Copy failed — try manually', 'error');
    });
  }, []);

  return [state, {
    copyLink: () => copyToClipboard(state.link, 'Referral link'),
    copyCode: () => copyToClipboard(state.code, 'Referral code'),
    shareLinkedIn: () => {
      const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(state.link)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    shareEmail: () => {
      const subject = encodeURIComponent('Join me on Brilliant Jobs');
      const body = encodeURIComponent(`I've been using Brilliant Jobs to find great opportunities. Sign up with my link: ${state.link}`);
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    },
    shareSMS: () => {
      window.location.href = `sms:?body=${encodeURIComponent(`Join Brilliant Jobs: ${state.link}`)}`;
    },
    switchPeriod: (period) => dispatch({ type: 'LOADED', data: { period } }),
    toggleLeaderboard: (enabled) => dispatch({ type: 'LOADED', data: { leaderboardEnabled: enabled } }),
    openShareModal: () => {
      copyToClipboard(state.link, 'Referral link');
    },
  }];
}
