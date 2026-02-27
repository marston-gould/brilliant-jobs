
/**
 * ========================================================================
 * COMPREHENSIVE ASHBY FORM FIELD EXTRACTOR
 * ========================================================================
 * 
 * This extractor handles all observed Ashby form field types with robust
 * detection, metadata extraction, and edge case handling.
 * 
 * Supported Field Types:
 * - File uploads (drag-and-drop)
 * - Text inputs (single-line)
 * - Email inputs
 * - Phone/Tel inputs
 * - URL inputs
 * - Number inputs
 * - Textarea (multi-line)
 * - Custom autocomplete/combobox (location selectors)
 * - Button-style radio groups (Yes/No)
 * - Traditional radio button groups
 * - Checkbox groups
 * - Single checkboxes
 * - Hidden fields
 * - System fields
 * - Conditional/dynamic fields
 * 
 * Author: Ashby Form Analysis Team
 * Version: 2.0
 * ========================================================================
 */

export class AshbyFormFieldExtractor {

  /**
   * ====================================================================
   * MAIN FIELD TYPE DETECTION METHOD
   * ====================================================================
   * Determines the field type with clear logical ordering from most
   * specific to most general patterns.
   * 
   * @param {Element} fieldElement - The field element or container
   * @returns {string} - The detected field type
   */
  determineAshbyFieldType(fieldElement) {
    // Guard clause: ensure element exists
    if (!fieldElement) {
      return 'unknown';
    }

    // ================================================================
    // PRIORITY 1: FILE UPLOAD FIELDS
    // ================================================================
    // Check for file upload container with drag-and-drop support
    // Signature: div._container_6k3nb_71 containing upload button
    if (fieldElement.querySelector('input[type="file"]') ||
        fieldElement.querySelector('[class*="_dropzone_"], [class*="_uploadButton_"]')) {
      return 'file';
    }

    // Check for autofill upload widget (resume parsing)
    if (fieldElement.classList.contains('ashby-application-form-autofill-input-root') ||
        fieldElement.querySelector('.ashby-application-form-autofill-input-root')) {
      return 'file-autofill';
    }

    // Check for upload button patterns
    const uploadButton = fieldElement.querySelector('button');
    if (uploadButton && 
        (uploadButton.textContent.toLowerCase().includes('upload') ||
         uploadButton.textContent.toLowerCase().includes('drag and drop'))) {
      return 'file';
    }

    // ================================================================
    // PRIORITY 2: PHONE NUMBER FIELDS WITH CONSENT
    // ================================================================
    // Check for phone number fields that have consent radio buttons
    // Signature: input[type="tel"] with consent radio buttons in same container
    const telInput = fieldElement.querySelector('input[type="tel"]');
    if (telInput) {
      // Check if this is a phone field with consent (has radio buttons for communication consent)
      const consentRadios = fieldElement.querySelector('[class*="_phoneNumberConsentLegalText_"] input[type="radio"]');
      if (consentRadios) {
        return 'tel-with-consent';
      }
      return 'tel';
    }

    // ================================================================
    // PRIORITY 3: CUSTOM AUTOCOMPLETE/COMBOBOX
    // ================================================================
    // Check for combobox role (location selectors, searchable dropdowns)
    const combobox = fieldElement.querySelector('[role="combobox"]');
    if (combobox) {
      return 'autocomplete';
    }

    // Check for floating container pattern (custom dropdown)
    if (fieldElement.querySelector('[class*="_floatingContainer_"]')) {
      return 'autocomplete';
    }

    // ================================================================
    // PRIORITY 3: YES/NO BUTTON GROUPS
    // ================================================================
    // Check for Yes/No button style (common in Ashby forms)
    // Signature: div._container_y2cw4_29._yesno_lxvad_149 with Yes/No buttons
    const yesNoContainer = fieldElement.querySelector('[class*="_yesno_"]');
    if (yesNoContainer) {
      const buttons = yesNoContainer.querySelectorAll('button[class*="_option_"]');
      if (buttons.length > 0) {
        return 'radio-button-group';
      }
    }

    // Check for button-style radio group (Yes/No style)
    // Signature: div._buttonGroup_ with role="radio" buttons
    const buttonGroup = fieldElement.querySelector('[class*="_buttonGroup_"]');
    if (buttonGroup) {
      const radioButtons = buttonGroup.querySelectorAll('[role="radio"]');
      if (radioButtons.length > 0) {
        return 'radio-button-group';
      }
    }

    // Check for traditional radio group
    // Signature: div._radioGroup_11kp9_50 containing radio inputs
    const radioGroup = fieldElement.querySelector('[class*="_radioGroup_"]');
    if (radioGroup) {
      return 'radio-group';
    }

    // Check for multiple radio inputs with same name
    const radioInputs = fieldElement.querySelectorAll('input[type="radio"]');
    if (radioInputs.length > 1) {
      return 'radio-group';
    }

    // Single radio input (edge case)
    if (radioInputs.length === 1) {
      return 'radio';
    }

    // ================================================================
    // PRIORITY 4: CHECKBOX GROUPS AND SINGLE CHECKBOXES
    // ================================================================
    // Filter out hidden checkbox inputs that are internal to yesno containers
    // (Ashby yesno fields include a hidden <input type="checkbox" tabindex="-1">)
    const checkboxInputs = Array.from(fieldElement.querySelectorAll('input[type="checkbox"]')).filter(cb => {
      if (cb.tabIndex === -1 && cb.closest('[class*="_yesno_"]')) return false;
      return true;
    });

    // Multiple checkboxes = checkbox group
    if (checkboxInputs.length > 1) {
      return 'checkbox-group';
    }

    // Single checkbox
    if (checkboxInputs.length === 1) {
      return 'checkbox';
    }

    // ================================================================
    // PRIORITY 5: NATIVE SELECT DROPDOWNS
    // ================================================================
    const selectElement = fieldElement.querySelector('select');
    if (selectElement) {
      return 'select';
    }

    // ================================================================
    // PRIORITY 6: TEXTAREA (MULTI-LINE TEXT)
    // ================================================================
    const textarea = fieldElement.querySelector('textarea');
    if (textarea) {
      return 'textarea';
    }

    // ================================================================
    // PRIORITY 7: HIDDEN FIELDS
    // ================================================================
    const hiddenInput = fieldElement.querySelector('input[type="hidden"]');
    if (hiddenInput) {
      return 'hidden';
    }

    // ================================================================
    // PRIORITY 8: SPECIFIC INPUT TYPES (EMAIL, TEL, URL, NUMBER, DATE)
    // ================================================================
    const input = fieldElement.querySelector('input');
    if (input) {
      const inputType = input.getAttribute('type');

      // Email input
      if (inputType === 'email') {
        return 'email';
      }

      // Phone/Tel input
      if (inputType === 'tel') {
        return 'tel';
      }

      // URL input
      if (inputType === 'url') {
        return 'url';
      }

      // Number input
      if (inputType === 'number') {
        return 'number';
      }

      // Date input
      if (inputType === 'date') {
        return 'date';
      }

      // Time input
      if (inputType === 'time') {
        return 'time';
      }

      // DateTime-local input
      if (inputType === 'datetime-local') {
        return 'datetime';
      }

      // Range/Slider input
      if (inputType === 'range') {
        return 'range';
      }

      // Color picker
      if (inputType === 'color') {
        return 'color';
      }
    }

    // ================================================================
    // PRIORITY 9: SYSTEM FIELDS
    // ================================================================
    // Check for system field prefix in id/name
    if (input && 
        (input.id?.startsWith('_systemfield_') || 
         input.name?.startsWith('_systemfield_'))) {
      return 'system-field';
    }

    // ================================================================
    // PRIORITY 10: DEFAULT TEXT INPUT
    // ================================================================
    // If we have an input element with type="text" or no type attribute
    if (input && (!input.type || input.type === 'text')) {
      return 'text';
    }

    // ================================================================
    // FALLBACK: UNKNOWN FIELD TYPE
    // ================================================================
    return 'unknown';
  }

