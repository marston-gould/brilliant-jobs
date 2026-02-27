import { notifyStatus } from "../../utils/status-helper.js";
import { fetchFile } from "../../shared/utilities/fetch-file.js";

export class ReedFileHandler {
  constructor(config = {}) {
    this.preferences = config.preferences;
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

  async handleFileUploads(container, userDetails, jobDescription) {
    console.log("📂 ReedFileHandler: Starting file upload process");
    try {
      if (!container) {
        console.warn("⚠️ ReedFileHandler: No container provided");
        return false;
      }
      if (!userDetails) {
        console.warn("⚠️ ReedFileHandler: No userDetails provided");
        return false;
      }
      if (this.isUploading) {
        console.warn("⚠️ ReedFileHandler: Already uploading");
        return false;
      }

      this.isUploading = true;

      // Find the file input - Reed uses data-qa="drop-input"
      const fileInput = container.querySelector(
        'input[data-qa="drop-input"], input[type="file"]'
      );
      console.log("📂 ReedFileHandler: File input found:", !!fileInput);

      if (fileInput) {
        console.log(
          "📂 ReedFileHandler: Input accept attribute:",
          fileInput.accept
        );
        const success = await this.handleResumeUpload(
          fileInput,
          userDetails,
          jobDescription,
          container
        );
        this.isUploading = false;
        console.log("📂 ReedFileHandler: Upload result:", success);
        return success;
      }

      this.isUploading = false;
      console.warn("⚠️ ReedFileHandler: No file input found in container");
      return false;
    } catch (error) {
      this.isUploading = false;
      console.error("❌ ReedFileHandler: File upload process failed:", error);
      return false;
    }
  }

  async handleResumeUpload(fileInput, userDetails, jobDescription, container) {
    console.log("📂 ReedFileHandler: Handling resume upload");
    try {
      const fileUrls = this.getFileUrls(userDetails, "resume");
      console.log(
        "📂 ReedFileHandler: Found resume URLs:",
        fileUrls?.length || 0
      );

      if (!fileUrls || fileUrls.length === 0) {
        console.warn(
          "⚠️ ReedFileHandler: No resume files found in userDetails"
        );
        return false;
      }

      return await this.matchAndUploadResume(
        fileInput,
        userDetails,
        jobDescription,
        fileUrls,
        container
      );
    } catch (error) {
      console.error("❌ ReedFileHandler: Resume upload error:", error);
      return false;
    }
  }

  getFileUrls(userDetails, type) {
    if (!userDetails || !userDetails.files) return [];
    return userDetails.files.filter((f) => f.type === type);
  }

  async matchAndUploadResume(
    fileInput,
    userDetails,
    jobDescription,
    fileUrls,
    container
  ) {
    console.log("📂 ReedFileHandler: Uploading resume");
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

      console.log("📂 ReedFileHandler: Using resume:", resumeToUploadUrl);

      return await this.uploadFileFromUrl(
        fileInput,
        resumeToUploadUrl,
        userDetails,
        container
      );
    } catch (error) {
      console.error("❌ ReedFileHandler: Match and upload error:", error);
      // Fallback
      return await this.uploadFileFromUrl(
        fileInput,
        fileUrls[0].fileUrl,
        userDetails,
        container
      );
    }
  }

  async uploadFileFromUrl(
    fileInput,
    fileUrl,
    userDetails = null,
    container = null
  ) {
    console.log(
      "📂 ReedFileHandler: Uploading file from URL:",
      fileUrl?.substring(0, 50) + "..."
    );
    try {
      if (!fileUrl || !fileInput) {
        console.warn("⚠️ ReedFileHandler: Missing fileUrl or fileInput");
        return false;
      }

      // Use fetchFile to fetch the file (handles CORS via background SW)
      console.log("📂 ReedFileHandler: Fetching via fetchFile...");
      const response = await fetchFile(fileUrl);

      if (!response.ok) {
        console.error(
          "❌ ReedFileHandler: Failed to fetch file:",
          response.status
        );
        throw new Error(`Failed to fetch file: ${response.status}`);
      }

      const blob = await response.blob();
      console.log(
        "📂 ReedFileHandler: File fetched, size:",
        blob.size,
        "type:",
        blob.type
      );

      if (blob.size === 0) {
        console.error("❌ ReedFileHandler: Downloaded file is empty");
        throw new Error("Downloaded file is empty");
      }

      const fileName = this.generateResumeFileName(userDetails, fileUrl);
      console.log("📂 ReedFileHandler: Generated filename:", fileName);

      return await this.uploadBlob(
        fileInput,
        blob,
        fileName,
        userDetails,
        container
      );
    } catch (error) {
      console.error("❌ ReedFileHandler: Upload from URL failed:", error);
      return false;
    }
  }

