/**
 * Production-Ready AI Status Overlay - Draggable automation assistant with AI-style typing.
 * Optimized for performance, efficiency, and stability.
 */
class ChatbotStatusOverlay {
  constructor(options = {}) {
    this.options = {
      id: options.id || "chatbot-status-overlay",
      title: options.title || "AI Assistant",
      botName: options.botName || "FastApply Bot",
      platform: options.platform || "AUTOMATION",
      sessionId: options.sessionId || null,
      icon: options.icon || "🤖",
      position: options.position || { top: "20px", right: "20px" },
      width: options.width || "380px",
      maxHeight: options.maxHeight || "600px",
      ...options,
    };

    // State management
    this.container = null;
    this.chatContainer = null;
    this.statusBar = null;
    this.buttonContainer = null;
    this.thinkingIndicator = null;
    this.buttons = {};
    this.isVisible = true;
    this.isMinimized = false;
    this.currentStatus = "ready";
    this.automationState = "ready";
    this.copilotMode = "auto-pilot";
    this.port = null;
    this.isDestroyed = false;
    this.pendingTimeouts = new Set();
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.typingSpeed = 30; // ms per character
    this.messageQueue = [];
    this.isProcessingMessage = false;
    this.pendingMessages = []; // Buffer for messages received before sessionId is available
    this.shownOnceTypes = new Set(); // Track once-per-session message types already displayed
    this._historyLoaded = false; // Gate: true after loadAndReplayHistory completes
    this._deferredOnceMessages = []; // Once-per-session msgs waiting for history load
    this._lastMessageText = null; // Dedup: last message text
    this._lastMessageTime = 0; // Dedup: last message timestamp

    // Bound event handlers for robust listener removal
    this.messageHandler = this.handleMessage.bind(this);
    this.boundHandleDrag = this.handleDrag.bind(this);
    this.boundHandleDragEnd = this.handleDragEnd.bind(this);

    // Initialize
    this.injectStyles();
    this.setupMessageListener();

    if (!options.manual) {
      this.create();
    }
  }

  /**
   * Clear all messages from the chat container and the message queue.
   */
  clearMessages() {
    if (this.isDestroyed || !this.chatContainer) return;

    this.messageQueue = [];
    this.pendingMessages = [];
    this._deferredOnceMessages = [];
    this.isProcessingMessage = false;
    this.shownOnceTypes.clear();
    this._historyLoaded = false;

    this.chatContainer.innerHTML = "";

    ChatbotStatusOverlay.clearHistory(this.options.sessionId);
  }

  /**
   * Setup message listener for automation events.
   */
  setupMessageListener() {
    if (!chrome.runtime?.onMessage) return;

    try {
      if (!chrome.runtime.onMessage.hasListener(this.messageHandler)) {
        chrome.runtime.onMessage.addListener(this.messageHandler);
      }
    } catch (error) {
      console.warn("Could not setup message listener:", error);
    }
  }

