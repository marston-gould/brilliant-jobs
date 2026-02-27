import { notifyStatus, updateStatusButtons } from "../../utils/status-helper.js";
import AIResponseUtils from "../../shared/utilities/ai-response-utils.js";
export default class WellfoundFormHandler {
  //processApplicationForm
  constructor(config = {}) {
    this.aiService = config.aiService;
    this.userProfile = config.userProfile || config.userData;
    this.logger = config.logger;

    // Co-pilot properties
    this.copilotMode = config.copilotMode || false;
    this.copilotState = config.copilotState || null;
    this.currentJobTitle = null;
    this.userHasControl = false;

    // Promise-based pause helpers
    this.userActionResolver = null;
    this.userActionPromise = null;

    // External refs
    // Global overlay used via notifyStatus()
  }

  // Promise helpers
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

  checkForLocationRestrictions() {
    try {
      const restrictionSelectors = [
        ".shared_fieldError__t2UkY",
        ".styles-module_component__HiSmQ",
        ".text-dark-error",
        ".text-dark-warning",
        '[class*="error"]',
        '[class*="warning"]',
      ];

      for (const selector of restrictionSelectors) {
        const restrictionElements = document.querySelectorAll(selector);
        for (const element of restrictionElements) {
          const restrictionText = element.textContent?.toLowerCase() || "";
          if (
            restrictionText.includes("location") ||
            restrictionText.includes("timezone") ||
            restrictionText.includes("relocation") ||
            restrictionText.includes("not accepting applications") ||
            restrictionText.includes("does not support")
          ) {
            return element.textContent.trim();
          }
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  // Button helpers
  findActionButton() {
    // Try submit first
    const submit = document.querySelector(
      "button[data-test=JobApplicationModal--SubmitButton]"
    );
    if (submit) return submit;

    // Try Next/Continue/Review within modal
    const modal = document.querySelector(
      'div[data-test="JobApplication-Modal"]'
    );
    if (!modal) return null;

    const candidateButtons = Array.from(
      modal.querySelectorAll('button, [role="button"]')
    );
    const prioritized = candidateButtons.find((btn) => {
      const txt = (btn.textContent || "").trim().toLowerCase();
      return (
        txt === "continue" ||
        txt === "next" ||
        txt === "review" ||
        txt.includes("continue") ||
        txt.includes("next") ||
        txt.includes("review") ||
        txt.includes("submit")
      );
    });

    return prioritized || null;
  }

  isFinalSubmitButton(button) {
    if (!button) return false;
    const text = (button.textContent || "").trim().toLowerCase();
    return (
      text === "submit application" ||
      text === "submit" ||
      text === "submit your application" ||
      text.includes("submit")
    );
  }

  isNextOrContinueButton(button) {
    if (!button) return false;
    const text = (button.textContent || "").trim().toLowerCase();
    return (
      text.includes("continue") ||
      text.includes("next") ||
      text.includes("review") ||
      text === "continue" ||
      text === "next" ||
      text === "review"
    );
  }

  async processApplicationForm() {
    try {
      await this.delay(2000);
      try {
        await this.waitForElement(
          'div[data-test="JobApplication-Modal"]',
          15000
        );
      } catch (error) {
        return {
          success: false,
          reason: "no_modal_found",
          error: "Application modal did not appear",
        };
      }

      const applicationModal = document.querySelector(
        'div[data-test="JobApplication-Modal"]'
      );
      if (!applicationModal) {
        return { success: false, reason: "no_modal_found" };
      }

      // Check for location or other restrictions
      const restriction = this.checkForLocationRestrictions();
      if (restriction) {
        return {
          success: false,
          reason: "location_restricted",
          error: restriction,
        };
      }

      // Wait for form fields to load
      await this.delay(1000);

      // Grab all fields using the improved method
      const fields = await this.grabFields();

      if (fields.length === 0) {
        // Check if there's just a submit button (simple apply)
        const submitButton = document.querySelector(
          "button[data-test=JobApplicationModal--SubmitButton]"
        );

        // Pause for simple-submit (both co-pilot and auto-pilot pause at final submit)
        if (submitButton) {
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

          const action = await this.waitForUserAction();
          if (action === "SUBMIT") {
            if (this.copilotMode) {

              if (this.copilotState) {
                this.copilotState.clearPendingSubmission();
              }

              // Show message that user should review and submit
              if (true) { // Global overlay
                notifyStatus({
                  type: "COPILOT_REVIEW_AND_SUBMIT",
                  data: {
                    title: this.currentJobTitle,
                    message: "Please review and click Submit when ready",
                  },
                });
              }

              return {
                success: true,
                message: "Ready for submission - awaiting manual submit",
                manualSubmit: true,
              };
            }

            await this.clickElementReliably(submitButton);
            await this.delay(2000);
            if (this.copilotState) this.copilotState.clearPendingSubmission();
            return {
              success: true,
              clicked: true,
              message: "Submit button clicked",
            };
          } else if (action === "SKIP") {
            return { success: false, reason: "user_skipped" };
          } else if (action === "TAKE_CONTROL") {
            this.userHasControl = true;
            if (true) // Global overlay
              updateStatusButtons("user-control");
            const resume = await this.waitForUserAction();
            if (resume === "LET_AI_CONTINUE") {
              this.userHasControl = false;
            } else if (resume === "SKIP") {
              return { success: false, reason: "user_skipped" };
            }
          }
        }

        if (submitButton && !submitButton.disabled) {
          await this.clickElementReliably(submitButton);
          await this.delay(2000);
          return {
            success: true,
            clicked: true,
            message: "Submit button clicked",
          };
        } else {
          return {
            success: false,
            reason: "no_fields_or_submit",
            error: "No form fields found and no submit button available",
          };
        }
      }

      // Process each field
      for (const field of fields) {
        try {
          await this.handleWellfoundField(field);
          await this.delay(500);
        } catch (fieldError) {
        }
      }

      // Wait a bit before action
      await this.delay(1000);
      const actionButton = this.findActionButton();
      if (!actionButton) {
        return {
          success: false,
          reason: "no_action_button",
          error: "No action button found",
        };
      }

      const hasCaptcha = false;
      // const isFinalSubmit = this.isFinalSubmitButton(actionButton);
      // const isNextOrContinue = this.isNextOrContinueButton(actionButton);

      const shouldPause = this.copilotMode;
      // ? (isFinalSubmit || isNextOrContinue)
      // : isFinalSubmit;
      if (!hasCaptcha && shouldPause) {
        //  const messageType = isFinalSubmit
        //   ? "COPILOT_SUBMIT_READY"
        //   : "COPILOT_WAITING_FOR_NEXT";
        const messageType = "COPILOT_SUBMIT_READY";

        if (true) { // Global overlay
          notifyStatus({
            type: messageType,
            data: {
              buttonText: actionButton.textContent?.trim(),
              jobTitle: this.currentJobTitle,
              title: this.currentJobTitle,
            },
          });
        }

        if (this.copilotState) {
          this.copilotState.setPendingNext(
            { title: this.currentJobTitle },
            actionButton
          );
        }

        const userAction = await this.waitForUserAction();
        if (userAction === "SUBMIT" || userAction === "NEXT") {
          if (this.copilotMode && userAction === "SUBMIT") {
            if (this.copilotState) {
              this.copilotState.clearPendingSubmission();
            }

            if (true) { // Global overlay
              notifyStatus({
                type: "COPILOT_REVIEW_AND_SUBMIT",
                data: {
                  title: this.currentJobTitle,
                  message: "Please review the form and click Submit when ready",
                },
              });
            }

            await this.clickElementReliably(actionButton);
            await this.delay(2000);

            return {
              success: true,
              message: "Form filled - awaiting manual submission",
              manualSubmit: true,
            };
          }

          await this.clickElementReliably(actionButton);
          await this.delay(2000);

          if (this.copilotState) {
            if (isFinalSubmit) {
              this.copilotState.clearPendingSubmission();
            } else {
              this.copilotState.clearPendingNext();
            }
          }

          if (!isFinalSubmit) {
            await this.delay(1500);
            return await this.processApplicationForm();
          }

          return {
            success: true,
            clicked: true,
            message: "Submit button clicked",
          };
        } else if (userAction === "SKIP") {
          return { success: false, reason: "user_skipped" };
        } else if (userAction === "TAKE_CONTROL") {
          this.userHasControl = true;
          if (true) { // Global overlay
            updateStatusButtons("user-control");
          }
          const resumeAction = await this.waitForUserAction();
          if (resumeAction === "LET_AI_CONTINUE") {
            this.userHasControl = false;
          } else if (resumeAction === "SKIP") {
            return { success: false, reason: "user_skipped" };
          }
        }
      }

      if (!this.copilotMode) {
        await this.clickElementReliably(actionButton);
        await this.delay(2000);
        // if (!isFinalSubmit) {
        //   await this.delay(1500);
        //   return await this.processApplicationForm();
        // }

        return {
          success: true,
          clicked: true,
          message: "Submit button clicked",
        };
      }
    } catch (error) {
      return {
        success: false,
        reason: "error",
        error: error.message,
      };
    }
  }

  /**
   * Wait for success message to appear in the DOM
   * Uses MutationObserver to watch for changes
   */
  async waitForSuccessMessage(timeout = 15000) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkSuccess = () => {
        const modal = document.querySelector(".styles_modal__MFCOh");
        if (modal) {
          const modalText = modal.textContent || "";
          if (
            modalText.includes("Success! Your application has been sent") ||
            (modalText.includes("Success!") &&
              modalText.includes("application has been sent"))
          ) {
            return true;
          }
        }

        const successElements = document.querySelectorAll(
          '.styles_successText__gph6A, [class*="success"]'
        );
        for (const element of successElements) {
          const text = element.textContent || "";
          if (
            text.includes("Success! Your application has been sent") ||
            text.includes("application has been sent")
          ) {
            return true;
          }
        }

        return false;
      };

      // Check immediately
      if (checkSuccess()) {
        resolve(true);
        return;
      }

      // Set up mutation observer to watch for DOM changes
      const observer = new MutationObserver(() => {
        if (checkSuccess()) {
          observer.disconnect();
          clearTimeout(timeoutId);
          resolve(true);
        }
      });

      // Start observing the document for changes
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      // Set timeout
      const timeoutId = setTimeout(() => {
        observer.disconnect();
        console.log("⏱️ Timeout waiting for success message");
        resolve(false);
      }, timeout);
    });
  }

  // New method based on the provided code
  async grabFields() {
    const results = [];

    // Get all label.block elements in the modal
    const labels = document.querySelectorAll(
      'div[data-test="JobApplication-Modal"] form label.block'
    );

    for (const label of labels) {
      const result = {
        element: null,
        type: "",
        label: label.firstChild.innerText.trim(),
        required: false,
        options: [],
      };

      // Check if required (ends with *)
      if (result.label.endsWith("*")) {
        result.label = result.label.slice(0, -1).trim();
        result.required = true;
      }

      // Don't add "Cover letter -" prefix - let the AI determine if it's a cover letter question

      const container = label.children[1];
      if (!container) {
        continue;
      }

      // Priority-based field type detection
      if (container.querySelector("input[type=radio]")) {
        result.type = "radio";
        result.element = [...container.querySelectorAll("input[type=radio]")];
        result.options = result.element.map((input) =>
          input.parentElement.querySelector("label").innerText.trim()
        );
      } else if (label.querySelector("input[type=checkbox]")) {
        result.type = "checkbox";
        result.element = [...label.querySelectorAll("input[type=checkbox]")];
        result.options = result.element.map((input) =>
          input.parentElement.querySelector("label").innerText.trim()
        );
      } else if (container.querySelector(".select__control")) {
        result.type = "select";
        result.element = container.querySelector(".select__control");

        // Trigger dropdown to get options
        if (!container.querySelector(".select__menu .select__option")) {
          const input = result.element.querySelector("input");
          if (input) {
            input.dispatchEvent(new Event("mousedown", { bubbles: true }));
            input.dispatchEvent(new Event("focusin", { bubbles: true }));
            await this.delay(1000);
          }
        }

        result.options = [
          ...container.querySelectorAll(".select__menu .select__option"),
        ]
          .map((option) => option.innerText.trim())
          .filter((text) => text.length > 0);

        // Close dropdown
        const input = result.element.querySelector("input");
        if (input) {
          input.dispatchEvent(new Event("focusout", { bubbles: true }));
        }
      } else {
        result.element = container.firstChild;
        result.type = result.element ? result.element.type : "unknown";
      }

      if (result.element && result.type) {
        results.push(result);
      }
    }

    // Handle cover letter separately
    const coverLetter = document.getElementById("form-input--userNote");
    if (coverLetter) {
      results.push({
        element: coverLetter,
        type: "textarea",
        label: coverLetter.placeholder || "Cover letter",
        required: true,
        options: [],
      });
    }

    return results;
  }

  async handleWellfoundField(field) {
    try {
      // Scroll to element
      try {
        const modalContent = document.querySelector(".ReactModal__Content");
        if (modalContent) {
          this.scrollToElement(
            modalContent,
            Array.isArray(field.element) ? field.element[0] : field.element
          );
        }
      } catch (error) {
        // Ignore scroll errors
      }

      const answer = await this.getAnswer(field.label, field.options, field.type);

      if (!answer && answer !== 0) {
        if (
          field.required &&
          Array.isArray(field.element) &&
          field.element[0]
        ) {
          field.element[0].click();
        }
        return;
      }

      // Handle different field types
      if (Array.isArray(field.element)) {
        if (field.type === "checkbox" && Array.isArray(answer)) {
          // Multi-select checkboxes: answer is an array from getMultiSelectAnswer
          for (const selectedOpt of answer) {
            for (const el of field.element) {
              const optionText = el.parentElement
                .querySelector("label")
                .innerText.trim();
              if (
                optionText.toLowerCase().trim() === selectedOpt.trim() ||
                optionText.toLowerCase().trim().includes(selectedOpt.trim()) ||
                selectedOpt.trim().includes(optionText.toLowerCase().trim())
              ) {
                el.click();
                break;
              }
            }
          }
        } else {
          // Radio buttons or single-answer checkboxes
          let found = false;
          const answerStr = String(answer);
          for (const el of field.element) {
            const optionText = el.parentElement
              .querySelector("label")
              .innerText.trim();
            if (
              optionText === answerStr ||
              optionText.toLowerCase().includes(answerStr.toLowerCase())
            ) {
              el.click();
              found = true;
              break;
            }
          }
        }
      } else if (field.type === "select") {
        // React Select
        const container = field.element.parentElement;

        // Open dropdown if not already open
        if (!container.querySelector(".select__menu .select__option")) {
          const input = field.element.querySelector("input");
          if (input) {
            input.dispatchEvent(new Event("mousedown", { bubbles: true }));
            input.dispatchEvent(new Event("focusin", { bubbles: true }));
            await this.delay(1000);
          }
        }

        // Find and click matching option
        const options = container.querySelectorAll(
          ".select__menu .select__option"
        );
        let found = false;
        for (const option of options) {
          const optionText = option.innerText.trim();
          if (
            optionText === answer ||
            optionText.toLowerCase().includes(answer.toLowerCase())
          ) {
            option.click();
            found = true;
            break;
          }
        }

        await this.delay(1000);

        // Close dropdown
        const input = field.element.querySelector("input");
        if (input) {
          input.dispatchEvent(new Event("focusout", { bubbles: true }));
        }
      } else {
        // Regular input fields
        this.setNativeValue(field.element, answer);
      }
    } catch (error) {}
  }

  // Helper method to set native value (like React)
  setNativeValue(element, value) {
    const { set: valueSetter } =
      Object.getOwnPropertyDescriptor(element, "value") || {};
    const prototype = Object.getPrototypeOf(element);
    const { set: prototypeValueSetter } =
      Object.getOwnPropertyDescriptor(prototype, "value") || {};

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Helper method to scroll to element
  scrollToElement(container, element) {
    if (!container || !element) return;

    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const offset = elementRect.top - containerRect.top;

    container.scrollTop += offset;

    const scrollEvent = new Event("scroll", {
      bubbles: true,
      cancelable: true,
    });

    container.dispatchEvent(scrollEvent);
  }

  // Helper method to wait for element
  async waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver((mutations) => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
      }, timeout);
    });
  }

  async getAnswer(label, options = [], fieldType = null, retryCount = 0) {
    const normalizedLabel = label?.toLowerCase()?.trim() || "";

    try {
      const actualFieldType = fieldType || this.determineFieldType(label, options);
      const context = {
        platform: "wellfound",
        userData: this.userProfile,
        jobDescription: this.scrapeJobDescription(),
        fieldType: actualFieldType,
        fieldContext: this.buildFieldContext(label, options, actualFieldType),
        required: false,
      };

      let answer;

      if (actualFieldType === "checkbox" && options && options.length > 0) {
        answer = await this.aiService.getMultiSelectAnswer(label, options, context);
      } else if (actualFieldType === "radio" || actualFieldType === "select" || (options && options.length > 0)) {
        answer = await this.aiService.getOptionAnswer(label, options, context);
      } else if (AIResponseUtils.isSalaryField(label)) {
        answer = await this.aiService.getSalaryAnswer(label, options, context);
      } else if (actualFieldType === "textarea") {
        answer = await this.aiService.getLongformAnswer(label, options, context);
      } else {
        answer = await this.aiService.getNormalAnswer(label, options, context);
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
          if (actualFieldType === "checkbox" && options && options.length > 0) {
            retryAnswer = await this.aiService.getMultiSelectAnswer(
              label,
              options,
              retryContext
            );
          } else if (actualFieldType === "radio" || actualFieldType === "select" || (options && options.length > 0)) {
            retryAnswer = await this.aiService.getOptionAnswer(
              label,
              options,
              retryContext
            );
          } else if (AIResponseUtils.isSalaryField(label)) {
            retryAnswer = await this.aiService.getSalaryAnswer(
              label,
              options,
              retryContext
            );
          } else if (actualFieldType === "textarea") {
            retryAnswer = await this.aiService.getLongformAnswer(
              label,
              options,
              retryContext
            );
          } else {
            retryAnswer = await this.aiService.getNormalAnswer(
              label,
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
            return await this.getAnswer(label, options, fieldType, retryCount + 1);
          }

          if (
            retryAnswer !== null &&
            retryAnswer !== undefined &&
            String(retryAnswer).trim() !== ""
          ) {
            const cleanedRetryAnswer = retryAnswer.replace(/["*\-]/g, "");
            return cleanedRetryAnswer;
          }
        }

        // If AI fails after retries, log error and return empty to skip field
        console.error(`❌ AI failed to provide answer for: "${label}" after ${retryCount} retries`);
        return "";
      }

      // Don't remove dashes - only remove quotes and asterisks
      const cleanedAnswer = answer.replace(/["*]/g, "");
      return cleanedAnswer;
    } catch (error) {
      // Retry on error if we haven't exceeded retry limit
      if (retryCount < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 + retryCount * 500)
        );
        return await this.getAnswer(label, options, fieldType, retryCount + 1);
      }

      // Log error and return empty to skip field
      console.error(`❌ Error getting answer for: "${label}"`, error);
      return "";
    }
  }

  /**
   * Helper methods for field type detection and context building (same pattern as other platforms)
   */
  determineFieldType(label, options) {
    const labelLower = label.toLowerCase();

    if (
      labelLower.includes("cover letter") ||
      labelLower.includes("interests you")
    )
      return "textarea";
    if (labelLower.includes("date") || labelLower.includes("when"))
      return "date";
    if (labelLower.includes("location") || labelLower.includes("where"))
      return "location";
    if (
      labelLower.includes("how did you hear") ||
      labelLower.includes("source")
    )
      return "source";
    if (options && options.length > 0) return "select";
    return "text";
  }

  buildFieldContext(label, options, fieldType = null) {
    let context = `Wellfound application field: "${label}"`;

    if (options && options.length > 0) {
      context += `. Available options: ${options.join(", ")}`;
    }

    if (fieldType) {
      context += `. Field type: ${fieldType}`;
    }

    const labelLower = label.toLowerCase();
    if (labelLower.includes("salary") || labelLower.includes("compensation")) {
      context +=
        ". This is a salary/compensation field requiring numeric input only.";
    }

    if (labelLower.includes("date") || labelLower.includes("when")) {
      context +=
        ". This is a date field requiring YYYY-MM-DD format. Provide dates like '2024-01-15', not relative terms like '2months' or '1 year ago'.";
    }

    if (labelLower.includes("location") || labelLower.includes("where")) {
      context +=
        ". This is a location field that should use user's location data.";
    }

    if (
      labelLower.includes("cover letter") ||
      labelLower.includes("interests you")
    ) {
      context +=
        ". This is a cover letter or detailed explanation field requiring thoughtful, personalized response.";
    }

    return context;
  }


  scrapeJobDescription() {
    try {
      const descriptionSelectors = [
        "div[class^=styles_description]",
        '[data-test*="job-description"]',
        ".job-description",
        ".description",
        '[class*="description"]',
      ];

      for (const selector of descriptionSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          return element.textContent.trim().substring(0, 500);
        }
      }

      return "No job description found";
    } catch (error) {
      return "No job description found";
    }
  }

  async clickElementReliably(element) {
    const strategies = [
      () => element.click(),
      () =>
        element.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true })
        ),
      () => {
        element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      },
      () => {
        element.focus();
        element.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
        );
      },
    ];

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    await this.delay(500);

    for (const strategy of strategies) {
      try {
        strategy();
        await this.delay(1000);
        return true;
      } catch (error) {
        continue;
      }
    }

    throw new Error("All click strategies failed");
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
