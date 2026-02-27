// platforms/smartrecruiters/smartrecruiters-form-handler.js

import { AIResponseUtils } from "../../shared/utilities/index.js";

const SKIP_WORDS = [
  "diversity",
  "survey",
  "veteran ID classification",
];
const COVER_LETTER_LABEL =
  "Let the company know about your interest working there";
const COVER_LETTER_SUFFIX = " (write cover letter)";
const LANGUAGE_LABEL_PATTERNS = [
  /^language input for entry \d+$/i,
  /^level for .*language entry \d+$/i,
  /^level for language entry \d+$/i,
];
const LANGUAGE_LEVEL_MAPPING = {
  native: "Native",
  "c2 mastery": "Fluent",
  c2: "Fluent",
  "c1 advanced": "Fluent",
  c1: "Fluent",
  "b2 upper intermediate": "Advanced",
  b2: "Advanced",
  "b1 intermediate": "Intermediate",
  b1: "Intermediate",
  "a2 elementary": "Beginner",
  a2: "Beginner",
  "a1 beginner": "Beginner",
  a1: "Beginner",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  fluent: "Fluent",
};

export class SmartRecruitersFormHandler {
  constructor(config = {}) {
    this.userData = config.userData || {};
    this.aiService = config.aiService || null;
    this.jobDescription = config.jobDescription || "";
    this.backendApiHost = config.backendApiHost || "";
    this.aiApiHost = config.aiApiHost || "";
    this.jwtToken = config.jwtToken || "";

    // Track processed fields to avoid duplicates
    this.processedFields = new Set();
    this.answerCache = new Map();

    // Controls filled directly by experience/education expansion (skip in AI loop)
    this.directFilledControls = new Set();

    // Prevent double expansion of experience/education on retry
    this.sectionsExpanded = false;

    // Co-pilot action promise (for waiting on user Next/Submit)
    this.userActionPromise = null;
    this.userActionResolver = null;
  }

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

  /**
   * Reset handler state for a new application
   */
  reset() {
    this.processedFields.clear();
    this.answerCache.clear();
    this.directFilledControls.clear();
    this.sectionsExpanded = false;
  }

  /**
   * Update user data (used when profile is received)
   */
  setUserData(userData) {
    this.userData = userData || {};
  }

  /**
   * Update job description
   */
  setJobDescription(description) {
    this.jobDescription = description || "";
  }

  // ========================================
  // DEEP SHADOW DOM QUERY HELPERS
  // ========================================

  /**
   * Query selector that traverses shadow DOM
   */
  querySelectorDeep(rootOrSelector, selectorMaybe) {
    let root;
    let selector;

    if (typeof rootOrSelector === "string" && selectorMaybe === undefined) {
      root = document;
      selector = rootOrSelector;
    } else {
      root = rootOrSelector || document;
      selector = selectorMaybe;
    }

    if (!root || !selector) return null;

    const selectors = selector
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (selectors.length === 0) return null;

    const seen = new Set();

    const visit = (node) => {
      if (!node || seen.has(node)) return null;
      seen.add(node);

      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node;
        if (selectors.some((sel) => element.matches?.(sel))) {
          return element;
        }

        if (element.shadowRoot) {
          const matchInShadow = visit(element.shadowRoot);
          if (matchInShadow) return matchInShadow;
        }

        if (element.tagName === "SLOT") {
          let assignedNodes = [];
          try {
            assignedNodes = element.assignedNodes({ flatten: true });
          } catch {
            assignedNodes = element.assignedNodes();
          }
          for (const assigned of assignedNodes) {
            const matchInAssigned = visit(assigned);
            if (matchInAssigned) return matchInAssigned;
          }
        }

        const children = element.children;
        for (let i = 0; i < children.length; i++) {
          const childMatch = visit(children[i]);
          if (childMatch) return childMatch;
        }
      } else if (
        node.nodeType === Node.DOCUMENT_FRAGMENT_NODE ||
        node.nodeType === Node.DOCUMENT_NODE
      ) {
        const childNodes = node.childNodes;
        for (let i = 0; i < childNodes.length; i++) {
          const fragmentMatch = visit(childNodes[i]);
          if (fragmentMatch) return fragmentMatch;
        }
      }

      return null;
    };

