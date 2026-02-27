// agent.js - LinkedIn Auto Apply with Human Control
(function() {
    'use strict';
    
    console.log("==== AGENT.JS LOADED ====");
    
    // Early exit if already loaded
    if (window.AGENT_JS_LOADED === true) {
      console.log("Agent.js already loaded, skipping");
      return;
    }
    
    window.AGENT_JS_LOADED = true;
    
    // Extension context checking
    if (typeof window.extensionContextValid === 'undefined') {
      window.extensionContextValid = true;
    }
    
    function checkExtensionContext() {
      try {
        if (!chrome || !chrome.runtime) {
          window.extensionContextValid = false;
          return false;
        }
        const runtimeId = chrome.runtime.id;
        if (!runtimeId) {
          window.extensionContextValid = false;
          return false;
        }
        return true;
      } catch (error) {
        window.extensionContextValid = false;
        return false;
      }
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeAgent);
    } else {
      setTimeout(initializeAgent, 100);
    }
    
    function initializeAgent() {
      if (!window.extensionContextValid || !checkExtensionContext()) {
        console.log("Extension context invalid, aborting");
        return;
      }
      
      const isLinkedIn = window.location.hostname.toLowerCase().includes('linkedin.com');
      if (!isLinkedIn) {
        console.log("Not on LinkedIn, agent not initialized");
        return;
      }
      
      console.log("LinkedIn detected - initializing agent with human control");
      
      // Create global agent with human control
      window.globalAgent = {
        isProcessing: false,
        isPaused: false,
        userAction: null,
        currentStatus: 'Ready',
        
        // Main function with human control - ENHANCED START FLOW
        applyToJob: async function() {
          console.log("🚀 Starting controlled job application with enhanced detection...");
          
          if (this.isProcessing) {
            alert('Process already running. Please wait or stop first.');
            return false;
          }
          
          this.isProcessing = true;
          this.isPaused = false;
          this.userAction = null;
          
          // Create control panel first
          this.createControlPanel();
          
          try {
            // Step 1: Validate page
            this.updateStatus('Validating Page', 'Checking if this is a job page');
            if (!this.isJobPage()) {
              alert('Please navigate to a LinkedIn job page');
              this.cleanup();
              return false;
            }
            
            // Step 2: Find Easy Apply button
            this.updateStatus('Searching for Easy Apply', 'Looking for Easy Apply button on this page');
            await this.sleep(1000); // Give time for page to load
            
            const easyApplyButton = this.findEasyApplyButton();
            
            if (!easyApplyButton) {
              this.updateStatus('No Easy Apply Available', 'This job does not have Easy Apply feature');
              this.showMessage('This job does not have Easy Apply. Process stopped.');
              this.cleanup();
              return false;
            }
            
            console.log("✅ Easy Apply button found:", easyApplyButton);
            
            // Step 3: Get user confirmation to start
            this.updateStatus('Ready to Begin', 'Easy Apply found - click Continue to start application');
            const startConfirmed = await this.waitForUser('start');
            if (!startConfirmed) {
              this.cleanup();
              return false;
            }
            
            // Step 4: Click Easy Apply and wait for form
            this.updateStatus('Opening Application Form', 'Clicking Easy Apply button');
            await this.clickEasyApply(easyApplyButton);
            
            // Step 5: Wait for LinkedIn form to appear
            this.updateStatus('Waiting for Form', 'Waiting for LinkedIn application form to load');
            const modal = await this.waitForLinkedInForm();
            
            if (!modal) {
              this.updateStatus('Form Load Failed', 'LinkedIn form did not appear');
              this.showMessage('Could not open LinkedIn application form. Please try manually.');
              this.cleanup();
              return false;
            }
            
            console.log("✅ LinkedIn form loaded successfully");
            
            // Step 6: Process the multi-step form
            this.updateStatus('Processing Application', 'Working through LinkedIn application steps');
            const success = await this.fillFormWithControl(modal);
            
            // Step 7: Final result
            if (success) {
              this.updateStatus('Application Complete! ✅', 'Successfully submitted to LinkedIn');
              this.showMessage('🎉 Application submitted successfully!');
            } else {
              this.updateStatus('Process Stopped', 'Application was not completed');
              this.showMessage('Application process was stopped or failed.');
            }
            
            this.cleanup();
            return success;
            
          } catch (error) {
            console.error("Error in job application:", error);
            this.updateStatus('Error Occurred', error.message);
            this.showMessage('Error: ' + error.message);
            this.cleanup();
            return false;
          }
        },
        
        // Fill form with human control points - ENHANCED WITH STEP DETECTION
        fillFormWithControl: async function(modal) {
          try {
            console.log("📋 === STARTING FORM CONTROL PROCESS ===");
            console.log("Modal found:", !!modal);
            
            // Detect current step
            const currentStep = this.detectLinkedInStep(modal);
            console.log(`🎯 Detected LinkedIn step: ${currentStep}`);
            
            // Add step tracking
            this.updateStatus(`Processing: ${currentStep}`, 'Working through application step');
            
            let stepResult = false;
            
            switch (currentStep) {
              case 'contact-info':
                console.log("🔄 Handling contact-info step");
                stepResult = await this.handleContactInfoStep(modal);
                break;
              
              case 'resume-upload':
                console.log("🔄 Handling resume-upload step");
                stepResult = await this.handleResumeUploadStep(modal);
                break;
              
              case 'additional-questions':
                console.log("🔄 Handling additional-questions step");
                stepResult = await this.handleAdditionalQuestionsStep(modal);
                break;
              
              case 'review':
                console.log("🔄 Handling review step");
                stepResult = await this.handleReviewStep(modal);
                break;
              
              case 'final-submit':
                console.log("🔄 Handling final-submit step");
                stepResult = await this.handleFinalSubmitStep(modal);
                break;
              
              default:
                console.log("🔄 Handling general/unknown step");
                stepResult = await this.handleGeneralStep(modal);
            }
            
            console.log(`📊 Step result for ${currentStep}:`, stepResult);
            
            if (!stepResult) {
              console.log(`❌ Step ${currentStep} failed or was cancelled`);
              this.updateStatus('Step Failed', `${currentStep} step was not completed`);
            }
            
            return stepResult;
            
          } catch (error) {
            console.error("❌ Error in fillFormWithControl:", error);
            this.updateStatus('Error in Form Control', error.message);
            this.showMessage('Error filling form: ' + error.message);
            return false;
          }
        },
        
        // Detect which step of LinkedIn Easy Apply we're on - IMPROVED FOR 2024
        detectLinkedInStep: function(modal) {
          console.log("🔍 Detecting LinkedIn Easy Apply step with enhanced logic...");
          
          // Get comprehensive modal content
          const stepText = modal.textContent?.toLowerCase() || '';
          const modalTitle = modal.querySelector('h2, h3, h1, .jobs-easy-apply-content h1, .jobs-easy-apply-content h2')?.textContent?.toLowerCase() || '';
          const modalHTML = modal.innerHTML.toLowerCase();
          
          // Count different types of form elements
          const formStats = {
            fileInputs: modal.querySelectorAll('input[type="file"]').length,
            textInputs: modal.querySelectorAll('input[type="text"], input[type="tel"], input[type="email"]').length,
            textAreas: modal.querySelectorAll('textarea').length,
            selects: modal.querySelectorAll('select').length,
            radios: modal.querySelectorAll('input[type="radio"]').length,
            checkboxes: modal.querySelectorAll('input[type="checkbox"]').length,
            buttons: modal.querySelectorAll('button').length
          };
          
          console.log("Enhanced step detection context:", {
            modalTitle: modalTitle.substring(0, 100),
            textSample: stepText.substring(0, 200),
            formStats,
            hasResumeText: stepText.includes('resume') || modalHTML.includes('resume'),
            hasUploadText: stepText.includes('upload') || modalHTML.includes('upload'),
            hasReviewText: stepText.includes('review') || modalHTML.includes('review'),
            hasSubmitText: stepText.includes('submit application') || modalHTML.includes('submit application')
          });
          
          // Step 1: Contact Info / Get Started
          if (modalTitle.includes('contact') || 
              modalTitle.includes('get started') ||
              modalTitle.includes('basic') ||
              modalTitle.includes('information') ||
              stepText.includes('contact information') ||
              stepText.includes('get started') ||
              (formStats.textInputs > 0 && formStats.fileInputs === 0 && formStats.textAreas === 0 && formStats.selects === 0)) {
            console.log("✅ Detected: CONTACT INFO step");
            return 'contact-info';
          }
          
          // Step 2: Resume Upload (priority detection)
          if (modalTitle.includes('resume') ||
              modalTitle.includes('upload') ||
              stepText.includes('resume') ||
              stepText.includes('upload your resume') ||
              stepText.includes('attach resume') ||
              modalHTML.includes('resume') ||
              modalHTML.includes('upload') ||
              formStats.fileInputs > 0) {
            console.log("✅ Detected: RESUME UPLOAD step");
            return 'resume-upload';
          }
          
          // Step 5: Final Submit (check before questions to avoid confusion)
          if (modalTitle.includes('submit application') ||
              stepText.includes('submit application') ||
              stepText.includes('send application') ||
              modalHTML.includes('submit application') ||
              modal.querySelector('button[aria-label*="Submit application"]') ||
              modal.querySelector('button[aria-label*="Send application"]')) {
            console.log("✅ Detected: FINAL SUBMIT step");
            return 'final-submit';
          }
          
          // Step 4: Review (before questions check)
          if (modalTitle.includes('review') ||
              stepText.includes('review your application') ||
              stepText.includes('review and submit') ||
              stepText.includes('application review') ||
              modalHTML.includes('review') ||
              modal.querySelector('[class*="review"], [id*="review"]') ||
              modal.querySelector('button[aria-label*="Review"]')) {
            console.log("✅ Detected: REVIEW step");
            return 'review';
          }
          
          // Step 3: Additional Questions
          if (modalTitle.includes('questions') ||
              modalTitle.includes('additional') ||
              stepText.includes('additional questions') ||
              stepText.includes('answer questions') ||
              formStats.textAreas > 0 ||
              formStats.selects > 0 ||
              formStats.radios > 0 ||
              formStats.checkboxes > 0) {
            console.log("✅ Detected: ADDITIONAL QUESTIONS step");
            return 'additional-questions';
          }
          
          // Fallback: analyze buttons to determine step
          const buttons = modal.querySelectorAll('button');
          const buttonTexts = Array.from(buttons).map(btn => ({
            text: btn.textContent?.toLowerCase() || '',
            ariaLabel: btn.getAttribute('aria-label')?.toLowerCase() || '',
            disabled: btn.disabled
          }));
          
          console.log("Button analysis for step detection:", buttonTexts);
          
          for (const btn of buttonTexts) {
            if (btn.text.includes('submit application') || btn.ariaLabel.includes('submit application')) {
              console.log("✅ Detected via button: FINAL SUBMIT step");
              return 'final-submit';
            }
            if (btn.text.includes('review') || btn.ariaLabel.includes('review')) {
              console.log("✅ Detected via button: REVIEW step");
              return 'review';
            }
          }
          
          console.log("⚠️ Could not determine specific step, using GENERAL");
          return 'general';
        },
        
        // Handle contact info step
        handleContactInfoStep: async function(modal) {
          console.log("📞 Handling contact info step...");
          this.updateStatus('Filling Contact Info', 'Adding phone and basic details');
          
          await this.fillCommonFields(modal);
          
          this.updateStatus('Contact Info Complete', 'Ready to proceed to next step');
          const userConfirmed = await this.waitForUser('next-step');
          if (!userConfirmed) return false;
          
          return await this.clickNextButton(modal);
        },
        
        // Handle resume upload step - IMPROVED AND SIMPLIFIED  
        handleResumeUploadStep: async function(modal) {
          console.log("📎 Handling resume upload step...");
          this.updateStatus('Resume Upload', 'Processing resume upload');
          
          const resumeInputs = this.findResumeInputs(modal);
          const allFileInputs = modal.querySelectorAll('input[type="file"]');
          
          console.log(`Found ${resumeInputs.length} resume inputs, ${allFileInputs.length} total file inputs`);
          
          // IMPROVED CHECK: Look for existing resume files
          const hasExistingResume = this.checkForExistingResumeImproved(modal, [...resumeInputs, ...allFileInputs]);
          
          if (hasExistingResume) {
            console.log("✅ Resume already present, proceeding to next step");
            this.updateStatus('Resume Found', 'Resume already uploaded, continuing');
            
            // Just continue without asking user for confirmation - speeds up the process
            await this.sleep(2000); // Brief pause to let user see the status
            return await this.clickNextButton(modal);
          }
          
          // If we have file inputs but no existing files, request manual upload
          if (resumeInputs.length > 0 || allFileInputs.length > 0) {
            console.log("📎 No resume uploaded, requesting manual upload");
            this.updateStatus('Manual Upload Required', 'Please upload your resume file');
            this.highlightFields([...resumeInputs, ...allFileInputs]);
            
            const uploadConfirmed = await this.waitForUser('manual-upload');
            if (!uploadConfirmed) return false;
            
            return await this.clickNextButton(modal);
          } else {
            // No file inputs required, proceed to next step
            console.log("✅ No resume upload required");
            this.updateStatus('No Resume Required', 'Proceeding to next step');
            
            await this.sleep(1000);
            return await this.clickNextButton(modal);
          }
        },
        
        // IMPROVED existing resume detection
        checkForExistingResumeImproved: function(modal, fileInputs) {
          console.log("🔍 Checking for existing resume (improved detection)...");
          
          // Method 1: Check if any file input has files
          for (const input of fileInputs) {
            if (input.files && input.files.length > 0) {
              const fileName = input.files[0].name;
              console.log("✅ Found file in input:", fileName);
              return fileName;
            }
          }
          
          // Method 2: Look for file names in modal text (including ANDERSON.pdf)
          const modalText = modal.textContent?.toLowerCase() || '';
          const commonFileNames = [
            'anderson.pdf', 'resume.pdf', 'cv.pdf', 'my_resume.pdf', 
            'john_resume.pdf', 'jane_resume.pdf', 'application.pdf'
          ];
          
          for (const fileName of commonFileNames) {
            if (modalText.includes(fileName)) {
              console.log("✅ Found filename in modal text:", fileName);
              return fileName;
            }
          }
          
          // Method 3: Look for any PDF/DOC files mentioned
          const filePattern = /[\w\-\s]+\.(pdf|doc|docx)/gi;
          const matches = modalText.match(filePattern);
          if (matches && matches.length > 0) {
            console.log("✅ Found file pattern in text:", matches[0]);
            return matches[0];
          }
          
          // Method 4: Look for "uploaded" or "attached" text near file elements
          const fileElements = modal.querySelectorAll(
            '.file-name, .filename, [class*="file"], [class*="upload"], [class*="attach"]'
          );
          
          for (const element of fileElements) {
            const text = element.textContent?.trim() || '';
            if (text && (text.includes('.pdf') || text.includes('.doc') || text.includes('.docx'))) {
              console.log("✅ Found file element with extension:", text);
              return text;
            }
          }
          
          // Method 5: Check for upload success indicators
          const successIndicators = [
            'uploaded successfully', 'file attached', 'resume attached', 
            'document uploaded', 'cv uploaded', 'file selected'
          ];
          
          for (const indicator of successIndicators) {
            if (modalText.includes(indicator)) {
              console.log("✅ Found upload success indicator:", indicator);
              return 'uploaded file detected';
            }
          }
          
          console.log("❌ No existing resume found");
          return null;
        },
        
        // Handle additional questions step
        handleAdditionalQuestionsStep: async function(modal) {
          console.log("❓ Handling additional questions step...");
          this.updateStatus('Answering Questions', 'Filling additional fields');
          
          await this.fillCommonFields(modal);
          
          this.updateStatus('Questions Complete', 'Ready to proceed');
          const userConfirmed = await this.waitForUser('next-step');
          if (!userConfirmed) return false;
          
          return await this.clickNextButton(modal);
        },
        
        // Handle review step
        handleReviewStep: async function(modal) {
          console.log("👀 Handling review step...");
          this.updateStatus('Review Application', 'Please review your application');
          
          const userConfirmed = await this.waitForUser('review-complete');
          if (!userConfirmed) return false;
          
          return await this.clickReviewButton(modal);
        },
        
        // Handle final submit step
        handleFinalSubmitStep: async function(modal) {
          console.log("🚀 Handling final submit step...");
          this.updateStatus('Ready to Submit', 'Final submission step');
          
          const userConfirmed = await this.waitForUser('final-submit');
          if (!userConfirmed) return false;
          
          return await this.clickSubmitButton(modal);
        },
        
        // SIMPLIFIED SUBMIT BUTTON FUNCTION - DIRECT AND RELIABLE
        clickSubmitButton: async function(modal) {
          console.log("🚀 === ULTRA RELIABLE SUBMIT APPROACH ===");
          
          if (!modal) {
            console.log("❌ No modal provided");
            this.showMessage('No application form found.');
            return false;
          }
          
          // Strategy 1: Find the actual submit button with comprehensive search
          console.log("🔍 Strategy 1: Comprehensive submit button search...");
          
          // Step 1a: Direct LinkedIn submit selectors
          const linkedinSubmitSelectors = [
            'button[aria-label*="Submit application"]',
            'button[aria-label*="Submit Application"]',
            'button[data-control-name*="submit_application"]',
            'button[data-control-name*="easy_apply_submit"]',
            'button[data-control-name*="submit"]'
          ];
          
          for (const selector of linkedinSubmitSelectors) {
            console.log(`Trying LinkedIn selector: ${selector}`);
            const buttons = modal.querySelectorAll(selector);
            
            for (const button of buttons) {
              if (!button.disabled && this.isButtonVisible(button)) {
                console.log("🎯 Found LinkedIn submit button:", button);
                const success = await this.attemptSubmitClick(button, 'LinkedIn Submit');
                if (success) return true;
              }
            }
          }
          
          // Step 1b: Text-based submit button search
          console.log("🔍 Step 1b: Text-based submit search...");
          const allButtons = modal.querySelectorAll('button');
          
          for (const button of allButtons) {
            const text = button.textContent?.toLowerCase().trim() || '';
            const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
            
            // Look for exact "submit application" text
            if ((text === 'submit application' || ariaLabel.includes('submit application')) && 
                !button.disabled && this.isButtonVisible(button)) {
              
              console.log("🎯 Found text-based submit button:", button);
              const success = await this.attemptSubmitClick(button, 'Text-based Submit');
              if (success) return true;
            }
          }
          
          // Step 1c: Generic submit button search
          console.log("🔍 Step 1c: Generic submit search...");
          const genericSubmitSelectors = ['button[type="submit"]', 'input[type="submit"]'];
          
          for (const selector of genericSubmitSelectors) {
            const buttons = modal.querySelectorAll(selector);
            
            for (const button of buttons) {
              if (!button.disabled && this.isButtonVisible(button)) {
                console.log("🎯 Found generic submit button:", button);
                const success = await this.attemptSubmitClick(button, 'Generic Submit');
                if (success) return true;
              }
            }
          }
          
          // Strategy 2: Try any button that looks like submit
          console.log("🔍 Strategy 2: Any submit-like button...");
          
          for (const button of allButtons) {
            const text = button.textContent?.toLowerCase().trim() || '';
            const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
            
            if ((text.includes('submit') || ariaLabel.includes('submit') || 
                 text.includes('send application') || ariaLabel.includes('send application')) &&
                !text.includes('save') && !text.includes('draft') && 
                !button.disabled && this.isButtonVisible(button)) {
              
              console.log("🎯 Trying submit-like button:", button);
              const success = await this.attemptSubmitClick(button, 'Submit-like');
              if (success) return true;
            }
          }
          
          // Strategy 3: Try primary buttons at the bottom of modal
          console.log("🔍 Strategy 3: Primary buttons at bottom...");
          const primaryButtons = modal.querySelectorAll('button.artdeco-button--primary, .artdeco-button--primary');
          
          for (const button of primaryButtons) {
            if (!button.disabled && this.isButtonVisible(button)) {
              // Check if button is near the bottom of the modal
              const modalRect = modal.getBoundingClientRect();
              const buttonRect = button.getBoundingClientRect();
              
              if (buttonRect.bottom > modalRect.bottom - 100) { // Near bottom
                console.log("🎯 Trying bottom primary button:", button);
                const success = await this.attemptSubmitClick(button, 'Bottom Primary');
                if (success) return true;
              }
            }
          }
          
          // Strategy 4: Manual guidance with highlighting
          console.log("🔍 Strategy 4: Manual submission with guidance...");
          this.showSubmitGuidance(modal);
          
          return false;
        },
        
        // Attempt to click submit button with comprehensive verification
        attemptSubmitClick: async function(button, strategy) {
          console.log(`🖱️ [${strategy}] Attempting submit click...`);
          
          const buttonText = button.textContent?.trim() || 'No text';
          const ariaLabel = button.getAttribute('aria-label') || 'No aria-label';
          
          console.log(`Button details: "${buttonText}" | "${ariaLabel}"`);
          
          try {
            // Record state before click
            const beforeUrl = window.location.href;
            const beforeModal = !!this.findLinkedInModal();
            
            // Scroll and focus
            button.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.sleep(2000); // Longer wait for animation
            
            button.focus();
            await this.sleep(1000);
            
            // Highlight the button we're about to click
            const originalStyle = button.style.cssText;
            button.style.cssText += `
              border: 5px solid lime !important;
              background-color: lightgreen !important;
              box-shadow: 0 0 20px lime !important;
            `;
            
            await this.sleep(1000);
            
            // Multiple click methods for maximum reliability
            console.log("🖱️ Executing multi-method click...");
            
            // Method 1: Direct click
            button.click();
            await this.sleep(500);
            
            // Method 2: Mouse events
            button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await this.sleep(500);
            
            // Method 3: Form submission if applicable
            const form = button.closest('form');
            if (form) {
              console.log("🖱️ Also triggering form submit...");
              form.dispatchEvent(new Event('submit', { bubbles: true }));
            }
            
            // Wait for LinkedIn to process (longer wait)
            console.log("⏳ Waiting for LinkedIn response...");
            await this.sleep(8000); // 8 second wait
            
            // Restore button style
            button.style.cssText = originalStyle;
            
            // Check what happened
            const afterUrl = window.location.href;
            const afterModal = !!this.findLinkedInModal();
            const isComplete = this.isApplicationComplete();
            
            console.log("📊 Submit result analysis:", {
              strategy: strategy,
              urlChanged: beforeUrl !== afterUrl,
              modalDisappeared: beforeModal && !afterModal,
              applicationComplete: isComplete,
              beforeUrl: beforeUrl.substring(0, 80),
              afterUrl: afterUrl.substring(0, 80)
            });
            
            // Success conditions (more lenient)
            if (isComplete || !afterModal || beforeUrl !== afterUrl) {
              console.log(`✅ [${strategy}] Submit appears successful!`);
              this.updateStatus('Application Submitted! ✅', `${strategy} method succeeded`);
              return true;
            } else {
              console.log(`⚠️ [${strategy}] Submit clicked but no clear success`);
              return false;
            }
            
          } catch (error) {
            console.error(`❌ [${strategy}] Submit click failed:`, error);
            return false;
          }
        },
        
        // Show comprehensive submit guidance
        showSubmitGuidance: function(modal) {
          console.log("🎨 === SHOWING SUBMIT GUIDANCE ===");
          
          // Find and highlight ALL potential submit buttons
          const allButtons = modal.querySelectorAll('button');
          const submitButtons = [];
          
          allButtons.forEach((button, index) => {
            const text = button.textContent?.toLowerCase().trim() || '';
            const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
            
            if (text.includes('submit') || ariaLabel.includes('submit') || 
                text.includes('send') || ariaLabel.includes('send') ||
                button.type === 'submit') {
              
              // Highlight this button
              button.style.cssText += `
                border: 5px solid red !important;
                background-color: yellow !important;
                color: black !important;
                font-weight: bold !important;
                z-index: 999999 !important;
                box-shadow: 0 0 20px red !important;
              `;
              
              submitButtons.push({
                button,
                text: text || 'No text',
                ariaLabel: ariaLabel || 'No aria-label',
                index
              });
              
              // Add click listener to detect manual submission
              button.addEventListener('click', () => {
                console.log("✅ Submit button clicked manually!");
                setTimeout(() => {
                  const modalExists = !!this.findLinkedInModal();
                  const completed = this.isApplicationComplete();
                  
                  if (!modalExists || completed) {
                    console.log("✅ Manual submission appears successful!");
                    this.updateStatus('Application Submitted! ✅', 'Manual submission successful');
                    this.showMessage('🎉 Application submitted successfully!');
                  }
                }, 3000);
              }, { once: true });
            }
          });
          
          // Show message to user
          this.showMessage(`Found ${submitButtons.length} potential submit buttons (highlighted in red/yellow). Please click the correct "Submit Application" button manually.`);
          
          console.log(`🔴 Highlighted ${submitButtons.length} potential submit buttons for manual clicking`);
          submitButtons.forEach((btn, i) => {
            console.log(`  ${i + 1}. "${btn.text}" | "${btn.ariaLabel}"`);
          });
          
          return submitButtons;
        },
        
        // Handle general/unknown step
        handleGeneralStep: async function(modal) {
          console.log("🔄 Handling general step...");
          
          // Fill basic fields
          await this.fillCommonFields(modal);
          
          // Check for resume upload
          const resumeInputs = this.findResumeInputs(modal);
          if (resumeInputs.length > 0) {
            const resumeHandled = await this.handleResumeUploadProcess(modal, resumeInputs, []);
            if (!resumeHandled) return false;
          }
          
          this.updateStatus('Step Complete', 'Ready to continue');
          const userConfirmed = await this.waitForUser('general-step');
          if (!userConfirmed) return false;
          
          return await this.proceedToNextStep(modal);
        },
        
        // Click Next button specifically
        clickNextButton: async function(modal) {
          console.log("➡️ === ATTEMPTING TO CLICK NEXT BUTTON ===");
          
          if (!modal) {
            console.log("❌ No modal provided to clickNextButton");
            return false;
          }
          
          const nextSelectors = [
            'button[aria-label*="Next"]',
            'button[aria-label*="Continue"]',
            'button[data-control-name*="continue"]',
            'button.artdeco-button--primary',
            'button[type="submit"]'
          ];
          
          console.log("🔍 Searching for Next/Continue buttons...");
          
          for (const selector of nextSelectors) {
            console.log(`Trying selector: ${selector}`);
            const buttons = modal.querySelectorAll(selector);
            console.log(`Found ${buttons.length} buttons with selector: ${selector}`);
            
            for (const button of buttons) {
              const text = button.textContent?.toLowerCase() || '';
              const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
              const disabled = button.disabled;
              const visible = this.isButtonVisible(button);
              
              console.log(`Button check: text="${text}", aria="${ariaLabel}", disabled=${disabled}, visible=${visible}`);
              
              if ((text.includes('next') || text.includes('continue') || 
                   ariaLabel.includes('next') || ariaLabel.includes('continue') ||
                   text.includes('review') || ariaLabel.includes('review')) &&
                  !disabled && visible &&
                  !text.includes('back') && !text.includes('cancel')) {
                
                console.log("🎯 Found Next/Continue button:", {
                  text: text,
                  ariaLabel: ariaLabel,
                  selector: selector
                });
                
                const success = await this.clickButtonAndWaitForNext(button, modal);
                if (success) {
                  console.log("✅ Next button click successful");
                  return true;
                } else {
                  console.log("⚠️ Next button click failed, trying next button");
                }
              }
            }
          }
          
          // Fallback: try any visible primary button
          console.log("🔍 Fallback: Looking for any primary button...");
          const primaryButtons = modal.querySelectorAll('button.artdeco-button--primary');
          
          for (const button of primaryButtons) {
            if (!button.disabled && this.isButtonVisible(button)) {
              const text = button.textContent?.toLowerCase() || '';
              
              // Avoid clearly wrong buttons
              if (!text.includes('cancel') && !text.includes('back') && !text.includes('close')) {
                console.log("🎯 Trying fallback primary button:", text);
                
                const success = await this.clickButtonAndWaitForNext(button, modal);
                if (success) {
                  console.log("✅ Fallback button click successful");
                  return true;
                }
              }
            }
          }
          
          console.log("❌ No Next/Continue button found");
          this.updateStatus('Manual Action Required', 'Please click the Next or Continue button manually');
          this.showMessage('Could not find Next/Continue button. Please click it manually to proceed.');
          
          // Highlight all potential buttons for manual clicking
          const allButtons = modal.querySelectorAll('button');
          allButtons.forEach(button => {
            if (!button.disabled && this.isButtonVisible(button)) {
              button.style.border = '3px solid orange';
              button.style.backgroundColor = 'lightyellow';
            }
          });
          
          return false;
        },
        
        // Click Review button specifically  
        clickReviewButton: async function(modal) {
          console.log("👀 Looking for Review button...");
          
          const reviewSelectors = [
            'button[aria-label*="Review"]',
            'button[data-control-name*="review"]',
            'button.artdeco-button--primary'
          ];
          
          for (const selector of reviewSelectors) {
            const buttons = modal.querySelectorAll(selector);
            for (const button of buttons) {
              const text = button.textContent?.toLowerCase() || '';
              const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
              
              if ((text.includes('review') || ariaLabel.includes('review')) &&
                  !button.disabled) {
                
                console.log("🎯 Clicking Review button:", text || ariaLabel);
                return await this.clickButtonAndWaitForNext(button, modal);
              }
            }
          }
          
          console.log("❌ No Review button found");
          return false;
        },
        
        // Click button and handle next step
        clickButtonAndWaitForNext: async function(button, currentModal) {
          console.log("🖱️ === CLICKING BUTTON AND WAITING FOR NEXT STEP ===");
          
          const buttonText = button.textContent?.trim() || 'No text';
          const ariaLabel = button.getAttribute('aria-label') || 'No aria-label';
          console.log(`Clicking button: "${buttonText}" | "${ariaLabel}"`);
          
          try {
            // Record state before click
            const beforeUrl = window.location.href;
            
            // Scroll and focus
            button.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.sleep(1000);
            
            button.focus();
            await this.sleep(500);
            
            // Highlight button
            const originalStyle = button.style.cssText;
            button.style.border = '3px solid lime';
            button.style.backgroundColor = 'lightgreen';
            
            console.log("🖱️ Executing button click...");
            
            // Click the button
            button.click();
            
            // Also dispatch events for maximum compatibility
            button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            
            // Wait for response
            console.log("⏳ Waiting for LinkedIn response...");
            await this.sleep(4000);
            
            // Restore button style
            button.style.cssText = originalStyle;
            
            // Check what happened
            const afterUrl = window.location.href;
            const newModal = this.findLinkedInModal();
            const isComplete = this.isApplicationComplete();
            
            console.log("📊 Click result analysis:", {
              urlChanged: beforeUrl !== afterUrl,
              modalStillExists: !!newModal,
              modalChanged: newModal !== currentModal,
              applicationComplete: isComplete,
              beforeUrl: beforeUrl.substring(0, 80),
              afterUrl: afterUrl.substring(0, 80)
            });
            
            // Check for application completion
            if (isComplete) {
              console.log("✅ Application completed after button click!");
              this.updateStatus('Application Complete! ✅', 'Application submitted successfully');
              return true;
            }
            
            // Check if modal disappeared (might mean we're done)
            if (!newModal) {
              console.log("✅ Modal disappeared - likely completed or moved to next page");
              return true;
            }
            
            // Check if we moved to a new step
            if (newModal && newModal !== currentModal) {
              console.log("🔄 New modal detected, continuing with new step...");
              return await this.fillFormWithControl(newModal);
            }
            
            // Same modal but check if content changed (new step)
            if (newModal === currentModal) {
              console.log("🔄 Same modal, checking for step change...");
              const newStep = this.detectLinkedInStep(currentModal);
              console.log(`New step detected: ${newStep}`);
              
              // Give it another try with the same modal
              return await this.fillFormWithControl(currentModal);
            }
            
            console.log("⚠️ Button clicked but unclear what happened next");
            return false;
            
          } catch (error) {
            console.error("❌ Error in clickButtonAndWaitForNext:", error);
            return false;
          }
        },
        
        // General proceed function
        proceedToNextStep: async function(modal) {
          // Try Next first, then Submit
          let success = await this.clickNextButton(modal);
          
          if (!success) {
            success = await this.clickSubmitButton(modal);
          }
          
          if (!success) {
            success = await this.clickReviewButton(modal);
          }
          
          return success;
        },
        
        // Create control panel
        createControlPanel: function() {
          this.removeControlPanel();
          
          const panel = document.createElement('div');
          panel.id = 'linkedin-control-panel';
          panel.style.cssText = `
            position: fixed; top: 20px; right: 20px; 
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white; padding: 20px; border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px; z-index: 10002; min-width: 350px;
            border: 2px solid #4a90e2;
          `;
          
          panel.innerHTML = `
            <div style="font-weight: bold; font-size: 16px; margin-bottom: 15px; text-align: center;">
              🤖 LinkedIn Auto Apply Control
            </div>
            
            <div id="status-display" style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 5px;">
              <div id="main-status" style="font-weight: bold; margin-bottom: 5px;">Initializing...</div>
              <div id="sub-status" style="font-size: 12px; opacity: 0.9;"></div>
            </div>
            
            <div id="control-buttons" style="text-align: center; margin: 15px 0;">
              <button id="continue-btn" style="background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 14px; margin: 5px; display: inline-block;">
                ▶️ Continue
              </button>
              <button id="pause-btn" style="background: #ffc107; color: #212529; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 14px; margin: 5px; display: none;">
                ⏸️ Pause
              </button>
              <button id="stop-btn" style="background: #dc3545; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 14px; margin: 5px; display: inline-block;">
                ⏹️ Stop
              </button>
            </div>
            
            <div id="instructions" style="font-size: 12px; color: rgba(255,255,255,0.8); text-align: center; margin-top: 10px;">
              Human control enabled - process waits for your confirmation
            </div>
          `;
          
          document.body.appendChild(panel);
          this.setupControlEvents();
        },
        
        // Setup control button events
        setupControlEvents: function() {
          console.log("🔧 Setting up control panel events...");
          
          const continueBtn = document.getElementById('continue-btn');
          const pauseBtn = document.getElementById('pause-btn');
          const stopBtn = document.getElementById('stop-btn');
          
          console.log("Control buttons found:", {
            continue: !!continueBtn,
            pause: !!pauseBtn,
            stop: !!stopBtn
          });
          
          if (continueBtn) {
            // Remove any existing event listeners
            continueBtn.replaceWith(continueBtn.cloneNode(true));
            const newContinueBtn = document.getElementById('continue-btn');
            
            newContinueBtn.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log("✅ Continue button clicked");
              this.userAction = 'continue';
              this.isPaused = false;
              newContinueBtn.style.display = 'none';
              const pauseButton = document.getElementById('pause-btn');
              if (pauseButton) pauseButton.style.display = 'inline-block';
            };
            
            // Also add event listener
            newContinueBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log("✅ Continue button event listener triggered");
              this.userAction = 'continue';
              this.isPaused = false;
            });
          }
          
          if (pauseBtn) {
            // Remove any existing event listeners
            pauseBtn.replaceWith(pauseBtn.cloneNode(true));
            const newPauseBtn = document.getElementById('pause-btn');
            
            newPauseBtn.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log("⏸️ Pause button clicked");
              this.userAction = 'pause';
              this.isPaused = true;
              newPauseBtn.style.display = 'none';
              const continueButton = document.getElementById('continue-btn');
              if (continueButton) continueButton.style.display = 'inline-block';
            };
          }
          
          if (stopBtn) {
            // Remove any existing event listeners
            stopBtn.replaceWith(stopBtn.cloneNode(true));
            const newStopBtn = document.getElementById('stop-btn');
            
            newStopBtn.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log("⏹️ Stop button clicked");
              this.userAction = 'stop';
              this.isProcessing = false;
              this.cleanup();
            };
          }
          
          console.log("✅ Control panel events setup complete");
        },
        
        // Wait for user action with context-specific instructions
        waitForUser: async function(context) {
          console.log(`⏸️ Waiting for user action: ${context}`);
          
          return new Promise((resolve) => {
            this.isPaused = true;
            this.userAction = null;
            
            // Show the continue button
            const continueBtn = document.getElementById('continue-btn');
            if (continueBtn) {
              continueBtn.style.display = 'inline-block';
            }
            
            // Update instructions based on context
            const instructions = document.getElementById('instructions');
            if (instructions) {
              switch (context) {
                case 'start':
                  instructions.textContent = 'Ready to start Easy Apply. Click Continue to begin.';
                  break;
                case 'start-external':
                  instructions.textContent = 'Ready to start external job application. Click Continue to begin filling the form.';
                  break;
                case 'next-step':
                  instructions.textContent = 'Form has multiple steps. Click Continue to proceed to the next step.';
                  break;
                case 'external-submit':
                  instructions.textContent = 'Form filled successfully. Click Continue to submit the application.';
                  break;
                case 'manual-upload':
                  instructions.textContent = 'Please upload the required file manually, then click Continue.';
                  break;
                case 'resume-upload':
                  instructions.textContent = 'Ready to upload resume. Make sure you have set up your resume in the extension settings.';
                  break;
                case 'resume-uploaded':
                case 'manual-upload':
                case 'submit':
                  instructions.textContent = 'Please complete the manual step, then click Continue.';
                  break;
                case 'additional-questions':
                  instructions.textContent = 'Additional questions found. Click Continue to proceed or handle manually.';
                  break;
                case 'review':
                case 'review-complete':
                  instructions.textContent = 'Review step reached. Please review the information and click Continue.';
                  break;
                case 'final-submit':
                  instructions.textContent = 'Final step - click Continue to submit your application.';
                  break;
                case 'general-step':
                  instructions.textContent = 'Step completed. Click Continue to proceed.';
                  break;
                case 'resume-already-uploaded':
                  instructions.textContent = 'Resume already present. Click Continue to proceed.';
                  break;
                default:
                  instructions.textContent = 'Click Continue to proceed or Stop to cancel.';
              }
            }
            
            // Create polling mechanism
            const checkUserAction = () => {
              if (this.userAction === 'continue') {
                this.isPaused = false;
                resolve(true);
              } else if (this.userAction === 'stop') {
                this.isPaused = false;
                resolve(false);
              } else {
                setTimeout(checkUserAction, 100);
              }
            };
            
            checkUserAction();
          });
        },
        
        // Show continue button with context
        showContinueButton: function(context) {
          const continueBtn = document.getElementById('continue-btn');
          const instructions = document.getElementById('instructions');
          
          if (continueBtn) continueBtn.style.display = 'inline-block';
          
          if (instructions) {
            switch (context) {
              case 'start':
                instructions.textContent = 'Ready to start Easy Apply. Click Continue to begin.';
                break;
              case 'next-step':
                instructions.textContent = 'Form filled. Click Continue to proceed to next step.';
                break;
              case 'resume-uploaded':
                instructions.textContent = 'Resume uploaded successfully. Click Continue to proceed.';
                break;
              case 'resume-already-uploaded':
                instructions.textContent = 'Resume already present. Click Continue to proceed.';
                break;
              case 'manual-upload':
                instructions.textContent = 'Please upload your resume, then click Continue.';
                break;
              case 'review-complete':
                instructions.textContent = 'Please review your application and click Continue.';
                break;
              case 'final-submit':
                instructions.textContent = 'Final step - click Continue to submit your application.';
                break;
              case 'general-step':
                instructions.textContent = 'Step completed. Click Continue to proceed.';
                break;
              default:
                instructions.textContent = 'Please review and click Continue when ready.';
            }
          }
        },
        
        // Update status display
        updateStatus: function(status, details = '') {
          this.currentStatus = status;
          console.log(`🔄 Status: ${status} - ${details}`);
          
          const mainStatus = document.getElementById('main-status');
          const subStatus = document.getElementById('sub-status');
          
          if (mainStatus) mainStatus.textContent = status;
          if (subStatus) subStatus.textContent = details;
        },
        
        // Enhanced Easy Apply detection
        findEasyApplyButton: function() {
          console.log("🔍 Searching for Easy Apply button...");
          
          const selectors = [
            'button[data-control-name="jobs_details_top_card_inapply"]',
            'button[aria-label*="Easy Apply"]',
            '.jobs-apply-button[aria-label*="Easy Apply"]',
            'button.jobs-apply-button:not(.jobs-apply-button--outsideApply)',
            '.jobs-unified-top-card .jobs-apply-button',
            'button[data-control-name*="apply"]:not([data-control-name*="save"])'
          ];
          
          for (const selector of selectors) {
            try {
              const buttons = document.querySelectorAll(selector);
              for (const button of buttons) {
                if (this.isValidEasyApplyButton(button)) {
                  console.log("✅ Found Easy Apply button");
                  return button;
                }
              }
            } catch (e) {
              continue;
            }
          }
          
          // Manual search
          const allButtons = document.querySelectorAll('button');
          for (const btn of allButtons) {
            if (this.isValidEasyApplyButton(btn)) {
              console.log("✅ Found Easy Apply via manual search");
              return btn;
            }
          }
          
          console.log("❌ No Easy Apply button found");
          return null;
        },
        
        // Validate Easy Apply button
        isValidEasyApplyButton: function(button) {
          if (!button) return false;
          
          const text = button.textContent?.trim().toLowerCase() || '';
          const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
          const dataControl = button.getAttribute('data-control-name') || '';
          const className = button.className || '';
          
          const style = window.getComputedStyle(button);
          const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
          const isClickable = !button.disabled;
          
          if (!isVisible || !isClickable) return false;
          
          const hasEasyApply = text.includes('easy apply') || ariaLabel.includes('easy apply') || 
                             dataControl.includes('easy_apply') || dataControl.includes('inapply');
          
          const hasApply = text.includes('apply') || ariaLabel.includes('apply');
          const isNotExcluded = !text.includes('save') && !text.includes('follow') && 
                              !text.includes('share') && !ariaLabel.includes('save');
          
          const isLinkedInApplyButton = className.includes('jobs-apply-button') && 
                                      !className.includes('outsideApply');
          
          const isInJobArea = button.closest('.jobs-unified-top-card') || 
                             button.closest('.jobs-details-top-card') ||
                             button.closest('[class*="job"]') ||
                             button.closest('main');
          
          return hasEasyApply || (hasApply && isNotExcluded && (isLinkedInApplyButton || isInJobArea));
        },
        
        // Click Easy Apply button
        clickEasyApply: async function(button) {
          button.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await this.sleep(1000);
          
          // Focus and click
          button.focus();
          button.click();
          
          // Also dispatch events
          button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          
          await this.sleep(2000);
        },
        
        // Wait for LinkedIn form to appear
        waitForLinkedInForm: async function() {
          console.log("⏳ Waiting for LinkedIn form...");
          
          const timeout = 10000;
          const start = Date.now();
          
          while (Date.now() - start < timeout) {
            const modal = this.findLinkedInModal();
            if (modal) {
              console.log("✅ LinkedIn form found");
              return modal;
            }
            await this.sleep(500);
          }
          
          console.log("❌ LinkedIn form not found");
          return null;
        },
        
        // Find LinkedIn modal - UPDATED FOR 2024 LINKEDIN
        findLinkedInModal: function() {
          console.log("🔍 Looking for LinkedIn modal with 2024 selectors...");
          
          const selectors = [
            // 2024 LinkedIn Easy Apply selectors
            '.jobs-easy-apply-modal',
            '.artdeco-modal[data-test-modal-id="easy-apply-desktop"]',
            '.artdeco-modal[aria-labelledby*="easy-apply"]',
            '.artdeco-modal .jobs-easy-apply-content',
            
            // General modal selectors that LinkedIn uses
            '.artdeco-modal[aria-modal="true"]',
            '.artdeco-modal[role="dialog"]',
            '[role="dialog"][aria-modal="true"]',
            '.artdeco-modal--layer-default',
            
            // Alternative modal patterns
            '.scaffold-layout-toolbar + .artdeco-modal',
            '.artdeco-modal.artdeco-modal--layer-default',
            
            // Backup selectors
            '[data-test-modal-container] .artdeco-modal',
            '.modal[aria-modal="true"]',
            '[role="dialog"]'
          ];
          
          for (const selector of selectors) {
            try {
              const modals = document.querySelectorAll(selector);
              console.log(`Selector "${selector}": found ${modals.length} modals`);
              
              for (const modal of modals) {
                const style = window.getComputedStyle(modal);
                const isVisible = style.display !== 'none' && 
                                style.visibility !== 'hidden' && 
                                style.opacity !== '0';
                
                if (isVisible) {
                  // Check for typical Easy Apply content
                  const hasEasyApplyContent = modal.querySelector('form, input, textarea, button, .jobs-easy-apply') ||
                                            modal.textContent.toLowerCase().includes('easy apply') ||
                                            modal.textContent.toLowerCase().includes('apply for') ||
                                            modal.querySelector('[class*="apply"], [id*="apply"]');
                  
                  console.log(`Modal check:`, {
                    selector,
                    visible: isVisible,
                    hasContent: !!hasEasyApplyContent,
                    textSample: modal.textContent.substring(0, 100)
                  });
                  
                  if (hasEasyApplyContent) {
                    console.log("✅ Found valid LinkedIn modal:", modal);
                    return modal;
                  }
                }
              }
            } catch (e) {
              console.log(`Selector "${selector}" failed:`, e.message);
              continue;
            }
          }
          
          // Fallback: look for any visible modal with form elements
          console.log("🔄 Using fallback modal detection...");
          const allModals = document.querySelectorAll('[role="dialog"], .modal, [class*="modal"]');
          
          for (const modal of allModals) {
            const style = window.getComputedStyle(modal);
            const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
            
            if (isVisible && (modal.querySelector('form, input, button, textarea'))) {
              console.log("✅ Found fallback modal with form elements:", modal);
              return modal;
            }
          }
          
          console.log("❌ No LinkedIn modal found");
          return null;
        },
        
        // Fill common form fields
        fillCommonFields: async function(container) {
          console.log("🖊️ Filling form fields...");
          
          const userData = await this.getUserData();
          
          // Phone fields
          const phoneInputs = container.querySelectorAll('input[type="tel"], input[name*="phone"], input[id*="phone"]');
          phoneInputs.forEach(input => {
            input.value = userData.phone || "(555) 123-4567";
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          });
          
          // Text areas
          const textAreas = container.querySelectorAll('textarea');
          textAreas.forEach(textarea => {
            textarea.value = userData.coverLetter || "I am interested in this position and believe my skills would be a great fit for your team.";
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
          });
          
          // Select dropdowns
          const selects = container.querySelectorAll('select');
          selects.forEach(select => {
            if (select.options.length > 1 && select.selectedIndex === 0) {
              select.selectedIndex = 1;
              select.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });
          
          // Radio buttons
          const radioGroups = {};
          const radios = container.querySelectorAll('input[type="radio"]');
          radios.forEach(radio => {
            if (!radioGroups[radio.name]) radioGroups[radio.name] = [];
            radioGroups[radio.name].push(radio);
          });
          
          Object.values(radioGroups).forEach(group => {
            if (!group.some(r => r.checked) && group.length > 0) {
              group[0].checked = true;
              group[0].dispatchEvent(new Event('change', { bubbles: true }));
            }
          });
          
          await this.sleep(1000);
        },
        
        // Get user data
        getUserData: async function() {
          return new Promise((resolve) => {
            try {
              if (chrome && chrome.storage) {
                chrome.storage.local.get(['userProfile', 'resumeData'], (result) => {
                  const userData = result.resumeData || result.userProfile || {};
                  resolve({
                    phone: userData.phone || "(555) 123-4567",
                    coverLetter: userData.coverLetter || "I am excited about this opportunity and believe my experience would be valuable to your team.",
                    ...userData
                  });
                });
              } else {
                resolve({
                  phone: "(555) 123-4567",
                  coverLetter: "I am excited about this opportunity and believe my experience would be valuable to your team."
                });
              }
            } catch (error) {
              resolve({
                phone: "(555) 123-4567",
                coverLetter: "I am excited about this opportunity and believe my experience would be valuable to your team."
              });
            }
          });
        },
        
        // Find resume input fields - IMPROVED DETECTION
        findResumeInputs: function(container) {
          console.log("🔍 Looking for resume input fields...");
          
          const fileInputs = container.querySelectorAll('input[type="file"]');
          console.log(`Found ${fileInputs.length} file inputs to analyze`);
          
          const resumeInputs = Array.from(fileInputs).filter(input => {
            const label = input.closest('label')?.textContent?.toLowerCase() || '';
            const parent = input.parentElement?.textContent?.toLowerCase() || '';
            const placeholder = input.placeholder?.toLowerCase() || '';
            const name = input.name?.toLowerCase() || '';
            const id = input.id?.toLowerCase() || '';
            
            // Look in surrounding elements too
            const grandParent = input.closest('div')?.textContent?.toLowerCase() || '';
            const section = input.closest('section')?.textContent?.toLowerCase() || '';
            
            const isResumeField = label.includes('resume') || label.includes('cv') || 
                                parent.includes('resume') || parent.includes('cv') ||
                                placeholder.includes('resume') || placeholder.includes('cv') ||
                                name.includes('resume') || name.includes('cv') ||
                                id.includes('resume') || id.includes('cv') ||
                                grandParent.includes('resume') || grandParent.includes('cv') ||
                                section.includes('resume') || section.includes('cv');
            
            if (isResumeField) {
              console.log("✅ Found resume field:", {
                name: name || 'unnamed',
                id: id || 'no-id',
                placeholder,
                label: label.substring(0, 50),
                parent: parent.substring(0, 50)
              });
            }
            
            return isResumeField;
          });
          
          console.log(`Identified ${resumeInputs.length} resume-specific inputs out of ${fileInputs.length} total file inputs`);
          return resumeInputs;
        },
        
        // Get stored resume file
        getStoredResumeFile: async function() {
          return new Promise((resolve) => {
            try {
              if (chrome && chrome.storage) {
                chrome.storage.local.get(['resumeFile'], (result) => {
                  if (result.resumeFile && result.resumeFile.data) {
                    try {
                      const base64Data = result.resumeFile.data.split(',')[1];
                      const byteCharacters = atob(base64Data);
                      const byteNumbers = new Array(byteCharacters.length);
                      
                      for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                      }
                      
                      const byteArray = new Uint8Array(byteNumbers);
                      const file = new File([byteArray], result.resumeFile.name, {
                        type: result.resumeFile.type || 'application/pdf'
                      });
                      
                      console.log("✅ Resume file retrieved:", file.name);
                      resolve(file);
                    } catch (error) {
                      console.error("Error converting resume file:", error);
                      resolve(null);
                    }
                  } else {
                    console.log("No resume file found in storage");
                    resolve(null);
                  }
                });
              } else {
                resolve(null);
              }
            } catch (error) {
              console.error("Error getting resume file:", error);
              resolve(null);
            }
          });
        },
        
        // Upload resume to fields - IMPROVED WITH BETTER VERIFICATION
        uploadResume: async function(resumeInputs, resumeFile) {
          console.log("📎 Uploading resume to fields...");
          console.log("Resume file:", { name: resumeFile.name, size: resumeFile.size, type: resumeFile.type });
          
          let successCount = 0;
          
          for (let i = 0; i < resumeInputs.length; i++) {
            const input = resumeInputs[i];
            console.log(`Attempting upload to field ${i + 1}/${resumeInputs.length}`);
            
            try {
              // Clear existing files
              input.value = '';
              
              // Create DataTransfer
              const dt = new DataTransfer();
              dt.items.add(resumeFile);
              
              // Set files
              input.files = dt.files;
              
              // Trigger events
              input.dispatchEvent(new Event('change', { bubbles: true }));
              input.dispatchEvent(new Event('input', { bubbles: true }));
              
              await this.sleep(1500);
              
              // Enhanced verification
              const hasFiles = input.files && input.files.length > 0;
              const correctName = hasFiles && input.files[0].name === resumeFile.name;
              const correctSize = hasFiles && input.files[0].size === resumeFile.size;
              
              console.log(`Upload verification for field ${i + 1}:`, {
                hasFiles,
                correctName,
                correctSize,
                uploadedName: hasFiles ? input.files[0].name : 'none',
                expectedName: resumeFile.name
              });
              
              if (hasFiles && correctName && correctSize) {
                console.log(`✅ Upload successful to field ${i + 1}`);
                input.style.border = "3px solid #28a745";
                input.style.backgroundColor = "#d4edda";
                successCount++;
                
                // Add success indicator
                const successLabel = document.createElement('div');
                successLabel.style.cssText = `
                  color: #28a745; font-size: 12px; font-weight: bold;
                  margin-top: 5px; padding: 3px 6px;
                  background: #d4edda; border-radius: 3px;
                `;
                successLabel.textContent = `✅ ${resumeFile.name} uploaded`;
                input.parentElement.appendChild(successLabel);
                
              } else {
                console.log(`❌ Upload failed to field ${i + 1}`);
                input.style.border = "3px solid #dc3545";
                input.style.backgroundColor = "#f8d7da";
              }
              
            } catch (error) {
              console.error(`Error uploading to field ${i + 1}:`, error);
              input.style.border = "3px solid #dc3545";
              continue;
            }
          }
          
          console.log(`📊 Upload results: ${successCount}/${resumeInputs.length} fields successful`);
          return successCount > 0;
        },
        
        // Highlight fields
        highlightFields: function(inputs) {
          inputs.forEach(input => {
            input.style.border = "3px solid #ff6b6b";
            input.style.backgroundColor = "#fff5f5";
            input.style.boxShadow = "0 0 10px rgba(255, 107, 107, 0.5)";
          });
        },
        
        // Submit form - COMPREHENSIVE MULTI-STRATEGY IMPLEMENTATION
        submitForm: async function(modal) {
          console.log("🚀 === STARTING COMPREHENSIVE SUBMIT PROCESS ===");
          
          if (!modal) {
            console.log("❌ No modal provided to submit function");
            this.showMessage('No application form found to submit.');
            return false;
          }
          
          console.log("📋 Modal found, starting submit strategies...");
          
          // Strategy 1: Try LinkedIn-specific submit buttons
          console.log("📝 Strategy 1: LinkedIn-specific submit buttons");
          let success = await this.tryLinkedInSubmit(modal);
          if (success) {
            console.log("✅ LinkedIn submit strategy succeeded!");
            return true;
          }
          
          // Strategy 2: Try generic submit buttons
          console.log("📝 Strategy 2: Generic submit buttons");
          success = await this.tryGenericSubmit(modal);
          if (success) {
            console.log("✅ Generic submit strategy succeeded!");
            return true;
          }
          
          // Strategy 3: Try any button that looks like submit
          console.log("📝 Strategy 3: Any potential submit button");
          success = await this.tryAnySubmitButton(modal);
          if (success) {
            console.log("✅ Any button strategy succeeded!");
            return true;
          }
          
          // Strategy 4: Try direct form submission
          console.log("📝 Strategy 4: Direct form submission");
          success = await this.tryFormSubmit(modal);
          if (success) {
            console.log("✅ Form submission strategy succeeded!");
            return true;
          }
          
          console.log("❌ All submit strategies failed");
          this.showMessage('Could not automatically submit the application. Please submit manually using the LinkedIn submit button.');
          return false;
        },
        
        // Strategy 1: LinkedIn-specific submit
        tryLinkedInSubmit: async function(modal) {
          console.log("🔍 Trying LinkedIn-specific submit buttons...");
          
          const linkedinSelectors = [
            'button[aria-label*="Submit application"]',
            'button[aria-label*="Submit Application"]',
            'button[data-control-name="easy_apply_submit_button"]',
            'button[data-control-name*="submit"]',
            '.jobs-apply-form-footer button[aria-label*="Submit"]',
            '.artdeco-modal-footer button[aria-label*="Submit"]',
            'button[data-control-name="continue_application_form_submit"]'
          ];
          
          for (const selector of linkedinSelectors) {
            console.log(`🔍 Checking LinkedIn selector: ${selector}`);
            
            try {
              const buttons = modal.querySelectorAll(selector);
              console.log(`   Found ${buttons.length} buttons with this selector`);
              
              for (const button of buttons) {
                const result = await this.attemptButtonClick(button, 'LinkedIn Submit');
                if (result) return true;
              }
            } catch (error) {
              console.log(`   Selector failed: ${error.message}`);
            }
          }
          
          return false;
        },
        
        // Strategy 2: Generic submit buttons
        tryGenericSubmit: async function(modal) {
          console.log("🔍 Trying generic submit buttons...");
          
          const genericSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button.artdeco-button--primary'
          ];
          
          for (const selector of genericSelectors) {
            console.log(`🔍 Checking generic selector: ${selector}`);
            
            try {
              const buttons = modal.querySelectorAll(selector);
              console.log(`   Found ${buttons.length} buttons with this selector`);
              
              for (const button of buttons) {
                if (this.isLikelySubmitButton(button)) {
                  const result = await this.attemptButtonClick(button, 'Generic Submit');
                  if (result) return true;
                }
              }
            } catch (error) {
              console.log(`   Selector failed: ${error.message}`);
            }
          }
          
          return false;
        },
        
        // Strategy 3: Try any button that might submit
        tryAnySubmitButton: async function(modal) {
          console.log("🔍 Trying any button that might submit...");
          
          try {
            const allButtons = modal.querySelectorAll('button, input[type="button"], input[type="submit"]');
            console.log(`   Found ${allButtons.length} total buttons in modal`);
            
            const potentialSubmitButtons = [];
            
            for (const button of allButtons) {
              const score = this.calculateSubmitScore(button);
              if (score > 15) { // Threshold for considering as submit button
                potentialSubmitButtons.push({
                  button,
                  score,
                  text: (button.textContent || '').trim().substring(0, 50),
                  ariaLabel: (button.getAttribute('aria-label') || '').substring(0, 50)
                });
              }
            }
            
            // Sort by likelihood of being submit button
            potentialSubmitButtons.sort((a, b) => b.score - a.score);
            
            console.log(`   Found ${potentialSubmitButtons.length} potential submit buttons:`);
            potentialSubmitButtons.forEach((btn, i) => {
              console.log(`     ${i + 1}. "${btn.text}" (aria: "${btn.ariaLabel}") - score: ${btn.score}`);
            });
            
            // Try each button in order of likelihood
            for (const btnInfo of potentialSubmitButtons) {
              const result = await this.attemptButtonClick(btnInfo.button, 'Potential Submit');
              if (result) return true;
            }
            
          } catch (error) {
            console.log(`   Any button strategy failed: ${error.message}`);
          }
          
          return false;
        },
        
        // Strategy 4: Direct form submission
        tryFormSubmit: async function(modal) {
          console.log("🔍 Trying direct form submission...");
          
          try {
            const forms = modal.querySelectorAll('form');
            console.log(`   Found ${forms.length} forms in modal`);
            
            for (const form of forms) {
              console.log("📋 Attempting to submit form directly:", form);
              
              try {
                // Record state before submission
                const beforeUrl = window.location.href;
                
                // Trigger form submit event
                const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
                form.dispatchEvent(submitEvent);
                
                // Also try calling submit() method if available
                if (form.submit && typeof form.submit === 'function') {
                  console.log("   📤 Calling form.submit()");
                  form.submit();
                }
                
                await this.sleep(3000);
                
                // Check if submission worked
                const afterUrl = window.location.href;
                const stillOpen = this.isFormStillOpen();
                const completed = this.isApplicationComplete();
                
                console.log("   Form submit result:", {
                  urlChanged: beforeUrl !== afterUrl,
                  formStillOpen: stillOpen,
                  applicationComplete: completed
                });
                
                if (!stillOpen || completed || beforeUrl !== afterUrl) {
                  console.log("✅ Form submission appears successful");
                  return true;
                }
              } catch (error) {
                console.log(`   Form submit failed: ${error.message}`);
              }
            }
          } catch (error) {
            console.log(`   Direct form submission failed: ${error.message}`);
          }
          
          return false;
        },
        
        // Attempt to click a button with comprehensive verification
        attemptButtonClick: async function(button, strategy = 'Unknown') {
          if (!button) return false;
          
          const text = (button.textContent || '').trim().substring(0, 50);
          const ariaLabel = (button.getAttribute('aria-label') || '').substring(0, 50);
          
          console.log(`🎯 [${strategy}] Attempting to click button:`, {
            text,
            ariaLabel,
            disabled: button.disabled,
            visible: this.isButtonVisible(button)
          });
          
          if (button.disabled || !this.isButtonVisible(button)) {
            console.log(`   ❌ Button not clickable (disabled: ${button.disabled}, visible: ${this.isButtonVisible(button)})`);
            return false;
          }
          
          try {
            // Record state before clicking
            const beforeUrl = window.location.href;
            const beforeModal = this.findLinkedInModal();
            
            console.log("   📍 State before click:", {
              url: beforeUrl.substring(0, 100),
              hasModal: !!beforeModal
            });
            
            // Scroll to button and ensure it's in view
            button.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.sleep(1000);
            
            // Focus on button
            button.focus();
            await this.sleep(500);
            
            // Multiple click methods for maximum compatibility
            console.log("   🖱️ Executing click sequence...");
            
            // Method 1: Direct click
            button.click();
            
            // Method 2: Mouse event
            button.dispatchEvent(new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window
            }));
            
            // Method 3: If it's a submit button, also trigger form submit
            if (button.type === 'submit' || button.form) {
              const form = button.form || button.closest('form');
              if (form) {
                console.log("   📋 Also triggering form submit");
                form.dispatchEvent(new Event('submit', { bubbles: true }));
              }
            }
            
            // Wait for response
            await this.sleep(4000); // Longer wait for LinkedIn
            
            // Check what happened after click
            const afterUrl = window.location.href;
            const afterModal = this.findLinkedInModal();
            const applicationComplete = this.isApplicationComplete();
            
            console.log("   📍 State after click:", {
              urlChanged: beforeUrl !== afterUrl,
              modalChanged: beforeModal !== afterModal,
              modalStillExists: !!afterModal,
              applicationComplete
            });
            
            // Success conditions
            if (applicationComplete) {
              console.log("   ✅ Application completion detected!");
              return true;
            }
            
            if (beforeUrl !== afterUrl) {
              console.log("   ✅ URL changed - likely successful!");
              return true;
            }
            
            if (beforeModal && !afterModal) {
              console.log("   ✅ Modal disappeared - likely submitted!");
              return true;
            }
            
            if (!this.isFormStillOpen()) {
              console.log("   ✅ Form closed - submission likely successful!");
              return true;
            }
            
            // Check for new form step (multi-step application)
            if (afterModal && afterModal !== beforeModal) {
              console.log("   🔄 New modal/step detected - continuing application");
              return await this.fillFormWithControl(afterModal);
            }
            
            console.log("   ⚠️ Button clicked but no clear success indication");
            return false;
            
          } catch (error) {
            console.log(`   ❌ Click attempt failed: ${error.message}`);
            return false;
          }
        },
        
        // Check if button is visible
        isButtonVisible: function(button) {
          if (!button) return false;
          
          try {
            const style = window.getComputedStyle(button);
            const rect = button.getBoundingClientRect();
            
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   style.opacity !== '0' &&
                   rect.width > 0 && 
                   rect.height > 0;
          } catch (error) {
            return false;
          }
        },
        
        // Calculate submit button likelihood score
        calculateSubmitScore: function(button) {
          let score = 0;
          
          const text = (button.textContent || '').toLowerCase();
          const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
          const className = button.className.toLowerCase();
          const dataControl = (button.getAttribute('data-control-name') || '').toLowerCase();
          
          // High value terms
          if (text.includes('submit application') || ariaLabel.includes('submit application')) score += 100;
          if (text.includes('submit') || ariaLabel.includes('submit')) score += 50;
          if (button.type === 'submit') score += 40;
          if (dataControl.includes('submit')) score += 45;
          
          // Medium value terms
          if (text.includes('send application') || ariaLabel.includes('send application')) score += 35;
          if (text.includes('apply') || ariaLabel.includes('apply')) score += 25;
          if (text.includes('finish') || ariaLabel.includes('finish')) score += 20;
          
          // CSS class indicators
          if (className.includes('primary')) score += 20;
          if (className.includes('submit')) score += 30;
          if (className.includes('cta')) score += 15;
          
          // Button positioning (LinkedIn often puts submit buttons at bottom)
          const rect = button.getBoundingClientRect();
          const modalRect = button.closest('[role="dialog"]')?.getBoundingClientRect();
          if (modalRect && rect.bottom > modalRect.bottom - 100) score += 10; // Near bottom of modal
          
          // Negative indicators
          if (text.includes('cancel') || text.includes('back') || text.includes('previous')) score -= 50;
          if (text.includes('save') && !text.includes('submit')) score -= 20;
          if (text.includes('edit')) score -= 30;
          
          return score;
        },
        
        // Check if button is likely a submit button
        isLikelySubmitButton: function(button) {
          return this.calculateSubmitScore(button) > 15;
        },
        
        // Check if form is still open
        isFormOpen: function(modal) {
          if (!modal) return false;
          
          const style = window.getComputedStyle(modal);
          return style.display !== 'none' && style.visibility !== 'hidden';
        },
        
        // Check if form is still open (general)
        isFormStillOpen: function() {
          const modal = this.findLinkedInModal();
          return this.isFormOpen(modal);
        },
        
        // Check if application is complete - FIXED INVALID SELECTORS
        isApplicationComplete: function() {
          console.log("🔍 Checking if application is complete...");
          
          // Check for success messages (without invalid :contains selector)
          const successElements = document.querySelectorAll('.artdeco-inline-feedback--success, [class*="success"], h1, h2, .success-message');
          
          for (const element of successElements) {
            const text = element.textContent?.toLowerCase() || '';
            if (text.includes('application sent') || 
                text.includes('application submitted') || 
                text.includes('your application has been sent') ||
                text.includes('successfully submitted')) {
              console.log("✅ Found completion indicator:", text.substring(0, 50));
              return true;
            }
          }
          
          // Check URL for completion indicators
          const currentUrl = window.location.href.toLowerCase();
          if (currentUrl.includes('confirmation') || 
              currentUrl.includes('success') || 
              currentUrl.includes('submitted')) {
            console.log("✅ URL indicates completion:", currentUrl);
            return true;
          }
          
          console.log("❌ No completion indicators found");
          return false;
        },
        
        // Check if on job page
        isJobPage: function() {
          return window.location.href.includes('/jobs/view/') || 
                 window.location.href.includes('/jobs/collections/');
        },
        
        // Show message to user
        showMessage: function(message) {
          console.log("💬 Message:", message);
          // Could be enhanced with custom notification
          alert(message);
        },
        
        // Cleanup
        cleanup: function() {
          this.isProcessing = false;
          this.isPaused = false;
          this.userAction = null;
          
          setTimeout(() => {
            this.removeControlPanel();
          }, 5000);
        },
        
        // Remove control panel
        removeControlPanel: function() {
          const panel = document.getElementById('linkedin-control-panel');
          if (panel) panel.remove();
        },
        
        // Sleep utility
        sleep: function(ms) {
          return new Promise(resolve => setTimeout(resolve, ms));
        },
        
        // NEW: Improved resume upload process with better feedback
        handleResumeUploadProcess: async function(modal, resumeInputs, allFileInputs) {
          console.log("📎 Starting enhanced resume upload process...");
          
          // Use resume inputs if found, otherwise use all file inputs
          const targetInputs = resumeInputs.length > 0 ? resumeInputs : allFileInputs;
          console.log(`Using ${targetInputs.length} file input(s) for resume upload`);
          
          // First check if resume is already uploaded
          const existingResume = this.checkForExistingResume(modal);
          if (existingResume) {
            console.log("✅ Resume already uploaded:", existingResume);
            this.updateStatus('Resume Already Present', `Found: ${existingResume}`);
            
            const userConfirmed = await this.waitForUser('resume-already-uploaded');
            if (!userConfirmed) return false;
            
            return await this.clickNextButton(modal);
          }
          
          this.updateStatus('Resume Required', 'Attempting automatic upload...');
          
          // Try automatic upload first
          const resumeFile = await this.getStoredResumeFile();
          
          if (resumeFile) {
            console.log("📄 Found stored resume:", resumeFile.name);
            
            const uploadSuccess = await this.uploadResume(targetInputs, resumeFile);
            
            if (uploadSuccess) {
              console.log("✅ Automatic upload successful");
              this.updateStatus('Resume Uploaded Successfully', `Uploaded: ${resumeFile.name}`);
              
              // Wait for user to review and confirm
              const userConfirmed = await this.waitForUser('resume-uploaded');
              if (!userConfirmed) return false;
              
              return await this.clickNextButton(modal);
            } else {
              console.log("❌ Automatic upload failed, requesting manual upload");
              return await this.handleManualUpload(modal, targetInputs);
            }
          } else {
            console.log("📄 No stored resume found, requesting manual upload");
            return await this.handleManualUpload(modal, targetInputs);
          }
        },
        
        // Check for existing uploaded resume
        checkForExistingResume: function(modal) {
          console.log("🔍 Checking for existing uploaded resume...");
          
          // Look for file names in the modal
          const fileNameSelectors = [
            '.file-name', '.filename', '[class*="file-name"]', '[class*="filename"]',
            '.uploaded-file', '[class*="uploaded"]', '.attachment',
            'span[class*="file"]', 'div[class*="file"]'
          ];
          
          for (const selector of fileNameSelectors) {
            const fileElements = modal.querySelectorAll(selector);
            for (const element of fileElements) {
              const text = element.textContent?.trim();
              if (text && (text.includes('.pdf') || text.includes('.doc') || text.includes('.docx'))) {
                console.log("✅ Found existing file:", text);
                return text;
              }
            }
          }
          
          // Check file inputs for existing files
          const fileInputs = modal.querySelectorAll('input[type="file"]');
          for (const input of fileInputs) {
            if (input.files && input.files.length > 0) {
              const fileName = input.files[0].name;
              console.log("✅ Found file in input:", fileName);
              return fileName;
            }
          }
          
          // Look for any text that looks like a filename
          const modalText = modal.textContent || '';
          const filePattern = /[\w\-\s]+\.(pdf|doc|docx|txt)/gi;
          const matches = modalText.match(filePattern);
          if (matches && matches.length > 0) {
            console.log("✅ Found filename in text:", matches[0]);
            return matches[0];
          }
          
          console.log("❌ No existing resume found");
          return null;
        },
        
        // Handle manual upload with control
        handleManualUpload: async function(modal, resumeInputs) {
          this.updateStatus('Manual Upload Required', 'Please upload your resume');
          this.highlightFields(resumeInputs);
          
          const uploadConfirmed = await this.waitForUser('manual-upload');
          if (!uploadConfirmed) return false;
          
          // Verify upload
          const hasFiles = resumeInputs.some(input => input.files && input.files.length > 0);
          if (!hasFiles) {
            this.showMessage('No resume file detected. Please upload a file first.');
            return await this.handleManualUpload(modal, resumeInputs);
          }
          
          this.updateStatus('Resume Verified', 'Manual upload successful - proceeding');
          return await this.clickNextButton(modal);
        },
        
        // DEBUGGING: Comprehensive page analysis for LinkedIn
        debugLinkedInPage: function() {
          console.log("🔧 === COMPREHENSIVE LINKEDIN PAGE DEBUG ===");
          console.log("📍 URL:", window.location.href);
          console.log("📍 Title:", document.title);
          
          // Find ALL potential modals/dialogs
          console.log("\n🔍 === MODAL DETECTION ===");
          const allModals = document.querySelectorAll(
            '[role="dialog"], .modal, [class*="modal"], .artdeco-modal, ' +
            '[aria-modal="true"], .jobs-easy-apply, [class*="easy-apply"], ' +
            '[class*="apply"], .overlay, .popup, [class*="popup"]'
          );
          
          console.log(`Found ${allModals.length} potential modal elements:`);
          allModals.forEach((modal, i) => {
            const style = window.getComputedStyle(modal);
            const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            console.log(`  ${i + 1}. ${modal.tagName}.${modal.className} - visible: ${isVisible}`);
            console.log(`     Text sample: "${modal.textContent?.substring(0, 100)}"`);
            if (isVisible) {
              console.log(`     ✅ VISIBLE MODAL FOUND:`, modal);
            }
          });
          
          // Find ALL buttons
          console.log("\n🔍 === BUTTON ANALYSIS ===");
          const allButtons = document.querySelectorAll('button, input[type="button"], input[type="submit"], a[role="button"]');
          console.log(`Found ${allButtons.length} total buttons on page`);
          
          const relevantButtons = [];
          allButtons.forEach((btn, i) => {
            const text = btn.textContent?.toLowerCase() || '';
            const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
            const dataControl = btn.getAttribute('data-control-name') || '';
            const style = window.getComputedStyle(btn);
            const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
            
            if (text.includes('apply') || text.includes('next') || text.includes('continue') || 
                text.includes('submit') || text.includes('review') ||
                ariaLabel.includes('apply') || ariaLabel.includes('next') || 
                ariaLabel.includes('continue') || ariaLabel.includes('submit') || ariaLabel.includes('review')) {
              relevantButtons.push({
                index: i,
                text: text.substring(0, 50),
                ariaLabel: ariaLabel.substring(0, 50),
                dataControl,
                visible: isVisible,
                element: btn
              });
            }
          });
          
          console.log(`Found ${relevantButtons.length} relevant buttons:`);
          relevantButtons.forEach((btn, i) => {
            console.log(`  ${i + 1}. "${btn.text}" (aria: "${btn.ariaLabel}") - visible: ${btn.visible}`);
            console.log(`     data-control: ${btn.dataControl}`);
            if (btn.visible) {
              console.log(`     ✅ VISIBLE RELEVANT BUTTON:`, btn.element);
            }
          });
          
          // Find ALL form elements
          console.log("\n🔍 === FORM ELEMENT ANALYSIS ===");
          const formElements = {
            forms: document.querySelectorAll('form').length,
            inputs: document.querySelectorAll('input').length,
            textInputs: document.querySelectorAll('input[type="text"], input[type="tel"], input[type="email"]').length,
            fileInputs: document.querySelectorAll('input[type="file"]').length,
            textareas: document.querySelectorAll('textarea').length,
            selects: document.querySelectorAll('select').length,
            radios: document.querySelectorAll('input[type="radio"]').length
          };
          
          console.log("Form elements found:", formElements);
          
          // Look for file inputs specifically
          const fileInputs = document.querySelectorAll('input[type="file"]');
          if (fileInputs.length > 0) {
            console.log(`\n📎 Found ${fileInputs.length} file inputs:`);
            fileInputs.forEach((input, i) => {
              const style = window.getComputedStyle(input);
              const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
              console.log(`  ${i + 1}. Visible: ${isVisible}, Has files: ${input.files?.length || 0}`);
              console.log(`     Context: "${input.parentElement?.textContent?.substring(0, 100)}"`);
            });
          }
          
          // Return summary
          return {
            url: window.location.href,
            modals: allModals.length,
            visibleModals: Array.from(allModals).filter(m => {
              const style = window.getComputedStyle(m);
              return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            }).length,
            relevantButtons: relevantButtons.length,
            visibleRelevantButtons: relevantButtons.filter(b => b.visible).length,
            formElements
          };
        },
        
        // ENHANCED STANDARD JOB APPLICATION FUNCTIONALITY
        
        // Main function for standard/external job applications
        applyToStandardJob: async function() {
          console.log("🚀 Starting standard job application...");
          
          if (this.isProcessing) {
            alert('Process already running. Please wait or stop first.');
            return false;
          }
          
          this.isProcessing = true;
          this.isPaused = false;
          this.userAction = null;
          
          // Create control panel
          this.createControlPanel();
          
          try {
            // Step 1: Detect external site and ATS
            this.updateStatus('Detecting Site', 'Identifying ATS system and job context');
            const strategy = this.detectExternalSiteStrategy();
            
            if (!strategy) {
              this.updateStatus('Site Not Supported', 'This external site is not supported');
              this.showMessage('External site not supported. Only LinkedIn Easy Apply and major ATS systems are supported.');
              this.cleanup();
              return false;
            }
            
            // Step 2: Check if we're in application flow
            this.updateStatus('Checking Application Flow', 'Determining if we are on an application page');
            const inApplicationFlow = strategy.isInApplicationFlow();
            
            if (!inApplicationFlow) {
              // Try to find and click the apply button
              const applyButton = strategy.findExternalApplyButton();
              
              if (!applyButton) {
                this.updateStatus('No Apply Button', 'Could not find apply button on this page');
                this.showMessage('Could not find apply button. Please navigate to the job page and try again.');
                this.cleanup();
                return false;
              }
              
              // Click apply button
              this.updateStatus('Clicking Apply', 'Clicking the apply button to start application');
              await this.clickExternalApplyButton(applyButton);
              await this.sleep(3000); // Wait for application form to load
            }
            
            // Step 3: Find application form
            this.updateStatus('Finding Application Form', 'Looking for application form on the page');
            const form = strategy.findApplicationForm();
            
            if (!form) {
              this.updateStatus('No Form Found', 'Could not find application form');
              this.showMessage('Could not find application form. Please start the application manually.');
              this.cleanup();
              return false;
            }
            
            console.log("✅ Application form found:", form);
            
            // Step 4: Get user confirmation to start
            this.updateStatus('Ready to Fill Form', 'Application form found - click Continue to start filling');
            const startConfirmed = await this.waitForUser('start-external');
            if (!startConfirmed) {
              this.cleanup();
              return false;
            }
            
            // Step 5: Fill the external form
            this.updateStatus('Filling Application Form', 'Working through external application form');
            const success = await this.fillExternalForm(form, strategy);
            
            // Step 6: Final result
            if (success) {
              this.updateStatus('Application Complete! ✅', 'Successfully filled external application');
              this.showMessage('🎉 External application filled successfully! Please review and submit manually.');
            } else {
              this.updateStatus('Process Stopped', 'Application was not completed');
              this.showMessage('Application process was stopped or failed.');
            }
            
            this.cleanup();
            return success;
            
          } catch (error) {
            console.error("Error in standard job application:", error);
            this.updateStatus('Error Occurred', error.message);
            this.showMessage('Error: ' + error.message);
            this.cleanup();
            return false;
          }
        },
        
        // Detect external site strategy
        detectExternalSiteStrategy: function() {
          // Use the existing strategy factory from jobSiteStrategy.js
          if (window.StrategyFactory) {
            const site = window.SiteDetector ? window.SiteDetector.detectSite() : { name: 'external' };
            return window.StrategyFactory.createStrategy(site.name);
          }
          
          // Fallback detection
          const url = window.location.hostname.toLowerCase();
          
          if (url.includes('workday') || url.includes('myworkdayjobs')) {
            return new ExternalSiteStrategy();
          } else if (url.includes('greenhouse')) {
            return new ExternalSiteStrategy();
          } else if (url.includes('lever')) {
            return new ExternalSiteStrategy();
          } else if (url.includes('bamboohr') || url.includes('icims') || 
                     url.includes('taleo') || url.includes('smartrecruiters')) {
            return new ExternalSiteStrategy();
          }
          
          return null;
        },
        
        // Click external apply button
        clickExternalApplyButton: async function(button) {
          button.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await this.sleep(1000);
          
          // Focus and click
          button.focus();
          button.click();
          
          // Also dispatch events
          button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          
          await this.sleep(2000);
        },
        
        // Fill external application form
        fillExternalForm: async function(form, strategy) {
          try {
            console.log("📋 Starting external form filling...");
            
            // Get user profile data
            const userData = await this.getUserData();
            if (!userData) {
              this.showMessage('No user profile found. Please set up your profile in the extension popup.');
              return false;
            }
            
            // Use the advanced form analyzer for complex forms
            let formAnalysis;
            if (window.ComplexFormAnalyzer) {
              const analyzer = new window.ComplexFormAnalyzer();
              formAnalysis = await analyzer.analyzeApplicationForm(form);
            } else {
              // Fallback to basic field detection
              formAnalysis = this.analyzeBasicForm(form);
            }
            
            if (!formAnalysis || !formAnalysis.fields || formAnalysis.fields.length === 0) {
              this.showMessage('Could not analyze form fields. Please fill manually.');
              return false;
            }
            
            console.log("Form analysis complete:", formAnalysis);
            
            // Fill fields step by step with user confirmation
            for (const field of formAnalysis.fields) {
              if (field.type === 'file') {
                // Handle file uploads
                const uploaded = await this.handleFileUpload(field, userData);
                if (!uploaded) {
                  this.updateStatus('Manual Upload Required', `Please upload ${field.label} manually`);
                  const continueConfirmed = await this.waitForUser('manual-upload');
                  if (!continueConfirmed) return false;
                }
              } else {
                // Fill text fields
                const value = this.getFieldValue(field, userData);
                if (value) {
                  this.fillField(field.element, value);
                  await this.sleep(500); // Small delay between fields
                }
              }
            }
            
            // Check for multi-step form
            const nextButton = strategy.findNextButton();
            if (nextButton) {
              this.updateStatus('Multi-step Form', 'This form has multiple steps');
              const continueConfirmed = await this.waitForUser('next-step');
              if (continueConfirmed) {
                nextButton.click();
                await this.sleep(2000);
                
                // Recursively handle next step
                const nextForm = strategy.findApplicationForm();
                if (nextForm && nextForm !== form) {
                  return await this.fillExternalForm(nextForm, strategy);
                }
              }
            }
            
            // Final step - offer to submit
            const submitButton = strategy.findSubmitButton();
            if (submitButton && this.isValidSubmitButton(submitButton)) {
              this.updateStatus('Ready to Submit', 'Form filled - ready for submission');
              const submitConfirmed = await this.waitForUser('external-submit');
              
              if (submitConfirmed) {
                return await this.clickExternalSubmitButton(submitButton, strategy);
              }
            } else {
              this.updateStatus('Manual Submit Required', 'Please review and submit the form manually');
              this.showMessage('Form has been filled. Please review all fields and submit manually.');
            }
            
            return true;
            
          } catch (error) {
            console.error("Error filling external form:", error);
            this.showMessage('Error filling form: ' + error.message);
            return false;
          }
        },
        
        // ENHANCED SUBMIT FUNCTIONALITY WITH COMPREHENSIVE DEBUGGING
        
        // Main submit function with multiple strategies
        submitForm: async function(modal) {
          console.log("🚀 === STARTING COMPREHENSIVE SUBMIT PROCESS ===");
          
          if (!modal) {
            console.log("❌ No modal provided to submit function");
            this.showMessage('No application form found to submit.');
            return false;
          }
          
          console.log("📋 Modal found, starting submit strategies...");
          
          // Strategy 1: Try LinkedIn-specific submit buttons
          console.log("📝 Strategy 1: LinkedIn-specific submit buttons");
          let success = await this.tryLinkedInSubmit(modal);
          if (success) {
            console.log("✅ LinkedIn submit strategy succeeded!");
            return true;
          }
          
          // Strategy 2: Try generic submit buttons
          console.log("📝 Strategy 2: Generic submit buttons");
          success = await this.tryGenericSubmit(modal);
          if (success) {
            console.log("✅ Generic submit strategy succeeded!");
            return true;
          }
          
          // Strategy 3: Try any button that looks like submit
          console.log("📝 Strategy 3: Any potential submit button");
          success = await this.tryAnySubmitButton(modal);
          if (success) {
            console.log("✅ Any button strategy succeeded!");
            return true;
          }
          
          // Strategy 4: Try direct form submission
          console.log("📝 Strategy 4: Direct form submission");
          success = await this.tryFormSubmit(modal);
          if (success) {
            console.log("✅ Form submission strategy succeeded!");
            return true;
          }
          
          console.log("❌ All submit strategies failed");
          this.showMessage('Could not automatically submit the application. Please submit manually using the LinkedIn submit button.');
          return false;
        },
        
        // Strategy 1: LinkedIn-specific submit
        tryLinkedInSubmit: async function(modal) {
          console.log("🔍 Trying LinkedIn-specific submit buttons...");
          
          const linkedinSelectors = [
            'button[aria-label*="Submit application"]',
            'button[aria-label*="Submit Application"]',
            'button[data-control-name="easy_apply_submit_button"]',
            'button[data-control-name*="submit"]',
            '.jobs-apply-form-footer button[aria-label*="Submit"]',
            '.artdeco-modal-footer button[aria-label*="Submit"]',
            'button[data-control-name="continue_application_form_submit"]'
          ];
          
          for (const selector of linkedinSelectors) {
            console.log(`🔍 Checking LinkedIn selector: ${selector}`);
            
            try {
              const buttons = modal.querySelectorAll(selector);
              console.log(`   Found ${buttons.length} buttons with this selector`);
              
              for (const button of buttons) {
                const result = await this.attemptButtonClick(button, 'LinkedIn Submit');
                if (result) return true;
              }
            } catch (error) {
              console.log(`   Selector failed: ${error.message}`);
            }
          }
          
          return false;
        },
        
        // Strategy 2: Generic submit buttons
        tryGenericSubmit: async function(modal) {
          console.log("🔍 Trying generic submit buttons...");
          
          const genericSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button.artdeco-button--primary'
          ];
          
          for (const selector of genericSelectors) {
            console.log(`🔍 Checking generic selector: ${selector}`);
            
            try {
              const buttons = modal.querySelectorAll(selector);
              console.log(`   Found ${buttons.length} buttons with this selector`);
              
              for (const button of buttons) {
                if (this.isLikelySubmitButton(button)) {
                  const result = await this.attemptButtonClick(button, 'Generic Submit');
                  if (result) return true;
                }
              }
            } catch (error) {
              console.log(`   Selector failed: ${error.message}`);
            }
          }
          
          return false;
        },
        
        // Strategy 3: Try any button that might submit
        tryAnySubmitButton: async function(modal) {
          console.log("🔍 Trying any button that might submit...");
          
          try {
            const allButtons = modal.querySelectorAll('button, input[type="button"], input[type="submit"]');
            console.log(`   Found ${allButtons.length} total buttons in modal`);
            
            const potentialSubmitButtons = [];
            
            for (const button of allButtons) {
              const score = this.calculateSubmitScore(button);
              if (score > 15) { // Threshold for considering as submit button
                potentialSubmitButtons.push({
                  button,
                  score,
                  text: (button.textContent || '').trim().substring(0, 50),
                  ariaLabel: (button.getAttribute('aria-label') || '').substring(0, 50)
                });
              }
            }
            
            // Sort by likelihood of being submit button
            potentialSubmitButtons.sort((a, b) => b.score - a.score);
            
            console.log(`   Found ${potentialSubmitButtons.length} potential submit buttons:`);
            potentialSubmitButtons.forEach((btn, i) => {
              console.log(`     ${i + 1}. "${btn.text}" (aria: "${btn.ariaLabel}") - score: ${btn.score}`);
            });
            
            // Try each button in order of likelihood
            for (const btnInfo of potentialSubmitButtons) {
              const result = await this.attemptButtonClick(btnInfo.button, 'Potential Submit');
              if (result) return true;
            }
            
          } catch (error) {
            console.log(`   Any button strategy failed: ${error.message}`);
          }
          
          return false;
        },
        
        // Strategy 4: Direct form submission
        tryFormSubmit: async function(modal) {
          console.log("🔍 Trying direct form submission...");
          
          try {
            const forms = modal.querySelectorAll('form');
            console.log(`   Found ${forms.length} forms in modal`);
            
            for (const form of forms) {
              console.log("📋 Attempting to submit form directly:", form);
              
              try {
                // Record state before submission
                const beforeUrl = window.location.href;
                
                // Trigger form submit event
                const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
                form.dispatchEvent(submitEvent);
                
                // Also try calling submit() method if available
                if (form.submit && typeof form.submit === 'function') {
                  console.log("   📤 Calling form.submit()");
                  form.submit();
                }
                
                await this.sleep(3000);
                
                // Check if submission worked
                const afterUrl = window.location.href;
                const stillOpen = this.isFormStillOpen();
                const completed = this.isApplicationComplete();
                
                console.log("   Form submit result:", {
                  urlChanged: beforeUrl !== afterUrl,
                  formStillOpen: stillOpen,
                  applicationComplete: completed
                });
                
                if (!stillOpen || completed || beforeUrl !== afterUrl) {
                  console.log("✅ Form submission appears successful");
                  return true;
                }
              } catch (error) {
                console.log(`   Form submit failed: ${error.message}`);
              }
            }
          } catch (error) {
            console.log(`   Direct form submission failed: ${error.message}`);
          }
          
          return false;
        },
        
        // Attempt to click a button with comprehensive verification
        attemptButtonClick: async function(button, strategy = 'Unknown') {
          if (!button) return false;
          
          const text = (button.textContent || '').trim().substring(0, 50);
          const ariaLabel = (button.getAttribute('aria-label') || '').substring(0, 50);
          
          console.log(`🎯 [${strategy}] Attempting to click button:`, {
            text,
            ariaLabel,
            disabled: button.disabled,
            visible: this.isButtonVisible(button)
          });
          
          if (button.disabled || !this.isButtonVisible(button)) {
            console.log(`   ❌ Button not clickable (disabled: ${button.disabled}, visible: ${this.isButtonVisible(button)})`);
            return false;
          }
          
          try {
            // Record state before clicking
            const beforeUrl = window.location.href;
            const beforeModal = this.findLinkedInModal();
            
            console.log("   📍 State before click:", {
              url: beforeUrl.substring(0, 100),
              hasModal: !!beforeModal
            });
            
            // Scroll to button and ensure it's in view
            button.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.sleep(1000);
            
            // Focus on button
            button.focus();
            await this.sleep(500);
            
            // Multiple click methods for maximum compatibility
            console.log("   🖱️ Executing click sequence...");
            
            // Method 1: Direct click
            button.click();
            
            // Method 2: Mouse event
            button.dispatchEvent(new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window
            }));
            
            // Method 3: If it's a submit button, also trigger form submit
            if (button.type === 'submit' || button.form) {
              const form = button.form || button.closest('form');
              if (form) {
                console.log("   📋 Also triggering form submit");
                form.dispatchEvent(new Event('submit', { bubbles: true }));
              }
            }
            
            // Wait for response
            await this.sleep(4000); // Longer wait for LinkedIn
            
            // Check what happened after click
            const afterUrl = window.location.href;
            const afterModal = this.findLinkedInModal();
            const applicationComplete = this.isApplicationComplete();
            
            console.log("   📍 State after click:", {
              urlChanged: beforeUrl !== afterUrl,
              modalChanged: beforeModal !== afterModal,
              modalStillExists: !!afterModal,
              applicationComplete
            });
            
            // Success conditions
            if (applicationComplete) {
              console.log("   ✅ Application completion detected!");
              return true;
            }
            
            if (beforeUrl !== afterUrl) {
              console.log("   ✅ URL changed - likely successful!");
              return true;
            }
            
            if (beforeModal && !afterModal) {
              console.log("   ✅ Modal disappeared - likely submitted!");
              return true;
            }
            
            if (!this.isFormStillOpen()) {
              console.log("   ✅ Form closed - submission likely successful!");
              return true;
            }
            
            // Check for new form step (multi-step application)
            if (afterModal && afterModal !== beforeModal) {
              console.log("   🔄 New modal/step detected - continuing application");
              return await this.fillFormWithControl(afterModal);
            }
            
            console.log("   ⚠️ Button clicked but no clear success indication");
            return false;
            
          } catch (error) {
            console.log(`   ❌ Click attempt failed: ${error.message}`);
            return false;
          }
        },
        
        // Check if button is visible
        isButtonVisible: function(button) {
          if (!button) return false;
          
          try {
            const style = window.getComputedStyle(button);
            const rect = button.getBoundingClientRect();
            
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   style.opacity !== '0' &&
                   rect.width > 0 && 
                   rect.height > 0;
          } catch (error) {
            return false;
          }
        },
        
        // Calculate submit button likelihood score
        calculateSubmitScore: function(button) {
          let score = 0;
          
          const text = (button.textContent || '').toLowerCase();
          const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
          const className = button.className.toLowerCase();
          const dataControl = (button.getAttribute('data-control-name') || '').toLowerCase();
          
          // High value terms
          if (text.includes('submit application') || ariaLabel.includes('submit application')) score += 100;
          if (text.includes('submit') || ariaLabel.includes('submit')) score += 50;
          if (button.type === 'submit') score += 40;
          if (dataControl.includes('submit')) score += 45;
          
          // Medium value terms
          if (text.includes('send application') || ariaLabel.includes('send application')) score += 35;
          if (text.includes('apply') || ariaLabel.includes('apply')) score += 25;
          if (text.includes('finish') || ariaLabel.includes('finish')) score += 20;
          
          // CSS class indicators
          if (className.includes('primary')) score += 20;
          if (className.includes('submit')) score += 30;
          if (className.includes('cta')) score += 15;
          
          // Button positioning (LinkedIn often puts submit buttons at bottom)
          const rect = button.getBoundingClientRect();
          const modalRect = button.closest('[role="dialog"]')?.getBoundingClientRect();
          if (modalRect && rect.bottom > modalRect.bottom - 100) score += 10; // Near bottom of modal
          
          // Negative indicators
          if (text.includes('cancel') || text.includes('back') || text.includes('previous')) score -= 50;
          if (text.includes('save') && !text.includes('submit')) score -= 20;
          if (text.includes('edit')) score -= 30;
          
          return score;
        },
        
        // Check if button is likely a submit button
        isLikelySubmitButton: function(button) {
          return this.calculateSubmitScore(button) > 15;
        },
        
        // TEST USER ACTION FLOW
        testUserAction: async function() {
          console.log("🧪 === TESTING USER ACTION FLOW ===");
          this.createControlPanel();
          
          this.updateStatus('Testing Mode', 'Testing user action flow');
          
          const result = await this.waitForUser('start');
          console.log("User action result:", result);
          
          this.updateStatus('Test Complete', result ? 'User clicked Continue' : 'User clicked Stop');
        },
        
        // DEBUG: Manual submit testing
        debugSubmit: function() {
          console.log("🔧 === MANUAL SUBMIT DEBUG ===");
          
          const modal = this.findLinkedInModal();
          if (!modal) {
            console.log("❌ No modal found for submit testing");
            alert('No LinkedIn modal found. Please open an Easy Apply form first.');
            return;
          }
          
          console.log("✅ Modal found, analyzing submit options...");
          
          // Find all potential submit buttons
          const allButtons = modal.querySelectorAll('button, input[type="submit"], input[type="button"]');
          console.log(`Found ${allButtons.length} total buttons in modal`);
          
          const submitCandidates = [];
          
          allButtons.forEach((button, i) => {
            const text = (button.textContent || '').trim();
            const ariaLabel = button.getAttribute('aria-label') || '';
            const score = this.calculateSubmitScore(button);
            const visible = this.isButtonVisible(button);
            
            submitCandidates.push({
              index: i,
              button,
              text: text.substring(0, 50),
              ariaLabel: ariaLabel.substring(0, 50),
              score,
              visible,
              disabled: button.disabled
            });
          });
          
          // Sort by score
          submitCandidates.sort((a, b) => b.score - a.score);
          
          console.log("Submit button candidates (sorted by likelihood):");
          submitCandidates.forEach((candidate, i) => {
            console.log(`${i + 1}. Score: ${candidate.score}, Text: "${candidate.text}", Aria: "${candidate.ariaLabel}", Visible: ${candidate.visible}, Disabled: ${candidate.disabled}`);
          });
          
          alert(`Found ${submitCandidates.length} potential submit buttons. Check console for details. Top candidate: "${submitCandidates[0]?.text}" (score: ${submitCandidates[0]?.score})`);
          
          return submitCandidates;
        },
        
        // TEST SUBMIT FUNCTIONALITY
        testSubmit: async function() {
          console.log("🧪 === TESTING SUBMIT FUNCTIONALITY ===");
          
          const modal = this.findLinkedInModal();
          if (!modal) {
            alert('No LinkedIn modal found. Please open an Easy Apply form first.');
            return;
          }
          
          console.log("Testing submit on current modal...");
          
          this.createControlPanel();
          this.updateStatus('Testing Submit', 'Running submit test on current form');
          
          const success = await this.submitForm(modal);
          
          this.updateStatus('Submit Test Complete', success ? 'Submit test succeeded' : 'Submit test failed');
          alert(`Submit test ${success ? 'SUCCEEDED' : 'FAILED'}. Check console for details.`);
          
          return success;
        },
        
        // SIMPLE AND DIRECT SUBMIT FUNCTION
        simpleSubmit: async function(modal) {
          console.log("🎯 === SIMPLE DIRECT SUBMIT ATTEMPT ===");
          
          if (!modal) {
            console.log("❌ No modal provided");
            return false;
          }
          
          // Find the most obvious submit button - FIXED SELECTORS
          const submitSelectors = [
            'button[aria-label*="Submit application"]',
            'button[aria-label*="Submit Application"]', 
            'button[type="submit"]',
            'input[type="submit"]'
          ];
          
          console.log("🔍 Looking for submit buttons...");
          
          for (const selector of submitSelectors) {
            try {
              const buttons = modal.querySelectorAll(selector);
              console.log(`Selector "${selector}": found ${buttons.length} buttons`);
              
              for (const button of buttons) {
                const text = button.textContent?.toLowerCase() || '';
                const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
                
                console.log(`Checking button: text="${text}", aria="${ariaLabel}", disabled=${button.disabled}`);
                
                if ((text.includes('submit') || ariaLabel.includes('submit')) && !button.disabled) {
                  console.log("🎯 Found submit button, attempting click...");
                  
                  // Simple, direct click
                  try {
                    button.scrollIntoView();
                    await this.sleep(1000);
                    button.focus();
                    await this.sleep(500);
                    
                    console.log("Clicking submit button now...");
                    button.click();
                    
                    await this.sleep(5000); // Wait longer for submission
                    
                    // Check if it worked
                    const newModal = this.findLinkedInModal();
                    const completed = this.isApplicationComplete();
                    
                    console.log("After submit click:", {
                      modalExists: !!newModal,
                      sameModal: newModal === modal,
                      completed
                    });
                    
                    if (!newModal || completed) {
                      console.log("✅ Submit appears successful!");
                      return true;
                    }
                  } catch (error) {
                    console.log("Submit click failed:", error);
                  }
                }
              }
            } catch (error) {
              console.log(`Selector failed: ${error.message}`);
            }
          }
          
          // ALSO CHECK FOR TEXT-BASED SUBMIT BUTTONS
          console.log("🔍 Looking for text-based submit buttons...");
          const allButtons = modal.querySelectorAll('button');
          
          for (const button of allButtons) {
            const text = button.textContent?.toLowerCase() || '';
            const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
            
            if ((text.includes('submit') || ariaLabel.includes('submit')) && !button.disabled) {
              console.log("🎯 Found text-based submit button, attempting click...");
              
              try {
                button.scrollIntoView();
                await this.sleep(1000);
                button.focus();
                await this.sleep(500);
                
                console.log("Clicking submit button now...");
                button.click();
                
                await this.sleep(5000);
                
                const newModal = this.findLinkedInModal();
                const completed = this.isApplicationComplete();
                
                if (!newModal || completed) {
                  console.log("✅ Submit appears successful!");
                  return true;
                }
              } catch (error) {
                console.log("Submit click failed:", error);
              }
            }
          }
          
          console.log("❌ Simple submit failed");
          return false;
        },
        
        // MANUAL SUBMIT HELPER
        manualSubmitHelper: function() {
          console.log("🔧 === MANUAL SUBMIT HELPER ===");
          
          const modal = this.findLinkedInModal();
          if (!modal) {
            alert('No LinkedIn modal found. Please open an Easy Apply form first.');
            return;
          }
          
          // Highlight all potential submit buttons
          const allButtons = modal.querySelectorAll('button, input[type="submit"]');
          const submitButtons = [];
          
          allButtons.forEach((button, i) => {
            const text = button.textContent?.toLowerCase() || '';
            const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
            
            if (text.includes('submit') || ariaLabel.includes('submit') || button.type === 'submit') {
              button.style.border = '5px solid red';
              button.style.backgroundColor = 'yellow';
              button.style.zIndex = '99999';
              
              submitButtons.push({
                index: i,
                text: text.substring(0, 50),
                ariaLabel: ariaLabel.substring(0, 50),
                element: button
              });
            }
          });
          
          console.log(`Found ${submitButtons.length} potential submit buttons:`);
          submitButtons.forEach((btn, i) => {
            console.log(`${i + 1}. "${btn.text}" (aria: "${btn.ariaLabel}")`);
          });
          
          if (submitButtons.length > 0) {
            alert(`Found ${submitButtons.length} potential submit buttons (highlighted in red/yellow). Check console for details.`);
          } else {
            alert('No submit buttons found in the current modal.');
          }
          
          return submitButtons;
        },
        
        // FORCE SUBMIT (last resort)
        forceSubmit: async function() {
          console.log("⚡ === FORCE SUBMIT (LAST RESORT) ===");
          
          const modal = this.findLinkedInModal();
          if (!modal) {
            alert('No LinkedIn modal found.');
            return false;
          }
          
          // Try to submit any form in the modal
          const forms = modal.querySelectorAll('form');
          console.log(`Found ${forms.length} forms in modal`);
          
          for (const form of forms) {
            try {
              console.log("Attempting to submit form:", form);
              
              // Try multiple submission methods
              if (form.submit) {
                form.submit();
                console.log("Called form.submit()");
              }
              
              form.dispatchEvent(new Event('submit', { bubbles: true }));
              console.log("Dispatched submit event");
              
              // Also try to click any button in the form
              const formButtons = form.querySelectorAll('button');
              for (const btn of formButtons) {
                if (!btn.disabled) {
                  console.log("Clicking form button:", btn.textContent);
                  btn.click();
                  break;
                }
              }
              
              await this.sleep(3000);
              
              // Check if it worked
              if (!this.findLinkedInModal() || this.isApplicationComplete()) {
                console.log("✅ Force submit appears successful!");
                return true;
              }
              
            } catch (error) {
              console.log("Force submit attempt failed:", error);
            }
          }
          
          console.log("❌ Force submit failed");
          return false;
        },
        
        // ENHANCED SUBMIT WITH BETTER ERROR HANDLING
        enhancedSubmit: async function(modal) {
          console.log("🚀 === ENHANCED SUBMIT WITH DEBUGGING ===");
          
          if (!modal) {
            console.log("❌ No modal provided");
            this.showMessage('No application form found.');
            return false;
          }
          
          // Step 1: Simple submit
          console.log("Step 1: Trying simple submit...");
          let success = await this.simpleSubmit(modal);
          if (success) {
            console.log("✅ Simple submit succeeded!");
            return true;
          }
          
          // Step 2: Manual helper (show user where submit buttons are)
          console.log("Step 2: Running manual submit helper...");
          const submitButtons = this.manualSubmitHelper();
          
          if (submitButtons.length > 0) {
            // Try clicking the most promising button
            const bestButton = submitButtons[0];
            console.log("Trying to click best submit button:", bestButton.text);
            
            try {
              bestButton.element.scrollIntoView();
              await this.sleep(1000);
              bestButton.element.click();
              await this.sleep(5000);
              
              if (!this.findLinkedInModal() || this.isApplicationComplete()) {
                console.log("✅ Manual helper submit succeeded!");
                return true;
              }
            } catch (error) {
              console.log("Manual helper submit failed:", error);
            }
          }
          
          // Step 3: Force submit
          console.log("Step 3: Trying force submit...");
          success = await this.forceSubmit();
          if (success) {
            console.log("✅ Force submit succeeded!");
            return true;
          }
          
          // Step 4: Give up and ask user
          console.log("❌ All submit methods failed");
          this.showMessage('Unable to automatically submit the application. Please click the Submit button manually. Look for the button highlighted in red/yellow.');
          
          return false;
        },
        
        // FOOLPROOF SIMPLE SUBMIT - DIRECTLY TARGET "SUBMIT APPLICATION" BUTTON
        foolproofSubmit: async function() {
          console.log("🎯 === FOOLPROOF SUBMIT - FINDING 'SUBMIT APPLICATION' BUTTON ===");
          
          // Find ALL buttons on the page
          const allButtons = document.querySelectorAll('button');
          console.log(`Found ${allButtons.length} total buttons on page`);
          
          let submitButton = null;
          
          // Look for button with "Submit application" text
          for (const button of allButtons) {
            const text = button.textContent?.trim() || '';
            const ariaLabel = button.getAttribute('aria-label') || '';
            
            console.log(`Checking button: "${text}" (aria: "${ariaLabel}")`);
            
            if (text.toLowerCase().includes('submit application') || 
                ariaLabel.toLowerCase().includes('submit application')) {
              
              console.log("🎯 FOUND SUBMIT APPLICATION BUTTON:", button);
              console.log("Button details:", {
                text: text,
                ariaLabel: ariaLabel,
                disabled: button.disabled,
                visible: !button.hidden && button.offsetWidth > 0 && button.offsetHeight > 0
              });
              
              submitButton = button;
              break;
            }
          }
          
          if (!submitButton) {
            console.log("❌ Could not find 'Submit application' button");
            alert('Could not find "Submit application" button. Please submit manually.');
            return false;
          }
          
          // Highlight the button so user can see it
          submitButton.style.border = '5px solid red';
          submitButton.style.backgroundColor = 'yellow';
          
          console.log("🚀 Attempting to click Submit application button...");
          
          try {
            // Simple click
            submitButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.sleep(2000);
            
            submitButton.focus();
            await this.sleep(1000);
            
            console.log("CLICKING SUBMIT BUTTON NOW...");
            submitButton.click();
            
            console.log("✅ Submit button clicked!");
            
            // Wait for LinkedIn to process
            await this.sleep(8000);
            
            // Check if submission worked
            const modalStillExists = !!this.findLinkedInModal();
            const completed = this.isApplicationComplete();
            
            console.log("After submit click:", {
              modalStillExists,
              applicationComplete: completed
            });
            
            if (!modalStillExists || completed) {
              console.log("✅ Submission appears successful!");
              alert('Application submitted successfully!');
              return true;
            } else {
              console.log("⚠️ Button clicked but form still open");
              alert('Submit button was clicked but form is still open. Please check if there are any validation errors.');
              return false;
            }
            
          } catch (error) {
            console.error("Error clicking submit button:", error);
            alert('Error clicking submit button: ' + error.message);
            return false;
          }
        },
        
        // QUICK TEST FUNCTION
        quickSubmitTest: function() {
          console.log("🧪 === QUICK SUBMIT TEST ===");
          
          // Find and highlight all potential submit buttons
          const allButtons = document.querySelectorAll('button');
          const submitButtons = [];
          
          allButtons.forEach((button, i) => {
            const text = button.textContent?.trim().toLowerCase() || '';
            const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
            
            if (text.includes('submit') || ariaLabel.includes('submit')) {
              button.style.border = '3px solid red';
              button.style.backgroundColor = 'yellow';
              
              submitButtons.push({
                index: i,
                element: button,
                text: button.textContent?.trim() || '',
                ariaLabel: button.getAttribute('aria-label') || '',
                disabled: button.disabled
              });
            }
          });
          
          console.log("Found submit buttons:", submitButtons);
          
          if (submitButtons.length > 0) {
            alert(`Found ${submitButtons.length} submit buttons (highlighted in red). Check console for details.`);
            return submitButtons;
          } else {
            alert('No submit buttons found on this page.');
            return [];
          }
        },
        
        // MANUAL CLICK HELPER
        manualClickHelper: function() {
          console.log("🖱️ === MANUAL CLICK HELPER ===");
          
          const allButtons = document.querySelectorAll('button');
          console.log(`Found ${allButtons.length} buttons on page`);
          
          allButtons.forEach((button, i) => {
            const text = button.textContent?.trim() || '';
            if (text.toLowerCase().includes('submit application')) {
              console.log(`Button ${i}: "${text}"`);
              
              // Add click listener for manual testing
              button.addEventListener('click', function() {
                console.log("Submit button was clicked manually!");
                alert('Submit button clicked! Check if application was submitted.');
              }, { once: true });
              
              // Highlight it
              button.style.border = '5px solid green';
              button.style.backgroundColor = 'lightgreen';
              
              alert('Found and highlighted the Submit application button in green. Try clicking it manually to test.');
              return button;
            }
          });
        },
        
        // IMPROVED SUCCESS DETECTION
        checkSubmissionSuccess: async function() {
          console.log("🔍 Checking if submission was successful...");
          
          // Wait a bit longer for LinkedIn to process
          await this.sleep(3000);
          
          // Method 1: Check if modal disappeared
          const modalExists = !!this.findLinkedInModal();
          console.log("Modal still exists:", modalExists);
          
          // Method 2: Check URL for changes
          const currentUrl = window.location.href;
          const urlChanged = !currentUrl.includes('/easy-apply/') && !currentUrl.includes('easyapply');
          console.log("URL changed away from easy apply:", urlChanged);
          
          // Method 3: Look for success messages
          const successMessages = [
            'application sent',
            'application submitted', 
            'thank you for applying',
            'your application has been',
            'successfully submitted',
            'application received'
          ];
          
          let hasSuccessMessage = false;
          const pageText = document.body.textContent.toLowerCase();
          
          for (const message of successMessages) {
            if (pageText.includes(message)) {
              console.log(`Found success message: "${message}"`);
              hasSuccessMessage = true;
              break;
            }
          }
          
          // Method 4: Check for success page elements
          const successElements = document.querySelectorAll(
            '.success, .confirmation, [class*="success"], [class*="confirm"], ' +
            'h1, h2, h3, .artdeco-inline-feedback--success'
          );
          
          let hasSuccessElement = false;
          for (const element of successElements) {
            const text = element.textContent?.toLowerCase() || '';
            if (successMessages.some(msg => text.includes(msg))) {
              console.log(`Found success element: "${text.substring(0, 100)}"`);
              hasSuccessElement = true;
              break;
            }
          }
          
          // Method 5: Check if we're back to job listing or job page
          const isBackToJobPage = currentUrl.includes('/jobs/view/') || 
                                 currentUrl.includes('/jobs/collections/') ||
                                 !currentUrl.includes('linkedin.com/jobs');
          
          console.log("Success detection results:", {
            modalGone: !modalExists,
            urlChanged,
            hasSuccessMessage,
            hasSuccessElement,
            isBackToJobPage,
            currentUrl: currentUrl.substring(0, 100)
          });
          
          // Consider successful if ANY success indicator is present
          const isSuccessful = !modalExists || urlChanged || hasSuccessMessage || 
                              hasSuccessElement || isBackToJobPage;
          
          console.log("Overall success determination:", isSuccessful);
          return isSuccessful;
        },
        
        // FIXED FOOLPROOF SUBMIT WITH BETTER SUCCESS DETECTION
        foolproofSubmitFixed: async function() {
          console.log("🎯 === FOOLPROOF SUBMIT (FIXED) - BETTER SUCCESS DETECTION ===");
          
          // Find ALL buttons on the page
          const allButtons = document.querySelectorAll('button');
          console.log(`Found ${allButtons.length} total buttons on page`);
          
          let submitButton = null;
          
          // Look for button with "Submit application" text
          for (const button of allButtons) {
            const text = button.textContent?.trim() || '';
            const ariaLabel = button.getAttribute('aria-label') || '';
            
            if (text.toLowerCase().includes('submit application') || 
                ariaLabel.toLowerCase().includes('submit application')) {
              
              console.log("🎯 FOUND SUBMIT APPLICATION BUTTON:", button);
              submitButton = button;
              break;
            }
          }
          
          if (!submitButton) {
            console.log("❌ Could not find 'Submit application' button");
            alert('Could not find "Submit application" button. Please submit manually.');
            return false;
          }
          
          // Record current state
          const beforeUrl = window.location.href;
          console.log("Before submit - URL:", beforeUrl);
          
          console.log("🚀 Clicking Submit application button...");
          
          try {
            // Simple click
            submitButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.sleep(1000);
            
            submitButton.focus();
            await this.sleep(500);
            
            console.log("CLICKING SUBMIT BUTTON NOW...");
            submitButton.click();
            
            console.log("✅ Submit button clicked! Waiting for LinkedIn to process...");
            
            // Wait longer for LinkedIn to process (up to 15 seconds)
            let attempts = 0;
            const maxAttempts = 15; // 15 seconds total
            
            while (attempts < maxAttempts) {
              await this.sleep(1000);
              attempts++;
              
              console.log(`Checking submission status... (${attempts}/${maxAttempts})`);
              
              const isSuccessful = await this.checkSubmissionSuccess();
              
              if (isSuccessful) {
                console.log(`✅ Submission confirmed successful after ${attempts} seconds!`);
                alert(`🎉 Application submitted successfully! (confirmed after ${attempts}s)`);
                return true;
              }
              
              // Show progress to user
              if (attempts % 3 === 0) {
                console.log(`Still waiting for LinkedIn response... (${attempts}s elapsed)`);
              }
            }
            
            // After 15 seconds, assume it might have worked
            console.log("⚠️ Timeout reached, but button was clicked successfully");
            alert('Submit button was clicked. LinkedIn may still be processing the application. Please check your LinkedIn applications to confirm.');
            return true; // Assume success since button was clicked
            
          } catch (error) {
            console.error("Error clicking submit button:", error);
            alert('Error clicking submit button: ' + error.message);
            return false;
          }
        },
        
        // SIMPLE SUBMIT WITH MINIMAL CHECKS
        simpleSubmitOnly: async function() {
          console.log("🎯 === SIMPLE SUBMIT ONLY (NO COMPLEX CHECKS) ===");
          
          // Find the submit button
          const allButtons = document.querySelectorAll('button');
          let submitButton = null;
          
          for (const button of allButtons) {
            const text = button.textContent?.trim() || '';
            if (text.toLowerCase().includes('submit application')) {
              submitButton = button;
              break;
            }
          }
          
          if (!submitButton) {
            alert('Could not find Submit application button');
            return false;
          }
          
          try {
            console.log("Clicking submit button...");
            submitButton.click();
            
            console.log("✅ Submit button clicked!");
            alert('✅ Submit button clicked! Please check if the application was submitted.');
            return true;
            
          } catch (error) {
            console.error("Error:", error);
            alert('Error: ' + error.message);
            return false;
          }
        },
        
        // DETAILED DEBUG SUBMIT - STEP BY STEP ANALYSIS
        debugSubmitDetailed: function() {
          console.log("🔍 === DETAILED SUBMIT DEBUG ===");
          
          // Step 1: Find all buttons
          const allButtons = document.querySelectorAll('button');
          console.log(`Found ${allButtons.length} total buttons on page`);
          
          // Step 2: Find submit buttons
          const submitButtons = [];
          allButtons.forEach((button, index) => {
            const text = button.textContent?.trim() || '';
            const ariaLabel = button.getAttribute('aria-label') || '';
            
            if (text.toLowerCase().includes('submit application') || 
                ariaLabel.toLowerCase().includes('submit application')) {
              
              const rect = button.getBoundingClientRect();
              const style = window.getComputedStyle(button);
              
              submitButtons.push({
                index,
                element: button,
                text: text,
                ariaLabel: ariaLabel,
                disabled: button.disabled,
                hidden: button.hidden,
                display: style.display,
                visibility: style.visibility,
                opacity: style.opacity,
                width: rect.width,
                height: rect.height,
                top: rect.top,
                left: rect.left
              });
              
              // Highlight this button
              button.style.border = '5px solid red';
              button.style.backgroundColor = 'yellow';
              button.style.zIndex = '999999';
            }
          });
          
          console.log("Submit buttons found:", submitButtons);
          
          if (submitButtons.length === 0) {
            alert('❌ No submit buttons found!');
            return null;
          }
          
          const submitButton = submitButtons[0];
          alert(`✅ Found submit button: "${submitButton.text}"\nDisabled: ${submitButton.disabled}\nVisible: ${submitButton.display !== 'none'}\nSize: ${submitButton.width}x${submitButton.height}`);
          
          return submitButton;
        },
        
        // MULTIPLE CLICK METHODS TEST
        testMultipleClicks: async function() {
          console.log("🖱️ === TESTING MULTIPLE CLICK METHODS ===");
          
          const submitInfo = this.debugSubmitDetailed();
          if (!submitInfo) return false;
          
          const button = submitInfo.element;
          
          console.log("Testing multiple click methods...");
          
          try {
            // Method 1: Basic click
            console.log("Method 1: Basic click()");
            button.click();
            await this.sleep(2000);
            
            // Method 2: Focus then click
            console.log("Method 2: Focus + click()");
            button.focus();
            await this.sleep(500);
            button.click();
            await this.sleep(2000);
            
            // Method 3: Mouse events
            console.log("Method 3: Mouse events");
            const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
            const mouseUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
            const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
            
            button.dispatchEvent(mouseDown);
            await this.sleep(100);
            button.dispatchEvent(mouseUp);
            await this.sleep(100);
            button.dispatchEvent(clickEvent);
            await this.sleep(2000);
            
            // Method 4: Form submission if button is in a form
            console.log("Method 4: Form submission");
            const form = button.closest('form');
            if (form) {
              console.log("Found form, trying to submit:", form);
              form.dispatchEvent(new Event('submit', { bubbles: true }));
              if (form.submit) {
                form.submit();
              }
            } else {
              console.log("No form found");
            }
            
            console.log("✅ All click methods attempted");
            alert('All click methods attempted. Check if the application was submitted.');
            return true;
            
          } catch (error) {
            console.error("Error in click testing:", error);
            alert('Error: ' + error.message);
            return false;
          }
        },
        
        // FORCE CLICK WITH JAVASCRIPT
        forceClickSubmit: function() {
          console.log("⚡ === FORCE CLICK SUBMIT ===");
          
          const allButtons = document.querySelectorAll('button');
          let submitButton = null;
          
          for (const button of allButtons) {
            const text = button.textContent?.trim() || '';
            if (text.toLowerCase().includes('submit application')) {
              submitButton = button;
              break;
            }
          }
          
          if (!submitButton) {
            alert('No submit button found');
            return false;
          }
          
          try {
            console.log("Force clicking submit button...");
            
            // Remove any event listeners that might prevent clicking
            const newButton = submitButton.cloneNode(true);
            submitButton.parentNode.replaceChild(newButton, submitButton);
            
            // Force click
            newButton.click();
            
            console.log("Force click completed");
            alert('Force click completed. Check if application submitted.');
            return true;
            
          } catch (error) {
            console.error("Force click error:", error);
            alert('Force click error: ' + error.message);
            return false;
          }
        },
        
        // MANUAL GUIDANCE
        manualGuidance: function() {
          console.log("👤 === MANUAL GUIDANCE ===");
          
          const allButtons = document.querySelectorAll('button');
          let submitButton = null;
          
          for (const button of allButtons) {
            const text = button.textContent?.trim() || '';
            if (text.toLowerCase().includes('submit application')) {
              submitButton = button;
              break;
            }
          }
          
          if (submitButton) {
            // Make it super obvious
            submitButton.style.border = '10px solid red';
            submitButton.style.backgroundColor = 'yellow';
            submitButton.style.color = 'black';
            submitButton.style.fontSize = '20px';
            submitButton.style.zIndex = '999999';
            submitButton.style.position = 'relative';
            
            // Scroll to it
            submitButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Add a big arrow pointing to it
            const arrow = document.createElement('div');
            arrow.innerHTML = '👆 CLICK THIS BUTTON 👆';
            arrow.style.cssText = `
              position: absolute;
              top: -50px;
              left: 50%;
              transform: translateX(-50%);
              background: red;
              color: white;
              padding: 10px;
              font-size: 16px;
              font-weight: bold;
              z-index: 1000000;
              border-radius: 5px;
            `;
            submitButton.style.position = 'relative';
            submitButton.appendChild(arrow);
            
            alert('🎯 The Submit Application button is now highlighted with a big red border and yellow background. There\'s also an arrow pointing to it. Try clicking it manually!');
            
            return submitButton;
          } else {
            alert('❌ Could not find Submit Application button');
            return null;
          }
        },
        
        // SIMPLE DEBUG FUNCTION FOR IMMEDIATE TESTING
        debugSubmitNow: function() {
          console.log("🔍 === IMMEDIATE SUBMIT DEBUG ===");
          
          const modal = this.findLinkedInModal();
          if (!modal) {
            console.log("❌ No modal found");
            alert("No LinkedIn modal found. Please open an Easy Apply form first.");
            return;
          }
          
          console.log("✅ Modal found:", modal);
          
          // Find ALL buttons in the modal
          const allButtons = modal.querySelectorAll('button');
          console.log(`Found ${allButtons.length} buttons in modal:`);
          
          const submitButtons = [];
          
          allButtons.forEach((button, i) => {
            const text = button.textContent?.trim() || '';
            const ariaLabel = button.getAttribute('aria-label') || '';
            const disabled = button.disabled;
            const visible = button.offsetParent !== null;
            
            console.log(`Button ${i}: "${text}" (aria: "${ariaLabel}") disabled: ${disabled}, visible: ${visible}`);
            
            if (text.toLowerCase().includes('submit') || ariaLabel.toLowerCase().includes('submit')) {
              submitButtons.push({ button, text, ariaLabel, disabled, visible, index: i });
              // Highlight it
              button.style.border = '5px solid red';
              button.style.backgroundColor = 'yellow';
              button.style.zIndex = '99999';
            }
          });
          
          console.log(`\n🎯 Found ${submitButtons.length} submit buttons:`);
          submitButtons.forEach((btn, i) => {
            console.log(`  ${i + 1}. "${btn.text}" (aria: "${btn.ariaLabel}") - disabled: ${btn.disabled}, visible: ${btn.visible}`);
          });
          
          if (submitButtons.length > 0) {
            alert(`Found ${submitButtons.length} submit buttons (highlighted in red/yellow). Check console for details. Try clicking one manually.`);
            
            // Add click listeners to detect manual clicks
            submitButtons.forEach((btn, i) => {
              btn.button.addEventListener('click', () => {
                console.log(`✅ Submit button ${i + 1} was clicked manually!`);
                setTimeout(() => {
                  const modalExists = !!this.findLinkedInModal();
                  const completed = this.isApplicationComplete();
                  console.log("After manual click:", { modalExists, completed });
                  
                  if (!modalExists || completed) {
                    alert("🎉 Manual submission appears successful!");
                  } else {
                    alert("⚠️ Modal still exists after click - check for validation errors");
                  }
                }, 3000);
              }, { once: true });
            });
            
            return submitButtons;
          } else {
            alert("No submit buttons found in the current modal.");
            return [];
          }
        },
        
        // FORCE CLICK FIRST SUBMIT BUTTON
        forceClickSubmit: async function() {
          console.log("⚡ === FORCE CLICKING SUBMIT ===");
          
          const modal = this.findLinkedInModal();
          if (!modal) {
            alert("No modal found");
            return false;
          }
          
          // Use the new simplified submit function
          console.log("Using simplified submit approach...");
          const success = await this.clickSubmitButton(modal);
          
          if (success) {
            alert("🎉 Force submit successful!");
            return true;
          } else {
            alert("⚠️ Force submit failed - try manual click on highlighted buttons");
            return false;
          }
        },
        
        // QUICK TEST FOR IMMEDIATE DEBUGGING
        quickTest: function() {
          console.log("🔍 === QUICK PROCESS TEST ===");
          
          // Test if we can find the modal
          const modal = this.findLinkedInModal();
          if (!modal) {
            alert("❌ No LinkedIn modal found. Open an Easy Apply form first.");
            return;
          }
          
          console.log("✅ Modal found");
          
          // Detect step
          const step = this.detectLinkedInStep(modal);
          console.log(`📍 Current step: ${step}`);
          
          // Check for completion
          const completed = this.isApplicationComplete();
          console.log(`🏁 Is complete: ${completed}`);
          
          if (completed) {
            alert("✅ Application already complete!");
            return;
          }
          
          // If it's submit step, try our debug function
          if (step === 'final-submit') {
            alert("🎯 At submit step! The process should automatically submit. If it fails, buttons will be highlighted for manual clicking.");
            // Highlight submit buttons for user
            this.highlightSubmitButtons(modal);
          } else if (step === 'resume-upload') {
            // Check if resume is detected
            const resumeInputs = this.findResumeInputs(modal);
            const allFileInputs = modal.querySelectorAll('input[type="file"]');
            const hasExistingResume = this.checkForExistingResumeImproved(modal, [...resumeInputs, ...allFileInputs]);
            
            if (hasExistingResume) {
              alert(`📎 Current step: ${step}. Resume detected: ${hasExistingResume}. Process should continue automatically.`);
            } else {
              alert(`📎 Current step: ${step}. No resume detected. Manual upload may be required.`);
            }
          } else {
            alert(`📍 Current step: ${step}. Process should handle this automatically.`);
          }
        }
      };
      
      console.log("✅ Agent initialized with human control");
      
      // Create indicator
      createAgentIndicator();
      
      // Add global debug functions for easy access
      window.testSubmit = function() {
        if (window.globalAgent) {
          return window.globalAgent.testSubmit();
        } else {
          alert('Agent not ready');
        }
      };
      
      window.debugSubmit = function() {
        if (window.globalAgent) {
          return window.globalAgent.debugSubmit();
        } else {
          alert('Agent not ready');
        }
      };
      
      window.manualSubmitHelper = function() {
        if (window.globalAgent) {
          return window.globalAgent.manualSubmitHelper();
        } else {
          alert('Agent not ready');
        }
      };
      
      window.forceSubmit = function() {
        if (window.globalAgent) {
          return window.globalAgent.forceSubmit();
        } else {
          alert('Agent not ready');
        }
      };
      
      window.foolproofSubmit = function() {
        if (window.globalAgent) {
          return window.globalAgent.foolproofSubmit();
        } else {
          alert('Agent not ready');
        }
      };
      
      window.quickSubmitTest = function() {
        if (window.globalAgent) {
          return window.globalAgent.quickSubmitTest();
        } else {
          alert('Agent not ready');
        }
      };
      
      window.manualClickHelper = function() {
        if (window.globalAgent) {
          return window.globalAgent.manualClickHelper();
        } else {
          alert('Agent not ready');
        }
      };
      
      window.foolproofSubmitFixed = function() {
        if (window.globalAgent) {
          return window.globalAgent.foolproofSubmitFixed();
        } else {
          alert('Agent not ready');
        }
      };
      
      window.simpleSubmitOnly = function() {
        if (window.globalAgent) {
          return window.globalAgent.simpleSubmitOnly();
        } else {
          alert('Agent not ready');
        }
      };
      
      window.debugSubmitDetailed = function() {
        if (window.globalAgent) {
          return window.globalAgent.debugSubmitDetailed();
        } else {
          alert('Agent not ready');
        }
      };
      
      window.testMultipleClicks = function() {
        if (window.globalAgent) {
          return window.globalAgent.testMultipleClicks();
        } else {
          alert('Agent not ready');
        }
      };
      
      window.forceClickSubmit = function() {
        if (window.globalAgent) {
          return window.globalAgent.forceClickSubmit();
        } else {
          alert('Agent not ready');
        }
      };
      
      window.manualGuidance = function() {
        if (window.globalAgent) {
          return window.globalAgent.manualGuidance();
        } else {
          alert('Agent not ready');
        }
      };
      
      console.log("✅ Global submit debug functions added:");
      console.log("  - window.testSubmit()");
      console.log("  - window.debugSubmit()");
      console.log("  - window.manualSubmitHelper()");
      console.log("  - window.forceSubmit()");
      console.log("  - window.foolproofSubmit() [SIMPLE]");
      console.log("  - window.quickSubmitTest() [QUICK TEST]");
      console.log("  - window.manualClickHelper() [MANUAL HELPER]");
      console.log("  - window.foolproofSubmitFixed() [FIXED - BETTER SUCCESS DETECTION] ⭐");
      console.log("  - window.simpleSubmitOnly() [MINIMAL - JUST CLICK] ⭐");
      console.log("  - window.debugSubmitDetailed() [DETAILED DEBUG] 🔍");
      console.log("  - window.testMultipleClicks() [MULTIPLE CLICK METHODS] 🖱️");
      console.log("  - window.forceClickSubmit() [FORCE CLICK] ⚡");
      console.log("  - window.manualGuidance() [MANUAL GUIDANCE] 👤");
    }
    
    // Create agent indicator
    function createAgentIndicator() {
      if (!window.extensionContextValid) return;
      
      try {
        const existingIndicators = document.querySelectorAll('#linkedin-agent-indicator');
        existingIndicators.forEach(indicator => indicator.remove());
        
        const agentIndicator = document.createElement('div');
        agentIndicator.id = 'linkedin-agent-indicator';
        agentIndicator.style.cssText = `
          position: fixed; top: 10px; right: 10px; background: #28a745; color: white;
          padding: 8px 12px; border-radius: 4px; font-size: 12px; z-index: 10001;
          cursor: pointer; font-weight: bold; border: 2px solid #1e7e34;
          transition: all 0.2s ease;
        `;
        agentIndicator.textContent = 'LinkedIn Agent';
        agentIndicator.title = 'LinkedIn Auto Apply with Human Control - Click to use';
        
        agentIndicator.addEventListener('click', handleAgentClick);
        
        document.body.appendChild(agentIndicator);
        console.log("✅ Agent indicator created");
        
        // Update indicator based on page
        updateAgentIndicator(agentIndicator);
        
        return agentIndicator;
      } catch (error) {
        console.error("Error creating agent indicator:", error);
        return null;
      }
    }
    
    // Update agent indicator
    function updateAgentIndicator(indicator) {
      if (!indicator) return;
      
      try {
        const isLinkedIn = window.location.hostname.toLowerCase().includes('linkedin.com');
        const isExternal = !isLinkedIn;
        
        if (isLinkedIn) {
          // Always show "LinkedIn Agent" for LinkedIn pages
          indicator.style.backgroundColor = '#0073b1';
          indicator.textContent = 'LinkedIn Agent';
          
          // Check if Easy Apply is available for the title
          const hasEasyApply = window.globalAgent && window.globalAgent.findEasyApplyButton();
          if (hasEasyApply) {
            indicator.title = 'LinkedIn Agent - Easy Apply job detected. Click to start application.';
          } else {
            indicator.title = 'LinkedIn Agent - Click to check for job opportunities';
          }
        } else if (isExternal) {
          // External site detection
          const url = window.location.hostname.toLowerCase();
          const supportedSites = [
            'workday.com', 'myworkdayjobs.com',
            'greenhouse.io', 'lever.co', 'bamboohr.com',
            'smartrecruiters.com', 'jobvite.com', 'icims.com',
            'taleo.net', 'successfactors.com'
          ];
          
          const isSupported = supportedSites.some(site => url.includes(site));
          
          if (isSupported) {
            // Check for application forms or apply buttons
            const hasApplicationForm = document.querySelector(
              'form[id*="application"], form[class*="application"], ' +
              'form[action*="apply"], form[action*="submit"], ' +
              '[data-automation-id*="applicationForm"], ' +
              '.application-form, #application, #application_form'
            );
            
            const hasApplyButton = document.querySelector(
              '[data-automation-id*="applyBtn"], [data-automation-id*="applyButton"], ' +
              'button[title*="Apply"], button[aria-label*="Apply"], ' +
              'input[value*="Apply"], a[href*="apply"]'
            );
            
            if (hasApplicationForm || hasApplyButton) {
              indicator.style.backgroundColor = '#28a745';
              indicator.textContent = 'Standard Job Ready';
              indicator.title = 'Click to start standard job application process';
            } else {
              indicator.style.backgroundColor = '#ffc107';
              indicator.textContent = 'External Site';
              indicator.title = 'External job site detected - navigate to application page';
            }
          } else {
            indicator.style.backgroundColor = '#6c757d';
            indicator.textContent = 'Site Not Supported';
            indicator.title = 'This external site is not supported for auto-apply';
          }
        } else {
          indicator.style.backgroundColor = '#6c757d';
          indicator.textContent = 'Agent Ready';
          indicator.title = 'Job application agent ready';
        }
        
      } catch (error) {
        console.error("Error updating agent indicator:", error);
        indicator.style.backgroundColor = '#dc3545';
        indicator.textContent = 'Agent Error';
        indicator.title = 'Error in agent system';
      }
    }
    
    // Handle agent click
    function handleAgentClick() {
      try {
        if (!window.globalAgent) {
          alert('Agent not ready. Please refresh the page.');
          return;
        }
        
        if (window.globalAgent.isProcessing) {
          alert('Agent is already processing. Please wait or stop the current process.');
          return;
        }
        
        const isLinkedIn = window.location.hostname.toLowerCase().includes('linkedin.com');
        const isExternal = !isLinkedIn;
        
        if (isLinkedIn) {
          // LinkedIn Job Application
          const hasEasyApply = window.globalAgent.findEasyApplyButton();
          
          if (hasEasyApply) {
            console.log("🚀 Starting LinkedIn Easy Apply process...");
            window.globalAgent.applyToJob()
              .then((success) => {
                console.log("Easy Apply process completed:", success);
              })
              .catch((error) => {
                console.error("Easy Apply process failed:", error);
                alert('Easy Apply process failed: ' + error.message);
              });
          } else {
            // For LinkedIn pages without Easy Apply, still show the agent is working
            console.log("🔍 LinkedIn page detected but no Easy Apply found");
            const isJobPage = window.location.href.includes('/jobs/view/') || 
                            window.location.href.includes('/jobs/collections/');
            
            if (isJobPage) {
              alert('This LinkedIn job does not have Easy Apply. The agent works best with Easy Apply jobs. Please look for jobs with the "Easy Apply" button.');
            } else {
              alert('Navigate to a LinkedIn job page to use the agent. Look for jobs with "Easy Apply" for best results.');
            }
          }
        } else if (isExternal) {
          // External/Standard Job Application
          const url = window.location.hostname.toLowerCase();
          const supportedSites = [
            'workday.com', 'myworkdayjobs.com',
            'greenhouse.io', 'lever.co', 'bamboohr.com',
            'smartrecruiters.com', 'jobvite.com', 'icims.com',
            'taleo.net', 'successfactors.com'
          ];
          
          const isSupported = supportedSites.some(site => url.includes(site));
          
          if (isSupported && window.globalAgent.applyToStandardJob) {
            console.log("🚀 Starting Standard Job Application process...");
            window.globalAgent.applyToStandardJob()
              .then((success) => {
                console.log("Standard job application process completed:", success);
              })
              .catch((error) => {
                console.error("Standard job application process failed:", error);
                alert('Standard job application failed: ' + error.message);
              });
          } else {
            alert('This external site is not supported for automatic job applications. Supported sites include: Workday, Greenhouse, Lever, BambooHR, SmartRecruiters, and others.');
          }
        } else {
          alert('Please navigate to a LinkedIn job page or supported external job site to use the auto-apply feature.');
        }
      } catch (error) {
        console.error("Error in agent click handler:", error);
        alert('Error starting application process: ' + error.message);
      }
    }
    
    console.log("✅ LinkedIn Agent with Human Control loaded successfully");
  
  })(); 