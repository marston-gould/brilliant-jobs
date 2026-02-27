// platforms/workable/workable-file-handler.js
import { fetchFile } from "../../shared/utilities/fetch-file.js";
export default class WorkableFileHandler {
  constructor(config = {}) {
    this.preferences = config.preferences;
    // Global overlay used via notifyStatus()
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
   * Finds file upload elements in a Workable form and extracts their information
   *
   * @param {HTMLElement} formElement - The Workable application form
   * @returns {Array<Object>} - Array of upload field objects with element, label, and container information
   */
  findWorkableUploadFields(formElement) {
    try {
      const uploadFields = [];

      // Method 1: Find elements with data-role="dropzone" attribute (Workable's standard)
      const dropzones = formElement.querySelectorAll('[data-role="dropzone"]');
      for (const dropzone of dropzones) {
        // Find the associated file input
        const fileInput = dropzone.querySelector('input[type="file"]');
        if (!fileInput) continue;

        // Find the parent container that holds the entire field structure
        const fieldContainer = this.findFieldContainer(dropzone);

        // Extract the label text from the container
        const label = this.extractWorkableFieldLabel(fieldContainer);

        uploadFields.push({
          element: fileInput,
          dropzone: dropzone,
          container: fieldContainer,
          label: label,
          required:
            fileInput.hasAttribute("required") ||
            fileInput.getAttribute("aria-required") === "true",
          isResume: this.isResumeField(label, fieldContainer),
        });
      }

      // Method 2: Find all file inputs directly (backup method)
      const fileInputs = formElement.querySelectorAll('input[type="file"]');
      for (const fileInput of fileInputs) {
        // Skip if we already found this input through a dropzone
        if (uploadFields.some((field) => field.element === fileInput)) continue;

        // Find the parent container
        const fieldContainer = this.findFieldContainer(fileInput);

        // Extract the label
        const label = this.extractWorkableFieldLabel(fieldContainer);

        uploadFields.push({
          element: fileInput,
          dropzone: fileInput.closest('[data-role="dropzone"]'),
          container: fieldContainer,
          label: label,
          required:
            fileInput.hasAttribute("required") ||
            fileInput.getAttribute("aria-required") === "true",
          isResume: this.isResumeField(label, fieldContainer),
        });
      }

      return uploadFields;
    } catch (error) {
      console.error("Error finding Workable upload fields:", error);
      return [];
    }
  }

  /**
   * Find the field container for a Workable form element
   *
   * @param {HTMLElement} element - The element to find the container for
   * @returns {HTMLElement|null} - The container element or null if not found
   */
  findFieldContainer(element) {
    // Start with the element itself
    let current = element;

    // Go up the DOM tree looking for the container (max 5 levels)
    for (let i = 0; i < 5 && current; i++) {
      // Check if this is a field container (Workable uses the styles--3aPac class)
      if (
        current.classList.contains("styles--3aPac") ||
        current.className.includes("styles--3aPac")
      ) {
        return current;
      }

      // Move up to parent
      current = current.parentElement;
    }

    // If no specific container found, return the closest div
    return element.closest("div");
  }

  /**
   * Extract the label text from a Workable field container
   *
   * @param {HTMLElement} container - The field container
   * @returns {string} - The extracted label text
   */
  extractWorkableFieldLabel(container) {
    if (!container) return "";

    // Method 1: Look for the label element with styles--QTMDv class
    const labelEl = container.querySelector('.styles--QTMDv, [class*="QTMDv"]');
    if (labelEl) {
      return labelEl.textContent.trim();
    }

    // Method 2: Look for a label with id ending with "_label"
    const labelWithIdPattern = container.querySelector('span[id$="_label"]');
    if (labelWithIdPattern) {
      return labelWithIdPattern.textContent.trim();
    }

    // Method 3: Look for aria-labelledby references
    const fileInput = container.querySelector('input[type="file"]');
    if (fileInput) {
      const labelledById = fileInput.getAttribute("aria-labelledby");
      if (labelledById) {
        const labelEl = document.getElementById(labelledById);
        if (labelEl) {
          return labelEl.textContent.trim();
        }
      }
    }

    // Method 4: Just get the text content excluding the dropzone
    // Clone the container to avoid modifying the original
    const clone = container.cloneNode(true);

    // Remove the dropzone and input elements from the clone
    const elementsToRemove = clone.querySelectorAll(
      '[data-role="dropzone"], input[type="file"]'
    );
    for (const el of elementsToRemove) {
      el.parentNode.removeChild(el);
    }

    // Extract text from what remains, looking for anything that might be a label
    const possibleLabelElements = clone.querySelectorAll(
      "label, span, strong, div"
    );
    for (const el of possibleLabelElements) {
      const text = el.textContent.trim();
      if (text && text.length < 50) {
        // Reasonable label length
        return text;
      }
    }

    // Last resort: return any text from the container
    return clone.textContent.trim();
  }

  /**
   * Check if a field is for resume uploads based on label text and container context
   *
   * @param {string} labelText - The label text
   * @param {HTMLElement} container - The field container element
   * @returns {boolean} - True if this is a resume field
   */
  isResumeField(labelText, container) {
    if (!labelText) return false;

    // Clean up label text
    const cleanedLabel = labelText
      .toLowerCase()
      .replace(/\*|\s+|required/g, " ")
      .trim();

    // Check for resume-related keywords
    const resumeKeywords = [
      "resume",
      "cv",
      "curriculum",
      "curriculum vitae",
      "upload resume",
      "upload cv",
      "attach resume",
      "attach cv",
    ];

    // Direct match with resume keywords
    if (resumeKeywords.some((keyword) => cleanedLabel.includes(keyword))) {
      return true;
    }

    // If container is provided, look for contextual clues
    if (container) {
      // Look at file input's accept attribute
      const fileInput = container.querySelector('input[type="file"]');
      if (fileInput && fileInput.hasAttribute("accept")) {
        const acceptAttr = fileInput.getAttribute("accept");
        // Resume uploads typically accept PDF, DOC, DOCX
        if (acceptAttr.includes("pdf") || acceptAttr.includes("doc")) {
          return true;
        }
      }

      // Look for description text near the input
      const containerText = container.textContent.toLowerCase();
      if (resumeKeywords.some((keyword) => containerText.includes(keyword))) {
        return true;
      }
    }

    // If this is the only file upload field in the form, it's likely for a resume
    const form = container?.closest("form");
    if (form) {
      const totalFileInputs =
        form.querySelectorAll('input[type="file"]').length;
      if (totalFileInputs === 1) {
        return true;
      }
    }

    return false;
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

      // Find all upload fields using Workable-specific method
      const uploadFields = this.findWorkableUploadFields(form);
      console.log("📄 Upload fields:", uploadFields);

      if (uploadFields.length === 0) {
        return true;
      }

      let uploadCount = 0;
      let successCount = 0;

      for (const field of uploadFields) {
        const inputId = this.getInputIdentifier(field.element);
        if (this.processedInputs.has(inputId)) {
          continue;
        }

        if (!this.isFileInputAccessible(field.element)) continue;

        uploadCount++;
        this.processedInputs.add(inputId);

        try {
          const result = await this.handleSingleFileUpload(
            field.element,
            userDetails,
            jobDescription,
            field,
            jobId,
            jobTitle
          );

          if (result) {
            successCount++;
          } else {
          }
        } catch (error) {
          return false;
        }
      }

      if (successCount > 0) {
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
      fileInput.getAttribute("data-qa") ||
      `input-${Array.from(
        fileInput.form?.querySelectorAll('input[type="file"]') || []
      ).indexOf(fileInput)}`
    );
  }

  async uploadImageStandalone(fileInput, imageUrl) {
    if (!imageUrl) {
      return false;
    }

    if (!fileInput) {
      return false;
    }

    try {
      let response;
      try {
        response = await fetch(imageUrl);
      } catch (corsError) {
        throw corsError;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const blob = await response.blob();

      if (blob.size === 0) {
        throw new Error("Downloaded image is empty");
      }

      const fileName = "profile-photo.jpg";
      const file = new File([blob], fileName, {
        type: blob.type || "image/jpeg",
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

      // Wait for the crop modal to appear and handle it
      const finalUploadSuccess = await this.waitForModalAndUpload(fileInput);
      return finalUploadSuccess;
    } catch (error) {
      console.error("Error uploading image:", error);
      return false;
    }
  }

  waitForModalAndUpload(fileInput, timeout = 45000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let modalFound = false;
      let uploadButtonClicked = false;

      const checkProcess = () => {
        const elapsed = Date.now() - startTime;

        if (elapsed > timeout) {
          resolve(false);
          return;
        }

        // Phase 1: Wait for the crop modal to appear
        if (!modalFound) {
          // Look for the upload button with data-ui="crop-image"
          const uploadButton = document.querySelector('[data-ui="crop-image"]');

          if (uploadButton && uploadButton.textContent.trim() === "Upload") {
            modalFound = true;
            uploadButton.click();
            uploadButtonClicked = true;
            setTimeout(checkProcess, 1000);
            return;
          }

          // Also check if modal is visible by looking for modal containers
          const modalSelectors = [
            '[role="dialog"]',
            ".modal",
            '[class*="modal"]',
            '[class*="Modal"]',
            '[class*="dialog"]',
            '[class*="Dialog"]',
            '[class*="overlay"]',
            '[class*="Overlay"]',
          ];

          for (const selector of modalSelectors) {
            const modal = document.querySelector(selector);
            if (modal && this.isElementVisible(modal)) {
              const uploadBtn = modal.querySelector(
                '[data-ui="crop-image"], button:contains("Upload")'
              );
              if (uploadBtn) {
                modalFound = true;
                uploadBtn.click();
                uploadButtonClicked = true;
                setTimeout(checkProcess, 1000);
                return;
              }
            }
          }

          // Continue looking for modal
          setTimeout(checkProcess, 500);
          return;
        }

        // Phase 2: After clicking upload button, wait for completion
        if (modalFound && uploadButtonClicked) {
          // Check if modal is gone (indicating completion)
          const uploadButton = document.querySelector('[data-ui="crop-image"]');
          if (!uploadButton || !this.isElementVisible(uploadButton)) {
            // Look for success indicators in the original container
            const container =
              fileInput.closest('[data-role="dropzone"]') ||
              fileInput.parentElement;

            // Check for preview image or success indicators
            if (container) {
              const preview = container.querySelector('[data-role="preview"]');
              if (preview) {
                const img = preview.querySelector("img");
                if (
                  img &&
                  img.src &&
                  !img.src.includes("data:") &&
                  img.src.includes("http")
                ) {
                  resolve(true);
                  return;
                }
              }

              // Check for other success indicators
              const successSelectors = [
                ".upload-success",
                ".file-uploaded",
                ".upload-complete",
                ".success-message",
                ".file-success",
                ".uploaded",
              ];

              for (const selector of successSelectors) {
                const element = container.querySelector(selector);
                if (element && element.textContent.trim()) {
                  resolve(true);
                  return;
                }
              }
            }

            // If we've waited long enough after modal closed, consider it successful
            if (elapsed > 15000) {
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
          ];

          for (const selector of errorSelectors) {
            const element = document.querySelector(selector);
            if (
              element &&
              element.textContent.trim() &&
              this.isElementVisible(element)
            ) {
              resolve(false);
              return;
            }
          }

          // Continue waiting
          setTimeout(checkProcess, 1000);
          return;
        }

        // Fallback - continue checking
        setTimeout(checkProcess, 500);
      };

      checkProcess();
    });
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

  /**
   * Handle a single file upload field
   */
  async handleSingleFileUpload(
    fileInput,
    userDetails,
    jobDescription,
    fieldInfo = {},
    jobId,
    jobTitle
  ) {
    try {
      const fileType = fieldInfo.isResume
        ? "resume"
        : this.determineFileType(fileInput);
      const fileUrls = this.getFileUrls(userDetails, fileType);

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
      } else if (fileType === "coverLetter" && jobDescription) {
        return await this.handleCoverLetterUpload(
          fileInput,
          userDetails,
          jobDescription,
          fileUrls
        );
      } else if (fileType === "avatar") {
        return await this.uploadImageStandalone(fileInput, userDetails.image);
      } else {
        return await this.uploadFileFromUrl(fileInput, fileUrls[0].fileUrl);
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
          fileUrls,
          jobId
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
          jobId,
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
  async handleCoverLetterUpload(
    fileInput,
    userDetails,
    jobDescription,
    fileUrls
  ) {
    try {
      if (fileUrls.length > 0) {
        return await this.uploadFileFromUrl(
          fileInput,
          fileUrls[0].fileUrl,
          userDetails
        );
      }
      return false;
    } catch (error) {
      console.error("Error handling cover letter upload:", error);
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
   * Upload blob to file input
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

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      fileInput.files = dataTransfer.files;

      await this.dispatchFileEvents(fileInput);

      const uploadSuccess = await this.waitForUploadProcess(fileInput);
      return uploadSuccess;
    } catch (error) {
      return false;
    }
  }

  /**
   * Enhanced filename extraction with proper URL decoding
   */
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
   * Check if file input is accessible
   */
  isFileInputAccessible(fileInput) {
    if (!fileInput) return false;

    // For Workable's file inputs
    if (
      fileInput.classList.contains("file-input") ||
      fileInput.classList.contains("application-file-input")
    ) {
      return !fileInput.disabled && fileInput.offsetParent !== null;
    }

    return this.isElementVisible(fileInput);
  }

  /**
   * Determine file type based on input field context
   */
  determineFileType(fileInput) {
    try {
      const dataUi = fileInput.getAttribute("data-ui");
      if (dataUi) {
        const dataUiLower = dataUi.toLowerCase();

        switch (dataUiLower) {
          case "resume":
          case "cv":
            return "resume";

          case "cover-letter":
          case "coverletter":
          case "cover_letter":
            return "coverLetter";

          case "avatar":
          case "photo":
          case "picture":
          case "profile":
          case "headshot":
            return "avatar";

          default:
            break;
        }
      }
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

      const formGroup = fileInput.closest(".form-group");
      if (formGroup) {
        const label = formGroup.querySelector(
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
