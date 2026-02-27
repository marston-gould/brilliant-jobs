// platforms/breezy/breezy-form-handler.js

import { notifyStatus } from "../../utils/status-helper.js";
import { AIService } from "../../services/index.js";
import Utils from "../../utils/utils.js";
import { BreezyFormExtractor } from "./breezy-form-extractor.js";
import { AIResponseUtils } from "../../shared/utilities/index.js";

export class BreezyFormHandler {
  constructor(options = {}) {
    this.host = options.host;
    this.userData = options.userData || {};
    this.jobDescription = options.jobDescription || "";
    this.aiService = new AIService({ apiHost: this.host, platform: "breezy" });
    this.answerCache = new Map();
    this.utils = new Utils();
    this.extractor = new BreezyFormExtractor();

    // Co-pilot mode properties
    this.copilotMode = options.copilotMode || false;
    this.copilotState = options.copilotState;
    this.currentJobTitle = "";
    this.userHasControl = false;
    this.userActionPromise = null;
    this.userActionResolver = null;
  }

  waitForUserAction() {
    if (this.userActionPromise) {
      return this.userActionPromise;
    }
    this.userActionPromise = new Promise((resolve) => {
      this.userActionResolver = resolve;
    });
    return this.userActionPromise;
  }

  resolveUserAction(action) {
    if (this.userActionResolver) {
      this.userActionResolver(action);
      this.userActionResolver = null;
      this.userActionPromise = null;
    }
  }

  /**
   * Clean up label text
   */
  cleanLabelText(text) {
    if (!text) return "";

    return text
      .replace(/[*✱]/g, "")
      .replace(/\s+/g, " ")
      .replace(/^\s+|\s+$/g, "")
      .replace(/\(required\)/i, "")
      .replace(/\(optional\)/i, "")
      .toLowerCase();
  }

  /**
   * Main form filling method using the extractor and AI
   */
  async fillFormWithProfile(form, profile, jobDescription = null) {
    try {
      this.userData = profile;
      console.log("📝 Starting form fill process...");

      // Phase 1: Fill structured sections directly from profile (no AI)
      const handledElements = await this.fillStructuredSections(form, profile);

      // Phase 2: Use the extractor to get remaining form fields for AI processing
      const formFields = this.extractor.extractAllFormFields(form);

      if (formFields.length === 0) {
        console.log("⚠️ No fields found in form");
        return handledElements.size > 0;
      }

      console.log(`📋 Found ${formFields.length} total fields`);

      // Categorize fields, excluding already-handled structured elements
      const { fillableFields, fileFields, skippedFields } = this.categorizeFields(formFields, handledElements);

      console.log(`   • ${fillableFields.length} fillable fields (for AI)`);
      console.log(`   • ${fileFields.length} file upload fields`);
      console.log(`   • ${skippedFields.length} skipped fields`);
      console.log(`   • ${handledElements.size} already handled by direct fill`);

      // Process remaining fields sequentially with AI
      let processedCount = 0;
      const failedFields = [];
      const successfulFields = [];

      for (const field of fillableFields) {
        try {
          const result = await this.processField(field, jobDescription);

          if (result.success) {
            processedCount++;
            successfulFields.push(field.label);
            console.log(`   ✅ ${field.label}: ${result.value}`);
          } else {
            failedFields.push({ label: field.label, reason: result.reason });
            console.log(`   ❌ ${field.label}: ${result.reason}`);
          }

          // Wait between fields to avoid rate limiting
          await this.wait(200);
        } catch (error) {
          console.error(`   ❌ Error processing field "${field.label}":`, error.message);
          failedFields.push({ label: field.label, reason: error.message });
        }
      }

      // Re-apply structured sections after AI processing.
      // Breezy's parsedResume handler fires asynchronously after the resume
      // upload and can overwrite values we set during fillStructuredSections.
      // By re-applying here, we ensure our values stick.
      console.log("\n🔄 Re-applying structured sections (post-AI)...");
      await this.fillStructuredSections(form, this.userData);

      // Summary
      console.log(`\n📊 Form Fill Summary:`);
      console.log(`   ✅ Direct fill: ${handledElements.size} fields`);
      console.log(`   ✅ AI fill: ${processedCount}/${fillableFields.length}`);
      if (failedFields.length > 0) {
        console.log(`   ❌ Failed: ${failedFields.length}`);
        failedFields.forEach(f => console.log(`      - ${f.label}: ${f.reason}`));
      }

      return processedCount > 0 || handledElements.size > 0;
    } catch (error) {
      console.error("❌ Error in fillFormWithProfile:", error);
      return false;
    }
  }

