// ============================================================
// SortControls — Multi-Sort Pill System (SA-014)
// ============================================================
// Sortable fields with direction toggle. Matches legacy sort
// pill UX: click to add, click arrow to toggle dir, × to remove.
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import type { SortEntry } from '../hooks/useFeedSearch';

interface SortControlsProps {
  sortStack: SortEntry[];
  onToggle: (field: string) => void;
  onRemove: (field: string) => void;
}

const SORT_OPTIONS: Array<{ field: string; label: string; title?: string }> = [
  { field: 'title', label: 'Title' },
  { field: 'company_name', label: 'Company' },
  { field: 'location', label: 'Location' },
  { field: 'updated_at', label: 'Days' },
  { field: 'level', label: 'Level' },
  { field: 'salary_max', label: 'Salary' },
  { field: 'fraud_score', label: 'Trust Score', title: 'Sort by fraud trust score (safest first)' },
  { field: 'relevance', label: 'Relevance', title: 'Sort by content match (requires JD filter)' },
];

export function SortControls({ sortStack, onToggle, onRemove }: SortControlsProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    if (showDropdown) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [showDropdown]);

  const activeFields = new Set(sortStack.map(s => s.field));
  const availableOptions = SORT_OPTIONS.filter(opt => !activeFields.has(opt.field));

  function getLabelForField(field: string): string {
    return SORT_OPTIONS.find(o => o.field === field)?.label || field;
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1 flex-wrap">
      {/* Active sort pills */}
      {sortStack.map((s) => (
        <div
          key={s.field}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent/10 border border-accent/20 text-xs text-accent font-medium"
        >
          <button
            type="button"
            className="hover:text-accent-hover transition-colors"
            onClick={() => onToggle(s.field)}
            title={`Sort ${s.asc ? 'descending' : 'ascending'}`}
          >
            {getLabelForField(s.field)} {s.asc ? '↑' : '↓'}
          </button>
          <button
            type="button"
            className="text-text-faint hover:text-red-400 transition-colors ml-0.5"
            onClick={() => onRemove(s.field)}
            title="Remove sort"
          >
            ×
          </button>
        </div>
      ))}

      {/* Add sort button */}
      {availableOptions.length > 0 && (
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            className="px-2 py-0.5 text-xs text-text-faint border border-dashed border-border rounded hover:border-border-hover hover:text-text-dim transition-colors"
            onClick={() => setShowDropdown(prev => !prev)}
          >
            + Sort
          </button>
          {showDropdown && (
            <div className="absolute top-full left-0 z-10 mt-1 bg-bg-card border border-border rounded-md shadow-dropdown p-1 min-w-[120px]">
              {availableOptions.map(opt => (
                <button
                  key={opt.field}
                  type="button"
                  className="block w-full text-left px-2.5 py-1.5 text-xs text-text-dim hover:bg-bg-hover rounded transition-colors"
                  title={opt.title}
                  onClick={() => {
                    onToggle(opt.field);
                    setShowDropdown(false);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SortControls;
