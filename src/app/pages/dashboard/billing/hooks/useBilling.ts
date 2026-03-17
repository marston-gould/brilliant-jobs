// ============================================================
// useBilling — Billing data hook (SA-017 → SPA-CUT-2)
// ============================================================
// Standalone — reads credit balance via get-user-balance EF,
// pricing from Supabase. Zero window.* dependencies.
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { supabase, safeReadLS, callGateway, getUser } from '@lib/supabase';
import { providers } from '@app/providers/bridge';

export interface PricingTier { name: string; price: number; credits: number; features: string[]; current: boolean; }
export interface UsageEntry { date: string; type: string; credits: number; description: string; }
export interface AutoRefillConfig { enabled: boolean; threshold: number; amount: number; paymentMethod?: string; }

interface BillingState {
  loading: boolean;
  error: string | null;
  creditBalance: number;
  currentPlan: string;
  planPrice: number;
  billingPeriod: string;
  periodEnd: string;
  usageHistory: UsageEntry[];
  burnRate: number;
  daysRemaining: number;
  tiers: PricingTier[];
  autoRefill: AutoRefillConfig;
  lowCreditAlert: boolean;
  isAdmin: boolean;
}

type Action =
  | { type: 'LOADED'; data: Partial<BillingState> }
  | { type: 'ERROR'; error: string };

const initial: BillingState = {
  loading: true, error: null, creditBalance: 0, currentPlan: 'free', planPrice: 0,
  billingPeriod: 'monthly', periodEnd: '', usageHistory: [], burnRate: 0,
  daysRemaining: 999, tiers: [], autoRefill: { enabled: false, threshold: 0, amount: 0 },
  lowCreditAlert: false, isAdmin: false,
};

function reducer(state: BillingState, action: Action): BillingState {
  switch (action.type) {
    case 'LOADED': return { ...state, loading: false, error: null, ...action.data };
    case 'ERROR': return { ...state, loading: false, error: action.error };
    default: return state;
  }
}

export interface BillingActions {
  refresh: () => Promise<void>;
  openPricing: () => void;
  openBillingPortal: () => void;
  saveAutoRefill: (config: AutoRefillConfig) => void;
}

export function useBilling(): [BillingState, BillingActions] {
  const [state, dispatch] = useReducer(reducer, initial);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const user = await getUser();
      if (!user) { dispatch({ type: 'ERROR', error: 'Not authenticated' }); return; }

      // Get balance via EF
      let balance = 0;
      try {
        const bal = await callGateway<any>('get-user-balance', undefined, { method: 'GET', timeout: 10000 });
        balance = bal?.total || 0;
      } catch { /* fallback to 0 */ }

      // Get pricing from DB
      const pricing = await providers.billing.getPricing();

      const profile = await providers.billing.getUserProfile();

      const applySettings = safeReadLS<any>('bj_apply_settings', {});
      const autoRefill = safeReadLS<AutoRefillConfig>('bj_auto_refill', { enabled: false, threshold: 0, amount: 0 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tiers: PricingTier[] = (pricing || []).map((t: any) => ({
        name: t.tier, price: (t.subscription_price_cents || 0) / 100,
        credits: t.included_credits || 0,
        features: t.features ? Object.keys(t.features) : [],
        current: profile?.user_data?.cohort_tier === t.tier || (t.tier === 'free' && !profile?.user_data?.cohort_tier),
      }));

      const currentTier = tiers.find(t => t.current);

      if (mountedRef.current) {
        dispatch({ type: 'LOADED', data: {
          creditBalance: balance,
          currentPlan: currentTier?.name || 'free',
          planPrice: currentTier?.price || 0,
          tiers,
          autoRefill,
          lowCreditAlert: balance < 100,
          isAdmin: profile?.role === 'admin',
        }});
      }
    } catch (err) {
      if (mountedRef.current) dispatch({ type: 'ERROR', error: (err as Error).message });
    }
  }, []);

  const openPricing = useCallback(() => {
    // Navigate to pricing or open modal — SPA handles routing
    window.location.hash = '#subscription';
  }, []);

  const openBillingPortal = useCallback(async () => {
    try {
      const result = await callGateway<{ url: string }>('create-portal-session', {}, { timeout: 15000 });
      if (result?.url) window.open(result.url, '_blank');
    } catch { /* non-fatal */ }
  }, []);

  const saveAutoRefill = useCallback((config: AutoRefillConfig) => {
    try { localStorage.setItem('bj_auto_refill', JSON.stringify(config)); } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => { mountedRef.current = false; };
  }, [refresh]);

  return [state, { refresh, openPricing, openBillingPortal, saveAutoRefill }];
}
