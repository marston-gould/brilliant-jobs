/**
 * POC-03: Workday ATS Handler — H-04 Validation
 *
 * HOOK EXERCISED: H-04 (AtsHandler Interface)
 * PURPOSE: Proves a new ATS integration can be added by implementing the
 *          AtsHandler interface without modifying any existing handler code.
 *          The handler-registry.ts discovers handlers automatically.
 *
 * ACTIVATION: Place in extension/handlers/workday.ts, build, and the
 *             HandlerRegistry picks it up via dynamic import.
 *
 * SESSION: SA-029 (Hook Prototyping + Evolvability Baseline)
 * STATUS: POC — not deployed. Validates H-04 interface contract.
 */

import type {
  AtsHandler,
  JobData,
  FieldFillRequest,
  FillResult,
  FieldConfig,
} from "../types/index.d.ts";

/**
 * H-04 contract: implement AtsHandler interface.
 * No changes to handler-registry, background worker, or content scripts needed.
 * The extension's handler discovery loop iterates the registry and calls detect().
 */
const workdayHandler: AtsHandler = {
  id: "workday",

  /**
   * Detection: Check if the current page is a Workday careers page.
   * Workday URLs follow: https://<company>.wd5.myworkdayjobs.com/en-US/<tenant>/job/<slug>
   */
  detect(): boolean {
    const url = window.location.href;
    return /\.myworkdayjobs\.com\//.test(url) || /\.wd\d+\.myworkdayjobs\.com\//.test(url);
  },

  /**
   * Extract job data from Workday's structured page.
   * Workday uses a React-like SPA with data-automation-id attributes.
   */
  extractJobData(): JobData | null {
    try {
      const titleEl = document.querySelector('[data-automation-id="jobPostingHeader"]');
      const locationEl = document.querySelector('[data-automation-id="locations"] dd');
      const descriptionEl = document.querySelector('[data-automation-id="jobPostingDescription"]');

      if (!titleEl) return null;

      return {
        title: titleEl.textContent?.trim() ?? "",
        company: extractCompanyFromUrl(),
        location: locationEl?.textContent?.trim() ?? "",
        description: descriptionEl?.textContent?.trim() ?? "",
        url: window.location.href,
        source: "workday",
        scraped_at: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  },

  /**
   * Fill a form field on the Workday application page.
   * Workday forms use custom input components with data-automation-id.
   */
  async fillField(request: FieldFillRequest): Promise<FillResult> {
    const { selector, value, fieldType } = request;
    try {
      const el = document.querySelector(selector) as HTMLInputElement | null;
      if (!el) {
        return { success: false, error: `Element not found: ${selector}` };
      }

      // Workday uses React-like controlled inputs — need to trigger change events
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  /**
   * Enumerate fillable fields on the Workday application form.
   */
  getFields(): FieldConfig[] {
    const fields: FieldConfig[] = [];
    const inputs = document.querySelectorAll('[data-automation-id] input, [data-automation-id] textarea');

    inputs.forEach((input) => {
      const automationId = input.closest("[data-automation-id]")?.getAttribute("data-automation-id") ?? "";
      const inputEl = input as HTMLInputElement;
      fields.push({
        selector: `[data-automation-id="${automationId}"] input`,
        label: automationId.replace(/([A-Z])/g, " $1").trim(),
        fieldType: inputEl.type === "email" ? "email" : inputEl.type === "tel" ? "phone" : "text",
        required: inputEl.required,
      });
    });

    return fields;
  },

  /**
   * Optional: Submit the application form.
   */
  async submit(): Promise<boolean> {
    const submitBtn = document.querySelector('[data-automation-id="bottom-navigation-next-button"]') as HTMLButtonElement | null;
    if (!submitBtn) return false;
    submitBtn.click();
    return true;
  },
};

function extractCompanyFromUrl(): string {
  // https://acme.wd5.myworkdayjobs.com → "acme"
  const match = window.location.hostname.match(/^([^.]+)\.wd\d+/);
  return match ? match[1] : "";
}

/**
 * HOOK VALIDATION CHECKLIST:
 * ✅ Implements AtsHandler interface (H-04) — all 5 methods
 * ✅ detect() uses URL pattern matching (no external dependencies)
 * ✅ extractJobData() returns JobData type (H-05 shared types)
 * ✅ fillField() handles Workday's React-like controlled inputs
 * ✅ getFields() enumerates form fields dynamically
 * ✅ submit() is optional — correctly implemented but not required
 * ✅ No existing handler code modified — pure addition to HandlerRegistry
 * ✅ HandlerRegistry[atsId] contract satisfied via id: "workday"
 *
 * SCARS LEVERAGED:
 * - H-05 (_shared/types.ts) — JobData, FillResult, FieldConfig types
 */

export default workdayHandler;
