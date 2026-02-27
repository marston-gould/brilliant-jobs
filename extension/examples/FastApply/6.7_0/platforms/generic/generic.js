// platforms/generic/generic.js
// Generic Form Handler - Handles unknown ATS systems and custom application forms

import { analyzeForm, FIELD_TAXONOMY } from '../../shared/algorithms/form-field-detection.js';
import { ApplicationStateMachine, ApplicationEvent, ApplicationState, StepDetector } from '../../shared/algorithms/application-state-machine.js';
import { ResumeUploadHandler } from '../../shared/algorithms/resume-upload-handler.js';
import Logger from '../../core/logger.js';

/**
 * GenericFormHandler - Handles job applications on unknown/custom forms
 *
 * This handler uses:
 * - Form field detection algorithm for semantic field identification
 * - State machine for multi-step form navigation
 * - Resume upload handler for document uploads
 * - AI service for answering custom questions
 */
export default class GenericFormHandler {
  constructor(config) {
    this.config = config;
    this.tabId = config.tabId;
    this.sessionContext = config.sessionContext;
    this.classification = config.classification;
    this.devMode = config.devMode || false;

    this.logger = new Logger('GenericFormHandler', this.devMode);

    // Initialize components
    this.stateMachine = null;
    this.stepDetector = new StepDetector();
    this.uploadHandler = null;

    // Form state
    this.currentFormAnalysis = null;
    this.filledFields = new Map();
    this.skippedFields = [];

    // Co-pilot mode settings
    this.copilotMode = config.copilotMode || false;
    this.pendingUserAction = null;
    this.userActionResolver = null;

    this.logger.log('GenericFormHandler initialized');
  }

  /**
   * Main entry point - start the application process
   * @param {number} tabId - Chrome tab ID
   * @param {Object} sessionContext - Session context with user data
   * @returns {Promise<Object>} Application result
   */
  async start(tabId, sessionContext) {
    this.tabId = tabId;
    this.sessionContext = sessionContext;

    const { jobInfo, userData } = sessionContext;

    // Initialize state machine
    this.stateMachine = new ApplicationStateMachine(
      {
        jobId: jobInfo?.jobId || 'unknown',
        jobTitle: jobInfo?.title || 'Unknown Position',
        company: jobInfo?.company || 'Unknown Company',
        sourceUrl: jobInfo?.url || '',
      },
      userData
    );

    // Set up progress reporting
    this.stateMachine.subscribe((state, context) => {
      this.reportProgress(state, context);
    });

    // Initialize upload handler with browser tools
    this.uploadHandler = new ResumeUploadHandler(this.createBrowserTools());

    // Start the state machine
    await this.stateMachine.send(ApplicationEvent.START);

    // Simulate page loaded
    await this.stateMachine.send(ApplicationEvent.PAGE_LOADED);

    // Main processing loop
    try {
      await this.processLoop();

      const finalState = this.stateMachine.getState();
      const isSuccess = finalState === ApplicationState.COMPLETED;

      // Notify background about completion
      if (isSuccess) {
        await this.notifyApplicationCompleted(sessionContext, jobInfo);
      } else {
        await this.notifyApplicationFailed(sessionContext, jobInfo, finalState);
      }

      return {
        success: isSuccess,
        state: finalState,
        filledFields: Object.fromEntries(this.filledFields),
        skippedFields: this.skippedFields,
        progress: this.stateMachine.getProgress(),
      };

    } catch (error) {
      this.logger.error('Error in processing loop:', error);
      return {
        success: false,
        error: error.message,
        state: this.stateMachine.getState(),
      };
    }
  }

