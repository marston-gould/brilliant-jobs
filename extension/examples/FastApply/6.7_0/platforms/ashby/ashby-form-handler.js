import { notifyStatus } from "../../utils/status-helper.js";
// platforms/ashby/ashby-form-handler.js
import { AIService } from "../../services/index.js";
import Utils from "../../utils/utils.js";
import { AIResponseUtils } from "../../shared/utilities/index.js";
import { AshbyFormFieldExtractor } from "./ashby_form_extractor.js";

export class AshbyFormHandler {
  constructor(options = {}) {
    this.host = options.host;
    this.userData = options.userData || {};
    this.jobDescription = options.jobDescription || "";
    this.aiService = new AIService({ apiHost: this.host, platform: "ashby" });
    this.answerCache = new Map();
    this.utils = new Utils();

    this.processedForms = new Set();
    this.fillInProgress = false;
    this.lastFillTime = 0;

    // Co-pilot mode properties
    // Global overlay used via notifyStatus()
    this.logger = options.logger;
    this.copilotMode = options.copilotMode || false;
    this.copilotState = options.copilotState;
    this.currentJobTitle = "";
    this.userActionPromise = null;
    this.userActionResolver = null;
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

  async fillTextareaInput(fieldInfo, value) {
    const textarea =
      fieldInfo.element.querySelector("textarea") || fieldInfo.element;

    this.scrollToElement(textarea);
    textarea.focus();
    await this.wait(100);

    const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    ).set;

    // Clear existing content
    nativeTextareaValueSetter.call(textarea, "");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await this.wait(50);

    // Set new value
    const cleanedValue = String(value)
      .replace(/\r?\n|\r/g, "\n")
      .trim();
    nativeTextareaValueSetter.call(textarea, cleanedValue);

    // Dispatch events
    const inputEvent = new Event("input", { bubbles: true, cancelable: true });
    const changeEvent = new Event("change", {
      bubbles: true,
      cancelable: true,
    });

    textarea.dispatchEvent(inputEvent);
    await this.wait(50);
    textarea.dispatchEvent(changeEvent);

    // Verify the value was set
    if (textarea.value === cleanedValue) {
      return true;
    } else {
      // Fallback: Try direct assignment
      textarea.value = cleanedValue;
      textarea.dispatchEvent(inputEvent);
      textarea.dispatchEvent(changeEvent);

      return textarea.value === cleanedValue;
    }
  }

  /**
   * Get all form fields from Ashby application (not in a form element)
   */
  getAllFormFields() {
    try {
      const fields = [];

      // Find all field entries (they're not inside a form element)
      const fieldEntries = document.querySelectorAll(
        '[class*="_fieldEntry_"], .ashby-application-form-field-entry'
      );

      for (let i = 0; i < fieldEntries.length; i++) {
        const fieldEntry = fieldEntries[i];

        if (!this.isElementVisible(fieldEntry)) {
          continue;
        }

        const fieldInfo = this.analyzeAshbyField(fieldEntry);

        if (fieldInfo) {
          // Skip "If other, please provide context" fields
          if (this.shouldSkipField(fieldInfo.label)) {
            continue;
          }

          fields.push(fieldInfo);
        } else {
          continue;
        }
      }

      return fields;
    } catch (error) {
      return [];
    }
  }

  /**
   * Check if field should be skipped
   */
  shouldSkipField(label) {
    const skipPatterns = [
      /if other.*please provide context/i,
      /if other.*please specify/i,
      /other.*please explain/i,
    ];

    return skipPatterns.some((pattern) => pattern.test(label));
  }

