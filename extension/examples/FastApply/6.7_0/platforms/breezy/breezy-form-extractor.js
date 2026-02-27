/**
 * BreezyFormExtractor - Extract and analyze form fields from Breezy.hr application forms
 * 
 * SUPPORTED PATTERNS:
 * 
 * 1. Main Form Fields (Personal Details):
 *    <h3><span class="polygot">Full Name</span><span class="required">*</span></h3>
 *    <input name="cName" ng-model="candidate.name" type="text" placeholder="Full Name">
 *    - Label: h3 > span.polygot (PRECEDING sibling)
 *    - Placeholder: attribute fallback
 * 
 * 2. Questionnaire Fields (Radio/Checkbox/Text/Textarea):
 *    <li class="question">
 *      <div class="multiplechoice">
 *        <h3><span class="ng-binding">Question text?</span><span class="required">*</span></h3>
 *        <ul class="options">
 *          <li class="option">
 *            <label><input type="radio" name="section_X_question_Y" value="Yes">
 *            <span class="ng-binding">Yes</span></label>
 *          </li>
 *        </ul>
 *      </div>
 *    </li>
 *    - Label: h3 > span inside .question container
 *    - Options: span.ng-binding inside label
 * 
 * 3. Textarea with Section Header:
 *    <div class="section">
 *      <div class="section-header"><h3><span class="polygot">Cover Letter</span></h3></div>
 *      <textarea name="cCoverLetter"></textarea>
 *    </div>
 *    - Label: .section-header h3 span.polygot
 * 
 * 4. Select Fields:
 *    <select ng-model="candidate.salary.period">
 *      <option value="hourly">Hourly</option>
 *    </select>
 *    - Options: standard option elements
 */
