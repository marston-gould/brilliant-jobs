// ========================================
// GREENHOUSE FILE HANDLER
// ========================================
import { fetchFile } from "../../shared/utilities/fetch-file.js";

export default class GreenhouseFileHandler {
  constructor(config = {}) {
    this.preferences = config.preferences;
    // Global overlay used via notifyStatus() - no local statusService needed
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
   * Handle all file uploads in the form with duplicate prevention
   */
  async handleFileUploads(form, userDetails, jobDescription, jobId, jobTitle) {
    try {
      // Validate inputs
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
        this.processedInputs.add(inputId); // Mark as processed

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
          return false;
        }
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
      // Determine what type of file this input expects
      const fileType = this.determineFileType(fileInput);
      // Handle different file types
      if (fileType === "resume" && jobDescription) {
        // Get appropriate file URLs
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
        return await this.uploadFileFromUrl(
          fileInput,
          fileUrls[0],
          userDetails
        );
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle resume upload with AI optimization
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

      // Step 1: Download resume file
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
            data: resumeData.data
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
   * Uses primary resume instead of matching with job description
   */
  async matchAndUploadResume(fileInput, userDetails, jobDescription, fileUrls) {
    try {
      // Find primary resume, fall back to first resume if no primary is set
      const primaryResume = fileUrls.find((resume) =>
        typeof resume === "object" && resume?.isPrimary
      );
      const bestResumeUrl = primaryResume?.fileUrl ||
        (typeof fileUrls[0] === "string" ? fileUrls[0] : fileUrls[0]?.fileUrl);

      if (!bestResumeUrl) {
        throw new Error("No valid resume URL found");
      }

      // Upload the primary resume
      const success = await this.uploadFileFromUrl(
        fileInput,
        bestResumeUrl,
        userDetails
      );

      return success;
    } catch (error) {
      // Fallback to first resume URL
      const fallbackUrl =
        typeof fileUrls[0] === "string" ? fileUrls[0] : fileUrls[0]?.fileUrl;
      return await this.uploadFileFromUrl(fileInput, fallbackUrl, userDetails);
    }
  }

  /**
   * Handle cover letter upload - Generate custom PDF like Recruitee
   */
  async handleCoverLetterUpload(fileInput, userDetails, jobDescription) {
    try {
      // Generate custom cover letter PDF like Recruitee does
      const result = await this.uploadCoverLetterPDF(
        fileInput,
        {
          fullName: userDetails.lastName + " " + userDetails.firstName,
          jobDescription: jobDescription,
          skills: userDetails.skills,
          education: userDetails.education,
          fullPositions: userDetails.fullPositions,
          tone: "Professional",
        },
        userDetails
      );

      return result;
    } catch (error) {
      console.log(`📄 No fallback URLs available`);
      return false;
    }
  }

  /**
   * Generate and upload custom cover letter PDF (from Recruitee)
   */
  async uploadCoverLetterPDF(fileInput, letterData, userDetails = null) {
    if (!fileInput) {
      console.log("📄 File input not found");
      return false;
    }

    try {
      // Call the AI service to generate the PDF

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

      console.log("📄 AI service response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.log("📄 AI service error data:", errorData);
        throw new Error(
          `Failed to generate PDF: ${response.status} - ${errorData.error || "Unknown error"
          }`
        );
      }

      // Validate content type
      const contentType = response.headers.get("content-type");
      console.log("📄 Response content type:", contentType);
      if (contentType && !contentType.includes("application/pdf")) {
        console.warn("📄 Expected PDF but received:", contentType);
      }

      const blob = await response.blob();
      console.log("📄 Generated blob size:", blob.size);

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

      console.log("Triggering upload events...");

      // Dispatch events to trigger the upload process
      const changeEvent = new Event("change", { bubbles: true });
      fileInput.dispatchEvent(changeEvent);

      const inputEvent = new Event("input", { bubbles: true });
      fileInput.dispatchEvent(inputEvent);

      // Focus and blur to ensure all handlers are triggered
      fileInput.focus();
      await this.wait(50);
      fileInput.blur();

      console.log("Waiting for upload to complete...");

      // Wait for upload completion (no crop modal needed for PDFs)
      const finalUploadSuccess = await this.waitForUploadProcess(fileInput);

      if (finalUploadSuccess) {
        console.log("✅ Cover letter PDF uploaded successfully!");
      } else {
        console.log("⚠️ Upload may have failed or is still processing");
      }

      return finalUploadSuccess;
    } catch (error) {
      console.error("❌ Error uploading cover letter PDF:", error);
      return false;
    }
  }

  /**
   * Upload file from URL with enhanced debugging
   */
  async uploadFileFromUrl(fileInput, fileUrl, userDetails = null) {
    try {
      if (!fileUrl) {
        return false;
      }

      if (!fileInput) {
        return false;
      }

      // Fetch file
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
  s
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
   * Enhanced blob upload with better filename handling
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

      // Create File object with clean filename
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
      return false;
    }
  }

  /**
   * Enhanced upload process waiting with better error detection
   */
  async waitForUploadProcess(fileInput, timeout = 30000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let checkCount = 0;
      let lastErrorMessage = "";

      const checkUpload = () => {
        checkCount++;
        const elapsed = Date.now() - startTime;

        // Check for success or error indicators
        const container =
          fileInput.closest("form, .field, .form-field") ||
          fileInput.parentElement;

        // Look for success indicators first
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

        // Check for success
        for (const selector of successSelectors) {
          const element = container?.querySelector(selector);
          if (element && element.textContent.trim()) {
            resolve(true);
            return;
          }
        }

        // Check if the filename is displayed anywhere in the form
        if (fileInput.files && fileInput.files.length > 0) {
          const fileName = fileInput.files[0].name;
          const containerText = container?.textContent || "";
          if (containerText.includes(fileName.split(".")[0])) {
            resolve(true);
            return;
          }
        }

        // Enhanced error detection
        const errorSelectors = [
          ".upload-error",
          ".file-error",
          ".error-message",
          ".upload-failed",
          ".file-failed",
          ".error",
          ".validation-error",
        ];

        // Check for errors, but be selective
        for (const selector of errorSelectors) {
          const element = container?.querySelector(selector);
          if (element && element.textContent.trim()) {
            const errorText = element.textContent.trim();

            // Ignore certain generic errors
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
            } else {
              lastErrorMessage = errorText;
            }
          }
        }

        // Check for file input state - if it still has files, that's usually good
        if (fileInput.files && fileInput.files.length > 0) {
          const file = fileInput.files[0];

          // After 10 seconds, if file is still there and no real errors, assume success
          if (elapsed > 10000) {
            resolve(true);
            return;
          }
        }

        // Timeout check - be more optimistic
        if (elapsed > timeout) {
          // If we have the file in input and no real errors, assume success
          if (
            fileInput.files &&
            fileInput.files.length > 0 &&
            !lastErrorMessage.includes("Invalid")
          ) {
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
   * Enhanced file events dispatching with logging
   */
  async dispatchFileEvents(fileInput) {
    try {
      // Dispatch change event
      const changeEvent = new Event("change", { bubbles: true });
      fileInput.dispatchEvent(changeEvent);

      // Dispatch input event
      const inputEvent = new Event("input", { bubbles: true });
      fileInput.dispatchEvent(inputEvent);

      // Additional events for Greenhouse forms
      const blurEvent = new Event("blur", { bubbles: true });
      fileInput.dispatchEvent(blurEvent);

      // Focus and then blur to trigger validation
      fileInput.focus();
      await this.wait(50);
      fileInput.blur();

      await this.wait(100);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Determine file type based on input field context
   */
  determineFileType(fileInput) {
    try {
      // Check input attributes
      const name = (fileInput.name || "").toLowerCase();
      const id = (fileInput.id || "").toLowerCase();

      console.log(
        `🔍 Determining file type for input - ID: "${fileInput.id}", Name: "${fileInput.name}"`
      );

      // Check for cover letter first (more specific)
      if (
        id === "cover_letter" ||
        name === "cover_letter" ||
        name.includes("cover") ||
        id.includes("cover") ||
        name.includes("letter") ||
        id.includes("letter")
      ) {
        console.log(`📄 Detected cover letter input`);
        return "coverLetter";
      }

      if (
        name.includes("resume") ||
        id.includes("resume") ||
        name.includes("cv") ||
        id.includes("cv")
      ) {
        console.log(`📄 Detected resume input`);
        return "resume";
      }

      // Check surrounding context
      const container =
        fileInput.closest(".file-upload") ||
        fileInput.closest(".field, .form-field") ||
        fileInput.parentElement;
      if (container) {
        const containerText = container.textContent.toLowerCase();
        console.log(`🏷️ Container text: "${containerText}"`);

        if (
          containerText.includes("cover letter") ||
          containerText.includes("cover")
        ) {
          console.log(`📄 Detected cover letter from container`);
          return "coverLetter";
        }

        if (containerText.includes("resume") || containerText.includes("cv")) {
          console.log(`📄 Detected resume from container`);
          return "resume";
        }
      }

      // Check label
      const label = this.getFileInputLabel(fileInput);
      if (label) {
        const labelText = label.toLowerCase();
        console.log(`🏷️ Label text: "${labelText}"`);

        if (labelText.includes("cover") || labelText.includes("letter")) {
          console.log(`📄 Detected cover letter from label`);
          return "coverLetter";
        }

        if (labelText.includes("resume") || labelText.includes("cv")) {
          console.log(`📄 Detected resume from label`);
          return "resume";
        }
      }

      // Default to resume
      console.log(`📄 Defaulting to resume`);
      return "resume";
    } catch (error) {
      console.log(`❌ Error determining file type:`, error);
      return "resume";
    }
  }

  /**
   * Get label for file input
   */
  getFileInputLabel(fileInput) {
    try {
      // Method 1: Associated label
      if (fileInput.id) {
        const label = document.querySelector(`label[for="${fileInput.id}"]`);
        if (label) {
          return label.textContent.trim();
        }
      }

      // Method 2: Greenhouse file upload structure - check for upload-label-{id}
      if (fileInput.id) {
        const uploadLabel = document.querySelector(
          `#upload-label-${fileInput.id}`
        );
        if (uploadLabel) {
          return uploadLabel.textContent.trim();
        }
      }

      // Method 3: Parent label
      const parentLabel = fileInput.closest("label");
      if (parentLabel) {
        return parentLabel.textContent.trim();
      }

      // Method 4: Greenhouse file upload container
      const fileUploadContainer = fileInput.closest(".file-upload");
      if (fileUploadContainer) {
        const label = fileUploadContainer.querySelector(".upload-label");
        if (label) {
          return label.textContent.trim();
        }
      }

      // Method 5: Greenhouse-specific structure
      const greenhouseField = fileInput.closest(".field");
      if (greenhouseField) {
        const label = greenhouseField.querySelector(
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
   * Check if file input is accessible
   */
  isFileInputAccessible(fileInput) {
    if (!fileInput) return false;
    return !fileInput.disabled && this.isElementVisible(fileInput);
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
