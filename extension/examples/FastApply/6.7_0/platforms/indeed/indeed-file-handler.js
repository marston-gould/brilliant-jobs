// platforms/indeed/indeed-file-handler.js

import { fetchFile } from "../../shared/utilities/fetch-file.js";

export class IndeedFileHandler {
  constructor(config = {}) {
    this.backendApiHost = config.backendApiHost;
    this.aiApiHost = config.aiApiHost;
    this.jwtToken = config.jwtToken;
    this.processedInputs = new Set();
    this.isUploading = false;
    this.jobPreferences = config.jobPreferences;
    this.preferences = config.preferences || config.jobPreferences; // Resume tailoring preferences
  }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  isElementVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      element.offsetParent !== null
    );
  }

  async waitForAnyElement(selectors, options = {}) {
    const timeout = options.timeout || 5000;
    const startTime = Date.now();
    const parent = options.parent || document;

    while (Date.now() - startTime < timeout) {
      for (const item of selectors) {
        const selector = typeof item === "string" ? item : item.selector;
        const element = parent.querySelector(selector);
        if (element && this.isElementVisible(element)) {
          return { element, selector, index: selectors.indexOf(item) };
        }
      }
      await this.delay(100);
    }
    return null; // Return null instead of throwing for this specific usage
  }

  updateConfig(config) {
    if (config.backendApiHost) {
      this.backendApiHost = config.backendApiHost;
    }
    if (config.aiApiHost) {
      this.aiApiHost = config.aiApiHost;
    }
    if (config.jwtToken) {
      this.jwtToken = config.jwtToken;
    }
    if (config.jobPreferences) {
      this.jobPreferences = config.jobPreferences;
    }
    if (config.preferences) {
      this.preferences = config.preferences;
    }
  }

  getAuthHeaders(includeContentType = true) {
    const headers = {};

    // Only set Content-Type for JSON requests, NOT for FormData
    // When sending FormData, the browser sets the correct Content-Type with boundary automatically
    if (includeContentType) {
      headers["Content-Type"] = "application/json";
    }

    if (this.jwtToken) {
      headers["Authorization"] = `Bearer ${this.jwtToken}`;
    }
    return headers;
  }

  /**
   * Handle all file uploads in the form using Indeed's file system
   */
  async handleFileUploads(form, userDetails, jobDescription, jobId, jobTitle) {
    try {
      if (!form) {
        return false;
      }

      if (!userDetails) {
        return false;
      }

      // Prevent multiple simultaneous uploads
      if (this.isUploading) {
        return false;
      }
      this.isUploading = true;

      // Look for Indeed file upload containers
      const resumeContainer = form.querySelector(
        ".file-upload-container, .resume-upload, .upload-section",
      );
      const coverLetterContainer = form.querySelector(
        ".cover-letter-upload, .additional-docs",
      );

      console.log(
        `🔍 Container detection - Resume: ${!!resumeContainer}, Cover Letter: ${!!coverLetterContainer}`,
      );

      let totalContainers = 0;
      let successCount = 0;

      // Handle resume upload (SEQUENTIAL, not parallel)
      if (resumeContainer) {
        totalContainers++;
        console.log("🔄 Starting resume upload process");
        const success = await this.handleResumeUpload(
          resumeContainer,
          userDetails,
          jobDescription,
          jobId,
          jobTitle,
        );
        console.log(`📊 Resume upload result: ${success}`);
        if (success) {
          successCount++;
        } else {
          console.log("❌ Resume upload failed");
        }

        // Wait for upload to stabilize (adaptive!)
        console.log("⏳ Waiting for upload to stabilize...");
        await this.delay(1000);
      }

      // Handle cover letter upload (SEQUENTIAL, not parallel)
      if (coverLetterContainer && jobDescription) {
        totalContainers++;
        const success = await this.handleCoverLetterUpload(
          coverLetterContainer,
          userDetails,
          jobDescription,
        );
        if (success) {
          successCount++;
        } else {
          console.log("❌ Cover letter upload failed");
        }
      }

      this.isUploading = false;

      // ALL uploads must succeed, not just any
      const allUploadsSucceeded =
        totalContainers > 0 && successCount === totalContainers;

      if (allUploadsSucceeded) {
        console.log(
          `✅ All ${successCount}/${totalContainers} file uploads completed successfully`,
        );
      } else if (totalContainers === 0) {
        console.log("ℹ️ No file upload containers found");
        return true; // No uploads needed is considered success
      } else {
        console.log(
          `❌ File uploads failed: ${successCount}/${totalContainers} succeeded`,
        );
      }

      return allUploadsSucceeded || totalContainers === 0;
    } catch (error) {
      this.isUploading = false;
      console.error("File upload process failed: " + error.message, "error");
      return false;
    }
  }

  /**
   * Get a unique identifier for file input to prevent duplicate processing
   */
  getInputIdentifier(fileInput) {
    return (
      fileInput.id ||
      fileInput.name ||
      fileInput.getAttribute("data-qa") ||
      `input-${Array.from(
        fileInput.form?.querySelectorAll('input[type="file"]') || [],
      ).indexOf(fileInput)}`
    );
  }

  /**
   * Handle a single file upload field
   */
  async handleSingleFileUpload(fileInput, userDetails, jobDescription, jobId, jobTitle) {
    try {
      const fileType = this.determineFileType(fileInput);
      if (fileType === "resume" && jobDescription) {
        const fileUrls = this.getFileUrls(userDetails, fileType);

        if (!fileUrls || fileUrls.length === 0) {
          return false;
        }

        return await this.handleResumeUploadToInput(
          fileInput,
          userDetails,
          jobDescription,
          fileUrls,
          jobId,
          jobTitle,
        );
      } else if (fileType === "coverLetter" && jobDescription) {
        return await this.uploadCoverLetterPDF(
          fileInput,
          {
            fullName: userDetails.name,
            jobDescription: jobDescription,
            skills: userDetails.skills,
            education: userDetails.education,
            fullPositions: userDetails.fullPositions,
            tone: "Professional",
          },
          userDetails,
        );
      } else {
        // for all other types or fallback
        return await this.uploadFileFromUrl(fileInput, null, userDetails);
      }
    } catch (error) {
      console.error("Single file upload failed: " + error.message);
      return false;
    }
  }

  async uploadCoverLetterPDF(fileInput, letterData, userDetails = null) {
    if (!fileInput) {
      console.error("File input not found");
      return false;
    }

    try {
      // Call backend endpoint to generate the PDF
      const response = await fetch(
        `https://resumify.fastapply.co/api/generate-cover-letter-pdf`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(letterData),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Failed to generate PDF: ${response.status} - ${
            errorData.error || "Unknown error"
          }`,
        );
      }

      // Validate content type
      const contentType = response.headers.get("content-type");
      if (contentType && !contentType.includes("application/pdf")) {
        console.warn("Expected PDF but received:", contentType);
      }

      const blob = await response.blob();

      if (blob.size === 0) {
        throw new Error("Generated PDF is empty");
      }

      const fileName = userDetails
        ? this.generateCoverLetterFileName(userDetails, null)
        : "cover-letter.pdf";
      const file = new File([blob], fileName, {
        type: blob.type || "application/pdf",
        lastModified: Date.now(),
      });

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;

      // Dispatch events to trigger the upload process
      const changeEvent = new Event("change", { bubbles: true });
      fileInput.dispatchEvent(changeEvent);

      const inputEvent = new Event("input", { bubbles: true });
      fileInput.dispatchEvent(inputEvent);

      // Focus and blur to ensure all handlers are triggered
      fileInput.focus();
      fileInput.blur();

      // Wait for upload completion using MutationObserver (adaptive!)
      const finalUploadSuccess =
        await this.waitForUploadProcessAdaptive(fileInput);
      return finalUploadSuccess;
    } catch (error) {
      console.error("❌ Error uploading cover letter PDF:", error);
      return false;
    }
  }

  /**
   * Handle resume upload with AI optimization
   */
  async handleResumeUploadToInput(
    fileInput,
    userDetails,
    jobDescription,
    fileUrls,
    jobId,
    jobTitle,
  ) {
    try {
      // Check both preferences and jobPreferences for useCustomResume
      const useCustomResume =
        this.preferences?.useCustomResume === true ||
        this.jobPreferences?.useCustomResume === true;

      if (useCustomResume) {
        return await this.generateAndUploadCustomResume(
          fileInput,
          userDetails,
          jobDescription,
          fileUrls,
          this.preferences,
          jobId,
          jobTitle,
        );
      } else {
        return await this.matchAndUploadResume(
          fileInput,
          userDetails,
          jobDescription,
          fileUrls,
        );
      }
    } catch (error) {
      console.error("Resume upload failed:", error);
      return false;
    }
  }

  /**
   * Generate and upload custom resume for unlimited users
   * Supports PDF/DOCX generation based on preferences
   */
  async generateAndUploadCustomResume(
    fileInput,
    userDetails,
    jobDescription,
    fileUrls,
    preferences,
    jobId,
    jobTitle,
  ) {
    try {
      if (userDetails && userDetails.jwtToken) {
        this.jwtToken = userDetails.jwtToken;
      }

      // Get preferences (check both preference sources)
      const prefs = this.preferences || this.jobPreferences || {};
      const resumeType = prefs.resumeType || "pdf";
      const resumeTemplate = prefs.resumeTemplate || "galaxy";

      console.log(
        `📝 Generating ${resumeType.toUpperCase()} resume with template: ${resumeTemplate}`,
      );

      // Determine generation URL based on preferences
      let generateURL =
        resumeType === "docx"
          ? `${this.backendApiHost}/api/v1/resume-builder/generate`
          : `https://resumify.fastapply.co/api/generate-resume-pdf`;

      const [parseURL, optimizeURL] = [
        `${this.backendApiHost}/api/v1/resumes/extract-text`,
        `${this.backendApiHost}/api/v1/resume-builder/optimize-ats`,
      ];

      // Step 1: Download resume file
      const resumeFileUrl = fileUrls[fileUrls.length - 1].fileUrl;

      const fileResponse = await fetchFile(resumeFileUrl);
      if (!fileResponse.ok) {
        throw new Error(
          `Failed to download resume file: ${fileResponse.status}`,
        );
      }

      const resumeBlob = await fileResponse.blob();
      const resumeFileName = resumeFileUrl.split("/").pop() || "resume.pdf";
      const resumeFile = new File([resumeBlob], resumeFileName, {
        type: resumeBlob.type || "application/pdf",
      });

      // Step 2: Parse Resume (upload as file)
      const formData = new FormData();
      formData.append("file", resumeFile);

      const parseResponse = await fetch(parseURL, {
        method: "POST",
        headers: this.getAuthHeaders(false),
        body: formData,
      });

      if (!parseResponse.ok) {
        throw new Error(`Parse Resume Failed: ${parseResponse.status}`);
      }

      const { text: parsedResumeText } = await parseResponse.json();

      // Step 3: Optimize Resume
      const optimizeResponse = await fetch(optimizeURL, {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          provider: "openai",
          resumeText: parsedResumeText,
          jobDescription: jobDescription || "",
          jobTitle: jobTitle || "",
          userData: userDetails,
          jobId: jobId,
          userId: userDetails.userId,
        }),
      });

      if (!optimizeResponse.ok) {
        throw new Error(`Optimize Resume Failed: ${optimizeResponse.status}`);
      }

      const resumeData = await optimizeResponse.json();
      let generateResponse;

      // Step 4: Generate Resume based on preferences
      if (resumeType === "docx") {
        // For DOCX, use the backend endpoint with template
        generateResponse = await fetch(generateURL, {
          method: "POST",
          headers: this.getAuthHeaders(),
          body: JSON.stringify({
            template: `${resumeTemplate}_template`,
            data: resumeData.data,
          }),
        });
      } else {
        // For PDF, use the resumify endpoint
        userDetails.author = userDetails.firstName + " " + userDetails.lastName;
        generateResponse = await fetch(generateURL, {
          method: "POST",
          headers: this.getAuthHeaders(),
          body: JSON.stringify({
            user_data: userDetails,
            resume_data: resumeData.data,
            template: resumeTemplate,
          }),
        });
      }

      if (!generateResponse.ok) {
        throw new Error(`Generate Resume Failed: ${generateResponse.status}`);
      }

      const blob = await generateResponse.blob();

      if (blob.size === 0) {
        throw new Error("Generated file is empty");
      }

      // Generate filename with appropriate extension
      const extension = blob.type.split("/")[1] === "pdf" ? "pdf" : "docx";
      const fileName = `${
        userDetails.firstName + "_" + userDetails.lastName || "resume"
      }.${extension}`;

      // Create File object with correct MIME type
      const mimeType =
        extension === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

      const file = new File([blob], fileName, {
        type: mimeType,
        lastModified: Date.now(),
      });

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;

      // Trigger events to activate React's file handling
      await this.dispatchFileEvents(fileInput);

      console.log("📁 File set on input:", {
        filesLength: fileInput.files.length,
        fileName: fileInput.files[0]?.name,
        fileSize: fileInput.files[0]?.size,
      });

      // CRITICAL: Wait for Indeed's React UI to confirm upload
      const uploadConfirmed = await this.waitForResumeConfirmation(fileInput);
      if (!uploadConfirmed) {
        console.warn(
          "⚠️ Upload confirmation not detected, file may not persist",
        );
      }

      return uploadConfirmed;
    } catch (error) {
      console.error("Resume generation failed:", error);
      // Fallback to uploading the first resume's URL if custom generation fails
      return await this.uploadFileFromUrl(
        fileInput,
        fileUrls[0].fileUrl,
        userDetails,
      );
    }
  }

  /**
   * Match and upload best resume for the job
   * Uses primary resume instead of matching with job description
   */
  async matchAndUploadResume(fileInput, userDetails, jobDescription, fileUrls) {
    try {
      if (userDetails && userDetails.jwtToken) {
        this.jwtToken = userDetails.jwtToken;
      }

      // Find primary resume, fall back to first resume if no primary is set
      const primaryResume = fileUrls.find((resume) => resume.isPrimary);
      const resumeToUploadUrl = primaryResume?.fileUrl || fileUrls[0]?.fileUrl;

      if (!resumeToUploadUrl) {
        throw new Error("No valid resume URL found");
      }

      const success = await this.uploadFileFromUrl(
        fileInput,
        resumeToUploadUrl,
        userDetails,
      );

      return success;
    } catch (error) {
      // Fallback to uploading the first resume's URL
      return await this.uploadFileFromUrl(
        fileInput,
        fileUrls[0]?.fileUrl,
        userDetails,
      );
    }
  }

  /**
   * Upload file from URL
   */
  async uploadFileFromUrl(fileInput, fileUrl, userDetails = null) {
    try {
      if (!fileUrl) {
        return false;
      }

      if (!fileInput) {
        return false;
      }

      const response = await fetchFile(fileUrl);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch file: ${response.status} ${response.statusText}`,
        );
      }

      const blob = await response.blob();

      if (blob.size === 0) {
        throw new Error("Downloaded file is empty");
      }

      const fileName = this.extractFileNameFromUrl(fileUrl);

      const uploadResult = await this.uploadBlob(
        fileInput,
        blob,
        fileName,
        userDetails,
      );

      return uploadResult;
    } catch (error) {
      console.error("❌ Error uploading file from URL:", error);
      return false;
    }
  }

  /**
   * Upload blob to file input with enhanced form integration
   */
  async uploadBlob(fileInput, blob, originalFileName, userDetails = null) {
    try {
      if (blob.size === 0) {
        throw new Error("File is empty");
      }

      // Generate proper filename using user details if available
      const fileName = userDetails
        ? this.generateResumeFileName(userDetails, originalFileName)
        : this.extractFileNameFromUrl(originalFileName);

      const file = new File([blob], fileName, {
        type: blob.type || "application/pdf",
        lastModified: Date.now(),
      });

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      fileInput.files = dataTransfer.files;

      // Set additional properties to ensure form recognition
      fileInput.setAttribute("data-file-uploaded", "true");
      fileInput.setAttribute("data-file-name", fileName);

      // Dispatch all necessary events for React file handling
      await this.dispatchFileEvents(fileInput);

      // Trigger focus to ensure React's internal handlers fire
      fileInput.dispatchEvent(new Event("focus", { bubbles: true }));

      // Additional form integration
      const form = fileInput.closest("form");
      if (form) {
        const formChangeEvent = new Event("change", { bubbles: true });
        form.dispatchEvent(formChangeEvent);
      }

      console.log(
        `📁 Blob uploaded to input: ${fileName} (${file.size} bytes)`,
      );

      // CRITICAL: Wait for SmartApply React UI confirmation instead of simple check
      const uploadSuccess = await this.waitForResumeConfirmation(fileInput);

      if (uploadSuccess) {
        console.log(`✅ File upload confirmed: ${fileName}`);
      } else {
        console.warn(`⚠️ Upload confirmation failed: ${fileName}`);
      }

      return uploadSuccess;
    } catch (error) {
      console.error("❌ Error uploading blob:", error);
      return false;
    }
  }

  /**
   * Handle resume upload for SimplyHired containers
   */
  async handleResumeUpload(
    resumeContainer,
    userDetails,
    jobDescription,
    jobId,
    jobTitle,
  ) {
    try {
      const fileUrls = this.getFileUrls(userDetails, "resume");
      if (!fileUrls || fileUrls.length === 0) {
        return false;
      }
      // Find file input in the container
      const fileInput = resumeContainer.querySelector('input[type="file"]');
      if (!fileInput) {
        return false;
      }

      return await this.handleResumeUploadToInput(
        fileInput,
        userDetails,
        jobDescription,
        fileUrls,
        jobId,
        jobTitle,
      );
    } catch (error) {
      console.error("❌ Error with resume upload:", error);
      return false;
    }
  }

  /**
   * Handle cover letter upload for SimplyHired containers
   */
  async handleCoverLetterUpload(
    coverLetterContainer,
    userDetails,
    jobDescription,
  ) {
    try {
      // Find file input in the container
      const fileInput =
        coverLetterContainer.querySelector('input[type="file"]');
      if (!fileInput) {
        console.log("❌ No file input found in cover letter container");
        return false;
      }

      return await this.uploadCoverLetterPDF(
        fileInput,
        {
          fullName: userDetails.name,
          jobDescription: jobDescription,
          skills: userDetails.skills,
          education: userDetails.education,
          fullPositions: userDetails.fullPositions,
          tone: "Professional",
        },
        userDetails,
      );
    } catch (error) {
      console.error("❌ Error with cover letter upload:", error);
      return false;
    }
  }

  /**
   * Generate proper resume filename based on user details
   */
  generateResumeFileName(userDetails, fileUrl) {
    try {
      // Extract file extension from URL
      let extension = ".pdf"; // Default to PDF
      if (fileUrl) {
        const urlLower = fileUrl.toLowerCase();
        if (urlLower.includes(".docx")) {
          extension = ".docx";
        } else if (urlLower.includes(".doc")) {
          extension = ".doc";
        }
      }

      // Generate filename from user's name
      const firstName = userDetails?.firstName?.trim() || "FirstName";
      const lastName = userDetails?.lastName?.trim() || "LastName";

      // Clean names and format as "FirstName_LastName_Resume.ext"
      const cleanFirstName = firstName.replace(/[^\w]/g, "");
      const cleanLastName = lastName.replace(/[^\w]/g, "");

      return `${cleanFirstName}_${cleanLastName}_Resume${extension}`;
    } catch (error) {
      console.error("Error generating resume filename:", error);
      return `Resume_${Date.now()}.pdf`;
    }
  }

  /**
   * Generate proper cover letter filename based on user details
   */
  generateCoverLetterFileName(userDetails, fileUrl) {
    try {
      // Extract file extension from URL
      let extension = ".pdf"; // Default to PDF for cover letters
      if (fileUrl) {
        const urlLower = fileUrl.toLowerCase();
        if (urlLower.includes(".docx")) {
          extension = ".docx";
        } else if (urlLower.includes(".doc")) {
          extension = ".doc";
        }
      }

      // Generate filename from user's name
      const firstName = userDetails?.firstName?.trim() || "FirstName";
      const lastName = userDetails?.lastName?.trim() || "LastName";

      // Clean names and format as "FirstName_LastName_Cover_Letter.ext"
      const cleanFirstName = firstName.replace(/[^\w]/g, "");
      const cleanLastName = lastName.replace(/[^\w]/g, "");

      return `${cleanFirstName}_${cleanLastName}_Cover_Letter${extension}`;
    } catch (error) {
      console.error("Error generating cover letter filename:", error);
      return `Cover_Letter_${Date.now()}.pdf`;
    }
  }

  extractFileNameFromUrl(url) {
    try {
      if (!url || typeof url !== "string") {
        return `resume_${Date.now()}.pdf`;
      }

      let workingUrl = url.trim();

      if (
        !workingUrl.startsWith("http://") &&
        !workingUrl.startsWith("https://")
      ) {
        workingUrl = "https://" + workingUrl;
      }

      let decodedUrl;
      try {
        decodedUrl = decodeURIComponent(workingUrl);
      } catch (decodeError) {
        decodedUrl = workingUrl;
      }

      const urlObj = new URL(decodedUrl);
      let fileName = urlObj.pathname.split("/").pop();

      if (!fileName || !fileName.includes(".") || fileName.includes("%")) {
        const pathParts = decodedUrl.split("/");
        for (let i = pathParts.length - 1; i >= 0; i--) {
          const part = pathParts[i];
          if (part.includes(".pdf") || part.includes(".doc")) {
            fileName = part;
            break;
          }
        }
      }

      if (fileName && fileName.includes(".")) {
        fileName = fileName
          .replace(/%[0-9A-F]{2}/gi, "")
          .replace(/[^\w\s.-]/gi, "")
          .replace(/\s+/g, "_")
          .trim();

        if (!fileName.match(/\.(pdf|doc|docx)$/i)) {
          fileName += ".pdf";
        }

        return fileName;
      }

      return `resume_${Date.now()}.pdf`;
    } catch (error) {
      return `resume_${Date.now()}.pdf`;
    }
  }

  /**
   * Wait for upload process using MutationObserver (ADAPTIVE!)
   */
  async waitForUploadProcessAdaptive(fileInput, timeout = 30000) {
    try {
      console.log("⏳ Waiting for upload to process (adaptive)...");

      const container =
        fileInput.closest("form, .file-upload-container, .upload-section") ||
        fileInput.parentElement;

      // Quick check if already uploaded
      if (
        fileInput.files &&
        fileInput.files.length > 0 &&
        fileInput.getAttribute("data-file-uploaded") === "true"
      ) {
        console.log("✅ File already marked as uploaded");
        return true;
      }

      // Use MutationObserver to wait for success indicators
      const successSelectors = [
        ".file-name",
        ".upload-success",
        ".file-uploaded",
        ".upload-complete",
        ".success-message",
        ".file-success",
        ".uploaded",
        ".selected-file",
        ".attachment-name",
        ".file-info",
        '[data-testid*="file-resume"]',
        '[data-testid*="upload"]',
        ".filename",
        ".file-display-name",
        '[data-testid="ResumeThumbnail"]',
        '[data-testid*="resume-success"]',
      ];

      try {
        const result = await this.waitForAnyElement(
          successSelectors.map((selector) => ({ selector })),
          {
            timeout: timeout,
            checkVisibility: true,
            parent: container || document.body,
          },
        );

        if (result) {
          console.log(
            `✅ Upload success detected via: ${successSelectors[result.index]}`,
          );
          return true;
        }
      } catch (error) {
        // Fallback: check if file is in input
        if (fileInput.files && fileInput.files.length > 0) {
          console.log("✅ File detected in input, considering successful");
          return true;
        }

        console.log("⚠️ Upload timeout, checking file state...");
        return fileInput.files && fileInput.files.length > 0;
      }

      return false;
    } catch (error) {
      console.error("❌ Error waiting for upload:", error);
      return fileInput.files && fileInput.files.length > 0;
    }
  }

  /**
   * Legacy upload wait method (kept for compatibility)
   */
  async waitForUploadProcess(fileInput, timeout = 30000) {
    // Use the adaptive version
    return this.waitForUploadProcessAdaptive(fileInput, timeout);
  }

  /**
   * Wait for Indeed SmartApply resume upload confirmation
   */
  async waitForResumeConfirmation(fileInput, timeout = 15000) {
    console.log("⏳ Waiting for resume upload confirmation...");

    const startTime = Date.now();

    // Check for various Indeed upload success indicators
    const successSelectors = [
      '[data-testid="ResumeThumbnail"]',
      '[data-testid*="resume-success"]',
      '[data-testid*="file-resume"]',
      ".resume-uploaded",
      ".file-uploaded",
      ".upload-success",
      '[class*="resume"][class*="success"]',
      '[class*="file"][class*="uploaded"]',
    ];

    while (Date.now() - startTime < timeout) {
      // Check if any success element exists
      for (const selector of successSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          console.log(`✅ Upload confirmed via: ${selector}`);
          return true;
        }
      }

      // Also check if file is still in input
      if (fileInput.files && fileInput.files.length > 0) {
        // Check for error messages
        const errorElement = document.querySelector(
          '[class*="error"], [class*="Error"], .upload-error',
        );
        if (
          errorElement &&
          errorElement.textContent.toLowerCase().includes("error")
        ) {
          console.warn("⚠️ Upload error detected");
          return false;
        }

        // Check if upload is still processing
        const loadingElement = document.querySelector(
          '[class*="loading"], [class*="uploading"], .spinner',
        );
        if (!loadingElement) {
          // No loading indicator and file is in input - consider success
          console.log("✅ Upload appears complete (file in input, no loading)");
          return true;
        }
      }

      await this.wait(500);
    }

    // Timeout fallback: check if file is in input
    if (fileInput.files && fileInput.files.length > 0) {
      console.log("✅ Upload confirmed (file in input after timeout)");
      return true;
    }

    console.warn("⚠️ Upload confirmation timeout");
    return false;
  }

  /**
   * Dispatch file events on input element (NO MORE FIXED DELAYS!)
   */
  async dispatchFileEvents(fileInput) {
    try {
      const changeEvent = new Event("change", { bubbles: true });
      fileInput.dispatchEvent(changeEvent);

      const inputEvent = new Event("input", { bubbles: true });
      fileInput.dispatchEvent(inputEvent);

      const blurEvent = new Event("blur", { bubbles: true });
      fileInput.dispatchEvent(blurEvent);

      fileInput.focus();
      fileInput.blur();
    } catch (error) {
      console.error("❌ Error dispatching file events:", error);
    }
  }

  /**
   * Determine file type based on input field context - adapted for SimplyHired
   */
  determineFileType(fileInput) {
    try {
      const name = (fileInput.name || "").toLowerCase();
      const id = (fileInput.id || "").toLowerCase();

      if (
        name.includes("resume") ||
        id.includes("resume") ||
        name.includes("cv") ||
        id.includes("cv")
      ) {
        return "resume";
      }

      if (
        name.includes("cover") ||
        id.includes("cover") ||
        name.includes("letter") ||
        id.includes("letter")
      ) {
        return "coverLetter";
      }

      // Check surrounding context for SimplyHired-specific containers
      const container =
        fileInput.closest(
          ".file-upload-container, .resume-upload, .cover-letter-upload",
        ) || fileInput.parentElement;
      if (container) {
        const containerClass = container.className.toLowerCase();
        const containerText = container.textContent.toLowerCase();

        // Check classes first
        if (
          containerClass.includes("cover-letter") ||
          containerClass.includes("cover")
        ) {
          return "coverLetter";
        }
        if (
          containerClass.includes("resume") ||
          containerClass.includes("cv")
        ) {
          return "resume";
        }

        // Then check text content
        if (containerText.includes("resume") || containerText.includes("cv")) {
          return "resume";
        }

        if (
          containerText.includes("cover letter") ||
          containerText.includes("cover")
        ) {
          return "coverLetter";
        }
      }

      // Check label
      const label = this.getFileInputLabel(fileInput);
      if (label) {
        const labelText = label.toLowerCase();

        if (labelText.includes("resume") || labelText.includes("cv")) {
          return "resume";
        }

        if (labelText.includes("cover") || labelText.includes("letter")) {
          return "coverLetter";
        }
      }

      return "resume";
    } catch (error) {
      console.error("Error determining file type:", error);
      return "resume";
    }
  }

  /**
   * Get label for file input
   */
  getFileInputLabel(fileInput) {
    try {
      if (fileInput.id) {
        const label = document.querySelector(`label[for="${fileInput.id}"]`);
        if (label) {
          return label.textContent.trim();
        }
      }

      const parentLabel = fileInput.closest("label");
      if (parentLabel) {
        return parentLabel.textContent.trim();
      }

      const formGroup = fileInput.closest(
        ".file-upload-container, .upload-section, .form-group",
      );
      if (formGroup) {
        const label = formGroup.querySelector(
          "label, .form-label, .field-label, h2, h3",
        );
        if (label) {
          return label.textContent.trim();
        }
      }

      return "";
    } catch (error) {
      return "";
    }
  }

  /**
   * Get file URLs from user details
   */
  getFileUrls(userDetails, fileType) {
    switch (fileType) {
      case "resume":
        return userDetails.resumes;

      case "coverLetter":
        return userDetails.coverLetterUrl;

      default:
        return userDetails.resumes;
    }
  }

  /**
   * Wait utility
   */
  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
