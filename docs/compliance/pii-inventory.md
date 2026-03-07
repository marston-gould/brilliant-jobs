# PII Inventory — Brilliant Jobs

> **Version:** 1.0  
> **Created:** 2026-03-07  
> **Finding:** CP-001  
> **Owner:** Security Engineer + TPM  
> **Review Cadence:** Quarterly (next: 2026-06-07)

## 1. Summary

This document maps all Personally Identifiable Information (PII) stored, processed, or transmitted by the Brilliant Jobs platform. It covers 66 database tables, 18 Edge Functions that call the Anthropic API, and 5 third-party services that receive user PII.

---

## 2. PII Categories

| Category | Examples | Sensitivity |
|----------|----------|-------------|
| **Identity** | Full name, email, LinkedIn URL/slug | High |
| **Contact** | Phone number (via SMS notifications) | High |
| **Employment** | Resume text, work history, education, skills | High |
| **Financial** | Stripe customer ID, subscription ID, plan | Medium |
| **Behavioral** | Job search filters, application history, notification preferences | Medium |
| **Technical** | IP address, user agent, session tokens | Medium |
| **Recruitment** | Recruiter names, recruiter emails, LinkedIn URLs | High |

---

## 3. Table-Level PII Map

### 3.1 Direct User PII (user_id FK → auth.users)

| Table | FK Column | PII Fields | ON DELETE | Notes |
|-------|-----------|------------|-----------|-------|
| `profiles` | `id` | email, full_name, linkedin_slug, linkedin_url, user_data (JSON with saved_filters, preferences) | CASCADE | Primary user record |
| `connections` | `user_id` | name, headline, profile_slug, parsed_company | CASCADE | LinkedIn network data |
| `resumes` | `user_id` | name, file_name, file_path | CASCADE | Resume metadata; actual files in Supabase Storage |
| `resume_rewrites` | `user_id` | Original + rewritten resume content | CASCADE | AI-generated rewrites contain PII |
| `subscriptions` | `user_id` | stripe_customer_id, stripe_subscription_id | CASCADE | Billing PII |
| `credit_transactions` | `user_id` | — | CASCADE | Usage/billing history |
| `notification_log` | `user_id` | subject, payload (may contain job details) | SET NULL | Delivery records |
| `notification_actions` | `user_id` | — | SET NULL | User decisions on notifications |
| `user_notification_preferences` | `user_id` | email, sms, push preferences | CASCADE | Contact preferences |
| `user_notification_state` | `user_id` | — | CASCADE | Notification state tracking |
| `feedback` | `user_id` | details (free text), screenshot_urls, answers (JSON) | SET NULL | May contain self-disclosed PII |
| `saved_filters` | `user_id` | filter criteria (job preferences) | CASCADE | Search behavior |
| `pipeline` | `user_id` | — | CASCADE | Application tracking |
| `user_pipeline` | `user_id` | — | CASCADE | Pipeline view state |
| `pending_applications` | `user_id` | — | CASCADE | Application queue |
| `application_profiles` | `user_id` | Profile data for auto-apply | CASCADE | Contains name, contact info |
| `recruiter_contacts` | `user_id` | recruiter_name, recruiter_email, linkedin_url | CASCADE | Third-party PII (recruiters) |
| `push_subscriptions` | `user_id` | endpoint, keys (push subscription) | CASCADE | Device identifiers |
| `user_sessions` | `user_id` | — | CASCADE | Session tracking |
| `referrals` | `referrer_id` / `referee_id` | — | CASCADE | Referral relationships |
| `referral_invites` | `user_id` | invitee_email | CASCADE | Email addresses of invitees |
| `referral_rewards` | `user_id` | — | CASCADE | Reward tracking |
| `referral_badges` | `user_id` | — | CASCADE | Achievement tracking |
| `onboarding_milestones` | `user_id` | — | CASCADE | Onboarding progress |
| `overlay_analytics` | `user_id` | — | CASCADE | Extension usage data |
| `extension_heartbeats` | `user_id` | — | CASCADE | Extension health data |
| `extension_events` | `user_id` | event_data (JSON) | CASCADE | Extension telemetry |
| `ab_assignments` | `user_id` | — | CASCADE | A/B test participation |
| `held_notifications` | `user_id` | payload (may contain PII) | CASCADE | Queued notifications |
| `ghost_alerts_sent` | `user_id` | — | CASCADE | Ghost job alerts |
| `audit_log` | `user_id` | ip_address, user_agent | — | Audit trail (retained) |
| `mock_ats_submissions` | `user_id` | form_data (JSON with PII) | CASCADE | Auto-apply test submissions |
| `template_send_log` | `user_id` | — | CASCADE | Email template tracking |
| `marketing_campaign_log` | `user_id` | — | CASCADE | Marketing tracking |
| `leaderboard_rewards` | `user_id` | — | CASCADE | Gamification data |

