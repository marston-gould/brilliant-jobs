// @ts-nocheck
/**
 * Brilliant Jobs — Safe localStorage Reader
 * CS-018: Extracted from inline <script> in index.html
 * CS-005: IX-FE-001 — wraps localStorage reads with try/catch
 */
window.safeReadLS = function safeReadLS(key, defaultVal) {
  try {
    var raw = localStorage.getItem(key);
    if (raw === null) return defaultVal;
    try { return JSON.parse(raw); } catch(e) { return raw; }
  } catch(e) { return defaultVal; }
};
