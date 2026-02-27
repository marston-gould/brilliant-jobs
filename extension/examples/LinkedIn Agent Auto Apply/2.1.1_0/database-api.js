// database-api.js - Database Connection Module with CareerGPT Integration
console.log("==== DATABASE API MODULE LOADED ====");

// Prevent multiple loading by checking and early exit
if (window.DatabaseAPI) {
  console.log("⚠️ DatabaseAPI already loaded, skipping redeclaration");
} else {

/**
 * DatabaseAPI - Handles communication with CareerGPT database system
 * Provides resume data and job preferences for the agent system
 */
class DatabaseAPIClass {
  constructor(settings) {
    this.settings = settings || {};
    // Updated to use careergpt.io domain
    this.apiUrl = settings.apiUrl || 'https://careergpt.io/api/v1';
    this.apiKey = settings.apiKey || '';
    this.token = settings.token || '';
    this.isAuthenticated = !!this.token;
    this.userId = settings.userId || '';
    this.username = settings.username || '';
    this.password = settings.password || '';
    
    this.log("Database API initialized");
  }
  
  log(message, data = null) {
    const logMessage = data ? `Database API: ${message} ${JSON.stringify(data)}` : `Database API: ${message}`;
    console.log(logMessage);
    
    // Send to background script for persistent logging
    try {
      chrome.runtime.sendMessage({
        action: 'logDebug',
        data: logMessage
      });
    } catch (e) {
      // Ignore errors when not in extension context
    }
  }
  
  /**
   * Authenticate with the CareerGPT API
   */
  async authenticate(credentials = null) {
    try {
      if (this.isAuthenticated) {
        this.log("Already authenticated");
        return true;
      }
      
      // Use stored credentials if not provided
      if (!credentials) {
        credentials = {
          email: this.username,
          password: this.password
        };
      }
      
      if (!credentials.email || !credentials.password) {
        this.log("No credentials provided");
        return false;
      }
      
      this.log("Authenticating with CareerGPT API");
      
      const response = await fetch(`${this.apiUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password
        })
      });
      
      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.token || data.accessToken) {
        this.token = data.token || data.accessToken;
        this.userId = data.user?.id || data.userId || this.userId;
        this.isAuthenticated = true;
        
        // Save token to settings
        this.saveSettings();
        
        this.log("Authentication successful", { userId: this.userId });
        return true;
      } else {
        throw new Error("No token returned from authentication");
      }
    } catch (error) {
      this.log("Authentication error", { error: error.toString() });
      return false;
    }
  }
  
  /**
   * Save authentication and settings data
   */
  saveSettings() {
    try {
      const settings = {
        apiUrl: this.apiUrl,
        apiKey: this.apiKey,
        token: this.token,
        userId: this.userId,
        username: this.username
      };
      
      chrome.storage.local.set({ databaseApiSettings: settings }, () => {
        this.log("Settings saved to storage");
      });
    } catch (e) {
      this.log("Error saving settings", { error: e.toString() });
    }
  }
  
  /**
   * Get user profile data from the database
   */
  async getUserProfile() {
    try {
      if (!this.isAuthenticated) {
        const authenticated = await this.authenticate();
        if (!authenticated) {
          throw new Error("Not authenticated");
        }
      }
      
      this.log("Fetching user profile");
      
      const response = await fetch(`${this.apiUrl}/user/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Profile fetch failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      this.log("User profile fetched", { 
        hasProfile: !!data,
        fields: data ? Object.keys(data) : []
      });
      
      return data;
    } catch (error) {
      this.log("Error fetching user profile", { error: error.toString() });
      return null;
    }
  }
  
  /**
   * Get resume data from the database
   */
  async getResumeData(resumeId = null) {
    try {
      if (!this.isAuthenticated) {
        const authenticated = await this.authenticate();
        if (!authenticated) {
          throw new Error("Not authenticated");
        }
      }
      
      let url = `${this.apiUrl}/resume`;
      if (resumeId) {
        url += `/${resumeId}`;
      }
      
      this.log("Fetching resume data", { url });
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Resume fetch failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      this.log("Resume data fetched", { 
        size: JSON.stringify(data).length,
        fields: Object.keys(data)
      });
      
      return data;
    } catch (error) {
      this.log("Error fetching resume data", { error: error.toString() });
      return null;
    }
  }
  
  /**
   * Get job application preferences from the database
   */
  async getApplicationPreferences() {
    try {
      if (!this.isAuthenticated) {
        const authenticated = await this.authenticate();
        if (!authenticated) {
          throw new Error("Not authenticated");
        }
      }
      
      this.log("Fetching application preferences");
      
      const response = await fetch(`${this.apiUrl}/user/preferences`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Preferences fetch failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      this.log("Application preferences fetched", { 
        preferences: Object.keys(data)
      });
      
      return data;
    } catch (error) {
      this.log("Error fetching application preferences", { error: error.toString() });
      return null;
    }
  }
  
  /**
   * Get job queue from the database
   */
  async getJobQueue() {
    try {
      if (!this.isAuthenticated) {
        const authenticated = await this.authenticate();
        if (!authenticated) {
          throw new Error("Not authenticated");
        }
      }
      
      this.log("Fetching job queue");
      
      const response = await fetch(`${this.apiUrl}/jobs/queue`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Job queue fetch failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      this.log("Job queue fetched", { 
        count: Array.isArray(data) ? data.length : 0
      });
      
      return Array.isArray(data) ? data : [];
    } catch (error) {
      this.log("Error fetching job queue", { error: error.toString() });
      return [];
    }
  }
  
  /**
   * Update job status in the database
   */
  async updateJobStatus(jobId, status, details = {}) {
    try {
      if (!this.isAuthenticated) {
        const authenticated = await this.authenticate();
        if (!authenticated) {
          throw new Error("Not authenticated");
        }
      }
      
      this.log("Updating job status", { jobId, status });
      
      const response = await fetch(`${this.apiUrl}/jobs/${jobId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          status,
          timestamp: new Date().toISOString(),
          ...details
        })
      });
      
      if (!response.ok) {
        throw new Error(`Job status update failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      this.log("Job status updated", { 
        jobId,
        status,
        success: data.success !== false
      });
      
      return data.success !== false;
    } catch (error) {
      this.log("Error updating job status", { error: error.toString() });
      return false;
    }
  }
  
  /**
   * Save manual intervention data for learning
   */
  async saveManualIntervention(jobId, interventionData) {
    try {
      if (!this.isAuthenticated) {
        const authenticated = await this.authenticate();
        if (!authenticated) {
          throw new Error("Not authenticated");
        }
      }
      
      this.log("Saving manual intervention data", { jobId });
      
      const response = await fetch(`${this.apiUrl}/jobs/${jobId}/intervention`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          ...interventionData,
          timestamp: new Date().toISOString()
        })
      });
      
      if (!response.ok) {
        this.log("Manual intervention save failed, but continuing", { status: response.status });
        return false;
      }
      
      const data = await response.json();
      
      this.log("Manual intervention data saved", { 
        jobId,
        success: data.success !== false
      });
      
      return data.success !== false;
    } catch (error) {
      this.log("Error saving manual intervention data", { error: error.toString() });
      return false;
    }
  }
  
  /**
   * Test connection to the database
   */
  async testConnection() {
    try {
      this.log("Testing database connection");
      
      const response = await fetch(`${this.apiUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      
      this.log("Database connection test successful");
      return true;
    } catch (error) {
      this.log("Database connection test failed", { error: error.toString() });
      return false;
    }
  }
}

// Export the API for use in other scripts
window.DatabaseAPI = DatabaseAPIClass;

// Initialize DB API if in extension context
if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.local.get('databaseApiSettings', (data) => {
    if (data.databaseApiSettings) {
      window.dbApi = new DatabaseAPIClass(data.databaseApiSettings);
      console.log("Database API initialized from stored settings");
    } else {
      // Initialize with default careergpt.io domain
      window.dbApi = new DatabaseAPIClass({
        apiUrl: 'https://careergpt.io/api/v1'
      });
      console.log("Database API initialized with default settings");
    }
  });
}
}