// interceptor.ts — LinkedIn API response interceptor
// Monkey-patches fetch to passively capture DashProfileCards responses
// This is LESS detectable than DOM scraping because:
// - No executeScript calls
// - No querySelector calls on the page
// - We just read data LinkedIn already sent to the browser
// - LinkedIn cannot distinguish this from normal page rendering

(function() {
  'use strict';

  const PROFILE_CARDS_PATTERN = 'DashProfileCards';
  const PROFILE_COMPONENTS_PATTERN = 'DashProfileComponents';

  // Store intercepted data keyed by profile URN
  const interceptedData = {};

  // Override fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    // CRITICAL: The entire patched fetch must be wrapped in try/catch.
    // Network errors, aborted requests, and navigation cancellations throw
    // on the await line and must not crash the content script.
    let response;
    try {
      response = await originalFetch.apply(this, args);
    } catch (fetchError) {
      // Re-throw so LinkedIn's own code sees the error as expected
      throw fetchError;
    }
    
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      
      if (url.includes(PROFILE_CARDS_PATTERN) || url.includes(PROFILE_COMPONENTS_PATTERN)) {
        // Clone the response so we can read the body without consuming it
        const cloned = response.clone();
        cloned.json().then(data => {
          processInterceptedData(url, data);
        }).catch(e => { try { chrome.runtime.sendMessage({ type: 'reportError', payload: { context: 'interceptor_msg', error: e?.message || String(e) } }).catch(() => {}); } catch {} });
      }
    } catch (e) {
      // Silent fail - never interfere with page functionality
    }
    
    return response;
  };

  // Also override XMLHttpRequest for older LinkedIn code paths
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._bjUrl = url;
    return originalXHROpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    if (this._bjUrl && (this._bjUrl.includes(PROFILE_CARDS_PATTERN) || this._bjUrl.includes(PROFILE_COMPONENTS_PATTERN))) {
      this.addEventListener('load', function() {
        try {
          const data = JSON.parse(this.responseText);
          processInterceptedData(this._bjUrl, data);
        } catch (e) { console.warn('[BJ] interceptor parse failed:', this._bjUrl?.substring(0, 80)); }
      });
    }
    return originalXHRSend.apply(this, args);
  };

  function processInterceptedData(url, data) {
    try {
      // Extract profile URN from URL
      const urnMatch = url.match(/profileUrn[^)]*fsd_profile[:%]3A([A-Za-z0-9_-]+)/);
      const profileUrn = urnMatch ? urnMatch[1] : null;

      if (!profileUrn) return;

      // Initialize entry for this profile
      if (!interceptedData[profileUrn]) {
        interceptedData[profileUrn] = {
          profileUrn,
          name: null,
          headline: null,
          location: null,
          hiringSignal: null,
          companies: [],
          raw_hashtags: []
        };
      }

      const entry = interceptedData[profileUrn];

      // The main data is in the `included` array — a flat list of entities
      const included = data?.included || 
                       data?.data?.included || 
                       data?.data?.data?.included ||
                       data?.data?.data?.data?.included || [];

      if (!included.length) {
        // Try deeper nesting — LinkedIn wraps things oddly
        const deepData = data?.data?.data?.data;
        if (deepData) {
          const keys = Object.keys(deepData);
          for (const key of keys) {
            if (deepData[key]?.included) {
              parseIncludedEntities(deepData[key].included, entry);
            }
          }
        }
      } else {
        parseIncludedEntities(included, entry);
      }

      // Also check top-level elements for profile cards
      const elements = data?.data?.data?.identityDashProfileCardsByDeferredCards?.['*elements'] ||
                       data?.data?.data?.data?.identityDashProfileCardsByDeferredCards?.['*elements'] || [];

      // Send to bridge script via postMessage (MAIN world cannot use chrome.runtime)
      if (entry.name || entry.companies.length > 0 || entry.hiringSignal) {
        window.postMessage({
          source: 'bj-interceptor',
          type: 'interceptedProfileData',
          profileUrn,
          data: JSON.parse(JSON.stringify(entry))  // clone for structured cloning
        }, '*');
      }

    } catch (e) {
      // Silent fail
    }
  }

  function parseIncludedEntities(included, entry) {
    for (const entity of included) {
      if (!entity) continue;
      const urn = entity.entityUrn || entity['$id'] || '';
      const type = entity.$type || '';

      // === NAME & HEADLINE ===
      // Look for profile mini-profile or identity data
      if (type.includes('MiniProfile') || type.includes('Profile') || urn.includes('fsd_profile')) {
        if (entity.firstName && entity.lastName) {
          entry.name = `${entity.firstName} ${entity.lastName}`.trim();
        }
        if (entity.headline) entry.headline = entity.headline;
        if (entity.locationName) entry.location = entity.locationName;
        if (entity.publicIdentifier) entry.profileSlug = entity.publicIdentifier;
      }

      // Name might be in text fields of various card components
      if (entity.title?.text && !entry.name && type.includes('Card')) {
        entry.name = entity.title.text;
      }

      // === HIRING SIGNALS ===
      if (urn.includes('fsd_hashtag')) {
        const hashtagText = urn.toLowerCase();
        entry.raw_hashtags.push(urn);
        
        if (hashtagText.includes('opentowork') || hashtagText.includes('open_to_work')) {
          entry.hiringSignal = 'open_to_work';
        }
        if (hashtagText.includes('hiring') && !hashtagText.includes('hireme')) {
          entry.hiringSignal = 'hiring';
        }
      }

      // Photo frames can also indicate hiring/open-to-work
      if (type.includes('PhotoFilterEdit') || type.includes('ProfilePhotoFrame')) {
        const str = JSON.stringify(entity).toLowerCase();
        if (str.includes('open_to_work') || str.includes('opentowork')) {
          entry.hiringSignal = 'open_to_work';
        }
        if (str.includes('hiring')) {
          entry.hiringSignal = 'hiring';
        }
      }

      // === EXPERIENCE / COMPANIES ===
      // Company entities
      if (urn.includes('fsd_company:') && entity.name) {
        const companyIdMatch = urn.match(/fsd_company:(\d+)/);
        if (companyIdMatch) {
          const existingIdx = entry.companies.findIndex(c => c.company_id === companyIdMatch[1]);
          if (existingIdx === -1) {
            entry.companies.push({
              company_id: companyIdMatch[1],
              company_name: entity.name,
              company_url: entity.url || `https://www.linkedin.com/company/${companyIdMatch[1]}/`,
              title: '',
              is_current: false
            });
          }
        }
      }

      // Position/Experience entities
      if (type.includes('Position') || type.includes('Experience') || 
          (entity.companyName && entity.title)) {
        const companyUrn = entity.companyUrn || entity['*company'] || '';
        const companyIdMatch = companyUrn.match(/(\d+)/);
        if (companyIdMatch || entity.companyName) {
          const company_id = companyIdMatch ? companyIdMatch[1] : '';
          const existingIdx = entry.companies.findIndex(c => c.company_id === company_id);
          
          const companyEntry = {
            company_id,
            company_name: entity.companyName || entity.company?.name || '',
            company_url: company_id ? `https://www.linkedin.com/company/${company_id}/` : '',
            title: entity.title || '',
            is_current: entity.isCurrent || false
          };

          if (existingIdx >= 0) {
            // Merge — prefer data with a title
            if (companyEntry.title) entry.companies[existingIdx].title = companyEntry.title;
            if (companyEntry.company_name) entry.companies[existingIdx].company_name = companyEntry.company_name;
            if (companyEntry.is_current) entry.companies[existingIdx].is_current = true;
          } else {
            entry.companies.push(companyEntry);
          }
        }
      }

      // Profile component entities with experience data
      if (type.includes('ProfileComponent') || type.includes('EntityComponent')) {
        // These often have title/subtitle with company info
        const titleText = entity.title?.text || '';
        const subtitleText = entity.subtitle?.text || '';
        
        // Look for company references in this component
        if (entity.company || entity['*company']) {
          const ref = entity.company || entity['*company'];
          const companyIdMatch = (typeof ref === 'string' ? ref : '').match(/(\d+)/);
          if (companyIdMatch) {
            const existingIdx = entry.companies.findIndex(c => c.company_id === companyIdMatch[1]);
            if (existingIdx >= 0) {
              if (titleText) entry.companies[existingIdx].title = titleText;
            } else {
              entry.companies.push({
                company_id: companyIdMatch[1],
                company_name: subtitleText.split(' · ')[0] || '',
                company_url: `https://www.linkedin.com/company/${companyIdMatch[1]}/`,
                title: titleText,
                is_current: subtitleText.toLowerCase().includes('present')
              });
            }
          }
        }
      }

      // Following state entities contain company IDs
      if (urn.includes('fsd_followingState') && urn.includes('fsd_company:')) {
        const companyIdMatch = urn.match(/fsd_company:(\d+)/);
        if (companyIdMatch) {
          const existingIdx = entry.companies.findIndex(c => c.company_id === companyIdMatch[1]);
          if (existingIdx === -1) {
            // We see the company but don't have the name yet — placeholder
            entry.companies.push({
              company_id: companyIdMatch[1],
              company_name: '',
              company_url: `https://www.linkedin.com/company/${companyIdMatch[1]}/`,
              title: '',
              is_current: false
            });
          }
        }
      }
    }
  }

  // Listen for requests from bridge script via postMessage
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'bj-bridge') return;

    if (event.data.type === 'getInterceptedData') {
      const slug = event.data.profileSlug;
      let match = null;
      for (const urn in interceptedData) {
        const entry = interceptedData[urn];
        if (entry.profileSlug === slug || !slug) {
          match = entry;
        }
      }
      window.postMessage({
        source: 'bj-interceptor',
        responseId: event.data.responseId,
        result: match ? JSON.parse(JSON.stringify(match)) : null
      }, '*');
    }

    if (event.data.type === 'clearInterceptedData') {
      for (const key in interceptedData) delete interceptedData[key];
      window.postMessage({
        source: 'bj-interceptor',
        responseId: event.data.responseId,
        result: { ok: true }
      }, '*');
    }
  });

})();
