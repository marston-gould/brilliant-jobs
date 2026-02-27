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

/**
 * Possible states in a job application flow
 */
export enum ApplicationState {
  // Initial states
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  
  // Form states (generic)
  LOADING_PAGE = 'loading_page',
  DETECTING_STEP = 'detecting_step',
  FILLING_FORM = 'filling_form',
  VALIDATING = 'validating',
  SUBMITTING_STEP = 'submitting_step',
  
  // Specific step types
  STEP_PERSONAL_INFO = 'step_personal_info',
  STEP_CONTACT_INFO = 'step_contact_info',
  STEP_EXPERIENCE = 'step_experience',
  STEP_EDUCATION = 'step_education',
  STEP_SKILLS = 'step_skills',
  STEP_DOCUMENTS = 'step_documents',
  STEP_COVER_LETTER = 'step_cover_letter',
  STEP_QUESTIONS = 'step_questions',
  STEP_EEO = 'step_eeo',           // Equal Employment Opportunity
  STEP_REVIEW = 'step_review',
  STEP_CONSENT = 'step_consent',
  
  // Completion states
  SUBMITTING_APPLICATION = 'submitting_application',
  SUBMISSION_SUCCESSFUL = 'submission_successful',
  
  // Error states
  ERROR_VALIDATION = 'error_validation',
  ERROR_NETWORK = 'error_network',
  ERROR_TIMEOUT = 'error_timeout',
  ERROR_UNKNOWN = 'error_unknown',
  
  // Blocking states
  BLOCKED_LOGIN_REQUIRED = 'blocked_login_required',
  BLOCKED_CAPTCHA = 'blocked_captcha',
  BLOCKED_MANUAL_REQUIRED = 'blocked_manual_required',
  
  // Terminal states
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Events that can trigger state transitions
 */
export enum ApplicationEvent {
  // User/System events
  START = 'start',
  CANCEL = 'cancel',
  RETRY = 'retry',
  SKIP = 'skip',
  
  // Page events
  PAGE_LOADED = 'page_loaded',
  PAGE_CHANGED = 'page_changed',
  FORM_DETECTED = 'form_detected',
  
  // Form events
  FIELD_FILLED = 'field_filled',
  ALL_FIELDS_FILLED = 'all_fields_filled',
  VALIDATION_PASSED = 'validation_passed',
  VALIDATION_FAILED = 'validation_failed',
  
  // Navigation events
  NEXT_CLICKED = 'next_clicked',
  BACK_CLICKED = 'back_clicked',
  SAVE_CLICKED = 'save_clicked',
  SUBMIT_CLICKED = 'submit_clicked',
  
  // Response events
  STEP_SUCCESS = 'step_success',
  STEP_FAILURE = 'step_failure',
  APPLICATION_SUBMITTED = 'application_submitted',
  
  // Error events
  NETWORK_ERROR = 'network_error',
  TIMEOUT = 'timeout',
  UNKNOWN_ERROR = 'unknown_error',
  
  // Blocking events
  LOGIN_REQUIRED = 'login_required',
  CAPTCHA_DETECTED = 'captcha_detected',
  MANUAL_INPUT_REQUIRED = 'manual_input_required',
}

/**
 * Context data that persists across states
 */
export interface ApplicationContext {
  // Job info
  jobId: string;
  jobTitle: string;
  company: string;
  sourceUrl: string;
  
  // Application tracking
  applicationId?: string;
  currentStepIndex: number;
  totalSteps: number;
  stepsCompleted: string[];
  
  // Form data
  filledFields: Map<string, any>;
  pendingFields: string[];
  validationErrors: ValidationError[];
  
  // User data reference
  userData: UserData;
  
  // Navigation
  currentUrl: string;
  previousUrls: string[];
  
  // Timing
  startTime: Date;
  lastActivityTime: Date;
  stepTimes: Map<string, number>;
  
  // Error tracking
  retryCount: number;
  maxRetries: number;
  errors: ApplicationError[];
  
  // Flags
  requiresManualReview: boolean;
  hasUnsavedChanges: boolean;
}

interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

interface ApplicationError {
  state: ApplicationState;
  event: ApplicationEvent;
  message: string;
  timestamp: Date;
  recoverable: boolean;
}

interface UserData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  // ... other user data fields
}

// ============================================================================
// PART 2: STATE MACHINE DEFINITION
// ============================================================================

