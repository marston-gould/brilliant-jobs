// extension/selectors/job-site-registry.ts — EXT-AS-3: Job Site Overlay Selector Registry
// Per-site DOM selectors for Apply button interception and Save button injection.
// 9 sites from EXT-AS spec Section 7. Extends existing selectors/registry.ts.
// Each site has:
//   - applyButtonSelectors: fallback chain for the native Apply button
//   - saveButtonTarget: { position, selector } for BJ button injection adjacent to apply
//   - jobMetaSelectors: title, company, location, description for metadata parsing
//   - urlPattern: regex matching job listing pages on this site

export interface JobSiteEntry {
  platform: string;
  urlPattern: RegExp;
  hostPattern: RegExp;
  applyButtonSelectors: string[];
  saveButtonTarget: {
    position: 'before' | 'after' | 'adjacent';
    selector: string;
  };
  jobMetaSelectors: {
    title: string[];
    company: string[];
    location?: string[];
    description?: string[];
  };
}

export const JOB_SITE_REGISTRY: JobSiteEntry[] = [
  // 1. LinkedIn
  {
    platform: 'linkedin',
    urlPattern: /linkedin\.com\/jobs\/(view|collections|search)/,
    hostPattern: /linkedin\.com$/,
    applyButtonSelectors: [
      'button.jobs-apply-button',
      '.jobs-s-apply button',
      'button[data-control-name="jobdetails_topcard_inapply"]',
      '.jobs-apply-button--top-card',
    ],
    saveButtonTarget: {
      position: 'adjacent',
      selector: '.jobs-save-button, button[data-control-name="save_job"]',
    },
    jobMetaSelectors: {
      title: [
        '.job-details-jobs-unified-top-card__job-title',
        'h1.t-24',
        '.jobs-unified-top-card__job-title',
      ],
      company: [
        '.job-details-jobs-unified-top-card__company-name a',
        '.jobs-unified-top-card__company-name a',
        '.job-details-jobs-unified-top-card__company-name',
      ],
      location: [
        '.job-details-jobs-unified-top-card__bullet',
        '.jobs-unified-top-card__bullet',
      ],
    },
  },

  // 2. Indeed
  {
    platform: 'indeed',
    urlPattern: /indeed\.com\/viewjob|indeed\.com\/jobs\?|indeed\.com\/rc\/clk/,
    hostPattern: /indeed\.com$/,
    applyButtonSelectors: [
      '#indeedApplyButton',
      'button[id*="apply"]',
      '.jobsearch-IndeedApplyButton-newDesign button',
      'button[data-testid="indeedApplyButton"]',
    ],
    saveButtonTarget: {
      position: 'after',
      selector: '#jobsearch-ViewJobButtons-container, .jobsearch-ViewJobButtons-container',
    },
    jobMetaSelectors: {
      title: [
        '.jobsearch-JobInfoHeader-title',
        'h1[data-testid="jobsearch-JobInfoHeader-title"]',
        '.icl-u-xs-mb--xs h1',
      ],
      company: [
        '[data-testid="inlineHeader-companyName"] a',
        '.jobsearch-InlineCompanyRating a',
        '[data-company-name="true"]',
      ],
      location: [
        '[data-testid="job-location"]',
        '[data-testid="inlineHeader-companyLocation"]',
      ],
    },
  },

  // 3. Greenhouse
  {
    platform: 'greenhouse',
    urlPattern: /greenhouse\.io\/(embed\/)?job/,
    hostPattern: /greenhouse\.io$/,
    applyButtonSelectors: [
      '#submit_app',
      'button[type="submit"]',
      'input[type="submit"]',
      '.btn-submit',
    ],
    saveButtonTarget: {
      position: 'before',
      selector: '#application-form, #app_body form, .application-form',
    },
    jobMetaSelectors: {
      title: [
        '.app-title',
        'h1.job-post-name',
        '[class*="opening-title"]',
      ],
      company: [
        '.company-name',
        '[class*="company"]',
      ],
    },
  },

  // 4. Lever
  {
    platform: 'lever',
    urlPattern: /jobs\.lever\.co\/.+/,
    hostPattern: /lever\.co$/,
    applyButtonSelectors: [
      '.postings-btn-wrapper .postings-btn',
      '.postings-btn',
      'a[data-qa="btn-apply"]',
      'a.postings-btn[href*="apply"]',
    ],
    saveButtonTarget: {
      position: 'adjacent',
      selector: '.postings-btn-wrapper',
    },
    jobMetaSelectors: {
      title: [
        '.posting-headline h2',
        'h2[data-qa="posting-name"]',
      ],
      company: [
        '.posting-headline .company-name',
        '.posting-categories .sort-by-team',
      ],
      location: [
        '.posting-categories .sort-by-location',
        '.location',
      ],
    },
  },

  // 5. Glassdoor
  {
    platform: 'glassdoor',
    urlPattern: /glassdoor\.(com|co\.\w+)\/job-listing/,
    hostPattern: /glassdoor\.(com|co\.\w+)$/,
    applyButtonSelectors: [
      'button[data-test="apply-button"]',
      'button[data-test="applyButton"]',
      '.apply-button-wrapper button',
      '.applyButton',
    ],
    saveButtonTarget: {
      position: 'after',
      selector: '[data-test="location"], [data-test="employer-location"]',
    },
    jobMetaSelectors: {
      title: [
        '[data-test="job-details-header"] h1',
        '[data-test="jobTitle"]',
        '.JobDetails_jobTitle__Rw_gn',
      ],
      company: [
        '[data-test="employer-name"]',
        '.EmployerProfile_compactEmployerName__LE242',
      ],
      location: [
        '[data-test="location"]',
        '[data-test="employer-location"]',
      ],
    },
  },

  // 6. Ashby
  {
    platform: 'ashby',
    urlPattern: /jobs\.ashbyhq\.com\/.+/,
    hostPattern: /ashbyhq\.com$/,
    applyButtonSelectors: [
      'button.ashby-apply-btn',
      'button[class*="apply"]',
      'a[href*="/application"]',
    ],
    saveButtonTarget: {
      position: 'before',
      selector: '.ashby-job-posting-brief-info, .ashby-job-posting-brief',
    },
    jobMetaSelectors: {
      title: [
        'h1.ashby-job-posting-heading',
        'h1[class*="posting-heading"]',
      ],
      company: [
        '.ashby-job-posting-company-name',
        '[class*="company-name"]',
      ],
      location: [
        '.ashby-job-posting-location',
        '[class*="posting-location"]',
      ],
    },
  },

  // 7. Workable
  {
    platform: 'workable',
    urlPattern: /apply\.workable\.com\/.+/,
    hostPattern: /workable\.com$/,
    applyButtonSelectors: [
      'button[data-ui="submit-application"]',
      'button[data-ui="submit"]',
      'button[type="submit"]',
    ],
    saveButtonTarget: {
      position: 'before',
      selector: '[data-ui="job-overview"], [data-ui="job-details"]',
    },
    jobMetaSelectors: {
      title: [
        '[data-ui="job-title"]',
        'h1[data-ui="job-title"]',
      ],
      company: [
        '[data-ui="company-name"]',
        '[class*="company-name"]',
      ],
      location: [
        '[data-ui="job-location"]',
      ],
    },
  },

  // 8. Recruitee
  {
    platform: 'recruitee',
    urlPattern: /\.recruitee\.com\/o\//,
    hostPattern: /recruitee\.com$/,
    applyButtonSelectors: [
      '.apply-button',
      'button.btn-apply',
      'a.apply-button',
      'button[class*="apply"]',
    ],
    saveButtonTarget: {
      position: 'adjacent',
      selector: '.apply-button, button.btn-apply',
    },
    jobMetaSelectors: {
      title: [
        '.job-details__title',
        'h1.offer-title',
      ],
      company: [
        '.job-details__company',
        '.company-name',
      ],
      location: [
        '.job-details__location',
        '.offer-location',
      ],
    },
  },

  // 9. Handshake
  {
    platform: 'handshake',
    urlPattern: /joinhandshake\.com\/stu\/jobs|app\.joinhandshake\.com\/stu\/jobs/,
    hostPattern: /joinhandshake\.com$/,
    applyButtonSelectors: [
      'button[data-hook="apply-button"]',
      'button[data-hook="apply"]',
      'a[data-hook="apply-button"]',
    ],
    saveButtonTarget: {
      position: 'after',
      selector: '[data-hook="job-actions"], [data-hook="job-detail-actions"]',
    },
    jobMetaSelectors: {
      title: [
        '[data-hook="job-title"]',
        'h1[data-hook="job-title"]',
      ],
      company: [
        '[data-hook="employer-name"]',
        '[data-hook="company-name"]',
      ],
      location: [
        '[data-hook="job-location"]',
      ],
    },
  },
];

/**
 * Detect which job site the current page belongs to.
 * Returns the matching JOB_SITE_REGISTRY entry or null.
 */
export function detectJobSite(hostname: string, url: string): JobSiteEntry | null {
  for (const entry of JOB_SITE_REGISTRY) {
    if (entry.hostPattern.test(hostname) && entry.urlPattern.test(url)) {
      return entry;
    }
  }
  return null;
}

/**
 * Try each selector in a fallback chain, return the first match.
 */
export function queryWithFallback(selectors: string[]): Element | null {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch (_) {
      // Invalid selector — skip
    }
  }
  return null;
}
