// content.js - LinkedIn Job Application Extension (RESTORED WITH SAFETY)
(function() {
  'use strict';
  
  console.log("==== CONTENT SCRIPT LOADED ====");

  // Prevent multiple script loads
  if (window.contentJsLoaded) {
    console.log("Content.js already loaded, skipping");
    return;
  }
  window.contentJsLoaded = true;

  // Safe initialization to prevent hanging
let settings = {
    autoApplyEnabled: false, // DISABLED BY DEFAULT FOR SAFETY
  applyDelay: 5,
    maxQuestions: 5,
  keywordFilter: '',
    manualInterventionEnabled: true,
  autoFillExternal: true,
  saveExternalLinks: true,
    debugMode: false
  };

  let userProfile = {};
  let globalAgent = null;
  let processingState = {
    isProcessing: false,
    currentJobIndex: 0,
    totalJobs: 0,
    processed: [],
    failed: []
  };

  // Safe storage accessor that prevents context invalidation
  function safeGetStorage(keys, callback) {
    try {
      // Multiple layers of validation
      if (!chrome) {
        console.log("Chrome not available");
        callback(null);
        return;
      }
      
      if (!chrome.storage) {
        console.log("Chrome storage not available");
        callback(null);
        return;
      }
      
      if (!chrome.storage.local) {
        console.log("Chrome storage local not available");
        callback(null);
        return;
      }
      
      if (!chrome.runtime) {
        console.log("Chrome runtime not available");
        callback(null);
        return;
      }
      
      // Check if context is already invalidated
      if (chrome.runtime.lastError) {
        console.log("Chrome runtime already has error:", chrome.runtime.lastError.message);
        callback(null);
        return;
      }
      
      // Wrap the actual storage call in timeout to prevent hanging
      const timeoutId = setTimeout(() => {
        console.log("Storage call timed out, using fallback");
        callback(null);
      }, 1000);
      
      chrome.storage.local.get(keys, (result) => {
        clearTimeout(timeoutId);
        
        if (chrome.runtime.lastError) {
          console.log("Storage call failed:", chrome.runtime.lastError.message);
          callback(null);
          return;
        }
        
        callback(result);
      });
      
    } catch (error) {
      console.log("Safe storage call failed:", error.message);
      callback(null);
    }
  }

  // Initialize safely
  function safeInit() {
    try {
      console.log("Initializing content script safely...");
      
      // SAFETY: Check if we're on LinkedIn first
      const currentDomain = window.location.hostname.toLowerCase();
      if (!currentDomain.includes('linkedin.com')) {
        console.log("Not on LinkedIn domain, skipping content script initialization");
        return;
      }
      
      // Check if Chrome extension context is valid
      if (!chrome || !chrome.storage || !chrome.runtime) {
        console.log("Chrome extension context not available, skipping initialization");
    return;
  }
  
      // Load settings safely with error handling using safe storage
      safeGetStorage(['autoApplyEnabled', 'userProfile', 'applyDelay', 'maxQuestions', 'keywordFilter', 'manualInterventionEnabled', 'autoFillExternal', 'saveExternalLinks', 'debugMode'], (result) => {
        // Handle null result (context invalidated or error)
        if (result === null) {
          console.log("Storage unavailable, using default settings");
          // Use default settings if storage fails
          settings.autoApplyEnabled = false;
          settings.applyDelay = 5;
          settings.maxQuestions = 5;
          settings.keywordFilter = '';
          settings.manualInterventionEnabled = true;
          settings.autoFillExternal = true;
          settings.saveExternalLinks = true;
          settings.debugMode = false;
          userProfile = {};
          
          // Still try to initialize the agent system with defaults
          setTimeout(initializeAgentSystem, 1000);
    return;
  }
  
        // SAFETY: Auto-apply is disabled by default
        settings.autoApplyEnabled = result.autoApplyEnabled || false; // Use actual stored value
        settings.applyDelay = result.applyDelay || 5;
        settings.maxQuestions = result.maxQuestions || 5;
        settings.keywordFilter = result.keywordFilter || '';
        settings.manualInterventionEnabled = result.manualInterventionEnabled !== false;
        settings.autoFillExternal = result.autoFillExternal !== false;
        settings.saveExternalLinks = result.saveExternalLinks !== false;
        settings.debugMode = result.debugMode || false;
        
        userProfile = result.userProfile || {};
        
        console.log("Settings loaded safely:", {
          autoApplyEnabled: settings.autoApplyEnabled,
          hasProfile: !!userProfile.fullName,
          debugMode: settings.debugMode
        });
        
        // Initialize the agent system ONLY after settings are loaded
        setTimeout(initializeAgentSystem, 500);
      });
      
    } catch (error) {
      console.error("Error in safe init:", error);
      // Even if init fails, try to initialize with defaults
      setTimeout(initializeAgentSystem, 1000);
    }
  }

  // Safe initialization without errors
  function initializeAgentSystem() {
    console.log("=== INITIALIZING AGENT SYSTEM ===");
    
    try {
      // Check global context flag first
      if (!window.extensionContextValid) {
        console.log("Extension context invalid, aborting agent initialization");
        return;
      }
      
      console.log("Extension context valid, proceeding with initialization");
      
      // Simple check - just wait for globalAgent to be created by agent.js
      if (!window.globalAgent) {
        console.log("Global agent not ready yet, retrying in 1 second...");
        setTimeout(initializeAgentSystem, 1000);
        return;
      }
      
      console.log("✅ Global agent is ready:", !!window.globalAgent);
      
      // Use the existing global agent created by agent.js
      globalAgent = window.globalAgent;
      
      if (globalAgent) {
        console.log("Agent system ready");
        
        // Check for auto-apply after agent is ready
        setTimeout(() => {
          checkAndStartAutoApply();
        }, 2000); // Give time for page to fully load
        
      } else {
        console.error("Global agent not available");
      }
      
    } catch (error) {
      console.error("Error initializing agent system:", error);
    }
  }

  // Check and start auto-apply if enabled
  function checkAndStartAutoApply() {
    try {
      console.log("🔍 === CHECKING AUTO-APPLY SETTINGS ===");
      console.log("Auto-apply enabled:", settings.autoApplyEnabled);
      console.log("Global agent exists:", !!globalAgent);
      
      // NEW: Auto-apply is now MANUAL CONTROL ONLY
      // We don't automatically start applying when auto-apply is enabled
      // Instead, we only show the control button for manual triggering
      
      console.log("ℹ️ Auto-apply is in MANUAL CONTROL mode");
      console.log("ℹ️ Use the extension indicator button to manually trigger applications");
      
      // No automatic processing - user must click the indicator button
      
    } catch (error) {
      console.error("❌ Error in auto-apply check:", error);
    }
  }
  
  // Enhanced Easy Apply detection with retries
  function performEasyApplyDetection(siteInfo) {
    console.log("🔍 === PERFORMING ENHANCED EASY APPLY DETECTION ===");
    
    // Auto-apply logic based on page type
    if (siteInfo.isJobDetailsPage) {
      console.log("🎯 Job details page detected - checking for Easy Apply");
      
      // Try multiple detection attempts
      let attempts = 0;
      const maxAttempts = 3;
      
      const tryDetection = () => {
        attempts++;
        console.log(`🔍 Detection attempt ${attempts}/${maxAttempts}`);
        
        // Use the global agent's built-in method
        const hasEasyApply = globalAgent.findEasyApplyButton();
        console.log("Easy Apply button found:", !!hasEasyApply, hasEasyApply);
        
        if (hasEasyApply) {
          console.log("🚀 Starting AUTOMATIC job application in 3 seconds...");
          
          // Add countdown
          let countdown = 3;
          const countdownInterval = setInterval(() => {
            console.log(`Auto-Applying in ${countdown}s...`);
            countdown--;
            
            if (countdown === 0) {
              clearInterval(countdownInterval);
              console.log("🎯 EXECUTING AUTO APPLICATION NOW!");
              
              globalAgent.applyToJob()
                .then((success) => {
                  console.log("✅ Auto-application completed:", success);
                })
                .catch((error) => {
                  console.error("❌ Auto-application failed:", error);
                });
            }
          }, 1000);
        } else if (attempts < maxAttempts) {
          console.log(`❌ No Easy Apply found, retrying in 2 seconds... (attempt ${attempts}/${maxAttempts})`);
          setTimeout(tryDetection, 2000);
        } else {
          console.log("❌ No Easy Apply button found after all attempts");
          
          // ENHANCED: Check for standard/external job applications
          console.log("🔍 Easy Apply not found, checking for standard job applications...");
          checkForStandardJobApplication(siteInfo);
        }
      };
      
      tryDetection();
      
    } else if (siteInfo.isJobListPage) {
      console.log("📋 Job listing page detected - checking for Easy Apply jobs");
      
      // Enhanced detection with retries for job listing pages
      let attempts = 0;
      const maxAttempts = 3;
      
      const tryListingDetection = () => {
        attempts++;
        console.log(`📋 Listing detection attempt ${attempts}/${maxAttempts}`);
        
        if (globalAgent && globalAgent.processJobListings) {
          console.log("🚀 Starting AUTOMATIC job listing processing in 5 seconds...");
          
          // Add countdown for bulk processing
          let countdown = 5;
          const countdownInterval = setInterval(() => {
            console.log(`Auto-Processing in ${countdown}s...`);
            countdown--;
            
            if (countdown === 0) {
              clearInterval(countdownInterval);
              console.log("🎯 EXECUTING AUTO JOB PROCESSING NOW!");
              
              globalAgent.processJobListings()
                .then((success) => {
                  console.log("✅ Auto job processing completed:", success);
                })
                .catch((error) => {
                  console.error("❌ Auto job processing failed:", error);
                });
            }
          }, 1000);
        } else {
          console.log("❌ Global agent or processJobListings method not available");
        }
      };
      
      // Wait a bit longer for job listing pages to load
      setTimeout(tryListingDetection, 3000);
      
    } else if (siteInfo.isExternalSite) {
      console.log("🌐 External site detected - checking for standard job applications");
      checkForStandardJobApplication(siteInfo);
    } else {
      console.log("ℹ️ Not on a job page - auto-apply not applicable");
      console.log("Page details:", {
        isJobDetailsPage: siteInfo.isJobDetailsPage,
        isJobListPage: siteInfo.isJobListPage,
        isExternalSite: siteInfo.isExternalSite,
        url: window.location.href
      });
    }
  }
  
  // NEW: Check for standard job applications on external sites
  function checkForStandardJobApplication(siteInfo) {
    console.log("🔍 === CHECKING FOR STANDARD JOB APPLICATION ===");
    
    if (!settings.autoFillExternal) {
      console.log("ℹ️ External auto-fill is disabled in settings");
      return;
    }
    
    // Check if this is a supported external site
    const url = window.location.hostname.toLowerCase();
    const supportedSites = [
      'workday.com', 'myworkdayjobs.com',
      'greenhouse.io',
      'lever.co',
      'bamboohr.com',
      'smartrecruiters.com',
      'jobvite.com',
      'icims.com',
      'taleo.net',
      'successfactors.com'
    ];
    
    const isSupported = supportedSites.some(site => url.includes(site));
    
    if (!isSupported) {
      console.log("ℹ️ External site not in supported list, skipping auto-fill");
      return;
    }
    
    // Try to detect if we're on an application page
    const hasApplicationForm = document.querySelector(
      'form[id*="application"], form[class*="application"], ' +
      'form[action*="apply"], form[action*="submit"], ' +
      '[data-automation-id*="applicationForm"], ' +
      '.application-form, #application, #application_form'
    );
    
    // Check for apply buttons manually since we can't use :contains()
    const hasApplyButton = (() => {
      const buttons = document.querySelectorAll(
        'button, input[type="submit"], input[type="button"], a[href*="apply"], ' +
        '[data-automation-id*="applyBtn"], [data-automation-id*="applyButton"]'
      );
      
      for (const button of buttons) {
        const text = (button.textContent || '').toLowerCase();
        const value = (button.value || '').toLowerCase();
        const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
        
        if (text.includes('apply') || value.includes('apply') || ariaLabel.includes('apply')) {
          return button;
        }
      }
      return null;
    })();
    
    if (hasApplicationForm || hasApplyButton) {
      console.log("✅ Standard job application detected!");
      
      if (settings.autoApplyEnabled && globalAgent && globalAgent.applyToStandardJob) {
        console.log("🚀 Starting AUTOMATIC standard job application in 5 seconds...");
        
        // Add countdown for standard applications
        let countdown = 5;
        const countdownInterval = setInterval(() => {
          console.log(`Auto-Applying to standard job in ${countdown}s...`);
          countdown--;
          
          if (countdown === 0) {
            clearInterval(countdownInterval);
            console.log("🎯 EXECUTING STANDARD JOB APPLICATION NOW!");
            
            globalAgent.applyToStandardJob()
              .then((success) => {
                console.log("✅ Standard job application completed:", success);
              })
              .catch((error) => {
                console.error("❌ Standard job application failed:", error);
              });
          }
        }, 1000);
      } else {
        console.log("ℹ️ Standard job application found but auto-apply is disabled or not available");
      }
    } else {
      console.log("ℹ️ No standard job application form found on this page");
    }
  }
  
  // Legacy function (keeping for compatibility)
  function checkAndStartAutoApplyOld(siteInfo) {
    // This is now handled by the enhanced version above
  }

  // Message handler for communication with popup and background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Content script received message:", message.action);
    
    try {
      // Check if Chrome extension context is still valid
      if (!chrome || !chrome.runtime) {
        console.error("Chrome extension context invalidated, cannot process messages");
        sendResponse({ success: false, error: "Extension context invalidated. Please refresh the page." });
        return true;
      }
      
      switch (message.action) {
        case 'getStatus':
          sendResponse({
            url: window.location.href,
            status: processingState.isProcessing ? 'processing' : 'ready',
            agentReady: !!globalAgent,
            settings: settings,
            processingState: processingState
          });
          break;
          
        case 'startProcessing':
          handleStartProcessing(sendResponse);
          break;
          
        case 'stopProcessing':
          handleStopProcessing(sendResponse);
          break;
          
        case 'applyToCurrentJob':
          handleApplyToCurrentJob(sendResponse);
          break;
          
        case 'updateSettings':
          handleUpdateSettings(message.settings, sendResponse);
          break;
          
        case 'getJobDetails':
          handleGetJobDetails(sendResponse);
          break;
          
        default:
          console.log("Unknown message action:", message.action);
          sendResponse({ success: false, error: "Unknown action" });
      }
    } catch (error) {
      console.error("Error handling message:", error);
      sendResponse({ success: false, error: error.message });
    }
    
    return true; // Keep message channel open for async responses
  });

  // Handle start processing request
  function handleStartProcessing(sendResponse) {
    try {
      if (processingState.isProcessing) {
        sendResponse({ success: false, error: "Already processing" });
        return;
      }
      
      // Use the global agent's site info instead of SiteDetector
      const siteInfo = globalAgent?.siteInfo || { name: 'unknown' };
      
      if (siteInfo.isJobListPage) {
        console.log("Starting job list processing");
        startJobListProcessing();
        sendResponse({ success: true, message: "Started processing job list" });
      } else if (siteInfo.isJobDetailsPage) {
        console.log("Starting single job processing");
        startSingleJobProcessing();
        sendResponse({ success: true, message: "Started processing current job" });
      } else {
        sendResponse({ success: false, error: "Not on a supported job page" });
      }
    } catch (error) {
      console.error("Error starting processing:", error);
      sendResponse({ success: false, error: error.message });
    }
  }

  // Handle stop processing request
  function handleStopProcessing(sendResponse) {
    try {
      processingState.isProcessing = false;
      
      if (globalAgent) {
        globalAgent.updateAgentStatus('Stopped');
      }
      
      console.log("Processing stopped by user");
      sendResponse({ success: true, message: "Processing stopped" });
    } catch (error) {
      console.error("Error stopping processing:", error);
      sendResponse({ success: false, error: error.message });
    }
  }

  // Handle apply to current job
  function handleApplyToCurrentJob(sendResponse) {
    try {
      if (!globalAgent) {
        sendResponse({ success: false, error: "Agent not ready" });
    return;
  }
  
      const siteInfo = globalAgent?.siteInfo || { name: 'unknown' };
      
      if (!siteInfo.isJobDetailsPage) {
        sendResponse({ success: false, error: "Not on a job details page" });
    return;
  }
  
      // Start the actual job application process
      console.log("Starting individual job application via agent");
      globalAgent.applyToJob()
        .then((success) => {
          sendResponse({ 
            success: true, 
            message: success ? "Application completed successfully" : "Application failed",
            applicationSuccess: success
          });
        })
        .catch((error) => {
          console.error("Error in job application:", error);
          sendResponse({ success: false, error: error.message });
        });
      
  } catch (error) {
      console.error("Error applying to current job:", error);
      sendResponse({ success: false, error: error.message });
    }
  }

  // Handle settings update
  function handleUpdateSettings(newSettings, sendResponse) {
    try {
      console.log("📝 === SETTINGS UPDATE RECEIVED ===");
      console.log("Old settings:", settings);
      console.log("New settings:", newSettings);
      
      // Update settings with new values
      settings = { ...settings, ...newSettings };
      
      // Update global agent if it exists
      if (globalAgent) {
        globalAgent.settings = settings;
      }
      
      console.log("✅ Settings updated successfully:", settings);
      
      // IMPORTANT: Re-check auto-apply when settings change
      if (newSettings.hasOwnProperty('autoApplyEnabled')) {
        console.log("🔄 Auto-apply setting changed, re-checking...");
        
        setTimeout(() => {
          checkAndStartAutoApply();
        }, 1000);
      }
      
      sendResponse({ success: true, message: "Settings updated" });
    } catch (error) {
      console.error("❌ Error updating settings:", error);
      sendResponse({ success: false, error: error.message });
    }
  }

  // Handle get job details
  function handleGetJobDetails(sendResponse) {
    try {
      const siteInfo = globalAgent?.siteInfo || { name: 'unknown' };
      
      if (siteInfo.isJobDetailsPage) {
        // Extract basic job details
        const jobTitle = document.querySelector('h1')?.textContent?.trim() || 'Unknown Job';
        const company = document.querySelector('[data-control-name="company_link"]')?.textContent?.trim() || 'Unknown Company';
        
        sendResponse({
          success: true,
          jobDetails: {
            title: jobTitle,
            company: company,
            url: window.location.href,
            hasEasyApply: !!document.querySelector('[aria-label*="Easy Apply"], [data-control-name="easy_apply_button"]')
          }
        });
      } else {
        sendResponse({ success: false, error: "Not on a job details page" });
      }
    } catch (error) {
      console.error("Error getting job details:", error);
      sendResponse({ success: false, error: error.message });
    }
  }

  // Start job list processing (now with real functionality)
  function startJobListProcessing() {
    console.log("Job list processing started");
    processingState.isProcessing = true;
    
    if (globalAgent) {
      // Start the actual job listing processing
      globalAgent.processJobListings()
        .then((success) => {
          processingState.isProcessing = false;
          console.log(success ? 'Job list processing completed' : 'Job list processing failed');
        })
        .catch((error) => {
          console.error("Error in job listing processing:", error);
          processingState.isProcessing = false;
        });
    }
  }

  // Start single job processing (now with real functionality)
  function startSingleJobProcessing() {
    console.log("Single job processing started");
    processingState.isProcessing = true;
    
    if (globalAgent) {
      // Start the actual single job application
      globalAgent.applyToJob()
        .then((success) => {
          processingState.isProcessing = false;
          console.log(success ? 'Single job application completed' : 'Single job application failed');
        })
        .catch((error) => {
          console.error("Error in single job application:", error);
          processingState.isProcessing = false;
        });
    }
  }

  // Add some debugging functions for development
  window.extensionDebug = {
    getSettings: () => settings,
    getAgent: () => globalAgent,
    getProcessingState: () => processingState,
    getSiteInfo: () => globalAgent?.siteInfo || null,
    
    // NEW: Manual auto-apply trigger for testing
    triggerAutoApply: () => {
      console.log("🔧 === MANUAL AUTO-APPLY TRIGGER ===");
      const siteInfo = globalAgent?.siteInfo || null;
      console.log("Current settings:", settings);
      console.log("Site info:", siteInfo);
      checkAndStartAutoApply();
    },
    
    // NEW: Force enable auto-apply for testing
    enableAutoApply: () => {
      console.log("🔧 === FORCE ENABLING AUTO-APPLY ===");
      settings.autoApplyEnabled = true;
      if (globalAgent) {
        globalAgent.settings = settings;
      }
      console.log("Auto-apply enabled, triggering check...");
      window.extensionDebug.triggerAutoApply();
    },
    
    testAgent: () => {
      if (globalAgent) {
        console.log("✅ Agent is ready:", globalAgent);
        console.log("Agent status:", globalAgent.agentStatus);
        console.log("Resume data:", globalAgent.resumeData);
        alert("Agent is working! Check console for details.");
      } else {
        console.log("❌ Agent is not ready");
        alert("Agent is not ready. Make sure you're on a LinkedIn page.");
      }
    }
  };

  // Initialize everything safely
  safeInit();

  console.log("Content script loaded successfully");
  console.log("Extension debugging available via window.extensionDebug");
  console.log("Auto-apply is DISABLED by default for safety");
})(); 