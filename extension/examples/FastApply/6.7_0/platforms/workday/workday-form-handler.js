// platforms/workday/workday-form-handler.js

import { notifyStatus } from "../../utils/status-helper.js";
import { AIService } from "../../services/index.js";

/**
 * WorkdayFormHandler - Multi-step form automation for Workday
 * Handles form field extraction, AI-powered answering, and form filling
 */

// Step types based on Workday progress bar labels
const StepType = {
  CREATE_ACCOUNT_SIGN_IN: "CREATE_ACCOUNT_SIGN_IN",
  AUTOFILL_WITH_RESUME: "AUTOFILL_WITH_RESUME",
  MY_INFORMATION: "MY_INFORMATION",
  MY_EXPERIENCE: "MY_EXPERIENCE",
  APPLICATION_QUESTIONS: "APPLICATION_QUESTIONS",
  VOLUNTARY_DISCLOSURES: "VOLUNTARY_DISCLOSURES",
  SELF_IDENTIFY: "SELF_IDENTIFY",
  REVIEW: "REVIEW",
  SUCCESS: "SUCCESS",
  UNKNOWN: "UNKNOWN",
};

export class WorkdayFormHandler {
  constructor(config = {}) {
    // API configuration
    this.backendApiHost = config.backendApiHost;
    this.aiApiHost = config.aiApiHost;
    this.jwtToken = config.jwtToken;

    this.aiService = new AIService({
      aiApiHost: config.aiApiHost,
      platform: "workday",
    });

    // User data
    this.userData = config.userData || {};
    this.userPreferences = config.userPreferences || {};

    // Job context
    this.jobDescription = config.jobDescription || "";
    this.jobTitle = config.jobTitle || "";

    // File handler
    this.fileHandler = config.fileHandler || null;

    // Co-pilot mode
    this.copilotMode = config.copilotMode || false;
    this.userActionResolver = null;

    // Step tracking
    this.maxSteps = 20;
    this.currentStepCount = 0;
    this.lastStepLabel = "";

    console.log("✅ WorkdayFormHandler initialized");
  }

  // ========================================
  // STEP DETECTION
  // ========================================

  /**
   * Detect current step from Workday's progress bar
   */
  detectStepFromProgressBar() {
    // First, check if we're on a sign-in page (regardless of progress bar)
    if (this.isSignInPage()) {
      console.log("📍 Detected sign-in page via page content");
      return StepType.CREATE_ACCOUNT_SIGN_IN;
    }

    // Look for the active step in progress bar
    const activeStep = document.querySelector(
      '[data-automation-id="progressBarActiveStep"]'
    );

    if (activeStep) {
      // Get the label for this step
      const stepLabel = activeStep.querySelector(".css-1uso8fp, .css-1u51z1n");
      const labelText = stepLabel?.textContent?.trim().toLowerCase() || "";

      console.log(`📍 Active step label: "${labelText}"`);
      this.lastStepLabel = labelText;

      // Map label to step type
      if (
        labelText.includes("create account") ||
        labelText.includes("sign in")
      ) {
        return StepType.CREATE_ACCOUNT_SIGN_IN;
      }
      if (labelText.includes("autofill") || labelText.includes("resume")) {
        return StepType.AUTOFILL_WITH_RESUME;
      }
      if (
        labelText.includes("my information") ||
        labelText.includes("information")
      ) {
        return StepType.MY_INFORMATION;
      }
      if (
        labelText.includes("my experience") ||
        labelText.includes("experience")
      ) {
        return StepType.MY_EXPERIENCE;
      }
      if (labelText.includes("application question")) {
        return StepType.APPLICATION_QUESTIONS;
      }
      if (labelText.includes("voluntary") || labelText.includes("disclosure")) {
        return StepType.VOLUNTARY_DISCLOSURES;
      }
      if (
        labelText.includes("self identify") ||
        labelText.includes("self-identify")
      ) {
        return StepType.SELF_IDENTIFY;
      }
      if (labelText.includes("review")) {
        return StepType.REVIEW;
      }
    }

    // Check for success page
    if (this.isSuccessPage()) {
      return StepType.SUCCESS;
    }

    // Check page content for clues
    const pageTitle = document.querySelector(
      '[data-automation-id="pageHeaderSubtitle"]'
    );
    if (pageTitle) {
      const titleText = pageTitle.textContent?.toLowerCase() || "";
      if (titleText.includes("autofill")) return StepType.AUTOFILL_WITH_RESUME;
      if (titleText.includes("information")) return StepType.MY_INFORMATION;
    }

    return StepType.UNKNOWN;
  }

  /**
   * Check if we're on a success/confirmation page
   */
  isSuccessPage() {
    // Look for success indicators
    const successSelectors = [
      '[data-automation-id="applicationSubmitted"]',
      '[data-automation-id="thankYouMessage"]',
      ".css-success-message",
    ];

    for (const selector of successSelectors) {
      if (document.querySelector(selector)) {
        return true;
      }
    }

    // Check page text
    const bodyText = document.body.innerText.toLowerCase();
    if (
      bodyText.includes("application submitted") ||
      bodyText.includes("thank you for applying") ||
      bodyText.includes("application has been received")
    ) {
      return true;
    }

    return false;
  }

  /**
   * Check if we're on an error page (job doesn't exist, expired, etc.)
   * Returns an object with { isError: boolean, message: string }
   */
  isErrorPage() {
    // Check for Workday error container
    const errorContainer = document.querySelector('[data-automation-id="errorContainer"]');
    if (errorContainer) {
      const errorMessage = errorContainer.querySelector('[data-automation-id="errorMessage"]');
      const message = errorMessage?.textContent?.trim() || "Unknown error";
      console.log(`❌ Error page detected: "${message}"`);
      return { isError: true, message };
    }

    // Check for "Search for Jobs" button which appears on error pages
    const searchJobsButton = document.querySelector('[data-automation-id="searchForJobsButton"]');
    if (searchJobsButton) {
      const bodyText = document.body.innerText.toLowerCase();
      if (bodyText.includes("doesn't exist") ||
          bodyText.includes("does not exist") ||
          bodyText.includes("page not found") ||
          bodyText.includes("no longer available") ||
          bodyText.includes("job has been filled") ||
          bodyText.includes("position has been filled") ||
          bodyText.includes("expired")) {
        console.log("❌ Error page detected via search button + error text");
        return { isError: true, message: "Job posting not found or no longer available" };
      }
    }

    // Check for common error text patterns
    const bodyText = document.body.innerText.toLowerCase();
    const errorPatterns = [
      "the page you are looking for doesn't exist",
      "the page you are looking for does not exist",
      "this job posting is no longer available",
      "this position has been filled",
      "this job has expired",
      "job not found",
      "posting not found",
    ];

    for (const pattern of errorPatterns) {
      if (bodyText.includes(pattern)) {
        console.log(`❌ Error page detected via text pattern: "${pattern}"`);
        return { isError: true, message: pattern };
      }
    }

    return { isError: false, message: "" };
  }

  /**
   * Check if we're on a sign-in/create account page
   */
  isSignInPage() {
    // Check for sign-in content container
    const signInSelectors = [
      '[data-automation-id="signInContent"]',
      '[data-automation-id="signInPage"]',
      '[data-automation-id="createAccountLink"]',
      '[data-automation-id="signInLink"]',
      '[data-automation-id="SignInWithEmailButton"]',
      '[data-automation-id="googleSignInButton"]',
      '[data-automation-id="appleSignInButton"]',
      '[data-automation-id="linkedinSignInButton"]',
    ];

    for (const selector of signInSelectors) {
      if (document.querySelector(selector)) {
        console.log(`🔐 Sign-in page detected via: ${selector}`);
        return true;
      }
    }

    // Check for auth page title
    const authTitle = document.querySelector("#authViewTitle");
    if (authTitle) {
      const titleText = authTitle.textContent?.toLowerCase() || "";
      if (
        titleText.includes("sign in") ||
        titleText.includes("create account") ||
        titleText.includes("log in")
      ) {
        console.log(`🔐 Sign-in page detected via auth title: "${titleText}"`);
        return true;
      }
    }

    // Check for password field (strong indicator of sign-in page)
    const passwordField = document.querySelector(
      'input[type="password"], [data-automation-id="password"]'
    );
    if (passwordField && !this.isElementHidden(passwordField)) {
      console.log("🔐 Sign-in page detected via password field");
      return true;
    }

    return false;
  }

  /**
   * Wait for user to complete sign-in
   */
  async waitForSignInCompletion() {
    console.log("⏳ Waiting for user to complete sign-in...");

    notifyStatus({
      type: "LOGIN_REQUIRED",
      data: {
        message: "Please sign in or create a Workday account to continue your application.",
        action: "Sign in to continue",
      },
    });

    // Poll until sign-in page elements disappear
    const maxWaitTime = 300000; // 5 minutes
    const pollInterval = 2000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      await this.sleep(pollInterval);

      // Check if we're still on sign-in page
      if (!this.isSignInPage()) {
        console.log("✅ Sign-in completed by user");
        notifyStatus({
          type: "AUTOMATION_RESUMED",
          data: { message: "Sign-in completed, continuing application..." },
        });
        // Additional wait for page to fully load after sign-in
        await this.sleep(2000);
        return true;
      }
    }

