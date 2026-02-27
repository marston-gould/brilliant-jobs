// formAnalyzer.js - Complete Enhanced Form Analysis Module (CLEAN VERSION)
(function() {
  'use strict';
  
  console.log("==== ENHANCED FORM ANALYZER LOADED ====");
  
  // IMMEDIATE EARLY EXIT if already loaded - INSIDE IIFE
  if (window.FORM_ANALYZER_FULLY_LOADED === true) {
    console.log("FormAnalyzer already fully loaded, immediate exit");
    return;
  }
  
  if (window.formAnalyzerLoaded === true) {
    console.log("FormAnalyzer already loaded (legacy check), skipping");
    return;
  }
  
  // Mark as loaded IMMEDIATELY
  window.FORM_ANALYZER_FULLY_LOADED = true;
  window.formAnalyzerLoaded = true;
  
  console.log("FormAnalyzer loading - unique instance confirmed");
  
  // Check if we should run on this domain
  const currentDomain = window.location.hostname.toLowerCase();
  const shouldRun = currentDomain.includes('linkedin.com') || currentDomain.includes('careergpt.io');

  if (!shouldRun) {
    console.log("FormAnalyzer: Not on target domain, skipping initialization");
    // Don't create any indicators or load the analyzer
    return;
  }

  // Prevent multiple loading by checking and early exit
  if (window.ComplexFormAnalyzer) {
    console.log("⚠️ ComplexFormAnalyzer already loaded, skipping redeclaration");
    return;
  }

  // Visual indicator - only on target domains
  try {
    // Don't create indicator if agent is already loaded
    if (window.globalAgent || document.getElementById('linkedin-agent-indicator')) {
      console.log("Agent already loaded, skipping form analyzer indicator");
    } else {
      const indicator = document.createElement('div');
      indicator.style.cssText = 'position:fixed;top:0;right:0;background:green;color:white;padding:5px;z-index:9999;font-size:12px;';
      indicator.textContent = 'Form Analyzer Active';
      document.body.appendChild(indicator);
      
      // Remove this indicator when agent loads
      const checkForAgent = setInterval(() => {
        if (window.globalAgent || document.getElementById('linkedin-agent-indicator')) {
          indicator.remove();
          clearInterval(checkForAgent);
          console.log("Removed form analyzer indicator - agent loaded");
        }
      }, 1000);
    }
  } catch (e) {
    console.error("Error creating indicator:", e);
  }

  /**
   * ComplexFormAnalyzer - Handles dynamic and complex forms
   */
  class ComplexFormAnalyzerClass {
    constructor() {
      this.framework = null;
      this.atsType = null;
    }

    detectFramework() {
      if (this.framework) return this.framework;
      
      // React
      if (document.querySelector('[data-reactroot]') || 
          window.React || 
          window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        this.framework = 'react';
      }
      // Angular
      else if (document.querySelector('[ng-app]') || 
               window.angular || 
               window.ng) {
        this.framework = 'angular';
      }
      // Vue
      else if (document.querySelector('#app.__vue__') || 
               window.Vue || 
               window.__VUE__) {
        this.framework = 'vue';
      }
      // Workday
      else if (window.location.hostname.includes('myworkday') || 
               document.querySelector('[data-automation-id]')) {
        this.framework = 'workday';
      }
      else {
        this.framework = 'none';
      }
      
      return this.framework;
    }

    async waitForDynamicContent(timeout = 10000) {
      return new Promise((resolve) => {
        const startTime = Date.now();
        
        // Check if form already exists
        const existingForm = this.findDynamicForm();
        if (existingForm) {
          resolve(existingForm);
          return;
        }
        
        // Set up observer
        const observer = new MutationObserver(() => {
          const form = this.findDynamicForm();
          if (form || Date.now() - startTime > timeout) {
            observer.disconnect();
            resolve(form);
          }
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true
        });
        
        // Timeout fallback
        setTimeout(() => {
          observer.disconnect();
          resolve(null);
        }, timeout);
      });
    }

    findDynamicForm() {
      // ATS-specific selectors
      const selectors = [
        // Workday
        '[data-automation-id*="jobPostingForm"]',
        '[data-automation-id*="applicationForm"]',
        // Greenhouse
        '#application_form',
        '#application',
        // Lever
        '.application-form',
        '[data-qa="application-form"]',
        // Generic
        'form[id*="application"]',
        'form[class*="application"]',
        '[class*="application-container"]',
        'form'
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && this.isValidForm(element)) {
          return element;
        }
      }
      
      return null;
    }

    isValidForm(element) {
      const inputs = element.querySelectorAll('input:not([type="hidden"]), textarea, select');
      return inputs.length >= 2;
    }

    findFieldLabel(element, container) {
      // 1. Explicit label
      if (element.id) {
        const label = container.querySelector(`label[for="${element.id}"]`);
        if (label) return label.textContent.trim();
      }
      
      // 2. Parent label
      const parentLabel = element.closest('label');
      if (parentLabel) {
        return Array.from(parentLabel.childNodes)
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.textContent.trim())
          .join(' ');
      }
      
      // 3. ARIA label
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel;
      
      // 4. Previous sibling
      let prev = element.previousElementSibling;
      if (prev && prev.textContent.trim().length < 100) {
        return prev.textContent.trim();
      }
      
      // 5. Placeholder
      return element.placeholder || '';
    }
  }

  // Cache system
  const DOM_CACHE = {
    boundingRects: new WeakMap(),
    computedStyles: new WeakMap(),
    labelRelationships: new WeakMap(),
    complexAnalyzer: new ComplexFormAnalyzerClass(),
    
    clearCache() {
      this.boundingRects = new WeakMap();
      this.computedStyles = new WeakMap();
      this.labelRelationships = new WeakMap();
    }
  };

  // Helper functions
  function getCachedBoundingRect(element) {
    if (!element) return null;
    
    if (DOM_CACHE.boundingRects.has(element)) {
      return DOM_CACHE.boundingRects.get(element);
    }
    
    const rect = element.getBoundingClientRect();
    DOM_CACHE.boundingRects.set(element, rect);
    return rect;
  }

  function getCachedComputedStyle(element) {
    if (!element) return null;
    
    if (DOM_CACHE.computedStyles.has(element)) {
      return DOM_CACHE.computedStyles.get(element);
    }
    
    const style = window.getComputedStyle(element);
    DOM_CACHE.computedStyles.set(element, style);
    return style;
  }

  function isElementVisible(element) {
    if (!element) return false;
    
    const style = getCachedComputedStyle(element);
    const rect = getCachedBoundingRect(element);
    
    return (
      rect &&
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      parseFloat(style.opacity) > 0
    );
  }

  function isInputField(element) {
    if (!element) return false;
    
    const tagName = element.tagName.toLowerCase();
    
    // Standard inputs
    if (["input", "select", "textarea"].includes(tagName)) {
      if (tagName === "input") {
        const type = element.type.toLowerCase();
        if (["hidden", "submit", "button"].includes(type)) {
          return false;
        }
      }
      return true;
    }
    
    // ARIA inputs
    const role = element.getAttribute("role");
    if (["textbox", "combobox", "checkbox", "radio"].includes(role)) {
      return true;
    }
    
    // Contenteditable
    if (element.isContentEditable || element.getAttribute("contenteditable") === "true") {
      return true;
    }
    
    return false;
  }

  function findElementLabels(element, formContext) {
    if (DOM_CACHE.labelRelationships.has(element)) {
      return DOM_CACHE.labelRelationships.get(element);
    }
    
    const labels = [];
    const complexAnalyzer = DOM_CACHE.complexAnalyzer;
    
    // Use complex analyzer for label detection
    const label = complexAnalyzer.findFieldLabel(element, formContext);
    if (label) {
      labels.push({
        text: label,
        relationship: 'found'
      });
    }
    
    // LinkedIn specific proximity analysis
    if (formContext.classList.contains('jobs-easy-apply-content')) {
      const rect = getCachedBoundingRect(element);
      if (rect) {
        const possibleLabels = Array.from(formContext.querySelectorAll('div, span, p'))
          .filter(el => {
            if (el === element || el.contains(element) || element.contains(el)) {
              return false;
            }
            
            const labelRect = getCachedBoundingRect(el);
            if (!labelRect) return false;
            
            // Check if above or to the left
            const isAbove = Math.abs(labelRect.left - rect.left) < rect.width * 1.5 && 
                            labelRect.bottom < rect.top && 
                            (rect.top - labelRect.bottom) < 40;
                            
            const isLeft = labelRect.right < rect.left &&
                           Math.abs(labelRect.top - rect.top) < rect.height * 2 &&
                           (rect.left - labelRect.right) < 50;
                           
            return (isAbove || isLeft) && isElementVisible(el);
          });
          
        possibleLabels.slice(0, 2).forEach(labelEl => {
          labels.push({
            text: labelEl.textContent.trim(),
            relationship: 'proximity'
          });
        });
      }
    }
    
    DOM_CACHE.labelRelationships.set(element, labels);
    return labels;
  }

  function analyzeQuestionGroup(questionElement, formContext) {
    // LinkedIn specific question groups
    const isLinkedInQuestionGroup = 
      questionElement.classList.contains('jobs-easy-apply-form-section__grouping') ||
      questionElement.classList.contains('jobs-easy-apply-form-element');
      
    if (!isLinkedInQuestionGroup) {
      return null;
    }
    
    const questionTitleEl = questionElement.querySelector(
      '.jobs-easy-apply-form-element__label, ' +
      '.jobs-easy-apply-form-element__title, ' +
      '.artdeco-text-input--label'
    );
    
    if (!questionTitleEl) return null;
    
    const questionText = questionTitleEl.textContent.trim();
    if (!questionText) return null;
    
    const inputs = Array.from(questionElement.querySelectorAll('input, select, textarea'))
      .filter(el => isInputField(el) && isElementVisible(el))
      .map(input => {
        let inputType = input.tagName.toLowerCase();
        if (inputType === 'input') {
          inputType = input.type.toLowerCase();
        }
        
        let options = null;
        if (input.tagName.toLowerCase() === 'select') {
          options = Array.from(input.options).map(opt => ({
            value: opt.value,
            text: opt.text.trim()
          }));
        }
        
        if (inputType === 'radio' && input.name) {
          const radioGroup = formContext.querySelectorAll(`input[type="radio"][name="${input.name}"]`);
          options = Array.from(radioGroup).map(radio => ({
            value: radio.value,
            text: radio.parentElement?.textContent.trim() || radio.value,
            checked: radio.checked
          }));
        }
        
        let checkboxLabel = '';
        if (inputType === 'checkbox') {
          const labels = findElementLabels(input, formContext);
          checkboxLabel = labels.length > 0 ? labels[0].text : '';
        }
        
        return {
          element: input,
          id: input.id || '',
          name: input.name || '',
          type: inputType,
          required: input.required || input.getAttribute('aria-required') === 'true',
          value: input.value || '',
          options: options,
          checkboxLabel: checkboxLabel,
          placeholder: input.placeholder || ''
        };
      });
    
    if (inputs.length === 0) return null;
    
    return {
      question: questionText,
      inputs: inputs,
      element: questionElement,
      isRequired: inputs.some(input => input.required)
    };
  }

  /**
   * Main form analysis function
   */
  async function analyzeApplicationForm(formElement) {
    console.log("Analyzing form...");
    
    const complexAnalyzer = DOM_CACHE.complexAnalyzer;
    const framework = complexAnalyzer.detectFramework();
    
    // Wait for dynamic content if needed
    if (!formElement && framework !== 'none') {
      console.log(`Detected ${framework}, waiting for form...`);
      formElement = await complexAnalyzer.waitForDynamicContent();
    }
    
    // Find form if not provided
    if (!formElement) {
      formElement = complexAnalyzer.findDynamicForm();
    }
    
    if (!formElement) {
      console.error("No form found");
      return {
        isLinkedInForm: false,
        formElement: null,
        complexQuestions: [],
        fields: [],
        getAllInputs: () => [],
        getInputById: () => null
      };
    }
    
    DOM_CACHE.clearCache();
    
    // Detect form type
    const isLinkedInForm = formElement.classList.contains('jobs-easy-apply-content') ||
                          formElement.querySelector('.jobs-easy-apply-content') !== null;
    
    console.log(`Form found - LinkedIn: ${isLinkedInForm}, Framework: ${framework}`);
    
    let complexQuestions = [];
    let standaloneFields = [];
    
    // Process LinkedIn questions
    if (isLinkedInForm) {
      const questionGroups = Array.from(
        formElement.querySelectorAll('.jobs-easy-apply-form-section__grouping, .jobs-easy-apply-form-section')
      ).filter(isElementVisible);
      
      complexQuestions = questionGroups
        .map(group => analyzeQuestionGroup(group, formElement))
        .filter(q => q !== null);
    }
    
    // Process all inputs
    const processedElements = new Set();
    complexQuestions.forEach(q => {
      q.inputs.forEach(input => processedElements.add(input.element));
    });
    
    const allInputs = Array.from(
      formElement.querySelectorAll('input, select, textarea, [role="textbox"], [role="combobox"], [role="checkbox"], [role="radio"], [contenteditable="true"]')
    );
    
    standaloneFields = allInputs
      .filter(el => !processedElements.has(el) && isInputField(el) && isElementVisible(el))
      .map(input => {
        const labels = findElementLabels(input, formElement);
        const labelText = labels.length > 0 ? labels.map(l => l.text).join(' / ') : '';
        
        let inputType = input.tagName.toLowerCase();
        if (inputType === 'input') {
          inputType = input.type.toLowerCase();
        }
        
        let options = null;
        if (input.tagName.toLowerCase() === 'select') {
          options = Array.from(input.options).map(opt => ({
            value: opt.value,
            text: opt.text.trim()
          }));
        }
        
        return {
          element: input,
          id: input.id || '',
          name: input.name || '',
          type: inputType,
          label: labelText,
          required: input.required || input.getAttribute('aria-required') === 'true',
          value: input.value || '',
          options: options,
          placeholder: input.placeholder || ''
        };
      });
    
    console.log(`Analysis complete: ${complexQuestions.length} questions, ${standaloneFields.length} fields`);
    
    return {
      isLinkedInForm,
      formElement,
      complexQuestions,
      fields: standaloneFields,
      framework,
      
      getAllInputs() {
        const all = [...this.fields];
        this.complexQuestions.forEach(q => {
          q.inputs.forEach(input => {
            all.push({
              ...input,
              complexQuestion: q.question
            });
          });
        });
        return all;
      },
      
      getInputById(id) {
        const field = this.fields.find(f => f.id === id || f.name === id);
        if (field) return field;
        
        for (const q of this.complexQuestions) {
          const input = q.inputs.find(i => i.id === id || i.name === id);
          if (input) return {...input, complexQuestion: q.question};
        }
        
        return null;
      }
    };
  }

  /**
   * Apply responses to form
   */
  function applyResponsesToForm(formAnalysis, responses) {
    console.log("Applying responses...");
    
    if (!formAnalysis || !responses || typeof responses !== 'object') {
      console.error('Invalid form analysis or responses');
      return {
        success: false,
        filledFields: [],
        totalFields: 0,
        fillRate: 0
      };
    }
    
    const filledFields = [];
    
    function setInputValue(input, value) {
      if (!input || !input.element) return false;
      
      const element = input.element;
      const type = input.type;
      
      try {
        if (type === 'checkbox') {
          element.checked = !!value;
        } 
        else if (type === 'radio') {
          if (element.name) {
            const radioGroup = document.querySelectorAll(`input[type="radio"][name="${element.name}"]`);
            for (const radio of radioGroup) {
              if (radio.value === value.toString()) {
                radio.checked = true;
                break;
              }
            }
          } else {
            element.checked = !!value;
          }
        }
        else if (type === 'select-one' || type === 'select') {
          let optionFound = false;
          
          // Try exact match first
          for (const option of element.options) {
            if (option.value === value.toString() || option.text === value.toString()) {
              element.value = option.value;
              optionFound = true;
              break;
            }
          }
          
          // Try fuzzy match
          if (!optionFound) {
            const valueStr = value.toString().toLowerCase();
            for (const option of element.options) {
              if (option.value.toLowerCase().includes(valueStr) || 
                  option.text.toLowerCase().includes(valueStr)) {
                element.value = option.value;
                optionFound = true;
                break;
              }
            }
          }
          
          // Default to first non-empty option
          if (!optionFound && element.options.length > 0) {
            for (const option of element.options) {
              if (option.value) {
                element.value = option.value;
                break;
              }
            }
          }
        }
        else if (type === 'contenteditable') {
          element.textContent = value.toString();
          element.innerHTML = value.toString();
        }
        else {
          element.value = value.toString();
        }
        
        // Trigger events
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        
        return true;
      } catch (error) {
        console.error('Error setting input value:', error);
        return false;
      }
    }
    
    // Strategy 1: Direct field matches by ID or name
    formAnalysis.getAllInputs().forEach(input => {
      const id = input.id || input.name;
      if (!id) return;
      
      if (responses[id] !== undefined && responses[id] !== "MANUAL_INPUT_REQUIRED") {
        const success = setInputValue(input, responses[id]);
        if (success) {
          filledFields.push({
            id: id,
            value: responses[id],
            type: 'direct-match'
          });
        }
      }
    });
    
    // Strategy 2: Complex questions using question text matching
    formAnalysis.complexQuestions.forEach(question => {
      const questionKey = Object.keys(responses).find(key => 
        key === question.question || 
        question.question.includes(key) || 
        key.includes(question.question)
      );
      
      if (questionKey && responses[questionKey] !== "MANUAL_INPUT_REQUIRED") {
        const response = responses[questionKey];
        
        if (response && typeof response === 'object') {
          question.inputs.forEach(input => {
            const inputId = input.id || input.name;
            if (inputId && response[inputId] !== undefined && response[inputId] !== "MANUAL_INPUT_REQUIRED") {
              const success = setInputValue(input, response[inputId]);
              if (success) {
                filledFields.push({
                  id: inputId,
                  value: response[inputId],
                  type: 'complex-nested'
                });
              }
            }
          });
        } 
        else if (question.inputs.length === 1) {
          const input = question.inputs[0];
          const success = setInputValue(input, response);
          if (success) {
            filledFields.push({
              id: input.id || input.name,
              value: response,
              type: 'complex-single'
            });
          }
        }
      }
    });
    
    // Strategy 3: Label-based matches for standalone fields
    formAnalysis.fields.forEach(field => {
      if (!field.label) return;
      
      const labelKey = Object.keys(responses).find(key => 
        key === field.label || 
        field.label.includes(key) || 
        key.includes(field.label)
      );
      
      if (labelKey && responses[labelKey] !== "MANUAL_INPUT_REQUIRED" && !filledFields.some(f => f.id === field.id)) {
        const success = setInputValue(field, responses[labelKey]);
        if (success) {
          filledFields.push({
            id: field.id,
            value: responses[labelKey],
            type: 'label-match'
          });
        }
      }
    });
    
    // Strategy 4: Intelligent field inference
    formAnalysis.getAllInputs().forEach(input => {
      if (filledFields.some(f => f.id === (input.id || input.name))) return;
      
      const type = input.type;
      const label = (input.label || '').toLowerCase();
      const fieldName = (input.name || '').toLowerCase();
      const id = (input.id || '').toLowerCase();
      
      // File upload detection and handling
      if (type === 'file') {
        // Check if this is likely a resume/CV upload
        if (label.includes('resume') || label.includes('cv') || 
            fieldName.includes('resume') || fieldName.includes('cv') ||
            id.includes('resume') || id.includes('cv') ||
            label.includes('document') || label.includes('upload')) {
          
          // Use global agent instance if available
          if (window.linkedInAutoApplyAgent && window.linkedInAutoApplyAgent.handleFileUpload) {
            console.log("Attempting resume upload for field:", input.id || input.name);
            window.linkedInAutoApplyAgent.handleFileUpload(input).then(success => {
              if (success) {
                filledFields.push({
                  id: input.id || input.name,
                  value: 'Resume uploaded',
                  type: 'file-upload'
                });
              }
            });
          }
          // Skip automatic form submission for file uploads - let user review first
          return;
        }
      }
      
      // Phone number detection
      if ((type === 'tel' || id.includes('phone') || fieldName.includes('phone') || 
           label.includes('phone')) && responses['phone'] && responses['phone'] !== "MANUAL_INPUT_REQUIRED") {
        const success = setInputValue(input, responses['phone']);
        if (success) {
          filledFields.push({
            id: input.id || input.name,
            value: responses['phone'],
            type: 'inferred-phone'
          });
        }
      }
      // Email detection
      else if ((type === 'email' || id.includes('email') || fieldName.includes('email') || 
               label.includes('email')) && responses['email'] && responses['email'] !== "MANUAL_INPUT_REQUIRED") {
        const success = setInputValue(input, responses['email']);
        if (success) {
          filledFields.push({
            id: input.id || input.name,
            value: responses['email'],
            type: 'inferred-email'
          });
        }
      }
      // Name detection
      else if ((id.includes('name') || fieldName.includes('name') || 
               label.includes('name')) && responses['fullName'] && responses['fullName'] !== "MANUAL_INPUT_REQUIRED") {
        const success = setInputValue(input, responses['fullName']);
        if (success) {
          filledFields.push({
            id: input.id || input.name,
            value: responses['fullName'],
            type: 'inferred-name'
          });
        }
      }
    });
    
    const totalFields = formAnalysis.getAllInputs().length;
    
    return {
      success: filledFields.length > 0,
      filledFields: filledFields,
      totalFields: totalFields,
      fillRate: totalFields > 0 ? filledFields.length / totalFields : 0
    };
  }

  // Export the main functions
  console.log("Exporting form analyzer functions to global scope");
  
  window.formAnalyzer = {
    analyzeApplicationForm,
    applyResponsesToForm,
    ComplexFormAnalyzer: ComplexFormAnalyzerClass
  };

  window.ComplexFormAnalyzer = ComplexFormAnalyzerClass;
  
  console.log("✅ Form analyzer exported successfully - no redeclaration conflicts!");

})(); // Single IIFE closure - contains everything safely 