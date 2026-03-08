// ============================================================
// useFeedSearch — Feed Page Data Hook (SA-014)
// ============================================================
// Encapsulates the complex multi-filter search, merge, sort,
// and pagination logic from legacy job-feed.js.
//
// Bridge pattern: Uses window.BJ.supabase during migration.
// Post-migration: refactor to direct ES module imports.
//
// Data flow:
//   SavedFilters/Builder → buildFilterQuery → Supabase FTS
//   → merge/dedup → client-sort (level, match, relevance)
//   → trust/AI post-filter → paginate → render
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Job } from '@providers/types';
import { ProviderError } from '@providers/types';

// ── Types ─────────────────────────────────────────────────

export interface FilterPill {
  values: string[];
  op?: 'ilike' | 'eq' | 'fts';
  lat?: number;
  lng?: number;
  radius_mi?: number;
  locType?: 'state' | 'remote' | 'text';
  stateCode?: string;
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

export interface FeedJob extends Job {
  greenhouse_id: string;
  first_seen_at: string | null;
  updated_at: string;
  company_name: string;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  apply_url: string | null;
  loc_display: string | null;
  extracted_skills: string[] | null;
  career_level: string | null;
  _filterNums: Array<{ num: string; color: string }>;
  _relevanceScore?: number;
  _aiScoringExcluded?: boolean;
  _fraudBadgeTracked?: boolean;
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
  searchMode: 'filters' | 'chat';
}

export interface FeedSearchActions {
  search: (page?: number) => Promise<void>;
  setPage: (page: number) => void;
  toggleSort: (field: string) => void;
  removeSort: (field: string) => void;
  setTrustFilters: (labels: Set<TrustLabel>) => void;
  setAiFilters: (labels: Set<AiLabel>) => void;
  setSearchMode: (mode: 'filters' | 'chat') => void;
  saveJob: (jobId: string) => Promise<void>;
  unsaveJob: (jobId: string) => Promise<void>;
  hideJob: (jobId: string) => Promise<void>;
  markApplied: (jobId: string) => Promise<void>;
}

const JOBS_PER_PAGE = 50;
const MAX_FEED_ROWS = 500;

const ALL_TRUST: Set<TrustLabel> = new Set(['safe', 'caution', 'suspicious', 'unknown']);
const ALL_AI: Set<AiLabel> = new Set(['human', 'mixed', 'ai_generated', 'unscored']);

// ── Helper: get Supabase client from legacy bridge ────────

function getSupabase() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bj = (window as any).BJ;
  if (!bj?.supabase) {
    throw new ProviderError('Supabase client not initialized', 'SUPABASE_NOT_READY');
  }
  return bj.supabase;
}

// ── Helper: read from legacy localStorage safely ──────────

function safeReadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// ── Helper: get legacy global arrays ──────────────────────

function getLegacySavedJobIds(): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).savedJobIds || [];
}

function getLegacyAppliedJobIds(): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).appliedJobIds || [];
}

function getLegacyHiddenJobIds(): Array<{ id: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).hiddenJobIds || [];
}

function getLegacyMatchScores(): Record<string, number | { score: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).jobMatchScores || {};
}

function getLegacyFraudCache(): Record<string, { label: TrustLabel; score: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any)._fraudScoreCache || {};
}

function getLegacyAiJdCache(): Record<string, { label: AiLabel; ai_probability: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any)._aiJdCache || {};
}

// ── Helper: normalize "when" filter values ────────────────

function parseWhenValue(raw: string): Date | null {
  const v = raw.trim().toLowerCase();
  const now = new Date();
  if (v === 'today') return new Date(now.setHours(0, 0, 0, 0));
  const match = v.match(/^(\d+)\s*(d|day|days|w|week|weeks|m|month|months)$/);
  if (!match) return null;
  const n = parseInt(match[1]!, 10);
  const unit = match[2]![0];
  const d = new Date();
  if (unit === 'd') d.setDate(d.getDate() - n);
  else if (unit === 'w') d.setDate(d.getDate() - n * 7);
  else if (unit === 'm') d.setMonth(d.getMonth() - n);
  return d;
}

