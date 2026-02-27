/**
 * Enhanced FormHandler class for automated form filling on both Indeed and Glassdoor
 * Specifically handles the SmartApply interface (https://smartapply.indeed.com/...)
 */

import { AIService } from "../../services/index.js";
import { notifyStatus } from "../../utils/status-helper.js";
import { AIResponseUtils } from "../../shared/utilities/index.js";
import { fetchFile } from "../../shared/utilities/fetch-file.js";

class GlassdoorFormHandler {
  /**
   * Initialize the FormHandler with necessary configuration
   * @param {Object} config Configuration options
   */
  constructor(config = {}) {
    this.host = config.host;
    this.userData = config.userData || {};
    this.jobDescription = config.jobDescription || "";
    this.platform = config.platform || "glassdoor";
    this.fileHandler = config.fileHandler || null; // File handler for resume uploads
    this.jobId = config.jobId || null;
    this.aiBaseUrl = "https://resumify.fastapply.co/api";
    this.aiService = new AIService({ apiHost: this.host, platform: "glassdoor" });

    // Co-pilot mode properties
    this.copilotMode = false;
    this.copilotState = null;
    this.currentJobTitle = null;
    this.userHasControl = false;
    this.userActionResolver = null;

    // Setup selectors based on both platforms
    this.selectors = {
      COMMON: {
        // Form elements - Glassdoor-specific with fallbacks
        INPUTS:
          'input[data-testid], input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="radio"], input[type="checkbox"], input[type="password"], input[type="date"], input[placeholder*="MM/DD/YYYY"], input[placeholder*="mm/dd/yyyy"]',
        SELECTS: "select[data-testid], select",
        TEXTAREAS: "textarea[data-testid], textarea",

        // Resume elements
        RESUME_OPTIONS: '[data-testid="ResumeOptionsMenu"]',
        RESUME_UPLOAD_BUTTON: '[data-testid="ResumeOptionsMenu-upload"]',
        FILE_INPUT: 'input[type="file"]',
        FILE_RESUME_CARD_INPUT:
          '[data-testid="resume-selection-file-resume-radio-card-file-input"], [data-testid="FileResumeCard-file-input"], input[type="file"][accept*=".pdf"], input[type="file"][accept*=".doc"]',
        RESUME_PREVIEW: '[data-testid="resume-selection-file-resume-pdf-preview"], [data-testid="ResumeThumbnail"]',
        RESUME_RADIO_INDEED: 'input[value="structured"]',
        RESUME_RADIO_FILE: 'input[value="file"]',
        FILE_RESUME_CARD:
          '[data-testid="resume-selection-file-resume-radio-card"], [data-testid="FileResumeCard"]',
        FILE_RESUME_CARD_RADIO:
          '[data-testid="resume-selection-file-resume-radio-card-input"], [data-testid="FileResumeCard-input"], input[type="radio"][value="file"]',
        SELECT_FILE_BUTTON: '[data-testid="resume-selection-file-resume-radio-card-button"]',

        // Buttons - Enhanced button selectors
        SUBMIT_BUTTON:
          '[data-testid="continue-button"], [data-testid="submit-button"], [data-testid="indeed-apply-button"], button[type="submit"]',
        CONTINUE_BUTTON:
          '[data-testid="continue-button"], button[type="submit"]',
        ACTION_BUTTONS:
          'button[type="submit"], button[class*="submit"], button[class*="continue"], button[class*="next"], button[class*="apply"]',
      },
      INDEED: {
        // Indeed-specific selectors
        INDEED_FORM_CONTAINER:
          ".ia-ApplyFormScreen, #ia-container, .indeed-apply-bd, .indeed-apply-form",
        INDEED_RESUME_SECTION: ".ia-ResumeSection",
        INDEED_RESUME_OPTIONS: ".ia-ResumeSelection-resume",
        INDEED_RESUME_UPLOAD_BUTTON: '[data-testid="resume-upload-button"]',
      },
      GLASSDOOR: {
        // Glassdoor-specific selectors
        GD_FORM_CONTAINER:
          ".jobsOverlayModal, .modal-content, .applyButtonContainer",
        GD_RESUME_UPLOAD: '[data-test="resume-upload-button"]',
        GD_RESUME_CONTAINER: ".resumeUploadContainer",
        GD_FILE_INPUT: '.resumeUploadContainer input[type="file"]',
      },
    };

    // Setup timeout values - adjusted for platform
    this.timeouts = {
      SHORT: this.platform === "glassdoor" ? 1000 : 500,
      STANDARD: this.platform === "glassdoor" ? 3000 : 2000,
      EXTENDED: this.platform === "glassdoor" ? 8000 : 5000,
      UPLOAD: this.platform === "glassdoor" ? 45000 : 30000,
    };

    // Cache for AI answers
    this.answerCache = new Map();
    this.pendingRequests = new Map();
    this.requestTimeout = 10000; // 10 second timeout

    // Track uploaded file inputs to prevent duplicate uploads
    this.uploadedInputs = new Set();

    // Step count for loop prevention (Indeed pattern)
    this.currentStepCount = 0;
    this.maxSteps = 20;
    this.lastUrl = null;
  }

  // ============ Step Types (Indeed Pattern) ============
  static StepType = {
    CONTACT_INFO: "CONTACT_INFO",
    RESUME_UPLOAD: "RESUME_UPLOAD",
    EXPERIENCE: "EXPERIENCE",
    QUESTIONS: "QUESTIONS",
    DEMOGRAPHICS: "DEMOGRAPHICS",
    REVIEW: "REVIEW",
    SUCCESS: "SUCCESS",
    UNKNOWN: "UNKNOWN",
  };

  // ============ URL-Based Step Detection (Indeed Pattern) ============

  detectStepFromUrl() {
    const url = window.location.href;
    const StepType = GlassdoorFormHandler.StepType;

    // Glassdoor/SmartApply URL patterns
    if (url.includes("/post-apply") || url.includes("smart-apply-action=POST_APPLY"))
      return StepType.SUCCESS;
    if (url.includes("/contact-info-module") || url.includes("/contact-info"))
      return StepType.CONTACT_INFO;
    if (url.includes("/resume-selection-module") || url.includes("/resume-selection"))
      return StepType.RESUME_UPLOAD;
    if (url.includes("/resume-module/relevant-experience"))
      return StepType.EXPERIENCE;
    if (url.includes("/questions-module") || url.includes("/qualification-questions"))
      return StepType.QUESTIONS;
    if (url.includes("/demographic-questions"))
      return StepType.DEMOGRAPHICS;
    if (url.includes("/review-module") || url.includes("/review"))
      return StepType.REVIEW;

    // Fallback: detect from DOM elements
    if (this.isResumeStepFromDOM()) return StepType.RESUME_UPLOAD;
    if (document.querySelector('[class*="qualification-questio"]'))
      return StepType.QUESTIONS;

    return StepType.UNKNOWN;
  }

