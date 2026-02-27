// platforms/workday/workday-file-handler.js

import { fetchFile } from "../../shared/utilities/fetch-file.js";

/**
 * WorkdayFileHandler - Resume upload with matching and tailoring for Workday
 * Handles resume upload to Workday's file input with optional AI optimization
 */
export class WorkdayFileHandler {
  constructor(config = {}) {
    this.preferences = config.preferences || {};
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
   * Get file URLs from user details
   */
  getFileUrls(userDetails, fileType) {
    if (!userDetails) return [];

    let urls = [];
    if (fileType === "resume") {
      // Check multiple possible locations for resume URLs
      if (userDetails.resumes && Array.isArray(userDetails.resumes)) {
        urls = userDetails.resumes;
      } else if (
        userDetails.resumeUrls &&
        Array.isArray(userDetails.resumeUrls)
      ) {
        urls = userDetails.resumeUrls.map((url) => ({ fileUrl: url }));
      } else if (userDetails.resumeUrl) {
        urls = [{ fileUrl: userDetails.resumeUrl }];
      } else if (userDetails.resume) {
        urls = [{ fileUrl: userDetails.resume }];
      }
    } else if (fileType === "coverLetter") {
      if (userDetails.coverLetterUrl) {
        urls = [{ fileUrl: userDetails.coverLetterUrl }];
      } else if (userDetails.coverLetter) {
        urls = [{ fileUrl: userDetails.coverLetter }];
      }
    }

    console.log(`📁 Found ${urls.length} ${fileType} URL(s)`);
    return urls;
  }

  /**
   * Main entry point for resume upload
   */
  async handleResumeUpload(fileInput, userDetails, jobDescription, fileUrls, jobTitle) {
    try {
      console.log("📤 Starting resume upload process...");

      if (!fileUrls || fileUrls.length === 0) {
        console.error("❌ No resume URLs provided");
        return false;
      }

      // Check if custom resume generation is enabled
      if (this.preferences?.useCustomResume === true) {
        console.log("🎯 Custom resume mode - generating optimized resume");
        return await this.generateAndUploadCustomResume(
          fileInput,
          userDetails,
          jobDescription,
          fileUrls,
          jobTitle
        );
      } else if (fileUrls.length > 1) {
        console.log("📊 Multiple resumes - matching best fit for job");
        return await this.matchAndUploadResume(
          fileInput,
          userDetails,
          jobDescription,
          fileUrls
        );
      } else {
        console.log("📄 Single resume - uploading directly");
        return await this.uploadFileFromUrl(
          fileInput,
          fileUrls[0].fileUrl || fileUrls[0],
          userDetails
        );
      }
    } catch (error) {
      console.error("❌ Resume upload error:", error);
      // Fallback to first resume
      if (fileUrls && fileUrls.length > 0) {
        return await this.uploadFileFromUrl(
          fileInput,
          fileUrls[0].fileUrl || fileUrls[0],
          userDetails
        );
      }
      return false;
    }
  }

  /**
   * Generate and upload ATS-optimized custom resume
   */
  async generateAndUploadCustomResume(
    fileInput,
    userDetails,
    jobDescription,
    fileUrls,
    jobTitle
  ) {
    try {
      if (userDetails?.jwtToken) {
        this.jwtToken = userDetails.jwtToken;
      }

      const isDocx = this.preferences.resumeType === "docx";
      const generateURL = isDocx
        ? `${this.backendApiHost}/api/v1/resume-builder/generate`
        : `https://resumify.fastapply.co/api/generate-resume-pdf`;

      const parseURL = `${this.backendApiHost}/api/v1/resumes/extract-text`;
      const optimizeURL = `${this.backendApiHost}/api/v1/resume-builder/optimize-ats`;

      // Step 1: Download resume file via proxy
      const resumeFileUrl =
        fileUrls[fileUrls.length - 1].fileUrl || fileUrls[fileUrls.length - 1];

      console.log("⬇️ Downloading resume for optimization...");
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
      console.log("📖 Parsing resume text...");
      const formData = new FormData();
      formData.append("file", resumeFile);

      const parseResponse = await fetch(parseURL, {
        method: "POST",
        headers: this.getAuthHeaders(false),
        body: formData,
      });

      if (!parseResponse.ok) {
        throw new Error(`Parse resume failed: ${parseResponse.status}`);
      }

      const { text: parsedResumeText } = await parseResponse.json();

      // Step 3: Optimize Resume for ATS
      console.log("🎯 Optimizing resume for this job...");
      const optimizeResponse = await fetch(optimizeURL, {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          provider: "openai",
          resumeText: parsedResumeText,
          jobDescription: jobDescription || "",
          jobTitle: jobTitle || "",
          userData: userDetails,
        }),
      });

      if (!optimizeResponse.ok) {
        throw new Error(`Optimize resume failed: ${optimizeResponse.status}`);
      }

      const resumeData = await optimizeResponse.json();

      // Step 4: Generate Resume Document
      console.log(`📝 Generating ${isDocx ? "DOCX" : "PDF"} resume...`);
      let generateResponse;

      if (isDocx) {
        generateResponse = await fetch(generateURL, {
          method: "POST",
          headers: this.getAuthHeaders(),
          body: JSON.stringify({
            template: `${this.preferences.resumeTemplate || "modern"}_template`,
            data: resumeData.data,
          }),
        });
      } else {
        generateResponse = await fetch(generateURL, {
          method: "POST",
          headers: this.getAuthHeaders(),
          body: JSON.stringify({
            user_data: {
              ...userDetails,
              author: `${userDetails.firstName} ${userDetails.lastName}`,
            },
            resume_data: resumeData.data,
            template: this.preferences?.resumeTemplate,
          }),
        });
      }

      if (!generateResponse.ok) {
        throw new Error(`Generate resume failed: ${generateResponse.status}`);
      }

      const blob = await generateResponse.blob();
      if (blob.size === 0) {
        throw new Error("Generated resume is empty");
      }

      const extension = blob.type.includes("pdf") ? "pdf" : "docx";
      const fileName = `${userDetails.firstName}_${userDetails.lastName}_Resume.${extension}`;

      console.log("⬆️ Uploading optimized resume...");
      return await this.uploadBlob(fileInput, blob, fileName, userDetails);
    } catch (error) {
      console.error("❌ Custom resume generation failed:", error);
      // Fallback to regular upload
      return await this.uploadFileFromUrl(
        fileInput,
        fileUrls[0].fileUrl || fileUrls[0],
        userDetails
      );
    }
  }

  /**
   * Match best resume for the job and upload
   */
  async matchAndUploadResume(fileInput, userDetails, jobDescription, fileUrls) {
    try {
      if (userDetails?.jwtToken) {
        this.jwtToken = userDetails.jwtToken;
      }

      // Find primary resume, fall back to first resume if no primary is set
      const primaryResume = fileUrls.find(
        (resume) => typeof resume === "object" && resume?.isPrimary
      );
      const resumeToUploadUrl =
        primaryResume?.fileUrl ||
        (typeof fileUrls[0] === "string" ? fileUrls[0] : fileUrls[0]?.fileUrl);

      if (!resumeToUploadUrl) {
        throw new Error("No resume URL found");
      }

      console.log("✅ Primary resume selected");
      return await this.uploadFileFromUrl(
        fileInput,
        resumeToUploadUrl,
        userDetails
      );
    } catch (error) {
      console.error("❌ Resume upload failed:", error);
      // Fallback to first resume
      return await this.uploadFileFromUrl(
        fileInput,
        typeof fileUrls[0] === "string" ? fileUrls[0] : fileUrls[0]?.fileUrl,
        userDetails
      );
    }
  }

  /**
   * Upload file from URL via proxy
   */
  async uploadFileFromUrl(fileInput, fileUrl, userDetails = null) {
    try {
      if (!fileUrl) {
        console.error("❌ No file URL provided");
        return false;
      }

      if (!fileInput) {
        console.error("❌ No file input element");
        return false;
      }

      console.log("⬇️ Fetching file from URL...");
      const response = await fetchFile(fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status}`);
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error("Downloaded file is empty");
      }

      const fileName = this.generateResumeFileName(userDetails, fileUrl);
      return await this.uploadBlob(fileInput, blob, fileName, userDetails);
    } catch (error) {
      console.error("❌ Upload from URL failed:", error);
      return false;
    }
  }

  /**
   * Upload blob to file input
   */
  async uploadBlob(fileInput, blob, fileName, userDetails = null) {
    try {
      if (blob.size === 0) {
        throw new Error("File is empty");
      }

      console.log(`📄 Uploading: ${fileName} (${blob.size} bytes)`);

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

      // Dispatch events for React/Angular frameworks
      await this.dispatchFileEvents(fileInput);

      // Wait for upload to process
      const success = await this.waitForUploadProcess(fileInput);

      console.log(
        success ? "✅ Upload completed" : "⚠️ Upload status uncertain"
      );
      return success;
    } catch (error) {
      console.error("❌ Blob upload failed:", error);
      return false;
    }
  }

  /**
   * Dispatch file input events for framework detection
   */
  async dispatchFileEvents(fileInput) {
    console.log("🔔 Dispatching file events...");

    // Create and dispatch events
    const events = ["input", "change"];
    for (const eventType of events) {
      const event = new Event(eventType, { bubbles: true, cancelable: true });
      fileInput.dispatchEvent(event);
      await this.wait(100);
    }

    // Also try React-specific event
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "files"
    )?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(fileInput, fileInput.files);
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
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
          fileInput.closest("div, form") || fileInput.parentElement;

        // Workday-specific success indicators
        const successSelectors = [
          '[data-automation-id="file-upload-successful"]',
          '[data-automation-id="uploaded-file"]',
          ".css-1s544wy .css-wtpnzt", // Workday's upload success container
          ".uploaded",
          ".file-name",
          ".filename",
        ];

        for (const selector of successSelectors) {
          const element =
            document.querySelector(selector) ||
            container?.querySelector(selector);
          if (element && element.textContent.trim()) {
            console.log("✅ Upload success detected");
            resolve(true);
            return;
          }
        }

        // Check if file appears in the DOM
        if (fileInput.files && fileInput.files.length > 0) {
          const fileName = fileInput.files[0].name;
          const pageText = document.body.textContent || "";
          if (pageText.includes(fileName.split(".")[0])) {
            console.log("✅ Filename detected on page");
            resolve(true);
            return;
          }
        }

        // Check for errors
        const errorSelectors = [
          '[data-automation-id="upload-error"]',
          ".upload-error",
          ".error-message",
        ];

        for (const selector of errorSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent.trim()) {
            console.warn(
              "⚠️ Upload error detected:",
              element.textContent.trim()
            );
            resolve(false);
            return;
          }
        }

        // Timeout check
        if (elapsed > timeout) {
          // If we have files set, assume success
          if (fileInput.files && fileInput.files.length > 0) {
            console.log("⚠️ Timeout but files present - assuming success");
            resolve(true);
          } else {
            console.warn("⚠️ Upload timeout");
            resolve(false);
          }
          return;
        }

        // Continue checking
        setTimeout(checkUpload, 500);
      };

      // Start checking after a short delay
      setTimeout(checkUpload, 1000);
    });
  }

  /**
   * Generate resume filename from user details
   */
  generateResumeFileName(userDetails, fileUrl) {
    try {
      let extension = ".pdf";
      if (fileUrl) {
        const urlLower = fileUrl.toLowerCase();
        if (urlLower.includes(".docx")) extension = ".docx";
        else if (urlLower.includes(".doc")) extension = ".doc";
      }

      const firstName = userDetails?.firstName?.trim() || "Resume";
      const lastName = userDetails?.lastName?.trim() || "";

      const cleanFirst = firstName.replace(/[^\w]/g, "");
      const cleanLast = lastName.replace(/[^\w]/g, "");

      return `${cleanFirst}_${cleanLast}_Resume${extension}`;
    } catch (error) {
      return `Resume_${Date.now()}.pdf`;
    }
  }

  /**
   * Wait utility
   */
  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default WorkdayFileHandler;
