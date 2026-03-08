// handlers/workday-experience.ts — Workday "My Experience" Page Auto-Filler
// v5.53: Item #5 — Multi-section employment history, education, date pickers, dynamic dropdowns.
//
// Workday "My Experience" page structure:
//   - Work Experience section: repeatable entries with job title, company, location, dates, description
//   - Education section: repeatable entries with school, degree, field of study, dates, GPA
//   - Certifications section (optional): repeatable entries
//   - Skills section (optional): tag-style input or searchable dropdown
//   - Languages section (optional): dropdown + proficiency
//
// Key Workday DOM patterns on My Experience:
//   - Section headers: [data-automation-id="workExperience"], [data-automation-id="education"]
//   - Entry containers: [data-automation-id*="workExperience-"], [data-automation-id*="education-"]
//   - "Add Another" button: [data-automation-id="Add Another"], button containing "Add"
//   - Date fields: [data-automation-id="dateSectionMonth-display"], [data-automation-id="dateSectionYear-display"]
//   - Calendar popup: [data-automation-id="datePickerMonth"], [data-automation-id="datePickerYear"]
//   - "I currently work here" checkbox: [data-automation-id="currentlyWorkHere"]
//
// The profile.experience[] and profile.education[] arrays from LinkedIn scraping
// provide the data source. Each entry has: title, company, dates, start_date, end_date, location.

import { fillTextInput } from '../fields/textInput.ts';
import { FieldFillerQueue } from '../utils/fieldFillerQueue.ts';

// ============================================================
// WORKDAY EXPERIENCE FIELD MAPPINGS
// ============================================================

const WORK_FIELD_MAP = [
  { automationIds: ['jobTitle', 'job-title', 'jobTitleInput'], key: 'title', label: /job\s*title|position\s*title/i },
  { automationIds: ['company', 'companyInput', 'employer'], key: 'company', label: /company|employer|organization/i },
  { automationIds: ['locationInput', 'location', 'jobLocation'], key: 'location', label: /location|city/i },
  { automationIds: ['description', 'roleDescription', 'descriptionText'], key: 'description', label: /description|responsibilities|summary/i },
];

const EDU_FIELD_MAP = [
  { automationIds: ['school', 'schoolInput', 'institution'], key: 'institution', label: /school|university|college|institution/i },
  { automationIds: ['degree', 'degreeInput'], key: 'degree', label: /degree|diploma/i },
  { automationIds: ['fieldOfStudy', 'field-of-study', 'majorInput'], key: 'major', label: /field\s*of\s*study|major|concentration/i },
  { automationIds: ['gpa', 'gpaInput'], key: 'gpa', label: /gpa|grade\s*point/i },
];

// ============================================================
// MAIN: FILL MY EXPERIENCE PAGE
// ============================================================

/**
 * Fill the Workday "My Experience" page with work history and education.
 * Called from the main workday.js fill loop when it detects the My Experience page.
 *
 * @param {Object} profile - User profile with experience[] and education[]
 * @param {Object} preferences - User preferences (optional fields)
 * @param {FieldFillerQueue} queue - Shared queue for sequenced filling
 * @returns {Object} { filledCount, totalFields, errors }
 */
export async function fillMyExperience(profile, preferences, queue) {
  const errors = [];
  let filledCount = 0;
  let totalFields = 0;

  // ── WORK EXPERIENCE ──
  if (profile.experience && profile.experience.length > 0) {
    const workResult = await fillWorkExperience(profile.experience, queue);
    filledCount += workResult.filledCount;
    totalFields += workResult.totalFields;
    errors.push(...workResult.errors);
  }

  // ── EDUCATION ──
  if (profile.education && profile.education.length > 0) {
    const eduResult = await fillEducation(profile.education, queue);
    filledCount += eduResult.filledCount;
    totalFields += eduResult.totalFields;
    errors.push(...eduResult.errors);
  }

  // ── SKILLS (tag input) ──
  if (profile.skills && profile.skills.length > 0) {
    const skillResult = await fillSkills(profile.skills, queue);
    filledCount += skillResult.filledCount;
    totalFields += skillResult.totalFields;
    errors.push(...skillResult.errors);
  }

  return { filledCount, totalFields, errors };
}

