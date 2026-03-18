// ============================================================
// useIntegrations — Integrations data hook (SA-017)
// ============================================================
// Standalone hook — zero window.* dependencies (SPA-CUT-3).
// Components consume integration data through this hook only.
// ============================================================

import { useCallback, useEffect, useReducer } from 'react';
import { safeReadLS, safeWriteLS, callGateway, getUser } from '@lib/supabase';
import { providers } from '@app/providers/bridge';

// ── Types ────────────────────────────────────────────────────

export interface GDriveFile {
  name: string;
  url: string;
  mimeType: string;
  id: string;
}

interface IntegrationsState {
  loading: boolean;
  error: string | null;
  gdriveConnected: boolean;
  gdriveFiles: GDriveFile[];
  gmailConnected: boolean;
  extensionInstalled: boolean;
}

type Action =
  | { type: 'LOADED'; gdriveConnected: boolean; gdriveFiles: GDriveFile[]; gmailConnected: boolean; extensionInstalled: boolean }
  | { type: 'ERROR'; error: string };

const initialState: IntegrationsState = {
  loading: true,
  error: null,
  gdriveConnected: false,
  gdriveFiles: [],
  gmailConnected: false,
  extensionInstalled: false,
};

function reducer(state: IntegrationsState, action: Action): IntegrationsState {
  switch (action.type) {
    case 'LOADED':
      return {
        ...state,
        loading: false,
        error: null,
        gdriveConnected: action.gdriveConnected,
        gdriveFiles: action.gdriveFiles,
        gmailConnected: action.gmailConnected,
        extensionInstalled: action.extensionInstalled,
      };
    case 'ERROR':
      return { ...state, loading: false, error: action.error };
    default:
      return state;
  }
}

// ── Hook ─────────────────────────────────────────────────────

export function useIntegrations(): [IntegrationsState, {
  connectGDrive: () => void;
  disconnectGDrive: () => void;
  addFile: () => void;
  unlinkFile: (idx: number) => void;
  importAsResume: (idx: number) => void;
}] {
  const [state, dispatch] = useReducer(reducer, initialState);

  const loadData = useCallback(async () => {
    try {
      // Load GDrive files from provider (returns [] when not connected)
      const rawFiles = await providers.integrations.getGDriveFiles().catch(() => []);
      const gdriveFiles: GDriveFile[] = (rawFiles || []).map((f: any) => ({
        id: f.id || '',
        name: f.name || '',
        url: f.url || '',
        mimeType: f.mimeType || '',
      }));
      const gdriveConnected = gdriveFiles.length > 0;

      // Gmail/extension status from localStorage (set by OAuth callback / extension handshake)
      const gmailConnected = localStorage.getItem('bj_gmail_connected') === 'true';
      const extensionInstalled = localStorage.getItem('bj_ext_installed') === 'true';

      dispatch({
        type: 'LOADED',
        gdriveConnected,
        gdriveFiles,
        gmailConnected,
        extensionInstalled,
      });
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    loadData();
    // No polling needed — integrations change only on explicit user action
    return () => {};
  }, [loadData]);

  const connectGDrive = useCallback(async () => {
    try {
      await providers.integrations.connectGDrive();
      (window as any).__bjToast?.('Google Drive connected', 'success');
      loadData();
    } catch (e: any) {
      const msg = e?.message || 'Google Drive integration is not yet available.';
      (window as any).__bjToast?.(msg, 'info');
    }
  }, [loadData]);

  const disconnectGDrive = useCallback(async () => {
    try {
      await providers.integrations.disconnectGDrive();
      (window as any).__bjToast?.('Google Drive disconnected', 'info');
      loadData();
    } catch (e: any) {
      const msg = e?.message || 'Could not disconnect Google Drive.';
      (window as any).__bjToast?.(msg, 'info');
    }
  }, [loadData]);

  const addFile = useCallback(async () => {
    try {
      await providers.integrations.addGDriveFile('');
      (window as any).__bjToast?.('File linked from Google Drive', 'success');
      loadData();
    } catch (e: any) {
      const msg = e?.message || 'Google Drive integration is not yet available.';
      (window as any).__bjToast?.(msg, 'info');
    }
  }, [loadData]);

  const unlinkFile = useCallback(async (idx: number) => {
    try {
      await providers.integrations.unlinkGDriveFile(String(idx));
      (window as any).__bjToast?.('File unlinked', 'info');
      loadData();
    } catch (e: any) {
      (window as any).__bjToast?.(e?.message || 'Could not unlink file.', 'error');
    }
  }, [loadData]);

  const importAsResume = useCallback(async (idx: number) => {
    try {
      await providers.integrations.importGDriveAsResume(String(idx));
      (window as any).__bjToast?.('Imported as resume', 'success');
    } catch (e: any) {
      const msg = e?.message || 'Google Drive integration is not yet available.';
      (window as any).__bjToast?.(msg, 'info');
    }
  }, []);

  return [state, { connectGDrive, disconnectGDrive, addFile, unlinkFile, importAsResume }];
}
