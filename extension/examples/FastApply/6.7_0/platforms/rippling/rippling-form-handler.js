// platforms/rippling/rippling-form-handler.js
// Rippling ATS form handler - handles field discovery, AI routing, and form filling
// Rippling uses data-testid attributes, custom React select components, and role-based dropdowns

import AIService from "../../services/ai-service.js";
import { notifyStatus } from "../../utils/status-helper.js";
import { AIResponseUtils } from "../../shared/utilities/index.js";

export default class RipplingFormHandler {
  constructor(options = {}) {
    this.host = options.host;
    this.userData = options.userData || {};
    this.jobDescription = options.jobDescription || "";
    this.aiService = new AIService({ apiHost: this.host });
    this.answerCache = new Map();

    // Co-pilot mode properties
    this.copilotMode = options.copilotMode || false;
    this.copilotState = options.copilotState;
    this.currentJobTitle = "";
    this.userActionPromise = null;
    this.userActionResolver = null;
  }

  // ========================================
  // CO-PILOT USER ACTION HANDLING
  // ========================================

  waitForUserAction() {
    if (this.userActionPromise) {
      return this.userActionPromise;
    }
    this.userActionPromise = new Promise((resolve) => {
      this.userActionResolver = resolve;
    });
    return this.userActionPromise;
  }

  resolveUserAction(action) {
    if (this.userActionResolver) {
      this.userActionResolver(action);
      this.userActionResolver = null;
      this.userActionPromise = null;
    }
  }

  // ========================================
  // MAIN FORM FILL ENTRY POINT
  // ========================================

  async fillFormWithProfile(form, profile) {
    try {
      this.userData = profile;

      // Step 1: Discover all form fields
      const formFields = await this.getAllRipplingFormFields(form);
      console.log(`📝 Rippling: Found ${formFields.length} form fields`);

      let filledCount = 0;

      // Step 2: Fill phone field first (special handling)
      await this.fillPhoneField(form, profile);

      // Step 3: Fill each field
      for (const field of formFields) {
        if (this.shouldSkipField(field)) {
          continue;
        }

        try {
          // Security questions get direct answers (no AI needed)
          if (this.isSecurityQuestion(field.label) && field.type === "select") {
            const securityAnswer = this.getSecurityQuestionAnswer(
              field.label,
              field.options
            );
            if (securityAnswer) {
              const success = await this.fillSelectField(
                field.element,
                securityAnswer,
                field.dataTestId
              );
              if (success) filledCount++;
              await this.wait(300);
              continue;
            }
          }

          // Try direct profile answer first (no AI needed)
          const directAnswer = this.getDirectProfileAnswer(
            field.label,
            profile,
            field.options
          );

          let answer;
          if (directAnswer !== null) {
            answer = directAnswer;
            console.log(
              `📝 Direct answer for "${field.label}": ${answer}`
            );
          } else {
            // Get AI answer
            answer = await this.getAIAnswer(
              field.label,
              field.options || [],
              field.type,
              this.buildFieldContext(field)
            );
            console.log(
              `📝 AI answer for "${field.label}" (${field.type}): ${answer}`
            );
          }

          if (answer !== null && answer !== undefined && answer !== "") {
            const answerValue = Array.isArray(answer) ? answer[0] : answer;
            const success = await this.fillField(
              field,
              answerValue,
              field.type,
              field.options
            );
            if (success) filledCount++;
          }

          await this.wait(300);
        } catch (fieldError) {
          console.error(
            `❌ Error filling field ${field.label}:`,
            fieldError
          );
        }
      }

      // Step 4: Handle required checkboxes
      await this.handleRequiredCheckboxes(form);

      // Step 5: Re-scan for dynamically revealed fields
      await this.wait(500);
      const newFields = await this.getAllRipplingFormFields(form);
      const existingLabels = new Set(formFields.map((f) => f.label));
      const dynamicFields = newFields.filter(
        (f) => !existingLabels.has(f.label)
      );

      if (dynamicFields.length > 0) {
        console.log(
          `📝 Found ${dynamicFields.length} dynamically revealed fields`
        );
        for (const field of dynamicFields) {
          if (this.shouldSkipField(field)) continue;

          try {
            const directAnswer = this.getDirectProfileAnswer(
              field.label,
              profile,
              field.options
            );

            let answer;
            if (directAnswer !== null) {
              answer = directAnswer;
            } else {
              answer = await this.getAIAnswer(
                field.label,
                field.options || [],
                field.type,
                this.buildFieldContext(field)
              );
            }

            if (answer !== null && answer !== undefined && answer !== "") {
              const answerValue = Array.isArray(answer) ? answer[0] : answer;
              await this.fillField(field, answerValue, field.type, field.options);
            }

            await this.wait(300);
          } catch (fieldError) {
            console.error(
              `❌ Error filling dynamic field ${field.label}:`,
              fieldError
            );
          }
        }
      }

      console.log(`✅ Rippling form filling complete. Filled ${filledCount} fields`);
      return filledCount > 0;
    } catch (error) {
      console.error("❌ Error in fillFormWithProfile:", error);
      return false;
    }
  }

  // ========================================
  // FIELD DISCOVERY
  // ========================================

