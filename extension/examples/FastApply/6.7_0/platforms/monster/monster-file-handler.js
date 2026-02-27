// platforms/monster/monster-file-handler.js
import { fetchFile } from "../../shared/utilities/fetch-file.js";

export class MonsterFileHandler {
  constructor(config = {}) {
    this.preferences = config.preferences;
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
   * Handle all file uploads in the form with duplicate prevention
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
        // Skip if already processed
        const inputId = this.getInputIdentifier(fileInput);
        if (this.processedInputs.has(inputId)) {
          continue;
        }

        if (!this.isFileInputAccessible(fileInput)) continue;

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
          console.error("Error uploading file:", error);
          return false;
        }
      }

      return successCount > 0 || uploadCount === 0;
    } catch (error) {
      console.error("Error in handleFileUploads:", error);
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
      fileInput.getAttribute("data-testid") ||
      `input-${Array.from(
        fileInput.form?.querySelectorAll('input[type="file"]') || []
      ).indexOf(fileInput)}`
    );
  }

  /**
   * Check if file input is accessible
   */
  isFileInputAccessible(fileInput) {
    if (!fileInput) return false;

    // For invisible file inputs, check if they're in the DOM and not disabled
    if (
      fileInput.classList.contains("invisible-resume-upload") ||
      fileInput.classList.contains("application-file-input")
    ) {
      return !fileInput.disabled && fileInput.offsetParent !== null;
    }

    return this.isElementVisible(fileInput);
  }

  /**
   * Check if element is visible
   */
  isElementVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);

    // File inputs with opacity:0 are a common UX pattern
    if (element.tagName === "INPUT" && element.type === "file") {
      return style.display !== "none" && style.visibility !== "hidden";
    }

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0"
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

        return await this.handleResumeUpload(
          fileInput,
          userDetails,
          jobDescription,
          fileUrls,
          jobId,
          jobTitle
        );
      } else if (fileType === "coverLetter" && jobDescription) {
        return await this.handleCoverLetterUpload(
          fileInput,
          userDetails,
          jobDescription
        );
      } else {
        const fileUrls = this.getFileUrls(userDetails, "resume");
        if (fileUrls && fileUrls.length > 0) {
          return await this.uploadFileFromUrl(
            fileInput,
            fileUrls[0]?.fileUrl || fileUrls[0],
            userDetails
          );
        }
        return false;
      }
    } catch (error) {
      console.error("Error in handleSingleFileUpload:", error);
      return false;
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
      console.error("Error in handleCoverLetterUpload:", error);
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

      const uploadResult = await this.uploadBlob(
        fileInput,
        blob,
        fileName,
        userDetails
      );

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
   * Handle resume upload
   */
  async handleResumeUpload(fileInput, userDetails, jobDescription, fileUrls, jobId, jobTitle) {
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
      console.error("Error in handleResumeUpload:", error);
      return false;
    }
  }

  /**
   * Generate and upload custom resume
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
        preferences.resumeType === "docx"
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
        throw new Error(`Failed to download resume file: ${fileResponse.status}`);
      }

      const resumeBlob = await fileResponse.blob();
      const resumeFileName = resumeFileUrl.split("/").pop() || "resume.pdf";
      const resumeFile = new File([resumeBlob], resumeFileName, {
        type: resumeBlob.type || "application/pdf",
      });

      // Step 2: Parse Resume
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

      // Step 4: Generate Resume
      if (preferences.resumeType === "docx") {
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

      const fileName = `${
        userDetails.firstName + "_" + userDetails.lastName || "resume"
      }.${blob.type.split("/")[1] === "pdf" ? "pdf" : "docx"}`;

      await this.uploadBlob(fileInput, blob, fileName, userDetails);
      return true;
    } catch (error) {
      console.error("Error generating custom resume:", error);

      // Fallback to uploading existing resume
      return await this.uploadFileFromUrl(
        fileInput,
        fileUrls[0].fileUrl,
        userDetails
      );
    }
  }

  /**
   * Match and upload best resume
   */
  async matchAndUploadResume(fileInput, userDetails, jobDescription, fileUrls) {
    try {
      if (userDetails && userDetails.jwtToken) {
        this.jwtToken = userDetails.jwtToken;
      }

      // Find primary resume, fall back to first resume
      const primaryResume = fileUrls.find((resume) => resume.isPrimary);
      const resumeToUploadUrl = primaryResume?.fileUrl || fileUrls[0]?.fileUrl;

      if (!resumeToUploadUrl) {
        throw new Error("No valid resume URL found");
      }

      const success = await this.uploadFileFromUrl(
        fileInput,
        resumeToUploadUrl,
        userDetails
      );
      return success;
    } catch (error) {
      console.error("Error uploading resume:", error);

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
        throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
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
      console.error("Error uploading file from URL:", error);
      return false;
    }
  }

  /**
   * Upload blob to file input
   */
  async uploadBlob(fileInput, blob, originalFileName, userDetails = null) {
    try {
      if (blob.size === 0) {
        throw new Error("File is empty");
      }

      // Generate proper filename
      let fileName;
      if (userDetails) {
        const originalLower = (originalFileName || "").toLowerCase();
        if (originalLower.includes("cover") || originalLower.includes("letter")) {
          fileName = this.generateCoverLetterFileName(userDetails, originalFileName);
        } else {
          fileName = this.generateResumeFileName(userDetails, originalFileName);
        }
      } else {
        fileName = this.extractFileNameFromUrl(originalFileName);
      }

      // Create File object
      const file = new File([blob], fileName, {
        type: blob.type || "application/pdf",
        lastModified: Date.now(),
      });

      // Create DataTransfer to simulate file selection
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // Set files on input
      fileInput.files = dataTransfer.files;

      // Trigger events
      await this.dispatchFileEvents(fileInput);

      // Wait for upload to process
      const uploadSuccess = await this.waitForUploadProcess(fileInput);

      return uploadSuccess;
    } catch (error) {
      console.error("Error uploading blob:", error);
      return false;
    }
  }

  /**
   * Generate resume filename
   */
  generateResumeFileName(userDetails, fileUrl) {
    try {
      let extension = ".pdf";
      if (fileUrl) {
        const urlLower = fileUrl.toLowerCase();
        if (urlLower.includes(".docx")) {
          extension = ".docx";
        } else if (urlLower.includes(".doc")) {
          extension = ".doc";
        }
      }

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
   * Generate cover letter filename
   */
  generateCoverLetterFileName(userDetails, fileUrl) {
    try {
      let extension = ".pdf";
      if (fileUrl) {
        const urlLower = fileUrl.toLowerCase();
        if (urlLower.includes(".docx")) {
          extension = ".docx";
        } else if (urlLower.includes(".doc")) {
          extension = ".doc";
        }
      }

      const firstName = userDetails?.firstName?.trim() || "FirstName";
      const lastName = userDetails?.lastName?.trim() || "LastName";

      const cleanFirstName = firstName.replace(/[^\w]/g, "");
      const cleanLastName = lastName.replace(/[^\w]/g, "");

      return `${cleanFirstName}_${cleanLastName}_Cover_Letter${extension}`;
    } catch (error) {
      return `Cover_Letter_${Date.now()}.pdf`;
    }
  }

  /**
   * Extract filename from URL
   */
  extractFileNameFromUrl(url) {
    try {
      if (!url || typeof url !== "string") {
        return `resume_${Date.now()}.pdf`;
      }

      let workingUrl = url.trim();

      if (!workingUrl.startsWith("http://") && !workingUrl.startsWith("https://")) {
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

      const checkUpload = () => {
        const elapsed = Date.now() - startTime;

        const container =
          fileInput.closest("form, .form-group") || fileInput.parentElement;

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
   * Dispatch file events
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
      // Silent fail
    }
  }

  /**
   * Determine file type based on input field context
   */
  determineFileType(fileInput) {
    try {
      const name = (fileInput.name || "").toLowerCase();
      const id = (fileInput.id || "").toLowerCase();
      const dataQa = (fileInput.getAttribute("data-qa") || "").toLowerCase();
      const dataTestId = (fileInput.getAttribute("data-testid") || "").toLowerCase();

      // Check for cover letter first
      if (
        name.includes("coverletter") ||
        name.includes("cover_letter") ||
        name.includes("cover-letter") ||
        id.includes("coverletter") ||
        id.includes("cover_letter") ||
        id.includes("cover-letter") ||
        dataQa.includes("cover") ||
        dataTestId.includes("cover")
      ) {
        return "coverLetter";
      }

      // Check for resume/cv
      if (
        name.includes("resume") ||
        id.includes("resume") ||
        name.includes("cv") ||
        id.includes("cv") ||
        dataQa.includes("resume") ||
        dataTestId.includes("resume")
      ) {
        return "resume";
      }

      // Check surrounding context
      const container =
        fileInput.closest(".form-group") || fileInput.parentElement;
      if (container) {
        const containerText = container.textContent.toLowerCase();

        if (
          containerText.includes("cover letter") ||
          containerText.includes("coverletter")
        ) {
          return "coverLetter";
        }

        if (containerText.includes("resume") || containerText.includes("cv")) {
          return "resume";
        }
      }

      // Check label
      const label = this.getFileInputLabel(fileInput);
      if (label) {
        const labelText = label.toLowerCase();

        if (
          labelText.includes("cover letter") ||
          labelText.includes("coverletter")
        ) {
          return "coverLetter";
        }

        if (labelText.includes("resume") || labelText.includes("cv")) {
          return "resume";
        }
      }

      return "resume"; // Default to resume
    } catch (error) {
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

      const formGroup = fileInput.closest(".form-group");
      if (formGroup) {
        const label = formGroup.querySelector("label, .form-label, .field-label");
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
   * Wait utility
   */
  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