  /**
   * Categorize fields into fillable, file uploads, and skipped
   * @param {Array} formFields - Extracted form fields
   * @param {Set} handledElements - Elements already filled by direct profile mapping
   */
  categorizeFields(formFields, handledElements = new Set()) {
    const fillableFields = [];
    const fileFields = [];
    const skippedFields = [];

    console.log("\n🔍 Analyzing extracted fields:");

    for (let i = 0; i < formFields.length; i++) {
      const field = formFields[i];

      // Log each field for debugging
      console.log(`\nField #${i + 1}:`, {
        label: field.label,
        name: field.name,
        type: field.fieldType.type,
        subtype: field.fieldType.subtype,
        required: field.fieldType.required,
        currentValue: field.value,
        element: field.element.tagName + (field.element.type ? `[${field.element.type}]` : ''),
        hasOptions: field.fieldType.options ? field.fieldType.options.length : 0
      });

      // Skip elements already handled by direct profile fill
      if (handledElements.has(field.element)) {
        console.log(`   → Categorized as: SKIPPED (handled by direct fill)`);
        skippedFields.push(field);
        continue;
      }

      // Skip fields inside education/work history repeating sections.
      // These structured sections are filled directly from profile data
      // in Phase 1 and should never be sent to the AI.
      // NOTE: Do NOT skip questionnaire ng-repeat (question in ..., opt in ...)
      if (field.element.closest) {
        const repeatContainer =
          field.element.closest('li[ng-repeat*="candidate.work_history"]') ||
          field.element.closest('li[ng-repeat*="candidate.education"]');
        if (repeatContainer) {
          console.log(`   → Categorized as: SKIPPED (structured repeating section)`);
          skippedFields.push(field);
          continue;
        }
      }

      // Skip file uploads (handled separately)
      if (field.fieldType.type === "file") {
        console.log(`   → Categorized as: FILE UPLOAD`);
        fileFields.push(field);
        continue;
      }

      // Skip fields without labels
      if (!field.label || field.label.trim() === "") {
        console.log(`   → Categorized as: SKIPPED (no label)`);
        skippedFields.push(field);
        continue;
      }

      console.log(`   → Categorized as: FILLABLE`);
      fillableFields.push(field);
    }

    return { fillableFields, fileFields, skippedFields };
  }

  /**
   * Process a single field with AI
   */
  async processField(field, jobDescription) {
    console.log(`\n🤖 Processing field: "${field.label}"`);
    
    try {
      // Check cache first
      const cacheKey = this.getCacheKey(field.label, field.fieldType.type);
      console.log(`   📦 Cache key: ${cacheKey}`);
      
      if (this.answerCache.has(cacheKey)) {
        const cachedAnswer = this.answerCache.get(cacheKey);
        console.log(`   ✅ Using cached answer: ${cachedAnswer}`);
        const success = this.extractor.setFieldValue(field.element, cachedAnswer);
        return {
          success,
          value: cachedAnswer,
          reason: success ? "cached" : "failed to set cached value"
        };
      }

      // Get answer from AI
      console.log(`   🔄 Calling AI service...`);
      const answer = await this.getAIAnswerForField(field, jobDescription);
      console.log(`   📥 AI response:`, answer);
      
      if (answer === null || answer === undefined) {
        console.log(`   ❌ No AI response received`);
        return { success: false, value: null, reason: "no AI response" };
      }

      // Validate answer for the field type
      console.log(`   🔍 Validating answer...`);
      const validatedAnswer = this.validateAnswer(answer, field);
      if (!validatedAnswer.valid) {
        console.log(`   ❌ Validation failed: ${validatedAnswer.reason}`);
        return { success: false, value: answer, reason: validatedAnswer.reason };
      }
      console.log(`   ✅ Answer validated`);

      // Fill the field using the extractor
      console.log(`   📝 Setting field value...`);
      const success = this.extractor.setFieldValue(field.element, answer);
      console.log(`   ${success ? '✅' : '❌'} Field value set: ${success}`);
      
      if (success) {
        // Cache successful answers
        this.answerCache.set(cacheKey, answer);
        
        // Verify the value was actually set
        const verifyValue = this.extractor.getFieldValue(field.element);
        console.log(`   🔎 Verification value:`, verifyValue);
        
        if (!verifyValue || verifyValue === "") {
          console.warn(`   ⚠️ Value set but verification failed for: ${field.label}`);
        }
      }
      
      return {
        success,
        value: answer,
        reason: success ? "filled" : "failed to set value"
      };
    } catch (error) {
      console.error(`   ❌ Error processing field:`, error);
      return { success: false, value: null, reason: error.message };
    }
  }