type StateTransition = {
  from: ApplicationState | ApplicationState[];
  event: ApplicationEvent;
  to: ApplicationState;
  guard?: (context: ApplicationContext) => boolean;
  action?: (context: ApplicationContext) => void | Promise<void>;
};

/**
 * Define all valid state transitions
 */
const STATE_TRANSITIONS: StateTransition[] = [
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
      ctx.retryCount = 0;  // Reset retry count on success
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
        state: ctx.currentStepIndex as any, // would be actual state
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
  private state: ApplicationState;
  private context: ApplicationContext;
  private transitions: StateTransition[];
  private listeners: Map<string, ((state: ApplicationState, context: ApplicationContext) => void)[]>;
  private history: Array<{
    from: ApplicationState;
    event: ApplicationEvent;
    to: ApplicationState;
    timestamp: Date;
  }>;
  
  constructor(
    jobInfo: { jobId: string; jobTitle: string; company: string; sourceUrl: string },
    userData: UserData
  ) {
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
      totalSteps: 0, // Will be detected
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
  
  /**
   * Get current state
   */
  getState(): ApplicationState {
    return this.state;
  }
  
  /**
   * Get current context
   */
  getContext(): ApplicationContext {
    return { ...this.context };
  }
  
  /**
   * Check if a transition is valid from current state
   */
  canTransition(event: ApplicationEvent): boolean {
    return this.findTransition(event) !== null;
  }
  
  /**
   * Send an event to the state machine
   */
  async send(event: ApplicationEvent): Promise<{
    success: boolean;
    newState: ApplicationState;
    error?: string;
  }> {
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
      // Try to find an alternative transition with a different guard
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
  
  /**
   * Execute a state transition
   */
  private async executeTransition(
    transition: StateTransition,
    event: ApplicationEvent
  ): Promise<{
    success: boolean;
    newState: ApplicationState;
    error?: string;
  }> {
    const previousState = this.state;
    
    try {
      // Execute action if present
      if (transition.action) {
        await transition.action(this.context);
      }
      
      // Update state
      this.state = transition.to;
      this.context.lastActivityTime = new Date();
      
      // Record history
      this.history.push({
        from: previousState,
        event,
        to: this.state,
        timestamp: new Date(),
      });
      
      // Notify listeners
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
  
  /**
   * Find a valid transition for the given event
   */
  private findTransition(event: ApplicationEvent): StateTransition | null {
    for (const transition of this.transitions) {
      const fromStates = Array.isArray(transition.from) ? transition.from : [transition.from];
      
      if (fromStates.includes(this.state) && transition.event === event) {
        return transition;
      }
    }
    return null;
  }
  
  /**
   * Find an alternative transition when guard fails
   */
  private findAlternativeTransition(event: ApplicationEvent): StateTransition | null {
    const matchingTransitions = this.transitions.filter(t => {
      const fromStates = Array.isArray(t.from) ? t.from : [t.from];
      return fromStates.includes(this.state) && t.event === event;
    });
    
    // Return the first one where guard passes (or has no guard)
    for (const transition of matchingTransitions) {
      if (!transition.guard || transition.guard(this.context)) {
        return transition;
      }
    }
    return null;
  }
  
  /**
   * Subscribe to state changes
   */
  subscribe(
    callback: (state: ApplicationState, context: ApplicationContext) => void,
    listenerId?: string
  ): string {
    const id = listenerId || `listener_${Date.now()}`;
    const callbacks = this.listeners.get(id) || [];
    callbacks.push(callback);
    this.listeners.set(id, callbacks);
    return id;
  }
  
  /**
   * Unsubscribe from state changes
   */
  unsubscribe(listenerId: string): void {
    this.listeners.delete(listenerId);
  }
  
  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
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
  
  /**
   * Get transition history
   */
  getHistory(): typeof this.history {
    return [...this.history];
  }
  
  /**
   * Check if application is in a terminal state
   */
  isTerminal(): boolean {
    return [
      ApplicationState.COMPLETED,
      ApplicationState.FAILED,
      ApplicationState.CANCELLED,
    ].includes(this.state);
  }
  
  /**
   * Check if application is in a blocking state
   */
  isBlocked(): boolean {
    return [
      ApplicationState.BLOCKED_LOGIN_REQUIRED,
      ApplicationState.BLOCKED_CAPTCHA,
      ApplicationState.BLOCKED_MANUAL_REQUIRED,
    ].includes(this.state);
  }
  
  /**
   * Check if application is in an error state
   */
  isError(): boolean {
    return [
      ApplicationState.ERROR_VALIDATION,
      ApplicationState.ERROR_NETWORK,
      ApplicationState.ERROR_TIMEOUT,
      ApplicationState.ERROR_UNKNOWN,
    ].includes(this.state);
  }
  
  /**
   * Get progress percentage
   */
  getProgress(): number {
    if (this.context.totalSteps === 0) return 0;
    if (this.state === ApplicationState.COMPLETED) return 100;
    
    const baseProgress = (this.context.currentStepIndex / this.context.totalSteps) * 100;
    
    // Add partial progress for current step
    const inProgressStates = [
      ApplicationState.FILLING_FORM,
      ApplicationState.VALIDATING,
      ApplicationState.SUBMITTING_STEP,
    ];
    
    if (inProgressStates.includes(this.state)) {
      const stepProgress = 0.5; // Assume 50% through current step
      return baseProgress + (stepProgress / this.context.totalSteps) * 100;
    }
    
    return baseProgress;
  }
  
  /**
   * Update context with detected step information
   */
  updateStepInfo(stepIndex: number, totalSteps: number): void {
    this.context.currentStepIndex = stepIndex;
    this.context.totalSteps = totalSteps;
  }
  
  /**
   * Record a filled field
   */
  recordFilledField(fieldName: string, value: any): void {
    this.context.filledFields.set(fieldName, value);
    this.context.hasUnsavedChanges = true;
  }
  
  /**
   * Record validation errors
   */
  recordValidationErrors(errors: ValidationError[]): void {
    this.context.validationErrors = errors;
  }
  
  /**
   * Update current URL
   */
  updateUrl(url: string): void {
    if (url !== this.context.currentUrl) {
      this.context.previousUrls.push(this.context.currentUrl);
      this.context.currentUrl = url;
    }
  }
}

// ============================================================================
// PART 4: STEP DETECTOR
// ============================================================================

/**
 * Detect which step of the application we're on
 */
export class StepDetector {
  /**
   * Analyze the current page to determine application step
   */
  detectStep(
    pageContent: string,
    url: string,
    accessibilityTree?: any
  ): {
    stepType: ApplicationState;
    stepIndex: number;
    totalSteps: number;
    confidence: number;
  } {
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
  
  private extractStepIndicators(pageContent: string, url: string): string[] {
    const indicators: string[] = [];
    
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
  
  private detectProgressIndicator(pageContent: string): { stepIndex: number; totalSteps: number } | null {
    // Pattern: "Step 2 of 5", "2/5", "Step 2", etc.
    const patterns = [
      /step\s*(\d+)\s*(?:of|\/)\s*(\d+)/i,
      /(\d+)\s*(?:of|\/)\s*(\d+)\s*(?:steps?|pages?)/i,
      /progress[^>]*>\s*(\d+)\s*[\/\-]\s*(\d+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = pageContent.match(pattern);
      if (match) {
        return {
          stepIndex: parseInt(match[1], 10) - 1, // 0-indexed
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
  
  private detectStepFromContent(pageContent: string, indicators: string[]): ApplicationState {
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
  
  private inferStepType(pageContent: string, stepIndex: number): ApplicationState {
    // First try content-based detection
    const contentType = this.detectStepFromContent(pageContent, []);
    if (contentType !== ApplicationState.FILLING_FORM) {
      return contentType;
    }
    
    // Fall back to position-based inference
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
  
  private estimatePosition(stepType: ApplicationState): { stepIndex: number; totalSteps: number } {
    const typicalFlow: ApplicationState[] = [
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
        totalSteps: 8, // Typical max
      };
    }
    
    return {
      stepIndex: 0,
      totalSteps: 5, // Conservative estimate
    };
  }
}

// ============================================================================
// PART 5: APPLICATION ORCHESTRATOR
// ============================================================================

/**
 * High-level orchestrator that coordinates the state machine with actual browser actions
 */
export class ApplicationOrchestrator {
  private stateMachine: ApplicationStateMachine;
  private stepDetector: StepDetector;
  private formFiller: any; // FormFieldDetector from previous file
  private pageClassifier: any; // PageClassifier from previous file
  
  constructor(
    jobInfo: { jobId: string; jobTitle: string; company: string; sourceUrl: string },
    userData: UserData,
    formFiller: any,
    pageClassifier: any
  ) {
    this.stateMachine = new ApplicationStateMachine(jobInfo, userData);
    this.stepDetector = new StepDetector();
    this.formFiller = formFiller;
    this.pageClassifier = pageClassifier;
    
    // Set up progress reporting
    this.stateMachine.subscribe((state, context) => {
      this.reportProgress(state, context);
    });
  }
  
  /**
   * Start the application process
   */
  async start(): Promise<void> {
    await this.stateMachine.send(ApplicationEvent.START);
    // Browser would navigate to the application URL here
    await this.stateMachine.send(ApplicationEvent.PAGE_LOADED);
    
    // Main processing loop
    await this.processLoop();
  }
  
  /**
   * Main processing loop
   */
  private async processLoop(): Promise<void> {
    while (!this.stateMachine.isTerminal()) {
      const state = this.stateMachine.getState();
      
      try {
        switch (state) {
          case ApplicationState.DETECTING_STEP:
            await this.handleDetectStep();
            break;
            
          case ApplicationState.FILLING_FORM:
          case ApplicationState.STEP_PERSONAL_INFO:
          case ApplicationState.STEP_CONTACT_INFO:
          case ApplicationState.STEP_EXPERIENCE:
          case ApplicationState.STEP_EDUCATION:
          case ApplicationState.STEP_DOCUMENTS:
          case ApplicationState.STEP_COVER_LETTER:
          case ApplicationState.STEP_QUESTIONS:
          case ApplicationState.STEP_EEO:
            await this.handleFillForm();
            break;
            
          case ApplicationState.VALIDATING:
            await this.handleValidation();
            break;
            
          case ApplicationState.SUBMITTING_STEP:
            await this.handleSubmitStep();
            break;
            
          case ApplicationState.STEP_REVIEW:
            await this.handleReview();
            break;
            
          case ApplicationState.SUBMITTING_APPLICATION:
            await this.handleFinalSubmit();
            break;
            
          case ApplicationState.LOADING_PAGE:
            await this.handlePageLoad();
            break;
            
          // Blocking states - wait for user intervention
          case ApplicationState.BLOCKED_LOGIN_REQUIRED:
          case ApplicationState.BLOCKED_CAPTCHA:
          case ApplicationState.BLOCKED_MANUAL_REQUIRED:
            await this.handleBlocked();
            return; // Exit loop, wait for user
            
          // Error states
          case ApplicationState.ERROR_VALIDATION:
          case ApplicationState.ERROR_NETWORK:
          case ApplicationState.ERROR_TIMEOUT:
            await this.handleError();
            break;
            
          default:
            // Unknown state, wait a bit
            await this.wait(1000);
        }
      } catch (error) {
        console.error('Error in processing loop:', error);
        await this.stateMachine.send(ApplicationEvent.UNKNOWN_ERROR);
      }
    }
  }
  
  private async handleDetectStep(): Promise<void> {
    // Get current page content (would use browser tools)
    const pageContent = ''; // await getPageContent();
    const url = ''; // await getCurrentUrl();
    
    const stepInfo = this.stepDetector.detectStep(pageContent, url);
    
    this.stateMachine.updateStepInfo(stepInfo.stepIndex, stepInfo.totalSteps);
    
    // Check for blockers
    if (this.detectLoginRequired(pageContent)) {
      await this.stateMachine.send(ApplicationEvent.LOGIN_REQUIRED);
      return;
    }
    
    if (this.detectCaptcha(pageContent)) {
      await this.stateMachine.send(ApplicationEvent.CAPTCHA_DETECTED);
      return;
    }
    
    await this.stateMachine.send(ApplicationEvent.FORM_DETECTED);
  }
  
  private async handleFillForm(): Promise<void> {
    // Analyze form fields
    // const analysis = await this.formFiller.analyzeForm(accessibilityTree);
    
    // Fill each field
    // for (const field of analysis.fields) { ... }
    
    // Check if manual input needed
    // if (analysis.suggestedStrategy === 'manual') {
    //   await this.stateMachine.send(ApplicationEvent.MANUAL_INPUT_REQUIRED);
    //   return;
    // }
    
    await this.stateMachine.send(ApplicationEvent.ALL_FIELDS_FILLED);
  }
  
  private async handleValidation(): Promise<void> {
    // Trigger client-side validation
    // Check for validation errors
    
    const hasErrors = false; // Would check actual validation
    
    if (hasErrors) {
      await this.stateMachine.send(ApplicationEvent.VALIDATION_FAILED);
    } else {
      await this.stateMachine.send(ApplicationEvent.VALIDATION_PASSED);
    }
  }
  
  private async handleSubmitStep(): Promise<void> {
    // Click the next/continue button
    // Wait for navigation or response
    
    const success = true; // Would check actual result
    
    if (success) {
      await this.stateMachine.send(ApplicationEvent.STEP_SUCCESS);
    } else {
      await this.stateMachine.send(ApplicationEvent.STEP_FAILURE);
    }
  }
  
  private async handleReview(): Promise<void> {
    // On review page - notify user for final confirmation
    this.notifyUser('Application ready for final review. Please confirm submission.');
    
    // Wait for user confirmation
    // This would be triggered by user action
    // await this.stateMachine.send(ApplicationEvent.SUBMIT_CLICKED);
  }
  
  private async handleFinalSubmit(): Promise<void> {
    // Click final submit button
    // Wait for confirmation
    
    await this.stateMachine.send(ApplicationEvent.APPLICATION_SUBMITTED);
  }
  
  private async handlePageLoad(): Promise<void> {
    // Wait for page to load
    await this.wait(2000);
    await this.stateMachine.send(ApplicationEvent.PAGE_LOADED);
  }
  
  private async handleBlocked(): Promise<void> {
    const state = this.stateMachine.getState();
    
    switch (state) {
      case ApplicationState.BLOCKED_LOGIN_REQUIRED:
        this.notifyUser('Login required. Please sign in to continue.');
        break;
      case ApplicationState.BLOCKED_CAPTCHA:
        this.notifyUser('CAPTCHA detected. Please complete it to continue.');
        break;
      case ApplicationState.BLOCKED_MANUAL_REQUIRED:
        this.notifyUser('Some fields require manual input. Please fill them and click continue.');
        break;
    }
  }
  
  private async handleError(): Promise<void> {
    const context = this.stateMachine.getContext();
    
    if (context.retryCount < context.maxRetries) {
      await this.wait(2000 * context.retryCount); // Exponential backoff
      await this.stateMachine.send(ApplicationEvent.RETRY);
    } else {
      this.notifyUser('Application failed after multiple retries.');
    }
  }
  
  private detectLoginRequired(pageContent: string): boolean {
    return /sign\s*in|log\s*in|create.*account/i.test(pageContent) &&
           !/already\s*(signed|logged)\s*in/i.test(pageContent);
  }
  
  private detectCaptcha(pageContent: string): boolean {
    return /recaptcha|hcaptcha|captcha/i.test(pageContent);
  }
  
  private reportProgress(state: ApplicationState, context: ApplicationContext): void {
    const progress = this.stateMachine.getProgress();
    console.log(`[${progress.toFixed(0)}%] State: ${state}, Step: ${context.currentStepIndex + 1}/${context.totalSteps}`);
  }
  
  private notifyUser(message: string): void {
    console.log(`USER NOTIFICATION: ${message}`);
    // Would trigger UI notification
  }
  
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Resume after user completes blocked action
   */
  async resume(): Promise<void> {
    const state = this.stateMachine.getState();
    
    if (state === ApplicationState.BLOCKED_MANUAL_REQUIRED) {
      await this.stateMachine.send(ApplicationEvent.ALL_FIELDS_FILLED);
    }
    
    // Continue processing
    await this.processLoop();
  }
  
  /**
   * Cancel the application
   */
  async cancel(): Promise<void> {
    await this.stateMachine.send(ApplicationEvent.CANCEL);
  }
}

// ============================================================================
// PART 6: USAGE EXAMPLE
// ============================================================================

/*
Usage:

const orchestrator = new ApplicationOrchestrator(
  {
    jobId: 'job_123',
    jobTitle: 'Senior Engineer',
    company: 'TechCorp',
    sourceUrl: 'https://jobs.techcorp.com/apply/123'
  },
  {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '555-1234'
  },
  formFiller,
  pageClassifier
);

// Start the application
await orchestrator.start();

// If blocked, user completes action then:
await orchestrator.resume();

// To cancel:
await orchestrator.cancel();
*/

export default ApplicationStateMachine;