  /**
   * Analyze individual Ashby field and extract information
   */
  analyzeAshbyField(fieldEntry) {
    try {
      // Get the label
      const labelElement = fieldEntry.querySelector(
        '[class*="_heading_"], .ashby-application-form-question-title'
      );
      if (!labelElement) return null;

      let labelText = this.cleanLabelText(labelElement.textContent);
      if (!labelText) return null;

      // Include the description text so AI gets the full question context
      // e.g. label "Location" + description "Will you be able to work in SF office?"
      const descriptionElement = fieldEntry.querySelector(
        '[class*="_description_"], .ashby-application-form-question-description'
      );
      if (descriptionElement) {
        const descText = descriptionElement.textContent.trim();
        if (descText) {
          labelText = `${labelText}: ${descText}`;
        }
      }

      // Check if required
      const isRequired = this.isAshbyFieldRequired(fieldEntry, labelElement);

      // Determine field type and structure
      const fieldType = this.determineAshbyFieldType(fieldEntry);

      return {
        element: fieldEntry,
        label: labelText,
        type: fieldType.type,
        subType: fieldType.subType,
        required: isRequired,
        options: fieldType.options || [],
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Determine the type of Ashby field
   */
  determineAshbyFieldType(fieldEntry) {
    // 1. Check for autocomplete fields (Location, How you heard)
    const autocompleteInput = fieldEntry.querySelector(
      'input[role="combobox"], input[placeholder="Start typing..."]'
    );
    if (autocompleteInput) {
      return {
        type: "autocomplete",
        subType: "combobox",
        element: autocompleteInput,
      };
    }

    // 2. Check for Yes/No button fields
    const yesNoContainer = fieldEntry.querySelector(
      '[class*="_yesno_"], [class*="_container_y2cw4"]'
    );
    if (yesNoContainer) {
      const yesNoButtons = yesNoContainer.querySelectorAll('button[class*="_option_"]');
      if (yesNoButtons.length > 0) {
        return {
          type: "yesno",
          subType: "buttons",
          element: yesNoContainer,
          options: ["Yes", "No"],
        };
      }
    }

    // 3. Check for radio button groups
    if (
      fieldEntry.tagName === "FIELDSET" &&
      fieldEntry.querySelector('input[type="radio"]')
    ) {
      const options = this.extractRadioOptions(fieldEntry);
      return {
        type: "radio",
        subType: "group",
        element: fieldEntry,
        options: options,
      };
    }

    // 4. Check for checkbox groups
    if (
      fieldEntry.tagName === "FIELDSET" &&
      fieldEntry.querySelector('input[type="checkbox"]')
    ) {
      const options = this.extractCheckboxOptions(fieldEntry);
      return {
        type: "checkbox",
        subType: "group",
        element: fieldEntry,
        options: options,
      };
    }

    // 5. Check for regular text inputs (INCLUDING TEL TYPE)
    const textInput = fieldEntry.querySelector(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="number"], textarea'
    );
    if (textInput) {
      return {
        type:
          textInput.tagName.toLowerCase() === "textarea"
            ? "textarea"
            : textInput.type === "number"
            ? "number"
            : textInput.type || "text",
        subType: textInput.type || "text",
        element: textInput,
      };
    }

    // 6. Check for file uploads
    const fileInput = fieldEntry.querySelector('input[type="file"]');
    if (fileInput) {
      return {
        type: "file",
        subType: "upload",
        element: fileInput,
      };
    }

    return { type: "unknown", subType: "unknown", element: fieldEntry };
  }

  /**
   * Extract radio button options from fieldset
   */
  extractRadioOptions(fieldset) {
    const options = [];
    const radioContainers = fieldset.querySelectorAll('[class*="_option_"]');

    for (const container of radioContainers) {
      const label = container.querySelector("label");
      if (label) {
        options.push(label.textContent.trim());
      }
    }

    return options;
  }

  /**
   * Extract checkbox options from fieldset
   */
  extractCheckboxOptions(fieldset) {
    const options = [];
    const checkboxContainers = fieldset.querySelectorAll('[class*="_option_"]');

    for (const container of checkboxContainers) {
      const label = container.querySelector("label");
      if (label) {
        options.push(label.textContent.trim());
      }
    }

    return options;
  }

  /**
   * Check if Ashby field is required
   */
  isAshbyFieldRequired(fieldEntry, labelElement) {
    // Check for required class on label
    if (Array.from(labelElement.classList).some(c => c.includes('_required_'))) {
      return true;
    }

    // Check for asterisk in label text
    if (labelElement.textContent.includes("*")) {
      return true;
    }

    // Check for required attribute on input
    const input = fieldEntry.querySelector("input, textarea");
    if (
      input &&
      (input.required || input.getAttribute("aria-required") === "true")
    ) {
      return true;
    }

    return false;
  }

  /**
   * Fill form field based on type using extractor data structure
   */
  async fillAshbyFieldFromExtractor(fieldInfo, answer) {
    try {
      let success = false;

      // Find the DOM element for this field using the extractor's field identification
      const fieldElement = this.findFieldElementFromExtractor(fieldInfo);
      if (!fieldElement) {
        return false;
      }

      // Create a compatible field info object for existing methods
      const compatibleFieldInfo = {
        element: fieldElement,
        label: fieldInfo.label,
        type: fieldInfo.type,
        subType: fieldInfo.subType || fieldInfo.type,
        required: fieldInfo.required,
        options: fieldInfo.options ? fieldInfo.options.map(opt => opt.label || opt) : []
      };

      switch (fieldInfo.type) {
        case "number":
          success = await this.fillNumberInput(
            fieldElement.querySelector("input"),
            answer
          );
          break;
        case "text":
        case "tel":
        case "email":
        case "url":
        case "system-field": // Handle system fields like name, email
          success = await this.fillTextInput(compatibleFieldInfo, answer);
          break;
        case "tel-with-consent":
          success = await this.fillPhoneWithConsent(fieldElement, fieldInfo, answer);
          break;
        case "textarea":
          success = await this.fillTextareaInput(compatibleFieldInfo, answer);
          break;
        case "autocomplete":
          success = await this.fillAutocompleteField(compatibleFieldInfo, answer);
          break;
        case "yesno":
        case "radio-button-group":
          success = await this.fillRadioGroupFromExtractor(fieldElement, fieldInfo, answer);
          break;
        case "radio-group":
          success = await this.fillRadioGroupFromExtractor(fieldElement, fieldInfo, answer);
          break;
        case "checkbox-group":
        case "checkbox":
          success = await this.fillCheckboxGroupFromExtractor(fieldElement, fieldInfo, answer);
          break;
        case "file":
          // Handle file uploads - for now skip, but could be enhanced
          if (fieldInfo.isSystemField && fieldInfo.label.toLowerCase().includes('resume')) {
            // System resume field - skip for now as file uploads are complex
            success = true;
          } else {
            success = true; // Skip other file uploads
          }
          break;
        default:
          // Try the fallback method for unknown types
          success = await this.fillAshbyField(compatibleFieldInfo, answer);
      }

      return success;
    } catch (error) {
      return false;
    }
  }

  /**
   * Fill phone number field with consent radio buttons
   */
  async fillPhoneWithConsent(fieldElement, fieldInfo, answer) {
    try {
      let success = false;
      
      // For phone fields, the AI should return just the phone number as a string
      // We'll handle consent separately with a default or user preference
      let phoneNumber = '';
      
      if (typeof answer === 'object' && answer !== null) {
        phoneNumber = answer.phone || '';
      } else {
        phoneNumber = answer;
      }
      
      // Fill the phone number input
      if (phoneNumber) {
        const telInput = fieldElement.querySelector('input[type="tel"]');
        if (telInput) {
          const phoneSuccess = await this.fillTextInput({
            element: telInput,
            label: fieldInfo.label,
            type: 'tel'
          }, phoneNumber);
          success = phoneSuccess;
          
          // After filling phone, handle consent with a default "given" value
          // This could be made configurable in the future
          if (phoneSuccess && fieldInfo.consentOptions) {
            await this.fillPhoneConsentRadios(fieldElement, fieldInfo, 'given');
          }
        }
      }
      
      return success;
    } catch (error) {
      return false;
    }
  }

  /**
   * Fill phone consent radio buttons
   */
  async fillPhoneConsentRadios(fieldElement, fieldInfo, consentAnswer) {
    const consentValue = String(consentAnswer).toLowerCase();
    let bestMatch = null;
    let bestScore = 0;

    if (fieldInfo.consentOptions) {
      for (const option of fieldInfo.consentOptions) {
        const optionLabel = String(option.label || option).toLowerCase();
        const optionValue = String(option.value || option).toLowerCase();
        
        let score = 0;
        
        // Check value match first
        if (optionValue === consentValue) {
          score = 100;
        }
        // Check label match
        else if (optionLabel === consentValue) {
          score = 90;
        }
        // Check for partial matches
        else if (optionLabel.includes(consentValue) || consentValue.includes(optionLabel)) {
          score = 70;
        }
        // Special matching for yes/no
        else if ((consentValue === 'yes' || consentValue === 'given') && 
                 (optionLabel.includes('yes') || optionValue === 'given')) {
          score = 95;
        }
        else if ((consentValue === 'no' || consentValue === 'notgiven') && 
                 (optionLabel.includes('no') || optionValue === 'notgiven')) {
          score = 95;
        }
        
        if (score > bestScore) {
          bestMatch = option;
          bestScore = score;
        }
      }
    }

    if (bestMatch) {
      // Find and click the radio button
      const radioElement = fieldElement.querySelector(`input[type="radio"][value="${bestMatch.value}"], input[type="radio"][name="${bestMatch.name}"]`);
      if (radioElement) {
        const label = radioElement.closest('label');
        if (label) {
          this.scrollToElement(label);
          label.click();
          await this.wait(300);
          return true;
        }
        // Fallback to direct radio click
        radioElement.click();
        await this.wait(200);
        return true;
      }
    }

    return false;
  }

  /**
   * Find DOM element for field using extractor information
   */
  findFieldElementFromExtractor(fieldInfo) {
    const closestSelector = '[class*="_fieldEntry_"], .ashby-application-form-field-entry, fieldset';

    // Try to find element by ID first
    if (fieldInfo.id) {
      const element = document.getElementById(fieldInfo.id);
      if (element) {
        return element.closest(closestSelector) || element;
      }
    }

    // Try to find element by name
    if (fieldInfo.name) {
      const element = document.querySelector(`[name="${fieldInfo.name}"]`);
      if (element) {
        return element.closest(closestSelector) || element;
      }
    }

    // Find by label text
    const fieldContainers = document.querySelectorAll(closestSelector);

    for (const container of fieldContainers) {
      const label = container.querySelector('[class*="_heading_"], label, legend');
      if (label) {
        const labelText = label.textContent.trim().replace(/\*$/, '');

        // Try exact match first
        if (labelText === fieldInfo.label) {
          return container;
        }
        // Label now includes description, so also match if DOM label is the prefix
        if (fieldInfo.label.startsWith(labelText)) {
          return container;
        }
        // Try partial match for longer labels
        if (labelText.length > 20 && fieldInfo.label.length > 20) {
          if (labelText.includes(fieldInfo.label.substring(0, 20)) ||
              fieldInfo.label.includes(labelText.substring(0, 20))) {
            return container;
          }
        }
        // Try partial match for shorter labels too
        if (labelText.includes(fieldInfo.label.substring(0, 10)) ||
            fieldInfo.label.includes(labelText.substring(0, 10))) {
          return container;
        }
      }
    }

    // Special handling for system fields
    if (fieldInfo.isSystemField) {
      const systemInput = document.querySelector(`[id*="${fieldInfo.id}"], [name*="${fieldInfo.name}"]`);
      if (systemInput) {
        return systemInput.closest(closestSelector) || systemInput;
      }
    }

    return null;
  }

  /**
   * Fill radio button group using extractor data
   */
  async fillRadioGroupFromExtractor(fieldElement, fieldInfo, value) {
    const valueStr = String(value).toLowerCase();
    let bestMatch = null;
    let bestScore = 0;

    if (fieldInfo.options) {
      for (const option of fieldInfo.options) {
        const optionLabel = String(option.label || option).toLowerCase();
        const score = this.calculateMatchScore(optionLabel, valueStr);
        
        if (score > bestScore) {
          bestMatch = option;
          bestScore = score;
        }
      }
    }

    if (bestMatch) {
      // Try multiple strategies to find the radio element
      let radioElement = null;
      
      // Strategy 1: Find by ID
      if (bestMatch.id) {
        radioElement = fieldElement.querySelector(`[id="${bestMatch.id}"]`);
      }
      
      // Strategy 2: Find by name
      if (!radioElement && bestMatch.name) {
        radioElement = fieldElement.querySelector(`[name="${bestMatch.name}"]`);
      }
      
      // Strategy 3: Find by value
      if (!radioElement && bestMatch.value) {
        radioElement = fieldElement.querySelector(`[value="${bestMatch.value}"]`);
      }
      
      // Strategy 4: Find by label text (for Yes/No button groups)
      if (!radioElement) {
        const buttons = fieldElement.querySelectorAll('button, [role="radio"], input[type="radio"]');
        
        for (const button of buttons) {
          const buttonText = button.textContent.trim().toLowerCase();
          if (buttonText === bestMatch.label.toLowerCase() || 
              buttonText.includes(bestMatch.label.toLowerCase()) ||
              bestMatch.label.toLowerCase().includes(buttonText)) {
            radioElement = button;
            break;
          }
        }
      }
      
      if (radioElement) {
        // For toggle buttons (Yes/No), check if already selected to avoid toggling OFF
        const isAlreadySelected =
          radioElement.getAttribute('aria-pressed') === 'true' ||
          radioElement.classList.contains('_selected_') ||
          radioElement.classList.contains('selected');

        if (isAlreadySelected) {
          return true;
        }

        // For actual radio inputs, check the checked property
        if (radioElement.type === 'radio' && radioElement.checked) {
          return true;
        }

        let clickableElement = radioElement.closest('label') ||
                               fieldElement.querySelector(`label[for="${bestMatch.id}"]`) ||
                               radioElement;

        this.scrollToElement(clickableElement);
        clickableElement.click();
        await this.wait(300);

        return true;
      }
    }

    return false;
  }

  /**
   * Fill checkbox group using extractor data
   */
  async fillCheckboxGroupFromExtractor(fieldElement, fieldInfo, value) {
    let valuesToSelect = [];

    // Handle different answer formats
    if (Array.isArray(value)) {
      valuesToSelect = value.map((v) => String(v).toLowerCase());
    } else if (typeof value === "string" && value.includes(",")) {
      valuesToSelect = value.split(",").map((v) => v.trim().toLowerCase());
    } else {
      valuesToSelect = [String(value).toLowerCase()];
    }

    let selectedCount = 0;

    if (fieldInfo.options) {
      for (const option of fieldInfo.options) {
        const optionLabel = String(option.label || option).toLowerCase();
        
        // Check if this option should be selected
        let shouldSelect = false;
        for (const searchValue of valuesToSelect) {
          if (this.calculateMatchScore(optionLabel, searchValue) > 50) {
            shouldSelect = true;
            break;
          }
        }

        if (shouldSelect) {
          const checkboxElement = fieldElement.querySelector(`[id="${option.id}"], [name="${option.name}"]`);
          if (checkboxElement && !checkboxElement.checked) {
            const label = checkboxElement.closest('label') || fieldElement.querySelector(`label[for="${option.id}"]`);
            if (label) {
              this.scrollToElement(label);
              label.click();
              await this.wait(300);
              if (checkboxElement.checked) {
                selectedCount++;
              }
            }
          }
        }
      }
    }

    return selectedCount > 0;
  }

  /**
   * Fill form field based on type - FIXED with better error handling
   */
  async fillAshbyField(fieldInfo, answer) {
    try {
      let success = false;

      switch (fieldInfo.type) {
        case "number":
          success = await this.fillNumberInput(
            fieldInfo.element.querySelector("input"),
            answer
          );
          break;
        case "text":
        case "tel":
        case "email":
        case "url":
          success = await this.fillTextInput(fieldInfo, answer);
          break;
        case "textarea":
          success = await this.fillTextareaInput(fieldInfo, answer);
          break;
        case "autocomplete":
          success = await this.fillAutocompleteField(fieldInfo, answer);
          break;
        case "yesno":
          success = await this.fillYesNoField(fieldInfo, answer);
          break;
        case "radio":
          success = await this.fillRadioGroup(fieldInfo, answer);
          break;
        case "checkbox":
          success = await this.fillCheckboxGroup(fieldInfo, answer);
          break;
        case "file":
          success = true;
          break;
        default:
          success = false;
      }

      return success;
    } catch (error) {
      return false;
    }
  }

  /**
   * Fill text input field - FIXED VERSION
   */
  async fillTextInput(fieldInfo, value) {
    const input =
      fieldInfo.element.querySelector("input, textarea") || fieldInfo.element;

    this.scrollToElement(input);

    // Focus without triggering potential form resets
    input.focus();
    await this.wait(100);

    // Use a more gentle approach to setting values
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    ).set;

    // Clear current value
    nativeInputValueSetter.call(input, "");

    // Set new value
    nativeInputValueSetter.call(input, String(value));

    // Dispatch only necessary events - avoid blur which can cause resets
    const inputEvent = new Event("input", { bubbles: true, cancelable: true });
    const changeEvent = new Event("change", {
      bubbles: true,
      cancelable: true,
    });

    input.dispatchEvent(inputEvent);
    await this.wait(50);
    input.dispatchEvent(changeEvent);

    await this.wait(200);
    return true;
  }

  /**
   * Fill autocomplete field (Location, How you heard)
   */
  async fillAutocompleteField(fieldInfo, value) {
    const input =
      fieldInfo.element.querySelector('input[role="combobox"]') ||
      fieldInfo.element.querySelector('input[placeholder="Start typing..."]');

    if (!input) {
      return false;
    }

    this.scrollToElement(input);
    input.focus();
    await this.wait(200);

    // Determine search value based on field type
    let searchValue = String(value);
    let isHowDidYouHear = fieldInfo.label
      .toLowerCase()
      .includes("how did you hear");
    let isLocationField = this.isLocationField(fieldInfo.label);

    if (isHowDidYouHear) {
      searchValue = "LinkedIn";
    }

    // Clear and start typing
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    ).set;

    // Clear the input
    nativeInputValueSetter.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await this.wait(150);

    let stopAtChar = searchValue.length;

    if (isLocationField) {
      stopAtChar = Math.min(10, searchValue.length);
    } else if (!isHowDidYouHear) {
      stopAtChar = Math.min(4, searchValue.length);
    }

    let actualTypedValue = "";

    for (let i = 0; i < stopAtChar; i++) {
      const currentValue = searchValue.substring(0, i + 1);
      actualTypedValue = currentValue;

      input.value = currentValue;

      const keydownEvent = new KeyboardEvent("keydown", {
        key: searchValue[i],
        code: `Key${searchValue[i].toUpperCase()}`,
        bubbles: true,
        cancelable: true,
      });

      const keyupEvent = new KeyboardEvent("keyup", {
        key: searchValue[i],
        code: `Key${searchValue[i].toUpperCase()}`,
        bubbles: true,
        cancelable: true,
      });

      const inputEvent = new Event("input", { bubbles: true });

      input.dispatchEvent(keydownEvent);
      input.dispatchEvent(inputEvent);
      input.dispatchEvent(keyupEvent);

      await this.wait(500);

      if (!isHowDidYouHear && i >= (isLocationField ? 9 : 3)) {
        const resultsContainer = document.querySelector(
          '[class*="_resultContainer_"]'
        );
        if (
          resultsContainer &&
          resultsContainer.querySelectorAll('[role="option"]').length > 0
        ) {
          break;
        }
      }
    }

    await this.wait(1200);

    const resultsContainer = document.querySelector(
      '[class*="_resultContainer_"]'
    );

    return await this.selectFromAutocompleteOptions(
      resultsContainer,
      actualTypedValue,
      isHowDidYouHear,
      isLocationField
    );
  }

