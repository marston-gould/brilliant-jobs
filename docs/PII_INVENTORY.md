# PII Inventory — Brilliant Jobs

> **Created:** 2026-03-06 (CS-019, CP-001)  
> **Last updated:** 2026-03-06  
> **Owner:** TPM + Security Engineer  
> **Review cadence:** Quarterly

This document maps all Personally Identifiable Information (PII) stored, processed, or transmitted by the Brilliant Jobs platform across all surfaces (dashboard, extension, landing page, admin, Edge Functions) and third-party services.

---

## 1. Database Tables with PII

### 1.1 Direct User PII (High Sensitivity)

| Table | PII Columns | PII Type | Retention | RLS |
|-------|------------|----------|-----------|-----|
| `profiles` | `email`, `full_name`, `linkedin_slug`, `linkedin_url`, `user_data` (jsonb) | Identity, Contact, Professional | Account lifetime + 30 days post-deletion | ✅ |
| `user_notification_state` | `phone_number`, `phone_country_code` | Contact (SMS) | Account lifetime | ✅ |
| `subscriptions` | `stripe_customer_id`, `stripe_subscription_id` | Financial identifier | Account lifetime | ✅ |
| `resumes` | `name`, `file_name`, `file_path` (links to resume content with names, emails, phone, work history) | Identity, Contact, Professional, Employment | Account lifetime | ✅ |
| `connections` | `name`, `profile_slug`, `headline`, `parsed_company` | Third-party identity (LinkedIn contacts) | Account lifetime | ✅ |
| `recruiter_contacts` | `recruiter_name`, `recruiter_email` | Third-party contact | Account lifetime | ✅ |

### 1.2 User Activity PII (Medium Sensitivity)

| Table | PII Columns | PII Type | Retention | RLS |
|-------|------------|----------|-----------|-----|
| `pipeline` | `user_id`, `source_url`, `job_title`, `company_name`, `resume_id`, `salary_raw/min/max` | Application activity, Salary | Account lifetime | ✅ |
| `pending_applications` | `user_id`, `resume_id`, `rewritten_resume_id`, `score_result` | Application activity | Account lifetime | ✅ |
| `user_pipeline` | `user_id`, `resume_used` | Application activity | Account lifetime | ✅ |
| `resume_rewrites` | `user_id`, `resume_name`, `filter_name` | Professional data | Account lifetime | ✅ |
| `notification_log` | `user_id`, `subject`, `payload` (may contain names/emails) | Communication history | 90 days | ✅ |
| `notification_actions` | `user_id`, `job_title`, `filter_name`, `resume_id` | User decisions | Account lifetime | ✅ |
| `feedback` | `user_id`, `details`, `screenshot_urls` | User-submitted content | Indefinite | ✅ |
| `saved_filters` | `user_id`, `filter_name`, `resume_id` | Job search preferences | Account lifetime | ✅ |
| `credit_transactions` | `user_id` | Usage/billing activity | Account lifetime | ✅ |
| `overlay_analytics` | `user_id` | Extension usage | 90 days | ✅ |
| `onboarding_milestones` | `user_id` | Onboarding progress | Account lifetime | ✅ |

### 1.3 Referral PII (Medium Sensitivity)

| Table | PII Columns | PII Type | Retention | RLS |
|-------|------------|----------|-----------|-----|
| `referrals` | `referrer_id`, `referred_id`, `referred_email`, `ip_address`, `browser_fingerprint` | Identity, Network, Device | Account lifetime | ✅ |
| `referral_invites` | `referrer_id`, `recipient_identifier` (email/phone) | Contact | Account lifetime | ✅ |
| `referral_requests` | `contact_name`, `contact_channel` | Third-party contact | Account lifetime | ✅ |

### 1.4 Technical/Telemetry PII (Low Sensitivity)

