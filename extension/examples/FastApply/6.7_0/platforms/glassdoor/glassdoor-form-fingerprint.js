// Form Fingerprinting System for Indeed
// Permanent fix for repeated demographics form detection failures

export class GlassdoorFormFingerprinter {
  constructor() {
    this.processedForms = new Map(); // formHash -> {timestamp, questions, success}
    this.currentFormState = null;
    this.retryAttempts = new Map(); // formHash -> retryCount
  }

  /**
   * Create unique fingerprint for a form based on its questions and structure
   */
  createFormFingerprint(questionsForm) {
    try {
      const fingerprint = {
        url: window.location.href,
        formClasses: this.getFormClasses(questionsForm),
        questionStructure: this.analyzeQuestionStructure(questionsForm),
        questionCount: this.getQuestionCounts(questionsForm),
        contentHash: this.createContentHash(questionsForm),
        timestamp: Date.now()
      };

      return this.hashFingerprint(fingerprint);
    } catch (error) {
      console.error("❌ Error creating form fingerprint:", error);
      return null;
    }
  }

  /**
   * Get form CSS classes for identification
   */
  getFormClasses(questionsForm) {
    return {
      formClass: questionsForm.className,
      questionItemClasses: Array.from(questionsForm.querySelectorAll('[class*="Questions"], [class*="questions"]'))
        .map(el => el.className)
        .slice(0, 5),
      hasDataTestIds: questionsForm.querySelectorAll('[data-testid]').length > 0
    };
  }

  /**
   * Analyze question structure and types
   */
  analyzeQuestionStructure(questionsForm) {
    const structure = {
      radioGroups: [],
      checkboxGroups: [],
      selectFields: [],
      textFields: [],
      fileUploads: []
    };

    // Analyze radio groups
    const radioInputs = questionsForm.querySelectorAll('input[type="radio"]');
    const radioGroups = new Set();
    radioInputs.forEach(radio => {
      if (radio.name) radioGroups.add(radio.name);
    });
    structure.radioGroups = Array.from(radioGroups);

    // Analyze question text patterns
    const questionTexts = this.extractQuestionTexts(questionsForm);
    structure.questionPatterns = questionTexts.map(text => 
      text.toLowerCase()
        .replace(/[^a-z\s]/g, '')
        .split(' ')
        .filter(word => word.length > 3)
        .slice(0, 3) // First 3 significant words
        .join('_')
    );

    return structure;
  }

  /**
   * Extract question texts using multiple strategies
   */
  extractQuestionTexts(questionsForm) {
    const texts = new Set();
    
    // Strategy 1: Legend elements
    questionsForm.querySelectorAll('legend').forEach(legend => {
      if (legend.textContent.trim()) {
        texts.add(legend.textContent.trim());
      }
    });

    // Strategy 2: Data-testid labels
    questionsForm.querySelectorAll('[data-testid*="label"]').forEach(label => {
      if (label.textContent.trim()) {
        texts.add(label.textContent.trim());
      }
    });

    // Strategy 3: Fieldset labels
    questionsForm.querySelectorAll('fieldset').forEach(fieldset => {
      const label = fieldset.querySelector('label, .label, [class*="label"]');
      if (label && label.textContent.trim()) {
        texts.add(label.textContent.trim());
      }
    });

    return Array.from(texts);
  }

  /**
   * Get counts of different question types
   */
  getQuestionCounts(questionsForm) {
    return {
      radioInputs: questionsForm.querySelectorAll('input[type="radio"]').length,
      checkboxInputs: questionsForm.querySelectorAll('input[type="checkbox"]').length,
      selectInputs: questionsForm.querySelectorAll('select').length,
      textInputs: questionsForm.querySelectorAll('input[type="text"], textarea').length,
      fileInputs: questionsForm.querySelectorAll('input[type="file"]').length,
      fieldsets: questionsForm.querySelectorAll('fieldset').length,
      questionItems: questionsForm.querySelectorAll('[class*="Questions"], [class*="questions"]').length
    };
  }

  /**
   * Create content-based hash for uniqueness
   */
  createContentHash(questionsForm) {
    const contentElements = [
      ...questionsForm.querySelectorAll('legend, label, [data-testid*="label"]')
    ];
    
    const contentString = contentElements
      .map(el => el.textContent.trim())
      .filter(text => text.length > 0)
      .sort()
      .join('|');

    return this.simpleHash(contentString);
  }

  /**
   * Hash the fingerprint object into a unique string
   */
  hashFingerprint(fingerprint) {
    const fingerprintString = JSON.stringify(fingerprint, Object.keys(fingerprint).sort());
    return this.simpleHash(fingerprintString);
  }

  /**
   * Simple hash function for string input
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; 
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Check if form was already processed successfully
   */
  isFormAlreadyProcessed(formHash) {
    const processed = this.processedForms.get(formHash);
    return processed && processed.success;
  }

  /**
   * Check if form failed too many times
   */
  shouldSkipForm(formHash) {
    const retryCount = this.retryAttempts.get(formHash) || 0;
    return retryCount >= 3; // Max 3 retry attempts
  }

  /**
   * Mark form as processed
   */
  markFormProcessed(formHash, success, questionData = null) {
    this.processedForms.set(formHash, {
      timestamp: Date.now(),
      success: success,
      questions: questionData,
      url: window.location.href
    });

    if (!success) {
      const currentRetries = this.retryAttempts.get(formHash) || 0;
      this.retryAttempts.set(formHash, currentRetries + 1);
    } else {
      // Reset retry count on success
      this.retryAttempts.delete(formHash);
    }
  }

  /**
   * Get retry count for a form
   */
  getRetryCount(formHash) {
    return this.retryAttempts.get(formHash) || 0;
  }

  /**
   * Clear old processed forms (older than 1 hour)
   */
  cleanup() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    for (const [hash, data] of this.processedForms.entries()) {
      if (data.timestamp < oneHourAgo) {
        this.processedForms.delete(hash);
        this.retryAttempts.delete(hash);
      }
    }
  }

  /**
   * Get debug information about processed forms
   */
  getDebugInfo() {
    return {
      processedForms: Array.from(this.processedForms.entries()),
      retryAttempts: Array.from(this.retryAttempts.entries()),
      currentFormState: this.currentFormState
    };
  }
}