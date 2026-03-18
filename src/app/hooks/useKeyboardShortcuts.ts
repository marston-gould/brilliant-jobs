// ============================================================
// useKeyboardShortcuts — Global keyboard shortcuts
// ============================================================
// Legacy had "various hotkeys" — this implements:
//   /          → focus the main search input
//   Escape     → close any open modal / panel
//   j          → next job row (feed page)
//   k          → prev job row (feed page)
//   g then f   → navigate to Feed
//   g then p   → navigate to Pipeline
//   g then r   → navigate to Resumes
//   g then a   → navigate to Applications
//   g then s   → navigate to Stats
//   g then t   → navigate to Settings
//
// Usage: call once at the AppShell level.
// Individual pages can also call it for page-specific bindings.
// ============================================================

import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface ShortcutOptions {
  /** Disable all shortcuts (e.g. when a text input is focused) */
  disabled?: boolean;
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    (el as HTMLElement).isContentEditable
  );
}

export function useKeyboardShortcuts({ disabled = false }: ShortcutOptions = {}) {
  const navigate = useNavigate();
  const gPrefixRef = useRef(false);
  const gTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearGPrefix = useCallback(() => {
    gPrefixRef.current = false;
    if (gTimerRef.current) {
      clearTimeout(gTimerRef.current);
      gTimerRef.current = null;
    }
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (disabled) return;

    // Never fire on modifier-combos (Ctrl/Cmd/Alt)
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // Escape — close modals, panels, overlays
    if (e.key === 'Escape') {
      // Close any open modal overlay
      const overlay = document.querySelector<HTMLElement>('[data-modal-overlay]');
      if (overlay) {
        overlay.click();
        e.preventDefault();
        return;
      }
      // Blur focused input
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      clearGPrefix();
      return;
    }

    // Don't steal keystrokes from inputs (except Escape above)
    if (isInputFocused()) return;

    // / → focus search
    if (e.key === '/') {
      e.preventDefault();
      const searchInput = document.querySelector<HTMLElement>(
        'input[type="search"], input[placeholder*="search" i], input[placeholder*="Search" i], [data-search-input]'
      );
      if (searchInput) searchInput.focus();
      clearGPrefix();
      return;
    }

    // g-prefix navigation (must press second key within 1s)
    if (e.key === 'g') {
      if (gPrefixRef.current) {
        // double-g → go to feed (like vim gg → top)
        navigate('/app/feed');
        clearGPrefix();
        e.preventDefault();
        return;
      }
      gPrefixRef.current = true;
      gTimerRef.current = setTimeout(clearGPrefix, 1000);
      e.preventDefault();
      return;
    }

    if (gPrefixRef.current) {
      clearGPrefix();
      e.preventDefault();
      const routes: Record<string, string> = {
        f: '/app/feed',
        p: '/app/pipeline',
        r: '/app/resumes',
        a: '/app/applications',
        s: '/app/stats',
        t: '/app/settings',
        n: '/app/notifications',
        i: '/app/interview-prep',
        b: '/app/billing',
        k: '/app/keywords',
      };
      const route = routes[e.key.toLowerCase()];
      if (route) navigate(route);
      return;
    }

    // j/k — next/prev focusable job row
    if (e.key === 'j' || e.key === 'k') {
      const rows = Array.from(
        document.querySelectorAll<HTMLElement>('[data-job-row]')
      );
      if (rows.length === 0) return;

      const current = document.activeElement as HTMLElement;
      const currentIdx = rows.indexOf(current);

      let nextIdx: number;
      if (e.key === 'j') {
        nextIdx = currentIdx < 0 ? 0 : Math.min(currentIdx + 1, rows.length - 1);
      } else {
        nextIdx = currentIdx < 0 ? rows.length - 1 : Math.max(currentIdx - 1, 0);
      }

      const next = rows[nextIdx];
      if (next) {
        next.focus();
        next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        e.preventDefault();
      }
      return;
    }
  }, [disabled, navigate, clearGPrefix]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearGPrefix();
    };
  }, [handleKeyDown, clearGPrefix]);
}

export default useKeyboardShortcuts;
