// ============================================================
// useReferrals — Referrals data hook (SA-017)
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(() => {
    try {
      const bj = (window as any);
      dispatch({
        type: 'LOADED',
        data: {
          link: bj._refLink || '',
          code: bj._refCode || '',
          stats: bj._refStats || initialState.stats,
          leaderboard: Array.isArray(bj._refLeaderboard) ? bj._refLeaderboard : [],
          leaderboardEnabled: !!bj._refLeaderboardEnabled,
          period: bj._refPeriod || 'month',
        },
      });
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    // Init referral hub
    try { const fn = (window as any).initReferralHub; if (typeof fn === 'function') fn(); } catch {}
    loadData();
    pollRef.current = setInterval(loadData, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const call = (name: string, ...args: any[]) => {
    try { const fn = (window as any)[name]; if (typeof fn === 'function') fn(...args); } catch {}
  };

  return [state, {
    copyLink: () => call('_refCopyLink'),
    copyCode: () => call('_refCopyCode'),
    shareLinkedIn: () => call('_refShareLinkedIn'),
    shareEmail: () => call('_refShareEmail'),
    shareSMS: () => call('_refShareSMS'),
    switchPeriod: (p) => call('_refSwitchPeriod', p),
    toggleLeaderboard: (e) => call('_refToggleLeaderboard', e),
    openShareModal: (ctx) => call('showReferralShareModal', ctx),
  }];
}
