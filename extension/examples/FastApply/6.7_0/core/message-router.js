
/**
 * MessageRouter - Routes messages to appropriate handlers
 * Replaces the bloated message-handler.js with clean delegation
 */
export default class MessageRouter {
  constructor(controller, logger) {
    this.controller = controller;
    this.logger = logger;
    this.setupListeners();
  }

  /**
   * Set up Chrome message listeners
   */
  setupListeners() {
    // External messages (from Next.js frontend)
    chrome.runtime.onMessageExternal.addListener(
      (request, sender, sendResponse) => {
        this.handleExternalMessage(request, sender, sendResponse);
        return true; // Keep channel open for async response
      }
    );

    // Internal messages (from content scripts)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleInternalMessage(request, sender, sendResponse);
      return true;
    });

    // Port connections (backward compatibility with existing platform files)
    chrome.runtime.onConnect.addListener((port) => {
      this.handlePortConnection(port);
    });

    // Tab events
    chrome.tabs.onCreated.addListener((tab) => {
      if (tab.windowId && this.controller.isAutomationWindow(tab.windowId)) {
        this.controller.handleTabCreated(tab.id, tab.windowId);
      }
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === "complete") {
        this.controller.handleTabUpdated(tabId, tab);
      }
    });

    // Window events
    chrome.windows.onRemoved.addListener((windowId) => {
      this.controller.handleWindowClosed(windowId);
    });

    this.logger.log("✅ Message listeners configured");
  }

  /**
   * Handle port connections from platform content scripts
   * Provides backward compatibility with existing port-based platforms
   * @param {chrome.runtime.Port} port
   */
  handlePortConnection(port) {
    const portName = port.name;
    const tabId = port.sender?.tab?.id;
    const windowId = port.sender?.tab?.windowId;

    this.logger.log(`🔌 Port connected: ${portName}`);

    // Get session for this tab/window
    const session =
      this.controller.getSessionForTab(tabId) ||
      this.controller.getSessionForWindow(windowId);

    if (!session) {
      this.logger.warn(`⚠️ Port ${portName} connected but no session found`);
    }

    // Handle messages from port
    port.onMessage.addListener((message) => {
      const { type, data } = message;

      // Create a sendResponse function that sends back through port
      const sendResponse = (response) => {
        try {
          port.postMessage(response);
        } catch (e) {
          // Port may be disconnected
        }
      };

      // Route to internal message handler
      this.handleInternalMessage(
        { type, ...data, ...message },
        { tab: port.sender?.tab },
        sendResponse
      );
    });

    // Handle disconnect
    port.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError;
      if (error) {
        this.logger.log(
          `🔌 Port ${portName} disconnected with error:`,
          error.message
        );
      } else {
        this.logger.log(`🔌 Port ${portName} disconnected`);
      }
    });

    // Send connection acknowledgment
    try {
      port.postMessage({
        type: "CONNECTION_ESTABLISHED",
        sessionId: session?.id,
        hasSession: !!session,
      });
    } catch (e) {
      // Port may already be disconnected
    }
  }

  /**
   * Handle messages from Next.js frontend
   * @param {Object} request
   * @param {Object} sender
   * @param {Function} sendResponse
   */
  async handleExternalMessage(request, sender, sendResponse) {
    console.log(request)
    const { action } = request;
    this.logger.log(`📨 External message: ${action}`);

    try {
      switch (action) {
        case "startApplying":
          const result = await this.controller.startAutomation(request);
          sendResponse(result);
          break;

        case "pauseApplying":
          const pauseResult = await this.controller.pauseAutomation(
            request.sessionId
          );
          sendResponse(pauseResult);
          break;

        case "resumeApplying":
          const resumeResult = await this.controller.resumeAutomation(
            request.sessionId
          );
          sendResponse(resumeResult);
          break;

        case "stopApplying":
          const stopResult = await this.controller.stopAutomation(
            request.sessionId,
            request.reason
          );
          sendResponse(stopResult);
          break;

        case "getStatus":
          const status = this.controller.getStatus(request.sessionId);
          sendResponse(status);
          break;

        case "startMultiPlatformApplying":
          const multiResult =
            await this.controller.startMultiPlatformAutomation(request);
          sendResponse(multiResult);
          break;

        case "stopQueue":
          const stopQueueResult = await this.controller.stopQueue(
            request.reason
          );
          sendResponse(stopQueueResult);
          break;

        case "getQueueStatus":
          const queueStatus = this.controller.getQueueStatus();
          sendResponse(queueStatus || { error: "No active queue" });
          break;

        // Link Queue Operations
        case "startLinkQueueApplying":
          const linkQueueResult =
            await this.controller.startLinkQueueAutomation(request);
          sendResponse(linkQueueResult);
          break;

        case "stopLinkQueue":
          const stopLinkQueueResult = await this.controller.stopLinkQueue(
            request.reason
          );
          sendResponse(stopLinkQueueResult);
          break;

        case "getLinkQueueStatus":
          const linkQueueStatus = this.controller.getLinkQueueStatus();
          sendResponse(linkQueueStatus || { error: "No active link queue" });
          break;

        // Aggregator Automation
        case "startAggregatorApplying":
          const aggregatorResult =
            await this.controller.startAggregatorAutomation(request);
          sendResponse(aggregatorResult);
          break;

        // Universal Automation (non-easy-apply from known platforms)
        case "startUniversalApplying":
          const universalResult = await this.controller.startAutomation({
            ...request,
            isUniversalMode: true,
          });
          sendResponse(universalResult);
          break;

        case "ping":
          sendResponse({ status: "ok", timestamp: Date.now() });
          break;

        default:
          sendResponse({ error: `Unknown action: ${action}` });
      }
    } catch (error) {
      this.logger.error(`❌ Error handling external message:`, error);
      sendResponse({ error: error.message });
    }
  }

  /**
   * Handle messages from content scripts
   * @param {Object} request
   * @param {Object} sender
   * @param {Function} sendResponse
   */
  async handleInternalMessage(request, sender, sendResponse) {
    const { action, type } = request;
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;

    try {
      // Handle by action type
      const messageType = type || action;
      switch (messageType) {
        // Context requests
        case "getContext":
        case "getFullSessionContext":
        case "checkIfAutomationWindow":
          this.handleContextRequest(sender, sendResponse);
          break;

        // Application flow messages (previously in background handlers)
        case "START_APPLICATION":
        case "OPEN_APPLICATION_TAB":
          await this.handleStartApplication(request, sender, sendResponse);
          break;

        case "CHECK_CAN_APPLY":
          await this.handleCheckCanApply(request, sender, sendResponse);
          break;

        case "GET_SEARCH_TASK":
          this.handleGetSearchTask(sender, sendResponse);
          break;

        case "GET_APPLICATION_TASK":
          this.handleGetApplicationTask(sender, sendResponse);
          break;

        case "GET_PROFILE_DATA":
          this.handleGetProfileData(sender, sendResponse);
          break;

        // Job completion events
        case "JOB_SUCCESS":
        case "APPLICATION_COMPLETED":
          await this.handleJobSuccess(request, sender, sendResponse);
          break;

        case "JOB_FAILURE":
        case "APPLICATION_ERROR":
          this.handleJobFailure(request, sender, sendResponse);
          break;

        case "JOB_SKIPPED":
        case "APPLICATION_SKIPPED":
        case "SKIPPED":
          this.handleJobSkipped(request, sender, sendResponse);
          break;

        // Control actions from UI overlay
        case "CONTROL_ACTION":
          await this.handleControlAction(request, sender, sendResponse);
          break;

        // Copilot mode update from platform (persist across page navigations)
        case "UPDATE_COPILOT_MODE":
          this.handleUpdateCopilotMode(request, sender, sendResponse);
          break;

        // Content script ready notification (handshake pattern)
        case "CONTENT_SCRIPT_READY":
        case "contentScriptReady":
          await this.handleContentReady(sender, sendResponse);
          break;

        // Legacy platform messages
        case "SEARCH_NEXT_READY":
          // Platform is ready to receive next job
          sendResponse({
            type: "NEXT_READY_ACKNOWLEDGED",
            data: { status: "success" },
          });
          break;

        case "SEARCH_COMPLETED":
          // All jobs processed
          this.handleSearchCompleted(request, sender, sendResponse);
          break;

        case "ALREADY_APPLIED":
          // Platform detected already applied, send SEARCH_NEXT
          await this.handleAlreadyApplied(request, sender, sendResponse);
          break;

        case "NOTIFY_JOB_APPLIED":
          // Single-tab platforms use this to notify frontend without closing tab
          await this.handleNotifyJobApplied(request, sender, sendResponse);
          break;

        case "AUTOMATION_STOPPED":
          this.handleAutomationStopped(request, sender, sendResponse);
          break;

        // Keepalive (just acknowledge)
        case "KEEPALIVE":
          sendResponse({ acknowledged: true });
          break;

        // ============================================
        // Universal Job Router & Aggregator Messages
        // ============================================

        case "ROUTE_JOB_URL":
          await this.handleRouteJobUrl(request, sender, sendResponse);
          break;

        case "CLASSIFY_PAGE":
          await this.handleClassifyPage(request, sender, sendResponse);
          break;

        case "GET_PAGE_CONTENT":
          await this.handleGetPageContent(request, sender, sendResponse);
          break;

        case "CLICK_APPLY_BUTTON":
          await this.handleClickApplyButton(request, sender, sendResponse);
          break;

        case "DETECT_BLOCKED_STATE":
          await this.handleDetectBlockedState(request, sender, sendResponse);
          break;

        case "AGGREGATOR_JOB_CLICKED":
          await this.handleAggregatorJobClicked(request, sender, sendResponse);
          break;

        case "REDIRECT_DETECTED":
          await this.handleRedirectDetected(request, sender, sendResponse);
          break;

        case "ROUTE_EXTERNAL_APPLY":
          await this.handleRouteExternalApply(request, sender, sendResponse);
          break;

        case "HANDLE_CROSS_ORIGIN_FORM":
          await this.handleCrossOriginForm(request, sender, sendResponse);
          break;

        case "FETCH_FILE":
          await this.handleFetchFile(request, sendResponse);
          break;

        default:
          // Unknown message type - no special handler needed
          sendResponse({ error: `Unknown message type: ${messageType}` });
      }
    } catch (error) {
      this.logger.error(`❌ Error handling internal message:`, error);
      sendResponse({ error: error.message });
    }
  }

  /**
   * Handle context request from content script
   */
  handleContextRequest(sender, sendResponse) {
    const session = this.getSessionWithFallback(sender);

    if (session) {
      sendResponse({
        isAutomationWindow: true,
        sessionContext: session.getContext(),
      });
    } else {
      sendResponse({
        isAutomationWindow: this.controller.isAutomationWindow(
          sender.tab?.windowId
        ),
        sessionContext: null,
      });
    }
  }

  /**
   * Handle job success - save job, close tab, send SEARCH_NEXT
   * In link queue mode: triggers handleLinkComplete to move to next link
   */
  async handleJobSuccess(request, sender, sendResponse) {
    const session = this.getSessionWithFallback(sender);
    if (!session) {
      sendResponse({ error: "Session not found" });
      return;
    }

    // Extract jobData - handle both nested (glassdoor) and flat structures
    const jobData = request.jobData || request.data?.jobData || request.data;
    const currentTabId = sender.tab?.id;

    // Record success and notify frontend (must await to ensure JOB_APPLIED is sent)
    await this.controller.recordJobSuccess(session.id, jobData);

    // Check if this is a link queue mode session
    if (session.isLinkQueueMode && this.controller.hasActiveLinkQueue()) {
      console.log(`📋 Link queue mode - triggering handleLinkComplete`);

      // Trigger link completion to move to next link
      // This will close the window and start the next link
      await this.controller.handleLinkComplete(session.id, {
        success: true,
        jobData,
      });

      sendResponse({ success: true, linkQueueMode: true });
      return;
    }

    // Normal mode - close the job tab (not the search tab)
    if (currentTabId && currentTabId !== session.searchTabId) {
      try {
        await chrome.tabs.remove(currentTabId);
        console.log(`✅ Closed job tab ${currentTabId}`);
      } catch (error) {
        console.warn(`Could not close tab ${currentTabId}:`, error.message);
      }
    }

    // Reset current job state
    session.currentJobTabId = null;
    session.currentJobUrl = null;
    session.currentJobId = null;

    // Send SEARCH_NEXT to search tab to continue
    if (session.searchTabId) {
      setTimeout(() => {
        this.sendSearchNext(session.searchTabId, {
          url: jobData?.url || request.url,
          status: "SUCCESS",
          message: "Application completed - continuing to next job",
        });
      }, 1500);
    }

    sendResponse({ success: true });
  }

  /**
   * Handle job applied notification for single-tab platforms
   * Records success and notifies frontend, does NOT close tab or send SEARCH_NEXT
   */
  async handleNotifyJobApplied(request, sender, sendResponse) {
    const session = this.getSessionWithFallback(sender);
    const jobData = request.jobData || request.data;

    // Record the success in session progress
    if (session) {
      session.recordSuccess(jobData);
    }

    // Notify frontend about the successful application
    await this.controller.notifyFrontend({
      type: "JOB_APPLIED",
      sessionId: session?.id,
      platform: jobData?.platform || session?.platform,
      jobData: jobData,
      progress: session ? { ...session.progress } : null,
      timestamp: Date.now(),
    });

    sendResponse({ success: true });
  }

  /**
   * Handle job failure - close tab, send SEARCH_NEXT
   * In link queue mode: triggers handleLinkComplete to move to next link
   */
  async handleJobFailure(request, sender, sendResponse) {
    const session = this.getSessionWithFallback(sender);
    if (!session) {
      sendResponse({ error: "Session not found" });
      return;
    }

    const jobData = request.jobData || request.data;
    const currentTabId = sender.tab?.id;
    const errorMessage = request.error || request.message;

    // Record failure
    this.controller.recordJobFailure(session.id, jobData, errorMessage);

    // Check if this is a link queue mode session
    if (session.isLinkQueueMode && this.controller.hasActiveLinkQueue()) {
      console.log(`📋 Link queue mode (failure) - triggering handleLinkComplete`);

      // Trigger link completion to move to next link
      await this.controller.handleLinkComplete(session.id, {
        success: false,
        error: errorMessage,
        jobData,
      });

      sendResponse({ success: true, linkQueueMode: true });
      return;
    }

    // Normal mode - close the job tab
    if (currentTabId && currentTabId !== session.searchTabId) {
      try {
        await chrome.tabs.remove(currentTabId);
        console.log(`✅ Closed job tab ${currentTabId} after failure`);
      } catch (error) {
        console.warn(`Could not close tab:`, error.message);
      }
    }

    // Reset current job state
    session.currentJobTabId = null;
    session.currentJobUrl = null;
    session.currentJobId = null;

    // Send SEARCH_NEXT to continue
    if (session.searchTabId) {
      setTimeout(() => {
        this.sendSearchNext(session.searchTabId, {
          url: jobData?.url || request.url,
          status: "ERROR",
          error: errorMessage,
          message: "Application error - continuing to next job",
        });
      }, 2000);
    }

    sendResponse({ success: true });
  }

  /**
   * Handle job skipped - close tab, send SEARCH_NEXT
   * In link queue mode: triggers handleLinkComplete to move to next link
   */
  async handleJobSkipped(request, sender, sendResponse) {
    const session = this.getSessionWithFallback(sender);
    if (!session) {
      sendResponse({ error: "Session not found" });
      return;
    }

    const jobData = request.jobData || request.data;
    const currentTabId = sender.tab?.id;
    const reason = request.reason || "Skipped";

    // Record skipped
    this.controller.recordJobSkipped(session.id, jobData, reason);

    // Check if this is a link queue mode session
    if (session.isLinkQueueMode && this.controller.hasActiveLinkQueue()) {
      console.log(`📋 Link queue mode (skipped) - triggering handleLinkComplete`);

      // Trigger link completion to move to next link
      await this.controller.handleLinkComplete(session.id, {
        success: false,
        skipped: true,
        reason,
        jobData,
      });

      sendResponse({ success: true, linkQueueMode: true });
      return;
    }

    // Normal mode - close the job tab
    if (currentTabId && currentTabId !== session.searchTabId) {
      try {
        await chrome.tabs.remove(currentTabId);
        console.log(`✅ Closed job tab ${currentTabId} after skip`);
      } catch (error) {
        console.warn(`Could not close tab:`, error.message);
      }
    }

    // Reset current job state
    session.currentJobTabId = null;
    session.currentJobUrl = null;
    session.currentJobId = null;

    // Send SEARCH_NEXT to continue
    if (session.searchTabId) {
      setTimeout(() => {
        this.sendSearchNext(session.searchTabId, {
          url: jobData?.url || request.url,
          status: "SKIPPED",
          reason,
          message: "Application skipped - continuing to next job",
        });
      }, 1000);
    }

    sendResponse({ success: true });
  }

  /**
   * Handle control action from status overlay
   */
  async handleControlAction(request, sender, sendResponse) {
    const session = this.getSessionWithFallback(sender);
    if (!session) {
      sendResponse({ error: "Session not found" });
      return;
    }

    const { action, platform } = request;
    console.log(`🎮 CONTROL_ACTION received: ${action}`);

    // Handle background-level actions (pause/resume/stop)
    switch (action) {
      case "PAUSE":
        await this.controller.pauseAutomation(session.id);
        sendResponse({ success: true });
        return;
      case "RESUME":
        await this.controller.resumeAutomation(session.id);
        sendResponse({ success: true });
        return;
      case "STOP":
        await this.controller.stopAutomation(session.id);
        sendResponse({ success: true });
        return;
      case "SWITCH_TO_COPILOT":
        session.updateCopilotMode("co-pilot");
        console.log(`🔄 Copilot mode persisted in session: co-pilot`);
        // Broadcast MODE_SWITCHED to all automation tabs so overlays update internal state
        this.broadcastModeSwitch(session, "co-pilot");
        break;
      case "SWITCH_TO_AUTOPILOT":
        session.updateCopilotMode("auto-pilot");
        console.log(`🔄 Copilot mode persisted in session: auto-pilot`);
        // Broadcast MODE_SWITCHED to all automation tabs so overlays update internal state
        this.broadcastModeSwitch(session, "auto-pilot");
        break;
    }

    // For all other actions (SWITCH_TO_COPILOT, SWITCH_TO_AUTOPILOT, SKIP, SUBMIT, NEXT, etc.),
    // forward to the appropriate content script tab
    const targetTabId =
      sender.tab?.id || session.currentJobTabId || session.searchTabId;

    if (targetTabId) {
      try {
        await chrome.tabs.sendMessage(targetTabId, {
          type: "CONTROL_ACTION",
          action: action,
          platform: platform,
          sessionId: session.id,
        });
        console.log(
          `✅ Forwarded CONTROL_ACTION ${action} to tab ${targetTabId}`
        );
        sendResponse({ success: true });
      } catch (error) {
        console.warn(
          `⚠️ Could not forward CONTROL_ACTION to tab ${targetTabId}:`,
          error.message
        );
        sendResponse({ success: false, error: error.message });
      }
    } else {
      console.warn(`⚠️ No target tab found for CONTROL_ACTION ${action}`);
      sendResponse({ success: false, error: "No target tab found" });
    }
  }

  /**
   * Handle copilot mode update from platform content scripts
   * Persists the mode in session state so new tabs receive the updated mode
   */
  handleUpdateCopilotMode(request, sender, sendResponse) {
    const session = this.getSessionWithFallback(sender);
    if (!session) {
      sendResponse({ error: "Session not found" });
      return;
    }

    const mode = request.data?.mode || request.mode;
    if (mode) {
      session.updateCopilotMode(mode);
      console.log(`🔄 Copilot mode persisted in session: ${mode}`);
      sendResponse({ success: true });
    } else {
      sendResponse({ error: "No mode provided" });
    }
  }

  /**
   * Broadcast MODE_SWITCHED to all tabs in the automation window
   * so every overlay updates its internal copilotMode state.
   */
  broadcastModeSwitch(session, mode) {
    if (!session.windowId) return;
    chrome.tabs.query({ windowId: session.windowId }, (tabs) => {
      for (const tab of tabs || []) {
        chrome.tabs
          .sendMessage(tab.id, {
            type: "STATUS_UPDATE",
            statusType: "MODE_SWITCHED",
            data: { mode },
          })
          .catch(() => {});
      }
    });
  }

  // ============================================
  // Application Flow Handlers (from background handlers)
  // ============================================

  /**
   * Helper to get session with tab-first, window-fallback lookup
   * Also registers the tab if found by window
   */
  getSessionWithFallback(sender) {
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;

    let session = this.controller.getSessionForTab(tabId);
    if (!session && windowId) {
      session = this.controller.getSessionForWindow(windowId);
      // If found by window, register this tab
      if (session && tabId) {
        this.controller.tabToSession.set(tabId, session.id);
        console.log(
          `📑 Registered tab ${tabId} to session ${session.id} via window lookup`
        );
      }
    }
    return session;
  }

  /**
   * Production-ready tab creation with window validation and fallback
   * Handles slow networks, closed windows, and race conditions
   * @param {string} url - URL to open
   * @param {number} preferredWindowId - Preferred window ID (may be stale)
   * @param {object} options - Additional tab options (active, etc.)
   * @returns {Promise<chrome.tabs.Tab>} - Created tab
   */
  async createTabSafely(url, preferredWindowId, options = {}) {
    const maxRetries = 2;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Determine which window to use
        let targetWindowId = null;

        // Try preferred window first (if provided and valid)
        if (preferredWindowId) {
          try {
            const window = await chrome.windows.get(preferredWindowId);
            if (window && !window.focused === false) {
              // Window exists
              targetWindowId = preferredWindowId;
            }
          } catch (e) {
            console.log(
              `⚠️ Preferred window ${preferredWindowId} not available: ${e.message}`
            );
          }
        }

        // Fallback to last focused window if preferred not available
        if (!targetWindowId) {
          try {
            const [focusedWindow] = await chrome.windows.getAll({
              windowTypes: ["normal"],
              populate: false,
            });
            if (focusedWindow) {
              targetWindowId = focusedWindow.id;
              console.log(`📋 Using fallback window: ${targetWindowId}`);
            }
          } catch (e) {
            console.log(`⚠️ Could not get fallback window: ${e.message}`);
          }
        }

        // Create tab with or without window specification
        const tabOptions = {
          url,
          active: options.active !== false, // Default true
          ...(targetWindowId && { windowId: targetWindowId }),
        };

        const tab = await chrome.tabs.create(tabOptions);
        console.log(
          `✅ Tab created successfully (attempt ${attempt + 1}): ${
            tab.id
          } in window ${tab.windowId}`
        );
        return tab;
      } catch (error) {
        lastError = error;
        console.warn(
          `⚠️ Tab creation attempt ${attempt + 1} failed: ${error.message}`
        );

        // If it's a window error, clear preferred and retry without windowId
        if (
          error.message?.includes("No window with id") ||
          error.message?.includes("window") ||
          error.message?.includes("Window")
        ) {
          preferredWindowId = null; // Clear for next attempt
        }

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
      }
    }

    // All retries exhausted - throw with context
    throw new Error(
      `Failed to create tab after ${maxRetries + 1} attempts: ${
        lastError?.message || "Unknown error"
      }`
    );
  }

  /**
   * Handle START_APPLICATION - Create job tab and track for SEARCH_NEXT
   * This implements the two-tab flow: search tab → job tab → SEARCH_NEXT
   */
  async handleStartApplication(request, sender, sendResponse) {
    const session = this.getSessionWithFallback(sender);
    if (!session) {
      console.error(
        `❌ START_APPLICATION: No session found for tab ${sender.tab?.id}`
      );
      sendResponse({ error: "Session not found" });
      return;
    }

    // Platforms wrap data in request.data, so extract from there or fallback to request
    const payload = request.data || request;
    const { url, jobId, title, company, requestId } = payload;
    if (!url) {
      console.error("❌ START_APPLICATION: No URL provided");
      sendResponse({ error: "No URL provided" });
      return;
    }

    const searchTabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;

    // Check if can apply (credit limits, already applied)
    if (jobId && session.applicationTracker) {
      try {
        const result = await session.applicationTracker.checkCanApply(jobId);
        if (result.alreadyApplied) {
          sendResponse({
            type: "ALREADY_APPLIED",
            canProceed: false,
            message: "Already applied to this job",
            data: {
              url,
              title,
              company,
              requestId,
            },
          });
          // Send SEARCH_NEXT to continue
          setTimeout(
            () =>
              this.sendSearchNext(searchTabId, {
                url,
                title,
                status: "SKIPPED",
                reason: "Already applied",
              }),
            500
          );
          return;
        }

        if (!result.canApply) {
          sendResponse({
            canProceed: false,
            message: "Application limit reached",
          });

          // Send SEARCH_NEXT to continue - platform will show status overlay based on reason
          setTimeout(
            () =>
              this.sendSearchNext(searchTabId, {
                url,
                title,
                status: "SKIPPED",
                reason: "Limit reached",
              }),
            500
          );
          return;
        }
      } catch (error) {
        this.logger.error("Error checking can apply:", error);
      }
    }

    // Check if company is blacklisted
    const companyBlacklist =
      session.config?.preferences?.companyBlacklist || [];
    if (company && companyBlacklist.length > 0) {
      const normalizedCompany = company.toLowerCase().trim();
      const isBlacklisted = companyBlacklist.some(
        (blacklistedCompany) =>
          blacklistedCompany.toLowerCase().trim() === normalizedCompany
      );

      if (isBlacklisted) {
        console.log(`🚫 Company "${company}" is blacklisted - skipping`);
        // Simple response without type to avoid duplicate handling
        sendResponse({
          canProceed: false,
          message: "You blacklisted this company",
        });

        // Send SEARCH_NEXT to continue - platform will show status overlay based on reason
        setTimeout(
          () =>
            this.sendSearchNext(searchTabId, {
              url,
              title,
              company,
              status: "SKIPPED",
              reason: "Company blacklisted",
            }),
          500
        );
        return;
      }
    }

    // Track the search tab for this session (to send SEARCH_NEXT later)
    if (!session.searchTabId) {
      session.searchTabId = searchTabId;
    }

    // Create job application tab with robust error handling
    try {
      const tab = await this.createTabSafely(url, windowId, { active: true });

      // Track current job state in session
      session.currentJobTabId = tab.id;
      session.currentJobUrl = url;
      session.currentJobId = jobId;
      session.applicationStartTime = Date.now();

      // Register this tab to the session
      this.controller.tabToSession.set(tab.id, session.id);

      console.log(`✅ START_APPLICATION: Created job tab ${tab.id} for ${url}`);

      // Wait for tab to load the target URL, then send START_AUTOMATION_NOW
      const onUpdatedListener = (tabId, changeInfo, updatedTab) => {
        if (
          tabId === tab.id &&
          changeInfo.status === "complete" &&
          updatedTab.url &&
          updatedTab.url !== "chrome://newtab/"
        ) {
          // Remove listener
          chrome.tabs.onUpdated.removeListener(onUpdatedListener);

          // Wait a bit for content script to initialize, then send message
          setTimeout(async () => {
            try {
              await chrome.tabs.sendMessage(tab.id, {
                type: "START_AUTOMATION_NOW",
                data: { url, jobId, immediate: true },
              });
              console.log(`✅ Sent START_AUTOMATION_NOW to tab ${tab.id}`);
            } catch (error) {
              console.warn(
                `⚠️ Could not send START_AUTOMATION_NOW:`,
                error.message
              );
            }
          }, 2000);
        }
      };

      chrome.tabs.onUpdated.addListener(onUpdatedListener);

      // Timeout fallback - remove listener after 15 seconds
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(onUpdatedListener);
      }, 15000);

      sendResponse({
        type: "APPLICATION_STARTING",
        canProceed: true,
        sessionId: session.id,
        tabId: tab.id,
      });
    } catch (error) {
      console.error("Error creating job tab:", error);
      sendResponse({
        type: "ERROR",
        canProceed: false,
        message: error.message,
      });
    }
  }

  /**
   * Send SEARCH_NEXT message to search tab to continue processing
   */
  async sendSearchNext(tabId, data) {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: "SEARCH_NEXT",
        data: data,
      });
      console.log(`✅ Sent SEARCH_NEXT to tab ${tabId}`);
      return true;
    } catch (error) {
      console.warn(
        `⚠️ Could not send SEARCH_NEXT to tab ${tabId}:`,
        error.message
      );
      return false;
    }
  }

  /**
   * Handle CHECK_CAN_APPLY - credit/limit check
   */
  async handleCheckCanApply(request, sender, sendResponse) {
    const session = this.getSessionWithFallback(sender);
    if (!session) {
      sendResponse({ canApply: false, error: "Session not found" });
      return;
    }

    const result = await this.controller.checkCanApply(
      session.id,
      request.jobId
    );
    sendResponse(result);
  }

  /**
   * Handle GET_SEARCH_TASK - return search config from session
   */
  async handleGetSearchTask(sender, sendResponse) {
    const session = this.getSessionWithFallback(sender);
    if (!session) {
      console.error(`❌ GET_SEARCH_TASK: No session found`);
      sendResponse({ error: "Session not found" });
      return;
    }

    const platformConfig = this.controller.getPlatformConfig(session.platform);

    const responseData = {
      type: "SEARCH_TASK",
      data: {
        limit: session.config.jobsToApply,
        current: session.progress?.completed || 0,
        domain: platformConfig?.domains || [],
        searchLinkPattern: platformConfig?.linkPattern?.source || null,
        userProfile: session.userProfile,
        preferences: session.config.preferences,
        submittedLinks: [],
      },
    };

    console.log(`✅ GET_SEARCH_TASK responding for session ${session.id}`);

    // Send via sendResponse for callback-based callers
    sendResponse(responseData);

    // Also send via tabs.sendMessage for fire-and-forget callers
    if (sender.tab?.id) {
      try {
        await chrome.tabs.sendMessage(sender.tab.id, responseData);
        console.log(`📤 Sent SEARCH_TASK to tab ${sender.tab.id}`);
      } catch (error) {
        // Tab might not have listener ready yet
        console.warn(`Could not send SEARCH_TASK to tab:`, error.message);
      }
    }
  }

  /**
   * Handle GET_APPLICATION_TASK - return profile data for application
   */
  handleGetApplicationTask(sender, sendResponse) {
    const session = this.getSessionWithFallback(sender);
    if (!session) {
      sendResponse({ error: "Session not found" });
      return;
    }

    sendResponse({
      type: "APPLICATION_TASK",
      data: {
        userProfile: session.userProfile,
        preferences: session.config.preferences,
        backendApiHost: session.config.backendApiHost,
        aiApiHost: session.config.aiApiHost,
        jwtToken: session.config.jwtToken,
      },
    });
  }

  /**
   * Handle GET_PROFILE_DATA - return user profile
   */
  handleGetProfileData(sender, sendResponse) {
    const session = this.getSessionWithFallback(sender);
    if (!session) {
      sendResponse({ error: "Session not found" });
      return;
    }

    sendResponse({
      type: "PROFILE_DATA",
      data: {
        userProfile: session.userProfile,
      },
    });
  }

  /**
   * Handle content script ready - handshake pattern
   * Content script signals ready, we inject context in response
   */
  async handleContentReady(sender, sendResponse) {
    const session = this.getSessionWithFallback(sender);

    if (session && sender.tab?.id) {
      // Inject context now that content script is ready to receive it
      const success = await this.controller.injectContext(
        sender.tab.id,
        session
      );
      console.log(
        `🤝 Handshake: Content script ready, context injected: ${success}`
      );

      sendResponse({
        acknowledged: true,
        hasSession: true,
        contextInjected: success,
      });
    } else {
      sendResponse({
        acknowledged: true,
        hasSession: false,
        contextInjected: false,
      });
    }
  }

  /**
   * Handle search completed - all jobs processed
   * In link queue mode: triggers handleLinkComplete to move to next link
   */
  async handleSearchCompleted(request, sender, sendResponse) {
    const session = this.getSessionWithFallback(sender);

    console.log(`📋 handleSearchCompleted called:`, {
      hasSession: !!session,
      sessionId: session?.id,
      platform: session?.platform,
      hasQueue: !!this.controller.platformQueue,
      queueActive: this.controller.hasActiveQueue?.() || false,
      hasLinkQueue: !!this.controller.linkQueue,
      linkQueueActive: this.controller.hasActiveLinkQueue?.() || false,
      isLinkQueueMode: session?.isLinkQueueMode || false,
      senderTabId: sender.tab?.id,
      senderWindowId: sender.tab?.windowId,
    });

    if (session) {
      const progress = session.progress || {
        completed: 0,
        failed: 0,
        skipped: 0,
      };
      console.log(`✅ Search completed for session ${session.id}:`, progress);

      // Check if this is a link queue mode session
      if (session.isLinkQueueMode && this.controller.hasActiveLinkQueue()) {
        console.log(`📋 Link queue mode - triggering handleLinkComplete`);

        // Mark session as completed
        if (!session.isTerminal()) {
          session.stop("Link completed");
        }

        // Trigger link completion to move to next link
        await this.controller.handleLinkComplete(session.id, {
          success: progress.completed > 0,
          progress,
        });

        sendResponse({
          type: "SUCCESS",
          message: "Search completion acknowledged - advancing to next link",
          data: session?.progress || {},
          linkQueueMode: true,
        });
        return;
      }

      // Check if there's an active platform queue
      if (this.controller.hasActiveQueue()) {
        console.log(`📋 Platform queue active, triggering next platform...`);

        // Mark session as completed
        if (!session.isTerminal()) {
          session.stop("Platform completed");
        }

        // Trigger next platform in queue
        await this.controller.handlePlatformComplete(session.id, progress);

        sendResponse({
          type: "SUCCESS",
          message:
            "Search completion acknowledged - advancing to next platform",
          data: session?.progress || {},
        });
        return;
      }

      // No queue - normal single-platform completion
      // Notify frontend that automation is completed
      await this.controller.notifyFrontend({
        type: "AUTOMATION_COMPLETED",
        sessionId: session.id,
        platform: session.platform,
        progress: { ...progress },
        totalApplications: progress.completed,
        timestamp: Date.now(),
      });

      // Mark session as completed
      if (!session.isTerminal()) {
        session.stop("Automation completed");
      }
    }

    sendResponse({
      type: "SUCCESS",
      message: "Search completion acknowledged",
      data: session?.progress || {},
    });
  }

  /**
   * Handle already applied - detected by platform, send SEARCH_NEXT
   */
  async handleAlreadyApplied(request, sender, sendResponse) {
    const session = this.getSessionWithFallback(sender);

    if (session && request.url) {
      console.log(`⏭️ Already applied to ${request.url}, sending SEARCH_NEXT`);

      // Send SEARCH_NEXT to continue
      setTimeout(() => {
        this.sendSearchNext(session.searchTabId || sender.tab?.id, {
          url: request.url,
          status: "SKIPPED",
          reason: "Already applied",
          message: "Already applied - skipping to next job",
        });
      }, 500);
    }

    sendResponse({
      type: "SUCCESS",
      message: "Already applied - continuing to next job",
    });
  }

  /**
   * Handle automation stopped
   */
  handleAutomationStopped(request, sender, sendResponse) {
    const session = this.getSessionWithFallback(sender);

    if (session) {
      console.log(
        `🛑 Automation stopped for session ${session.id}:`,
        request.reason || "user_stopped"
      );

      // Reset job state
      session.currentJobTabId = null;
      session.currentJobUrl = null;
      session.currentJobId = null;
    }

    sendResponse({
      type: "AUTOMATION_STOPPED_ACKNOWLEDGED",
      message: "Automation stop acknowledged",
      data: {
        reason: request.reason || "automation_stopped",
        status: request.status || "stopped",
      },
    });
  }

  // ============================================
  // Universal Job Router & Aggregator Handlers
  // ============================================

  /**
   * Handle ROUTE_JOB_URL - Route a job URL through the Universal Job Router
   * Called by aggregator content scripts after clicking apply
   */
  async handleRouteJobUrl(request, sender, sendResponse) {
    const session = this.getSessionWithFallback(sender);
    if (!session) {
      sendResponse({ success: false, error: "Session not found" });
      return;
    }

    const { url } = request;
    const tabId = sender.tab?.id;

    if (!url) {
      sendResponse({ success: false, error: "No URL provided" });
      return;
    }

    try {
      const result = await this.controller.routeJobUrl(session.id, url, tabId);
      sendResponse(result);
    } catch (error) {
      this.logger.error("Error routing job URL:", error);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Handle CLASSIFY_PAGE - Classify the current page to determine handler
   */
  async handleClassifyPage(request, sender, sendResponse) {
    const session = this.getSessionWithFallback(sender);
    const tabId = sender.tab?.id;

    try {
      const router = this.controller.getUniversalRouter();
      const classification = await router.classifyPage(tabId);
      sendResponse({
        success: true,
        ...classification,
      });
    } catch (error) {
      this.logger.error("Error classifying page:", error);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Handle GET_PAGE_CONTENT - Get page content for analysis
   * This is handled by content script, just acknowledge
   */
  async handleGetPageContent(request, sender, sendResponse) {
    // This message should be handled by content script
    // If it reaches here, forward to the tab
    const tabId = sender.tab?.id;

    if (tabId) {
      try {
        const result = await chrome.tabs.sendMessage(tabId, {
          type: "GET_PAGE_CONTENT_REQUEST",
        });
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    } else {
      sendResponse({ success: false, error: "No tab ID" });
    }
  }

  /**
   * Handle CLICK_APPLY_BUTTON - Click the apply button on an aggregator job listing
   */
  async handleClickApplyButton(request, sender, sendResponse) {
    const session = this.getSessionWithFallback(sender);
    const tabId = sender.tab?.id;

    if (!tabId) {
      sendResponse({ success: false, error: "No tab ID" });
      return;
    }

    try {
      // Forward to content script to perform the click
      const result = await chrome.tabs.sendMessage(tabId, {
        type: "EXECUTE_CLICK_APPLY",
        selector: request.selector,
      });
      sendResponse(result);
    } catch (error) {
      this.logger.error("Error clicking apply button:", error);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Handle DETECT_BLOCKED_STATE - Detect if page is blocked (login, captcha, etc.)
   */
  async handleDetectBlockedState(request, sender, sendResponse) {
    const tabId = sender.tab?.id;

    try {
      const router = this.controller.getUniversalRouter();
      const blockedState = await router.detectBlockedState(tabId);
      sendResponse({
        success: true,
        ...blockedState,
      });
    } catch (error) {
      this.logger.error("Error detecting blocked state:", error);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Handle AGGREGATOR_JOB_CLICKED - Aggregator reports a job was clicked
   * This starts tracking the redirect chain
   */
  async handleAggregatorJobClicked(request, sender, sendResponse) {
    const session = this.getSessionWithFallback(sender);
    if (!session) {
      sendResponse({ success: false, error: "Session not found" });
      return;
    }

    const { jobInfo, originalUrl } = request;
    const tabId = sender.tab?.id;

    console.log(`🔗 Aggregator job clicked:`, {
      platform: session.platform,
      jobInfo,
      originalUrl,
    });

    // Store job info in session for tracking
    session.currentJobInfo = jobInfo;
    session.aggregatorSourceUrl = originalUrl;

    // The redirect will be handled by REDIRECT_DETECTED or ROUTE_JOB_URL
    sendResponse({ success: true, tracking: true });
  }

  /**
   * Handle REDIRECT_DETECTED - A redirect was detected after clicking apply
   * Route to appropriate handler based on destination
   */
  async handleRedirectDetected(request, sender, sendResponse) {
    const session = this.getSessionWithFallback(sender);
    if (!session) {
      sendResponse({ success: false, error: "Session not found" });
      return;
    }

    const { fromUrl, toUrl, redirectType } = request;
    const tabId = sender.tab?.id;

    console.log(`↪️ Redirect detected:`, {
      from: fromUrl,
      to: toUrl,
      type: redirectType,
    });

    try {
      // Route the destination URL
      const result = await this.controller.routeJobUrl(session.id, toUrl, tabId);

      if (result.success && result.handlerName) {
        console.log(`✅ Routed to handler: ${result.handlerName}`);
      }

      sendResponse(result);
    } catch (error) {
      this.logger.error("Error handling redirect:", error);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Handle ROUTE_EXTERNAL_APPLY - Route external apply from LinkedIn/Indeed to UniversalJobRouter
   * This finds the newly opened external tab and routes it
   */
  async handleRouteExternalApply(request, sender, sendResponse) {
    const session = this.getSessionWithFallback(sender);
    if (!session) {
      sendResponse({ success: false, error: "Session not found" });
      return;
    }

    const { jobDetails, platform, sourceUrl } = request.data || request;
    const sourceTabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;

    console.log(`🔗 Routing external apply from ${platform}:`, {
      jobTitle: jobDetails?.title,
      company: jobDetails?.company,
      sourceUrl,
    });

    try {
      // Find the newly opened tab in the same window
      const tabs = await chrome.tabs.query({ windowId });
      const externalTab = tabs.find(
        (tab) =>
          tab.id !== sourceTabId &&
          tab.url &&
          !tab.url.includes("linkedin.com") &&
          !tab.url.includes("indeed.com") &&
          tab.url !== "chrome://newtab/"
      );

      if (!externalTab) {
        console.log("⚠️ External tab not found in same window, checking all windows...");

        // Try to find external tab in ANY window (LinkedIn might open a new window)
        const allTabs = await chrome.tabs.query({});
        const recentExternalTab = allTabs.find(
          (tab) =>
            tab.id !== sourceTabId &&
            tab.url &&
            !tab.url.includes("linkedin.com") &&
            !tab.url.includes("indeed.com") &&
            tab.url !== "chrome://newtab/" &&
            tab.active // Most recently opened tab is usually active
        );

        if (recentExternalTab) {
          console.log(`✅ Found external tab in different window: ${recentExternalTab.url}`);
          // Continue with this tab
          const externalTabToUse = recentExternalTab;

          // Wait for the external tab to finish loading
          await this.waitForTabLoad(externalTabToUse.id, 10000);

          // Inject the PageAnalyzer content script
          const injected = await this.injectPageAnalyzer(externalTabToUse.id);
          if (!injected) {
            console.warn("⚠️ Could not inject PageAnalyzer, will try to proceed anyway");
          }

          // Register this tab to the session
          this.controller.tabToSession.set(externalTabToUse.id, session.id);

          // Store job context
          session.currentJobInfo = jobDetails;
          session.externalApplySourceUrl = sourceUrl;
          session.currentJobTabId = externalTabToUse.id;

          if (!session.searchTabId && sourceTabId) {
            session.searchTabId = sourceTabId;
          }

          // Route through UniversalJobRouter
          const router = this.controller.getUniversalRouter();
          const result = await router.routeJob(externalTabToUse.url, externalTabToUse.id, {
            sessionId: session.id,
            userProfile: session.userProfile,
            preferences: session.config.preferences,
            platform: session.platform,
            jobDetails,
            isExternalApply: true,
            sourceUrl,
          });

          if (result.success) {
            console.log(`✅ External apply routed to: ${result.handlerName || 'generic'}`);
          }

          sendResponse(result);
          return;
        }

        // Still not found - register for tracking by tab listener
        console.log("⚠️ External tab still not found, will be handled by tab listener");
        session.pendingExternalApply = {
          jobDetails,
          platform,
          sourceUrl,
          sourceTabId,
          windowId,
          timestamp: Date.now(),
        };
        sendResponse({ success: true, pending: true });
        return;
      }

      // Wait for the external tab to finish loading
      await this.waitForTabLoad(externalTab.id, 10000);

      // Inject the PageAnalyzer content script into the external tab
      // This is needed for the UniversalJobRouter to communicate with the page
      const injected = await this.injectPageAnalyzer(externalTab.id);
      if (!injected) {
        console.warn("⚠️ Could not inject PageAnalyzer, will try to proceed anyway");
      }

      // Register this tab to the session
      this.controller.tabToSession.set(externalTab.id, session.id);

      // Store job context for the external tab
      session.currentJobInfo = jobDetails;
      session.externalApplySourceUrl = sourceUrl;
      session.currentJobTabId = externalTab.id;

      // Set the search tab to the source tab (LinkedIn/Indeed tab)
      // This ensures SEARCH_NEXT is sent back to the correct tab
      if (!session.searchTabId && sourceTabId) {
        session.searchTabId = sourceTabId;
      }

      // Route through UniversalJobRouter
      const router = this.controller.getUniversalRouter();
      const result = await router.routeJob(externalTab.url, externalTab.id, {
        sessionId: session.id,
        userProfile: session.userProfile,
        preferences: session.config.preferences,
        platform: session.platform,
        jobDetails,
        isExternalApply: true,
        sourceUrl,
      });

      if (result.success) {
        console.log(`✅ External apply routed to: ${result.handlerName || 'generic'}`);
      }

      // Check if co-pilot mode - if so, signal waiting
      if (session.config?.preferences?.copilotMode) {
        sendResponse({ success: true, waitingForUser: true });
        return;
      }

      sendResponse(result);
    } catch (error) {
      this.logger.error("Error routing external apply:", error);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Wait for a tab to finish loading
   * @param {number} tabId - Tab ID to wait for
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<boolean>} True if loaded, false if timeout
   */
  async waitForTabLoad(tabId, timeout = 10000) {
    return new Promise((resolve) => {
      let resolved = false;

      const checkTab = async () => {
        try {
          const tab = await chrome.tabs.get(tabId);
          if (tab.status === "complete") {
            resolved = true;
            resolve(true);
            return true;
          }
        } catch {
          resolved = true;
          resolve(false);
          return false;
        }
        return false;
      };

      // Check immediately
      checkTab().then((done) => {
        if (done) return;

        // Set up listener for updates
        const onUpdated = (updatedTabId, changeInfo) => {
          if (updatedTabId === tabId && changeInfo.status === "complete" && !resolved) {
            resolved = true;
            chrome.tabs.onUpdated.removeListener(onUpdated);
            resolve(true);
          }
        };

        chrome.tabs.onUpdated.addListener(onUpdated);

        // Timeout fallback
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            chrome.tabs.onUpdated.removeListener(onUpdated);
            resolve(false);
          }
        }, timeout);
      });
    });
  }

  /**
   * Inject the PageAnalyzer content script into a tab
   * This enables communication between UniversalJobRouter and the page
   * @param {number} tabId - Tab ID to inject into
   * @returns {Promise<boolean>} True if injection succeeded
   */
  async injectPageAnalyzer(tabId) {
    try {
      // Check if already injected
      try {
        const response = await chrome.tabs.sendMessage(tabId, {
          type: "GET_PAGE_FINGERPRINT",
        });
        if (response?.success) {
          console.log(`✅ PageAnalyzer already present in tab ${tabId}`);
          return true;
        }
      } catch {
        // Not injected yet, continue with injection
      }

      // Inject the PageAnalyzer script
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["shared/content/page-analyzer.js"],
      });

      // Give it a moment to initialize
      await new Promise((r) => setTimeout(r, 500));

      console.log(`✅ Injected PageAnalyzer into tab ${tabId}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to inject PageAnalyzer into tab ${tabId}:`, error.message);
      return false;
    }
  }

  /**
   * Handle a form inside a cross-origin iframe by injecting a self-contained
   * handler into all frames via chrome.scripting.executeScript.
   * Used for iCIMS demographics/diversity surveys loaded from a different subdomain.
   */
  async handleCrossOriginForm(request, sender, sendResponse) {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ success: false, error: "No tab ID" });
      return;
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: async () => {
          // Self-contained demographics form handler — runs in every frame,
          // only acts in the one that contains the demographics form.
          const hasDemographicsFields =
            document.querySelector("input[id^='icims_f_']") ||
            document.querySelector("select[id^='icims_f_']");
          if (!hasDemographicsFields) return { handled: false };

          const form = document.querySelector("form");
          if (!form) return { handled: false };

          const delay = (ms) => new Promise((r) => setTimeout(r, ms));

          // 1. Click all "not_disclosed" checkboxes
          const notDisclosedCbs = form.querySelectorAll(
            "input[type='checkbox'][id$='_not_disclosed']"
          );
          for (const cb of notDisclosedCbs) {
            if (!cb.checked) {
              cb.click();
              await delay(150);
            }
          }

          // 2. Select "not_disclosed" value for all radio groups
          const radioNames = new Set();
          form
            .querySelectorAll("input[type='radio']")
            .forEach((r) => radioNames.add(r.name));
          for (const name of radioNames) {
            const nd = form.querySelector(
              `input[type='radio'][name='${name}'][value='not_disclosed']`
            );
            if (nd && !nd.checked) {
              nd.click();
              await delay(150);
            }
          }

          // 3. Select "Choose not to disclose" in all dropdowns
          for (const select of form.querySelectorAll("select")) {
            if (select.value && select.value !== "") continue;
            for (const opt of select.options) {
              if (opt.text.toLowerCase().includes("not to disclose")) {
                select.value = opt.value;
                select.dispatchEvent(new Event("change", { bubbles: true }));
                await delay(150);
                break;
              }
            }
          }

          // 4. Click submit after a short delay
          await delay(500);
          const submitBtn = form.querySelector("input[type='submit']");
          if (submitBtn) submitBtn.click();

          return { handled: true };
        },
      });

      const handled = results?.some((r) => r.result?.handled);
      console.log(
        `📋 Cross-origin form injection: ${handled ? "handled" : "no demographics form found in any frame"}`
      );
      sendResponse({ success: handled });
    } catch (error) {
      console.error("❌ Cross-origin form injection failed:", error.message);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Fetch a file directly from the background service worker (no CORS).
   * Returns base64-encoded body with content-type and content-disposition headers.
   */
  async handleFetchFile(request, sendResponse) {
    const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
    try {
      const res = await fetch(request.url);
      if (!res.ok) {
        sendResponse({ error: `Fetch failed: ${res.status} ${res.statusText}` });
        return;
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_SIZE) {
        sendResponse({ error: `File too large (${buf.byteLength} bytes, max ${MAX_SIZE})` });
        return;
      }
      // Convert ArrayBuffer to base64 in chunks to avoid call-stack overflow
      const bytes = new Uint8Array(buf);
      const CHUNK = 0x8000;
      let binary = "";
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
      }
      const base64 = btoa(binary);
      let contentDisposition = res.headers.get("content-disposition") || "";
      // Normalize Content-Disposition to simple filename="..." format
      // Handles RFC 5987 filename*=UTF-8''encoded format (e.g. Firebase Storage)
      let filename = "";
      if (contentDisposition) {
        const starMatch = /filename\*\s*=\s*UTF-8''(.+?)(?:;|$)/i.exec(contentDisposition);
        if (starMatch) {
          filename = decodeURIComponent(starMatch[1]);
        } else {
          const stdMatch = /filename\s*=\s*"?([^";\n]+)"?/i.exec(contentDisposition);
          if (stdMatch) filename = stdMatch[1].trim();
        }
      }
      // Fallback: extract filename from Firebase Storage URLs only
      // Other URLs: leave empty so handlers use their own generateResumeFileName
      if (!filename && request.url.includes("firebasestorage.googleapis.com")) {
        try {
          const urlObj = new URL(request.url);
          const firebaseMatch = urlObj.pathname.match(/\/o\/(.+)/);
          if (firebaseMatch) {
            filename = decodeURIComponent(firebaseMatch[1]).split("/").pop();
          }
        } catch (_) { /* ignore URL parse errors */ }
      }
      // Strip leading timestamp prefixes (e.g. "1764167650235-1763750826406-Name.docx" -> "Name.docx")
      if (filename) {
        filename = filename.replace(/^(\d{10,}-)+/, "");
        contentDisposition = `attachment; filename="${filename}"`;
      }
      sendResponse({
        base64,
        contentType: res.headers.get("content-type") || "application/octet-stream",
        contentDisposition,
      });
    } catch (err) {
      sendResponse({ error: err.message });
    }
  }

  /**
   * Route to platform-specific handler
   * @private
   */
  async routeToPlatformHandler(type, request, sender, sendResponse) {
    const session = this.controller.getSessionForTab(sender.tab?.id);
    if (!session) {
      sendResponse({ error: "No active session for this tab" });
      return;
    }

    // Get or create platform handler
    let handler = this.controller.platformHandlers.get(session.platform);

    if (handler && typeof handler.handleMessage === "function") {
      await handler.handleMessage(type, request, sender, sendResponse, session);
    } else {
      sendResponse({ error: `No handler for platform: ${session.platform}` });
    }
  }
}