export class BreezyFormExtractor {
  determineBreezyFieldType(fieldEntry) {
    const element = fieldEntry.element || fieldEntry;
    const container = element.closest
      ? element.closest(".question") ||
        element.closest(".field") ||
        element.closest("fieldset")
      : null;
    const tagName = element.tagName ? element.tagName.toLowerCase() : "";
    const type = element.type ? element.type.toLowerCase() : "";
    const className = element.className || "";
    const name = element.name || "";
    const id = element.id || "";
    const role = element.getAttribute ? element.getAttribute("role") : "";
    const ariaLabel = element.getAttribute
      ? element.getAttribute("aria-label")
      : "";

    if (container && container.classList.contains("autocomplete-container")) {
      return {
        type: "location",
        subtype: "autocomplete",
        widget: "google-places",
        required: this.isBreezyFieldRequired(fieldEntry, container),
      };
    }

    if (container && container.classList.contains("yesno")) {
      return {
        type: "yesno",
        subtype: "toggle",
        widget: "boolean",
        required: this.isBreezyFieldRequired(fieldEntry, container),
      };
    }

    if (tagName === "input") {
      if (type === "file") {
        const acceptAttr = element.accept || "";
        const isResume =
          name.includes("resume") ||
          id.includes("resume") ||
          className.includes("resume");
        const isCoverLetter =
          name.includes("cover") ||
          id.includes("cover") ||
          className.includes("cover");

        return {
          type: "file",
          subtype: isResume
            ? "resume"
            : isCoverLetter
            ? "cover_letter"
            : "document",
          accept: acceptAttr,
          required: this.isBreezyFieldRequired(fieldEntry, container),
        };
      }

      if (type === "radio") {
        // Breezy uses .question > .multiplechoice > ul.options structure
        // Also fall back to closest <ul> for bare EEOC radios
        const questionContainer = element.closest(".question") ||
                                 element.closest(".multiplechoice") ||
                                 element.closest("fieldset") ||
                                 element.closest("ul") ||
                                 container;
        const options = this.extractRadioOptions(questionContainer);
        return {
          type: "radio",
          options,
          required: this.isBreezyFieldRequired(fieldEntry, questionContainer),
        };
      }

      if (type === "checkbox") {
        // Breezy uses .question container for multi-checkbox
        const questionContainer = element.closest(".question") ||
                                 element.closest("fieldset") || 
                                 container;
        
        if (
          questionContainer &&
          questionContainer.querySelectorAll('input[type="checkbox"]').length > 1
        ) {
          const options = this.extractCheckboxOptions(questionContainer);
          return {
            type: "checkbox",
            subtype: "multiple",
            options,
            required: this.isBreezyFieldRequired(fieldEntry, questionContainer),
          };
        }
        return {
          type: "checkbox",
          subtype: "single",
          required: this.isBreezyFieldRequired(fieldEntry, container),
        };
      }

      if (type === "tel" || type === "phone") {
        return {
          type: "phone",
          pattern: element.pattern || "",
          placeholder: element.placeholder || "",
          required: this.isBreezyFieldRequired(fieldEntry, container),
        };
      }

      if (type === "email") {
        return {
          type: "email",
          required: this.isBreezyFieldRequired(fieldEntry, container),
        };
      }

      if (type === "date") {
        return {
          type: "date",
          min: element.min || "",
          max: element.max || "",
          required: this.isBreezyFieldRequired(fieldEntry, container),
        };
      }

      if (type === "url") {
        return {
          type: "url",
          required: this.isBreezyFieldRequired(fieldEntry, container),
        };
      }

      if (type === "number") {
        return {
          type: "number",
          min: element.min || "",
          max: element.max || "",
          step: element.step || "",
          required: this.isBreezyFieldRequired(fieldEntry, container),
        };
      }

      if (["text", "search", ""].includes(type)) {
        return {
          type: "text",
          maxlength: element.maxLength > 0 ? element.maxLength : null,
          required: this.isBreezyFieldRequired(fieldEntry, container),
        };
      }
    }

    if (tagName === "textarea") {
      return {
        type: "textarea",
        maxlength: element.maxLength > 0 ? element.maxLength : null,
        rows: element.rows || null,
        required: this.isBreezyFieldRequired(fieldEntry, container),
      };
    }

    if (tagName === "select") {
      const options = this.extractSelectOptions(element);
      const isMultiple = element.multiple || false;
      return {
        type: "select",
        subtype: isMultiple ? "multiple" : "single",
        options,
        required: this.isBreezyFieldRequired(fieldEntry, container),
      };
    }

    if (role === "combobox" || className.includes("combobox")) {
      return {
        type: "combobox",
        widget: "custom",
        required: this.isBreezyFieldRequired(fieldEntry, container),
      };
    }

    if (
      className.includes("react-datepicker") ||
      className.includes("date-picker")
    ) {
      return {
        type: "date",
        widget: "datepicker",
        required: this.isBreezyFieldRequired(fieldEntry, container),
      };
    }

    return {
      type: "unknown",
      element: tagName,
      typeAttr: type,
      className,
      required: false,
    };
  }

  extractRadioOptions(fieldset) {
    if (!fieldset) return [];
    const radioInputs = fieldset.querySelectorAll('input[type="radio"]');
    const options = [];

    radioInputs.forEach((radio) => {
      const value = radio.value || "";
      const id = radio.id || "";
      let label = "";

      // Pattern 1: label[for="id"]
      if (id) {
        const labelElement = fieldset.querySelector(`label[for="${id}"]`);
        if (labelElement) {
          // Get the span inside the label if it exists
          const span = labelElement.querySelector("span.ng-binding, span.polygot, span");
          label = span ? span.textContent.trim() : labelElement.textContent.trim();
        }
      }

      // Pattern 2: Parent label with nested span (Breezy pattern)
      if (!label) {
        const parentLabel = radio.closest("label");
        if (parentLabel) {
          // Look for span.ng-binding or span.polygot after the input
          const span = parentLabel.querySelector("span.ng-binding, span.polygot, span");
          if (span) {
            label = span.textContent.trim();
          } else {
            // Get all text but remove the input's text content
            const clone = parentLabel.cloneNode(true);
            const inputClone = clone.querySelector("input");
            if (inputClone) inputClone.remove();
            label = clone.textContent.trim();
          }
        }
      }

      // Pattern 3: Next sibling span or text node
      if (!label) {
        const nextSibling = radio.nextSibling;
        if (nextSibling) {
          if (nextSibling.nodeType === Node.TEXT_NODE) {
            label = nextSibling.textContent.trim();
          } else if (nextSibling.nodeType === Node.ELEMENT_NODE) {
            if (nextSibling.tagName === "SPAN") {
              label = nextSibling.textContent.trim();
            } else {
              label = nextSibling.textContent.trim();
            }
          }
        }
      }

      if (label) {
        options.push({ value, label, checked: radio.checked });
      }
    });

    return options;
  }

