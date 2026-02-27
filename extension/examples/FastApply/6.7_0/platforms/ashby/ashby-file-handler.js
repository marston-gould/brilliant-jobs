// platforms/ashby/ashby-file-handler.js

import { fetchFile } from "../../shared/utilities/fetch-file.js";

export class AshbyFileHandler {
  constructor(config = {}) {
    this.preferences = config.preferences;
    // Global overlay used via notifyStatus()
    this.backendApiHost = config.backendApiHost;
    this.aiApiHost = config.aiApiHost;
    this.jwtToken = config.jwtToken;
    this.processedInputs = new Set();
  }

  getAuthHeaders(includeContentType = true) {
    const headers = {};
    if (includeContentType) {
      headers["Content-Type"] = "application/json";
    }
    if (this.jwtToken) {
      headers["Authorization"] = `Bearer ${this.jwtToken}`;
    }
    return headers;
  }

  /**
   * Handle all file uploads in the form with enhanced debugging
   */
  async handleFileUploads(form, userDetails, jobDescription, jobId, jobTitle) {
    try {
      if (!form) {
        return false;
      }

      if (!userDetails) {
        return false;
      }

      // Find all file input fields
      const fileInputs = form.querySelectorAll('input[type="file"]');

      if (fileInputs.length === 0) {
        return true;
      }

      let uploadCount = 0;
      let successCount = 0;

      for (const fileInput of fileInputs) {
        const inputId = this.getInputIdentifier(fileInput);
        if (this.processedInputs.has(inputId)) {
          continue;
        }

        if (!this.isFileInputAccessible(fileInput)) {
          continue;
        }

        uploadCount++;
        this.processedInputs.add(inputId);

        try {
          const result = await this.handleSingleFileUpload(
            fileInput,
            userDetails,
            jobDescription,
            jobId,
            jobTitle
          );

          if (result) {
            successCount++;
          }
        } catch (error) {
          throw error;
        }
      }

      if (successCount > 0) {
        return true;
      } else if (uploadCount > 0) {
        return false;
      }

      return successCount > 0;
    } catch (error) {
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
      fileInput.getAttribute("data-testid") ||
      `input-${Array.from(
        fileInput.form?.querySelectorAll('input[type="file"]') || []
      ).indexOf(fileInput)}`
    );
  }

