// ============================================================
// usePipeline — Pipeline data hook (SA-015)
// ============================================================
// Bridges to legacy pipeline.js via window.* globals.
// Components consume pipeline data through this hook only.
// When migration is complete, swap window.* reads for
// PipelineProvider calls — no component changes needed.
// ============================================================

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

// ── Types ────────────────────────────────────────────────────

export const PL_STAGES = [
  'saved', 'applied', 'posting_closed', 'responded',
  'interview', 'offer', 'hired', 'rejected', 'archived',
] as const;

export type PipelineStage = typeof PL_STAGES[number];

export const PL_STAGE_LABELS: Record<PipelineStage, string> = {
  saved: 'Saved',
  applied: 'Applied',
  posting_closed: 'Posting Closed',
  responded: 'Responded',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired!',
  rejected: 'Rejected/Ghosted',
  archived: 'Archived',
};

export const PL_STAGE_COLORS: Record<PipelineStage, string> = {
  saved: 'var(--text-dim)',
  applied: 'var(--accent)',
  posting_closed: 'var(--warm)',
  responded: 'var(--green)',
  interview: 'var(--purple)',
  offer: 'var(--green)',
  hired: 'hsl(142,70%,35%)',
  rejected: 'var(--red)',
  archived: 'var(--text-faint)',
};

export interface PipelineMeta {
  stage: PipelineStage;
  title?: string;
  companyName?: string;
  company?: string;
  savedAt?: string;
  appliedAt?: string;
  respondedAt?: string;
  resumeUsed?: string;
  matchScore?: number;
  filterTags?: string[];
  tracking_mode?: 'auto' | 'muted';
  status_note?: string;
  stage_changed_at?: string;
  lastPromptedAt?: string;
  salaryEstimate?: number;
  _dbId?: string;
}

export interface PipelineSignal {
  id: string;
  pipeline_entry_id: string;
  signal_source: 'gmail' | 'calendar' | 'ats_redirect' | 'time_based';
  signal_type: string;
  proposed_stage?: PipelineStage;
  confidence?: number;
  evidence_preview?: string;
  evidence_metadata?: {
    interview_round?: string;
    [key: string]: unknown;
  };
  created_at: string;
  status: string;
}

export interface PipelineJobData {
  greenhouse_id: string;
  title: string;
  company_name: string;
  location?: string;
  loc_display?: string;
  status?: string;
  closed_at?: string;
  first_seen_at?: string;
  content?: string;
  salary_min?: number;
  salary_max?: number;
}

export interface PipelineItem {
  id: string;
  meta: PipelineMeta;
  job: PipelineJobData | null;
  signal?: PipelineSignal | null;
}

export interface GhostEntry {
  pipeline_entry_id: string;
  job_title: string;
  company_name: string;
  company_slug?: string;
  applied_at: string;
  days_since_applied: number;
  listing_status: 'open' | 'closed' | 'removed' | 'unknown';
  ghost_score: number;
  ghost_status: 'active' | 'waiting' | 'likely_ghosted' | 'ghosted';
}

export interface PipelineStats {
  totalTracked: number;
  activeCount: number;
  responseRate: string;
  avgDaysToResponse: string;
}

export interface StageData {
  stage: PipelineStage;
  items: PipelineItem[];
  medianMatch: number | null;
  minMatch: number | null;
  maxMatch: number | null;
  pendingSignalCount: number;
}

// ── State ────────────────────────────────────────────────────

interface PipelineState {
  loading: boolean;
  error: string | null;
  stages: StageData[];
  stats: PipelineStats;
  ghostEntries: GhostEntry[];
  ghostLoading: boolean;
  ghostStats: {
    active: number;
    avgWait: string;
    likelyGhosted: number;
    ghosted: number;
  };
  activeFilter: string;
  collapseStates: Record<string, boolean>;
  view: 'pipeline' | 'ghost';
}

type PipelineAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_STAGES'; payload: { stages: StageData[]; stats: PipelineStats } }
  | { type: 'SET_GHOST'; payload: { entries: GhostEntry[]; stats: PipelineState['ghostStats'] } }
  | { type: 'SET_GHOST_LOADING'; payload: boolean }
  | { type: 'SET_FILTER'; payload: string }
  | { type: 'TOGGLE_COLLAPSE'; payload: string }
  | { type: 'SET_VIEW'; payload: 'pipeline' | 'ghost' };

