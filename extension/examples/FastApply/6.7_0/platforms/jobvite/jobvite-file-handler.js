// platforms/jobvite/jobvite-file-handler.js - Jobvite file upload handler
// Following Ashby pattern with tailored resume generation, resume matching, and cover letter generation

import { fetchFile } from "../../shared/utilities/fetch-file.js";

export class JobviteFileHandler {
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
   * Handle all file uploads in the Jobvite form
   */
  async handleFileUploads(form, userDetails, jobDescription, jobTitle) {
    try {
      if (!form || !userDetails) {
        return false;
      }

      // Jobvite uses a "Select" button that opens a dropdown for file upload
      // The actual file input is hidden
      const resumeSection = form.querySelector("#attachResume");
      let success = false;

      if (resumeSection) {
        success = await this.handleResumeUpload(
          resumeSection,
          userDetails,
          jobDescription,
          jobTitle
        );
      }

      // Handle cover letter if present
      const coverLetterButton = form.querySelector(
        'button[aria-label="Add Cover Letter"]'
      );
      if (coverLetterButton && jobDescription) {
        await this.handleCoverLetterUpload(
          coverLetterButton,
          userDetails,
          jobDescription
        );
      }

      return success;
    } catch (error) {
      console.error("Error handling Jobvite file uploads:", error);
      return false;
    }
  }

  /**
   * Handle resume upload with AI optimization
   */
  async handleResumeUpload(resumeSection, userDetails, jobDescription, jobTitle) {
    try {
      const fileUrls = this.getFileUrls(userDetails, "resume");

      if (!fileUrls || fileUrls.length === 0) {
        console.warn("No resume URLs found in user profile");
        return false;
      }

      // Check preferences for custom resume generation
      if (this.preferences?.useCustomResume === true) {
        return await this.generateAndUploadCustomResume(
          resumeSection,
          userDetails,
          jobDescription,
          fileUrls,
          jobTitle
        );
      } else {
        return await this.matchAndUploadResume(
          resumeSection,
          userDetails,
          jobDescription,
          fileUrls
        );
      }
    } catch (error) {
      console.error("Error handling resume upload:", error);
      return false;
    }
  }