  /**
   * Generate cache key for answer caching
   */
  getCacheKey(label, fieldType) {
    return `${this.cleanLabelText(label)}_${fieldType}`;
  }

  /**
   * Validate AI answer matches field requirements
   */
  validateAnswer(answer, field) {
    // For select/radio/checkbox with options, validate the answer is one of the options
    if (field.fieldType.options && field.fieldType.options.length > 0) {
      // Handle array answers (from getMultiSelectAnswer for checkbox groups)
      if (Array.isArray(answer)) {
        const allValid = answer.every(ans => {
          const ansStr = String(ans).toLowerCase();
          return field.fieldType.options.some(opt => {
            const optValue = String(opt.value || "").toLowerCase();
            const optLabel = String(opt.label || "").toLowerCase();
            return (
              optValue === ansStr ||
              optLabel === ansStr ||
              optLabel.includes(ansStr) ||
              ansStr.includes(optLabel)
            );
          });
        });

        if (!allValid && answer.length > 0) {
          const optionLabels = field.fieldType.options.map(opt => opt.label || opt.value);
          return { valid: false, reason: `some answers not in options: ${optionLabels.join(", ")}` };
        }
        return { valid: true };
      }

      const answerStr = String(answer).toLowerCase();

      // Check against both value AND label (checkboxes often have "on" as value)
      const isValid = field.fieldType.options.some(opt => {
        const optValue = String(opt.value || "").toLowerCase();
        const optLabel = String(opt.label || "").toLowerCase();
        return (
          optValue === answerStr ||
          optLabel === answerStr ||
          optLabel.includes(answerStr) ||
          answerStr.includes(optLabel)
        );
      });

      if (!isValid) {
        const optionLabels = field.fieldType.options.map(opt => opt.label || opt.value);
        return { valid: false, reason: `answer not in options: ${optionLabels.join(", ")}` };
      }
    }

    // For single checkboxes (boolean)
    if (field.fieldType.type === "checkbox" && field.fieldType.subtype === "single") {
      if (typeof answer !== "boolean" && answer !== "yes" && answer !== "no") {
        return { valid: false, reason: "checkbox requires boolean or yes/no" };
      }
    }

    return { valid: true };
  }