    return visit(root);
  }

  /**
   * Query selector all that traverses shadow DOM
   */
  querySelectorAllDeep(rootOrSelector, selectorMaybe) {
    let root;
    let selector;

    if (typeof rootOrSelector === "string" && selectorMaybe === undefined) {
      root = document;
      selector = rootOrSelector;
    } else {
      root = rootOrSelector || document;
      selector = selectorMaybe;
    }

    if (!root || !selector) return [];

    const selectors = selector
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (selectors.length === 0) return [];

    const results = [];
    const seen = new Set();

    const visit = (node) => {
      if (!node || seen.has(node)) return;
      seen.add(node);

      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node;
        if (selectors.some((sel) => element.matches?.(sel))) {
          results.push(element);
        }

        if (element.shadowRoot) {
          visit(element.shadowRoot);
        }

        if (element.tagName === "SLOT") {
          let assignedNodes = [];
          try {
            assignedNodes = element.assignedNodes({ flatten: true });
          } catch {
            assignedNodes = element.assignedNodes();
          }
          assignedNodes.forEach((assigned) => visit(assigned));
        }

        const children = element.children;
        for (let i = 0; i < children.length; i++) {
          visit(children[i]);
        }
      } else if (
        node.nodeType === Node.DOCUMENT_FRAGMENT_NODE ||
        node.nodeType === Node.DOCUMENT_NODE
      ) {
        const childNodes = node.childNodes;
        for (let i = 0; i < childNodes.length; i++) {
          visit(childNodes[i]);
        }
      }
    };

    visit(root);
    return results;
  }

  /**
   * Get inner form control from custom element
   */
  getInnerFormControl(element) {
    if (!element) return null;

    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
    ) {
      return element;
    }

    if (element.shadowRoot) {
      const inner = element.shadowRoot.querySelector("input, select, textarea");
      if (inner) return inner;
    }

    if (typeof element.querySelector === "function") {
      const inner = element.querySelector("input, select, textarea");
      if (inner) return inner;
    }

    return null;
  }

  // ========================================
  // LABEL EXTRACTION HELPERS
  // ========================================

  cleanLabelText(text) {
    if (!text) return "";
    return text
      .replace(/Value is required/gi, "")
      .replace(/This field is required/gi, "")
      .replace(/[*✱]/g, "")
      .replace(/\s+/g, " ")
      .replace(/\(required\)/i, "")
      .replace(/\(optional\)/i, "")
      .trim();
  }

  cssEscapeIdentifier(value) {
    if (!value) return "";
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(value);
    }
    return value.replace(/[^a-zA-Z0-9_\-]/g, (match) => `\\${match}`);
  }

  parseLabelElement(element) {
    if (!element) return { label: null, requiredHint: false };
    const text = this.cleanLabelText(element.textContent || "");
    if (!text) return { label: null, requiredHint: false };
    const requiredHint = !!(
      element.querySelector?.(
        '[aria-hidden="true"],[data-required="true"],.required-indicator',
      ) || /\*/.test(element.textContent || "")
    );
    return { label: text, requiredHint };
  }

  findLabelInDocument(control) {
    const id = control?.id;
    if (id) {
      const selector = `[for="${this.cssEscapeIdentifier(id)}"]`;
      const labelEl = document.querySelector(selector);
      const info = this.parseLabelElement(labelEl);
      if (info.label) return info;
    }
    if (typeof control.closest === "function") {
      const parentLabel = control.closest("label");
      const info = this.parseLabelElement(parentLabel);
      if (info.label) return info;
    }
    const ariaLabelledBy = control?.getAttribute?.("aria-labelledby");
    if (ariaLabelledBy) {
      const ids = ariaLabelledBy.split(/\s+/).filter(Boolean);
      const pieces = ids
        .map((labelId) => document.getElementById(labelId))
        .filter((node) => !!node)
        .map((node) => this.cleanLabelText(node.textContent || ""))
        .filter((text) => !!text);
      if (pieces.length > 0) {
        return { label: pieces.join(" ").trim(), requiredHint: false };
      }
    }
    return { label: null, requiredHint: false };
  }

  extractLabelFromSlots(root) {
    if (!root || typeof root.querySelectorAll !== "function") return null;

    const slotSelectors = [
      'slot[name="label-content"]',
      'slot[name="label"]',
      'slot[name="question"]',
    ];

    for (const selector of slotSelectors) {
      const slot = root.querySelector(selector);
      const label = this.getAssignedSlotText(slot);
      if (label) return label;
    }

    return null;
  }

  getAssignedSlotText(slot) {
    if (!slot) return "";

    let assignedNodes = [];
    if (typeof slot.assignedNodes === "function") {
      try {
        assignedNodes = slot.assignedNodes({ flatten: true });
      } catch {
        assignedNodes = slot.assignedNodes();
      }
    } else if (slot.childNodes) {
      assignedNodes = Array.from(slot.childNodes);
    }

    const pieces = [];
    assignedNodes.forEach((node) => {
      const text = node?.textContent;
      if (text) pieces.push(text);
    });

    return this.cleanLabelText(pieces.join(" "));
  }

  findLabelInHost(host) {
    if (!host) return { label: null, requiredHint: false };

    const requiredHint = !!(
      host.hasAttribute?.("required") ||
      host.getAttribute?.("aria-required") === "true" ||
      host.dataset?.required === "true"
    );

    if (typeof host.getAttribute === "function") {
      const attrLabel =
        host.getAttribute("label") ||
        host.getAttribute("aria-label") ||
        host.dataset?.label;
      if (attrLabel) {
        return { label: this.cleanLabelText(attrLabel), requiredHint };
      }
    }

    const selectors = [
      'label[slot="label"]',
      '[slot="label"]',
      ".c-spl-form-field-label-wrapper",
      ".c-spl-form-field-label",
      "spl-typography-label",
      "legend",
      '[slot="label-content"]',
      ".question-label",
      '[data-test="question-label"]',
    ];

    for (const source of [host, host?.shadowRoot]) {
      if (!source) continue;
      for (const selector of selectors) {
        const labelEl = source.querySelector?.(selector);
        const info = this.parseLabelElement(labelEl);
        if (info.label) {
          return {
            label: info.label,
            requiredHint: requiredHint || info.requiredHint,
          };
        }
      }
    }

    const slotLabel =
      this.extractLabelFromSlots(host) ||
      this.extractLabelFromSlots(host.shadowRoot);
    if (slotLabel) {
      return { label: slotLabel, requiredHint };
    }

    return { label: null, requiredHint };
  }

  extractFieldLabelData(control) {
    // For spl-radio/spl-checkbox, use direct parent walk instead of generic
    // traversal which can climb to shared ancestors and return wrong labels
    const controlTag = control?.tagName?.toLowerCase();
    if (controlTag === "spl-radio" || controlTag === "spl-checkbox") {
      const directResult = this.extractSplRadioCheckboxLabel(control);
      if (directResult) {
        return { label: directResult.label, requiredHint: directResult.requiredHint };
      }
      // If direct walk fails, return null rather than risking the wrong label
      // from the generic traversal
      return { label: null, requiredHint: false };
    }

    const visitedHosts = new Set();
    let current = control;

    while (current) {
      const root = current.getRootNode?.();
      if (!root) break;

      if (root.host && !visitedHosts.has(root.host)) {
        const hostInfo = this.findLabelInHost(root.host);
        visitedHosts.add(root.host);
        if (hostInfo.label) return hostInfo;
        current = root.host;
        continue;
      }

      if (root instanceof Document) {
        const info = this.findLabelInDocument(control);
        if (info.label) return info;
        break;
      }

      if (!root.host && current.parentElement) {
        current = current.parentElement;
      } else {
        break;
      }
    }

    const fallbackLabel =
      control?.getAttribute?.("aria-label") ||
      control?.getAttribute?.("placeholder");
    if (fallbackLabel) {
      return { label: this.cleanLabelText(fallbackLabel), requiredHint: false };
    }

    return { label: null, requiredHint: false };
  }

  // ========================================
  // DROPDOWN HANDLING
  // ========================================

  getSmartRecruitersDropdownHost(element) {
    let current = element;

    while (current) {
      if (current.closest) {
        const direct = current.closest("spl-dropdown");
        if (direct) return direct;
      }

      const root = current.getRootNode ? current.getRootNode() : null;
      const host = root?.host;
      if (!host) break;

      if (host.matches?.("spl-dropdown")) return host;
      current = host;
    }

    return null;
  }

  isSmartRecruitersDropdownInput(element) {
    if (!element) return false;
    if (element.getAttribute?.("role") === "combobox") return true;
    if (element.getAttribute?.("aria-haspopup") === "true") return true;
    if (this.getSmartRecruitersDropdownHost(element)) return true;
    return false;
  }

  /**
   * Check if element is inside a multiselect autocomplete component
   */
  isMultiSelectAutocomplete(element) {
    if (!element) return false;
    try {
      let current = element;
      const visited = new Set();
      while (current && !visited.has(current)) {
        visited.add(current);
        if (current.tagName?.toLowerCase() === "spl-multiselect-autocomplete") {
          return true;
        }
        if (current.getAttribute?.("aria-multiselectable") === "true") {
          return true;
        }
        // Check parent element
        if (current.parentElement) {
          current = current.parentElement;
          continue;
        }
        // Check shadow root host
        const root = current.getRootNode?.();
        if (root?.host) {
          current = root.host;
          continue;
        }
        break;
      }
    } catch (error) {
    }
    return false;
  }

  /**
   * Extract option texts from a multiselect autocomplete's DOM (spl-select-option elements)
   */
  extractMultiSelectOptionsFromDOM(input) {
    if (!input) return [];
    try {
      let current = input;
      let multiselectHost = null;
      const visited = new Set();
      while (current && !visited.has(current)) {
        visited.add(current);
        if (current.tagName?.toLowerCase() === "spl-multiselect-autocomplete") {
          multiselectHost = current;
          break;
        }
        if (current.parentElement) {
          current = current.parentElement;
          continue;
        }
        const root = current.getRootNode?.();
        if (root?.host) {
          current = root.host;
          continue;
        }
        break;
      }

      if (!multiselectHost) return [];

      const selectOptions = this.querySelectorAllDeep(
        multiselectHost,
        "spl-select-option",
      );
      const optionTexts = [];
      for (const opt of selectOptions) {
        const text = this.extractDropdownOptionText(opt);
        if (text && text.trim()) {
          optionTexts.push(text.trim());
        }
      }
      return optionTexts;
    } catch (error) {
      return [];
    }
  }

  findDropdownOptions(dropdownHost, menuId) {
    const selectors = [
      "spl-select-option",
      '[role="option"]',
      '[data-test="dropdown-option"]',
      ".c-spl-autocomplete-option-content",
    ];

    const options = [];

    if (menuId) {
      // Try document-level lookup first
      let menu = document.getElementById(menuId);

      // If not found (element is in shadow DOM), search within dropdownHost light DOM
      if (!menu && dropdownHost) {
        menu = dropdownHost.querySelector?.(`#${CSS.escape(menuId)}`);
      }

      if (menu) {
        options.push(...menu.querySelectorAll(selectors.join(",")));
      }
    }

    if (dropdownHost?.shadowRoot) {
      options.push(
        ...dropdownHost.shadowRoot.querySelectorAll(selectors.join(",")),
      );
    }

    if (dropdownHost) {
      options.push(...dropdownHost.querySelectorAll(selectors.join(",")));
    }

    // Deduplicate (same element may be found via multiple paths)
    const unique = [...new Set(options)];

    return unique.filter((option) => {
      const rect = option.getBoundingClientRect?.();
      return rect && rect.width > 0 && rect.height > 0;
    });
  }

  extractDropdownOptionText(option) {
    if (!option) return "";

    const textCandidates = [];
    const addCandidate = (value) => {
      if (value) textCandidates.push(this.cleanLabelText(String(value)));
    };

    addCandidate(option.textContent);
    addCandidate(option.getAttribute?.("label"));
    addCandidate(option.getAttribute?.("aria-label"));
    addCandidate(option.getAttribute?.("value"));
    addCandidate(option.dataset?.label);
    addCandidate(option.dataset?.value);

    if (option.shadowRoot) {
      addCandidate(option.shadowRoot.textContent);
      const slot = option.shadowRoot.querySelector?.("slot");
      if (slot) addCandidate(this.getAssignedSlotText(slot));
    }

    const filtered = textCandidates
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    return filtered[0] || "";
  }

  getDropdownClickableTarget(option) {
    if (!option) return null;

    if (option.shadowRoot) {
      const button = option.shadowRoot.querySelector(
        'button, [role="option"], .c-spl-autocomplete-option-content',
      );
      if (button) return button;
    }

    const descendants = option.querySelectorAll(
      'button, [role="option"], .c-spl-autocomplete-option-content',
    );
    if (descendants.length > 0) return descendants[0];

    return option;
  }

  async waitForDropdownOptions(dropdownHost, menuId, maxWaitMs = 10000) {
    const pollIntervalMs = 1000;
    const maxAttempts = Math.max(1, Math.ceil(maxWaitMs / pollIntervalMs));
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const options = this.findDropdownOptions(dropdownHost, menuId);
      if (options.length > 0) {
        return options;
      }

      if (attempt < maxAttempts) {
        await this.delay(pollIntervalMs);
      }
    }

    return [];
  }

  normalizeMatchValue(value) {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) {
      for (const item of value) {
        const normalized = this.normalizeMatchValue(item);
        if (normalized) return normalized;
      }
      return "";
    }
    if (typeof value === "object") {
      const candidates = ["label", "value", "name", "title", "text"];
      for (const key of candidates) {
        const candidateValue = value[key];
        if (candidateValue !== undefined && candidateValue !== null) {
          const normalized = this.normalizeMatchValue(candidateValue);
          if (normalized) return normalized;
        }
      }
      return "";
    }
    return this.cleanLabelText(String(value)).toLowerCase();
  }

  setNativeValue(element, value) {
    const ownPropertyDescriptor = Object.getOwnPropertyDescriptor(
      element,
      "value",
    );

    if (!ownPropertyDescriptor) {
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    const valueSetter = ownPropertyDescriptor.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(
      prototype,
      "value",
    )?.set;

    if (
      valueSetter &&
      prototypeValueSetter &&
      valueSetter !== prototypeValueSetter
    ) {
      prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async selectFirstDropdownOption(inputElement) {
    if (!inputElement) {
      return false;
    }

    const dropdownHost = this.getSmartRecruitersDropdownHost(inputElement);
    const menuId =
      inputElement.getAttribute?.("aria-controls") ||
      dropdownHost?.getAttribute?.("aria-controls");

    inputElement.focus?.();
    inputElement.dispatchEvent?.(
      new Event("focus", { bubbles: true, composed: true }),
    );
    inputElement.click?.();

    const currentValue = inputElement.value;
    if (currentValue) {
      await this.replayTypingForDropdown(inputElement, currentValue);
    }

    const arrowInit = {
      key: "ArrowDown",
      code: "ArrowDown",
      keyCode: 40,
      which: 40,
      bubbles: true,
      composed: true,
    };
    inputElement.dispatchEvent?.(new KeyboardEvent("keydown", arrowInit));
    inputElement.dispatchEvent?.(new KeyboardEvent("keyup", arrowInit));

    const options = await this.waitForDropdownOptions(dropdownHost, menuId);
    if (options.length === 0) {
      return false;
    }

    const desiredValueRaw = (inputElement.value || "").trim();
    const desiredValueNormalized = this.normalizeMatchValue(desiredValueRaw);
    let selectedOption = null;
    let selectedOptionText = "";

    if (desiredValueNormalized) {
      for (const option of options) {
        const optionText = this.extractDropdownOptionText(option);
        if (!optionText) continue;
        const normalizedOptionText = this.normalizeMatchValue(optionText);
        if (
          normalizedOptionText &&
          normalizedOptionText === desiredValueNormalized
        ) {
          selectedOption = option;
          selectedOptionText = optionText;
          break;
        }
      }
    }

    if (!selectedOption) {
      selectedOption = options[0];
      selectedOptionText =
        this.extractDropdownOptionText(selectedOption) ||
        selectedOption.textContent?.trim() ||
        "";
    }

    const target = this.getDropdownClickableTarget(selectedOption);
    if (!target) {
      return false;
    }

    target.dispatchEvent?.(
      new PointerEvent("pointerover", { bubbles: true, composed: true }),
    );
    target.dispatchEvent?.(
      new PointerEvent("pointerenter", { bubbles: false, composed: true }),
    );
    target.dispatchEvent?.(
      new PointerEvent("pointerdown", { bubbles: true, composed: true }),
    );
    target.dispatchEvent?.(
      new MouseEvent("mouseover", { bubbles: true, composed: true }),
    );
    target.dispatchEvent?.(
      new MouseEvent("mouseenter", { bubbles: false, composed: true }),
    );
    target.dispatchEvent?.(
      new MouseEvent("mousedown", { bubbles: true, composed: true }),
    );
    target.click?.();
    if (selectedOptionText) {
      this.setNativeValue(inputElement, selectedOptionText);
    }
    target.dispatchEvent?.(
      new MouseEvent("mouseup", { bubbles: true, composed: true }),
    );
    target.dispatchEvent?.(
      new PointerEvent("pointerup", { bubbles: true, composed: true }),
    );

    await this.delay(200);
    const enterInit = {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      composed: true,
    };
    inputElement.dispatchEvent?.(new KeyboardEvent("keydown", enterInit));
    inputElement.dispatchEvent?.(new KeyboardEvent("keyup", enterInit));
    inputElement.dispatchEvent?.(
      new Event("change", { bubbles: true, composed: true }),
    );

    if (dropdownHost?.hasAttribute?.("open")) {
      dropdownHost.removeAttribute("open");
    }

    if (inputElement.getAttribute?.("aria-expanded") === "true") {
      const escapeInit = {
        key: "Escape",
        code: "Escape",
        keyCode: 27,
        which: 27,
        bubbles: true,
        composed: true,
      };
      inputElement.dispatchEvent?.(new KeyboardEvent("keydown", escapeInit));
      inputElement.dispatchEvent?.(new KeyboardEvent("keyup", escapeInit));
    }

    return true;
  }

  async replayTypingForDropdown(inputElement, text) {
    if (!inputElement || !text) return;

    this.setNativeValue(inputElement, "");
    inputElement.dispatchEvent?.(
      new Event("input", { bubbles: true, composed: true }),
    );
    await this.delay(50);

    for (const char of text) {
      const eventInit = this.buildKeyboardEventInit(char);
      inputElement.dispatchEvent?.(new KeyboardEvent("keydown", eventInit));
      inputElement.dispatchEvent?.(new KeyboardEvent("keypress", eventInit));

      const nextValue = `${inputElement.value || ""}${char}`;
      this.setNativeValue(inputElement, nextValue);
      inputElement.dispatchEvent?.(
        new Event("input", { bubbles: true, composed: true }),
      );
      inputElement.dispatchEvent?.(new KeyboardEvent("keyup", eventInit));

      await this.delay(50);
    }
  }

  buildKeyboardEventInit(char) {
    const isSingleChar = typeof char === "string" && char.length === 1;
    const upper = isSingleChar ? char.toUpperCase() : "";
    const keyCode = isSingleChar ? upper.charCodeAt(0) : 0;

    return {
      key: char,
      code:
        isSingleChar && /[A-Z]/.test(upper)
          ? `Key${upper}`
          : isSingleChar
            ? `Key${upper}`
            : "KeyA",
      keyCode,
      which: keyCode,
      bubbles: true,
      composed: true,
    };
  }

  // ========================================
  // FORM CONTROL COLLECTION
  // ========================================

  isSupportedControl(element) {
    if (!element || !element.tagName) return false;

    const tag = element.tagName.toLowerCase();
    if (tag === "textarea" || tag === "select") return true;
    if (tag === "spl-radio") return true;
    if (tag === "spl-checkbox") return true;

    if (tag !== "input") return false;

    const type = (element.getAttribute("type") || "text").toLowerCase();
    if (
      ["hidden", "file", "submit", "button", "reset", "image"].includes(type)
    ) {
      return false;
    }

    return true;
  }

  getControlType(element) {
    if (!element || !element.tagName) return null;

    const tag = element.tagName.toLowerCase();
    if (tag === "textarea") return "textarea";
    if (tag === "select") return "select";
    if (tag === "spl-radio") return "radio";
    if (tag === "spl-checkbox") return "checkbox";

    if (tag === "input") {
      const type = (element.getAttribute("type") || "text").toLowerCase();
      if (
        ["hidden", "file", "submit", "reset", "button", "image"].includes(type)
      ) {
        return null;
      }
      return type;
    }

    return null;
  }

  collectFormControls(root) {
    const results = [];
    const seen = new Set();

    const traverse = (node) => {
      if (!node || seen.has(node)) return;
      seen.add(node);

      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node;
        if (this.isSupportedControl(element)) {
          results.push(element);
        }
        if (element.shadowRoot) {
          traverse(element.shadowRoot);
        }

        // Follow slot assigned nodes to reach slotted content in shadow DOMs
        if (element.tagName === "SLOT") {
          let assignedNodes = [];
          try {
            assignedNodes = element.assignedNodes({ flatten: true });
          } catch {
            try {
              assignedNodes = element.assignedNodes();
            } catch {
              // ignore
            }
          }
          for (const assigned of assignedNodes) {
            traverse(assigned);
          }
        }

        const children = element.children;
        for (let i = 0; i < children.length; i++) {
          traverse(children[i]);
        }
      } else if (
        node.nodeType === Node.DOCUMENT_FRAGMENT_NODE ||
        node.nodeType === Node.DOCUMENT_NODE
      ) {
        const childNodes = node.childNodes;
        for (let i = 0; i < childNodes.length; i++) {
          traverse(childNodes[i]);
        }
      }
    };

    traverse(root);
    return results;
  }

  /**
   * Find autocomplete inputs (multiselect, search) that collectFormControls may have missed
   * due to shadow DOM timing or traversal gaps. Mutates the controls array in place.
   */
  findMissedAutocompleteInputs(formRoot, controls) {
    const controlSet = new Set(controls);

    // Search both the form root and document body (fields may be outside form)
    const searchRoots = [formRoot];
    if (formRoot !== document.body && formRoot !== document.documentElement) {
      searchRoots.push(document.body);
    }

    for (const searchRoot of searchRoots) {
      // Find spl-multiselect-autocomplete elements
      const multiselects = this.querySelectorAllDeep(
        searchRoot,
        "spl-multiselect-autocomplete",
      );
      for (const ms of multiselects) {
        const innerInput = this.querySelectorDeep(
          ms,
          'input[role="combobox"]',
        );
        if (innerInput && !controlSet.has(innerInput)) {
          controls.push(innerInput);
          controlSet.add(innerInput);
        }
      }

      // Find search autocomplete inputs (e.g., location/city)
      const autocompleteRoots = this.querySelectorAllDeep(
        searchRoot,
        '[data-sr-id*="autocomplete-search-root"]',
      );
      for (const root of autocompleteRoots) {
        const innerInput = this.querySelectorDeep(
          root,
          'input[role="combobox"]',
        );
        if (innerInput && !controlSet.has(innerInput)) {
          controls.push(innerInput);
          controlSet.add(innerInput);
        }
      }
    }
  }

  /**
   * Find spl-radio and spl-checkbox elements that collectFormControls may have missed
   * due to nested shadow DOM boundaries (e.g., inside sr-question-field-radio).
   * Uses querySelectorAllDeep which properly traverses all shadow roots and slots.
   */
  findMissedRadioCheckboxInputs(formRoot, controls) {
    const controlSet = new Set(controls);
    const beforeCount = controls.length;

    const searchRoots = [formRoot];
    if (formRoot !== document.body && formRoot !== document.documentElement) {
      searchRoots.push(document.body);
    }

    for (const searchRoot of searchRoots) {
      // Find all spl-radio and spl-checkbox elements via deep traversal
      const splControls = this.querySelectorAllDeep(
        searchRoot,
        "spl-radio, spl-checkbox",
      );
      console.log(`[SR-DEBUG] findMissedRadioCheckboxInputs: querySelectorAllDeep found ${splControls.length} spl-radio/spl-checkbox in`, searchRoot.tagName || 'root');
      for (const ctrl of splControls) {
        if (!controlSet.has(ctrl)) {
          console.log(`[SR-DEBUG] Adding missed spl-radio/checkbox:`, ctrl.tagName, ctrl.getAttribute?.('label'), ctrl.id);
          controls.push(ctrl);
          controlSet.add(ctrl);
        }
      }
    }

    console.log(`[SR-DEBUG] findMissedRadioCheckboxInputs: added ${controls.length - beforeCount} missed controls`);
  }

  isControlRequired(control) {
    if (!control) return false;

    if (
      control.required ||
      control.hasAttribute?.("required") ||
      control.getAttribute?.("aria-required") === "true"
    ) {
      return true;
    }

    const visitedHosts = new Set();
    let current = control;
    while (current) {
      const root = current.getRootNode?.();
      const host = root?.host;
      if (!host || visitedHosts.has(host)) break;
      if (
        host.hasAttribute?.("required") ||
        host.getAttribute?.("aria-required") === "true" ||
        host.classList?.contains?.("required")
      ) {
        return true;
      }
      if (host.shadowRoot) {
        const indicator = host.shadowRoot.querySelector(
          '[aria-hidden="true"], .required-indicator, [data-required="true"]',
        );
        if (indicator && /\*/.test(indicator.textContent || "")) {
          return true;
        }
      }
      visitedHosts.add(host);
      current = host;
    }

    return false;
  }

  findHostAncestor(element, selector) {
    if (!element || !selector) return null;

    const selectorList = selector
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (selectorList.length === 0) return null;

    const visited = new Set();
    const queue = [element];
    let iterations = 0;

    while (queue.length > 0 && iterations < 200) {
      const current = queue.shift();
      if (!current || visited.has(current)) continue;

      visited.add(current);
      iterations++;

      if (
        current.nodeType === Node.ELEMENT_NODE &&
        selectorList.some((sel) => sel && current.matches?.(sel))
      ) {
        return current;
      }

      const root = current.getRootNode?.();
      if (root?.host && !visited.has(root.host)) {
        queue.push(root.host);
      }

      if (current.assignedSlot && !visited.has(current.assignedSlot)) {
        queue.push(current.assignedSlot);
      }

      if (current.parentElement && !visited.has(current.parentElement)) {
        queue.push(current.parentElement);
      }

      if (
        current.parentNode &&
        current.parentNode !== current &&
        !visited.has(current.parentNode)
      ) {
        queue.push(current.parentNode);
      }

      if (
        current instanceof ShadowRoot &&
        current.host &&
        !visited.has(current.host)
      ) {
        queue.push(current.host);
      }
    }

    return null;
  }

  findOptionLabel(control) {
    if (!control) return null;

    const id = control.id;
    if (id) {
      const selector = `[for="${this.cssEscapeIdentifier(id)}"]`;
      const root = control.getRootNode?.();
      if (root?.querySelector) {
        const labelEl = root.querySelector(selector);
        const info = this.parseLabelElement(labelEl);
        if (info.label) return info.label;
      }
      const docLabel = document.querySelector(selector);
      const info = this.parseLabelElement(docLabel);
      if (info.label) return info.label;
    }

    if (typeof control.closest === "function") {
      const parentLabel = control.closest("label");
      const info = this.parseLabelElement(parentLabel);
      if (info.label) return info.label;
    }

    const host = this.findHostAncestor(
      control,
      "spl-radio, spl-checkbox, spl-select-option, spl-option, spl-autocomplete-option",
    );
    if (host) {
      const attrLabel =
        host.getAttribute?.("label") ||
        host.getAttribute?.("aria-label") ||
        host.dataset?.label;
      if (attrLabel) {
        const cleaned = this.cleanLabelText(attrLabel);
        if (cleaned) return cleaned;
      }

      const hostSlotLabel =
        this.extractLabelFromSlots(host) ||
        this.extractLabelFromSlots(host.shadowRoot);
      if (hostSlotLabel) return hostSlotLabel;
    }

    const ariaLabel = control.getAttribute?.("aria-label");
    if (ariaLabel) return this.cleanLabelText(ariaLabel);

    const value = control.value;
    if (value) return this.cleanLabelText(value);

    return null;
  }

  collectOptionCandidates(control) {
    if (!control) return [];

    const candidates = new Set();
    const addCandidate = (val) => {
      if (val === null || val === undefined) return;
      const cleaned = this.cleanLabelText(String(val));
      if (cleaned) candidates.add(cleaned);
    };

    addCandidate(control.value);
    addCandidate(control.getAttribute?.("value"));
    addCandidate(control.getAttribute?.("data-value"));
    addCandidate(control.getAttribute?.("aria-label"));
    addCandidate(control.getAttribute?.("title"));
    addCandidate(control.dataset?.label);
    addCandidate(control.dataset?.value);

    const optionLabel = this.findOptionLabel(control);
    if (optionLabel) candidates.add(optionLabel);

    const controlTag = control.tagName?.toLowerCase();
    const isSplComponent = ["spl-radio", "spl-checkbox", "spl-select-option", "spl-option", "spl-autocomplete-option"].includes(controlTag);
    const host = isSplComponent
      ? control
      : this.findHostAncestor(
          control,
          "spl-radio, spl-checkbox, spl-select-option, spl-option, spl-autocomplete-option",
        );
    if (host) {
      addCandidate(host.getAttribute?.("value"));
      addCandidate(host.getAttribute?.("data-value"));
      addCandidate(host.dataset?.value);
      addCandidate(host.getAttribute?.("label"));
      addCandidate(host.getAttribute?.("aria-label"));
      addCandidate(host.dataset?.label);

      const slotLabel =
        this.extractLabelFromSlots(host) ||
        this.extractLabelFromSlots(host.shadowRoot);
      if (slotLabel) candidates.add(slotLabel);
    }

    return Array.from(candidates);
  }

  getQuestionFieldHost(element) {
    let host = this.findHostAncestor(
      element,
      "sr-question-field-radio, sr-question-field-checkbox",
    );
    if (!host) {
      const intermediate = this.findHostAncestor(
        element,
        "spl-radio, spl-checkbox",
      );
      if (intermediate) {
        host = this.findHostAncestor(
          intermediate,
          "sr-question-field-radio, sr-question-field-checkbox",
        );
      }
    }
    return host;
  }

  /**
   * Direct parent-walk label extraction for spl-radio and spl-checkbox elements.
   * Avoids the generic BFS traversal which can climb to shared ancestors and
   * return the wrong label (e.g., the first question's label for every radio).
   *
   * Walk: spl-radio → spl-radio-group → sr-question-field-radio → extract label
   */
  extractSplRadioCheckboxLabel(control) {
    const tag = control?.tagName?.toLowerCase();
    if (tag !== "spl-radio" && tag !== "spl-checkbox") return null;

    const controlId = control.id || "no-id";
    const controlLabel = control.getAttribute?.("label") || control.getAttribute?.("value") || "";

    const groupTags = ["spl-radio-group", "spl-checkbox-group"];
    const questionTags = [
      "sr-question-field-radio",
      "sr-question-field-checkbox",
    ];

    // Walk up to find the group element (spl-radio-group or spl-checkbox-group)
    let group = null;
    let current = control.parentElement;
    for (let i = 0; i < 15 && current; i++) {
      if (groupTags.includes(current.tagName?.toLowerCase())) {
        group = current;
        break;
      }
      // Also check shadow root host
      const root = current.getRootNode?.();
      if (root?.host && groupTags.includes(root.host.tagName?.toLowerCase())) {
        group = root.host;
        break;
      }
      current = current.parentElement || root?.host;
    }

    // Walk up from group to find the question host (sr-question-field-radio/checkbox)
    let questionHost = null;
    current = (group || control).parentElement;
    if (!current) {
      const root = (group || control).getRootNode?.();
      current = root?.host;
    }
    for (let i = 0; i < 15 && current; i++) {
      if (questionTags.includes(current.tagName?.toLowerCase())) {
        questionHost = current;
        break;
      }
      const root = current.getRootNode?.();
      if (root?.host && questionTags.includes(root.host.tagName?.toLowerCase())) {
        questionHost = root.host;
        break;
      }
      current = current.parentElement || root?.host;
    }

    // Extract label from question host first, then group
    let label = null;
    let requiredHint = false;

    if (questionHost) {
      label = this.extractQuestionHostLabel(questionHost);
      requiredHint = !!(
        questionHost.hasAttribute?.("required") ||
        questionHost.getAttribute?.("aria-required") === "true"
      );
    }

    if (!label && group) {
      const groupLabel =
        group.getAttribute?.("label") || group.getAttribute?.("aria-label");
      if (groupLabel) {
        label = this.cleanLabelText(groupLabel);
      }
      if (!requiredHint) {
        requiredHint = !!(
          group.hasAttribute?.("required") ||
          group.getAttribute?.("aria-required") === "true"
        );
      }
    }

    // Also try extracting from the group's shadow root label slot
    if (!label && group?.shadowRoot) {
      const slotLabel = this.extractLabelFromSlots(group.shadowRoot);
      if (slotLabel) label = slotLabel;
    }

    // Fallback: match via the screening questions definition JSON
    // (uses option values or field name to find the correct question label)
    if (!label && group) {
      const definitionMap = this.parseScreeningQuestionsDefinition();
      if (definitionMap) {
        const groupName = group.getAttribute?.("name") || "";
        // Collect option values from sibling spl-radio/spl-checkbox elements
        const optionValues = [];
        for (const child of group.children || []) {
          const childTag = child.tagName?.toLowerCase();
          if (childTag === "spl-radio" || childTag === "spl-checkbox") {
            const val =
              child.getAttribute?.("label") || child.getAttribute?.("value");
            if (val) optionValues.push(val);
          }
        }

        for (const [defLabel, defData] of definitionMap) {
          // Match by field name
          if (
            groupName &&
            defData.id &&
            groupName.toLowerCase() === defData.id.toLowerCase()
          ) {
            label = defLabel;
            break;
          }
          // Match by comparing option values
          if (defData.options?.length > 0 && optionValues.length > 0) {
            const defNormalized = new Set(
              defData.options.map((o) => o.toLowerCase().trim()),
            );
            const matchCount = optionValues.filter((v) =>
              defNormalized.has(v.toLowerCase().trim()),
            ).length;
            if (
              matchCount >= optionValues.length * 0.5 &&
              matchCount >= 1
            ) {
              label = defLabel;
              break;
            }
          }
        }
      }
    }

    const host = questionHost || group;
    console.log(`[SR-DEBUG] extractSplRadioCheckboxLabel: ${controlId} (${controlLabel.substring(0, 30)}) → group: ${group?.tagName}#${group?.id || "?"} | qHost: ${questionHost?.tagName || "null"} | label: "${label || "null"}"`);
    if (!host || !label) return null;

    return { label, requiredHint, host };
  }

  extractQuestionHostLabel(host) {
    if (!host) return null;

    const attrLabel =
      host.getAttribute?.("label") || host.getAttribute?.("aria-label");
    if (attrLabel) {
      const cleaned = this.cleanLabelText(attrLabel);
      if (cleaned) return cleaned;
    }

    const selectors = [
      '[slot="label-content"]',
      '[data-test="question-label"]',
      ".question-label",
      ".c-spl-form-field-label",
      "spl-typography-label",
      "label",
    ];

    for (const selector of selectors) {
      const node = host.querySelector?.(selector);
      if (node?.textContent) {
        const label = this.cleanLabelText(node.textContent);
        if (label) return label;
      }
      const shadowNode = host.shadowRoot?.querySelector(selector);
      if (shadowNode?.textContent) {
        const label = this.cleanLabelText(shadowNode.textContent);
        if (label) return label;
      }
    }

    const slotLabel =
      this.extractLabelFromSlots(host) ||
      this.extractLabelFromSlots(host.shadowRoot);
    if (slotLabel) return slotLabel;

    const group = host.querySelector?.("spl-radio-group, spl-checkbox-group");
    if (group) {
      const groupAttr =
        group.getAttribute?.("label") || group.getAttribute?.("aria-label");
      if (groupAttr) {
        const label = this.cleanLabelText(groupAttr);
        if (label) return label;
      }

      for (const selector of selectors) {
        const groupNode =
          group.querySelector?.(selector) ||
          group.shadowRoot?.querySelector?.(selector);
        if (groupNode?.textContent) {
          const label = this.cleanLabelText(groupNode.textContent);
          if (label) return label;
        }
      }

      const groupSlotLabel =
        this.extractLabelFromSlots(group) ||
        this.extractLabelFromSlots(group.shadowRoot);
      if (groupSlotLabel) return groupSlotLabel;
    }

    return null;
  }

  findQuestionGroupInfo(control, fallbackLabelInfo) {
    const fallbackLabel = fallbackLabelInfo?.label || "";
    const fallbackRequired = !!fallbackLabelInfo?.requiredHint;

    const questionHost = this.getQuestionFieldHost(control);
    let groupHost = this.findHostAncestor(
      control,
      "spl-radio-group, spl-checkbox-group",
    );
    if (!groupHost) {
      const intermediate = this.findHostAncestor(
        control,
        "spl-radio, spl-checkbox",
      );
      if (intermediate) {
        groupHost = this.findHostAncestor(
          intermediate,
          "spl-radio-group, spl-checkbox-group",
        );
      }
    }

    if (!questionHost && !groupHost) {
      return null;
    }

    const labelCandidates = [];
    let requiredHint = fallbackRequired;

    const collectFromNode = (node) => {
      if (!node) return;

      const candidateLabel = this.extractQuestionHostLabel(node);
      if (candidateLabel) labelCandidates.push(candidateLabel);

      if (
        node.hasAttribute?.("required") ||
        node.getAttribute?.("aria-required") === "true"
      ) {
        requiredHint = true;
      }

      if (!requiredHint && node.shadowRoot) {
        const indicator = node.shadowRoot.querySelector(
          '[aria-hidden="true"], .required-indicator, [data-required="true"]',
        );
        if (indicator && /\*/.test(indicator.textContent || "")) {
          requiredHint = true;
        }
      }
    };

    collectFromNode(questionHost);

    if (questionHost) {
      const nestedGroup =
        questionHost.querySelector?.("spl-radio-group, spl-checkbox-group") ||
        questionHost.shadowRoot?.querySelector?.(
          "spl-radio-group, spl-checkbox-group",
        );
      collectFromNode(nestedGroup);
    }

    collectFromNode(groupHost);

    if (fallbackLabel) labelCandidates.push(fallbackLabel);

    const chosenLabel =
      labelCandidates
        .map((text) => (text ? text.trim() : ""))
        .filter((text) => text.length > 0)
        .sort((a, b) => b.length - a.length)[0] || null;

    const hostForGrouping = questionHost || groupHost;

    return {
      label: chosenLabel,
      requiredHint,
      host: hostForGrouping,
    };
  }

  augmentFieldLabel(label) {
    if (!label) return label;
    if (label === COVER_LETTER_LABEL) {
      return `${label}${COVER_LETTER_SUFFIX}`;
    }
    return label;
  }

  shouldIgnoreLanguageLabel(label) {
    if (!label) return false;
    const cleaned = this.cleanLabelText(label);
    if (!cleaned) return false;
    return LANGUAGE_LABEL_PATTERNS.some((pattern) => pattern.test(cleaned));
  }

  // ========================================
  // SCREENING QUESTIONS DEFINITION PARSING
  // ========================================

  /**
   * Parse the definition JSON from sr-screening-questions-form to extract
   * question types and options (especially for radio and select fields).
   * Returns a Map of normalized label -> { type, options, diversity, required, id }
   */
  parseScreeningQuestionsDefinition() {
    const formEl = document.querySelector("sr-screening-questions-form");
    if (!formEl) return null;

    const defStr = formEl.getAttribute("definition");
    if (!defStr) return null;

    try {
      const def = JSON.parse(defStr);
      const map = new Map();

      for (const q of def.questions || []) {
        if (!q.label || q.type === "info") continue;

        const options = [];
        for (const f of q.fields || q.questionsFields || []) {
          for (const v of f.questionsFieldValues || f.values || []) {
            if (v.label) options.push(v.label);
          }
        }

        // Strip markdown links: [text](url) -> text
        const cleanedLabel = q.label
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .trim();
        const normalizedKey = this.cleanLabelText(cleanedLabel).toLowerCase();

        map.set(normalizedKey, {
          type: q.type,
          options,
          diversity: q.diversity,
          required: q.required,
          id: q.id,
        });
      }

      return map;
    } catch (e) {
      return null;
    }
  }

  /**
   * Find the definition data matching a field label
   */
  findDefinitionMatch(fieldLabel, definitionMap) {
    if (!fieldLabel || !definitionMap) return null;

    const normalizedLabel = this.cleanLabelText(fieldLabel).toLowerCase();

    // Try exact match
    if (definitionMap.has(normalizedLabel)) {
      return definitionMap.get(normalizedLabel);
    }

    // Try contains match (for labels that differ slightly due to HTML stripping)
    for (const [key, value] of definitionMap) {
      if (
        (normalizedLabel.length > 10 && key.includes(normalizedLabel)) ||
        (key.length > 10 && normalizedLabel.includes(key))
      ) {
        return value;
      }
    }

    return null;
  }

  // ========================================
  // EXPERIENCE & EDUCATION SECTION HANDLING
  // ========================================

  /**
   * Handle experience and education sections using data-test selectors.
   * - Detects existing entries (auto-populated from resume upload) before clicking Add
   * - Fills fields using data-test attributes (not label matching)
   * - Handles flatpickr date fields via calendar UI interaction
   * - Clicks Save after filling each entry
   * - Marks ALL controls in these sections as directFilledControls
   */
  async expandExperienceAndEducationSections(formRoot) {
    // Prevent double processing on validation retry
    if (this.sectionsExpanded) {
      this.markSectionControlsAsDirectFilled(formRoot);
      return;
    }
    this.sectionsExpanded = true;

    const userData = this.userData || {};

    // --- Experience ---
    await this.handleExperienceSection(formRoot, userData);

    // --- Education ---
    await this.handleEducationSection(formRoot, userData);

    // Mark ALL controls inside oc-experience and oc-education as directly filled
    // so the main AI loop never touches them
    this.markSectionControlsAsDirectFilled(formRoot);
  }

  /**
   * Handle the experience section: detect existing entries or click Add, then fill.
   * Only opens as many edit forms as the user has experience entries (no duplicates).
   */
  async handleExperienceSection(formRoot, userData) {
    const experiences = userData.experience || userData.extractedExperience || [];
    if (!Array.isArray(experiences) || experiences.length === 0) {
      return;
    }

    const exp = experiences[0]; // Fill only the most recent experience entry
    if (!exp) return;

    let editForm = await this.openSectionEditForm(formRoot, "experience");
    if (!editForm) return;

    await this.fillExperienceEditForm(editForm, exp, userData);
  }

  /**
   * Handle the education section: detect existing entries or click Add, then fill.
   * Only opens as many edit forms as the user has education entries (no duplicates).
   */
  async handleEducationSection(formRoot, userData) {
    const educationRaw = userData.education;
    const educationEntries = Array.isArray(educationRaw)
      ? educationRaw
      : educationRaw
        ? [educationRaw]
        : [];

    if (educationEntries.length === 0) {
      return;
    }

    const edu = educationEntries[0]; // Fill only the first education entry
    if (!edu) return;

    let editForm = await this.openSectionEditForm(formRoot, "education");
    if (!editForm) return;

    await this.fillEducationEditForm(editForm, edu, userData);
  }

  /**
   * Open a section edit form for experience or education.
   * Priority order:
   *   1. Already-open edit form → use directly
   *   2. Existing saved entry (from resume parse) → click its edit button to reuse it
   *   3. No entries at all → click "Add" to create one
   * This prevents creating duplicate entries when the resume parser already populated one.
   *
   * SmartRecruiters HTML structure:
   *   <oc-experience-entry data-test="experience-entry">  (saved, collapsed)
   *     <spl-button data-test="experience-entry-edit" aria-label="Edit experience ...">
   *   <oc-experience-entry data-test="experience-entry">  (open edit form)
   *     <oc-experience-edit-form>
   *       <div data-test="experience-edit-form">
   */
  async openSectionEditForm(formRoot, section) {
    const editFormSelector = `[data-test="${section}-edit-form"]`;
    const editFormTag = `oc-${section}-edit-form`;
    const entryTag = `oc-${section}-entry`;

    // 1. Check if an edit form is already open
    let editForm = this.querySelectorDeep(formRoot, editFormSelector);
    if (!editForm) editForm = this.querySelectorDeep(formRoot, editFormTag);

    if (editForm) {
      return editForm;
    }

    // 2. Check for existing saved entries and click edit on the first one
    //    This covers entries created by resume parse or previous fills
    const allEntries = this.querySelectorAllDeep(formRoot, entryTag);
    if (allEntries.length > 0) {
      // Find the first entry that has an edit button (i.e., it's a saved/collapsed entry)
      for (const entry of allEntries) {
        // data-test="experience-entry-edit" or data-test="education-entry-edit"
        const editButton =
          this.querySelectorDeep(entry, `[data-test="${section}-entry-edit"]`) ||
          this.querySelectorDeep(entry, `spl-button[aria-label^="Edit ${section}"]`) ||
          this.querySelectorDeep(entry, '[aria-label^="Edit"]');

        if (editButton) {
          await this.clickAddSectionButton(editButton);
          await this.delay(2000);

          editForm = this.querySelectorDeep(formRoot, editFormSelector);
          if (!editForm) editForm = this.querySelectorDeep(formRoot, editFormTag);

          if (editForm) {
            return editForm;
          }
          break;
        }
      }

      // If we got here, entries exist but none had an edit button - don't add more
      return null;
    }

    // 3. No existing entries at all → click "Add" to create one
    const addButton = this.findAddSectionButton(formRoot, section);
    if (addButton) {
      await this.clickAddSectionButton(addButton);
      await this.delay(2000);

      editForm = this.querySelectorDeep(formRoot, editFormSelector);
      if (!editForm) editForm = this.querySelectorDeep(formRoot, editFormTag);

      if (editForm) {
        return editForm;
      }
    } else {
    }

    return null;
  }

  /**
   * Fill an experience edit form using data-test selectors.
   * Fields: job-title-autocomplete, company-autocomplete, experience-form-location,
   *         experience-description, experience-date-from, experience-date-to,
   *         experience-current, experience-save
   */
  async fillExperienceEditForm(editForm, exp, userData) {
    if (!editForm || !exp) return;

    const title = this.cleanResumeArtifacts(exp.title || exp.jobTitle || exp.position || "");
    const company = this.cleanResumeArtifacts(exp.company || exp.companyName || exp.employer || "");
    const location = this.cleanResumeArtifacts(exp.location || exp.city || userData.currentCity || "");
    const description = this.cleanResumeArtifacts(exp.description || exp.summary || exp.responsibilities || "");
    const rawStartDate = exp.startDate || exp.start_date || exp.from || "";
    const rawEndDate = exp.endDate || exp.end_date || exp.to || "";

    // Convert dates to valid ISO format (YYYY-MM-DD)
    const startParsed = rawStartDate ? this.parseMonthYearDate(rawStartDate) : null;
    const endParsed = rawEndDate ? this.parseMonthYearDate(rawEndDate) : null;
    const startDate = startParsed ? startParsed.isoDate : rawStartDate;
    const endDate = endParsed ? endParsed.isoDate : rawEndDate;

    // Fill title (autocomplete)
    if (title) {
      await this.fillAutocompleteByDataTest(editForm, "job-title-autocomplete", title);
      await this.delay(500);
    }

    // Fill company (autocomplete)
    if (company) {
      await this.fillAutocompleteByDataTest(editForm, "company-autocomplete", company);
      await this.delay(500);
    }

    // Fill location (text input)
    if (location) {
      await this.fillFieldByDataTest(editForm, "experience-form-location", location);
      await this.delay(300);
    }

    // Fill description (textarea)
    if (description) {
      await this.fillFieldByDataTest(editForm, "experience-description", description);
      await this.delay(300);
    }

    // Fill dates (flatpickr month-year pickers)
    if (startDate) {
      await this.fillDateFieldByDataTest(editForm, "experience-date-from", startDate);
      await this.delay(500);
    }

    if (endDate) {
      await this.fillDateFieldByDataTest(editForm, "experience-date-to", endDate);
      await this.delay(500);
    }

    // Click Save button
    await this.clickEntryButton(editForm, "experience-save");
  }

  /**
   * Fill an education edit form using data-test selectors.
   * Fields: institution-autocomplete, education-degree, education-major,
   *         education-form-location, education-description, education-save
   */
  async fillEducationEditForm(editForm, edu, userData) {
    if (!editForm || !edu) return;

    const school = this.cleanResumeArtifacts(edu.school || edu.institution || edu.university || "");
    const degree = this.cleanResumeArtifacts(edu.degree || edu.degreeType || "");
    const major = this.cleanResumeArtifacts(edu.major || edu.field || edu.fieldOfStudy || "");
    const location = this.cleanResumeArtifacts(edu.location || userData.currentCity || "");
    const description = this.cleanResumeArtifacts(edu.description || "");
    const rawStartDate = edu.startDate || edu.start_date || edu.from || "";
    const rawEndDate = edu.endDate || edu.end_date || edu.to || "";
    const gpa = edu.gpa || "";

    // Convert dates to valid ISO format (YYYY-MM-DD)
    const startParsed = rawStartDate ? this.parseMonthYearDate(rawStartDate) : null;
    const endParsed = rawEndDate ? this.parseMonthYearDate(rawEndDate) : null;
    const startDate = startParsed ? startParsed.isoDate : rawStartDate;
    const endDate = endParsed ? endParsed.isoDate : rawEndDate;

    // Fill institution (autocomplete)
    if (school) {
      await this.fillAutocompleteByDataTest(editForm, "institution-autocomplete", school);
      await this.delay(500);
    }

    // Fill degree (could be dropdown/autocomplete or text)
    if (degree) {
      await this.fillFieldByDataTest(editForm, "education-degree", degree);
      await this.delay(500);
    }

    // Fill major (text input)
    if (major) {
      await this.fillFieldByDataTest(editForm, "education-major", major);
      await this.delay(300);
    }

    // Fill location
    if (location) {
      await this.fillFieldByDataTest(editForm, "education-form-location", location);
      await this.delay(300);
    }

    // Fill description
    if (description) {
      await this.fillFieldByDataTest(editForm, "education-description", description);
      await this.delay(300);
    }

    // Fill dates (flatpickr month-year pickers)
    if (startDate) {
      await this.fillDateFieldByDataTest(editForm, "education-date-from", startDate);
      await this.delay(500);
    }

    if (endDate) {
      await this.fillDateFieldByDataTest(editForm, "education-date-to", endDate);
      await this.delay(500);
    }

    // Click Save button
    await this.clickEntryButton(editForm, "education-save");
  }

  /**
   * Fill an autocomplete field found by data-test attribute.
   * Clears existing value first, types new value, then selects from dropdown.
   */
  async fillAutocompleteByDataTest(root, dataTestAttr, value) {
    if (!value) return;

    // Find the element with data-test attribute
    const wrapper = this.querySelectorDeep(root, `[data-test="${dataTestAttr}"]`);
    if (!wrapper) {
      return;
    }

    const input = this.querySelectorDeep(wrapper, "input");
    if (!input) {
      return;
    }

    // Clear existing value first
    input.focus?.();
    await this.delay(100);
    this.setNativeValue(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await this.delay(100);

    // Type the value character by character to trigger autocomplete suggestions
    await this.replayTypingForDropdown(input, value.substring(0, 30));
    await this.delay(800);

    // Try to select the first dropdown option
    const selected = await this.selectFirstDropdownOption(input);
    if (!selected) {
      this.setNativeValue(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      input.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
    }
  }

  /**
   * Fill a generic field (text input, textarea, dropdown) found by data-test attribute.
   * Handles spl-input, spl-textarea, spl-autocomplete, or native elements.
   */
  async fillFieldByDataTest(root, dataTestAttr, value) {
    if (!value) return;

    const wrapper = this.querySelectorDeep(root, `[data-test="${dataTestAttr}"]`);
    if (!wrapper) {
      return;
    }

    const input = this.querySelectorDeep(wrapper, "input, textarea, select");
    if (!input) {
      return;
    }

    const tag = input.tagName?.toLowerCase();
    const isDropdown = this.isSmartRecruitersDropdownInput(input);

    if (tag === "select") {
      const options = [...(input.options || [])];
      const valueLower = value.toLowerCase();
      let bestOption = null;
      for (const option of options) {
        const optText = option.text.toLowerCase();
        const optVal = option.value.toLowerCase();
        if (optText === valueLower || optVal === valueLower) {
          bestOption = option;
          break;
        }
        if (optText.includes(valueLower) || valueLower.includes(optText)) {
          bestOption = option;
        }
      }
      if (bestOption) {
        input.value = bestOption.value;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } else if (isDropdown) {
      // SmartRecruiters dropdown - clear, type, and select
      input.focus?.();
      await this.delay(100);
      this.setNativeValue(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      await this.delay(100);
      await this.replayTypingForDropdown(input, value.substring(0, 30));
      await this.delay(800);
      const selected = await this.selectFirstDropdownOption(input);
      if (!selected) {
        this.setNativeValue(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
      }
    } else {
      // Plain text input or textarea
      input.focus?.();
      await this.delay(100);
      // Clear existing value
      this.setNativeValue(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      await this.delay(50);
      // Set new value
      this.setNativeValue(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      input.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
    }
  }

  /**
   * Fill a flatpickr month-year date field found by data-test attribute.
   * SmartRecruiters date fields use: spl-date-field > spl-date-picker (shadow DOM) > flatpickr
   * The flatpickr is a month-year picker with prev/next year buttons and month cells.
   *
   * Strategy:
   * 1. Find the date wrapper by data-test
   * 2. Find the input inside and click it to open flatpickr
   * 3. Parse the target month/year from the date string
   * 4. Navigate to the correct year using prev/next buttons
   * 5. Click the correct month cell
   */
  async fillDateFieldByDataTest(root, dataTestAttr, dateValue) {
    if (!dateValue) return;

    const parsed = this.parseMonthYearDate(dateValue);
    if (!parsed) {
      return;
    }

    const wrapper = this.querySelectorDeep(root, `[data-test="${dataTestAttr}"]`);
    if (!wrapper) {
      return;
    }

    const input = this.querySelectorDeep(wrapper, "input");
    if (!input) {
      return;
    }

    // Click the input to open the flatpickr calendar
    input.focus?.();
    input.click?.();
    await this.delay(500);

    // Find the flatpickr calendar container
    // It could be inside the shadow DOM of spl-date-picker, or appended to document body
    let flatpickrCalendar = null;

    // First: try inside the wrapper's shadow DOM tree
    flatpickrCalendar = this.querySelectorDeep(wrapper, ".flatpickr-calendar");

    // Second: try finding it in the document body (flatpickr often appends to body)
    if (!flatpickrCalendar) {
      const allCalendars = document.querySelectorAll(".flatpickr-calendar.open");
      if (allCalendars.length > 0) {
        flatpickrCalendar = allCalendars[allCalendars.length - 1]; // Use the last opened one
      }
    }

    // Third: try any .flatpickr-calendar in shadow DOMs throughout the document
    if (!flatpickrCalendar) {
      flatpickrCalendar = this.querySelectorDeep(document.body, ".flatpickr-calendar");
    }

    if (!flatpickrCalendar) {
      this.setNativeValue(input, parsed.isoDate);
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      return;
    }

    // Navigate to the correct year
    // Find the current year displayed in the calendar
    const yearElement = flatpickrCalendar.querySelector(".flatpickr-current-month .numInputWrapper .cur-year, .flatpickr-current-month .cur-year, .cur-year");
    let currentYear = yearElement ? parseInt(yearElement.value || yearElement.textContent, 10) : new Date().getFullYear();

    const prevButton = flatpickrCalendar.querySelector(".flatpickr-prev-month");
    const nextButton = flatpickrCalendar.querySelector(".flatpickr-next-month");

    // Navigate to target year (max 30 clicks to prevent infinite loop)
    let safetyCounter = 0;
    while (currentYear !== parsed.year && safetyCounter < 30) {
      if (currentYear > parsed.year && prevButton) {
        prevButton.click();
      } else if (currentYear < parsed.year && nextButton) {
        nextButton.click();
      } else {
        break;
      }
      await this.delay(150);
      safetyCounter++;

      // Re-read the current year
      const updatedYearEl = flatpickrCalendar.querySelector(".flatpickr-current-month .numInputWrapper .cur-year, .flatpickr-current-month .cur-year, .cur-year");
      if (updatedYearEl) {
        currentYear = parseInt(updatedYearEl.value || updatedYearEl.textContent, 10);
      } else {
        break;
      }
    }

    // Click the correct month cell
    // Flatpickr monthSelect months use class .flatpickr-monthSelect-month
    // They are 0-indexed (January = 0) and can have data-value attribute
    const monthCells = flatpickrCalendar.querySelectorAll(".flatpickr-monthSelect-month");
    if (monthCells.length > 0) {
      // monthCells are in order Jan-Dec, use parsed.month (0-indexed)
      if (parsed.month >= 0 && parsed.month < monthCells.length) {
        monthCells[parsed.month].click();
        await this.delay(300);
      } else {
      }
    } else {
      // Fallback: try standard flatpickr day-based picker
      // Or try to find month cells with different class names
      const altMonthCells = flatpickrCalendar.querySelectorAll("[data-month]");
      if (altMonthCells.length > 0) {
        for (const cell of altMonthCells) {
          if (parseInt(cell.getAttribute("data-month"), 10) === parsed.month) {
            cell.click();
            await this.delay(300);
            break;
          }
        }
      } else {
        this.setNativeValue(input, parsed.isoDate);
        input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      }
    }
  }

  /**
   * Parse a date string into month (0-indexed) and year.
   * Handles formats: "November 2016", "November, 2016", "Nov 2016", "11/2016", "2016-11", "2016-11-01"
   */
  parseMonthYearDate(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return null;

    const monthNames = [
      "january", "february", "march", "april", "may", "june",
      "july", "august", "september", "october", "november", "december",
    ];
    const monthAbbrevs = [
      "jan", "feb", "mar", "apr", "may", "jun",
      "jul", "aug", "sep", "oct", "nov", "dec",
    ];

    const toResult = (month, year) => ({
      month,
      year,
      monthName: monthNames[month].charAt(0).toUpperCase() + monthNames[month].slice(1),
      isoDate: `${year}-${String(month + 1).padStart(2, "0")}-01`,
    });

    const cleaned = dateStr.trim().toLowerCase();

    // Format: "November 2016", "Nov 2016", "November, 2016", "Nov, 2016"
    const monthNameMatch = cleaned.match(/^([a-z]+),?\s+(\d{4})$/);
    if (monthNameMatch) {
      const monthStr = monthNameMatch[1];
      const year = parseInt(monthNameMatch[2], 10);
      let month = monthNames.indexOf(monthStr);
      if (month === -1) month = monthAbbrevs.indexOf(monthStr.substring(0, 3));
      if (month !== -1 && year > 1900 && year < 2100) {
        return toResult(month, year);
      }
    }

    // Format: "2016-11" or "2016-11-01"
    const isoMatch = cleaned.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10) - 1; // Convert to 0-indexed
      if (month >= 0 && month <= 11 && year > 1900 && year < 2100) {
        return toResult(month, year);
      }
    }

    // Format: "11/2016" or "11-2016"
    const slashMatch = cleaned.match(/^(\d{1,2})[/\-](\d{4})$/);
    if (slashMatch) {
      const month = parseInt(slashMatch[1], 10) - 1;
      const year = parseInt(slashMatch[2], 10);
      if (month >= 0 && month <= 11 && year > 1900 && year < 2100) {
        return toResult(month, year);
      }
    }

    // Format: just a year "2016"
    const yearOnlyMatch = cleaned.match(/^(\d{4})$/);
    if (yearOnlyMatch) {
      const year = parseInt(yearOnlyMatch[1], 10);
      if (year > 1900 && year < 2100) {
        return toResult(0, year); // Default to January
      }
    }

    return null;
  }

  /**
   * Click a button (Save/Cancel) inside an edit form by data-test attribute.
   */
  async clickEntryButton(editForm, dataTestAttr) {
    if (!editForm) return;

    const buttonWrapper = this.querySelectorDeep(editForm, `[data-test="${dataTestAttr}"]`);
    if (!buttonWrapper) {
      return;
    }

    // Find the actual clickable button (may be inside shadow DOM: oc-button > spl-button > shadowRoot > button)
    let clickTarget = this.querySelectorDeep(buttonWrapper, "button");
    if (!clickTarget) {
      clickTarget = buttonWrapper;
    }

    clickTarget.scrollIntoView?.({ behavior: "smooth", block: "center" });
    await this.delay(300);
    clickTarget.click?.();
    clickTarget.dispatchEvent?.(new MouseEvent("click", { bubbles: true, composed: true }));
    await this.delay(1000);
  }

  /**
   * Mark ALL form controls inside oc-experience and oc-education sections
   * as directFilledControls so the main AI fillFormFields loop skips them entirely.
   */
  markSectionControlsAsDirectFilled(formRoot) {
    const sectionSelectors = [
      "oc-experience", "oc-experience-entry", "oc-experience-edit-form",
      "oc-education", "oc-education-entry", "oc-education-edit-form",
      '[data-test="experience-edit-form"]', '[data-test="education-edit-form"]',
      '[data-test="experience-section"]', '[data-test="education-section"]',
    ];

    for (const selector of sectionSelectors) {
      const sections = this.querySelectorAllDeep(formRoot, selector);
      for (const section of sections) {
        // Find ALL input/textarea/select elements inside this section (including shadow DOM)
        const controls = this.querySelectorAllDeep(section, "input, textarea, select");
        for (const control of controls) {
          this.directFilledControls.add(control);
        }
      }
    }

    // Also search by broader selector in case sections use different wrappers
    const allControls = this.collectFormControls(formRoot);
    for (const control of allControls) {
      // Walk up the DOM to check if this control is inside an experience/education section
      let node = control;
      let maxDepth = 20;
      while (node && maxDepth-- > 0) {
        const tag = node.tagName?.toLowerCase();
        if (
          tag === "oc-experience" || tag === "oc-experience-entry" ||
          tag === "oc-experience-edit-form" || tag === "oc-education" ||
          tag === "oc-education-entry" || tag === "oc-education-edit-form"
        ) {
          this.directFilledControls.add(control);
          break;
        }
        // Check data-test attribute
        const dataTest = node.getAttribute?.("data-test") || "";
        if (
          dataTest === "experience-edit-form" || dataTest === "education-edit-form" ||
          dataTest === "experience-section" || dataTest === "education-section"
        ) {
          this.directFilledControls.add(control);
          break;
        }
        node = node.parentElement || node.parentNode?.host;
      }
    }

  }

  /**
   * Clean common resume parsing artifacts from values.
   * Removes bullet points, stray symbols, and obviously wrong data.
   */
  cleanResumeArtifacts(value) {
    if (!value || typeof value !== "string") return "";
    let cleaned = value
      .replace(/^[●•▪▸▹■□◆◇→\-*]\s*/g, "")  // Leading bullet points
      .replace(/\n[●•▪▸▹■□◆◇→\-*]\s*/g, "\n") // Bullet points after newlines
      .trim();
    return cleaned;
  }

  /**
   * Find the "Add" button for a section (experience or education).
   * SmartRecruiters HTML structure:
   *   <oc-button data-test="add-experience" ...>
   *     <spl-button aria-label="Add experience entry" ...>
   *       <span>Add</span>
   *     </spl-button>
   *   </oc-button>
   */
  findAddSectionButton(formRoot, section) {
    const searchRoots = [formRoot, document];

    for (const root of searchRoots) {
      if (!root) continue;

      // Primary: data-test attribute on oc-button
      const dataTestButton = root.querySelector?.(
        `oc-button[data-test="add-${section}"]`
      );
      if (dataTestButton) return dataTestButton;

      // Secondary: aria-label on spl-button inside or standalone
      const ariaLabel = `Add ${section} entry`;
      const splButtons = this.querySelectorAllDeep(root, "spl-button");
      for (const btn of splButtons) {
        if (btn.getAttribute?.("aria-label") === ariaLabel) {
          return btn;
        }
      }

      // Tertiary: search by aria-label on any element
      const byAria = root.querySelector?.(
        `[aria-label="${ariaLabel}"]`
      );
      if (byAria) return byAria;
    }

    return null;
  }

  /**
   * Click an "Add" section button, handling shadow DOM and web component wrappers.
   */
  async clickAddSectionButton(button) {
    if (!button) return;

    // Try to find the inner <button> inside shadow DOM
    let clickTarget = null;

    // Check if the element itself has a shadow root with a button
    if (button.shadowRoot) {
      clickTarget = button.shadowRoot.querySelector("button");
    }

    // Check child spl-button's shadow root
    if (!clickTarget) {
      const splButton = button.querySelector?.("spl-button");
      if (splButton?.shadowRoot) {
        clickTarget = splButton.shadowRoot.querySelector("button");
      }
    }

    // Use deep query as last resort
    if (!clickTarget) {
      clickTarget = this.querySelectorDeep(button, "button");
    }

    // Fall back to the element itself
    if (!clickTarget) {
      clickTarget = button;
    }

    // Scroll into view and click once
    clickTarget.scrollIntoView?.({ behavior: "smooth", block: "center" });
    await this.delay(300);
    clickTarget.click?.();
  }

  // ========================================
  // MAIN ENTRY POINT
  // ========================================

  /**
   * Main entry point - fill all form fields
   */
  async fillFormFields(form) {
    try {
      if (!form) {
        return false;
      }

      const formRoot =
        form.querySelector?.("oc-application-form") ||
        form.querySelector?.("form") ||
        form;

      // Step 0: Click "Add experience" and "Add education" buttons to expand sections
      await this.expandExperienceAndEducationSections(formRoot);

      // Step 1: Collect all form controls using deep traversal
      const controls = this.collectFormControls(formRoot);
      console.log(`[SR-DEBUG] collectFormControls found ${controls.length} controls from`, formRoot.tagName || 'root');
      const splRadioCount = controls.filter(c => c.tagName?.toLowerCase() === 'spl-radio').length;
      const splCheckboxCount = controls.filter(c => c.tagName?.toLowerCase() === 'spl-checkbox').length;
      console.log(`[SR-DEBUG] Among them: ${splRadioCount} spl-radio, ${splCheckboxCount} spl-checkbox`);

      // Also detect inputs that may not be reachable via normal shadow DOM traversal
      this.findMissedAutocompleteInputs(formRoot, controls);
      this.findMissedRadioCheckboxInputs(formRoot, controls);

      console.log(`[SR-DEBUG] After missed-input scan: ${controls.length} total controls`);

      if (controls.length === 0) {
        return true;
      }

      // Step 2: Process controls into fields with proper grouping
      const fields = [];
      const groupedMultiChoice = new Map();

      for (const control of controls) {
        if (!control || !control.isConnected) continue;

        // Skip controls already filled by direct experience/education mapping
        if (this.directFilledControls.has(control)) {
          continue;
        }

        const type = this.getControlType(control);
        if (!type) continue;

        const labelInfo = this.extractFieldLabelData(control);
        const { label, requiredHint } = labelInfo;
        let normalizedLabel = label ? label.trim() : "";
        let questionInfo = null;

        if (type === "radio" || type === "checkbox") {
          const controlTag = control.tagName?.toLowerCase();
          // For spl-radio/spl-checkbox, use direct parent-walk to get correct label
          // instead of the generic BFS which can climb to shared ancestors
          if (controlTag === "spl-radio" || controlTag === "spl-checkbox") {
            const directInfo = this.extractSplRadioCheckboxLabel(control);
            if (directInfo) {
              questionInfo = directInfo;
              normalizedLabel = directInfo.label;
            } else {
              // Fallback: use findQuestionGroupInfo but WITHOUT the potentially
              // wrong extractFieldLabelData result as fallback
              questionInfo = this.findQuestionGroupInfo(control, {
                label: null,
                requiredHint,
              });
              if (questionInfo?.label) {
                normalizedLabel = questionInfo.label;
              }
            }
          } else {
            questionInfo = this.findQuestionGroupInfo(control, labelInfo);
            if (questionInfo?.label) {
              normalizedLabel = questionInfo.label;
            }
          }
          console.log(`[SR-DEBUG] Radio/Checkbox control:`, control.tagName, control.id, `| directLabel: "${controlTag === "spl-radio" || controlTag === "spl-checkbox" ? questionInfo?.label : "N/A"}" | extractFieldLabelData: "${labelInfo.label}" | final normalizedLabel: "${normalizedLabel}"`);
        }

        normalizedLabel = this.augmentFieldLabel(normalizedLabel);
        if (questionInfo?.label) {
          questionInfo.label = this.augmentFieldLabel(questionInfo.label);
        }

        // Skip language fields handled separately
        const labelsToCheck = [
          normalizedLabel,
          labelInfo.label,
          questionInfo?.label,
        ];
        if (labelsToCheck.some((l) => this.shouldIgnoreLanguageLabel(l))) {
          if (type === "radio" || type === "checkbox") {
            console.log(`[SR-DEBUG] SKIPPED (language label): "${normalizedLabel}"`);
          }
          continue;
        }

        if (!normalizedLabel) {
          if (type === "radio" || type === "checkbox") {
            console.log(`[SR-DEBUG] SKIPPED (empty label): control`, control.tagName, control.id);
          }
          continue;
        }

        // Skip diversity/survey fields
        const shouldSkip = SKIP_WORDS.some((skipWord) =>
          normalizedLabel.toLowerCase().includes(skipWord.toLowerCase()),
        );
        if (shouldSkip) {
          console.log(`[SR-DEBUG] SKIPPED (SKIP_WORDS): "${normalizedLabel}"`);
          continue;
        }

        const required =
          this.isControlRequired(control) ||
          requiredHint ||
          questionInfo?.requiredHint;

        if (type === "radio" || type === "checkbox") {
          const key =
            questionInfo?.host ||
            (control.name
              ? `name::${control.name}`
              : `${type}::${normalizedLabel}`);
          let field = groupedMultiChoice.get(key);
          if (!field) {
            field = {
              element: [],
              type,
              label: normalizedLabel,
              required,
              options: [],
            };
            groupedMultiChoice.set(key, field);
            fields.push(field);
          }

          field.element.push(control);
          if (!field.required && required) field.required = true;

          if (questionInfo?.label && field.label !== questionInfo.label) {
            field.label = questionInfo.label;
          }

          const optionLabel = this.findOptionLabel(control);
          if (optionLabel && !field.options.includes(optionLabel)) {
            field.options.push(optionLabel);
          }
        } else {
          let effectiveType = type;
          let options = null;
          let isMultiSelect = false;

          if (type === "select") {
            options = [...(control.options || [])]
              .filter((option) => option.value && option.value.length > 0)
              .map((option) => this.cleanLabelText(option.text));
          } else if (this.isSmartRecruitersDropdownInput(control)) {
            effectiveType = "dropdown";
            isMultiSelect = this.isMultiSelectAutocomplete(control);
            if (isMultiSelect) {
              options = this.extractMultiSelectOptionsFromDOM(control);
            }
          }

          const field = {
            element: control,
            type: effectiveType,
            label: normalizedLabel,
            required,
            isMultiSelect,
          };

          if (options && options.length > 0) {
            field.options = options;
          }

          fields.push(field);
        }
      }

      // Step 2.5: Enrich fields with options from screening questions definition
      // This is critical for dropdown/select fields where options aren't in native <option> elements
      const definitionMap = this.parseScreeningQuestionsDefinition();
      if (definitionMap) {
        for (const field of fields) {
          if (!field.options || field.options.length === 0) {
            const defMatch = this.findDefinitionMatch(
              field.label,
              definitionMap,
            );
            if (defMatch && defMatch.options.length > 0) {
              field.options = defMatch.options;
            }
          }
        }
      }

      // Log all detected fields
      const radioFields = fields.filter(f => f.type === 'radio' || f.type === 'checkbox');
      console.log(`[SR-DEBUG] Total fields: ${fields.length}, radio/checkbox fields: ${radioFields.length}`);
      for (const rf of radioFields) {
        console.log(`[SR-DEBUG] Radio/Checkbox field: "${rf.label}" | type: ${rf.type} | options: [${(rf.options || []).join(', ')}] | elements: ${rf.element?.length || 0}`);
      }

      // Step 3: Get AI answers and fill fields
      const answers = await this.getAIAnswersForFields(fields);

      // Track processed controls to avoid re-filling them in rescans
      const processedControls = new Set();
      for (const field of fields) {
        if (Array.isArray(field.element)) {
          field.element.forEach((el) => processedControls.add(el));
        } else {
          processedControls.add(field.element);
        }
      }

      for (const field of fields) {
        await this.fillField(field, answers);
        await this.delay(500);
      }

      // Step 3.5: Re-scan for dynamically added fields (conditional questions)
      // After filling radios/dropdowns, new questions may appear in the DOM
      const MAX_RESCANS = 3;
      for (let rescan = 0; rescan < MAX_RESCANS; rescan++) {
        await this.delay(1000);

        const allNewControls = this.collectFormControls(formRoot);
        this.findMissedAutocompleteInputs(formRoot, allNewControls);
        this.findMissedRadioCheckboxInputs(formRoot, allNewControls);
        const newControls = allNewControls.filter(
          (ctrl) => ctrl && ctrl.isConnected && !processedControls.has(ctrl),
        );

        if (newControls.length === 0) {
          break;
        }

        // Process new controls into fields (same logic as Step 2)
        const newFields = [];
        const newGroupedMultiChoice = new Map();

        for (const control of newControls) {
          if (!control || !control.isConnected) continue;
          if (this.directFilledControls.has(control)) continue;
          processedControls.add(control);

          const type = this.getControlType(control);
          if (!type) continue;

          const labelInfo = this.extractFieldLabelData(control);
          const { label, requiredHint } = labelInfo;
          let normalizedLabel = label ? label.trim() : "";
          let questionInfo = null;

          if (type === "radio" || type === "checkbox") {
            questionInfo = this.findQuestionGroupInfo(control, labelInfo);
            if (questionInfo?.label) {
              normalizedLabel = questionInfo.label;
            }
          }

          normalizedLabel = this.augmentFieldLabel(normalizedLabel);
          if (questionInfo?.label) {
            questionInfo.label = this.augmentFieldLabel(questionInfo.label);
          }

          const labelsToCheck = [
            normalizedLabel,
            labelInfo.label,
            questionInfo?.label,
          ];
          if (labelsToCheck.some((l) => this.shouldIgnoreLanguageLabel(l)))
            continue;
          if (!normalizedLabel) continue;

          const shouldSkip = SKIP_WORDS.some((skipWord) =>
            normalizedLabel.toLowerCase().includes(skipWord.toLowerCase()),
          );
          if (shouldSkip) continue;

          const required =
            this.isControlRequired(control) ||
            requiredHint ||
            questionInfo?.requiredHint;

          if (type === "radio" || type === "checkbox") {
            const key =
              questionInfo?.host ||
              (control.name
                ? `name::${control.name}`
                : `${type}::${normalizedLabel}`);
            let field = newGroupedMultiChoice.get(key);
            if (!field) {
              field = {
                element: [],
                type,
                label: normalizedLabel,
                required,
                options: [],
              };
              newGroupedMultiChoice.set(key, field);
              newFields.push(field);
            }
            field.element.push(control);
            if (!field.required && required) field.required = true;
            if (questionInfo?.label && field.label !== questionInfo.label) {
              field.label = questionInfo.label;
            }
            const optionLabel = this.findOptionLabel(control);
            if (optionLabel && !field.options.includes(optionLabel)) {
              field.options.push(optionLabel);
            }
          } else {
            let effectiveType = type;
            let options = null;
            let isMultiSelect = false;

            if (type === "select") {
              options = [...(control.options || [])]
                .filter((option) => option.value && option.value.length > 0)
                .map((option) => this.cleanLabelText(option.text));
            } else if (this.isSmartRecruitersDropdownInput(control)) {
              effectiveType = "dropdown";
              isMultiSelect = this.isMultiSelectAutocomplete(control);
              if (isMultiSelect) {
                options = this.extractMultiSelectOptionsFromDOM(control);
              }
            }

            const field = {
              element: control,
              type: effectiveType,
              label: normalizedLabel,
              required,
              isMultiSelect,
            };
            if (options && options.length > 0) {
              field.options = options;
            }
            newFields.push(field);
          }
        }

        if (newFields.length === 0) break;

        // Enrich new fields with definition options
        if (definitionMap) {
          for (const field of newFields) {
            if (!field.options || field.options.length === 0) {
              const defMatch = this.findDefinitionMatch(
                field.label,
                definitionMap,
              );
              if (defMatch && defMatch.options.length > 0) {
                field.options = defMatch.options;
              }
            }
          }
        }

        const newAnswers = await this.getAIAnswersForFields(newFields);
        for (const field of newFields) {
          await this.fillField(field, newAnswers);
          await this.delay(500);
        }
      }

      // Step 4: Handle required checkboxes (consent, agreements)
      await this.handleRequiredCheckboxes(formRoot);

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get AI answers for all fields
   */
  async getAIAnswersForFields(fields) {
    const answers = {};

    for (const field of fields) {
      const fieldKey = field.label.toLowerCase();

      if (this.answerCache.has(fieldKey)) {
        answers[fieldKey] = this.answerCache.get(fieldKey);
        continue;
      }

      let answer;
      if (
        (field.isMultiSelect || field.type === "checkbox") &&
        this.aiService
      ) {
        // For checkboxes, use label as option if no options extracted
        const options = (field.options && field.options.length > 0)
          ? field.options
          : [field.label];
        const context = {
          platform: "smartrecruiters",
          userData: this.userData,
          jobDescription: this.jobDescription || this.scrapeJobDescription(),
          fieldType: field.type,
          fieldContext: "SmartRecruiters application form field",
        };
        answer = await this.aiService.getMultiSelectAnswer(
          field.label,
          options,
          context,
        );
      } else {
        answer = await this.getAnswer(field.label, field.options || [], 0, field.type);
      }
      if (answer !== null && answer !== undefined) {
        answers[fieldKey] = answer;
        this.answerCache.set(fieldKey, answer);
      }
    }

    return answers;
  }

  /**
   * Extract Twitter/X username from URL or return username as-is
   * Handles: https://x.com/username, https://twitter.com/username, @username, username
   */
  extractTwitterUsername(value) {
    if (!value) return "";

    const str = String(value).trim();

    // Match Twitter/X URLs and extract username
    const urlPatterns = [
      /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/?/i,
    ];

    for (const pattern of urlPatterns) {
      const match = str.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    // Remove @ prefix if present
    if (str.startsWith("@")) {
      return str.substring(1);
    }

    // Return as-is (assume it's already just a username)
    return str;
  }

  /**
   * Map phone dial code to ISO country code
   * SmartRecruiters uses ISO country codes (US, CA) in dropdowns, not dial codes (+1)
   */
  dialCodeToIsoCode(dialCode) {
    if (!dialCode) return "US"; // Default to US

    const code = String(dialCode).replace(/\D/g, ""); // Remove non-digits

    // Common dial code to ISO mappings
    const dialCodeMap = {
      1: "US", // United States (default for +1)
      44: "GB", // United Kingdom
      33: "FR", // France
      49: "DE", // Germany
      39: "IT", // Italy
      34: "ES", // Spain
      31: "NL", // Netherlands
      32: "BE", // Belgium
      41: "CH", // Switzerland
      43: "AT", // Austria
      61: "AU", // Australia
      64: "NZ", // New Zealand
      81: "JP", // Japan
      82: "KR", // South Korea
      86: "CN", // China
      91: "IN", // India
      55: "BR", // Brazil
      52: "MX", // Mexico
      7: "RU", // Russia
      234: "NG", // Nigeria
      27: "ZA", // South Africa
      971: "AE", // UAE
      972: "IL", // Israel
      65: "SG", // Singapore
      852: "HK", // Hong Kong
      353: "IE", // Ireland
      46: "SE", // Sweden
      47: "NO", // Norway
      45: "DK", // Denmark
      358: "FI", // Finland
      48: "PL", // Poland
      420: "CZ", // Czech Republic
    };

    return dialCodeMap[code] || "US";
  }

  /**
   * Get direct profile field value without AI
   * Returns null if the field is not a profile field
   */
  getProfileFieldValue(label) {
    const lowerLabel = (label || "").toLowerCase().trim();

    // Phone number - direct match from profile
    // Combines country code + phone number into a single value
    if (
      lowerLabel.includes("phone") ||
      lowerLabel.includes("mobile") ||
      lowerLabel.includes("cell") ||
      lowerLabel.includes("telephone")
    ) {
      const phoneNumber =
        this.userData.phoneNumber || this.userData.phone || "";
      const countryCode = this.userData.phoneCountryCode || "";

      if (phoneNumber) {
        // Combine country code and phone number
        const fullPhone = countryCode
          ? `${countryCode}${phoneNumber}`
          : phoneNumber;
        return fullPhone;
      }
      return "";
    }

    // Country code dropdown for phone - return the country ISO code
    // SmartRecruiters uses country ISO codes (US, CA, etc.) not dial codes (+1)
    if (lowerLabel.includes("country code") || lowerLabel === "country") {
      const countryCode = this.userData.phoneCountryCode || "+1";
      // Map dial code to ISO country code for the dropdown
      const isoCode = this.dialCodeToIsoCode(countryCode);
      return isoCode;
    }

    // LinkedIn - direct match from profile
    if (lowerLabel.includes("linkedin")) {
      const value =
        this.userData.linkedinURL || this.userData.linkedinUrl || "";
      return value;
    }

    // Facebook - direct match from profile (if available)
    if (lowerLabel.includes("facebook")) {
      const value =
        this.userData.facebookURL || this.userData.facebookUrl || "";
      return value;
    }

    // Twitter/X - extract username from URL or use as-is
    if (
      lowerLabel.includes("twitter") ||
      lowerLabel.includes("x (fka twitter)") ||
      lowerLabel === "x"
    ) {
      const rawValue =
        this.userData.twitterURL || this.userData.twitterUrl || "";
      const username = this.extractTwitterUsername(rawValue);
      return username;
    }

    // Website/Portfolio - direct match from profile
    if (lowerLabel.includes("website") || lowerLabel.includes("portfolio")) {
      const value = this.userData.website || "";
      return value;
    }

    // Not a profile field
    return null;
  }

  /**
   * Get answer from AI service or fallback to user profile
   */
  async getAnswer(label, options = [], retryCount = 0, fieldType) {
    const normalizedLabel = label?.toLowerCase()?.trim() || "";

    if (this.answerCache.has(normalizedLabel)) {
      return this.answerCache.get(normalizedLabel);
    }

    // Check for direct profile field match first (no AI needed)
    const profileValue = this.getProfileFieldValue(label);
    if (profileValue !== null) {
      this.answerCache.set(normalizedLabel, profileValue);
      return profileValue;
    }

    try {
      if (!this.aiService) {
        return this.getFallbackAnswer(label);
      }

      const context = {
        platform: "smartrecruiters",
        userData: this.userData,
        jobDescription: this.jobDescription || this.scrapeJobDescription(),
        fieldType: fieldType,
        fieldContext: "SmartRecruiters application form field",
        required: false,
      };

      let answer;

      if (options && options.length > 0) {
        answer = await this.aiService.getOptionAnswer(label, options, context);
      } else if (AIResponseUtils.isSalaryField(label)) {
        answer = await this.aiService.getSalaryAnswer(label, options, context);
      } else if (
        label.toLowerCase().includes("describe") ||
        label.toLowerCase().includes("why") ||
        label.toLowerCase().includes("cover letter") ||
        label.toLowerCase().includes("textarea")
      ) {
        answer = await this.aiService.getLongformAnswer(
          label,
          options,
          context,
        );
      } else {
        answer = await this.aiService.getNormalAnswer(label, options, context);
      }

      if (
        answer === null ||
        answer === undefined ||
        String(answer).trim() === ""
      ) {
        if (retryCount < 2) {
          await this.delay(1000 + retryCount * 500);
          return await this.getAnswer(label, options, retryCount + 1, fieldType);
        }
        return this.getFallbackAnswer(label);
      }

      const cleanedAnswer = answer.replace(/[\"*\-]/g, "");
      this.answerCache.set(normalizedLabel, cleanedAnswer);
      return cleanedAnswer;
    } catch (error) {
      if (retryCount < 2) {
        await this.delay(1000 + retryCount * 500);
        return await this.getAnswer(label, options, retryCount + 1);
      }
      return this.getFallbackAnswer(label);
    }
  }

  /**
   * Fallback answer from user profile
   */
  getFallbackAnswer(label) {
    const lowerLabel = label.toLowerCase();

    // First check if it's a profile field (LinkedIn, Facebook, Twitter, Website, Phone)
    const profileValue = this.getProfileFieldValue(label);
    if (profileValue !== null) {
      return profileValue;
    }

    if (lowerLabel.includes("first name")) return this.userData.firstName || "";
    if (lowerLabel.includes("last name")) return this.userData.lastName || "";
    if (lowerLabel.includes("email")) return this.userData.email || "";
    if (lowerLabel.includes("city") || lowerLabel.includes("location")) {
      return (
        this.userData.city ||
        this.userData.location ||
        this.userData.currentCity ||
        ""
      );
    }

    return "";
  }

  /**
   * Fill a single field with its answer
   */
  async fillField(field, answers) {
    const fieldKey = field.label.toLowerCase();
    let answer = answers[fieldKey];

    if (Array.isArray(field.element)) {
      console.log(`[SR-DEBUG] fillField radio/checkbox: "${field.label}" | answer: "${answer}" | required: ${field.required} | elements: ${field.element.length}`);
    }

    if (!answer && !field.required) {
      return;
    }

    try {
      if (Array.isArray(field.element)) {
        // Multi-choice field (radio/checkbox)
        console.log(`[SR-DEBUG] Calling fillMultiChoiceField for "${field.label}" with answer: "${answer}"`);
        await this.fillMultiChoiceField(field, answer);
      } else if (field.type === "dropdown") {
        await this.fillDropdownField(field, answer);
      } else if (field.type === "select") {
        await this.fillSelectField(field, answer);
      } else if (field.type === "textarea") {
        await this.fillTextareaField(field, answer);
      } else {
        await this.fillInputField(field, answer);
      }
    } catch (error) {
      // Field filling error - continue with other fields
    }
  }

  async fillMultiChoiceField(field, value) {
    if (!value) return;

    const desiredPairs = (Array.isArray(value) ? value : [value])
      .map((val) => ({
        original: val,
        normalized: this.normalizeMatchValue(val),
      }))
      .filter((item) => item.normalized.length > 0);

    if (desiredPairs.length === 0) {
      return;
    }

    const desiredSet = new Set(desiredPairs.map((item) => item.normalized));

    const optionSummaries = field.element.map((el) => {
      const candidates = this.collectOptionCandidates(el);
      const normalizedCandidates = candidates
        .map((candidate) => this.normalizeMatchValue(candidate))
        .filter((candidate) => candidate.length > 0);

      const tag = el.tagName?.toLowerCase();
      const isSplComponent = tag === "spl-radio" || tag === "spl-checkbox";
      const hostComponent = isSplComponent
        ? el
        : this.findHostAncestor(el, "spl-radio, spl-checkbox");

      return {
        element: el,
        hostComponent,
        candidates,
        normalizedCandidates,
        isSplComponent,
      };
    });

    let matchFound = false;

    for (const summary of optionSummaries) {
      const matches = summary.normalizedCandidates.some((candidate) =>
        desiredSet.has(candidate),
      );
      if (matches) {
        matchFound = true;

        // Check if already selected
        let isChecked = false;
        if (summary.isSplComponent) {
          isChecked =
            summary.element.getAttribute?.("checked") !== null ||
            summary.element.getAttribute?.("aria-checked") === "true";
        } else {
          isChecked = summary.element.checked;
        }

        if (!isChecked) {
          if (summary.isSplComponent) {
            await this.clickSplRadioOrCheckbox(summary.element);
          } else if (summary.hostComponent) {
            await this.clickSplRadioOrCheckbox(summary.hostComponent);
          } else {
            summary.element.click();
          }
          await this.delay(300);
        }
      } else if (
        summary.element.type === "checkbox" &&
        summary.element.checked
      ) {
        summary.element.click();
        await this.delay(300);
      }
    }

    if (!matchFound) {
      // No matching option found
    }
  }

  async fillDropdownField(field, value) {
    if (!value || !field.element) return;

    const input = field.element;

    // Handle multiselect differently
    if (field.isMultiSelect) {
      await this.fillMultiSelectDropdown(field, value);
      return;
    }

    // Find the best matching option text from known options
    let valueToMatch = value;
    if (field.options && field.options.length > 0) {
      valueToMatch = this.findBestDropdownMatch(value, field.options);
    }

    // Step 1: Clear any existing value so dropdown shows ALL options
    this.setNativeValue(input, "");
    input.dispatchEvent(
      new Event("input", { bubbles: true, composed: true }),
    );
    await this.delay(100);

    // Step 2: Click/focus input to open dropdown WITHOUT typing (shows all options)
    input.focus?.();
    input.dispatchEvent?.(
      new Event("focus", { bubbles: true, composed: true }),
    );
    input.click?.();
    await this.delay(200);

    // Step 3: Get dropdown host and wait for options to appear
    const dropdownHost = this.getSmartRecruitersDropdownHost(input);
    const menuId =
      input.getAttribute?.("aria-controls") ||
      dropdownHost?.getAttribute?.("aria-controls");

    let options = await this.waitForDropdownOptions(
      dropdownHost,
      menuId,
      3000,
    );
    if (options.length === 0) {
      // No static options found - likely a search autocomplete (e.g., city/location)
      // Type the value to trigger search results
      await this.replayTypingForDropdown(input, valueToMatch);
      await this.delay(500);

      options = await this.waitForDropdownOptions(
        dropdownHost,
        menuId,
        5000,
      );
      if (options.length === 0) {
        return;
      }
    }

    // Step 4: Find the best matching option element (skip disabled/"No matches")
    const bestResult = this.findBestDropdownOptionElement(
      options,
      valueToMatch,
    );

    if (!bestResult) {
      return;
    }

    // Step 5: Click the matching option directly
    const target = this.getDropdownClickableTarget(bestResult.element);
    if (target) {
      target.dispatchEvent?.(
        new PointerEvent("pointerover", { bubbles: true, composed: true }),
      );
      target.dispatchEvent?.(
        new PointerEvent("pointerenter", {
          bubbles: false,
          composed: true,
        }),
      );
      target.dispatchEvent?.(
        new PointerEvent("pointerdown", { bubbles: true, composed: true }),
      );
      target.dispatchEvent?.(
        new MouseEvent("mouseover", { bubbles: true, composed: true }),
      );
      target.dispatchEvent?.(
        new MouseEvent("mouseenter", { bubbles: false, composed: true }),
      );
      target.dispatchEvent?.(
        new MouseEvent("mousedown", { bubbles: true, composed: true }),
      );
      target.click?.();
      target.dispatchEvent?.(
        new MouseEvent("mouseup", { bubbles: true, composed: true }),
      );
      target.dispatchEvent?.(
        new PointerEvent("pointerup", { bubbles: true, composed: true }),
      );
    } else {
      bestResult.element.click?.();
    }

    await this.delay(300);

    // Step 6: Close dropdown if still open
    if (dropdownHost?.hasAttribute?.("open")) {
      dropdownHost.removeAttribute("open");
    }
    if (input.getAttribute?.("aria-expanded") === "true") {
      const escapeInit = {
        key: "Escape",
        code: "Escape",
        keyCode: 27,
        which: 27,
        bubbles: true,
        composed: true,
      };
      input.dispatchEvent?.(new KeyboardEvent("keydown", escapeInit));
      input.dispatchEvent?.(new KeyboardEvent("keyup", escapeInit));
    }

  }

  /**
   * Find the best matching option from available options
   */
  findBestDropdownMatch(value, options) {
    if (!options || options.length === 0) return value;

    const normalizedValue = this.normalizeMatchValue(value);
    let bestMatch = null;

    // First try exact match
    for (const option of options) {
      const normalizedOption = this.normalizeMatchValue(option);
      if (normalizedOption === normalizedValue) {
        bestMatch = option;
        break;
      }
    }

    // Try partial/fuzzy match if no exact match
    if (!bestMatch) {
      for (const option of options) {
        const normalizedOption = this.normalizeMatchValue(option);
        if (
          normalizedOption.includes(normalizedValue) ||
          normalizedValue.includes(normalizedOption)
        ) {
          bestMatch = option;
          break;
        }
      }
    }

    // Try keyword matching for yes/no questions
    if (!bestMatch) {
      const valueLower = value.toLowerCase();
      const yesKeywords = [
        "yes",
        "true",
        "agree",
        "accept",
        "authorized",
        "eligible",
        "i am",
        "affirmative",
      ];
      const noKeywords = [
        "no",
        "false",
        "disagree",
        "decline",
        "not authorized",
        "not eligible",
        "i am not",
        "negative",
      ];

      const isYesAnswer = yesKeywords.some((kw) => valueLower.includes(kw));
      const isNoAnswer = noKeywords.some((kw) => valueLower.includes(kw));

      for (const option of options) {
        const optionLower = option.toLowerCase();
        if (
          isYesAnswer &&
          (optionLower === "yes" || optionLower.startsWith("yes"))
        ) {
          bestMatch = option;
          break;
        }
        if (
          isNoAnswer &&
          (optionLower === "no" || optionLower.startsWith("no"))
        ) {
          bestMatch = option;
          break;
        }
      }
    }

    if (bestMatch) {
      return bestMatch;
    } else {
      // Use first option as fallback for required fields
      return options[0];
    }
  }

  /**
   * Check if a dropdown option element is valid (not disabled, not "No matches")
   */
  isValidDropdownOption(option) {
    if (!option) return false;
    if (
      option.hasAttribute?.("disabled") ||
      option.getAttribute?.("aria-disabled") === "true"
    )
      return false;
    const text = this.extractDropdownOptionText(option);
    if (!text) return false;
    const textLower = text.toLowerCase();
    if (textLower.includes("no matches") || textLower.includes("no results"))
      return false;
    return true;
  }

  /**
   * Find the best matching option element from a list of dropdown option DOM elements.
   * Returns { element, text } or null.
   */
  findBestDropdownOptionElement(options, desiredValue) {
    const normalizedDesired = this.normalizeMatchValue(desiredValue);

    // Filter to valid options only
    const validOptions = options.filter((opt) =>
      this.isValidDropdownOption(opt),
    );
    if (validOptions.length === 0) return null;

    // Try exact match
    for (const option of validOptions) {
      const optionText = this.extractDropdownOptionText(option);
      const normalizedOption = this.normalizeMatchValue(optionText);
      if (normalizedOption === normalizedDesired) {
        return { element: option, text: optionText };
      }
    }

    // Try partial/contains match
    for (const option of validOptions) {
      const optionText = this.extractDropdownOptionText(option);
      const normalizedOption = this.normalizeMatchValue(optionText);
      if (
        normalizedOption.includes(normalizedDesired) ||
        normalizedDesired.includes(normalizedOption)
      ) {
        return { element: option, text: optionText };
      }
    }

    // Try yes/no keyword matching
    const valueLower = desiredValue.toLowerCase();
    const yesKeywords = [
      "yes",
      "true",
      "agree",
      "accept",
      "authorized",
      "eligible",
      "affirmative",
    ];
    const noKeywords = [
      "no",
      "false",
      "disagree",
      "decline",
      "not authorized",
      "not eligible",
      "negative",
    ];
    const isYesAnswer = yesKeywords.some((kw) => valueLower.includes(kw));
    const isNoAnswer = noKeywords.some((kw) => valueLower.includes(kw));

    if (isYesAnswer || isNoAnswer) {
      for (const option of validOptions) {
        const optionText = this.extractDropdownOptionText(option);
        const optionLower = (optionText || "").toLowerCase();
        if (
          isYesAnswer &&
          (optionLower === "yes" || optionLower.startsWith("yes"))
        ) {
          return { element: option, text: optionText };
        }
        if (
          isNoAnswer &&
          (optionLower === "no" || optionLower.startsWith("no"))
        ) {
          return { element: option, text: optionText };
        }
      }
    }

    // Fallback: first valid option
    const fallback = validOptions[0];
    const fallbackText = this.extractDropdownOptionText(fallback);
    return { element: fallback, text: fallbackText };
  }

  /**
   * Fill a multi-select autocomplete dropdown
   */
  async fillMultiSelectDropdown(field, value) {
    const input = field.element;
    const valuesToSelect = Array.isArray(value) ? value : [value];

    // Find matches for each value
    const matchedOptions = [];
    for (const val of valuesToSelect) {
      const matched = this.findBestDropdownMatch(val, field.options);
      if (matched && !matchedOptions.includes(matched)) {
        matchedOptions.push(matched);
      }
    }

    // If no matches and we have options, select the first "Other" or generic option
    if (
      matchedOptions.length === 0 &&
      field.options &&
      field.options.length > 0
    ) {
      const otherOption = field.options.find(
        (opt) =>
          opt.toLowerCase().includes("other") ||
          opt.toLowerCase().includes("job board"),
      );
      if (otherOption) {
        matchedOptions.push(otherOption);
      } else {
        matchedOptions.push(field.options[0]);
      }
    }

    // Find the multiselect host and dropdown host
    const dropdownHost = this.getSmartRecruitersDropdownHost(input);
    const menuId =
      input.getAttribute?.("aria-controls") ||
      dropdownHost?.getAttribute?.("aria-controls");

    // Also find the spl-multiselect-autocomplete host for shadow DOM lookups
    let multiselectHost = null;
    let current = input;
    const visited = new Set();
    while (current && !visited.has(current)) {
      visited.add(current);
      if (current.tagName?.toLowerCase() === "spl-multiselect-autocomplete") {
        multiselectHost = current;
        break;
      }
      if (current.parentElement) {
        current = current.parentElement;
      } else {
        const root = current.getRootNode?.();
        current = root?.host || null;
      }
    }

    for (const optionToSelect of matchedOptions) {
      // Step 1: Clear input and open dropdown (mirror fillDropdownField approach)
      this.setNativeValue(input, "");
      input.dispatchEvent(
        new Event("input", { bubbles: true, composed: true }),
      );
      await this.delay(100);

      // Step 2: Open dropdown with proper event sequence
      input.focus?.();
      input.dispatchEvent?.(
        new Event("focus", { bubbles: true, composed: true }),
      );
      input.click?.();
      await this.delay(200);

      // Step 3: Find options - try standard approach first
      let options = await this.waitForDropdownOptions(
        dropdownHost,
        menuId,
        3000,
      );

      // If no options found, try finding them within the multiselect host shadow DOM
      if (options.length === 0 && multiselectHost) {
        const selectOptions = this.querySelectorAllDeep(
          multiselectHost,
          "spl-select-option",
        );
        if (selectOptions && selectOptions.length > 0) {
          options = [...selectOptions];
        }
      }

      // If still no options, try dispatching ArrowDown to force-open the dropdown
      if (options.length === 0) {
        const arrowInit = {
          key: "ArrowDown",
          code: "ArrowDown",
          keyCode: 40,
          which: 40,
          bubbles: true,
          composed: true,
        };
        input.dispatchEvent?.(new KeyboardEvent("keydown", arrowInit));
        input.dispatchEvent?.(new KeyboardEvent("keyup", arrowInit));
        await this.delay(300);

        options = await this.waitForDropdownOptions(
          dropdownHost,
          menuId,
          3000,
        );

        // Last resort: deep search within multiselect host
        if (options.length === 0 && multiselectHost) {
          const selectOptions = this.querySelectorAllDeep(
            multiselectHost,
            "spl-select-option",
          );
          if (selectOptions && selectOptions.length > 0) {
            options = [...selectOptions];
          }
        }
      }

      if (options.length === 0) {
        continue;
      }

      // Step 4: Find and click the matching option with full event sequence
      const bestResult = this.findBestDropdownOptionElement(
        options,
        optionToSelect,
      );
      if (bestResult) {
        const target = this.getDropdownClickableTarget(bestResult.element);
        const clickTarget = target || bestResult.element;

        // Use full pointer/mouse event sequence (same as fillDropdownField)
        clickTarget.dispatchEvent?.(
          new PointerEvent("pointerover", { bubbles: true, composed: true }),
        );
        clickTarget.dispatchEvent?.(
          new PointerEvent("pointerenter", {
            bubbles: false,
            composed: true,
          }),
        );
        clickTarget.dispatchEvent?.(
          new PointerEvent("pointerdown", { bubbles: true, composed: true }),
        );
        clickTarget.dispatchEvent?.(
          new MouseEvent("mouseover", { bubbles: true, composed: true }),
        );
        clickTarget.dispatchEvent?.(
          new MouseEvent("mouseenter", { bubbles: false, composed: true }),
        );
        clickTarget.dispatchEvent?.(
          new MouseEvent("mousedown", { bubbles: true, composed: true }),
        );
        clickTarget.click?.();
        clickTarget.dispatchEvent?.(
          new MouseEvent("mouseup", { bubbles: true, composed: true }),
        );
        clickTarget.dispatchEvent?.(
          new PointerEvent("pointerup", { bubbles: true, composed: true }),
        );
      }

      // Wait for selection to register and dropdown to close (closeonselect)
      await this.delay(400);
    }
  }

  async fillInputField(field, value) {
    if (!value || !field.element) return;

    const input = field.element;
    input.focus?.();
    await this.delay(100);

    this.setNativeValue(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  async fillSelectField(field, value) {
    if (!value || !field.element) return;

    const select = field.element;
    const valueLower = value.toLowerCase();

    let bestOption = null;
    const options = [...(select.options || [])];

    for (const option of options) {
      if (
        option.value.toLowerCase() === valueLower ||
        option.text.toLowerCase() === valueLower ||
        option.text.toLowerCase().includes(valueLower)
      ) {
        bestOption = option;
        break;
      }
    }

    if (bestOption) {
      select.value = bestOption.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  async fillTextareaField(field, value) {
    if (!value || !field.element) return;

    const textarea = field.element;
    textarea.focus?.();
    await this.delay(100);

    this.setNativeValue(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /**
   * Handle required checkboxes (consent, agreements)
   */
  async handleRequiredCheckboxes(form) {
    try {
      // First, handle SmartRecruiters-specific consent checkboxes (oc-consent, spl-checkbox)
      await this.handleSmartRecruitersConsentCheckboxes(form);

      // Then handle standard checkboxes
      const checkboxes = this.querySelectorAllDeep(
        form,
        'input[type="checkbox"]',
      );

      for (const checkbox of checkboxes) {
        if (checkbox.checked) continue;
        if (!this.isElementVisible(checkbox)) continue;

        const label = this.getCheckboxLabel(checkbox);
        const labelLower = label.toLowerCase();

        if (this.isConsentLabel(labelLower)) {
          // Try to find and click the spl-checkbox host first
          const splCheckbox = this.findHostAncestor(checkbox, "spl-checkbox");
          if (splCheckbox) {
            await this.clickSplRadioOrCheckbox(splCheckbox);
          } else {
            const parentLabel = checkbox.closest("label");
            if (parentLabel) {
              parentLabel.click();
            } else {
              checkbox.click();
            }
          }

          checkbox.dispatchEvent(new Event("change", { bubbles: true }));
          await this.delay(200);
        }
      }
    } catch (error) {
      // Error handling checkboxes
    }
  }

  /**
   * Handle SmartRecruiters consent checkboxes (oc-consent section and sr-question-field-checkbox)
   */
  async handleSmartRecruitersConsentCheckboxes(form) {
    try {
      // Find all consent containers including sr-question-field-checkbox for certification checkboxes
      const consentContainers = form.querySelectorAll(
        'oc-consent, oc-consent-decisions, [data-test="consent"], sr-question-field-checkbox',
      );

      for (const container of consentContainers) {
        // Find spl-checkbox elements within
        const splCheckboxes = this.querySelectorAllDeep(
          container,
          "spl-checkbox",
        );

        for (const splCheckbox of splCheckboxes) {
          // Check if already checked
          const isChecked =
            splCheckbox.getAttribute("value") === "true" ||
            splCheckbox.hasAttribute("checked") ||
            splCheckbox.getAttribute("aria-checked") === "true";

          if (isChecked) continue;

          // Get the label text
          const labelContent = splCheckbox.querySelector(
            '[slot="label-content"], [data-test="consent-text"], [data-test="checkbox-label"]',
          );
          const labelText = labelContent?.textContent?.trim() || "";
          const labelLower = labelText.toLowerCase();

          // For sr-question-field-checkbox containers, only check certification/consent related checkboxes
          const containerTag = container.tagName?.toLowerCase();
          if (
            containerTag === "sr-question-field-checkbox" &&
            !this.isConsentLabel(labelLower)
          ) {
            continue;
          }

          // Click the spl-checkbox component
          await this.clickSplRadioOrCheckbox(splCheckbox);

          // Also try clicking the inner checkbox if the host click didn't work
          const innerCheckbox =
            splCheckbox.shadowRoot?.querySelector('input[type="checkbox"]') ||
            splCheckbox.querySelector('input[type="checkbox"]');

          if (innerCheckbox && !innerCheckbox.checked) {
            innerCheckbox.click?.();
          }

          await this.delay(200);
        }
      }
    } catch (error) {
      // Error handling consent checkboxes
    }
  }

  getCheckboxLabel(checkbox) {
    if (checkbox.id) {
      const label = document.querySelector(`label[for="${checkbox.id}"]`);
      if (label) return label.textContent.trim();
    }

    const parentLabel = checkbox.closest("label");
    if (parentLabel) return parentLabel.textContent.trim();

    const container = checkbox.closest(".checkbox-container, .form-field");
    if (container) {
      const label = container.querySelector("label, .label");
      if (label) return label.textContent.trim();
    }

    return "";
  }

  /**
   * Check if label text indicates a consent/agreement checkbox
   */
  isConsentLabel(labelLower) {
    const consentKeywords = [
      "agree",
      "accept",
      "consent",
      "terms",
      "privacy",
      "acknowledge",
      "certify",
      "declare",
      "read and understand",
      "policy",
      "confirm",
      "authorization",
    ];
    return consentKeywords.some((keyword) => labelLower.includes(keyword));
  }

  /**
   * Click on SmartRecruiters spl-radio or spl-checkbox component
   */
  async clickSplRadioOrCheckbox(element) {
    if (!element) return;

    try {
      // Method 1: Direct click on the host element
      element.focus?.();
      element.click?.();

      // Method 2: Dispatch pointer and mouse events
      element.dispatchEvent?.(
        new PointerEvent("pointerdown", { bubbles: true, composed: true }),
      );
      element.dispatchEvent?.(
        new MouseEvent("mousedown", { bubbles: true, composed: true }),
      );
      element.dispatchEvent?.(
        new MouseEvent("mouseup", { bubbles: true, composed: true }),
      );
      element.dispatchEvent?.(
        new PointerEvent("pointerup", { bubbles: true, composed: true }),
      );

      // Method 3: Keyboard space (common way to activate radio/checkbox)
      element.dispatchEvent?.(
        new KeyboardEvent("keydown", {
          key: " ",
          code: "Space",
          keyCode: 32,
          which: 32,
          bubbles: true,
          composed: true,
        }),
      );
      element.dispatchEvent?.(
        new KeyboardEvent("keyup", {
          key: " ",
          code: "Space",
          keyCode: 32,
          which: 32,
          bubbles: true,
          composed: true,
        }),
      );

      // Method 4: Dispatch change event
      element.dispatchEvent?.(
        new Event("change", { bubbles: true, composed: true }),
      );

      // Method 5: If there's a shadowRoot, try clicking elements inside
      if (element.shadowRoot) {
        const clickable = element.shadowRoot.querySelector(
          'button, [role="radio"], [role="checkbox"], .radio-button, .checkbox-button, [tabindex]',
        );
        if (clickable) {
          clickable.click?.();
        }
      }

      await this.delay(100);
    } catch (error) {
      // Error clicking spl-radio/checkbox
    }
  }

  /**
   * Find the Next/Submit button for SmartRecruiters multi-step form
   */
  findSubmitButton(form) {
    // Priority 1: SmartRecruiters footer "Next" button
    const footerNextSelectors = [
      'oc-button[data-test="footer-next"] button',
      'oc-button[data-test="footer-next"] spl-button',
      '[data-test="footer-next"] button',
      'spl-button[data-test="footer-next"]',
    ];

    for (const selector of footerNextSelectors) {
      const button = this.querySelectorDeep(form, selector);
      if (button && this.isElementVisible(button) && !button.disabled) {
        const innerButton =
          button.shadowRoot?.querySelector("button") || button;
        if (innerButton && !innerButton.disabled) return innerButton;
      }
    }

    // Try oc-button wrapper
    const ocButton = form.querySelector('oc-button[data-test="footer-next"]');
    if (ocButton) {
      const splButton = ocButton.querySelector("spl-button");
      if (splButton?.shadowRoot) {
        const innerBtn = splButton.shadowRoot.querySelector("button");
        if (innerBtn && this.isElementVisible(innerBtn) && !innerBtn.disabled)
          return innerBtn;
      }
      const anyButton = ocButton.querySelector("button");
      if (anyButton && this.isElementVisible(anyButton) && !anyButton.disabled)
        return anyButton;
    }

    // Priority 2: Submit button
    const submitSelectors = [
      'oc-button[data-test="footer-submit"] button',
      'button[type="submit"]',
      'button[data-test="submit"]',
      "button.submit-button",
    ];

    for (const selector of submitSelectors) {
      const button = this.querySelectorDeep(form, selector);
      if (button && this.isElementVisible(button) && !button.disabled)
        return button;
    }

    // Priority 3: Text-based fallback
    const allButtons = this.querySelectorAllDeep(form, "button");
    for (const btn of allButtons) {
      if (!this.isElementVisible(btn) || btn.disabled) continue;

      const parent = btn.closest(
        "oc-external-providers, oc-apply-with-indeed, oc-apply-with-linkedin, oc-external-apply-button",
      );
      if (parent) continue;

      const text = btn.textContent.toLowerCase();
      if (text.includes("apply with")) continue;

      if (
        text.includes("submit") ||
        text.includes("send") ||
        text.includes("next")
      ) {
        return btn;
      }
    }

    return null;
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  isElementVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0"
    );
  }

  scrapeJobDescription() {
    try {
      const selectors = [
        ".job-description",
        '[data-test="job-description"]',
        ".description",
        '[class*="description"]',
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim().length > 50) return element.textContent.trim();
      }

      return "No job description found";
    } catch (error) {
      return "No job description found";
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
