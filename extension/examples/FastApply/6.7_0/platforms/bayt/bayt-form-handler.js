import { AIService } from "../../services/index.js";

export default class BaytFormHandler {
  constructor(options = {}) {
    this.host = options.host;
    this.userData = options.userData || {};
    this.jobDescription = options.jobDescription || "";
    this.aiService = new AIService({ apiHost: this.host, platform: "bayt" });
    this.copilotMode = options.copilotMode || false;
    this.copilotState = options.copilotState || null;
  }

  async handleFormFilling(form) {
    try {
      if (!form) {
        console.log("No form provided");
        return false;
      }

      console.log("Starting form filling for Bayt");

      // Find all form fields
      const fields = form.querySelectorAll("input, textarea, select");
      console.log(`Found ${fields.length} form fields`);

      for (const field of fields) {
        // Skip file inputs and hidden fields
        if (field.type === "file" || field.type === "hidden") {
          continue;
        }

        // Skip if field is already filled
        if (field.value && field.value.trim() !== "") {
          console.log(`Field ${field.name || field.id} already filled, skipping`);
          continue;
        }

        await this.fillField(field);
        await this.delay(200); // Small delay between fields
      }

      console.log("Form filling completed");
      return true;
    } catch (error) {
      console.error("Error in handleFormFilling:", error);
      return false;
    }
  }

  async fillField(field) {
    try {
      const fieldName = field.name || field.id || field.placeholder || "unknown";
      const fieldType = field.type || field.tagName.toLowerCase();

      console.log(`Filling field: ${fieldName} (${fieldType})`);

      let value = "";

      // Handle different field types
      switch (fieldType) {
        case "email":
          value = await this.getEmailValue(field);
          break;

        case "tel":
        case "phone":
          value = await this.getPhoneValue(field);
          break;

        case "text":
        case "textarea":
          value = await this.getTextValue(field, fieldName);
          break;

        case "select":
        case "select-one":
          await this.selectDropdownOption(field, fieldName);
          return;

        case "radio":
        case "checkbox":
          await this.handleRadioOrCheckbox(field, fieldName);
          return;

        default:
          value = await this.getTextValue(field, fieldName);
      }

      if (value) {
        this.setFieldValue(field, value);
      }
    } catch (error) {
      console.error(`Error filling field ${field.name || field.id}:`, error);
    }
  }

  async getEmailValue(field) {
    return this.userData.email || this.userData.contactInfo?.email || "";
  }

  async getPhoneValue(field) {
    return this.userData.phone || this.userData.contactInfo?.phone || "";
  }

  async getTextValue(field, fieldName) {
    const fieldNameLower = fieldName.toLowerCase();

    // Try to match common field patterns
    if (fieldNameLower.includes("name")) {
      if (fieldNameLower.includes("first")) {
        return this.userData.firstName || this.userData.personalInfo?.firstName || "";
      } else if (fieldNameLower.includes("last")) {
        return this.userData.lastName || this.userData.personalInfo?.lastName || "";
      } else {
        return this.userData.fullName || `${this.userData.firstName || ""} ${this.userData.lastName || ""}`.trim();
      }
    }

    if (fieldNameLower.includes("email")) {
      return await this.getEmailValue(field);
    }

    if (fieldNameLower.includes("phone") || fieldNameLower.includes("mobile") || fieldNameLower.includes("tel")) {
      return await this.getPhoneValue(field);
    }

    if (fieldNameLower.includes("address")) {
      return this.userData.address || this.userData.contactInfo?.address || "";
    }

    if (fieldNameLower.includes("city")) {
      return this.userData.city || this.userData.contactInfo?.city || "";
    }

    if (fieldNameLower.includes("country")) {
      return this.userData.country || this.userData.contactInfo?.country || "";
    }

    if (fieldNameLower.includes("linkedin")) {
      return this.userData.linkedinUrl || this.userData.socialLinks?.linkedin || "";
    }

    if (fieldNameLower.includes("portfolio") || fieldNameLower.includes("website")) {
      return this.userData.portfolioUrl || this.userData.website || "";
    }

    if (fieldNameLower.includes("cover") && fieldNameLower.includes("letter")) {
      return await this.generateCoverLetterText();
    }

    // For other fields, use AI service
    if (this.aiService && this.jobDescription) {
      try {
        const question = `What should I fill in for this field: ${fieldName}? Please provide a brief, relevant answer based on the user's profile.`;
        const answer = await this.aiService.getAnswer(
          question,
          [],
          {
            userData: this.userData,
            jobDescription: this.jobDescription,
          }
        );
        return answer || "";
      } catch (error) {
        console.error("Error getting AI answer:", error);
        return "";
      }
    }

    return "";
  }