  /**
   * Generate and upload custom tailored resume for the job
   */
  async generateAndUploadCustomResume(
    resumeSection,
    userDetails,
    jobDescription,
    fileUrls,
    jobTitle
  ) {
    try {
      if (userDetails?.jwtToken) {
        this.jwtToken = userDetails.jwtToken;
      }

      let generateURL =
        this.preferences?.resumeType === "docx"
          ? `${this.backendApiHost}/api/v1/resume-builder/generate`
          : `https://resumify.fastapply.co/api/generate-resume-pdf`;

      const parseURL = `${this.backendApiHost}/api/v1/resumes/extract-text`;
      const optimizeURL = `${this.backendApiHost}/api/v1/resume-builder/optimize-ats`;

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

      // Step 3: Optimize Resume for ATS
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
        throw new Error(`Optimize Resume Failed: ${optimizeResponse.status}`);
      }

      const resumeData = await optimizeResponse.json();
      let generateResponse;

      // Step 4: Generate Resume PDF/DOCX
      if (this.preferences?.resumeType === "docx") {
        generateResponse = await fetch(generateURL, {
          method: "POST",
          headers: this.getAuthHeaders(),
          body: JSON.stringify({
            template: `${this.preferences.resumeTemplate}_template`,
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
            template: this.preferences?.resumeTemplate,
          }),
        });
      }

      if (!generateResponse.ok) {
        throw new Error(`Generate Resume Failed: ${generateResponse.status}`);
      }

      const blob = await generateResponse.blob();
      if (blob.size === 0) {
        throw new Error("Generated resume file is empty");
      }

      const fileName = this.generateResumeFileName(userDetails, blob.type);
      return await this.uploadBlobToJobvite(resumeSection, blob, fileName);
    } catch (error) {
      console.error("Error generating custom resume:", error);
      // Fallback to uploading original resume
      return await this.uploadFileFromUrl(
        resumeSection,
        fileUrls[0].fileUrl,
        userDetails
      );
    }
  }

  /**
   * Match best resume and upload it
   */
  async matchAndUploadResume(
    resumeSection,
    userDetails,
    jobDescription,
    fileUrls
  ) {
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

      return await this.uploadFileFromUrl(
        resumeSection,
        resumeToUploadUrl,
        userDetails
      );
    } catch (error) {
      console.error("Error uploading resume:", error);
      return await this.uploadFileFromUrl(
        resumeSection,
        fileUrls[0]?.fileUrl,
        userDetails
      );
    }
  }

  /**
   * Handle cover letter upload - generate tailored cover letter
   */
  async handleCoverLetterUpload(buttonElement, userDetails, jobDescription) {
    try {
      return await this.generateAndUploadCoverLetter(
        buttonElement,
        userDetails,
        jobDescription
      );
    } catch (error) {
      console.error("Error handling cover letter upload:", error);
      return false;
    }
  }

  /**
   * Generate and upload tailored cover letter PDF
   */
  async generateAndUploadCoverLetter(
    buttonElement,
    userDetails,
    jobDescription
  ) {
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
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(letterData),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to generate cover letter: ${response.status}`);
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error("Generated cover letter is empty");
      }

      // Click the Add Cover Letter button to open the dropdown
      buttonElement.click();
      await this.wait(600);

      // Find the dropdown that appeared (should be visible after clicking)
      const dropdownContainer = document.querySelector(
        '.jv-add-attachment-item:not(.ng-hide), [ng-show="visible.fileUpload"]:not(.ng-hide)'
      );

      let fileInput = null;

      if (dropdownContainer) {
        // Click the "File" label inside the dropdown
        const fileLabel = dropdownContainer.querySelector(
          "label[jv-file-input], label.jv-text-link"
        );
        if (fileLabel) {
          fileLabel.click();
          await this.wait(300);
        }

        // Find the file input inside the dropdown
        fileInput = dropdownContainer.querySelector('input[type="file"]');
      }

      // Fallback: search for any cover letter file input nearby
      if (!fileInput) {
        fileInput = document.querySelector(
          'button[aria-label="Add Cover Letter"] ~ * input[type="file"]'
        );
      }

      // Another fallback: look for file inputs with cover letter in parent structure
      if (!fileInput) {
        const allFileInputs = document.querySelectorAll('input[type="file"]');
        for (const input of allFileInputs) {
          const parent = input.closest('[on-success*="addCoverLetter"]');
          if (parent) {
            fileInput = input;
            break;
          }
        }
      }

      if (!fileInput) {
        // Final fallback: find any visible file input
        const allInputs = document.querySelectorAll('input[type="file"]');
        for (const input of allInputs) {
          if (!this.processedInputs.has(input.id || input)) {
            fileInput = input;
            break;
          }
        }
      }

      if (!fileInput) {
        console.error("File input not found for cover letter");
        return false;
      }

      // Upload the cover letter
      const fileName = this.generateCoverLetterFileName(userDetails);
      const file = new File([blob], fileName, {
        type: "application/pdf",
        lastModified: Date.now(),
      });

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;

      // Trigger change events
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));

      // Trigger Angular's change handler if available
      if (window.angular) {
        try {
          const scope = window.angular.element(fileInput).scope();
          if (scope && scope.change) {
            scope.change();
          }
        } catch (e) {
          // Angular not available
        }
      }

      // Mark as processed
      this.processedInputs.add(fileInput.id || fileInput);

      await this.wait(1000);
      console.log("✅ Cover letter uploaded successfully");
      return true;
    } catch (error) {
      console.error("Error generating cover letter:", error);
      return false;
    }
  }

  /**
   * Upload file from URL to Jobvite
   */
  async uploadFileFromUrl(resumeSection, fileUrl, userDetails = null) {
    try {
      if (!fileUrl) {
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

      const fileName = this.generateResumeFileName(userDetails, blob.type);
      return await this.uploadBlobToJobvite(resumeSection, blob, fileName);
    } catch (error) {
      console.error("Error uploading file from URL:", error);
      return false;
    }
  }

  /**
   * Upload blob to Jobvite via their file input mechanism
   */
  async uploadBlobToJobvite(resumeSection, blob, fileName) {
    try {
      // Step 1: Click the "Select" button to open dropdown
      const selectButton = resumeSection.querySelector(
        'button[jv-add-attachment], button[aria-haspopup="true"]'
      );

      if (!selectButton) {
        console.error("Select button not found");
        return false;
      }

      selectButton.click();
      await this.wait(500);

      // Step 2: Wait for dropdown and click "File" option
      const attachmentDropdown = document.querySelector("#attachmentDropdown");
      if (!attachmentDropdown) {
        console.error("Attachment dropdown not found");
        return false;
      }

      const fileLabel = attachmentDropdown.querySelector(
        "label[jv-file-input], .jv-add-attachment-item label"
      );
      if (fileLabel) {
        fileLabel.click();
        await this.wait(300);
      }

      // Step 3: Find the hidden file input
      const fileInput =
        attachmentDropdown.querySelector('input[type="file"]') ||
        document.querySelector('#attachResume input[type="file"]');

      if (!fileInput) {
        console.error("File input not found");
        return false;
      }

      // Create File object from blob
      const file = new File([blob], fileName, {
        type: blob.type || "application/pdf",
        lastModified: Date.now(),
      });

      // Set the file on the input
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;

      // Trigger change events
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));

      // Angular-specific: trigger scope change
      if (window.angular) {
        const angularElement = window.angular.element(fileInput);
        if (angularElement.scope) {
          const scope = angularElement.scope();
          if (scope && scope.change) {
            scope.change();
          }
        }
      }

      await this.wait(1000);

      // Verify upload
      const fileList = resumeSection.querySelector(".jv-file-list li");
      if (fileList) {
        console.log("✅ Resume uploaded successfully to Jobvite");
        return true;
      }

      // Check Angular scope for resumeName
      if (window.angular) {
        const scope = window.angular.element(resumeSection).scope();
        if (scope?.resumeName) {
          console.log("✅ Resume uploaded successfully (verified via scope)");
          return true;
        }
      }

      return true;
    } catch (error) {
      console.error("Error uploading blob to Jobvite:", error);
      return false;
    }
  }

  /**
   * Upload blob via the attachment dropdown (for cover letter/portfolio)
   */
  async uploadBlobViaDropdown(blob, fileName) {
    try {
      const attachmentDropdown = document.querySelector(
        ".jv-add-attachment:not(#attachmentDropdown)"
      );

      let fileInput;
      if (attachmentDropdown) {
        const fileLabel = attachmentDropdown.querySelector(
          "label[jv-file-input]"
        );
        if (fileLabel) fileLabel.click();
        await this.wait(300);
        fileInput = attachmentDropdown.querySelector('input[type="file"]');
      }

      if (!fileInput) {
        fileInput = document.querySelector(
          '.jv-additional-files input[type="file"]'
        );
      }

      if (!fileInput) {
        console.error("File input not found for cover letter");
        return false;
      }

      const file = new File([blob], fileName, {
        type: blob.type || "application/pdf",
      });

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));

      await this.wait(1000);
      return true;
    } catch (error) {
      console.error("Error uploading via dropdown:", error);
      return false;
    }
  }

  /**
   * Get file URLs from user details
   */
  getFileUrls(userDetails, fileType) {
    if (!userDetails) return [];

    if (fileType === "resume") {
      // Check various possible locations for resume URLs
      if (userDetails.resumeUrls && userDetails.resumeUrls.length > 0) {
        return userDetails.resumeUrls;
      }
      if (userDetails.resumes && userDetails.resumes.length > 0) {
        return userDetails.resumes.map((r) => ({
          fileUrl: r.fileUrl || r.url || r,
        }));
      }
      if (userDetails.resumeUrl) {
        return [{ fileUrl: userDetails.resumeUrl }];
      }
    }

    if (fileType === "coverLetter") {
      if (userDetails.coverLetterUrl) {
        return [{ fileUrl: userDetails.coverLetterUrl }];
      }
    }

    return [];
  }

  /**
   * Generate resume filename
   */
  generateResumeFileName(userDetails, mimeType = "application/pdf") {
    try {
      const firstName = userDetails?.firstName?.trim() || "FirstName";
      const lastName = userDetails?.lastName?.trim() || "LastName";
      const cleanFirst = firstName.replace(/[^\w]/g, "");
      const cleanLast = lastName.replace(/[^\w]/g, "");
      const extension = mimeType?.includes("docx") ? "docx" : "pdf";
      return `${cleanFirst}_${cleanLast}_Resume.${extension}`;
    } catch {
      return `Resume_${Date.now()}.pdf`;
    }
  }

  /**
   * Generate cover letter filename
   */
  generateCoverLetterFileName(userDetails) {
    try {
      const firstName = userDetails?.firstName?.trim() || "FirstName";
      const lastName = userDetails?.lastName?.trim() || "LastName";
      const cleanFirst = firstName.replace(/[^\w]/g, "");
      const cleanLast = lastName.replace(/[^\w]/g, "");
      return `${cleanFirst}_${cleanLast}_Cover_Letter.pdf`;
    } catch {
      return `Cover_Letter_${Date.now()}.pdf`;
    }
  }

  /**
   * Wait helper
   */
  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
