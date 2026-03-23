// ============================================================
// useFeedSearch — Feed Search Hook (REWRITTEN v12.07)
// ============================================================
// All filtering, sorting, pagination handled server-side by
// the search_jobs Postgres RPC. No localStorage. No client-side
// filter building. No duplicated logic.
//
// Data flow:
//   checkedFilterIds (from getActiveFilters) + page + sort
//     -> search_jobs RPC
//     -> FeedSearchState
//
// FEED_SPEC.md Section 4 — this hook is the client side of that contract.
// ============================================================

import { useState, useCallback, useRef } from 'react';
import { supabase as _sb, getUser } from '@lib/supabase';

// ── Re-exported types consumed by FeedPage, JobTable ─────

export interface FilterPill {
  type: string;
  values: string[];
  min?: string;
  max?: string;
}

export interface SavedFilter {
  id: string;
  name: string;
  color: string;
  checked: boolean;
  whatPills: FilterPill[];
  whatNotPills: FilterPill[];
  wherePills: FilterPill[];
  whereNotPills: FilterPill[];
  whoPills: FilterPill[];
  whoNotPills: FilterPill[];
  whenPills: FilterPill[];
  payPills: FilterPill[];
  jdPills: FilterPill[];
  levelPills: FilterPill[];
  typePills: FilterPill[];
  scorePills: FilterPill[];
  skillsPills?: FilterPill[];
  deptPills?: FilterPill[];
  pills?: FilterPill[];
  includeRemote: boolean;
  includeNoSalary: boolean;
  levelHierarchy?: LevelEntry[];
  _filterNum?: string;
  _filterColor?: string;
  _locationIds?: string[] | null;
}

export interface LevelEntry {
  label: string;
  rank: number;
  color: string;
  keywords: string[];
}

export interface SortEntry {
  field: string;
  asc: boolean;
}

export type TrustLabel = 'safe' | 'caution' | 'suspicious' | 'unknown';
export type AiLabel = 'human' | 'mixed' | 'ai_generated' | 'unscored';

export interface FeedJob {
  greenhouse_id: string;
  title: string;
  company_name: string;
  location: string;
  loc_country: string | null;
  loc_state: string | null;
  loc_city: string | null;
  loc_type?: string | null;
  is_remote: boolean | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_rate: string | null;
  first_seen_at: string | null;
  updated_at?: string | null;
  created_at: string;
  url?: string | null;
  apply_url: string | null;
  ats_source: string | null;
  status?: string;
  extracted_seniority: string | null;
  extracted_skills: string[] | null;
  is_staffing_agency: boolean | null;
  content?: string | null;
  ai_label: string | null;
  ai_content_score: number | null;
  _filterNums?: Array<{ num: string; color: string }>;
}

export interface FeedStats {
  total: number;
  companies: number;
  newToday: number;
  newSinceLogin: number;
  pipeline: number;
}

export interface FeedSearchState {
  jobs: FeedJob[];
  total: number;
  page: number;
  loading: boolean;
  error: string | null;
  stats: FeedStats;
  sortStack: SortEntry[];
  trustFilters: Set<TrustLabel>;
  aiFilters: Set<AiLabel>;
  searchMode: 'filters' | 'chat' | 'guided';
}

export interface FeedSearchActions {
  search: (page?: number) => Promise<void>;
  toggleSort: (field: string) => void;
  removeSort: (field: string) => void;
  setTrustFilters: (labels: Set<TrustLabel>) => void;
  setAiFilters: (labels: Set<AiLabel>) => void;
  setSearchMode: (mode: 'filters' | 'chat' | 'guided') => void;
  setStats: (stats: FeedStats) => void;
  setPage: (page: number) => void;
  saveJob: (jobId: string, job?: { title?: string | null; company_name?: string | null; apply_url?: string | null; url?: string | null; ats_source?: string | null }) => Promise<void>;
  unsaveJob: (jobId: string) => Promise<void>;
  hideJob: (jobId: string) => Promise<void>;
  markApplied: (jobId: string) => Promise<void>;
}

// ── Error ─────────────────────────────────────────────────

class ProviderError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

// ── Constants ─────────────────────────────────────────────

const ALL_TRUST = new Set<TrustLabel>(['safe', 'caution', 'suspicious', 'unknown']);
const ALL_AI = new Set<AiLabel>(['human', 'mixed', 'ai_generated', 'unscored']);
const JOBS_PER_PAGE = 50;