  async selectFromAutocompleteOptions(
    resultsContainer,
    searchValue,
    isHowDidYouHear,
    isLocationField
  ) {
    const options = resultsContainer.querySelectorAll('[role="option"]');

    if (options.length === 0) {
      return false;
    }

    let bestMatch = null;
    let bestScore = 0;
    const searchValueLower = searchValue.toLowerCase();

    for (const option of options) {
      const optionText = option.textContent.trim().toLowerCase();
      let score = 0;

      if (optionText === searchValueLower) {
        bestMatch = option;
        bestScore = 100;
        break;
      }

      if (
        isHowDidYouHear &&
        searchValueLower === "linkedin" &&
        optionText.includes("linkedin")
      ) {
        bestMatch = option;
        bestScore = 95;
        break;
      }

      if (isLocationField) {
        const searchParts = searchValueLower
          .split(/[,\s]+/)
          .filter((part) => part.length > 0);
        let locationScore = 0;
        let matchedParts = 0;

        for (const part of searchParts) {
          if (optionText.includes(part)) {
            matchedParts++;
            if (optionText.startsWith(part)) {
              locationScore += 20;
            } else {
              locationScore += 10;
            }
          }
        }

        if (matchedParts === searchParts.length) {
          locationScore += 30;
        }
        if (matchedParts === searchParts.length) {
          locationScore += 30;
        }

        score = locationScore;
      } else {
        if (optionText.startsWith(searchValueLower)) {
          score = 80;
        } else if (optionText.includes(searchValueLower)) {
          score = 60;
        } else if (searchValueLower.includes(optionText)) {
          score = 40;
        }
      }

      if (score > bestScore) {
        bestMatch = option;
        bestScore = score;
      }
    }

    if (bestMatch) {
      const selectedText = bestMatch.textContent.trim();

      this.scrollToElement(bestMatch);
      await this.wait(200);

      try {
        const expectedText = bestMatch.textContent.trim();

        bestMatch.scrollIntoView({ behavior: "smooth", block: "nearest" });
        await this.wait(200);

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

        bestMatch.dispatchEvent(syntheticMouseDown);
        await this.wait(50);
        bestMatch.dispatchEvent(syntheticMouseUp);
        await this.wait(50);
        bestMatch.dispatchEvent(syntheticClick);
        await this.wait(500);

        if (
          input &&
          (input.value.trim() === expectedText ||
            input.value.includes(selectedText.split(",")[0]))
        ) {
          return true;
        }

        if (bestMatch.tabIndex !== undefined) {
          bestMatch.tabIndex = 0;
        }
        bestMatch.focus();
        await this.wait(100);

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

        if (
          input &&
          (input.value.trim() === expectedText ||
            input.value.includes(selectedText.split(",")[0]))
        ) {
          return true;
        }

        const clickHandler = bestMatch.onclick;
        if (clickHandler) {
          clickHandler.call(bestMatch, syntheticClick);
          await this.wait(500);

          if (
            input &&
            (input.value.trim() === expectedText ||
              input.value.includes(selectedText.split(",")[0]))
          ) {
            return true;
          }
        }

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
        if (
          input &&
          (input.value.trim() === expectedText ||
            input.value.includes(selectedText.split(",")[0]))
        ) {
          return true;
        }

        if (input) {
          nativeInputValueSetter.call(input, selectedText);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          // Removed blur event as it can cause form resets
        }

        await this.wait(300);

        return true;
      } catch (clickError) {
        return false;
      }
    } else {
      return false;
    }
  }