// ============================================================
// WORK EXPERIENCE
// ============================================================

async function fillWorkExperience(entries, queue) {
  const errors = [];
  let filledCount = 0;
  let totalFields = 0;

  // Find work experience section
  const workSection = findSection('workExperience') || findSection('work-experience');
  if (!workSection) {
    console.log('[BJ] Workday: no work experience section found on page');
    return { filledCount, totalFields, errors };
  }

  // Get existing entry containers
  let entryContainers = getEntryContainers(workSection, 'workExperience');

  // Fill each entry, adding more containers if needed
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Need another container? Click "Add Another"
    if (i >= entryContainers.length) {
      const added = await clickAddAnother(workSection);
      if (!added) {
        console.log(`[BJ] Workday: could not add work entry ${i + 1} — stopping`);
        break;
      }
      await delay(1000);
      entryContainers = getEntryContainers(workSection, 'workExperience');
      if (i >= entryContainers.length) break;
    }

    const container = entryContainers[i];
    console.log(`[BJ] Workday: filling work entry ${i + 1}/${entries.length}: ${entry.title || 'untitled'}`);

    // Fill text fields
    for (const mapping of WORK_FIELD_MAP) {
      const input = findFieldInContainer(container, mapping.automationIds, mapping.label);
      if (!input) continue;
      if (input.value && input.value.trim().length > 0) continue;

      const value = entry[mapping.key];
      if (!value) continue;

      totalFields++;
      const fieldLabel = `work[${i}].${mapping.key}`;
      queue.enqueue(async () => {
        const result = await fillTextInput(input, String(value), { humanLike: true });
        if (result.success) filledCount++;
        else errors.push(`${fieldLabel}: ${result.error || 'fill failed'}`);
        return result;
      }, fieldLabel);
    }

    // Fill dates
    const dateResult = await fillWorkDates(container, entry, i, queue);
    filledCount += dateResult.filledCount;
    totalFields += dateResult.totalFields;
    errors.push(...dateResult.errors);

    // "I currently work here" checkbox
    if (!entry.end_date || /present|current/i.test(entry.end_date)) {
      const checkbox = container.querySelector(
        '[data-automation-id="currentlyWorkHere"] input[type="checkbox"], ' +
        'input[type="checkbox"][data-automation-id*="current"]'
      );
      if (checkbox && !checkbox.checked) {
        totalFields++;
        queue.enqueue(async () => {
          checkbox.click();
          await delay(100);
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          filledCount++;
          return { success: true };
        }, `work[${i}].currentlyWorkHere`);
      }
    }

    // Searchable dropdowns (company name, location can be searchable)
    await fillSearchableFields(container, entry, i, 'work', queue);
  }

  await queue.run();
  return { filledCount, totalFields, errors };
}

// ============================================================
// EDUCATION
// ============================================================