  /**
   * ====================================================================
   * EXTRACT FIELD LABEL
   * ====================================================================
   * Extracts the label text using multiple fallback strategies.
   * 
   * @param {Element} fieldElement - The field element or container
   * @returns {string} - The label text or empty string
   */
  extractFieldLabel(fieldElement) {
    let labelText = '';

    // Strategy 1: Look for label with class _heading_101oc_53
    const headingLabel = fieldElement.querySelector('[class*="_heading_"]');
    if (headingLabel) {
      labelText = headingLabel.textContent.trim().replace(/\*$/, ''); // Remove asterisk
    }

    // Strategy 2: Look for label element with class _label_
    if (!labelText) {
      const classLabel = fieldElement.querySelector('[class*="_label_"]');
      if (classLabel) {
        labelText = classLabel.textContent.trim().replace(/\*$/, '');
      }
    }

    // Strategy 3: Find label by for/id association
    const input = fieldElement.querySelector('input, textarea, select');
    if (!labelText && input && input.id) {
      const associatedLabel = document.querySelector(`label[for="${input.id}"]`);
      if (associatedLabel) {
        labelText = associatedLabel.textContent.trim().replace(/\*$/, '');
      }
    }

    // Strategy 4: Look for aria-labelledby
    if (!labelText && input) {
      const labelledBy = input.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelElement = document.getElementById(labelledBy);
        if (labelElement) {
          labelText = labelElement.textContent.trim().replace(/\*$/, '');
        }
      }
    }

