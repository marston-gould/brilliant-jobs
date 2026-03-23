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
import { buildUSOnlyQuery, buildUSRemoteClauses } from './us-filter';

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
  is_staffing_agency?: boolean;
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
  searchMode: 'filters' | 'chat' | 'guided';
}

export interface FeedSearchActions {
  search: (page?: number) => Promise<void>;
  setPage: (page: number) => void;
  toggleSort: (field: string) => void;
  removeSort: (field: string) => void;
  setTrustFilters: (labels: Set<TrustLabel>) => void;
  setAiFilters: (labels: Set<AiLabel>) => void;
  setSearchMode: (mode: 'filters' | 'chat' | 'guided') => void;
  setStats: (stats: FeedStats) => void;
  saveJob: (jobId: string, job?: { title?: string | null; company_name?: string | null; apply_url?: string | null; url?: string | null }) => Promise<void>;
  unsaveJob: (jobId: string) => Promise<void>;
  hideJob: (jobId: string) => Promise<void>;
  markApplied: (jobId: string) => Promise<void>;
}

const JOBS_PER_PAGE = 50;
// FA-004: MAX_FEED_ROWS cap removed — real server-side pagination

const ALL_TRUST: Set<TrustLabel> = new Set(['safe', 'caution', 'suspicious', 'unknown']);
const ALL_AI: Set<AiLabel> = new Set(['human', 'mixed', 'ai_generated', 'unscored']);

// ── Helper: standalone Supabase client (SPA-CUT-1) ────────

import { supabase as _sb, isFeatureEnabled as _isFlagEnabled, safeReadLS, getUser } from '@lib/supabase';

function getSupabase() {
  return _sb;
}

// ── Helper: read feed state from localStorage (SPA-CUT-1) ──
// These replace the window.* globals from legacy JS.
// savedJobIds, appliedJobIds, hiddenJobIds are all persisted
// to localStorage by the legacy code. We read directly.

function getLegacySavedJobIds(): string[] {
  return safeReadLS<string[]>('bj_saved_jobs', []);
}

function getLegacyAppliedJobIds(): string[] {
  return safeReadLS<string[]>('bj_applied_jobs', []);
}

function getLegacyHiddenJobIds(): Array<{ id: string }> {
  const raw = safeReadLS<any[]>('bj_hidden_jobs', []);
  return raw.map((item: any) => typeof item === 'string' ? { id: item } : item);
}

// Supabase hidden jobs cache (loaded once per session)
let _supabaseHiddenIds: string[] | null = null;
async function getHiddenJobIds(): Promise<string[]> {
  // Merge localStorage + Supabase hidden IDs
  const localIds = getLegacyHiddenJobIds().map(h => h.id);
  if (_supabaseHiddenIds === null) {
    try {
      const user = await getUser();
      if (user) {
        const sb = getSupabase();
        const { data } = await sb.from('hidden_jobs').select('job_id').eq('user_id', user.id);
        _supabaseHiddenIds = (data || []).map((r: any) => r.job_id);
      } else { _supabaseHiddenIds = []; }
    } catch { _supabaseHiddenIds = []; }
  }
  return Array.from(new Set([...localIds, ..._supabaseHiddenIds]));
}

// Match scores are session-only (not persisted) — use module-level cache
const _matchScoreCache: Record<string, number | { score: number }> = {};
function getLegacyMatchScores(): Record<string, number | { score: number }> {
  return _matchScoreCache;
}