### 3.2 System/Non-User Tables (No Direct User PII)

| Table | PII Status | Notes |
|-------|-----------|-------|
| `ats_jobs` | None | Public job listings |
| `ats_companies` | None | Public company data |
| `plans` | None | Plan definitions |
| `cohorts` | None | Cohort definitions |
| `board_discovery_queue` | None | Job board crawler queue |
| `city_pages` / `city_popular_pills` | None | SEO content |
| `seo_metro_map` / `seo_role_map` / `seo_page_cache` | None | SEO data |
| `content_ai_scores` | None | Content quality scores |
| `job_fraud_scores` | None | Job fraud detection |
| `notification_templates` | None | Template definitions |
| `cron_run_log` | None | Cron execution log |
| `ef_rate_limits` | Indirect | caller_id (UUID only) |
| `alert_rules` / `alert_history` | None | Admin alert system |
| `admin_notification_config` | None | Admin config |
| `availability_checks` | None | Uptime monitoring |
| `health_check_log` | None | Health checks |
| `vendor_cost_budgets` / `vendor_cost_log` | None | Cost tracking |
| `paid_spend_log` | None | Ad spend tracking |
| `social_post_log` | None | Social media tracking |
| `extension_builds` | None | Build metadata |
| `ab_experiments` / `ab_results` | None | Experiment definitions |
| `referral_config` / `referral_milestone_rewards` / `referral_requests` | None/Indirect | Config + request tracking |
| `company_ghost_stats` | None | Ghost job stats |

### 3.3 Supabase Auth (auth schema)

| Table | PII Fields | Retention |
|-------|-----------|-----------|
| `auth.users` | email, phone, encrypted_password, raw_user_meta_data | Until deletion |
| `auth.sessions` | ip, user_agent | Session lifetime |
| `auth.refresh_tokens` | token | Session lifetime |
| `auth.mfa_factors` | — | Until deletion |
| `auth.identities` | provider, identity_data (may include name, avatar) | Until deletion |

---

## 4. Third-Party PII Flows

| Service | Data Sent | Purpose | DPA Status |
|---------|-----------|---------|------------|
| **Anthropic** | Resume text (names, emails, phone, work history, education) | AI scoring, rewriting, cover letters, chat | See CP-002 |
| **PostHog** | User ID, page views, feature usage, device info | Analytics | See CP-002 |
| **Stripe** | Email, name (via Stripe customer creation) | Billing | See CP-002 |
| **Resend** | Email addresses, notification content | Email delivery | See CP-002 |
| **Vonage** | Phone numbers, SMS content | SMS notifications | See CP-002 |

---

## 5. Edge Functions Processing Resume PII → Anthropic

| Edge Function | PII Processed | Frequency |
|--------------|---------------|-----------|
| `score-resume` | Full resume text | Per resume upload |
| `rewrite-resume` | Full resume text | On demand |
| `rewrite-resume-analyze` | Full resume text | On demand |
| `rewrite-resume-execute` | Full resume text | On demand |
| `extract-resume-profile` | Full resume text | Per resume upload |
| `generate-cover-letter` | Resume + job details | On demand |
| `match-score-overlay` | Resume + job details | Per overlay view |
| `answer-form-question` | Resume + form context | Auto-apply |
| `chat-job-search` | User query + context | On demand |
| `auto-apply-trigger` | Resume + application data | Auto-apply |
| `analyze-hidden-job` | Job + user context | On demand |
| `prompt-to-filter` | User text | On demand |
| `filter-to-prompt` | Filter criteria | On demand |
| `generate-filter` | User preferences | On demand |
| `score-ai-content` | Job content | Automated |
| `generate-editorial-content` | — (no user PII) | Automated |
| `enrich-jd-ai` | Job descriptions (no user PII) | Automated |
| `enrich-job-ondemand` | Job descriptions (no user PII) | On demand |

---

## 6. Data Retention

| Data Type | Retention Period | Deletion Method |
|-----------|-----------------|-----------------|
| User account data | Until deletion + 30-day grace | Cascade delete |
| Audit logs | 1 year minimum | Automated purge |
| Resume files (Storage) | Until deletion | Storage bucket cleanup |
| Notification logs | 90 days | pg_cron purge |
| Session data | 7 days | Supabase auth cleanup |
| Extension telemetry | 90 days | pg_cron purge |

---

## 7. Right-to-Erasure Coverage

See `account-delete` Edge Function and `hard_delete_user_cascade()` database function for implementation.

Tables with `ON DELETE CASCADE` on `auth.users` are automatically cleaned when the auth user is deleted. Tables with `ON DELETE SET NULL` (notification_log, notification_actions, feedback) retain anonymized records for analytics.

Audit logs are NOT deleted (compliance retention requirement).
