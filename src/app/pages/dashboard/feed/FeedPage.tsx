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
    includeRemote: false,
    includeNoSalary: true,
  });

  // Read legacy data on mount
  const savedJobIds = useMemo(() => getLegacySet('savedJobIds'), [state.jobs]);
  const appliedJobIds = useMemo(() => getLegacySet('appliedJobIds'), [state.jobs]);
  const matchScores = useMemo(() => getLegacyObj('jobMatchScores', {}), [state.jobs]);
  const fraudCache = useMemo(() => getLegacyObj('_fraudScoreCache', {}), [state.jobs]);
  const aiCache = useMemo(() => getLegacyObj('_aiJdCache', {}), [state.jobs]);

  // Load saved searches from legacy on mount
  useEffect(() => {
    setSavedSearchItems(getLegacySavedSearchItems());
  }, []);

  // Trigger initial search on mount
  useEffect(() => {
    actions.search(0);
  }, []);

  // ── Saved search handlers ─────────────────────────────

  const handleToggleSavedSearch = useCallback((id: string) => {
    setSavedSearchItems(prev =>
      prev.map(item =>
        item.id === id ? { ...item, checked: !item.checked } : item
      )
    );
    // Sync to legacy and re-search
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const legacyFilters: any[] = (window as any).savedFilters || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const target = legacyFilters.find((f: any) => f.id === id);
    if (target) target.checked = !target.checked;
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

  const handleDeleteSavedSearches = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setSavedSearchItems(prev => prev.filter(item => !idSet.has(item.id)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).savedFilters = ((window as any).savedFilters || []).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (f: any) => !idSet.has(f.id)
    );
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

  const handleSaveFilter = useCallback(() => {
    // Bridge to legacy save dialog
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const saveDialog = document.getElementById('chat-save-dialog');
    if (saveDialog) saveDialog.classList.remove('u-hidden');
  }, []);

  const handleAiGenerate = useCallback(() => {
    // Bridge to legacy AI filter generation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bj = (window as any);
    if (typeof bj.bjAiSuggestFilters === 'function') {
      bj.bjAiSuggestFilters();
    }
  }, []);

  const handleClearAll = useCallback(() => {
    setFilterValues({
      what: '', whatNot: '', where: '', whereNot: '',
      who: '', whoNot: '', when: '', payMin: '', payMax: '',
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
    } else {
      actions.saveJob(jobId);
    }
  }, [actions, savedJobIds]);

  const handleHide = useCallback((jobId: string) => {
    actions.hideJob(jobId);
  }, [actions]);

  const handleApply = useCallback((jobId: string, url: string) => {
    // Track application
    actions.markApplied(jobId);
    // Open in new tab
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
      {/* Page header */}
      <div>
        <h2 className="text-xl font-bold text-text">Jobs Feed</h2>
        <p className="text-xs text-text-faint mt-0.5">
          Openings aggregated from multiple sources{' '}
          <button type="button" className="text-accent hover:underline">
            How this works →
          </button>
        </p>
      </div>

      {/* Hero stats */}
      <FeedHero stats={state.stats} onPipelineClick={handlePipelineClick} />

      {/* Search mode toggle */}
      <SearchModeToggle mode={state.searchMode} onModeChange={actions.setSearchMode} />

      {/* Filter panel (visible in Filters mode) */}
      {state.searchMode === 'filters' && (
        <div className="space-y-2">
          {/* AI filter CTA + builder header */}
          <SearchBar
            value=""
            onChange={() => {}}
            onSearch={handleSearch}
            onAiGenerate={handleAiGenerate}
            activeFilterCount={activeFilterCount}
            onClearAll={handleClearAll}
          />

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

      {/* Chat panel placeholder (visible in Chat mode) */}
      {state.searchMode === 'chat' && (
        <div className="border border-border rounded-lg p-6 text-center">
          <div className="text-text-faint mb-2">
            <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke="currentColor" strokeWidth={1.5} className="inline-block opacity-40">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div className="text-sm font-semibold text-text-dim mb-1">Describe your ideal role</div>
          <p className="text-xs text-text-faint max-w-sm mx-auto">
            Try: "Senior product manager roles in Austin, TX paying over $150K" or "Remote React developer positions at mid-size companies"
          </p>
          {/* Chat input will be migrated in a follow-up or remain as legacy bridge */}
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