    // Strategy 5: Look for aria-label attribute
    if (!labelText && input) {
      const ariaLabel = input.getAttribute('aria-label');
      if (ariaLabel) {
        labelText = ariaLabel.trim().replace(/\*$/, '');
      }
    }

    // Strategy 6: Find any label element in container
    if (!labelText) {
      const anyLabel = fieldElement.querySelector('label');
      if (anyLabel) {
        labelText = anyLabel.textContent.trim().replace(/\*$/, '');
      }
    }

    // Strategy 7: Look for legend in fieldset
    if (!labelText) {
      const legend = fieldElement.querySelector('legend');
      if (legend) {
        labelText = legend.textContent.trim().replace(/\*$/, '');
      }
    }

    // Strategy 8: Check for placeholder as last resort
    if (!labelText && input) {
      const placeholder = input.getAttribute('placeholder');
      if (placeholder && placeholder !== 'Type here...' && placeholder !== 'Start typing...') {
        labelText = placeholder.trim();
      }
    }

    // Append description text to give AI full question context
    if (labelText) {
      const descriptionElement = fieldElement.querySelector(
        '[class*="_description_"], .ashby-application-form-question-description'
      );
      if (descriptionElement) {
        const descText = descriptionElement.textContent.trim();
        if (descText) {
          labelText = `${labelText}: ${descText}`;
        }
      }
    }