  async getAllRipplingFormFields(form) {
    const fields = [];
    const processedLabels = new Set();
    const processedDataTestIds = new Set();

    // Process [data-testid="field"] containers
    const fieldContainers = form.querySelectorAll('[data-testid="field"]');
    for (let index = 0; index < fieldContainers.length; index++) {
      const container = fieldContainers[index];
      const label = this.getLabelText(container);
      if (!label || processedLabels.has(label)) continue;

      const type = this.detectFieldType(container);
      const input = container.querySelector(
        "input, textarea, [role='combobox']"
      );

      let dataTestId = this.getDataTestId(container, input);

      // Skip duplicate dataTestIds
      if (dataTestId && processedDataTestIds.has(dataTestId)) continue;
      if (dataTestId) processedDataTestIds.add(dataTestId);

      processedLabels.add(label);

      // Extract options for select/radio fields BEFORE AI call
      let options = [];
      if (type === "select" && dataTestId) {
        options = await this.extractSelectOptions(container, dataTestId);
      } else if (type === "radio") {
        options = this.extractRadioOptions(container);
      }

      fields.push({
        element: input || container,
        container,
        label,
        type,
        required: this.isRequired(container),
        dataTestId,
        options,
        isCustomQuestion: false,
        isEEOC: false,
      });
    }

    // Process custom questions (.marginY--36 containers)
    const customQuestionDivs = form.querySelectorAll(".marginY--36");
    for (let index = 0; index < customQuestionDivs.length; index++) {
      const div = customQuestionDivs[index];
      const questionP = div.querySelector('p[class*="edalr1o0"]');
      if (!questionP) continue;

      const label = questionP.textContent?.replace(/[*]/g, "").trim() || "";
      if (!label || processedLabels.has(label)) continue;

      const type = this.detectFieldType(div);
      const input = div.querySelector("input, textarea, [role='combobox']");

      let dataTestId = "";
      const testIdEl = div.querySelector('[data-testid^="customQuestions"]');
      if (testIdEl) {
        dataTestId = testIdEl.getAttribute("data-testid") || "";
      } else if (input) {
        dataTestId = input.getAttribute("data-testid") || "";
      }

      if (dataTestId && processedDataTestIds.has(dataTestId)) continue;
      if (dataTestId) processedDataTestIds.add(dataTestId);

      processedLabels.add(label);

      let options = [];
      if (type === "select" && dataTestId) {
        options = await this.extractSelectOptions(div, dataTestId);
      } else if (type === "radio") {
        options = this.extractRadioOptions(div);
      }

      fields.push({
        element: input || div,
        container: div,
        label,
        type,
        required:
          questionP.querySelector('div[class*="18yxg8r"]') !== null,
        dataTestId,
        options,
        isCustomQuestion: true,
        isEEOC: false,
      });
    }

    // Process EEOC fields
    const eeocFields = form.querySelectorAll('[data-testid^="eeoc"]');
    for (const el of eeocFields) {
      const container = el.closest('[data-testid="field"]');
      if (!container) continue;

      const label = this.getLabelText(container);
      if (!label || processedLabels.has(label)) continue;

      const dataTestId = el.getAttribute("data-testid") || "";
      if (dataTestId && processedDataTestIds.has(dataTestId)) continue;
      if (dataTestId) processedDataTestIds.add(dataTestId);

      processedLabels.add(label);

      let options = [];
      if (dataTestId) {
        options = await this.extractSelectOptions(container, dataTestId);
      }

      fields.push({
        element: el,
        container,
        label,
        type: "select",
        required: false,
        dataTestId,
        options,
        isCustomQuestion: false,
        isEEOC: true,
      });
    }

    return fields;
  }

  // ========================================
  // LABEL & TYPE DETECTION
  // ========================================

  getLabelText(container) {
    // Try Rippling label spans
    const labelSpan = container.querySelector(
      '[class*="eun831x3"], .css-191zjzq, .css-1xdhyk6'
    );
    if (labelSpan) {
      const text = labelSpan.textContent?.replace(/[*]/g, "").trim();
      if (text && text.length > 0) return text;
    }

    // Try aria-labelledby
    const input = container.querySelector(
      "input, textarea, select, [role='combobox']"
    );
    if (input) {
      const labelId = input.getAttribute("aria-labelledby");
      if (labelId) {
        const label = document.getElementById(labelId);
        if (label) {
          const text = label.textContent?.replace(/[*]/g, "").trim();
          if (text && text.length > 0) return text;
        }
      }
    }

    // Try paragraph labels
    const parentP = container.querySelector('p[class*="edalr1o0"]');
    if (parentP) {
      const text = parentP.textContent?.replace(/[*]/g, "").trim();
      if (text && text.length > 0) return text;
    }

    // Special data-testid based detection
    if (container.querySelector('[data-testid="location"]')) return "Location";
    if (container.querySelector('[data-testid*="phone"]'))
      return "Phone number";

    return "";
  }

