// services/application-tracker-service.js

// Platforms known to exist in the backend platform_enum
const KNOWN_PLATFORMS = new Set([
  "linkedin",
  "indeed",
  "glassdoor",
  "greenhouse",
  "lever",
  "dice",
  "ziprecruiter",
  "simplyhired",
  "workable",
  "ashby",
  "wellfound",
  "workday",
  "recruitee",
  "icims",
  "bayt",
  "reed",
  "smartrecruiters",
  "rippling",
  "breezy",
  "custom",
]);

export default class ApplicationTrackerService {
  constructor(config) {
    this.apiHost = config.backendApiHost;
    this.userId = config.userId;
    this.jobProfileId = config.jobProfileId;
    this.jwtToken = config.jwtToken;
  }

  /**
   * Get authorization headers for API requests
   * @returns {Object} Headers object with Authorization if jwtToken is available
   */
  getAuthHeaders() {
    const headers = {
      "Content-Type": "application/json",
    };
    if (this.jwtToken) {
      headers["Authorization"] = `Bearer ${this.jwtToken}`;
    }
    return headers;
  }

  /**
   * Check if user can apply to a job
   * Verifies credit limits and whether job was already applied to
   * @param {string} jobId - The ID of the job to check
   * @returns {Promise<Object>} - { canApply: boolean, credits: {...}, alreadyApplied: boolean }
   */
  async checkCanApply(jobId) {
    try {
      const params = new URLSearchParams({
        jobId: jobId,
      });
      const response = await fetch(
        `${this.apiHost}/api/v1/applications/can-apply?${params.toString()}`,
        {
          method: "GET",
          headers: this.getAuthHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to check if can apply: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error checking if user can apply:", error);
      // Return a safe default in case of error
      return {
        canApply: false,
        credits: {
          remaining: 0,
          used: 0,
          limit: 0,
          resetAt: null,
          planType: "unknown",
        },
        alreadyApplied: false,
        error: error.message,
      };
    }
  }

  /**
   * Save a successful job application
   * This endpoint handles everything: saving to DB, updating credits, etc.
   * @param {Object} applicationData - Application data to save
   * @returns {Promise<boolean>} - Success status
   */
  async saveAppliedJob(applicationData) {
    try {
      // Map unknown platforms to "other" to avoid DB enum errors,
      // but preserve the real platform name in metadata
      const rawPlatform = (applicationData.platform || "other").toLowerCase();
      const safePlatform = KNOWN_PLATFORMS.has(rawPlatform)
        ? rawPlatform
        : "custom";

      const payload = {
        jobProfileId: this.jobProfileId,
        jobId: applicationData.jobId,
        jobTitle: applicationData.title || applicationData.jobTitle,
        company: applicationData.company,
        location: applicationData.location,
        description:
          applicationData.description || applicationData.jobDescription || "",
        jobUrl: applicationData.jobUrl || "",
        platform: safePlatform,
        metadata: {
          source: "chrome_extension",
          appliedVia: "automation",
          originalPlatform: rawPlatform,
          salary: applicationData.salary,
          workplace: applicationData.workplace,
          postedDate: applicationData.postedDate,
          applicants: applicationData.applicants,
          appliedAt: Date.now(),
          ...applicationData.metadata,
        },
      };

      const response = await fetch(
        `${this.apiHost}/api/v1/applications/external`,
        {
          method: "POST",
          headers: this.getAuthHeaders(),
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Failed to save applied job: ${response.statusText} - ${
            errorData.message || "Unknown error"
          }`
        );
      }

      const result = await response.json();
      console.log("✅ Application saved successfully:", result);
      return true;
    } catch (error) {
      console.error("Error saving applied job:", error);
      return false;
    }
  }

  /**
   * Format credit information into a user-friendly message
   * @param {Object} credits - Credits object from checkCanApply
   * @returns {string} - Formatted message
   */
  formatCreditMessage(credits) {
    if (!credits) return "";

    const { remaining, limit, resetAt } = credits;

    let message = `You have ${remaining} of ${limit} applications remaining`;

    if (resetAt) {
      const resetDate = new Date(resetAt);
      const now = new Date();
      const hoursUntilReset = Math.ceil((resetDate - now) / (1000 * 60 * 60));

      if (hoursUntilReset > 0) {
        message += ` (resets in ${hoursUntilReset} hours)`;
      }
    }

    return message;
  }

  async getApplicationStats() {
    try {
      const response = await fetch(
        `${this.apiHost}/api/applications/stats?userId=${this.userId}`,
        {
          method: "GET",
          headers: this.getAuthHeaders(),
        }
      );
      if (!response.ok) {
        throw new Error(
          `Failed to get application stats: ${response.statusText}`
        );
      }
      return await response.json();
    } catch (error) {
      console.error("Error getting application stats:", error);
      return null;
    }
  }
}