  /**
   * Open an autocomplete/combobox dropdown and extract its options without selecting anything.
   * Returns an array of option label strings, or [] if none found.
   */
  async extractAutocompleteOptions(fieldElement) {
    const input =
      fieldElement.querySelector('input[role="combobox"]') ||
      fieldElement.querySelector('input[placeholder="Start typing..."]');
    if (!input) return [];

    const toggleButton = fieldElement.querySelector('button[class*="_toggleButton_"], button[class*="_container_pjyt6"]');
    if (toggleButton) {
      toggleButton.click();
    } else {
      input.focus();
    }
    await this.wait(400);

    const listbox = document.querySelector('[role="listbox"]');
    if (!listbox) {
      input.blur();
      await this.wait(200);
      return [];
    }

    const optionElements = listbox.querySelectorAll('[role="option"]');
    const options = [];
    for (const opt of optionElements) {
      const text = opt.textContent.trim();
      if (text) options.push(text);
    }

    // Close the dropdown
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await this.wait(200);

    if (input.getAttribute('aria-expanded') === 'true') {
      input.blur();
      await this.wait(200);
    }

    return options;
  }

  /**
   * Calculate match score for autocomplete options
   */
  calculateMatchScore(option, search) {
    const optionLower = option.toLowerCase();
    const searchLower = search.toLowerCase();

    if (optionLower === searchLower) return 100;
    if (optionLower.startsWith(searchLower)) return 80;
    if (optionLower.includes(searchLower)) return 60;
    if (searchLower.includes(optionLower)) return 40;

    return 0;
  }