  /**
   * Detect resume step purely from DOM elements (URL-independent)
   * More reliable than URL matching since SmartApply URL patterns change
   */
  isResumeStepFromDOM() {
    // Check for the resume selection form
    if (document.querySelector('[data-testid="resume-selection-form"]'))
      return true;
    // Check for the resume selection radio group
    if (document.querySelector('[data-testid="resume-selection-radio-card-group"]'))
      return true;
    // Check for the mosaic resume module zone
    if (document.querySelector('#mosaic-resumeSelectionModule'))
      return true;
    // Check for file resume card
    if (document.querySelector('[data-testid="resume-selection-file-resume-radio-card"]'))
      return true;
    // Check for structured resume card
    if (document.querySelector('[data-testid="resume-selection-structured-resume-radio-card"]'))
      return true;
    return false;
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
      this.lastUrl = newUrl;
      console.log(`🔄 URL changed: ${newUrl}`);
    }
  }

  async waitForUrlChange(timeout = 10000) {
    const startUrl = window.location.href;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkUrl = () => {
        if (window.location.href !== startUrl) {
          resolve(true);
          return;
        }
        if (Date.now() - startTime > timeout) {
          resolve(false);
          return;
        }
        setTimeout(checkUrl, 200);
      };
      checkUrl();
    });
  }

  // ============ Field Extraction (Indeed Pattern) ============

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
        current.hidden
      ) {
        return true;
      }

      // Check for zero dimensions
      const rect = current.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        return true;
      }

      current = current.parentElement;
    }
    return false;
  }

  /**
   * Extract all form fields directly from the DOM (Indeed Pattern)
   * Returns array of field objects with element references
   */
  extractFormFields() {
    if (true) {
      // Global overlay
      notifyStatus({ type: "WAITING_FOR_RESPONSE" });
    }

    const fields = [];
    const form = this.findFormContainer() || document.body;

    // 1. Text inputs (including email, tel, number, date)
    const textInputs = form.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="date"], input:not([type])'
    );
    textInputs.forEach((input) => {
      if (
        input.type === "hidden" ||
        input.type === "file" ||
        input.type === "checkbox" ||
        input.type === "radio"
      )
        return;

      if (this.isElementHidden(input)) {
        console.log(`⏭️ Skipping hidden field: ${input.name || input.id}`);
        return;
      }

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

    // 4. Radio button groups
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
      // Skip resume selection radio groups - these are handled by handleResumeStep()
      if (name === "resume-selection" || name?.includes("resume")) {
        console.log(`⏭️ Skipping resume radio group: "${name}" (handled by resume step)`);
        return;
      }

      const question = this.findQuestionForRadioGroup(radios);
      const options = radios.map((r) => ({
        value: r.value,
        text: this.getRadioOptionLabel(r),
        element: r,
      }));

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

    // 5. Checkboxes - handle as groups similar to radio buttons
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

    checkboxGroups.forEach((checkboxes, name) => {
      // If there's only one checkbox with this name, treat it as a simple checkbox
      if (checkboxes.length === 1) {
        const field = this.extractFieldInfo(checkboxes[0], "checkbox");
        if (field) fields.push(field);
        return;
      }

      // Multiple checkboxes with same name = checkbox group (like multi-select)
      // Find the question for this group (similar to radio groups)
      const question = this.findQuestionForCheckboxGroup(checkboxes);
      const options = checkboxes.map((cb) => ({
        value: cb.value,
        text: this.getCheckboxOptionLabel(cb),
        element: cb,
      }));

      console.log(
        `☑️ Checkbox group "${name}": Question="${question}", Options=[${options
          .map((o) => o.text)
          .join(", ")}]`
      );

      fields.push({
        type: "checkbox-group",
        name: name,
        label: question,
        element: checkboxes[0],
        options: options,
        disabled: checkboxes[0].disabled,
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
    const label = this.getLabelText(element);
    const placeholder = element.placeholder || "";

    // Skip if no identifying info
    if (!label && !placeholder && !element.name && !element.id) {
      return null;
    }

    return {
      type: type,
      element: element,
      id: element.id || null,
      name: element.name || null,
      label: label || placeholder || element.name || element.id || "",
      placeholder: placeholder,
      value: element.value || "",
      required: element.required || element.hasAttribute("aria-required"),
      disabled: element.disabled,
    };
  }

  /**
   * Get label text for a form element
   */
  getLabelText(element) {
    // Method 1: aria-label
    if (element.getAttribute("aria-label")) {
      return element.getAttribute("aria-label").trim();
    }

    // Method 2: aria-labelledby
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl) return labelEl.textContent.trim();
    }

    // Method 3: Associated label via 'for' attribute
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) return label.textContent.trim();
    }

    // Method 4: Parent label
    const parentLabel = element.closest("label");
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      clone
        .querySelectorAll("input, select, textarea")
        .forEach((el) => el.remove());
      return clone.textContent.trim();
    }

    // Method 5: Previous sibling label
    const prevSibling = element.previousElementSibling;
    if (prevSibling && prevSibling.tagName === "LABEL") {
      return prevSibling.textContent.trim();
    }

    // Method 6: Nearby legend (for fieldsets)
    const fieldset = element.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend) return legend.textContent.trim();
    }

    // Method 7: data-testid patterns
    const testId = element.getAttribute("data-testid");
    if (testId) {
      return testId
        .replace(/-/g, " ")
        .replace(/input|field/gi, "")
        .trim();
    }

    return "";
  }

  /**
   * Get the label for a specific radio option
   */
  getRadioOptionLabel(radio) {
    // Method 1: Parent label
    const parentLabel = radio.closest("label");
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll("input").forEach((el) => el.remove());
      const text = clone.textContent.trim();
      if (text) return text;
    }

    // Method 2: Sibling or nearby span with Glassdoor-specific classes
    const siblingSpan = radio.parentElement?.querySelector(
      ".css-l5h8kx, .css-u74ql7, .e37uo190, span"
    );
    if (siblingSpan) {
      return siblingSpan.textContent.trim();
    }

    // Method 3: Value attribute
    return radio.value || "";
  }

  /**
   * Find the QUESTION for a radio button group
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
              `📋 Found question via container match: "${text.substring(
                0,
                80
              )}..."`
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
          const safeMarkup = labelSpan.querySelector(
            '[data-testid="safe-markup"]'
          );
          if (safeMarkup) {
            const text = safeMarkup.textContent.trim();
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
      '.ia-Questions-item, [class*="Questions-item"], [data-testid*="input-q"], [id^="q_"], fieldset'
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
              `📋 Question from nested safe-markup: "${text.substring(
                0,
                80
              )}..."`
            );
            return text;
          }
        }
      }
    }

    // Method 3: Fieldset legend
    const fieldset = firstRadio.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend) return legend.textContent.trim();
    }

    // Method 4: aria-labelledby
    const labelledBy = firstRadio.getAttribute("aria-labelledby");
    if (labelledBy) {
      // aria-labelledby may have multiple IDs
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

    // Method 5: Look for mosaic label class
    if (container) {
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
    }

    // Final fallback - return empty, caller will use name
    console.warn(`⚠️ Could not extract question for radio group: ${radioName}`);
    return "";
  }

  /**
   * Get the label for a specific checkbox option
   */
  getCheckboxOptionLabel(checkbox) {
    // Method 1: Parent label
    const parentLabel = checkbox.closest("label");
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll("input").forEach((el) => el.remove());
      const text = clone.textContent.trim();
      if (text) return text;
    }

    // Method 2: Sibling span
    const siblingSpan = checkbox.parentElement?.querySelector("span");
    if (siblingSpan) {
      return siblingSpan.textContent.trim();
    }

    // Method 3: Value attribute
    return checkbox.value || "";
  }

  /**
   * Find the QUESTION for a checkbox group
   */
  findQuestionForCheckboxGroup(checkboxes) {
    if (!checkboxes || checkboxes.length === 0) return "";

    const firstCheckbox = checkboxes[0];
    const checkboxName = firstCheckbox.name;

    // Method 1: Fieldset legend (most common for checkbox groups)
    const fieldset = firstCheckbox.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend) {
        const safeMarkup = legend.querySelector('[data-testid="safe-markup"]');
        if (safeMarkup) {
          const text = safeMarkup.textContent.trim();
          if (text.length > 3) {
            console.log(
              `☑️ Question from legend safe-markup: "${text.substring(
                0,
                80
              )}..."`
            );
            return text;
          }
        }
        const text = legend.textContent.trim();
        if (text.length > 3) {
          console.log(`☑️ Question from legend: "${text.substring(0, 80)}..."`);
          return text;
        }
      }
    }

    // Method 2: Look for label with ID containing "multi-select-question-label"
    const container = firstCheckbox.closest(
      '.ia-Questions-item, [class*="Questions-item"], [data-testid*="input-q"], [id^="q_"]'
    );

    if (container) {
      // Look for question labels
      const questionLabels = container.querySelectorAll(
        'label[id*="multi-select-question-label"], label.mosaic-provider-module-apply-questions-10g55w1'
      );
      for (const label of questionLabels) {
        const safeMarkup = label.querySelector('[data-testid="safe-markup"]');
        if (safeMarkup) {
          const text = safeMarkup.textContent.trim();
          if (text.length > 3) {
            console.log(
              `☑️ Question from label safe-markup: "${text.substring(
                0,
                80
              )}..."`
            );
            return text;
          }
        }
      }

      // Look for spans with data-testid ending in "-label"
      const labelSpans = container.querySelectorAll('[data-testid$="-label"]');
      for (const span of labelSpans) {
        const parentLabel = span.closest("label");
        if (parentLabel && parentLabel.querySelector('input[type="checkbox"]'))
          continue;

        const safeMarkup = span.querySelector('[data-testid="safe-markup"]');
        if (safeMarkup) {
          const text = safeMarkup.textContent.trim();
          if (text.length > 3) {
            console.log(
              `☑️ Question from nested safe-markup: "${text.substring(
                0,
                80
              )}..."`
            );
            return text;
          }
        }
      }
    }

    // Method 3: Look using data-testid that matches the checkbox name
    const testId = `input-${checkboxName}-label`;
    const labelByTestId = document.querySelector(`[data-testid="${testId}"]`);
    if (labelByTestId) {
      const safeMarkup = labelByTestId.querySelector(
        '[data-testid="safe-markup"]'
      );
      if (safeMarkup) {
        const text = safeMarkup.textContent.trim();
        if (text.length > 3) return text;
      }
      const text = labelByTestId.textContent.trim();
      if (text.length > 3 && text.length < 1000) return text;
    }

    // Final fallback - return empty, caller will use name
    console.warn(
      `⚠️ Could not extract question for checkbox group: ${checkboxName}`
    );
    return "";
  }

  // ============ AI Answer Processing (Indeed Pattern) ============

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
        const context = {
          userData: this.userData,
          jobDescription: this.jobDescription,
          fieldType: field.type,
          required: field.required,
        };

        if (field.type === "checkbox-group") {
          const optionTexts =
            field.options?.map((o) => o.text || o.value) || [];
          if (optionTexts.length > 0) {
            answer = await this.aiService.getMultiSelectAnswer(
              question,
              optionTexts,
              context
            );
          }
        } else if (
          field.type === "select" ||
          field.type === "radio-group"
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
        } else if (AIResponseUtils.isSalaryField(question)) {
          answer = await this.aiService.getSalaryAnswer(question, [], context);
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

  // ============ Field Filling (Indeed Pattern) ============

  async fillFields(fields, answers) {
    let filledCount = 0;

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
    if (!element || this.isElementHidden(element)) return false;

    try {
      switch (field.type) {
        case "text":
        case "textarea":
          element.focus();
          element.value = "";
          await this.sleep(50);

          // Handle date fields
          if (this.isDateField(element)) {
            await this.handleDateInput(element, value);
          } else {
            element.value = value;
            element.dispatchEvent(new Event("input", { bubbles: true }));
            element.dispatchEvent(new Event("change", { bubbles: true }));
          }
          element.blur();
          return true;

        case "select":
          const option = Array.from(element.options).find(
            (opt) =>
              opt.text.toLowerCase().includes(value.toLowerCase()) ||
              value.toLowerCase().includes(opt.text.toLowerCase())
          );
          if (option) {
            element.value = option.value;
            element.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
          }
          return false;

        case "radio-group":
          // First try exact match (case-insensitive)
          let radioOption = field.options?.find(
            (opt) =>
              opt.text.toLowerCase().trim() === value.toLowerCase().trim()
          );

          // If no exact match, try word-boundary match (whole word)
          if (!radioOption) {
            const valueLower = value.toLowerCase().trim();
            radioOption = field.options?.find((opt) => {
              const optLower = opt.text.toLowerCase().trim();
              // Check if valueLower matches as a whole word in optLower
              const wordBoundaryRegex = new RegExp(
                `\\b${valueLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
                "i"
              );
              return wordBoundaryRegex.test(optLower);
            });
          }

          // If still no match, try if value starts with option text (for cases like "Yes, I agree")
          if (!radioOption) {
            radioOption = field.options?.find((opt) =>
              value
                .toLowerCase()
                .trim()
                .startsWith(opt.text.toLowerCase().trim())
            );
          }

          if (radioOption?.element) {
            console.log(
              `📻 Selecting radio option: "${radioOption.text}" for answer: "${value}"`
            );
            radioOption.element.click();
            radioOption.element.dispatchEvent(
              new Event("change", { bubbles: true })
            );
            return true;
          }
          console.warn(
            `⚠️ Could not find matching radio option for: "${value}"`
          );
          return false;

        case "checkbox-group":
          // Handle multi-select checkbox groups - value is an array from getMultiSelectAnswer
          let valuesToCheck = [];
          if (Array.isArray(value)) {
            valuesToCheck = value.map((v) => String(v).trim().toLowerCase());
          } else if (typeof value === "string") {
            valuesToCheck = value.split(",").map((v) => v.trim().toLowerCase());
          }

          let checkedCount = 0;
          for (const selectedValue of valuesToCheck) {
            // Try exact match first
            let checkboxOption = field.options?.find(
              (opt) => opt.text.toLowerCase().trim() === selectedValue
            );

            // Fallback: partial match
            if (!checkboxOption) {
              checkboxOption = field.options?.find(
                (opt) =>
                  opt.text.toLowerCase().includes(selectedValue) ||
                  selectedValue.includes(opt.text.toLowerCase())
              );
            }

            if (checkboxOption?.element && !checkboxOption.element.checked) {
              console.log(
                `☑️ Selecting checkbox option: "${checkboxOption.text}" for answer: "${selectedValue}"`
              );
              checkboxOption.element.click();
              checkboxOption.element.dispatchEvent(
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
          return checkedCount > 0;

        case "checkbox":
          const shouldCheck =
            value.toLowerCase().includes("yes") || value === "true";
          if (element.checked !== shouldCheck) {
            element.click();
          }
          return true;

        default:
          return false;
      }
    } catch (error) {
      console.error(`Error filling field ${field.label}:`, error);
      return false;
    }
  }

  // ============ DOM Stability (Indeed Pattern) ============

  async waitForDomToSettle(timeout = 5000, stableTime = 500) {
    return new Promise((resolve) => {
      let lastMutationTime = Date.now();
      let settled = false;
      const startTime = Date.now();

      const observer = new MutationObserver(() => {
        lastMutationTime = Date.now();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      const checkStable = () => {
        const now = Date.now();

        if (now - lastMutationTime >= stableTime) {
          settled = true;
          observer.disconnect();
          resolve(true);
          return;
        }

        if (now - startTime >= timeout) {
          observer.disconnect();
          resolve(false);
          return;
        }

        setTimeout(checkStable, 100);
      };

      setTimeout(checkStable, 100);
    });
  }

  /**
   * Enhanced button clicking with multiple interaction methods
   * @param {HTMLElement} button - Button element to click
   * @returns {Promise<boolean>} Success or failure
   */
  async clickButton(button) {
    if (!button || !this.isElementVisible(button)) {
      return false;
    }

    try {
      // Scroll into view
      button.scrollIntoView({ behavior: "smooth", block: "center" });
      await this.sleep(200);

      // Focus and click - using only native click (like manual click does)
      // Do NOT use multiple click methods - they cause race conditions and double-triggers
      button.focus();
      await this.sleep(100);
      button.click();

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle date input fields with proper MM/DD/YYYY formatting
   * @param {HTMLElement} element - Date input element
   * @param {string} value - Date value to input
   * @returns {Promise<void>}
   */
  async handleDateInput(element, value) {
    try {
      // Parse and format the date value
      const formattedDate = this.formatDateForInput(value);
      if (!formattedDate) {
        return;
      }

      // Clear the field first
      element.focus();
      await this.sleep(100);

      // Select all and delete
      element.select();
      document.execCommand("delete");

      // Set the value directly
      element.value = formattedDate;

      // Dispatch input events
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));

      // Simulate typing for better compatibility
      for (let i = 0; i < formattedDate.length; i++) {
        const char = formattedDate[i];
        const keydownEvent = new KeyboardEvent("keydown", {
          key: char,
          code: `Digit${char}`,
          bubbles: true,
        });
        const inputEvent = new InputEvent("input", {
          inputType: "insertText",
          data: char,
          bubbles: true,
        });

        element.dispatchEvent(keydownEvent);
        element.dispatchEvent(inputEvent);
        await this.sleep(50);
      }

      element.blur();
      await this.sleep(200);
    } catch (error) {
      return false;
    }
  }

  /**
   * Format date value to MM/DD/YYYY format
   * @param {string} value - Input date value
   * @returns {string} Formatted date or empty string
   */
  formatDateForInput(value) {
    if (!value) return "";

    try {
      // First check if this is a relative time answer (Immediate, 2 weeks, etc.)
      const relativeDate = this.convertAvailabilityToDate(value);
      if (relativeDate) {
        console.log(`📅 Converted "${value}" to date: ${relativeDate}`);
        return relativeDate;
      }

      // Try to parse various date formats
      let date;

      // If already in MM/DD/YYYY format
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
        return value;
      }

      // If in YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const parts = value.split("-");
        return `${parts[1]}/${parts[2]}/${parts[0]}`;
      }

      // Try parsing as a date
      date = new Date(value);

      if (isNaN(date.getTime())) {
        // Try extracting numbers and creating a reasonable date
        const numbers = value.match(/\d+/g);
        if (numbers && numbers.length >= 3) {
          const month = numbers[0].padStart(2, "0");
          const day = numbers[1].padStart(2, "0");
          let year = numbers[2];

          // Handle 2-digit years
          if (year.length === 2) {
            const currentYear = new Date().getFullYear();
            const century = Math.floor(currentYear / 100) * 100;
            year = century + parseInt(year);
            if (year > currentYear + 10) {
              year -= 100;
            }
          }

          return `${month}/${day}/${year}`;
        }
        return "";
      }

      // Format as MM/DD/YYYY
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      const year = date.getFullYear();

      return `${month}/${day}/${year}`;
    } catch (error) {
      return "";
    }
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
      // Not a relative time answer
      return null;
    }

    // Format as MM/DD/YYYY
    const month = String(targetDate.getMonth() + 1).padStart(2, "0");
    const day = String(targetDate.getDate()).padStart(2, "0");
    const year = targetDate.getFullYear();

    return `${month}/${day}/${year}`;
  }

  /**
   * Check if input is a date field
   * @param {HTMLElement} element - Input element
   * @returns {boolean} True if it's a date field
   */
  isDateField(element) {
    if (!element) return false;

    return (
      element.type === "date" ||
      element.placeholder?.includes("MM/DD/YYYY") ||
      element.placeholder?.includes("mm/dd/yyyy") ||
      element.placeholder?.includes("MM-DD-YYYY") ||
      element.name?.toLowerCase().includes("date") ||
      element.id?.toLowerCase().includes("date")
    );
  }

  /**
   * Check if question is date-related
   * @param {string} question - The question text
   * @param {string} fieldContext - Field context
   * @returns {boolean} True if it's a date-related question
   */
  isDateRelatedQuestion(question, fieldContext) {
    const dateKeywords = [
      "date",
      "when",
      "start",
      "end",
      "graduation",
      "employed",
      "available",
      "begin",
      "finish",
      "mm/dd/yyyy",
      "month",
      "year",
    ];

    const lowerQuestion = question.toLowerCase();
    const lowerContext = fieldContext.toLowerCase();

    return dateKeywords.some(
      (keyword) =>
        lowerQuestion.includes(keyword) || lowerContext.includes(keyword)
    );
  }

  /**
   * Upload blob to file input
   * @param {HTMLElement} fileInput - File input element
   * @param {Blob} blob - File blob
   * @param {string} fileName - File name
   * @returns {Promise<void>}
   */
  async uploadBlob(fileInput, blob, fileName) {
    try {
      const file = new File([blob], fileName, {
        type: blob.type || "application/pdf",
        lastModified: Date.now(),
      });

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;

      // Dispatch events
      await this.sleep(200);
      fileInput.dispatchEvent(new Event("focus", { bubbles: true }));
      await this.sleep(200);
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      await this.sleep(200);
      fileInput.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate and upload custom resume for unlimited users
   * @param {HTMLElement} fileInput - File input element
   * @param {Object} userDetails - User details
   * @param {string} jobDescription - Job description
   * @param {Array} fileUrls - Array of resume URLs
   * @returns {Promise<boolean>} Success or failure
   */

  async generateAndUploadCustomResume(
    fileInput,
    userDetails,
    jobDescription,
    fileUrls
  ) {
    try {
      const parseResponse = await fetch(`${this.aiBaseUrl}/parse-resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_url: fileUrls[fileUrls.length - 1],
        }),
      });

      if (!parseResponse.ok) {
        throw new Error(`Resume parsing failed: ${parseResponse.status}`);
      }

      const { text: parsedResumeText } = await parseResponse.json();

      const optimizeResponse = await fetch(
        `${this.aiBaseUrl}/generate-resume`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resume_text: parsedResumeText,
            job_description: jobDescription,
            user_data: {
              summary: userDetails.summary,
              projects: userDetails.projects,
              fullPositions: userDetails.fullPositions,
              education: userDetails.education,
              educationStartMonth: userDetails.educationStartMonth,
              educationStartYear: userDetails.educationStartYear,
              educationEndMonth: userDetails.educationEndMonth,
              educationEndYear: userDetails.educationEndYear,
            },
          }),
        }
      );

      if (!optimizeResponse.ok) {
        throw new Error(
          `Resume optimization failed: ${optimizeResponse.status}`
        );
      }

      const resumeData = await optimizeResponse.json();
      userDetails.author = userDetails.firstName + " " + userDetails.lastName;

      const generateResponse = await fetch(
        `${this.aiBaseUrl}/generate-resume-pdf`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_data: userDetails,
            resume_data: resumeData.data,
            template: this.fileHandler?.preferences?.resumeTemplate,
          }),
        }
      );

      if (!generateResponse.ok) {
        throw new Error(`Resume generation failed: ${generateResponse.status}`);
      }

      const blob = await generateResponse.blob();

      if (blob.size === 0) {
        throw new Error("Generated PDF is empty");
      }

      const fileName = `${userDetails.name || "resume"}.pdf`;
      await this.uploadBlob(fileInput, blob, fileName);
      return true;
    } catch (error) {
      return await this.uploadFileFromURL(fileInput, this.userData);
    }
  }

  /**
   * Match and upload resume (existing functionality)
   * @param {HTMLElement} fileInput - File input element
   * @param {Object} userDetails - User details
   * @param {string} jobDescription - Job description
   * @param {Array} fileUrls - Array of resume URLs
   * @returns {Promise<boolean>} Success or failure
   */
  async matchAndUploadResume(fileInput, userDetails, jobDescription, fileUrls) {
    try {
      return await this.uploadFileFromURL(fileInput, this.userData);
    } catch (error) {
      return false;
    }
  }

  /**
   * Processes the job description element to maintain formatting
   * @param {HTMLElement} element - The job description container element
   * @returns {string} The processed job description
   */
  processJobDescription(element) {
    const clone = element.cloneNode(true);

    const listItems = clone.querySelectorAll("li");
    listItems.forEach((item) => {
      item.textContent = `• ${item.textContent.trim()}`;
    });

    // Replace heading elements with proper formatting
    const headings = clone.querySelectorAll("h1, h2, h3, h4, h5, h6");
    headings.forEach((heading) => {
      heading.textContent = `${heading.textContent.trim()}`;
    });

    // Get the text with preserved formatting
    return clone.textContent.trim();
  }

  /**
   * Check if this is the final submit button
   * @param {HTMLElement} button The button to check
   * @returns {boolean} True if it's a final submit button
   */
  isFinalSubmitButton(button) {
    if (!button) return false;

    const buttonText = button.textContent.trim().toLowerCase();
    return (
      buttonText.includes("submit") ||
      buttonText.includes("apply") ||
      buttonText === "submit application" ||
      buttonText === "submit your application"
    );
  }

  /**
   * Check if button is a Next or Continue button
   * @param {HTMLElement} button The button to check
   * @returns {boolean} True if it's a Next or Continue button
   */
  isNextOrContinueButton(button) {
    if (!button) return false;

    const buttonText = button.textContent.trim().toLowerCase();
    return (
      buttonText.includes("continue") ||
      buttonText.includes("next") ||
      buttonText.includes("review") ||
      buttonText === "continue" ||
      buttonText === "next" ||
      buttonText === "review"
    );
  }

  /**
   * Check if there's a CAPTCHA preventing form submission
   * @returns {boolean} True if CAPTCHA is detected
   */
  detectCaptcha() {
    try {
      // Common CAPTCHA selectors
      const captchaSelectors = [
        ".g-recaptcha",
        ".h-captcha",
        "[data-sitekey]",
        ".cf-turnstile",
        ".captcha",
        '[id*="captcha"]',
        '[class*="captcha"]',
        'iframe[src*="recaptcha"]',
        'iframe[src*="hcaptcha"]',
        'iframe[title*="captcha"]',
        'iframe[title*="verification"]',
      ];

      // Check for CAPTCHA elements
      for (const selector of captchaSelectors) {
        const element = document.querySelector(selector);
        if (element && this.isElementVisible(element)) {
          return true;
        }
      }

      // Check for CAPTCHA-related text content
      const captchaTexts = [
        "complete the captcha",
        "verify you are human",
        "prove you are not a robot",
        "i'm not a robot",
        "human verification",
        "security verification",
        "please verify",
      ];

      const pageText = document.body.textContent.toLowerCase();
      for (const text of captchaTexts) {
        if (pageText.includes(text)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Find the form container based on platform
   * @returns {HTMLElement} The form container
   */
  findFormContainer() {
    let container = null;

    if (this.platform === "indeed") {
      container =
        document.querySelector(this.selectors.INDEED.INDEED_FORM_CONTAINER) ||
        document.querySelector("form") ||
        document.body;
    } else {
      container =
        document.querySelector(this.selectors.GLASSDOOR.GD_FORM_CONTAINER) ||
        document.querySelector("form") ||
        document.body;
    }

    return container;
  }

  /**
   * Find an element by attribute that contains specified text
   * @param {string} attribute Attribute name
   * @param {string} value Attribute value
   * @param {string} textContent Text content to match
   * @returns {HTMLElement} The matching element
   */
  findElementByAttribute(attribute, value, textContent) {
    const elements = Array.from(
      document.querySelectorAll(`[${attribute}="${value}"]`)
    );
    return elements.find(
      (el) =>
        el.textContent &&
        el.textContent.trim().toLowerCase().includes(textContent.toLowerCase())
    );
  }

  /**
   * Handle all required checkboxes on the form
   * @param {HTMLElement} container The form container
   * @returns {Promise<void>}
   */
  async handleRequiredCheckboxes(container) {
    try {
      // Find all checkbox inputs
      const checkboxes = Array.from(
        container.querySelectorAll('input[type="checkbox"]')
      );

      for (const checkbox of checkboxes) {
        // Skip if not visible
        if (!this.isElementVisible(checkbox)) continue;

        // Check if this is required
        const isRequired =
          checkbox.hasAttribute("required") ||
          checkbox.hasAttribute("aria-required") ||
          checkbox.closest('[aria-required="true"]') ||
          checkbox.closest(".required");

        if (isRequired && !checkbox.checked) {
          checkbox.click();
          await this.sleep(200);
        }
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle a specific form element based on its type
   * @param {HTMLElement} element The form element
   * @param {string} labelText The label text
   * @returns {Promise<void>}
   */
  async handleFormElement(element, labelText) {
    try {
      // Get options for this element (for select, radio, etc.)
      const options = this.getElementOptions(element);

      // Determine field type based on element
      const fieldType = this.getElementFieldType(element);

      // Get value from AI or predefined mappings
      const value = await this.getValueForField(labelText, options, fieldType);
      if (!value) return;

      // Apply the value to the element based on its type
      await this.applyValueToElement(element, value, labelText);
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle radio input element
   * @param {HTMLElement} element The radio input
   * @param {string} value The value to apply
   * @param {string} labelText The label text
   * @returns {Promise<void>}
   */
  async handleRadioInput(element, value, labelText) {
    // Convert value to string and lowercase for comparison
    const normalizedValue = String(value).toLowerCase().trim();

    // Check if the radio button's value matches or its label contains the value
    const matches = (radioValue) => {
      const normalizedRadioValue = String(radioValue).toLowerCase().trim();
      return (
        normalizedValue === normalizedRadioValue ||
        normalizedRadioValue.includes(normalizedValue) ||
        normalizedValue.includes(normalizedRadioValue)
      );
    };

    // Find radio buttons in the same group
    const radioGroup = document.getElementsByName(element.name);

    for (const radio of radioGroup) {
      // Compare value with the radio button's value, label, or associated text
      const radioLabel = this.getElementLabel(radio);
      const radioValue = radio.value;

      if (matches(radioValue) || matches(radioLabel)) {
        // Simulate human-like interaction
        radio.focus();
        radio.click();
        return;
      }
    }

    // If no match is found and this is a required field, select the first option as fallback
    if (
      element.hasAttribute("required") ||
      element.closest('[aria-required="true"]')
    ) {
      if (radioGroup.length > 0) {
        radioGroup[0].focus();
        radioGroup[0].click();
      }
    }
  }

  /**
   * Handle checkbox input element with intelligent value interpretation
   * @param {HTMLElement} element The checkbox input
   * @param {string} value The value to apply
   * @param {string} labelText The label text
   * @returns {Promise<void>}
   */
  async handleCheckboxInput(element, value, labelText) {
    const normalizedValue = String(value).toLowerCase().trim();
    const normalizedLabel = labelText.toLowerCase().trim();

    // Determine if checkbox should be checked based on multiple factors
    let shouldBeChecked = false;

    // 1. Direct affirmative responses
    const affirmativeValues = [
      "true",
      "yes",
      "y",
      "ok",
      "okay",
      "sure",
      "definitely",
      "absolutely",
      "agreed",
      "agree",
      "accept",
      "accepted",
      "authorize",
      "authorized",
      "confirm",
      "confirmed",
      "approve",
      "approved",
      "allow",
      "allowed",
      "grant",
      "granted",
      "enable",
      "enabled",
      "checked",
      "selected",
      "i agree",
      "i accept",
      "i authorize",
      "i confirm",
      "i have",
      "1",
      "on",
      "active",
      "valid",
      "correct",
      "right",
      "subscribe",
      "opt in",
      "opt-in",
      "sign up",
      "enroll",
      "join",
      "participate",
      "consent",
      "acknowledge",
      "understand",
      "read and understood",
    ];

    // 2. Direct negative responses
    const negativeValues = [
      "false",
      "no",
      "n",
      "never",
      "none",
      "reject",
      "rejected",
      "deny",
      "denied",
      "decline",
      "declined",
      "refuse",
      "refused",
      "disagree",
      "disapprove",
      "forbid",
      "forbidden",
      "disable",
      "disabled",
      "unchecked",
      "unselected",
      "i disagree",
      "i decline",
      "i refuse",
      "0",
      "off",
      "inactive",
      "invalid",
      "incorrect",
      "wrong",
      "unsubscribe",
      "opt out",
      "opt-out",
      "do not",
      "dont",
      "not interested",
      "not applicable",
      "n/a",
      "na",
      "skip",
      "pass",
      "ignore",
      "not required",
      "not needed",
    ];

    // Check for direct matches first
    if (affirmativeValues.some((val) => normalizedValue.includes(val))) {
      shouldBeChecked = true;
    } else if (negativeValues.some((val) => normalizedValue.includes(val))) {
      shouldBeChecked = false;
    } else {
      // 3. Context-based decision making for ambiguous responses

      // Required/mandatory checkboxes should typically be checked
      const isRequired =
        element.hasAttribute("required") ||
        element.hasAttribute("aria-required") ||
        element.closest('[aria-required="true"]') ||
        normalizedLabel.includes("required") ||
        normalizedLabel.includes("mandatory") ||
        normalizedLabel.includes("must");

      // Terms, privacy, agreement checkboxes usually need to be checked
      const isAgreementType =
        normalizedLabel.includes("terms") ||
        normalizedLabel.includes("privacy") ||
        normalizedLabel.includes("policy") ||
        normalizedLabel.includes("agreement") ||
        normalizedLabel.includes("consent") ||
        normalizedLabel.includes("i agree") ||
        normalizedLabel.includes("i accept") ||
        normalizedLabel.includes("i authorize") ||
        normalizedLabel.includes("acknowledge") ||
        normalizedLabel.includes("understand") ||
        normalizedLabel.includes("legal") ||
        normalizedLabel.includes("disclaimer");

      // Experience/skills checkboxes - check if value suggests having the skill
      const isExperienceType =
        normalizedLabel.includes("experience") ||
        normalizedLabel.includes("skill") ||
        normalizedLabel.includes("familiar") ||
        normalizedLabel.includes("knowledge") ||
        normalizedLabel.includes("ability") ||
        normalizedLabel.includes("do you have") ||
        normalizedLabel.includes("are you") ||
        normalizedLabel.includes("can you") ||
        normalizedLabel.includes("have you") ||
        normalizedLabel.includes("worked with") ||
        normalizedLabel.includes("used") ||
        normalizedLabel.includes("proficient");

      // Availability/willingness questions
      const isAvailabilityType =
        normalizedLabel.includes("available") ||
        normalizedLabel.includes("willing") ||
        normalizedLabel.includes("able to") ||
        normalizedLabel.includes("can work") ||
        normalizedLabel.includes("flexible") ||
        normalizedLabel.includes("relocate") ||
        normalizedLabel.includes("travel") ||
        normalizedLabel.includes("overtime") ||
        normalizedLabel.includes("weekends") ||
        normalizedLabel.includes("remote") ||
        normalizedLabel.includes("hybrid");

      // Eligibility questions
      const isEligibilityType =
        normalizedLabel.includes("eligible") ||
        normalizedLabel.includes("authorized") ||
        normalizedLabel.includes("legal") ||
        normalizedLabel.includes("visa") ||
        normalizedLabel.includes("citizenship") ||
        normalizedLabel.includes("permit") ||
        normalizedLabel.includes("clearance") ||
        normalizedLabel.includes("background check") ||
        normalizedLabel.includes("drug test");

      // Notification/communication preferences
      const isNotificationType =
        normalizedLabel.includes("notify") ||
        normalizedLabel.includes("email") ||
        normalizedLabel.includes("contact") ||
        normalizedLabel.includes("updates") ||
        normalizedLabel.includes("newsletter") ||
        normalizedLabel.includes("marketing") ||
        normalizedLabel.includes("promotional") ||
        normalizedLabel.includes("communications");

      // Education/certification questions
      const isEducationType =
        normalizedLabel.includes("degree") ||
        normalizedLabel.includes("education") ||
        normalizedLabel.includes("certified") ||
        normalizedLabel.includes("license") ||
        normalizedLabel.includes("qualification") ||
        normalizedLabel.includes("graduate") ||
        normalizedLabel.includes("diploma") ||
        normalizedLabel.includes("course") ||
        normalizedLabel.includes("training");

      // Disability/accommodation questions
      const isAccommodationType =
        normalizedLabel.includes("disability") ||
        normalizedLabel.includes("accommodation") ||
        normalizedLabel.includes("assistance") ||
        normalizedLabel.includes("special needs") ||
        normalizedLabel.includes("ada");

      // For experience questions, check if the response suggests positive experience
      if (isExperienceType) {
        const experienceIndicators = [
          "experience",
          "skilled",
          "familiar",
          "knowledgeable",
          "able",
          "competent",
          "proficient",
          "expert",
          "qualified",
          "trained",
          "worked with",
          "used",
          "know",
          "understand",
          "can do",
          "years",
          "months",
          "level",
          "intermediate",
          "advanced",
          "beginner",
          "certification",
          "certified",
          "project",
          "developed",
          "built",
          "implemented",
          "managed",
          "led",
          "created",
        ];

        shouldBeChecked =
          experienceIndicators.some((indicator) =>
            normalizedValue.includes(indicator)
          ) || normalizedValue.length > 10; // Longer responses usually indicate experience
      }
      // For availability questions, default to yes unless explicitly negative
      else if (isAvailabilityType) {
        const availabilityPositive = [
          "available",
          "flexible",
          "willing",
          "can",
          "able",
          "open",
          "interested",
          "ready",
          "happy to",
          "fine with",
          "comfortable",
        ];

        shouldBeChecked =
          availabilityPositive.some((indicator) =>
            normalizedValue.includes(indicator)
          ) || normalizedValue.length < 5; // Short responses often mean "yes"
      }
      // For eligibility questions, assume eligible unless stated otherwise
      else if (isEligibilityType) {
        const eligibilityPositive = [
          "eligible",
          "authorized",
          "citizen",
          "permanent",
          "legal",
          "valid",
          "cleared",
          "approved",
          "qualified",
          "permitted",
        ];

        shouldBeChecked =
          eligibilityPositive.some((indicator) =>
            normalizedValue.includes(indicator)
          ) || !negativeValues.some((val) => normalizedValue.includes(val));
      }
      // For education questions, check for educational achievements
      else if (isEducationType) {
        const educationIndicators = [
          "degree",
          "bachelor",
          "master",
          "phd",
          "doctorate",
          "diploma",
          "certified",
          "licensed",
          "qualified",
          "graduate",
          "university",
          "college",
          "course",
          "training",
          "program",
          "certification",
        ];

        shouldBeChecked = educationIndicators.some((indicator) =>
          normalizedValue.includes(indicator)
        );
      }
      // For notification preferences, default to opt-in unless explicitly negative
      else if (isNotificationType) {
        shouldBeChecked = !negativeValues.some((val) =>
          normalizedValue.includes(val)
        );
      }
      // For accommodation questions, only check if explicitly needed
      else if (isAccommodationType) {
        const accommodationNeeded = [
          "need",
          "require",
          "request",
          "assistance",
          "help",
          "support",
          "accommodation",
          "disability",
          "limitation",
          "condition",
        ];

        shouldBeChecked = accommodationNeeded.some((indicator) =>
          normalizedValue.includes(indicator)
        );
      }
      // For agreement/required checkboxes, default to checked
      else if (isAgreementType || isRequired) {
        shouldBeChecked = true;
      }
      // For other types, try to parse if the response is generally positive
      else {
        const positiveIndicators = [
          "have",
          "can",
          "will",
          "would",
          "should",
          "available",
          "interested",
          "willing",
          "able",
          "ready",
          "qualified",
          "comfortable",
          "confident",
          "capable",
          "suitable",
          "appropriate",
        ];

        shouldBeChecked = positiveIndicators.some((indicator) =>
          normalizedValue.includes(indicator)
        );
      }
    }

    // Apply the decision
    if (shouldBeChecked && !element.checked) {
      element.focus();
      element.click();
    } else if (!shouldBeChecked && element.checked) {
      element.focus();
      element.click();
    }
    // If already in correct state, do nothing
  }

  /**
   * Handle phone input element with country code - Enhanced for Glassdoor
   * @param {HTMLElement} element The phone input
   * @param {string} value The phone number
   * @returns {Promise<void>}
   */
  async handlePhoneInput(element, value) {
    try {
      // Get phone number from userData if no value provided
      const phoneValue =
        value || this.userData.phoneNumber || this.userData.phone;

      if (!phoneValue) {
        return;
      }

      // Check if element is a select field - handle differently
      if (element.tagName.toLowerCase() === "select") {
        console.log(
          "📞 Phone element is a select field - handling as dropdown"
        );
        await this.handleSelect(element, phoneValue, "phone");
        return;
      }

      // First check if this is a Glassdoor phone input
      const glassdoorPhoneContainer = element.closest(
        ".mosaic-provider-module-apply-contact-info-1afmp4o"
      );

      if (glassdoorPhoneContainer) {
        return await this.handleGlassdoorPhoneInput(element, phoneValue);
      }

      // Check for International Telephone Input (iTi) library
      const itiContainer =
        element.closest(".PhoneInput") || element.closest(".iti");
      if (itiContainer) {
        return await this.handleItiPhoneInput(element, phoneValue);
      }

      // Fallback to direct phone input (only for text inputs)
      if (element.tagName.toLowerCase() === "input") {
        await this.simulateHumanInput(element, phoneValue);
      } else {
        console.log(
          "⚠️ Phone element is not an input or select field, skipping"
        );
      }
    } catch (error) {
      console.error("❌ Error in handlePhoneInput:", error);
      const phoneValue =
        value || this.userData.phone || this.userData.phoneNumber;
      if (phoneValue && element.tagName.toLowerCase() === "input") {
        try {
          await this.simulateHumanInput(element, phoneValue);
        } catch (retryError) {
          console.error("❌ Retry failed in handlePhoneInput:", retryError);
        }
      }
    }
  }

  /**
   * Handle Glassdoor-specific phone input with country code - FIXED
   * @param {HTMLElement} element The phone input element
   * @param {string} value The phone number
   * @returns {Promise<void>}
   */
  async handleGlassdoorPhoneInput(element, value) {
    try {
      // Get phone data from userData if not provided directly
      const phoneNumber =
        value || this.userData.phoneNumber || this.userData.phone;
      const phoneCountryCode = this.userData.phoneCountryCode;

      if (!phoneNumber) {
        return;
      }

      // Find the Glassdoor phone input container (updated for new Indeed phone field)
      const phoneContainer =
        element.closest(".mosaic-provider-module-apply-contact-info-1afmp4o") ||
        element.closest('fieldset[data-testid="phone-number-field"]') ||
        element.closest(".mosaic-provider-module-apply-contact-info-1f1q1js") ||
        document.querySelector(
          ".mosaic-provider-module-apply-contact-info-1afmp4o"
        ) ||
        document.querySelector('fieldset[data-testid="phone-number-field"]') ||
        document.querySelector(
          ".mosaic-provider-module-apply-contact-info-1f1q1js"
        );

      if (!phoneContainer) {
        await this.simulateHumanInput(element, phoneNumber);
        return;
      }

      // Find the actual phone input field
      const phoneInput =
        phoneContainer.querySelector(
          'input[name="phone"], input[type="tel"], input[aria-label*="phone" i]'
        ) || element;

      // Find the country selector button - Updated selector for new Indeed phone field
      const countrySelector =
        phoneContainer.querySelector('button[role="combobox"]') ||
        phoneContainer.querySelector('button[aria-haspopup="listbox"]') ||
        phoneContainer.querySelector(
          ".mosaic-provider-module-apply-contact-info-dw0e05"
        ) ||
        phoneContainer.querySelector(
          ".mosaic-provider-module-apply-contact-info-hohfca"
        );

      if (!countrySelector) {
        await this.setGlassdoorPhoneValue(phoneInput, phoneNumber);
        return;
      }

      // Handle country selection if we have a country code
      let phoneNumberWithoutCode = phoneNumber;
      if (phoneCountryCode) {
        const success = await this.selectGlassdoorCountry(
          countrySelector,
          phoneCountryCode
        );
        if (success) {
          // Process phone number to remove country code
          phoneNumberWithoutCode = this.processPhoneNumber(
            phoneNumber,
            phoneCountryCode
          );
        }
      }

      await this.setGlassdoorPhoneValue(phoneInput, phoneNumberWithoutCode);
    } catch (error) {
      await this.simulateHumanInput(element, value);
    }
  }

  /**
   * Select country in Glassdoor country dropdown - IMPROVED
   * @param {HTMLElement} countrySelector The country selector button
   * @param {string} phoneCountryCode The country code to select
   * @returns {Promise<boolean>} Success or failure
   */
  async selectGlassdoorCountry(countrySelector, phoneCountryCode) {
    try {
      // Format country code
      const formattedCode = phoneCountryCode.startsWith("+")
        ? phoneCountryCode
        : `+${phoneCountryCode}`;

      // Click the country selector to open dropdown
      countrySelector.focus();
      await this.sleep(100);
      countrySelector.click();
      await this.sleep(800); // Increased wait time

      // Wait for dropdown to appear with multiple possible selectors
      const dropdown = await this.waitForGlassdoorDropdown();

      if (!dropdown) {
        return false;
      }

      // Find all country options with multiple selectors (updated for new Indeed phone field)
      const countryOptions = dropdown.querySelectorAll(
        'li[role="option"], .mosaic-provider-module-apply-contact-info-12fezc9, .mosaic-provider-module-apply-contact-info-hllz4e, li[data-testid*="country-select-"], li'
      );

      if (countryOptions.length === 0) {
        return false;
      }

      // Look for matching country code - try multiple approaches
      let selectedOption = null;

      // Approach 1: Look for exact country code match
      for (const option of countryOptions) {
        const optionText = option.textContent || "";

        // Check if this option contains our target country code
        if (optionText.includes(formattedCode)) {
          selectedOption = option;
          break;
        }
      }

      // Approach 2: Look for country code in spans within options
      if (!selectedOption) {
        for (const option of countryOptions) {
          const codeSpans = option.querySelectorAll("span");
          for (const span of codeSpans) {
            if (span.textContent && span.textContent.includes(formattedCode)) {
              selectedOption = option;
              break;
            }
          }
          if (selectedOption) break;
        }
      }

      // Approach 3: Look for country name if we have common mappings
      if (!selectedOption) {
        const commonMappings = {
          "+1": ["United States", "US", "USA", "America"],
          "+44": ["United Kingdom", "UK", "Britain", "England"],
          "+91": ["India", "IND"],
          "+86": ["China", "CHN"],
          "+81": ["Japan", "JPN"],
          "+49": ["Germany", "DEU", "Deutschland"],
          "+33": ["France", "FRA"],
          "+39": ["Italy", "ITA"],
          "+34": ["Spain", "ESP"],
          "+7": ["Russia", "RUS"],
          "+55": ["Brazil", "BRA"],
          "+52": ["Mexico", "MEX"],
          "+61": ["Australia", "AUS"],
          "+82": ["South Korea", "KOR"],
          "+234": ["Nigeria", "NGA"],
          "+27": ["South Africa", "ZAF"],
          "+31": ["Netherlands", "NLD"],
          "+46": ["Sweden", "SWE"],
          "+47": ["Norway", "NOR"],
          "+45": ["Denmark", "DNK"],
          "+41": ["Switzerland", "CHE"],
          "+43": ["Austria", "AUT"],
          "+32": ["Belgium", "BEL"],
          "+351": ["Portugal", "PRT"],
        };

        const countryNames = commonMappings[formattedCode] || [];

        for (const option of countryOptions) {
          const optionText = option.textContent.toLowerCase();

          for (const countryName of countryNames) {
            if (optionText.includes(countryName.toLowerCase())) {
              selectedOption = option;
              break;
            }
          }
          if (selectedOption) break;
        }
      }

      if (selectedOption) {
        // Try multiple click methods
        selectedOption.focus();
        await this.sleep(100);
        selectedOption.click();
        await this.sleep(200);

        // Verify the dropdown closed
        await this.sleep(300);
        const dropdownStillOpen = document.querySelector(
          '#Popup-\\:rp\\:, .mosaic-provider-module-apply-contact-info-1x9agnk[style*="visible"]'
        );

        if (dropdownStillOpen) {
          // Try mouse event
          const clickEvent = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
          });
          selectedOption.dispatchEvent(clickEvent);
          await this.sleep(300);
        }

        return true;
      }
      // Close dropdown by clicking outside or pressing escape
      document.body.click();
      await this.sleep(200);

      return false;
    } catch (error) {
      return false;

      // Try to close dropdown
      try {
        document.body.click();
        await this.sleep(200);
      } catch (e) {
        // Ignore
      }

      return false;
    }
  }

  /**
   * Wait for Glassdoor dropdown to appear - IMPROVED
   * @param {number} timeout Maximum wait time in milliseconds
   * @returns {Promise<HTMLElement|null>} The dropdown element or null
   */
  async waitForGlassdoorDropdown(timeout = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Try multiple selectors for the dropdown (updated for new Indeed phone field)
      const selectors = [
        "#Popup-\\:rj\\:",
        '[id*="Listbox-"]',
        ".mosaic-provider-module-apply-contact-info-1xkcyt7",
        ".mosaic-provider-module-apply-contact-info-1bmrtmd",
        "#Popup-\\:rp\\:",
        ".mosaic-provider-module-apply-contact-info-1x9agnk",
        '[role="listbox"]',
        '[id*="Popup"]',
        '[class*="dropdown"]',
        '[class*="menu"]',
      ];

      for (const selector of selectors) {
        try {
          const dropdown = document.querySelector(selector);
          if (dropdown && this.isElementVisible(dropdown)) {
            return dropdown;
          }
        } catch (e) {
          // Some selectors might be invalid, skip them
          continue;
        }
      }

      await this.sleep(100);
    }

    return null;
  }

  /**
   * Process phone number to remove country code
   * @param {string} phoneNumber The full phone number
   * @param {string} phoneCountryCode The country code
   * @returns {string} The processed phone number
   */
  processPhoneNumber(phoneNumber, phoneCountryCode) {
    if (!phoneCountryCode) {
      return phoneNumber;
    }

    const formattedCode = phoneCountryCode.startsWith("+")
      ? phoneCountryCode
      : `+${phoneCountryCode}`;

    let processedNumber = phoneNumber;

    // Remove country code if phone number starts with it
    if (phoneNumber.startsWith(formattedCode)) {
      processedNumber = phoneNumber
        .substring(formattedCode.length)
        .trim()
        .replace(/^[\s\-\(\)]+/, "");
    } else if (phoneNumber.startsWith("+")) {
      // Remove any country code
      const genericCodeMatch = phoneNumber.match(/^\+\d{1,4}/);
      if (genericCodeMatch) {
        processedNumber = phoneNumber
          .substring(genericCodeMatch[0].length)
          .trim()
          .replace(/^[\s\-\(\)]+/, "");
      }
    }

    return processedNumber;
  }

  /**
   * Set phone value in Glassdoor phone input
   * @param {HTMLElement} input The phone input element
   * @param {string} value The phone number value
   * @returns {Promise<boolean>} Success or failure
   */
  async setGlassdoorPhoneValue(input, value) {
    if (!input || value === undefined) return false;

    try {
      // Wait briefly
      await this.sleep(200);

      // Focus the input
      input.focus();
      await this.sleep(100);

      // Clear existing value
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await this.sleep(100);

      // Set new value character by character for better compatibility
      for (let i = 0; i < value.length; i++) {
        input.value += value[i];
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await this.sleep(50);
      }

      // Final events
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("blur", { bubbles: true }));

      // Verify the value was set
      await this.sleep(200);

      if (input.value !== value) {
        // Use direct property assignment as fallback
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        ).set;

        nativeInputValueSetter.call(input, value);

        // Trigger events
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        await this.sleep(100);
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle International Telephone Input (iTi) phone fields
   * @param {HTMLElement} element The phone input element
   * @param {string} value The phone number
   * @returns {Promise<void>}
   */
  async handleItiPhoneInput(element, value) {
    try {
      // Get phone data
      const phoneNumber =
        value || this.userData.phone || this.userData.phoneNumber;
      const phoneCountryCode = this.userData.phoneCountryCode;

      if (!phoneNumber) {
        return;
      }

      // Find the country select element
      const countrySelect =
        element.closest(".PhoneInput")?.querySelector("select") ||
        element.parentElement.querySelector(".iti__selected-flag");

      if (!countrySelect) {
        // No country selector, just set phone directly
        await this.simulateHumanInput(element, phoneNumber);
        return;
      }

      // Parse phone number to extract country code and number
      const normalizedValue = phoneNumber.replace(/[^\d+]/g, "");
      let countryCode =
        phoneCountryCode || normalizedValue.match(/^\+?(\d{1,3})/)?.[1];
      let phoneNumberPart = normalizedValue.replace(/^\+?\d{1,3}/, "").trim();

      if (countryCode && countrySelect.tagName === "SELECT") {
        // Handle dropdown select
        const options = Array.from(countrySelect.options);
        const countryOption = options.find((opt) =>
          opt.text.includes(`(+${countryCode})`)
        );

        if (countryOption) {
          // Select country
          countrySelect.focus();
          countrySelect.value = countryOption.value;
          countrySelect.dispatchEvent(new Event("change", { bubbles: true }));
          await this.sleep(300);
        }
      } else if (
        countryCode &&
        countrySelect.classList.contains("iti__selected-flag")
      ) {
        // Handle iTi flag selector
        countrySelect.click();
        await this.sleep(500);

        // Get dropdown list
        const countryList = document.querySelector(".iti__country-list");
        if (countryList) {
          const countryItems = countryList.querySelectorAll("li.iti__country");

          for (const item of countryItems) {
            const codeSpan = item.querySelector(".iti__dial-code");
            if (codeSpan && codeSpan.textContent.trim() === `+${countryCode}`) {
              item.click();
              await this.sleep(300);
              break;
            }
          }
        }
      }

      // Input phone number
      await this.simulateHumanInput(element, phoneNumberPart || phoneNumber);
    } catch (error) {
      return false;
    }
  }

  /**
   * Enhanced phone field detection with more comprehensive checks
   * @param {HTMLElement} element The input element
   * @param {string} labelText The label text (can be empty)
   * @returns {boolean} True if this is a phone field
   */
  isPhoneField(element, labelText = "") {
    // First, exclude country select fields and other non-phone selects
    if (element.tagName.toLowerCase() === "select") {
      // Check if this is a country selection dropdown
      const hasCountryOptions = Array.from(element.options || []).some(
        (option) =>
          option.textContent.toLowerCase().includes("afghanistan") ||
          option.textContent.toLowerCase().includes("albania") ||
          option.textContent.toLowerCase().includes("country") ||
          option.value.length === 2 // Country codes are typically 2 letters
      );

      if (hasCountryOptions) {
        console.log(
          "🌍 Detected country select field, not treating as phone field"
        );
        return false;
      }
    }

    // Check input type first
    if (element.type === "tel") {
      return true;
    }

    // Check for Glassdoor phone container (most reliable)
    if (element.closest(".mosaic-provider-module-apply-contact-info-1afmp4o")) {
      return true;
    }

    // Check for iTi phone input
    if (element.closest(".PhoneInput") || element.closest(".iti")) {
      return true;
    }

    // Check input attributes
    const phoneAttributes = ["phone", "tel", "mobile", "cell", "cellular"];

    for (const attr of phoneAttributes) {
      if (
        element.name?.toLowerCase().includes(attr) ||
        element.id?.toLowerCase().includes(attr) ||
        element.placeholder?.toLowerCase().includes(attr) ||
        element.getAttribute("aria-label")?.toLowerCase().includes(attr)
      ) {
        return true;
      }
    }

    // Check label text if provided
    if (labelText) {
      const normalizedLabel = labelText.toLowerCase();
      const phoneKeywords = [
        "phone",
        "telephone",
        "mobile",
        "cell",
        "contact number",
        "phone number",
        "tel",
        "cellular",
      ];

      if (phoneKeywords.some((keyword) => normalizedLabel.includes(keyword))) {
        return true;
      }
    }

    // Check nearby text content for phone indicators
    const container = element.closest("div, span, label");
    if (container) {
      const containerText = container.textContent.toLowerCase();
      if (containerText.includes("phone") || containerText.includes("tel")) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get the label text for a form element
   * @param {HTMLElement} element The form element
   * @returns {string} The label text
   */
  getElementLabel(element) {
    // Try to get label from associated label element
    const labelElement = document.querySelector(`label[for="${element.id}"]`);
    if (labelElement) {
      return labelElement.textContent.trim();
    }

    // Try to get label from parent label element
    const parentLabel = element.closest("label");
    if (parentLabel) {
      // Get text content excluding nested input texts
      const labelText = Array.from(parentLabel.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent.trim())
        .join(" ")
        .trim();
      return labelText;
    }

    // For radio buttons, try to find the fieldset legend
    if (element.type === "radio") {
      const fieldset = element.closest("fieldset");
      const legend = fieldset?.querySelector("legend");
      if (legend) {
        return legend.textContent.trim();
      }
    }

    // Try to get label from aria-label
    if (element.getAttribute("aria-label")) {
      return element.getAttribute("aria-label").trim();
    }

    // Try to get label from placeholder
    if (element.placeholder) {
      return element.placeholder.trim();
    }

    // Try to find a label-like element near the radio button
    if (element.type === "radio") {
      const nearbyText =
        element.nextElementSibling?.textContent?.trim() ||
        element.previousElementSibling?.textContent?.trim();
      if (nearbyText) {
        return nearbyText;
      }
    }

    // If no label found, return the name attribute or empty string
    return element.name || "";
  }

  /**
   * Get options for a form element
   * @param {HTMLElement} element The form element
   * @returns {string[]} Array of options
   */
  getElementOptions(element) {
    switch (element.type) {
      case "select-one":
      case "select-multiple":
        return Array.from(element.options).map((opt) => opt.text.trim());

      case "radio":
        return Array.from(document.getElementsByName(element.name))
          .map((radio) => this.getElementLabel(radio))
          .filter(Boolean);

      case "checkbox":
        return Array.from(document.getElementsByName(element.name))
          .map((checkbox) => this.getElementLabel(checkbox))
          .filter(Boolean);

      default:
        return [];
    }
  }

  /**
   * Get the field type for an element
   * @param {HTMLElement} element - The form element
   * @returns {string} The field type
   */
  getElementFieldType(element) {
    if (element.tagName.toLowerCase() === "textarea") {
      return "textarea";
    }
    if (element.tagName.toLowerCase() === "select") {
      return "select";
    }
    if (element.tagName.toLowerCase() === "input") {
      return element.type || "text";
    }
    return "text";
  }

  /**
   * Get a value for a form field based on label text
   * @param {string} labelText The label text
   * @param {string[]} options Available options
   * @returns {Promise<string>} The value to use
   */
  async getValueForField(labelText, options = [], fieldType = "text") {
    try {
      const normalizedLabel = labelText.toLowerCase().trim();
      console.log("Label Text:", labelText);
      console.log("Normalized Label:", normalizedLabel);
      console.log("Options:", options);
      console.log("Field Type:", fieldType);

      // Check for interview time questions and provide specific context to AI
      if (
        normalizedLabel.includes("interview") &&
        (normalizedLabel.includes("time") ||
          normalizedLabel.includes("date") ||
          normalizedLabel.includes("schedule") ||
          normalizedLabel.includes("availability") ||
          normalizedLabel.includes("when") ||
          normalizedLabel.includes("ranges"))
      ) {
        // Provide specific context for interview time format
        const interviewContext =
          "Interview availability question. IMPORTANT: You must respond with exactly 2-3 time ranges in this format: '- Tuesday, April 8, 2025 – 9:00 AM to 11:00 AM (ET)\\n- Wednesday, April 9, 2025 – 1:00 PM to 3:00 PM (ET)\\n- Thursday, April 10, 2025 – 10:00 AM to 12:00 PM (ET)'. Use realistic future dates and reasonable business hours. Do not add any other text or explanation.";

        return await this.getAIAnswer(
          normalizedLabel,
          options,
          fieldType,
          interviewContext
        );
      }

      // Determine field context
      let fieldContext = "Form field";
      if (options && options.length > 0) {
        fieldContext = `Form field with options: ${options.join(", ")}`;
      }

      // Use AI to determine best value
      const aiAnswer = await this.getAIAnswer(
        normalizedLabel,
        options,
        fieldType,
        fieldContext
      );
      return aiAnswer;
    } catch (error) {
      return "";
    }
  }

  /**
   * Get an appropriate answer from AI for a form field using specialized AI service methods (same as other platforms)
   * @param {string} question - The field label/question
   * @param {Array<string>} options - Available options for select/radio fields
   * @param {string} fieldType - The type of field (text, textarea, select, etc.)
   * @param {string} fieldContext - Additional context about the field
   * @param {number} retryCount - Current retry attempt
   * @returns {Promise<string>} - The AI-generated answer
   */
  async getAIAnswer(
    question,
    options = [],
    fieldType = "text",
    fieldContext = "",
    retryCount = 0
  ) {
    try {
      // Use standardized AI service with specialized routing (same as other platforms)
      const context = {
        platform: this.platform,
        userData: this.userData,
        jobDescription: this.jobDescription,
        fieldType,
        fieldContext,
        required: fieldContext.includes("required"),
        specialInstructions:
          "Keep your answer short, relevant, and direct. Provide a concise response without unnecessary details or explanations. IMPORTANT: Keep response under 1300 characters maximum.",
      };

      let answer;

      // Use specialized AI service methods based on field type and context (same as other platforms)
      if (fieldType === "checkbox-group" && options && options.length > 0) {
        answer = await this.aiService.getMultiSelectAnswer(
          question,
          options,
          context
        );
      } else if (options && options.length > 0) {
        answer = await this.aiService.getOptionAnswer(
          question,
          options,
          context
        );
      } else if (AIResponseUtils.isSalaryField(question)) {
        answer = await this.aiService.getSalaryAnswer(
          question,
          options,
          context
        );
      } else if (
        fieldType === "textarea" ||
        fieldContext.toLowerCase().includes("cover letter") ||
        fieldContext.toLowerCase().includes("describe") ||
        fieldContext.toLowerCase().includes("why") ||
        question.toLowerCase().includes("describe") ||
        question.toLowerCase().includes("why")
      ) {
        answer = await this.aiService.getLongformAnswer(
          question,
          options,
          context
        );
      } else if (this.isDateRelatedQuestion(question, fieldContext)) {
        // For date fields, provide specific instructions to AI
        const dateContext = {
          ...context,
          fieldContext:
            context.fieldContext +
            " IMPORTANT: Always respond with dates in MM/DD/YYYY format (e.g., 03/15/2023). If you need to estimate a date, use a realistic date.",
        };
        answer = await this.aiService.getNormalAnswer(
          question,
          options,
          dateContext
        );
      } else {
        answer = await this.aiService.getNormalAnswer(
          question,
          options,
          context
        );
      }

      if (
        answer === null ||
        answer === undefined ||
        answer === "" ||
        String(answer).trim() === ""
      ) {
        if (retryCount < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 + retryCount * 500)
          );

          const retryContext = {
            ...context,
            fieldContext:
              context.fieldContext +
              ` (This field requires an answer. Please provide a response based on the user profile.)`,
          };

          let retryAnswer;
          if (fieldType === "checkbox-group" && options && options.length > 0) {
            retryAnswer = await this.aiService.getMultiSelectAnswer(
              question,
              options,
              retryContext
            );
          } else if (options && options.length > 0) {
            retryAnswer = await this.aiService.getOptionAnswer(
              question,
              options,
              retryContext
            );
          } else if (AIResponseUtils.isSalaryField(question)) {
            retryAnswer = await this.aiService.getSalaryAnswer(
              question,
              options,
              retryContext
            );
          } else if (
            fieldType === "textarea" ||
            fieldContext.toLowerCase().includes("cover letter") ||
            fieldContext.toLowerCase().includes("describe") ||
            fieldContext.toLowerCase().includes("why") ||
            question.toLowerCase().includes("describe") ||
            question.toLowerCase().includes("why")
          ) {
            retryAnswer = await this.aiService.getLongformAnswer(
              question,
              options,
              retryContext
            );
          } else {
            retryAnswer = await this.aiService.getNormalAnswer(
              question,
              options,
              retryContext
            );
          }

          if (
            (retryAnswer === null ||
              retryAnswer === undefined ||
              retryAnswer === "" ||
              String(retryAnswer).trim() === "") &&
            retryCount < 1
          ) {
            return await this.getAIAnswer(
              question,
              options,
              fieldType,
              fieldContext,
              retryCount + 1
            );
          }

          if (
            retryAnswer !== null &&
            retryAnswer !== undefined &&
            String(retryAnswer).trim() !== ""
          ) {
            return retryAnswer;
          }
        }

        // Fallback to legacy API if specialized methods fail
        try {
          const response = await fetch(
            `${this.host}/api/ai-answer/normal-questions`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                question,
                options,
                userData: this.userData,
                description: this.jobDescription,
              }),
            }
          );

          if (response.ok) {
            const data = await response.json();
            return data.answer || "";
          }
        } catch (fallbackError) {
          // Silent fallback failure
        }

        return "";
      }

      return answer;
    } catch (error) {
      // Retry on error if we haven't exceeded retry limit
      if (retryCount < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 + retryCount * 500)
        );
        return await this.getAIAnswer(
          question,
          options,
          fieldType,
          fieldContext,
          retryCount + 1
        );
      }

      // Fallback to legacy API on persistent errors
      try {
        const response = await fetch(
          `${this.host}/api/ai-answer/longform-questions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question,
              options,
              userData: this.userData,
              description: this.jobDescription,
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          return data.answer || "";
        }
      } catch (fallbackError) {
        // Silent fallback failure
      }

      return "";
    }
  }

  /**
   * Find the submit/continue button on the current form
   * @returns {HTMLElement} The button element
   */
  findActionButton() {
    // Don't find any buttons on post-apply success pages
    if (
      window.location.href.includes("post-apply") ||
      document.querySelector("#returnToSearchButton") ||
      document.querySelector(".ia-PostApply-footer")
    ) {
      return null;
    }

    // Special handling for Indeed review page submit button
    if (
      window.location.href.includes("review") ||
      window.location.href.includes("smartapply.indeed.com")
    ) {
      // Look for the specific submit button pattern from Indeed review page
      const submitButtons = document.querySelectorAll("button");
      for (const button of submitButtons) {
        const buttonText = button.textContent?.trim().toLowerCase();
        if (
          buttonText.includes("submit") &&
          buttonText.includes("application")
        ) {
          if (this.isElementVisible(button)) {
            console.log("🎯 Found Indeed review page submit button:", button);
            return button;
          }
        }
      }
    }

    // Look for buttons with clear action text
    const buttonTexts = ["submit", "continue", "next", "apply", "review"];

    for (const text of buttonTexts) {
      const button = this.findButtonByText(text);
      if (button && this.isElementVisible(button)) {
        return button;
      }
    }

    // Look for buttons with standard selectors
    const actionButton =
      document.querySelector(this.selectors.COMMON.SUBMIT_BUTTON) ||
      document.querySelector(this.selectors.COMMON.CONTINUE_BUTTON) ||
      document.querySelector(this.selectors.COMMON.ACTION_BUTTONS);

    if (
      actionButton &&
      this.isElementVisible(actionButton) &&
      !this.isExcludedButton(actionButton)
    ) {
      return actionButton;
    }

    return null;
  }

  /**
   * Find any visible button as a last resort
   * @returns {HTMLElement} The button element
   */
  findAnyButton() {
    const buttons = Array.from(document.querySelectorAll("button"));
    for (const button of buttons) {
      if (this.isElementVisible(button) && !this.isExcludedButton(button)) {
        return button;
      }
    }
    return null;
  }

  /**
   * Check if a button should be excluded from action button selection
   * @param {HTMLElement} button - The button to check
   * @returns {boolean} True if the button should be excluded
   */
  isExcludedButton(button) {
    if (!button) return true;

    const buttonText = (button.textContent || "").trim().toLowerCase();
    const testId = button.getAttribute("data-testid") || "";

    // Excluded data-testid patterns - MUST check these first
    const excludedTestIds = [
      "ExitLinkWithModalComponent-exitButton",
      "exit-button",
      "cancel-button",
      "close-button",
      "dismiss-button",
    ];

    if (excludedTestIds.some((id) => testId.includes(id) || testId === id)) {
      return true;
    }

    // Excluded text patterns - buttons that close/cancel the form
    const excludedTextPatterns = [
      "exit",
      "cancel",
      "close",
      "dismiss",
      "go back",
      "return to",
    ];

    for (const pattern of excludedTextPatterns) {
      if (buttonText === pattern || buttonText.includes(pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find a button by its text content
   * @param {string} text The text to search for
   * @returns {HTMLElement} The button element
   */
  findButtonByText(text) {
    // Buttons that should NEVER be clicked as action buttons (they close/cancel the form)
    const excludedButtonPatterns = [
      "exit",
      "cancel",
      "close",
      "dismiss",
      "skip",
      "back",
      "return",
      "go back",
    ];

    // Excluded data-testid patterns
    const excludedTestIds = [
      "ExitLinkWithModalComponent-exitButton",
      "exit-button",
      "cancel-button",
      "close-button",
    ];

    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.find((button) => {
      if (!button.textContent || !this.isElementVisible(button)) {
        return false;
      }

      const buttonText = button.textContent.trim().toLowerCase();
      const testId = button.getAttribute("data-testid") || "";

      // Check if this is an excluded button
      if (excludedTestIds.includes(testId)) {
        return false;
      }

      // Check if button text matches excluded patterns
      for (const pattern of excludedButtonPatterns) {
        if (
          buttonText === pattern ||
          (buttonText.includes(pattern) && !buttonText.includes("continue"))
        ) {
          return false;
        }
      }

      // Check if button matches the search text
      return buttonText.includes(text.toLowerCase());
    });
  }

  /**
   * Find a link by its text content
   * @param {string} text The text to search for
   * @returns {HTMLElement} The link element
   */
  findLinkByText(text) {
    const links = Array.from(document.querySelectorAll("a"));
    return links.find(
      (link) =>
        link.textContent &&
        link.textContent.trim().toLowerCase().includes(text.toLowerCase()) &&
        this.isElementVisible(link)
    );
  }

  /**
   * Check if an element is visible
   * @param {HTMLElement} element The element to check
   * @returns {boolean} True if visible
   */
  isElementVisible(element) {
    if (!element) return false;

    try {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();

      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        rect.height > 0 &&
        rect.width > 0
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if we're on the success page
   * @returns {boolean} True if success page
   */
  isSuccessPage() {
    // Check for post-apply page first
    if (
      window.location.href.includes("post-apply") ||
      window.location.href.includes(
        "ng.smartapply.indeed.com/beta/indeedapply/form/post-apply"
      )
    ) {
      return true;
    }

    // Check for success indicators
    const successIndicators = [
      ".ia-ApplicationMessage-successMessage",
      ".ia-JobActionConfirmation-container",
      ".ia-SuccessPage",
      ".ia-JobApplySuccess",
      ".submitted-container",
      ".success-container",
      ".ia-PostApply-footer", // Post-apply page footer
      ".mosaic-provider-module-post-apply-u74ql7", // Post-apply page class
    ];

    for (const selector of successIndicators) {
      const element = document.querySelector(selector);
      if (element && this.isElementVisible(element)) {
        return true;
      }
    }

    // Check for success text
    const pageText = document.body.innerText.toLowerCase();
    return (
      pageText.includes("application submitted") ||
      pageText.includes("successfully applied") ||
      pageText.includes("thank you for applying") ||
      pageText.includes("successfully submitted") ||
      pageText.includes("application complete")
    );
  }

  /**
   * Sleep for a specified time
   * @param {number} ms Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Wait for user action in co-pilot mode
   * @returns {Promise<string>} The action taken by the user (SUBMIT, NEXT, SKIP)
   */
  waitForUserAction() {
    return new Promise((resolve) => {
      this.userActionResolver = resolve;
      this.userHasControl = true;
      console.log("🔒 Co-Pilot: Waiting for user action...");
    });
  }

  /**
   * Resolve user action (called when user clicks SUBMIT, NEXT, or SKIP)
   * @param {string} action The action taken (SUBMIT, NEXT, SKIP)
   */
  resolveUserAction(action) {
    if (this.userActionResolver) {
      console.log(`✅ Co-Pilot: User action resolved: ${action}`);
      this.userHasControl = false;
      this.userActionResolver(action);
      this.userActionResolver = null;
    }
  }

  /**
   * Apply value to form element
   * @param {HTMLElement} element Form element
   * @param {string} value The value to apply
   * @param {string} labelText The label text
   * @returns {Promise<void>}
   */
  async applyValueToElement(element, value, labelText) {
    if (!element || !value) return;

    const strValue = String(value).trim();
    if (!strValue) return;

    try {
      switch (element.tagName.toLowerCase()) {
        case "input":
          switch (element.type) {
            case "text":
            case "email":
            case "tel":
              // Check if this is a phone field first
              if (this.isPhoneField(element, labelText)) {
                await this.handlePhoneInput(element, strValue);
              }
              // Check if this is a date field
              else if (this.isDateField(element)) {
                await this.handleDateInput(element, strValue);
              } else {
                await this.simulateHumanInput(element, strValue);
              }
              break;

            case "number":
              // Extract only numeric portion
              const numValue = strValue.replace(/[^\d.-]/g, "");
              if (numValue) {
                await this.simulateHumanInput(element, numValue);
              }
              break;

            case "checkbox":
              await this.handleCheckboxInput(element, strValue, labelText);
              break;
          }
          break;

        case "textarea":
          await this.simulateHumanInput(element, strValue);
          break;

        case "select":
          await this.handleSelect(element, strValue, labelText);
          break;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle select element
   * @param {HTMLElement} element The select element
   * @param {string} value The value to apply
   * @param {string} labelText The label text
   * @returns {Promise<void>}
   */
  async handleSelect(element, value, labelText) {
    if (!element.options || element.options.length === 0) return;

    const normalizedValue = value.toLowerCase().trim();
    let selectedOption = null;

    // Skip placeholder options
    const startIndex = element.options[0].value ? 0 : 1;

    // Try exact match first
    for (let i = startIndex; i < element.options.length; i++) {
      const option = element.options[i];
      if (
        option.text.toLowerCase().trim() === normalizedValue ||
        option.value.toLowerCase() === normalizedValue
      ) {
        selectedOption = option;
        break;
      }
    }

    // If no exact match, try partial match
    if (!selectedOption) {
      for (let i = startIndex; i < element.options.length; i++) {
        const option = element.options[i];
        if (
          option.text.toLowerCase().includes(normalizedValue) ||
          normalizedValue.includes(option.text.toLowerCase())
        ) {
          selectedOption = option;
          break;
        }
      }
    }

    // Apply selection if found
    if (selectedOption) {
      element.value = selectedOption.value;
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      // If no match found and this is not the first option (placeholder),
      // select the first valid option as fallback
      if (startIndex < element.options.length) {
        element.value = element.options[startIndex].value;
        element.dispatchEvent(new Event("change", { bubbles: true }));
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  }

  /**
   * Simulate human input with proper event sequence
   * @param {HTMLElement} element Input element
   * @param {string} value Value to input
   * @returns {Promise<void>}
   */
  async simulateHumanInput(element, value) {
    try {
      const isTextarea = element.tagName.toLowerCase() === "textarea";
      const cleanedText = String(value).trim();

      // Check if field already has the correct content
      if (element.value && element.value.trim() === cleanedText) {
        console.log("⏭️ Field already contains the correct text, skipping");
        return true;
      }

      // Mark this element as being processed to prevent conflicts
      if (element.dataset.processing === "true") {
        console.log("⚠️ Element already being processed, skipping");
        return false;
      }
      element.dataset.processing = "true";

      try {
        // Scroll to and focus the element
        this.scrollToElement(element);
        element.focus();
        await this.sleep(200 + Math.random() * 200);

        // Use native property setter to bypass React's synthetic events
        const nativeValueSetter = Object.getOwnPropertyDescriptor(
          isTextarea
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype,
          "value"
        )?.set;

        // Only clear if there's existing content and it's different
        const currentValue = element.value.trim();
        if (currentValue && currentValue !== cleanedText) {
          console.log("🗑️ Clearing existing content to replace with new text");
          element.select();
          await this.sleep(100 + Math.random() * 100);

          // Clear the field
          if (nativeValueSetter) {
            nativeValueSetter.call(element, "");
          } else {
            element.value = "";
          }
          element.dispatchEvent(new Event("input", { bubbles: true }));
          await this.sleep(50);
        } else if (!currentValue) {
          // Field is empty, just clear to be safe
          if (nativeValueSetter) {
            nativeValueSetter.call(element, "");
          } else {
            element.value = "";
          }
          element.dispatchEvent(new Event("input", { bubbles: true }));
          await this.sleep(50);
        }

        // For textareas with long text, use paste simulation (more realistic)
        if (isTextarea && cleanedText.length > 50) {
          await this.humanPasteSimulation(
            element,
            cleanedText,
            nativeValueSetter
          );
        } else {
          // For shorter text or input fields, use human-like typing
          await this.humanTypeSimulation(
            element,
            cleanedText,
            nativeValueSetter
          );
        }

        // Final events
        element.dispatchEvent(new Event("change", { bubbles: true }));
        element.dispatchEvent(new Event("blur", { bubbles: true }));

        return true;
      } finally {
        // Always clear the processing flag to prevent elements being permanently locked
        element.dataset.processing = "false";
      }
    } catch (error) {
      console.error("❌ Error in simulateHumanInput:", error);
      // Ensure processing flag is cleared on error too
      if (element && element.dataset) {
        element.dataset.processing = "false";
      }
      return false;
    }
  }

  /**
   * Simulate human typing character by character
   * @param {HTMLElement} element - The input element
   * @param {string} text - The text to type
   * @param {Function} nativeValueSetter - Native value setter function
   * @returns {Promise<void>}
   */
  async humanTypeSimulation(element, text, nativeValueSetter) {
    let currentValue = "";

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      currentValue += char;

      // Set the value using native setter or fallback
      if (nativeValueSetter) {
        nativeValueSetter.call(element, currentValue);
      } else {
        element.value = currentValue;
      }
      element.dispatchEvent(new Event("input", { bubbles: true }));

      // Human-like typing speed with variance
      const baseDelay = 120;
      const variance = 100;
      const delay = baseDelay + Math.random() * variance;

      // Occasionally add longer pauses (simulating thinking/hesitation)
      const shouldPause = Math.random() < 0.15; // 15% chance of pause
      const pauseDelay = shouldPause ? 400 + Math.random() * 600 : 0;

      await this.sleep(delay + pauseDelay);
    }
  }

  /**
   * Simulate human paste for long text
   * @param {HTMLElement} element - The input element
   * @param {string} text - The text to paste
   * @param {Function} nativeValueSetter - Native value setter function
   * @returns {Promise<void>}
   */
  async humanPasteSimulation(element, text, nativeValueSetter) {
    // Focus element first
    element.focus();
    await this.sleep(100 + Math.random() * 100);

    // Set the value all at once (like paste)
    if (nativeValueSetter) {
      nativeValueSetter.call(element, text);
    } else {
      element.value = text;
    }

    // Dispatch paste-related events
    element.dispatchEvent(new Event("input", { bubbles: true }));
    await this.sleep(50 + Math.random() * 50);

    // Simulate the brief delay after pasting
    await this.sleep(200 + Math.random() * 200);
  }

  /**
   * Scroll element into view
   * @param {HTMLElement} element - The element to scroll to
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
        // Silent fail
      }
    }
  }

  /**
   * Generate a unique identifier for a file input element
   * @param {HTMLElement} fileInput - The file input element
   * @returns {string} Unique identifier for the input
   */
  getFileInputId(fileInput) {
    if (!fileInput) return null;

    // Try to use existing ID
    if (fileInput.id) return `id:${fileInput.id}`;

    // Use name attribute if available
    if (fileInput.name) return `name:${fileInput.name}`;

    // Use data-testid if available
    const testId = fileInput.getAttribute("data-testid");
    if (testId) return `testid:${testId}`;

    // Generate XPath-based identifier as fallback
    const getXPath = (element) => {
      if (element.id) return `id("${element.id}")`;
      if (element === document.body) return "/html/body";

      let ix = 0;
      const siblings = element.parentNode?.childNodes || [];
      for (let i = 0; i < siblings.length; i++) {
        const sibling = siblings[i];
        if (sibling === element) {
          return `${getXPath(
            element.parentNode
          )}/${element.tagName.toLowerCase()}[${ix + 1}]`;
        }
        if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
          ix++;
        }
      }
    };

    return `xpath:${getXPath(fileInput)}`;
  }

  async handleResumeStep() {
    try {
      console.log("📄 Handling SmartApply resume step...");

      const isTailoring = this.fileHandler?.preferences?.useCustomResume === true;

      // Notify status overlay that we're on resume step
      if (isTailoring) {
        notifyStatus({ type: "TAILORING_RESUME" });
      } else {
        notifyStatus({ type: "UPLOADING_FILES" });
      }

      // Wait a moment for React/SmartApply to fully render
      await this.sleep(1000);

      if (!this.fileHandler) {
        console.error("❌ File handler not initialized.");
        return false;
      }

      // Step 1: Check if a resume is already showing on the page
      const existingResumeCard = document.querySelector(
        '[data-testid="resume-selection-file-resume-radio-card"], [data-testid="FileResumeCard"]'
      );
      const hasExistingResume = existingResumeCard && this.isElementVisible(existingResumeCard);

      if (hasExistingResume) {
        console.log("📋 Existing resume detected on form - will replace it");

        // Try the ResumeOptionsMenu flow to enter "replace" mode
        // Actual data-testid is "ResumeOptionsMenu" (not "ResumeOptionsMenu-btn")
        const optionsBtn = document.querySelector(this.selectors.COMMON.RESUME_OPTIONS);
        if (optionsBtn && this.isElementVisible(optionsBtn)) {
          console.log("🔘 Clicking resume options menu...");
          await this.clickButton(optionsBtn);
          await this.sleep(800);

          // Click "Upload a different file" option in the menu
          const uploadOption = document.querySelector(this.selectors.COMMON.RESUME_UPLOAD_BUTTON);
          if (uploadOption && this.isElementVisible(uploadOption)) {
            console.log("🔘 Clicking 'Upload a different file' option...");
            await this.clickButton(uploadOption);
            await this.sleep(1000);
          }
        } else {
          // No options menu visible - try clicking "Select file" button directly
          const selectFileBtn = document.querySelector(
            this.selectors.COMMON.SELECT_FILE_BUTTON
          );
          if (selectFileBtn && this.isElementVisible(selectFileBtn)) {
            console.log("🔘 Clicking 'Select file' button to replace resume...");
            await this.clickButton(selectFileBtn);
            await this.sleep(1000);
          }
        }
      }

      // Step 2: Find the file input for resume upload
      let fileInput = this.findResumeFileInput();

      if (!fileInput) {
        console.error("❌ No file input found for resume upload.");
        return await this.selectExistingResumeAsFallback();
      }

      // Check if file input is usable (not disabled)
      if (fileInput.disabled) {
        console.warn("⚠️ File input is disabled, waiting...");
        await this.sleep(1500);
        // Re-find in case React replaced the element
        fileInput = this.findResumeFileInput();
        if (!fileInput || fileInput.disabled) {
          console.warn("⚠️ File input still disabled, trying fallback");
          return await this.selectExistingResumeAsFallback();
        }
      }

      console.log("📤 Uploading fresh resume for this job application...");

      // Step 3: Get resume URLs from user data
      const fileUrls = this.fileHandler.getFileUrls(this.userData, "resume");
      if (!fileUrls || fileUrls.length === 0) {
        console.error("❌ No resume URLs found in user data.");
        return await this.selectExistingResumeAsFallback();
      }

      console.log(`📁 Found ${fileUrls.length} resume(s) available for upload`);

      // Step 4: Upload the resume using the file handler
      const uploadSuccess = await this.fileHandler.handleResumeUploadToInput(
        fileInput,
        this.userData,
        this.jobDescription,
        fileUrls,
        this.jobId,
        this.currentJobTitle || ""
      );

      if (uploadSuccess) {
        console.log("✅ Resume uploaded successfully");
        await this.sleep(1000);

        // After upload, ensure the new file resume radio card is selected
        await this.ensureNewResumeSelected();
        return true;
      }

      // Step 5: Programmatic upload failed - try clicking upload button for native file picker
      console.log(
        "⚠️ Programmatic upload failed - trying fallback approaches..."
      );

      const selectFileButton = document.querySelector(
        this.selectors.COMMON.SELECT_FILE_BUTTON
      );
      if (selectFileButton && this.isElementVisible(selectFileButton)) {
        console.log("🔘 Clicking 'Select file' button for native file picker...");
        await this.clickButton(selectFileButton);
        await this.sleep(2000);

        // Check if upload succeeded after user interaction
        const resumeAppeared = document.querySelector(
          '[data-testid="resume-selection-file-resume-radio-card"]'
        );
        if (resumeAppeared) {
          await this.ensureNewResumeSelected();
          console.log("✅ Resume appeared after button click");
          return true;
        }
      }

      // Final fallback: select existing resume
      return await this.selectExistingResumeAsFallback();
    } catch (error) {
      console.error("Error in handleResumeStep:", error);
      return false;
    }
  }

  /**
   * Find the resume file input using multiple selector strategies
   * @returns {HTMLElement|null}
   */
  findResumeFileInput() {
    const selectors = [
      // Actual SmartApply file input (hidden, style="display: none")
      '[data-testid="resume-selection-file-resume-radio-card-file-input"]',
      '[data-testid="FileResumeCard-file-input"]',
      'input[type="file"][accept*="pdf"]',
      'input[type="file"][accept*=".doc"]',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }

    // Try within the resume selection form
    const form = document.querySelector('[data-testid="resume-selection-form"]');
    if (form) {
      const el = form.querySelector('input[type="file"]');
      if (el) return el;
    }

    // Last resort
    return document.querySelector('input[type="file"]');
  }

  /**
   * Ensure the newly uploaded resume radio card is selected (not the old one)
   */
  async ensureNewResumeSelected() {
    const radioCard = document.querySelector(
      '[data-testid="resume-selection-file-resume-radio-card-input"]'
    );
    if (radioCard) {
      if (!radioCard.checked) {
        console.log("📌 Selecting the newly uploaded resume radio...");
        const label = document.querySelector(
          '[data-testid="resume-selection-file-resume-radio-card-label"]'
        );
        if (label && this.isElementVisible(label)) {
          await this.clickButton(label);
          await this.sleep(500);
        } else {
          radioCard.click();
          await this.sleep(300);
        }
      } else {
        // Radio is already checked but may still be pointing at old resume.
        // Force a deselect/reselect cycle to ensure React state picks up the new file.
        console.log("📌 Re-clicking resume radio to ensure new file is bound...");
        const label = document.querySelector(
          '[data-testid="resume-selection-file-resume-radio-card-label"]'
        );
        if (label && this.isElementVisible(label)) {
          // Switch to Indeed Resume (value="structured") then back to file resume
          const indeedResumeRadio = document.querySelector(
            this.selectors.COMMON.RESUME_RADIO_INDEED
          );
          if (indeedResumeRadio) {
            indeedResumeRadio.click();
            await this.sleep(400);
          }
          await this.clickButton(label);
          await this.sleep(500);
        }
      }
    }
  }

  /**
   * Helper method to select an existing resume as fallback
   */
  async selectExistingResumeAsFallback() {
    // Try file resume radio first
    const existingResumeRadio = document.querySelector(
      '[data-testid="resume-selection-file-resume-radio-card-input"]'
    );
    if (existingResumeRadio) {
      console.log("⚠️ Selecting existing file resume as fallback");
      const label = document.querySelector(
        '[data-testid="resume-selection-file-resume-radio-card-label"]'
      );
      if (label && this.isElementVisible(label)) {
        await this.clickButton(label);
      } else {
        existingResumeRadio.click();
      }
      await this.sleep(500);
      return true;
    }

    // Try Indeed/structured resume radio
    const indeedResumeRadio = document.querySelector(
      '[data-testid="resume-selection-structured-resume-radio-card-input"]'
    );
    if (indeedResumeRadio) {
      console.log("⚠️ Selecting Indeed structured resume as fallback");
      const label = document.querySelector(
        '[data-testid="resume-selection-structured-resume-radio-card-label"]'
      );
      if (label && this.isElementVisible(label)) {
        await this.clickButton(label);
      } else {
        indeedResumeRadio.click();
      }
      await this.sleep(500);
      return true;
    }

    console.error("❌ Could not handle resume step - no resume available");
    return false;
  }

  /**
   * Check if we're on the resume upload/selection step
   * @returns {boolean} True if on resume step
   */
  isResumeStep() {
    // FIRST: Check for actual resume-specific form elements (most reliable)
    const hasResumeElements =
      document.querySelector(this.selectors.COMMON.RESUME_PREVIEW) ||
      document.querySelector(this.selectors.COMMON.RESUME_OPTIONS) ||
      document.querySelector(this.selectors.COMMON.RESUME_RADIO_INDEED) ||
      document.querySelector(this.selectors.COMMON.RESUME_RADIO_FILE) ||
      document.querySelector(this.selectors.COMMON.FILE_RESUME_CARD) ||
      document.querySelector(this.selectors.COMMON.FILE_RESUME_CARD_INPUT) ||
      document.querySelector('[data-testid="ResumeErrorsAlert"]') ||
      document.querySelector('[data-testid="FileResumeCard-label"]') ||
      document.querySelector(this.selectors.INDEED.INDEED_RESUME_SECTION) ||
      document.querySelector('input[type="file"][accept*=".pdf"]') ||
      document.querySelector('input[type="file"][accept*=".doc"]');

    if (hasResumeElements) {
      return true;
    }

    // Platform-specific checks
    if (this.platform === "glassdoor") {
      // Glassdoor-specific resume step detection
      const gdResumeContainer = document.querySelector(
        this.selectors.GLASSDOOR.GD_RESUME_CONTAINER
      );
      const gdUploadButton = document.querySelector(
        this.selectors.GLASSDOOR.GD_RESUME_UPLOAD
      );

      if (gdResumeContainer || gdUploadButton) {
        return true;
      }
    }

    // ONLY check heading texts if we haven't found regular form fields
    const hasRegularFormFields =
      document.querySelector('input[type="text"]') ||
      document.querySelector('input[type="email"]') ||
      document.querySelector("textarea") ||
      document.querySelector("select") ||
      document.querySelector('input[type="tel"]');

    // If we have regular form fields, this is likely NOT a resume step
    if (hasRegularFormFields) {
      return false;
    }

    // Only check text content as a last resort and be more specific
    const resumeHeadings = Array.from(
      document.querySelectorAll("h1, h2, h3")
    ).filter(
      (h) =>
        h.textContent &&
        (h.textContent.toLowerCase().includes("add your resume") ||
          h.textContent.toLowerCase().includes("upload your resume") ||
          h.textContent.toLowerCase().includes("upload resume") ||
          h.textContent.toLowerCase().includes("choose a resume") ||
          h.textContent.toLowerCase().includes("select your resume"))
    );

    return resumeHeadings.length > 0;
  }

  /**
   * Wait for file upload to complete
   * @param {HTMLElement} fileInput The file input element
   * @returns {Promise<boolean>} Success or failure
   */
  async waitForUploadComplete(fileInput) {
    const startTime = Date.now();
    let logCounter = 0;

    while (Date.now() - startTime < this.timeouts.UPLOAD) {
      logCounter++;

      // Check if file input has a file
      if (fileInput.files.length > 0) {
        // Platform-specific success indicators
        if (this.platform === "glassdoor") {
          const successIndicators = [
            document.querySelector(".resumeUploadSuccess"),
            document.querySelector("[data-test='resume-upload-success']"),
            document.querySelector(".resumePreview"),
            document.querySelector(".uploadSuccess"),
          ];

          if (successIndicators.some((el) => el && this.isElementVisible(el))) {
            return true;
          }
        } else {
          // Indeed success indicators
          const successIndicator =
            document.querySelector(".upload-success") ||
            document.querySelector('[data-testid="resume-upload-success"]') ||
            document.querySelector("[data-testid='ResumeThumbnail']");

          if (successIndicator) {
            return true;
          }
        }

        // Check for generic success indicators
        const previewElements = document.querySelectorAll(
          "[aria-roledescription='document'], .resume-preview"
        );
        if (previewElements.length > 0) {
          return true;
        }
      }

      await this.sleep(300);
    }

    // For Glassdoor, check one more time for anything that might indicate success
    if (this.platform === "glassdoor") {
      const anyPreview =
        document.querySelector(".resumePreview") ||
        document.querySelector("[data-test='resume-preview']") ||
        document.querySelector(".uploadedResume");

      if (anyPreview) {
        return true;
      }
    }

    // Return file presence as fallback success indicator
    return fileInput.files.length > 0;
  }

  /**
   * Fill all form elements in the current step - FIXED for duplicates
   * @param {HTMLElement} container The form container
   * @returns {Promise<boolean>} Success or failure
   */
  async fillFormStep(container) {
    try {
      // Update status to show form filling is in progress
      if (true) {
        // Global overlay
        notifyStatus({ type: "FILLING_FORM" });
      }

      let hasVisibleFields = false;

      // FIRST PASS: Process all fieldsets (radio groups) as a single unit
      const fieldsets = Array.from(
        container.querySelectorAll('fieldset[role="radiogroup"]')
      );

      // If no fieldsets found with role="radiogroup", try enhanced fieldset selectors
      if (fieldsets.length === 0) {
        const altFieldsets = Array.from(
          container.querySelectorAll(
            'fieldset, .css-1ciavar, [data-testid^="input-q_"], [class*="ia-Questions-item"], [class*="css-1iqcevu"]'
          )
        );
        fieldsets.push(...altFieldsets);
      }

      // Additional pass for potential fieldset-like containers that contain radio groups
      const radioContainers = Array.from(
        container.querySelectorAll(
          '[class*="mosaic-provider-module"] fieldset, div[class*="css-u74ql7"]:has(input[type="radio"])'
        )
      );

      for (const radioContainer of radioContainers) {
        if (!fieldsets.includes(radioContainer)) {
          const radioInputs = radioContainer.querySelectorAll(
            'input[type="radio"]'
          );
          if (radioInputs.length > 1) {
            fieldsets.push(radioContainer);
          }
        }
      }

      for (const fieldset of fieldsets) {
        if (!this.isElementVisible(fieldset)) {
          continue;
        }

        hasVisibleFields = true;

        let questionText = "";
        const legend = fieldset.querySelector(
          "legend, .css-ae8cki, .css-sskwr5"
        );

        if (legend) {
          // Try enhanced extraction using the improved extractLabelText method
          questionText = this.extractLabelText(legend);

          // If no text found, try additional selectors for the provided HTML structure
          if (!questionText) {
            const questionSpans = legend.querySelectorAll(
              ".css-gtr6b9, .css-bev4h3, .css-ft2u8r, .css-u6bdhh, .css-18uxmuq"
            );

            if (questionSpans.length > 0) {
              // Use the first span that contains text
              for (const span of questionSpans) {
                const text = span.textContent.trim();
                if (text && !text.toLowerCase().includes("optional")) {
                  questionText = text;
                  break;
                }
              }
            } else {
              // Fallback to legend text with cleanup
              questionText = legend.textContent.trim();

              // Clean up the question text by removing unwanted child elements text
              const removeElements = legend.querySelectorAll(
                "button, .css-1afmp4o, .css-10hqj6y"
              );
              for (const el of removeElements) {
                questionText = questionText
                  .replace(el.textContent.trim(), "")
                  .trim();
              }
            }
          }

          // Final cleanup - remove "(optional)" and normalize whitespace
          questionText = questionText
            .replace(/\s*\(optional\)\s*$/i, "")
            .replace(/\s+/g, " ")
            .trim();
        } else {
          // Try to find other question indicators including new CSS classes
          const questionEl = fieldset.querySelector(
            '[class*="question"], [class*="Question"], [class*="label"], [class*="Label"], .css-6sl9s3, [data-testid*="label"]'
          );
          if (questionEl) {
            questionText =
              this.extractLabelText(questionEl) ||
              questionEl.textContent.trim();
            questionText = questionText
              .replace(/\s*\(optional\)\s*$/i, "")
              .replace(/\s+/g, " ")
              .trim();
          }
        }

        if (!questionText) {
          continue;
        }
        // Get all available options from the radio buttons
        const optionLabels = [];
        const radioInputs = Array.from(
          fieldset.querySelectorAll('input[type="radio"]')
        );

        // Store a map from option text to radio input for later selection
        const optionMap = new Map();

        // Enhanced option text extraction for radio buttons
        for (const radio of radioInputs) {
          const label = radio.closest("label");
          if (!label) continue;

          // Try different selectors for option text based on the provided HTML structure
          let optionText = "";

          // First try the specific CSS classes from the provided HTML
          const optionSpan = label.querySelector(
            ".css-l5h8kx, .css-u74ql7, .e37uo190"
          );

          if (optionSpan) {
            optionText = optionSpan.textContent.trim();
          } else {
            // Try to get the label text but exclude the radio input's own text
            const labelClone = label.cloneNode(true);
            const radioInputInLabel = labelClone.querySelector(
              'input[type="radio"]'
            );
            if (radioInputInLabel) {
              radioInputInLabel.remove();
            }
            optionText = labelClone.textContent.trim();
          }

          // Additional cleanup to remove any unwanted characters or formatting
          if (optionText) {
            optionText = optionText.replace(/^\s*[\u2022\u25CF\u25CB]\s*/, ""); // Remove bullet points
            optionText = optionText.replace(/\s+/g, " ").trim(); // Normalize whitespace

            if (optionText.length > 0) {
              optionLabels.push(optionText);
              optionMap.set(optionText, radio);
            }
          }
        }

        if (optionLabels.length === 0) {
          continue;
        }

        // Make a SINGLE API call with the proper question and all options
        const answer = await this.getValueForField(
          questionText,
          optionLabels,
          "radio"
        );

        if (!answer) {
          // If no answer received and this is a required field, select the first option
          if (
            fieldset.getAttribute("aria-required") === "true" ||
            fieldset.classList.contains("required")
          ) {
            if (radioInputs.length > 0) {
              radioInputs[0].click();
            }
          }
          continue;
        }

        // Now find the matching radio button and select it
        let foundMatch = false;
        const normalizedAnswer = answer.toLowerCase().trim();

        // First try exact match
        if (optionMap.has(answer)) {
          optionMap.get(answer).click();
          foundMatch = true;
        } else {
          // Try case-insensitive match
          for (const [optionText, radio] of optionMap.entries()) {
            if (optionText.toLowerCase() === normalizedAnswer) {
              radio.click();
              foundMatch = true;
              break;
            }
          }

          // If still no match, try partial match
          if (!foundMatch) {
            for (const [optionText, radio] of optionMap.entries()) {
              if (
                optionText.toLowerCase().includes(normalizedAnswer) ||
                normalizedAnswer.includes(optionText.toLowerCase())
              ) {
                radio.click();
                foundMatch = true;
                break;
              }
            }

            // Last resort - try select an option if it contains key words from the answer
            if (!foundMatch) {
              const answerWords = normalizedAnswer.split(/\s+/);
              for (const [optionText, radio] of optionMap.entries()) {
                const optionLower = optionText.toLowerCase();
                for (const word of answerWords) {
                  if (word.length > 3 && optionLower.includes(word)) {
                    radio.click();
                    foundMatch = true;
                    break;
                  }
                }
                if (foundMatch) break;
              }
            }
          }
        }

        if (!foundMatch) {
          // Select first option as fallback
          if (radioInputs.length > 0) {
            radioInputs[0].click();
          }
        }

        // Mark fieldset as processed
        fieldset.dataset.processed = "true";
      }

      const allElementsToProcess = new Map();

      const elementTypes = [
        { selector: "textarea", type: "textarea" },
        { selector: "select", type: "select" },
        // Location-specific inputs (highest priority)
        { selector: 'input[autocomplete="postal-code"]', type: "text" },
        { selector: 'input[name="location-postal-code"]', type: "text" },
        {
          selector: 'input[data-testid="location-fields-postal-code-input"]',
          type: "text",
        },
        { selector: 'input[autocomplete="address-level2"]', type: "text" },
        { selector: 'input[name="location-locality"]', type: "text" },
        {
          selector: 'input[data-testid="location-fields-locality-input"]',
          type: "text",
        },
        { selector: 'input[autocomplete="address"]', type: "text" },
        { selector: 'input[autocomplete="street-address"]', type: "text" },
        { selector: 'input[name="location-address"]', type: "text" },
        {
          selector: 'input[data-testid="location-fields-address-input"]',
          type: "text",
        },
        { selector: 'input[id="location-fields-address-input"]', type: "text" },
        { selector: 'input[name*="location"]', type: "text" },
        { selector: 'input[data-testid*="location-fields"]', type: "text" },
        // Standard input types
        {
          selector: 'input:not([type]), input[type=""], input[type="text"]',
          type: "text",
        },
        { selector: 'input[type="email"]', type: "email" },
        { selector: 'input[type="tel"]', type: "tel" },
        { selector: 'input[type="number"]', type: "number" },
        { selector: 'input[type="checkbox"]', type: "checkbox" },
        { selector: 'input[type="date"]', type: "date" },
        { selector: 'input[placeholder*="MM/DD/YYYY"]', type: "date" },
        { selector: 'input[placeholder*="mm/dd/yyyy"]', type: "date" },
        // Phone inputs
        {
          selector: 'input[name="phone"], input[name*="phone" i]',
          type: "phone",
        },
        { selector: 'input[placeholder*="phone" i]', type: "phone" },
        { selector: 'input[aria-label*="phone" i]', type: "phone" },
      ];

      // Collect all elements, prioritizing phone type for phone inputs
      for (const { selector, type } of elementTypes) {
        const elements = container.querySelectorAll(selector);

        for (const element of elements) {
          if (!allElementsToProcess.has(element)) {
            // Determine if this is a phone field
            const isPhoneField = this.isPhoneField(element, "");
            const actualType = isPhoneField ? "phone" : type;

            allElementsToProcess.set(element, actualType);
          } else if (type === "phone" || this.isPhoneField(element, "")) {
            // If we already have this element but now we know it's a phone field, update the type
            allElementsToProcess.set(element, "phone");
          }
        }
      }

      // Process each unique element only once
      for (const [element, type] of allElementsToProcess) {
        // Skip if element is not visible or is in a processed fieldset
        if (
          !this.isElementVisible(element) ||
          element.closest('fieldset[data-processed="true"]')
        ) {
          continue;
        }

        hasVisibleFields = true;

        // Get proper label text
        const label = this.findLabelForElement(element);
        let labelText = "";

        if (label) {
          labelText = this.extractLabelText(label);
        }

        // For phone inputs, provide default label if none found
        if (type === "phone" && !labelText) {
          labelText = "Phone Number";
        }

        if (!labelText) continue;
        // Enhanced options extraction for selects
        let options = [];
        if (type === "select") {
          options = Array.from(element.options)
            .filter(
              (opt) =>
                opt.value &&
                opt.value !== "" &&
                opt.text.trim() !== "Select an option"
            )
            .map((opt) => {
              let text = opt.text.trim();
              text = text.replace(/\s+/g, " ");
              return text;
            })
            .filter((text) => text.length > 0);
        }

        if (type === "phone") {
          await this.handlePhoneInput(element, null);
        } else {
          const value = await this.getValueForField(labelText, options, type);
          if (!value) continue;

          if (type === "date" || this.isDateField(element)) {
            await this.handleDateInput(element, value);
          } else {
            await this.applyValueToElement(element, value, labelText);
          }
        }

        // Human-like delay between fields (1-3 seconds with randomness)
        const fieldDelay = 1000 + Math.random() * 2000; // 1-3 seconds
        console.log(`⏱️ Waiting ${Math.round(fieldDelay)}ms before next field`);
        await this.sleep(fieldDelay);
      }

      return hasVisibleFields;
    } catch (error) {
      return false;
    }
  }

  /**
   * Enhanced findLabelForElement with Glassdoor-specific handling
   * @param {HTMLElement} element Form element
   * @returns {HTMLElement|null} Label element
   */
  findLabelForElement(element) {
    // Check for aria-labelledby attribute first
    if (element.hasAttribute("aria-labelledby")) {
      const labelId = element.getAttribute("aria-labelledby");
      const label = document.getElementById(labelId);
      if (label) return label;
    }

    // If element has id, try to find label with for attribute
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) return label;
    }

    // If element is inside a label, return the label
    const parentLabel = element.closest("label");
    if (parentLabel) return parentLabel;

    // Enhanced location field handling - look for location-specific containers
    const locationContainer = element.closest(
      '[class*="mosaic-provider-module-apply-contact-info"]'
    );
    if (locationContainer) {
      // For inputs wrapped in spans, look for sibling labels first
      const inputWrapper = element.closest("span");
      if (inputWrapper) {
        const siblingLabel = inputWrapper.previousElementSibling;
        if (siblingLabel && siblingLabel.tagName === "LABEL") {
          return siblingLabel;
        }
      }

      // Look for data-testid label elements (most reliable)
      const testidLabel = locationContainer.querySelector(
        '[data-testid*="-label"]'
      );
      if (testidLabel) {
        return testidLabel;
      }

      // Look for id-based labels that match the input id pattern
      if (element.id) {
        const labelId = element.id.replace("-input", "-label");
        const matchingLabel = document.getElementById(labelId);
        if (matchingLabel) {
          return matchingLabel;
        }
      }

      // Look for any label elements in the container
      const containerLabel = locationContainer.querySelector("label");
      if (containerLabel) {
        return containerLabel;
      }

      // Look for spans with label-like classes
      const spanLabel = locationContainer.querySelector(
        '[class*="es2vvo70"], [class*="css-1xiyo0y"]'
      );
      if (spanLabel && spanLabel.textContent.trim()) {
        return spanLabel;
      }

      // Enhanced search for labels by examining the container structure
      const allLabels = locationContainer.querySelectorAll("label[for]");
      for (const label of allLabels) {
        if (label.getAttribute("for") === element.id) {
          return label;
        }
      }
    }

    // For Glassdoor phone inputs, try to find the container with text
    if (element.closest(".mosaic-provider-module-apply-contact-info-1afmp4o")) {
      const phoneContainer = element.closest(
        ".mosaic-provider-module-apply-contact-info-1afmp4o"
      );

      // Look for any text elements that might serve as labels
      const labelElements = phoneContainer.querySelectorAll("span, div, label");
      for (const labelEl of labelElements) {
        const text = labelEl.textContent.trim();
        if (
          text &&
          (text.toLowerCase().includes("phone") ||
            text.toLowerCase().includes("number"))
        ) {
          return labelEl;
        }
      }

      // If no specific label found, create a virtual one
      const virtualLabel = document.createElement("span");
      virtualLabel.textContent = "Phone Number";
      return virtualLabel;
    }

    // Enhanced fieldset/demographic question handling
    const fieldsetContainer = element.closest(
      'fieldset, [class*="css-1ciavar"]'
    );
    if (fieldsetContainer) {
      const legend = fieldsetContainer.querySelector(
        'legend, [class*="css-sskwr5"]'
      );
      if (legend) {
        return legend;
      }
    }

    // For textareas and selects, try to find label based on common patterns
    const previousSibling = element.previousElementSibling;
    if (
      previousSibling &&
      (previousSibling.tagName === "LABEL" ||
        previousSibling.classList.contains("css-ae8cki") ||
        previousSibling.classList.contains("css-6sl9s3") ||
        previousSibling.querySelector('[class*="label"], [class*="Label"]'))
    ) {
      return previousSibling;
    }

    // Try to find nearby label using various selectors including new CSS classes
    let currentEl = element;
    for (let i = 0; i < 3; i++) {
      const parent = currentEl.parentElement;
      if (!parent) break;

      const nearbyLabel = parent.querySelector(
        'label, [class*="label"], [class*="Label"], [class*="css-6sl9s3"], [class*="es2vvo70"]'
      );
      if (nearbyLabel) return nearbyLabel;

      currentEl = parent;
    }

    return null;
  }

  /**
   * Enhanced extractLabelText with fallbacks
   * @param {HTMLElement} label The label element
   * @returns {string} The extracted label text
   */
  extractLabelText(label) {
    if (!label) return "";

    const testIdElement = label.querySelector(
      '[data-testid*="-label"], [data-testid$="label"]'
    );
    if (testIdElement && testIdElement.textContent.trim()) {
      return testIdElement.textContent.trim();
    }

    const anyTestIdElement = label.querySelector("[data-testid]");
    if (anyTestIdElement && anyTestIdElement.textContent.trim()) {
      return anyTestIdElement.textContent.trim();
    }

    const locationLabelSpan = label.querySelector(
      '[data-testid*="location-fields"], [data-testid*="-label"]'
    );
    if (locationLabelSpan && locationLabelSpan.textContent.trim()) {
      return locationLabelSpan.textContent.trim();
    }

    if (label.tagName === "LEGEND" || label.classList.contains("css-sskwr5")) {
      const questionSpan = label.querySelector(
        ".css-u6bdhh, .css-bev4h3 span, .css-6sl9s3 span"
      );
      if (questionSpan && questionSpan.textContent.trim()) {
        let text = questionSpan.textContent.trim();
        // Remove "(optional)" suffix if present
        text = text.replace(/\s*\(optional\)\s*$/i, "");
        return text;
      }
    }

    if (this.platform === "glassdoor") {
      const questionSpan = label.querySelector(
        ".css-gtr6b9, .css-bev4h3, .css-u6bdhh, .css-18uxmuq, .css-u74ql7"
      );
      if (questionSpan) {
        let text = questionSpan.textContent.trim();
        text = text.replace(/\s*\(optional\)\s*$/i, "");
        return text;
      }

      const nestedSpan = label.querySelector("span span span");
      if (nestedSpan && nestedSpan.textContent.trim()) {
        let text = nestedSpan.textContent.trim();
        text = text.replace(/\s*\(optional\)\s*$/i, "");
        return text;
      }
    } else {
      // Indeed label structure
      const questionSpan = label.querySelector(".css-ft2u8r");
      if (questionSpan) {
        return questionSpan.textContent.trim();
      }
    }

    // Enhanced span selection with priority for meaningful content
    const allSpans = Array.from(label.querySelectorAll("span"));
    const meaningfulSpans = allSpans.filter((span) => {
      const text = span.textContent.trim();
      // Filter out empty spans, "(optional)", and spans with only special characters
      return (
        text &&
        text.length > 2 &&
        !text.match(/^\(.*\)$/) &&
        !span.querySelector("*") &&
        !text.toLowerCase().includes("optional")
      );
    });

    if (meaningfulSpans.length > 0) {
      return meaningfulSpans[0].textContent.trim();
    }

    // Look for text in specific CSS classes that indicate label content
    const specificClassSpans = label.querySelectorAll(
      ".css-u6bdhh, .css-18uxmuq, .e1wnkr790"
    );
    for (const span of specificClassSpans) {
      const text = span.textContent.trim();
      if (text && text.length > 2 && !text.toLowerCase().includes("optional")) {
        return text;
      }
    }

    // Common selectors as fallback
    const textSpan = label.querySelector("span:not(:empty)");
    if (textSpan && !textSpan.querySelector("*")) {
      let text = textSpan.textContent.trim();
      text = text.replace(/\s*\(optional\)\s*$/i, "");
      return text;
    }

    // Direct text content with cleanup
    let directText = label.textContent.trim();
    if (directText) {
      // Clean up the text by removing unwanted parts
      directText = directText.replace(/\s*\(optional\)\s*$/i, "");
      // Remove multiple whitespaces
      directText = directText.replace(/\s+/g, " ");
      return directText;
    }

    // For phone inputs, provide a default label
    if (label.textContent === "Phone Number") {
      return "Phone Number";
    }

    return "";
  }

  /**
   * Upload file from URL to a file input element
   * @param {HTMLElement} fileInput The file input element
   * @param {Object} userData User data containing resume URL
   * @param {boolean} bypassVisibilityCheck Optional flag to bypass visibility check for hidden inputs
   * @returns {Promise<boolean>} Success or failure
   */
  async uploadFileFromURL(fileInput, userData, bypassVisibilityCheck = false) {
    try {
      // Skip visibility check if explicitly told to bypass it
      if (!bypassVisibilityCheck && !this.isElementVisibleOrHidden(fileInput)) {
        return false;
      }
      // Try to use AI matching if job description is available
      let resumeUrl = userData.resumeUrl || userData.cv?.url;

      if (this.jobDescription && resumeUrl) {
        try {
          const matchedUrl = `https://resumify.fastapply.co/api/match`;
          const res = await fetch(matchedUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              resume_urls: Array.isArray(resumeUrl) ? resumeUrl : [resumeUrl],
              job_description: this.jobDescription,
            }),
          });

          const data = await res.json();
          if (data && data.highest_ranking_resume) {
            resumeUrl = data.highest_ranking_resume;
          }
        } catch (error) {
          return false;
        }
      }

      // Use the first URL if resumeUrl is an array
      const finalResumeUrl = Array.isArray(resumeUrl)
        ? resumeUrl[0]
        : resumeUrl;

      if (!finalResumeUrl) {
        return false;
      }

      const response = await fetchFile(finalResumeUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }

      const blob = await response.blob();

      if (blob.size === 0) {
        throw new Error("Received empty file blob");
      }

      let filename = `${userData.firstName || "Resume"} ${
        userData.lastName || ""
      } resume.pdf`;

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get("content-disposition");
      if (contentDisposition) {
        const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(
          contentDisposition
        );
        if (matches?.[1]) {
          // Remove any quotes and path information
          filename = matches[1].replace(/['"]/g, "");
        }
      }

      // Add timestamp to filename to ensure uniqueness
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileExt = filename.substring(filename.lastIndexOf("."));
      const filenameWithoutExt = filename.substring(
        0,
        filename.lastIndexOf(".")
      );
      filename = `${filenameWithoutExt}_${timestamp}${fileExt}`;

      // Create file object with sanitized filename
      const file = new File([blob], filename, {
        type: blob.type || "application/pdf",
        lastModified: Date.now(),
      });

      if (file.size === 0) {
        throw new Error("Created file is empty");
      }

      // Add file to input
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;

      // Dispatch events in sequence with small delays
      await this.sleep(200);
      fileInput.dispatchEvent(new Event("focus", { bubbles: true }));
      await this.sleep(200);
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      await this.sleep(200);
      fileInput.dispatchEvent(new Event("input", { bubbles: true }));

      // Wait for upload to complete
      const uploadComplete = await this.waitForUploadComplete(fileInput);

      if (!uploadComplete) {
        // For Glassdoor, we'll try to proceed anyway as their upload confirmation UI can be inconsistent
        return this.platform === "glassdoor";
      }

      return true;
    } catch (error) {
      try {
        fileInput.value = "";
      } catch (e) {
        // Ignore
      }
      return false;
    }
  }

  /**
   * Check if an element exists in the DOM, even if hidden
   * @param {HTMLElement} element The element to check
   * @returns {boolean} True if the element exists
   */
  isElementVisibleOrHidden(element) {
    return element !== null && element !== undefined;
  }

  async selectGlassdoorCountry(countrySelector, phoneCountryCode) {
    try {
      const formattedCode = phoneCountryCode.startsWith("+")
        ? phoneCountryCode
        : `+${phoneCountryCode}`;

      countrySelector.focus();
      await this.sleep(200);

      const rect = countrySelector.getBoundingClientRect();
      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        buttons: 1,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      });
      countrySelector.dispatchEvent(clickEvent);

      countrySelector.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true })
      );
      countrySelector.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true })
      );

      const enterEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
      });
      countrySelector.dispatchEvent(enterEvent);

      await this.sleep(1200);

      const dropdown = await this.waitForGlassdoorDropdown();

      if (!dropdown) {
        return false;
      }

      const countryOptions = dropdown.querySelectorAll(
        'li[role="option"], .mosaic-provider-module-apply-contact-info-12fezc9, .mosaic-provider-module-apply-contact-info-hllz4e, li[data-testid*="country-select-"], li'
      );

      if (countryOptions.length === 0) {
        return false;
      }

      let selectedOption = null;

      for (const option of countryOptions) {
        const optionText = option.textContent || "";

        if (optionText.includes(formattedCode)) {
          selectedOption = option;
          break;
        }
      }

      if (!selectedOption) {
        for (const option of countryOptions) {
          const codeSpans = option.querySelectorAll("span");
          for (const span of codeSpans) {
            if (span.textContent && span.textContent.includes(formattedCode)) {
              selectedOption = option;
              break;
            }
          }
          if (selectedOption) break;
        }
      }

      if (!selectedOption) {
        const commonMappings = {
          "+1": ["United States", "US", "USA", "America"],
          "+44": ["United Kingdom", "UK", "Britain", "England"],
          "+91": ["India", "IND"],
          "+86": ["China", "CHN"],
          "+81": ["Japan", "JPN"],
          "+49": ["Germany", "DEU", "Deutschland"],
          "+33": ["France", "FRA"],
          "+39": ["Italy", "ITA"],
          "+34": ["Spain", "ESP"],
          "+7": ["Russia", "RUS"],
          "+55": ["Brazil", "BRA"],
          "+52": ["Mexico", "MEX"],
          "+61": ["Australia", "AUS"],
          "+82": ["South Korea", "KOR"],
          "+234": ["Nigeria", "NGA"],
          "+27": ["South Africa", "ZAF"],
          "+31": ["Netherlands", "NLD"],
          "+46": ["Sweden", "SWE"],
          "+47": ["Norway", "NOR"],
          "+45": ["Denmark", "DNK"],
          "+41": ["Switzerland", "CHE"],
          "+43": ["Austria", "AUT"],
          "+32": ["Belgium", "BEL"],
          "+351": ["Portugal", "PRT"],
        };

        const countryNames = commonMappings[formattedCode] || [];

        for (const option of countryOptions) {
          const optionText = option.textContent.toLowerCase();

          for (const countryName of countryNames) {
            if (optionText.includes(countryName.toLowerCase())) {
              selectedOption = option;
              break;
            }
          }
          if (selectedOption) break;
        }
      }

      if (selectedOption) {
        selectedOption.focus();
        await this.sleep(100);
        selectedOption.click();
        await this.sleep(200);

        await this.sleep(300);
        const dropdownStillOpen = document.querySelector(
          '#Popup-\\:rp\\:, .mosaic-provider-module-apply-contact-info-1x9agnk[style*="visible"]'
        );

        if (dropdownStillOpen) {
          const clickEvent = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
          });
          selectedOption.dispatchEvent(clickEvent);
          await this.sleep(300);
        }
        return true;
      }

      document.body.click();
      await this.sleep(200);

      return false;
    } catch (error) {
      try {
        document.body.click();
        await this.sleep(200);
      } catch (e) {}

      return false;
    }
  }

  /**
   * Clear upload tracking for a new form session
   * Call this when starting a new application or when navigating to a new form
   */
  clearUploadTracking() {
    console.log("🧹 Clearing upload tracking state");
    this.uploadedInputs.clear();
  }

  async fillCompleteForm(formData = {}) {
    console.log("🚀 fillCompleteForm starting (Indeed pattern)...");

    try {
      this.userData = formData;
      this.clearUploadTracking();
      this.currentStepCount = 0;

      if (true) {
        // Global overlay
        notifyStatus({ type: "FORM_PROCESSING_STARTED" });
      }

      this.setupUrlChangeListener();

      while (this.currentStepCount < this.maxSteps) {
        this.currentStepCount++;
        const StepType = GlassdoorFormHandler.StepType;

        // Co-pilot user control check
        if (this.copilotMode && this.userHasControl) {
          await this.sleep(1000);
          continue;
        }

        const stepType = this.detectStepFromUrl();
        console.log(`📍 Step ${this.currentStepCount}: ${stepType}`);

        if (true) {
          // Global overlay
          notifyStatus({
            type: "FORM_STEP_PROCESSING",
            data: { step: this.currentStepCount, stepType },
          });
        }

        // Check for success
        if (stepType === StepType.SUCCESS || this.isSuccessPage()) {
          console.log("✅ Application submitted successfully!");
          if (true) {
            // Global overlay
            notifyStatus({ type: "APPLICATION_SUBMITTED" });
          }
          return true;
        }

        // Process step based on type (Indeed pattern)
        switch (stepType) {
          case StepType.CONTACT_INFO:
            await this.handleContactInfoStep();
            break;
          case StepType.RESUME_UPLOAD:
            await this.handleResumeStep();
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
            await this.handleReviewStep();
            break;
          default:
            // Before generic form fill, wait for DOM and re-check if it's a resume step
            await this.waitForFormFields();

            if (this.isResumeStepFromDOM()) {
              console.log("📄 Detected resume step from DOM (URL detection missed it)");
              await this.handleResumeStep();
              break;
            }

            // Unknown step - use generic form filling (Indeed pattern)
            console.log("⚠️ Unknown step, attempting generic form fill");
            const fields = this.extractFormFields();
            if (fields.length > 0) {
              const answers = await this.getAIAnswers(fields);
              await this.fillFields(fields, answers);
            }
        }

        await this.sleep(500);

        // Find and click button
        const buttonToClick = this.findActionButton();

        // Check for CAPTCHA on REVIEW step
        if (stepType === StepType.REVIEW && this.detectCaptcha()) {
          console.log("🔐 CAPTCHA detected on REVIEW page - notifying user");
          if (true) {
            // Global overlay
            notifyStatus({ type: "CAPTCHA_SUBMIT_MANUAL" });
          }
          // Wait for user to solve CAPTCHA
          let attempts = 0;
          while (attempts < 60) {
            await this.sleep(5000);
            if (this.isSuccessPage() || !this.findFormContainer()) {
              return true;
            }
            attempts++;
          }
          return "CAPTCHA_PENDING";
        }

        // Co-pilot mode: pause for user review
        if (this.copilotMode && buttonToClick) {
          const isFinalSubmit = this.isFinalSubmitButton(buttonToClick);
          const isNextOrContinue = this.isNextOrContinueButton(buttonToClick);

          if (isFinalSubmit || isNextOrContinue) {
            const messageType = isFinalSubmit
              ? "COPILOT_SUBMIT_READY"
              : "COPILOT_WAITING_FOR_NEXT";

            if (true) {
              // Global overlay
              notifyStatus({
                type: messageType,
                data: {
                  buttonText: buttonToClick.textContent?.trim(),
                  title: this.currentJobTitle,
                },
              });
            }

            if (this.copilotState) {
              if (isFinalSubmit) {
                this.copilotState.setPendingSubmission(
                  { title: this.currentJobTitle },
                  buttonToClick
                );
              } else {
                this.copilotState.setPendingNext(
                  { title: this.currentJobTitle },
                  buttonToClick
                );
              }
            }

            const userAction = await this.waitForUserAction();
            console.log(`👤 User action: ${userAction}`);

            if (userAction === "SKIP") {
              if (this.copilotState) {
                this.copilotState.clearPendingSubmission();
                this.copilotState.clearPendingNext();
              }
              return false;
            }
            if (userAction === "TAKE_CONTROL") {
              this.userHasControl = true;
              continue;
            }

            // User approved - click the button
            const freshButton = this.findActionButton() || buttonToClick;
            await this.clickButton(freshButton);

            if (this.copilotState) {
              isFinalSubmit
                ? this.copilotState.clearPendingSubmission()
                : this.copilotState.clearPendingNext();
            }
          }
        }
        // Auto-pilot: Click button
        else if (buttonToClick) {
          const buttonText =
            buttonToClick.textContent?.trim().toLowerCase() || "";
          console.log("🖱️ Clicking:", buttonText || "action button");
          await this.clickButton(buttonToClick);
        } else {
          console.warn("⚠️ No button found to proceed");
          // Check if we're on success page
          if (this.isSuccessPage()) {
            console.log("✅ Success page detected");
            if (true) {
              // Global overlay
              notifyStatus({
                type: "APPLICATION_SUBMITTED",
              });
            }
            return true;
          }
          await this.sleep(2000);
          continue;
        }

        // Wait for navigation (Indeed pattern)
        await this.waitForUrlChange(8000);

        // CRITICAL: Wait for DOM to fully settle after step transition
        console.log("⏳ Waiting for new step to load...");
        await this.sleep(1500);
        await this.waitForDomToSettle();
        console.log("✅ DOM settled, proceeding to next step");
      }

      console.warn(`⚠️ Reached max steps (${this.maxSteps})`);
      return false;
    } catch (error) {
      console.error("❌ fillCompleteForm error:", error);
      if (true) {
        // Global overlay
        notifyStatus({
          type: "APPLICATION_ERROR",
          data: { error: error.message },
        });
      }
      return false;
    }
  }

  // ============ Step Handlers (Indeed Pattern) ============

  /**
   * Wait for form fields to appear
   * @param {number} timeout Maximum wait time in milliseconds
   * @returns {Promise<boolean>} True if fields found, false otherwise
   */
  async waitForFormFields(timeout = 10000) {
    console.log("⏳ Waiting for form fields to appear...");
    return new Promise((resolve) => {
      const startTime = Date.now();

      const check = () => {
        // Quick check for visible inputs/selects/textareas
        const form = this.findFormContainer() || document.body;
        const inputs = form.querySelectorAll(
          'input:not([type="hidden"]), select, textarea'
        );

        let hasVisibleFields = false;
        for (const input of inputs) {
          if (this.isElementVisible(input)) {
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

  async handleContactInfoStep() {
    console.log("📝 Handling contact info step");
    await this.waitForFormFields();
    const fields = this.extractFormFields();
    if (fields.length > 0) {
      const answers = await this.getAIAnswers(fields);
      await this.fillFields(fields, answers);
    }
  }

  async handleExperienceStep() {
    console.log("💼 Handling experience step");
    await this.waitForFormFields();
    const fields = this.extractFormFields();
    if (fields.length > 0) {
      const answers = await this.getAIAnswers(fields);
      await this.fillFields(fields, answers);
    }
  }

  async handleQuestionsStep() {
    console.log("❓ Handling questions step");
    await this.waitForFormFields();
    const fields = this.extractFormFields();
    if (fields.length > 0) {
      const answers = await this.getAIAnswers(fields);
      await this.fillFields(fields, answers);
    }
  }

  async handleDemographicsStep() {
    console.log("📊 Handling demographics step");
    await this.waitForFormFields();
    const fields = this.extractFormFields();
    if (fields.length > 0) {
      const answers = await this.getAIAnswers(fields);
      await this.fillFields(fields, answers);
    }
  }

  async handleReviewStep() {
    console.log("👁️ Handling review step");
    // Review step usually doesn't have fields to fill
    // Just proceed to submission
  }
}

export default GlassdoorFormHandler;
