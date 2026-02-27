// shared/algorithms/page-classifier.js
// Career Page Classification - Identify ATS systems and application page types

/**
 * CAREER PAGE CLASSIFICATION MODEL
 * ==================================
 *
 * Quickly and accurately classify where a job board redirect has landed.
 * This determines which automation strategy to use.
 *
 * Classification Categories:
 * 1. Known ATS (Greenhouse, Lever, Workday, etc.)
 * 2. Generic application form
 * 3. Email-only application
 * 4. PDF/Document download
 * 5. External redirect (needs re-analysis)
 * 6. Unstructured page
 */

// ============================================================================
// PART 1: PAGE TYPE TAXONOMY
// ============================================================================

export const PageType = {
  // Known ATS Systems
  ATS_GREENHOUSE: 'ats_greenhouse',
  ATS_LEVER: 'ats_lever',
  ATS_WORKDAY: 'ats_workday',
  ATS_ICIMS: 'ats_icims',
  ATS_TALEO: 'ats_taleo',
  ATS_JOBVITE: 'ats_jobvite',
  ATS_SMARTRECRUITERS: 'ats_smartrecruiters',
  ATS_BAMBOOHR: 'ats_bamboohr',
  ATS_ASHBY: 'ats_ashby',
  ATS_RIPPLING: 'ats_rippling',
  ATS_BREEZY: 'ats_breezy',
  ATS_JAZZ: 'ats_jazz',
  ATS_RECRUITEE: 'ats_recruitee',
  ATS_PERSONIO: 'ats_personio',
  ATS_SUCCESSFACTORS: 'ats_successfactors',
  ATS_ORACLE_HCM: 'ats_oracle_hcm',
  ATS_CORNERSTONE: 'ats_cornerstone',
  ATS_PAYLOCITY: 'ats_paylocity',
  ATS_PAYCOM: 'ats_paycom',
  ATS_UKG: 'ats_ukg',
  ATS_AVATURE: 'ats_avature',
  ATS_PHENOM: 'ats_phenom',
  ATS_EIGHTFOLD: 'ats_eightfold',
  ATS_BEAMERY: 'ats_beamery',
  ATS_WORKABLE: 'ats_workable',

  // Generic Types
  GENERIC_FORM: 'generic_form',
  EMAIL_APPLICATION: 'email_application',
  PDF_APPLICATION: 'pdf_application',
  LINKEDIN_EASY_APPLY: 'linkedin_easy_apply',
  INDEED_APPLY: 'indeed_apply',

  // Problematic Types
  EXTERNAL_REDIRECT: 'external_redirect',
  LOGIN_REQUIRED: 'login_required',
  EXPIRED_LISTING: 'expired_listing',
  CAPTCHA_BLOCKED: 'captcha_blocked',
  UNSTRUCTURED: 'unstructured',
  UNKNOWN: 'unknown',
};

// ============================================================================
// PART 2: ATS FINGERPRINTS DATABASE
// ============================================================================

