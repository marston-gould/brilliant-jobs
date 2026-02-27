// background.js - Background Service Worker with CareerGPT Integration

/**
 * Background service worker for the LinkedIn Agent Auto Apply extension
 * Handles job queue management, statistics tracking, database communication, 
 * manual intervention coordination, and external application tracking
 */

// Job Queue Management
let jobQueue = [];
let currentJobIndex = -1;
let isProcessing = false;
let jobProcessingStatus = 'idle';

// Manual Intervention Tracking
let manualInterventionStats = {
  totalInterventions: 0,
  fieldTypes: {},
  commonIssues: []
};

// External Application Tracking
let externalApplications = {
  pending: [],
  completed: [],
  failed: []
};

// Initialize stats and queue on installation
chrome.runtime.onInstalled.addListener(() => {
  const today = new Date().toDateString();
  console.log("LinkedIn Agent Auto Apply extension installed/updated:", today);
  
  // Initialize statistics tracking
  chrome.storage.local.get({
    lastActiveDate: '',
    stats: { 
      today: 0, 
      total: 0, 
      success: 0, 
      easyApply: 0, 
      external: 0, 
      externalLinks: [],
      manualInterventions: 0
    },
    jobQueue: [],
    currentJobIndex: -1,
    isProcessing: false,
    manualInterventionStats: {
      totalInterventions: 0,
      fieldTypes: {},
      commonIssues: []
    }
  }, (data) => {
    // Reset daily count if it's a new day
    if (data.lastActiveDate !== today) {
      data.stats.today = 0;
      data.lastActiveDate = today;
    }
    
    // Load manual intervention stats
    manualInterventionStats = data.manualInterventionStats || manualInterventionStats;
    
    // Save initial state
    chrome.storage.local.set({ 
      stats: data.stats,
      lastActiveDate: today,
      jobQueue: data.jobQueue,
      currentJobIndex: data.currentJobIndex,
      isProcessing: false,
      jobProcessingStatus: 'idle',
      manualInterventionStats: manualInterventionStats
    });
    
    // Load queue from storage
    jobQueue = data.jobQueue || [];
    currentJobIndex = data.currentJobIndex || -1;
  });

  // Initialize settings with new defaults
  chrome.storage.local.get({
    debugMode: false,
    autoFillExternal: true,
    saveExternalLinks: true,
    manualInterventionEnabled: true,
    apiKey: '',
    databaseApiSettings: null
  }, (data) => {
    // Set default API key if not present
    if (!data.apiKey) {
      data.apiKey = 'AIzaSyCYPSGmbQT0UhZ_tc9NKCqj8_KatHfLxrs';
    }
    
    // Update database settings to use careergpt.io
    if (!data.databaseApiSettings) {
      data.databaseApiSettings = {
        apiUrl: 'https://careergpt.io/api/v1',
        username: '',
        password: ''
      };
    } else if (data.databaseApiSettings.apiUrl?.includes('app.careergpt.io')) {
      data.databaseApiSettings.apiUrl = data.databaseApiSettings.apiUrl.replace('app.careergpt.io', 'careergpt.io');
    }
    
    chrome.storage.local.set({ 
      debugMode: data.debugMode,
      autoFillExternal: data.autoFillExternal,
      saveExternalLinks: data.saveExternalLinks,
      manualInterventionEnabled: data.manualInterventionEnabled,
      apiKey: data.apiKey,
      databaseApiSettings: data.databaseApiSettings
    });
  });
});

/**
 * External Application Tracking
 */

// Track external application attempt
function trackExternalApplication(applicationData) {
  console.log("Tracking external application:", applicationData);
  
  externalApplications.pending.push({
    ...applicationData,
    id: Date.now().toString(),
    startTime: new Date().toISOString()
  });
  
  // Save to storage
  chrome.storage.local.set({ externalApplications });
}

