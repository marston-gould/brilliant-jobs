// popup.js - Simplified version without API Config and About tabs
document.addEventListener('DOMContentLoaded', function() {
  // DOM elements
  const enableAutoApplyToggle = document.getElementById('enable-auto-apply');
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  // Settings tab elements
  const delayInput = document.getElementById('delay-input');
  const maxQuestionsSelect = document.getElementById('max-questions');
  const keywordFilterInput = document.getElementById('keyword-filter');
  const manualInterventionToggle = document.getElementById('manual-intervention-enabled');
  const autoFillExternalToggle = document.getElementById('auto-fill-external');
  const saveExternalLinksToggle = document.getElementById('save-external-links');
  const debugModeToggle = document.getElementById('debug-mode');
  const saveSettingsButton = document.getElementById('save-settings');
  const settingsNotification = document.getElementById('settings-notification');
  
  // User Profile tab elements
  const fullNameInput = document.getElementById('full-name');
  const emailInput = document.getElementById('email');
  const phoneInput = document.getElementById('phone');
  const locationInput = document.getElementById('location');
  const experienceYearsInput = document.getElementById('experience-years');
  const educationSelect = document.getElementById('education');
  const skillsTextarea = document.getElementById('skills');
  const saveProfileButton = document.getElementById('save-profile');
  const profileNotification = document.getElementById('profile-notification');
  
  // Resume upload elements
  const resumeUpload = document.getElementById('resume-upload');
  const resumeStatus = document.getElementById('resume-status');
  const extractResumeDataButton = document.getElementById('extract-resume-data');
  const resumeDataPreview = document.getElementById('resume-data-preview');
  const previewContent = document.getElementById('preview-content');
  
  // Stats elements
  const statToday = document.getElementById('stat-today');
  const statTotal = document.getElementById('stat-total');
  const statEasyApply = document.getElementById('stat-easy-apply');
  const statExternal = document.getElementById('stat-external');
  const statInterventions = document.getElementById('stat-interventions');
  const statSuccessRate = document.getElementById('stat-success-rate');
  const statAutomationRate = document.getElementById('stat-automation-rate');
  
  // Initialize
  loadSettings();
  loadUserProfile();
  loadStatistics();
  initializeDatabase();
  
  // Tab navigation
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Show active content
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === tabName) {
          content.classList.add('active');
        }
      });
    });
  });
  
  // Event listeners
  saveSettingsButton.addEventListener('click', saveSettings);
  saveProfileButton.addEventListener('click', saveUserProfile);
  
  // Auto-apply toggle listener
  enableAutoApplyToggle.addEventListener('change', function() {
    console.log("Auto-apply toggle changed:", this.checked);
    
    // Save the setting immediately
    chrome.storage.local.set({ autoApplyEnabled: this.checked }, function() {
      console.log("Auto-apply setting saved:", this.checked);
      
      // Show feedback to user
      const message = this.checked ? 
        'Auto-apply enabled! However, for safety, you still need to manually click the extension indicator on LinkedIn job pages.' :
        'Auto-apply disabled. You can still manually click the extension indicator to apply to jobs.';
        
      showNotification(settingsNotification, message, 'info');
    }.bind(this));
  });
  
  // Resume upload event listeners
  resumeUpload.addEventListener('change', handleResumeUpload);
  extractResumeDataButton.addEventListener('click', extractResumeData);
  
  // Initialize database with hardcoded settings
  function initializeDatabase() {
    // Set default API key and database settings
    const defaultSettings = {
      apiKey: 'AIzaSyCYPSGmbQT0UhZ_tc9NKCqj8_KatHfLxrs',
      databaseApiSettings: {
        apiUrl: 'https://careergpt.io/api/v1',
        username: '',
        password: ''
      }
    };
    
    // Only set if not already configured
    chrome.storage.local.get(['apiKey', 'databaseApiSettings'], function(result) {
      if (!result.apiKey) {
        chrome.storage.local.set({ apiKey: defaultSettings.apiKey });
      }
      if (!result.databaseApiSettings) {
        chrome.storage.local.set({ databaseApiSettings: defaultSettings.databaseApiSettings });
      }
    });
  }
  
  // Load settings from storage
  function loadSettings() {
    chrome.storage.local.get([
      'autoApplyEnabled',
      'applyDelay',
      'maxQuestions',
      'keywordFilter',
      'manualInterventionEnabled',
      'autoFillExternal',
      'saveExternalLinks',
      'debugMode'
    ], function(result) {
      enableAutoApplyToggle.checked = result.autoApplyEnabled || false;
      delayInput.value = result.applyDelay || 5;
      maxQuestionsSelect.value = result.maxQuestions || 5;
      keywordFilterInput.value = result.keywordFilter || '';
      manualInterventionToggle.checked = result.manualInterventionEnabled !== false;
      autoFillExternalToggle.checked = result.autoFillExternal !== false;
      saveExternalLinksToggle.checked = result.saveExternalLinks !== false;
      debugModeToggle.checked = result.debugMode || false;
    });
  }
  
  // Load user profile from storage
  function loadUserProfile() {
    chrome.storage.local.get(['userProfile', 'resumeFile'], function(result) {
      const profile = result.userProfile || {};
      
      fullNameInput.value = profile.fullName || '';
      emailInput.value = profile.email || '';
      phoneInput.value = profile.phone || '';
      locationInput.value = profile.location || '';
      experienceYearsInput.value = profile.experience || '';
      educationSelect.value = profile.education || '';
      skillsTextarea.value = profile.skills || '';
      
      // Show resume status if file exists
      if (result.resumeFile) {
        resumeStatus.textContent = `Resume uploaded: ${result.resumeFile.name} (${(result.resumeFile.size / 1024).toFixed(1)} KB)`;
        resumeStatus.style.color = '#28a745';
        extractResumeDataButton.disabled = false;
      }
    });
  }
  
  // Load statistics
  function loadStatistics() {
    chrome.storage.local.get(['stats'], function(result) {
      const stats = result.stats || {
        today: 0,
        total: 0,
        success: 0,
        easyApply: 0,
        external: 0,
        manualInterventions: 0
      };
      
      statToday.textContent = stats.today || 0;
      statTotal.textContent = stats.total || 0;
      statEasyApply.textContent = stats.easyApply || 0;
      statExternal.textContent = stats.external || 0;
      statInterventions.textContent = stats.manualInterventions || 0;
      
      // Calculate rates
      const total = stats.total || 0;
      const success = stats.success || 0;
      const interventions = stats.manualInterventions || 0;
      
      const successRate = total > 0 ? Math.round((success / total) * 100) : 0;
      const automationRate = total > 0 ? Math.round(((total - interventions) / total) * 100) : 0;
      
      statSuccessRate.textContent = successRate + '%';
      statAutomationRate.textContent = automationRate + '%';
    });
  }
  
  // Save settings
  function saveSettings() {
    const settings = {
      autoApplyEnabled: enableAutoApplyToggle.checked,
      applyDelay: parseInt(delayInput.value) || 5,
      maxQuestions: parseInt(maxQuestionsSelect.value) || 5,
      keywordFilter: keywordFilterInput.value.trim(),
      manualInterventionEnabled: manualInterventionToggle.checked,
      autoFillExternal: autoFillExternalToggle.checked,
      saveExternalLinks: saveExternalLinksToggle.checked,
      debugMode: debugModeToggle.checked
    };
    
    chrome.storage.local.set(settings, function() {
      showNotification(settingsNotification, 'Settings saved successfully!', 'success');
    });
  }
  
  // Save user profile
  function saveUserProfile() {
    const userProfile = {
      fullName: fullNameInput.value.trim(),
      email: emailInput.value.trim(),
      phone: phoneInput.value.trim(),
      location: locationInput.value.trim(),
      experience: experienceYearsInput.value,
      education: educationSelect.value,
      skills: skillsTextarea.value.trim()
    };
    
    chrome.storage.local.set({ userProfile }, function() {
      showNotification(profileNotification, 'Profile saved successfully!', 'success');
    });
  }
  
  // Handle resume file upload
  function handleResumeUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file type
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      resumeStatus.textContent = 'Please upload a PDF or Word document';
      resumeStatus.style.color = '#dc3545';
      return;
    }
    
    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      resumeStatus.textContent = 'File size must be less than 5MB';
      resumeStatus.style.color = '#dc3545';
      return;
    }
    
    // Read file as base64
    const reader = new FileReader();
    reader.onload = function(e) {
      const resumeFile = {
        name: file.name,
        type: file.type,
        size: file.size,
        data: e.target.result,
        uploadDate: new Date().toISOString()
      };
      
      // Store in Chrome storage
      chrome.storage.local.set({ resumeFile }, function() {
        resumeStatus.textContent = `Resume uploaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        resumeStatus.style.color = '#28a745';
        extractResumeDataButton.disabled = false;
        showNotification(profileNotification, 'Resume uploaded successfully!', 'success');
      });
    };
    
    reader.readAsDataURL(file);
  }
  
  // Extract data from resume using AI
  async function extractResumeData() {
    extractResumeDataButton.disabled = true;
    extractResumeDataButton.textContent = 'Extracting...';
    resumeStatus.textContent = 'Starting resume analysis...';
    resumeStatus.style.color = '#007bff';
    
    try {
      chrome.storage.local.get(['resumeFile', 'apiKey'], async function(result) {
        if (!result.resumeFile) {
          showNotification(profileNotification, 'No resume file found', 'error');
          resetExtractionButton();
          return;
        }
        
        resumeStatus.textContent = 'Extracting text from PDF...';
        const apiKey = result.apiKey || 'AIzaSyCYPSGmbQT0UhZ_tc9NKCqj8_KatHfLxrs';
        
        try {
          const extractedData = await extractResumeTextData(result.resumeFile, apiKey);
          
          if (extractedData) {
            resumeStatus.textContent = 'Resume data extracted successfully!';
            resumeStatus.style.color = '#28a745';
            
            // Populate form fields with extracted data (only if fields are empty)
            if (extractedData.fullName && !fullNameInput.value) {
              fullNameInput.value = extractedData.fullName;
            }
            if (extractedData.email && !emailInput.value) {
              emailInput.value = extractedData.email;
            }
            if (extractedData.phone && !phoneInput.value) {
              phoneInput.value = extractedData.phone;
            }
            if (extractedData.location && !locationInput.value) {
              locationInput.value = extractedData.location;
            }
            if (extractedData.experience && !experienceYearsInput.value) {
              experienceYearsInput.value = extractedData.experience;
            }
            if (extractedData.education && !educationSelect.value) {
              // Map extracted education to dropdown values
              const mappedEducation = mapEducationLevel(extractedData.education);
              educationSelect.value = mappedEducation;
              console.log(`Education mapping: "${extractedData.education}" → "${mappedEducation}"`);
            }
            if (extractedData.skills && extractedData.skills.length > 0 && !skillsTextarea.value) {
              skillsTextarea.value = extractedData.skills.join(', ');
            }
            
            // Show preview with better formatting
            const skillsPreview = extractedData.skills && extractedData.skills.length > 0 ? 
              extractedData.skills.slice(0, 5).join(', ') + (extractedData.skills.length > 5 ? '...' : '') : 
              'None found';
              
            previewContent.innerHTML = `
              <div><strong>Name:</strong> ${extractedData.fullName || 'Not found'}</div>
              <div><strong>Email:</strong> ${extractedData.email || 'Not found'}</div>
              <div><strong>Phone:</strong> ${extractedData.phone || 'Not found'}</div>
              <div><strong>Location:</strong> ${extractedData.location || 'Not found'}</div>
              <div><strong>Experience:</strong> ${extractedData.experience || 'Not specified'} years</div>
              <div><strong>Education:</strong> ${extractedData.education || 'Not found'}</div>
              <div><strong>Skills:</strong> ${skillsPreview}</div>
            `;
            resumeDataPreview.style.display = 'block';
            
            showNotification(profileNotification, 'Resume data extracted successfully!', 'success');
          } else {
            resumeStatus.textContent = 'Could not extract data from resume';
            resumeStatus.style.color = '#dc3545';
            showNotification(profileNotification, 'Failed to extract resume data. Please check the file and try again.', 'error');
          }
        } catch (error) {
          console.error('Error during extraction:', error);
          resumeStatus.textContent = 'Error during extraction: ' + error.message;
          resumeStatus.style.color = '#dc3545';
          showNotification(profileNotification, 'Error extracting resume data: ' + error.message, 'error');
        }
        
        resetExtractionButton();
      });
    } catch (error) {
      console.error('Error extracting resume data:', error);
      resumeStatus.textContent = 'Error: ' + error.message;
      resumeStatus.style.color = '#dc3545';
      showNotification(profileNotification, 'Error extracting resume data', 'error');
      resetExtractionButton();
    }
  }
  
  // Helper function to reset the extraction button
  function resetExtractionButton() {
    extractResumeDataButton.disabled = false;
    extractResumeDataButton.textContent = 'Extract Data from Resume';
  }
  
  // Map extracted education levels to dropdown values
  function mapEducationLevel(education) {
    if (!education) return '';
    
    const educationLower = education.toLowerCase().trim();
    
    // Map various education formats to dropdown values
    const educationMappings = {
      // High School variations
      'high school': 'high-school',
      'highschool': 'high-school',
      'secondary school': 'high-school',
      'diploma': 'high-school',
      'ged': 'high-school',
      
      // Associate Degree variations
      'associate': 'associate',
      'associates': 'associate',
      'associate degree': 'associate',
      'associates degree': 'associate',
      'aa': 'associate',
      'as': 'associate',
      'aas': 'associate',
      'community college': 'associate',
      
      // Bachelor's Degree variations
      'bachelor': 'bachelor',
      'bachelors': 'bachelor',
      'bachelor\'s': 'bachelor',
      'bachelor degree': 'bachelor',
      'bachelor\'s degree': 'bachelor',
      'bachelors degree': 'bachelor',
      'ba': 'bachelor',
      'bs': 'bachelor',
      'bsc': 'bachelor',
      'b.a': 'bachelor',
      'b.s': 'bachelor',
      'b.sc': 'bachelor',
      'undergraduate': 'bachelor',
      
      // Master's Degree variations
      'master': 'master',
      'masters': 'master',
      'master\'s': 'master',
      'master degree': 'master',
      'master\'s degree': 'master',
      'masters degree': 'master',
      'ma': 'master',
      'ms': 'master',
      'msc': 'master',
      'm.a': 'master',
      'm.s': 'master',
      'm.sc': 'master',
      'mba': 'master',
      'graduate': 'master',
      'postgraduate': 'master',
      
      // PhD variations
      'phd': 'phd',
      'ph.d': 'phd',
      'doctorate': 'phd',
      'doctoral': 'phd',
      'doctor': 'phd',
      'postdoc': 'phd',
      'postdoctoral': 'phd'
    };
    
    // Try exact match first
    if (educationMappings[educationLower]) {
      return educationMappings[educationLower];
    }
    
    // Try partial matches
    for (const [key, value] of Object.entries(educationMappings)) {
      if (educationLower.includes(key) || key.includes(educationLower)) {
        return value;
      }
    }
    
    // Default to bachelor if we can't determine
    return 'bachelor';
  }
  
  // Extract text data from resume file
  async function extractResumeTextData(resumeFile, apiKey) {
    try {
      let extractedText = '';
      
      // First, extract text from the PDF/document
      if (resumeFile.type === 'application/pdf') {
        // For PDF files, try to extract text using a proper PDF.js-based approach
        extractedText = await extractTextFromPDF(resumeFile);
      } else {
        // For other document types, we'll need a different approach
        console.log("Non-PDF document types not fully supported yet");
        return getFallbackResumeData(resumeFile?.name || '');
      }
      
      console.log("Extracted text length:", extractedText.length);
      console.log("First 500 characters:", extractedText.substring(0, 500));
      
      // ENHANCED DEBUGGING: Show more details about what was extracted
      console.log("🔍 === RESUME TEXT EXTRACTION ANALYSIS ===");
      console.log("📄 File name:", resumeFile.name);
      console.log("📊 Extracted text stats:");
      console.log("  - Total length:", extractedText.length);
      console.log("  - Number of lines:", extractedText.split('\n').length);
      console.log("  - Contains @ symbol:", extractedText.includes('@'));
      console.log("  - Contains phone pattern:", /\d{3}/.test(extractedText));
      console.log("  - Contains common name patterns:", /[A-Z][a-z]+ [A-Z][a-z]+/.test(extractedText));
      console.log("  - Contains 'experience':", extractedText.toLowerCase().includes('experience'));
      console.log("  - Contains 'education':", extractedText.toLowerCase().includes('education'));
      console.log("  - Contains 'skills':", extractedText.toLowerCase().includes('skills'));
      
      console.log("📝 First 1000 characters of extracted text:");
      console.log(extractedText.substring(0, 1000));
      console.log("📝 Last 500 characters of extracted text:");
      console.log(extractedText.substring(Math.max(0, extractedText.length - 500)));
      
      // Look for potential issues
      if (extractedText.length < 100) {
        console.log("⚠️ WARNING: Very short text extracted - likely PDF parsing issue");
      }
      if (!extractedText.includes('@') && !extractedText.match(/\d{3}/)) {
        console.log("⚠️ WARNING: No email or phone patterns found - might be extraction issue");
      }
      
      // If we have very little text, try a different approach
      if (!extractedText || extractedText.trim().length < 100) {
        console.log("Limited text extracted, using filename-based analysis with AI help");
        
        // Use filename and basic info with AI to make educated guesses
        const prompt = `You are a resume analysis expert. I have a resume file named "${resumeFile.name}" but could only extract limited text due to PDF formatting. 

Based on the filename and any available text fragments, please provide your best educated guess for the missing information in JSON format:

Available text fragments: "${extractedText}"
Filename: "${resumeFile.name}"

Please analyze and return a JSON object with realistic placeholder values based on the filename pattern and common resume information:

{
  "fullName": "Extract from filename or use realistic name",
  "email": "Generate realistic email based on name",
  "phone": "Common phone format like (555) 123-4567",
  "location": "Common location format",
  "experience": "Reasonable number 1-10",
  "education": "Bachelor's Degree",
  "skills": ["JavaScript", "Python", "React"]
}

Make reasonable assumptions based on the filename "${resumeFile.name}". Return only valid JSON.`;

        return await callGeminiForExtraction(prompt, apiKey);
      }
      
      // We have sufficient text, proceed with normal extraction
      const prompt = `You are an expert resume parser. Extract ONLY REAL information from this resume text.

CRITICAL REQUIREMENTS:
1. Extract ONLY ACTUAL information from the text - DO NOT use placeholder data
2. For location: Find the REAL city and state in the resume. DO NOT use generic locations like "Anytown, CA" or "City, State"
3. For experience: Look for ACTUAL years mentioned or calculate from job start/end dates
4. If information is not found in the text, return empty string "" - DO NOT make up data

FILENAME: ${resumeFile.name}

RESUME TEXT (length: ${extractedText.length} characters):
${extractedText.substring(0, 8000)} ${extractedText.length > 8000 ? '\n[TEXT TRUNCATED DUE TO LENGTH]' : ''}

EXTRACTION REQUIREMENTS:
- fullName: Look for the person's name (usually at top, might be in format like "JOHN ANDERSON", "John Anderson", etc.)
- email: Find email addresses in format like "john@email.com"
- phone: Find phone numbers in formats like "(555) 123-4567", "555-123-4567", "555.123.4567"
- location: Find city and state like "San Francisco, CA", "New York, NY", "Los Angeles, California"
- experience: Look for years of experience in ANY of these formats:
  * "X years of experience" or "X+ years experience"
  * "Over X years" or "More than X years"
  * Calculate from employment history (e.g., 2020-2024 = 4 years, 2018-Present = 6 years)
  * Job titles like "Senior Developer" (typically 5+ years)
  * "X years developing/building/working with..."
  * Employment date ranges in format "YYYY-YYYY" or "YYYY-Present"
- education: Find degree information like "Bachelor of Science", "Master's Degree", "PhD", "BA", "BS", "MS", etc.
- skills: Find technical skills, programming languages, tools, frameworks mentioned throughout the resume

IMPORTANT PARSING NOTES:
- Names might be in ALL CAPS or Title Case
- Look for common resume sections: "EXPERIENCE", "EDUCATION", "SKILLS", "CONTACT", etc.
- Dates might be in various formats: "2020-2023", "Jan 2020 - Dec 2023", "2020-Present"
- Skills might be listed in bullet points or comma-separated

If you cannot find real information, use empty string "". Do NOT use placeholder text.

Return ONLY this JSON structure with no additional text:
{
  "fullName": "",
  "email": "",
  "phone": "",
  "location": "",
  "experience": "",
  "education": "",
  "skills": []
}`;

      return await callGeminiForExtraction(prompt, apiKey);
      
    } catch (error) {
      console.error('Error in resume text extraction:', error);
      return getFallbackResumeData(resumeFile?.name || '');
    }
  }
  
  // Helper function to call Gemini API for extraction
  async function callGeminiForExtraction(prompt, apiKey) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.1,
            candidateCount: 1,
            maxOutputTokens: 800 // Increased for more detailed extraction
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} - ${response.statusText}`);
      }
      
      const responseData = await response.json();
      
      if (responseData.error) {
        throw new Error(`Gemini API error: ${responseData.error.message}`);
      }
      
      if (responseData.candidates?.[0]?.content?.parts?.[0]?.text) {
        const textContent = responseData.candidates[0].content.parts[0].text.trim();
        console.log("Raw AI response:", textContent);
        
        // ENHANCED DEBUGGING: Show AI response analysis
        console.log("🤖 === AI RESPONSE ANALYSIS ===");
        console.log("📤 Prompt length sent to AI:", prompt.length);
        console.log("📥 AI response length:", textContent.length);
        console.log("📝 Full AI response:");
        console.log(textContent);
        
        // Try to extract JSON from response
        let jsonContent = textContent;
        
        // Remove markdown formatting if present
        const jsonMatch = textContent.match(/```json\s*([\s\S]*?)\s*```/) || 
                         textContent.match(/```\s*([\s\S]*?)\s*```/) ||
                         textContent.match(/\{[\s\S]*\}/);
                         
        if (jsonMatch) {
          jsonContent = jsonMatch[1] || jsonMatch[0];
          jsonContent = jsonContent.replace(/```json|```/g, '').trim();
          console.log("🔧 Extracted JSON content:", jsonContent);
        } else {
          console.log("⚠️ No JSON formatting found, using raw response");
        }
        
        let parsedData;
        try {
          parsedData = JSON.parse(jsonContent);
          console.log("✅ JSON parsed successfully:", parsedData);
        } catch (parseError) {
          console.error("❌ JSON parsing failed:", parseError);
          console.log("🔧 Attempting to fix common JSON issues...");
          
          // Try to fix common issues
          let fixedJson = jsonContent
            .replace(/'/g, '"') // Replace single quotes with double quotes
            .replace(/(\w+):/g, '"$1":') // Add quotes around keys
            .replace(/,\s*}/g, '}') // Remove trailing commas
            .replace(/,\s*]/g, ']'); // Remove trailing commas in arrays
          
          try {
            parsedData = JSON.parse(fixedJson);
            console.log("✅ JSON fixed and parsed:", parsedData);
          } catch (secondParseError) {
            console.error("❌ JSON still cannot be parsed after fixes:", secondParseError);
            throw new Error("Invalid JSON response from AI");
          }
        }
        
        // Enhanced data cleaning and validation
        const cleanedData = {
          fullName: cleanString(parsedData.fullName),
          email: cleanString(parsedData.email),
          phone: cleanString(parsedData.phone),
          location: enhancedLocationCleaning(parsedData.location, textContent),
          experience: extractYearsOfExperience(parsedData.experience, textContent),
          education: cleanString(parsedData.education),
          skills: extractAndCleanSkills(parsedData.skills, textContent)
        };
        
        console.log("Successfully extracted resume data:", cleanedData);
        
        // ENHANCED DEBUGGING: Show data cleaning results
        console.log("🧹 === DATA CLEANING ANALYSIS ===");
        console.log("📊 Raw AI data:", parsedData);
        console.log("🧹 Cleaned data:", cleanedData);
        console.log("🔍 Field-by-field analysis:");
        console.log("  - fullName: raw='" + (parsedData.fullName || 'null') + "' → cleaned='" + cleanedData.fullName + "'");
        console.log("  - email: raw='" + (parsedData.email || 'null') + "' → cleaned='" + cleanedData.email + "'");
        console.log("  - phone: raw='" + (parsedData.phone || 'null') + "' → cleaned='" + cleanedData.phone + "'");
        console.log("  - location: raw='" + (parsedData.location || 'null') + "' → cleaned='" + cleanedData.location + "'");
        console.log("  - experience: raw='" + (parsedData.experience || 'null') + "' → cleaned='" + cleanedData.experience + "'");
        console.log("  - education: raw='" + (parsedData.education || 'null') + "' → cleaned='" + cleanedData.education + "'");
        console.log("  - skills: raw=" + JSON.stringify(parsedData.skills) + " → cleaned=" + JSON.stringify(cleanedData.skills));
        
        return cleanedData;
        
      } else {
        throw new Error("Unexpected response format from Gemini API");
      }
      
    } catch (error) {
      console.error("Error calling Gemini API:", error);
      return getFallbackResumeData(resumeFile?.name || '');
    }
  }
  
  // Extract text from PDF using PDF.js (proper PDF parsing)
  async function extractTextFromPDF(resumeFile) {
    return new Promise(async (resolve) => {
      try {
        console.log("🔍 Starting proper PDF text extraction...");
        
        // SAFETY: Check file size first
        if (resumeFile.size > 5 * 1024 * 1024) { // 5MB limit
          console.log("File too large for text extraction, using filename analysis only");
          resolve(`Resume file: ${resumeFile.name}\nFile too large for text extraction. Please fill out the form manually.`);
          return;
        }
        
        // Convert base64 to array buffer with safety checks
        const base64Data = resumeFile.data.split(',')[1];
        if (!base64Data || base64Data.length === 0) {
          console.log("Invalid base64 data, using filename analysis only");
          resolve(`Resume file: ${resumeFile.name}\nInvalid file data. Please fill out the form manually.`);
          return;
        }
        
        console.log("📄 Converting PDF data for parsing...");
        
        let binaryString;
        let typedarray;
        
        try {
          binaryString = atob(base64Data);
          typedarray = new Uint8Array(binaryString.length);
          
          for (let i = 0; i < binaryString.length; i++) {
            typedarray[i] = binaryString.charCodeAt(i);
          }
        } catch (conversionError) {
          console.log("Error converting file data:", conversionError.message);
          resolve(`Resume file: ${resumeFile.name}\nFile conversion failed. Please fill out the form manually.`);
          return;
        }
        
        console.log("📄 PDF file size:", typedarray.length, "bytes");
        
        // SAFETY: Set a timeout for the entire extraction process
        const extractionTimeout = setTimeout(() => {
          console.log("⏰ PDF text extraction timed out, using fallback");
          resolve(`Resume file: ${resumeFile.name}\nText extraction timed out. Please fill out the form manually.`);
        }, 15000); // 15 second timeout
        
        try {
          // Try proper PDF parsing first
          if (window.pdfjsLib) {
            console.log("📚 Using PDF.js for proper text extraction...");
            
            const pdf = await window.pdfjsLib.getDocument({
              data: typedarray,
              verbosity: 0 // Reduce logging
            }).promise;
            
            console.log(`📖 PDF loaded successfully! Pages: ${pdf.numPages}`);
            
            let fullText = '';
            const maxPages = Math.min(pdf.numPages, 5); // Limit to first 5 pages for safety
            
            for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
              console.log(`📄 Processing page ${pageNum}/${maxPages}...`);
              
              const page = await pdf.getPage(pageNum);
              const textContent = await page.getTextContent();
              
              // Extract text from page
              const pageText = textContent.items
                .map(item => item.str)
                .join(' ')
                .trim();
              
              if (pageText) {
                fullText += pageText + '\n\n';
                console.log(`✅ Page ${pageNum} extracted: ${pageText.length} characters`);
              }
            }
            
            clearTimeout(extractionTimeout);
            
            if (fullText && fullText.length > 50) {
              console.log("🎉 PDF text extraction successful! Total length:", fullText.length);
              console.log("📝 First 200 characters:", fullText.substring(0, 200));
              resolve(fullText.trim());
              return;
            } else {
              console.log("⚠️ PDF.js extraction yielded insufficient text");
            }
          }
          
          // Fallback to basic extraction if PDF.js not available
          console.log("⚠️ PDF.js not available, trying basic extraction...");
          const extractedText = extractTextBasic(typedarray);
          
          clearTimeout(extractionTimeout);
          
          if (extractedText && extractedText.length > 20) {
            console.log("✅ Basic extraction successful, text length:", extractedText.length);
            resolve(extractedText);
          } else {
            console.log("❌ Basic extraction yielded insufficient text");
            resolve(`Resume file: ${resumeFile.name}\nLimited text extracted. Please verify the extracted information and fill in any missing details manually.`);
          }
          
        } catch (extractionError) {
          clearTimeout(extractionTimeout);
          console.error("❌ Error during PDF text extraction:", extractionError);
          
          // Try the basic fallback method
          console.log("🔄 Trying basic extraction as fallback...");
          try {
            const fallbackText = extractTextBasic(typedarray);
            if (fallbackText && fallbackText.length > 20) {
              console.log("✅ Fallback extraction successful");
              resolve(fallbackText);
            } else {
              console.log("❌ Fallback extraction also failed");
              resolve(`Resume file: ${resumeFile.name}\nText extraction failed. Please fill out the form manually.`);
            }
          } catch (fallbackError) {
            console.error("❌ Fallback extraction also failed:", fallbackError);
            resolve(`Resume file: ${resumeFile.name}\nPDF processing failed. Please fill out the form manually.`);
          }
        }
        
      } catch (error) {
        console.error("❌ Error in PDF extraction setup:", error);
        resolve(`Resume file: ${resumeFile.name}\nPDF processing failed. Please fill out the form manually.`);
      }
    });
  }
  
  // Simplified and safer text extraction from binary data (fallback)
  function extractTextBasic(typedarray) {
    console.log("Using simplified safe text extraction");
    
    try {
      // Early return for very large files to prevent any processing issues
      if (typedarray.length > 1000000) { // 1MB limit
        console.log("File too large for safe processing, skipping text extraction");
        return '';
      }
      
      // Convert binary to text with maximum safety
      console.log("Converting binary data to text safely...");
      let text = '';
      const maxLength = Math.min(typedarray.length, 50000); // Much smaller limit for safety
      
      // Simple character-by-character conversion to avoid any apply() issues
      for (let i = 0; i < maxLength; i++) {
        const char = typedarray[i];
        // Only process printable ASCII characters to avoid issues
        if (char >= 32 && char <= 126) {
          text += String.fromCharCode(char);
        } else if (char === 10 || char === 13) { // Line breaks
          text += '\n';
        } else if (char === 9) { // Tab
          text += ' ';
        }
        
        // Safety break for very long processing
        if (i % 10000 === 0 && i > 0) {
          console.log(`Processed ${i} characters...`);
        }
      }
      
      console.log("Safe text conversion completed, length:", text.length);
      
      // Only do very basic extraction to avoid complex regex issues
      const lines = text.split('\n');
      const extractedTexts = [];
      
      // Simple line-by-line processing with limits
      let processedLines = 0;
      for (const line of lines) {
        if (processedLines >= 100) break; // Hard limit
        
        const cleanLine = line.trim();
        if (cleanLine.length > 5 && cleanLine.length < 100) {
          // Very simple checks for useful content
          if (cleanLine.includes('@') || // Email
              cleanLine.match(/\d{3}/) || // Phone numbers
              cleanLine.match(/[A-Z][a-z]+ [A-Z][a-z]+/) || // Names
              cleanLine.toLowerCase().includes('experience') ||
              cleanLine.toLowerCase().includes('education')) {
            extractedTexts.push(cleanLine);
          }
        }
        processedLines++;
      }
      
      console.log(`Safe extraction found ${extractedTexts.length} useful lines`);
      
      if (extractedTexts.length > 0) {
        const result = extractedTexts.slice(0, 20).join('\n'); // Limit to 20 lines max
        console.log("Safe extraction result length:", result.length);
        return result;
      }
      
      console.log("No useful text extracted from PDF");
      return '';
      
    } catch (error) {
      console.error("Error in safe text extraction:", error);
      return '';
    }
  }
  
  // Clean string helper
  function cleanString(str) {
    if (!str || typeof str !== 'string') return '';
    return str.trim().replace(/^(not found|n\/a|null|undefined)$/i, '');
  }
  
  // Enhanced function to extract years of experience
  function extractYearsOfExperience(aiExtracted, fullText) {
    console.log("🔍 === EXPERIENCE EXTRACTION ANALYSIS ===");
    console.log("AI extracted experience:", aiExtracted);
    
    // First try the AI extracted value - clean it of non-numeric characters
    if (aiExtracted) {
      // Extract just the number from the AI response (handles "5+", "5 years", etc.)
      const cleanedNumber = String(aiExtracted).match(/\d+/);
      if (cleanedNumber) {
        const years = parseInt(cleanedNumber[0]);
        if (years >= 1 && years <= 50) {
          console.log(`✅ Using AI extracted experience: ${years} (cleaned from "${aiExtracted}")`);
          return years.toString();
        }
      }
    }
    
    // Enhanced patterns to find experience in various formats
    const experiencePatterns = [
      // Direct "X years of experience" patterns
      /(\d+)\s*\+?\s*(years?|yrs?)\s*(of\s*)?(experience|exp)/gi,
      /(experience|Experience)\s*:?\s*(\d+)\s*\+?\s*(years?|yrs?)/gi,
      /(\d+)\s*\+?\s*(years?|yrs?)\s*(in|of|with)/gi,
      
      // Professional experience section patterns  
      /professional\s*experience\s*:?\s*(\d+)\s*\+?\s*(years?|yrs?)/gi,
      /work\s*experience\s*:?\s*(\d+)\s*\+?\s*(years?|yrs?)/gi,
      
      // Summary/Objective patterns
      /(\d+)\s*\+?\s*(years?|yrs?)\s*(of\s*)?(professional\s*)?(software|web|full.?stack|frontend|backend|development|programming|coding)/gi,
      /over\s*(\d+)\s*years/gi,
      /more\s*than\s*(\d+)\s*years/gi,
      
      // Job history calculation patterns (look for employment dates)
      /(\d{4})\s*[-–]\s*(\d{4}|present|current)/gi,
      /(\d{4})\s*to\s*(\d{4}|present|current)/gi,
      
      // Experience mentioned in descriptions
      /with\s*(\d+)\s*\+?\s*(years?|yrs?)/gi,
      /(\d+)\s*\+?\s*(years?|yrs?)\s*developing/gi,
      /(\d+)\s*\+?\s*(years?|yrs?)\s*building/gi,
      /(\d+)\s*\+?\s*(years?|yrs?)\s*working/gi,
      
      // Senior/Lead indicators (rough estimates)
      /senior\s*(software|web|full.?stack|frontend|backend|developer|engineer)/gi,
      /lead\s*(software|web|full.?stack|frontend|backend|developer|engineer)/gi,
      /principal\s*(software|web|full.?stack|frontend|backend|developer|engineer)/gi
    ];
    
    console.log("🔍 Searching for experience patterns in text...");
    
    let foundYears = [];
    let employmentYears = [];
    
    for (const pattern of experiencePatterns) {
      const matches = fullText.match(pattern);
      if (matches) {
        console.log(`📍 Pattern "${pattern.source}" found matches:`, matches);
        
        for (const match of matches) {
          // Extract numbers from the match
          const numberMatches = match.match(/\d+/g);
          if (numberMatches) {
            for (const num of numberMatches) {
              const years = parseInt(num);
              
              // Filter realistic experience years (1-50)
              if (years >= 1 && years <= 50) {
                foundYears.push(years);
                console.log(`📊 Found potential experience: ${years} years from "${match}"`);
              }
              
              // Also check if these are employment years for calculation
              if (years >= 1990 && years <= 2024) {
                employmentYears.push(years);
                console.log(`📅 Found employment year: ${years} from "${match}"`);
              }
            }
          }
          
          // Handle senior/lead titles (estimate 5+ years)
          if (/senior|lead|principal/i.test(match) && foundYears.length === 0) {
            foundYears.push(5);
            console.log(`👨‍💼 Senior/Lead title found, estimating 5+ years from "${match}"`);
          }
        }
      }
    }
    
    // Calculate experience from employment years if we have date ranges
    if (employmentYears.length >= 2 && foundYears.length === 0) {
      const sortedYears = employmentYears.sort((a, b) => a - b);
      const earliestYear = sortedYears[0];
      const latestYear = sortedYears[sortedYears.length - 1];
      const calculatedYears = Math.min(latestYear - earliestYear, 30); // Cap at 30 years
      
      if (calculatedYears > 0) {
        foundYears.push(calculatedYears);
        console.log(`📊 Calculated experience from dates: ${calculatedYears} years (${earliestYear} to ${latestYear})`);
      }
    }
    
    if (foundYears.length > 0) {
      // Use the most commonly found value, or the highest reasonable one
      const experienceCount = {};
      foundYears.forEach(years => {
        experienceCount[years] = (experienceCount[years] || 0) + 1;
      });
      
      // Find most frequent, or if tie, use the highest reasonable value
      const mostCommon = Object.keys(experienceCount).reduce((a, b) => 
        experienceCount[a] > experienceCount[b] ? a : b
      );
      
      console.log(`✅ Selected experience: ${mostCommon} years (found ${foundYears.length} potential matches)`);
      return mostCommon;
    }
    
    console.log("❌ No experience patterns found in text");
    return '';
  }
  
  // Enhanced function to extract and clean skills
  function extractAndCleanSkills(aiSkills, fullText) {
    let allSkills = [];
    
    // Add AI extracted skills
    if (Array.isArray(aiSkills)) {
      allSkills = [...aiSkills];
    }
    
    // Extract additional skills from full text
    const skillPatterns = [
      /\b(JavaScript|TypeScript|Java|Python|React|ReactJS|Angular|AngularJS|Vue|VueJS|Node|NodeJS|Express|Django|Flask|Spring|Laravel|PHP|Ruby|Rails|Go|Golang|Swift|Kotlin|Dart|Flutter|React Native)\b/gi,
      /\b(HTML5?|CSS3?|SCSS|Sass|Less|Bootstrap|Tailwind|Material-UI|Ant Design)\b/gi,
      /\b(SQL|MySQL|PostgreSQL|MongoDB|Redis|Elasticsearch|GraphQL|Apollo|Prisma|Sequelize|Mongoose)\b/gi,
      /\b(AWS|Azure|GCP|Google Cloud|Docker|Kubernetes|Jenkins|GitLab|GitHub|Bitbucket|Terraform|Ansible)\b/gi,
      /\b(Git|SVN|Webpack|Vite|Babel|ESLint|Prettier|Jest|Cypress|Selenium|Postman|Swagger)\b/gi,
      /\b(REST|API|JSON|XML|SOAP|Microservices|GraphQL|OAuth|JWT|Firebase|Supabase)\b/gi
    ];
    
    for (const pattern of skillPatterns) {
      const matches = fullText.match(pattern);
      if (matches) {
        allSkills.push(...matches);
      }
    }
    
    // Clean and deduplicate skills
    const cleanedSkills = allSkills
      .map(skill => skill.trim())
      .filter(skill => skill.length > 1)
      .map(skill => {
        // Normalize common variations
        const normalizations = {
          'javascript': 'JavaScript',
          'js': 'JavaScript',
          'typescript': 'TypeScript',
          'ts': 'TypeScript',
          'reactjs': 'React',
          'nodejs': 'Node.js',
          'angularjs': 'Angular',
          'vuejs': 'Vue.js',
          'html5': 'HTML5',
          'css3': 'CSS3'
        };
        
        const lowerSkill = skill.toLowerCase();
        return normalizations[lowerSkill] || skill;
      })
      .filter((skill, index, array) => array.indexOf(skill) === index) // Remove duplicates
      .slice(0, 20); // Limit to 20 skills max
    
    return cleanedSkills;
  }
  
  // Manual data extraction fallback
  function extractDataManually(text) {
    const data = {
      fullName: '',
      email: '',
      phone: '',
      location: '',
      experience: '',
      education: '',
      skills: []
    };
    
    // Extract email
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) data.email = emailMatch[0];
    
    // Extract phone
    const phoneMatch = text.match(/[\+]?[\d\s\-\(\)]{10,}/);
    if (phoneMatch) data.phone = phoneMatch[0].trim();
    
    // Try to extract other fields with basic patterns
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.toLowerCase().includes('experience') && /\d+/.test(line)) {
        const expMatch = line.match(/\d+/);
        if (expMatch) data.experience = expMatch[0];
      }
      
      if (line.toLowerCase().includes('education') || 
          line.toLowerCase().includes('degree') || 
          line.toLowerCase().includes('bachelor') || 
          line.toLowerCase().includes('master')) {
        data.education = line.trim();
      }
    }
    
    return data;
  }
  
  // Enhanced fallback resume data with filename analysis
  function getFallbackResumeData(filename = '') {
    console.log("Using enhanced fallback resume data with filename analysis");
    
    // Try to extract information from filename
    const fileInfo = analyzeFilename(filename);
    
    return {
      fullName: fileInfo.name || '',
      email: '',
      phone: '',
      location: fileInfo.location || '',
      experience: fileInfo.experience || '',
      education: fileInfo.education || '',
      skills: fileInfo.skills
    };
  }
  
  // Analyze filename for potential resume information
  function analyzeFilename(filename) {
    const info = {
      name: '',
      location: '',
      experience: '',
      education: '',
      skills: []
    };
    
    if (!filename) return info;
    
    // Clean filename - remove extension and common resume words
    let cleanName = filename
      .replace(/\.(pdf|doc|docx)$/i, '')
      .replace(/[_-]/g, ' ')
      .replace(/\bresume\b/gi, '')
      .replace(/\bcv\b/gi, '')
      .trim();
    
    // Try to extract name (usually at beginning)
    const nameMatch = cleanName.match(/^([A-Z][a-z]+\s+[A-Z][a-z]+)/);
    if (nameMatch) {
      info.name = nameMatch[1];
    }
    
    // Look for location indicators
    const locationPatterns = [
      /\b(San Francisco|SF|NYC|New York|Los Angeles|LA|Seattle|Boston|Austin|Chicago|Denver|Portland|Atlanta|Miami|Dallas|Houston)\b/gi,
      /\b[A-Z][a-z]+,?\s*[A-Z]{2}\b/g // City, State format
    ];
    
    for (const pattern of locationPatterns) {
      const match = cleanName.match(pattern);
      if (match) {
        info.location = match[0];
        break;
      }
    }
    
    // Look for experience indicators
    const expMatch = cleanName.match(/(\d+)\s*(?:year|yr|exp)/i);
    if (expMatch) {
      info.experience = expMatch[1];
    }
    
    // Look for education indicators
    const eduPatterns = [
      /\b(PhD|Doctorate|Master|MBA|MS|MA|Bachelor|BS|BA|Associate)\b/gi
    ];
    
    for (const pattern of eduPatterns) {
      const match = cleanName.match(pattern);
      if (match) {
        info.education = match[0];
        break;
      }
    }
    
    // Look for common tech skills in filename
    const skillPatterns = [
      /\b(JavaScript|Java|Python|React|Node|Angular|Vue|Full[_\s]?Stack|Frontend|Backend|DevOps|Data|ML|AI)\b/gi
    ];
    
    for (const pattern of skillPatterns) {
      const matches = cleanName.match(pattern);
      if (matches) {
        info.skills.push(...matches);
      }
    }
    
    return info;
  }
  
  // Show notification
  function showNotification(element, message, type = 'info') {
    element.textContent = message;
    element.className = `notification ${type}`;
    element.style.display = 'block';
    
    setTimeout(() => {
      element.style.display = 'none';
    }, 5000);
  }
  
  // Refresh statistics periodically
  setInterval(() => {
    loadStatistics();
  }, 10000);

  // Enhanced location cleaning function
  function enhancedLocationCleaning(aiLocation, fullText) {
    console.log("Cleaning location. AI extracted:", aiLocation);
    
    // First clean the AI extracted location
    let location = cleanString(aiLocation);
    
    // If AI provided a valid-looking location, use it
    if (location && !isPlaceholderLocation(location)) {
      console.log("Using AI extracted location:", location);
      return location;
    }
    
    // If AI location is placeholder or empty, search for location in full text
    console.log("AI location is placeholder or empty, searching in full text...");
    
    const locationPatterns = [
      // Specific major cities with state
      /\b(San Francisco|SF),?\s*(CA|California)\b/gi,
      /\b(New York|NYC),?\s*(NY|New York)\b/gi,
      /\b(Los Angeles|LA),?\s*(CA|California)\b/gi,
      /\b(Seattle),?\s*(WA|Washington)\b/gi,
      /\b(Boston),?\s*(MA|Massachusetts)\b/gi,
      /\b(Austin),?\s*(TX|Texas)\b/gi,
      /\b(Chicago),?\s*(IL|Illinois)\b/gi,
      /\b(Denver),?\s*(CO|Colorado)\b/gi,
      /\b(Portland),?\s*(OR|Oregon)\b/gi,
      /\b(Atlanta),?\s*(GA|Georgia)\b/gi,
      /\b(Miami),?\s*(FL|Florida)\b/gi,
      /\b(Dallas),?\s*(TX|Texas)\b/gi,
      /\b(Houston),?\s*(TX|Texas)\b/gi,
      
      // General City, State patterns
      /\b[A-Z][a-z]+\s*[A-Z]?[a-z]*,\s*[A-Z]{2}\b/g,
      /\b[A-Z][a-z]+\s+[A-Z][a-z]+,\s*[A-Z]{2}\b/g,
      
      // State names
      /\b(California|CA|New York|NY|Texas|TX|Florida|FL|Washington|WA|Oregon|OR|Illinois|IL|Massachusetts|MA|Colorado|CO|Georgia|GA)\b/gi
    ];
    
    for (const pattern of locationPatterns) {
      const matches = fullText.match(pattern);
      if (matches) {
        for (const match of matches) {
          const cleanMatch = match.trim();
          if (!isPlaceholderLocation(cleanMatch)) {
            console.log("Found location in text:", cleanMatch);
            return cleanMatch;
          }
        }
      }
    }
    
    console.log("No location found in text, returning empty string");
    return '';
  }

  // Check if location is a placeholder
  function isPlaceholderLocation(location) {
    if (!location) return true;
    
    const placeholderPatterns = [
      /anytown/i,
      /city.*state/i,
      /your.*city/i,
      /location/i,
      /address/i,
      /\[.*\]/,
      /example/i,
      /sample/i,
      /template/i,
      /placeholder/i
    ];
    
    return placeholderPatterns.some(pattern => pattern.test(location));
  }
});