async function fillEducation(entries, queue) {
  const errors = [];
  let filledCount = 0;
  let totalFields = 0;

  const eduSection = findSection('education');
  if (!eduSection) {
    console.log('[BJ] Workday: no education section found on page');
    return { filledCount, totalFields, errors };
  }

  let entryContainers = getEntryContainers(eduSection, 'education');

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (i >= entryContainers.length) {
      const added = await clickAddAnother(eduSection);
      if (!added) break;
      await delay(1000);
      entryContainers = getEntryContainers(eduSection, 'education');
      if (i >= entryContainers.length) break;
    }

    const container = entryContainers[i];
    console.log(`[BJ] Workday: filling education entry ${i + 1}/${entries.length}: ${entry.institution || 'unknown'}`);

    // Fill text fields
    for (const mapping of EDU_FIELD_MAP) {
      const input = findFieldInContainer(container, mapping.automationIds, mapping.label);
      if (!input) continue;
      if (input.value && input.value.trim().length > 0) continue;

      const value = entry[mapping.key];
      if (!value) continue;

      totalFields++;
      const fieldLabel = `edu[${i}].${mapping.key}`;
      queue.enqueue(async () => {
        const result = await fillTextInput(input, String(value), { humanLike: true });
        if (result.success) filledCount++;
        else errors.push(`${fieldLabel}: ${result.error || 'fill failed'}`);
        return result;
      }, fieldLabel);
    }

    // Education dates (usually just years or month/year)
    const dateResult = await fillEduDates(container, entry, i, queue);
    filledCount += dateResult.filledCount;
    totalFields += dateResult.totalFields;
    errors.push(...dateResult.errors);

    // Degree dropdown (often a searchable select)
    await fillSearchableFields(container, entry, i, 'edu', queue);
  }

  await queue.run();
  return { filledCount, totalFields, errors };
}

// ============================================================
// SKILLS
// ============================================================

async function fillSkills(skills, queue) {
  const errors = [];
  let filledCount = 0;
  let totalFields = 0;

  const skillSection = findSection('skills') || findSection('skill');
  if (!skillSection) return { filledCount, totalFields, errors };

  // Workday skills: usually a tag-style input or searchable dropdown
  const skillInput = skillSection.querySelector(
    'input[data-automation-id*="skill"], input[data-automation-id*="search"], ' +
    'input[placeholder*="skill" i], input[aria-label*="skill" i]'
  );

  if (!skillInput) return { filledCount, totalFields, errors };

  // Add up to 10 skills
  const maxSkills = Math.min(skills.length, 10);
  for (let i = 0; i < maxSkills; i++) {
    totalFields++;
    const skill = skills[i];
    queue.enqueue(async () => {
      // Type the skill
      await fillTextInput(skillInput, skill, { humanLike: true });
      await delay(600);

      // Look for autocomplete suggestion and click it
      const suggestion = document.querySelector(
        '[data-automation-id*="promptOption"], [role="option"], ' +
        '.css-9m7glq, [data-automation-id="selectOption"]'
      );
      if (suggestion && suggestion.textContent.toLowerCase().includes(skill.toLowerCase())) {
        suggestion.click();
        filledCount++;
      } else {
        // Press Enter to add as custom skill
        skillInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await delay(200);
        filledCount++;
      }
      await delay(300);
      return { success: true };
    }, `skill[${i}]`);
  }

  await queue.run();
  return { filledCount, totalFields, errors };
}

// ============================================================
// WORKDAY DATE PICKER — 4-STRATEGY APPROACH
// ============================================================
// Strategy 1: Direct input into visible month/year text fields
// Strategy 2: data-automation-id based date section widgets
// Strategy 3: Calendar popup navigation (click arrows to reach target month/year)
// Strategy 4: Fallback — type into any visible date-like input

/**
 * Fill work entry dates (start date + end date).
 */
async function fillWorkDates(container, entry, index, queue) {
  const errors = [];
  let filledCount = 0;
  let totalFields = 0;

  // Parse dates from the entry
  const startDate = parseDateFromEntry(entry.start_date || entry.dates);
  const endDate = entry.end_date && !/present|current/i.test(entry.end_date)
    ? parseDateFromEntry(entry.end_date)
    : null;

  if (startDate) {
    totalFields++;
    const result = await fillWorkdayDate(container, 'start', startDate);
    if (result.success) filledCount++;
    else errors.push(`work[${index}].startDate: ${result.error}`);
  }

  if (endDate) {
    totalFields++;
    const result = await fillWorkdayDate(container, 'end', endDate);
    if (result.success) filledCount++;
    else errors.push(`work[${index}].endDate: ${result.error}`);
  }

  return { filledCount, totalFields, errors };
}

