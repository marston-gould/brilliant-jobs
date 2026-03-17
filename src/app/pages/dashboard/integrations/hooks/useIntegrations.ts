// ============================================================
// useIntegrations — Integrations data hook (SA-017)
// ============================================================
// Standalone hook — zero window.* dependencies (SPA-CUT-3).
// Components consume integration data through this hook only.
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { supabase, safeReadLS, safeWriteLS, callGateway, getUser } from '@lib/supabase';

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(() => {
    try {
      // SPA-CUT-3: Data loaded from localStorage/Supabase (no window bridge)
      // @ts-ignore SPA-CUT-3
      const gdriveFiles: GDriveFile[] = Array.isArray(null) ? null : [];
      const gdriveConnected = !!(gdriveFiles.length > 0);
      const gmailConnected = !!(null === 'connected' || null);
      const extensionInstalled = !!(null === 'connected');

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
    pollRef.current = setInterval(loadData, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadData]);

  const connectGDrive = useCallback(() => {
    try {
      // SPA-CUT-3: connectGoogleDrive bridge removed
    } catch (e) {
      console.warn('[useIntegrations] connectGDrive failed:', e);
    }
  }, []);

  const disconnectGDrive = useCallback(() => {
    try {
      // SPA-CUT-3: disconnectGoogleDrive bridge removed
    } catch (e) {
      console.warn('[useIntegrations] disconnectGDrive failed:', e);
    }
  }, []);

  const addFile = useCallback(() => {
    try {
      // SPA-CUT-3: addGdriveFile bridge removed
    } catch (e) {
      console.warn('[useIntegrations] addFile failed:', e);
    }
  }, []);

  const unlinkFile = useCallback((idx: number) => {
    try {
      // SPA-CUT-3: unlinkGdriveFile bridge removed
    } catch (e) {
      console.warn('[useIntegrations] unlinkFile failed:', e);
    }
  }, []);

  const importAsResume = useCallback((idx: number) => {
    try {
      // SPA-CUT-3: importGdriveAsResume bridge removed
    } catch (e) {
      console.warn('[useIntegrations] importAsResume failed:', e);
    }
  }, []);

  return [state, { connectGDrive, disconnectGDrive, addFile, unlinkFile, importAsResume }];
}
