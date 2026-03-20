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
import { Sparkles, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@app/components';
import { JobDetailModal } from '@app/components/JobDetailModal';
import { CompanyBrowseModal } from '@app/components/CompanyBrowseModal';
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
    const { data } = await supabase.from('user_filters').select('*').eq('user_id', user.id).order('sort_order', { ascending: true });
    if (!data?.length) return getLegacySavedSearchItems();

    const items: SavedSearchItem[] = data.map((f: any, i: number) => ({
      id: f.id,
      name: f.name || `Search ${i + 1}`,
      color: f.filter_data?._filterColor || FILTER_COLORS[i % FILTER_COLORS.length] || '#3b82f6',
      checked: true,
      filterNum: f.filter_data?._filterNum || String(i + 1),
      _filterData: f.filter_data, // stash for localStorage sync
    }));

    // Write checked filters to localStorage so the search engine finds them
    const lsFilters = items.filter(i => i.checked).map((item, idx) => {
      const fd = (item as any)._filterData || {};
      return {
        id: item.id,
        name: item.name,
        color: item.color,
        checked: true,
        // Pill format fields
        whatPills: fd.whatPills || [],
        whatNotPills: fd.whatNotPills || [],
        wherePills: fd.wherePills || [],
        whereNotPills: fd.whereNotPills || [],
        whoPills: fd.whoPills || [],
        whoNotPills: fd.whoNotPills || [],
        whenPills: fd.whenPills || [],
        payPills: fd.payPills || [],
        jdPills: fd.jdPills || [],
        levelPills: fd.levelPills || [],
        typePills: fd.typePills || [],
        scorePills: fd.scorePills || [],
        skillsPills: fd.skillsPills || [],
        deptPills: fd.deptPills || [],
        // Flat string fields (from Filter Builder save)
        what: fd.what || '',
        whatNot: fd.whatNot || '',
        where: fd.where || '',
        whereNot: fd.whereNot || '',
        who: fd.who || '',
        whoNot: fd.whoNot || '',
        when: fd.when || '',
        payMin: fd.payMin || '',
        payMax: fd.payMax || '',
        level: fd.level || '',
        jd: fd.jd || '',
        skills: fd.skills || '',
        dept: fd.dept || '',
        includeRemote: fd.includeRemote || fd.remote || false,
        includeNoSalary: fd.includeNoSalary !== false,
        _filterNum: item.filterNum || String(idx + 1),
        _filterColor: item.color,
      };
    });
    try { localStorage.setItem('bj_saved_filters', JSON.stringify(lsFilters)); } catch {}

    return items;
  } catch { return getLegacySavedSearchItems(); }
}

// ── Page Component ────────────────────────────────────────

