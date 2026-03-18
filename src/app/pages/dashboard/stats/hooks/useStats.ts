// ============================================================
// useStats — Stats data hook (SA-017 → SPA-CUT-2)
// ============================================================
// Standalone — queries materialized views directly via Supabase.
// Zero window.* dependencies.
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { safeReadLS } from '@lib/supabase';
import { providers } from '@app/providers/bridge';

export interface StatCard {
  label: string;
  value: string;
  sub?: string;
}

export interface FilterPill {
  label: string;
  color: string;
  selected: boolean;
  idx: number;
}

interface StatsState {
  loading: boolean;
  error: string | null;
  cards: StatCard[];
  filters: FilterPill[];
  compareMode: boolean;
  chartsReady: boolean;
}

type Action =
  | { type: 'LOADED'; data: Partial<StatsState> }
  | { type: 'ERROR'; error: string };

const initialState: StatsState = {
  loading: true, error: null, cards: [], filters: [],
  compareMode: false, chartsReady: false,
};

function reducer(state: StatsState, action: Action): StatsState {
  switch (action.type) {
    case 'LOADED': return { ...state, loading: false, error: null, ...action.data };
    case 'ERROR': return { ...state, loading: false, error: action.error };
    default: return state;
  }
}

export interface StatsActions {
  refresh: () => Promise<void>;
  toggleFilter: (idx: number) => void;
  toggleCompare: () => void;
  refreshCharts: () => void;
}

export function useStats(): [StatsState, StatsActions] {
  const [state, dispatch] = useReducer(reducer, initialState);
  const mountedRef = useRef(true);

  // SPA-CUT-2: Load stats from materialized views directly
  const refresh = useCallback(async () => {
    try {
      // Job feed counts MV
      const counts = await providers.stats.getJobCounts();

      // Source breakdown MV
      const sources = await providers.stats.getSourceBreakdown();

      const cards: StatCard[] = [];
      if (counts) {
        cards.push({ label: 'Total Open Jobs', value: String(counts.total_open || 0) });
        cards.push({ label: 'New Today', value: String(counts.new_today || 0) });
        cards.push({ label: 'Companies', value: String(counts.total_companies || 0) });
      }
      if (sources) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const topSource = sources.sort((a: any, b: any) => (b.job_count || 0) - (a.job_count || 0))[0];
        if (topSource) cards.push({ label: 'Top Source', value: topSource.source_name, sub: `${topSource.job_count} jobs` });
      }

      // Saved filters for comparison — load from Supabase tuning data
      let savedFilters: any[] = [];
      try {
        const tuningData = await providers.tuning.getTuning() as any;
        savedFilters = Array.isArray(tuningData?.filters) ? tuningData.filters : [];
      } catch {
        savedFilters = safeReadLS<any[]>('bj_saved_filters', []);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filters: FilterPill[] = savedFilters.map((f: any, i: number) => ({
        label: f.name || `Filter ${i + 1}`,
        color: f.color || '#6366f1',
        selected: !!f.checked,
        idx: i,
      }));

      if (mountedRef.current) {
        dispatch({ type: 'LOADED', data: { cards, filters, chartsReady: true } });
      }
    } catch (err) {
      if (mountedRef.current) {
        dispatch({ type: 'ERROR', error: (err as Error).message || 'Failed to load stats' });
      }
    }
  }, []);

  const toggleFilter = useCallback((idx: number) => {
    dispatch({ type: 'LOADED', data: {
      filters: state.filters.map((f, i) => i === idx ? { ...f, selected: !f.selected } : f),
    }});
  }, [state.filters]);

  const toggleCompare = useCallback(() => {
    dispatch({ type: 'LOADED', data: { compareMode: !state.compareMode } });
  }, [state.compareMode]);

  const refreshCharts = useCallback(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => { mountedRef.current = false; };
  }, [refresh]);

  return [state, { refresh, toggleFilter, toggleCompare, refreshCharts }];
}
