import { notifyStatus } from "../../utils/status-helper.js";
export class FormStateMachine {
  constructor(formHandler) {
    this.formHandler = formHandler;
    this.maxSteps = 25;
    this.urlChangeTimeout = 15000;
  }

  async processForm() {
    let steps = 0;

    while (steps < this.maxSteps) {
      const currentUrl = window.location.href;
      const stepType = this.getStepType(currentUrl);

      console.log(stepType)

      if (stepType === 'success') {
        return { success: true, reason: 'success' };
      }

      if (stepType === 'captcha') {
        return { success: false, reason: 'captcha_required' };
      }

      if (stepType === 'review') {
        await this.handleReviewStep();
        return { success: true, reason: 'success' };
      }

      await this.handleStep(stepType);

      const newUrl = await this.waitForUrlChange(currentUrl);

      if (newUrl === currentUrl) {
        return { success: false, reason: 'stuck' };
      }

      steps++;
    }

    return { success: false, reason: 'too_many_steps' };
  }

  getStepType(url) {
    if (this.formHandler.isSuccessPage()) return 'success';
    if (this.formHandler.detectCaptcha()) return 'captcha';
    if (url.includes('form/contact-info-module')) return 'contact';
    if (url.includes('form/profile-location')) return 'location';
    if (url.includes('form/resume-selection-module/resume-selection')) return 'resume';
    if (url.includes('form/resume-module/relevant-experience')) return 'experience';
    if (url.includes('form/questions-module/questions')) return 'questions';
    if (url.includes('form/resume-module/additional-documents')) return 'additional-docs';
    if (url.includes('form/review-module')) return 'review';
    return 'unknown';
  }

  async handleStep(stepType) {
    switch(stepType) {
      case 'contact':
        return await this.handleContactStep();
      case 'location':
        return await this.handleLocationStep();
      case 'resume':
        return await this.handleResumeStep();
      case 'experience':
        return await this.handleExperienceStep();
      case 'questions':
        return await this.handleQuestionsStep();
      case 'additional-docs':
        return await this.handleAdditionalDocsStep();
      default:
        return await this.handleUnknownStep();
    }
  }

  async handleContactStep() {
    const container = this.formHandler.findFormContainer();
    if (container) {
      await this.formHandler.fillFormStep(container);
      await this.formHandler.sleep(this.formHandler.timeouts.STANDARD);
    }
    await this.clickButton();
  }

  async handleLocationStep() {
    const container = this.formHandler.findFormContainer();
    if (container) {
      await this.formHandler.fillFormStep(container);
      await this.formHandler.sleep(this.formHandler.timeouts.STANDARD);
    }
    await this.clickButton();
  }

  async handleResumeStep() {
    const success = await this.formHandler.handleResumeStep();
    if (!success) {
      throw new Error('Resume upload failed');
    }
    await this.formHandler.sleep(this.formHandler.timeouts.EXTENDED);
    await this.clickButton();
  }

  async handleExperienceStep() {
    const container = this.formHandler.findFormContainer();
    if (container) {
      await this.formHandler.fillFormStep(container);
      await this.formHandler.sleep(this.formHandler.timeouts.STANDARD);
    }
    await this.clickButton();
  }

  async handleQuestionsStep() {
    const container = this.formHandler.findFormContainer();
    if (container) {
      await this.formHandler.fillFormStep(container);
      await this.formHandler.sleep(this.formHandler.timeouts.STANDARD);
    }
    await this.clickButton();
  }

  async handleAdditionalDocsStep() {
    const container = this.formHandler.findFormContainer();
    if (container) {
      await this.formHandler.fillFormStep(container);
      await this.formHandler.sleep(this.formHandler.timeouts.STANDARD);
    }
    await this.clickButton();
  }

  async handleUnknownStep() {
    const container = this.formHandler.findFormContainer();
    if (container) {
      await this.formHandler.fillFormStep(container);
      await this.formHandler.sleep(this.formHandler.timeouts.STANDARD);
    }
    await this.clickButton();
  }

