// ============================================================
// TuningPage — Main Tuning Page Container (SA-017)
// ============================================================

import { TuningHero, FilterCard } from './components';
import { useTuning } from './hooks/useTuning';
import { Button } from '@app/components';

export function TuningPage() {
  const [state, actions] = useTuning();

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-text-faint mt-2">Loading tuning…</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-sm text-red-500 font-semibold">Failed to load tuning</p>
          <p className="text-xs text-text-faint mt-1">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <TuningHero
        filterCount={state.filters.length}
        levelCount={state.levels.length}
        hiddenJobCount={state.hiddenJobCount}
        dirty={state.statusDirty}
      />

      {/* Save button */}
      {state.statusDirty && (
        <div className="flex justify-end mb-4">
          <Button variant="primary" size="sm" onClick={actions.saveTuning}>
            Save Changes
          </Button>
        </div>
      )}

      {/* Filter cards */}
      <div className="space-y-3">
        {state.filters.map(f => (
          <FilterCard
            key={f.idx}
            filter={f}
            onToggle={() => actions.toggleCard(f.idx)}
            onEditLevels={() => actions.editLevelHierarchy(f.idx)}
          />
        ))}
      </div>

      {state.filters.length === 0 && (
        <p className="text-sm text-text-faint text-center py-8">No filters configured. Create filters in the Job Feed to start tuning.</p>
      )}
    </div>
  );
}

export default TuningPage;