export function FeedPage() {
  const navigate = useNavigate();
  const [state, actions] = useFeedSearch();

  // Local UI state
  const [filterBuilderCollapsed, setFilterBuilderCollapsed] = useState(false);
  const [savedSearchesCollapsed, setSavedSearchesCollapsed] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [companyBrowseOpen, setCompanyBrowseOpen] = useState(false);
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

  // Load saved searches from Supabase (also syncs to localStorage for search engine)
  useEffect(() => {
    loadSavedFiltersFromSupabase().then(items => {
      setSavedSearchItems(items);
    });
  }, []);

  // Trigger initial search on mount (slight delay to let load complete)
  useEffect(() => {
    const t = setTimeout(() => actions.search(0), 500);
    return () => clearTimeout(t);
  }, []);

  // ── Saved search handlers ─────────────────────────────

  const handleToggleSavedSearch = useCallback((id: string) => {
    setSavedSearchItems(prev => {
      const updated = prev.map(item =>
        item.id === id ? { ...item, checked: !item.checked } : item
      );

      // Sync to localStorage synchronously from cached _filterData
      const lsFilters = updated.filter(i => i.checked).map((item, idx) => {
        const fd = (item as any)._filterData || {};
        return {
          id: item.id, name: item.name, color: item.color, checked: true,
          whatPills: fd.whatPills || [], whatNotPills: fd.whatNotPills || [],
          wherePills: fd.wherePills || [], whereNotPills: fd.whereNotPills || [],
          whoPills: fd.whoPills || [], whoNotPills: fd.whoNotPills || [],
          whenPills: fd.whenPills || [], payPills: fd.payPills || [],
          jdPills: fd.jdPills || [], levelPills: fd.levelPills || [],
          typePills: fd.typePills || [], scorePills: fd.scorePills || [],
          skillsPills: fd.skillsPills || [], deptPills: fd.deptPills || [],
          includeRemote: fd.includeRemote || false,
          includeNoSalary: fd.includeNoSalary !== false,
          _filterNum: item.filterNum || String(idx + 1),
          _filterColor: item.color,
        };
      });
      try { localStorage.setItem('bj_saved_filters', JSON.stringify(lsFilters)); } catch {}

      // Apply toggled filter values to the filter builder UI
      const toggled = updated.find(i => i.id === id);
      if (toggled?.checked) {
        const fd = (toggled as any)._filterData;
        if (fd) {
          const mapped: Record<string, any> = {};
          if (fd.whatPills?.length) mapped.what = fd.whatPills.map((p: any) => p.values?.[0]).filter(Boolean).join(', ');
          if (fd.whatNotPills?.length) mapped.whatNot = fd.whatNotPills.map((p: any) => p.values?.[0]).filter(Boolean).join(', ');
          if (fd.wherePills?.length) mapped.where = fd.wherePills.map((p: any) => p.values?.[0]).filter(Boolean).join(', ');
          if (fd.payPills?.length) { mapped.payMin = fd.payPills[0]?.min || ''; mapped.payMax = fd.payPills[0]?.max || ''; }
          if (fd.levelPills?.length) mapped.level = fd.levelPills.map((p: any) => p.values?.[0]).filter(Boolean).join(', ');
          if (fd.whenPills?.length) mapped.when = fd.whenPills[0]?.values?.[0] || '';
          if (fd.includeRemote) mapped.remote = true;
          setFilterValues(prev => ({ ...prev, ...mapped }));
        }
      }

      return updated;
    });
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
        await supabase.from('user_filters').delete().eq('id', id);
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

  const handleSaveFilter = useCallback(async (name: string) => {
    if (!name) return;
    try {
      const { supabase, getUser } = await import('@app/lib/supabase');
      const user = await getUser();
      if (!user) {
        console.error('Save filter: No authenticated user');
        (window as any).__bjToast?.('Please sign in to save searches', 'error');
        return;
      }
      const { error } = await supabase.from('user_filters').insert({
        user_id: user.id,
        name,
        filter_data: filterValues,
        sort_order: savedSearchItems.length,
      });
      if (error) {
        console.error('Save filter DB error:', error);
        (window as any).__bjToast?.('Failed to save search — ' + error.message, 'error');
        return;
      }
      const updated = await loadSavedFiltersFromSupabase();
      setSavedSearchItems(updated);
      (window as any).__bjToast?.(`Saved "${name}"`, 'success');
      // Track feature usage on filter save
      import('@app/hooks/useDiscovery').then(({ recordFeatureUsage }) => {
        const fd = filterValues as Record<string, unknown>;
        // salary_filter_used: any pay pill present
        const payPills = (fd.payPills as unknown[]) || [];
        if (payPills.length > 0) recordFeatureUsage('salary_filter_used');
        // not_filter_set: any NOT pill present
        const notPills = (fd.whatNotPills as unknown[]) || [];
        const whereNotPills = (fd.whereNotPills as unknown[]) || [];
        if (notPills.length > 0 || whereNotPills.length > 0) recordFeatureUsage('not_filter_set');
      });
      // Search immediately after saving — legacy behavior
      actions.search(0);
    } catch (e) {
      console.error('Save filter failed:', e);
      (window as any).__bjToast?.('Failed to save search', 'error');
    }
  }, [filterValues, savedSearchItems.length, actions]);

  const handleAiGenerate = useCallback(async () => {
    (window as any).__bjToast?.('Analyzing your resume…', 'info');
    try {
      const { callGateway } = await import('@app/lib/supabase');
      const result = await callGateway<any>('admin-filter-prompt', { action: 'suggest' }, { timeout: 20000 });
      if (result?.filters) {
        setFilterValues(prev => ({ ...prev, ...result.filters }));
        (window as any).__bjToast?.('AI filters applied to your search', 'success');
      } else {
        (window as any).__bjToast?.('No filter suggestions generated. Upload a resume first.', 'info');
      }
    } catch {
      (window as any).__bjToast?.('Filter generation failed', 'info');
    }
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
  const [browseDimension, setBrowseDimension] = useState<string>('');
  const handleBrowse = useCallback((dimension: string, _mode: 'include' | 'exclude') => {
    setBrowseDimension(dimension);
    setCompanyBrowseOpen(true);
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
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-accent/20 bg-accent/[0.03]">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
            <SlidersHorizontal className="w-4 h-4 text-accent" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-bold text-accent">Adjust Global Rules</div>
            <div className="text-[10px] text-text-faint leading-snug">Block companies, titles, and locations across all filters</div>
          </div>
          <button onClick={() => navigate('/app/tuning')}
            className="px-4 py-[7px] rounded-lg text-[11px] font-semibold bg-accent text-white whitespace-nowrap">Edit Rules</button>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-accent/20 bg-gradient-to-r from-purple-500/[0.03] to-accent/[0.03]">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/15 to-accent/15 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-accent" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-bold text-accent">Generate filters from your resume</div>
            <div className="text-[10px] text-text-faint leading-snug">AI reads your resume and creates keyword, location, and level filters</div>
          </div>
          <button onClick={handleAiGenerate}
            className="px-4 py-[7px] rounded-lg text-[11px] font-semibold bg-accent text-white whitespace-nowrap">Generate</button>
        </div>
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

          {/* Improve Filters — legacy bjImproveFiltersFromHidden */}
          {state.total > 0 && (
            <button onClick={async () => {
              (window as any).__bjToast?.('Analyzing hidden jobs for filter suggestions...', 'info');
              try {
                const { callGateway } = await import('@app/lib/supabase');
                const result = await callGateway('improve-filters', {});
                if (result?.suggestions?.length) {
                  (window as any).__bjToast?.(`${result.suggestions.length} filter suggestions found`, 'success');
                } else {
                  (window as any).__bjToast?.('No new suggestions — hide more poor matches first', 'info');
                }
              } catch { (window as any).__bjToast?.('Could not analyze hidden jobs', 'info'); }
            }}
              className="ml-auto px-2.5 py-[3px] text-[10px] font-semibold rounded-md border border-warm/30 text-warm hover:bg-warm/10 transition-all"
              style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(239,68,68,0.1))' }}
              title="Analyze hidden jobs to suggest NOT filters">
              🔧 Improve Filters
            </button>
          )}
        </div>
      )}

      {/* Chat panel (visible in Chat mode) */}
      {state.searchMode === 'chat' && (
        <ChatPanel />
      )}

      {/* Guided mode — conversational AI job search */}
      {state.searchMode === 'guided' && (
        <div className="border border-border rounded-xl bg-bg-card overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-border bg-gradient-to-r from-accent/5 to-purple-500/5">
            <div className="text-[14px] font-bold text-text">Guided Job Search</div>
            <div className="text-[11px] text-text-faint">Tell me what you're looking for and I'll build your search filters.</div>
          </div>
          {/* Chat-like interface */}
          <div className="p-5 space-y-4 min-h-[300px] max-h-[500px] overflow-y-auto">
            {/* AI greeting */}
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-accent" strokeWidth={2} />
              </div>
              <div className="flex-1 bg-bg-input rounded-lg rounded-tl-sm px-4 py-3 text-[13px] text-text-dim leading-relaxed">
                Hi! I can help you build the perfect job search. Tell me about your ideal role — what titles are you targeting, where do you want to work, and what salary range matters to you?
                <div className="flex gap-2 mt-3 flex-wrap">
                  {['Senior Engineer, Remote, $150K+', 'Marketing Director in NYC', 'Product Manager at startups'].map(suggestion => (
                    <button key={suggestion} onClick={async () => {
                      try {
                        const { callGateway } = await import('@app/lib/supabase');
                        const result = await callGateway('chat-job-search', { message: suggestion, mode: 'guided' });
                        if (result?.filters) setFilterValues((prev: any) => ({ ...prev, ...result.filters }));
                        actions.setSearchMode('filters');
                      } catch { /* fallback */ }
                    }} className="text-[11px] px-3 py-1.5 rounded-full border border-accent/20 text-accent hover:bg-accent/5 transition-colors">
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {/* Input */}
          <div className="px-5 py-3 border-t border-border flex gap-2">
            <input type="text" placeholder="Describe your ideal role..." className="flex-1 px-3 py-2 rounded-lg bg-bg-input border border-border text-[13px] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                  const msg = (e.target as HTMLInputElement).value.trim();
                  (e.target as HTMLInputElement).value = '';
                  try {
                    const { callGateway } = await import('@app/lib/supabase');
                    const result = await callGateway('chat-job-search', { message: msg, mode: 'guided' });
                    if (result?.filters) { setFilterValues((prev: any) => ({ ...prev, ...result.filters })); actions.setSearchMode('filters'); handleSearch(); }
                  } catch { /* fallback */ }
                }
              }} />
            <button className="px-4 py-2 rounded-lg bg-accent text-white text-[12px] font-semibold whitespace-nowrap">Send</button>
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
        onSort={actions.toggleSort}
        onOpenModal={(id: string) => setSelectedJobId(id)}
        savedJobIds={savedJobIds}
        appliedJobIds={appliedJobIds}
        matchScores={matchScores}
        fraudCache={fraudCache}
        aiCache={aiCache}
        levelHierarchy={DEFAULT_LEVEL_HIERARCHY}
      />

      {/* Job Detail Modal — legacy: openJobModal() */}
      <JobDetailModal jobId={selectedJobId} onClose={() => setSelectedJobId(null)} />

      {/* Company Browse Modal — legacy: openCompanyBrowser() (58 refs) */}
      <CompanyBrowseModal open={companyBrowseOpen} onClose={() => { setCompanyBrowseOpen(false); setBrowseDimension(''); }} dimension={browseDimension} />
    </div>
  );
}

export default FeedPage;