  /**
   * Get AI answer for a specific field
   */
  async getAIAnswerForField(field, jobDescription = null) {
    try {
      console.log(`      🏗️ Building context for field...`);
      
      // Build comprehensive field context for AI
      const fieldContext = this.buildFieldContext(field, jobDescription);
      console.log(`      📄 Context: ${fieldContext}`);
      
      // Build context object
      const context = {
        fieldType: field.fieldType.type,
        fieldContext,
        userData: this.userData,
        jobDescription: jobDescription || "",
        required: !!field.fieldType.required,
      };
      
      // Get options if it's a choice field
      let options = [];
      if (field.fieldType.options && field.fieldType.options.length > 0) {
        options = field.fieldType.options.map(opt => opt.label || opt.value);
        console.log(`      🎯 Options available:`, options);
      }

      // Determine if this is a multi-select, single-option, longform, or normal field
      const isMultiSelectField =
        field.fieldType.type === "checkbox" && field.fieldType.subtype === "multiple";

      const isOptionField =
        field.fieldType.type === "select" ||
        field.fieldType.type === "radio" ||
        (options && options.length > 0 && !isMultiSelectField);

      const isLongformField =
        field.fieldType.type === "textarea" ||
        field.label.toLowerCase().includes("cover letter") ||
        field.label.toLowerCase().includes("why") ||
        field.label.toLowerCase().includes("describe") ||
        field.label.toLowerCase().includes("tell us") ||
        field.label.toLowerCase().includes("additional information");

      // Route to appropriate AI service method
      let answer;
      if (isMultiSelectField) {
        console.log(`      📞 Calling: aiService.getMultiSelectAnswer()`);
        answer = await this.aiService.getMultiSelectAnswer(field.label, options, context);
      } else if (isOptionField) {
        console.log(`      📞 Calling: aiService.getOptionAnswer()`);
        answer = await this.aiService.getOptionAnswer(field.label, options, context);
      } else if (isLongformField) {
        console.log(`      📞 Calling: aiService.getLongformAnswer()`);
        answer = await this.aiService.getLongformAnswer(field.label, [], context);
      } else if (AIResponseUtils.isSalaryField(field.label)) {
        console.log(`      📞 Calling: aiService.getSalaryAnswer()`);
        context.fieldType = "number";
        answer = await this.aiService.getSalaryAnswer(field.label, [], context);
      } else {
        console.log(`      📞 Calling: aiService.getNormalAnswer()`);
        answer = await this.aiService.getNormalAnswer(field.label, [], context);
      }

      console.log(`      ✅ AI call completed, answer:`, answer);
      return answer;
    } catch (error) {
      console.error(`      ❌ Error getting AI answer for field "${field.label}":`, error);
      return null;
    }
  }

  /**
   * Build comprehensive context string for AI about the field
   */
  buildFieldContext(field, jobDescription = null) {
    const contextParts = [];
    
    // Field type and requirement
    let typeInfo = `${field.fieldType.type} field`;
    if (field.fieldType.required) {
      typeInfo += " (required)";
    }
    contextParts.push(typeInfo);

    // Related question or section header
    if (field.precedingQuestion && field.precedingQuestion.trim()) {
      contextParts.push(`Section: "${field.precedingQuestion}"`);
    }

    // Field subtype and widget
    if (field.fieldType.subtype) {
      contextParts.push(`Subtype: ${field.fieldType.subtype}`);
    }
    if (field.fieldType.widget) {
      contextParts.push(`Widget: ${field.fieldType.widget}`);
    }

    // Constraints
    if (field.constraints && Object.keys(field.constraints).length > 0) {
      const constraintInfo = [];
      if (field.constraints.placeholder) constraintInfo.push(`Placeholder: "${field.constraints.placeholder}"`);
      if (field.constraints.minLength) constraintInfo.push(`Min length: ${field.constraints.minLength}`);
      if (field.constraints.maxLength) constraintInfo.push(`Max length: ${field.constraints.maxLength}`);
      if (field.constraints.min) constraintInfo.push(`Min value: ${field.constraints.min}`);
      if (field.constraints.max) constraintInfo.push(`Max value: ${field.constraints.max}`);
      if (field.constraints.pattern) constraintInfo.push(`Pattern: ${field.constraints.pattern}`);
      
      if (constraintInfo.length > 0) {
        contextParts.push(constraintInfo.join(", "));
      }
    }

    // Job-specific context
    if (jobDescription) {
      if (jobDescription.title) {
        contextParts.push(`Job: ${jobDescription.title}`);
      }
      if (jobDescription.company) {
        contextParts.push(`Company: ${jobDescription.company}`);
      }
    }

    return contextParts.join(". ");
  }

  // ─── STRUCTURED SECTION HANDLERS (Direct profile fill, no AI) ────────────