// Update external application status
function updateExternalApplicationStatus(applicationId, status, details = {}) {
  const pendingIndex = externalApplications.pending.findIndex(app => app.id === applicationId);
  
  if (pendingIndex !== -1) {
    const application = externalApplications.pending[pendingIndex];
    application.endTime = new Date().toISOString();
    application.status = status;
    application.details = details;
    
    // Move to appropriate list
    externalApplications.pending.splice(pendingIndex, 1);
    
    if (status === 'completed') {
      externalApplications.completed.push(application);
    } else {
      externalApplications.failed.push(application);
    }
    
    // Keep lists manageable
    externalApplications.completed = externalApplications.completed.slice(-50);
    externalApplications.failed = externalApplications.failed.slice(-50);
    
    // Save to storage
    chrome.storage.local.set({ externalApplications });
  }
}

/**
 * Manual Intervention Statistics
 */

// Update manual intervention statistics
function updateManualInterventionStats(interventionData) {
  console.log("Updating manual intervention statistics");
  
  manualInterventionStats.totalInterventions += 1;
  
  // Track field types that required manual intervention
  if (interventionData.fields) {
    interventionData.fields.forEach(field => {
      const fieldType = field.type || 'unknown';
      manualInterventionStats.fieldTypes[fieldType] = (manualInterventionStats.fieldTypes[fieldType] || 0) + 1;
    });
  }
  
  // Track common issues
  if (interventionData.reason) {
    const existingIssue = manualInterventionStats.commonIssues.find(issue => issue.type === interventionData.reason);
    if (existingIssue) {
      existingIssue.count += 1;
    } else {
      manualInterventionStats.commonIssues.push({
        type: interventionData.reason,
        count: 1,
        lastSeen: new Date().toISOString()
      });
    }
  }
  
  // Save updated stats
  chrome.storage.local.set({ manualInterventionStats });
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message.action);
  
  if (message.action === 'ping') {
    sendResponse({status: 'ok', timestamp: new Date().toISOString()});
    return true;
  }
  
  if (message.action === 'trackExternalApplication') {
    trackExternalApplication(message.data);
    sendResponse({status: 'tracked', id: externalApplications.pending[externalApplications.pending.length - 1].id});
    return true;
  }
  
  if (message.action === 'updateExternalApplication') {
    updateExternalApplicationStatus(message.id, message.status, message.details);
    sendResponse({status: 'updated'});
    return true;
  }
  
  if (message.action === 'applicationSubmitted') {
    // Update stats
    chrome.storage.local.get({
      stats: { 
        today: 0, 
        total: 0, 
        success: 0, 
        easyApply: 0, 
        external: 0, 
        externalLinks: [],
        manualInterventions: 0
      }
    }, (data) => {
      data.stats.today += 1;
      data.stats.total += 1;
      
      if (message.success) {
        data.stats.success += 1;
        
        // Track application type
        if (message.isEasyApply) {
          data.stats.easyApply += 1;
        } else {
          data.stats.external += 1;
          
          // Save external application link if available and enabled
          if (message.applicationLink) {
            chrome.storage.local.get({
              saveExternalLinks: true
            }, (settings) => {
              if (settings.saveExternalLinks) {
                // Add the link to the saved list
                if (!data.stats.externalLinks) {
                  data.stats.externalLinks = [];
                }
                
                // Add link with timestamp and job info
                data.stats.externalLinks.push({
                  url: message.applicationLink,
                  timestamp: new Date().toISOString(),
                  jobTitle: message.jobTitle || '',
                  companyName: message.companyName || '',
                  autoFilled: message.isExternal || false
                });
                
                // Limit the number of saved links to prevent storage issues
                if (data.stats.externalLinks.length > 100) {
                  data.stats.externalLinks = data.stats.externalLinks.slice(-100);
                }
                
                chrome.storage.local.set({ stats: data.stats });
              }
            });
          }
        }
        
        // Track manual interventions if any
        if (message.manualInterventions > 0) {
          data.stats.manualInterventions += message.manualInterventions;
        }
      }
      
      chrome.storage.local.set({ stats: data.stats });
      sendResponse({status: 'stats_updated'});
    });
    return true;
  }
  
  if (message.action === 'logDebug' && message.data) {
    // Check if debug mode is enabled
    chrome.storage.local.get({
      debugMode: false
    }, (data) => {
      if (data.debugMode) {
        console.log('LinkedIn Auto Apply Debug:', message.data);
      }
      if (sendResponse) sendResponse({status: 'logged'});
    });
    return true;
  }
  
  if (message.action === 'saveAgentMemory' && message.memory) {
    // Save agent's memory/state for later use
    chrome.storage.local.set({ 
      agentMemory: message.memory,
      lastAgentUpdateTime: new Date().toISOString()
    }, () => {
      console.log('Agent memory saved to storage');
      if (sendResponse) sendResponse({status: 'ok'});
    });
    return true;
  }
  
  if (message.action === 'getAgentMemory') {
    // Retrieve agent's memory/state
    chrome.storage.local.get({
      agentMemory: null,
      lastAgentUpdateTime: null
    }, (data) => {
      console.log('Sending agent memory to content script');
      if (sendResponse) sendResponse(data);
    });
    return true;
  }
  
  if (message.action === 'recordManualIntervention') {
    // Record manual intervention statistics
    updateManualInterventionStats(message.data);
    sendResponse({status: 'recorded'});
    return true;
  }
  
  if (message.action === 'getManualInterventionStats') {
    // Get manual intervention statistics
    sendResponse({
      stats: manualInterventionStats,
      status: 'ok'
    });
    return true;
  }
  
  if (message.action === 'injectScripts' && message.tabId) {
    chrome.scripting.executeScript({
      target: { tabId: message.tabId },
      files: ['siteDetector.js', 'jobSiteStrategy.js', 'formAnalyzer.js', 'database-api.js', 'agent.js', 'content.js']
    }).then(() => {
      console.log("Scripts injected successfully to tab:", message.tabId);
      if (sendResponse) sendResponse({status: 'ok'});
    }).catch(err => {
      console.error("Error injecting scripts:", err);
      if (sendResponse) sendResponse({status: 'error', message: err.message});
    });
    return true;
  }
  
  // Always return true if you want to send a response asynchronously
  return true;
});