  extractCheckboxOptions(fieldset) {
    if (!fieldset) return [];
    const checkboxInputs = fieldset.querySelectorAll('input[type="checkbox"]');
    const options = [];

    checkboxInputs.forEach((checkbox) => {
      const value = checkbox.value || "";
      const id = checkbox.id || "";
      const name = checkbox.name || "";
      let label = "";

      // Pattern 1: label[for="id"]
      if (id) {
        const labelElement = fieldset.querySelector(`label[for="${id}"]`);
        if (labelElement) {
          const span = labelElement.querySelector("span.ng-binding, span.polygot, span");
          label = span ? span.textContent.trim() : labelElement.textContent.trim();
        }
      }

      // Pattern 2: Parent label or next sibling span (Breezy pattern)
      if (!label) {
        const parentLabel = checkbox.closest("label");
        if (parentLabel) {
          const span = parentLabel.querySelector("span.ng-binding, span.polygot, span");
          if (span) {
            label = span.textContent.trim();
          } else {
            const clone = parentLabel.cloneNode(true);
            const inputClone = clone.querySelector("input");
            if (inputClone) inputClone.remove();
            label = clone.textContent.trim();
          }
        }
      }
      
      // Pattern 3: Next sibling span (common in Breezy)
      if (!label) {
        const nextSibling = checkbox.nextElementSibling;
        if (nextSibling && nextSibling.tagName === "SPAN") {
          label = nextSibling.textContent.trim();
        }
      }

      if (!label) {
        const nextSibling = checkbox.nextSibling;
        if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE)
          label = nextSibling.textContent.trim();
        else if (nextSibling && nextSibling.nodeType === Node.ELEMENT_NODE)
          label = nextSibling.textContent.trim();
      }

      // Pattern 4: Search closest container (.option, li, label) for span text
      // Handles cases where checkbox is wrapped (e.g., <label><input></label><span>)
      if (!label) {
        const optionContainer = checkbox.closest('.option') || checkbox.closest('li') || checkbox.closest('label');
        if (optionContainer) {
          const span = optionContainer.querySelector('span.ng-binding, span.polygot, span');
          if (span && span !== checkbox) {
            label = span.textContent.trim();
          }
          // If no span found, get text content of container minus inputs
          if (!label) {
            const clone = optionContainer.cloneNode(true);
            const inputs = clone.querySelectorAll('input');
            inputs.forEach(inp => inp.remove());
            const text = clone.textContent.trim();
            if (text && text !== "on") label = text;
          }
        }
      }

      // Use label as value when checkbox has no explicit value (browser default "on")
      const effectiveValue = (value === "on" || !value) ? (label || value) : value;
      options.push({
        value: effectiveValue,
        label: label || effectiveValue,
        name,
        checked: checkbox.checked,
      });
    });