/**
 * Fill education entry dates.
 */
async function fillEduDates(container, entry, index, queue) {
  const errors = [];
  let filledCount = 0;
  let totalFields = 0;

  // Education dates often only have years, parse from the dates string
  const dateStr = entry.dates || '';
  const yearMatch = dateStr.match(/(\d{4})\s*[-–]\s*(\d{4}|Present)/i);

  if (yearMatch) {
    const startYear = parseInt(yearMatch[1], 10);
    totalFields++;
    const startResult = await fillWorkdayDate(container, 'start', { month: 9, year: startYear }); // Default Sept
    if (startResult.success) filledCount++;
    else errors.push(`edu[${index}].startDate: ${startResult.error}`);

    if (yearMatch[2] && !/present/i.test(yearMatch[2])) {
      const endYear = parseInt(yearMatch[2], 10);
      totalFields++;
      const endResult = await fillWorkdayDate(container, 'end', { month: 6, year: endYear }); // Default June
      if (endResult.success) filledCount++;
      else errors.push(`edu[${index}].endDate: ${endResult.error}`);
    }
  }

  return { filledCount, totalFields, errors };
}

/**
 * 4-strategy Workday date filler.
 *
 * @param {HTMLElement} container - The entry container
 * @param {'start'|'end'} type - Which date field
 * @param {Object} date - { month, year } parsed date
 * @returns {Object} { success, error? }
 */
async function fillWorkdayDate(container, type, date) {
  if (!date || !date.year) return { success: false, error: 'no date to fill' };

  const month = date.month || 1;
  const year = date.year;
  const monthName = MONTH_NAMES[month - 1];
  const monthShort = monthName.slice(0, 3);

  // Determine which date section to target based on type (start vs end)
  const prefix = type === 'start' ? 'start' : 'end';

  // ── STRATEGY 1: Direct month/year display fields ──
  // Workday often has [data-automation-id="dateSectionMonth-display"] etc.
  const monthDisplay = container.querySelector(
    `[data-automation-id*="${prefix}"][data-automation-id*="Month"], ` +
    `[data-automation-id*="${prefix}"][data-automation-id*="month"], ` +
    `[data-automation-id="dateSectionMonth-display"]`
  );
  const yearDisplay = container.querySelector(
    `[data-automation-id*="${prefix}"][data-automation-id*="Year"], ` +
    `[data-automation-id*="${prefix}"][data-automation-id*="year"], ` +
    `[data-automation-id="dateSectionYear-display"]`
  );

  if (monthDisplay && yearDisplay) {
    try {
      await clickAndSelect(monthDisplay, monthName);
      await delay(300);
      await clickAndSelect(yearDisplay, String(year));
      await delay(300);
      return { success: true };
    } catch (e) {
      // Fall through to next strategy
    }
  }

  // ── STRATEGY 2: data-automation-id date section widgets ──
  // Some Workday forms use combined date widgets with automation IDs
  const dateSection = container.querySelector(
    `[data-automation-id*="${prefix}Date"], ` +
    `[data-automation-id*="${prefix}_date"], ` +
    `[data-automation-id*="dateSection"]:nth-of-type(${type === 'start' ? 1 : 2})`
  );

  if (dateSection) {
    const monthInput = dateSection.querySelector(
      'input[data-automation-id*="month" i], select[data-automation-id*="month" i], ' +
      '[data-automation-id*="Month"] input, [data-automation-id*="Month"] button'
    );
    const yearInput = dateSection.querySelector(
      'input[data-automation-id*="year" i], select[data-automation-id*="year" i], ' +
      '[data-automation-id*="Year"] input, [data-automation-id*="Year"] button'
    );

    if (monthInput || yearInput) {
      if (monthInput) {
        await setDateFieldValue(monthInput, monthName, String(month).padStart(2, '0'));
        await delay(200);
      }
      if (yearInput) {
        await setDateFieldValue(yearInput, String(year), String(year));
        await delay(200);
      }
      return { success: true };
    }
  }

  // ── STRATEGY 3: Calendar popup navigation ──
  // Click the date field to open calendar, navigate to target month/year
  const dateButton = container.querySelector(
    `[data-automation-id*="${prefix}"][role="button"], ` +
    `[data-automation-id*="date"][data-automation-id*="${prefix}"] button, ` +
    `button[aria-label*="${type === 'start' ? 'start' : 'end'}" i][aria-label*="date" i]`
  );

  if (dateButton) {
    dateButton.click();
    await delay(500);

    const calendarFilled = await navigateCalendar(month, year);
    if (calendarFilled) return { success: true };

    // Close calendar if it didn't work
    document.body.click();
    await delay(200);
  }

  // ── STRATEGY 4: Fallback — any visible date-like inputs ──
  // Look for standard date inputs or text inputs with date patterns
  const allDateInputs = container.querySelectorAll(
    `input[type="date"], input[type="month"], ` +
    `input[placeholder*="MM" i], input[placeholder*="YYYY" i], ` +
    `input[aria-label*="date" i][aria-label*="${prefix}" i]`
  );

  // Find the right pair based on position (start dates usually come first)
  const dateInputs = Array.from(allDateInputs).filter(el => el.offsetParent !== null);

  if (dateInputs.length > 0) {
    const targetInput = dateInputs[0]; // Assuming the container already scopes us
    const dateVal = targetInput.type === 'date'
      ? `${year}-${String(month).padStart(2, '0')}-01`
      : targetInput.type === 'month'
        ? `${year}-${String(month).padStart(2, '0')}`
        : `${monthShort} ${year}`;

    await fillTextInput(targetInput, dateVal, { humanLike: false });
    targetInput.dispatchEvent(new Event('change', { bubbles: true }));
    await delay(200);
    return { success: true };
  }

  return { success: false, error: `no date field found for ${type}` };
}

