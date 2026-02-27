// background/background-new.js
// Simplified background service - uses new architecture

import AutomationController from "../core/automation-controller.js";
import MessageRouter from "../core/message-router.js";
import Logger from "../core/logger.js";

/**
 * BackgroundService - Minimal background service coordinator
 */
class BackgroundService {
  constructor() {
    this.logger = new Logger("BackgroundService", false);
    this.controller = null;
    this.router = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
      this.logger.warn("⚠️ BackgroundService already initialized");
      return;
    }

    try {
      // Create single controller
      this.controller = new AutomationController(false);

      // Create message router
      this.router = new MessageRouter(this.controller, this.logger);

      // Set up extension icon click handler
      chrome.action.onClicked.addListener(async () => {
        await this.openFastApplyWebsite();
      });

      this.isInitialized = true;
      this.logger.log("✅ BackgroundService initialized");
    } catch (error) {
      this.logger.error("❌ BackgroundService initialization failed:", error);
    }
  }

  async openFastApplyWebsite() {
    const url = "https://fastapply.co";
    const tabs = await chrome.tabs.query({ url: `${url}/*` });

    if (tabs.length > 0) {
      await chrome.tabs.update(tabs[0].id, { active: true });
      await chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url, active: true });
    }
  }
}

// Singleton instance
let service = null;

async function initializeService() {
  if (!service) {
    service = new BackgroundService();
  }
  await service.initialize();
}

// Initialize on startup
chrome.runtime.onStartup.addListener(initializeService);
chrome.runtime.onInstalled.addListener(async (details) => {
  await initializeService();

  if (details.reason === "install") {
    chrome.runtime.setUninstallURL("https://fastapply.co/goodbye.html");
    setTimeout(() => service?.openFastApplyWebsite(), 1000);
  }
});

// Allow content scripts to access chrome.storage.session (MV3 default is service-worker-only)
chrome.storage.session.setAccessLevel({
  accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
});

// Initialize immediately
initializeService();