  /**
   * Handle incoming messages from the extension runtime.
   */
  handleMessage(message) {
    if (this.isDestroyed) return;
    const { type, data } = message;

    // Once-per-session types must wait for history to load so we can tell
    // whether they're duplicates (platforms re-send them on every page nav)
    if (ChatbotStatusOverlay.ONCE_PER_SESSION.has(type)) {
      if (this.shownOnceTypes.has(type)) return;
      if (!this._historyLoaded) {
        // Defer until history loads — then we'll know if it's a duplicate
        this._deferredOnceMessages.push(message);
        return;
      }
      this.shownOnceTypes.add(type);
    }

    // A comprehensive switch to handle all message types.
    switch (type) {
      case "AUTOMATION_STARTING":
        this.addProgressMessage("Hey! I'm getting everything ready for you…");
        break;
      case "JOB_SEARCH_STARTED":
        const searchDetails = this.formatSearchPreferences(data?.preferences);
        this.addProgressMessage(
          "I'm searching for jobs that match what you're looking for:",
          searchDetails
        );
        if (data?.preferences?.copilotMode != null) {
          this.copilotMode =
            data.preferences.copilotMode === true ||
            data.preferences.copilotMode === "co-pilot"
              ? "co-pilot"
              : "auto-pilot";
        }
        break;
      case "APPLYING_FILTERS":
        this.addProgressMessage(
          "I'm applying your search filters now. This will just take a moment..."
        );
        break;
      case "JOB_FOUND":
        this.addProgressMessage(
          "Great! I found some jobs for you. Let me start applying to them now..."
        );
        break;
      case "JOB_NOT_FOUND":
        this.addProgressMessage(
          "I couldn't find any jobs matching your preferences right now. Let's try adjusting your search criteria."
        );
        break;
      case "APPLYING_TO_JOB":
        const jobTitle = data?.title || data?.jobTitle || "this position";
        this.addProgressMessage(
          `I'm working on your application for "${jobTitle}" now...`
        );
        if (this.copilotMode === "co-pilot")
          this.updateButtons("co-pilot-filling");
        break;
      case "COLLECTING_FIELDS":
        this.addProgressMessage(
          "I'm gathering all the application questions for you..."
        );
        break;
      case "SENDING_TO_SERVER":
        this.addProgressMessage(
          "I'm processing the application details now. Hang tight!"
        );
        break;
      case "WAITING_FOR_RESPONSE":
        this.addProgressMessage(
          "I'm preparing your answers for the application. This might take a moment, so please hang tight!"
        );
        break;
      case "UPLOADING_FILES":
        this.addProgressMessage(
          "I'm uploading your resume and cover letter now. Almost there!"
        );
        break;
      case "TAILORING_RESUME":
        this.addProgressMessage(
          "I'm tailoring your resume to better match this job description. Hang tight!"
        );
        break;
      case "FILLING_FORM":
        this.addProgressMessage(
          "I'm filling out the application form for you. Just a moment!"
        );
        break;
      case "SUBMITTING_APPLICATION":
        this.addProgressMessage(
          "All done! I'm submitting your application now..."
        );
        break;
      case "APPLICATION_ERROR":
        this.addProgressMessage(
          "I ran into an issue with that last application. Don't worry though, I'm moving on to the next job for you!"
        );
        break;
      case "CAPTCHA_DETECTED":
        this.addProgressMessage(
          "I detected a security challenge. Please verify you are human so I can continue!"
        );
        break;
      case "RECAPTCHA_DETECTED":
        this.addProgressMessage(
          "I found a reCAPTCHA challenge here. Unfortunately, I need your help to solve it manually before I can continue. Please complete it and I'll take it from there!"
        );
        break;
      case "CAPTCHA_SUBMIT_MANUAL":
        this.addProgressMessage(
          "I've filled everything out for you, but there's a CAPTCHA blocking me from submitting. Could you please complete the CAPTCHA and click submit? I'll wait here and continue with the next job once you're done."
        );
        break;
      case "LOGIN_REQUIRED":
        this.addProgressMessage(
          "This job needs you to be logged in first. Please log into your account and I'll take over from there!"
        );
        break;
      case "ALREADY_APPLIED":
        const appliedJobTitle =
          data?.title || data?.jobTitle || "this position";
        this.addProgressMessage(
          `I noticed you've already applied to "${appliedJobTitle}" before. Let me find you something new instead!`
        );
        break;
      case "COMPANY_BLACKLISTED":
        const blacklistedCompany = data?.company || "this company";
        const blacklistedJobTitle =
          data?.title || data?.jobTitle || "this position";
        this.addProgressMessage(
          `I'm skipping "${blacklistedJobTitle}" because you've blacklisted ${blacklistedCompany}. Moving on to the next opportunity!`
        );
        break;
      case "SKIPPING_APPLIED_JOB":
        const skippedJobTitle = data?.title || data?.jobTitle || "this job";
        this.addProgressMessage(
          `I see "${skippedJobTitle}" here, but you've already applied to it. Don't worry, I'm looking for fresh opportunities for you!`
        );
        break;
      case "DUPLICATE_APPLICATION":
        const duplicateJobTitle =
          data?.title || data?.jobTitle || "this position";
        this.addProgressMessage(
          `I'm skipping "${duplicateJobTitle}" since it's already in your history. I'm making sure we don't apply twice to the same job!`
        );
        break;
      case "APPLICATION_SKIPPED":
        const skippedTitle = data?.title || data?.jobTitle || "this position";
        const reason = data?.reason || "it doesn't match your criteria";
        this.addProgressMessage(
          `I'm skipping "${skippedTitle}" because ${reason}. Let me find a better match for you!`
        );
        break;
      case "LIMIT_EXCEEDED":
        const limitMessage = this.formatLimitExceededMessage(data);
        this.addProgressMessage(limitMessage);
        break;
      case "LOCATION_RESTRICTED":
        this.addProgressMessage(
          "This job isn't available in your location, so I'm moving on to the next one for you."
        );
        break;
      case "DOES_NOT_MATCH_PREFERENCES":
        this.addProgressMessage(
          `I'm skipping "${data.title}" for you. ${data.reason}`
        );
        break;
      case "LOADING_MORE_JOBS":
        this.addProgressMessage(
          "I'm loading more job listings for you. Just a moment..."
        );
        break;
      case "SEARCH_COMPLETED":
        this.addProgressMessage(
          "I've gone through all the available jobs for now. You're all caught up!"
        );
        break;
      case "COPILOT_WAITING_FOR_NEXT":
        const nextJobTitle = data?.title || "this position";
        const nextCompany = data?.company || "";
        this.addProgressMessage(
          `I've filled this step for "${nextJobTitle}"${
            nextCompany ? ` at ${nextCompany}` : ""
          }. Please review and click 'Next' to continue.`
        );
        this.updateButtons("co-pilot-next");
        break;
      case "COPILOT_WAITING_FOR_REVIEW":
        const copilotJobTitle = data?.title || "this position";
        const copilotCompany = data?.company || "";
        this.addProgressMessage(
          `I've completed the application for "${copilotJobTitle}"${
            copilotCompany ? ` at ${copilotCompany}` : ""
          }! Please review it and click 'Submit' when you're ready.`
        );
        this.updateButtons("co-pilot-review");
        break;
      case "COPILOT_CONTINUING_TO_NEXT_STEP":
        const continuingJobTitle = data?.title || "this position";
        this.addProgressMessage(
          `I'm moving to the next step for "${continuingJobTitle}" now...`
        );
        break;
      case "COPILOT_SUBMIT_READY":
        const submitJobTitle = data?.jobTitle || "this position";
        this.addProgressMessage(
          `I've finished preparing your application for "${submitJobTitle}"! Please review and click 'Submit' when you're ready.`
        );
        this.updateButtons("co-pilot-review");
        break;
      case "MODE_SWITCHED":
        const newMode = data?.mode === "co-pilot" ? "Co-Pilot" : "Auto-Pilot";
        this.addProgressMessage(
          `I've switched to ${newMode} mode for you. ${
            newMode === "Co-Pilot"
              ? "I'll pause before submitting so you can review each application."
              : "I'll handle everything automatically from now on."
          } `
        );
        this.copilotMode = data?.mode || "auto-pilot";
        this.updateButtons(
          this.copilotMode === "co-pilot" ? "co-pilot-search" : "auto-pilot"
        );
        break;
      case "AUTOMATION_PAUSED":
        this.addProgressMessage(
          "I've paused for now. Just click 'Resume' whenever you're ready for me to continue!"
        );
        this.updateButtons("paused");
        break;
      case "AUTOMATION_RESUMED":
        this.addProgressMessage(
          "Great! I'm back to work and will continue applying to jobs for you..."
        );
        break;
      case "JOB_SKIPPED":
        const userSkippedTitle = data?.title || "the current job";
        this.addProgressMessage(
          `Got it! I've skipped "${userSkippedTitle}" and I'm moving on to the next opportunity for you...`
        );
        break;
      case "AUTOMATION_STOPPED":
        this.automationState = "stopped";
        this.delay(2000).then(() => {
          if (!this.isDestroyed) {
            this.clearMessages();
            this.automationState = "ready";
            this.updateStatus("ready");
          }
        });
        break;
    }
  }