  async handleReviewStep() {
    const button = this.formHandler.findActionButton();
    if (!button) return;

    if (this.formHandler.copilotMode) {
      const isFinalSubmit = this.formHandler.isFinalSubmitButton(button);

      if (isFinalSubmit) {
        if (true) { // Global overlay
          notifyStatus({
            type: "COPILOT_SUBMIT_READY",
            data: {
              buttonText: button.textContent?.trim(),
              jobTitle: this.formHandler.currentJobTitle,
              title: this.formHandler.currentJobTitle
            }
          });
        }

        if (this.formHandler.copilotState) {
          this.formHandler.copilotState.setPendingSubmission(
            { title: this.formHandler.currentJobTitle },
            button
          );
        }

        const userAction = await this.formHandler.waitForUserAction();

        if (userAction === "SUBMIT") {
          const freshButton = this.formHandler.findActionButton() || button;
          await this.formHandler.clickButton(freshButton, true);

          if (this.formHandler.copilotState) {
            this.formHandler.copilotState.clearPendingSubmission();
          }
          return;
        }

        if (userAction === "SKIP") {
          if (this.formHandler.copilotState) {
            this.formHandler.copilotState.clearPendingSubmission();
          }
          throw new Error('User skipped');
        }

        if (userAction === "TAKE_CONTROL") {
          this.formHandler.userHasControl = true;
          if (true) { // Global overlay
            notifyStatus({
              type: "COPILOT_USER_CONTROL",
              data: { jobTitle: this.formHandler.currentJobTitle }
            });
          }
          throw new Error('User took control');
        }
      }
    }

    await this.formHandler.clickButton(button, true);
  }

  async clickButton() {
    const button = this.formHandler.findActionButton();
    if (!button) {
      throw new Error('No action button found');
    }

    if (this.formHandler.copilotMode) {
      const buttonText = button.textContent?.trim().toLowerCase() || '';
      const isNextOrContinue = buttonText.includes('continue') || buttonText.includes('next');

      if (isNextOrContinue) {
        if (true) { // Global overlay
          notifyStatus({
            type: "COPILOT_WAITING_FOR_NEXT",
            data: {
              buttonText: button.textContent?.trim(),
              jobTitle: this.formHandler.currentJobTitle,
              title: this.formHandler.currentJobTitle
            }
          });
        }

        if (this.formHandler.copilotState) {
          this.formHandler.copilotState.setPendingNext(
            { title: this.formHandler.currentJobTitle },
            button
          );
        }

        const userAction = await this.formHandler.waitForUserAction();

        if (userAction === "NEXT") {
          const freshButton = this.formHandler.findActionButton() || button;
          await this.formHandler.clickButton(freshButton, true);

          if (this.formHandler.copilotState) {
            this.formHandler.copilotState.clearPendingNext();
          }
          return;
        }

        if (userAction === "SKIP") {
          if (this.formHandler.copilotState) {
            this.formHandler.copilotState.clearPendingNext();
          }
          throw new Error('User skipped');
        }

        if (userAction === "TAKE_CONTROL") {
          this.formHandler.userHasControl = true;
          if (true) { // Global overlay
            notifyStatus({
              type: "COPILOT_USER_CONTROL",
              data: { jobTitle: this.formHandler.currentJobTitle }
            });
          }
          throw new Error('User took control');
        }
      }
    }

    await this.formHandler.clickButton(button, true);
  }

  async waitForUrlChange(currentUrl) {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const newUrl = window.location.href;

        if (newUrl !== currentUrl) {
          clearInterval(checkInterval);
          resolve(newUrl);
          return;
        }

        if (Date.now() - startTime > this.urlChangeTimeout) {
          clearInterval(checkInterval);
          resolve(currentUrl);
        }
      }, 100);
    });
  }

  reset() {
    this.formHandler.userHasControl = false;
  }
}
