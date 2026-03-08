// ============================================================
// SearchBar — Quick Search + AI Filter Generation (SA-014)
// ============================================================
// Compact search input at the top of the filter panel.
// Includes the "Generate filters from resume" CTA.
// ============================================================

import { Button, Input } from '@components';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  onAiGenerate: () => void;
  activeFilterCount: number;
  onClearAll: () => void;
}

export function SearchBar({
  value,
  onChange,
  onSearch,
  onAiGenerate,
  activeFilterCount,
  onClearAll,
}: SearchBarProps) {
  return (
    <div className="space-y-2">
      {/* AI Filter Generation CTA */}
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-500/5 to-accent/5 border border-accent/20">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/15 to-accent/15 flex items-center justify-center flex-shrink-0 text-base">
          ✦
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-accent">Generate filters from your resume</div>
          <div className="text-[10px] text-text-faint leading-snug">
            AI reads your resume and creates keyword, location, and level filters
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={onAiGenerate} className="flex-shrink-0">
          Generate
        </Button>
      </div>

      {/* Filter builder header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-text-dim">Job Filter Builder</span>
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-accent/10 text-accent">
              {activeFilterCount}
            </span>
          )}
        </div>
        {activeFilterCount > 0 && (
          <button
            type="button"
            className="text-[10px] text-text-faint hover:text-text-dim border border-border rounded px-2 py-0.5 transition-colors"
            onClick={onClearAll}
          >
            Clear All
          </button>
        )}
      </div>
    </div>
  );
}

export default SearchBar;
