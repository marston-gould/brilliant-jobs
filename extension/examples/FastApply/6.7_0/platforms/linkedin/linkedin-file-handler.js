// platforms/linkedin/linkedin-file-handler.js

import { fetchFile } from "../../shared/utilities/fetch-file.js";

export default class LinkedInFileHandler {
  constructor(config) {
    this.backendApiHost = config.backendApiHost;
    this.aiApiHost = config.aiApiHost;
    this.jwtToken = config.jwtToken;
  }

  getAuthHeaders() {
    const headers = {
      "Content-Type": "application/json",
    };
    if (this.jwtToken) {
      headers["Authorization"] = `Bearer ${this.jwtToken}`;
    }
    return headers;
  }

  async uploadCoverLetterPDF(fileInput, letterData, userDetails = null) {
    if (!fileInput) {
      return false;
    }

    try {
      // Call your Flask endpoint to generate the PDF
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
          `Failed to generate PDF: ${response.status} - ${errorData.error || "Unknown error"
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
      return false;
    }
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

      // Dispatch events to trigger the upload process
      const changeEvent = new Event("change", { bubbles: true });
      fileInput.dispatchEvent(changeEvent);

      const inputEvent = new Event("input", { bubbles: true });
      fileInput.dispatchEvent(inputEvent);

      // Focus and blur to ensure all handlers are triggered
      fileInput.focus();
      await new Promise((resolve) => setTimeout(resolve, 50));
      fileInput.blur();

      // check if upload is success and return true
      const uploadSuccess = await this.waitForUploadProcess(fileInput);
      return uploadSuccess;
    } catch (error) {
      return false;
    }
  }

  async handleFileUpload(
    container,
    userDetails,
    jobDescription,
    currentPreferences = null,
    jobId,
    jobTitle
  ) {
    try {
      const fileInput = container.querySelector('input[type="file"]');
      if (!fileInput) {
        return false;
      }

      const fileType = this.determineFileType(container);
      let fileUrls = this.getFileUrls(userDetails, fileType);

      if (!fileUrls || fileUrls.length === 0) {
        return false;
      }

      // Handle resume uploads with tailored generation
      if (fileType === "resume" && jobDescription) {
        return await this.uploadFileFromURL(
          fileInput,
          fileUrls,
          userDetails,
          jobDescription,
          currentPreferences,
          jobId,
          jobTitle
        );
      }

      // Handle cover letter uploads
      if (fileType === "coverLetter" && jobDescription) {
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
      }

      if (fileType === "photo") {
        return await this.uploadImageStandalone(fileInput, userDetails.image);
      }

      // Fallback to simple file upload
      return await this.uploadFileFromURL(
        fileInput,
        fileUrls,
        userDetails,
        jobDescription,
        currentPreferences,
        jobId,
        jobTitle
      );
    } catch (error) {
      return false;
    }
  }

  async uploadFileFromURL(
    fileInput,
    fileUrls,
    userDetails,
    jobDescription,
    currentPreferences = null,
    jobId,
    jobTitle
  ) {
    try {
      // Use current preferences if available, otherwise fall back to userDetails.jobPreferences
      const jobPreferences = currentPreferences;
      if (jobPreferences.useCustomResume === true) {
        let generateURL =
          jobPreferences.resumeType?.toLowerCase() === "docx"
            ? `${this.backendApiHost}/api/v1/resume-builder/generate`
            : `https://resumify.fastapply.co/api/generate-resume-pdf`;

        const [parseURL, optimizeURL] = [
          `${this.backendApiHost}/api/v1/resumes/extract-text`,
          `${this.backendApiHost}/api/v1/resume-builder/optimize-ats`,
        ];

        // Step 1: Download resume file via proxy
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
          body: formData,
        });

        if (!parseResponse.ok) {
          throw new Error(`Parse Resume Failed: ${parseResponse.status}`);
        }

        const { text: parsedResumeText } = await parseResponse.json();

