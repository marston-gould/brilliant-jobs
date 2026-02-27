// platforms/generic/generic-form-handler.js
// Form Handler for Generic/Unknown ATS systems

import { analyzeForm, FIELD_TAXONOMY, llmFieldAnalysis } from '../../shared/algorithms/form-field-detection.js';
import Logger from '../../core/logger.js';

/**
 * GenericFormHandler - Handles form filling for unknown ATS systems
 *
 * Uses the form field detection algorithm to semantically understand
 * form fields regardless of their labeling or structure.
 */
export default class GenericFormHandler {
  constructor(config) {
    this.config = config;
    this.tabId = config.tabId;
    this.devMode = config.devMode || false;
    this.logger = new Logger('GenericFormHandler', this.devMode);

    // Services
    this.aiService = config.aiService;

    // State
    this.currentAnalysis = null;
    this.filledFields = new Map();
    this.skippedFields = [];
    this.errors = [];

    // Co-pilot mode
    this.copilotMode = config.copilotMode || false;
  }

  /**
   * Analyze and fill the current form
   * @param {Object} accessibilityTree - Accessibility tree from page
   * @param {Object} userData - User profile data
   * @param {Object} jobContext - Job description and context
   * @returns {Promise<Object>} Fill result
   */
  async fillForm(accessibilityTree, userData, jobContext = {}) {
    try {
      // Step 1: Analyze the form
      this.currentAnalysis = await analyzeForm(accessibilityTree);

      this.logger.log(`Form analysis complete: ${this.currentAnalysis.confidence} confidence`);
      this.logger.log(`Found ${this.currentAnalysis.fields.length} fields`);

      // Step 2: Check for warnings
      if (this.currentAnalysis.warnings.length > 0) {
        this.logger.log(`Warnings: ${this.currentAnalysis.warnings.join(', ')}`);
      }

      // Step 3: Determine fill strategy
      const strategy = this.currentAnalysis.suggestedStrategy;

      if (strategy === 'manual') {
        this.logger.log('Manual strategy suggested - low confidence form');
        return {
          success: false,
          strategy,
          requiresManual: true,
          analysis: this.currentAnalysis,
        };
      }

      // Step 4: Fill each field
      const results = await this.fillAllFields(userData, jobContext);

      // Step 5: Handle unknown fields with AI if available
      if (this.currentAnalysis.unmappedElements.length > 0 && this.aiService) {
        await this.handleUnknownFieldsWithAI(userData, jobContext);
      }

      return {
        success: true,
        strategy,
        analysis: this.currentAnalysis,
        filledFields: Object.fromEntries(this.filledFields),
        skippedFields: this.skippedFields,
        errors: this.errors,
      };

    } catch (error) {
      this.logger.error('Error in fillForm:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Fill all detected fields
   * @param {Object} userData - User profile data
   * @param {Object} jobContext - Job context
   * @returns {Promise<Array>} Fill results
   */
  async fillAllFields(userData, jobContext) {
    const results = [];

    for (const field of this.currentAnalysis.fields) {
      // Skip unknown fields (handled separately)
      if (field.fieldType === 'unknown') {
        this.skippedFields.push(field);
        continue;
      }

      try {
        const result = await this.fillSingleField(field, userData, jobContext);
        results.push(result);

        if (result.success) {
          this.filledFields.set(field.fieldType, result.value);
        } else {
          this.skippedFields.push(field);
        }

        // Small delay for stability
        await this.wait(150);

      } catch (error) {
        this.logger.error(`Error filling field ${field.fieldType}:`, error);
        this.errors.push({ field: field.fieldType, error: error.message });
        this.skippedFields.push(field);
      }
    }

    return results;
  }

  /**
   * Fill a single field
   * @param {Object} field - Field mapping
   * @param {Object} userData - User data
   * @param {Object} jobContext - Job context
   * @returns {Promise<Object>} Fill result
   */
  async fillSingleField(field, userData, jobContext) {
    const { fieldType, elementRef, confidence, isRequired } = field;

    // Get value for this field
    const value = await this.resolveFieldValue(fieldType, userData, jobContext);

    if (value === null || value === undefined) {
      if (isRequired) {
        this.logger.log(`No value for required field: ${fieldType}`);
        return { success: false, fieldType, reason: 'No value available' };
      }
      return { success: true, fieldType, skipped: true };
    }

    // Determine input method based on field taxonomy
    const taxonomy = FIELD_TAXONOMY[fieldType];
    const inputType = taxonomy?.inputTypes?.[0] || 'text';

    // Fill the field
    await this.setFieldValue(elementRef, value, inputType);

    this.logger.log(`Filled ${fieldType} (confidence: ${confidence.toFixed(2)})`);

    return { success: true, fieldType, value, confidence };
  }

  /**
   * Resolve the value for a field type
   * @param {string} fieldType - Field type from taxonomy
   * @param {Object} userData - User profile data
   * @param {Object} jobContext - Job context
   * @returns {Promise<any>} Resolved value
   */
  async resolveFieldValue(fieldType, userData, jobContext) {
    // Direct mappings
    const mappings = {
      // Personal
      firstName: userData.firstName || userData.first_name,
      lastName: userData.lastName || userData.last_name,
      fullName: this.buildFullName(userData),
      email: userData.email,
      phone: this.buildPhoneNumber(userData),

      // Social/Links
      linkedIn: userData.linkedin || userData.linkedinUrl || userData.linkedInUrl,
      portfolio: userData.portfolio || userData.website || userData.portfolioUrl,
      github: userData.github || userData.githubUrl,

      // Location
      location: userData.location || userData.city,
      address: userData.address || userData.streetAddress,
      country: userData.country,
      state: userData.state || userData.province || userData.region,
      zipCode: userData.zipCode || userData.postalCode || userData.zip,

      // Experience
      currentCompany: userData.currentCompany || userData.company || userData.employer,
      currentTitle: userData.currentTitle || userData.title || userData.jobTitle || userData.position,
      yearsExperience: userData.yearsExperience || userData.experience || userData.totalExperience,

      // Availability
      startDate: userData.startDate || userData.availability || userData.availableDate || 'Immediately',
    };

    // Check direct mapping first
    if (mappings[fieldType] !== undefined) {
      return mappings[fieldType];
    }

    // Handle special cases
    switch (fieldType) {
      case 'workAuthorization':
        return this.resolveWorkAuthorization(userData);

      case 'sponsorship':
        return this.resolveSponsorship(userData);

      case 'coverLetter':
        return this.resolveCoverLetter(userData, jobContext);

      case 'salaryExpectation':
      case 'whyInterested':
      case 'additionalInfo':
        return this.resolveOpenEndedQuestion(fieldType, userData, jobContext);

      case 'gender':
      case 'ethnicity':
      case 'veteranStatus':
      case 'disabilityStatus':
        return this.resolveDemographicField(fieldType, userData);

      default:
        // Try to find in userData directly
        return userData[fieldType] || null;
    }
  }

  /**
   * Build full name from user data
   * @param {Object} userData - User data
   * @returns {string} Full name
   */
  buildFullName(userData) {
    const first = userData.firstName || userData.first_name || '';
    const last = userData.lastName || userData.last_name || '';
    return `${first} ${last}`.trim();
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

  /**
   * Resolve work authorization value
   * @param {Object} userData - User data
   * @returns {string} Authorization value
   */
  resolveWorkAuthorization(userData) {
    if (userData.workAuthorization) return userData.workAuthorization;
    if (userData.authorizedToWork === true) return 'Yes';
    if (userData.authorizedToWork === false) return 'No';
    if (userData.workAuthStatus) return userData.workAuthStatus;
    return 'Yes'; // Default assumption
  }

  /**
   * Resolve sponsorship value
   * @param {Object} userData - User data
   * @returns {string} Sponsorship value
   */
  resolveSponsorship(userData) {
    if (userData.sponsorship) return userData.sponsorship;
    if (userData.requiresSponsorship === true) return 'Yes';
    if (userData.requiresSponsorship === false) return 'No';
    if (userData.needsVisa === true) return 'Yes';
    return 'No'; // Default assumption
  }

  /**
   * Resolve cover letter content
   * @param {Object} userData - User data
   * @param {Object} jobContext - Job context
   * @returns {Promise<string>} Cover letter content
   */
  async resolveCoverLetter(userData, jobContext) {
    // Check for pre-written cover letter
    if (userData.coverLetter) return userData.coverLetter;
    if (userData.coverLetterText) return userData.coverLetterText;

    // Generate with AI if available
    if (this.aiService && jobContext.jobDescription) {
      try {
        const generated = await this.aiService.generateCoverLetter({
          userData,
          jobDescription: jobContext.jobDescription,
          company: jobContext.company,
          position: jobContext.title,
        });
        return generated;
      } catch (error) {
        this.logger.error('Error generating cover letter:', error);
      }
    }

    return null;
  }

  /**
   * Resolve open-ended question
   * @param {string} fieldType - Field type
   * @param {Object} userData - User data
   * @param {Object} jobContext - Job context
   * @returns {Promise<string>} Answer
   */
  async resolveOpenEndedQuestion(fieldType, userData, jobContext) {
    // Check for pre-written answers
    if (userData[fieldType]) return userData[fieldType];

    // Try AI service
    if (this.aiService) {
      try {
        const answer = await this.aiService.getAnswer({
          question: fieldType,
          context: jobContext.jobDescription,
          userData,
        });
        return answer;
      } catch (error) {
        this.logger.error(`Error getting AI answer for ${fieldType}:`, error);
      }
    }

    return null;
  }

  /**
   * Resolve demographic field (EEO)
   * @param {string} fieldType - Field type
   * @param {Object} userData - User data
   * @returns {string} Value
   */
  resolveDemographicField(fieldType, userData) {
    // Check if user has provided this info
    if (userData[fieldType]) return userData[fieldType];

    // Check EEO preferences
    if (userData.eeoResponses && userData.eeoResponses[fieldType]) {
      return userData.eeoResponses[fieldType];
    }

    // Default to "prefer not to answer" for sensitive fields
    return 'Prefer not to answer';
  }

  /**
   * Handle unknown fields using AI
   * @param {Object} userData - User data
   * @param {Object} jobContext - Job context
   */
  async handleUnknownFieldsWithAI(userData, jobContext) {
    if (!this.aiService) return;

    const unknownFields = this.currentAnalysis.fields.filter(f => f.fieldType === 'unknown');

    for (const field of unknownFields) {
      try {
        // Get field signals for AI analysis
        const signals = {
          id: field.elementRef,
          name: null,
          type: 'unknown',
          placeholder: null,
          ariaLabel: null,
          labelText: null,
          nearbyText: [],
          sectionHeading: null,
          optionTexts: [],
          elementRef: field.elementRef,
        };

        const contextInfo = {
          pageTitle: jobContext.pageTitle || '',
          companyName: jobContext.company || '',
          jobTitle: jobContext.title || '',
          formPurpose: 'job_application',
        };

        // Use LLM to identify the field
        const analysis = await llmFieldAnalysis(signals, contextInfo, async (prompt) => {
          return this.aiService.analyzeField(prompt);
        });

        if (analysis.fieldType !== 'unknown' && analysis.confidence > 0.5) {
          // Try to fill the field
          const value = await this.resolveFieldValue(analysis.fieldType, userData, jobContext);
          if (value) {
            await this.setFieldValue(field.elementRef, value, 'text');
            this.filledFields.set(`ai_${analysis.fieldType}`, value);
            this.logger.log(`AI filled unknown field as ${analysis.fieldType}`);
          }
        }
      } catch (error) {
        this.logger.error('Error handling unknown field with AI:', error);
      }
    }
  }

  /**
   * Set a field value in the DOM
   * @param {string} elementRef - Element reference
   * @param {any} value - Value to set
   * @param {string} inputType - Input type (text, select, checkbox, etc.)
   */
  async setFieldValue(elementRef, value, inputType) {
    await chrome.tabs.sendMessage(this.tabId, {
      type: 'SET_FIELD_VALUE',
      elementRef,
      value,
      inputType,
    });
  }

  /**
   * Wait for specified milliseconds
   * @param {number} ms - Milliseconds to wait
   * @returns {Promise<void>}
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current form analysis
   * @returns {Object} Form analysis
   */
  getAnalysis() {
    return this.currentAnalysis;
  }

  /**
   * Get filled fields
   * @returns {Map} Filled fields map
   */
  getFilledFields() {
    return new Map(this.filledFields);
  }

  /**
   * Get skipped fields
   * @returns {Array} Skipped fields
   */
  getSkippedFields() {
    return [...this.skippedFields];
  }
}