  /**
   * Formats the limit exceeded message based on plan type.
   */
  formatLimitExceededMessage(data) {
    const planType = data?.planType || "free";
    const upgradeLink =
      "<a href='https://www.fastapply.co/pricing' target='_blank' style='color: #0369a1; text-decoration: underline; font-weight: 600;'>Upgrade to a paid plan</a>";
    const resetDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const resetTimeFormatted = resetDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const resetDateFormatted = resetDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    switch (planType.toLowerCase()) {
      case "starter":
      case "pro":
        const nextPlan =
          planType.toLowerCase() === "starter" ? "Pro" : "Unlimited";
        const upgradeAction = `<a href='https://www.fastapply.co/pricing' target='_blank' style='color: #0369a1; text-decoration: underline; font-weight: 600;'>Upgrade to the ${nextPlan} plan</a>`;
        return `You've reached your **daily job application limit**. Your limit resets at ${resetTimeFormatted} on ${resetDateFormatted}. ${upgradeAction} to continue applying now.`;
      case "credit":
        const buyMoreCredit =
          "<a href='https://www.fastapply.co/pricing?tab=credits' target='_blank' style='color: #0369a1; text-decoration: underline; font-weight: 600;'>buy more credits</a>";
        const creditsRemaining = data?.creditsRemaining ?? 0;
        const creditText =
          creditsRemaining > 0
            ? `You have **${creditsRemaining} credits** remaining.`
            : `You've run out of application credits.`;
        return `Not enough credits. ${creditText} Please ${buyMoreCredit} to continue applying.`;
      case "free":
      default:
        return `You've reached your **application rate limit**. Your limit resets at ${resetTimeFormatted} on ${resetDateFormatted}. ${upgradeLink} to continue applying now.`;
    }
  }

  /**
   * Format search preferences for display.
   * Only shows fields that have actual values — skips empty/missing ones.
   */
  formatSearchPreferences(preferences) {
    if (!preferences) return "";
    const details = [];

    const add = (label, value) => {
      if (value == null) return;
      const display = Array.isArray(value)
        ? value.length > 0
          ? value.join(", ")
          : null
        : typeof value === "string" && value.trim() !== ""
          ? value.trim()
          : null;
      if (display) details.push(`${label}: ${display}`);
    };

    // Role / position
    add("Role", preferences.positions);

    // Location fields
    add("Country", preferences.location);
    add("City", preferences.city);
    if (preferences.remoteOnly === true) {
      details.push("Remote: Yes");
    }

    // Job parameters
    add("Employment type", preferences.jobType);
    add("Experience level", this._formatExperienceLevel(preferences.experienceLevel));
    add("Industry", preferences.industry);

    // Date posted — raw value is a number-string like "3" meaning "Last 3 days"
    const dp = preferences.datePosted;
    if (dp != null && dp !== "") {
      details.push(`Date posted: ${this._formatDatePosted(dp)}`);
    }

    // Salary range
    if (Array.isArray(preferences.salary) && preferences.salary.length === 2) {
      const [min, max] = preferences.salary;
      if (min || max) {
        const fmt = (n) => (n ? `$${Number(n).toLocaleString()}` : "");
        details.push(`Salary: ${fmt(min)} – ${fmt(max)}`);
      }
    }

    // Language
    add("Language", preferences.language);

    // Search accuracy (if present)
    add("Search accuracy", preferences.searchAccuracy);

    return details.join("\n");
  }

  /**
   * Convert a datePosted value (e.g. "1", "3", "7", "30") to a readable label.
   */
  _formatDatePosted(value) {
    const v = String(value);
    const map = {
      "1": "Last 24 hours",
      "3": "Last 3 days",
      "7": "Last week",
      "14": "Last 2 weeks",
      "30": "Last month",
    };
    return map[v] || v;
  }

  /**
   * Convert an experienceLevel slug to a readable label.
   */
  _formatExperienceLevel(value) {
    if (!value) return null;
    const map = {
      internship: "Internship",
      entrylevel: "Entry level",
      associate: "Associate",
      midseniorlevel: "Mid-Senior level",
      director: "Director",
      executive: "Executive",
    };
    return map[value] || value;
  }

  /**
   * Add a new progress message to the queue.
   * Deduplicates rapid identical messages (e.g. button action delivered via two channels).
   */
  addProgressMessage(message, details = "") {
    if (this.isDestroyed) return Promise.resolve();

    // Reject duplicate of the exact same message within a short window
    const now = Date.now();
    if (this._lastMessageText === message && now - this._lastMessageTime < 800) {
      return Promise.resolve();
    }
    this._lastMessageText = message;
    this._lastMessageTime = now;

    this._persistMessage(message, details);
    return new Promise((resolve) => {
      this.messageQueue.push({ message, details, resolve });
      if (!this.isProcessingMessage) {
        this.processMessageQueue();
      }
    });
  }