        // Step 2: Optimize Resume
        const optimizeResponse = await fetch(optimizeURL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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

        // Step 4: Generate Resume (DOCX or PDF)
        const isDocx = jobPreferences.resumeType?.toLowerCase() === "docx";
        userDetails.author =
          userDetails.firstName + " " + userDetails.lastName;
        if (isDocx) {
          generateResponse = await fetch(generateURL, {
            method: "POST",
            headers: this.getAuthHeaders(),
            body: JSON.stringify({
              template: `${jobPreferences.resumeTemplate}_template`,
              data: resumeData.data,
            }),
          });
        } else {
          // PDF generation
          generateResponse = await fetch(generateURL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_data: userDetails,
              resume_data: resumeData.data,
              template: jobPreferences.resumeTemplate,
            }),
          });
        }

        if (!generateResponse.ok) {
          throw new Error(`Generate Resume Failed: ${generateResponse.status}`);
        }

        // The response is already the PDF content, not JSON
        const blob = await generateResponse.blob();
        const fileName = `${userDetails.firstName + "_" + userDetails.lastName || "resume"
          }.${blob.type.split("/")[1] == "pdf" ? "pdf" : "docx"}`;

        const file = new File([blob], fileName, {
          type: blob.type,
          lastModified: Date.now(),
        });

        if (file.size === 0) {
          throw new Error("Generated DOCX file is empty");
        }

        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
      } else {
        // Use primary resume instead of matching with job description
        const primaryResume = fileUrls.find((resume) => resume.isPrimary);
        const highestRankedResume = primaryResume?.fileUrl || fileUrls[0]?.fileUrl;

        if (!highestRankedResume) {
          throw new Error("No resume URL found");
        }

        const response = await fetchFile(highestRankedResume);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.statusText}`);
        }

        const blob = await response.blob();
        let filename = this.generateResumeFileName(
          userDetails,
          highestRankedResume
        );

        // Get filename from Content-Disposition header
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
      await this.waitForUploadProcess(fileInput);
      return true;
    } catch (error) {
      try {
        fileInput.value = "";
      } catch (e) {
        return false;
      }
      return false;
    }
  }

  async dispatchFileEvents(fileInput) {
    // Trigger events to notify the page that a file has been selected
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async waitForUploadProcess(fileInput, timeout = 30000) {
    // Wait for the upload to complete or fail
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkUpload = () => {
        // Check for success or error indicators
        const container = fileInput.closest("form") || fileInput.parentElement;
        const successElement = container?.querySelector(
          ".artdeco-inline-feedback--success"
        );
        const errorElement = container?.querySelector(
          ".artdeco-inline-feedback--error"
        );

        if (successElement) {
          resolve(true);
        } else if (errorElement) {
          resolve(false);
        } else if (Date.now() - startTime > timeout) {
          resolve(true); // Assume success after timeout
        } else {
          setTimeout(checkUpload, 500);
        }
      };

      checkUpload();
    });
  }

  determineFileType(container) {
    const containerText = container.textContent.toLowerCase();
    const containerHTML = container.innerHTML.toLowerCase();

    if (
      containerText.includes("cover letter") ||
      containerHTML.includes("cover")
    ) {
      return "coverLetter";
    } else if (
      containerText.includes("resume") ||
      containerText.includes("cv")
    ) {
      return "resume";
    } else if (
      containerText.includes("photo") ||
      containerHTML.includes("image")
    ) {
      return "photo";
    }

    // Default to resume
    return "resume";
  }

  getFileUrls(userDetails, fileType) {
    switch (fileType) {
      case "resume":
        return userDetails.resumes;
      case "coverLetter":
        return userDetails.coverLetterUrl;
      case "photo":
        return userDetails.image;
      default:
        return userDetails.resumes;
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
      const firstName = userDetails?.firstName?.trim();
      const lastName = userDetails?.lastName?.trim();

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
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const fileName = pathname.split("/").pop();
      return fileName || "document.pdf";
    } catch (error) {
      return "document.pdf";
    }
  }
}
