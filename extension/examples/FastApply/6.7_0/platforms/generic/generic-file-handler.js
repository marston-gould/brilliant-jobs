// platforms/generic/generic-file-handler.js
// File Handler for Generic/Unknown ATS systems

import { UploadDetector, UploadExecutor, UploadMechanism } from '../../shared/algorithms/resume-upload-handler.js';
import Logger from '../../core/logger.js';

/**
 * GenericFileHandler - Handles file uploads for unknown ATS systems
 *
 * Detects various upload mechanisms:
 * - Standard file inputs
 * - Drag and drop zones
 * - Hidden file inputs with trigger buttons
 * - Third-party import buttons (LinkedIn, etc.)
 */
export default class GenericFileHandler {
  constructor(config) {
    this.config = config;
    this.tabId = config.tabId;
    this.devMode = config.devMode || false;
    this.logger = new Logger('GenericFileHandler', this.devMode);

    // Initialize detector
    this.detector = new UploadDetector();
    this.executor = new UploadExecutor(this.createBrowserTools());

    // State
    this.detectedTargets = [];
    this.uploadResults = [];
  }

  /**
   * Detect and execute all file uploads
   * @param {Object} accessibilityTree - Accessibility tree
   * @param {string} pageContent - Page HTML content
   * @param {Object} userData - User data with file paths
   * @returns {Promise<Object>} Upload result
   */
  async handleFileUploads(accessibilityTree, pageContent, userData) {
    try {
      // Step 1: Detect all upload mechanisms
      this.detectedTargets = this.detector.detectUploadMechanisms(accessibilityTree, pageContent);

      this.logger.log(`Detected ${this.detectedTargets.length} upload mechanisms`);

      if (this.detectedTargets.length === 0) {
        return {
          success: true,
          message: 'No file uploads detected on this page',
          uploads: [],
        };
      }

      // Step 2: Categorize targets
      const resumeTargets = this.detectedTargets.filter(t => this.isResumeTarget(t));
      const coverLetterTargets = this.detectedTargets.filter(t => this.isCoverLetterTarget(t));
      const otherTargets = this.detectedTargets.filter(t =>
        !this.isResumeTarget(t) && !this.isCoverLetterTarget(t)
      );

      // Step 3: Upload resume
      if (resumeTargets.length > 0 && userData.resumePath) {
        const resumeResult = await this.uploadResume(resumeTargets, userData);
        this.uploadResults.push(resumeResult);
      }

      // Step 4: Upload cover letter if available
      if (coverLetterTargets.length > 0 && userData.coverLetterPath) {
        const coverResult = await this.uploadCoverLetter(coverLetterTargets, userData);
        this.uploadResults.push(coverResult);
      }

      // Step 5: Handle other uploads (supporting documents, etc.)
      for (const target of otherTargets) {
        const result = await this.handleOtherUpload(target, userData);
        if (result) {
          this.uploadResults.push(result);
        }
      }

      // Step 6: Compile results
      const allSuccess = this.uploadResults.every(r => r.success || r.skipped);
      const needsUserAction = this.uploadResults.some(r => r.needsUserAction);

      return {
        success: allSuccess,
        uploads: this.uploadResults,
        needsUserAction,
        userMessages: this.uploadResults
          .filter(r => r.userMessage)
          .map(r => r.userMessage),
      };

    } catch (error) {
      this.logger.error('Error in handleFileUploads:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Upload resume file
   * @param {Array} targets - Detected resume upload targets
   * @param {Object} userData - User data
   * @returns {Promise<Object>} Upload result
   */
  async uploadResume(targets, userData) {
    const resumeFile = {
      path: userData.resumePath || userData.resume?.path,
      name: userData.resumeName || userData.resume?.name || 'resume.pdf',
      mimeType: userData.resumeMimeType || userData.resume?.mimeType || 'application/pdf',
    };

    if (!resumeFile.path) {
      return {
        type: 'resume',
        success: false,
        error: 'No resume file path provided',
      };
    }

    // Sort targets by confidence
    const sortedTargets = targets.sort((a, b) => b.confidence - a.confidence);

    // Try each target until one succeeds
    for (const target of sortedTargets) {
      // Skip mechanisms that require user action
      if (this.requiresUserAction(target.mechanism)) {
        continue;
      }

      this.logger.log(`Trying to upload resume via ${target.mechanism}`);

      const result = await this.executor.executeUpload(target, resumeFile);

      if (result.success) {
        this.logger.log('Resume uploaded successfully');
        return {
          type: 'resume',
          success: true,
          mechanism: target.mechanism,
          fileName: resumeFile.name,
        };
      }

      if (result.needsUserAction) {
        // Continue to try other methods
        continue;
      }

      this.logger.log(`Upload attempt failed: ${result.error}`);
    }

    // No automated method worked
    const bestTarget = sortedTargets[0];
    return {
      type: 'resume',
      success: false,
      needsUserAction: true,
      userMessage: this.getUserMessage(bestTarget, 'resume'),
      availableMethods: sortedTargets.map(t => t.mechanism),
    };
  }

  /**
   * Upload cover letter file
   * @param {Array} targets - Detected cover letter upload targets
   * @param {Object} userData - User data
   * @returns {Promise<Object>} Upload result
   */
  async uploadCoverLetter(targets, userData) {
    const coverLetterFile = {
      path: userData.coverLetterPath || userData.coverLetter?.path,
      name: userData.coverLetterName || userData.coverLetter?.name || 'cover_letter.pdf',
      mimeType: userData.coverLetterMimeType || userData.coverLetter?.mimeType || 'application/pdf',
    };

    if (!coverLetterFile.path) {
      return {
        type: 'coverLetter',
        skipped: true,
        reason: 'No cover letter file provided',
      };
    }

    // Sort targets by confidence
    const sortedTargets = targets.sort((a, b) => b.confidence - a.confidence);

    for (const target of sortedTargets) {
      if (this.requiresUserAction(target.mechanism)) {
        continue;
      }

      const result = await this.executor.executeUpload(target, coverLetterFile);

      if (result.success) {
        return {
          type: 'coverLetter',
          success: true,
          mechanism: target.mechanism,
          fileName: coverLetterFile.name,
        };
      }
    }

    const bestTarget = sortedTargets[0];
    return {
      type: 'coverLetter',
      success: false,
      needsUserAction: true,
      userMessage: this.getUserMessage(bestTarget, 'cover letter'),
    };
  }

  /**
   * Handle other file uploads
   * @param {Object} target - Upload target
   * @param {Object} userData - User data
   * @returns {Promise<Object|null>} Upload result or null if skipped
   */
  async handleOtherUpload(target, userData) {
    // Check if user has additional documents
    if (!userData.additionalDocuments || userData.additionalDocuments.length === 0) {
      return null;
    }

    // Try to match the target with available documents
    const label = (target.label || '').toLowerCase();

    for (const doc of userData.additionalDocuments) {
      const docLabel = (doc.label || doc.name || '').toLowerCase();

      // Simple matching - could be improved
      if (label.includes(docLabel) || docLabel.includes(label)) {
        const result = await this.executor.executeUpload(target, {
          path: doc.path,
          name: doc.name,
          mimeType: doc.mimeType || 'application/pdf',
        });

        if (result.success) {
          return {
            type: 'additional',
            label: target.label,
            success: true,
            fileName: doc.name,
          };
        }
      }
    }

    return null;
  }

  /**
   * Check if this is a resume upload target
   * @param {Object} target - Upload target
   * @returns {boolean} True if this is a resume target
   */
  isResumeTarget(target) {
    const label = (target.label || '').toLowerCase();
    return /resume|cv|curriculum\s*vitae/i.test(label);
  }

  /**
   * Check if this is a cover letter upload target
   * @param {Object} target - Upload target
   * @returns {boolean} True if this is a cover letter target
   */
  isCoverLetterTarget(target) {
    const label = (target.label || '').toLowerCase();
    return /cover\s*letter|covering\s*letter|letter\s*of\s*interest/i.test(label);
  }

  /**
   * Check if mechanism requires user action
   * @param {string} mechanism - Upload mechanism
   * @returns {boolean} True if user action is required
   */
  requiresUserAction(mechanism) {
    return [
      UploadMechanism.LINKEDIN_IMPORT,
      UploadMechanism.INDEED_IMPORT,
      UploadMechanism.DROPBOX_IMPORT,
      UploadMechanism.GOOGLE_DRIVE_IMPORT,
    ].includes(mechanism);
  }

  /**
   * Get user-friendly message for manual upload
   * @param {Object} target - Upload target
   * @param {string} fileType - Type of file
   * @returns {string} User message
   */
  getUserMessage(target, fileType) {
    if (!target) {
      return `Please upload your ${fileType} manually.`;
    }

    switch (target.mechanism) {
      case UploadMechanism.FILE_INPUT_VISIBLE:
      case UploadMechanism.FILE_INPUT_HIDDEN:
        return `Please click the upload button to select your ${fileType} file.`;

      case UploadMechanism.DROP_ZONE:
      case UploadMechanism.DROP_ZONE_WITH_CLICK:
        return `Please drag and drop your ${fileType} file to the upload area.`;

      case UploadMechanism.LINKEDIN_IMPORT:
        return `Please click "Apply with LinkedIn" to import your ${fileType}.`;

      case UploadMechanism.URL_INPUT:
        return `Please enter the URL where your ${fileType} is hosted.`;

      default:
        return `Please upload your ${fileType} using the available method.`;
    }
  }

  /**
   * Create browser tools interface
   * @returns {Object} Browser tools
   */
  createBrowserTools() {
    const self = this;
    return {
      async uploadFile(elementRef, filePath) {
        await chrome.tabs.sendMessage(self.tabId, {
          type: 'UPLOAD_FILE',
          elementRef,
          filePath,
        });
      },
      async uploadImageToCoordinates(filePath, coordinates) {
        await chrome.tabs.sendMessage(self.tabId, {
          type: 'UPLOAD_FILE_COORDINATES',
          filePath,
          coordinates,
        });
      },
      async click(elementRef) {
        await chrome.tabs.sendMessage(self.tabId, {
          type: 'CLICK_ELEMENT',
          elementRef,
        });
      },
      async setFormValue(elementRef, value) {
        await chrome.tabs.sendMessage(self.tabId, {
          type: 'SET_FORM_VALUE',
          elementRef,
          value,
        });
      },
      async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
      },
      async getElementCoordinates(elementRef) {
        const result = await chrome.tabs.sendMessage(self.tabId, {
          type: 'GET_ELEMENT_COORDINATES',
          elementRef,
        });
        return result?.coordinates || null;
      },
      async getPageContent() {
        const result = await chrome.tabs.sendMessage(self.tabId, {
          type: 'GET_PAGE_CONTENT',
        });
        return result?.content || '';
      },
      async readFileAsText(filePath) {
        return '';
      },
    };
  }

  /**
   * Get detected targets
   * @returns {Array} Detected upload targets
   */
  getDetectedTargets() {
    return [...this.detectedTargets];
  }

  /**
   * Get upload results
   * @returns {Array} Upload results
   */
  getUploadResults() {
    return [...this.uploadResults];
  }
}
