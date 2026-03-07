// supabase/functions/_shared/email-templates.ts
// CS-P1-012 (TS1-6): Barrel re-export — all existing imports continue to work.
// The monolithic 188KB file has been split into 8 focused modules.
//
// Module map:
//   email-base.ts         — Shared layouts (dark + white + dual dark mode), helpers, constants
//   email-core.ts         — Core transactional + pipeline + ghost + digest
//   email-credits.ts      — Credit management + upgrade + resume + apply flows
//   email-onboarding.ts   — Onboarding drip + adoption + score + interview (white theme)
//   email-analytics.ts    — Analytics dashboard reports (dark theme data emails)
//   email-referral.ts     — Referral program
//   email-billing.ts      — Billing, subscription, and payment
//   email-engagement.ts   — Marketing, feedback, community, and re-engagement
//
// To import directly from a specific module (recommended for new code):
//   import { welcomeEmail } from "../_shared/email-core.ts";
//
// To use the barrel (backwards-compatible):
//   import { welcomeEmail } from "../_shared/email-templates.ts";

export { baseLayout, whiteBaseLayout, utmLink, smsUtmLink, detailRow, salaryDisplay, DASHBOARD_URL, LOGO_TEXT } from "./email-base.ts";
export * from "./email-core.ts";
export * from "./email-credits.ts";
export * from "./email-onboarding.ts";
export * from "./email-analytics.ts";
export * from "./email-referral.ts";
export * from "./email-billing.ts";
export * from "./email-engagement.ts";
