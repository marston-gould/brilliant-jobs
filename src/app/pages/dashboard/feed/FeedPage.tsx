// ============================================================
// FeedPage — Main Feed Page Container (SA-014)
// ============================================================
// Orchestrates all feed components:
// - FeedHero (stats)
// - SearchModeToggle (filters/chat)
// - FilterBuilder + SavedSearches (query building)
// - TrustFilter + AiContentFilter (post-filters)
// - SortControls (multi-sort)
// - JobTable (results with JobRow children)
// - PaginationControls (load more)
//
// Data flows through useFeedSearch hook → providers.
// Dark mode: automatic via CSS custom properties.
// Zero inline styles. Design tokens via Tailwind.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@app/components';
import { useProviders } from '@providers';
import {
  FeedHero,
  SearchModeToggle,
  FilterBuilder,
  SavedSearches,
  TrustFilter,
  AiContentFilter,
  SortControls,
  SearchBar,
  JobTable,
  IntelCards,
  ChatPanel,
} from './components';
import type { FilterValues } from './components';
import { useFeedSearch } from './hooks/useFeedSearch';
import type { TrustLabel, AiLabel } from './hooks/useFeedSearch';

// ── Default level hierarchy (from legacy) ─────────────────

const DEFAULT_LEVEL_HIERARCHY = [
  { label: 'C-Suite', rank: 1, color: '#8b5cf6', keywords: ['ceo', 'cfo', 'cto', 'coo', 'cmo', 'chief'] },
  { label: 'VP', rank: 2, color: '#6366f1', keywords: ['vice president', 'vp '] },
  { label: 'Director', rank: 3, color: '#3b82f6', keywords: ['director'] },
  { label: 'Sr Manager', rank: 4, color: '#0ea5e9', keywords: ['senior manager', 'sr. manager', 'sr manager'] },
  { label: 'Manager', rank: 5, color: '#06b6d4', keywords: ['manager'] },
  { label: 'Lead', rank: 6, color: '#14b8a6', keywords: ['lead', 'principal'] },
  { label: 'Senior', rank: 7, color: '#22c55e', keywords: ['senior', 'sr.', 'sr '] },
  { label: 'Mid', rank: 8, color: '#84cc16', keywords: ['mid-level', 'mid level', 'ii', 'iii'] },
  { label: 'Junior', rank: 9, color: '#eab308', keywords: ['junior', 'jr.', 'jr ', 'entry', 'associate'] },
  { label: 'Intern', rank: 10, color: '#f97316', keywords: ['intern', 'internship', 'co-op'] },
];

// ── Legacy bridge helpers ─────────────────────────────────

function getLegacySet(key: string): Set<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arr = (window as any)[key] || [];
  return new Set(Array.isArray(arr) ? arr : []);
}

function getLegacyObj<T>(key: string, fallback: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any)[key] || fallback;
}

interface SavedSearchItem {
  id: string;
  name: string;
  color: string;
  checked: boolean;
  filterNum?: string;
}

function getLegacySavedSearchItems(): SavedSearchItem[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filters: any[] = (window as any).savedFilters || [];
  return filters.map((f, i) => ({
    id: f.id || `sf-${i}`,
    name: f.name || `Search ${i + 1}`,
    color: f._filterColor || '#3b82f6',
    checked: !!f.checked,
    filterNum: f._filterNum || '',
  }));
}

const FILTER_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

async function loadSavedFiltersFromSupabase(): Promise<SavedSearchItem[]> {
  try {
    const { supabase, getUser } = await import('@app/lib/supabase');
    const user = await getUser();
    if (!user) return getLegacySavedSearchItems();
    const { data } = await supabase.from('saved_filters').select('*').eq('user_id', user.id).order('created_at');
    if (!data?.length) return getLegacySavedSearchItems();
    return data.map((f: any, i: number) => ({
      id: f.id,
      name: f.name || `Search ${i + 1}`,
      color: FILTER_COLORS[i % FILTER_COLORS.length] || '#3b82f6',
      checked: true,
      filterNum: String(i + 1),
    }));
  } catch { return getLegacySavedSearchItems(); }
}

// ── Page Component ────────────────────────────────────────

