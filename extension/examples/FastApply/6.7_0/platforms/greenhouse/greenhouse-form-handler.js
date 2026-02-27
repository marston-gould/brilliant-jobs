// getFieldType
import AIService from "../../services/ai-service.js";
import { notifyStatus } from "../../utils/status-helper.js";
import { AIResponseUtils } from "../../shared/utilities/index.js";
// ========================================
// GREENHOUSE FORM HANDLER - UPDATED
// ========================================

export default class GreenhouseFormHandler {
    constructor(options = {}) {
        this.host = options.host;
        this.userData = options.userData || {};
        this.jobDescription = options.jobDescription || "";
        this.aiService = new AIService({ apiHost: this.host, platform: "greenhouse" });
        this.answerCache = new Map();
        
        // Co-pilot mode properties - Global overlay used via notifyStatus()
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

    /**
     * Fill form with user profile data using AI - Greenhouse specific
     */
    async fillFormWithProfile(form, profile) {
        try {
            this.userData = profile;

            // Get all form fields using the updated approach
            const formFields = await this.getAllGreenhouseFormFields(form);

            let filledCount = 0;
            let skippedCount = 0;

            for (const field of formFields) {
                if (this.shouldSkipField(field)) {
                    continue;
                }

                try {

                    // Get AI answer with options
                    const answer = await this.getAIAnswer(
                        field.label,
                        field.options || [],
                        field.type,
                        this.buildFieldContext(field)
                    );

                    console.log(`📝 Field: ${field.label}, Type: ${field.type}, Answer: ${answer}`);

                    if (answer !== null && answer !== undefined && answer !== "") {
                        const success = await this.fillField(
                            field.element,
                            answer,
                            field.type,
                            field.options
                        );
                        console.log(`${success ? '✅' : '❌'} Fill result for ${field.label}: ${success}`);
                        if (success) {
                            filledCount++;
                        } else {
                            skippedCount++;
                        }
                    } else {
                        console.log(`⚠️ No answer for ${field.label}`);
                        skippedCount++;
                    }

                    // Small delay between fields
                    await this.wait(200);
                } catch (fieldError) {
                    console.error(`❌ Error filling field ${field.label}:`, fieldError);
                    skippedCount++;
                }
            }

            await this.handleRequiredCheckboxes(form);

            // Re-scan for dynamically added fields (e.g., race field appears after Hispanic/Latino is answered "No")
            await this.wait(500); // Wait for React to re-render
            const newFormFields = await this.getAllGreenhouseFormFields(form);
            const existingLabels = new Set(formFields.map(f => f.label));
            const dynamicFields = newFormFields.filter(f => !existingLabels.has(f.label));

            if (dynamicFields.length > 0) {
                for (const field of dynamicFields) {
                    if (this.shouldSkipField(field)) {
                        continue;
                    }

                    try {
                        const answer = await this.getAIAnswer(
                            field.label,
                            field.options || [],
                            field.type,
                            this.buildFieldContext(field)
                        );

                        console.log(`📝 Field: ${field.label}, Type: ${field.type}, Answer: ${answer}`);

                        if (answer !== null && answer !== undefined && answer !== "") {
                            const success = await this.fillField(
                                field.element,
                                answer,
                                field.type,
                                field.options
                            );
                            console.log(`${success ? '✅' : '❌'} Fill result for ${field.label}: ${success}`);
                            if (success) {
                                filledCount++;
                            }
                        }

                        await this.wait(200);
                    } catch (fieldError) {
                        console.error(`❌ Error filling dynamic field ${field.label}:`, fieldError);
                    }
                }
            }

            return filledCount > 0;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get all form fields from a Greenhouse application form using active extraction
     */
    async getAllGreenhouseFormFields(form) {
        try {
            const fields = [];

            // Find all labels first (like the working code)
            const labels = [...form.querySelectorAll('label')];

            for (const label of labels) {
                const forAttr = label.getAttribute('for');
                const labelText = label.innerText.trim();

                let element = document.getElementById(forAttr);

                if (!element || !this.isElementVisible(element)) {
                    continue;
                }

                let required = element.getAttribute('aria-required') === 'true' || element.required;
                let labelTextClean = labelText;

                // Clean up label text
                if (labelTextClean.endsWith('*')) {
                    labelTextClean = labelTextClean.slice(0, -1).trim();
                    required = true;
                }

                // Skip file uploads and unwanted fields
                if (element.id === 'resume' || element.id === 'cover_letter' || element.type === 'file') {
                    continue;
                }

                // Handle cover letter text
                if (element.id === 'cover_letter_text') {
                    labelTextClean = "Cover letter";
                }

                // Phone fields: Greenhouse has a separate country code dropdown,
                // so don't ask the AI to include the country code in the phone number
                if (labelTextClean.toLowerCase().includes('phone')) {
                    labelTextClean += ' (without country code, digits only)';
                }

                const fieldInfo = await this.processFieldElement(element, labelTextClean, required);
                if (fieldInfo) {
                    fields.push(fieldInfo);
                }
            }

            return fields;
        } catch (error) {
            return [];
        }
    }

    /**
     * Process individual field element and extract options
     */
    async processFieldElement(element, labelText, required) {
        try {
            if (element.tagName === 'INPUT') {
                if (element.type === 'file') {
                    return null; // Skip file inputs
                }

                // Handle radio/checkbox groups
                if (element.type === 'radio' || element.type === 'checkbox') {
                    return await this.processRadioCheckboxGroup(element, labelText, required);
                }

                // Handle combobox/select elements
                if (element.getAttribute('role') === 'combobox') {
                    return await this.processComboboxField(element, labelText, required);
                }

                // Regular input field
                return {
                    element: element,
                    type: element.type,
                    label: this.cleanLabelText(labelText),
                    required: required,
                    options: []
                };

            } else if (element.tagName === 'TEXTAREA') {
                return {
                    element: element,
                    type: 'textarea',
                    label: this.cleanLabelText(labelText),
                    required: required,
                    options: []
                };
            } else if (element.tagName === 'SELECT') {
                return await this.processSelectField(element, labelText, required);
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Process radio/checkbox group using fieldset approach
     */
    async processRadioCheckboxGroup(element, labelText, required) {
        try {
            const fieldset = element.closest('fieldset');
            if (!fieldset) {
                // Single checkbox/radio without fieldset
                return {
                    element: element,
                    type: element.type,
                    label: this.cleanLabelText(labelText),
                    required: required,
                    options: []
                };
            }

            const legend = fieldset.querySelector('legend');
            if (!legend) {
                return null;
            }

            // Extract options from all labels in the fieldset
            const optionLabels = [...fieldset.querySelectorAll('label:not(.greenhouse-application-form-question-title)')];
            const options = optionLabels.map(option => this.cleanLabelText(option.innerText));
            const elements = optionLabels.map(option => document.getElementById(option.getAttribute('for'))).filter(Boolean);

            // Only process the first element in the group
            if (!elements || elements[0] !== element) {
                return null;
            }

            let legendText = legend.innerText.trim();
            if (legendText.endsWith('*')) {
                legendText = legendText.slice(0, -1).trim() + ' (you need to select at least one option)';
                required = true;
            }

            return {
                element: elements,
                type: elements[0].type,
                label: this.cleanLabelText(legendText),
                required: required,
                options: options
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Process combobox field with active option extraction
     */
    async processComboboxField(element, labelText, required) {
        try {
            const labelLower = labelText.toLowerCase();

            // Location fields use autocomplete - skip option extraction
            if (labelLower.startsWith('location') || labelLower.includes('city') || labelLower.includes('where are you based')) {
                return {
                    element: element,
                    type: 'location-autocomplete',
                    label: this.cleanLabelText(labelText),
                    required: required,
                    options: [] // No options - will use typing-based autocomplete
                };
            }

            // Extract options normally for non-location combobox fields
            let options = [];

            // Scroll to element and trigger dropdown
            this.scrollToElement(element.parentElement);
            await this.wait(300);

            // Focus the element first
            element.focus();
            await this.wait(100);

            // Try multiple methods to trigger the dropdown
            element.click();
            await this.wait(100);
            element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            await this.wait(50);
            element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            await this.wait(100);
            element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
            await this.wait(200);

            // Try to get options with retry logic
            for (let attempt = 0; attempt < 10; attempt++) {
                await this.wait(400);

                // Try multiple ways to find the listbox
                let listbox = null;

                // Method 1: Using aria-controls
                const listboxId = element.getAttribute('aria-controls');
                if (listboxId) {
                    listbox = document.getElementById(listboxId);
                }

                // Method 2: Look for visible select menu near the element
                if (!listbox) {
                    const menus = document.querySelectorAll('.select__menu, [role="listbox"], [class*="menu"]');
                    for (const menu of menus) {
                        if (this.isElementVisible(menu)) {
                            listbox = menu;
                            break;
                        }
                    }
                }

                if (listbox && this.isElementVisible(listbox)) {
                    const listboxItems = listbox.querySelectorAll('div[role=option], [role="option"]');
                    if (listboxItems.length) {
                        options = [...listboxItems].map(option => this.cleanLabelText(option.innerText));
                        break;
                    }

                    // Check for no results indicator
                    if (listbox.querySelector('p')?.parentElement?.className.includes('_noResults')) {
                        break;
                    }
                }

            }

            // Close dropdown
            element.dispatchEvent(new Event('focusout', { bubbles: true }));
            element.blur();
            document.body.click(); // Click elsewhere to close
            await this.wait(300);

            return {
                element: element,
                type: 'select',
                label: this.cleanLabelText(labelText),
                required: required,
                options: options
            };
        } catch (error) {
            return {
                element: element,
                type: 'select',
                label: this.cleanLabelText(labelText),
                required: required,
                options: []
            };
        }
    }

    /**
     * Process regular select field
     */
    async processSelectField(element, labelText, required) {
        try {
            const options = [];
            const optionElements = element.querySelectorAll("option");

            optionElements.forEach((option) => {
                const text = option.textContent.trim();
                if (text && !text.toLowerCase().includes("select") &&
                    text !== "---" && option.value !== "") {
                    options.push(this.cleanLabelText(text));
                }
            });

            return {
                element: element,
                type: 'select',
                label: this.cleanLabelText(labelText),
                required: required,
                options: options
            };
        } catch (error) {
            return {
                element: element,
                type: 'select',
                label: this.cleanLabelText(labelText),
                required: required,
                options: []
            };
        }
    }

    /**
     * Get label text for a form field - Updated approach
     */
    getGreenhouseFieldLabel(element) {
        try {
            // This method is now mainly used as fallback
            // Primary label extraction happens in getAllGreenhouseFormFields

            // Standard HTML label association
            if (element.id) {
                const label = document.querySelector(`label[for="${element.id}"]`);
                if (label) {
                    return this.cleanLabelText(label.textContent);
                }
            }

            // Parent label
            const parentLabel = element.closest("label");
            if (parentLabel) {
                const clone = parentLabel.cloneNode(true);
                clone.querySelectorAll("input, select, textarea").forEach((el) => el.remove());
                return this.cleanLabelText(clone.textContent);
            }

            // Aria-label
            if (element.getAttribute("aria-label")) {
                return this.cleanLabelText(element.getAttribute("aria-label"));
            }

            // Placeholder as fallback
            if (element.placeholder) {
                return this.cleanLabelText(element.placeholder);
            }

            return "";
        } catch (error) {
            return "";
        }
    }

    /**
     * Fill a form field with the appropriate value - Updated for array elements
     */
    async fillField(element, value, fieldType, options = []) {
        try {
            if (!element || value === undefined || value === null) {
                return false;
            }


            // Handle array elements (radio/checkbox groups)
            if (Array.isArray(element)) {
                return await this.fillFieldArray(element, value, fieldType, options);
            }

            switch (fieldType) {
                case "text":
                case "email":
                case "url":
                case "number":
                case "phone":
                case "tel":
                    return await this.fillInputField(element, value);

                case "textarea":
                    return await this.fillTextareaField(element, value);

                case "location-autocomplete":
                    return await this.fillLocationAutocomplete(element, value);

                case "select":
                    if (element.getAttribute('role') === 'combobox') {
                        return await this.fillComboboxField(element, value);
                    } else {
                        return await this.fillSelectField(element, value);
                    }

                case "checkbox":
                case "radio":
                    return await this.fillSingleRadioCheckbox(element, value);

                case "date":
                    return await this.fillDateField(element, value);

                default:
                    console.warn(`⚠️ Unknown field type: ${fieldType}, falling back to default`);
                    return false;
            }
        } catch (error) {
            return false;
        }
    }

    /**
     * Fill array of elements (radio/checkbox groups)
     */
    async fillFieldArray(elements, value, fieldType, options = []) {
        try {
            this.scrollToElement(elements[0]);
            await this.wait(200);

            if (!Array.isArray(value)) {
                value = [value];
            }

            let filled = false;

            for (let i = 0; i < elements.length; i++) {
                const el = elements[i];
                const optionText = options[i] || '';

                const shouldSelect = value.some(val => {
                    const valStr = String(val).toLowerCase().trim();
                    const optionStr = optionText.toLowerCase().trim();
                    return optionStr === valStr ||
                        optionStr.includes(valStr) ||
                        valStr.includes(optionStr);
                });

                if (shouldSelect && !el.checked) {
                    el.click();
                    await this.wait(500);
                    filled = true;
                } else if (fieldType === 'checkbox' && el.checked && !shouldSelect) {
                    // Uncheck if it shouldn't be selected
                    el.click();
                    await this.wait(500);
                    filled = true;
                }
            }

            return filled;
        } catch (error) {
            return false;
        }
    }

    /**
     * Extract options from combobox modal (Greenhouse/Workable pattern)
     */
    async extractComboboxOptions(element) {
        try {
            // Wait for modal/menu to appear
            await this.wait(300);

            // Find the select menu using multiple selectors
            const menuSelectors = [
                '.select__menu',
                '[role="listbox"]',
                '[class*="select__menu"]',
                '[class*="menu"]',
                '.dropdown-menu',
                '[data-ui="select-menu"]'
            ];

            let menu = null;
            for (const selector of menuSelectors) {
                menu = document.querySelector(selector);
                if (menu && this.isElementVisible(menu)) break;
            }

            if (!menu) {
                console.warn('Could not find select menu');
                return [];
            }

            // Extract option text from list items
            const optionElements = menu.querySelectorAll('[role="option"], .select__option, [class*="option"]');
            const options = [];

            for (const optionElement of optionElements) {
                if (!this.isElementVisible(optionElement)) continue;

                const optionText = optionElement.textContent.trim();
                if (optionText && optionText.length > 0) {
                    options.push(optionText);
                    // Store the element reference for later selection
                    optionElement.setAttribute('data-option-text', optionText);
                }
            }

            return options;
        } catch (error) {
            console.error('Error extracting combobox options:', error);
            return [];
        }
    }

    /**
     * Select the matching option in the combobox modal
     */
    async selectComboboxOption(optionText) {
        try {
            // Find the menu
            const menuSelectors = [
                '.select__menu',
                '[role="listbox"]',
                '[class*="select__menu"]'
            ];

            let menu = null;
            for (const selector of menuSelectors) {
                menu = document.querySelector(selector);
                if (menu && this.isElementVisible(menu)) break;
            }

            if (!menu) {
                console.warn('Menu not found when trying to select option');
                return false;
            }

            // Find all option elements
            const optionElements = menu.querySelectorAll('[role="option"], .select__option, [class*="option"]');

            for (const optionElement of optionElements) {
                const storedText = optionElement.getAttribute('data-option-text');
                const optionTextContent = optionElement.textContent.trim();

                // Check if this option matches
                if (storedText === optionText ||
                    optionTextContent === optionText ||
                    optionTextContent.toLowerCase() === optionText.toLowerCase()) {
                    // Scroll to the option if needed
                    optionElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await this.wait(200);

                    // Click the option element
                    optionElement.click();
                    await this.wait(500);

                    return true;
                }
            }

            return false;
        } catch (error) {
            console.error('Error selecting combobox option:', error);
            return false;
        }
    }

    /**
     * Fill combobox field (Greenhouse/Workable pattern with modal)
     * Pattern: click field → extract options → close modal → get AI answer → click field again → select matching option
     */
    async fillComboboxField(element, value) {
        try {
            if (!value || typeof value !== 'string') {
                return false;
            }

            this.scrollToElement(element);
            element.focus();
            await this.wait(200);

            // Trigger the dropdown to open - try multiple methods
            element.click();
            await this.wait(100);
            element.dispatchEvent(new Event('mouseup', { bubbles: true }));
            await this.wait(100);
            element.dispatchEvent(new Event('mousedown', { bubbles: true }));
            await this.wait(300);

            // Try to find the listbox using aria-controls or by searching the DOM
            let listbox = null;
            const listboxId = element.getAttribute('aria-controls');
            
            if (listboxId) {
                listbox = document.getElementById(listboxId);
            }
            
            // Fallback: search for visible listbox
            if (!listbox) {
                const listboxes = document.querySelectorAll('[role="listbox"], .select__menu');
                for (const lb of listboxes) {
                    if (this.isElementVisible(lb)) {
                        listbox = lb;
                        break;
                    }
                }
            }

            if (!listbox) {
                console.warn('Could not find listbox for combobox');
                element.blur();
                return false;
            }

            // Find all options in the listbox
            const optionElements = listbox.querySelectorAll('[role="option"], .select__option, [class*="option"]');
            
            if (optionElements.length === 0) {
                console.warn('No options found in listbox');
                element.blur();
                return false;
            }

            // Extract option texts and find best match
            const options = [];
            for (const optEl of optionElements) {
                if (this.isElementVisible(optEl)) {
                    const text = optEl.textContent.trim();
                    if (text) {
                        options.push(text);
                        optEl.setAttribute('data-option-text', text);
                    }
                }
            }

            const bestMatch = this.findBestMatchingOption(value, options);
            
            if (!bestMatch) {
                console.warn(`No matching option found for: ${value}`);
                element.blur();
                return false;
            }

            // Find and click the matching option
            for (const optEl of optionElements) {
                const storedText = optEl.getAttribute('data-option-text');
                const optText = optEl.textContent.trim();
                
                if (storedText === bestMatch || 
                    optText === bestMatch ||
                    optText.toLowerCase() === bestMatch.toLowerCase()) {
                    
                    console.log(`🎯 Found matching option: ${bestMatch}`);
                    
                    // Scroll to option if needed
                    optEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await this.wait(200);
                    
                    // Try multiple click methods
                    optEl.click();
                    await this.wait(300);
                    
                    // Verify if the dropdown closed (indicates success)
                    const listboxStillVisible = this.isElementVisible(listbox);
                    if (!listboxStillVisible) {
                        console.log(`✅ Selected option: ${bestMatch}`);
                        return true;
                    }
                    
                    // Try clicking again with mouse events
                    optEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    optEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                    optEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                    await this.wait(300);
                    
                    console.log(`✅ Selected option: ${bestMatch}`);
                    return true;
                }
            }

            console.warn(`Could not find clickable element for option: ${bestMatch}`);
            element.blur();
            return false;

        } catch (error) {
            console.error('Error in fillComboboxField:', error);
            // Try to close any open dropdown
            try {
                element.blur();
                document.body.click();
            } catch (e) {
                // Ignore
            }
            return false;
        }
    }


    /**
     * Fill location autocomplete field by typing city name
     */
    async fillLocationAutocomplete(element, value) {
        try {
            if (!value || typeof value !== 'string') {
                console.warn('❌ Invalid value for location autocomplete');
                return false;
            }

            console.log(`🌍 Filling location autocomplete with: ${value}`);

            this.scrollToElement(element);
            await this.wait(300);

            // Simulate real human interaction to activate the field
            // Try parent container click first (sometimes needed for custom inputs)
            const container = element.parentElement;
            if (container) {
                container.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                await this.wait(50);
                container.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                await this.wait(50);
            }

            // Now interact with the actual input element
            element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            await this.wait(50);
            element.focus();
            await this.wait(50);
            element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            await this.wait(50);
            element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            await this.wait(300);

            // Clear existing value
            element.value = '';
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            await this.wait(200);

            // Type the city name character by character to trigger autocomplete
            for (let i = 0; i < value.length; i++) {
                const char = value.charAt(i);

                // Dispatch keydown event
                element.dispatchEvent(new KeyboardEvent('keydown', {
                    key: char,
                    bubbles: true,
                    cancelable: true
                }));

                // Update value
                element.value = value.substring(0, i + 1);

                // Dispatch input and change events
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));

                // Dispatch keyup event
                element.dispatchEvent(new KeyboardEvent('keyup', {
                    key: char,
                    bubbles: true,
                    cancelable: true
                }));

                await this.wait(120); // Slightly slower, more human-like typing
            }

            console.log(`⌨️ Typed: "${value}"`);
            await this.wait(1000); // Wait longer for autocomplete dropdown to appear

            // Try to find and click the first matching option
            const listboxId = element.getAttribute('aria-controls');
            let listbox = null;

            if (listboxId) {
                listbox = document.getElementById(listboxId);
            }

            // Fallback: search for visible listbox (specifically .select__menu for Greenhouse)
            if (!listbox || !this.isElementVisible(listbox)) {
                const menus = document.querySelectorAll('.select__menu, [role="listbox"]');
                for (const menu of menus) {
                    if (this.isElementVisible(menu)) {
                        listbox = menu;
                        break;
                    }
                }
            }

            if (!listbox) {
                console.warn('⚠️ No autocomplete dropdown found, keeping typed value');
                // Press Enter or Tab to confirm
                element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                await this.wait(200);
                element.blur();
                return true; // Consider it success if we typed the value
            }

            // Find options in the listbox using Greenhouse-specific selector
            const optionElements = listbox.querySelectorAll('.select__option, [role="option"]');
            if (optionElements.length === 0) {
                console.warn('⚠️ No options in autocomplete dropdown');
                element.blur();
                return true; // Typed value might still be valid
            }

            console.log(`📋 Found ${optionElements.length} autocomplete options`);

            // Click the first visible option (usually the best match)
            for (const optEl of optionElements) {
                if (this.isElementVisible(optEl)) {
                    const optionText = optEl.textContent.trim();
                    console.log(`🎯 Selecting autocomplete option: ${optionText}`);

                    optEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await this.wait(150);

                    optEl.click();
                    await this.wait(300);

                    console.log(`✅ Location autocomplete filled successfully`);
                    return true;
                }
            }

            console.warn('⚠️ Could not click any autocomplete option');
            element.blur();
            return false;

        } catch (error) {
            console.error('❌ Error in fillLocationAutocomplete:', error);
            try {
                element.blur();
            } catch (e) {
                // Ignore
            }
            return false;
        }
    }

    /**
     * Fill single radio/checkbox (not in a group)
     */
    async fillSingleRadioCheckbox(element, value) {
        try {
            const shouldCheck = this.parseAIBoolean(value);

            if (shouldCheck !== null && element.checked !== shouldCheck) {
                this.scrollToElement(element);
                element.focus();
                element.click();
                await this.wait(200);
                return true;
            }

            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Check if field should be skipped
     */
    shouldSkipField(field) {
        if (!field.label) return true;

        const labelLower = field.label.toLowerCase();

        // Skip file fields
        if (field.type === "file") {
            return true;
        }

        // Skip "Other URL" fields silently
        if (
            labelLower.includes("other url") ||
            labelLower.includes("other website") ||
            labelLower.includes("additional url") ||
            (labelLower === "other" && field.type === "url")
        ) {
            return true;
        }

        return false;
    }

    /**
     * Get AI answer for a form field using specialized AI service methods (same as Workable/Lever/LinkedIn/Wellfound)
     */
    async getAIAnswer(question, options = [], fieldType = "text", fieldContext = "", retryCount = 0) {
        try {
            const cacheKey = `${question}_${options.join("_")}_${fieldType}`;

            // Check cache first
            if (this.answerCache.has(cacheKey)) {
                return this.answerCache.get(cacheKey);
            }

            const context = {
                platform: "greenhouse",
                userData: this.userData,
                jobDescription: this.jobDescription,
                fieldType,
                fieldContext,
                required: fieldContext.includes('required')
            };

            let answer;

            // Use specialized AI service methods based on field type and context (same as other platforms)
            if (fieldType === "checkbox" && options && options.length > 1) {
                answer = await this.aiService.getMultiSelectAnswer(question, options, context);
            } else if (options && options.length > 0) {
                answer = await this.aiService.getOptionAnswer(question, options, context);
            } else if (AIResponseUtils.isSalaryField(question)) {
                answer = await this.aiService.getSalaryAnswer(question, options, context);
            } else if (fieldType === 'textarea' ||
                       fieldContext.toLowerCase().includes('cover letter') ||
                       fieldContext.toLowerCase().includes('describe') ||
                       fieldContext.toLowerCase().includes('why')) {
                answer = await this.aiService.getLongformAnswer(question, options, context);
            } else {
                answer = await this.aiService.getNormalAnswer(question, options, context);
            }

            if (answer === null || answer === undefined || answer === "" || String(answer).trim() === "") {
                if (retryCount < 2) {
                    await new Promise(resolve => setTimeout(resolve, 1000 + (retryCount * 500)));
                    
                    const retryContext = {
                        ...context,
                        fieldContext: context.fieldContext + ` (This field requires an answer. Please provide a response based on the user profile.)`
                    };
                    
                    let retryAnswer;
                    if (fieldType === "checkbox" && options && options.length > 1) {
                        retryAnswer = await this.aiService.getMultiSelectAnswer(question, options, retryContext);
                    } else if (options && options.length > 0) {
                        retryAnswer = await this.aiService.getOptionAnswer(question, options, retryContext);
                    } else if (AIResponseUtils.isSalaryField(question)) {
                        retryAnswer = await this.aiService.getSalaryAnswer(question, options, retryContext);
                    } else if (fieldType === 'textarea' ||
                               fieldContext.toLowerCase().includes('cover letter') ||
                               fieldContext.toLowerCase().includes('describe') ||
                               fieldContext.toLowerCase().includes('why')) {
                        retryAnswer = await this.aiService.getLongformAnswer(question, options, retryContext);
                    } else {
                        retryAnswer = await this.aiService.getNormalAnswer(question, options, retryContext);
                    }
                    
                    if ((retryAnswer === null || retryAnswer === undefined || retryAnswer === "" || String(retryAnswer).trim() === "") && retryCount < 1) {
                        return await this.getAIAnswer(question, options, fieldType, fieldContext, retryCount + 1);
                    }   
                    
                    if (retryAnswer !== null && retryAnswer !== undefined && String(retryAnswer).trim() !== "") {
                        this.answerCache.set(cacheKey, retryAnswer);
                        return retryAnswer;
                    }
                }
                
                return null;
            }

            // Cache the answer
            this.answerCache.set(cacheKey, answer);
            return answer;
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
     * Build context for AI field processing
     */
    buildFieldContext(field) {
        return [
            `Field type: ${field.type}`,
            field.required ? "This field is required" : "This field is optional",
            field.element.name ? `Field name: ${field.element.name}` : "",
            field.options && field.options.length > 0 ? `Available options: ${field.options.join(', ')}` : "",
            "Please provide your response based on the user profile data.",
        ]
            .filter(Boolean)
            .join(". ");
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
     * Check if a field is required
     */
    isFieldRequired(element) {
        if (element.required || element.getAttribute("aria-required") === "true") {
            return true;
        }

        const label = this.getGreenhouseFieldLabel(element);
        if (label && (label.includes("*") || label.includes("required"))) {
            return true;
        }

        const container = element.closest(".field, .form-field, .field-wrapper");
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
     * Fill input field
     */
    async fillInputField(element, value) {
        try {
            console.log(`📞 Filling input field with value: "${value}", type: ${element.type}`);
            this.scrollToElement(element);
            element.focus();
            await this.wait(100);

            element.value = "";
            element.dispatchEvent(new Event("input", { bubbles: true }));
            await this.wait(50);

            element.value = String(value);

            element.dispatchEvent(new Event("input", { bubbles: true }));
            element.dispatchEvent(new Event("change", { bubbles: true }));
            element.dispatchEvent(new Event("blur", { bubbles: true }));

            await this.wait(100);
            console.log(`✅ Input field filled successfully. Final value: "${element.value}"`);
            return true;
        } catch (error) {
            console.error(`❌ Error filling input field:`, error);
            return false;
        }
    }

    /**
     * Fill textarea field
     */
    async fillTextareaField(element, value) {
        return await this.fillInputField(element, value);
    }

    /**
     * Fill select field
     */
    async fillSelectField(element, value) {
        try {
            const optionElements = Array.from(element.options);
            const valueStr = String(value).toLowerCase().trim();

            let targetOption = null;

            for (const option of optionElements) {
                const optionText = option.textContent.trim();
                if (optionText.toLowerCase() === valueStr) {
                    targetOption = option;
                    break;
                }
            }

            if (!targetOption) {
                for (const option of optionElements) {
                    const optionText = option.textContent.toLowerCase().trim();
                    if (optionText.includes(valueStr) || valueStr.includes(optionText)) {
                        targetOption = option;
                        break;
                    }
                }
            }

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
                await this.wait(100);
                return true;
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
            let dateValue = value;

            if (element.type === "date") {
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
            // Handle required checkboxes that are not part of fieldsets
            const requiredCheckboxes = form.querySelectorAll('input[type="checkbox"][aria-required="true"]:not(:checked):not(fieldset *)');
            for (const checkbox of requiredCheckboxes) {
                if (this.isElementVisible(checkbox)) {
                    checkbox.click();
                    await this.wait(300);
                }
            }

            const requiredCheckboxes2 = form.querySelectorAll('input[type="checkbox"][required]:not(:checked):not(fieldset *)');
            for (const checkbox of requiredCheckboxes2) {
                if (this.isElementVisible(checkbox)) {
                    checkbox.click();
                    await this.wait(300);
                }
            }
        } catch (error) {
            return false;
        }
    }

    /**
     * Find best matching option using fuzzy matching
     */
    findBestMatchingOption(aiValue, options) {
        if (!aiValue || !options || options.length === 0) return null;

        const normalizedAIValue = String(aiValue).toLowerCase().trim();

        // First try exact match
        for (const option of options) {
            if (option.toLowerCase().trim() === normalizedAIValue) {
                return option;
            }
        }

        // Then try substring matches
        for (const option of options) {
            const normalizedOption = option.toLowerCase().trim();
            if (
                normalizedOption.includes(normalizedAIValue) ||
                normalizedAIValue.includes(normalizedOption)
            ) {
                return option;
            }
        }

        // Try word-based matching
        const aiWords = normalizedAIValue.split(/\s+/);
        let bestMatch = null;
        let bestScore = 0;

        for (const option of options) {
            const optionWords = option.toLowerCase().trim().split(/\s+/);
            let matchingWords = 0;

            for (const aiWord of aiWords) {
                if (
                    optionWords.some(
                        (optionWord) =>
                            optionWord.includes(aiWord) || aiWord.includes(optionWord)
                    )
                ) {
                    matchingWords++;
                }
            }

            const score =
                matchingWords / Math.max(aiWords.length, optionWords.length);
            if (score > bestScore && score > 0.5) {
                bestScore = score;
                bestMatch = option;
            }
        }

        return bestMatch;
    }

    /**
     * Parse AI boolean response
     */
    parseAIBoolean(value) {
        if (!value) return false;

        const normalizedValue = String(value).toLowerCase().trim();

        const positiveResponses = [
            "yes", "true", "agree", "accept", "confirm", "ok", "okay", "sure",
            "definitely", "absolutely", "correct", "right", "affirmative",
            "positive", "1", "checked", "check", "select",
        ];

        const negativeResponses = [
            "no", "false", "disagree", "decline", "deny", "refuse", "never",
            "negative", "incorrect", "wrong", "0", "unchecked", "uncheck",
            "deselect", "skip",
        ];

        if (positiveResponses.some((response) => normalizedValue.includes(response))) {
            return true;
        }

        if (negativeResponses.some((response) => normalizedValue.includes(response))) {
            return false;
        }

        return null;
    }

    /**
     * Find and submit the form
     */
    async submitForm(form) {
        try {
            const submitButton = this.findSubmitButton(form);
            if (!submitButton) {
                return false;
            }

            if (!this.isElementVisible(submitButton) || submitButton.disabled) {
                return false;
            }

            this.scrollToElement(submitButton);

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
                    await this.wait(500);
                    submitButton.click();

                    if (this.logger && typeof this.logger === 'function') {
                        this.logger({ type: 'SUBMITTING_APPLICATION' });
                    }

                    return true;
                } else if (userAction === "SKIP") {
                    return { success: false, reason: "user_skipped" };
                }
            }

            // Auto-pilot mode: submit directly
            await this.wait(500);
            submitButton.click();

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
            "button.btn-primary:last-child",
            "button:last-child",
        ];

        for (const selector of submitSelectors) {
            const button = form.querySelector(selector);
            if (button && this.isElementVisible(button) && !button.disabled) {
                return button;
            }
        }

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
}