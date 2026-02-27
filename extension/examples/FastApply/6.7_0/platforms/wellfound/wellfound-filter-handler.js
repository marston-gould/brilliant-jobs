export class WellfoundFilters {
  constructor() {
    this.filterTypes = {
      location: {
        buttonSelector: '.styles_component__kQDF2',
        typingDelay: 300, 
        searchDelay: 2000, 
        createCustom: true
      },
      jobTitles: {
        buttonSelector: 'button[data-test="SearchBar-RoleSelect-FocusButton"]',
        typingDelay: 50, 
        searchDelay: 500, 
        createCustom: false
      }
    };
  }

  /**
   * Find and prepare the input field for a specific filter type
   * @param {string} filterType - 'location' or 'jobTitles'
   * @returns {HTMLElement|null} The input element or null if not found
   */
  async prepareFilter(filterType) {
    const config = this.filterTypes[filterType];
    if (!config) {
      console.error(`Invalid filter type: ${filterType}`);
      return null;
    }

    const button = document.querySelector(config.buttonSelector);
    let input;

    if (button) {
      button.click();
      console.log(`${filterType} button clicked!`);
      
      // Wait for the select to appear
      await this.delay(500);
      
      input = this.findInput();
    } else {
      console.log(`${filterType} button not found - looking for input directly`);
      input = this.findInput();
    }

    if (!input) {
      console.log(`${filterType} input not found`);
      return null;
    }

    console.log(`${filterType} input found:`, input);
    return input;
  }

  /**
   * Find the React Select input element
   * @returns {HTMLElement|null} The input element
   */
  findInput() {
    // Try to find input with various selectors
    const selectors = [
      '[id^="react-select-"][id$="-input"]',
      '.select__input input',
      'input[aria-autocomplete="list"]'
    ];

    for (const selector of selectors) {
      const input = document.querySelector(selector);
      if (input) return input;
    }

    return null;
  }

  /**
   * Clear all selected options from the multi-select
   * @param {string} filterType - Type of filter for logging
   */
  async clearAllSelectedOptions(filterType = 'filter') {
    let removeButtons = document.querySelectorAll('.select__multi-value__remove');
    console.log(`Found ${removeButtons.length} selected ${filterType} options to remove`);
    
    let count = 0;
    // Keep removing until no more remove buttons exist
    while (removeButtons.length > 0) {
      const removeButton = removeButtons[0]; // Always get the first one
      const optionText = removeButton.parentElement.querySelector('.select__multi-value__label')?.textContent || 'Unknown';
      console.log(`Removing ${filterType} option ${count + 1}: "${optionText}"`);
      removeButton.click();
      await this.delay(100);
      
      count++;
      // Re-query the DOM to get the updated list of remove buttons
      removeButtons = document.querySelectorAll('.select__multi-value__remove');
    }
    
    console.log(`All ${count} ${filterType} options cleared`);
  }

  /**
   * Properly set React Select input value
   * @param {HTMLElement} input - The input element
   * @param {string} value - The value to set
   */
  setReactInputValue(input, value) {
    const lastValue = input.value;
    input.value = value;

    const event = new Event('input', { bubbles: true });

    const tracker = input._valueTracker;
    if (tracker) {
      tracker.setValue(lastValue);
    }

    input.dispatchEvent(event);
  }

  /**
   * Type text into the input field with appropriate delays
   * @param {HTMLElement} input - The input element
   * @param {string} text - Text to type
   * @param {number} delay - Delay between characters
   */
  async typeText(input, text, delay = 50) {
    input.focus();
    input.click();

    // Clear the input first
    this.setReactInputValue(input, '');
    await this.delay(200);

    input.focus();

    let currentValue = '';
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      currentValue += char;

      this.setReactInputValue(input, currentValue);
      console.log(`Typed: "${currentValue}"`);

      await this.delay(delay);
    }
  }

  /**
   * Find and select an option from the dropdown
   * @param {string} searchText - Text that was typed
   * @param {boolean} createCustom - Whether to create custom option if not found
   * @returns {boolean} Whether an option was selected
   */
  async selectOption(searchText, createCustom = false) {
    const options = document.querySelectorAll('.select__option');
    console.log(`Dropdown shows ${options.length} options for "${searchText}"`);

    // Log all available options
    options.forEach((option, index) => {
      console.log(`Option ${index}: "${option.textContent.trim()}"`);
    });

    // Find matching option
    let foundOption = null;
    for (let option of options) {
      const optionText = option.textContent.trim();

      if (optionText.toLowerCase().includes(searchText.toLowerCase())) {
        foundOption = option;
        console.log(`Found matching option: "${optionText}"`);
        break;
      }
    }

    if (foundOption) {
      foundOption.click();
      console.log(`✓ Selected: ${foundOption.textContent.trim()}`);
      await this.delay(500);
      return true;
    }

    // If no match found and custom creation is enabled
    if (createCustom) {
      console.log(`No matching option found for "${searchText}" - creating custom option`);
      
      // Try to find input again in case it changed
      const input = this.findInput();
      if (input) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
        
        console.log(`✓ Created custom option: ${searchText}`);
        await this.delay(500);
        return true;
      }
    }

    console.log(`No matching option found for "${searchText}"`);
    return false;
  }

  /**
   * Add multiple options to a specific filter
   * @param {string} filterType - 'location' or 'jobTitles'
   * @param {string[]} options - Array of options to add
   * @param {boolean} clearFirst - Whether to clear existing options first
   */
  async addOptions(filterType, options, clearFirst = true) {
    const config = this.filterTypes[filterType];
    if (!config) {
      console.error(`Invalid filter type: ${filterType}`);
      return;
    }

    // Prepare the filter (find input, click button if needed)
    const input = await this.prepareFilter(filterType);
    if (!input) return;

    // Clear existing options if requested
    if (clearFirst) {
      await this.clearAllSelectedOptions(filterType);
      await this.delay(500);
    }

    // Add each option
    for (const option of options) {
      console.log(`Adding ${filterType} option: ${option}`);
      
      // Type the option
      await this.typeText(input, option, config.typingDelay);
      
      // Wait for dropdown to appear
      console.log(`Waiting for ${filterType} dropdown...`);
      await this.delay(config.searchDelay);
      
      // Select the option
      await this.selectOption(option, config.createCustom);
      
      // Wait between options
      await this.delay(500);
    }

    // Show final selections
    const selected = document.querySelectorAll('.select__multi-value__label');
    console.log(
      `Final ${filterType} selections:`,
      Array.from(selected).map(el => el.textContent)
    );
  }

  /**
   * Add job title filters
   * @param {string[]} jobTitles - Array of job titles to add
   * @param {boolean} clearFirst - Whether to clear existing selections
   */
  async addJobTitles(jobTitles, clearFirst = true) {
    await this.addOptions('jobTitles', jobTitles, clearFirst);
  }

  /**
   * Add location filters
   * @param {string[]} locations - Array of locations to add
   * @param {boolean} clearFirst - Whether to clear existing selections
   */
  async addLocations(locations, clearFirst = true) {
    await this.addOptions('location', locations, clearFirst);
  }

  /**
   * Utility method for delays
   * @param {number} ms - Milliseconds to wait
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get currently selected options
   * @returns {string[]} Array of selected option texts
   */
  getSelectedOptions() {
    const selected = document.querySelectorAll('.select__multi-value__label');
    return Array.from(selected).map(el => el.textContent);
  }

  /**
   * Set salary range filters
   * @param {number} minSalary - Minimum salary (optional)
   * @param {number} maxSalary - Maximum salary (optional)
   */
  async setSalaryRange(minSalary = null, maxSalary = null) {
    try {
      console.log(`Setting salary range: Min=${minSalary}, Max=${maxSalary}`);

      // Find salary input fields
      const minInput = document.querySelector('input[placeholder="Minimum salary"]');
      const maxInput = document.querySelector('input[placeholder="Maximum (optional)"]');

      if (!minInput || !maxInput) {
        console.warn('⚠️ Salary input fields not found');
        return false;
      }

      // Set minimum salary
      if (minSalary !== null && minSalary > 0) {
        minInput.focus();
        minInput.value = minSalary.toString();
        minInput.dispatchEvent(new Event('input', { bubbles: true }));
        minInput.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`✅ Set minimum salary: $${minSalary}`);
        await this.delay(300);
      }

      // Set maximum salary
      if (maxSalary !== null && maxSalary > 0) {
        maxInput.focus();
        maxInput.value = maxSalary.toString();
        maxInput.dispatchEvent(new Event('input', { bubbles: true }));
        maxInput.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`✅ Set maximum salary: $${maxSalary}`);
        await this.delay(300);
      }

      return true;
    } catch (error) {
      console.error('❌ Error setting salary range:', error);
      return false;
    }
  }

  /**
   * Add markets (industries) filters
   * @param {string[]} markets - Array of market/industry names to add
   */
  async addMarkets(markets) {
    try {
      if (!markets || markets.length === 0) {
        console.log('No markets to add');
        return;
      }

      console.log(`Adding ${markets.length} market(s):`, markets);

      // Find the markets input field
      const marketsInput = document.querySelector('input#markets-input[data-test="Downshift--input"]');
      
      if (!marketsInput) {
        console.warn('⚠️ Markets input field not found');
        return false;
      }

      for (const market of markets) {
        console.log(`Adding market: ${market}`);

        // Focus and type into the input
        marketsInput.focus();
        marketsInput.click();
        await this.delay(300);

        // Type the market name
        await this.typeIntoMarketsInput(marketsInput, market);
        
        // Wait for dropdown to appear
        await this.delay(1000);

        // Try to select from dropdown or click the add button
        const selected = await this.selectMarketFromDropdown(market);
        
        if (selected) {
          console.log(`✅ Added market: ${market}`);
          await this.delay(500);
        } else {
          console.warn(`⚠️ Could not add market: ${market}`);
        }

        // Clear input for next market
        marketsInput.value = '';
        marketsInput.dispatchEvent(new Event('input', { bubbles: true }));
        await this.delay(300);
      }

      return true;
    } catch (error) {
      console.error('❌ Error adding markets:', error);
      return false;
    }
  }

  /**
   * Type into markets input field
   * @param {HTMLElement} input - The input element
   * @param {string} text - Text to type
   */
  async typeIntoMarketsInput(input, text) {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await this.delay(100);

    for (let i = 0; i < text.length; i++) {
      input.value = text.substring(0, i + 1);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await this.delay(50);
    }
  }

  /**
   * Select market from dropdown or click add button
   * @param {string} marketName - Name of the market to select
   * @returns {boolean} Whether the market was selected
   */
  async selectMarketFromDropdown(marketName) {
    // Look for the market in the "Popular" section with add button
    const addButtons = document.querySelectorAll('[data-test^="AutocompleteWithRecommendationsField-RecommendedOptionButton--"]');
    
    for (const button of addButtons) {
      const optionDiv = button.closest('.styles_option__YTy75');
      if (optionDiv) {
        const optionText = optionDiv.querySelector('span.text-md')?.textContent?.trim();
        
        if (optionText && optionText.toLowerCase() === marketName.toLowerCase()) {
          // Check if it's an add button (has plus icon) or remove button (has X icon)
          const hasRemoveIcon = button.classList.contains('styles_selected__9rg8t');
          
          if (!hasRemoveIcon) {
            console.log(`Found market "${optionText}" in popular list, clicking add button`);
            button.click();
            return true;
          } else {
            console.log(`Market "${optionText}" already selected`);
            return true;
          }
        }
      }
    }

    // If not found in popular list, try dropdown options
    const dropdownOptions = document.querySelectorAll('[role="option"]');
    for (const option of dropdownOptions) {
      const optionText = option.textContent?.trim();
      if (optionText && optionText.toLowerCase().includes(marketName.toLowerCase())) {
        console.log(`Found market "${optionText}" in dropdown`);
        option.click();
        return true;
      }
    }

    return false;
  }

  /**
   * Set job type filters
   * @param {string[]} jobTypes - Array of job types: 'full_time', 'contract', 'internship', 'cofounder'
   */
  async setJobTypes(jobTypes) {
    try {
      if (!jobTypes || jobTypes.length === 0) {
        console.log('No job types to set');
        return;
      }

      console.log(`Setting ${jobTypes.length} job type(s):`, jobTypes);

      const jobTypeMap = {
        'full_time': 'form-input--jobTypes--full_time',
        'full-time': 'form-input--jobTypes--full_time',
        'fulltime': 'form-input--jobTypes--full_time',
        'contract': 'form-input--jobTypes--contract',
        'internship': 'form-input--jobTypes--internship',
        'cofounder': 'form-input--jobTypes--cofounder',
        'co-founder': 'form-input--jobTypes--cofounder'
      };

      for (const jobType of jobTypes) {
        const normalizedType = jobType.toLowerCase().replace(/\s+/g, '_');
        const checkboxId = jobTypeMap[normalizedType];

        if (!checkboxId) {
          console.warn(`⚠️ Unknown job type: ${jobType}`);
          continue;
        }

        const checkbox = document.getElementById(checkboxId);
        
        if (!checkbox) {
          console.warn(`⚠️ Checkbox not found for job type: ${jobType}`);
          continue;
        }

        // Check if already checked
        if (!checkbox.checked) {
          checkbox.click();
          console.log(`✅ Checked job type: ${jobType}`);
          await this.delay(200);
        } else {
          console.log(`✓ Job type already checked: ${jobType}`);
        }
      }

      return true;
    } catch (error) {
      console.error('❌ Error setting job types:', error);
      return false;
    }
  }

  /**
   * Clear all selected markets
   */
  async clearMarkets() {
    try {
      const removeButtons = document.querySelectorAll('[data-test^="AutocompleteWithRecommendationsField-RecommendedOptionButton--"].styles_selected__9rg8t');
      
      console.log(`Found ${removeButtons.length} selected markets to remove`);
      
      for (const button of removeButtons) {
        button.click();
        await this.delay(200);
      }

      console.log('✅ All markets cleared');
      return true;
    } catch (error) {
      console.error('❌ Error clearing markets:', error);
      return false;
    }
  }

  /**
   * Uncheck all job types
   */
  async clearJobTypes() {
    try {
      const checkboxes = document.querySelectorAll('input[id^="form-input--jobTypes--"]');
      
      for (const checkbox of checkboxes) {
        if (checkbox.checked) {
          checkbox.click();
          await this.delay(200);
        }
      }

      console.log('✅ All job types cleared');
      return true;
    } catch (error) {
      console.error('❌ Error clearing job types:', error);
      return false;
    }
  }

  /**
   * Clear all filters by clicking the "Clear All" button
   */
  async clearAllFilters() {
    try {
      console.log('🧹 Clearing all filters...');
      
      const clearButton = document.querySelector('button.styles_component__7ZpRT.styles_clearButton__5_q_V');
      
      if (!clearButton) {
        console.warn('⚠️ Clear All button not found');
        return false;
      }
      
      clearButton.click();
      console.log('✅ Clicked Clear All button');
      await this.delay(500);
      
      console.log('✅ All filters cleared');
      return true;
    } catch (error) {
      console.error('❌ Error clearing all filters:', error);
      return false;
    }
  }

  /**
   * Set remote only filter
   * @param {boolean} remoteOnly - Whether to filter for remote jobs only
   */
  async setRemoteOnly(remoteOnly) {
    try {
      console.log(`Setting remote only filter: ${remoteOnly}`);

      const checkbox = document.getElementById('mostlyOrFullyRemote');
      
      if (!checkbox) {
        console.warn('⚠️ Remote only checkbox not found');
        return false;
      }

      // Check if the checkbox state matches the desired state
      if (checkbox.checked !== remoteOnly) {
        checkbox.click();
        console.log(`✅ Set remote only: ${remoteOnly}`);
        await this.delay(200);
      } else {
        console.log(`✓ Remote only already set to: ${remoteOnly}`);
      }

      return true;
    } catch (error) {
      console.error('❌ Error setting remote only filter:', error);
      return false;
    }
  }

  /**
   * Set visa sponsorship filter
   * @param {boolean} willingToSponsor - Whether to filter for companies willing to sponsor visa
   */
  async setWillingToSponsor(willingToSponsor) {
    try {
      console.log(`Setting willing to sponsor filter: ${willingToSponsor}`);

      const checkbox = document.getElementById('allowInternationalApplicants');
      
      if (!checkbox) {
        console.warn('⚠️ Willing to sponsor checkbox not found');
        return false;
      }

      // Check if the checkbox state matches the desired state
      if (checkbox.checked !== willingToSponsor) {
        checkbox.click();
        console.log(`✅ Set willing to sponsor: ${willingToSponsor}`);
        await this.delay(200);
      } else {
        console.log(`✓ Willing to sponsor already set to: ${willingToSponsor}`);
      }

      return true;
    } catch (error) {
      console.error('❌ Error setting willing to sponsor filter:', error);
      return false;
    }
  }
}