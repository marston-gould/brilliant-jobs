// platforms/icims/icims-form-handler.js
import { notifyStatus } from "../../utils/status-helper.js";
import { AIService } from "../../services/index.js";
import Utils from "../../utils/utils.js";

export class IcimsFormHandler {
  constructor(options = {}) {
    this.host = options.host;
    this.userData = options.userData || {};
    this.jobDescription = options.jobDescription || "";
    this.jobTitle = options.jobTitle || "";
    this.aiService = new AIService({ apiHost: this.host, platform: "icims" });
    this.copilotMode = options.copilotMode || false;
    this.copilotState = options.copilotState;
    this.generatedPassword = null;
  }

  // ========================================
  // EMAIL ENTRY PAGE
  // ========================================

  /**
   * Handle the email entry page (enterEmailForm).
   * Fills the email input and clicks Next.
   */
  async handleEmailEntry(doc = document) {
    const emailForm = doc.getElementById("enterEmailForm");
    if (!emailForm) {
      console.log("⚠️ Email entry form not found");
      return false;
    }

    const emailInput = emailForm.querySelector("#email");
    if (!emailInput) {
      console.log("⚠️ Email input not found");
      return false;
    }

    const email = this.userData.email || "";
    if (!email) {
      console.log("⚠️ No email in user profile");
      return false;
    }

    console.log("📧 Filling email entry form");
    await this.fillTextField(emailInput, email);
    await Utils.delay(500);

    // Select GDPR consent dropdown if present (e.g. "I accept")
    const gdprSelect = emailForm.querySelector("#gdpr_consent_type");
    if (gdprSelect && !gdprSelect.value) {
      const acceptOption = Array.from(gdprSelect.options).find(o => o.text.toLowerCase().includes("accept"));
      if (acceptOption) {
        console.log("📧 Selecting GDPR consent option");
        gdprSelect.value = acceptOption.value;
        gdprSelect.dispatchEvent(new Event("change", { bubbles: true }));
        await Utils.delay(300);
      }
    }

    // Check the GDPR/data privacy consent checkbox if present (enables the submit button)
    const gdprCheckbox = emailForm.querySelector("#accept_gdpr");
    if (gdprCheckbox && !gdprCheckbox.checked) {
      console.log("📧 Accepting data privacy consent");
      gdprCheckbox.click();
      await Utils.delay(500);
    }

    const submitButton = emailForm.querySelector("#enterEmailSubmitButton");
    if (submitButton) {
      console.log("📧 Clicking Next on email form");
      submitButton.click();

      // Wait and check if "email already in use" error appears
      const errorResult = await this.waitForEmailError(doc);
      if (errorResult === "login_required") {
        return "login_required";
      }

      return true;
    }
    return false;
  }