  /**
   * Persist a message to chrome.storage.session for cross-navigation replay.
   * Buffers messages in memory if sessionId is not yet available (race condition).
   */
  _persistMessage(text, details) {
    if (!chrome.storage?.session) return;

    const sessionId = this.options.sessionId;
    if (!sessionId) {
      // Buffer until sessionId arrives via adoptSession()
      this.pendingMessages.push({ text, details, timestamp: Date.now() });
      return;
    }

    const key = `overlay_messages_${sessionId}`;
    chrome.storage.session.get(key, (result) => {
      if (chrome.runtime.lastError || !result) return;
      const messages = result[key] || [];
      messages.push({ text, details, timestamp: Date.now() });
      chrome.storage.session.set({ [key]: messages });
    });
  }

  /**
   * Load and replay persisted messages from a previous page in the same session.
   * Messages are rendered instantly (no typing animation).
   */
  async loadAndReplayHistory() {
    const sessionId = this.options.sessionId;
    if (!sessionId || !chrome.storage?.session || this.isDestroyed) return;

    const key = `overlay_messages_${sessionId}`;
    return new Promise((resolve) => {
      chrome.storage.session.get(key, async (result) => {
        if (chrome.runtime.lastError || !result) {
          resolve();
          return;
        }
        const messages = result[key] || [];
        if (messages.length === 0 || this.isDestroyed) {
          resolve();
          return;
        }

        // History exists — initialization messages were already shown on a prior page
        for (const t of ChatbotStatusOverlay.ONCE_PER_SESSION) {
          this.shownOnceTypes.add(t);
        }

        this.hideThinking();
        for (const msg of messages) {
          if (this.isDestroyed) break;
          await this._displayMessage(msg.text, msg.details || "", false);
        }
        if (!this.isDestroyed) {
          this.showThinking();
          this.scrollToBottom();
        }
        resolve();
      });
    });
  }

  /**
   * Adopt a session ID that arrived after overlay creation (race condition fix).
   * Persists any buffered messages, clears the chat, and replays the full
   * history so the conversation appears continuous across page navigations.
   */
  async adoptSession(sessionId) {
    if (!sessionId || this.options.sessionId === sessionId || this.isDestroyed) return;

    this.options.sessionId = sessionId;

    // Persist any messages that were buffered while sessionId was null
    if (this.pendingMessages.length > 0 && chrome.storage?.session) {
      const key = `overlay_messages_${sessionId}`;
      await new Promise((resolve) => {
        chrome.storage.session.get(key, (result) => {
          if (chrome.runtime.lastError || !result) {
            // Storage not ready yet - just set fresh
            chrome.storage.session.set({ [key]: this.pendingMessages }, () => {
              this.pendingMessages = [];
              resolve();
            });
            return;
          }
          const messages = result[key] || [];
          messages.push(...this.pendingMessages);
          chrome.storage.session.set({ [key]: messages }, () => {
            this.pendingMessages = [];
            resolve();
          });
        });
      });
    }

    // Clear current chat DOM (but keep thinking indicator)
    if (this.chatContainer) {
      const entries = this.chatContainer.querySelectorAll(".progress-message-entry");
      entries.forEach((entry) => entry.remove());
    }

    // Reset queue state so replayed + new messages don't collide
    this.messageQueue = [];
    this.isProcessingMessage = false;

    // Replay full history in correct order (old pages + buffered)
    await this.loadAndReplayHistory();

    this._historyLoaded = true;
    // Flush deferred once-per-session messages now that we know which are duplicates
    this._flushDeferredOnceMessages();
  }

  /**
   * Process once-per-session messages that were deferred while history was loading.
   * Re-routes them through handleMessage now that shownOnceTypes is populated.
   */
  _flushDeferredOnceMessages() {
    const deferred = this._deferredOnceMessages;
    this._deferredOnceMessages = [];
    for (const msg of deferred) {
      if (this.isDestroyed) break;
      this.handleMessage(msg);
    }
  }

  /**
   * Clear persisted message history for a given session.
   */
  static clearHistory(sessionId) {
    if (!sessionId || !chrome.storage?.session) return;
    try {
      chrome.storage.session.remove(`overlay_messages_${sessionId}`);
    } catch (e) {
      // Storage may not be accessible
    }
  }

  /**
   * Process messages in the queue with optimized typing animation.
   */
  async processMessageQueue() {
    if (
      this.isProcessingMessage ||
      this.messageQueue.length === 0 ||
      this.isDestroyed
    ) {
      return;
    }
    this.isProcessingMessage = true;
    this.hideThinking();

    // Process all but the last message instantly
    while (this.messageQueue.length > 1 && !this.isDestroyed) {
      const { message, details, resolve } = this.messageQueue.shift();
      await this._displayMessage(message, details, false); // false = don't type
      resolve();
    }

    // Process the last message with typing
    if (this.messageQueue.length === 1 && !this.isDestroyed) {
      const { message, details, resolve } = this.messageQueue.shift();
      await this._displayMessage(message, details, true); // true = type
      resolve();
    }

    if (!this.isDestroyed) {
      this.showThinking();
      this.isProcessingMessage = false;

      // Check if new messages were added during processing and process them
      if (this.messageQueue.length > 0) {
        this.processMessageQueue();
      }
    }
  }

