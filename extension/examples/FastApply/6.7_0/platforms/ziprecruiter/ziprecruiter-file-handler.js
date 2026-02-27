// platforms/ziprecruiter/ziprecruiter-file-handler.js

import { fetchFile } from "../../shared/utilities/fetch-file.js";

export default class ZipRecruiterFileHandler {
  constructor(config) {
    this.backendApiHost = config.backendApiHost;
    this.aiApiHost = config.aiApiHost;
    this.jwtToken = config.jwtToken;
    this.preferences = config.preferences || {};
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
   * Main entry point for handling file uploads in ZipRecruiter forms
   */
  async handleFileUpload(fileInput, userDetails, jobDescription, currentPreferences = null) {
    try {
      if (!fileInput) {
        return false;
      }

      // Get resume URLs
      let fileUrls = this.getFileUrls(userDetails);

      if (!fileUrls || fileUrls.length === 0) {
        return false;
      }

      // Handle resume uploads with tailored generation
      if (jobDescription) {
        return await this.uploadFileFromURL(
          fileInput,
          fileUrls,
          userDetails,
          jobDescription,
          currentPreferences
        );
      }

      // Fallback to simple file upload
      return await this.uploadFileFromUrl(fileInput, fileUrls[0], userDetails);
    } catch (error) {
      return false;
    }
  }

  /**
   * Upload file from URL with tailored resume generation support
   */
  /**
   * Upload file from URL with tailored resume generation support
   */
  async uploadFileFromURL(fileInput, fileUrls, userDetails, jobDescription, currentPreferences = null) {
    try {
      const jobPreferences = currentPreferences;

      if (jobPreferences.useCustomResume === true) {
        const [parseURL, optimizeURL, generateURL] = [
          `${this.backendApiHost}/api/v1/resumes/extract-text`,
          `${this.backendApiHost}/api/v1/resume-builder/optimize-ats`,
          `${this.backendApiHost}/api/v1/resume-builder/generate`,
        ];

        const resumeUrl = typeof fileUrls[fileUrls.length - 1] === 'string'
          ? fileUrls[fileUrls.length - 1]
          : fileUrls[fileUrls.length - 1].fileUrl;

        const fileResponse = await fetchFile(resumeUrl);
        if (!fileResponse.ok) {
          throw new Error(`Failed to download resume file: ${fileResponse.status}`);
        }

        const resumeBlob = await fileResponse.blob();
        const resumeFileName = this.extractFileNameFromUrl(resumeUrl);
        const resumeFile = new File([resumeBlob], resumeFileName, {
          type: resumeBlob.type || 'application/pdf'
        });

        const formData = new FormData();
        formData.append('file', resumeFile);

        const parseResponse = await fetch(parseURL, {
          method: "POST",
          headers: this.getAuthHeaders(false),
          body: formData,
        });

        if (!parseResponse.ok) {
          throw new Error(`Parse Resume Failed: ${parseResponse.status}`);
        }

        const { text: parsedResumeText } = await parseResponse.json();

        const optimizeResponse = await fetch(optimizeURL, {
          method: "POST",
          headers: this.getAuthHeaders(),
          body: JSON.stringify({
            provider: "openai",
            resumeText: parsedResumeText,
            jobDescription: jobDescription || "",
            userData: userDetails
          }),
        });

        if (!optimizeResponse.ok) {
          throw new Error(`Optimize Resume Failed: ${optimizeResponse.status}`);
        }

        const resumeData = await optimizeResponse.json();

        // Step 4: Generate Resume PDF/DOCX
        const generateResponse = await fetch(generateURL, {
          method: "POST",
          headers: this.getAuthHeaders(),
          body: JSON.stringify({
            template: "galaxy_template",
            data: resumeData.data,
          }),
        });

        if (!generateResponse.ok) {
          throw new Error(`Generate Resume Failed: ${generateResponse.status}`);
        }

        // The response is the PDF/DOCX content
        const blob = await generateResponse.blob();

        // Detect the actual content type from the response
        const contentType = generateResponse.headers.get('content-type') || blob.type;

        // Determine file extension based on content type
        let fileExtension = '.docx';
        let mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

        if (contentType.includes('application/pdf')) {
          fileExtension = '.pdf';
          mimeType = 'application/pdf';
        } else if (contentType.includes('msword') || contentType.includes('wordprocessingml')) {
          fileExtension = '.docx';
          mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        }

        // Generate filename with correct extension
        const baseFileName = this.generateResumeFileName(userDetails).replace(/\.(pdf|docx)$/i, '');
        const fileName = `${baseFileName}${fileExtension}`;

        const file = new File([blob], fileName, {
          type: mimeType,
          lastModified: Date.now(),
        });

        if (file.size === 0) {
          throw new Error(`Generated ${fileExtension.toUpperCase().slice(1)} file is empty`);
        }

        console.log(`✅ Generated resume: ${fileName} (${mimeType})`);

        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
      } else {
        // Find primary resume, fall back to first resume if no primary is set
        const primaryResume = fileUrls.find(url => typeof url === 'object' && url?.isPrimary);
        const bestResumeUrl = primaryResume?.fileUrl ||
          (typeof fileUrls[0] === 'string' ? fileUrls[0] : fileUrls[0]?.fileUrl);

        if (!bestResumeUrl) {
          throw new Error("No valid resume URL found");
        }

        const response = await fetchFile(bestResumeUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.statusText}`);
        }

        const blob = await response.blob();
        let filename = this.generateResumeFileName(userDetails);

        const contentDisposition = response.headers.get("content-disposition");
        if (contentDisposition) {
          const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(
            contentDisposition
          );
          if (matches?.[1]) {
            filename = matches[1].replace(/['"]/g, "");
          }
        }

        // Create file object
        const file = new File([blob], filename, {
          type: blob.type || "application/pdf",
          lastModified: Date.now(),
        });

        if (file.size === 0) {
          throw new Error("Created file is empty");
        }

        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
      }

      await this.dispatchFileEvents(fileInput);

      await this.sleep(1000);

      return true;
    } catch (error) {
      console.error("Upload error:", error);
      try {
        fileInput.value = "";
      } catch (e) {
        // Ignore cleanup errors
      }
      return false;
    }
  }

  /**
   * Simple file upload from URL (fallback method)
   */
  async uploadFileFromUrl(fileInput, fileUrl, userDetails = null) {

    try {
      if (!fileUrl) {
        return false;
      }

      const url = typeof fileUrl === 'string' ? fileUrl : fileUrl.fileUrl;

      const response = await fetchFile(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }

      const blob = await response.blob();

      if (!blob || blob.size === 0) {
        throw new Error("Downloaded file is empty");
      }

      // Generate proper filename
      const fileName = userDetails
        ? this.generateResumeFileName(userDetails)
        : this.extractFileNameFromUrl(url);

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

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Dispatch file input events to notify ZipRecruiter's handlers
   */
  async dispatchFileEvents(fileInput) {
    const events = ["focus", "click", "change", "input"];
    for (const eventName of events) {
      await this.sleep(100);
      fileInput.dispatchEvent(new Event(eventName, { bubbles: true }));
    }
  }

  /**
   * Get file URLs from user details
   */
  getFileUrls(userDetails) {
    // Get resume URLs directly from resumes array
    if (!userDetails?.resumes || !Array.isArray(userDetails.resumes) || userDetails.resumes.length === 0) {
      console.error("No resumes found in user details");
      return null;
    }

    // Map all resumes to their file URLs
    const fileUrls = userDetails.resumes
      .filter(resume => resume?.fileUrl)
      .map(resume => ({ fileUrl: resume.fileUrl }));

    return fileUrls.length > 0 ? fileUrls : null;
  }

  /**
   * Generate proper resume filename based on user details
   */
  generateResumeFileName(userDetails) {
    try {
      const firstName = userDetails?.firstName?.trim() || "FirstName";
      const lastName = userDetails?.lastName?.trim() || "LastName";

      // Clean names and format as "FirstName_LastName_Resume.docx"
      const cleanFirstName = firstName.replace(/[^\w]/g, "");
      const cleanLastName = lastName.replace(/[^\w]/g, "");

      return `${cleanFirstName}_${cleanLastName}_Resume.docx`;
    } catch (error) {
      return `Resume_${Date.now()}.docx`;
    }
  }

  /**
   * Extract filename from URL
   */
  extractFileNameFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const fileName = pathname.split("/").pop();
      return fileName || "resume.pdf";
    } catch (error) {
      return "resume.pdf";
    }
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
