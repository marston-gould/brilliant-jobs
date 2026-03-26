// ============================================================
// GmailHealthBanner — Pipeline Gmail Signal Status (SA-015-G)
// ============================================================
// Shown at the top of Pipeline page. Checks gmail_connections
// table for current user. Shows:
//   - Not connected → nudge to connect + link to Get Started
//   - Connected, active → last scan time + last signal
//   - Connected, error → token refresh failed, re-connect CTA
//   - Connected, scanning → in-progress indicator
// Collapses to nothing when healthy and recently scanned.
// ============================================================

import { useEffect, useState } from 'react';
import { supabase as _sb, getUser } from '@lib/supabase';

type ConnectionStatus = 'loading' | 'none' | 'active' | 'error' | 'token_error' | 'pending';

interface GmailHealth {
  status: ConnectionStatus;
  lastScanAt: string | null;
  lastSignalAt: string | null;
  errorMessage: string | null;
  gmailAddress: string | null;
}

function relTime(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function GmailHealthBanner() {
  const [health, setHealth] = useState<GmailHealth>({
    status: 'loading',
    lastScanAt: null,
    lastSignalAt: null,
    errorMessage: null,
    gmailAddress: null,
  });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const user = await getUser();
        if (!user) return;
        const uid = user.id;

        // Check gmail_connections
        const { data: conn } = await _sb
          .from('gmail_connections')
          .select('sync_status, last_sync_at, gmail_address, error_message')
          .eq('user_id', uid)
          .maybeSingle();

        if (!conn) {
          setHealth({ status: 'none', lastScanAt: null, lastSignalAt: null, errorMessage: null, gmailAddress: null });
          return;
        }

        // Check for most-recent confirmed/pending signal
        const { data: lastSig } = await _sb
          .from('pipeline_signals')
          .select('created_at')
          .eq('user_id', uid)
          .in('signal_source', ['gmail', 'calendar'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        setHealth({
          status: (conn.sync_status as ConnectionStatus) || 'active',
          lastScanAt: conn.last_sync_at,
          lastSignalAt: lastSig?.created_at ?? null,
          errorMessage: conn.error_message,
          gmailAddress: conn.gmail_address,
        });
      } catch (e) {
        console.error('[GmailHealthBanner]', e);
      }
    })();
  }, []);

  // Don't render while loading
  if (health.status === 'loading') return null;

  // Active + recently scanned (< 8h) → silent, no banner
  if (health.status === 'active' && health.lastScanAt) {
    const ageH = (Date.now() - new Date(health.lastScanAt).getTime()) / 3_600_000;
    if (ageH < 8 && !dismissed) return null;
  }

  if (dismissed) return null;

  // ── Not connected ──────────────────────────────────────────
  if (health.status === 'none') {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border bg-bg-input text-[12px]">
        <span className="text-text-faint flex-shrink-0">✉️</span>
        <div className="flex-1 text-text-dim">
          <strong className="text-text font-semibold">Gmail not connected</strong>
          {' — '}Signal Detection is off. Connect Gmail to automatically track interview invites, rejections, and responses.
        </div>
        <a
          href="/app/get-started#connect-accounts"
          className="flex-shrink-0 px-3 py-1 rounded-md bg-accent text-white text-[11px] font-semibold hover:opacity-90 transition-opacity"
        >
          Connect
        </a>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-text-faint hover:text-text transition-colors text-sm flex-shrink-0"
          title="Dismiss"
        >
          ×
        </button>
      </div>
    );
  }

  // ── Token error → needs re-auth ────────────────────────────
  if (health.status === 'error' || health.status === 'token_error') {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-red/30 bg-red/5 text-[12px]">
        <span className="w-1.5 h-1.5 rounded-full bg-red flex-shrink-0" />
        <div className="flex-1 text-text-dim">
          <strong className="text-red font-semibold">Gmail disconnected</strong>
          {health.gmailAddress ? ` (${health.gmailAddress})` : ''}
          {' — '}
          {health.errorMessage || 'Token expired. Re-connect to resume signal scanning.'}
        </div>
        <a
          href="/app/get-started#connect-accounts"
          className="flex-shrink-0 px-3 py-1 rounded-md bg-red text-white text-[11px] font-semibold hover:opacity-90 transition-opacity"
        >
          Re-connect
        </a>
        <button type="button" onClick={() => setDismissed(true)} className="text-text-faint hover:text-text transition-colors text-sm flex-shrink-0" title="Dismiss">×</button>
      </div>
    );
  }

  // ── Active but stale (> 8h since last scan) ────────────────
  if (health.status === 'active') {
    return (
      <div className="flex items-center gap-3 px-4 py-2 rounded-lg border border-border bg-bg-input text-[12px]">
        <span className="w-1.5 h-1.5 rounded-full bg-green flex-shrink-0" />
        <div className="flex-1 text-text-dim">
          <strong className="text-text font-medium">Signal Detection active</strong>
          {health.gmailAddress ? <span className="text-text-faint"> · {health.gmailAddress}</span> : ''}
          <span className="text-text-faint"> · Last scan {relTime(health.lastScanAt)}</span>
          {health.lastSignalAt && (
            <span className="text-text-faint"> · Last signal {relTime(health.lastSignalAt)}</span>
          )}
        </div>
        <button type="button" onClick={() => setDismissed(true)} className="text-text-faint hover:text-text transition-colors text-sm flex-shrink-0" title="Dismiss">×</button>
      </div>
    );
  }

  return null;
}

export default GmailHealthBanner;
