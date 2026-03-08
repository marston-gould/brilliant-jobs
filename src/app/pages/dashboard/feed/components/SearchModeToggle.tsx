// ============================================================
// SearchModeToggle — Filters/Chat Mode Switcher (SA-014)
// ============================================================

import React from 'react';

interface SearchModeToggleProps {
  mode: 'filters' | 'chat';
  onModeChange: (mode: 'filters' | 'chat') => void;
}

export function SearchModeToggle({ mode, onModeChange }: SearchModeToggleProps) {
  return (
    <div className="flex items-center justify-center py-2">
      <div className="inline-flex rounded-lg bg-bg-input border border-border p-0.5">
        <button
          type="button"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            mode === 'filters'
              ? 'bg-bg-card text-text shadow-sm'
              : 'text-text-faint hover:text-text'
          }`}
          onClick={() => onModeChange('filters')}
        >
          <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
          </svg>
          Filters
        </button>
        <button
          type="button"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            mode === 'chat'
              ? 'bg-bg-card text-text shadow-sm'
              : 'text-text-faint hover:text-text'
          }`}
          onClick={() => onModeChange('chat')}
        >
          <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Chat
        </button>
      </div>
    </div>
  );
}

export default SearchModeToggle;