export function FeedPage() {
  const navigate = useNavigate();
  const [state, actions] = useFeedSearch();

  // Local UI state
  const [filterBuilderCollapsed, setFilterBuilderCollapsed] = useState(false);
  const [savedSearchesCollapsed, setSavedSearchesCollapsed] = useState(false);
  const [savedSearchItems, setSavedSearchItems] = useState<SavedSearchItem[]>([]);
  const [filterValues, setFilterValues] = useState<FilterValues>({
    what: '',
    whatNot: '',
    where: '',
    whereNot: '',
    who: '',
    whoNot: '',
    when: '',
    payMin: '',
    payMax: '',
    skills: '',
    dept: '',
    level: '',
    jd: '',
    includeRemote: false,
    includeNoSalary: true,
  });

  // Read legacy data on mount
  const savedJobIds = useMemo(() => getLegacySet('savedJobIds'), [state.jobs]);
  const appliedJobIds = useMemo(() => getLegacySet('appliedJobIds'), [state.jobs]);
  const matchScores = useMemo(() => getLegacyObj('jobMatchScores', {}), [state.jobs]);
  const fraudCache = useMemo(() => getLegacyObj('_fraudScoreCache', {}), [state.jobs]);
  const aiCache = useMemo(() => getLegacyObj('_aiJdCache', {}), [state.jobs]);

  // Preload global stats from RPC so hero shows real numbers immediately
  const { stats: statsProvider } = useProviders();
  useEffect(() => {
    statsProvider.getJobCounts().then((data: any) => {
      if (data && state.stats.total === 0) {
        actions.setStats({
          total: data.total_open ?? 0,
          companies: data.total_companies ?? 0,
          newToday: data.new_today ?? 0,
          newSinceLogin: 0,
          pipeline: state.stats.pipeline,
        });
      }
    }).catch(() => {});
  }, [statsProvider]);

  // Load saved searches from Supabase
  useEffect(() => {
    loadSavedFiltersFromSupabase().then(setSavedSearchItems);
  }, []);

  // Trigger initial search on mount
  useEffect(() => {
    actions.search(0);
  }, []);

  // ── Saved search handlers ─────────────────────────────

  const handleToggleSavedSearch = useCallback(async (id: string) => {
    setSavedSearchItems(prev =>
      prev.map(item =>
        item.id === id ? { ...item, checked: !item.checked } : item
      )
    );
    // Load saved filter config from Supabase and apply to filter builder
    try {
      const { supabase } = await import('@app/lib/supabase');
      const { data } = await supabase.from('saved_filters').select('config').eq('id', id).single();
      if (data?.config) {
        setFilterValues(prev => ({ ...prev, ...data.config }));
      }
    } catch {}
    actions.search(0);
  }, [actions]);

  const handleSelectAllSavedSearches = useCallback((checked: boolean) => {
    setSavedSearchItems(prev =>
      prev.map(item => ({ ...item, checked }))
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const legacyFilters: any[] = (window as any).savedFilters || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    legacyFilters.forEach((f: any) => { f.checked = checked; });
    actions.search(0);
  }, [actions]);

  const handleDeleteSavedSearches = useCallback(async (ids: string[]) => {
    const idSet = new Set(ids);
    setSavedSearchItems(prev => prev.filter(item => !idSet.has(item.id)));
    try {
      const { supabase } = await import('@app/lib/supabase');
      for (const id of ids) {
        await supabase.from('saved_filters').delete().eq('id', id);
      }
    } catch {}
  }, []);

  // ── Filter builder handlers ───────────────────────────

  const handleSearch = useCallback(() => {
    // Build pills from filter values and inject into legacy
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bj = (window as any).BJ || (window as any);
    if (typeof bj.searchJobs === 'function') {
      bj.searchJobs(0);
    } else {
      actions.search(0);
    }
  }, [actions]);

  const handleSaveFilter = useCallback(async () => {
    const name = prompt('Name this filter:');
    if (!name) return;
    try {
      const { supabase, getUser } = await import('@app/lib/supabase');
      const user = await getUser();
      if (!user) return;
      await supabase.from('saved_filters').insert({
        user_id: user.id,
        name,
        config: filterValues,
      });
      const updated = await loadSavedFiltersFromSupabase();
      setSavedSearchItems(updated);
    } catch (e) { console.error('Save filter failed:', e); }
  }, [filterValues]);

  const handleAiGenerate = useCallback(async () => {
    try {
      const { callGateway } = await import('@app/lib/supabase');
      const result = await callGateway<any>('admin-filter-prompt', { action: 'suggest' }, { timeout: 20000 });
      if (result?.filters) {
        setFilterValues(prev => ({ ...prev, ...result.filters }));
      }
    } catch { /* Bridge to legacy fallback */ const bj = (window as any); if (typeof bj.bjAiSuggestFilters === 'function') bj.bjAiSuggestFilters(); }
  }, []);

  const handleClearAll = useCallback(() => {
    setFilterValues({
      what: '', whatNot: '', where: '', whereNot: '',
      who: '', whoNot: '', when: '', payMin: '', payMax: '',
      skills: '', dept: '', level: '', jd: '',
      includeRemote: false, includeNoSalary: true,
    });
  }, []);

  // REM-S13: Bridge to legacy openFilterBrowser for browse buttons
  const handleBrowse = useCallback((dimension: string, mode: 'include' | 'exclude') => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (typeof w.openFilterBrowser === 'function') {
      w.openFilterBrowser(dimension, mode);
    } else if (typeof w.openCompanyBrowser === 'function' && (dimension === 'company')) {
      w.openCompanyBrowser(mode);
    }
  }, []);

  // REM-S14: Read US-Only from legacy tuning state
  const usOnly = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tuning = (window as any).tuningSettings;
    return !!(tuning && tuning.usOnly);
  }, [state.jobs]);

  // ── Job action handlers ───────────────────────────────

  const handleSave = useCallback((jobId: string) => {
    const isSaved = savedJobIds.has(jobId);
    if (isSaved) {
      actions.unsaveJob(jobId);
      (window as any).__bjToast?.('Removed from pipeline', 'info');
    } else {
      actions.saveJob(jobId);
      (window as any).__bjToast?.('Saved to pipeline', 'success');
    }
  }, [actions, savedJobIds]);

  const handleHide = useCallback((jobId: string) => {
    actions.hideJob(jobId);
    (window as any).__bjToast?.('Job hidden', 'info');
  }, [actions]);

  const handleApply = useCallback((jobId: string, url: string) => {
    actions.markApplied(jobId);
    (window as any).__bjToast?.('Marked as applied', 'success');
    if (url && url !== '#') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [actions]);

  // ── Navigation ────────────────────────────────────────

  const handlePipelineClick = useCallback(() => {
    navigate('/app/pipeline');
  }, [navigate]);

  // ── Filter count ──────────────────────────────────────

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterValues.what) count++;
    if (filterValues.whatNot) count++;
    if (filterValues.where) count++;
    if (filterValues.whereNot) count++;
    if (filterValues.who) count++;
    if (filterValues.whoNot) count++;
    if (filterValues.when) count++;
    if (filterValues.payMin || filterValues.payMax) count++;
    return count;
  }, [filterValues]);

  // ── Render ────────────────────────────────────────────

  return (
    <div className="space-y-3">
      <PageHeader title="Jobs Feed" subtitle="Openings aggregated from multiple sources" helpLink="feed" onHelp={() => {}} />

      {/* Hero stats */}
      <FeedHero stats={state.stats} onPipelineClick={handlePipelineClick} />

      {/* Intel cards — side by side, above toggle (legacy: feed-intel section, line 833) */}
      <IntelCards
        searchQuery={filterValues.what}
        visibleCompanies={
          state.jobs
            .map(j => j.company_name)
            .filter((v, i, a) => a.indexOf(v) === i)
            .slice(0, 20)
        }
      />

      {/* Global Rules + AI Generation CTAs — legacy lines 856-873 */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-accent/15"
          style={{ background: 'linear-gradient(135deg, rgba(77,142,255,0.05), rgba(167,139,250,0.05))' }}>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-bold text-accent">Adjust Global Rules</span>
          </div>
          <button onClick={() => navigate('/app/tuning')}
            className="px-3.5 py-1 rounded-md text-[10px] font-semibold bg-accent text-white whitespace-nowrap">Edit Rules</button>
        </div>
        <SearchBar
          value=""
          onChange={() => {}}
          onSearch={handleSearch}
          onAiGenerate={handleAiGenerate}
          activeFilterCount={activeFilterCount}
          onClearAll={handleClearAll}
        />
      </div>

      {/* Search mode toggle — Filters / Chat / Guided per legacy line 874-888 */}
      <SearchModeToggle mode={state.searchMode} onModeChange={actions.setSearchMode} />

      {/* Filter panel (visible in Filters mode) */}
      {state.searchMode === 'filters' && (
        <div className="space-y-2">
          {/* Filter builder */}
          <FilterBuilder
            values={filterValues}
            onChange={setFilterValues}
            onSearch={handleSearch}
            onSaveFilter={handleSaveFilter}
            collapsed={filterBuilderCollapsed}
            onToggleCollapse={() => setFilterBuilderCollapsed(prev => !prev)}
            onBrowse={handleBrowse}
            usOnly={usOnly}
          />

          {/* Saved searches */}
          <SavedSearches
            items={savedSearchItems}
            onToggle={handleToggleSavedSearch}
            onDelete={handleDeleteSavedSearches}
            onSelectAll={handleSelectAllSavedSearches}
            collapsed={savedSearchesCollapsed}
            onToggleCollapse={() => setSavedSearchesCollapsed(prev => !prev)}
          />

          {/* Trust + AI content filters */}
          <div className="flex items-center gap-2 px-1">
            <TrustFilter
              active={state.trustFilters}
              onChange={actions.setTrustFilters}
            />
            <AiContentFilter
              active={state.aiFilters}
              onChange={actions.setAiFilters}
            />
          </div>

          {/* Sort controls */}
          <SortControls
            sortStack={state.sortStack}
            onToggle={actions.toggleSort}
            onRemove={actions.removeSort}
          />
        </div>
      )}

      {/* Chat panel (visible in Chat mode) */}
      {state.searchMode === 'chat' && (
        <ChatPanel />
      )}

      {/* Guided mode — 3 analysis panels */}
      {state.searchMode === 'guided' && (
        <div className="border border-border rounded-xl bg-bg-card p-6 space-y-4">
          <div className="text-[14px] font-bold text-text">Guided Search</div>
          <div className="text-[12px] text-text-dim mb-2">Step-by-step search builder that walks you through building the perfect filter.</div>
          <div className="flex gap-1 p-[3px] rounded-lg bg-[var(--bg-hover)] w-fit">
            {['Resume Match', 'Company Match', 'Market Analysis'].map((label, i) => (
              <button key={label} className={`px-3.5 py-1 rounded-md text-[11px] font-semibold transition-all border ${i === 0 ? 'bg-accent text-white border-accent' : 'bg-bg-card text-text-dim border-border hover:border-accent'}`}>{label}</button>
            ))}
          </div>
          <div className="bg-bg-input rounded-lg p-5 text-center">
            <div className="text-[13px] font-semibold text-text mb-1">Upload a resume to start</div>
            <div className="text-[11px] text-text-faint mb-3">We'll analyze your experience and suggest matching jobs, companies, and market positions.</div>
            <button onClick={() => navigate('/app/resumes')} className="px-3.5 py-[7px] rounded-lg bg-accent text-white text-[12px] font-semibold">Go to Resumes →</button>
          </div>
        </div>
      )}

      {/* Filter results count */}
      {state.total > 0 && (
        <div className="px-1 text-xs text-text-dim">
          <strong>{state.total.toLocaleString()}</strong> job{state.total !== 1 ? 's' : ''} found
        </div>
      )}

      {/* Job results table */}
      <JobTable
        state={state}
        onSave={handleSave}
        onHide={handleHide}
        onApply={handleApply}
        onPageChange={(p) => actions.setPage(p)}
        savedJobIds={savedJobIds}
        appliedJobIds={appliedJobIds}
        matchScores={matchScores}
        fraudCache={fraudCache}
        aiCache={aiCache}
        levelHierarchy={DEFAULT_LEVEL_HIERARCHY}
      />
    </div>
  );
}

export default FeedPage;