// Fraud + AI caches are session-only — module-level caches
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _fraudCache: Record<string, { label: TrustLabel; score: number; signals?: any[]; confidence?: number }> = {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getLegacyFraudCache(): Record<string, { label: TrustLabel; score: number; signals?: any[]; confidence?: number }> {
  return _fraudCache;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _aiJdCacheLocal: Record<string, { label: AiLabel; ai_probability: number; score?: number; confidence?: number; summary?: string; perplexity?: number; burstiness?: number; topSignals?: any[] }> = {};
function getLegacyAiJdCache(): Record<string, { label: AiLabel; ai_probability: number; score?: number }> {
  return _aiJdCacheLocal;
}

// ── Helper: check feature flags (SPA-CUT-1) ────────────────

async function isFeatureFlagEnabled(key: string, fallback: boolean): Promise<boolean> {
  return _isFlagEnabled(key, fallback);
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
  // Match: "14 days", "last 14 days", "7d", "last 7 days", "1 month", etc.
  const match = v.match(/(?:last\s+)?(\d+)\s*(d|day|days|w|week|weeks|m|month|months)/);
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

  // FLAT-STRING FALLBACK: if pills are empty but flat string fields exist (from Filter Builder save),
  // convert them to pill format so the rest of the function works
  const sfAny = sf as Record<string, unknown>;
  if ((!sf.whatPills || sf.whatPills.length === 0) && typeof sfAny.what === 'string' && sfAny.what) {
    sf.whatPills = (sfAny.what as string).split(',').map(v => ({ type: 'keyword', values: [v.trim()] }));
  }
  if ((!sf.whatNotPills || sf.whatNotPills.length === 0) && typeof sfAny.whatNot === 'string' && sfAny.whatNot) {
    sf.whatNotPills = (sfAny.whatNot as string).split(',').map(v => ({ type: 'not', values: [v.trim()] }));
  }
  if ((!sf.wherePills || sf.wherePills.length === 0) && typeof sfAny.where === 'string' && sfAny.where) {
    sf.wherePills = (sfAny.where as string).split(',').map(v => ({ type: 'where', values: [v.trim()] }));
  }
  if ((!sf.whereNotPills || sf.whereNotPills.length === 0) && typeof sfAny.whereNot === 'string' && sfAny.whereNot) {
    sf.whereNotPills = (sfAny.whereNot as string).split(',').map(v => ({ type: 'not', values: [v.trim()] }));
  }
  if ((!sf.whoPills || sf.whoPills.length === 0) && typeof sfAny.who === 'string' && sfAny.who) {
    sf.whoPills = (sfAny.who as string).split(',').map(v => ({ type: 'who', values: [v.trim()] }));
  }
  if ((!sf.whoNotPills || sf.whoNotPills.length === 0) && typeof sfAny.whoNot === 'string' && sfAny.whoNot) {
    sf.whoNotPills = (sfAny.whoNot as string).split(',').map(v => ({ type: 'not', values: [v.trim()] }));
  }
  if ((!sf.whenPills || sf.whenPills.length === 0) && typeof sfAny.when === 'string' && sfAny.when) {
    sf.whenPills = [{ type: 'when', values: [sfAny.when as string] }];
  }
  if ((!sf.payPills || sf.payPills.length === 0) && (sfAny.payMin || sfAny.payMax)) {
    sf.payPills = [{ type: 'pay', values: [], min: sfAny.payMin as string || '', max: sfAny.payMax as string || '' } as any];
  }
  if ((!sf.levelPills || sf.levelPills.length === 0) && typeof sfAny.level === 'string' && sfAny.level) {
    sf.levelPills = (sfAny.level as string).split(',').map(v => ({ type: 'level', values: [v.trim()] }));
  }
  if ((!sf.jdPills || sf.jdPills.length === 0) && typeof sfAny.jd === 'string' && sfAny.jd) {
    sf.jdPills = (sfAny.jd as string).split(',').map(v => ({ type: 'jd', values: [v.trim()] }));
  }
  if (sfAny.remote === true || sfAny.includeRemote === true) {
    sf.includeRemote = true;
  }

  // What pills (title/keyword search) — FA-001/FA-007: OR title ilike
  const whatPills = sf.whatPills || sf.pills || [];
  const allWhatClauses: string[] = whatPills.flatMap(pill => {
    return pill.values.flatMap(v => {
      const safe = v.replace(/[,()]/g, '').trim();
      if (!safe) return [];
      if (contentSearchEnabled) {
        // Use phfts (phrase search) for multi-word terms to avoid false positives
        // e.g. "organic search" matches as phrase, not "organic" AND "search" separately
        const hasSpace = safe.includes(' ');
        const ftsOp = hasSpace ? 'phfts' : 'wfts';
        return [
          `title.ilike.%${safe}%`,
          `content_tsv.${ftsOp}(english).${safe}`,
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
        // content_tsv negation removed — PostgREST can't negate inside or()
      }
    }
  }

  // Apply tuning title exclusions — FA-001/FA-007: + content exclusions
  const titleExcludes = (tuning.titleExcludes as FilterPill[]) || [];
  for (const pill of titleExcludes) {
    for (const v of pill.values) {
      if (v.trim()) {
        query = query.not('title', 'ilike', `%${v.trim()}%`);
        // content_tsv negation removed — PostgREST can't negate inside or()
      }
    }
  }

  // Where pills (location) — if we have pre-fetched IDs, use them
  // FEED-FIX-002 (v8.39): includeRemote handling added to single-filter (ue) path.
  // Previously, remote locType pills were silently skipped with no fallback, leaving
  // zero location constraints on the query — ALL 500k+ jobs returned unfiltered.
  // Fix: Build explicit OR clauses combining any text location filters with
  // US-scoped remote clauses when includeRemote is true.
  const includeRemote = sf.includeRemote === true;
  if (locationIds && locationIds.length > 0) {
    // Pre-fetched IDs path: apply IDs, then OR in US remote if toggled
    if (includeRemote) {
      const remoteClauses = buildUSRemoteClauses().join(',');
      query = query.or(`greenhouse_id.in.(${locationIds.join(',')}),${remoteClauses}`);
    } else {
      query = query.in('greenhouse_id', locationIds);
    }
  } else {
    const wherePills = sf.wherePills || [];
    // FEED-FIX-003: Map country names to loc_country codes (same as RPC inline mode).
    // Previously used location.ilike.%united states% which (a) missed jobs where
    // location = 'US' or 'New York, NY', and (b) did not block non-US jobs.
    // Now maps 'united states' → loc_country.eq.US etc., matching RPC behavior exactly.
    const textClauses: string[] = [];
    let isUSPill = false;
    for (const pill of wherePills) {
      if (pill.locType === 'remote') continue;
      for (const v of pill.values) {
        const norm = v.trim().toLowerCase();
        if (!norm) continue;
        if (['united states', 'usa', 'us', 'u.s.', 'america'].includes(norm)) {
          textClauses.push('loc_country.eq.US');
          isUSPill = true;
        } else if (['canada'].includes(norm)) {
          textClauses.push('loc_country.eq.CA');
        } else if (['united kingdom', 'uk', 'england'].includes(norm)) {
          textClauses.push('loc_country.eq.GB');
        } else {
          textClauses.push(`location.ilike.%${v.trim()}%`);
        }
      }
    }
    const hasTextLocation = textClauses.length > 0;
    const hasRemotePill = wherePills.some(p => p.locType === 'remote');

    if (includeRemote) {
      if (isUSPill) {
        // US + remote: just filter to US country OR remote jobs
        query = query.or('loc_country.eq.US,is_remote.eq.true,location.eq.Remote,location.eq.Anywhere');
      } else if (textClauses.length > 0) {
        const remoteClauses = ['is_remote.eq.true', 'location.eq.Remote'];
        query = query.or([...textClauses, ...remoteClauses].join(','));
      } else {
        // Just remote, no specific location
        query = query.or('is_remote.eq.true,location.eq.Remote,location.eq.Anywhere');
      }
    } else if (hasTextLocation) {
      if (isUSPill) {
        // US only, no remote — simple country filter
        query = query.eq('loc_country', 'US');
      } else {
        // Text-only location filter (non-country) — apply each ilike directly
        for (const pill of wherePills) {
          if (pill.locType === 'remote') continue;
          for (const v of pill.values) {
            if (v.trim()) query = query.ilike('location', `%${v.trim()}%`);
          }
        }
      }
    } else if (hasRemotePill && !includeRemote) {
      // Remote pill present but toggle off — show only explicitly remote
      query = query.or('is_remote.eq.true,loc_type.eq.remote,location.ilike.Remote%');
    }
    // If no location pills and no remote toggle: no location constraint (show all)
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
  const payPills = sf.payPills || [];
  if (payPills.length > 0) {
    const pill = payPills[0]!;
    const minVal = pill.min;
    const maxVal = pill.max;
    const includeNoSalary = sf.includeNoSalary !== false;

    if (minVal || maxVal) {
      if (includeNoSalary) {
        // Include jobs meeting salary threshold OR jobs with no salary data
        const clauses: string[] = [];
        if (minVal) clauses.push(`salary_max.gte.${minVal}`);
        if (maxVal) clauses.push(`salary_min.lte.${maxVal}`);
        clauses.push('salary_max.is.null');
        query = query.or(clauses.join(','));
      } else {
        // Strict: only jobs with salary data meeting threshold
        if (minVal && maxVal) {
          query = query.gte('salary_max', minVal).lte('salary_min', maxVal);
        } else if (minVal) {
          query = query.gte('salary_max', minVal);
        } else if (maxVal) {
          query = query.lte('salary_min', maxVal);
        }
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
    const levels = levelPills.flatMap(p => p.values.map(v => v.trim().toLowerCase().replace(/^or\s+/, ''))).filter(Boolean);
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

// ── Module-level result cache — survives navigation ───────
// Keyed by filter checksum so stale results are not shown when filters change
let _cachedJobs: FeedJob[] = [];
let _cachedTotal = 0;
let _cacheKey = '';

function getFilterCacheKey(filters: SavedFilter[]): string {
  return filters.map(f => f.id + ':' + (f.checked ? '1' : '0')).join('|');
}

// ── Hook ──────────────────────────────────────────────────

export function useFeedSearch(getActiveFilters?: () => SavedFilter[]): [FeedSearchState, FeedSearchActions] {
  const [state, setState] = useState<FeedSearchState>({
    jobs: _cachedJobs,
    total: _cachedTotal,
    page: 0,
    loading: _cachedJobs.length === 0,
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

      // Load tuning from Supabase (profiles.user_data.tuning), fallback to localStorage
      let tuning: Record<string, unknown> = {};
      try {
        const user = await getUser();
        if (user) {
          const { data: profile } = await sb.from('profiles').select('user_data').eq('id', user.id).single();
          const userData = (profile?.user_data as Record<string, unknown>) || {};
          tuning = (userData.tuning as Record<string, unknown>) || {};
          // Sync to localStorage so other code can read it
          try { localStorage.setItem('bj_tuning', JSON.stringify(tuning)); } catch {}
        }
      } catch {
        tuning = safeReadLS('bj_tuning', {});
      }

      const hiddenIds = await getHiddenJobIds();

      // Get active filters — SPA-CUT-1: read from localStorage
      const legacySavedFilters: SavedFilter[] = safeReadLS<SavedFilter[]>('bj_saved_filters', []);
      const checkedFilters = legacySavedFilters.filter(f => f.checked);

      // No saved filters — show default feed (open jobs, newest first)
      if (checkedFilters.length === 0) {
        const from = page * JOBS_PER_PAGE;
        const to = from + JOBS_PER_PAGE - 1;
        let defQuery = sb
          .from('ats_jobs')
          .select('greenhouse_id, title, company_name, location, loc_country, loc_state, loc_city, loc_type, salary_min, salary_max, salary_currency, salary_rate, first_seen_at, updated_at, created_at, url, apply_url, ats_source, status, extracted_seniority, extracted_skills, is_remote, content, is_staffing_agency', { count: 'planned' })
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .range(from, to);
        if (hiddenIds.length > 0) defQuery = defQuery.not('greenhouse_id', 'in', `(${hiddenIds.join(',')})`);
        const { data: defData, error: defError, count: defCount } = await defQuery;
        if (controller.signal.aborted) return;
        if (defError) throw new ProviderError(defError.message, 'SEARCH_FAILED', undefined, defError);
        const defJobs = (defData || []) as unknown as FeedJob[];
        _cachedJobs = defJobs;
        _cachedTotal = defCount || 0;
        _cacheKey = '';
        setState(prev => ({
          ...prev,
          jobs: defJobs,
          total: defCount || 0,
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
        let query = sb.from('ats_jobs').select('greenhouse_id, title, company_name, location, loc_country, loc_state, loc_city, loc_type, salary_min, salary_max, salary_currency, salary_rate, first_seen_at, updated_at, created_at, url, apply_url, ats_source, status, extracted_seniority, extracted_skills, is_remote, content, is_staffing_agency', { count: 'planned' });
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
          // SPA-CUT-1: Use module-level caches instead of window globals
          const fraudCacheRef = _fraudCache;
          const aiCacheRef = _aiJdCacheLocal;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          serverJobs.forEach((job: any) => {
            if (job._fraud_label != null) {
              fraudCacheRef[job.greenhouse_id] = {
                score: job._fraud_score, label: job._fraud_label,
                signals: job._fraud_signals || [], confidence: job._fraud_confidence,
              };
            }
            if (job._ai_label != null) {
              aiCacheRef[job.greenhouse_id] = {
                label: job._ai_label, ai_probability: job._ai_score || 0,
                score: job._ai_score,
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
          // Fetch enough rows to cover the requested page
          const perFilter = (page + 1) * JOBS_PER_PAGE + JOBS_PER_PAGE;
          const seenIds = new Set<string>();
          const jobFilterMap = new Map<string, Array<{ num: string; color: string }>>();

          const promises = checkedFilters.map(sf => {
            let q = sb.from('ats_jobs').select('greenhouse_id, title, company_name, location, loc_country, loc_state, loc_city, loc_type, salary_min, salary_max, salary_currency, salary_rate, first_seen_at, updated_at, created_at, url, apply_url, ats_source, status, extracted_seniority, extracted_skills, is_remote, content, is_staffing_agency', { count: 'planned' });
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

      _cachedJobs = allJobs;
      _cachedTotal = totalCount;
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

  const setSearchMode = useCallback((mode: 'filters' | 'chat' | 'guided') => {
    setState(prev => ({ ...prev, searchMode: mode }));
    try { localStorage.setItem('bj_search_mode', mode); } catch {}
  }, []);

  const setStats = useCallback((stats: FeedStats) => {
    setState(prev => ({ ...prev, stats }));
  }, []);

  const setPage = useCallback((page: number) => {
    search(page);
  }, [search]);

  // ── Job actions (bridge to legacy) ──────────────────────

  const saveJob = useCallback(async (jobId: string, job?: { title?: string | null; company_name?: string | null; apply_url?: string | null; url?: string | null }) => {
    const sb = getSupabase();
    const user = await getUser();
    if (!user) throw new ProviderError('Not authenticated', 'AUTH_REQUIRED');
    const { error } = await sb.from('user_pipeline').upsert({
      user_id: user.id,
      job_id: jobId,
      stage: 'saved',
      job_title: job?.title || null,
      company_name: job?.company_name || null,
      job_url: job?.apply_url || job?.url || null,
    }, { onConflict: 'user_id,job_id' });
    if (error) throw new ProviderError(error.message, 'SAVE_FAILED');
    setState(prev => ({
      ...prev,
      savedJobIds: new Set([...prev.savedJobIds, jobId]),
      stats: { ...prev.stats, pipeline: prev.stats.pipeline + 1 },
    }));
  }, []);

  const unsaveJob = useCallback(async (jobId: string) => {
    const sb = getSupabase();
    const user = await getUser();
    if (!user) return;
    await sb.from('user_pipeline').delete().eq('user_id', user.id).eq('job_id', jobId);
    setState(prev => {
      const next = new Set(prev.savedJobIds);
      next.delete(jobId);
      return { ...prev, savedJobIds: next, stats: { ...prev.stats, pipeline: Math.max(0, prev.stats.pipeline - 1) } };
    });
  }, []);

  const hideJob = useCallback(async (jobId: string) => {
    // Optimistic UI removal
    setState(prev => ({
      ...prev,
      jobs: prev.jobs.filter(j => j.greenhouse_id !== jobId),
      total: prev.total - 1,
      stats: { ...prev.stats, total: prev.stats.total - 1 },
    }));
    // Persist to Supabase hidden_jobs table
    try {
      const user = await getUser();
      if (user) {
        await getSupabase().from('hidden_jobs').upsert({ user_id: user.id, job_id: jobId, reason: 'dismissed' }, { onConflict: 'user_id,job_id' });
      }
    } catch { /* non-fatal */ }
    // Also keep localStorage as fallback
    const hidden = safeReadLS<any[]>('bj_hidden_jobs', []);
    hidden.push({ id: jobId, reason: 'dismissed', hiddenAt: new Date().toISOString() });
    try { localStorage.setItem('bj_hidden_jobs', JSON.stringify(hidden)); } catch { /* non-fatal */ }
    // Invalidate Supabase hidden IDs cache so next search excludes this job
    _supabaseHiddenIds = null;
  }, []);

  const markApplied = useCallback(async (jobId: string) => {
    // Persist to localStorage as fallback
    const applied = safeReadLS<string[]>('bj_applied_jobs', []);
    if (!applied.includes(jobId)) {
      applied.push(jobId);
      try { localStorage.setItem('bj_applied_jobs', JSON.stringify(applied)); } catch { /* non-fatal */ }
    }
    // Also update pipeline_entries stage to 'applied' if exists
    try {
      const user = await getUser();
      if (user) {
        await getSupabase().from('pipeline_entries').update({ stage: 'applied', applied_at: new Date().toISOString() })
          .eq('user_id', user.id).eq('job_id', jobId);
      }
    } catch { /* non-fatal */ }
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
      setStats,
      saveJob,
      unsaveJob,
      hideJob,
      markApplied,
    },
  ];
}

export default useFeedSearch;