  /**
   * Internal method to display a single message.
   * @param {string} message - The main message text.
   * @param {string} details - Additional details, formatted.
   * @param {boolean} typed - Whether to use the typing animation.
   */
  async _displayMessage(message, details = "", typed = false) {
    if (this.isDestroyed || !this.chatContainer) return;

    const messageEntry = document.createElement("div");
    messageEntry.className = "progress-message-entry";
    messageEntry.innerHTML = `
      <div class="message-avatar">
        <div class="ai-bot-icon">${this.options.icon}</div>
      </div>
      <div class="message-bubble">
        <div class="message-content-wrapper">
          <div class="message-text"></div>
          ${details ? `<div class="message-details">${details}</div>` : ""}
        </div>
      </div>
    `;

    this.chatContainer.insertBefore(messageEntry, this.thinkingIndicator);
    const textEl = messageEntry.querySelector(".message-text");

    if (typed) {
      await this.typeMessage(textEl, message);
    } else {
      textEl.innerHTML = message;
    }

    this.scrollToBottom();
  }

  /**
   * Shows the thinking indicator.
   */
  showThinking() {
    if (this.isDestroyed || !this.thinkingIndicator) return;
    this.thinkingIndicator.style.display = "flex";
    this.scrollToBottom();
  }

  /**
   * Hides the thinking indicator.
   */
  hideThinking() {
    if (this.isDestroyed || !this.thinkingIndicator) return;
    this.thinkingIndicator.style.display = "none";
  }

  /**
   * Types out a message character by character.
   */
  async typeMessage(element, message) {
    if (this.isDestroyed) return;
    element.innerHTML = "";
    for (let i = 0; i < message.length; i++) {
      if (this.isDestroyed) break;
      element.innerHTML =
        message.substring(0, i + 1) + '<span class="typing-cursor"></span>';
      await this.delay(this.typingSpeed);
    }
    if (!this.isDestroyed) {
      element.innerHTML = message;
    }
  }