  /**
   * Fill structured sections directly from user profile data.
   * Handles: Salary, Work History, Education, Experience Summary.
   * Returns a Set of DOM elements that were filled.
   */
  async fillStructuredSections(form, profile) {
    console.log("📋 Filling structured sections from profile data...");
    const handledElements = new Set();

    const personalEls = this.fillPersonalDetails(form, profile);
    personalEls.forEach((el) => handledElements.add(el));

    // const workEls = await this.fillWorkHistorySection(form, profile);
    // workEls.forEach((el) => handledElements.add(el));

    // const eduEls = await this.fillEducationSection(form, profile);
    // eduEls.forEach((el) => handledElements.add(el));

    // const summaryEls = this.fillExperienceSummary(form, profile);
    // summaryEls.forEach((el) => handledElements.add(el));

    const consentEls = this.fillConsentCheckboxes(form);
    consentEls.forEach((el) => handledElements.add(el));

    console.log(`   ✅ Handled ${handledElements.size} elements directly from profile`);
    return handledElements;
  }

  /**
   * Fill personal details: Full Name, Email, Phone, Address
   * These are standard Breezy fields with known ng-model attributes
   */
  fillPersonalDetails(form, profile) {
    const handled = [];
    if (!profile) return handled;

    console.log("   👤 Filling personal details...");

    // Full Name
    const nameInput = form.querySelector(
      'input[ng-model="candidate.name"], input[name="cName"]'
    );
    if (nameInput) {
      const fullName = profile.fullName || profile.name ||
        [profile.firstName, profile.lastName].filter(Boolean).join(" ");
      if (fullName) {
        this.extractor.setFieldValue(nameInput, fullName);
        handled.push(nameInput);
        console.log(`      Name: ${fullName}`);
      }
    }

    // Email
    const emailInput = form.querySelector(
      'input[ng-model="candidate.email_address"], input[name="cEmail"]'
    );
    if (emailInput) {
      const email = profile.email || profile.emailAddress;
      if (email) {
        this.extractor.setFieldValue(emailInput, email);
        handled.push(emailInput);
        console.log(`      Email: ${email}`);
      }
    }

    // Phone
    const phoneInput = form.querySelector(
      'input[ng-model="candidate.phone_number"], input[name="cPhoneNumber"]'
    );
    if (phoneInput) {
      const phone = profile.phone || profile.phoneNumber;
      if (phone) {
        this.extractor.setFieldValue(phoneInput, phone);
        handled.push(phoneInput);
        console.log(`      Phone: ${phone}`);
      }
    }

    // Address
    const addressInput = form.querySelector(
      'input[ng-model="candidate.address"], input[name="cAddress"]'
    );
    if (addressInput) {
      const address = profile.address || profile.location || profile.city;
      if (address) {
        this.extractor.setFieldValue(addressInput, address);
        handled.push(addressInput);
        console.log(`      Address: ${address}`);
      }
    }

    return handled;
  }

  /**
   * Fill salary section: currency, amount, period (yearly)
   */
  fillSalarySection(form, profile) {
    const handled = [];
    const salaryContainer = form.querySelector(".desired-salary");
    if (!salaryContainer) return handled;

    console.log("   💰 Filling salary section...");

    // Currency select
    const currencySelect = salaryContainer.querySelector(
      'select[name="salaryCurrency"], select[ng-model="candidate.salary.currency"]'
    );
    if (currencySelect && profile.desiredSalaryCurrency) {
      this.extractor.setFieldValue(currencySelect, profile.desiredSalaryCurrency);
      handled.push(currencySelect);
      console.log(`      Currency: ${profile.desiredSalaryCurrency}`);
    }

    // Salary amount
    const salaryInput = salaryContainer.querySelector(
      'input[name="cSalary"], input[ng-model="candidate.salary.salary"]'
    );
    if (salaryInput && profile.desiredSalary) {
      this.extractor.setFieldValue(salaryInput, profile.desiredSalary);
      handled.push(salaryInput);
      console.log(`      Amount: ${profile.desiredSalary}`);
    }

    // Period select – always set to yearly
    const periodSelect = salaryContainer.querySelector(
      'select[ng-model="candidate.salary.period"]'
    );
    if (periodSelect) {
      this.extractor.setFieldValue(periodSelect, "yearly");
      handled.push(periodSelect);
      console.log(`      Period: yearly`);
    }

    return handled;
  }

