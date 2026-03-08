// ============================================================
// StatsHero — Filter pills + stat cards for Stats page (SA-017)
// ============================================================

import { Card } from '@app/components';
import type { StatCard, FilterPill } from '../hooks/useStats';

interface StatsHeroProps {
  cards: StatCard[];
  filters: FilterPill[];
  onToggleFilter: (idx: number) => void;
}

export function StatsHero({ cards, filters, onToggleFilter }: StatsHeroProps) {
  return (
    <div className="mb-6">
      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {filters.map(f => (
          <button
            key={f.idx}
            className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
              f.selected
                ? 'border-accent bg-accent text-white'
                : 'border-border bg-bg-elevated text-text-faint hover:border-accent'
            }`}
            style={f.selected ? { backgroundColor: f.color, borderColor: f.color } : undefined}
            onClick={() => onToggleFilter(f.idx)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Stat cards */}
      {cards.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map(c => (
            <Card key={c.label} variant="default" padding="md">
              <p className="text-xs font-semibold text-text-faint uppercase tracking-wider mb-1">{c.label}</p>
              <p className="text-2xl font-bold text-text">{c.value}</p>
              {c.sub && <p className="text-xs text-text-faint mt-1">{c.sub}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
