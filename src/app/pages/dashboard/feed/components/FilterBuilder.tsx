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
}

interface FilterRowProps {
  label: string;
  labelClass?: string;
  children: React.ReactNode;
}

function FilterRow({ label, labelClass, children }: FilterRowProps) {
  return (
    <div className="flex items-start gap-2">
      <span className={`text-xs font-semibold w-10 pt-2 flex-shrink-0 text-right ${labelClass || 'text-text-dim'}`}>
        {label}
      </span>
      <div className="flex-1">{children}</div>
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
      {/* Collapse header */}
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-bg-hover/50 transition-colors"
        onClick={onToggleCollapse}
      >
        <svg
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
        <span className="text-xs font-semibold text-text-dim">Job Filter Builder</span>
      </button>

      {/* Filter rows */}
      {!collapsed && (
        <div className="px-3 pb-3 space-y-2">
          {/* What / Not */}
          <div className="grid grid-cols-2 gap-2">
            <FilterRow label="What">
              <input
                type="text"
                className="w-full px-2 py-1.5 text-xs bg-bg-input border border-border rounded-md text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                placeholder="title, keyword, dept…"
                value={values.what}
                onChange={(e) => update('what', e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </FilterRow>
            <FilterRow label="Not" labelClass="text-red-400/70">
              <input
                type="text"
                className="w-full px-2 py-1.5 text-xs bg-bg-input border border-border rounded-md text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                placeholder="exclude titles…"
                value={values.whatNot}
                onChange={(e) => update('whatNot', e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </FilterRow>
          </div>

          {/* Where / Not */}
          <div className="grid grid-cols-2 gap-2">
            <FilterRow label="Where">
              <input
                type="text"
                className="w-full px-2 py-1.5 text-xs bg-bg-input border border-border rounded-md text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                placeholder="city, state, remote…"
                value={values.where}
                onChange={(e) => update('where', e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </FilterRow>
            <FilterRow label="Not" labelClass="text-red-400/70">
              <input
                type="text"
                className="w-full px-2 py-1.5 text-xs bg-bg-input border border-border rounded-md text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                placeholder="exclude locations…"
                value={values.whereNot}
                onChange={(e) => update('whereNot', e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </FilterRow>
          </div>

          {/* Who / Not */}
          <div className="grid grid-cols-2 gap-2">
            <FilterRow label="Who">
              <input
                type="text"
                className="w-full px-2 py-1.5 text-xs bg-bg-input border border-border rounded-md text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                placeholder="company name…"
                value={values.who}
                onChange={(e) => update('who', e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </FilterRow>
            <FilterRow label="Not" labelClass="text-red-400/70">
              <input
                type="text"
                className="w-full px-2 py-1.5 text-xs bg-bg-input border border-border rounded-md text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                placeholder="exclude companies…"
                value={values.whoNot}
                onChange={(e) => update('whoNot', e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </FilterRow>
          </div>

          {/* When */}
          <div className="grid grid-cols-2 gap-2">
            <FilterRow label="When">
              <input
                type="text"
                className="w-full px-2 py-1.5 text-xs bg-bg-input border border-border rounded-md text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                placeholder="today, 7 days, month…"
                value={values.when}
                onChange={(e) => update('when', e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </FilterRow>
            <div /> {/* Empty space for alignment */}
          </div>

          {/* How Much */}
          <FilterRow label="Pay">
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
