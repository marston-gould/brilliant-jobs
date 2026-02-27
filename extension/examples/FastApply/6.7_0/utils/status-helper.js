/**
 * status-helper.js
 * Simple helper functions for status notifications
 *
 * Use these in any platform file for reliable status updates.
 * The global overlay is injected by content-status-overlay.js
 */

/**
 * Show a status message
 * Uses global API if available, falls back to chrome message
 *
 * Supports both calling formats:
 *   notifyStatus("TYPE", { data })         - new preferred format
 *   notifyStatus({ type: "TYPE", data })   - legacy object format
 *
 * @example
 * notifyStatus("AUTOMATION_STARTING");
 * notifyStatus("APPLYING_TO_JOB", { title: "Software Engineer" });
 * notifyStatus({ type: "RECAPTCHA_DETECTED" }); // legacy format
 */
export function notifyStatus(typeOrMessage, data = {}) {
  // Handle legacy object format: notifyStatus({ type, data })
  let type = typeOrMessage;
  let messageData = data;

  if (typeof typeOrMessage === "object" && typeOrMessage.type) {
    type = typeOrMessage.type;
    messageData = typeOrMessage.data || {};
  }

  // Try global API first (fastest, synchronous-like)
  if (window.StatusOverlay?.isReady()) {
    window.StatusOverlay.show(type, messageData);
    return;
  }

  // If global API not ready yet, use it anyway (will lazy-init)
  if (window.StatusOverlay) {
    window.StatusOverlay.show(type, messageData);
    return;
  }

  // Fallback to Chrome message (works even if overlay script not loaded)
  try {
    chrome.runtime.sendMessage({
      type: "STATUS_UPDATE",
      statusType: type,
      data: messageData,
    });
  } catch (error) {
    console.warn("⚠️ Could not send status update:", error);
  }
}

/**
 * Hide the status overlay
 */
export function hideStatus() {
  if (window.StatusOverlay) {
    window.StatusOverlay.hide();
  }
}

/**
 * Update the control buttons on the overlay
 * @param {string} state - Button state (e.g., "auto-pilot", "co-pilot-next", "paused")
 */
export function updateStatusButtons(state) {
  if (window.StatusOverlay) {
    window.StatusOverlay.updateButtons(state);
  }
}

/**
 * Clear all messages from the overlay
 */
export function clearStatus() {
  if (window.StatusOverlay) {
    window.StatusOverlay.clear();
  }
}

/**
 * Check if the status overlay is ready
 * @returns {boolean}
 */
export function isStatusReady() {
  return window.StatusOverlay?.isReady() ?? false;
}
