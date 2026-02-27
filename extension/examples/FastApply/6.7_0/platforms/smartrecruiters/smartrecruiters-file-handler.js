// platforms/smartrecruiters/smartrecruiters-file-handler.js

import { fetchFile } from "../../shared/utilities/fetch-file.js";

export class SmartRecruitersFileHandler {
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
   * Wait utility
   */
  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================================================
  // Shadow DOM File Input Discovery (from aooly.js)
  // ============================================================================

  /**
   * Find file input within an element (handles shadow DOM)
   */
  findFileInputWithin(element) {
    if (!element) {
      return null;
    }

    if (element.matches && element.matches('input[type="file"]')) {
      return element;
    }

    if (element.querySelector) {
      const direct = element.querySelector('input[type="file"]');
      if (direct) {
        return direct;
      }
    }

    const shadowRoot = element.shadowRoot;
    if (!shadowRoot) {
      return null;
    }

    const shadowInput = shadowRoot.querySelector('input[type="file"]');
    if (shadowInput) {
      return shadowInput;
    }

    const slots = shadowRoot.querySelectorAll('slot');
    for (const slot of slots) {
      if (typeof slot.assignedElements !== 'function') {
        continue;
      }
      let assigned = [];
      try {
        assigned = slot.assignedElements({ flatten: true });
      } catch {
        assigned = slot.assignedElements();
      }
      for (const assignedNode of assigned) {
        const nested = this.findFileInputWithin(assignedNode);
        if (nested) {
          return nested;
        }
      }
    }

    return null;
  }

  /**
   * Collect all file inputs from a DOM tree (with shadow DOM traversal)
   */
  collectFileInputsFromNode(node, results, visited) {
    if (!node || visited.has(node)) {
      return;
    }

    visited.add(node);

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node;
      if (typeof el.matches === 'function' && el.matches('input[type="file"]')) {
        results.push(el);
      }

      if (el.shadowRoot) {
        this.collectFileInputsFromNode(el.shadowRoot, results, visited);
      }

      if (el.tagName === 'SLOT') {
        let assignedNodes = [];
        try {
          assignedNodes = el.assignedNodes({ flatten: true });
        } catch {
          assignedNodes = el.assignedNodes();
        }
        for (const assigned of assignedNodes) {
          this.collectFileInputsFromNode(assigned, results, visited);
        }
      }
    }

