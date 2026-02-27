export class IndeedSmartApplyFormExtractor {
  constructor() {
    this.formContainer = null;
    this.currentStepIndex = 0;
    this.totalSteps = 0;
    this.formFields = [];
    this.buttons = {};
    this.formStructure = {};
  }

  detectFormStructure() {
    const formSelectors = [
      'form[data-testid="indeed-apply-form"]',
      'form[id*="apply"]',
      'form[class*="ia-Apply"]',
      'form[class*="smartapply"]',
      'div[data-testid="apply-form-container"]',
      'div[class*="ia-ApplyForm"]',
    ];

    for (const selector of formSelectors) {
      this.formContainer = document.querySelector(selector);
      if (this.formContainer) break;
    }

    if (!this.formContainer) {
      this.formContainer = document.querySelector("form");
    }

    this.totalSteps = this.getStepCount();
    this.currentStepIndex = this.getCurrentStep();

    const stepIndicators = this.extractStepIndicators();
    const sections = this.extractFormSections();

    this.formStructure = {
      container: this.formContainer,
      totalSteps: this.totalSteps,
      currentStep: this.currentStepIndex,
      stepIndicators: stepIndicators,
      sections: sections,
      isMultiStep: this.totalSteps > 1,
    };

    return this.formStructure;
  }

  extractStepIndicators() {
    const indicators = [];
    const stepSelectors = [
      '[data-testid*="step-indicator"]',
      '[class*="step-indicator"]',
      '[class*="progress-step"]',
      '[class*="stepper"]',
      '[role="progressbar"]',
      ".ia-StepIndicator",
      '[class*="Step"]',
    ];

    stepSelectors.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el, index) => {
        indicators.push({
          element: el,
          index: index,
          isActive:
            el.classList.contains("active") ||
            el.classList.contains("current") ||
            el.getAttribute("aria-current") === "step",
          isCompleted:
            el.classList.contains("completed") || el.classList.contains("done"),
          text: el.textContent.trim(),
        });
      });
    });

    return indicators;
  }

  extractFormSections() {
    const sections = [];
    const sectionSelectors = [
      '[data-testid*="section"]',
      "fieldset",
      '[class*="form-section"]',
      '[class*="FormSection"]',
      '[class*="question-group"]',
      ".ia-Section",
    ];

    sectionSelectors.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el, index) => {
        const legend = el.querySelector("legend");
        const heading = el.querySelector("h1, h2, h3, h4, h5, h6");

        sections.push({
          element: el,
          index: index,
          title:
            legend?.textContent.trim() || heading?.textContent.trim() || "",
          fields: this.extractFieldsFromContainer(el),
        });
      });
    });

    return sections;
  }

  extractFormFields() {
    this.formFields = [];

    const container = this.formContainer || document;

    const inputFields = this.extractInputFields(container);
    const selectFields = this.extractSelectFields(container);
    const textareaFields = this.extractTextareaFields(container);
    const checkboxFields = this.extractCheckboxFields(container);
    const radioFields = this.extractRadioFields(container);
    const fileFields = this.extractFileFields(container);

    this.formFields = [
      ...inputFields,
      ...selectFields,
      ...textareaFields,
      ...checkboxFields,
      ...radioFields,
      ...fileFields,
    ];

    return this.formFields;
  }

  extractInputFields(container) {
    const inputs = container.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="url"], input[type="date"], input:not([type])'
    );
    const fields = [];

    inputs.forEach((input, index) => {
      if (input.type === "hidden") return;

      const fieldData = this.getFieldMetadata(input, "input");
      fields.push(fieldData);
    });

    return fields;
  }

  extractSelectFields(container) {
    const selects = container.querySelectorAll("select");
    const fields = [];

    selects.forEach((select) => {
      const fieldData = this.getFieldMetadata(select, "select");
      fieldData.options = this.getFieldOptions(select);
      fields.push(fieldData);
    });

    return fields;
  }

  extractTextareaFields(container) {
    const textareas = container.querySelectorAll("textarea");
    const fields = [];

    textareas.forEach((textarea) => {
      const fieldData = this.getFieldMetadata(textarea, "textarea");
      fields.push(fieldData);
    });

    return fields;
  }

  extractCheckboxFields(container) {
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    const fields = [];

    checkboxes.forEach((checkbox) => {
      const fieldData = this.getFieldMetadata(checkbox, "checkbox");
      fieldData.checked = checkbox.checked;
      fields.push(fieldData);
    });

    return fields;
  }

  extractRadioFields(container) {
    const radios = container.querySelectorAll('input[type="radio"]');
    const radioGroups = {};

    radios.forEach((radio) => {
      const name = radio.name || radio.id;
      if (!radioGroups[name]) {
        radioGroups[name] = [];
      }

      const fieldData = this.getFieldMetadata(radio, "radio");
      fieldData.checked = radio.checked;
      fieldData.value = radio.value;
      radioGroups[name].push(fieldData);
    });

    const fields = [];
    Object.keys(radioGroups).forEach((groupName) => {
      fields.push({
        type: "radio-group",
        name: groupName,
        options: radioGroups[groupName],
        selectedValue:
          radioGroups[groupName].find((r) => r.checked)?.value || null,
      });
    });

    return fields;
  }

  extractFileFields(container) {
    const fileInputs = container.querySelectorAll('input[type="file"]');
    const fields = [];

    fileInputs.forEach((fileInput) => {
      const fieldData = this.getFieldMetadata(fileInput, "file");
      fieldData.accept = fileInput.accept;
      fieldData.multiple = fileInput.multiple;
      fields.push(fieldData);
    });

    return fields;
  }

  getFieldMetadata(element, type) {
    const wrapper = this.getFieldWrapper(element);
    const label = this.getFieldLabel(element, wrapper);
    const validation = this.extractFieldValidation(element);
    const errorContainer = this.getErrorContainer(element, wrapper);

    return {
      element: element,
      type: type,
      name: element.name || element.id || "",
      id: element.id || "",
      value: element.value || "",
      label: label,
      placeholder: element.placeholder || "",
      required: this.isRequiredField(element),
      disabled: element.disabled,
      readonly: element.readOnly,
      validation: validation,
      errorContainer: errorContainer,
      wrapper: wrapper,
      visible: this.isFieldVisible(element),
      ariaLabel: element.getAttribute("aria-label"),
      ariaDescribedBy: element.getAttribute("aria-describedby"),
      dataAttributes: this.getDataAttributes(element),
    };
  }

  getFieldWrapper(element) {
    const wrapperSelectors = [
      '[class*="field-wrapper"]',
      '[class*="form-field"]',
      '[class*="FormField"]',
      '[class*="input-wrapper"]',
      '[class*="question"]',
      ".ia-Question",
      '[data-testid*="field"]',
    ];

    let wrapper = element.closest("div");

    for (const selector of wrapperSelectors) {
      const potentialWrapper = element.closest(selector);
      if (potentialWrapper) {
        wrapper = potentialWrapper;
        break;
      }
    }

    return wrapper;
  }

  getFieldLabel(element, wrapper) {
    let labelText = "";

    const labelElement =
      wrapper?.querySelector('label[for="' + element.id + '"]') ||
      wrapper?.querySelector("label") ||
      document.querySelector('label[for="' + element.id + '"]');

    if (labelElement) {
      labelText = labelElement.textContent.trim();
    } else {
      const ariaLabel = element.getAttribute("aria-label");
      const ariaLabelledBy = element.getAttribute("aria-labelledby");

      if (ariaLabel) {
        labelText = ariaLabel;
      } else if (ariaLabelledBy) {
        const labelledElement = document.getElementById(ariaLabelledBy);
        labelText = labelledElement?.textContent.trim() || "";
      }
    }

    labelText = labelText.replace(/\*/g, "").trim();

    return labelText;
  }

  isRequiredField(element) {
    if (element.required || element.hasAttribute("required")) {
      return true;
    }

    if (element.getAttribute("aria-required") === "true") {
      return true;
    }

    const wrapper = this.getFieldWrapper(element);
    if (wrapper) {
      const requiredIndicator =
        wrapper.querySelector('[class*="required"]') ||
        wrapper.querySelector(".asterisk") ||
        wrapper.querySelector('[data-required="true"]');
      if (requiredIndicator) return true;

      const labelText = wrapper.textContent;
      if (labelText.includes("*") || labelText.includes("(required)")) {
        return true;
      }
    }

    return false;
  }

  extractFieldValidation(element) {
    const validation = {
      pattern: element.pattern || null,
      minLength: element.minLength || null,
      maxLength: element.maxLength || null,
      min: element.min || null,
      max: element.max || null,
      step: element.step || null,
      type: element.type || null,
      customRules: [],
    };

    const dataValidation = element.getAttribute("data-validation");
    if (dataValidation) {
      validation.customRules.push(dataValidation);
    }

    const validationAttrs = [
      "data-validate",
      "data-validation-rule",
      "data-rule",
    ];
    validationAttrs.forEach((attr) => {
      const value = element.getAttribute(attr);
      if (value) {
        validation.customRules.push(value);
      }
    });

    return validation;
  }

  getErrorContainer(element, wrapper) {
    const errorSelectors = [
      '[class*="error"]',
      '[class*="Error"]',
      '[role="alert"]',
      '[class*="validation"]',
      '[class*="invalid"]',
      ".ia-Error",
    ];

    let errorContainer = null;

    if (wrapper) {
      for (const selector of errorSelectors) {
        errorContainer = wrapper.querySelector(selector);
        if (errorContainer) break;
      }
    }

    const ariaDescribedBy = element.getAttribute("aria-describedby");
    if (ariaDescribedBy && !errorContainer) {
      errorContainer = document.getElementById(ariaDescribedBy);
    }

    return errorContainer;
  }

  getFieldOptions(selectElement) {
    const options = [];
    const optionElements = selectElement.querySelectorAll("option");

    optionElements.forEach((option, index) => {
      options.push({
        element: option,
        index: index,
        value: option.value,
        text: option.textContent.trim(),
        selected: option.selected,
        disabled: option.disabled,
      });
    });

    return options;
  }

  extractFieldsFromContainer(container) {
    const fields = [];
    const inputs = container.querySelectorAll("input, select, textarea");

    inputs.forEach((input) => {
      if (input.type === "hidden") return;

      const fieldData = this.getFieldMetadata(
        input,
        input.tagName.toLowerCase()
      );
      if (input.tagName.toLowerCase() === "select") {
        fieldData.options = this.getFieldOptions(input);
      }
      fields.push(fieldData);
    });

    return fields;
  }

  detectButtons() {
    const buttons = {
      continue: null,
      preview: null,
      submit: null,
      back: null,
      cancel: null,
      other: [],
    };

    const buttonSelectors = [
      "button",
      'input[type="submit"]',
      'input[type="button"]',
      '[role="button"]',
      'a[class*="button"]',
    ];

    const allButtons = [];
    buttonSelectors.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => allButtons.push(el));
    });

    allButtons.forEach((button) => {
      const buttonText = button.textContent.trim().toLowerCase();
      const buttonType = button.type?.toLowerCase() || "";
      const buttonClass = button.className.toLowerCase();
      const buttonId = button.id.toLowerCase();
      const ariaLabel = button.getAttribute("aria-label")?.toLowerCase() || "";

      const buttonData = {
        element: button,
        text: button.textContent.trim(),
        type: buttonType,
        disabled: button.disabled,
        visible: this.isFieldVisible(button),
        className: button.className,
        id: button.id,
        dataAttributes: this.getDataAttributes(button),
      };

      if (
        buttonText.includes("continue") ||
        buttonText.includes("next") ||
        buttonClass.includes("continue") ||
        buttonId.includes("continue") ||
        ariaLabel.includes("continue")
      ) {
        buttons.continue = buttonData;
      } else if (
        buttonText.includes("preview") ||
        buttonClass.includes("preview") ||
        buttonId.includes("preview") ||
        ariaLabel.includes("preview")
      ) {
        buttons.preview = buttonData;
      } else if (
        buttonText.includes("submit") ||
        buttonType === "submit" ||
        buttonClass.includes("submit") ||
        buttonId.includes("submit") ||
        ariaLabel.includes("submit")
      ) {
        buttons.submit = buttonData;
      } else if (
        buttonText.includes("back") ||
        buttonText.includes("previous") ||
        buttonClass.includes("back") ||
        buttonId.includes("back") ||
        ariaLabel.includes("back")
      ) {
        buttons.back = buttonData;
      } else if (
        buttonText.includes("cancel") ||
        buttonClass.includes("cancel") ||
        buttonId.includes("cancel") ||
        ariaLabel.includes("cancel")
      ) {
        buttons.cancel = buttonData;
      } else {
        buttons.other.push(buttonData);
      }
    });

    this.buttons = buttons;
    return buttons;
  }

  getCurrentStep() {
    const activeStepSelectors = [
      '[class*="step"].active',
      '[class*="step"].current',
      '[aria-current="step"]',
      '[data-active="true"]',
      ".ia-StepIndicator.active",
    ];

    for (const selector of activeStepSelectors) {
      const activeStep = document.querySelector(selector);
      if (activeStep) {
        const stepAttr =
          activeStep.getAttribute("data-step") ||
          activeStep.getAttribute("data-step-index") ||
          activeStep.getAttribute("aria-posinset");
        if (stepAttr) {
          return parseInt(stepAttr, 10);
        }

        const parent = activeStep.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children);
          return siblings.indexOf(activeStep);
        }
      }
    }

    const progressBar = document.querySelector('[role="progressbar"]');
    if (progressBar) {
      const valueNow = progressBar.getAttribute("aria-valuenow");
      const valueMax = progressBar.getAttribute("aria-valuemax");
      if (valueNow && valueMax) {
        return Math.floor(
          (parseInt(valueNow) / parseInt(valueMax)) * this.getStepCount()
        );
      }
    }

    return 0;
  }

  getStepCount() {
    const stepSelectors = [
      '[class*="step-indicator"]',
      '[class*="stepper"] > *',
      '[role="progressbar"]',
      ".ia-StepIndicator",
    ];

    for (const selector of stepSelectors) {
      const steps = document.querySelectorAll(selector);
      if (steps.length > 0) {
        return steps.length;
      }
    }

    const progressBar = document.querySelector('[role="progressbar"]');
    if (progressBar) {
      const valueMax = progressBar.getAttribute("aria-valuemax");
      if (valueMax) {
        return parseInt(valueMax, 10);
      }
    }

    const stepCountElement = document.querySelector("[data-step-count]");
    if (stepCountElement) {
      return parseInt(stepCountElement.getAttribute("data-step-count"), 10);
    }

    return 1;
  }

  isFieldVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return false;
    }

    return true;
  }

  getDataAttributes(element) {
    const dataAttrs = {};
    Array.from(element.attributes).forEach((attr) => {
      if (attr.name.startsWith("data-")) {
        dataAttrs[attr.name] = attr.value;
      }
    });
    return dataAttrs;
  }

  getFormData() {
    const formData = {};

    this.formFields.forEach((field) => {
      if (field.type === "radio-group") {
        formData[field.name] = field.selectedValue;
      } else if (field.type === "checkbox") {
        formData[field.name] = field.checked;
      } else {
        formData[field.name] = field.value;
      }
    });

    return formData;
  }

  getCompletionStatus() {
    const requiredFields = this.formFields.filter((f) => f.required);
    const filledRequiredFields = requiredFields.filter((f) => {
      if (f.type === "checkbox") {
        return f.checked;
      }
      return f.value && f.value.trim() !== "";
    });

    return {
      totalFields: this.formFields.length,
      requiredFields: requiredFields.length,
      filledRequiredFields: filledRequiredFields.length,
      isComplete: filledRequiredFields.length === requiredFields.length,
      percentComplete:
        requiredFields.length > 0
          ? Math.round(
              (filledRequiredFields.length / requiredFields.length) * 100
            )
          : 0,
    };
  }

  extractAllData() {
    this.detectFormStructure();
    this.extractFormFields();
    this.detectButtons();

    return {
      structure: this.formStructure,
      fields: this.formFields,
      buttons: this.buttons,
      formData: this.getFormData(),
      completion: this.getCompletionStatus(),
      currentStep: this.currentStepIndex,
      totalSteps: this.totalSteps,
    };
  }

  waitForFormLoad(timeout = 5000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkForm = () => {
        this.detectFormStructure();

        if (this.formContainer) {
          resolve(true);
          return;
        }

        if (Date.now() - startTime >= timeout) {
          reject(new Error("Form load timeout"));
          return;
        }

        setTimeout(checkForm, 100);
      };

      checkForm();
    });
  }

  observeFormChanges(callback) {
    if (!this.formContainer) {
      this.detectFormStructure();
    }

    if (!this.formContainer) {
      console.error("Form container not found");
      return null;
    }

    const observer = new MutationObserver((mutations) => {
      this.extractFormFields();
      this.detectButtons();
      callback(this.extractAllData());
    });

    observer.observe(this.formContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "disabled", "required"],
    });

    return observer;
  }
}
