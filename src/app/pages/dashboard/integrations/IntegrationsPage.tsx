// ============================================================
// IntegrationsPage — Main Integrations Page Container (SA-017)
// ============================================================
// Orchestrates all integration components:
// - IntegrationsHero (connection status overview)
// - GDriveSection (file management)
// - IntegrationCard (Gmail, Extension status)
//
// Data flows through useIntegrations hook → legacy bridge.
// Dark mode: automatic via CSS custom properties.
// Zero inline styles. Design tokens via Tailwind.
// ============================================================

import { IntegrationsHero, GDriveSection, IntegrationCard } from './components';
import { useIntegrations } from './hooks/useIntegrations';

export function IntegrationsPage() {
  const [state, actions] = useIntegrations();

  // ── Loading state ──────────────────────────────────────────

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-text-faint mt-2">Loading integrations…</p>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────

  if (state.error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-sm text-red-500 font-semibold">Failed to load integrations</p>
          <p className="text-xs text-text-faint mt-1">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Stats overview */}
      <IntegrationsHero
        gdriveConnected={state.gdriveConnected}
        gmailConnected={state.gmailConnected}
        extensionInstalled={state.extensionInstalled}
        fileCount={state.gdriveFiles.length}
      />

      {/* Google Drive */}
      <div className="space-y-4">
        <GDriveSection
          connected={state.gdriveConnected}
          files={state.gdriveFiles}
          onConnect={actions.connectGDrive}
          onDisconnect={actions.disconnectGDrive}
          onAddFile={actions.addFile}
          onUnlink={actions.unlinkFile}
          onImportAsResume={actions.importAsResume}
        />

        {/* Gmail */}
        <IntegrationCard
          name="Gmail"
          description="Ghost detection and signal tracking via email"
          connected={state.gmailConnected}
          icon={
            <svg className="w-5 h-5 text-text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
        />

        {/* Extension */}
        <IntegrationCard
          name="Browser Extension"
          description="Job scanning, ATS auto-fill, and pipeline tracking"
          connected={state.extensionInstalled}
          icon={
            <svg className="w-5 h-5 text-text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
            </svg>
          }
        />
      </div>
    </div>
  );
}

export default IntegrationsPage;
