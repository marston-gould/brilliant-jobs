// platforms/lever/lever-form-handler.js
import { AIService } from "../../services/index.js";
import { AIResponseUtils } from "../../shared/utilities/index.js";
import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";

export default class LeverFormHandler {
  constructor(options = {}) {
    this.host = options.host;
    this.userData = options.userData || {};
    this.jobDescription = options.jobDescription || "";
    this.aiService = new AIService({ apiHost: this.host, platform: "lever" });

    // Co-pilot properties
    this.copilotMode = options.copilotMode || false;
    this.copilotState = options.copilotState || null;
    this.currentJobTitle = options.currentJobTitle || null;
    this.userHasControl = false;

    // Promise-based pause helpers
    this.userActionResolver = null;
    this.userActionPromise = null;
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
   * @param {string} action - The action (SUBMIT, SKIP, NEXT, TAKE_CONTROL, LET_AI_CONTINUE)
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
    return (
      text.includes("submit application") ||
      text.includes("submit") ||
      text === "apply" ||
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
   * Check if field should be skipped
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
   * Get label for individual radio/checkbox options
   */
  getFieldLabelForOption(element) {
    try {
      // Method 1: Check for Lever's application-answer-alternative
      const leverOption = element.parentElement?.querySelector(
        ".application-answer-alternative"
      );
      if (leverOption) {
        return leverOption.textContent.trim();
      }

      // Method 2: Parent label
      const parentLabel = element.closest("label");
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true);
        // Remove input elements from clone to get just label text
        clone.querySelectorAll("input").forEach((el) => el.remove());
        return this.cleanLabelText(clone.textContent);
      }

      // Method 3: Following sibling text
      let sibling = element.nextSibling;
      while (sibling) {
        if (sibling.nodeType === Node.TEXT_NODE && sibling.textContent.trim()) {
          return this.cleanLabelText(sibling.textContent);
        }
        if (sibling.nodeType === Node.ELEMENT_NODE) {
          const text = sibling.textContent.trim();
          if (text) {
            return this.cleanLabelText(text);
          }
        }
        sibling = sibling.nextSibling;
      }

      return "";
    } catch (error) {
      return "";
    }
  }

  /**
   * Get all form fields from a Lever application form
   */
  getAllFormFields(form) {
    try {

      const fields = [];

      // Lever-specific selectors
      const formElements = form.querySelectorAll(`
        input:not([type="hidden"]),
        select,
        textarea,
        .lever-form-field input,
        .lever-form-field select,
        .lever-form-field textarea,
        [data-qa*="field"] input,
        [data-qa*="field"] select,
        [data-qa*="field"] textarea
      `);

      for (const element of formElements) {
        if (!this.isElementVisible(element)) continue;

        const fieldInfo = {
          element,
          label: this.getFieldLabel(element),
          type: this.getFieldType(element),
          required: this.isFieldRequired(element),
          name: element.name || element.id || "",
        };

        if (fieldInfo.label) {
          fields.push(fieldInfo);
        }
      }
      return fields;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get label text for a form field (Lever-specific)
   */
  getFieldLabel(element) {
    try {
      // Method 1: Check for Lever's application-label structure
      const leverContainer = element.closest(".application-question");
      if (leverContainer) {
        // First try direct application-label
        const directLabel = leverContainer.querySelector(".application-label");
        if (directLabel && !directLabel.querySelector(".text")) {
          return this.cleanLabelText(directLabel.textContent);
        }

        // Then try application-label with nested text div
        const nestedTextLabel = leverContainer.querySelector(
          ".application-label .text"
        );
        if (nestedTextLabel) {
          return this.cleanLabelText(nestedTextLabel.textContent);
        }
      }

      // Method 2: Check for Lever's label structure (legacy)
      const leverLabel = element
        .closest(".lever-form-field")
        ?.querySelector("label");
      if (leverLabel) {
        return this.cleanLabelText(leverLabel.textContent);
      }

      // Method 3: Check for data-qa attributes
      const dataQaContainer = element.closest('[data-qa*="field"]');
      if (dataQaContainer) {
        const label = dataQaContainer.querySelector(
          "label, .form-label, .field-label"
        );
        if (label) {
          return this.cleanLabelText(label.textContent);
        }
      }

      // Method 4: Standard HTML label association
      if (element.id) {
        const label = document.querySelector(`label[for="${element.id}"]`);
        if (label) {
          return this.cleanLabelText(label.textContent);
        }
      }

      // Method 5: Parent label
      const parentLabel = element.closest("label");
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true);
        // Remove input elements from clone to get just label text
        clone
          .querySelectorAll("input, select, textarea")
          .forEach((el) => el.remove());
        return this.cleanLabelText(clone.textContent);
      }

      // Method 6: Preceding label or text in container
      const container =
        element.closest(".form-group, .field-group, .lever-form-field") ||
        element.parentElement;
      if (container) {
        const label = container.querySelector("label, .label, .field-label");
        if (label && !label.contains(element)) {
          return this.cleanLabelText(label.textContent);
        }
      }

      // Method 7: Aria-label
      if (element.getAttribute("aria-label")) {
        return this.cleanLabelText(element.getAttribute("aria-label"));
      }

      // Method 8: Placeholder as fallback
      if (element.placeholder) {
        return this.cleanLabelText(element.placeholder);
      }

      // Method 9: Name attribute
      if (element.name) {
        return this.cleanLabelText(
          element.name.replace(/([A-Z])/g, " $1").replace(/_/g, " ")
        );
      }

      return "";
    } catch (error) {
      return "";
    }
  }