  /**
   * After clicking Next on the email form, watch for the "email already in use"
   * error message. If detected, notify LOGIN_REQUIRED so the user can log in.
   * Returns "login_required" if error found, null otherwise.
   */
  async waitForEmailError(doc) {
    return new Promise((resolve) => {
      let resolved = false;

      const checkForError = () => {
        const errorMessages = doc.querySelectorAll(".iCIMS_ErrorMessage");
        for (const el of errorMessages) {
          if (el.textContent.toLowerCase().includes("already in use")) {
            console.log("🔐 Email already in use — showing LOGIN_REQUIRED");
            notifyStatus({ type: "LOGIN_REQUIRED" });
            return true;
          }
        }
        return false;
      };

      // Check immediately
      if (checkForError()) {
        resolve("login_required");
        return;
      }

      // Watch for the error to appear via MutationObserver
      const observer = new MutationObserver(() => {
        if (!resolved && checkForError()) {
          resolved = true;
          observer.disconnect();
          resolve("login_required");
        }
      });

      observer.observe(doc.body || doc.documentElement, {
        childList: true,
        subtree: true,
      });

      // Give it a few seconds — if no error, proceed normally
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          resolve(null);
        }
      }, 3000);
    });
  }

  // ========================================
  // CANDIDATE PROFILE FORM
  // ========================================

  /**
   * Handle the candidate profile form (profileForm).
   * Uploads resume if needed, fills fields, and submits.
   * Returns "resume_uploading" if resume upload triggers a page reload.
   */
  async handleCandidateForm(doc = document, fileHandler = null) {
    const form = doc.getElementById("profileForm");
    if (!form) {
      console.log("⚠️ Profile form not found");
      return false;
    }

    // Step 1: Upload resume if not already done (triggers page reload)
    if (!this.isResumeUploaded(doc) && fileHandler) {
      const fileInput = doc.getElementById("PortalProfileFields.Resume_File");
      if (fileInput) {
        if (fileHandler.preferences?.useCustomResume === true && this.jobDescription) {
          console.log("📎 Tailoring resume for job description...");
          notifyStatus({ type: "TAILORING_RESUME" });
        } else {
          console.log("📎 Uploading resume...");
          notifyStatus({ type: "UPLOADING_FILES" });
        }
        const jobId = this.extractJobIdFromUrl();
        const uploaded = await fileHandler.handleResumeUpload(
          fileInput,
          this.userData,
          this.jobDescription,
          jobId,
          this.jobTitle
        );
        if (uploaded) {
          // iCIMS auto-submits the form for resume parsing — page will reload
          return "resume_uploading";
        }
      }
    }

    // Step 2: Fill all profile fields
    console.log("📝 Filling candidate profile form");
    notifyStatus({ type: "FILLING_FORM" });
    await this.fillProfileFields(doc);

    // Step 3: Submit
    await Utils.delay(1000);
    const submitButton = doc.getElementById("cp_form_submit_i");
    if (submitButton) {
      if (this.copilotMode) {
        notifyStatus({ type: "COPILOT_SUBMIT_READY", data: { buttonText: "Submit Profile" } });
        return "waiting_for_user";
      }
      console.log("✅ Submitting candidate profile");
      submitButton.click();
      return true;
    }

    console.log("⚠️ Submit button not found");
    return false;
  }

  isResumeUploaded(doc) {
    // Check if the filename label is visible (shown after upload)
    const fileNameLabel = doc.getElementById("PortalProfileFields.Resume_FileNameLabel");
    if (fileNameLabel && !fileNameLabel.classList.contains("iCIMS_NoDisplay")) {
      return true;
    }
    // Check if the delete/replace button is visible
    const deleteSpan = doc.getElementById("PortalProfileFields.Resume_DeleteButtonSpan");
    if (deleteSpan && !deleteSpan.classList.contains("iCIMS_NoDisplay")) {
      return true;
    }
    return false;
  }

  // ========================================
  // FIELD FILLING
  // ========================================

  async fillProfileFields(doc) {
    const profile = this.userData;

    // Privacy Policy — select "Yes"
    await this.selectIcimsDropdown(doc, "rcf2000", "Yes");
    await Utils.delay(200);

    // Login credentials
    await this.fillInputById(doc, "PersonProfileFields.Login", profile.email || "");
    this.generatedPassword = this.generatePassword();
    await this.fillInputById(doc, "PersonProfileFields.Password", this.generatedPassword);
    await Utils.delay(200);
    await this.fillInputById(doc, "PersonProfileFields.Password_Confirm", this.generatedPassword);

    // Personal info
    await this.fillInputById(doc, "PersonProfileFields.FirstName", profile.firstName || "");
    await this.fillInputById(doc, "PersonProfileFields.MiddleName", profile.middleName || "");
    await this.fillInputById(doc, "PersonProfileFields.LastName", profile.lastName || "");
    await this.fillInputById(doc, "rcf2130", profile.firstName || ""); // Preferred First Name

    // Phone — prefix varies per iCIMS instance (e.g. "-1_" or "2021713_")
    const phonePrefix = this.findCollectionFieldPrefix(doc, "PersonProfileFields.PhoneNumber");
    await this.selectNativeOption(doc, `${phonePrefix}PersonProfileFields.PhoneType`, "15759"); // Mobile
    await this.fillInputById(doc, `${phonePrefix}PersonProfileFields.PhoneNumber`, profile.phone || profile.phoneNumber || "");

    // Email — always fill with profile email
    await this.fillInputById(doc, "PersonProfileFields.Email", profile.email || "");

    // Address — prefix varies per iCIMS instance (e.g. "-1_" or "2021713_")
    const addrPrefix = this.findCollectionFieldPrefix(doc, "PersonProfileFields.AddressStreet1");
    await this.selectNativeOption(doc, `${addrPrefix}PersonProfileFields.AddressType`, "15763"); // Home
    await this.fillInputById(doc, `${addrPrefix}PersonProfileFields.AddressStreet1`, profile.streetAddress || profile.address || "");
    await this.fillInputById(doc, `${addrPrefix}PersonProfileFields.AddressCity`, profile.city || profile.currentCity || "");
    await this.fillInputById(doc, `${addrPrefix}PersonProfileFields.AddressZip`, profile.zipcode || profile.zip || profile.postalCode || "");

    // Country (custom dropdown — triggers state dropdown population)
    await this.selectIcimsDropdown(doc, `${addrPrefix}PersonProfileFields.AddressCountry`, profile.country || "United States");
    await Utils.delay(1500); // Wait for state dropdown to populate via AJAX

    // State (custom dropdown — depends on country)
    if (profile.state) {
      await this.selectIcimsDropdown(doc, `${addrPrefix}PersonProfileFields.AddressState`, profile.state);
    }

    // Fill experience collection fields
    await this.fillExperienceFields(doc);

    // Fill education collection fields
    await this.fillEducationFields(doc);

    // Fill known dependent/special fields (hear about us, referral, timezone, salary)
    await this.fillKnownDependentFields(doc);
  }

  // ========================================
  // INPUT HELPERS
  // ========================================

  /**
   * Fill a text/email/password input using native setter for React compatibility.
   */
  async fillTextField(input, value) {
    if (!input || !value) return;
    input.focus();
    await Utils.delay(100);

    // Use native setter to bypass any framework protections
    // Try the element's own window context first (handles iframes),
    // fall back to direct assignment if native setter fails
    try {
      const ownerWindow = input.ownerDocument.defaultView;
      const win = ownerWindow || window;
      const proto = input.tagName === "TEXTAREA"
        ? win.HTMLTextAreaElement.prototype
        : win.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (nativeSetter) {
        nativeSetter.call(input, "");
        nativeSetter.call(input, String(value));
      } else {
        input.value = String(value);
      }
    } catch (e) {
      // Fallback: direct value assignment (works for most iCIMS fields)
      input.value = String(value);
    }

    input.dispatchEvent(new Event("input", { bubbles: true }));
    await Utils.delay(50);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /**
   * Fill an input by its ID, only if it's empty.
   */
  async fillInputById(doc, id, value) {
    if (!value) return;
    const input = doc.getElementById(id);
    if (!input) return;
    // // Skip if already has a value (e.g. pre-filled from resume parsing)
    // if (input.value && input.value.trim()) return;
    await this.fillTextField(input, value);
    await Utils.delay(100);
  }

  /**
   * Select an option in a native <select> element by value or text match.
   */
  async selectNativeOption(doc, selectId, value) {
    const select = doc.getElementById(selectId);
    if (!select || select.tagName !== "SELECT") return;

    // // Already selected?
    // if (select.value && select.value !== "" && select.value !== "-999") return;

    // Try exact value match
    let option = select.querySelector(`option[value="${value}"]`);
    // Try text match
    if (!option) {
      for (const opt of select.options) {
        if (opt.text.toLowerCase().trim() === value.toLowerCase().trim() ||
            opt.title?.toLowerCase().trim() === value.toLowerCase().trim()) {
          option = opt;
          break;
        }
      }
    }
    // Try partial text match
    if (!option) {
      for (const opt of select.options) {
        if (opt.text.toLowerCase().includes(value.toLowerCase()) ||
            opt.title?.toLowerCase().includes(value.toLowerCase())) {
          option = opt;
          break;
        }
      }
    }

    if (option) {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await Utils.delay(200);
    }
  }

  /**
   * Select an option in an iCIMS custom dropdown (the fake anchor + ul/li system).
   * Falls back to native select if custom dropdown isn't present.
   */
  async selectIcimsDropdown(doc, fieldId, value) {
    const anchor = doc.getElementById(`${fieldId}_icimsDropdown`);
    if (!anchor) {
      return this.selectNativeOption(doc, fieldId, value);
    }

    // // Check if already selected
    // const fakeSelected = doc.getElementById(`${fieldId}_fakeSelected_icimsDropdown`);
    // if (fakeSelected) {
    //   const currentText = fakeSelected.textContent.trim();
    //   if (currentText && !currentText.includes("Make a Selection") && !currentText.includes("Please select")) {
    //     return; // Already has a selection
    //   }
    // }

    // Click to open the dropdown
    anchor.click();
    await Utils.delay(400);

    // Find matching option in the results list
    const resultsList = doc.getElementById(`${fieldId}_dropdown-results`);
    if (!resultsList) {
      anchor.click(); // Close
      return;
    }

    // If the dropdown has a search input, type into it for AJAX dropdowns
    const container = doc.getElementById(`${fieldId}_icimsDropdown_ctnr`);
    if (container) {
      const searchInput = container.querySelector(".dropdown-search:not(.dropdown-invisible)");
      if (searchInput) {
        searchInput.value = value;
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        searchInput.dispatchEvent(new Event("keyup", { bubbles: true }));
        await Utils.delay(800); // Wait for AJAX results
      }
    }

    const options = resultsList.querySelectorAll("li.dropdown-result.result-selectable:not([dropdown-index='-1'])");
    let bestMatch = null;
    let bestScore = 0;

    for (const opt of options) {
      const optText = opt.textContent.trim();
      const score = this.matchScore(optText, value);
      if (score > bestScore) {
        bestMatch = opt;
        bestScore = score;
      }
    }

    if (bestMatch && bestScore >= 50) {
      bestMatch.click();
      await Utils.delay(300);
    } else {
      // Close dropdown if no match
      anchor.click();
    }
  }

  matchScore(optionText, searchText) {
    const a = optionText.toLowerCase().trim();
    const b = searchText.toLowerCase().trim();
    if (a === b) return 100;
    if (a.startsWith(b)) return 80;
    if (a.includes(b)) return 70;
    if (b.includes(a)) return 60;
    return 0;
  }

  // ========================================
  // AI-POWERED FORM FILLING (Questions Page)
  // ========================================

  /**
   * Handle the questions form using AI.
   * Discovers all fields, extracts options from dropdowns, calls AI, fills answers.
   */
  async handleQuestionsForm(doc) {
    const form = doc.getElementById("questions") || doc.getElementById("profileForm") || doc.querySelector("form");
    if (!form) {
      console.log("⚠️ Questions form not found");
      return false;
    }

    // Check if this is a demographics/diversity survey (different DOM structure)
    if (this.isDemographicsForm(form)) {
      return await this.handleDemographicsForm(doc, form);
    }

    // Step 1: Fill known dependent fields first (order matters)
    await this.fillKnownDependentFields(doc);

    // Step 2: Discover all form fields with their options
    const fields = await this.getAllFormFields(doc, form);
    console.log(`📋 Found ${fields.length} fields on questions page`);

    if (fields.length === 0) return false;

    let filledCount = 0;

    // Step 3: For each field, get AI answer and fill
    for (const field of fields) {
      try {
        if (this.isFieldAlreadyFilled(doc, field)) {
          console.log(`⏭️ Skipping pre-filled: ${field.label}`);
          continue;
        }

        // Check for hardcoded answers first (e.g. "How did you hear about us?" → LinkedIn)
        let answer = this.getKnownAnswer(field);

        if (answer === null) {
          const context = {
            fieldType: field.type,
            fieldContext: this.buildFieldContext(field),
            required: field.required,
            platform: "icims",
            userData: this.userData,
            jobDescription: this.jobDescription,
          };

          if (field.options.length > 0 && field.type === "checkbox") {
            answer = await this.aiService.getMultiSelectAnswer(field.label, field.options, context);
          } else if (field.options.length > 0) {
            answer = await this.aiService.getOptionAnswer(field.label, field.options, context);
          } else if (field.type === "textarea") {
            answer = await this.aiService.getLongformAnswer(field.label, [], context);
          } else {
            answer = await this.aiService.getNormalAnswer(field.label, [], context);
          }
        }

        console.log(`📝 Field: "${field.label}" (${field.type}) → "${answer}"`);

        if (answer !== null && answer !== undefined && answer !== "") {
          const success = await this.applyAnswer(doc, field, answer);
          if (success) filledCount++;
        }

        await Utils.delay(300);
      } catch (error) {
        console.error(`❌ Error filling field "${field.label}":`, error);
      }
    }

    // Step 4: Submit
    await Utils.delay(1000);
    // Questions page: #quesp_form_submit_i, Candidate page: #cp_form_submit_i
    const submitButton = doc.getElementById("quesp_form_submit_i")
      || doc.getElementById("eeop_form_submit_i")
      || doc.getElementById("cp_form_submit_i")
      || doc.querySelector("input[type='submit'].iCIMS_PrimaryButton");
    if (submitButton) {
      if (this.copilotMode) {
        notifyStatus({ type: "COPILOT_SUBMIT_READY", data: { buttonText: "Submit" } });
        return "waiting_for_user";
      }
      console.log(`✅ Submitting questions form (filled ${filledCount} fields)`);
      submitButton.click();
      return true;
    }

    return filledCount > 0;
  }

  // ========================================
  // DEMOGRAPHICS / DIVERSITY SURVEY FORM
  // ========================================

  /**
   * Detect if a form is a demographics/diversity survey.
   * These have a completely different DOM structure: plain tables with
   * icims_f_ prefixed checkboxes/radios/selects, no .iCIMS_FieldRow rows.
   */
  isDemographicsForm(form) {
    if (form.querySelector("input[name='form'][value='Applicant_Diversity']")) return true;
    if (form.querySelector("input[id^='icims_f_']")) return true;
    if (form.querySelector("select[id^='icims_f_']")) return true;
    return false;
  }

  /**
   * Handle demographics/diversity survey form.
   * Selects "Choose not to disclose" for all groups by default,
   * or uses profile data if available.
   */
  async handleDemographicsForm(doc, form) {
    console.log("📋 Detected demographics/diversity survey — filling with defaults");

    // 1. Handle all checkbox groups — click "not_disclosed" option for each group
    const notDisclosedCheckboxes = form.querySelectorAll(
      "input[type='checkbox'][id$='_not_disclosed']"
    );
    for (const cb of notDisclosedCheckboxes) {
      if (!cb.checked) {
        cb.click();
        await Utils.delay(200);
      }
    }

    // 2. Handle all radio groups — select "not_disclosed" value
    const radioNames = new Set();
    form.querySelectorAll("input[type='radio']").forEach(r => radioNames.add(r.name));
    for (const name of radioNames) {
      const notDisclosed = form.querySelector(
        `input[type='radio'][name='${name}'][value='not_disclosed']`
      );
      if (notDisclosed && !notDisclosed.checked) {
        notDisclosed.click();
        await Utils.delay(200);
      }
    }

    // 3. Handle all select dropdowns — choose "Choose not to disclose"
    const selects = form.querySelectorAll("select");
    for (const select of selects) {
      if (select.value && select.value !== "") continue; // Already selected
      for (const opt of select.options) {
        if (opt.text.toLowerCase().includes("not to disclose")) {
          select.value = opt.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          await Utils.delay(200);
          break;
        }
      }
    }

    // 4. Submit
    await Utils.delay(1000);
    const submitButton = form.querySelector("input[type='submit']")
      || doc.getElementById("quesp_form_submit_i")
      || doc.getElementById("eeop_form_submit_i")
      || doc.getElementById("cp_form_submit_i")
      || doc.querySelector("input[type='submit'].iCIMS_PrimaryButton");
    if (submitButton) {
      if (this.copilotMode) {
        notifyStatus({ type: "COPILOT_SUBMIT_READY", data: { buttonText: "Submit Demographics" } });
        return "waiting_for_user";
      }
      console.log("✅ Submitting demographics form");
      submitButton.click();
      return true;
    }

    console.log("⚠️ Demographics submit button not found");
    return false;
  }

  // ========================================
  // FIELD DISCOVERY
  // ========================================

  /**
   * Discover all fillable fields in an iCIMS form.
   * Returns array of { element, id, type, label, required, options }.
   */
  async getAllFormFields(doc, form) {
    const fields = [];
    // Candidate page uses .iCIMS_FieldRow, questions page uses .iCIMS_TableRow
    const rows = form.querySelectorAll(".iCIMS_FieldRow, .iCIMS_TableRow");

    for (const row of rows) {
      // Skip submit button rows and non-field rows
      if (row.querySelector(".iCIMS_SubmitButtonCell")) continue;
      if (!row.querySelector("label[for]")) continue;

      const field = await this.processFieldRow(doc, row);
      if (field) fields.push(field);
    }

    return fields;
  }

  /**
   * Process a single iCIMS field row to extract field info + options.
   */
  async processFieldRow(doc, row) {
    // Candidate page: label[id^='label_'], Questions page: label.iCIMS_LabelText[for]
    const labelEl = row.querySelector("label[id^='label_']") || row.querySelector("label[for]");
    if (!labelEl) return null;

    const label = labelEl.textContent.trim().replace(/\*\s*$/, "").trim();
    const forAttr = labelEl.getAttribute("for");
    if (!forAttr) return null;

    const element = doc.getElementById(forAttr);
    if (!element) return null;

    // Check required
    const requiredStar = row.querySelector(".Field_RequiredStar");
    const required = !!requiredStar || element.getAttribute("i_required") === "true" || element.hasAttribute("required");

    // Skip file inputs and password fields
    if (element.type === "file" || element.type === "password") return null;

    // Determine field type and extract options
    if (element.tagName === "SELECT") {
      return await this.processSelectFieldForAI(doc, element, forAttr, label, required);
    } else if (element.tagName === "TEXTAREA") {
      return { element, id: forAttr, type: "textarea", label, required, options: [] };
    } else if (element.tagName === "INPUT") {
      if (element.type === "radio" || element.type === "checkbox") {
        return this.processRadioCheckboxGroup(doc, row, element, forAttr, label, required);
      }
      return { element, id: forAttr, type: element.type || "text", label, required, options: [] };
    }

    return null;
  }

  /**
   * Process a SELECT field — detect iCIMS dropdown vs native select, extract options.
   *
   * Two iCIMS dropdown types:
   *   1. Non-searchable (icimsdropdown-search="0"): static options pre-loaded in <li> elements
   *   2. Searchable (icimsdropdown-search="1"): AJAX-loaded options, visible search input
   */
  async processSelectFieldForAI(doc, element, fieldId, label, required) {
    const isIcimsDropdown = element.getAttribute("icimsdropdown-enabled") === "1";

    if (isIcimsDropdown) {
      const isSearchable = element.getAttribute("icimsdropdown-search") === "1";
      const options = await this.extractIcimsDropdownOptions(doc, fieldId);
      return {
        element, id: fieldId,
        type: isSearchable ? "icims-dropdown-searchable" : "icims-dropdown",
        label, required, options,
      };
    }

    // Native <select>
    const options = this.extractNativeSelectOptions(element);
    return { element, id: fieldId, type: "select", label, required, options };
  }

  /**
   * Extract options from an iCIMS custom dropdown.
   * Reads <li> elements from the dropdown results list.
   * If no options found (AJAX not yet loaded), opens dropdown to trigger load.
   */
  async extractIcimsDropdownOptions(doc, fieldId) {
    let options = this.readDropdownListItems(doc, fieldId);

    // If no options in DOM yet, open the dropdown to trigger AJAX load
    if (options.length === 0) {
      const anchor = doc.getElementById(`${fieldId}_icimsDropdown`);
      if (anchor) {
        anchor.click();
        await Utils.delay(800);
        options = this.readDropdownListItems(doc, fieldId);
        anchor.click(); // Close
        await Utils.delay(300);
      }
    }

    return options;
  }

  /**
   * Read option texts from a dropdown's <li> result items.
   */
  readDropdownListItems(doc, fieldId) {
    const options = [];
    const resultsList = doc.getElementById(`${fieldId}_dropdown-results`);
    if (!resultsList) return options;

    const items = resultsList.querySelectorAll(
      "li.dropdown-result.result-selectable:not([dropdown-index='-1'])"
    );
    for (const item of items) {
      const text = item.getAttribute("title") || item.textContent.trim();
      if (text && !text.includes("Make a Selection") && !text.includes("Please select")) {
        options.push(text);
      }
    }
    return options;
  }

  /**
   * Extract options from a native <select> element.
   */
  extractNativeSelectOptions(element) {
    const options = [];
    for (const opt of element.options) {
      const text = opt.textContent.trim();
      if (text && opt.value && opt.value !== "" && opt.value !== "-999" &&
          !text.toLowerCase().includes("select") && text !== "---") {
        options.push(text);
      }
    }
    return options;
  }

  /**
   * Process radio/checkbox group — extract all options from the group.
   */
  processRadioCheckboxGroup(doc, row, element, fieldId, label, required) {
    const options = [];
    const elements = [];
    const name = element.name;

    if (name) {
      const group = doc.querySelectorAll(`input[name="${name}"]`);
      for (const input of group) {
        const inputLabel = doc.querySelector(`label[for="${input.id}"]`);
        if (inputLabel) {
          const text = inputLabel.textContent.trim();
          if (text) {
            options.push(text);
            elements.push(input);
          }
        }
      }
    }

    // Only process from the first element in the group (avoid duplicates)
    if (elements.length > 0 && elements[0] !== element) return null;

    if (elements.length === 0) elements.push(element);

    return {
      element: elements.length === 1 ? elements[0] : elements,
      id: fieldId, type: element.type, label, required, options,
    };
  }

  // ========================================
  // AI ANSWER APPLICATION
  // ========================================

  /**
   * Apply an AI answer to a form field.
   */
  async applyAnswer(doc, field, answer) {
    if (!answer) return false;

    const { type } = field;

    if (type === "icims-dropdown" || type === "icims-dropdown-searchable") {
      const bestMatch = this.findBestMatchingOption(answer, field.options);
      if (!bestMatch) {
        console.warn(`⚠️ No matching option for "${answer}" in ${field.label}`);
        return false;
      }
      await this.selectIcimsDropdown(doc, field.id, bestMatch);
      return true;
    }

    if (type === "select") {
      const bestMatch = this.findBestMatchingOption(answer, field.options);
      if (!bestMatch) return false;
      await this.selectNativeOption(doc, field.id, bestMatch);
      return true;
    }

    if (type === "radio") {
      const bestMatch = this.findBestMatchingOption(answer, field.options);
      if (!bestMatch) return false;
      const elements = Array.isArray(field.element) ? field.element : [field.element];
      for (let i = 0; i < field.options.length; i++) {
        if (field.options[i] === bestMatch && elements[i]) {
          elements[i].click();
          await Utils.delay(200);
          return true;
        }
      }
      return false;
    }

    if (type === "checkbox") {
      const answers = Array.isArray(answer) ? answer : [answer];
      const elements = Array.isArray(field.element) ? field.element : [field.element];
      let checked = false;
      for (const ans of answers) {
        const bestMatch = this.findBestMatchingOption(ans, field.options);
        if (!bestMatch) continue;
        for (let i = 0; i < field.options.length; i++) {
          if (field.options[i] === bestMatch && elements[i] && !elements[i].checked) {
            elements[i].click();
            await Utils.delay(200);
            checked = true;
          }
        }
      }
      return checked;
    }

    // Text, email, textarea, etc.
    const el = Array.isArray(field.element) ? field.element[0] : field.element;
    await this.fillTextField(el, answer);
    return true;
  }

  /**
   * Find the best matching option from a list using fuzzy matching.
   */
  findBestMatchingOption(aiValue, options) {
    if (!aiValue || !options || options.length === 0) return null;

    const normalized = String(aiValue).toLowerCase().trim();

    // Exact match
    for (const opt of options) {
      if (opt.toLowerCase().trim() === normalized) return opt;
    }

    // Substring match
    for (const opt of options) {
      const normOpt = opt.toLowerCase().trim();
      if (normOpt.includes(normalized) || normalized.includes(normOpt)) return opt;
    }

    // Word-based scoring
    const aiWords = normalized.split(/\s+/);
    let bestMatch = null;
    let bestScore = 0;

    for (const opt of options) {
      const optWords = opt.toLowerCase().trim().split(/\s+/);
      let matching = 0;
      for (const w of aiWords) {
        if (optWords.some(ow => ow.includes(w) || w.includes(ow))) matching++;
      }
      const score = matching / Math.max(aiWords.length, optWords.length);
      if (score > bestScore && score > 0.3) {
        bestScore = score;
        bestMatch = opt;
      }
    }

    return bestMatch;
  }

  /**
   * Check if a field already has a value.
   */
  isFieldAlreadyFilled(doc, field) {
    const el = Array.isArray(field.element) ? field.element[0] : field.element;
    if (!el) return false;

    // iCIMS custom dropdown — check fake selected text
    if (field.type === "icims-dropdown" || field.type === "icims-dropdown-searchable") {
      const fakeSelected = doc.getElementById(`${field.id}_fakeSelected_icimsDropdown`);
      if (fakeSelected) {
        const text = fakeSelected.textContent.trim();
        return text && !text.includes("Make a Selection") && !text.includes("Please select");
      }
    }

    // Native select
    if (el.tagName === "SELECT") {
      return el.value && el.value !== "" && el.value !== "-999";
    }

    // Radio/checkbox
    if (el.type === "radio" || el.type === "checkbox") {
      const elements = Array.isArray(field.element) ? field.element : [el];
      return elements.some(e => e.checked);
    }

    // Text/textarea
    return el.value && el.value.trim() !== "";
  }

  // ========================================
  // EXPERIENCE COLLECTION FIELDS
  // ========================================

  /**
   * Fill experience collection fields from userData.experience array.
   * Clicks "Add More" for each additional experience entry.
   *
   * iCIMS HTML structure:
   *   <h2 class="iCIMS_SubHeader">Experience</h2>
   *   <div class="iCIMS_CollectionContainer rcf3211-1-Container">
   *     <fieldset class="iCIMS_CollectionGroup">  ← one per entry
   *       <div data-collection="rcf3211" data-index="1"> ← one per field row
   *       ...
   *     </fieldset>
   *     <a id="rcf3211Button_-1" onclick="showGroup(...)">Add More</a>
   *   </div>
   */
  async fillExperienceFields(doc) {
    const experiences = this.userData.experience || [];
    if (!experiences.length) {
      console.log("⏭️ No experience data to fill");
      return;
    }

    // Find the experience collection ID from the DOM
    const collectionId = this.findExperienceCollectionId(doc);
    if (!collectionId) {
      console.log("⏭️ No experience collection found on page");
      return;
    }

    console.log(`📋 Found experience collection: ${collectionId}, filling ${experiences.length} entries`);

    for (let i = 0; i < experiences.length; i++) {
      const exp = experiences[i];

      // For entries beyond the first, click "Add More"
      if (i > 0) {
        const addMoreBtn = doc.getElementById(`${collectionId}Button_-1`)
          || doc.querySelector(`a[onclick*="showGroup('${collectionId}'"]`);
        if (addMoreBtn) {
          console.log(`➕ Clicking "Add More" for experience entry ${i + 1}`);
          this.safeClick(addMoreBtn);
          await Utils.delay(1500);
        } else {
          console.log(`⚠️ "Add More" button not found — stopping at ${i} entries`);
          break;
        }
      }

      // Each experience entry is wrapped in a <fieldset class="iCIMS_CollectionGroup">
      // Get all fieldsets that belong to this collection
      const fieldsets = this.getCollectionFieldsets(doc, collectionId);
      const targetFieldset = i < fieldsets.length ? fieldsets[i] : fieldsets[fieldsets.length - 1];

      if (!targetFieldset) {
        console.log(`⚠️ Could not find fieldset for experience entry ${i + 1}`);
        continue;
      }

      console.log(`📝 Filling experience entry ${i + 1}: ${exp.title || ""} at ${exp.company || ""}`);
      await this.fillExperienceGroup(doc, targetFieldset, exp);
      await Utils.delay(500);
    }
  }

  /**
   * Get all <fieldset> containers that belong to a collection.
   * Each fieldset contains all the field rows for one experience entry.
   */
  getCollectionFieldsets(doc, collectionId) {
    const allFieldsets = doc.querySelectorAll("fieldset.iCIMS_CollectionGroup");
    return Array.from(allFieldsets).filter(fs =>
      fs.querySelector(`[data-collection="${collectionId}"]`) !== null
    );
  }

  /**
   * Find the experience collection ID by scanning section headers and collection groups.
   */
  findExperienceCollectionId(doc) {
    // Try generic header search first
    const id = this.findCollectionIdByHeader(doc, "experience");
    if (id) return id;

    // Fallback: Find a collection group containing employer labels
    const fieldsets = doc.querySelectorAll("fieldset.iCIMS_CollectionGroup");
    for (const fs of fieldsets) {
      const labels = fs.querySelectorAll("label");
      for (const label of labels) {
        const text = label.textContent.toLowerCase();
        if (text.includes("employer")) {
          const collEl = fs.querySelector("[data-collection]");
          if (collEl) return collEl.getAttribute("data-collection");
        }
      }
    }

    return null;
  }

  /**
   * Fill a single experience fieldset with data from one experience entry.
   * The fieldset contains all field rows (Employer, Title, State, Dates, Description, etc.).
   */
  async fillExperienceGroup(doc, fieldset, exp) {
    // Fill text/select fields found by label
    const labels = fieldset.querySelectorAll("label[for]");

    for (const label of labels) {
      const text = label.textContent.toLowerCase().trim().replace(/\*\s*$/, "").trim();
      const forAttr = label.getAttribute("for");
      if (!forAttr) continue;

      const element = doc.getElementById(forAttr);
      if (!element) continue;

      if (text.includes("employer") || text.includes("company name")) {
        await this.fillTextField(element, exp.company || "");
      } else if (text.includes("title") && !text.includes("courtesy")) {
        await this.fillTextField(element, exp.title || "");
      } else if (text.includes("description") || text.includes("responsibilities") || text.includes("duties")) {
        await this.fillTextField(element, exp.description || "");
      } else if (text.includes("reason for leaving")) {
        if (exp.reasonForLeaving) {
          await this.fillTextField(element, exp.reasonForLeaving);
        }
      } else if (text.includes("state") || text.includes("province")) {
        const state = exp.state || this.userData.state || "";
        if (state) {
          const isIcimsDropdown = element.getAttribute("icimsdropdown-enabled") === "1";
          if (isIcimsDropdown) {
            await this.selectIcimsDropdown(doc, element.id, state);
          } else if (element.tagName === "SELECT") {
            await this.selectNativeOption(doc, element.id, state);
          }
        }
      } else if (text.includes("country")) {
        const country = exp.country || this.userData.country || "United States";
        const isIcimsDropdown = element.getAttribute("icimsdropdown-enabled") === "1";
        if (isIcimsDropdown) {
          await this.selectIcimsDropdown(doc, element.id, country);
        } else if (element.tagName === "SELECT") {
          await this.selectNativeOption(doc, element.id, country);
        }
        await Utils.delay(1000);
      }

      await Utils.delay(200);
    }

    // Handle date fields — these have labels WITHOUT for attributes
    // e.g. <label id="label_-1_PersonProfileFields.rcf3214">
    //        <span>Start Date (best estimate)</span>
    //      </label>
    // Selects: rcf3214_Month, rcf3214_Date (day), rcf3214_Year
    await this.fillExperienceDateFields(doc, fieldset, "start", exp.startDate);
    await this.fillExperienceDateFields(doc, fieldset, "end", exp.endDate);
  }

  /**
   * Fill date sub-fields (Month select, Day select, Year input) within an experience fieldset.
   * iCIMS date fields have IDs ending in _Month, _Date (day), _Year.
   */
  async fillExperienceDateFields(doc, fieldset, dateType, dateStr) {
    if (!dateStr) return;

    const parsed = this.parseMonthYear(dateStr);
    if (!parsed) {
      console.log(`⚠️ Could not parse date: "${dateStr}"`);
      return;
    }

    // Find the date row by scanning ALL labels (including those without for attr)
    // Look for labels whose text contains "start date" or "end date"
    const allLabels = fieldset.querySelectorAll("label");
    let dateRow = null;

    for (const label of allLabels) {
      const text = label.textContent.toLowerCase();
      if (text.includes(dateType) && text.includes("date")) {
        // The date row is the closest iCIMS row container
        dateRow = label.closest("[data-collection]")
          || label.closest(".iCIMS_FieldRow_Inline")
          || label.closest(".iCIMS_FieldRow")
          || label.closest(".iCIMS_TableRow")
          || label.closest("[role='group']");
        break;
      }
    }

    if (!dateRow) {
      console.log(`⚠️ ${dateType} date row not found in experience fieldset`);
      return;
    }

    // Find Month, Day selects and Year input within the date row
    // iCIMS IDs: {fieldId}_Month, {fieldId}_Date (day), {fieldId}_Year
    const selects = dateRow.querySelectorAll("select");
    const textInputs = dateRow.querySelectorAll("input[type='text'], input:not([type])");

    for (const select of selects) {
      const id = (select.id || "").toLowerCase();
      const name = (select.name || "").toLowerCase();

      if (id.includes("_month") || name.includes("_month")) {
        await this.selectMonthOption(select, parsed.month);
      } else if (id.includes("_date") || id.includes("_day") || name.includes("_date") || name.includes("_day")) {
        // Day select — default to 1 since we only have month/year
        for (const opt of select.options) {
          if (opt.value === "1" || opt.text.trim() === "1") {
            select.value = opt.value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            break;
          }
        }
      }
      await Utils.delay(200);
    }

    // Year is a text input with ID ending in _Year
    for (const input of textInputs) {
      const id = (input.id || "").toLowerCase();
      const name = (input.name || "").toLowerCase();

      if (id.includes("_year") || name.includes("_year")) {
        await this.fillTextField(input, parsed.year);
        break;
      }
    }
  }

  /**
   * Select the correct month option in a month <select>.
   * Handles both full ("January") and abbreviated ("Jan") option texts.
   */
  async selectMonthOption(select, monthName) {
    const monthLower = monthName.toLowerCase();
    const monthShort = monthLower.substring(0, 3);

    for (const opt of select.options) {
      const text = opt.text.trim().toLowerCase();
      if (text === monthLower || text === monthShort || text.startsWith(monthShort)) {
        select.value = opt.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
    }
    console.log(`⚠️ Month option not found for: ${monthName}`);
  }

  /**
   * Parse a date string like "Mar 2025", "January 2022", or "Aug 2024" into { month, year }.
   */
  parseMonthYear(dateStr) {
    if (!dateStr) return null;

    const monthMap = {
      jan: "January", january: "January",
      feb: "February", february: "February",
      mar: "March", march: "March",
      apr: "April", april: "April",
      may: "May",
      jun: "June", june: "June",
      jul: "July", july: "July",
      aug: "August", august: "August",
      sep: "September", sept: "September", september: "September",
      oct: "October", october: "October",
      nov: "November", november: "November",
      dec: "December", december: "December",
    };

    const parts = dateStr.trim().split(/\s+/);
    if (parts.length < 2) return null;

    const monthKey = parts[0].toLowerCase();
    const year = parts[parts.length - 1];

    const month = monthMap[monthKey];
    if (!month || !/^\d{4}$/.test(year)) return null;

    return { month, year };
  }

  // ========================================
  // EDUCATION COLLECTION FIELDS
  // ========================================

  /**
   * Fill education collection fields from userData.education.
   * Structure mirrors experience: fieldset per entry, "Add More" for additional.
   *
   * Fields: School (iCIMS searchable dropdown), Other School (text),
   *   Degree (iCIMS searchable dropdown), Major (iCIMS searchable dropdown),
   *   GPA (text), Minor (text), Did You Graduate? (native select)
   */
  async fillEducationFields(doc) {
    const education = this.userData.education;
    const entries = Array.isArray(education) ? education : education ? [education] : [];
    if (!entries.length) {
      console.log("⏭️ No education data to fill");
      return;
    }

    // Find the education collection ID
    const collectionId = this.findCollectionIdByHeader(doc, "education");
    if (!collectionId) {
      console.log("⏭️ No education collection found on page");
      return;
    }

    console.log(`📋 Found education collection: ${collectionId}, filling ${entries.length} entries`);

    for (let i = 0; i < entries.length; i++) {
      const edu = entries[i];

      if (i > 0) {
        const addMoreBtn = doc.getElementById(`${collectionId}Button_-1`)
          || doc.querySelector(`a[onclick*="showGroup('${collectionId}'"]`);
        if (addMoreBtn) {
          console.log(`➕ Clicking "Add More" for education entry ${i + 1}`);
          this.safeClick(addMoreBtn);
          await Utils.delay(1500);
        } else {
          console.log(`⚠️ "Add More" button not found — stopping at ${i} entries`);
          break;
        }
      }

      const fieldsets = this.getCollectionFieldsets(doc, collectionId);
      const targetFieldset = i < fieldsets.length ? fieldsets[i] : fieldsets[fieldsets.length - 1];

      if (!targetFieldset) {
        console.log(`⚠️ Could not find fieldset for education entry ${i + 1}`);
        continue;
      }

      console.log(`📝 Filling education entry ${i + 1}: ${edu.school || ""}`);
      await this.fillEducationGroup(doc, targetFieldset, edu);
      await Utils.delay(500);
    }
  }

  /**
   * Fill a single education fieldset.
   */
  async fillEducationGroup(doc, fieldset, edu) {
    const labels = fieldset.querySelectorAll("label[for]");

    for (const label of labels) {
      const text = label.textContent.toLowerCase().trim().replace(/\*\s*$/, "").trim();
      const forAttr = label.getAttribute("for");
      if (!forAttr) continue;

      const element = doc.getElementById(forAttr);
      if (!element) continue;

      const isIcimsDropdown = element.getAttribute("icimsdropdown-enabled") === "1";

      if (text === "school" || (text.includes("school") && !text.includes("other"))) {
        if (edu.school) {
          if (isIcimsDropdown) {
            await this.selectIcimsDropdown(doc, element.id, edu.school);
          } else {
            await this.fillTextField(element, edu.school);
          }
        }
      } else if (text.includes("other school")) {
        // Fill "Other School" as fallback with school name
        if (edu.school) {
          await this.fillTextField(element, edu.school);
        }
      } else if (text.includes("degree")) {
        if (edu.degree) {
          const mapped = this.mapDegreeValue(edu.degree);
          if (isIcimsDropdown) {
            await this.selectIcimsDropdown(doc, element.id, mapped);
          } else if (element.tagName === "SELECT") {
            await this.selectNativeOption(doc, element.id, mapped);
          }
        }
      } else if (text === "major" || text.includes("major")) {
        if (edu.major) {
          if (isIcimsDropdown) {
            await this.selectIcimsDropdown(doc, element.id, edu.major);
          } else {
            await this.fillTextField(element, edu.major);
          }
        }
      } else if (text === "minor" || text.includes("minor")) {
        if (edu.minor) {
          await this.fillTextField(element, edu.minor);
        }
      } else if (text === "gpa" || text.includes("gpa")) {
        if (edu.gpa) {
          await this.fillTextField(element, edu.gpa);
        }
      } else if (text.includes("graduate")) {
        // "Did You Graduate?" → Yes if endDate exists, otherwise select Yes
        const answer = "Yes";
        if (element.tagName === "SELECT") {
          await this.selectNativeOption(doc, element.id, answer);
        }
      }

      await Utils.delay(300);
    }
  }

  /**
   * Map common degree names to values iCIMS dropdowns recognize.
   * e.g. "bachelor" → "Bachelor of Science", "master" → "MS"
   */
  mapDegreeValue(degree) {
    if (!degree) return "";
    const lower = degree.toLowerCase().trim();
    const map = {
      "bachelor": "Bachelor of Science",
      "bachelors": "Bachelor of Science",
      "bachelor's": "Bachelor of Science",
      "bs": "BS",
      "ba": "BA",
      "bcs": "BCS",
      "master": "MS",
      "masters": "MS",
      "master's": "MS",
      "phd": "PhD",
      "doctorate": "PhD",
      "associate": "AS",
      "associates": "AS",
      "associate's": "AS",
      "mba": "MBA",
    };
    return map[lower] || degree;
  }

  /**
   * Generic: find a collection ID by header text.
   * Searches h2.iCIMS_SubHeader, legends, and label text within fieldsets.
   */
  findCollectionIdByHeader(doc, headerText) {
    const lower = headerText.toLowerCase();

    // Strategy 1: h2 headers
    const headers = doc.querySelectorAll(
      "h2.iCIMS_SubHeader, h2.iCIMS_SubHeader_Candidate, .iCIMS_CollectionHeader, .iCIMS_InfoMsg_SubHeader, h3, h4"
    );
    for (const header of headers) {
      if (header.textContent.toLowerCase().includes(lower)) {
        const parent = header.parentElement;
        if (parent) {
          const nested = parent.querySelector("[data-collection]");
          if (nested) return nested.getAttribute("data-collection");
        }
        let sibling = header.nextElementSibling;
        for (let j = 0; j < 10 && sibling; j++) {
          const nested = sibling.querySelector("[data-collection]");
          if (nested) return nested.getAttribute("data-collection");
          const collAttr = sibling.getAttribute?.("data-collection");
          if (collAttr) return collAttr;
          sibling = sibling.nextElementSibling;
        }
      }
    }

    // Strategy 2: fieldset legends
    const legends = doc.querySelectorAll("fieldset.iCIMS_CollectionGroup legend");
    for (const legend of legends) {
      if (legend.textContent.toLowerCase().includes(lower)) {
        const fs = legend.closest("fieldset");
        const collEl = fs?.querySelector("[data-collection]");
        if (collEl) return collEl.getAttribute("data-collection");
      }
    }

    return null;
  }

  /**
   * Fill known dependent field pairs before the AI loop.
   * "How did you hear about us?" must be filled first so "referral name" options populate.
   */
  async fillKnownDependentFields(doc) {
    // "How did you hear about us?" → randomly select from available options
    const hearAboutField = this.findFieldByLabel(doc, "how did you hear");
    if (hearAboutField && (!hearAboutField.value || hearAboutField.value === "")) {
      const randomOption = this.pickRandomOption(hearAboutField, ["referr", "other"]);
      if (randomOption) {
        await this.selectNativeOption(doc, hearAboutField.id, randomOption);
      }
      await Utils.delay(1000); // Wait for dependent field to populate (SourceChange)
    }

    // "Please specify further" → randomly select from available options (depends on above)
    const specifyField = this.findFieldByLabel(doc, "specify further");
    if (specifyField && (!specifyField.value || specifyField.value === "")) {
      const randomOption = this.pickRandomOption(specifyField);
      if (randomOption) {
        await this.selectNativeOption(doc, specifyField.id, randomOption);
      }
      await Utils.delay(200);
    }

    // "Please enter your referrals name" → randomly select from available options
    const referralField = this.findFieldByLabel(doc, "referral");
    if (referralField && (!referralField.value || referralField.value === "")) {
      const randomOption = this.pickRandomOption(referralField);
      if (randomOption) {
        await this.selectNativeOption(doc, referralField.id, randomOption);
      }
      await Utils.delay(200);
    }

    // SMS consent → No (iCIMS custom dropdown)
    const smsField = this.findFieldByLabel(doc, "sms") || this.findFieldByLabel(doc, "text message");
    if (smsField) {
      const isIcimsDropdown = smsField.getAttribute("icimsdropdown-enabled") === "1";
      if (isIcimsDropdown) {
        await this.selectIcimsDropdown(doc, smsField.id, "No");
      } else {
        await this.selectNativeOption(doc, smsField.id, "No");
      }
      await Utils.delay(200);
    }

    // Consent fields (e.g. Loom Notetaker, interview recording) → Yes
    const consentField = this.findFieldByLabel(doc, "do you consent");
    if (consentField) {
      const isIcimsDropdown = consentField.getAttribute("icimsdropdown-enabled") === "1";
      if (isIcimsDropdown) {
        await this.selectIcimsDropdown(doc, consentField.id, "Yes");
      } else if (consentField.tagName === "SELECT") {
        await this.selectNativeOption(doc, consentField.id, "Yes");
      }
      await Utils.delay(200);
    }

    // Time Zone — find by label, map profile IANA timezone to UTC offset
    const timezone = this.userData.timezone || "";
    if (timezone) {
      const tzOffset = this.mapTimezoneToOffset(timezone);
      if (tzOffset) {
        const tzField = this.findFieldByLabel(doc, "time zone") || this.findFieldByLabel(doc, "timezone");
        if (tzField) {
          console.log(`🕐 Filling timezone: ${timezone} → ${tzOffset} (field: ${tzField.id})`);
          await this.selectTimezoneDropdown(doc, tzField.id, tzOffset);
          await Utils.delay(200);
        }
      }
    }

    // Salary fields — find by class .iCIMS_Forms_SalaryField, fill with AI answer
    const salarySpans = doc.querySelectorAll(".iCIMS_Forms_SalaryField");
    for (const span of salarySpans) {
      const amountInput = span.querySelector(".salary input[type='text']");
      if (amountInput && !amountInput.value) {
        // Try to find label from parent form row
        const row = span.closest(".iCIMS_FieldRow, .iCIMS_TableRow");
        const labelEl = row ? row.querySelector("label[id^='label_'], label[for]") : null;
        const label = labelEl ? labelEl.textContent.trim().replace(/\*\s*$/, "").trim() : "Desired Salary";

        const context = {
          fieldType: amountInput.type || "text",
          fieldContext: "salary/compensation field requiring numeric input only",
          required: true,
          platform: "icims",
          userData: this.userData,
          jobDescription: this.jobDescription,
        };
        const numericSalary = await this.aiService.getSalaryAnswer(label, [], context);
        if (numericSalary) {
          await this.fillTextField(amountInput, numericSalary);
          await Utils.delay(200);
        }
      }
    }

    // EEO fields (Veteran, Gender, Race, Disability) — appear on candidate AND questions pages
    // Profile values may be booleans or "true"/"false" strings, need mapping to option text
    const eeoFields = [
      { search: "veteran", value: this.userData.veteranStatus, fallback: "Opt Out" },
      { search: "gender", value: this.userData.gender, fallback: "Decline to Self Identify" },
      { search: "race", value: this.userData.race || this.userData.ethnicity, fallback: "Decline to Self Identify" },
      { search: "disability", value: this.userData.disabilityStatus, fallback: "I don't wish to answer" },
    ];

    for (const eeo of eeoFields) {
      const field = this.findFieldByLabel(doc, eeo.search);
      if (!field) continue;
      // Map boolean-like values: "true"/true → "Yes", "false"/false → "No"
      const answer = this.mapBooleanToOption(eeo.value, eeo.fallback);
      const isIcimsDropdown = field.getAttribute("icimsdropdown-enabled") === "1";
      if (isIcimsDropdown) {
        await this.selectIcimsDropdown(doc, field.id, answer);
      } else {
        await this.selectNativeOption(doc, field.id, answer);
      }
      await Utils.delay(200);
    }
  }

  /**
   * Map boolean-like profile values to option text.
   * "true"/true → "Yes", "false"/false → "No", otherwise return as-is or fallback.
   */
  mapBooleanToOption(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    const str = String(value).toLowerCase().trim();
    if (str === "true" || str === "yes") return "Yes";
    if (str === "false" || str === "no") return "No";
    return String(value); // pass through actual text values like "Decline to Self Identify"
  }

  /**
   * Select a timezone from an iCIMS dropdown by UTC offset.
   * Opens the dropdown and directly clicks the <li> whose title starts with the offset.
   * Falls back to typing in the search input if direct match fails.
   */
  async selectTimezoneDropdown(doc, fieldId, utcOffset) {
    const anchor = doc.getElementById(`${fieldId}_icimsDropdown`);
    if (!anchor) {
      // Fall back to native select
      return this.selectNativeOption(doc, fieldId, utcOffset);
    }

    // Check if already selected
    const fakeSelected = doc.getElementById(`${fieldId}_fakeSelected_icimsDropdown`);
    if (fakeSelected) {
      const currentText = fakeSelected.textContent.trim();
      if (currentText && !currentText.includes("Make a Selection") && !currentText.includes("Please select")) {
        return;
      }
    }

    // Open dropdown
    anchor.click();
    await Utils.delay(500);

    // Directly scan <li> options for one starting with the UTC offset
    const resultsList = doc.getElementById(`${fieldId}_dropdown-results`);
    if (!resultsList) {
      anchor.click();
      return;
    }

    const items = resultsList.querySelectorAll("li.dropdown-result.result-selectable:not([dropdown-index='-1'])");
    for (const item of items) {
      const title = (item.getAttribute("title") || item.textContent).trim();
      if (title.startsWith(utcOffset)) {
        console.log(`🕐 Clicking timezone option: ${title}`);
        item.click();
        await Utils.delay(300);
        return;
      }
    }

    // Fallback: try typing in search input
    const container = doc.getElementById(`${fieldId}_icimsDropdown_ctnr`);
    if (container) {
      const searchInput = container.querySelector(".dropdown-search:not(.dropdown-invisible)");
      if (searchInput) {
        searchInput.value = utcOffset;
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        searchInput.dispatchEvent(new Event("keyup", { bubbles: true }));
        await Utils.delay(800);

        // Re-scan after search
        const filtered = resultsList.querySelectorAll("li.dropdown-result.result-selectable:not([dropdown-index='-1'])");
        for (const item of filtered) {
          const title = (item.getAttribute("title") || item.textContent).trim();
          if (title.startsWith(utcOffset)) {
            item.click();
            await Utils.delay(300);
            return;
          }
        }
      }
    }

    // Close if nothing matched
    console.warn(`⚠️ No timezone option found for offset: ${utcOffset}`);
    anchor.click();
  }

  /**
   * Pick a random valid option from a native <select> element.
   * Skips empty, placeholder, and "Make a Selection" options.
   * @param {HTMLSelectElement} selectEl
   * @param {string[]} excludePatterns - lowercase substrings to exclude (e.g. ["referr"])
   */
  pickRandomOption(selectEl, excludePatterns = []) {
    if (!selectEl || !selectEl.options) return null;
    const validOptions = Array.from(selectEl.options).filter(opt => {
      const text = opt.text.trim();
      const val = opt.value;
      if (!text || !val || val === "" || val === "-999") return false;
      if (text.includes("Make a Selection") || text.includes("Please select")) return false;
      if (text === "---") return false;
      const lower = text.toLowerCase();
      if (excludePatterns.some(p => lower.includes(p))) return false;
      return true;
    });
    if (validOptions.length === 0) return null;
    const pick = validOptions[Math.floor(Math.random() * validOptions.length)];
    return pick.text.trim();
  }

  /**
   * Find a select/input element by searching labels that contain the given text.
   */
  findFieldByLabel(doc, labelText) {
    // Search all labels with a for attribute (works on both candidate and questions pages)
    const labels = doc.querySelectorAll("label[for]");
    for (const label of labels) {
      if (label.textContent.toLowerCase().includes(labelText.toLowerCase())) {
        const forAttr = label.getAttribute("for");
        if (forAttr) {
          const el = doc.getElementById(forAttr);
          if (el) return el;
        }
      }
    }
    return null;
  }

  /**
   * Return a hardcoded answer for known fields, or null to defer to AI.
   */
  getKnownAnswer(field) {
    const label = field.label.toLowerCase();
    if (label.includes("how did you hear") || label.includes("how did you find")) {
      // Randomly pick from available options, excluding referral options
      const nonReferral = field.options.filter(o => !o.toLowerCase().includes("referr") && !o.toLowerCase().includes("other"));
      if (nonReferral.length > 0) {
        return nonReferral[Math.floor(Math.random() * nonReferral.length)];
      }
      return "LinkedIn";
    }
    if (label.includes("specify further")) {
      if (field.options.length > 0) {
        return field.options[Math.floor(Math.random() * field.options.length)];
      }
      return "LinkedIn";
    }
    if (label.includes("referral") || label.includes("referrals name")) {
      if (field.options.length > 0) {
        return field.options[Math.floor(Math.random() * field.options.length)];
      }
      return "Sourced";
    }
    // SMS consent — always decline
    if (label.includes("sms") || label.includes("text message")) {
      return "No";
    }
    // Consent fields (interview recording, Loom Notetaker, etc.) — always accept
    if (label.includes("do you consent")) {
      return "Yes";
    }
    // Time zone — handled in fillKnownDependentFields
    if (label.includes("time zone") || label.includes("timezone")) {
      return this.mapTimezoneToOffset(this.userData.timezone || "") || "skip";
    }
    // Salary fields — defer to AI (handled via regular field processing)
    if (label.includes("desired salary") || label.includes("salary min") || label.includes("salary max")) {
      return null;
    }
    // EEO fields — use profile data if available, map booleans, otherwise decline/opt-out
    if (label.includes("gender")) {
      return this.mapBooleanToOption(this.userData.gender, "Decline to Self Identify");
    }
    if (label.includes("race") || label.includes("ethnicity")) {
      return this.mapBooleanToOption(this.userData.race || this.userData.ethnicity, "Decline to Self Identify");
    }
    if (label.includes("disability") || label.includes("disabled")) {
      return this.mapBooleanToOption(this.userData.disabilityStatus, "I don't wish to answer");
    }
    if (label.includes("veteran") || label.includes("protected veteran")) {
      return this.mapBooleanToOption(this.userData.veteranStatus, "Opt Out");
    }
    return null;
  }

  /**
   * Map profile timezone to iCIMS dropdown UTC offset search text.
   * Profile may provide IANA names ("America/Chicago"), abbreviations ("CST"),
   * or full format ("CST (Central Standard Time)").
   * Dropdown options are like "-06:00 (Etc/GMT+6)".
   */
  mapTimezoneToOffset(tz) {
    if (!tz) return null;

    // Abbreviation map (first word before space)
    const abbrMap = {
      "EST":  "-05:00", "CST":  "-06:00", "MST":  "-07:00", "PST":  "-08:00",
      "AKST": "-09:00", "HST":  "-10:00", "GMT":  "+00:00", "UTC":  "+00:00",
      "CET":  "+01:00", "EET":  "+02:00", "GST":  "+04:00", "IST":  "+05:00",
      "SGT":  "+08:00", "JST":  "+09:00", "AEST": "+10:00", "NZST": "+12:00",
    };

    // IANA timezone map
    const ianaMap = {
      "America/New_York":    "-05:00", "America/Chicago":     "-06:00",
      "America/Denver":      "-07:00", "America/Los_Angeles": "-08:00",
      "America/Anchorage":   "-09:00", "Pacific/Honolulu":    "-10:00",
      "America/Phoenix":     "-07:00", "America/Detroit":     "-05:00",
      "America/Indiana/Indianapolis": "-05:00",
      "America/Toronto":     "-05:00", "America/Vancouver":   "-08:00",
      "America/Winnipeg":    "-06:00", "America/Edmonton":    "-07:00",
      "America/Halifax":     "-04:00", "America/St_Johns":    "-03:30",
      "Europe/London":       "+00:00", "Europe/Paris":        "+01:00",
      "Europe/Berlin":       "+01:00", "Europe/Athens":       "+02:00",
      "Europe/Helsinki":     "+02:00", "Europe/Moscow":       "+03:00",
      "Asia/Dubai":          "+04:00", "Asia/Kolkata":        "+05:00",
      "Asia/Calcutta":       "+05:00", "Asia/Singapore":      "+08:00",
      "Asia/Shanghai":       "+08:00", "Asia/Hong_Kong":      "+08:00",
      "Asia/Tokyo":          "+09:00", "Asia/Seoul":          "+09:00",
      "Australia/Sydney":    "+10:00", "Australia/Melbourne":  "+10:00",
      "Pacific/Auckland":    "+12:00",
    };

    // Try IANA match first (e.g. "America/Chicago")
    if (ianaMap[tz]) return ianaMap[tz];

    // Try abbreviation match (e.g. "CST" or "CST (Central Standard Time)")
    const abbr = tz.split(" ")[0].toUpperCase();
    if (abbrMap[abbr]) return abbrMap[abbr];

    return null;
  }

  /**
   * Build context string for AI.
   */
  buildFieldContext(field) {
    const parts = [
      `Field type: ${field.type}`,
      field.required ? "This field is required" : "This field is optional",
    ];
    if (field.options.length > 0) {
      parts.push(`Available options: ${field.options.join(", ")}`);
      parts.push("You MUST pick one of the available options exactly as written.");
    }
    return parts.join(". ");
  }

  // ========================================
  // UTILITIES
  // ========================================

  /**
   * Find the dynamic prefix for collection fields (phone, address, etc.).
   * iCIMS uses a collection index prefix like "-1_" or "2021713_" that varies
   * per instance. This finds the actual prefix by searching for an element
   * whose ID ends with the given field suffix.
   *
   * @param {Document} doc
   * @param {string} fieldSuffix - e.g. "PersonProfileFields.AddressStreet1"
   * @returns {string} prefix like "-1_" or "2021713_"
   */
  findCollectionFieldPrefix(doc, fieldSuffix) {
    // Only match actual form elements, not labels (which have IDs like "label_..._fieldSuffix")
    const el = doc.querySelector(`select[id$='${fieldSuffix}'], input[id$='${fieldSuffix}'], textarea[id$='${fieldSuffix}']`);
    if (el) {
      const idx = el.id.indexOf(fieldSuffix);
      if (idx > 0) return el.id.substring(0, idx);
    }
    return "-1_"; // fallback to common default
  }

  generatePassword() {
    // Meets iCIMS requirements: min 8 chars, 1 alpha, 1 lower, 1 upper, 1 numeric, 1 special
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const nums = "0123456789";
    const special = "!@#$%^&*";
    const all = lower + upper + nums + special;

    let pw = "";
    pw += upper[Math.floor(Math.random() * upper.length)];
    pw += lower[Math.floor(Math.random() * lower.length)];
    pw += nums[Math.floor(Math.random() * nums.length)];
    pw += special[Math.floor(Math.random() * special.length)];
    for (let i = 0; i < 8; i++) {
      pw += all[Math.floor(Math.random() * all.length)];
    }
    // Shuffle
    return pw.split("").sort(() => Math.random() - 0.5).join("");
  }

  extractJobIdFromUrl() {
    const match = window.location.href.match(/\/jobs\/(\d+)/i);
    return match ? match[1] : null;
  }

  /**
   * Safely click an element, stripping javascript: hrefs first to avoid CSP violations.
   * iCIMS "Add More" buttons are <a href="javascript:..." onclick="showGroup(...)">
   * — CSP blocks the javascript: protocol, but we only need the onclick to fire.
   */
  safeClick(element) {
    const href = element.getAttribute("href");
    if (href && href.startsWith("javascript:")) {
      element.removeAttribute("href");
      element.click();
      element.setAttribute("href", href);
    } else {
      element.click();
    }
  }
}
