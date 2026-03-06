// inject-overlay.js — On-Page Status Overlay for Brilliant Jobs Extension
// v2.16.0 / v5.56: Item #3 — Floating overlay showing real-time fill progress,
// success confirmation, and error states during autofill.
//
// Injected by contentScript.js when a fill starts. Removes itself after
// completion + a short delay. Designed to be non-intrusive: bottom-right
// position, small footprint, click-to-dismiss.

(function () {
  'use strict';

  // CS-004 (EXT-SEC-002): HTML entity escaping for innerHTML injection protection
  function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  const OVERLAY_ID = 'bj-fill-overlay';
  const SHADOW_HOST_ID = 'bj-overlay-shadow-host';

  // ============================================================
  // CS-014: CX-09 — Shadow DOM host for style isolation
  // ============================================================
  var _shadowRoot = null;

  function getShadowRoot() {
    if (_shadowRoot) return _shadowRoot;
    var host = document.getElementById(SHADOW_HOST_ID);
    if (host) { _shadowRoot = host.shadowRoot; return _shadowRoot; }
    host = document.createElement('div');
    host.id = SHADOW_HOST_ID;
    host.style.cssText = 'position:fixed;bottom:0;right:0;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(host);
    _shadowRoot = host.attachShadow({ mode: 'open' });
    return _shadowRoot;
  }

  // ============================================================
  // CSS — injected into Shadow DOM (isolated from host page)
  // ============================================================

  function injectStyles() {
    var shadow = getShadowRoot();
    if (shadow.querySelector('style')) return;

    const style = document.createElement('style');
    style.textContent = `
      #${OVERLAY_ID} {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 2147483647;
        width: 320px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        line-height: 1.4;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
        border: 1px solid rgba(0,0,0,0.06);
        overflow: hidden;
        opacity: 0;
        transform: translateY(12px);
        transition: opacity 0.25s ease, transform 0.25s ease;
        pointer-events: auto;
      }
      #${OVERLAY_ID}.bj-visible {
        opacity: 1;
        transform: translateY(0);
      }
      #${OVERLAY_ID}.bj-hiding {
        opacity: 0;
        transform: translateY(12px);
      }

      /* Header bar */
      .bj-overlay-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: linear-gradient(135deg, #4d8eff 0%, #7c3aed 100%);
        color: #fff;
      }
      .bj-overlay-header .bj-title {
        font-weight: 600;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .bj-overlay-header .bj-close {
        background: rgba(255,255,255,0.2);
        border: none;
        color: #fff;
        width: 22px;
        height: 22px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
      }
      .bj-overlay-header .bj-close:hover {
        background: rgba(255,255,255,0.35);
      }

      /* Body */
      .bj-overlay-body {
        padding: 12px 14px;
      }

      /* Progress bar */
      .bj-progress-wrap {
        background: #f0f0f0;
        border-radius: 6px;
        height: 6px;
        margin-bottom: 10px;
        overflow: hidden;
      }
      .bj-progress-bar {
        height: 100%;
        border-radius: 6px;
        background: linear-gradient(90deg, #4d8eff, #7c3aed);
        width: 0%;
        transition: width 0.3s ease;
      }

      /* Status line */
      .bj-status-line {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #555;
        font-size: 12px;
      }
      .bj-status-line .bj-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid #e0e0e0;
        border-top-color: #4d8eff;
        border-radius: 50%;
        animation: bj-spin 0.8s linear infinite;
      }
      @keyframes bj-spin {
        to { transform: rotate(360deg); }
      }

      /* Field list */
      .bj-field-list {
        margin-top: 8px;
        max-height: 140px;
        overflow-y: auto;
        font-size: 11px;
      }
      .bj-field-item {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 3px 0;
        color: #777;
      }
      .bj-field-item.bj-filled {
        color: #2d8a56;
      }
      .bj-field-item.bj-skipped {
        color: #b87a00;
      }
      .bj-field-item.bj-error {
        color: #d14;
      }
      .bj-field-icon {
        width: 14px;
        text-align: center;
        flex-shrink: 0;
      }

      /* Success state */
      .bj-overlay-success .bj-overlay-header {
        background: linear-gradient(135deg, #2d8a56 0%, #22c55e 100%);
      }
      .bj-overlay-success .bj-progress-bar {
        background: linear-gradient(90deg, #2d8a56, #22c55e);
        width: 100% !important;
      }

      /* Error state */
      .bj-overlay-error .bj-overlay-header {
        background: linear-gradient(135deg, #d14 0%, #ef4444 100%);
      }
      .bj-overlay-error .bj-progress-bar {
        background: #d14;
      }
    `;
    shadow.appendChild(style);
  }

  // ============================================================
  // DOM — build the overlay
  // ============================================================

  function createOverlay() {
    var shadow = getShadowRoot();
    let el = shadow.getElementById ? shadow.getElementById(OVERLAY_ID) : shadow.querySelector('#' + OVERLAY_ID);
    if (el) el.remove();

    el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.innerHTML = `
      <div class="bj-overlay-header">
        <span class="bj-title">
          <span>⚡</span>
          <span class="bj-header-text">Brilliant Jobs — Filling</span>
        </span>
        <button class="bj-close" title="Dismiss">×</button>
      </div>
      <div class="bj-overlay-body">
        <div class="bj-progress-wrap"><div class="bj-progress-bar"></div></div>
        <div class="bj-status-line">
          <div class="bj-spinner"></div>
          <span class="bj-status-text">Detecting form fields…</span>
        </div>
        <div class="bj-field-list"></div>
      </div>
    `;
    shadow.appendChild(el);

    // Close button
    el.querySelector('.bj-close').addEventListener('click', () => dismiss());

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.classList.add('bj-visible'));
    });

    return el;
  }

  function dismiss() {
    const el = getShadowRoot().querySelector('#' + OVERLAY_ID);
    if (!el) return;
    el.classList.add('bj-hiding');
    el.classList.remove('bj-visible');
    setTimeout(() => el.remove(), 300);
  }

  // ============================================================
  // PUBLIC API — called from contentScript.js via window messages
  // ============================================================

  const overlay = {

    /** Show the overlay — call at start of fill */
    show() {
      injectStyles();
      createOverlay();
    },

    /** Update progress: { filled, total, currentField, pct } */
    progress({ filled = 0, total = 0, currentField = '', pct = 0 }) {
      const el = getShadowRoot().querySelector('#' + OVERLAY_ID);
      if (!el) return;

      const bar = el.querySelector('.bj-progress-bar');
      const text = el.querySelector('.bj-status-text');

      if (bar) bar.style.width = `${Math.min(pct, 100)}%`;
      if (text) text.textContent = currentField
        ? `Filling: ${currentField} (${filled}/${total})`
        : `${filled} of ${total} fields filled`;
    },

    /** Log a single field result: { name, status: 'filled'|'skipped'|'error', detail } */
    fieldResult({ name = '', status = 'filled', detail = '' }) {
      const el = getShadowRoot().querySelector('#' + OVERLAY_ID);
      if (!el) return;

      const list = el.querySelector('.bj-field-list');
      if (!list) return;

      const icons = { filled: '✓', skipped: '⊘', error: '✗' };
      const item = document.createElement('div');
      item.className = `bj-field-item bj-${status}`;
      item.innerHTML = `
        <span class="bj-field-icon">${icons[status] || '·'}</span>
        <span>${escHtml(name)}${detail ? ' — ' + escHtml(detail) : ''}</span>
      `;
      list.appendChild(item);
      list.scrollTop = list.scrollHeight;
    },

    /** Show success state: { filled, total, timeMs } */
    success({ filled = 0, total = 0, timeMs = 0 }) {
      const el = getShadowRoot().querySelector('#' + OVERLAY_ID);
      if (!el) return;

      el.classList.add('bj-overlay-success');
      const headerText = el.querySelector('.bj-header-text');
      if (headerText) headerText.textContent = 'Fill Complete';

      const spinner = el.querySelector('.bj-spinner');
      if (spinner) spinner.style.display = 'none';

      const text = el.querySelector('.bj-status-text');
      const secs = (timeMs / 1000).toFixed(1);
      if (text) text.textContent = `${filled}/${total} fields filled in ${secs}s`;

      // Auto-dismiss after 5s
      setTimeout(() => dismiss(), 5000);
    },

    /** Show error state: { message } */
    error({ message = 'Fill failed' }) {
      const el = getShadowRoot().querySelector('#' + OVERLAY_ID);
      if (!el) return;

      el.classList.add('bj-overlay-error');
      const headerText = el.querySelector('.bj-header-text');
      if (headerText) headerText.textContent = 'Fill Error';

      const spinner = el.querySelector('.bj-spinner');
      if (spinner) spinner.style.display = 'none';

      const text = el.querySelector('.bj-status-text');
      if (text) text.textContent = message;

      // Auto-dismiss after 8s
      setTimeout(() => dismiss(), 8000);
    },

    /** Dismiss programmatically */
    dismiss
  };

  // Expose on window for contentScript.js to call
  window.__bjOverlay = overlay;

  // Also listen for messages (for cross-context communication)
  window.addEventListener('message', (e) => {
    if (e.data?.source !== 'bj-overlay-control') return;
    const { action, payload } = e.data;
    if (overlay[action]) overlay[action](payload || {});
  });
})();
