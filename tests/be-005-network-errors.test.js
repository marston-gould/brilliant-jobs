/**
 * BE-005: Suppressed Network Errors — Validation Tests
 * 
 * Verifies that network errors (Failed to fetch, NetworkError, Load failed)
 * are no longer silently suppressed. Instead they are:
 *   - Reported to PostHog via reportError()
 *   - Surfaced to the user via toastWarning() when online
 *   - Logged with context (online status, handler source)
 *   - Throttled to avoid toast spam (10s cooldown)
 */

const { describe, it, expect } = require('@jest/globals');
const fs = require('fs');

const globalsTs = fs.readFileSync('js/globals.ts', 'utf8');
const globalsJs = fs.readFileSync('js/globals.js', 'utf8');

function extractHandler(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  return source.slice(start, end);
}

const handlerTs = extractHandler(globalsTs, 'initGlobalErrorHandlers', 'function reportError');
const handlerJs = extractHandler(globalsJs, 'function initGlobalErrorHandlers', 'function reportError');

describe('BE-005: Silent suppression removed', () => {
  it('globals.ts: reportError called BEFORE event.preventDefault', () => {
    const reportIdx = handlerTs.indexOf("reportError('network'");
    const preventIdx = handlerTs.indexOf('event.preventDefault()');
    expect(reportIdx).toBeGreaterThan(-1);
    expect(preventIdx).toBeGreaterThan(-1);
    expect(reportIdx).toBeLessThan(preventIdx);
  });

  it('globals.js: reportError called BEFORE event.preventDefault', () => {
    const reportIdx = handlerJs.indexOf('reportError("network"');
    const preventIdx = handlerJs.indexOf('event.preventDefault()');
    expect(reportIdx).toBeGreaterThan(-1);
    expect(preventIdx).toBeGreaterThan(-1);
    expect(reportIdx).toBeLessThan(preventIdx);
  });

  it('globals.ts: no old "Suppress noisy" comment', () => {
    expect(globalsTs).not.toContain('Suppress noisy auth/network');
  });

  it('globals.ts: no old "Don\'t spam console" comment', () => {
    expect(globalsTs).not.toContain("Don't spam console when offline");
  });
});

describe('BE-005: PostHog reporting', () => {
  it('globals.ts: reportError includes online status', () => {
    expect(handlerTs).toContain('online: _isOnline');
  });

  it('globals.ts: reportError includes handler source', () => {
    expect(handlerTs).toContain("handler: 'unhandledrejection'");
  });

  it('globals.js: reportError includes online status', () => {
    expect(handlerJs).toContain('online: _isOnline');
  });

  it('globals.js: reportError includes handler source', () => {
    expect(handlerJs).toContain('handler: "unhandledrejection"');
  });
});

describe('BE-005: User notification', () => {
  it('globals.ts: toastWarning shown when online', () => {
    expect(handlerTs).toContain('toastWarning(');
    expect(handlerTs).toContain('check your connection');
  });

  it('globals.ts: toast includes Retry action', () => {
    expect(handlerTs).toContain("label: 'Retry'");
    expect(handlerTs).toContain('window.location.reload()');
  });

  it('globals.js: toastWarning shown when online', () => {
    expect(handlerJs).toContain('toastWarning(');
    expect(handlerJs).toContain('check your connection');
  });
});

describe('BE-005: Toast throttle', () => {
  it('globals.ts: throttle variables declared', () => {
    expect(globalsTs).toContain('_lastNetworkToastTime');
    expect(globalsTs).toContain('_NETWORK_TOAST_THROTTLE_MS');
  });

  it('globals.ts: throttle is 10 seconds', () => {
    expect(globalsTs).toContain('10000');
  });

  it('globals.js: throttle variables declared', () => {
    expect(globalsJs).toContain('_lastNetworkToastTime');
    expect(globalsJs).toContain('_NETWORK_TOAST_THROTTLE_MS');
  });

  it('globals.ts: throttle check guards toast', () => {
    expect(handlerTs).toContain('now - _lastNetworkToastTime > _NETWORK_TOAST_THROTTLE_MS');
  });
});

describe('BE-005: Error pattern detection', () => {
  it('detects Failed to fetch', () => {
    expect(handlerTs).toContain("'Failed to fetch'");
  });

  it('detects NetworkError', () => {
    expect(handlerTs).toContain("'NetworkError'");
  });

  it('detects Load failed', () => {
    expect(handlerTs).toContain("'Load failed'");
  });
});

describe('BE-005: Console logging', () => {
  it('logs when offline', () => {
    expect(globalsTs).toContain('Network error while offline (reported)');
  });

  it('logs when online', () => {
    expect(globalsTs).toContain('Network error while online (reported + user notified)');
  });
});

describe('BE-005: Build output', () => {
  it('globals.js contains network error throttle variable', () => {
    expect(globalsJs).toContain('_lastNetworkToastTime');
  });

  it('globals.ts contains BE-005 attribution', () => {
    expect(globalsTs).toContain('BE-005');
  });

  it('globals.ts and globals.js both have the fix', () => {
    expect(globalsTs).toContain("reportError('network'");
    expect(globalsJs).toContain('reportError("network"');
  });
});
