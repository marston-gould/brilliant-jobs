// platforms/monster/monster-form-handler.js
import { notifyStatus } from "../../utils/status-helper.js";

export class MonsterFormHandler {
  constructor(aiService, userData, options = {}) {
    this.aiService = aiService;
    this.userData = userData;
    this.answerCache = new Map();

    // Co-pilot mode properties
    this.logger = options.logger;
    this.copilotMode = options.copilotMode || false;
    this.copilotState = options.copilotState;
    this.currentJobTitle = "";
    this.userActionPromise = null;
    this.userActionResolver = null;
    this.jobDescription = null;
  }

  /**
   * Wait for user action (Submit, Skip, Next)
   */
  waitForUserAction() {
    if (this.userActionPromise) {
      return this.userActionPromise;
    }
    this.userActionPromise = new Promise((resolve) => {
      this.userActionResolver = resolve;
    });
    return this.userActionPromise;
  }

  /**
   * Resolve the user action promise
   */
  resolveUserAction(action) {
    if (this.userActionResolver) {
      this.userActionResolver(action);
      this.userActionResolver = null;
      this.userActionPromise = null;
    }
  }

  /**
   * Main entry point - process the Monster application form
   */
  async processApplicationForm(data) {
    try {
      await this.delay(1000);

      // Find the form container
      const formContainer = document.querySelector('#loading-container');
      if (!formContainer) {
        return { success: false, reason: "no_form_found" };
      }

      // Grab all fields
      const fields = await this.grabMonsterFields(formContainer);
      console.log(`📝 Found ${fields.length} fields to process`);

      // Filter to only unfilled fields
      const unfilledFields = fields.filter(field => {
        if (!field.element) return false;
        if (Array.isArray(field.element)) {
          return !field.element.some(el => el.checked);
        }
        return !field.element.value;
      });

      console.log(`📝 ${unfilledFields.length} unfilled fields`);

      // Process each field
      if (unfilledFields.length > 0) {
        await this.delay(1000);
        await this.fillFields(unfilledFields);
      }

      await this.delay(1500);

      // Find submit button
      const submitButton = this.findSubmitButton();
      if (!submitButton) {
        return { success: false, reason: "submit_button_not_found" };
      }

      // Co-pilot mode: pause and wait for user approval
      if (this.copilotMode) {
        notifyStatus({
          type: "COPILOT_SUBMIT_READY",
          data: {
            buttonText: submitButton.textContent?.trim(),
            jobTitle: this.currentJobTitle,
            title: this.currentJobTitle,
          },
        });

        if (this.copilotState) {
          this.copilotState.setPendingSubmission(
            { title: this.currentJobTitle },
            submitButton
          );
        }

        const userAction = await this.waitForUserAction();

        if (userAction === "SUBMIT") {
          if (this.copilotState) {
            this.copilotState.clearPendingSubmission();
          }

          if (this.logger && typeof this.logger === 'function') {
            this.logger({ type: 'SUBMITTING_APPLICATION' });
          }

          await this.clickSubmitButton(submitButton);
          return await this.waitForSubmissionResult();
        } else if (userAction === "SKIP") {
          return { success: false, reason: "user_skipped" };
        }
      }

      // Auto-pilot mode: submit directly
      await this.clickSubmitButton(submitButton);

      // Wait for submission result
      return await this.waitForSubmissionResult();
    } catch (error) {
      console.error("Error processing application form:", error);
      return {
        success: false,
        reason: "error",
        error: error.message,
      };
    }
  }

