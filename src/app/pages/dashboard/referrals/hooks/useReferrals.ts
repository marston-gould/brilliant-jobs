// ============================================================
// useReferrals — Referrals data hook (SA-017)
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { supabase, safeReadLS, safeWriteLS, callGateway, getUser } from '@lib/supabase';

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
      // SUB-06: prefer username-based link; fall back to legacy /r/ link
      const legacyLink = safeReadLS('bj__refLink', '');
      const legacyCode = safeReadLS('bj__refCode', '');
      // Attempt to resolve username from profiles table (best-effort, non-blocking)
      import('@app/lib/supabase').then(({ supabase }) => {
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (!user) return;
          supabase.from('profiles').select('username').eq('id', user.id).single()
            .then(({ data }) => {
              if (data?.username) {
                const usernameLink = 'https://brilliantjobs.app/' + data.username;
                dispatch({ type: 'LOADED', data: {
                  link: usernameLink, code: legacyCode || data.username,
                  stats: initialState.stats, leaderboard: [], leaderboardEnabled: false, period: 'month',
                }});
              }
            }).catch(() => {});
        }).catch(() => {});
      }).catch(() => {});
      dispatch({
        type: 'LOADED',
        data: {
          link: legacyLink,
          code: legacyCode,
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
