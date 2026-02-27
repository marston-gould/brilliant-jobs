import { notifyStatus } from "../../utils/status-helper.js";
// platforms/workable/workable-form-handler.js - FIXED VERSION
import { AIService } from "../../services/index.js";
import { AIResponseUtils } from "../../shared/utilities/index.js";

export default class WorkableFormHandler {
  constructor(options = {}) {
    this.host = options.host;
    this.userData = options.userData || {};
    this.jobDescription = options.jobDescription || "";
    this.aiService = new AIService({ apiHost: this.host, platform: "workable" });
    this.processedForms = new Set();
    this.fillInProgress = false;
    this.lastFillTime = 0;
    // Global overlay used via notifyStatus()
    this.logger = options.logger || null;

    // Co-pilot properties
    this.copilotMode = false;
    this.copilotState = null;
    this.currentJobTitle = null;
    this.userHasControl = false;

    // Promise-based pause helpers
    this.userActionResolver = null;
    this.userActionPromise = null;
    
    // Cache for combobox options (to avoid opening modal twice)
    this.comboboxOptionsCache = new Map();
  }

  /**
   * Wait for user action (Submit, Skip, Next, Take Control, etc.)
   * Returns a promise that resolves when resolveUserAction is called
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
   * Resolve the user action promise with the action taken
   * @param {string} action - The action (SUBMIT, SKIP, NEXT)
   */
  resolveUserAction(action) {
    if (this.userActionResolver) {
      this.userActionResolver(action);
      this.userActionResolver = null;
      this.userActionPromise = null;
    }
  }

  /**
   * Check if a button is a final submit button
   */
  isFinalSubmitButton(button) {
    if (!button) return false;
    const text = (button.textContent || "").trim().toLowerCase();
    const dataUi = button.getAttribute("data-ui") || "";
    return (
      text.includes("submit application") ||
      text.includes("submit") ||
      text === "apply" ||
      dataUi === "form-submit-button" ||
      button.type === "submit"
    );
  }

  /**
   * Check if a button is a next/continue button
   */
  isNextOrContinueButton(button) {
    if (!button) return false;
    const text = (button.textContent || "").trim().toLowerCase();
    return (
      text.includes("continue") ||
      text.includes("next") ||
      text.includes("review") ||
      text === "continue" ||
      text === "next"
    );
  }

  /**
   * Determine if a field should be skipped during validation
   */
  shouldSkipField(field) {
    if (!field.label) return true;

    const labelLower = field.label.toLowerCase();

    // Skip "Other URL" fields silently
    if (
      labelLower.includes("other url") ||
      labelLower.includes("other website") ||
      labelLower.includes("additional url") ||
      (labelLower === "other" && field.type === "url")
    ) {
      return true;
    }

    // Skip file fields
    if (field.type === "file") {
      return true;
    }

    return false;
  }

  /**
   * Generate cover letter using utility service
   */
  async generateCoverLetter(jobData = {}) {
    return await AIResponseUtils.generateCoverLetter(
      this.aiService,
      this.userData,
      jobData,
      this.jobDescription
    );
  }

  /**
   * Clean AI response using utility
   */
  cleanAIResponse(response) {
    return AIResponseUtils.cleanAIResponse(response);
  }

  /**
   * Extract job description as a string using utility
   */
  getJobDescriptionString(jobData = {}) {
    return AIResponseUtils.getJobDescriptionString(this.jobDescription, jobData);
  }

  /**
   * Check if a field is a cover letter field using utility
   */
  isCoverLetterField(field) {
    return AIResponseUtils.isCoverLetterField(field);
  }

  /**
   * Extract job title from the page using utility
   */
  extractJobTitle() {
    return AIResponseUtils.extractJobTitle('workable');
  }

  /**
   * Extract company name from the page using utility
   */
  extractCompanyName() {
    return AIResponseUtils.extractCompanyName('workable');
  }

