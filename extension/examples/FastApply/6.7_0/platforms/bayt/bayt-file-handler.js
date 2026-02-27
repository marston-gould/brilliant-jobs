import { fetchFile } from "../../shared/utilities/fetch-file.js";

export default class BaytFileHandler {
  constructor(config = {}) {
    this.backendApiHost = config.backendApiHost;
    this.aiApiHost = config.aiApiHost;
    this.jwtToken = config.jwtToken;
    this.preferences = config.preferences;
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

  async handleFileUploads(form, userDetails, jobDescription) {
    try {
      if (!form) {
        console.log("No form provided for file uploads");
        return false;
      }

      console.log("Starting file upload handling for Bayt");

      // Find all file input fields in the form
      const fileInputs = form.querySelectorAll('input[type="file"]');
      console.log(`Found ${fileInputs.length} file input fields`);

      if (fileInputs.length === 0) {
        console.log("No file input fields found");
        return true; // Not an error, just no files to upload
      }

      for (const fileInput of fileInputs) {
        const fieldName = fileInput.name || fileInput.id || "unknown";
        console.log(`Processing file input: ${fieldName}`);

        try {
          // Determine what type of file to upload based on field name
          if (this.isResumeField(fieldName)) {
            await this.uploadResume(fileInput, userDetails, jobDescription);
          } else if (this.isCoverLetterField(fieldName)) {
            await this.uploadCoverLetter(fileInput, userDetails, jobDescription);
          } else {
            // Default to resume for unknown file fields
            await this.uploadResume(fileInput, userDetails, jobDescription);
          }
        } catch (error) {
          console.error(`Error uploading file for ${fieldName}:`, error);
          // Continue with other file inputs even if one fails
        }
      }

      console.log("File upload handling completed");
      return true;
    } catch (error) {
      console.error("Error in handleFileUploads:", error);
      return false;
    }
  }

  isResumeField(fieldName) {
    const fieldNameLower = fieldName.toLowerCase();
    return fieldNameLower.includes("resume") ||
           fieldNameLower.includes("cv") ||
           fieldNameLower.includes("curriculum");
  }

  isCoverLetterField(fieldName) {
    const fieldNameLower = fieldName.toLowerCase();
    return fieldNameLower.includes("cover") && fieldNameLower.includes("letter");
  }

  async uploadResume(fileInput, userDetails, jobDescription) {
    try {
      console.log("Uploading resume");

      // Get the best matching resume from user's profile
      const resumeUrl = await this.selectBestResume(userDetails, jobDescription);
      if (!resumeUrl) {
        console.log("No resume URL available");
        return false;
      }

      console.log(`Selected resume: ${resumeUrl}`);

      // Download the resume file through proxy
      const fileBlob = await this.downloadFile(resumeUrl);
      if (!fileBlob) {
        console.log("Failed to download resume");
        return false;
      }

      // Create a File object
      const fileName = this.extractFileNameFromUrl(resumeUrl) || "resume.pdf";
      const file = new File([fileBlob], fileName, { type: this.getFileType(fileName) });

      // Attach file to input
      await this.attachFileToInput(fileInput, file);

      console.log("Resume uploaded successfully");
      return true;
    } catch (error) {
      console.error("Error uploading resume:", error);
      return false;
    }
  }

  async uploadCoverLetter(fileInput, userDetails, jobDescription) {
    try {
      console.log("Uploading cover letter");

      // Generate cover letter PDF
      const coverLetterBlob = await this.generateCoverLetter(userDetails, jobDescription);
      if (!coverLetterBlob) {
        console.log("Failed to generate cover letter");
        return false;
      }

      // Create a File object
      const file = new File([coverLetterBlob], "cover-letter.pdf", { type: "application/pdf" });

      // Attach file to input
      await this.attachFileToInput(fileInput, file);

      console.log("Cover letter uploaded successfully");
      return true;
    } catch (error) {
      console.error("Error uploading cover letter:", error);
      return false;
    }
  }

  async selectBestResume(userDetails, jobDescription) {
    try {
      // If user has resumes, use the primary one
      if (userDetails.resumes && userDetails.resumes.length > 0) {
        // Find primary resume, fall back to first resume if no primary is set
        const primaryResume = userDetails.resumes.find(resume => resume.isPrimary);
        const selectedResume = primaryResume || userDetails.resumes[0];
        return selectedResume.fileUrl || selectedResume.url;
      }

      // Check for default resume URL in preferences
      if (this.preferences?.defaultResumeUrl) {
        return this.preferences.defaultResumeUrl;
      }

      console.log("No resume found in user details");
      return null;
    } catch (error) {
      console.error("Error selecting best resume:", error);
      return null;
    }
  }

  async downloadFile(fileUrl) {
    try {
      // Use fetchFile to download file (handles CORS via background SW)
      const response = await fetchFile(fileUrl);

      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
      }

      return await response.blob();
    } catch (error) {
      console.error("Error downloading file:", error);

      // Fallback: try direct download
      try {
        const response = await fetch(fileUrl);
        if (response.ok) {
          return await response.blob();
        }
      } catch (fallbackError) {
        console.error("Fallback download also failed:", fallbackError);
      }

      return null;
    }
  }

