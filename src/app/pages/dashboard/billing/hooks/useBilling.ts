// ============================================================
// useBilling — Billing data hook (SA-017)
// ============================================================
// Bridges to legacy billing.js via window.* globals.
// Components consume billing data through this hook only.
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';

// ── Types ────────────────────────────────────────────────────

export interface PricingTier {
  name: string;
  price: number;
  credits: number;
  features: string[];
  current: boolean;
}

export interface UsageEntry {
  date: string;
  type: string;
  credits: number;
  description: string;
}

export interface AutoRefillConfig {
  enabled: boolean;
  threshold: number;
  amount: number;
  paymentMethod?: string;
}

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

const initialState: BillingState = {
  loading: true,
  error: null,
  creditBalance: 0,
  currentPlan: 'free',
  planPrice: 0,
  billingPeriod: 'monthly',
  periodEnd: '',
  usageHistory: [],
  burnRate: 0,
  daysRemaining: 0,
  tiers: [],
  autoRefill: { enabled: false, threshold: 0, amount: 0 },
  lowCreditAlert: false,
  isAdmin: false,
};

function reducer(state: BillingState, action: Action): BillingState {
  switch (action.type) {
    case 'LOADED':
      return { ...state, loading: false, error: null, ...action.data };
    case 'ERROR':
      return { ...state, loading: false, error: action.error };
    default:
      return state;
  }
}

// ── Hook ─────────────────────────────────────────────────────

export function useBilling(): [BillingState, {
  openCheckout: (mode: string, tier?: string) => void;
  openPortal: () => void;
  setAutoRefill: (config: Partial<AutoRefillConfig>) => void;
  buyCredits: (qty: number) => void;
}] {
  const [state, dispatch] = useReducer(reducer, initialState);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(() => {
    try {
      const bj = (window as any);
      const balance = typeof bj.getUserCredits === 'function' ? bj.getUserCredits() : (bj._creditBalance || 0);
      const pricing = bj._billingPricing || {};
      const history = Array.isArray(bj._billingHistory) ? bj._billingHistory : [];
      const autoRefill = bj._autoRefillConfig || { enabled: false, threshold: 0, amount: 0 };
      const tiers = Array.isArray(pricing.tiers) ? pricing.tiers : [];
      const burnRate = bj._burnRate || 0;
      const daysRemaining = burnRate > 0 ? Math.floor(balance / burnRate) : 999;

      dispatch({
        type: 'LOADED',
        data: {
          creditBalance: balance,
          currentPlan: pricing.currentPlan || 'free',
          planPrice: pricing.price || 0,
          billingPeriod: pricing.period || 'monthly',
          periodEnd: pricing.periodEnd || '',
          usageHistory: history,
          burnRate,
          daysRemaining,
          tiers,
          autoRefill,
          lowCreditAlert: balance < 100,
          isAdmin: bj._bjUserRole === 'admin',
        },
      });
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    loadData();
    pollRef.current = setInterval(loadData, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const openCheckout = useCallback((mode: string, tier?: string) => {
    try {
      const fn = (window as any).openPricingModal;
      if (typeof fn === 'function') fn(mode, tier);
    } catch (e) {
      console.warn('[useBilling] openCheckout failed:', e);
    }
  }, []);

  const openPortal = useCallback(() => {
    try {
      const fn = (window as any).openBillingPortal || (window as any)._openBillingPortal;
      if (typeof fn === 'function') fn();
    } catch (e) {
      console.warn('[useBilling] openPortal failed:', e);
    }
  }, []);

  const setAutoRefill = useCallback((config: Partial<AutoRefillConfig>) => {
    try {
      const fn = (window as any)._saveAutoRefill;
      if (typeof fn === 'function') fn(config);
    } catch (e) {
      console.warn('[useBilling] setAutoRefill failed:', e);
    }
  }, []);

  const buyCredits = useCallback((qty: number) => {
    try {
      const fn = (window as any).openPricingModal;
      if (typeof fn === 'function') fn('credits', null, qty);
    } catch (e) {
      console.warn('[useBilling] buyCredits failed:', e);
    }
  }, []);

  return [state, { openCheckout, openPortal, setAutoRefill, buyCredits }];
}
