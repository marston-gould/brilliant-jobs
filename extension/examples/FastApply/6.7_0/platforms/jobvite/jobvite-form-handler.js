import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";
import { AIService } from "../../services/index.js";

/**
 * ========================================================================
 * JOBVITE FORM HANDLER
 * ========================================================================
 *
 * Direct DOM-based field detection and filling - following Indeed pattern.
 * No external extractor dependency - inline detection per step.
 *
 * Jobvite forms are Angular-based with ng-model bindings.
 * Form container: form[name="scopeData.applyForm"]
 * Steps are controlled by showStep(n) and ngIf directives.
 * ========================================================================
 */

// Step types based on DOM patterns (Jobvite uses Angular step visibility)
const StepType = {
  CONSENT: "CONSENT", // Data Consent page (country select + I Accept)
  CONTACT_INFO: "CONTACT_INFO", // Step 1: Basic info, resume, cover letter
  VOLUNTARY_SELF_ID: "VOLUNTARY_SELF_ID", // Step 2: OFCCP / EEO / Demographics
  QUESTIONS: "QUESTIONS", // Custom employer questions
  REVIEW: "REVIEW", // Final review before submit
  SUCCESS: "SUCCESS", // Application submitted
  UNKNOWN: "UNKNOWN",
};

class JobviteFormHandler {
  constructor(config = {}) {
    // API configuration
    this.host = config.host || config.aiApiHost;
    this.aiService =
      config.aiService ||
      new AIService({
        aiApiHost: this.host,
        platform: "jobvite",
      });

    // User data
    this.userData = config.userData || {};
    this.userPreferences = config.userPreferences || {};

    // Job context
    this.jobDescription = config.jobDescription || "";
    this.currentJobTitle = "";

    // Platform
    this.platform = "jobvite";

    // File handling
    this.fileHandler = config.fileHandler || null;
    this.filesUploaded = false; // Track if files have been uploaded

    // Co-pilot mode
    this.copilotMode = config.copilotMode || false;
    this.copilotState = config.copilotState || null;
    this.userHasControl = false;

    // User action handling
    this.userActionPromise = null;
    this.userActionResolver = null;

    // Max steps safety limit
    this.maxSteps = 15;
    this.currentStepCount = 0;

    // Track processed steps to prevent loops
    this.processedStepSignatures = new Set();
    this.lastDetectedStep = null;
    this.lastStepSignature = null;
    this.sameStepCounter = 0;

    // Logger
    this.logger = config.logger;

    console.log("✅ JobviteFormHandler initialized (Indeed pattern)");
  }

  updateConfig(config = {}) {
    if (config.host) {
      this.host = config.host;
      this.aiService = new AIService({
        aiApiHost: config.host,
        platform: "jobvite",
      });
    }
    if (config.userData) this.userData = config.userData;
    if (config.userPreferences) this.userPreferences = config.userPreferences;
    if (config.jobDescription) this.jobDescription = config.jobDescription;
    if (config.fileHandler) this.fileHandler = config.fileHandler;
  }

  // ============ Step Detection (DOM-based for Jobvite) ============

  detectStepFromDom() {
    // Check for Data Consent page (appears before main form)
    const consentForm = document.querySelector(
      '[ng-controller="JVConsentForm"], form[name="consentForm"]'
    );
    if (consentForm) {
      console.log("📜 Data Consent page detected");
      return StepType.CONSENT;
    }

    // Check for success page
    const successMessage = document.querySelector(
      '.jv-success, .jv-thank-you, [class*="success-message"]'
    );
    if (successMessage && this.isElementVisible(successMessage)) {
      return StepType.SUCCESS;
    }

    // Check page text for success
    const bodyText = document.body.innerText.toLowerCase();
    if (
      bodyText.includes("thank you for applying") ||
      bodyText.includes("application submitted") ||
      bodyText.includes("application received")
    ) {
      return StepType.SUCCESS;
    }

    // Find visible step container
    const visibleStep = document.querySelector(
      '.jv-apply-step:not(.ng-hide), [ng-if*="showStep"]:not(.ng-hide)'
    );

    if (visibleStep) {
      // Check for OFCCP / Voluntary Self-Identification content
      const ofccpHeader = visibleStep.querySelector(
        "h3, .jv-step-header, .jv-ofccp-section"
      );
      if (ofccpHeader) {
        const headerText = ofccpHeader.textContent.toLowerCase();
        if (
          headerText.includes("voluntary self identification") ||
          headerText.includes("equal opportunity") ||
          headerText.includes("veteran") ||
          headerText.includes("disability")
        ) {
          return StepType.VOLUNTARY_SELF_ID;
        }
      }

      // Check for OFCCP fieldsets (Gender, Race, Veteran, Disability)
      const ofccpFieldsets = visibleStep.querySelectorAll(
        "fieldset.jv-input-group"
      );
      if (ofccpFieldsets.length > 0) {
        const legendTexts = Array.from(ofccpFieldsets)
          .map(
            (fs) => fs.querySelector("legend")?.textContent.toLowerCase() || ""
          )
          .join(" ");
        if (
          legendTexts.includes("gender") ||
          legendTexts.includes("hispanic") ||
          legendTexts.includes("veteran") ||
          legendTexts.includes("disability") ||
          legendTexts.includes("race")
        ) {
          return StepType.VOLUNTARY_SELF_ID;
        }
      }
    }

    // Check for Questions step (custom employer questions)
    const questionContainers = document.querySelectorAll(
      '.jv-prescreen-element, .jv-question, [class*="question"]'
    );
    if (questionContainers.length > 0) {
      // Check if these are NOT OFCCP questions
      const hasCustomQuestions = Array.from(questionContainers).some((q) => {
        const text = q.textContent.toLowerCase();
        return (
          !text.includes("gender") &&
          !text.includes("veteran") &&
          !text.includes("disability") &&
          !text.includes("equal opportunity")
        );
      });
      if (hasCustomQuestions && !this.looksLikeOfccp()) {
        return StepType.QUESTIONS;
      }
    }

    // Check for Review step
    const submitButton = document.querySelector(
      'button[type="submit"]:not(.ng-hide), button[aria-label="Send Application"]'
    );
    if (submitButton && this.isElementVisible(submitButton)) {
      const text = submitButton.textContent.toLowerCase();
      if (text.includes("send application") || text.includes("submit")) {
        return StepType.REVIEW;
      }
    }

    // Default to CONTACT_INFO for first step or unknown
    const resumeSection = document.querySelector(
      "#attachResume, .jv-resume-section"
    );
    const contactFields = document.querySelectorAll(
      'input[type="email"], input[type="tel"], input[name*="phone"], input[name*="email"]'
    );
    if (resumeSection || contactFields.length > 0) {
      return StepType.CONTACT_INFO;
    }

    return StepType.UNKNOWN;
  }

