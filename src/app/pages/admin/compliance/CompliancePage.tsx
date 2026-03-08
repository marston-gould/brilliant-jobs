// ============================================================
// CompliancePage — Main Admin Compliance Page Container (SA-017)
// ============================================================

import { ComplianceHero } from './components';
import { useCompliance } from './hooks/useCompliance';

export function CompliancePage() {
  const [state, _actions] = useCompliance();

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-text-faint mt-2">Loading compliance…</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-sm text-red-500 font-semibold">Failed to load compliance</p>
          <p className="text-xs text-text-faint mt-1">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <ComplianceHero piiFieldCount={state.piiFieldCount} pendingDeletions={state.pendingDeletions} completedDeletions={state.completedDeletions} lastAudit={state.lastAudit} />

      <div id="admin-pii-map" />
      <div id="admin-user-deletion" />
      <div id="admin-compliance-dash" />

    </div>
  );
}

export default CompliancePage;