const SORT_FIELD_MAP: Record<string, string> = {
  days: 'created_at',
  company: 'company_name',
  salary: 'salary_max',
  title: 'title',
  location: 'location',
  created_at: 'created_at',
  updated_at: 'created_at',
  company_name: 'company_name',
  salary_max: 'salary_max',
};

// ── Module-level result cache — survives navigation ───────

let _cachedJobs: FeedJob[] = [];
let _cachedTotal = 0;

// ── Hook ──────────────────────────────────────────────────

export function useFeedSearch(getActiveFilters?: () => SavedFilter[]): [FeedSearchState, FeedSearchActions] {
  const [state, setState] = useState<FeedSearchState>({
    jobs: _cachedJobs,
    total: _cachedTotal,
    page: 0,
    loading: _cachedJobs.length === 0,
    error: null,
    stats: { total: 0, companies: 0, newToday: 0, newSinceLogin: 0, pipeline: 0 },
    sortStack: [{ field: 'created_at', asc: false }],
    trustFilters: new Set(ALL_TRUST),
    aiFilters: new Set(ALL_AI),
    searchMode: 'filters',
  });

  const abortRef = useRef<AbortController | null>(null);
  const sortStackRef = useRef(state.sortStack);
  sortStackRef.current = state.sortStack;

  // ── Core search ───────────────────────────────────────────
  const search = useCallback(async (page = 0) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState(prev => ({ ...prev, loading: true, error: null, page }));

    try {
      // Auth — try session first, fall back to network call
      const user = await getUser();
      const resolvedUser = user ?? (await _sb.auth.getUser()).data?.user;
      if (!resolvedUser) {
        setState(prev => ({ ...prev, loading: false, jobs: [], total: 0 }));
        return;
      }

      if (controller.signal.aborted) return;

      // Get active filter IDs
      const activeFilters = getActiveFilters ? getActiveFilters() : [];
      const checked = activeFilters.filter(f => f.checked);

      // No filters — empty state per FEED_SPEC
      if (checked.length === 0) {
        _cachedJobs = [];
        _cachedTotal = 0;
        setState(prev => ({ ...prev, jobs: [], total: 0, page: 0, loading: false, error: null }));
        return;
      }

      // Resolve sort
      const primarySort = sortStackRef.current[0] ?? { field: 'created_at', asc: false };
      const sortField = SORT_FIELD_MAP[primarySort.field] ?? 'created_at';

      // Call search_jobs RPC
      const { data, error } = await _sb.rpc('search_jobs', {
        p_user_id: resolvedUser.id,
        p_filter_ids: checked.map(f => f.id),
        p_page: page,
        p_page_size: JOBS_PER_PAGE,
        p_sort_field: sortField,
        p_sort_asc: primarySort.asc,
      });

      if (controller.signal.aborted) return;
      if (error) throw new ProviderError(error.message, 'SEARCH_FAILED');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (data || []) as any[];
      const totalCount: number = rows[0]?.total_count ?? 0;

      // Build filter color map for border display
      const colorMap = new Map(
        checked.map((f, i) => [f.id, { num: f._filterNum ?? String(i + 1), color: f._filterColor ?? '' }])
      );

      const jobs: FeedJob[] = rows.map(row => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { total_count, matched_filter_ids, ...rest } = row;
        return {
          ...rest,
          _filterNums: ((matched_filter_ids as string[]) || [])
            .map(id => colorMap.get(id))
            .filter(Boolean) as Array<{ num: string; color: string }>,
        };
      });

      _cachedJobs = jobs;
      _cachedTotal = totalCount;

      setState(prev => ({
        ...prev,
        jobs,
        total: totalCount,
        page,
        loading: false,
        error: null,
        stats: {
          ...prev.stats,
          total: totalCount,
          companies: new Set(jobs.map(j => j.company_name)).size,
        },
      }));

    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const msg = err instanceof Error ? err.message : 'Search failed';
      console.error('[useFeedSearch]', err);
      setState(prev => ({ ...prev, loading: false, error: msg }));
    }
  }, []); // stable — reads state via refs, not closure

  // ── Sort ──────────────────────────────────────────────────
  const toggleSort = useCallback((field: string) => {
    setState(prev => {
      const existing = prev.sortStack.find(s => s.field === field);
      let next: SortEntry[];
      if (existing) {
        next = existing.asc
          ? prev.sortStack.filter(s => s.field !== field)
          : prev.sortStack.map(s => s.field === field ? { ...s, asc: true } : s);
      } else {
        next = [{ field, asc: false }];
      }
      if (next.length === 0) next = [{ field: 'created_at', asc: false }];
      return { ...prev, sortStack: next };
    });
  }, []);

  const removeSort = useCallback((field: string) => {
    setState(prev => {
      const next = prev.sortStack.filter(s => s.field !== field);
      return { ...prev, sortStack: next.length > 0 ? next : [{ field: 'created_at', asc: false }] };
    });
  }, []);

  // ── Misc actions ──────────────────────────────────────────
  const setTrustFilters = useCallback((labels: Set<TrustLabel>) => setState(prev => ({ ...prev, trustFilters: labels })), []);
  const setAiFilters = useCallback((labels: Set<AiLabel>) => setState(prev => ({ ...prev, aiFilters: labels })), []);
  const setSearchMode = useCallback((mode: 'filters' | 'chat' | 'guided') => setState(prev => ({ ...prev, searchMode: mode })), []);
  const setStats = useCallback((stats: FeedStats) => setState(prev => ({ ...prev, stats })), []);
  const setPage = useCallback((page: number) => { search(page); }, [search]);

  // ── Job write actions ─────────────────────────────────────
  const saveJob = useCallback(async (
    jobId: string,
    job?: { title?: string | null; company_name?: string | null; apply_url?: string | null; url?: string | null; ats_source?: string | null }
  ) => {
    const u = await getUser() ?? (await _sb.auth.getUser()).data?.user;
    if (!u) throw new ProviderError('Not authenticated', 'AUTH_REQUIRED');
    const { error } = await _sb.from('user_pipeline').upsert({
      user_id: u.id,
      job_id: jobId,
      stage: 'saved',
      ats_source: job?.ats_source ?? 'greenhouse',
      job_title: job?.title ?? null,
      company_name: job?.company_name ?? null,
      company_slug: job?.company_name
        ? job.company_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        : 'unknown',
      job_url: job?.apply_url ?? job?.url ?? null,
    }, { onConflict: 'user_id,job_id' });
    if (error) throw new ProviderError(error.message, 'SAVE_FAILED');
    setState(prev => ({ ...prev, stats: { ...prev.stats, pipeline: prev.stats.pipeline + 1 } }));
  }, []);

  const unsaveJob = useCallback(async (jobId: string) => {
    const u = await getUser();
    if (!u) throw new ProviderError('Not authenticated', 'AUTH_REQUIRED');
    await _sb.from('user_pipeline').delete().eq('user_id', u.id).eq('job_id', jobId);
    setState(prev => ({ ...prev, stats: { ...prev.stats, pipeline: Math.max(0, prev.stats.pipeline - 1) } }));
  }, []);

  const hideJob = useCallback(async (jobId: string) => {
    const u = await getUser() ?? (await _sb.auth.getUser()).data?.user;
    if (!u) throw new ProviderError('Not authenticated', 'AUTH_REQUIRED');
    await _sb.from('hidden_jobs').upsert({ user_id: u.id, job_id: jobId }, { onConflict: 'user_id,job_id' });
    setState(prev => ({ ...prev, jobs: prev.jobs.filter(j => j.greenhouse_id !== jobId), total: Math.max(0, prev.total - 1) }));
    _cachedJobs = _cachedJobs.filter(j => j.greenhouse_id !== jobId);
  }, []);

  const markApplied = useCallback(async (jobId: string) => {
    const u = await getUser();
    if (!u) throw new ProviderError('Not authenticated', 'AUTH_REQUIRED');
    await _sb.from('user_pipeline').upsert({
      user_id: u.id,
      job_id: jobId,
      stage: 'applied',
      applied_at: new Date().toISOString(),
    }, { onConflict: 'user_id,job_id' });
  }, []);

  return [state, { search, toggleSort, removeSort, setTrustFilters, setAiFilters, setSearchMode, setStats, setPage, saveJob, unsaveJob, hideJob, markApplied }];
}

export default useFeedSearch;
