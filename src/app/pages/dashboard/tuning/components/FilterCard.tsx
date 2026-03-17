// ============================================================
// FilterCard — Expandable filter tuning card (SA-017)
// ============================================================

import { Card, Badge, Button } from '@app/components';
import type { TuningFilter } from '../hooks/useTuning';

interface FilterCardProps {
  filter: TuningFilter;
  onToggle: () => void;
  onEditLevels: () => void;
}

export function FilterCard({ filter, onToggle, onEditLevels }: FilterCardProps) {
  return (
    <Card variant="default" padding="md">
      <button
        className="flex items-center justify-between w-full text-left"
        onClick={onToggle}
        aria-expanded={!filter.collapsed}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: filter.color }}
          />
          <span className="text-sm font-semibold text-text">{filter.name}</span>
          <Badge variant="secondary">{filter.keywords.length} keywords</Badge>
        </div>
        <svg
          aria-hidden="true"
          className={`w-4 h-4 text-text-faint transition-transform ${filter.collapsed ? '' : 'rotate-180'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!filter.collapsed && (
        <div className="mt-4 space-y-3 pt-3 border-t border-border">
          <div>
            <p className="text-xs text-text-faint mb-1">Keywords</p>
            <div className="flex flex-wrap gap-1">
              {filter.keywords.map((kw, i) => (
                <span key={i} className="px-2 py-0.5 text-xs bg-bg-elevated text-text rounded">{kw}</span>
              ))}
            </div>
          </div>

          {filter.excludedTerms.length > 0 && (
            <div>
              <p className="text-xs text-text-faint mb-1">Excluded</p>
              <div className="flex flex-wrap gap-1">
                {filter.excludedTerms.map((term, i) => (
                  <span key={i} className="px-2 py-0.5 text-xs bg-red-500 bg-opacity-10 text-red-500 rounded">{term}</span>
                ))}
              </div>
            </div>
          )}

          {filter.location && (
            <div className="flex justify-between text-xs">
              <span className="text-text-faint">Location</span>
              <span className="text-text">{filter.location}{filter.radius ? ` (${filter.radius}mi)` : ''}</span>
            </div>
          )}

          {filter.minSalary > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-text-faint">Min Salary</span>
              <span className="text-text">${filter.minSalary.toLocaleString()}</span>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={onEditLevels}>
              Edit Levels
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