  /**
   * Fill Yes/No button field
   */
  async fillYesNoField(fieldInfo, value) {
    const container = fieldInfo.element;
    const valueStr = String(value).toLowerCase();

    const shouldSelectYes =
      valueStr === "yes" ||
      valueStr === "true" ||
      valueStr.includes("yes") ||
      valueStr.includes("authorized") ||
      value === true;

    const buttons = container.querySelectorAll('[class*="_option_"], button');
    let targetButton = null;

    for (const button of buttons) {
      const buttonText = button.textContent.trim().toLowerCase();
      if (
        (shouldSelectYes && buttonText === "yes") ||
        (!shouldSelectYes && buttonText === "no")
      ) {
        targetButton = button;
        break;
      }
    }

    if (targetButton) {
      // Skip if already selected (toggle buttons deselect on re-click)
      const isAlreadySelected =
        targetButton.getAttribute('aria-pressed') === 'true' ||
        targetButton.classList.contains('_selected_') ||
        targetButton.classList.contains('selected');

      if (!isAlreadySelected) {
        this.scrollToElement(targetButton);
        targetButton.click();
        await this.wait(300);
      }
      return true;
    }

    return false;
  }

  /**
   * Fill radio button group - FIXED to ensure actual selection
   */
  async fillRadioGroup(fieldInfo, value) {
    const fieldset = fieldInfo.element;
    const valueStr = String(value).toLowerCase();

    // Find matching option
    const radioContainers = fieldset.querySelectorAll('[class*="_option_"]');
    let bestMatch = null;
    let bestScore = 0;

    for (const container of radioContainers) {
      const label = container.querySelector("label");
      const radio = container.querySelector('input[type="radio"]');

      if (!label || !radio) continue;

      const labelText = label.textContent.trim().toLowerCase();
      const score = this.calculateMatchScore(labelText, valueStr);

      if (score > bestScore) {
        bestMatch = { container, label, radio };
        bestScore = score;
      }
    }

    if (bestMatch) {
      // Check if already selected
      if (!bestMatch.radio.checked) {
        this.scrollToElement(bestMatch.label);

        // Gentle approach: Try label click first (most reliable)
        this.scrollToElement(bestMatch.label);
        bestMatch.label.click();
        await this.wait(300);

        // Verify selection worked
        if (!bestMatch.radio.checked) {
          // Fallback: Direct radio click
          bestMatch.radio.click();
          await this.wait(200);
        }
      }
      return true;
    }

    return false;
  }