  /**
   * Fill work history entries from profile.experience
   */
  async fillWorkHistorySection(form, profile) {
    const handled = [];
    if (!profile.experience || profile.experience.length === 0) return handled;

    console.log("   💼 Filling work history section...");

    let workEntries = form.querySelectorAll(
      'li[ng-repeat*="candidate.work_history"]'
    );

    // If no work history section exists in the form, skip
    if (workEntries.length === 0) {
      const addPositionLink = form.querySelector('a[ng-click*="addPosition"]');
      if (!addPositionLink) return handled;
    }

    // Add more position slots if needed (one already exists by default)
    const addPositionLink = form.querySelector(
      'a[ng-click*="addPosition"]'
    );
    if (addPositionLink) {
      const toAdd = Math.max(0, profile.experience.length - workEntries.length);
      for (let i = 0; i < toAdd; i++) {
        addPositionLink.click();
        await this.wait(400);
      }
      if (toAdd > 0) {
        workEntries = form.querySelectorAll(
          'li[ng-repeat*="candidate.work_history"]'
        );
      }
    }

    const count = Math.min(workEntries.length, profile.experience.length);

    for (let i = 0; i < count; i++) {
      const entry = workEntries[i];
      const exp = profile.experience[i];

      console.log(`      Position ${i + 1}: ${exp.title || "N/A"} @ ${exp.company || "N/A"}`);

      // Company
      const companyInput = entry.querySelector(
        'input[ng-model="candidatePosition.company_name"]'
      );
      if (companyInput && exp.company) {
        this.extractor.setFieldValue(companyInput, exp.company);
        handled.push(companyInput);
      }

      // Title
      const titleInput = entry.querySelector(
        'input[ng-model="candidatePosition.title"]'
      );
      if (titleInput && exp.title) {
        this.extractor.setFieldValue(titleInput, exp.title);
        handled.push(titleInput);
      }

      // Summary
      const summaryTextarea = entry.querySelector(
        'textarea[ng-model="candidatePosition.summary"]'
      );
      if (summaryTextarea && exp.description) {
        this.extractor.setFieldValue(summaryTextarea, exp.description);
        handled.push(summaryTextarea);
      }

      // Start date
      const startInput = entry.querySelector(
        'input[ng-model="candidatePosition.date_start"]'
      );
      if (startInput && exp.startDate) {
        const dateVal = this.parseDate(exp.startDate);
        if (dateVal) {
          this.extractor.setFieldValue(startInput, dateVal);
          handled.push(startInput);
        }
      }

      // End date
      const endInput = entry.querySelector(
        'input[ng-model="candidatePosition.date_end"]'
      );
      if (endInput && exp.endDate) {
        const dateVal = this.parseDate(exp.endDate);
        if (dateVal) {
          this.extractor.setFieldValue(endInput, dateVal);
          handled.push(endInput);
        }
      }
    }

    return handled;
  }

