// @ts-nocheck
/* ───────────────────────────────────────────────────────────
   structured-logger.js — Structured Logging (AD-DO-001)
   CS-P1-005: Consistent JSON-structured log format for all
   client-side surfaces. Integrates with PostHog custom events
   and the error reporting pipeline.
   
   Usage:
     var log = BJ.createLogger('job-feed');
     log.info('Jobs loaded', { count: 42 });
     log.warn('Slow query', { duration_ms: 3200 });
     log.error('Failed to load', { error: err.message });
   ─────────────────────────────────────────────────────────── */

(function() {
  'use strict';

  var LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
  var _minLevel = LOG_LEVELS.info; // Default: info and above
  var _logBuffer = [];
  var MAX_BUFFER = 100;
  var _flushTimer = null;
  var FLUSH_INTERVAL_MS = 30000; // Flush to PostHog every 30s

  // ── Set min level (for dev mode) ──
  function setLogLevel(level) {
    if (LOG_LEVELS.hasOwnProperty(level)) _minLevel = LOG_LEVELS[level];
  }

  // ── Core log function ──
  function _log(level, component, message, data) {
    if (LOG_LEVELS[level] < _minLevel) return;

    var entry = {
      ts: new Date().toISOString(),
      level: level,
      component: component,
      msg: message,
      surface: _detectSurface(),
      version: (typeof BJ_VERSION !== 'undefined') ? BJ_VERSION : 'unknown'
    };

    if (data) {
      // Sanitize — remove potential PII
      var safeData = {};
      var keys = Object.keys(data);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k === 'email' || k === 'password' || k === 'token' || k === 'key') continue;
        safeData[k] = data[k];
      }
      entry.data = safeData;
    }

    // Console output (structured)
    var consoleFn = level === 'error' ? console.error :
                    level === 'warn' ? console.warn : console.log;
    consoleFn('[' + entry.component + '] ' + entry.msg, entry.data || '');

    // Buffer for PostHog batch
    if (level === 'warn' || level === 'error') {
      _logBuffer.push(entry);
      if (_logBuffer.length >= MAX_BUFFER) _flush();
    }

    // Error-level: also report to PostHog immediately
    if (level === 'error' && typeof posthog !== 'undefined' && posthog.capture) {
      try {
        posthog.capture('$structured_log_error', {
          component: entry.component,
          message: entry.msg,
          surface: entry.surface,
          version: entry.version,
          data: entry.data
        });
      } catch (e) { /* swallow */ }
    }
  }

  // ── Surface detection ──
  function _detectSurface() {
    if (typeof window === 'undefined') return 'server';
    var path = window.location.pathname;
    if (path.indexOf('admin') !== -1) return 'admin';
    if (path.indexOf('dashboard') !== -1) return 'dashboard';
    if (path === '/' || path.indexOf('index') !== -1) return 'landing';
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) return 'extension';
    return 'unknown';
  }

  // ── Flush buffered logs to PostHog ──
  function _flush() {
    if (_logBuffer.length === 0) return;
    if (typeof posthog === 'undefined' || !posthog.capture) {
      _logBuffer = [];
      return;
    }

    var batch = _logBuffer.splice(0, MAX_BUFFER);
    try {
      posthog.capture('$structured_log_batch', {
        count: batch.length,
        entries: batch.map(function(e) {
          return {
            ts: e.ts,
            level: e.level,
            component: e.component,
            msg: e.msg,
            surface: e.surface
          };
        })
      });
    } catch (e) { /* swallow */ }
  }

  // ── Create a component-scoped logger ──
  function createLogger(component) {
    return {
      debug: function(msg, data) { _log('debug', component, msg, data); },
      info:  function(msg, data) { _log('info',  component, msg, data); },
      warn:  function(msg, data) { _log('warn',  component, msg, data); },
      error: function(msg, data) { _log('error', component, msg, data); }
    };
  }

  // ── Start periodic flush ──
  function _startFlush() {
    if (_flushTimer) return;
    _flushTimer = setInterval(_flush, FLUSH_INTERVAL_MS);
    // Flush on page unload
    window.addEventListener('beforeunload', _flush);
  }

  // ── Export via BJ namespace ──
  if (typeof window.BJ !== 'undefined' && window.BJ.export) {
    window.BJ.export('createLogger', createLogger);
    window.BJ.export('setLogLevel', setLogLevel);
  }
  window.createStructuredLogger = createLogger;
  window.setLogLevel = setLogLevel;

  // Auto-start flush
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _startFlush);
  } else {
    _startFlush();
  }
})();