    const childNodes = node.childNodes || [];
    for (const child of childNodes) {
      this.collectFileInputsFromNode(child, results, visited);
    }
  }

  /**
   * Score file input to prioritize resume dropzones
   */
  scoreFileInput(input) {
    let score = 0;
    const dropzone = input.closest('spl-dropzone');
    const dataTest = dropzone?.getAttribute?.('data-test') || '';

    if (dropzone) {
      score += 10;
    }

    if (dataTest.includes('resume')) {
      score += 10;
    }

    if (dropzone?.closest('[data-test="easy-apply-container"]')) {
      score += 5;
    }

    if (dropzone?.closest('[data-test="resume-upload-container"]')) {
      score += 5;
    }

    // Penalize avatar/image inputs
    if (input.closest('[data-test="avatar"]')) {
      score -= 20;
    }

    return score;
  }

  /**
   * Get the spl-dropzone host for an input
   */
  getDropzoneHostForInput(input) {
    if (!input) {
      return null;
    }

    if (typeof input.closest === 'function') {
      const host = input.closest('spl-dropzone');
      if (host) {
        return host;
      }
    }

    let root = input.getRootNode ? input.getRootNode() : null;
    while (root) {
      const host = root.host;
      if (host && typeof host.matches === 'function' && host.matches('spl-dropzone')) {
        return host;
      }
      root = host && host.getRootNode ? host.getRootNode() : null;
    }

    return null;
  }

  /**
   * Capture dropzone state snapshot for upload confirmation
   */
  getDropzoneStateSnapshot(dropzone, fileInput) {
    const labelTexts = new Set();
    const filesAttr = dropzone?.getAttribute ? dropzone.getAttribute('files') || '' : '';
    const filesCount = fileInput?.files?.length || 0;
    let hasFileNameElement = false;

    const shadow = dropzone?.shadowRoot;
    if (shadow) {
      const labelNodes = shadow.querySelectorAll(
        '.c-spl-dropzone-label, .c-spl-dropzone-label-browse, [data-test="file-name"], .file-name, .uploaded, [id*="dropzone-label"]'
      );
      labelNodes.forEach((node) => {
        const text = node.textContent?.trim().toLowerCase();
        if (text) {
          labelTexts.add(text);
        }
      });
      if (shadow.querySelector('[data-test="file-name"], .c-spl-dropzone-file-name, .file-name, .uploaded')) {
        hasFileNameElement = true;
      }
    }

    return {
      filesAttr,
      filesCount,
      labelTexts,
      hasFileNameElement
    };
  }

  /**
   * Wait for dropzone upload confirmation by detecting state changes
   */
  async waitForDropzoneUploadConfirmation(dropzone, fileInput, initialSnapshot, attempts = 30, delay = 500) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const state = this.getDropzoneStateSnapshot(dropzone, fileInput);

      const fileCountIncreased = state.filesCount > initialSnapshot.filesCount;
      const attrChanged = state.filesAttr && state.filesAttr !== '[]' && state.filesAttr !== initialSnapshot.filesAttr;
      const labelChanged = [...state.labelTexts].some((text) => !initialSnapshot.labelTexts.has(text));
      const hasFileNameElement = state.hasFileNameElement;

      if (fileCountIncreased || attrChanged || labelChanged || hasFileNameElement) {
        return true;
      }




      await this.wait(delay);
    }

    return false;
  }

  /**
   * Find resume file input using multiple strategies
   */
  findResumeFileInput() {
    const dropzoneSelectors = [
      'spl-dropzone[data-test="resume-upload"]',
      'spl-dropzone[data-test="apply-with-resume-container"]',
      'spl-dropzone[enablefiledeletions]'
    ];

    for (const selector of dropzoneSelectors) {
      const dropzone = document.querySelector(selector);
      const input = this.findFileInputWithin(dropzone);
      if (input) {
        return input;
      }
    }

    const collected = [];
    const visited = new Set();
    this.collectFileInputsFromNode(document, collected, visited);

    const candidates = collected.filter((input) => {
      if (!input.isConnected) {
        return false;
      }
      if (input.closest('[data-test="avatar"]')) {
        return false;
      }
      const accept = (input.getAttribute('accept') || '').toLowerCase();
      if (!accept) {
        return true;
      }
      if (accept.includes('.pdf') || accept.includes('.doc') || accept.includes('application/')) {
        return true;
      }
      return false;
    }).sort((a, b) => this.scoreFileInput(b) - this.scoreFileInput(a));

    return candidates[0] || null;
  }

  /**
   * Wait for resume file input to appear
   */
  async waitForResumeFileInput(attempts = 12, delay = 500) {
    for (let i = 0; i < attempts; i++) {
      const input = this.findResumeFileInput();
      if (input) {
        return input;
      }
      await this.wait(delay);
    }
    return null;
  }

  // ============================================================================
  // File Upload Handlers
  // ============================================================================

  /**
   * Handle all file uploads in the form with duplicate prevention
   */
  async handleFileUploads(form, userDetails, jobDescription, jobTitle, jobId) {
    try {
      if (!form || !userDetails) {
        return false;
      }

      // Try to find resume file input using the improved method
      const fileInput = await this.waitForResumeFileInput();

      if (!fileInput) {
        // Fallback to original method
        const fileInputs = this.findSmartRecruiterFileInputs(form);
        if (fileInputs.length === 0) {
          return true;
        }
        return await this.handleMultipleFileInputs(fileInputs, userDetails, jobDescription, jobTitle, jobId);
      }

      const inputId = this.getInputIdentifier(fileInput);
      if (this.processedInputs.has(inputId)) {
        return true;
      }

      if (!this.isFileInputAccessible(fileInput)) {
        return false;
      }

      this.processedInputs.add(inputId);

      // Get dropzone for upload confirmation
      const dropzoneHost = this.getDropzoneHostForInput(fileInput);
      const initialDropzoneState = this.getDropzoneStateSnapshot(dropzoneHost, fileInput);

      try {
        const result = await this.handleSingleFileUpload(
          fileInput,
          userDetails,
          jobDescription,
          jobTitle,
          jobId
        );

        if (result && dropzoneHost) {
          // Wait for upload confirmation from spl-dropzone
          const uploadConfirmed = await this.waitForDropzoneUploadConfirmation(
            dropzoneHost,
            fileInput,
            initialDropzoneState
          );

          if (!uploadConfirmed) {
            console.warn("⚠️ Dropzone did not confirm upload, retrying with plain resume");
            // Reset the input and try with the original (non-tailored) resume
            this.processedInputs.delete(inputId);
            const plainUrl = userDetails.resumes?.find(r => r.isPrimary)?.fileUrl
              || userDetails.resumes?.[0]?.fileUrl;
            if (plainUrl) {
              return await this.uploadFileFromUrl(fileInput, plainUrl, userDetails);
            }
          }
        }

        return result;
      } catch (error) {
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle multiple file inputs (fallback method)
   */
  async handleMultipleFileInputs(fileInputs, userDetails, jobDescription, jobTitle, jobId) {
    let uploadCount = 0;
    let successCount = 0;

    for (const fileInput of fileInputs) {
      const inputId = this.getInputIdentifier(fileInput);
      if (this.processedInputs.has(inputId)) {
        continue;
      }

      if (!this.isFileInputAccessible(fileInput)) continue;

      uploadCount++;
      this.processedInputs.add(inputId);

      // Get dropzone for upload confirmation
      const dropzoneHost = this.getDropzoneHostForInput(fileInput);
      const initialDropzoneState = this.getDropzoneStateSnapshot(dropzoneHost, fileInput);

      try {
        const result = await this.handleSingleFileUpload(
          fileInput,
          userDetails,
          jobDescription,
          jobTitle,
          jobId
        );

        if (result) {
          successCount++;
          if (dropzoneHost) {
            await this.waitForDropzoneUploadConfirmation(
              dropzoneHost,
              fileInput,
              initialDropzoneState
            );
          }
        }
      } catch (error) {
      }
    }

    return successCount > 0;
  }

  /**
   * Find file inputs in SmartRecruiters form (handles shadow DOM)
   * Only targets the oc-resume-upload component, skipping:
   * - oc-easy-apply (auto-fill dropzone)
   * - oc-avatar (profile image upload)
   */
  findSmartRecruiterFileInputs(form) {
    const fileInputs = [];

    // Only find file inputs within oc-resume-upload components
    // This excludes oc-easy-apply and oc-avatar dropzones
    const resumeUploads = form.querySelectorAll("oc-resume-upload");
    for (const upload of resumeUploads) {
      // Check nested spl-dropzone first (preferred)
      const nestedDropzone = upload.querySelector("spl-dropzone");
      if (nestedDropzone?.shadowRoot) {
        const shadowInput =
          nestedDropzone.shadowRoot.querySelector('input[type="file"]');
        if (shadowInput && !fileInputs.includes(shadowInput)) {
          fileInputs.push(shadowInput);
          continue; // Found the input, move to next upload
        }
      }
      // Fallback: direct input within oc-resume-upload
      const input = upload.querySelector('input[type="file"]');
      if (input && !fileInputs.includes(input)) {
        fileInputs.push(input);
      }
    }

    // If no oc-resume-upload found, look for spl-dropzone with data-test="resume-upload"
    if (fileInputs.length === 0) {
      const resumeDropzones = form.querySelectorAll(
        'spl-dropzone[data-test="resume-upload"]'
      );
      for (const dropzone of resumeDropzones) {
        if (dropzone.shadowRoot) {
          const shadowInput =
            dropzone.shadowRoot.querySelector('input[type="file"]');
          if (shadowInput && !fileInputs.includes(shadowInput)) {
            fileInputs.push(shadowInput);
          }
        }
      }
    }

    return fileInputs;
  }

  /**
   * Get unique identifier for file input
   */
  getInputIdentifier(fileInput) {
    return (
      fileInput.id ||
      fileInput.name ||
      fileInput.getAttribute("data-test") ||
      `input-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
  }

  /**
   * Check if file input is accessible
   */
  isFileInputAccessible(fileInput) {
    if (!fileInput) return false;
    if (fileInput.disabled) return false;
    return true;
  }

  /**
   * Handle a single file upload
   */
  async handleSingleFileUpload(fileInput, userDetails, jobDescription, jobTitle, jobId) {
    try {
      const fileType = this.determineFileType(fileInput);
      const fileUrls = this.getFileUrls(userDetails, fileType);

      if (!fileUrls || fileUrls.length === 0) {
        return false;
      }

      if (fileType === "resume") {
        return await this.handleResumeUpload(
          fileInput,
          userDetails,
          jobDescription || "",
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
          fileUrls[0]?.fileUrl || fileUrls[0],
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
      if (userDetails?.jwtToken) {
        this.jwtToken = userDetails.jwtToken;
      }

      const generateURL =
        preferences.resumeType === "docx"
          ? `${this.backendApiHost}/api/v1/resume-builder/generate`
          : `https://resumify.fastapply.co/api/generate-resume-pdf`;

      const parseURL = `${this.backendApiHost}/api/v1/resumes/extract-text`;
      const optimizeURL = `${this.backendApiHost}/api/v1/resume-builder/optimize-ats`;

      // Step 1: Download resume via proxy (primary resume first, fallback to first)
      const primaryResume = userDetails.resumes?.find(
        (resume) => resume.isPrimary
      );
      const resumeFileUrl =
        primaryResume?.fileUrl || userDetails.resumes?.[0]?.fileUrl;

      if (!resumeFileUrl) {
        return false;
      }

      console.log("resumeFileUrl", resumeFileUrl);

      const fileResponse = await fetchFile(resumeFileUrl);
      if (!fileResponse.ok) {
        throw new Error(`Failed to download resume: ${fileResponse.status}`);
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
        throw new Error(`Parse failed: ${parseResponse.status}`);
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
        throw new Error(`Optimize failed: ${optimizeResponse.status}`);
      }

      const resumeData = await optimizeResponse.json();

      // Step 4: Generate Resume
      let generateResponse;
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
        userDetails.author = `${userDetails.firstName} ${userDetails.lastName}`;
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
        throw new Error(`Generate failed: ${generateResponse.status}`);
      }

      const blob = await generateResponse.blob();
      if (blob.size === 0) {
        throw new Error("Generated file is empty");
      }

      const extension = blob.type.includes("pdf") ? "pdf" : "docx";
      const fileName = `${userDetails.firstName}_${userDetails.lastName}_Resume.${extension}`;

      const uploaded = await this.uploadBlob(fileInput, blob, fileName, userDetails);
      if (!uploaded) {
        throw new Error("uploadBlob returned false");
      }
      return true;
    } catch (error) {
      console.error("❌ Resume tailoring failed, falling back to normal resume:", error.message || error);
      return await this.uploadFileFromUrl(
        fileInput,
        fileUrls[0]?.fileUrl,
        userDetails
      );
    }
  }

  /**
   * Match and upload best resume for the job
   */
  async matchAndUploadResume(fileInput, userDetails, jobDescription, fileUrls) {
    try {
      if (userDetails?.jwtToken) {
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
      return false;
    }
  }

  /**
   * Generate and upload cover letter PDF
   */
  async generateAndUploadCoverLetter(fileInput, userDetails, jobDescription) {
    try {
      const letterData = {
        fullName: `${userDetails.firstName} ${userDetails.lastName}`,
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(letterData),
        }
      );

      if (!response.ok) {
        throw new Error(`Cover letter generation failed: ${response.status}`);
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error("Generated cover letter is empty");
      }

      const fileName = `${userDetails.firstName}_${userDetails.lastName}_Cover_Letter.pdf`;
      const uploadResult = await this.uploadBlob(
        fileInput,
        blob,
        fileName,
        userDetails
      );

      return uploadResult;
    } catch (error) {
      const fileUrls = this.getFileUrls(userDetails, "coverLetter");
      if (fileUrls?.length > 0) {
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
      if (!fileUrl || !fileInput) {
        return false;
      }

      const response = await fetchFile(fileUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status}`);
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error("Downloaded file is empty");
      }

      const fileName = this.generateResumeFileName(userDetails, fileUrl);
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
   * Upload blob to file input via DataTransfer API
   */
  async uploadBlob(fileInput, blob, fileName, userDetails = null) {
    try {
      if (blob.size === 0) {
        throw new Error("File is empty");
      }

      // Validate blob is actually a document (not an error HTML page)
      const blobType = blob.type || "application/pdf";
      if (blobType.includes("text/html")) {
        throw new Error("Generated file is HTML, not a valid document");
      }

      console.log(`📄 Uploading file: ${fileName}, size: ${blob.size}, type: ${blobType}`);

      // Create File object
      const file = new File([blob], fileName, {
        type: blobType,
        lastModified: Date.now(),
      });

      // Create DataTransfer
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // Set files on input
      fileInput.files = dataTransfer.files;

      // Trigger events
      await this.dispatchFileEvents(fileInput);

      return true;
    } catch (error) {
      console.error("❌ uploadBlob failed:", error.message || error);
      return false;
    }
  }

  /**
   * Dispatch file events for SmartRecruiters
   * Must use composed: true so events cross shadow DOM boundary of spl-dropzone
   */
  async dispatchFileEvents(fileInput) {
    try {
      // Match aooly.js order: input first, then change — both with composed: true
      fileInput.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      fileInput.dispatchEvent(new Event("change", { bubbles: true, composed: true }));

      await this.wait(100);
    } catch (error) {
    }
  }

  /**
   * Determine file type from input context
   */
  determineFileType(fileInput) {
    const container = fileInput.closest(
      "oc-resume-upload, spl-dropzone, .form-section"
    );

    if (container) {
      const dataTest = container.getAttribute("data-test") || "";
      const containerText = container.textContent.toLowerCase();

      // Check for resume indicators
      if (
        dataTest.includes("resume") ||
        containerText.includes("resume") ||
        containerText.includes("cv")
      ) {
        return "resume";
      }

      // Check for cover letter
      if (
        dataTest.includes("cover") ||
        containerText.includes("cover letter")
      ) {
        return "coverLetter";
      }
    }

    // Default to resume
    return "resume";
  }

  /**
   * Generate resume filename
   */
  generateResumeFileName(userDetails, fileUrl) {
    try {
      let extension = ".pdf";
      if (fileUrl) {
        const urlLower = fileUrl.toLowerCase();
        if (urlLower.includes(".docx")) extension = ".docx";
        else if (urlLower.includes(".doc")) extension = ".doc";
      }

      const firstName = (userDetails?.firstName || "FirstName").replace(
        /[^\w]/g,
        ""
      );
      const lastName = (userDetails?.lastName || "LastName").replace(
        /[^\w]/g,
        ""
      );

      return `${firstName}_${lastName}_Resume${extension}`;
    } catch (error) {
      return `Resume_${Date.now()}.pdf`;
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
}
