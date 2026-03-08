// ============================================================
// SettingsPage — Main Settings Page Container (SA-017)
// ============================================================

import React from 'react';
import { SettingsHero, ProfileSection, DangerZone } from './components';
import { useSettings } from './hooks/useSettings';
import { Button } from '@app/components';

export function SettingsPage() {
  const [state, actions] = useSettings();

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-text-faint mt-2">Loading settings…</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-sm text-red-500 font-semibold">Failed to load settings</p>
          <p className="text-xs text-text-faint mt-1">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <SettingsHero
        jobCount={state.jobCount}
        filterCount={state.filterCount}
        resumeCount={state.resumeCount}
        email={state.profile.email}
      />

      <div className="space-y-4">
        <ProfileSection profile={state.profile} />

        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={actions.openFeedback}>
            Send Feedback
          </Button>
        </div>

        <DangerZone
          state={state.dangerZone}
          onRequestDelete={actions.requestDelete}
          onCancelDelete={actions.cancelDelete}
          onExport={actions.exportData}
        />
      </div>
    </div>
  );
}

export default SettingsPage;