  /**
   * Fill education entries from profile.education
   */
  async fillEducationSection(form, profile) {
    const handled = [];
    if (!profile.education || profile.education.length === 0) return handled;

    console.log("   🎓 Filling education section...");

    let eduEntries = form.querySelectorAll(
      'li[ng-repeat*="candidate.education"]'
    );

    // If no education section exists in the form, skip
    if (eduEntries.length === 0) {
      const addEducationLink = form.querySelector('a[ng-click*="addEducation"]');
      if (!addEducationLink) return handled;
    }

    // Add more education slots if needed (one already exists by default)
    const addEducationLink = form.querySelector(
      'a[ng-click*="addEducation"]'
    );
    if (addEducationLink) {
      const toAdd = Math.max(0, profile.education.length - eduEntries.length);
      for (let i = 0; i < toAdd; i++) {
        addEducationLink.click();
        await this.wait(400);
      }
      if (toAdd > 0) {
        eduEntries = form.querySelectorAll(
          'li[ng-repeat*="candidate.education"]'
        );
      }
    }

    const count = Math.min(eduEntries.length, profile.education.length);

    for (let i = 0; i < count; i++) {
      const entry = eduEntries[i];
      const edu = profile.education[i];

      console.log(`      Education ${i + 1}: ${edu.school || "N/A"} – ${edu.major || "N/A"}`);

      // School
      const schoolInput = entry.querySelector(
        'input[ng-model="candidateSchool.school_name"]'
      );
      if (schoolInput && edu.school) {
        this.extractor.setFieldValue(schoolInput, edu.school);
        handled.push(schoolInput);
      }

      // Field of Study
      const fieldInput = entry.querySelector(
        'input[ng-model="candidateSchool.field_of_study"]'
      );
      if (fieldInput && edu.major) {
        this.extractor.setFieldValue(fieldInput, edu.major);
        handled.push(fieldInput);
      }

      // Degree select (e.g., Bachelor's, Master's, etc.)
      const degreeSelect = entry.querySelector(
        'select[ng-model="candidateSchool.degree"]'
      );
      if (degreeSelect && edu.degree) {
        // Fuzzy-match degree value to available options
        const options = Array.from(degreeSelect.options);
        const degreeLower = edu.degree.toLowerCase();
        const matched = options.find((opt) => {
          const val = opt.value.toLowerCase();
          const label = opt.textContent.trim().toLowerCase();
          return (
            val === degreeLower ||
            label === degreeLower ||
            label.includes(degreeLower) ||
            degreeLower.includes(label)
          );
        });
        if (matched) {
          this.extractor.setFieldValue(degreeSelect, matched.value);
        } else {
          // Try common mappings
          const degreeMap = {
            bachelor: "bachelors",
            "bachelor's": "bachelors",
            bachelors: "bachelors",
            master: "masters",
            "master's": "masters",
            masters: "masters",
            phd: "doctorate",
            doctorate: "doctorate",
            associate: "associates",
            "associate's": "associates",
            associates: "associates",
          };
          const mapped = degreeMap[degreeLower];
          if (mapped) {
            const mappedOpt = options.find((opt) => {
              const val = opt.value.toLowerCase();
              const label = opt.textContent.trim().toLowerCase();
              return val.includes(mapped) || label.includes(mapped);
            });
            if (mappedOpt) {
              this.extractor.setFieldValue(degreeSelect, mappedOpt.value);
            }
          }
        }
        handled.push(degreeSelect);
      }

      // Summary (use degree + major as description)
      const summaryTextarea = entry.querySelector(
        'textarea[ng-model="candidateSchool.summary"]'
      );
      if (summaryTextarea) {
        const summaryParts = [];
        if (edu.degree) summaryParts.push(edu.degree);
        if (edu.major) summaryParts.push(`in ${edu.major}`);
        const summaryText = summaryParts.join(" ") || "";
        if (summaryText) {
          this.extractor.setFieldValue(summaryTextarea, summaryText);
        }
        handled.push(summaryTextarea);
      }

      // Start date
      const startInput = entry.querySelector(
        'input[ng-model="candidateSchool.date_start"]'
      );
      if (startInput && edu.startDate) {
        const dateVal = this.parseDate(edu.startDate);
        if (dateVal) {
          this.extractor.setFieldValue(startInput, dateVal);
          handled.push(startInput);
        }
      }

      // End date
      const endInput = entry.querySelector(
        'input[ng-model="candidateSchool.date_end"]'
      );
      if (endInput && edu.endDate) {
        const dateVal = this.parseDate(edu.endDate);
        if (dateVal) {
          this.extractor.setFieldValue(endInput, dateVal);
          handled.push(endInput);
        }
      }
    }

    return handled;
  }

  /**
   * Fill experience summary textarea from profile.summary
   */
  fillExperienceSummary(form, profile) {
    const handled = [];
    if (!profile.summary) return handled;

    console.log("   📝 Filling experience summary...");

    const summaryTextarea = form.querySelector(
      'textarea[name="cSummary"], textarea[ng-model="candidate.summary"]'
    );
    if (summaryTextarea) {
      this.extractor.setFieldValue(summaryTextarea, profile.summary);
      handled.push(summaryTextarea);
      console.log(`      Summary: ${profile.summary}`);
    }

    return handled;
  }