  /**
   * Handle a single file upload field - Ashby specific
   */
  async handleSingleFileUpload(fileInput, userDetails, jobDescription, jobId, jobTitle) {
    try {
      const fileType = this.determineFileType(fileInput);

      // Cover letters are generated, not uploaded from URL
      if (fileType === "coverLetter" && jobDescription) {
        return await this.handleCoverLetterUpload(
          fileInput,
          userDetails,
          jobDescription
        );
      }

      // For resume and other file types, we need file URLs
      let fileUrls = this.getFileUrls(userDetails, fileType);

      if (!fileUrls || fileUrls.length === 0) {
        return false;
      }

      if (fileType === "resume" && jobDescription) {
        return await this.handleResumeUpload(
          fileInput,
          userDetails,
          jobDescription,
          fileUrls,
          jobId,
          jobTitle
        );
      } else {
        return await this.uploadFileFromUrl(
          fileInput,
          fileUrls[0].fileUrl,
          userDetails
        );
      }
    } catch (error) {
      return false;
    }
  }
  /**
   * Handle resume upload with AI optimization
   */
  async handleResumeUpload(fileInput, userDetails, jobDescription, fileUrls, jobId, jobTitle) {
    try {
      console.log(this.preferences);
      if (this.preferences?.useCustomResume === true) {
        return await this.generateAndUploadCustomResume(
          fileInput,
          userDetails,
          jobDescription,
          fileUrls,
          this.preferences,
          jobId,
          jobTitle
        );
      } else {
        return await this.matchAndUploadResume(
          fileInput,
          userDetails,
          jobDescription,
          fileUrls
        );
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate and upload custom resume for unlimited users
   */
  async generateAndUploadCustomResume(
    fileInput,
    userDetails,
    jobDescription,
    fileUrls,
    preferences,
    jobId,
    jobTitle
  ) {
    try {
      if (userDetails && userDetails.jwtToken) {
        this.jwtToken = userDetails.jwtToken;
      }
      let generateURL =
        preferences.resumeType == "docx"
          ? `${this.backendApiHost}/api/v1/resume-builder/generate`
          : `https://resumify.fastapply.co/api/generate-resume-pdf`;

      const [parseURL, optimizeURL] = [
        `${this.backendApiHost}/api/v1/resumes/extract-text`,
        `${this.backendApiHost}/api/v1/resume-builder/optimize-ats`,
      ];

      // Step 1: Download resume file via proxy
 // Get primary resume URL from user profile (or first resume as fallback)
      const primaryResume = userDetails.resumes?.find(
        (resume) => resume.isPrimary
      );
      const resumeUrl =
        primaryResume?.fileUrl || userDetails.resumes?.[0]?.fileUrl;

      if (!resumeUrl) {
        console.log("⚠️ No resume URLs found in user profile");
        return false;
      }

      const fileResponse = await fetchFile(resumeUrl);
      if (!fileResponse.ok) {
        throw new Error(
          `Failed to download resume file: ${fileResponse.status}`
        );
      }

      const resumeBlob = await fileResponse.blob();
      const resumeFileName = resumeUrl.split("/").pop() || "resume.pdf";
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

      // Step 4: Generate Resume DOCX
      if (preferences.resumeType == "docx") {
        generateResponse = await fetch(generateURL, {
          method: "POST",
          headers: this.getAuthHeaders(),
          body: JSON.stringify({
            template: `${preferences.resumeTemplate}_template`,
            data: resumeData.data,
          }),
        });
      } else {
        userDetails.author = userDetails.firstName + " " + userDetails.lastName;
        generateResponse = await fetch(generateURL, {
          method: "POST",
          headers: this.getAuthHeaders(),
          body: JSON.stringify({
            user_data: userDetails,
            resume_data: resumeData.data,
            template: preferences.resumeTemplate,
          }),
        });
      }

      if (!generateResponse.ok) {
        throw new Error(`Generate Resume Failed: ${generateResponse.status}`);
      }

      const blob = await generateResponse.blob();

      if (blob.size === 0) {
        throw new Error("Generated DOCX file is empty");
      }

      const fileName = `${userDetails.firstName + "_" + userDetails.lastName || "resume"
        }.${blob.type.split("/")[1]}`;
      await this.uploadBlob(fileInput, blob, fileName, userDetails);
      return true;
    } catch (error) {
      console.error("❌ Resume tailoring failed, falling back to normal resume:", error.message || error);
      return await this.uploadFileFromUrl(
        fileInput,
        fileUrls[0].fileUrl,
        userDetails
      );
    }
  }

  /**
   * Match and upload best resume for the job
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
        throw new Error("No resume URL found");
      }

      const success = await this.uploadFileFromUrl(
        fileInput,
        resumeToUploadUrl,
        userDetails
      );

      return success;
    } catch (error) {
      // Fallback to uploading the first resume's URL
      return await this.uploadFileFromUrl(
        fileInput,
        fileUrls[0]?.fileUrl,
        userDetails
      );
    }
  }

  /**
   * Handle cover letter upload
   */
  async handleCoverLetterUpload(fileInput, userDetails, jobDescription) {
    try {
      return await this.generateAndUploadCoverLetter(
        fileInput,
        userDetails,
        jobDescription
      );
    } catch (error) {
      console.error("Error handling cover letter upload:", error);
      return false;
    }
  }

  /**
   * Generate and upload custom cover letter PDF
   */
  async generateAndUploadCoverLetter(fileInput, userDetails, jobDescription) {
    try {
      if (!fileInput) {
        return false;
      }

      const letterData = {
        fullName: userDetails.firstName + " " + userDetails.lastName,
        jobDescription: jobDescription,
        skills: userDetails.skills,
        education: userDetails.education,
        fullPositions: userDetails.fullPositions,
        tone: "Professional",
      };

      const response = await fetch(
        `https://resumify.fastapply.co/api/generate-cover-letter-pdf`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(letterData),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to generate cover letter PDF: ${response.status}`);
      }

      const blob = await response.blob();

      if (blob.size === 0) {
        throw new Error("Generated cover letter PDF is empty");
      }

      const fileName = this.generateCoverLetterFileName(userDetails, null);
      const uploadResult = await this.uploadBlob(fileInput, blob, fileName, userDetails);

      return uploadResult;
    } catch (error) {
      console.error("Error generating cover letter PDF:", error);
      // Fallback to URL upload if available
      const fileUrls = this.getFileUrls(userDetails, "coverLetter");
      if (fileUrls && fileUrls.length > 0) {
        return await this.uploadFileFromUrl(
          fileInput,
          fileUrls[0].fileUrl,
          userDetails
        );
      }
      return false;
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
          `Failed to fetch file: ${response.status} ${response.statusText}`
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
        userDetails
      );

      return uploadResult;
    } catch (error) {
      return false;
    }
  }

  /**
   * Wait for Ashby upload process to complete
   */
  async waitForAshbyUploadProcess(fileInput, container, timeout = 30000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let checkCount = 0;

      const checkUpload = () => {
        checkCount++;
        const elapsed = Date.now() - startTime;

        // Check if files are set on the input
        if (fileInput.files && fileInput.files.length > 0) {
          // Look for success indicators in Ashby's structure
          if (container) {
            // Check if upload button text changed
            const uploadButton = container.querySelector("button");
            if (uploadButton) {
              const buttonText = uploadButton.textContent.toLowerCase();
              console.log("📝 Upload button text:", buttonText);

              if (
                buttonText.includes("uploaded") ||
                buttonText.includes("selected") ||
                buttonText.includes(fileInput.files[0].name.toLowerCase())
              ) {
                resolve(true);
                return;
              }
            }

            // Check for filename display
            const fileNameDisplay = container.querySelector(
              '[class*="fileName"], [class*="file-name"], .uploaded-file'
            );
            if (fileNameDisplay && fileNameDisplay.textContent.trim()) {
              resolve(true);
              return;
            }

            // Check for any success indicators
            const successElements = container.querySelectorAll(
              '[class*="success"], [class*="uploaded"], [class*="complete"]'
            );
            if (successElements.length > 0) {
              resolve(true);
              return;
            }
          }

          // If we have files but no visual confirmation after reasonable time, assume success
          if (elapsed > 10000) {
            resolve(true);
            return;
          }
        }

        // Check for error indicators
        if (container) {
          const errorElements = container.querySelectorAll(
            '[class*="error"], [class*="failed"]'
          );
          if (errorElements.length > 0) {
            console.log("❌ Found error indicators");
            resolve(false);
            return;
          }
        }

        if (elapsed > timeout) {
          resolve(fileInput.files && fileInput.files.length > 0);
          return;
        }

        setTimeout(checkUpload, 1000);
      };

      checkUpload();
    });
  }

  /**
   * Upload blob to Ashby file input (handles hidden inputs)
   */
  async uploadBlob(fileInput, blob, originalFileName, userDetails = null) {
    try {
      if (blob.size === 0) {
        throw new Error("File is empty");
      }

      // Generate proper filename using user details if available
      let fileName;
      if (userDetails) {
        // Try to determine if this is a cover letter based on the original filename
        const originalLower = (originalFileName || "").toLowerCase();
        if (
          originalLower.includes("cover") ||
          originalLower.includes("letter")
        ) {
          fileName = this.generateCoverLetterFileName(
            userDetails,
            originalFileName
          );
        } else {
          fileName = this.generateResumeFileName(userDetails, originalFileName);
        }
      } else {
        fileName = this.extractFileNameFromUrl(originalFileName);
      }

      const file = new File([blob], fileName, {
        type: blob.type || "application/pdf",
        lastModified: Date.now(),
      });

      // Find the file input container
      const container =
        fileInput.closest('[class*="_container_"]') ||
        fileInput.closest('[class*="_fieldEntry_"]') ||
        fileInput.parentElement;

      // Create DataTransfer and set files on the hidden input
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;

      // Dispatch events on the hidden file input
      await this.dispatchFileEvents(fileInput);

      // For Ashby, we need to simulate the file being selected through their custom UI
      // Try to trigger their custom file handler
      if (container) {
        // Look for the custom upload button
        const uploadButton = container.querySelector(
          '[class*="_button_"], button[class*="button"]'
        );

        if (
          uploadButton &&
          uploadButton.textContent.toLowerCase().includes("upload")
        ) {
          // Create a custom event to simulate file selection
          const changeEvent = new Event("change", { bubbles: true });
          Object.defineProperty(changeEvent, "target", {
            writable: false,
            value: fileInput,
          });

          // Dispatch on the container to trigger Ashby's handlers
          container.dispatchEvent(changeEvent);
          await this.wait(500);
        }

        // Also try triggering drop event in case Ashby listens for that
        const dropEvent = new DragEvent("drop", {
          bubbles: true,
          dataTransfer: dataTransfer,
        });
        container.dispatchEvent(dropEvent);
        await this.wait(200);
      }

      // Wait for Ashby's upload processing
      const uploadSuccess = await this.waitForAshbyUploadProcess(
        fileInput,
        container
      );

      return uploadSuccess;
    } catch (error) {
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

  /**
   * Enhanced filename extraction with proper URL decoding
   */
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
   * Wait for upload process to complete
   */
  async waitForUploadProcess(fileInput, timeout = 30000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let checkCount = 0;

      const checkUpload = () => {
        checkCount++;
        const elapsed = Date.now() - startTime;

        const container =
          fileInput.closest("form, .form-field") || fileInput.parentElement;

        // Look for success indicators
        const successSelectors = [
          ".upload-success",
          ".file-uploaded",
          ".upload-complete",
          ".success-message",
          ".file-success",
          ".uploaded",
          ".file-name",
          ".filename",
          ".selected-file",
        ];

        for (const selector of successSelectors) {
          const element = container?.querySelector(selector);
          if (element && element.textContent.trim()) {
            resolve(true);
            return;
          }
        }

        // Check if the filename is displayed
        if (fileInput.files && fileInput.files.length > 0) {
          const fileName = fileInput.files[0].name;
          const containerText = container?.textContent || "";
          if (containerText.includes(fileName.split(".")[0])) {
            resolve(true);
            return;
          }
        }

        // Check for errors
        const errorSelectors = [
          ".upload-error",
          ".file-error",
          ".error-message",
          ".upload-failed",
          ".file-failed",
          ".error",
          ".validation-error",
        ];

        for (const selector of errorSelectors) {
          const element = container?.querySelector(selector);
          if (element && element.textContent.trim()) {
            const errorText = element.textContent.trim();

            const ignoredErrors = [
              "File exceeds the maximum upload size of 100MB",
              "Please select a file",
              "Invalid file type",
            ];

            const isIgnoredError = ignoredErrors.some((ignored) =>
              errorText.includes(ignored)
            );

            if (!isIgnoredError) {
              resolve(false);
              return;
            }
          }
        }

        // Check for file input state
        if (fileInput.files && fileInput.files.length > 0) {
          if (elapsed > 10000) {
            resolve(true);
            return;
          }
        }

        if (elapsed > timeout) {
          if (fileInput.files && fileInput.files.length > 0) {
            resolve(true);
          } else {
            resolve(false);
          }
          return;
        }

        setTimeout(checkUpload, 500);
      };

      checkUpload();
    });
  }

  /**
   * Enhanced dispatch file events for Ashby
   */
  async dispatchFileEvents(fileInput) {
    try {
      // Standard file events
      const changeEvent = new Event("change", { bubbles: true });
      fileInput.dispatchEvent(changeEvent);

      const inputEvent = new Event("input", { bubbles: true });
      fileInput.dispatchEvent(inputEvent);

      // Focus/blur cycle
      try {
        fileInput.focus();
        await this.wait(50);
        fileInput.blur();
      } catch (e) {
        // Hidden inputs can't be focused, that's ok
      }

      // Additional events that Ashby might listen for
      const loadEvent = new Event("load", { bubbles: true });
      fileInput.dispatchEvent(loadEvent);

      await this.wait(100);
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if file input is accessible (handles Ashby hidden inputs)
   */
  isFileInputAccessible(fileInput) {
    if (!fileInput) return false;

    // For Ashby, the file input is hidden but still functional
    if (fileInput.style.display === "none" && fileInput.type === "file") {
      // Check if the container is visible
      const container =
        fileInput.closest('[class*="_container_"]') ||
        fileInput.closest('[class*="_fieldEntry_"]');
      return container && this.isElementVisible(container);
    }

    return this.isElementVisible(fileInput);
  }

  /**
   * Determine file type based on input field context
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

      // Check label first (most reliable for Ashby)
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

      // Check surrounding context with Ashby-specific selectors
      const container =
        fileInput.closest(".ashby-application-form-field-entry") ||
        fileInput.closest('[class*="_fieldEntry_"]') ||
        fileInput.closest('[class*="_container_"]') ||
        fileInput.closest(".form-field") ||
        fileInput.parentElement;
      if (container) {
        const containerText = container.textContent.toLowerCase();

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

      // Ashby-specific field entry container
      const fieldEntry = fileInput.closest(".ashby-application-form-field-entry") ||
        fileInput.closest('[class*="_fieldEntry_"]');
      if (fieldEntry) {
        const label = fieldEntry.querySelector(
          'label, .ashby-application-form-question-title, [class*="_label_"]'
        );
        if (label) {
          return label.textContent.trim();
        }
      }

      const formField = fileInput.closest(".form-field");
      if (formField) {
        const label = formField.querySelector(
          "label, .form-label, .field-label"
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
   * Returns array of resume objects with fileUrl property
   */
  getFileUrls(userDetails, fileType) {
    switch (fileType) {
      case "resume":
        return userDetails.resumes || [];

      case "coverLetter":
        if (userDetails.coverLetterUrl) {
          return [{ fileUrl: userDetails.coverLetterUrl }];
        }
        return [];

      default:
        return userDetails.resumes || [];
    }
  }

  /**
   * Check if element is visible
   */
  isElementVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0"
    );
  }

  /**
   * Wait utility
   */
  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