  /**
   * Fill checkbox group (can select multiple) - FIXED to ensure actual selection
   */
  async fillCheckboxGroup(fieldInfo, value) {
    const fieldset = fieldInfo.element;
    let valuesToSelect = [];

    // Handle different answer formats
    if (Array.isArray(value)) {
      valuesToSelect = value.map((v) => String(v).toLowerCase());
    } else if (typeof value === "string" && value.includes(",")) {
      valuesToSelect = value.split(",").map((v) => v.trim().toLowerCase());
    } else {
      valuesToSelect = [String(value).toLowerCase()];
    }

    const checkboxContainers = fieldset.querySelectorAll('[class*="_option_"]');
    let selectedCount = 0;

    for (const container of checkboxContainers) {
      const label = container.querySelector("label");
      const checkbox = container.querySelector('input[type="checkbox"]');

      if (!label || !checkbox) continue;

      const labelText = label.textContent.trim().toLowerCase();

      // Check if this option should be selected
      let shouldSelect = false;
      for (const searchValue of valuesToSelect) {
        if (this.calculateMatchScore(labelText, searchValue) > 50) {
          shouldSelect = true;
          break;
        }
      }

      // Handle special cases
      if (!shouldSelect) {
        if (
          valuesToSelect.includes("prefer not to answer") ||
          valuesToSelect.includes("no") ||
          valuesToSelect.includes("none") ||
          valuesToSelect.includes("none of the above")
        ) {
          if (
            labelText.includes("prefer not to") ||
            labelText.includes("not to answer") ||
            labelText.includes("none of the above")
          ) {
            shouldSelect = true;
          }
        }
      }

      if (shouldSelect && !checkbox.checked) {
        this.scrollToElement(label);

        // Gentle approach: Try label click first (most reliable for checkboxes)
        this.scrollToElement(label);
        label.click();
        await this.wait(300);

        // Verify selection worked
        if (checkbox.checked) {
          selectedCount++;
        } else {
          // Fallback: Direct checkbox click
          checkbox.click();
          await this.wait(200);
          if (checkbox.checked) {
            selectedCount++;
          }
        }
      } else if (checkbox.checked && shouldSelect) {
        // Already checked and should be checked
        selectedCount++;
      }
    }

    if (selectedCount > 0) {
      return true;
    } else {
      return false;
    }
  }

  /**
   * Get user location data for Location fields
   */
  getUserLocationData() {
    const userData = this.userData;

    // Try different location combinations
    let location = "";

    // Method 1: Use streetAddress if available
    if (userData.streetAddress) {
      location = userData.streetAddress;
      return location;
    }

    // Method 2: Combine city, state, country
    const parts = [];
    if (userData.city) parts.push(userData.city);
    if (userData.state) parts.push(userData.state);
    if (userData.country && userData.country !== "United States") {
      parts.push(userData.country);
    }

    if (parts.length > 0) {
      location = parts.join(", ");
      return location;
    }

    // Method 3: State and country only
    if (userData.state) {
      location = userData.state;
      if (userData.country && userData.country !== "United States") {
        location += ", " + userData.country;
      }
      return location;
    }

    // Method 4: Country only
    if (userData.country) {
      location = userData.country;
      return location;
    }

    return "";
  }

  /**
   * Check if field is a location field that should use user data
   */
  isLocationField(label) {
    const locationPatterns = [
      /location.*state/i,
      /state.*location/i,
      /current.*location/i,
      /where.*located/i,
      /city.*state/i,
      /state.*city/i,
      /^location$/i, // ← More specific - exact match only
      /physical.*address/i, // ← More specific than just "address"
      /mailing.*address/i, // ← More specific
      /street.*address/i, // ← More specific
      /home.*address/i, // ← More specific
      /where.*live/i,
      /residence/i,
      /geographic/i,
      /city.*country/i,
    ];

    // Exclude email-related fields explicitly
    const emailPatterns = [/email/i, /e-mail/i, /@/];

    const isEmail = emailPatterns.some((pattern) => pattern.test(label));
    if (isEmail) return false;

    const isLocation = locationPatterns.some((pattern) => pattern.test(label));
    return isLocation;
  }