    return labelText;
  }

  /**
   * ====================================================================
   * CHECK IF FIELD IS REQUIRED
   * ====================================================================
   * Comprehensive required field detection using multiple methods.
   * 
   * @param {Element} fieldElement - The field element or container
   * @returns {boolean} - True if field is required
   */
  isAshbyFieldRequired(fieldElement) {
    // Method 1: Check for _required_101oc_92 class on label
    const requiredLabel = fieldElement.querySelector('[class*="_required_"]');
    if (requiredLabel) {
      return true;
    }

    // Method 2: Check for asterisk in label text
    const label = this.extractFieldLabel(fieldElement);
    if (label && label.includes('*')) {
      return true;
    }

    // Method 3: Check for aria-required attribute
    const input = fieldElement.querySelector('input, textarea, select');
    if (input && input.getAttribute('aria-required') === 'true') {
      return true;
    }

    // Method 4: Check for required attribute
    if (input && input.hasAttribute('required')) {
      return true;
    }

    // Method 5: Check for data-required attribute
    if (input && input.getAttribute('data-required') === 'true') {
      return true;
    }

    // Method 6: Check for required in class names
    if (fieldElement.classList.contains('required') ||
        fieldElement.classList.contains('is-required') ||
        fieldElement.classList.contains('field-required')) {
      return true;
    }

    // Method 7: Check parent containers for required indicators
    const parentFieldset = fieldElement.closest('fieldset');
    if (parentFieldset) {
      const parentLabel = parentFieldset.querySelector('[class*="_required_"]');
      if (parentLabel) {
        return true;
      }
    }

    return false;
  }

  /**
   * ====================================================================
   * EXTRACT PHONE CONSENT OPTIONS
   * ====================================================================
   * Extracts consent radio options from phone number fields.
   * 
   * @param {Element} fieldElement - The field container
   * @returns {Array} - Array of consent option objects {value, label, checked}
   */
  extractPhoneConsentOptions(fieldElement) {
    const options = [];
    
    // Find consent radio buttons within the phone consent container
    const consentContainer = fieldElement.querySelector('[class*="_phoneNumberConsentLegalText_"], [class*="_container_1rwuy"]');
    if (!consentContainer) {
      return options;
    }

    const radioInputs = consentContainer.querySelectorAll('input[type="radio"]');
    
    radioInputs.forEach((input, index) => {
      let label = '';
      let value = input.value || '';
      const checked = input.checked;

      // Find the label text (usually in a span within the label)
      const parentLabel = input.closest('label');
      if (parentLabel) {
        const span = parentLabel.querySelector('span');
        if (span) {
          label = span.textContent.trim();
        } else {
          label = parentLabel.textContent.trim();
        }
      }

      // Clean up the label text
      label = label.replace(/^-\s*/, '').replace(/I consent to receiving text messages$/, 'Yes - I consent to receiving text messages');

      options.push({
        value: value,
        label: label,
        checked: checked,
        index: index,
        id: input.id,
        name: input.name
      });
    });

    return options;
  }

  /**
   * ====================================================================
   * EXTRACT RADIO OPTIONS
   * ====================================================================
   * Enhanced method to extract radio button options with multiple patterns.
   * 
   * @param {Element} fieldElement - The field container
   * @returns {Array} - Array of option objects {value, label, checked}
   */
  extractRadioOptions(fieldElement) {
    const options = [];

    // ================================================================
    // PATTERN 1: YES/NO BUTTON GROUPS (Ashby specific)
    // ================================================================
    const yesNoContainer = fieldElement.querySelector('[class*="_yesno_"]');
    if (yesNoContainer) {
      const buttons = yesNoContainer.querySelectorAll('button[class*="_option_"]');
      buttons.forEach((button, index) => {
        const label = button.textContent.trim();
        const isChecked = button.getAttribute('aria-pressed') === 'true' || 
                         button.classList.contains('selected');
        const value = label.toLowerCase();

        options.push({
          value: value,
          label: label,
          checked: isChecked,
          index: index,
          id: button.id || '',
          name: button.getAttribute('name') || ''
        });
      });

      return options;
    }

    // ================================================================
    // PATTERN 2: BUTTON-STYLE RADIO GROUP (Yes/No)
    // ================================================================
    const buttonGroup = fieldElement.querySelector('[class*="_buttonGroup_"]');
    if (buttonGroup) {
      const radioButtons = buttonGroup.querySelectorAll('[role="radio"]');
      radioButtons.forEach((button, index) => {
        const label = button.textContent.trim();
        const isChecked = button.getAttribute('aria-checked') === 'true';
        const value = button.getAttribute('value') || label.toLowerCase();

        options.push({
          value: value,
          label: label,
          checked: isChecked,
          index: index
        });
      });

      return options;
    }

    // ================================================================
    // PATTERN 2: TRADITIONAL RADIO GROUP
    // ================================================================
    const radioGroup = fieldElement.querySelector('[class*="_radioGroup_"]');
    const container = radioGroup || fieldElement;

    // Find all radio inputs
    const radioInputs = container.querySelectorAll('input[type="radio"]');

    radioInputs.forEach((input, index) => {
      let label = '';
      let value = input.value || '';
      const checked = input.checked;

      // Strategy 1: Find label by for/id association
      if (input.id) {
        const associatedLabel = document.querySelector(`label[for="${input.id}"]`);
        if (associatedLabel) {
          label = associatedLabel.textContent.trim();
        }
      }

      // Strategy 2: Find parent label element
      if (!label) {
        const parentLabel = input.closest('label');
        if (parentLabel) {
          // Clone to extract text without input element text
          const labelClone = parentLabel.cloneNode(true);
          const inputClone = labelClone.querySelector('input');
          if (inputClone) {
            inputClone.remove();
          }
          label = labelClone.textContent.trim();
        }
      }

      // Strategy 3: Find sibling span or text node
      if (!label) {
        const nextSibling = input.nextElementSibling;
        if (nextSibling && (nextSibling.tagName === 'SPAN' || nextSibling.tagName === 'LABEL')) {
          label = nextSibling.textContent.trim();
        }
      }

      // Strategy 4: Check aria-label
      if (!label) {
        label = input.getAttribute('aria-label') || '';
      }

      // Extract value (use label as fallback)
      if (!value) {
        value = label.toLowerCase().replace(/\s+/g, '-');
      }

      options.push({
        value: value,
        label: label,
        checked: checked,
        index: index,
        id: input.id,
        name: input.name
      });
    });

    return options;
  }

  /**
   * ====================================================================
   * EXTRACT CHECKBOX OPTIONS
   * ====================================================================
   * Robust method for extracting checkbox options (single or grouped).
   * 
   * @param {Element} fieldElement - The field container
   * @returns {Array} - Array of checkbox objects {value, label, checked}
   */
  extractCheckboxOptions(fieldElement) {
    const options = [];

    // Find all checkbox inputs in container, filtering out hidden yesno internals
    const checkboxInputs = Array.from(fieldElement.querySelectorAll('input[type="checkbox"]')).filter(cb => {
      if (cb.tabIndex === -1 && cb.closest('[class*="_yesno_"]')) return false;
      return true;
    });

    checkboxInputs.forEach((input, index) => {
      let label = '';
      let value = input.value || '';
      const checked = input.checked;

      // Strategy 1: Find label by for/id association
      if (input.id) {
        const associatedLabel = document.querySelector(`label[for="${input.id}"]`);
        if (associatedLabel) {
          label = associatedLabel.textContent.trim();
        }
      }

      // Strategy 2: Find parent label element
      if (!label) {
        const parentLabel = input.closest('label');
        if (parentLabel) {
          // Clone to extract text without input element text
          const labelClone = parentLabel.cloneNode(true);
          const inputClone = labelClone.querySelector('input');
          if (inputClone) {
            inputClone.remove();
          }
          label = labelClone.textContent.trim();
        }
      }

      // Strategy 3: Find sibling span or text node
      if (!label) {
        const nextSibling = input.nextElementSibling;
        if (nextSibling) {
          label = nextSibling.textContent.trim();
        }
      }

      // Strategy 4: Find previous sibling label
      if (!label) {
        const prevSibling = input.previousElementSibling;
        if (prevSibling && prevSibling.tagName === 'LABEL') {
          label = prevSibling.textContent.trim();
        }
      }

      // Strategy 5: Check aria-label
      if (!label) {
        label = input.getAttribute('aria-label') || '';
      }

      // Extract value (use label as fallback)
      if (!value) {
        value = label.toLowerCase().replace(/\s+/g, '-');
      }

      // Check for indeterminate state (tri-state checkbox)
      const indeterminate = input.indeterminate;

      options.push({
        value: value,
        label: label,
        checked: checked,
        indeterminate: indeterminate,
        index: index,
        id: input.id,
        name: input.name
      });
    });

    return options;
  }

  /**
   * ====================================================================
   * EXTRACT SELECT OPTIONS
   * ====================================================================
   * Extracts options from native select dropdowns and custom selects.
   * 
   * @param {Element} fieldElement - The field container
   * @returns {Array} - Array of option objects {value, label, selected}
   */
  extractSelectOptions(fieldElement) {
    const options = [];

    // ================================================================
    // PATTERN 1: NATIVE SELECT ELEMENT
    // ================================================================
    const selectElement = fieldElement.querySelector('select');
    if (selectElement) {
      const optionElements = selectElement.querySelectorAll('option');
      optionElements.forEach((option, index) => {
        options.push({
          value: option.value,
          label: option.textContent.trim(),
          selected: option.selected,
          disabled: option.disabled,
          index: index
        });
      });

      return options;
    }

    // ================================================================
    // PATTERN 2: CUSTOM SELECT (AUTOCOMPLETE/COMBOBOX)
    // ================================================================
    // Check for floating dropdown with role="listbox"
    const listbox = document.querySelector('[role="listbox"]');
    if (listbox) {
      const optionElements = listbox.querySelectorAll('[role="option"]');
      optionElements.forEach((option, index) => {
        const selected = option.getAttribute('aria-selected') === 'true';
        const disabled = option.getAttribute('aria-disabled') === 'true';

        options.push({
          value: option.getAttribute('value') || option.textContent.trim(),
          label: option.textContent.trim(),
          selected: selected,
          disabled: disabled,
          index: index
        });
      });

      return options;
    }

    // ================================================================
    // PATTERN 3: CUSTOM DROPDOWN WITH CLASS _option_y2cw4_33
    // ================================================================
    const customOptions = fieldElement.querySelectorAll('[class*="_option_"]');
    customOptions.forEach((option, index) => {
      const selected = option.classList.contains('selected') || 
                      option.classList.contains('active') ||
                      option.getAttribute('aria-selected') === 'true';

      options.push({
        value: option.getAttribute('data-value') || option.textContent.trim(),
        label: option.textContent.trim(),
        selected: selected,
        index: index
      });
    });

    return options;
  }

  /**
   * ====================================================================
   * EXTRACT FIELD CONSTRAINTS
   * ====================================================================
   * Extracts validation constraints and metadata from field elements.
   * 
   * @param {Element} fieldElement - The field container
   * @returns {Object} - Constraints object with various validation rules
   */
  extractFieldConstraints(fieldElement) {
    const constraints = {};

    const input = fieldElement.querySelector('input, textarea, select');
    if (!input) {
      return constraints;
    }

    // ================================================================
    // TEXT LENGTH CONSTRAINTS
    // ================================================================
    if (input.hasAttribute('maxlength')) {
      constraints.maxLength = parseInt(input.getAttribute('maxlength'));
    }

    if (input.hasAttribute('minlength')) {
      constraints.minLength = parseInt(input.getAttribute('minlength'));
    }

    // ================================================================
    // NUMERIC CONSTRAINTS
    // ================================================================
    if (input.type === 'number' || input.type === 'range') {
      if (input.hasAttribute('min')) {
        constraints.min = parseFloat(input.getAttribute('min'));
      }

      if (input.hasAttribute('max')) {
        constraints.max = parseFloat(input.getAttribute('max'));
      }

      if (input.hasAttribute('step')) {
        constraints.step = parseFloat(input.getAttribute('step'));
      }
    }

    // ================================================================
    // PATTERN (REGEX) VALIDATION
    // ================================================================
    if (input.hasAttribute('pattern')) {
      constraints.pattern = input.getAttribute('pattern');
    }

    // ================================================================
    // FILE UPLOAD CONSTRAINTS
    // ================================================================
    if (input.type === 'file') {
      if (input.hasAttribute('accept')) {
        constraints.acceptedFileTypes = input.getAttribute('accept').split(',').map(t => t.trim());
      }

      if (input.hasAttribute('multiple')) {
        constraints.multipleFiles = true;
      }
    }

    // ================================================================
    // CUSTOM DATA ATTRIBUTES
    // ================================================================
    // Check for data-* attributes
    if (input.hasAttribute('data-validation')) {
      constraints.customValidation = input.getAttribute('data-validation');
    }

    if (input.hasAttribute('data-min-selections')) {
      constraints.minSelections = parseInt(input.getAttribute('data-min-selections'));
    }

    if (input.hasAttribute('data-max-selections')) {
      constraints.maxSelections = parseInt(input.getAttribute('data-max-selections'));
    }

    // ================================================================
    // ARIA CONSTRAINTS
    // ================================================================
    if (input.hasAttribute('aria-valuemin')) {
      constraints.ariaValueMin = parseFloat(input.getAttribute('aria-valuemin'));
    }

    if (input.hasAttribute('aria-valuemax')) {
      constraints.ariaValueMax = parseFloat(input.getAttribute('aria-valuemax'));
    }

    return constraints;
  }

  /**
   * ====================================================================
   * EXTRACT FIELD PLACEHOLDER
   * ====================================================================
   * Extracts placeholder text from input fields.
   * 
   * @param {Element} fieldElement - The field container
   * @returns {string} - Placeholder text or empty string
   */
  extractFieldPlaceholder(fieldElement) {
    const input = fieldElement.querySelector('input, textarea');
    if (input) {
      return input.getAttribute('placeholder') || '';
    }
    return '';
  }

  /**
   * ====================================================================
   * EXTRACT FIELD NAME/ID
   * ====================================================================
   * Extracts the field identifier (name or id attribute).
   * 
   * @param {Element} fieldElement - The field container
   * @returns {Object} - Object with name and id properties
   */
  extractFieldIdentifier(fieldElement) {
    const input = fieldElement.querySelector('input, textarea, select');

    if (!input) {
      return { name: '', id: '' };
    }

    return {
      name: input.getAttribute('name') || '',
      id: input.getAttribute('id') || '',
      isSystemField: input.id?.startsWith('_systemfield_') || input.name?.startsWith('_systemfield_')
    };
  }

  /**
   * ====================================================================
   * EXTRACT COMPLETE FIELD METADATA
   * ====================================================================
   * Main orchestration method that extracts all field information.
   * 
   * @param {Element} fieldElement - The field container
   * @returns {Object} - Complete field metadata object
   */
  extractCompleteFieldMetadata(fieldElement) {
    const fieldType = this.determineAshbyFieldType(fieldElement);
    const identifier = this.extractFieldIdentifier(fieldElement);
    const label = this.extractFieldLabel(fieldElement);
    const required = this.isAshbyFieldRequired(fieldElement);
    const placeholder = this.extractFieldPlaceholder(fieldElement);
    const constraints = this.extractFieldConstraints(fieldElement);

    const metadata = {
      type: fieldType,
      id: identifier.id,
      name: identifier.name,
      label: label,
      required: required,
      placeholder: placeholder,
      constraints: constraints,
      isSystemField: identifier.isSystemField
    };

    // Add type-specific metadata
    switch (fieldType) {
      case 'tel-with-consent':
        // Extract both the tel input and the consent radio options
        metadata.telInput = {
          id: fieldElement.querySelector('input[type="tel"]')?.id || '',
          name: fieldElement.querySelector('input[type="tel"]')?.name || '',
          placeholder: fieldElement.querySelector('input[type="tel"]')?.placeholder || ''
        };
        metadata.consentOptions = this.extractPhoneConsentOptions(fieldElement);
        break;

      case 'radio-group':
      case 'radio-button-group':
      case 'radio':
        metadata.options = this.extractRadioOptions(fieldElement);
        break;

      case 'checkbox-group':
      case 'checkbox':
        metadata.options = this.extractCheckboxOptions(fieldElement);
        break;

      case 'select':
      case 'autocomplete':
        metadata.options = this.extractSelectOptions(fieldElement);
        break;

      case 'textarea':
        const textarea = fieldElement.querySelector('textarea');
        if (textarea) {
          metadata.rows = textarea.rows;
          metadata.cols = textarea.cols;
        }
        break;
    }

    return metadata;
  }

  /**
   * ====================================================================
   * EXTRACT ALL FORM FIELDS
   * ====================================================================
   * Scans the entire form and extracts all field metadata.
   * 
   * @param {Element} formElement - The form element or container
   * @returns {Array} - Array of field metadata objects
   */
  extractAllFormFields(formElement = document) {
    const fields = [];
    const processedContainers = new Set();
    const seenFieldKeys = new Set();

    // Find all field containers
    // Use specific selectors to avoid matching broad parent wrappers
    // (e.g. "ashby-application-form-field-list" would match [class*="field"] and cause
    // the nesting check to skip all child field entries)
    const fieldContainers = formElement.querySelectorAll('[class*="_fieldEntry_"], .ashby-application-form-field-entry, fieldset');

    fieldContainers.forEach(container => {
      // Skip if this container is nested inside an already-processed container
      let isNested = false;
      for (const processed of processedContainers) {
        if (processed.contains(container) || container.contains(processed)) {
          isNested = true;
          break;
        }
      }
      if (isNested) return;

      try {
        const metadata = this.extractCompleteFieldMetadata(container);

        // Only add if we detected a valid field type
        if (metadata.type !== 'unknown') {
          // Deduplicate by name, id, or label to prevent double-processing
          const fieldKey = metadata.name || metadata.id || metadata.label;
          if (fieldKey && seenFieldKeys.has(fieldKey)) return;

          fields.push(metadata);
          processedContainers.add(container);
          if (fieldKey) seenFieldKeys.add(fieldKey);
        }
      } catch (error) {
        console.warn('Error extracting field metadata:', error, container);
      }
    });

    return fields;
  }

  /**
   * ====================================================================
   * WAIT FOR DYNAMIC FIELDS
   * ====================================================================
   * Helper method to wait for dynamically loaded fields (conditional fields).
   * 
   * @param {Function} condition - Condition function to check
   * @param {number} timeout - Maximum wait time in milliseconds
   * @returns {Promise} - Resolves when condition is met or timeout
   */
  async waitForDynamicFields(condition, timeout = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (condition()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return false;
  }

  /**
   * ====================================================================
   * TRIGGER CONDITIONAL FIELD
   * ====================================================================
   * Simulates user interaction to trigger conditional/dynamic fields.
   * 
   * @param {Element} triggerElement - The element to interact with
   * @param {string} action - Action type (click, select, input)
   * @param {*} value - Value to set (for select/input actions)
   */
  triggerConditionalField(triggerElement, action = 'click', value = null) {
    switch (action) {
      case 'click':
        triggerElement.click();
        break;

      case 'select':
        if (triggerElement.tagName === 'SELECT') {
          triggerElement.value = value;
          triggerElement.dispatchEvent(new Event('change', { bubbles: true }));
        }
        break;

      case 'input':
        triggerElement.value = value;
        triggerElement.dispatchEvent(new Event('input', { bubbles: true }));
        triggerElement.dispatchEvent(new Event('change', { bubbles: true }));
        break;
    }

    // Dispatch additional events that might trigger field visibility
    triggerElement.dispatchEvent(new Event('blur', { bubbles: true }));
  }
}

