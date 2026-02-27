// platforms/rippling/rippling-file-handler.js
// Rippling ATS file handler - handles resume and cover letter uploads
// Uses DataTransfer pattern consistent with other platform file handlers

import { fetchFile } from "../../shared/utilities/fetch-file.js";

export default class RipplingFileHandler {
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

  // ========================================
  // MAIN ENTRY POINT
  // ========================================

  async handleFileUploads(form, userDetails, jobDescription, jobId, jobTitle) {
    try {
      if (!form || !userDetails) return false;

      const fileInputs = form.querySelectorAll('input[type="file"]');
      if (fileInputs.length === 0) return true;

      let successCount = 0;

      for (const fileInput of fileInputs) {
        const inputId = this.getInputIdentifier(fileInput);
        if (this.processedInputs.has(inputId)) continue;
        if (!this.isFileInputAccessible(fileInput)) continue;

        this.processedInputs.add(inputId);

        try {
          const result = await this.handleSingleFileUpload(
            fileInput,
            userDetails,
            jobDescription,
            jobId,
            jobTitle
          );
          if (result) successCount++;
        } catch (error) {
          console.error(`File upload error for ${inputId}:`, error);
        }
      }

      return successCount > 0;
    } catch (error) {
      console.error("Error in handleFileUploads:", error);
      return false;
    }
  }

  // ========================================
  // SINGLE FILE UPLOAD
  // ========================================