  /**
   * Utility delay function that is robust against destruction.
   */
  delay(ms) {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this.pendingTimeouts.delete(timeoutId);
        if (!this.isDestroyed) resolve();
      }, ms);
      this.pendingTimeouts.add(timeoutId);
    });
  }

  /**
   * Scrolls the chat container to the bottom efficiently.
   */
  scrollToBottom() {
    if (this.chatContainer && !this.isDestroyed) {
      requestAnimationFrame(() => {
        if (this.chatContainer) {
          this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        }
      });
    }
  }

  injectStyles() {
    if (document.getElementById("chatbot-overlay-styles")) return;
    const styles = document.createElement("style");
    styles.id = "chatbot-overlay-styles";
    styles.textContent = `
    /* ... (All CSS content remains the same as original) ... */
    .chatbot-overlay-container { font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif; line-height: 1.5 !important; user-select: none; cursor: move; backdrop-filter: blur(20px); border-radius: 24px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1); transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); } 
    .chatbot-overlay-container:hover { box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.15); transform: translateY(-2px); } 
    .chatbot-overlay-container.dragging { opacity: 0.9; transform: scale(1.02); transition: none; box-shadow: 0 40px 80px -20px rgba(0, 0, 0, 0.4), 0 0 0 2px rgba(3, 105, 161, 0.5); } 
    .chatbot-overlay-container * { box-sizing: border-box !important; } 
    .chatbot-status-indicator { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; padding: 6px 12px; border-radius: 20px; background: rgba(255, 255, 255, 0.15); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.2); letter-spacing: 0.3px; } 
    .chatbot-status-dot { width: 10px; height: 10px; border-radius: 50%; background: #38bdf8; box-shadow: 0 0 15px currentColor; position: relative; } 
    .chatbot-status-dot::after { content: ''; position: absolute; inset: -3px; border-radius: 50%; background: inherit; opacity: 0.3; animation: statusPulse 2s infinite; } 
    .chatbot-minimize-btn { background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.15); color: rgba(255, 255, 255, 0.9); cursor: pointer; padding: 8px; border-radius: 12px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); backdrop-filter: blur(10px); } 
    .chatbot-minimize-btn:hover { background: rgba(255, 255, 255, 0.2); border-color: rgba(255, 255, 255, 0.3); color: white; transform: scale(1.1) rotate(90deg); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2); } 
    .ai-message-container { padding: 12px 14px; max-height: 350px; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; gap: 12px; scroll-behavior: smooth; background: linear-gradient(135deg, rgba(3, 105, 161, 0.03) 0%, rgba(3, 105, 161, 0.03) 50%, rgba(14, 165, 233, 0.03) 100%); position: relative; } 
    .ai-message-container::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent 0%, rgba(3, 105, 161, 0.3) 50%, transparent 100%); } 
    .ai-message-container::-webkit-scrollbar { width: 8px; } 
    .ai-message-container::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.05); border-radius: 10px; margin: 8px 0; } 
    .ai-message-container::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #38bdf8 0%, #6366f1 100%); border-radius: 10px; border: 2px solid rgba(255, 255, 255, 0.1); } 
    .progress-message-entry { display: flex; gap: 10px; align-items: flex-end; animation: messageFadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1); } 
    .message-bubble { background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.98) 100%); padding: 2px 14px; border-radius: 18px 18px 18px 4px; box-shadow: 0 8px 32px rgba(12, 74, 110, 0.12), 0 2px 8px rgba(12, 74, 110, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8); border: 1px solid rgba(3, 105, 161, 0.15); max-width: 280px; word-wrap: break-word; } 
    .thinking-indicator { display: none; gap: 14px; align-items: flex-end; opacity: 0.9; animation: messageFadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1); } 
    .thinking-bubble { background: linear-gradient(135deg, rgba(248, 250, 252, 0.95) 0%, rgba(241, 245, 249, 0.95) 100%); padding: 10px; border-radius: 24px 24px 24px 6px; box-shadow: 0 6px 24px rgba(3, 105, 161, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.5); border: 1px solid rgba(3, 105, 161, 0.2); animation: float 3s ease-in-out infinite; } 
    .message-avatar { flex-shrink: 0; animation: float 4s ease-in-out infinite; align-self: flex-end; } 
    .ai-bot-icon { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #38bdf8 0%, rgb(3, 105, 161) 50%, #0ea5e9 100%); display: flex; align-items: center; justify-content: center; font-size: 18px; color: white; border: 2px solid rgba(255, 255, 255, 0.3); box-shadow: 0 4px 12px rgba(3, 105, 161, 0.4), 0 0 0 3px rgba(3, 105, 161, 0.1), inset 0 2px 4px rgba(255, 255, 255, 0.3); overflow: hidden; } 
    .message-text { font-size: 15px; font-weight: 400; color: #0f172a; line-height: 1.5; letter-spacing: -0.01em; } 
    .message-details { font-size: 13.5px; color: #334155; line-height: 1.6; white-space: pre-line; background: linear-gradient(135deg, rgba(3, 105, 161, 0.08) 0%, rgba(3, 105, 161, 0.06) 100%); padding: 12px 16px; border-radius: 12px; margin-top: 10px; border-left: 4px solid #38bdf8; border: 1px solid rgba(3, 105, 161, 0.2); box-shadow: inset 0 1px 2px rgba(3, 105, 161, 0.1); } 
    .ai-thinking-dots { display: flex; gap: 5px; } 
    .ai-thinking-dot { width: 6px; height: 6px; border-radius: 50%; background: linear-gradient(135deg, #38bdf8 0%, rgb(3, 105, 161) 100%); animation: thinkingPulse 1.4s infinite; } 
    .ai-thinking-dot:nth-child(2) { animation-delay: 0.2s; } 
    .ai-thinking-dot:nth-child(3) { animation-delay: 0.4s; } 
    .typing-cursor { display: inline-block; width: 2.5px; height: 20px; background: linear-gradient(180deg, #38bdf8 0%, rgb(3, 105, 161) 100%); margin-left: 3px; animation: blink 1s infinite; border-radius: 2px; } 
    .control-button-container { position: sticky; bottom: 0; padding: 16px 20px; background: linear-gradient(180deg, rgba(248, 250, 252, 0.98) 0%, rgba(241, 245, 249, 0.98) 100%); backdrop-filter: blur(20px); border-top: 1px solid rgba(3, 105, 161, 0.15); display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; z-index: 10; } 
    .control-button { padding: 10px 20px; border: none; border-radius: 12px; font-size: 13.5px; font-weight: 700; cursor: pointer !important; pointer-events: auto !important; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); display: flex; align-items: center; gap: 8px; user-select: none; } 
    .btn-primary { background: linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%); color: white; } 
    .btn-success { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; } 
    .btn-warning { background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); color: white; } 
    .btn-danger { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; } 
    .btn-secondary { background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%); color: white; } 
    @keyframes statusPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.15); } } 
    @keyframes thinkingPulse { 0%, 80%, 100% { opacity: 0.4; transform: scale(1) translateY(0); } 40% { opacity: 1; transform: scale(1.3) translateY(-2px); } } 
    @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } } 
    @keyframes messageFadeIn { from { opacity: 0; transform: translateY(15px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } } 
    @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } } 
    @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-6px); } } 
    @keyframes glow { 0%, 100% { box-shadow: 0 0 20px rgba(3, 105, 161, 0.3); } 50% { box-shadow: 0 0 35px rgba(3, 105, 161, 0.6); } } 
    `;
    document.head.appendChild(styles);
  }

  /**
   * Creates the DOM structure for the overlay.
   */
  async create() {
    if (document.getElementById(this.options.id)) {
      document.getElementById(this.options.id).remove();
    }
    if (this.isDestroyed) return this;

    this.container = document.createElement("div");
    this.container.id = this.options.id;
    this.container.className = "chatbot-overlay-container";
    const animation = this.options.position.left
      ? "chatbotSlideInLeft 0.4s ease-out"
      : "chatbotSlideIn 0.4s ease-out";
    this.container.style.cssText = `position: fixed; ${
      this.options.position.top ? `top: ${this.options.position.top};` : ""
    } ${
      this.options.position.right
        ? `right: ${this.options.position.right};`
        : ""
    } ${
      this.options.position.left ? `left: ${this.options.position.left};` : ""
    } ${
      this.options.position.bottom
        ? `bottom: ${this.options.position.bottom};`
        : ""
    } width: ${this.options.width}; max-height: ${
      this.options.maxHeight
    }; background: white; border-radius: 16px; box-shadow: 0 8px 30px rgba(14, 165, 233, 0.15); z-index: 9999999; overflow: hidden; animation: ${animation}; ${
      !this.isVisible ? "display: none;" : ""
    }`;

    this.container.appendChild(this.createHeader());

    this.chatContainer = document.createElement("div");
    this.chatContainer.className = "ai-message-container";
    this.container.appendChild(this.chatContainer);

    this.thinkingIndicator = this.createThinkingIndicator();
    this.chatContainer.appendChild(this.thinkingIndicator);

    this.buttonContainer = document.createElement("div");
    this.buttonContainer.className = "control-button-container";
    this.buttonContainer.style.display = "none";
    this.container.appendChild(this.buttonContainer);

    document.body.appendChild(this.container);

    this.setupDragHandlers();
    this.initializePortConnection();
    this.updateStatus(this.currentStatus);

    this.loadAndReplayHistory().then(() => {
      this._historyLoaded = true;
      // Flush deferred once-per-session messages now that we know which are duplicates
      this._flushDeferredOnceMessages();
      this.delay(500).then(() => this.showThinking());
    });

    return this;
  }

  createThinkingIndicator() {
    const thinkingEl = document.createElement("div");
    thinkingEl.className = "thinking-indicator";
    thinkingEl.style.display = "none"; // Initially hidden
    thinkingEl.innerHTML = `
      <div class="message-avatar">
        <div class="ai-bot-icon">${this.options.icon}</div>
      </div>
      <div class="thinking-bubble">
        <div class="thinking-content">
          <div class="ai-thinking-dots">
            <div class="ai-thinking-dot"></div>
            <div class="ai-thinking-dot"></div>
            <div class="ai-thinking-dot"></div>
          </div>
        </div>
      </div>
    `;
    return thinkingEl;
  }

  setupDragHandlers() {
    const header = this.container?.querySelector("div:first-child");
    if (!header) return;

    header.addEventListener("mousedown", (e) => {
      if (e.target.classList.contains("chatbot-minimize-btn")) return;
      this.isDragging = true;
      this.container.classList.add("dragging");
      const rect = this.container.getBoundingClientRect();
      this.dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      document.addEventListener("mousemove", this.boundHandleDrag);
      document.addEventListener("mouseup", this.boundHandleDragEnd);
      e.preventDefault();
    });
  }

  handleDrag(e) {
    if (!this.isDragging) return;
    const x = e.clientX - this.dragOffset.x;
    const y = e.clientY - this.dragOffset.y;
    const maxX = window.innerWidth - this.container.offsetWidth;
    const maxY = window.innerHeight - this.container.offsetHeight;
    this.container.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
    this.container.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
    this.container.style.right = "auto";
    this.container.style.bottom = "auto";
  }

  handleDragEnd() {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.container?.classList.remove("dragging");
    document.removeEventListener("mousemove", this.boundHandleDrag);
    document.removeEventListener("mouseup", this.boundHandleDragEnd);
  }

  createHeader() {
    const header = document.createElement("div");
    header.style.cssText =
      "background: linear-gradient(135deg, #0c4a6e 0%, #0369a1 100%); color: white; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; cursor: move;";
    const botInfo = document.createElement("div");
    botInfo.style.cssText = "display: flex; align-items: center; gap: 12px;";
    const avatar = document.createElement("div");
    avatar.style.cssText =
      "width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.25); display: flex; align-items: center; justify-content: center; font-size: 20px; border: 2px solid rgba(255,255,255,0.4);";
    avatar.textContent = this.options.icon;
    const textInfo = document.createElement("div");
    const botName = document.createElement("div");
    botName.style.cssText =
      "font-weight: 600; font-size: 16px; margin-bottom: 2px;";
    botName.textContent = this.options.botName;
    this.statusBar = document.createElement("div");
    this.statusBar.className = "chatbot-status-indicator";
    this.statusBar.innerHTML = `<span class="chatbot-status-dot"></span><span>Ready to help</span>`;
    textInfo.appendChild(botName);
    textInfo.appendChild(this.statusBar);
    const minimizeBtn = document.createElement("button");
    minimizeBtn.className = "chatbot-minimize-btn";
    minimizeBtn.innerHTML = this.isMinimized ? "▲" : "▼";
    minimizeBtn.onclick = (e) => {
      e.stopPropagation();
      this.toggleMinimize();
    };
    botInfo.appendChild(avatar);
    botInfo.appendChild(textInfo);
    header.appendChild(botInfo);
    header.appendChild(minimizeBtn);
    return header;
  }

  initializePortConnection() {
    if (!chrome.runtime || this.isDestroyed) return;
    try {
      this.port = chrome.runtime.connect({ name: `chatbot-${Date.now()}` });
      this.port.onMessage.addListener((message) => {
        if (!this.isDestroyed) this.handleMessage(message);
      });
      this.port.onDisconnect.addListener(() => {
        this.port = null;
        if (!this.isDestroyed) {
          this.delay(5000).then(() => this.initializePortConnection());
        }
      });
    } catch (error) {
      console.warn("Could not establish port connection:", error);
    }
  }

  updateStatus(status) {
    if (!this.statusBar || this.isDestroyed) return this;
    this.currentStatus = status;
    const statusConfig = {
      ready: "Ready to help",
      searching: "Searching...",
      applying: "Applying...",
      stopped: "Stopped",
    };
    const dot = this.statusBar.querySelector(".chatbot-status-dot");
    const text = this.statusBar.querySelector("span:last-child");
    if (dot && text) {
      this.statusBar.className = `chatbot-status-indicator chatbot-status-${status}`;
      text.textContent = statusConfig[status] || status;
    }
    return this;
  }

  toggleMinimize() {
    if (this.isDestroyed) return;
    this.isMinimized = !this.isMinimized;
    const minimizeBtn = this.container?.querySelector(".chatbot-minimize-btn");
    if (minimizeBtn) minimizeBtn.innerHTML = this.isMinimized ? "▲" : "▼";
    if (this.chatContainer)
      this.chatContainer.style.display = this.isMinimized ? "none" : "block";
    if (this.buttonContainer)
      this.buttonContainer.style.display =
        this.isMinimized || this.buttonContainer.innerHTML === ""
          ? "none"
          : "flex";
    return this;
  }

  show() {
    if (this.container && !this.isDestroyed) {
      this.isVisible = true;
      this.container.style.display = "block";
    }
    return this;
  }

  hide() {
    if (this.container && !this.isDestroyed) {
      this.isVisible = false;
      this.container.style.display = "none";
    }
    return this;
  }

  createControlButtons(buttonConfigs) {
    if (!this.buttonContainer || this.isDestroyed) return;
    this.buttonContainer.innerHTML = "";
    this.buttons = {};
    if (buttonConfigs.length === 0) {
      this.buttonContainer.style.display = "none";
      return;
    }
    this.buttonContainer.style.display = "flex";

    buttonConfigs.forEach((config) => {
      const button = document.createElement("button");
      button.className = `control-button ${config.className || "btn-primary"}`;
      button.innerHTML = config.icon
        ? `<span>${config.icon}</span><span>${config.label}</span>`
        : config.label;
      button.type = "button";

      // Add inline styles to guarantee clickability (bypass any CSS issues)
      button.style.pointerEvents = "auto";
      button.style.cursor = "pointer";
      button.style.position = "relative";
      button.style.zIndex = "9999";

      // Use addEventListener instead of onclick for more reliable handling
      button.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log(
          `🔘 Button "${config.label}" clicked, action: ${config.action}`
        );
        this.handleButtonClick(config.action);
      });

      // Also prevent mousedown from starting drag
      button.addEventListener("mousedown", (e) => {
        e.stopPropagation();
      });

      this.buttonContainer.appendChild(button);
      this.buttons[config.action] = button;
    });
  }

  hideButtons() {
    if (this.buttonContainer) this.buttonContainer.style.display = "none";
  }

  updateButtons(state) {
    if (this.isDestroyed) return;
    const buttonConfigs = {
      "auto-pilot": [
        {
          action: "SWITCH_TO_COPILOT",
          label: "Switch to Co-Pilot",
          icon: "👥",
          className: "btn-primary",
        },
        {
          action: "SKIP",
          label: "Skip Job",
          icon: "⏭️",
          className: "btn-secondary",
        },
      ],
      "co-pilot-search": [
        {
          action: "SWITCH_TO_AUTOPILOT",
          label: "Switch to Auto-Pilot",
          icon: "⚡",
          className: "btn-ai-takeover",
        },
        {
          action: "SKIP",
          label: "Skip Job",
          icon: "⏭️",
          className: "btn-secondary",
        },
      ],
      "co-pilot-filling": [
        {
          action: "SWITCH_TO_AUTOPILOT",
          label: "Switch to Auto-Pilot",
          icon: "⚡",
          className: "btn-ai-takeover",
        },
        {
          action: "SKIP",
          label: "Skip Job",
          icon: "⏭️",
          className: "btn-secondary",
        },
      ],
      "co-pilot-next": [
        { action: "NEXT", label: "Next", icon: "➡️", className: "btn-primary" },
        {
          action: "SKIP",
          label: "Skip Job",
          icon: "⏭️",
          className: "btn-secondary",
        },
      ],
      "co-pilot-review": [
        {
          action: "SUBMIT",
          label: "Submit",
          icon: "✅",
          className: "btn-success",
        },
        {
          action: "SKIP",
          label: "Skip Job",
          icon: "⏭️",
          className: "btn-secondary",
        },
      ],
      paused: [
        {
          action: "RESUME",
          label: "Resume",
          icon: "▶️",
          className: "btn-success",
        },
      ],
    };
    this.createControlButtons(buttonConfigs[state] || []);
  }

  handleButtonClick(action) {
    // Dispatch a custom DOM event that platform code can listen to directly
    // This is more reliable than routing through background script
    const event = new CustomEvent("copilot-control-action", {
      bubbles: true,
      detail: {
        action,
        sessionId: this.options.sessionId,
        platform: this.options.platform,
      },
    });
    document.dispatchEvent(event);

    // Also send via chrome.runtime for background script actions (PAUSE, RESUME, STOP)
    if (chrome.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage(
          {
            type: "CONTROL_ACTION",
            action,
            sessionId: this.options.sessionId,
            platform: this.options.platform,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              // Ignore - DOM event already handled it
            }
          }
        );
      } catch (error) {
        // Ignore - DOM event already handled it
      }
    }
  }

  destroy() {
    this.isDestroyed = true;
    this.messageQueue = [];
    this.isProcessingMessage = false;

    this.pendingTimeouts.forEach(clearTimeout);
    this.pendingTimeouts.clear();

    if (this.port) {
      try {
        this.port.disconnect();
      } catch (e) {
        /* Ignore */
      }
      this.port = null;
    }

    if (chrome.runtime?.onMessage.hasListener(this.messageHandler)) {
      chrome.runtime.onMessage.removeListener(this.messageHandler);
    }

    this.handleDragEnd(); // Ensure drag listeners are removed

    this.container?.remove();
    this.container = null;
    this.chatContainer = null;
    this.statusBar = null;
    this.thinkingIndicator = null;
  }

  // Simplified API methods for backward compatibility
  displayMessage(message) {
    return this.addProgressMessage(message);
  }
  addMessage(message) {
    return this.displayMessage(message);
  }
  addBotMessage(message) {
    return this.displayMessage(message);
  }
  addError(message) {
    return this.displayMessage(message);
  }
  addSuccess(message) {
    return this.displayMessage(message);
  }
  addWarning(message) {
    return this.displayMessage(message);
  }
  addInfo(message) {
    return this.displayMessage(message);
  }
}

/**
 * Message types that should only appear once per session.
 * Platforms re-send these on every page navigation (content bridge re-initializes),
 * and some platforms send AUTOMATION_STARTING in both initialize() and start().
 */
ChatbotStatusOverlay.ONCE_PER_SESSION = new Set([
  "AUTOMATION_STARTING",
  "JOB_SEARCH_STARTED",
  "APPLYING_FILTERS",
]);

export default ChatbotStatusOverlay;