const initialState: PipelineState = {
  loading: true,
  error: null,
  stages: PL_STAGES.map(stage => ({
    stage,
    items: [],
    medianMatch: null,
    minMatch: null,
    maxMatch: null,
    pendingSignalCount: 0,
  })),
  stats: { totalTracked: 0, activeCount: 0, responseRate: '—', avgDaysToResponse: '—' },
  ghostEntries: [],
  ghostLoading: false,
  ghostStats: { active: 0, avgWait: '—', likelyGhosted: 0, ghosted: 0 },
  activeFilter: 'all',
  collapseStates: {},
  view: 'pipeline',
};

function reducer(state: PipelineState, action: PipelineAction): PipelineState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    case 'SET_STAGES':
      return { ...state, ...action.payload, loading: false, error: null };
    case 'SET_GHOST':
      return { ...state, ghostEntries: action.payload.entries, ghostStats: action.payload.stats, ghostLoading: false };
    case 'SET_GHOST_LOADING':
      return { ...state, ghostLoading: action.payload };
    case 'SET_FILTER':
      return { ...state, activeFilter: action.payload };
    case 'TOGGLE_COLLAPSE':
      return {
        ...state,
        collapseStates: {
          ...state.collapseStates,
          [action.payload]: !state.collapseStates[action.payload],
        },
      };
    case 'SET_VIEW':
      return { ...state, view: action.payload };
    default:
      return state;
  }
}

// ── Legacy bridge helpers ────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function win(): any { return window as any; }

function getSb() { return win().sb || win().BJ?.sb; }
function getUser() { return win().currentUser; }
function getPipelineCache(): Record<string, PipelineMeta> { return win()._pipelineCache || {}; }
function getPendingSignals(): Record<string, PipelineSignal> { return win()._pendingSignals || {}; }
function getSavedFilters(): Array<{ name: string; _filterColor?: string }> {
  try {
    const ls = localStorage.getItem('bj_saved_filters');
    return ls ? JSON.parse(ls) : [];
  } catch { return []; }
}
function getCollapseStates(): Record<string, boolean> {
  try {
    const ls = localStorage.getItem('bj_pl_collapse');
    return ls ? JSON.parse(ls) : {};
  } catch { return {}; }
}

const STALE_RULES: Record<string, { yellow: number; red: number }> = {
  saved: { yellow: 5, red: 7 },
  applied: { yellow: 7, red: 14 },
  posting_closed: { yellow: 3, red: 7 },
  responded: { yellow: 7, red: 14 },
  interview: { yellow: 7, red: 14 },
};

export type StaleDotColor = 'green' | 'yellow' | 'red' | 'blue' | 'gray';

export function computeStaleDot(
  stage: PipelineStage,
  daysInStage: number | null,
  signal: PipelineSignal | null | undefined,
): StaleDotColor {
  const terminalStages: PipelineStage[] = ['offer', 'rejected', 'archived', 'hired'];
  if (terminalStages.includes(stage)) return 'gray';
  if (signal && signal.signal_source !== 'time_based') return 'blue';
  if (signal && signal.signal_source === 'time_based') return 'yellow';
  if (daysInStage == null) return 'green';
  const rule = STALE_RULES[stage];
  if (!rule) return 'green';
  if (daysInStage >= rule.red) return 'red';
  if (daysInStage >= rule.yellow) return 'yellow';
  return 'green';
}

export function relativeTime(isoStr: string | undefined): string {
  if (!isoStr) return '—';
  const ms = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  if (days < 30) return days + 'd ago';
  return Math.floor(days / 30) + 'mo ago';
}

// ── Hook ─────────────────────────────────────────────────────

export interface PipelineActions {
  refresh: () => Promise<void>;
  moveStage: (jobId: string, newStage: PipelineStage) => void;
  confirmSignal: (signalId: string, action: string, correctedStage?: string) => void;
  unsave: (jobId: string) => void;
  setFilter: (tag: string) => void;
  toggleCollapse: (stage: string) => void;
  setView: (view: 'pipeline' | 'ghost') => void;
  loadGhostMonitor: () => Promise<void>;
  setTrackingMode: (jobId: string, mode: string) => void;
  openJobModal: (jobId: string) => void;
}

