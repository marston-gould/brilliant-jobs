import { notifyStatus } from "../../utils/status-helper.js";
// shared/ziprecruiter/form-handler.js
import { AIService } from "../../services/index.js";
import ZipRecruiterFileHandler from "./ziprecruiter-file-handler.js";
import { AIResponseUtils } from "../../shared/utilities/index.js";

export default class ZipRecruiterFormHandler {
  constructor(config = {}) {
    this.userData = config.userData || {};
    this.jobDescription = config.jobDescription || "";
    this.backendApiHost = config.backendApiHost;
    this.aiApiHost = config.host;
    this.jwtToken = config.jwtToken;
    this.preferences = config.preferences || {};

    this.fileHandler =
      config.fileHandler ||
      new ZipRecruiterFileHandler({
        backendApiHost: this.backendApiHost,
        aiApiHost: this.aiApiHost,
        jwtToken: this.jwtToken,
        preferences: this.preferences,
      });

    this.host = config.host;
    this.aiService = new AIService({ apiHost: this.host, platform: "ziprecruiter" });
    // Global overlay used via notifyStatus()

    // Co-pilot mode properties
    this.copilotMode = false;
    this.copilotState = null;
    this.currentJobTitle = null;
    this.userHasControl = false;

    // User action promise for pausing execution
    this.userActionResolver = null;
    this.userActionPromise = null;

    this.selectors = {
      INPUTS:
        'input[type="text"], input[type="email"], input[type="tel"], input[type="number"]',
      SELECTS: "select",
      TEXTAREAS: "textarea",
      RADIO_INPUTS: 'input[type="radio"]',
      CHECKBOX_INPUTS: 'input[type="checkbox"]',
      MODAL_CONTAINER: '[data-zds-component="modal"], .ApplyFlowApp',
      MODAL_QUESTIONS: ".question_form fieldset",
      MODAL_SELECT: "[role='combobox']",
      MODAL_SELECT_OPTIONS: "[role='listbox'] li",
      CONTINUE_BUTTON: "button[type='submit']",
      SUBMIT_BUTTON: "button[type='submit']",
      ACTION_BUTTONS:
        'button[type="submit"], button[class*="submit"], button[class*="continue"]',
    };

    this.timeouts = {
      SHORT: 500,
      STANDARD: 2000,
      EXTENDED: 5000,
    };

    this.processedElements = new Set();

    // Track step changes for co-pilot manual navigation
    this.stepObserver = null;
    this.lastStepSignature = null;
  }

  /**
   * Find the visible modal container with actual content
   */
  findVisibleModalContainer() {
    // Try multiple strategies to find the correct modal
    const strategies = [
      // Strategy 1: Find modal containing the question form, or the form itself
      () => {
        const form = document.querySelector('.question_form');
        if (form) {
          const modal = form.closest('[data-zds-component="modal"]') ||
                        form.closest('[role="dialog"]') ||
                        form.closest('.ApplyFlowApp')?.closest('[role="dialog"]');
          if (modal && this.isElementVisible(modal)) {
            console.log('📦 Found modal via question_form');
            return modal;
          }
          // No modal wrapper found, but .question_form exists - use it directly
          if (this.isElementVisible(form)) {
            console.log('📦 Found .question_form without modal wrapper, using form directly');
            return form;
          }
        }
        return null;
      },
      // Strategy 2: Find visible modal with data-zds-component
      () => {
        const modals = document.querySelectorAll('[data-zds-component="modal"]');
        for (const modal of modals) {
          if (this.isElementVisible(modal) && modal.querySelector('form, button, fieldset')) {
            console.log('📦 Found visible modal with content');
            return modal;
          }
        }
        return null;
      },
      // Strategy 3: Find visible dialog role element
      () => {
        const dialogs = document.querySelectorAll('[role="dialog"]');
        for (const dialog of dialogs) {
          if (this.isElementVisible(dialog) && dialog.querySelector('form, button, fieldset')) {
            console.log('📦 Found visible dialog with content');
            return dialog;
          }
        }
        return null;
      },
      // Strategy 4: Find ApplyFlowApp's parent dialog
      () => {
        const applyFlow = document.querySelector('.ApplyFlowApp');
        if (applyFlow) {
          const dialog = applyFlow.closest('[role="dialog"]');
          if (dialog && this.isElementVisible(dialog)) {
            console.log('📦 Found modal via ApplyFlowApp');
            return dialog;
          }
        }
        return null;
      },
    ];

    for (const strategy of strategies) {
      const result = strategy();
      if (result) return result;
    }

    // Fallback to original selector
    console.log('📦 Using fallback selector');
    return document.querySelector(this.selectors.MODAL_CONTAINER) ||
           document.querySelector(".question_form") ||
           document.querySelector("form") ||
           document.body;
  }

