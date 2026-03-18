// ============================================================
// FilterBuilder — Query Builder Panel (SA-014)
// ============================================================
// Collapsible filter form with paired input rows:
// What/Not, Where/Not, Who/Not, When, How Much, Level, Type.
// Uses design system Input component. Zero inline styles.
// ============================================================

import React, { useState, useCallback } from 'react';
import { Input, Button } from '@components';

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
  onSaveFilter: () => void;
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
  const update = useCallback(
    (field: keyof FilterValues, value: string | boolean) => {
      onChange({ ...values, [field]: value });
    },
    [values, onChange]
  );

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
            <FilterRow label="What" labelClass="text-accent" onBrowse={onBrowse ? () => onBrowse('title', 'include') : undefined}>
              <input
                type="text"
                className="w-full px-2.5 py-2 text-[13px] bg-bg-input border border-border rounded-lg text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                placeholder="title, keyword, dept…" aria-label="Job title or keyword"
                value={values.what}
                onChange={(e) => update('what', e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </FilterRow>
            <FilterRow label="Not" labelClass="text-text-faint" onBrowse={onBrowse ? () => onBrowse('title', 'exclude') : undefined}>
              <input
                type="text"
                className="w-full px-2.5 py-2 text-[13px] bg-bg-input border border-border rounded-lg text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                placeholder="exclude titles…"
                value={values.whatNot}
                onChange={(e) => update('whatNot', e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </FilterRow>
          </div>

          {/* Where / Not */}
          <div className="grid grid-cols-2 gap-2">
            <FilterRow label="Where" labelClass="text-warm">
              <input
                type="text"
                className="w-full px-2.5 py-2 text-[13px] bg-bg-input border border-border rounded-lg text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                placeholder="city, state, remote…"
                value={values.where}
                onChange={(e) => update('where', e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </FilterRow>
            <FilterRow label="Not" labelClass="text-text-faint">
              <input
                type="text"
                className="w-full px-2.5 py-2 text-[13px] bg-bg-input border border-border rounded-lg text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                placeholder="exclude locations…"
                value={values.whereNot}
                onChange={(e) => update('whereNot', e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </FilterRow>
          </div>

          {/* Who / Not */}
          <div className="grid grid-cols-2 gap-2">
            <FilterRow label="Who" labelClass="text-pink" onBrowse={onBrowse ? () => onBrowse('company', 'include') : undefined}>
              <input
                type="text"
                className="w-full px-2.5 py-2 text-[13px] bg-bg-input border border-border rounded-lg text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                placeholder="company name…"
                value={values.who}
                onChange={(e) => update('who', e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </FilterRow>
            <FilterRow label="Not" labelClass="text-text-faint" onBrowse={onBrowse ? () => onBrowse('company', 'exclude') : undefined}>
              <input
                type="text"
                className="w-full px-2.5 py-2 text-[13px] bg-bg-input border border-border rounded-lg text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                placeholder="exclude companies…"
                value={values.whoNot}
                onChange={(e) => update('whoNot', e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </FilterRow>
          </div>

          {/* When */}
          <div className="grid grid-cols-2 gap-2">
            <FilterRow label="When" labelClass="text-purple">
              <input
                type="text"
                className="w-full px-2.5 py-2 text-[13px] bg-bg-input border border-border rounded-lg text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                placeholder="today, 7 days, month…"
                value={values.when}
                onChange={(e) => update('when', e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </FilterRow>
            <div /> {/* Empty space for alignment */}
          </div>

          {/* How Much */}
          <FilterRow label="Pay" labelClass="text-green">
            <div className="flex items-center gap-1">
              <span className="text-xs text-text-faint">$</span>
              <input
                type="text"
                className="w-[70px] px-2 py-1.5 text-xs bg-bg-input border border-border rounded-md text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                placeholder="Min"
                value={values.payMin}
                onChange={(e) => update('payMin', e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <span className="text-xs text-text-faint">–</span>
              <span className="text-xs text-text-faint">$</span>
              <input
                type="text"
                className="w-[70px] px-2 py-1.5 text-xs bg-bg-input border border-border rounded-md text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                placeholder="Max"
                value={values.payMax}
                onChange={(e) => update('payMax', e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
          </FilterRow>

          {/* Skills / Dept — legacy lines 1048-1063 */}
          <div className="grid grid-cols-2 gap-2">
            <FilterRow label="Skills" onBrowse={onBrowse ? () => onBrowse('skills', 'include') : undefined}>
              <input
                type="text"
                className="w-full px-2.5 py-2 text-[13px] bg-bg-input border border-border rounded-lg text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                placeholder="python, react, sql…"
                value={values.skills}
                onChange={(e) => update('skills', e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </FilterRow>
            <FilterRow label="Dept" onBrowse={onBrowse ? () => onBrowse('dept', 'include') : undefined}>
              <input
                type="text"
                className="w-full px-2.5 py-2 text-[13px] bg-bg-input border border-border rounded-lg text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                placeholder="engineering, marketing, sales…"
                value={values.dept}
                onChange={(e) => update('dept', e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </FilterRow>
          </div>

          {/* Level / JD Contains — legacy lines 1064-1080 */}
          <div className="grid grid-cols-2 gap-2">
            <FilterRow label="Level" onBrowse={onBrowse ? () => onBrowse('level', 'include') : undefined}>
              <input
                type="text"
                className="w-full px-2.5 py-2 text-[13px] bg-bg-input border border-border rounded-lg text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                placeholder="senior, junior, executive…"
                value={values.level}
                onChange={(e) => update('level', e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </FilterRow>
            <FilterRow label="JD Contains" onBrowse={onBrowse ? () => onBrowse('jd', 'include') : undefined}>
              <input
                type="text"
                className="w-full px-2.5 py-2 text-[13px] bg-bg-input border border-border rounded-lg text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                placeholder="search descriptions… e.g. 'series B'"
                value={values.jd}
                onChange={(e) => update('jd', e.target.value)}
                onKeyDown={handleKeyDown}
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

          {/* Action buttons */}
          <div className="flex items-center gap-2 pl-12 pt-1">
            <Button variant="primary" size="sm" onClick={onSearch}>
              Search
            </Button>
            <Button variant="ghost" size="sm" onClick={onSaveFilter}>
              Save Filter
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default FilterBuilder;
