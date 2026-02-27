// platforms/icims/icims-file-handler.js

import { notifyStatus } from "../../utils/status-helper.js";
import { fetchFile } from "../../shared/utilities/fetch-file.js";

export class IcimsFileHandler {
  constructor(config = {}) {
    this.preferences = config.preferences;
    this.backendApiHost = config.backendApiHost;
    this.aiApiHost = config.aiApiHost;
    this.jwtToken = config.jwtToken;
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
   * Upload resume to the iCIMS file input.
   * If useCustomResume preference is enabled, generates a tailored resume first.
   * iCIMS auto-submits the form on file change, causing a page reload
   * where resume data gets parsed and pre-fills profile fields.
   */
  async handleResumeUpload(fileInput, userDetails, jobDescription, jobId, jobTitle) {
    if (!fileInput) return false;

    if (userDetails?.jwtToken) {
      this.jwtToken = userDetails.jwtToken;
    }

    const resumes = userDetails.resumes || [];
    const primaryResume = resumes.find((r) => r.isPrimary);
    const resumeUrl = primaryResume?.fileUrl || resumes[0]?.fileUrl;

    if (!resumeUrl) {
      console.log("⚠️ No resume URL found in user profile");
      return false;
    }

    try {
      // Route to tailored resume if preference is enabled and we have a job description
      if (this.preferences?.useCustomResume === true && jobDescription) {
        return await this.generateAndUploadCustomResume(
          fileInput,
          userDetails,
          jobDescription,
          resumes,
          this.preferences,
          jobId,
          jobTitle
        );
      }

      // Standard upload
      return await this.uploadStandardResume(fileInput, userDetails, resumes);
    } catch (error) {
      console.error("Resume upload error:", error);
      return false;
    }
  }

  /**
   * Standard resume upload — fetch primary resume via proxy and upload to form.
   */
  async uploadStandardResume(fileInput, userDetails, fileUrls) {
    const primaryResume = fileUrls.find((r) => r.isPrimary);
    const resumeUrl = primaryResume?.fileUrl || fileUrls[0]?.fileUrl;
    if (!resumeUrl) return false;

    const blob = await this.fetchFileViaProxy(resumeUrl);
    if (!blob || blob.size === 0) {
      console.log("⚠️ Downloaded resume file is empty");
      return false;
    }

    const fileName = this.generateResumeFileName(userDetails, resumeUrl);
    await this.uploadBlob(fileInput, blob, fileName);
    return true;
  }

  /**
   * Generate a tailored resume using the AI pipeline, then upload it.
   * Flow: download original → parse text → optimize with job description → generate file → upload
   * Falls back to standard upload if any step fails.
   */
  async generateAndUploadCustomResume(fileInput, userDetails, jobDescription, fileUrls, preferences, jobId, jobTitle) {
    try {
      if (!this.backendApiHost || !this.aiApiHost) {
        throw new Error(`Missing API hosts — backendApiHost: ${this.backendApiHost}, aiApiHost: ${this.aiApiHost}`);
      }

      const parseURL = `${this.backendApiHost}/api/v1/resumes/extract-text`;
      const optimizeURL = `${this.backendApiHost}/api/v1/resume-builder/optimize-ats`;
      const generateURL =
        preferences.resumeType === "docx"
          ? `${this.backendApiHost}/api/v1/resume-builder/generate`
          : `https://resumify.fastapply.co/api/generate-resume-pdf`;

      // Step 1: Download the original resume via proxy
      const resumeFileUrl = fileUrls[fileUrls.length - 1]?.fileUrl || fileUrls[0]?.fileUrl;
      if (!resumeFileUrl) throw new Error("No resume file URL available");

      console.log("📄 Downloading resume via fetchFile...");
      const fileResponse = await fetchFile(resumeFileUrl);
      if (!fileResponse.ok) {
        throw new Error(`Failed to download resume file: ${fileResponse.status}`);
      }

      const resumeBlob = await fileResponse.blob();
      console.log(`📄 Resume downloaded: ${resumeBlob.size} bytes, type: ${resumeBlob.type}`);

      if (!resumeBlob || resumeBlob.size === 0) {
        throw new Error("Downloaded resume file is empty");
      }

      const resumeFileName = resumeFileUrl.split("/").pop() || "resume.pdf";
      const resumeFile = new File([resumeBlob], resumeFileName, {
        type: resumeBlob.type || "application/pdf",
      });

      // Step 2: Parse resume (extract text)
      console.log(`📄 Parsing resume text via ${parseURL}...`);
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

      // Step 3: Optimize resume with job description (AI-powered tailoring)
      console.log("🤖 Optimizing resume for job description...");
      const optimizeResponse = await fetch(optimizeURL, {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          provider: "openai",
          resumeText: parsedResumeText,
          jobDescription: jobDescription || "",
          jobTitle: jobTitle || "",
          userData: userDetails,
          jobId,
          userId: userDetails.userId,
        }),
      });

      if (!optimizeResponse.ok) {
        throw new Error(`Optimize resume failed: ${optimizeResponse.status}`);
      }

      const resumeData = await optimizeResponse.json();

      // Step 4: Generate resume in desired format (DOCX or PDF)
      console.log("📝 Generating tailored resume...");
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
        userDetails.author = `${userDetails.firstName || ""} ${userDetails.lastName || ""}`.trim();
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
        throw new Error(`Generate resume failed: ${generateResponse.status}`);
      }

      const blob = await generateResponse.blob();
      if (blob.size === 0) {
        throw new Error("Generated resume file is empty");
      }

      // Step 5: Upload to the file input
      const fileName = `${userDetails.firstName || "User"}_${userDetails.lastName || "Resume"}.${blob.type.includes("pdf") ? "pdf" : "docx"}`;
      console.log(`📎 Uploading tailored resume: ${fileName} (${blob.size} bytes)`);
      await this.uploadBlob(fileInput, blob, fileName);
      return true;
    } catch (error) {
      console.error("❌ Tailored resume generation failed, falling back to standard upload:", error);
      // Show updated status so user knows we're falling back
      notifyStatus({ type: "UPLOADING_FILES" });
      try {
        return await this.uploadStandardResume(fileInput, userDetails, fileUrls);
      } catch (fallbackError) {
        console.error("❌ Standard resume upload also failed:", fallbackError);
        return false;
      }
    }
  }

  async fetchFileViaProxy(fileUrl) {
    const response = await fetchFile(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status}`);
    }
    return response.blob();
  }

  /**
   * Set file on the input via DataTransfer API and dispatch change event.
   * The iCIMS onchange handler will auto-submit the form for resume parsing.
   */
  async uploadBlob(fileInput, blob, fileName) {
    const file = new File([blob], fileName, {
      type: blob.type || "application/pdf",
      lastModified: Date.now(),
    });

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;

    // Dispatch change event — iCIMS onchange auto-submits for resume parsing
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  generateResumeFileName(userDetails, fileUrl) {
    const firstName = userDetails.firstName || "User";
    const lastName = userDetails.lastName || "Resume";
    const ext = this.getFileExtension(fileUrl);
    return `${firstName}_${lastName}_Resume.${ext}`;
  }

  getFileExtension(url) {
    try {
      const path = new URL(url).pathname;
      const ext = path.split(".").pop().toLowerCase();
      if (["pdf", "doc", "docx", "rtf", "txt"].includes(ext)) return ext;
    } catch (e) {}
    return "pdf";
  }
}
