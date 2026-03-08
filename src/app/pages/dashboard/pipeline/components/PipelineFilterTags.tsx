// ============================================================
// PipelineFilterTags — Filter Tag Bar (SA-015)
// ============================================================

import React, { useEffect, useMemo, useState } from 'react';

const FILTER_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f97316',
  '#22c55e', '#06b6d4', '#eab308', '#ef4444',
];

interface PipelineFilterTagsProps {
  activeFilter: string;
  onFilterChange: (tag: string) => void;
}

export function PipelineFilterTags({ activeFilter, onFilterChange }: PipelineFilterTagsProps) {
  const [filters, setFilters] = useState<Array<{ name: string }>>([]);

  useEffect(() => {
    try {
      const ls = localStorage.getItem('bj_saved_filters');
      setFilters(ls ? JSON.parse(ls) : []);
    } catch { /* noop */ }
  }, []);

  const tags = useMemo(() => {
    return filters.map((f, i) => ({
      name: f.name,
      color: FILTER_COLORS[i % FILTER_COLORS.length],
    }));
  }, [filters]);

  if (tags.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        type="button"
        onClick={() => onFilterChange('all')}
        className={`px-2 py-0.5 text-[11px] font-medium rounded-full border transition-all ${
          activeFilter === 'all'
            ? 'bg-accent/10 text-accent border-accent/30'
            : 'bg-bg-input text-text-dim border-border hover:border-border-hover'
        }`}
      >
        All
      </button>
      {tags.map(tag => {
        const isActive = activeFilter === tag.name;
        return (
          <button
            key={tag.name}
            type="button"
            onClick={() => onFilterChange(tag.name)}
            className={`px-2 py-0.5 text-[11px] font-medium rounded-full border transition-all ${
              isActive
                ? 'border-current'
                : 'border-transparent hover:border-border'
            }`}
            style={{
              color: tag.color,
              backgroundColor: isActive ? tag.color + '15' : 'transparent',
              borderColor: isActive ? tag.color + '40' : undefined,
            }}
          >
            {tag.name}
          </button>
        );
      })}
    </div>
  );
}

export default PipelineFilterTags;