  detectFieldType(container) {
    if (
      container.querySelector('input[type="file"]') ||
      container.querySelector('[data-testid*="resume"]') ||
      container.querySelector('[data-testid*="cover_letter"]')
    ) {
      return "file";
    }
    if (container.querySelector('[data-testid*="phone"]')) return "tel";
    if (container.querySelector('[data-testid="location"]'))
      return "autocomplete";

    // Date field with separate MM/DD/YYYY inputs
    if (
      container.querySelector('[data-testid="input-month"]') ||
      container.querySelector('[data-input="month"]') ||
      (container.querySelector('[data-testid="month"]') &&
        container.querySelector('[data-testid="day"]') &&
        container.querySelector('[data-testid="year"]'))
    ) {
      return "date";
    }

    if (
      container.querySelector('[role="radiogroup"]') ||
      container.querySelectorAll('input[type="radio"]').length > 1
    ) {
      return "radio";
    }
    if (container.querySelector('input[type="radio"]')) return "radio";
    if (
      container.querySelector('[data-testid="select-controller"]') ||
      container.querySelector('[role="combobox"][aria-haspopup="listbox"]')
    ) {
      return "select";
    }
    if (container.querySelector("textarea")) return "textarea";
    if (container.querySelector('input[type="checkbox"]')) return "checkbox";

    const input = container.querySelector("input");
    if (input) {
      const testId = input.getAttribute("data-testid") || "";
      if (testId.includes("email")) return "email";
      if (
        testId.includes("linkedin") ||
        testId.includes("url") ||
        testId.includes("website")
      )
        return "url";
    }

    return "text";
  }

  isRequired(container) {
    if (container.querySelector('.css-1av554z, [class*="required"]'))
      return true;
    const input = container.querySelector("input, textarea, select");
    return (
      input?.hasAttribute("required") ||
      input?.getAttribute("aria-required") === "true"
    );
  }

  getDataTestId(container, input) {
    const testIdEl = container.querySelector(
      '[data-testid^="input-"], [data-testid^="customQuestions"], [data-testid^="eeoc"], [data-testid^="checkbox"]'
    );
    if (testIdEl) {
      return testIdEl.getAttribute("data-testid") || "";
    }
    if (input) {
      return (
        input.getAttribute("data-testid") ||
        input.getAttribute("data-input") ||
        ""
      );
    }
    return "";
  }

  // ========================================
  // OPTION EXTRACTION (BEFORE AI CALL)
  // ========================================