  looksLikeOfccp() {
    const pageText = document.body.innerText.toLowerCase();
    return (
      pageText.includes("voluntary self identification") ||
      pageText.includes("equal employment opportunity") ||
      pageText.includes("protected veteran") ||
      pageText.includes("disability status")
    );
  }

  // ============ Human-like Timing (Anti-Captcha) ============

  /**
   * Random delay between min and max milliseconds
   * Simulates human-like interaction timing
   */
  randomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return this.sleep(delay);
  }

  /**
   * Short delay between field interactions (300-800ms)
   */
  humanDelayField() {
    return this.randomDelay(300, 800);
  }

  /**
   * Medium delay after filling a section (800-1500ms)
   */
  humanDelaySection() {
    return this.randomDelay(800, 1500);
  }

  /**
   * Longer delay between steps/pages (1500-3000ms)
   */
  humanDelayStep() {
    return this.randomDelay(1500, 3000);
  }

  /**
   * Delay before clicking important buttons (500-1200ms)
   */
  humanDelayBeforeClick() {
    return this.randomDelay(500, 1200);
  }

  // ============ Co-Pilot Mode ============

  resolveUserAction(action) {
    if (this.userActionResolver) {
      this.userActionResolver(action);
      this.userActionResolver = null;
      this.userActionPromise = null;
    }
  }

  waitForUserAction() {
    if (!this.userActionPromise) {
      this.userActionPromise = new Promise((resolve) => {
        this.userActionResolver = resolve;
      });
    }
    return this.userActionPromise;
  }

  // ============ DIRECT Field Detection ============

  /**
   * Check if an element is hidden
   * IMPORTANT: For Jobvite, we need to check if the element ITSELF is hidden,
   * not all parents, because the form uses complex ng-show/ng-hide patterns
   * where parent wrappers may have ng-hide but fields inside are still visible
   */
  isElementHidden(element) {
    if (!element) return true;

    // Check if element itself has ng-hide
    if (element.classList.contains("ng-hide")) return true;

    // Check computed styles on the element itself
    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return true;
    }

    // Check if element has dimensions (visible and rendered)
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      // Check parent container for ng-hide (but only immediate parent containers)
      const formField = element.closest(".jv-form-field > div, .jv-form-field");
      if (formField && formField.classList.contains("ng-hide")) {
        return true;
      }
    }

    // Check if the nearest form field container is hidden
    const inputForm = element.closest('[ng-form="inputForm"]');
    if (inputForm && inputForm.classList.contains("ng-hide")) {
      return true;
    }

    // Element is considered visible
    return false;
  }

  isElementVisible(element) {
    return !this.isElementHidden(element);
  }

  /**
   * Extract all form fields directly from the DOM (visible step only)
   * Returns array of field objects with element references
   */
  extractFormFields() {
    notifyStatus({ type: "WAITING_FOR_RESPONSE" });

    const fields = [];

    // Find the visible step or form
    const visibleStep = document.querySelector(
      '.jv-apply-step:not(.ng-hide), [ng-if*="showStep"]:not(.ng-hide)'
    );
    const form =
      visibleStep ||
      document.querySelector('form[name="scopeData.applyForm"]') ||
      document.querySelector("form") ||
      document.body;

    // Track processed elements to avoid duplicates
    const processedElements = new Set();

    // 1. Radio button groups in fieldsets (OFCCP fields)
    const fieldsets = form.querySelectorAll("fieldset.jv-input-group");
    fieldsets.forEach((fieldset) => {
      const legend = fieldset.querySelector(".jv-form-field-legend, legend");
      if (!legend) return;

      const radios = fieldset.querySelectorAll('input[type="radio"]');
      if (radios.length === 0) return;

      // Check visibility
      if (this.isElementHidden(fieldset)) return;

      const question = this.cleanText(legend.textContent);
      const options = Array.from(radios).map((radio) => {
        const parentLabel = radio.closest("label");
        let text = parentLabel
          ? parentLabel.textContent.trim().replace(/\s+/g, " ")
          : radio.value;
        return {
          value: radio.value,
          text: text,
          element: radio,
        };
      });

      fields.push({
        type: "radio-group",
        name: radios[0].name,
        label: question,
        element: radios[0],
        options: options,
        required: legend.textContent.includes("*"),
      });

      radios.forEach((r) => processedElements.add(r));
    });

    // 2. Date inputs
    const dateInputs = form.querySelectorAll('input[type="date"]');
    dateInputs.forEach((input) => {
      if (processedElements.has(input) || this.isElementHidden(input)) return;

      const field = this.extractFieldInfo(input, "date");
      if (field) {
        fields.push(field);
        processedElements.add(input);
      }
    });

    // 3. Text inputs (including email, tel, number)
    const textInputs = form.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input:not([type])'
    );
    textInputs.forEach((input) => {
      if (
        input.type === "hidden" ||
        input.type === "file" ||
        input.type === "checkbox" ||
        input.type === "radio" ||
        input.type === "date"
      )
        return;
      if (processedElements.has(input) || this.isElementHidden(input)) return;

      const field = this.extractFieldInfo(input, "text");
      if (field) {
        fields.push(field);
        processedElements.add(input);
      }
    });

    // 4. Textareas
    const textareas = form.querySelectorAll("textarea");
    textareas.forEach((textarea) => {
      if (processedElements.has(textarea) || this.isElementHidden(textarea))
        return;

      const field = this.extractFieldInfo(textarea, "textarea");
      if (field) {
        fields.push(field);
        processedElements.add(textarea);
      }
    });

    // 5. Selects (dropdowns)
    const selects = form.querySelectorAll("select");
    selects.forEach((select) => {
      if (processedElements.has(select) || this.isElementHidden(select)) return;

      const field = this.extractFieldInfo(select, "select");
      if (field) {
        field.options = Array.from(select.options)
          .filter((opt) => opt.value)
          .map((opt) => ({
            value: opt.value,
            text: opt.textContent.trim(),
          }));
        fields.push(field);
        processedElements.add(select);
      }
    });

    // 6. Radio groups NOT in fieldsets
    const radioGroups = new Map();
    const radios = form.querySelectorAll('input[type="radio"]');
    radios.forEach((radio) => {
      if (processedElements.has(radio) || this.isElementHidden(radio)) return;

      const name = radio.name;
      if (!radioGroups.has(name)) {
        radioGroups.set(name, []);
      }
      radioGroups.get(name).push(radio);
    });

    radioGroups.forEach((radiosArr, name) => {
      const question = this.findQuestionForRadioGroup(radiosArr);
      const options = radiosArr.map((r) => ({
        value: r.value,
        text: this.getRadioOptionLabel(r),
        element: r,
      }));

      fields.push({
        type: "radio-group",
        name: name,
        label: question,
        element: radiosArr[0],
        options: options,
        required: radiosArr[0].required,
      });

      radiosArr.forEach((r) => processedElements.add(r));
    });

    // 7. Checkboxes
    const checkboxes = form.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
      if (processedElements.has(checkbox) || this.isElementHidden(checkbox))
        return;

      const field = this.extractFieldInfo(checkbox, "checkbox");
      if (field) {
        fields.push(field);
        processedElements.add(checkbox);
      }
    });

    console.log(
      `📋 Found ${fields.length} fields:`,
      fields.map((f) => ({ label: f.label || f.name, type: f.type }))
    );
    return fields;
  }

  /**
   * Extract field info from a DOM element
   */
  extractFieldInfo(element, type) {
    if (!element) return null;
    if (this.isElementHidden(element)) return null;

    const label = this.getLabelText(element);
    const placeholder = element.placeholder || "";
    const name = element.name || element.id || "";
    const currentValue = element.value || "";

    return {
      type: type,
      element: element,
      label: label || placeholder || name,
      placeholder: placeholder,
      name: name,
      id: element.id,
      value: currentValue,
      disabled: element.disabled,
      required:
        element.required || element.getAttribute("aria-required") === "true",
    };
  }

  /**
   * Get label text for a form element
   */
  getLabelText(element) {
    // 1. Check for label with "for" attribute
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) {
        const hasRadio = label.querySelector('input[type="radio"]');
        if (!hasRadio) return this.cleanText(label.textContent);
      }
    }

    // 2. Check for parent label (common for Jobvite checkboxes)
    const parentLabel = element.closest("label");
    if (parentLabel) {
      // For Jobvite checkboxes like "I acknowledge*", get all text content
      const labelText = parentLabel.textContent.trim().replace(/\s+/g, " ");
      if (labelText) return labelText;
    }

    // 3. Check for aria-label
    if (element.getAttribute("aria-label")) {
      return element.getAttribute("aria-label").trim();
    }

    // 4. Check fieldset legend (for checkbox/radio groups)
    const fieldset = element.closest("fieldset.jv-input-group");
    if (fieldset) {
      const legend = fieldset.querySelector("legend.jv-form-field-legend");
      if (legend) {
        const legendText = this.cleanText(legend.textContent);
        if (legendText) return legendText;
      }
    }

    // 5. Check container for labels
    const container = element.closest(
      ".jv-form-field, .jv-form-field-input, fieldset, .form-group, .jv-prescreen-element"
    );
    if (container) {
      // Check for section header (common in prescreening)
      const sectionHeader = container.querySelector(
        "h4.jv-prescreen-section-header"
      );
      if (sectionHeader) {
        return this.cleanText(sectionHeader.textContent);
      }

      const label = container.querySelector(".jv-form-field-label, label");
      if (label) {
        const hasRadioInside = label.querySelector(
          'input[type="radio"], input[type="checkbox"]'
        );
        if (!hasRadioInside) return this.cleanText(label.textContent);
        // If label wraps input, get full text
        return this.cleanText(label.textContent);
      }
    }

    // 6. Placeholder as fallback
    return element.placeholder || element.name || "";
  }

  /**
   * Get the label for a specific radio option
   */
  getRadioOptionLabel(radio) {
    if (radio.id) {
      const label = document.querySelector(`label[for="${radio.id}"]`);
      if (label) {
        return label.textContent.trim().replace(/\s+/g, " ");
      }
    }

    const parentLabel = radio.closest("label");
    if (parentLabel) {
      return parentLabel.textContent.trim().replace(/\s+/g, " ");
    }

    return radio.value || "Unknown";
  }

  /**
   * Find the QUESTION for a radio group
   */
  findQuestionForRadioGroup(radios) {
    const firstRadio = radios[0];

    const container = firstRadio.closest(
      "fieldset, .jv-form-field, .radio-group, .form-group"
    );

    if (container) {
      const legend = container.querySelector("legend, .jv-form-field-legend");
      if (legend) return this.cleanText(legend.textContent);

      const heading = container.querySelector("h1, h2, h3, h4, h5, h6");
      if (heading) return this.cleanText(heading.textContent);

      const labels = container.querySelectorAll("label");
      for (const label of labels) {
        const hasRadio = label.querySelector('input[type="radio"]');
        if (!hasRadio) return this.cleanText(label.textContent);
      }
    }

    return firstRadio.name.replace(/[_-]/g, " ").trim();
  }

  // ============ Button Detection ============

  findContinueButton() {
    console.log("🔍 Looking for continue/submit button...");

    let submitButton = null;
    let nextButton = null;

    // Jobvite-specific selectors - check these first (most reliable)
    // Next button: <button ng-show="showNextButton()" ng-click="nextStep()">Next →</button>
    const jvNextButton = document.querySelector(
      'button[ng-click="nextStep()"]:not(.ng-hide), ' +
        'button[ng-show="showNextButton()"]:not(.ng-hide), ' +
        'button.jv-button-primary[aria-label="Next"]:not(.ng-hide)'
    );

    if (jvNextButton && this.isButtonVisible(jvNextButton)) {
      console.log("🔘 Found Jobvite NEXT button via specific selector");
      nextButton = {
        element: jvNextButton,
        text: jvNextButton.textContent.trim(),
        type: "next",
      };
    }

    // Submit button: <button type="submit">Send Application</button>
    const jvSubmitButton = document.querySelector(
      'button[type="submit"]:not(.ng-hide), ' +
        'button.jv-button-primary[aria-label*="Submit"]:not(.ng-hide), ' +
        'button.jv-button-primary[aria-label*="Send"]:not(.ng-hide)'
    );

    if (jvSubmitButton && this.isButtonVisible(jvSubmitButton)) {
      const text = jvSubmitButton.textContent.trim().toLowerCase();
      if (
        text.includes("send") ||
        text.includes("submit") ||
        text.includes("apply")
      ) {
        console.log("🔘 Found Jobvite SUBMIT button via specific selector");
        submitButton = {
          element: jvSubmitButton,
          text: jvSubmitButton.textContent.trim(),
          type: "submit",
        };
      }
    }

    // Fallback: Scan all buttons if specific selectors didn't work
    if (!submitButton && !nextButton) {
      console.log("🔍 Fallback: scanning all buttons...");
      const allButtons = document.querySelectorAll("button");

      for (const button of allButtons) {
        // Skip hidden buttons (Angular ng-hide)
        if (button.classList.contains("ng-hide")) continue;
        if (!this.isButtonVisible(button)) continue;

        const text = button.textContent.trim().toLowerCase();
        const ariaLabel = (
          button.getAttribute("aria-label") || ""
        ).toLowerCase();

        // Check for Submit button (highest priority)
        if (
          text.includes("send application") ||
          text.includes("submit") ||
          ariaLabel.includes("submit") ||
          ariaLabel.includes("send")
        ) {
          console.log(
            "🔘 Found SUBMIT button (fallback):",
            button.textContent.trim()
          );
          submitButton = {
            element: button,
            text: button.textContent.trim(),
            type: "submit",
          };
        }
        // Check for Next button (second priority)
        else if (text.includes("next") || ariaLabel === "next") {
          console.log(
            "🔘 Found NEXT button (fallback):",
            button.textContent.trim()
          );
          nextButton = {
            element: button,
            text: button.textContent.trim(),
            type: "next",
          };
        }
      }
    }

    // Return in priority order: Submit > Next
    if (submitButton) {
      console.log("✅ Selecting SUBMIT button (highest priority)");
      return submitButton;
    }
    if (nextButton) {
      console.log("✅ Selecting NEXT button (second priority)");
      return nextButton;
    }

    console.warn("⚠️ No action button found");
    return null;
  }

  /**
   * Check if button is truly visible (handles Angular ng-show/ng-hide)
   */
  isButtonVisible(button) {
    if (!button) return false;

    // Check ng-hide class (Angular visibility)
    if (button.classList.contains("ng-hide")) return false;

    // Check computed style
    const style = window.getComputedStyle(button);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }

    // Check if button has dimensions
    const rect = button.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    return true;
  }

  // ============ AI Integration ============

  async getAIAnswers(fields) {
    console.log(
      "📝 Processing fields for AI:",
      fields.map((f) => ({ label: f.label, type: f.type, name: f.name }))
    );

    const answers = {};

    for (const field of fields) {
      if (field.disabled) continue;

      const fieldKey = field.id || field.name || field.label;
      const question = field.label || field.placeholder || field.name || "";

      if (!question) continue;

      console.log(`🔄 AI processing: "${question}" (type: ${field.type})`);

      // ===== PRESCREENING DEFAULTS (fast, no AI needed) =====

      // Checkboxes that should always be checked (acknowledgments, certifications)
      if (field.type === "checkbox") {
        const qLower = question.toLowerCase();
        if (
          qLower.includes("i acknowledge") ||
          qLower.includes("i certify") ||
          qLower.includes("i agree") ||
          qLower.includes("i understand") ||
          qLower.includes("i accept") ||
          qLower.includes("i consent")
        ) {
          answers[fieldKey] = "Yes";
          console.log(`✅ Prescreening checkbox: "${question}" → "Yes"`);
          continue;
        }
      }

      // Common prescreening Yes/No questions with safe defaults
      if (field.type === "radio-group" || field.type === "checkbox") {
        const qLower = question.toLowerCase();

        // Questions that should typically be answered "No"
        if (
          (qLower.includes("former") && qLower.includes("employee")) ||
          (qLower.includes("current") && qLower.includes("employee")) ||
          qLower.includes("currently employed by the federal")
        ) {
          answers[fieldKey] = "No";
          console.log(`✅ Prescreening default: "${question}" → "No"`);
          continue;
        }

        // Citizenship questions - default to user profile or "Yes" for US jobs
        if (qLower.includes("us citizen") || qLower.includes("u.s. citizen")) {
          const citizenship = this.userData?.citizenship || "Yes";
          answers[fieldKey] = citizenship.toLowerCase().includes("yes")
            ? "Yes"
            : "No";
          console.log(`✅ Citizenship: "${question}" → "${answers[fieldKey]}"`);
          continue;
        }

        // Security clearance - default to No unless user has one
        if (qLower.includes("security clearance")) {
          const hasClearance = this.userData?.securityClearance || "No";
          answers[fieldKey] = hasClearance.toLowerCase().includes("yes")
            ? "Yes"
            : "No";
          console.log(
            `✅ Security clearance: "${question}" → "${answers[fieldKey]}"`
          );
          continue;
        }
      }

      // OFCCP defaults (no AI needed for EEO questions)
      if (field.type === "radio-group") {
        const ofccpAnswer = this.getOFCCPAnswer(
          question,
          field.options?.map((o) => o.text) || []
        );
        if (ofccpAnswer !== null) {
          answers[fieldKey] = ofccpAnswer;
          console.log(`✅ OFCCP answer: "${question}" → "${ofccpAnswer}"`);
          continue;
        }
      }

      // AI answer
      try {
        let answer = null;
        const context = {
          userData: this.userData,
          jobDescription: this.jobDescription,
          fieldType: field.type,
          required: field.required,
        };

        if (field.type === "select" || field.type === "radio-group") {
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
        } else if (field.type === "date") {
          // Use today's date
          answer = this.getTodayDate();
        } else {
          answer = await this.aiService.getNormalAnswer(question, [], context);
        }

        if (answer) {
          answers[fieldKey] = answer;
          console.log(`✅ AI answer: "${question}" → "${answer}"`);
        }
      } catch (error) {
        console.error(`❌ AI error for "${question}":`, error.message);
      }
    }

    return answers;
  }

  /**
   * Get OFCCP/EEO field answers - use safe "Decline" defaults
   */
  getOFCCPAnswer(label, options) {
    const l = label.toLowerCase();

    // Gender
    if (l.includes("gender")) {
      const decline = options.find((o) => o.toLowerCase().includes("decline"));
      return decline || "Decline to Self Identify";
    }

    // Hispanic/Latino
    if (l.includes("hispanic") || l.includes("latino")) {
      const decline = options.find((o) => o.toLowerCase().includes("decline"));
      return decline || "Decline to Self Identify";
    }

    // Race
    if (l.includes("race") || l.includes("what race do you")) {
      const decline = options.find((o) => o.toLowerCase().includes("decline"));
      return decline || "Decline to Self Identify";
    }

    // Veteran status
    if (
      l.includes("veteran") ||
      l.includes("vevraa") ||
      l.includes("choose one")
    ) {
      const decline = options.find(
        (o) =>
          o.toLowerCase().includes("decline") ||
          o.toLowerCase().includes("not a protected veteran")
      );
      return decline || "DECLINE SELF-IDENTIFICATION";
    }

    // Disability
    if (
      l.includes("disability") ||
      l.includes("please check one of the boxes")
    ) {
      const decline = options.find(
        (o) =>
          o.toLowerCase().includes("do not want to answer") ||
          o.toLowerCase().includes("decline")
      );
      return decline || "I do not want to answer";
    }

    return null;
  }

  getTodayDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // ============ Field Filling ============

  async fillFields(fields, answers) {
    let filledCount = 0;

    notifyStatus({ type: "FILLING_FORM" });

    for (const field of fields) {
      if (field.disabled) continue;

      const fieldKey = field.id || field.name || field.label;
      let answer = answers[fieldKey];

      // Try matching by label if no direct match
      if (!answer) {
        const labelMatch = Object.entries(answers).find(
          ([key]) =>
            key.toLowerCase().includes(field.label?.toLowerCase() || "") ||
            field.label?.toLowerCase().includes(key.toLowerCase())
        );
        if (labelMatch) answer = labelMatch[1];
      }

      if (answer !== undefined && answer !== null) {
        const success = await this.fillSingleField(field, answer);
        if (success) filledCount++;

        // Human-like delay between fields to avoid captcha
        await this.humanDelayField();
      }
    }

    // Delay after filling section
    await this.humanDelaySection();

    console.log(`✏️ Filled ${filledCount} of ${fields.length} fields`);
    return filledCount;
  }

  async fillSingleField(field, value) {
    const element = field.element;
    if (!element) return false;

    try {
      console.log(`📝 Filling "${field.label || field.name}": "${value}"`);

      switch (field.type) {
        case "text":
        case "textarea":
        case "date":
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          await this.sleep(150); // Wait for scroll
          element.focus();
          await this.sleep(200); // Focus delay
          element.value = "";
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.value = value;
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
          element.dispatchEvent(new Event("blur", { bubbles: true }));
          // Trigger Angular
          this.triggerAngularUpdate(element);
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
            this.triggerAngularUpdate(element);
          }
          break;

        case "radio-group":
          const matchingRadio = field.options?.find(
            (o) =>
              o.value === value ||
              o.text === value ||
              o.text.toLowerCase().includes(value.toLowerCase()) ||
              value.toLowerCase().includes(o.text.toLowerCase())
          );
          if (matchingRadio?.element) {
            const parentLabel = matchingRadio.element.closest("label");
            matchingRadio.element.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
            await this.sleep(200);
            if (parentLabel) {
              parentLabel.click();
            } else {
              matchingRadio.element.click();
            }
            this.triggerAngularUpdate(matchingRadio.element);
          }
          break;

        case "checkbox":
          const shouldCheck =
            value === true ||
            value === "true" ||
            value.toLowerCase?.() === "yes" ||
            value === "1";
          if (element.checked !== shouldCheck) {
            element.click();
            this.triggerAngularUpdate(element);
          }
          break;

        default:
          console.log(`⚠️ Unknown field type: ${field.type}`);
          return false;
      }

      await this.sleep(150);
      return true;
    } catch (error) {
      console.error(`❌ Error filling field:`, error);
      return false;
    }
  }

  triggerAngularUpdate(element) {
    try {
      if (typeof angular !== "undefined") {
        const scope = angular.element(element).scope();
        if (scope && scope.$apply) {
          scope.$apply();
        }
      }
    } catch (e) {
      // Angular not available
    }
  }

  // ============ Button Clicking ============

  async clickButton(buttonData) {
    if (!buttonData?.element) {
      console.warn("⚠️ No button to click");
      return false;
    }

    const button = buttonData.element;
    console.log(`🖱️ Clicking: "${buttonData.text}"`);

    button.scrollIntoView({ behavior: "smooth", block: "center" });
    await this.sleep(300);

    button.focus();
    button.click();
    button.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );

    return true;
  }

  // ============ Step Handlers ============

  async handleContactInfoStep() {
    console.log("📝 Processing CONTACT_INFO step");

    // Handle file uploads ONLY ONCE
    if (this.fileHandler && !this.filesUploaded) {
      notifyStatus({ type: "UPLOADING_FILES" });
      try {
        const form = document.querySelector('form[name="scopeData.applyForm"]');
        if (form) {
          await this.fileHandler.handleFileUploads(
            form,
            this.userData,
            this.jobDescription,
            this.currentJobTitle || ""
          );
          this.filesUploaded = true; // Mark files as uploaded
          console.log("✅ Files uploaded, will not repeat");
        }
      } catch (error) {
        console.error("Error handling file uploads:", error);
      }
      await this.sleep(1000);
    } else if (this.filesUploaded) {
      console.log("⏭️ Skipping file uploads (already done)");
    }

    // ALWAYS check for visible invalid required checkboxes first (work auth, sponsorship, etc.)
    // These may appear even on "already processed" steps
    const invalidCheckboxes = document.querySelectorAll(
      ".jv-form-field-checkbox.ng-invalid-required:not(.ng-hide), " +
        ".jv-form-field-checkbox.jv-invalid-field:not(.ng-hide)"
    );

    if (invalidCheckboxes.length > 0) {
      console.log(
        `🔍 Found ${invalidCheckboxes.length} visible invalid checkbox groups - must fill these first`
      );
      await this.checkRequiredPrescreeningCheckboxes();
      await this.sleep(500);
    }

    // Generate a signature for this step's VISIBLE form fields (excluding resume section)
    const stepSignature = this.generateStepSignature();

    // Check if we've already processed this exact step configuration
    // BUT only skip if there are NO remaining invalid fields
    const hasInvalidFields = document.querySelector(
      ".jv-form-field.ng-invalid:not(.ng-hide), " +
        ".jv-invalid-field:not(.ng-hide)"
    );

    if (this.processedStepSignatures.has(stepSignature) && !hasInvalidFields) {
      console.log(
        "⏭️ Skipping already processed step (same fields, no invalid)"
      );
      return;
    }

    // Extract and fill form fields
    const fields = this.extractFormFields();

    if (fields.length > 0) {
      const answers = await this.getAIAnswers(fields);
      await this.fillFields(fields, answers);
    } else {
      console.log("ℹ️ No fillable fields found in this step");
    }

    // Mark this step as processed
    this.processedStepSignatures.add(stepSignature);
  }
  /**
   * Handle Data Consent page (appears before main form)
   * Selects country/location and clicks I Accept button
   */
  async handleConsentStep() {
    console.log("📜 Processing CONSENT step (Data Privacy)");

    const consentForm = document.querySelector(
      '[ng-controller="JVConsentForm"], form[name="consentForm"]'
    );

    if (!consentForm) {
      console.warn("⚠️ Consent form not found");
      return;
    }

    // Step 1: Select location/country (prefer "United States - English")
    const countrySelect = consentForm.querySelector(
      '#jv-country-select, select[id*="country"]'
    );

    if (countrySelect && !countrySelect.value) {
      console.log("🌍 Selecting country/location...");

      // Find United States option
      const usOption = Array.from(countrySelect.options).find((opt) =>
        opt.text.toLowerCase().includes("united states")
      );

      if (usOption) {
        countrySelect.value = usOption.value;
        countrySelect.dispatchEvent(new Event("change", { bubbles: true }));
        this.triggerAngularUpdate(countrySelect);
        console.log(`✅ Selected: "${usOption.text}"`);

        // Wait for consent details to load
        await this.sleep(1500);
      } else {
        // Fallback to first non-empty option
        const firstOption = Array.from(countrySelect.options).find(
          (opt) => opt.value
        );
        if (firstOption) {
          countrySelect.value = firstOption.value;
          countrySelect.dispatchEvent(new Event("change", { bubbles: true }));
          this.triggerAngularUpdate(countrySelect);
          console.log(`✅ Selected fallback: "${firstOption.text}"`);
          await this.sleep(1500);
        }
      }
    }

    // Step 2: Click "I Accept" button (find by text content since :contains is not valid CSS)
    const buttons = consentForm.querySelectorAll(
      'button[type="submit"], button.jv-button-primary'
    );
    const iAcceptBtn = Array.from(buttons).find((btn) =>
      btn.textContent.trim().toLowerCase().includes("i accept")
    );

    if (iAcceptBtn) {
      console.log("✅ Clicking 'I Accept' button...");
      iAcceptBtn.scrollIntoView({ behavior: "smooth", block: "center" });
      await this.sleep(300);
      iAcceptBtn.click();

      // Wait for page transition
      await this.sleep(2000);
    } else {
      console.warn("⚠️ 'I Accept' button not found");
    }
  }

  async handleVoluntarySelfIdStep() {
    console.log("📊 Processing VOLUNTARY_SELF_ID step (OFCCP/EEO)");
    const fields = this.extractFormFields();
    const answers = await this.getAIAnswers(fields);
    await this.fillFields(fields, answers);
  }

  async handleQuestionsStep() {
    console.log("❓ Processing QUESTIONS step");

    // STEP 1: Direct checkbox handling for prescreening steps
    // This handles "I acknowledge", "I certify", etc. without needing AI
    await this.checkRequiredPrescreeningCheckboxes();

    // STEP 2: Handle remaining fields via extraction + AI
    const fields = this.extractFormFields();
    const answers = await this.getAIAnswers(fields);
    await this.fillFields(fields, answers);
  }

  /**
   * Directly check all required/invalid prescreening checkboxes in the visible step
   * This bypasses the normal extraction and just clicks checkboxes that need to be checked
   */
  async checkRequiredPrescreeningCheckboxes() {
    console.log("🔍 Checking required prescreening checkboxes...");
    let checkedCount = 0;

    // Find the visible step
    const visibleStep = document.querySelector(
      '.jv-apply-step:not(.ng-hide), [ng-if*="showStep"]:not(.ng-hide)'
    );
    const container =
      visibleStep || document.querySelector('form[name="scopeData.applyForm"]');

    if (!container) {
      console.log("⚠️ No form container found");
      return checkedCount;
    }

    // Find all required/invalid checkbox containers
    // These have: ng-invalid-required or jv-invalid-field class
    const invalidCheckboxContainers = container.querySelectorAll(
      ".jv-form-field-checkbox.ng-invalid-required, " +
        ".jv-form-field-checkbox.jv-invalid-field, " +
        ".jv-prescreen-element-iagreecheckbox.ng-invalid-required, " +
        ".jv-prescreen-element-checkboxes.ng-invalid-required"
    );

    console.log(
      `📋 Found ${invalidCheckboxContainers.length} invalid checkbox containers`
    );

    for (const container of invalidCheckboxContainers) {
      // Find all checkboxes in this container
      const checkboxes = container.querySelectorAll('input[type="checkbox"]');

      for (const checkbox of checkboxes) {
        // Get the label text for this checkbox
        const parentLabel = checkbox.closest("label");
        const labelText = parentLabel
          ? parentLabel.textContent.trim().toLowerCase()
          : "";

        // Determine what to do based on label
        let shouldCheck = false;

        // Get the fieldset legend for Yes/No checkbox groups
        const fieldset = checkbox.closest("fieldset.jv-input-group");
        const legend = fieldset?.querySelector("legend.jv-form-field-legend");
        const questionText = legend ? legend.textContent.toLowerCase() : "";

        // Always check agreement/acknowledgment checkboxes
        if (
          labelText.includes("i acknowledge") ||
          labelText.includes("i certify") ||
          labelText.includes("i agree") ||
          labelText.includes("i understand") ||
          labelText.includes("i accept") ||
          labelText.includes("i consent") ||
          labelText.includes("do you agree") ||
          labelText.includes("true and complete")
        ) {
          shouldCheck = true;
        }
        // Handle YES/NO checkbox groups based on the question
        else if (labelText === "yes" || labelText === "no") {
          // Work authorization: "Are you legally permitted to work in the U.S?" → YES
          if (
            questionText.includes("legally permitted to work") ||
            questionText.includes("legally authorized to work") ||
            questionText.includes("authorized to work")
          ) {
            shouldCheck = labelText === "yes";
          }
          // Sponsorship: "Will you require sponsorship?" → depends on user, default NO
          else if (
            questionText.includes("require sponsorship") ||
            questionText.includes("visa sponsorship") ||
            questionText.includes("h-1b")
          ) {
            // Use user profile if available, otherwise default to No
            const needsSponsorship =
              this.userData?.requiresSponsorship || false;
            shouldCheck = needsSponsorship
              ? labelText === "yes"
              : labelText === "no";
          }
          // Government/federal employment questions → NO
          else if (
            questionText.includes("employed") &&
            (questionText.includes("government") ||
              questionText.includes("federal"))
          ) {
            shouldCheck = labelText === "no";
          }
          // Generic positive questions → YES by default
          else if (
            questionText.includes("willing") ||
            questionText.includes("able to")
          ) {
            shouldCheck = labelText === "yes";
          }
        }
        // For certification checkboxes with long text
        else if (
          labelText.includes("certify") ||
          labelText.includes("true and complete")
        ) {
          shouldCheck = true;
        }

        // Check the checkbox if needed
        if (shouldCheck && !checkbox.checked) {
          console.log(`✅ Checking: "${labelText.substring(0, 50)}..."`);

          // Click the parent label for Angular to detect
          if (parentLabel) {
            parentLabel.scrollIntoView({ behavior: "smooth", block: "center" });
            await this.sleep(100);
            parentLabel.click();
          } else {
            checkbox.click();
          }

          this.triggerAngularUpdate(checkbox);
          checkedCount++;
          await this.sleep(200);
        }
      }
    }

    // STEP 2: Handle multi-checkbox skill/experience questions with AI
    await this.handleMultiCheckboxQuestionsWithAI(container);

    console.log(`✅ Checked ${checkedCount} prescreening checkboxes`);
    return checkedCount;
  }

  /**
   * Handle multi-checkbox questions like "What programming languages do you have experience with?"
   * Uses AI to determine which options to select based on user profile
   */
  async handleMultiCheckboxQuestionsWithAI(container) {
    if (!container) return;

    // Find multi-checkbox groups that are still invalid (not Yes/No type)
    const multiCheckboxContainers = container.querySelectorAll(
      ".jv-prescreen-element-checkboxes.ng-invalid-required"
    );

    for (const multiContainer of multiCheckboxContainers) {
      const fieldset = multiContainer.querySelector("fieldset.jv-input-group");
      if (!fieldset) continue;

      const legend = fieldset.querySelector("legend.jv-form-field-legend");
      const questionText = legend ? legend.textContent.trim() : "";

      // Get all checkbox options
      const checkboxLabels = multiContainer.querySelectorAll(
        "label.jv-input-group-row"
      );
      if (checkboxLabels.length < 3) continue; // Skip Yes/No groups (handled above)

      // Extract option texts
      const options = [];
      const checkboxElements = [];
      for (const label of checkboxLabels) {
        const text = label.textContent.trim();
        const checkbox = label.querySelector('input[type="checkbox"]');
        if (text && checkbox && !checkbox.checked) {
          options.push(text);
          checkboxElements.push({ label, checkbox, text });
        }
      }

      if (options.length === 0) continue; // All already checked or no options

      console.log(`🤖 Multi-checkbox AI question: "${questionText}"`);
      console.log(`   Options: ${options.join(", ")}`);

      // Call AI to get which options to select
      let selectedOptions = [];
      try {
        const answer = await this.aiService.getMultiSelectAnswer(
          questionText,
          options,
          {
            userData: this.userData,
            jobDescription: this.jobDescription,
            required: true,
          }
        );

        // Parse AI response - could be comma-separated or array
        if (Array.isArray(answer)) {
          selectedOptions = answer;
        } else if (typeof answer === "string") {
          // Handle comma-separated response
          selectedOptions = answer
            .split(",")
            .map((s) => s.trim().toLowerCase());
        }
      } catch (error) {
        console.warn(`⚠️ AI error for multi-checkbox: ${error.message}`);
        // Fallback: select first option to satisfy required field
        selectedOptions = [options[0].toLowerCase()];
      }

      console.log(`   AI selected: ${selectedOptions.join(", ")}`);

      // Click the selected options
      for (const { label, checkbox, text } of checkboxElements) {
        const textLower = text.toLowerCase();
        const shouldSelect = selectedOptions.some(
          (sel) => textLower.includes(sel) || sel.includes(textLower)
        );

        if (shouldSelect && !checkbox.checked) {
          console.log(`   ✅ Selecting: "${text}"`);
          label.scrollIntoView({ behavior: "smooth", block: "center" });
          await this.sleep(100);
          label.click();
          this.triggerAngularUpdate(checkbox);
          await this.sleep(200);
        }
      }
    }
  }

  async handleReviewStep() {
    console.log("📋 Processing REVIEW step - ready to submit");
    // Nothing to fill, just ready to submit
  }

  // ============ Main Entry Point (Indeed Pattern) ============

  async fillCompleteForm() {
    console.log("🚀 fillCompleteForm starting (Jobvite - Indeed pattern)...");

    try {
      while (this.currentStepCount < this.maxSteps) {
        this.currentStepCount++;

        // Co-pilot user control check
        if (this.copilotMode && this.userHasControl) {
          await this.sleep(1000);
          continue;
        }

        const stepType = this.detectStepFromDom();
        const stepSignature = this.generateStepSignature();
        console.log(`📍 Step ${this.currentStepCount}: ${stepType}`);

        // Loop detection: Check if we're stuck on the same step
        if (
          stepType === this.lastDetectedStep &&
          stepSignature === this.lastStepSignature
        ) {
          this.sameStepCounter++;
          console.warn(`⚠️ Same step detected ${this.sameStepCounter} times`);

          if (this.sameStepCounter >= 3) {
            console.error(
              "❌ Detected infinite loop on same step, breaking out"
            );
            notifyStatus({
              type: "APPLICATION_ERROR",
              data: { error: "Form appears stuck on the same step" },
            });
            return false;
          }
        } else {
          // Different step, reset counter
          this.sameStepCounter = 0;
          this.lastDetectedStep = stepType;
          this.lastStepSignature = stepSignature;
        }

        // Check for success
        if (stepType === StepType.SUCCESS) {
          console.log("✅ Application submitted successfully!");
          notifyStatus({ type: "APPLICATION_SUBMITTED" });
          return true;
        }

        // Process step
        switch (stepType) {
          case StepType.CONSENT:
            await this.handleConsentStep();
            break;
          case StepType.CONTACT_INFO:
            await this.handleContactInfoStep();
            break;
          case StepType.VOLUNTARY_SELF_ID:
            await this.handleVoluntarySelfIdStep();
            break;
          case StepType.QUESTIONS:
            await this.handleQuestionsStep();
            break;
          case StepType.REVIEW:
            await this.handleReviewStep();
            break;
          default:
            console.log("⚠️ Unknown step, attempting generic form fill");
            const fields = this.extractFormFields();
            if (fields.length > 0) {
              const answers = await this.getAIAnswers(fields);
              await this.fillFields(fields, answers);
            }
        }

        // Human-like delay before looking for button
        await this.humanDelayStep();

        // Find and click button
        const buttonToClick = this.findContinueButton();

        // Co-pilot mode: pause for user review
        if (this.copilotMode && buttonToClick) {
          const isSubmit = buttonToClick.type === "submit";
          const messageType = isSubmit
            ? "COPILOT_SUBMIT_READY"
            : "COPILOT_WAITING_FOR_NEXT";

          notifyStatus({
            type: messageType,
            data: {
              buttonText: buttonToClick.text,
              title: this.currentJobTitle,
            },
          });

          if (this.copilotState) {
            if (isSubmit) {
              this.copilotState.setPendingSubmission(
                { title: this.currentJobTitle },
                buttonToClick.element
              );
            } else {
              this.copilotState.setPendingNext(
                { title: this.currentJobTitle },
                buttonToClick.element
              );
            }
          }

          const userAction = await this.waitForUserAction();
          console.log(`👤 User action: ${userAction}`);

          if (userAction === "SKIP") return false;
          if (userAction === "TAKE_CONTROL") {
            this.userHasControl = true;
            continue;
          }
        }

        // Click button
        if (buttonToClick) {
          // Human-like delay before clicking
          await this.humanDelayBeforeClick();
          await this.clickButton(buttonToClick);

          // CRITICAL: Wait for DOM to fully settle after step transition
          console.log("⏳ Waiting for new step to load...");
          await this.humanDelayStep();
          await this.waitForDomToSettle();
          console.log("✅ DOM settled, proceeding to next step");
        } else {
          console.warn("⚠️ No button found to proceed");
          await this.sleep(2000);
        }
      }

      console.warn(`⚠️ Reached max steps (${this.maxSteps})`);
      return false;
    } catch (error) {
      console.error("❌ fillCompleteForm error:", error);
      notifyStatus({
        type: "APPLICATION_ERROR",
        data: { error: error.message },
      });
      return false;
    }
  }

  // Alias for consistency
  async processApplicationForm() {
    return await this.fillCompleteForm();
  }

  // ============ Utility Methods ============

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  cleanText(text) {
    return text?.replace(/\*+/g, "").replace(/\s+/g, " ").trim() || "";
  }

  /**
   * Generate a unique signature for the current step based on visible form fields.
   * Used to detect when we're processing the same step repeatedly.
   */
  generateStepSignature() {
    const form =
      document.querySelector('form[name="scopeData.applyForm"]') ||
      document.querySelector("form");
    if (!form) return "no-form";

    // Get visible step container - prioritize visible sections
    const visibleSection = form.querySelector(
      ".jv-apply-section:not(.ng-hide) > h3"
    );
    const sectionName = visibleSection ? visibleSection.textContent.trim() : "";

    // Get visible step container
    const visibleStep = form.querySelector(
      '.jv-apply-step:not(.ng-hide), [ng-if*="showStep"]:not(.ng-hide)'
    );
    const container = visibleStep || form;

    // Collect field names/IDs from visible inputs (excluding file inputs and resume textareas)
    const inputs = container.querySelectorAll(
      'input[type="text"]:not(.ng-hide), ' +
        'input[type="email"]:not(.ng-hide), ' +
        'input[type="tel"]:not(.ng-hide), ' +
        'input[type="checkbox"]:not(.ng-hide), ' +
        'input[type="radio"]:not(.ng-hide), ' +
        "select:not(.ng-hide)"
    );

    const fieldIds = [];
    inputs.forEach((input) => {
      // Skip hidden elements and resume-related fields
      if (this.isElementHidden(input)) return;
      if (input.closest(".jv-edit-resume")) return;
      if (input.id?.includes("resume") || input.name?.includes("resume"))
        return;

      fieldIds.push(input.name || input.id || "unknown");
    });

    // Include section name for better differentiation
    const signature = `${sectionName}|${fieldIds.sort().join("|")}`;
    console.log(`📋 Step signature: ${signature.substring(0, 60)}...`);
    return signature;
  }

  /**
   * Wait for DOM to stop changing (Angular/SPA rendering complete)
   */
  async waitForDomToSettle(timeout = 5000, stableTime = 500) {
    return new Promise((resolve) => {
      let lastMutationTime = Date.now();
      let resolved = false;

      const form =
        document.querySelector('form[name="scopeData.applyForm"]') ||
        document.querySelector("form") ||
        document.body;

      const observer = new MutationObserver(() => {
        lastMutationTime = Date.now();
      });

      observer.observe(form, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      const checkStable = () => {
        if (resolved) return;

        const timeSinceLastMutation = Date.now() - lastMutationTime;

        if (timeSinceLastMutation >= stableTime) {
          resolved = true;
          observer.disconnect();
          console.log(`🔄 DOM stable after ${stableTime}ms of no changes`);
          resolve();
        } else {
          setTimeout(checkStable, 100);
        }
      };

      setTimeout(checkStable, 200);

      // Timeout fallback
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          console.log("⚠️ DOM settle timeout, proceeding anyway");
          resolve();
        }
      }, timeout);
    });
  }
}

export { JobviteFormHandler };
export default JobviteFormHandler;