// Force-inject content scripts on supported pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const injectScripts = (files) => {
      // Inject scripts in order
      let promise = Promise.resolve();
      files.forEach(file => {
        promise = promise.then(() => 
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: [file]
          }).then(() => {
            console.log(`${file} injected successfully`);
          }).catch(err => {
            console.error(`Error injecting ${file}:`, err);
          })
        );
      });
      return promise;
    };
    
    // Check for CareerGPT pages
    if (tab.url.includes('careergpt.io')) {
      console.log("CareerGPT page detected, injecting scripts...");
      injectScripts([
        'siteDetector.js',
        'jobSiteStrategy.js',
        'formAnalyzer.js',
        'database-api.js',
        'agent.js',
        'content.js'
      ]);
    }
    // Check for LinkedIn pages
    else if (tab.url.includes('linkedin.com')) {
      console.log("LinkedIn page detected, injecting scripts...");
      injectScripts([
        'siteDetector.js',
        'jobSiteStrategy.js',
        'formAnalyzer.js',
        'database-api.js',
        'agent.js',
        'content.js'
      ]);
    }
    // Check for potential external application pages (only if explicitly pending)
    else {
      chrome.storage.local.get(['pendingExternalApplication', 'autoFillExternal'], (result) => {
        // Only inject on external sites if we have a specific pending application AND it matches
        if (result.autoFillExternal && result.pendingExternalApplication && 
            result.pendingExternalApplication.timestamp && 
            (Date.now() - new Date(result.pendingExternalApplication.timestamp).getTime()) < 300000) { // 5 minutes
          
          const pendingApp = result.pendingExternalApplication;
          const currentDomain = new URL(tab.url).hostname;
          const expectedDomain = new URL(pendingApp.url).hostname;
          
          // Only inject if domains match exactly or very specific company name match
          if (currentDomain === expectedDomain || 
              (pendingApp.company && pendingApp.company.length > 3 && 
               tab.url.toLowerCase().includes(pendingApp.company.toLowerCase().replace(/\s+/g, '')))) {
            console.log("Valid external application tab detected, injecting scripts...");
            injectScripts([
              'siteDetector.js',
              'jobSiteStrategy.js',
              'formAnalyzer.js',
              'agent.js',
              'content.js'
            ]);
          } else {
            console.log("External tab doesn't match pending application, skipping injection");
          }
        } else {
          console.log("No valid pending external application, skipping script injection");
        }
      });
    }
  }
});