/**
 * Navigate Workday's calendar popup to a target month/year.
 * Workday calendars have month/year pickers and left/right arrows.
 */
async function navigateCalendar(targetMonth, targetYear) {
  // Check if calendar popup is open
  const calendar = document.querySelector(
    '[data-automation-id="datePickerContainer"], [data-automation-id="calendarGrid"], ' +
    '[role="dialog"]:has([data-automation-id*="datePicker"]), .css-datepicker'
  );

  if (!calendar) return false;

  // Try direct year/month selectors first (some Workday configs have dropdowns)
  const yearPicker = calendar.querySelector(
    '[data-automation-id="datePickerYear"], select[data-automation-id*="year"]'
  );
  const monthPicker = calendar.querySelector(
    '[data-automation-id="datePickerMonth"], select[data-automation-id*="month"]'
  );

  if (yearPicker && monthPicker) {
    await clickAndSelect(yearPicker, String(targetYear));
    await delay(300);
    await clickAndSelect(monthPicker, MONTH_NAMES[targetMonth - 1]);
    await delay(300);

    // Click day 1
    const day1 = calendar.querySelector('[data-automation-id="datePickerDay-1"], [aria-label*="1"]');
    if (day1) { day1.click(); await delay(200); }
    return true;
  }

  // Arrow-based navigation — read current month/year and navigate
  const headerText = calendar.querySelector(
    '[data-automation-id="datePickerHeader"], .css-datePickerTitle, ' +
    '[role="heading"], .datepicker-month-year'
  );

  if (!headerText) return false;

  const prevBtn = calendar.querySelector(
    '[data-automation-id="datePickerPrev"], [aria-label*="previous" i], ' +
    'button:has(svg[data-automation-id*="prev"]), .css-datepicker-prev'
  );
  const nextBtn = calendar.querySelector(
    '[data-automation-id="datePickerNext"], [aria-label*="next" i], ' +
    'button:has(svg[data-automation-id*="next"]), .css-datepicker-next'
  );

  if (!prevBtn && !nextBtn) return false;

  // Navigate up to 60 months in either direction
  for (let attempts = 0; attempts < 60; attempts++) {
    const current = parseCalendarHeader(headerText.textContent.trim());
    if (!current) break;

    if (current.month === targetMonth && current.year === targetYear) {
      // We're on the right month — click day 1
      const day1 = calendar.querySelector(
        '[data-automation-id="datePickerDay-1"], ' +
        `td[aria-label*="1"], button[aria-label*="1"]`
      );
      if (day1) { day1.click(); await delay(200); }
      return true;
    }

    // Determine direction
    const currentTotal = current.year * 12 + current.month;
    const targetTotal = targetYear * 12 + targetMonth;

    if (targetTotal < currentTotal && prevBtn) {
      prevBtn.click();
    } else if (targetTotal > currentTotal && nextBtn) {
      nextBtn.click();
    } else {
      break; // Can't navigate in the needed direction
    }

    await delay(300);
  }

  return false;
}