  /**
   * Fill form with user profile data using AI
   */
  async fillFormWithProfile(profile) {
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

      this.fillInProgress = true;
      this.lastFillTime = now;

      this.userData = profile;

      const extractor = new AshbyFormFieldExtractor();
      const formFields = extractor.extractAllFormFields();
      console.log("📋 Extracted form fields:", formFields);

      let filledCount = 0;

      for (const field of formFields) {
        if (!field.label || field.type === "file") continue;
        if (field.label.trim() === "Other") continue;

        // Skip fields that already have a value in the DOM
        if (this.fieldAlreadyHasValue(field)) continue;

        try {
          const fieldContext = this.buildFieldContextFromExtractor(field);
          let answer;

          // Special handling for "How did you hear" field
          if (field.label.toLowerCase().includes("how did you hear")) {
            answer = "LinkedIn";
          }
          // Special handling for Location fields - use user data directly
          // Only for text/autocomplete inputs, not checkbox/radio groups with location options
          else if (this.isLocationField(field.label) && field.type !== "checkbox-group" && field.type !== "checkbox" && field.type !== "radio-group" && field.type !== "radio") {
            answer = this.getUserLocationData();
          } else {
            // Extract option labels for AI service (simple array of strings)
            let optionsForAI = [];
            if (field.options && field.options.length > 0) {
              optionsForAI = field.options.map(opt => opt.label);
            }

            // For autocomplete fields with no pre-extracted options, open the dropdown to get them
            if (field.type === "autocomplete" && optionsForAI.length === 0) {
              const fieldElement = this.findFieldElementFromExtractor(field);
              if (fieldElement) {
                optionsForAI = await this.extractAutocompleteOptions(fieldElement);
              }
            }

            answer = await this.getAIAnswer(
              field.label,
              optionsForAI,
              field.type,
              fieldContext
            );
          }

          if (answer) {
            const success = await this.fillAshbyFieldFromExtractor(field, answer);
            if (success) filledCount++;
          }

          await this.wait(500);
        } catch (fieldError) {
          console.warn(`⚠️ Error processing field "${field.label}":`, fieldError.message);
          continue;
        }
      }

      console.log(`✅ Filled ${filledCount} fields total`);
      this.processedForms.add(formId);

      return true;
    } catch (error) {
      console.error("❌ fillFormWithProfile error:", error);
      return false;
    } finally {
      this.fillInProgress = false;
    }
  }

  /**
   * Check if a field already has a value in the DOM (pre-filled by Ashby)
   */
  fieldAlreadyHasValue(field) {
    try {
      const el = this.findFieldElementFromExtractor(field);
      if (!el) return false;

      const type = field.type;

      if (type === "text" || type === "email" || type === "tel" || type === "url" || type === "number" || type === "system-field") {
        const input = el.querySelector("input");
        return input && input.value && input.value.trim().length > 0;
      }

      if (type === "textarea") {
        const textarea = el.querySelector("textarea");
        return textarea && textarea.value && textarea.value.trim().length > 0;
      }

      if (type === "yesno" || type === "radio-button-group" || type === "radio-group") {
        const selected = el.querySelector('[aria-pressed="true"], input[type="radio"]:checked, [class*="_selected_"]');
        return !!selected;
      }

      if (type === "checkbox-group" || type === "checkbox") {
        const checked = el.querySelector('input[type="checkbox"]:checked');
        return !!checked;
      }

      if (type === "autocomplete") {
        const input = el.querySelector('input[role="combobox"]') || el.querySelector("input");
        return input && input.value && input.value.trim().length > 0;
      }

      return false;
    } catch {
      return false;
    }
  }

  async fillNumberInput(input, value) {
    try {
      // Validate input element
      if (!input || input.type !== "number") {
        return false;
      }

      // Validate and clean the numeric value
      if (value === null || value === undefined || value === "") {
        return false;
        return false;
      }

      // Convert to number
      const stringValue = String(value).replace(/[$,\s]/g, "");
      const numericValue = parseFloat(stringValue);

      // Validate the number
      if (isNaN(numericValue) || !isFinite(numericValue)) {
        return false;
      }

      // Check if number is reasonable (positive)
      if (numericValue <= 0) {
        return false;
        return false;
      }

      // Clear any existing value first
      input.value = "";
      input.focus();
      await this.wait(50);

      // Set the validated numeric value
      input.value = numericValue.toString();

      // Dispatch events for number inputs
      const inputEvent = new Event("input", {
        bubbles: true,
        cancelable: true,
      });
      const changeEvent = new Event("change", {
        bubbles: true,
        cancelable: true,
      });

      input.dispatchEvent(inputEvent);
      await this.wait(50);
      input.dispatchEvent(changeEvent);

      // Verify the value was set correctly
      const finalValue = input.value;
      if (finalValue && !isNaN(parseFloat(finalValue))) {
        return true;
      } else {
        return false;
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
      const formFields = this.getAllFormFields();
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
      const formFields = this.getAllFormFields();
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
          const checkedRadio = field.element.querySelector(
            'input[type="radio"]:checked'
          );
          if (checkedRadio) {
            filledCount++;
          }
        } else if (field.type === "checkbox") {
          const checkedBoxes = field.element.querySelectorAll(
            'input[type="checkbox"]:checked'
          );
          if (checkedBoxes.length > 0) {
            filledCount++;
          }
        }
      }

      const fillRatio = totalTextFields > 0 ? filledCount / totalTextFields : 0;
      const isAlreadyFilled = fillRatio > 0.5;

      return isAlreadyFilled;
    } catch (error) {
      return false;
    }
  }

  /**
   * Build context for AI about the field from extractor data
   */
  buildFieldContextFromExtractor(field) {
    let context = `This is a ${field.type} field`;

    if (field.required) {
      context += " (required)";
    }

    // Add specific formatting instructions for date fields
    if (field.type === "date") {
      context +=
        " requiring YYYY-MM-DD format. Provide dates like '2024-01-15', not relative terms like '2months' or '1 year ago'";
    }

    if (field.options && field.options.length > 0) {
      // Extract just the labels for the AI context
      const optionLabels = field.options.map(opt => opt.label);
      context += `. Available options: ${optionLabels.join(", ")}`;
    }
    // Note: For tel-with-consent fields, we don't include consent options in AI context
    // The phone number should be treated as a regular tel input

    if (field.subType) {
      context += `. Field subtype: ${field.subType}`;
    }

    if (field.placeholder) {
      context += `. Placeholder text: "${field.placeholder}"`;
    }

    if (field.constraints && Object.keys(field.constraints).length > 0) {
      context += `. Constraints: ${JSON.stringify(field.constraints)}`;
    }

    return context;
  }

  /**
   * Build context for AI about the field
   */
  buildFieldContext(field) {
    let context = `This is a ${field.type} field`;

    if (field.required) {
      context += " (required)";
    }

    // Add specific formatting instructions for date fields
    if (field.type === "date") {
      context +=
        " requiring YYYY-MM-DD format. Provide dates like '2024-01-15', not relative terms like '2months' or '1 year ago'";
    }

    if (field.options && field.options.length > 0) {
      context += `. Available options: ${field.options.join(", ")}`;
    }

    if (field.subType) {
      context += `. Field subtype: ${field.subType}`;
    }

    return context;
  }

  /**
   * Get AI answer for a form field using specialized AI service methods (same as Workable/Lever/LinkedIn/Wellfound/Greenhouse)
   */
  async getAIAnswer(
    question,
    options = [],
    fieldType = "text",
    fieldContext = "",
    retryCount = 0
  ) {
    try {
      // Use standardized AI service
      const context = {
        platform: "ashby",
        userData: this.userData,
        jobDescription: this.jobDescription || "",
        fieldType,
        fieldContext,
        required: fieldContext.includes("required"),
      };

      let answer;

      // Use specialized AI service methods based on field type and context (same as other platforms)
      if ((fieldType === "checkbox" || fieldType === "checkbox-group") && options && options.length > 0) {
        answer = await this.aiService.getMultiSelectAnswer(
          question,
          options,
          context
        );
      } else if (options && options.length > 0 && AIResponseUtils.isSalaryField(question)) {
        answer = await this.aiService.getSalaryAnswer(
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
        fieldContext.toLowerCase().includes("why")
      ) {
        answer = await this.aiService.getLongformAnswer(
          question,
          options,
          context
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
          if ((fieldType === "checkbox" || fieldType === "checkbox-group") && options && options.length > 0) {
            retryAnswer = await this.aiService.getMultiSelectAnswer(
              question,
              options,
              retryContext
            );
          } else if (options && options.length > 0 && AIResponseUtils.isSalaryField(question)) {
            retryAnswer = await this.aiService.getSalaryAnswer(
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
            fieldContext.toLowerCase().includes("why")
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

        return null;
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

      return null;
    }
  }

  /**
   * Check if a field is empty/unfilled
   */
  isFieldEmpty(fieldInfo) {
    try {
      switch (fieldInfo.type) {
        case "text":
        case "tel":
        case "email":
        case "number":
        case "textarea":
          const input = fieldInfo.element.querySelector("input, textarea");
          return !input || !input.value || input.value.trim() === "";

        case "autocomplete":
          const autocompleteInput = fieldInfo.element.querySelector(
            'input[role="combobox"], input[placeholder="Start typing..."]'
          );
          return (
            !autocompleteInput ||
            !autocompleteInput.value ||
            autocompleteInput.value.trim() === ""
          );

        case "yesno":
          const selectedYesNo = fieldInfo.element.querySelector(
            "[class*='_option_'][aria-pressed='true'], button[aria-pressed='true']"
          );
          return !selectedYesNo;

        case "radio":
          const checkedRadio = fieldInfo.element.querySelector(
            'input[type="radio"]:checked'
          );
          return !checkedRadio;

        case "checkbox":
          const checkedBoxes = fieldInfo.element.querySelectorAll(
            'input[type="checkbox"]:checked'
          );
          return checkedBoxes.length === 0;

        default:
          return false; // Assume filled for unknown types
      }
    } catch (error) {
      return true; // Assume empty if we can't determine
    }
  }

  /**
   * Submit the form
   */
  async submitForm() {
    try {
      // First, validate and fill all fields
      // const validationSuccess = await this.validateAndFillAllFields();

      // if (!validationSuccess) {
      //   return false;
      // }

      await this.wait(2000);

      let submitButton = document.querySelector(
        ".ashby-application-form-submit-button"
      );

      if (!submitButton) {
        const allButtons = document.querySelectorAll("button");
        for (const btn of allButtons) {
          const spanText = btn.querySelector("span")?.textContent?.trim();
          if (spanText && spanText.includes("Submit Application")) {
            submitButton = btn;
            break;
          }
        }
      }

      if (!submitButton) {
        return false;
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
          if (this.logger && typeof this.logger === "function") {
            this.logger({ type: "SUBMITTING_APPLICATION" });
          }

          return this.clickSubmitButton(submitButton);
        } else if (userAction === "SKIP") {
          return { success: false, reason: "user_skipped" };
        }
      }

      // Auto-pilot mode: submit directly
      return this.clickSubmitButton(submitButton);
    } catch (error) {
      return false;
    }
  }

  /**
   * Click submit button
   */
  async clickSubmitButton(button) {
    if (!this.isElementVisible(button) || button.disabled) {
      return false;
    }

    this.scrollToElement(button);
    await this.wait(500);

    button.click();
    await this.wait(3000);
    return true;
  }

  /**
   * Check if the form was successfully submitted
   */
  checkSubmissionSuccess() {
    try {
      // Look for the specific success container
      const successContainer = document.querySelector(
        '.ashby-application-form-success-container[data-highlight="positive"]'
      );

      if (successContainer) {
        const heading = successContainer.querySelector('h2[class*="_heading_"]');
        if (heading && heading.textContent.trim() === "Success") {
          return true;
        }
      }

      // Alternative check for success elements
      const successElement = document.querySelector(
        '[role="status"][aria-live="polite"] h2:contains("Success")'
      );

      if (successElement) {
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Complete form submission and verify success
   */
  async submitAndVerify() {
    try {
      const submitSuccess = await this.submitForm();
      if (!submitSuccess) {
        return { success: false, message: "Failed to submit form" };
      }

      // Wait for response
      await this.wait(2000);
    } catch (error) {
      return { success: false, message: `Submission error: ${error.message}` };
    }
  }

  /**
   * Utility methods
   */
  cleanLabelText(text) {
    if (!text) return "";
    return text
      .replace(/[*✱]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\(required\)/i, "")
      .replace(/\(optional\)/i, "");
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
      element.scrollIntoView();
    }
  }

  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Reset form handler state (useful for new forms)
   */
  resetState() {
    this.processedForms.clear();
    this.fillInProgress = false;
    this.lastFillTime = 0;
    this.answerCache.clear();
  }

  /**
   * Check if form with current identifier was already processed
   */
  wasFormProcessed() {
    const formId = this.getFormIdentifier();
    return this.processedForms.has(formId);
  }
}