export function usePipeline(): [PipelineState, PipelineActions] {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    collapseStates: getCollapseStates(),
  });
  const mountedRef = useRef(true);

  // Load pipeline data from legacy cache + Supabase
  const refresh = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      const sb = getSb();
      const user = getUser();
      if (!sb || !user?.id) {
        dispatch({ type: 'SET_ERROR', payload: 'Not authenticated' });
        return;
      }

      // Trigger legacy load if not already loaded
      if (!win()._pipelineLoaded && typeof win().loadPipelineFromSupabase === 'function') {
        await win().loadPipelineFromSupabase();
      }
      if (typeof win().loadPendingSignals === 'function') {
        await win().loadPendingSignals();
      }

      const cache = getPipelineCache();
      const signals = getPendingSignals();
      const allIds = Object.keys(cache);

      if (allIds.length === 0) {
        dispatch({
          type: 'SET_STAGES',
          payload: {
            stages: PL_STAGES.map(stage => ({
              stage, items: [], medianMatch: null, minMatch: null, maxMatch: null, pendingSignalCount: 0,
            })),
            stats: { totalTracked: 0, activeCount: 0, responseRate: '—', avgDaysToResponse: '—' },
          },
        });
        return;
      }

      // Batch-fetch job data from Supabase
      const batchSize = 100;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let allJobData: any[] = [];
      for (let i = 0; i < allIds.length; i += batchSize) {
        const batch = allIds.slice(i, i + batchSize);
        try {
          const { data } = await sb.from('ats_jobs')
            .select('greenhouse_id, title, company_name, location, loc_display, status, closed_at, first_seen_at, content, salary_min, salary_max')
            .in('greenhouse_id', batch);
          if (data) allJobData = allJobData.concat(data);
        } catch (e) {
          console.error('[BJ] Pipeline fetch error:', e);
        }
      }

      const jobMap: Record<string, PipelineJobData> = {};
      allJobData.forEach((j: PipelineJobData) => { jobMap[j.greenhouse_id] = j; });

      // Group by stage
      const _now = Date.now();
      const stageMap: Record<string, PipelineItem[]> = {};
      PL_STAGES.forEach(s => { stageMap[s] = []; });

      let totalTracked = 0;
      let activeCount = 0;
      let respondedCount = 0;
      let totalDaysToResponse = 0;

      for (const [jobId, meta] of Object.entries(cache)) {
        const m = meta as PipelineMeta;
        const stage = m.stage || 'saved';
        if (!stageMap[stage]) continue;

        // Apply filter
        if (state.activeFilter !== 'all' && !(m.filterTags || []).includes(state.activeFilter)) continue;

        const job = jobMap[jobId] || null;
        const dbId = m._dbId;
        const signal = dbId ? signals[dbId] || null : null;

        stageMap[stage].push({ id: jobId, meta: m, job, signal });
        totalTracked++;
        if (['applied', 'responded', 'interview'].includes(stage)) activeCount++;
        if (m.respondedAt && m.appliedAt) {
          respondedCount++;
          totalDaysToResponse += Math.floor((new Date(m.respondedAt).getTime() - new Date(m.appliedAt).getTime()) / 86400000);
        }
      }

      const appliedAndBeyond = (stageMap.applied?.length || 0) +
        (stageMap.posting_closed?.length || 0) +
        (stageMap.responded?.length || 0) +
        (stageMap.interview?.length || 0) +
        (stageMap.offer?.length || 0) +
        (stageMap.rejected?.length || 0);

      const responseRate = appliedAndBeyond > 0
        ? Math.round((respondedCount / appliedAndBeyond) * 100) + '%'
        : '—';
      const avgDays = respondedCount > 0
        ? Math.round(totalDaysToResponse / respondedCount) + 'd'
        : '—';

      const stages: StageData[] = PL_STAGES.map(stage => {
        const items = stageMap[stage] || [];
        const scores = items
          .map(i => i.meta.matchScore)
          .filter((s): s is number => typeof s === 'number')
          .sort((a, b) => a - b);

        return {
          stage,
          items,
          medianMatch: scores.length > 0 ? scores[Math.floor(scores.length / 2)]! : null,
          minMatch: scores.length > 0 ? scores[0]! : null,
          maxMatch: scores.length > 0 ? scores[scores.length - 1]! : null,
          pendingSignalCount: items.filter(i => i.signal).length,
        };
      });

      if (mountedRef.current) {
        dispatch({
          type: 'SET_STAGES',
          payload: {
            stages,
            stats: { totalTracked, activeCount, responseRate, avgDaysToResponse: avgDays },
          },
        });
      }
    } catch (err) {
      if (mountedRef.current) {
        dispatch({ type: 'SET_ERROR', payload: (err as Error).message || 'Failed to load pipeline' });
      }
    }
  }, [state.activeFilter]);

  // Load ghost monitor data
  const loadGhostMonitor = useCallback(async () => {
    dispatch({ type: 'SET_GHOST_LOADING', payload: true });
    try {
      const sb = getSb();
      const user = getUser();
      if (!sb || !user?.id) return;

      const { data, error } = await sb.rpc('get_pipeline_ghost_status', { p_user_id: user.id });
      if (error) throw error;

      const entries: GhostEntry[] = (data || []).sort(
        (a: GhostEntry, b: GhostEntry) => (b.ghost_score || 0) - (a.ghost_score || 0)
      );

      const totalDays = entries.reduce((sum, e) => sum + (e.days_since_applied || 0), 0);
      const stats = {
        active: entries.length,
        avgWait: entries.length > 0 ? Math.round(totalDays / entries.length) + 'd' : '—',
        likelyGhosted: entries.filter(e => e.ghost_status === 'likely_ghosted').length,
        ghosted: entries.filter(e => e.ghost_status === 'ghosted').length,
      };

      if (mountedRef.current) {
        dispatch({ type: 'SET_GHOST', payload: { entries, stats } });
      }
    } catch (err) {
      console.error('[BJ] Ghost monitor error:', err);
      if (mountedRef.current) {
        dispatch({ type: 'SET_GHOST_LOADING', payload: false });
      }
    }
  }, []);

  // Bridge actions to legacy functions
  const moveStage = useCallback((jobId: string, newStage: PipelineStage) => {
    if (typeof win().movePipelineStage === 'function') {
      win().movePipelineStage(jobId, newStage);
    }
    // Re-read cache after a short delay
    setTimeout(() => refresh(), 200);
  }, [refresh]);

  const confirmSignal = useCallback((signalId: string, action: string, correctedStage?: string) => {
    if (typeof win().confirmPipelineSignal === 'function') {
      win().confirmPipelineSignal(signalId, action, correctedStage);
    }
    setTimeout(() => refresh(), 300);
  }, [refresh]);

  const unsave = useCallback((jobId: string) => {
    if (typeof win().unsaveFromPipeline === 'function') {
      win().unsaveFromPipeline(jobId);
    }
    setTimeout(() => refresh(), 200);
  }, [refresh]);

  const setTrackingMode = useCallback((jobId: string, mode: string) => {
    if (typeof win().setTrackingMode === 'function') {
      win().setTrackingMode(jobId, mode);
    }
    setTimeout(() => refresh(), 200);
  }, [refresh]);

  const openJobModal = useCallback((jobId: string) => {
    if (typeof win().openJobModal === 'function') {
      win().openJobModal(jobId);
    }
  }, []);

  const setFilter = useCallback((tag: string) => {
    dispatch({ type: 'SET_FILTER', payload: tag });
  }, []);

  const toggleCollapse = useCallback((stage: string) => {
    dispatch({ type: 'TOGGLE_COLLAPSE', payload: stage });
    // Persist to localStorage
    try {
      const current = getCollapseStates();
      current[stage] = !current[stage];
      localStorage.setItem('bj_pl_collapse', JSON.stringify(current));
    } catch { /* noop */ }
  }, []);

  const setView = useCallback((view: 'pipeline' | 'ghost') => {
    dispatch({ type: 'SET_VIEW', payload: view });
    if (view === 'ghost') loadGhostMonitor();
  }, [loadGhostMonitor]);

  // Initial load
  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => { mountedRef.current = false; };
  }, []);

  // Re-fetch when filter changes
  useEffect(() => {
    if (!state.loading) refresh();
  }, [state.activeFilter]);

  const actions: PipelineActions = useMemo(() => ({
    refresh,
    moveStage,
    confirmSignal,
    unsave,
    setFilter,
    toggleCollapse,
    setView,
    loadGhostMonitor,
    setTrackingMode,
    openJobModal,
  }), [refresh, moveStage, confirmSignal, unsave, setFilter, toggleCollapse, setView, loadGhostMonitor, setTrackingMode, openJobModal]);

  return [state, actions];
}