  async fillCompleteForm() {
    try {
      await this.sleep(this.timeouts.STANDARD);

      let isComplete = false;
      let maxSteps = 10;
      let currentStep = 0;

      while (!isComplete && currentStep < maxSteps) {
        currentStep++;

        const formContainer = this.findVisibleModalContainer();

        console.log("Form container:", formContainer);

        if (!formContainer) {
          throw new Error("No form container found");
        }

        // Initialize or update step signature and observer in co-pilot mode
        if (this.copilotMode) {
          this.startStepObserver(formContainer);
        }

        await this.fillFormStep(formContainer);

        // Find the action button with retry logic (important after file uploads)
        let actionButton = this.findActionButton(formContainer);
        let retries = 0;
        const maxRetries = 3;

        while (!actionButton && retries < maxRetries) {
          console.log(
            `⏳ Action button not found, waiting... (attempt ${
              retries + 1
            }/${maxRetries})`
          );
          await this.sleep(1500);

          // Re-query container in case it updated
          const updatedContainer = this.findVisibleModalContainer();

          actionButton = this.findActionButton(updatedContainer);
          retries++;
        }

        if (!actionButton) {
          console.log("❌ No action button found after retries");

          // Wait a bit longer - modal might be transitioning
          await this.sleep(this.timeouts.STANDARD);

          // Re-check for modal and button after waiting
          const modalStillExists = document.querySelector(this.selectors.MODAL_CONTAINER) ||
                                   document.querySelector('.question_form') ||
                                   document.querySelector('[role="dialog"]');

          if (modalStillExists && this.isElementVisible(modalStillExists)) {
            // Modal is still there - try to find button one more time
            const finalButtonCheck = this.findActionButton(modalStillExists);
            if (finalButtonCheck) {
              console.log("✅ Found button after extended wait");
              actionButton = finalButtonCheck;
            } else {
              // Check if there's a success indicator (like "Applied" button)
              const hasSuccessIndicator = this.checkForSuccessIndicators();
              if (hasSuccessIndicator) {
                console.log("✅ Success indicators found, application complete");
                isComplete = true;
                return true;
              }
              console.error("❌ Modal still open but no action button found");
              throw new Error(
                "No action button found and modal still open after " +
                  maxRetries +
                  " retries"
              );
            }
          } else {
            // Modal truly closed - check for success indicators before declaring success
            const hasSuccessIndicator = this.checkForSuccessIndicators();
            if (hasSuccessIndicator) {
              console.log("✅ Modal closed with success indicators - application complete");
              isComplete = true;
              return true;
            } else {
              console.log("⚠️ Modal closed but no success indicators - may be transitioning");
              // Wait and re-check
              await this.sleep(this.timeouts.STANDARD);
              const modalReappeared = this.findVisibleModalContainer();
              if (modalReappeared && modalReappeared !== document.body) {
                console.log("🔄 Modal reappeared after transition, continuing...");
                continue;
              }
              // If still no modal and no success, consider it failed
              console.log("❌ Modal closed without success indicators");
              return false;
            }
          }
        }

        console.log(
          `✅ Found action button: "${actionButton.textContent?.trim()}"`
        );

        // Detect button type
        const buttonText = actionButton.textContent?.trim().toLowerCase() || "";
        const isFinalSubmit = this.isFinalSubmitButton(actionButton);
        const isNextOrContinue =
          buttonText.includes("continue") ||
          buttonText.includes("next") ||
          buttonText.includes("review");

        // CO-PILOT MODE: Pause at Continue/Next/Submit buttons
        if (this.copilotMode && (isFinalSubmit || isNextOrContinue)) {
          // Determine message type
          const messageType = isFinalSubmit
            ? "COPILOT_SUBMIT_READY"
            : "COPILOT_WAITING_FOR_NEXT";

          // Show status message to user
          if (true) {
            // Global overlay
            notifyStatus({
              type: messageType,
              data: {
                buttonText: actionButton.textContent?.trim(),
                jobTitle: this.currentJobTitle,
                title: this.currentJobTitle,
              },
            });
          }

          // Store button reference in state
          if (this.copilotState) {
            if (isFinalSubmit) {
              this.copilotState.setPendingSubmission(
                { title: this.currentJobTitle },
                actionButton
              );
            } else {
              this.copilotState.setPendingNext(
                { title: this.currentJobTitle },
                actionButton
              );
            }
          }

          // 🔒 PAUSE - Wait for user action
          const userAction = await this.waitForUserAction();

          // Handle user action
          if (userAction === "SUBMIT" || userAction === "NEXT") {
            // If the user manually advanced the step already, skip clicking
            const beforeClickSignature =
              this.computeStepSignature(formContainer);
            await this.sleep(50);
            const afterPotentialManualAdvance =
              this.computeStepSignature(formContainer);
            if (afterPotentialManualAdvance !== beforeClickSignature) {
              // Step already changed by manual click; reset processed elements
              this.processedElements = new Set();
            } else {
              // User approved - click button and continue
              await this.clickButton(actionButton);
              await this.sleep(this.timeouts.STANDARD);
            }

            // Clear pending state
            if (this.copilotState) {
              if (isFinalSubmit) {
                this.copilotState.clearPendingSubmission();
              } else {
                this.copilotState.clearPendingNext();
              }
            }

            // Continue to next step
            this.processedElements = new Set();
            continue;
          } else if (userAction === "SKIP") {
            // User skipped job
            return false;
          }
        } else {
          // AUTO-PILOT MODE: Click button immediately
          const isFinalButton = this.isFinalSubmitButton(actionButton);
          console.log(`🔘 Clicking button: "${buttonText}", isFinalSubmit=${isFinalButton}`);

          await this.clickButton(actionButton);
          await this.sleep(this.timeouts.STANDARD);
          this.processedElements = new Set();

          // If it was a final submit button, check if modal closed (success)
          if (isFinalButton) {
            // Wait a bit longer for final submission
            await this.sleep(this.timeouts.STANDARD);

            if (
              !document.querySelector(this.selectors.MODAL_CONTAINER) ||
              !this.isElementVisible(
                document.querySelector(this.selectors.MODAL_CONTAINER)
              )
            ) {
              console.log('✅ Final submit successful - modal closed');
              isComplete = true;
              return true;
            }
          }

          // For Continue/Next buttons, wait for next step to load and continue loop
          console.log('⏳ Waiting for next form step to load...');
          await this.sleep(this.timeouts.SHORT);
          continue;
        }
      }

      if (currentStep >= maxSteps) {
        return false;
      }

      await this.sleep(this.timeouts.STANDARD);
      return (
        !document.querySelector(this.selectors.MODAL_CONTAINER) ||
        !this.isElementVisible(
          document.querySelector(this.selectors.MODAL_CONTAINER)
        )
      );
    } catch (error) {
      console.error("❌ fillCompleteForm error:", error.message || error);
      console.error("Error stack:", error.stack);
      return false;
    }
  }

