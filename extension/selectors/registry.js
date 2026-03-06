// extension/selectors/registry.js — CS-017: Centralized Selector Registry
// FIX-17 (EXT-FE-004): Single source of truth for all ATS selectors the extension depends on.
//
// Structure per handler:
//   handler:    handler filename (without .js)
//   urlPattern: regex matching ATS apply page URLs
//   selectors:  { category: { description, critical, selectors[] } }
//   sampleUrls: public career page URLs for CI health monitoring
//   authRequired: true if the ATS apply flow requires login (limits CI testing)
//
// The CI job (selector-health-check.mjs) reads this registry and validates
// selectors against live ATS sites weekly. Runtime monitoring uses
// resilientDOM.js + PostHog to track miss rates in production.

export const SELECTOR_REGISTRY = [
  // ═══════════════════════════════════════════════════════════
  // 1. LinkedIn Easy Apply
  // ═══════════════════════════════════════════════════════════
  {
    handler: 'linkedin-easy-apply',
    urlPattern: /linkedin\.com\/jobs\/view|linkedin\.com\/jobs\/collections/,
    authRequired: true, // Easy Apply modal requires login
    selectors: {
      modal: {
        description: 'Easy Apply modal dialog container',
        critical: true,
        selectors: [
          '[role="dialog"].jobs-easy-apply-modal',
          '.artdeco-modal[role="dialog"]',
          '[role="dialog"][class*="easy-apply"]',
          '[role="dialog"][aria-labelledby*="easy-apply"]',
        ],
      },
      nextBtn: {
        description: 'Next step navigation button',
        critical: true,
        selectors: [
          'button[aria-label="Continue to next step"]',
          'button[aria-label="Next"]',
          'footer button[class*="primary"]',
        ],
      },
      submitBtn: {
        description: 'Submit application button',
        critical: true,
        selectors: [
          'button[aria-label="Submit application"]',
          'button.jobs-apply-button[aria-label*="Submit"]',
        ],
      },
      textInput: {
        description: 'Standard text inputs inside modal',
        critical: true,
        selectors: [
          'input[type="text"]',
          'input[type="email"]',
          'input[type="tel"]',
        ],
      },
      resumeRadio: {
        description: 'Resume selection radio cards',
        critical: true,
        selectors: [
          'input[type="radio"][name*="resume"]',
          '.jobs-document-upload-redesign-card',
          '.jobs-resume-picker__resume-card',
        ],
      },
      customDropdown: {
        description: 'LinkedIn custom dropdown (role=listbox)',
        critical: false,
        selectors: [
          '[role="listbox"]',
          '[role="combobox"]',
        ],
      },
      cityTypeahead: {
        description: 'City autocomplete input',
        critical: false,
        selectors: [
          'input[id*="city"]',
          'input[aria-label*="City"]',
          'input[placeholder*="city"]',
        ],
      },
      fieldContainer: {
        description: 'Form field wrapper for label discovery',
        critical: false,
        selectors: [
          '.jobs-easy-apply-form-section__grouping',
          '.fb-dash-form-element',
          'div[data-test-form-element]',
        ],
      },
    },
    sampleUrls: [], // Auth-gated — CI tests registry structure only
  },

  // ═══════════════════════════════════════════════════════════
  // 2. Greenhouse (React)
  // ═══════════════════════════════════════════════════════════
  {
    handler: 'greenhouse-react',
    urlPattern: /job-boards\.greenhouse\.io|job-boards\.eu\.greenhouse\.io/,
    authRequired: false,
    selectors: {
      fieldContainer: {
        description: 'Field wrapper divs on React boards',
        critical: true,
        selectors: [
          '[class*="field--"]',
          '[class*="Field"]',
          '[data-field]',
        ],
      },
      textInput: {
        description: 'Text inputs inside field containers',
        critical: true,
        selectors: [
          'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])',
        ],
      },
      reactSelect: {
        description: 'React-Select dropdown container',
        critical: true,
        selectors: [
          '[class*="select__control"]',
          '[class*="Select__control"]',
          '[class*="css-"][class*="-control"]',
        ],
      },
      fileInput: {
        description: 'Resume/file upload input',
        critical: true,
        selectors: [
          'input[type="file"]',
        ],
      },
      label: {
        description: 'Field labels',
        critical: false,
        selectors: [
          'label',
          '[class*="label"]',
        ],
      },
    },
    sampleUrls: [
      'https://job-boards.greenhouse.io/vanta/jobs/5431650004', // May expire; CI refreshes
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 3. Greenhouse (Legacy)
  // ═══════════════════════════════════════════════════════════
  {
    handler: 'greenhouse-legacy',
    urlPattern: /boards\.greenhouse\.io|boards\.eu\.greenhouse\.io/,
    authRequired: false,
    selectors: {
      nameFields: {
        description: 'First/last name fields',
        critical: true,
        selectors: [
          '#first_name',
          '#last_name',
          'input[name="job_application[first_name]"]',
          'input[name="job_application[last_name]"]',
        ],
      },
      emailPhone: {
        description: 'Email and phone fields',
        critical: true,
        selectors: [
          '#email',
          '#phone',
          'input[name="job_application[email]"]',
          'input[name="job_application[phone]"]',
        ],
      },
      urlFields: {
        description: 'LinkedIn/GitHub/portfolio URL fields',
        critical: false,
        selectors: [
          'input[name="job_application[urls][LinkedIn]"]',
          'input[name="job_application[urls][GitHub]"]',
          'input[name="job_application[urls][Portfolio]"]',
        ],
      },
      select2: {
        description: 'Select2 custom dropdowns',
        critical: true,
        selectors: [
          '.select2-container',
          '[id^="s2id_"]',
        ],
      },
      fieldWrapper: {
        description: 'Standard field containers',
        critical: true,
        selectors: [
          'div.field',
          '.application-field',
        ],
      },
      fileInput: {
        description: 'Resume upload',
        critical: true,
        selectors: [
          'input[type="file"]',
        ],
      },
    },
    sampleUrls: [
      'https://boards.greenhouse.io/embed/job_app?for=thumbtack&token=6444574', // May expire
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 4. Lever
  // ═══════════════════════════════════════════════════════════
  {
    handler: 'lever',
    urlPattern: /jobs\.lever\.co/,
    authRequired: false,
    selectors: {
      nameFields: {
        description: 'Name fields by name attribute',
        critical: true,
        selectors: [
          "[name='name']",
          "input[name='name']",
        ],
      },
      emailPhone: {
        description: 'Email, phone, location fields',
        critical: true,
        selectors: [
          "[name='email']",
          "[name='phone']",
          "[name='location']",
        ],
      },
      urlFields: {
        description: 'Profile URL fields',
        critical: false,
        selectors: [
          "[name='urls[LinkedIn]']",
          "[name='urls[GitHub]']",
          "[name='urls[Portfolio]']",
        ],
      },
      resumeUpload: {
        description: 'Resume upload input',
        critical: true,
        selectors: [
          '#resume-upload-input',
          'input[type="file"][name*="resume"]',
          'input[type="file"]',
        ],
      },
      formContainer: {
        description: 'Application form wrapper',
        critical: true,
        selectors: [
          '.application-form',
          'form',
          '.posting-page',
        ],
      },
    },
    sampleUrls: [
      'https://jobs.lever.co/anthropic', // Listing page — not apply, but has DOM structure
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 5. Workday
  // ═══════════════════════════════════════════════════════════
  {
    handler: 'workday',
    urlPattern: /\.myworkdayjobs\.com/,
    authRequired: true, // Apply flow requires account creation
    selectors: {
      automationIdInputs: {
        description: 'data-automation-id driven form fields',
        critical: true,
        selectors: [
          '[data-automation-id="legalNameSection_firstName"] input',
          '[data-automation-id="legalNameSection_lastName"] input',
          '[data-automation-id="email"] input',
          '[data-automation-id="phone-number"] input',
        ],
      },
      navigation: {
        description: 'Wizard navigation buttons',
        critical: true,
        selectors: [
          '[data-automation-id="bottom-navigation-next-button"]',
          '[data-automation-id="bottom-navigation-previous-button"]',
        ],
      },
      selectWidget: {
        description: 'Workday custom dropdown',
        critical: true,
        selectors: [
          '[data-automation-id="selectWidget"]',
          '[data-automation-id="multiSelectContainer"]',
        ],
      },
      fileUpload: {
        description: 'Resume drop zone',
        critical: true,
        selectors: [
          '[data-automation-id="file-upload-drop-zone"]',
          'input[data-automation-id="file-upload-input-ref"]',
        ],
      },
      pageHeader: {
        description: 'Page/step header for wizard detection',
        critical: false,
        selectors: [
          '[data-automation-id="pageHeaderTitle"]',
        ],
      },
    },
    sampleUrls: [], // Auth-gated
  },

  // ═══════════════════════════════════════════════════════════
  // 6. Workday Experience (sub-handler)
  // ═══════════════════════════════════════════════════════════
  {
    handler: 'workday-experience',
    urlPattern: /\.myworkdayjobs\.com/,
    authRequired: true,
    selectors: {
      experienceSection: {
        description: 'Work experience section container',
        critical: true,
        selectors: [
          '[data-automation-id="workExperience"]',
          '[data-automation-id*="workExperience-"]',
        ],
      },
      educationSection: {
        description: 'Education section container',
        critical: true,
        selectors: [
          '[data-automation-id="education"]',
          '[data-automation-id*="education-"]',
        ],
      },
      datePickers: {
        description: 'Month/year date display fields',
        critical: true,
        selectors: [
          '[data-automation-id="dateSectionMonth-display"]',
          '[data-automation-id="dateSectionYear-display"]',
        ],
      },
      currentlyWorkHere: {
        description: 'Currently work here checkbox',
        critical: false,
        selectors: [
          '[data-automation-id="currentlyWorkHere"] input[type="checkbox"]',
          'input[type="checkbox"][data-automation-id*="current"]',
        ],
      },
      addAnother: {
        description: 'Add Another entry button',
        critical: false,
        selectors: [
          '[data-automation-id="Add Another"]',
        ],
      },
    },
    sampleUrls: [],
  },

  // ═══════════════════════════════════════════════════════════
  // 7. Indeed
  // ═══════════════════════════════════════════════════════════
  {
    handler: 'indeed',
    urlPattern: /indeed\.com\/viewjob|indeed\.com\/applystart|m5\.apply\.indeed\.com|smartapply\.indeed\.com/,
    authRequired: true,
    selectors: {
      textInput: {
        description: 'Text inputs (excluding hidden/checkbox/radio/file)',
        critical: true,
        selectors: [
          'input[type="text"]',
          'input[type="email"]',
          'input[type="tel"]',
          'input[type="url"]',
          'input[type="number"]',
        ],
      },
      selectDropdown: {
        description: 'Standard select elements',
        critical: true,
        selectors: [
          'select:not([aria-hidden="true"])',
        ],
      },
      customDropdown: {
        description: 'Indeed custom dropdown components',
        critical: false,
        selectors: [
          '[role="listbox"]',
          '[role="combobox"]',
          '[data-testid*="dropdown"]',
        ],
      },
      radioGroup: {
        description: 'Radio button groups',
        critical: false,
        selectors: [
          'fieldset',
          '[role="radiogroup"]',
          '[data-testid*="radio"]',
        ],
      },
      fileInput: {
        description: 'Resume upload',
        critical: true,
        selectors: [
          'input[type="file"]',
        ],
      },
      continueButton: {
        description: 'Indeed continue / next step button',
        critical: true,
        selectors: [
          'button[data-testid*="continue"]',
          'button[type="submit"]',
        ],
      },
    },
    sampleUrls: [],
  },

  // ═══════════════════════════════════════════════════════════
  // 8. Ashby
  // ═══════════════════════════════════════════════════════════
  {
    handler: 'ashby',
    urlPattern: /jobs\.ashbyhq\.com|app\.ashbyhq\.com/,
    authRequired: false,
    selectors: {
      textInput: {
        description: 'Standard text/email/tel/url inputs',
        critical: true,
        selectors: [
          'input[type="text"]',
          'input[type="email"]',
          'input[type="tel"]',
          'input[type="url"]',
        ],
      },
      select: {
        description: 'Standard select dropdowns',
        critical: true,
        selectors: [
          'select',
        ],
      },
      combobox: {
        description: 'Custom combobox/listbox dropdowns',
        critical: false,
        selectors: [
          '[role="combobox"]',
          '[role="listbox"]',
        ],
      },
      fileInput: {
        description: 'Resume upload',
        critical: true,
        selectors: [
          'input[type="file"][name*="resume"]',
          'input[type="file"][accept*="pdf"]',
          'input[type="file"]',
        ],
      },
    },
    sampleUrls: [
      'https://jobs.ashbyhq.com/ramp', // Listing page
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 9. iCIMS
  // ═══════════════════════════════════════════════════════════
  {
    handler: 'icims',
    urlPattern: /\.icims\.com/,
    authRequired: true,
    selectors: {
      mainWrapper: {
        description: 'iCIMS main container',
        critical: true,
        selectors: [
          '.iCIMS_MainWrapper',
          '.iCIMS_InfoMsg_Job',
          'form[name="applicationForm"]',
        ],
      },
      fieldContainer: {
        description: 'iCIMS field wrapper',
        critical: true,
        selectors: [
          '.iCIMS_InfoField',
          '.iCIMS_InfoField_Job',
          '.field',
          '.form-group',
        ],
      },
      labels: {
        description: 'iCIMS field labels',
        critical: false,
        selectors: [
          '.iCIMS_InfoFieldLabel',
          '.iCIMS_Label',
          'label',
        ],
      },
      resumeUpload: {
        description: 'iCIMS resume upload area',
        critical: true,
        selectors: [
          '.iCIMS_Resume input[type="file"]',
          'input[type="file"]',
        ],
      },
      customDropdown: {
        description: 'iCIMS dropdown',
        critical: false,
        selectors: [
          '.iCIMS_DropDown',
          '[role="combobox"]',
          '[role="listbox"]',
        ],
      },
      wizard: {
        description: 'Multi-step wizard navigation',
        critical: false,
        selectors: [
          '.iCIMS_Wizard',
          '.iCIMS_Steps',
          '.iCIMS_NavigationButton',
        ],
      },
    },
    sampleUrls: [],
  },

  // ═══════════════════════════════════════════════════════════
  // 10. SmartRecruiters
  // ═══════════════════════════════════════════════════════════
  {
    handler: 'smartrecruiters',
    urlPattern: /jobs\.smartrecruiters\.com|careers\.smartrecruiters\.com/,
    authRequired: false,
    selectors: {
      textInput: {
        description: 'Standard text inputs',
        critical: true,
        selectors: [
          'input[type="text"]',
          'input[type="email"]',
          'input[type="tel"]',
          'input[type="url"]',
        ],
      },
      formWrapper: {
        description: 'Application form container',
        critical: true,
        selectors: [
          '.application-form',
          '[data-test="application-form"]',
          '.js-application-form',
        ],
      },
      resumeUpload: {
        description: 'Resume upload',
        critical: true,
        selectors: [
          '[data-test="resume-upload"] input[type="file"]',
          'input[type="file"][name*="resume" i]',
          'input[type="file"][name*="cv" i]',
          'input[type="file"]',
        ],
      },
      select: {
        description: 'Standard select dropdowns',
        critical: true,
        selectors: [
          'select',
        ],
      },
    },
    sampleUrls: [
      'https://jobs.smartrecruiters.com/Visa', // Listing page
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 11. Taleo
  // ═══════════════════════════════════════════════════════════
  {
    handler: 'taleo',
    urlPattern: /\.taleo\.net/,
    authRequired: true,
    selectors: {
      textInput: {
        description: 'Standard text inputs',
        critical: true,
        selectors: [
          'input[type="text"]',
          'input[type="email"]',
          'input[type="tel"]',
          'input[type="url"]',
        ],
      },
      resumeUpload: {
        description: 'Taleo resume upload',
        critical: true,
        selectors: [
          '#resumeFileUpload',
          '.resumeUpload input[type="file"]',
          'input[type="file"][name*="resume" i]',
          'input[type="file"]',
        ],
      },
      select: {
        description: 'Standard select dropdowns',
        critical: true,
        selectors: [
          'select',
        ],
      },
      customDropdown: {
        description: 'Taleo custom dropdowns',
        critical: false,
        selectors: [
          '[role="combobox"]',
          '[role="listbox"]',
        ],
      },
    },
    sampleUrls: [],
  },

  // ═══════════════════════════════════════════════════════════
  // 12. Workable
  // ═══════════════════════════════════════════════════════════
  {
    handler: 'workable',
    urlPattern: /apply\.workable\.com|jobs\.workable\.com/,
    authRequired: false,
    selectors: {
      textInput: {
        description: 'Standard text inputs',
        critical: true,
        selectors: [
          'input[type="text"]',
          'input[type="email"]',
          'input[type="tel"]',
          'input[type="url"]',
        ],
      },
      formContainer: {
        description: 'Workable application form',
        critical: true,
        selectors: [
          'form[data-ui="application-form"]',
          '.application-form',
        ],
      },
      resumeUpload: {
        description: 'Resume upload',
        critical: true,
        selectors: [
          '[data-ui="resume-input"]',
          'input[type="file"][name*="resume"]',
          'input[type="file"]',
        ],
      },
      select: {
        description: 'Standard select dropdowns',
        critical: true,
        selectors: [
          'select',
        ],
      },
    },
    sampleUrls: [],
  },

  // ═══════════════════════════════════════════════════════════
  // 13. Recruitee
  // ═══════════════════════════════════════════════════════════
  {
    handler: 'recruitee',
    urlPattern: /\.recruitee\.com|careers\./,
    authRequired: false,
    selectors: {
      textInput: {
        description: 'Standard text inputs',
        critical: true,
        selectors: [
          'input[type="text"]',
          'input[type="email"]',
          'input[type="tel"]',
          'input[type="url"]',
        ],
      },
      resumeUpload: {
        description: 'Resume upload',
        critical: true,
        selectors: [
          'input[type="file"][name*="resume"]',
          'input[type="file"][name*="candidate[resume]"]',
          'input[type="file"][accept*="pdf"]',
          'input[type="file"]',
        ],
      },
      select: {
        description: 'Standard select dropdowns',
        critical: true,
        selectors: [
          'select',
        ],
      },
    },
    sampleUrls: [],
  },

  // ═══════════════════════════════════════════════════════════
  // 14. Avature
  // ═══════════════════════════════════════════════════════════
  {
    handler: 'avature',
    urlPattern: /\.avature\.net/,
    authRequired: true,
    selectors: {
      formContainer: {
        description: 'Avature application form',
        critical: true,
        selectors: [
          'form.avature-form',
          'form[data-form-type]',
          '.application-form',
        ],
      },
      textInput: {
        description: 'Standard text inputs',
        critical: true,
        selectors: [
          'input[type="text"]',
          'input[type="email"]',
          'input[type="tel"]',
          'input[type="url"]',
        ],
      },
      fileUpload: {
        description: 'Resume upload',
        critical: true,
        selectors: [
          '.file-upload input[type="file"]',
          '[class*="upload"] input[type="file"]',
          'input[type="file"][name*="resume" i]',
          'input[type="file"]',
        ],
      },
      select: {
        description: 'Standard select dropdowns',
        critical: true,
        selectors: [
          'select',
        ],
      },
    },
    sampleUrls: [],
  },

  // ═══════════════════════════════════════════════════════════
  // 15. Generic (fallback handler)
  // ═══════════════════════════════════════════════════════════
  {
    handler: 'generic',
    urlPattern: /.*/, // Matches any URL as fallback
    authRequired: false,
    selectors: {
      form: {
        description: 'Generic form container',
        critical: true,
        selectors: [
          'form',
        ],
      },
      textInput: {
        description: 'Standard text inputs',
        critical: true,
        selectors: [
          'input[type="text"]',
          'input[type="email"]',
          'input[type="tel"]',
          'input[type="url"]',
          'input[type="number"]',
        ],
      },
      textarea: {
        description: 'Textareas',
        critical: false,
        selectors: [
          'textarea',
        ],
      },
      fileInput: {
        description: 'File upload inputs',
        critical: true,
        selectors: [
          'input[type="file"]',
        ],
      },
      select: {
        description: 'Select dropdowns',
        critical: true,
        selectors: [
          'select',
        ],
      },
      label: {
        description: 'Label elements for field matching',
        critical: true,
        selectors: [
          'label',
          '.label',
          '[class*="label"]',
          'legend',
        ],
      },
    },
    sampleUrls: [],
  },
];

/**
 * Get all handler names from the registry.
 * @returns {string[]}
 */
export function getRegisteredHandlers() {
  return SELECTOR_REGISTRY.map(entry => entry.handler);
}

/**
 * Get registry entry for a specific handler.
 * @param {string} handlerName
 * @returns {Object|null}
 */
export function getHandlerEntry(handlerName) {
  return SELECTOR_REGISTRY.find(entry => entry.handler === handlerName) || null;
}

/**
 * Get all critical selectors for a handler (flattened).
 * @param {string} handlerName
 * @returns {{ category: string, selectors: string[] }[]}
 */
export function getCriticalSelectors(handlerName) {
  const entry = getHandlerEntry(handlerName);
  if (!entry) return [];

  return Object.entries(entry.selectors)
    .filter(([, v]) => v.critical)
    .map(([category, v]) => ({ category, selectors: v.selectors }));
}

/**
 * Get all entries that have sample URLs for CI monitoring.
 * @returns {Object[]}
 */
export function getMonitorableEntries() {
  return SELECTOR_REGISTRY.filter(entry =>
    entry.sampleUrls.length > 0 && !entry.authRequired
  );
}

/**
 * Total count of monitored selectors across all handlers.
 * @returns {{ total: number, critical: number }}
 */
export function getSelectorCounts() {
  let total = 0;
  let critical = 0;

  for (const entry of SELECTOR_REGISTRY) {
    for (const [, v] of Object.entries(entry.selectors)) {
      total += v.selectors.length;
      if (v.critical) critical += v.selectors.length;
    }
  }

  return { total, critical };
}
