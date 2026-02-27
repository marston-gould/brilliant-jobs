// shared/utilities/form-utils.js
export class FormUtils {
  /**
   * Get all fillable form fields
   */
  static getAllFormFields(form) {
    try {
      const fields = [];
      const formElements = form.querySelectorAll(`
            input:not([type="hidden"]), 
            select, 
            textarea
          `);

      for (const element of formElements) {
        if (!DomUtils.isElementVisible(element)) continue;

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
      console.error("Error getting form fields:", error);
      return [];
    }
  }

  /**
   * Get field label using multiple strategies
   */
  static getFieldLabel(element) {
    try {
      // Method 1: Associated label by ID
      if (element.id) {
        const label = document.querySelector(`label[for="${element.id}"]`);
        if (label) {
          return this.cleanLabelText(label.textContent);
        }
      }

      // Method 2: Parent label
      const parentLabel = element.closest("label");
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true);
        clone
          .querySelectorAll("input, select, textarea")
          .forEach((el) => el.remove());
        return this.cleanLabelText(clone.textContent);
      }

      // Method 3: Preceding label or text
      const container =
        element.closest(".form-group, .field-group") || element.parentElement;
      if (container) {
        const label = container.querySelector("label, .label, .field-label");
        if (label && !label.contains(element)) {
          return this.cleanLabelText(label.textContent);
        }
      }

      // Method 4: Aria-label
      if (element.getAttribute("aria-label")) {
        return this.cleanLabelText(element.getAttribute("aria-label"));
      }

      // Method 5: Placeholder as fallback
      if (element.placeholder) {
        return this.cleanLabelText(element.placeholder);
      }

      // Method 6: Name attribute
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
  static cleanLabelText(text) {
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
   * Get field type
   */
  static getFieldType(element) {
    const tagName = element.tagName.toLowerCase();

    if (tagName === "select") return "select";
    if (tagName === "textarea") return "textarea";

    if (tagName === "input") {
      const type = element.type.toLowerCase();
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
   * Check if field is required
   */
  static isFieldRequired(element) {
    // Check required attribute
    if (element.required || element.getAttribute("aria-required") === "true") {
      return true;
    }

    // Check for required indicators in label
    const label = this.getFieldLabel(element);
    if (label && (label.includes("*") || label.includes("required"))) {
      return true;
    }

    // Check for required class
    if (element.classList.contains("required")) {
      return true;
    }

    return false;
  }

  /**
   * Fill form field with appropriate value
   */
  static async fillField(element, value, fieldType) {
    try {
      if (!element || value === undefined || value === null) {
        return false;
      }

      switch (fieldType) {
        case "text":
        case "email":
        case "tel":
        case "phone":
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
          console.warn(`Unsupported field type: ${fieldType}`);
          return false;
      }
    } catch (error) {
      console.error("Error filling field:", error);
      return false;
    }
  }

  /**
   * Fill input field
   */
  static async fillInputField(element, value) {
    try {
      DomUtils.scrollToElement(element);
      element.focus();
      await this.wait(100);

      // Clear existing value
      element.value = "";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      await this.wait(50);

      // Set new value
      element.value = String(value);

      // Trigger events
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true }));

      await this.wait(100);
      return true;
    } catch (error) {
      console.error("Error filling input field:", error);
      return false;
    }
  }

  /**
   * Fill textarea field
   */
  static async fillTextareaField(element, value) {
    return await this.fillInputField(element, value);
  }

  /**
   * Fill select field
   */
  static async fillSelectField(element, value) {
    try {
      const options = Array.from(element.options);
      const valueStr = String(value).toLowerCase();

      // Exact match first
      for (const option of options) {
        if (option.textContent.toLowerCase().trim() === valueStr) {
          DomUtils.scrollToElement(element);
          element.focus();
          element.value = option.value;
          element.dispatchEvent(new Event("change", { bubbles: true }));
          await this.wait(100);
          return true;
        }
      }

      // Partial match if no exact match
      for (const option of options) {
        const optionText = option.textContent.toLowerCase().trim();
        if (optionText.includes(valueStr) || valueStr.includes(optionText)) {
          DomUtils.scrollToElement(element);
          element.focus();
          element.value = option.value;
          element.dispatchEvent(new Event("change", { bubbles: true }));
          await this.wait(100);
          return true;
        }
      }

      console.warn("No matching option found for:", value);
      return false;
    } catch (error) {
      console.error("Error filling select field:", error);
      return false;
    }
  }

  /**
   * Fill checkbox field
   */
  static async fillCheckboxField(element, value) {
    try {
      const shouldCheck = this.parseBoolean(value);
      if (shouldCheck === null) {
        console.warn("Unclear value for checkbox:", value);
        return false;
      }

      const isCurrentlyChecked = element.checked;

      if (shouldCheck !== isCurrentlyChecked) {
        DomUtils.scrollToElement(element);
        element.click();
        await this.wait(200);
      }

      return true;
    } catch (error) {
      console.error("Error filling checkbox field:", error);
      return false;
    }
  }

  /**
   * Fill radio field
   */
  static async fillRadioField(element, value) {
    try {
      const name = element.name;
      if (!name) return false;

      const radioButtons = document.querySelectorAll(
        `input[type="radio"][name="${name}"]`
      );
      const valueStr = String(value).toLowerCase();

      // Find matching radio button
      for (const radio of radioButtons) {
        const label = this.getFieldLabel(radio);
        if (label && label.toLowerCase().includes(valueStr)) {
          DomUtils.scrollToElement(radio);
          radio.click();
          await this.wait(200);
          return true;
        }
      }

      console.warn("No matching radio option found for:", value);
      return false;
    } catch (error) {
      console.error("Error filling radio field:", error);
      return false;
    }
  }

  /**
   * Fill date field
   */
  static async fillDateField(element, value) {
    try {
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
      console.error("Error filling date field:", error);
      return false;
    }
  }

  /**
   * Parse boolean value from various formats
   */
  static parseBoolean(value) {
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
   * Handle required checkboxes and agreements
   */
  static async handleRequiredCheckboxes(form) {
    try {
      const checkboxes = form.querySelectorAll('input[type="checkbox"]');

      for (const checkbox of checkboxes) {
        if (!DomUtils.isElementVisible(checkbox)) continue;

        const isRequired = this.isFieldRequired(checkbox);
        const label = this.getFieldLabel(checkbox);

        if (isRequired || this.isAgreementCheckbox(label)) {
          if (!checkbox.checked) {
            console.log(`Checking required/agreement checkbox: ${label}`);
            checkbox.click();
            await this.wait(200);
          }
        }
      }
    } catch (error) {
      console.error("Error handling checkboxes:", error);
    }
  }

  /**
   * Check if checkbox is for terms/agreement
   */
  static isAgreementCheckbox(label) {
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
   * Find submit button
   */
  static findSubmitButton(form) {
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      ".submit-button",
      "button.btn-primary:last-child",
      "button:last-child",
    ];

    for (const selector of submitSelectors) {
      const button = form.querySelector(selector);
      if (button && DomUtils.isElementVisible(button) && !button.disabled) {
        return button;
      }
    }

    // Look for buttons with submit-like text
    const buttons = form.querySelectorAll('button, input[type="button"]');
    for (const button of buttons) {
      if (!DomUtils.isElementVisible(button) || button.disabled) continue;

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
   * Check if all required fields are filled and auto-fill missing ones
   */
  static async validateAndFillRequiredFields(form, aiService, userData = {}, jobDescription = "") {
    try {
      const fields = this.getAllFormFields(form);
      const missingFields = [];
      const filledFields = [];

      // Check which fields are missing values
      for (const field of fields) {
        const isEmpty = this.isFieldEmpty(field);
        
        if (isEmpty && field.required) {
          missingFields.push(field);
        } else if (!isEmpty) {
          filledFields.push(field);
        }
      }

      console.log(`Found ${missingFields.length} missing required fields out of ${fields.length} total fields`);

      if (missingFields.length === 0) {
        return {
          success: true,
          message: "All required fields are already filled",
          filledCount: filledFields.length,
          totalFields: fields.length
        };
      }

      // Auto-fill missing fields using AI
      let successfullyFilled = 0;
      const errors = [];

      for (const field of missingFields) {
        try {
          console.log(`Auto-filling field: ${field.label}`);
          
          // Get AI answer for the field
          const context = {
            platform: "generic",
            userData,
            jobDescription,
            fieldType: field.type,
            required: field.required
          };

          const answer = await aiService.getAnswer(field.label, this.getFieldOptions(field), context);
          
          if (answer) {
            const fillSuccess = await this.fillField(field.element, answer, field.type);
            if (fillSuccess) {
              successfullyFilled++;
              console.log(`Successfully filled field: ${field.label}`);
            } else {
              errors.push(`Failed to fill field: ${field.label}`);
            }
          } else {
            errors.push(`No AI answer received for: ${field.label}`);
          }

          // Small delay between field fills
          await this.wait(300);
        } catch (error) {
          errors.push(`Error processing field ${field.label}: ${error.message}`);
        }
      }

      return {
        success: successfullyFilled > 0,
        message: `Auto-filled ${successfullyFilled} out of ${missingFields.length} missing required fields`,
        filledCount: successfullyFilled,
        totalMissing: missingFields.length,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      return {
        success: false,
        message: `Error validating and filling fields: ${error.message}`,
        filledCount: 0,
        totalMissing: 0
      };
    }
  }

  /**
   * Check if a form field is empty
   */
  static isFieldEmpty(fieldInfo) {
    const { element, type } = fieldInfo;

    switch (type) {
      case "text":
      case "email":
      case "tel":
      case "phone":
      case "url":
      case "number":
      case "date":
        const input = element.tagName === "INPUT" ? element : element.querySelector("input");
        return !input || !input.value || input.value.trim() === "";

      case "textarea":
        const textarea = element.tagName === "TEXTAREA" ? element : element.querySelector("textarea");
        return !textarea || !textarea.value || textarea.value.trim() === "";

      case "select":
        const select = element.tagName === "SELECT" ? element : element.querySelector("select");
        return !select || !select.value || select.value === "" || select.selectedIndex <= 0;

      case "checkbox":
        if (element.tagName === "INPUT" && element.type === "checkbox") {
          return !element.checked;
        } else {
          const checkboxes = element.querySelectorAll('input[type="checkbox"]');
          return Array.from(checkboxes).every(cb => !cb.checked);
        }

      case "radio":
        if (element.tagName === "INPUT" && element.type === "radio") {
          const name = element.name;
          if (name) {
            const radioGroup = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
            return Array.from(radioGroup).every(radio => !radio.checked);
          }
          return !element.checked;
        } else {
          const radios = element.querySelectorAll('input[type="radio"]');
          return Array.from(radios).every(radio => !radio.checked);
        }

      default:
        return true; // Unknown field types are considered empty
    }
  }

  /**
   * Get available options for a field (for select, radio, checkbox)
   */
  static getFieldOptions(fieldInfo) {
    const { element, type } = fieldInfo;
    const options = [];

    switch (type) {
      case "select":
        const select = element.tagName === "SELECT" ? element : element.querySelector("select");
        if (select) {
          Array.from(select.options).forEach(option => {
            if (option.value && option.value !== "" && option.textContent.trim()) {
              options.push(option.textContent.trim());
            }
          });
        }
        break;

      case "radio":
        const radios = element.querySelectorAll ? 
          element.querySelectorAll('input[type="radio"]') : 
          document.querySelectorAll(`input[type="radio"][name="${element.name}"]`);
        
        Array.from(radios).forEach(radio => {
          const label = this.getFieldLabel(radio);
          if (label) {
            options.push(label);
          }
        });
        break;

      case "checkbox":
        const checkboxes = element.querySelectorAll ? 
          element.querySelectorAll('input[type="checkbox"]') : [element];
        
        Array.from(checkboxes).forEach(checkbox => {
          const label = this.getFieldLabel(checkbox);
          if (label) {
            options.push(label);
          }
        });
        break;
    }

    return options;
  }

  /**
   * Enhanced form submission with validation
   */
  static async submitFormWithValidation(form, aiService, userData = {}, jobDescription = "") {
    try {
      // First, validate and fill any missing required fields
      const validationResult = await this.validateAndFillRequiredFields(form, aiService, userData, jobDescription);
      
      if (!validationResult.success && validationResult.filledCount === 0) {
        return {
          success: false,
          message: "Cannot submit form: " + validationResult.message,
          validationResult
        };
      }

      // Handle required checkboxes (terms, agreements, etc.)
      await this.handleRequiredCheckboxes(form);

      // Give the form a moment to settle after filling
      await this.wait(1000);

      // Find and click submit button
      const submitButton = this.findSubmitButton(form);
      
      if (!submitButton) {
        return {
          success: false,
          message: "No submit button found",
          validationResult
        };
      }

      if (submitButton.disabled) {
        return {
          success: false,
          message: "Submit button is disabled",
          validationResult
        };
      }

      // Scroll to submit button and click
      if (typeof DomUtils !== 'undefined' && DomUtils.scrollToElement) {
        DomUtils.scrollToElement(submitButton);
      } else {
        submitButton.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      
      await this.wait(500);
      
      submitButton.click();
      
      return {
        success: true,
        message: "Form submitted successfully",
        validationResult
      };

    } catch (error) {
      return {
        success: false,
        message: `Error submitting form: ${error.message}`,
        validationResult: null
      };
    }
  }

  /**
   * Quick check if form is ready for submission
   */
  static isFormReadyForSubmission(form) {
    try {
      const fields = this.getAllFormFields(form);
      const requiredFields = fields.filter(field => field.required);
      
      if (requiredFields.length === 0) {
        return { ready: true, message: "No required fields found" };
      }

      const emptyRequiredFields = requiredFields.filter(field => this.isFieldEmpty(field));
      
      if (emptyRequiredFields.length === 0) {
        return { ready: true, message: "All required fields are filled" };
      }

      return { 
        ready: false, 
        message: `${emptyRequiredFields.length} required fields are empty`,
        missingFields: emptyRequiredFields.map(f => f.label)
      };

    } catch (error) {
      return { 
        ready: false, 
        message: `Error checking form readiness: ${error.message}` 
      };
    }
  }

  /**
   * Utility wait function
   */
  static wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