  /**
   * Clean up label text
   */
  cleanLabelText(text) {
    if (!text) return "";

    return text
      .replace(/[*✱]/g, "") // Remove asterisks
      .replace(/\s+/g, " ") // Normalize whitespace
      .replace(/^\s+|\s+$/g, "") // Trim
      .replace(/\(required\)/i, "") // Remove "(required)"
      .replace(/\(optional\)/i, "") // Remove "(optional)"
      .toLowerCase();
  }

  /**
   * Get the type of a form field
   */
  getFieldType(element) {
    const tagName = element.tagName.toLowerCase();

    if (tagName === "select") return "select";
    if (tagName === "textarea") return "textarea";

    if (tagName === "input") {
      const type = element.type.toLowerCase();

      // Check for location autocomplete field
      if (this.isLocationField(element)) return "location";

      if (type === "file") return "file";
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "tel" || type === "phone") return "phone";
      if (type === "email") return "email";
      if (type === "url") return "url";
      if (type === "number") return "number";
      if (type === "date") return "date";
      return type || "text";
    }

    return "unknown";
  }

  /**
   * Check if element is a location autocomplete field
   */
  isLocationField(element) {
    // Check for Lever location input characteristics
    return (
      element.classList.contains("location-input") ||
      element.getAttribute("data-qa") === "location-input" ||
      element.id === "location-input" ||
      (element.name === "location" &&
        element.parentElement?.querySelector('input[name="selectedLocation"]'))
    );
  }

  /**
   * Check if a field is required
   */
  isFieldRequired(element) {
    // Check required attribute
    if (element.required || element.getAttribute("aria-required") === "true") {
      return true;
    }

    // Check for required indicators in label
    const label = this.getFieldLabel(element);
    if (label && (label.includes("*") || label.includes("required"))) {
      return true;
    }

    // Check for Lever-specific required indicators
    const container = element.closest(
      ".lever-form-field, .form-group, .field-group"
    );
    if (container) {
      const requiredIndicator = container.querySelector(
        '.required, .mandatory, [class*="required"]'
      );
      if (requiredIndicator) {
        return true;
      }
    }

    return false;
  }

  /**
   * Fill form with user profile data using AI
   */
  async fillFormWithProfile(form, profile) {
    try {
      this.userData = profile;

      const formFields = this.getAllFormFields(form);
      let filledCount = 0;
      let skippedCount = 0;

      for (const field of formFields) {
        // Check if field should be skipped (including "Other URL" fields)
        if (this.shouldSkipField(field)) {
          continue; // Skip silently without logging for "Other URL" fields
        }

        try {
          // Check if this is a cover letter field and handle it specially
          if (AIResponseUtils.isCoverLetterField(field)) {
            console.log(`🔍 Cover letter field detected: ${field.label}`);

            // Generate cover letter using utility
            const jobData = {
              title: AIResponseUtils.extractJobTitle('lever'),
              company: AIResponseUtils.extractCompanyName('lever'),
              description: this.jobDescription
            };

            const coverLetter = await AIResponseUtils.generateCoverLetter(
              this.aiService,
              this.userData,
              jobData,
              this.jobDescription
            );

            if (coverLetter) {
              const success = await this.fillField(
                field.element,
                coverLetter,
                field.type
              );
              if (success) {
                filledCount++;
                console.log(`✅ Cover letter filled for: ${field.label}`);
              } else {
                skippedCount++;
              }

              await this.humanWait(300, 600);
              continue; // Skip the regular AI answer logic for cover letter fields
            } else {
              console.log(`⚠️ Cover letter generation failed, falling back to AI answer for: ${field.label}`);
              // Don't continue, let it fall through to regular AI answer logic
            }
          }

          // Get field options for select/radio fields
          const options = this.getFieldOptions(field.element);

          // Get AI answer
          const answer = await this.getAIAnswer(
            field.label,
            options,
            field.type,
            this.buildFieldContext(field)
          );

          if (answer !== null && answer !== undefined && answer !== "") {
            const success = await this.fillField(
              field.element,
              answer,
              field.type
            );
            if (success) {
              filledCount++;
            } else {
              skippedCount++;
            }
          } else {
            skippedCount++;
          }

          // Human-like delay between fields
          await this.humanWait(300, 600);
        } catch (fieldError) {
          skippedCount++;
        }
      }

      // Handle checkboxes and agreements
      await this.handleRequiredCheckboxes(form);

      return filledCount > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get AI answer for a form field
   */

  async getAIAnswer(question, options = [], fieldType = "text", fieldContext = "", retryCount = 0) {
    try {
      const context = {
        platform: "lever",
        userData: this.userData,
        jobDescription: this.jobDescription,
        fieldType,
        fieldContext,
        required: fieldContext.includes('required')
      };

      let answer;

      // Use specialized AI service methods based on field type and context (same as Workable)
      if (fieldType === "checkbox" && options && options.length > 1) {
        // Checkbox group with multiple options - use multi-select
        answer = await this.aiService.getMultiSelectAnswer(question, options, context);
      } else if (options && options.length > 0) {
        answer = await this.aiService.getOptionAnswer(question, options, context);
      } else if (AIResponseUtils.isSalaryField(question)) {
        answer = await this.aiService.getSalaryAnswer(question, options, context);
      } else if (fieldType === 'textarea' || fieldContext.toLowerCase().includes('cover letter') ||
        fieldContext.toLowerCase().includes('describe') || fieldContext.toLowerCase().includes('why')) {
        answer = await this.aiService.getLongformAnswer(question, options, context);
      } else {
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
          if (fieldType === "checkbox" && options && options.length > 1) {
            retryAnswer = await this.aiService.getMultiSelectAnswer(question, options, retryContext);
          } else if (options && options.length > 0) {
            retryAnswer = await this.aiService.getOptionAnswer(question, options, retryContext);
          } else if (AIResponseUtils.isSalaryField(question)) {
            retryAnswer = await this.aiService.getSalaryAnswer(question, options, retryContext);
          } else if (fieldType === 'textarea' || fieldContext.toLowerCase().includes('cover letter') ||
            fieldContext.toLowerCase().includes('describe') || fieldContext.toLowerCase().includes('why')) {
            retryAnswer = await this.aiService.getLongformAnswer(question, options, retryContext);
          } else {
            retryAnswer = await this.aiService.getNormalAnswer(question, options, retryContext);
          }

          if ((retryAnswer === null || retryAnswer === undefined || retryAnswer === "" || String(retryAnswer).trim() === "") && retryCount < 1) {
            return await this.getAIAnswer(question, options, fieldType, fieldContext, retryCount + 1);
          }

          if (retryAnswer !== null && retryAnswer !== undefined && String(retryAnswer).trim() !== "") {
            return AIResponseUtils.cleanAIResponse(retryAnswer);
          }
        }

        return null;
      }

      return AIResponseUtils.cleanAIResponse(answer);
    } catch (error) {
      // Retry on error if we haven't exceeded retry limit
      if (retryCount < 2) {
        await new Promise(resolve => setTimeout(resolve, 1000 + (retryCount * 500)));
        return await this.getAIAnswer(question, options, fieldType, fieldContext, retryCount + 1);
      }

      return null;
    }
  }

  /**
   * Extract field length constraints for AI validation
   */
  getFieldConstraints(element) {
    const constraints = {
      minLength: null,
      maxLength: null,
      pattern: null,
      required: false
    };

    try {
      // Get the actual input element
      const inputElement = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA'
        ? element
        : element.querySelector('input, textarea');

      if (inputElement) {
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
    }

    return constraints;
  }

  /**
   * Build context for AI field processing with field constraints
   */
  buildFieldContext(field) {
    // Extract field constraints for AI validation
    const constraints = this.getFieldConstraints(field.element);

    return [
      `Field type: ${field.type}`,
      field.required ? "This field is required" : "This field is optional",
      field.name ? `Field name: ${field.name}` : "",
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
  }

  /**
   * Get options for select/radio fields
   */
  getFieldOptions(element) {
    const options = [];

    try {
      if (element.tagName.toLowerCase() === "select") {
        const optionElements = element.querySelectorAll("option");
        optionElements.forEach((option) => {
          const text = option.textContent.trim();
          if (
            text &&
            !text.toLowerCase().includes("select") &&
            text !== "---" &&
            option.value !== ""
          ) {
            options.push(text);
          }
        });
      } else if (element.type === "radio" || element.type === "checkbox") {
        const name = element.name;
        if (name) {
          // Find all elements with the same name
          const relatedElements = document.querySelectorAll(
            `input[name="${name}"]`
          );

          relatedElements.forEach((relatedElement) => {
            // Method 1: Look for Lever's application-answer-alternative
            const leverOption = relatedElement.parentElement?.querySelector(
              ".application-answer-alternative"
            );
            if (leverOption) {
              const text = leverOption.textContent.trim();
              if (text) {
                options.push(text);
              }
              return;
            }

            // Method 2: Traditional label approach
            const label = this.getFieldLabelForOption(relatedElement);
            if (label) {
              options.push(label);
            }
          });
        }
      }
    } catch (error) {
    }

    return [...new Set(options)];
  }

  /**
   * Fill a form field with the appropriate value
   */
  async fillField(element, value, fieldType) {
    try {
      if (!element || value === undefined || value === null) {
        return false;
      }

      switch (fieldType) {
        case "location":
          return await this.fillLocationField(element, value);

        case "text":
        case "email":
        case "url":
        case "number":
          return await this.fillInputField(element, value);

        case "textarea":
          return await this.fillTextareaField(element, value);

        case "select":
          return await this.fillSelectField(element, value);

        case "checkbox":
          return await this.fillCheckboxField(element, value);

        case "radio":
          return await this.fillRadioField(element, value);

        case "date":
          return await this.fillDateField(element, value);

        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Fill location autocomplete field
   */
  async fillLocationField(element, value) {
    try {
      // Scroll to and focus the input
      this.scrollToElement(element);
      element.focus();
      await this.wait(500);

      // Find the dropdown container
      const container =
        element.closest(".application-question") || element.parentElement;
      const dropdownContainer = container?.querySelector(".dropdown-container");

      if (!dropdownContainer) {
        return false;
      }

      // Clear any existing value first
      element.value = "";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("keydown", { bubbles: true }));
      element.dispatchEvent(new Event("keyup", { bubbles: true }));
      await this.wait(300);

      // Type the location character by character to trigger autocomplete
      const locationValue = String(value);

      for (let i = 0; i < locationValue.length; i++) {
        const currentValue = locationValue.substring(0, i + 1);

        // Set the value
        element.value = currentValue;

        // Create and dispatch keyboard events to mimic real typing
        const keydownEvent = new KeyboardEvent("keydown", {
          key: locationValue[i],
          code: `Key${locationValue[i].toUpperCase()}`,
          bubbles: true,
          cancelable: true,
        });

        const keyupEvent = new KeyboardEvent("keyup", {
          key: locationValue[i],
          code: `Key${locationValue[i].toUpperCase()}`,
          bubbles: true,
          cancelable: true,
        });

        const inputEvent = new Event("input", { bubbles: true });

        // Dispatch events in proper order
        element.dispatchEvent(keydownEvent);
        element.dispatchEvent(inputEvent);
        element.dispatchEvent(keyupEvent);

        await this.wait(500); // Very slow typing

        // Check if dropdown appeared early
        const dropdownResults =
          dropdownContainer.querySelector(".dropdown-results");
        if (
          dropdownResults &&
          dropdownResults.children.length > 0 &&
          window.getComputedStyle(dropdownContainer).display !== "none"
        ) {
          break;
        }
      }

      let attempts = 0;
      const maxAttempts = 25; // Wait up to 5 seconds

      while (attempts < maxAttempts) {
        const dropdownResults =
          dropdownContainer.querySelector(".dropdown-results");
        const loadingElement = dropdownContainer.querySelector(
          ".dropdown-loading-results"
        );
        const noResultsElement = dropdownContainer.querySelector(
          ".dropdown-no-results"
        );

        // Check if loading is complete
        const isLoading =
          loadingElement &&
          window.getComputedStyle(loadingElement).display !== "none";

        // Check if we have results
        const hasResults =
          dropdownResults &&
          dropdownResults.children.length > 0 &&
          window.getComputedStyle(dropdownContainer).display !== "none";

        // Check if no results found
        const hasNoResults =
          noResultsElement &&
          window.getComputedStyle(noResultsElement).display !== "none";

        if (!isLoading && (hasResults || hasNoResults)) {
          if (hasResults) {
            // Get all clickable elements inside dropdown-results
            let options = Array.from(dropdownResults.children);

            // If no direct children, look for specific selectors
            if (options.length === 0) {
              const alternativeOptions = Array.from(
                dropdownResults.querySelectorAll("*")
              );

              // Use descendants that have text content and look clickable
              options.push(
                ...alternativeOptions.filter(
                  (elem) =>
                    elem.textContent.trim() &&
                    (elem.onclick ||
                      elem.getAttribute("onclick") ||
                      elem.classList.contains("cursor-pointer") ||
                      elem.style.cursor === "pointer" ||
                      elem.getAttribute("role") === "option" ||
                      elem.hasAttribute("data-value") ||
                      elem.tagName.toLowerCase() === "button" ||
                      elem.tagName.toLowerCase() === "a")
                )
              );
            }

            if (options.length === 0) {
              return false;
            }

            // Look for the best matching option
            let bestMatch = null;
            let bestScore = 0;

            const searchValue = locationValue.toLowerCase().trim();

            for (let i = 0; i < options.length; i++) {
              const option = options[i];
              const optionText = option.textContent.trim().toLowerCase();
              let score = 0;

              // Exact match gets highest score
              if (optionText === searchValue) {
                score = 1000;
              }
              // Starts with search value (very high priority for locations)
              else if (optionText.startsWith(searchValue)) {
                score = 900;
              }
              // Search value starts with option (good for partial typing)
              else if (searchValue.startsWith(optionText)) {
                score = 850;
              }
              // Contains search value
              else if (optionText.includes(searchValue)) {
                score = 700;
              }
              // Word-by-word matching (important for cities with country/state)
              else {
                const searchWords = searchValue
                  .split(/[,\s]+/)
                  .filter((w) => w.length > 0);
                const optionWords = optionText
                  .split(/[,\s]+/)
                  .filter((w) => w.length > 0);
                let exactWordMatches = 0;
                let partialWordMatches = 0;

                // Check for exact word matches first
                for (const searchWord of searchWords) {
                  for (const optionWord of optionWords) {
                    if (searchWord === optionWord) {
                      exactWordMatches++;
                      break;
                    }
                  }
                }

                // Check for partial word matches
                for (const searchWord of searchWords) {
                  for (const optionWord of optionWords) {
                    if (
                      searchWord !== optionWord &&
                      (optionWord.includes(searchWord) ||
                        searchWord.includes(optionWord))
                    ) {
                      partialWordMatches++;
                      break;
                    }
                  }
                }

                // Calculate score based on word matches
                const totalSearchWords = searchWords.length;
                if (exactWordMatches > 0) {
                  score =
                    (exactWordMatches / totalSearchWords) * 600 +
                    partialWordMatches * 50;
                } else if (partialWordMatches > 0) {
                  score = (partialWordMatches / totalSearchWords) * 400;
                }
              }

              // Boost score if this is the first option (often the best match)
              if (i === 0 && score > 0) {
                score += 50;
              }

              if (score > bestScore) {
                bestScore = score;
                bestMatch = option;
              }
            }

            if (bestMatch && bestScore > 0) {
              // Ensure the field is still focused and the dropdown is visible
              element.focus();
              await this.wait(200);

              // Try multiple click methods to ensure selection works
              try {
                const expectedText = bestMatch.textContent.trim();

                // Method 1: React-style synthetic events

                // Scroll the option into view first
                bestMatch.scrollIntoView({
                  behavior: "smooth",
                  block: "nearest",
                });
                await this.wait(200);

                // Create React-style synthetic events
                const syntheticMouseDown = new MouseEvent("mousedown", {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  detail: 1,
                  screenX: 0,
                  screenY: 0,
                  clientX: 0,
                  clientY: 0,
                  ctrlKey: false,
                  altKey: false,
                  shiftKey: false,
                  metaKey: false,
                  button: 0,
                  buttons: 1,
                });

                const syntheticMouseUp = new MouseEvent("mouseup", {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  detail: 1,
                  screenX: 0,
                  screenY: 0,
                  clientX: 0,
                  clientY: 0,
                  ctrlKey: false,
                  altKey: false,
                  shiftKey: false,
                  metaKey: false,
                  button: 0,
                  buttons: 0,
                });

                const syntheticClick = new MouseEvent("click", {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  detail: 1,
                  screenX: 0,
                  screenY: 0,
                  clientX: 0,
                  clientY: 0,
                  ctrlKey: false,
                  altKey: false,
                  shiftKey: false,
                  metaKey: false,
                  button: 0,
                  buttons: 0,
                });

                // Dispatch events in sequence
                bestMatch.dispatchEvent(syntheticMouseDown);
                await this.wait(50);
                bestMatch.dispatchEvent(syntheticMouseUp);
                await this.wait(50);
                bestMatch.dispatchEvent(syntheticClick);
                await this.wait(500);

                // Check if selection worked by comparing the actual field value
                if (element.value.trim() === expectedText) {
                  return true;
                }

                // Method 2: Try programmatic focus + enter

                // Set focus on the option if possible
                if (bestMatch.tabIndex !== undefined) {
                  bestMatch.tabIndex = 0;
                }
                bestMatch.focus();
                await this.wait(100);

                // Try pressing Enter
                const enterKeyDown = new KeyboardEvent("keydown", {
                  key: "Enter",
                  code: "Enter",
                  keyCode: 13,
                  which: 13,
                  bubbles: true,
                  cancelable: true,
                });

                const enterKeyUp = new KeyboardEvent("keyup", {
                  key: "Enter",
                  code: "Enter",
                  keyCode: 13,
                  which: 13,
                  bubbles: true,
                  cancelable: true,
                });

                bestMatch.dispatchEvent(enterKeyDown);
                await this.wait(50);
                bestMatch.dispatchEvent(enterKeyUp);
                await this.wait(500);

                // Check again
                if (element.value.trim() === expectedText) {
                  return true;
                }

                // Method 3: Try to trigger any click handlers directly

                // Look for click handlers
                const clickHandler = bestMatch.onclick;
                if (clickHandler) {
                  clickHandler.call(bestMatch, syntheticClick);
                  await this.wait(500);

                  if (element.value.trim() === expectedText) {
                    return true;
                  }
                }

                // Method 4: Try simulating pointer events (more modern)

                const pointerDown = new PointerEvent("pointerdown", {
                  pointerId: 1,
                  bubbles: true,
                  cancelable: true,
                  isPrimary: true,
                });

                const pointerUp = new PointerEvent("pointerup", {
                  pointerId: 1,
                  bubbles: true,
                  cancelable: true,
                  isPrimary: true,
                });

                bestMatch.dispatchEvent(pointerDown);
                await this.wait(50);
                bestMatch.dispatchEvent(pointerUp);
                await this.wait(50);
                bestMatch.dispatchEvent(syntheticClick);
                await this.wait(500);

                // Final check
                if (element.value.trim() === expectedText) {
                  return true;
                }

                // Method 5: Try to manually set the field value and trigger change events

                // Set the main input value directly
                element.value = expectedText;

                // Trigger all relevant events
                element.dispatchEvent(new Event("input", { bubbles: true }));
                element.dispatchEvent(new Event("change", { bubbles: true }));
                element.dispatchEvent(new Event("blur", { bubbles: true }));

                // Try to hide the dropdown
                if (dropdownContainer) {
                  dropdownContainer.style.display = "none";
                }

                await this.wait(300);

                return true;
              } catch (clickError) {
                return false;
              }
            } else {
              return false;
            }
          } else {
            return false;
          }
        }

        attempts++;
        await this.wait(200);
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Fill input field with human-like typing behavior
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
   * Fill textarea field with human-like paste behavior (faster than typing)
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
   * Fill select field
   */
  async fillSelectField(element, value) {
    try {
      const optionElements = Array.from(element.options);
      const valueStr = String(value).toLowerCase().trim();

      // Find matching option element
      let targetOption = null;

      // Exact text match first
      for (const option of optionElements) {
        const optionText = option.textContent.trim();
        if (optionText.toLowerCase() === valueStr) {
          targetOption = option;
          break;
        }
      }

      // Partial text match if no exact match
      if (!targetOption) {
        for (const option of optionElements) {
          const optionText = option.textContent.toLowerCase().trim();
          if (optionText.includes(valueStr) || valueStr.includes(optionText)) {
            targetOption = option;
            break;
          }
        }
      }

      // Value match as fallback
      if (!targetOption) {
        for (const option of optionElements) {
          if (option.value.toLowerCase() === valueStr) {
            targetOption = option;
            break;
          }
        }
      }

      if (targetOption) {
        this.scrollToElement(element);
        element.focus();
        element.value = targetOption.value;
        element.dispatchEvent(new Event("change", { bubbles: true }));
        element.dispatchEvent(new Event("input", { bubbles: true }));
        await this.humanWait(100, 250);
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Fill checkbox field
   */
  async fillCheckboxField(element, value) {
    try {
      // For single checkboxes (like agreements), parse as boolean
      const name = element.name;
      const checkboxes = document.querySelectorAll(
        `input[type="checkbox"][name="${name}"]`
      );

      if (checkboxes.length === 1) {
        // Single checkbox - treat as boolean
        const shouldCheck = this.parseAIBoolean(value);
        if (shouldCheck === null) {
          return false;
        }

        const isCurrentlyChecked = element.checked;

        if (shouldCheck !== isCurrentlyChecked) {
          this.scrollToElement(element);
          element.focus();
          await this.humanClick(element);
          await this.humanWait(150, 350);
        }

        return true;
      } else {
        // Multiple checkboxes - value is an array from getMultiSelectAnswer
        let selectedValues = [];
        if (Array.isArray(value)) {
          selectedValues = value.map((v) => String(v).trim().toLowerCase());
        } else if (typeof value === "string") {
          selectedValues = value.split(",").map((v) => v.trim().toLowerCase());
        }

        let checkedAny = false;
        for (const cb of checkboxes) {
          const label = this.getFieldLabelForOption(cb);
          if (!label) continue;

          const labelLower = label.toLowerCase();
          const shouldSelect = selectedValues.some(
            (sel) =>
              labelLower === sel ||
              labelLower.includes(sel) ||
              sel.includes(labelLower)
          );

          if (shouldSelect && !cb.checked) {
            this.scrollToElement(cb);
            cb.focus();
            await this.humanClick(cb);
            await this.humanWait(150, 350);
            checkedAny = true;
          }
        }
        return checkedAny;

        return false;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Fill radio field
   */
  async fillRadioField(element, value) {
    try {
      const name = element.name;
      if (!name) return false;

      const radioButtons = document.querySelectorAll(
        `input[type="radio"][name="${name}"]`
      );
      const valueStr = String(value).toLowerCase().trim();

      // Find matching radio button
      let targetRadio = null;

      // Exact text match first
      for (const radio of radioButtons) {
        const label = this.getFieldLabelForOption(radio);
        if (label && label.toLowerCase().trim() === valueStr) {
          targetRadio = radio;
          break;
        }
      }

      // Partial text match
      if (!targetRadio) {
        for (const radio of radioButtons) {
          const label = this.getFieldLabelForOption(radio);
          if (label) {
            const labelText = label.toLowerCase().trim();
            if (labelText.includes(valueStr) || valueStr.includes(labelText)) {
              targetRadio = radio;
              break;
            }
          }
        }
      }

      // Value match
      if (!targetRadio) {
        for (const radio of radioButtons) {
          if (radio.value.toLowerCase() === valueStr) {
            const label = this.getFieldLabelForOption(radio);
            targetRadio = radio;
            break;
          }
        }
      }

      if (targetRadio) {
        this.scrollToElement(targetRadio);
        targetRadio.focus();
        await this.humanClick(targetRadio);
        await this.humanWait(150, 350);
        return true;
      }

      // Log available options for debugging
      const availableOptions = [];
      for (const radio of radioButtons) {
        const label = this.getFieldLabelForOption(radio);
        if (label) {
          availableOptions.push(`"${label}" (${radio.value})`);
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Fill date field
   */
  async fillDateField(element, value) {
    try {
      // For date inputs, try to format the value appropriately
      let dateValue = value;

      if (element.type === "date") {
        // Convert to YYYY-MM-DD format if needed
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            dateValue = date.toISOString().split("T")[0];
          }
        } catch (e) {
          // Keep original value if parsing fails
        }
      }

      return await this.fillInputField(element, dateValue);
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle required checkboxes and agreements
   */
  async handleRequiredCheckboxes(form) {
    try {
      const checkboxes = form.querySelectorAll('input[type="checkbox"]');

      for (const checkbox of checkboxes) {
        if (!this.isElementVisible(checkbox)) continue;

        const isRequired = this.isFieldRequired(checkbox);
        const label = this.getFieldLabel(checkbox);

        if (isRequired || this.isAgreementCheckbox(label)) {
          if (!checkbox.checked) {
            await this.humanClick(checkbox);
            await this.humanWait(150, 350);
          }
        }
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if checkbox is for terms/agreement
   */
  isAgreementCheckbox(label) {
    if (!label) return false;

    const agreementKeywords = [
      "terms",
      "conditions",
      "privacy",
      "policy",
      "agreement",
      "consent",
      "authorize",
      "acknowledge",
      "accept",
      "agree",
    ];

    const labelLower = label.toLowerCase();
    return agreementKeywords.some((keyword) => labelLower.includes(keyword));
  }

  /**
   * Parse AI boolean response
   */
  parseAIBoolean(value) {
    if (!value) return false;

    const normalizedValue = String(value).toLowerCase().trim();

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

    return null; // Unclear response
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
          const options = this.getFieldOptions(field.element);

          // Get AI answer for the specific field using correct signature
          const fieldContext = `This is a required ${field.type} field that must be filled.`;
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
      'textarea[aria-required="true"]'
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
            unfilledFields.push(fieldInfo);
          }
        }
      }
    }

    // Also check for required fieldsets (radio groups, checkbox groups)
    const requiredFieldsets = form.querySelectorAll('fieldset[required], fieldset[aria-required="true"], div[role="radiogroup"][required], div[role="radiogroup"][aria-required="true"]');

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
   * Get label for a fieldset
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

    // Try finding label by looking at previous elements
    let prev = fieldset.previousElementSibling;
    while (prev) {
      if (prev.tagName === 'LABEL' || prev.classList.contains('question') || prev.classList.contains('field-label')) {
        return prev.textContent.trim();
      }
      prev = prev.previousElementSibling;
    }

    return 'Required field group';
  }

  /**
   * Find and submit the form with human-like behavior
   */
  async submitForm(form) {
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

      // Determine if this is a final submit or next/continue button
      const isFinalSubmit = this.isFinalSubmitButton(submitButton);
      const isNextOrContinue = this.isNextOrContinueButton(submitButton);

      // Co-pilot pause logic - Auto-pilot should never pause (fully automatic)
      const shouldPause = this.copilotMode
        ? (isFinalSubmit || isNextOrContinue)  // Co-pilot: pause at all buttons for review
        : false;                               // Auto-pilot: never pause, submit automatically

      console.log(`🎯 Submit decision: copilotMode=${this.copilotMode}, isFinalSubmit=${isFinalSubmit}, shouldPause=${shouldPause}`);

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
        } else if (userAction === "SKIP") {
          return { success: false, reason: "user_skipped" };
        } else if (userAction === "TAKE_CONTROL") {
          this.userHasControl = true;
          if (true) { // Global overlay
            updateStatusButtons("user-control");
          }
          const resumeAction = await this.waitForUserAction();
          if (resumeAction === "LET_AI_CONTINUE") {
            this.userHasControl = false;
          } else if (resumeAction === "SKIP") {
            return { success: false, reason: "user_skipped" };
          }
        }
      }

      // Human-like pre-submit behavior - longer wait after filling forms
      this.scrollToElement(submitButton);
      await this.humanWait(2000, 4000); // Longer wait to review form and let validation settle

      // Human-like button click with mouse movement simulation
      await this.humanClick(submitButton);

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Find submit button
   */
  findSubmitButton(form) {
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button[data-qa="btn-submit"]',
      'button[data-qa="submit"]',
      ".submit-button",
      ".posting-btn-submit",
      "button.btn-primary:last-child",
      "button:last-child",
    ];

    for (const selector of submitSelectors) {
      const button = form.querySelector(selector);
      if (button && this.isElementVisible(button) && !button.disabled) {
        return button;
      }
    }

    // Look for buttons with submit-like text
    const buttons = form.querySelectorAll('button, input[type="button"]');
    for (const button of buttons) {
      if (!this.isElementVisible(button) || button.disabled) continue;

      const text = (button.textContent || button.value || "").toLowerCase();
      if (
        text.includes("submit") ||
        text.includes("apply") ||
        text.includes("send") ||
        text.includes("continue") ||
        text === "next"
      ) {
        return button;
      }
    }

    return null;
  }

  /**
   * Utility methods
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
}
