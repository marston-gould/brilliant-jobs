// platforms/breezy/breezy-file-handler.js
import { fetchFile } from "../../shared/utilities/fetch-file.js";

export default class BreezyFileHandler {
  constructor(config = {}) {
    this.preferences = config.preferences;
    // Global overlay used via notifyStatus()
    this.aiApiHost = config.aiApiHost;
    this.backendApiHost = config.backendApiHost;
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
   * Finds file upload elements in a Breezy form and extracts their information
   *
   * @param {HTMLElement} formElement - The Breezy application form
   * @returns {Array<Object>} - Array of upload field objects with element, label, and container information
   */
  findBreezyUploadFields(formElement) {
    try {
      const uploadFields = [];

      // Method 1: Find Breezy's Angular-style upload buttons
      const uploadButtons = formElement.querySelectorAll(
        '.file-input-container .button.resume, a[ng-click*="showFileSelector"]'
      );

      for (const button of uploadButtons) {
        const container =
          button.closest(".file-input-container") || button.closest("li");

        // Look for a hidden file input near this button
        let fileInput = container?.querySelector('input[type="file"]');

        // If not found, look in parent or siblings
        if (!fileInput) {
          fileInput =
            button.parentElement?.querySelector('input[type="file"]') ||
            container?.parentElement?.querySelector('input[type="file"]');
        }

        // If still not found, look anywhere in the form
        if (!fileInput) {
          const allFileInputs =
            formElement.querySelectorAll('input[type="file"]');
          // Try to find one that's hidden (likely the Angular-triggered one)
          fileInput = Array.from(allFileInputs).find(
            (input) =>
              input.offsetParent === null ||
              input.style.display === "none" ||
              input.style.visibility === "hidden"
          );
        }

        if (fileInput && !uploadFields.some((f) => f.element === fileInput)) {
          const label = button.textContent?.trim() || "Resume";
          const isRequired =
            button.querySelector(".required") !== null ||
            button.textContent?.includes("*");

          uploadFields.push({
            element: fileInput,
            button: button, // Store the button reference
            dropzone: null,
            container: container,
            label: label,
            required: isRequired,
            isResume: true,
          });
        }
      }

      // Method 2: Find elements with data-role="dropzone" attribute
      const dropzones = formElement.querySelectorAll('[data-role="dropzone"]');
      for (const dropzone of dropzones) {
        const fileInput = dropzone.querySelector('input[type="file"]');
        if (!fileInput) continue;

        if (uploadFields.some((field) => field.element === fileInput)) continue;

        const fieldContainer = this.findFieldContainer(dropzone);
        const label = this.extractBreezyFieldLabel(fieldContainer);

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

      // Method 3: Find all file inputs directly (backup method)
      const fileInputs = formElement.querySelectorAll('input[type="file"]');
      for (const fileInput of fileInputs) {
        if (uploadFields.some((field) => field.element === fileInput)) continue;

        const fieldContainer = this.findFieldContainer(fileInput);
        const label = this.extractBreezyFieldLabel(fieldContainer);

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

      console.log(`📎 Found ${uploadFields.length} upload field(s)`);
      return uploadFields;
    } catch (error) {
      console.error("Error finding Breezy upload fields:", error);
      return [];
    }
  }

  /**
   * Find the field container for a Breezy form element
   *
   * @param {HTMLElement} element - The element to find the container for
   * @returns {HTMLElement|null} - The container element or null if not found
   */
  findFieldContainer(element) {
    // Start with the element itself
    let current = element;

    // Go up the DOM tree looking for the container (max 5 levels)
    for (let i = 0; i < 5 && current; i++) {
      // Check if this is a field container (Breezy uses the styles--3aPac class)
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
   * Extract the label text from a Breezy field container
   *
   * @param {HTMLElement} container - The field container
   * @returns {string} - The extracted label text
   */
  extractBreezyFieldLabel(container) {
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

      // Find all upload fields using Breezy-specific method
      const uploadFields = this.findBreezyUploadFields(form);

      if (uploadFields.length === 0) {
        return true;
      }

      let uploadCount = 0;
      let successCount = 0;

      for (const field of uploadFields) {
        const inputId = this.getInputIdentifier(field.element);
        if (this.processedInputs.has(inputId)) {
          console.log(`⏭️ Skipping already processed input: ${inputId}`);
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
            jobId,
            field,
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

      console.log("Triggering upload events...");

      // Dispatch events to trigger the upload process
      const changeEvent = new Event("change", { bubbles: true });
      fileInput.dispatchEvent(changeEvent);

      const inputEvent = new Event("input", { bubbles: true });
      fileInput.dispatchEvent(inputEvent);

      // Focus and blur to ensure all handlers are triggered
      fileInput.focus();
      await new Promise((resolve) => setTimeout(resolve, 50));
      fileInput.blur();

      console.log("Waiting for crop modal to appear...");

      // Wait for the crop modal to appear and handle it
      const finalUploadSuccess = await this.waitForModalAndUpload(fileInput);

      if (finalUploadSuccess) {
        console.log("✅ Image uploaded and processed successfully!");
      } else {
        console.log("⚠️ Upload may have failed or is still processing");
      }

      return finalUploadSuccess;
    } catch (error) {
      console.error("❌ Error uploading image:", error);
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
            console.log("✅ Found crop modal with upload button");
            modalFound = true;

            // Click the upload button
            console.log("🖱️ Clicking upload button...");
            uploadButton.click();
            uploadButtonClicked = true;

            // Give some time for the click to process
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
                console.log("✅ Found modal with upload button");
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
          console.log("⏳ Waiting for upload completion...");

          // Check if modal is gone (indicating completion)
          const uploadButton = document.querySelector('[data-ui="crop-image"]');
          if (!uploadButton || !this.isElementVisible(uploadButton)) {
            console.log(
              "✅ Modal closed, checking for final success indicators"
            );

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
                  console.log("✅ Found uploaded image preview");
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
                  console.log(`✅ Found success indicator: ${selector}`);
                  resolve(true);
                  return;
                }
              }
            }

            // If we've waited long enough after modal closed, consider it successful
            if (elapsed > 15000) {
              // 15 seconds after modal appeared
              console.log(
                "✅ Upload likely completed (modal closed and time elapsed)"
              );
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
              console.log(`❌ Found error: ${element.textContent.trim()}`);
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
    jobId,
    fieldInfo = {},
    jobTitle
  ) {
    try {
      const fileType = fieldInfo.isResume
        ? "resume"
        : this.determineFileType(fileInput);

      // Cover letters are generated, not uploaded from URL
      if (fileType === "coverLetter" && jobDescription) {
        return await this.handleCoverLetterUpload(
          fileInput,
          userDetails,
          jobDescription
        );
      }

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
      } else if (fileType === "avatar") {
        return await this.uploadImageStandalone(fileInput, userDetails.image);
      } else {
        return await this.uploadFileFromUrl(fileInput, fileUrls[0].fileUrl, userDetails);
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

      // Step 4: Generate Resume DOCX or PDF
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
        throw new Error("Generated file is empty");
      }

      const fileName = `${userDetails.firstName + "_" + userDetails.lastName || "resume"}.${blob.type.split("/")[1]}`;
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

      // Give Angular time to process the file from the change event
      await this.wait(2000);

      console.log(`✅ Successfully uploaded: ${fileName}`);
      return true;
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

    // Check if disabled
    if (fileInput.disabled) return false;

    // For Breezy's file inputs (may be hidden by Angular)
    // Hidden file inputs are still accessible if they're in the DOM
    if (fileInput.type === "file") {
      // Check if the element is in the DOM
      return document.contains(fileInput);
    }

    // Fallback to visibility check for other types
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