  /**
   * Main processing loop - handles state transitions
   */
  async processLoop() {
    while (!this.stateMachine.isTerminal()) {
      const state = this.stateMachine.getState();

      this.logger.log(`Processing state: ${state}`);

      try {
        switch (state) {
          case ApplicationState.DETECTING_STEP:
            await this.handleDetectStep();
            break;

          case ApplicationState.FILLING_FORM:
          case ApplicationState.STEP_PERSONAL_INFO:
          case ApplicationState.STEP_CONTACT_INFO:
          case ApplicationState.STEP_EXPERIENCE:
          case ApplicationState.STEP_EDUCATION:
          case ApplicationState.STEP_SKILLS:
          case ApplicationState.STEP_QUESTIONS:
          case ApplicationState.STEP_EEO:
          case ApplicationState.STEP_CONSENT:
            await this.handleFillForm();
            break;

          case ApplicationState.STEP_DOCUMENTS:
          case ApplicationState.STEP_COVER_LETTER:
            await this.handleDocumentUpload();
            break;

          case ApplicationState.VALIDATING:
            await this.handleValidation();
            break;

          case ApplicationState.SUBMITTING_STEP:
            await this.handleSubmitStep();
            break;

          case ApplicationState.STEP_REVIEW:
            await this.handleReview();
            break;

          case ApplicationState.SUBMITTING_APPLICATION:
            await this.handleFinalSubmit();
            break;

          case ApplicationState.LOADING_PAGE:
            await this.handlePageLoad();
            break;

          case ApplicationState.BLOCKED_LOGIN_REQUIRED:
          case ApplicationState.BLOCKED_CAPTCHA:
          case ApplicationState.BLOCKED_MANUAL_REQUIRED:
            await this.handleBlocked();
            return; // Exit loop, wait for user

          case ApplicationState.ERROR_VALIDATION:
          case ApplicationState.ERROR_NETWORK:
          case ApplicationState.ERROR_TIMEOUT:
            await this.handleError();
            break;

          default:
            await this.wait(1000);
        }
      } catch (error) {
        this.logger.error(`Error in state ${state}:`, error);
        await this.stateMachine.send(ApplicationEvent.UNKNOWN_ERROR);
      }
    }
  }

  /**
   * Detect the current step of the application
   */
  async handleDetectStep() {
    const pageContent = await this.getPageContent();
    const currentUrl = await this.getCurrentUrl();

    // Check for blockers first
    if (this.detectLoginRequired(pageContent)) {
      await this.stateMachine.send(ApplicationEvent.LOGIN_REQUIRED);
      return;
    }

    if (this.detectCaptcha(pageContent)) {
      await this.stateMachine.send(ApplicationEvent.CAPTCHA_DETECTED);
      return;
    }

    // Detect step type
    const stepInfo = this.stepDetector.detectStep(pageContent, currentUrl);
    this.stateMachine.updateStepInfo(stepInfo.stepIndex, stepInfo.totalSteps);

    this.logger.log(`Detected step: ${stepInfo.stepType} (${stepInfo.stepIndex + 1}/${stepInfo.totalSteps})`);

    // Notify frontend of progress
    await this.notifyProgress({
      step: stepInfo.stepIndex + 1,
      totalSteps: stepInfo.totalSteps,
      stepType: stepInfo.stepType,
    });

    await this.stateMachine.send(ApplicationEvent.FORM_DETECTED);
  }

  /**
   * Fill the current form
   */
  async handleFillForm() {
    const { userData, aiService } = this.sessionContext;

    // Get accessibility tree for form analysis
    const accessibilityTree = await this.getAccessibilityTree();
    if (!accessibilityTree) {
      this.logger.error('Could not get accessibility tree');
      await this.stateMachine.send(ApplicationEvent.MANUAL_INPUT_REQUIRED);
      return;
    }

    // Analyze the form
    const analysis = await analyzeForm(accessibilityTree);
    this.currentFormAnalysis = analysis;

    this.logger.log(`Form analysis: ${analysis.confidence} confidence, ${analysis.fields.length} fields`);

    // Check if form requires manual assistance
    if (analysis.suggestedStrategy === 'manual' || analysis.confidence === 'low') {
      this.logger.log('Low confidence form - switching to co-pilot mode');
      await this.notifyUser('Some fields could not be automatically identified. Please review and assist.');

      if (this.copilotMode) {
        await this.stateMachine.send(ApplicationEvent.MANUAL_INPUT_REQUIRED);
        return;
      }
    }

    // Fill each field
    for (const field of analysis.fields) {
      if (field.fieldType === 'unknown') {
        this.logger.log(`Skipping unknown field: ${field.elementRef}`);
        this.skippedFields.push(field);
        continue;
      }

      // Get value for this field type
      const value = await this.getValueForField(field.fieldType, userData, aiService);

      if (value !== null && value !== undefined) {
        try {
          await this.fillField(field.elementRef, value, field);
          this.stateMachine.recordFilledField(field.fieldType, value);
          this.filledFields.set(field.fieldType, value);

          // Small delay between fields for stability
          await this.wait(200);

        } catch (error) {
          this.logger.error(`Error filling field ${field.fieldType}:`, error);
          this.skippedFields.push(field);
        }
      } else {
        this.logger.log(`No value for field: ${field.fieldType}`);
        this.skippedFields.push(field);
      }
    }

    // Check if we have unfilled required fields
    const unfilledRequired = analysis.fields.filter(f =>
      f.isRequired && !this.filledFields.has(f.fieldType)
    );

    if (unfilledRequired.length > 0) {
      this.logger.log(`${unfilledRequired.length} required fields unfilled`);
      await this.notifyUser(`Please fill the following required fields: ${unfilledRequired.map(f => f.fieldType).join(', ')}`);

      if (this.copilotMode) {
        await this.stateMachine.send(ApplicationEvent.MANUAL_INPUT_REQUIRED);
        return;
      }
    }

    await this.stateMachine.send(ApplicationEvent.ALL_FIELDS_FILLED);
  }

