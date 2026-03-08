// ============================================================
// DangerZone — Account deletion section (SA-017)
// ============================================================

import { Card, Button } from '@app/components';
import type { DangerZoneState } from '../hooks/useSettings';

interface DangerZoneProps {
  state: DangerZoneState;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onExport: () => void;
}

export function DangerZone({ state, onRequestDelete, onCancelDelete, onExport }: DangerZoneProps) {
  return (
    <Card variant="default" padding="lg">
      <h3 className="text-sm font-semibold text-red-500 mb-4">Danger Zone</h3>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-text font-medium">Export Your Data</p>
            <p className="text-xs text-text-faint">Download all your data as JSON</p>
          </div>
          <Button variant="secondary" size="sm" onClick={onExport}>
            Export
          </Button>
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text font-medium">Delete Account</p>
              <p className="text-xs text-text-faint">
                {state.deleteRequested
                  ? `Deletion scheduled. Grace period expires ${state.graceExpiresAt || 'soon'}.`
                  : 'Permanently delete your account and all data'}
              </p>
            </div>
            {state.deleteRequested ? (
              <Button variant="secondary" size="sm" onClick={onCancelDelete}>
                Cancel Deletion
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={onRequestDelete}>
                Delete Account
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
