import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";
/**
 * FormHandler - Indeed Form Automation
 * Direct DOM-based field detection and filling
 * No external extractor dependency - inline detection per step
 */

import { AIService } from "../../services/index.js";
import { AIResponseUtils } from "../../shared/utilities/index.js";

// Step types based on URL patterns
const StepType = {
  CONTACT_INFO: "CONTACT_INFO",
  RESUME_UPLOAD: "RESUME_UPLOAD",
  PRIVACY_SETTINGS: "PRIVACY_SETTINGS",
  EXPERIENCE: "EXPERIENCE",
  QUESTIONS: "QUESTIONS",
  DEMOGRAPHICS: "DEMOGRAPHICS",
  REVIEW: "REVIEW",
  SUCCESS: "SUCCESS",
  UNKNOWN: "UNKNOWN",
};

class FormHandler {
  constructor(config = {}) {
    // API configuration
    this.host = config.host;
    this.aiService = new AIService({
      aiApiHost: config.host,
      platform: "indeed",
    });

    // User data
    this.userData = config.userData || {};
    this.userPreferences = config.userPreferences || {};

    // Job context
    this.jobDescription = config.jobDescription || "";
    this.jobDescription = config.jobDescription || "";
    this.jobId = config.jobId || "";
    this.currentJobTitle = "";

    // Platform
    this.platform = config.platform || "indeed";

    // UI
    // Global overlay used via notifyStatus()

    // File handling
    this.fileHandler = config.fileHandler || null;

    // Co-pilot mode
    this.copilotMode = false;
    this.copilotState = null;
    this.userHasControl = false;

    // User action handling
    this.userActionPromise = null;
    this.userActionResolver = null;

    // URL tracking
    this.lastUrl = window.location.href;
    this.urlChangeResolver = null;

    // Max steps safety limit
    this.maxSteps = 25;
    this.currentStepCount = 0;

    console.log("✅ FormHandler initialized (direct detection mode)");
  }

  updateConfig(config = {}) {
    if (config.host) {
      this.host = config.host;
      this.aiService = new AIService({
        aiApiHost: config.host,
        platform: "indeed",
      });
    }
    if (config.userData) this.userData = config.userData;
    if (config.userPreferences) this.userPreferences = config.userPreferences;
    if (config.jobDescription) this.jobDescription = config.jobDescription;
    if (config.jobDescription) this.jobDescription = config.jobDescription;
    if (config.jobId) this.jobId = config.jobId;
    if (config.fileHandler) this.fileHandler = config.fileHandler;
  }

  // ============ URL-Based Step Detection ============

  detectStepFromUrl() {
    const url = window.location.href;

    if (url.includes("/post-apply")) return StepType.SUCCESS;
    if (url.includes("/contact-info-module")) return StepType.CONTACT_INFO;
    if (url.includes("/resume-selection-module/privacy-settings"))
      return StepType.PRIVACY_SETTINGS;
    if (url.includes("/resume-selection-module")) return StepType.RESUME_UPLOAD;
    if (url.includes("/resume-module/relevant-experience"))
      return StepType.EXPERIENCE;
    if (url.includes("/questions-module/questions")) return StepType.QUESTIONS;
    if (url.includes("/qualification-questions-module"))
      return StepType.QUESTIONS;
    if (url.includes("/demographic-questions-module"))
      return StepType.DEMOGRAPHICS;
    if (url.includes("/review-module")) return StepType.REVIEW;

    // Fallback: detect from DOM
    if (document.querySelector('[class*="qualification-questio"]'))
      return StepType.QUESTIONS;

    return StepType.UNKNOWN;
  }