    console.warn("⚠️ Sign-in timeout - user may need more time");
    return false;
  }

  // ========================================
  // FIELD EXTRACTION
  // ========================================

  /**
   * Extract all form fields from the current page
   */
  extractFormFields() {
    console.log("🔍 Extracting form fields...");
    const fields = [];

    // Find the main form container
    const form =
      document.querySelector(
        '[data-automation-id="applyFlowPage"], [data-automation-id="formContent"], form'
      ) || document.body;

    // 1. Text inputs
    const textInputs = form.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input:not([type])'
    );
    textInputs.forEach((input) => {
      if (this.isElementHidden(input)) return;
      if (input.type === "hidden" || input.type === "file") return;

      const field = this.extractFieldInfo(input, "text");
      if (field) fields.push(field);
    });

    // 2. Textareas
    const textareas = form.querySelectorAll("textarea");
    textareas.forEach((textarea) => {
      if (this.isElementHidden(textarea)) return;
      const field = this.extractFieldInfo(textarea, "textarea");
      if (field) fields.push(field);
    });

    // 3. Select dropdowns
    const selects = form.querySelectorAll("select");
    selects.forEach((select) => {
      if (this.isElementHidden(select)) return;
      const field = this.extractFieldInfo(select, "select");
      if (field) {
        field.options = Array.from(select.options).map((opt) => ({
          value: opt.value,
          text: opt.textContent.trim(),
        }));
        fields.push(field);
      }
    });

    // 4. Workday custom dropdowns (data-automation-id="selectWidget")
    const customDropdowns = form.querySelectorAll(
      '[data-automation-id="selectWidget"]'
    );
    customDropdowns.forEach((dropdown) => {
      if (this.isElementHidden(dropdown)) return;
      const field = this.extractWorkdayDropdownInfo(dropdown);
      if (field) fields.push(field);
    });

    // 5. Workday multi-select fields (data-uxi-widget-type="multiselect")
    const multiSelects = form.querySelectorAll(
      '[data-uxi-widget-type="multiselect"], [data-automation-id="multiSelectContainer"]'
    );
    multiSelects.forEach((multiSelect) => {
      if (this.isElementHidden(multiSelect)) return;
      const field = this.extractWorkdayMultiSelectInfo(multiSelect);
      if (field) fields.push(field);
    });

    // 5. Radio button groups
    const radioGroups = new Map();
    const radios = form.querySelectorAll('input[type="radio"]');
    radios.forEach((radio) => {
      if (this.isElementHidden(radio)) return;
      const name = radio.name || radio.getAttribute("data-automation-id");
      if (!name) return;
      if (!radioGroups.has(name)) {
        radioGroups.set(name, []);
      }
      radioGroups.get(name).push(radio);
    });

    radioGroups.forEach((radios, name) => {
      const question = this.findQuestionForRadioGroup(radios);
      const options = radios.map((r) => ({
        value: r.value,
        text: this.getRadioOptionLabel(r),
        element: r,
      }));

      fields.push({
        type: "radio-group",
        name: name,
        label: question,
        element: radios[0],
        options: options,
        disabled: radios[0].disabled,
      });
    });

    // 6. Checkboxes
    const checkboxes = form.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
      if (this.isElementHidden(checkbox)) return;
      const field = this.extractFieldInfo(checkbox, "checkbox");
      if (field) fields.push(field);
    });

    console.log(`📋 Found ${fields.length} fields`);
    return fields;
  }

  /**
   * Extract info for a single field element
   */
  extractFieldInfo(element, type) {
    if (!element) return null;

    const label = this.getLabelText(element);
    const automationId = element.getAttribute("data-automation-id") || "";

    return {
      type: type,
      element: element,
      label: label,
      placeholder: element.placeholder || "",
      name: element.name || element.id || automationId,
      id: element.id,
      automationId: automationId,
      value: element.value || "",
      disabled: element.disabled,
      required: element.required || element.hasAttribute("aria-required"),
    };
  }

  /**
   * Extract info for Workday custom dropdown
   */
  extractWorkdayDropdownInfo(dropdown) {
    const button = dropdown.querySelector("button");
    const label = this.getLabelText(dropdown) || this.getLabelText(button);
    const automationId = dropdown.getAttribute("data-automation-id") || "";

    // Get current value
    const selectedText = button?.textContent?.trim() || "";

    return {
      type: "workday-dropdown",
      element: dropdown,
      label: label,
      name: automationId,
      automationId: automationId,
      value: selectedText,
      disabled: button?.disabled,
    };
  }

  /**
   * Extract info for Workday multi-select field
   * These are searchable dropdowns with checkbox-style selection
   */
  extractWorkdayMultiSelectInfo(multiSelect) {
    const automationId =
      multiSelect.getAttribute("data-automation-id") ||
      multiSelect.getAttribute("data-uxi-element-id") ||
      "";

    // Get label from form field container or input
    const formField = multiSelect.closest('[data-automation-id^="formField"]');
    let label = "";
    if (formField) {
      const labelEl = formField.querySelector("label");
      if (labelEl) label = labelEl.textContent.trim();
    }

    // Fallback to input's aria or id
    if (!label) {
      const input = multiSelect.querySelector(
        '[data-automation-id="searchBox"], input[type="text"]'
      );
      if (input) {
        label =
          input.getAttribute("aria-label") ||
          input.id?.replace(/--/g, " ").replace(/-/g, " ") ||
          "";
      }
    }

    // Get the input element for interaction
    const inputElement = multiSelect.querySelector(
      '[data-automation-id="searchBox"], input[type="text"]'
    );

    // Check if already expanded (options visible)
    const isExpanded =
      multiSelect.querySelector('[data-automation-id="activeListContainer"]') !==
      null;

    return {
      type: "workday-multiselect",
      element: multiSelect,
      inputElement: inputElement,
      label: label,
      name: automationId,
      automationId: automationId,
      value: "", // Will be populated when expanded
      disabled: inputElement?.disabled,
      isExpanded: isExpanded,
    };
  }

  /**
   * Get label text for an element
   */
  getLabelText(element) {
    if (!element) return "";

    // 1. Check for Workday's form field label
    const formField = element.closest('[data-automation-id^="formField"]');
    if (formField) {
      const label = formField.querySelector("label");
      if (label) return label.textContent.trim();
    }

    // 2. Check for label with for attribute
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) return label.textContent.trim();
    }

    // 3. Check parent label
    const parentLabel = element.closest("label");
    if (parentLabel) {
      return parentLabel.textContent.trim();
    }

    // 4. Check aria-label
    if (element.getAttribute("aria-label")) {
      return element.getAttribute("aria-label").trim();
    }

    // 5. Check data-automation-id for hint
    const automationId = element.getAttribute("data-automation-id") || "";
    if (automationId) {
      // Convert camelCase or kebab-case to readable text
      return automationId
        .replace(/([A-Z])/g, " $1")
        .replace(/-/g, " ")
        .trim();
    }

    return element.placeholder || "";
  }

  /**
   * Find question for radio group
   */
  findQuestionForRadioGroup(radios) {
    const firstRadio = radios[0];

    // Look for Workday question container
    const container = firstRadio.closest('[data-automation-id^="formField"]');
    if (container) {
      const label = container.querySelector("label");
      if (label) return label.textContent.trim();
    }

    // Fallback to fieldset legend
    const fieldset = firstRadio.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend) return legend.textContent.trim();
    }

    return firstRadio.name || "Unknown question";
  }

  /**
   * Get label for radio option
   */
  getRadioOptionLabel(radio) {
    // Check for label with for attribute
    if (radio.id) {
      const label = document.querySelector(`label[for="${radio.id}"]`);
      if (label) return label.textContent.trim();
    }

    // Check parent label
    const parentLabel = radio.closest("label");
    if (parentLabel) {
      return parentLabel.textContent.trim().replace(/\s+/g, " ");
    }

    return radio.value || "Unknown";
  }

  /**
   * Check if element is hidden
   */
  isElementHidden(element) {
    if (!element) return true;

    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return true;
    }

    // Check for Workday hidden patterns
    if (
      element.hasAttribute("hidden") ||
      element.getAttribute("aria-hidden") === "true"
    ) {
      return true;
    }

    return false;
  }

  // ========================================
  // AI INTEGRATION
  // ========================================

  /**
   * Fields that should be skipped entirely (not filled, no AI)
   */
  shouldSkipField(field) {
    const label = (field.label || "").toLowerCase();
    const name = (field.name || "").toLowerCase();
    const id = (field.id || "").toLowerCase();

    // Skip Phone Extension
    if (label.includes("extension") || name.includes("extension") || id.includes("extension")) {
      console.log(`⏭️ Skipping field (extension): "${field.label}"`);
      return true;
    }

    return false;
  }

  /**
   * Fields that are handled directly from user profile (no AI needed)
   * Returns true if this field is already handled by prefillFromUserProfile or handleWorkdayDropdowns
   */
  isDirectlyMappedField(field) {
    const label = (field.label || "").toLowerCase();
    const name = (field.name || "").toLowerCase();
    const id = (field.id || "").toLowerCase();
    const automationId = (field.automationId || "").toLowerCase();

    // Fields handled by prefillFromUserProfile
    const directTextFields = [
      "given name", "first name", "firstname",
      "family name", "last name", "lastname",
      "address line 1", "addressline1", "street",
      "city", "town",
      "postal code", "postalcode", "zip",
      "phone number", "phonenumber",
      "email",
    ];

    for (const pattern of directTextFields) {
      if (label.includes(pattern) || name.includes(pattern) || id.includes(pattern)) {
        return true;
      }
    }

    // Fields handled by handleWorkdayDropdowns
    const directDropdownFields = [
      "country",
      "phone device type", "phonetype",
      "country phone code", "countryphonecode",
      "county", "state", "region", "countryregion",
    ];

    for (const pattern of directDropdownFields) {
      if (label.includes(pattern) || name.includes(pattern) || automationId.includes(pattern)) {
        return true;
      }
    }

    // Fields handled by handleSourceMultiSelect
    if (label.includes("how did you hear") || label.includes("source") ||
        name.includes("source") || automationId.includes("source")) {
      return true;
    }

    // Fields handled by handlePreviousWorkerQuestion
    if (label.includes("previous worker") || label.includes("worked") ||
        name.includes("previousworker") || automationId.includes("previousworker")) {
      return true;
    }

    return false;
  }

  /**
   * Get AI answers for fields
   * Only asks AI for fields that aren't handled directly
   */
  async getAIAnswers(fields) {
    console.log("🤖 Getting AI answers for fields...");

    const answers = {};
    let aiFieldCount = 0;

    for (const field of fields) {
      if (field.disabled) continue;

      // Skip fields that should be skipped entirely
      if (this.shouldSkipField(field)) {
        continue;
      }

      // Skip fields that are handled directly from user profile
      if (this.isDirectlyMappedField(field)) {
        console.log(`⏭️ Skipping directly-mapped field: "${field.label}"`);
        continue;
      }

      // Skip multi-select fields - they're handled specially during fill
      // because options are only available after clicking to expand
      if (field.type === "workday-multiselect") {
        console.log(`⏭️ Skipping multi-select field (handled during fill): "${field.label}"`);
        continue;
      }

      const fieldKey = field.id || field.name || field.label;
      const question = field.label || field.placeholder || field.name || "";

      if (!question) continue;

      aiFieldCount++;
      console.log(`🔄 Processing with AI: "${question}" (${field.type})`);

      // Show status for AI processing
      notifyStatus({ type: "WAITING_FOR_RESPONSE", data: { field: question } });

      try {
        let answer = null;
        const context = {
          userData: this.userData,
          jobDescription: this.jobDescription,
          fieldType: field.type,
          required: field.required,
        };

        if (
          field.type === "select" ||
          field.type === "radio-group" ||
          field.type === "workday-dropdown"
        ) {
          const optionTexts =
            field.options?.map((o) => o.text || o.value) || [];
          if (optionTexts.length > 0) {
            answer = await this.aiService.getOptionAnswer(
              question,
              optionTexts,
              context
            );
          }
        } else if (field.type === "textarea") {
          answer = await this.aiService.getLongformAnswer(
            question,
            [],
            context
          );
        } else if (field.type === "checkbox") {
          answer = await this.aiService.getOptionAnswer(
            question,
            ["Yes", "No"],
            context
          );
        } else {
          answer = await this.aiService.getNormalAnswer(question, [], context);
        }

        if (answer) {
          answers[fieldKey] = answer;
          console.log(`✅ AI Answer: "${question}" → "${answer}"`);
        }
      } catch (error) {
        console.error(`❌ AI error for "${question}":`, error.message);
      }
    }

    console.log(`🤖 Processed ${aiFieldCount} fields with AI`);
    return answers;
  }

  /**
   * Get OFCCP/EEO default answers
   */
  getOFCCPAnswer(label, options) {
    const l = label.toLowerCase();

    // Common OFCCP questions - default to "Decline" options
    const declinePatterns = [
      "decline",
      "prefer not",
      "do not wish",
      "choose not",
      "i don't wish",
    ];

    if (
      l.includes("gender") ||
      l.includes("race") ||
      l.includes("ethnicity") ||
      l.includes("veteran") ||
      l.includes("disability") ||
      l.includes("hispanic") ||
      l.includes("latino")
    ) {
      // Find a "decline" option
      for (const option of options || []) {
        const optText = (option.text || option).toLowerCase();
        if (declinePatterns.some((p) => optText.includes(p))) {
          return option.text || option;
        }
      }
    }

    return null;
  }

  // ========================================
  // FIELD FILLING
  // ========================================

  /**
   * Fill fields with answers
   * Note: Status should be shown BEFORE calling this method (status-first pattern)
   */
  async fillFields(fields, answers) {
    console.log("📝 Filling form fields...");
    // Status already shown by caller

    let filledCount = 0;

    for (const field of fields) {
      if (field.disabled) continue;

      const fieldKey = field.id || field.name || field.label;
      let answer = answers[fieldKey];

      // Try matching by label
      if (!answer) {
        const match = Object.entries(answers).find(
          ([key]) =>
            key.toLowerCase().includes(field.label?.toLowerCase() || "") ||
            field.label?.toLowerCase().includes(key.toLowerCase())
        );
        if (match) answer = match[1];
      }

      // Multi-select fields are handled specially even without pre-computed answer
      // because they extract options and call AI during the fill process
      if (answer || field.type === "workday-multiselect") {
        const success = await this.fillSingleField(field, answer);
        if (success) {
          filledCount++;
          // Human-like delay between fields to avoid captcha (300-800ms)
          await this.sleep(300 + Math.random() * 500);
        }
      }
    }

    // Delay after filling section (800-1500ms)
    await this.sleep(800 + Math.random() * 700);

    console.log(`✅ Filled ${filledCount} of ${fields.length} fields`);
    return filledCount;
  }

  /**
   * Fill a single field
   */
  async fillSingleField(field, value) {
    const element = field.element;
    if (!element) return false;

    try {
      console.log(`📝 Filling "${field.label || field.name}": "${value}"`);

      switch (field.type) {
        case "text":
        case "textarea":
          element.focus();
          element.value = "";
          // Type character by character for React
          for (const char of value) {
            element.value += char;
            element.dispatchEvent(new Event("input", { bubbles: true }));
          }
          element.dispatchEvent(new Event("change", { bubbles: true }));
          element.dispatchEvent(new Event("blur", { bubbles: true }));
          break;

        case "select":
          const option = field.options?.find(
            (o) =>
              o.value === value ||
              o.text === value ||
              o.text.toLowerCase().includes(value.toLowerCase()) ||
              value.toLowerCase().includes(o.text.toLowerCase())
          );
          if (option) {
            element.value = option.value;
            element.dispatchEvent(new Event("change", { bubbles: true }));
          }
          break;

        case "workday-dropdown":
          await this.selectWorkdayDropdownOption(element, value);
          break;

        case "workday-multiselect":
          await this.selectWorkdayMultiSelectOption(field, value);
          break;

        case "radio-group":
          const matchingRadio = field.options?.find(
            (o) =>
              o.value === value ||
              o.text.toLowerCase().includes(value.toLowerCase()) ||
              value.toLowerCase().includes(o.text.toLowerCase())
          );
          if (matchingRadio?.element) {
            matchingRadio.element.click();
          }
          break;

        case "checkbox":
          const shouldCheck =
            value === true ||
            value === "true" ||
            value.toLowerCase() === "yes" ||
            value === "1";
          if (element.checked !== shouldCheck) {
            element.click();
          }
          break;

        default:
          console.log(`⚠️ Unknown field type: ${field.type}`);
          return false;
      }

      await this.sleep(100);
      return true;
    } catch (error) {
      console.error(`❌ Fill error for "${field.label}":`, error);
      return false;
    }
  }

  /**
   * Select option in Workday's custom dropdown
   */
  async selectWorkdayDropdownOption(dropdown, value) {
    // Click to open dropdown
    const button = dropdown.querySelector("button");
    if (button) {
      button.click();
      await this.sleep(500);
    }

    // Find and click the matching option
    const options = document.querySelectorAll(
      '[data-automation-id="promptOption"]'
    );
    for (const option of options) {
      const optionText = option.textContent.trim();
      if (
        optionText === value ||
        optionText.toLowerCase().includes(value.toLowerCase()) ||
        value.toLowerCase().includes(optionText.toLowerCase())
      ) {
        option.click();
        await this.sleep(300);
        return;
      }
    }

    // Close dropdown if no match
    document.body.click();
  }

  /**
   * Select option in Workday's multi-select field
   * This handles the multiSelectContainer widget which requires:
   * 1. Clicking the input to expand options
   * 2. Extracting all available options
   * 3. Finding and clicking the matching option
   */
  async selectWorkdayMultiSelectOption(field, value) {
    const multiSelect = field.element;
    const inputElement =
      field.inputElement ||
      multiSelect.querySelector(
        '[data-automation-id="searchBox"], input[type="text"]'
      );

    if (!inputElement) {
      console.warn("⚠️ Multi-select input not found");
      return;
    }

    console.log(`🔽 Opening multi-select for: "${field.label}"`);

    // Step 1: Click to expand the dropdown if not already expanded
    inputElement.scrollIntoView({ behavior: "smooth", block: "center" });
    await this.sleep(300);
    inputElement.focus();
    inputElement.click();
    await this.sleep(600);

    // Step 2: Wait for the list to appear
    let listContainer = document.querySelector(
      '[data-automation-id="activeListContainer"]'
    );
    if (!listContainer) {
      console.warn("⚠️ Multi-select options list not found after click");
      // Try clicking again
      inputElement.click();
      await this.sleep(800);
      listContainer = document.querySelector(
        '[data-automation-id="activeListContainer"]'
      );
    }

    // Step 3: Extract first-level options and check for hierarchical structure
    const firstLevelOptions = this.extractMultiSelectOptions();

    if (firstLevelOptions.length === 0) {
      console.warn("⚠️ No options found in multi-select");
      document.body.click();
      return;
    }

    // Check if this is a hierarchical dropdown (options have sub-menus)
    const hasHierarchy = firstLevelOptions.some((o) => o.hasSubMenu);

    if (hasHierarchy) {
      console.log("📂 Detected hierarchical multi-select dropdown");
      await this.handleHierarchicalMultiSelect(field, firstLevelOptions, value);
    } else {
      // Flat dropdown - use existing logic
      await this.handleFlatMultiSelect(field, firstLevelOptions, value);
    }
  }

  /**
   * Extract options from the currently visible multi-select dropdown
   */
  extractMultiSelectOptions() {
    const optionElements = document.querySelectorAll(
      '[data-automation-id="menuItem"]'
    );

    return Array.from(optionElements).map((menuItem) => {
      const promptOption = menuItem.querySelector('[data-automation-id="promptOption"]');
      const leafNode = menuItem.querySelector('[data-automation-id="promptLeafNode"]');

      // Check if this option has a sub-menu (chevron icon indicates hierarchy)
      const hasSubMenu = leafNode?.getAttribute("data-uxi-multiselectlistitem-hassidecharm") === "true";

      return {
        element: menuItem,
        leafNode: leafNode,
        text: promptOption?.textContent?.trim() || menuItem.textContent?.trim() || "",
        label: promptOption?.getAttribute("data-automation-label") || promptOption?.textContent?.trim() || "",
        hasSubMenu: hasSubMenu,
      };
    }).filter((o) => o.text); // Filter out empty options
  }

  /**
   * Handle hierarchical multi-select dropdowns (with categories and sub-options)
   */
  async handleHierarchicalMultiSelect(field, firstLevelOptions, value) {
    console.log(
      `📋 First level options:`,
      firstLevelOptions.map((o) => `${o.text}${o.hasSubMenu ? " (has submenu)" : ""}`)
    );

    // For hierarchical dropdowns, we need to:
    // 1. Select a category (e.g., "Source")
    // 2. Wait for sub-options to load
    // 3. Select the final option (e.g., "LinkedIn")

    // First, determine which category to select
    // For "How did you hear about us" type questions, "Source" is typically the right category
    const categoryOptions = firstLevelOptions.filter((o) => o.hasSubMenu);
    const directOptions = firstLevelOptions.filter((o) => !o.hasSubMenu);

    // Try to find the most appropriate category
    let selectedCategory = null;

    // Common category preferences for job source questions
    const preferredCategories = ["source", "job board", "online", "website", "career"];
    for (const pref of preferredCategories) {
      selectedCategory = categoryOptions.find(
        (o) => o.text.toLowerCase().includes(pref) || o.label.toLowerCase().includes(pref)
      );
      if (selectedCategory) break;
    }

    // If no preferred category found, use AI or select first category
    if (!selectedCategory && categoryOptions.length > 0) {
      const categoryTexts = categoryOptions.map((o) => o.text);
      try {
        const aiCategory = await this.aiService.getOptionAnswer(
          `Which category best fits where you found this job? Question: "${field.label}"`,
          categoryTexts,
          { userData: this.userData, jobDescription: this.jobDescription, fieldType: "category" }
        );
        if (aiCategory) {
          selectedCategory = this.findBestMultiSelectMatch(aiCategory, categoryOptions);
        }
      } catch (error) {
        console.warn("⚠️ AI category selection failed:", error.message);
      }

      // Fallback to first category
      if (!selectedCategory) {
        selectedCategory = categoryOptions[0];
      }
    }

    // If we have direct options and no categories, treat as flat
    if (!selectedCategory && directOptions.length > 0) {
      console.log("📋 No category with submenu found, treating as flat dropdown");
      await this.handleFlatMultiSelect(field, directOptions, value);
      return;
    }

    if (!selectedCategory) {
      console.warn("⚠️ No selectable option found in hierarchical dropdown");
      return;
    }

    // Click the category to expand sub-options
    console.log(`📂 Clicking category: "${selectedCategory.text}"`);
    const clickTarget = selectedCategory.leafNode || selectedCategory.element;
    clickTarget.click();
    await this.sleep(800);

    // Wait for sub-options to load (indicated by header with back button)
    const maxWaitTime = 3000;
    const startTime = Date.now();
    let subMenuLoaded = false;

    while (Date.now() - startTime < maxWaitTime) {
      const header = document.querySelector('[data-automation-id="multiSelectHeader"]');
      const backButton = document.querySelector('[data-automation-id="backButton"]');
      if (header && backButton) {
        subMenuLoaded = true;
        break;
      }
      await this.sleep(200);
    }

    if (!subMenuLoaded) {
      console.warn("⚠️ Sub-menu did not load after clicking category");
      // Try to select from whatever is visible
    }

    // Extract second-level options
    const secondLevelOptions = this.extractMultiSelectOptions();

    // Filter out any options that still have sub-menus (we want final selections)
    const finalOptions = secondLevelOptions.filter((o) => !o.hasSubMenu);

    console.log(
      `📋 Second level options (${finalOptions.length}):`,
      finalOptions.slice(0, 10).map((o) => o.text),
      finalOptions.length > 10 ? `... and ${finalOptions.length - 10} more` : ""
    );

    if (finalOptions.length === 0) {
      console.warn("⚠️ No final options found in sub-menu");
      // Click back button and try another approach
      const backButton = document.querySelector('[data-automation-id="backButton"]');
      if (backButton) {
        backButton.click();
        await this.sleep(500);
      }
      return;
    }

    // Now select from the final options using AI
    await this.handleFlatMultiSelect(field, finalOptions, value);
  }

  /**
   * Handle flat (non-hierarchical) multi-select dropdowns
   */
  async handleFlatMultiSelect(field, availableOptions, value) {
    console.log(
      `📋 Found ${availableOptions.length} options:`,
      availableOptions.slice(0, 10).map((o) => o.text),
      availableOptions.length > 10 ? `... and ${availableOptions.length - 10} more` : ""
    );

    // Step 4: If we already have a value from AI, try to match it
    if (value) {
      const matchedOption = this.findBestMultiSelectMatch(value, availableOptions);
      if (matchedOption) {
        console.log(`✅ Matched option: "${matchedOption.text}"`);
        const clickTarget = matchedOption.leafNode || matchedOption.element;
        clickTarget.click();
        await this.sleep(400);
        return;
      }
    }

    // Step 5: If no match or no value, use AI to select the best option
    console.log("🤖 Using AI to select best option...");
    const optionTexts = availableOptions.map((o) => o.text);
    const context = {
      userData: this.userData,
      jobDescription: this.jobDescription,
      fieldType: "multiselect",
    };

    try {
      const aiAnswer = await this.aiService.getOptionAnswer(
        field.label || "How did you hear about this position?",
        optionTexts,
        context
      );

      if (aiAnswer) {
        const matchedOption = this.findBestMultiSelectMatch(aiAnswer, availableOptions);
        if (matchedOption) {
          console.log(`✅ AI selected: "${matchedOption.text}"`);
          const clickTarget = matchedOption.leafNode || matchedOption.element;
          clickTarget.click();
          await this.sleep(400);
          return;
        }
      }
    } catch (error) {
      console.error("❌ AI selection error:", error.message);
    }

    // Step 6: Default fallback - select first reasonable option (often "Online Job Board" or "LinkedIn")
    const fallbackPatterns = [
      "linkedin",
      "job board",
      "online",
      "indeed",
      "website",
      "career site",
      "company site",
    ];

    for (const pattern of fallbackPatterns) {
      const fallbackOption = availableOptions.find(
        (o) => o.text.toLowerCase().includes(pattern) || o.label.toLowerCase().includes(pattern)
      );
      if (fallbackOption) {
        console.log(`⚡ Fallback selection: "${fallbackOption.text}"`);
        const clickTarget = fallbackOption.leafNode || fallbackOption.element;
        clickTarget.click();
        await this.sleep(400);
        return;
      }
    }

    // Last resort: select first option
    if (availableOptions.length > 0) {
      console.log(`⚡ Selecting first option: "${availableOptions[0].text}"`);
      const clickTarget = availableOptions[0].leafNode || availableOptions[0].element;
      clickTarget.click();
      await this.sleep(400);
    }
  }

  /**
   * Find the best matching option in multi-select list
   */
  findBestMultiSelectMatch(value, options) {
    const valueLower = value.toLowerCase();

    // Exact match
    let match = options.find(
      (o) => o.text.toLowerCase() === valueLower || o.label.toLowerCase() === valueLower
    );
    if (match) return match;

    // Value contains option text
    match = options.find(
      (o) =>
        valueLower.includes(o.text.toLowerCase()) ||
        valueLower.includes(o.label.toLowerCase())
    );
    if (match) return match;

    // Option contains value
    match = options.find(
      (o) =>
        o.text.toLowerCase().includes(valueLower) ||
        o.label.toLowerCase().includes(valueLower)
    );
    if (match) return match;

    // Partial word match (for cases like "Job Board" matching "Online Job Board")
    const valueWords = valueLower.split(/\s+/);
    match = options.find((o) => {
      const optText = o.text.toLowerCase();
      return valueWords.some(
        (word) => word.length > 3 && optText.includes(word)
      );
    });
    if (match) return match;

    return null;
  }

  // ========================================
  // BUTTON DETECTION
  // ========================================

  /**
   * Find the continue/submit button
   */
  findContinueButton() {
    console.log("🔍 Looking for continue/submit button...");

    // Priority 1: Workday's pageFooterNextButton
    const nextButton = document.querySelector(
      '[data-automation-id="pageFooterNextButton"]'
    );
    if (nextButton && !this.isElementHidden(nextButton)) {
      console.log("🔘 Found NEXT button via data-automation-id");
      return {
        element: nextButton,
        text: nextButton.textContent.trim(),
        type: "next",
      };
    }

    // Priority 2: Submit button
    const submitButton = document.querySelector(
      '[data-automation-id="submitButton"], button[type="submit"]'
    );
    if (submitButton && !this.isElementHidden(submitButton)) {
      console.log("🔘 Found SUBMIT button");
      return {
        element: submitButton,
        text: submitButton.textContent.trim(),
        type: "submit",
      };
    }

    // Priority 3: Search by text
    const allButtons = document.querySelectorAll("button");
    for (const button of allButtons) {
      if (this.isElementHidden(button)) continue;

      const text = button.textContent.trim().toLowerCase();
      if (text === "continue" || text === "next" || text.includes("continue")) {
        console.log("🔘 Found button by text:", button.textContent.trim());
        return {
          element: button,
          text: button.textContent.trim(),
          type: "next",
        };
      }
    }

    console.warn("⚠️ No button found");
    return null;
  }

  /**
   * Click a button
   */
  async clickButton(buttonData) {
    if (!buttonData?.element) return false;

    console.log(`🖱️ Clicking: "${buttonData.text}"`);
    buttonData.element.scrollIntoView({ behavior: "smooth", block: "center" });
    await this.sleep(300);
    buttonData.element.click();
    return true;
  }

  // ========================================
  // STEP HANDLERS
  // ========================================

  /**
   * Handle resume upload step
   * Flow: Show status -> Wait -> Perform action
   */
  async handleAutofillWithResumeStep() {
    console.log("📄 Processing AUTOFILL_WITH_RESUME step");
    // Status already shown by main loop before calling this

    if (!this.fileHandler) {
      console.warn("⚠️ No file handler available");
      return;
    }

    // Find file input
    let fileInput = document.querySelector(
      '[data-automation-id="file-upload-input-ref"]'
    );
    if (!fileInput) {
      fileInput = document.querySelector('input[type="file"]');
    }

    if (!fileInput) {
      console.warn("⚠️ No file input found");
      return;
    }

    // Get resume URLs
    const fileUrls = this.fileHandler.getFileUrls(this.userData, "resume");
    if (!fileUrls || fileUrls.length === 0) {
      console.error("❌ No resume URLs found");
      return;
    }

    // Upload resume
    await this.fileHandler.handleResumeUpload(
      fileInput,
      this.userData,
      this.jobDescription,
      fileUrls,
      this.jobTitle
    );

    // Show waiting status while upload processes
    notifyStatus({ type: "WAITING_FOR_RESPONSE", data: { field: "Processing Resume" } });
    await this.sleep(2000); // Wait for upload to process
  }

  /**
   * Handle My Information step
   * Flow: Show status -> Perform action -> Show next status -> Perform next action
   */
  async handleMyInformationStep() {
    console.log("📋 Processing MY_INFORMATION step");

    // Step 1: Show status first, then handle previous worker question
    notifyStatus({ type: "FILLING_FORM", data: { field: "Previous Worker Question" } });
    await this.sleep(300);
    await this.handlePreviousWorkerQuestion();

    // Step 2: Show status first, then pre-fill from user profile
    notifyStatus({ type: "FILLING_FORM", data: { field: "Personal Information" } });
    await this.sleep(300);
    await this.prefillFromUserProfile();

    // Step 3: Show status first, then handle dropdowns
    notifyStatus({ type: "FILLING_FORM", data: { field: "Dropdown Fields" } });
    await this.sleep(300);
    await this.handleWorkdayDropdowns();

    // Step 4: Show status first, then handle source field
    notifyStatus({ type: "FILLING_FORM", data: { field: "How Did You Hear About Us" } });
    await this.sleep(300);
    await this.handleSourceMultiSelect();

    // Step 5: For remaining fields that need AI, show waiting status first
    notifyStatus({ type: "WAITING_FOR_RESPONSE" });
    await this.sleep(300);
    const fields = this.extractFormFields();
    const answers = await this.getAIAnswers(fields);

    notifyStatus({ type: "FILLING_FORM", data: { field: "Remaining Fields" } });
    await this.sleep(300);
    await this.fillFields(fields, answers);
  }

  /**
   * Handle "How did you hear about us" / Source multi-select field
   * This field requires clicking to expand, extracting options, and selecting
   */
  async handleSourceMultiSelect() {
    console.log("🔍 Looking for Source/How did you hear about us field...");

    // Find the multi-select container for source field
    // Common identifiers: id contains "source", formField-source, etc.
    const sourceSelectors = [
      '[data-automation-id="multiSelectContainer"]',
      '[data-uxi-widget-type="multiselect"]',
      '[id*="source"] [data-uxi-widget-type="multiselect"]',
      '[data-automation-id*="source"]',
    ];

    let multiSelectContainer = null;
    for (const selector of sourceSelectors) {
      multiSelectContainer = document.querySelector(selector);
      if (multiSelectContainer) break;
    }

    if (!multiSelectContainer) {
      console.log("  ℹ️ No source multi-select field found on this page");
      return;
    }

    // Check if already has a selection
    const selectedItems = multiSelectContainer.querySelectorAll(
      '[data-automation-id="selectedItem"], [data-automation-id="pill"]'
    );
    if (selectedItems.length > 0) {
      console.log("  ℹ️ Source field already has a selection");
      return;
    }

    console.log("  🔽 Found source multi-select, processing...");

    // Find the input/search box to click and expand
    const inputElement = multiSelectContainer.querySelector(
      '[data-automation-id="searchBox"], input[type="text"], input[data-uxi-widget-type="selectinput"]'
    );

    if (!inputElement) {
      console.warn("  ⚠️ Could not find input element in multi-select");
      return;
    }

    // Get the form field label for context
    const formField = multiSelectContainer.closest('[data-automation-id^="formField"]');
    let fieldLabel = "How did you hear about this position?";
    if (formField) {
      const labelEl = formField.querySelector("label");
      if (labelEl) fieldLabel = labelEl.textContent.trim();
    }

    // Click to expand the dropdown
    inputElement.scrollIntoView({ behavior: "smooth", block: "center" });
    await this.sleep(300);
    inputElement.focus();
    inputElement.click();
    await this.sleep(700);

    // Wait for the list container to appear
    let listContainer = document.querySelector(
      '[data-automation-id="activeListContainer"]'
    );

    if (!listContainer) {
      // Try clicking again
      inputElement.click();
      await this.sleep(800);
      listContainer = document.querySelector(
        '[data-automation-id="activeListContainer"]'
      );
    }

    if (!listContainer) {
      console.warn("  ⚠️ Options list did not appear");
      return;
    }

    // Extract all available options
    const optionElements = document.querySelectorAll(
      '[data-automation-id="menuItem"] [data-automation-id="promptOption"]'
    );

    if (optionElements.length === 0) {
      console.warn("  ⚠️ No options found in list");
      document.body.click();
      return;
    }

    const availableOptions = Array.from(optionElements).map((el) => ({
      element: el.closest('[data-automation-id="menuItem"]') || el.closest('[data-automation-id="promptLeafNode"]') || el,
      text: el.textContent.trim(),
      label: el.getAttribute("data-automation-label") || el.textContent.trim(),
    }));

    console.log(`  📋 Found ${availableOptions.length} options:`, availableOptions.map((o) => o.text));

    // Select "Online Job Board" or similar - no AI needed for this field
    let selectedOption = availableOptions.find(
      (o) =>
        o.text.toLowerCase().includes("online job board") ||
        o.text.toLowerCase().includes("job board") ||
        o.text.toLowerCase().includes("online")
    );

    // Fallback to "Career Site" or "Website"
    if (!selectedOption) {
      selectedOption = availableOptions.find(
        (o) =>
          o.text.toLowerCase().includes("career") ||
          o.text.toLowerCase().includes("website")
      );
    }

    // Last resort: first option
    if (!selectedOption && availableOptions.length > 0) {
      selectedOption = availableOptions[0];
    }

    if (selectedOption) {
      console.log(`  ✅ Selecting: "${selectedOption.text}"`);
      selectedOption.element.click();
      await this.sleep(500);
    } else {
      // Close the dropdown
      document.body.click();
      await this.sleep(200);
    }
  }

  /**
   * Pre-fill form fields directly from user profile data
   * This handles common fields without needing AI
   *
   * Fields handled directly (no AI needed):
   * - Given Name(s)* = firstName
   * - Family Name* = lastName
   * - Address Line 1* = streetAddress
   * - City or Town* = city
   * - Postal Code* = postalCode
   * - Phone Number* = phoneNumber
   * - Country* = country (dropdown)
   * - Phone Device Type* = "Mobile" (always)
   * - Country Phone Code* = match with country code
   * - How Did You Hear About Us?* = "Online Job Board" or similar
   *
   * Fields to skip:
   * - Phone Extension
   */
  async prefillFromUserProfile() {
    console.log("📝 Pre-filling from user profile...");

    const ud = this.userData || {};

    // Text input field mappings [selector, value, fieldName for logging]
    const textFieldMappings = [
      // Name fields - Given Name(s) is first name, Family Name is last name
      [
        '[data-automation-id="formField-legalName--firstName"] input, [id*="firstName"], [name*="firstName"]',
        ud.firstName || ud.first_name || ud.givenName,
        "Given Name(s)"
      ],
      [
        '[data-automation-id="formField-legalName--lastName"] input, [id*="lastName"], [name*="lastName"]',
        ud.lastName || ud.last_name || ud.familyName,
        "Family Name"
      ],
      // Address fields - Address Line 1 is street address
      [
        '[data-automation-id="formField-addressLine1"] input, [id*="addressLine1"], [name="addressLine1"]',
        ud.streetAddress || ud.address || ud.street || ud.addressLine1,
        "Address Line 1"
      ],
      // City or Town
      [
        '[data-automation-id="formField-city"] input, [id*="city"], [name="city"]',
        ud.city || ud.currentCity,
        "City or Town"
      ],
      // Postal Code
      [
        '[data-automation-id="formField-postalCode"] input, [id*="postalCode"], [name="postalCode"]',
        ud.postalCode || ud.zipCode || ud.zipcode || ud.zip,
        "Postal Code"
      ],
      // Phone Number (just the number, no country code)
      [
        '[data-automation-id="formField-phoneNumber"] input, [id$="--phoneNumber"], [name="phoneNumber"]:not([name*="country"]):not([name*="extension"])',
        ud.phoneNumber || ud.phone,
        "Phone Number"
      ],
      // Email (fallback if not auto-filled)
      [
        '[data-automation-id="formField-emailAddress"] input, [id*="emailAddress"], [name="emailAddress"]',
        ud.email,
        "Email Address"
      ],
    ];

    let filledCount = 0;

    for (const [selector, value, fieldName] of textFieldMappings) {
      if (!value) {
        console.log(`  ⏭️ Skipping ${fieldName}: no value in user profile`);
        continue;
      }

      const input = document.querySelector(selector);
      if (input && !input.value && !this.isElementHidden(input)) {
        console.log(`  ✅ Pre-filling ${fieldName}: "${value}"`);

        // Simulate proper user interaction sequence for Workday validation
        // 1. Focus events
        input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
        input.dispatchEvent(new FocusEvent("focus", { bubbles: false }));
        input.focus();
        await this.sleep(50);

        // 2. Click to simulate user clicking into field
        input.click();
        input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        input.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        await this.sleep(50);

        // 3. Clear and type character by character with keyboard events
        input.value = "";
        const valueStr = String(value);
        for (const char of valueStr) {
          // Simulate keydown
          input.dispatchEvent(new KeyboardEvent("keydown", {
            key: char,
            bubbles: true,
            cancelable: true
          }));
          // Update value
          input.value += char;
          // Simulate input event (React listens to this)
          input.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            data: char,
            inputType: "insertText"
          }));
          // Simulate keyup
          input.dispatchEvent(new KeyboardEvent("keyup", {
            key: char,
            bubbles: true
          }));
        }
        await this.sleep(50);

        // 4. Trigger change event
        input.dispatchEvent(new Event("change", { bubbles: true }));

        // 5. Blur events to trigger validation
        input.dispatchEvent(new FocusEvent("blur", { bubbles: false }));
        input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
        input.blur();

        await this.sleep(200);
        filledCount++;
      } else if (input && input.value) {
        console.log(`  ℹ️ ${fieldName} already has value: "${input.value}"`);
      }
    }

    console.log(`📝 Pre-filled ${filledCount} fields from user profile`);
  }

  /**
   * Handle Workday's custom dropdown components
   * These are buttons that open listboxes, not native <select> elements
   *
   * Fields handled directly (no AI needed):
   * - Country* = match with user's country
   * - County/State = match with user's state/region
   * - Phone Device Type* = Always "Mobile"
   * - Country Phone Code* = match with user's country code
   */
  async handleWorkdayDropdowns() {
    console.log("🔽 Handling Workday custom dropdowns...");

    const ud = this.userData || {};

    // Dropdown mappings: [formField automation-id, value to select, fieldName for logging]
    const dropdownMappings = [
      // Country dropdown - match with user's country
      ["formField-country", ud.country || "United States", "Country"],
      // County/State/Region dropdown
      ["formField-countryRegion", ud.state || ud.county || ud.region, "County/State"],
      // Phone Device Type - always Mobile
      ["formField-phoneType", "Mobile", "Phone Device Type"],
    ];

    for (const [formFieldId, preferredValue, fieldName] of dropdownMappings) {
      if (!preferredValue) {
        console.log(`  ⏭️ Skipping ${fieldName}: no value in user profile`);
        continue;
      }
      console.log(`  🔽 Setting ${fieldName} to: "${preferredValue}"`);
      await this.selectWorkdayFormDropdown(formFieldId, preferredValue);
    }

    // Handle Country Phone Code multi-select separately (it's a special widget)
    await this.handleCountryPhoneCode();
  }

  /**
   * Handle Country Phone Code multi-select field
   * Match with user's country code
   */
  async handleCountryPhoneCode() {
    const ud = this.userData || {};

    // Check if there's already a selection
    const phoneCodeField = document.querySelector('[data-automation-id="formField-countryPhoneCode"]');
    if (!phoneCodeField) {
      console.log("  ℹ️ Country Phone Code field not found");
      return;
    }

    const selectedItem = phoneCodeField.querySelector('[data-automation-id="selectedItem"]');
    if (selectedItem) {
      console.log(`  ℹ️ Country Phone Code already selected: "${selectedItem.textContent?.trim()}"`);
      return;
    }

    // Get user's country code - try various formats
    let countryCode = ud.countryCode || ud.phoneCountryCode || ud.country_code;

    // If we have a phone number with country code, extract it
    if (!countryCode && ud.phone) {
      const phoneMatch = ud.phone.match(/^\+(\d{1,3})/);
      if (phoneMatch) {
        countryCode = phoneMatch[1];
      }
    }

    // Map common country codes to search terms
    const countryCodeMap = {
      "1": "United States",
      "44": "United Kingdom",
      "91": "India",
      "86": "China",
      "49": "Germany",
      "33": "France",
      "61": "Australia",
      "81": "Japan",
      "7": "Russia",
      "55": "Brazil",
    };

    // If we have a country but no code, try to match
    const countryName = ud.country || (countryCode ? countryCodeMap[countryCode] : null) || "United States";

    console.log(`  🔽 Setting Country Phone Code for: "${countryName}"`);

    const inputElement = phoneCodeField.querySelector('input[data-uxi-widget-type="selectinput"]');
    if (!inputElement) {
      console.log("  ⚠️ Country Phone Code input not found");
      return;
    }

    // Click to open the dropdown
    inputElement.scrollIntoView({ behavior: "smooth", block: "center" });
    await this.sleep(300);
    inputElement.focus();
    inputElement.click();
    await this.sleep(600);

    // Type the country name to filter
    inputElement.value = countryName;
    inputElement.dispatchEvent(new Event("input", { bubbles: true }));
    await this.sleep(500);

    // Find and click the first matching option
    const options = document.querySelectorAll('[data-automation-id="menuItem"] [data-automation-id="promptOption"]');
    for (const option of options) {
      const text = option.textContent?.trim()?.toLowerCase() || "";
      if (text.includes(countryName.toLowerCase())) {
        console.log(`  ✅ Selecting Country Phone Code: "${option.textContent?.trim()}"`);
        const menuItem = option.closest('[data-automation-id="menuItem"]') ||
                         option.closest('[data-automation-id="promptLeafNode"]') ||
                         option;
        menuItem.click();
        await this.sleep(300);
        return;
      }
    }

    // Close dropdown if no match
    document.body.click();
    await this.sleep(200);
  }

  /**
   * Select an option in a Workday form field dropdown
   * Handles both simple dropdowns and searchable dropdowns
   */
  async selectWorkdayFormDropdown(formFieldId, value) {
    if (!value) return;

    const formField = document.querySelector(
      `[data-automation-id="${formFieldId}"]`
    );
    if (!formField) {
      console.log(`  ⚠️ Dropdown not found: ${formFieldId}`);
      return;
    }

    // Check if already has a value (not "Select One")
    const button = formField.querySelector('button[aria-haspopup="listbox"]');
    if (!button) return;

    const currentValue = button.textContent.trim().toLowerCase();
    if (
      currentValue &&
      !currentValue.includes("select one") &&
      !currentValue.includes("search")
    ) {
      console.log(
        `  ℹ️ ${formFieldId} already has value: "${button.textContent.trim()}"`
      );
      return;
    }

    console.log(`  🔽 Selecting "${value}" for ${formFieldId}`);

    // Click to open dropdown
    button.scrollIntoView({ behavior: "smooth", block: "center" });
    await this.sleep(300);
    button.click();
    await this.sleep(500);

    // Check if this is a searchable dropdown (has a search input)
    const searchInput = document.querySelector(
      '[data-automation-id="searchBox"], input[aria-controls][role="combobox"]'
    );

    if (searchInput && !this.isElementHidden(searchInput)) {
      // This is a searchable dropdown - type to filter
      console.log(`  🔍 Searchable dropdown detected, typing "${value}"...`);

      searchInput.focus();
      searchInput.value = "";

      // Type the value to filter options
      for (const char of value) {
        searchInput.value += char;
        searchInput.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          data: char,
          inputType: "insertText"
        }));
      }

      await this.sleep(800); // Wait for search results to load
    }

    // Find the matching option in the opened listbox
    const options = document.querySelectorAll(
      '[data-automation-id="promptOption"], [role="option"], li[role="presentation"] div[role="option"]'
    );

    // Try exact match first
    for (const option of options) {
      const optionText = option.textContent.trim().toLowerCase();
      if (optionText === value.toLowerCase()) {
        console.log(
          `  ✅ Found exact match: "${option.textContent.trim()}"`
        );
        option.click();
        await this.sleep(400);
        return;
      }
    }

    // Try partial match
    for (const option of options) {
      const optionText = option.textContent.trim().toLowerCase();
      if (
        optionText.includes(value.toLowerCase()) ||
        value.toLowerCase().includes(optionText)
      ) {
        console.log(
          `  ✅ Found partial match: "${option.textContent.trim()}"`
        );
        option.click();
        await this.sleep(400);
        return;
      }
    }

    // Close dropdown if no match found
    console.log(
      `  ⚠️ No matching option found for "${value}", closing dropdown`
    );
    document.body.click();
    await this.sleep(200);
  }

  /**
   * Handle previous worker radio buttons (common: "No")
   */
  async handlePreviousWorkerQuestion() {
    const radioNo = document.querySelector(
      '[data-automation-id="formField-candidateIsPreviousWorker"] input[value="false"]'
    );
    if (radioNo && !radioNo.checked) {
      const label = document.querySelector(`label[for="${radioNo.id}"]`);
      if (label) {
        label.click();
      } else {
        radioNo.click();
      }
      await this.sleep(200);
      console.log("  ✅ Selected 'No' for previous worker question");
    }
  }

  /**
   * Handle My Experience step
   * This step typically contains: Work Experience, Education, Skills, Resume/CV, Websites
   * Flow: Show status -> Wait -> Perform action
   */
  async handleMyExperienceStep() {
    console.log("💼 Processing MY_EXPERIENCE step");

    // Step 1: Upload Resume first (often required)
    notifyStatus({ type: "UPLOADING_FILES", data: { field: "Resume/CV" } });
    await this.sleep(300);
    await this.handleResumeUploadSection();

    // Step 2: Add Work Experience entries
    notifyStatus({ type: "FILLING_FORM", data: { field: "Work Experience" } });
    await this.sleep(300);
    await this.handleWorkExperienceSection();

    // Step 3: Add Education entries
    notifyStatus({ type: "FILLING_FORM", data: { field: "Education" } });
    await this.sleep(300);
    await this.handleEducationSection();

    // Step 4: Add Skills
    notifyStatus({ type: "FILLING_FORM", data: { field: "Skills" } });
    await this.sleep(300);
    await this.handleSkillsSection();

    // Step 5: Add Websites (LinkedIn, portfolio, etc.)
    notifyStatus({ type: "FILLING_FORM", data: { field: "Websites" } });
    await this.sleep(300);
    await this.handleWebsitesSection();

    // Step 6: Handle source multi-select if present on this step
    notifyStatus({ type: "FILLING_FORM", data: { field: "Source Selection" } });
    await this.sleep(300);
    await this.handleSourceMultiSelect();

    // Step 7: Handle any remaining fields with AI
    notifyStatus({ type: "WAITING_FOR_RESPONSE" });
    await this.sleep(300);
    const fields = this.extractFormFields();
    const answers = await this.getAIAnswers(fields);

    notifyStatus({ type: "FILLING_FORM", data: { field: "Remaining Fields" } });
    await this.sleep(300);
    await this.fillFields(fields, answers);
  }

  /**
   * Handle Resume/CV upload section on My Experience step
   */
  async handleResumeUploadSection() {
    console.log("📄 Looking for Resume/CV upload section...");

    // Find the resume section
    const resumeSection = document.querySelector('[aria-labelledby="Resume/CV-section"]');
    if (!resumeSection) {
      console.log("  ℹ️ Resume/CV section not found on this page");
      return;
    }

    // Check if file already uploaded
    const uploadedFile = resumeSection.querySelector('[data-automation-id="file-item"]');
    if (uploadedFile) {
      console.log("  ℹ️ Resume already uploaded");
      return;
    }

    // Find file input
    let fileInput = resumeSection.querySelector('[data-automation-id="file-upload-input-ref"]');
    if (!fileInput) {
      fileInput = resumeSection.querySelector('input[type="file"]');
    }

    if (!fileInput) {
      console.warn("  ⚠️ No file input found in Resume section");
      return;
    }

    if (!this.fileHandler) {
      console.warn("  ⚠️ No file handler available for resume upload");
      return;
    }

    // Get resume URLs
    const fileUrls = this.fileHandler.getFileUrls(this.userData, "resume");
    if (!fileUrls || fileUrls.length === 0) {
      console.warn("  ⚠️ No resume URLs found in user profile");
      return;
    }

    console.log("  📤 Uploading resume...");
    await this.fileHandler.handleResumeUpload(
      fileInput,
      this.userData,
      this.jobDescription,
      fileUrls,
      this.jobTitle
    );

    await this.sleep(2000); // Wait for upload to process
    console.log("  ✅ Resume upload initiated");
  }

  /**
   * Handle Work Experience section - Add entries from user profile
   */
  async handleWorkExperienceSection() {
    console.log("💼 Looking for Work Experience section...");

    const workSection = document.querySelector('[aria-labelledby="Work-Experience-section"]');
    if (!workSection) {
      console.log("  ℹ️ Work Experience section not found on this page");
      return;
    }

    const ud = this.userData || {};
    const experiences = ud.experience || ud.workExperience || ud.experiences || [];

    if (!experiences || experiences.length === 0) {
      console.log("  ℹ️ No work experience in user profile");
      return;
    }

    // Check if entries already exist
    const existingEntries = workSection.querySelectorAll('[data-automation-id="workExperience"]');
    if (existingEntries.length > 0) {
      console.log(`  ℹ️ ${existingEntries.length} work experience entries already exist`);
      return;
    }

    // Add each experience entry (limit to most recent 3)
    const experiencesToAdd = experiences.slice(0, 3);
    console.log(`  📝 Adding ${experiencesToAdd.length} work experience entries...`);

    for (let i = 0; i < experiencesToAdd.length; i++) {
      const exp = experiencesToAdd[i];
      console.log(`  Adding experience ${i + 1}: ${exp.title || exp.jobTitle} at ${exp.company || exp.companyName}`);

      // Click Add button
      const addButton = workSection.querySelector('[data-automation-id="add-button"]');
      if (!addButton) {
        console.warn("  ⚠️ Add button not found for Work Experience");
        break;
      }

      addButton.scrollIntoView({ behavior: "smooth", block: "center" });
      await this.sleep(300);
      addButton.click();
      await this.sleep(1000); // Wait for form to appear

      // Fill the work experience form
      await this.fillWorkExperienceForm(exp);
      await this.sleep(500);
    }
  }

  /**
   * Fill a single work experience entry form
   */
  async fillWorkExperienceForm(experience) {
    const exp = experience || {};

    // Common field mappings for Workday work experience
    const fieldMappings = [
      // Job Title
      ['[data-automation-id="jobTitle"] input, [id*="jobTitle"] input', exp.title || exp.jobTitle || exp.position],
      // Company
      ['[data-automation-id="company"] input, [id*="company"] input', exp.company || exp.companyName || exp.employer],
      // Location
      ['[data-automation-id="location"] input, [id*="location"] input', exp.location || exp.city],
      // Description
      ['[data-automation-id="description"] textarea, [id*="description"] textarea', exp.description || exp.summary || exp.responsibilities],
    ];

    for (const [selector, value] of fieldMappings) {
      if (!value) continue;

      const input = document.querySelector(selector);
      if (input && !this.isElementHidden(input)) {
        await this.fillTextInput(input, value);
        await this.sleep(200);
      }
    }

    // Handle date fields (Start Date, End Date)
    await this.fillWorkExperienceDates(exp);

    // Handle "I currently work here" checkbox
    if (exp.current || exp.currentJob || exp.isCurrentJob) {
      const currentCheckbox = document.querySelector(
        '[data-automation-id="currentlyWorkHere"] input, [id*="currentlyWorkHere"] input'
      );
      if (currentCheckbox && !currentCheckbox.checked) {
        currentCheckbox.click();
        await this.sleep(200);
      }
    }
  }

  /**
   * Fill work experience date fields
   */
  async fillWorkExperienceDates(experience) {
    const exp = experience || {};

    // Start date
    const startDate = exp.startDate || exp.start_date || exp.from;
    if (startDate) {
      // Try month/year dropdowns first
      await this.selectDateDropdowns("startDate", startDate);
    }

    // End date (if not current job)
    if (!exp.current && !exp.currentJob && !exp.isCurrentJob) {
      const endDate = exp.endDate || exp.end_date || exp.to;
      if (endDate) {
        await this.selectDateDropdowns("endDate", endDate);
      }
    }
  }

  /**
   * Select date from Workday month/year dropdowns
   */
  async selectDateDropdowns(fieldPrefix, dateValue) {
    // Parse date - could be "2020-01", "January 2020", "01/2020", etc.
    let month, year;

    if (typeof dateValue === "string") {
      // Try ISO format first (2020-01)
      const isoMatch = dateValue.match(/^(\d{4})-(\d{2})/);
      if (isoMatch) {
        year = isoMatch[1];
        month = parseInt(isoMatch[2], 10);
      } else {
        // Try "Month Year" format
        const monthNames = ["january", "february", "march", "april", "may", "june",
          "july", "august", "september", "october", "november", "december"];
        const monthMatch = dateValue.toLowerCase().match(/([a-z]+)\s*(\d{4})/);
        if (monthMatch) {
          const monthIndex = monthNames.indexOf(monthMatch[1]);
          if (monthIndex >= 0) {
            month = monthIndex + 1;
            year = monthMatch[2];
          }
        }
      }
    } else if (dateValue instanceof Date) {
      month = dateValue.getMonth() + 1;
      year = dateValue.getFullYear().toString();
    }

    if (!month || !year) {
      console.log(`    ⚠️ Could not parse date: ${dateValue}`);
      return;
    }

    // Select month dropdown
    const monthDropdown = document.querySelector(
      `[data-automation-id="${fieldPrefix}Month"], [id*="${fieldPrefix}"][id*="month"]`
    );
    if (monthDropdown) {
      await this.selectWorkdayFormDropdown(`formField-${fieldPrefix}Month`, month.toString());
    }

    // Select year dropdown
    const yearDropdown = document.querySelector(
      `[data-automation-id="${fieldPrefix}Year"], [id*="${fieldPrefix}"][id*="year"]`
    );
    if (yearDropdown) {
      await this.selectWorkdayFormDropdown(`formField-${fieldPrefix}Year`, year);
    }
  }

  /**
   * Handle Education section - Add entries from user profile
   */
  async handleEducationSection() {
    console.log("🎓 Looking for Education section...");

    const eduSection = document.querySelector('[aria-labelledby="Education-section"]');
    if (!eduSection) {
      console.log("  ℹ️ Education section not found on this page");
      return;
    }

    const ud = this.userData || {};
    const education = ud.education || ud.educations || [];

    if (!education || education.length === 0) {
      console.log("  ℹ️ No education in user profile");
      return;
    }

    // Check if entries already exist
    const existingEntries = eduSection.querySelectorAll('[data-automation-id="education"]');
    if (existingEntries.length > 0) {
      console.log(`  ℹ️ ${existingEntries.length} education entries already exist`);
      return;
    }

    // Add each education entry (limit to most recent 2)
    const educationToAdd = education.slice(0, 2);
    console.log(`  📝 Adding ${educationToAdd.length} education entries...`);

    for (let i = 0; i < educationToAdd.length; i++) {
      const edu = educationToAdd[i];
      console.log(`  Adding education ${i + 1}: ${edu.degree || edu.field} at ${edu.school || edu.institution}`);

      // Click Add button
      const addButton = eduSection.querySelector('[data-automation-id="add-button"]');
      if (!addButton) {
        console.warn("  ⚠️ Add button not found for Education");
        break;
      }

      addButton.scrollIntoView({ behavior: "smooth", block: "center" });
      await this.sleep(300);
      addButton.click();
      await this.sleep(1000); // Wait for form to appear

      // Fill the education form
      await this.fillEducationForm(edu);
      await this.sleep(500);
    }
  }

  /**
   * Fill a single education entry form
   */
  async fillEducationForm(education) {
    const edu = education || {};

    // Common field mappings for Workday education
    const fieldMappings = [
      // School/University
      ['[data-automation-id="school"] input, [id*="school"] input', edu.school || edu.institution || edu.university],
      // Degree
      ['[data-automation-id="degree"] input, [id*="degree"] input', edu.degree || edu.degreeType],
      // Field of Study
      ['[data-automation-id="fieldOfStudy"] input, [id*="fieldOfStudy"] input, [id*="field"] input', edu.field || edu.fieldOfStudy || edu.major],
      // GPA (optional)
      ['[data-automation-id="gpa"] input, [id*="gpa"] input', edu.gpa],
    ];

    for (const [selector, value] of fieldMappings) {
      if (!value) continue;

      const input = document.querySelector(selector);
      if (input && !this.isElementHidden(input)) {
        await this.fillTextInput(input, value);
        await this.sleep(200);
      }
    }

    // Handle degree dropdown if it's a dropdown instead of text input
    if (edu.degree || edu.degreeType) {
      const degreeValue = edu.degree || edu.degreeType;
      await this.selectWorkdayFormDropdown("formField-degree", degreeValue);
    }

    // Handle date fields
    if (edu.graduationDate || edu.endDate || edu.graduationYear) {
      const gradDate = edu.graduationDate || edu.endDate || edu.graduationYear;
      await this.selectDateDropdowns("graduationDate", gradDate);
    }
  }

  /**
   * Handle Skills section - Add skills from user profile
   */
  async handleSkillsSection() {
    console.log("🛠️ Looking for Skills section...");

    const skillsField = document.querySelector('[data-automation-id="formField-skills"]');
    if (!skillsField) {
      console.log("  ℹ️ Skills field not found on this page");
      return;
    }

    const ud = this.userData || {};
    let skills = ud.skills || [];

    // Handle if skills is a string (comma-separated)
    if (typeof skills === "string") {
      skills = skills.split(",").map(s => s.trim()).filter(s => s);
    }

    if (!skills || skills.length === 0) {
      console.log("  ℹ️ No skills in user profile");
      return;
    }

    // Check if skills already added
    const existingSkills = skillsField.querySelectorAll('[data-automation-id="selectedItem"]');
    if (existingSkills.length > 0) {
      console.log(`  ℹ️ ${existingSkills.length} skills already added`);
      return;
    }

    const searchInput = skillsField.querySelector('[data-automation-id="searchBox"]');
    if (!searchInput) {
      console.warn("  ⚠️ Skills search input not found");
      return;
    }

    // Add skills (limit to top 10)
    const skillsToAdd = skills.slice(0, 10);
    console.log(`  📝 Adding ${skillsToAdd.length} skills: ${skillsToAdd.join(", ")}`);

    for (const skill of skillsToAdd) {
      await this.addSkill(searchInput, skill);
      await this.sleep(500);
    }
  }

  /**
   * Add a single skill to the skills multi-select
   */
  async addSkill(searchInput, skillName) {
    // Focus and clear input
    searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
    await this.sleep(200);
    searchInput.focus();
    searchInput.click();
    await this.sleep(300);

    // Clear existing value
    searchInput.value = "";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    await this.sleep(200);

    // Type the skill name
    for (const char of skillName) {
      searchInput.value += char;
      searchInput.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        data: char,
        inputType: "insertText"
      }));
    }
    await this.sleep(600); // Wait for search results

    // Find and click matching option
    const options = document.querySelectorAll('[data-automation-id="promptOption"]');
    let matched = false;

    for (const option of options) {
      const optionText = option.textContent.trim().toLowerCase();
      if (optionText === skillName.toLowerCase() || optionText.includes(skillName.toLowerCase())) {
        console.log(`    ✅ Selecting skill: "${option.textContent.trim()}"`);
        const menuItem = option.closest('[data-automation-id="menuItem"]') ||
                         option.closest('[data-automation-id="promptLeafNode"]') ||
                         option;
        menuItem.click();
        matched = true;
        await this.sleep(300);
        break;
      }
    }

    // If no exact match, try selecting first option or press Enter to add custom
    if (!matched && options.length > 0) {
      console.log(`    ℹ️ No exact match for "${skillName}", selecting first option`);
      const firstOption = options[0].closest('[data-automation-id="menuItem"]') || options[0];
      firstOption.click();
      await this.sleep(300);
    } else if (!matched) {
      // Press Enter to add as custom skill if allowed
      searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await this.sleep(300);
    }

    // Click elsewhere to close dropdown
    document.body.click();
    await this.sleep(200);
  }

  /**
   * Handle Websites section - Add LinkedIn and other links
   */
  async handleWebsitesSection() {
    console.log("🌐 Looking for Websites section...");

    const websiteSection = document.querySelector('[aria-labelledby="Websites-section"]');
    if (!websiteSection) {
      console.log("  ℹ️ Websites section not found on this page");
      return;
    }

    const ud = this.userData || {};

    // Collect all website URLs from user profile
    const websites = [];

    if (ud.linkedinUrl || ud.linkedin || ud.linkedIn) {
      websites.push({
        type: "LinkedIn",
        url: ud.linkedinUrl || ud.linkedin || ud.linkedIn
      });
    }
    if (ud.portfolioUrl || ud.portfolio || ud.website) {
      websites.push({
        type: "Portfolio",
        url: ud.portfolioUrl || ud.portfolio || ud.website
      });
    }
    if (ud.githubUrl || ud.github) {
      websites.push({
        type: "GitHub",
        url: ud.githubUrl || ud.github
      });
    }
    if (ud.personalWebsite) {
      websites.push({
        type: "Personal",
        url: ud.personalWebsite
      });
    }

    if (websites.length === 0) {
      console.log("  ℹ️ No website URLs in user profile");
      return;
    }

    // Check if entries already exist
    const existingEntries = websiteSection.querySelectorAll('[data-automation-id="website"]');
    if (existingEntries.length > 0) {
      console.log(`  ℹ️ ${existingEntries.length} website entries already exist`);
      return;
    }

    console.log(`  📝 Adding ${websites.length} website(s)...`);

    for (const website of websites) {
      console.log(`  Adding ${website.type}: ${website.url}`);

      // Click Add button
      const addButton = websiteSection.querySelector('[data-automation-id="add-button"]');
      if (!addButton) {
        console.warn("  ⚠️ Add button not found for Websites");
        break;
      }

      addButton.scrollIntoView({ behavior: "smooth", block: "center" });
      await this.sleep(300);
      addButton.click();
      await this.sleep(1000); // Wait for form to appear

      // Fill the website form
      await this.fillWebsiteForm(website);
      await this.sleep(500);
    }
  }

  /**
   * Fill a single website entry form
   */
  async fillWebsiteForm(website) {
    // URL field
    const urlInput = document.querySelector(
      '[data-automation-id="websiteUrl"] input, [id*="websiteUrl"] input, [id*="url"] input, input[type="url"]'
    );
    if (urlInput && !this.isElementHidden(urlInput)) {
      await this.fillTextInput(urlInput, website.url);
      await this.sleep(200);
    }

    // Website type dropdown (LinkedIn, Portfolio, etc.)
    if (website.type) {
      await this.selectWorkdayFormDropdown("formField-websiteType", website.type);
    }
  }

  /**
   * Helper to fill a text input with proper events
   */
  async fillTextInput(input, value) {
    if (!input || !value) return;

    const valueStr = String(value);

    // Focus sequence
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    input.dispatchEvent(new FocusEvent("focus", { bubbles: false }));
    input.focus();
    await this.sleep(50);

    // Click
    input.click();
    await this.sleep(50);

    // Clear and type
    input.value = "";
    for (const char of valueStr) {
      input.value += char;
      input.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        data: char,
        inputType: "insertText"
      }));
    }
    await this.sleep(50);

    // Change and blur
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new FocusEvent("blur", { bubbles: false }));
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  }

  /**
   * Handle Application Questions step
   * Flow: Show status -> Wait -> Perform action
   */
  async handleApplicationQuestionsStep() {
    console.log("❓ Processing APPLICATION_QUESTIONS step");

    // Handle source multi-select if present on this step
    notifyStatus({ type: "FILLING_FORM", data: { field: "Source Selection" } });
    await this.sleep(300);
    await this.handleSourceMultiSelect();

    // Get AI answers first (status shown within getAIAnswers)
    const fields = this.extractFormFields();
    const answers = await this.getAIAnswers(fields);

    // Show filling status then fill
    notifyStatus({ type: "FILLING_FORM", data: { field: "Application Questions" } });
    await this.sleep(300);
    await this.fillFields(fields, answers);
  }

  /**
   * Handle Voluntary Disclosures step (OFCCP/EEO)
   * Flow: Show status -> Wait -> Perform action
   */
  async handleVoluntaryDisclosuresStep() {
    console.log("📊 Processing VOLUNTARY_DISCLOSURES step");

    notifyStatus({ type: "FILLING_FORM", data: { field: "Voluntary Disclosures" } });
    await this.sleep(300);

    const fields = this.extractFormFields();
    const answers = {};

    for (const field of fields) {
      const question = field.label || "";

      // Try OFCCP defaults first
      if (field.type === "radio-group" || field.type === "select") {
        const ofccpAnswer = this.getOFCCPAnswer(question, field.options);
        if (ofccpAnswer) {
          answers[field.id || field.name || field.label] = ofccpAnswer;
          continue;
        }
      }

      // Fall back to AI for non-standard questions (status shown within getAIAnswers)
      const aiAnswers = await this.getAIAnswers([field]);
      Object.assign(answers, aiAnswers);
    }

    notifyStatus({ type: "FILLING_FORM", data: { field: "Disclosure Responses" } });
    await this.sleep(300);
    await this.fillFields(fields, answers);
  }

  /**
   * Handle Self Identify step
   * Flow: Show status -> Wait -> Perform action
   */
  async handleSelfIdentifyStep() {
    console.log("🆔 Processing SELF_IDENTIFY step");
    // Status will be shown by handleVoluntaryDisclosuresStep
    await this.handleVoluntaryDisclosuresStep(); // Same logic
  }

  /**
   * Handle Review step
   * Flow: Show status -> Wait -> Ready for submission
   */
  async handleReviewStep() {
    console.log("📋 Processing REVIEW step - ready for submission");
    notifyStatus({ type: "FILLING_FORM", data: { field: "Review - Ready to Submit" } });
    await this.sleep(300);
    // Nothing to fill, just ready to submit
  }

  // ========================================
  // MAIN LOOP
  // ========================================

  /**
   * Main entry point - process all form steps
   * Flow: Show status -> Wait -> Perform action (like Indeed pattern)
   */
  async fillCompleteForm() {
    console.log("🚀 Starting form completion...");

    try {
      while (this.currentStepCount < this.maxSteps) {
        this.currentStepCount++;

        // Check for error page FIRST (job doesn't exist, expired, etc.)
        const errorCheck = this.isErrorPage();
        if (errorCheck.isError) {
          console.log(`❌ Error page detected: ${errorCheck.message}`);
          notifyStatus({
            type: "JOB_ERROR",
            data: { message: errorCheck.message, skipToNext: true },
          });
          await this.sleep(500);
          return { success: false, error: errorCheck.message, skipToNext: true };
        }

        const stepType = this.detectStepFromProgressBar();
        console.log(`📍 Step ${this.currentStepCount}: ${stepType}`);

        // Check for success - show status FIRST
        if (stepType === StepType.SUCCESS) {
          console.log("✅ Application submitted successfully!");
          notifyStatus({ type: "APPLICATION_SUBMITTED" });
          await this.sleep(500);
          return true;
        }

        // Check if we're on a sign-in page (even if step detection says otherwise)
        if (this.isSignInPage()) {
          console.log("🔐 Detected sign-in page - waiting for user login");
          // Status shown by waitForSignInCompletion
          await this.waitForSignInCompletion();
          continue; // Re-evaluate step after sign-in
        }

        // Process step - each handler shows its own status before actions
        switch (stepType) {
          case StepType.CREATE_ACCOUNT_SIGN_IN:
            // Double-check if we're actually on sign-in page
            if (this.isSignInPage()) {
              await this.waitForSignInCompletion();
            } else {
              console.log("ℹ️ Sign-in step label but no sign-in content - may already be logged in");
              await this.sleep(2000);
            }
            break;

          case StepType.AUTOFILL_WITH_RESUME:
            // Show status BEFORE action
            notifyStatus({ type: "UPLOADING_FILES" });
            await this.sleep(300);
            await this.handleAutofillWithResumeStep();
            break;

          case StepType.MY_INFORMATION:
            // Status handled within handleMyInformationStep
            await this.handleMyInformationStep();
            break;

          case StepType.MY_EXPERIENCE:
            // Show status BEFORE action
            notifyStatus({ type: "FILLING_FORM", data: { step: "Experience" } });
            await this.sleep(300);
            await this.handleMyExperienceStep();
            break;

          case StepType.APPLICATION_QUESTIONS:
            // Show status BEFORE action
            notifyStatus({ type: "FILLING_FORM", data: { step: "Application Questions" } });
            await this.sleep(300);
            await this.handleApplicationQuestionsStep();
            break;

          case StepType.VOLUNTARY_DISCLOSURES:
            // Show status BEFORE action
            notifyStatus({ type: "FILLING_FORM", data: { step: "Voluntary Disclosures" } });
            await this.sleep(300);
            await this.handleVoluntaryDisclosuresStep();
            break;

          case StepType.SELF_IDENTIFY:
            // Show status BEFORE action
            notifyStatus({ type: "FILLING_FORM", data: { step: "Self Identify" } });
            await this.sleep(300);
            await this.handleSelfIdentifyStep();
            break;

          case StepType.REVIEW:
            // Show status BEFORE action
            notifyStatus({ type: "FILLING_FORM", data: { step: "Review" } });
            await this.sleep(300);
            await this.handleReviewStep();
            break;

          default:
            console.log("⚠️ Unknown step, attempting generic form fill");
            notifyStatus({ type: "WAITING_FOR_RESPONSE" });
            await this.sleep(300);
            const fields = this.extractFormFields();
            if (fields.length > 0) {
              const answers = await this.getAIAnswers(fields);
              notifyStatus({ type: "FILLING_FORM" });
              await this.sleep(300);
              await this.fillFields(fields, answers);
            }
        }

        // Human-like delay before looking for button (1500-3000ms)
        await this.sleep(1500 + Math.random() * 1500);

        // Show status before clicking button
        notifyStatus({ type: "NAVIGATING", data: { action: "Proceeding to next step" } });
        await this.sleep(300);

        // Find and click button
        const button = this.findContinueButton();
        if (button) {
          // Human-like delay before clicking (500-1200ms)
          await this.sleep(500 + Math.random() * 700);
          await this.clickButton(button);
          // Wait for page transition (1500-3000ms)
          await this.sleep(1500 + Math.random() * 1500);
          await this.waitForPageLoad();
        } else {
          console.warn("⚠️ No button found");
          await this.sleep(3000);
        }
      }

      console.warn(`⚠️ Reached max steps (${this.maxSteps})`);
      return false;
    } catch (error) {
      console.error("❌ Form completion error:", error);
      notifyStatus({
        type: "APPLICATION_ERROR",
        data: { error: error.message },
      });
      return false;
    }
  }

  /**
   * Wait for page to load after navigation
   */
  async waitForPageLoad() {
    console.log("⏳ Waiting for page to load...");

    // Wait for loading indicators to disappear
    const maxWait = 10000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const loading = document.querySelector(
        '[data-automation-id="loading"], .wd-LoadingPleaseWait'
      );
      if (!loading || this.isElementHidden(loading)) {
        break;
      }
      await this.sleep(500);
    }

    // Additional wait for DOM to settle
    await this.sleep(1000);
    console.log("✅ Page loaded");
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default WorkdayFormHandler;