  /**
   * Grab all form fields from Monster application
   */
  async grabMonsterFields(container) {
    const results = [];
    const labels = container.querySelectorAll('label:not(:has(label))');

    for (const label of labels) {
      const result = {
        element: null,
        type: '',
        label: label.innerText.trim().replace('\n', ''),
        required: false,
        options: []
      };

      let parentEl = label.parentElement;

      // Traverse up to find associated input elements
      for (let n = 0; n < 10; n++) {
        const elements = [...parentEl.querySelectorAll('input, div[role="radio"], textarea')];
        if (!elements.length) {
          parentEl = parentEl.parentElement;
          if (!parentEl) break;
          continue;
        }
        result.element = elements;
        break;
      }

      if (!result.element || !result.element[0]) {
        result.element = null;
        results.push(result);
        continue;
      }

      // Determine field type
      if (result.element[0]?.getAttribute('role') === 'radio') {
        result.type = 'radio';
        result.options = result.element.map(input => input.innerText.trim());
        result.required = true;
      } else if (result.element[0]?.closest('fieldset') &&
                 result.element[0]?.getAttribute('role') === 'combobox') {
        result.type = 'select';
        result.element = result.element[0];
        result.required = result.element.getAttribute('aria-required') === 'true';

        const fieldset = result.element.closest('fieldset');

        // Open dropdown to get options
        this.forceElementInteraction(result.element, 'mousedown');

        try {
          const options = await this.waitForDropdownOptions(fieldset, 3000);
          result.options = [...options].map(input => input.innerText.trim());
        } catch (e) {
          console.error('Failed to get dropdown options:', e);
          result.options = [];
        }

        result.required = true;
      } else {
        result.element = result.element[0];
        result.type = result.element.type;
        result.required = result.element.getAttribute('aria-required') === 'true' ||
                          result.element.required === true;
      }

      results.push(result);
    }

    return results;
  }

  /**
   * Fill all form fields
   */
  async fillFields(fields) {
    for (const field of fields) {
      try {
        const answer = await this.getAnswer(field.label, field.options);

        if (!answer && answer !== 0) {
          if (field.required && Array.isArray(field.element) && field.element[0]) {
            // Click first option for required fields with no answer
            field.element[0].click();
          }
          continue;
        }

        // Handle different field types
        if (Array.isArray(field.element)) {
          await this.handleRadioField(field, answer);
        } else if (field.element?.getAttribute('role') === 'combobox') {
          await this.handleComboboxField(field, answer);
        } else if (field.type === 'select') {
          await this.handleSelectField(field, answer);
        } else if (field.type === 'checkbox') {
          await this.handleCheckboxField(field, answer);
        } else {
          await this.handleTextInput(field, answer);
        }

        await this.delay(1000);
      } catch (e) {
        console.error('Error filling field:', field.label, e);
      }
    }
  }

  /**
   * Handle radio button field
   */
  async handleRadioField(field, answer) {
    const values = Array.isArray(answer) ? answer : [answer];

    for (const el of field.element) {
      if (values.includes(el.innerText.trim())) {
        el.click();
        break;
      }
    }
  }

  /**
   * Handle combobox (dropdown) field
   */
  async handleComboboxField(field, answer) {
    const value = Array.isArray(answer) ? answer[0] : answer;

    const fieldset = field.element.closest('fieldset');

    // Open dropdown
    this.forceElementInteraction(field.element, 'click');

    try {
      const options = await this.waitForDropdownOptions(fieldset, 3000);

      for (const el of options) {
        if (el.innerText.trim() === value) {
          this.forceElementInteraction(el, 'click');
          break;
        }
      }
    } catch (e) {
      console.error('Failed to select dropdown option:', e);
    }
  }