  async generateCoverLetter(userDetails, jobDescription) {
    try {
      if (!this.backendApiHost || !jobDescription) {
        console.log("Cannot generate cover letter: missing API host or job description");
        return null;
      }

      const response = await fetch(
        `${this.backendApiHost}/generate-cover-letter-pdf`,
        {
          method: "POST",
          headers: this.getAuthHeaders(),
          body: JSON.stringify({
            userData: userDetails,
            jobDescription: jobDescription,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to generate cover letter: ${response.status}`);
      }

      return await response.blob();
    } catch (error) {
      console.error("Error generating cover letter:", error);
      return null;
    }
  }

  async attachFileToInput(fileInput, file) {
    try {
      // Create a DataTransfer object to set files on the input
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // Set the files property of the input
      fileInput.files = dataTransfer.files;

      // Trigger change event
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));

      console.log(`Attached file to input: ${file.name}`);
      return true;
    } catch (error) {
      console.error("Error attaching file to input:", error);
      return false;
    }
  }

  extractFileNameFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const parts = pathname.split("/");
      return parts[parts.length - 1] || "document.pdf";
    } catch (error) {
      return "document.pdf";
    }
  }

  getFileType(fileName) {
    const extension = fileName.split(".").pop().toLowerCase();

    const mimeTypes = {
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      txt: "text/plain",
      rtf: "application/rtf",
    };

    return mimeTypes[extension] || "application/octet-stream";
  }

  async extractResumeText(file) {
    try {
      if (!this.backendApiHost) {
        console.log("Cannot extract resume text: missing API host");
        return null;
      }

      const formData = new FormData();
      formData.append("file", file);

      // CRITICAL: No Content-Type header for FormData - browser sets it automatically
      const response = await fetch(
        `${this.backendApiHost}/api/v1/resumes/extract-text`,
        {
          method: "POST",
          body: formData,
          headers: this.getAuthHeaders(false), // false = exclude Content-Type
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to extract resume text: ${response.status}`);
      }

      const result = await response.json();
      return result.text || null;
    } catch (error) {
      console.error("Error extracting resume text:", error);
      return null;
    }
  }

  async optimizeResumeForJob(resumeUrl, jobDescription) {
    try {
      if (!this.backendApiHost || !jobDescription) {
        console.log("Cannot optimize resume: missing API host or job description");
        return null;
      }

      const response = await fetch(
        `${this.backendApiHost}/api/v1/resume-builder/optimize-ats`,
        {
          method: "POST",
          headers: this.getAuthHeaders(),
          body: JSON.stringify({
            resumeUrl: resumeUrl,
            jobDescription: jobDescription,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to optimize resume: ${response.status}`);
      }

      const result = await response.json();
      return result.optimizedResumeUrl || null;
    } catch (error) {
      console.error("Error optimizing resume:", error);
      return null;
    }
  }
}