| Table | PII Columns | PII Type | Retention | RLS |
|-------|------------|----------|-----------|-----|
| `audit_log` | `user_id`, `ip_address`, `user_agent` | Device/network | Indefinite | ✅ |
| `extension_heartbeats` | `user_id`, `extension_id`, `extension_version` | Device telemetry | Account lifetime | ✅ |
| `extension_events` | `user_id`, `event_data` (jsonb), `job_url` | Usage telemetry | 90 days | ✅ |
| `push_subscriptions` | `user_id`, `endpoint`, `user_agent` | Device identifier | Account lifetime | ✅ |
| `user_sessions` | `user_id` | Session data | 30 days | ✅ |

### 1.5 Tables Without User PII

These tables contain business data only (no user-linkable PII):

`ats_jobs`, `ats_companies`, `cohorts`, `plans`, `city_pages`, `city_popular_pills`, `seo_page_cache`, `seo_metro_map`, `seo_role_map`, `content_ai_scores`, `job_fraud_scores`, `notification_templates`, `admin_notification_config`, `referral_config`, `referral_badges`, `referral_milestone_rewards`, `board_discovery_queue`, `extension_builds`, `vendor_cost_log`, `paid_spend_log`, `social_post_log`, `marketing_campaign_log`, `cron_run_log`, `ef_rate_limits`, `template_send_log`, `company_ghost_stats`, `ghost_alerts_sent`, `held_notifications`, `leaderboard_rewards`

---

## 2. Extension PII

### 2.1 Chrome Storage (Local)

Data stored in `chrome.storage.local` by the extension:

| Key | PII Content | Encryption |
|-----|------------|------------|
| `authSession` | `user_id`, `access_token`, `refresh_token` | ✅ AES-GCM (CS-004) |
| `scannerState` | Scan progress (no PII directly) | ❌ |
| `_bj_kill_switch` | Boolean flag (no PII) | ❌ |
| `userRole` | User role string (no PII) | ❌ |

### 2.2 Data Collected by Extension

| Data | Source | Where Sent | Purpose |
|------|--------|-----------|---------|
| LinkedIn connection names/headlines | LinkedIn page DOM | Supabase `connections` table | Network scanning |
| Job listing details (title, company, URL) | ATS page DOM | Supabase `ats_jobs` | Job discovery |
| Form field values (during auto-fill) | ATS application forms | Supabase `extension_events` | Fill metrics |
| Page URLs on ATS sites | Browser navigation | Supabase `extension_events` | Handler routing |
| Extension version, browser type | Chrome APIs | Supabase `extension_heartbeats` | Compatibility |

### 2.3 Data NOT Collected by Extension

- Passwords or login credentials
- Private messages on any platform
- Browsing history outside professional platforms
- Email content, files, or documents
- Data from unrelated websites

---

## 3. Third-Party PII Sharing

| Service | PII Received | DPA Status | Purpose |
|---------|-------------|------------|---------|
| **Anthropic** (Claude API) | Resume text (names, emails, phones, work history), job descriptions | ⚠️ Pending | Resume scoring, rewriting, cover letter generation, form answering |
| **Stripe** | Name, email, payment method, billing address | ⚠️ Pending | Payment processing |
| **Supabase** | All database PII (hosting provider) | ⚠️ Pending | Database hosting, auth, Edge Functions |
| **Resend** | Email addresses, notification content | ⚠️ Pending | Email delivery |
| **Vonage** | Phone numbers, SMS content | ⚠️ Pending | SMS delivery |
| **PostHog** | User IDs, page views, feature usage, device info | ⚠️ Pending | Product analytics |
| **Vercel** | IP addresses, browser info (server logs) | ⚠️ Pending | Website hosting |
| **Cloudflare** | IP addresses, browser info (CDN/DNS) | ⚠️ Pending | CDN, DNS, DDoS protection |
| **DataForSEO** | No user PII (job market queries only) | N/A | SEO data |
| **Google Search Console** | No user PII (site performance only) | N/A | SEO monitoring |

---

## 4. Edge Functions Processing PII