  /**
   * Handle select field
   */
  async handleSelectField(field, answer) {
    const value = Array.isArray(answer) ? answer[0] : answer;

    const options = [...field.element.options];
    for (const el of options) {
      if (el.value === value || el.textContent.trim() === value) {
        el.selected = true;
        field.element.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }
  }

  /**
   * Handle checkbox field
   */
  async handleCheckboxField(field, answer) {
    const value = Array.isArray(answer) ? answer[0] : answer;
    const shouldCheck = this.shouldCheckValue(value);

    let isChecked = false;
    try {
      isChecked = window.getComputedStyle(
        field.element.parentElement?.children?.[1]?.firstChild?.firstChild
      ).visibility === 'visible';
    } catch (e) {
      isChecked = field.element.checked;
    }

    if (shouldCheck !== isChecked) {
      field.element.parentElement?.click() || field.element.click();
    }
  }

  /**
   * Handle text input field
   */
  async handleTextInput(field, answer) {
    const value = Array.isArray(answer) ? answer[0] : answer;

    // Check if already filled
    if (field.element.value) {
      return;
    }

    this.setNativeValue(field.element, value);
    field.element.dispatchEvent(new Event('focusout', { bubbles: true }));

    // Handle autocomplete
    if (field.element.getAttribute('aria-autocomplete') === 'list') {
      try {
        await this.waitForElement('.basic-typeahead__selectable', 7000);
        const selectable = field.element.parentElement.querySelector('.basic-typeahead__selectable');
        if (selectable) {
          selectable.click();
        }
      } catch (e) {
        console.error('Autocomplete error:', e);
      }
    }
  }

  /**
   * Set native value on input element
   */
  setNativeValue(element, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (valueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter?.call(element, value);
    } else {
      valueSetter?.call(element, value);
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Force element interaction for minimized windows
   */
  forceElementInteraction(element, actionType = 'click') {
    element.scrollIntoView({ behavior: 'instant', block: 'center' });
    element.focus();

    const eventOptions = {
      bubbles: true,
      cancelable: true,
      view: window,
      composed: true
    };

    element.dispatchEvent(new FocusEvent('focusin', eventOptions));
    element.dispatchEvent(new PointerEvent('pointerover', eventOptions));
    element.dispatchEvent(new PointerEvent('pointerenter', eventOptions));
    element.dispatchEvent(new MouseEvent('mouseover', eventOptions));
    element.dispatchEvent(new MouseEvent('mouseenter', eventOptions));
    element.dispatchEvent(new PointerEvent('pointermove', eventOptions));
    element.dispatchEvent(new MouseEvent('mousemove', eventOptions));

    if (actionType === 'click' || actionType === 'mousedown') {
      element.dispatchEvent(new PointerEvent('pointerdown', eventOptions));
      element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
    }

    if (actionType === 'click') {
      element.dispatchEvent(new PointerEvent('pointerup', eventOptions));
      element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
      element.dispatchEvent(new MouseEvent('click', eventOptions));
      element.click();
    }
  }

  /**
   * Wait for dropdown options to appear
   */
  waitForDropdownOptions(fieldset, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const checkOptions = () => {
        const options = fieldset.querySelectorAll('div[role="option"]');
        if (options.length > 0) {
          return options;
        }
        return null;
      };

      // Check if options already exist
      const existingOptions = checkOptions();
      if (existingOptions) {
        resolve(existingOptions);
        return;
      }

      // Set up MutationObserver to watch for options
      const observer = new MutationObserver(() => {
        const options = checkOptions();
        if (options) {
          observer.disconnect();
          clearTimeout(timeoutId);
          resolve(options);
        }
      });

      observer.observe(fieldset, {
        childList: true,
        subtree: true
      });

      const timeoutId = setTimeout(() => {
        observer.disconnect();
        const options = checkOptions();
        if (options) {
          resolve(options);
        } else {
          reject(new Error('Dropdown options did not appear within timeout'));
        }
      }, timeout);
    });
  }

  /**
   * Find the submit button
   */
  findSubmitButton() {
    const selectors = [
      'div[class^=StepWrapper_outerStepFrame] button[data-testid="onboarding-submit-button"]',
      'button[data-testid="submit-button"]',
      'button[type="submit"]',
      'button.btn-primary',
    ];

    for (const selector of selectors) {
      const button = document.querySelector(selector);
      if (button && this.isElementVisible(button)) {
        return button;
      }
    }

    // Look for buttons with submit-like text
    const allButtons = document.querySelectorAll('button');
    for (const btn of allButtons) {
      if (!this.isElementVisible(btn) || btn.disabled) continue;

      const text = btn.textContent.toLowerCase();
      if (text.includes('submit') || text.includes('apply')) {
        return btn;
      }
    }

    return null;
  }

  /**
   * Click the submit button
   */
  async clickSubmitButton(button) {
    this.forceElementInteraction(button, 'click');
    await this.delay(1000);
  }

  /**
   * Wait for submission result
   */
  async waitForSubmissionResult() {
    const maxWaitTime = 30000;
    const checkInterval = 1000;
    let elapsedTime = 0;

    while (elapsedTime < maxWaitTime) {
      await this.delay(checkInterval);
      elapsedTime += checkInterval;

      // Check for success page
      if (location.href.includes('/jobs/apply-complete')) {
        return {
          success: true,
          message: "Application submitted successfully",
        };
      }

      // Check for questionnaire page (multi-step form)
      if (location.href.includes('/apply/questionnaire')) {
        // Process additional questionnaire
        await this.delay(5000);

        // Click confirmation button if present
        const confirmBtn = document.querySelector('button[data-testid="confirm-dialog-submit-button"]');
        if (confirmBtn) {
          confirmBtn.click();
        }

        // Process additional fields
        const container = document.querySelector('#loading-container');
        if (container) {
          const fields = await this.grabMonsterFields(container);
          const unfilledFields = fields.filter(f => f.element && !f.element.value);

          if (unfilledFields.length > 0) {
            await this.fillFields(unfilledFields);
          }

          await this.delay(1500);

          // Submit again
          const submitBtn = this.findSubmitButton();
          if (submitBtn) {
            await this.clickSubmitButton(submitBtn);
          }
        }

        continue;
      }

      // Check for error message
      const errorResult = this.checkForErrorMessage();
      if (errorResult.found) {
        return {
          success: false,
          reason: "submission_error",
          error: errorResult.message,
        };
      }
    }

    return {
      success: false,
      reason: "submission_timeout",
      error: "Timeout waiting for submission to complete",
    };
  }

  /**
   * Check for error message
   */
  checkForErrorMessage() {
    try {
      const errorSelectors = [
        '.error',
        '.alert-danger',
        '.form-error',
        '[role="alert"]',
        '.validation-error',
      ];

      for (const selector of errorSelectors) {
        const element = document.querySelector(selector);
        if (element && this.isElementVisible(element)) {
          return {
            found: true,
            message: element.textContent.trim(),
          };
        }
      }

      return { found: false };
    } catch (error) {
      return { found: false };
    }
  }

  /**
   * Get answer from AI service
   */
  async getAnswer(label, options = [], retryCount = 0) {
    const normalizedLabel = label?.toLowerCase()?.trim() || "";

    if (this.answerCache.has(normalizedLabel)) {
      return this.answerCache.get(normalizedLabel);
    }

    try {
      const context = {
        platform: "monster",
        userData: this.userData,
        jobDescription: this.jobDescription || '',
        fieldContext: `Monster application form field`,
        required: false
      };

      let answer;

      if (options && options.length > 0) {
        answer = await this.aiService.getOptionAnswer(label, options, context);
      } else if (label.toLowerCase().includes('describe') ||
                 label.toLowerCase().includes('why') ||
                 label.toLowerCase().includes('cover letter') ||
                 label.toLowerCase().includes('textarea')) {
        answer = await this.aiService.getLongformAnswer(label, options, context);
      } else {
        answer = await this.aiService.getNormalAnswer(label, options, context);
      }

      if (answer === null || answer === undefined || answer === "" ||
          String(answer).trim() === "") {
        if (retryCount < 2) {
          await this.delay(1000 + (retryCount * 500));
          return await this.getAnswer(label, options, retryCount + 1);
        }
        return null;
      }

      const cleanedAnswer = String(answer).replace(/["*\-]/g, "");
      this.answerCache.set(normalizedLabel, cleanedAnswer);
      return cleanedAnswer;
    } catch (error) {
      if (retryCount < 2) {
        await this.delay(1000 + (retryCount * 500));
        return await this.getAnswer(label, options, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Helper methods
   */
  shouldCheckValue(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase().trim();
      return lowerValue === 'true' || lowerValue === 'yes' ||
             lowerValue === 'on' || lowerValue === '1';
    }
    if (typeof value === 'number') return value === 1;
    return false;
  }

  isElementVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0"
    );
  }

  async waitForElement(selector, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const check = () => {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
          return;
        }

        if (Date.now() - startTime > timeout) {
          reject(new Error(`Timeout waiting for element: ${selector}`));
          return;
        }

        setTimeout(check, 500);
      };

      check();
    });
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
