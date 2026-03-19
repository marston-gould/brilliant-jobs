// ============================================================
// FilterBuilder — Query Builder Panel (SA-014)
// ============================================================
// Collapsible filter form with paired input rows:
// What/Not, Where/Not, Who/Not, When, How Much, Level, Type.
// Uses design system Input component. Zero inline styles.
// ============================================================

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Input, Button } from '@components';
import { supabase } from '@lib/supabase';
import { TagInput } from './TagInput';

// ── Company autocomplete — legacy .company-dropdown ──────────
function CompanyAutocomplete({ value, onChange, placeholder, onKeyDown }: {
  value: string; onChange: (v: string) => void; placeholder: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback((q: string) => {
    if (q.length < 2) { setSuggestions([]); setOpen(false); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await supabase.from('ats_jobs')
          .select('company_name').ilike('company_name', `${q}%`).limit(8) as any;
        if (data?.length) {
          const unique = Array.from(new Set(data.map((r: any) => String(r.company_name)))) as string[];
          setSuggestions(unique.slice(0, 7));
          setOpen(true);
        } else { setSuggestions([]); setOpen(false); }
      } catch { setSuggestions([]); }
    }, 200);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <input type="text"
        className="w-full px-2.5 py-2 text-[13px] bg-bg-input border border-border rounded-lg text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
        placeholder={placeholder} value={value}
        onChange={e => { onChange(e.target.value); search(e.target.value); }}
        onFocus={() => { if (suggestions.length) setOpen(true); }}
        onKeyDown={onKeyDown} />
      {open && suggestions.length > 0 && (
        <div className="absolute z-[100] left-0 right-0 top-full mt-0.5 bg-bg-card border border-border rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.3)] max-h-[220px] overflow-y-auto">
          {suggestions.map(s => (
            <div key={s} className="px-3 py-2 text-[12px] text-text-dim cursor-pointer hover:bg-bg-hover hover:text-text transition-colors border-b border-border/30 last:border-0"
              onClick={() => { onChange(s); setOpen(false); }}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface FilterValues {
  what: string;
  whatNot: string;
  where: string;
  whereNot: string;
  who: string;
  whoNot: string;
  when: string;
  payMin: string;
  payMax: string;
  skills: string;
  dept: string;
  level: string;
  jd: string;
  includeRemote: boolean;
  includeNoSalary: boolean;
}

interface FilterBuilderProps {
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  onSearch: () => void;
  onSaveFilter: (name: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** REM-S13: Browse button callback. Dimension is 'title'|'company'|'location'|'skill'|'dept'|'level'|'jd_keyword'. */
  onBrowse?: (dimension: string, mode: 'include' | 'exclude') => void;
  /** REM-S14: When true, browse overlays show US-Only context banner. */
  usOnly?: boolean;
}

interface FilterRowProps {
  label: string;
  labelClass?: string;
  children: React.ReactNode;
  /** REM-S13: Browse button handler for this row */
  onBrowse?: () => void;
}

function FilterRow({ label, labelClass, children, onBrowse }: FilterRowProps) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={`text-[11px] font-bold uppercase tracking-[0.5px] w-16 min-w-[64px] pt-3 flex-shrink-0 text-right ${labelClass || 'text-text-dim'}`}>
        {label}
      </span>
      <div className="flex-1 relative">
        {children}
        {onBrowse && (
          <button
            type="button"
            onClick={onBrowse}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-accent hover:text-accent/80 font-semibold px-1.5 py-0.5 rounded hover:bg-accent/10 transition-colors"
          >
            Browse
          </button>
        )}
      </div>
    </div>
  );
}

export function FilterBuilder({
  values,
  onChange,
  onSearch,
  onSaveFilter,
  collapsed = false,
  onToggleCollapse,
  onBrowse,
  usOnly,
}: FilterBuilderProps) {
  // Direct update — no useCallback to avoid stale closure over `values`
  const update = (field: keyof FilterValues, value: string | boolean) => {
    onChange({ ...values, [field]: value });
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onSearch();
      }
    },
    [onSearch]
  );

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Collapse header — legacy .qb-collapse-header */}
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2.5 text-left text-[13px] font-semibold text-text-dim hover:bg-bg-hover/50 transition-colors select-none"
        onClick={onToggleCollapse}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width={14}
          height={14}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={`text-text-faint transition-transform ${collapsed ? '' : 'rotate-180'}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span className="text-[13px] font-semibold text-text-dim">Job Filter Builder</span>
      </button>

      {/* Filter rows */}
      {!collapsed && (
        <div className="px-3 pb-3 space-y-2">
          {/* REM-S14: US-Only context banner when tuning is active */}
          {usOnly && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] text-accent bg-accent/5 border border-accent/15 rounded-md">
              <span>🇺🇸</span>
              <span>US-Only filter active — browse results show US-based data only</span>
            </div>
          )}

          {/* qb-hint — legacy keyboard shortcut hints */}
          <div className="text-[11px] text-text-faint leading-relaxed">
            Separate terms with commas. Use <kbd className="inline-block px-1 py-0.5 bg-bg-input border border-border rounded text-[10px] font-mono text-text-dim">OR</kbd> between alternatives.
            Prefix with <kbd className="inline-block px-1 py-0.5 bg-bg-input border border-border rounded text-[10px] font-mono text-text-dim">!</kbd> to exclude.
          </div>
          {/* What / Not */}
          <div className="grid grid-cols-2 gap-2">
            <FilterRow label="What" labelClass="text-text-faint" onBrowse={onBrowse ? () => onBrowse('title', 'include') : undefined}>
              <TagInput
                value={values.what}
                onChange={(v) => update('what', v)}
                placeholder="title, keyword, dept…"
                onKeyDown={handleKeyDown}
                aria-label="Job title or keyword"
                colorScheme="accent"
              />
            </FilterRow>
            <FilterRow label="Not" labelClass="text-text-faint" onBrowse={onBrowse ? () => onBrowse('title', 'exclude') : undefined}>
              <TagInput
                value={values.whatNot}
                onChange={(v) => update('whatNot', v)}
                placeholder="exclude titles…"
                onKeyDown={handleKeyDown}
                colorScheme="not"
              />
            </FilterRow>
          </div>

          {/* Where / Not */}
          <div className="grid grid-cols-2 gap-2">
            <FilterRow label="Where" labelClass="text-text-faint">
              <TagInput
                value={values.where}
                onChange={(v) => update('where', v)}
                placeholder="city, state, remote…"
                onKeyDown={handleKeyDown}
                colorScheme="location"
              />
            </FilterRow>
            <FilterRow label="Not" labelClass="text-text-faint">
              <TagInput
                value={values.whereNot}
                onChange={(v) => update('whereNot', v)}
                placeholder="exclude locations…"
                onKeyDown={handleKeyDown}
                colorScheme="not"
              />
            </FilterRow>
          </div>

          {/* Who / Not */}
          <div className="grid grid-cols-2 gap-2">
            <FilterRow label="Who" labelClass="text-text-faint" onBrowse={onBrowse ? () => onBrowse('company', 'include') : undefined}>
              <CompanyAutocomplete
                value={values.who}
                onChange={(v) => update('who', v)}
                placeholder="company name…"
                onKeyDown={handleKeyDown}
              />
            </FilterRow>
            <FilterRow label="Not" labelClass="text-text-faint" onBrowse={onBrowse ? () => onBrowse('company', 'exclude') : undefined}>
              <TagInput
                value={values.whoNot}
                onChange={(v) => update('whoNot', v)}
                placeholder="exclude companies…"
                onKeyDown={handleKeyDown}
                colorScheme="not"
              />
            </FilterRow>
          </div>

          {/* When / (empty) */}
          <div className="grid grid-cols-2 gap-2">
            <FilterRow label="When" labelClass="text-text-faint">
              <input
                type="text"
                className="w-full px-2.5 py-2 text-[13px] bg-bg-input border border-border rounded-lg text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                placeholder="today, 7 days, month…"
                value={values.when}
                onChange={(e) => update('when', e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </FilterRow>
            <div />
          </div>

          {/* How Much — Min on left (positive column), Max on right (NOT column) */}
          <div className="grid grid-cols-2 gap-2">
            <FilterRow label="HOW MUCH" labelClass="text-text-faint">
              <div className="flex items-center bg-bg-input border border-border rounded-lg px-2.5 py-2 focus-within:border-accent transition-colors">
                <span className="text-[13px] text-text-faint mr-1 flex-shrink-0">$</span>
                <input
                  type="text"
                  className="flex-1 min-w-0 bg-transparent border-none outline-none text-[13px] text-text placeholder:text-text-faint"
                  placeholder="Min"
                  value={values.payMin}
                  onChange={(e) => update('payMin', e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>
            </FilterRow>
            <FilterRow label="–" labelClass="text-text-faint text-center">
              <div className="flex items-center bg-bg-input border border-border rounded-lg px-2.5 py-2 focus-within:border-accent transition-colors">
                <span className="text-[13px] text-text-faint mr-1 flex-shrink-0">$</span>
                <input
                  type="text"
                  className="flex-1 min-w-0 bg-transparent border-none outline-none text-[13px] text-text placeholder:text-text-faint"
                  placeholder="Max"
                  value={values.payMax}
                  onChange={(e) => update('payMax', e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>
            </FilterRow>
          </div>

          {/* Skills / Dept — legacy lines 1048-1063 */}
          <div className="grid grid-cols-2 gap-2">
            <FilterRow label="Skills" onBrowse={onBrowse ? () => onBrowse('skills', 'include') : undefined}>
              <TagInput
                value={values.skills}
                onChange={(v) => update('skills', v)}
                placeholder="python, react, sql…"
                onKeyDown={handleKeyDown}
                colorScheme="purple"
              />
            </FilterRow>
            <FilterRow label="Dept" onBrowse={onBrowse ? () => onBrowse('dept', 'include') : undefined}>
              <TagInput
                value={values.dept}
                onChange={(v) => update('dept', v)}
                placeholder="engineering, marketing, sales…"
                onKeyDown={handleKeyDown}
                colorScheme="who"
              />
            </FilterRow>
          </div>

          {/* Level / JD Contains — legacy lines 1064-1080 */}
          <div className="grid grid-cols-2 gap-2">
            <FilterRow label="Level" onBrowse={onBrowse ? () => onBrowse('level', 'include') : undefined}>
              <TagInput
                value={values.level}
                onChange={(v) => update('level', v)}
                placeholder="senior, junior, executive…"
                onKeyDown={handleKeyDown}
                colorScheme="when"
              />
            </FilterRow>
            <FilterRow label="JD Contains" onBrowse={onBrowse ? () => onBrowse('jd', 'include') : undefined}>
              <TagInput
                value={values.jd}
                onChange={(v) => update('jd', v)}
                placeholder="search descriptions… e.g. 'series B'"
                onKeyDown={handleKeyDown}
                colorScheme="pay"
              />
            </FilterRow>
          </div>

          {/* Options row */}
          <div className="flex items-center gap-4 pl-12 pt-1">
            <label className="flex items-center gap-1.5 text-[10px] text-text-faint cursor-pointer">
              <input
                type="checkbox"
                checked={values.includeRemote}
                onChange={(e) => update('includeRemote', e.target.checked)}
                className="cursor-pointer"
              />
              Include remote jobs
            </label>
            <label className="flex items-center gap-1.5 text-[10px] text-text-faint cursor-pointer">
              <input
                type="checkbox"
                checked={values.includeNoSalary}
                onChange={(e) => update('includeNoSalary', e.target.checked)}
                className="cursor-pointer"
              />
              Include jobs without salary
            </label>
          </div>

          {/* Action row — legacy save-filter-row: inline name + Save, Search separate */}
          <div className="flex items-center gap-3 pl-12 pt-1">
            <Button variant="primary" size="sm" onClick={onSearch}>
              Search
            </Button>
            <div className="flex items-center gap-1.5 border-l border-border pl-3">
              <span className="text-[10px] font-semibold text-text-faint uppercase tracking-wide whitespace-nowrap">Save:</span>
              <input
                type="text"
                className="px-2 py-1 text-[12px] bg-bg-input border border-border rounded-md text-text placeholder:text-text-faint focus:border-accent focus:outline-none w-[140px]"
                placeholder="name this filter…"
                maxLength={40}
                id="save-filter-inline-name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const input = e.currentTarget;
                    if (input.value.trim()) {
                      onSaveFilter(input.value.trim());
                      input.value = '';
                    }
                  }
                }}
              />
              <button
                type="button"
                className="px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/10 rounded-md transition-colors"
                onClick={() => {
                  const input = document.getElementById('save-filter-inline-name') as HTMLInputElement;
                  if (input?.value.trim()) {
                    onSaveFilter(input.value.trim());
                    input.value = '';
                  }
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FilterBuilder;
