// ============================================================
// ContentPage — Main Admin Content Page Container (SA-017)
// ============================================================

import { ContentHero } from './components';
import { useContent } from './hooks/useContent';

export function ContentPage() {
  const [state, _actions] = useContent();

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-text-faint mt-2">Loading content…</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-sm text-red-500 font-semibold">Failed to load content</p>
          <p className="text-xs text-text-faint mt-1">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <ContentHero storyCount={state.storyCount} pendingCount={state.pendingCount} publishedCount={state.publishedCount} />

      <div id="admin-content-panel" />

    </div>
  );
}

export default ContentPage;