  // Start an observer to detect step changes in co-pilot mode (manual user clicks)
  startStepObserver(container) {
    try {
      if (!container) return;
      const currentSignature = this.computeStepSignature(container);
      if (this.lastStepSignature === null) {
        this.lastStepSignature = currentSignature;
      }

      if (this.stepObserver) return;

      this.stepObserver = new MutationObserver(() => {
        const newSignature = this.computeStepSignature(container);
        if (newSignature !== this.lastStepSignature) {
          this.lastStepSignature = newSignature;
          // Reset processing cache on step change
          this.processedElements = new Set();
          // If we were waiting for an action, auto-resume to process new step
          if (this.userActionPromise) {
            this.resolveUserAction("NEXT");
          }
        }
      });

      this.stepObserver.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "aria-disabled", "disabled"],
      });
    } catch (_) {}
  }

  // Compute a lightweight signature of the current step based on visible fields/questions
  computeStepSignature(container) {
    try {
      if (!container) return "";
      const fieldsets = Array.from(
        container.querySelectorAll(this.selectors.MODAL_QUESTIONS)
      );
      const inputs = Array.from(
        container.querySelectorAll(
          `${this.selectors.INPUTS}, ${this.selectors.SELECTS}, ${this.selectors.TEXTAREAS}`
        )
      );

      const visibleTexts = [];
      for (const fs of fieldsets) {
        if (!this.isElementVisible(fs)) continue;
        const label = fs.querySelector("label");
        if (label) visibleTexts.push(label.textContent?.trim() || "");
      }
      for (const input of inputs) {
        if (!this.isElementVisible(input)) continue;
        const label = this.getElementLabel(input);
        if (label) visibleTexts.push(label);
      }

      return visibleTexts.join("|");
    } catch (_) {
      return "";
    }
  }

  /**
   * Improved continue button click method that prevents redirects
   */
  async clickContinueButtonWithoutRedirect(container) {
    try {
      // Find the action button (Continue/Submit)
      const actionButton = this.findActionButton(container);

      if (!actionButton) {
        return false;
      }

      // CRITICAL: Prevent form default submission
      const formElement = container.closest("form");
      if (formElement) {
        // Add event listener to prevent default form submission
        formElement.addEventListener(
          "submit",
          (e) => {
            e.preventDefault();
          },
          true
        ); // Use capture phase
      }

      // Click the button
      actionButton.click();

      // Wait for processing
      await this.sleep(this.timeouts.STANDARD);

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Improved action button finder with better prioritization
   */
  findActionButton(container) {
    // Look specifically for submit buttons in the container
    if (!container) return null;

    // Priority order: Continue -> Submit -> Apply buttons
    const selectors = [
      'button[type="submit"]',
      'button[type="button"]',
      'button[class*="continue"]',
      'button[class*="submit"]',
    ];

    for (const selector of selectors) {
      const buttons = container.querySelectorAll(selector);
      console.log(`🔍 findActionButton: selector="${selector}" found ${buttons.length} buttons`);

      for (const button of buttons) {
        const isVisible = this.isElementVisible(button);
        const text = button.textContent.trim().toLowerCase();
        console.log(`🔍 Button: visible=${isVisible}, disabled=${button.disabled}, text="${text.substring(0, 30)}"`);

        if (!isVisible) continue;

        // Skip if button is explicitly disabled
        if (button.disabled || button.hasAttribute("aria-disabled")) continue;

        // For type="button", check if it has action text
        if (selector === 'button[type="button"]') {
          if (
            text.includes("continue") ||
            text.includes("submit") ||
            text.includes("next") ||
            text.includes("apply")
          ) {
            console.log(`✅ Found action button: "${text}"`);
            return button;
          }
          continue;
        }

        console.log(`✅ Found action button: "${text}"`);
        return button;
      }
    }

    // Fallback: Look for buttons by text content
    const allButtons = container.querySelectorAll("button");
    console.log(`🔍 Fallback: found ${allButtons.length} total buttons`);
    for (const button of allButtons) {
      if (!this.isElementVisible(button)) continue;

      const text = button.textContent.trim().toLowerCase();
      if (
        text.includes("continue") ||
        text.includes("submit") ||
        text.includes("next") ||
        text.includes("apply")
      ) {
        if (!button.disabled && !button.hasAttribute("aria-disabled")) {
          console.log(`✅ Found action button (fallback): "${text}"`);
          return button;
        }
      }
    }

    // Lowest-priority fallback: skip buttons (for promotional/upsell modals with no fields)
    for (const button of allButtons) {
      if (!this.isElementVisible(button)) continue;

      const text = button.textContent.trim().toLowerCase();
      if (text.includes("skip")) {
        if (!button.disabled && !button.hasAttribute("aria-disabled")) {
          console.log(`✅ Found skip button (lowest-priority fallback): "${text}"`);
          return button;
        }
      }
    }

    console.log(`❌ No action button found in container`);
    return null;
  }

  async fillFormStep(container) {
    try {
      let hasVisibleFields = false;

      const directInputs = container.querySelectorAll(
        'input[type="text"], input[type="email"], input[type="tel"]'
      );

      if (directInputs.length > 0) {
        hasVisibleFields = true;

        for (const input of directInputs) {
          if (
            !this.isElementVisible(input) ||
            this.processedElements.has(input)
          ) {
            continue;
          }

          this.processedElements.add(input);
          const labelText = this.getElementLabel(input);
          if (!labelText) continue;
          await this.handleDirectInput(input, labelText);
        }
      }

      // Handle file uploads
      const fileUploads = container.querySelectorAll('input[type="file"]');
      console.log(`📁 Found ${fileUploads.length} file input(s)`);

      if (fileUploads.length > 0) {
        let uploadedFile = false;
        for (const fileInput of fileUploads) {
          if (this.isResumeUploadField(fileInput)) {
            console.log("📤 Starting resume upload...");
            try {
              const success = await this.handleResumeUpload(fileInput);
              if (success) {
                uploadedFile = true;
                console.log("✅ Resume upload completed successfully");
              } else {
                console.error("❌ Resume upload returned false");
              }
            } catch (uploadError) {
              console.error("❌ Resume upload threw exception:", uploadError);
              throw uploadError; // Re-throw to let parent handler know
            }
          }
        }

        // If file was uploaded, wait for DOM to update and re-query container
        if (uploadedFile) {
          console.log("⏳ Waiting for DOM update after file upload...");
          await this.sleep(2000); // Wait for ZipRecruiter to process upload and update DOM

          // Re-query the container to get fresh DOM
          const freshContainer = this.findVisibleModalContainer();

          if (freshContainer !== container) {
            console.log(
              "🔄 Container updated after file upload, using fresh container"
            );
            container = freshContainer;
          } else {
            console.log("ℹ️ Container unchanged after file upload");
          }
        } else {
          console.log(
            "⚠️ No file was uploaded (upload failed or no resume field detected)"
          );
        }
      }

      // Continue with fresh container - use dynamic field detection loop
      let dynamicFieldPasses = 0;
      const maxDynamicPasses = 5; // Prevent infinite loops
      let foundNewFields = true;

      while (foundNewFields && dynamicFieldPasses < maxDynamicPasses) {
        dynamicFieldPasses++;
        foundNewFields = false;

        // Re-query container in case it changed
        const currentContainer = this.findVisibleModalContainer();
        if (currentContainer && currentContainer !== document.body) {
          container = currentContainer;
        }

        const questionFields = container.querySelectorAll(
          this.selectors.MODAL_QUESTIONS
        );
        console.log(`📋 Pass ${dynamicFieldPasses}: Found ${questionFields.length} question field(s)`);

        if (questionFields.length > 0) {
          hasVisibleFields = true;

          for (const field of questionFields) {
            const isVisible = this.isElementVisible(field);
            const isProcessed = this.processedElements.has(field);

            if (!isVisible || isProcessed) {
              continue;
            }

            const fieldName = field.getAttribute('name');
            console.log(`📋 Field: visible=${isVisible}, processed=${isProcessed}, name=${fieldName}`);

            this.processedElements.add(field);
            foundNewFields = true; // Found a new field to process

            const legendElement = field.querySelector("legend");
            const labelElement = field.querySelector("label");
            if (!legendElement && !labelElement) {
              console.log(`📋 No label/legend found in field, skipping`);
              continue;
            }

            const questionText = legendElement ? legendElement.textContent.trim() : labelElement.textContent.trim();
            console.log(`📋 Processing question: "${questionText.substring(0, 50)}..."`);
            await this.processFieldsetQuestion(field, questionText);

            // After processing each field, wait briefly for dynamic fields to appear
            await this.sleep(this.timeouts.SHORT);
          }
        }

        // Scan for standalone fieldsets/radiogroups not inside .question_form
        const standaloneFieldsets = container.querySelectorAll('fieldset, [role="radiogroup"] > fieldset');
        for (const fieldset of standaloneFieldsets) {
          if (!this.isElementVisible(fieldset) || this.processedElements.has(fieldset)) {
            continue;
          }

          this.processedElements.add(fieldset);
          foundNewFields = true;

          const legendEl = fieldset.querySelector("legend");
          const labelEl = fieldset.querySelector("label");
          if (!legendEl && !labelEl) {
            console.log(`📋 No label/legend found in standalone fieldset, skipping`);
            continue;
          }

          const questionText = legendEl ? legendEl.textContent.trim() : labelEl.textContent.trim();
          console.log(`📋 Processing standalone fieldset: "${questionText.substring(0, 50)}..."`);
          await this.processFieldsetQuestion(fieldset, questionText);
          await this.sleep(this.timeouts.SHORT);
        }

        // Also check for dynamically appearing direct inputs
        const directInputs = container.querySelectorAll(
          'input[type="text"], input[type="email"], input[type="tel"], input[type="number"]'
        );
        for (const input of directInputs) {
          if (!this.isElementVisible(input) || this.processedElements.has(input)) {
            continue;
          }
          this.processedElements.add(input);
          foundNewFields = true;
          const labelText = this.getElementLabel(input);
          if (labelText) {
            console.log(`📋 Processing dynamic input: "${labelText}"`);
            await this.handleDirectInput(input, labelText);
            await this.sleep(this.timeouts.SHORT);
          }
        }

        if (foundNewFields) {
          console.log(`🔄 New fields processed, checking for more dynamic fields...`);
          await this.sleep(this.timeouts.SHORT);
        }
      }

      await this.handleRequiredCheckboxes(container);

      return hasVisibleFields;
    } catch (error) {
      console.error("Error in fillFormStep:", error);
      return false;
    }
  }

  async handleDirectInput(input, labelText) {
    const name = input.name?.toLowerCase() || "";
    const lowerLabel = labelText.toLowerCase();

    try {
      if (name.includes("first") || lowerLabel.includes("first")) {
        await this.setElementValue(input, this.userData.firstName || "John");
      } else if (name.includes("last") || lowerLabel.includes("last")) {
        await this.setElementValue(input, this.userData.lastName || "Doe");
      } else if (name.includes("phone") || lowerLabel.includes("phone")) {
        await this.setElementValue(
          input,
          this.userData.phoneNumber || "1234567890"
        );
      } else if (name.includes("email") || lowerLabel.includes("email")) {
        await this.setElementValue(
          input,
          this.userData.email || "user@example.com"
        );
      } else if (
        lowerLabel.includes("location") ||
        lowerLabel.includes("postal") ||
        lowerLabel.includes("city") ||
        lowerLabel.includes("zip")
      ) {
        await this.setElementValue(input, this.userData.currentCity || "10001");
      } else {
        const answer = await this.getAnswerFromAI(labelText, [], 0, input.type);

        // For number inputs (salary, etc.), ensure we set a clean numeric value
        if (input.type === "number" && answer) {
          const cleaned = String(answer).replace(/[$,\s]/g, "").replace(/[^\d.]/g, "");
          const match = cleaned.match(/\d+\.?\d*/);
          await this.setElementValue(input, match ? match[0] : answer);
        } else {
          await this.setElementValue(input, answer);
        }
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle date available field - converts AI responses to actual dates
   * AI may return: Immediate, 2 weeks, 1 month, 2 months, 3 months, More than 3 months
   */
  async handleDateAvailableField(input, questionText) {
    try {
      console.log(`📅 Handling date available field: "${questionText}"`);

      // Get AI response for availability
      const availabilityOptions = [
        "Immediate",
        "2 weeks",
        "1 month",
        "2 months",
        "3 months",
        "More than 3 months"
      ];

      const aiResponse = await this.getAnswerFromAI(questionText, availabilityOptions);
      console.log(`📅 AI availability response: "${aiResponse}"`);

      // Convert response to actual date
      const dateValue = this.convertAvailabilityToDate(aiResponse, input.placeholder);
      console.log(`📅 Converted to date: "${dateValue}"`);

      await this.setElementValue(input, dateValue);

      // Dismiss the date picker by clicking outside / blurring
      await this.dismissDatePicker(input);
    } catch (error) {
      console.error("Error handling date available field:", error);
      // Fallback to today's date
      const today = new Date();
      const fallbackDate = this.formatDate(today, "DD/MM/YYYY");
      await this.setElementValue(input, fallbackDate);
      await this.dismissDatePicker(input);
    }
  }

  /**
   * Dismiss date picker modal by clicking outside
   */
  async dismissDatePicker(input) {
    try {
      // Blur the input to close any picker
      if (input.blur) {
        input.blur();
      }

      // Press Escape to close date picker
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      await this.sleep(100);

      // Click outside - find a neutral element to click
      const formContainer = input.closest('form') || input.closest('[role="dialog"]') || document.body;
      const neutralElement = formContainer.querySelector('label') || formContainer;

      if (neutralElement && neutralElement !== input) {
        neutralElement.click();
      }

      // Also try clicking on the body to ensure picker closes
      document.body.click();

      await this.sleep(200);
      console.log(`📅 Date picker dismissed`);
    } catch (error) {
      console.log(`📅 Could not dismiss date picker: ${error.message}`);
    }
  }

  /**
   * Convert availability string to actual date
   */
  convertAvailabilityToDate(availability, placeholder = "DD/MM/YYYY") {
    const today = new Date();
    let targetDate = new Date(today);

    const lowerAvailability = availability.toLowerCase().trim();

    if (lowerAvailability === "immediate" || lowerAvailability === "immediately") {
      // For immediate, return today's date
      targetDate = today;
    } else if (lowerAvailability.includes("2 week") || lowerAvailability.includes("two week")) {
      targetDate.setDate(today.getDate() + 14);
    } else if (lowerAvailability.includes("1 month") || lowerAvailability.includes("one month")) {
      targetDate.setMonth(today.getMonth() + 1);
    } else if (lowerAvailability.includes("2 month") || lowerAvailability.includes("two month")) {
      targetDate.setMonth(today.getMonth() + 2);
    } else if (lowerAvailability.includes("3 month") || lowerAvailability.includes("three month")) {
      targetDate.setMonth(today.getMonth() + 3);
    } else if (lowerAvailability.includes("more than 3") || lowerAvailability.includes("more than three")) {
      targetDate.setMonth(today.getMonth() + 4);
    } else if (lowerAvailability.includes("1 week") || lowerAvailability.includes("one week")) {
      targetDate.setDate(today.getDate() + 7);
    } else {
      // Try to parse as a date string, otherwise default to today
      const parsed = Date.parse(availability);
      if (!isNaN(parsed)) {
        targetDate = new Date(parsed);
      }
    }

    // Determine format from placeholder
    const format = placeholder?.includes("MM/DD") ? "MM/DD/YYYY" : "DD/MM/YYYY";
    return this.formatDate(targetDate, format);
  }

  /**
   * Format date to specified format
   */
  formatDate(date, format = "DD/MM/YYYY") {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    if (format === "MM/DD/YYYY") {
      return `${month}/${day}/${year}`;
    } else {
      return `${day}/${month}/${year}`;
    }
  }

  async processFieldsetQuestion(fieldset, questionText) {
    try {
      if (this.isResumeUploadField(fieldset)) {
        await this.handleResumeUpload(fieldset);
        return;
      }

      const combobox = fieldset.querySelector('[role="combobox"]');
      if (combobox) {
        await this.handleZipRecruiterDropdown(combobox, questionText);
        return;
      }

      const textarea = fieldset.querySelector("textarea");
      if (textarea) {
        await this.handleTextInput(textarea, questionText);
        return;
      }

      const radioButtons = fieldset.querySelectorAll(
        this.selectors.RADIO_INPUTS
      );
      if (radioButtons.length > 0) {
        await this.handleRadioGroup(radioButtons, questionText);
        return;
      }

      const checkboxes = fieldset.querySelectorAll(
        this.selectors.CHECKBOX_INPUTS
      );
      if (checkboxes.length > 0) {
        await this.handleCheckboxGroup(checkboxes, questionText);
        return;
      }

      const textInput = fieldset.querySelector(this.selectors.INPUTS);
      if (textInput) {
        // Special handling for date available field
        const inputName = textInput.name?.toLowerCase() || "";
        const isDateField = inputName.includes("date") ||
                           questionText.toLowerCase().includes("date available") ||
                           questionText.toLowerCase().includes("start date") ||
                           textInput.placeholder?.includes("DD/MM/YYYY") ||
                           textInput.placeholder?.includes("MM/DD/YYYY");

        if (isDateField) {
          await this.handleDateAvailableField(textInput, questionText);
          return;
        }

        await this.handleTextInput(textInput, questionText);
        return;
      }
    } catch (error) {
      return false;
    }
  }

  async handleZipRecruiterDropdown(combobox, questionText) {
    try {
      const menuId = combobox.getAttribute("aria-controls");
      let menuElement = null;

      if (menuId) {
        menuElement = document.getElementById(menuId);
      }

      combobox.click();
      await this.sleep(500);

      let availableOptions = [];
      if (menuElement && menuElement.style.visibility !== "hidden") {
        const optionElements = menuElement.querySelectorAll("li");
        if (optionElements.length > 0) {
          availableOptions = Array.from(optionElements)
            .filter((opt) => this.isElementVisible(opt))
            .map((opt) => opt.textContent.trim());
        }
      }

      const selectedValue = await this.getAnswerFromAI(
        questionText,
        availableOptions
      );

      if (menuElement && menuElement.style.visibility !== "hidden") {
        const options = menuElement.querySelectorAll("li");
        let optionToSelect = Array.from(options).find(
          (opt) =>
            opt.textContent.trim().toLowerCase() === selectedValue.toLowerCase()
        );

        if (!optionToSelect) {
          optionToSelect = Array.from(options).find(
            (opt) =>
              opt.textContent
                .trim()
                .toLowerCase()
                .includes(selectedValue.toLowerCase()) ||
              selectedValue
                .toLowerCase()
                .includes(opt.textContent.trim().toLowerCase())
          );
        }

        if (!optionToSelect && options.length > 0) {
          optionToSelect = options[0];
        }

        if (optionToSelect) {
          optionToSelect.click();
          await this.sleep(300);
          return;
        }
      }

      if (combobox.tagName === "INPUT") {
        combobox.value = selectedValue;
        combobox.dispatchEvent(new Event("input", { bubbles: true }));
        combobox.dispatchEvent(new Event("change", { bubbles: true }));
      }

      await this.sleep(500);
    } catch (error) {
      return false;
    }
  }

  async handleRadioGroup(radioButtons, questionText) {
    try {
      const options = Array.from(radioButtons)
        .map((radio) => ({
          element: radio,
          label: this.getRadioLabel(radio),
        }))
        .filter((opt) => opt.label);

      const optionTexts = options.map((opt) => opt.label);
      const selectedValue = await this.getAnswerFromAI(
        questionText,
        optionTexts
      );

      let optionToSelect = options.find(
        (opt) => opt.label.toLowerCase() === selectedValue.toLowerCase()
      );

      if (!optionToSelect) {
        optionToSelect = options.find(
          (opt) =>
            opt.label.toLowerCase().includes(selectedValue.toLowerCase()) ||
            selectedValue.toLowerCase().includes(opt.label.toLowerCase())
        );
      }

      if (!optionToSelect && options.length > 0) {
        optionToSelect = options[0];
      }

      if (optionToSelect) {
        const radio = optionToSelect.element;

        // Click via label for natural browser behavior (React-compatible)
        const label = radio.closest('label') ||
                      document.querySelector(`label[for="${radio.id}"]`);
        if (label) {
          label.click();
        } else {
          radio.click();
        }

        // Ensure React picks up the change via event dispatching
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        radio.dispatchEvent(new Event('input', { bubbles: true }));
      }

      await this.sleep(500);
    } catch (error) {
      return false;
    }
  }

  async handleCheckboxGroup(checkboxes, questionText) {
    try {
      if (this.isAgreementQuestion(questionText)) {
        for (const checkbox of checkboxes) {
          if (!checkbox.checked) {
            checkbox.click();
            await this.sleep(200);
          }
        }
        return;
      }

      // Extract option labels for all checkboxes
      const optionMap = [];
      for (const checkbox of checkboxes) {
        const checkboxLabel = this.getElementLabel(checkbox);
        if (checkboxLabel) {
          optionMap.push({ checkbox, text: checkboxLabel });
        }
      }

      const options = optionMap.map((o) => o.text);
      if (options.length === 0) return;

      // Single getMultiSelectAnswer call instead of N separate yes/no calls
      const context = {
        platform: "ziprecruiter",
        userData: this.userData || {},
        jobDescription: this.buildEnrichedJobDescription(),
        fieldType: "checkbox-group",
        fieldContext: "ZipRecruiter application form - checkbox group field",
        required: false,
      };

      const selectedOptions = await this.aiService.getMultiSelectAnswer(
        questionText,
        options,
        context
      );

      // Apply selections - fuzzy match AI response to actual options
      for (const { checkbox, text } of optionMap) {
        this.processedElements.add(checkbox);
        const textLower = text.toLowerCase();
        const shouldCheck = selectedOptions.some(
          (selected) =>
            textLower === selected ||
            textLower.includes(selected) ||
            selected.includes(textLower)
        );
        if (shouldCheck && !checkbox.checked) {
          checkbox.click();
          await this.sleep(200);
        }
      }
    } catch (error) {
      return false;
    }
  }

  async handleTextInput(inputElement, questionText) {
    try {
      const value = await this.getAnswerFromAI(questionText, [], 0, inputElement.type);

      // For number inputs (salary, etc.), ensure we set a clean numeric value
      if (inputElement.type === "number" && value) {
        const cleaned = String(value).replace(/[$,\s]/g, "").replace(/[^\d.]/g, "");
        const match = cleaned.match(/\d+\.?\d*/);
        const numericValue = match ? match[0] : value;
        await this.setElementValue(inputElement, numericValue);
      } else {
        await this.setElementValue(inputElement, value);
      }
    } catch (error) {
      return false;
    }
  }

  async handleResumeUpload(fieldsetOrInput) {
    try {
      let fileInput;
      if (fieldsetOrInput.tagName === "INPUT") {
        fileInput = fieldsetOrInput;
      } else {
        fileInput = fieldsetOrInput.querySelector('input[type="file"]');
      }

      if (!fileInput) {
        return false;
      }

      // Extract all resume URLs from the resumes array
      const resumeUrls =
        this.userData?.resumes
          ?.filter((resume) => resume?.fileUrl)
          .map((resume) => resume.fileUrl) || [];

      if (resumeUrls.length === 0) {
        console.error("❌ Resume upload failed: No resume URLs found", {
          hasResumes: !!this.userData?.resumes,
          resumesLength: this.userData?.resumes?.length || 0,
        });
        return false;
      }

      if (this.fileHandler) {
        const success = await this.fileHandler.uploadFileFromURL(
          fileInput,
          resumeUrls,
          this.userData,
          this.buildEnrichedJobDescription(),
          this.preferences
        );

        return success;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async triggerFileEvents(fileInput) {
    const events = ["focus", "click", "change", "input"];
    for (const eventName of events) {
      await this.sleep(100);
      fileInput.dispatchEvent(new Event(eventName, { bubbles: true }));
    }
    await this.sleep(1000);
  }

  async handleRequiredCheckboxes(container) {
    try {
      const consentCheckboxes = container.querySelectorAll(
        'fieldset input[type="checkbox"].peer, input.pointer-event-auto.peer'
      );

      for (const checkbox of consentCheckboxes) {
        if (this.processedElements.has(checkbox)) continue;
        if (!checkbox.checked) {
          checkbox.click();
          await this.sleep(200);
        }
      }

      const checkboxes = Array.from(
        container.querySelectorAll('input[type="checkbox"]')
      );
      for (const checkbox of checkboxes) {
        if (
          !this.isElementVisible(checkbox) ||
          this.processedElements.has(checkbox)
        ) {
          continue;
        }

        this.processedElements.add(checkbox);

        const parentText =
          checkbox.parentElement?.textContent?.toLowerCase() || "";
        const isConsent =
          parentText.includes("consent") ||
          parentText.includes("agree") ||
          parentText.includes("terms") ||
          parentText.includes("privacy");

        const isRequired =
          checkbox.hasAttribute("required") ||
          checkbox.getAttribute("aria-required") === "true" ||
          checkbox.closest('[aria-required="true"]') ||
          checkbox.closest(".required") ||
          isConsent;

        if (isRequired && !checkbox.checked) {
          checkbox.click();
          await this.sleep(200);
        }
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Build enriched job description string with extracted job metadata prepended
   */
  buildEnrichedJobDescription() {
    if (!this.jobDescription) return "";

    // If jobDescription is a plain string, return it as-is
    if (typeof this.jobDescription === "string") return this.jobDescription;

    const parts = [];

    if (this.jobDescription.title) parts.push(`Job Title: ${this.jobDescription.title}`);
    if (this.jobDescription.company) parts.push(`Company: ${this.jobDescription.company}`);
    if (this.jobDescription.location) parts.push(`Location: ${this.jobDescription.location}`);
    if (this.jobDescription.salary) parts.push(`Salary: ${this.jobDescription.salary}`);

    const fullDesc = this.jobDescription.fullDescription || "";

    if (parts.length > 0) {
      return parts.join("\n") + "\n\n" + fullDesc;
    }

    return fullDesc;
  }

  async getAnswerFromAI(questionText, options = [], retryCount = 0, inputType = null) {
    try {
      const enrichedJobDescription = this.buildEnrichedJobDescription();

      // Determine fieldType based on question content and input type
      let fieldType = inputType || "text";
      if (AIResponseUtils.isSalaryField(questionText)) {
        fieldType = "salary";
      }

      // Extract jobTitle from jobDescription object
      const jobTitle = (typeof this.jobDescription === "object" && this.jobDescription?.title) || "";

      // Use standardized AI service method with specialized routing (same as other platforms)
      const context = {
        platform: "ziprecruiter",
        userData: this.userData || {},
        jobDescription: enrichedJobDescription,
        jobTitle,
        fieldType,
        fieldContext: `ZipRecruiter application form field`,
        required: false,
      };

      let answer;

      // Use specialized AI service methods based on field type and context (same as other platforms)
      if (options && options.length > 0) {
        answer = await this.aiService.getOptionAnswer(
          questionText,
          options,
          context
        );
      } else if (AIResponseUtils.isSalaryField(questionText)) {
        answer = await this.aiService.getSalaryAnswer(
          questionText,
          options,
          context
        );
      } else if (
        questionText.toLowerCase().includes("describe") ||
        questionText.toLowerCase().includes("why") ||
        questionText.toLowerCase().includes("cover letter")
      ) {
        answer = await this.aiService.getLongformAnswer(
          questionText,
          options,
          context
        );
      } else {
        answer = await this.aiService.getNormalAnswer(
          questionText,
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
          if (options && options.length > 0) {
            retryAnswer = await this.aiService.getOptionAnswer(
              questionText,
              options,
              retryContext
            );
          } else if (AIResponseUtils.isSalaryField(questionText)) {
            retryAnswer = await this.aiService.getSalaryAnswer(
              questionText,
              options,
              retryContext
            );
          } else if (
            questionText.toLowerCase().includes("describe") ||
            questionText.toLowerCase().includes("why") ||
            questionText.toLowerCase().includes("cover letter")
          ) {
            retryAnswer = await this.aiService.getLongformAnswer(
              questionText,
              options,
              retryContext
            );
          } else {
            retryAnswer = await this.aiService.getNormalAnswer(
              questionText,
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
            return await this.getAnswerFromAI(
              questionText,
              options,
              retryCount + 1,
              inputType
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

        // Fall through to fallback logic
      } else {
        return answer;
      }
    } catch (aiError) {
      // Retry on error if we haven't exceeded retry limit
      if (retryCount < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 + retryCount * 500)
        );
        return await this.getAnswerFromAI(
          questionText,
          options,
          retryCount + 1,
          inputType
        );
      }
    }
    return "";
  }

  getElementLabel(element) {
    if (element.id) {
      const labelElement = document.querySelector(`label[for="${element.id}"]`);
      if (labelElement) return labelElement.textContent.trim();
    }

    const parentLabel = element.closest("label");
    if (parentLabel) {
      const labelText = Array.from(parentLabel.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent.trim())
        .join(" ")
        .trim();

      if (labelText) return labelText;
    }

    const parentFieldset = element.closest("fieldset");
    if (parentFieldset) {
      const fieldsetLabel = parentFieldset.querySelector(
        "label, span.text-primary"
      );
      if (fieldsetLabel) return fieldsetLabel.textContent.trim();
    }

    if (element.getAttribute("aria-label")) {
      return element.getAttribute("aria-label").trim();
    }

    if (element.placeholder) {
      return element.placeholder.trim();
    }

    return element.name || "";
  }

  getRadioLabel(radioButton) {
    if (radioButton.id) {
      const label = document.querySelector(`label[for="${radioButton.id}"]`);
      if (label) return label.textContent.trim();
    }

    const parentLabel = radioButton.closest("label");
    if (parentLabel) {
      const labelText = Array.from(parentLabel.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent.trim())
        .join(" ")
        .trim();

      return labelText || parentLabel.textContent.trim();
    }

    const nextSibling = radioButton.nextElementSibling;
    if (nextSibling && nextSibling.tagName !== "INPUT") {
      return nextSibling.textContent.trim();
    }

    return radioButton.value || "Unknown";
  }

  isAgreementQuestion(questionText) {
    const lowerText = questionText.toLowerCase();
    const agreementKeywords = [
      "agree",
      "consent",
      "terms",
      "conditions",
      "privacy",
      "policy",
      "accept",
      "agreement",
      "authorize",
      "permission",
    ];
    return agreementKeywords.some((keyword) => lowerText.includes(keyword));
  }

  isResumeUploadField(fieldsetOrInput) {
    let fileInput;
    if (
      fieldsetOrInput.tagName === "INPUT" &&
      fieldsetOrInput.type === "file"
    ) {
      fileInput = fieldsetOrInput;
    } else {
      fileInput = fieldsetOrInput.querySelector('input[type="file"]');
    }

    if (!fileInput) return false;

    const inputAttrs = [
      fileInput.name,
      fileInput.id,
      fileInput.getAttribute("accept"),
    ];

    if (
      inputAttrs.some(
        (attr) =>
          attr &&
          (attr.toLowerCase().includes("resume") ||
            attr.toLowerCase().includes("cv") ||
            attr.includes(".pdf") ||
            attr.includes(".doc"))
      )
    ) {
      return true;
    }

    const container =
      fieldsetOrInput.tagName === "INPUT"
        ? fileInput.closest("fieldset") || fileInput.parentElement
        : fieldsetOrInput;

    const containerText = container ? container.textContent.toLowerCase() : "";
    const resumeKeywords = [
      "resume",
      "cv",
      "upload",
      "attach",
      "curriculum vitae",
    ];

    return resumeKeywords.some((keyword) => containerText.includes(keyword));
  }

  async setElementValue(element, value) {
    try {
      element.focus();
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.blur();
    } catch (error) {
      return false;
    }
  }

  isElementVisible(element) {
    if (!element) return false;

    try {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();

      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        rect.height > 0 &&
        rect.width > 0
      );
    } catch (error) {
      return false;
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Wait for user action - creates a promise that pauses execution
   * Used in co-pilot mode to wait for user approval at Continue/Next/Submit buttons
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
   * Resolve user action - resumes execution
   * Called when user clicks a button in the status overlay
   */
  resolveUserAction(action) {
    if (this.userActionResolver) {
      this.userActionResolver(action);
      this.userActionResolver = null;
      this.userActionPromise = null;
    }
  }

  /**
   * Check if button is a final submit button
   */
  isFinalSubmitButton(button) {
    if (!button) return false;

    const buttonText = button.textContent?.trim().toLowerCase() || "";
    const ariaLabel = button.getAttribute("aria-label")?.toLowerCase() || "";

    // Check for final submit patterns
    const isFinal = (
      buttonText.includes("submit") ||
      ariaLabel.includes("submit") ||
      buttonText === "apply" ||
      buttonText.includes("apply now") ||
      buttonText.includes("send application") ||
      buttonText.includes("complete application") ||
      buttonText.includes("finish")
    );

    // Explicitly NOT final if it's a continue/next/review button
    const isIntermediate = (
      buttonText.includes("continue") ||
      buttonText.includes("next") ||
      buttonText.includes("review")
    );

    return isFinal && !isIntermediate;
  }

  /**
   * Check for success indicators (Applied button, success messages, etc.)
   */
  checkForSuccessIndicators() {
    // Check for "Applied" button state
    const buttons = document.querySelectorAll("button");
    for (const button of buttons) {
      const text = button.textContent?.toLowerCase() || "";
      const ariaLabel = button.getAttribute("aria-label")?.toLowerCase() || "";

      if (
        (text.includes("applied") || ariaLabel.includes("applied")) &&
        (button.disabled || button.classList.contains("opacity-50") || button.style.opacity === "0.5")
      ) {
        console.log("✅ Found Applied button indicator");
        return true;
      }
    }

    // Check for success messages in page
    const successPatterns = [
      "application submitted",
      "application received",
      "thank you for applying",
      "successfully applied",
      "application complete",
      "you have applied",
    ];

    const pageText = document.body?.innerText?.toLowerCase() || "";
    for (const pattern of successPatterns) {
      if (pageText.includes(pattern)) {
        console.log(`✅ Found success message: "${pattern}"`);
        return true;
      }
    }

    // Check URL for success indicators
    const url = window.location.href.toLowerCase();
    if (url.includes("success") || url.includes("confirmation") || url.includes("applied")) {
      console.log("✅ Found success indicator in URL");
      return true;
    }

    return false;
  }

  /**
   * Click a button element with proper event handling
   */
  async clickButton(button) {
    if (!button) return false;

    try {
      button.scrollIntoView({ behavior: "smooth", block: "center" });
      await this.sleep(300);

      if (button.focus) button.focus();
      button.click();

      return true;
    } catch (error) {
      console.error("Error clicking button:", error);
      return false;
    }
  }
}