  /**
   * Handle document upload (resume, cover letter)
   */
  async handleDocumentUpload() {
    const { userData } = this.sessionContext;

    const accessibilityTree = await this.getAccessibilityTree();
    const pageContent = await this.getPageContent();

    // Try to upload resume
    const resumeFile = {
      path: userData.resumePath || userData.resume?.path,
      name: userData.resumeName || userData.resume?.name || 'resume.pdf',
      mimeType: 'application/pdf',
    };

    if (resumeFile.path) {
      const uploadResult = await this.uploadHandler.uploadResume(
        accessibilityTree,
        pageContent,
        resumeFile
      );

      if (uploadResult.success) {
        this.logger.log(`Resume uploaded via ${uploadResult.usedMechanism}`);
        this.filledFields.set('resume', resumeFile.name);
      } else if (uploadResult.needsUserAction) {
        this.logger.log('Resume upload needs user action');
        await this.notifyUser(uploadResult.userActionMessage);

        if (this.copilotMode) {
          await this.stateMachine.send(ApplicationEvent.MANUAL_INPUT_REQUIRED);
          return;
        }
      } else {
        this.logger.error('Resume upload failed:', uploadResult.error);
      }
    }

    await this.stateMachine.send(ApplicationEvent.ALL_FIELDS_FILLED);
  }

  /**
   * Validate form before submission
   */
  async handleValidation() {
    // Trigger client-side validation by focusing and blurring fields
    await this.triggerValidation();

    // Wait for validation messages
    await this.wait(500);

    // Check for validation errors
    const pageContent = await this.getPageContent();
    const hasErrors = this.detectValidationErrors(pageContent);

    if (hasErrors) {
      this.logger.log('Validation errors detected');
      await this.stateMachine.send(ApplicationEvent.VALIDATION_FAILED);
    } else {
      await this.stateMachine.send(ApplicationEvent.VALIDATION_PASSED);
    }
  }

  /**
   * Submit the current step
   */
  async handleSubmitStep() {
    // Find and click the Next/Continue/Submit button
    const clicked = await this.clickNextButton();

    if (!clicked) {
      this.logger.error('Could not find next/submit button');
      await this.stateMachine.send(ApplicationEvent.STEP_FAILURE);
      return;
    }

    // Wait for response
    await this.wait(2000);

    // Check if we're still on the same page (error) or moved forward
    const pageChanged = await this.checkPageChanged();

    if (pageChanged) {
      await this.stateMachine.send(ApplicationEvent.STEP_SUCCESS);
    } else {
      // Check for errors
      const pageContent = await this.getPageContent();
      if (this.detectValidationErrors(pageContent)) {
        await this.stateMachine.send(ApplicationEvent.STEP_FAILURE);
      } else {
        await this.stateMachine.send(ApplicationEvent.STEP_SUCCESS);
      }
    }
  }

  /**
   * Handle review page
   */
  async handleReview() {
    await this.notifyUser('Application ready for final review. Please verify all information and confirm submission.');

    // In co-pilot mode, wait for user confirmation
    if (this.copilotMode) {
      const action = await this.waitForUserAction();
      if (action === 'submit') {
        await this.stateMachine.send(ApplicationEvent.SUBMIT_CLICKED);
      } else {
        await this.stateMachine.send(ApplicationEvent.CANCEL);
      }
    } else {
      // Auto-mode: proceed with submission
      await this.stateMachine.send(ApplicationEvent.SUBMIT_CLICKED);
    }
  }

