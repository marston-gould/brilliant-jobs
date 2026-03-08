// ============================================================
// useStats — Stats data hook (SA-017)
// ============================================================
// Bridges to legacy stats.js. ECharts are rendered by legacy code
// into container divs. This hook exposes filter/stat card data.
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';

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
  loading: true,
  error: null,
  cards: [],
  filters: [],
  compareMode: false,
  chartsReady: false,
};

function reducer(state: StatsState, action: Action): StatsState {
  switch (action.type) {
    case 'LOADED': return { ...state, loading: false, error: null, ...action.data };
    case 'ERROR': return { ...state, loading: false, error: action.error };
    default: return state;
  }
}

export function useStats(): [StatsState, {
  toggleFilter: (idx: number) => void;
  toggleCompare: () => void;
  refreshCharts: () => void;
  initCharts: (containerIds: Record<string, HTMLDivElement | null>) => void;
}] {
  const [state, dispatch] = useReducer(reducer, initialState);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initRef = useRef(false);

  const loadData = useCallback(() => {
    try {
      const bj = (window as any);
      const savedFilters = Array.isArray(bj.savedFilters) ? bj.savedFilters : [];
      const filterColors = bj.filterColors || {};
      const statsSelectedFilters: string[] = (() => {
        try { return JSON.parse(localStorage.getItem('bj_stats_filters') || '["__all__"]'); } catch { return ['__all__']; }
      })();

      const filters: FilterPill[] = [
        { label: 'All Filters', color: '#6366f1', selected: statsSelectedFilters.includes('__all__'), idx: -1 },
        ...savedFilters.map((f: any, i: number) => ({
          label: f.name || f.label || `Filter ${i + 1}`,
          color: filterColors[i] || '#6366f1',
          selected: statsSelectedFilters.includes(String(i)),
          idx: i,
        })),
      ];

      // Read stat cards from DOM if rendered by legacy code
      const cardEls = document.querySelectorAll('.stats-card');
      const cards: StatCard[] = [];
      cardEls.forEach((el) => {
        const label = el.querySelector('.stats-card-label')?.textContent || '';
        const value = el.querySelector('.stats-card-value')?.textContent || '';
        const sub = el.querySelector('.stats-card-sub')?.textContent || undefined;
        if (label) cards.push({ label, value, sub });
      });

      dispatch({
        type: 'LOADED',
        data: {
          cards: cards.length > 0 ? cards : state.cards,
          filters,
          compareMode: !!bj.statsCompareMode,
          chartsReady: !!bj.statsInitialized,
        },
      });
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    // Trigger legacy init on first mount
    if (!initRef.current) {
      initRef.current = true;
      try {
        const fn = (window as any).initStatsPage;
        if (typeof fn === 'function') fn();
      } catch {}
    }
    loadData();
    pollRef.current = setInterval(loadData, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const toggleFilter = useCallback((idx: number) => {
    try {
      const fn = (window as any)._statsToggleFilter;
      if (typeof fn === 'function') fn(idx);
      else {
        // Fallback: manipulate localStorage directly
        const current: string[] = JSON.parse(localStorage.getItem('bj_stats_filters') || '["__all__"]');
        const key = idx === -1 ? '__all__' : String(idx);
        const updated = current.includes(key) ? current.filter(k => k !== key) : [...current.filter(k => k !== '__all__'), key];
        localStorage.setItem('bj_stats_filters', JSON.stringify(updated.length ? updated : ['__all__']));
      }
    } catch {}
  }, []);

  const toggleCompare = useCallback(() => {
    try { const bj = (window as any); bj.statsCompareMode = !bj.statsCompareMode; } catch {}
  }, []);

  const refreshCharts = useCallback(() => {
    try {
      const fn = (window as any).refreshStatsCharts;
      if (typeof fn === 'function') fn();
    } catch {}
  }, []);

  const initCharts = useCallback((_containers: Record<string, HTMLDivElement | null>) => {
    // Charts are initialized by legacy code into the existing DOM
    try {
      const fn = (window as any).initStatsPage;
      if (typeof fn === 'function') fn();
    } catch {}
  }, []);

  return [state, { toggleFilter, toggleCompare, refreshCharts, initCharts }];
}
