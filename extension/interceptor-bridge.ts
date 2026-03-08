// interceptor-bridge.ts — Runs in ISOLATED world
// Relays intercepted data between MAIN world (interceptor.js) and background script
// Needed because MAIN world scripts cannot use chrome.runtime APIs

(function() {
  'use strict';

  // Listen for intercepted data posted from the MAIN world via window.postMessage
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'bj-interceptor') return;

    if (event.data.type === 'interceptedProfileData') {
      // Forward to background script
      chrome.runtime.sendMessage({
        type: 'interceptedProfileData',
        profileUrn: event.data.profileUrn,
        data: event.data.data
      }).catch(e => { try { chrome.runtime.sendMessage({ type: 'reportError', payload: { context: 'interceptor_bridge_msg', error: e?.message || String(e) } }).catch(() => {}); } catch {} });
    }
  });

  // Listen for requests from background script and relay to MAIN world
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'getInterceptedData' || msg.type === 'clearInterceptedData') {
      // Post to MAIN world and wait for response
      const responseId = 'bj-response-' + Date.now() + '-' + Math.random();
      let responded = false;
      
      const handler = (event) => {
        if (event.source !== window) return;
        if (!event.data || event.data.responseId !== responseId) return;
        if (responded) return;
        responded = true;
        window.removeEventListener('message', handler);
        sendResponse(event.data.result);
      };
      window.addEventListener('message', handler);
      
      // Timeout after 2 seconds
      setTimeout(() => {
        if (responded) return;
        responded = true;
        window.removeEventListener('message', handler);
        sendResponse(null);
      }, 2000);

      window.postMessage({
        source: 'bj-bridge',
        type: msg.type,
        profileSlug: msg.profileSlug,
        responseId
      }, '*');

      return true; // Keep sendResponse alive for async
    }
  });
})();
