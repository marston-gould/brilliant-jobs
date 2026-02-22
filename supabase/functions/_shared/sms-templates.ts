// supabase/functions/_shared/sms-templates.ts
// SMS templates for Brilliant Jobs notification system
// All templates must be ≤160 characters for single-segment SMS
// Cost: ~$0.0068/message (US toll-free)

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
  return `BrilliantJobs: ${co} — ${title}. Reply Y to apply, N to pass. Expires in 2h.`;
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
    return `BrilliantJobs: Interview reminder — ${title} at ${co} on ${dateStr}. Good luck!`;
  }
  return `BrilliantJobs: Interview scheduled — ${title} at ${co}. Check your dashboard for details.`;
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
  return `BrilliantJobs: Offer received for ${title} at ${co}! Log in to review and take action.`;
}

/**
 * Critical credit alert — credits exhausted
 * Triggered when credit balance hits 0
 */
export function creditAlertSms(
  plan: string,
  totalCredits: number
): string {
  return `BrilliantJobs: You've used all ${totalCredits} credits on your ${plan} plan. Top up at brilliantjobs.app to keep Smart Alerts active.`;
}