export const ATS_FINGERPRINTS = [
  // ---- GREENHOUSE ----
  {
    pageType: PageType.ATS_GREENHOUSE,
    name: 'Greenhouse',
    urlPatterns: [
      /boards\.greenhouse\.io/i,
      /jobs\.greenhouse\.io/i,
      /greenhouse\.io\/[a-z]+\/jobs/i,
    ],
    urlContains: ['greenhouse.io', 'grnh.se'],
    domSelectors: [
      '#grnhse_app',
      '[data-greenhouse]',
      '.greenhouse-job-board',
      '#greenhouse-job-application',
    ],
    domClassPatterns: [/grnhse/i, /greenhouse/i],
    domIdPatterns: [/grnhse/i, /greenhouse/i],
    scriptSources: [/boards\.greenhouse\.io/i],
    globalVariables: ['Greenhouse', 'GRNHSE'],
    metaPatterns: {
      'generator': /greenhouse/i,
    },
    footerText: ['greenhouse', 'powered by greenhouse'],
    poweredByText: ['greenhouse'],
  },

  // ---- LEVER ----
  {
    pageType: PageType.ATS_LEVER,
    name: 'Lever',
    urlPatterns: [
      /jobs\.lever\.co/i,
      /lever\.co\/[a-z0-9-]+$/i,
    ],
    urlContains: ['lever.co'],
    domSelectors: [
      '.lever-job-application',
      '[data-lever-application]',
      '.lever-application-form',
      '#lever-jobs-container',
    ],
    domClassPatterns: [/lever-/i],
    domIdPatterns: [/lever/i],
    scriptSources: [/lever\.co/i, /lever-analytics/i],
    globalVariables: ['LeverJobsEmbed', 'Lever'],
    metaPatterns: {},
    footerText: ['lever'],
    poweredByText: ['lever', 'powered by lever'],
  },

  // ---- WORKDAY ----
  {
    pageType: PageType.ATS_WORKDAY,
    name: 'Workday',
    urlPatterns: [
      /myworkdayjobs\.com/i,
      /\.wd\d+\.myworkdayjobs\.com/i,
      /workday\.com\/.*\/job/i,
    ],
    urlContains: ['myworkdayjobs.com', 'workday.com/en-US/company/careers'],
    domSelectors: [
      '[data-automation-id^="workday"]',
      '.WDAY',
      '#wd-Navigation',
      '[data-uxi-widget-type]',
    ],
    domClassPatterns: [/WDAY/i, /WD-/i, /workday/i],
    domIdPatterns: [/wd-/i, /workday/i],
    scriptSources: [/workday/i, /\/uxi\//i],
    globalVariables: ['workday', 'WD'],
    metaPatterns: {},
    footerText: ['workday'],
    poweredByText: ['workday'],
  },

  // ---- WORKABLE ----
  {
    pageType: PageType.ATS_WORKABLE,
    name: 'Workable',
    urlPatterns: [
      /apply\.workable\.com/i,
      /workable\.com\/.*\/j\//i,
    ],
    urlContains: ['workable.com', 'apply.workable.com'],
    domSelectors: [
      '[data-ui="application-form"]',
      '.workable-application',
      '#workable-form',
    ],
    domClassPatterns: [/workable/i],
    domIdPatterns: [/workable/i],
    scriptSources: [/workable\.com/i],
    globalVariables: ['Workable'],
    metaPatterns: {},
    footerText: ['workable'],
    poweredByText: ['workable', 'powered by workable'],
  },

  // ---- iCIMS ----
  {
    pageType: PageType.ATS_ICIMS,
    name: 'iCIMS',
    urlPatterns: [
      /careers-.*\.icims\.com/i,
      /jobs\..*\.com\/.*\/job\//i,
      /icims\.com/i,
    ],
    urlContains: ['icims.com'],
    domSelectors: [
      '.iCIMS',
      '[class*="icims"]',
      '#icims_content',
      '.iCIMS_JobsTable',
    ],
    domClassPatterns: [/icims/i, /iCIMS/i],
    domIdPatterns: [/icims/i],
    scriptSources: [/icims/i],
    globalVariables: ['iCIMS'],
    metaPatterns: {},
    footerText: ['icims'],
    poweredByText: ['icims', 'powered by icims'],
  },

  // ---- TALEO ----
  {
    pageType: PageType.ATS_TALEO,
    name: 'Taleo (Oracle)',
    urlPatterns: [
      /taleo\.net/i,
      /\.taleo\./i,
      /\/careersection\//i,
      /\/OA_HTML\/OA\.jsp/i,
    ],
    urlContains: ['taleo.net', 'careersection'],
    domSelectors: [
      '#requisitionDescriptionInterface',
      '.taleo',
      '#ftlform',
      '.contentlinepanel',
    ],
    domClassPatterns: [/taleo/i],
    domIdPatterns: [/taleo/i, /ftl/i],
    scriptSources: [/taleo/i],
    globalVariables: ['Taleo', 'TBE'],
    metaPatterns: {},
    footerText: ['taleo', 'oracle'],
    poweredByText: ['taleo', 'oracle'],
  },

  // ---- JOBVITE ----
  {
    pageType: PageType.ATS_JOBVITE,
    name: 'Jobvite',
    urlPatterns: [
      /jobs\.jobvite\.com/i,
      /jobvite\.com\/.*\/job/i,
    ],
    urlContains: ['jobvite.com'],
    domSelectors: [
      '.jv-page-container',
      '[data-jv]',
      '#jv-application',
      '.jobvite-apply',
    ],
    domClassPatterns: [/jv-/i, /jobvite/i],
    domIdPatterns: [/jv-/i, /jobvite/i],
    scriptSources: [/jobvite/i],
    globalVariables: ['jobvite', 'JV'],
    metaPatterns: {},
    footerText: ['jobvite'],
    poweredByText: ['jobvite'],
  },

  // ---- SMARTRECRUITERS ----
  {
    pageType: PageType.ATS_SMARTRECRUITERS,
    name: 'SmartRecruiters',
    urlPatterns: [
      /jobs\.smartrecruiters\.com/i,
      /smartrecruiters\.com/i,
    ],
    urlContains: ['smartrecruiters.com'],
    domSelectors: [
      '.sr-job-application',
      '[data-smartrecruiters]',
      '#smartrecruiter',
    ],
    domClassPatterns: [/sr-/i, /smartrecruiter/i],
    domIdPatterns: [/smartrecruiter/i],
    scriptSources: [/smartrecruiters/i],
    globalVariables: ['SmartRecruiters'],
    metaPatterns: {},
    footerText: ['smartrecruiters'],
    poweredByText: ['smartrecruiters'],
  },

  // ---- ASHBY ----
  {
    pageType: PageType.ATS_ASHBY,
    name: 'Ashby',
    urlPatterns: [
      /jobs\.ashbyhq\.com/i,
      /ashbyhq\.com\/[a-z0-9-]+\/jobs/i,
    ],
    urlContains: ['ashbyhq.com'],
    domSelectors: [
      '[data-ashby]',
      '.ashby-job-posting',
    ],
    domClassPatterns: [/ashby/i],
    domIdPatterns: [/ashby/i],
    scriptSources: [/ashbyhq/i],
    globalVariables: ['Ashby'],
    metaPatterns: {},
    footerText: ['ashby'],
    poweredByText: ['ashby'],
  },

  // ---- BAMBOOHR ----
  {
    pageType: PageType.ATS_BAMBOOHR,
    name: 'BambooHR',
    urlPatterns: [
      /\.bamboohr\.com\/jobs/i,
      /bamboohr\.com\/careers/i,
    ],
    urlContains: ['bamboohr.com'],
    domSelectors: [
      '.BambooHR-ATS-board',
      '[data-bamboohr]',
      '#BambooHR-ATS',
    ],
    domClassPatterns: [/bamboo/i],
    domIdPatterns: [/bamboo/i],
    scriptSources: [/bamboohr/i],
    globalVariables: ['BambooHR'],
    metaPatterns: {},
    footerText: ['bamboohr', 'bamboo hr'],
    poweredByText: ['bamboohr'],
  },

  // ---- RIPPLING ----
  {
    pageType: PageType.ATS_RIPPLING,
    name: 'Rippling',
    urlPatterns: [
      /ats\.rippling\.com/i,
      /rippling\.com\/careers/i,
    ],
    urlContains: ['rippling.com', 'ats.rippling.com'],
    domSelectors: [
      '[data-rippling]',
      '.rippling-careers',
    ],
    domClassPatterns: [/rippling/i],
    domIdPatterns: [/rippling/i],
    scriptSources: [/rippling/i],
    globalVariables: ['Rippling'],
    metaPatterns: {},
    footerText: ['rippling'],
    poweredByText: ['rippling'],
  },

  // ---- BREEZY ----
  {
    pageType: PageType.ATS_BREEZY,
    name: 'Breezy HR',
    urlPatterns: [
      /\.breezy\.hr/i,
      /breezy\.hr\/p\//i,
    ],
    urlContains: ['breezy.hr'],
    domSelectors: [
      '[data-breezy]',
      '.breezy-application',
    ],
    domClassPatterns: [/breezy/i],
    domIdPatterns: [/breezy/i],
    scriptSources: [/breezy\.hr/i],
    globalVariables: ['Breezy'],
    metaPatterns: {},
    footerText: ['breezy'],
    poweredByText: ['breezy', 'powered by breezy'],
  },

  // ---- RECRUITEE ----
  {
    pageType: PageType.ATS_RECRUITEE,
    name: 'Recruitee',
    urlPatterns: [
      /\.recruitee\.com/i,
      /recruitee\.com\/(o|career)\//i,
    ],
    urlContains: ['recruitee.com'],
    domSelectors: [
      '[data-recruitee]',
      '.recruitee-career',
    ],
    domClassPatterns: [/recruitee/i],
    domIdPatterns: [/recruitee/i],
    scriptSources: [/recruitee/i],
    globalVariables: ['Recruitee'],
    metaPatterns: {},
    footerText: ['recruitee'],
    poweredByText: ['recruitee'],
  },

  // ---- SUCCESS FACTORS (SAP) ----
  {
    pageType: PageType.ATS_SUCCESSFACTORS,
    name: 'SuccessFactors (SAP)',
    urlPatterns: [
      /successfactors\.com/i,
      /\.successfactors\./i,
      /sap\.com\/careers/i,
    ],
    urlContains: ['successfactors.com', 'successfactors.eu'],
    domSelectors: [
      '[data-sap-ui]',
      '.sapMPage',
      '#sfJobReqApply',
    ],
    domClassPatterns: [/sap[A-Z]/i, /successfactors/i],
    domIdPatterns: [/sap/i, /sf/i],
    scriptSources: [/successfactors/i, /sap-ui/i],
    globalVariables: ['sap', 'SFAPI'],
    metaPatterns: {},
    footerText: ['successfactors', 'sap'],
    poweredByText: ['successfactors', 'sap'],
  },

  // ---- PHENOM ----
  {
    pageType: PageType.ATS_PHENOM,
    name: 'Phenom',
    urlPatterns: [
      /phenom\.com/i,
      /\.phenompro\./i,
    ],
    urlContains: ['phenom.com', 'phenompro.com'],
    domSelectors: [
      '[data-phenom]',
      '.phenom-careers',
      '#phenom-job-board',
    ],
    domClassPatterns: [/phenom/i],
    domIdPatterns: [/phenom/i],
    scriptSources: [/phenom/i],
    globalVariables: ['Phenom', 'PHENOM'],
    metaPatterns: {},
    footerText: ['phenom'],
    poweredByText: ['phenom', 'powered by phenom'],
  },
];

// ============================================================================
// PART 3: CLASSIFICATION ENGINE
// ============================================================================

export class PageClassifier {
  constructor() {
    this.fingerprints = ATS_FINGERPRINTS;
  }

  /**
   * Main classification method
   * @param {string} url - Current page URL
   * @param {string} domContent - Page HTML content
   * @param {Object} accessibilityTree - Optional accessibility tree
   * @returns {Promise<Object>} ClassificationResult
   */
  async classify(url, domContent, accessibilityTree = null) {
    const signals = [];
    const scores = new Map();

    // Initialize scores
    for (const type of Object.values(PageType)) {
      scores.set(type, 0);
    }

    // Extract metadata
    const metadata = this.extractMetadata(url, domContent);

    // ---- PHASE 1: URL-based detection (fastest) ----
    const urlSignals = this.classifyByUrl(url);
    signals.push(...urlSignals);
    for (const signal of urlSignals) {
      const current = scores.get(signal.indicator) || 0;
      scores.set(signal.indicator, current + signal.weight);
    }

    // ---- PHASE 2: Quick DOM detection ----
    const domSignals = this.classifyByDom(domContent);
    signals.push(...domSignals);
    for (const signal of domSignals) {
      const current = scores.get(signal.indicator) || 0;
      scores.set(signal.indicator, current + signal.weight);
    }

    // ---- PHASE 3: Script/meta detection ----
    const scriptSignals = this.classifyByScripts(domContent);
    signals.push(...scriptSignals);
    for (const signal of scriptSignals) {
      const current = scores.get(signal.indicator) || 0;
      scores.set(signal.indicator, current + signal.weight);
    }

    // ---- PHASE 4: Structural analysis ----
    const structureSignals = this.classifyByStructure(domContent, metadata);
    signals.push(...structureSignals);
    for (const signal of structureSignals) {
      const current = scores.get(signal.indicator) || 0;
      scores.set(signal.indicator, current + signal.weight);
    }

    // ---- PHASE 5: Special case detection ----
    const specialSignals = this.detectSpecialCases(url, domContent, metadata);
    signals.push(...specialSignals);
    for (const signal of specialSignals) {
      const current = scores.get(signal.indicator) || 0;
      scores.set(signal.indicator, current + signal.weight);
    }

    // Find highest scoring type
    let maxScore = 0;
    let bestType = PageType.UNKNOWN;

    for (const [type, score] of scores) {
      if (score > maxScore) {
        maxScore = score;
        bestType = type;
      }
    }

    // Calculate confidence (normalized)
    const confidence = Math.min(maxScore / 3.0, 1.0);

    // Generate warnings
    const warnings = this.generateWarnings(bestType, metadata, signals);

    return {
      pageType: bestType,
      confidence,
      signals,
      metadata,
      suggestedHandler: this.getSuggestedHandler(bestType),
      warnings,
    };
  }

  // ---- URL Classification ----
  classifyByUrl(url) {
    const signals = [];
    const urlLower = url.toLowerCase();

    // Check ATS fingerprints
    for (const fp of this.fingerprints) {
      // Check URL patterns (strongest signal)
      for (const pattern of fp.urlPatterns) {
        if (pattern.test(url)) {
          signals.push({
            type: 'url',
            indicator: fp.pageType,
            weight: 1.5,
          });
          return signals; // URL match is definitive
        }
      }

      // Check URL contains
      for (const substr of fp.urlContains) {
        if (urlLower.includes(substr.toLowerCase())) {
          signals.push({
            type: 'url',
            indicator: fp.pageType,
            weight: 1.2,
          });
        }
      }
    }

    // Check for special URL patterns
    if (/mailto:/i.test(url)) {
      signals.push({
        type: 'url',
        indicator: PageType.EMAIL_APPLICATION,
        weight: 2.0,
      });
    }

    if (/\.pdf(\?|$)/i.test(url)) {
      signals.push({
        type: 'url',
        indicator: PageType.PDF_APPLICATION,
        weight: 2.0,
      });
    }

    if (/linkedin\.com\/jobs/i.test(url)) {
      signals.push({
        type: 'url',
        indicator: PageType.LINKEDIN_EASY_APPLY,
        weight: 1.5,
      });
    }

    if (/indeed\.com\/viewjob/i.test(url)) {
      signals.push({
        type: 'url',
        indicator: PageType.INDEED_APPLY,
        weight: 1.5,
      });
    }

    return signals;
  }

  // ---- DOM Classification ----
  classifyByDom(domContent) {
    const signals = [];

    for (const fp of this.fingerprints) {
      // Check DOM selectors
      for (const selector of fp.domSelectors) {
        const selectorPattern = this.selectorToPattern(selector);
        if (selectorPattern.test(domContent)) {
          signals.push({
            type: 'dom',
            indicator: fp.pageType,
            weight: 1.0,
          });
        }
      }

      // Check class patterns
      for (const pattern of fp.domClassPatterns) {
        if (pattern.test(domContent)) {
          signals.push({
            type: 'dom',
            indicator: fp.pageType,
            weight: 0.5,
          });
        }
      }

      // Check ID patterns
      for (const pattern of fp.domIdPatterns) {
        const idPattern = new RegExp(`id=["']?[^"']*${pattern.source}`, 'i');
        if (idPattern.test(domContent)) {
          signals.push({
            type: 'dom',
            indicator: fp.pageType,
            weight: 0.6,
          });
        }
      }
    }

    return signals;
  }

  // ---- Script Classification ----
  classifyByScripts(domContent) {
    const signals = [];

    // Extract script sources
    const scriptMatches = domContent.matchAll(/<script[^>]*src=["']([^"']+)["']/gi);
    const scriptSources = Array.from(scriptMatches).map(m => m[1]);

    for (const fp of this.fingerprints) {
      for (const srcPattern of fp.scriptSources) {
        for (const src of scriptSources) {
          if (srcPattern.test(src)) {
            signals.push({
              type: 'script',
              indicator: fp.pageType,
              weight: 0.8,
            });
          }
        }
      }

      // Check for global variables in inline scripts
      for (const varName of fp.globalVariables) {
        const varPattern = new RegExp(`(window\\.)?${varName}\\s*[=\\.]`, 'i');
        if (varPattern.test(domContent)) {
          signals.push({
            type: 'script',
            indicator: fp.pageType,
            weight: 0.7,
          });
        }
      }
    }

    return signals;
  }

  // ---- Structural Classification ----
  classifyByStructure(domContent, metadata) {
    const signals = [];

    // Has a form with file upload = likely application form
    if (metadata.hasForm && metadata.hasFileUpload) {
      signals.push({
        type: 'structure',
        indicator: PageType.GENERIC_FORM,
        weight: 0.8,
      });
    }

    // Has mailto link prominently = email application
    if (metadata.hasEmailLink) {
      const emailLinksCount = (domContent.match(/mailto:/gi) || []).length;
      const formCount = metadata.formCount;

      if (emailLinksCount > 0 && formCount === 0) {
        signals.push({
          type: 'structure',
          indicator: PageType.EMAIL_APPLICATION,
          weight: 1.0,
        });
      }
    }

    // Check for "apply" or "submit" buttons
    const applyButtonPattern = /(type=["']submit["'][^>]*>.*?(apply|submit)|>.*?(apply|submit).*?<\/button)/gi;
    if (applyButtonPattern.test(domContent)) {
      signals.push({
        type: 'structure',
        indicator: PageType.GENERIC_FORM,
        weight: 0.3,
      });
    }

    // Check for PDF download links
    const pdfLinkPattern = /href=["'][^"']*\.pdf["']/gi;
    if (pdfLinkPattern.test(domContent)) {
      signals.push({
        type: 'structure',
        indicator: PageType.PDF_APPLICATION,
        weight: 0.5,
      });
    }

    return signals;
  }

  // ---- Special Cases Detection ----
  detectSpecialCases(url, domContent, metadata) {
    const signals = [];

    // Login required detection
    const loginPatterns = [
      /sign\s*in\s*to\s*(continue|apply)/i,
      /log\s*in\s*required/i,
      /create\s*an?\s*account\s*to\s*apply/i,
      /please\s*sign\s*in/i,
    ];
    for (const pattern of loginPatterns) {
      if (pattern.test(domContent)) {
        signals.push({
          type: 'text',
          indicator: PageType.LOGIN_REQUIRED,
          weight: 1.5,
        });
      }
    }

    // Expired listing detection
    const expiredPatterns = [
      /position\s*(has\s*been\s*)?(filled|closed)/i,
      /no\s*longer\s*(accepting|available)/i,
      /job\s*(posting\s*)?(expired|closed)/i,
      /this\s*job\s*is\s*no\s*longer/i,
    ];
    for (const pattern of expiredPatterns) {
      if (pattern.test(domContent)) {
        signals.push({
          type: 'text',
          indicator: PageType.EXPIRED_LISTING,
          weight: 2.0,
        });
      }
    }

    // CAPTCHA detection
    const captchaPatterns = [
      /recaptcha/i,
      /hcaptcha/i,
      /turnstile/i,
      /captcha/i,
      /verify\s*you('re|.*are)\s*(human|not\s*a\s*(bot|robot))/i,
    ];
    for (const pattern of captchaPatterns) {
      if (pattern.test(domContent)) {
        signals.push({
          type: 'dom',
          indicator: PageType.CAPTCHA_BLOCKED,
          weight: 1.0,
        });
      }
    }

    // External redirect detection (meta refresh, JS redirect)
    const redirectPatterns = [
      /<meta[^>]*http-equiv=["']refresh["'][^>]*url=/i,
      /window\.location\s*=\s*["']/i,
      /location\.href\s*=\s*["']/i,
      /location\.replace\s*\(/i,
    ];
    for (const pattern of redirectPatterns) {
      if (pattern.test(domContent)) {
        signals.push({
          type: 'script',
          indicator: PageType.EXTERNAL_REDIRECT,
          weight: 1.2,
        });
      }
    }

    // Bot detection patterns
    if (metadata.detectsBot) {
      signals.push({
        type: 'structure',
        indicator: PageType.CAPTCHA_BLOCKED,
        weight: 0.5,
      });
    }

    return signals;
  }

  // ---- Helper Methods ----

  extractMetadata(url, domContent) {
    let domain = '';
    try {
      domain = new URL(url).hostname;
    } catch (e) {
      domain = url;
    }

    // Extract title
    const titleMatch = domContent.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Count forms
    const formCount = (domContent.match(/<form/gi) || []).length;

    // Count inputs
    const inputCount = (domContent.match(/<input/gi) || []).length;

    // Has file upload
    const hasFileUpload = /type=["']file["']/i.test(domContent);

    // Has email link
    const hasEmailLink = /mailto:/i.test(domContent);

    // Bot detection
    const botDetectionPatterns = [
      /bot.*detect/i,
      /browser.*check/i,
      /cloudflare/i,
      /akamai/i,
      /datadome/i,
      /perimeterx/i,
    ];
    const detectsBot = botDetectionPatterns.some(p => p.test(domContent));

    return {
      url,
      domain,
      title,
      hasForm: formCount > 0,
      hasFileUpload,
      hasEmailLink,
      formCount,
      inputCount,
      detectsBot,
    };
  }

  selectorToPattern(selector) {
    if (selector.startsWith('#')) {
      return new RegExp(`id=["']?${selector.slice(1)}["']?`, 'i');
    }
    if (selector.startsWith('.')) {
      return new RegExp(`class=["'][^"']*${selector.slice(1)}[^"']*["']`, 'i');
    }
    if (selector.startsWith('[')) {
      const attrMatch = selector.match(/\[([^\]=]+)([$^*]?=["']?([^"'\]]+)["']?)?\]/);
      if (attrMatch) {
        const attr = attrMatch[1];
        const value = attrMatch[3];
        if (value) {
          return new RegExp(`${attr}=["'][^"']*${value}[^"']*["']`, 'i');
        }
        return new RegExp(`${attr}=`, 'i');
      }
    }

    return new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  getSuggestedHandler(pageType) {
    const handlers = {
      [PageType.ATS_GREENHOUSE]: 'greenhouse',
      [PageType.ATS_LEVER]: 'lever',
      [PageType.ATS_WORKDAY]: 'workday',
      [PageType.ATS_ICIMS]: 'icims',
      [PageType.ATS_TALEO]: 'taleo',
      [PageType.ATS_JOBVITE]: 'jobvite',
      [PageType.ATS_SMARTRECRUITERS]: 'smartrecruiters',
      [PageType.ATS_BAMBOOHR]: 'bamboohr',
      [PageType.ATS_ASHBY]: 'ashby',
      [PageType.ATS_RIPPLING]: 'rippling',
      [PageType.ATS_BREEZY]: 'breezy',
      [PageType.ATS_JAZZ]: 'jazz',
      [PageType.ATS_RECRUITEE]: 'recruitee',
      [PageType.ATS_PERSONIO]: 'personio',
      [PageType.ATS_SUCCESSFACTORS]: 'successfactors',
      [PageType.ATS_ORACLE_HCM]: 'oracle_hcm',
      [PageType.ATS_CORNERSTONE]: 'cornerstone',
      [PageType.ATS_PAYLOCITY]: 'paylocity',
      [PageType.ATS_PAYCOM]: 'paycom',
      [PageType.ATS_UKG]: 'ukg',
      [PageType.ATS_AVATURE]: 'avature',
      [PageType.ATS_PHENOM]: 'phenom',
      [PageType.ATS_EIGHTFOLD]: 'eightfold',
      [PageType.ATS_BEAMERY]: 'beamery',
      [PageType.ATS_WORKABLE]: 'workable',
      [PageType.GENERIC_FORM]: 'generic',
      [PageType.EMAIL_APPLICATION]: 'email',
      [PageType.PDF_APPLICATION]: 'pdf',
      [PageType.LINKEDIN_EASY_APPLY]: 'linkedin',
      [PageType.INDEED_APPLY]: 'indeed',
      [PageType.EXTERNAL_REDIRECT]: 'redirect',
      [PageType.LOGIN_REQUIRED]: 'login_required',
      [PageType.EXPIRED_LISTING]: 'expired',
      [PageType.CAPTCHA_BLOCKED]: 'captcha',
      [PageType.UNSTRUCTURED]: 'unstructured',
      [PageType.UNKNOWN]: 'fallback',
    };

    return handlers[pageType] || 'fallback';
  }

  generateWarnings(pageType, metadata, signals) {
    const warnings = [];

    if (pageType === PageType.LOGIN_REQUIRED) {
      warnings.push('Login or account creation required to apply');
    }

    if (pageType === PageType.EXPIRED_LISTING) {
      warnings.push('This job posting appears to be expired or filled');
    }

    if (pageType === PageType.CAPTCHA_BLOCKED) {
      warnings.push('CAPTCHA or bot detection present - manual intervention may be required');
    }

    if (metadata.detectsBot) {
      warnings.push('Bot detection system detected - proceed with caution');
    }

    if (pageType === PageType.EXTERNAL_REDIRECT) {
      warnings.push('Page contains redirect - final destination may differ');
    }

    // Low confidence warning
    const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
    if (totalWeight < 1.0 && pageType !== PageType.UNKNOWN) {
      warnings.push('Low confidence classification - manual verification recommended');
    }

    return warnings;
  }
}

export default PageClassifier;
