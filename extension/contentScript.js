
  // ============================================================
  // ATS REDIRECT DETECTION (Item #15, v5.48)
  // Monitors URL changes for LinkedIn → external ATS handoffs.
  // When a user clicks "Apply on company website" on LinkedIn,
  // we detect the redirect and report the ATS platform + board slug.
  // ============================================================

  const ATS_URL_PATTERNS = [
    { platform: 'greenhouse', pattern: /boards\.greenhouse\.io\/([a-z0-9_-]+)\/jobs\//i, slugGroup: 1 },
    { platform: 'greenhouse', pattern: /boards\.eu\.greenhouse\.io\/([a-z0-9_-]+)\/jobs\//i, slugGroup: 1 },
    { platform: 'lever',      pattern: /jobs\.lever\.co\/([a-z0-9_-]+)\//i, slugGroup: 1 },
    { platform: 'ashby',      pattern: /jobs\.ashbyhq\.com\/([a-z0-9_-]+)\//i, slugGroup: 1 },
    { platform: 'workable',   pattern: /apply\.workable\.com\/([a-z0-9_-]+)\//i, slugGroup: 1 },
    { platform: 'recruitee',  pattern: /([a-z0-9_-]+)\.recruitee\.com/i, slugGroup: 1 },
    { platform: 'workday',    pattern: /([a-z0-9_-]+)\.myworkdayjobs\.com/i, slugGroup: 1 },
    { platform: 'indeed',     pattern: /indeed\.com\/(viewjob|applystart)/i, slugGroup: null },
  ];

  let _lastObservedUrl = window.location.href;

  function detectAtsRedirect(newUrl) {
    for (const { platform, pattern, slugGroup } of ATS_URL_PATTERNS) {
      const match = newUrl.match(pattern);
      if (match) {
        return {
          platform,
          boardSlug: slugGroup !== null ? match[slugGroup] : null,
          url: newUrl,
          fromLinkedIn: _lastObservedUrl.includes('linkedin.com'),
        };
      }
    }
    return null;
  }

  // Monitor URL changes (covers pushState, replaceState, hashchange, and actual navigations)
  function startRedirectMonitor() {
    // Check periodically (catches all types of navigation including redirects)
    setInterval(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== _lastObservedUrl) {
        const detection = detectAtsRedirect(currentUrl);
        if (detection) {
          chrome.runtime.sendMessage({
            type: 'ats:redirectDetected',
            ...detection,
            previousUrl: _lastObservedUrl,
            timestamp: new Date().toISOString(),
          }).catch(() => {});
          console.log('[BJ] ATS redirect detected:', detection.platform, detection.boardSlug);
        }
        _lastObservedUrl = currentUrl;
      }
    }, 1500);

    // Also hook pushState/replaceState for SPA-style navigations
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function() {
      origPush.apply(this, arguments);
      window.dispatchEvent(new Event('bj:urlchange'));
    };
    history.replaceState = function() {
      origReplace.apply(this, arguments);
      window.dispatchEvent(new Event('bj:urlchange'));
    };
    window.addEventListener('bj:urlchange', () => {
      const currentUrl = window.location.href;
      if (currentUrl !== _lastObservedUrl) {
        const detection = detectAtsRedirect(currentUrl);
        if (detection) {
          chrome.runtime.sendMessage({
            type: 'ats:redirectDetected',
            ...detection,
            previousUrl: _lastObservedUrl,
            timestamp: new Date().toISOString(),
          }).catch(() => {});
        }
        _lastObservedUrl = currentUrl;
      }
    });
  }

  // Start monitoring
  startRedirectMonitor();
