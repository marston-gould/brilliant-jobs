// ============================================================
// SeoPage — Main Admin SEO Page Container (SA-017)
// ============================================================

import React from 'react';
import { SeoHero } from './components';
import { useSeo } from './hooks/useSeo';

export function SeoPage() {
  const [state, actions] = useSeo();

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-text-faint mt-2">Loading seo…</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-sm text-red-500 font-semibold">Failed to load seo</p>
          <p className="text-xs text-text-faint mt-1">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <SeoHero pageViews={state.pageViews} impressions={state.impressions} clickRate={state.clickRate} avgPosition={state.avgPosition} />

      <div id="admin-seo-panel" />
      <div id="admin-seo-chart" />

    </div>
  );
}

export default SeoPage;