  /**
   * Handle final submission
   */
  async handleFinalSubmit() {
    const clicked = await this.clickSubmitButton();

    if (clicked) {
      await this.wait(3000);
      await this.stateMachine.send(ApplicationEvent.APPLICATION_SUBMITTED);
    } else {
      this.logger.error('Could not click final submit button');
      await this.notifyUser('Please click the submit button to complete your application.');
    }
  }

  /**
   * Handle page load
   */
  async handlePageLoad() {
    await this.wait(2000);
    await this.stateMachine.send(ApplicationEvent.PAGE_LOADED);
  }

  /**
   * Handle blocked states
   */
  async handleBlocked() {
    const state = this.stateMachine.getState();

    const messages = {
      [ApplicationState.BLOCKED_LOGIN_REQUIRED]: 'Login required. Please sign in to continue.',
      [ApplicationState.BLOCKED_CAPTCHA]: 'CAPTCHA detected. Please complete it to continue.',
      [ApplicationState.BLOCKED_MANUAL_REQUIRED]: 'Some fields require manual input. Please fill them and click continue.',
    };

    await this.notifyUser(messages[state] || 'Manual action required.');
  }

  /**
   * Handle error states
   */
  async handleError() {
    const context = this.stateMachine.getContext();

    if (context.retryCount < context.maxRetries) {
      await this.wait(2000 * context.retryCount);
      await this.stateMachine.send(ApplicationEvent.RETRY);
    } else {
      await this.notifyUser('Application failed after multiple retries.');
    }
  }

  // ============================================
  // Field Value Resolution
  // ============================================

