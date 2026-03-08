// ============================================================
// LegacyPageWrapper — Dual-Mode Bridge (SA-013)
// ============================================================
// During migration, most pages are still legacy DOM-manipulating
// JavaScript. This wrapper:
//
// 1. On mount: Shows the legacy page content by toggling the
//    appropriate tab/panel in the existing DOM.
// 2. On unmount: Hides the legacy content to prevent leaks.
//
// As pages are migrated to React (SA-014+), they replace their
// LegacyPageWrapper route with a real React component. When all
// pages are migrated, this file is deleted.
//
// IMPORTANT: The legacy shell (globals.ts, app.js, tab-guard.js)
// must be loaded BEFORE the React app mounts. The HTML page
// includes both the legacy scripts and the React entry point.
// ============================================================

import { useEffect, useRef } from 'react';

interface LegacyPageWrapperProps {
  /** The tab ID from the legacy system (e.g., 'feed', 'pipeline', 'admin-jobs') */
  tabId: string;
  /** Whether this is a dashboard or admin legacy page */
  surface: 'dashboard' | 'admin';
}

/**
 * Activates a legacy tab by simulating the tab-switching mechanism
 * from the existing app.js / admin.js.
 */
function activateLegacyTab(tabId: string, surface: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bj = (window as any).BJ;

    if (surface === 'dashboard' && typeof bj?.showTab === 'function') {
      bj.showTab(tabId);
    } else if (surface === 'admin') {
      // Admin uses panel toggling via data-panel attributes
      const panels = document.querySelectorAll('.admin-panel');
      panels.forEach((p) => p.classList.remove('active'));
      const target = document.querySelector(`[data-panel="${tabId}"]`);
      target?.classList.add('active');

      // Update admin tab buttons
      const tabs = document.querySelectorAll('.admin-tab');
      tabs.forEach((t) => t.classList.remove('active'));
      const activeTab = document.querySelector(`[data-tab="${tabId}"]`);
      activeTab?.classList.add('active');
    }
  } catch (e) {
    console.warn(`[LegacyPageWrapper] Failed to activate tab "${tabId}":`, e);
  }
}

export function LegacyPageWrapper({ tabId, surface }: LegacyPageWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activatedRef = useRef(false);

  useEffect(() => {
    // Small delay to ensure legacy DOM is ready
    const timer = setTimeout(() => {
      activateLegacyTab(tabId, surface);
      activatedRef.current = true;
    }, 50);

    return () => {
      clearTimeout(timer);
      // On unmount, deactivate the tab to prevent stale DOM state
      if (activatedRef.current) {
        try {
          if (surface === 'dashboard') {
            // Hide all page containers
            const pages = document.querySelectorAll('.page');
            pages.forEach((p) => {
              (p as HTMLElement).style.display = 'none';
            });
          } else {
            const panels = document.querySelectorAll('.admin-panel');
            panels.forEach((p) => p.classList.remove('active'));
          }
        } catch {
          // Cleanup is best-effort
        }
      }
    };
  }, [tabId, surface]);

  // The legacy content is rendered by the legacy JS into the existing DOM.
  // This component just acts as a router-aware activation trigger.
  // The actual content is in dashboard.html / admin.html DOM elements.
  return (
    <div
      ref={containerRef}
      className="legacy-page-host"
      data-legacy-tab={tabId}
      data-legacy-surface={surface}
    />
  );
}

export default LegacyPageWrapper;
