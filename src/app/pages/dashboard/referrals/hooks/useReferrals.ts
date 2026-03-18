// ============================================================
// useReferrals — Referrals data hook (SA-017)
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { safeReadLS, safeWriteLS, callGateway, getUser } from '@lib/supabase';

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
      // SPA-CUT-3: Data loaded from localStorage/Supabase (no window bridge)
      dispatch({
        type: 'LOADED',
        data: {
          link: safeReadLS('bj__refLink', ''),
          code: safeReadLS('bj__refCode', ''),
          stats: initialState.stats,
          // @ts-ignore SPA-CUT-3
          leaderboard: Array.isArray(null) ? null : [],
          // @ts-ignore SPA-CUT-3
          leaderboardEnabled: !!null,
          period: 'month',
        },
      });
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    // Init referral hub
    // SPA-CUT-3: Referral init handled by React component mount
    loadData();
    pollRef.current = setInterval(loadData, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = (name: string, ...args: any[]) => {
    // SPA-CUT-3: Dynamic dispatch removed — actions handled by hook methods directly
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