  async extractSelectOptions(container, dataTestId) {
    try {
      // Close any open dropdowns first
      document.body.click();
      await this.wait(200);

      // Find the select trigger
      const selectContainer =
        container.querySelector(`[data-testid="${dataTestId}"]`) || container;

      selectContainer.scrollIntoView({ behavior: "smooth", block: "center" });
      await this.wait(200);

      const trigger = selectContainer.querySelector(
        '[role="combobox"], [data-testid="select-controller"]'
      );
      if (!trigger) return [];

      // Click to open dropdown
      trigger.click();
      await this.wait(600);

      // Find listbox
      let listbox = null;
      const controlsId = trigger.getAttribute("aria-controls");
      if (controlsId) {
        listbox = document.getElementById(controlsId);
      }

      if (!listbox) {
        const expandedTrigger = selectContainer.querySelector(
          '[aria-expanded="true"]'
        );
        if (expandedTrigger) {
          const expandedControlsId =
            expandedTrigger.getAttribute("aria-controls");
          if (expandedControlsId) {
            listbox = document.getElementById(expandedControlsId);
          }
        }
      }

      if (!listbox) {
        const allListboxes = document.querySelectorAll('[role="listbox"]');
        for (const lb of allListboxes) {
          const rect = lb.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            listbox = lb;
            break;
          }
        }
      }

      const options = [];
      if (listbox) {
        const opts = listbox.querySelectorAll('[role="option"]');
        for (const opt of opts) {
          const text = opt.textContent?.trim();
          if (text) options.push(text);
        }
      }

      // Close dropdown
      document.body.click();
      await this.wait(200);

      if (options.length > 0) {
        console.log(
          `📋 Extracted ${options.length} options for ${dataTestId}`
        );
      }

      return options;
    } catch (err) {
      console.warn(`Error extracting select options:`, err);
      return [];
    }
  }

  extractRadioOptions(container) {
    const options = [];
    const radioGroup = container.querySelector('[role="radiogroup"]');
    const radios = radioGroup
      ? radioGroup.querySelectorAll('[role="radio"]')
      : container.querySelectorAll('input[type="radio"]');

    for (const radio of radios) {
      let label = radio.getAttribute("aria-label") || "";
      if (!label) {
        const parent = radio.closest('[class*="HStack"], label, div');
        if (parent) {
          const textEl = parent.querySelector("span, p");
          if (textEl) label = textEl.textContent?.trim() || "";
        }
      }
      if (!label && radio.nextElementSibling) {
        label = radio.nextElementSibling.textContent?.trim() || "";
      }
      if (label) options.push(label);
    }

    return options;
  }

  // ========================================
  // FIELD FILLING
  // ========================================

  async fillField(field, value, fieldType, options = []) {
    try {
      if (!value) return false;

      switch (fieldType) {
        case "text":
        case "email":
        case "url":
          return await this.fillTextField(field, String(value));

        case "textarea":
          return await this.fillTextareaField(field, String(value));

        case "select":
          return await this.fillSelectField(
            field.element,
            String(value),
            field.dataTestId
          );

        case "radio":
          return await this.fillRadioField(field, String(value));

        case "checkbox": {
          const shouldCheck =
            String(value).toLowerCase() === "yes" ||
            String(value).toLowerCase() === "true" ||
            value === "1";
          return await this.fillCheckboxField(field, shouldCheck);
        }

        case "autocomplete":
          return await this.fillLocationField(field, String(value));

        case "date":
          return await this.fillDateField(field, String(value));

        default:
          return await this.fillTextField(field, String(value));
      }
    } catch (error) {
      console.error(`Error filling field ${field.label}:`, error);
      return false;
    }
  }

  async fillTextField(field, value) {
    try {
      let input = null;
      const dataTestId = field.dataTestId || "";

      if (dataTestId) {
        input = document.querySelector(
          `input[data-testid="input-${dataTestId.replace("input-", "")}"]`
        );
        if (!input) {
          input = document.querySelector(
            `[data-testid="${dataTestId}"] input`
          );
        }
      }

      if (!input && field.element?.tagName === "INPUT") {
        input = field.element;
      }

      if (!input) {
        input = field.container?.querySelector("input");
      }

      if (!input) return false;

      input.scrollIntoView({ behavior: "smooth", block: "center" });
      input.focus();
      await this.wait(100);

      // Use native setter for React compatibility
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;

      if (nativeSetter) {
        nativeSetter.call(input, "");
      } else {
        input.value = "";
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await this.wait(50);

      if (nativeSetter) {
        nativeSetter.call(input, value);
      } else {
        input.value = value;
      }

      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("blur", { bubbles: true }));

      console.log(`✅ Filled text: ${field.label?.substring(0, 30)}`);
      return true;
    } catch (error) {
      console.error(`Error filling text field ${field.label}:`, error);
      return false;
    }
  }

  async fillTextareaField(field, value) {
    try {
      let textarea = null;
      const dataTestId = field.dataTestId || "";

      if (dataTestId) {
        textarea = document.querySelector(
          `[data-testid="${dataTestId}"] textarea`
        );
      }

      if (!textarea && field.element?.tagName === "TEXTAREA") {
        textarea = field.element;
      }

      if (!textarea) {
        textarea = field.container?.querySelector("textarea");
      }

      if (!textarea) return false;

      textarea.scrollIntoView({ behavior: "smooth", block: "center" });
      textarea.focus();
      await this.wait(100);

      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;

      if (nativeSetter) {
        nativeSetter.call(textarea, value);
      } else {
        textarea.value = value;
      }

      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
      textarea.dispatchEvent(new Event("blur", { bubbles: true }));

      console.log(`✅ Filled textarea: ${field.label?.substring(0, 30)}`);
      return true;
    } catch (error) {
      console.error(`Error filling textarea ${field.label}:`, error);
      return false;
    }
  }

  async fillSelectField(element, answer, dataTestId) {
    try {
      // Close any open dropdowns
      document.body.click();
      await this.wait(300);

      // Find the select container
      let container = null;
      if (dataTestId) {
        container = document.querySelector(
          `[data-testid="${dataTestId}"]`
        );
      }
      if (!container && element) {
        container =
          element.closest('[data-testid="field"]') ||
          element.closest(".marginY--36") ||
          element;
      }
      if (!container) return false;

      container.scrollIntoView({ behavior: "smooth", block: "center" });
      await this.wait(200);

      // Find and click the trigger
      const trigger = container.querySelector(
        '[role="combobox"], [data-testid="select-controller"] [role="combobox"], [data-testid="select-controller"]'
      );
      if (!trigger) return false;

      trigger.click();
      await this.wait(800);

      // Find the listbox
      let listbox = null;
      const controlsId =
        trigger.getAttribute("aria-controls") ||
        trigger.getAttribute("aria-owns");
      if (controlsId) {
        listbox = document.getElementById(controlsId);
      }

      if (!listbox) {
        const expandedTrigger = container.querySelector(
          '[aria-expanded="true"]'
        );
        if (expandedTrigger) {
          const expandedControlsId =
            expandedTrigger.getAttribute("aria-controls");
          if (expandedControlsId) {
            listbox = document.getElementById(expandedControlsId);
          }
        }
      }

      if (!listbox) {
        const allListboxes = document.querySelectorAll('[role="listbox"]');
        for (const lb of allListboxes) {
          const rect = lb.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && rect.top >= 0) {
            listbox = lb;
            break;
          }
        }
      }

      let options;
      if (listbox) {
        options = listbox.querySelectorAll('[role="option"]');
      } else {
        options = document.querySelectorAll('[role="option"]');
      }

      if (!options || options.length === 0) {
        document.body.click();
        return false;
      }

      // Find best matching option
      const answerLower = answer.toLowerCase().trim();
      let bestMatch = null;
      let bestScore = 0;

      for (const opt of options) {
        const text = opt.textContent?.toLowerCase().trim() || "";
        if (!text) continue;

        let score = 0;
        if (text === answerLower) {
          score = 100;
        } else if (text.includes(answerLower)) {
          score = 90;
        } else if (answerLower.includes(text)) {
          score = 80;
        } else if (
          (answerLower.includes("decline") ||
            answerLower.includes("prefer not") ||
            answerLower.includes("do not") ||
            answerLower.includes("choose not") ||
            answerLower.includes("disclose")) &&
          (text.includes("decline") ||
            text.includes("prefer not") ||
            text.includes("do not wish") ||
            text.includes("i do not") ||
            text.includes("choose not") ||
            text.includes("disclose"))
        ) {
          score = 85;
        } else {
          // Word-based matching
          const answerWords = answerLower
            .split(/[\s\-\/]+/)
            .filter((w) => w.length > 2);
          const textWords = text
            .split(/[\s\-\/]+/)
            .filter((w) => w.length > 2);
          let matchedWords = 0;
          for (const word of answerWords) {
            if (
              textWords.some(
                (tw) => tw.includes(word) || word.includes(tw)
              )
            ) {
              matchedWords++;
            }
          }
          if (matchedWords > 0) {
            score = 20 + matchedWords * 15;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = opt;
        }
      }

      if (bestMatch && bestScore >= 20) {
        bestMatch.click();
        console.log(
          `✅ Selected option: ${bestMatch.textContent?.trim()} (score: ${bestScore})`
        );
        await this.wait(300);
        return true;
      }

      // Fallback for EEOC decline patterns
      for (const opt of options) {
        const text = opt.textContent?.toLowerCase().trim() || "";
        if (
          text.includes("decline") ||
          text.includes("prefer not") ||
          text.includes("do not wish") ||
          text.includes("choose not") ||
          text.includes("not to disclose")
        ) {
          opt.click();
          console.log(`✅ Selected EEOC fallback: ${opt.textContent?.trim()}`);
          await this.wait(300);
          return true;
        }
      }

      document.body.click();
      await this.wait(200);
      return false;
    } catch (error) {
      console.error("Error filling select field:", error);
      document.body.click();
      return false;
    }
  }

  async fillRadioField(field, answer) {
    try {
      const container = field.container;
      if (!container) return false;

      const radioGroup = container.querySelector('[role="radiogroup"]');
      const radios = radioGroup
        ? radioGroup.querySelectorAll('[role="radio"]')
        : container.querySelectorAll('input[type="radio"]');

      if (radios.length === 0) return false;

      const answerLower = answer.toLowerCase().trim();

      for (const radio of radios) {
        let radioLabel = radio.getAttribute("aria-label") || "";

        if (!radioLabel) {
          const parent = radio.closest('[class*="HStack"], label, div');
          if (parent) {
            const textEl = parent.querySelector("span, p");
            if (textEl) radioLabel = textEl.textContent?.trim() || "";
          }
        }

        if (!radioLabel && radio.nextElementSibling) {
          radioLabel = radio.nextElementSibling.textContent?.trim() || "";
        }

        const labelLower = radioLabel.toLowerCase();

        if (
          labelLower === answerLower ||
          labelLower.includes(answerLower) ||
          answerLower.includes(labelLower)
        ) {
          radio.click();
          console.log(`✅ Selected radio: ${radioLabel}`);
          await this.wait(300);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error("Error filling radio field:", error);
      return false;
    }
  }

  async fillCheckboxField(field, shouldCheck) {
    try {
      let checkbox = null;
      const dataTestId = field.dataTestId || "";

      if (dataTestId) {
        checkbox = document.querySelector(
          `input[data-testid="${dataTestId}"]`
        );
        if (!checkbox) {
          checkbox = document.querySelector(
            `[data-testid="${dataTestId}"] input[type="checkbox"]`
          );
        }
      }

      if (!checkbox) {
        checkbox = field.container?.querySelector('input[type="checkbox"]');
      }

      if (!checkbox) return false;

      if (checkbox.checked !== shouldCheck) {
        checkbox.click();
        await this.wait(200);
      }

      return true;
    } catch (error) {
      console.error("Error filling checkbox:", error);
      return false;
    }
  }

  async fillLocationField(field, value) {
    try {
      const container =
        field.container?.querySelector('[data-testid="location"]') ||
        field.container;
      if (!container) return false;

      const input = container.querySelector("input");
      if (!input) return false;

      input.scrollIntoView({ behavior: "smooth", block: "center" });
      await this.wait(300);

      // Focus and activate
      input.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true })
      );
      await this.wait(50);
      input.focus();
      await this.wait(50);
      input.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, cancelable: true })
      );
      await this.wait(50);
      input.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
      await this.wait(300);

      // Clear existing value
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await this.wait(200);

      // Type only first 4 characters to trigger autocomplete
      const cityName = value.split(",")[0].trim();
      const charsToType = Math.min(4, cityName.length);

      for (let i = 0; i < charsToType; i++) {
        const char = cityName[i];

        input.value = cityName.substring(0, i + 1);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: char,
            bubbles: true,
            cancelable: true,
          })
        );

        await this.wait(150);
      }

      // Wait for dropdown to appear
      await this.wait(1000);

      // Try to find and click matching option
      const optionElements = document.querySelectorAll(
        '[data-testid="popper"] [role="option"], [role="listbox"] [role="option"]'
      );

      if (optionElements.length > 0) {
        const searchLower = value.toLowerCase();
        const cityLower = cityName.toLowerCase();

        let bestMatch = null;
        let bestScore = 0;

        for (const opt of optionElements) {
          if (!this.isElementVisible(opt)) continue;
          const labelEl = opt.querySelector(
            '[data-testid="menuListLabel"] p'
          );
          const text = (
            labelEl?.textContent ||
            opt.textContent ||
            ""
          )
            .toLowerCase()
            .trim();
          if (!text || text.length < 3) continue;

          let score = 0;
          if (text === searchLower) score = 100;
          else if (text.startsWith(cityLower)) score = 95;
          else if (text.includes(cityLower)) score = 85;

          if (score > bestScore) {
            bestScore = score;
            bestMatch = opt;
          }
        }

        // If no match, select first valid option
        if (!bestMatch) {
          for (const opt of optionElements) {
            if (!this.isElementVisible(opt)) continue;
            const text = opt.textContent?.trim() || "";
            if (
              text.length > 3 &&
              !text.toLowerCase().includes("no result")
            ) {
              bestMatch = opt;
              break;
            }
          }
        }

        if (bestMatch) {
          bestMatch.click();
          console.log(
            `✅ Location selected: ${bestMatch.textContent?.trim()}`
          );
          await this.wait(500);
          return true;
        }
      }

      // Fallback: press Enter to confirm typed value
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
        })
      );
      await this.wait(200);
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
      await this.wait(200);

      return true;
    } catch (error) {
      console.error("Error filling location field:", error);
      return false;
    }
  }

  async fillDateField(field, answer) {
    try {
      const dateComponents = this.convertAvailabilityToDate(answer);
      const container = field.container;
      if (!container) return false;

      const setInputValue = (input, value) => {
        input.focus();
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        )?.set;
        if (nativeSetter) {
          nativeSetter.call(input, value);
        } else {
          input.value = value;
        }
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true }));
      };

      const monthInput = container.querySelector(
        '[data-testid="input-month"], [data-input="month"], [data-testid="month"] input'
      );
      if (monthInput) setInputValue(monthInput, dateComponents.month);
      else return false;

      const dayInput = container.querySelector(
        '[data-testid="input-day"], [data-input="day"], [data-testid="day"] input'
      );
      if (dayInput) setInputValue(dayInput, dateComponents.day);
      else return false;

      const yearInput = container.querySelector(
        '[data-testid="input-year"], [data-input="year"], [data-testid="year"] input'
      );
      if (yearInput) setInputValue(yearInput, dateComponents.year);
      else return false;

      console.log(
        `✅ Filled date: ${dateComponents.month}/${dateComponents.day}/${dateComponents.year}`
      );
      return true;
    } catch (error) {
      console.error("Error filling date field:", error);
      return false;
    }
  }

  async fillPhoneField(form, profile) {
    if (!profile.phoneNumber) return;

    try {
      const countryCode = profile.phoneCountryCode?.toLowerCase() || "us";

      // Set country code
      const codeContainer = form.querySelector(
        '[data-testid="phone_number-code"]'
      );
      if (codeContainer) {
        const codeInput = codeContainer.querySelector("input");
        if (codeInput && !codeInput.value.toLowerCase().includes(countryCode)) {
          codeInput.click();
          codeInput.focus();
          await this.wait(300);

          codeInput.value = countryCode;
          codeInput.dispatchEvent(new Event("input", { bubbles: true }));
          await this.wait(500);

          const options = document.querySelectorAll('[role="option"]');
          if (options.length > 0) {
            options[0].click();
          }
          await this.wait(300);
        }
      }

      // Fill phone number
      const phoneInput = form.querySelector(
        '[data-testid="input-phone_number"]'
      );
      if (phoneInput) {
        phoneInput.focus();
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        )?.set;
        if (nativeSetter) {
          nativeSetter.call(phoneInput, profile.phoneNumber);
        } else {
          phoneInput.value = profile.phoneNumber;
        }
        phoneInput.dispatchEvent(new Event("input", { bubbles: true }));
        phoneInput.dispatchEvent(new Event("change", { bubbles: true }));
        phoneInput.dispatchEvent(new Event("blur", { bubbles: true }));

        console.log(`✅ Phone filled: ${profile.phoneNumber}`);
      }
    } catch (err) {
      console.warn("Phone fill error:", err);
    }
  }

  // ========================================
  // SECURITY QUESTIONS
  // ========================================

  isSecurityQuestion(label) {
    const labelLower = (label || "").toLowerCase();
    return (
      labelLower.includes("not a weekday") ||
      labelLower.includes("not a week day") ||
      labelLower.includes("is a weekday") ||
      labelLower.includes("not a month") ||
      labelLower.includes("not a color") ||
      labelLower.includes("not a colour") ||
      labelLower.includes("not a number") ||
      labelLower.includes("not a digit")
    );
  }

  getSecurityQuestionAnswer(label, options) {
    if (!options || options.length === 0) return null;

    const labelLower = label.toLowerCase();

    const realWeekdays = [
      "monday", "tuesday", "wednesday", "thursday", "friday",
      "saturday", "sunday",
    ];
    const realMonths = [
      "january", "february", "march", "april", "may", "june",
      "july", "august", "september", "october", "november", "december",
      "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct",
      "nov", "dec",
    ];
    const realColors = [
      "red", "blue", "green", "yellow", "orange", "purple", "pink",
      "black", "white", "brown", "gray", "grey", "violet", "indigo",
      "cyan", "magenta", "teal", "navy",
    ];

    for (const opt of options) {
      const optLower = opt.toLowerCase().trim();

      if (
        labelLower.includes("not a weekday") ||
        labelLower.includes("not a week day")
      ) {
        if (!realWeekdays.includes(optLower)) return opt;
      } else if (
        (labelLower.includes("is a weekday") ||
          labelLower.includes("is a week day")) &&
        !labelLower.includes("not")
      ) {
        if (realWeekdays.includes(optLower)) return opt;
      } else if (labelLower.includes("not a month")) {
        if (!realMonths.includes(optLower)) return opt;
      } else if (
        labelLower.includes("not a color") ||
        labelLower.includes("not a colour")
      ) {
        if (!realColors.includes(optLower)) return opt;
      } else if (
        labelLower.includes("not a number") ||
        labelLower.includes("not a digit")
      ) {
        if (isNaN(Number(optLower))) return opt;
      }
    }

    return null;
  }

  // ========================================
  // DIRECT PROFILE ANSWERS (NO AI NEEDED)
  // ========================================

  getDirectProfileAnswer(fieldLabel, profile, options) {
    const labelLower = (fieldLabel || "").toLowerCase().trim();

    // Pronouns
    if (labelLower.includes("pronoun")) {
      const gender = profile.gender?.toLowerCase();
      if (gender === "male") return "He/him/his";
      if (gender === "female") return "She/her/hers";
      if (gender === "non-binary" || gender === "nonbinary")
        return "They/them/theirs";
      return "Just use my name";
    }

    // How did you hear about us
    if (
      labelLower.includes("how did you hear") ||
      labelLower.includes("where did you hear") ||
      labelLower.includes("how did you find")
    ) {
      if (options && options.length > 0) {
        const optionLabels = options.map((o) => o.toLowerCase());
        if (optionLabels.some((o) => o.includes("linkedin")))
          return "LinkedIn";
        if (optionLabels.some((o) => o.includes("glassdoor")))
          return "Glassdoor";
      }
      return "LinkedIn";
    }

    // Gender
    if (labelLower === "gender" || labelLower.includes("gender identity")) {
      const gender = profile.gender?.toLowerCase();
      if (gender === "male") return "Male";
      if (gender === "female") return "Female";
      if (gender === "non-binary" || gender === "nonbinary")
        return "Non-binary";
      return "Choose not to disclose";
    }

    // Race/Ethnicity
    if (
      labelLower.includes("race") ||
      labelLower.includes("ethnicity")
    ) {
      const profileRace = profile.race?.toLowerCase();
      if (!profileRace || profileRace === "prefer not to say")
        return "Choose not to disclose";
      const raceMapping = {
        white: "White",
        "black or african american": "Black or African American",
        asian: "Asian",
        "native american or alaska native":
          "American Indian or Alaskan Native",
        "native hawaiian or pacific islander":
          "Native Hawaiian or other Pacific Islander",
        "two or more races": "Two or more races",
      };
      for (const [key, value] of Object.entries(raceMapping)) {
        if (profileRace.includes(key) || key.includes(profileRace))
          return value;
      }
      return "Choose not to disclose";
    }

    // Hispanic/Latino
    if (
      labelLower.includes("hispanic") ||
      labelLower.includes("latino")
    ) {
      const profileRace = profile.race?.toLowerCase();
      if (profileRace && profileRace.includes("hispanic")) return "Yes";
      return "No";
    }

    // Veteran Status
    if (labelLower.includes("veteran")) {
      const veteranStatus = profile.veteranStatus?.toLowerCase();
      if (
        !veteranStatus ||
        veteranStatus === "false" ||
        veteranStatus === "no"
      )
        return "I am not a protected veteran";
      if (veteranStatus === "true" || veteranStatus === "yes")
        return "I identify as one or more of the classifications of a protected veteran";
      return "Choose not to disclose";
    }

    // Disability
    if (labelLower.includes("disability")) {
      const disabilityStatus = profile.disabilityStatus?.toLowerCase();
      if (disabilityStatus === "yes")
        return "Yes, I have a disability (or previously had a disability)";
      if (disabilityStatus === "no")
        return "No, I don't have a disability";
      return "I don't wish to answer";
    }

    // Work Authorization
    if (
      labelLower.includes("legally authorized") ||
      labelLower.includes("authorized to work") ||
      labelLower.includes("legal right to work")
    ) {
      const workAuth = profile.workAuthorization?.toLowerCase();
      if (workAuth && workAuth !== "none" && workAuth !== "no")
        return "Yes";
      return "No";
    }

    // Visa Sponsorship
    if (
      labelLower.includes("visa sponsorship") ||
      labelLower.includes("require sponsorship") ||
      labelLower.includes("need sponsorship")
    ) {
      const requiresSponsorship =
        profile.requiresSponsorship?.toLowerCase();
      if (
        requiresSponsorship === "no" ||
        requiresSponsorship === "false"
      )
        return "No";
      if (
        requiresSponsorship === "yes" ||
        requiresSponsorship === "true"
      )
        return "Yes";
      return "No";
    }

    // Available to work
    if (
      labelLower.includes("available to work in") ||
      labelLower.includes("able to work in") ||
      labelLower.includes("willing to work in")
    ) {
      return "Yes";
    }

    // No direct match - needs AI
    return null;
  }

  // ========================================
  // AI ANSWER ROUTING
  // ========================================

  async getAIAnswer(
    question,
    options = [],
    fieldType = "text",
    fieldContext = "",
    retryCount = 0
  ) {
    try {
      const cacheKey = `${question}_${options.join("_")}_${fieldType}`;

      if (this.answerCache.has(cacheKey)) {
        return this.answerCache.get(cacheKey);
      }

      const context = {
        platform: "rippling",
        userData: this.userData,
        jobDescription: this.jobDescription,
        fieldType,
        fieldContext,
        required: fieldContext.includes("required"),
      };

      let answer;

      if (fieldType === "checkbox" && options && options.length > 1) {
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
        (answer === null ||
          answer === undefined ||
          answer === "" ||
          String(answer).trim() === "") &&
        retryCount < 2
      ) {
        await this.wait(1000 + retryCount * 500);
        return await this.getAIAnswer(
          question,
          options,
          fieldType,
          fieldContext,
          retryCount + 1
        );
      }

      if (answer !== null && answer !== undefined) {
        this.answerCache.set(cacheKey, answer);
      }
      return answer;
    } catch (error) {
      if (retryCount < 2) {
        await this.wait(1000 + retryCount * 500);
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

  buildFieldContext(field) {
    const parts = [
      `Field type: ${field.type}`,
      field.required
        ? "This field is required"
        : "This field is optional",
    ];

    if (field.dataTestId) parts.push(`Field name: ${field.dataTestId}`);
    if (field.options && field.options.length > 0) {
      parts.push(`Available options: ${field.options.join(", ")}`);
    }

    parts.push(
      "Please provide your response based on the user profile data."
    );

    return parts.filter(Boolean).join(". ");
  }

  // ========================================
  // DATE CONVERSION
  // ========================================

  convertAvailabilityToDate(answer) {
    const now = new Date();
    let targetDate;
    const answerLower = (answer || "").toLowerCase().trim();

    if (answerLower === "immediate" || answerLower.includes("immediate")) {
      targetDate = now;
    } else if (
      answerLower.includes("2 week") ||
      answerLower.includes("two week")
    ) {
      targetDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    } else if (
      answerLower.includes("1 month") ||
      answerLower.includes("one month")
    ) {
      targetDate = new Date(now);
      targetDate.setMonth(targetDate.getMonth() + 1);
    } else if (
      answerLower.includes("2 month") ||
      answerLower.includes("two month")
    ) {
      targetDate = new Date(now);
      targetDate.setMonth(targetDate.getMonth() + 2);
    } else if (
      answerLower.includes("3 month") ||
      answerLower.includes("three month")
    ) {
      targetDate = new Date(now);
      targetDate.setMonth(targetDate.getMonth() + 3);
    } else {
      // Try to parse as a date string (MM/DD/YYYY)
      const parsed = new Date(answer);
      if (!isNaN(parsed.getTime())) {
        targetDate = parsed;
      } else {
        // Default to 2 weeks
        targetDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      }
    }

    return {
      month: String(targetDate.getMonth() + 1).padStart(2, "0"),
      day: String(targetDate.getDate()).padStart(2, "0"),
      year: String(targetDate.getFullYear()),
    };
  }

  // ========================================
  // FORM SUBMISSION
  // ========================================

  async submitForm(form) {
    try {
      // Find submit button
      const submitButton =
        form.querySelector('button[data-testid="Apply"]') ||
        this.findSubmitButton(form);

      if (!submitButton) return false;

      if (!this.isElementVisible(submitButton) || submitButton.disabled) {
        console.warn("Submit button not visible or disabled");
        return false;
      }

      submitButton.scrollIntoView({ behavior: "smooth", block: "center" });

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
          await this.wait(500);
          submitButton.click();
          return true;
        } else if (userAction === "SKIP") {
          return { success: false, reason: "user_skipped" };
        }
      }

      // Auto-pilot: submit directly
      await this.wait(500);
      submitButton.click();

      return true;
    } catch (error) {
      console.error("Error submitting form:", error);
      return false;
    }
  }

  findSubmitButton(form) {
    const selectors = [
      'button[data-testid="Apply"]',
      'button[type="submit"]',
      'input[type="submit"]',
    ];

    for (const selector of selectors) {
      const button = form.querySelector(selector);
      if (button && this.isElementVisible(button) && !button.disabled) {
        return button;
      }
    }

    // Text-based search
    const buttons = form.querySelectorAll("button");
    for (const button of buttons) {
      if (!this.isElementVisible(button) || button.disabled) continue;
      const text = (button.textContent || "").toLowerCase();
      if (
        text.includes("submit") ||
        text.includes("apply") ||
        text.includes("send")
      ) {
        return button;
      }
    }

    return null;
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  shouldSkipField(field) {
    if (!field.label) return true;
    if (field.type === "file") return true;
    if (field.type === "tel") return true; // Handled separately

    const labelLower = field.label.toLowerCase();
    if (
      labelLower.includes("other url") ||
      labelLower.includes("other website") ||
      labelLower.includes("additional url")
    ) {
      return true;
    }

    return false;
  }

  async handleRequiredCheckboxes(form) {
    try {
      const requiredCheckboxes = form.querySelectorAll(
        'input[type="checkbox"][aria-required="true"]:not(:checked), input[type="checkbox"][required]:not(:checked)'
      );
      for (const checkbox of requiredCheckboxes) {
        if (this.isElementVisible(checkbox)) {
          checkbox.click();
          await this.wait(300);
        }
      }
    } catch (error) {
      console.warn("Error handling required checkboxes:", error);
    }
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

  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