  /**
   * Enhanced phone field handling
   */
  async fillPhoneField(element, value) {
    try {
      // Look for the international telephone input field
      const phoneInput =
        element.querySelector("input.iti__tel-input") ||
        element.querySelector('input[type="tel"]') ||
        element;

      if (!phoneInput) {
        return false;
      }

      this.scrollToElement(phoneInput);
      phoneInput.focus();
      await this.wait(200);

      // Use native setter for phone inputs
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;

      // Clean the phone number (remove any formatting)
      let cleanPhone = String(value).replace(/\D/g, "");

      // If it starts with country code, keep it as is
      // If it doesn't, it might be a local number
      if (cleanPhone.length > 10) {
        // Likely includes country code
        cleanPhone = cleanPhone;
      } else {
        // Local number, don't add country code as ITI will handle it
        cleanPhone = cleanPhone;
      }

      // Clear and set new value
      nativeInputValueSetter.call(phoneInput, "");
      phoneInput.dispatchEvent(new Event("input", { bubbles: true }));
      await this.wait(50);

      nativeInputValueSetter.call(phoneInput, cleanPhone);
      phoneInput.dispatchEvent(new Event("input", { bubbles: true }));
      phoneInput.dispatchEvent(new Event("change", { bubbles: true }));
      phoneInput.dispatchEvent(new Event("blur", { bubbles: true }));

      await this.wait(300);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Find the submit button in a form
   */
  findSubmitButton(form) {
    const submitSelectors = [
      'button[data-ui="application-form-submit"]',
      'button[data-ui="form-submit-button"]',
      'button[data-ui="submit-application"]',
      'button[type="submit"]',
      'input[type="submit"]',
      "button.submit-button",
      "button.submit",
      "button.apply-button",
      "button.apply",
      "button.btn-primary:last-child",
      "button.button--primary:last-child",
    ];

    // First search within the form
    for (const selector of submitSelectors) {
      const buttons = form.querySelectorAll(selector);
      if (buttons.length) {
        for (const btn of buttons) {
          if (this.isElementVisible(btn) && !btn.disabled && btn.getAttribute('data-action') !== 'delete') {
            return btn;
          }
        }
      }
    }

    // Submit button may be outside the form in Workable - search document
    for (const selector of submitSelectors) {
      const buttons = document.querySelectorAll(selector);
      if (buttons.length) {
        for (const btn of buttons) {
          if (this.isElementVisible(btn) && !btn.disabled && btn.getAttribute('data-action') !== 'delete') {
            return btn;
          }
        }
      }
    }

    const allButtons = form.querySelectorAll('button, input[type="button"]');
    for (const btn of allButtons) {
      if (!this.isElementVisible(btn) || btn.disabled) continue;

      // Skip "Add" section buttons (Education, Experience, etc.)
      if (btn.getAttribute('data-ui') === 'add-section') continue;
      if (btn.textContent.trim().startsWith('+ Add')) continue;
      // Skip delete buttons
      if (btn.getAttribute('data-action') === 'delete') continue;

      const text = btn.textContent.toLowerCase();
      if (
        text.includes("submit") ||
        text.includes("apply") ||
        text.includes("send") ||
        text.includes("continue") ||
        text === "next"
      ) {
        return btn;
      }
    }

    const visibleButtons = Array.from(form.querySelectorAll("button")).filter(
      (btn) => {
        if (!this.isElementVisible(btn) || btn.disabled) return false;
        // Exclude "Add" section buttons (Education, Experience, etc.)
        if (btn.getAttribute('data-ui') === 'add-section') return false;
        if (btn.textContent.trim().startsWith('+ Add')) return false;
        // Exclude share/social buttons
        if (btn.getAttribute('data-ui') === 'share-now') return false;
        // Exclude delete buttons
        if (btn.getAttribute('data-action') === 'delete') return false;
        return true;
      }
    );

    if (visibleButtons.length) {
      return visibleButtons[visibleButtons.length - 1];
    }

    return null;
  }

  /**
   * Validate and fill any remaining required fields before submission
   */
  async validateAndFillRequiredFields(form) {
    try {
      const unfilledRequiredFields = this.getUnfilledRequiredFields(form);

      if (unfilledRequiredFields.length === 0) {
        return true; // All required fields are filled
      }

      console.log(`Found ${unfilledRequiredFields.length} unfilled required fields, attempting to fill them...`);

      // Attempt to fill each unfilled required field
      for (const field of unfilledRequiredFields) {
        try {
          console.log(`Attempting to fill required field: ${field.label || field.name || field.type}`);

          // Get field options for select/radio fields
          const options = await this.getFieldOptions(field.element);

          // Get field constraints including placeholder for date detection
          const constraints = this.getFieldConstraints(field.element);

          // Build field context with placeholder information
          let fieldContext = `This is a required ${field.type} field that must be filled.`;
          if (constraints.placeholder) {
            fieldContext += ` Placeholder: ${constraints.placeholder}`;
          }

          const answer = await this.getAIAnswer(
            field.label,
            options,
            field.type,
            fieldContext
          );

          if (answer && answer !== "SKIP") {
            await this.fillField(field, answer);
            console.log(`Successfully filled required field: ${field.label}`);
          } else {
            console.warn(`Could not get answer for required field: ${field.label}`);
          }
        } catch (fieldError) {
          console.error(`Error filling required field ${field.label}:`, fieldError);
        }

        // Small delay between fields
        await this.humanWait(500, 1000);
      }

      // Re-check if all required fields are now filled
      const remainingUnfilled = this.getUnfilledRequiredFields(form);
      if (remainingUnfilled.length > 0) {
        console.warn(`Still have ${remainingUnfilled.length} unfilled required fields after validation attempt`);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error validating required fields:", error);
      return false;
    }
  }

  /**
   * Get all unfilled required fields in the form
   */
  getUnfilledRequiredFields(form) {
    const unfilledFields = [];

    // Find all required fields
    const requiredSelectors = [
      'input[required]:not([type="hidden"]):not([type="submit"]):not([type="button"])',
      'select[required]',
      'textarea[required]',
      'input[aria-required="true"]:not([type="hidden"]):not([type="submit"]):not([type="button"])',
      'select[aria-required="true"]',
      'textarea[aria-required="true"]',
      // Workable-specific required field indicators
      'input[data-required="true"]:not([type="hidden"]):not([type="submit"]):not([type="button"])',
      'select[data-required="true"]',
      'textarea[data-required="true"]',
      '.required input:not([type="hidden"]):not([type="submit"]):not([type="button"])',
      '.required select',
      '.required textarea'
    ];

    for (const selector of requiredSelectors) {
      const elements = form.querySelectorAll(selector);

      for (const element of elements) {
        if (!this.isElementVisible(element)) continue;

        // Check if field is empty
        const isEmpty = this.isFieldEmpty(element);
        if (isEmpty) {
          const fieldInfo = this.getFieldInfo(element);
          if (fieldInfo && !this.shouldSkipField(fieldInfo)) {
            // Special handling for checkboxes - check if they're already properly set
            if (fieldInfo.type === 'checkbox') {
              // For role="checkbox" elements, check aria-checked
              if (element.getAttribute('role') === 'checkbox') {
                const isChecked = element.getAttribute('aria-checked') === 'true';
                if (isChecked) {
                  console.log(`Checkbox already checked, skipping: ${fieldInfo.label}`);
                  continue; // Skip this field as it's already checked
                }
              }
              // For standard input checkboxes, check .checked property  
              else if (element.tagName === 'INPUT' && element.type === 'checkbox') {
                if (element.checked) {
                  console.log(`Input checkbox already checked, skipping: ${fieldInfo.label}`);
                  continue; // Skip this field as it's already checked
                }
              }
            }
            unfilledFields.push(fieldInfo);
          }
        }
      }
    }

    // Also check for required fieldsets (radio groups, checkbox groups) - Workable specific
    const requiredFieldsets = form.querySelectorAll(
      'fieldset[required], fieldset[aria-required="true"], ' +
      'div[role="radiogroup"][required], div[role="radiogroup"][aria-required="true"], ' +
      '.field-type-Boolean[data-required="true"], ' +
      '.required fieldset, .required div[role="radiogroup"]'
    );

    for (const fieldset of requiredFieldsets) {
      if (!this.isElementVisible(fieldset)) continue;

      // Check if no option is selected in the group
      const hasSelection = fieldset.querySelector('input[type="radio"]:checked, input[type="checkbox"]:checked');
      if (!hasSelection) {
        // Find the label for this fieldset
        const label = this.getFieldsetLabel(fieldset);
        if (label) {
          unfilledFields.push({
            element: fieldset,
            label: label,
            type: 'fieldset',
            name: fieldset.name || '',
            required: true
          });
        }
      }
    }

    return unfilledFields;
  }

  /**
   * Get field information for a form element
   */
  getFieldInfo(element) {
    return {
      element,
      label: this.getFieldLabel(element),
      type: this.getFieldType(element),
      required: this.isFieldRequired(element),
      name: element.name || element.id || "",
    };
  }

  /**
   * Check if a field is empty
   */
  isFieldEmpty(element) {
    const tagName = element.tagName.toLowerCase();
    const type = element.type ? element.type.toLowerCase() : '';

    switch (tagName) {
      case 'input':
        if (type === 'radio' || type === 'checkbox') {
          // For radio/checkbox, check if any in the group is selected
          const name = element.name;
          if (name) {
            const form = element.closest('form');
            const group = form.querySelectorAll(`input[name="${name}"]:checked`);
            return group.length === 0;
          }
          return !element.checked;
        } else {
          return !element.value || element.value.trim() === '';
        }

      case 'select':
        return !element.value || element.value === '' || element.value === 'null' || element.selectedIndex <= 0;

      case 'textarea':
        return !element.value || element.value.trim() === '';

      default:
        return !element.value || element.value.trim() === '';
    }
  }

  /**
   * Get label for a fieldset - Workable specific
   */
  getFieldsetLabel(fieldset) {
    // Try legend first
    const legend = fieldset.querySelector('legend');
    if (legend) {
      return legend.textContent.trim();
    }

    // Try data attributes
    const label = fieldset.getAttribute('aria-label') || fieldset.getAttribute('data-label');
    if (label) {
      return label.trim();
    }

    // Try Workable-specific label patterns
    const workableLabel = fieldset.querySelector('.field-label, .question-label, .form-label, label');
    if (workableLabel) {
      return workableLabel.textContent.trim();
    }

    // Try finding label by looking at previous elements or parent elements
    let prev = fieldset.previousElementSibling;
    while (prev) {
      if (prev.tagName === 'LABEL' || prev.classList.contains('question') ||
        prev.classList.contains('field-label') || prev.classList.contains('form-label')) {
        return prev.textContent.trim();
      }
      prev = prev.previousElementSibling;
    }

    // Check parent for labels
    const parent = fieldset.parentElement;
    const parentLabel = parent?.querySelector('.field-label, .question-label, .form-label, label');
    if (parentLabel) {
      return parentLabel.textContent.trim();
    }

    return 'Required field group';
  }

  /**
   * Detect if CAPTCHA is present on the page (any type)
   * @returns {boolean} True if CAPTCHA is detected
   */
  detectCaptcha() {
    try {
      const captchaSelectors = [
        '.g-recaptcha',
        '.h-captcha',
        '[data-sitekey]',
        '.cf-turnstile',
        'iframe[src*="recaptcha"]',
        'iframe[src*="hcaptcha"]',
        'iframe[src*="challenges.cloudflare.com"]',
        'iframe[src*="turnstile"]',
        '[class*="captcha"]',
        '[id*="captcha"]',
      ];

      for (const selector of captchaSelectors) {
        const element = document.querySelector(selector);
        if (element && this.isElementVisible(element)) {
          console.log(`🔐 CAPTCHA detected via selector: ${selector}`);
          return true;
        }
      }

      // Check for Turnstile-specific text that may exist outside shadow DOM
      const captchaTexts = [
        "verify you are human",
        "complete the captcha",
        "security verification",
      ];
      const bodyText = document.body?.innerText?.toLowerCase() || "";
      for (const text of captchaTexts) {
        if (bodyText.includes(text)) {
          console.log(`🔐 CAPTCHA detected via text: "${text}"`);
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if the CAPTCHA has been solved
   * Cloudflare Turnstile populates a hidden input when solved
   * @returns {boolean} True if CAPTCHA is solved or not present
   */
  isCaptchaSolved() {
    try {
      // Cloudflare Turnstile: check response input
      const turnstileResponse = document.querySelector(
        'input[name="cf-turnstile-response"], [name*="turnstile-response"]'
      );
      if (turnstileResponse && turnstileResponse.value) {
        return true;
      }

      // Google reCAPTCHA: check response textarea
      const recaptchaResponse = document.querySelector(
        'textarea[name="g-recaptcha-response"]'
      );
      if (recaptchaResponse && recaptchaResponse.value) {
        return true;
      }

      // hCaptcha: check response input
      const hcaptchaResponse = document.querySelector(
        'textarea[name="h-captcha-response"], [name*="hcaptcha-response"]'
      );
      if (hcaptchaResponse && hcaptchaResponse.value) {
        return true;
      }

      // If no CAPTCHA detected at all, consider it "solved"
      if (!this.detectCaptcha()) {
        return true;
      }

      return false;
    } catch (error) {
      return true; // Don't block on error
    }
  }

  /**
   * Wait for user to solve CAPTCHA
   * Polls every 2s, notifies user, and resolves when solved or times out
   * @param {number} timeout - Max wait time in ms (default 120s)
   * @returns {Promise<boolean>} True if solved, false if timed out
   */
  async waitForCaptchaSolved(timeout = 120000) {
    console.log("🔐 Waiting for user to solve CAPTCHA...");
    notifyStatus({ type: "CAPTCHA_SUBMIT_MANUAL" });

    const startTime = Date.now();
    let notifiedAt = startTime;

    while (Date.now() - startTime < timeout) {
      if (this.isCaptchaSolved()) {
        console.log("✅ CAPTCHA solved!");
        return true;
      }

      // Re-notify every 30s so user doesn't forget
      if (Date.now() - notifiedAt > 30000) {
        notifyStatus({ type: "CAPTCHA_DETECTED" });
        notifiedAt = Date.now();
      }

      await this.humanWait(2000, 2500);
    }

    console.warn("⏰ CAPTCHA solve timeout");
    return false;
  }

  /**
   * Submit the form with human-like behavior
   * Now supports co-pilot/auto-pilot modes
   */
  async submitForm(form, options = {}) {
    const { dryRun = false } = options;

    try {
      // First, validate and fill any remaining required fields
      const requiredFieldsValid = await this.validateAndFillRequiredFields(form);
      if (!requiredFieldsValid) {
        console.warn("Some required fields could not be filled. Proceeding with submission anyway.");
      }

      const submitButton = this.findSubmitButton(form);

      if (!submitButton) {
        return false;
      }

      if (!this.isElementVisible(submitButton) || submitButton.disabled) {
        return false;
      }

      this.scrollToElement(submitButton);

      // Determine if this is a final submit or next/continue button
      const isFinalSubmit = this.isFinalSubmitButton(submitButton);
      const isNextOrContinue = this.isNextOrContinueButton(submitButton);

      // ONLY pause in co-pilot mode - auto-pilot should submit automatically
      const shouldPause = this.copilotMode && (isFinalSubmit || isNextOrContinue);

      // Check for CAPTCHA before attempting submission
      if (this.detectCaptcha() && !this.isCaptchaSolved()) {
        console.log("🔐 CAPTCHA detected before submission - waiting for user");
        const solved = await this.waitForCaptchaSolved();
        if (!solved) {
          return "CAPTCHA_PENDING";
        }
      }

      if (shouldPause) {
        const messageType = isFinalSubmit
          ? "COPILOT_SUBMIT_READY"
          : "COPILOT_WAITING_FOR_NEXT";

        if (true) { // Global overlay
          notifyStatus({
            type: messageType,
            data: {
              buttonText: submitButton.textContent?.trim(),
              jobTitle: this.currentJobTitle,
              title: this.currentJobTitle,
            },
          });
        }

        if (this.copilotState) {
          if (isFinalSubmit) {
            this.copilotState.setPendingSubmission(
              { title: this.currentJobTitle },
              submitButton
            );
          } else {
            this.copilotState.setPendingNext(
              { title: this.currentJobTitle },
              submitButton
            );
          }
        }

        const userAction = await this.waitForUserAction();

        if (userAction === "SUBMIT" || userAction === "NEXT") {
          // User approved, continue with submission
          if (this.copilotState) {
            if (isFinalSubmit) {
              this.copilotState.clearPendingSubmission();
            } else {
              this.copilotState.clearPendingNext();
            }
          }

          // In co-pilot mode, actually click the submit button when user approves
          await this.humanWait(500, 1000);
          submitButton.click();

          if (this.logger && typeof this.logger === 'function') {
            this.logger({ type: 'SUBMITTING_APPLICATION' });
          }

          // Wait for submission to complete
          await this.humanWait(2000, 3000);

          // Check if CAPTCHA appeared after clicking submit
          if (this.detectCaptcha() && !this.isCaptchaSolved()) {
            console.log("🔐 CAPTCHA appeared after submit click - waiting for user");
            const solved = await this.waitForCaptchaSolved();
            if (!solved) {
              return "CAPTCHA_PENDING";
            }
            // CAPTCHA solved - submission may have auto-continued
            await this.humanWait(2000, 3000);
          }

          // Check if submission was successful
          if (this.isSuccessPage()) {
            return true;
          }

          // Wait for potential redirects or async submission
          let attempts = 0;
          const maxAttempts = 15;

          while (attempts < maxAttempts) {
            await this.humanWait(2000, 3000);

            if (this.isSuccessPage()) {
              return true;
            }

            // Check if CAPTCHA appeared during waiting
            if (this.detectCaptcha() && !this.isCaptchaSolved()) {
              console.log("🔐 CAPTCHA appeared during co-pilot post-submit wait");
              const solved = await this.waitForCaptchaSolved();
              if (solved) {
                await this.humanWait(3000, 5000);
                if (this.isSuccessPage()) {
                  return true;
                }
              } else {
                return "CAPTCHA_PENDING";
              }
            }

            attempts++;

            // Only treat form disappearance as success if URL also changed to success
            if (!document.querySelector('form') || !this.isElementVisible(form)) {
              // Double-check: is it actually success or just CAPTCHA overlay?
              if (this.isSuccessPage()) {
                return true;
              }
              // Form gone but no success indicator - wait a bit more
              await this.humanWait(2000, 3000);
              if (this.isSuccessPage()) {
                return true;
              }
            }
          }

          return "CAPTCHA_PENDING";

        } else if (userAction === "SKIP") {
          return { success: false, reason: "user_skipped" };
        }
      }

      await this.humanWait(2000, 4000);

      if (dryRun) {
        return true;
      }

      // Auto-pilot mode: click the submit button
      submitButton.click();

      // Wait for submission to process
      await this.humanWait(2000, 3000);

      // Check if CAPTCHA appeared after clicking submit
      if (this.detectCaptcha() && !this.isCaptchaSolved()) {
        console.log("🔐 CAPTCHA appeared after submit click - waiting for user");
        const solved = await this.waitForCaptchaSolved();
        if (solved) {
          // CAPTCHA solved - wait for submission to complete
          await this.humanWait(3000, 5000);
          if (this.isSuccessPage()) {
            return true;
          }
        } else {
          return "CAPTCHA_PENDING";
        }
      }

      // Check if submission was successful
      if (this.isSuccessPage()) {
        return true;
      }

      // Wait for potential redirects or async submission
      let attempts = 0;
      const maxAttempts = 15;

      while (attempts < maxAttempts) {
        await this.humanWait(2000, 3000);

        if (this.isSuccessPage()) {
          return true;
        }

        // Check if CAPTCHA appeared during waiting
        if (this.detectCaptcha() && !this.isCaptchaSolved()) {
          console.log("🔐 CAPTCHA appeared during post-submit wait");
          const solved = await this.waitForCaptchaSolved();
          if (solved) {
            await this.humanWait(3000, 5000);
            if (this.isSuccessPage()) {
              return true;
            }
          } else {
            return "CAPTCHA_PENDING";
          }
        }

        attempts++;

        // Form disappeared - but verify it's actually success, not CAPTCHA overlay
        if (!document.querySelector('form') || !this.isElementVisible(form)) {
          if (this.isSuccessPage()) {
            return true;
          }
          // Form gone but no success indicator - wait a bit more
          await this.humanWait(2000, 3000);
          if (this.isSuccessPage()) {
            return true;
          }
        }
      }

      return "CAPTCHA_PENDING";
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if current page indicates successful application submission.
   * Workable redirects to ?success on the apply URL after successful submission.
   */
  isSuccessPage() {
    // Primary check: Workable adds ?success to the URL on successful submission
    const url = window.location.href;
    if (url.includes("?success") || url.includes("&success")) {
      console.log("✅ Success detected via URL parameter");
      return true;
    }

    // Check for Workable-specific success indicators
    const successSelectors = [
      '[data-ui="application-form-success-subtitle"]',
      '[data-ui="application-success"]',
      '[data-ui="application-complete"]',
      '[data-test="application-complete"]',
    ];

    for (const selector of successSelectors) {
      const element = document.querySelector(selector);
      if (element && this.isElementVisible(element)) {
        console.log(`✅ Success detected via selector: ${selector}`);
        return true;
      }
    }

    // Check for explicit success/thank-you text in main content area
    const successTexts = [
      "application has been submitted successfully",
      "thank you for applying",
      "application has been submitted",
      "we have received your application",
      "application received",
    ];

    // Only check within main content, not the entire body (avoids matching nav/footer text)
    const mainContent =
      document.querySelector('main, [role="main"], .application-success') ||
      document.body;
    const contentText = mainContent.textContent?.toLowerCase() || "";
    return successTexts.some((text) => contentText.includes(text));
  }

  /**
   * Handle custom select fields that use modals
   */
  async handleCustomSelectWithModal(form, profile) {
    try {
      // Find custom selects
      const customSelects = form.querySelectorAll(
        'input[role="combobox"][aria-owns]'
      );

      for (const element of customSelects) {
        // Get listbox ID
        const listboxId = element.getAttribute("aria-owns");
        if (!listboxId) {
          continue;
        }

        // Get question text
        const labelId = element.getAttribute("aria-labelledby");
        const labelElement = labelId ? document.getElementById(labelId) : null;
        const question = labelElement
          ? labelElement.textContent.trim()
          : "Select an option";

        // Click to open modal
        element.click();
        await this.wait(500);

        // Find listbox
        const listbox = document.getElementById(listboxId);
        if (!listbox) {
          continue;
        }

        // Extract options
        const options = [];
        const optionElements = listbox.querySelectorAll('[role="option"]');
        optionElements.forEach((opt) => {
          const span = opt.querySelector("span.styles--f-uLT");
          if (span) options.push(span.textContent.trim());
        });

        // Close modal
        element.click();
        await this.wait(300);

        // Skip if no options
        if (options.length === 0) {
          continue;
        }

        // Request AI to choose best option
        let valueToSelect = "N/A - Does not apply to me";
        try {
          const response = await fetch(`${HOST}/api/ai-answer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question,
              options,
              userData: profile,
              description: "",
            }),
          });

          if (!response.ok) {
            throw new Error(`AI service error: ${response.status}`);
          }

          const data = await response.json();
          valueToSelect = data.answer;
        } catch (aiError) {
          return false;
        }

        // Reopen modal and select option
        element.click();
        await this.wait(500);

        const updatedListbox = document.getElementById(listboxId);
        if (updatedListbox) {
          const valueStr = String(valueToSelect).toLowerCase();
          const optionsToSelect =
            updatedListbox.querySelectorAll('[role="option"]');

          let optionSelected = false;
          for (const option of optionsToSelect) {
            const span = option.querySelector("span.styles--f-uLT");
            if (span) {
              const optionText = span.textContent.toLowerCase();
              if (
                optionText === valueStr ||
                optionText.includes(valueStr) ||
                valueStr.includes(optionText)
              ) {
                option.click();
                await this.wait(300);
                optionSelected = true;
                break;
              }
            }
          }

          // Select first option as fallback
          if (!optionSelected && optionsToSelect.length > 0) {
            optionsToSelect[0].click();
            await this.wait(300);
          }
        }
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle standard radio buttons (fallback)
   */
  async handleStandardRadioButtons(element, aiValue) {
    try {
      let radioName = "";

      if (
        element.tagName.toLowerCase() === "input" &&
        element.type === "radio"
      ) {
        radioName = element.name;
      } else {
        const radioInput = element.querySelector('input[type="radio"]');
        if (radioInput) {
          radioName = radioInput.name;
        }
      }

      if (!radioName) return false;

      const radios = document.querySelectorAll(
        `input[type="radio"][name="${radioName}"]`
      );
      const availableOptions = [];
      const optionMap = new Map();

      for (const radio of radios) {
        // Check value attribute first
        if (radio.value) {
          availableOptions.push(radio.value);
          optionMap.set(radio.value, radio);
        }

        // Check label text
        const label =
          radio.closest("label") ||
          document.querySelector(`label[for="${radio.id}"]`);
        if (label) {
          const labelText = label.textContent.trim();
          if (labelText && !availableOptions.includes(labelText)) {
            availableOptions.push(labelText);
            optionMap.set(labelText, radio);
          }
        }
      }

      const bestMatch = this.findBestMatchingOption(aiValue, availableOptions);
      if (!bestMatch) {
        return false;
      }

      const matchingRadio = optionMap.get(bestMatch);
      if (matchingRadio) {
        this.scrollToElement(matchingRadio);

        // Multiple selection strategies
        matchingRadio.checked = true;

        const label =
          matchingRadio.closest("label") ||
          document.querySelector(`label[for="${matchingRadio.id}"]`);
        if (label) {
          label.click();
        } else {
          matchingRadio.click();
        }

        matchingRadio.dispatchEvent(new Event("change", { bubbles: true }));
        matchingRadio.dispatchEvent(new Event("click", { bubbles: true }));

        await this.wait(200);

        if (!matchingRadio.checked) {
          matchingRadio.checked = true;
          matchingRadio.setAttribute("checked", "checked");
        }

        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Select a Workable radio option using multiple strategies
   */
  async selectWorkableRadioOption(optionInfo) {
    try {
      const { element, labelText, inputElement, isChecked } = optionInfo;

      // Skip if already selected
      if (isChecked) {
        return true;
      }

      this.scrollToElement(element);
      await this.wait(300);

      let success = false;
      const strategies = [];

      // Strategy 1: Click the main div element with role="radio"
      strategies.push(async () => {
        element.click();
        await this.wait(300);
        return element.getAttribute("aria-checked") === "true";
      });

      // Strategy 2: Click the label if it exists
      strategies.push(async () => {
        const label =
          element.querySelector("label") || element.closest("label");
        if (label) {
          label.click();
          await this.wait(300);
          return (
            element.getAttribute("aria-checked") === "true" ||
            (inputElement && inputElement.checked)
          );
        }
        return false;
      });

      // Strategy 3: Click the input element directly
      strategies.push(async () => {
        if (inputElement) {
          inputElement.click();
          await this.wait(300);
          return (
            inputElement.checked ||
            element.getAttribute("aria-checked") === "true"
          );
        }
        return false;
      });

      // Strategy 4: Force the selection by setting attributes and dispatching events
      strategies.push(async () => {
        // Set aria-checked on the div
        element.setAttribute("aria-checked", "true");
        element.setAttribute("tabindex", "0");

        // Uncheck other options in the same group
        const radioGroup = element.closest('[role="radiogroup"]');
        if (radioGroup) {
          const otherOptions = radioGroup.querySelectorAll('[role="radio"]');
          otherOptions.forEach((option) => {
            if (option !== element) {
              option.setAttribute("aria-checked", "false");
              option.setAttribute("tabindex", "-1");
            }
          });
        }

        // Set input checked if it exists
        if (inputElement) {
          inputElement.checked = true;
          inputElement.setAttribute("checked", "checked");
          inputElement.dispatchEvent(new Event("change", { bubbles: true }));
        }

        // Dispatch events on the main element
        element.dispatchEvent(new Event("click", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));

        await this.wait(300);
        return true; // Assume success since we forced it
      });

      // Try each strategy until one works
      for (let i = 0; i < strategies.length; i++) {
        try {
          success = await strategies[i]();
          if (success) {
            break;
          }
        } catch (e) {
          return false;
        }
      }

      return success;
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract information from a radio option element
   */
  extractRadioOptionInfo(radioElement) {
    let labelText = "";
    let value = "";
    let inputElement = null;

    try {
      // Method 1: Look for span with radio_label_ ID pattern
      const labelSpan = radioElement.querySelector('span[id*="radio_label"]');
      if (labelSpan) {
        labelText = labelSpan.textContent.trim();
      }

      // Method 2: Look for aria-labelledby reference
      if (!labelText) {
        const labelledById = radioElement.getAttribute("aria-labelledby");
        if (labelledById) {
          // Extract just the radio_label part if it exists
          const radioLabelId = labelledById
            .split(" ")
            .find((id) => id.includes("radio_label"));
          if (radioLabelId) {
            const labelEl = document.getElementById(radioLabelId);
            if (labelEl) {
              labelText = labelEl.textContent.trim();
            }
          }
        }
      }

      // Method 3: Look for text content in spans (for YES/NO style)
      if (!labelText) {
        const textSpans = radioElement.querySelectorAll(
          "span.styles--1h-sV, span"
        );
        for (const span of textSpans) {
          const text = span.textContent.trim();
          if (text && text !== " " && !text.includes("SVG")) {
            labelText = text;
            break;
          }
        }
      }

      // Method 4: Check if this is a label container (older structure)
      if (!labelText && radioElement.tagName === "LABEL") {
        const clone = radioElement.cloneNode(true);
        // Remove input and SVG elements to get just the text
        const elementsToRemove = clone.querySelectorAll(
          'input, svg, [aria-hidden="true"]'
        );
        elementsToRemove.forEach((el) => el.remove());
        labelText = clone.textContent.trim();
      }

      // Find the actual input element
      inputElement = radioElement.querySelector('input[type="radio"]');
      if (inputElement) {
        value = inputElement.value || "";
      }

      // Special handling for YES/NO responses
      if (labelText.toLowerCase() === "yes") {
        value = value || "true";
      } else if (labelText.toLowerCase() === "no") {
        value = value || "false";
      }

      return {
        labelText,
        value,
        inputElement,
        isChecked:
          radioElement.getAttribute("aria-checked") === "true" ||
          (inputElement && inputElement.checked),
      };
    } catch (error) {
      return { labelText: "", value: "", inputElement: null, isChecked: false };
    }
  }

  async handleWorkableRadioGroup(radioGroup, aiValue) {
    console.log(radioGroup, aiValue)
    try {
      // Method 1: Look for div elements with role="radio" (newer Workable structure)
      let radioOptions = radioGroup.querySelectorAll('div[role="radio"]');

      // Method 2: Look for div elements with data-ui="option" (Yes/No style)
      if (radioOptions.length === 0) {
        radioOptions = radioGroup.querySelectorAll(
          'div[data-ui="option"][role="radio"]'
        );
      }

      // Method 3: Look for label containers (older Workable structure)
      if (radioOptions.length === 0) {
        radioOptions = radioGroup.querySelectorAll(
          'label[role="presentation"]'
        );
      }

      if (radioOptions.length === 0) {
        return false;
      }

      // Extract options and build mapping
      const availableOptions = [];
      const optionMap = new Map();

      for (const radio of radioOptions) {
        const optionInfo = this.extractRadioOptionInfo(radio);
        if (optionInfo.labelText) {
          availableOptions.push(optionInfo.labelText);
          optionMap.set(optionInfo.labelText, {
            element: radio,
            ...optionInfo,
          });
        }
      }

      if (availableOptions.length === 0) {
        return false;
      }

      // Use fuzzy matching to find best option
      const bestMatch = this.findBestMatchingOption(aiValue, availableOptions);
      if (!bestMatch) {
        return false;
      }

      const targetOption = optionMap.get(bestMatch);
      if (targetOption) {
        return await this.selectWorkableRadioOption(targetOption);
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all form fields from a Workable application form
   */
  getAllFormFields(form) {
    try {
      const fields = [];

      // Workable-specific selectors with enhanced coverage
      const formElements = form.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), ' +
        "select, textarea, " +
        '[role="radio"], [role="checkbox"], [role="combobox"], ' +
        'fieldset[role="radiogroup"], ' +
        'div[role="group"], ' +
        '[data-ui="select"], ' +
        '[data-role="dropzone"], ' +
        "div.field-type-Boolean, " +
        ".styles--3aPac input, " +
        ".styles--3aPac select, " +
        ".styles--3aPac textarea, " +
        'div[class*="styles--3IYUq"], ' +
        'div[class*="styles--2-TzV"]'
      );

      // Process each element with enhanced validation
      for (const element of formElements) {
        // Skip invisible elements
        if (!this.isElementInteractable(element)) continue;

        // Skip individual checkboxes inside a group - the group will be handled as a single multi-select field
        if ((element.getAttribute('role') === 'checkbox' || (element.tagName === 'INPUT' && element.type === 'checkbox')) &&
            element.closest('[role="group"]')) {
          continue;
        }

        // Skip optional Education/Experience sections with "Add" buttons
        // These are expandable sections that shouldn't be auto-filled
        const parentSection = element.closest('[data-ui="education"], [data-ui="experience"]');
        if (parentSection) continue;

        const fieldInfo = {
          element,
          label: this.getFieldLabel(element),
          type: this.getFieldType(element),
          required: this.isFieldRequired(element),
        };

        // For radio groups, get the full fieldset when possible
        if (fieldInfo.type === "radio" && element.tagName !== "FIELDSET") {
          const radioGroup =
            element.closest('fieldset[role="radiogroup"]') ||
            element.closest('[role="radiogroup"]');
          if (radioGroup) {
            fieldInfo.element = radioGroup;
          }
        }

        // Only include fields with valid labels and types
        if (fieldInfo.label && fieldInfo.type !== "unknown") {
          fields.push(fieldInfo);
        }
      }

      // ENHANCED: Find and add checkbox groups that aren't being caught by individual elements
      const checkboxGroups = form.querySelectorAll('div[role="group"]');
      for (const group of checkboxGroups) {
        if (!this.isElementInteractable(group)) continue;

        // Skip optional Education/Experience sections
        if (group.closest('[data-ui="education"], [data-ui="experience"]')) continue;

        // Check if this group contains checkboxes
        const hasCheckboxes = group.querySelector('[role="checkbox"]');
        if (hasCheckboxes) {
          const groupLabel = this.getFieldLabel(group);
          if (groupLabel) {
            // Check if we already have this group in our fields
            const existingField = fields.find(field => 
              field.element === group || 
              (field.label === groupLabel && field.type === 'checkbox')
            );
            
            if (!existingField) {
              fields.push({
                element: group,
                label: groupLabel,
                type: 'checkbox', // This will be treated as a checkbox group
                required: this.isFieldRequired(group),
              });
            }
          }
        }
      }

      // Deduplicate fields - particularly important for radio groups
      const uniqueFields = this.deduplicateFields(fields);

      return uniqueFields;
    } catch (error) {
      return [];
    }
  }

  /**
   * Enhanced field deduplication
   */
  deduplicateFields(fields) {
    const uniqueFields = [];
    const seenElements = new Set();
    const seenLabels = new Map();

    for (const field of fields) {
      // Skip if we've already processed this exact element
      if (seenElements.has(field.element)) {
        continue;
      }

      // For radio fields, only add one per label (fieldset)
      if (field.type === "radio") {
        const existingRadio = seenLabels.get(field.label);
        if (existingRadio === "radio") {
          continue; // Skip duplicate radio group
        }
        seenLabels.set(field.label, "radio");
      } else {
        // For other fields, ensure unique labels within type
        const labelKey = `${field.label}-${field.type}`;
        if (seenLabels.has(labelKey)) {
          continue;
        }
        seenLabels.set(labelKey, field.type);
      }

      seenElements.add(field.element);
      uniqueFields.push(field);
    }

    return uniqueFields;
  }

  /**
   * Enhanced element interactability check
   */
  isElementInteractable(element) {
    if (!element) return false;

    // Check if element is visible and enabled
    const style = window.getComputedStyle(element);
    const isVisible =
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0";

    const isEnabled =
      !element.disabled &&
      !element.hasAttribute("disabled") &&
      !element.getAttribute("aria-disabled");

    const isInDOM = document.contains(element);

    return isVisible && isEnabled && isInDOM;
  }

  /**
   * Get label text for a form field
   */
  getFieldLabel(element) {
    try {
      const workableLabel = element
        .closest(".styles--3aPac")
        ?.querySelector(".styles--QTMDv");
      if (workableLabel) {
        return this.cleanLabelText(workableLabel.textContent);
      }

      // Enhanced detection for checkbox groups from your HTML structure
      if (element.getAttribute("role") === "group" || 
          element.classList.contains("styles--2-TzV") ||
          element.classList.contains("styles--2zIma") ||
          element.classList.contains("styles--2otH-")) {
        // Look for the aria-labelledby attribute
        const labelledById = element.getAttribute("aria-labelledby");
        if (labelledById) {
          const labelElement = document.getElementById(labelledById);
          if (labelElement) {
            return this.cleanLabelText(labelElement.textContent);
          }
        }

        // Look for the label in parent container following your HTML structure
        const parentContainer = element.closest(".styles--3aPac");
        if (parentContainer) {
          const labelSpan = parentContainer.querySelector(".styles--QTMDv strong");
          if (labelSpan) {
            return this.cleanLabelText(labelSpan.textContent);
          }
        }
      }

      // Handle file upload fields specifically
      if (
        element.type === "file" ||
        element.getAttribute("data-role") === "dropzone" ||
        element.closest('[data-role="dropzone"]')
      ) {
        let container = element;

        if (element.tagName === "INPUT" && element.type === "file") {
          container =
            element.closest('[data-role="dropzone"]') || element.parentElement;
        }

        let fieldContainer = container;
        for (let i = 0; i < 5 && fieldContainer; i++) {
          if (
            fieldContainer.classList.contains("styles--3aPac") ||
            fieldContainer.className.includes("styles--3aPac")
          ) {
            break;
          }
          fieldContainer = fieldContainer.parentElement;
        }

        if (fieldContainer) {
          const labelEl = fieldContainer.querySelector(
            '.styles--QTMDv, [class*="QTMDv"]'
          );
          if (labelEl) {
            return this.cleanLabelText(labelEl.textContent);
          }
        }

        const labelledById = element.getAttribute("aria-labelledby");
        if (labelledById) {
          const labelElement = document.getElementById(labelledById);
          if (labelElement) {
            return this.cleanLabelText(labelElement.textContent);
          }
        }

        if (element.id) {
          const idParts = element.id.split("_");
          const prefix = idParts[0];

          const labelEl = document.querySelector(
            `span[id="${prefix}_label"], span[id*="${prefix}_label"]`
          );
          if (labelEl) {
            return this.cleanLabelText(labelEl.textContent);
          }
        }
      }

      // Special handling for Workable radio groups
      if (
        element.getAttribute("role") === "radiogroup" ||
        (element.tagName === "FIELDSET" &&
          element.getAttribute("role") === "radiogroup")
      ) {
        // Look for aria-labelledby first
        const labelledById = element.getAttribute("aria-labelledby");
        if (labelledById) {
          const labelEl = document.getElementById(labelledById);
          if (labelEl) {
            // Specifically exclude SVG descriptions
            const labelText = Array.from(labelEl.childNodes)
              .filter(
                (node) =>
                  node.nodeType === Node.TEXT_NODE ||
                  (node.nodeType === Node.ELEMENT_NODE &&
                    node.tagName !== "SVG")
              )
              .map((node) => node.textContent)
              .join(" ");
            return this.cleanLabelText(labelText);
          }
        }

        // If no aria-labelledby, try to find previous sibling with label class
        const prevSibling = element.previousElementSibling;
        if (prevSibling) {
          const labelEl = prevSibling.querySelector(
            '[class*="QTMDv"], [class*="label"], span[id*="_label"]'
          );
          if (labelEl) {
            return this.cleanLabelText(labelEl.textContent);
          }
        }
      }

      // Method 1: Check for aria-labelledby attribute
      const labelledById = element.getAttribute("aria-labelledby");
      if (labelledById) {
        const labelElement = document.getElementById(labelledById);
        if (labelElement) {
          return this.cleanLabelText(labelElement.textContent);
        }
      }

      // Method 2: Check for explicit label element
      if (element.id) {
        const labelElement = document.querySelector(
          `label[for="${element.id}"]`
        );
        if (labelElement) {
          return this.cleanLabelText(labelElement.textContent);
        }
      }

      // Method 3: Check if element is inside a label
      const parentLabel = element.closest("label");
      if (parentLabel) {
        // Clone the label to avoid modifying the original
        const clone = parentLabel.cloneNode(true);

        // Remove the input element from the clone to get just the label text
        const inputElements = clone.querySelectorAll("input, select, textarea");
        for (const inputEl of inputElements) {
          if (inputEl.parentNode) {
            inputEl.parentNode.removeChild(inputEl);
          }
        }

        return this.cleanLabelText(clone.textContent);
      }

      // Workable-specific: Check for styles--QTMDv class in parent container
      const parentContainer = element.closest('div[class*="styles--3aPac"]');
      if (parentContainer) {
        const labelEl = parentContainer.querySelector('[class*="QTMDv"]');
        if (labelEl) {
          return this.cleanLabelText(labelEl.textContent);
        }
      }

      // Method 4: Check if element is in a fieldset with legend
      const fieldset = element.closest("fieldset");
      if (fieldset) {
        const legend = fieldset.querySelector("legend");
        if (legend) {
          return this.cleanLabelText(legend.textContent);
        }
      }

      // Method 5: Look for nearby elements that could be labels
      const parent = element.parentElement;
      if (parent) {
        // Check for elements with label-like class names
        const labelElements = parent.querySelectorAll(
          '.label, .field-label, [class*="label"]'
        );
        if (labelElements.length > 0) {
          return this.cleanLabelText(labelElements[0].textContent);
        }

        // Check for special Workable structure
        if (
          parent.previousElementSibling &&
          parent.previousElementSibling.querySelector('[class*="QTMDv"]')
        ) {
          return this.cleanLabelText(parent.previousElementSibling.textContent);
        }
      }

      // Method 6: Use aria-label, placeholder, or name as fallback
      if (element.getAttribute("aria-label")) {
        return this.cleanLabelText(element.getAttribute("aria-label"));
      }

      if (element.placeholder) {
        return this.cleanLabelText(element.placeholder);
      }

      if (element.name) {
        // Convert camelCase or snake_case to spaces
        return this.cleanLabelText(
          element.name.replace(/([A-Z])/g, " $1").replace(/_/g, " ")
        );
      }

      // If nothing else works, return empty string
      return "";
    } catch (error) {
      return "";
    }
  }

  /**
   * Clean up label text by removing asterisks and extra whitespace
   */
  cleanLabelText(text) {
    if (!text) return "";

    return text
      .replace(/[*✱]/g, "") // Remove asterisks (both standard and special)
      .replace(/\s+/g, " ") // Normalize whitespace
      .replace(/^\s+|\s+$/g, "") // Trim start and end
      .replace(/\(required\)/i, "") // Remove "(required)" text
      .replace(/\(optional\)/i, "") // Remove "(optional)" text
      .toLowerCase(); // Convert to lowercase for easier comparison
  }

  /**
   * Update the main getFieldType method to detect phone fields
   */
  getFieldType(element) {
    const role = element.getAttribute("role");
    const tagName = element.tagName.toLowerCase();

    // Date field detection - check for react-datepicker and date-related placeholders
    if (
      element.closest('.react-datepicker-wrapper') ||
      element.closest('[data-role="illustrated-input"]')?.querySelector('[data-ui="calendar-icon"]') ||
      (element.tagName === "INPUT" && (
        element.placeholder?.includes('MM/DD/YYYY') ||
        element.placeholder?.includes('DD/MM/YYYY') ||
        element.placeholder?.includes('MM/YYYY') ||
        element.placeholder?.includes('YYYY-MM-DD') ||
        element.type === 'date'
      ))
    ) {
      return "date";
    }

    // Phone field detection
    if (
      element.closest('[data-ui="phone"]') ||
      element.querySelector("input.iti__tel-input") ||
      (element.tagName === "INPUT" && element.type === "tel" && !element.placeholder?.includes('MM/'))
    ) {
      return "phone";
    }

    // Enhanced Workable-specific detection
    if (
      element.closest('[data-ui="select"]') ||
      (role === "combobox" && !element.closest('[data-ui="phone"]'))
    ) {
      return "select";
    }

    // Radio groups - enhanced detection
    if (
      role === "radiogroup" ||
      (tagName === "fieldset" && role === "radiogroup") ||
      element.querySelector('[role="radio"]') ||
      element.querySelector('div[data-ui="option"][role="radio"]')
    ) {
      return "radio";
    }

    // Enhanced checkbox group detection - Workable specific
    if (
      role === "group" &&
      element.querySelector('[role="checkbox"], input[type="checkbox"]')
    ) {
      return "checkbox";
    }

    // Also detect specific Workable checkbox group structures like in the provided HTML
    if (
      element.classList.contains("styles--2-TzV") ||
      element.classList.contains("styles--2zIma") ||
      element.classList.contains("styles--2otH-")
    ) {
      if (element.querySelector('[role="checkbox"]')) {
        return "checkbox";
      }
    }

    // Single checkbox detection
    if (role === "checkbox" || (tagName === "input" && element.type === "checkbox")) {
      return "checkbox";
    }

    if (role === "radio") {
      return role;
    }

    if (
      element.getAttribute("data-role") === "dropzone" ||
      element.querySelector('input[type="file"]') ||
      element.closest('[data-role="dropzone"]')
    ) {
      return "file";
    }

    if (tagName === "select") return "select";
    if (tagName === "textarea") return "textarea";
    if (tagName === "input") {
      const type = element.type.toLowerCase();
      if (type === "file") return "file";
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "tel") return "phone";
      return type || "text";
    }

    return "unknown";
  }

  /**
   * Check if a field is required
   */
  isFieldRequired(element) {
    // Check required attribute
    if (element.required || element.getAttribute("aria-required") === "true") {
      return true;
    }

    // Check for Workable-specific error states (like GDPR checkbox)
    const parentLabel = element.closest('label');
    if (parentLabel && (
      parentLabel.getAttribute('data-error') === 'true' ||
      parentLabel.querySelector('[data-error="true"]')
    )) {
      return true;
    }

    // Check if element itself has error state
    if (element.getAttribute('data-error') === 'true') {
      return true;
    }

    // Check for GDPR or consent-related checkboxes (typically required)
    const hasGdprIndicator =
      element.getAttribute('data-ui') === 'gdpr' ||
      parentLabel?.getAttribute('data-ui') === 'gdpr';

    if (hasGdprIndicator) {
      return true;
    }

    // Check for asterisk in label or aria-labelledby element
    const labelledById = element.getAttribute("aria-labelledby");
    if (labelledById) {
      const labelElement = document.getElementById(labelledById);
      if (
        labelElement &&
        (labelElement.textContent.includes("*") ||
          labelElement.textContent.includes("✱"))
      ) {
        return true;
      }
    }

    // Check for Workable-specific required indicators
    const hasWorkableRequired =
      element.parentElement?.querySelector('[class*="33eUF"]') ||
      element.closest("div")?.querySelector('[class*="33eUF"]');

    if (hasWorkableRequired) {
      return true;
    }

    // Check for explicit label with asterisk
    if (element.id) {
      const labelElement = document.querySelector(`label[for="${element.id}"]`);
      if (
        labelElement &&
        (labelElement.textContent.includes("*") ||
          labelElement.textContent.includes("✱"))
      ) {
        return true;
      }
    }

    // Check parent elements for required indicator
    let parent = element.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
      if (
        parent.querySelector('.required, .mandatory, [class*="required"]') ||
        parent.querySelector('[class*="33eUF"]')
      ) {
        return true;
      }
      parent = parent.parentElement;
    }

    return false;
  }

  /**
   * Handle Workable checkbox groups (multi-select checkboxes)
   */
  async handleCheckboxGroup(groupElement, question, fieldContext = "") {
    try {
      console.log(`☑️ Handling checkbox group for question: ${question}`);

      // Step 1: Extract all checkbox options from the group
      const checkboxOptions = this.extractCheckboxOptions(groupElement);

      if (!checkboxOptions || checkboxOptions.length === 0) {
        console.warn('No checkbox options found in group');
        return false;
      }

      console.log(`📋 Found checkbox options:`, checkboxOptions.map(opt => opt.label));

      // Step 2: Get AI answer for which options to select (multi-select)
      const optionLabels = checkboxOptions.map(opt => opt.label);
      const context = {
        platform: "workable",
        userData: this.userData,
        jobDescription: this.jobDescription || "",
        fieldType: "checkbox",
        fieldContext: fieldContext + " This is a multi-select field where multiple options can be selected.",
        required: fieldContext.includes('required'),
      };
      const selectedOptions = await this.aiService.getMultiSelectAnswer(
        question,
        optionLabels,
        context
      );

      if (!selectedOptions || selectedOptions.length === 0) {
        console.warn('AI did not provide options for checkbox group');
        return false;
      }

      console.log(`🤖 AI selected options:`, selectedOptions);

      // Step 3: Check the selected options by fuzzy-matching AI response to actual labels
      let successCount = 0;
      for (const selectedOpt of selectedOptions) {
        const checkboxOption = checkboxOptions.find(opt =>
          opt.label.toLowerCase().trim() === selectedOpt.trim() ||
          opt.label.toLowerCase().trim().includes(selectedOpt.trim()) ||
          selectedOpt.trim().includes(opt.label.toLowerCase().trim())
        );
        if (checkboxOption) {
          const success = await this.selectCheckboxOption(checkboxOption);
          if (success) {
            successCount++;
            console.log(`✅ Selected checkbox: ${selectedOpt}`);
          } else {
            console.warn(`❌ Failed to select checkbox: ${selectedOpt}`);
          }
          await this.wait(200); // Small delay between selections
        }
      }

      return successCount > 0;

    } catch (error) {
      console.error('Error handling checkbox group:', error);
      return false;
    }
  }

  /**
   * Apply pre-computed multi-select answers to a checkbox group
   */
  async applyCheckboxGroupSelections(groupElement, selectedOptions) {
    try {
      const checkboxOptions = this.extractCheckboxOptions(groupElement);
      if (!checkboxOptions || checkboxOptions.length === 0) return false;

      let successCount = 0;
      for (const selectedOpt of selectedOptions) {
        const match = checkboxOptions.find(
          (opt) =>
            opt.label.toLowerCase().trim() === selectedOpt.trim() ||
            opt.label.toLowerCase().trim().includes(selectedOpt.trim()) ||
            selectedOpt.trim().includes(opt.label.toLowerCase().trim())
        );
        if (match) {
          const success = await this.selectCheckboxOption(match);
          if (success) successCount++;
          await this.wait(200);
        }
      }
      return successCount > 0;
    } catch (error) {
      console.error("Error applying checkbox group selections:", error);
      return false;
    }
  }

  /**
   * Extract checkbox options from a checkbox group
   */
  extractCheckboxOptions(groupElement) {
    try {
      const options = [];

      // Find all checkbox elements within the group
      const checkboxElements = groupElement.querySelectorAll('[role="checkbox"]');

      for (const checkboxEl of checkboxElements) {
        if (!this.isElementVisible(checkboxEl)) continue;

        // Extract the label text for this checkbox
        const labelId = checkboxEl.getAttribute('aria-labelledby');
        let label = '';

        if (labelId) {
          // Parse aria-labelledby which might contain multiple IDs
          const labelIds = labelId.split(' ');
          const checkboxLabelId = labelIds.find(id => id.includes('checkbox_label'));

          if (checkboxLabelId) {
            const labelElement = document.getElementById(checkboxLabelId);
            if (labelElement) {
              label = labelElement.textContent.trim();
            }
          }
        }

        // Fallback: look for span with checkbox_label_ pattern in the same label container
        if (!label) {
          const labelContainer = checkboxEl.closest('label');
          if (labelContainer) {
            const labelSpan = labelContainer.querySelector('span[id*="checkbox_label_"]');
            if (labelSpan) {
              label = labelSpan.textContent.trim();
            }
          }
        }

        if (label) {
          options.push({
            element: checkboxEl,
            label: label,
            isChecked: checkboxEl.getAttribute('aria-checked') === 'true'
          });
        }
      }

      return options;

    } catch (error) {
      console.error('Error extracting checkbox options:', error);
      return [];
    }
  }

  /**
   * Parse multi-select AI response to determine which options to select
   */
  parseMultiSelectResponse(aiResponse, availableOptions) {
    try {
      const response = String(aiResponse).toLowerCase();
      const optionsToSelect = [];

      // Check each available option to see if it's mentioned in the AI response
      for (const option of availableOptions) {
        const optionLower = option.toLowerCase();

        // Direct mention check
        if (response.includes(optionLower)) {
          optionsToSelect.push(option);
          continue;
        }

        // Word-based matching for partial matches
        const optionWords = optionLower.split(/\s+/);
        const responseWords = response.split(/\s+/);

        let matchCount = 0;
        for (const optionWord of optionWords) {
          if (optionWord.length > 2) { // Skip very short words
            if (responseWords.some(respWord =>
              respWord.includes(optionWord) || optionWord.includes(respWord))) {
              matchCount++;
            }
          }
        }

        // If majority of words match, consider it selected
        if (matchCount > 0 && matchCount >= optionWords.length * 0.6) {
          optionsToSelect.push(option);
        }
      }

      // Special handling for "none" or "haven't" responses
      if (response.includes('none') || response.includes("haven't") || response.includes('not applicable')) {
        const noneOption = availableOptions.find(opt =>
          opt.toLowerCase().includes('none') ||
          opt.toLowerCase().includes("haven't") ||
          opt.toLowerCase().includes('not applicable')
        );
        if (noneOption && !optionsToSelect.includes(noneOption)) {
          return [noneOption]; // Return only the "none" option
        }
      }

      return optionsToSelect;

    } catch (error) {
      console.error('Error parsing multi-select response:', error);
      return [];
    }
  }

  /**
   * Select (check) a specific checkbox option
   */
  async selectCheckboxOption(checkboxOption) {
    try {
      const { element, isChecked } = checkboxOption;

      // Skip if already checked
      if (isChecked) {
        return true;
      }

      // Scroll to element
      this.scrollToElement(element);
      await this.wait(200);

      // Try multiple strategies to check the checkbox - Enhanced version
      let success = false;

      // Strategy 1: Click the checkbox element directly
      element.click();
      await this.wait(300); // Longer wait for state change
      success = element.getAttribute('aria-checked') === 'true';

      if (!success) {
        // Strategy 2: Click the parent label if it exists
        const label = element.closest('label');
        if (label) {
          label.click();
          await this.wait(300);
          success = element.getAttribute('aria-checked') === 'true';
        }
      }

      if (!success) {
        // Strategy 3: Force the checkbox state with comprehensive updates
        element.setAttribute('aria-checked', 'true');

        // Also update the hidden input if it exists
        const hiddenInput = element.querySelector('input[type="checkbox"]') ||
          element.parentElement?.querySelector('input[type="checkbox"]');
        if (hiddenInput) {
          hiddenInput.checked = true;
        }

        // Dispatch proper events on both elements
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('click', { bubbles: true }));

        if (hiddenInput) {
          hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        success = true; // Assume success since we forced it
      }

      return success;

    } catch (error) {
      console.error('Error selecting checkbox option:', error);
      return false;
    }
  }

  /**
   * Handle Workable combobox fields with modal dialogs
   */
  async handleCombobox(element, question, fieldContext = "") {
    try {
      console.log(`🔽 Handling combobox for question: ${question}`);

      // Step 1: Click the combobox to open the modal
      this.scrollToElement(element);
      element.focus();
      await this.wait(200);
      element.click();
      await this.wait(500); // Wait for modal to appear

      // Step 2: Find and extract options from the opened modal
      const options = await this.extractComboboxOptions(element);

      if (!options || options.length === 0) {
        console.warn('No options found in combobox modal');
        return false;
      }

      console.log(`📋 Found combobox options:`, options);

      // Step 3: Get AI answer using the extracted options
      const aiAnswer = await this.getAIAnswer(question, options, "select", fieldContext);

      if (!aiAnswer) {
        console.warn('AI did not provide an answer for combobox');
        // Close modal by clicking outside or pressing Escape
        document.body.click();
        return false;
      }

      console.log(`🤖 AI selected: ${aiAnswer}`);

      // Step 4: Find the best matching option
      const bestMatch = this.findBestMatchingOption(aiAnswer, options);

      if (!bestMatch) {
        console.warn(`No matching option found for AI answer: ${aiAnswer}`);
        document.body.click(); // Close modal
        return false;
      }

      console.log(`✅ Best match found: ${bestMatch}`);

      // Step 5: Click the matching option in the modal
      const success = await this.selectComboboxOption(bestMatch, element);

      if (success) {
        console.log(`🎯 Successfully selected combobox option: ${bestMatch}`);
        return true;
      } else {
        console.warn(`Failed to select combobox option: ${bestMatch}`);
        return false;
      }

    } catch (error) {
      console.error('Error handling combobox:', error);
      // Try to close any open modal
      try {
        document.body.click();
        await this.wait(300);
      } catch (closeError) {
        // Ignore close errors
      }
      return false;
    }
  }

  /**
   * Extract options from opened combobox modal
   */
  async extractComboboxOptions(triggerElement) {
    try {
      // First, try to find the listbox directly using aria-owns/aria-controls
      // This is the most reliable method as it uses the explicit relationship
      const listboxId = triggerElement.getAttribute('aria-owns') ||
                        triggerElement.getAttribute('aria-controls');

      let listbox = null;
      if (listboxId) {
        listbox = document.getElementById(listboxId);
        if (listbox) {
          console.log('📦 Found listbox via aria-owns/controls:', listboxId);
        }
      }

      // If no listbox found via aria attributes, fall back to dialog search
      if (!listbox) {
        // Look for the dialog modal that contains the options
        const dialogSelectors = [
          'dialog[open]',
          '[role="dialog"]',
          '[data-evergreen-dialog="true"]',
          '.styles--3-QiA', // From your example
        ];

        let dialog = null;
        for (const selector of dialogSelectors) {
          dialog = document.querySelector(selector);
          if (dialog) break;
        }

        if (!dialog) {
          console.warn('Could not find opened combobox dialog');
          return [];
        }

        console.log('📦 Found combobox dialog:', dialog);

        // Extract options from the listbox inside the dialog
        const listboxSelectors = [
          '[role="listbox"]',
          'ul[role="listbox"]',
          '.styles--3l810', // From your example
        ];

        for (const selector of listboxSelectors) {
          listbox = dialog.querySelector(selector);
          if (listbox) break;
        }
      }

      if (!listbox) {
        console.warn('Could not find listbox in combobox dialog');
        return [];
      }

      // Skip if this is a phone country list (iti = international telephone input)
      if (listbox.classList.contains('iti__country-list') ||
          listbox.closest('.iti__country-list')) {
        console.warn('Skipping phone country list - not a regular combobox');
        return [];
      }

      // Extract option text from list items
      const optionElements = listbox.querySelectorAll('[role="option"], li');
      const options = [];

      for (const optionElement of optionElements) {
        if (!this.isElementVisible(optionElement)) continue;

        // Try different ways to extract the option text
        const textSelectors = [
          '.styles--f-uLT', // From your example
          '.styles--2TdGW', // From your example  
          'span',
          null // Use textContent directly
        ];

        let optionText = '';
        for (const textSelector of textSelectors) {
          if (textSelector) {
            const textElement = optionElement.querySelector(textSelector);
            if (textElement && textElement.textContent.trim()) {
              optionText = textElement.textContent.trim();
              break;
            }
          } else {
            // Fallback to direct textContent
            optionText = optionElement.textContent.trim();
            break;
          }
        }

        if (optionText && optionText.length > 0) {
          options.push(optionText);

          // Store the element reference for later selection
          optionElement.setAttribute('data-option-text', optionText);
        }
      }

      return options;

    } catch (error) {
      console.error('Error extracting combobox options:', error);
      return [];
    }
  }

  /**
   * Select the matching option in the combobox modal
   * @param {string} optionText - The text of the option to select
   * @param {HTMLElement} triggerElement - The combobox element that owns the listbox
   */
  async selectComboboxOption(optionText, triggerElement = null) {
    try {
      let listbox = null;

      // First, try to find the listbox directly using aria-owns/aria-controls from the trigger element
      if (triggerElement) {
        const listboxId = triggerElement.getAttribute('aria-owns') ||
                          triggerElement.getAttribute('aria-controls');
        if (listboxId) {
          listbox = document.getElementById(listboxId);
          if (listbox) {
            console.log('📦 Found listbox via aria-owns for selection:', listboxId);
          }
        }
      }

      // Fall back to dialog search if no listbox found via aria
      if (!listbox) {
        const dialog = document.querySelector(
          'dialog[open], [role="dialog"], [data-evergreen-dialog="true"], ' +
          '[data-role="dialog-container"], .styles--3-QiA, .styles--1YkTn'
        );

        if (!dialog) {
          console.warn('Dialog not found when trying to select option');
          return false;
        }

        listbox = dialog.querySelector('[role="listbox"], ul[role="listbox"]');
      }

      if (!listbox) {
        console.warn('Listbox not found when trying to select option');
        return false;
      }

      // Find all option elements
      const optionElements = listbox.querySelectorAll('[role="option"]');
      console.log(`🔍 Looking for option: "${optionText}" among ${optionElements.length} options`);

      for (const optionElement of optionElements) {
        // Check the stored text attribute first
        const storedText = optionElement.getAttribute('data-option-text');

        // Extract text from the option's span elements (Workable structure)
        const textSpans = optionElement.querySelectorAll(
          'span.styles--f-uLT, span.styles--QTMDv, span.styles--2TdGW'
        );

        let optionTextContent = '';
        for (const span of textSpans) {
          const text = span.textContent.trim();
          if (text && !text.includes('SVG')) {
            optionTextContent = text;
            break;
          }
        }

        // Fallback to full text content if no specific span found
        if (!optionTextContent) {
          optionTextContent = optionElement.textContent.trim();
        }

        console.log(`  📋 Option: "${optionTextContent}" (stored: "${storedText || 'none'}")`);

        // Check if this option matches - use fuzzy matching for better results
        const normalizedTarget = optionText.toLowerCase().trim();
        const normalizedOption = optionTextContent.toLowerCase().trim();
        const normalizedStored = (storedText || '').toLowerCase().trim();

        if (storedText === optionText ||
            optionTextContent === optionText ||
            normalizedOption === normalizedTarget ||
            normalizedStored === normalizedTarget ||
            normalizedOption.includes(normalizedTarget) ||
            normalizedTarget.includes(normalizedOption)) {
          console.log(`  ✅ Match found: "${optionTextContent}"`);
          // Scroll to the option if needed
          optionElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await this.wait(200);

          // Click the option element
          optionElement.click();
          await this.wait(500);

          // Verify the dialog closed (indicates success)
          const dialogStillOpen = document.querySelector(
            'dialog[open], [role="dialog"][style*="display"], [data-role="dialog-container"]'
          );
          
          if (!dialogStillOpen) {
            return true;
          } else {
            // Try clicking again
            optionElement.click();
            await this.wait(300);
            return true;
          }
        }
      }

      console.warn(`❌ No matching option found for: "${optionText}"`);
      return false;

    } catch (error) {
      console.error('Error selecting combobox option:', error);
      return false;
    }
  }

  /**
   * Get an appropriate answer from AI for a form field with retry logic
   */
  async getAIAnswer(question, options = [], fieldType = "text", fieldContext = "", retryCount = 0) {
    try {
      // Detect date format from field context or placeholder
      let dateFormat = null;
      if (fieldType === 'date') {
        if (fieldContext.includes('MM/DD/YYYY')) {
          dateFormat = 'MM/DD/YYYY';
        } else if (fieldContext.includes('DD/MM/YYYY')) {
          dateFormat = 'DD/MM/YYYY';
        } else if (fieldContext.includes('MM/YYYY')) {
          dateFormat = 'MM/YYYY';
        } else if (fieldContext.includes('YYYY-MM-DD')) {
          dateFormat = 'YYYY-MM-DD';
        } else {
          // Default to MM/DD/YYYY for US-based forms
          dateFormat = 'MM/DD/YYYY';
        }
      }

      const context = {
        platform: "workable",
        userData: this.userData,
        jobDescription: this.jobDescription,
        fieldType,
        fieldContext: dateFormat ? `${fieldContext}. IMPORTANT: Provide the date in exactly this format: ${dateFormat}` : fieldContext,
        required: fieldContext.includes('required'),
        dateFormat
      };

      let answer;

      // Determine which AI service method to use based on field type
      // Only treat as option/checkbox fields when options were actually extracted
      const hasOptions = options && options.length > 0;
      const isCheckboxGroup = fieldType === 'checkbox' && hasOptions && options.length > 1;
      const isOptionField = ['radio', 'select', 'checkbox', 'combo', 'combobox'].includes(fieldType) && hasOptions;

      // Longform fields: textarea and fields asking for descriptions/explanations
      const isLongformField = fieldType === 'textarea' ||
        fieldContext.toLowerCase().includes('cover letter') ||
        fieldContext.toLowerCase().includes('describe') ||
        fieldContext.toLowerCase().includes('why') ||
        fieldContext.toLowerCase().includes('explain') ||
        fieldContext.toLowerCase().includes('tell us about');

      // Salary fields
      const isSalaryField = AIResponseUtils.isSalaryField(question);

      if (isSalaryField) {
        // Salary fields always go to salary endpoint, even with options (e.g. salary range dropdowns)
        answer = await this.aiService.getSalaryAnswer(question, options, context);
      } else if (isCheckboxGroup) {
        // Checkbox groups use getMultiSelectAnswer for array response
        answer = await this.aiService.getMultiSelectAnswer(question, options, context);
      } else if (isOptionField) {
        // For other option-based fields, use getOptionAnswer
        answer = await this.aiService.getOptionAnswer(question, options, context);
      } else if (isLongformField) {
        // For longform fields, use getLongformAnswer
        answer = await this.aiService.getLongformAnswer(question, options, context);
      } else {
        // For simple text fields, use getNormalAnswer
        answer = await this.aiService.getNormalAnswer(question, options, context);
      }

      if (answer === null || answer === undefined || answer === "" || String(answer).trim() === "") {
        if (retryCount < 2) {

          await new Promise(resolve => setTimeout(resolve, 1000 + (retryCount * 500)));

          const retryContext = {
            ...context,
            fieldContext: fieldContext + ` (This field requires an answer. Please provide a response based on the user profile.)`
          };

          let retryAnswer;
          if (isSalaryField) {
            retryAnswer = await this.aiService.getSalaryAnswer(question, options, retryContext);
          } else if (isCheckboxGroup) {
            retryAnswer = await this.aiService.getMultiSelectAnswer(question, options, retryContext);
          } else if (isOptionField) {
            retryAnswer = await this.aiService.getOptionAnswer(question, options, retryContext);
          } else if (isLongformField) {
            retryAnswer = await this.aiService.getLongformAnswer(question, options, retryContext);
          } else {
            retryAnswer = await this.aiService.getNormalAnswer(question, options, retryContext);
          }

          if ((retryAnswer === null || retryAnswer === undefined || retryAnswer === "" || String(retryAnswer).trim() === "") && retryCount < 1) {
            return await this.getAIAnswer(question, options, fieldType, fieldContext, retryCount + 1);
          }

          if (retryAnswer !== null && retryAnswer !== undefined && String(retryAnswer).trim() !== "") {
            const cleanedRetryAnswer = this.cleanAIResponse(retryAnswer);
            return cleanedRetryAnswer;
          }
        }

        return null;
      }

      const cleanedAnswer = this.cleanAIResponse(answer);
      return cleanedAnswer;
    } catch (error) {
      if (retryCount < 2) {
        await new Promise(resolve => setTimeout(resolve, 1000 + (retryCount * 500)));
        return await this.getAIAnswer(question, options, fieldType, fieldContext, retryCount + 1);
      }

      return null;
    }
  }

  /**
   * Convert AI response to boolean value with flexible interpretation
   */
  parseAIBoolean(value) {
    if (!value) return false;

    const normalizedValue = String(value).toLowerCase().trim();

    // Positive responses
    const positiveResponses = [
      "yes",
      "true",
      "agree",
      "accept",
      "confirm",
      "ok",
      "okay",
      "sure",
      "definitely",
      "absolutely",
      "correct",
      "right",
      "affirmative",
      "positive",
      "1",
      "checked",
      "check",
      "select",
    ];

    // Negative responses
    const negativeResponses = [
      "no",
      "false",
      "disagree",
      "decline",
      "deny",
      "refuse",
      "never",
      "negative",
      "incorrect",
      "wrong",
      "0",
      "unchecked",
      "uncheck",
      "deselect",
      "skip",
    ];

    if (
      positiveResponses.some((response) => normalizedValue.includes(response))
    ) {
      return true;
    }

    if (
      negativeResponses.some((response) => normalizedValue.includes(response))
    ) {
      return false;
    }

    // If unclear, return null to indicate we should skip this field
    return null;
  }

  /**
   * Find best matching option using fuzzy matching
   */
  findBestMatchingOption(aiValue, options) {
    if (!aiValue || !options || options.length === 0) return null;

    const normalizedAIValue = String(aiValue).toLowerCase().trim();

    // First try exact match
    for (const option of options) {
      if (option.toLowerCase().trim() === normalizedAIValue) {
        return option;
      }
    }

    // Then try substring matches
    for (const option of options) {
      const normalizedOption = option.toLowerCase().trim();
      if (
        normalizedOption.includes(normalizedAIValue) ||
        normalizedAIValue.includes(normalizedOption)
      ) {
        return option;
      }
    }

    // Try word-based matching
    const aiWords = normalizedAIValue.split(/\s+/);
    let bestMatch = null;
    let bestScore = 0;

    for (const option of options) {
      const optionWords = option.toLowerCase().trim().split(/\s+/);
      let matchingWords = 0;

      for (const aiWord of aiWords) {
        if (
          optionWords.some(
            (optionWord) =>
              optionWord.includes(aiWord) || aiWord.includes(optionWord)
          )
        ) {
          matchingWords++;
        }
      }

      const score =
        matchingWords / Math.max(aiWords.length, optionWords.length);
      if (score > bestScore && score > 0.5) {
        bestScore = score;
        bestMatch = option;
      }
    }

    return bestMatch;
  }

  /**
   * Handle phone input with country code
   */
  async handlePhoneInputWithCountryCode(form, profile) {
    try {
      // Make sure we have phone data
      if (!profile.phone && !profile.phoneNumber) {
        return false;
      }

      const phoneNumber = profile.phone || profile.phoneNumber;
      const phoneCountryCode = profile.phoneCountryCode;

      // Find phone input field
      const phoneInput = form.querySelector(
        'input[name="phone"], input[type="tel"]'
      );
      if (!phoneInput) {
        return false;
      }

      // Find country selector dropdown
      const countrySelector = phoneInput.parentElement.querySelector(
        ".iti__selected-flag"
      );
      if (!countrySelector) {
        await this.setPhoneValue(phoneInput, phoneNumber);
        return true;
      }

      await this.wait(300);
      countrySelector.click();
      await this.wait(500);

      // Get dropdown list
      const countryList = document.querySelector(".iti__country-list");
      if (!countryList) {
        await this.setPhoneValue(phoneInput, phoneNumber);
        return true;
      }

      // Get all country items and extract codes
      const countryItems = countryList.querySelectorAll("li.iti__country");
      const countryCodesMap = {};

      for (const item of countryItems) {
        const codeSpan = item.querySelector(".iti__dial-code");
        if (codeSpan) {
          const code = codeSpan.textContent.trim();
          countryCodesMap[code] = item;
        }
      }

      // Find matching country code
      let targetItem = null;
      let selectedCountryCode = null;

      if (phoneCountryCode) {
        // Make sure it has the plus sign
        const formattedCode = phoneCountryCode.startsWith("+")
          ? phoneCountryCode
          : `+${phoneCountryCode}`;

        targetItem = countryCodesMap[formattedCode];
        selectedCountryCode = formattedCode;
      }

      if (targetItem) {
        targetItem.click();
        await this.wait(300);

        // Process phone number to remove country code if present
        let phoneNumberWithoutCode = phoneNumber;

        if (
          selectedCountryCode &&
          phoneNumber.startsWith(selectedCountryCode)
        ) {
          phoneNumberWithoutCode = phoneNumber
            .substring(selectedCountryCode.length)
            .trim()
            .replace(/^[\s\-\(\)]+/, "");
        } else if (phoneNumber.startsWith("+")) {
          // Extract and remove any country code
          const genericCodeMatch = phoneNumber.match(/^\+\d{1,4}/);
          if (genericCodeMatch) {
            phoneNumberWithoutCode = phoneNumber
              .substring(genericCodeMatch[0].length)
              .trim()
              .replace(/^[\s\-\(\)]+/, "");
          }
        }

        await this.setPhoneValue(phoneInput, phoneNumberWithoutCode);
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Method for setting phone input values
   */
  async setPhoneValue(input, value) {
    if (!input || value === undefined) return;

    try {
      // Wait briefly
      await this.wait(200);

      // Focus input
      input.focus();
      await this.wait(100);

      // Clear existing value
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await this.wait(100);

      // Set new value
      input.value = value;

      // Dispatch events
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("blur", { bubbles: true }));

      // For international phone input
      if (input.classList.contains("iti__tel-input")) {
        setTimeout(() => {
          input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
        }, 100);
      }

      await this.wait(200);

      // Verify value set correctly
      if (input.value !== value) {
        // Direct approach as fallback
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        ).set;

        nativeInputValueSetter.call(input, value);

        // Dispatch synthetic input event
        const event = new Event("input", { bubbles: true });
        input.dispatchEvent(event);

        await this.wait(100);
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Update the main fillField method to handle phone fields
   */
  async fillField(element, value) {
    try {
      if (!element || value === undefined || value === null) {
        return false;
      }

      const fieldType = this.getFieldType(element);

      switch (fieldType) {
        case "text":
        case "email":
        case "url":
        case "number":
        case "password":
          return await this.fillInputField(element, value);

        case "phone":
        case "tel":
          return await this.fillPhoneField(element, value);

        case "textarea":
          return await this.fillTextareaField(element, value);

        case "checkbox":
          // Check if this is a checkbox group or single checkbox
          if (element.getAttribute("role") === "group" && element.querySelector('[role="checkbox"]')) {
            // This is a checkbox group - use pre-computed multi-select array if available
            if (Array.isArray(value) && value.length > 0) {
              return await this.applyCheckboxGroupSelections(element, value);
            }
            // Fallback: make own AI call if value is not an array
            const question = this.getFieldLabel(element);
            return await this.handleCheckboxGroup(element, question, "Multi-select checkbox group");
          } else {
            // Single checkbox
            return await this.fillCheckboxField(element, value);
          }

        case "radio":
          return await this.fillRadioField(element, value);

        case "select":
          return await this.fillSelectField(element, value);

        case "date":
          return await this.fillDateField(element, value);

        case "file":
          return false;

        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }
  /**
   * Fill a text input field with human-like typing behavior
   */
  async fillInputField(element, value) {
    try {
      this.scrollToElement(element);
      element.focus();
      await this.humanWait(200, 400);

      // Clear existing value first with human-like behavior
      const currentValue = element.value;
      if (currentValue) {
        // Simulate selecting all and deleting
        element.select();
        await this.humanWait(100, 200);

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        ).set;

        nativeInputValueSetter.call(element, "");
        element.dispatchEvent(new Event("input", { bubbles: true }));
        await this.humanWait(50, 100);
      }

      // Type the value character by character with human-like timing
      await this.humanType(element, String(value));

      // Final events
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true }));

      await this.humanWait(200, 400);

      // Verify the value was set correctly
      if (element.value === String(value)) {
        return true;
      } else {
        // Fallback: Try direct assignment if human typing failed
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        ).set;

        nativeInputValueSetter.call(element, String(value));
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));

        return element.value === String(value);
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Fill a textarea field with human-like paste behavior (faster than typing)
   */
  async fillTextareaField(element, value) {
    try {
      const textarea = element.querySelector("textarea") || element;

      this.scrollToElement(textarea);
      textarea.focus();
      await this.humanWait(200, 400);

      // Clear existing content with human-like behavior
      const currentValue = textarea.value;
      if (currentValue) {
        textarea.select();
        await this.humanWait(100, 200);

        const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value"
        ).set;

        nativeTextareaValueSetter.call(textarea, "");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        await this.humanWait(50, 100);
      }

      // Clean and prepare value
      const cleanedValue = String(value)
        .replace(/\r?\n|\r/g, "\n")
        .trim();

      // Simulate human-like paste behavior (much faster than typing)
      await this.humanPaste(textarea, cleanedValue);

      // Final events
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
      textarea.dispatchEvent(new Event("blur", { bubbles: true }));

      await this.humanWait(200, 400);

      // Verify the value was set
      if (textarea.value === cleanedValue) {
        return true;
      } else {
        // Fallback: Try direct assignment

        // Fallback: Try direct assignment
        const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value"
        ).set;

        nativeTextareaValueSetter.call(textarea, cleanedValue);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));

        return textarea.value === cleanedValue;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * FIXED: Fill a checkbox field using Ashby's aggressive approach
   */
  async fillCheckboxField(element, value) {
    try {
      // Parse AI response to boolean, return false if unclear
      const shouldCheck = this.parseAIBoolean(value);
      if (shouldCheck === null) {
        return false;
      }

      // Find the actual checkbox input if we were given a container
      let checkboxInput = element;
      let currentState = false;

      if (element.tagName.toLowerCase() !== "input") {
        checkboxInput = element.querySelector('input[type="checkbox"]');

        if (!checkboxInput) {
          if (element.getAttribute("role") === "checkbox") {
            currentState = element.getAttribute("aria-checked") === "true";

            // ENHANCED WORKABLE CHECKBOX APPROACH: Similar to selectCheckboxOption
            if (
              (shouldCheck && !currentState) ||
              (!shouldCheck && currentState)
            ) {
              this.scrollToElement(element);
              await this.wait(200);

              let success = false;

              // Method 1: Click the checkbox element directly
              element.click();
              await this.wait(300); // Longer wait for state change
              success = element.getAttribute("aria-checked") === shouldCheck.toString();

              if (!success) {
                // Method 2: Click the parent label if it exists
                const label = element.closest('label');
                if (label) {
                  label.click();
                  await this.wait(300);
                  success = element.getAttribute("aria-checked") === shouldCheck.toString();
                }
              }

              if (!success) {
                // Method 3: Force the checkbox state with proper events
                element.setAttribute("aria-checked", shouldCheck.toString());

                // Also update the hidden input if it exists
                const hiddenInput = element.querySelector('input[type="checkbox"]') ||
                  element.parentElement?.querySelector('input[type="checkbox"]');
                if (hiddenInput) {
                  hiddenInput.checked = shouldCheck;
                }

                // Dispatch proper events
                element.dispatchEvent(new Event("change", { bubbles: true }));
                element.dispatchEvent(new Event("click", { bubbles: true }));

                // Also dispatch on the hidden input if it exists
                if (hiddenInput) {
                  hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
                }

                success = true; // Assume success since we forced it
              }

              return success;
            }
            return true;
          }
        }

        if (!checkboxInput) {
          return false;
        }
      } else {
        currentState = element.checked;
      }

      // Only change state if needed
      if ((shouldCheck && !currentState) || (!shouldCheck && currentState)) {
        this.scrollToElement(checkboxInput);
        await this.wait(200);

        // ASHBY'S AGGRESSIVE APPROACH: Try multiple click strategies
        let success = false;

        // Method 1: Direct property assignment
        checkboxInput.checked = shouldCheck;
        if (checkboxInput.checked === shouldCheck) {
          success = true;
        }

        // Method 2: Click the label (most reliable for checkboxes)
        if (!success) {
          const label =
            checkboxInput.closest("label") ||
            document.querySelector(`label[for="${checkboxInput.id}"]`);
          if (label) {
            label.click();
            await this.wait(200);
            success = checkboxInput.checked === shouldCheck;
          }
        }

        // Method 3: Click the checkbox directly
        if (!success) {
          checkboxInput.click();
          await this.wait(200);
          success = checkboxInput.checked === shouldCheck;
        }

        // Method 4: Force the state and dispatch events
        if (!success) {
          checkboxInput.checked = shouldCheck;
          checkboxInput.setAttribute("checked", shouldCheck ? "checked" : "");
          checkboxInput.dispatchEvent(new Event("change", { bubbles: true }));
          checkboxInput.dispatchEvent(new Event("click", { bubbles: true }));
          success = true; // Assume success since we forced it
        }

        return success;
      }

      return true; // No change needed
    } catch (error) {
      return false;
    }
  }

  async fillRadioField(element, value) {
    try {
      if (!value) {
        return false;
      }

      const aiValue = String(value).toLowerCase().trim();

      // Handle Workable's fieldset radio groups
      if (
        element.getAttribute("role") === "radiogroup" ||
        (element.tagName === "FIELDSET" &&
          element.getAttribute("role") === "radiogroup")
      ) {
        return await this.handleWorkableRadioGroup(element, aiValue);
      }

      // Handle individual radio elements
      else if (element.getAttribute("role") === "radio") {
        const radioGroup =
          element.closest('fieldset[role="radiogroup"]') ||
          element.closest('[role="radiogroup"]');
        if (radioGroup) {
          return await this.handleWorkableRadioGroup(radioGroup, aiValue);
        }
      }

      // Handle standard radio buttons (fallback)
      else {
        return await this.handleStandardRadioButtons(element, aiValue);
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Fill a select field
   */
  async fillSelectField(element, value) {
    try {
      if (element.tagName === "SELECT") {
        // Standard select element
        const options = Array.from(element.options);
        const bestMatch = this.findBestMatchingOption(
          value,
          options.map((opt) => opt.textContent)
        );

        if (bestMatch) {
          const matchingOption = options.find(
            (opt) => opt.textContent === bestMatch
          );
          if (matchingOption) {
            element.value = matchingOption.value;
            element.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
          }
        }
      } else if (element.getAttribute("role") === "combobox") {
        // Handle Workable custom combobox - we already have the AI answer as 'value'
        this.scrollToElement(element);
        element.focus();
        await this.wait(200);
        element.click();
        await this.wait(500); // Wait for modal to appear
        
        // Extract options from the opened modal
        const options = await this.extractComboboxOptions(element);
        
        if (!options || options.length === 0) {
          document.body.click();
          return false;
        }
        
        // Find the best matching option based on the AI answer
        const bestMatch = this.findBestMatchingOption(value, options);

        if (!bestMatch) {
          document.body.click();
          return false;
        }

        // Click the matching option in the modal
        const success = await this.selectComboboxOption(bestMatch, element);
        return success;
      }

      return false;
    } catch (error) {
      console.error('Error in fillSelectField:', error);
      // Try to close any open modal
      try {
        document.body.click();
      } catch (e) {
        // Ignore
      }
      return false;
    }
  }

  /**
   * Fill a date field
   * AI is instructed to return dates in the exact format needed (MM/DD/YYYY, MM/YYYY, etc.)
   * So we just paste the value directly without reformatting
   */
  async fillDateField(element, value) {
    try {
      // For standard HTML5 date inputs
      if (
        element.tagName.toLowerCase() === "input" &&
        element.type === "date"
      ) {
        return await this.fillInputField(element, value);
      }

      // For react-datepicker and Workable custom date inputs
      const isDateInput =
        element.getAttribute("inputmode") === "tel" &&
        (element.placeholder?.includes("MM/YYYY") ||
          element.placeholder?.includes("MM/DD/YYYY") ||
          element.placeholder?.includes("DD/MM/YYYY") ||
          element.placeholder?.includes("YYYY-MM-DD"));

      if (isDateInput || element.closest(".react-datepicker-wrapper")) {
        this.scrollToElement(element);
        element.focus();
        await this.wait(100);

        // Use native setter to bypass React's controlled component handling
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        ).set;

        // Clear existing value
        nativeInputValueSetter.call(element, "");
        element.dispatchEvent(new Event("input", { bubbles: true }));
        await this.wait(50);

        // Paste the AI-formatted date directly (AI was instructed on the exact format)
        nativeInputValueSetter.call(element, String(value));
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        element.dispatchEvent(new Event("blur", { bubbles: true }));

        return true;
      }

      // Fallback to regular input field handling
      return await this.fillInputField(element, value);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get available options from select fields including custom Workable dropdowns
   * NOW ASYNC to properly handle combobox modal extraction
   */
  async getFieldOptions(element, form) {
    try {
      const options = [];
      const fieldType = this.getFieldType(element);

      if (fieldType === "select") {
        // First, try to click to open dropdown if it's a custom select
        if (element.getAttribute("role") === "combobox") {
          // Generate a unique key for this element using aria-owns (most reliable)
          const listboxId = element.getAttribute('aria-owns') || element.getAttribute('aria-controls');
          const elementKey = listboxId || element.id || element.getAttribute('aria-labelledby') ||
                            element.name || Math.random().toString(36);

          // Check if we already have options cached for this element
          if (this.comboboxOptionsCache.has(elementKey)) {
            return this.comboboxOptionsCache.get(elementKey);
          }

          // Scroll and click to open modal
          this.scrollToElement(element);
          element.focus();
          await this.wait(200);
          element.click();
          await this.wait(500); // Wait for modal to open

          // First try to find listbox directly via aria-owns/aria-controls
          let listbox = null;
          if (listboxId) {
            listbox = document.getElementById(listboxId);
          }

          // Fall back to dialog search if no direct listbox found
          if (!listbox) {
            const dialog = document.querySelector(
              'dialog[open], [role="dialog"], [data-role="dialog-container"], ' +
              '.styles--3-QiA, .styles--1YkTn'
            );

            if (dialog) {
              listbox = dialog.querySelector('ul[role="listbox"], [role="listbox"]');
            }
          }

          if (listbox) {
            // Skip if this is a phone country list
            if (listbox.classList.contains('iti__country-list') ||
                listbox.closest('.iti__country-list')) {
              document.body.click();
              await this.wait(300);
              return options;
            }

            const optionItems = listbox.querySelectorAll('li[role="option"], [role="option"]');

            optionItems.forEach((item) => {
              // Extract text from Workable-specific spans
              const textEl =
                item.querySelector("span.styles--f-uLT") ||
                item.querySelector("span.styles--QTMDv") ||
                item.querySelector("span.styles--2TdGW") ||
                item.querySelector("span") ||
                item;

              if (textEl && textEl.textContent.trim()) {
                options.push(textEl.textContent.trim());
              }
            });

            // Cache the options for later use
            this.comboboxOptionsCache.set(elementKey, [...options]);

            // Close the dropdown by clicking outside
            document.body.click();
            await this.wait(300);
          } else {
            // Try to close any open modal
            document.body.click();
            await this.wait(300);
          }
        }

        // Handle standard select
        else if (element.tagName === "SELECT") {
          const optionElements = element.querySelectorAll("option");
          optionElements.forEach((option) => {
            if (option.value && option.textContent.trim()) {
              options.push(option.textContent.trim());
            }
          });
        }
      } else if (fieldType === "radio") {
        // Enhanced radio option extraction
        const radioContainer =
          element.tagName === "FIELDSET"
            ? element
            : element.closest('fieldset[role="radiogroup"]') ||
            element.closest('[role="radiogroup"]');

        if (radioContainer) {
          const radios = radioContainer.querySelectorAll('[role="radio"]');
          radios.forEach((radio) => {
            const radioId = radio.id;
            const labelSpan =
              radio.querySelector('span[id*="radio_label"]') ||
              document.querySelector(
                `span[id="radio_label_${radioId?.split("_").pop()}"]`
              );

            if (labelSpan) {
              options.push(labelSpan.textContent.trim());
            } else {
              // Fallback label extraction
              const label = this.getFieldLabel(radio);
              if (label) {
                options.push(label);
              }
            }
          });
        }
      } else if (fieldType === "checkbox" && element.getAttribute("role") === "group") {
        // Extract checkbox group options
        const checkboxOptions = this.extractCheckboxOptions(element);
        checkboxOptions.forEach((option) => {
          if (option.label) {
            options.push(option.label);
          }
        });
      }

      // Remove duplicates and empty options
      return [...new Set(options.filter((opt) => opt && opt.trim()))];
    } catch (error) {
      return [];
    }
  }

  /**
   * Handle required checkbox fields - PURE AI VERSION (no hard-coded assumptions)
   * Skips checkboxes that are part of groups already handled by handleCheckboxGroup
   */
  async handleRequiredCheckboxes(form) {
    try {
      const checkboxFields = [];

      // Find standard checkboxes
      const standardCheckboxes = form.querySelectorAll(
        'input[type="checkbox"]'
      );
      for (const checkbox of standardCheckboxes) {
        if (!this.isElementVisible(checkbox)) continue;

        // Skip if this checkbox is part of a group that was already handled
        const parentGroup = checkbox.closest('[role="group"]');
        if (parentGroup && parentGroup.querySelector('[role="checkbox"]')) {
          continue; // Skip individual checkboxes that are part of checkbox groups
        }

        const label = this.getFieldLabel(checkbox);
        const isRequired = this.isFieldRequired(checkbox);

        if (label) {
          checkboxFields.push({
            element: checkbox,
            label,
            isRequired,
          });
        }
      }

      // Find Workable custom checkboxes
      const customCheckboxes = form.querySelectorAll('[role="checkbox"]');
      for (const checkbox of customCheckboxes) {
        if (!this.isElementVisible(checkbox)) continue;

        // Skip if this checkbox is part of a group that was already handled
        const parentGroup = checkbox.closest('[role="group"]');
        if (parentGroup && parentGroup.querySelector('[role="checkbox"]')) {
          continue; // Skip individual checkboxes that are part of checkbox groups
        }

        const label = this.getFieldLabel(checkbox);
        const isRequired = this.isFieldRequired(checkbox);

        if (label) {
          checkboxFields.push({
            element: checkbox,
            label,
            isRequired,
          });
        }
      }

      // Process each checkbox with AI guidance
      for (const field of checkboxFields) {
        try {
          // Check if this is a GDPR/consent checkbox
          const isGdprCheckbox = field.element.getAttribute('data-ui') === 'gdpr' ||
            field.element.closest('label')?.getAttribute('data-ui') === 'gdpr' ||
            field.label.toLowerCase().includes('privacy') ||
            field.label.toLowerCase().includes('consent') ||
            field.label.toLowerCase().includes('gdpr') ||
            field.label.toLowerCase().includes('terms');

          // Build context for AI decision
          let fieldContext;
          if (isGdprCheckbox) {
            fieldContext = [
              `This is a required consent/privacy checkbox`,
              "This type of checkbox must be checked to proceed with the application",
              "Privacy notices, GDPR consents, and terms agreements are mandatory for job applications",
            ].join(". ");
          } else {
            fieldContext = [
              `This is a checkbox field`,
              field.isRequired
                ? "This checkbox is required"
                : "This checkbox is optional",
              "Please decide whether to check this checkbox based on the user profile and the checkbox label/purpose",
            ].join(". ");
          }

          // Get AI answer for this checkbox
          const answer = await this.getAIAnswer(
            field.label,
            ["yes", "no"],
            "checkbox",
            fieldContext
          );

          if (answer !== null && answer !== undefined && answer !== "") {
            const shouldCheck = this.parseAIBoolean(answer);

            if (shouldCheck !== null) {
              await this.fillCheckboxField(field.element, shouldCheck);
              await this.wait(200);
            }
          }
        } catch (fieldError) {
          return false;
        }
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate unique form identifier based on form structure
   */
  getFormIdentifier() {
    try {
      const formFields = this.getAllFormFields(document);
      const fieldLabels = formFields
        .map((f) => f.label)
        .filter((label) => label)
        .sort()
        .join("|");

      const url = window.location.href.split("?")[0];
      return btoa(url + "|" + fieldLabels).substring(0, 32);
    } catch (error) {
      return btoa(window.location.href).substring(0, 32);
    }
  }

  /**
   * Check if form already appears to be filled
   */
  isFormAlreadyFilled() {
    try {
      const formFields = this.getAllFormFields(document);
      let filledCount = 0;
      let totalTextFields = 0;

      for (const field of formFields) {
        if (field.type === "text" || field.type === "textarea") {
          totalTextFields++;
          const input = field.element.querySelector("input, textarea");
          if (input && input.value && input.value.trim()) {
            filledCount++;
          }
        } else if (field.type === "radio") {
          const checkedRadio =
            field.element.querySelector(
              '[role="radio"][aria-checked="true"]'
            ) || field.element.querySelector('input[type="radio"]:checked');
          if (checkedRadio) {
            filledCount++;
          }
        } else if (field.type === "checkbox") {
          const checkedBoxes =
            field.element.querySelectorAll(
              '[role="checkbox"][aria-checked="true"]'
            ) ||
            field.element.querySelectorAll('input[type="checkbox"]:checked');
          if (checkedBoxes.length > 0) {
            filledCount++;
          }
        }
      }

      // Consider form filled if more than 50% of text fields have values
      const fillRatio = totalTextFields > 0 ? filledCount / totalTextFields : 0;
      const isAlreadyFilled = fillRatio > 0.5;
      return isAlreadyFilled;
    } catch (error) {
      return false;
    }
  }

  /**
   * FIXED: Fill form with profile data using AI-generated answers with state management
   */
  async fillFormWithProfile(form, profile, jobDescription) {
    try {
      if (this.fillInProgress) {
        return true;
      }

      const now = Date.now();
      if (now - this.lastFillTime < 5000) {
        return true;
      }

      const formId = this.getFormIdentifier();
      if (this.processedForms.has(formId)) {
        return true;
      }

      if (this.isFormAlreadyFilled()) {
        this.processedForms.add(formId);
        return true;
      }

      this.fillInProgress = true;
      this.lastFillTime = now;

      this.userData = profile;
      // Normalize jobDescription: if it's an object, build enriched string; if already a string, use as-is
      if (jobDescription && typeof jobDescription === 'object') {
        const parts = [];
        if (jobDescription.title) parts.push(`Job Title: ${jobDescription.title}`);
        if (jobDescription.company) parts.push(`Company: ${jobDescription.company}`);
        if (jobDescription.location) parts.push(`Location: ${jobDescription.location}`);
        if (jobDescription.department) parts.push(`Department: ${jobDescription.department}`);
        if (jobDescription.workplace) parts.push(`Workplace: ${jobDescription.workplace}`);
        if (jobDescription.employmentType) parts.push(`Employment Type: ${jobDescription.employmentType}`);
        if (jobDescription.salary) parts.push(`Salary: ${jobDescription.salary}`);
        if (jobDescription.fullDescription) parts.push(`\nJob Description:\n${jobDescription.fullDescription}`);
        this.jobDescription = parts.join('\n');
      } else if (typeof jobDescription === 'string' && jobDescription) {
        this.jobDescription = jobDescription;
      }
      const formFields = this.getAllFormFields(form);

      let filledCount = 0;
      let skippedCount = 0;

      for (const field of formFields) {
        if (!field.label) {
          continue;
        }

        if (field.type === "file") {
          continue;
        }

        try {
          // Check if this is a cover letter field and handle it specially
          if (this.isCoverLetterField(field)) {
            // Generate cover letter using AI API
            const jobData = {
              title: this.extractJobTitle(),
              company: this.extractCompanyName(),
              description: this.jobDescription
            };

            const coverLetter = await this.generateCoverLetter(jobData);

            if (coverLetter) {
              const success = await this.fillField(field.element, coverLetter);
              if (success) {
                filledCount++;
              } else {
                skippedCount++;
              }

              await this.wait(300);
              continue; // Skip the regular AI answer logic for cover letter fields
            }
            // If cover letter generation failed, fall through to regular AI answer logic
          }

          // Get available options for select/radio fields
          const options = ["select", "radio", "checkbox"].includes(field.type)
            ? await this.getFieldOptions(field.element, form)
            : []

          // Extract field constraints for AI validation
          const constraints = this.getFieldConstraints(field.element);

          // Build comprehensive context for AI
          const fieldContext = [
            `Field type: ${field.type}`,
            field.required
              ? "This field is required"
              : "This field is optional",
            options.length > 0
              ? `Available options: ${options.join(", ")}`
              : "",
            constraints.placeholder
              ? `Placeholder: ${constraints.placeholder}`
              : "",
            constraints.minLength
              ? `Minimum length: ${constraints.minLength} characters`
              : "",
            constraints.maxLength
              ? `Maximum length: ${constraints.maxLength} characters`
              : "",
            constraints.pattern
              ? `Must match pattern: ${constraints.pattern}`
              : "",
            "Please provide your response based solely on the user profile data provided.",
            "Ensure your response respects any length constraints and patterns specified."
          ]
            .filter(Boolean)
            .join(". ");

          // Get AI answer with full context
          const answer = await this.getAIAnswer(
            field.label,
            options,
            field.type,
            fieldContext
          );

          if (answer !== null && answer !== undefined && answer !== "") {
            const success = await this.fillField(field.element, answer);
            if (success) {
              filledCount++;
            } else {
              skippedCount++;
            }
          } else {
            skippedCount++;
          }

          await this.wait(300);
        } catch (fieldError) {
          skippedCount++;
        }
      }

     
      await this.handleRequiredCheckboxes(form);

      this.processedForms.add(formId);
      return filledCount > 0;
    } catch (error) {
      return false;
    } finally {
      this.fillInProgress = false;
    }
  }

  /**
   * Check if an element is visible on the page
   */
  isElementVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0"
    );
  }

  /**
   * Scroll an element into view
   */
  scrollToElement(element) {
    if (!element) return;

    try {
      element.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    } catch (error) {
      try {
        element.scrollIntoView();
      } catch (e) {
        // Silent fail if scrolling fails
      }
    }
  }

  /**
   * Wait for a specified amount of time (legacy method)
   */
  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Human-like wait with random variance
   */
  humanWait(minMs, maxMs) {
    const variance = maxMs - minMs;
    const randomWait = minMs + (Math.random() * variance);
    return new Promise((resolve) => setTimeout(resolve, randomWait));
  }

  /**
   * Human-like typing simulation
   */
  async humanType(element, text) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
      "value"
    ).set;

    let currentValue = "";

    for (let i = 0; i < text.length; i++) {
      currentValue += text[i];

      // Set the value incrementally
      nativeInputValueSetter.call(element, currentValue);

      // Dispatch input event for each character
      element.dispatchEvent(new Event("input", { bubbles: true }));

      // Human-like typing speed with variance (30-120ms between keystrokes)
      const baseDelay = 60;
      const variance = 60;
      const delay = baseDelay + (Math.random() * variance);

      // Occasionally add longer pauses (simulating thinking/hesitation)
      const shouldPause = Math.random() < 0.1; // 10% chance of pause
      const pauseDelay = shouldPause ? 200 + (Math.random() * 300) : 0;

      await this.wait(delay + pauseDelay);
    }
  }

  /**
   * Human-like click simulation with mouse movement
   */
  async humanClick(element) {
    // Simulate mouse movement to element
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Add small random offset to click position (within element bounds)
    const offsetX = (Math.random() - 0.5) * Math.min(rect.width * 0.6, 20);
    const offsetY = (Math.random() - 0.5) * Math.min(rect.height * 0.6, 10);

    // Focus element first (simulating tab navigation or mouse hover)
    element.focus();
    await this.humanWait(100, 200);

    // Simulate mousedown -> mouseup sequence with realistic timing
    const mouseDownEvent = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: centerX + offsetX,
      clientY: centerY + offsetY,
      button: 0
    });

    const mouseUpEvent = new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      clientX: centerX + offsetX,
      clientY: centerY + offsetY,
      button: 0
    });

    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: centerX + offsetX,
      clientY: centerY + offsetY,
      button: 0
    });

    // Dispatch events in sequence with human-like timing
    element.dispatchEvent(mouseDownEvent);
    await this.humanWait(80, 150); // Human click duration
    element.dispatchEvent(mouseUpEvent);
    await this.humanWait(10, 30);
    element.dispatchEvent(clickEvent);

    // Small delay after click (simulates human reaction time)
    await this.humanWait(100, 200);
  }

  /**
   * Human-like paste simulation for textareas (faster than typing)
   */
  async humanPaste(element, text) {
    // Focus element first
    element.focus();
    await this.humanWait(100, 200);

    // Simulate Ctrl+V paste behavior
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
      "value"
    ).set;

    // Set the value all at once (like paste)
    nativeInputValueSetter.call(element, text);

    // Dispatch paste-related events
    element.dispatchEvent(new Event("input", { bubbles: true }));
    await this.humanWait(50, 100);

    // Simulate the brief delay after pasting
    await this.humanWait(200, 400);
  }

  /**
   * Extract field length constraints for AI validation
   */
  getFieldConstraints(element) {
    const constraints = {
      minLength: null,
      maxLength: null,
      pattern: null,
      required: false,
      placeholder: null
    };

    try {
      // Get the actual input element
      const inputElement = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA'
        ? element
        : element.querySelector('input, textarea');

      if (inputElement) {
        // Extract placeholder for date format detection
        if (inputElement.placeholder) {
          constraints.placeholder = inputElement.placeholder;
        }

        // Extract length constraints
        if (inputElement.minLength !== undefined && inputElement.minLength > 0) {
          constraints.minLength = inputElement.minLength;
        }

        if (inputElement.maxLength !== undefined && inputElement.maxLength > 0 && inputElement.maxLength !== 524288) {
          // Ignore default browser maxLength
          constraints.maxLength = inputElement.maxLength;
        }

        // Extract pattern if available
        if (inputElement.pattern) {
          constraints.pattern = inputElement.pattern;
        }

        // Check if required
        constraints.required = inputElement.required || inputElement.getAttribute('required') !== null;

        // Check for HTML5 validation attributes
        if (inputElement.type === 'email') {
          constraints.pattern = constraints.pattern || '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';
        }

        if (inputElement.type === 'url') {
          constraints.pattern = constraints.pattern || '^https?:\\/\\/.+';
        }

        if (inputElement.type === 'tel') {
          // Don't set a strict pattern for phone as formats vary globally
          constraints.minLength = constraints.minLength || 10;
        }
      }
    } catch (error) {
      return constraints;
    }

    return constraints;
  }

  /**
   * Reset form handler state (useful for new forms)
   */
  resetState() {
    this.processedForms.clear();
    this.fillInProgress = false;
    this.lastFillTime = 0;
    this.comboboxOptionsCache.clear();
  }
}