  /**
   * Parse date strings into YYYY-MM-DD format for date inputs
   * Handles: "October 2021", "November 2016", "2026-01-16", etc.
   */
  parseDate(dateStr) {
    if (!dateStr) return null;

    // Already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

    // Bare year (e.g., "2018")
    if (/^\d{4}$/.test(dateStr)) return `${dateStr}-01-01`;

    const months = {
      january: "01", february: "02", march: "03", april: "04",
      may: "05", june: "06", july: "07", august: "08",
      september: "09", october: "10", november: "11", december: "12",
    };

    // "Month Year" format (e.g., "October 2021")
    const match = dateStr.match(/^(\w+)\s+(\d{4})$/i);
    if (match) {
      const month = months[match[1].toLowerCase()];
      if (month) return `${match[2]}-${month}-01`;
    }

    // Fallback: try native Date parsing
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split("T")[0];
      }
    } catch (e) {
      // ignore
    }

    return null;
  }

  /**
   * Check standalone consent checkboxes (SMS consent, terms, etc.)
   * These are checkboxes NOT inside .question containers (questionnaire)
   * and NOT inside repeating sections (work history, education).
   */
  fillConsentCheckboxes(form) {
    const handled = [];
    const allCheckboxes = form.querySelectorAll('input[type="checkbox"]');

    for (const cb of allCheckboxes) {
      // Skip questionnaire checkboxes (handled by AI) and repeating sections
      if (cb.closest('.question') || cb.closest('[ng-repeat]')) continue;

      console.log(`   ✅ Consent checkbox: ${cb.name || cb.id || 'unnamed'} → checked`);
      this.extractor.setFieldValue(cb, true);
      handled.push(cb);
    }

    return handled;
  }

  // ─── END STRUCTURED SECTION HANDLERS ───────────────────────────────────

  /**
   * Submit the form
   */
  async submitForm() {
    try {
      await this.wait(2000);

      // Find Breezy's submit button - specifically the Angular ng-click="apply()" button
      let submitButton =
        document.querySelector('button[ng-click="apply()"]') ||
        document.querySelector(
          'button[type="submit"], input[type="submit"]'
        );

      if (!submitButton) {
        // Fallback: search buttons only (not <a> links) to avoid matching LinkedIn/social apply links
        const allButtons = document.querySelectorAll("button");
        for (const btn of allButtons) {
          const text = btn.textContent?.trim()?.toLowerCase() || "";
          if (
            text.includes("submit") ||
            text.includes("send application")
          ) {
            submitButton = btn;
            break;
          }
        }
      }

      if (!submitButton) {
        return false;
      }

      // Co-pilot mode: pause and wait for user approval before submitting
      if (this.copilotMode) {
        notifyStatus({
          type: "COPILOT_SUBMIT_READY",
          data: {
            buttonText: submitButton.textContent?.trim(),
            jobTitle: this.currentJobTitle,
            title: this.currentJobTitle,
          },
        });

        if (this.copilotState) {
          this.copilotState.setPendingSubmission(
            { title: this.currentJobTitle },
            submitButton
          );
        }

        const userAction = await this.waitForUserAction();

        if (userAction === "SUBMIT") {
          if (this.copilotState) {
            this.copilotState.clearPendingSubmission();
          }
          return this.clickSubmitButton(submitButton);
        } else if (userAction === "SKIP") {
          return { success: false, reason: "user_skipped" };
        }
      }

      // Auto-pilot mode: submit directly
      return this.clickSubmitButton(submitButton);
    } catch (error) {
      return false;
    }
  }

  async clickSubmitButton(button) {
    // Wait for button to become enabled (e.g., resume upload finishing)
    let waitAttempts = 0;
    while (button.disabled && waitAttempts < 15) {
      console.log(`   ⏳ Submit button disabled, waiting... (${waitAttempts + 1}/15)`);
      await this.wait(2000);
      waitAttempts++;
    }

    if (button.disabled) {
      console.warn("   ⚠️ Submit button still disabled after waiting");
      return false;
    }

    button.scrollIntoView({ behavior: "smooth", block: "center" });
    await this.wait(500);

    button.click();
    await this.wait(3000);
    return true;
  }

  async submitAndVerify() {
    try {
      const submitSuccess = await this.submitForm();
      if (!submitSuccess) {
        return { success: false, message: "Failed to submit form" };
      }

      await this.wait(2000);
    } catch (error) {
      return { success: false, message: `Submission error: ${error.message}` };
    }
  }

  /**
   * Utility wait method
   */
  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