// ============================================================
// SEARCHABLE DROPDOWN FIELDS
// ============================================================

/**
 * Handle Workday's searchable dropdown fields (company, degree, etc.)
 * These require typing to trigger autocomplete, then selecting from results.
 */
async function fillSearchableFields(container, entry, index, type, queue) {
  // Company name (work entries)
  if (type === 'work' && entry.company) {
    const companySearchable = container.querySelector(
      '[data-automation-id*="company"] [data-automation-id*="search"] input, ' +
      '[data-automation-id*="company"] input[role="combobox"], ' +
      '[data-automation-id*="employer"] input[role="combobox"]'
    );
    if (companySearchable && !companySearchable.value) {
      queue.enqueue(async () => {
        await typeAndSelect(companySearchable, entry.company);
        return { success: true };
      }, `${type}[${index}].company_search`);
    }
  }

  // Degree (education entries)
  if (type === 'edu' && entry.degree) {
    const degreeSearchable = container.querySelector(
      '[data-automation-id*="degree"] input[role="combobox"], ' +
      '[data-automation-id*="degree"] [data-automation-id*="search"] input'
    );
    if (degreeSearchable && !degreeSearchable.value) {
      queue.enqueue(async () => {
        await typeAndSelect(degreeSearchable, entry.degree);
        return { success: true };
      }, `${type}[${index}].degree_search`);
    }
  }

  // School name (education entries)
  if (type === 'edu' && entry.institution) {
    const schoolSearchable = container.querySelector(
      '[data-automation-id*="school"] input[role="combobox"], ' +
      '[data-automation-id*="institution"] input[role="combobox"], ' +
      '[data-automation-id*="school"] [data-automation-id*="search"] input'
    );
    if (schoolSearchable && !schoolSearchable.value) {
      queue.enqueue(async () => {
        await typeAndSelect(schoolSearchable, entry.institution);
        return { success: true };
      }, `${type}[${index}].school_search`);
    }
  }
}

/**
 * Type into a searchable field, wait for autocomplete, select best match.
 */
async function typeAndSelect(input, value) {
  // Clear existing value
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await delay(200);

  // Type value character by character for first 5 chars (trigger autocomplete)
  const typeChars = value.slice(0, Math.min(value.length, 8));
  for (const char of typeChars) {
    input.value += char;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    await delay(80 + Math.random() * 60);
  }

  await delay(800); // Wait for autocomplete

  // Look for matching option
  const options = document.querySelectorAll(
    '[data-automation-id*="promptOption"], [role="option"], ' +
    '[data-automation-id="selectOption"], .css-9m7glq'
  );

  const valueLower = value.toLowerCase();

  // Exact match
  for (const opt of options) {
    if (opt.textContent.trim().toLowerCase() === valueLower) {
      opt.click();
      await delay(200);
      return;
    }
  }

  // Partial match
  for (const opt of options) {
    const text = opt.textContent.trim().toLowerCase();
    if (text.includes(valueLower) || valueLower.includes(text)) {
      opt.click();
      await delay(200);
      return;
    }
  }

  // No match — fill the rest of the value and submit
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await delay(200);
}

