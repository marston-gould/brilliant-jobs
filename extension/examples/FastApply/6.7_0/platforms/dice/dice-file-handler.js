// platforms/dice/dice-file-handler.js

import { fetchFile } from "../../shared/utilities/fetch-file.js";

export class DiceFileHandler {
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
   * Handle all file uploads in the form using Dice's modal system
   */
  async handleFileUploads(form, userDetails, jobDescription, jobTitle) {
    try {
      if (!form) {
        return false;
      }

      if (!userDetails) {
        return false;
      }

      if (this.isUploading) {
        return false;
      }
      this.isUploading = true;

      const resumeContainer = form.querySelector(".resume-container");
      const coverLetterContainer = form.querySelector(".cover-letter-wrapper");

      let totalContainers = 0;
      let successCount = 0;
      if (resumeContainer) {
        totalContainers++;
        const success = await this.handleModalBasedResumeUpload(
          resumeContainer,
          userDetails,
          jobDescription
        );
        if (success) {
          successCount++;
        } else {
          console.log("❌ Resume upload failed");
        }

        // Wait between uploads to prevent modal conflicts
        await this.wait(2000);
      }

      // Handle cover letter upload via modal (SEQUENTIAL, not parallel)
      if (coverLetterContainer && jobDescription) {
        totalContainers++;
        const success = await this.handleModalBasedCoverLetterUpload(
          coverLetterContainer,
          userDetails,
          jobDescription
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
      } else if (totalContainers === 0) {
        return true; // No uploads needed is considered success
      } else {
        console.log(
          `❌ File uploads failed: ${successCount}/${totalContainers} succeeded`
        );
      }

      return allUploadsSucceeded || totalContainers === 0;
    } catch (error) {
      this.isUploading = false;
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
  async handleSingleFileUpload(fileInput, userDetails, jobDescription, jobTitle) {
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
          undefined,
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
      await new Promise((resolve) => setTimeout(resolve, 50));
      fileInput.blur();

      // Wait for upload completion (no crop modal needed for PDFs)
      const finalUploadSuccess = await this.waitForUploadProcess(fileInput);
      return finalUploadSuccess;
    } catch (error) {
      console.error("❌ Error uploading cover letter PDF:", error);
      return false;
    }
  }

  /**
   * Handle resume upload with AI optimization
   */
  async handleResumeUpload(
    fileInput,
    userDetails,
    jobDescription,
    fileUrls,
    jobId,
    jobTitle
  ) {
    try {
      // If using custom resume, generateAndUploadCustomResume handles everything
      if (this.preferences?.useCustomResume === true) {
        return await this.generateAndUploadCustomResume(
          fileInput,
          userDetails,
          jobDescription,
          fileUrls,
          jobId,
          jobTitle
        );
      }

      // Otherwise, match and upload the best resume
      const bestResumeUrl = await this.getBestResumeUrl(
        fileUrls,
        jobDescription
      );
      if (!bestResumeUrl) {
        console.error("No valid resume URL found");
        return false;
      }

      // Download and upload the resume
      return await this.uploadFileFromUrl(
        fileInput,
        bestResumeUrl,
        userDetails
      );
    } catch (error) {
      console.error("handleResumeUpload error:", error);
      // Fallback: try to upload the first available resume directly
      try {
        const firstResume = fileUrls[0];
        const firstResumeUrl =
          typeof firstResume === "string" ? firstResume : firstResume?.fileUrl;
        if (firstResumeUrl) {
          console.log("Falling back to first resume URL:", firstResumeUrl);
          return await this.uploadFileFromUrl(
            fileInput,
            firstResumeUrl,
            userDetails
          );
        }
      } catch (fallbackError) {
        console.error("Fallback upload also failed:", fallbackError);
      }
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
    jobId,
    jobTitle
  ) {
    try {
      if (userDetails && userDetails.jwtToken) {
        this.jwtToken = userDetails.jwtToken;
      }

      // Get preferences (check both preference sources)
      const prefs = this.preferences || {};
      const resumeType = prefs.resumeType || "pdf";
      const resumeTemplate = prefs.resumeTemplate || "galaxy";

      // Determine generation URL based on preferences
      let generateURL =
        resumeType === "docx"
          ? `${this.backendApiHost}/api/v1/resume-builder/generate`
          : `https://resumify.fastapply.co/api/generate-resume-pdf`;

      const [parseURL, optimizeURL] = [
        `${this.backendApiHost}/api/v1/resumes/extract-text`,
        `${this.backendApiHost}/api/v1/resume-builder/optimize-ats`,
      ];

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

      // Step 1: Download resume file
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

      // Step 4: Generate Resume based on preferences
      if (resumeType === "docx") {
        generateResponse = await fetch(generateURL, {
          method: "POST",
          headers: this.getAuthHeaders(),
          body: JSON.stringify({
            template: `${resumeTemplate}_template`,
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

      // Trigger events to activate file handling
      await this.dispatchFileEvents(fileInput);

      console.log("📁 File set on input:", {
        filesLength: fileInput.files.length,
        fileName: fileInput.files[0]?.name,
        fileSize: fileInput.files[0]?.size,
      });

      // Wait for upload confirmation
      const uploadConfirmed = await this.waitForUploadProcess(fileInput);
      return uploadConfirmed;
    } catch (error) {
      console.error("Resume generation failed:", error);
      // Fallback to uploading the first resume's URL if custom generation fails
      const firstResume = fileUrls[0];
      const firstResumeUrl =
        typeof firstResume === "string" ? firstResume : firstResume?.fileUrl;
      return await this.uploadFileFromUrl(
        fileInput,
        firstResumeUrl,
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
      if (userDetails && userDetails.jwtToken) {
        this.jwtToken = userDetails.jwtToken;
      }

      // Find primary resume, fall back to first resume if no primary is set
      const primaryResume = fileUrls.find((resume) =>
        typeof resume === "object" && resume?.isPrimary
      );
      const resumeToUploadUrl = primaryResume?.fileUrl ||
        (typeof fileUrls[0] === "string" ? fileUrls[0] : fileUrls[0]?.fileUrl);

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
      console.error("Resume upload failed:", error);
      // Fallback to uploading the first resume's URL
      const firstResume = fileUrls[0];
      const firstResumeUrl =
        typeof firstResume === "string" ? firstResume : firstResume?.fileUrl;
      return await this.uploadFileFromUrl(
        fileInput,
        firstResumeUrl,
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

      // Determine correct MIME type from filename extension (proxy may return wrong type)
      const extension = fileName.toLowerCase().split(".").pop();
      const mimeTypes = {
        pdf: "application/pdf",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        txt: "text/plain",
        rtf: "application/rtf",
      };
      const mimeType = mimeTypes[extension] || blob.type || "application/pdf";

      const file = new File([blob], fileName, {
        type: mimeType,
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

      const uploadSuccess = await this.waitForUploadProcess(fileInput);

      if (uploadSuccess) {
      } else {
        console.warn(`⚠️ Upload may have failed: ${fileName}`);
      }

      return uploadSuccess;
    } catch (error) {
      console.error("❌ Error uploading blob:", error);
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
   * Wait for upload process to complete - adapted for Dice selectors
   */
  async waitForUploadProcess(fileInput, timeout = 30000) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkUpload = () => {
        const elapsed = Date.now() - startTime;

        const container =
          fileInput.closest("form, .resume-container, .cover-letter-wrapper") ||
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

        // Look for Dice-specific success indicators
        const successSelectors = [
          ".file-wrapper",
          ".file-name",
          ".file-info",
          ".file-date",
          ".profile-resume-message",
          ".upload-success",
          ".file-uploaded",
          ".upload-complete",
          ".success-message",
          ".file-success",
          ".uploaded",
          ".selected-file",
        ];

        for (const selector of successSelectors) {
          const element = container?.querySelector(selector);
          if (element && element.textContent.trim()) {
            resolve(true);
            return;
          }
        }

        // Check if the filename is displayed in Dice structure
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
              "File exceeds the maximum upload size of 2MB",
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

        // Check for file input state - be more lenient with timing
        if (fileInput.files && fileInput.files.length > 0) {
          if (elapsed > 5000) {
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
      console.error("❌ Error dispatching file events:", error);
    }
  }

  /**
   * Determine file type based on input field context - adapted for Dice
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

      // Check surrounding context for Dice-specific containers
      const container =
        fileInput.closest(
          ".resume-container, .cover-letter-wrapper, .file-picker-wrapper"
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
        ".resume-container, .cover-letter-wrapper, .form-group"
      );
      if (formGroup) {
        const label = formGroup.querySelector(
          "label, .form-label, .field-label, h2"
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
   * Handle custom file picker buttons (Dice-specific) - Legacy method, now uses modal system
   */
  async handleCustomFilePicker(pickerButton, userDetails, jobDescription) {
    try {
      // Determine file type from button context
      const fileType = this.determineFileTypeFromButton(pickerButton);

      const container = pickerButton.closest(
        ".resume-container, .cover-letter-wrapper"
      );
      if (!container) {
        return false;
      }

      if (fileType === "coverLetter" && jobDescription) {
        return await this.handleModalBasedCoverLetterUpload(
          container,
          userDetails,
          jobDescription
        );
      } else if (fileType === "resume") {
        return await this.handleModalBasedResumeUpload(
          container,
          userDetails,
          jobDescription
        );
      }

      return false;
    } catch (error) {
      console.error("❌ Error handling custom file picker:", error);
      return false;
    }
  }

  /**
   * Handle custom cover letter upload via button click
   */
  async handleCustomCoverLetterUpload(
    pickerButton,
    userDetails,
    jobDescription
  ) {
    try {
      // Generate cover letter PDF
      const response = await fetch(
        `https://resumify.fastapply.co/api/generate-cover-letter-pdf`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: `${userDetails.firstName} ${userDetails.lastName}`,
            jobDescription: jobDescription,
            skills: userDetails.skills,
            education: userDetails.education,
            fullPositions: userDetails.fullPositions,
            tone: "Professional",
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to generate cover letter: ${response.status}`);
      }

      const blob = await response.blob();
      const fileName = this.generateCoverLetterFileName(userDetails);
      const file = new File([blob], fileName, { type: "application/pdf" });

      // Click the button to open file picker
      pickerButton.click();
      await this.wait(1000);

      // Look for hidden file input that appears after clicking
      const hiddenInput = await this.waitForHiddenFileInput(pickerButton);
      if (hiddenInput) {
        // Upload the generated file
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        hiddenInput.files = dataTransfer.files;

        await this.dispatchFileEvents(hiddenInput);
        return true;
      }

      return false;
    } catch (error) {
      console.error("❌ Error with custom cover letter upload:", error);
      return false;
    }
  }

  /**
   * Handle custom resume upload via button click
   */
  async handleCustomResumeUpload(pickerButton, userDetails, jobDescription) {
    try {
      const fileUrls = this.getFileUrls(userDetails, "resume");
      if (!fileUrls || fileUrls.length === 0) {
        return false;
      }

      // Click the button to open file picker
      pickerButton.click();
      await this.wait(1000);

      // Look for hidden file input that appears after clicking
      const hiddenInput = await this.waitForHiddenFileInput(pickerButton);
      if (hiddenInput) {
        // Upload the resume file
        return await this.handleSingleFileUpload(
          hiddenInput,
          userDetails,
          jobDescription,
          jobTitle
        );
      }

      return false;
    } catch (error) {
      console.error("❌ Error with custom resume upload:", error);
      return false;
    }
  }

  /**
   * Wait for hidden file input to appear after clicking custom picker
   */
  async waitForHiddenFileInput(pickerButton, timeout = 5000) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkForInput = () => {
        const elapsed = Date.now() - startTime;

        // Look for file input near the button or in the document
        const container =
          pickerButton.closest(".file-picker-wrapper") ||
          pickerButton.parentElement;
        let hiddenInput =
          container?.querySelector('input[type="file"]') ||
          document.querySelector(
            'input[type="file"][style*="display: none"], input[type="file"][hidden]'
          );

        if (hiddenInput) {
          resolve(hiddenInput);
          return;
        }

        if (elapsed > timeout) {
          resolve(null);
          return;
        }

        setTimeout(checkForInput, 100);
      };

      checkForInput();
    });
  }

  /**
   * Determine file type from custom button context
   */
  determineFileTypeFromButton(button) {
    try {
      // Check button text content
      const buttonText = button.textContent.toLowerCase();
      if (buttonText.includes("cover") || buttonText.includes("letter")) {
        return "coverLetter";
      }
      if (buttonText.includes("resume") || buttonText.includes("cv")) {
        return "resume";
      }

      // Check container classes
      const container = button.closest(".file-picker-wrapper");
      if (container) {
        const containerClass = container.className.toLowerCase();
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
      }

      // Default to resume
      return "resume";
    } catch (error) {
      console.error("Error determining file type from button:", error);
      return "resume";
    }
  }

  /**
   * Handle modal-based cover letter upload
   */
  async handleModalBasedCoverLetterUpload(
    coverLetterContainer,
    userDetails,
    jobDescription
  ) {
    try {
      // Generate cover letter PDF first
      const response = await fetch(
        `https://resumify.fastapply.co/api/generate-cover-letter-pdf`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: userDetails.name,
            jobDescription: jobDescription,
            skills: userDetails.skills,
            education: userDetails.education,
            fullPositions: userDetails.fullPositions,
            tone: "Professional",
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to generate cover letter: ${response.status}`);
      }

      const blob = await response.blob();
      const fileName = this.generateCoverLetterFileName(userDetails);

      // Use modal-based upload
      return await this.uploadViaModal(
        coverLetterContainer,
        blob,
        fileName,
        "cover letter"
      );
    } catch (error) {
      console.error("❌ Error with modal-based cover letter upload:", error);
      return false;
    }
  }

  /**
   * Handle modal-based resume upload
   */
  async handleModalBasedResumeUpload(
    resumeContainer,
    userDetails,
    jobDescription
  ) {
    try {
      const fileUrls = this.getFileUrls(userDetails, "resume");
      if (!fileUrls || fileUrls.length === 0) {
        return false;
      }

      // Get the resume file
      let blob, fileName;

      if (
        (userDetails.plan === "unlimited" || userDetails.plan === "pro") &&
        this.preferences?.useCustomResume === true
      ) {
        // Generate custom resume
        const result = await this.generateCustomResumeBlob(
          userDetails,
          jobDescription,
          fileUrls
        );
        blob = result.blob;
        fileName = result.fileName;
      } else {
        // Use existing resume
        const bestResumeUrl = await this.getBestResumeUrl(
          fileUrls,
          jobDescription
        );
        const result = await this.downloadResumeBlob(
          bestResumeUrl,
          userDetails
        );
        blob = result.blob;
        fileName = result.fileName;
      }

      // Use modal-based upload
      return await this.uploadViaModal(
        resumeContainer,
        blob,
        fileName,
        "resume"
      );
    } catch (error) {
      console.error("❌ Error with modal-based resume upload:", error);
      return false;
    }
  }

  /**
   * Upload file via Dice's modal system
   */
  async uploadViaModal(container, blob, fileName, fileType) {
    try {
      // Find the upload button in the container
      const uploadButton = container.querySelector(
        'button, .file-picker-wrapper, [role="button"]'
      );
      if (!uploadButton) {
        return false;
      }

      uploadButton.click();

      // Wait for modal to appear
      const modal = await this.waitForModal();
      if (!modal) {
        return false;
      }

      // Find the file input in the modal with retry logic
      let modalFileInput = null;
      let attempts = 0;
      const maxAttempts = 10;

      while (!modalFileInput && attempts < maxAttempts) {
        modalFileInput = modal.querySelector(
          '#fsp-fileUpload, input[type="file"]'
        );
        if (!modalFileInput) {
          await this.wait(500);
          attempts++;
        }
      }

      if (!modalFileInput) {
        await this.closeModal();
        return false;
      }
      await this.wait(3000);

      // Step 2: Add file to modal input
      const file = new File([blob], fileName, { type: "application/pdf" });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      modalFileInput.files = dataTransfer.files;

      // Dispatch change event
      const changeEvent = new Event("change", { bubbles: true });
      modalFileInput.dispatchEvent(changeEvent);

      await this.wait(3000);
      // Step 3: Wait for Upload button to appear
      const modalUploadButton = await this.waitForUploadButton();

      if (!modalUploadButton) {
        await this.closeModal(); // Manual fallback close
        return false;
      }
      await this.wait(3000);

      // Step 4: Click Upload button (within modal)
      modalUploadButton.click();

      // Step 5: Wait for modal to close automatically
      await this.waitForModalToClose();

      // Step 6: Verify file was properly uploaded to the form
      const uploadSuccess = await this.verifyFileUploadSuccess(
        container,
        fileName,
        fileType
      );

      if (uploadSuccess) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      await this.closeModal();
      return false;
    }
  }

  /**
   * Verify that file upload completed successfully
   */
  async verifyFileUploadSuccess(
    container,
    fileName,
    fileType,
    timeout = 15000
  ) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkUploadSuccess = () => {
        const elapsed = Date.now() - startTime;

        // Look for Dice-specific success indicators in the container
        const successSelectors = [
          ".file-wrapper",
          ".file-name",
          ".file-info",
          ".upload-success",
          ".file-uploaded",
          'span[title*=".pdf"]',
          'span[title*="' + fileName + '"]',
          "[data-file-name]",
          'input[type="file"][data-file-uploaded="true"]',
        ];

        for (const selector of successSelectors) {
          const element = container.querySelector(selector);
          if (element) {
            const text =
              element.textContent ||
              element.title ||
              element.getAttribute("data-file-name") ||
              "";
            if (
              text.includes(fileName) ||
              text.includes(".pdf") ||
              element.getAttribute("data-file-uploaded") === "true"
            ) {
              resolve(true);
              return;
            }
          }
        }

        // Check for file input elements that may have been updated
        const fileInputs = container.querySelectorAll('input[type="file"]');
        for (const input of fileInputs) {
          if (input.files && input.files.length > 0) {
            const file = input.files[0];
            if (file.name === fileName) {
              resolve(true);
              return;
            }
          }
        }

        // Check for any text nodes containing the filename
        const allElements = container.querySelectorAll("*");
        for (const element of allElements) {
          const text = element.textContent || "";
          if (
            text.includes(fileName) ||
            (fileName.includes(".pdf") && text.includes(".pdf"))
          ) {
            resolve(true);
            return;
          }
        }

        if (elapsed > timeout) {
          resolve(false);
          return;
        }

        // Continue checking
        setTimeout(checkUploadSuccess, 500);
      };

      // Start checking after a brief delay to allow DOM updates
      setTimeout(checkUploadSuccess, 1000);
    });
  }

  /**
   * Generate custom resume blob
   */
  async generateCustomResumeBlob(userDetails, jobDescription, fileUrls) {
    // Extract fileUrl from the last resume object in the array
    const lastResume = fileUrls[fileUrls.length - 1];
    const resumeFileUrl =
      typeof lastResume === "string" ? lastResume : lastResume?.fileUrl;

    if (!resumeFileUrl) {
      throw new Error("No valid resume URL found");
    }

    const parseResponse = await fetch(
      `https://resumify.fastapply.co/api/parse-resume`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_url: resumeFileUrl }),
      }
    );

    if (!parseResponse.ok) {
      throw new Error(`Resume parsing failed: ${parseResponse.status}`);
    }

    const { text: parsedResumeText } = await parseResponse.json();

    const optimizeResponse = await fetch(
      `https://resumify.fastapply.co/api/generate-resume`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_text: parsedResumeText,
          job_description: jobDescription,
          user_data: {
            summary: userDetails.summary,
            projects: userDetails.projects,
            fullPositions: userDetails.fullPositions,
            education: userDetails.education,
            educationStartMonth: userDetails.educationStartMonth,
            educationStartYear: userDetails.educationStartYear,
            educationEndMonth: userDetails.educationEndMonth,
            educationEndYear: userDetails.educationEndYear,
          },
        }),
      }
    );

    if (!optimizeResponse.ok) {
      throw new Error(`Resume optimization failed: ${optimizeResponse.status}`);
    }

    const resumeData = await optimizeResponse.json();

    const generateResponse = await fetch(
      `https://resumify.fastapply.co/api/generate-resume-pdf`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_data: {
            author: `${userDetails.firstName} ${userDetails.lastName}`,
            email: userDetails.email,
            phone: `${userDetails.phoneCountryCode || ""}${
              userDetails.phoneNumber || ""
            }`,
            address: userDetails.streetAddress || userDetails.country,
          },
          resume_data: resumeData.data,
        }),
      }
    );

    if (!generateResponse.ok) {
      throw new Error(`Resume generation failed: ${generateResponse.status}`);
    }

    const blob = await generateResponse.blob();
    const fileName = this.generateResumeFileName(userDetails);

    return { blob, fileName };
  }

  /**
   * Download resume blob from URL
   */
  async downloadResumeBlob(resumeUrl, userDetails) {
    const response = await fetchFile(resumeUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch resume: ${response.status}`);
    }

    const blob = await response.blob();
    const fileName = this.generateResumeFileName(userDetails);

    return { blob, fileName };
  }

  /**
   * Get best resume URL - uses primary resume instead of matching service
   */
  async getBestResumeUrl(fileUrls, jobDescription) {
    try {
      // Find primary resume, fall back to first resume if no primary is set
      const primaryResume = fileUrls.find((resume) =>
        typeof resume === "object" && resume?.isPrimary
      );

      if (primaryResume?.fileUrl) {
        return primaryResume.fileUrl;
      }

      // Fallback to first resume
      const firstResume = fileUrls[0];
      return typeof firstResume === "string"
        ? firstResume
        : firstResume?.fileUrl;
    } catch (error) {
      console.warn("Error getting resume URL, using first resume:", error);
      // Fallback: extract fileUrl from first resume object
      const firstResume = fileUrls[0];
      return typeof firstResume === "string"
        ? firstResume
        : firstResume?.fileUrl;
    }
  }

  /**
   * Wait for Dice modal to appear with better detection
   */
  async waitForModal(timeout = 10000) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkForModal = () => {
        const elapsed = Date.now() - startTime;

        // Close any existing conflicting modals first
        const existingModals = document.querySelectorAll(
          '.fsp-modal__body, .fsp-modal, [class*="modal"]'
        );
        if (existingModals.length > 1) {
        }

        // Look for modal with the specific structure
        const modal = document.querySelector(
          '.fsp-modal__body, .fsp-modal, [class*="modal"]'
        );
        if (
          modal &&
          (modal.querySelector(".fsp-drop-area, .fsp-content") ||
            modal.querySelector("#fsp-fileUpload"))
        ) {
          resolve(modal);
          return;
        }

        if (elapsed > timeout) {
          resolve(null);
          return;
        }

        setTimeout(checkForModal, 100);
      };

      checkForModal();
    });
  }

  // REMOVED: waitForNextButton - No longer needed since there's no View/Edit step

  /**
   * Wait for Upload button to appear after file is added
   */
  async waitForUploadButton(timeout = 10000) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkForButton = () => {
        const elapsed = Date.now() - startTime;

        // Look directly for the Upload button with data-e2e="upload"
        const uploadButton = document.querySelector('[data-e2e="upload"]');

        if (
          uploadButton &&
          !uploadButton.classList.contains("fsp-button--disabled")
        ) {
          resolve(uploadButton);
          return;
        }

        if (elapsed > timeout) {
          resolve(null);
          return;
        }

        setTimeout(checkForButton, 200);
      };

      checkForButton();
    });
  }

  /**
   * Wait for modal to close automatically after upload
   */
  async waitForModalToClose(timeout = 10000) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkForModalClosure = () => {
        const elapsed = Date.now() - startTime;

        // Check if modal is gone
        const modal = document.querySelector(
          '.fsp-modal__body, .fsp-modal, [class*="modal"]'
        );
        if (!modal) {
          resolve(true);
          return;
        }

        if (elapsed > timeout) {
          resolve(false);
          return;
        }

        setTimeout(checkForModalClosure, 500);
      };

      checkForModalClosure();
    });
  }

  /**
   * Close the modal manually (fallback only - modal should close automatically)
   */
  async closeModal() {
    try {
      // Look for close button
      const closeButton = document.querySelector(
        '.fsp-picker__close-button, .fsp-icon--close-modal, [title*="close"], [title*="ESC"]'
      );
      if (closeButton) {
        closeButton.click();
        await this.wait(500);
        return true;
      }

      // Try ESC key as fallback
      const escEvent = new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        keyCode: 27,
        bubbles: true,
      });
      document.dispatchEvent(escEvent);
      await this.wait(500);
      return true;
    } catch (error) {
      console.error(`❌ Error closing modal:`, error);
      return false;
    }
  }

  /**
   * Wait utility
   */
  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