  async handleSingleFileUpload(
    fileInput,
    userDetails,
    jobDescription,
    jobId,
    jobTitle
  ) {
    const fileType = this.determineFileType(fileInput);

    if (fileType === "resume" && jobDescription) {
      const fileUrls = this.getFileUrls(userDetails, fileType);
      if (!fileUrls || fileUrls.length === 0) {
        console.warn("No resume URLs available");
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
      // Fallback: try resume upload
      const fileUrls = this.getFileUrls(userDetails, "resume");
      if (fileUrls && fileUrls.length > 0) {
        const url =
          typeof fileUrls[0] === "string"
            ? fileUrls[0]
            : fileUrls[0]?.fileUrl;
        return await this.uploadFileFromUrl(fileInput, url, userDetails);
      }
      return false;
    }
  }

  // ========================================
  // RESUME UPLOAD
  // ========================================

  async handleResumeUpload(
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
      console.error("Resume upload error:", error);
      return false;
    }
  }

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
        throw new Error(
          `Optimize Resume Failed: ${optimizeResponse.status}`
        );
      }

      const resumeData = await optimizeResponse.json();

      // Step 4: Generate Resume
      let generateResponse;
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
        userDetails.author =
          userDetails.firstName + " " + userDetails.lastName;
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
        throw new Error(
          `Generate Resume Failed: ${generateResponse.status}`
        );
      }

      const blob = await generateResponse.blob();
      if (blob.size === 0) {
        throw new Error("Generated resume file is empty");
      }

      const fileName = `${
        userDetails.firstName + "_" + userDetails.lastName || "resume"
      }.${
        blob.type.split("/")[1] == "pdf" ? "pdf" : "docx"
      }`;

      await this.uploadBlob(fileInput, blob, fileName, userDetails);
      console.log("✅ Custom resume uploaded successfully");
      return true;
    } catch (error) {
      console.error("Custom resume generation failed, using fallback:", error);
      return await this.uploadFileFromUrl(
        fileInput,
        fileUrls[0].fileUrl,
        userDetails
      );
    }
  }

  async matchAndUploadResume(
    fileInput,
    userDetails,
    jobDescription,
    fileUrls
  ) {
    try {
      const primaryResume = fileUrls.find(
        (resume) => typeof resume === "object" && resume?.isPrimary
      );
      const bestResumeUrl =
        primaryResume?.fileUrl ||
        (typeof fileUrls[0] === "string"
          ? fileUrls[0]
          : fileUrls[0]?.fileUrl);

      if (!bestResumeUrl) {
        throw new Error("No valid resume URL found");
      }

      return await this.uploadFileFromUrl(
        fileInput,
        bestResumeUrl,
        userDetails
      );
    } catch (error) {
      const fallbackUrl =
        typeof fileUrls[0] === "string"
          ? fileUrls[0]
          : fileUrls[0]?.fileUrl;
      return await this.uploadFileFromUrl(
        fileInput,
        fallbackUrl,
        userDetails
      );
    }
  }

  // ========================================
  // COVER LETTER UPLOAD
  // ========================================

  async handleCoverLetterUpload(fileInput, userDetails, jobDescription) {
    try {
      const response = await fetch(
        `https://resumify.fastapply.co/api/generate-cover-letter-pdf`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName:
              userDetails.lastName + " " + userDetails.firstName,
            jobDescription: jobDescription,
            skills: userDetails.skills,
            education: userDetails.education,
            fullPositions: userDetails.fullPositions,
            tone: "Professional",
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to generate cover letter PDF: ${response.status}`
        );
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error("Generated cover letter PDF is empty");
      }

      const fileName = this.generateCoverLetterFileName(userDetails);
      const file = new File([blob], fileName, {
        type: blob.type || "application/pdf",
        lastModified: Date.now(),
      });

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;

      await this.dispatchFileEvents(fileInput);
      const uploadSuccess = await this.waitForUploadProcess(fileInput);

      if (uploadSuccess) {
        console.log("✅ Cover letter uploaded successfully");
      }

      return uploadSuccess;
    } catch (error) {
      console.error("Cover letter upload error:", error);
      return false;
    }
  }

  // ========================================
  // FILE UPLOAD UTILITIES
  // ========================================

  async uploadFileFromUrl(fileInput, fileUrl, userDetails = null) {
    try {
      if (!fileUrl || !fileInput) return false;

      const response = await fetchFile(fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status}`);
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error("Downloaded file is empty");
      }

      const fileName = this.extractFileNameFromUrl(fileUrl);
      return await this.uploadBlob(fileInput, blob, fileName, userDetails);
    } catch (error) {
      console.error("Error uploading file from URL:", error);
      return false;
    }
  }

  async uploadBlob(fileInput, blob, originalFileName, userDetails = null) {
    try {
      if (blob.size === 0) {
        throw new Error("File is empty");
      }

      let fileName;
      if (userDetails) {
        const originalLower = (originalFileName || "").toLowerCase();
        if (
          originalLower.includes("cover") ||
          originalLower.includes("letter")
        ) {
          fileName = this.generateCoverLetterFileName(userDetails);
        } else {
          fileName = this.generateResumeFileName(
            userDetails,
            originalFileName
          );
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
      return await this.waitForUploadProcess(fileInput);
    } catch (error) {
      console.error("Error uploading blob:", error);
      return false;
    }
  }

  async dispatchFileEvents(fileInput) {
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));
    fileInput.focus();
    await this.wait(50);
    fileInput.blur();
    await this.wait(100);
  }

  async waitForUploadProcess(fileInput, timeout = 30000) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkUpload = () => {
        const elapsed = Date.now() - startTime;
        const container =
          fileInput.closest("form, .field, .form-field") ||
          fileInput.parentElement;

        // Check for success indicators
        const successSelectors = [
          ".upload-success",
          ".file-uploaded",
          ".upload-complete",
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

        // Check if filename is displayed
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
        ];

        for (const selector of errorSelectors) {
          const element = container?.querySelector(selector);
          if (element && element.textContent.trim()) {
            resolve(false);
            return;
          }
        }

        // After 10 seconds with file present, assume success
        if (
          fileInput.files &&
          fileInput.files.length > 0 &&
          elapsed > 10000
        ) {
          resolve(true);
          return;
        }

        if (elapsed > timeout) {
          resolve(
            fileInput.files && fileInput.files.length > 0
          );
          return;
        }

        setTimeout(checkUpload, 500);
      };

      checkUpload();
    });
  }

  // ========================================
  // FILE TYPE DETECTION
  // ========================================

  determineFileType(fileInput) {
    const name = (fileInput.name || "").toLowerCase();
    const id = (fileInput.id || "").toLowerCase();
    const dataTestId = (
      fileInput.getAttribute("data-testid") || ""
    ).toLowerCase();

    // Check for cover letter
    if (
      id.includes("cover") ||
      name.includes("cover") ||
      dataTestId.includes("cover")
    ) {
      return "coverLetter";
    }

    // Check for resume
    if (
      name.includes("resume") ||
      id.includes("resume") ||
      name.includes("cv") ||
      id.includes("cv") ||
      dataTestId.includes("resume")
    ) {
      return "resume";
    }

    // Check container text
    const container =
      fileInput.closest('[data-testid="field"]') ||
      fileInput.closest(".marginY--36") ||
      fileInput.parentElement;

    if (container) {
      const containerText = container.textContent.toLowerCase();
      if (
        containerText.includes("cover letter") ||
        containerText.includes("cover")
      ) {
        return "coverLetter";
      }
      if (
        containerText.includes("resume") ||
        containerText.includes("cv")
      ) {
        return "resume";
      }
    }

    return "resume"; // Default
  }

  getFileUrls(userDetails, fileType) {
    if (fileType === "coverLetter") {
      return userDetails.coverLetterUrl;
    }
    return userDetails.resumes;
  }

  // ========================================
  // FILENAME GENERATION
  // ========================================

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

  generateCoverLetterFileName(userDetails) {
    try {
      const firstName = (userDetails?.firstName || "FirstName").replace(
        /[^\w]/g,
        ""
      );
      const lastName = (userDetails?.lastName || "LastName").replace(
        /[^\w]/g,
        ""
      );

      return `${firstName}_${lastName}_Cover_Letter.pdf`;
    } catch (error) {
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
      } catch {
        decodedUrl = workingUrl;
      }

      const urlObj = new URL(decodedUrl);
      let fileName = urlObj.pathname.split("/").pop();

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

  // ========================================
  // UTILITIES
  // ========================================

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

  isFileInputAccessible(fileInput) {
    if (!fileInput) return false;
    return !fileInput.disabled && this.isElementVisible(fileInput);
  }

  isElementVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0"
    );
  }

  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
