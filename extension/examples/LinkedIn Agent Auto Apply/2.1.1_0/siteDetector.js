// siteDetector.js - Detects which job site we're on
console.log("==== SITE DETECTOR MODULE LOADED ====");

// Prevent multiple loading by checking and early exit
if (window.SiteDetector) {
  console.log("⚠️ SiteDetector already loaded, skipping redeclaration");
} else {

/**
 * SiteDetector - Identifies the current job site
 */
class SiteDetectorClass {
  static detectSite() {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    
    // CareerGPT detection (job queue page)
    if (hostname.includes('careergpt.io')) {
      return {
        name: 'careergpt',
        isJobPage: true,
        isJobQueuePage: pathname.includes('/job') || pathname.includes('/report'),
        isJobDetailsPage: false,
        isExternalSite: false
      };
    }
    
    // LinkedIn detection
    if (hostname.includes('linkedin.com')) {
      const isJobDetailsPage = pathname.includes('/jobs/view/');
      const isJobListPage = pathname.includes('/jobs/') && !isJobDetailsPage;
      
      return {
        name: 'linkedin',
        isJobPage: pathname.includes('/jobs/'),
        isJobDetailsPage: isJobDetailsPage,
        isJobListPage: isJobListPage,
        isJobQueuePage: false,
        isExternalSite: false
      };
    }
    
    // Future site support
    if (hostname.includes('indeed.com')) {
      return {
        name: 'indeed',
        isJobPage: pathname.includes('/viewjob'),
        isJobDetailsPage: pathname.includes('/viewjob'),
        isJobQueuePage: false,
        isExternalSite: false
      };
    }
    
    if (hostname.includes('glassdoor.com')) {
      return {
        name: 'glassdoor',
        isJobPage: pathname.includes('/job-listing/'),
        isJobDetailsPage: pathname.includes('/job-listing/'),
        isJobQueuePage: false,
        isExternalSite: false
      };
    }
    
    // Check if this might be an external application site
    const pendingApp = window.pendingExternalApplication;
    if (pendingApp) {
      return {
        name: 'external',
        isJobPage: true,
        isJobDetailsPage: false,
        isJobQueuePage: false,
        isExternalSite: true,
        company: pendingApp.company,
        jobTitle: pendingApp.title
      };
    }
    
    return {
      name: 'unknown',
      isJobPage: false,
      isJobDetailsPage: false,
      isJobQueuePage: false,
      isExternalSite: true
    };
  }
  
  static isSupportedSite() {
    const site = this.detectSite();
    return ['careergpt', 'linkedin', 'indeed', 'glassdoor', 'external'].includes(site.name);
  }
}

// Export for use in other scripts
window.SiteDetector = SiteDetectorClass;

}