| Edge Function | PII Input | PII Output | Third-Party |
|---------------|----------|-----------|-------------|
| `score-resume` | Full resume text | Score result | Anthropic |
| `rewrite-resume` / `analyze` / `execute` | Full resume text | Rewritten resume | Anthropic |
| `extract-resume-profile` | Full resume text | Structured profile | Anthropic |
| `analyze-application-gap` | Resume + job description | Gap analysis | Anthropic |
| `generate-cover-letter` | Resume + job description | Cover letter | Anthropic |
| `answer-form-question` | Resume subset + question | Answer text | Anthropic |
| `chat-job-search` | User query + context | Chat response | Anthropic |
| `send-notification` | Email/phone, content | Delivery status | Resend, Vonage |
| `create-checkout` | User ID | Checkout session | Stripe |
| `stripe-webhook` | Payment events | Subscription status | Stripe |
| `data-export` | All user data | Export file | None |
| `account-delete` | User ID | Deletion cascade | None |
| `recruiter-lookup` | Recruiter names | Contact info | None |
| `gmail-scan` | Gmail OAuth tokens, email metadata | Signal data | Google |

---

## 5. Data Subject Rights Implementation

| Right | Implementation | Status |
|-------|---------------|--------|
| **Access** (GDPR Art. 15 / CCPA) | `data-export` Edge Function — exports all user data as JSON | ✅ Implemented |
| **Deletion** (GDPR Art. 17 / CCPA) | `account-delete` Edge Function — cascades via `ON DELETE CASCADE` FK constraints | ⚠️ Partial — verify all 72 tables cascade |
| **Rectification** (GDPR Art. 16) | Settings page — user can edit profile, resumes | ✅ Implemented |
| **Portability** (GDPR Art. 20) | `data-export` Edge Function — JSON format | ✅ Implemented |
| **Withdrawal of consent** | Extension uninstall stops collection; email unsubscribe; SMS opt-out | ✅ Implemented |
| **Objection** (GDPR Art. 21) | Contact support@brilliantjobs.app | ✅ Manual process |

---

## 6. Deletion Cascade Verification

When a user account is deleted (`account-delete`), the following FK cascades should fire:

| Table | FK Action | Verified |
|-------|----------|----------|
| `profiles` | Root deletion | ✅ |
| `connections` | ON DELETE CASCADE | ⬜ Needs verification |
| `resumes` | ON DELETE CASCADE | ⬜ Needs verification |
| `subscriptions` | ON DELETE CASCADE | ⬜ Needs verification |
| `pipeline` | ON DELETE CASCADE | ⬜ Needs verification |
| `pending_applications` | ON DELETE CASCADE | ⬜ Needs verification |
| `notification_log` | ON DELETE SET NULL | ⬜ User_id nulled, records persist |
| `notification_actions` | ON DELETE SET NULL | ⬜ User_id nulled, records persist |
| `feedback` | ON DELETE SET NULL | ⬜ User_id nulled, records persist |
| `referrals` | ON DELETE CASCADE (referrer) / SET NULL (referred) | ⬜ Needs verification |
| `referral_invites` | ON DELETE CASCADE | ⬜ Needs verification |
| `extension_events` | ON DELETE CASCADE | ⬜ Needs verification |
| `extension_heartbeats` | ON DELETE CASCADE | ⬜ Needs verification |
| `push_subscriptions` | ON DELETE CASCADE | ⬜ Needs verification |
| `audit_log` | No cascade (ON DELETE references only) | ⬜ IP/UA persists after deletion |

> **Action required:** Verify all cascade paths fire correctly. Tables with `ON DELETE SET NULL` leave orphaned records — evaluate whether these should be purged on account deletion.

---

## 7. Review Schedule

- **Quarterly:** Compare this inventory against actual database schema for new PII columns
- **Per PR:** PR template asks "Does this PR handle PII?" with checklist
- **Per new table:** Any migration adding PII columns triggers Compliance review label
- **Annually:** Full third-party DPA review

---

*This document satisfies finding CP-001 (No PII Inventory or Data Map) from the Session 3 Triage.*
