// platforms/glassdoor/glassdoor-file-handler.js
import { fetchFile } from "../../shared/utilities/fetch-file.js";

export class GlassdoorFileHandler {
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
   * Handle all file uploads in the form using Indeed's file system
   */
  async handleFileUploads(form, userDetails, jobDescription, jobTitle) {
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
        return true; // No uploads needed is considered success
      } else {
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
  async handleSingleFileUpload(fileInput, userDetails, jobDescription, jobTitle) {
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
      // Call backend endpoint to generate the PDF
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
    jobId,
    jobTitle
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
        `📝 Generating ${resumeType.toUpperCase()} resume with template: ${resumeTemplate}`
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

      // Step 4: Generate Resume based on preferences
      if (resumeType === "docx") {
        // For DOCX, use the backend endpoint with template
        generateResponse = await fetch(generateURL, {
          method: "POST",
          headers: this.getAuthHeaders(),
          body: JSON.stringify({
            template: `${resumeTemplate}_template`,
            data: resumeData.data
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

      // Snapshot current resume state BEFORE upload to detect changes
      const preUploadSnapshot = this.snapshotResumeState();

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
      // Pass expected filename and pre-upload snapshot to detect actual change
      const uploadConfirmed = await this.waitForResumeConfirmation(
        fileInput,
        15000,
        fileName,
        preUploadSnapshot
      );
      if (!uploadConfirmed) {
        console.warn(
          "⚠️ Upload confirmation not detected, file may not persist"
        );
      }

      return uploadConfirmed;
    } catch (error) {
      console.error("Resume generation failed:", error);
      // Fallback to uploading the first resume's URL if custom generation fails
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

      // Snapshot current resume state BEFORE upload to detect changes
      const preUploadSnapshot = this.snapshotResumeState();

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
        `📁 Blob uploaded to input: ${fileName} (${file.size} bytes)`
      );

      // CRITICAL: Wait for SmartApply React UI confirmation
      // Pass expected filename and snapshot to detect actual state change
      const uploadSuccess = await this.waitForResumeConfirmation(
        fileInput,
        15000,
        fileName,
        preUploadSnapshot
      );

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
  async handleResumeUpload(resumeContainer, userDetails, jobDescription, jobTitle) {
    try {
      console.log("📁 Getting resume file URLs");
      const fileUrls = this.getFileUrls(userDetails, "resume");
      if (!fileUrls || fileUrls.length === 0) {
        console.log("❌ No resume URLs found");
        return false;
      }
      console.log(`📁 Found ${fileUrls.length} resume URLs`);

      // Find file input in the container
      const fileInput = resumeContainer.querySelector('input[type="file"]');
      if (!fileInput) {
        console.log("❌ No file input found in resume container");
        return false;
      }

      return await this.handleResumeUploadToInput(
        fileInput,
        userDetails,
        jobDescription,
        fileUrls,
        undefined,
        jobTitle
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
    jobDescription
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
        userDetails
      );
    } catch (error) {
      console.error("❌ Error with cover letter upload:", error);
      return false;
    }
  }
  /**
   * Generate proper resume filename based on user details
   */
  generateResumeFileName(userDetails, fileUrlOrExtension) {
    try {
      let extension = ".pdf";
      if (fileUrlOrExtension) {
        const input = fileUrlOrExtension.toLowerCase();

        if (!input.includes("/") && !input.includes("http")) {
          extension = input.startsWith(".") ? input : `.${input}`;
        } else {
          if (input.includes(".docx")) {
            extension = ".docx";
          } else if (input.includes(".doc")) {
            extension = ".doc";
          }
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
  generateCoverLetterFileName(userDetails, fileUrlOrExtension) {
    try {
      let extension = ".pdf";
      if (fileUrlOrExtension) {
        const input = fileUrlOrExtension.toLowerCase();

        if (!input.includes("/") && !input.includes("http")) {
          extension = input.startsWith(".") ? input : `.${input}`;
        } else {
          if (input.includes(".docx")) {
            extension = ".docx";
          } else if (input.includes(".doc")) {
            extension = ".doc";
          }
        }
      }

      const firstName = userDetails?.firstName?.trim();
      const lastName = userDetails?.lastName?.trim();

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
            console.log(
              `✅ Found success indicator with selector: ${selector}`
            );
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
            console.log(
              `✅ File detected in input after ${elapsed}ms, considering upload successful`
            );
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
   * Snapshot the current resume UI state before uploading
   * Used to detect actual changes after upload attempt
   * @returns {Object} snapshot of current resume card state
   */
  snapshotResumeState() {
    const snapshot = {
      cardTexts: [],
      fileNames: [],
      cardCount: 0,
    };

    // Capture all resume card text content
    const cardSelectors = [
      '[data-testid="FileResumeCard"]',
      '[data-testid="IndeedResumeCard"]',
      '[data-testid="resume-selection-file-resume-radio-card"]',
    ];
    for (const sel of cardSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        snapshot.cardTexts.push(el.textContent?.trim() || "");
        snapshot.cardCount++;
      }
    }

    // Capture any displayed filename text
    const nameSelectors = [
      '[data-testid="FileResumeCard-label"]',
      '[data-testid="resume-selection-file-resume-radio-card-label"]',
      ".file-name-display",
      ".selected-file-name",
    ];
    for (const sel of nameSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        snapshot.fileNames.push(el.textContent?.trim().toLowerCase() || "");
      }
    }

    console.log("📸 Resume state snapshot:", {
      cardCount: snapshot.cardCount,
      fileNames: snapshot.fileNames,
    });
    return snapshot;
  }

  /**
   * Wait for SmartApply's React UI to confirm resume upload
   * Detects actual state CHANGE rather than mere existence of resume cards
   * @param {HTMLElement} fileInput - The file input element
   * @param {number} timeout - Max wait time in ms
   * @param {string} expectedFileName - The filename we expect to see after upload
   * @param {Object} preUploadSnapshot - Snapshot taken before upload to detect changes
   * @returns {Promise<boolean>} - True if upload confirmed
   */
  async waitForResumeConfirmation(fileInput, timeout = 15000, expectedFileName = null, preUploadSnapshot = null) {
    const startTime = Date.now();
    const pollInterval = 300;

    // Error indicators to watch for
    const errorSelectors = [
      '[data-testid*="error"]',
      ".upload-error",
      ".file-error",
    ];

    const expectedNameLower = expectedFileName?.toLowerCase()?.split(".")[0] || null;

    console.log(`⏳ Waiting for resume upload confirmation...${expectedFileName ? ` (expecting: ${expectedFileName})` : ""}`);

    while (Date.now() - startTime < timeout) {
      // Strategy 1: Check if the expected filename is now visible in the UI
      if (expectedNameLower) {
        const nameSelectors = [
          '[data-testid="FileResumeCard-label"]',
          '[data-testid="resume-selection-file-resume-radio-card-label"]',
          '[data-testid="FileResumeCard"]',
          '[data-testid="resume-selection-file-resume-radio-card"]',
          ".file-name-display",
          ".selected-file-name",
        ];
        for (const sel of nameSelectors) {
          const el = document.querySelector(sel);
          if (el && this.isElementVisible(el)) {
            const elText = el.textContent?.toLowerCase() || "";
            if (elText.includes(expectedNameLower)) {
              console.log(`✅ Resume upload confirmed - expected filename "${expectedFileName}" visible in UI via ${sel}`);
              return true;
            }
          }
        }
      }

      // Strategy 2: Detect state change from pre-upload snapshot
      if (preUploadSnapshot) {
        const currentSnapshot = this.snapshotResumeState();
        // Card text changed = new resume was processed
        const textChanged = currentSnapshot.cardTexts.some(
          (text, i) => text !== (preUploadSnapshot.cardTexts[i] || "")
        );
        // New card appeared
        const cardCountChanged = currentSnapshot.cardCount !== preUploadSnapshot.cardCount;
        // Filename in UI changed
        const fileNameChanged = currentSnapshot.fileNames.some(
          (name, i) => name !== (preUploadSnapshot.fileNames[i] || "")
        );

        if (textChanged || cardCountChanged || fileNameChanged) {
          console.log("✅ Resume upload confirmed - UI state changed from snapshot", {
            textChanged,
            cardCountChanged,
            fileNameChanged,
          });
          return true;
        }
      }

      // Strategy 3: No expected filename and no snapshot - legacy fallback
      // Only use when we have no better signal (e.g. first upload with no pre-existing resume)
      if (!expectedNameLower && !preUploadSnapshot) {
        const freshCardSelectors = [
          '[data-testid*="resume-success"]',
          '[data-testid*="file-uploaded"]',
          ".upload-success",
          ".upload-complete",
        ];
        for (const selector of freshCardSelectors) {
          const element = document.querySelector(selector);
          if (element && this.isElementVisible(element)) {
            console.log(`✅ Resume upload confirmed via: ${selector}`);
            return true;
          }
        }

        // Check if file still exists in input and filename visible
        if (fileInput.files && fileInput.files.length > 0) {
          const container =
            fileInput.closest(
              'form, .file-upload-container, [class*="resume"]'
            ) || fileInput.parentElement;
          const containerText = container?.textContent?.toLowerCase() || "";
          const fileName = fileInput.files[0].name.toLowerCase();
          if (containerText.includes(fileName.split(".")[0])) {
            console.log("✅ Resume upload confirmed - filename visible in UI (legacy)");
            return true;
          }
        }
      }

      // Check for errors
      for (const selector of errorSelectors) {
        const element = document.querySelector(selector);
        if (element && this.isElementVisible(element)) {
          const errorText = element.textContent?.trim() || "";
          if (errorText.length > 0 && !errorText.includes("required")) {
            console.error(`❌ Upload error detected: ${errorText}`);
            return false;
          }
        }
      }

      // Check if file is still set (if cleared, React rejected it)
      if (!fileInput.files || fileInput.files.length === 0) {
        console.warn(
          "⚠️ File was cleared from input - React may have rejected it"
        );
        await this.wait(500);
        if (!fileInput.files || fileInput.files.length === 0) {
          return false;
        }
      }

      await this.wait(pollInterval);
    }

    // Timeout - check one final time if file is still in input
    if (fileInput.files && fileInput.files.length > 0) {
      console.log("⚠️ Timeout but file still in input - assuming success");
      return true;
    }

    console.warn("❌ Resume upload confirmation timed out");
    return false;
  }

  /**
   * Check if element is visible
   */
  isElementVisible(element) {
    if (!element) return false;
    try {
      const style = window.getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      ) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    } catch {
      return false;
    }
  }

  /**
   * Dispatch file events on input element - enhanced for React/SmartApply compatibility
   */
  async dispatchFileEvents(fileInput) {
    try {
      // Focus first - React needs this for controlled inputs
      fileInput.focus();
      fileInput.dispatchEvent(new FocusEvent("focus", { bubbles: true }));

      // Create and dispatch InputEvent (React listens to this)
      const inputEvent = new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertFromPaste",
      });
      fileInput.dispatchEvent(inputEvent);

      // Change event - critical for file inputs
      const changeEvent = new Event("change", {
        bubbles: true,
        cancelable: true,
      });
      fileInput.dispatchEvent(changeEvent);

      // Small delay for React to process
      await this.wait(100);

      // Blur to complete the interaction cycle
      fileInput.blur();
      fileInput.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

      // Additional delay for React state updates
      await this.wait(200);

      console.log("📤 File events dispatched for React/SmartApply");
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
    console.log(userDetails);
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
