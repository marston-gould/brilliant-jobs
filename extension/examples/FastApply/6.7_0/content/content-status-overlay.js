/**
 * content-status-overlay.js
 * Global status overlay - injected on ALL pages via manifest
 * Controlled via chrome.runtime messages from platforms/background
 *
 * This follows the same pattern as content-bridge.js - thin and global
 */

// Lazy-loaded overlay instance
let overlayInstance = null;
let overlayModule = null;
let isInitializing = false;

/**
 * Initialize overlay lazily on first use
 * Uses dynamic import to load the overlay service
 */
async function getOverlay() {
  // Return existing instance if valid
  if (overlayInstance && !overlayInstance.isDestroyed) {
    return overlayInstance;
  }

  // Prevent multiple simultaneous initializations
  if (isInitializing) {
    // Wait for initialization to complete
    await new Promise((resolve) => {
      const check = setInterval(() => {
        if (!isInitializing) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });
    return overlayInstance;
  }

  isInitializing = true;

  try {
    // Dynamically import the overlay class from extension resources
    if (!overlayModule) {
      overlayModule = await import(
        chrome.runtime.getURL("services/status-notification-service.js")
      );
    }

    const ChatbotStatusOverlay = overlayModule.default;

    // Create the global overlay instance
    overlayInstance = new ChatbotStatusOverlay({
      id: "fastapply-global-overlay",
      title: "FastApply AI Assistant",
      botName: "FastApply Bot",
      platform: "FASTAPPLY",
      sessionId: window.automationSessionId || null,
      icon: "🤖",
      position: { top: "20px", right: "20px" },
    });
  } catch (error) {
    console.error("❌ Failed to initialize StatusOverlay:", error);
  } finally {
    isInitializing = false;
  }

  return overlayInstance;
}

/**
 * Handle late session context injection.
 * If the overlay was created before the background script injected the
 * automation context, adopt the sessionId and replay persisted history
 * so the conversation feels continuous across page navigations.
 */
window.addEventListener("AUTOMATION_CONTEXT_READY", (event) => {
  const sessionId = event.detail?.sessionId;
  if (!sessionId) return;

  if (overlayInstance && !overlayInstance.isDestroyed) {
    // Overlay already exists - adopt the session (handles buffered messages + history replay)
    overlayInstance.adoptSession(sessionId);
  }
  // If overlay doesn't exist yet, getOverlay() will pick up window.automationSessionId
});

/**
 * Global API - available on window.StatusOverlay
 * Platforms can use this directly for synchronous-like access
 */
window.StatusOverlay = {
  /**
   * Show a status message
   * @param {string} type - Message type (e.g., "APPLYING_TO_JOB", "RECAPTCHA_DETECTED")
   * @param {Object} data - Optional data for the message
   */
  async show(type, data = {}) {
    try {
      const overlay = await getOverlay();
      if (overlay) {
        overlay.handleMessage({ type, data });
        overlay.show();
      }
    } catch (error) {
      console.error("❌ StatusOverlay.show error:", error);
    }
  },

  /**
   * Hide the overlay
   */
  hide() {
    if (overlayInstance && !overlayInstance.isDestroyed) {
      overlayInstance.hide();
    }
  },

  /**
   * Update control buttons
   * @param {string} state - Button state (e.g., "auto-pilot", "co-pilot-next", "paused")
   */
  async updateButtons(state) {
    try {
      const overlay = await getOverlay();
      if (overlay) {
        overlay.updateButtons(state);
        overlay.show(); // Ensure overlay is visible when buttons are updated
      }
    } catch (error) {
      console.error("❌ StatusOverlay.updateButtons error:", error);
    }
  },

  /**
   * Clear all messages
   */
  clear() {
    if (overlayInstance && !overlayInstance.isDestroyed) {
      overlayInstance.clearMessages();
    }
  },

  /**
   * Check if overlay is ready
   */
  isReady() {
    return overlayInstance && !overlayInstance.isDestroyed;
  },

  /**
   * Destroy the overlay (for cleanup)
   */
  destroy() {
    if (overlayInstance) {
      overlayInstance.destroy();
      overlayInstance = null;
    }
  },
};

/**
 * Listen for STATUS_* messages from background/platforms
 * This allows platforms to send messages without direct DOM access
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type } = message;

  switch (type) {
    case "STATUS_UPDATE":
      // Main message handler - show a status message
      window.StatusOverlay.show(message.statusType, message.data || {});
      sendResponse({ success: true });
      return true;

    case "STATUS_HIDE":
      window.StatusOverlay.hide();
      sendResponse({ success: true });
      return true;

    case "STATUS_BUTTONS":
      window.StatusOverlay.updateButtons(message.state);
      sendResponse({ success: true });
      return true;

    case "STATUS_CLEAR":
      window.StatusOverlay.clear();
      sendResponse({ success: true });
      return true;

    default:
      // Not a status message - let other listeners handle it
      return false;
  }
});

// Log that the global overlay script is ready
