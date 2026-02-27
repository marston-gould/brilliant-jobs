import { notifyStatus } from "../../utils/status-helper.js";
import { fetchFile } from "../../shared/utilities/fetch-file.js";

// platforms/simplyhired/simplyhired-file-handler.js
export class SimplyHiredFileHandler {
  constructor(config = {}) {
    this.preferences = config.preferences;
    this.backendApiHost = config.backendApiHost;
    this.aiApiHost = config.aiApiHost;
    this.jwtToken = config.jwtToken;
    this.processedInputs = new Set();
    this.isUploading = false;
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
   * Handle all file uploads in the form using SimplyHired's file system
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

      // Look for SimplyHired file upload containers
      const resumeContainer = form.querySelector(
        ".file-upload-container, .resume-upload, .upload-section"
      );
      const coverLetterContainer = form.querySelector(
        ".cover-letter-upload, .additional-docs"
      );

      let totalContainers = 0;
      let successCount = 0;

      // Handle resume upload (SEQUENTIAL, not parallel)
      if (resumeContainer) {
        totalContainers++;
        const success = await this.handleResumeUpload(
          resumeContainer,
          userDetails,
          jobDescription,
          jobId,
          jobTitle
        );
        if (success) {
          successCount++;
        }

        // Wait between uploads to prevent conflicts
        await this.wait(2000);
      }

      // Handle cover letter upload (SEQUENTIAL, not parallel)
      if (coverLetterContainer && jobDescription) {
        totalContainers++;
        const success = await this.handleCoverLetterUpload(
          coverLetterContainer,
          userDetails,
          jobDescription
        );
        if (success) {
          successCount++;
        }
      }

      this.isUploading = false;

      // ALL uploads must succeed, not just any
      const allUploadsSucceeded =
        totalContainers > 0 && successCount === totalContainers;

      if (allUploadsSucceeded) {
      } else if (totalContainers === 0) {
        return true;
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
        fileInput.form?.querySelectorAll('input[type="file"]') || []
      ).indexOf(fileInput)}`
    );
  }

  /**
   * Handle a single file upload field
   */
  async handleSingleFileUpload(fileInput, userDetails, jobDescription, jobId, jobTitle) {
    try {
      const fileType = this.determineFileType(fileInput);
      const fileUrls = this.getFileUrls(userDetails, fileType);
      if (!fileUrls || fileUrls.length === 0) {
        console.error("❌ No file URLs found for type:", fileType);
        return false;
      }
      if (fileType === "resume" && jobDescription) {
        return await this.handleResumeUploadToInput(
          fileInput,
          userDetails,
          jobDescription,
          fileUrls,
          jobId,
          jobTitle
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
          userDetails
        );
      } else {
        console.log("📤 Uploading file directly (no job description)");
        return await this.uploadFileFromUrl(
          fileInput,
          fileUrls[0].fileUrl,
          userDetails
        );
      }
    } catch (error) {
      console.error("❌ Error in handleSingleFileUpload:", error);
      return false;
    }
  }

  async uploadCoverLetterPDF(fileInput, letterData, userDetails = null) {
    if (!fileInput) {
      return false;
    }

    try {
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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Failed to generate PDF: ${response.status} - ${
            errorData.error || "Unknown error"
          }`
        );
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
      await new Promise((resolve) => setTimeout(resolve, 50));
      fileInput.blur();

      // Wait for upload completion (no crop modal needed for PDFs)
      const finalUploadSuccess = await this.waitForUploadProcess(fileInput);
      return finalUploadSuccess;
    } catch (error) {
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
    jobTitle
  ) {
    try {
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

      // Step 1: Download resume file via fetchFile
      const resumeFileUrl = fileUrls[fileUrls.length - 1].fileUrl;

      const fileResponse = await fetchFile(resumeFileUrl);
      if (!fileResponse.ok) {
        throw new Error(
          `Failed to download resume file: ${fileResponse.status}`
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

      if (this.preferences?.useCustomResume === true) {
        notifyStatus({ type: "TAILORING_RESUME" });
      } else {
        notifyStatus({ type: "UPLOADING_FILES" });
      }

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

      const fileName = `${
        userDetails.firstName + "_" + userDetails.lastName || "resume"
      }.${blob.type.split("/")[1] == "pdf" ? "pdf" : "docx"}`;

      await this.uploadBlob(fileInput, blob, fileName, userDetails);
      return true;
    } catch (error) {
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

      notifyStatus({ type: "UPLOADING_FILES" });

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

      await this.dispatchFileEvents(fileInput);

      // Additional form integration - trigger any change listeners
      const form = fileInput.closest("form");
      if (form) {
        // Trigger form change event
        const formChangeEvent = new Event("change", { bubbles: true });
        form.dispatchEvent(formChangeEvent);

        // If there's a FormData object, ensure our file is included
        try {
          const formData = new FormData(form);
          if (fileInput.name) {
            formData.set(fileInput.name, file);
          }
        } catch (e) {
          // FormData creation might fail, that's ok
        }
      }

      // CRITICAL: Wait for UI confirmation of upload instead of simple check
      const uploadSuccess = await this.waitForResumeConfirmation(fileInput);

      if (uploadSuccess) {
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
  async handleResumeUpload(resumeContainer, userDetails, jobDescription, jobId, jobTitle) {
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
        jobTitle
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle cover letter upload for SimplyHired containers
   */
  async handleCoverLetterUpload(
    coverLetterContainer,
    userDetails,
    jobDescription
  ) {
    try {
      // Find file input in the container
      const fileInput =
        coverLetterContainer.querySelector('input[type="file"]');
      if (!fileInput) {
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
        userDetails
      );
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

      const cleanFirstName = firstName.replace(/[^\w]/g, "");
      const cleanLastName = lastName.replace(/[^\w]/g, "");

      return `${cleanFirstName}_${cleanLastName}_Resume${extension}`;
    } catch (error) {
      return `Resume_${Date.now()}.pdf`;
    }
  }

  /**
   * Generate proper cover letter filename based on user details
   */
  generateCoverLetterFileName(userDetails, fileUrl) {
    try {
      // Extract file extension from URL
      let extension = ".pdf";
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
   * Wait for upload process to complete - adapted for SimplyHired selectors
   */
  async waitForUploadProcess(fileInput, timeout = 30000) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkUpload = () => {
        const elapsed = Date.now() - startTime;

        const container =
          fileInput.closest("form, .file-upload-container, .upload-section") ||
          fileInput.parentElement;

        // Check if file is properly set in input
        if (fileInput.files && fileInput.files.length > 0) {
          const file = fileInput.files[0];

          // If input has our uploaded attribute, consider it successful
          if (fileInput.getAttribute("data-file-uploaded") === "true") {
            resolve(true);
            return;
          }
        }

        // Look for SimplyHired-specific success indicators
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
          // SimplyHired resume selection specific selectors
          '[data-testid*="file-resume"]',
          '[data-testid*="upload"]',
          ".filename",
          ".file-display-name",
        ];

        for (const selector of successSelectors) {
          const element = container?.querySelector(selector);
          if (element && element.textContent.trim()) {
            resolve(true);
            return;
          }
        }

        // Check if the filename is displayed in SimplyHired structure
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
              "File exceeds the maximum upload size",
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

        // Check for file input state - be more lenient with timing for SimplyHired
        if (fileInput.files && fileInput.files.length > 0) {
          // For SimplyHired resume selection, if file is set and we've waited 2 seconds, consider it successful
          if (elapsed > 2000) {
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
   * Wait for resume upload confirmation with loading state detection
   * Adapted from Indeed file handler for more reliable upload detection
   */
  async waitForResumeConfirmation(fileInput, timeout = 15000) {
    const startTime = Date.now();

    // Check for various upload success indicators
    const successSelectors = [
      '[data-testid="ResumeThumbnail"]',
      '[data-testid*="resume-success"]',
      '[data-testid*="file-resume"]',
      ".resume-uploaded",
      ".file-uploaded",
      ".upload-success",
      '[class*="resume"][class*="success"]',
      '[class*="file"][class*="uploaded"]',
      ".file-name",
      ".selected-file",
      ".attachment-name",
      ".filename",
      ".file-display-name",
    ];

    while (Date.now() - startTime < timeout) {
      // Check if any success element exists
      for (const selector of successSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          return true;
        }
      }

      // Also check container for success indicators
      const container =
        fileInput.closest("form, .file-upload-container, .upload-section") ||
        fileInput.parentElement;

      if (container) {
        for (const selector of successSelectors) {
          const element = container.querySelector(selector);
          if (element && element.textContent?.trim()) {
            console.log(`✅ Upload confirmed in container via: ${selector}`);
            return true;
          }
        }

        // Check if filename is displayed
        if (fileInput.files && fileInput.files.length > 0) {
          const fileName = fileInput.files[0].name;
          const containerText = container.textContent || "";
          if (containerText.includes(fileName.split(".")[0])) {
            console.log("✅ Upload confirmed (filename visible in container)");
            return true;
          }
        }
      }

      // Also check if file is in input
      if (fileInput.files && fileInput.files.length > 0) {
        // Check for error messages
        const errorElement = document.querySelector(
          '[class*="error"], [class*="Error"], .upload-error'
        );
        if (
          errorElement &&
          errorElement.textContent.toLowerCase().includes("error")
        ) {
          console.warn("⚠️ Upload error detected");
          return false;
        }

        // Check if upload is still processing (loading indicator)
        const loadingElement = document.querySelector(
          '[class*="loading"], [class*="uploading"], .spinner'
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
   * Dispatch file events on input element
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
      await this.wait(50);
      fileInput.blur();

      await this.wait(100);
    } catch (error) {
      return false;
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
          ".file-upload-container, .resume-upload, .cover-letter-upload"
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
        ".file-upload-container, .upload-section, .form-group"
      );
      if (formGroup) {
        const label = formGroup.querySelector(
          "label, .form-label, .field-label, h2, h3"
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
        return userDetails.resumes; // Return array of objects

      default:
        return userDetails.resumes; // Return array of objects
    }
  }

  /**
   * Wait utility
   */
  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
