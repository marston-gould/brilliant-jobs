// shared/algorithms/application-state-machine.js
// State Machine for Multi-Step Job Applications

/**
 * STATE MACHINE FOR MULTI-STEP JOB APPLICATIONS
 * ==============================================
 *
 * Many job applications span multiple pages/steps:
 * - Personal Info → Experience → Education → Documents → Review → Submit
 *
 * This state machine:
 * - Tracks where we are in the application flow
 * - Handles navigation (next/back/save)
 * - Recovers from errors
 * - Knows when application is complete
 * - Provides progress feedback to user
 */

// ============================================================================
// PART 1: STATE DEFINITIONS
// ============================================================================

export const ApplicationState = {
  // Initial states
  IDLE: 'idle',
  INITIALIZING: 'initializing',

  // Form states (generic)
  LOADING_PAGE: 'loading_page',
  DETECTING_STEP: 'detecting_step',
  FILLING_FORM: 'filling_form',
  VALIDATING: 'validating',
  SUBMITTING_STEP: 'submitting_step',

  // Specific step types
  STEP_PERSONAL_INFO: 'step_personal_info',
  STEP_CONTACT_INFO: 'step_contact_info',
  STEP_EXPERIENCE: 'step_experience',
  STEP_EDUCATION: 'step_education',
  STEP_SKILLS: 'step_skills',
  STEP_DOCUMENTS: 'step_documents',
  STEP_COVER_LETTER: 'step_cover_letter',
  STEP_QUESTIONS: 'step_questions',
  STEP_EEO: 'step_eeo',
  STEP_REVIEW: 'step_review',
  STEP_CONSENT: 'step_consent',

  // Completion states
  SUBMITTING_APPLICATION: 'submitting_application',
  SUBMISSION_SUCCESSFUL: 'submission_successful',

  // Error states
  ERROR_VALIDATION: 'error_validation',
  ERROR_NETWORK: 'error_network',
  ERROR_TIMEOUT: 'error_timeout',
  ERROR_UNKNOWN: 'error_unknown',

  // Blocking states
  BLOCKED_LOGIN_REQUIRED: 'blocked_login_required',
  BLOCKED_CAPTCHA: 'blocked_captcha',
  BLOCKED_MANUAL_REQUIRED: 'blocked_manual_required',

  // Terminal states
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

export const ApplicationEvent = {
  // User/System events
  START: 'start',
  CANCEL: 'cancel',
  RETRY: 'retry',
  SKIP: 'skip',

  // Page events
  PAGE_LOADED: 'page_loaded',
  PAGE_CHANGED: 'page_changed',
  FORM_DETECTED: 'form_detected',

  // Form events
  FIELD_FILLED: 'field_filled',
  ALL_FIELDS_FILLED: 'all_fields_filled',
  VALIDATION_PASSED: 'validation_passed',
  VALIDATION_FAILED: 'validation_failed',

  // Navigation events
  NEXT_CLICKED: 'next_clicked',
  BACK_CLICKED: 'back_clicked',
  SAVE_CLICKED: 'save_clicked',
  SUBMIT_CLICKED: 'submit_clicked',

  // Response events
  STEP_SUCCESS: 'step_success',
  STEP_FAILURE: 'step_failure',
  APPLICATION_SUBMITTED: 'application_submitted',

  // Error events
  NETWORK_ERROR: 'network_error',
  TIMEOUT: 'timeout',
  UNKNOWN_ERROR: 'unknown_error',

  // Blocking events
  LOGIN_REQUIRED: 'login_required',
  CAPTCHA_DETECTED: 'captcha_detected',
  MANUAL_INPUT_REQUIRED: 'manual_input_required',
};

// ============================================================================
// PART 2: STATE TRANSITIONS
// ============================================================================

const STATE_TRANSITIONS = [
  // ---- INITIALIZATION ----
  {
    from: ApplicationState.IDLE,
    event: ApplicationEvent.START,
    to: ApplicationState.INITIALIZING,
    action: (ctx) => {
      ctx.startTime = new Date();
      ctx.lastActivityTime = new Date();
      ctx.currentStepIndex = 0;
    },
  },
  {
    from: ApplicationState.INITIALIZING,
    event: ApplicationEvent.PAGE_LOADED,
    to: ApplicationState.DETECTING_STEP,
  },

  // ---- STEP DETECTION ----
  {
    from: ApplicationState.DETECTING_STEP,
    event: ApplicationEvent.FORM_DETECTED,
    to: ApplicationState.FILLING_FORM,
  },
  {
    from: ApplicationState.LOADING_PAGE,
    event: ApplicationEvent.PAGE_LOADED,
    to: ApplicationState.DETECTING_STEP,
  },

  // ---- FORM FILLING ----
  {
    from: ApplicationState.FILLING_FORM,
    event: ApplicationEvent.ALL_FIELDS_FILLED,
    to: ApplicationState.VALIDATING,
  },
  {
    from: ApplicationState.FILLING_FORM,
    event: ApplicationEvent.MANUAL_INPUT_REQUIRED,
    to: ApplicationState.BLOCKED_MANUAL_REQUIRED,
    action: (ctx) => {
      ctx.requiresManualReview = true;
    },
  },

  // ---- VALIDATION ----
  {
    from: ApplicationState.VALIDATING,
    event: ApplicationEvent.VALIDATION_PASSED,
    to: ApplicationState.SUBMITTING_STEP,
  },
  {
    from: ApplicationState.VALIDATING,
    event: ApplicationEvent.VALIDATION_FAILED,
    to: ApplicationState.ERROR_VALIDATION,
    action: (ctx) => {
      ctx.retryCount++;
    },
  },

  // ---- STEP SUBMISSION ----
  {
    from: ApplicationState.SUBMITTING_STEP,
    event: ApplicationEvent.STEP_SUCCESS,
    to: ApplicationState.LOADING_PAGE,
    guard: (ctx) => ctx.currentStepIndex < ctx.totalSteps - 1,
    action: (ctx) => {
      ctx.stepsCompleted.push(`step_${ctx.currentStepIndex}`);
      ctx.currentStepIndex++;
      ctx.retryCount = 0;
    },
  },
  {
    from: ApplicationState.SUBMITTING_STEP,
    event: ApplicationEvent.STEP_SUCCESS,
    to: ApplicationState.STEP_REVIEW,
    guard: (ctx) => ctx.currentStepIndex === ctx.totalSteps - 1,
    action: (ctx) => {
      ctx.stepsCompleted.push(`step_${ctx.currentStepIndex}`);
    },
  },
  {
    from: ApplicationState.SUBMITTING_STEP,
    event: ApplicationEvent.STEP_FAILURE,
    to: ApplicationState.ERROR_VALIDATION,
  },

  // ---- REVIEW & FINAL SUBMISSION ----
  {
    from: ApplicationState.STEP_REVIEW,
    event: ApplicationEvent.SUBMIT_CLICKED,
    to: ApplicationState.SUBMITTING_APPLICATION,
  },
  {
    from: ApplicationState.SUBMITTING_APPLICATION,
    event: ApplicationEvent.APPLICATION_SUBMITTED,
    to: ApplicationState.SUBMISSION_SUCCESSFUL,
  },
  {
    from: ApplicationState.SUBMISSION_SUCCESSFUL,
    event: ApplicationEvent.PAGE_LOADED,
    to: ApplicationState.COMPLETED,
  },

  // ---- ERROR RECOVERY ----
  {
    from: ApplicationState.ERROR_VALIDATION,
    event: ApplicationEvent.RETRY,
    to: ApplicationState.FILLING_FORM,
    guard: (ctx) => ctx.retryCount < ctx.maxRetries,
  },
  {
    from: ApplicationState.ERROR_VALIDATION,
    event: ApplicationEvent.RETRY,
    to: ApplicationState.FAILED,
    guard: (ctx) => ctx.retryCount >= ctx.maxRetries,
  },
  {
    from: ApplicationState.ERROR_NETWORK,
    event: ApplicationEvent.RETRY,
    to: ApplicationState.LOADING_PAGE,
    guard: (ctx) => ctx.retryCount < ctx.maxRetries,
    action: (ctx) => {
      ctx.retryCount++;
    },
  },
  {
    from: ApplicationState.ERROR_TIMEOUT,
    event: ApplicationEvent.RETRY,
    to: ApplicationState.LOADING_PAGE,
    guard: (ctx) => ctx.retryCount < ctx.maxRetries,
    action: (ctx) => {
      ctx.retryCount++;
    },
  },

  // ---- BLOCKING STATES ----
  {
    from: [
      ApplicationState.DETECTING_STEP,
      ApplicationState.FILLING_FORM,
      ApplicationState.SUBMITTING_STEP,
    ],
    event: ApplicationEvent.LOGIN_REQUIRED,
    to: ApplicationState.BLOCKED_LOGIN_REQUIRED,
  },
  {
    from: [
      ApplicationState.DETECTING_STEP,
      ApplicationState.FILLING_FORM,
      ApplicationState.SUBMITTING_STEP,
    ],
    event: ApplicationEvent.CAPTCHA_DETECTED,
    to: ApplicationState.BLOCKED_CAPTCHA,
  },
  {
    from: ApplicationState.BLOCKED_MANUAL_REQUIRED,
    event: ApplicationEvent.ALL_FIELDS_FILLED,
    to: ApplicationState.VALIDATING,
    action: (ctx) => {
      ctx.requiresManualReview = false;
    },
  },

  // ---- NETWORK ERRORS (from any active state) ----
  {
    from: [
      ApplicationState.LOADING_PAGE,
      ApplicationState.DETECTING_STEP,
      ApplicationState.FILLING_FORM,
      ApplicationState.VALIDATING,
      ApplicationState.SUBMITTING_STEP,
      ApplicationState.SUBMITTING_APPLICATION,
    ],
    event: ApplicationEvent.NETWORK_ERROR,
    to: ApplicationState.ERROR_NETWORK,
    action: (ctx) => {
      ctx.errors.push({
        state: ctx.currentStepIndex,
        event: ApplicationEvent.NETWORK_ERROR,
        message: 'Network error occurred',
        timestamp: new Date(),
        recoverable: true,
      });
    },
  },
  {
    from: [
      ApplicationState.LOADING_PAGE,
      ApplicationState.DETECTING_STEP,
      ApplicationState.FILLING_FORM,
      ApplicationState.VALIDATING,
      ApplicationState.SUBMITTING_STEP,
    ],
    event: ApplicationEvent.TIMEOUT,
    to: ApplicationState.ERROR_TIMEOUT,
  },

  // ---- CANCELLATION (from any state) ----
  {
    from: Object.values(ApplicationState).filter(s =>
      s !== ApplicationState.COMPLETED &&
      s !== ApplicationState.FAILED &&
      s !== ApplicationState.CANCELLED
    ),
    event: ApplicationEvent.CANCEL,
    to: ApplicationState.CANCELLED,
  },

  // ---- BACK NAVIGATION ----
  {
    from: [
      ApplicationState.FILLING_FORM,
      ApplicationState.VALIDATING,
      ApplicationState.ERROR_VALIDATION,
    ],
    event: ApplicationEvent.BACK_CLICKED,
    to: ApplicationState.LOADING_PAGE,
    guard: (ctx) => ctx.currentStepIndex > 0,
    action: (ctx) => {
      ctx.currentStepIndex--;
      ctx.previousUrls.push(ctx.currentUrl);
    },
  },
];

// ============================================================================
// PART 3: STATE MACHINE ENGINE
// ============================================================================

export class ApplicationStateMachine {
  constructor(jobInfo, userData) {
    this.state = ApplicationState.IDLE;
    this.transitions = STATE_TRANSITIONS;
    this.listeners = new Map();
    this.history = [];

    this.context = {
      jobId: jobInfo.jobId,
      jobTitle: jobInfo.jobTitle,
      company: jobInfo.company,
      sourceUrl: jobInfo.sourceUrl,
      currentStepIndex: 0,
      totalSteps: 0,
      stepsCompleted: [],
      filledFields: new Map(),
      pendingFields: [],
      validationErrors: [],
      userData,
      currentUrl: jobInfo.sourceUrl,
      previousUrls: [],
      startTime: new Date(),
      lastActivityTime: new Date(),
      stepTimes: new Map(),
      retryCount: 0,
      maxRetries: 3,
      errors: [],
      requiresManualReview: false,
      hasUnsavedChanges: false,
    };
  }

  getState() {
    return this.state;
  }

  getContext() {
    return { ...this.context };
  }

  canTransition(event) {
    return this.findTransition(event) !== null;
  }

  async send(event) {
    const transition = this.findTransition(event);

    if (!transition) {
      return {
        success: false,
        newState: this.state,
        error: `No valid transition for event '${event}' from state '${this.state}'`,
      };
    }

    // Check guard condition if present
    if (transition.guard && !transition.guard(this.context)) {
      const altTransition = this.findAlternativeTransition(event);
      if (altTransition) {
        return this.executeTransition(altTransition, event);
      }

      return {
        success: false,
        newState: this.state,
        error: `Guard condition failed for transition '${event}'`,
      };
    }

    return this.executeTransition(transition, event);
  }

  async executeTransition(transition, event) {
    const previousState = this.state;

    try {
      if (transition.action) {
        await transition.action(this.context);
      }

      this.state = transition.to;
      this.context.lastActivityTime = new Date();

      this.history.push({
        from: previousState,
        event,
        to: this.state,
        timestamp: new Date(),
      });

      this.notifyListeners();

      return {
        success: true,
        newState: this.state,
      };
    } catch (error) {
      return {
        success: false,
        newState: this.state,
        error: error instanceof Error ? error.message : 'Unknown error during transition',
      };
    }
  }

  findTransition(event) {
    for (const transition of this.transitions) {
      const fromStates = Array.isArray(transition.from) ? transition.from : [transition.from];

      if (fromStates.includes(this.state) && transition.event === event) {
        return transition;
      }
    }
    return null;
  }

  findAlternativeTransition(event) {
    const matchingTransitions = this.transitions.filter(t => {
      const fromStates = Array.isArray(t.from) ? t.from : [t.from];
      return fromStates.includes(this.state) && t.event === event;
    });

    for (const transition of matchingTransitions) {
      if (!transition.guard || transition.guard(this.context)) {
        return transition;
      }
    }
    return null;
  }

  subscribe(callback, listenerId = null) {
    const id = listenerId || `listener_${Date.now()}`;
    const callbacks = this.listeners.get(id) || [];
    callbacks.push(callback);
    this.listeners.set(id, callbacks);
    return id;
  }

  unsubscribe(listenerId) {
    this.listeners.delete(listenerId);
  }

  notifyListeners() {
    for (const callbacks of this.listeners.values()) {
      for (const callback of callbacks) {
        try {
          callback(this.state, this.context);
        } catch (e) {
          console.error('Error in state listener:', e);
        }
      }
    }
  }

  getHistory() {
    return [...this.history];
  }

  isTerminal() {
    return [
      ApplicationState.COMPLETED,
      ApplicationState.FAILED,
      ApplicationState.CANCELLED,
    ].includes(this.state);
  }

  isBlocked() {
    return [
      ApplicationState.BLOCKED_LOGIN_REQUIRED,
      ApplicationState.BLOCKED_CAPTCHA,
      ApplicationState.BLOCKED_MANUAL_REQUIRED,
    ].includes(this.state);
  }

  isError() {
    return [
      ApplicationState.ERROR_VALIDATION,
      ApplicationState.ERROR_NETWORK,
      ApplicationState.ERROR_TIMEOUT,
      ApplicationState.ERROR_UNKNOWN,
    ].includes(this.state);
  }

  getProgress() {
    if (this.context.totalSteps === 0) return 0;
    if (this.state === ApplicationState.COMPLETED) return 100;

    const baseProgress = (this.context.currentStepIndex / this.context.totalSteps) * 100;

    const inProgressStates = [
      ApplicationState.FILLING_FORM,
      ApplicationState.VALIDATING,
      ApplicationState.SUBMITTING_STEP,
    ];

    if (inProgressStates.includes(this.state)) {
      const stepProgress = 0.5;
      return baseProgress + (stepProgress / this.context.totalSteps) * 100;
    }

    return baseProgress;
  }

  updateStepInfo(stepIndex, totalSteps) {
    this.context.currentStepIndex = stepIndex;
    this.context.totalSteps = totalSteps;
  }

  recordFilledField(fieldName, value) {
    this.context.filledFields.set(fieldName, value);
    this.context.hasUnsavedChanges = true;
  }

  recordValidationErrors(errors) {
    this.context.validationErrors = errors;
  }

  updateUrl(url) {
    if (url !== this.context.currentUrl) {
      this.context.previousUrls.push(this.context.currentUrl);
      this.context.currentUrl = url;
    }
  }
}

// ============================================================================
// PART 4: STEP DETECTOR
// ============================================================================

export class StepDetector {
  detectStep(pageContent, url, accessibilityTree = null) {
    const indicators = this.extractStepIndicators(pageContent, url);

    // Try to detect from progress indicator
    const progressInfo = this.detectProgressIndicator(pageContent);
    if (progressInfo) {
      return {
        stepType: this.inferStepType(pageContent, progressInfo.stepIndex),
        stepIndex: progressInfo.stepIndex,
        totalSteps: progressInfo.totalSteps,
        confidence: 0.9,
      };
    }

    // Try to detect from page content
    const stepType = this.detectStepFromContent(pageContent, indicators);

    // Estimate position based on step type
    const { stepIndex, totalSteps } = this.estimatePosition(stepType);

    return {
      stepType,
      stepIndex,
      totalSteps,
      confidence: 0.6,
    };
  }

  extractStepIndicators(pageContent, url) {
    const indicators = [];

    // Extract headings
    const headingMatches = pageContent.matchAll(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/gi);
    for (const match of headingMatches) {
      indicators.push(match[1].toLowerCase());
    }

    // Extract form legends
    const legendMatches = pageContent.matchAll(/<legend[^>]*>([^<]+)<\/legend>/gi);
    for (const match of legendMatches) {
      indicators.push(match[1].toLowerCase());
    }

    // Extract section titles
    const sectionMatches = pageContent.matchAll(/class=["'][^"']*section[-_]?title[^"']*["'][^>]*>([^<]+)</gi);
    for (const match of sectionMatches) {
      indicators.push(match[1].toLowerCase());
    }

    // Extract from URL
    const urlLower = url.toLowerCase();
    if (urlLower.includes('personal')) indicators.push('personal');
    if (urlLower.includes('experience')) indicators.push('experience');
    if (urlLower.includes('education')) indicators.push('education');
    if (urlLower.includes('document')) indicators.push('documents');
    if (urlLower.includes('upload')) indicators.push('upload');
    if (urlLower.includes('review')) indicators.push('review');
    if (urlLower.includes('submit')) indicators.push('submit');

    return indicators;
  }

  detectProgressIndicator(pageContent) {
    const patterns = [
      /step\s*(\d+)\s*(?:of|\/)\s*(\d+)/i,
      /(\d+)\s*(?:of|\/)\s*(\d+)\s*(?:steps?|pages?)/i,
      /progress[^>]*>\s*(\d+)\s*[\/\-]\s*(\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = pageContent.match(pattern);
      if (match) {
        return {
          stepIndex: parseInt(match[1], 10) - 1,
          totalSteps: parseInt(match[2], 10),
        };
      }
    }

    // Try to count progress dots/indicators
    const progressDots = pageContent.match(/class=["'][^"']*(step|progress)[-_]?(active|current|complete)[^"']*["']/gi);
    const allDots = pageContent.match(/class=["'][^"']*(step|progress)[-_]?(item|dot|indicator)[^"']*["']/gi);

    if (progressDots && allDots && allDots.length > 0) {
      return {
        stepIndex: progressDots.length - 1,
        totalSteps: allDots.length,
      };
    }

    return null;
  }

  detectStepFromContent(pageContent, indicators) {
    const contentLower = pageContent.toLowerCase();
    const indicatorStr = indicators.join(' ');

    // Check for review/summary page
    if (
      /review\s*(your\s*)?(application|submission|information)/i.test(contentLower) ||
      /summary\s*of\s*(your\s*)?application/i.test(contentLower) ||
      indicatorStr.includes('review') ||
      indicatorStr.includes('summary')
    ) {
      return ApplicationState.STEP_REVIEW;
    }

    // Check for personal info
    if (
      indicatorStr.includes('personal') ||
      indicatorStr.includes('about you') ||
      indicatorStr.includes('your information') ||
      (/first\s*name/i.test(contentLower) && /last\s*name/i.test(contentLower))
    ) {
      return ApplicationState.STEP_PERSONAL_INFO;
    }

    // Check for contact info
    if (
      indicatorStr.includes('contact') ||
      indicatorStr.includes('reach you') ||
      (/email/i.test(contentLower) && /phone/i.test(contentLower) && !/experience/i.test(contentLower))
    ) {
      return ApplicationState.STEP_CONTACT_INFO;
    }

    // Check for experience
    if (
      indicatorStr.includes('experience') ||
      indicatorStr.includes('work history') ||
      indicatorStr.includes('employment') ||
      /previous\s*(employer|job|position)/i.test(contentLower)
    ) {
      return ApplicationState.STEP_EXPERIENCE;
    }

    // Check for education
    if (
      indicatorStr.includes('education') ||
      indicatorStr.includes('academic') ||
      indicatorStr.includes('school') ||
      indicatorStr.includes('degree') ||
      /university|college|diploma/i.test(contentLower)
    ) {
      return ApplicationState.STEP_EDUCATION;
    }

    // Check for documents/upload
    if (
      indicatorStr.includes('document') ||
      indicatorStr.includes('upload') ||
      indicatorStr.includes('resume') ||
      indicatorStr.includes('cv') ||
      /type=["']file["']/i.test(contentLower) ||
      /drop.*file|drag.*drop|upload.*resume/i.test(contentLower)
    ) {
      return ApplicationState.STEP_DOCUMENTS;
    }

    // Check for cover letter
    if (
      indicatorStr.includes('cover letter') ||
      indicatorStr.includes('letter of interest') ||
      /why\s*(are\s*you|do\s*you\s*want)/i.test(contentLower)
    ) {
      return ApplicationState.STEP_COVER_LETTER;
    }

    // Check for EEO/demographics
    if (
      indicatorStr.includes('equal employment') ||
      indicatorStr.includes('eeo') ||
      indicatorStr.includes('voluntary') ||
      /gender|race|ethnicity|veteran|disability/i.test(contentLower)
    ) {
      return ApplicationState.STEP_EEO;
    }

    // Check for questions
    if (
      indicatorStr.includes('question') ||
      indicatorStr.includes('additional') ||
      /screening|questionnaire/i.test(contentLower)
    ) {
      return ApplicationState.STEP_QUESTIONS;
    }

    // Check for consent
    if (
      indicatorStr.includes('consent') ||
      indicatorStr.includes('agreement') ||
      indicatorStr.includes('terms') ||
      /i\s*(agree|consent|acknowledge)/i.test(contentLower)
    ) {
      return ApplicationState.STEP_CONSENT;
    }

    // Default to filling form
    return ApplicationState.FILLING_FORM;
  }

  inferStepType(pageContent, stepIndex) {
    const contentType = this.detectStepFromContent(pageContent, []);
    if (contentType !== ApplicationState.FILLING_FORM) {
      return contentType;
    }

    const typicalOrder = [
      ApplicationState.STEP_PERSONAL_INFO,
      ApplicationState.STEP_CONTACT_INFO,
      ApplicationState.STEP_EXPERIENCE,
      ApplicationState.STEP_EDUCATION,
      ApplicationState.STEP_DOCUMENTS,
      ApplicationState.STEP_QUESTIONS,
      ApplicationState.STEP_EEO,
      ApplicationState.STEP_REVIEW,
    ];

    if (stepIndex < typicalOrder.length) {
      return typicalOrder[stepIndex];
    }

    return ApplicationState.FILLING_FORM;
  }

  estimatePosition(stepType) {
    const typicalFlow = [
      ApplicationState.STEP_PERSONAL_INFO,
      ApplicationState.STEP_CONTACT_INFO,
      ApplicationState.STEP_EXPERIENCE,
      ApplicationState.STEP_EDUCATION,
      ApplicationState.STEP_DOCUMENTS,
      ApplicationState.STEP_QUESTIONS,
      ApplicationState.STEP_EEO,
      ApplicationState.STEP_REVIEW,
    ];

    const index = typicalFlow.indexOf(stepType);
    if (index >= 0) {
      return {
        stepIndex: index,
        totalSteps: 8,
      };
    }

    return {
      stepIndex: 0,
      totalSteps: 5,
    };
  }
}

export default {
  ApplicationState,
  ApplicationEvent,
  ApplicationStateMachine,
  StepDetector,
};