// ── Helper: build Supabase filter query from a saved filter ─

function buildFilterQuery(
  sf: SavedFilter,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  baseQuery: any,
  locationIds: string[] | null,
  tuning: Record<string, unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  let query = baseQuery;

  // What pills (title/keyword search)
  const whatPills = sf.whatPills || [];
  for (const pill of whatPills) {
    for (const v of pill.values) {
      if (v.trim()) {
        query = query.ilike('title', `%${v.trim()}%`);
      }
    }
  }

  // What NOT pills
  const whatNotPills = sf.whatNotPills || [];
  for (const pill of whatNotPills) {
    for (const v of pill.values) {
      if (v.trim()) {
        query = query.not('title', 'ilike', `%${v.trim()}%`);
      }
    }
  }

  // Apply tuning title exclusions
  const titleExcludes = (tuning.titleExcludes as FilterPill[]) || [];
  for (const pill of titleExcludes) {
    for (const v of pill.values) {
      if (v.trim()) {
        query = query.not('title', 'ilike', `%${v.trim()}%`);
      }
    }
  }

  // Where pills (location) — if we have pre-fetched IDs, use them
  if (locationIds && locationIds.length > 0) {
    query = query.in('greenhouse_id', locationIds);
  } else {
    const wherePills = sf.wherePills || [];
    for (const pill of wherePills) {
      if (pill.locType === 'remote') continue;
      for (const v of pill.values) {
        if (v.trim()) {
          query = query.ilike('location', `%${v.trim()}%`);
        }
      }
    }
  }

  // Where NOT pills
  const whereNotPills = sf.whereNotPills || [];
  for (const pill of whereNotPills) {
    for (const v of pill.values) {
      if (v.trim()) {
        query = query.not('location', 'ilike', `%${v.trim()}%`);
      }
    }
  }

  // Apply tuning location exclusions
  const locExcludes = (tuning.locationExcludes as FilterPill[]) || [];
  for (const pill of locExcludes) {
    for (const v of pill.values) {
      if (v.trim()) {
        query = query.not('location', 'ilike', `%${v.trim()}%`);
      }
    }
  }

  // US-only toggle
  if (tuning.usOnly) {
    query = query.or('location.ilike.%United States%,location.ilike.%USA%,location.ilike.%Remote%');
  }

  // Who pills (company)
  const whoPills = sf.whoPills || [];
  for (const pill of whoPills) {
    for (const v of pill.values) {
      if (v.trim()) {
        query = query.ilike('company_name', `%${v.trim()}%`);
      }
    }
  }

  // Who NOT pills
  const whoNotPills = sf.whoNotPills || [];
  for (const pill of whoNotPills) {
    for (const v of pill.values) {
      if (v.trim()) {
        query = query.not('company_name', 'ilike', `%${v.trim()}%`);
      }
    }
  }

  // Apply tuning company exclusions
  const companyExcludes = (tuning.companyExcludes as FilterPill[]) || [];
  for (const pill of companyExcludes) {
    for (const v of pill.values) {
      if (v.trim()) {
        query = query.not('company_name', 'ilike', `%${v.trim()}%`);
      }
    }
  }

  // When pills (time filter)
  const whenPills = sf.whenPills || [];
  for (const pill of whenPills) {
    for (const v of pill.values) {
      const since = parseWhenValue(v);
      if (since) {
        query = query.gte('first_seen_at', since.toISOString());
      }
    }
  }

  // Pay range
  const payPills = sf.payPills || [];
  for (const pill of payPills) {
    if (pill.values.length >= 1 && pill.values[0]) {
      const min = parseInt(pill.values[0].replace(/[^0-9]/g, ''), 10);
      if (!isNaN(min)) query = query.gte('salary_max', min);
    }
    if (pill.values.length >= 2 && pill.values[1]) {
      const max = parseInt(pill.values[1].replace(/[^0-9]/g, ''), 10);
      if (!isNaN(max)) query = query.lte('salary_min', max);
    }
  }

  // Include no salary option
  if (!sf.includeNoSalary) {
    query = query.not('salary_max', 'is', null);
  }

  // JD contains (full-text search on description)
  const jdPills = sf.jdPills || [];
  for (const pill of jdPills) {
    for (const v of pill.values) {
      if (v.trim()) {
        query = query.textSearch('fts', v.trim(), { type: 'websearch' });
      }
    }
  }

  // Level filter
  const levelPills = sf.levelPills || [];
  if (levelPills.length > 0) {
    const levels = levelPills.flatMap(p => p.values).filter(Boolean);
    if (levels.length > 0) {
      query = query.in('career_level', levels);
    }
  }

  // Type filter
  const typePills = sf.typePills || [];
  if (typePills.length > 0) {
    const types = typePills.flatMap(p => p.values).filter(Boolean);
    if (types.length > 0) {
      query = query.in('source', types);
    }
  }

  return query;
}