  async selectDropdownOption(selectField, fieldName) {
    try {
      const options = selectField.querySelectorAll("option");
      if (options.length === 0) return;

      const fieldNameLower = fieldName.toLowerCase();

      // Try to intelligently select an option
      let selectedValue = null;

      // For experience fields
      if (fieldNameLower.includes("experience") || fieldNameLower.includes("years")) {
        const yearsOfExperience = this.userData.yearsOfExperience || 0;
        for (const option of options) {
          const optionText = option.textContent.toLowerCase();
          if (optionText.includes(yearsOfExperience.toString())) {
            selectedValue = option.value;
            break;
          }
        }
      }

      // For education fields
      if (fieldNameLower.includes("education") || fieldNameLower.includes("degree")) {
        const education = this.userData.education || this.userData.highestEducation || "";
        const educationLower = education.toLowerCase();

        for (const option of options) {
          const optionText = option.textContent.toLowerCase();
          if (educationLower.includes(optionText) || optionText.includes(educationLower)) {
            selectedValue = option.value;
            break;
          }
        }
      }

      // Use AI to select option if we haven't found one
      if (!selectedValue && this.aiService && this.jobDescription) {
        const optionTexts = Array.from(options).map(opt => opt.textContent.trim());
        try {
          const answer = await this.aiService.getAnswer(
            `Which option should I select for "${fieldName}"?`,
            optionTexts,
            {
              userData: this.userData,
              jobDescription: this.jobDescription,
            }
          );

          // Find the option that matches the answer
          for (const option of options) {
            if (option.textContent.trim() === answer) {
              selectedValue = option.value;
              break;
            }
          }
        } catch (error) {
          console.error("Error getting AI selection:", error);
        }
      }

      // If still no value, select first non-empty option
      if (!selectedValue) {
        for (const option of options) {
          if (option.value && option.value !== "") {
            selectedValue = option.value;
            break;
          }
        }
      }

      if (selectedValue) {
        selectField.value = selectedValue;
        selectField.dispatchEvent(new Event("change", { bubbles: true }));
        console.log(`Selected option: ${selectedValue} for ${fieldName}`);
      }
    } catch (error) {
      console.error("Error selecting dropdown option:", error);
    }
  }

  async handleRadioOrCheckbox(field, fieldName) {
    try {
      // For radio buttons and checkboxes, we need to make intelligent decisions
      // Use AI service if available
      if (this.aiService && this.jobDescription) {
        const question = `Should I check/select this option: "${field.value || fieldName}"? Answer with yes or no.`;
        try {
          const answer = await this.aiService.getAnswer(
            question,
            ["yes", "no"],
            {
              userData: this.userData,
              jobDescription: this.jobDescription,
            }
          );

          if (answer && answer.toLowerCase().includes("yes")) {
            field.checked = true;
            field.dispatchEvent(new Event("change", { bubbles: true }));
            console.log(`Checked ${fieldName}`);
          }
        } catch (error) {
          console.error("Error getting AI decision:", error);
        }
      }
    } catch (error) {
      console.error("Error handling radio/checkbox:", error);
    }
  }

  async generateCoverLetterText() {
    try {
      if (!this.aiService || !this.jobDescription) {
        return "";
      }

      const answer = await this.aiService.getAnswer(
        "Generate a brief cover letter for this job application",
        [],
        {
          userData: this.userData,
          jobDescription: this.jobDescription,
        }
      );

      return answer || "";
    } catch (error) {
      console.error("Error generating cover letter:", error);
      return "";
    }
  }

  setFieldValue(field, value) {
    if (!value) return;

    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    console.log(`Set value for ${field.name || field.id}: ${value}`);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  updateJobDescription(jobDescription) {
    this.jobDescription = jobDescription;
  }

  updateUserData(userData) {
    this.userData = userData;
  }
}