    return options;
  }

  extractSelectOptions(selectElement) {
    if (!selectElement || selectElement.tagName.toLowerCase() !== "select")
      return [];
    const options = [];
    const optionElements = selectElement.querySelectorAll("option");

    optionElements.forEach((option) => {
      const value = option.value || "";
      const label = option.textContent.trim();
      const selected = option.selected;
      const disabled = option.disabled;

      if (value || label)
        options.push({ value, label: label || value, selected, disabled });
    });

    return options;
  }

  isBreezyFieldRequired(fieldEntry, labelElement) {
    const element = fieldEntry.element || fieldEntry;

    if (element?.hasAttribute?.("required")) return true;

    if (element?.getAttribute) {
      const ariaRequired = element.getAttribute("aria-required");
      if (ariaRequired === "true") return true;
    }

    if (labelElement) {
      const requiredIndicator = labelElement.querySelector(
        '.required, .asterisk, [class*="required"]'
      );
      if (requiredIndicator) return true;

      const labelText = labelElement.textContent || "";
      if (
        labelText.includes("*") ||
        labelText.includes("(required)") ||
        labelText.includes("Required")
      )
        return true;
    }

    const container = element.closest
      ? element.closest(".question") || element.closest(".field")
      : null;
    if (container) {
      if (
        container.classList.contains("required") ||
        container.classList.contains("is-required")
      )
        return true;

      const requiredIndicator = container.querySelector(
        '.required, .asterisk, [class*="required"]'
      );
      if (requiredIndicator) return true;
    }

    return false;
  }

  findFieldLabel(element) {
    if (!element) return null;

    const id = element.id || "";
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) return label;
    }

    const parentLabel = element.closest("label");
    if (parentLabel) return parentLabel;

    // Pattern 1: Questionnaire questions - h3 is inside the parent .question container
    const questionContainer = element.closest(".question");
    if (questionContainer) {
      // Only match specific span classes – bare "h3 > span" would catch <span class="required">
      const questionH3 = questionContainer.querySelector("h3 > span.ng-binding, h3 > span.polygot");
      if (questionH3) return questionH3;

      // Fall back to the h3 element itself (includes full question text)
      const questionH3Direct = questionContainer.querySelector("h3");
      if (questionH3Direct) return questionH3Direct;
    }

    // Pattern 2: Main form sections - h3 is a PRECEDING SIBLING
    // Also check inside preceding siblings (e.g., div.section-header containing h3)
    let prevElement = element.previousElementSibling;
    while (prevElement) {
      if (prevElement.tagName === "H3") {
        const span = prevElement.querySelector("span.polygot, span.ng-binding");
        return span || prevElement;
      }
      // Check inside preceding sibling for h3 (e.g., div.section-header > h3)
      const h3Inside = prevElement.querySelector("h3");
      if (h3Inside) {
        const span = h3Inside.querySelector("span.polygot, span.ng-binding");
        return span || h3Inside;
      }
      prevElement = prevElement.previousElementSibling;
    }

    // Pattern 3: Section structure - div.section > div.section-header > h3 > span.polygot
    // Check BEFORE parent traversal to prevent crossing section boundaries
    const section = element.closest(".section");
    if (section) {
      const sectionHeader = section.querySelector(".section-header h3 span.polygot, .section-header h3 span.ng-binding, .section-header h3");
      if (sectionHeader) return sectionHeader;

      const header = section.querySelector("h1, h2, h3, h4, h5, h6");
      if (header) {
        const span = header.querySelector("span.polygot, span.ng-binding");
        return span || header;
      }
    }

    // Pattern 4: Check parent's previous siblings (for nested structures)
    // STOP at section boundaries to prevent cross-section label leaking
    let parent = element.parentElement;
    while (parent && parent !== document.body) {
      // Stop at section boundaries – don't escape into adjacent sections
      if (parent.classList && parent.classList.contains("section")) break;

      let prevSibling = parent.previousElementSibling;
      while (prevSibling) {
        if (prevSibling.tagName === "H3") {
          const span = prevSibling.querySelector("span.polygot, span.ng-binding");
          return span || prevSibling;
        }
        const h3InSibling = prevSibling.querySelector("h3");
        if (h3InSibling) {
          const span = h3InSibling.querySelector("span.polygot, span.ng-binding");
          return span || h3InSibling;
        }
        prevSibling = prevSibling.previousElementSibling;
      }
      parent = parent.parentElement;
    }

    // Pattern 5: Field or fieldset containers
    const container = element.closest(".field") || element.closest("fieldset");
    if (container) {
      const label = container.querySelector("label, .label, legend, h3");
      if (label) return label;
    }

    return null;
  }

  getLabelText(element) {
    const label = this.findFieldLabel(element);
    if (!label) {
      // Fallback: try to get label from placeholder or aria-label
      const placeholder = element.placeholder || element.getAttribute('placeholder');
      const ariaLabel = element.getAttribute('aria-label');
      const title = element.getAttribute('title');
      
      if (ariaLabel) return ariaLabel.trim();
      if (placeholder) return placeholder.trim();
      if (title) return title.trim();
      
      // Try to get from Angular ng-model or name attribute
      const ngModel = element.getAttribute('ng-model');
      const name = element.name || element.id;
      
      if (ngModel) {
        // Convert camelCase to readable text: "cName" -> "Name"
        const readable = ngModel.replace(/^c([A-Z])/, '$1').replace(/([A-Z])/g, ' $1').trim();
        if (readable) return readable;
      }
      
      if (name) {
        // Convert names like "cName" to "Name", "cPhoneNumber" to "Phone Number"
        const readable = name
          .replace(/^c([A-Z])/, '$1') // Remove leading 'c'
          .replace(/([A-Z])/g, ' $1') // Add space before capitals
          .replace(/_/g, ' ') // Replace underscores with spaces
          .trim();
        if (readable && !readable.includes('section_')) return readable;
      }
      
      return "";
    }

    const clone = label.cloneNode(true);
    const requiredIndicators = clone.querySelectorAll(
      '.required, .asterisk, [class*="required"]'
    );
    requiredIndicators.forEach((ind) => ind.remove());

    return clone.textContent
      .trim()
      .replace(/\s*\*\s*/g, "")
      .replace(/\s*\(required\)\s*/gi, "")
      .trim();
  }

  findPrecedingQuestion(element) {
    if (!element) return null;

    let current = element;
    const headingSelectors = [
      ".section-header",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      ".section-title",
      ".question-title",
    ];

    while (current) {
      let sibling = current.previousElementSibling;
      while (sibling) {
        for (const selector of headingSelectors) {
          if (sibling.matches?.(selector)) return sibling;
          const heading = sibling.querySelector(selector);
          if (heading) return heading;
        }
        sibling = sibling.previousElementSibling;
      }
      current = current.parentElement;
    }

    return null;
  }

  getPrecedingQuestionText(element) {
    const questionElement = this.findPrecedingQuestion(element);
    if (!questionElement) return "";

    const polygot = questionElement.querySelector(".polygot");
    if (polygot) return polygot.textContent.trim();

    // Clone and strip required indicators (e.g., <span class="required">*</span>)
    // to avoid sending labels like "Are you a U.S. Citizen?*" to the AI API.
    const clone = questionElement.cloneNode(true);
    const requiredIndicators = clone.querySelectorAll(
      '.required, .asterisk, [class*="required"]'
    );
    requiredIndicators.forEach((ind) => ind.remove());

    return clone.textContent
      .trim()
      .replace(/\s*\*\s*/g, "")
      .replace(/\s*\(required\)\s*/gi, "")
      .trim();
  }

  getFieldConstraints(element) {
    const constraints = {};

    if (
      element.hasAttribute("required") ||
      element.getAttribute("aria-required") === "true"
    )
      constraints.required = true;

    if (element.minLength > 0) constraints.minLength = element.minLength;
    if (element.maxLength > 0 && element.maxLength < 524288)
      constraints.maxLength = element.maxLength;

    if (element.min) constraints.min = element.min;
    if (element.max) constraints.max = element.max;
    if (element.step) constraints.step = element.step;
    if (element.pattern) constraints.pattern = element.pattern;
    if (element.accept) constraints.accept = element.accept;

    const placeholder =
      element.placeholder || element.getAttribute("placeholder");
    if (placeholder) constraints.placeholder = placeholder;

    return constraints;
  }

  extractAllFormFields(formElement) {
    if (!formElement) return [];

    const fields = [];
    const processedRadioGroups = new Set();
    const fieldSelectors = 'input:not([type="hidden"]), textarea, select';
    const fieldElements = formElement.querySelectorAll(fieldSelectors);

    fieldElements.forEach((element) => {
      const fieldType = this.determineBreezyFieldType(element);
      
      // Special handling for radio buttons - group them by name
      if (element.type === 'radio') {
        const radioName = element.name;
        
        // Skip if we've already processed this radio group
        if (processedRadioGroups.has(radioName)) {
          return;
        }
        processedRadioGroups.add(radioName);
        
        // Get all radios with the same name
        const radioGroup = formElement.querySelectorAll(`input[type="radio"][name="${radioName}"]`);
        const firstRadio = radioGroup[0];
        
        // Use the first radio as the representative element
        const label = this.getLabelText(firstRadio);
        const precedingQuestion = this.getPrecedingQuestionText(firstRadio);
        const name = radioName;
        const constraints = this.getFieldConstraints(firstRadio);
        
        // Get the proper container and extract field type with options
        const questionContainer = firstRadio.closest('.question') ||
                                 firstRadio.closest('.multiplechoice') ||
                                 firstRadio.closest('fieldset') ||
                                 firstRadio.closest('ul') ||
                                 firstRadio.closest('.field');
        
        // Call determineBreezyFieldType which will extract all radio options
        const radioFieldType = this.determineBreezyFieldType(firstRadio);
        
        fields.push({
          element: firstRadio,
          name,
          label: precedingQuestion || label, // Prefer the question text for radio groups
          precedingQuestion,
          fieldType: radioFieldType,
          constraints,
          value: this.getFieldValue(firstRadio),
        });
        
        return;
      }
      
      // Special handling for checkboxes - group them by name (like radios)
      if (element.type === 'checkbox') {
        const checkboxName = element.name;

        // Skip if we've already processed this checkbox group
        if (checkboxName && processedRadioGroups.has(checkboxName)) {
          return;
        }
        if (checkboxName) {
          processedRadioGroups.add(checkboxName);
        }

        const label = this.getLabelText(element);
        const precedingQuestion = this.getPrecedingQuestionText(element);
        const name = checkboxName || element.id || "";
        const constraints = this.getFieldConstraints(element);
        const checkboxFieldType = this.determineBreezyFieldType(element);

        fields.push({
          element,
          name,
          label: precedingQuestion || label,
          precedingQuestion,
          fieldType: checkboxFieldType,
          constraints,
          value: this.getFieldValue(element),
        });

        return;
      }

      // For all other field types
      const label = this.getLabelText(element);
      const precedingQuestion = this.getPrecedingQuestionText(element);
      const name = element.name || element.id || "";
      const constraints = this.getFieldConstraints(element);

      fields.push({
        element,
        name,
        label,
        precedingQuestion,
        fieldType,
        constraints,
        value: this.getFieldValue(element),
      });
    });

    return fields;
  }

  getFieldValue(element) {
    if (!element) return null;

    const tagName = element.tagName.toLowerCase();
    const type = element.type ? element.type.toLowerCase() : "";

    if (tagName === "select") {
      if (element.multiple)
        return Array.from(element.selectedOptions).map((opt) => opt.value);
      return element.value;
    }

    if (type === "checkbox") return element.checked;

    if (type === "radio") {
      const name = element.name;
      if (name) {
        const checked = document.querySelector(`input[name="${name}"]:checked`);
        return checked ? checked.value : null;
      }
      return element.checked ? element.value : null;
    }

    if (type === "file")
      return element.files && element.files.length > 0 ? element.files : null;

    return element.value || "";
  }

  setFieldValue(element, value) {
    if (!element) return false;

    const tagName = element.tagName.toLowerCase();
    const type = element.type ? element.type.toLowerCase() : "";

    try {
      if (tagName === "select") {
        if (element.multiple && Array.isArray(value)) {
          const valuesToSelect = value.map(v => String(v).toLowerCase());
          Array.from(element.options).forEach((opt) => {
            const optValue = String(opt.value).toLowerCase();
            const optLabel = opt.textContent.trim().toLowerCase();
            opt.selected = valuesToSelect.some(v =>
              optValue === v || optLabel === v ||
              optLabel.includes(v) || v.includes(optLabel)
            );
          });
        } else {
          // Try direct value match first
          element.value = value;

          // If direct match failed, fuzzy-match against option text/value
          if (element.value !== String(value)) {
            const valueStr = String(value).toLowerCase();
            let bestMatch = null;
            let bestScore = 0;

            for (const opt of element.options) {
              if (!opt.value && !opt.textContent.trim()) continue;
              const optValue = String(opt.value).toLowerCase();
              const optLabel = opt.textContent.trim().toLowerCase();

              let score = 0;
              if (optValue === valueStr || optLabel === valueStr) score = 100;
              else if (optLabel.includes(valueStr) || valueStr.includes(optLabel)) score = 60;
              else if (optValue.includes(valueStr) || valueStr.includes(optValue)) score = 40;

              if (score > bestScore) {
                bestMatch = opt;
                bestScore = score;
              }
            }

            if (bestMatch && bestScore > 0) {
              element.value = bestMatch.value;
            }
          }
        }
        this.triggerAngularEvents(element);
        return true;
      }

      if (type === "checkbox") {
        const name = element.name;
        // Multi-checkbox: find all checkboxes by name and match by label
        if (name) {
          const allCheckboxes = document.querySelectorAll(
            `input[type="checkbox"][name="${name}"]`
          );
          if (allCheckboxes.length > 1) {
            const valuesToCheck = Array.isArray(value) ? value : [String(value)];
            let matched = false;

            for (const cb of allCheckboxes) {
              // Get label using multiple patterns (Breezy checkbox structure varies)
              let cbLabel = "";

              // Try parent label > span first
              const parentLabel = cb.closest("label");
              if (parentLabel) {
                const span = parentLabel.querySelector("span.ng-binding, span.polygot, span");
                if (span) cbLabel = span.textContent.trim();
              }

              // Try next sibling span
              if (!cbLabel) {
                const nextSpan = cb.nextElementSibling;
                if (nextSpan && nextSpan.tagName === "SPAN") {
                  cbLabel = nextSpan.textContent.trim();
                }
              }

              // Try closest container (.option, li) for span text
              if (!cbLabel) {
                const optContainer = cb.closest('.option') || cb.closest('li') || cb.closest('label');
                if (optContainer) {
                  const span = optContainer.querySelector('span.ng-binding, span.polygot, span');
                  if (span && span !== cb) cbLabel = span.textContent.trim();
                  if (!cbLabel) {
                    const clone = optContainer.cloneNode(true);
                    clone.querySelectorAll('input').forEach(inp => inp.remove());
                    const text = clone.textContent.trim();
                    if (text && text !== "on") cbLabel = text;
                  }
                }
              }

              const cbValue = cb.value || "";

              const shouldCheck = valuesToCheck.some((v) => {
                const vLower = String(v).toLowerCase();
                const labelLower = cbLabel.toLowerCase();
                const valLower = cbValue.toLowerCase();
                return (
                  labelLower === vLower ||
                  valLower === vLower ||
                  labelLower.includes(vLower) ||
                  vLower.includes(labelLower)
                );
              });

              // Use click() instead of setting .checked directly.
              // AngularJS checkbox directives listen for click events to update
              // ng-model and fire ng-change handlers (e.g., checkCheckboxResponses).
              if (shouldCheck && !cb.checked) {
                cb.click();
                matched = true;
              }
            }
            return matched;
          }
        }

        // Single checkbox: boolean value
        const boolValue = value === true || value === "true" || value === "yes" ||
                         value === "Yes" || value === 1 || value === "1";
        // Use click() to toggle if current state differs from desired state.
        // AngularJS checkbox directives listen for click events to update ng-model.
        if (boolValue !== element.checked) {
          element.click();
        }
        return true;
      }

      if (type === "radio") {
        const name = element.name;
        if (name) {
          // Find radio by matching value (case-insensitive partial match)
          const radios = document.querySelectorAll(`input[name="${name}"]`);
          const valueStr = String(value).toLowerCase();
          
          let matchedRadio = null;
          for (const radio of radios) {
            const radioValue = String(radio.value).toLowerCase();
            const radioLabel = this.getLabelText(radio).toLowerCase();
            
            if (radioValue === valueStr || 
                radioLabel === valueStr ||
                radioLabel.includes(valueStr) ||
                valueStr.includes(radioLabel)) {
              matchedRadio = radio;
              break;
            }
          }
          
          if (matchedRadio) {
            // Use click() instead of setting .checked directly.
            // AngularJS radio directives listen for click events to update ng-model.
            // Setting .checked = true only updates the DOM without triggering the
            // AngularJS digest cycle, leaving the model (question.response) unchanged.
            matchedRadio.click();
            return true;
          }
        }
        return false;
      }

      if (type === "file") return false;

      // For text inputs and textareas, use native setter to trigger Angular
      element.focus();
      
      // Small delay to ensure focus is registered
      setTimeout(() => {}, 10);
      
      // Set value using native setter (important for Angular)
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      
      if (tagName === "input" && nativeInputValueSetter) {
        nativeInputValueSetter.call(element, value);
      } else if (tagName === "textarea" && nativeTextAreaValueSetter) {
        nativeTextAreaValueSetter.call(element, value);
      } else {
        element.value = value;
      }
      
      this.triggerAngularEvents(element);
      
      // Small delay before blur
      setTimeout(() => element.blur(), 10);
      
      return true;
    } catch (error) {
      console.error("Error setting field value:", error);
      return false;
    }
  }

  /**
   * Trigger all necessary events for Angular forms
   */
  triggerAngularEvents(element) {
    if (!element) return;

    // Focus/blur cycle
    element.focus();

    // Dispatch input event (for Angular's reactive forms)
    element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    
    // Dispatch change event
    element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    
    // Dispatch blur event
    element.dispatchEvent(new Event("blur", { bubbles: true, cancelable: true }));
    
    // Angular-specific events
    element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true }));
    
    // Trigger ng-model update (for Angular 1.x)
    if (window.angular) {
      try {
        const scope = window.angular.element(element).scope();
        if (scope && scope.$apply) {
          scope.$apply();
        }
      } catch (e) {
        // Silent fail if Angular scope not available
      }
    }
  }

  validateField(element) {
    if (!element) return { valid: false, errors: ["Element not found"] };

    const errors = [];
    const fieldType = this.determineBreezyFieldType(element);
    const value = this.getFieldValue(element);

    if (fieldType.required) {
      if (
        value === null ||
        value === undefined ||
        value === "" ||
        (Array.isArray(value) && value.length === 0) ||
        (fieldType.type === "checkbox" && !value)
      ) {
        errors.push("This field is required");
      }
    }

    if (element.validity && !element.validity.valid) {
      if (element.validity.typeMismatch) errors.push("Invalid format");
      if (element.validity.patternMismatch)
        errors.push("Does not match required pattern");
      if (element.validity.tooShort)
        errors.push(`Minimum length is ${element.minLength}`);
      if (element.validity.tooLong)
        errors.push(`Maximum length is ${element.maxLength}`);
      if (element.validity.rangeUnderflow)
        errors.push(`Minimum value is ${element.min}`);
      if (element.validity.rangeOverflow)
        errors.push(`Maximum value is ${element.max}`);
    }

    return { valid: errors.length === 0, errors };
  }

  validateForm(formElement) {
    if (!formElement) return { valid: false, errors: {} };

    const fields = this.extractAllFormFields(formElement);
    const errors = {};
    let isValid = true;

    fields.forEach((field) => {
      const validation = this.validateField(field.element);
      if (!validation.valid) {
        errors[field.name || field.label] = validation.errors;
        isValid = false;
      }
    });

    return { valid: isValid, errors };
  }

  fillFormData(formElement, data) {
    if (!formElement || !data) return { success: false, errors: [] };

    const errors = [];
    const fields = this.extractAllFormFields(formElement);

    Object.keys(data).forEach((key) => {
      const field = fields.find(
        (f) => f.name === key || f.label.toLowerCase() === key.toLowerCase()
      );
      if (field) {
        const success = this.setFieldValue(field.element, data[key]);
        if (!success) errors.push(`Failed to set value for field: ${key}`);
      }
    });

    return { success: errors.length === 0, errors };
  }
}