// ── Hook ──────────────────────────────────────────────────

export function useFeedSearch(): [FeedSearchState, FeedSearchActions] {
  const [state, setState] = useState<FeedSearchState>({
    jobs: [],
    total: 0,
    page: 0,
    loading: false,
    error: null,
    stats: { total: 0, companies: 0, newToday: 0, newSinceLogin: 0, pipeline: 0 },
    sortStack: [{ field: 'updated_at', asc: false }],
    trustFilters: new Set(ALL_TRUST),
    aiFilters: new Set(ALL_AI),
    searchMode: 'filters',
  });

  const abortRef = useRef<AbortController | null>(null);

  // ── Core search function ────────────────────────────────

  const search = useCallback(async (page = 0) => {
    // Cancel any in-flight search
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState(prev => ({ ...prev, loading: true, error: null, page }));

    try {
      const sb = getSupabase();
      const tuning = safeReadLS('bj_tuning', {});
      const hiddenIds = getLegacyHiddenJobIds().map(h => h.id);

      // Get active filters from legacy saved filters
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const legacySavedFilters: SavedFilter[] = (window as any).savedFilters || [];
      const checkedFilters = legacySavedFilters.filter(f => f.checked);

      if (checkedFilters.length === 0) {
        setState(prev => ({
          ...prev,
          jobs: [],
          total: 0,
          loading: false,
          error: null,
        }));
        return;
      }

      if (controller.signal.aborted) return;

      let allJobs: FeedJob[] = [];
      let totalCount = 0;

      if (checkedFilters.length === 1) {
        // Single filter path
        const sf = checkedFilters[0]!;
        let query = sb.from('ats_jobs').select('*', { count: 'planned' });
        query = buildFilterQuery(sf, query, sf._locationIds || null, tuning);

        if (hiddenIds.length > 0) {
          query = query.not('greenhouse_id', 'in', `(${hiddenIds.join(',')})`);
        }

        // Apply sort stack (skip client-only sorts)
        for (const s of state.sortStack) {
          if (['level', 'match', 'relevance'].includes(s.field)) continue;
          query = query.order(s.field, { ascending: s.asc });
        }

        const from = page * JOBS_PER_PAGE;
        if (from >= MAX_FEED_ROWS) {
          setState(prev => ({ ...prev, jobs: [], total: 0, loading: false }));
          return;
        }
        const to = Math.min(from + JOBS_PER_PAGE - 1, MAX_FEED_ROWS - 1);
        query = query.range(from, to);

        const { data, error, count } = await query;
        if (controller.signal.aborted) return;
        if (error) throw new ProviderError(error.message, 'SEARCH_FAILED', undefined, error);

        allJobs = (data || []).map((j: FeedJob) => ({
          ...j,
          _filterNums: [{ num: sf._filterNum || '', color: sf._filterColor || '' }],
        }));
        totalCount = count || 0;
      } else {
        // Multi-filter path: parallel queries, merge, dedup
        const perFilter = Math.min(Math.ceil(MAX_FEED_ROWS / checkedFilters.length), 250);
        const seenIds = new Set<string>();
        const jobFilterMap = new Map<string, Array<{ num: string; color: string }>>();

        const promises = checkedFilters.map(sf => {
          let q = sb.from('ats_jobs').select('*', { count: 'planned' });
          q = buildFilterQuery(sf, q, sf._locationIds || null, tuning);
          if (hiddenIds.length > 0) {
            q = q.not('greenhouse_id', 'in', `(${hiddenIds.join(',')})`);
          }
          for (const s of state.sortStack) {
            if (['level', 'match', 'relevance'].includes(s.field)) continue;
            q = q.order(s.field, { ascending: s.asc });
          }
          q = q.range(0, perFilter - 1);
          return q;
        });

        const results = await Promise.all(promises);
        if (controller.signal.aborted) return;

        for (let i = 0; i < results.length; i++) {
          const r = results[i]!;
          if (r.error) throw new ProviderError(r.error.message, 'SEARCH_FAILED', undefined, r.error);
          totalCount += r.count || 0;
          const fm = { num: checkedFilters[i]!._filterNum || '', color: checkedFilters[i]!._filterColor || '' };
          for (const job of (r.data || [])) {
            const existing = jobFilterMap.get(job.greenhouse_id);
            if (existing) {
              existing.push(fm);
            } else {
              jobFilterMap.set(job.greenhouse_id, [fm]);
            }
            if (!seenIds.has(job.greenhouse_id)) {
              seenIds.add(job.greenhouse_id);
              allJobs.push(job as FeedJob);
            }
          }
        }

        // Attach filter tags
        allJobs.forEach(j => {
          j._filterNums = jobFilterMap.get(j.greenhouse_id) || [];
        });

        // Client-side sort merged results
        allJobs.sort((a, b) => {
          for (const s of state.sortStack) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const va = (a as any)[s.field] || '';
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const vb = (b as any)[s.field] || '';
            const cmp = va < vb ? -1 : va > vb ? 1 : 0;
            if (cmp !== 0) return s.asc ? cmp : -cmp;
          }
          return 0;
        });

        // Client-side paginate
        const from = page * JOBS_PER_PAGE;
        allJobs = allJobs.slice(from, from + JOBS_PER_PAGE);
      }

      if (controller.signal.aborted) return;

      // Apply trust filter
      const trustActive = state.trustFilters.size < ALL_TRUST.size;
      if (trustActive) {
        const cache = getLegacyFraudCache();
        allJobs = allJobs.filter(j => {
          const info = cache[j.greenhouse_id];
          const label: TrustLabel = info?.label || 'unknown';
          return state.trustFilters.has(label);
        });
      }

      // Apply AI content filter
      const aiActive = state.aiFilters.size < ALL_AI.size;
      if (aiActive) {
        const cache = getLegacyAiJdCache();
        allJobs = allJobs.filter(j => {
          const info = cache[j.greenhouse_id];
          const label: AiLabel = info?.label || 'unscored';
          return state.aiFilters.has(label);
        });
      }

      // Update stats
      const now = new Date();
      const last24h = new Date(now.getTime() - 86400000);
      const newToday = allJobs.filter(j =>
        j.first_seen_at && new Date(j.first_seen_at) >= last24h
      ).length;

      const uniqueCompanies = new Set(allJobs.map(j => j.company_name)).size;
      const savedIds = getLegacySavedJobIds();

      setState(prev => ({
        ...prev,
        jobs: allJobs,
        total: totalCount,
        page,
        loading: false,
        error: null,
        stats: {
          total: allJobs.length,
          companies: uniqueCompanies,
          newToday,
          newSinceLogin: newToday,
          pipeline: savedIds.length,
        },
      }));

      // Update last feed view timestamp
      localStorage.setItem('bj_last_feed_view', new Date().toISOString());

    } catch (e) {
      if (controller.signal.aborted) return;
      const message = e instanceof Error ? e.message : 'Search failed';
      setState(prev => ({ ...prev, loading: false, error: message }));
    }
  }, [state.sortStack, state.trustFilters, state.aiFilters]);

  // ── Sort actions ────────────────────────────────────────

  const toggleSort = useCallback((field: string) => {
    setState(prev => {
      const existing = prev.sortStack.find(s => s.field === field);
      let newStack: SortEntry[];
      if (existing) {
        // Toggle direction or remove
        if (!existing.asc) {
          newStack = prev.sortStack.map(s =>
            s.field === field ? { ...s, asc: true } : s
          );
        } else {
          newStack = prev.sortStack.filter(s => s.field !== field);
        }
      } else {
        newStack = [...prev.sortStack, { field, asc: false }];
      }
      // Always have at least one sort
      if (newStack.length === 0) {
        newStack = [{ field: 'updated_at', asc: false }];
      }
      return { ...prev, sortStack: newStack };
    });
  }, []);

  const removeSort = useCallback((field: string) => {
    setState(prev => {
      const newStack = prev.sortStack.filter(s => s.field !== field);
      return {
        ...prev,
        sortStack: newStack.length > 0 ? newStack : [{ field: 'updated_at', asc: false }],
      };
    });
  }, []);

  // ── Filter actions ──────────────────────────────────────

  const setTrustFilters = useCallback((labels: Set<TrustLabel>) => {
    setState(prev => ({ ...prev, trustFilters: labels }));
  }, []);

  const setAiFilters = useCallback((labels: Set<AiLabel>) => {
    setState(prev => ({ ...prev, aiFilters: labels }));
  }, []);

  const setSearchMode = useCallback((mode: 'filters' | 'chat') => {
    setState(prev => ({ ...prev, searchMode: mode }));
  }, []);

  const setPage = useCallback((page: number) => {
    search(page);
  }, [search]);

  // ── Job actions (bridge to legacy) ──────────────────────

  const saveJob = useCallback(async (jobId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bj = (window as any).BJ;
    if (typeof bj?.toggleSaveJob === 'function') {
      await bj.toggleSaveJob(jobId);
    } else {
      // Direct Supabase call
      const sb = getSupabase();
      const { error } = await sb.from('saved_jobs').insert({ greenhouse_id: jobId });
      if (error) throw new ProviderError(error.message, 'SAVE_FAILED');
    }
    setState(prev => ({
      ...prev,
      stats: { ...prev.stats, pipeline: prev.stats.pipeline + 1 },
    }));
  }, []);

  const unsaveJob = useCallback(async (jobId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bj = (window as any).BJ;
    if (typeof bj?.toggleSaveJob === 'function') {
      await bj.toggleSaveJob(jobId);
    }
    setState(prev => ({
      ...prev,
      stats: { ...prev.stats, pipeline: Math.max(0, prev.stats.pipeline - 1) },
    }));
  }, []);

  const hideJob = useCallback(async (jobId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bj = (window as any).BJ;
    if (typeof bj?.hideJob === 'function') {
      bj.hideJob(jobId);
    }
    setState(prev => ({
      ...prev,
      jobs: prev.jobs.filter(j => j.greenhouse_id !== jobId),
      total: prev.total - 1,
      stats: { ...prev.stats, total: prev.stats.total - 1 },
    }));
  }, []);

  const markApplied = useCallback(async (jobId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bj = (window as any).BJ;
    if (typeof bj?.markJobApplied === 'function') {
      await bj.markJobApplied(jobId);
    }
  }, []);

  // ── Cleanup on unmount ──────────────────────────────────

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return [
    state,
    {
      search,
      setPage,
      toggleSort,
      removeSort,
      setTrustFilters,
      setAiFilters,
      setSearchMode,
      saveJob,
      unsaveJob,
      hideJob,
      markApplied,
    },
  ];
}

export default useFeedSearch;