  setupUrlChangeListener() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      this.onUrlChanged();
    };

    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      this.onUrlChanged();
    };

    window.addEventListener("popstate", () => this.onUrlChanged());
  }

  onUrlChanged() {
    const newUrl = window.location.href;
    if (newUrl !== this.lastUrl) {
      console.log(`🔄 URL changed: ${this.lastUrl} → ${newUrl}`);
      this.lastUrl = newUrl;
      if (this.urlChangeResolver) {
        this.urlChangeResolver(newUrl);
        this.urlChangeResolver = null;
      }
    }
  }

  waitForUrlChange(timeout = 10000) {
    return new Promise((resolve) => {
      const startUrl = window.location.href;
      this.urlChangeResolver = resolve;

      const startTime = Date.now();
      const checkUrl = () => {
        if (window.location.href !== startUrl) {
          if (this.urlChangeResolver) {
            this.urlChangeResolver(window.location.href);
            this.urlChangeResolver = null;
          }
          return;
        }
        if (Date.now() - startTime < timeout) {
          setTimeout(checkUrl, 200);
        } else {
          resolve(window.location.href);
        }
      };
      setTimeout(checkUrl, 500);
    });
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
   * Check if an element or any of its parents is hidden
   */
  isElementHidden(element) {
    if (!element) return true;
    let current = element;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0" ||
        current.hasAttribute("hidden") ||
        current.getAttribute("aria-hidden") === "true" ||
        current.type === "hidden"
      ) {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  }

  /**
   * Check if a field label indicates an availability/start date question
   */
  isAvailabilityQuestion(label) {
    if (!label) return false;
    const lowerLabel = label.toLowerCase();
    const patterns = [
      "when can you start",
      "start date",
      "available to start",
      "availability",
      "earliest start",
      "date you can begin",
      "date available",
      "when are you available",
      "commence",
      "join date",
    ];
    return patterns.some((pattern) => lowerLabel.includes(pattern));
  }

  /**
   * Convert AI relative time answer to actual date in MM/DD/YYYY format
   * AI may return: Immediate, 2 weeks, 1 month, 2 months, 3 months, More than 3 months
   */
  convertAvailabilityToDate(answer) {
    if (!answer) return null;

    const today = new Date();
    let targetDate = new Date(today);
    const lowerAnswer = answer.toLowerCase().trim();

    // Map relative time to days offset
    if (
      lowerAnswer === "immediate" ||
      lowerAnswer === "immediately" ||
      lowerAnswer === "asap"
    ) {
      // Already today
    } else if (lowerAnswer.includes("1 week") || lowerAnswer === "one week") {
      targetDate.setDate(today.getDate() + 7);
    } else if (lowerAnswer.includes("2 week") || lowerAnswer === "two weeks") {
      targetDate.setDate(today.getDate() + 14);
    } else if (
      lowerAnswer.includes("3 week") ||
      lowerAnswer === "three weeks"
    ) {
      targetDate.setDate(today.getDate() + 21);
    } else if (lowerAnswer.includes("1 month") || lowerAnswer === "one month") {
      targetDate.setDate(today.getDate() + 30);
    } else if (
      lowerAnswer.includes("2 month") ||
      lowerAnswer === "two months"
    ) {
      targetDate.setDate(today.getDate() + 60);
    } else if (
      lowerAnswer.includes("3 month") ||
      lowerAnswer === "three months"
    ) {
      targetDate.setDate(today.getDate() + 90);
    } else if (
      lowerAnswer.includes("more than 3") ||
      lowerAnswer.includes("more than three")
    ) {
      targetDate.setDate(today.getDate() + 120);
    } else {
      // If already a date format, try to parse it
      const parsed = new Date(answer);
      if (!isNaN(parsed.getTime())) {
        targetDate = parsed;
      }
    }

    // Format as MM/DD/YYYY
    const month = String(targetDate.getMonth() + 1).padStart(2, "0");
    const day = String(targetDate.getDate()).padStart(2, "0");
    const year = targetDate.getFullYear();

    return `${month}/${day}/${year}`;
  }

  /**
   * Detect reCAPTCHA on the page
   */
  detectRecaptcha() {
    // Check for various reCAPTCHA indicators - only actual visible captcha elements
    const recaptchaSelectors = [
      ".g-recaptcha",
      "#rc-anchor-container",
      'iframe[src*="recaptcha"]',
      ".rc-anchor-checkbox",
      '[data-testid*="captcha"]',
      '[class*="captcha-challenge"]',
    ];

    for (const selector of recaptchaSelectors) {
      const element = document.querySelector(selector);
      if (element && !this.isElementHidden(element)) {
        console.log(`🔐 reCAPTCHA detected: ${selector}`);
        return true;
      }
    }

    // Check for visible "I'm not a robot" checkbox specifically
    // Don't check for generic text like "recaptcha" as it appears in footers
    const checkboxLabel = document.querySelector(
      '.recaptcha-checkbox-border, [aria-label*="not a robot"]'
    );
    if (checkboxLabel && !this.isElementHidden(checkboxLabel)) {
      console.log("🔐 reCAPTCHA checkbox detected");
      return true;
    }

    return false;
  }

  /**
   * Extract all form fields directly from the DOM
   * Returns array of field objects with element references
   */
  extractFormFields() {
    // Notify user about field extraction
    if (true) {
      // Global overlay
      notifyStatus({ type: "WAITING_FOR_RESPONSE" });
    }
    const fields = [];
    const form =
      document.querySelector("form") ||
      document.querySelector('[class*="apply"]') ||
      document.body;

    // 1. Text inputs (including email, tel, number, date)
    const textInputs = form.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="date"], input:not([type])'
    );
    textInputs.forEach((input) => {
      // Skip hidden, file, checkbox, and radio inputs
      if (
        input.type === "hidden" ||
        input.type === "file" ||
        input.type === "checkbox" ||
        input.type === "radio"
      )
        return;

      // Skip if element or any parent is hidden
      if (this.isElementHidden(input)) {
        console.log(`⏭️ Skipping hidden field: ${input.name || input.id}`);
        return;
      }

      const fieldType = input.type;
      const field = this.extractFieldInfo(input, fieldType);
      if (field) fields.push(field);
    });

    // 2. Textareas
    const textareas = form.querySelectorAll("textarea");
    textareas.forEach((textarea) => {
      if (this.isElementHidden(textarea)) return;
      const field = this.extractFieldInfo(textarea, "textarea");
      if (field) fields.push(field);
    });

    // 3. Selects (dropdowns)
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

    // 4. Radio button groups - CRITICAL: Separate question from option labels
    const radioGroups = new Map();
    const radios = form.querySelectorAll('input[type="radio"]');
    radios.forEach((radio) => {
      if (this.isElementHidden(radio)) return;
      const name = radio.name;
      if (!radioGroups.has(name)) {
        radioGroups.set(name, []);
      }
      radioGroups.get(name).push(radio);
    });

    radioGroups.forEach((radios, name) => {
      // Get the QUESTION (not the options)
      let question = this.findQuestionForRadioGroup(radios);
      // Get the OPTIONS (each radio's own label)
      const options = radios.map((r) => ({
        value: r.value,
        text: this.getRadioOptionLabel(r),
        element: r,
      }));

      // If question is empty or looks like a hash, try to infer from options
      if (!question || question.match(/^q[_ ][a-f0-9]{20,}$/i)) {
        const inferredQuestion = this.inferQuestionFromOptions(options);
        if (inferredQuestion) {
          console.log(`📋 Inferred question from options: "${inferredQuestion}"`);
          question = inferredQuestion;
        }
      }

      console.log(
        `📻 Radio group "${name}": Question="${question}", Options=[${options
          .map((o) => o.text)
          .join(", ")}]`
      );

      fields.push({
        type: "radio-group",
        name: name,
        label: question,
        element: radios[0],
        options: options,
        disabled: radios[0].disabled,
      });
    });

    // 5. Checkbox groups - group by name (like radio groups) for multi-select questions
    const checkboxGroups = new Map();
    const checkboxes = form.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
      if (this.isElementHidden(checkbox)) return;
      const name = checkbox.name;
      if (!checkboxGroups.has(name)) {
        checkboxGroups.set(name, []);
      }
      checkboxGroups.get(name).push(checkbox);
    });

    checkboxGroups.forEach((checkboxesInGroup, name) => {
      // If only one checkbox with this name, treat as single checkbox (Yes/No toggle)
      if (checkboxesInGroup.length === 1) {
        const checkbox = checkboxesInGroup[0];
        const field = this.extractFieldInfo(checkbox, "checkbox");
        if (field) fields.push(field);
        return;
      }

      // Multiple checkboxes with same name = multi-select question
      // Get the QUESTION (from fieldset legend or container)
      let question = this.findQuestionForCheckboxGroup(checkboxesInGroup);
      // Get the OPTIONS (each checkbox's own label)
      const options = checkboxesInGroup.map((cb) => ({
        value: cb.value,
        text: this.getCheckboxOptionLabel(cb),
        element: cb,
      }));

      // If question is empty or looks like a hash, try to infer from options
      if (!question || question.match(/^[A-Za-z_][a-f0-9]{20,}$/i)) {
        const inferredQuestion = this.inferQuestionFromOptions(options);
        if (inferredQuestion) {
          console.log(`📋 Inferred checkbox question from options: "${inferredQuestion}"`);
          question = inferredQuestion;
        }
      }

      console.log(
        `☑️ Checkbox group "${name}": Question="${question}", Options=[${options
          .map((o) => o.text)
          .join(", ")}]`
      );

      fields.push({
        type: "checkbox-group",
        name: name,
        label: question,
        element: checkboxesInGroup[0],
        options: options,
        disabled: checkboxesInGroup[0].disabled,
      });
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

    // Skip hidden elements (including parent hierarchy)
    if (this.isElementHidden(element)) {
      return null;
    }

    const label = this.getLabelText(element);
    const placeholder = element.placeholder || "";
    const name = element.name || element.id || "";
    const currentValue = element.value || "";

    return {
      type: type,
      element: element,
      label: label,
      placeholder: placeholder,
      name: name,
      id: element.id,
      value: currentValue,
      disabled: element.disabled,
      required: element.required || element.hasAttribute("aria-required"),
    };
  }

  /**
   * Get label text for a form element (input, textarea, select, checkbox)
   * NOT for radio buttons - use getRadioOptionLabel instead
   */
  getLabelText(element) {
    const elementName = element.name || "";

    // Method 0: Indeed-specific - Look for aria-labelledby which points to the label
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl) {
        // Look for safe-markup inside the label
        const safeMarkup = labelEl.querySelector('[data-testid="safe-markup"]');
        if (safeMarkup) {
          const text = safeMarkup.textContent.trim();
          if (text.length > 3) {
            console.log(`📋 Found label via aria-labelledby safe-markup: "${text.substring(0, 80)}..."`);
            return text;
          }
        }
        const text = labelEl.textContent.trim();
        if (text.length > 3 && text.length < 1000) {
          return text;
        }
      }
    }

    // Method 1: Indeed-specific - Look for data-testid pattern matching element name
    if (elementName) {
      const testId = `input-${elementName}-label`;
      const labelByTestId = document.querySelector(`[data-testid="${testId}"]`);
      if (labelByTestId) {
        const safeMarkup = labelByTestId.querySelector('[data-testid="safe-markup"]');
        if (safeMarkup) {
          const text = safeMarkup.textContent.trim();
          if (text.length > 3) {
            console.log(`📋 Found label via testid: "${text.substring(0, 80)}..."`);
            return text;
          }
        }
        const text = labelByTestId.textContent.trim();
        if (text.length > 3 && text.length < 1000) {
          return text;
        }
      }
    }

    // Method 2: Check for Indeed question container and find label within
    const questionContainer = element.closest(
      '.ia-Questions-item, [class*="Questions-item"], [data-testid*="input-q"], [id^="q_"]'
    );
    if (questionContainer) {
      // Look for label with ID containing "single-select-question-label"
      const questionLabels = questionContainer.querySelectorAll(
        'label[id*="single-select-question-label"], label[id*="multi-select-question-label"]'
      );
      for (const label of questionLabels) {
        const safeMarkup = label.querySelector('[data-testid="safe-markup"]');
        if (safeMarkup) {
          const text = safeMarkup.textContent.trim();
          if (text.length > 3) {
            console.log(`📋 Found label in question container: "${text.substring(0, 80)}..."`);
            return text;
          }
        }
      }

      // Look for spans with data-testid ending in "-label"
      const labelSpans = questionContainer.querySelectorAll('[data-testid$="-label"]');
      for (const span of labelSpans) {
        const safeMarkup = span.querySelector('[data-testid="safe-markup"]');
        if (safeMarkup) {
          const text = safeMarkup.textContent.trim();
          if (text.length > 3) {
            console.log(`📋 Found label from span safe-markup: "${text.substring(0, 80)}..."`);
            return text;
          }
        }
      }
    }

    // Method 3: Check for label with "for" attribute pointing to this element
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) {
        // Make sure this label isn't just wrapping a radio
        const hasRadio = label.querySelector('input[type="radio"]');
        if (!hasRadio) {
          // Check for safe-markup first
          const safeMarkup = label.querySelector('[data-testid="safe-markup"]');
          if (safeMarkup) {
            const text = safeMarkup.textContent.trim();
            if (text.length > 3) return text;
          }
          return label.textContent.trim();
        }
      }
    }

    // Method 4: Check for parent label - but extract only the TEXT NODES, not nested element text
    const parentLabel = element.closest("label");
    if (parentLabel) {
      // Check for safe-markup first
      const safeMarkup = parentLabel.querySelector('[data-testid="safe-markup"]');
      if (safeMarkup) {
        const text = safeMarkup.textContent.trim();
        if (text.length > 3) return text;
      }
      const textNodes = Array.from(parentLabel.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent.trim())
        .filter((text) => text.length > 0)
        .join(" ");
      if (textNodes) return textNodes;
    }

    // Method 5: Check for aria-label
    if (element.getAttribute("aria-label")) {
      return element.getAttribute("aria-label").trim();
    }

    // Method 6: Check container for labels
    const container = element.closest(
      "fieldset, .form-group, .field-group, [class*='field'], [class*='question']"
    );
    if (container) {
      // Look for legend or label that's not associated with a radio
      const legend = container.querySelector("legend");
      if (legend) return legend.textContent.trim();

      const label = container.querySelector(
        "label:not(:has(input[type='radio']))"
      );
      if (label) {
        const safeMarkup = label.querySelector('[data-testid="safe-markup"]');
        if (safeMarkup) {
          const text = safeMarkup.textContent.trim();
          if (text.length > 3) return text;
        }
        return label.textContent.trim();
      }

      // Look for label as first child
      const firstLabel = container.querySelector("label");
      if (firstLabel) {
        const hasRadio = firstLabel.querySelector('input[type="radio"]');
        if (!hasRadio) {
          const safeMarkup = firstLabel.querySelector('[data-testid="safe-markup"]');
          if (safeMarkup) {
            const text = safeMarkup.textContent.trim();
            if (text.length > 3) return text;
          }
          return firstLabel.textContent.trim();
        }
      }
    }

    // Method 7: Placeholder as fallback
    return element.placeholder || "";
  }

  /**
   * Get the label for a specific radio option (NOT the question)
   */
  getRadioOptionLabel(radio) {
    // 1. Check for label with "for" pointing to this radio
    if (radio.id) {
      const label = document.querySelector(`label[for="${radio.id}"]`);
      if (label) {
        // Extract only text nodes to avoid getting nested elements
        const textContent = Array.from(label.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent.trim())
          .join(" ");
        return textContent || label.textContent.trim();
      }
    }

    // 2. Check for parent label containing this radio
    const parentLabel = radio.closest("label");
    if (parentLabel) {
      // Get only text nodes (exclude the radio itself)
      const textContent = Array.from(parentLabel.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent.trim())
        .filter((text) => text.length > 0)
        .join(" ");
      if (textContent) return textContent;

      // Fallback: all text minus any inputs
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll("input").forEach((i) => i.remove());
      return clone.textContent.trim();
    }

    // 3. Check next sibling element
    const nextSibling = radio.nextElementSibling;
    if (nextSibling && nextSibling.tagName !== "INPUT") {
      return nextSibling.textContent.trim();
    }

    // 4. Fallback to value
    return radio.value || "Unknown";
  }

  /**
   * Get the label for a specific checkbox option (NOT the question)
   * Similar to getRadioOptionLabel but for checkboxes
   */
  getCheckboxOptionLabel(checkbox) {
    // 1. Check for label with "for" pointing to this checkbox
    if (checkbox.id) {
      const label = document.querySelector(`label[for="${checkbox.id}"]`);
      if (label) {
        // Look for safe-markup first (Indeed pattern)
        const safeMarkup = label.querySelector('[data-testid="safe-markup"]');
        if (safeMarkup) {
          const text = safeMarkup.textContent.trim();
          if (text.length > 0) return text;
        }
        // Extract only text nodes to avoid getting nested elements
        const textContent = Array.from(label.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent.trim())
          .join(" ");
        return textContent || label.textContent.trim();
      }
    }

    // 2. Check for parent label containing this checkbox
    const parentLabel = checkbox.closest("label");
    if (parentLabel) {
      // Look for safe-markup first
      const safeMarkup = parentLabel.querySelector('[data-testid="safe-markup"]');
      if (safeMarkup) {
        const text = safeMarkup.textContent.trim();
        if (text.length > 0) return text;
      }
      // Get only text nodes (exclude the checkbox itself)
      const textContent = Array.from(parentLabel.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent.trim())
        .filter((text) => text.length > 0)
        .join(" ");
      if (textContent) return textContent;

      // Fallback: all text minus any inputs
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll("input").forEach((i) => i.remove());
      return clone.textContent.trim();
    }

    // 3. Check next sibling element (span with option text)
    const nextSibling = checkbox.nextElementSibling;
    if (nextSibling && nextSibling.tagName !== "INPUT") {
      // Look for safe-markup
      const safeMarkup = nextSibling.querySelector('[data-testid="safe-markup"]');
      if (safeMarkup) {
        return safeMarkup.textContent.trim();
      }
      return nextSibling.textContent.trim();
    }

    // 4. Fallback to value
    return checkbox.value || "Unknown";
  }

  /**
   * Find the QUESTION for a checkbox group (NOT the options)
   * Similar to findQuestionForRadioGroup but for checkbox groups
   */
  findQuestionForCheckboxGroup(checkboxes) {
    if (!checkboxes || checkboxes.length === 0) return "";

    const firstCheckbox = checkboxes[0];
    const checkboxName = firstCheckbox.name;

    // Method 0: Look for fieldset legend (most reliable for checkbox groups)
    const fieldset = firstCheckbox.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend) {
        // Look for safe-markup inside legend
        const safeMarkup = legend.querySelector('[data-testid="safe-markup"]');
        if (safeMarkup) {
          const text = safeMarkup.textContent.trim();
          if (text.length > 3) {
            console.log(`📋 Found checkbox question via legend safe-markup: "${text.substring(0, 80)}..."`);
            return text;
          }
        }
        // Look for span with label data-testid
        const labelSpan = legend.querySelector('[data-testid$="-label"]');
        if (labelSpan) {
          const safeMarkupInSpan = labelSpan.querySelector('[data-testid="safe-markup"]');
          if (safeMarkupInSpan) {
            const text = safeMarkupInSpan.textContent.trim();
            if (text.length > 3) return text;
          }
        }
        const text = legend.textContent.trim();
        if (text.length > 3 && text.length < 1000) {
          return text;
        }
      }
    }

    // Method 1: Look for multi-select-question-label (Indeed pattern for checkbox groups)
    const allLabels = document.querySelectorAll(
      'label[id*="multi-select-question-label"], span[data-testid="multi-select-question-label"]'
    );
    for (const label of allLabels) {
      // Check if this label is in the same question container as our checkbox
      const labelContainer = label.closest(
        '.ia-Questions-item, [id^="q_"], [data-testid*="input-q"], fieldset'
      );
      const checkboxContainer = firstCheckbox.closest(
        '.ia-Questions-item, [id^="q_"], [data-testid*="input-q"], fieldset'
      );

      if (
        labelContainer &&
        checkboxContainer &&
        labelContainer === checkboxContainer
      ) {
        // Found the question label for this checkbox group
        const safeMarkup = label.querySelector('[data-testid="safe-markup"]');
        if (safeMarkup) {
          const text = safeMarkup.textContent.trim();
          if (text.length > 3) {
            console.log(
              `📋 Found checkbox question via container match: "${text.substring(0, 80)}..."`
            );
            return text;
          }
        }
        const text = label.textContent.trim();
        if (text.length > 3 && text.length < 1000) {
          return text;
        }
      }
    }

    // Method 2: Look using data-testid that matches the checkbox name
    const testId = `input-${checkboxName}-label`;
    const labelByTestId = document.querySelector(`[data-testid="${testId}"]`);
    if (labelByTestId) {
      const safeMarkup = labelByTestId.querySelector('[data-testid="safe-markup"]');
      if (safeMarkup) {
        const text = safeMarkup.textContent.trim();
        if (text.length > 3) {
          console.log(`📋 Found checkbox question via testid: "${text.substring(0, 80)}..."`);
          return text;
        }
      }
      const text = labelByTestId.textContent.trim();
      if (text.length > 3 && text.length < 1000) {
        return text;
      }
    }

    // Method 3: Look for the container and find labels within
    const container = firstCheckbox.closest(
      '.ia-Questions-item, [class*="Questions-item"], [data-testid*="input-q"], [id^="q_"], fieldset, .checkbox-group, .form-group, [class*="question"], [class*="field"]'
    );

    if (container) {
      // Look for spans with data-testid ending in "-label" (question label, not option labels)
      const labelSpans = container.querySelectorAll('[data-testid$="-label"]');
      for (const span of labelSpans) {
        const parentLabel = span.closest("label");
        if (parentLabel && parentLabel.querySelector('input[type="checkbox"]'))
          continue;

        const safeMarkup = span.querySelector('[data-testid="safe-markup"]');
        if (safeMarkup) {
          const text = safeMarkup.textContent.trim();
          if (text.length > 3) {
            console.log(`📋 Checkbox question from nested safe-markup: "${text.substring(0, 80)}..."`);
            return text;
          }
        }
      }

      // Look for heading elements
      const heading = container.querySelector("h1, h2, h3, h4, h5, h6");
      if (heading) return heading.textContent.trim();

      // Look for a label that's NOT directly wrapping a checkbox
      const labels = container.querySelectorAll("label");
      for (const label of labels) {
        const hasCheckbox = label.querySelector('input[type="checkbox"]');
        if (!hasCheckbox) {
          const text = label.textContent.trim();
          if (text.length > 3 && text.length < 500) {
            return text;
          }
        }
      }
    }

    // Method 4: aria-labelledby
    const labelledBy = firstCheckbox.getAttribute("aria-labelledby");
    if (labelledBy) {
      const ids = labelledBy.split(" ");
      for (const id of ids) {
        const labelEl = document.getElementById(id);
        if (labelEl) {
          const text = labelEl.textContent.trim();
          if (text.length > 3 && text.length < 1000) {
            return text;
          }
        }
      }
    }

    // Final fallback
    console.warn(`⚠️ Could not extract question for checkbox group: ${checkboxName}`);
    return "";
  }

  /**
   * Find the QUESTION for a radio button group (NOT the options)
   */
  findQuestionForRadioGroup(radios) {
    if (!radios || radios.length === 0) return "";

    const firstRadio = radios[0];
    const radioName = firstRadio.name;

    // Method 0: Try to find the question label by radio name pattern
    // Indeed uses label ID pattern: single-select-question-label-single-select-question-:XXX:
    // And the radio name is q_HASH matching data-testid="input-q_HASH"
    const allLabels = document.querySelectorAll(
      'label[id*="single-select-question-label"]'
    );
    for (const label of allLabels) {
      // Check if this label is in the same question container as our radio
      const labelContainer = label.closest(
        '.ia-Questions-item, [id^="q_"], [data-testid*="input-q"]'
      );
      const radioContainer = firstRadio.closest(
        '.ia-Questions-item, [id^="q_"], [data-testid*="input-q"]'
      );

      if (
        labelContainer &&
        radioContainer &&
        labelContainer === radioContainer
      ) {
        // Found the question label for this radio group
        const safeMarkup = label.querySelector('[data-testid="safe-markup"]');
        if (safeMarkup) {
          const text = safeMarkup.textContent.trim();
          if (text.length > 3) {
            console.log(
              `📋 Found question via container match: "${text.substring(0, 80)}..."`
            );
            if (text.length > 200) {
              const questionMatch = text.match(/([A-Z][^.?!]*\?)\s*$/);
              if (questionMatch) return questionMatch[1];
            }
            return text;
          }
        }
        // Try the -label span
        const labelSpan = label.querySelector('[data-testid$="-label"]');
        if (labelSpan) {
          const safeMarkupInSpan = labelSpan.querySelector(
            '[data-testid="safe-markup"]'
          );
          if (safeMarkupInSpan) {
            const text = safeMarkupInSpan.textContent.trim();
            if (text.length > 3) return text;
          }
          const text = labelSpan.textContent.trim();
          if (text.length > 3) return text;
        }
      }
    }

    // Method 1: Look using data-testid that matches the radio name
    const testId = `input-${radioName}-label`;
    const labelByTestId = document.querySelector(`[data-testid="${testId}"]`);
    if (labelByTestId) {
      const safeMarkup = labelByTestId.querySelector(
        '[data-testid="safe-markup"]'
      );
      if (safeMarkup) {
        const text = safeMarkup.textContent.trim();
        if (text.length > 3) {
          console.log(
            `📋 Found question via testid: "${text.substring(0, 80)}..."`
          );
          return text;
        }
      }
      const text = labelByTestId.textContent.trim();
      if (text.length > 3 && text.length < 1000) {
        return text;
      }
    }

    // Method 2: Look for the container and find labels within
    const container = firstRadio.closest(
      '.ia-Questions-item, [class*="Questions-item"], [data-testid*="input-q"], [id^="q_"], fieldset, .radio-group, .form-group, [class*="question"], [class*="field"]'
    );

    if (container) {
      // Look for label with ID containing "single-select-question-label"
      const questionLabels = container.querySelectorAll(
        'label[id*="single-select-question-label"]'
      );
      for (const label of questionLabels) {
        const safeMarkup = label.querySelector('[data-testid="safe-markup"]');
        if (safeMarkup) {
          const text = safeMarkup.textContent.trim();
          if (text.length > 3) {
            console.log(
              `📋 Question from safe-markup: "${text.substring(0, 80)}..."`
            );
            if (text.length > 200) {
              const questionMatch = text.match(/([A-Z][^.?!]*\?)\s*$/);
              if (questionMatch) return questionMatch[1];
            }
            return text;
          }
        }
      }

      // Look for spans with data-testid ending in "-label" (question label, not option labels)
      const labelSpans = container.querySelectorAll('[data-testid$="-label"]');
      for (const span of labelSpans) {
        const parentLabel = span.closest("label");
        if (parentLabel && parentLabel.querySelector('input[type="radio"]'))
          continue;

        const safeMarkup = span.querySelector('[data-testid="safe-markup"]');
        if (safeMarkup) {
          const text = safeMarkup.textContent.trim();
          if (text.length > 3) {
            console.log(
              `📋 Question from nested safe-markup: "${text.substring(0, 80)}..."`
            );
            return text;
          }
        }
      }

      // Indeed EEOC/Demographics: Look for data-testid question label
      const questionLabel = container.querySelector(
        '[data-testid="single-select-question-label"]'
      );
      if (questionLabel) {
        // EEOC forms have long verbose labels ending with the actual question
        const fullText = questionLabel.textContent.trim();
        // Look for the last question-like text (ends with ?)
        const questionMatch = fullText.match(/([A-Z][^.?!]*\?)\s*$/);
        if (questionMatch) {
          console.log(`📋 EEOC question extracted: "${questionMatch[1]}"`);
          return questionMatch[1];
        }
        // Or look for common EEOC question patterns
        const eeocPatterns = [
          /Disability Status/i,
          /Veteran Status/i,
          /Race.*Ethnicity/i,
          /Gender/i,
          /Hispanic.*Latino/i,
        ];
        for (const pattern of eeocPatterns) {
          if (pattern.test(fullText)) {
            const match = fullText.match(pattern);
            if (match) {
              console.log(`📋 EEOC question pattern matched: "${match[0]}"`);
              return match[0] + "?";
            }
          }
        }
      }

      // Legend is reliable for fieldsets
      const legend = container.querySelector("legend");
      if (legend) return legend.textContent.trim();

      // Look for heading elements
      const heading = container.querySelector("h1, h2, h3, h4, h5, h6");
      if (heading) return heading.textContent.trim();

      // Look for a label that's NOT directly wrapping a radio
      const labels = container.querySelectorAll("label");
      for (const label of labels) {
        const hasRadio = label.querySelector('input[type="radio"]');
        if (!hasRadio) {
          // This label isn't wrapping a radio, so it's likely the question
          const text = label.textContent.trim();
          if (text.length > 3 && text.length < 500) {
            return text;
          }
        }
      }

      // Look for span/div with label-like classes
      const labelLike = container.querySelector(
        ".label, [class*='label']:not(label), .question-text"
      );
      if (labelLike) {
        const text = labelLike.textContent.trim();
        if (text.length > 3 && text.length < 500) {
          return text;
        }
      }

      // Look for mosaic label class
      const questionEl = container.querySelector(
        ".mosaic-provider-module-apply-questions-10g55w1"
      );
      if (questionEl) {
        const safeMarkup = questionEl.querySelector(
          '[data-testid="safe-markup"]'
        );
        if (safeMarkup) {
          const text = safeMarkup.textContent.trim();
          if (text.length > 3) return text;
        }
        const text = questionEl.textContent.trim();
        if (text.length > 3 && text.length < 1000) return text;
      }

      // Look for the main label even if it wraps radios, but extract question part
      const mainLabel = container.querySelector("label");
      if (mainLabel) {
        const fullText = mainLabel.textContent.trim();
        // If very long (EEOC style), try to find the question at the end
        if (fullText.length > 200) {
          const lastQuestion = fullText.match(/([^.!?]+\?)\s*$/);
          if (lastQuestion) {
            return lastQuestion[1].trim();
          }
        }
      }
    }

    // Method 3: aria-labelledby
    const labelledBy = firstRadio.getAttribute("aria-labelledby");
    if (labelledBy) {
      const ids = labelledBy.split(" ");
      for (const id of ids) {
        const labelEl = document.getElementById(id);
        if (labelEl) {
          const text = labelEl.textContent.trim();
          if (text.length > 3 && text.length < 1000) {
            return text;
          }
        }
      }
    }

    // Final fallback - return empty string instead of mangled name
    // This will trigger a warning in the calling code
    console.warn(`⚠️ Could not extract question for radio group: ${radioName}`);
    return "";
  }

  /**
   * Try to infer question from radio/checkbox options when label extraction fails
   * Looks for common patterns in option text to determine what's being asked
   */
  inferQuestionFromOptions(options) {
    if (!options || options.length === 0) return "";

    const optionTexts = options.map((o) => (o.text || o.value || "").toLowerCase());
    const combinedText = optionTexts.join(" ");

    // Pattern matching for common question types based on option text
    const patterns = [
      // SMS/Text consent
      {
        match: /text message|sms|contacted by text/i,
        question: "Do you agree to be contacted by text messages?",
      },
      // Email consent
      {
        match: /email|contacted by email/i,
        question: "Do you agree to be contacted by email?",
      },
      // Phone consent
      {
        match: /phone call|contacted by phone/i,
        question: "Do you agree to be contacted by phone?",
      },
      // Work authorization
      {
        match: /authorized to work|work authorization|legally authorized/i,
        question: "Are you authorized to work in this location?",
      },
      // Sponsorship
      {
        match: /visa sponsorship|require sponsorship|sponsor/i,
        question: "Will you now or in the future require visa sponsorship?",
      },
      // Relocation
      {
        match: /willing to relocate|relocation/i,
        question: "Are you willing to relocate?",
      },
      // Remote/On-site
      {
        match: /work remotely|remote work|on-?site|hybrid/i,
        question: "What is your preferred work arrangement?",
      },
      // Age verification
      {
        match: /18 years|21 years|of age|years old/i,
        question: "Are you at least 18 years of age?",
      },
      // Background check
      {
        match: /background check|criminal|felony/i,
        question: "Do you consent to a background check?",
      },
      // Drug test
      {
        match: /drug test|drug screening/i,
        question: "Do you consent to a drug test?",
      },
      // Shift/Schedule
      {
        match: /shift|schedule|night|weekend|overtime/i,
        question: "What shifts are you available to work?",
      },
      // Veteran status
      {
        match: /veteran|military service|armed forces/i,
        question: "Are you a veteran?",
      },
      // Disability
      {
        match: /disability|disabled/i,
        question: "Do you have a disability?",
      },
      // Gender
      {
        match: /\b(male|female|non-?binary|gender)\b/i,
        question: "What is your gender?",
      },
      // Race/Ethnicity
      {
        match: /\b(white|black|asian|hispanic|latino|race|ethnicity)\b/i,
        question: "What is your race/ethnicity?",
      },
      // Generic Yes/No
      {
        match: /^(yes|no|i agree|i do not agree)$/i,
        question: "Please select an option",
      },
    ];

    for (const pattern of patterns) {
      if (pattern.match.test(combinedText)) {
        return pattern.question;
      }
    }

    // If options contain "yes" and "no", it's a yes/no question
    const hasYes = optionTexts.some((t) => t.includes("yes"));
    const hasNo = optionTexts.some((t) => t.includes("no"));
    if (hasYes && hasNo) {
      // Try to extract context from the longer option
      const longerOption = options.reduce((a, b) =>
        (a.text?.length || 0) > (b.text?.length || 0) ? a : b
      );
      if (longerOption.text && longerOption.text.length > 10) {
        // Use the option text to form a question
        return `Regarding: ${longerOption.text.substring(0, 100)}`;
      }
      return "Please respond to this question";
    }

    return "";
  }

  // ============ Button Detection ============

  findContinueButton() {
    // Collect all potential action buttons first, then prioritize
    let submitButton = null;
    let reviewButton = null;
    let continueButton = null;

    // Indeed-specific button selectors
    const selectors = [
      // Primary: Class patterns used by Indeed's mosaic UI
      'button[class*="mosaic-provider-module"]',
      'button[class*="e8ju0x50"]',
      // Data-testid patterns
      'button[data-testid="continue-button"]',
      'button[data-testid*="continue"]',
      'button[data-testid="submit-application-button"]',
      'button[data-testid*="submit"]',
      // Generic fallback
      "button",
    ];

    // Collect all visible buttons
    const allButtons = new Set();
    for (const selector of selectors) {
      const buttons = document.querySelectorAll(selector);
      buttons.forEach((btn) => allButtons.add(btn));
    }

    // Scan all buttons and categorize them
    for (const button of allButtons) {
      // Skip hidden buttons
      if (!button.offsetParent && button.style.display !== "contents") continue;

      const text = button.textContent.trim().toLowerCase();
      const spanText =
        button.querySelector("span")?.textContent.trim().toLowerCase() || "";

      // Check for Submit button (highest priority)
      if (
        text.includes("submit your application") ||
        spanText.includes("submit your application") ||
        text.includes("submit application") ||
        spanText.includes("submit application")
      ) {
        console.log("🔘 Found SUBMIT button:", button.textContent.trim());
        submitButton = {
          element: button,
          text: button.textContent.trim(),
          type: "submit",
        };
      }
      // Check for Review button (second priority)
      else if (
        text.includes("review your application") ||
        spanText.includes("review your application") ||
        text.includes("review application") ||
        spanText.includes("review application")
      ) {
        console.log("🔘 Found REVIEW button:", button.textContent.trim());
        reviewButton = {
          element: button,
          text: button.textContent.trim(),
          type: "review",
        };
      }
      // Check for Continue button (lowest priority)
      else if (
        text === "continue" ||
        spanText === "continue" ||
        (text.includes("continue") && !text.includes("review"))
      ) {
        console.log("🔘 Found CONTINUE button:", button.textContent.trim());
        continueButton = {
          element: button,
          text: button.textContent.trim(),
          type: "continue",
        };
      }
    }

    // Return in priority order: Submit > Review > Continue
    if (submitButton) {
      console.log("✅ Selecting SUBMIT button (highest priority)");
      return submitButton;
    }
    if (reviewButton) {
      console.log("✅ Selecting REVIEW button (second priority)");
      return reviewButton;
    }
    if (continueButton) {
      console.log("✅ Selecting CONTINUE button (third priority)");
      return continueButton;
    }

    console.log("ℹ️ No action button found");
    return null;
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

      if (!question) {
        console.log("⚠️ Skipping field with no question identifier");
        continue;
      }

      console.log(`🔄 AI processing: "${question}" (type: ${field.type})`);

      try {
        let answer = null;
        // Detect actual field type - check date first, then number
        const isDateQuestion = this.isDateRelatedQuestion(question) ||
          (field.element && this.isDateField(field.element));
        const effectiveType = isDateQuestion
          ? "date"
          : (field.element && this.isNumericField(field.element))
            ? "number"
            : field.type;

        const context = {
          userData: this.userData,
          jobDescription: this.jobDescription,
          jobTitle: this.currentJobTitle,
          fieldType: effectiveType,
          required: field.required,
        };

        if (AIResponseUtils.isSalaryField(question)) {
          answer = await this.aiService.getSalaryAnswer(question, [], context);
        } else if (field.type === "select" || field.type === "radio-group") {
          const optionTexts =
            field.options?.map((o) => o.text || o.value) || [];
          if (optionTexts.length > 0) {
            answer = await this.aiService.getOptionAnswer(
              question,
              optionTexts,
              context
            );
          }
        } else if (field.type === "checkbox-group") {
          // Multi-select checkbox group - use getMultiSelectAnswer for array response
          const optionTexts =
            field.options?.map((o) => o.text || o.value) || [];
          if (optionTexts.length > 0) {
            console.log(`☑️ Checkbox group options: [${optionTexts.join(", ")}]`);
            answer = await this.aiService.getMultiSelectAnswer(
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
          // Single checkbox - Yes/No toggle
          answer = await this.aiService.getOptionAnswer(
            question,
            ["Yes", "No"],
            context
          );
        } else if (isDateQuestion) {
          // Date fields - detect expected format from placeholder
          const placeholder = (field.element?.placeholder || "").toUpperCase();
          const wantsISO = placeholder.includes("YYYY-MM-DD");
          const dateFormat = wantsISO
            ? "YYYY-MM-DD (e.g., 2025-03-15)"
            : "MM/DD/YYYY (e.g., 03/15/2025)";
          const dateContext = {
            ...context,
            fieldContext:
              `IMPORTANT: Always respond with dates in ${dateFormat} format. If the question asks about availability or start date, use a realistic near-future date. Do not respond with words like 'immediately', 'immediate', or 'ASAP' - always provide an actual date.`,
          };
          answer = await this.aiService.getNormalAnswer(question, [], dateContext);
          // Post-process: ensure the answer matches the expected format
          if (answer) {
            answer = this.formatDateAnswer(answer, wantsISO);
          }
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

  // ============ Field Filling ============

  async fillFields(fields, answers) {
    let filledCount = 0;

    // Notify user about form filling
    if (true) {
      // Global overlay
      notifyStatus({ type: "FILLING_FORM" });
    }

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

      if (answer) {
        const success = await this.fillSingleField(field, answer);
        if (success) filledCount++;
      }
    }

    console.log(`✏️ Filled ${filledCount} of ${fields.length} fields`);
    return filledCount;
  }

  async fillSingleField(field, value) {
    const element = field.element;
    if (!element) return false;

    try {
      console.log(`📝 Filling "${field.label || field.name}": "${value}"`);

      switch (field.type) {
        case "date":
          // Convert relative availability answers to actual date
          let dateValue = value;
          if (this.isAvailabilityQuestion(field.label)) {
            const convertedDate = this.convertAvailabilityToDate(value);
            if (convertedDate) {
              console.log(`📅 Converted "${value}" to date: ${convertedDate}`);
              dateValue = convertedDate;
            }
          }
          // Date inputs need YYYY-MM-DD format for native date inputs
          // But Indeed may use text inputs styled as date, so try MM/DD/YYYY first
          element.focus();
          element.value = dateValue;
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
          element.dispatchEvent(new Event("blur", { bubbles: true }));
          break;

        case "text":
        case "textarea":
          // Check if this is an availability question disguised as text field
          let textValue = value;
          if (
            this.isAvailabilityQuestion(field.label) &&
            element.placeholder?.includes("/")
          ) {
            // Likely expects a date format
            const convertedDate = this.convertAvailabilityToDate(value);
            if (convertedDate) {
              console.log(
                `📅 Converted availability "${value}" to date: ${convertedDate}`
              );
              textValue = convertedDate;
            }
          }
          element.focus();
          element.value = "";
          // Simulate typing for React
          for (const char of textValue) {
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

        case "checkbox-group":
          // Multi-select checkbox group - value is an array from getMultiSelectAnswer
          let valuesToCheck = [];
          if (Array.isArray(value)) {
            valuesToCheck = value.map((v) => String(v).trim().toLowerCase());
          } else if (typeof value === "string") {
            valuesToCheck = value.split(",").map((v) => v.trim().toLowerCase());
          }

          let checkedCount = 0;
          for (const selectedValue of valuesToCheck) {
            // Try exact match first
            let matchingCheckbox = field.options?.find(
              (opt) => opt.text.toLowerCase().trim() === selectedValue
            );
            // Fallback: partial match
            if (!matchingCheckbox) {
              matchingCheckbox = field.options?.find(
                (opt) =>
                  opt.text.toLowerCase().includes(selectedValue) ||
                  selectedValue.includes(opt.text.toLowerCase())
              );
            }
            if (matchingCheckbox?.element && !matchingCheckbox.element.checked) {
              console.log(
                `☑️ Selecting checkbox option: "${matchingCheckbox.text}" for answer: "${selectedValue}"`
              );
              matchingCheckbox.element.click();
              matchingCheckbox.element.dispatchEvent(
                new Event("change", { bubbles: true })
              );
              checkedCount++;
            }
          }
          if (checkedCount === 0) {
            console.warn(
              `⚠️ Could not find matching checkbox options for: "${value}"`
            );
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
      console.error(`❌ Error filling field:`, error);
      return false;
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

    // Scroll button into view
    button.scrollIntoView({ behavior: "smooth", block: "center" });
    await this.sleep(300);

    // Focus and click - using only native click (like manual click does)
    // Do NOT dispatch additional MouseEvent - it causes double-click issues with React
    button.focus();
    button.click();

    return true;
  }

  // ============ Step Handlers ============

  /**
   * Wait for form fields to appear
   * @param {number} timeout Maximum wait time in milliseconds
   * @returns {Promise<boolean>} True if fields found, false otherwise
   */
  /**
   * Wait for any loading indicators to disappear
   * @param {number} timeout Maximum wait time in milliseconds
   * @returns {Promise<boolean>} True if loader disappeared, false on timeout
   */
  async waitForLoader(timeout = 10000) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const check = () => {
        // Common Indeed loading signals
        // NOTE: Exclude [role="progressbar"] - matches step progress indicator that's always visible
        const loaders = document.querySelectorAll(
          '.ipl-Spinner, .rez-Spinner, [aria-label="Loading"]'
        );

        let isVisible = false;
        for (const loader of loaders) {
          if (!this.isElementHidden(loader)) {
            isVisible = true;
            break;
          }
        }

        // Also check for "Loading..." text overlay
        if (!isVisible) {
          const bodyText = document.body.textContent || "";
          // Check for solitary "Loading..." text using a crude heuristic if needed,
          // but usually selectors are better.
        }

        if (!isVisible) {
          resolve(true); // No loader visible
        } else if (Date.now() - startTime > timeout) {
          console.log("⚠️ Timeout waiting for loader to disappear");
          resolve(false);
        } else {
          // If loader is visible, wait and check again
          // console.log("⏳ Loader visible, waiting...");
          setTimeout(check, 200);
        }
      };

      check();
    });
  }

  async waitForFormFields(timeout = 10000) {
    // First, wait for any loader to disappear
    await this.waitForLoader(5000);

    console.log("⏳ Waiting for form fields to appear...");
    return new Promise((resolve) => {
      const startTime = Date.now();

      const check = () => {
        const form =
          document.querySelector("form") ||
          document.querySelector('[class*="apply"]') ||
          document.body;

        // Quick check for visible inputs/selects/textareas
        const inputs = form.querySelectorAll(
          'input:not([type="hidden"]), select, textarea'
        );

        let hasVisibleFields = false;
        for (const input of inputs) {
          if (!this.isElementHidden(input)) {
            hasVisibleFields = true;
            break;
          }
        }

        if (hasVisibleFields) {
          resolve(true);
        } else if (Date.now() - startTime > timeout) {
          console.log("⚠️ Timeout waiting for form fields");
          resolve(false);
        } else {
          setTimeout(check, 500);
        }
      };

      check();
    });
  }

  /**
   * Click the Continue/Next button and wait for navigation
   * Called by each step handler after processing fields
   * In co-pilot mode, waits for user approval before clicking
   * @returns {Promise<boolean>} True if navigation successful, false if skipped
   */
  async clickContinueAndWait() {
    await this.sleep(500);

    const buttonToClick = this.findContinueButton();
    if (!buttonToClick) {
      console.log("ℹ️ No Continue button found - skipping");
      return true;
    }

    // Co-pilot mode: wait for user approval before clicking Continue
    if (this.copilotMode) {
      const isSubmit = buttonToClick.type === "submit";
      const stepType = this.detectStepFromUrl();

      console.log(`🤝 Co-pilot mode: waiting for user approval to ${isSubmit ? "submit" : "continue"}`);

      notifyStatus({
        type: isSubmit ? "COPILOT_SUBMIT_READY" : "COPILOT_WAITING_FOR_NEXT",
        data: {
          buttonText: buttonToClick.text,
          title: this.currentJobTitle,
          step: stepType,
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

      if (userAction === "SKIP") {
        return false;
      }
      if (userAction === "TAKE_CONTROL") {
        this.userHasControl = true;
        return false;
      }
      // User approved (CONTINUE or SUBMIT), proceed with click
    }

    console.log(`🖱️ Step handler clicking: "${buttonToClick.text}"`);
    await this.clickButton(buttonToClick);

    // Wait for navigation
    await this.waitForUrlChange(8000);

    // Wait for DOM to settle after step transition
    await this.sleep(1500);
    await this.waitForDomToSettle();
    console.log("✅ Navigation complete, DOM settled");

    return true;
  }

  async handleContactInfoStep() {
    console.log("📝 Processing CONTACT_INFO step");
    await this.waitForFormFields();
    const fields = this.extractFormFields();
    const answers = await this.getAIAnswers(fields);
    await this.fillFields(fields, answers);

    // Click Continue and wait for navigation
    await this.clickContinueAndWait();
  }

  async handleResumeUploadStep() {
    console.log("📄 Processing RESUME_UPLOAD step");

    // Notify user about file upload
    if (true) {
      // Global overlay
      if (this.fileHandler?.preferences?.useCustomResume === true) {
        notifyStatus({ type: "TAILORING_RESUME" });
      } else {
        notifyStatus({ type: "UPLOADING_FILES" });
      }
    }

    if (!this.fileHandler) {
      console.warn("⚠️ No file handler available");
      return;
    }

    if (!this.userData) {
      console.warn("⚠️ No userData available for resume upload");
      return;
    }

    // Step 1: Find file input for resume upload
    let fileInput = document.querySelector(
      '[data-testid="resume-selection-file-resume-upload-button-file-input"]'
    );
    if (!fileInput) {
      fileInput = document.querySelector(
        '[data-testid="FileResumeCard-file-input"]'
      );
    }
    if (!fileInput) {
      fileInput = document.querySelector('input[type="file"][accept*="pdf"]');
    }
    if (!fileInput) {
      fileInput = document.querySelector('input[type="file"][accept*=".doc"]');
    }
    if (!fileInput) {
      const form = document.querySelector(
        '[data-testid="resume-selection-form"]'
      );
      fileInput = form?.querySelector('input[type="file"]');
    }
    if (!fileInput) {
      // Last resort - find any file input on the page
      fileInput = document.querySelector('input[type="file"]');
    }

    if (!fileInput) {
      console.warn("⚠️ No file input found for resume upload");
      // Fallback: check if there's already a resume selected
      const existingResume = document.querySelector(
        '[data-testid="resume-selection-file-resume-radio-card"]'
      );
      if (existingResume) {
        console.log(
          "⚠️ No file input but existing resume found - selecting it"
        );
        const radioInput = existingResume.querySelector('input[type="radio"]');
        if (radioInput && !radioInput.checked) {
          radioInput.click();
          await this.sleep(500);
        }
      }
      return;
    }

    try {
      console.log("📤 Uploading fresh resume for this job application...");

      // Step 2: Get resume URLs from user data
      const fileUrls = this.fileHandler.getFileUrls(this.userData, "resume");
      if (!fileUrls || fileUrls.length === 0) {
        console.error("❌ No resume URLs found in user data");
        return;
      }

      console.log(`📁 Found ${fileUrls.length} resume(s) available for upload`);

      // Step 3: Upload the resume using the file handler
      const uploadSuccess = await this.fileHandler.handleResumeUploadToInput(
        fileInput,
        this.userData,
        this.jobDescription,
        fileUrls,
        this.jobId,
        this.currentJobTitle || ""
      );

      if (uploadSuccess) {
        console.log("✅ Resume upload completed, waiting for DOM to settle...");

        // After upload, select the radio card if needed
        await this.sleep(1000);
        const newResumeRadio = document.querySelector(
          '[data-testid="resume-selection-file-resume-radio-card-input"]'
        );
        if (newResumeRadio && !newResumeRadio.checked) {
          console.log("📌 Selecting the newly uploaded resume...");
          const label = document.querySelector(
            '[data-testid="resume-selection-file-resume-radio-card-label"]'
          );
          if (label) {
            label.click();
            await this.sleep(300);
          } else {
            newResumeRadio.click();
            await this.sleep(300);
          }
        }

        // Give Indeed extra time to process the upload and update the UI
        await this.sleep(1000);
        await this.waitForDomToSettle();
      } else {
        console.warn(
          "⚠️ Resume upload failed, checking for existing resume..."
        );
        // Fallback: select existing resume if available
        const existingResumeRadio = document.querySelector(
          '[data-testid="resume-selection-file-resume-radio-card-input"]'
        );
        if (existingResumeRadio && !existingResumeRadio.checked) {
          console.log("⚠️ Selecting existing resume as fallback");
          existingResumeRadio.click();
          await this.sleep(500);
        }
      }
    } catch (error) {
      console.error("❌ Resume upload error:", error);
    }

    // Click Continue and wait for navigation
    await this.clickContinueAndWait();
  }

  async handlePrivacySettingsStep() {
    console.log("🔒 Processing PRIVACY_SETTINGS step");

    // Wait for the page to fully load
    await this.sleep(1000);

    // Click Continue and wait for navigation
    await this.clickContinueAndWait();
  }

  async handleExperienceStep() {
    console.log("💼 Processing EXPERIENCE step");
    await this.waitForFormFields();
    const fields = this.extractFormFields();
    const answers = await this.getAIAnswers(fields);
    await this.fillFields(fields, answers);

    // Click Continue and wait for navigation
    await this.clickContinueAndWait();
  }

  async handleQuestionsStep() {
    console.log("❓ Processing QUESTIONS step");
    await this.waitForFormFields();
    const fields = this.extractFormFields();
    const answers = await this.getAIAnswers(fields);
    await this.fillFields(fields, answers);

    // Handle file upload fields (e.g. cover letter) that appear in question steps
    await this.handleQuestionFileUploads();

    // Click Continue and wait for navigation
    await this.clickContinueAndWait();
  }

  /**
   * Detect and handle file upload fields within question containers
   * Indeed shows cover letter uploads as hidden file inputs inside .ia-Questions-item
   */
  async handleQuestionFileUploads() {
    if (!this.fileHandler) {
      console.log("⚠️ No file handler available for question file uploads");
      return;
    }

    const form = document.querySelector("form") || document.body;
    const questionContainers = form.querySelectorAll(
      '.ia-Questions-item, [class*="Questions-item"]'
    );

    for (const container of questionContainers) {
      const fileInput = container.querySelector('input[type="file"]');
      if (!fileInput) continue;

      // Get the label text from the question container
      const labelEl = container.querySelector('[data-testid="safe-markup"]');
      const legendEl = container.querySelector("legend");
      const labelText = (
        labelEl?.textContent || legendEl?.textContent || ""
      ).trim().toLowerCase();

      if (!labelText) continue;

      console.log(`📎 Found file upload question: "${labelText}"`);

      if (labelText.includes("cover letter") || labelText.includes("cover")) {
        console.log("📝 Detected cover letter upload field, generating cover letter...");
        notifyStatus({ type: "UPLOADING_FILES" });

        try {
          const success = await this.fileHandler.uploadCoverLetterPDF(
            fileInput,
            {
              fullName:
                (this.userData?.firstName || "") +
                " " +
                (this.userData?.lastName || ""),
              jobDescription: this.jobDescription || "",
              skills: this.userData?.skills || [],
              education: this.userData?.education || [],
              fullPositions: this.userData?.fullPositions || this.userData?.experience || [],
              tone: "Professional",
            },
            this.userData
          );

          if (success) {
            console.log("✅ Cover letter uploaded successfully");
          } else {
            console.warn("⚠️ Cover letter upload failed");
          }
        } catch (error) {
          console.error("❌ Error uploading cover letter:", error);
        }

        await this.sleep(1000);
      }
    }
  }

  async handleDemographicsStep() {
    console.log("📊 Processing DEMOGRAPHICS step");
    await this.waitForFormFields();
    const fields = this.extractFormFields();
    const answers = await this.getAIAnswers(fields);
    await this.fillFields(fields, answers);

    // Click Continue and wait for navigation
    await this.clickContinueAndWait();
  }

  async handleReviewStep() {
    console.log("📋 Processing REVIEW step - ready to submit");
    // Nothing to fill, just ready to submit
  }

  // ============ Main Entry Point ============

  async fillCompleteForm() {
    console.log("🚀 fillCompleteForm starting (direct mode)...");

    try {
      this.setupUrlChangeListener();

      while (this.currentStepCount < this.maxSteps) {
        this.currentStepCount++;

        // Co-pilot user control check
        if (this.copilotMode && this.userHasControl) {
          await this.sleep(1000);
          continue;
        }

        const stepType = this.detectStepFromUrl();
        console.log(`📍 Step ${this.currentStepCount}: ${stepType}`);

        // Check for success
        if (stepType === StepType.SUCCESS) {
          console.log("✅ Application submitted successfully!");
          return true;
        }

        // Process step - each handler now clicks Continue and waits
        switch (stepType) {
          case StepType.CONTACT_INFO:
            await this.handleContactInfoStep();
            break;
          case StepType.RESUME_UPLOAD:
            await this.handleResumeUploadStep();
            break;
          case StepType.PRIVACY_SETTINGS:
            await this.handlePrivacySettingsStep();
            break;
          case StepType.EXPERIENCE:
            await this.handleExperienceStep();
            break;
          case StepType.QUESTIONS:
            await this.handleQuestionsStep();
            break;
          case StepType.DEMOGRAPHICS:
            await this.handleDemographicsStep();
            break;
          case StepType.REVIEW:
            // REVIEW step needs special handling for reCAPTCHA
            await this.handleReviewStep();

            // Check for reCAPTCHA
            if (this.detectRecaptcha()) {
              console.log(
                "🔐 reCAPTCHA detected on REVIEW page - notifying user"
              );
              notifyStatus({ type: "RECAPTCHA_DETECTED" });
              await this.sleep(30000);
              continue;
            }

            // Click Continue/Submit (co-pilot logic is now in clickContinueAndWait)
            const success = await this.clickContinueAndWait();
            if (!success && this.copilotMode) {
              // User skipped or took control
              if (this.userHasControl) continue;
              return false;
            }
            break;
          default:
            console.log("⚠️ Unknown step, attempting generic form fill");
            await this.waitForFormFields();
            const fields = this.extractFormFields();
            if (fields.length > 0) {
              const answers = await this.getAIAnswers(fields);
              await this.fillFields(fields, answers);
            }
            // Click Continue for unknown steps
            await this.clickContinueAndWait();
        }

        // Small delay before next iteration
        await this.sleep(500);
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

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Wait for DOM to stop changing (React/SPA rendering complete)
   * Uses MutationObserver to detect when DOM stabilizes
   */
  async waitForDomToSettle(timeout = 5000, stableTime = 500) {
    return new Promise((resolve) => {
      let lastMutationTime = Date.now();
      let resolved = false;

      const form = document.querySelector("form") || document.body;

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
          // DOM has been stable for stableTime ms
          resolved = true;
          observer.disconnect();
          console.log(`🔄 DOM stable after ${stableTime}ms of no changes`);
          resolve();
        } else {
          // Check again soon
          setTimeout(checkStable, 100);
        }
      };

      // Start checking
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

  /**
   * Detect if an input is actually a number field despite type="text"
   * Indeed/Glassdoor use type="text" with number-specific attributes like:
   *   id="number-input-...", aria-describedby="number-question-helper-text-...",
   *   max="9999999999999", inputmode="numeric"/"decimal"
   */
  isNumericField(element) {
    if (!element) return false;
    if (element.type === "number") return true;
    if (element.type !== "text" && element.type !== "") return false;

    const id = element.id || "";
    const ariaDescribedBy = element.getAttribute("aria-describedby") || "";
    const hasMinMax = element.hasAttribute("min") || element.hasAttribute("max");
    const inputMode = element.getAttribute("inputmode") || "";

    return (
      id.startsWith("number-input") ||
      ariaDescribedBy.includes("number-question") ||
      (hasMinMax && !id.includes("date")) ||
      inputMode === "numeric" ||
      inputMode === "decimal"
    );
  }

  /**
   * Check if input element is a date field based on its attributes
   */
  isDateField(element) {
    if (!element) return false;

    const placeholder = (element.placeholder || "").toUpperCase();
    const id = element.id || "";
    const ariaDescribedBy = element.getAttribute("aria-describedby") || "";

    return (
      element.type === "date" ||
      placeholder.includes("MM/DD/YYYY") ||
      placeholder.includes("MM-DD-YYYY") ||
      placeholder.includes("YYYY-MM-DD") ||
      ariaDescribedBy.includes("date-question") ||
      id.startsWith("date-question") ||
      id.toLowerCase().includes("date")
    );
  }

  /**
   * Check if a question label is date-related
   */
  isDateRelatedQuestion(question) {
    const dateKeywords = [
      "date available",
      "start date",
      "end date",
      "available date",
      "availability date",
      "when can you start",
      "earliest start",
      "date of",
      "graduation date",
      "mm/dd/yyyy",
      "yyyy-mm-dd",
    ];
    const lower = question.toLowerCase();
    return dateKeywords.some((kw) => lower.includes(kw));
  }

  /**
   * Convert an AI date answer to the expected format.
   * Handles AI returning MM/DD/YYYY when YYYY-MM-DD is needed and vice versa.
   * Also handles relative answers like "immediately", "2 weeks", etc.
   */
  formatDateAnswer(answer, wantsISO) {
    if (!answer) return answer;
    const trimmed = answer.trim();

    // Handle relative/word answers - convert to actual date
    const relativeDate = this.convertRelativeDateAnswer(trimmed);
    if (relativeDate) {
      return wantsISO ? relativeDate.iso : relativeDate.us;
    }

    // MM/DD/YYYY → YYYY-MM-DD
    const usMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (usMatch) {
      const [, mm, dd, yyyy] = usMatch;
      return wantsISO ? `${yyyy}-${mm}-${dd}` : trimmed;
    }

    // YYYY-MM-DD → MM/DD/YYYY
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const [, yyyy, mm, dd] = isoMatch;
      return wantsISO ? trimmed : `${mm}/${dd}/${yyyy}`;
    }

    // Try parsing as a generic date
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      const mm = String(parsed.getMonth() + 1).padStart(2, "0");
      const dd = String(parsed.getDate()).padStart(2, "0");
      const yyyy = parsed.getFullYear();
      return wantsISO ? `${yyyy}-${mm}-${dd}` : `${mm}/${dd}/${yyyy}`;
    }

    return trimmed;
  }

  /**
   * Convert relative date words to actual dates
   */
  convertRelativeDateAnswer(answer) {
    const lower = answer.toLowerCase();
    const today = new Date();
    let target = new Date(today);

    if (/immediate|asap|now|today|right away/.test(lower)) {
      // Use today's date
    } else if (/1\s*week|one\s*week/.test(lower)) {
      target.setDate(today.getDate() + 7);
    } else if (/2\s*week|two\s*week/.test(lower)) {
      target.setDate(today.getDate() + 14);
    } else if (/3\s*week|three\s*week/.test(lower)) {
      target.setDate(today.getDate() + 21);
    } else if (/1\s*month|one\s*month/.test(lower)) {
      target.setDate(today.getDate() + 30);
    } else if (/2\s*month|two\s*month/.test(lower)) {
      target.setDate(today.getDate() + 60);
    } else if (/3\s*month|three\s*month/.test(lower)) {
      target.setDate(today.getDate() + 90);
    } else {
      return null;
    }

    const mm = String(target.getMonth() + 1).padStart(2, "0");
    const dd = String(target.getDate()).padStart(2, "0");
    const yyyy = target.getFullYear();

    return {
      iso: `${yyyy}-${mm}-${dd}`,
      us: `${mm}/${dd}/${yyyy}`,
    };
  }
}

export default FormHandler;
