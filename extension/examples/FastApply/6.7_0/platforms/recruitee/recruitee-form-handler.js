import { notifyStatus } from "../../utils/status-helper.js";
import { AIResponseUtils } from "../../shared/utilities/index.js";
export class RecruiteeFormHandler {
  constructor(aiService, userData, options = {}) {
    this.aiService = aiService;
    this.userData = userData;
    this.answerCache = new Map();

    // Co-pilot mode properties
    // Global overlay used via notifyStatus()
    this.logger = options.logger;
    this.copilotMode = options.copilotMode || false;
    this.copilotState = options.copilotState;
    this.currentJobTitle = "";
    this.userActionPromise = null;
    this.userActionResolver = null;
    this.jobDescription = null;
    this.shouldCancel = false;
  }

  /**
   * Wait for user action (Submit, Skip, Next)
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

  async processApplicationForm() {
    try {
      await this.delay(1000);

      // Find the specific Recruitee form
      const applicationForm = document.querySelector(
        "form#offer-application-form"
      );
      if (!applicationForm) {
        return { success: false, reason: "no_form_found" };
      }

      // Grab all fields using adapted method
      const fields = await this.grabRecruiteeFields(applicationForm);

      // Process each field
      for (const field of fields) {
        if (this.shouldCancel) {
          return { success: false, reason: "user_skipped" };
        }
        await this.handleRecruiteeField(field);
        await this.delay(300);
      }

      // Handle required checkboxes (privacy/consent)
      await this.handleRequiredCheckboxes(applicationForm);

      // Find submit button
      const submitButton = this.findSubmitButton(applicationForm);
      if (!submitButton || submitButton.disabled) {
        return {
          success: false,
          reason: "submit_button_disabled",
        };
      }

      // Co-pilot mode: pause and wait for user approval before submitting
      if (this.copilotMode) {
        if (true) { // Global overlay
          notifyStatus({
            type: "COPILOT_SUBMIT_READY",
            data: {
              buttonText: submitButton.textContent?.trim(),
              jobTitle: this.currentJobTitle,
              title: this.currentJobTitle,
            },
          });
        }

        if (this.copilotState) {
          this.copilotState.setPendingSubmission(
            { title: this.currentJobTitle },
            submitButton
          );
        }

        const userAction = await this.waitForUserAction();

        if (userAction === "SUBMIT") {
          // User approved, continue with submission
          if (this.copilotState) {
            this.copilotState.clearPendingSubmission();
          }

          // Actually click the submit button
          if (this.logger && typeof this.logger === 'function') {
            this.logger({ type: 'SUBMITTING_APPLICATION' });
          }

          await this.clickElementReliably(submitButton);

          // Wait for submission to complete and check result
          const submissionResult = await this.waitForSubmissionResult();
          return submissionResult;
        } else if (userAction === "SKIP") {
          return { success: false, reason: "user_skipped" };
        }
      }

      // Auto-pilot mode: submit directly
      await this.clickElementReliably(submitButton);

      // Wait for submission to complete and check result
      const submissionResult = await this.waitForSubmissionResult();
      return submissionResult;
    } catch (error) {
      return {
        success: false,
        reason: "error",
        error: error.message,
      };
    }
  }

  async waitForSubmissionResult() {
    const maxWaitTime = 30000; // 30 seconds
    const checkInterval = 1000; // Check every second
    let elapsedTime = 0;

    while (elapsedTime < maxWaitTime) {
      await this.delay(checkInterval);
      elapsedTime += checkInterval;

      // Check if submit button is still loading
      const isLoading = this.isSubmitButtonLoading();
      if (isLoading) {
        continue;
      }

      // Check for success message
      const successResult = this.checkForSuccessMessage();
      console.log("Success result:", successResult);
      if (successResult.found) {
        return {
          success: true,
          message: "Form submitted successfully",
          successMessage: successResult.message,
        };
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

  isSubmitButtonLoading() {
    try {
      // Check for the loading submit button with aria-busy="true"
      const loadingButton = document.querySelector(
        'button[type="submit"][aria-busy="true"], button[data-testid="submit-application-form-button"][aria-busy="true"]'
      );

      if (loadingButton) {
        // Also check for the loading spinner inside the button
        const spinner = loadingButton.querySelector(
          '.sc-164q74r-0, .sc-s03za1-1, [class*="spinner"], [class*="loading"]'
        );
        return spinner !== null;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  checkForSuccessMessage() {
    try {
      // Check 1: URL ends with /applied (Recruitee redirects here on success)
      if (window.location.pathname.endsWith("/applied")) {
        return { found: true, message: "Redirected to /applied page" };
      }

      // Check 2: The "All done!" container is ALWAYS pre-rendered in a hidden
      // tab panel. It only counts as success when its parent tabpanel is active
      // (i.e. the hidden attribute has been removed).
      const ariaLiveRegion = document.querySelector('div[aria-live="assertive"]');
      if (ariaLiveRegion) {
        const heading = ariaLiveRegion.querySelector("h3");
        if (heading && heading.textContent.trim() === "All done!") {
          const tabPanel = ariaLiveRegion.closest('[role="tabpanel"]');
          if (tabPanel && !tabPanel.hasAttribute("hidden")) {
            return {
              found: true,
              message: ariaLiveRegion.textContent.trim(),
            };
          }
        }
      }

      return { found: false };
    } catch (error) {
      return { found: false };
    }
  }

  checkForErrorMessage() {
    try {
      // Look for common error message patterns
      const errorSelectors = [
        ".error",
        ".alert-danger",
        ".form-error",
        '[role="alert"]',
        ".sc-error",
        ".validation-error",
        'div[aria-live="assertive"]:has(.error)',
        ".field-error",
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

      // Check for validation errors on form fields
      const validationErrors = document.querySelectorAll(
        'input:invalid, select:invalid, textarea:invalid, .is-invalid, [aria-invalid="true"]'
      );

      if (validationErrors.length > 0) {
        const errorMessages = [];
        for (const field of validationErrors) {
          if (this.isElementVisible(field)) {
            const label = this.getInputLabel(field);
            errorMessages.push(`${label}: validation error`);
          }
        }

        if (errorMessages.length > 0) {
          return {
            found: true,
            message: `Validation errors: ${errorMessages.join(", ")}`,
          };
        }
      }

      return { found: false };
    } catch (error) {
      return { found: false };
    }
  }

  async grabRecruiteeFields(form) {
    const results = [];

    // Get all form containers and input elements
    const containers = form.querySelectorAll(
      ".sc-1mqz0cx-3, fieldset, section"
    );
    const directInputs = form.querySelectorAll(
      'input:not([type="hidden"]), select, textarea'
    );

    // Process containers first (for complex fields)
    for (const container of containers) {
      const fieldInfo = await this.processRecruiteeContainer(container);
      if (fieldInfo) {
        results.push(fieldInfo);
      }
    }

    // Process any remaining direct inputs not caught by containers
    for (const input of directInputs) {
      if (
        input.hasAttribute("data-processed") ||
        !this.isElementVisible(input)
      ) {
        continue;
      }

      const fieldInfo = this.processDirectInput(input);
      if (fieldInfo && fieldInfo.label) {
        results.push(fieldInfo);
        input.setAttribute("data-processed", "true");
      }
    }

    return this.deduplicateFields(results);
  }

  async processRecruiteeContainer(container) {
    try {
      // Skip if already processed
      if (container.hasAttribute("data-processed")) {
        return null;
      }

      // Skip section containers that contain fieldsets - the fieldset will be processed separately
      if (container.tagName.toLowerCase() === "section") {
        const hasFieldset = container.querySelector("fieldset");
        if (hasFieldset) {
          container.setAttribute("data-processed", "true");
          return null;
        }
      }

      let result = {
        element: null,
        type: "",
        label: "",
        required: false,
        options: [],
      };

      // Handle fieldset radio/checkbox groups
      if (container.tagName.toLowerCase() === "fieldset") {
        // Skip fieldsets that contain nested fieldsets - let the inner ones handle themselves
        const nestedFieldset = container.querySelector("fieldset");
        if (nestedFieldset) {
          container.setAttribute("data-processed", "true");
          return null;
        }

        const legend = container.querySelector("legend");
        if (legend) {
          result.label = this.cleanLabelText(legend.textContent);
          result.required = this.isRequiredByText(result.label);
        }

        const radioInputs = container.querySelectorAll('input[type="radio"]');
        if (radioInputs.length > 0) {
          result.type = "radio";
          result.element = [...radioInputs];
          result.options = [...radioInputs].map((input) => {
            const label =
              input.closest("label") ||
              document.querySelector(`label[for="${input.id}"]`);
            if (label) {
              // Get the text from the last span (Recruitee structure)
              const span = label.querySelector("span:last-child");
              return span ? span.textContent.trim() : label.textContent.trim();
            }
            return input.value || "Unknown";
          });

          // Mark all individual radio inputs as processed to prevent directInputs loop
          // from picking them up as separate fields
          radioInputs.forEach(r => r.setAttribute("data-processed", "true"));
          container.setAttribute("data-processed", "true");
          return result;
        }

        // Handle checkbox groups (multi-select questions)
        const checkboxInputs = container.querySelectorAll('input[type="checkbox"]');
        if (checkboxInputs.length > 1) {
          result.type = "checkbox-group";
          result.element = [...checkboxInputs];
          result.options = [...checkboxInputs].map((input) => {
            const label =
              input.closest("label") ||
              document.querySelector(`label[for="${input.id}"]`);
            if (label) {
              // Get the text from the last span (Recruitee structure)
              const span = label.querySelector("span:last-child");
              return span ? span.textContent.trim() : label.textContent.trim();
            }
            return input.value || "Unknown";
          });

          // Mark all checkboxes as processed
          checkboxInputs.forEach(cb => cb.setAttribute("data-processed", "true"));
          container.setAttribute("data-processed", "true");
          return result;
        }
      }

      // Handle regular input containers
      const label = container.querySelector("label");
      const input = container.querySelector("input, select, textarea");

      if (label && input && !input.hasAttribute("data-processed")) {
        result.label = this.cleanLabelText(label.textContent);
        result.required = this.isRequiredByText(result.label) || input.required;
        result.element = input;
        result.type = this.getInputType(input);

        // Handle special phone field
        if (
          result.type === "tel" ||
          input.classList.contains("PhoneInputInput")
        ) {
          result.type = "phone";
        }

        // Handle file inputs
        if (result.type === "file") {
        }

        // Handle select options
        if (result.type === "select") {
          result.options = this.getSelectOptions(input);
        }

        if (result.label && result.type !== "file") {
          input.setAttribute("data-processed", "true");
          container.setAttribute("data-processed", "true");
          return result;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  processDirectInput(input) {
    try {
      const result = {
        element: input,
        type: this.getInputType(input),
        label: this.getInputLabel(input),
        required:
          input.required || input.getAttribute("aria-required") === "true",
        options: [],
      };

      if (result.type === "select") {
        result.options = this.getSelectOptions(input);
      }

      return result;
    } catch (error) {
      return null;
    }
  }

  getInputType(input) {
    if (input.tagName.toLowerCase() === "select") return "select";
    if (input.tagName.toLowerCase() === "textarea") return "textarea";
    if (input.tagName.toLowerCase() === "input") {
      const type = input.type.toLowerCase();
      if (type === "tel" || input.classList.contains("PhoneInputInput"))
        return "phone";
      return type;
    }
    return "unknown";
  }

  getInputLabel(input) {
    // Try label[for] first
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) {
        return this.cleanLabelText(label.textContent);
      }
    }

    // Try parent label
    const parentLabel = input.closest("label");
    if (parentLabel) {
      return this.cleanLabelText(parentLabel.textContent);
    }

    // Try preceding label in container
    const container = input.closest(".sc-1mqz0cx-3, .form-group, div");
    if (container) {
      const label = container.querySelector("label");
      if (label) {
        return this.cleanLabelText(label.textContent);
      }
    }

    // Fallback to placeholder or name
    return this.cleanLabelText(
      input.placeholder || input.name || "Unknown field"
    );
  }

  getSelectOptions(select) {
    const options = [];
    Array.from(select.options).forEach((option) => {
      const text = option.textContent.trim();
      const value = option.value.trim();
      if (text && value && value !== "? undefined:undefined ?") {
        options.push(text);
      }
    });
    return options;
  }

  async handleRecruiteeField(field) {
    try {
      // Skip file fields
      if (field.type === "file") {
        return;
      }

      // Phone fields: use profile data directly, no AI call needed
      if (field.type === "phone") {
        await this.handlePhoneField(field);
        return;
      }

      let answer;

      // For checkbox groups, use getMultiSelectAnswer for proper array response
      if (field.type === "checkbox-group" && field.options && field.options.length > 0) {
        const context = {
          platform: "recruitee",
          userData: this.userData,
          jobDescription: this.jobDescription || this.scrapeJobDescription(),
          fieldType: "checkbox-group",
          fieldContext: "Recruitee application form - checkbox group field",
          required: field.required || false,
        };
        answer = await this.aiService.getMultiSelectAnswer(
          field.label,
          field.options,
          context
        );
      } else {
        answer = await this.getAnswer(field.label, field.options, field.type);
      }

      if (!answer && answer !== 0 && !(Array.isArray(answer) && answer.length > 0)) {
        if (
          field.required &&
          Array.isArray(field.element) &&
          field.element[0]
        ) {
          // Click first option for required fields with no answer
          field.element[0].click();
        } else {
          return;
        }
      }

      // Handle different field types
      switch (field.type) {
        case "radio":
          await this.handleRadioField(field, answer);
          break;
        case "checkbox-group":
          await this.handleCheckboxGroupField(field, answer);
          break;
        case "checkbox":
          await this.handleCheckboxField(field, answer);
          break;
        case "select":
          await this.handleSelectField(field, answer);
          break;
        case "phone":
          await this.handlePhoneField(field, answer);
          break;
        case "textarea":
          await this.handleTextareaField(field, answer);
          break;
        case "number":
          await this.handleNumberField(field, answer);
          break;
        default:
          await this.handleTextInput(field, answer);
      }
    } catch (error) {
      console.error("❌ Error handling field:", error);
    }
  }

  async handleRadioField(field, answer) {
    if (!Array.isArray(field.element)) return;

    const answerLower = answer.toLowerCase().trim();

    for (const radio of field.element) {
      const label =
        radio.closest("label") ||
        document.querySelector(`label[for="${radio.id}"]`);
      if (label) {
        const span = label.querySelector("span:last-child");
        const labelText = span
          ? span.textContent.trim().toLowerCase()
          : label.textContent.trim().toLowerCase();

        if (
          this.matchesValue(answerLower, labelText, radio.value.toLowerCase())
        ) {
          this.scrollToElement(radio);
          radio.click();
          return;
        }
      }
    }

    return;
  }

  async handleCheckboxGroupField(field, answer) {
    if (!Array.isArray(field.element)) return;

    // Handle array response from getMultiSelectAnswer or comma-separated string
    let answerValues = [];
    if (Array.isArray(answer)) {
      answerValues = answer.map((v) => String(v).trim().toLowerCase());
    } else if (typeof answer === "string") {
      answerValues = answer.split(",").map((v) => v.trim().toLowerCase());
    }

    for (const checkbox of field.element) {
      const label =
        checkbox.closest("label") ||
        document.querySelector(`label[for="${checkbox.id}"]`);

      if (label) {
        const span = label.querySelector("span:last-child");
        const labelText = span
          ? span.textContent.trim().toLowerCase()
          : label.textContent.trim().toLowerCase();

        // Check if any of the answer values match this checkbox option
        const shouldCheck = answerValues.some(answerValue =>
          this.matchesValue(answerValue, labelText, checkbox.value.toLowerCase())
        );

        if (shouldCheck && !checkbox.checked) {
          this.scrollToElement(checkbox);
          // Click the label for better interaction with Recruitee's styled checkboxes
          label.click();
          await this.delay(200);
        }
      }
    }
  }

  async handleSelectField(field, answer) {
    const select = field.element;
    const answerLower = answer.toLowerCase();

    this.scrollToElement(select);
    select.focus();
    await this.delay(200);

    let optionSelected = false;
    const options = Array.from(select.options);

    for (const option of options) {
      const optionText = option.textContent.trim().toLowerCase();
      const optionValue = option.value.toLowerCase();

      if (this.matchesValue(answerLower, optionText, optionValue)) {
        option.selected = true;
        optionSelected = true;
        break;
      }
    }

    if (!optionSelected && options.length > 1) {
      // Select first non-empty option
      for (const option of options) {
        if (option.value && option.value !== "" && option.value !== "null") {
          option.selected = true;
          optionSelected = true;
          break;
        }
      }
    }

    if (optionSelected) {
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await this.delay(200);
    }
  }

  async handlePhoneField(field) {
    const phoneInput = field.element;

    const countryCode =
      this.userData.phoneCountryCode || this.userData.phoneCode || "+1";
    const phoneNumber =
      this.userData.phoneNumber || this.userData.phone || "";

    if (!phoneNumber) {
      return;
    }

    // Normalize: strip all non-digit chars (except leading +) for comparison
    const cleanCode = countryCode.replace(/[^0-9]/g, "");
    let cleanNumber = phoneNumber.replace(/[^0-9]/g, "");

    // Prevent double country code: if the phone number already starts with
    // the country code digits, strip it to avoid e.g. +1+15551234567
    if (cleanNumber.startsWith(cleanCode)) {
      cleanNumber = cleanNumber.slice(cleanCode.length);
    }

    // Remove leading zeros (some formats like 0XXX for local numbers)
    cleanNumber = cleanNumber.replace(/^0+/, "");

    const formattedPhone = `+${cleanCode}${cleanNumber}`;

    await this.fillInputField(phoneInput, formattedPhone);
  }

  async handleTextareaField(field, answer) {
    await this.fillInputField(field.element, answer);
  }

  async handleNumberField(field, answer) {
    // Extract numbers from answer
    const numericValue = answer.toString().replace(/[^\d.]/g, "");
    await this.fillInputField(field.element, numericValue);
  }

  async handleTextInput(field, answer) {
    await this.fillInputField(field.element, answer);
  }

  async handleCheckboxField(field, answer) {
    const checkbox = field.element;
    const shouldCheck = this.shouldCheckValue(answer);

    if (
      (shouldCheck && !checkbox.checked) ||
      (!shouldCheck && checkbox.checked)
    ) {
      this.scrollToElement(checkbox);

      const labelEl =
        checkbox.closest("label") ||
        document.querySelector(`label[for="${checkbox.id}"]`);
      if (labelEl) {
        labelEl.click();
      } else {
        checkbox.click();
      }

      await this.delay(200);
    }
  }

  async fillInputField(element, value) {
    try {
      this.scrollToElement(element);
      element.focus();
      await this.delay(100);

      // Clear field first
      element.value = "";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      await this.delay(50);

      // Set new value
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true }));

      await this.delay(100);
      return true;
    } catch (error) {
      return false;
    }
  }

  async handleRequiredCheckboxes(form) {
    try {
      const requiredCheckboxes = form.querySelectorAll(
        'input[type="checkbox"][required], input[type="checkbox"][aria-required="true"]'
      );

      for (const checkbox of requiredCheckboxes) {
        if (!this.isElementVisible(checkbox)) continue;

        const label = this.getInputLabel(checkbox);
        const isAgreement = this.isAgreementCheckbox(label);

        if (isAgreement || checkbox.required) {
          await this.handleCheckboxField({ element: checkbox, label }, true);
          await this.delay(200);
        }
      }
    } catch (error) {
      return;
    }
  }

  findSubmitButton(form) {
    const submitSelectors = [
      'button[type="submit"]',
      'button[data-testid="submit-application-form-button"]',
      'input[type="submit"]',
      "button.btn-primary",
      "button.submit-button",
    ];

    for (const selector of submitSelectors) {
      const button = form.querySelector(selector);
      if (button && this.isElementVisible(button) && !button.disabled) {
        return button;
      }
    }

    // Look for buttons with submit-like text
    const allButtons = form.querySelectorAll("button");
    for (const btn of allButtons) {
      if (!this.isElementVisible(btn) || btn.disabled) continue;

      const text = btn.textContent.toLowerCase();
      if (
        text.includes("submit") ||
        text.includes("send") ||
        text.includes("apply")
      ) {
        return btn;
      }
    }

    return null;
  }

  async getAnswer(label, options = [], fieldType = "text", retryCount = 0) {
    const normalizedLabel = label?.toLowerCase()?.trim() || "";

    if (this.answerCache.has(normalizedLabel)) {
      return this.answerCache.get(normalizedLabel);
    }

    try {
      // Map Recruitee field types to standard field types for AI service
      const mappedFieldType = fieldType === "checkbox-group" ? "checkbox-group"
        : fieldType === "number" ? "number"
        : fieldType === "textarea" ? "textarea"
        : fieldType === "select" ? "select"
        : fieldType === "radio" ? "radio"
        : fieldType === "phone" ? "phone"
        : "text";

      // Use standardized AI service method with specialized routing (same as other platforms)
      const context = {
        platform: "recruitee",
        userData: this.userData,
        jobDescription: this.jobDescription || this.scrapeJobDescription(),
        fieldType: mappedFieldType,
        fieldContext: `Recruitee application form field`,
        required: false
      };

      let answer;

      // Use specialized AI service methods based on field type and context (same as other platforms)
      // Salary detection takes priority - salary dropdowns should go to salary endpoint with options
      if (AIResponseUtils.isSalaryField(label)) {
        answer = await this.aiService.getSalaryAnswer(label, options, context);
      } else if (options && options.length > 0) {
        answer = await this.aiService.getOptionAnswer(label, options, context);
      } else if (label.toLowerCase().includes('describe') ||
                 label.toLowerCase().includes('why') ||
                 label.toLowerCase().includes('cover letter') ||
                 label.toLowerCase().includes('textarea')) {
        answer = await this.aiService.getLongformAnswer(label, options, context);
      } else {
        answer = await this.aiService.getNormalAnswer(label, options, context);
      }

      if (answer === null || answer === undefined || answer === "" || String(answer).trim() === "") {
        if (retryCount < 2) {
          await new Promise(resolve => setTimeout(resolve, 1000 + (retryCount * 500)));
          
          const retryContext = {
            ...context,
            fieldContext: context.fieldContext + ` (This field requires an answer. Please provide a response based on the user profile.)`
          };
          
          let retryAnswer;
          if (AIResponseUtils.isSalaryField(label)) {
            retryAnswer = await this.aiService.getSalaryAnswer(label, options, retryContext);
          } else if (options && options.length > 0) {
            retryAnswer = await this.aiService.getOptionAnswer(label, options, retryContext);
          } else if (label.toLowerCase().includes('describe') ||
                     label.toLowerCase().includes('why') ||
                     label.toLowerCase().includes('cover letter') ||
                     label.toLowerCase().includes('textarea')) {
            retryAnswer = await this.aiService.getLongformAnswer(label, options, retryContext);
          } else {
            retryAnswer = await this.aiService.getNormalAnswer(label, options, retryContext);
          }
          
          if ((retryAnswer === null || retryAnswer === undefined || retryAnswer === "" || String(retryAnswer).trim() === "") && retryCount < 1) {
            return await this.getAnswer(label, options, fieldType, retryCount + 1);
          }   
          
          if (retryAnswer !== null && retryAnswer !== undefined && String(retryAnswer).trim() !== "") {
            const cleanedRetryAnswer = retryAnswer.replace(/["*\-]/g, "");
            this.answerCache.set(normalizedLabel, cleanedRetryAnswer);
            return cleanedRetryAnswer;
          }
        }
        
        return null;
      }

      const cleanedAnswer = answer.replace(/["*\-]/g, "");
      this.answerCache.set(normalizedLabel, cleanedAnswer);
      return cleanedAnswer;
    } catch (error) {
      // Retry on error if we haven't exceeded retry limit
      if (retryCount < 2) {
        await new Promise(resolve => setTimeout(resolve, 1000 + (retryCount * 500)));
        return await this.getAnswer(label, options, fieldType, retryCount + 1);
      }

      throw error;
    }
  }

  scrapeJobDescription() {
    try {
      const descriptionSelectors = [
        ".job-description",
        '[data-testid="job-description"]',
        ".description",
        '[class*="description"]',
      ];

      for (const selector of descriptionSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          return element.textContent.trim().substring(0, 500);
        }
      }

      return "No job description found";
    } catch (error) {
      return "No job description found";
    }
  }

  // Helper methods
  cleanLabelText(text) {
    if (!text) return "";
    return text
      .replace(/[*✱]/g, "")
      .replace(/\s+/g, " ")
      .replace(/^\s+|\s+$/g, "")
      .replace(/\(required\)/i, "")
      .replace(/\(optional\)/i, "")
      .trim();
  }

  isRequiredByText(text) {
    return (
      text.includes("*") ||
      text.includes("✱") ||
      text.toLowerCase().includes("required")
    );
  }

  isAgreementCheckbox(label) {
    if (!label) return false;
    const lowerLabel = label.toLowerCase();
    const agreementTerms = [
      "agree",
      "accept",
      "consent",
      "terms",
      "privacy",
      "policy",
    ];
    return agreementTerms.some((term) => lowerLabel.includes(term));
  }

  shouldCheckValue(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const lowerValue = value.toLowerCase().trim();
      return (
        lowerValue === "true" ||
        lowerValue === "yes" ||
        lowerValue === "on" ||
        lowerValue === "1"
      );
    }
    if (typeof value === "number") return value === 1;
    return false;
  }

  matchesValue(aiValue, optionText, optionValue) {
    if (aiValue === optionText || aiValue === optionValue) return true;
    if (optionText.includes(aiValue) || aiValue.includes(optionText))
      return true;
    if (optionValue.includes(aiValue) || aiValue.includes(optionValue))
      return true;

    // Special cases for yes/no
    if (
      (aiValue === "yes" || aiValue === "true") &&
      (optionText === "yes" || optionValue === "yes")
    )
      return true;
    if (
      (aiValue === "no" || aiValue === "false") &&
      (optionText === "no" || optionValue === "no")
    )
      return true;

    return false;
  }

  deduplicateFields(fields) {
    const uniqueFields = [];
    const seenLabels = new Set();

    for (const field of fields) {
      const labelKey = `${field.type}:${field.label.toLowerCase()}`;
      if (!seenLabels.has(labelKey)) {
        seenLabels.add(labelKey);
        uniqueFields.push(field);
      }
    }

    return uniqueFields;
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

  scrollToElement(element) {
    if (!element) return;
    try {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      // Silent fail
    }
  }

  async clickElementReliably(element) {
    const strategies = [
      () => element.click(),
      () =>
        element.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true })
        ),
      () => {
        element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      },
    ];

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    await this.delay(500);

    for (const strategy of strategies) {
      try {
        strategy();
        await this.delay(1000);
        return true;
      } catch (error) {
        continue;
      }
    }

    throw new Error("All click strategies failed");
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
