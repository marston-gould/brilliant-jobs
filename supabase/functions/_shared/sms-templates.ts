// supabase/functions/_shared/sms-templates.ts
// SMS templates for Brilliant Jobs notification system
// CS-P1-012 (TS1-5): All templates enforced ≤160 characters for single-segment SMS
// Cost: ~$0.0068/message (US toll-free)

const SMS_MAX_CHARS = 160;
const DASHBOARD_SHORT_URL = "brilliantjobs.app";

/**
 * Safety net: truncate any SMS to 160 chars.
 * If over limit, truncates message body and appends a short link.
 * Exported so sendSMS can use it as a final guard.
 */
export function safeSms(text: string): string {
  if (text.length <= SMS_MAX_CHARS) return text;
  // Reserve space for "... " + short link (24 chars)
  const suffix = `... ${DASHBOARD_SHORT_URL}`;
  const maxBody = SMS_MAX_CHARS - suffix.length;
  return text.slice(0, maxBody) + suffix;
}

/**
 * Apply alert escalation — sent when user hasn't responded to email
 * Used by escalation-checker after timeout
 */
export function applyAlertSms(
  company: string,
  jobTitle: string
): string {
  const title = jobTitle.length > 30 ? jobTitle.slice(0, 27) + "..." : jobTitle;
  const co = company.length > 20 ? company.slice(0, 17) + "..." : company;
  return safeSms(`BrilliantJobs: ${co} — ${title}. Reply Y to apply, N to pass. Expires in 2h.`);
}

/**
 * Interview scheduled reminder
 * Triggered by pipeline stage change to "Interview"
 */
export function interviewReminderSms(
  company: string,
  jobTitle: string,
  dateStr?: string
): string {
  const co = company.length > 20 ? company.slice(0, 17) + "..." : company;
  const title = jobTitle.length > 25 ? jobTitle.slice(0, 22) + "..." : jobTitle;
  if (dateStr) {
    return safeSms(`BrilliantJobs: Interview reminder — ${title} at ${co} on ${dateStr}. Good luck!`);
  }
  return safeSms(`BrilliantJobs: Interview scheduled — ${title} at ${co}. Check your dashboard for details.`);
}

/**
 * Offer received notification
 * Triggered by pipeline stage change to "Offer"
 */
export function offerReceivedSms(
  company: string,
  jobTitle: string
): string {
  const co = company.length > 25 ? company.slice(0, 22) + "..." : company;
  const title = jobTitle.length > 25 ? jobTitle.slice(0, 22) + "..." : jobTitle;
  return safeSms(`BrilliantJobs: Offer received for ${title} at ${co}! Log in to review and take action.`);
}

/**
 * Critical credit alert — credits exhausted
 * CS-P1-012 (TS1-5): Fixed overflow — plan name + credit count can exceed 160 chars.
 * Now truncates plan name and uses compact phrasing.
 */
export function creditAlertSms(
  plan: string,
  totalCredits: number
): string {
  const p = plan.length > 12 ? plan.slice(0, 9) + "..." : plan;
  return safeSms(`BrilliantJobs: All ${totalCredits} ${p} credits used. Top up at ${DASHBOARD_SHORT_URL} to keep alerts active.`);
}