  async uploadBlob(
    fileInput,
    blob,
    originalFileName,
    userDetails = null,
    container = null
  ) {
    console.log("📂 ReedFileHandler: Uploading blob...");
    try {
      if (blob.size === 0) throw new Error("File is empty");

      const fileName = originalFileName;

      // Determine the correct MIME type
      let mimeType = blob.type;
      if (!mimeType || mimeType === "application/octet-stream") {
        // Detect from filename
        if (fileName.endsWith(".pdf")) {
          mimeType = "application/pdf";
        } else if (fileName.endsWith(".docx")) {
          mimeType =
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        } else if (fileName.endsWith(".doc")) {
          mimeType = "application/msword";
        } else {
          mimeType = "application/pdf"; // Default
        }
      }
      console.log("📂 ReedFileHandler: Using MIME type:", mimeType);

      const file = new File([blob], fileName, {
        type: mimeType,
        lastModified: Date.now(),
      });
      console.log(
        "📂 ReedFileHandler: Created File object:",
        file.name,
        file.size,
        file.type
      );

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      console.log(
        "📂 ReedFileHandler: Set files on input, count:",
        fileInput.files.length
      );

      // Dispatch multiple events to trigger React handlers
      await this.dispatchFileEvents(fileInput, file, container);

      // Wait for upload success indicator
      console.log("📂 ReedFileHandler: Waiting for upload confirmation...");
      const success = await this.waitForUploadProcess(fileInput);
      console.log("📂 ReedFileHandler: Upload process result:", success);

      return success;
    } catch (error) {
      console.error("❌ ReedFileHandler: Blob upload failed:", error);
      return false;
    }
  }

  async dispatchFileEvents(fileInput, file, container) {
    console.log("📂 ReedFileHandler: Dispatching file events...");

    // Standard events
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Find the drop zone element (Reed uses a specific drop zone)
    const dropZone =
      container?.querySelector(".update-cv-modal_uploadBlock__MaI6_") ||
      container?.querySelector('[role="presentation"]') ||
      fileInput.closest('[role="presentation"]');

    if (dropZone) {
      console.log(
        "📂 ReedFileHandler: Found drop zone, dispatching drop events"
      );

      // Create a proper DataTransfer for drop event
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // Dispatch drag/drop events on the drop zone
      const dragEnterEvent = new DragEvent("dragenter", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer,
      });
      dropZone.dispatchEvent(dragEnterEvent);

      const dragOverEvent = new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer,
      });
      dropZone.dispatchEvent(dragOverEvent);

      const dropEvent = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer,
      });
      dropZone.dispatchEvent(dropEvent);

      console.log("📂 ReedFileHandler: Drop events dispatched");
    } else {
      console.log(
        "📂 ReedFileHandler: No drop zone found, using input events only"
      );
    }

    // Small delay to let React process the events
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  async waitForUploadProcess(fileInput, timeout = 30000) {
    console.log("📂 ReedFileHandler: Waiting for upload process...");
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkUpload = () => {
        const elapsed = Date.now() - startTime;

        // Check for success alert - Reed shows "CV Uploaded" message
        const successAlert = document.querySelector(
          ".upload-cv-alert-block_alert__vMSeY"
        );
        const alertSuccess = document.querySelector(".alert-success");

        // Also check for updated CV name display (indicates upload succeeded)
        const cvNameUpdated = document.querySelector(
          '[data-qa="cv-name-card"]'
        );

        if (successAlert && successAlert.textContent.includes("CV Uploaded")) {
          console.log("✅ ReedFileHandler: CV Uploaded success alert detected");
          resolve(true);
          return;
        }

        if (
          alertSuccess &&
          alertSuccess.textContent.toLowerCase().includes("uploaded")
        ) {
          console.log("✅ ReedFileHandler: Upload success alert detected");
          resolve(true);
          return;
        }

        // Check if the upload modal closed (indicates success)
        const uploadModal = document.querySelector(
          '[data-qa="upload-cv-modal"]'
        );
        if (!uploadModal && elapsed > 3000) {
          console.log(
            "✅ ReedFileHandler: Upload modal closed, assuming success"
          );
          resolve(true);
          return;
        }

        if (elapsed > timeout) {
          console.warn("⚠️ ReedFileHandler: Upload timeout reached");
          resolve(false);
          return;
        }

        setTimeout(checkUpload, 500);
      };

      checkUpload();
    });
  }

  extractFileNameFromUrl(url) {
    try {
      if (!url) return `resume_${Date.now()}.pdf`;
      const urlObj = new URL(url);
      let fileName = urlObj.pathname.split("/").pop();
      if (!fileName.includes(".")) fileName += ".pdf";
      return fileName;
    } catch (e) {
      return `resume_${Date.now()}.pdf`;
    }
  }

  generateResumeFileName(userDetails, originalFileUrl) {
    // Extract extension from original URL
    let ext = "pdf";
    try {
      const urlPath = new URL(originalFileUrl).pathname;
      const urlExt = urlPath.split(".").pop()?.toLowerCase();
      if (["pdf", "docx", "doc", "txt", "odt", "rtf"].includes(urlExt)) {
        ext = urlExt;
      }
    } catch (e) {
      // Keep default pdf
    }

    const firstName = userDetails?.firstName || "User";
    const lastName = userDetails?.lastName || "Resume";
    const name = `${firstName}_${lastName}`.replace(/\s+/g, "_");
    return `${name}_Resume.${ext}`;
  }
}