// ============================================================
// DOM UTILITIES
// ============================================================

/**
 * Find a Workday section by automation-id.
 */
function findSection(sectionName) {
  // Direct automation-id match
  const direct = document.querySelector(
    `[data-automation-id="${sectionName}Section"], ` +
    `[data-automation-id="${sectionName}"], ` +
    `[data-automation-id*="${sectionName}"]`
  );
  if (direct) return direct;

  // Header text match
  const headers = document.querySelectorAll(
    '[data-automation-id="pageHeaderTitle"], [data-automation-id="sectionLabel"], ' +
    'h2, h3, legend, [role="heading"]'
  );
  for (const h of headers) {
    if (new RegExp(sectionName.replace(/([A-Z])/g, '\\s*$1'), 'i').test(h.textContent)) {
      return h.closest('section, fieldset, [data-automation-id]') || h.parentElement;
    }
  }

  return null;
}

/**
 * Get repeatable entry containers within a section.
 */
function getEntryContainers(section, type) {
  // Workday numbers entries: workExperience-1, workExperience-2, etc.
  const byAutomation = section.querySelectorAll(
    `[data-automation-id*="${type}-"], [data-automation-id*="${type}_"]`
  );
  if (byAutomation.length > 0) return Array.from(byAutomation);

  // Fallback: look for repeating fieldsets or card-like containers
  const containers = section.querySelectorAll(
    'fieldset, [role="group"], .css-1gj3p3w, [data-automation-id*="entry"], ' +
    '[data-automation-id*="item"], .css-repeatable-entry'
  );
  if (containers.length > 0) return Array.from(containers);

  // Last resort: the section itself is the only container
  return [section];
}

/**
 * Click "Add Another" button within or near a section.
 */
async function clickAddAnother(section) {
  // Look within the section
  let addBtn = section.querySelector(
    '[data-automation-id="Add Another"], [data-automation-id*="addAnother"], ' +
    'button[data-automation-id*="add"], button[aria-label*="Add Another" i]'
  );

  if (!addBtn) {
    // Look for "Add" buttons near the section
    const buttons = section.querySelectorAll('button');
    for (const btn of buttons) {
      if (/add\s*(another|more|new|entry)/i.test(btn.textContent)) {
        addBtn = btn;
        break;
      }
    }
  }

  if (!addBtn) {
    // Look in the parent/sibling area
    const parent = section.parentElement;
    if (parent) {
      const siblings = parent.querySelectorAll('button');
      for (const btn of siblings) {
        if (/add\s*(another|more|new|entry)/i.test(btn.textContent)) {
          addBtn = btn;
          break;
        }
      }
    }
  }

  if (!addBtn || addBtn.disabled) return false;

  addBtn.click();
  await delay(500);
  return true;
}

/**
 * Find a field within a container by automation-id or label pattern.
 */
function findFieldInContainer(container, automationIds, labelPattern) {
  // Try automation-id first
  for (const id of automationIds) {
    const el = container.querySelector(
      `[data-automation-id="${id}"] input, [data-automation-id="${id}"] textarea, ` +
      `input[data-automation-id="${id}"], textarea[data-automation-id="${id}"], ` +
      `[data-automation-id*="${id}"] input, [data-automation-id*="${id}"] textarea`
    );
    if (el && el.offsetParent !== null && !el.disabled) return el;
  }

  // Label-based fallback
  if (labelPattern) {
    const allInputs = container.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea');
    for (const input of allInputs) {
      if (input.offsetParent === null || input.disabled) continue;
      const label = findLabel(input);
      if (label && labelPattern.test(label)) return input;
    }
  }

  return null;
}

/**
 * Find the label for an element using Workday's DOM patterns.
 */