  /**
   * Get value for a specific field type from user data
   * @param {string} fieldType - Field type from taxonomy
   * @param {Object} userData - User profile data
   * @param {Object} aiService - AI service for custom questions
   * @returns {Promise<any>} Field value
   */
  async getValueForField(fieldType, userData, aiService) {
    const fieldConfig = FIELD_TAXONOMY[fieldType];
    if (!fieldConfig) return null;

    // Direct mapping for common fields
    const directMappings = {
      firstName: userData.firstName || userData.first_name,
      lastName: userData.lastName || userData.last_name,
      fullName: `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
      email: userData.email,
      phone: this.buildPhoneNumber(userData),
      linkedIn: userData.linkedin || userData.linkedinUrl,
      portfolio: userData.portfolio || userData.website,
      github: userData.github || userData.githubUrl,
      location: userData.location || userData.city,
      address: userData.address,
      country: userData.country,
      state: userData.state || userData.province,
      zipCode: userData.zipCode || userData.postalCode,
      currentCompany: userData.currentCompany || userData.company,
      currentTitle: userData.currentTitle || userData.title || userData.jobTitle,
      yearsExperience: userData.yearsExperience || userData.experience,
      startDate: userData.startDate || userData.availability || 'Immediately',
    };

    if (directMappings[fieldType] !== undefined) {
      return directMappings[fieldType];
    }

    // Handle work authorization
    if (fieldType === 'workAuthorization') {
      return userData.workAuthorization || userData.authorizedToWork ? 'Yes' : 'No';
    }

    // Handle sponsorship
    if (fieldType === 'sponsorship') {
      return userData.requiresSponsorship ? 'Yes' : 'No';
    }

    // Handle salary/compensation fields with AI
    if (fieldConfig.category === 'compensation' && aiService) {
      try {
        const answer = await aiService.getAnswer({
          question: fieldType,
          context: this.sessionContext.jobDescription,
          userData,
        });
        return answer;
      } catch (error) {
        this.logger.error(`AI service error for ${fieldType}:`, error);
        return null;
      }
    }

    // Handle demographic fields with "prefer not to answer" default
    if (fieldConfig.sensitive) {
      return userData[fieldType] || 'Prefer not to answer';
    }

    // Handle open-ended questions with AI
    if (fieldConfig.category === 'questions' && aiService) {
      try {
        const answer = await aiService.getAnswer({
          question: fieldType,
          context: this.sessionContext.jobDescription,
          userData,
        });
        return answer;
      } catch (error) {
        this.logger.error(`AI service error for ${fieldType}:`, error);
        return null;
      }
    }

    return userData[fieldType] || null;
  }

  /**
   * Build phone number with country code
   * Combines country code and phone number, avoiding duplicate codes
   * @param {Object} userData - User data
   * @returns {string} Full phone number with country code
   */
  buildPhoneNumber(userData) {
    const phoneNumber = userData.phone || userData.phoneNumber || userData.mobile || '';
    const countryCode = userData.phoneCountryCode || '';

    if (!phoneNumber) return '';

    // If no country code, return phone as-is
    if (!countryCode) return phoneNumber;

    // Normalize country code (ensure it starts with +)
    const normalizedCode = countryCode.startsWith('+') ? countryCode : `+${countryCode}`;

    // Check if phone number already starts with the country code (with or without +)
    const codeWithoutPlus = normalizedCode.replace('+', '');
    if (phoneNumber.startsWith(normalizedCode) || phoneNumber.startsWith(codeWithoutPlus)) {
      // Phone already has country code, return as-is but ensure it starts with +
      return phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
    }

    // Check if phone starts with + followed by different digits (different country code)
    if (phoneNumber.startsWith('+')) {
      return phoneNumber;
    }

    // Combine country code and phone number
    return `${normalizedCode}${phoneNumber}`;
  }

  // ============================================
  // DOM Interaction Methods
  // ============================================

  /**
   * Fill a single form field
   * @param {string} elementRef - Element reference from accessibility tree
   * @param {any} value - Value to fill
   * @param {Object} field - Field mapping info
   */
  async fillField(elementRef, value, field) {
    try {
      await chrome.tabs.sendMessage(this.tabId, {
        type: 'FILL_FIELD',
        elementRef,
        value,
        fieldType: field.fieldType,
      });
    } catch (error) {
      this.logger.error(`Error filling field ${elementRef}:`, error);
      throw error;
    }
  }

  /**
   * Click the Next/Continue button
   * @returns {Promise<boolean>} True if clicked successfully
   */
  async clickNextButton() {
    const selectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:contains("Next")',
      'button:contains("Continue")',
      'button:contains("Save")',
      '[class*="next"]',
      '[class*="continue"]',
      '[data-action="next"]',
    ];

    try {
      const result = await chrome.tabs.sendMessage(this.tabId, {
        type: 'CLICK_BUTTON',
        selectors,
        preferredText: ['Next', 'Continue', 'Save & Continue'],
      });
      return result?.success || false;
    } catch (error) {
      this.logger.error('Error clicking next button:', error);
      return false;
    }
  }

  /**
   * Click the final Submit button
   * @returns {Promise<boolean>} True if clicked successfully
   */
  async clickSubmitButton() {
    const selectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:contains("Submit")',
      'button:contains("Apply")',
      '[class*="submit"]',
      '[data-action="submit"]',
    ];

    try {
      const result = await chrome.tabs.sendMessage(this.tabId, {
        type: 'CLICK_BUTTON',
        selectors,
        preferredText: ['Submit', 'Submit Application', 'Apply', 'Apply Now'],
      });
      return result?.success || false;
    } catch (error) {
      this.logger.error('Error clicking submit button:', error);
      return false;
    }
  }

  /**
   * Trigger client-side validation
   */
  async triggerValidation() {
    try {
      await chrome.tabs.sendMessage(this.tabId, {
        type: 'TRIGGER_VALIDATION',
      });
    } catch (error) {
      this.logger.error('Error triggering validation:', error);
    }
  }

  // ============================================
  // Detection Methods
  // ============================================

  detectLoginRequired(pageContent) {
    return /sign\s*in|log\s*in|create.*account/i.test(pageContent) &&
           !/already\s*(signed|logged)\s*in/i.test(pageContent);
  }

  detectCaptcha(pageContent) {
    return /recaptcha|hcaptcha|captcha/i.test(pageContent);
  }

  detectValidationErrors(pageContent) {
    const errorPatterns = [
      /class=["'][^"']*error[^"']*["']/i,
      /class=["'][^"']*invalid[^"']*["']/i,
      /aria-invalid=["']true["']/i,
      /please\s*(enter|fill|provide|correct)/i,
      /required\s*field/i,
      /this\s*field\s*is\s*required/i,
    ];

    return errorPatterns.some(p => p.test(pageContent));
  }

  async checkPageChanged() {
    const currentUrl = await this.getCurrentUrl();
    const previousUrl = this.stateMachine.getContext().currentUrl;
    return currentUrl !== previousUrl;
  }

  // ============================================
  // Browser Communication Methods
  // ============================================

  async getPageContent() {
    try {
      const result = await chrome.tabs.sendMessage(this.tabId, {
        type: 'GET_PAGE_CONTENT',
      });
      return result?.content || '';
    } catch (error) {
      this.logger.error('Error getting page content:', error);
      return '';
    }
  }

  async getCurrentUrl() {
    try {
      const tab = await chrome.tabs.get(this.tabId);
      return tab.url || '';
    } catch (error) {
      return '';
    }
  }

  async getAccessibilityTree() {
    try {
      const result = await chrome.tabs.sendMessage(this.tabId, {
        type: 'GET_ACCESSIBILITY_TREE',
      });
      return result?.tree || null;
    } catch (error) {
      this.logger.error('Error getting accessibility tree:', error);
      return null;
    }
  }

  // ============================================
  // Utility Methods
  // ============================================

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
        return self.getPageContent();
      },
      async readFileAsText(filePath) {
        // This would need actual file reading implementation
        return '';
      },
    };
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async notifyUser(message) {
    this.logger.log(`User notification: ${message}`);

    try {
      await chrome.tabs.sendMessage(this.tabId, {
        type: 'SHOW_NOTIFICATION',
        message,
      });
    } catch (error) {
      // Notification failed, log but continue
    }

    // Also notify via automation controller
    if (this.sessionContext.notifyCallback) {
      this.sessionContext.notifyCallback(message);
    }
  }

  async notifyProgress(progress) {
    try {
      await chrome.tabs.sendMessage(this.tabId, {
        type: 'UPDATE_PROGRESS',
        progress,
      });
    } catch (error) {
      // Progress update failed, continue
    }
  }

  reportProgress(state, context) {
    const progress = this.stateMachine.getProgress();
    this.logger.log(`[${progress.toFixed(0)}%] State: ${state}, Step: ${context.currentStepIndex + 1}/${context.totalSteps}`);
  }

  async waitForUserAction() {
    return new Promise((resolve) => {
      this.userActionResolver = resolve;
      this.pendingUserAction = true;
    });
  }

  resolveUserAction(action) {
    if (this.userActionResolver) {
      this.userActionResolver(action);
      this.userActionResolver = null;
      this.pendingUserAction = false;
    }
  }

  /**
   * Resume after user completes blocked action
   */
  async resume() {
    const state = this.stateMachine.getState();

    if (state === ApplicationState.BLOCKED_MANUAL_REQUIRED) {
      await this.stateMachine.send(ApplicationEvent.ALL_FIELDS_FILLED);
    }

    await this.processLoop();
  }

  /**
   * Cancel the application
   */
  async cancel() {
    await this.stateMachine.send(ApplicationEvent.CANCEL);
  }

  /**
   * Notify background script that application was completed successfully
   * @param {Object} sessionContext - Session context
   * @param {Object} jobInfo - Job information
   */
  async notifyApplicationCompleted(sessionContext, jobInfo) {
    try {
      const jobData = {
        jobId: jobInfo?.jobId || 'unknown',
        title: jobInfo?.title || 'Unknown Position',
        company: jobInfo?.company || 'Unknown Company',
        url: jobInfo?.url || window.location.href,
        platform: 'generic',
        isExternalApply: sessionContext?.isExternalApply || false,
        sourceUrl: sessionContext?.sourceUrl || '',
        timestamp: Date.now(),
      };

      this.logger.log('Sending APPLICATION_COMPLETED:', jobData);

      await chrome.runtime.sendMessage({
        type: 'JOB_SUCCESS',
        jobData,
      });
    } catch (error) {
      this.logger.error('Error sending APPLICATION_COMPLETED:', error);
    }
  }

  /**
   * Notify background script that application failed
   * @param {Object} sessionContext - Session context
   * @param {Object} jobInfo - Job information
   * @param {string} finalState - Final state of the application
   */
  async notifyApplicationFailed(sessionContext, jobInfo, finalState) {
    try {
      const jobData = {
        jobId: jobInfo?.jobId || 'unknown',
        title: jobInfo?.title || 'Unknown Position',
        company: jobInfo?.company || 'Unknown Company',
        url: jobInfo?.url || window.location.href,
        platform: 'generic',
        isExternalApply: sessionContext?.isExternalApply || false,
        sourceUrl: sessionContext?.sourceUrl || '',
        timestamp: Date.now(),
      };

      this.logger.log('Sending JOB_FAILURE:', { jobData, finalState });

      await chrome.runtime.sendMessage({
        type: 'JOB_FAILURE',
        jobData,
        error: `Application ended in state: ${finalState}`,
      });
    } catch (error) {
      this.logger.error('Error sending JOB_FAILURE:', error);
    }
  }
}
