// core/state/link-queue.js
// Manages a queue of job URLs for sequential automation across platforms

export const LinkQueueStatus = Object.freeze({
  IDLE: "IDLE",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  STOPPED: "STOPPED",
});

/**
 * Generates a unique queue ID
 * @returns {string} Unique queue identifier
 */
function generateQueueId() {
  return `linkqueue_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;
}

/**
 * LinkQueue - Manages sequential processing of job URLs across multiple platforms
 * Each URL is processed one at a time - detects platform, opens appropriate automation
 */
export default class LinkQueue {
  /**
   * Create a new link queue
   * @param {Array<{url: string, platform?: string}>} links - Array of job URLs with optional platform hints
   * @param {Object} sharedParams - Shared parameters for all automations (userId, userProfile, config, etc.)
   */
  constructor(links, sharedParams) {
    if (!Array.isArray(links) || links.length === 0) {
      throw new Error("Links array is required and must not be empty");
    }
    if (!sharedParams) {
      throw new Error("Shared params are required");
    }

    this.id = generateQueueId();
    // Normalize links to objects with url property
    this.links = links.map((link) =>
      typeof link === "string" ? { url: link, platform: null } : { ...link }
    );
    this.sharedParams = Object.freeze({ ...sharedParams });

    this.currentIndex = 0;
    this.status = LinkQueueStatus.IDLE;

    // Track results per link
    this.results = [];

    // Track session IDs for each link
    this.sessionIds = new Map(); // index -> sessionId

    // Timestamps
    this.createdAt = Date.now();
    this.startedAt = null;
    this.completedAt = null;
    this.updatedAt = Date.now();
  }

  // ============================================
  // Queue Operations
  // ============================================

  /**
   * Start the queue
   */
  start() {
    if (this.status !== LinkQueueStatus.IDLE) {
      throw new Error(`Cannot start queue from status: ${this.status}`);
    }
    this.status = LinkQueueStatus.RUNNING;
    this.startedAt = Date.now();
    this.updatedAt = Date.now();
  }

  /**
   * Get the current link being processed
   * @returns {Object|null} Current link object {url, platform} or null if queue is complete
   */
  getCurrentLink() {
    if (this.currentIndex >= this.links.length) {
      return null;
    }
    return this.links[this.currentIndex];
  }

  /**
   * Get the current link index (0-based)
   * @returns {number}
   */
  getCurrentIndex() {
    return this.currentIndex;
  }

  /**
   * Get the next link in the queue (without advancing)
   * @returns {Object|null} Next link object or null if no more links
   */
  peekNext() {
    const nextIndex = this.currentIndex + 1;
    if (nextIndex >= this.links.length) {
      return null;
    }
    return this.links[nextIndex];
  }

  /**
   * Advance to the next link
   * @returns {Object|null} Next link object or null if queue is complete
   */
  getNext() {
    this.currentIndex++;
    this.updatedAt = Date.now();

    if (this.currentIndex >= this.links.length) {
      this.status = LinkQueueStatus.COMPLETED;
      this.completedAt = Date.now();
      return null;
    }

    return this.links[this.currentIndex];
  }

  /**
   * Record completion of a link
   * @param {number} index - Index of the link that completed
   * @param {string} url - URL that completed
   * @param {string} platform - Platform that was used
   * @param {Object} result - Result data (success, error, jobData)
   * @param {string} sessionId - Session ID for the link
   */
  recordLinkComplete(index, url, platform, result, sessionId = null) {
    this.results.push({
      index,
      url,
      platform,
      result: { ...result },
      sessionId,
      completedAt: Date.now(),
      status: result.success ? "COMPLETED" : "FAILED",
    });

    if (sessionId) {
      this.sessionIds.set(index, sessionId);
    }

    this.updatedAt = Date.now();
  }

  /**
   * Record a link that was skipped
   * @param {number} index - Index of the link
   * @param {string} url - URL that was skipped
   * @param {string} reason - Reason for skipping
   */
  recordLinkSkipped(index, url, reason) {
    this.results.push({
      index,
      url,
      platform: null,
      reason,
      completedAt: Date.now(),
      status: "SKIPPED",
    });
    this.updatedAt = Date.now();
  }

  /**
   * Pause the queue
   */
  pause() {
    if (this.status !== LinkQueueStatus.RUNNING) {
      throw new Error(`Cannot pause queue from status: ${this.status}`);
    }
    this.status = LinkQueueStatus.PAUSED;
    this.updatedAt = Date.now();
  }

  /**
   * Resume the queue
   */
  resume() {
    if (this.status !== LinkQueueStatus.PAUSED) {
      throw new Error(`Cannot resume queue from status: ${this.status}`);
    }
    this.status = LinkQueueStatus.RUNNING;
    this.updatedAt = Date.now();
  }

  /**
   * Stop the queue
   * @param {string} reason - Reason for stopping
   */
  stop(reason = "User stopped") {
    this.status = LinkQueueStatus.STOPPED;
    this.stoppedReason = reason;
    this.completedAt = Date.now();
    this.updatedAt = Date.now();
  }

  // ============================================
  // Status Queries
  // ============================================

  /**
   * Check if the queue is complete
   * @returns {boolean}
   */
  isComplete() {
    return (
      this.status === LinkQueueStatus.COMPLETED ||
      this.currentIndex >= this.links.length
    );
  }

  /**
   * Check if the queue is in a terminal state
   * @returns {boolean}
   */
  isTerminal() {
    return [LinkQueueStatus.COMPLETED, LinkQueueStatus.STOPPED].includes(
      this.status
    );
  }

  /**
   * Check if the queue is active
   * @returns {boolean}
   */
  isActive() {
    return this.status === LinkQueueStatus.RUNNING;
  }

  /**
   * Get the number of remaining links
   * @returns {number}
   */
  getRemainingCount() {
    return Math.max(0, this.links.length - this.currentIndex);
  }

  /**
   * Get the number of completed links
   * @returns {number}
   */
  getCompletedCount() {
    return this.results.filter((r) => r.status === "COMPLETED").length;
  }

  /**
   * Get the number of failed links
   * @returns {number}
   */
  getFailedCount() {
    return this.results.filter((r) => r.status === "FAILED").length;
  }

  /**
   * Get the number of skipped links
   * @returns {number}
   */
  getSkippedCount() {
    return this.results.filter((r) => r.status === "SKIPPED").length;
  }

  /**
   * Get queue status summary
   * @returns {Object}
   */
  getStatus() {
    return {
      queueId: this.id,
      queueType: "link",
      status: this.status,
      links: this.links,
      currentLink: this.getCurrentLink(),
      currentIndex: this.currentIndex,
      totalLinks: this.links.length,
      remainingCount: this.getRemainingCount(),
      completedCount: this.getCompletedCount(),
      failedCount: this.getFailedCount(),
      skippedCount: this.getSkippedCount(),
      nextLink: this.peekNext(),
      results: [...this.results],
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Get automation params for a specific link
   * @param {Object} link - Link object {url, platform}
   * @param {string} detectedPlatform - The detected platform for this URL
   * @returns {Object} Params to start automation for this link
   */
  getParamsForLink(link, detectedPlatform) {
    return {
      ...this.sharedParams,
      platform: detectedPlatform,
      // Override jobsToApply to 1 since we're doing one job at a time
      jobsToApply: 1,
      // Include the direct URL to navigate to
      directJobUrl: link.url,
      // Mark this as a link queue automation
      isLinkQueueMode: true,
    };
  }

  /**
   * Serialize queue for logging/storage
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      queueType: "link",
      links: this.links,
      sharedParams: this.sharedParams,
      currentIndex: this.currentIndex,
      status: this.status,
      results: this.results,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      updatedAt: this.updatedAt,
    };
  }
}
