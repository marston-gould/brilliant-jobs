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
import { buildUSOnlyQuery } from './us-filter';

// ── Types ─────────────────────────────────────────────────

export interface FilterPill {
  values: string[];
  op?: 'ilike' | 'eq' | 'fts';
  lat?: number;
  lng?: number;
  radius_mi?: number;
  locType?: 'state' | 'remote' | 'text';
  stateCode?: string;
  min?: number;  // FA-007: Pay pill min (legacy parity)
  max?: number;  // FA-007: Pay pill max (legacy parity)
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
  skillsPills?: FilterPill[];    // FA-007: Skills filter (legacy parity)
  deptPills?: FilterPill[];      // FA-007: Department filter (legacy parity)
  pills?: FilterPill[];          // FA-007: Legacy whatPills fallback
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
// FA-004: MAX_FEED_ROWS cap removed — real server-side pagination

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

// ── Helper: check feature flags from legacy bridge ──────────

async function isFeatureFlagEnabled(key: string, fallback: boolean): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = (window as any).isFeatureEnabled;
  if (typeof fn !== 'function') return fallback;
  try { return await fn(key, fallback); } catch { return fallback; }
}

// ── FA-005: Serialize filter for server-side merge RPC ──────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeFilterForRPC(sf: SavedFilter, tuning: Record<string, any>): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};

  // WHAT
  const w = sf.whatPills || sf.pills || [];
  const whatVals = w.flatMap(p => p.values.map(v => v.replace(/[,()]/g, '').trim())).filter(Boolean);
  if (whatVals.length > 0) filter.what = whatVals;

  // WHAT NOT
  const wnot = sf.whatNotPills || [];
  const whatNotVals = wnot.flatMap(p => p.values.map(v => v.trim().replace(/^nor\s+/i, ''))).filter(Boolean);
  if (whatNotVals.length > 0) filter.what_not = whatNotVals;

  // Global title excludes
  const titleExcl = ((tuning.titleExcludes as FilterPill[]) || []).flatMap(p => p.values.map(v => v.trim())).filter(Boolean);
  if (titleExcl.length > 0) filter.title_excludes = titleExcl;

  // WHERE — location IDs come pre-attached to the filter
  const locationIds = sf._locationIds || null;
  if (locationIds === null) {
    const wh = sf.wherePills || [];
    const whereVals = wh.flatMap(p => p.values).filter(Boolean);
    if (whereVals.length > 0) {
      filter.where_mode = 'inline';
      filter.where_text = whereVals;
    }
  } else if (Array.isArray(locationIds)) {
    filter.where_mode = 'ids';
    filter.where_ids = locationIds;
  }

  // WHERE NOT + location excludes
  const whnot = sf.whereNotPills || [];
  const whereNotVals = whnot.flatMap(p => p.values.map(v => v.trim().replace(/^nor\s+/i, ''))).filter(Boolean);
  if (whereNotVals.length > 0) filter.where_not = whereNotVals;

  const locExcl = ((tuning.locationExcludes as FilterPill[]) || []).flatMap(p => p.values.map(v => v.trim())).filter(Boolean);
  if (locExcl.length > 0) filter.location_excludes = locExcl;

  if (tuning.usOnly) filter.us_only = true;
  if (tuning.excludeHourly) filter.exclude_hourly = true;
  if (tuning.excludeStaffing) filter.exclude_staffing = true;
  if (sf.includeRemote) filter.include_remote = true;

  // WHO
  const wo = sf.whoPills || [];
  const whoVals = wo.flatMap(p => p.values).filter(Boolean);
  if (whoVals.length > 0) filter.who = whoVals;

  const wonot = sf.whoNotPills || [];
  const whoNotVals = wonot.flatMap(p => p.values.map(v => v.trim().replace(/^nor\s+/i, ''))).filter(Boolean);
  if (whoNotVals.length > 0) filter.who_not = whoNotVals;

  const compExcl = ((tuning.companyExcludes as FilterPill[]) || []).flatMap(p => p.values.map(v => v.trim())).filter(Boolean);
  if (compExcl.length > 0) filter.company_excludes = compExcl;

  const indExcl = ((tuning.industryExcludes as FilterPill[]) || [])
    .map(p => typeof p === 'string' ? p : (p.values ? p.values[0] : p)).filter(Boolean);
  if (indExcl.length > 0) filter.industry_excludes = indExcl;

  // WHEN
  const wn = sf.whenPills || [];
  for (const pill of wn) {
    for (const v of pill.values) {
      const since = parseWhenValue(v);
      if (since) { filter.when_since = since.toISOString(); break; }
    }
    if (filter.when_since) break;
  }

  // PAY
  const pay = sf.payPills || [];
  if (pay.length > 0) {
    const pill = pay[0]!;
    if (pill.min) filter.pay_min = pill.min;
    if (pill.max) filter.pay_max = pill.max;
    filter.include_no_salary = sf.includeNoSalary !== false;
  }

  // SKILLS
  const sk = sf.skillsPills || [];
  const skillVals = sk.flatMap(p => p.values.map(v => v.trim().toLowerCase())).filter(Boolean);
  if (skillVals.length > 0) filter.skills = skillVals;

  // LEVEL
  const lv = sf.levelPills || [];
  const levelVals = lv.flatMap(p => p.values.map(v => v.trim().toLowerCase())).filter(Boolean);
  if (levelVals.length > 0) filter.levels = levelVals;

  // JD
  const jd = sf.jdPills || [];
  const jdVals = jd.flatMap(p => p.values.map(v => v.replace(/[,()]/g, '').trim())).filter(Boolean);
  if (jdVals.length > 0) filter.jd_terms = jdVals;

  // DEPARTMENT
  const dp = sf.deptPills || [];
  const deptVals = dp.flatMap(p => p.values.map(v => v.trim().toLowerCase())).filter(Boolean);
  if (deptVals.length > 0) filter.depts = deptVals;

  filter.filter_num = sf._filterNum || '';
  filter.filter_color = sf._filterColor || '';

  return filter;
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
  tuning: Record<string, unknown>,
  contentSearchEnabled = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  let query = baseQuery;

  // FA-007: Always filter to active/open jobs only (legacy parity)
  query = query.eq('status', 'open');

  // What pills (title/keyword search) — FA-001/FA-007: OR title ilike + content_tsv wfts
  const whatPills = sf.whatPills || sf.pills || [];
  const allWhatClauses: string[] = whatPills.flatMap(pill => {
    return pill.values.flatMap(v => {
      const safe = v.replace(/[,()]/g, '').trim();
      if (!safe) return [];
      if (contentSearchEnabled) {
        // FA-001: OR title match with full-text content match
        return [
          `title.ilike.%${safe}%`,
          `content_tsv.wfts(english).${safe}`,
        ];
      }
      return [`title.ilike.%${safe}%`];
    });
  });
  if (allWhatClauses.length > 0) query = query.or(allWhatClauses.join(','));

  // What NOT pills — FA-001/FA-007: negate BOTH title AND content_tsv
  // FA-002: NULL-safe — jobs with NULL content_tsv are NOT excluded
  const whatNotPills = sf.whatNotPills || [];
  for (const pill of whatNotPills) {
    for (const v of pill.values) {
      const term = v.trim().replace(/^nor\s+/i, '');
      if (term) {
        query = query.not('title', 'ilike', `%${term}%`);
        if (contentSearchEnabled) {
          query = query.or(`not.content_tsv.wfts(english).${term},content_tsv.is.null`);
        }
      }
    }
  }

  // Apply tuning title exclusions — FA-001/FA-007: + content exclusions
  const titleExcludes = (tuning.titleExcludes as FilterPill[]) || [];
  for (const pill of titleExcludes) {
    for (const v of pill.values) {
      if (v.trim()) {
        query = query.not('title', 'ilike', `%${v.trim()}%`);
        if (contentSearchEnabled) {
          query = query.or(`not.content_tsv.wfts(english).${v.trim()},content_tsv.is.null`);
        }
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
      const term = v.trim().replace(/^nor\s+/i, '');
      if (term) {
        query = query.not('location', 'ilike', `%${term}%`);
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

  // US-only toggle — delegated to shared us-filter.ts (single source of truth).
  // Sync any logic changes with js/us-filter.js (vanilla JS / job-feed.js path).
  if (tuning.usOnly) {
    query = buildUSOnlyQuery(query);
  }

  // FA-007: Exclude hourly-rate jobs if tuning says so (legacy parity)
  // Use OR to preserve NULL salary_rate rows — .not() generates NOT (x = 'hr')
  // which evaluates to NULL (excluded) for NULL rows, silently dropping most jobs.
  if (tuning.excludeHourly) {
    query = query.or('salary_rate.neq.hr,salary_rate.is.null');
  }

  // FA-007: Exclude staffing agency jobs if tuning says so (legacy parity)
  if (tuning.excludeStaffing) {
    query = query.neq('is_staffing_agency', true);
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
      const term = v.trim().replace(/^nor\s+/i, '');
      if (term) {
        query = query.not('company_name', 'ilike', `%${term}%`);
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

  // FA-007: Global industry exclusions (legacy parity)
  const indExcludes = ((tuning.industryExcludes as FilterPill[]) || [])
    .map(p => typeof p === 'string' ? p : (p.values ? p.values[0] : p))
    .filter(Boolean) as string[];
  for (const ind of indExcludes) {
    query = query.not('industry', 'ilike', `%${ind}%`);
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

  // FA-007: Pay range — use pill.min/pill.max (legacy parity)
  // Legacy uses structured min/max with overlap logic + includeNoSalary OR clause
  const payPills = sf.payPills || [];
  if (payPills.length > 0) {
    const pill = payPills[0]!;
    const minVal = pill.min;
    const maxVal = pill.max;
    const includeNoSalary = sf.includeNoSalary !== false; // default true

    if (minVal && maxVal) {
      // Jobs where salary range overlaps the filter range
      if (includeNoSalary) {
        query = query.or(`and(salary_max.gte.${minVal},salary_min.lte.${maxVal}),salary_min.is.null`);
      } else {
        query = query.gte('salary_max', minVal).lte('salary_min', maxVal);
      }
    } else if (minVal) {
      if (includeNoSalary) {
        query = query.or(`salary_max.gte.${minVal},salary_min.is.null`);
      } else {
        query = query.gte('salary_max', minVal);
      }
    } else if (maxVal) {
      if (includeNoSalary) {
        query = query.or(`salary_min.lte.${maxVal},salary_min.is.null`);
      } else {
        query = query.lte('salary_min', maxVal);
      }
    }
  }

  // Include no salary option (fallback for filters without min/max on pill)
  if (payPills.length === 0 && !sf.includeNoSalary) {
    query = query.not('salary_max', 'is', null);
  }

  // JD contains (full-text search on content_tsv) — FA-007: correct column + config
  const jdPills = sf.jdPills || [];
  for (const pill of jdPills) {
    for (const v of pill.values) {
      const safe = v.replace(/[,()]/g, '').trim();
      if (safe) {
        query = query.textSearch('content_tsv', safe, { type: 'websearch', config: 'english' });
      }
    }
  }

  // FA-007: Skills pills — filter on extracted_skills array (legacy parity)
  const skillsPills = sf.skillsPills || [];
  for (const pill of skillsPills) {
    const terms = pill.values.map(v => v.trim().toLowerCase()).filter(Boolean);
    if (terms.length > 0) {
      // Use cs (contains) operator — job must have at least one of these skills
      query = query.or(terms.map(t => `extracted_skills.cs.{${t}}`).join(','));
    }
  }

  // Level filter — FA-007: correct column to extracted_seniority (legacy parity)
  const levelPills = sf.levelPills || [];
  if (levelPills.length > 0) {
    const levels = levelPills.flatMap(p => p.values.map(v => v.trim().toLowerCase())).filter(Boolean);
    if (levels.length === 1) {
      query = query.eq('extracted_seniority', levels[0]!);
    } else if (levels.length > 1) {
      query = query.in('extracted_seniority', levels);
    }
  }

  // FA-007: Department pills — filter on extracted_department (legacy parity)
  const deptPills = sf.deptPills || [];
  if (deptPills.length > 0) {
    const depts = deptPills.flatMap(p => p.values.map(v => v.trim().toLowerCase())).filter(Boolean);
    if (depts.length === 1) {
      query = query.eq('extracted_department', depts[0]!);
    } else if (depts.length > 1) {
      query = query.in('extracted_department', depts);
    }
  }

  // Type filter (SPA-only — not in legacy, keep for forward compat)
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

      // FA-006: Check if server-side trust/AI filtering is needed
      const serverTrustEnabled = await isFeatureFlagEnabled('feed_server_trust_filter', false);
      const trustActive = state.trustFilters.size < ALL_TRUST.size;
      const aiActive = state.aiFilters.size < ALL_AI.size;
      const needsServerTrustFilter = serverTrustEnabled && (trustActive || aiActive);
      const rpcTrustLabels = (serverTrustEnabled && trustActive) ? Array.from(state.trustFilters) : null;
      const rpcAiLabels = (serverTrustEnabled && aiActive) ? Array.from(state.aiFilters) : null;

      if (checkedFilters.length === 1 && !needsServerTrustFilter) {
        // Single filter path
        // FA-007: Check content search flag for parity with legacy What/What NOT pills
        const contentSearchEnabled = await isFeatureFlagEnabled('feed_content_search', false);
        const sf = checkedFilters[0]!;
        let query = sb.from('ats_jobs').select('*', { count: 'planned' });
        query = buildFilterQuery(sf, query, sf._locationIds || null, tuning, contentSearchEnabled);

        if (hiddenIds.length > 0) {
          query = query.not('greenhouse_id', 'in', `(${hiddenIds.join(',')})`);
        }

        // Apply sort stack (skip client-only sorts)
        for (const s of state.sortStack) {
          if (['level', 'match', 'relevance'].includes(s.field)) continue;
          query = query.order(s.field, { ascending: s.asc });
        }

        // FA-004: no cap — each page is one lightweight DB query
        const from = page * JOBS_PER_PAGE;
        const to = from + JOBS_PER_PAGE - 1;
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
        // FA-005: Check server merge flag
        const serverMergeEnabled = await isFeatureFlagEnabled('feed_server_merge', false);
        const contentSearchEnabled = await isFeatureFlagEnabled('feed_content_search', false);

        if (serverMergeEnabled || needsServerTrustFilter) {
          // FA-005/FA-006: Server-side RPC path (merge + trust/AI filtering)
          const rpcFilters = checkedFilters.map(sf => serializeFilterForRPC(sf, tuning));
          let sortCol = 'updated_at';
          let sortAsc = false;
          for (const s of state.sortStack) {
            if (['level', 'match', 'relevance'].includes(s.field)) continue;
            sortCol = s.field;
            sortAsc = s.asc;
            break;
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: rpcResult, error: rpcError } = await sb.rpc('search_jobs_multi', {
            p_filters: rpcFilters,
            p_sort_col: sortCol,
            p_sort_asc: sortAsc,
            p_page: page,
            p_per_page: JOBS_PER_PAGE,
            p_hidden_ids: hiddenIds,
            p_content_search: contentSearchEnabled,
            p_trust_labels: rpcTrustLabels,   // FA-006
            p_ai_labels: rpcAiLabels,         // FA-006
          });

          if (controller.signal.aborted) return;
          if (rpcError) throw new ProviderError(rpcError.message, 'SEARCH_FAILED', undefined, rpcError);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const resultData = (rpcResult as any) || { data: [], count: 0 };
          const serverJobs = resultData.data || [];

          // FA-006: Populate legacy caches from server-returned data for badge rendering
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fraudCache = (window as any)._fraudScoreCache = (window as any)._fraudScoreCache || {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const aiCache = (window as any)._aiJdCache = (window as any)._aiJdCache || {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          serverJobs.forEach((job: any) => {
            if (job._fraud_label != null) {
              fraudCache[job.greenhouse_id] = {
                score: job._fraud_score, label: job._fraud_label,
                signals: job._fraud_signals || [], confidence: job._fraud_confidence,
              };
            }
            if (job._ai_label != null) {
              aiCache[job.greenhouse_id] = {
                label: job._ai_label, score: job._ai_score,
                confidence: job._ai_confidence, summary: job._ai_summary,
                perplexity: job._ai_perplexity, burstiness: job._ai_burstiness,
                topSignals: job._ai_signals || [],
              };
            }
          });

          allJobs = serverJobs.map((job: FeedJob & { _filter_idxs?: number[] }) => {
            const filterIdxs = job._filter_idxs || [];
            const filterNums = filterIdxs.map((idx: number) => {
              const sf = checkedFilters[idx - 1];
              return sf ? { num: sf._filterNum || '', color: sf._filterColor || '' } : { num: '', color: '' };
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { _filter_idxs, _fraud_score, _fraud_label, _fraud_confidence, _fraud_signals, _ai_label, _ai_score, _ai_confidence, _ai_summary, _ai_perplexity, _ai_burstiness, _ai_signals, ...rest } = job as any;
            return { ...rest, _filterNums: filterNums } as FeedJob;
          });
          totalCount = resultData.count || 0;

        } else {
          // Client-side merge fallback (pre-FA-005)
          const perFilter = Math.min(Math.ceil(2000 / checkedFilters.length), 500);
          const seenIds = new Set<string>();
          const jobFilterMap = new Map<string, Array<{ num: string; color: string }>>();

          const promises = checkedFilters.map(sf => {
            let q = sb.from('ats_jobs').select('*', { count: 'planned' });
            q = buildFilterQuery(sf, q, sf._locationIds || null, tuning, contentSearchEnabled);
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

          allJobs.forEach(j => {
            j._filterNums = jobFilterMap.get(j.greenhouse_id) || [];
          });

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

          const from = page * JOBS_PER_PAGE;
          allJobs = allJobs.slice(from, from + JOBS_PER_PAGE);
        }
      }

      if (controller.signal.aborted) return;

      // Apply trust filter
      // FA-006: Skip when server-side trust filter handled filtering in the DB
      if (!serverTrustEnabled && state.trustFilters.size < ALL_TRUST.size) {
        const cache = getLegacyFraudCache();
        allJobs = allJobs.filter(j => {
          const info = cache[j.greenhouse_id];
          const label: TrustLabel = info?.label || 'unknown';
          return state.trustFilters.has(label);
        });
      }

      // Apply AI content filter
      // FA-006: Skip when server-side trust filter handled filtering in the DB
      if (!serverTrustEnabled && state.aiFilters.size < ALL_AI.size) {
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