function findLabel(element) {
  // aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  // label[for]
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label) return label.textContent.trim();
  }

  // data-automation-id label in parent
  const container = element.closest('[data-automation-id]');
  if (container) {
    const labelEl = container.querySelector('label, [data-automation-id*="label"], [data-automation-id*="Label"]');
    if (labelEl && labelEl !== element) return labelEl.textContent.trim();
  }

  // Placeholder
  return element.placeholder || null;
}

/**
 * Click a display element and select a value from the dropdown that appears.
 */
async function clickAndSelect(element, value) {
  // If it's a select, just set value
  if (element.tagName === 'SELECT') {
    const valueLower = value.toLowerCase();
    for (const opt of element.options) {
      if (opt.value === value || opt.textContent.trim().toLowerCase().includes(valueLower)) {
        element.value = opt.value;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
    }
    return;
  }

  // Click to open
  const clickTarget = element.querySelector('button, [role="button"]') || element;
  clickTarget.click();
  await delay(500);

  // Find and select from options
  const options = document.querySelectorAll(
    '[data-automation-id*="promptOption"], [role="option"], [data-automation-id="selectOption"]'
  );
  const valueLower = value.toLowerCase();

  for (const opt of options) {
    const text = opt.textContent.trim().toLowerCase();
    if (text === valueLower || text.includes(valueLower) || valueLower.includes(text)) {
      opt.click();
      await delay(200);
      return;
    }
  }

  // Close if nothing matched
  document.body.click();
  await delay(200);
}

/**
 * Set a date field value (handles input, select, or button/display elements).
 */
async function setDateFieldValue(element, displayValue, rawValue) {
  if (element.tagName === 'SELECT') {
    for (const opt of element.options) {
      if (opt.value === rawValue || opt.textContent.trim().toLowerCase().includes(displayValue.toLowerCase())) {
        element.value = opt.value;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
    }
  } else if (element.tagName === 'INPUT') {
    await fillTextInput(element, rawValue, { humanLike: false });
  } else {
    // Button or display — click and select
    await clickAndSelect(element, displayValue);
  }
}

/**
 * Parse a calendar header like "January 2025" into { month, year }.
 */
function parseCalendarHeader(text) {
  if (!text) return null;
  const match = text.match(/(\w+)\s+(\d{4})/);
  if (!match) return null;

  const monthName = match[1].toLowerCase();
  const monthIndex = MONTH_NAMES.indexOf(monthName);
  if (monthIndex === -1) return null;

  return { month: monthIndex + 1, year: parseInt(match[2], 10) };
}

/**
 * Parse a date string from a LinkedIn profile entry.
 * Handles: "Jan 2020", "January 2020", "2020", "Jan 2020 - Present"
 */
function parseDateFromEntry(dateStr) {
  if (!dateStr) return null;

  // "Month Year" format
  const monthYear = dateStr.match(/(\w{3,9})\s+(\d{4})/);
  if (monthYear) {
    const monthName = monthYear[1].toLowerCase();
    // Try full month name first, then 3-letter abbreviation
    let monthIndex = MONTH_NAMES.indexOf(monthName);
    if (monthIndex === -1) {
      monthIndex = MONTH_NAMES.findIndex(m => m.startsWith(monthName.slice(0, 3)));
    }
    if (monthIndex !== -1) {
      return { month: monthIndex + 1, year: parseInt(monthYear[2], 10) };
    }
  }

  // Year only
  const yearOnly = dateStr.match(/\b(\d{4})\b/);
  if (yearOnly) {
    return { month: 1, year: parseInt(yearOnly[1], 10) };
  }

  return null;
}

// ============================================================
// SHARED UTILITIES
// ============================================================

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

function delay(ms) {
  const jitter = ms * 0.25;
  const actual = ms + (Math.random() * jitter * 2 - jitter);
  return new Promise(resolve => setTimeout(resolve, actual));
}
