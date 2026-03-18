// ============================================================
// CompanyBrowseModal — Browse & filter companies alphabetically
// ============================================================
// Legacy: cb-header, cb-search, cb-mode-toggle, cb-alpha-nav,
// cb-letter-group, cb-company-row, cb-toggle (include/exclude)
// Loads companies from ats_jobs distinct company_name via Supabase.
// ============================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal } from '@app/components/Modal';
import { supabase } from '@lib/supabase';

interface Company {
  name: string;
  jobCount: number;
  status: 'neutral' | 'included' | 'excluded';
}

interface CompanyBrowseModalProps {
  open: boolean;
  onClose: () => void;
  onSelect?: (companies: string[], mode: 'include' | 'exclude') => void;
  dimension?: string;
}

const DIMENSION_LABELS: Record<string, string> = {
  company: 'Browse Companies', title: 'Browse Job Titles', skills: 'Browse Skills',
  dept: 'Browse Departments', level: 'Browse Levels', location: 'Browse Locations',
};
const DIMENSION_COLUMNS: Record<string, string> = {
  company: 'company_name', title: 'title', skills: 'department', dept: 'department', level: 'level', location: 'location',
};

export function CompanyBrowseModal({ open, onClose, onSelect, dimension = 'company' }: CompanyBrowseModalProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'all' | 'included' | 'excluded'>('all');
  const [loading, setLoading] = useState(false);
  const [activeLetter, setActiveLetter] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const col = DIMENSION_COLUMNS[dimension] || 'company_name';
    (async () => {
      try {
        if (dimension === 'company') {
          const { data } = await supabase.rpc('get_company_list') as any;
          if (data?.length) {
            setCompanies(data.map((c: any) => ({ name: c.company_name, jobCount: c.job_count || 0, status: 'neutral' as const })));
            setLoading(false);
            return;
          }
        }
      } catch { /* fallback below */ }
      try {
        const { data } = await supabase.from('ats_jobs').select(col).limit(1000) as any;
        if (data?.length) {
          const counts: Record<string, number> = {};
          data.forEach((r: any) => { const v = r[col]; if (v) counts[v] = (counts[v] || 0) + 1; });
          setCompanies(Object.entries(counts).map(([name, jobCount]) => ({ name, jobCount, status: 'neutral' as const })).sort((a, b) => a.name.localeCompare(b.name)));
        }
      } catch { /* empty */ }
      setLoading(false);
    })();
  }, [open]);

  const toggleStatus = useCallback((name: string) => {
    setCompanies(prev => prev.map(c =>
      c.name === name ? { ...c, status: c.status === 'neutral' ? 'included' : c.status === 'included' ? 'excluded' : 'neutral' } : c
    ));
  }, []);

  const filtered = useMemo(() => {
    let list = companies;
    if (search) list = list.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
    if (mode === 'included') list = list.filter(c => c.status === 'included');
    if (mode === 'excluded') list = list.filter(c => c.status === 'excluded');
    return list;
  }, [companies, search, mode]);

  const grouped = useMemo(() => {
    const groups: Record<string, Company[]> = {};
    filtered.forEach(c => {
      const letter = (c.name[0] || '#').toUpperCase();
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(c);
    });
    return groups;
  }, [filtered]);

  const letters = useMemo(() => {
    const all = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const active = new Set(Object.keys(grouped));
    return all.map(l => ({ letter: l, has: active.has(l) }));
  }, [grouped]);

  const includedCount = companies.filter(c => c.status === 'included').length;
  const excludedCount = companies.filter(c => c.status === 'excluded').length;

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title={DIMENSION_LABELS[dimension] || 'Browse'} size="lg">
      <div className="w-[90vw] max-w-[600px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex-shrink-0">
          <div className="text-[15px] font-bold text-text mb-3">Browse Companies</div>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search companies…" className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-border bg-bg-input text-[13px] text-text focus:border-accent focus:outline-none" />
            <div className="flex gap-0 rounded-lg overflow-hidden border border-border">
              {(['all', 'included', 'excluded'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-3 py-1.5 text-[12px] font-semibold transition-all ${mode === m ? 'bg-accent text-white' : 'bg-bg-input text-text-dim'}`}>
                  {m === 'all' ? 'All' : m === 'included' ? `✓ (${includedCount})` : `✕ (${excludedCount})`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Alpha nav */}
        <div className="flex flex-wrap gap-[3px] px-5 py-2 border-b border-border flex-shrink-0">
          {letters.map(({ letter, has }) => (
            <button key={letter} onClick={() => { if (has) { setActiveLetter(letter); document.getElementById(`cb-${letter}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }}
              className={`text-[11px] font-bold px-1.5 py-0.5 rounded transition-all ${
                has ? (activeLetter === letter ? 'bg-accent text-white' : 'text-accent hover:bg-accent/10 cursor-pointer')
                : 'text-text-faint opacity-35'
              }`}>{letter}</button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-2" style={{ maxHeight: '55vh' }}>
          {loading ? (
            <div className="text-center py-12 text-text-faint text-[13px]">Loading companies…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-text-faint text-[13px]">No companies found</div>
          ) : (
            Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([letter, items]) => (
              <div key={letter} className="mb-5" id={`cb-${letter}`}>
                <div className="text-[18px] font-bold text-accent py-1 pb-1.5 border-b border-border mb-2 sticky top-0 bg-bg-card z-[2]">{letter}</div>
                {items.map(c => (
                  <div key={c.name} className="flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg cursor-pointer text-[13px] hover:bg-bg-hover transition-colors"
                    onClick={() => toggleStatus(c.name)}>
                    <div className={`w-[22px] h-[22px] rounded flex items-center justify-center flex-shrink-0 text-[12px] border-[1.5px] transition-all ${
                      c.status === 'included' ? 'bg-green border-green text-white' :
                      c.status === 'excluded' ? 'bg-red border-red text-white' :
                      'border-border'
                    }`}>
                      {c.status === 'included' ? '✓' : c.status === 'excluded' ? '✕' : ''}
                    </div>
                    <span className="flex-1 font-medium text-text">{c.name}</span>
                    <span className="text-[11px] text-text-faint whitespace-nowrap">{c.jobCount} job{c.jobCount !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {(includedCount > 0 || excludedCount > 0) && (
          <div className="px-5 py-3 border-t border-border flex items-center gap-2 flex-shrink-0">
            <span className="text-[12px] font-semibold text-text-dim">
              {includedCount > 0 && <span className="text-green">{includedCount} included</span>}
              {includedCount > 0 && excludedCount > 0 && ' · '}
              {excludedCount > 0 && <span className="text-red">{excludedCount} excluded</span>}
            </span>
            <button onClick={() => {
              const included = companies.filter(c => c.status === 'included').map(c => c.name);
              const excluded = companies.filter(c => c.status === 'excluded').map(c => c.name);
              if (included.length) onSelect?.(included, 'include');
              if (excluded.length) onSelect?.(excluded, 'exclude');
              onClose();
            }} className="ml-auto px-4 py-2 rounded-lg bg-accent text-white text-[12px] font-semibold">Apply Selections</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default CompanyBrowseModal;
